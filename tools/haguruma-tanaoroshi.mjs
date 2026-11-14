#!/usr/bin/env node
/* =====================================================================
   歯車（各自の設定）の棚卸しテスト（2026-11-14）
   ・「今ある設定の部品が、作りかえたあとも全部残っているか」を機械で確かめる
   ・試作モード（GAS のURLなし）で区域マップを開き、歯車の画面の「押せる部品」を条件ごとに集める
   ・目次の形（[data-page] の行がある）なら、最初の画面と分類の画面を全部まわって集める
   使い方（リポジトリのいちばん上で）：
     node tools/haguruma-tanaoroshi.mjs --save tools/haguruma-tanaoroshi-before.json   … 今の形で集めて保存
     node tools/haguruma-tanaoroshi.mjs --check tools/haguruma-tanaoroshi-before.json  … 集めた部品が、保存したものを全部ふくむか（足りなければ終了コード1）
   必要なもの：playwright（npm i playwright）と chromium。ネットにはつながない（地図の画像・文字は止める）
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

// 試作モードにする config（GAS のURLなし）
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.33,127.80],homeZoom:10,ageData:true};";
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// 条件：かんたん／くわしく × 開いたタブ × 言語 × 機能の組 × 人
const MODES = ['simple', 'detail'];
const TABS = ['home', 'cards', 'map', 'reco', 'follow'];
const LANGS = ['ja', 'es'];
const PROFILES = {
  off: { ui: { fTime: 'off', fFollow: 'off', aptName: 'off', fcName: 'off', theme: 'standard', splash: 'off' }, recoOn: 0 },
  // douga：使い方の動画を「用意できた」ことにする（今は動画がまだ無く、行が出ないため。差しこみ口を確かめる）
  on: { ui: { fTime: 'on', fFollow: 'on', aptName: 'on', fcName: 'on', theme: 'custom', custom: '200,70,35', splash: 'on' }, recoOn: 1, douga: true },
  onNoReco: { ui: { fTime: 'on', fFollow: 'on', aptName: 'on', fcName: 'on', theme: 'custom', custom: '200,70,35', splash: 'on' }, recoOn: 0, douga: true }
};
const USERS = ['u1', 'u3']; // 伝道者・区域係（試作のデータ）

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

/* 画面の中で、歯車のシートの押せる部品を集める */
function collectInPage() {
  const S = document.getElementById('sheet'), out = new Set();
  if (!S) return [];
  const add = k => out.add(k);
  S.querySelectorAll('[data-ui][data-v]').forEach(e => add(`ui:${e.dataset.ui}=${e.dataset.v}`));
  S.querySelectorAll('[data-kgui][data-v]').forEach(e => add(`kgui:${e.dataset.kgui}=${e.dataset.v}${e.disabled ? '[disabled]' : ''}`));
  S.querySelectorAll('[data-kilang]').forEach(e => add(`kilang:${e.getAttribute('data-kilang')}`));
  S.querySelectorAll('[data-kimissing]').forEach(() => add('kimissing'));
  S.querySelectorAll('[data-dg-list]').forEach(() => add('dg-list'));
  ['uiPct', 'uiPct100', 'uiSplash', 'uiSplashTry', 'uiLabOp', 'uiLineOp', 'uiLmZ', 'wheel', 'lbar', 'uiReset', 'kgTileClear'].forEach(id => { if (S.querySelector('#' + id)) add('id:' + id); });
  S.querySelectorAll('[data-nz]').forEach(e => add(`nz:${e.dataset.nz}`));
  if (S.querySelector('[data-close]')) add('close');
  if (S.querySelector('.appver')) add('appver');
  // 文字（見出し・項目名・説明・ボタン）：場所が変わっても、文が消えていないかを見る（監査 Minor6）
  const norm = t => t.replace(/\s+/g, ' ').trim();
  S.querySelectorAll('h2,h3,p.q,.featrow b,.featrow small,.hint,summary,button,.nzlabel,.nzends span').forEach(e => {
    if (e.closest('.setcats') || e.matches('[data-uiback]')) return;   // 目次の行と「‹ 設定」は新しい形だけのもの
    const t = norm(e.textContent || '').replace(/\(\d+\)/g, '(n)'); // 「翻訳されていない文字のコピー（39）」の数は、そのときどきで変わる
    if (t && !/版 \d{4}\.\d+\.\d+/.test(t)) add('text:' + t);
  });
  return [...out];
}

async function openAndCollect(page) {
  await page.evaluate(() => { try { closeSheet(); } catch (e) { /* なにもしない */ } openUiSheet(); });
  await page.waitForTimeout(150);
  const all = new Set(await page.evaluate(collectInPage));
  const pages = await page.evaluate(() => [...document.querySelectorAll('#sheet [data-page]')].map(b => b.dataset.page));
  for (const p of pages) {
    await page.evaluate(pg => { const b = document.querySelector(`#sheet [data-page="${pg}"]`); if (b) b.click(); }, p);
    await page.waitForTimeout(120);
    (await page.evaluate(collectInPage)).forEach(k => all.add(k));
    await page.evaluate(() => { const b = document.querySelector('#sheet .btn.back'); if (b) b.click(); });
    await page.waitForTimeout(80);
  }
  // かんたんモードの「機能をふやす」は、たたまれていても部品は中にある（details の中も数える）
  await page.evaluate(() => { try { closeSheet(); } catch (e) { /* なにもしない */ } });
  return { items: [...all].sort(), pages };
}

async function main() {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch();
  const result = {}, errors = [];
  try {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
      await ctx.route(/cyberjapandata|fonts\.googleapis|fonts\.gstatic|script\.google/, r => r.abort());
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(`${lang}: ${String(e && e.message || e).slice(0, 200)}`));
      await page.goto(`http://127.0.0.1:${port}/index.html?lang=${lang}`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof openUiSheet === 'function', null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => { document.querySelectorAll('.splash,#splash').forEach(e => e.remove()); try { closeSheet(); } catch (e) { /* なにもしない */ } });
      for (const user of USERS) {
        for (const [pn, pf] of Object.entries(PROFILES)) {
          for (const mode of MODES) {
            await page.evaluate(([u, p, m]) => {
              D().currentUser = u; D().settings.recoOn = p.recoOn;
              if (window.DOUGA) DOUGA.list.forEach(v => { if (v._r === undefined) v._r = v.ready; v.ready = p.douga ? true : v._r; });
              Object.assign(UI, p.ui, { mode: m }); uiSave(); applyUi(); updateTabs();
            }, [user, pf, mode]);
            for (const tab of TABS) {
              await page.evaluate(t => { try { closeSheet(); } catch (e) { /* なにもしない */ } showView(t); }, tab);
              await page.waitForTimeout(tab === 'map' ? 500 : 120);
              const cur = await page.evaluate(() => currentView);
              const { items, pages } = await openAndCollect(page);
              const key = [lang, user, pn, mode, tab].join('|');
              result[key] = { view: cur, pages, items };
            }
          }
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  const nItems = Object.values(result).reduce((s, r) => s + r.items.length, 0);
  console.log(`集めた条件 ${Object.keys(result).length}・部品 ${nItems}（のべ）・画面のエラー ${errors.length}`);
  errors.slice(0, 10).forEach(e => console.log('  エラー：' + e));
  if (SAVE) {
    fs.writeFileSync(SAVE, JSON.stringify({ made: new Date().toISOString(), conditions: result }, null, 1));
    console.log('保存しました：' + SAVE);
  }
  if (CHECK) {
    const before = JSON.parse(fs.readFileSync(CHECK, 'utf8')).conditions;
    // わざと変えた文字（指示書どおり）：見出し「地図に出す名前」→「建物の名前」、「奉仕の予定」→「ホームに出すもの」の中へ
    const ALLOWED_GONE = new Set(['text:地図に出す名前', 'text:奉仕の予定', 'text:Nombres en el mapa', 'text:Agenda de predicación']);
    const JP = /[\u3040-\u30ff\u4e00-\u9fff]/;
    let miss = 0, ok = 0, added = new Set(), allowed = new Set();
    for (const [k, b] of Object.entries(before)) {
      const a = result[k];
      if (!a) { console.log(`✕ 条件がありません：${k}`); miss++; continue; }
      const have = new Set(a.items);
      // スペイン語で、前は日本語のまま出ていた文が訳されて消えたものも数えない（訳が入っただけ）
      const lost = b.items.filter(x => !have.has(x) && !(ALLOWED_GONE.has(x) && allowed.add(x)) && !(k.startsWith('es|') && x.startsWith('text:') && JP.test(x) && allowed.add(x + '（訳が入った）')));
      if (lost.length) { miss += lost.length; console.log(`✕ ${k}（開いた画面 ${a.view}）で無くなった部品：${lost.join('、')}`); }
      else ok++;
      a.items.filter(x => !b.items.includes(x)).forEach(x => added.add(x));
    }
    console.log(`条件 ${Object.keys(before).length} のうち ${ok} は全部の部品あり。無くなった部品 ${miss}`);
    console.log(`わざと変えた文字（数えない）：${[...allowed].join('、') || 'なし'}`);
    console.log(`新しく増えた部品の種類：${[...added].sort().join('、') || 'なし'}`);
    if (miss || errors.length) { console.log('結果：不合格'); process.exit(1); }
    console.log('結果：合格（今ある部品は全部残っています）');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
