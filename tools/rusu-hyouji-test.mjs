// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/rusu-hyouji-test.mjs [ポート]
// 2026.13.150：自分が「会えた」と記録した家に、あとからほかの人が「留守」と記録すると、
// 地図の印が「留」になり、家の画面は「あなたの記録：会えた」と出て食い違った（こまったこと yakq2v・9e0blc）。
// 今回の巡回で一度でも会えていれば地図の印は「会」にし（区域の進み具合・留守宅カードの数え方 metBetween と同じ）、
// 家の画面では、あとの記録がほかの人のものだと分かるようにする。前からの働き（留守だけの家・前の巡回・拒否・直す）も確かめる。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.18,127.68],homeZoom:16,ageData:true};";
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };

async function page(w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof openTarget === 'function' && typeof Store !== 'undefined' && Store.data && typeof window.fixLineHtml === 'function');
  return { pg, errs, ctx };
}

/* 場面を作る：自分が持っている区域の一戸建て1軒に、記録 recs（[時:分, 結果, 'me'|'other', 前の巡回なら true]）を付ける */
const SETUP = `(function (recs, apt) {
  const my = me().id, other = D().users.find(u => u.id !== my).id;
  const h = D().houses.find(x => (apt ? x.type === 'apt' && x.units && x.units.length >= 2 : x.type !== 'apt' && !(x.units && x.units.length)) && x.terrId && !hasSkip(x) && !hasLang(x) && !Object.keys(D().dnc).some(k => k.indexOf(x.id + '|') === 0));
  const t = terrById(h.terrId);
  t.holder = my; t.lentAt = new Date(Date.now() - 3 * 864e5).toISOString(); delete t.firstDoneAt;
  const unit = apt ? h.units[0] : '';
  D().visits = D().visits.filter(v => v.houseId !== h.id);
  recs.forEach((r, i) => {
    const d = r[3] ? new Date(Date.now() - 20 * 864e5) : new Date();
    const [hh, mm] = r[0].split(':').map(Number); d.setHours(hh, mm, 0, 0);
    D().visits.push({ id: 'vt' + i, houseId: h.id, unit, result: r[1], at: d.toISOString(), by: r[2] === 'me' ? my : other, oc: r[2] === 'me' ? undefined : 1 });
  });
  Store.save(); renderAll();
  window.__t = { hid: h.id, unit, k: K(h.id, unit), since: periodStart(h) };
  return window.__t;
})`;

const { pg, errs } = await page(820, 1180); // iPad の幅

async function scene(recs, apt) { return pg.evaluate(([s, recs, apt]) => eval(s)(recs, apt), [SETUP, recs, !!apt]); }
const st = () => pg.evaluate(() => pinState(__t.k, __t.since));
const icon = () => pg.evaluate(() => houseIcon(houseById(__t.hid), null, false).options.html);
const sheetFix = () => pg.evaluate(() => { openTarget(__t.hid, __t.unit); const f = document.querySelector('#sheet .fixline'); return f ? f.textContent : ''; });

// 1. 報告の場面：自分 9:40 会えた → ほかの人 11:05 留守
await scene([['9:40', 'met', 'me'], ['11:05', 'away', 'other']]);
ok(await st() === 'met', '会えたのあとにほかの人の留守：地図の印は「会えた」', await st());
{ const ic = await icon(); ok(/>会</.test(ic) && !/>留</.test(ic), '地図の印の字が「会」', ic); }
{ const f = await sheetFix(); ok(/あなたの記録/.test(f) && /9:40/.test(f) && /会えた/.test(f), '家の画面：あなたの記録 9:40 会えた', f);
  ok(/ほかの人/.test(f) && /11:05/.test(f) && /留守/.test(f), '家の画面：あとからほかの人が留守と記録したことが分かる', f);
  ok(/記録し直す必要はありません/.test(f), '家の画面：記録し直さなくてよいと分かる', f); }
await pg.evaluate(() => closeSheet());

// 2. 前からの働き：留守だけ → 留
await scene([['10:00', 'away', 'me']]);
ok(await st() === 'away', '留守だけの家は「留守」のまま', await st());
{ const f = await sheetFix(); ok(/あなたの記録/.test(f) && /留守/.test(f) && !/ほかの人/.test(f), '家の画面：自分の留守だけなら、ほかの人の文は出ない', f); }
await pg.evaluate(() => closeSheet());

// 3. 前の巡回で会えた → 今回は留守 → 留（前の巡回の会えたは数えない）
await scene([['10:00', 'met', 'me', true], ['11:00', 'away', 'me']]);
ok(await st() === 'away', '前の巡回の会えたは数えない（今回は留守）', await st());

// 4. 自分の会えた → 自分の留守（あとの記録も自分）：印は会えた。家の画面は新しい自分の記録（留守）で、ほかの人の文は出ない
await scene([['9:00', 'met', 'me'], ['10:00', 'away', 'me']]);
ok(await st() === 'met', '自分の会えたのあとに自分の留守：印は「会えた」', await st());
{ const f = await sheetFix(); ok(/10:00/.test(f) && /留守/.test(f) && !/ほかの人/.test(f), '家の画面：直せる新しい記録（10:00 留守）を出す', f); }
await pg.evaluate(() => closeSheet());

// 5. ほかの人の会えた → 自分の留守：印は「会えた」（ほかの人の会えた＝青いチェックの扱いはそのまま）
await scene([['9:00', 'met', 'other'], ['10:00', 'away', 'me']]);
ok(await st() === 'met', 'ほかの人の会えたのあとに自分の留守：印は「会えた」', await st());
{ const f = await sheetFix(); ok(/あなたの記録/.test(f) && /留守/.test(f) && !/ほかの人/.test(f), '家の画面：あとの記録が自分なら、ほかの人の文は出ない', f); }
await pg.evaluate(() => closeSheet());

// 6. 会えた → 拒否（拒否の印は外した）：拒否のまま（会えたで上書きしない）
await scene([['9:00', 'met', 'me'], ['10:00', 'refused', 'other']]);
ok(await st() === 'refused', '会えたのあとの拒否は「拒否」のまま', await st());

// 7. 記録なし → plain
await scene([]);
ok(await st() === 'plain', '記録のない家は印なし', await st());

// 8. 直す：自分の留守 10:12 を「会えた」に変える → 時刻は 10:12 のまま
await scene([['10:12', 'away', 'me']]);
{
  const r = await pg.evaluate(() => {
    openTarget(__t.hid, __t.unit);
    document.querySelector('#sheet [data-fxline]').click();
    document.querySelector('#sheet [data-fx="met"]').click();
    const vs = visitsOf(__t.k);
    const d = new Date(vs[0].at);
    return { n: vs.length, res: vs[0].result, hm: d.getHours() + ':' + d.getMinutes() };
  });
  ok(r.n === 1 && r.res === 'met' && r.hm === '10:12', '直す：留守→会えたで、時刻は元のまま（10:12）', r);
  await pg.evaluate(() => closeSheet());
}

// 9. 集合住宅の部屋：会えた → ほかの人の留守。続けて入力の部屋のボタンも「会」
await scene([['9:40', 'met', 'me'], ['11:05', 'away', 'other']], true);
ok(await st() === 'met', '集合住宅の部屋：会えたのあとにほかの人の留守 → 印は「会えた」', await st());
{
  const r = await pg.evaluate(() => { openAptSeq(__t.hid); const c = document.querySelector('#sheet .uchip[data-jump="0"]'); return c ? c.className : ''; });
  ok(/st-met/.test(r), '集合住宅の部屋のボタンも「会えた」', r);
  await pg.evaluate(() => closeSheet());
}

ok(!errs.length, 'JS のエラーなし', errs);
console.log(ng ? `\n${ng}件 NG` : '\nすべて OK');
await b.close();
process.exit(ng ? 1 : 0);
