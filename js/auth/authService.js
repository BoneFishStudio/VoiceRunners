/* ============================
   AUTHSERVICE.JS — Otentikasi lengkap (SDK v10 Compat)
   ============================
   Register / Login / Logout / Forgot Password / Email Verification /
   Delete Account / Change Password / Guest migration.

   State auth dibagikan lewat onAuthStateChanged() (persist session,
   auto-login, auto-logout jika token invalid). Semua fungsi mengembalikan
   Promise<{ ok, msg?, needsVerification?, user? }>.
   ============================ */

(function (global) {
    'use strict';

    var Validation = global.Validation;

    // ===== State auth (dibagikan ke seluruh game) =====
    var state = {
        user: null,          // firebase.User aktif (guest / email)
        uid: null,
        ready: false,        // true setelah onAuthStateChanged pertama
        emailBlocked: false, // true jika email belum diverifikasi (blokir main)
        role: 'anon',        // admin / moderator / user / anon
        listeners: []        // callback ketika state berubah
    };

    function getState() { return state; }

    function onChange(cb) {
        state.listeners.push(cb);
        return function () {
            state.listeners = state.listeners.filter(function (f) { return f !== cb; });
        };
    }

    function emit() {
        state.listeners.forEach(function (cb) {
            try { cb(state); } catch (e) { console.warn('Auth listener error:', e); }
        });
    }

    // Ambil role dari /userRoles/{uid} (fallback: anon/user)
    function fetchRole(uid) {
        var db = global.FirebaseCore.db;
        var fallback = (state.user && !state.user.isAnonymous) ? 'user' : 'anon';
        if (!db || !uid) return Promise.resolve(fallback);
        return db.ref('userRoles/' + uid).once('value')
            .then(function (snap) {
                var r = snap.val();
                if (r === 'admin' || r === 'moderator' || r === 'user' || r === 'anon') return r;
                return fallback;
            })
            .catch(function () { return fallback; });
    }

    var _inited = false;

    // ===== Session: onAuthStateChanged (persist + auto login/logout) =====
    function init() {
        if (_inited) return;
        _inited = true;
        if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
            console.warn('[authService] Firebase Auth tidak tersedia');
            return;
        }
        firebase.auth().onAuthStateChanged(function (user) {
            if (user) {
                state.user = user;
                state.uid = user.uid;
                state.ready = true;
                state.emailBlocked = false;
                // Kalau akun email belum diverifikasi → blokir akses main
                if (!user.isAnonymous && user.email && !user.emailVerified) {
                    state.emailBlocked = true;
                }
                fetchRole(user.uid).then(function (role) {
                    state.role = role;
                    try { localStorage.setItem('voiceRunner_userRole', role); } catch (e) {}
                    emit();
                });
                emit();
            } else {
                // Token invalid / sudah logout → auto logout ke Guest
                var prev = state.user;
                state.user = null;
                state.uid = null;
                state.ready = true;
                state.emailBlocked = false;
                emit();
                // Auto sign-in anonim (Guest) — pemain tetap bisa main
                if (prev || firebase.auth().currentUser === null) {
                    firebase.auth().signInAnonymously().catch(function (e) {
                        console.warn('[authService] Guest sign-in gagal:', e.message);
                    });
                }
            }
        });
    }

    // ===== Register (createUserWithEmailAndPassword + updateProfile + email verifikasi) =====
    // Guest → linkWithCredential (migrasi data). Non-guest → akun baru.
    // TIDAK auto-login jika gagal. Tidak memanggil updateEmail().
    function register(name, email, password) {
        return new Promise(function (resolve) {
            var auth = firebase.auth();
            var current = auth.currentUser;

            var doRegister = function () {
                auth.createUserWithEmailAndPassword(email, password)
                    .then(function (cred) {
                        return updateProfileAndVerify(cred.user, name).then(function () {
                            resolve({ ok: true, user: cred.user });
                        });
                    })
                    .catch(function (e) {
                        console.error('[authService] Register error — code:', e.code, '| msg:', e.message);
                        resolve({ ok: false, msg: Validation.friendlyAuthError(e.message) });
                    });
            };

            if (current && current.isAnonymous) {
                // 🔁 Guest → upgrade akun permanen (UID & data tetap)
                var cred = firebase.auth.EmailAuthProvider.credential(email, password);
                current.linkWithCredential(cred)
                    .then(function (result) {
                        return updateProfileAndVerify(result.user, name).then(function () {
                            // Migrasi data Guest ke akun baru (score/settings/progress)
                            if (typeof global.migrateGuestData === 'function') {
                                global.migrateGuestData(result.user);
                            }
                            resolve({ ok: true, user: result.user, upgraded: true });
                        });
                    })
                    .catch(function (e) {
                        console.error('[authService] Link guest error — code:', e.code, '| msg:', e.message);
                        resolve({ ok: false, msg: Validation.friendlyAuthError(e.message) });
                    });
            } else {
                doRegister();
            }
        });
    }

    function updateProfileAndVerify(user, name) {
        var p = [];
        if (name) {
            p.push(user.updateProfile({ displayName: String(name).slice(0, 20) }).catch(function () {}));
        }
        // Kirim email verifikasi (wajib — game memblokir akun belum diverifikasi)
        if (user.email && !user.emailVerified) {
            p.push(user.sendEmailVerification().catch(function () {}));
        }
        return Promise.all(p);
    }

    // ===== Login (signInWithEmailAndPassword) =====
    // Jika email belum diverifikasi → resolve needsVerification: true (UI menampilkan dialog)
    function login(email, password) {
        return new Promise(function (resolve) {
            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(function (cred) {
                    var u = cred.user;
                    if (!u.emailVerified) {
                        resolve({ ok: true, needsVerification: true, user: u });
                        return;
                    }
                    resolve({ ok: true, user: u });
                })
                .catch(function (e) {
                    console.error('[authService] Login error — code:', e.code, '| msg:', e.message);
                    resolve({ ok: false, msg: Validation.friendlyAuthError(e.message) });
                });
        });
    }

    // ===== Logout (signOut + bersihkan cache) =====
    function logout() {
        // Bersihkan cache role lokal
        try { localStorage.removeItem('voiceRunner_userRole'); } catch (e) {}
        state.role = 'anon';
        return firebase.auth().signOut()
            .then(function () {
                // onAuthStateChanged akan otomatis sign-in Guest lagi
                return { ok: true };
            })
            .catch(function (e) {
                return { ok: false, msg: Validation.friendlyAuthError(e.message) };
            });
    }

    // ===== Forgot Password (sendPasswordResetEmail) =====
    function forgotPassword(email) {
        return firebase.auth().sendPasswordResetEmail(email)
            .then(function () { return { ok: true }; })
            .catch(function (e) {
                console.error('[authService] Forgot error — code:', e.code);
                // Pesan generic — anti user-enumeration
                return { ok: false, msg: Validation.friendlyAuthError(e.message) };
            });
    }

    // ===== Email Verification =====
    function resendVerification() {
        var u = firebase.auth().currentUser;
        if (!u) return Promise.resolve({ ok: false, msg: 'Tidak ada sesi aktif.' });
        return u.sendEmailVerification()
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: Validation.friendlyAuthError(e.message) }; });
    }

    function refreshVerificationStatus() {
        var u = firebase.auth().currentUser;
        if (!u) return Promise.resolve({ ok: false, verified: false });
        return u.reload()
            .then(function () {
                var verified = firebase.auth().currentUser.emailVerified === true;
                if (verified) state.emailBlocked = false;
                return { ok: true, verified: verified };
            })
            .catch(function (e) { return { ok: false, verified: false, msg: Validation.friendlyAuthError(e.message) }; });
    }

    // Ganti email (dengan reauth) — updateEmail hanya saat sudah ter-autentikasi
    function changeEmail(newEmail, password) {
        var u = firebase.auth().currentUser;
        if (!u) return Promise.resolve({ ok: false, msg: 'Tidak ada sesi aktif.' });
        var cred = firebase.auth.EmailAuthProvider.credential(u.email, password);
        return u.reauthenticateWithCredential(cred)
            .then(function () { return u.updateEmail(newEmail); })
            .then(function () { return u.sendEmailVerification().catch(function () {}); })
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: Validation.friendlyAuthError(e.message) }; });
    }

    // ===== Change Password (updatePassword) =====
    function changePassword(currentPassword, newPassword) {
        var u = firebase.auth().currentUser;
        if (!u) return Promise.resolve({ ok: false, msg: 'Tidak ada sesi aktif.' });
        var cred = firebase.auth.EmailAuthProvider.credential(u.email, currentPassword);
        return u.reauthenticateWithCredential(cred)
            .then(function () { return u.updatePassword(newPassword); })
            .then(function () { return { ok: true }; })
            .catch(function (e) { return { ok: false, msg: Validation.friendlyAuthError(e.message) }; });
    }

    // ===== Delete Account (deleteUser + reauth) =====
    function deleteAccount(password) {
        var u = firebase.auth().currentUser;
        if (!u) return Promise.resolve({ ok: false, msg: 'Tidak ada sesi aktif.' });

        var doDelete = function () {
            return u.delete()
                .then(function () {
                    // Hapus data user dari RTDB (best-effort)
                    var db = global.FirebaseCore.db;
                    if (db && state.uid) {
                        db.ref('users/' + state.uid).remove().catch(function () {});
                        db.ref('leaderboard/' + state.uid).remove().catch(function () {});
                    }
                    return { ok: true };
                });
        };

        if (u.isAnonymous) {
            return doDelete();
        }
        // Akun email butuh re-auth terbaru
        var cred = firebase.auth.EmailAuthProvider.credential(u.email, password);
        return u.reauthenticateWithCredential(cred)
            .then(doDelete)
            .catch(function (e) { return { ok: false, msg: Validation.friendlyAuthError(e.message) }; });
    }

    // ===== Getters (kompatibel dengan kode lama) =====
    function getUid() { return state.uid; }
    function isReady() { return state.ready; }
    function getRole() { return state.role; }
    function isMod() { return state.role === 'admin' || state.role === 'moderator'; }
    function isAnonymous() { return !!(state.user && state.user.isAnonymous); }
    function isEmailBlocked() { return state.emailBlocked; }
    function getUser() { return state.user; }

    global.AuthService = {
        state: state,
        getState: getState,
        onChange: onChange,
        init: init,
        register: register,
        login: login,
        logout: logout,
        forgotPassword: forgotPassword,
        resendVerification: resendVerification,
        refreshVerificationStatus: refreshVerificationStatus,
        changeEmail: changeEmail,
        changePassword: changePassword,
        deleteAccount: deleteAccount,
        getUid: getUid,
        isReady: isReady,
        getRole: getRole,
        isMod: isMod,
        isAnonymous: isAnonymous,
        isEmailBlocked: isEmailBlocked,
        getUser: getUser
    };

})(window);
