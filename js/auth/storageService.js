/* ============================
   STORAGESERVICE.JS — Upload foto profil (Firebase Storage)
   ============================
   Foto disimpan di: avatars/{uid}.jpg (di-resize client-side ke 256x256
   sebelum upload — hemat bandwidth & cepat). Perlu Storage Rules yang
   membatasi: hanya pemilik yang bisa menulis avatarnya sendiri.
   ============================ */

(function (global) {
    'use strict';

    // Resize image via canvas → dataURL (maks 256x256)
    function resizeImage(file, maxSize) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            var url = URL.createObjectURL(file);
            img.onload = function () {
                var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                var w = Math.max(1, Math.round(img.width * scale));
                var h = Math.max(1, Math.round(img.height * scale));
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                canvas.toBlob(function (blob) {
                    if (blob) resolve(blob); else reject(new Error('Gagal memproses gambar.'));
                }, 'image/jpeg', 0.85);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('File bukan gambar.')); };
            img.src = url;
        });
    }

    // Upload avatar → return downloadURL
    function uploadAvatar(file, uid) {
        var storage = global.FirebaseCore.storage;
        if (!storage) {
            return Promise.resolve({ ok: false, msg: 'Firebase Storage belum diaktifkan di console.' });
        }
        return resizeImage(file, 256)
            .then(function (blob) {
                var ref = storage.ref('avatars/' + uid + '.jpg');
                return ref.put(blob, { contentType: 'image/jpeg' })
                    .then(function () { return ref.getDownloadURL(); });
            })
            .then(function (url) {
                return { ok: true, url: url };
            })
            .catch(function (e) {
                console.error('[storageService] Upload error:', e);
                return { ok: false, msg: e.message };
            });
    }

    global.StorageService = {
        uploadAvatar: uploadAvatar,
        resizeImage: resizeImage
    };

})(window);
