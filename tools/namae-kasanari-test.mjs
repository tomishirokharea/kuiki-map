#!/usr/bin/env node
/* =====================================================================
   名前の重なり（家の名前・目印の名前）の確かめ（2026-11-18）
   使い方：node tools/namae-kasanari-test.mjs [ポート]   （サイトを http://localhost:8765 で開いておく）
   R1〜R3：名前を描くところを1つにした作りかえで、見た目・動きが変わらないこと（Task 2）
   T：置き場所の判定（Task 3 以降が、ここに足す）
   ===================================================================== */
import fs from 'node:fs';
import { chromium, openPage, setupFixture, goTo, visibleNames, visibleMarks } from './namae-fixture.mjs';

const PORT = process.argv[2] || '8765';
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : '  → ' + JSON.stringify(got))); };
const keys = ns => ns.map(n => `${n.kind}:${n.text}`).sort();
const before = JSON.parse(fs.readFileSync(new URL('./namae-tanaoroshi-before.json', import.meta.url), 'utf8'));

const b = await chromium.launch();
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  // R1：区域 t1 をえらび、組 A・E の中心で拡大18 → 棚卸しの before と同じ名前・印
  for (const g of ['A', 'E']) {
    await goTo(pg, ...fx.groups[g].center, 18);
    const names = keys(await visibleNames(pg)), marks = (await visibleMarks(pg)).sort();
    const w = before.views[`t1|z18|${g}`];
    ok(JSON.stringify(names) === JSON.stringify(w.names), `R1 組${g} 拡大18の名前が before と同じ`, { names, want: w.names });
    ok(JSON.stringify(marks) === JSON.stringify(w.marks), `R1 組${g} 拡大18の目印が before と同じ`, { marks, want: w.marks });
  }
  // R2：線引き中は家の名前が0個、もどすとまた出る
  await goTo(pg, ...fx.groups.A.center, 18);
  const n0 = await pg.evaluate(() => document.querySelectorAll('.hname').length);
  await pg.evaluate(() => setMode('sen'));
  await pg.waitForTimeout(400);
  const n1 = await pg.evaluate(() => document.querySelectorAll('.hname').length);
  await pg.evaluate(() => setMode('normal'));
  await pg.waitForTimeout(400);
  const n2 = await pg.evaluate(() => document.querySelectorAll('.hname').length);
  ok(n0 > 0 && n1 === 0 && n2 > 0, 'R2 線引き中は .hname が0・もどすとまた出る', { n0, n1, n2 });
  await ctx.close();
}
{
  // R3：再読み込みして地図を開いた直後に .hname が1個以上・JS のエラーなし
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  await goTo(pg, ...fx.groups.A.center, 18);
  await pg.reload();
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); showView('map'); selectTerr('t1', { fit: false }); });
  await pg.evaluate(c => { map.setView(c, 18, { animate: false }); }, fx.groups.A.center);
  await pg.waitForTimeout(500);
  const n = await pg.evaluate(() => document.querySelectorAll('.hname').length);
  ok(n >= 1 && errs.length === 0, 'R3 開いた直後に .hname が1個以上・JS エラーなし', { n, errs });
  await ctx.close();
}
await b.close();
process.exit(ng ? 1 : 0);
