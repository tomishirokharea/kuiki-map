#!/usr/bin/env node
/* =====================================================================
   「区域をもらう」「留守宅カードをえらぶ」の棚卸しテスト（2026-11-17・2026.13.156）
   ・作りかえたあとも、今ある部品（押せるもの）と文字が全部残っているかを機械で確かめる
   ・試作モード（GAS のURLなし）で開き、条件ごとに一覧を開いて「もっと見る」があれば押し、全部の行を出してから集める
   ・条件：言語（ja・es）× かんたん／くわしい × 6つの画面（区域をもらう 個人・グループ奉仕・全体の集まり／留守宅カード 個人・グループ奉仕・全体の集まり）
   使い方（リポジトリのいちばん上で）：
     node tools/morau-tanaoroshi.mjs --save before.json   … 今の形で集めて保存（変更前の版で）
     node tools/morau-tanaoroshi.mjs --check before.json  … 集めたものが、保存したものを全部ふくむか（足りなければ終了コード1）
   必要なもの：playwright と chromium。ネットにはつながない
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

const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const SHEETS = ['req-p', 'req-grp', 'req-all', 'away-p', 'away-grp', 'away-all'];

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

/* 画面の中で：一覧のシートの押せる部品と文字を集める */
function collectInPage() {
  const S = document.getElementById('sheet'), out = new Set();
  if (!S || S.hidden) return [];
  const norm = t => t.replace(/\s+/g, ' ').trim();
  S.querySelectorAll('button, select, a, summary, input').forEach(e => {
    const attrs = [...e.attributes].filter(a => a.name.startsWith('data-') && !/^data-(apeek|t12)$/.test(a.name)).map(a => `${a.name}=${a.value}`).sort().join(',');
    out.add(`ctl:${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}[${attrs}]${e.disabled ? '[disabled]' : ''}:${norm(e.textContent || '')}`);
  });
  S.querySelectorAll('h2, p, .notice, .empty, label > span, .ktag, .stamp').forEach(e => {
    const t = norm(e.textContent || '');
    if (t) out.add('text:' + t);
  });
  return [...out];
}

async function main() {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const result = {}, errors = [];
  try {
    for (const lang of ['ja', 'es']) {
      for (const mode of ['simple', 'detail']) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
        await ctx.route(/cyberjapandata|fonts\.googleapis|fonts\.gstatic|script\.google|open-meteo/, r => r.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${lang}/${mode}: ${String(e && e.message || e).slice(0, 200)}`));
        await page.goto(`http://127.0.0.1:${port}/index.html?lang=${lang}`, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof openRequestSheet === 'function' && typeof openAwayPick === 'function', null, { timeout: 30000 });
        await page.evaluate(m => {
          document.querySelectorAll('.splash,#splash,#hello').forEach(e => e.remove());
          Object.assign(UI, { mode: m, hello: 'off', splash: 'off' }); applyUi();
          // 区域を12枚に（写しを足す）。留守宅カードの候補は決まった形（区域ごとに1枚・平日の朝）
          const base = D().territories.filter(t => !t.dummy && !isSpecial(t) && okPoly(t.polygon));
          for (let i = 0; freeTerrs().length < 12; i++) {
            const c = JSON.parse(JSON.stringify(base[i % base.length]));
            c.id = 'tt' + i; c.no = '8' + i; c.name = '棚卸しの区域' + i; delete c.holder; delete c.lead; delete c.lentAt; delete c.group; c.lend = 'open';
            D().territories.push(c);
          }
          D().territories.forEach(t => { if (!t.holder && !t.dummy) t.lend = 'open'; });
          Store.save();
          const H = D().territories.flatMap(t => housesOf(t.id)).filter(h => h.lat != null);
          window.awaySuggestions = () => freeTerrs().map((t, i) => ({ t, slot: SLOTS[0], keys: [H[i % H.length].id + '|'], focus: false, ext: false, dist: null }));
          renderAll(); showView('cards');
        }, mode);
        for (const sh of SHEETS) {
          await page.evaluate(sh => {
            try { closeSheet(); } catch (e) { /* なにもしない */ }
            const [kind, who] = sh.split('-');
            if (kind === 'req') { openRequestSheet(who !== 'p'); if (who === 'all') document.querySelector('#sheet [data-ruse="all"]').click(); }
            else if (who === 'p') openAwayPick(false);
            else { openRequestSheet(true); if (who === 'all') document.querySelector('#sheet [data-ruse="all"]').click(); document.querySelector('#sheet [data-gaway]').click(); }
          }, sh);
          await page.waitForTimeout(250);
          // 「もっと見る」があれば押して、全部の行を出す（変更後の版。変更前の版のくわしい表示は、もとから全部出ている）
          await page.evaluate(() => { const m = document.querySelector('#reqMore, #apMore'); if (m) m.click(); });
          await page.evaluate(() => { const d = document.querySelector('#sheet details.ksort'); if (d) d.open = true; document.querySelectorAll('#sheet details').forEach(x => { x.open = true; }); });
          await page.waitForTimeout(250);
          result[`${lang}/${mode}/${sh}`] = (await page.evaluate(collectInPage)).sort();
        }
        await ctx.close();
      }
    }
  } finally { await browser.close(); srv.close(); }
  if (SAVE) {
    fs.writeFileSync(SAVE, JSON.stringify(result, null, 1));
    const n = Object.values(result).reduce((s, a) => s + a.length, 0);
    console.log(`保存しました：${Object.keys(result).length}条件・${n}項目 → ${SAVE}`);
  }
  if (CHECK) {
    const before = JSON.parse(fs.readFileSync(CHECK, 'utf8'));
    let miss = 0, conds = 0, items = 0;
    for (const [k, arr] of Object.entries(before)) {
      conds++; items += arr.length;
      const now = new Set(result[k] || []);
      const lost = arr.filter(x => !now.has(x));
      if (lost.length) { miss += lost.length; console.log(`NG  ${k}：無くなったもの ${lost.length}件`); lost.slice(0, 15).forEach(x => console.log('     - ' + x)); }
    }
    console.log(`${conds}条件・${items}項目を確かめました。無くなったもの：${miss}件`);
    if (errors.length) console.log('ページのエラー：\n' + errors.join('\n'));
    process.exit(miss || errors.length ? 1 : 0);
  }
  if (errors.length) { console.log('ページのエラー：\n' + errors.join('\n')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
