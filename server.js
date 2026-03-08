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
app.get("/ping", (req, res) => res.send("pong"));
app.get("/health", (req, res) => res.json({ status: "ok", rooms: Object.keys(rooms).length }));

const rooms = {};
const typingUsers = {};

function getRoom(name) {
  if (!rooms[name]) rooms[name] = { password: null, messages: [], createdAt: Date.now() };
  return rooms[name];
}

// Clean old messages every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of Object.keys(rooms)) {
    rooms[name].messages = rooms[name].messages.filter(m => m.ts > cutoff);
  }
}, 10 * 60 * 1000);

function getRoomSize(room) {
  return io.sockets.adapter.rooms.get(room)?.size || 0;
}

io.on("connection", (socket) => {
  console.log("+ connected:", socket.id);

  socket.on("join_room", ({ room, password, username }) => {
    if (!room) return;
    const r = getRoom(room);

    // Check password
    if (r.password && r.password !== password) {
      socket.emit("wrong_password");
      return;
    }
    // Set password if first user sets one
    if (!r.password && password) r.password = password;

    socket.join(room);
    socket.currentRoom = room;
    socket.myName = username || "Ghost";

    // Send message history
    socket.emit("load_messages", r.messages);

    // Notify room
    socket.to(room).emit("system_message", { text: socket.myName + " joined" });

    // Online count to everyone in room
    io.to(room).emit("online_count", getRoomSize(room));
  });

  socket.on("send_message", (data) => {
    const { room, text, image, anonId, anonName } = data;
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
    console.log("- disconnected:", socket.id);
    const room = socket.currentRoom;
    if (room) {
      if (typingUsers[room]) {
        delete typingUsers[room][socket.id];
        socket.to(room).emit("typing_update", Object.values(typingUsers[room]));
      }
      socket.to(room).emit("system_message", { text: (socket.myName || "Someone") + " left" });
      socket.to(room).emit("online_count", getRoomSize(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("✓ ghost. server running on port", PORT));

// Keep-alive ping every 13 minutes
setInterval(() => {
  https.get("https://anonymsgn.onrender.com/ping", (res) => {
    console.log("keep-alive ping:", res.statusCode);
  }).on("error", (e) => console.log("keep-alive err:", e.message));
}, 13 * 60 * 1000);
