// ================================================================
// UPLOAD UTILITIES
// All user media uploads go directly to R2 via a Cloudflare Worker
// that signs the request server-side — no credentials in the browser.
// ================================================================

// Update this after running: cd workers/upload-signer && npx wrangler deploy
const UPLOAD_WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

function detectUploadContentType(file) {
  let contentType = file.type;
  if (!contentType) {
    const ext = file.name.split('.').pop().toLowerCase();
    const extMap = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', heic: 'image/heic',
      mp4: 'video/mp4', webm: 'video/webm',
      mov: 'video/quicktime', m4v: 'video/x-m4v',
      m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    };
    contentType = extMap[ext] || 'application/octet-stream';
  }
  return contentType;
}

function uploadToR2XHR(file, folder, idToken, filename, contentType, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${UPLOAD_WORKER_URL}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('X-Folder', folder);
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
          resolve(data.publicUrl);
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

  const idToken = await user.getIdToken();
  const uid = Math.random().toString(36).slice(2, 8);
  const filename = `${Date.now()}_${uid}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const contentType = detectUploadContentType(file);
  options = options || {};

  if (options.onProgress || options.signal) {
    return uploadToR2XHR(file, folder, idToken, filename, contentType, options);
  }

  const res = await fetch(`${UPLOAD_WORKER_URL}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': contentType,
      'X-Folder': folder,
      'X-Filename': filename,
    },
    body: file,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }

  const { publicUrl } = await res.json();
  return publicUrl;
}

// Upload image → R2 (with optional editing)
async function uploadImage(file, _userId, allowEdit = false) {
  if (!file) return null;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/heic'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only JPG, PNG, WebP, and HEIC are allowed.');
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

  return uploadToR2(file, 'ugc-photos');
}

// Upload video → R2
async function uploadVideo(file, _userId) {
  if (!file) return null;

  // Allow empty MIME type — iOS camera roll sometimes reports '' for valid .mov/.mp4 files
  if (file.type && !['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'].includes(file.type)) {
    throw new Error('Invalid file type. Only MP4, WebM, and MOV are allowed.');
  }

  const maxSize = 100 * 1024 * 1024; // 100 MB
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 100 MB.');
  }

  return uploadToR2(file, 'ugc-videos');
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
