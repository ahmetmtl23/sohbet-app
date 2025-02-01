const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// Hata yakalama middleware'i
app.use((err, req, res, next) => {
    console.error('Hata:', err.stack);
    res.status(500).json({ error: 'Sunucu hatası', details: err.message });
});

// MongoDB bağlantısı
console.log('MongoDB bağlantısı başlatılıyor...');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin230904@sohbet.vw1uv.mongodb.net/?retryWrites=true&w=majority&appName=sohbet';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB bağlantısı başarılı'))
    .catch(err => {
        console.error('MongoDB bağlantı hatası:', err);
        process.exit(1); // Ciddi bir hata durumunda uygulamayı sonlandır
    });

// Kullanıcı modeli
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// API rotaları
app.post('/api/register', async (req, res) => {
    console.log('Kayıt isteği alındı:', req.body);
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Tüm alanlar zorunludur' });
        }

        // Kullanıcı adı veya email zaten var mı kontrol et
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            console.log('Var olan kullanıcı:', existingUser);
            return res.status(400).json({ error: 'Bu kullanıcı adı veya email zaten kullanılıyor' });
        }

        // Şifreyi hashle
        const hashedPassword = await bcrypt.hash(password, 10);

        // Yeni kullanıcı oluştur
        const user = new User({
            username,
            email,
            password: hashedPassword
        });

        await user.save();
        console.log('Yeni kullanıcı kaydedildi:', username);
        res.status(201).json({ message: 'Kullanıcı başarıyla oluşturuldu' });
    } catch (error) {
        console.error('Kayıt hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('Giriş isteği alındı:', req.body);
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email ve şifre zorunludur' });
        }

        // Kullanıcıyı bul
        const user = await User.findOne({ email });
        if (!user) {
            console.log('Kullanıcı bulunamadı:', email);
            return res.status(400).json({ error: 'Kullanıcı bulunamadı' });
        }

        // Şifreyi kontrol et
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Geçersiz şifre:', email);
            return res.status(400).json({ error: 'Geçersiz şifre' });
        }

        console.log('Başarılı giriş:', user.username);
        res.json({ 
            message: 'Giriş başarılı',
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Giriş hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Aktif kullanıcıları tutacak Map
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı:', socket.id);

    // Kullanıcı katılma
    socket.on('join', (data) => {
        console.log('Kullanıcı katıldı:', data);
        activeUsers.set(socket.id, {
            id: socket.id,
            username: data.username
        });
        
        // Kullanıcı listesini güncelle
        io.emit('users-update', Array.from(activeUsers.values()));
        
        // Katılma mesajı
        io.emit('message', {
            type: 'system',
            content: `${data.username} sohbete katıldı!`,
            timestamp: new Date()
        });
    });

    // Mesaj gönderme
    socket.on('message', (data) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            io.emit('message', {
                type: 'chat',
                username: user.username,
                content: data.message,
                timestamp: new Date()
            });
        }
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            io.emit('message', {
                type: 'system',
                content: `${user.username} ayrıldı.`,
                timestamp: new Date()
            });
            
            activeUsers.delete(socket.id);
            io.emit('users-update', Array.from(activeUsers.values()));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
