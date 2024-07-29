const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

// Setup express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Dosya yükleme için multer ayarları
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

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
  limits: { fileSize: 1024 * 1024 * 50 }, // 50MB
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
}).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'pdf', maxCount: 1 }, { name: 'word', maxCount: 1 }]);

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://umut:uRC30OOzc2ByVWdC@cluster0.9fozigf.mongodb.net/defi', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Mesajların saklanacağı schema
const MessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  message: { type: String, default: '' },
  image: { type: String, default: '' },
  video: { type: String, default: '' },
  file: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', MessageSchema);

// Mesaj gönderme API'si
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
      const file = req.files['file'] ? req.files['file'][0].filename : null;

      const newMessage = new Message({ senderId, receiverId, message, image, video, file });
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

// Socket.IO bağlantısı
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join', (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
