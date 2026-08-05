/* ============================
   VALIDATION.JS — Validasi input + pemetaan error Firebase
   ============================
   Semua validasi client-side (email, password kuat, username) dan
   penerjemah error Firebase Auth → pesan ramah Bahasa Indonesia.
   ============================ */

(function (global) {
    'use strict';

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function isValidEmail(email) {
        return EMAIL_RE.test(String(email || '').trim());
    }

    // Password kuat: min 8, ada huruf besar, huruf kecil, angka.
    // (untuk REGISTER baru & GANTI PASSWORD; login lama tetap kompatibel)
    function validatePasswordStrength(password) {
        var pw = String(password || '');
        var errors = [];
        if (pw.length < 8) errors.push('minimal 8 karakter');
        if (!/[A-Z]/.test(pw)) errors.push('huruf besar (A-Z)');
        if (!/[a-z]/.test(pw)) errors.push('huruf kecil (a-z)');
        if (!/[0-9]/.test(pw)) errors.push('angka (0-9)');
        return { ok: errors.length === 0, errors: errors };
    }

    function validateDisplayName(name) {
        var n = String(name || '').trim();
        if (n.length < 2) return { ok: false, msg: 'Nama minimal 2 karakter.' };
        if (n.length > 20) return { ok: false, msg: 'Nama maksimal 20 karakter.' };
        return { ok: true, value: n };
    }

    // Peta error Firebase Auth → pesan ramah
    var ERROR_MAP = [
        [/operation-not-allowed|OPERATION_NOT_ALLOWED/, 'Login Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password → Aktifkan). Setelah diaktifkan, coba lagi.'],
        [/invalid-login-credentials|INVALID_LOGIN_CREDENTIALS/, 'Email atau password salah.'],
        [/invalid-credential/, 'Email atau password salah.'],
        [/email-already-in-use|EMAIL_EXISTS/, 'Email sudah terdaftar. Gunakan tombol MASUK.'],
        [/credential-already-in-use/, 'Email ini sudah terhubung ke akun lain.'],
        [/account-exists-with-different-credential/, 'Email ini sudah dipakai akun lain.'],
        [/invalid-email|INVALID_EMAIL/, 'Format email tidak valid.'],
        [/weak-password|WEAK_PASSWORD/, 'Password terlalu lemah (minimal 6 karakter).'],
        [/wrong-password|INVALID_PASSWORD/, 'Password salah.'],
        [/user-disabled|USER_DISABLED/, 'Akun ini dinonaktifkan. Hubungi admin.'],
        [/user-not-found|email-not-found|USER_NOT_FOUND/, 'Akun tidak ditemukan. Periksa email atau daftar dulu.'],
        [/too-many-requests|too-many-attempts|TOO_MANY_ATTEMPTS/, 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.'],
        [/requires-recent-login|REQUIRES_RECENT_LOGIN/, 'Sesi sudah lama. Masuk ulang lalu ulangi aksinya.'],
        [/network-request-failed|NETWORK_REQUEST_FAILED|network|unavailable/, 'Koneksi internet bermasalah. Periksa koneksi lalu coba lagi.'],
        [/popup-closed-by-user|POPUP_CLOSED_BY_USER/, 'Login dibatalkan.'],
        [/user-cancelled|USER_CANCELLED/, 'Aksi dibatalkan.'],
        [/email-not-verified/, 'Email belum diverifikasi.'],
        [/missing-password|MISSING_PASSWORD/, 'Password wajib diisi.'],
        [/missing-email|MISSING_EMAIL/, 'Email wajib diisi.']
    ];

    function friendlyAuthError(codeOrMsg) {
        var m = String(codeOrMsg || '');
        for (var i = 0; i < ERROR_MAP.length; i++) {
            if (ERROR_MAP[i][0].test(m)) return ERROR_MAP[i][1];
        }
        // Fallback: ambil kode auth/xxx kalau ada
        var codeMatch = m.match(/(auth\/[a-z-]+)/i);
        return codeMatch ? 'Terjadi kesalahan (' + codeMatch[1] + '). Coba lagi.' : m;
    }

    global.Validation = {
        isValidEmail: isValidEmail,
        validatePasswordStrength: validatePasswordStrength,
        validateDisplayName: validateDisplayName,
        friendlyAuthError: friendlyAuthError
    };

})(window);
