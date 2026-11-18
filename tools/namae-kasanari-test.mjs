#!/usr/bin/env node
/* =====================================================================
   名前の重なり（家の名前・目印の名前）の確かめ（2026-11-18）
   使い方：node tools/namae-kasanari-test.mjs [ポート]   （サイトを http://localhost:8765 で開いておく）
   R1〜R4：名前を描くところを1つにした作りかえで、見た目・動きが変わらないこと（Task 2）
           R1 は Task 3 から「before に無かった名前・印が増えない」を見る（Task 3 は二重と重なりで名前を出さなくするだけ。
           拡大18は、もとから目印どうしの重なりの判定がない大きさなので、増えることはない。消えたものは T1〜T6 と棚卸しの③で見る）
   T1〜T13：二重をまとめ、重なったら出さない（Task 3）
   ===================================================================== */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, openPage, setupFixture, goTo, visibleNames, visibleMarks } from './namae-fixture.mjs';

const KZ = createRequire(import.meta.url)('../chizu.js');
const PORT = process.argv[2] || '8765';
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : '  → ' + JSON.stringify(got))); };
const keys = ns => ns.map(n => `${n.kind}:${n.text}`).sort();
const before = JSON.parse(fs.readFileSync(new URL('./namae-tanaoroshi-before.json', import.meta.url), 'utf8'));
const allErrs = [];   // T13：全部の場面の JS のエラー

const b = await chromium.launch();
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  // R1：区域 t1 をえらび、組 A・E の中心で拡大18 → before に無かった名前・印が増えない
  const sub = (a, w) => { const r = w.slice(); return a.every(x => { const i = r.indexOf(x); if (i < 0) return false; r.splice(i, 1); return true; }); };
  for (const g of ['A', 'E']) {
    await goTo(pg, ...fx.groups[g].center, 18);
    const names = keys(await visibleNames(pg)), marks = (await visibleMarks(pg)).sort();
    const w = before.views[`t1|z18|${g}`];
    ok(names.length > 0 && sub(names, w.names), `R1 組${g} 拡大18の名前は before にあったものだけ`, { names, want: w.names });
    ok(sub(marks, w.marks), `R1 組${g} 拡大18の目印の印は before にあったものだけ`, { marks, want: w.marks });
  }
  // R4：建物の名前は houseLayer にあり、lmRender をくり返しても増えない・DOM の数と同じ
  await goTo(pg, ...fx.groups.A.center, 18);
  const cnt = () => pg.evaluate(() => ({ layer: houseLayer.getLayers().filter(m => m._icon && m._icon.classList.contains('hname')).length, dom: document.querySelectorAll('.leaflet-marker-icon.hname').length }));
  const c1 = await cnt();
  await pg.evaluate(() => { window.lmRepaint(); window.lmRepaint(); });
  await pg.waitForTimeout(200);
  const c2 = await cnt();
  ok(c1.layer > 0 && c1.layer === c2.layer && c2.layer === c2.dom, 'R4 建物の名前は houseLayer にあり、描き直しで増えない', { c1, c2 });
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
  allErrs.push(...errs);
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
  allErrs.push(...errs);
  await ctx.close();
}

/* ===== Task 3：二重をまとめ、重なったら出さない ===== */
// 目印の印・名前を、地図の層から場所つきで集める（画面の外もふくむ。どの目印の印かを場所で見分ける）
const lmLayers = pg => pg.evaluate(() => {
  const marks = [], labels = [];
  map.eachLayer(l => {
    if (!(l instanceof L.Marker) || !l._icon) return;
    const ll = l.getLatLng(), t = l._icon.textContent.trim();
    if (l.options.pane === 'lmPane') marks.push({ lat: ll.lat, lng: ll.lng, t });
    else if (l.options.pane === 'lmLabelPane') labels.push({ lat: ll.lat, lng: ll.lng, t });
  });
  return { marks, labels };
});
const near = (a, it) => Math.abs(a.lat - it.lat) < 1e-7 && Math.abs(a.lng - it.lng) < 1e-7;
const hasMark = (st, it) => st.marks.some(m => near(m, it));
const hasLabel = (st, it) => st.labels.some(m => near(m, it));
const has = (ns, kind, text) => ns.some(n => n.kind === kind && n.text === text);
// 出ている名前の DOM の四角どうしが、1px より多く重なっている組を返す
const overlapsOf = ns => {
  const bad = [];
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
    const a = ns[i].r, c = ns[j].r;
    const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (ox > 1 && oy > 1) bad.push(`${ns[i].kind}:${ns[i].text} × ${ns[j].kind}:${ns[j].text}（${ox.toFixed(1)}×${oy.toFixed(1)}）`);
  }
  return bad;
};
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
// 歯車の「地図」の画面で、data-ui のボタンを押す（ほかの試験と同じ押し方）
const gear = async (pg, k, v) => {
  await pg.evaluate(() => { openUiSheet(); const m = document.querySelector('#sheet [data-page="map"]'); if (m) m.click(); });
  await pg.waitForTimeout(250);
  const hit = await pg.evaluate(([k, v]) => { const x = document.querySelector(`#sheet [data-ui="${k}"][data-v="${v}"]`); if (x) x.click(); return !!x; }, [k, v]);
  await pg.waitForTimeout(300);
  await pg.evaluate(() => closeSheet());
  await pg.waitForTimeout(200);
  return hit;
};
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  const base = await pg.evaluate(() => nameZoomNow());
  const item = (kind, text) => fx.items.find(i => i.kind === kind && i.text === text);
  const dupLm = g => fx.items.find(i => i.kind === 'lm' && i.group === g && i.dup);
  const groupHouses = g => fx.items.filter(i => i.kind === 'h' && i.group === g);
  // 組 A は、同じ区域の「宜保ハイツ」が HOUSE_NAMES の先にあり、拡大した地図では同じ順番（えらんだ区域の建物）なので先に置かれる。
  // そのため「宜保公民館」の建物の名前は重なりで出ないことがある（NK-3・NK-4 のとおり）。組 A は「組の建物の名前が出る」で見る
  const wantHouses = g => g === 'A' ? groupHouses(g) : groupHouses(g).filter(h => KZ.sameName(h.text, dupLm(g).text));

  // T1：組 A・B・C、拡大18で、建物の名前だけ出る。その目印の名前も印も出ない
  for (const g of ['A', 'B', 'C']) {
    await goTo(pg, ...fx.groups[g].center, 18);
    const ns = await visibleNames(pg), st = await lmLayers(pg), lm = dupLm(g);
    const hOk = wantHouses(g).some(h => has(ns, 'h', h.text));
    ok(hOk && !has(ns, 'lm', lm.text) && !hasLabel(st, lm) && !hasMark(st, lm), `T1 組${g} 拡大18：建物の名前が出て、二重の目印「${lm.text}」は名前も印も出ない`,
      { names: keys(ns), mark: hasMark(st, lm) });
  }
  // T1b：組 A、base−0.5 で「宜保公民館」（建物）が出て「宜保ハイツ」は出ない（二重で目印の順番をもらうため）
  await goTo(pg, ...fx.groups.A.center, base - 0.5);
  {
    const ns = await visibleNames(pg);
    ok(has(ns, 'h', '宜保公民館') && !has(ns, 'h', '宜保ハイツ') && !has(ns, 'lm', '宜保公民館'), `T1b 組A 拡大${base - 0.5}：建物の宜保公民館が出て、宜保ハイツは出ない`, keys(ns));
  }
  // T2：組 A・B・C、拡大20でも、二重の目印は出ない
  for (const g of ['A', 'B', 'C']) {
    await goTo(pg, ...fx.groups[g].center, 20);
    const ns = await visibleNames(pg), st = await lmLayers(pg), lm = dupLm(g);
    const hOk = groupHouses(g).every(h => has(ns, 'h', h.text));   // 拡大20は重なっても全部出す
    ok(hOk && !has(ns, 'lm', lm.text) && !hasLabel(st, lm) && !hasMark(st, lm), `T2 組${g} 拡大20：建物の名前が全部出て、二重の目印「${lm.text}」は出ない`,
      { names: keys(ns), mark: hasMark(st, lm) });
  }
  // T3：組 D、拡大18で、建物と目印の「にこにこ公園」が両方出る（60m はなれているので二重ではない）
  await goTo(pg, ...fx.groups.D.center, 18);
  {
    const ns = await visibleNames(pg), st = await lmLayers(pg);
    ok(has(ns, 'h', 'にこにこ公園') && has(ns, 'lm', 'にこにこ公園') && hasMark(st, item('lm', 'にこにこ公園')), 'T3 組D 拡大18：建物と目印のにこにこ公園が両方出る', keys(ns));
  }
  // T4：組 E：base+1 では「ホワイトニング店」だけ、base−0.5 では「白ゆり公園」だけ、拡大20では両方
  for (const [z, wantH, wantL] of [[base + 1, true, false], [base - 0.5, false, true], [20, true, true]]) {
    await goTo(pg, ...fx.groups.E.center, z);
    const ns = await visibleNames(pg);
    ok(has(ns, 'h', 'ホワイトニング店') === wantH && has(ns, 'lm', '白ゆり公園') === wantL,
      `T4 組E 拡大${z}：ホワイトニング店${wantH ? '出る' : '出ない'}・白ゆり公園${wantL ? '出る' : '出ない'}`, keys(ns));
  }
  // T5：組 G：base+1 で「アパートA棟」だけ出る。拡大20では両方
  for (const [z, wantB] of [[base + 1, false], [20, true]]) {
    await goTo(pg, ...fx.groups.G.center, z);
    const ns = await visibleNames(pg);
    ok(has(ns, 'h', 'アパートA棟') && has(ns, 'h', 'アパートB棟') === wantB, `T5 組G 拡大${z}：アパートA棟が出る・B棟${wantB ? 'も出る' : 'は出ない'}`, keys(ns));
  }
  // T6：組 F：拡大18で「会館」が出て「ローソン豊見城」は出ない。拡大14では「ローソン豊見城」の印も出ない、「会館」の印は出る
  await goTo(pg, ...fx.groups.F.center, 18);
  {
    const ns = await visibleNames(pg);
    ok(has(ns, 'lm', '会館') && !has(ns, 'lm', 'ローソン豊見城'), 'T6 組F 拡大18：会館が出て、ローソン豊見城は出ない', keys(ns));
  }
  await goTo(pg, ...fx.groups.F.center, 14);
  {
    const st = await lmLayers(pg);
    ok(hasMark(st, item('lm', '会館')) && !hasMark(st, item('lm', 'ローソン豊見城')) && !hasLabel(st, item('lm', 'ローソン豊見城')),
      'T6 組F 拡大14：会館の印は出る・ローソン豊見城は印も名前も出ない', st);
  }
  // T7：組 A〜H、拡大15〜20（0.5ずつ）で、名前だけ出て印がない目印がない
  {
    const bad = [];
    for (const g of GROUPS) for (let z = 15; z <= 20; z += 0.5) {
      await goTo(pg, ...fx.groups[g].center, z);
      const st = await lmLayers(pg);
      st.labels.filter(l => !st.marks.some(m => near(m, l))).forEach(l => bad.push(`${g}@${z}:${l.t}`));
    }
    ok(bad.length === 0, 'T7 組A〜H 拡大15〜20：名前だけ出て印がない目印はない', bad);
  }
  // T8：目印を「切」にしても、建物の名前は出る。目印は0
  await pg.evaluate(() => { lsSet('kuiki_lm_on', '0'); renderHouses(); });
  for (const g of ['A', 'B', 'C']) {
    await goTo(pg, ...fx.groups[g].center, 18);
    const ns = await visibleNames(pg);
    const nLm = await pg.evaluate(() => document.querySelectorAll('.lm-label, .lm-mark').length);
    const hOk = wantHouses(g).some(h => has(ns, 'h', h.text));
    ok(hOk && nLm === 0, `T8 組${g} 目印「切」：建物の名前が出る・目印は0`, { names: keys(ns), nLm });
  }
  await pg.evaluate(() => { lsSet('kuiki_lm_on', '1'); renderHouses(); });
  // T9：歯車で「学校・役所・お店などの名前」を出さない → 組 A・B・C の目印が名前と印で出る
  {
    const hit = await gear(pg, 'fcName', 'off');
    for (const g of ['A', 'B', 'C']) {
      await goTo(pg, ...fx.groups[g].center, 18);
      const ns = await visibleNames(pg), st = await lmLayers(pg), lm = dupLm(g);
      ok(hit && has(ns, 'lm', lm.text) && hasMark(st, lm), `T9 組${g} fcName 出さない：目印「${lm.text}」が名前と印で出る`, { hit, names: keys(ns) });
    }
    await gear(pg, 'fcName', 'on');
  }
  // T10：名前を出す範囲「えらんだ区域だけ」 → 組 H の目印「さくら商店」が名前と印で出る（t2 の家の名前は出ないため）
  {
    const hit = await gear(pg, 'nameScope', 'sel');
    await goTo(pg, ...fx.groups.H.center, 18);
    const ns = await visibleNames(pg), st = await lmLayers(pg);
    ok(hit && !has(ns, 'h', 'さくら商店') && has(ns, 'lm', 'さくら商店') && hasMark(st, item('lm', 'さくら商店')), 'T10 組H 範囲「えらんだ区域だけ」：目印のさくら商店が名前と印で出る', { hit, names: keys(ns) });
    await gear(pg, 'nameScope', 'all');
  }
  // T11：地図を45度回して、拡大16・18で、出ている名前どうしが重ならない
  await pg.evaluate(() => setMapDeg(45));
  for (const z of [16, 18]) {
    const bad = [];
    let n = 0;
    for (const g of GROUPS) {
      await goTo(pg, ...fx.groups[g].center, z);
      const ns = await visibleNames(pg);
      n += ns.length;
      overlapsOf(ns).forEach(x => bad.push(`${g}：${x}`));
    }
    ok(n > 0 && bad.length === 0, `T11 45度回して拡大${z}：名前の四角どうしが重ならない（のべ${n}個）`, bad);
  }
  await pg.evaluate(() => setMapDeg(0));
  allErrs.push(...errs);
  await ctx.close();
}
// T12：かんたん表示・幅375px と、くわしい表示・幅390px で、拡大15〜19の名前どうしが重ならない
for (const [simple, w] of [[true, 375], [false, 390]]) {
  const { pg, ctx, errs } = await openPage(b, PORT, { w, simple });
  const fx = await setupFixture(pg);
  for (const z of [15, 16, 17, 18, 19]) {
    const bad = [];
    let n = 0;
    for (const g of GROUPS) {
      await goTo(pg, ...fx.groups[g].center, z);
      const ns = await visibleNames(pg);
      n += ns.length;
      overlapsOf(ns).forEach(x => bad.push(`${g}：${x}`));
    }
    ok(n > 0 && bad.length === 0, `T12 ${simple ? 'かんたん' : 'くわしい'}・幅${w}px 拡大${z}：名前の四角どうしが重ならない（のべ${n}個）`, bad);
  }
  allErrs.push(...errs);
  await ctx.close();
}
// T13：JS のエラーなし（全部の場面）
ok(allErrs.length === 0, 'T13 JS のエラーなし（全部の場面）', allErrs.slice(0, 5));
await b.close();
process.exit(ng ? 1 : 0);
