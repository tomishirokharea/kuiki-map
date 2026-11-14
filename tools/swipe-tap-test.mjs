// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/swipe-tap-test.mjs [ポート]
// 2026.13.151：左にスワイプして出したボタン（記録の「取り消し」・予定の「編集」「削除」）を、指でふつうに押す
// （押して離すまで 0.1〜0.3秒）と、押した瞬間に行が閉じはじめてボタンにかぶり、押したことにならなかった（31-2 の声）。
// 押す長さを変えて、ボタンが1回で働くか。あわせて、前からの働き（ほかをさわると閉じる・開いた行を押すと閉じる・
// 半分までずらさないと開かない・別の行をスワイプすると前の行は閉じる）も確かめる。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };

async function page() {
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof openTarget === 'function' && typeof Store !== 'undefined' && Store.data);
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); renderAll(); });
  return { pg, ctx, errs };
}
/* 行を左にスワイプ（指の代わりにマウス。pointer の事件は同じ）。dist：ずらす距離 */
async function swipe(pg, el, dist = 250) {
  const bx = await el.boundingBox(), y = bx.y + bx.height / 2, x0 = bx.x + bx.width - 20;
  await pg.mouse.move(x0, y); await pg.mouse.down();
  for (let i = 1; i <= 10; i++) await pg.mouse.move(x0 - dist * i / 10, y);
  await pg.mouse.up(); await pg.waitForTimeout(350); // 開くアニメーション（0.2秒）を待つ
}
async function press(pg, el, ms) {
  const bx = await el.boundingBox();
  await pg.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  await pg.mouse.down(); await pg.waitForTimeout(ms); await pg.mouse.up();
  await pg.waitForTimeout(450);
}
const askOpen = pg => pg.evaluate(() => { const a = document.querySelector('#askBox'); return !!a && !a.hidden && getComputedStyle(a).display !== 'none'; });
const askCancel = pg => pg.evaluate(() => { const c = document.querySelector('#askBox .askbtn[data-askno]'); if (c) c.click(); });

/* 1. 家の画面の「これまでの記録」：左にスワイプ →「取り消し」 */
async function houseScene(pg, n) {
  await pg.evaluate(n => {
    const my = me().id;
    const h = D().houses.find(x => x.type !== 'apt' && !(x.units && x.units.length) && x.terrId && !hasSkip(x) && !hasLang(x) && !Object.keys(D().dnc).some(k => k.indexOf(x.id + '|') === 0));
    const t = terrById(h.terrId); t.holder = my; t.lentAt = new Date(Date.now() - 3 * 864e5).toISOString();
    D().visits = D().visits.filter(v => v.houseId !== h.id);
    const sod = new Date(); sod.setHours(0, 0, 0, 0);
    for (let i = 0; i < n; i++) D().visits.push({ id: 'vS' + i, houseId: h.id, unit: '', result: 'away', at: new Date(sod.getTime() + (Date.now() - sod.getTime()) * (0.3 + i * 0.2)).toISOString(), by: my });
    Store.save(); renderAll();
    window.__hid = h.id; openTarget(h.id, '');
  }, n);
  await pg.waitForTimeout(500);
}
for (const ms of [40, 120, 250, 400]) {
  const { pg, ctx } = await page();
  await houseScene(pg, 1);
  const row = await pg.$('#sheet .swipe-body');
  await swipe(pg, row);
  ok(await pg.evaluate(() => !!document.querySelector('#sheet .swipe.open')), `記録 ${ms}ms：スワイプで「取り消し」が出る`, null);
  await press(pg, await pg.$('#sheet [data-vdel]'), ms);
  ok(await askOpen(pg), `記録 ${ms}ms：「取り消し」を1回押すと確認が出る`, null);
  await ctx.close();
}
// 確認で「はい」→ 記録が消える（1回で最後まで）
{
  const { pg, ctx } = await page();
  await houseScene(pg, 1);
  await swipe(pg, await pg.$('#sheet .swipe-body'));
  await press(pg, await pg.$('#sheet [data-vdel]'), 200);
  await pg.evaluate(() => { const y = document.querySelector('#askBox [data-askyes]'); if (y) y.click(); });
  await pg.waitForTimeout(500);
  const n = await pg.evaluate(() => D().visits.filter(v => v.houseId === __hid).length);
  ok(n === 0, '記録：確認で「はい」を押すと、記録が取り消される', n);
  await ctx.close();
}
/* 前からの働き */
{
  const { pg, ctx } = await page();
  await houseScene(pg, 2);
  const rows = await pg.$$('#sheet .swipe-body');
  ok(rows.length === 2, '記録が2行', rows.length);
  // 半分までずらさないと開かない
  await swipe(pg, rows[0], 60);
  ok(!(await pg.evaluate(() => !!document.querySelector('#sheet .swipe.open'))), '少しずらしただけでは開かない', null);
  // 1行目を開く → 2行目をスワイプ → 1行目は閉じて2行目だけ開く
  await swipe(pg, rows[0]);
  await swipe(pg, rows[1]);
  const st = await pg.evaluate(() => [...document.querySelectorAll('#sheet .swipe')].map(x => x.classList.contains('open')));
  ok(st[0] === false && st[1] === true, '別の行をスワイプすると、前の行は閉じる', st);
  // ほかの所をさわると閉じる（ボタンは働かない）
  await press(pg, await pg.$('#sheetTitle'), 120);
  ok(!(await pg.evaluate(() => !!document.querySelector('#sheet .swipe.open'))), 'ほかの所をさわると閉じる', null);
  ok(!(await askOpen(pg)), 'ほかの所をさわっても確認は出ない', null);
  // 開いた行の「取り消し」ではない所（行の本体）を押しても、確認は出ない
  const rb = await rows[0].boundingBox(); // 閉じているときの行の場所
  await swipe(pg, rows[0]);
  const delBox = await (await pg.$('#sheet .swipe.open [data-vdel]')).boundingBox();
  await pg.mouse.move(rb.x + 20, rb.y + rb.height / 2); await pg.mouse.down(); await pg.waitForTimeout(120); await pg.mouse.up(); await pg.waitForTimeout(400);
  ok(!(await askOpen(pg)) && delBox.x > rb.x + 20, '開いた行の本体を押しても確認は出ない', null);
  await ctx.close();
}

/* 1b. 指（タッチ）で：iPad と同じ touch の事件で、スワイプ →「取り消し」を ms ミリ秒押す */
for (const ms of [150, 300]) {
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); const cdp = await ctx.newCDPSession(pg);
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof openTarget === 'function' && typeof Store !== 'undefined' && Store.data);
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); renderAll(); });
  await houseScene(pg, 1);
  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const bx = await (await pg.$('#sheet .swipe-body')).boundingBox(), y = bx.y + bx.height / 2, x0 = bx.x + bx.width - 20;
  await T('touchStart', x0, y); for (let i = 1; i <= 10; i++) { await T('touchMove', x0 - 25 * i, y); await pg.waitForTimeout(16); } await T('touchEnd');
  await pg.waitForTimeout(400);
  const d = await (await pg.$('#sheet [data-vdel]')).boundingBox();
  await T('touchStart', d.x + d.width / 2, d.y + d.height / 2); await pg.waitForTimeout(ms); await T('touchEnd');
  await pg.waitForTimeout(600);
  ok(await askOpen(pg), `指で ${ms}ms：「取り消し」を1回押すと確認が出る`, null);
  // 確認で「やめる」→ 記録は残り、行は閉じている（今までどおり）
  await askCancel(pg); await pg.waitForTimeout(500);
  const r = await pg.evaluate(() => ({ n: D().visits.filter(v => v.houseId === __hid).length, open: !!document.querySelector('#sheet .swipe.open') }));
  ok(r.n === 1 && !r.open, `指で ${ms}ms：「やめる」なら記録は残り、行は閉じる`, r);
  await ctx.close();
}
// 押したまま指をずらして離す（押したことにならない）→ 確認は出ず、行は閉じる（今までどおり）
{
  const { pg, ctx } = await page();
  await houseScene(pg, 1);
  await swipe(pg, await pg.$('#sheet .swipe-body'));
  const d = await (await pg.$('#sheet [data-vdel]')).boundingBox();
  await pg.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await pg.mouse.down(); await pg.waitForTimeout(150);
  await pg.mouse.move(d.x - 200, d.y - 150, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => ({ ask: !document.querySelector('#askBox').hidden, open: !!document.querySelector('#sheet .swipe.open') }));
  ok(!r.ask && !r.open, '押したまま指をずらして離すと、確認は出ず、行は閉じる', r);
  await ctx.close();
}

// ずれた押し（押したことにならない）→ すぐに押し直す（400ms）→ 2回目で確認が出る（前の押しの「閉じる」が働かない）
{
  const { pg, ctx } = await page();
  await houseScene(pg, 1);
  await swipe(pg, await pg.$('#sheet .swipe-body'));
  const d = await (await pg.$('#sheet [data-vdel]')).boundingBox(), cx = d.x + d.width / 2, cy = d.y + d.height / 2;
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.waitForTimeout(80);
  await pg.mouse.move(cx - 200, cy - 150, { steps: 3 }); await pg.mouse.up(); // ずれて、押したことにならない
  await pg.waitForTimeout(100);
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.waitForTimeout(400); await pg.mouse.up();
  await pg.waitForTimeout(500);
  ok(await askOpen(pg), 'ずれた押しのすぐあとに押し直す（400ms）と、確認が出る', null);
  await ctx.close();
}
// ずらして離す → すぐに同じ行をスワイプし直す → 0.7秒たっても開いたまま
{
  const { pg, ctx } = await page();
  await houseScene(pg, 1);
  const row = await pg.$('#sheet .swipe-body');
  const rb = await row.boundingBox();
  await swipe(pg, row);
  const d = await (await pg.$('#sheet [data-vdel]')).boundingBox();
  await pg.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await pg.mouse.down(); await pg.waitForTimeout(60);
  await pg.mouse.move(d.x - 200, d.y - 150, { steps: 2 }); await pg.mouse.up();
  // すぐに同じ行をスワイプし直す（閉じていく途中でも、閉じた行でも、左にずらせば開く）
  const y = rb.y + rb.height / 2, x0 = rb.x + rb.width - 200;
  await pg.mouse.move(x0, y); await pg.mouse.down();
  for (let i = 1; i <= 6; i++) await pg.mouse.move(x0 - 40 * i, y);
  await pg.mouse.up();
  await pg.waitForTimeout(700);
  ok(await pg.evaluate(() => !!document.querySelector('#sheet .swipe.open')), 'ずらして離したあと、すぐ同じ行をスワイプし直すと、開いたまま', null);
  await ctx.close();
}

/* 2. 予定の行（ホーム）：左にスワイプ →「編集」「削除」 */
async function schedScene(pg) {
  return pg.evaluate(() => {
    // 予定を直せる人（区域係）に切りかえる（使う人の切りかえと同じ）
    const sel = document.getElementById('whoSel'), adm = D().users.find(u => u.role === 'admin');
    sel.value = adm.id; sel.dispatchEvent(new Event('change'));
    showView('home'); renderHome(); window.scrollTo(0, 0);
    return document.querySelectorAll('.swipe[data-sid] .swipe-body').length;
  });
}
for (const ms of [40, 250]) {
  const { pg, ctx } = await page();
  const n = await schedScene(pg);
  if (!n) { ok(false, '予定の行（スワイプできる行）がある', n); await ctx.close(); continue; }
  const row = await pg.$('.swipe[data-sid] .swipe-body');
  await row.scrollIntoViewIfNeeded();
  await swipe(pg, row);
  await press(pg, await pg.$('.swipe.open [data-scact="del"]'), ms);
  ok(await askOpen(pg), `予定 ${ms}ms：「削除」を1回押すと確認が出る`, null);
  await askCancel(pg); await pg.waitForTimeout(300);
  ok(!(await pg.evaluate(() => !!document.querySelector('.swipe.open'))), `予定 ${ms}ms：確認で「やめる」のあとは、行が閉じている（今までどおり）`, null);
  ok(await pg.evaluate(() => D().schedules.length) > 0 && await pg.evaluate(n => document.querySelectorAll('.swipe[data-sid]').length === n, n), `予定 ${ms}ms：「やめる」で予定は消えない`, null);
  const row2 = await pg.$('.swipe[data-sid] .swipe-body');
  await swipe(pg, row2);
  await press(pg, await pg.$('.swipe.open [data-scact="edit"]'), ms);
  const ed = await pg.evaluate(() => !document.querySelector('#sheet').hidden && /予定/.test(document.querySelector('#sheet').textContent));
  ok(ed, `予定 ${ms}ms：「編集」を1回押すと編集の画面が出る`, null);
  await ctx.close();
}
// 前からの働き：開いた予定の行の本体を押すと閉じるだけ（操作の画面は出ない）
{
  const { pg, ctx } = await page();
  if (await schedScene(pg)) {
    const row = await pg.$('.swipe[data-sid] .swipe-body');
    await row.scrollIntoViewIfNeeded();
    const rb = await row.boundingBox(); // 閉じているときの行の場所（開くと左にずれる）
    await swipe(pg, row);
    await pg.waitForTimeout(400);
    await pg.mouse.move(rb.x + 20, rb.y + rb.height / 2); await pg.mouse.down(); await pg.waitForTimeout(100); await pg.mouse.up(); await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => ({ open: !!document.querySelector('.swipe[data-sid].open'), sheet: !document.querySelector('#sheet').hidden }));
    ok(!r.open && !r.sheet, '予定：開いた行の本体を押すと、閉じるだけ', r);
    // 閉じた行を押すと、操作の画面が出る
    await pg.waitForTimeout(600);
    await pg.mouse.move(rb.x + 20, rb.y + rb.height / 2); await pg.mouse.down(); await pg.waitForTimeout(100); await pg.mouse.up(); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => !document.querySelector('#sheet').hidden), '予定：閉じた行を押すと、操作の画面が出る', null);
  }
  await ctx.close();
}

console.log(ng ? `\n${ng}件 NG` : '\nすべて OK');
await b.close();
process.exit(ng ? 1 : 0);
