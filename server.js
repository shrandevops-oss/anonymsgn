const express = require("express");
const http = require("http");
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

// Store messages in memory (resets on server restart)
// For permanent storage, replace with a database like MongoDB
const rooms = {};

// REST API — get last 50 messages for a room
app.get("/messages/:room", (req, res) => {
  const room = req.params.room;
  res.json(rooms[room] || []);
});

// Socket.io — real-time messaging
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join a room
  socket.on("join_room", (room) => {
    socket.join(room);
    socket.currentRoom = room;
    console.log(`User ${socket.id} joined room: ${room}`);

    // Send existing messages to this user
    socket.emit("load_messages", rooms[room] || []);

    // Notify others
    io.to(room).emit("system_message", { text: "someone joined the void" });
  });

  // Receive and broadcast message
  socket.on("send_message", (data) => {
    const { room, text, anonId, anonName } = data;
    if (!text || !room) return;

    const msg = {
      id: Date.now().toString(),
      text: text.slice(0, 280),
      anonId,
      anonName,
      ts: Date.now()
    };

    // Store message
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(msg);

    // Keep only last 100 messages per room
    if (rooms[room].length > 100) rooms[room].shift();

    // Broadcast to everyone in room
    io.to(room).emit("new_message", msg);
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (socket.currentRoom) {
      io.to(socket.currentRoom).emit("system_message", { text: "someone left the void" });
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});