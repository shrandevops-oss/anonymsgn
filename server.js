const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/ping", (req, res) => res.send("pong"));

// rooms[name] = { password, messages: [], createdAt }
const rooms = {};

function getRoom(name) {
  if (!rooms[name]) rooms[name] = { password: null, messages: [], createdAt: Date.now() };
  return rooms[name];
}

// Auto-delete messages older than 24 hours every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  Object.keys(rooms).forEach(name => {
    rooms[name].messages = rooms[name].messages.filter(m => m.ts > cutoff);
  });
  console.log("Auto-cleanup done");
}, 10 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // Join room with optional password
  socket.on("join_room", ({ room, password }) => {
    const r = getRoom(room);

    // If room has password, verify it
    if (r.password && r.password !== password) {
      socket.emit("wrong_password");
      return;
    }

    // If no password set yet and one provided, set it
    if (!r.password && password) {
      r.password = password;
    }

    socket.join(room);
    socket.currentRoom = room;

    // Send existing messages
    socket.emit("load_messages", r.messages);

    // Notify others
    io.to(room).emit("system_message", { text: "someone joined" });
    console.log(`${socket.id} joined room: ${room}`);
  });

  // New message
  socket.on("send_message", (data) => {
    const { room, text, anonId, anonName } = data;
    if (!text || !room) return;
    const r = getRoom(room);
    const msg = {
      id: Date.now().toString(),
      text: text.slice(0, 280),
      anonId, anonName,
      ts: Date.now(),
      reactions: {}
    };
    r.messages.push(msg);
    if (r.messages.length > 100) r.messages.shift();
    io.to(room).emit("new_message", msg);
  });

  // Emoji reaction
  socket.on("add_reaction", ({ room, msgId, emoji, anonId }) => {
    const r = getRoom(room);
    const msg = r.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    // Toggle reaction
    const idx = msg.reactions[emoji].indexOf(anonId);
    if (idx === -1) {
      msg.reactions[emoji].push(anonId);
    } else {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    }
    io.to(room).emit("update_reactions", { msgId, reactions: msg.reactions });
  });

  socket.on("disconnect", () => {
    if (socket.currentRoom) {
      io.to(socket.currentRoom).emit("system_message", { text: "someone left" });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✓ Server on port ${PORT}`));

// Keep-alive ping every 14 minutes
setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", () => {
    console.log("Keep-alive ✓");
  }).on("error", () => {});
}, 14 * 60 * 1000);
