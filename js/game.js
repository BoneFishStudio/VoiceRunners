/* ============================
   GAME.JS - Voice Runner Core Engine
   ============================ */

// ===== CONSTANTS =====
const GRAVITY = 0.6;
const GROUND_Y_RATIO = 0.78;
const BASE_SPEED = 5;
const MAX_SPEED = 14;
const SPEED_INCREMENT = 0.001;
const OBSTACLE_MIN_GAP = 120;
const OBSTACLE_MAX_GAP = 200;
const PIT_CHANCE = 0.15;

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
        
        // Mulai musik untuk Main Menu
        // Note: AudioContext butuh interaksi user dulu (click/tap)
        // jadi musik akan mulai setelah user klik pertama
        this.startMusic();
        
        // Resume audio context saat user pertama kali klik di mana saja
        document.addEventListener('click', () => {
            if (AudioManager.audioContext && AudioManager.audioContext.state === 'suspended') {
                AudioManager.audioContext.resume();
            }
        }, { once: true });
        
        console.log('Voice Runner initialized!');
    },
    
    resize() {
        // Gunakan device pixel ratio untuk canvas sharp di layar HD/Retina
        const dpr = window.devicePixelRatio || 1;
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
    
    startMultiplayer() {
        this.stopMenuDemo();
        this.showCanvas();
        this.isMultiplayer = true;
        this.resetGame();
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
    
    resetGame() {
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
        
        // Reset voice state
        this.voiceVolume = 0;
        this.voiceJumpCooldown = 0;
        
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
        if (this.state === 'loading' || this.state === 'modeSelect' || this.state === 'menu') return;
        
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
        if (this.gameSpeed > MAX_SPEED) this.gameSpeed = MAX_SPEED;
        
        // Update distance
        this.distance += this.gameSpeed * 0.1;
        
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
        
        // Update HUD
        this.updateHUD();
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
        const shouldGen = Math.random() < 0.008 * (this.gameSpeed / BASE_SPEED);
        
        if (shouldGen && this.canGenerateObstacle()) {
            const types = ['obstacle', 'pit'];
            const isPit = Math.random() < PIT_CHANCE;
            
            if (isPit && !this.activePit) {
                this.createPit();
            } else if (!isPit) {
                this.createObstacle();
            }
        }
    },
    
    canGenerateObstacle() {
        const lastDist = this.lastObstacleDist;
        const minGap = OBSTACLE_MIN_GAP * (BASE_SPEED / this.gameSpeed);
        const maxGap = OBSTACLE_MAX_GAP * (BASE_SPEED / this.gameSpeed);
        const gap = minGap + Math.random() * (maxGap - minGap);
        
        if (this.distance - lastDist > gap) {
            this.lastObstacleDist = this.distance;
            return true;
        }
        return false;
    },
    
    get logicalW() { return this._w || this.canvas.width / (window.devicePixelRatio || 1); },
    get logicalH() { return this._h || this.canvas.height / (window.devicePixelRatio || 1); },
    
    createObstacle() {
        // Pilih type dulu, baru tentukan tinggi berdasarkan type
        // Setiap type punya tinggi spesifik yang cocok dengan level suara:
        //   Type 1 (Spike, merah):  rendah → butuh suara pelan  → level 1
        //   Type 0 (Box, oranye):   sedang → butuh suara normal → level 2
        //   Type 2 (Pillar, ungu):  tinggi  → butuh suara keras  → level 3
        const typeWeights = [0.35, 0.35, 0.3]; // box, spike, pillar
        const rand = Math.random();
        let type;
        if (rand < typeWeights[0]) type = 0;       // Box (sedang)
        else if (rand < typeWeights[0] + typeWeights[1]) type = 1; // Spike (rendah)
        else type = 2; // Pillar (tinggi)
        
        let obsHeight, obsY;
        
        switch(type) {
            case 0: // Box — butuh suara normal (level 2)
                obsHeight = 35 + Math.random() * 10; // 35-45px
                break;
            case 1: // Spike — butuh suara pelan (level 1)
                obsHeight = 22 + Math.random() * 8; // 22-30px
                break;
            case 2: // Pillar — butuh suara keras (level 3)
                obsHeight = 55 + Math.random() * 10; // 55-65px
                break;
        }
        
        obsY = this.player.groundY - obsHeight;
        
        // Lebar disesuaikan dengan type
        let obsWidth;
        switch(type) {
            case 0: obsWidth = 18 + Math.random() * 8; break;  // Box: 18-26
            case 1: obsWidth = 16 + Math.random() * 6; break;  // Spike: 16-22
            case 2: obsWidth = 20 + Math.random() * 8; break;  // Pillar: 20-28
        }
        
        this.obstacles.push({
            x: this.logicalW + 50,
            y: obsY,
            width: obsWidth,
            height: obsHeight,
            type: type,
            passed: false,
            // Label voice level untuk ditampilkan (opsional)
            voiceLevel: type === 0 ? 2 : type === 1 ? 1 : 3
        });
    },
    
    createPit() {
        const pitWidth = 50 + Math.random() * 40;
        const textOptions = [
            "LARI", "LONCAT", "BERHENTI", "MAJU", "MUNDUR",
            "KIRI", "KANAN", "CEPAT", "LAMBAT", "PUTAR",
            "TERBANG", "GESER", "HENTI", "DIAM", "AMBIL"
        ];
        const text = textOptions[Math.floor(Math.random() * textOptions.length)];
        
        this.activePit = {
            x: this.logicalW + 50,
            width: pitWidth,
            text: text,
            active: true,
            filled: false,
            failed: false
        };
        
        // Create floating text with animation properties
        this.floatingTexts.push({
            x: this.logicalW + 50 + pitWidth / 2,
            y: this.logicalH * 0.4,
            text: text,
            opacity: 1,
            scale: 1,
            walkPhase: 0,  // Untuk animasi berjalan
            floatOffset: 0,
            bouncePhase: 0,
            wavePhase: 0,
            charOffsets: [] // Per karakter offset
        });
        
        // Start listening
        setTimeout(() => {
            if (this.activePit && !this.activePit.filled && !this.activePit.failed) {
                this.startVoiceRecognition(text);
            }
        }, 500);
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
        
        this.activePit.x -= this.gameSpeed;
        
        // Remove pit if off screen (without being filled)
        if (this.activePit.x + this.activePit.width < -50) {
            this.activePit = null;
            this.isListening = false;
            if (this.recognition) {
                try { this.recognition.stop(); } catch(e) {}
            }
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
            text: level === 1 ? '🔇 Pelan' : level === 2 ? '🗣️ Normal' : '📢 KERAS!',
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
        
        // Update label volume
        const label = document.getElementById('volumeLabel');
        if (label) {
            if (volume > 0.25) label.textContent = '📢 KERAS!';
            else if (volume > 0.12) label.textContent = '🗣️ Normal';
            else if (volume > 0.06) label.textContent = '🔇 Pelan';
            else label.textContent = '🔇 ...';
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
            console.log('🎤 Voice volume detection started!');
            return true;
        } catch(e) {
            console.warn('Mic access failed:', e.message);
            localStorage.setItem('voiceRunner_micPermission', 'denied');
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
    
    respawnAtCheckpoint() {
        // Pulihkan nyawa
        this.lives = 3;
        // Kembali ke jarak checkpoint
        this.distance = this.checkpointDistance;
        this.score = this.checkpointScore;
        
        // Reset arena
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
        
        // Hentikan voice recognition
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        this.isListening = false;
        document.getElementById('voiceIndicator').classList.add('overlay-hidden');
        
        // Tampilkan notifikasi
        this.showCheckpointNotification();
        
        // Update HUD
        this.updateHUD();
        
        // Kembalikan state ke bermain
        this.state = this.isMultiplayer ? 'multiplayer' : 'solo';
        
        console.log('📍 Respawn at checkpoint:', this.checkpointDistance + 'm');
    },
    
    showCheckpointNotification() {
        const el = document.getElementById('checkpointNotif');
        if (!el) return;
        el.textContent = `📍 CHECKPOINT ${Math.floor(this.checkpointDistance)}m`;
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
                name: '📍 Checkpoint',
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
        return (
            obs.x + margin < px + pw - margin &&
            obs.x + obs.width - margin > px + margin &&
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
                    resolve(true);
                })
                .catch((err) => {
                    console.warn('Mic permission denied:', err);
                    this.micPermissionChecked = true;
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
        
        // Cek izin mic dulu
        this.checkMicPermission().then((granted) => {
            if (!granted) {
                // Tampilkan dialog izin mic
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
        document.getElementById('voiceText').textContent = '🎤 Ucapkan: "' + text + '"';
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
                    document.getElementById('voiceText').textContent = '🔇 Izinkan mic di settings browser';
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
        this.isListening = false;
        
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        
        // Visual feedback
        document.querySelector('.voice-pulse').className = 'voice-pulse success';
        document.getElementById('voiceText').textContent = '✅ Benar! +50';
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
            // Cek checkpoint! Kalau ada, respawn
            if (this.checkpointDistance > 0) {
                this.respawnAtCheckpoint();
            } else {
                this.gameOver();
            }
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
        document.getElementById('finalDistance').textContent = Math.floor(this.distance);
        document.getElementById('gameOverScreen').classList.remove('overlay-hidden');
        
        // Auto-fill name from saved
        const savedName = localStorage.getItem('voiceRunner_playerName');
        if (savedName) {
            document.getElementById('playerName').value = savedName;
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
        const livesStr = '❤️'.repeat(Math.max(0, this.lives));
        document.getElementById('livesDisplay').textContent = livesStr || '💀';
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
        // Dark gradient sky
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0f0f1a');
        grad.addColorStop(0.5, '#1a1a2e');
        grad.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        // Stars
        ctx.save();
        for (const star of this.bgStars) {
            const twinkle = 0.7 + Math.sin(this.frameCount * star.twinkleSpeed) * 0.3;
            ctx.globalAlpha = star.brightness * twinkle;
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
        ctx.restore();
        
        // Mountains (far background)
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#fff';
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
        
        // City silhouette (mid background)
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#fff';
        const buildings = 10;
        for (let i = 0; i < buildings; i++) {
            const bx = ((i * (w / buildings) + 50 - this.distance * 0.1) % (w + 200) + w + 200) % (w + 200) - 100;
            const bh = 40 + Math.sin(i * 2.5) * 30 + 30;
            const bw = 30 + Math.sin(i * 1.7) * 15;
            ctx.fillRect(bx, this.player.groundY - bh, bw, bh);
        }
        ctx.restore();
        
        // === AMBIENT GLOW (pulsing neon dari bawah) ===
        ctx.save();
        const glowPulse = 0.3 + Math.sin(this.frameCount * 0.02) * 0.15;
        const ambientGrad = ctx.createRadialGradient(
            w * 0.5, this.player.groundY + 50, 10,
            w * 0.5, this.player.groundY + 50, h * 0.6
        );
        ambientGrad.addColorStop(0, `rgba(100, 200, 255, ${glowPulse * 0.08})`);
        ambientGrad.addColorStop(0.5, `rgba(80, 150, 255, ${glowPulse * 0.04})`);
        ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ambientGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
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
        
        // Main ground line (neon blue)
        ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
        ctx.shadowBlur = 10;
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
                ctx.shadowColor = 'rgba(100, 200, 255, 0.3)';
                ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(lx - len, ly - Math.random() * 5);
                ctx.stroke();
            }
            ctx.restore();
        }
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
                ctx.shadowColor = 'rgba(100, 200, 255, 0.3)';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(tx, ty, 2 + Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        // === GLOW INTI ===
        ctx.shadowColor = 'rgba(150, 220, 255, 0.4)';
        ctx.shadowBlur = 20;
        
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
        ctx.shadowBlur = 15;
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
        ctx.shadowBlur = 8;
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
        ctx.shadowBlur = 8;
        
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
    
    drawObstacles(ctx) {
        const pulse = Math.sin(this.frameCount * 0.05) * 0.15 + 0.85; // Pulse animasi
        
        for (const obs of this.obstacles) {
            ctx.save();
            
            const ox = obs.x;
            const oy = obs.y;
            const ow = obs.width;
            const oh = obs.height;
            
            // === GLOW BASE ===
            ctx.shadowColor = 'rgba(255, 180, 100, 0.3)';
            ctx.shadowBlur = 12;
            
            switch(obs.type) {
                case 0: // Box — neon crate
                    // Gradient body
                    const boxGrad = ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
                    boxGrad.addColorStop(0, '#ff8c42');
                    boxGrad.addColorStop(0.5, '#ff6b35');
                    boxGrad.addColorStop(1, '#e05220');
                    ctx.fillStyle = boxGrad;
                    ctx.fillRect(ox, oy, ow, oh);
                    
                    // Border dalam (glow line)
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = `rgba(255, 200, 150, ${0.3 * pulse})`;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(ox + 3, oy + 3, ow - 6, oh - 6);
                    
                    // X mark di tengah
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * pulse})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(ox + 5, oy + 5);
                    ctx.lineTo(ox + ow - 5, oy + oh - 5);
                    ctx.moveTo(ox + ow - 5, oy + 5);
                    ctx.lineTo(ox + 5, oy + oh - 5);
                    ctx.stroke();
                    break;
                    
                case 1: // Spike — neon red
                    ctx.shadowColor = 'rgba(255, 80, 80, 0.4)';
                    const spikeGrad = ctx.createLinearGradient(ox, oy + oh, ox + ow / 2, oy);
                    spikeGrad.addColorStop(0, '#ff4444');
                    spikeGrad.addColorStop(0.5, '#ff6666');
                    spikeGrad.addColorStop(1, '#ff8888');
                    ctx.fillStyle = spikeGrad;
                    
                    ctx.beginPath();
                    ctx.moveTo(ox, oy + oh);
                    ctx.lineTo(ox + ow / 2, oy);
                    ctx.lineTo(ox + ow, oy + oh);
                    ctx.closePath();
                    ctx.fill();
                    
                    // Glow line di tengah spike
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * pulse})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(ox + ow / 2, oy + 3);
                    ctx.lineTo(ox + ow / 2, oy + oh - 3);
                    ctx.stroke();
                    break;
                    
                case 2: // Pillar — neon purple
                    ctx.shadowColor = 'rgba(180, 100, 255, 0.3)';
                    const pillarGrad = ctx.createLinearGradient(ox + 2, oy, ox + ow - 2, oy + oh);
                    pillarGrad.addColorStop(0, '#8b5cf6');
                    pillarGrad.addColorStop(0.5, '#a78bfa');
                    pillarGrad.addColorStop(1, '#7c3aed');
                    ctx.fillStyle = pillarGrad;
                    ctx.fillRect(ox + 2, oy, ow - 4, oh);
                    
                    // Top cap (glowing)
                    ctx.shadowBlur = 15;
                    ctx.fillStyle = `rgba(167, 139, 250, ${0.6 * pulse})`;
                    ctx.fillRect(ox, oy - 4, ow, 6);
                    
                    // Detail garis vertikal
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * pulse})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(ox + ow / 2, oy + 5);
                    ctx.lineTo(ox + ow / 2, oy + oh - 5);
                    ctx.stroke();
                    break;
            }
            
            // === PULSE RING (efek denyut) ===
            ctx.shadowBlur = 0;
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
            // Glow effect
            ctx.shadowColor = 'rgba(255,255,255,0.3)';
            ctx.shadowBlur = 20;
            ctx.fillRect(pit.x + 5, gy - 5, pit.width - 10, 4);
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
            
            // Glow effect lebih terang
            ctx.shadowColor = 'rgba(255,255,255,0.5)';
            ctx.shadowBlur = 25;
            
            ctx.translate(ft.x + walkX, ft.y + walkY - bounce);
            ctx.scale(ft.scale, ft.scale);
            
            // Background pill dengan animasi
            const metrics = ctx.measureText(ft.text);
            const tw = metrics.width + 50;
            
            // Pulse glow on background
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.sin(ft.wavePhase) * 0.05})`;
            ctx.beginPath();
            ctx.roundRect(-tw / 2, -24, tw, 48, 24);
            ctx.fill();
            
            // Border dengan pulse
            ctx.strokeStyle = `rgba(255,255,255,${0.2 + Math.sin(ft.wavePhase) * 0.15})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Teks dengan shadow
            ctx.shadowBlur = 15;
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
            // Glow
            ctx.shadowColor = 'rgba(100, 255, 100, 0.6)';
            ctx.shadowBlur = 15;
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
        if (this.lives < this.maxLives) {
            document.getElementById('adPlaceholder').classList.remove('overlay-hidden');
        }
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

function updateLeaderboard(type = 'local') {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';
    
    if (type === 'local') {
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
                <span class="lb-name">${entry.name || 'Anonim'}</span>
                <span class="lb-score">${entry.score}</span>
            `;
            list.appendChild(div);
        });
    } else {
        // Global leaderboard placeholder
        list.innerHTML = '<div class="lb-empty">Leaderboard global akan datang setelah integrasi Firebase penuh.</div>';
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

// Ad placeholder
function watchAd() {
    document.getElementById('adPlaceholder').classList.remove('overlay-hidden');
}

function closeAd() {
    document.getElementById('adPlaceholder').classList.add('overlay-hidden');
    // Give +1 life
    if (Game.lives < Game.maxLives) {
        Game.lives++;
        Game.updateHUD();
        document.getElementById('gameOverScreen').classList.add('overlay-hidden');
        Game.state = Game.isMultiplayer ? 'multiplayer' : 'solo';
        // Restart game loop
        requestAnimationFrame((t) => Game.gameLoop(t));
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
