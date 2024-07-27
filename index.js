const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = 8080;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('uploads'));

// MongoDB bağlantısı
mongoose.connect('mongodb://localhost:27017/chat-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Multer ayarları (görsel dosyaların yüklenmesi için)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Model oluşturma
const MessageSchema = new mongoose.Schema({
  userId: String,
  message: String,
  image: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// Mesaj gönderme
app.post('/api/messages', upload.single('image'), async (req, res) => {
  const { userId, message } = req.body;
  const image = req.file ? req.file.filename : null;

  const newMessage = new Message({ userId, message, image });
  await newMessage.save();
  
  // Yeni mesajı tüm bağlı istemcilere gönder
  io.emit('message', newMessage);
  
  res.send(newMessage);
});

// Mesajları getirme
app.get('/api/messages', async (req, res) => {
  const messages = await Message.find().sort({ timestamp: -1 });
  res.send(messages);
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
