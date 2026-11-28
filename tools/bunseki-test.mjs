#!/usr/bin/env node
/* =====================================================================
   区域係の「分析用に書き出す」（bunseki.js・2026.13.178・2026-11-28）の試験
   B1 係・状況タブでだけボタンが出る／B2 名前・よみ・住所（家の label）・注意の文が出ない
   B3 全体の時間帯の数が、記録から別に数えた数と一致／B4 区域カード・留守宅カードの合計がグラフ（JG）と一致
   B5 区域の決まりの今の値と「変えると」／B6 スペイン語でボタン・画面が訳される・画面のエラーなし
   B7 記録が0件でもエラーにならない／B8 CSV の囲み（カンマ・改行・"）
   使い方（リポジトリのいちばん上で）：node tools/bunseki-test.mjs
   必要なもの：playwright と chromium。試作モード（GAS のURLなし）で、ネットにはつながない
   ===================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.33,127.80],homeZoom:10,ageData:true};";
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

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
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof renderAdmin === 'function' && window.KM && window.JGUI, null, { timeout: 30000 });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => {
    document.querySelectorAll('.splash,#splash').forEach(e => e.remove());
    const n = document.getElementById('news'); if (n) n.hidden = true;
    const h = document.getElementById('hello'); if (h) h.hidden = true;
    UI.hello = 'off'; try { closeSheet(); } catch (e) { /* なにもしない */ }
  });
  return { ctx, pg };
}

// その人・そのタブで、上の帯にボタンがあるか
const btnIn = (pg, uid, pane) => pg.evaluate(([u, p]) => {
  D().currentUser = u; showView('admin'); setAdPane(p); renderAdmin();
  const b = document.querySelector('#adTopBar [data-bunseki]');
  return !!(b && b.offsetParent !== null);
}, [uid, pane]);

async function main() {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch();
  const errs = [];
  try {
    const { ctx, pg } = await open(browser, port, 'ja', errs);
    const admin = await pg.evaluate(() => (D().users.find(u => u.role === 'admin') || {}).id);
    const pub = await pg.evaluate(() => (D().users.find(u => u.role !== 'admin') || {}).id);
    ok(await btnIn(pg, admin, 'status'), 'B1 区域係・状況タブ：ボタンが出る');
    ok(!(await btnIn(pg, admin, 'inbox')), 'B1 区域係・今日タブ：出ない');
    ok(!(await btnIn(pg, admin, 'set')), 'B1 区域係・設定タブ：出ない');
    ok(!(await btnIn(pg, pub, 'status')), 'B1 伝道者：出ない');
    await btnIn(pg, admin, 'status');

    // 押すと下から画面が出る
    const sheet = await pg.evaluate(async () => {
      document.querySelector('#adTopBar [data-bunseki]').click();
      await new Promise(r => setTimeout(r, 200));
      const s = document.getElementById('sheet');
      return { title: (document.getElementById('sheetTitle') || {}).textContent || '', save: !!s.querySelector('[data-bk-save]'), copy: !!s.querySelector('[data-bk-copy]'), per: s.querySelectorAll('[data-bk-per]').length };
    });
    ok(sheet.title.includes('分析用に書き出す') && sheet.save && sheet.copy && sheet.per === 2, 'B1 押すと画面（期間2つ・保存・コピー）', sheet);

    const t12 = await pg.evaluate(() => BUNSEKI.text(12));
    const t4 = await pg.evaluate(() => BUNSEKI.text(4));
    // B2 名前・よみ・住所・注意の文が出ない
    const bad = await pg.evaluate(txt => {
      const d = D(), words = [];
      (d.users || []).forEach(u => { if (u.name) words.push(u.name); if (u.yomi) words.push(u.yomi); });
      (d.houses || []).forEach(h => { if (h.label && String(h.label).length >= 3) words.push(String(h.label)); });
      Object.values(d.caution || {}).forEach(c => { const s = c && (c.n || c.text || c.note); if (s && String(s).length >= 3) words.push(String(s)); });
      return [...new Set(words)].filter(w => txt.includes(w));
    }, t12);
    ok(bad.length === 0, 'B2 名前・よみ・住所・注意の文が入っていない', bad.slice(0, 5));
    ok(!/\bu\d+\b/.test(t12), 'B2 人の番号（u1 など）も入っていない');

    // B3 全体の時間帯の表：記録から別に数えた数と一致（12か月前の月初から・区域の家・特別区域を除く・祝日は日曜）
    const b3 = await pg.evaluate(() => {
      const now = new Date(), cut = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime();
      const ok = new Set(D().territories.filter(t => !t.dummy && !isSpecial(t)).map(t => t.id));
      const hm = new Map(D().houses.map(h => [h.id, h]));
      const pad = n => String(n).padStart(2, '0');
      const c = {};
      D().visits.forEach(v => {
        const d = new Date(v.at), h = hm.get(v.houseId);
        if (!h || !ok.has(h.terrId) || isNaN(d) || d.getTime() < cut || d.getTime() > now.getTime() + 60000) return;
        const w = d.getDay(), ymdS = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const col = w === 0 ? '日曜' : w === 6 ? '土曜' : (holidayOf(ymdS) ? '日曜' : '平日');
        const k = col + ',' + bandOf(d);
        c[k] = c[k] || [0, 0]; c[k][0]++; if (v.result === 'met' || v.result === 'refused') c[k][1]++;
      });
      return c;
    });
    const sec = (txt, head) => { const i = txt.indexOf(head); if (i < 0) return ''; const j = txt.indexOf('\n## ', i + 1); return txt.slice(i, j < 0 ? undefined : j); };
    const allSlot = sec(t12, '## 4.');
    const mism = Object.entries(b3).filter(([k, [n, m]]) => !allSlot.includes(`${k},${n},${m},`));
    ok(Object.keys(b3).length > 0 && mism.length === 0, 'B3 全体の時間帯の数が記録と一致', mism.slice(0, 3));
    ok(t4.includes('直近4か月') && t12.includes('直近12か月'), 'B3 期間が書かれる');

    // B4 区域カード・留守宅カードの合計：グラフ（JG）と同じ
    const b4 = await pg.evaluate(() => {
      const inp = JGUI.inputs(); inp.terr = true;
      const now = new Date(), from = JG.ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1));
      inp.from = from; const r = JG.build(inp);
      const rows = JG.detail(r, { from, to: r.today });
      const s = { area: [0, 0], card: [0, 0] };
      rows.forEach(x => ['area', 'card'].forEach(c => { const t = x[c]; s[c][0] += t.met + t.refused + t.away; s[c][1] += t.met; }));
      return s;
    });
    const jg = sec(t12, '## 6.');
    ok(jg.includes(`区域カード,${b4.area[0]},${b4.area[1]},`) && jg.includes(`留守宅カード,${b4.card[0]},${b4.card[1]},`), 'B4 区域カード・留守宅カードの合計がグラフと一致', { b4, jg: jg.slice(0, 300) });

    // B5 区域の決まり
    const b5 = await pg.evaluate(() => ({ lendDays: Number(D().settings.lendDays) || 120, t: KUIKI_HELP.ja.lendDays.t, ch: KUIKI_HELP.ja.lendDays.change }));
    const st = sec(t12, '## 10.');
    ok(st.includes(`${b5.t},lendDays,${b5.lendDays},`) && st.includes(b5.ch.slice(0, 15)), 'B5 区域の決まり：今の値と「変えると」', st.slice(0, 300));
    ok(!st.includes('syncGroupSec') && !st.includes('cacheDays'), 'B5 通信・表示だけの設定は出さない');

    // AI への頼み方が先頭に
    ok(t12.indexOf('## 1.') >= 0 && t12.indexOf('推定') > 0 && t12.indexOf('推定') < t12.indexOf('## 2.'), 'AI への頼み方が先頭にある');

    // F1 家・部屋が10軒未満の区域：区域ごとの時間帯・カード・まだ会えていない割合を出さない（画面と同じ決まり・監査 I-1）
    const f1 = await pg.evaluate(() => {
      const t = KM.eligible().slice().sort((a, b) => String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }))[0];
      const keep = KM.karteHomes; KM.karteHomes = x => (x && x.id === t.id ? 3 : keep(x));
      try { return { no: String(t.no), txt: BUNSEKI.text(12) }; } finally { KM.karteHomes = keep; }
    });
    const rowsOf = (txt, head) => sec(txt, head).split('\n').filter(l => l.split(',')[0] === f1.no);
    ok(rowsOf(f1.txt, '## 5.').length === 0, 'F1 10軒未満の区域：区域ごとの時間帯を出さない', rowsOf(f1.txt, '## 5.').slice(0, 2));
    ok(rowsOf(f1.txt, '## 6.').length === 0, 'F1 10軒未満の区域：区域ごとのカードの数を出さない', rowsOf(f1.txt, '## 6.'));
    const r6 = rowsOf(f1.txt, '## 7.')[0] || '';
    ok(r6.includes('10軒未満のため出さない') && r6.split(',')[9] === '', 'F1 10軒未満の区域：区域の一覧の割合は空', r6);
    const c5 = t => sec(t, '## 4.').split('\n').map(l => l.split(',').slice(0, 5).join(',')).join('\n'); // 右の「5件以上の行だけ」の3列は、区域ごとの行から数えるので変わってよい
    ok(c5(f1.txt) === c5(t12), 'F1 全体の時間帯（4章）には足したまま');
    // F2 一度も訪ねていない区域の「まだ会えていない割合」は 0 ではなく空（監査 m-2）
    const f2 = await pg.evaluate(() => {
      const t = KM.eligible()[0], hs = new Set(D().houses.filter(h => h.terrId === t.id).map(h => h.id));
      const keep = D().visits; D().visits = keep.filter(v => !hs.has(v.houseId)); KM.memoClear();
      try { return { no: String(t.no), txt: BUNSEKI.text(12) }; } finally { D().visits = keep; KM.memoClear(); }
    });
    const r2 = sec(f2.txt, '## 7.').split('\n').find(l => l.split(',')[0] === f2.no) || '';
    ok(r2 && r2.split(',')[9] === '', 'F2 訪ねていない区域の割合は空', r2);
    // F3 返却の日付は日本の日付（UTC の夜＝日本の翌朝）（監査 m-3）
    const f3 = await pg.evaluate(() => {
      const t = KM.eligible()[0];
      const r = { id: 'xtest', terrId: t.id, by: 'u1', lentAt: '2026-11-01T16:30:00.000Z', at: '2026-11-10T20:00:00.000Z', completed: true, pct: 95 };
      D().returns.push(r);
      try { return { no: String(t.no), txt: BUNSEKI.text(12) }; } finally { D().returns.splice(D().returns.indexOf(r), 1); }
    });
    ok(sec(f3.txt, '## 9.').includes(`${f3.no},2026-11-02,2026-11-11,9,正式な返却,95,個人`), 'F3 返却の日付は日本の日付', sec(f3.txt, '## 9.').slice(0, 300));

    // W1 AI への出力の型（分かりやすい結果のため・2026-11-28）
    const p1 = sec(t12, '## 1.');
    ok(['ひと目で', '今の様子', '課題', '決まりの提案', '今月やること', 'このデータで分からないこと'].every(w => p1.includes(w)), 'W1 AI への頼み方に、答えの型（見出し）がある', p1.slice(0, 200));
    // W2・W5 要点（アプリが数えた数）：状態ごとの数が区域の一覧と合う・留守宅カードの区域の数
    const lst = sec(t12, '## 7.').split('\n').slice(1).filter(l => l && l.indexOf('区域,') !== 0).map(l => l.split(','));
    const cnt = w => lst.filter(r => r[3] === w).length;
    const kp = sec(t12, '## 3.');
    ok(kp.includes(`区域の数,${lst.length}`) && kp.includes(`貸出中,${cnt('貸出中') + cnt('貸出中（紙）')}`) && kp.includes(`空き,${cnt('空き')}`) && kp.includes(`留守宅カードの区域,${cnt('留守宅カード')}`), 'W2 要点の数が区域の一覧と合う', kp.slice(0, 400));
    const over = lst.filter(r => r[7] !== '' && Number(r[7]) < 0).length, near = lst.filter(r => r[7] !== '' && Number(r[7]) >= 0 && Number(r[7]) <= 60).length;
    ok(kp.includes(`年1回の期限を過ぎた区域,${over}`) && kp.includes(`年1回の期限まで60日以内の区域,${near}`), 'W2 年1回の期限の数', kp);
    // W3 全体の時間帯に「区域ごとに訪問5件以上の行だけ」の数（5章の行の合計と同じ）
    const p5 = sec(t12, '## 5.').split('\n').slice(2).filter(Boolean).map(l => l.split(','));
    const big = {};
    p5.forEach(r => { const n = Number(r[3]), mm = Number(r[4]); if (n >= 5) { const k = r[1] + ',' + r[2]; big[k] = big[k] || [0, 0]; big[k][0] += n; big[k][1] += mm; } });
    const p4 = sec(t12, '## 4.');
    const badBig = Object.entries(big).filter(([k, [n, mm]]) => !p4.split('\n').some(l => l.indexOf(k + ',') === 0 && l.endsWith(`,${n},${mm},${n >= 5 ? Math.round(mm / n * 100) : '参考'}`)));
    ok(p4.includes('5件以上の行だけ') && Object.keys(big).length > 0 && badBig.length === 0, 'W3 全体の時間帯に5件以上の行だけの数', badBig.slice(0, 3));
    // W4 親番号ごとのまとめ
    const p8 = sec(t12, '## 8.');
    const parents = new Set(lst.map(r => r[1] || r[0]));
    ok([...parents].every(x => p8.split('\n').some(l => l.indexOf(x + ',') === 0)), 'W4 親番号ごとのまとめに、すべての親番号がある', p8.slice(0, 200));

    // B8 CSV の囲み
    const b8 = await pg.evaluate(() => BUNSEKI.csv([['a,b', 'c"d', 'e\nf', 3]]));
    ok(b8 === '"a,b","c""d",e f,3', 'B8 CSV の囲み', b8);

    // 保存（ファイル）：共有の画面が無い端末では、ファイルで保存される
    // （この試験の Chrome は日本語のファイル名を「download」にしてしまうので、リンクに付けた名前と中身を見る）
    const sv = await pg.evaluate(async () => {
      const got = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { got.push({ name: this.download, blob: this.href.indexOf('blob:') === 0 }); };
      try { delete navigator.share; } catch (e) { /* なにもしない */ }
      navigator.canShare = undefined;
      try { const bt = document.querySelector('#sheet [data-bk-save]'); bt.click(); bt.click(); await new Promise(r => setTimeout(r, 300)); } finally { // 2回続けて押しても1回だけ（監査 m-5）
        HTMLAnchorElement.prototype.click = orig; }
      return got;
    });
    ok(sv.length === 1 && sv[0].blob && /^区域分析_\d{8}\.txt$/.test(sv[0].name), '保存：区域分析_YYYYMMDD.txt', sv);

    // B7 記録が0件
    // （時間帯の表の覚えた結果を捨てて数え直す。グラフは家ごとの索引から数えるので、ここでは時間帯の表だけを見る）
    const b7 = await pg.evaluate(() => { const keep = D().visits; D().visits = []; KM.memoClear(); try { return BUNSEKI.text(12); } finally { D().visits = keep; KM.memoClear(); } });
    ok(typeof b7 === 'string' && sec(b7, '## 4.').includes('記録なし') && sec(b7, '## 5.').includes('記録なし'), 'B7 記録が0件でもエラーにならず「記録なし」', sec(b7 || '', '## 4.'));
    await ctx.close();

    // B6 スペイン語
    const e2 = await open(browser, port, 'es', errs);
    await btnIn(e2.pg, admin, 'status');
    const es = await e2.pg.evaluate(async () => {
      const b = document.querySelector('#adTopBar [data-bunseki]');
      const label = b ? b.textContent : '';
      if (b) b.click();
      await new Promise(r => setTimeout(r, 300));
      return { label, title: (document.getElementById('sheetTitle') || {}).textContent || '' };
    });
    ok(es.label && !/[ぁ-んァ-ン]/.test(es.label) && es.title && !/[ぁ-んァ-ン]/.test(es.title), 'B6 スペイン語：ボタンと見出しが訳される', es);
    await e2.ctx.close();
    ok(errs.length === 0, 'B6 画面のエラーが無い', errs);
  } finally {
    await browser.close(); srv.close();
  }
  console.log(ng ? `結果：不合格 ${ng}件` : '結果：合格');
  process.exit(ng ? 1 : 0);
}
main();
