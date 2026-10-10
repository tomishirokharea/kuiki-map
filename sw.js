/* =========================================================
   区域マップ：圏外でもアプリを開けるようにする仕組み（Service Worker）
   index.html と同じ場所（GitHub Pages の kuiki-map）に置きます。

   ・画面（index.html・config.js・schedule.js・言語のファイル）：まずインターネットから新しいものを取りに行き、
     つながらないとき（6秒待っても返事がないとき）だけ、前に保存した画面を使う
     → ふだんはいつも最新の版。圏外でも開ける
   ・地図の部品（Leaflet）と文字（Googleフォント）：一度取ったら、保存したものを使う
   ・国土地理院の淡色地図の画像：一度見たものは保存し、次からは保存したものを先に使う
     （保存するのは、会衆の区域のまわり＝全区域を囲む四角＋500m だけ。その四角は画面から知らせてもらう。
       旅行先など、四角の外の地図は保存しない。写真の地図も保存しない）
   ・サーバー（GAS）とのやりとり・版の確認には、手を出さない
   ・招待コード（?t=）の入ったURLは保存しない（URLの ? から後ろを消して保存する）
   ========================================================= */
const APP_CACHE = 'kuiki-app-v1';
const LIB_CACHE = 'kuiki-lib-v1';
const TILE_CACHE = 'kuiki-tiles-v1';   // 地図の画像（画面側の kangaeru.js も同じ入れ物に入れる。名前を変えるときは両方）
const AREA_CACHE = 'kuiki-tilearea-v1'; // 保存してよい場所（四角）
const KEEP = [APP_CACHE, LIB_CACHE, TILE_CACHE, AREA_CACHE];
const TILE_RE = /^\/xyz\/pale\/(\d+)\/(\d+)\/(\d+)\.png$/;
const AREA_KEY = 'https://kuiki.invalid/area';
let AREA = undefined; // [南, 西, 北, 東]。undefined＝まだ読んでいない、null＝区域がない
const NET_WAIT_MS = 6000;
// 圏外用に控える、アプリのファイル（新しくファイルを足したら、ここに名前を足す）
const APP_FILES = /\/(config|schedule|kantan|tsuzuki|kangaeru|i18n|i18n-es)\.js$/;

self.addEventListener('install', () => self.skipWaiting());

/* 画面から「保存してよい場所」を知らせてもらう（アプリを開いたときと、区域が変わったとき） */
self.addEventListener('message', e => {
  const d = e.data;
  if (!d || d.type !== 'kuiki-tile-area') return;
  const b = Array.isArray(d.box) && d.box.length === 4 && d.box.every(x => typeof x === 'number' && isFinite(x)) ? d.box : null;
  AREA = b;
  e.waitUntil(caches.open(AREA_CACHE).then(c => c.put(AREA_KEY, new Response(JSON.stringify(b)))).catch(() => {}));
});
async function loadArea() {
  if (AREA !== undefined) return AREA;
  try {
    const c = await caches.open(AREA_CACHE), r = await c.match(AREA_KEY);
    AREA = r ? await r.json() : null;
  } catch (err) { AREA = null; }
  return AREA;
}
const tileLat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const tileLng = (x, z) => x / Math.pow(2, z) * 360 - 180;
function tileInArea(z, x, y, a) { // その画像の範囲が、四角と重なるか
  if (!a) return false;
  const n = tileLat(y, z), s = tileLat(y + 1, z), w = tileLng(x, z), ea = tileLng(x + 1, z);
  return !(s > a[2] || n < a[0] || w > a[3] || ea < a[1]);
}

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
    const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname) || APP_FILES.test(u.pathname);
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

  if (u.hostname === 'cyberjapandata.gsi.go.jp') {
    const m = TILE_RE.exec(u.pathname);
    if (!m) return; // 写真の地図などは、そのまま通す
    e.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(req.url, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req); // つながらないときはここで失敗 → 画面側で透明になり、下のぼやけた地図が見える
      try {
        // 中身が見える取り方（cors）の画像だけ保存する（opaque は容量の数え方が大きくなるため保存しない）
        if (res && res.ok && res.type === 'cors' && tileInArea(+m[1], +m[2], +m[3], await loadArea())) cache.put(req.url, res.clone()).catch(() => {});
      } catch (err) { /* 保存できなくても表示はできる */ }
      return res;
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
