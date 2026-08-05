/* ============================
   PROFILESERVICE.JS — Profil & data user (RTDB)
   ============================
   Struktur:
   users/{uid}/
       profile/      displayName, photoURL, email, createdAt, lastLogin,
                     country, level, exp, coins
       statistics/   highScore, gamesPlayed, wins, losses
       score/        bestScore, bestDistance, timestamp
       settings/     (cache lokal — lihat localStorage)
       achievements/ (placeholder)

   Hak akses diatur Security Rules (baca/tulis hanya pemilik, lihat
   docs/firebase-rules.json).
   ============================ */

(function (global) {
    'use strict';

    function db() { return global.FirebaseCore.db; }

    // ===== Baca profil =====
    function getProfile(uid) {
        var d = db();
        if (!d || !uid) return Promise.resolve(null);
        return d.ref('users/' + uid + '/profile').once('value')
            .then(function (snap) { return snap.val(); })
            .catch(function () { return null; });
    }

    // ===== Tulis profil =====
    function saveProfile(uid, data) {
        var d = db();
        if (!d || !uid) return Promise.resolve({ ok: false, msg: 'Database tidak tersedia.' });
        return d.ref('users/' + uid + '/profile').set(data)
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: e.message }; });
    }

    // ===== Update sebagian profil (displayName, photoURL, dll) =====
    function updateProfile(uid, patch) {
        var d = db();
        if (!d || !uid) return Promise.resolve({ ok: false, msg: 'Database tidak tersedia.' });
        return d.ref('users/' + uid + '/profile').update(patch)
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: e.message }; });
    }

    // ===== Statistik game =====
    function updateStatistics(uid, result) {
        var d = db();
        if (!d || !uid) return Promise.resolve({ ok: false });
        var statsRef = d.ref('users/' + uid + '/statistics');
        return statsRef.transaction(function (cur) {
            var s = cur || {};
            s.gamesPlayed = (s.gamesPlayed || 0) + 1;
            if (result.score > (s.highScore || 0)) s.highScore = result.score;
            if (result.bestDistance > (s.bestDistance || 0)) s.bestDistance = result.bestDistance;
            if (result.win) s.wins = (s.wins || 0) + 1; else s.losses = (s.losses || 0) + 1;
            return s;
        }).then(function () { return { ok: true }; })
          .catch(function () { return { ok: false }; });
    }

    // Catat login terakhir + level/exp sederhana (exp = skor kumulatif / 100)
    function recordSession(uid, user) {
        var d = db();
        if (!d || !uid) return;
        var patch = {
            lastLogin: Date.now()
        };
        if (user && user.displayName) patch.displayName = user.displayName;
        if (user && user.email) patch.email = user.email;
        d.ref('users/' + uid + '/profile').update(patch).catch(function () {});
    }

    // ===== Migrasi data Guest → akun permanen =====
    // Salin: leaderboard lokal (skor), settings, nama tersimpan, progress.
    // Dipanggil setelah linkWithCredential berhasil (UID Guest = UID akun baru).
    function migrateGuestData(user) {
        var d = db();
        if (!d || !user) return;

        var uid = user.uid;
        var score = 0, distance = 0, name = user.displayName || '';

        try {
            // 1. Ambil skor terbaik dari leaderboard lokal
            var lb = JSON.parse(localStorage.getItem('voiceRunner_leaderboard') || '[]');
            lb.filter(function (e) { return e.type !== 'checkpoint'; }).forEach(function (e) {
                if (e.score > score) { score = e.score; distance = e.distance || 0; }
            });
        } catch (e) {}

        try {
            // 2. Nama tersimpan
            var savedName = localStorage.getItem('voiceRunner_playerName');
            if (savedName) name = savedName;
        } catch (e) {}

        // 3. Tulis ke RTDB (best-effort — tidak menggagalkan register kalau gagal)
        var now = Date.now();
        var profile = {
            displayName: String(name || 'Pemain').slice(0, 20),
            photoURL: user.photoURL || '',
            email: user.email || '',
            createdAt: now,
            lastLogin: now,
            country: '',
            level: 1,
            exp: 0,
            coins: 0
        };
        d.ref('users/' + uid).set({
            profile: profile,
            statistics: {
                highScore: score,
                bestDistance: distance,
                gamesPlayed: 0,
                wins: 0,
                losses: 0
            },
            score: { bestScore: score, bestDistance: distance, timestamp: now },
            achievements: {},
            settings: {}
        }).catch(function (e) {
            console.warn('[profileService] Migrasi data Guest gagal:', e.message);
        });
    }

    // ===== Buat profil default untuk user baru (mis. saat login) =====
    function ensureProfile(user) {
        var d = db();
        if (!d || !user) return Promise.resolve(null);
        var uid = user.uid;
        return d.ref('users/' + uid + '/profile').once('value')
            .then(function (snap) {
                if (snap.exists()) return snap.val();
                var now = Date.now();
                var profile = {
                    displayName: user.displayName || 'Pemain',
                    photoURL: user.photoURL || '',
                    email: user.email || '',
                    createdAt: now,
                    lastLogin: now,
                    country: '',
                    level: 1,
                    exp: 0,
                    coins: 0
                };
                return d.ref('users/' + uid + '/profile').set(profile)
                    .then(function () { return profile; });
            })
            .catch(function () { return null; });
    }

    global.ProfileService = {
        getProfile: getProfile,
        saveProfile: saveProfile,
        updateProfile: updateProfile,
        updateStatistics: updateStatistics,
        recordSession: recordSession,
        migrateGuestData: migrateGuestData,
        ensureProfile: ensureProfile
    };

    // Bridge untuk authService (dipanggil setelah linkWithCredential)
    global.migrateGuestData = migrateGuestData;

})(window);
