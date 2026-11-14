#!/usr/bin/env node
/* =====================================================================
   現在地ボタン・地図を回す機能の「今の動き」を記録して、作りかえたあとも同じかを確かめる（2026-11-14）
   ・試作モード（GAS のURLなし）・位置はテスト用の場所に固定・ネットにはつながない
   使い方（リポジトリのいちばん上で）：
     node tools/genzaichi-kiroku.mjs --save tools/genzaichi-kiroku-before.json   … 今の動きを記録
     node tools/genzaichi-kiroku.mjs --check tools/genzaichi-kiroku-before.json  … 記録と同じか（ちがえば終了コード1）
   ・記録にある項目は、すべて同じ値でなければ不合格。新しく増えた項目（新しい機能の確かめ）は数えない
   ===================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SAVE = opt('--save'), CHECK = opt('--check');
if (!SAVE && !CHECK) { console.error('--save ファイル か --check ファイル をつけてください'); process.exit(2); }
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.33,127.80],homeZoom:10,ageData:true};";
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const HERE = { latitude: 26.1612, longitude: 127.6758, accuracy: 20 }; // 試作の区域（豊見城）の中

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (u.endsWith('/config.js')) { rsp.writeHead(200, { 'content-type': 'application/javascript' }); return rsp.end(CFG); }
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const r6 = v => Math.round(v * 1e5) / 1e5;

async function open(browser, port, { geo = true, mode = 'detail', touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    geolocation: geo ? HERE : undefined, permissions: geo ? ['geolocation'] : [], hasTouch: touch });
  await ctx.route(/cyberjapandata|fonts\.googleapis|fonts\.gstatic|script\.google/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e && e.message || e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof map !== 'undefined' && map, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(m => {
    document.querySelectorAll('.splash,#splash').forEach(e => e.remove());
    const h = document.getElementById('hello'); if (h) h.style.display = 'none';
    try { closeSheet(); } catch (e) { /* なにもしない */ }
    UI.mode = m; UI.mapRot = 'on'; uiSave(); applyUi(); showView('map');
    map.setView([26.17, 127.70], 15, { animate: false });
  }, mode);
  await page.waitForTimeout(500);
  return { ctx, page };
}
const st = page => page.evaluate(() => {
  const b = document.getElementById('btnLocate'), n = document.getElementById('btnNorth'), c = map.getCenter();
  return {
    myPos: myPos ? myPos.map(v => Math.round(v * 1e5) / 1e5) : null, center: [Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5],
    zoom: map.getZoom(), btnOn: b.classList.contains('on'), btnBusy: b.classList.contains('busy'), btnHidden: b.hidden,
    posLayers: posMarker ? posMarker.getLayers().filter(l => l instanceof L.CircleMarker || l instanceof L.Circle).length : 0,
    mapDeg: Math.round(mapDeg * 10) / 10, northHidden: n ? n.hidden : null
  };
});

async function main() {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch();
  const rec = {}, errors = [];
  try {
    for (const mode of ['detail', 'simple']) {
      // 1回目に押す：現在地へ（拡大18以上）・ボタンが青
      let { ctx, page } = await open(browser, port, { mode });
      rec[`${mode}.before`] = await st(page);
      await page.click('#btnLocate'); await page.waitForTimeout(800);
      rec[`${mode}.tap1`] = await st(page);
      // 地図を指で動かすと、青い表示をやめる
      await page.evaluate(() => map.fire('dragstart')); await page.waitForTimeout(100);
      rec[`${mode}.drag`] = await st(page);
      // もう一度押す（動かしたあと）：現在地へもどる
      await page.evaluate(() => map.setView([26.17, 127.70], 15, { animate: false })); await page.waitForTimeout(300);
      await page.click('#btnLocate'); await page.waitForTimeout(800);
      rec[`${mode}.tapAgain`] = await st(page);
      // 線引きなどのとき（normal 以外）はボタンを隠す
      await page.evaluate(() => setMode('draw')); await page.waitForTimeout(100);
      rec[`${mode}.drawMode`] = { btnHidden: (await st(page)).btnHidden };
      await page.evaluate(() => setMode('normal')); await page.waitForTimeout(100);
      rec[`${mode}.normalMode`] = { btnHidden: (await st(page)).btnHidden };
      // 地図を回す：くわしいモードは回せて「北」で北にもどる。かんたんモードは回さない
      rec[`${mode}.rotAllowed`] = await page.evaluate(() => rotAllowed());
      await page.evaluate(() => { if (rotAllowed()) setMapDeg(40); }); await page.waitForTimeout(100);
      rec[`${mode}.rotated`] = { mapDeg: (await st(page)).mapDeg, northHidden: (await st(page)).northHidden };
      if (mode === 'detail') { await page.click('#btnNorth'); await page.waitForTimeout(600); rec[`${mode}.north`] = { mapDeg: (await st(page)).mapDeg, northHidden: (await st(page)).northHidden }; }
      // 設定で「回さない」にすると北にもどる
      await page.evaluate(() => { if (rotAllowed()) setMapDeg(30); UI.mapRot = 'off'; applyRotSetting(); }); await page.waitForTimeout(100);
      rec[`${mode}.rotOff`] = { mapDeg: (await st(page)).mapDeg };
      // ほかの画面からの locate（区域をもらうの「近い順」など）：あとの処理を呼ぶ
      rec[`${mode}.locateCb`] = await page.evaluate(() => new Promise(res => { let called = false; locate(() => { called = true; }); setTimeout(() => res({ called, myPos: myPos ? myPos.map(v => Math.round(v * 1e5) / 1e5) : null }), 1500); }));
      // 向きモード（2026.13.146 から）：青いときにもう一度押す → 東を向く → 指で動かす
      const hasHead = await page.evaluate(() => typeof HEAD !== 'undefined');
      if (hasHead) {
        const orient = h => page.evaluate(hh => { for (let i = 0; i < 30; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: (360 - hh) % 360, beta: 10, gamma: 0, absolute: true })); }, h);
        const hs = () => page.evaluate(() => { const b = document.getElementById('btnLocate'), sp = HEAD.cone && HEAD.cone.getElement() && HEAD.cone.getElement().firstElementChild;
          return { on: HEAD.on, head: b.classList.contains('head'), btnOn: b.classList.contains('on'), deg: Math.round(mapDeg), cone: sp ? Math.round(parseFloat(sp.style.transform.replace('rotate(', ''))) : null }; });
        await page.evaluate(() => { UI.mapRot = 'on'; uiSave(); setMapDeg(0); map.fire('dragstart'); map.setView([26.17, 127.70], 15, { animate: false }); }); // ボタンの青をいったん消す
        await page.click('#btnLocate'); await page.waitForTimeout(700);
        await page.click('#btnLocate'); await page.waitForTimeout(300);
        await orient(90); await page.waitForTimeout(250);
        rec[`${mode}.head.east`] = await hs();
        await page.evaluate(() => map.fire('dragstart')); await page.waitForTimeout(150);
        rec[`${mode}.head.drag`] = await hs();
      }
      errors.push(...page.errs.map(e => mode + ': ' + e));
      await ctx.close();
      // 位置を使えないとき：お知らせを出し、ボタンを元にもどす
      ({ ctx, page } = await open(browser, port, { mode, geo: false }));
      await page.click('#btnLocate'); await page.waitForTimeout(1500);
      const s = await st(page);
      rec[`${mode}.denied`] = { btnOn: s.btnOn, btnBusy: s.btnBusy, myPos: s.myPos, toast: await page.evaluate(() => { const t = document.getElementById('toast'); return t ? t.textContent.replace('×', '').trim() : ''; }) };
      errors.push(...page.errs.map(e => mode + ': ' + e));
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`記録した項目 ${Object.keys(rec).length}・画面のエラー ${errors.length}`);
  errors.slice(0, 10).forEach(e => console.log('  エラー：' + e));
  if (SAVE) { fs.writeFileSync(SAVE, JSON.stringify({ made: new Date().toISOString(), rec }, null, 1)); console.log('保存しました：' + SAVE); }
  if (CHECK) {
    const before = JSON.parse(fs.readFileSync(CHECK, 'utf8')).rec;
    let bad = 0;
    for (const [k, v] of Object.entries(before)) {
      const a = rec[k];
      const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const diff = a === undefined ? ['（項目がない）'] : typeof v === 'object' && v ? Object.keys(v).filter(f => !same(v[f], a[f])).map(f => `${f}: ${JSON.stringify(v[f])} → ${JSON.stringify(a[f])}`) : same(v, a) ? [] : [`${JSON.stringify(v)} → ${JSON.stringify(a)}`];
      if (diff.length) { bad++; console.log(`✕ ${k}：${diff.join('、')}`); }
    }
    console.log(`記録 ${Object.keys(before).length} 項目のうち ${Object.keys(before).length - bad} 項目が同じ`);
    if (bad || errors.length) { console.log('結果：不合格'); process.exit(1); }
    console.log('結果：合格（今までの動きは変わっていません）');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
