// Backend kodu

// Message model
const MessageSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String,
  message: String,
  image: String,
  video: String,
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false } // Mesajın okunup okunmadığı bilgisini ekleyin
});

const Message = mongoose.model('Message', MessageSchema);

// Mesaj gönderme
app.post('/api/messages', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const { senderId, receiverId, message } = req.body;
  const image = req.files['image'] ? req.files['image'][0].filename : null;
  const video = req.files['video'] ? req.files['video'][0].filename : null;

  const newMessage = new Message({ senderId, receiverId, message, image, video });
  await newMessage.save();

  io.to(receiverId).emit('message', newMessage);
  io.to(senderId).emit('message', newMessage);

  res.send(newMessage);
});

// Kullanıcının son mesajlarını ve okundu bilgilerini almak için API
app.get('/api/chats/:userId', async (req, res) => {
  const { userId } = req.params;
  const messages = await Message.find({
    $or: [
      { receiverId: userId },
      { senderId: userId }
    ]
  }).sort({ timestamp: -1 });

  // Her kullanıcı için son mesajı ve okunma bilgisini bulma
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
