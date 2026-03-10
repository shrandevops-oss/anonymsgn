const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 2 * 1024 * 1024, // 2MB max (was 5MB — images compressed client-side)
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["polling", "websocket"],
  allowEIO3: true
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/manifest+json");
  res.sendFile(path.join(__dirname, "public", "manifest.json"));
});
app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});
app.get("/ping", (req, res) => res.send("pong"));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// Track message counts per socket to prevent spam
const msgCount = {};   // { socketId: { count, resetAt } }
const joinCount = {};  // { ip: { count, resetAt } }

function rateLimit(id, store, max, windowMs) {
  const now = Date.now();
  if (!store[id] || now > store[id].resetAt) {
    store[id] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  store[id].count++;
  return store[id].count <= max;
}

// ─── SANITIZATION ─────────────────────────────────────────────────────────────
function sanitizeText(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .slice(0, 280)
    .trim();
}

function sanitizeName(s) {
  if (typeof s !== "string") return "Ghost";
  return s.replace(/[<>\"'&]/g, "").slice(0, 32).trim() || "Ghost";
}

function sanitizeRoom(s) {
  if (typeof s !== "string") return null;
  // Only allow letters, numbers, dashes, underscores
  return s.replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 40).toLowerCase() || null;
}

function isValidEmoji(e) {
  const allowed = ["👻","❤️","😂","😮","😢","🔥","👍","👎"];
  return allowed.includes(e);
}

function isValidImage(s) {
  if (typeof s !== "string") return false;
  // Must be a base64 data URI of an image
  return /^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s)
    && s.length < 2 * 1024 * 1024; // max 2MB
}

// ─── ROOM STORE ───────────────────────────────────────────────────────────────
const rooms = {};
const typingUsers = {};

function getRoom(name) {
  if (!rooms[name]) rooms[name] = { password: null, messages: [], createdAt: Date.now() };
  return rooms[name];
}
function getRoomSize(roomName) {
  return io.sockets.adapter.rooms.get(roomName)?.size || 0;
}

// Auto-delete messages older than 24h + clean empty rooms
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of Object.keys(rooms)) {
    rooms[name].messages = rooms[name].messages.filter(m => m.ts > cutoff);
    // Remove room if empty and old
    if (rooms[name].messages.length === 0 && getRoomSize(name) === 0
        && Date.now() - rooms[name].createdAt > 60 * 60 * 1000) {
      delete rooms[name];
    }
  }
  // Clean up stale rate limit entries
  const now = Date.now();
  for (const id of Object.keys(msgCount)) if (now > msgCount[id].resetAt) delete msgCount[id];
  for (const id of Object.keys(joinCount)) if (now > joinCount[id].resetAt) delete joinCount[id];
}, 10 * 60 * 1000);

// ─── SOCKET LOGIC ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;

  // Rate limit: max 20 connections per IP per minute
  if (!rateLimit(ip, joinCount, 20, 60_000)) {
    socket.emit("error_msg", "Too many connections. Try again later.");
    socket.disconnect(true);
    return;
  }

  socket.on("join_room", ({ room, password, username }) => {
    const cleanRoom = sanitizeRoom(room);
    if (!cleanRoom) { socket.emit("error_msg", "Invalid room name."); return; }

    const cleanName = sanitizeName(username);
    const r = getRoom(cleanRoom);

    // Password check
    if (r.password) {
      if (typeof password !== "string" || r.password !== password) {
        socket.emit("wrong_password");
        return;
      }
    } else if (password && typeof password === "string" && password.length <= 64) {
      r.password = password; // First person sets the password
    }

    // Max 50 users per room
    if (getRoomSize(cleanRoom) >= 50) {
      socket.emit("error_msg", "Room is full (max 50 users).");
      return;
    }

    socket.join(cleanRoom);
    socket.currentRoom = cleanRoom;
    socket.myName = cleanName;

    socket.emit("load_messages", r.messages);
    io.to(cleanRoom).emit("online_count", getRoomSize(cleanRoom));
    socket.to(cleanRoom).emit("system_message", { text: cleanName + " joined" });
  });

  socket.on("send_message", ({ room, text, image, anonId, anonName }) => {
    const cleanRoom = sanitizeRoom(room);
    if (!cleanRoom || !socket.currentRoom || socket.currentRoom !== cleanRoom) return;

    // Rate limit: max 20 messages per 10 seconds per socket
    if (!rateLimit(socket.id, msgCount, 20, 10_000)) {
      socket.emit("error_msg", "Slow down! Too many messages.");
      return;
    }

    if (!text && !image) return;

    // Validate image if present
    if (image && !isValidImage(image)) {
      socket.emit("error_msg", "Invalid image format.");
      return;
    }

    const r = getRoom(cleanRoom);
    const msg = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      text: text ? sanitizeText(text) : null,
      image: image || null,
      anonId: typeof anonId === "string" ? anonId.slice(0, 20) : "anon",
      anonName: sanitizeName(anonName),
      ts: Date.now(),
      reactions: {}
    };
    r.messages.push(msg);
    if (r.messages.length > 100) r.messages.shift();
    io.to(cleanRoom).emit("new_message", msg);
  });

  socket.on("delete_message", ({ room, msgId, anonId }) => {
    const cleanRoom = sanitizeRoom(room);
    if (!cleanRoom || socket.currentRoom !== cleanRoom) return;
    if (typeof msgId !== "string" || typeof anonId !== "string") return;

    const r = getRoom(cleanRoom);
    // Only owner (matching anonId) can delete their own message
    const idx = r.messages.findIndex(m => m.id === msgId && m.anonId === anonId);
    if (idx !== -1) {
      r.messages.splice(idx, 1);
      io.to(cleanRoom).emit("message_deleted", { msgId });
    }
  });

  socket.on("add_reaction", ({ room, msgId, emoji, anonId }) => {
    const cleanRoom = sanitizeRoom(room);
    if (!cleanRoom || socket.currentRoom !== cleanRoom) return;
    if (!isValidEmoji(emoji)) return; // Reject unknown emojis
    if (typeof msgId !== "string" || typeof anonId !== "string") return;

    const r = getRoom(cleanRoom);
    const msg = r.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(anonId);
    if (idx === -1) msg.reactions[emoji].push(anonId);
    else {
      msg.reactions[emoji].splice(idx, 1);
      if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    }
    io.to(cleanRoom).emit("update_reactions", { msgId, reactions: msg.reactions });
  });

  socket.on("typing_start", ({ room, anonName }) => {
    const cleanRoom = sanitizeRoom(room);
    if (!cleanRoom || socket.currentRoom !== cleanRoom) return;
    if (!typingUsers[cleanRoom]) typingUsers[cleanRoom] = {};
    typingUsers[cleanRoom][socket.id] = sanitizeName(anonName);
    socket.to(cleanRoom).emit("typing_update", Object.values(typingUsers[cleanRoom]));
  });

  socket.on("typing_stop", ({ room }) => {
    const cleanRoom = sanitizeRoom(room);
    if (cleanRoom && typingUsers[cleanRoom]) {
      delete typingUsers[cleanRoom][socket.id];
      socket.to(cleanRoom).emit("typing_update", Object.values(typingUsers[cleanRoom]));
    }
  });

  socket.on("disconnect", () => {
    const room = socket.currentRoom;
    if (room) {
      if (typingUsers[room]) {
        delete typingUsers[room][socket.id];
        socket.to(room).emit("typing_update", Object.values(typingUsers[room]));
      }
      socket.to(room).emit("system_message", { text: (socket.myName || "Someone") + " left" });
      socket.to(room).emit("online_count", getRoomSize(room));
    }
    delete msgCount[socket.id];
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => console.log("✓ ghost. server on port", PORT));

setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", r => console.log("keep-alive:", r.statusCode))
       .on("error", e => console.log("ping err:", e.message));
}, 13 * 60 * 1000);
