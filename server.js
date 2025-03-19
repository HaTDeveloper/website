const express = require('express');
const http = require('http') ;
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app) ;
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// استخدام CORS
app.use(cors());

// تقديم الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// تخزين معلومات الغرف
const rooms = {};

// معالجة اتصالات Socket.io
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // الانضمام إلى غرفة
    socket.on('join-room', ({ roomId }) => {
        console.log(`User ${socket.id} joining room ${roomId}`);
        
        // إنشاء الغرفة إذا لم تكن موجودة
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: []
            };
        }
        
        // التحقق من عدد المستخدمين في الغرفة (الحد الأقصى 10)
        if (rooms[roomId].users.length >= 10) {
            socket.emit('room-full');
            return;
        }
        
        // الانضمام إلى الغرفة
        socket.join(roomId);
        rooms[roomId].users.push(socket.id);
        
        // إعلام المستخدمين الآخرين في الغرفة
        socket.to(roomId).emit('user-joined', { userId: socket.id });
        
        // تخزين معرف الغرفة في كائن الاتصال
        socket.roomId = roomId;
        
        console.log(`Room ${roomId} now has ${rooms[roomId].users.length} users`);
    });
    
    // مغادرة الغرفة
    socket.on('leave-room', ({ roomId }) => {
        handleUserLeaving(socket, roomId);
    });
    
    // إرسال عرض
    socket.on('offer', ({ to, offer }) => {
        console.log(`Forwarding offer from ${socket.id} to ${to}`);
        io.to(to).emit('offer', { from: socket.id, offer });
    });
    
    // إرسال إجابة
    socket.on('answer', ({ to, answer }) => {
        console.log(`Forwarding answer from ${socket.id} to ${to}`);
        io.to(to).emit('answer', { from: socket.id, answer });
    });
    
    // إرسال ICE candidate
    socket.on('ice-candidate', ({ to, candidate }) => {
        console.log(`Forwarding ICE candidate from ${socket.id} to ${to}`);
        io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });
    
    // إرسال حالة الكتم
    socket.on('mute-status', ({ roomId, isMuted }) => {
        console.log(`User ${socket.id} mute status: ${isMuted}`);
        socket.to(roomId).emit('mute-status', { userId: socket.id, isMuted });
    });
    
    // معالجة قطع الاتصال
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // إذا كان المستخدم في غرفة، قم بإزالته
        if (socket.roomId) {
            handleUserLeaving(socket, socket.roomId);
        }
    });
});

// وظيفة مساعدة لمعالجة مغادرة المستخدم
function handleUserLeaving(socket, roomId) {
    console.log(`User ${socket.id} leaving room ${roomId}`);
    
    if (rooms[roomId]) {
        // إزالة المستخدم من قائمة المستخدمين في الغرفة
        rooms[roomId].users = rooms[roomId].users.filter(id => id !== socket.id);
        
        // إعلام المستخدمين الآخرين في الغرفة
        socket.to(roomId).emit('user-left', { userId: socket.id });
        
        // إذا كانت الغرفة فارغة، قم بإزالتها
        if (rooms[roomId].users.length === 0) {
            console.log(`Room ${roomId} is now empty, removing`);
            delete rooms[roomId];
        } else {
            console.log(`Room ${roomId} now has ${rooms[roomId].users.length} users`);
        }
    }
    
    // مغادرة الغرفة
    socket.leave(roomId);
    socket.roomId = null;
}

// تعيين المنفذ
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
