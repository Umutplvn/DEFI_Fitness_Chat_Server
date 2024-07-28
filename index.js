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
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT']
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
    cb(null, './uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 10 // 10 MB file size limit
  },
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|mp4|avi|mkv/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Images and Videos Only!');
    }
  }
});

app.use(cors({
  origin: 'http://localhost:3001',
  methods: ['GET', 'POST', 'PUT']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

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

// SEND A MESSAGE
app.post('/api/messages', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;

    const image = req.files['image'] ? req.files['image'][0].filename : null;
    const video = req.files['video'] ? req.files['video'][0].filename : null;

    console.log('Files received:', { image, video });

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

// Simple file upload test
app.post('/api/upload', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), (req, res) => {
  try {
    const image = req.files['image'] ? req.files['image'][0].filename : null;
    const video = req.files['video'] ? req.files['video'][0].filename : null;

    console.log('Files received:', { image, video });
    res.send({ image, video });
  } catch (error) {
    console.error('Failed to upload files:', error);
    res.status(500).send({ error: 'Failed to upload files' });
  }
});

// GET MESSAGES FOR A SPECIFIC USER
app.get('/api/messages/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Fetch messages where the user is either the sender or the receiver
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    }).sort({ timestamp: -1 }); // Sort messages by timestamp in descending order

    res.send(messages);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    res.status(500).send({ error: 'Failed to fetch messages' });
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
});

// Start server
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
