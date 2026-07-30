# 🎤 VOICE RUNNER 🏃

**Endless Runner HTML5** — lari otomatis, lompat pakai **suara**, isi lubang dengan **voice challenge**, dan main bareng 4 pemain via **multiplayer real-time**!

> ⚡ **Coba sekarang**: Buka `index.html` di browser (Chrome/Edge rekomendasi)

---

## ✨ FITUR UTAMA

| Fitur | Deskripsi |
|-------|-----------|
| 🏃 **Endless Runner** | Lari otomatis, lompati rintangan dengan suara |
| 🗣️ **Voice Jump** | Keras = lompat tinggi, pelan = lompat rendah |
| 🎤 **Voice Challenge** | Baca teks untuk mengisi lubang |
| 👥 **Multiplayer 4P** | Online real-time via Firebase |
| 📍 **Checkpoint** | Auto-save tiap 500m, respawn kalau mati |
| 🏆 **Leaderboard** | Skor tersimpan lokal |

---

## 🎮 CARA BERMAIN

### Lompat dengan Suara!
```
🔇 Pelan   → Lompat rendah  → Hindari SPIKE
🗣️ Normal  → Lompat sedang  → Hindari BOX  
📢 KERAS   → Lompat tinggi  → Hindari TIANG
```

### Voice Challenge
```
🕳️ Lubang muncul + teks melayang (contoh: "LARI")
🎤 Bacakan teks dengan suara
✅ Cocok → lubang ketutup + bonus 50 poin
❌ Gagal → jatuh (-1 nyawa)
```

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
```bash
1. Zip folder (index.html + js/ + css/ + Music/ + assets/)
2. Upload ke https://itch.io/game/new sebagai HTML
```

> 📖 **Setup lengkap** (Firebase, Vercel Secrets, API Key) ada di [`SETUP.md`](SETUP.md)

---

## 🛠 TEKNOLOGI

| Teknologi | Untuk |
|-----------|-------|
| HTML5 Canvas | Semua rendering game |
| Vanilla JS | Framework-free |
| Web Speech API | Voice recognition |
| Web Audio API | SFX + musik |
| Firebase RTDB | Multiplayer sync |
| localStorage | Save data |

### Browser Support
| Browser | Game | Voice | Multiplayer |
|---------|------|-------|-------------|
| Chrome ✅ | ✅ | ✅ | ✅ |
| Edge ✅ | ✅ | ✅ | ✅ |
| Firefox ✅ | ✅ | ❌ | ✅ |
| Safari ✅ | ✅ | ❌ | ✅ |

---

## 📁 STRUKTUR FILE

```
📦 VoiceRunner
├── 📄 index.html        → Entry point + semua UI
├── 📄 vercel.json       → Config Vercel
├── 📁 js/
│   ├── 📄 game.js       → Core engine (game loop, physics, voice)
│   ├── 📄 audio.js      → Web Audio API (musik + SFX)
│   └── 📄 multiplayer.js → Firebase multiplayer
├── 📁 css/
│   └── 📄 style.css     → Styling
├── 📁 Music/             → File musik MP3
├── 📁 assets/            → Sprite & aset
├── 📄 SETUP.md           → Setup guide (Firebase, Secrets, dll)
└── 📁 .github/workflows/ → CI/CD auto-deploy ke Vercel
```

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
