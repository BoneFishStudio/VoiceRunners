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
    
    // Game input lock (cegah jump sebelum game benar2 mulai)
    gameInputEnabled: false,
    keysPressed: {},
    
    // Voice
    currentVoiceText: null,
    activePit: null,
    isListening: false,
    recognition: null,
    micPermissionChecked: false,
    
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
        
        // Animate menu character
        this.animateMenuCharacter();
        
        // Input handlers
        this.setupInput();
        
        // Mulai musik untuk Main Menu
        this.startMusic();
        
        console.log('Voice Runner initialized!');
    },
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.player.groundY = this.canvas.height * GROUND_Y_RATIO;
        
        if (this.state === 'solo' || this.state === 'multiplayer' || this.state === 'paused') {
            this.player.y = this.player.groundY;
        }
    },
    
    generateBackground() {
        // Stars
        this.bgStars = [];
        for (let i = 0; i < 100; i++) {
            this.bgStars.push({
                x: Math.random() * 2000,
                y: Math.random() * this.canvas.height * 0.6,
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
        // Track key states untuk cegah jump bug
        this.keysPressed = {};
        
        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                if (this.keysPressed[e.code]) return; // Ignore repeat
                this.keysPressed[e.code] = true;
                if ((this.state === 'solo' || this.state === 'multiplayer') && this.gameInputEnabled) {
                    this.startJump();
                }
            }
            if (e.code === 'Escape') {
                if (this.state === 'solo' || this.state === 'multiplayer') {
                    this.togglePause();
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                this.keysPressed[e.code] = false;
                if ((this.state === 'solo' || this.state === 'multiplayer') && this.gameInputEnabled) {
                    this.releaseJump();
                }
            }
        });
        
        // Touch / Mouse (for canvas) - hanya proses saat gameInputEnabled
        this.canvas.addEventListener('mousedown', () => {
            if ((this.state === 'solo' || this.state === 'multiplayer') && this.gameInputEnabled) {
                this.startJump();
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            if (this.gameInputEnabled) {
                this.releaseJump();
            }
        });
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if ((this.state === 'solo' || this.state === 'multiplayer') && this.gameInputEnabled) {
                this.startJump();
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.gameInputEnabled) {
                this.releaseJump();
            }
        });
    },
    
    // ===== ANIMASI KARAKTER DI MENU =====
    
    animateMenuCharacter() {
        // Prevent multiple animation loops
        if (this._menuAnimRunning) return;
        this._menuAnimRunning = true;
        
        const menuCanvas = document.getElementById('menuCharacterCanvas');
        if (!menuCanvas) return;
        const ctx = menuCanvas.getContext('2d');
        let frame = 0;
        
        const animate = () => {
            // Stop if menu not active
            const menu = document.getElementById('mainMenu');
            if (!menu || !menu.classList.contains('active')) return;
            
            const w = menuCanvas.width = menuCanvas.clientWidth;
            const h = menuCanvas.height = menuCanvas.clientHeight;
            ctx.clearRect(0, 0, w, h);
            
            // Ground line
            const groundY = h * 0.8;
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            ctx.lineTo(w, groundY);
            ctx.stroke();
            
            // Stars
            if (!this._menuStars) {
                this._menuStars = [];
                for (let i = 0; i < 40; i++) {
                    this._menuStars.push({
                        x: Math.random() * w,
                        y: Math.random() * h * 0.6,
                        s: Math.random() * 1.5 + 0.5,
                        b: Math.random() * 0.3 + 0.1
                    });
                }
            }
            
            for (const star of this._menuStars) {
                const twinkle = 0.5 + Math.sin(frame * 0.05 + star.x) * 0.3;
                ctx.globalAlpha = star.b * twinkle;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            
            // Draw running character (more detailed for menu)
            const cx = w * 0.5;
            const cy = groundY;
            const runCycle = (frame / 8) * Math.PI * 2;
            const bounce = Math.abs(Math.sin(runCycle)) * 5;
            const legSwing = Math.sin(runCycle) * 12;
            const armSwing = Math.sin(runCycle + Math.PI) * 10;
            
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(255,255,255,0.2)';
            ctx.shadowBlur = 20;
            
            // Body
            ctx.fillRect(cx - 6, cy - 50 + bounce, 12, 22);
            
            // Head
            ctx.beginPath();
            ctx.arc(cx, cy - 58 + bounce, 10, 0, Math.PI * 2);
            ctx.fill();
            
            // Arms
            ctx.save();
            ctx.translate(cx - 5, cy - 44 + bounce);
            ctx.rotate(armSwing * 0.03);
            ctx.fillRect(-12, 0, 5, 15);
            ctx.restore();
            ctx.save();
            ctx.translate(cx + 5, cy - 44 + bounce);
            ctx.rotate(-armSwing * 0.03);
            ctx.fillRect(7, 0, 5, 15);
            ctx.restore();
            
            // Legs
            ctx.save();
            ctx.translate(cx - 4, cy - 28 + bounce);
            ctx.rotate(legSwing * 0.04);
            ctx.fillRect(-6, 0, 5, 18);
            ctx.restore();
            ctx.save();
            ctx.translate(cx + 4, cy - 28 + bounce);
            ctx.rotate(-legSwing * 0.04);
            ctx.fillRect(1, 0, 5, 18);
            ctx.restore();
            
            // Speed trail
            for (let i = 1; i <= 3; i++) {
                ctx.globalAlpha = 0.15 / i;
                ctx.fillRect(cx - 20 - i * 10 + Math.sin(runCycle + i) * 5, cy - 5 + Math.random() * 10, 8, 3);
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            
            frame = (frame + 1) % 16;
            requestAnimationFrame(animate);
        };
        
        animate();
    },
    
    _menuAnimRunning: false,
    
    // ===== GAME LOOP =====
    
    startSolo() {
        this.showCanvas();
        this.gameInputEnabled = false; // Lock input sampai countdown selesai
        this.isMultiplayer = false;
        this.resetGame();
        this.startCountdown();
    },
    
    startMultiplayer() {
        this.showCanvas();
        this.gameInputEnabled = false; // Lock input sampai countdown selesai
        this.isMultiplayer = true;
        this.resetGame();
        this.startCountdown();
    },
    
    showCanvas() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('gameCanvas').style.display = 'block';
        document.getElementById('gameOverlay').style.display = 'block';
        document.getElementById('pauseMenu').classList.add('overlay-hidden');
        document.getElementById('gameOverScreen').classList.add('overlay-hidden');
        document.getElementById('winScreen').classList.add('overlay-hidden');
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
        if (this.state === 'menu' || this.state === 'loading' || this.state === 'modeSelect') return;
        
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
                        this.gameInputEnabled = true; // Unlock input setelah countdown selesai!
                        // Reset key states
                        this.keysPressed = {};
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
        
        // Update obstacles
        this.updateObstacles();
        
        // Update pits
        this.updatePits();
        
        // Update floating texts
        this.updateFloatingTexts();
        
        // Update particles
        this.updateParticles();
        
        // Update background mountains
        this.updateMountains();
        
        // Check for pit collision
        this.checkPitCollision();
        
        // Shake decay
        if (this.shakeAmount > 0) {
            this.shakeAmount *= this.shakeDecay;
            if (this.shakeAmount < 0.5) this.shakeAmount = 0;
        }
        
        // Update score (based on distance)
        this.score = Math.floor(this.distance * 2 + this.frameCount * 0.5);
        
        // Update HUD
        this.updateHUD();
    },
    
    updatePlayer() {
        const p = this.player;
        
        // Gravity
        if (p.y < p.groundY) {
            p.vy += GRAVITY;
        }
        
        p.y += p.vy;
        
        // Ground collision
        if (p.y >= p.groundY) {
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
    },
    
    startJump() {
        const p = this.player;
        if (p.y >= p.groundY && !p.isJumping) {
            p.isCharging = true;
            p.jumpCharge = 0;
            // Squash before jump
            p.squash = 0.85;
        }
    },
    
    releaseJump() {
        const p = this.player;
        if (p.isCharging && p.y >= p.groundY && !p.isJumping) {
            p.isCharging = false;
            p.isJumping = true;
            
            // Determine jump level based on charge time
            let level = 1;
            if (p.jumpCharge > 0.6) level = 3;
            else if (p.jumpCharge > 0.25) level = 2;
            
            p.jumpLevel = level;
            p.vy = JUMP_FORCES[level];
            
            // Stretch on jump
            p.stretch = 1.2;
            
            AudioManager.playSFX('jump');
            
            // Jump particles
            this.emitParticles(p.x, p.groundY, 5);
        }
        p.isCharging = false;
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
    
    createObstacle() {
        const height = Math.random();
        let obsHeight, obsY;
        
        if (height < 0.33) {
            // Low obstacle
            obsHeight = 20 + Math.random() * 10;
            obsY = this.player.groundY - obsHeight;
        } else if (height < 0.66) {
            // Medium obstacle
            obsHeight = 35 + Math.random() * 10;
            obsY = this.player.groundY - obsHeight;
        } else {
            // High obstacle
            obsHeight = 50 + Math.random() * 10;
            obsY = this.player.groundY - obsHeight;
        }
        
        this.obstacles.push({
            x: this.canvas.width + 50,
            y: obsY,
            width: 15 + Math.random() * 10,
            height: obsHeight,
            type: Math.floor(Math.random() * 3), // 0: box, 1: spike, 2: pillar
            passed: false
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
            x: this.canvas.width + 50,
            width: pitWidth,
            text: text,
            active: true,
            filled: false,
            failed: false
        };
        
        // Create floating text with animation properties
        this.floatingTexts.push({
            x: this.canvas.width + 50 + pitWidth / 2,
            y: this.canvas.height * 0.4,
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
                this.bgMountains[i].x = this.canvas.width + Math.random() * 100;
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
        const w = this.canvas.width;
        const h = this.canvas.height;
        
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
    },
    
    drawGround(ctx, w, h) {
        const gy = this.player.groundY;
        
        // Ground line
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
        
        // Ground texture
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = -20; i < w + 20; i += 20) {
            const gx = i + this.groundX;
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx + 5, gy + 5);
            ctx.stroke();
        }
        
        ctx.restore();
        
        // Speed lines at high speed
        if (this.gameSpeed > 8) {
            ctx.save();
            ctx.globalAlpha = (this.gameSpeed - 8) / 10 * 0.3;
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 8; i++) {
                const lx = (Math.random() * w + this.frameCount * 5) % (w + 100) - 50;
                const ly = Math.random() * h * 0.6;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(lx - 30 - Math.random() * 20, ly);
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
        
        // Apply squash and stretch
        const sw = 1 / p.squash * p.stretch;
        const sh = p.squash / p.stretch;
        
        ctx.translate(px, py);
        ctx.scale(sw, sh);
        
        // Glow effect
        ctx.shadowColor = 'rgba(255,255,255,0.15)';
        ctx.shadowBlur = 15;
        
        // Draw running black silhouette character
        ctx.fillStyle = '#fff';
        
        const runCycle = p.isJumping ? 0 : (p.animFrame / 6) * Math.PI * 2;
        const bounce = p.isJumping ? 0 : Math.abs(Math.sin(runCycle)) * 3;
        const legSwing = Math.sin(runCycle) * 8;
        const armSwing = Math.sin(runCycle + Math.PI) * 8;
        
        // Body
        ctx.fillRect(-5, -35 + bounce, 10, 18);
        
        // Head
        ctx.beginPath();
        ctx.arc(0, -40 + bounce, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Arms
        ctx.save();
        ctx.translate(-3, -30 + bounce);
        ctx.rotate(armSwing * 0.03);
        ctx.fillRect(-9, 0, 4, 12);
        ctx.restore();
        
        ctx.save();
        ctx.translate(3, -30 + bounce);
        ctx.rotate(-armSwing * 0.03);
        ctx.fillRect(5, 0, 4, 12);
        ctx.restore();
        
        // Legs
        ctx.save();
        ctx.translate(-3, -17 + bounce);
        ctx.rotate(legSwing * 0.04);
        ctx.fillRect(-5, 0, 4, 14);
        ctx.restore();
        
        ctx.save();
        ctx.translate(3, -17 + bounce);
        ctx.rotate(-legSwing * 0.04);
        ctx.fillRect(1, 0, 4, 14);
        ctx.restore();
        
        // Trail effect when running fast
        if (this.gameSpeed > 7 && !p.isJumping) {
            ctx.globalAlpha = 0.2 * ((this.gameSpeed - 7) / 5);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-15 - Math.random() * 10, -5, 5, 4);
        }
        
        ctx.restore();
    },
    
    drawObstacles(ctx) {
        for (const obs of this.obstacles) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(255,255,255,0.1)';
            ctx.shadowBlur = 5;
            
            switch(obs.type) {
                case 0: // Box
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                    // Inner detail
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(obs.x + 3, obs.y + 3, obs.width - 6, obs.height - 6);
                    break;
                    
                case 1: // Spike
                    ctx.beginPath();
                    ctx.moveTo(obs.x, obs.y + obs.height);
                    ctx.lineTo(obs.x + obs.width / 2, obs.y);
                    ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
                    ctx.closePath();
                    ctx.fill();
                    break;
                    
                case 2: // Pillar
                    ctx.fillRect(obs.x + 2, obs.y, obs.width - 4, obs.height);
                    // Top cap
                    ctx.fillRect(obs.x, obs.y - 3, obs.width, 5);
                    break;
            }
            
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
            ctx.fillStyle = `rgba(255,255,255,${p.life})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
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
    document.getElementById('gameCanvas').style.display = 'none';
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
    
    // Restart animasi karakter di menu
    setTimeout(() => { Game.animateMenuCharacter(); }, 100);
    
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
        
        if (leaderboard.length === 0) {
            list.innerHTML = '<div class="lb-empty">Belum ada skor. Ayo main!</div>';
            return;
        }
        
        leaderboard.forEach((entry, index) => {
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
