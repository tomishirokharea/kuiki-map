// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/nakama-test.mjs [ポート]
// 2026.13.152：えらばれた人が「今日いっしょに回る人」を見られる部品 fellowsOf・fellowsHtml の試験
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };
const ctx = await b.newContext({ viewport: { width: 820, height: 1180 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
await pg.goto(`http://localhost:${port}/index.html`);
await pg.waitForFunction(() => typeof openTarget === 'function' && typeof Store !== 'undefined' && Store.data);

/* 場面：区域 t（グループ・担当 H）に、自分と人 A,B,... を helpers で入れる。opt.names：A..の名前、opt.extra：人数、opt.mut(t, ids)：あとで直す */
const run = (opt, fn) => pg.evaluate(([opt, src]) => {
  const D_ = D(), my = me().id, DAY = 864e5;
  const mk = (id, name) => { let u = userById(id); if (!u) { u = { id, name }; D_.users.push(u); } u.name = name; return id; };
  const H = mk('u_H', 'ハナ'), L = mk('u_L', 'レオ');
  const ids = (opt.names || ['アキ', 'ボブ']).map((n, i) => mk('u_p' + i, n));
  const t = D_.territories.find(x => x.id) ; // 先頭の区域を使う
  const tomorrow = new Date(Date.now() + DAY).toISOString(), yest = new Date(Date.now() - DAY).toISOString();
  t.holder = H; t.group = 'g1'; delete t.lead; D_.settings.groupOn = 1;
  t.helpers = [my, ...ids].map(u => ({ uid: u, until: tomorrow, by: H, at: yest }));
  const r = new Function('t', 'ids', 'H', 'L', 'my', 'tomorrow', 'yest', src)(t, ids, H, L, my, tomorrow, yest);
  return r;
}, [opt, fn]);
const base = { };

// 1
{ const r = await run(base, `const f = fellowsOf(t, null), h = fellowsHtml(t, null); return { f, h };`);
  ok(r.f.n === 4 && r.f.host === 'u_H' && r.f.others.length === 2 && !r.f.others.includes('me'), '1 自分を出さない・人数に入れる', r.f);
  ok(['あなたをふくめ4人', '司会', 'ハナさん', 'アキさん', 'ボブさん'].every(s => r.h.includes(s)), '1 HTML', r.h);
  ok(r.h.indexOf('ハナさん') < r.h.indexOf('アキさん'), '1 司会が先', r.h); }
// 2
{ const r = await run(base, `t.lead = { uid: L, h: H, until: tomorrow, by: H, at: yest }; return { f: fellowsOf(t, null), h: fellowsHtml(t, null) };`);
  ok(r.f.host === 'u_L' && r.h.includes('レオさん') && !r.h.includes('ハナ'), '2 今日の司会が司会になる', r); }
// 3
{ const r = await run(base, `t.helpers.push({ uid: H, until: tomorrow }, { uid: ids[0], until: tomorrow }); const h = fellowsHtml(t, null); return { f: fellowsOf(t, null), c1: h.split('ハナさん').length - 1, c2: h.split('アキさん').length - 1 };`);
  ok(r.c1 === 1 && r.c2 === 1 && r.f.n === 4, '3 重複なし', r); }
// 4
{ const r = await run(base, `t.helpers.push({ uid: 'u_nai', until: tomorrow }); return { f: fellowsOf(t, null), h: fellowsHtml(t, null) };`);
  ok(!r.h.includes('不明') && r.f.n === 4 && r.f.others.length === 2, '4 名簿にいない人', r); }
// 5
{ const r = await run(base, `t.helpers.find(h => h.uid === ids[1]).until = yest; const a = fellowsHtml(t, null); D().settings.groupOn = 0; const b = fellowsHtml(t, null); D().settings.groupOn = 1; return { a, b };`);
  ok(r.a.includes('アキさん') && !r.a.includes('ボブ') && r.a.includes('あなたをふくめ3人'), '5 期限切れは出ない', r.a);
  ok(r.b === '', '5 groupOn 0 → 空', r.b); }
// 6
{ const r = await run(base, `t.holder = my; const a = fellowsHtml(t, null); t.holder = H; t.lead = { uid: my, h: H, until: tomorrow }; const b = fellowsHtml(t, null); return { a, b };`);
  ok(r.a === '' && r.b === '', '6 担当者・今日の司会の画面は空', r); }
// 7
{ const r = await run(base, `delete t.group; return fellowsHtml(t, null);`);
  ok(r.includes('担当') && !r.includes('司会'), '7 グループでない区域は「担当」', r); }
// 8
{ const r = await run({ names: ['あ1', 'あ2', 'あ3', 'あ4', 'あ5', 'あ6', 'あ7', 'あ8', 'あ9'] }, `const h = fellowsHtml(t, null), a = fellowsHtml(t, null, true); const cnt = s => (s.match(/さん/g) || []).length; return { h, a, ch: cnt(h), ca: cnt(a) };`);
  ok(r.ch === 5 && r.h.includes('ほか5人') && r.h.includes('data-fellowsmore'), '8 6人をこえると5人＋ほか5人', r.h);
  ok(r.ca === 10 && !r.a.includes('data-fellowsmore'), '8 all は10人・ボタンなし', r.a); }
// 9
{ const r = await run({ names: ['<img src=x onerror=window.__x=1>', 'ボブ'] }, `const h = fellowsHtml(t, null); const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); return { h, x: typeof window.__x, txt: d.textContent };`);
  await pg.waitForTimeout(100);
  ok(!r.h.includes('<img') && r.x === 'undefined' && r.txt.includes('<img src=x onerror=window.__x=1>'), '9 XSS：文字のまま', r); }
// 10
{ const r = await run(base, `const c = { id: 'cx1', terrId: t.id, by: H, group: 'g1', helpers: [{ uid: my, until: tomorrow }, { uid: ids[0], until: tomorrow }] }; return { f: fellowsOf(t, c), h: fellowsHtml(t, c) };`);
  ok(r.f.host === 'u_H' && r.h.includes('司会') && r.h.includes('アキさん') && r.h.includes('あなたをふくめ3人') && r.h.includes('data-fc="cx1"'), '10 留守宅カード', r); }
// 11
{ const r = await run(base, `KI.lang = 'es'; const h = fellowsHtml(t, null); KI.lang = 'ja'; return h;`);
  ok(!r.includes('さん') || !/data-notr>[^<]*さん/.test(r), '11 スペイン語：さんなし', r);
  ok(r.includes('ハナ, アキ, ボブ'), '11 スペイン語：", " でつなぐ', r); }
// 12 ［ほか］を押す
{ await run({ names: ['あ1', 'あ2', 'あ3', 'あ4', 'あ5', 'あ6', 'あ7', 'あ8', 'あ9'] }, `const d = document.createElement('div'); d.id = 'fx'; d.innerHTML = fellowsHtml(t, null); document.body.appendChild(d); return 1;`);
  await pg.click('#fx [data-fellowsmore]');
  const h = await pg.evaluate(() => document.querySelector('#fx').innerHTML);
  ok(!h.includes('data-fellowsmore') && (h.match(/さん/g) || []).length === 10, '12 押すと全員になる', h); }
ok(errs.length === 0, 'ページのエラー0', errs);
await b.close();
console.log(ng ? `NG ${ng}` : '全部OK'); process.exit(ng);
