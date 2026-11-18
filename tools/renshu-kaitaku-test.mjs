/* 開拓者の練習（?renshu=1&c=kaitaku・2026-11-18）の確かめ。使い方：リポジトリの上で python3 -m http.server 8766 を動かしてから node tools/renshu-kaitaku-test.mjs http://localhost:8766 */
// 開拓者の練習（?renshu=1&c=kaitaku）の確かめ：はじめは ✓ が0、9つのことをすると9つとも ✓ になる。
// ふつうの練習（?renshu=1）は今までどおり（5つ）。サーバーへの通信が1件も起きないこと。
import { chromium } from 'playwright';
import fs from 'fs';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==', 'base64'); // 地図の画像の代わり（1点）
const ROOT = process.argv[2] || 'http://localhost:8766';
const OUT = process.argv[3] || '/tmp/renshu-kaitaku';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) fails++; };

async function open(q, w = 390) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
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
  // 本番と同じ config（サーバーの URL あり）でも、練習ではつながないことを確かめる
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: "window.KUIKI_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec',lang:'ja',homeView:[26.158,127.676],homeZoom:16,ageData:true};" }));
  await pg.goto(ROOT + '/index.html' + q);
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined' && document.querySelector('#homeDouga'));
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); window.ask = async () => true; });
  return { pg, ctx };
}
const done = pg => pg.evaluate(() => { showView('home'); return [...document.querySelectorAll('#homeDouga .dg-steps li')].map(li => li.classList.contains('done')); });

// ---- 開拓者の練習 ----
{
  const { pg, ctx } = await open('?renshu=1&c=kaitaku&m=simple');
  const who = await pg.evaluate(() => ({ name: me().name, leader: !!me().leader, held: D().territories.filter(t => t.holder === me().id).length, reco: D().settings.recoOn, prov: D().houses.filter(h => h.prov).length, bar: document.querySelector('#renshuBar span').textContent }));
  ok(who.name === '開拓者（練習）' && !who.leader && who.held === 0, '使う人は開拓者（練習）・司会者ではない・持っている区域は0 ' + JSON.stringify(who));
  ok(who.reco === 1 && who.prov >= 4, 'おすすめが使え、仮の家がある');
  ok(/開拓者の練習中/.test(who.bar), '上の帯が「開拓者の練習中」');
  let d0 = await done(pg);
  ok(d0.length === 9 && d0.every(x => !x), 'はじめは9つとも未完了 ' + JSON.stringify(d0));
  await pg.screenshot({ path: OUT + '/k_home0.png' });

  // 1. 文字の大きさ（設定の画面のボタンを押す）
  await pg.evaluate(() => openUiSheet()); await pg.waitForTimeout(500);
  const sizeBtn = await pg.$('#sheet button:has-text("大きく")');
  if (sizeBtn) await sizeBtn.click(); else await pg.evaluate(() => { UI.size = 'large'; uiSave(); applyUi(); });
  await pg.waitForTimeout(400);
  // 2. 再訪問を使う・おすすめのタブを出す（機能をふやす）
  await pg.evaluate(() => { const d = document.querySelector('#sheet details.kmore'); if (d) d.open = true; });
  const rows = await pg.$$('#sheet .featrow');
  for (const r of rows) {
    const tx = await r.innerText();
    if (/^再訪問/.test(tx)) { const bt = await r.$('button:has-text("使う")'); if (bt) await bt.click(); }
  }
  await pg.waitForTimeout(300);
  for (const r of await pg.$$('#sheet .featrow')) {
    const tx = await r.innerText();
    if (/おすすめのタブを出す/.test(tx)) { const bt = await r.$('button:has-text("出す")'); if (bt) await bt.click(); }
  }
  await pg.waitForTimeout(400);
  await pg.evaluate(() => closeSheet());
  const st = await pg.evaluate(() => ({ size: UI.size, f: UI.fFollow, reco: !document.querySelector('#tabs button[data-view="reco"]').hidden }));
  ok(st.size !== 'normal' && st.f === 'on' && st.reco, '設定の画面から、文字の大きさ・再訪問・おすすめのタブを変えられた ' + JSON.stringify(st));
  // 3. 区域をもらう（自由に受け取れる区域3）
  await pg.evaluate(() => { showView('cards'); openRequestSheet(); }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: OUT + '/k_request.png' });
  await pg.evaluate(() => takeTerr('t3')); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => terrById('t3').holder === me().id), '区域3を受け取れた');
  // 8. おすすめを見る
  await pg.evaluate(() => showView('reco')); await pg.waitForTimeout(1200);
  await pg.screenshot({ path: OUT + '/k_reco.png' });
  const recoN = await pg.evaluate(() => document.querySelectorAll('.kgc').length);
  console.log('    おすすめの中の項目の数（目安）', recoN);
  await pg.evaluate(() => { showView('cards'); openAwayPick(); }); await pg.waitForTimeout(700);
  await pg.screenshot({ path: OUT + '/k_away.png' });
  const awayN = await pg.evaluate(() => document.querySelectorAll('#sheet [data-atake], #sheet button').length);
  console.log('    留守宅カードの画面のボタン数', awayN);
  await pg.evaluate(() => closeSheet());
  // 4. 記録（会えた・留守）・5. 再訪問
  const hs = await pg.evaluate(() => D().houses.filter(h => h.terrId === 't3' && h.type === 'house' && !h.prov).slice(0, 3).map(h => h.id));
  await pg.evaluate(hs => { saveVisit(hs[0], '', 'met', {}); saveVisit(hs[1], '', 'away', {}); }, hs);
  await pg.waitForTimeout(300);
  await pg.evaluate(hs => addMyFollow(K(hs[0], '')), hs);
  await pg.waitForTimeout(300);
  // 6. 仮の家を消す
  const prov = await pg.evaluate(() => D().houses.find(h => h.prov && h.terrId === 't3').id);
  await pg.evaluate(id => dropProvHouse(id), prov); await pg.waitForTimeout(300);
  ok(await pg.evaluate(id => !houseById(id), prov), '仮の家を消せた（区域3を持っているので）');
  // 7. アパートの部屋を足す（建物の編集の「＋」）
  await pg.evaluate(() => { UI.mode = 'detail'; uiSave(); applyUi(); });
  await pg.evaluate(() => openBuilding('a3_0')); await pg.waitForTimeout(600);
  await pg.screenshot({ path: OUT + '/k_building.png' });
  const plus = await pg.$$('#sheet button');
  let clicked = false;
  for (const bt of plus) { const tx = (await bt.innerText()).trim(); if (tx === '＋' || tx === '+') { await bt.click(); clicked = true; break; } }
  await pg.waitForTimeout(500);
  ok(clicked && await pg.evaluate(() => JSON.parse(lsGet('renshu_k0')).apts['a3_0'] !== houseById('a3_0').units.join(',')), 'アパートの部屋を「＋」で足せた');
  await pg.evaluate(() => closeSheet());
  // 9. 返す
  await pg.evaluate(() => finishTerr('t3', false, true, true)); await pg.waitForTimeout(800);
  const d1 = await done(pg);
  await pg.screenshot({ path: OUT + '/k_home1.png' });
  const fin = await pg.evaluate(() => document.querySelector('#homeDouga').innerText);
  ok(d1.length === 0 && /練習はおしまい/.test(fin), '9つとも ✓ で「練習はおしまい」が出る');
  ok(pg.server.length === 0, 'サーバーへの通信なし（' + pg.server.length + '件）');
  ok(pg.errs.length === 0, 'エラーなし ' + pg.errs.slice(0, 3).join(' | '));
  // 開き直すと、最初から
  await pg.reload(); await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && document.querySelector('#homeDouga')); await pg.waitForTimeout(1200);
  const d2 = await done(pg);
  ok(d2.length === 9 && d2.every(x => !x), '開き直すと、はじめから練習できる');
  await ctx.close();
}
// ---- 受け取ってすぐ返す（ホームを開かずに・記録なし）でも 3 と 9 に ✓（監査 I-1） ----
{
  const { pg, ctx } = await open('?renshu=1&c=kaitaku&m=simple');
  await pg.evaluate(() => showView('cards'));
  await pg.evaluate(() => takeTerr('t3')); await pg.waitForTimeout(600);
  await pg.evaluate(() => finishTerr('t3', false, true, true)); await pg.waitForTimeout(600);
  const d = await done(pg);
  ok(d[2] && d[8], '受け取ってすぐ返しても、3と9に ✓ ' + JSON.stringify(d));
  const st = await pg.evaluate(() => ({ prov: D().houses.filter(h => h.prov).map(h => h.terrId), pool: !!terrById('t4').awayPoolAt, open: poolOpen(terrById('t4')) }));
  ok(st.prov.length === 4 && st.prov.every(x => x === 't3') && st.open, '仮の家は南に4軒・東は開いた留守宅の区域 ' + JSON.stringify(st));
  await ctx.close();
}
// ---- スペイン語の名前 ----
{
  const { pg, ctx } = await open('?renshu=1&c=kaitaku&lang=es');
  ok(await pg.evaluate(() => me().name === 'Precursor (práctica)'), 'スペイン語では使う人の名前も訳す');
  await ctx.close();
}
// ---- ふつうの練習（今までどおり） ----
{
  const { pg, ctx } = await open('?renshu=1&m=simple');
  const w = await pg.evaluate(() => ({ name: me().name, n: document.querySelectorAll('#homeDouga .dg-steps li').length, bar: document.querySelector('#renshuBar span').textContent, prov: D().houses.filter(h => h.prov).length }));
  ok(w.name === '伝道者A' && w.n === 5 && /^練習中です/.test(w.bar) && w.prov === 0, 'ふつうの練習は今までどおり（伝道者A・5つ・帯の文・仮の家なし） ' + JSON.stringify(w));
  ok(pg.server.length === 0 && pg.errs.length === 0, 'ふつうの練習：通信なし・エラーなし');
  await ctx.close();
}
// ---- スペイン語 ----
{
  const { pg, ctx } = await open('?renshu=1&c=kaitaku&lang=es');
  const tx = await pg.evaluate(() => document.querySelector('#renshuBar span').textContent + ' / ' + [...document.querySelectorAll('#homeDouga .dg-steps li')].map(x => x.textContent).join(' | '));
  ok(!/[぀-ヿ]/.test(tx), 'スペイン語：帯と「やってみること」に日本語が残らない ' + tx.slice(0, 160));
  await ctx.close();
}
console.log(fails ? `NG ${fails}` : 'ALL OK');
await b.close();
