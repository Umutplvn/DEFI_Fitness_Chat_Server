// index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://umut:uRC30OOzc2ByVWdC@cluster0.9fozigf.mongodb.net/defi', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const MessageSchema = new mongoose.Schema({
  userId: String,
  text: String,
  fileUrl: String,
  createdAt: { type: Date, default: Date.now },
});

const Message = mongoose.model('Message', MessageSchema);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// CORS ayarları
app.use(cors());

// Multer konfigürasyonu
const upload = multer({ dest: 'uploads/' });

// Statik dosya sunma
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mesajları alma API'si
app.get('/messages/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const messages = await Message.find({ userId }).sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Dosya yükleme API'si
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (file) {
    res.json({ url: `/uploads/${file.filename}` });
  } else {
    res.status(400).send('No file uploaded.');
  }
});

// Socket.io ile iletişim kurma
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('send_message', async (message) => {
    const { userId, text, fileUrl } = message;
    const newMessage = new Message({ userId, text, fileUrl });
    await newMessage.save();
    io.emit('new_message', { userId, text, fileUrl });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(4000, () => {
  console.log('Server listening on port 4000');
});
