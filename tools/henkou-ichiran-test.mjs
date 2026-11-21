#!/usr/bin/env node
/* =====================================================================
   アップデートのお知らせ・変更の一覧の試験（2026.13.174・2026-11-21）
   ・起動時のお知らせは news:1 の印がある変更だけ（R1・R2）
   ・設定のいちばん下の版を押すと「変更の一覧」（R3〜R5）。スペイン語（R6）
   使い方（リポジトリのいちばん上で）：node tools/henkou-ichiran-test.mjs
   必要なもの：playwright と chromium。試作モード（GAS のURLなし）で、ネットにはつながない
   ===================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VER = '2026.13.174';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.33,127.80],homeZoom:10,ageData:true};";
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
// 係向けだけの変更（2026.13.172・role:'admin'）と、みんなへの変更（2026.13.173）の文の一部
const ADMIN_TXT = '登録済みのスマホ（共通QR';
const ALL_TXT = '奉仕時間・日ごとの計画';

let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };

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

async function open(browser, port, lang, errs) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.route(/cyberjapandata|fonts\.googleapis|fonts\.gstatic|script\.google|open-meteo/, r => r.abort());
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`${lang}: ${String(e && e.message || e).slice(0, 200)}`));
  await pg.goto(`http://127.0.0.1:${port}/index.html?lang=${lang}`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof openUiSheet === 'function' && typeof showNewsIfAny === 'function', null, { timeout: 30000 });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => {
    document.querySelectorAll('.splash,#splash').forEach(e => e.remove());
    const n = document.getElementById('news'); if (n) n.hidden = true;
    const h = document.getElementById('hello'); if (h) h.hidden = true;
    UI.hello = 'off'; try { closeSheet(); } catch (e) { /* なにもしない */ }
  });
  return { ctx, pg };
}

// 歯車を開いて版のボタンを押し、変更の一覧の様子を返す
async function openList(pg, mode, user) {
  return pg.evaluate(async ([m, u]) => {
    D().currentUser = u; UI.mode = m; uiSave(); applyUi(); updateTabs();
    try { closeSheet(); } catch (e) { /* なにもしない */ }
    openUiSheet();
    await new Promise(r => setTimeout(r, 150));
    const b = document.querySelector('#sheet .appver');
    const r = { isButton: !!b && b.tagName === 'BUTTON', h: b ? Math.round(b.getBoundingClientRect().height) : 0, admin: isAdmin() };
    if (b) b.click();
    await new Promise(res => setTimeout(res, 400));
    const t = document.getElementById('sheetTitle');
    r.title = t ? t.textContent.trim() : '';
    r.vers = [...document.querySelectorAll('#sheet .cl-ver')].map(e => e.textContent.trim());
    r.text = (document.getElementById('sheet') || {}).textContent || '';
    const nums = r.vers.map(s => (s.match(/\d{4}\.\d+\.\d+/) || [''])[0]);
    r.sorted = nums.every((v, i) => i === 0 || verCmp(nums[i - 1], v) > 0);
    r.dup = new Set(nums).size !== nums.length;
    return r;
  }, [mode, user]);
}

async function main() {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const errs = [];
  try {
    const { ctx, pg } = await open(browser, port, 'ja', errs);

    // N1：前に見た版が 13.170 で、それより新しい変更に印が無い → お知らせを出さない
    const n1 = await pg.evaluate(() => {
      lsSet(SEEN_VER, '2026.13.170');
      let called = false;
      showNewsIfAny(() => { called = true; });
      const el = document.getElementById('news');
      const r = { shown: !el.hidden, called };
      el.hidden = true;
      return r;
    });
    ok(!n1.shown && n1.called, 'N1 印の無い変更だけなら、起動時のお知らせを出さずに次へ進む', n1);

    // N2：印（news:1）のある変更だけを出す
    const n2 = await pg.evaluate(([ALL]) => {
      CHANGELOG.unshift({ v: '2026.13.999', news: 1, items: [['試', '大きな変更の試験']] });
      lsSet(SEEN_VER, '2026.13.170');
      showNewsIfAny(() => {});
      const el = document.getElementById('news');
      const r = { shown: !el.hidden, big: el.textContent.includes('大きな変更の試験'), small: el.textContent.includes(ALL), n: el.querySelectorAll('.newslist li').length };
      el.hidden = true;
      CHANGELOG.shift();
      return r;
    }, [ALL_TXT]);
    ok(n2.shown && n2.big && !n2.small && n2.n === 1, 'N2 news:1 の変更だけをお知らせに出す（印の無い 13.171〜は出さない）', n2);

    // V6：読み上げでも版の番号と「変更の一覧を見る」の両方が伝わる（aria-label で版の番号を消さない）
    await pg.evaluate(() => { UI.mode = 'detail'; applyUi(); try { closeSheet(); } catch (e) { /* なにもしない */ } openUiSheet(); });
    await pg.waitForTimeout(150);
    const v6 = await pg.getByRole('button', { name: /区域マップ 版 2026\.13\.174.*変更の一覧を見る/ }).count();
    ok(v6 === 1, 'V6 版のボタンの読み上げに、版の番号と「変更の一覧を見る」の両方が入る', v6);
    await pg.evaluate(() => { try { closeSheet(); } catch (e) { /* なにもしない */ } });

    for (const mode of ['simple', 'detail']) {
      // V1：版を押すと変更の一覧（かんたんでも最初の画面にもどらない）
      const a = await openList(pg, mode, 'u1');
      ok(a.isButton && a.h >= 44, `V1 ${mode}：版の行は押せるボタンで、高さ44px以上`, { isButton: a.isButton, h: a.h });
      ok(a.title === '変更の一覧', `V1 ${mode}：押すと「変更の一覧」の画面になる`, a.title);
      ok(a.vers[0] === '版 ' + VER && a.vers.length > 50, `V1 ${mode}：いちばん上が「版 ${VER}」で、これまでの版が並ぶ`, a.vers.slice(0, 3).concat(['…' + a.vers.length]));
      ok(a.sorted && !a.dup, `V1 ${mode}：版の新しい順で、同じ版は1つにまとまる（ほかのファイルが足した変更も）`, { sorted: a.sorted, dup: a.dup });
      // V2：係向けの変更は係だけ
      ok(!a.admin && a.text.includes(ALL_TXT) && !a.text.includes(ADMIN_TXT), `V2 ${mode}：伝道者には係向けの変更を出さない（みんなへの変更は出す）`, { admin: a.admin, all: a.text.includes(ALL_TXT), adm: a.text.includes(ADMIN_TXT) });
      const b = await openList(pg, mode, 'u3');
      ok(b.admin && b.text.includes(ADMIN_TXT), `V2 ${mode}：区域係には係向けの変更も出す`, { admin: b.admin, adm: b.text.includes(ADMIN_TXT) });
      // V3：「‹ 設定」で最初の画面にもどり、版のボタンにフォーカス
      const c = await pg.evaluate(async () => {
        const back = document.querySelector('#sheet [data-uiback]');
        if (!back) return { back: false };
        back.click();
        await new Promise(r => setTimeout(r, 200));
        const t = document.getElementById('sheetTitle');
        return { back: true, title: t ? t.textContent.trim() : '', focus: !!(document.activeElement && document.activeElement.matches('.appver')) };
      });
      ok(c.back && c.title === '設定' && c.focus, `V3 ${mode}：「‹ 設定」で設定の最初にもどり、版のボタンにフォーカス`, c);
      await pg.evaluate(() => { D().currentUser = 'u1'; try { closeSheet(); } catch (e) { /* なにもしない */ } });
    }
    await ctx.close();

    // V4：スペイン語
    const es = await open(browser, port, 'es', errs);
    const e = await openList(es.pg, 'detail', 'u1');
    await es.pg.waitForTimeout(300);
    const e2 = await es.pg.evaluate(() => ({
      title: (document.getElementById('sheetTitle') || {}).textContent.trim(),
      first: ((document.querySelector('#sheet .cl-ver') || {}).textContent || '').trim()
    }));
    ok(e2.title === 'Lista de cambios' && e2.first === 'Versión ' + VER, 'V4 スペイン語：見出しと版が訳される', e2);
    await es.ctx.close();
  } finally { await browser.close(); srv.close(); }

  ok(errs.length === 0, 'V5 画面のエラーが無い', errs.slice(0, 5));
  console.log(ng ? `結果：不合格（NG ${ng}）` : '結果：合格');
  process.exit(ng ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
