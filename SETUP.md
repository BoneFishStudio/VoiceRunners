# ⚙️ SETUP GUIDE — Voice Runner

> **README.md** berisi info publik (cara main, fitur, teknologi).  
> **SETUP.md ini** berisi semua konfigurasi rahasia & teknis — cocok untuk developer.

---

## 📋 DAFTAR ISI

1. [🔥 Firebase Setup](#-firebase-setup)
2. [🌐 Vercel Deployment](#-vercel-deployment)
3. [🤫 GitHub Secrets Guide](#-github-secrets-guide)
4. [🎵 Ganti Musik](#-ganti-musik)
5. [🔗 Update Link & Social](#-update-link--social)
6. [🛠️ Troubleshooting](#-troubleshooting)

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

### 3. Security Rules (WAJIB!)

⚠️ **Jangan publish game dengan test mode!**  
Copy-paste rules berikut ke Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": "false",
      "$room_id": {
        ".read": true,
        ".write": "!data.exists() || (data.child('status').val() === 'waiting')",
        "players": {
          "$player_id": {
            ".validate": "newData.hasChildren(['id', 'name', 'score', 'distance', 'lives', 'alive', 'ready', 'joinedAt'])",
            "id": { ".validate": "newData.isString()" },
            "name": { ".validate": "newData.isString() && newData.val().length <= 20" },
            "score": { ".validate": "newData.isNumber()" },
            "distance": { ".validate": "newData.isNumber()" },
            "lives": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 3" },
            "alive": { ".validate": "newData.isBoolean()" },
            "ready": { ".validate": "newData.isBoolean()" },
            "joinedAt": { ".validate": "newData.isNumber()" }
          }
        },
        "playerOrder": {
          ".validate": "newData.hasChildren()"
        },
        "host": { ".validate": "newData.isString()" },
        "status": { ".validate": "newData.isString() && (newData.val() === 'waiting' || newData.val() === 'playing')" },
        "seed": { ".validate": "newData.isNumber()" },
        "maxPlayers": { ".validate": "newData.isNumber() && newData.val() >= 2 && newData.val() <= 4" },
        "password": {
          ".write": "!data.exists()",
          ".validate": "newData.isString() && newData.val().length <= 64"
        },
        "createdAt": { ".validate": "newData.isNumber()" },
        "startTime": { ".validate": "newData.isNumber()" },
        "gameState": {
          "started": { ".validate": "newData.isBoolean()" },
          "seed": { ".validate": "newData.isNumber()" },
          "timestamp": { ".validate": "newData.isNumber()" },
          "finished": { ".validate": "newData.isBoolean()" },
          "finishTime": { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        }
      }
    }
  }
}
```

### 4. Copy Firebase Config ke `js/multiplayer.js`

```bash
1. Di Firebase Console → Project Overview → klik </> (Web)
2. Register app → beri nama "voice-runner-web"
3. Copy object firebaseConfig
4. Buka file `js/multiplayer.js`
5. Cari `const firebaseConfig = {`
6. Ganti dengan config barumu
```

**Ganti dengan punyamu:**
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR.firebaseapp.com",
    databaseURL: "https://YOUR-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "1:YOUR_APP_ID"
};
```

> ⚠️ API Key Firebase BOLEH publik (itu memang desainnya).  
> **TAPI** Security Rules WAJIB diperketat (langkah 3) agar data tetap aman.
> File `js/multiplayer.js` sudah berisi config kerja — ganti dengan project Firebase-mu sendiri kalau perlu.


---

## 🌐 VERCEL DEPLOYMENT

### Manual via Dashboard

```bash
1. Push repo ke GitHub
2. Buka https://vercel.com/new
3. Import repo → Framework: "Other"
4. Root: ./ → Build: (kosong) → Output: ./
5. Klik "Deploy" → selesai!
```

### Otomatis via GitHub Actions

Proyek ini sudah punya `.github/workflows/deploy.yml`.  
Cukup tambahkan **3 Secrets** di GitHub, setiap push ke `main` auto-deploy.

---

## 🤫 GITHUB SECRETS GUIDE

Buka repository GitHub → **Settings** → **Secrets and variables** → **Actions** → New repository secret.

### Wajib: `VERCEL_TOKEN`

```bash
1. Buka https://vercel.com/account/tokens
2. Klik "Create Token"
3. Beri nama "voice-runner-github-actions"
4. Scope: "Full Deployment"
5. Copy token (misal: "abc123def456...")
6. Simpan sebagai GitHub Secret: VERCEL_TOKEN
```

### Opsional: `VERCEL_ORG_ID`

Hanya diperlukan kalau pakai Vercel Team (bukan personal account).

```bash
# Cara cek:
npm install -g vercel
vercel login
vercel pull
cat .vercel/project.json   # Lihat field "orgId"
```

### Opsional: Notifikasi Telegram

```bash
TELEGRAM_BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
TELEGRAM_CHAT_ID  = "123456789"
```

Cara dapat:
1. Chat @BotFather di Telegram → buat bot → dapat token
2. Chat @userinfobot → dapat chat ID

---

## 🎵 GANTI MUSIK

**File**: `js/audio.js`

Cari kode berikut:
```javascript
const response = await fetch('Music/Moavii - Foreign (freetouse.com).mp3');
```

Ganti dengan file MP3 kamu:
```javascript
// Opsi 1: File lokal di folder Music/
const response = await fetch('Music/NASAMU.mp3');

// Opsi 2: URL absolut
const response = await fetch('https://domain-mu.com/music/lagu.mp3');
```

Kalau file MP3 tidak ditemukan, game otomatis pakai **generated music** (musik procedural).

---

## 🔗 UPDATE LINK & SOCIAL

### Link Itch.io

**File**: `index.html`  
Cari class `menu-footer`, tambahkan:
```html
<p>🎮 Tersedia di <a href="https://username.itch.io/voice-runner">Itch.io</a></p>
```

### OG Tags (Social Share)

**File**: `index.html` — di dalam `<head>`:
```html
<meta property="og:title" content="Voice Runner">
<meta property="og:description" content="Lari. Lompat. Baca. Bertahan!">
<meta property="og:image" content="https://domain-mu.com/thumbnail.png">
<meta property="og:url" content="https://domain-mu.com">
```

---

## 🛠️ TROUBLESHOOTING

### Multiplayer tidak connect
```bash
1. Cek koneksi internet
2. Cek Firebase Console → Realtime Database → Rules — apakah masih test mode?
3. Cek console browser (F12) untuk error Firebase
```

### Musik tidak jalan
```bash
1. Cek apakah file MP3 ada di folder Music/
2. Buka console browser — ada error 404?
3. Pastikan user sudah klik di halaman (AudioContext butuh user gesture)
```

### Voice tidak berfungsi
```bash
1. Chrome/Edge only (Firefox & Safari tidak support Web Speech API)
2. Cek izin mic di browser (🔒 di address bar)
3. Cek Settings game → Mic Sensitivity
```

### Deploy Vercel gagal
```bash
1. Cek GitHub Actions → buka workflow → lihat error
2. Pastikan VERCEL_TOKEN valid (bisa kadaluarsa)
3. Cek file vercel.json — valid JSON?
```

---

> **Ada masalah lain?** Langsung tanya aja! 🎤
