/**
 * CE2 Audio Phase 1B — IndexedDB outbox for failed voice uploads.
 * Stores blobs only; text offline queue remains ce2-offline-queue.js.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'ce2_audio_outbox_v1';
  var STORE = 'entries';
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!global.indexedDB) {
      return Promise.reject(new Error('IndexedDB not available'));
    }
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'localId' });
          os.createIndex('conversationId', 'conversationId', { unique: false });
          os.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error('Failed to open audio outbox'));
      };
    });
    return dbPromise;
  }

  function writeTx(fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        try {
          fn(tx.objectStore(STORE));
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error || new Error('Outbox write failed'));
        };
      });
    });
  }

  function readRequest(factory) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = factory(db.transaction(STORE, 'readonly').objectStore(STORE));
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error || new Error('Outbox read failed'));
        };
      });
    });
  }

  function fileToEntry(file, meta) {
    meta = meta || {};
    return file.arrayBuffer().then(function (buf) {
      return {
        localId: meta.localId,
        conversationId: meta.conversationId || '',
        convType: meta.convType || 'direct',
        otherUid: meta.otherUid || '',
        blobBuffer: buf,
        mime: file.type || meta.mime || 'audio/webm',
        durationMs: meta.durationMs || 0,
        audioWaveformPeaks: meta.audioWaveformPeaks || null,
        createdAt: meta.createdAt || Date.now(),
        retryCount: meta.retryCount || 0,
        classification: meta.classification || 'foundation',
        shareable: meta.shareable !== false,
        replyTo: meta.replyTo || null,
        pendingId: meta.pendingId || '',
      };
    });
  }

  function entryToFile(entry) {
    var blob = new Blob([entry.blobBuffer], { type: entry.mime || 'audio/webm' });
    var ext = (entry.mime || '').indexOf('mp4') >= 0 ? 'm4a' : 'webm';
    return new File([blob], 'voice-' + entry.localId + '.' + ext, {
      type: entry.mime || 'audio/webm',
    });
  }

  global.Ce2AudioOutbox = {
    init: openDb,

    putFromFile: function (file, meta) {
      return fileToEntry(file, meta).then(function (entry) {
        return writeTx(function (store) {
          store.put(entry);
        });
      });
    },

    put: function (entry) {
      return writeTx(function (store) {
        store.put(entry);
      });
    },

    get: function (localId) {
      return readRequest(function (store) {
        return store.get(localId);
      });
    },

    remove: function (localId) {
      return writeTx(function (store) {
        store.delete(localId);
      });
    },

    list: function () {
      return readRequest(function (store) {
        return store.getAll();
      }).then(function (rows) {
        return rows || [];
      });
    },

    listForConversation: function (conversationId) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readonly');
          var index = tx.objectStore(STORE).index('conversationId');
          var req = index.getAll(conversationId || '');
          req.onsuccess = function () {
            resolve(req.result || []);
          };
          req.onerror = function () {
            reject(req.error || new Error('Outbox read failed'));
          };
        });
      });
    },

    incrementRetry: function (localId) {
      return global.Ce2AudioOutbox.get(localId).then(function (entry) {
        if (!entry) return null;
        entry.retryCount = (entry.retryCount || 0) + 1;
        return global.Ce2AudioOutbox.put(entry).then(function () {
          return entry;
        });
      });
    },

    toFile: entryToFile,

    VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : global);
