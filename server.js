const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024 // 5MB for image sharing
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static("public"));

app.get("/ping", (req, res) => res.send("pong"));

const rooms = {};

function getRoom(name) {
  if (!rooms[name]) rooms[name] = { password: null, messages: [], createdAt: Date.now() };
  return rooms[name];
}

// Auto-delete messages older than 24 hours
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  Object.keys(rooms).forEach(name => {
    rooms[name].messages = rooms[name].messages.filter(m => m.ts > cutoff);
  });
}, 10 * 60 * 1000);

// Track typing users per room
const typingUsers = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join_room", ({ room, password, username }) => {
    const r = getRoom(room);
    if (r.password && r.password !== password) {
      socket.emit("wrong_password");
      return;
    }
    if (!r.password && password) r.password = password;

    socket.join(room);
    socket.currentRoom = room;
    socket.username = username || null;
    socket.emit("load_messages", r.messages);
    io.to(room).emit("system_message", { text: `${username || "someone"} joined` });
  });

  // Send message (text or image)
  socket.on("send_message", (data) => {
    const { room, text, image, anonId, anonName } = data;
    if ((!text && !image) || !room) return;
    const r = getRoom(room);
    const msg = {
      id: Date.now().toString(),
      text: text ? text.slice(0, 280) : null,
      image: image || null, // base64 image
      anonId, anonName,
      ts: Date.now(),
      reactions: {}
    };
    r.messages.push(msg);
    if (r.messages.length > 100) r.messages.shift();
    io.to(room).emit("new_message", msg);
  });

  // 👀 Typing indicator
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

  // Emoji reaction
  socket.on("add_reaction", ({ room, msgId, emoji, anonId }) => {
    const r = getRoom(room);
    const msg = r.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(anonId);
    if (idx === -1) msg.reactions[emoji].push(anonId);
    else {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    }
    io.to(room).emit("update_reactions", { msgId, reactions: msg.reactions });
  });

  socket.on("disconnect", () => {
    if (socket.currentRoom) {
      if (typingUsers[socket.currentRoom]) {
        delete typingUsers[socket.currentRoom][socket.id];
        socket.to(socket.currentRoom).emit("typing_update", Object.values(typingUsers[socket.currentRoom]));
      }
      io.to(socket.currentRoom).emit("system_message", { text: `${socket.username || "someone"} left` });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✓ Server on port ${PORT}`));

// Keep-alive
setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", () => {
    console.log("Keep-alive ✓");
  }).on("error", () => {});
}, 14 * 60 * 1000);

