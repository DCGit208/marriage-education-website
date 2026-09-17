/**
 * CE2 Phase 3 — image / video / voice attachments (Cloudflare R2 via upload.js)
 */
(function (global) {
  'use strict';

  var MAX_BYTES = 10 * 1024 * 1024;
  var COMPRESS_MIN_BYTES = 350000;
  var COMPRESS_MAX_DIM = 1920;
  var THUMB_MAX_DIM = 480;
  var THUMB_JPEG_QUALITY = 0.72;

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
    if (!file.size) throw new Error('Recording is empty — nothing to upload.');
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

  function stripMimeParams(type) {
    return String(type || '').toLowerCase().split(';')[0].trim();
  }

  function normalizedAudioMime(file) {
    var type = stripMimeParams(file && file.type);
    if (type.indexOf('audio/') === 0) return type;
    var ext = fileExt(file);
    if (ext === 'm4a' || ext === 'mp4' || ext === 'aac') return 'audio/mp4';
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'ogg') return 'audio/ogg';
    if (ext === 'caf') return 'audio/x-caf';
    return 'audio/webm';
  }

  function normalizeUploadFile(file) {
    if (!file) return file;
    if (isAudioFile(file)) {
      var audioMime = normalizedAudioMime(file);
      if (String(file.type || '') !== audioMime) {
        return new File([file], file.name || 'voice.webm', { type: audioMime });
      }
      return file;
    }
    if (!isImageFile(file)) return file;
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

  function withSoftTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(fallback);
      }, ms || 5000);
      promise
        .then(function (result) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(fallback);
        });
    });
  }

  function createImageThumbBlob(file) {
    if (!file || !isImageFile(file) || isVideoFile(file) || isAudioFile(file)) {
      return Promise.resolve(null);
    }
    if (file.type === 'image/gif' || fileExt(file) === 'gif') {
      return Promise.resolve(null);
    }
    return loadImageElement(file)
      .then(function (img) {
        var w = img.width;
        var h = img.height;
        if (!w || !h) return null;
        var scale = Math.min(1, THUMB_MAX_DIM / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        return new Promise(function (resolve) {
          canvas.toBlob(
            function (blob) {
              resolve(blob || null);
            },
            'image/jpeg',
            THUMB_JPEG_QUALITY
          );
        });
      })
      .catch(function () {
        return null;
      });
  }

  async function uploadChatThumb(file, baseName, options) {
    if (!file) return null;
    try {
      var thumbFile = new File([file], (baseName || 'thumb') + '_thumb.jpg', {
        type: 'image/jpeg',
      });
      return await withUploadTimeout(
        uploadMediaFile(thumbFile, 'dm_attachments', options || {}),
        60000
      );
    } catch (_) {
      return null;
    }
  }

  function uploadMediaFile(file, folder, options) {
    if (!r2Ready()) {
      return Promise.reject(new Error('R2 upload service not available.'));
    }
    return uploadToR2(file, folder, options || {});
  }

  function captureVideoPosterBlob(file) {
    return new Promise(function (resolve) {
      if (!file || !isVideoFile(file)) {
        resolve(null);
        return;
      }
      var blobUrl = URL.createObjectURL(file);
      var video = document.createElement('video');
      var settled = false;
      function finish(blob) {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(blobUrl);
        video.removeAttribute('src');
        try {
          video.load();
        } catch (_) {}
        resolve(blob || null);
      }
      function snapFrame() {
        try {
          var w = video.videoWidth || 0;
          var h = video.videoHeight || 0;
          if (!w || !h) {
            finish(null);
            return;
          }
          var max = 640;
          if (w > max) {
            h = Math.round(h * (max / w));
            w = max;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            function (blob) {
              finish(blob);
            },
            'image/jpeg',
            0.82
          );
        } catch (_) {
          finish(null);
        }
      }
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.addEventListener(
        'error',
        function () {
          finish(null);
        },
        { once: true }
      );
      video.addEventListener(
        'loadeddata',
        function () {
          try {
            if (video.videoWidth > 0) {
              snapFrame();
              return;
            }
            var t = Math.min(0.12, Math.max(0.01, (video.duration || 1) * 0.05));
            video.currentTime = t;
          } catch (_) {
            snapFrame();
          }
        },
        { once: true }
      );
      video.addEventListener(
        'seeked',
        function () {
          snapFrame();
        },
        { once: true }
      );
      video.src = blobUrl;
    });
  }

  /** Best-effort first-frame preview for <video> thumbs (composer + legacy messages). */
  function primeVideoThumbnail(video, url) {
    if (!video) return;
    var src = url || video.getAttribute('src') || video.src || '';
    if (!src) return;
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    if (src.indexOf('#') < 0) {
      video.src = src + '#t=0.001';
    } else if (!video.src) {
      video.src = src;
    }
    video.addEventListener(
      'loadeddata',
      function () {
        try {
          video.currentTime = 0.01;
        } catch (_) {}
      },
      { once: true }
    );
  }

  async function uploadCe2Media(file, options) {
    validateFile(file);
    var uploadFile = file;
    if (isImageFile(file)) {
      uploadFile = await compressImageFile(file);
      uploadFile = normalizeUploadFile(uploadFile);
    } else if (isAudioFile(file)) {
      uploadFile = normalizeUploadFile(file);
    }

    var previewPromise = null;
    if (isImageFile(file)) {
      previewPromise = createImageThumbBlob(uploadFile)
        .then(function (imageThumb) {
          if (!imageThumb) return null;
          var imgBase = (file.name || 'photo').replace(/\.[^.]+$/, '');
          return uploadChatThumb(imageThumb, imgBase, {});
        })
        .catch(function () { return null; });
    } else if (isVideoFile(file)) {
      previewPromise = captureVideoPosterBlob(file)
        .then(function (posterBlob) {
          if (!posterBlob) return null;
          var base = (file.name || 'video').replace(/\.[^.]+$/, '');
          var posterFile = new File([posterBlob], base + '_thumb.jpg', { type: 'image/jpeg' });
          return withUploadTimeout(uploadMediaFile(posterFile, 'dm_attachments', {}), 30000);
        })
        .catch(function () { return null; });
    }

    var folder = folderForFile(uploadFile);
    var url = await withUploadTimeout(
      uploadMediaFile(uploadFile, folder, options || {}),
      180000
    );
    if (!url) throw new Error('Upload returned no URL.');
    var result = { url: url, kind: kindForFile(file) };
    if (isImageFile(file)) {
      try {
        var thumbUrl = await withSoftTimeout(previewPromise || Promise.resolve(null), 3500, null);
        if (thumbUrl) result.thumbUrl = thumbUrl;
      } catch (_) {}
    }
    if (isVideoFile(file)) {
      try {
        var posterUrl = await withSoftTimeout(previewPromise || Promise.resolve(null), 5000, null);
        if (posterUrl) {
          result.posterUrl = posterUrl;
          result.thumbUrl = posterUrl;
        }
      } catch (_) {}
    }
    return result;
  }

  global.Ce2Attachments = {
    uploadCe2Media: uploadCe2Media,
    compressImageFile: compressImageFile,
    validateComposerFile: validateFile,
    mediaKindForFile: kindForFile,
    isVideoFile: isVideoFile,
    isImageFile: isImageFile,
    r2Ready: r2Ready,
    primeVideoThumbnail: primeVideoThumbnail,
    MAX_BYTES: MAX_BYTES,
    VERSION: 15,
  };
})(typeof window !== 'undefined' ? window : global);
