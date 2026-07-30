# 🎤 VOICE RUNNER 🏃

**Voice Runner** adalah game *endless runner* HTML5 di mana kamu berlari, melompati rintangan, dan menggunakan **suara** untuk mengisi lubang! Tersedia mode **Solo** dan **Multiplayer 4 pemain** via Firebase.

---

## 📋 DAFTAR ISI

1. [Konsep Game](#-konsep-game)
2. [Cara Kerja](#-cara-kerja)
3. [Struktur File & Keamanan](#-struktur-file--keamanan)
4. [Cara Menjalankan](#-cara-menjalankan)
5. [Deploy ke Itch.io / Web](#-deploy-ke-itchio--web)
6. [Firebase Setup](#-firebase-setup)
7. [Cara Bermain](#-cara-bermain)
8. [Teknologi](#-teknologi)
9. [Lisensi](#-lisensi)

---

## 🎯 KONSEP GAME

```
┌─────────────────────────────────────────────┐
│           VOICE RUNNER                       │
│  Lari tanpa henti di Arena Gelap            │
│                                             │
│  ┌─────────┐                                │
│  │  ●/〰️\  │  ← Karakter siluet putih       │
│  │  /█\   │     berlari otomatis             │
│  └─────────┘                                │
│       ↓                                     │
│  Lompat 3 level:                            │
│   • Tap cepat  → Lompat rendah (Level 1)    │
│   • Tahan     → Lompat sedang (Level 2)     │
│   • Tahan lama → Lompat tinggi (Level 3)    │
│                                             │
│  Rintangan:                                  │
│   ■ Box (rendah)                             │
│   ▲ Spike (sedang)                           │
│   ▯ Pillar (tinggi)                          │
│                                             │
│  🕳️ Lubang + 🎤 Voice Challenge:             │
│     Baca teks melayang → Ucapkan →           │
│     Jatuh tutup lubang!                      │
│                                             │
│  3 ❤️ Nyawa = 3 Kesempatan                   │
└─────────────────────────────────────────────┘
```

**Game ini menggabungkan 3 elemen:**
- 🏃 **Endless Runner** — lari otomatis, lompati rintangan
- 🎤 **Voice Recognition** — ucapkan kata untuk mengisi lubang
- 👥 **Multiplayer** — 4 pemain online real-time via Firebase

---

## ⚙️ CARA KERJA

### 1. **State Machine (Game Flow)**
```
MAIN MENU
   ├── Start ──► Loading ──► Pilih Mode
   │                          ├── Solo ──► Countdown 3dtk ──► GAMEPLAY
   │                          └── Multiplayer ──► Room ──► Countdown ──► GAMEPLAY
   ├── Leaderboard ──► Lihat Skor (localStorage)
   ├── Settings ──► Musik, SFX, Mic Sensitivity, Reset Data
   └── Exit ──► Konfirmasi ──► Keluar
```

### 2. **Core Gameplay (game.js)**
- **Canvas Rendering**: Semua grafis digambar pakai Canvas 2D API — karakter siluet, rintangan, background, efek partikel
- **Fisika**: Gravity = 0.6, Jump Forces = [-11, -15, -19] untuk 3 level lompat
- **Speed Progression**: Kecepatan bertambah terus dari 5 → 14 (max)
- **Collision Detection**: AABB (Axis-Aligned Bounding Box) dengan margin 4px untuk fairness
- **Obstacle Generation**: Random procedural dengan minimum gap yang menyesuaikan speed

### 3. **Voice Recognition (game.js)**
- **Web Speech API** (Chrome only)
- **Fuzzy Matching**: Algoritma Levenshtein Distance — maksimal 2 karakter beda
- **Bahasa**: Indonesia (id-ID)
- **Sensitivity**: Bisa diatur di Settings (30% - 100%)
- **Fallback**: Jika browser tidak support voice, lubang otomatis terisi setelah 3 detik

### 4. **Multiplayer (multiplayer.js)**
- **Firebase Realtime Database** untuk sinkronisasi
- **Room Code**: 6 karakter alfanumerik (HURUF BESAR + ANGKA)
- **Password Opsional**: Proteksi room
- **Max 4 Pemain**: Host bisa mulai game jika ≥ 2 pemain
- **Real-time Sync**: Setiap 100ms update score/posisi/lives
- **Presence**: Auto-cleanup jika pemain disconnect

### 5. **Audio (audio.js)**
- **Web Audio API** untuk generate SFX (jump, hit, score, voice success/fail)
- **Music**: Load dari file `Music/Moavii - Foreign (freetouse.com).mp3`
- **Fallback**: Jika file MP3 tidak ditemukan, generate musik procedural

### 6. **Save System**
- **localStorage** untuk: leaderboard, settings, player name
- **Auto-save**: Settings tersimpan otomatis saat diubah
- **Reset Data**: Hapus semua data via Settings

---

## 🔒 STRUKTUR FILE & KEAMANAN

### 📁 `index.html`
**Fungsi**: Entry point game, semua UI/DOM elements
**Keamanan**:
- ✅ Tidak ada hardcoded credential di HTML
- ✅ Semua interaksi via fungsi global di `game.js`
- ⚠️ **Cara Tambah Link Itch.io**: Cari class `menu-footer` di HTML, tambahkan link Itch.io kamu di dalamnya
- ✅ Menggunakan Firebase CDN yang sudah divalidasi
- ⚠️ **PRIVASI**: Pastikan tidak ada API key Firebase di HTML publik — sudah dipisah di `multiplayer.js`

### 📁 `js/game.js`
**Fungsi**: Core engine — game loop, physics, rendering, collision, voice, state machine
**Keamanan**:
- ✅ **Input Validation**: Semua input pengguna divalidasi (trim, toUpperCase, dll)
- ✅ **localStorage**: Data disimpan dengan prefix `voiceRunner_` untuk menghindari konflik
- ✅ **try-catch**: Semua operasi kritis (speech recognition, localStorage) dibungkus try-catch
- ✅ **XSS Protection**: Tidak ada innerHTML dari input user — hanya teks aman
- ✅ **No eval()**: Tidak ada evaluasi kode dinamis
- ⚠️ **CARA GANTI MUSIK**: Cari `Music/Moavii - Foreign (freetouse.com).mp3` di `loadMusic()` — ganti path sesuai file MP3 kamu
- ⚠️ **TIDAK ADA VALIDASI SERVER**: Game ini 100% client-side. Jangan simpan data sensitif
- ⚠️ **Web Speech API**: Hanya aktif saat game berjalan, otomatis mati saat game over

### 📁 `js/multiplayer.js`
**Fungsi**: Firebase multiplayer — room management, real-time sync
**Keamanan**:
- ⚠️ **API Key Ter-ekspos**: API Key Firebase ada di file ini! Ini NORMAL untuk Firebase client-side, tapi:
  - ✅ Firebase Security Rules WAJIB dikonfigurasi (lihat bagian Setup)
  - ✅ Hanya operasi read/write ke path `/rooms/` yang diizinkan
  - ✅ Password room disimpan di Firebase (hash sebaiknya ditambahkan)
- ⚠️ **CARA GANTI FIREBASE CONFIG**: Cari `const firebaseConfig = {` lalu ganti seluruh object-nya dengan config dari project Firebase kamu
- ✅ **Presence System**: Auto-cleanup jika pemain disconnect
- ✅ **Host Protection**: Hanya host yang bisa start game
- ✅ **Room Capacity**: Maksimal 4 pemain per room
- ✅ **Input Validation**: Room code di-trim dan di-uppercase
- ⚠️ **Password Plaintext**: Password room dikirim plaintext — implementasi hash sederhana bisa ditambahkan

### 📁 `js/audio.js`
**Fungsi**: Manajemen audio — musik, SFX, Web Audio API
**Keamanan**:
- ✅ **Auto-init**: Audio context hanya dibuat saat user berinteraksi
- ✅ **Error Handling**: Graceful fallback jika file musik tidak ditemukan
- ✅ **Resource Management**: Audio source di-stop saat game over
- ⚠️ **CARA GANTI MUSIK**: Cari kode `fetch('Music/Moavii - Foreign (freetouse.com).mp3')` di `loadMusic()` — ganti dengan path file MP3 kamu sendiri
- ✅ **No External Requests**: SFX di-generate lokal, tidak ada request ke server lain
- ✅ **Volume Control**: User bisa toggle musik/SFX kapan saja

### 📁 `css/style.css`
**Fungsi**: Semua styling — menu, HUD, overlay, responsif
**Keamanan**:
- ✅ **No External Fonts**: Menggunakan system font stack + Inter dari Google Fonts (bisa di-cache)
- ✅ **No CSS Injection**: Semua style static, tidak ada dynamic CSS
- ✅ **Responsif**: Aman di berbagai ukuran layar

---

## 🚀 CARA MENJALANKAN

### Opsi 1: Langsung (Local)
```bash
# Buka file langsung di browser
C:\VoiceRunners\index.html

# Atau via terminal
start index.html
```

### Opsi 2: Local Server (Rekomendasi untuk Multiplayer)
```bash
# Pakai Python (bawaan Windows)
python -m http.server 8080

# Lalu buka
http://localhost:8080
```

### Opsi 3: VS Code Live Server
1. Install ekstensi "Live Server"
2. Klik kanan `index.html` → "Open with Live Server"

---

## 🌐 DEPLOY KE ITCH.IO / WEB

### Cara Upload ke Itch.io
```
1. Zip folder C:\VoiceRunners\ (isi: index.html + js/ + css/ + Music/ + assets/)
2. Buka https://itch.io/game/new
3. Pilih "HTML" sebagai platform
4. Upload file ZIP
5. Set **Viewport** ke: 1280×720 (atau sesuaikan)
6. Centang "This file will be played in the browser"
7. Klik "Save & view page"
```

### 🔗 **LINK YANG PERLU DIGANTI SETELAH DEPLOY**

#### 1. Ganti Link Musik (jika upload ke hosting sendiri)
**File**: `js/audio.js`
Cari:
```javascript
const response = await fetch('Music/Moavii - Foreign (freetouse.com).mp3');
```
Ganti dengan URL absolut:
```javascript
const response = await fetch('https://YOUR-SITE.com/Music/YOUR-MUSIC.mp3');
```

#### 2. Ganti Firebase Config (jika project Firebase baru)
**File**: `js/multiplayer.js`
Cari dan ganti object `firebaseConfig`:
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR.firebaseapp.com",
    databaseURL: "https://YOUR.firebaseio.com",
    projectId: "YOUR_PROJECT",
    ...
};
```

#### 3. Link ke Itch.io
Tambahkan di bagian footer `index.html` (cari class `menu-footer`):
```html
<p>🎮 Tersedia di <a href="https://YOUR-USERNAME.itch.io/YOUR-GAME" target="_blank">Itch.io</a></p>
```

#### 4. Social Share / OG Tags (untuk SEO)
Di `<head>` `index.html`, tambahkan:
```html
<meta property="og:title" content="Voice Runner">
<meta property="og:description" content="Lari. Lompat. Baca. Bertahan!">
<meta property="og:image" content="https://YOUR-SITE.com/thumbnail.png">
<meta property="og:url" content="https://YOUR-USERNAME.itch.io/YOUR-GAME">
```

---

## 🔥 FIREBASE SETUP

### 1. Buat Project Firebase
```bash
1. Buka https://console.firebase.google.com
2. Klik "Create a project" → beri nama "voice-runner"
3. Nonaktifkan Google Analytics (optional)
4. Klik "Create"
```

### 2. Aktifkan Realtime Database
```bash
1. Di sidebar kiri, klik "Realtime Database"
2. Klik "Create Database"
3. Pilih lokasi (recommended: asia-southeast1)
4. Pilih mode "Start in test mode" (sementara)
```

### 3. Konfigurasi Security Rules
```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true,
      "$room_id": {
        ".read": true,
        ".write": "!data.exists() || (data.child('status').val() === 'waiting')",
        "players": {
          "$player_id": {
            ".validate": "newData.hasChildren(['id', 'name', 'score'])",
            "score": { ".validate": "newData.isNumber()" },
            "name": { ".validate": "newData.isString() && newData.val().length <= 20" }
          }
        },
        "password": {
          ".read": "auth != null",
          ".write": "!data.exists()"
        }
      }
    }
  }
}
```

### 4. Copy Firebase Config
```bash
1. Di Project Overview → klik </> (Web)
2. Register app → beri nama "voice-runner-web"
3. Copy object firebaseConfig
4. Paste ke `js/multiplayer.js`
```

### ⚠️ **Peringatan Keamanan Firebase**
- API Key boleh publik (itu fitur Firebase), tapi **Security Rules WAJIB diperketat**
- Jangan simpan data sensitif di Realtime Database publik
- Password room saat ini plaintext — implementasi hash disarankan untuk production
- Rate limiting tidak diimplementasikan — bisa ditambahkan untuk mencegah spam room

---

## 🎮 CARA BERMAIN

### Kontrol
| Aksi | Keyboard | Mouse/Touch |
|------|----------|-------------|
| Lompat (tahan) | Spasi / ↑ | Klik/Tap + Tahan |
| Pause | Escape | Tombol ⏸ |
| Musik On/Off | - | Tombol 🎵 |

### Sistem Lompat 3 Level
| Level | Cara | Tinggi | Fungsi |
|-------|------|--------|--------|
| 1 | Tap cepat | Rendah | Hindari box rendah |
| 2 | Tahan sebentar (~0.3dtk) | Sedang | Hindari spike |
| 3 | Tahan lama (~0.7dtk) | Tinggi | Hindari pillar + lubang |

### Voice Challenge
```
1. 🕳️ Lubang muncul + teks melayang (contoh: "LARI")
2. 🎤 Baca teks itu dengan suara
3. ✅ Kalau cocok → lubang ketutup + bonus 50 poin
4. ❌ Kalau gagal / kehabisan waktu → jatuh ke lubang (-1 nyawa)
```

### Scoring
| Aksi | Poin |
|------|------|
| Melewati rintangan | +10 |
| Voice challenge berhasil | +50 |
| Jarak (per meter) | +2 |

---

## 🛠 TEKNOLOGI

| Teknologi | Kegunaan |
|-----------|----------|
| **HTML5 Canvas** | Semua rendering game (tanpa WebGL) |
| **Vanilla JavaScript** | Framework-free, ringan |
| **Web Speech API** | Voice recognition (Chrome only) |
| **Web Audio API** | Generate SFX & playback musik |
| **Firebase Realtime DB** | Multiplayer sync |
| **localStorage** | Save data & leaderboard |
| **CSS3 Animations** | UI transitions & effects |

### Browser Support
| Browser | Gameplay | Voice | Multiplayer |
|---------|----------|-------|-------------|
| Chrome ✅ | ✅ | ✅ | ✅ |
| Edge ✅ | ✅ | ✅ | ✅ |
| Firefox ✅ | ✅ | ❌ (no Web Speech) | ✅ |
| Safari ✅ | ✅ | ❌ (partial) | ✅ |
| Mobile Chrome ✅ | ✅ | ✅ | ✅ |

---

## 📄 LISENSI

**Voice Runner** © 2026 — Dibuat dengan ❤️ oleh tim Freebuff AI.

- Kode game: Bebas digunakan, dimodifikasi, dan didistribusikan
- Musik: `Moavii - Foreign (freetouse.com).mp3` — Gunakan sesuai lisensi dari freetouse.com
- Aset sprite: Dari sumber terbuka — cek lisensi masing-masing

---

> 💡 **Tip**: Untuk performa terbaik di Itch.io, pastikan tidak ada file > 50MB di ZIP. Game ini ~5.6MB termasuk musik.

> 🐛 **Laporkan bug**: Kalau nemu bug, tinggal bilang aja dan saya akan benerin!

---

**Selamat bermain! 🎤🏃💨**
