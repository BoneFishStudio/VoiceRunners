/* ============================
   GAME.JS - Voice Runner Core Engine
   ============================ */

// ===== CONSTANTS =====
const GRAVITY = 0.6;
const GROUND_Y_RATIO = 0.78;
const BASE_SPEED = 5;
const MAX_SPEED = 14;
const SPEED_INCREMENT = 0.001;
const RAMP_SPEED_BOOST = 0.8;       // Tambahan speed per ramp (1000m)
const RAMP_INTERVAL = 1000;         // Meter per ramp
const OBSTACLE_MIN_GAP = 120;
const OBSTACLE_MAX_GAP = 200;
const PIT_CHANCE = 0.15;

// ===== VOICE CHALLENGE VOLUME (mekanik baru: TERIAK, bukan baca kalimat) =====
// Skala volume 0-1 (getByteTimeDomainData). Threshold di atasnya = lubang terisi.
const PIT_VOLUME_THRESHOLD = 0.18;  // Volume minimal utk mengisi lubang
const PIT_CHARGE_FRAMES = 6;        // Frame beruntun di atas threshold sebelum terisi (anti salah isi)

// ===== SISTEM 5 TEMA BACKGROUND =====
// Urutan siklus tema berdasarkan jarak (distance):
// City → Forest → Night → Morning → Sore → ulang
const THEME_CYCLE = ['city', 'forest', 'night', 'morning', 'sore'];
const THEME_LENGTH = 800;       // Meter per tema penuh
const THEME_BLEND_ZONE = 180;   // Zona transisi crossfade di ujung tiap tema (m)
const THEME_PREVIEW_SPEED = 1;  // DEV: set > 1 (misal 10) untuk preview transisi cepat

// ===== DETEKSI DEVICE LOW-POWER (HP / hardware terbatas) =====
// Dipakai utk auto-turunkan kualitas rendering biar game ringan di semua device:
// - DPR dibatasi (buffer canvas lebih kecil)
// - shadowBlur dikurangi (operasi paling mahal di canvas mobile)
// - Ambient glow full-screen di-skip (hanya di device benar-benar lemah)
//
// Dua tingkat:
// - MODERATE (semua mobile): DPR cap 2 + shadowBlur 70% — visual tetap bagus
// - LOW_POWER (mobile + RAM/CPU terbatas): DPR 1.5, shadowBlur 35%, glow di-skip
function detectLowPower() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    return (mobile && (cores <= 4 || mem <= 4)) || (!mobile && (cores <= 2 || mem <= 2));
}
const LOW_POWER = detectLowPower();
const IS_MOBILE = (typeof navigator !== 'undefined') &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
// HP flagship (mobile tapi RAM/CPU cukup): moderat — glow tetap ada, cuma dikurangi
const GLOW_SCALE = LOW_POWER ? 0.35 : (IS_MOBILE ? 0.7 : 1);
// Batas pixel ratio (DPR 3-4 di HP = buffer canvas raksasa = GPU overload)
const MAX_DPR = LOW_POWER ? 1.5 : 2;

// Palette tiap tema — semua warna procedural/vector, tanpa image assets
const THEMES = {
    city: {
        name: 'City (Siang)',
        isDark: false,
        sky: ['#5ec8ff', '#b8e6ff', '#f4fbff'],
        stars: 0,
        clouds: true,
        sun: { alpha: 0.85, size: 42, y: 0.16, clip: false },
        moon: { alpha: 0 },
        mountains: 0,
        mountainsColor: '#cfe8f8',
        buildings: 0.2,
        buildingColor: '#3d6ea6',
        trees: 0,
        glow: { color: '130, 200, 255', strength: 0.05 }
    },
    forest: {
        name: 'Forest (Hutan)',
        isDark: false,
        sky: ['#8fdcae', '#c2efcf', '#eefaf0'],
        stars: 0,
        clouds: true,
        sun: { alpha: 0.55, size: 46, y: 0.2, clip: false },
        moon: { alpha: 0 },
        mountains: 0.06,
        mountainsColor: '#4d8f6a',
        buildings: 0,
        buildingColor: '#2e6b4a',
        trees: 0.25,
        glow: { color: '100, 210, 140', strength: 0.05 }
    },
    night: {
        name: 'Night (Malam)',
        isDark: true,
        sky: ['#0f0f1a', '#1a1a2e', '#0a0a0a'],
        stars: 1,
        clouds: false,
        sun: { alpha: 0 },
        moon: { alpha: 0.9, size: 34, y: 0.16 },
        mountains: 0.08,
        mountainsColor: '#ffffff',
        buildings: 0.06,
        buildingColor: '#ffffff',
        trees: 0,
        glow: { color: '100, 200, 255', strength: 0.08 }
    },
    morning: {
        name: 'Morning (Pagi)',
        isDark: false,
        sky: ['#ffd9a8', '#ffeecb', '#a9d8ff'],
        stars: 0.1,
        clouds: true,
        sun: { alpha: 0.95, size: 70, y: 0.34, clip: true },
        moon: { alpha: 0 },
        mountains: 0.06,
        mountainsColor: '#c9a0b0',
        buildings: 0.05,
        buildingColor: '#8a6a7a',
        trees: 0,
        glow: { color: '255, 190, 120', strength: 0.08 }
    },
    sore: {
        name: 'Sore (Sunset)',
        isDark: false,
        sky: ['#ff9a4d', '#e77ba8', '#6a4a9f'],
        stars: 0.2,
        clouds: false,
        sun: { alpha: 0.9, size: 58, y: 0.46, clip: true },
        moon: { alpha: 0 },
        mountains: 0.08,
        mountainsColor: '#3a2a5a',
        buildings: 0.14,
        buildingColor: '#2a1a3a',
        trees: 0,
        glow: { color: '255, 130, 90', strength: 0.08 }
    }
};

/**
 * mulberry32 — Seeded PRNG sederhana.
 * Deterministic: seed yang sama selalu menghasilkan urutan angka yang sama.
 * Dipakai untuk spawn rintangan supaya semua pemain di room yang sama
 * mendapat obstacle/pit yang identik di jarak yang sama.
 * Efek visual (partikel, background) tetap pakai Math.random() biasa.
 */
function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Jump heights
const JUMP_FORCES = {
    1: -11,   // Tap cepat
    2: -15,   // Tahan sebentar
    3: -19    // Tahan lama
};

// ===== GAME STATE =====
const Game = {
    canvas: null,
    ctx: null,
    loadingCanvas: null,
    loadingCtx: null,
    
    // Game state
    state: 'menu', // menu, loading, modeSelect, solo, multiplayer, paused, gameOver
    
    // Player
    player: {
        x: 80,
        y: 0,
        vy: 0,
        width: 30,
        height: 50,
        groundY: 0,
        jumpLevel: 0,  // 0 = di tanah, 1-3 = level lompat
        isJumping: false,
        jumpCharge: 0,
        isCharging: false,
        animFrame: 0,
        animTimer: 0,
        squash: 1,
        stretch: 1
    },
    
    // World
    obstacles: [],
    pits: [],
    floatingTexts: [],
    particles: [],
    jumpTrail: [], // Jejak karakter saat lompat
    scorePopups: [], // Floating score text (+10, +50)
    
    // Game stats
    score: 0,
    distance: 0,
    lives: 3,
    maxLives: 3,
    speed: BASE_SPEED,
    gameSpeed: BASE_SPEED,
    
    // Ground
    groundX: 0,
    
    // Seed & RNG (untuk deterministic multiplayer sync)
    seed: 0,
    _rng: null,
    
    // Tema background (real-time transition per jarak)
    currentTheme: 'city',
    nextTheme: 'city',
    blendProgress: 0,
    themePreviewSpeed: undefined, // DEV: set 10 di console utk preview transisi cepat
    themeDistance: 0,             // Jarak khusus tema — tidak di-rewind saat respawn,
                                  // supaya tema tidak "lompat" balik ke awal saat checkpoint.
    
    // Ramp kesulitan
    rampMultiplier: 1, // 1x = normal, ~1.16x at 1000m, ~1.32x at 2000m, etc
    
    // Timers
    lastObstacleDist: 0,
    frameCount: 0,
    

    // Voice
    currentVoiceText: null,
    activePit: null,
    isListening: false,
    recognition: null,
    micPermissionChecked: false,
    
    // Voice volume jump system (continuous mic monitoring)
    voiceAnalyser: null,
    voiceDataArray: null,
    voiceMicStream: null,
    voiceJumpCooldown: 0,
    voiceVolume: 0,
    voiceEnabled: false,
    
    // Checkpoint system
    checkpointDistance: 0,
    checkpointScore: 0,
    checkpointLives: 3,
    
    // Countdown
    countdownValue: 3,
    countdownTimer: 0,
    
    // Screen shake
    shakeAmount: 0,
    shakeDecay: 0.9,
    
    // Multiplayer
    isMultiplayer: false,
    mpPlayers: {}, // Store other player positions
    
    // Save data
    savedGame: null,
    
    // Background elements
    bgStars: [],
    bgMountains: [],
    bgTrees: [],
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.loadingCanvas = document.getElementById('loadingCanvas');
        this.loadingCtx = this.loadingCanvas.getContext('2d');
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Init audio
        AudioManager.init();
        
        // Init multiplayer
        Multiplayer.init();
        
        // Generate background
        this.generateBackground();
        
        // Check for saved game
        this.checkSavedGame();
        
        // Start loading animation
        this.animateLoadingCharacter();
        
        // Start menu demo (game preview di background)
        this.startMenuDemo();
        
        // Input handlers
        this.setupInput();
        
        // Musik TIDAK di-load di init — file MP3 5.1MB baru di-fetch setelah
        // interaksi pertama user (lazy-load), biar waktu buka pertama cepat,
        // terutama penting untuk PWA di jaringan lambat. AudioContext juga
        // wajib di-resume dari user gesture.
        document.addEventListener('click', () => {
            if (AudioManager.audioContext && AudioManager.audioContext.state === 'suspended') {
                AudioManager.audioContext.resume();
            }
            // Lazy-load musik: initAudioContext → fetch+decode MP3 → auto-start
            this.startMusic();
        }, { once: true });
        
        console.log('Voice Runner initialized!');
    },
    
    resize() {
        // Gunakan device pixel ratio utk canvas sharp — TAPI dibatasi biar gak bikin
        // buffer raksasa di HP (DPR 3-4 → 9-16x pixel = GPU overload)
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        // Set canvas buffer size ke physical pixels (sharp!)
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        // Set CSS size ke logical pixels (tampilan normal)
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        
        // Reset transform, lalu set scale DPR (setTransform = reset dulu, tidak kumulatif)
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // Simpan ukuran logical untuk rendering
        this._w = w;
        this._h = h;
        
        this.player.groundY = h * GROUND_Y_RATIO;
        
        if (this.state === 'solo' || this.state === 'multiplayer' || this.state === 'paused' || this.state === 'menu') {
            this.player.y = this.player.groundY;
        }
    },
    
    generateBackground() {
        // Stars
        this.bgStars = [];
        for (let i = 0; i < 100; i++) {
            this.bgStars.push({
                x: Math.random() * 2000,
                y: Math.random() * this.logicalH * 0.6,
                size: Math.random() * 2 + 0.5,
                brightness: Math.random() * 0.5 + 0.3,
                twinkleSpeed: Math.random() * 0.02 + 0.01
            });
        }
        
        // Mountains
        this.bgMountains = [];
        for (let i = 0; i < 8; i++) {
            this.bgMountains.push({
                x: i * 250 + Math.random() * 50,
                height: 60 + Math.random() * 120,
                width: 200 + Math.random() * 150
            });
        }
    },
    
    animateLoadingCharacter() {
        // Animate a small running figure on the loading screen
        let frame = 0;
        const animate = () => {
            if (this.state !== 'loading') return;
            const ctx = this.loadingCtx;
            const c = this.loadingCanvas;
            ctx.clearRect(0, 0, c.width, c.height);
            
            // Draw running character on loading screen
            this.drawLoadingCharacter(ctx, c.width / 2, c.height / 2 + 10, frame);
            
            frame = (frame + 1) % 8;
            setTimeout(() => requestAnimationFrame(animate), 100);
        };
        animate();
    },
    
    drawLoadingCharacter(ctx, x, y, frame) {
        ctx.save();
        ctx.fillStyle = '#fff';
        
        const bounce = Math.sin(frame * Math.PI / 4) * 3;
        const legPhase = frame * Math.PI / 4;
        
        // Body
        ctx.fillRect(x - 4, y - 20 + bounce, 8, 14);
        
        // Head
        ctx.beginPath();
        ctx.arc(x, y - 26 + bounce, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Arms
        ctx.fillRect(x - 8, y - 16 + bounce + Math.sin(legPhase) * 3, 4, 10);
        ctx.fillRect(x + 4, y - 16 + bounce - Math.sin(legPhase) * 3, 4, 10);
        
        // Legs
        ctx.fillRect(x - 5, y - 6 + bounce + Math.cos(legPhase) * 4, 4, 8);
        ctx.fillRect(x + 1, y - 6 + bounce - Math.cos(legPhase) * 4, 4, 8);
        
        ctx.restore();
    },
    
    checkSavedGame() {
        const saved = localStorage.getItem('voiceRunner_save');
        if (saved) {
            try {
                this.savedGame = JSON.parse(saved);
            } catch(e) {
                this.savedGame = null;
            }
        }
    },
    
    setupInput() {
        // Voice Runner — hanya voice yang kontrol game!
        // Keyboard hanya untuk pause
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                if (this.state === 'solo' || this.state === 'multiplayer') {
                    this.togglePause();
                }
            }
        });
    },
    
    // ===== MENU DEMO MODE (game preview di background) =====
    
    startMenuDemo() {
        // Reset ke kondisi demo
        this.state = 'menu';
        this.resetGame();
        this.speed = BASE_SPEED * 0.7; // Lebih lambat untuk demo
        this.gameSpeed = this.speed;
        
        // Generate background jika belum
        if (this.bgStars.length === 0) {
            this.generateBackground();
        }
        
        // Pastikan player di ground
        this.player.y = this.player.groundY;
        this.player.isJumping = false;
        
        // Mulai demo loop
        this._demoRunning = true;
        this._demoJumpTimer = 0;
        this._lastDemoJump = 0;
        this.menuDemoLoop();
    },
    
    menuDemoLoop() {
        if (this.state !== 'menu' || !this._demoRunning) return;
        
        this.frameCount++;
        
        // Scroll ground
        this.groundX -= this.gameSpeed;
        if (this.groundX <= -20) this.groundX += 20;
        
        // Update background
        this.updateMountains();
        this.distance += this.gameSpeed * 0.05;
        this.themeDistance += this.gameSpeed * 0.05;
        
        // Auto-jump logic
        const p = this.player;
        if (p.y >= p.groundY && !p.isJumping) {
            // Lompat periodik untuk variasi
            this._demoJumpTimer++;
            if (this._demoJumpTimer > 60 + Math.random() * 40) {
                this._demoJumpTimer = 0;
                p.isCharging = true;
                p.jumpCharge = 0;
                p.squash = 0.85;
                
                // Random delay lalu lepas
                const chargeTime = 100 + Math.random() * 400;
                setTimeout(() => {
                    if (this.state === 'menu' && p.isCharging) {
                        p.isCharging = false;
                        p.isJumping = true;
                        let level = 1;
                        if (p.jumpCharge > 0.6) level = 3;
                        else if (p.jumpCharge > 0.25) level = 2;
                        p.jumpLevel = level;
                        p.vy = JUMP_FORCES[level];
                        p.stretch = 1.2;
                        this.emitParticles(p.x, p.groundY, 3);
                    }
                }, chargeTime);
            }
        }
        
        // Player physics
        if (p.y < p.groundY) {
            p.vy += GRAVITY;
        }
        p.y += p.vy;
        if (p.y >= p.groundY) {
            p.y = p.groundY;
            p.vy = 0;
            p.isJumping = false;
            p.jumpLevel = 0;
        }
        
        // Running animation
        if (!p.isJumping) {
            p.animTimer += this.gameSpeed * 0.05;
            if (p.animTimer > 1) {
                p.animTimer = 0;
                p.animFrame = (p.animFrame + 1) % 6;
            }
        }
        if (p.isCharging) {
            p.jumpCharge = Math.min(p.jumpCharge + 0.05, 1);
            p.squash = Math.max(p.squash - 0.01, 0.85);
        }
        
        // Update particles
        this.updateParticles();
        
        // Stars twinkle update
        
        // Render
        this.render();
        
        requestAnimationFrame(() => this.menuDemoLoop());
    },
    
    stopMenuDemo() {
        this._demoRunning = false;
    },
    
    // ===== GAME LOOP =====
    
    startSolo() {
        this.stopMenuDemo();
        this.showCanvas();
        this.isMultiplayer = false;
        this.resetGame();
        
        // Mulai voice volume detection untuk kontrol lompatan
        // (tidak perlu await — countdown 3 detik cukup untuk mic siap)
        this.startVoiceVolumeDetection();
        
        // Cek apakah perlu show instruksi
        if (!localStorage.getItem('voiceRunner_instructionsShown')) {
            this.showInstructions();
            return;
        }
        
        this.startCountdown();
    },
    
    startMultiplayer(seed) {
        this.stopMenuDemo();
        this.showCanvas();
        this.isMultiplayer = true;
        this.resetGame(seed); // Seed dari multiplayer room untuk deterministic spawn
        // Mulai voice volume detection (countdown 3s cukup untuk mic siap)
        this.startVoiceVolumeDetection();
        this.startCountdown();
    },
    
    showCanvas() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('gameCanvas').style.display = 'block';
        document.getElementById('gameOverlay').style.display = 'block';
        document.getElementById('pauseMenu').classList.add('overlay-hidden');
        document.getElementById('gameOverScreen').classList.add('overlay-hidden');
        document.getElementById('winScreen').classList.add('overlay-hidden');
        document.getElementById('instructionsOverlay').classList.add('overlay-hidden');
        document.getElementById('instructionsOverlay').classList.remove('overlay-active');
    },
    
    resetGame(seed) {
        this.player.y = this.player.groundY;
        this.player.vy = 0;
        this.player.jumpLevel = 0;
        this.player.isJumping = false;
        this.player.jumpCharge = 0;
        this.player.isCharging = false;
        this.player.animFrame = 0;
        this.player.squash = 1;
        this.player.stretch = 1;
        
        this.obstacles = [];
        this.pits = [];
        this.floatingTexts = [];
        this.particles = [];
        this.jumpTrail = [];
        this.scorePopups = [];
        
        this.score = 0;
        this.distance = 0;
        this.themeDistance = 0;
        this.lives = 3;
        this.speed = BASE_SPEED;
        this.gameSpeed = BASE_SPEED;
        this.groundX = 0;
        this.frameCount = 0;
        this.lastObstacleDist = 0;
        this.shakeAmount = 0;
        
        this.currentVoiceText = null;
        this.activePit = null;
        this.isListening = false;
        
        // Reset checkpoint — kalau tidak, run berikutnya gak dapat checkpoint di 500m
        // (karena kondisi `distance > checkpointDistance + 500` udah kepake)
        this.checkpointDistance = 0;
        this.checkpointScore = 0;
        this.checkpointLives = this.maxLives;
        
        // Reset voice state
        this.voiceVolume = 0;
        this.voiceJumpCooldown = 0;
        
        // RNG: seeded untuk deterministic obstacle spawning (multiplayer sync)
        // - Kalau ada seed dari multiplayer, pakai itu
        // - Solo mode: random
        if (seed !== undefined) {
            this.seed = seed;
        } else if (typeof Multiplayer !== 'undefined' && 
                   Multiplayer.currentRoomData && 
                   Multiplayer.currentRoomData.seed) {
            this.seed = Multiplayer.currentRoomData.seed;
        } else {
            this.seed = Math.floor(Math.random() * 999999) + 1;
        }
        this._rng = mulberry32(this.seed);
        this.rampMultiplier = 1;
        
        this.updateHUD();
    },
    
    startCountdown() {
        this.state = 'solo'; // Will be overridden by countdown
        this.countdownValue = 3;
        this.countdownTimer = 0;
        
        document.getElementById('countdownOverlay').classList.remove('overlay-hidden');
        document.getElementById('countdownNum').textContent = '3';
        
        // Start music
        this.startMusic();
        
        // Start game loop (paused until countdown finishes)
        this.gameLoop(0);
    },
    
    gameLoop(timestamp) {
        if (this.state === 'loading' || this.state === 'modeSelect' || this.state === 'menu' ||
            this.state === 'gameOver') return;
        
        // Handle countdown
        if (this.countdownValue > 0) {
            this.countdownTimer += 16;
            if (this.countdownTimer > 1000) {
                this.countdownTimer = 0;
                this.countdownValue--;
                if (this.countdownValue > 0) {
                    document.getElementById('countdownNum').textContent = this.countdownValue;
                    AudioManager.playSFX('countdown');
                } else {
                    document.getElementById('countdownNum').textContent = 'GO!';
                    AudioManager.playSFX('go');
                    setTimeout(() => {
                        document.getElementById('countdownOverlay').classList.add('overlay-hidden');
                        this.state = this.isMultiplayer ? 'multiplayer' : 'solo';
                        // Start sending updates if multiplayer
                        if (this.isMultiplayer) {
                            this.mpUpdateInterval = setInterval(() => this.sendMPUpdate(), 100);
                        }
                    }, 600);
                }
            }
            
            // Still render during countdown
            this.render();
            requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }
        
        if (this.state === 'paused') {
            this.render();
            requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }
        
        // Update game
        this.update();
        this.render();
        
        // Sync multiplayer
        if (this.isMultiplayer && Multiplayer.currentRoomData) {
            this.syncMultiplayerState();
        }
        
        requestAnimationFrame((t) => this.gameLoop(t));
    },
    
    // ===== UPDATE =====
    
    update() {
        this.frameCount++;
        
        // Increase speed over time
        if (this.speed < MAX_SPEED) {
            this.speed += SPEED_INCREMENT;
        }
        this.gameSpeed = this.speed * (1 + this.distance / 5000);
        
        // ===== RAMP KESULITAN PER 1000m =====
        // Setiap kelipatan 1000m, speed naik bertahap (bukan lompatan mendadak)
        // Contoh: 1000m → speed +0.8, 2000m → speed +1.6, 3000m → speed +2.4, dst
        const currentRamp = Math.floor(this.distance / RAMP_INTERVAL);
        const targetRampMultiplier = 1 + (currentRamp * RAMP_SPEED_BOOST / BASE_SPEED);
        // Transisi gradual — bukan lompatan langsung
        this.rampMultiplier += (targetRampMultiplier - this.rampMultiplier) * 0.005;
        this.gameSpeed = this.gameSpeed * (1 + (this.rampMultiplier - 1) * 0.3);
        
        if (this.gameSpeed > MAX_SPEED) this.gameSpeed = MAX_SPEED;
        
        // Update distance (tema juga jalan — tapi themeDistance tidak di-rewind saat respawn)
        this.distance += this.gameSpeed * 0.1;
        this.themeDistance += this.gameSpeed * 0.1;
        
        // Ground scroll
        this.groundX -= this.gameSpeed;
        if (this.groundX <= -20) this.groundX += 20;
        
        // Update player
        this.updatePlayer();
        
        // Generate obstacles
        this.generateObstacles();
        
        // Voice jump — suara pemain tentukan tinggi lompatan!
        // Dipanggil SEBELUM updateObstacles biar lompat duluan sebelum tabrakan!
        this.voiceJumpCheck();
        
        // Update obstacles (move + check collision)
        this.updateObstacles();
        
        // Update pits
        this.updatePits();
        
        // Check for pit collision
        this.checkPitCollision();
        
        // Update floating texts
        this.updateFloatingTexts();
        
        // Update particles
        this.updateParticles();
        
        // Update background mountains
        this.updateMountains();
        
        // Shake decay
        if (this.shakeAmount > 0) {
            this.shakeAmount *= this.shakeDecay;
            if (this.shakeAmount < 0.5) this.shakeAmount = 0;
        }
        
        // Update score (based on distance)
        this.score = Math.floor(this.distance * 2 + this.frameCount * 0.5);
        
        // Checkpoint otomatis setiap 500m
        if (this.distance > this.checkpointDistance + 500) {
            this.saveCheckpoint();
        }
        
        // Update HUD (throttle: gak perlu tulis DOM tiap frame, biar ringan di HP)
        if (this.frameCount % 4 === 0) this.updateHUD();
    },
    
    updatePlayer() {
        const p = this.player;
        const wasInAir = p.y < p.groundY;
        
        // Gravity
        if (p.y < p.groundY) {
            p.vy += GRAVITY;
        }
        
        p.y += p.vy;
        
        // Jump trail — tambah jejak setiap beberapa frame saat di udara atau lompat
        if ((p.y < p.groundY || p.isJumping) && this.frameCount % 2 === 0) {
            this.jumpTrail.push({
                x: p.x,
                y: p.y,
                vy: p.vy,
                life: 1,
                squash: p.squash,
                stretch: p.stretch
            });
            // Batasi jumlah trail biar gak overload
            if (this.jumpTrail.length > 15) {
                this.jumpTrail.shift();
            }
        }
        
        // Ground collision
        if (p.y >= p.groundY) {
            // Landing detection — kalau sebelumnya di udara
            if (wasInAir) {
                // Landing splash effect
                this.emitLandingSplash(p.x, p.groundY);
            }
            
            p.y = p.groundY;
            p.vy = 0;
            p.isJumping = false;
            p.jumpLevel = 0;
            
            // Landing squash
            if (p.squash < 1) {
                p.squash = Math.min(p.squash + 0.1, 1);
            }
            if (p.stretch > 1) {
                p.stretch = Math.max(p.stretch - 0.1, 1);
            }
        }
        
        // In air - stretch
        if (p.y < p.groundY) {
            p.stretch = Math.min(p.stretch + 0.02, 1.15);
            p.squash = Math.max(p.squash - 0.02, 0.9);
        }
        
        // Running animation
        if (!p.isJumping) {
            p.animTimer += this.gameSpeed * 0.05;
            if (p.animTimer > 1) {
                p.animTimer = 0;
                p.animFrame = (p.animFrame + 1) % 6;
            }
        }
        
        // Charge jump if holding
        if (p.isCharging) {
            p.jumpCharge = Math.min(p.jumpCharge + 0.05, 1);
        }
        
        // Update jump trail
        for (let i = this.jumpTrail.length - 1; i >= 0; i--) {
            const t = this.jumpTrail[i];
            t.life -= 0.04;
            t.y += t.vy * 0.2;
            if (t.life <= 0) {
                this.jumpTrail.splice(i, 1);
            }
        }
        
        // Update score popups
        for (let i = this.scorePopups.length - 1; i >= 0; i--) {
            const s = this.scorePopups[i];
            s.y -= 1.5;
            s.life -= 0.015;
            if (s.life <= 0) {
                this.scorePopups.splice(i, 1);
            }
        }
        
        // Cap jumlah score popups — biar tidak menumpuk di HP
        if (this.scorePopups.length > 30) {
            this.scorePopups.splice(0, this.scorePopups.length - 30);
        }
    },
    
    emitLandingSplash(x, y) {
        // Ring effect — partikel melingkar
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 2 - 1,
                life: 1,
                decay: 0.04 + Math.random() * 0.03,
                size: 2 + Math.random() * 3
            });
        }
        // Debu di tanah
        for (let i = 0; i < 4; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 2,
                life: 0.8,
                decay: 0.03 + Math.random() * 0.02,
                size: 3 + Math.random() * 3
            });
        }
    },
    
    // ===== OBSTACLES =====
    
    generateObstacles() {
        // ── DETERMINISTIC ── pakai seeded RNG supaya hasilnya sama
        // untuk semua pemain di room yang sama (multiplayer sync)
        const shouldGen = this._rng() < 0.008 * (this.gameSpeed / BASE_SPEED);
        
        if (shouldGen && this.canGenerateObstacle()) {
            const isPit = this._rng() < PIT_CHANCE;
            
            if (isPit && !this.activePit) {
                this.createPit();
            } else {
                // FALLBACK: kalau pit gak bisa dibuat (activePit masih aktif),
                // tetap spawn obstacle biasa — jangan biarkan slot kosong!
                this.createObstacle();
            }
        }
        // ── RANDOM MURNI ── sisanya (efek visual, partikel) tetap Math.random()
    },
    
    canGenerateObstacle() {
        const lastDist = this.lastObstacleDist;
        const minGap = OBSTACLE_MIN_GAP * (BASE_SPEED / this.gameSpeed);
        const maxGap = OBSTACLE_MAX_GAP * (BASE_SPEED / this.gameSpeed);
        // ── DETERMINISTIC ── gap dihitung pakai seeded RNG
        const gap = minGap + this._rng() * (maxGap - minGap);
        
        if (this.distance - lastDist > gap) {
            this.lastObstacleDist = this.distance;
            return true;
        }
        return false;
    },
    
    get logicalW() { return this._w || this.canvas.width / (window.devicePixelRatio || 1); },
    get logicalH() { return this._h || this.canvas.height / (window.devicePixelRatio || 1); },
    
    createObstacle() {
        // ── DETERMINISTIC ── semua pakai seeded RNG
        // Pilih type: 0=Box, 1=Spike, 2=Pillar
        const typeWeights = [0.35, 0.35, 0.3];
        const rand = this._rng();
        let type;
        if (rand < typeWeights[0]) type = 0;
        else if (rand < typeWeights[0] + typeWeights[1]) type = 1;
        else type = 2;
        
        let obsHeight, obsY;
        
        switch(type) {
            case 0: // Box — butuh suara normal (level 2)
                obsHeight = 35 + this._rng() * 10;
                break;
            case 1: // Spike — butuh suara pelan (level 1)
                obsHeight = 22 + this._rng() * 8;
                break;
            case 2: // Pillar — butuh suara keras (level 3)
                obsHeight = 55 + this._rng() * 10;
                break;
        }
        
        obsY = this.player.groundY - obsHeight;
        
        let obsWidth;
        switch(type) {
            case 0: obsWidth = 18 + this._rng() * 8; break;
            case 1: obsWidth = 16 + this._rng() * 6; break;
            case 2: obsWidth = 20 + this._rng() * 8; break;
        }
        
        // ── DETERMINISTIC ── variant & hitbox juga dari seeded RNG (sinkron multiplayer)
        const variant = Math.floor(this._rng() * 3);
        // Hitbox proporsional ke bentuk visual:
        // - Box: inset kecil (3px) — bentuknya persegi penuh
        // - Spike: inset horizontal 20% tiap sisi — segitiga menyempit ke atas
        // - Pillar: inset minimal (2px)
        const hitInset = type === 1 ? Math.floor(obsWidth * 0.2) : (type === 0 ? 3 : 2);
        
        this.obstacles.push({
            x: this.logicalW + 50,
            y: obsY,
            width: obsWidth,
            height: obsHeight,
            type: type,
            variant: variant,
            hitInset: hitInset,
            passed: false,
            voiceLevel: type === 0 ? 2 : type === 1 ? 1 : 3
        });
    },
    
    createPit() {
        // ── DETERMINISTIC ── seeded RNG supaya sinkron multiplayer
        const pitWidth = 50 + this._rng() * 40;
        // Daftar kata voice challenge — dipilih RANDOM tiap pit (pakai seeded RNG,
        // jadi sinkron antar pemain di room yang sama). Diambil acak dari array
        // SETIAP kali, jadi teks TIDAK AKAN PERNAH HABIS (boleh berulang tanpa batas).
        const textOptions = [
            "LARI", "LONCAT", "BERHENTI", "MAJU", "MUNDUR",
            "KIRI", "KANAN", "CEPAT", "LAMBAT", "PUTAR",
            "TERBANG", "GESER", "HENTI", "DIAM", "AMBIL",
            "MELOMPAT", "JALAN", "DUDUK", "ANGKAT", "BALIK"
        ];
        const text = textOptions[Math.floor(this._rng() * textOptions.length)];
        
        this.activePit = {
            x: this.logicalW + 50,
            width: pitWidth,
            text: text,
            active: true,
            filled: false,
            failed: false,
            charge: 0,          // Akumulasi frame suara keras (volume-based fill)
            fallbackTimer: 0    // Timer auto-fill kalau mic tidak aktif
        };
        
        // 🎤 MEKANIK BARU: cukup TERIAK keras untuk mengisi lubang.
        // Tidak ada teks yang harus dibaca & tidak minta izin mic ulang
        // (mic sudah aktif sejak awal game via startVoiceVolumeDetection).
        if (this.voiceEnabled) {
            const indicator = document.getElementById('voiceIndicator');
            if (indicator) {
                indicator.classList.remove('overlay-hidden');
                document.getElementById('voiceText').textContent = 'TERIAK / BERSUARA KERAS!';
                document.querySelector('.voice-pulse').className = 'voice-pulse listening';
            }
        }
    },
    
    updateObstacles() {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.x -= this.gameSpeed;
            
            // Check collision
            if (!obs.passed && this.checkCollision(obs)) {
                this.playerHit();
                obs.passed = true;
            }
            
            // Score for passing
            if (!obs.passed && obs.x + obs.width < this.player.x) {
                obs.passed = true;
                this.score += 10;
                AudioManager.playSFX('score');
                // Score popup
                this.scorePopups.push({
                    x: obs.x + obs.width / 2,
                    y: this.player.groundY - 60,
                    text: '+10',
                    life: 1,
                    scale: 0.5
                });
            }
            
            // Remove if off screen
            if (obs.x + obs.width < -50) {
                this.obstacles.splice(i, 1);
            }
        }
    },
    
    updatePits() {
        if (!this.activePit) return;
        
        const pit = this.activePit;
        pit.x -= this.gameSpeed;
        if (pit.popTimer > 0) pit.popTimer--;
        
        // 🎤 MEKANIK BARU: isi lubang pakai VOLUME suara (bukan speech-to-text).
        // Kalau mic aktif: tahan suara keras di atas threshold beberapa frame → isi.
        // Kalau mic mati/ditolak: fallback otomatis terisi setelah ~2.5 detik.
        if (!pit.filled && !pit.failed) {
            if (this.voiceEnabled) {
                const vol = this.getVoiceVolume();
                this.voiceVolume = vol;
                // Feedback real-time ke HUD volume bar saat ada pit aktif
                if (vol > 0.06) {
                    this.showVolumeFeedback(vol, vol > 0.25 ? 3 : vol > 0.12 ? 2 : 1);
                }
                if (vol > PIT_VOLUME_THRESHOLD) {
                    pit.charge = (pit.charge || 0) + 1;
                    if (pit.charge >= PIT_CHARGE_FRAMES) {
                        this.fillPit();
                        return;
                    }
                } else {
                    pit.charge = 0;
                }
            } else {
                // Fallback tanpa mikrofon (Firefox/Safari/ditolak): auto-fill
                pit.fallbackTimer = (pit.fallbackTimer || 0) + 1;
                if (pit.fallbackTimer > 150) {
                    this.fillPit();
                    return;
                }
            }
        }
        
        // Remove pit if off screen (without being filled)
        if (pit.x + pit.width < -50) {
            this.activePit = null;
            this.isListening = false;
            document.getElementById('voiceIndicator').classList.add('overlay-hidden');
        }
    },
    
    // ===== VOICE VOLUME JUMP SYSTEM =====
    // Voice volume → tinggi lompatan!
    // Pelan = loncat rendah, Keras = loncat tinggi
    
    voiceJumpCheck() {
        const p = this.player;
        // Jangan lompat lagi kalau sedang di udara
        if (p.isJumping || p.y < p.groundY || p.isCharging) return;
        
        // Cooldown antar lompatan
        if (this.voiceJumpCooldown > 0) {
            this.voiceJumpCooldown--;
            return;
        }
        
        // Baca volume suara dari mic
        const volume = this.getVoiceVolume();
        this.voiceVolume = volume;
        
        // Threshold: minimal volume untuk trigger lompat
        // 0.0-0.06 = silent/ambient noise
        // 0.06-0.12 = quiet → level 1 (spike)
        // 0.12-0.25 = normal → level 2 (box)
        // 0.25+ = loud → level 3 (pillar)
        
        if (volume > 0.06) {
            let level = 1;
            if (volume > 0.12) level = 2;
            if (volume > 0.25) level = 3;
            
            this.performVoiceJump(level);
            this.voiceJumpCooldown = 15;
            
            // Feedback visual: volume meter
            this.showVolumeFeedback(volume, level);
        }
        
        // Fallback: kalau voice tidak aktif, tetap pakai auto-jump
        if (!this.voiceEnabled && !p.isJumping && p.y >= p.groundY) {
            this.fallbackAutoJump();
        }
    },
    
    performVoiceJump(level) {
        const p = this.player;
        p.isJumping = true;
        p.jumpLevel = level;
        p.vy = JUMP_FORCES[level];
        p.stretch = 1.2;
        p.squash = 0.9;
        AudioManager.playSFX('jump');
        this.emitParticles(p.x, p.groundY, 3);
        
        // Visual: level indicator di karakter
        this.scorePopups.push({
            x: p.x,
            y: p.groundY - 80,
            text: level === 1 ? 'Pelan' : level === 2 ? 'Normal' : 'KERAS!',
            life: 0.8,
            scale: 0.4
        });
    },
    
    showVolumeFeedback(volume, level) {
        // Update volume bar di HUD kalau ada
        const bar = document.getElementById('volumeBar');
        if (bar) {
            bar.style.width = Math.min(volume * 100, 100) + '%';
            if (level === 3) bar.style.background = '#ff4444';
            else if (level === 2) bar.style.background = '#ffaa00';
            else bar.style.background = '#44ff44';
        }
        
        // Update label volume (teks saja, icon ada di SVG sprite)
        const label = document.getElementById('volumeLabel');
        if (label) {
            if (volume > 0.25) label.textContent = 'KERAS!';
            else if (volume > 0.12) label.textContent = 'Normal';
            else if (volume > 0.06) label.textContent = 'Pelan';
            else label.textContent = '...';
        }
    },
    
    // Fallback auto-jump kalau mic tidak aktif
    fallbackAutoJump() {
        const p = this.player;
        for (const obs of this.obstacles) {
            if (obs.passed) continue;
            const dist = obs.x - p.x;
            if (dist > 0 && dist < 90) {
                let level = 1;
                if (obs.height > 40) level = 2;
                if (obs.height > 55) level = 3;
                p.isJumping = true;
                p.jumpLevel = level;
                p.vy = JUMP_FORCES[level];
                p.stretch = 1.2;
                p.squash = 0.9;
                return;
            }
        }
    },
    
    // ===== VOICE VOLUME DETECTION (mic continuous) =====
    
    async startVoiceVolumeDetection() {
        // Cek localStorage dulu — minta izin cuma 1x!
        const micPerm = localStorage.getItem('voiceRunner_micPermission');
        if (micPerm === 'denied') {
            this.voiceEnabled = false;
            console.log('Mic permission was denied, using fallback');
            return false;
        }
        
        try {
            // Pastikan AudioContext ada
            if (!AudioManager.audioContext) {
                AudioManager.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (AudioManager.audioContext.state === 'suspended') {
                await AudioManager.audioContext.resume();
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Simpan izin — browser tidak akan minta lagi!
            localStorage.setItem('voiceRunner_micPermission', 'granted');
            
            this.voiceMicStream = stream;
            const source = AudioManager.audioContext.createMediaStreamSource(stream);
            this.voiceAnalyser = AudioManager.audioContext.createAnalyser();
            this.voiceAnalyser.fftSize = 256;
            source.connect(this.voiceAnalyser);
            this.voiceDataArray = new Uint8Array(this.voiceAnalyser.frequencyBinCount);
            
            this.voiceEnabled = true;
            this.micPermissionChecked = true; // izin didapat — jangan tanya ulang
            console.log('🎤 Voice volume detection started!');
            return true;
        } catch(e) {
            console.warn('Mic access failed:', e.message);
            // Hanya cache 'denied' kalau beneran ditolak user, bukan error transien
            // (misal mic sedang dipakai app lain / device tidak ada)
            if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' ||
                      e.name === 'PermissionDeniedError')) {
                localStorage.setItem('voiceRunner_micPermission', 'denied');
            }
            this.micPermissionChecked = true; // sudah dijawab — jangan tanya ulang
            this.voiceEnabled = false;
            return false;
        }
    },
    
    stopVoiceVolumeDetection() {
        if (this.voiceMicStream) {
            this.voiceMicStream.getTracks().forEach(t => t.stop());
            this.voiceMicStream = null;
        }
        this.voiceAnalyser = null;
        this.voiceDataArray = null;
        this.voiceVolume = 0;
    },
    
    getVoiceVolume() {
        if (!this.voiceAnalyser || !this.voiceDataArray) return 0;
        try {
            this.voiceAnalyser.getByteTimeDomainData(this.voiceDataArray);
            let sum = 0;
            for (let i = 0; i < this.voiceDataArray.length; i++) {
                const value = (this.voiceDataArray[i] - 128) / 128;
                sum += Math.abs(value);
            }
            return sum / this.voiceDataArray.length;
        } catch(e) {
            return 0;
        }
    },
    
    // ===== CHECKPOINT SYSTEM =====
    
    saveCheckpoint() {
        this.checkpointDistance = Math.floor(this.distance);
        this.checkpointScore = this.score;
        this.checkpointLives = this.lives;
        
        // Simpan ke localStorage
        const cpData = {
            distance: this.checkpointDistance,
            score: this.checkpointScore,
            lives: this.checkpointLives,
            timestamp: Date.now()
        };
        localStorage.setItem('voiceRunner_checkpoint', JSON.stringify(cpData));
        
        // Simpan juga ke leaderboard (jarak terjauh)
        this.saveCheckpointToLeaderboard();
        
        // Notifikasi visual
        this.showCheckpointNotification();
        AudioManager.playSFX('score');
    },
    
    // ===== LANJUT SETELAH IKLAN (revive di titik kematian) =====
    // User pilih "TONTON IKLAN" di Game Over → lanjut dari jarak & skor SAAT MATI,
    // bukan dari awal. Nyawa dipulihkan penuh, arena di depan dibersihkan biar
    // gak langsung nabrak rintangan yang sama lagi.
    continueFromDeath() {
        // Pulihkan nyawa penuh
        this.lives = this.maxLives;
        
        // Jarak & skor PERTAHANKAN (titik kematian) — jangan reset ke 0!
        // Bersihkan arena di depan player
        this.obstacles = [];
        this.pits = [];
        this.activePit = null;
        this.floatingTexts = [];
        this.particles = [];
        this.jumpTrail = [];
        this.scorePopups = [];
        this.lastObstacleDist = this.distance;
        
        // Reset player
        this.player.y = this.player.groundY;
        this.player.vy = 0;
        this.player.isJumping = false;
        this.player.jumpLevel = 0;
        this.player.squash = 1;
        
        // Hentikan voice recognition lama
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        this.isListening = false;
        document.getElementById('voiceIndicator').classList.add('overlay-hidden');
        
        // Mulai ulang voice volume detection (mic sempat di-stop saat game over)
        this.startVoiceVolumeDetection();
        
        // Musik juga sempat di-stop saat game over — nyalakan lagi
        this.startMusic();
        
        // Sembunyikan layar game over
        document.getElementById('gameOverScreen').classList.add('overlay-hidden');
        
        // Update HUD
        this.updateHUD();
        
        // Kembalikan state ke bermain
        this.state = this.isMultiplayer ? 'multiplayer' : 'solo';
        
        // Restart sinkronisasi multiplayer kalau perlu
        if (this.isMultiplayer && !this.mpUpdateInterval) {
            this.mpUpdateInterval = setInterval(() => this.sendMPUpdate(), 100);
        }
        
        // Mulai ulang game loop (loop berhenti saat state = gameOver)
        requestAnimationFrame((t) => this.gameLoop(t));
        
        console.log('📺 Lanjut dari titik kematian:', Math.floor(this.distance) + 'm');
    },
    
    showCheckpointNotification() {
        const el = document.getElementById('checkpointNotif');
        if (!el) return;
        el.textContent = `CHECKPOINT ${Math.floor(this.checkpointDistance)}m`;
        el.classList.remove('overlay-hidden');
        // Animasi CSS via class
        el.classList.remove('cp-animate');
        // Force reflow
        void el.offsetWidth;
        el.classList.add('cp-animate');
        
        setTimeout(() => {
            el.classList.add('overlay-hidden');
        }, 2000);
    },
    
    saveCheckpointToLeaderboard() {
        let leaderboard = [];
        const saved = localStorage.getItem('voiceRunner_leaderboard');
        if (saved) {
            try { leaderboard = JSON.parse(saved); } catch(e) {}
        }
        
        // Update atau tambah entry untuk checkpoint distance
        const existing = leaderboard.find(e => e.type === 'checkpoint');
        if (existing) {
            if (this.checkpointDistance > existing.distance) {
                existing.distance = this.checkpointDistance;
                existing.score = this.checkpointScore;
                existing.date = Date.now();
            }
        } else {
            leaderboard.push({
                name: 'Checkpoint',
                type: 'checkpoint',
                score: this.checkpointScore,
                distance: this.checkpointDistance,
                date: Date.now()
            });
        }
        
        localStorage.setItem('voiceRunner_leaderboard', JSON.stringify(leaderboard));
    },
    
    // ===== INSTRUCTIONS (1x tampil + tombol ?) =====
    
    showInstructions() {
        const overlay = document.getElementById('instructionsOverlay');
        if (!overlay) return;
        overlay.classList.remove('overlay-hidden');
        overlay.classList.add('overlay-active');
        
        // Pause game jika sedang bermain
        if (this.state === 'solo' || this.state === 'multiplayer') {
            this.state = 'paused';
        }
    },
    
    hideInstructions() {
        const overlay = document.getElementById('instructionsOverlay');
        if (overlay) {
            overlay.classList.add('overlay-hidden');
            overlay.classList.remove('overlay-active');
        }
        
        // Tandai sudah pernah lihat
        localStorage.setItem('voiceRunner_instructionsShown', 'true');
        
        // Jika dari pause, kembali
        if (this.state === 'paused') {
            this.state = this.isMultiplayer ? 'multiplayer' : 'solo';
        } else {
            // Mulai game (dari main menu)
            this.startCountdown();
        }
    },
    
    checkCollision(obs) {
        const p = this.player;
        const px = p.x - p.width / 2;
        const py = p.y - p.height;
        const pw = p.width;
        const ph = p.height;
        
        // Slightly smaller hitbox for fair gameplay
        const margin = 4;
        // Hitbox proporsional bentuk visual (dipakai dari obs.hitInset)
        const hi = obs.hitInset || 0;
        return (
            obs.x + hi + margin < px + pw - margin &&
            obs.x + obs.width - hi - margin > px + margin &&
            obs.y + margin < py + ph - margin &&
            obs.y + obs.height - margin > py + margin
        );
    },
    
    checkPitCollision() {
        if (!this.activePit || !this.activePit.active) return;
        
        const p = this.player;
        const pit = this.activePit;
        
        // Check if player is over the pit and not jumping high enough
        if (p.x + p.width / 2 > pit.x + 10 && p.x - p.width / 2 < pit.x + pit.width - 10) {
            // Player can jump over if high enough
            if (p.y < p.groundY) {
                // Jumping over - safe
                return;
            }
            
            if (!pit.filled && !pit.failed) {
                // Fell into pit
                this.playerHit();
                pit.failed = true;
                pit.active = false;
                if (this.recognition) {
                    try { this.recognition.stop(); } catch(e) {}
                }
                document.getElementById('voiceIndicator').classList.add('overlay-hidden');
            }
        }
    },
    
    // ===== VOICE RECOGNITION =====
    
    checkMicPermission() {
        // ✅ Mic SUDAH aktif dari startVoiceVolumeDetection (game start) → langsung true.
        // JANGAN minta izin ulang setiap ada text voice challenge!
        if (this.voiceEnabled && this.voiceMicStream) return Promise.resolve(true);
        
        // Izin sudah tersimpan di localStorage → pakai hasil itu, jangan tanya lagi
        const micPerm = localStorage.getItem('voiceRunner_micPermission');
        if (micPerm === 'granted') return Promise.resolve(true);
        if (micPerm === 'denied') return Promise.resolve(false);
        
        // Cek apakah mic sudah pernah diizinkan
        if (this.micPermissionChecked) return Promise.resolve(true);
        
        return new Promise((resolve) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                // Browser tidak support
                this.micPermissionChecked = true;
                resolve(false);
                return;
            }
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then((stream) => {
                    // Stop track biar ga boros resource
                    stream.getTracks().forEach(t => t.stop());
                    this.micPermissionChecked = true;
                    // Simpan keputusan — konsisten dengan startVoiceVolumeDetection
                    localStorage.setItem('voiceRunner_micPermission', 'granted');
                    resolve(true);
                })
                .catch((err) => {
                    console.warn('Mic permission denied:', err);
                    this.micPermissionChecked = true;
                    // Hanya cache 'denied' kalau beneran ditolak, bukan error transien
                    // (misal mic sedang dipakai app lain / device tidak ada)
                    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError' ||
                                err.name === 'PermissionDeniedError')) {
                        localStorage.setItem('voiceRunner_micPermission', 'denied');
                    }
                    resolve(false);
                });
        });
    },
    
    showMicPermissionDialog() {
        // Pause game dan tampilkan dialog minta izin mic
        const wasPlaying = this.state === 'solo' || this.state === 'multiplayer';
        if (wasPlaying) {
            this.state = 'paused';
        }
        
        // Tampilkan overlay mic permission
        const overlay = document.getElementById('micPermissionOverlay');
        if (!overlay) return Promise.resolve(false);
        overlay.classList.remove('overlay-hidden');
        
        return new Promise((resolve) => {
            window.__micPermissionResolve = resolve;
        }).then((granted) => {
            overlay.classList.add('overlay-hidden');
            if (wasPlaying && granted) {
                this.state = this.isMultiplayer ? 'multiplayer' : 'solo';
            }
            return granted;
        });
    },
    
    allowMic() {
        // Panggil saat user klik "Izinkan"
        this.checkMicPermission().then((granted) => {
            if (window.__micPermissionResolve) {
                window.__micPermissionResolve(granted);
                window.__micPermissionResolve = null;
            }
        });
    },
    
    denyMic() {
        // Simpan keputusan — jangan minta ulang di text berikutnya
        localStorage.setItem('voiceRunner_micPermission', 'denied');
        if (window.__micPermissionResolve) {
            window.__micPermissionResolve(false);
            window.__micPermissionResolve = null;
        }
    },
    
    startVoiceRecognition(text) {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            // Fallback - auto fill the pit after some time
            console.warn('Speech recognition not supported');
            setTimeout(() => {
                if (this.activePit && !this.activePit.filled && !this.activePit.failed) {
                    this.fillPit();
                }
            }, 3000);
            return;
        }
        
        this.currentVoiceText = text;
        this.isListening = true;
        
        // 🔇 Kalau user sudah pernah menolak → JANGAN tampilkan dialog lagi.
        // Langsung auto-fill (sesuai request: "ketika ada text tidak akan di minta lagi").
        if (localStorage.getItem('voiceRunner_micPermission') === 'denied') {
            console.log('Mic sudah ditolak sebelumnya — auto-fill lubang');
            setTimeout(() => {
                if (this.activePit && !this.activePit.filled && !this.activePit.failed) {
                    this.fillPit();
                }
            }, 2000);
            return;
        }
        
        // Cek izin mic dulu
        this.checkMicPermission().then((granted) => {
            if (!granted) {
                // Pertama kali (belum ada keputusan) → tampilkan dialog izin mic
                return this.showMicPermissionDialog();
            }
            return true;
        }).then((granted) => {
            if (!granted || !this.isListening || !this.activePit) {
                // Mic tidak diizinkan, fallback auto-fill
                setTimeout(() => {
                    if (this.activePit && !this.activePit.filled && !this.activePit.failed) {
                        this.fillPit();
                    }
                }, 2000);
                return;
            }
            
            // Lanjut dengan voice recognition
            this._startListening(text);
        });
    },
    
    _startListening(text) {
        // Show voice indicator
        const indicator = document.getElementById('voiceIndicator');
        indicator.classList.remove('overlay-hidden');
        document.getElementById('voiceText').textContent = 'Ucapkan: "' + text + '"';
        document.querySelector('.voice-pulse').className = 'voice-pulse listening';
        
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'id-ID';
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 3;
            
            // Variabel untuk animasi teks berjalan
            let textAnimOffset = 0;
            
            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript.toLowerCase().trim();
                    
                    // Fuzzy match using Levenshtein distance
                    const match = this.fuzzyMatch(transcript, text.toLowerCase());
                    
                    if (match <= 2) { // Max 2 character difference
                        // Success!
                        this.fillPit();
                        return;
                    }
                }
            };
            
            this.recognition.onerror = (event) => {
                console.warn('Speech error:', event.error);
                if (event.error === 'not-allowed') {
                    // Mic permission denied - fallback
                    document.getElementById('voiceText').textContent = 'Izinkan mic di settings browser';
                    setTimeout(() => {
                        if (this.activePit && !this.activePit.filled && !this.activePit.failed) {
                            this.fillPit();
                        }
                    }, 2000);
                    return;
                }
                // Retry after delay
                setTimeout(() => {
                    if (this.activePit && !this.activePit.filled && !this.activePit.failed) {
                        try { this.recognition.start(); } catch(e) {}
                    }
                }, 500);
            };
            
            this.recognition.onend = () => {
                // Restart if still listening and pit is active (with delay to avoid tight loop)
                if (this.isListening && this.activePit && !this.activePit.filled && !this.activePit.failed) {
                    setTimeout(() => {
                        try { this.recognition.start(); } catch(e) {}
                    }, 300);
                }
            };
            
            this.recognition.start();
        } catch(e) {
            console.warn('Speech recognition error:', e);
        }
    },
    
    fuzzyMatch(str1, str2) {
        // Levenshtein distance
        const m = str1.length;
        const n = str2.length;
        const dp = [];
        
        for (let i = 0; i <= m; i++) {
            dp[i] = [i];
        }
        for (let j = 0; j <= n; j++) {
            dp[0][j] = j;
        }
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }
        
        return dp[m][n];
    },
    
    fillPit() {
        if (!this.activePit) return;
        
        this.activePit.filled = true;
        this.activePit.active = false;
        this.activePit.popTimer = 12; // Animasi balon pecah (mengecil + partikel)
        this.isListening = false;
        
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        
        // Visual feedback
        document.querySelector('.voice-pulse').className = 'voice-pulse success';
        document.getElementById('voiceText').textContent = 'Benar! +50';
        AudioManager.playSFX('voiceSuccess');
        
        // Score bonus
        this.score += 50;
        
        // Emit celebration particles
        this.emitParticles(
            this.activePit.x + this.activePit.width / 2,
            this.player.groundY,
            20
        );
        
        setTimeout(() => {
            document.getElementById('voiceIndicator').classList.add('overlay-hidden');
        }, 1000);
        
        // Remove floating text with animation
        if (this.floatingTexts.length > 0) {
            const ft = this.floatingTexts[this.floatingTexts.length - 1];
            ft.opacity = 0;
            ft.scale = 1.5;
        }
        
        setTimeout(() => {
            this.activePit = null;
        }, 500);
    },
    
    // ===== PARTICLES =====
    
    emitParticles(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y,
                vx: (Math.random() - 0.5) * 5,
                vy: -Math.random() * 5 - 2,
                life: 1,
                decay: 0.02 + Math.random() * 0.02,
                size: 2 + Math.random() * 4
            });
        }
        // Cap jumlah partikel — biar gak numpuk ratusan & bikin HP lemot
        if (this.particles.length > 160) {
            this.particles.splice(0, this.particles.length - 160);
        }
    },
    
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx - this.gameSpeed * 0.3;
            p.y += p.vy;
            p.vy += 0.1;
            p.life -= p.decay;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    },
    
    // ===== FLOATING TEXTS =====
    
    updateFloatingTexts() {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.x -= this.gameSpeed;
            
            if (ft.opacity <= 0 || ft.x + 100 < -50) {
                this.floatingTexts.splice(i, 1);
            }
        }
    },
    
    updateMountains() {
        for (let i = 0; i < this.bgMountains.length; i++) {
            this.bgMountains[i].x -= this.gameSpeed * 0.3;
            if (this.bgMountains[i].x + this.bgMountains[i].width < -50) {
                this.bgMountains[i].x = this.logicalW + Math.random() * 100;
                this.bgMountains[i].height = 60 + Math.random() * 120;
                this.bgMountains[i].width = 200 + Math.random() * 150;
            }
        }
    },
    
    // ===== PLAYER HIT =====
    
    playerHit() {
        this.lives--;
        
        // Screen shake
        this.shakeAmount = 10;
        
        AudioManager.playSFX('hit');
        
        // Flash red particles
        this.emitParticles(this.player.x, this.player.groundY - this.player.height / 2, 10);
        
        this.updateHUD();
        
        if (this.lives <= 0) {
            // Nyawa habis → SELALU tampilkan Game Over (bukan auto-respawn).
            // Lanjut dari titik kematian hanya lewat tombol TONTON IKLAN.
            this.gameOver();
        }
    },
    
    // ===== GAME OVER =====
    
    gameOver() {
        this.state = 'gameOver';
        
        // Stop music
        AudioManager.stopMusic();
        
        // Close voice recognition
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        document.getElementById('voiceIndicator').classList.add('overlay-hidden');
        
        // Stop voice volume detection
        this.stopVoiceVolumeDetection();
        
        // Show game over screen
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('finalDistance').textContent = Math.floor(this.distance) + ' m';
        document.getElementById('gameOverScreen').classList.remove('overlay-hidden');
        
        // Auto-fill name from saved
        const savedName = localStorage.getItem('voiceRunner_playerName');
        if (savedName) {
            document.getElementById('playerName').value = savedName;
        }
        
        // 🏆 Rekor pribadi terbaik (localStorage) untuk tampilan Game Over
        let bestLocal = 0;
        try {
            const savedLb = localStorage.getItem('voiceRunner_leaderboard');
            if (savedLb) {
                const lb = JSON.parse(savedLb);
                const tops = lb.filter(e => e.type !== 'checkpoint').sort((a, b) => b.score - a.score);
                bestLocal = tops.length ? tops[0].score : 0;
            }
        } catch(e) {}
        const bestEl = document.getElementById('finalBest');
        if (bestEl) bestEl.textContent = Math.max(bestLocal, this.score);
        
        // 🌍 Simpan skor ke GLOBAL leaderboard (Firebase, anonymous auth) — best-effort.
        // Tetap simpan ke localStorage juga sebagai cache/fallback offline.
        if (typeof saveGlobalLeaderboard === 'function') {
            saveGlobalLeaderboard(savedName || 'Anonim', this.score, Math.floor(this.distance));
        }
        
        // Clear multiplayer interval
        if (this.mpUpdateInterval) {
            clearInterval(this.mpUpdateInterval);
            this.mpUpdateInterval = null;
        }
        
        // Send final score to multiplayer
        if (this.isMultiplayer) {
            Multiplayer.updatePlayerState(this.score, Math.floor(this.distance), this.lives, false);
        }
    },
    
    saveScoreAndRestart() {
        const name = document.getElementById('playerName').value.trim() || 'Anonim';
        localStorage.setItem('voiceRunner_playerName', name);
        
        // Save to leaderboard
        this.saveToLeaderboard(name, this.score, Math.floor(this.distance));
        
        // 🌍 Simpan juga ke GLOBAL leaderboard (Firebase) — best-effort
        if (typeof saveGlobalLeaderboard === 'function') {
            saveGlobalLeaderboard(name, this.score, Math.floor(this.distance));
        }
        
        // Reset and play again
        document.getElementById('gameOverScreen').classList.add('overlay-hidden');
        this.resetGame();
        this.startCountdown();
    },
    
    saveToLeaderboard(name, score, distance) {
        let leaderboard = [];
        const saved = localStorage.getItem('voiceRunner_leaderboard');
        if (saved) {
            try { leaderboard = JSON.parse(saved); } catch(e) {}
        }
        
        leaderboard.push({
            name: name,
            score: score,
            distance: distance,
            date: Date.now()
        });
        
        // Sort by score descending
        leaderboard.sort((a, b) => b.score - a.score);
        
        // Keep top 20
        if (leaderboard.length > 20) {
            leaderboard = leaderboard.slice(0, 20);
        }
        
        localStorage.setItem('voiceRunner_leaderboard', JSON.stringify(leaderboard));
    },
    
    // ===== HUD =====
    
    updateHUD() {
        // Nyawa pakai SVG heart (bukan emoji)
        const livesEl = document.getElementById('livesDisplay');
        if (livesEl) {
            const hearts = Math.max(0, this.lives);
            if (hearts > 0) {
                livesEl.innerHTML = '<svg class="life-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-heart"/></svg>'.repeat(hearts);
            } else {
                livesEl.innerHTML = '<svg class="life-icon dead" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-skull"/></svg>';
            }
        }
        document.getElementById('scoreDisplay').textContent = 'Skor: ' + this.score;
        document.getElementById('distanceDisplay').textContent = Math.floor(this.distance) + ' m';
    },
    
    // ===== RENDER =====
    
    render() {
        const ctx = this.ctx;
        const w = this._w || this.canvas.width;
        const h = this._h || this.canvas.height;
        
        // Screen shake
        ctx.save();
        if (this.shakeAmount > 0) {
            ctx.translate(
                (Math.random() - 0.5) * this.shakeAmount,
                (Math.random() - 0.5) * this.shakeAmount
            );
        }
        
        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        
        // Draw background
        this.drawBackground(ctx, w, h);
        
        // Draw ground
        this.drawGround(ctx, w, h);
        
        // Draw floating texts
        this.drawFloatingTexts(ctx);
        
        // Draw pits
        this.drawPits(ctx);
        
        // Draw obstacles
        this.drawObstacles(ctx);
        
        // Draw player
        this.drawPlayer(ctx);
        
        // Draw particles
        this.drawParticles(ctx);
        
        // Draw score popups
        this.drawScorePopups(ctx);
        
        // Draw multiplayer players
        if (this.isMultiplayer) {
            this.drawMultiplayerPlayers(ctx);
        }
        
        ctx.restore();
    },
    
    drawBackground(ctx, w, h) {
        // ===== SISTEM 5 TEMA — TRANSISI REAL-TIME =====
        // Tema berubah mulus mengikuti jarak (distance), bukan lompatan mendadak:
        // City → Forest → Night → Morning → Sore → ulang, tiap 800m,
        // dengan zona transisi 180m yang meng-crossfade ke tema berikutnya.
        // DEV: set THEME_PREVIEW_SPEED = 10 di console utk preview transisi cepat.
        // Pakai themeDistance (bukan distance) supaya tema TIDAK lompat balik
        // saat respawn di checkpoint — themeDistance tidak di-rewind.
        const blend = this.getThemeBlend();
        this.currentTheme = blend.currentTheme;
        this.nextTheme = blend.nextTheme;
        this.blendProgress = blend.blendProgress;
        const t = blend.blendProgress;
        
        // 1) Langit: interpolasi per-channel RGB antar 2 tema (bukan numpuk layer transparan)
        this.drawSkyGradient(ctx, w, h, THEMES[blend.currentTheme], THEMES[blend.nextTheme], t);
        
        // 2) Elemen tema sekarang (alpha 1-t)
        this.drawThemeScene(ctx, w, h, blend.currentTheme, 1 - t, true);
        
        // 3) Elemen tema berikutnya ditumpuk di atasnya (alpha t) → crossfade halus
        if (t > 0.01) {
            this.drawThemeScene(ctx, w, h, blend.nextTheme, t, true);
        }
    },
    
    // ===== THEME HELPERS =====
    
    getThemeBlend(distance) {
        const totalCycle = THEME_LENGTH * THEME_CYCLE.length;
        // Preview: ubah di console `Game.themePreviewSpeed = 10` utk transisi cepat
        const speed = (this.themePreviewSpeed !== undefined) ? this.themePreviewSpeed : THEME_PREVIEW_SPEED;
        const d = (distance !== undefined) ? distance : this.themeDistance;
        const pos = (d * speed) % totalCycle;
        const themeIndex = Math.floor(pos / THEME_LENGTH);
        const inTheme = pos - themeIndex * THEME_LENGTH;
        const currentTheme = THEME_CYCLE[themeIndex];
        const nextTheme = THEME_CYCLE[(themeIndex + 1) % THEME_CYCLE.length];
        
        // Zona transisi: 180m terakhir tiap tema → crossfade bertahap
        let blendProgress = 0;
        if (inTheme > THEME_LENGTH - THEME_BLEND_ZONE) {
            blendProgress = (inTheme - (THEME_LENGTH - THEME_BLEND_ZONE)) / THEME_BLEND_ZONE;
        }
        return { currentTheme, nextTheme, blendProgress };
    },
    
    hexToRgb(hex) {
        const m = hex.replace('#', '');
        return [
            parseInt(m.substr(0, 2), 16),
            parseInt(m.substr(2, 2), 16),
            parseInt(m.substr(4, 2), 16)
        ];
    },
    
    lerpRgb(c1, c2, t) {
        const r1 = this.hexToRgb(c1);
        const r2 = this.hexToRgb(c2);
        const r = Math.round(r1[0] + (r2[0] - r1[0]) * t);
        const g = Math.round(r1[1] + (r2[1] - r1[1]) * t);
        const b = Math.round(r1[2] + (r2[2] - r1[2]) * t);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    },
    
    drawSkyGradient(ctx, w, h, th1, th2, t) {
        // Interpolasi per-channel: langit berubah warna pelan-pelan,
        // bukan cross-fade 2 layer terpisah (deterministic per jarak).
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        for (let i = 0; i < 3; i++) {
            grad.addColorStop(i / 2, this.lerpRgb(th1.sky[i], th2.sky[i], t));
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    },
    
    drawThemeScene(ctx, w, h, themeName, alpha, skipSky) {
        ctx.save();
        ctx.globalAlpha = alpha;
        switch (themeName) {
            case 'city':    this.drawCityTheme(ctx, w, h, skipSky); break;
            case 'forest':  this.drawForestTheme(ctx, w, h, skipSky); break;
            case 'night':   this.drawNightTheme(ctx, w, h, skipSky); break;
            case 'morning': this.drawMorningTheme(ctx, w, h, skipSky); break;
            case 'sore':    this.drawSoreTheme(ctx, w, h, skipSky); break;
            default:        this.drawNightTheme(ctx, w, h, skipSky);
        }
        ctx.restore();
    },
    
    drawThemeSky(ctx, w, h, th) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        for (let i = 0; i < 3; i++) {
            grad.addColorStop(i / 2, th.sky[i]);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    },
    
    drawThemeStars(ctx, w, th) {
        if (th.stars <= 0) return;
        const base = ctx.globalAlpha;
        for (const star of this.bgStars) {
            const twinkle = 0.7 + Math.sin(this.frameCount * star.twinkleSpeed) * 0.3;
            ctx.globalAlpha = base * th.stars * star.brightness * twinkle;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(
                ((star.x - this.distance * 0.05) % (w + 100) + w + 100) % (w + 100) - 50,
                star.y,
                star.size,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        ctx.globalAlpha = base;
    },
    
    drawThemeClouds(ctx, w, th) {
        if (!th.clouds) return;
        const base = ctx.globalAlpha;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 0; i < 5; i++) {
            const cx = ((i * 280 + 60 - this.distance * 0.03) % (w + 300) + w + 300) % (w + 300) - 150;
            const cy = 50 + (i % 3) * 45 + Math.sin(i * 2.4) * 12;
            ctx.globalAlpha = base * 0.45;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 60, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx + 32, cy - 9, 42, 12, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = base;
    },
    
    drawThemeSun(ctx, w, h, th) {
        if (!th.sun || th.sun.alpha <= 0) return;
        const base = ctx.globalAlpha;
        const s = th.sun;
        const sx = w * 0.72;
        // Matahari terbit/terbenam: pusat digeser ke garis horizon biar benar-benar
        // "setengah muncul"/"tenggelam" (bukan melayang di tengah langit).
        let sy = h * s.y;
        if (s.clip) {
            sy = this.player.groundY - s.size * 0.35;
        }
        ctx.save();
        ctx.globalAlpha = base * s.alpha;
        if (s.clip) {
            // Potong di garis horizon → tampak setengah terbenam
            ctx.beginPath();
            ctx.rect(0, 0, w, this.player.groundY);
            ctx.clip();
        }
        // Halo lembut
        const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, s.size * 2.4);
        halo.addColorStop(0, 'rgba(255,245,210,0.5)');
        halo.addColorStop(1, 'rgba(255,245,210,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(sx - s.size * 2.4, sy - s.size * 2.4, s.size * 4.8, s.size * 4.8);
        // Badan matahari
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath();
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },
    
    drawThemeMoon(ctx, w, h, th) {
        if (!th.moon || th.moon.alpha <= 0) return;
        const base = ctx.globalAlpha;
        const m = th.moon;
        const mx = w * 0.78;
        const my = h * m.y;
        ctx.save();
        ctx.globalAlpha = base * m.alpha;
        // Halo bulan pakai radial gradient (murah) — bukan shadowBlur (mahal per-frame)
        const halo = ctx.createRadialGradient(mx, my, m.size * 0.5, mx, my, m.size * 2.2);
        halo.addColorStop(0, 'rgba(230,235,255,0.35)');
        halo.addColorStop(1, 'rgba(230,235,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(mx - m.size * 2.2, my - m.size * 2.2, m.size * 4.4, m.size * 4.4);
        ctx.fillStyle = '#f5f7ff';
        ctx.beginPath();
        ctx.arc(mx, my, m.size, 0, Math.PI * 2);
        ctx.fill();
        // Kawah sederhana
        ctx.fillStyle = 'rgba(200,210,235,0.4)';
        ctx.beginPath(); ctx.arc(mx - 9, my - 5, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 8, my + 7, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 2, my + 11, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },
    
    drawThemeMountains(ctx, w, th) {
        if (th.mountains <= 0) return;
        const base = ctx.globalAlpha;
        ctx.save();
        ctx.globalAlpha = base * th.mountains;
        ctx.fillStyle = th.mountainsColor;
        for (const mtn of this.bgMountains) {
            const mx = ((mtn.x - this.distance * 0.05) % (w + 300) + w + 300) % (w + 300) - 150;
            ctx.beginPath();
            ctx.moveTo(mx, this.player.groundY);
            ctx.lineTo(mx + mtn.width / 2, this.player.groundY - mtn.height);
            ctx.lineTo(mx + mtn.width, this.player.groundY);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    },
    
    drawThemeBuildings(ctx, w, th) {
        if (th.buildings <= 0) return;
        const base = ctx.globalAlpha;
        ctx.save();
        ctx.globalAlpha = base * th.buildings;
        ctx.fillStyle = th.buildingColor;
        const buildings = 14;
        for (let i = 0; i < buildings; i++) {
            const bx = ((i * (w / buildings) + 50 - this.distance * 0.1) % (w + 200) + w + 200) % (w + 200) - 100;
            const bh = 50 + Math.sin(i * 2.5) * 30 + (i % 4) * 12;
            const bw = 30 + Math.sin(i * 1.7) * 14;
            ctx.fillRect(bx, this.player.groundY - bh, bw, bh);
            // Jendela sederhana
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            for (let wy = 8; wy < bh - 10; wy += 14) {
                ctx.fillRect(bx + 4, this.player.groundY - bh + wy, 5, 6);
            }
            ctx.fillStyle = th.buildingColor;
        }
        ctx.restore();
    },
    
    drawThemeTrees(ctx, w, th) {
        if (th.trees <= 0) return;
        const base = ctx.globalAlpha;
        ctx.save();
        ctx.globalAlpha = base * th.trees;
        const trees = 12;
        for (let i = 0; i < trees; i++) {
            const tx = ((i * (w / trees) + 40 - this.distance * 0.1) % (w + 200) + w + 200) % (w + 200) - 100;
            const tht = 70 + Math.sin(i * 2.1) * 20 + (i % 3) * 10;
            const tw = 26 + Math.sin(i * 1.3) * 8;
            // Batang
            ctx.fillStyle = '#5a3d22';
            ctx.fillRect(tx - 3, this.player.groundY - tht * 0.35, 6, tht * 0.35);
            // Daun (segitiga bertumpuk)
            ctx.fillStyle = th.buildingColor;
            ctx.beginPath();
            ctx.moveTo(tx - tw, this.player.groundY - tht * 0.45);
            ctx.lineTo(tx, this.player.groundY - tht);
            ctx.lineTo(tx + tw, this.player.groundY - tht * 0.45);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(tx - tw * 0.7, this.player.groundY - tht * 0.2);
            ctx.lineTo(tx, this.player.groundY - tht * 0.55);
            ctx.lineTo(tx + tw * 0.7, this.player.groundY - tht * 0.2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    },
    
    drawThemeGlow(ctx, w, h, th) {
        // Skip ambient glow full-screen di device low-power (radial gradient
        // sebesar layar itu operasi mahal banget di GPU mobile).
        // HP flagship (IS_MOBILE tapi bukan LOW_POWER) tetap dapat glow.
        if (LOW_POWER) return;
        const base = ctx.globalAlpha;
        const glowPulse = 0.3 + Math.sin(this.frameCount * 0.02) * 0.15;
        const ambientGrad = ctx.createRadialGradient(
            w * 0.5, this.player.groundY + 50, 10,
            w * 0.5, this.player.groundY + 50, h * 0.6
        );
        ambientGrad.addColorStop(0, `rgba(${th.glow.color}, ${glowPulse * th.glow.strength * base})`);
        ambientGrad.addColorStop(0.5, `rgba(${th.glow.color}, ${glowPulse * th.glow.strength * 0.5 * base})`);
        ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ambientGrad;
        ctx.fillRect(0, 0, w, h);
    },
    
    // ===== 5 FUNGSI TEMA =====
    // Masing-masing pakai teknik yang sama (canvas primitives + parallax distance),
    // cuma komposisi elemen & palet warnanya yang berbeda.
    
    drawCityTheme(ctx, w, h, skipSky) {
        const th = THEMES.city;
        if (!skipSky) this.drawThemeSky(ctx, w, h, th);
        this.drawThemeClouds(ctx, w, th);
        this.drawThemeSun(ctx, w, h, th);
        this.drawThemeBuildings(ctx, w, th);
        this.drawThemeGlow(ctx, w, h, th);
    },
    
    drawForestTheme(ctx, w, h, skipSky) {
        const th = THEMES.forest;
        if (!skipSky) this.drawThemeSky(ctx, w, h, th);
        this.drawThemeClouds(ctx, w, th);
        this.drawThemeSun(ctx, w, h, th);
        this.drawThemeMountains(ctx, w, th);
        this.drawThemeTrees(ctx, w, th);
        this.drawThemeGlow(ctx, w, h, th);
    },
    
    drawNightTheme(ctx, w, h, skipSky) {
        const th = THEMES.night;
        if (!skipSky) this.drawThemeSky(ctx, w, h, th);
        this.drawThemeStars(ctx, w, th);
        this.drawThemeMoon(ctx, w, h, th);
        this.drawThemeMountains(ctx, w, th);
        this.drawThemeBuildings(ctx, w, th);
        this.drawThemeGlow(ctx, w, h, th);
    },
    
    drawMorningTheme(ctx, w, h, skipSky) {
        const th = THEMES.morning;
        if (!skipSky) this.drawThemeSky(ctx, w, h, th);
        this.drawThemeStars(ctx, w, th);
        this.drawThemeClouds(ctx, w, th);
        this.drawThemeSun(ctx, w, h, th);
        this.drawThemeMountains(ctx, w, th);
        this.drawThemeBuildings(ctx, w, th);
        this.drawThemeGlow(ctx, w, h, th);
    },
    
    drawSoreTheme(ctx, w, h, skipSky) {
        const th = THEMES.sore;
        if (!skipSky) this.drawThemeSky(ctx, w, h, th);
        this.drawThemeStars(ctx, w, th);
        this.drawThemeSun(ctx, w, h, th);
        this.drawThemeMountains(ctx, w, th);
        this.drawThemeBuildings(ctx, w, th);
        this.drawThemeGlow(ctx, w, h, th);
    },
    
    // ===== ADAPTASI WARNA KARAKTER & RINTANGAN PER TEMA =====
    
    // Seberapa gelap tema aktif (0 = terang, 1 = gelap) — dipakai utk kontras outline
    getThemeDarkness() {
        // Pakai state yang sudah di-set drawBackground (single source of truth)
        const cur = THEMES[this.currentTheme] || THEMES.night;
        const nxt = THEMES[this.nextTheme] || THEMES.night;
        const d1 = cur.isDark ? 1 : 0;
        const d2 = nxt.isDark ? 1 : 0;
        return d1 + (d2 - d1) * (this.blendProgress || 0);
    },
    
    // Outline karakter: tema terang (d≈0) → outline gelap, tema gelap (d≈1) → outline terang
    getPlayerOutlineColor() {
        const d = this.getThemeDarkness();
        const r = Math.round(10 + 235 * d);
        const g = Math.round(20 + 230 * d);
        const b = Math.round(40 + 215 * d);
        return 'rgba(' + r + ',' + g + ',' + b + ',0.85)';
    },
    
    // Outline rintangan: tema terang → outline gelap, tema gelap → outline terang
    getObstacleOutlineColor() {
        const d = this.getThemeDarkness();
        const r = Math.round(10 + 240 * d);
        const g = Math.round(20 + 230 * d);
        const b = Math.round(40 + 215 * d);
        return 'rgba(' + r + ',' + g + ',' + b + ',0.5)';
    },
    
    drawGround(ctx, w, h) {
        const gy = this.player.groundY;
        
        ctx.save();
        
        // Neon glow di garis ground
        const groundGlow = ctx.createLinearGradient(0, gy - 4, 0, gy + 4);
        groundGlow.addColorStop(0, 'rgba(100, 200, 255, 0)');
        groundGlow.addColorStop(0.5, 'rgba(100, 200, 255, 0.4)');
        groundGlow.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = groundGlow;
        ctx.fillRect(0, gy - 4, w, 8);
        
        // Main ground line (neon blue) — glow via gradient band di atas, tanpa shadowBlur
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Running track marks (neon)
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.12)';
        ctx.lineWidth = 2;
        for (let i = -30; i < w + 30; i += 30) {
            const gx = i + this.groundX;
            const alpha = 0.05 + Math.sin(i * 0.3) * 0.03;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(gx, gy - 2);
            ctx.lineTo(gx + 8, gy + 6);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        
        // Track line markings (dashed guide line)
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([15, 25]);
        ctx.beginPath();
        ctx.moveTo(0, gy - 30);
        ctx.lineTo(w, gy - 30);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.restore();
        
        // Speed lines at high speed (cyan/blue)
        if (this.gameSpeed > 7) {
            ctx.save();
            const intensity = (this.gameSpeed - 7) / 7;
            ctx.globalAlpha = intensity * 0.4;
            for (let i = 0; i < 10 + Math.floor(intensity * 5); i++) {
                const lx = (Math.random() * w + this.frameCount * 3) % (w + 100) - 50;
                const ly = gy - 20 - Math.random() * h * 0.5;
                const len = 20 + Math.random() * 40;
                ctx.strokeStyle = `rgba(100, 200, 255, ${0.1 + Math.random() * 0.2})`;
                ctx.lineWidth = 1 + Math.random() * 2;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(lx - len, ly - Math.random() * 5);
                ctx.stroke();
            }
            ctx.restore();
        }
    },
    
    // Siluet karakter (untuk outline kontras per tema)
    drawRunnerSilhouette(ctx, bounce, legSwing, armSwing) {
        // Badan
        ctx.fillRect(-6, -36 + bounce, 12, 20);
        // Kepala
        ctx.beginPath();
        ctx.arc(0, -42 + bounce, 9, 0, Math.PI * 2);
        ctx.fill();
        // Lengan kiri
        ctx.save();
        ctx.translate(-4, -32 + bounce);
        ctx.rotate(armSwing * 0.03);
        ctx.fillRect(-10, 0, 4, 13);
        ctx.fillRect(-10, 11, 4, 3);
        ctx.restore();
        // Lengan kanan
        ctx.save();
        ctx.translate(4, -32 + bounce);
        ctx.rotate(-armSwing * 0.03);
        ctx.fillRect(6, 0, 4, 13);
        ctx.fillRect(6, 11, 4, 3);
        ctx.restore();
        // Kaki kiri
        ctx.save();
        ctx.translate(-4, -17 + bounce);
        ctx.rotate(legSwing * 0.04);
        ctx.fillRect(-5, 0, 5, 15);
        ctx.fillRect(-6, 13, 7, 4);
        ctx.restore();
        // Kaki kanan
        ctx.save();
        ctx.translate(4, -17 + bounce);
        ctx.rotate(-legSwing * 0.04);
        ctx.fillRect(0, 0, 5, 15);
        ctx.fillRect(-1, 13, 7, 4);
        ctx.restore();
    },
    
    drawPlayer(ctx) {
        const p = this.player;
        const px = p.x;
        const py = p.y;
        
        ctx.save();
        
        // === JUMP TRAIL (siluet di belakang karakter) ===
        for (let i = this.jumpTrail.length - 1; i >= 0; i--) {
            const t = this.jumpTrail[i];
            ctx.save();
            ctx.globalAlpha = t.life * 0.2;
            ctx.fillStyle = '#64c8ff';
            ctx.shadowBlur = 0;
            const ts = 1 / t.squash * t.stretch;
            ctx.translate(t.x, t.y);
            ctx.scale(ts * (0.5 + t.life * 0.3), t.squash * (0.5 + t.life * 0.3));
            // Body trail
            ctx.fillRect(-4, -30, 8, 14);
            // Head trail
            ctx.beginPath();
            ctx.arc(0, -36, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        // Apply squash and stretch
        const sw = 1 / p.squash * p.stretch;
        const sh = p.squash / p.stretch;
        
        ctx.translate(px, py);
        ctx.scale(sw, sh);
        
        const runCycle = p.isJumping ? 0 : (p.animFrame / 6) * Math.PI * 2;
        const bounce = p.isJumping ? 0 : Math.abs(Math.sin(runCycle)) * 3;
        const legSwing = Math.sin(runCycle) * 8;
        const armSwing = Math.sin(runCycle + Math.PI) * 8;
        
        // === OUTLINE KONTRAST PER TEMA ===
        // Siluet sedikit lebih besar di belakang karakter — warna outline menyesuaikan
        // tema aktif: gelap di tema terang (City/Morning), terang di tema gelap (Night).
        ctx.save();
        ctx.fillStyle = this.getPlayerOutlineColor();
        ctx.scale(1.07, 1.07);
        this.drawRunnerSilhouette(ctx, bounce, legSwing, armSwing);
        ctx.restore();
        
        // === RUNNING TRAIL ===
        if (!p.isJumping) {
            ctx.save();
            for (let i = 1; i <= 4; i++) {
                const trailAlpha = 0.08 / i;
                const trailOffset = i * 10 + this.frameCount % 3;
                ctx.globalAlpha = trailAlpha;
                ctx.fillStyle = '#64c8ff';
                ctx.shadowBlur = 0;
                ctx.fillRect(-15 - trailOffset, -5 + Math.sin(runCycle + i) * 2, 6 + i * 2, 3);
            }
            ctx.restore();
        }
        
        // === SPEED TRAIL (saat lari kencang) ===
        if (this.gameSpeed > 7 && !p.isJumping) {
            ctx.save();
            const intensity = (this.gameSpeed - 7) / 7;
            ctx.globalAlpha = intensity * 0.3;
            for (let i = 0; i < 3; i++) {
                const tx = -20 - Math.random() * 30;
                const ty = -10 + Math.random() * 20;
                ctx.fillStyle = 'rgba(100, 200, 255, 0.5)';
                ctx.beginPath();
                ctx.arc(tx, ty, 2 + Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        // === GLOW INTI (dinonaktifkan utk performa — outline kontras per tema sudah cukup) ===
        ctx.shadowBlur = 0;
        
        // === BADAN (TORSO) ===
        const gradBody = ctx.createLinearGradient(0, -35 + bounce, 0, -17 + bounce);
        gradBody.addColorStop(0, '#8ad4ff');
        gradBody.addColorStop(0.5, '#ffffff');
        gradBody.addColorStop(1, '#8ad4ff');
        ctx.fillStyle = gradBody;
        ctx.fillRect(-6, -36 + bounce, 12, 20);
        
        // Detail badan — garis tengah
        ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.fillRect(-1, -34 + bounce, 2, 16);
        
        // === KEPALA ===
        ctx.shadowBlur = 0;
        const gradHead = ctx.createRadialGradient(0, -42 + bounce, 2, 0, -42 + bounce, 9);
        gradHead.addColorStop(0, '#ffffff');
        gradHead.addColorStop(0.7, '#c0e8ff');
        gradHead.addColorStop(1, '#8ad4ff');
        ctx.fillStyle = gradHead;
        ctx.beginPath();
        ctx.arc(0, -42 + bounce, 9, 0, Math.PI * 2);
        ctx.fill();
        
        // Mata (visor glow)
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
        ctx.fillRect(-4, -44 + bounce, 8, 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(-3, -44 + bounce, 6, 1);
        
        // === LENGAN ===
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#8ad4ff';
        
        // Lengan kiri
        ctx.save();
        ctx.translate(-4, -32 + bounce);
        ctx.rotate(armSwing * 0.03);
        ctx.fillRect(-10, 0, 4, 13);
        // Tangan
        ctx.fillStyle = '#64c8ff';
        ctx.fillRect(-10, 11, 4, 3);
        ctx.restore();
        
        // Lengan kanan
        ctx.save();
        ctx.translate(4, -32 + bounce);
        ctx.rotate(-armSwing * 0.03);
        ctx.fillStyle = '#8ad4ff';
        ctx.fillRect(6, 0, 4, 13);
        ctx.fillStyle = '#64c8ff';
        ctx.fillRect(6, 11, 4, 3);
        ctx.restore();
        
        // === KAKI ===
        ctx.shadowBlur = 0;
        
        // Kaki kiri
        ctx.save();
        ctx.translate(-4, -17 + bounce);
        ctx.rotate(legSwing * 0.04);
        ctx.fillStyle = '#7ac0ee';
        ctx.fillRect(-5, 0, 5, 15);
        // Sepatu
        ctx.fillStyle = '#5ab0dd';
        ctx.fillRect(-6, 13, 7, 4);
        ctx.restore();
        
        // Kaki kanan
        ctx.save();
        ctx.translate(4, -17 + bounce);
        ctx.rotate(-legSwing * 0.04);
        ctx.fillStyle = '#7ac0ee';
        ctx.fillRect(0, 0, 5, 15);
        ctx.fillStyle = '#5ab0dd';
        ctx.fillRect(-1, 13, 7, 4);
        ctx.restore();
        
        // === JUMP PARTICLES (lingkaran di kaki saat lompat) ===
        if (p.isJumping && p.vy < 0) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.3 + Math.random() * 0.2;
            ctx.fillStyle = '#64c8ff';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(-4 + Math.random() * 8, 2 + Math.random() * 4, 1.5 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        ctx.restore();
    },
    
    // Path spike sesuai variant (dipakai untuk fill & outline biar konsisten)
    traceSpikePath(ctx, ox, oy, ow, oh, v) {
        if (v === 1) {
            // Zigzag 3 spike kecil
            ctx.moveTo(ox, oy + oh);
            const n = 3;
            for (let i = 0; i < n; i++) {
                const sx = ox + (ow / n) * i;
                ctx.lineTo(sx + ow / (n * 2), oy + oh * 0.25);
                ctx.lineTo(sx + ow / n, oy + oh);
            }
            ctx.closePath();
        } else if (v === 2) {
            // Spike lebar dengan alas trapesium
            ctx.moveTo(ox + ow * 0.12, oy + oh);
            ctx.lineTo(ox + ow / 2, oy);
            ctx.lineTo(ox + ow * 0.88, oy + oh);
            ctx.lineTo(ox + ow, oy + oh);
            ctx.lineTo(ox, oy + oh);
            ctx.closePath();
        } else {
            // Segitiga tunggal
            ctx.moveTo(ox, oy + oh);
            ctx.lineTo(ox + ow / 2, oy);
            ctx.lineTo(ox + ow, oy + oh);
            ctx.closePath();
        }
    },
    
    drawObstacles(ctx) {
        const pulse = Math.sin(this.frameCount * 0.05) * 0.15 + 0.85; // Pulse animasi
        // Hitung sekali di luar loop (bukan per-objek)
        const obsOutline = this.getObstacleOutlineColor();
        
        for (const obs of this.obstacles) {
            ctx.save();
            
            const ox = obs.x;
            const oy = obs.y;
            const ow = obs.width;
            const oh = obs.height;
            
            // === GLOW BASE (dihapus utk performa — solid + outline sudah kontras) ===
            ctx.shadowBlur = 0;
            
            switch(obs.type) {
                case 0: // Box — neon crate (variant dekorasi: X / stripes / diagonal+bolt)
                    // Gradient body
                    const boxGrad = ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
                    boxGrad.addColorStop(0, '#ff8c42');
                    boxGrad.addColorStop(0.5, '#ff6b35');
                    boxGrad.addColorStop(1, '#e05220');
                    ctx.fillStyle = boxGrad;
                    ctx.fillRect(ox, oy, ow, oh);
                    
                    // Border dalam
                    ctx.strokeStyle = `rgba(255, 200, 150, ${0.3 * pulse})`;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(ox + 3, oy + 3, ow - 6, oh - 6);
                    
                    // Dekorasi per variant (deterministic dari seed)
                    const boxV = obs.variant || 0;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * pulse})`;
                    ctx.lineWidth = 1;
                    if (boxV === 0) {
                        // X mark
                        ctx.beginPath();
                        ctx.moveTo(ox + 5, oy + 5);
                        ctx.lineTo(ox + ow - 5, oy + oh - 5);
                        ctx.moveTo(ox + ow - 5, oy + 5);
                        ctx.lineTo(ox + 5, oy + oh - 5);
                        ctx.stroke();
                    } else if (boxV === 1) {
                        // Stripes horizontal
                        for (let sy = oy + oh / 3; sy < oy + oh - 4; sy += 6) {
                            ctx.beginPath();
                            ctx.moveTo(ox + 4, sy);
                            ctx.lineTo(ox + ow - 4, sy);
                            ctx.stroke();
                        }
                    } else {
                        // Diagonal + corner bolts
                        ctx.beginPath();
                        ctx.moveTo(ox + 4, oy + 4);
                        ctx.lineTo(ox + ow - 4, oy + oh - 4);
                        ctx.stroke();
                        ctx.fillStyle = `rgba(255,255,255,${0.35 * pulse})`;
                        ctx.fillRect(ox + 3, oy + 3, 3, 3);
                        ctx.fillRect(ox + ow - 6, oy + 3, 3, 3);
                        ctx.fillRect(ox + 3, oy + oh - 6, 3, 3);
                        ctx.fillRect(ox + ow - 6, oy + oh - 6, 3, 3);
                    }
                    break;
                    
                case 1: // Spike — neon red (variant: segitiga / zigzag 3 / trapesium)
                    const spikeGrad = ctx.createLinearGradient(ox, oy + oh, ox + ow / 2, oy);
                    spikeGrad.addColorStop(0, '#ff4444');
                    spikeGrad.addColorStop(0.5, '#ff6666');
                    spikeGrad.addColorStop(1, '#ff8888');
                    ctx.fillStyle = spikeGrad;
                    const spV = obs.variant || 0;
                    ctx.beginPath();
                    this.traceSpikePath(ctx, ox, oy, ow, oh, spV);
                    ctx.fill();
                    
                    // Garis tengah (hanya variant segitiga/trapesium)
                    if (spV !== 1) {
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * pulse})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(ox + ow / 2, oy + 3);
                        ctx.lineTo(ox + ow / 2, oy + oh - 3);
                        ctx.stroke();
                    }
                    break;
                    
                case 2: // Pillar — neon purple (variant: 1 garis / 2 garis+band / antena)
                    const pillarGrad = ctx.createLinearGradient(ox + 2, oy, ox + ow - 2, oy + oh);
                    pillarGrad.addColorStop(0, '#8b5cf6');
                    pillarGrad.addColorStop(0.5, '#a78bfa');
                    pillarGrad.addColorStop(1, '#7c3aed');
                    ctx.fillStyle = pillarGrad;
                    ctx.fillRect(ox + 2, oy, ow - 4, oh);
                    
                    // Top cap
                    ctx.fillStyle = `rgba(167, 139, 250, ${0.6 * pulse})`;
                    ctx.fillRect(ox, oy - 4, ow, 6);
                    
                    // Detail per variant
                    const pV = obs.variant || 0;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * pulse})`;
                    ctx.lineWidth = 1;
                    if (pV === 0) {
                        ctx.beginPath();
                        ctx.moveTo(ox + ow / 2, oy + 5);
                        ctx.lineTo(ox + ow / 2, oy + oh - 5);
                        ctx.stroke();
                    } else if (pV === 1) {
                        // Dua garis vertikal + band tengah
                        for (const px2 of [ow * 0.33, ow * 0.66]) {
                            ctx.beginPath();
                            ctx.moveTo(ox + px2, oy + 5);
                            ctx.lineTo(ox + px2, oy + oh - 5);
                            ctx.stroke();
                        }
                        ctx.fillStyle = `rgba(167, 139, 250, ${0.25 * pulse})`;
                        ctx.fillRect(ox + 1, oy + oh * 0.45, ow - 2, 4);
                    } else {
                        // Antena di atas
                        ctx.beginPath();
                        ctx.moveTo(ox + ow / 2, oy - 4);
                        ctx.lineTo(ox + ow / 2, oy - 14);
                        ctx.stroke();
                        ctx.fillStyle = `rgba(167, 139, 250, ${0.5 * pulse})`;
                        ctx.beginPath();
                        ctx.arc(ox + ow / 2, oy - 16, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
            }
            
            // === OUTLINE KONTRAST PER TEMA ===
            // Biar rintangan tetap kebaca jelas di kelima tema (gelap/terang)
            ctx.shadowBlur = 0;
            ctx.strokeStyle = obsOutline;
            ctx.lineWidth = 2;
            switch(obs.type) {
                case 0: // Box
                    ctx.strokeRect(ox, oy, ow, oh);
                    break;
                case 1: // Spike — stroke mengikuti variant
                    ctx.beginPath();
                    this.traceSpikePath(ctx, ox, oy, ow, oh, obs.variant || 0);
                    ctx.stroke();
                    break;
                case 2: // Pillar
                    ctx.strokeRect(ox + 2, oy, ow - 4, oh);
                    break;
            }
            
            // === PULSE RING (efek denyut) ===
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 * pulse})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.strokeRect(ox - 4, oy - 4, ow + 8, oh + 8);
            ctx.setLineDash([]);
            
            ctx.restore();
        }
    },
    
    drawPits(ctx) {
        if (!this.activePit) return;
        
        const pit = this.activePit;
        const gy = this.player.groundY;
        
        ctx.save();
        
        if (pit.filled) {
            // Filled pit - show bridge/platform
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(pit.x, gy - 3, pit.width, 6);
            // Garis terang tanpa shadowBlur
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(pit.x + 5, gy - 5, pit.width - 10, 4);
            
            // 💥 Balon pecah: mengecil cepat + partikel kecil (animasi singkat)
            const popTimer = pit.popTimer || 0;
            if (popTimer > 0) {
                const popScale = popTimer / 12;
                const bx = pit.x + pit.width / 2;
                const by = gy - 34 - (12 - popTimer) * 2;
                const br = 13 * popScale;
                if (br > 0.5) {
                    ctx.fillStyle = `rgba(255,255,255,${0.9 * popScale})`;
                    ctx.beginPath();
                    ctx.ellipse(bx, by, br, br * 1.25, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Partikel kecil menyebar
                ctx.fillStyle = `rgba(255,255,255,${0.6 * popScale})`;
                for (let i = 0; i < 6; i++) {
                    const ang = (i / 6) * Math.PI * 2 + (12 - popTimer) * 0.3;
                    const pr = 5 + (12 - popTimer) * 1.5;
                    ctx.beginPath();
                    ctx.arc(bx + Math.cos(ang) * pr, by + Math.sin(ang) * pr * 0.8, 1.5 + popScale, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else {
            // Open pit - dark hole
            const grad = ctx.createLinearGradient(0, gy, 0, gy + 40);
            grad.addColorStop(0, 'rgba(255,255,255,0.3)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(pit.x, gy, pit.width, 40);
            
            // Danger lines
            ctx.strokeStyle = 'rgba(255,68,68,0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(pit.x, gy);
            ctx.lineTo(pit.x + pit.width, gy);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // ===== BALON + KOTAK (visual voice challenge baru) =====
            // Balon di atas, tali tipis, kotak di bawah di atas lubang.
            // Suara keras mengisi "charge" balon → balon membesar sedikit →
            // saat penuh: balon pecah + kotak jatuh mengisi lubang (fillPit).
            const chargeRatio = Math.min((pit.charge || 0) / PIT_CHARGE_FRAMES, 1);
            const boxW = Math.min(26, pit.width - 12);
            const boxX = pit.x + (pit.width - boxW) / 2;
            const boxY = gy - 15;
            const liftY = chargeRatio * 8; // Balon & tali terangkat saat charge
            const outlineC = this.getObstacleOutlineColor();
            
            // Tali tipis
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(boxX + boxW / 2, boxY);
            ctx.lineTo(boxX + boxW / 2, boxY - 30 - liftY);
            ctx.stroke();
            
            // Balon (siluet monokrom, membesar saat charge)
            const br = 12 + chargeRatio * 4;
            const bx = boxX + boxW / 2;
            const by = boxY - 32 - liftY - br * 1.2;
            const balloonPulse = 1 + Math.sin(this.frameCount * 0.12) * 0.05;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.ellipse(bx, by, br * balloonPulse, br * 1.25 * balloonPulse, 0, 0, Math.PI * 2);
            ctx.fill();
            // Simpul balon
            ctx.beginPath();
            ctx.moveTo(bx, by + br * 1.2);
            ctx.lineTo(bx - 3, by + br * 1.2 + 5);
            ctx.lineTo(bx + 3, by + br * 1.2 + 5);
            ctx.closePath();
            ctx.fill();
            // Kilau kecil di balon (efek glossy murah, tanpa shadowBlur)
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath();
            ctx.ellipse(bx - br * 0.35, by - br * 0.4, br * 0.22, br * 0.32, -0.5, 0, Math.PI * 2);
            ctx.fill();
            // Outline kontras tema
            ctx.strokeStyle = outlineC;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(bx, by, br * balloonPulse, br * 1.25 * balloonPulse, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Kotak (siluet kotak crate di atas lubang)
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(boxX, boxY, boxW, 15);
            // Garis tengah kotak + outline
            ctx.strokeStyle = outlineC;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(boxX, boxY, boxW, 15);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(boxX, boxY + 7.5);
            ctx.lineTo(boxX + boxW, boxY + 7.5);
            ctx.stroke();
        }
        
        ctx.restore();
    },
    
    drawFloatingTexts(ctx) {
        for (const ft of this.floatingTexts) {
            ctx.save();
            
            ctx.globalAlpha = Math.max(0, ft.opacity);
            
            // Update animasi berjalan
            ft.walkPhase = (ft.walkPhase || 0) + 0.08;
            ft.bouncePhase = (ft.bouncePhase || 0) + 0.04;
            ft.wavePhase = (ft.wavePhase || 0) + 0.06;
            
            const walkY = Math.sin(ft.walkPhase) * 5;           // Gerak naik-turun
            const walkX = Math.sin(ft.walkPhase * 0.5) * 3;      // Gerak kiri-kanan
            const bounce = Math.abs(Math.sin(ft.bouncePhase)) * 4; // Bounce ekstra
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 34px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Glow via backdrop pill (tanpa shadowBlur)
            ctx.shadowBlur = 0;
            
            ctx.translate(ft.x + walkX, ft.y + walkY - bounce);
            ctx.scale(ft.scale, ft.scale);
            
            // Background pill dengan animasi
            const metrics = ctx.measureText(ft.text);
            const tw = metrics.width + 50;
            
            // Pulse glow on background — backdrop gelap agar teks terbaca di tema terang
            ctx.shadowBlur = 0;
            const darkness = this.getThemeDarkness();
            ctx.fillStyle = `rgba(12, 20, 40, ${0.55 - darkness * 0.35})`;
            ctx.beginPath();
            ctx.roundRect(-tw / 2, -24, tw, 48, 24);
            ctx.fill();
            
            // Border dengan pulse
            ctx.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(ft.wavePhase) * 0.15})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Teks polos (outline gelap sudah cukup kontras)
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            
            // Animasi per karakter (bergelombang)
            const chars = ft.text.split('');
            if (chars.length > 1) {
                let totalWidth = 0;
                for (let i = 0; i < chars.length; i++) {
                    const charWidth = ctx.measureText(chars[i]).width;
                    const charY = Math.sin(ft.wavePhase + i * 0.8) * 3;
                    ctx.save();
                    ctx.translate(-tw / 4 + totalWidth + charWidth / 2, charY);
                    ctx.fillText(chars[i], 0, 0);
                    ctx.restore();
                    totalWidth += charWidth + 2;
                }
            } else {
                ctx.fillText(ft.text, 0, Math.sin(ft.wavePhase) * 3);
            }
            
            // Mic icon kecil di bawah teks
            ctx.shadowBlur = 0;
            ctx.font = '16px "Inter", sans-serif';
            ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(ft.wavePhase * 1.5) * 0.3})`;
            ctx.fillText('🎤', 0, 34);
            
            ctx.restore();
        }
    },
    
    drawParticles(ctx) {
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = `rgba(150, 220, 255, ${p.life})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    },
    
    drawScorePopups(ctx) {
        for (const s of this.scorePopups) {
            ctx.save();
            ctx.globalAlpha = s.life;
            ctx.translate(s.x, s.y);
            ctx.scale(s.scale + (1 - s.life) * 0.5, s.scale + (1 - s.life) * 0.5);
            // Tanpa glow (outline hitam sudah cukup kontras)
            ctx.shadowBlur = 0;
            ctx.font = 'bold 20px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#66ff66';
            ctx.fillText(s.text, 0, 0);
            // Outline
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.strokeText(s.text, 0, 0);
            ctx.restore();
        }
    },
    
    drawMultiplayerPlayers(ctx) {
        if (!Multiplayer.currentRoomData) return;
        
        const players = Multiplayer.currentRoomData.players || {};
        const myId = Multiplayer.playerId;
        
        // Draw other players as smaller silhouettes
        let index = 0;
        for (const pid in players) {
            if (pid === myId) continue;
            const p = players[pid];
            if (!p.alive) continue;
            
            // Other player position (offset in multiplayer view)
            const offsetX = (index + 1) * 60;
            const otherX = this.player.x - 100 - offsetX;
            
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            
            // Simple body
            ctx.fillRect(otherX - 4, this.player.groundY - 35, 8, 18);
            ctx.beginPath();
            ctx.arc(otherX, this.player.groundY - 40, 6, 0, Math.PI * 2);
            ctx.fill();
            
            // Name tag
            ctx.font = '11px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText(p.name || 'Pemain', otherX, this.player.groundY - 55);
            
            // Score
            ctx.font = '10px "Inter", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText('Skor: ' + p.score, otherX, this.player.groundY - 42);
            
            ctx.restore();
            
            index++;
        }
    },
    
    // ===== MULTIPLAYER SYNC =====
    
    sendMPUpdate() {
        if (!this.isMultiplayer || this.state === 'gameOver') return;
        Multiplayer.updatePlayerState(
            this.score,
            Math.floor(this.distance),
            this.lives,
            this.lives > 0
        );
    },
    
    syncMultiplayerState() {
        const data = Multiplayer.currentRoomData;
        if (!data) return;
        
        // Check win condition
        if (data.gameState && data.gameState.finished) {
            this.state = 'gameOver';
            // Show results
            this.showMultiplayerResults(data);
        }
        
        // If host, check if everyone is done
        if (Multiplayer.isHost && this.state === 'multiplayer') {
            const players = data.players || {};
            let aliveCount = 0;
            for (const pid in players) {
                if (players[pid].alive) aliveCount++;
            }
            
            // If only this player alive and no one else, finish
            if (aliveCount <= 0 || (aliveCount === 1 && players[Multiplayer.playerId] && !players[Multiplayer.playerId].alive)) {
                // All dead - finish game
                this.finishMultiplayerGame();
            }
        }
    },
    
    finishMultiplayerGame() {
        if (!Multiplayer.isHost || !Multiplayer.roomRef) return;
        Multiplayer.roomRef.child('gameState/finished').set(true);
        Multiplayer.roomRef.child('gameState/finishTime').set(Date.now());
    },
    
    showMultiplayerResults(data) {
        this.state = 'gameOver';
        
        const players = data.players || {};
        const order = data.playerOrder || Object.keys(players);
        
        // Sort by score
        const sorted = order
            .map(id => players[id])
            .filter(p => p)
            .sort((a, b) => (b.score || 0) - (a.score || 0));
        
        const resultsDiv = document.getElementById('multiplayerResults');
        resultsDiv.innerHTML = '';
        
        sorted.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'mp-result-item';
            const medals = ['🥇', '🥈', '🥉', '4️⃣'];
            div.innerHTML = `
                <span class="mp-result-rank">${medals[i] || (i + 1)}</span>
                <span class="mp-result-name">${p.name || 'Pemain'}</span>
                <span class="mp-result-score">${p.score || 0}</span>
            `;
            resultsDiv.appendChild(div);
        });
        
        document.getElementById('winScreen').classList.remove('overlay-hidden');
        
        if (this.mpUpdateInterval) {
            clearInterval(this.mpUpdateInterval);
            this.mpUpdateInterval = null;
        }
    },
    
    // ===== PAUSE & TOOLS =====
    
    togglePause() {
        if (this.state === 'solo' || this.state === 'multiplayer') {
            this.state = 'paused';
            document.getElementById('pauseMenu').classList.remove('overlay-hidden');
            // Isi statistik di menu pause
            const pd = document.getElementById('pauseDistance');
            const ps = document.getElementById('pauseScore');
            if (pd) pd.textContent = Math.floor(this.distance) + ' m';
            if (ps) ps.textContent = this.score;
        } else if (this.state === 'paused') {
            this.resumeGame();
        }
    },
    
    resumeGame() {
        if (this.state === 'paused') {
            this.state = this.isMultiplayer ? 'multiplayer' : 'solo';
            document.getElementById('pauseMenu').classList.add('overlay-hidden');
        }
    },
    
    startMusic() {
        AudioManager.initAudioContext().then(() => {
            AudioManager.startMusic();
        });
    },
    
    toggleMusic() {
        const enabled = AudioManager.toggleMusic();
        document.querySelector('.hud-btn[title="Musik"]').textContent = enabled ? '🎵' : '🚫';
    },
    
    watchAd() {
        // Placeholder: tampilkan dialog iklan. Integrasi AdNetwork menyusul.
        document.getElementById('adPlaceholder').classList.remove('overlay-hidden');
    }
};

// ===== Polyfill for roundRect =====
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}

// ===== GLOBAL FUNCTIONS (called from HTML) =====

// Global wrappers for Game methods called from HTML
function togglePause() { Game.togglePause(); }
function resumeGame() { Game.resumeGame(); }
function toggleMusic() { Game.toggleMusic(); }
function saveScoreAndRestart() { Game.saveScoreAndRestart(); }

function startGame() {
    // Blokir main jika akun email belum diverifikasi (kebijakan produksi)
    if (typeof checkEmailVerifiedBeforePlay === 'function' && !checkEmailVerifiedBeforePlay()) {
        return;
    }
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('loadingScreen').classList.add('active');
    
    Game.state = 'loading';
    Game.animateLoadingCharacter();
    
    // Simulate loading
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.remove('active');
        document.getElementById('modeSelect').classList.add('active');
        Game.state = 'modeSelect';
    }, 2000);
}

// Cek kebijakan: akun email yang belum diverifikasi TIDAK boleh main.
// Guest (anonim) tetap boleh main.
function checkEmailVerifiedBeforePlay() {
    const u = window.AuthService ? window.AuthService.getUser() : null;
    if (u && !u.isAnonymous && u.email && !u.emailVerified) {
        if (typeof showVerificationScreen === 'function') {
            showVerificationScreen(u);
        } else {
            alert('Verifikasi email kamu dulu sebelum bermain. Cek inbox!');
        }
        return false;
    }
    return true;
}

function showMainMenu() {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameCanvas').style.display = 'block';
    document.getElementById('gameOverlay').style.display = 'none';
    document.getElementById('pauseMenu').classList.add('overlay-hidden');
    document.getElementById('gameOverScreen').classList.add('overlay-hidden');
    document.getElementById('winScreen').classList.add('overlay-hidden');
    document.getElementById('exitConfirm').classList.add('overlay-hidden');
    document.getElementById('adPlaceholder').classList.add('overlay-hidden');
    
    document.getElementById('mainMenu').classList.add('active');
    Game.state = 'menu';
    
    // Mainkan musik lagi di menu
    Game.startMusic();
    
    // Mulai demo game preview
    Game.startMenuDemo();
    
    if (Game.mpUpdateInterval) {
        clearInterval(Game.mpUpdateInterval);
        Game.mpUpdateInterval = null;
    }
}

function showModeSelect() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('multiplayerScreen').classList.remove('active');
    document.getElementById('modeSelect').classList.add('active');
    Game.state = 'modeSelect';
}

function startSolo() {
    if (typeof checkEmailVerifiedBeforePlay === 'function' && !checkEmailVerifiedBeforePlay()) {
        return;
    }
    document.getElementById('modeSelect').classList.remove('active');
    Game.startSolo();
}

function showMultiplayer() {
    document.getElementById('modeSelect').classList.remove('active');
    document.getElementById('multiplayerScreen').classList.add('active');
}

// Leaderboard
function showLeaderboard() {
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('leaderboardScreen').classList.add('active');
    updateLeaderboard();
}

function hideLeaderboard() {
    document.getElementById('leaderboardScreen').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
}

// Heuristik anti-cheat (tampilan saja, utk ditinjau moderator):
// skor normal maksimal ±3x jarak; di atas itu ditandai ⚠️ perlu review.
function isSuspiciousScore(entry) {
    const d = entry.distance || 0;
    if (d <= 0 && (entry.score || 0) > 100) return true;
    // Skor legit maksimal ±3x jarak (formula distance*2 + frameCount*0.5).
    // Ambang 3.5x dipakai biar run legit ekstrem tidak kena false-positive.
    return (entry.score || 0) > d * 3.5 + 5000;
}

function updateLeaderboard(type = 'local') {
    const list = document.getElementById('leaderboardList');
    const note = document.getElementById('lbNote');
    list.innerHTML = '';
    
    if (type === 'local') {
        // Tab LOKAL = rekor perangkat ini saja (localStorage), tidak terhubung server
        if (note) note.textContent = 'Skor tersimpan di perangkat ini saja.';
        let leaderboard = [];
        const saved = localStorage.getItem('voiceRunner_leaderboard');
        if (saved) {
            try { leaderboard = JSON.parse(saved); } catch(e) {}
        }
        
        // Filter hanya entry score pemain (bukan checkpoint)
        const scoreEntries = leaderboard.filter(e => e.type !== 'checkpoint');
        
        if (scoreEntries.length === 0) {
            list.innerHTML = '<div class="lb-empty">Belum ada skor. Ayo main!</div>';
            return;
        }
        
        scoreEntries.forEach((entry, index) => {
            const div = document.createElement('div');
            div.className = 'lb-item';
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            div.innerHTML = `
                <span class="lb-rank ${rankClass}">${index + 1}</span>
                <span class="lb-name">${escapeHtml(entry.name || 'Anonim')}</span>
                <span class="lb-score">${entry.score}</span>
            `;
            list.appendChild(div);
        });
    } else {
        // Tab GLOBAL = Firebase /leaderboard — top 50 semua pemain semua device
        if (note) note.textContent = 'Skor tersimpan di server — semua pemain, semua device. 🌍';
        const canMod = (typeof isCurrentUserMod === 'function') ? isCurrentUserMod() : false;
        list.innerHTML = '<div class="lb-empty">Memuat leaderboard global...</div>';
        if (typeof loadGlobalLeaderboard === 'function') {
            loadGlobalLeaderboard(50).then((entries) => {
                if (!entries.length) {
                    list.innerHTML = '<div class="lb-empty">Belum ada skor global. Ayo main & bersaing! 🌍</div>';
                    return;
                }
                const myUid = (typeof getAuthUid === 'function') ? getAuthUid() : null;
                entries.forEach((entry, index) => {
                    const div = document.createElement('div');
                    div.className = 'lb-item';
                    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                    const isMe = myUid && entry.uid === myUid;
                    const guest = entry.isGuest
                        ? ' <span class="lb-guest" title="Akun anonim"><svg class="lb-icon"><use href="#icon-user"/></svg> Guest</span>' : '';
                    const flag = isSuspiciousScore(entry)
                        ? ' <span class="lb-flag" title="Skor mencurigakan — perlu review moderator"><svg class="lb-icon"><use href="#icon-alert"/></svg></span>' : '';
                    const del = canMod
                        ? ` <button class="lb-del" onclick="deleteGlobalEntry('${entry.uid}')" title="Hapus entry (moderasi)"><svg class="lb-icon"><use href="#icon-trash"/></svg></button>` : '';
                    div.innerHTML = `
                        <span class="lb-rank ${rankClass}">${index + 1}</span>
                        <span class="lb-name">${escapeHtml(entry.name || 'Anonim')}${guest}${flag}${isMe ? ' <span class="lb-you">(kamu)</span>' : ''}</span>
                        <span class="lb-score">${entry.score}</span>
                        ${del ? `<span class="lb-del-wrap">${del}</span>` : ''}
                    `;
                    list.appendChild(div);
                });
            });
        } else {
            list.innerHTML = '<div class="lb-empty">Firebase tidak tersedia.</div>';
        }
    }
}

function switchLbTab(tab) {
    document.getElementById('lbTabLocal').classList.toggle('active', tab === 'local');
    document.getElementById('lbTabGlobal').classList.toggle('active', tab === 'global');
    updateLeaderboard(tab);
}

// Settings
function showSettings() {
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('settingsScreen').classList.add('active');
    
    // Load settings
    const saved = localStorage.getItem('voiceRunner_settings');
    if (saved) {
        try {
            const s = JSON.parse(saved);
            document.getElementById('musicToggle').checked = s.music !== false;
            document.getElementById('sfxToggle').checked = s.sfx !== false;
        } catch(e) {}
    }
    
    const sens = AudioManager.getMicSensitivity();
    document.getElementById('micSensitivity').value = sens;
    document.getElementById('micSensValue').textContent = Math.round(sens * 100) + '%';
    
    // Refresh status akun (Guest/user) + section moderasi
    if (typeof refreshAccountUI === 'function') refreshAccountUI();
}

function hideSettings() {
    document.getElementById('settingsScreen').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
}

function toggleMusicSetting() {
    AudioManager.musicEnabled = document.getElementById('musicToggle').checked;
    if (AudioManager.musicEnabled) {
        AudioManager.startMusic();
    } else {
        AudioManager.stopMusic();
    }
    AudioManager.saveSettings();
}

function toggleSfxSetting() {
    AudioManager.sfxEnabled = document.getElementById('sfxToggle').checked;
    AudioManager.saveSettings();
}

function updateMicSensitivity() {
    const val = parseFloat(document.getElementById('micSensitivity').value);
    document.getElementById('micSensValue').textContent = Math.round(val * 100) + '%';
    AudioManager.setMicSensitivity(val);
}

function resetAllData() {
    if (confirm('Hapus semua data? (skor, progress, settings akan direset)')) {
        localStorage.removeItem('voiceRunner_leaderboard');
        localStorage.removeItem('voiceRunner_save');
        localStorage.removeItem('voiceRunner_playerName');
        localStorage.removeItem('voiceRunner_settings');
        localStorage.removeItem('voiceRunner_micSensitivity');
        
        document.getElementById('musicToggle').checked = true;
        document.getElementById('sfxToggle').checked = true;
        AudioManager.musicEnabled = true;
        AudioManager.sfxEnabled = true;
        
        alert('Semua data berhasil direset!');
    }
}

// Exit
function exitGame() {
    document.getElementById('exitConfirm').classList.remove('overlay-hidden');
}

function confirmExit() {
    document.getElementById('exitConfirm').classList.add('overlay-hidden');
    document.getElementById('mainMenu').classList.remove('active');
    // For web, just show a message
    alert('Terima kasih sudah bermain Voice Runner! 👋');
    // Try to close window (may not work in all browsers)
    window.close();
}

function cancelExit() {
    document.getElementById('exitConfirm').classList.add('overlay-hidden');
}

// Ad placeholder — tombol "TONTON IKLAN" di Game Over
function watchAd() {
    Game.watchAd();
}

function closeAd() {
    document.getElementById('adPlaceholder').classList.add('overlay-hidden');
    // Setelah "menonton iklan" → lanjut dari titik kematian
    Game.continueFromDeath();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
