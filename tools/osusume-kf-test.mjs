/* おすすめの地図（2つめの区域の家）と、まとめ方（家どうしの距離の上限）の確かめ（2026-11-20）。
   使い方：リポジトリの上で python3 -m http.server 8767 を動かしてから node tools/osusume-kf-test.mjs http://localhost:8767
   練習モード（?renshu=1）で動かすので、サーバーには送らない。設計：docs/superpowers/specs/2026-11-20-osusume-kf-matome-design.md */
import { chromium } from 'playwright';
import fs from 'fs';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==', 'base64'); // 地図の画像の代わり（1点）
const ROOT = process.argv[2] || 'http://localhost:8767';
const OUT = process.argv[3] || '/tmp/osusume-kf';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) fails++; };

async function open(w = 390) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const pg = await ctx.newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(String(e)));
  pg.server = [];
  await pg.route('**/*', r => {
    const u = r.request().url();
    if (/script\.google/.test(u)) { pg.server.push(u); return r.abort(); }
    if (/gsi\.go\.jp/.test(u) && /\.(png|jpg)/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TILE });
    if (/gsi\.go\.jp|fonts\.g|open-meteo/.test(u)) return r.abort();
    return r.continue();
  });
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: "window.KUIKI_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec',lang:'ja',homeView:[26.158,127.676],homeZoom:16};" }));
  await pg.goto(ROOT + '/index.html?renshu=1&m=detail');
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && D().houses.length > 0 && !!window.KGReco);
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.remove();
    window.__asked = []; window.ask = async m => { window.__asked.push(String(m)); return true; };
    // 地図に描いた家：位置から家を引く。印の種類（押せるか・仮の家の点線か）も返す
    window.__drawn = () => {
      const at = new Map(); D().houses.forEach(h => { const k = h.lat + ',' + h.lng; if (!at.has(k)) at.set(k, []); at.get(k).push(h.id); });
      const out = new Map();
      houseLayer.eachLayer(l => {
        if (!l.getLatLng) return;
        const html = l.options.icon && l.options.icon.options ? String(l.options.icon.options.html || '') : '';
        if (!(l instanceof L.CircleMarker) && !/^<div class="pin/.test(html)) return; // 家の印だけ（建物の名前・目印・拒否の場所の印は数えない）
        const ll = l.getLatLng(), ids = at.get(ll.lat + ',' + ll.lng) || [];
        const prov = / prov[ "]/.test(html) || l.options.dashArray === '3 3';
        ids.forEach(id => out.set(id, { interactive: l.options.interactive !== false, prov }));
      });
      return out;
    };
    window.__view = tid => { const t = terrById(tid); map.fitBounds(L.latLngBounds(t.polygon), { animate: false }); renderHouses(); };
  });
  return { pg, ctx };
}

// ---- 1. おすすめの地図：2つの区域にまたがるとき ----
for (const w of [390, 1280]) {
  const { pg, ctx } = await open(w);
  const s = await pg.evaluate(() => {
    const ts = D().territories.filter(t => t.polygon && t.polygon.length > 2 && !isSpecial(t)).sort((a, b) => cmpNo(a.no, b.no));
    const by = ts.map(t => ({ t, hs: D().houses.filter(h => h.terrId === t.id && isFinite(h.lat)) })).filter(x => x.hs.length >= 3);
    const A = by[0], B = by[1], C = by[2];
    const bk = B.hs.filter(h => !houseHasRec(h)).slice(0, 3);
    bk[0].prov = true; // 2つめの区域に仮の家（この端末の練習のデータだけ）
    const keys = [...bk, ...A.hs.slice(0, 2)].map(h => K(h.id, ''));
    window.__s = { A: A.t.id, B: B.t.id, C: C ? C.t.id : null, aNo: A.t.no, bNo: B.t.no, aH: A.hs.map(h => h.id), bH: B.hs.map(h => h.id), cH: C ? C.hs.map(h => h.id) : [], bk: bk.map(h => h.id), prov: bk[0].id };
    KGReco.openKF({ keys });
    return { aNo: A.t.no, bNo: B.t.no, cNo: C ? C.t.no : null, bk: bk.length, keys: keys.length };
  });
  ok(s.bk === 3 && s.keys === 5, `[${w}] 区域${s.aNo}（2軒）・区域${s.bNo}（3軒・仮の家1軒）のおすすめを開いた`);
  await pg.waitForTimeout(600);

  const vb = await pg.evaluate(() => { __view(__s.B); const d = __drawn(); return {
    all: __s.bH.length, drawn: __s.bH.filter(id => d.has(id)).length,
    nums: __s.bk.filter(id => d.has(id)).length, tap: __s.bk.filter(id => d.has(id) && d.get(id).interactive).length,
    prov: d.has(__s.prov) && d.get(__s.prov).prov, sel: selTerrId() }; });
  ok(vb.drawn === vb.all, `[${w}] KF-1 2つめの区域（区域${s.bNo}）の家がすべて出る ${vb.drawn}/${vb.all}`);
  ok(vb.nums === 3 && vb.tap === 3, `[${w}] KF-2 2つめの区域の番号の家3軒が出て、押せる（出た ${vb.nums}・押せる ${vb.tap}）`);
  ok(vb.prov === true, `[${w}] KF-5 2つめの区域の仮の家が、点線の印で出る`);
  if (w === 390) await pg.screenshot({ path: OUT + '/kf_area2_' + w + '.png' });

  const va = await pg.evaluate(() => { __view(__s.A); const d = __drawn(); return { all: __s.aH.length, drawn: __s.aH.filter(id => d.has(id)).length }; });
  ok(va.drawn === va.all, `[${w}] KF-1 1つめの区域（区域${s.aNo}）の家も今までどおりすべて出る ${va.drawn}/${va.all}`);

  if (s.cNo) {
    const vc = await pg.evaluate(() => { __view(__s.C); const d = __drawn(); return __s.cH.filter(id => d.has(id)).length; });
    ok(vc === 0, `[${w}] KF-3 おすすめに入っていない区域（区域${s.cNo}）の家は出さない（出た ${vc}）`);
  }

  const bar = await pg.evaluate(() => { barHidden = false; renderCardBar(); const el = document.querySelector('#cardBar'); return el ? el.innerText : ''; });
  ok(/仮の家が1軒/.test(bar) && /区域/.test(bar), `[${w}] KF-5 下の案内に「仮の家が1軒」（地図の点線の印と合う）`);

  // 記録：2つめの区域の番号の家を押すと、カードを受け取らずに記録の画面が開く
  const rec = await pg.evaluate(async () => {
    window.__asked = []; if (typeof closeSheet === 'function') closeSheet();
    const h = houseById(__s.bk[1]);
    map.setView([h.lat, h.lng], TAP_MIN_ZOOM + 1, { animate: false });
    await new Promise(r => setTimeout(r, 700)); renderHouses();
    let mk = null; houseLayer.eachLayer(l => { if (l.getLatLng && !mk) { const ll = l.getLatLng(); const html = l.options.icon && l.options.icon.options ? String(l.options.icon.options.html || '') : ''; if (ll.lat === h.lat && ll.lng === h.lng && (l instanceof L.CircleMarker || /^<div class="pin/.test(html))) mk = l; } });
    if (!mk) return { text: '', asked: [], marker: false };
    mk.fire('click', { latlng: mk.getLatLng() }); // 地図の家の印を押す
    await new Promise(r => setTimeout(r, 800));
    const sh = document.querySelector('#sheet'); return { text: sh ? sh.innerText : '', asked: window.__asked.slice(), marker: true };
  });
  ok(rec.marker && /会えた/.test(rec.text) && !rec.asked.some(m => /受け取/.test(m)), `[${w}] KF-2 2つめの区域の家の印を押すと、記録の画面が開く（受け取りの確認なし） 印 ${rec.marker}・確認 ${JSON.stringify(rec.asked)}`);
  await pg.evaluate(() => { if (typeof closeSheet === 'function') closeSheet(); });
  await pg.waitForTimeout(300);

  // 表示を戻したあと・ふつうに区域をえらんだときは、今までどおりその区域の家だけ
  const back = await pg.evaluate(async () => {
    barHidden = false; renderCardBar();
    const c = document.querySelector('#kfClose'); if (c) c.click();
    await new Promise(r => setTimeout(r, 300));
    const A = terrById(__s.A); A.holder = me().id; // 伝道者が持っている区域にして、ふつうに開く（練習のデータだけ）
    openTerr(__s.A); await new Promise(r => setTimeout(r, 600));
    const sel = selTerrId();
    __view(__s.B); const d = __drawn();
    return { closed: !!c, sel, selOk: sel === __s.A, bDrawn: __s.bH.filter(id => d.has(id)).length };
  });
  ok(back.closed && back.selOk && back.bDrawn === 0, `[${w}] KF-4 表示を戻して区域${s.aNo}をえらぶと、ほかの区域の家は出ない（えらんだ区域 ${back.sel}・区域${s.bNo}の家 ${back.bDrawn}）`);

  ok(pg.errs.length === 0, `[${w}] ページのエラーなし ${JSON.stringify(pg.errs.slice(0, 3))}`);
  ok(pg.server.length === 0, `[${w}] サーバーへの通信なし（練習モード）`);
  await ctx.close();
}

// ---- 2. まとめ方：家どうしの距離の上限（係の設定「『近く』とする距離」recoDist） ----
{
  const { pg, ctx } = await open(390);
  const r = await pg.evaluate(() => {
    const lat0 = 26.18, lng0 = 127.68, kx = 111320 * Math.cos(lat0 * Math.PI / 180);
    const at = m => [lat0, lng0 + m / kx];
    const t = { id: 'tx', no: '99' };
    const mk = (offs, pre) => offs.map((m, i) => { const [lat, lng] = at(m); const h = { id: pre + i, lat, lng, type: 'home' }; return { h, k: h.id + '|', t, lastAt: '2026-01-' + String(10 + i).padStart(2, '0'), focus: false, left: false }; });
    const span = c => { let mx = 0; c.stops.forEach(a => c.stops.forEach(b => { mx = Math.max(mx, distM([a.h.lat, a.h.lng], [b.h.lat, b.h.lng])); })); return Math.round(mx); };
    const run = (dist, items) => { const st = D().settings; st.recoCount = 5; if (dist == null) delete st.recoDist; else st.recoDist = dist; return KGReco.buildClusters(items, at(0), false); };
    const OFFS = [0, 80, 160, 240, 320, 400, 900, 1000, 1500, 1520, 3000];
    const res = {};
    const c500 = run(500, mk(OFFS, 'sa'));
    res.d500 = { spans: c500.map(span), sizes: c500.map(c => c.stops.length), total: c500.reduce((a, c) => a + c.n, 0), first: c500[0].stops.map(s => s.h.id) };
    const cdef = run(null, mk(OFFS, 'sb'));
    res.def = { spans: cdef.map(span), sizes: cdef.map(c => c.stops.length) };
    const c3k = run(3000, mk(OFFS, 'sc'));
    res.d3k = { spans: c3k.map(span), sizes: c3k.map(c => c.stops.length) };
    // 部屋の多い集合住宅（1軒に8部屋）：5部屋と3部屋に分かれる（今までどおり）
    const [alat, alng] = at(0), ah = { id: 'apx', lat: alat, lng: alng, type: 'apt' };
    const rooms = ['101', '102', '103', '104', '201', '202', '203', '204'].map((u, i) => ({ h: ah, k: 'apx|' + u, t, lastAt: '2026-02-0' + (i % 9 + 1), focus: false, left: false }));
    const ca = run(500, rooms);
    res.apt = ca.map(c => c.n);
    // 速さ：候補3,000軒（2km四方）。まとめる計算の時間（3回の中央値）
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const big = Array.from({ length: 3000 }, (_, i) => { const h = { id: 'pf' + i, lat: lat0 + rnd() * 0.018, lng: lng0 + rnd() * 0.02, type: rnd() < 0.1 ? 'apt' : 'home' }; return { h, k: h.id + '|', t, lastAt: '2026-0' + (1 + i % 9) + '-01', focus: false, left: false }; });
    const ms = [];
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); run(500, big.map(x => Object.assign({}, x))); ms.push(performance.now() - t0); }
    ms.sort((a, b) => a - b); res.perf = Math.round(ms[1]);
    const cb = run(500, big.map(x => Object.assign({}, x)));
    res.bigMax = Math.max(...cb.map(span)); res.bigN = cb.length;
    // 雨の日（集合住宅を先にまとめる組）でも、家どうしは上限以内
    const wet = Array.from({ length: 400 }, (_, i) => { const h = { id: 'rw' + i, lat: lat0 + rnd() * 0.02, lng: lng0 + rnd() * 0.02, type: rnd() < 0.4 ? 'apt' : 'home', ac: rnd() < 0.5 ? 'ev' : '' }; return { h, k: h.id + '|', t, lastAt: '2026-0' + (1 + i % 9) + '-01', focus: false, left: false }; });
    D().settings.recoCount = 5; D().settings.recoDist = 500;
    const cw = KGReco.buildClusters(wet, at(0), true);
    res.rainMax = Math.max(...cw.map(span)); res.rainN = cw.length; res.rainTotal = cw.reduce((a, c) => a + c.n, 0);
    // 係の設定のヒントに、今の上限の値が出る（係の画面に距離の行はないため）
    const hint = d => { D().settings.recoDist = d; return extSetHtml((l, h, c) => '', () => ''); };
    res.hint500 = /家どうしが500mより離れているときは/.test(hint(500));
    res.hint1200 = /家どうしが1200mより離れているときは/.test(hint(1200));
    res.hint0 = /家どうしが100mより離れているときは/.test(hint(0)) && recoDistM() === 100; // 0 で保存されていても、ヒントと計算は同じ100m
    D().settings.recoDist = 500;
    return res;
  });
  // 速さ（古いスマホの代わりに CPU を4倍遅く）：距離の上限を広げた車の地域・候補が多いとき
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const perf = await pg.evaluate(() => {
    const t = { id: 'tx', no: '99' };
    let seed = 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const mk = (n, km) => Array.from({ length: n }, (_, i) => { const h = { id: 'pp' + i, lat: 26.18 + rnd() * km * 0.009, lng: 127.68 + rnd() * km * 0.01, type: rnd() < 0.1 ? 'apt' : 'home' }; return { h, k: h.id + '|', t, lastAt: '2026-0' + (1 + i % 9) + '-01', focus: false, left: false }; });
    const one = (n, km, dist) => {
      D().settings.recoCount = 5; D().settings.recoDist = dist;
      const base = mk(n, km), ms = [];
      for (let i = 0; i < 3; i++) { const its = base.map(x => Object.assign({}, x)); const t0 = performance.now(); KGReco.buildClusters(its, [26.18, 127.68], false); ms.push(performance.now() - t0); }
      ms.sort((a, b) => a - b); return Math.round(ms[1]);
    };
    const r = { a: one(3000, 2, 500), b: one(5000, 2, 1000), c: one(5000, 3, 3000), d: one(10000, 5, 3000) };
    D().settings.recoDist = 500;
    return r;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  ok(r.d500.spans.every(s => s <= 505), 'MT-1 上限500m：どのおすすめも家どうしが500m以内 ' + JSON.stringify(r.d500.spans));
  ok(r.d500.total === 11, 'MT-2 家を落とさない（11軒すべてどれかのおすすめに入る）・軒数 ' + JSON.stringify(r.d500.sizes));
  ok(JSON.stringify(r.d500.first) === JSON.stringify(['sa0', 'sa1', 'sa2', 'sa3', 'sa4']), 'MT-3 はじめのおすすめ（近い5軒）は今までと同じ ' + JSON.stringify(r.d500.first));
  ok(r.def.spans.every(s => s <= 505) && JSON.stringify(r.def.sizes) === JSON.stringify(r.d500.sizes), 'MT-1 設定がないときは500m ' + JSON.stringify(r.def.sizes));
  ok(r.d3k.sizes[1] === 5 && Math.max(...r.d3k.spans) > 1000, 'MT-1 設定を3000mにすると、遠い家もまとまる（設定が効く） ' + JSON.stringify(r.d3k.sizes));
  ok(JSON.stringify(r.apt) === JSON.stringify([5, 3]), 'MT-3 8部屋の集合住宅は5部屋と3部屋に分かれる（今までどおり） ' + JSON.stringify(r.apt));
  ok(r.bigMax <= 505, `MT-1 候補3,000軒でも、家どうしは500m以内（最大 ${r.bigMax}m・おすすめ ${r.bigN}件）`);
  console.log(`INFO まとめる計算（候補3,000軒）：${r.perf}ms`);
  ok(r.perf < 400, 'MT 速さ：候補3,000軒のまとめる計算が0.4秒未満');
  ok(r.rainMax <= 505 && r.rainTotal > 0, `MT-1 雨の日（集合住宅を先に）でも、家どうしは500m以内（最大 ${r.rainMax}m・おすすめ ${r.rainN}件）`);
  ok(r.hint500 && r.hint1200 && r.hint0, 'MT-4 係の設定のヒントに、今の上限（500m・1200m）が出る。0 のときも計算と同じ100m');
  console.log(`INFO まとめる計算（CPU 4倍遅く）：3,000軒/2km/500m ${perf.a}ms・5,000軒/2km/1000m ${perf.b}ms・5,000軒/3km/3000m ${perf.c}ms・10,000軒/5km/3000m ${perf.d}ms`);
  ok(Math.max(perf.a, perf.b, perf.c) < 300, 'MT 速さ：CPU 4倍遅くても、候補5,000軒までは0.3秒未満（距離の上限 3000m でも）');
  ok(perf.d < 500, 'MT 速さ：CPU 4倍遅くても、候補10,000軒・上限3000m で0.5秒未満');
  ok(pg.errs.length === 0, 'ページのエラーなし ' + JSON.stringify(pg.errs.slice(0, 3)));
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} 件 NG` : '\nすべて OK');
process.exit(fails ? 1 : 0);
