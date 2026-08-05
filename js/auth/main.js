/* ============================
   MAIN.JS — Inisialisasi service auth (dipanggil setelah semua script)
   ============================
   - Init FirebaseCore (satu-satunya instance database/auth/storage)
   - Init AuthService (onAuthStateChanged → session persist + auto login)
   - Bridge ke fungsi global lama yang dipakai game.js / multiplayer.js
   ============================ */

(function (global) {
    'use strict';

    function bootstrap() {
        // 1. Init Firebase
        if (global.FirebaseCore) {
            global.FirebaseCore.init();
        }

        // 2. Init AuthService (session)
        if (global.AuthService) {
            global.AuthService.init();
            // Setelah state auth berubah → sync globals multiplayer.js,
            // refresh UI profil + catat sesi
            global.AuthService.onChange(function (state) {
                // Sync variabel global lama (authUser/authUid/authReady/cachedRole)
                // yang masih dibaca oleh game.js & multiplayer.js
                if (typeof global.syncAuthGlobals === 'function') {
                    global.syncAuthGlobals(state);
                }
                if (typeof global.refreshAccountUI === 'function') {
                    global.refreshAccountUI();
                }
                if (state.user && !state.user.isAnonymous && state.ready && global.ProfileService) {
                    global.ProfileService.recordSession(state.uid, state.user);
                }
                // Flush skor yang sempat diantri sebelum auth siap
                if (state.ready && typeof global.flushPendingGlobalScores === 'function') {
                    global.flushPendingGlobalScores();
                }
                // Blokir main jika email belum diverifikasi
                if (typeof global.Game !== 'undefined' && global.Game.state === 'menu') {
                    if (state.emailBlocked && typeof global.showVerificationScreen === 'function') {
                        global.showVerificationScreen();
                    }
                }
            });
            // Sync awal segera (state bisa sudah ready kalau session tersimpan)
            if (typeof global.syncAuthGlobals === 'function') {
                global.syncAuthGlobals(global.AuthService.getState());
            }
        }

        // 3. Detect provider Email/Password aktif (peringatan awal)
        if (global.AuthService && global.FirebaseCore && global.FirebaseCore.initialized) {
            setTimeout(function () {
                if (typeof global.checkEmailProviderEnabled === 'function') {
                    global.checkEmailProviderEnabled();
                }
            }, 1500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})(window);
