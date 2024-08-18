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
    origin: 'https://defifitness.netlify.app/',
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
    cb(null, './uploads');
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
    const fileTypes = /jpeg|jpg|png|gif|mp4|avi|mkv|pdf|doc|docx/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Images, Videos and Documents Only!');
    }
  }
}).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

//! CORS
app.use(cors({
  origin: 'https://defifitness.netlify.app/',
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
  file: String,
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', MessageSchema);

//! DOCUMENT
app.post('/uploaddoc', (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      return res.status(400).send(err);
    }

    const { senderId, receiverId } = req.body;
    const file = req.files['file'] ? req.files['file'][0].filename : null;
    
    const newMessage = new Message({ senderId, receiverId, file });
    await newMessage.save();

    io.to(receiverId).emit('message', newMessage);
    io.to(senderId).emit('message', newMessage);

    res.send(newMessage);
  });
  
});

app.get('/files', (req, res) => {
  Message.find()
    .then(files => res.json(files))
    .catch(err => res.status(500).send(err.message));
});

app.get('/downloadfile/:id', (req, res) => {
  Message.findById(req.params.id)
    .then(file => {
      if (file) {
        res.download(file.path);
      } else {
        res.status(404).send('File not found');
      }
    })
    .catch(err => res.status(500).send(err.message));
});



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


//! Mark messages as read between a user and a receiver
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

//! DELETE A MESSAGE
app.delete('/api/messages/delete/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).send({ error: 'Invalid message ID' });
    }

    const result = await Message.deleteOne({ _id: messageId });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: 'Message not found' });
    }

    res.send({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Failed to delete message:', error);
    res.status(500).send({ error: 'Failed to delete message' });
  }
});

//! GET CHATS FOR A SPECIFIC USER
app.get('/api/chats/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    }).sort({ timestamp: -1 });

    const chats = messages.reduce((acc, message) => {
      const otherUserId = message.senderId == userId ? message.receiverId : message.senderId;
      if (!acc[otherUserId]) {
        acc[otherUserId] = { messages: [], unreadCount: 0 };
      }
      acc[otherUserId].messages.push(message);
      if (!message.read && message.receiverId == userId) {
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

//! GET MESSAGES FOR A SPECIFIC USER
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
    console.error('Failed to fetch chats:', error);
    res.status(500).send({ error: 'Failed to fetch chats' });
  }
});

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

    console.log('Files received:', { image, video });
    res.send({ image, video });
  });
});

// //! GET MESSAGES FOR A SPECIFIC USER
app.get('/api/messages/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    }).sort({ timestamp: 1 });

    res.send(messages);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    res.status(500).send({ error: 'Failed to fetch messages' });
  }
});

//! DELETE MESSAGES BETWEEN TWO USERS
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

//! Cron job to delete messages older than 2 minutes
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
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
