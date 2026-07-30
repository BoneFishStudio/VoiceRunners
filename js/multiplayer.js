/* ============================
   MULTIPLAYER.JS - Firebase Multiplayer
   ============================ */

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDTqm1KLjLMiY9Ukm4FNYHA7kzgVSzKQa4",
    authDomain: "server-ba906.firebaseapp.com",
    databaseURL: "https://server-ba906-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "server-ba906",
    storageBucket: "server-ba906.firebasestorage.app",
    messagingSenderId: "881410606838",
    appId: "1:881410606838:web:4e20c096c41ccbac920ed7",
    measurementId: "G-97YZWNJ7RB"
};

// Inisialisasi Firebase
let firebaseApp = null;
let database = null;
let fbInitialized = false;

// Rate limiting: cooldong 5 detik antar createRoom
let _lastRoomCreation = 0;
const ROOM_CREATION_COOLDOWN = 5000;

/**
 * Hash string dengan SHA-256 (client-side).
 * Tidak 100% aman (client-side bisa dibaca), tapi jauh lebih
 * baik daripada menyimpan password asli di database publik.
 */
async function sha256(message) {
    if (!message) return '';
    try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn('SHA-256 failed, falling back to simple hash:', e);
        // Fallback sederhana kalau crypto.subtle tidak tersedia
        // Gunakan multiple hash rounds untuk hasil yang lebih panjang
        let h1 = 0, h2 = 0, h3 = 0, h4 = 0;
        for (let i = 0; i < message.length; i++) {
            const char = message.charCodeAt(i);
            h1 = ((h1 << 5) - h1) + char;
            h1 = h1 & h1;
            h2 = ((h2 << 7) - h2) + (char * 3);
            h2 = h2 & h2;
            h3 = ((h3 << 3) - h3) + (char * 7);
            h3 = h3 & h3;
            h4 = ((h4 << 13) - h4) + (char * 11);
            h4 = h4 & h4;
        }
        // Gabungkan jadi 64 karakter hex (sama panjang dengan SHA-256)
        const parts = [h1, h2, h3, h4].map(n => 
            Math.abs(n).toString(16).padStart(8, '0')
        );
        // parts.join('') = 32 chars, tambah 32 padding = 64 chars total
        return parts.join('') + '00000000000000000000000000000000';
    }
}

const Multiplayer = {
    roomRef: null,
    playerRef: null,
    playerId: null,
    roomCode: null,
    isHost: false,
    players: {},
    playerCount: 0,
    maxPlayers: 4,
    gameStarted: false,
    
    currentRoomData: null,
    onUpdate: null, // callback ketika ada update
    
    init() {
        if (fbInitialized) return;
        try {
            if (typeof firebase !== 'undefined') {
                if (!firebase.apps.length) {
                    firebaseApp = firebase.initializeApp(firebaseConfig);
                } else {
                    firebaseApp = firebase.app();
                }
                database = firebase.database();
                fbInitialized = true;
                console.log('Firebase initialized');
            } else {
                console.warn('Firebase SDK not loaded');
            }
        } catch(e) {
            console.error('Firebase init error:', e);
        }
    },
    
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },
    
    generatePlayerId() {
        return 'player_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
    },
    
    async createRoom(password = '') {
        if (!fbInitialized) {
            this.init();
            if (!fbInitialized) {
                this.showStatus('Gagal connect ke Firebase. Cek koneksi internet.', 'error');
                return null;
            }
        }
        
        // Rate limiting: cegah spam pembuatan room
        const now = Date.now();
        if (now - _lastRoomCreation < ROOM_CREATION_COOLDOWN) {
            const remaining = Math.ceil((ROOM_CREATION_COOLDOWN - (now - _lastRoomCreation)) / 1000);
            this.showStatus(`Mohon tunggu ${remaining} detik sebelum membuat room lagi`, 'error');
            return null;
        }
        
        this.roomCode = this.generateRoomCode();
        this.playerId = this.generatePlayerId();
        this.isHost = true;
        
        // Hash password sebelum dikirim ke Firebase
        const hashedPassword = await sha256(password || '');
        
        const roomData = {
            host: this.playerId,
            password: hashedPassword, // Hash, bukan plaintext!
            createdAt: Date.now(),
            status: 'waiting',
            seed: Math.floor(Math.random() * 999999),
            players: {},
            playerOrder: [],
            gameState: null,
            maxPlayers: this.maxPlayers
        };
        
        roomData.players[this.playerId] = {
            id: this.playerId,
            name: 'Host',
            ready: true,
            score: 0,
            distance: 0,
            lives: 3,
            alive: true,
            joinedAt: Date.now()
        };
        roomData.playerOrder = [this.playerId];
        
        try {
            // Set cooldown hanya saat benar-benar akan menulis ke Firebase
            _lastRoomCreation = now;
            await database.ref('rooms/' + this.roomCode).set(roomData);
            
            this.roomRef = database.ref('rooms/' + this.roomCode);
            this.playerRef = database.ref('rooms/' + this.roomCode + '/players/' + this.playerId);
            
            // Listen for changes
            this.setupRoomListener();
            
            // Set presence - auto cleanup jika disconnect
            this.roomRef.child('players/' + this.playerId).onDisconnect().remove();
            this.roomRef.child('playerOrder').onDisconnect().remove();
            
            // Auto-remove room if host leaves
            if (this.isHost) {
                this.roomRef.onDisconnect().remove();
            }
            
            document.getElementById('generatedCode').textContent = this.roomCode;
            document.getElementById('waitingRoomCode').textContent = this.roomCode;
            
            this.showMpPanel('waiting');
            this.showStatus('Room berhasil dibuat! Kode: ' + this.roomCode, 'success');
            
            return this.roomCode;
        } catch(e) {
            console.error('Create room error:', e);
            this.showStatus('Gagal membuat room: ' + e.message, 'error');
            return null;
        }
    },
    
    async joinRoom(code, password = '') {
        if (!fbInitialized) {
            this.init();
            if (!fbInitialized) {
                this.showStatus('Gagal connect ke Firebase. Cek koneksi internet.', 'error', 'joinStatus');
                return false;
            }
        }
        
        code = code.toUpperCase().trim();
        this.roomCode = code;
        this.playerId = this.generatePlayerId();
        this.isHost = false;
        
        try {
            const snapshot = await database.ref('rooms/' + code).once('value');
            const room = snapshot.val();
            
            if (!room) {
                this.showStatus('Room tidak ditemukan!', 'error', 'joinStatus');
                return false;
            }
            
            if (room.status === 'playing') {
                this.showStatus('Game sudah dimulai!', 'error', 'joinStatus');
                return false;
            }
            
            // Hash password yang dimasukkan, lalu bandingkan dengan hash di DB
            const hashedInput = await sha256(password || '');
            if (room.password && room.password !== hashedInput) {
                this.showStatus('Password salah!', 'error', 'joinStatus');
                return false;
            }
            
            const playerCount = Object.keys(room.players || {}).length;
            if (playerCount >= this.maxPlayers) {
                this.showStatus('Room sudah penuh! (maks 4 pemain)', 'error', 'joinStatus');
                return false;
            }
            
            // Join room
            this.roomRef = database.ref('rooms/' + code);
            this.playerRef = database.ref('rooms/' + code + '/players/' + this.playerId);
            
            const playerData = {
                id: this.playerId,
                name: 'Pemain ' + (playerCount + 1),
                ready: true,
                score: 0,
                distance: 0,
                lives: 3,
                alive: true,
                joinedAt: Date.now()
            };
            
            await this.playerRef.set(playerData);
            await this.roomRef.child('playerOrder').transaction((order) => {
                if (!order) return [this.playerId];
                if (order.includes(this.playerId)) return order;
                order.push(this.playerId);
                return order;
            });
            
            // Listen for changes
            this.setupRoomListener();
            
            this.roomRef.child('players/' + this.playerId).onDisconnect().remove();
            
            document.getElementById('waitingRoomCode').textContent = code;
            this.showMpPanel('waiting');
            this.showStatus('Berhasil gabung room!', 'success', 'joinStatus');
            
            return true;
        } catch(e) {
            console.error('Join room error:', e);
            this.showStatus('Gagal gabung: ' + e.message, 'error', 'joinStatus');
            return false;
        }
    },
    
    updateRoomUI(data) {
        if (!data) return;
        
        const playerList = document.getElementById('mpPlayerList');
        const playersCount = document.getElementById('playersCount');
        const startBtn = document.getElementById('startMultiBtn');
        
        if (!playerList) return;
        
        playerList.innerHTML = '';
        const players = data.players || {};
        const order = data.playerOrder || Object.keys(players);
        let count = 0;
        
        order.forEach((pid) => {
            const p = players[pid];
            if (!p) return;
            count++;
            
            const div = document.createElement('div');
            div.className = 'mp-player';
            div.innerHTML = `
                <span class="player-icon">${pid === data.host ? '👑' : '👤'}</span>
                <span class="player-name">${p.name || 'Pemain'}</span>
                <span class="player-status">${p.ready ? '✅ Siap' : '⏳...'}</span>
            `;
            playerList.appendChild(div);
        });
        
        const maxP = data.maxPlayers || 4;
        playersCount.textContent = `${count}/${maxP} pemain`;
        
        // Show start button only for host and at least 2 players
        if (this.isHost && count >= 2 && data.status === 'waiting') {
            startBtn.style.display = 'inline-flex';
        } else {
            startBtn.style.display = 'none';
        }
    },
    
    showStatus(msg, type, statusId = 'roomStatus') {
        const el = document.getElementById(statusId);
        if (!el) return;
        el.textContent = msg;
        el.className = 'mp-status ' + type;
        el.style.display = 'block';
        
        setTimeout(() => {
            if (el.textContent === msg) {
                el.style.display = 'none';
            }
        }, 5000);
    },
    
    showMpPanel(panel) {
        document.querySelectorAll('.mp-panel').forEach(p => p.style.display = 'none');
        if (panel === 'create') document.getElementById('mpCreate').style.display = 'block';
        else if (panel === 'join') document.getElementById('mpJoin').style.display = 'block';
        else if (panel === 'waiting') document.getElementById('mpWaiting').style.display = 'block';
    },
    
    setupRoomListener() {
        if (!this.roomRef) return;
        this.roomRef.off(); // Hapus listener lama biar ganda
        this.roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                this.cleanup();
                return;
            }
            this.currentRoomData = data;
            this.updateRoomUI(data);
            
            // ✅ Deteksi game dimulai oleh host!
            if (data.status === 'playing' && !this.gameStarted && !this.isHost) {
            this.gameStarted = true;
            // Sembunyikan multiplayer screen, mulai game
            document.getElementById('multiplayerScreen').classList.remove('active');
            if (typeof Game !== 'undefined' && Game.startMultiplayer) {
                // Pass seed dari room supaya rintangan identik semua pemain
                Game.startMultiplayer(data.seed);
            }
            }
            
            if (this.onUpdate) this.onUpdate(data);
        });
    },
    
    async startGame() {
        if (!this.isHost || !this.roomRef) return;
        
        const data = this.currentRoomData;
        if (!data) return;
        
        const players = data.players || {};
        const count = Object.keys(players).length;
        if (count < 2) return;
        
        // Generate level seed
        const seed = Math.floor(Math.random() * 999999);
        
        try {
            await this.roomRef.update({
                status: 'playing',
                seed: seed,
                startTime: Date.now(),
                gameState: {
                    started: true,
                    seed: seed,
                    timestamp: Date.now()
                }
            });
            
            this.gameStarted = true;
            
            // ✅ Langsung mulai game untuk host!
            if (typeof Game !== 'undefined' && Game.startMultiplayer) {
                // Sembunyikan multiplayer screen
                document.getElementById('multiplayerScreen').classList.remove('active');
                // Pass seed biar rintangan identik di semua client
                Game.startMultiplayer(seed);
            }
        } catch(e) {
            console.error('Start game error:', e);
        }
    },
    
    async updatePlayerState(score, distance, lives, alive) {
        if (!this.playerRef || !this.roomRef) return;
        try {
            await this.playerRef.update({
                score: score,
                distance: distance,
                lives: lives,
                alive: alive
            });
        } catch(e) {
            console.error('Update state error:', e);
        }
    },
    
    cleanup() {
        if (this.roomRef) {
            this.roomRef.off();
            this.roomRef = null;
        }
        if (this.playerRef) {
            this.playerRef.onDisconnect().cancel();
            this.playerRef = null;
        }
        this.currentRoomData = null;
        this.roomCode = null;
        this.isHost = false;
        this.gameStarted = false;
        this.players = {};
    },
    
    leaveRoom() {
        // Remove player from room
        if (this.roomRef && this.playerId) {
            this.roomRef.child('players/' + this.playerId).remove();
            this.roomRef.child('playerOrder').transaction((order) => {
                if (!order) return null;
                return order.filter(id => id !== this.playerId);
            });
            
            // If host, delete room or pass host
            if (this.isHost && this.currentRoomData) {
                const players = this.currentRoomData.players || {};
                const otherPlayers = Object.keys(players).filter(id => id !== this.playerId);
                if (otherPlayers.length === 0) {
                    this.roomRef.remove();
                } else {
                    this.roomRef.child('host').set(otherPlayers[0]);
                }
            }
        }
        this.cleanup();
        this.showMpPanel('create');
    }
};

// ===== UI Functions =====

function switchMpTab(tab) {
    document.getElementById('tabCreate').classList.toggle('active', tab === 'create');
    document.getElementById('tabJoin').classList.toggle('active', tab === 'join');
    document.getElementById('mpCreate').style.display = tab === 'create' ? 'block' : 'none';
    document.getElementById('mpJoin').style.display = tab === 'join' ? 'block' : 'none';
}

async function createRoom() {
    const password = document.getElementById('roomPassword').value;
    const code = await Multiplayer.createRoom(password);
    if (code) {
        // Trigger loading then go to waiting
    }
}

async function joinRoom() {
    const code = document.getElementById('joinCode').value;
    const password = document.getElementById('joinPassword').value;
    await Multiplayer.joinRoom(code, password);
}

function startMultiplayerGame() {
    Multiplayer.startGame();
}

function leaveRoom() {
    Multiplayer.leaveRoom();
    document.getElementById('mpWaiting').style.display = 'none';
}
