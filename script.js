// ===== المتغيرات العامة =====
let currentScreen = 'welcome-screen';
let callTimer = null;
let callSeconds = 0;
let roomId = null;
let localStream = null;
let peerConnections = {};
let isAudioMuted = false;
let isSpeakerOn = true;
let socket = null;
let localUserId = null;

// ===== إعدادات WebRTC =====
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
        }
    ]
};

// ===== وظائف المساعدة =====

// إنشاء معرف فريد
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// تبديل الشاشات
function switchScreen(screenId) {
    document.querySelector(`.screen.active`).classList.remove('active');
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
}

// تنسيق مؤقت المكالمة
function formatCallTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// بدء مؤقت المكالمة
function startCallTimer() {
    callSeconds = 0;
    document.getElementById('call-timer').textContent = formatCallTime(callSeconds);
    
    callTimer = setInterval(() => {
        callSeconds++;
        document.getElementById('call-timer').textContent = formatCallTime(callSeconds);
    }, 1000);
}

// إيقاف مؤقت المكالمة
function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
}

// تحديث حالة الاتصال
function updateConnectionStatus(status, isError = false) {
    const connectionStatus = document.getElementById('connection-status');
    connectionStatus.textContent = status;
    
    connectionStatus.classList.remove('connected', 'error');
    if (isError) {
        connectionStatus.classList.add('error');
    } else if (status === 'متصل') {
        connectionStatus.classList.add('connected');
    }
}

// إضافة مشارك جديد
function addParticipant(id, name = 'مشارك') {
    const participantsContainer = document.getElementById('participants');
    
    // تحقق مما إذا كان المشارك موجوداً بالفعل
    if (document.getElementById(`participant-${id}`)) {
        return;
    }
    
    const participantElement = document.createElement('div');
    participantElement.classList.add('participant');
    participantElement.id = `participant-${id}`;
    
    participantElement.innerHTML = `
        <div class="participant-avatar">👤</div>
        <div class="participant-name">${name}</div>
    `;
    
    participantsContainer.appendChild(participantElement);
}

// إزالة مشارك
function removeParticipant(id) {
    const participantElement = document.getElementById(`participant-${id}`);
    if (participantElement) {
        participantElement.remove();
    }
}

// تحديث حالة المشارك
function updateParticipantStatus(id, isSpeaking, isMuted) {
    const participantElement = document.getElementById(`participant-${id}`);
    if (!participantElement) return;
    
    if (isSpeaking) {
        participantElement.classList.add('speaking');
    } else {
        participantElement.classList.remove('speaking');
    }
    
    if (isMuted) {
        participantElement.classList.add('muted');
    } else {
        participantElement.classList.remove('muted');
    }
}

// ===== وظائف WebRTC =====

// الحصول على الصوت المحلي
async function getLocalAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream = stream;
        addParticipant('local', 'أنت');
        return stream;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        updateConnectionStatus('فشل في الوصول إلى الميكروفون. يرجى التحقق من إعدادات الميكروفون والسماح بالوصول.', true);
        throw error;
    }
}

// إنشاء اتصال نظير
function createPeerConnection(peerId) {
    if (peerConnections[peerId]) {
        console.log('Peer connection already exists for:', peerId);
        return peerConnections[peerId];
    }
    
    console.log('Creating new peer connection for:', peerId);
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections[peerId] = peerConnection;
    
    // إضافة المسارات المحلية
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // معالجة حدث ice candidate
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                to: peerId,
                candidate: event.candidate
            });
        }
    };
    
    // معالجة حدث تغيير حالة الاتصال
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state change:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            updateConnectionStatus('متصل');
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            updateConnectionStatus('انقطع الاتصال', true);
        }
    };
    
    // معالجة حدث استلام مسار
    peerConnection.ontrack = event => {
        console.log('Received remote track from:', peerId);
        
        // إضافة المشارك الجديد
        addParticipant(peerId);
        
        // إضافة الصوت إلى عنصر الصوت
        const audioElement = document.createElement('audio');
        audioElement.id = `audio-${peerId}`;
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);
    };
    
    return peerConnection;
}

// إنشاء عرض
async function createOffer(peerId) {
    console.log('Creating offer for:', peerId);
    const peerConnection = createPeerConnection(peerId);
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            to: peerId,
            offer: offer
        });
        
        return offer;
    } catch (error) {
        console.error('Error creating offer:', error);
        updateConnectionStatus('فشل في إنشاء عرض الاتصال', true);
        throw error;
    }
}

// معالجة العرض المستلم
async function handleOffer(peerId, offer) {
    console.log('Handling offer from:', peerId);
    const peerConnection = createPeerConnection(peerId);
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            to: peerId,
            answer: answer
        });
        
        return answer;
    } catch (error) {
        console.error('Error handling offer:', error);
        updateConnectionStatus('فشل في معالجة عرض الاتصال', true);
        throw error;
    }
}

// معالجة الإجابة المستلمة
async function handleAnswer(peerId, answer) {
    console.log('Handling answer from:', peerId);
    const peerConnection = peerConnections[peerId];
    if (!peerConnection) {
        console.error('No peer connection for:', peerId);
        return;
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Successfully set remote description');
    } catch (error) {
        console.error('Error handling answer:', error);
        updateConnectionStatus('فشل في معالجة إجابة الاتصال', true);
        throw error;
    }
}

// معالجة ICE candidate المستلم
async function handleIceCandidate(peerId, candidate) {
    console.log('Handling ICE candidate from:', peerId);
    const peerConnection = peerConnections[peerId];
    if (!peerConnection) {
        console.error('No peer connection for:', peerId);
        return;
    }
    
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Successfully added ICE candidate');
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
        throw error;
    }
}

// إنهاء جميع الاتصالات
function closeAllConnections() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    Object.values(peerConnections).forEach(connection => {
        connection.close();
    });
    
    peerConnections = {};
    
    // إزالة جميع عناصر الصوت
    document.querySelectorAll('audio').forEach(audio => {
        audio.remove();
    });
    
    // إذا كان Socket متصلاً، قم بإرسال حدث المغادرة
    if (socket && roomId) {
        socket.emit('leave-room', { roomId });
    }
}

// ===== وظائف Socket.io =====

// إعداد اتصال Socket.io
function setupSocketConnection() {
    // استبدل هذا العنوان بعنوان خادم الإشارة الخاص بك
    socket = io('https://secure-chat-bx6u.onrender.com') ;
    
    socket.on('connect', () => {
        console.log('Connected to signaling server');
        localUserId = socket.id;
        console.log('Local user ID:', localUserId);
    });
    
    socket.on('user-joined', async ({ userId }) => {
        console.log('User joined:', userId);
        addParticipant(userId);
        updateConnectionStatus('مشارك جديد انضم إلى المكالمة');
        
        // إنشاء عرض للمستخدم الجديد
        await createOffer(userId);
    });
    
    socket.on('user-left', ({ userId }) => {
        console.log('User left:', userId);
        removeParticipant(userId);
        
        // إغلاق اتصال النظير
        if (peerConnections[userId]) {
            peerConnections[userId].close();
            delete peerConnections[userId];
        }
        
        // إزالة عنصر الصوت
        const audioElement = document.getElementById(`audio-${userId}`);
        if (audioElement) {
            audioElement.remove();
        }
        
        updateConnectionStatus('غادر أحد المشاركين المكالمة');
    });
    
    socket.on('offer', async ({ from, offer }) => {
        console.log('Received offer from:', from);
        await handleOffer(from, offer);
    });
    
    socket.on('answer', async ({ from, answer }) => {
        console.log('Received answer from:', from);
        await handleAnswer(from, answer);
    });
    
    socket.on('ice-candidate', async ({ from, candidate }) => {
        console.log('Received ICE candidate from:', from);
        await handleIceCandidate(from, candidate);
    });
    
    socket.on('room-full', () => {
        updateConnectionStatus('الغرفة ممتلئة. يرجى المحاولة مرة أخرى لاحقاً.', true);
    });
}

// الانضمام إلى غرفة
function joinRoom(roomId) {
    if (!socket) {
        console.error('Socket connection not established');
        return;
    }
    
    socket.emit('join-room', { roomId });
}

// ===== معالجات الأحداث =====
document.addEventListener('DOMContentLoaded', () => {
    // إعداد اتصال Socket.io
    setupSocketConnection();
    
    // بدء مكالمة صوتية
    document.getElementById('start-voice-btn').addEventListener('click', async () => {
        const roomIdInput = document.getElementById('room-id-input').value.trim();
        roomId = roomIdInput || generateUniqueId();
        
        document.getElementById('room-id-display').textContent = `معرف الغرفة: ${roomId}`;
        
        try {
            updateConnectionStatus('جاري الاتصال...');
            await getLocalAudio();
            
            // الانضمام إلى الغرفة
            joinRoom(roomId);
            
            switchScreen('voice-screen');
            startCallTimer();
            
        } catch (error) {
            console.error('Failed to start call:', error);
            alert('فشل في بدء المكالمة. يرجى التحقق من إعدادات الميكروفون والسماح بالوصول.');
        }
    });
    
    // نسخ معرف الغرفة
    document.getElementById('copy-room-id').addEventListener('click', () => {
        navigator.clipboard.writeText(roomId).then(() => {
            alert('تم نسخ معرف الغرفة إلى الحافظة');
        });
    });
    
    // كتم/إلغاء كتم الصوت
    document.getElementById('mute-btn').addEventListener('click', function() {
        if (localStream) {
            isAudioMuted = !isAudioMuted;
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !isAudioMuted;
            });
            
            this.textContent = isAudioMuted ? '🔊 إلغاء الكتم' : '🔇 كتم';
            updateParticipantStatus('local', false, isAudioMuted);
            
            // إرسال حالة الكتم إلى المشاركين الآخرين
            if (socket) {
                socket.emit('mute-status', {
                    roomId,
                    isMuted: isAudioMuted
                });
            }
        }
    });
    
    // تشغيل/إيقاف مكبر الصوت
    document.getElementById('speaker-btn').addEventListener('click', function() {
        isSpeakerOn = !isSpeakerOn;
        
        document.querySelectorAll('audio').forEach(audio => {
            if (audio.id !== 'audio-local') {
                audio.muted = !isSpeakerOn;
            }
        });
        
        this.textContent = isSpeakerOn ? '🔊 مكبر الصوت' : '🔈 إيقاف مكبر الصوت';
    });
    
    // إنهاء المكالمة
    document.getElementById('end-call-btn').addEventListener('click', () => {
        if (confirm('هل أنت متأكد من رغبتك في إنهاء المكالمة؟')) {
            stopCallTimer();
            closeAllConnections();
            document.getElementById('participants').innerHTML = '';
            switchScreen('welcome-screen');
        }
    });
    
    // معالجة حدث إغلاق النافذة
    window.addEventListener('beforeunload', () => {
        closeAllConnections();
    });
});
