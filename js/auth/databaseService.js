/* ============================
   DATABASESERVICE.JS — Leaderboard + helpers RTDB
   ============================
   Leaderboard global (/leaderboard/{uid}) + akses terpusat ke RTDB
   untuk rooms (multiplayer) — semua lewat instance database yang sama
   (lihat firebase.js).
   ============================ */

(function (global) {
    'use strict';

    function db() { return global.FirebaseCore.db; }

    // ===== Global Leaderboard =====
    // Simpan skor terbaik per user. Best-effort — tidak mengganggu game.
    function saveScore(name, score, distance) {
        var d = db();
        var auth = global.AuthService;
        if (!d || !auth || !auth.isReady() || !auth.getUid()) {
            return Promise.resolve(false);
        }
        var uid = auth.getUid();
        return d.ref('leaderboard/' + uid).once('value')
            .then(function (snap) {
                var existing = snap.val();
                if (existing && typeof existing.score === 'number' && existing.score >= score) {
                    return false; // jangan timpa skor lebih tinggi
                }
                var isGuest = auth.isAnonymous();
                return d.ref('leaderboard/' + uid).set({
                    name: String(name || 'Anonim').slice(0, 20),
                    score: Math.floor(score) || 0,
                    distance: Math.floor(distance) || 0,
                    timestamp: Date.now(),
                    lastSubmitTimestamp: Date.now(),
                    isGuest: isGuest
                }).then(function () { return true; });
            })
            .catch(function () { return false; });
    }

    // Ambil top N skor (sorted desc). Leaderboard read-only untuk publik.
    function loadTop(limit) {
        var d = db();
        if (!d) return Promise.resolve([]);
        var count = limit || 50;
        return d.ref('leaderboard')
            .orderByChild('score')
            .limitToLast(count)
            .once('value')
            .then(function (snap) {
                var entries = [];
                snap.forEach(function (child) {
                    var v = child.val();
                    if (v && typeof v.score === 'number') {
                        entries.push({
                            uid: child.key,
                            name: v.name,
                            score: v.score,
                            distance: v.distance || 0,
                            timestamp: v.timestamp || 0,
                            isGuest: !!v.isGuest
                        });
                    }
                });
                entries.sort(function (a, b) { return b.score - a.score; });
                return entries;
            })
            .catch(function () { return []; });
    }

    // Hapus entry leaderboard (mod/admin)
    function removeEntry(uid) {
        var d = db();
        if (!d || !uid) return Promise.resolve({ ok: false, msg: 'UID kosong.' });
        return d.ref('leaderboard/' + uid).remove()
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: e.message }; });
    }

    // Set role user (hanya admin — di-enforce juga di Security Rules)
    function setUserRole(uid, role) {
        var d = db();
        if (!d || !uid) return Promise.resolve({ ok: false, msg: 'UID kosong.' });
        return d.ref('userRoles/' + uid).set(role)
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: e.message }; });
    }

    // ===== Game Config (/gameConfig) — admin/moderator =====
    // Konfigurasi keseimbangan permainan yang bisa diubah dari halaman PROFILE
    // (tab GAME SETTINGS). Game membaca nilai ini saat start — kalau tidak ada
    // di Firebase, semua fallback ke konstanta default di game.js.
    var DEFAULT_GAME_CONFIG = {
        baseSpeed: 5,
        maxSpeed: 14,
        rampSpeedBoost: 0.8,
        rampInterval: 1000,
        obstacleMinGap: 120,
        obstacleMaxGap: 200,
        pitChance: 0.15,
        pitVolumeThreshold: 0.18,
        themeLength: 800,
        themeBlendZone: 180
    };

    function loadGameConfig() {
        var d = db();
        if (!d) return Promise.resolve(DEFAULT_GAME_CONFIG);
        return d.ref('gameConfig').once('value')
            .then(function (snap) {
                var cfg = snap.val() || {};
                var out = {};
                Object.keys(DEFAULT_GAME_CONFIG).forEach(function (k) {
                    var v = cfg[k];
                    out[k] = (typeof v === 'number' && isFinite(v)) ? v : DEFAULT_GAME_CONFIG[k];
                });
                return out;
            })
            .catch(function () { return DEFAULT_GAME_CONFIG; });
    }

    function saveGameConfig(cfg) {
        var d = db();
        if (!d) return Promise.resolve({ ok: false, msg: 'Database belum siap.' });
        // Hanya simpan key yang dikenal + clamp ke range yang sama dengan
        // Security Rules (supaya tidak kena permission-denied yang membingungkan)
        var RANGES = {
            baseSpeed: [2, 20],
            maxSpeed: [6, 30],
            rampSpeedBoost: [0, 3],
            rampInterval: [300, 3000],
            obstacleMinGap: [60, 400],
            obstacleMaxGap: [100, 600],
            pitChance: [0, 0.5],
            pitVolumeThreshold: [0.05, 0.5],
            themeLength: [300, 2000],
            themeBlendZone: [50, 500]
        };
        var clean = {};
        Object.keys(DEFAULT_GAME_CONFIG).forEach(function (k) {
            var v = Number(cfg ? cfg[k] : NaN);
            if (!isFinite(v)) return;
            var r = RANGES[k] || [0, 9999];
            v = Math.min(r[1], Math.max(r[0], v));
            clean[k] = v;
        });
        if (Object.keys(clean).length === 0) {
            return Promise.resolve({ ok: false, msg: 'Tidak ada nilai yang valid.' });
        }
        return d.ref('gameConfig').update(clean)
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: e.message }; });
    }

    function resetGameConfig() {
        var d = db();
        if (!d) return Promise.resolve({ ok: false, msg: 'Database belum siap.' });
        return d.ref('gameConfig').remove()
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: e.message }; });
    }

    global.DatabaseService = {
        saveScore: saveScore,
        loadTop: loadTop,
        removeEntry: removeEntry,
        setUserRole: setUserRole,
        loadGameConfig: loadGameConfig,
        saveGameConfig: saveGameConfig,
        resetGameConfig: resetGameConfig,
        DEFAULT_GAME_CONFIG: DEFAULT_GAME_CONFIG
    };

})(window);
