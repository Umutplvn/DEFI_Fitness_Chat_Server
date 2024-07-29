const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Setup express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Ensure uploads directory exists
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Setup multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 50 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mkv|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Files Only!');
    }
  }
}).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]);

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// MongoDB connection
mongoose.connect('mongodb+srv://umut:uRC30OOzc2ByVWdC@cluster0.9fozigf.mongodb.net/defi', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Define the Message schema
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

// Routes
app.post('/api/messages', (req, res) => {
  upload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: err.message });
    }
    try {
      const { senderId, receiverId, message } = req.body;
      const image = req.files['image'] ? req.files['image'][0].filename : null;
      const video = req.files['video'] ? req.files['video'][0].filename : null;

      const newMessage = new Message({ senderId, receiverId, message, image, video });
      await newMessage.save();

      io.to(receiverId).emit('message', newMessage);
      io.to(senderId).emit('message', newMessage);

      res.send(newMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
      res.status(500).send({ error: 'Failed to send message' });
    }
  });
});

app.put('/api/messages/read/:userId/:receiverId', async (req, res) => {
  try {
    const { userId, receiverId } = req.params;
    
    await Message.updateMany(
      { senderId: receiverId, receiverId: userId, read: false },
      { $set: { read: true } }
    );

    res.send({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    res.status(500).send({ error: 'Failed to mark messages as read' });
  }
});

app.get('/api/chats/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    }).sort({ timestamp: -1 });

    const chats = messages.reduce((acc, message) => {
      const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
      if (!acc[otherUserId]) {
        acc[otherUserId] = { messages: [], unreadCount: 0 };
      }
      acc[otherUserId].messages.push(message);
      if (!message.read && message.receiverId === userId) {
        acc[otherUserId].unreadCount += 1;
      }
      return acc;
    }, {});

    res.send(chats);
  } catch (error) {
    console.error('Failed to fetch chats:', error);
    res.status(500).send({ error: 'Failed to fetch chats' });
  }
});

app.get('/api/chats/:userId/:otherUserId', async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId }
      ]
    }).sort({ timestamp: 1 });

    res.send(messages);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    res.status(500).send({ error: 'Failed to fetch messages' });
  }
});

app.delete('/api/messages/:userId/:receiverId', async (req, res) => {
  try {
    const { userId, receiverId } = req.params;

    await Message.deleteMany({
      $or: [
        { senderId: userId, receiverId: receiverId },
        { senderId: receiverId, receiverId: userId }
      ]
    });

    res.send({ message: 'Messages deleted successfully' });
  } catch (error) {
    console.error('Failed to delete messages:', error);
    res.status(500).send({ error: 'Failed to delete messages' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    socket.join(userId);
    console.log(`User ${userId} connected`);
  }

  socket.on('disconnect', () => {
    if (userId) {
      socket.leave(userId);
      console.log(`User ${userId} disconnected`);
    }
  });

  socket.on('fileUpload', async (file) => {
    try {
      const buffer = Buffer.from(file.data);
      const filePath = path.join(uploadDir, file.name);
      fs.writeFileSync(filePath, buffer);

      socket.broadcast.to(file.receiverId).emit('fileUploaded', { filePath, fileName: file.name });
    } catch (error) {
      console.error('Error saving file:', error);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
