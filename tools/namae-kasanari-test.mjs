#!/usr/bin/env node
/* =====================================================================
   名前の重なり（家の名前・目印の名前）の確かめ（2026-11-18）
   使い方：node tools/namae-kasanari-test.mjs [ポート]   （サイトを http://localhost:8765 で開いておく）
   R1〜R4：名前を描くところを1つにした作りかえで、見た目・動きが変わらないこと（Task 2）
           R1 は Task 3 から「before に無かった名前・印が増えない」を見る（Task 3 は二重と重なりで名前を出さなくするだけ。
           拡大18は、もとから目印どうしの重なりの判定がない大きさなので、増えることはない。消えたものは T1〜T6 と棚卸しの③で見る）
   T1〜T13：二重をまとめ、重なったら出さない（Task 3）
   T19・T20：再訪問を地図で見るとき・薄い目印の名前の順番（NK-12・NK-13）
   T14〜T18：最終監査の直し（2026-11-18）。T14・T15＝二重の相手の建物の名前が出ないときは目印にもどす（I-1・Ruling 12）
            T16＝区域の番号の札の出し直し（M-3）・T17＝動かしたあとの二度目の置き直しを省く（M-4）・T18＝歯車の説明の文（I-2）
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

  // T1：組 B・C、拡大18で、建物の名前だけ出る。その目印の名前も印も出ない
  for (const g of ['B', 'C']) {
    await goTo(pg, ...fx.groups[g].center, 18);
    const ns = await visibleNames(pg), st = await lmLayers(pg), lm = dupLm(g);
    const hOk = wantHouses(g).some(h => has(ns, 'h', h.text));
    ok(hOk && !has(ns, 'lm', lm.text) && !hasLabel(st, lm) && !hasMark(st, lm), `T1 組${g} 拡大18：建物の名前が出て、二重の目印「${lm.text}」は名前も印も出ない`,
      { names: keys(ns), mark: hasMark(st, lm) });
  }
  // T1 組A（Ruling 12 で Ruling 6 を改める）：組の建物の名前が出る。二重の目印は、建物の「宜保公民館」が出ているときだけ出さない。
  // 建物の「宜保公民館」が重なりで出ないときは、目印にもどる（拡大18なので印は出る。NK-2：建物の名前が出るときだけまとめる）
  {
    await goTo(pg, ...fx.groups.A.center, 18);
    const ns = await visibleNames(pg), st = await lmLayers(pg), lm = dupLm('A');
    const hOk = groupHouses('A').some(h => has(ns, 'h', h.text)), hDup = has(ns, 'h', '宜保公民館');
    ok(hOk && (hDup ? !hasLabel(st, lm) && !hasMark(st, lm) : hasMark(st, lm)), `T1 組A 拡大18：組の建物の名前が出て、二重の目印「${lm.text}」は建物の名前が出ているときだけ出ない`,
      { names: keys(ns), hDup, mark: hasMark(st, lm), label: hasLabel(st, lm) });
  }
  // T14（I-1）：組 A、拡大17・18・19で、建物の「宜保公民館」か、目印の「宜保公民館」（少なくとも印）のどちらかが出る
  for (const z of [17, 18, 19]) {
    await goTo(pg, ...fx.groups.A.center, z);
    const ns = await visibleNames(pg), st = await lmLayers(pg), lm = dupLm('A');
    ok(has(ns, 'h', '宜保公民館') || hasMark(st, lm) || hasLabel(st, lm), `T14 組A 拡大${z}：建物か目印の「宜保公民館」が出る（二重の相手が出ないときに両方消えない）`,
      { names: keys(ns), mark: hasMark(st, lm), label: hasLabel(st, lm) });
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
    const bad = []; let nLabels = 0;
    for (const g of GROUPS) for (let z = 15; z <= 20; z += 0.5) {
      await goTo(pg, ...fx.groups[g].center, z);
      const st = await lmLayers(pg);
      nLabels += st.labels.length;
      st.labels.filter(l => !st.marks.some(m => near(m, l))).forEach(l => bad.push(`${g}@${z}:${l.t}`));
    }
    ok(nLabels > 0 && bad.length === 0, `T7 組A〜H 拡大15〜20：名前だけ出て印がない目印はない（のべ${nLabels}個の名前を見た）`, bad);
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
// T15（I-1・最終監査の再現）：組 H の「さくら商店」の3m東に、t2 の建物「みどり食堂」を D().houses の先に足す（この試験の中だけ。namae-fixture.mjs と保存した before は変えない）。
// 区域 t1 をえらぶと、2つとも区域の外の同じ順番で「みどり食堂」が先に置かれ、建物の「さくら商店」は重なりで出ない。
// そのときは目印の「さくら商店」（名前か印）が出る（拡大17・18・19）。拡大20は全部出すので、建物の「さくら商店」が出て、目印は出ない（二重）
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  const H = fx.items.find(i => i.kind === 'h' && i.text === 'さくら商店'), lm = fx.items.find(i => i.kind === 'lm' && i.text === 'さくら商店');
  await pg.evaluate(([lat, lng]) => {
    const hs = D().houses, i = hs.findIndex(h => h.label === 'さくら商店');
    hs.splice(i, 0, { id: 'nf_hx', terrId: 't2', type: 'house', kind: 'shop', lat, lng, label: 'みどり食堂', units: [], createdAt: Date.now() });
    Store.save();
  }, [H.lat, +(H.lng + 3 * 0.00001).toFixed(7)]);
  await pg.reload();
  await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
  await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); showView('map'); selectTerr('t1', { fit: false }); });
  await pg.waitForTimeout(400);
  const order = await pg.evaluate(() => { const hs = D().houses; return hs.findIndex(h => h.label === 'みどり食堂') < hs.findIndex(h => h.label === 'さくら商店'); });
  for (const z of [17, 18, 19]) {
    await goTo(pg, ...fx.groups.H.center, z);
    const ns = await visibleNames(pg), st = await lmLayers(pg);
    ok(order && has(ns, 'h', 'みどり食堂') && (hasMark(st, lm) || hasLabel(st, lm)), `T15 組H＋となりの店 拡大${z}：目印の「さくら商店」（名前か印）が出る`,
      { order, names: keys(ns), mark: hasMark(st, lm), label: hasLabel(st, lm) });
  }
  await goTo(pg, ...fx.groups.H.center, 20);
  {
    const ns = await visibleNames(pg), st = await lmLayers(pg);
    ok(has(ns, 'h', 'さくら商店') && has(ns, 'h', 'みどり食堂') && !has(ns, 'lm', 'さくら商店') && !hasMark(st, lm) && !hasLabel(st, lm),
      'T15 組H＋となりの店 拡大20：建物の「さくら商店」が出て、目印の「さくら商店」は出ない（二重）', { names: keys(ns), mark: hasMark(st, lm), label: hasLabel(st, lm) });
  }
  allErrs.push(...errs);
  await ctx.close();
}
// T16（M-3）：renderHouses を通らずに出す建物の名前が変わったら（目印を出す 入／切・目印の名前の設定など）、区域の番号の札を出し直す。
//   変わらないときは出し直さない。renderHouses からのときは、schedule.js の包みが出し直すので、placeNames からは呼ばない（二度にしない）
// T17（M-4）：地図を動かしたあと、名前は1回だけ置く（60ms あとの二度目は、同じ画面なら省く）。書体が入れかわったとき・設定を変えたときは置きなおす
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  const base = await pg.evaluate(() => nameZoomNow());
  await goTo(pg, ...fx.groups.E.center, base - 0.5);   // 縮めた地図：目印の「白ゆり公園」が先で、建物の「ホワイトニング店」は出ない（T4）
  const pre = !has(await visibleNames(pg), 'h', 'ホワイトニング店');
  await pg.evaluate(() => { window.__rt = 0; const f = window.repaintTerrLabels; window.repaintTerrLabels = function () { window.__rt++; return f.apply(this, arguments); }; });
  const rt = () => pg.evaluate(() => window.__rt);
  await pg.evaluate(() => window.lmRepaint());
  const same = await rt();
  await pg.evaluate(() => { lsSet('kuiki_lm_on', '0'); window.lmRepaint(); });   // 凡例の「目印を出す」を切ったときと同じ
  const off = await rt(), shown = has(await visibleNames(pg), 'h', 'ホワイトニング店');
  await pg.evaluate(() => { window.__rt = 0; lsSet('kuiki_lm_on', '1'); renderHouses(); });
  const viaRh = await rt(), hidden = !has(await visibleNames(pg), 'h', 'ホワイトニング店');
  ok(pre && same === 0 && off === 1 && shown && viaRh === 0 && hidden,
    'T16 建物の名前が変わったら区域の番号の札を1回出し直す（変わらないとき・renderHouses からのときは placeNames からは呼ばない）', { pre, same, off, shown, viaRh, hidden });
  // T17
  const tag = () => pg.evaluate(() => { window.__nkEls = [...document.querySelectorAll('.leaflet-marker-icon.hname, .leaflet-marker-icon.lm-label, .leaflet-marker-icon.lm-mark')]; return window.__nkEls.length; });
  const kept = () => pg.evaluate(() => window.__nkEls.every(e => e.isConnected));
  await goTo(pg, ...fx.groups.A.center, 18);
  const n1 = await pg.evaluate(c => { map.setView(c, 18, { animate: false }); return 0; }, fx.groups.B.center).then(tag);
  await pg.waitForTimeout(300);
  const k1 = await kept();
  const n2 = await tag();
  await pg.evaluate(() => document.fonts.dispatchEvent(new Event('loadingdone')));
  await pg.waitForTimeout(300);
  const k2 = await kept();
  const n3 = await tag();
  await pg.evaluate(() => window.lmRepaint());
  const k3 = await kept();
  ok(n1 > 0 && k1 && n2 > 0 && !k2 && n3 > 0 && !k3, 'T17 動かしたあとは1回だけ置く・書体の入れかわりと設定の変更では置きなおす', { n1, k1, n2, k2, n3, k3 });
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
// T18（I-2）：歯車「地図」の「目印の名前」の説明が新しい文になっている（日本語）。スペイン語の画面では、その説明がスペイン語だけで出る（日本語が残らない）
{
  const JA = '地図の場所を見つけやすくするための名前です。左にするほど、地図を縮めても出ます。重なる名前は出しません（縮めた地図では目印を、拡大した地図では建物の名前を先に出します。いちばん拡大すると全部出ます）';
  const ES = 'Sirven para ubicar lugares en el mapa. Cuanto más a la izquierda, se ven aunque el mapa esté alejado. No se muestran los nombres que se superponen (con el mapa alejado, primero los puntos de referencia; con el mapa acercado, primero los edificios; con el zoom máximo se ven todos).';
  for (const lang of ['ja', 'es']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
    await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: `window.KUIKI_CONFIG={apiUrl:'',lang:'${lang}',homeView:[26.18,127.68],homeZoom:16,ageData:true};` }));
    await pg.goto(`http://localhost:${PORT}/index.html`);
    await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
    await pg.evaluate(() => { localStorage.clear(); });
    await pg.reload();
    await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined');
    await pg.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); UI.mode = 'detail'; applyUi(); showView('map'); });
    await pg.waitForTimeout(300);
    await pg.evaluate(() => { openUiSheet(); const m = document.querySelector('#sheet [data-page="map"]'); if (m) m.click(); });
    await pg.waitForTimeout(500);
    const small = await pg.evaluate(() => { const z = document.querySelector('#sheet #uiLmZ'), row = z && z.closest('.featrow'), s = row && row.querySelector('small'); return s ? s.textContent : null; });
    const want = lang === 'es' ? ES : JA;
    ok(small === want && (lang === 'ja' || !/[぀-ヿ一-鿿]/.test(small)) && errs.length === 0,
      `T18 歯車「地図」の目印の名前の説明（${lang}）が新しい文${lang === 'es' ? '・日本語が残らない' : ''}`, { small, errs });
    allErrs.push(...errs);
    await ctx.close();
  }
}
// T19（NK-12）：再訪問を地図で見るときは、建物の名前が先・目印は後（縮めた地図でも）。やめると今までどおり目印が先
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  const base = await pg.evaluate(() => nameZoomNow());
  await pg.evaluate(() => {
    const h = D().houses.find(x => x.label === 'ホワイトニング店');
    D().follows[K(h.id, '')] = { by: me().id, since: new Date().toISOString(), touchedAt: new Date().toISOString() };
    Store.save();
    openFollowMap();
  });
  await pg.waitForTimeout(500);
  await goTo(pg, ...fx.groups.E.center, base - 0.5);
  const nf = await visibleNames(pg);
  const onF = await pg.evaluate(() => followMap === true);
  ok(onF && has(nf, 'h', 'ホワイトニング店') && !has(nf, 'lm', '白ゆり公園'), 'T19 再訪問を地図で見る・縮めた地図：「ホワイトニング店」が出て「白ゆり公園」の名前は出ない', { onF, names: keys(nf) });
  await pg.evaluate(() => { followMap = false; renderHouses(); });
  await goTo(pg, ...fx.groups.E.center, base - 0.5);
  const nn = await visibleNames(pg);
  ok(has(nn, 'lm', '白ゆり公園') && !has(nn, 'h', 'ホワイトニング店'), 'T19 再訪問を地図で見るのをやめる：今までどおり「白ゆり公園」が出て「ホワイトニング店」は出ない', { names: keys(nn) });
  allErrs.push(...errs);
  await ctx.close();
}
// T20（NK-13）：目印の名前が薄い間は（「はっきり出る大きさ」を base-0.5 にすると、薄い範囲は 16〜base-0.5 ＝ base-0.6 は薄い）、建物の名前が先。はっきり出たら目印が先
{
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  const base = await pg.evaluate(() => nameZoomNow());
  await pg.evaluate(b0 => { UI.lmNameZ = b0 - 0.5; window.lmRepaint(); }, base);
  await goTo(pg, ...fx.groups.E.center, base - 0.6);
  const nl = await visibleNames(pg);
  ok(has(nl, 'h', 'ホワイトニング店') && !has(nl, 'lm', '白ゆり公園') && overlapsOf(nl).length === 0, 'T20 目印の名前が薄い（拡大 base-0.6）：「ホワイトニング店」が出て「白ゆり公園」の名前は出ない・重ならない', { names: keys(nl), ov: overlapsOf(nl) });
  await goTo(pg, ...fx.groups.E.center, base - 0.5);
  const nh = await visibleNames(pg);
  ok(has(nh, 'lm', '白ゆり公園') && !has(nh, 'h', 'ホワイトニング店') && overlapsOf(nh).length === 0, 'T20 目印の名前がはっきり（拡大 base-0.5）：「白ゆり公園」が出て「ホワイトニング店」は出ない・重ならない', { names: keys(nh), ov: overlapsOf(nh) });
  allErrs.push(...errs);
  await ctx.close();
}
// T13：JS のエラーなし（全部の場面）
ok(allErrs.length === 0, 'T13 JS のエラーなし（全部の場面）', allErrs.slice(0, 5));
await b.close();
process.exit(ng ? 1 : 0);
