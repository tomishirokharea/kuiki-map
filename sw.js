/* =========================================================
   区域マップ：圏外でもアプリを開けるようにする仕組み（Service Worker）
   index.html と同じ場所（GitHub Pages の kuiki-map）に置きます。

   ・画面（index.html・config.js・schedule.js・言語のファイル）：まずインターネットから新しいものを取りに行き、
     つながらないとき（6秒待っても返事がないとき）だけ、前に保存した画面を使う
     → ふだんはいつも最新の版。圏外でも開ける
   ・地図の部品など（vendor に置いた Leaflet・pdf.js など）と文字（Googleフォント）：一度取ったら、保存したものを使う
     （vendor のファイル名には版の番号が入っているので、中身が変わるときは名前ごと変わる）
   ・国土地理院の地図の画像（淡色地図 pale・標準地図 std）：一度見たものは保存し、次からは保存したものを先に使う
     （保存するのは、会衆の区域のまわり＝全区域を囲む四角＋500m だけ。その四角は画面から知らせてもらう。
       旅行先など、四角の外の地図は保存しない。写真の地図も保存しない。画像のURLのタイル番号 z/x/y を緯度経度に直して、四角と比べる）
   ・サーバー（GAS）とのやりとり・版の確認には、手を出さない
   ・招待コード（?t=）の入ったURLは保存しない（URLの ? から後ろを消して保存する）
   ========================================================= */
const APP_CACHE = 'kuiki-app-v57'; // v57：2026.13.57（グループの中心からの距離を出さない・並べ方の説明はカーソルを置いたときだけ）／v56：2026.13.56（グループの中心・グループ奉仕の区域の近さ）／v55：2026.13.55（全体の集まりで使う区域・係の画面の「使い道」）／v54：2026.13.54（区域カードの「53-1」など枝番の番号がはみ出して折り返すのを修正）／v53：2026.13.53（グループ奉仕の区域を40枚まで）／v52：2026.13.52（人とグループ：変えたらすぐ保存・保存中に元にもどらない）／v51：2026.13.51（S-13の「グループ奉仕（名前）」でアプリに渡す・グループの区域は12枚まで）／v50：2026.13.50（雨の日も、期限が近い区域をいちばん上に）／v49：2026.13.49（区域をもらう一覧の前回返却した日に、紙の記録（S-13）の完了日も使う）／v48：2026.13.48（紙の記録（S-13）で貸出中の区域を、区域一覧・受け取りに反映）／v47：2026.13.46（マイマップ取り込み：道のすき間・名前のまちがい）／v46：2026.13.45（マイマップ取り込みの枝番の細い帯・区域の札の位置）／v45：2026.13.44（簡単モードの区域をもらう）／v44：2026.13.43（ひと言に天気）／v43：2026.13.42（アプリのファイルは毎回サーバーに確かめる）
const LIB_CACHE = 'kuiki-lib-v2'; // v2：地図の部品を CDN から vendor に移した（古い CDN の控えは消える）
const TILE_CACHE = 'kuiki-tiles-v1';   // 地図の画像（画面側の kangaeru.js・chizu.js も同じ入れ物に入れる。名前を変えるときは両方）
const AREA_CACHE = 'kuiki-tilearea-v1'; // 保存してよい場所（四角）
const KEEP = [APP_CACHE, LIB_CACHE, TILE_CACHE, AREA_CACHE];
const TILE_RE = /^\/xyz\/(pale|std)\/(\d+)\/(\d+)\/(\d+)\.png$/;   // 見やすい地図（pale）と、地名の多い地図（std）
const AREA_KEY = 'https://kuiki.invalid/area';
let AREA = undefined; // [南, 西, 北, 東]。undefined＝まだ読んでいない、null＝区域がない
const NET_WAIT_MS = 6000;
// 圏外用に控える、アプリのファイル（新しくファイルを足したら、ここに名前を足す）
const APP_FILES = /\/(config|schedule|kantan|tsuzuki|kangaeru|chizu|apt-import|apt-wizard|naoshi|kyohi|chui|kml-koushin|help|douga|kyoukai|torikomi|tokubetsu|nozoku|i18n|i18n-es|i18n-es-chizu|i18n-es-kyoukai|i18n-es-tokubetsu|guruchu|i18n-es-guruchu)\.js$/;

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

const isLib = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url);

  if (u.origin === self.location.origin) {
    if (u.searchParams.has('vcheck')) return; // 新しい版があるかの確認は、そのまま通す
    if (u.pathname.includes('/douga/')) return; // 使い方の動画と表紙は保存しない（圏外の端末に何十MBもためないため）
    if (u.pathname.includes('/vendor/')) { // 地図の部品など：一度取ったら保存したものを使う（圏外でも地図が出る）
      e.respondWith((async () => {
        const cache = await caches.open(LIB_CACHE);
        const hit = await cache.match(u.origin + u.pathname);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') cache.put(u.origin + u.pathname, res.clone()).catch(() => {});
        return res;
      })());
      return;
    }
    const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname) || APP_FILES.test(u.pathname);
    if (!isPage) return;
    const key = u.origin + u.pathname; // ? から後ろ（招待コードなど）は保存しない
    e.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      // ブラウザの控え（GitHub Pages は10分ほど控える）を使わず、毎回サーバーに確かめる（変わっていなければ短い返事で済む）。
      // 新しい index.html と古い schedule.js などがまざらないように（2026-10-22）
      const fresh = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
      const net = fetch(fresh).then(res => {
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
        if (res && res.ok && res.type === 'cors' && tileInArea(+m[2], +m[3], +m[4], await loadArea())) cache.put(req.url, res.clone()).catch(() => {});
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
