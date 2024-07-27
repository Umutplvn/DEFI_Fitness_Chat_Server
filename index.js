"use strict";

/* -------------------------------------------------------
    EXPRESSJS - DEFI Project
------------------------------------------------------- */

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const upload = multer({ dest: 'uploads/' });

mongoose.connect('mongodb://localhost:27017/defi-chat', { useNewUrlParser: true, useUnifiedTopology: true });

const MessageSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String,
  message: String,
  image: String,
  video: String,
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', MessageSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SEND A MESSAGE
app.post('/api/messages', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const { senderId, receiverId, message } = req.body;
  const image = req.files['image'] ? req.files['image'][0].filename : null;
  const video = req.files['video'] ? req.files['video'][0].filename : null;

  const newMessage = new Message({ senderId, receiverId, message, image, video });
  await newMessage.save();

  io.to(receiverId).emit('message', newMessage);
  io.to(senderId).emit('message', newMessage);

  res.send(newMessage);
});

// RECEIVE MESSAGES AND ONLINE/OFFLINE INFO
app.get('/api/chats/:userId', async (req, res) => {
  const { userId } = req.params;
  const messages = await Message.find({
    $or: [
      { receiverId: userId },
      { senderId: userId }
    ]
  }).sort({ timestamp: -1 });

  // LAST MESSAGES
  const chats = messages.reduce((acc, message) => {
    const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
    if (!acc[otherUserId]) {
      acc[otherUserId] = { ...message._doc, read: message.read };
    } else {
      acc[otherUserId] = message.timestamp > acc[otherUserId].timestamp ? message : acc[otherUserId];
    }
    return acc;
  }, {});

  res.send(Object.values(chats));
});

// MARK MESSAGES AS READ
app.put('/api/messages/read/:userId/:receiverId', async (req, res) => {
  const { userId, receiverId } = req.params;

  try {
    await Message.updateMany(
      { receiverId: userId, senderId: receiverId, read: false },
      { $set: { read: true } }
    );

    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ error: 'Failed to mark messages as read' });
  }
});

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  socket.join(userId);

  socket.on('disconnect', () => {
    socket.leave(userId);
  });
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
