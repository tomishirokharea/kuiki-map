#!/usr/bin/env node
/* =====================================================================
   名前（家の名前・目印の名前）の棚卸しテスト（2026-11-18）
   ・「重ならないようにしたあとも、今ある名前の部品と、拡大20で見える名前が全部残っているか」を機械で確かめる
   ・場面は tools/namae-fixture.mjs（組 A〜H の家9・目印8）
   使い方（リポジトリのいちばん上で。サイトを http://localhost:8765 で開いておく）：
     node tools/namae-tanaoroshi.mjs --save tools/namae-tanaoroshi-before.json   … 今の形で集めて保存
     node tools/namae-tanaoroshi.mjs --check tools/namae-tanaoroshi-before.json  … ①部品が同じ ②拡大20で見えていた名前が全部見える（足りなければ終了コード1）
                                                                                   ③ほかの拡大の差は「わざと変えたもの」として一覧だけ出す
   --port 番号 で、ポートを変えられる（初期値 8765）
   ===================================================================== */
import fs from 'node:fs';
import { chromium, openPage, setupFixture, goTo, visibleNames, visibleMarks } from './namae-fixture.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SAVE = opt('--save'), CHECK = opt('--check'), PORT = opt('--port') || '8765';
if (!SAVE && !CHECK) { console.error('--save ファイル か --check ファイル をつけてください'); process.exit(2); }

const ZOOMS = [14, 16, 18];
const key = n => `${n.kind}:${n.text}`;

/* 歯車「地図」の画面の、名前の部品（tag・data-ui・data-v・文字） */
function collectParts() {
  const pick = e => ({ tag: e.tagName.toLowerCase(), ui: e.dataset.ui || e.dataset.nz || e.id || '', v: e.dataset.v || '', text: (e.textContent || '').replace(/\s+/g, ' ').trim() });
  const S = document.getElementById('sheet'), out = [];
  if (S) {
    S.querySelectorAll('[data-ui="aptName"],[data-ui="fcName"],[data-ui="nameScope"]').forEach(e => out.push(pick(e)));
    S.querySelectorAll('[data-nz="aptZoom"],[data-nz="fcZoom"],#uiLmZ').forEach(e => out.push(pick(e)));
  }
  document.querySelectorAll('#lmOnChk').forEach(e => out.push(pick(e)));
  return out;
}

async function collect() {
  const b = await chromium.launch();
  const { pg, ctx, errs } = await openPage(b, PORT);
  const fx = await setupFixture(pg);
  const res = { items: fx.items, parts: [], views: {}, z20: {} };
  // 部品：歯車の「地図」の画面と、凡例
  await pg.evaluate(() => { openUiSheet(); const m = document.querySelector('#sheet [data-page="map"]'); if (m) m.click(); });
  await pg.waitForTimeout(250);
  res.parts = (await pg.evaluate(collectParts)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  await pg.evaluate(() => closeSheet());
  // 区域 t1 をえらんだとき／えらんでいないとき × 拡大 × 組の中心
  for (const sel of ['t1', 'none']) {
    await pg.evaluate(s => selectTerr(s === 'none' ? null : s, { fit: false }), sel);
    for (const z of ZOOMS) for (const g of Object.keys(fx.groups)) {
      await goTo(pg, ...fx.groups[g].center, z);
      const names = (await visibleNames(pg)).map(n => key(n)).sort();
      res.views[`${sel}|z${z}|${g}`] = { names, marks: (await visibleMarks(pg)).sort() };
    }
  }
  // 名前ごとに、その場所を中心に拡大20で見えるか（区域 t1 をえらんだまま）
  await pg.evaluate(() => selectTerr('t1', { fit: false }));
  for (const it of fx.items) {
    await goTo(pg, it.lat, it.lng, 20);
    const vis = await visibleNames(pg);
    res.z20[`${it.kind}:${it.text}@${it.group}`] = {
      visible: vis.some(n => n.text === it.text && n.kind === it.kind),
      groupHouseVisible: vis.some(n => n.kind === 'h' && fx.items.some(x => x.kind === 'h' && x.group === it.group && x.text === n.text)),
      dup: !!it.dup
    };
  }
  await ctx.close(); await b.close();
  return { res, errs };
}

const { res, errs } = await collect();
const keys = Object.keys(res.z20), nVis = keys.filter(k => res.z20[k].visible).length;
const nH = res.items.filter(i => i.kind === 'h').length, nLm = res.items.length - nH;
console.log(`集めたもの：部品 ${res.parts.length}・場面の名前 家${nH}・目印${nLm}・画面のエラー ${errs.length}`);
console.log(`拡大20で見える名前：${nVis} / ${keys.length}`);
keys.filter(k => !res.z20[k].visible).forEach(k => console.log('  見えない：' + k));
errs.slice(0, 10).forEach(e => console.log('  エラー：' + e));

if (SAVE) {
  fs.writeFileSync(SAVE, JSON.stringify(Object.assign({ made: new Date().toISOString() }, res), null, 1));
  console.log('保存しました：' + SAVE);
}
if (CHECK) {
  const before = JSON.parse(fs.readFileSync(CHECK, 'utf8'));
  let ng = 0;
  // ① 部品が全部同じ
  const pb = before.parts.map(p => JSON.stringify(p)), pa = res.parts.map(p => JSON.stringify(p));
  const lost = pb.filter(p => !pa.includes(p)), added = pa.filter(p => !pb.includes(p));
  lost.forEach(p => { ng++; console.log('NG  部品が無くなった／変わった：' + p); });
  added.forEach(p => { ng++; console.log('NG  部品が増えた／変わった：' + p); });
  if (!lost.length && !added.length) console.log(`OK  ① 名前の部品は同じ（${pb.length}）`);
  // ② 拡大20で、before に見えていた名前が全部見える（dup の目印は、同じ組の建物の名前が見えていればよい）
  let n2 = 0;
  for (const [k, b] of Object.entries(before.z20)) {
    if (!b.visible) continue;
    n2++;
    const a = res.z20[k];
    const good = a && (a.visible || (a.dup && a.groupHouseVisible));
    if (!good) { ng++; console.log('NG  拡大20で見えなくなった：' + k); }
  }
  if (!ng) console.log(`OK  ② 拡大20で、前に見えていた名前 ${n2} 件は全部見える`);
  // ③ ほかの拡大の差（わざと変えたもの。不合格にはしない）
  const diffs = [];
  for (const [v, b] of Object.entries(before.views)) {
    const a = res.views[v] || { names: [], marks: [] };
    const gone = b.names.filter(n => !a.names.includes(n)), neu = a.names.filter(n => !b.names.includes(n));
    const mg = b.marks.filter(n => !a.marks.includes(n)), mn = a.marks.filter(n => !b.marks.includes(n));
    if (gone.length || neu.length || mg.length || mn.length) diffs.push(`${v}：${[...gone.map(x => '消 ' + x), ...neu.map(x => '増 ' + x), ...mg.map(x => '印消 ' + x), ...mn.map(x => '印増 ' + x)].join('、')}`);
  }
  console.log(`③ わざと変えたもの（拡大14・16・18の差）：${diffs.length} 件`);
  diffs.forEach(d => console.log('   ' + d));
  if (ng) { console.log(`不合格 ${ng}`); process.exit(1); }
  console.log('合格');
}
