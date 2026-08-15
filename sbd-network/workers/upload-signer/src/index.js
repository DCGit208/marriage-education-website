/**
 * sbd-upload-signer — Cloudflare Worker
 *
 * Routes:
 *   POST /upload        — Upload file directly to R2 via binding
 *   POST /register-push — Subscribe FCM token to topic sbd-all (FCM V1 + service account)
 *   POST /notify        — Send FCM V1 push to topic sbd-all
 *
 * All routes require a valid Firebase ID token in Authorization header.
 *
 * Required Worker secrets (set with: npx wrangler secret put <NAME>):
 *   SA_CLIENT_EMAIL  — service_account.client_email from the downloaded JSON
 *   SA_PRIVATE_KEY   — service_account.private_key from the downloaded JSON
 */

import { parseFirestoreMap, userCanReceiveBoardNotification } from './notification-access.js';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/3gpp',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-caf',
]);
const ALLOWED_FOLDERS = new Set(['ugc-photos', 'ugc-videos', 'dm_attachments', 'dm_videos', 'dm_audio', 'course-covers']);

const FIREBASE_PROJECT_ID = 'marriage-education';
const PUBLIC_APP_ORIGIN = 'https://sbd-network.web.app';

// ── Service-account JWT → Google OAuth2 access token ─────────────
async function getAccessToken(env) {
  const email = env.SA_CLIENT_EMAIL;
  const rawKey = env.SA_PRIVATE_KEY;
  if (!email || !rawKey) return null;

  const pemKey = rawKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));
  const signingInput = `${header}.${payload}`;

  // PEM → DER
  const pemBody = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0)).buffer;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64urlBuf(sigBuf)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return data.access_token || null;
}

function b64url(str) {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlBuf(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Main handler ─────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const trustedOrigin =
      allowedOrigins.includes(origin) ||
      /^https:\/\/([a-z0-9-]+\.(web\.app|firebaseapp\.com)|marriageducation\.com|www\.marriageducation\.com)$/i.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    const corsOrigin = trustedOrigin && origin ? origin : (allowedOrigins[0] || '*');
    const corsHeaders = {
      'Access-Control-Allow-Origin':  corsOrigin,
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Folder, X-Filename',
      'Access-Control-Max-Age':       '86400',
    };
    const respond = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST')    return respond({ error: 'Method not allowed' }, 405);

    // ── Verify Firebase ID token ─────────────────────────────────
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return respond({ error: 'Unauthorized' }, 401);
    const idToken = authHeader.slice(7);

    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyData.users?.[0]) return respond({ error: 'Unauthorized' }, 401);

    const { pathname } = new URL(request.url);

    // ── POST /register-push ──────────────────────────────────────
    // Token is already saved to Firestore by the client (_initPush).
    // /notify reads tokens directly from Firestore — no topic subscription needed.
    if (pathname === '/register-push') {
      return respond({ ok: true });
    }

    // ── POST /notify ─────────────────────────────────────────────
    // Reads FCM tokens scoped to the board's group from Firestore, then
    // sends each member a direct FCM V1 message.
    if (pathname === '/notify') {
      const accessToken = await getAccessToken(env);
      if (!accessToken) return respond({ error: 'Push not configured' }, 503);

      const { title, body, boardId, postId, commentId, type, url, groupId: bodyGroupId } = await request.json().catch(() => ({}));
      if (!title || !body) return respond({ error: 'Missing title or body' }, 400);

      let groupId = bodyGroupId || null;

      // ── Resolve board metadata for access filtering ──
      let boardMeta = { groupId: null, requiredTier: 'free' };
      if (boardId) {
        const boardRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/boards/${boardId}?mask.fieldPaths=groupId&mask.fieldPaths=requiredTier`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const boardData = await boardRes.json().catch(() => ({}));
        boardMeta = {
          groupId: boardData.fields?.groupId?.stringValue || groupId || null,
          requiredTier: boardData.fields?.requiredTier?.stringValue || 'free',
        };
        if (!groupId) groupId = boardMeta.groupId;
      }

      const USER_FIELD_MASKS = [
        'fcmToken', 'tier', 'groups', 'role', 'subscription', 'progress', 'access', 'staffAccess',
      ];
      const selectFields = USER_FIELD_MASKS.map(f => ({ fieldPath: f }));

      // ── Fetch FCM tokens — group members only; never broadcast to all users ──
      let tokens = [];
      if (groupId) {
        const queryRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              structuredQuery: {
                from: [{ collectionId: 'users' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'groups' },
                    op: 'ARRAY_CONTAINS',
                    value: { stringValue: groupId },
                  },
                },
                select: { fields: selectFields },
              },
            }),
          }
        );
        const queryData = await queryRes.json().catch(() => []);
        tokens = (Array.isArray(queryData) ? queryData : [])
          .map(row => {
            const userData = parseFirestoreMap(row.document?.fields || {});
            const token = userData.fcmToken;
            if (!token || token.length <= 10) return null;
            if (!userCanReceiveBoardNotification(userData, boardId, boardMeta)) return null;
            return token;
          })
          .filter(Boolean);
      }

      if (tokens.length === 0) return respond({ ok: true, sent: 0 });

      // ── Build FCM message template ────────────────────────────
      const makeMsg = token => ({
        message: {
          token,
          notification: { title, body },
          data: {
            title,
            body,
            boardId: boardId || '',
            postId:  postId  || '',
            commentId: commentId || '',
            type: type || '',
            url:     url     || '/dashboard.html',
          },
          webpush: {
            notification: {
              icon:     `${PUBLIC_APP_ORIGIN}/assets/icons/icon-192.png`,
              badge:    `${PUBLIC_APP_ORIGIN}/assets/icons/icon-72.png`,
              tag:      'sbd-notification',
              renotify: true,
            },
            fcm_options: {
              link: `${PUBLIC_APP_ORIGIN}${url || '/dashboard.html'}`,
            },
          },
          android: { priority: 'high' },
        },
      });

      // ── Send to each token (parallel, ignore individual failures)
      const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;
      const results = await Promise.allSettled(tokens.map(token =>
        fetch(fcmEndpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(makeMsg(token)),
        }).then(r => r.json())
      ));

      const sent   = results.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
      const failed = results.length - sent;
      return respond({ ok: true, sent, failed });
    }

    // ── POST /notify-dm ──────────────────────────────────────────
    // Sends a push notification directly to a single FCM token (DM recipient).
    if (pathname === '/notify-dm') {
      let dmBody;
      try {
        dmBody = await request.json();
      } catch (e) {
        return respond({ error: 'Invalid JSON' }, 400);
      }

      const {
        senderId,
        recipientId,
        message,
        fcmToken,
        title,
        body,
        url,
        convId,
      } = dmBody || {};

      if (!senderId || !recipientId || !message) {
        return respond({ error: 'Missing senderId, recipientId, or message' }, 400);
      }

      try {
        const accessToken = await getAccessToken(env);
        if (!accessToken) {
          console.error('DM PUSH ERROR:', 'Push not configured');
          return respond({ success: true, pushSent: false, reason: 'push_not_configured' });
        }

        let token = fcmToken || null;
        if (!token) {
          const userRes = await fetch(
            `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${recipientId}?mask.fieldPaths=fcmToken`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          const userData = await userRes.json().catch(() => ({}));
          token = userData.fields?.fcmToken?.stringValue || null;
        }

        if (!token) {
          return respond({ success: true, pushSent: false, reason: 'missing_recipient_token' });
        }

        const pushTitle = title || '💬 New message';
        const pushBody = (body || String(message)).slice(0, 100);
        const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;
        const msg = {
          message: {
            token,
            notification: { title: pushTitle, body: pushBody },
            data: {
              title: pushTitle,
              body: pushBody,
              url: url || '/communication-v2/',
              convId: convId || '',
              messageId: dmBody.messageId || '',
              senderId: String(senderId),
              recipientId: String(recipientId),
              message: String(message).slice(0, 300),
            },
            webpush: {
              notification: {
                icon: `${PUBLIC_APP_ORIGIN}/assets/icons/icon-192.png`,
                badge: `${PUBLIC_APP_ORIGIN}/assets/icons/icon-72.png`,
                tag: `dm-${convId || 'msg'}`,
                renotify: true,
              },
              fcm_options: {
                link: `${PUBLIC_APP_ORIGIN}${url || '/communication-v2/'}`,
              },
            },
            android: { priority: 'high' },
          },
        };

        try {
          const r = await fetch(fcmEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(msg),
          });
          const data = await r.json().catch(() => ({}));
          if (data.error) {
            console.error('DM PUSH ERROR:', data.error);
            return respond({ success: true, pushSent: false });
          }
          return respond({ success: true, pushSent: true });
        } catch (error) {
          console.error('DM PUSH ERROR:', error);
          return respond({ success: true, pushSent: false });
        }
      } catch (error) {
        console.error('DM PUSH ERROR:', error);
        return respond({ success: true, pushSent: false });
      }
    }

    // ── POST /collections ─────────────────────────────────────────
    // CRUD for user collections stored as JSON in R2.
    // Body: { action: 'get'|'create'|'update'|'delete', collection?: {...} }
    if (pathname === '/collections') {
      const uid = verifyData.users[0].localId;
      const r2Key = `collections/${uid}.json`;

      // Helper: read current collections array from R2
      async function readCols() {
        const obj = await env.BUCKET.get(r2Key);
        if (!obj) return [];
        try { return JSON.parse(await obj.text()); } catch { return []; }
      }
      // Helper: write collections array back to R2
      async function writeCols(cols) {
        await env.BUCKET.put(r2Key, JSON.stringify(cols), {
          httpMetadata: { contentType: 'application/json' },
        });
      }

      let body;
      try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON' }, 400); }
      const { action, collection } = body || {};

      if (action === 'get') {
        const cols = await readCols();
        return respond({ collections: cols });
      }

      if (action === 'create') {
        if (!collection?.name) return respond({ error: 'name required' }, 400);
        const cols = await readCols();
        const newCol = {
          id: crypto.randomUUID(),
          name: collection.name,
          postIds: collection.postIds || [],
          createdAt: new Date().toISOString(),
        };
        cols.unshift(newCol);
        await writeCols(cols);
        return respond({ collection: newCol });
      }

      if (action === 'update') {
        if (!collection?.id) return respond({ error: 'id required' }, 400);
        const cols = await readCols();
        const idx = cols.findIndex(c => c.id === collection.id);
        if (idx === -1) return respond({ error: 'Not found' }, 404);
        cols[idx] = { ...cols[idx], ...collection };
        await writeCols(cols);
        return respond({ collection: cols[idx] });
      }

      if (action === 'delete') {
        if (!collection?.id) return respond({ error: 'id required' }, 400);
        const cols = (await readCols()).filter(c => c.id !== collection.id);
        await writeCols(cols);
        return respond({ ok: true });
      }

      return respond({ error: 'Unknown action' }, 400);
    }

    // ── POST /unfurl ──────────────────────────────────────────────
    // Fetch a URL and return its Open Graph metadata.
    // Body: { url: string }
    if (pathname === '/unfurl') {
      let url;
      try { ({ url } = await request.json()); } catch (e) { url = null; }
      if (!url || !/^https?:\/\//i.test(url)) return respond({ error: 'Invalid URL' }, 400);
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'SBDBot/1.0 (link preview fetcher)' },
          redirect: 'follow',
        });
        if (!res.ok) return respond({ error: 'Fetch failed', status: res.status }, 502);
        const html = await res.text();

        const getOg = (prop) => {
          const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
            || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
          return m ? m[1] : '';
        };
        const getTitle = () => {
          const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          return m ? m[1].trim() : '';
        };

        const title = getOg('title') || getTitle();
        const description = getOg('description');
        const image = getOg('image');

        return respond({ url, title, description, image });
      } catch (err) {
        return respond({ error: 'Unfurl failed: ' + String(err) }, 502);
      }
    }

    // ── POST /delete-user ─────────────────────────────────────────
    // Full user wipe: Firebase Auth account + R2 media + Firestore docs.
    // Caller must be an admin. Body: { targetUid: string }
    if (pathname === '/delete-user') {
      const callerUid = verifyData.users[0].localId;

      // 1. Confirm caller is admin in Firestore
      const accessToken = await getAccessToken(env);
      if (!accessToken) return respond({ error: 'Service account not configured' }, 503);

      const callerDocRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${callerUid}?mask.fieldPaths=role`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const callerDoc = await callerDocRes.json().catch(() => ({}));
      const callerRole = callerDoc.fields?.role?.stringValue || 'member';
      const { targetUid } = await request.json().catch(() => ({}));
      if (!targetUid) return respond({ error: 'Missing targetUid' }, 400);

      const isSelfDelete = targetUid === callerUid;
      // Admins can delete others; anyone can delete themselves; admins cannot delete themselves via this endpoint
      if (!isSelfDelete && callerRole !== 'admin') return respond({ error: 'Admin only' }, 403);
      if (isSelfDelete && callerRole === 'admin') return respond({ error: 'Admins cannot self-delete — demote first or use the Firebase Console' }, 403);

      // 2. Fetch target user doc (for photoUrl)
      const targetDocRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${targetUid}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const targetDoc = await targetDocRes.json().catch(() => ({}));
      const photoUrl = targetDoc.fields?.photoUrl?.stringValue || null;

      // 3. Fetch all posts by this user to collect their R2 media URLs
      const postsRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'posts' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'authorId' },
                  op: 'EQUAL',
                  value: { stringValue: targetUid },
                },
              },
              select: { fields: [{ fieldPath: 'imageUrls' }, { fieldPath: 'videoUrl' }, { fieldPath: 'imageUrl' }] },
            },
          }),
        }
      );
      const postsData = await postsRes.json().catch(() => []);
      const postIds = [];
      const mediaUrls = [];
      if (Array.isArray(postsData)) {
        for (const row of postsData) {
          if (!row.document) continue;
          const docName = row.document.name;
          postIds.push(docName.split('/').pop());
          const f = row.document.fields || {};
          // imageUrls is an array field
          const imgs = f.imageUrls?.arrayValue?.values || [];
          imgs.forEach(v => { if (v.stringValue) mediaUrls.push(v.stringValue); });
          if (f.videoUrl?.stringValue) mediaUrls.push(f.videoUrl.stringValue);
          if (f.imageUrl?.stringValue) mediaUrls.push(f.imageUrl.stringValue);
        }
      }
      if (photoUrl) mediaUrls.push(photoUrl);

      // 4. Delete R2 objects
      const R2_BASE = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
      const r2Deletes = mediaUrls
        .filter(u => u && u.startsWith(R2_BASE + '/'))
        .map(u => u.slice(R2_BASE.length + 1))
        .map(key => env.BUCKET.delete(key).catch(() => {}));
      await Promise.allSettled(r2Deletes);

      // 5. Delete Firebase Auth account via Identity Toolkit Admin REST API
      const authDeleteRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/accounts/${targetUid}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const authDeleteOk = authDeleteRes.ok;

      // 6. Delete Firestore: posts + user doc via REST batch (Write)
      const writes = [
        // Delete user doc
        { delete: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${targetUid}` },
        // Delete posts
        ...postIds.map(pid => ({
          delete: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts/${pid}`,
        })),
      ];
      await fetch(
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:batchWrite`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ writes }),
        }
      );

      return respond({
        ok: true,
        authDeleted: authDeleteOk,
        r2Deleted: r2Deletes.length,
        postsDeleted: postIds.length,
      });
    }

    // ── POST /delete ─────────────────────────────────────────────
    // Body: { url: 'https://pub-.../dm_videos/...' }
    // Deletes the R2 object identified by the public URL.
    if (pathname === '/delete') {
      const { url } = await request.json().catch(() => ({}));
      if (!url || typeof url !== 'string') return respond({ error: 'Missing url' }, 400);
      const R2_BASE = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
      if (!url.startsWith(R2_BASE + '/')) return respond({ error: 'URL not in this bucket' }, 400);
      const key = url.slice(R2_BASE.length + 1); // strip base + leading slash
      // Only allow deletion within permitted folders
      const topFolder = key.split('/')[0];
      if (!ALLOWED_FOLDERS.has(topFolder)) return respond({ error: 'Forbidden folder' }, 403);
      await env.BUCKET.delete(key);
      return respond({ ok: true });
    }

    // ── POST /upload (default) ───────────────────────────────────
    const folder      = request.headers.get('X-Folder') || '';
    const filename    = request.headers.get('X-Filename') || '';
    const contentType = request.headers.get('Content-Type') || '';

    if (!ALLOWED_FOLDERS.has(folder))        return respond({ error: 'Invalid folder' }, 400);
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return respond({ error: 'Content type not allowed' }, 400);
    if (!filename)                           return respond({ error: 'Missing X-Filename header' }, 400);

    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const key          = `${folder}/${safeFilename}`;

    await env.BUCKET.put(key, request.body, { httpMetadata: { contentType } });

    return respond({ publicUrl: `${env.R2_PUBLIC_URL}/${key}` });
  },
};

