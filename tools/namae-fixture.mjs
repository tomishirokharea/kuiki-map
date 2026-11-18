/* =====================================================================
   名前の重なり（家の名前・目印の名前）の試験で使う「場面づくり」（2026-11-18）
   ・試作モード（GAS のURLなし）で開き、試作の家の名前を空にして、組 A〜H の家と目印を足す
   ・namae-tanaoroshi.mjs と、あとの試験が使う
   ===================================================================== */
import { chromium } from 'playwright';

const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const M = 0.000009;       // 緯度 1m
const ME = 0.00001;       // 経度 1m（北緯26度）

/* 試作モードで開き、splash を消し、くわしい／かんたんにする（手本：map-default-test.mjs） */
export async function openPage(b, port, { w = 390, simple = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error' && !/gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(m.location().url || '')) errs.push('console.error: ' + String(m.text()).slice(0, 200)); });   // 画面の console.error も数える（M3-4）
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
  await pg.evaluate(() => { localStorage.clear(); });
  await pg.reload();
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
  await pg.evaluate(simple => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = simple ? 'simple' : 'detail'; applyUi(); }, simple);
  await pg.waitForTimeout(300);
  pg._namaiSimple = simple;
  return { pg, ctx, errs };
}

/* 組の中心（組どうしは、緯度で80m以上、同じ緯度なら経度で350m以上はなす） */
const C = {
  A: [26.1635, 127.6730], B: [26.1620, 127.6730], C: [26.1605, 127.6730], D: [26.1590, 127.6740],
  E: [26.1575, 127.6740], F: [26.1563, 127.6740], G: [26.1612, 127.6765], H: [26.1635, 127.6790]
};
const at = (g, dn = 0, de = 0) => [+(C[g][0] + dn * M).toFixed(7), +(C[g][1] + de * ME).toFixed(7)]; // dn＝北へ何m、de＝東へ何m
// 家：[組, 名前, type, kind, 区域, 北m, 東m, 経度の指定]
const HOUSES = [
  ['A', '宜保ハイツ', 'apt', 'apt', 't1', 0, 5],           // 先に入れる（二重の順番の試験）
  ['A', '宜保公民館', 'house', 'hall', 't1', 0, 0],
  ['B', 'ファミリーマート 宜保', 'house', 'conv', 't1', 0, 0],
  ['C', 'すみれ児童公園', 'house', 'gov', 't1', 0, 0],
  ['D', 'にこにこ公園', 'house', 'gov', 't3', 0, 0],
  ['E', 'ホワイトニング店', 'house', 'shop', 't3', 0, 0],
  ['G', 'アパートA棟', 'apt', 'apt', 't1', 0, 0, 127.67645],
  ['G', 'アパートB棟', 'apt', 'apt', 't2', 0, 0, 127.67655],
  ['H', 'さくら商店', 'house', 'shop', 't2', 0, 0]
];
// 目印：[組, 名前, kind, 北m, 東m, dup]
const LMS = [
  ['A', '宜保公民館', 'kominkan', 20, 0, true],
  ['B', 'ﾌｧﾐﾘｰﾏｰﾄ宜保', 'shop', 15, 0, true],
  ['C', 'すみれ児童公園北', 'park', 25, 0, true],
  ['D', 'にこにこ公園', 'park', -60, 0],
  ['E', '白ゆり公園', 'park', 0, 5],
  ['F', '会館', 'kaikan', 0, 0],
  ['F', 'ローソン豊見城', 'shop', 0, 5],
  ['H', 'さくら商店', 'shop', 10, 0]
];

/* 場面をつくる（目印は端末のデータに入れて、再読み込みで読ませる）。区域 t1 をえらぶところまで行う */
export async function setupFixture(pg) {
  const items = [], houses = [], lms = [];
  HOUSES.forEach(([g, text, type, kind, terrId, dn, de, lng], i) => {
    const [lat, lg] = at(g, dn, de);
    houses.push({ id: 'nf_h' + i, terrId, type, kind, lat, lng: lng || lg, label: text, units: type === 'apt' ? ['101'] : [], createdAt: Date.now() });
    items.push({ text, kind: 'h', group: g, lat, lng: lng || lg });
  });
  LMS.forEach(([g, text, kind, dn, de, dup], i) => {
    const [lat, lng] = at(g, dn, de);
    lms.push({ id: 'nf_l' + i, name: text, kind, lat, lng, src: '', rev: 1 });
    items.push(Object.assign({ text, kind: 'lm', group: g, lat, lng }, dup ? { dup: true } : {}));
  });
  await pg.evaluate(hs => { D().houses.forEach(h => { h.label = ''; }); hs.forEach(h => D().houses.push(h)); Store.save(); }, houses);
  await pg.evaluate(async lms => { await IDB.set('lm_v1', { rev: 1, items: lms }); }, lms);
  await pg.reload();
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
  // 再読み込みで「くわしい／かんたん」がもどるので、もう一度えらぶ
  await pg.evaluate(simple => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = simple ? 'simple' : 'detail'; applyUi(); showView('map'); selectTerr('t1', { fit: false }); }, !!pg._namaiSimple);
  await pg.waitForTimeout(400);
  const groups = {}; Object.keys(C).forEach(g => { groups[g] = { center: C[g] }; });
  return { groups, items };
}

/* 地図を動かして、描き直しを待つ */
export async function goTo(pg, lat, lng, z) {
  await pg.evaluate(([a, b, z]) => { map.setView([a, b], z, { animate: false }); }, [lat, lng, z]);
  await pg.waitForTimeout(300);
}

/* 画面に見えている名前（家＝.hname・目印＝.lm-label）。opacity が 0 のものは数えない */
export async function visibleNames(pg) {
  return pg.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [];
    const grab = (sel, kind) => document.querySelectorAll(sel).forEach(s => {
      const r = s.getBoundingClientRect(), icon = s.closest('.leaflet-marker-icon');
      const op = parseFloat(getComputedStyle(s).opacity) * parseFloat(getComputedStyle(icon).opacity);
      if (r.width && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H && op > 0)
        out.push({ text: s.textContent.trim(), kind, r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, op: Math.round(op * 100) / 100 });
    });
    grab('.leaflet-marker-icon.hname span', 'h');
    grab('.leaflet-marker-icon.lm-label span', 'lm');
    return out;
  });
}

/* 画面に見えている目印の印（.lm-mark の .lmchip の文字） */
export async function visibleMarks(pg) {
  return pg.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    return [...document.querySelectorAll('.lm-mark .lmchip')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H; })
      .map(e => e.textContent.trim());
  });
}

export { chromium };
