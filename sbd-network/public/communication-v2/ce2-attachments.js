/**
 * CE2 Phase 3 — image / video / voice attachments (Cloudflare R2 via upload.js)
 */
(function (global) {
  'use strict';

  var MAX_BYTES = 10 * 1024 * 1024;
  var COMPRESS_MIN_BYTES = 350000;
  var COMPRESS_MAX_DIM = 1920;

  var IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp'];
  var VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', '3gp'];
  var AUDIO_EXTS = ['webm', 'm4a', 'mp3', 'wav', 'ogg', 'aac', 'caf'];

  function fileExt(file) {
    return ((file && file.name) || '').split('.').pop().toLowerCase() || '';
  }

  function isVideoFile(file) {
    if (file.type && file.type.startsWith('video/')) return true;
    return VIDEO_EXTS.indexOf(fileExt(file)) >= 0;
  }

  function isAudioFile(file) {
    if (file.type && file.type.startsWith('audio/')) return true;
    return AUDIO_EXTS.indexOf(fileExt(file)) >= 0;
  }

  function isImageFile(file) {
    if (isVideoFile(file) || isAudioFile(file)) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return IMAGE_EXTS.indexOf(fileExt(file)) >= 0;
  }

  function folderForFile(file) {
    if (isVideoFile(file)) return 'dm_videos';
    if (isAudioFile(file)) return 'dm_audio';
    return 'dm_attachments';
  }

  function kindForFile(file) {
    if (isVideoFile(file)) return 'video';
    if (isAudioFile(file)) return 'audio';
    return 'image';
  }

  function r2Ready() {
    return typeof uploadToR2 === 'function' && typeof getCurrentUser === 'function' && !!getCurrentUser();
  }

  function canUpload() {
    return r2Ready();
  }

  function validateFile(file) {
    if (!file) throw new Error('No file selected.');
    if (!canUpload()) {
      throw new Error('Upload not ready — sign in again and refresh the page.');
    }
    if (isImageFile(file)) {
      if (file.size > MAX_BYTES) throw new Error('Image too large (max 10 MB).');
      return;
    }
    if (isVideoFile(file)) {
      if (file.size > 100 * 1024 * 1024) throw new Error('Video too large (max 100 MB).');
      return;
    }
    if (isAudioFile(file)) {
      if (file.size > 15 * 1024 * 1024) throw new Error('Voice note too large (max 15 MB).');
      return;
    }
    throw new Error('Unsupported file type. Use photo, video, or audio.');
  }

  function normalizedImageMime(file) {
    var type = String((file && file.type) || '').toLowerCase();
    if (type === 'image/x-png' || type === 'image/apng') return 'image/png';
    if (type && type.indexOf('image/') === 0) return type;
    var ext = fileExt(file);
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'heic') return 'image/heic';
    if (ext === 'heif') return 'image/heif';
    if (ext === 'bmp') return 'image/bmp';
    return 'image/jpeg';
  }

  function normalizeUploadFile(file) {
    if (!file || !isImageFile(file)) return file;
    var mime = normalizedImageMime(file);
    if (!file.type || file.type.toLowerCase() !== mime) {
      return new File([file], file.name || 'photo', { type: mime });
    }
    return file;
  }

  function shouldCompressImage(file) {
    if (!file || isVideoFile(file) || isAudioFile(file)) return false;
    if (file.type === 'image/gif' || fileExt(file) === 'gif') return false;
    if (!isImageFile(file)) return false;
    var type = String(file.type || '').toLowerCase();
    var ext = fileExt(file);
    if (type === 'image/heic' || type === 'image/heif' || ext === 'heic' || ext === 'heif') {
      return true;
    }
    return file.size >= COMPRESS_MIN_BYTES;
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(file)
            .then(function (bmp) {
              var canvas = document.createElement('canvas');
              canvas.width = bmp.width;
              canvas.height = bmp.height;
              canvas.getContext('2d').drawImage(bmp, 0, 0);
              if (bmp.close) bmp.close();
              var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
              var img2 = new Image();
              img2.onload = function () {
                resolve(img2);
              };
              img2.onerror = function () {
                reject(new Error('Could not read image file.'));
              };
              img2.src = dataUrl;
            })
            .catch(function () {
              reject(new Error('Could not read image file.'));
            });
          return;
        }
        reject(new Error('Could not read image file.'));
      };
      img.src = url;
    });
  }

  function compressImageFile(file) {
    if (!shouldCompressImage(file)) {
      return Promise.resolve(normalizeUploadFile(file));
    }
    return loadImageElement(file)
      .then(function (img) {
        var w = img.width;
        var h = img.height;
        if (!w || !h) throw new Error('Could not read image dimensions.');
        var scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        return new Promise(function (resolve, reject) {
          canvas.toBlob(
            function (blob) {
              if (!blob) {
                reject(new Error('Could not prepare image for upload.'));
                return;
              }
              var name = (file.name || 'photo.jpg').replace(/\.[^.]+$/, '') + '.jpg';
              resolve(new File([blob], name, { type: 'image/jpeg' }));
            },
            'image/jpeg',
            0.82
          );
        });
      })
      .catch(function (err) {
        var fallback = normalizeUploadFile(file);
        if (fallback.size <= MAX_BYTES) return fallback;
        throw err || new Error('Could not prepare image for upload.');
      });
  }

  function withUploadTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('Upload timed out. Check your connection and try again.'));
      }, ms || 180000);
      promise
        .then(function (result) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function uploadMediaFile(file, folder, options) {
    if (!r2Ready()) {
      return Promise.reject(new Error('R2 upload service not available.'));
    }
    return uploadToR2(file, folder, options || {});
  }

  async function uploadCe2Media(file, options) {
    validateFile(file);
    var uploadFile = file;
    if (isImageFile(file)) {
      uploadFile = await compressImageFile(file);
      uploadFile = normalizeUploadFile(uploadFile);
    }
    var folder = folderForFile(uploadFile);
    var url = await withUploadTimeout(
      uploadMediaFile(uploadFile, folder, options || {}),
      180000
    );
    if (!url) throw new Error('Upload returned no URL.');
    return { url: url, kind: kindForFile(file) };
  }

  global.Ce2Attachments = {
    uploadCe2Media: uploadCe2Media,
    compressImageFile: compressImageFile,
    validateComposerFile: validateFile,
    mediaKindForFile: kindForFile,
    isVideoFile: isVideoFile,
    isImageFile: isImageFile,
    r2Ready: r2Ready,
    MAX_BYTES: MAX_BYTES,
    VERSION: 9,
  };
})(typeof window !== 'undefined' ? window : global);
