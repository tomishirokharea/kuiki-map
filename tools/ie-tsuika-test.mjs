// 使い方：リポジトリの上で python3 -m http.server 8766 を動かしてから  node tools/ie-tsuika-test.mjs http://localhost:8766
// 家を足す：地図が小さいまま押すと大きくなり、もう一度押すと足せる（2026-11-18）
import { chromium } from 'playwright';
import fs from 'fs';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==', 'base64');
const ROOT = process.argv[2] || 'http://localhost:8766';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) fails++; };
async function run(q, take) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', hasTouch: true, isMobile: true });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  const toasts = []; await pg.exposeFunction('__t', s => toasts.push(s));
  await pg.route('**/*', r => { const u = r.request().url();
    if (/script\.google/.test(u)) return r.abort();
    if (/gsi\.go\.jp/.test(u) && /\.(png|jpg)/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TILE });
    if (/gsi\.go\.jp|fonts\.g|open-meteo/.test(u)) return r.abort();
    return r.continue(); });
  await pg.goto(ROOT + '/index.html' + q);
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && document.querySelector('#homeDouga'));
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); window.ask = async () => true;
    const o = window.toast; window.toast = function (m) { try { window.__t(String(m)); } catch (e) {} return o.apply(this, arguments); }; });
  await pg.evaluate(() => { UI.mode = 'detail'; uiSave(); applyUi(); });
  if (take) await pg.evaluate(() => takeTerr('t3'));
  await pg.waitForTimeout(400);
  const tid = await pg.evaluate(() => D().territories.find(t => t.holder === me().id).id);
  await pg.evaluate(t => openTerr(t), tid); await pg.waitForTimeout(1500);
  const z0 = await pg.evaluate(() => map.getZoom());
  await (await pg.$('button:has-text("＋ 家")')).click(); await pg.waitForTimeout(600);
  // 家の印から一番遠い、区域の中の点をさがす
  const ll = await pg.evaluate(t => { const tt = terrById(t); const la = tt.polygon.map(p => p[0]), ln = tt.polygon.map(p => p[1]);
    const hs = D().houses.filter(h => h.terrId === t); let best = null, bd = -1;
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) { const a = Math.min(...la) + (Math.max(...la) - Math.min(...la)) * i / 12, o = Math.min(...ln) + (Math.max(...ln) - Math.min(...ln)) * j / 12;
      const q = map.latLngToContainerPoint(L.latLng(a, o)), r = document.getElementById('map').getBoundingClientRect();
      const el = document.elementFromPoint(r.left + q.x, r.top + q.y); if (!el || !document.getElementById('map').contains(el) || el.closest('.leaflet-control, #addBar, .pin')) continue;
      const d = Math.min(...hs.map(h => Math.hypot(h.lat - a, h.lng - o))); if (d > bd) { bd = d; best = [a, o]; } }
    return best; }, tid);
  const tap = async () => { const p = await pg.evaluate(ll => { const q = map.latLngToContainerPoint(L.latLng(ll[0], ll[1])); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, ll); await pg.mouse.click(p.x, p.y); await pg.waitForTimeout(900); };
  const n0 = await pg.evaluate(() => D().houses.length);
  await tap();
  const z1 = await pg.evaluate(() => map.getZoom()), n1 = await pg.evaluate(() => D().houses.length);
  await tap();
  const n2 = await pg.evaluate(() => D().houses.length);
  
  ok(z0 < 17 && z1 >= 17 && n1 === n0, `${q}：小さい地図で押すと大きくなるだけ（${z0}→${z1}・家 ${n0}→${n1}）`);
  ok(n2 === n0 + 1, `${q}：もう一度押すと家が1軒増える（${n2}）`);
  ok(toasts.some(t => /地図を大きくしました/.test(t)) && toasts.some(t => /一戸建てを追加しました/.test(t)), 'お知らせ：' + toasts.filter(t => /大きく|追加しました/.test(t)).join(' / '));
  ok(!errs.length, 'エラーなし ' + errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await run('?renshu=1&c=kaitaku', true);
await run('?renshu=1', false);
// 区域の外・自分の区域でない所は、今までどおり（大きくしない）
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage();
  await pg.route('**/*', r => { const u = r.request().url(); if (/gsi\.go\.jp|fonts\.g|open-meteo|script\.google/.test(u)) return r.abort(); return r.continue(); });
  await pg.goto(ROOT + '/index.html?renshu=1&c=kaitaku');
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof addAt === 'function'); await pg.waitForTimeout(1000);
  const r = await pg.evaluate(() => { const ts = []; const o = window.toast; window.toast = m => { ts.push(m); }; UI.mode = 'detail'; applyUi();
    const z = map.getZoom(); addAt(L.latLng(26.158, 127.683)); const z2 = map.getZoom(); window.toast = o; return { ts, z, z2 }; });
  ok(r.z === r.z2 && /自分の区域の中にだけ/.test(r.ts.join()), '自分の区域でない所：大きくせずに今までの案内 ' + JSON.stringify(r));
  await ctx.close();
}
console.log(fails ? 'NG ' + fails : 'ALL OK');
await b.close();
