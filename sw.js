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
const APP_CACHE = 'kuiki-app-v149'; // v149：2026.13.149（向きの確かめ（v148の北ボタンの長押し）を取りのぞく）
// v148：2026.13.148（「北」ボタンを長く押すと、向きの確かめの数字を出す・一時的）
// v147：2026.13.147（iPhoneで向きが90°ずれるのを直す）
// v146：2026.13.146（現在地ボタンをもう一度押すと向きに合わせる）
// v142：2026.13.142（記録のない家が「引き継ぎを待っている家」に出ないように・リセットで再訪問の印も消す・残った印の掃除）
// v141：2026.13.141（全体の集まりの予定：司会者の名前・監督と司会者が入れる・くり返し）
// v140：2026.13.140（伝道者の区域カードの画面にも「個人の区域」の見出しを付けた）
// v139：2026.13.139（係の画面の並びを見直した：状況は上のタブ・区域の決まりは設定・集まりの予定はホーム・家の印）
// v137：2026.13.137（区域番号の札を、家の印・建物の名前と重ならない所へずらす）
// v136：2026.13.136（外国語の印を部屋の名前の前に・建物の印から外す・地図の印の重なり）
// v135：2026.13.135（外国語の印の色を見やすく）
// v134：2026.13.134（家の編集の「この家の印」に「？」と一言）
// v133：2026.13.133（家の編集でアパートに変えるときも、エレベーターと建物のメモ）
// v132：2026.13.132（家の種別「外国語」と言語・区域係の外国語の家の一覧）
// v131：2026.13.131（地図で区域をタップして、くわしい情報を見て受け取る・係に頼む）
const LIB_CACHE = 'kuiki-lib-v2'; // v2：地図の部品を CDN から vendor に移した（古い CDN の控えは消える）
const TILE_CACHE = 'kuiki-tiles-v1';   // 地図の画像（画面側の kangaeru.js・chizu.js も同じ入れ物に入れる。名前を変えるときは両方）
const AREA_CACHE = 'kuiki-tilearea-v1'; // 保存してよい場所（四角）
const KEEP = [APP_CACHE, LIB_CACHE, TILE_CACHE, AREA_CACHE];
const TILE_RE = /^\/xyz\/(pale|std)\/(\d+)\/(\d+)\/(\d+)\.png$/;   // 見やすい地図（pale）と、地名の多い地図（std）
const AREA_KEY = 'https://kuiki.invalid/area';
let AREA = undefined; // [南, 西, 北, 東]。undefined＝まだ読んでいない、null＝区域がない
const NET_WAIT_MS = 6000;
// 圏外用に控える、アプリのファイル（新しくファイルを足したら、ここに名前を足す）
const APP_NAMES = ['config', 'schedule', 'kantan', 'tsuzuki', 'kangaeru', 'chizu', 'apt-import', 'apt-wizard', 'apt-heya', 'naoshi', 'kyohi', 'chui', 'kml-koushin', 'help', 'douga', 'kyoukai', 'torikomi', 'tokubetsu', 'nozoku', 'i18n', 'i18n-es', 'i18n-es-chizu', 'i18n-es-kyoukai', 'i18n-es-tokubetsu', 'guruchu', 'i18n-es-guruchu', 'meibo', 'i18n-es-meibo', 'i18n-es-shikai', 'i18n-es-tenken', 'i18n-es-kaizen', 'i18n-es-osusume', 'houkoku', 'iken', 'i18n-es-houkoku', 'joukyou-graph', 'i18n-es-joukyou', 'i18n-es-shinai', 'app', 'chizu-okuru', 'heya-wake', 'app-head', 'kimari', 'gaikokugo', 'tochi-kugiri'];
const APP_FILES = new RegExp('/(' + APP_NAMES.join('|') + ')\\.js$');

/* 新しい版を入れるとき（install）：画面のファイルを先に取って、新しい控えに入れておく（M2・2026.13.102）。
   そろわなかったとき（電波がない・途中で切れた）は新しい控えを捨て、古い控えは activate でも消さない（新しい版に切りかわった直後に圏外でも開けるように） */
const scopeOf = () => new URL('./', self.registration.scope).href;
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    try {
      const c = await caches.open(APP_CACHE), base = scopeOf();
      await c.addAll([base, base + 'index.html'].concat(APP_NAMES.map(n => base + n + '.js')).map(u => new Request(u, { cache: 'no-cache' })));
      // 版がそろっているか（配信の途中で、新しい index.html と古い app.js がまざっていないか）を確かめる。そろわなければ使わない（監査5 M-3）
      const iv = ((await (await c.match(base + 'index.html')).text()).match(/name="app-version" content="([^"]+)"/) || [])[1];
      const jv = ((await (await c.match(base + 'app.js')).text()).match(/APP_JS_VER = '([^']+)'/) || [])[1];
      // sw.js の版は APP_CACHE の番号（kuiki-app-v104 → 2026.13.104 の 104）。版上げのたびに必ず上げる番号なので、別の番号は置かない（上げ忘れで取りこみが止まらないように）
      if (!iv || iv !== jv || iv.split('.').pop() !== APP_CACHE.slice(11)) throw new Error('version mismatch ' + iv + ' / ' + jv + ' / ' + APP_CACHE);
    } catch (err) {
      // そろわない・取れない：新しい控えを捨て、install を失敗にする。前の版の Service Worker と控えがそのまま使われ、
      // 次に更新を確かめたとき（開き直し・版の確認）に、もう一度入れ直す（監査6 M2）
      try { await caches.delete(APP_CACHE); } catch (x) { /* */ }
      throw err;
    }
  })());
});

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
    // 新しい控えに index.html が入っているときだけ、古い版の控えを消す（入っていなければ、古い控えを圏外のときに使う）
    let ready = false;
    try { ready = keys.includes(APP_CACHE) && !!(await (await caches.open(APP_CACHE)).match(scopeOf() + 'index.html')); } catch (err) { ready = false; }
    if (ready) await Promise.all(keys.filter(k => k.startsWith('kuiki-') && !KEEP.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 圏外のときに使う、画面の控えを1つ決める：今の控えに index.html があればそれ、なければ番号のいちばん大きい kuiki-app-vN で index.html のあるもの */
async function oneCache(cur, scopeUrl) {
  try {
    if (await cur.match(scopeUrl + 'index.html')) return cur;
    const ks = (await caches.keys()).filter(k => /^kuiki-app-v\d+$/.test(k)).sort((a, b) => Number(b.slice(11)) - Number(a.slice(11)));
    for (const k of ks) { const c = await caches.open(k); if (await c.match(scopeUrl + 'index.html')) return c; }
  } catch (err) { /* 見つからなければ今の控え */ }
  return cur;
}
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
        // 今の控えに画面がなければ（install でそろわなかったとき）、index.html のある控えのうち、いちばん新しい版の1つから返す。
        // その版にないファイルだけ、前の版から（監査5 M-3：いくつも残っているとき、古い版がまざらないように）
        const one = await oneCache(cache, scopeUrl);
        const any = async k => (await one.match(k)) || (await caches.match(k));
        const hit = (await any(key)) ||
          (req.mode === 'navigate' ? (await any(scopeUrl)) || (await any(scopeUrl + 'index.html')) : null);
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
