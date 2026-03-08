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
  maxHttpBufferSize: 5 * 1024 * 1024,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));
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

const rooms = {};
const typingUsers = {};

function getRoom(name) {
  if (!rooms[name]) rooms[name] = { password: null, messages: [], createdAt: Date.now() };
  return rooms[name];
}
function getRoomSize(roomName) {
  return io.sockets.adapter.rooms.get(roomName)?.size || 0;
}

// Auto-delete messages older than 24h
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of Object.keys(rooms)) {
    rooms[name].messages = rooms[name].messages.filter(m => m.ts > cutoff);
  }
}, 10 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("+ connected:", socket.id);

  socket.on("join_room", ({ room, password, username }) => {
    if (!room) return;
    const r = getRoom(room);

    if (r.password && r.password !== password) {
      socket.emit("wrong_password");
      return;
    }
    if (!r.password && password) r.password = password;

    socket.join(room);
    socket.currentRoom = room;
    socket.myName = username || "Ghost";

    socket.emit("load_messages", r.messages);
    io.to(room).emit("online_count", getRoomSize(room));
    socket.to(room).emit("system_message", { text: socket.myName + " joined" });
  });

  socket.on("send_message", ({ room, text, image, anonId, anonName }) => {
    if (!room || (!text && !image)) return;
    const r = getRoom(room);
    const msg = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      text: text ? String(text).slice(0, 280) : null,
      image: image || null,
      anonId, anonName,
      ts: Date.now(),
      reactions: {}
    };
    r.messages.push(msg);
    if (r.messages.length > 100) r.messages.shift();
    io.to(room).emit("new_message", msg);
  });

  socket.on("delete_message", ({ room, msgId, anonId }) => {
    const r = getRoom(room);
    const idx = r.messages.findIndex(m => m.id === msgId && m.anonId === anonId);
    if (idx !== -1) {
      r.messages.splice(idx, 1);
      io.to(room).emit("message_deleted", { msgId });
    }
  });

  socket.on("add_reaction", ({ room, msgId, emoji, anonId }) => {
    const r = getRoom(room);
    const msg = r.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(anonId);
    if (idx === -1) msg.reactions[emoji].push(anonId);
    else {
      msg.reactions[emoji].splice(idx, 1);
      if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    }
    io.to(room).emit("update_reactions", { msgId, reactions: msg.reactions });
  });

  socket.on("typing_start", ({ room, anonName }) => {
    if (!typingUsers[room]) typingUsers[room] = {};
    typingUsers[room][socket.id] = anonName;
    socket.to(room).emit("typing_update", Object.values(typingUsers[room]));
  });

  socket.on("typing_stop", ({ room }) => {
    if (typingUsers[room]) {
      delete typingUsers[room][socket.id];
      socket.to(room).emit("typing_update", Object.values(typingUsers[room]));
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
    console.log("- disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => console.log("✓ ghost. server on port", PORT));

setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", r => console.log("keep-alive:", r.statusCode))
       .on("error", e => console.log("ping err:", e.message));
}, 13 * 60 * 1000);
