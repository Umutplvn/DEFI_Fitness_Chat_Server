const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // Frontend URL
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Upload dizinini oluştur
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use('/uploads', express.static(uploadDir));

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://umut:uRC30OOzc2ByVWdC@cluster0.9fozigf.mongodb.net/defi', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Multer ayarları (dosyaların yüklenmesi için)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Mesaj modelini tanımla
const MessageSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String,
  message: String,
  image: String,
  video: String, // Video dosyası
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// Çevrimiçi kullanıcıları yönetme
const onlineUsers = new Map(); // Map kullanarak userId ve socketId saklayacağız

// Mesaj gönderme
app.post('/api/messages', upload.single('video'), async (req, res) => {
  const { senderId, receiverId, message } = req.body;
  const video = req.file && req.file.fieldname === 'video' ? req.file.filename : null;

  const newMessage = new Message({ senderId, receiverId, message, video });
  await newMessage.save();

  io.to(receiverId).emit('message', newMessage);
  io.to(senderId).emit('message', newMessage);

  res.send(newMessage);
});

// Mesajları alma
app.get('/api/messages/:userId', async (req, res) => {
  const { userId } = req.params;
  const messages = await Message.find({
    $or: [
      { receiverId: userId },
      { senderId: userId }
    ]
  }).sort({ timestamp: -1 });
  res.send(messages);
});

// Mesajların okunma durumunu güncelleme
app.post('/api/messages/read/:senderId/:receiverId', async (req, res) => {
  const { senderId, receiverId } = req.params;
  
  await Message.updateMany(
    { senderId, receiverId, read: false },
    { $set: { read: true } }
  );

  res.sendStatus(200);
});

// Socket.io bağlantıları
io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);

  // Kullanıcı çevrimiçi oldu
  socket.on('joinRoom', (userId) => {
    socket.join(userId);
    onlineUsers.set(userId, socket.id);
    console.log(`User ${userId} joined`);

    // Çevrimiçi kullanıcıları güncelle
    io.emit('updateOnlineStatus', Array.from(onlineUsers.keys()));
  });

  // Kullanıcı çevrimdışı oldu
  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
    // Kullanıcıyı çevrimiçi listeden çıkar
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        io.emit('updateOnlineStatus', Array.from(onlineUsers.keys()));
        break;
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
