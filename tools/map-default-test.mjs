// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/map-default-test.mjs [ポート]
// 2026.13.154：地図の見やすさの設定（区域の線と番号・建物の名前・目印の名前）を、初めて開く人の初期値にする（R A さんの設定）。
// 前から使っている人の地図は変えない（保存した値はそのまま。保存していない項目は、今までの初期値）。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };

// R A さんの設定（2026-11-15 の画面）
const NEW = { terrColor: 'red', terrWidth: 'thin', labOp: 40, lineOp: 15, aptName: 'on', aptZoom: -1, fcName: 'on', fcZoom: -2, nameScope: 'all', lmNameZ: 12.5 };
// 今までの初期値（前から使っている人は、こちらのまま）
const OLD = { terrColor: 'theme', terrWidth: 'normal', labOp: 40, lineOp: 35, aptName: 'off', aptZoom: 0, fcName: 'off', fcZoom: 0, nameScope: 'sel', lmNameZ: 16 };
const KEYS = Object.keys(NEW);

/* saved：この人の端末に前から保存されていた設定（null＝初めて開く人） */
async function open(saved, w = 390) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof uiKey === 'function' && typeof Store !== 'undefined' && Store.data);
  const key = await pg.evaluate(() => uiKey());
  await pg.evaluate(([key, saved]) => { localStorage.clear(); if (saved) localStorage.setItem(key, JSON.stringify(saved)); }, [key, saved]);
  await pg.reload();
  await pg.waitForFunction(() => typeof uiKey === 'function' && typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
  await pg.waitForTimeout(300);
  return { pg, ctx, errs, key };
}
const ui = pg => pg.evaluate(keys => Object.fromEntries(keys.map(k => [k, UI[k]])), KEYS);
const same = (a, b) => KEYS.every(k => a[k] === b[k]);

// 1. 初めて開く人：R A さんの設定になる
{
  const { pg, ctx, errs, key } = await open(null);
  const u = await ui(pg);
  ok(same(u, NEW), '初めて開く人：地図の設定が R A さんの設定になる', u);
  ok(await pg.evaluate(() => terrLineColor() === '#D32F2F' && terrLineWidth(false) === 2 && Math.abs(terrLineOp() - 0.15) < 1e-9 && Math.abs(terrLabOp() - 0.4) < 1e-9), '初めて開く人：線は赤・細い・濃さ15%、番号の濃さ40%', null);
  // 歯車の設定（地図）の表示が、画面の写真と同じ
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); });
  const t = await pg.evaluate(() => { openUiSheet(); const m = document.querySelector('#sheet [data-page="map"]'); if (m) m.click(); return document.querySelector('#sheet').textContent; }).catch(e => String(e));
  ok(/1段 縮めても（2分の1）/.test(t) && /2段 縮めても（4分の1）/.test(t) && /地域の全体が見えているときから/.test(t), '設定の画面：「1段 縮めても」「2段 縮めても」「地域の全体が見えているときから」', t.slice(0, 80));
  ok(await pg.evaluate(() => { const b = document.querySelector('#sheet [data-ui="terrColor"][data-v="red"]'); return !!b && b.getAttribute('aria-pressed') === 'true'; }), '設定の画面：線の色は「赤」がえらばれている', null);
  // かんたん表示の初めての人にも、地図の線と名前は同じに効く
  ok(await pg.evaluate(() => { UI.mode = 'simple'; applyUi(); return terrLineColor() === '#D32F2F' && UI.aptName === 'on'; }), 'かんたん表示でも、線の色と建物の名前の設定が効く', null);
  ok(!errs.length, '初めて開く人：JS のエラーなし', errs);
  await ctx.close();
}
// 2. 前から使っている人（設定を全部保存している・今までの初期値のまま）：変わらない
{
  const { pg, ctx } = await open(Object.assign({ mode: 'detail', size: 'normal', fTime: 'off', fFollow: 'off' }, OLD));
  const u = await ui(pg);
  ok(same(u, OLD), '前から使っている人（全部保存）：今までのまま', u);
  await ctx.close();
}
// 3. 前から使っている人（線や名前の項目が足される前に保存した・その項目は保存していない）：今までの初期値のまま
{
  const { pg, ctx, key } = await open({ mode: 'simple', size: 'large', fTime: 'off', fFollow: 'off', pin: 'normal' });
  const u = await ui(pg);
  ok(same(u, OLD), '前から使っている人（地図の項目を保存していない）：今までの初期値のまま', u);
  ok(await pg.evaluate(() => UI.size === 'large'), '前から使っている人：ほかの設定（文字の大きさ）もそのまま', null);
  await ctx.close();
}
// 4. 前から使っている人が自分で変えた値は、そのまま
{
  const { pg, ctx } = await open({ mode: 'detail', fTime: 'off', fFollow: 'off', terrColor: 'blue', lineOp: 60, aptName: 'on', aptZoom: 1 });
  const u = await ui(pg);
  ok(u.terrColor === 'blue' && u.lineOp === 60 && u.aptName === 'on' && u.aptZoom === 1 && u.terrWidth === 'normal' && u.fcName === 'off' && u.lmNameZ === 16, '前から使っている人が変えた値はそのまま・ほかの地図の項目は今までの初期値', u);
  await ctx.close();
}
// 5. 初めて開いたあと、もう一度開いても同じ（保存した値で続く）／ほかの設定を変えても地図の設定は変わらない
{
  const { pg, ctx } = await open(null);
  await pg.evaluate(() => { UI.size = 'large'; uiSave(); });
  await pg.reload();
  await pg.waitForFunction(() => typeof UI !== 'undefined' && typeof Store !== 'undefined' && Store.data);
  await pg.waitForTimeout(300);
  const u = await ui(pg);
  ok(same(u, NEW) && await pg.evaluate(() => UI.size === 'large'), '初めての人：開き直しても R A さんの設定のまま（文字の大きさを変えても）', u);
  await ctx.close();
}

console.log(ng ? `\n${ng}件 NG` : '\nすべて OK');
await b.close();
process.exit(ng ? 1 : 0);
