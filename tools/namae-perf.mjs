// 使い方：node tools/namae-perf.mjs [ポート]   （サイトを http://localhost:ポート で出しておく）
// 名前の重なり（2026.13.160）の速さ：試作モードで家3万軒（1%は shop「テスト店N」・3%は apt「テスト荘N」）と目印300件を足し、
// 拡大15と17・区域 t1 をえらぶ／えらばない、で renderHouses() と lmRender()（window.lmRepaint 経由）を10回ずつ測って平均を出す。
// main と枝の両方で走らせて比べる（どちらにもある関数だけを使う）。目安：renderHouses の平均の差 +10ms 以内・lmRender 30ms 未満。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const N = 30000, NLM = 300, RUNS = 10;
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
const ready = () => pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
await pg.goto(`http://localhost:${port}/index.html`); await ready();
await pg.evaluate(() => { localStorage.clear(); }); await pg.reload(); await ready();
// 目印300件を端末に入れて再読み込み（家はそのあとメモリにだけ足す）
await pg.evaluate(async n => {
  const kinds = ['park', 'shop', 'school', 'kaikan'], items = [];
  for (let i = 0; i < n; i++) items.push({ id: 'pl' + i, name: 'テスト目印' + i, kind: kinds[i % 3], lat: 26.150 + (i * 7919 % 2000) / 100000, lng: 127.665 + (i * 104729 % 2500) / 100000, src: '', rev: 1 });
  await IDB.set('lm_v1', { rev: 1, items });
}, NLM);
await pg.reload(); await ready();
await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); showView('map'); });
await pg.evaluate(n => {
  const hs = D().houses; let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const inR = (a, c, lat, lng) => lat >= a[0] && lat < a[1] && lng >= c[0] && lng < c[1];
  for (let i = 0; i < n; i++) {
    const lat = 26.150 + rnd() * 0.020, lng = 127.665 + rnd() * 0.025;
    const terrId = inR([26.16, 26.164], [127.672, 127.6765], lat, lng) ? 't1' : inR([26.16, 26.164], [127.6765, 127.681], lat, lng) ? 't2' : inR([26.156, 26.16], [127.672, 127.681], lat, lng) ? 't3' : inR([26.156, 26.16], [127.681, 127.685], lat, lng) ? 't4' : ['t1', 't2', 't3', 't4'][i % 4];
    const r = i % 100;
    const apt = r >= 1 && r < 4, shop = r === 0;
    hs.push({ id: 'p' + i, terrId, type: apt ? 'apt' : 'house', kind: shop ? 'shop' : 'house', lat, lng,
      label: shop ? 'テスト店' + i : apt ? 'テスト荘' + i : '', units: apt ? ['101'] : [], createdAt: Date.now() });
  }
}, N);
const T1 = [26.162, 127.6743];
await pg.evaluate(c => { selectTerr('t1', { fit: false }); map.setView(c, 17, { animate: false }); }, T1);   // 地図が整うまでの準備運転
await pg.waitForTimeout(1500);
const rows = [];
for (const z of [15, 17]) for (const sel of [true, false]) {
  const r = await pg.evaluate(([z, sel, c, runs]) => {
    if (sel) selectTerr('t1', { fit: false }); else if (typeof deselectTerr === 'function') deselectTerr(); else selectTerr(null, { fit: false });
    map.setView(c, z, { animate: false });
    const time = f => { f(); const a = []; for (let i = 0; i < runs; i++) { const t = performance.now(); f(); a.push(performance.now() - t); } return a.reduce((x, y) => x + y, 0) / runs; };
    return { sel: !!(typeof Sel !== 'undefined' ? Sel.terrId : sel), houses: D().houses.length, hn: (window.HOUSE_NAMES || []).length,
      renderHouses: time(() => renderHouses()), lmRender: time(() => window.lmRepaint()) };
  }, [z, sel, T1, RUNS]);
  rows.push({ z, selected: sel, ...r });
}
console.log(JSON.stringify({ port, errs: errs.slice(0, 3) }));
for (const r of rows) console.log(`zoom ${r.z} 区域${r.selected ? 't1' : 'なし'}：renderHouses ${r.renderHouses.toFixed(1)}ms  lmRender ${r.lmRender.toFixed(1)}ms  （家${r.houses}・建物の名前の候補${r.hn}）`);
await b.close();
