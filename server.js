const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS and buffer limits
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024, // 5MB limit for images
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// --- STATIC FILE ROUTING ---
// Serves everything inside the /public folder (index.html, sw.js, manifest.json, icons)
app.use(express.static(path.join(__dirname, "public")));

// Explicitly define PWA files to ensure correct Content-Type headers
app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "manifest.json"));
});

app.get("/sw.js", (req, res) => {
  res.set("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

// Health check and Keep-alive endpoint
app.get("/ping", (req, res) => res.send("pong"));

// --- CHAT LOGIC ---
const rooms = {};

function getRoom(name) {
  if (!rooms[name]) {
    rooms[name] = { password: null, messages: [], createdAt: Date.now() };
  }
  return rooms[name];
}

function getRoomSize(roomName) {
  const room = io.sockets.adapter.rooms.get(roomName);
  return room ? room.size : 0;
}

io.on("connection", (socket) => {
  console.log("+ connected:", socket.id);

  socket.on("join", ({ room, pass, name, anonId }) => {
    if (!room) return;
    const r = getRoom(room);

    // Password check
    if (r.password && r.password !== pass) {
      return socket.emit("error_msg", "Wrong password");
    }
    if (!r.password && pass) r.password = pass;

    socket.join(room);
    socket.currentRoom = room;
    socket.myName = name || "Ghost";

    // Load history for the joining user
    socket.emit("load_messages", r.messages);
    
    // Update online count for the whole room
    io.to(room).emit("online_count", getRoomSize(room));
    socket.to(room).emit("system_message", { text: `${socket.myName} joined` });
  });

  socket.on("send_message", (data) => {
    const { room, text, image, anonId, anonName } = data;
    if (!room || (!text && !image)) return;
    
    const r = getRoom(room);
    const msg = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      text: text ? String(text).slice(0, 280) : null,
      image: image || null,
      anonId, 
      anonName,
      ts: Date.now()
    };

    r.messages.push(msg);
    if (r.messages.length > 100) r.messages.shift();
    
    io.to(room).emit("message", msg);
  });

  socket.on("delete_message", ({ room, msgId, anonId }) => {
    const r = getRoom(room);
    const idx = r.messages.findIndex(m => m.id === msgId && m.anonId === anonId);
    if (idx !== -1) {
      r.messages.splice(idx, 1);
      io.to(room).emit("message_deleted", { msgId });
    }
  });

  socket.on("disconnect", () => {
    const room = socket.currentRoom;
    if (room) {
      io.to(room).emit("online_count", getRoomSize(room));
      socket.to(room).emit("system_message", { text: `${socket.myName || "Someone"} left` });
    }
    console.log("- disconnected:", socket.id);
  });
});

// --- SERVER START ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ ghost. server running on port ${PORT}`);
});

// Keep-alive to prevent Render sleep (Optional but recommended)
setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", (res) => {
    console.log("keep-alive:", res.statusCode);
  }).on("error", (err) => console.log("ping err:", err.message));
}, 13 * 60 * 1000);
