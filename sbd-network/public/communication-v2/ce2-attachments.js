/**
 * CE2 Phase 3 — image / video / voice attachments (R2 via upload.js)
 */
(function (global) {
  'use strict';

  var MAX_BYTES = 10 * 1024 * 1024;
  var COMPRESS_MIN_BYTES = 350000;
  var COMPRESS_MAX_DIM = 1920;

  function canUpload() {
    return typeof uploadToR2 === 'function' && typeof getCurrentUser === 'function';
  }

  function folderForFile(file) {
    if (file.type && file.type.startsWith('video/')) return 'dm_videos';
    if (file.type && file.type.startsWith('audio/')) return 'dm_audio';
    return 'dm_attachments';
  }

  function kindForFile(file) {
    if (file.type && file.type.startsWith('video/')) return 'video';
    if (file.type && file.type.startsWith('audio/')) return 'audio';
    return 'image';
  }

  function validateFile(file) {
    if (!file) throw new Error('No file selected.');
    if (!canUpload()) throw new Error('Upload service not available.');
    if (file.type && file.type.startsWith('image/')) {
      if (file.size > MAX_BYTES) throw new Error('Image too large (max 10 MB).');
      return;
    }
    if (file.type && file.type.startsWith('video/')) {
      if (file.size > 100 * 1024 * 1024) throw new Error('Video too large (max 100 MB).');
      return;
    }
    if (file.type && file.type.startsWith('audio/')) {
      if (file.size > 15 * 1024 * 1024) throw new Error('Voice note too large (max 15 MB).');
      return;
    }
    if (!file.type) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].indexOf(ext) >= 0) {
        if (file.size > MAX_BYTES) throw new Error('Image too large (max 10 MB).');
        return;
      }
      if (['mp4', 'webm', 'mov', 'm4v'].indexOf(ext) >= 0) {
        if (file.size > 100 * 1024 * 1024) throw new Error('Video too large (max 100 MB).');
        return;
      }
      if (['webm', 'm4a', 'mp3', 'wav', 'ogg'].indexOf(ext) >= 0) {
        if (file.size > 15 * 1024 * 1024) throw new Error('Voice note too large (max 15 MB).');
        return;
      }
    }
    throw new Error('Unsupported file type. Use photo, video, or audio.');
  }

  /**
   * Resize large photos before upload for faster sends on mobile.
   * @param {File} file
   * @returns {Promise<File>}
   */
  function compressImageFile(file) {
    if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
      return Promise.resolve(file);
    }
    if (file.size < COMPRESS_MIN_BYTES) return Promise.resolve(file);
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width;
        var h = img.height;
        var scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              resolve(file);
              return;
            }
            var name = (file.name || 'photo.jpg').replace(/\.[^.]+$/, '') + '.jpg';
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  /**
   * @param {File} file
   * @param {{ onProgress?: function(number), signal?: AbortSignal }} [options]
   * @returns {Promise<{url: string, kind: 'image'|'video'|'audio'}>}
   */
  async function uploadCe2Media(file, options) {
    validateFile(file);
    var uploadFile = file;
    if (file.type && file.type.startsWith('image/')) {
      uploadFile = await compressImageFile(file);
    }
    var folder = folderForFile(uploadFile);
    var url = await uploadToR2(uploadFile, folder, options || {});
    return { url: url, kind: kindForFile(file) };
  }

  global.Ce2Attachments = {
    uploadCe2Media: uploadCe2Media,
    compressImageFile: compressImageFile,
    MAX_BYTES: MAX_BYTES,
    VERSION: 4,
  };
})(typeof window !== 'undefined' ? window : global);
