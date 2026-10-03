// ================================================================
// UPLOAD UTILITIES
// All user media uploads go directly to R2 via a Cloudflare Worker
// that signs the request server-side — no credentials in the browser.
// ================================================================

// Update this after running: cd workers/upload-signer && npx wrangler deploy
const UPLOAD_WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

const CE2_DM_UPLOAD_FOLDERS = ['dm_attachments', 'dm_videos', 'dm_audio'];

function stripUploadContentTypeParams(contentType) {
  return String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

function isCe2DmUploadFolder(folder) {
  return CE2_DM_UPLOAD_FOLDERS.indexOf(String(folder || '')) >= 0;
}

function sanitizeUploadScopeId(scopeId) {
  const s = String(scopeId || '').trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(s)) return '';
  return s;
}

/**
 * CE2 media: `dm_attachments/{convOrGroupId}`.
 * Legacy / non-CE2 callers omit conversationId and keep `{folder}`.
 */
function scopedUploadFolder(folder, conversationId) {
  const base = String(folder || '');
  if (!isCe2DmUploadFolder(base)) return base;
  const scope = sanitizeUploadScopeId(conversationId);
  if (!scope) return base;
  return base + '/' + scope;
}

function firebaseStorageObjectPath(folder, uid, filename, options) {
  options = options || {};
  const scoped = scopedUploadFolder(folder, options.conversationId);
  return scoped + '/' + uid + '/' + filename;
}

function r2ObjectKey(folder, filename, options) {
  options = options || {};
  const scoped = scopedUploadFolder(folder, options.conversationId);
  if (isCe2DmUploadFolder(folder) && sanitizeUploadScopeId(options.conversationId)) {
    return 'ce2/' + scoped + '/' + filename;
  }
  return scoped + '/' + filename;
}

function isCe2PrivateObjectKey(key) {
  const parts = String(key || '').replace(/^\/+/, '').split('/').filter(Boolean);
  return (
    parts.length === 4 &&
    parts[0] === 'ce2' &&
    isCe2DmUploadFolder(parts[1]) &&
    !!sanitizeUploadScopeId(parts[2]) &&
    !!parts[3] &&
    String(parts[3]).indexOf('..') < 0
  );
}

function isR2PublicCdnUrl(url) {
  const raw = String(url || '');
  if (!raw) return false;
  try {
    return /\.r2\.dev$/i.test(new URL(raw).hostname);
  } catch (_) {
    return /\.r2\.dev\//i.test(raw);
  }
}

function isCe2PrivateMediaLocator(url) {
  if (isCe2PrivateObjectKey(url)) return true;
  const raw = String(url || '');
  if (!raw || isR2PublicCdnUrl(raw)) return false;
  try {
    const u = new URL(raw, UPLOAD_WORKER_URL);
    const key = u.searchParams.get('key');
    if (key && isCe2PrivateObjectKey(key)) return true;
  } catch (_) {}
  return false;
}

function extractCe2ObjectKey(urlOrKey) {
  if (isCe2PrivateObjectKey(urlOrKey)) {
    return String(urlOrKey).replace(/^\/+/, '').split('?')[0];
  }
  try {
    const u = new URL(String(urlOrKey || ''), UPLOAD_WORKER_URL);
    const key = u.searchParams.get('key');
    if (key && isCe2PrivateObjectKey(key)) return key;
  } catch (_) {}
  return '';
}

function workerMediaLocatorFromKey(objectKey) {
  return `${UPLOAD_WORKER_URL}/media?key=${encodeURIComponent(objectKey)}`;
}

function isCe2PrivateUploadRequest(folder, options) {
  return isCe2DmUploadFolder(folder) && !!sanitizeUploadScopeId(options && options.conversationId);
}

/**
 * New CE2 R2 uploads store a Worker locator (objectKey), never a public CDN URL.
 * If the Worker is old and only returns publicUrl, return empty so the caller
 * can fall back to membership-locked Firebase Storage.
 */
function ce2UploadLocator(data, folder, options) {
  if (!isCe2PrivateUploadRequest(folder, options)) {
    return (data && data.publicUrl) || '';
  }
  if (data && data.objectKey && isCe2PrivateObjectKey(data.objectKey)) {
    if (data.url && isCe2PrivateMediaLocator(data.url) && !isR2PublicCdnUrl(data.url)) {
      return data.url;
    }
    return workerMediaLocatorFromKey(data.objectKey);
  }
  if (data && data.url && isCe2PrivateMediaLocator(data.url) && !isR2PublicCdnUrl(data.url)) {
    return data.url;
  }
  return '';
}

var R2_PUBLIC_URL = 'https://pub-6524d7976da94b11bb645c445abecb63.r2.dev';

var CE2_MEDIA_URL_FIELDS = [
  'imageUrl',
  'imageThumbUrl',
  'videoUrl',
  'videoPosterUrl',
  'audioUrl',
];

function r2PublicPathParts(url) {
  try {
    var u = new URL(String(url || ''));
    if (!/\.r2\.dev$/i.test(u.hostname)) return [];
    return u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Leftover world-readable CE2 conversation media on the public r2.dev bucket.
 * Private ce2/ Worker locators, Firebase Storage, and UGC/board folders return false.
 */
function isLegacyPublicCe2MediaUrl(url) {
  if (!url || isCe2PrivateMediaLocator(url) || isCe2PrivateObjectKey(url)) return false;
  var parts = r2PublicPathParts(url);
  if (!parts.length) return false;
  if (parts[0] === 'ugc-photos' || parts[0] === 'ugc-videos' || parts[0] === 'course-covers') {
    return false;
  }
  if (parts[0] === 'ce2' && CE2_DM_UPLOAD_FOLDERS.indexOf(parts[1]) >= 0) return true;
  return CE2_DM_UPLOAD_FOLDERS.indexOf(parts[0]) >= 0;
}

function collectLegacyCe2MediaFields(message) {
  var out = [];
  var msg = message || {};
  CE2_MEDIA_URL_FIELDS.forEach(function (field) {
    if (isLegacyPublicCe2MediaUrl(msg[field])) out.push(field);
  });
  return out;
}

function messageHasLegacyPublicCe2Media(message) {
  return collectLegacyCe2MediaFields(message).length > 0;
}

function legacyCe2MediaKind(message) {
  var m = message || {};
  if (isLegacyPublicCe2MediaUrl(m.audioUrl)) return 'voice';
  if (isLegacyPublicCe2MediaUrl(m.videoUrl)) return 'video';
  if (isLegacyPublicCe2MediaUrl(m.imageUrl) || isLegacyPublicCe2MediaUrl(m.imageThumbUrl)) {
    return 'image';
  }
  return 'file';
}

/**
 * Ask the Worker to copy leftover public CE2 objects into sbd-media-ce2
 * and rewrite this message's media pointer. Membership is checked server-side.
 * replacements: optional { field: privateLocatorOrKey } from a fresh re-upload.
 */
function migrateCe2MessageMedia(opts) {
  opts = opts || {};
  var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || typeof user.getIdToken !== 'function') {
    return Promise.reject(new Error('Not authenticated'));
  }
  if (!opts.conversationId || !opts.messageId) {
    return Promise.reject(new Error('Missing conversation or message'));
  }
  return user.getIdToken().then(function (idToken) {
    return fetch(UPLOAD_WORKER_URL + '/migrate-ce2-media', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + idToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: opts.conversationId,
        conversationType: opts.conversationType || 'direct',
        messageId: opts.messageId,
        replacements: opts.replacements || undefined,
      }),
    }).then(function (res) {
      return res.json().then(function (data) {
        data = data || {};
        data.status = res.status;
        if (!res.ok && !data.error) data.error = 'Could not move media';
        return data;
      }).catch(function () {
        return { error: 'Could not move media', status: res.status };
      });
    });
  });
}

var _ce2SignedUrlCache = Object.create(null);

/**
 * Resolve a stored CE2 media locator to a short-lived playable URL.
 * Public CDN leftovers, Firebase Storage URLs, and blob: URLs pass through.
 */
function resolveR2MediaUrl(storedUrl) {
  const raw = String(storedUrl || '');
  if (!raw) return Promise.resolve('');
  if (!isCe2PrivateMediaLocator(raw)) return Promise.resolve(raw);
  const key = extractCe2ObjectKey(raw);
  if (!key) return Promise.resolve(raw);
  const cached = _ce2SignedUrlCache[key];
  if (cached && cached.expiresAt * 1000 > Date.now() + 15000 && cached.signedUrl) {
    return Promise.resolve(cached.signedUrl);
  }
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || typeof user.getIdToken !== 'function') {
    return Promise.reject(new Error('Not authenticated'));
  }
  return user.getIdToken().then(function (idToken) {
    return fetch(`${UPLOAD_WORKER_URL}/sign-get`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + idToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: key }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || !data.signedUrl) {
          throw new Error((data && data.error) || 'Could not load media');
        }
        _ce2SignedUrlCache[key] = data;
        return data.signedUrl;
      });
    });
  });
}

function isLegacyFirebaseStoragePath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  return (
    parts.length === 3 &&
    CE2_DM_UPLOAD_FOLDERS.indexOf(parts[0]) >= 0
  );
}

function isConversationScopedFirebaseStoragePath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  return (
    parts.length === 4 &&
    CE2_DM_UPLOAD_FOLDERS.indexOf(parts[0]) >= 0 &&
    !!sanitizeUploadScopeId(parts[1]) &&
    !!parts[2] &&
    !!parts[3]
  );
}

function detectUploadContentType(file, folder) {
  let contentType = stripUploadContentTypeParams(file && file.type);
  if (contentType === 'image/x-png' || contentType === 'image/apng') contentType = 'image/png';
  const ext = ((file && file.name) || '').split('.').pop().toLowerCase();
  const folderName = String(folder || '');

  // Voice notes go to dm_audio. Empty File.type or a video/* .webm recording
  // must not become video/webm — Storage rules for dm_audio require audio/*.
  if (folderName === 'dm_audio') {
    if (
      !contentType ||
      contentType === 'application/octet-stream' ||
      contentType.indexOf('video/') === 0
    ) {
      const audioExtMap = {
        webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        aac: 'audio/mp4', caf: 'audio/x-caf',
      };
      contentType = audioExtMap[ext] || 'audio/webm';
    }
    return contentType;
  }

  if (!contentType) {
    const extMap = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
      gif: 'image/gif', bmp: 'image/bmp',
      mp4: 'video/mp4', webm: 'video/webm',
      mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp',
      m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
      aac: 'audio/mp4', caf: 'audio/x-caf',
    };
    contentType = extMap[ext] || '';
    if (!contentType) {
      if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp'].includes(ext)) {
        contentType = 'image/jpeg';
      } else if (['mp4', 'webm', 'mov', 'm4v', '3gp'].includes(ext)) {
        contentType = 'video/mp4';
      }
    }
    if (!contentType) contentType = 'application/octet-stream';
  }
  return contentType;
}

function assertUploadableFile(file) {
  if (!file) throw new Error('No file to upload.');
  if (!file.size) throw new Error('Recording is empty — nothing to upload.');
}

function canFallbackToFirebaseStorage(err) {
  const msg = String((err && err.message) || err || '');
  if (/not authenticated|forbidden/i.test(msg)) return false;
  return /network error|failed to fetch|content type not allowed|upload failed|load failed|cors|not configured|private media locator/i.test(msg);
}

function uploadToR2XHR(file, folder, idToken, filename, contentType, options) {
  options = options || {};
  const folderPath = scopedUploadFolder(folder, options.conversationId);
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${UPLOAD_WORKER_URL}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('X-Folder', folderPath);
    xhr.setRequestHeader('X-Filename', filename);

    if (options.onProgress) {
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) options.onProgress(e.loaded / e.total);
      });
    }

    xhr.addEventListener('load', function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const locator = ce2UploadLocator(data, folder, options);
          if (!locator) {
            reject(new Error(
              isCe2PrivateUploadRequest(folder, options)
                ? 'Upload did not return a private media locator'
                : 'Invalid upload response'
            ));
            return;
          }
          resolve(locator);
        } catch (err) {
          reject(new Error('Invalid upload response'));
        }
        return;
      }
      let msg = `Upload failed (${xhr.status})`;
      try {
        const err = JSON.parse(xhr.responseText);
        if (err.error) msg = err.error;
      } catch (_) {}
      reject(new Error(msg));
    });

    xhr.addEventListener('error', function () {
      reject(new Error('Upload failed — network error'));
    });

    xhr.addEventListener('abort', function () {
      reject(new Error('Upload cancelled'));
    });

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', function () {
        xhr.abort();
      });
    }

    xhr.send(file);
  });
}

/**
 * Upload a file to R2 via the Cloudflare Worker proxy.
 * @param {File} file
 * @param {string} folder
 * @param {{ onProgress?: function(number), signal?: AbortSignal }} [options]
 */
async function uploadToR2(file, folder, options) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  assertUploadableFile(file);

  const idToken = await user.getIdToken();
  const uid = Math.random().toString(36).slice(2, 8);
  const filename = `${Date.now()}_${uid}_${(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const contentType = detectUploadContentType(file, folder);
  options = options || {};
  const folderPath = scopedUploadFolder(folder, options.conversationId);

  try {
    if (options.onProgress || options.signal) {
      return await uploadToR2XHR(file, folder, idToken, filename, contentType, options);
    }

    const res = await fetch(`${UPLOAD_WORKER_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': contentType,
        'X-Folder': folderPath,
        'X-Filename': filename,
      },
      body: file,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed (${res.status})`);
    }

    const data = await res.json().catch(() => ({}));
    const locator = ce2UploadLocator(data, folder, options);
    if (!locator) {
      throw new Error(
        isCe2PrivateUploadRequest(folder, options)
          ? 'Upload did not return a private media locator'
          : (data.error || 'Invalid upload response')
      );
    }
    return locator;
  } catch (err) {
    console.error('[upload] R2 upload failed; no Firebase Storage fallback was used:', err && err.message);
    throw err;
  }
}

/**
 * Delete one R2 object by its public URL (dm_attachments, dm_videos, dm_audio, etc.).
 * Best-effort — failures are swallowed so Firestore unsend can still proceed.
 * @param {string} url
 */
async function deleteFromR2(url) {
  if (!url || typeof url !== 'string') return;
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) return;
  const idToken = await user.getIdToken().catch(() => null);
  if (!idToken) return;
  const objectKey = extractCe2ObjectKey(url);
  await fetch(`${UPLOAD_WORKER_URL}/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(objectKey ? { objectKey: objectKey, url: url } : { url: url }),
  }).catch(() => {});
}

/**
 * @param {string[]} urls
 */
async function deleteMediaUrlsFromR2(urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return;
  await Promise.all(list.map(deleteFromR2));
}

/**
 * Upload via Firebase Storage (same-origin auth — no cross-origin CORS).
 * Used by CE2 Messages when the R2 worker is unreachable from the page origin.
 * @param {File} file
 * @param {string} folder  dm_attachments | dm_videos | dm_audio
 * @param {{ onProgress?: function(number), signal?: AbortSignal }} [options]
 */
function uploadToFirebaseStorage(file, folder, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    const user = getCurrentUser();
    if (!user) {
      reject(new Error('Not authenticated'));
      return;
    }
    if (typeof firebase === 'undefined' || !firebase.storage) {
      reject(new Error('Storage SDK not loaded'));
      return;
    }
    try {
      assertUploadableFile(file);
    } catch (emptyErr) {
      reject(emptyErr);
      return;
    }
    const contentType = detectUploadContentType(file, folder);
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = firebaseStorageObjectPath(
      folder,
      user.uid,
      Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName,
      options
    );
    const ref = firebase.storage().ref(path);
    const task = ref.put(file, { contentType: contentType });

    if (options.signal) {
      if (options.signal.aborted) {
        task.cancel();
        reject(new Error('Upload cancelled'));
        return;
      }
      options.signal.addEventListener('abort', function () {
        task.cancel();
      });
    }

    task.on(
      'state_changed',
      function (snap) {
        if (options.onProgress && snap.totalBytes) {
          options.onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      },
      function (err) {
        if (err && err.code === 'storage/canceled') {
          reject(new Error('Upload cancelled'));
          return;
        }
        reject(new Error((err && err.message) || 'Storage upload failed'));
      },
      function () {
        ref.getDownloadURL().then(resolve).catch(reject);
      }
    );
  });
}

// Upload image → R2 (with optional editing)
function normalizeImageMimeType(file) {
  if (!file) return '';
  const t = String(file.type || '').toLowerCase();
  if (t) return t;
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return '';
}

async function uploadImage(file, _userId, allowEdit = false, options = null) {
  if (!file) return null;

  const mime = normalizeImageMimeType(file);
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/heic', 'image/heif'];
  if (!validTypes.includes(mime)) {
    throw new Error('Invalid file type. Only JPG, PNG, WebP, and HEIC are allowed.');
  }

  // iOS camera roll often reports type === '' — normalize before upload
  if (!file.type && mime) {
    file = new File([file], file.name || 'photo.jpg', { type: mime });
  }

  const maxSize = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 10 MB.');
  }

  // Prompt user to edit image if imageEditor is available
  if (allowEdit && typeof editImageBeforeUpload === 'function') {
    const editedBlob = await editImageBeforeUpload(file);
    if (editedBlob) {
      // User edited the image, use the edited version
      file = new File([editedBlob], file.name, { type: 'image/jpeg' });
    }
    // If editedBlob is null, user cancelled, simply continue with original file
  }

  return uploadToR2(file, 'ugc-photos', options || undefined);
}

/**
 * Upload a course / issue cover image to R2 (course-covers folder).
 * @param {File} file
 * @param {{ onProgress?: function(number), signal?: AbortSignal }} [options]
 * @returns {Promise<string>} public URL
 */
async function uploadCourseCover(file, options) {
  if (!file) return null;
  const mime = normalizeImageMimeType(file);
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!validTypes.includes(mime)) {
    throw new Error('Invalid cover type. Use JPG, PNG, or WebP.');
  }
  if (!file.type && mime) {
    file = new File([file], file.name || 'cover.jpg', { type: mime });
  }
  const maxSize = 8 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Cover too large. Maximum size is 8 MB.');
  }
  try {
    return await uploadToR2(file, 'course-covers', options || undefined);
  } catch (err) {
    // Older workers may not allow course-covers yet — fall back to ugc-photos.
    if (/folder|Forbidden|Invalid folder/i.test(String(err && err.message || err))) {
      return uploadToR2(file, 'ugc-photos', options || undefined);
    }
    throw err;
  }
}

// Upload video → R2
async function uploadVideo(file, _userId, options = null) {
  if (!file) return null;

  // Allow empty MIME type — iOS camera roll sometimes reports '' for valid .mov/.mp4 files
  if (file.type && !['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'].includes(file.type)) {
    throw new Error('Invalid file type. Only MP4, WebM, and MOV are allowed.');
  }

  const maxSize = 100 * 1024 * 1024; // 100 MB
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 100 MB.');
  }

  return uploadToR2(file, 'ugc-videos', options || undefined);
}

/**
 * Generate a JPEG thumbnail from a video File by seeking to 0.5s and
 * drawing the first decodable frame onto a canvas.
 * Returns a File blob ready for uploadImage(), or null on failure.
 */
function generateVideoThumbnail(videoFile) {
  return new Promise(resolve => {
    // Safety net — some iOS codecs never fire loadeddata/onseeked; bail after 8s
    const timer = setTimeout(() => resolve(null), 8000);
    const url   = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload  = 'metadata';
    video.muted    = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const cleanup = () => { clearTimeout(timer); URL.revokeObjectURL(url); };

    video.onloadeddata = () => {
      // Seek to 0.5s (or 0 if shorter)
      video.currentTime = Math.min(0.5, video.duration || 0);
    };

    video.onseeked = () => {
      try {
        const MAX = 640;
        const ratio  = Math.min(MAX / video.videoWidth, MAX / video.videoHeight, 1);
        const w = Math.round(video.videoWidth  * ratio);
        const h = Math.round(video.videoHeight * ratio);
        const canvas  = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        canvas.toBlob(blob => {
          cleanup();
          if (!blob) { resolve(null); return; }
          resolve(new File([blob], 'thumb.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      } catch (e) {
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => { cleanup(); resolve(null); };
    video.src = url;
    video.load();
  });
}

// Validate YouTube URL
function isYouTubeUrl(url) {
  if (!url) return false;
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/
  ];
  return patterns.some(pattern => pattern.test(url));
}

// Convert YouTube URL to embed URL
function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  
  let videoId = null;
  
  // Extract video ID from various YouTube URL formats
  if (url.includes('youtube.com/watch')) {
    const urlParams = new URLSearchParams(new URL(url).search);
    videoId = urlParams.get('v');
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1].split(/[?&]/)[0];
  } else if (url.includes('youtube.com/embed/')) {
    videoId = url.split('embed/')[1].split(/[?&]/)[0];
  }
  
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

// Validate video URL
function isValidVideoUrl(url) {
  if (!url) return false;
  
  // Check if YouTube URL
  if (isYouTubeUrl(url)) return true;
  
  // Check if direct video URL (.mp4, .webm, .ogg)
  const videoExtensions = ['.mp4', '.webm', '.ogg'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
}

// Create image preview
function createImagePreview(file, previewElement) {
  if (!file || !previewElement) return;
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    previewElement.innerHTML = `
      <img src="${e.target.result}" alt="Preview" style="max-width: 100%; border-radius: 8px;">
    `;
    previewElement.style.display = 'block';
  };
  
  reader.readAsDataURL(file);
}

// Clear image preview
function clearImagePreview(previewElement) {
  if (previewElement) {
    previewElement.innerHTML = '';
    previewElement.style.display = 'none';
  }
}

console.log('Upload utilities loaded');
