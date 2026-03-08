const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");

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
app.use(express.static("public"));

const rooms = {};
const typingUsers = {};

// Helper: Ensure room exists
function getRoom(name) {
  if (!rooms[name]) {
    rooms[name] = { 
      password: null, 
      messages: [], 
      createdAt: Date.now() 
    };
  }
  return rooms[name];
}

// Helper: Get count of users in a room
function getRoomSize(roomName) {
  const room = io.sockets.adapter.rooms.get(roomName);
  return room ? room.size : 0;
}

// Clean old messages every 10 minutes (Keep last 24h)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name in rooms) {
    rooms[name].messages = rooms[name].messages.filter(m => m.ts > cutoff);
    // Delete empty rooms after 24h of inactivity
    if (rooms[name].messages.length === 0 && getRoomSize(name) === 0) {
      delete rooms[name];
    }
  }
}, 10 * 60 * 1000);

app.get("/ping", (req, res) => res.send("pong"));
app.get("/health", (req, res) => res.json({ status: "ok", rooms: Object.keys(rooms).length }));



io.on("connection", (socket) => {
  console.log("+ connected:", socket.id);

  // Match frontend 'join' event
  socket.on("join", ({ room, pass, name, anonId }) => {
    if (!room) return;
    const r = getRoom(room);

    // Password Logic
    if (r.password && r.password !== pass) {
      socket.emit("error_msg", "Wrong password");
      return;
    }
    if (!r.password && pass) r.password = pass;

    socket.join(room);
    socket.currentRoom = room;
    socket.myName = name || "Ghost";
    socket.anonId = anonId;

    // Send history
    socket.emit("load_messages", r.messages);

    // Notify room and update count
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
      ts: Date.now(),
      reactions: {}
    };

    r.messages.push(msg);
    if (r.messages.length > 100) r.messages.shift();
    
    // Broadcast to everyone in room including sender
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ ghost. server running on port ${PORT}`);
});

// Keep-alive ping to prevent Render from sleeping
setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", (res) => {
    console.log("keep-alive status:", res.statusCode);
  }).on("error", (e) => console.log("keep-alive err:", e.message));
}, 13 * 60 * 1000);
