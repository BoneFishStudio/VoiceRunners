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
                // 🔐 Anonymous auth (identitas pemain) — untuk global leaderboard.
                // Perlu diaktifkan di Firebase Console: Authentication → Sign-in method → Anonymous.
                initFirebaseAuth();
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

// ============================================================
// 🔐 FIREBASE ANONYMOUS AUTH + GLOBAL LEADERBOARD
// ============================================================
// Identitas pemain = auth.uid (anonim). Dipakai sebagai kunci node
// /leaderboard/{uid} — tiap user cuma bisa menulis ke slot miliknya sendiri
// (lihat Security Rules: ".write": "auth != null && auth.uid === $uid").

let authUid = null;
let authReady = false;
let authUser = null;      // Objek user Firebase aktif (anonim / email)
let cachedRole = 'anon';  // Role tersimpan (admin/moderator/user/anon)
let _pendingGlobalScores = []; // Antrian skor kalau auth belum siap (run pertama tidak hilang)

// Role terakhir di-cache ke localStorage biar UI langsung tampil tanpa nunggu network
// (di-refresh lagi dari server begitu auth siap).
try {
    const savedRole = localStorage.getItem('voiceRunner_userRole');
    if (savedRole === 'admin' || savedRole === 'moderator' || savedRole === 'user' || savedRole === 'anon') {
        cachedRole = savedRole;
    }
} catch(e) {}

// Aman dipakai buat nampilin input user di HTML (cegah XSS lewat nama)
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Ambil role user dari /userRoles/{uid}.
// Default kalau tidak ada entry: anon (anonymous auth) atau user (akun email).
async function fetchRole(uid) {
    const fallback = (authUser && !authUser.isAnonymous) ? 'user' : 'anon';
    if (!database || !uid) return fallback;
    try {
        const snap = await database.ref('userRoles/' + uid).once('value');
        const r = snap.val();
        if (r === 'admin' || r === 'moderator' || r === 'user' || r === 'anon') return r;
    } catch(e) { /* best-effort */ }
    return fallback;
}

async function initFirebaseAuth() {
    if (!fbInitialized) return;
    try {
        if (typeof firebase.auth !== 'function') {
            console.warn('firebase-auth.js tidak dimuat — global leaderboard nonaktif');
            return;
        }
        // onAuthStateChanged: kepakai juga saat upgrade Guest→akun permanen atau login/logout,
        // jadi UID + role otomatis di-refresh tanpa reload halaman.
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // ⚠️ Guard race: kalau ada callback lama yang selesai lebih lambat
                // (misal upgrade Guest→email), jangan timpa state dengan user basi.
                if (firebase.auth().currentUser !== user) return;
                authUser = user;
                authUid = user.uid;
                authReady = true;
                cachedRole = await fetchRole(user.uid);
                // Cek lagi setelah await — user bisa berubah saat fetchRole berjalan
                if (firebase.auth().currentUser !== user) return;
                try { localStorage.setItem('voiceRunner_userRole', cachedRole); } catch(e) {}
                console.log('✅ Auth:', user.isAnonymous ? 'anonim' : 'email', '| role:', cachedRole);
                // Flush skor yang sempat di-antri sebelum auth siap
                await flushPendingGlobalScores();
                if (typeof refreshAccountUI === 'function') refreshAccountUI();
            } else {
                // Belum ada sesi → sign-in anonim otomatis (Guest)
                try {
                    await firebase.auth().signInAnonymously();
                } catch(e) {
                    console.warn('Anonymous auth gagal:', e.message);
                }
            }
        });
    } catch(e) {
        console.warn('Auth init error:', e.message);
    }
}

async function flushPendingGlobalScores() {
    // Hanya flush entry TERBARU per sesi — kalau ada skor lama yang lebih kecil
    // dari skor terbaru, buang. Cegah double-write <5 detik yang ditolak rules
    // (rate limit) dan cegah nama lama menimpa nama baru.
    if (!_pendingGlobalScores.length) return;
    let best = _pendingGlobalScores[_pendingGlobalScores.length - 1];
    for (const p of _pendingGlobalScores) {
        if ((p.score || 0) > (best.score || 0)) best = p;
    }
    _pendingGlobalScores = [];
    try {
        await saveGlobalLeaderboard(best.name, best.score, best.distance);
    } catch(e) { /* best-effort */ }
}

function getAuthUid() { return authUid; }
function isAuthReady() { return authReady; }
// Role aktif pemain saat ini (default 'anon')
function getUserRole() { return cachedRole; }
function isCurrentUserMod() { return cachedRole === 'admin' || cachedRole === 'moderator'; }

// Simpan skor terbaik ke /leaderboard/{uid} (best-effort, tidak mengganggu game).
// Kalau auth/Firebase gagal → return false, skor tetap aman di localStorage.
async function saveGlobalLeaderboard(name, score, distance) {
    if (!fbInitialized) { init(); }
    if (!fbInitialized || !authReady || !authUid || !database) {
        // Auth belum siap → antri dulu, akan di-flush begitu auth sukses.
        // Skor lokal tetap tersimpan terlepas dari apa pun.
        if (fbInitialized) {
            _pendingGlobalScores.push({ name: name, score: score, distance: distance });
        }
        return false;
    }
    try {
        const ref = database.ref('leaderboard/' + authUid);
        const snap = await ref.once('value');
        const existing = snap.val();
        // Simpan yang TERBAIK per user (jangan menimpa skor lebih tinggi)
        if (existing && typeof existing.score === 'number' && existing.score >= score) {
            return false;
        }
        // Tandai Guest (anonim) + timestamp submit buat anti-cheat rate limit di rules.
        const isGuest = !!(authUser && authUser.isAnonymous);
        await ref.set({
            name: String(name || 'Anonim').slice(0, 20),
            score: Math.floor(score) || 0,
            distance: Math.floor(distance) || 0,
            timestamp: Date.now(),
            lastSubmitTimestamp: Date.now(),
            isGuest: isGuest
        });
        console.log('🌍 Skor global tersimpan:', score);
        return true;
    } catch(e) {
        console.warn('Save global leaderboard gagal:', e.message);
        return false;
    }
}

// Ambil top N skor global dari Firebase (sorted by score desc).
function loadGlobalLeaderboard(limit) {
    return new Promise((resolve) => {
        if (!fbInitialized) { init(); }
        if (!fbInitialized || !database) { resolve([]); return; }
        const count = limit || 50;
        database.ref('leaderboard')
            .orderByChild('score')
            .limitToLast(count)
            .once('value')
            .then((snap) => {
                const entries = [];
                snap.forEach((child) => {
                    const v = child.val();
                    if (v && typeof v.score === 'number') {
                        entries.push({
                            uid: child.key,
                            name: v.name,
                            score: v.score,
                            distance: v.distance || 0,
                            timestamp: v.timestamp || 0
                        });
                    }
                });
                entries.sort((a, b) => b.score - a.score);
                resolve(entries);
            })
            .catch((err) => {
                console.warn('Load global leaderboard gagal:', err);
                resolve([]);
            });
    });
}

// ============================================================
// 👥 SISTEM ROLE + AKUN (admin / moderator / user / anon)
// ============================================================
// Data role: /userRoles/{uid} = "admin" | "moderator" | "user" | "anon"
// - Default (tanpa entry) = "anon" (guest) / "user" (akun email)
// - Hanya ADMIN yang bisa mengubah role siapa pun (di-enforce juga di Security Rules)
// - Bootstrap admin pertama dilakukan MANUAL di Firebase Console (lihat README/docs)

// Terjemahkan pesan error Firebase Auth ke Bahasa Indonesia yang ramah user
function friendlyAuthError(codeOrMsg) {
    const m = String(codeOrMsg || '');
    // Urutan penting: cek kode spesifik dulu sebelum generic
    if (m.indexOf('operation-not-allowed') !== -1 || m.indexOf('OPERATION_NOT_ALLOWED') !== -1) {
        return 'Login Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method). Aktifkan dulu, lalu coba lagi.';
    }
    if (m.indexOf('invalid-login-credentials') !== -1 || m.indexOf('INVALID_LOGIN_CREDENTIALS') !== -1) return 'Email atau password salah.';
    if (m.indexOf('invalid-credential') !== -1) return 'Email atau password salah.';
    if (m.indexOf('email-already-in-use') !== -1) return 'Email sudah terdaftar. Gunakan tombol MASUK.';
    if (m.indexOf('credential-already-in-use') !== -1) return 'Email ini sudah terhubung ke akun lain.';
    if (m.indexOf('invalid-email') !== -1) return 'Format email tidak valid.';
    if (m.indexOf('weak-password') !== -1) return 'Password terlalu lemah (minimal 6 karakter).';
    if (m.indexOf('wrong-password') !== -1) return 'Password salah.';
    if (m.indexOf('user-not-found') !== -1 || m.indexOf('email-not-found') !== -1) return 'Akun tidak ditemukan. Periksa email atau daftar dulu.';
    if (m.indexOf('too-many-requests') !== -1 || m.indexOf('too-many-attempts') !== -1) return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
    if (m.indexOf('requires-recent-login') !== -1) return 'Sesi sudah lama. Keluar lalu masuk lagi, lalu ulangi.';
    if (m.indexOf('network') !== -1 || m.indexOf('unavailable') !== -1) return 'Koneksi internet bermasalah. Coba lagi.';
    return m;
}

function showStatusEl(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'mp-status ' + (type || 'info');
    el.style.display = 'block';
    setTimeout(() => { if (el.textContent === msg) el.style.display = 'none'; }, 6000);
}

// ===== UPGRADE GUEST → AKUN PERMANEN (linkWithCredential) =====
// Guest yang sudah punya skor "naik level" jadi user tanpa kehilangan apa pun:
// UID berubah otomatis oleh Firebase & skor lama tetap mengikuti via anonymous auth.
async function registerOrLinkAccount(email, password, name) {
    if (!authReady || !authUser || !database) return { ok: false, msg: 'Koneksi/auth belum siap. Coba lagi sebentar.' };
    try {
        const user = firebase.auth().currentUser;
        if (user && user.isAnonymous) {
            // 🔁 Guest → upgrade ke akun email permanen (progress & UID lama ditautkan)
            const cred = firebase.auth.EmailAuthProvider.credential(email, password);
            await user.linkWithCredential(cred);
            if (name) {
                try { await user.updateProfile({ displayName: String(name).slice(0, 20) }); } catch(e) {}
            }
            return { ok: true, upgraded: true };
        }
        // Sudah user email — daftar akun baru terpisah
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        if (name) {
            try { await cred.user.updateProfile({ displayName: String(name).slice(0, 20) }); } catch(e) {}
        }
        return { ok: true, upgraded: false };
    } catch(e) {
        return { ok: false, msg: e.message };
    }
}

async function loginEmailAccount(email, password) {
    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        return { ok: true };
    } catch(e) {
        return { ok: false, msg: e.message };
    }
}

async function logoutAccount() {
    try {
        await firebase.auth().signOut();
    } catch(e) {}
    // onAuthStateChanged akan otomatis sign-in anonim lagi (jadi Guest)
    refreshAccountUI();
}

// ===== MODERASI (hanya admin/moderator — di-enforce juga di Security Rules) =====
// Admin: assign/cabut role user mana pun.
async function assignUserRole(uid, role) {
    if (!authReady || !authUid || !database) return { ok: false, msg: 'Koneksi/auth belum siap.' };
    if (['admin', 'moderator', 'user', 'anon'].indexOf(role) === -1) return { ok: false, msg: 'Role tidak valid.' };
    if (!uid) return { ok: false, msg: 'UID kosong.' };
    try {
        await database.ref('userRoles/' + uid).set(role);
        return { ok: true };
    } catch(e) {
        return { ok: false, msg: e.message };
    }
}

// Moderator/Admin: hapus entry leaderboard yang dicurigai curang.
async function removeGlobalEntry(uid) {
    if (!authReady || !authUid || !database) return { ok: false, msg: 'Koneksi/auth belum siap.' };
    try {
        await database.ref('leaderboard/' + uid).remove();
        return { ok: true };
    } catch(e) {
        return { ok: false, msg: e.message };
    }
}

// Dipanggil dari tombol 🗑 di leaderboard global (hanya tampil utk admin/moderator)
async function deleteGlobalEntry(uid) {
    if (!confirm('Hapus entry leaderboard ini?')) return;
    const res = await removeGlobalEntry(uid);
    if (res.ok) {
        if (typeof updateLeaderboard === 'function') updateLeaderboard('global');
    } else {
        alert('Gagal hapus: ' + res.msg);
    }
}

// ===== UI SETTINGS: AKUN & MODERASI =====

// Refresh status akun + visibilitas section moderasi di Settings.
function refreshAccountUI() {
    const status = document.getElementById('accountStatus');
    if (!status) return;
    const guestBox = document.getElementById('accountGuestBox');
    const userBox = document.getElementById('accountUserBox');
    const modSection = document.getElementById('moderationSection');
    const role = getUserRole();

    if (!authUser) {
        status.innerHTML = '⏳ Menghubungkan... (sign-in otomatis)';
        if (guestBox) guestBox.style.display = 'none';
        if (userBox) userBox.style.display = 'none';
    } else if (authUser.isAnonymous) {
        status.innerHTML = '🎭 <b>Guest (anonim)</b> — role: <b>' + escapeHtml(role) + '</b>';
        if (guestBox) guestBox.style.display = 'block';
        if (userBox) userBox.style.display = 'none';
    } else {
        const label = authUser.displayName || authUser.email || 'Akun';
        status.innerHTML = '👤 <b>' + escapeHtml(label) + '</b> — role: <b>' + escapeHtml(role) + '</b>';
        if (guestBox) guestBox.style.display = 'none';
        if (userBox) {
            userBox.style.display = 'block';
            const info = document.getElementById('accountUserInfo');
            if (info) info.textContent = 'Masuk sebagai ' + (authUser.email || label);
        }
    }

    if (modSection) {
        modSection.style.display = (role === 'admin' || role === 'moderator') ? 'block' : 'none';
        const adminRoleBox = document.getElementById('adminRoleBox');
        if (adminRoleBox) adminRoleBox.style.display = (role === 'admin') ? 'block' : 'none';
    }
}

// ============================================================
// 🚪 HALAMAN AUTH (Login / Daftar / Lupa Password)
// ============================================================

function showAuth(tab) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('authScreen').classList.add('active');
    if (typeof Game !== 'undefined') Game.state = 'menu';
    switchAuthTab(tab || 'login');
    refreshAuthStatus();
}

function hideAuth() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
    if (typeof refreshAccountUI === 'function') refreshAccountUI();
}

function switchAuthTab(tab) {
    document.getElementById('authTabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('authTabRegister').classList.toggle('active', tab === 'register');
    document.getElementById('authPanelLogin').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('authPanelRegister').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('authPanelForgot').style.display = tab === 'forgot' ? 'block' : 'none';
    if (typeof refreshAuthStatus === 'function') refreshAuthStatus();
}

function refreshAuthStatus() {
    const el = document.getElementById('authStatus');
    if (!el) return;
    if (!authUser) {
        el.innerHTML = '⏳ Menghubungkan...';
    } else if (authUser.isAnonymous) {
        el.innerHTML = '🎭 Kamu masuk sebagai <b>Guest (anonim)</b>. Daftar akun untuk menyimpan skor permanen di server.';
    } else {
        const label = authUser.displayName || authUser.email || 'Akun';
        el.innerHTML = '👤 <b>' + escapeHtml(label) + '</b> — <span class="auth-ok">akun permanen</span> ✓';
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || '');
}

function authMsg(msg, type) {
    showStatusEl(document.getElementById('authMsg'), msg, type);
}

async function submitLogin() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!isValidEmail(email)) { authMsg('❌ Format email tidak valid.', 'error'); return; }
    if (!password) { authMsg('❌ Password wajib diisi.', 'error'); return; }
    const res = await loginEmailAccount(email, password);
    if (res.ok) {
        authMsg('✅ Berhasil masuk! Skor akunmu tampil di leaderboard global.', 'success');
        refreshAuthStatus();
        if (typeof refreshAccountUI === 'function') refreshAccountUI();
    } else {
        authMsg('❌ ' + friendlyAuthError(res.msg), 'error');
    }
}

async function submitRegister() {
    const name = document.getElementById('authName').value.trim();
    const email = document.getElementById('authEmailReg').value.trim();
    const password = document.getElementById('authPasswordReg').value;
    const password2 = document.getElementById('authPasswordReg2').value;
    // Kalau sudah masuk sebagai akun permanen, jangan buat akun kedua secara diam-diam
    if (authUser && !authUser.isAnonymous) {
        authMsg('ℹ️ Kamu sudah masuk sebagai akun permanen (' + escapeHtml(authUser.email || '') + '). Keluar dulu untuk mendaftar akun baru.', 'info');
        return;
    }
    if (!name) { authMsg('❌ Nama tampilan wajib diisi.', 'error'); return; }
    if (!isValidEmail(email)) { authMsg('❌ Format email tidak valid.', 'error'); return; }
    if (password.length < 6) { authMsg('❌ Password minimal 6 karakter.', 'error'); return; }
    if (password !== password2) { authMsg('❌ Konfirmasi password tidak cocok.', 'error'); return; }
    const res = await registerOrLinkAccount(email, password, name);
    if (res.ok) {
        authMsg(res.upgraded
            ? '✅ Akun berhasil dibuat! Skor Guest-mu tetap tersimpan & kini tersinkron antar device.'
            : '✅ Akun berhasil didaftarkan!', 'success');
        // Kirim email verifikasi (opsional — banyak game tidak wajib)
        try {
            const u = firebase.auth().currentUser;
            if (u && !u.emailVerified) {
                u.sendEmailVerification().catch(() => {});
            }
        } catch(e) {}
        refreshAuthStatus();
        if (typeof refreshAccountUI === 'function') refreshAccountUI();
    } else {
        authMsg('❌ ' + friendlyAuthError(res.msg), 'error');
    }
}

async function submitForgotPassword() {
    const email = document.getElementById('authEmailForgot').value.trim();
    if (!isValidEmail(email)) { authMsg('❌ Format email tidak valid.', 'error'); return; }
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        // Pesan generic — jangan bocorkan apakah email itu terdaftar (anti user enumeration)
        authMsg('📧 Kalau email ' + escapeHtml(email) + ' terdaftar, tautan reset sudah dikirim. Cek inbox (termasuk spam)!', 'success');
    } catch(e) {
        authMsg('📧 Kalau email ' + escapeHtml(email) + ' terdaftar, tautan reset sudah dikirim. Cek inbox (termasuk spam)!', 'success');
    }
}

async function applyRole() {
    const msg = document.getElementById('modMsg');
    const uid = document.getElementById('modUid').value.trim();
    const role = document.getElementById('modRoleSelect').value;
    if (!uid) {
        showStatusEl(msg, 'Masukkan UID user terlebih dahulu.', 'error');
        return;
    }
    const res = await assignUserRole(uid, role);
    if (res.ok) {
        showStatusEl(msg, '✅ Role "' + role + '" diterapkan ke ' + uid, 'success');
        document.getElementById('modUid').value = '';
    } else {
        showStatusEl(msg, '❌ ' + res.msg, 'error');
    }
}

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
