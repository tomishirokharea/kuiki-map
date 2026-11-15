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
const errs = []; pg.on('pageerror', e => errs.push(String(e) + (process.env.STK ? (e.stack || '') : '')));
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
{ const r = await run(base, `const f = fellowsOf(t, null), h = fellowsHtml(t, null); return { f, h, my, myName: userById(my).name };`);
  ok(r.f.n === 4 && r.f.host === 'u_H' && r.f.others.length === 2 && !r.f.others.includes(r.my) && r.f.host !== r.my, '1 自分を出さない・人数に入れる', r.f);
  ok(['あなたをふくめ4人', '司会', 'ハナさん', 'アキさん', 'ボブさん'].every(s => r.h.includes(s)), '1 HTML', r.h);
  ok(!r.h.includes(r.myName + 'さん'), '1 自分の名前がHTMLにない', r.myName);
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
  ok(!/data-notr>[^<]*さん/.test(r), '11 スペイン語：さんなし', r);
  ok(r.includes('ハナ, アキ, ボブ'), '11 スペイン語：", " でつなぐ', r); }
// 12 ［ほか］を押す
{ await run({ names: ['あ1', 'あ2', 'あ3', 'あ4', 'あ5', 'あ6', 'あ7', 'あ8', 'あ9'] }, `const d = document.createElement('div'); d.id = 'fx'; d.innerHTML = fellowsHtml(t, null); document.body.appendChild(d); return 1;`);
  await pg.click('#fx [data-fellowsmore]');
  const h = await pg.evaluate(() => document.querySelector('#fx').innerHTML);
  ok(!h.includes('data-fellowsmore') && (h.match(/さん/g) || []).length === 10, '12 押すと全員になる', h); }

/* ---- Task 2：くわしい表示の各所（番号は T2-） ---- */
await pg.evaluate(() => { UI.mode = 'detail'; const h = document.querySelector('#hello'); if (h) h.style.display = 'none'; }); // くわしい表示（かんたんは Task 3）
const many = n => Array.from({ length: n }, (_, i) => '仲間' + (i + 1));
const unseen = () => pg.evaluate(() => { lsSet(asgSeenKey(), '[]'); });
const asgTxt = () => pg.evaluate(() => { showView('home'); renderHome(); renderCards(); });
// T2-12 区域カードのカード
for (const w of [375, 1280]) {
  await pg.setViewportSize({ width: w, height: 900 });
  await run(base, `showView('cards'); renderCards(); return 1;`);
  const r = await pg.evaluate(() => { const tc = [...document.querySelectorAll('.tcard')].filter(x => !x.classList.contains('away')); return tc.map(x => ({ f: !!x.querySelector('.fellows'), t: (x.querySelector('.fellows') || {}).textContent || '', own: !!x.querySelector('[data-return]') })); });
  ok(r.some(x => x.f && x.t.includes('あなたをふくめ4人') && !x.own), `T2-12 手伝う区域カードに仲間（幅${w}）`, r);
  ok(r.filter(x => x.own).every(x => !x.f), `T2-12 担当者の自分のカードには出ない（幅${w}）`, r);
}
// T2-13 範囲があるとき
{ await run(base, `t.parts = [{ id: 'pt1', uids: [my, ids[0]], poly: [[26.18,127.68],[26.181,127.68],[26.181,127.681]], until: tomorrow, at: yest, by: H }]; showView('cards'); renderCards(); return 1;`);
  const r = await pg.evaluate(() => { const x = [...document.querySelectorAll('.tcard .tbody')].find(b => b.textContent.includes('今日のあなたの範囲があります')); return x ? { hint: x.textContent.includes('アキさん'), f: !!x.querySelector('.fellows') } : null; });
  ok(r && r.hint && r.f, 'T2-13 範囲あり：範囲の文と仲間の両方', r); }
// T2-14 地図の帯
{ await run(base, `delete t.parts; showView('map'); openTerr(t.id); toggleLegend(true); return 1;`);
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => { const f = document.querySelector('#legendInfo .fellows'); return f ? f.textContent : null; });
  ok(r && r.includes('あなたをふくめ4人') && r.includes('ハナさん'), 'T2-14 地図の帯に仲間', r); }
// T2-15 留守宅カード
{ await run(base, `const c = { id: 'cx2', terrId: t.id, by: H, group: 'g1', slot: 'sat_am', at: yest, expiresAt: tomorrow, keys: [], helpers: [{ uid: my, until: tomorrow, by: H, at: yest }, { uid: ids[0], until: tomorrow, by: H, at: yest }] }; D().awayCards = (D().awayCards || []).filter(x => x.id !== 'cx2'); D().awayCards.push(c); showView('cards'); renderCards(); return 1;`);
  const a = await pg.evaluate(() => { const x = document.querySelector('.tcard.away .fellows'); return x ? x.textContent : null; });
  ok(a && a.includes('あなたをふくめ3人') && a.includes('アキさん'), 'T2-15 カードの一覧に仲間', a);
  await pg.evaluate(() => { showView('map'); openAwayCard('cx2'); });
  await pg.waitForTimeout(300);
  const bar = await pg.evaluate(() => { const x = document.querySelector('#cardBar .fellows'); return x ? x.textContent : null; });
  ok(bar && bar.includes('あなたをふくめ3人'), 'T2-15 地図の帯（留守宅カード）に仲間', bar); }
// T2-16 お知らせ（ホーム・区域カードの上）と［ほか n人］
for (const w of [375, 1280]) {
  await pg.setViewportSize({ width: w, height: 900 });
  await run({ names: many(9) }, `D().awayCards = (D().awayCards || []).filter(x => !/^cx/.test(x.id)); focusCard = null; showView('cards'); renderCards(); return 1;`);
  await unseen();
  await pg.evaluate(() => { showView('cards'); renderCards(); });
  const n1 = await pg.evaluate(() => { const x = document.querySelector('#asgNotice .asgnote .fellows'); return x ? x.textContent : null; });
  ok(n1 && n1.includes('あなたをふくめ11人') && n1.includes('ほか5人'), `T2-16 区域カードのお知らせに仲間（幅${w}）`, n1);
  await pg.click('#asgNotice [data-fellowsmore]');
  const st = await pg.evaluate(() => ({ seen: !!document.querySelector('#asgNotice .asgnote'), names: (document.querySelector('#asgNotice .fellows [data-notr]') || {}).textContent, more: !!document.querySelector('#asgNotice [data-fellowsmore]'), view: currentView }));
  ok(st.seen && !st.more && (st.names.match(/さん/g) || []).length === 10 && st.view === 'cards', `T2-16/17 ほかを押してもお知らせは残り、地図は開かない（幅${w}）`, st);
  await pg.click('#asgNotice [data-asgok]');
  const gone = await pg.evaluate(() => !document.querySelector('#asgNotice .asgnote'));
  ok(gone, `T2-16 そのあと「わかりました」でお知らせが消える（幅${w}）`, gone);
  // ホーム（ふだんのお知らせ）
  await unseen();
  await pg.evaluate(() => { UI.todayOn = 'off'; showView('home'); renderHome(); });
  const h0 = await pg.evaluate(() => { const x = document.querySelector('#homeHello .asgnote .fellows'); return x ? x.textContent : null; });
  ok(h0 && h0.includes('あなたをふくめ11人'), `T2-16 ホームのお知らせ（ふだん）に仲間（幅${w}）`, h0);
  // ホーム（今日やること）
  await unseen();
  await pg.evaluate(() => { UI.todayOn = 'on'; showView('home'); renderHome(); });
  const h1 = await pg.evaluate(() => { const x = document.querySelector('.todo.asg .fellows'); return x ? { t: x.textContent, inSmall: !!x.closest('small') } : null; });
  ok(h1 && h1.t.includes('あなたをふくめ11人') && !h1.inSmall, `T2-16 ホームのお知らせに仲間（幅${w}）`, h1);
  await pg.click('.todo.asg [data-fellowsmore]');
  const h2 = await pg.evaluate(() => ({ asg: !!document.querySelector('.todo.asg'), more: !!document.querySelector('.todo.asg [data-fellowsmore]'), view: currentView }));
  ok(h2.asg && !h2.more && h2.view === 'home', `T2-16/17 ホームでも、ほかを押して残る・開かない（幅${w}）`, h2);
  await pg.click('.todo.asg [data-asgok]');
  ok(await pg.evaluate(() => !document.querySelector('.todo.asg')), `T2-16 ホーム「わかりました」で消える（幅${w}）`);
  await pg.evaluate(() => { UI.todayOn = 'off'; });
}
// T2-17 カードの開閉はおきない
{ await pg.setViewportSize({ width: 375, height: 900 });
  await run({ names: many(9) }, `showView('cards'); renderCards(); return 1;`);
  await pg.evaluate(() => lsSet(asgSeenKey(), JSON.stringify(todayAsgs().flatMap(a => a.keys))));
  await pg.evaluate(() => { renderCards(); });
  const before = await pg.evaluate(() => currentView);
  await pg.click('.tcard .fellows [data-fellowsmore]');
  const r = await pg.evaluate(() => ({ view: currentView, more: !!document.querySelector('.tcard .fellows [data-fellowsmore]'), n: (document.querySelector('.tcard .fellows [data-notr]').textContent.match(/さん/g) || []).length }));
  ok(before === 'cards' && r.view === 'cards' && !r.more && r.n === 10, 'T2-17 ほか n人：全員・ボタン消え・地図は開かない', r); }
// T2-18 はみ出し
{ await pg.setViewportSize({ width: 375, height: 900 });
  await run({ names: many(19) }, `showView('cards'); renderCards(); return 1;`);
  const a = await pg.evaluate(() => document.documentElement.scrollWidth);
  await pg.click('.tcard .fellows [data-fellowsmore]');
  const b2 = await pg.evaluate(() => document.documentElement.scrollWidth);
  await pg.evaluate(() => { showView('map'); openTerr(D().territories.find(x => x.id).id); toggleLegend(true); });
  await pg.waitForTimeout(300);
  const c2 = await pg.evaluate(() => document.documentElement.scrollWidth);
  ok(a <= 375 && b2 <= 375 && c2 <= 375, 'T2-18 幅375で20人でもはみ出さない', { a, b2, c2 }); }
// T2-19 回帰：担当者の画面
{ await pg.setViewportSize({ width: 820, height: 1180 });
  await run(base, `t.holder = my; showView('cards'); renderCards(); return 1;`);
  const r = await pg.evaluate(() => { const x = [...document.querySelectorAll('.tcard')].find(c => c.querySelector('[data-return]')); return x ? { t: x.textContent, f: !!x.querySelector('.fellows') } : null; });
  ok(r && !r.f && /今日回る人（3人）：/.test(r.t) && r.t.includes('今日回る人をえらぶ') && r.t.includes('回る範囲を分ける'), 'T2-19 担当者の画面は今までどおり', r && r.t); }
ok(errs.length === 0, 'ページのエラー0', errs);
await b.close();
console.log(ng ? `NG ${ng}` : '全部OK'); process.exit(ng);
