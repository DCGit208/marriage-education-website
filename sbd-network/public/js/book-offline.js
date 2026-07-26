/**
 * Book offline packages — IndexedDB only (never used for courses).
 */
(function (global) {
  'use strict';

  const DB_NAME = 'sbd-book-offline';
  const DB_VERSION = 1;
  const STORE = 'books';

  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
    });
  }

  function saveBook(pack) {
    if (!pack || !pack.id) return Promise.reject(new Error('Missing book package'));
    const record = Object.assign({}, pack, { savedAt: Date.now() });
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function () { resolve(record.id); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getBook(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function listBooks() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function removeBook(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function hasBook(id) {
    return getBook(id).then(function (row) { return !!row; });
  }

  global.BookOffline = {
    saveBook: saveBook,
    getBook: getBook,
    listBooks: listBooks,
    removeBook: removeBook,
    hasBook: hasBook,
  };
})(window);
