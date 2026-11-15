// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/lead-mapview-test.mjs [ポート]
// 2026.13.153：「司会だけする」の一覧で、ほかの監督・司会者が持つカードを、司会を引き受けずに地図で見られるようにする
// （こまったこと sk6v5k・2026-11-15）。「地図で見る」は見るだけで、今日の司会・担当者・送る変更は何も変えない。
// 前からの働き（この区域で司会する・今日は○○さんが司会・自分が今日の司会・さがす）も確かめる。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };

async function page(w, simple) {
  const ctx = await b.newContext({ viewport: { width: w, height: w > 800 ? 1180 : 844 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof openLeadPick === 'function' && typeof Store !== 'undefined' && Store.data);
  // 場面：自分は司会者。ほかの人が持つ、自分のグループの集まりの区域を3枚（ふつう・今日はほかの人が司会・今日は自分が司会）
  const r = await pg.evaluate(simple => {
    const s = document.getElementById('splash'); if (s) s.remove();
    UI.mode = simple ? 'simple' : 'detail'; applyUi();
    const my = me(); my.group = my.group || 'テスト'; my.leader = true;
    const others = D().users.filter(u => u.id !== my.id);
    const ts = D().territories.filter(t => !t.dummy && okPoly(t.polygon) && !isSpecial(t)).slice(0, 3);
    const end = new Date(); end.setHours(23, 59, 0, 0);
    ts.forEach((t, i) => { t.holder = others[0].id; t.group = my.group; delete t.use; t.lentAt = new Date(Date.now() - 5 * 864e5).toISOString(); delete t.lead; });
    ts[1].lead = { uid: others[1].id, h: ts[1].holder, until: end.toISOString(), by: others[1].id, at: new Date().toISOString() };
    ts[2].lead = { uid: my.id, h: ts[2].holder, until: end.toISOString(), by: my.id, at: new Date().toISOString() };
    Store.save(); renderAll(); showView('cards');
    return { ids: ts.map(t => t.id), nos: ts.map(t => t.no) };
  }, !!simple);
  return { pg, ctx, errs, ...r };
}
const snap = pg => pg.evaluate(() => JSON.stringify({ t: D().territories.map(t => [t.id, t.holder || '', t.lead ? t.lead.uid : '', t.group || '']), q: (Store.queue || []).length }));

for (const [w, simple] of [[1280, false], [390, false], [390, true]]) {
  const tag = `${w}px${simple ? '・かんたん' : ''}`;
  const { pg, ctx, errs, ids, nos } = await page(w, simple);
  await pg.evaluate(() => openLeadPick());
  await pg.waitForTimeout(300);
  // どの行にも「地図で見る」がある（ふつう・ほかの人が司会・自分が司会）
  const rows = await pg.evaluate(ids => ids.map(id => {
    const no = terrById(id).no; // 行は番号の札でさがす（新しいボタンがなくても、前からの部品を確かめられるように）
    const a = [...document.querySelectorAll('#sheet #leadList article')].find(x => (x.querySelector('.stamp') || {}).textContent === no);
    const v = a && a.querySelector(`[data-leadview="${id}"]`);
    return { view: !!v, take: !!(a && a.querySelector('[data-leadtake]')), busy: !!(a && a.querySelector('.leadbusy')), mine: !!(a && a.querySelector('.leadtag')), h: v ? v.getBoundingClientRect().height : 0, txt: v ? v.textContent.trim() : '' };
  }), ids);
  ok(rows.every(r => r.view && r.txt === '地図で見る'), `${tag}：どの行にも「地図で見る」がある`, rows);
  ok(rows[0].take && rows[1].busy && rows[2].mine, `${tag}：前からの「この区域で司会する」「今日は○○さんが司会」「今日の司会」はそのまま`, rows);
  ok(rows.every(r => r.h >= 44), `${tag}：「地図で見る」は押しやすい大きさ（高さ44px以上）`, rows.map(r => r.h));
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 0, `${tag}：横にはみ出さない`, over);
  // 押すと：地図に切りかわり、その区域をえらんだ状態。司会は引き受けない（データも送る変更も変わらない）
  const before = await snap(pg);
  await pg.click(`#sheet [data-leadview="${ids[0]}"]`, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const st = await pg.evaluate(id => ({ view: currentView, sel: selTerrId(), sheet: !document.querySelector('#sheet').hidden && document.querySelector('#sheet').classList.contains('open'), ask: !document.querySelector('#askBox').hidden, lead: !!terrById(id).lead }), ids[0]);
  ok(st.view === 'map' && st.sel === ids[0], `${tag}：押すと地図で区域${nos[0]}が出る`, st);
  ok(!st.ask && !st.lead, `${tag}：司会は引き受けない（確認も出ない）`, st);
  ok(await snap(pg) === before, `${tag}：区域のデータ・送る変更は何も変わらない`, null);
  const tt = await pg.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(x => x.textContent).join(' '));
  ok(/見るだけ/.test(tt), `${tag}：見るだけだと分かる知らせが出る`, tt);
  // 前からの働き：「この区域で司会する」は、確認が出る
  await pg.evaluate(() => { showView('cards'); openLeadPick(); });
  await pg.waitForTimeout(300);
  await pg.click(`#sheet [data-leadtake="${ids[0]}"]`, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => !document.querySelector('#askBox').hidden), `${tag}：「この区域で司会する」は今までどおり確認が出る`, null);
  ok(!errs.length, `${tag}：JS のエラーなし`, errs);
  await ctx.close();
}
// アプリを開いた直後（地図をまだ一度も開いていない）に押しても、その区域の大きさで出る（監査 I-1）
for (const w of [1280, 390]) {
  const { pg, ctx, ids } = await page(w, false);
  await pg.evaluate(() => openLeadPick());
  await pg.waitForTimeout(300);
  await pg.click(`#sheet [data-leadview="${ids[0]}"]`, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(id => { const t = terrById(id); const c = map.getCenter(), bb = L.latLngBounds(t.polygon); return { z: map.getZoom(), fit: terrFitZoom(t), inView: map.getBounds().contains(bb.getCenter()), centerIn: bb.pad(0.5).contains(c) }; }, ids[0]);
  ok(Math.abs(r.z - r.fit) <= 1 && r.inView && r.centerIn, `開いた直後 ${w}px：その区域の大きさで地図に出る（全区域にならない）`, r);
  await ctx.close();
}
// 自分が今日の司会の区域：「司会はしていません」とは出さない（監査 I-2）
{
  const { pg, ctx, ids, nos } = await page(390, false);
  await pg.evaluate(() => openLeadPick());
  await pg.waitForTimeout(300);
  await pg.click(`#sheet [data-leadview="${ids[2]}"]`, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const tt = await pg.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(x => x.textContent).join(' '));
  ok(tt.includes(`区域${nos[2]}を地図で出しました`) && !/司会はしていません/.test(tt), '自分が今日の司会の区域：「司会はしていません」とは出さない', tt);
  ok(await pg.evaluate(id => !!terrById(id).lead && terrById(id).lead.uid === me().id, ids[2]), '自分が今日の司会のまま', null);
  await ctx.close();
}
// 初めて使う人（案内オン）：3秒たっても「見るだけ」の知らせが残り、「右下の？…」「返す」の案内に替わらない（再監査 I-1）
for (const simple of [false, true]) {
  const { pg, ctx, ids } = await page(390, simple);
  await pg.evaluate(() => { UI.guide = 'on'; openLeadPick(); });
  await pg.waitForTimeout(300);
  await pg.click(`#sheet [data-leadview="${ids[0]}"]`, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(3200);
  const tt = await pg.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
  ok(/見るだけ/.test(tt) && !/右下/.test(tt) && !/返す/.test(tt), `初めて使う人${simple ? '・かんたん' : ''}：3秒後も「見るだけ」の知らせのまま（ほかの案内に替わらない）`, tt);
  await ctx.close();
}
// 前からの働き：区域カードの「地図をひらく」（openTerr）は、初めて使う人に今までどおり「右下の？」の案内を出す
{
  const { pg, ctx, ids } = await page(390, false);
  await pg.evaluate(id => { UI.guide = 'on'; openTerr(id); }, ids[0]);
  await pg.waitForTimeout(3000);
  const tt = await pg.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
  ok(/右下の「\?」/.test(tt), '前からの働き：openTerr は初めて使う人に「右下の？」の案内を出す', tt);
  await ctx.close();
}
// 線がない区域：地図で出したとは言わず、線がないことを知らせる（監査 Minor 3）
{
  const { pg, ctx, ids, nos } = await page(390, false);
  await pg.evaluate(id => { terrById(id).polygon = []; Store.save(); openLeadPick(); }, ids[0]);
  await pg.waitForTimeout(300);
  await pg.click(`#sheet [data-leadview="${ids[0]}"]`, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const tt = await pg.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(x => x.textContent).join(' '));
  ok(/まだ地図に線が引かれていません/.test(tt) && !/地図で出しました/.test(tt), '線がない区域：線がないことを知らせる', tt);
  await ctx.close();
}

// さがす欄（7枚以上）で、かくれた行の「地図で見る」も一緒にかくれる
{
  const { pg, ctx, ids } = await page(1280, false);
  const n = await pg.evaluate(() => {
    const my = me(), other = D().users.find(u => u.id !== my.id);
    // 試作のデータは区域が4枚だけなので、試験の中だけで写しを足して8枚にする
    const base = D().territories.filter(t => !t.dummy && !isSpecial(t));
    for (let i = 0; D().territories.filter(t => !t.dummy && !isSpecial(t)).length < 8; i++) {
      const c = JSON.parse(JSON.stringify(base[i % base.length])); c.id = 'tcopy' + i; c.no = '9' + i; c.name = '試験の区域' + i; delete c.lead; D().territories.push(c);
    }
    D().territories.filter(t => !t.dummy && !isSpecial(t)).slice(0, 8).forEach(t => { t.holder = other.id; t.group = my.group; t.lentAt = new Date(Date.now() - 5 * 864e5).toISOString(); });
    Store.save(); openLeadPick();
    return document.querySelectorAll('#sheet #leadList article').length;
  });
  ok(n >= 7 && await pg.evaluate(() => !!document.querySelector('#leadQ')), '7枚以上ではさがす欄が出る', n);
  const q = await pg.evaluate(id => terrById(id).no, ids[0]);
  await pg.fill('#leadQ', q, { timeout: 3000 }).catch(() => {});
  await pg.waitForTimeout(200);
  const vis = await pg.evaluate(() => [...document.querySelectorAll('#sheet #leadList article')].filter(x => !x.hidden && x.querySelector('[data-leadview]')).length);
  ok(vis >= 1 && vis < n, 'さがすと、ほかの行（と「地図で見る」）はかくれ、見つかった行には「地図で見る」がある', [vis, n]);
  await ctx.close();
}

console.log(ng ? `\n${ng}件 NG` : '\nすべて OK');
await b.close();
process.exit(ng ? 1 : 0);
