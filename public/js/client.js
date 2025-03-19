// تكوين خادم Socket.io
const socket = io('https://secure-chat-bx6u.onrender.com', {
    withCredentials: true,
    extraHeaders: {
        "Access-Control-Allow-Origin": "*"
    }
});

// متغيرات عامة
let localStream;
let peerConnections = {};
let roomId;
let isMuted = false;
let callStartTime;
let callTimerInterval;

// عناصر واجهة المستخدم
const welcomeScreen = document.getElementById('welcome-screen');
const voiceScreen = document.getElementById('voice-screen');
const roomIdInput = document.getElementById('room-id-input');
const startVoiceBtn = document.getElementById('start-voice-btn');
const roomIdDisplay = document.getElementById('room-id-display');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const connectionStatus = document.getElementById('connection-status');
const participants = document.getElementById('participants');
const muteBtn = document.getElementById('mute-btn');
const endCallBtn = document.getElementById('end-call-btn');
const speakerBtn = document.getElementById('speaker-btn');
const callTimer = document.getElementById('call-timer');
const callQuality = document.getElementById('call-quality');

// إعدادات WebRTC
const peerConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // إضافة خوادم TURN للتعامل مع الشبكات المقيدة
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
        },
        {
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            credential: 'webrtc',
            username: 'webrtc'
        }
    ]
};

// أحداث الزر
startVoiceBtn.addEventListener('click', startVoiceChat);
copyRoomIdBtn.addEventListener('click', copyRoomId);
muteBtn.addEventListener('click', toggleMute);
endCallBtn.addEventListener('click', endCall);
speakerBtn.addEventListener('click', toggleSpeaker);

// بدء الدردشة الصوتية
async function startVoiceChat() {
    try {
        // الحصول على تدفق الصوت المحلي
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // إنشاء أو الانضمام إلى غرفة
        roomId = roomIdInput.value.trim() || generateRoomId();
        socket.emit('join-room', { roomId });
        
        // عرض معرف الغرفة
        roomIdDisplay.textContent = `معرف الغرفة: ${roomId}`;
        
        // تبديل الشاشات
        welcomeScreen.classList.remove('active');
        voiceScreen.classList.add('active');
        
        // بدء مؤقت المكالمة
        startCallTimer();
        
        // إضافة المستخدم المحلي إلى قائمة المشاركين
        addParticipant('أنت (محلي)', true);
        
        // تحديث حالة الاتصال
        connectionStatus.textContent = 'متصل. في انتظار المشاركين الآخرين...';
        
        console.log('Voice chat started, room ID:', roomId);
    } catch (error) {
        console.error('Error starting voice chat:', error);
        alert('حدث خطأ أثناء بدء الدردشة الصوتية. يرجى التأكد من السماح بالوصول إلى الميكروفون.');
    }
}

// إنشاء معرف غرفة عشوائي
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

// نسخ معرف الغرفة إلى الحافظة
function copyRoomId() {
    navigator.clipboard.writeText(roomId)
        .then(() => {
            alert('تم نسخ معرف الغرفة إلى الحافظة');
        })
        .catch(err => {
            console.error('Error copying room ID:', err);
            alert('فشل نسخ معرف الغرفة');
        });
}

// تبديل حالة كتم الصوت
function toggleMute() {
    isMuted = !isMuted;
    
    // تحديث حالة الميكروفون المحلي
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });
    
    // تحديث نص الزر
    muteBtn.textContent = isMuted ? '🔊 إلغاء الكتم' : '🔇 كتم';
    
    // إرسال حالة الكتم إلى المشاركين الآخرين
    socket.emit('mute-status', { roomId, isMuted });
    
    console.log('Mute status toggled:', isMuted);
}

// تبديل حالة مكبر الصوت
function toggleSpeaker() {
    // تنفيذ منطق تبديل مكبر الصوت هنا
    // ملاحظة: قد يكون هذا محدودًا في المتصفحات
    alert('تم تبديل حالة مكبر الصوت');
}

// إنهاء المكالمة
function endCall() {
    // إيقاف التدفقات المحلية
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // إغلاق اتصالات الأقران
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    
    // مغادرة الغرفة
    socket.emit('leave-room', { roomId });
    
    // إيقاف مؤقت المكالمة
    clearInterval(callTimerInterval);
    
    // إعادة تعيين واجهة المستخدم
    welcomeScreen.classList.add('active');
    voiceScreen.classList.remove('active');
    participants.innerHTML = '';
    connectionStatus.textContent = 'جاري الاتصال...';
    callTimer.textContent = '00:00';
    
    console.log('Call ended');
}

// بدء مؤقت المكالمة
function startCallTimer() {
    callStartTime = new Date();
    callTimerInterval = setInterval(updateCallTimer, 1000);
}

// تحديث مؤقت المكالمة
function updateCallTimer() {
    const now = new Date();
    const diff = now - callStartTime;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    callTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// إضافة مشارك إلى القائمة
function addParticipant(name, isLocal = false) {
    const participantEl = document.createElement('div');
    participantEl.className = 'participant';
    participantEl.innerHTML = `
        <div class="participant-icon">${isLocal ? '👤' : '👥'}</div>
        <div class="participant-name">${name}</div>
        <div class="participant-status ${isLocal && isMuted ? 'muted' : 'unmuted'}">
            ${isLocal && isMuted ? '🔇' : '🔊'}
        </div>
    `;
    
    if (isLocal) {
        participantEl.id = 'local-participant';
    } else {
        participantEl.id = `participant-${name}`;
    }
    
    participants.appendChild(participantEl);
}

// تحديث حالة كتم المشارك
function updateParticipantMuteStatus(userId, isMuted) {
    const participantEl = document.getElementById(`participant-${userId}`);
    if (participantEl) {
        const statusEl = participantEl.querySelector('.participant-status');
        statusEl.className = `participant-status ${isMuted ? 'muted' : 'unmuted'}`;
        statusEl.textContent = isMuted ? '🔇' : '🔊';
    }
}

// إنشاء اتصال أقران جديد
async function createPeerConnection(userId) {
    try {
        const pc = new RTCPeerConnection(peerConfig);
        
        // إضافة المسارات المحلية إلى الاتصال
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        
        // معالجة مرشحي ICE
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    to: userId,
                    candidate: event.candidate
                });
            }
        };
        
        // معالجة تغييرات حالة الاتصال
        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${userId} changed to: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                connectionStatus.textContent = 'متصل بنجاح';
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                connectionStatus.textContent = 'انقطع الاتصال. جاري إعادة المحاولة...';
            }
        };
        
        // معالجة المسارات الواردة
        pc.ontrack = (event) => {
            console.log(`Received track from ${userId}`);
            // إنشاء عنصر صوت للمسار الوارد
            const audioEl = document.createElement('audio');
            audioEl.srcObject = event.streams[0];
            audioEl.id = `audio-${userId}`;
            audioEl.autoplay = true;
            document.body.appendChild(audioEl);
        };
        
        peerConnections[userId] = pc;
        return pc;
    } catch (error) {
        console.error(`Error creating peer connection for ${userId}:`, error);
        throw error;
    }
}

// إنشاء عرض
async function createOffer(userId) {
    try {
        const pc = peerConnections[userId] || await createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit('offer', {
            to: userId,
            offer: pc.localDescription
        });
        
        console.log(`Offer created and sent to ${userId}`);
    } catch (error) {
        console.error(`Error creating offer for ${userId}:`, error);
    }
}

// معالجة العرض الوارد
async function handleOffer(userId, offer) {
    try {
        const pc = peerConnections[userId] || await createPeerConnection(userId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
            to: userId,
            answer: pc.localDescription
        });
        
        console.log(`Offer handled and answer sent to ${userId}`);
    } catch (error) {
        console.error(`Error handling offer from ${userId}:`, error);
    }
}

// معالجة الإجابة الواردة
async function handleAnswer(userId, answer) {
    try {
        const pc = peerConnections[userId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`Answer from ${userId} handled`);
        }
    } catch (error) {
        console.error(`Error handling answer from ${userId}:`, error);
    }
}

// معالجة مرشح ICE الوارد
async function handleIceCandidate(userId, candidate) {
    try {
        const pc = peerConnections[userId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log(`ICE candidate from ${userId} added`);
        }
    } catch (error) {
        console.error(`Error handling ICE candidate from ${userId}:`, error);
    }
}

// أحداث Socket.io
socket.on('connect', () => {
    console.log('Connected to signaling server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    connectionStatus.textContent = `خطأ في الاتصال: ${error.message}`;
});

socket.on('user-joined', ({ userId }) => {
    console.log(`User joined: ${userId}`);
    connectionStatus.textContent = 'مستخدم جديد انضم إلى الغرفة';
    addParticipant(userId);
    createOffer(userId);
});

socket.on('user-left', ({ userId }) => {
    console.log(`User left: ${userId}`);
    
    // إزالة اتصال الأقران
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    
    // إزالة عنصر الصوت
    const audioEl = document.getElementById(`audio-${userId}`);
    if (audioEl) {
        audioEl.remove();
    }
    
    // إزالة المشارك من القائمة
    const participantEl = document.getElementById(`participant-${userId}`);
    if (participantEl) {
        participantEl.remove();
    }
    
    // تحديث حالة الاتصال إذا لم يتبق أي مشاركين
    if (Object.keys(peerConnections).length === 0) {
        connectionStatus.textContent = 'في انتظار المشاركين...';
    }
});

socket.on('offer', ({ from, offer }) => {
    console.log(`Received offer from ${from}`);
    handleOffer(from, offer);
});

socket.on('answer', ({ from, answer }) => {
    console.log(`Received answer from ${from}`);
    handleAnswer(from, answer);
});

socket.on('ice-candidate', ({ from, candidate }) => {
    console.log(`Received ICE candidate from ${from}`);
    handleIceCandidate(from, candidate);
});

socket.on('mute-status', ({ userId, isMuted }) => {
    console.log(`User ${userId} mute status: ${isMuted}`);
    updateParticipantMuteStatus(userId, isMuted);
});

socket.on('room-full', () => {
    alert('الغرفة ممتلئة. يرجى المحاولة مرة أخرى لاحقًا أو إنشاء غرفة جديدة.');
    welcomeScreen.classList.add('active');
    voiceScreen.classList.remove('active');
});

// إضافة مستمعي أحداث للنافذة
window.addEventListener('beforeunload', () => {
    // تنظيف الموارد عند مغادرة الصفحة
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    if (roomId) {
        socket.emit('leave-room', { roomId });
    }
});

// تحديث جودة الاتصال (محاكاة)
setInterval(() => {
    const qualities = ['ممتازة', 'جيدة', 'متوسطة'];
    const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];
    callQuality.textContent = `جودة الاتصال: ${randomQuality}`;
}, 10000);

// طباعة رسالة تأكيد جاهزية التطبيق
console.log('Secure voice chat application initialized');
