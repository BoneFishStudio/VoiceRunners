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

    global.DatabaseService = {
        saveScore: saveScore,
        loadTop: loadTop,
        removeEntry: removeEntry,
        setUserRole: setUserRole
    };

})(window);
