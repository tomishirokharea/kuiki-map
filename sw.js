/* =========================================================
   区域マップ：圏外でもアプリを開けるようにする仕組み（Service Worker）
   index.html と同じ場所（GitHub Pages の kuiki-map）に置きます。

   ・画面（index.html・config.js）：まずインターネットから新しいものを取りに行き、
     つながらないとき（6秒待っても返事がないとき）だけ、前に保存した画面を使う
     → ふだんはいつも最新の版。圏外でも開ける
   ・地図の部品（Leaflet）と文字（Googleフォント）：一度取ったら、保存したものを使う
   ・サーバー（GAS）とのやりとり・地図の画像・版の確認には、手を出さない
   ・招待コード（?t=）の入ったURLは保存しない（URLの ? から後ろを消して保存する）
   ========================================================= */
const APP_CACHE = 'kuiki-app-v1';
const LIB_CACHE = 'kuiki-lib-v1';
const KEEP = [APP_CACHE, LIB_CACHE];
const NET_WAIT_MS = 6000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kuiki-') && !KEEP.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isLib = u =>
  (u.hostname === 'cdnjs.cloudflare.com' && u.pathname.includes('/leaflet/')) ||
  u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url);

  if (u.origin === self.location.origin) {
    if (u.searchParams.has('vcheck')) return; // 新しい版があるかの確認は、そのまま通す
    const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname) || u.pathname.endsWith('/config.js');
    if (!isPage) return;
    const key = u.origin + u.pathname; // ? から後ろ（招待コードなど）は保存しない
    e.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const net = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
        return res;
      });
      try {
        return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NET_WAIT_MS))]);
      } catch (err) {
        const scopeUrl = new URL('./', self.registration.scope).href;
        const hit = (await cache.match(key)) ||
          (req.mode === 'navigate' ? (await cache.match(scopeUrl)) || (await cache.match(scopeUrl + 'index.html')) : null);
        if (hit) return hit;
        return net; // 保存したものがなければ、インターネットの返事を待つ
      }
    })());
    return;
  }

  if (isLib(u)) {
    e.respondWith((async () => {
      const cache = await caches.open(LIB_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
  }
});
