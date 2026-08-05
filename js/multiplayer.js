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
                <span class="player-icon">${pid === data.host
                    ? '<svg class="lb-icon"><use href="#icon-trophy"/></svg>'
                    : '<svg class="lb-icon"><use href="#icon-user"/></svg>'}</span>
                <span class="player-name">${p.name || 'Pemain'}</span>
                <span class="player-status">${p.ready ? 'Siap' : '...'}</span>
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

// Sinkronkan variabel global lama (authUser/authUid/authReady/cachedRole)
// dari state AuthService — dipanggil oleh main.js setiap state auth berubah,
// supaya game.js & fungsi multiplayer lain yang membaca variabel ini selalu akurat
// (bahkan sebelum Multiplayer.init() dipanggil).
function syncAuthGlobals(s) {
    if (!s) return;
    authUser = s.user;
    authUid = s.uid;
    authReady = s.ready;
    cachedRole = s.role;
}

// Auth init didelegasikan ke AuthService (js/auth/authService.js).
// Fungsi ini dipertahankan supaya panggilan lama (Multiplayer.init) tetap aman.
async function initFirebaseAuth() {
    if (!fbInitialized) return;
    try {
        if (typeof firebase.auth !== 'function') {
            console.warn('firebase-auth.js tidak dimuat — auth nonaktif');
            return;
        }
        if (window.AuthService && !window.AuthService.state.ready) {
            window.AuthService.init();
        }
        if (window.AuthService) {
            syncAuthGlobals(window.AuthService.getState());
        }
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

// Simpan skor terbaik ke /leaderboard/{uid} — didelegasikan ke DatabaseService.
// Best-effort; kalau auth belum siap, skor diantri dan di-flush begitu auth sukses.
async function saveGlobalLeaderboard(name, score, distance) {
    if (!fbInitialized) { init(); }
    if (!fbInitialized || !authReady || !authUid || !database) {
        if (fbInitialized) {
            _pendingGlobalScores.push({ name: name, score: score, distance: distance });
        }
        return false;
    }
    try {
        const ok = await window.DatabaseService.saveScore(name, score, distance);
        if (ok) console.log('Skor global tersimpan:', score);
        return ok;
    } catch(e) {
        console.warn('Save global leaderboard gagal:', e.message);
        return false;
    }
}

// Ambil top N skor global — didelegasikan ke DatabaseService.
function loadGlobalLeaderboard(limit) {
    return window.DatabaseService.loadTop(limit || 50);
}

// ============================================================
// 👥 SISTEM ROLE + AKUN (admin / moderator / user / anon)
// ============================================================
// Data role: /userRoles/{uid} = "admin" | "moderator" | "user" | "anon"
// - Default (tanpa entry) = "anon" (guest) / "user" (akun email)
// - Hanya ADMIN yang bisa mengubah role siapa pun (di-enforce juga di Security Rules)
// - Bootstrap admin pertama dilakukan MANUAL di Firebase Console (lihat README/docs)

// Terjemahkan error Firebase → pesan ramah (didelegasikan ke Validation)
function friendlyAuthError(codeOrMsg) {
    return (window.Validation || {}).friendlyAuthError ? window.Validation.friendlyAuthError(codeOrMsg) : String(codeOrMsg || '');
}

// Deteksi apakah provider Email/Password aktif (didelegasikan — tampilkan peringatan di PROFILE)
async function checkEmailProviderEnabled() {
    try {
        await firebase.auth().fetchSignInMethodsForEmail('provider-check@example.com');
        const el = document.getElementById('authStatus');
        if (el && el.dataset.providerWarn) delete el.dataset.providerWarn;
        return true;
    } catch(e) {
        const m = String(e.message || '');
        if (m.indexOf('operation-not-allowed') !== -1 || m.indexOf('OPERATION_NOT_ALLOWED') !== -1) {
            const el = document.getElementById('authStatus');
            if (el && !el.dataset.providerWarn) {
                el.dataset.providerWarn = '1';
                el.innerHTML = '<b>Login Email/Password belum diaktifkan.</b> Buka Firebase Console → Authentication → Sign-in method → aktifkan <b>Email/Password</b>, lalu muat ulang halaman ini.';
            }
            return false;
        }
        return true;
    }
}

function showStatusEl(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'mp-status ' + (type || 'info');
    el.style.display = 'block';
    setTimeout(() => { if (el.textContent === msg) el.style.display = 'none'; }, 6000);
}

// ===== DELEGASI KE AUTHSERVICE (js/auth/authService.js) =====
// Semua operasi auth inti dipindah ke AuthService (register dengan
// createUserWithEmailAndPassword + updateProfile + email verifikasi,
// login dengan cek verifikasi, logout, delete, ganti password, dll).

async function registerOrLinkAccount(email, password, name) {
    if (!window.AuthService) return { ok: false, msg: 'AuthService belum siap.' };
    if (!authReady || !authUser || !database) return { ok: false, msg: 'Koneksi/auth belum siap. Coba lagi sebentar.' };
    return window.AuthService.register(name, email, password);
}

async function loginEmailAccount(email, password) {
    if (!window.AuthService) return { ok: false, msg: 'AuthService belum siap.' };
    return window.AuthService.login(email, password);
}

async function logoutAccount() {
    if (window.AuthService) {
        await window.AuthService.logout();
    } else {
        try { await firebase.auth().signOut(); } catch(e) {}
    }
    // onAuthStateChanged (AuthService) akan otomatis sign-in anonim lagi (Guest)
    refreshAccountUI();
}

// ===== MODERASI (hanya admin/moderator — di-enforce juga di Security Rules) =====
// Admin: assign/cabut role user mana pun (delegasi ke DatabaseService).
async function assignUserRole(uid, role) {
    if (!authReady || !authUid || !database) return { ok: false, msg: 'Koneksi/auth belum siap.' };
    if (['admin', 'moderator', 'user', 'anon'].indexOf(role) === -1) return { ok: false, msg: 'Role tidak valid.' };
    return window.DatabaseService.setUserRole(uid, role);
}

// Moderator/Admin: hapus entry leaderboard (delegasi ke DatabaseService).
async function removeGlobalEntry(uid) {
    if (!authReady || !authUid || !database) return { ok: false, msg: 'Koneksi/auth belum siap.' };
    return window.DatabaseService.removeEntry(uid);
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

// ===== UI PROFILE: kartu profil + status akun =====

// Statistik pribadi dari localStorage (best score, jarak terjauh, jumlah game)
function getProfileStats() {
    let bestScore = 0, bestDist = 0, games = 0;
    try {
        const saved = localStorage.getItem('voiceRunner_leaderboard');
        if (saved) {
            const lb = JSON.parse(saved);
            lb.filter(e => e.type !== 'checkpoint').forEach(e => {
                games++;
                if (e.score > bestScore) bestScore = e.score;
                if (e.distance > bestDist) bestDist = e.distance;
            });
        }
    } catch(e) {}
    return { bestScore, bestDist, games };
}

// Refresh kartu profil + status akun (dipakai di halaman PROFILE).
function refreshAccountUI() {
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const badgeEl = document.getElementById('profileBadge');
    const avatarEl = document.getElementById('profileAvatar');
    const status = document.getElementById('authStatus');
    const role = getUserRole();

    // Statistik selalu diisi dari localStorage
    const st = getProfileStats();
    const bsEl = document.getElementById('profileBestScore');
    const bdEl = document.getElementById('profileBestDist');
    const gmEl = document.getElementById('profileGames');
    if (bsEl) bsEl.textContent = st.bestScore;
    if (bdEl) bdEl.textContent = Math.floor(st.bestDist) + 'm';
    if (gmEl) gmEl.textContent = st.games;

    const badgeLabel = role === 'admin' ? 'ADMIN' : role === 'moderator' ? 'MODERATOR' : role === 'user' ? 'MEMBER' : 'GUEST';
    const badgeColor = role === 'admin' ? 'admin' : role === 'moderator' ? 'moderator' : role === 'user' ? 'member' : 'guest';

    if (!authUser) {
        if (nameEl) nameEl.textContent = 'Menghubungkan...';
        if (emailEl) emailEl.textContent = '';
        if (status) status.textContent = '⏳ Menghubungkan... (sign-in otomatis)';
    } else if (authUser.isAnonymous) {
        if (nameEl) nameEl.textContent = 'Guest';
        if (emailEl) emailEl.textContent = 'Skor tersimpan di perangkat ini';
        if (status) status.textContent = 'Kamu bermain sebagai Guest. Daftar untuk menyimpan skor di server.';
    } else {
        const label = authUser.displayName || authUser.email || 'Akun';
        if (nameEl) nameEl.textContent = label;
        if (emailEl) emailEl.textContent = authUser.email || '';
        if (status) status.textContent = 'Kamu masuk sebagai akun permanen. Skor tersinkron antar device.';
    }
    if (badgeEl) {
        badgeEl.textContent = badgeLabel;
        badgeEl.className = 'profile-badge ' + badgeColor;
    }
    if (avatarEl) {
        const photoURL = authUser && authUser.photoURL;
        if (photoURL) {
            // Foto profil dari Storage (atau provider)
            avatarEl.innerHTML = '';
            avatarEl.classList.remove('has-initial');
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = 'Foto profil';
            img.className = 'profile-avatar-img';
            img.onerror = function () { avatarEl.textContent = '?' ; };
            avatarEl.appendChild(img);
        } else {
            // Avatar: inisial nama (atau huruf G untuk Guest)
            let initial = '?';
            if (authUser && !authUser.isAnonymous) {
                const label = (authUser.displayName || authUser.email || 'U').trim();
                initial = label.charAt(0).toUpperCase();
            } else if (authUser && authUser.isAnonymous) {
                initial = 'G';
            }
            avatarEl.textContent = initial;
            avatarEl.classList.add('has-initial');
        }
    }

    // Tombol ubah foto hanya untuk akun permanen
    const avatarEditBtn = document.getElementById('avatarEditBtn');
    if (avatarEditBtn) avatarEditBtn.style.display = (authUser && !authUser.isAnonymous) ? 'flex' : 'none';

    // Isi detail akun lengkap (panel akun permanen)
    fillAccountDetails();

    // Moderasi: tampil hanya utk admin/moderator; panel set-role khusus admin
    const modSection = document.getElementById('moderationSection');
    if (modSection) {
        modSection.style.display = (role === 'admin' || role === 'moderator') ? 'block' : 'none';
        const adminRoleBox = document.getElementById('adminRoleBox');
        if (adminRoleBox) adminRoleBox.style.display = (role === 'admin') ? 'block' : 'none';
    }

    // Pastikan panel logged-in ikut refresh (dipakai dari onAuthStateChanged,
    // logoutAccount, dan showAuth — jadi UI tidak pernah nyangkut)
    if (typeof updateProfileLoggedInPanel === 'function') updateProfileLoggedInPanel();
}

// Isi detail akun lengkap (UID, tanggal buat, login terakhir, provider, verifikasi)
function fillAccountDetails() {
    const u = authUser;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    if (!u) return;

    set('pdUsername', u.displayName || '-');
    set('pdEmail', u.email || '-');
    set('pdVerified', u.emailVerified ? '✓ Terverifikasi' : '✗ Belum verifikasi');
    set('pdUid', u.uid || '-');
    set('pdCreated', u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString('id-ID') : '-');
    set('pdLastLogin', u.metadata && u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toLocaleDateString('id-ID') : '-');

    // Provider login (dari providerData)
    const providers = (u.providerData || []).map(p => p.providerId);
    let providerLabel = providers.join(', ') || 'password';
    if (providerLabel.indexOf('google.com') !== -1) providerLabel = 'Google';
    else if (providerLabel.indexOf('password') !== -1) providerLabel = 'Email/Password';
    else if (providerLabel.indexOf('anonymous') !== -1) providerLabel = 'Anonymous';
    set('pdProvider', providerLabel);

    const pvEl = document.getElementById('pdVerified');
    if (pvEl) pvEl.className = 'pd-value ' + (u.emailVerified ? 'pd-ok' : 'pd-warn');
}

// Update halaman PROFILE: kalau sudah login permanen, sembunyikan form login/daftar,
// tampilkan panel "KELUAR" (reset password + logout).
function updateProfileLoggedInPanel() {
    const loggedInPanel = document.getElementById('authPanelLoggedIn');
    const accountInfoPanel = document.getElementById('authPanelAccountInfo');
    const tabs = document.querySelector('.auth-tabs');
    if (!loggedInPanel) return;
    const isPermanent = authUser && !authUser.isAnonymous;
    if (isPermanent) {
        // Sembunyikan SEMUA panel auth (login/daftar/lupa password)
        ['authPanelLogin', 'authPanelRegister', 'authPanelForgot'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        loggedInPanel.style.display = 'block';
        if (accountInfoPanel) accountInfoPanel.style.display = 'block';
        if (tabs) tabs.style.display = 'none';
        const info = document.getElementById('authLoggedInInfo');
        if (info) info.textContent = 'Masuk sebagai ' + (authUser.email || authUser.displayName || 'akun');
        if (typeof fillAccountDetails === 'function') fillAccountDetails();
    } else {
        loggedInPanel.style.display = 'none';
        if (accountInfoPanel) accountInfoPanel.style.display = 'none';
        if (tabs) tabs.style.display = 'flex';
        const active = document.querySelector('.auth-tab.active');
        const tab = active && active.id === 'authTabRegister' ? 'register' : 'login';
        const panelId = tab === 'register' ? 'authPanelRegister' : 'authPanelLogin';
        const el = document.getElementById(panelId);
        if (el) el.style.display = 'block';
    }
}

// Refresh status di halaman PROFILE + panel logged-in
function refreshAuthStatus() {
    const el = document.getElementById('authStatus');
    if (!el) return;
    if (!authUser) {
        el.textContent = '⏳ Menghubungkan...';
    } else if (authUser.isAnonymous) {
        el.textContent = 'Kamu masuk sebagai Guest. Daftar untuk menyimpan skor permanen di server.';
    } else {
        const label = authUser.displayName || authUser.email || 'Akun';
        el.textContent = 'Masuk sebagai ' + label + ' — akun permanen ✓';
    }
    if (typeof updateProfileLoggedInPanel === 'function') updateProfileLoggedInPanel();
    if (typeof refreshAccountUI === 'function') refreshAccountUI();
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
    // Deteksi apakah provider Email/Password sudah diaktifkan (biar error 400
    // nggak muncul misterius) — kalau nonaktif, tampilkan peringatan jelas.
    if (typeof checkEmailProviderEnabled === 'function') checkEmailProviderEnabled();
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
    if (typeof updateProfileLoggedInPanel === 'function') updateProfileLoggedInPanel();
    if (typeof refreshAuthStatus === 'function') refreshAuthStatus();
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
    if (!isValidEmail(email)) { authMsg('Format email tidak valid.', 'error'); return; }
    if (!password) { authMsg('Password wajib diisi.', 'error'); return; }
    const res = await loginEmailAccount(email, password);
    if (res.ok && res.needsVerification) {
        // Email belum diverifikasi → tampilkan screen verifikasi (blokir main)
        showVerificationScreen(res.user);
        return;
    }
    if (res.ok) {
        authMsg('Berhasil masuk! Skor akunmu tampil di leaderboard global.', 'success');
        refreshAuthStatus();
        if (typeof refreshAccountUI === 'function') refreshAccountUI();
        if (window.Toast) window.Toast.success('Selamat datang kembali!');
    } else {
        authMsg(friendlyAuthError(res.msg), 'error');
    }
}

async function submitRegister() {
    const name = document.getElementById('authName').value.trim();
    const email = document.getElementById('authEmailReg').value.trim();
    const password = document.getElementById('authPasswordReg').value;
    const password2 = document.getElementById('authPasswordReg2').value;
    // Kalau sudah masuk sebagai akun permanen, jangan buat akun kedua secara diam-diam
    if (authUser && !authUser.isAnonymous) {
        authMsg('Kamu sudah masuk sebagai akun permanen (' + escapeHtml(authUser.email || '') + '). Keluar dulu untuk mendaftar akun baru.', 'info');
        return;
    }
    if (!name) { authMsg('Nama tampilan wajib diisi.', 'error'); return; }
    if (!isValidEmail(email)) { authMsg('Format email tidak valid.', 'error'); return; }
    // Password kuat: min 8, huruf besar, huruf kecil, angka
    const pwCheck = window.Validation.validatePasswordStrength(password);
    if (!pwCheck.ok) {
        authMsg('Password harus ' + pwCheck.errors.join(', ') + '.', 'error');
        return;
    }
    if (password !== password2) { authMsg('Konfirmasi password tidak cocok.', 'error'); return; }
    const res = await registerOrLinkAccount(email, password, name);
    if (res.ok) {
        authMsg(res.upgraded
            ? 'Akun berhasil dibuat! Skor Guest-mu tetap tersimpan & kini tersinkron antar device.'
            : 'Akun berhasil didaftarkan!', 'success');
        if (window.Toast) window.Toast.success('Akun dibuat! Cek email untuk verifikasi.');
        // Email verifikasi WAJIB — tampilkan screen verifikasi
        showVerificationScreen(res.user);
    } else {
        authMsg(friendlyAuthError(res.msg), 'error');
    }
}

// ===== EMAIL VERIFICATION SCREEN =====
async function showVerificationScreen(user) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('verificationScreen').classList.add('active');
    const emailEl = document.getElementById('verifyEmail');
    const u = user || (firebase.auth() && firebase.auth().currentUser);
    if (emailEl && u) emailEl.textContent = u.email || 'email kamu';
    if (window.AuthService) window.AuthService.state.emailBlocked = true;
}

async function resendVerificationEmail() {
    const msgEl = document.getElementById('verifyMsg');
    const res = await window.AuthService.resendVerification();
    if (res.ok) {
        showStatusEl(msgEl, 'Email verifikasi terkirim ulang. Cek inbox (termasuk spam)!', 'success');
    } else {
        showStatusEl(msgEl, friendlyAuthError(res.msg), 'error');
    }
}

async function checkVerificationStatus() {
    const msgEl = document.getElementById('verifyMsg');
    const res = await window.AuthService.refreshVerificationStatus();
    if (res.verified) {
        showStatusEl(msgEl, 'Email terverifikasi! Menuju main menu...', 'success');
        setTimeout(() => {
            document.getElementById('verificationScreen').classList.remove('active');
            document.getElementById('mainMenu').classList.add('active');
            if (window.Toast) window.Toast.success('Selamat datang! Akunmu aktif.');
        }, 1200);
    } else {
        showStatusEl(msgEl, 'Belum terverifikasi. Cek email lalu coba lagi.', 'error');
    }
}

async function logoutAndGuest() {
    // Keluar dari akun email → lanjut sebagai Guest (boleh main)
    await logoutAccount();
    document.getElementById('verificationScreen').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
}

// ===== EDIT PROFIL (nama + foto) =====
function toggleProfileEdit() {
    const box = document.getElementById('profileEditBox');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    const editName = document.getElementById('editDisplayName');
    if (editName && authUser) editName.value = authUser.displayName || '';
}

async function saveDisplayName() {
    const input = document.getElementById('editDisplayName');
    const name = (input ? input.value : '').trim();
    const v = window.Validation.validateDisplayName(name);
    if (!v.ok) { if (window.Toast) window.Toast.error(v.msg); return; }
    const u = firebase.auth().currentUser;
    if (!u) return;
    try {
        await u.updateProfile({ displayName: v.value });
        // Simpan ke RTDB profile juga
        if (window.ProfileService) window.ProfileService.updateProfile(u.uid, { displayName: v.value }).catch(() => {});
        if (window.Toast) window.Toast.success('Nama diperbarui!');
        refreshAccountUI();
    } catch(e) {
        if (window.Toast) window.Toast.error(friendlyAuthError(e.message));
    }
}

function openPhotoPicker() {
    const input = document.getElementById('photoInput');
    if (input) input.click();
}

async function uploadProfilePhoto() {
    const input = document.getElementById('photoInput') || document.getElementById('editPhotoInput');
    const file = input && input.files && input.files[0];
    if (!file) { if (window.Toast) window.Toast.error('Pilih file gambar dulu.'); return; }
    const u = firebase.auth().currentUser;
    if (!u || !window.StorageService) return;
    if (window.Toast) window.Toast.loading('Mengupload foto...');
    const res = await window.StorageService.uploadAvatar(file, u.uid);
    window.Toast.hideLoading();
    if (res.ok) {
        try {
            await u.updateProfile({ photoURL: res.url });
        } catch(e) {}
        if (window.ProfileService) window.ProfileService.updateProfile(u.uid, { photoURL: res.url }).catch(() => {});
        if (window.Toast) window.Toast.success('Foto profil diperbarui!');
        refreshAccountUI();
    } else {
        if (window.Toast) window.Toast.error(friendlyAuthError(res.msg));
    }
}

// ===== GANTI PASSWORD =====
async function changeMyPassword() {
    const cur = document.getElementById('chgCurrentPassword').value;
    const newPw = document.getElementById('chgNewPassword').value;
    const confirmPw = document.getElementById('chgConfirmPassword').value;
    const msgEl = document.getElementById('pwdMsg');
    const pwCheck = window.Validation.validatePasswordStrength(newPw);
    if (!pwCheck.ok) { showStatusEl(msgEl, 'Password baru harus ' + pwCheck.errors.join(', ') + '.', 'error'); return; }
    if (newPw !== confirmPw) { showStatusEl(msgEl, 'Konfirmasi password tidak cocok.', 'error'); return; }
    const res = await window.AuthService.changePassword(cur, newPw);
    if (res.ok) {
        showStatusEl(msgEl, 'Password berhasil diganti!', 'success');
        ['chgCurrentPassword', 'chgNewPassword', 'chgConfirmPassword'].forEach(id => {
            document.getElementById(id).value = '';
        });
    } else {
        showStatusEl(msgEl, friendlyAuthError(res.msg), 'error');
    }
}

// ===== DELETE ACCOUNT =====
function requestDeleteAccount() {
    document.getElementById('deleteConfirmBox').style.display = 'block';
    document.getElementById('deletePassword').value = '';
}
function cancelDeleteAccount() {
    document.getElementById('deleteConfirmBox').style.display = 'none';
}
async function confirmDeleteAccount() {
    const password = document.getElementById('deletePassword').value;
    const msgEl = document.getElementById('deleteMsg');
    if (!window.AuthService) return;
    if (window.Toast) window.Toast.loading('Menghapus akun...');
    const res = await window.AuthService.deleteAccount(password);
    window.Toast.hideLoading();
    if (res.ok) {
        if (window.Toast) window.Toast.success('Akun dihapus. Kamu kini Guest.');
        setTimeout(() => {
            document.getElementById('authScreen').classList.remove('active');
            document.getElementById('mainMenu').classList.add('active');
        }, 1000);
    } else {
        showStatusEl(msgEl, friendlyAuthError(res.msg), 'error');
    }
}

async function submitForgotPassword() {
    const email = document.getElementById('authEmailForgot').value.trim();
    if (!isValidEmail(email)) { authMsg('Format email tidak valid.', 'error'); return; }
    const res = await window.AuthService.forgotPassword(email);
    // Pesan generic — jangan bocorkan apakah email itu terdaftar (anti user enumeration)
    authMsg('Kalau email ' + escapeHtml(email) + ' terdaftar, tautan reset sudah dikirim. Cek inbox (termasuk spam)!', 'success');
    if (res && res.msg && !res.ok) {
        // Hanya tampilkan error yang benar-benar bukan soal enumerasi (mis. network)
        authMsg(friendlyAuthError(res.msg), 'error');
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
