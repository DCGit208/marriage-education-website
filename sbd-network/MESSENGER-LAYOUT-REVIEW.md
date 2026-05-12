# SBD Messenger — iOS Layout Review Package
**For consultant examination — April 28, 2026**

---

## THE TWO ACTIVE BUGS

### Bug A — Chat header disappears when tapping the message input
**Both Safari and PWA.** When the user taps `#messageInput` to type, the chat header (`#chatHeader` — containing the back button and contact name) scrolls off the top of the screen.

### Bug B — Bottom navigation wrong in PWA / shows inside chat
**Safari:** Bottom nav is visible while inside a chat (it should be completely hidden).  
**PWA (home screen):** Bottom nav appears shorter than expected and overlaps the chat input bar instead of being hidden.

---

## FILE 1 — `src/pages/dm.html` (template source)
> This is the template. `node build.js` compiles it to `public/dm.html`.  
> The inline `<style>` block is the primary layout authority.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <!-- NOTE: interactive-widget=resizes-content was REMOVED — it caused iOS to resize
       the layout viewport on keyboard open, which distorted the entire layout -->

  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/dm.css?v=77">
  <link rel="stylesheet" href="/css/bottom-nav.css?v=77">

  <style>
    *, *::before, *::after { box-sizing: border-box; }

    /* When chat is open — NO position:fixed on body.
       position:fixed on body makes it the iOS containing block for fixed children,
       causing #chatView to shift with the body when keyboard opens.
       overflow:hidden alone stops background scroll. */
    body.in-chat {
      overflow: hidden;
      height: 100%;
    }
    body.in-chat .app-header { display: none !important; }
    body.in-chat .bottom-nav  { display: none !important; }
    body.in-chat .dm-main    { display: none !important; }

    /* #chatView: iOS-safe 4-edge anchor, NO height property.
       height is set dynamically by JS via visualViewport.height */
    #chatView {
      display: none;            /* JS sets to 'flex' when chat opens */
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      flex-direction: column;
      overflow: hidden;
      z-index: 9999;
      background: #000;
    }

    /* Header: fixed-height flex child, flex-shrink:0 — cannot collapse */
    #chatHeader {
      height: calc(56px + env(safe-area-inset-top, 0px));
      padding-top: env(safe-area-inset-top, 0px);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      padding-left: 12px;
      padding-right: 12px;
      gap: 12px;
      background: #111;
      color: #fff;
    }
    #chatHeader button {
      background: none; border: none; color: #fff;
      font-size: 1.3rem; padding: 8px; cursor: pointer;
      flex-shrink: 0; min-width: 40px; min-height: 40px;
    }
    #chatTitle {
      flex: 1; font-size: 1rem; font-weight: 600; color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Messages: only scrollable region */
    #messagesContainer {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Input bar: fixed height, safe area aware */
    #chatInputBar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      height: 60px;
      padding: 8px;
      padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
      background: #111;
      border-top: 1px solid #333;
    }

    /* font-size: 16px prevents iOS auto-zoom on input focus */
    #messageInput, textarea, input[type="text"] { font-size: 16px; }

    #messageInput {
      flex: 1; min-width: 0; height: 40px;
      background: rgba(255,255,255,0.08);
      border: 1px solid #444; border-radius: 20px;
      color: #fff; padding: 0 14px; outline: none; font-family: inherit;
    }
    #messageInput::placeholder { color: rgba(255,255,255,0.4); }
    #messageInput:focus { border-color: #00bcd4; }

    #sendBtn {
      background: #00bcd4; border: none; border-radius: 20px;
      color: #000; font-size: 0.85rem; font-weight: 700;
      padding: 0 16px; height: 40px; cursor: pointer;
      flex-shrink: 0; font-family: inherit;
    }
    #sendBtn:disabled { opacity: 0.5; cursor: not-allowed; }

    #attachBtn, #micBtn {
      background: none; border: none; color: rgba(255,255,255,0.7);
      font-size: 1.3rem; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; padding: 0; border-radius: 50%;
    }
    #attachBtn:active, #micBtn:active { background: rgba(255,255,255,0.1); }

    #inboxView.hidden { display: none; }
    .message, .bubble-text { word-break: break-word; overflow-x: hidden; }
  </style>
</head>
<body data-page="" class="dm-page bottom-nav-page has-header">

  <!-- App header (inbox view only) -->
  <header class="app-header">
    <div class="header-left">
      <button id="backBtn" class="btn btn-icon">←</button>
      <span class="page-title" id="dmPageTitle">Messages</span>
    </div>
    <div class="header-right">
      <button id="newDmBtn" class="btn btn-icon" style="font-size:1.3rem;">✏️</button>
      <button class="notif-bell-btn btn btn-icon">🔔<span class="notif-badge" style="display:none;"></span></button>
    </div>
  </header>

  <!-- Inbox — inside dm-main -->
  <main class="dm-main">
    <div id="inboxView" class="dm-view">
      <div id="conversationList" class="conversation-list"></div>
    </div>
  </main>

  <!-- CHAT VIEW — direct child of <body>, NOT inside dm-main -->
  <div id="chatView">
    <div id="chatHeader">
      <button id="chatBackBtn">←</button>
      <div id="chatTitle">Chat</div>
      <button class="notif-bell-btn">🔔<span class="notif-badge" style="display:none;"></span></button>
    </div>

    <div id="messagesContainer"></div>

    <div id="replyBanner" class="reply-banner" style="display:none;">
      <span id="replyBannerText"></span>
      <button id="replyCancelBtn">✕</button>
    </div>
    <div id="editBanner" class="edit-banner" style="display:none;">
      <span>✏️ Editing message</span>
      <button id="editCancelBtn">✕</button>
    </div>

    <div id="chatInputBar">
      <button id="attachBtn" type="button">📎</button>
      <input id="attachInput" type="file" accept="image/*,video/*" style="display:none;">
      <button id="micBtn" type="button">🎤</button>
      <input type="text" id="messageInput" placeholder="Type message..." maxlength="2000" autocomplete="off">
      <button id="sendBtn" type="button">Send</button>
    </div>
  </div>

  <!-- Bottom Navigation -->
  <nav class="bottom-nav">
    <a href="/dashboard.html" class="bn-tab"><span class="bn-icon">⌂</span><span class="bn-label">Home</span></a>
    <a href="/learn.html"     class="bn-tab"><span class="bn-icon">◎</span><span class="bn-label">Learn</span></a>
    <a href="/boards.html"    class="bn-tab"><span class="bn-icon">◫</span><span class="bn-label">Boards</span></a>
    <a href="/shop.html"      class="bn-tab"><span class="bn-icon">◇</span><span class="bn-label">Shop</span></a>
    <a href="/profile.html"   class="bn-tab"><span class="bn-icon">◯</span><span class="bn-label">You</span></a>
  </nav>

</body>
</html>
```

---

## FILE 2 — `public/js/dm.js` (layout-critical section, lines 63–118)

```javascript
// Cache bottom nav once
const _bottomNav = document.querySelector('.bottom-nav');

function renderChatUI() {
  const isChat = ChatState.mode !== 'inbox';
  chatView.style.display = isChat ? 'flex' : 'none';
  inboxView.classList.toggle('hidden', isChat);
  document.body.classList.toggle('in-chat', isChat);

  // Directly control bottom nav — CSS alone is not enough on iOS PWA
  if (_bottomNav) _bottomNav.style.display = isChat ? 'none' : '';

  if (isChat) {
    _syncChatViewport(); // size chatView to actual visible area
  } else {
    chatView.style.height = ''; // restore CSS control
  }
}

// WhatsApp-style viewport sync.
// When keyboard opens, visualViewport.height = height above keyboard.
// We set chatView height to that value so the header stays at top
// and input bar stays at bottom.
function _syncChatViewport() {
  if (!chatView || ChatState.mode === 'inbox') return;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  chatView.style.height = h + 'px';
}

(function _initChatViewport() {
  if (!window.visualViewport) return;
  window.visualViewport.addEventListener('resize', _syncChatViewport);
}());
```

---

## FILE 3 — `public/css/dm.css` (layout-critical section, lines 1–50)

```css
*, *::before, *::after { box-sizing: border-box !important; }
html, body { overflow-x: hidden; touch-action: manipulation; }

/* Inbox container: fixed between app-header and bottom nav */
.dm-main {
  position: fixed;
  top: calc(60px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dm-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}

/* body.in-chat — NO position:fixed on body.
   position:fixed makes body the iOS containing block for fixed children.
   That causes #chatView to shift when iOS moves the body on keyboard open.
   overflow:hidden alone is sufficient to stop background scroll. */
body.in-chat { overflow: hidden; height: 100%; }
body.in-chat .app-header { display: none !important; }
body.in-chat .bottom-nav  { display: none !important; }
body.in-chat .dm-main     { display: none !important; }
```

---

## FILE 4 — `public/css/bottom-nav.css` (layout-critical section, lines 1–120)

```css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(10, 10, 10, 0.85);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border-top: 1px solid rgba(198, 163, 132, 0.1);
  display: flex;
  align-items: stretch;
  z-index: 900;
  transform: translateZ(0);
  /* NOTE: will-change: transform was REMOVED — caused PWA compositor
     to render the nav at wrong size vs Safari */
  transition: transform 0.25s ease;
}

.bn-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 0 4px;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.15s;
}

.bn-tab.active { color: var(--accent-primary); }

.bn-icon {
  font-size: 1.3rem;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  /* NOTE: was font-family:serif — caused different icon metrics in PWA vs Safari */
}

.bn-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

/* Inbox: dm-main stops above the bottom nav */
.bottom-nav-page .dm-main {
  bottom: calc(60px + env(safe-area-inset-bottom));
}

/* Chat: dm-main is hidden entirely, so this rule is not active during chat */
.dm-page.in-chat .dm-main {
  bottom: 0;
}
```

---

## KNOWN ISSUES AND WHAT HAS BEEN TRIED

### Issue: Chat header disappears on keyboard open

**Root cause:** iOS Safari shifts the visual viewport upward when a text input gains focus. `position:fixed` elements are supposed to stay in place, but if any ancestor has `position:fixed` OR `overflow:hidden`, iOS re-parents fixed children to that ancestor instead of the viewport. Every solution attempted so far has run into one of these two iOS constraints.

**Approaches tried (all failed):**
1. `height: 100dvh` on `#chatView` — `dvh` not supported on iOS < 15.4
2. `height: -webkit-fill-available` — recalculates on keyboard open
3. `body { position:fixed }` — made body the containing block, header shifted with keyboard
4. `interactive-widget=resizes-content` in viewport meta — forced layout viewport resize
5. `visualViewport.resize` listener setting `chatView.style.height` — still active, not yet confirmed working on device
6. `touchend` + `e.preventDefault()` on input — was added then replaced

**Current approach (deployed, unconfirmed):**
- `#chatView` uses `top:0; left:0; right:0; bottom:0` (no height)
- `visualViewport.resize` fires → sets `chatView.style.height = visualViewport.height + 'px'`
- This is the WhatsApp/Telegram technique

### Issue: Bottom nav visible in chat / wrong size in PWA

**Root cause:** CSS `body.in-chat .bottom-nav { display:none }` is not always respected in PWA standalone mode.

**Current approach (deployed):**
- `renderChatUI()` directly sets `_bottomNav.style.display = 'none'` via JS inline style
- Inline styles cannot be overridden by any CSS
- `will-change: transform` removed from `.bottom-nav` (caused PWA compositor size mismatch)

---

## WHAT A CONSULTANT SHOULD INVESTIGATE

1. **Is `visualViewport.height` being correctly read on iOS Safari + iOS PWA?**  
   Test: add `console.log(window.visualViewport.height)` on the `resize` event. Does it shrink when keyboard opens?

2. **Is `_syncChatViewport()` actually being called when keyboard opens?**  
   The `visualViewport.resize` listener is attached once at page load. If the chat view was not yet open at that time, no problem — but confirm the event fires during chat.

3. **Does `_bottomNav.style.display = 'none'` take effect before the first render frame?**  
   If not, there will be a flash of the nav bar when chat opens. The fix is to call `renderChatUI()` synchronously before paint.

4. **Is there a `visualViewport.offsetTop` shift that also needs compensation?**  
   On iOS, `visualViewport.offsetTop` can be non-zero when the page scrolls. The `chatView` top anchor may need `top: visualViewport.offsetTop + 'px'` in addition to the height fix.

---

## DEPLOYMENT INFO
- **Live URL:** https://sbd-network.web.app
- **Build command:** `cd sbd-network && node build.js && firebase deploy --only hosting`
- **Current deployed version:** v1777386825878
- **Source template:** `src/pages/dm.html` → compiled to `public/dm.html` by `build.js`
- **JS/CSS:** `public/js/dm.js`, `public/css/dm.css`, `public/css/bottom-nav.css` (edited directly, not compiled)
