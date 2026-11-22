// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/saihoumon-chizu-test.mjs [ポート]
// 2026.13.177（こまったこと pn2o9o）：
//  R1 再訪問の地図の一軒家の印を、再訪問の一覧と同じ決め方にする（一度でも会えた→会／記録はあるが会えていない→留／記録なし→白／拒否→拒）
//  R2 再訪問の地図以外の印は変えない
//  R3 periodStart：アプリの日付（受け取り・返却・完了・続き・途中返却）がない区域だけ、紙の S-13 の日付を使う
//     （paperLentAt はその日の0時、paperDone は翌日の0時。新しいほう。今より先の日付・形のくずれた日付は使わない）
//  R4 periodStart を使う所（集合住宅の残りの数など）にもそろって効く
// 記録の時刻は「○日前の10時」に置く（いつ動かしても、未来の記録にならない）
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };

const ctx = await b.newContext({ viewport: { width: 820, height: 1180 } }); // iPad の幅
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
await pg.goto(`http://localhost:${port}/index.html`);
await pg.waitForFunction(() => typeof openTarget === 'function' && typeof Store !== 'undefined' && Store.data && typeof openFollowMap === 'function');

/* 場面を作る
   o.recs：[○日前, 結果, 'me'|'other']／o.ret：アプリで返却した日（○日前。なければアプリの日付なし）
   o.pd・o.pl：紙で回り終えた日・紙で貸した日（○日前の数、または文字そのもの）／o.follow：自分の再訪問にする／o.dnc：拒否の印／o.apt：集合住宅の部屋 */
async function scene(o) {
  return pg.evaluate(o => {
    followMap = false;
    D().settings.skipDays = 0; D().settings.followSkipDays = 0; // 「最近会えた家」は、この試験では使わない
    const my = me().id, other = D().users.find(u => u.id !== my).id, apt = !!o.apt;
    const h = D().houses.find(x => (apt ? x.type === 'apt' && x.units && x.units.length >= 2 : x.type !== 'apt' && !(x.units && x.units.length)) && x.terrId && !hasSkip(x) && !hasLang(x) && !Object.keys(D().dnc).some(k => k.indexOf(x.id + '|') === 0));
    const t = terrById(h.terrId), DAY = 864e5, sod = new Date(); sod.setHours(0, 0, 0, 0);
    const ago = n => new Date(sod.getTime() - n * DAY + 10 * 36e5).toISOString();
    const day = n => (typeof n === 'string' ? n : (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(sod.getTime() - n * DAY)));
    t.holder = null;
    ['lentAt', 'returnedAt', 'completedAt', 'roundFrom', 'lastRoundFrom', 'awayPoolAt', 'firstDoneAt', 'paperDone', 'paperLentAt', 'lastLentAt'].forEach(f => delete t[f]);
    if (o.ret != null) { t.returnedAt = ago(o.ret); t.completedAt = t.returnedAt; }
    if (o.pd != null) t.paperDone = day(o.pd);
    if (o.pl != null) t.paperLentAt = day(o.pl);
    const unit = apt ? h.units[0] : '', k = K(h.id, unit);
    D().visits = D().visits.filter(v => v.houseId !== h.id);
    (o.recs || []).forEach((r, i) => D().visits.push({ id: 'sc' + i, houseId: h.id, unit, result: r[1], at: ago(r[0]), by: r[2] === 'other' ? other : my, oc: r[2] === 'other' ? 1 : undefined }));
    Object.keys(D().follows).forEach(x => { if (x.indexOf(h.id + '|') === 0) delete D().follows[x]; });
    if (o.follow) D().follows[k] = { by: my, since: ago(30), touchedAt: ago(1) };
    if (o.dnc) D().dnc[k] = true; else delete D().dnc[k];
    Store.save(); renderAll();
    window.__t = { hid: h.id, unit, k, sod: sod.getTime() };
    return { since: periodStart(h), tno: t.no };
  }, o);
}
const icon = fm => pg.evaluate(fm => { followMap = fm; try { return houseIcon(houseById(__t.hid), fm ? (() => 'hl') : null, false).options.html; } finally { followMap = false; } }, fm);
const glyph = html => { const m = /class="pin[^"]*">([^<]*)/.exec(html); return m ? m[1] : null; };
const since = () => pg.evaluate(() => periodStart(houseById(__t.hid)));
const dayIso = n => pg.evaluate(n => new Date(__t.sod - n * 864e5).toISOString(), n);

// ---------- R1・R2：再訪問の地図 ----------
// T1：会えたのは区域の返却より前（今回の巡回の外）→ 再訪問の地図では「会」
await scene({ recs: [[20, 'met', 'me']], ret: 5, follow: true });
{ const h = await icon(true); ok(glyph(h) === '会', 'T1 再訪問の地図：返却より前に会えた家は「会」', h); }
// T3：同じ家をふつうの地図で → 今までどおり字なし（今回の巡回の外）
{ const h = await icon(false); ok(glyph(h) === '', 'T3 ふつうの地図では今までどおり（字なし）', h); }
// T1b：会えたあとに留守 → 「会」（一覧の「前回 会えた日」と同じ）
await scene({ recs: [[20, 'met', 'other'], [2, 'away', 'me']], ret: 5, follow: true });
{ const h = await icon(true); ok(glyph(h) === '会', 'T1b 会えたあとに留守でも「会」（ほかの人の会えたも数える）', h); }
// T2a：留守だけ → 「留」
await scene({ recs: [[20, 'away', 'me'], [10, 'away', 'me']], ret: 5, follow: true });
{ const h = await icon(true); ok(glyph(h) === '留', 'T2a 留守だけの家は「留」', h); }
// T2b：記録なし → 字なし
await scene({ recs: [], ret: 5, follow: true });
{ const h = await icon(true); ok(glyph(h) === '' && /st-plain/.test(h), 'T2b 記録のない家は白い丸', h); }
// T2c：拒否 → 「拒」
await scene({ recs: [[20, 'met', 'me']], ret: 5, follow: true, dnc: true });
{ const h = await icon(true); ok(glyph(h) === '拒', 'T2c 拒否の家は「拒」', h); }
// T9：実際に「地図で見る」で開いた地図の印
await scene({ recs: [[20, 'met', 'me']], ret: 5, follow: true });
{
  const h = await pg.evaluate(async () => {
    openFollowMap();
    await new Promise(r => setTimeout(r, 900));
    const hh = houseById(__t.hid); let html = null;
    houseLayer.eachLayer(l => { if (l.getLatLng && l.options.icon && l.getLatLng().lat === hh.lat && l.getLatLng().lng === hh.lng) html = l.options.icon.options.html; });
    return { html, fm: followMap };
  });
  ok(h.fm && glyph(h.html || '') === '会', 'T9 「地図で見る」で開いた地図でも「会」', h);
  await pg.evaluate(() => showView('cards'));
  ok(!(await pg.evaluate(() => followMap)), 'T9b 地図を離れると、再訪問の地図の決め方は使わない', null);
}

// ---------- R3：紙の S-13 の日付 ----------
// T4：アプリの日付なし・紙で回り終えたのは10日前 → 9日前の0時から
await scene({ recs: [[3, 'met', 'me']], pd: 10 });
ok(await since() === await dayIso(9), 'T4 紙で回り終えた日の翌日の0時から数える', await since());
{ const h = await icon(false); ok(glyph(h) === '会', 'T4 紙で回り終えたあとに会えた家は「会」', h); }
await scene({ recs: [[11, 'met', 'me']], pd: 10 });
{ const h = await icon(false); ok(glyph(h) === '', 'T4b 紙で回り終えた日より前の会えたは数えない', h); }
await scene({ recs: [[10, 'met', 'me']], pd: 10 });
{ const h = await icon(false); ok(glyph(h) === '', 'T4c 紙で回り終えた当日の記録は、前の巡回', h); }
// T5：今より先・今日・形のくずれ
await scene({ recs: [[3, 'met', 'me']], pd: -1 });
ok(await since() === '', 'T5a 紙の完了日が明日（入力ミス）なら使わない', await since());
await scene({ recs: [[0, 'met', 'me']], pd: 0 });
ok(await since() === await dayIso(-1), 'T5b 紙の完了日が今日なら、明日の0時から（今日の記録は前の巡回）', await since());
for (const bad of ['2026-7-1', '', 'あいう', '2026/11/01', '2026-02-30']) {
  await scene({ recs: [[3, 'met', 'me']], pd: bad });
  ok(await since() === '', `T5c 形のくずれた紙の日付（${JSON.stringify(bad)}）は使わない`, await since());
}
// T6：紙で貸した日のほうが新しい → その日の0時から
await scene({ recs: [[2, 'met', 'me']], pd: 10, pl: 3 });
ok(await since() === await dayIso(3), 'T6 紙で貸した日のほうが新しければ、その日の0時から', await since());
await scene({ recs: [[2, 'met', 'me']], pd: 3, pl: 10 });
ok(await since() === await dayIso(2), 'T6b 紙で回り終えた日のほうが新しければ、その翌日から', await since());
await scene({ recs: [[2, 'met', 'me']], pl: -2 });
ok(await since() === '', 'T6c 紙で貸した日が先の日付なら使わない', await since());
// T7：アプリの日付がある区域 → 紙の日付があってもアプリの日付
await scene({ recs: [[2, 'met', 'me']], ret: 5, pd: 1 });
ok(await since() === await pg.evaluate(() => terrById(houseById(__t.hid).terrId).returnedAt), 'T7 アプリの返却日がある区域は、紙の日付を使わない', await since());
// T7b：どれもない → 今までどおり空・字なし
await scene({ recs: [[2, 'met', 'me']] });
ok(await since() === '', 'T7b 日付が何もない区域は今までどおり空', await since());
{ const h = await icon(false); ok(glyph(h) === '', 'T7b 日付が何もない区域の印は今までどおり字なし', h); }

// ---------- R4：集合住宅の残りの数・部屋のボタン ----------
await scene({ recs: [[3, 'met', 'me']], pd: 10, apt: true });
{
  const r = await pg.evaluate(() => { const h = houseById(__t.hid); return { left: aptTodo(h, periodStart(h)), n: targets(h).filter(u => !dncAt(K(h.id, u))).length }; });
  ok(r.left === r.n - 1, 'T8 集合住宅：紙のあとに会えた部屋は、残りの数に入らない', r);
}
await scene({ recs: [[3, 'met', 'me']], apt: true });
{
  const r = await pg.evaluate(() => { const h = houseById(__t.hid); return { left: aptTodo(h, periodStart(h)), n: targets(h).filter(u => !dncAt(K(h.id, u))).length }; });
  ok(r.left === r.n, 'T8b 集合住宅：日付が何もない区域は今までどおり', r);
}

ok(!errs.length, 'JS のエラーなし', errs);
console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
await b.close();
process.exit(ng ? 1 : 0);
