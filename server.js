const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Test endpoint
app.get('/', (req, res) => {
    res.send('Chat sunucusu çalışıyor!');
});

// Aktif kullanıcıları tutacak Map
const users = new Map();

io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı:', socket.id);

    // Kullanıcı katılma
    socket.on('join', (data) => {
        console.log('Kullanıcı katıldı:', data);
        users.set(socket.id, {
            id: socket.id,
            username: data.username
        });
        
        // Kullanıcı listesini güncelle
        io.emit('users-update', Array.from(users.values()));
        
        // Katılma mesajı
        io.emit('message', {
            type: 'system',
            content: `${data.username} sohbete katıldı!`,
            timestamp: new Date()
        });
    });

    // Mesaj gönderme
    socket.on('message', (data) => {
        const user = users.get(socket.id);
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
        const user = users.get(socket.id);
        if (user) {
            io.emit('message', {
                type: 'system',
                content: `${user.username} ayrıldı.`,
                timestamp: new Date()
            });
            
            users.delete(socket.id);
            io.emit('users-update', Array.from(users.values()));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
