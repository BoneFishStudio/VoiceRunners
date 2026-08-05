/* ============================
   FIREBASE.JS — Inisialisasi Firebase (SDK v10 Compat)
   ============================
   Menggunakan firebase-compat v10.x — API sama dengan v8 (firebase.auth(),
   firebase.database(), firebase.storage()), jadi aman untuk:
   - browser web (Vercel / itch.io)
   - build desktop Electron (file:// — compat SDK tetap jalan, ES modules tidak)
   Seluruh service lain (authService, databaseService, dll) memakai instance
   yang di-inisialisasi di sini.
   ============================ */

(function (global) {
    'use strict';

    // Konfigurasi project Firebase server-ba906
    var firebaseConfig = {
        apiKey: "AIzaSyDTqm1KLjLMiY9Ukm4FNYHA7kzgVSzKQa4",
        authDomain: "server-ba906.firebaseapp.com",
        databaseURL: "https://server-ba906-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "server-ba906",
        storageBucket: "server-ba906.firebasestorage.app",
        messagingSenderId: "881410606838",
        appId: "1:881410606838:web:4e20c096c41ccbac920ed7",
        measurementId: "G-97YZWNJ7RB"
    };

    var firebaseApp = null;
    var db = null;
    var storageRef = null;
    var fbInitialized = false;

    function init() {
        if (fbInitialized) return true;
        try {
            if (typeof firebase === 'undefined') {
                console.warn('[firebase.js] SDK tidak dimuat — cek urutan <script> di index.html');
                return false;
            }
            firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            if (typeof firebase.storage === 'function') {
                storageRef = firebase.storage();
            }
            fbInitialized = true;
            console.log('[firebase.js] Firebase SDK v10 compat terinisialisasi');
            return true;
        } catch (e) {
            console.error('[firebase.js] Init error:', e);
            return false;
        }
    }

    global.FirebaseCore = {
        init: init,
        get app() { return firebaseApp; },
        get db() { return db; },
        get storage() { return storageRef; },
        get initialized() { return fbInitialized; }
    };

    // Untuk kompatibilitas dengan kode lama yang memakai `database` global
    // (misal js/multiplayer.js) — instance yang sama, bukan duplikat.
    global.database = null;
    Object.defineProperty(global, 'database', {
        get: function () { return db; },
        set: function (v) { db = v; }
    });

})(window);
