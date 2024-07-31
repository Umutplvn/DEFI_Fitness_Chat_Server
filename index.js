const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron'); 
require('dotenv').config();
const MONGODB = process.env.MONGODB

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

//! Uploads directory
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

//! Setup multer for file upload
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
    fileSize: 1024 * 1024 * 50
  },
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|mp4|avi|mkv|pdf|doc|docx|xls|xlsx/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Images, Videos, and Documents Only!');
    }
  }
}).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'document', maxCount: 1 }]);

//! CORS
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

mongoose.connect(`${MONGODB}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

//! Message schema
const MessageSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String,
  message: String,
  image: String,
  video: String,
  document: String,  // New field for documents
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', MessageSchema);

//! SEND A MESSAGE
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
      const document = req.files['document'] ? req.files['document'][0].filename : null;
      
      const newMessage = new Message({ senderId, receiverId, message, image, video, document });
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

//! Other routes remain the same

//! Simple file upload test
app.post('/api/upload', (req, res) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: err.message });
    }
    const image = req.files['image'] ? req.files['image'][0].filename : null;
    const video = req.files['video'] ? req.files['video'][0].filename : null;
    const document = req.files['document'] ? req.files['document'][0].filename : null;

    console.log('Files received:', { image, video, document });
    res.send({ image, video, document });
  });
});

//! Cron job to delete messages older than 7 days
cron.schedule('0 0 * * *', async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    await Message.deleteMany({
      timestamp: { $lt: sevenDaysAgo }
    });

    console.log('Messages older than 7 days deleted successfully.');
  } catch (error) {
    console.error('Failed to delete old messages:', error);
  }
});

//! Socket.io connection
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

//! Start server
server.listen(8080, () => {
  console.log('Server is running on port 8080');
});
