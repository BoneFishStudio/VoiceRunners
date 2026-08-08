# 🎤 VOICE RUNNER 🏃

**Endless Runner HTML5** — lari otomatis, lompat pakai **suara**, isi lubang dengan **voice challenge**, dan main bareng 4 pemain via **multiplayer real-time**!

## 🎮 MAIN SEKARANG

[![Main di Itch.io](https://img.shields.io/badge/Itch.io-Main%20di%20Itch-FF5C5C?style=for-the-badge&logo=itchdotio&logoColor=white)](https://mardev1.itch.io/voice-runner)
[![Main Online](https://img.shields.io/badge/Vercel-Main%20Online-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://voicerunners.vercel.app)
[![Bergabung dengan Komunitas](https://img.shields.io/badge/Discord-Bergabung%20dengan%20Komunitas-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/HbW8kJTJxf)
[![Source Code](https://img.shields.io/badge/GitHub-Source%20Code-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/BoneFishStudio/VoiceRunners)

> ⚡ **Coba cepat**: Buka `index.html` di browser (Chrome/Edge rekomendasi)

---

## 🎖️ SISTEM ROLE & KEMAMPUAN FINAL

Setiap pemain punya **role** yang menentukan kemampuan. Role disimpan di Firebase `/userRoles/{uid}` dan di-enforce ganda: di UI **dan** di Security Rules (server). Default tanpa entry: **anon** (guest anonim) atau **user** (akun email permanen).

| Role | Main solo/multiplayer | Submit skor | Hapus entry leaderboard | Kick pemain dari room | Assign/cabut role | Atur `gameConfig` |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| **anon** (Guest) | ✅ | ✅ (ber-label Guest) | — | — | — | — |
| **user** (akun) | ✅ | ✅ (nama akun, permanen) | — | — | — | — |
| **moderator** | ✅ | ✅ | ✅ (tandai mencurigakan → hapus) | ✅ | — | — |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ (assign/cabut siapa pun) | ✅ (keseimbangan game) |

Detail implementasi:
- **Kick pemain dari room**: tombol ✂️ di lobby room (hanya tampil utk admin/moderator). Menghapus pemain dari `/rooms/{code}/players` + `playerOrder`, menandai `/rooms/{code}/kicks/{playerId}`, dan membersihkan index `/playerRoomIndex/{playerId}` — client target otomatis kembali ke Main Menu dengan pesan *"Kamu dikeluarkan dari room oleh moderator"*.
- **Index pemain→room**: `/playerRoomIndex/{playerId}` = `{roomId, ownerUid, joinedAt}` — di-set saat join/create room, dihapus saat keluar / di-kick / room di-sweep (auto-cleanup). Dipakai supaya moderator tahu room mana yang dihuni pemain tanpa scan semua room.
- **Auto-fix host**: kalau host di-kick atau disconnect, host otomatis dipindah ke pemain pertama yang tersisa.
- **Bootstrap admin pertama**: set manual di Firebase Console → Realtime Database → `/userRoles` → tulis `"<uid-pemain>" : "admin"`. (Panduan setup lengkap ada di `docs/`.)

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

## 🖼️ MAIN DI ITCH.IO

[![Main di Itch.io](https://img.shields.io/badge/Itch.io-Main%20di%20Itch-FF5C5C?style=for-the-badge&logo=itchdotio&logoColor=white)](https://mardev1.itch.io/voice-runner)

Embed game di website-mu:
```html
<iframe frameborder="0" src="https://itch.io/embed/4845636?bg_color=efefef&amp;border_color=070707" width="552" height="167"><a href="https://mardev1.itch.io/voice-runner">Voice Runner by TheCats</a></iframe>
```

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
└── 📁 .github/workflows/ → ZIP Itch.io + Release + build Electron (desktop) → GitHub Release
```

---

## 📄 LISENSI

- **Kode**: Open source — bebas pakai & modifikasi
- **Musik**: `Music/Moavii - Foreign (freetouse.com).mp3` — bebas royalti dari [freetouse.com](https://freetouse.com), atribusi: *"Music: Moavii - Foreign (freetouse.com)"*
- **Sprite**: Buatan sendiri

---

> 🐛 **Ada bug? Mau nambah fitur?** Tinggal bilang aja!
