/**
 * CE2 — offline text send queue (retries when online)
 */
(function (global) {
  'use strict';

  var KEY = 'ce2_offline_queue_v1';

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
    } catch (_) {}
  }

  function enqueue(item) {
    var list = read();
    list.push(item);
    write(list);
  }

  function remove(id) {
    write(read().filter(function (x) {
      return x.id !== id;
    }));
  }

  function list() {
    return read();
  }

  global.Ce2OfflineQueue = {
    enqueue: enqueue,
    remove: remove,
    list: list,
    KEY: KEY,
  };
})(typeof window !== 'undefined' ? window : global);
