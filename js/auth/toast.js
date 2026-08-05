/* ============================
   TOAST.JS — Notifikasi Toast + Loading + Skeleton
   ============================
   Utilitas UI ringan (tanpa library):
   - Toast.show(msg, type) — notifikasi bawah layar
   - Toast.loading(msg) / Toast.hideLoading() — overlay loading
   - Toast.skeleton(container, show) — placeholder loading berbentuk skeleton
   ============================ */

(function (global) {
    'use strict';

    var TOAST_CONTAINER_ID = 'toastContainer';
    var LOADING_ID = 'globalLoadingOverlay';
    var toasts = [];

    function ensureContainer() {
        var c = document.getElementById(TOAST_CONTAINER_ID);
        if (!c) {
            c = document.createElement('div');
            c.id = TOAST_CONTAINER_ID;
            c.className = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function show(msg, type) {
        var container = ensureContainer();
        var t = document.createElement('div');
        t.className = 'toast toast-' + (type || 'info');
        t.textContent = msg;
        container.appendChild(t);

        // Hapus otomatis setelah 3.5s
        setTimeout(function () {
            t.classList.add('toast-out');
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
        }, 3500);
        return t;
    }

    function success(msg) { return show(msg, 'success'); }
    function error(msg) { return show(msg, 'error'); }
    function info(msg) { return show(msg, 'info'); }

    // ===== Loading overlay =====
    function loading(msg) {
        var el = document.getElementById(LOADING_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = LOADING_ID;
            el.className = 'loading-overlay';
            el.innerHTML = '<div class="loading-spinner"></div><div class="loading-msg"></div>';
            document.body.appendChild(el);
        }
        el.querySelector('.loading-msg').textContent = msg || 'Memproses...';
        el.classList.add('active');
        return el;
    }

    function hideLoading() {
        var el = document.getElementById(LOADING_ID);
        if (el) el.classList.remove('active');
    }

    // ===== Skeleton (placeholder saat data dimuat) =====
    function skeleton(container, show) {
        var c = typeof container === 'string' ? document.getElementById(container) : container;
        if (!c) return;
        if (show) {
            c.innerHTML = '';
            for (var i = 0; i < 5; i++) {
                var s = document.createElement('div');
                s.className = 'skeleton-row';
                s.innerHTML = '<div class="skeleton-block"></div>';
                c.appendChild(s);
            }
        } else {
            c.querySelectorAll('.skeleton-row').forEach(function (s) { s.remove(); });
        }
    }

    global.Toast = {
        show: show,
        success: success,
        error: error,
        info: info,
        loading: loading,
        hideLoading: hideLoading,
        skeleton: skeleton
    };

})(window);
