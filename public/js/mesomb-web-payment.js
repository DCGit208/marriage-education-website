/**
 * Automatic Mobile Money (MTN MoMo / Orange Money) checkout panel for
 * marriageducation.com payment pages. Uses the same MeSomb integration as
 * /foundation-access. The server decides the price; this panel only says WHAT
 * is being bought (kind + ids) and shows the amount the server quotes.
 *
 * Needs firebase-app-compat and firebase-functions-compat on the page.
 *
 *   MEMesombPayment.mount({
 *     container: element,
 *     kind: 'ambassador-registration' | 'rd-registration' | 'product',
 *     getContext: () => ({ ambassadorCode, ambassadorData, recruitedBy } | { rdCode } | { productId, ref }),
 *     defaultEmail, defaultPhone, defaultNetwork,
 *     onSuccess: ({ reference, email }) => {},
 *     onUnavailable: (message) => {}   // quote refused (e.g. product has no server price)
 *   });
 */
(function (global) {
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDK2FjzMM5cZ6zkpz89LieauLDTBT8DzYc',
    authDomain: 'marriage-education.firebaseapp.com',
    projectId: 'marriage-education',
    storageBucket: 'marriage-education.firebasestorage.app',
    messagingSenderId: '730854285800',
    appId: '1:730854285800:web:2176d278397398fd41045d'
  };

  var styleInjected = false;
  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css = [
      '.mwp{border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#fff;color:#111827;font-family:inherit}',
      '.mwp h3{margin:0 0 6px;font-size:1.1rem}',
      '.mwp-sub{margin:0 0 14px;color:#4b5563;font-size:.9rem}',
      '.mwp-amount{font-weight:700;font-size:1.05rem;margin:0 0 14px}',
      '.mwp-nets{display:flex;gap:8px;margin:0 0 12px}',
      '.mwp-net{flex:1;padding:10px;border-radius:8px;border:2px solid #d1d5db;background:#fff;cursor:pointer;font-weight:600;font-size:.95rem}',
      '.mwp-net.active{border-color:#00b894;background:#ecfdf5}',
      '.mwp label{display:block;font-size:.85rem;font-weight:600;margin:10px 0 4px;color:#374151}',
      '.mwp input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:1rem}',
      '.mwp-btn{width:100%;margin-top:14px;padding:13px;border:0;border-radius:8px;background:#00b894;color:#fff;font-weight:700;font-size:1rem;cursor:pointer}',
      '.mwp-btn[disabled]{opacity:.6;cursor:not-allowed}',
      '.mwp-msg{display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:.92rem;line-height:1.4}',
      '.mwp-msg.show{display:block}',
      '.mwp-msg.info{background:#eff6ff;color:#1e40af}',
      '.mwp-msg.ok{background:#ecfdf5;color:#065f46}',
      '.mwp-msg.err{background:#fef2f2;color:#991b1b}'
    ].join('');
    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  function ensureFirebase() {
    if (!global.firebase) throw new Error('Firebase is not loaded on this page.');
    if (!global.firebase.apps.length) global.firebase.initializeApp(FIREBASE_CONFIG);
  }

  function fmtXaf(n) {
    return Number(n || 0).toLocaleString('en-US') + ' FCFA';
  }

  function callableMessage(err) {
    var msg = err && err.message ? String(err.message) : '';
    return msg && msg.toLowerCase() !== 'internal' ? msg : 'Something went wrong. Please try again.';
  }

  function mount(opts) {
    injectStyles();
    ensureFirebase();

    var root = opts.container;
    var network = opts.defaultNetwork === 'orange' ? 'orange' : 'mtn';
    var callCreate = global.firebase.functions().httpsCallable('createMesombWebPayment');
    var callCheck = global.firebase.functions().httpsCallable('checkSbdGuestMeSombPayment');
    var busy = false;

    root.innerHTML =
      '<div class="mwp">' +
      '<h3>📲 Pay automatically with Mobile Money</h3>' +
      '<p class="mwp-sub">We send a payment request to your phone. Approve it with your PIN and everything is confirmed automatically — no screenshots, no waiting for manual approval.</p>' +
      '<p class="mwp-amount" data-role="amount">Checking price…</p>' +
      '<div class="mwp-nets" role="group" aria-label="Mobile money network">' +
      '<button type="button" class="mwp-net" data-net="mtn">🟡 MTN MoMo</button>' +
      '<button type="button" class="mwp-net" data-net="orange">🟠 Orange Money</button>' +
      '</div>' +
      '<label data-role="phone-label">Your MTN MoMo phone number</label>' +
      '<input type="tel" inputmode="tel" placeholder="670000000" data-role="phone" autocomplete="tel">' +
      '<label>Email address (confirmation and login details are sent here)</label>' +
      '<input type="email" placeholder="your@email.com" data-role="email" autocomplete="email">' +
      '<button type="button" class="mwp-btn" data-role="pay" disabled>Send payment request</button>' +
      '<div class="mwp-msg" data-role="msg" role="status" aria-live="polite"></div>' +
      '</div>';

    var q = function (role) { return root.querySelector('[data-role="' + role + '"]'); };
    var amountEl = q('amount'), phoneEl = q('phone'), emailEl = q('email'), payBtn = q('pay'), msgEl = q('msg');
    if (opts.defaultPhone) phoneEl.value = String(opts.defaultPhone).replace(/\D/g, '').replace(/^237/, '');
    if (opts.defaultEmail) emailEl.value = opts.defaultEmail;

    function say(text, type) {
      msgEl.textContent = text || '';
      msgEl.className = 'mwp-msg' + (text ? ' show ' + (type || 'info') : '');
    }

    function syncNetwork() {
      root.querySelectorAll('.mwp-net').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-net') === network); });
      q('phone-label').textContent = network === 'orange' ? 'Your Orange Money phone number' : 'Your MTN MoMo phone number';
    }
    root.querySelectorAll('.mwp-net').forEach(function (b) {
      b.addEventListener('click', function () { network = b.getAttribute('data-net'); syncNetwork(); });
    });
    syncNetwork();

    function context() {
      return (typeof opts.getContext === 'function' ? opts.getContext() : {}) || {};
    }

    // Ask the server for the price (no charge).
    (function loadQuote() {
      callCreate(Object.assign({ kind: opts.kind, quoteOnly: true }, context()))
        .then(function (res) {
          var d = res.data || {};
          amountEl.textContent = 'Amount: ' + fmtXaf(d.amountXaf);
          payBtn.disabled = false;
        })
        .catch(function (err) {
          var message = callableMessage(err);
          amountEl.textContent = '';
          say(message, 'err');
          if (typeof opts.onUnavailable === 'function') opts.onUnavailable(message);
        });
    })();

    function finish(email, reference) {
      say('Payment confirmed! ✅ Your payment was received.', 'ok');
      payBtn.textContent = 'Payment confirmed';
      payBtn.disabled = true;
      if (typeof opts.onSuccess === 'function') opts.onSuccess({ reference: reference, email: email, root: root, say: say });
    }

    function poll(reference, email) {
      var attempts = 0;
      (function tick() {
        attempts += 1;
        if (attempts > 60) {
          say('We are still waiting for confirmation. If you approved the payment you do NOT need to pay again — it will be completed automatically. Reference: ' + reference, 'info');
          busy = false; payBtn.disabled = false; payBtn.textContent = 'Send payment request';
          return;
        }
        callCheck({ reference: reference }).then(function (res) {
          var d = res.data || {};
          if (d.success && d.status === 'SUCCESS') return finish(email, reference);
          if (d.status === 'FAILED' || d.pending === false) {
            say('The Mobile Money payment was not completed, so you have not been charged. Please try again or use another method.', 'err');
            busy = false; payBtn.disabled = false; payBtn.textContent = 'Send payment request';
            return;
          }
          setTimeout(tick, 5000);
        }).catch(function () { setTimeout(tick, 5000); });
      })();
    }

    payBtn.addEventListener('click', function () {
      if (busy) return;
      var phone = phoneEl.value.replace(/\D/g, '').replace(/^237/, '');
      var email = emailEl.value.trim();
      if (phone.length !== 9) return say('Enter the 9-digit Mobile Money number you are paying from.', 'err');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('Enter a valid email address.', 'err');

      var extra;
      try { extra = context(); } catch (e) { return say(e.message || 'Please complete the form first.', 'err'); }

      busy = true; payBtn.disabled = true; payBtn.textContent = 'Sending request…';
      say('Sending the payment request to your phone…', 'info');

      callCreate(Object.assign({ kind: opts.kind, email: email, phone: phone, momo_network: network }, extra))
        .then(function (res) {
          var d = res.data || {};
          if (d.success && d.status === 'SUCCESS') return finish(email, d.reference);
          if (!d.reference) throw new Error(d.message || 'Could not start Mobile Money payment.');
          if (d.status === 'FAILED') {
            say(d.message || 'The Mobile Money request failed. Please try again or use another method.', 'err');
            busy = false; payBtn.disabled = false; payBtn.textContent = 'Send payment request';
            return;
          }
          say('Payment request sent to ' + phone + '. Approve it on your phone — keep this page open, we confirm it automatically. Reference: ' + d.reference, 'info');
          payBtn.textContent = 'Waiting for approval…';
          poll(d.reference, email);
        })
        .catch(function (err) {
          say(callableMessage(err), 'err');
          busy = false; payBtn.disabled = false; payBtn.textContent = 'Send payment request';
        });
    });

    return { say: say };
  }

  global.MEMesombPayment = { mount: mount };
})(window);
