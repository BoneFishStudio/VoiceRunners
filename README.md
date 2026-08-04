# 🎤 VOICE RUNNER 🏃

**Endless Runner HTML5** — lari otomatis, lompat pakai **suara**, isi lubang dengan **voice challenge**, dan main bareng 4 pemain via **multiplayer real-time**!

## 🎮 MAIN SEKARANG

[![Main di Itch.io](https://img.shields.io/badge/Itch.io-Main%20di%20Itch-FF5C5C?style=for-the-badge&logo=itchdotio&logoColor=white)](https://mardev1.itch.io/voice-runner)
[![Main Online](https://img.shields.io/badge/Vercel-Main%20Online-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://voicerunners.vercel.app)
[![Bergabung dengan Komunitas](https://img.shields.io/badge/Discord-Bergabung%20dengan%20Komunitas-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/HbW8kJTJxf)
[![Source Code](https://img.shields.io/badge/GitHub-Source%20Code-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/BoneFishStudio/VoiceRunners)

> ⚡ **Coba cepat**: Buka `index.html` di browser (Chrome/Edge rekomendasi)

---

## ✨ FITUR UTAMA

| Fitur | Deskripsi |
|-------|-----------|
| 🏃 **Endless Runner** | Lari otomatis, lompati rintangan dengan suara |
| 🗣️ **Voice Jump** | Keras = lompat tinggi, pelan = lompat rendah |
| 🎤 **Voice Challenge** | TERIAK keras untuk memecahkan balon & mengisi lubang |
| 👥 **Multiplayer 4P** | Online real-time via Firebase |
| 📍 **Checkpoint** | Auto-save tiap 500m, respawn kalau mati |
| 🏆 **Leaderboard** | Lokal + Global (Firebase, anonymous auth) |
| 📱 **PWA** | Installable, offline shell via service worker |

---

## 🎮 CARA BERMAIN

### Lompat dengan Suara!
```
🔇 Pelan   → Lompat rendah  → Hindari SPIKE
🗣️ Normal  → Lompat sedang  → Hindari BOX  
📢 KERAS   → Lompat tinggi  → Hindari TIANG
```

### Voice Challenge (TERIAK!)
```
🕳️ Lubang muncul + balon & kotak di atasnya
🎤 TERIAK KERAS (volume di atas threshold) beberapa frame
💥 Balon pecah → kotak jatuh → lubang ketutup + bonus 50 poin
❌ Diam saja → balon tidak pecah → jatuh ke lubang (-1 nyawa)
```
> Tanpa mikrofon (ditolak/unsupported): lubang terisi otomatis setelah ±2.5 detik.

### Scoring
| Aksi | Poin |
|------|------|
| Lewati rintangan | +10 |
| Voice challenge | +50 |
| Jarak (per meter) | +2 |

---

## 🚀 DEPLOY

### Vercel (Rekomendasi 🎯)
```bash
1. Push repo ke GitHub
2. Buka https://vercel.com/new → Import repo
3. Framework: "Other" → Deploy!
```

### Itch.io
Game sudah live di: **https://mardev1.itch.io/voice-runner** 🎉

```bash
1. Zip folder (index.html + js/ + css/ + Music/ + assets/ + manifest.json + sw.js)
2. Upload ke https://itch.io/game/new sebagai HTML
3. Set viewport ke **1280x720**
```

#### 🖼️ Embed Itch.io di website/README-mu
```html
<iframe src="https://itch.io/embed/GAME_ID?bg_color=0f0f1a&fg_color=ffffff&link_color=4bb8ff&border_color=333333" width="552" height="167" frameborder="0"><a href="https://mardev1.itch.io/voice-runner">Voice Runner by mardev1</a></iframe>
```
> 💡 **Cara dapat `GAME_ID`**: buka halaman game itch.io-mu → klik tombol **Embed** → salin angka di URL `https://itch.io/embed/<GAME_ID>` → ganti `GAME_ID` di kode di atas.

---

## 🤝 KOMUNITAS

Bergabung dengan komunitas **Voice Runner** — diskusi, lapor bug, request fitur, atau sekadar nongkrong:

[![Bergabung dengan Komunitas](https://img.shields.io/badge/Discord-Bergabung%20dengan%20Komunitas-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/HbW8kJTJxf)

| Platform | Link |
|----------|------|
| 💬 **Discord** | [discord.gg/HbW8kJTJxf](https://discord.gg/HbW8kJTJxf)
| 🐙 **GitHub** | [BoneFishStudio/VoiceRunners](https://github.com/BoneFishStudio/VoiceRunners) — issues & discussions
| 🎮 **Itch.io** | [mardev1.itch.io/voice-runner](https://mardev1.itch.io/voice-runner)
| 🌐 **Main Online** | [voicerunners.vercel.app](https://voicerunners.vercel.app)

---

## 🛠 TEKNOLOGI

| Teknologi | Untuk |
|-----------|-------|
| HTML5 Canvas | Semua rendering game |
| Vanilla JS | Framework-free |
| Web Audio API | Voice volume (lompat & isi lubang) + SFX + musik |
| Firebase RTDB | Multiplayer sync + leaderboard global |
| Firebase Auth | Anonymous auth (identitas pemain) |
| Service Worker | PWA offline shell |
| localStorage | Save data + cache skor |

### Browser Support
Voice pakai **Web Audio API (AnalyserNode)** — jalan di semua browser modern yang mendukung `getUserMedia` (bukan lagi SpeechRecognition yang cuma Chrome). Kalau izin mic ditolak, ada fallback otomatis.

| Browser | Game | Voice | Multiplayer |
|---------|------|-------|-------------|
| Chrome ✅ | ✅ | ✅ | ✅ |
| Edge ✅ | ✅ | ✅ | ✅ |
| Firefox ✅ | ✅ | ✅ | ✅ |
| Safari ✅ | ✅ | ✅ | ✅ |

---

## 📁 STRUKTUR FILE

```
📦 VoiceRunner
├── 📄 index.html        → Entry point + semua UI
├── 📄 manifest.json     → PWA manifest
├── 📄 sw.js             → Service worker (offline shell)
├── 📄 vercel.json       → Config Vercel
├── 📁 js/
│   ├── 📄 game.js       → Core engine (game loop, physics, voice)
│   ├── 📄 audio.js      → Web Audio API (musik + SFX)
│   └── 📄 multiplayer.js → Firebase multiplayer + auth + leaderboard global
├── 📁 css/
│   └── 📄 style.css     → Styling
├── 📁 Music/             → File musik MP3
├── 📁 assets/            → Sprite, ikon PWA & aset
└── 📁 .github/workflows/ → CI/CD auto-deploy ke Vercel + build Electron
```

---

## 🔒 FIREBASE SETUP (MANUAL DI CONSOLE — SEKALI SAJA)

> ⚠️ **Tidak ada secret/config Firebase di repo ini.** Rules lengkap disimpan di [`docs/firebase-rules.json`](docs/firebase-rules.json).

Lakukan ini di **Firebase Console → project `server-ba906`**:

1. **Authentication → Sign-in method → Anonymous** → **Aktifkan** ✅
2. **Realtime Database → Rules** → paste isi `docs/firebase-rules.json` (gabung dengan rules rooms yang sudah ada)
3. **Realtime Database → Rules** — pastikan field `gameState` tetap divalidasi seperti rules yang kamu pakai sebelumnya

> Catatan: `firebaseConfig` (apiKey, dsb.) hanya ada di `js/multiplayer.js` — wajib ada di client dan **bukan rahasia** (keamanan diatur oleh Security Rules + Auth, bukan menyembunyikan apiKey).

---

## 🏠 LOCAL DEVELOPMENT

```bash
# Pakai Python (recommended)
python -m http.server 8080
# Buka http://localhost:8080

# Atau VS Code Live Server
# Klik kanan index.html → Open with Live Server
```

---

## 📄 LISENSI

- **Kode**: Open source — bebas pakai & modifikasi
- **Musik**: `Music/Moavii - Foreign (freetouse.com).mp3` — bebas royalti dari [freetouse.com](https://freetouse.com), atribusi: *"Music: Moavii - Foreign (freetouse.com)"*
- **Sprite**: Buatan sendiri

---

> 🐛 **Ada bug? Mau nambah fitur?** Tinggal bilang aja!
