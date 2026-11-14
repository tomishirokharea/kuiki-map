// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/rusu-hyouji-test.mjs [ポート]
// 2026.13.150：自分が「会えた」と記録した家に、あとからほかの人が「留守」と記録すると、
// 地図の印が「留」になり、家の画面は「あなたの記録：会えた」と出て食い違った（こまったこと yakq2v・9e0blc）。
// 今回の巡回で一度でも会えていれば地図の印は「会」にし（区域の進み具合・留守宅カードの数え方 metBetween と同じ）、
// 家の画面では、食い違って見えるわけを書く。前からの働き（留守だけの家・前の巡回・拒否・直す・小さな点）も確かめる。
// 記録の時刻は「今日の0時から今まで」の中に置く（いつ動かしても、未来の記録にならない）
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
await pg.waitForFunction(() => typeof openTarget === 'function' && typeof Store !== 'undefined' && Store.data && typeof window.fixLineHtml === 'function');

/* 場面を作る。recs：[今日の中の位置（0〜1。0＝0時・1＝今）, 結果, 'me'|'other', 前の巡回なら true]
   opt.apt：集合住宅の部屋／opt.stage：'mine'（自分が持っている・1回目）｜'away'（自分が持っている・留守宅を回る段階）｜'pool'（返した・留守宅カードの段階） */
async function scene(recs, opt) {
  return pg.evaluate(([recs, opt]) => {
    const my = me().id, other = D().users.find(u => u.id !== my).id;
    const apt = !!opt.apt;
    const h = D().houses.find(x => (apt ? x.type === 'apt' && x.units && x.units.length >= 2 : x.type !== 'apt' && !(x.units && x.units.length)) && x.terrId && !hasSkip(x) && !hasLang(x) && !Object.keys(D().dnc).some(k => k.indexOf(x.id + '|') === 0));
    const t = terrById(h.terrId), DAY = 864e5, sod = new Date(); sod.setHours(0, 0, 0, 0);
    const stage = opt.stage || 'mine';
    delete t.firstDoneAt; delete t.awayPoolAt; delete t.returnedAt;
    if (stage === 'pool') { t.holder = null; delete t.lentAt; t.returnedAt = new Date(sod - 2 * DAY).toISOString(); t.awayPoolAt = t.returnedAt; t.lastLentAt = new Date(sod - 9 * DAY).toISOString(); t.lastFirstAt = t.returnedAt; }
    else { t.holder = my; t.lentAt = new Date(sod - 3 * DAY).toISOString(); if (stage === 'away') t.firstDoneAt = new Date(sod - 1 * DAY).toISOString(); }
    const unit = apt ? h.units[0] : '';
    D().visits = D().visits.filter(v => v.houseId !== h.id);
    recs.forEach((r, i) => {
      const at = r[3] ? new Date(sod - 20 * DAY + 10 * 36e5) : new Date(sod.getTime() + (Date.now() - sod.getTime()) * r[0]);
      D().visits.push({ id: 'vt' + i, houseId: h.id, unit, result: r[1], at: at.toISOString(), by: r[2] === 'me' ? my : other, oc: r[2] === 'me' ? undefined : 1 });
    });
    Store.save(); renderAll();
    window.__t = { hid: h.id, unit, k: K(h.id, unit), since: periodStart(h) };
    return window.__t;
  }, [recs, opt || {}]);
}
const st = () => pg.evaluate(() => pinState(__t.k, __t.since));
const hm = i => pg.evaluate(i => { const v = D().visits.find(x => x.id === 'vt' + i); const d = new Date(v.at); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }, i);
const icon = () => pg.evaluate(() => houseIcon(houseById(__t.hid), null, false).options.html);
const dot = () => pg.evaluate(() => JSON.stringify(dotStyle(houseById(__t.hid), null, false)));
const fixLine = () => pg.evaluate(() => { openTarget(__t.hid, __t.unit); const f = document.querySelector('#sheet .fixline'); return f ? f.textContent : ''; });
const close = () => pg.evaluate(() => closeSheet());

// 1. 報告の場面：自分が会えた → あとでほかの人が留守
await scene([[0.3, 'met', 'me'], [0.6, 'away', 'other']]);
const dotMetAway = await dot();
ok(await st() === 'met', '1 会えたのあとにほかの人の留守：地図の印は「会えた」', await st());
{ const ic = await icon(); ok(/>会</.test(ic) && !/>留</.test(ic), '1 地図の印の字が「会」', ic); }
{ const f = await fixLine(), a = await hm(0), c = await hm(1);
  ok(/あなたの記録/.test(f) && f.includes(a) && /会えた/.test(f), '1 家の画面：あなたの記録（会えた・その時刻）', f);
  ok(/ほかの人/.test(f) && f.includes(c) && /留守/.test(f), '1 家の画面：あとからほかの人が留守と記録したことが分かる', f);
  ok(/記録し直す必要はありません/.test(f), '1 家の画面：記録し直さなくてよいと分かる', f); }
await close();

// 2. 前からの働き：留守だけ → 留
await scene([[0.5, 'away', 'me']]);
ok(await st() === 'away', '2 留守だけの家は「留守」のまま', await st());
ok(await dot() === dotMetAway, '2 小さな点（かんたん表示）は 1 と同じ「訪ねた」', await dot());
{ const f = await fixLine(); ok(/あなたの記録/.test(f) && /留守/.test(f) && !/ほかの人/.test(f) && !/会えています/.test(f), '2 家の画面：説明の文は出ない', f); }
await close();

// 3. 前の巡回で会えた → 今回は留守 → 留（前の巡回の会えたは数えない）
await scene([[0, 'met', 'me', true], [0.5, 'away', 'me']]);
ok(await st() === 'away', '3 前の巡回の会えたは数えない（今回は留守）', await st());
{ const f = await fixLine(); ok(!/会えています/.test(f), '3 家の画面：「会えています」は出ない', f); }
await close();

// 4. 自分の会えた → 自分の留守：印は会えた。家の画面は新しい自分の記録（留守）と、会えているわけ・会えたの記録を直す入口
await scene([[0.3, 'met', 'me'], [0.6, 'away', 'me']]);
ok(await st() === 'met', '4 自分の会えたのあとに自分の留守：印は「会えた」', await st());
{ const f = await fixLine(), a = await hm(0), c = await hm(1);
  ok(f.includes(c) && /留守/.test(f) && !/ほかの人/.test(f), '4 家の画面：直せる新しい記録（留守）を出す', f);
  ok(/この家は、今日/.test(f) && f.includes(a) && /地図には「会」/.test(f), '4 家の画面：今日会えているので地図は「会」と分かる', f);
  ok(/会えたの記録を直す/.test(f), '4 家の画面：会えたの記録を直す入口がある', f);
  const t2 = await pg.evaluate(() => { const x = document.querySelector('#sheet .fxmet'); if (!x) return ''; x.click(); const s = document.querySelector('#sheet'); return s.textContent; });
  ok(/記録を直す/.test(t2) && t2.includes(a) && /「留守」に変える/.test(t2), '4 入口から、会えたの記録を直す画面が開く', t2.slice(0, 120)); }
await close();

// 5. ほかの人の会えた → 自分の留守：印は「会えた」。会えているわけは出すが、直す入口は出さない（ほかの人の記録）
await scene([[0.3, 'met', 'other'], [0.6, 'away', 'me']]);
ok(await st() === 'met', '5 ほかの人の会えたのあとに自分の留守：印は「会えた」', await st());
{ const f = await fixLine();
  ok(/あなたの記録/.test(f) && /留守/.test(f) && !/ほかの人が/.test(f), '5 家の画面：あとの記録が自分なら「ほかの人が…」の文は出ない', f);
  ok(/地図には「会」/.test(f) && !/会えたの記録を直す/.test(f) && !/まちがい/.test(f), '5 家の画面：会えているわけだけ出す（直す入口なし）', f); }
await close();

// 6. 会えた → 拒否（拒否の印は外した）：拒否のまま（会えたで上書きしない）
await scene([[0.3, 'met', 'me'], [0.6, 'refused', 'other']]);
ok(await st() === 'refused', '6 会えたのあとの拒否は「拒否」のまま', await st());

// 7. 記録なし → plain
await scene([]);
ok(await st() === 'plain', '7 記録のない家は印なし', await st());

// 8. 直す：自分の留守を「会えた」に変える → 時刻は元のまま
await scene([[0.5, 'away', 'me']]);
{
  const before = await hm(0);
  const r = await pg.evaluate(() => {
    openTarget(__t.hid, __t.unit);
    document.querySelector('#sheet [data-fxline]').click();
    document.querySelector('#sheet [data-fx="met"]').click();
    const vs = visitsOf(__t.k), d = new Date(vs[0].at);
    return { n: vs.length, res: vs[0].result, hm: d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') };
  });
  ok(r.n === 1 && r.res === 'met' && r.hm === before, '8 直す：留守→会えたで、時刻は元のまま', [r, before]);
  await close();
}

// 9. 集合住宅の部屋（自分の区域）：会えた → ほかの人の留守。続けて入力の部屋のボタンも「会」
await scene([[0.3, 'met', 'me'], [0.6, 'away', 'other']], { apt: true });
ok(await st() === 'met', '9 集合住宅の部屋：印は「会えた」', await st());
{ const r = await pg.evaluate(() => { openAptSeq(__t.hid); const c = document.querySelector('#sheet .uchip[data-jump="0"]'); return c ? c.className : ''; });
  ok(/st-met/.test(r), '9 集合住宅の部屋のボタンも「会えた」', r); await close(); }

// 10. 留守宅カードの段階（返したあと）の集合住宅：部屋のボタンも地図と同じ「会」（監査 I-1）
await scene([[0.3, 'met', 'me'], [0.6, 'away', 'other']], { apt: true, stage: 'pool' });
ok(await st() === 'met', '10 留守宅カードの段階：印は「会えた」', await st());
{ const r = await pg.evaluate(() => { openAptSeq(__t.hid); const c = document.querySelector('#sheet .uchip[data-jump="0"]'); return c ? c.className : ''; });
  ok(/st-met/.test(r), '10 留守宅カードの段階：部屋のボタンも「会えた」', r); await close(); }
// 10b. 留守宅カードの段階で、返す前の巡回の会えたは数えない（返したあと留守だけ → 留）
await scene([[0, 'met', 'me', true], [0.6, 'away', 'other']], { apt: true, stage: 'pool' });
{ const r = await pg.evaluate(() => { openAptSeq(__t.hid); const c = document.querySelector('#sheet .uchip[data-jump="0"]'); return c ? c.className : ''; });
  ok(/st-away/.test(r), '10b 留守宅カードの段階：前の会えたは数えず、部屋のボタンは「留守」', r); await close(); }

// 11. 留守宅を回る段階（自分が持っている・1回目を終えた）：会えた → ほかの人の留守 → 印は「会」
await scene([[0.3, 'met', 'me'], [0.6, 'away', 'other']], { stage: 'away' });
ok(await st() === 'met', '11 留守宅を回る段階：印は「会えた」', await st());

ok(!errs.length, 'JS のエラーなし', errs);
console.log(ng ? `\n${ng}件 NG` : '\nすべて OK');
await b.close();
process.exit(ng ? 1 : 0);
