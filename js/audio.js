/* ============================
   AUDIO.JS - Manajemen Suara & Musik
   ============================ */

const AudioManager = {
    musicEnabled: true,
    sfxEnabled: true,
    musicVolume: 0.3,
    sfxVolume: 0.5,
    
    audioContext: null,
    musicSource: null,
    musicGain: null,
    musicBuffer: null,
    isPlaying: false,
    
    // Daftar efek suara (generated dengan Web Audio API)
    sfx: {},
    
    init() {
        // Load settings
        const saved = localStorage.getItem('voiceRunner_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                this.musicEnabled = s.music !== undefined ? s.music : true;
                this.sfxEnabled = s.sfx !== undefined ? s.sfx : true;
            } catch(e) {}
        }
        
        // Sync UI
        const musicToggle = document.getElementById('musicToggle');
        const sfxToggle = document.getElementById('sfxToggle');
        if (musicToggle) musicToggle.checked = this.musicEnabled;
        if (sfxToggle) sfxToggle.checked = this.sfxEnabled;
    },
    
    async initAudioContext() {
        // FIX: JANGAN short-circuit kalau audioContext sudah ada — bisa jadi
        // audioContext dibuat duluan oleh startVoiceVolumeDetection (mic),
        // dan kalau kita return di sini, loadMusic() + generateSFX() tidak
        // pernah jalan → game bisu total. Pakai flag _initDone terpisah.
        if (this._initDone) return;
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (!this.musicGain) {
                this.musicGain = this.audioContext.createGain();
                this.musicGain.gain.value = this.musicVolume;
                this.musicGain.connect(this.audioContext.destination);
            }
            
            // Generate SFX (sekali saja)
            if (Object.keys(this.sfx).length === 0) {
                this.generateSFX();
            }
            
            // Load music (sekali saja — file MP3 5.1MB di-fetch lazy)
            if (!this.musicBuffer) {
                await this.loadMusic();
            }
            
            this._initDone = true;
            
            // Auto-start musik begitu buffer siap
            this.startMusic();
            
            console.log('Audio system initialized');
        } catch(e) {
            console.warn('Audio init failed:', e);
        }
    },
    
    generateSFX() {
        if (!this.audioContext) return;
        
        // Jump sound
        this.sfx.jump = this.createBeep(200, 0.15, 'sine');
        // Score sound
        this.sfx.score = this.createBeep(600, 0.1, 'sine');
        // Hit sound
        this.sfx.hit = this.createNoise(0.3);
        // Voice success
        this.sfx.voiceSuccess = this.createBeep(800, 0.2, 'sine', true);
        // Voice fail
        this.sfx.voiceFail = this.createBeep(200, 0.3, 'sawtooth');
        // Countdown
        this.sfx.countdown = this.createBeep(440, 0.15, 'sine');
        // Go!
        this.sfx.go = this.createBeep(880, 0.3, 'sine', true);
    },
    
    createBeep(freq, duration, type = 'sine', rising = false) {
        const ctx = this.audioContext;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const freq2 = rising ? freq + (freq * t / duration) : freq;
            const envelope = Math.max(0, 1 - (t / duration));
            let sample = 0;
            
            switch(type) {
                case 'sine':
                    sample = Math.sin(2 * Math.PI * freq2 * t);
                    break;
                case 'sawtooth':
                    sample = 2 * (freq2 * t - Math.floor(freq2 * t + 0.5));
                    break;
                case 'square':
                    sample = Math.sin(2 * Math.PI * freq2 * t) > 0 ? 1 : -1;
                    break;
            }
            
            data[i] = sample * envelope * 0.3;
        }
        
        return buffer;
    },
    
    createNoise(duration) {
        const ctx = this.audioContext;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const envelope = Math.max(0, 1 - (t / duration));
            data[i] = (Math.random() * 2 - 1) * envelope * 0.3;
        }
        
        return buffer;
    },
    
    async loadMusic() {
        try {
            // Coba load dari folder Music
            const response = await fetch('Music/Moavii - Foreign (freetouse.com).mp3');
            if (!response.ok) throw new Error('Music file not found');
            
            const arrayBuffer = await response.arrayBuffer();
            this.musicBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('Music loaded successfully');
        } catch(e) {
            console.warn('Could not load music file, using generated music:', e.message);
            // Buat generated music sebagai fallback
            this.musicBuffer = this.generateBackgroundMusic();
        }
    },
    
    generateBackgroundMusic() {
        // Simple generated background music (looping beat)
        const ctx = this.audioContext;
        const bpm = 140;
        const beatsPerMeasure = 4;
        const measures = 4;
        const totalBeats = beatsPerMeasure * measures;
        const beatDuration = 60 / bpm;
        const totalDuration = totalBeats * beatDuration;
        
        const bufferSize = ctx.sampleRate * totalDuration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Simple bass line
        const notes = [110, 110, 130.81, 146.83]; // A2, A2, C3, D3
        
        for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const beat = t / beatDuration;
            const beatIndex = Math.floor(beat) % totalBeats;
            const measureBeat = beatIndex % beatsPerMeasure;
            const noteIndex = Math.floor(beatIndex / beatsPerMeasure);
            
            const freq = notes[noteIndex] || 110;
            const beatPhase = beat - Math.floor(beat);
            
            // Kick on each beat
            let sample = 0;
            if (beatPhase < 0.1) {
                const kick = Math.sin(2 * Math.PI * (80 - beatPhase * 500) * (t % beatDuration)) * (1 - beatPhase * 10);
                sample += kick * 0.4;
            }
            
            // Hi-hat on off-beats
            if (beatPhase > 0.5 && beatPhase < 0.55) {
                sample += (Math.random() * 2 - 1) * 0.1;
            }
            
            // Bass note
            const bassPhase = (freq * t) % 1;
            const bassEnv = Math.max(0, 1 - (beatPhase * 2));
            sample += Math.sin(2 * Math.PI * freq * t) * bassEnv * 0.15;
            
            data[i] = Math.max(-1, Math.min(1, sample));
        }
        
        return buffer;
    },
    
    startMusic() {
        if (!this.musicBuffer || !this.musicGain || !this.musicEnabled || this.isPlaying) return;
        if (!this.audioContext) return;
        
        try {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            this.musicSource = this.audioContext.createBufferSource();
            this.musicSource.buffer = this.musicBuffer;
            this.musicSource.loop = true;
            this.musicSource.connect(this.musicGain);
            this.musicSource.start(0);
            this.isPlaying = true;
        } catch(e) {
            console.warn('Could not start music:', e);
        }
    },
    
    stopMusic() {
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch(e) {}
            this.musicSource = null;
        }
        this.isPlaying = false;
    },
    
    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        if (this.musicEnabled) {
            this.startMusic();
        } else {
            this.stopMusic();
        }
        this.saveSettings();
        return this.musicEnabled;
    },
    
    toggleSfx() {
        this.sfxEnabled = !this.sfxEnabled;
        this.saveSettings();
        return this.sfxEnabled;
    },
    
    playSFX(name) {
        if (!this.sfxEnabled || !this.audioContext || !this.sfx[name]) return;
        try {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            const source = this.audioContext.createBufferSource();
            source.buffer = this.sfx[name];
            const gain = this.audioContext.createGain();
            gain.gain.value = this.sfxVolume;
            source.connect(gain);
            gain.connect(this.audioContext.destination);
            source.start(0);
        } catch(e) {}
    },
    
    saveSettings() {
        localStorage.setItem('voiceRunner_settings', JSON.stringify({
            music: this.musicEnabled,
            sfx: this.sfxEnabled
        }));
    },
    
    getMicSensitivity() {
        const saved = localStorage.getItem('voiceRunner_micSensitivity');
        return saved ? parseFloat(saved) : 0.7;
    },
    
    setMicSensitivity(val) {
        localStorage.setItem('voiceRunner_micSensitivity', val.toString());
    }
};
