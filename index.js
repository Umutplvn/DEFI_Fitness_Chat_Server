const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// Setup express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT']
  }
});

// Setup multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, './uploads/')); // Yükleme dizini
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Dosya adı
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('uploads', express.static('uploads')); // To serve static files

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
    console.log('Files:', req.files); // Dosyaların doğru şekilde alındığını kontrol edin
    console.log('Body:', req.body); // Body içeriğini kontrol edin

    const { senderId, receiverId, message } = req.body;
    if (!receiverId) {
      return res.status(400).send({ error: 'receiverId is required' });
    }

    // Dosyaların adlarını almak için kontrol edin
    const image = req.files['image'] ? req.files['image'][0].filename : null;
    const video = req.files['video'] ? req.files['video'][0].filename : null;

    // Yeni mesaj oluşturma
    const newMessage = new Message({ senderId, receiverId, message, image, video });
    await newMessage.save();

    // Socket.IO ile mesajları gönderme
    io.to(receiverId).emit('message', newMessage);
    io.to(senderId).emit('message', newMessage);

    res.send(newMessage);
  } catch (error) {
    console.error('Failed to send message', error);
    res.status(500).send({ error: 'Failed to send message' });
  }
});



// RECEIVE CHATS
app.get('/api/chats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await Message.find({
      $or: [
        { receiverId: userId },
        { senderId: userId }
      ]
    }).sort({ timestamp: -1 });

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
  } catch (error) {
    res.status(500).send({ error: 'Failed to retrieve chats' });
  }
});


// MARK MESSAGES AS READ
app.put('/api/messages/read/:userId/:receiverId', async (req, res) => {
  try {
    const { userId, receiverId } = req.params;

    await Message.updateMany(
      { receiverId: userId, senderId: receiverId, read: false },
      { $set: { read: true } }
    );

    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ error: 'Failed to mark messages as read' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  socket.join(userId);

  socket.on('disconnect', () => {
    socket.leave(userId);
  });
});

// Start server
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
