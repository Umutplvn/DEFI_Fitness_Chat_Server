"use strict";
/* -------------------------------------------------------
    EXPRESSJS - DEFI Project
------------------------------------------------------- */

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
  const { senderId, receiverId, message } = req.body;
  const image = req.files['image'] ? req.files['image'][0].filename : null;
  const video = req.files['video'] ? req.files['video'][0].filename : null;

  const newMessage = new Message({ senderId, receiverId, message, image, video, read });
  await newMessage.save();

  io.to(receiverId).emit('message', newMessage);
  io.to(senderId).emit('message', newMessage);

  res.send(newMessage);
});

// RECEIVE MESSAGE AND ONLINE/OFFLINE INFO
app.get('/api/chats/:userId', async (req, res) => {
  const { userId } = req.params;
  const messages = await Message.find({
    $or: [
      { receiverId: userId },
      { senderId: userId }
    ]
  }).sort();

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
