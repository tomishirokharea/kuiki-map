// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/hyouji-5ken-test.mjs [ポート]
// 2026.13.156：「区域をもらう」（個人・集まり）と「留守宅カードをえらぶ」（個人・グループ）は、かんたん・くわしいとも、
// はじめ5件と「もっと見る（あと○件）」にする（R A さん・2026-11-17）。押すと残りを全部（留守宅カードは20件まで）。
// 並べ方を変えた・地図で見てもどった・地域のようすからもどったときは開いたまま（地図からは、もとの位置にもどる）。
// 留守宅カードの一覧にも「地図」（個人・グループ・全体の集まり）。開き直し・区域カード⇔留守宅カードの切りかえは5件にもどる。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const cfg = lang => `window.KUIKI_CONFIG={apiUrl:'',lang:'${lang}',homeView:[26.18,127.68],homeZoom:16,ageData:true};`;
const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };
const N_TERR = 30, N_AWAY = 24;

// 場面：試作のデータ（区域4枚）に写しを足し、空いている区域を N_TERR 枚にする。留守宅カードの候補は N_AWAY 件にする
async function page(w, simple, lang = 'ja', real = false) {
  const ctx = await b.newContext({ viewport: { width: w, height: w > 800 ? 1180 : 844 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google|open-meteo/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: cfg(lang) }));
  await pg.goto(`http://localhost:${port}/index.html`);
  await pg.waitForFunction(() => typeof openRequestSheet === 'function' && typeof openAwayPick === 'function' && typeof Store !== 'undefined' && Store.data);
  await pg.evaluate(({ simple, N_TERR, N_AWAY, real }) => {
    const s = document.getElementById('splash'); if (s) s.remove();
    UI.mode = simple ? 'simple' : 'detail'; UI.hello = 'off'; applyUi(); // 毎日のひと言（#hello）は試験のじゃまになるので出さない
    const hl = document.getElementById('hello'); if (hl) hl.remove();
    const base = D().territories.filter(t => !t.dummy && !isSpecial(t) && okPoly(t.polygon));
    for (let i = 0; freeTerrs().length < N_TERR; i++) {
      const c = JSON.parse(JSON.stringify(base[i % base.length]));
      c.id = 'tcopy' + i; c.no = '9' + i; c.name = '試験の区域' + i;
      delete c.holder; delete c.lead; delete c.lentAt; delete c.group; c.lend = 'open';
      D().territories.push(c);
    }
    D().territories.forEach(t => { if (!t.holder && !t.dummy) t.lend = 'open'; });
    Store.save();
    // 留守宅カードの候補（試作のデータには、留守の家がほとんどないため、候補の作り方だけ差しかえる）。real のときは本物の候補（行ける時間を全部にする）
    if (real) { me().slots = SLOTS.slice(); Store.save(); renderAll(); return; }
    window.awaySuggestions = function () {
      const ts = freeTerrs();
      const H = D().territories.flatMap(t => housesOf(t.id)).filter(h => h.lat != null); // 家の場所（地図の点）は、試作のデータの家を使う
      return Array.from({ length: N_AWAY }, (_, i) => ({ t: ts[i % ts.length], slot: SLOTS[i % SLOTS.length],
        keys: H.length ? [H[i % H.length].id + '|', H[(i + 1) % H.length].id + '|'] : ['k' + i + 'a', 'k' + i + 'b'], focus: false, ext: false, dist: null }));
    };
    renderAll();
  }, { simple: !!simple, N_TERR, N_AWAY, real });
  return { pg, ctx, errs };
}
const reqRows = pg => pg.evaluate(() => document.querySelectorAll('#sheet article.pick').length);
const awayRows = pg => pg.evaluate(() => document.querySelectorAll('#sheet article.pick, #sheet article.ritem').length);
const txt = (pg, sel) => pg.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; }, sel);
const clk = (pg, sel) => pg.click(sel, { timeout: 3000 }).catch(e => { if (process.env.DBG) console.log('click failed', sel, String(e).split('\n').slice(0, 12).join(' / ')); }); // 見つからないときは、次の確かめで NG にする
// 横のはみ出しは、下から出る画面（#sheet）の中だけで数える（試作モードの上の「使う人」の欄は、スペイン語ではもとからはみ出すため）
const over = pg => pg.evaluate(() => Math.max(0, ...[...document.querySelectorAll('#sheet *')].map(e => { const r = e.getBoundingClientRect(); return r.width ? Math.round(r.right - innerWidth) : 0; })));

for (const [w, simple] of [[390, false], [1280, false], [390, true], [1280, true]]) {
  const tag = `${w}px・${simple ? 'かんたん' : 'くわしい'}`;
  const { pg, ctx, errs } = await page(w, simple);
  const nFree = await pg.evaluate(() => freeTerrs().length);

  // 区域をもらう（個人）
  await pg.evaluate(() => openRequestSheet(false));
  ok(await reqRows(pg) === 5, `${tag}：個人の区域をもらう　はじめは5件`, await reqRows(pg));
  ok(await txt(pg, '#reqMore') === `もっと見る（あと${nFree - 5}件）`, `${tag}：「もっと見る（あと${nFree - 5}件）」`, await txt(pg, '#reqMore'));
  ok(await over(pg) <= 0, `${tag}：横にはみ出さない（5件）`, await over(pg));
  await clk(pg, '#reqMore');
  ok(await reqRows(pg) === nFree && await txt(pg, '#reqMore') === null, `${tag}：押すと全部（${nFree}件）出て、ボタンは消える`, await reqRows(pg));
  ok(await pg.evaluate(() => !!document.querySelector('#sheet [data-take]') && !!document.querySelector('#sheet [data-peek]')), `${tag}：受け取る・地図のボタンは今までどおり`, null);
  // 並べ方を変えても、開いたまま
  await pg.evaluate(() => { const d = document.querySelector('#sheet details.ksort'); if (d) d.open = true; });
  await clk(pg, '#sheet [data-rsort="long"]');
  ok(await reqRows(pg) === nFree, `${tag}：並べ方を変えても開いたまま`, await reqRows(pg));
  // 地図で見てもどっても、開いたまま・同じ位置
  const ry0 = await pg.evaluate(() => { const S = document.querySelector('#sheet'), b = S.querySelectorAll('[data-peek]')[12]; b.scrollIntoView(); b.setAttribute('data-t12', '1'); return S.scrollTop; });
  await clk(pg, '#sheet [data-t12]');
  await pg.waitForTimeout(400);
  await clk(pg, '#peekBar [data-pk="back"]');
  await pg.waitForTimeout(300);
  ok(await reqRows(pg) === nFree, `${tag}：地図で見て「一覧にもどる」と開いたまま`, await reqRows(pg));
  { const y = await pg.evaluate(() => document.querySelector('#sheet').scrollTop); ok(Math.abs(y - ry0) <= 4, `${tag}：区域をもらう　地図からもどると、もとの位置`, [y, ry0]); }
  // 開き直すと5件にもどる
  await pg.evaluate(() => { closeSheet(); openRequestSheet(false); });
  ok(await reqRows(pg) === 5, `${tag}：開き直すと5件にもどる`, await reqRows(pg));

  // 区域をもらう（集まり）
  await pg.evaluate(() => openRequestSheet(true));
  ok(await reqRows(pg) === 5 && /^もっと見る（あと\d+件）$/.test(await txt(pg, '#reqMore') || ''), `${tag}：集まりで使う区域をもらう　はじめは5件と「もっと見る」`, [await reqRows(pg), await txt(pg, '#reqMore')]);
  ok(await pg.evaluate(() => !!document.querySelector('#sheet [data-ruse="all"]') && !!document.querySelector('#sheet [data-gaway]')), `${tag}：集まりの切りかえ（グループ／全体・区域カード／留守宅カード）は今までどおり`, null);
  await clk(pg, '#reqMore');
  // 全体の集まりに切りかえても、開いたまま
  await clk(pg, '#sheet [data-ruse="all"]');
  ok(await reqRows(pg) === nFree, `${tag}：全体の集まりに切りかえても開いたまま`, await reqRows(pg));
  await clk(pg, '#sheet [data-peek]');
  await pg.waitForTimeout(400);
  await clk(pg, '#peekBar [data-pk="back"]');
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => (document.querySelector('#sheet h2') || {}).textContent === '集まりで使う区域をもらう' && reqUse === 'all' && document.querySelector('#sheet [data-ruse="all"]').getAttribute('aria-pressed') === 'true') && await reqRows(pg) === nFree,
    `${tag}：集まりの区域をもらうも、地図から同じ一覧（全体の集まり・もっと見る）にもどる`, null);

  // 留守宅カード（グループ）：区域カードから切りかえると5件
  await clk(pg, '#sheet [data-gaway]');
  const shownMax = Math.min(N_AWAY, 20);
  ok(await awayRows(pg) === 5, `${tag}：グループの留守宅カード　はじめは5件`, await awayRows(pg));
  ok(await txt(pg, '#apMore') === `もっと見る（あと${shownMax - 5}件）`, `${tag}：「もっと見る（あと${shownMax - 5}件）」`, await txt(pg, '#apMore'));
  await clk(pg, '#apMore');
  ok(await awayRows(pg) === shownMax && await txt(pg, '#apMore') === null, `${tag}：押すと${shownMax}件（20件まで）`, await awayRows(pg));
  // 時間帯を変えても開いたまま
  await pg.evaluate(() => { const s = document.querySelector('#apGSlot'); s.value = s.options[(s.selectedIndex + 1) % s.options.length].value; s.dispatchEvent(new Event('change')); });
  ok(await awayRows(pg) === shownMax, `${tag}：集まりの時間帯を変えても開いたまま`, await awayRows(pg));
  // 地図で見てもどっても、全体の集まり・時間帯・もっと見るはそのまま
  {
    const before = await pg.evaluate(() => ({ use: reqUse, slot: document.querySelector('#apGSlot').value, h: document.querySelector('#sheet h2').textContent }));
    await clk(pg, '#sheet [data-apeek="7"]');
    await pg.waitForTimeout(400);
    ok(await pg.evaluate(() => currentView === 'map' && !document.querySelector('#peekBar').hidden), `${tag}：集まりの留守宅カードの「地図」で地図が開く`, null);
    await clk(pg, '#peekBar [data-pk="back"]');
    await pg.waitForTimeout(300);
    const after = await pg.evaluate(() => ({ use: reqUse, slot: (document.querySelector('#apGSlot') || {}).value, h: (document.querySelector('#sheet h2') || {}).textContent }));
    ok(JSON.stringify(before) === JSON.stringify(after) && await awayRows(pg) === shownMax, `${tag}：集まりの留守宅カードも、地図から同じ一覧（全体の集まり・時間帯・もっと見る）にもどる`, [before, after, await awayRows(pg)]);
  }
  // 区域カードにもどすと5件
  await clk(pg, '#sheet [data-gterr]');
  ok(await reqRows(pg) === 5, `${tag}：留守宅カードから区域カードに切りかえると5件`, await reqRows(pg));

  // 留守宅カード（個人）
  await pg.evaluate(() => { closeSheet(); openAwayPick(false); });
  ok(await awayRows(pg) === 5 && await txt(pg, '#apMore') === `もっと見る（あと${shownMax - 5}件）`, `${tag}：個人の留守宅カード　はじめは5件と「もっと見る」`, [await awayRows(pg), await txt(pg, '#apMore')]);
  ok(await pg.evaluate(() => !!document.querySelector('#sheet [data-awaytake2]')), `${tag}：留守宅カードの「受け取る」は今までどおり`, null);
  await clk(pg, '#apMore');
  // 留守宅カードの「地図」（2026.13.156）：どの行にもある。押すと地図でその家に点・下の帯に「受け取る」「一覧にもどる」。もどると同じ一覧・同じ位置
  ok(await pg.evaluate(() => [...document.querySelectorAll('#sheet article')].every(a => { const b = a.querySelector('[data-apeek]'); return b && b.textContent.trim() === '地図' && b.getBoundingClientRect().height >= 44; })), `${tag}：留守宅カードのどの行にも「地図」（高さ44px以上）`, null);
  {
    const y0 = await pg.evaluate(() => { const S = document.querySelector('#sheet'), b = S.querySelectorAll('[data-apeek]')[9]; b.scrollIntoView(); return S.scrollTop; });
    await pg.evaluate(() => { window.__took = null; window.takeAwayCard = (tid, slot, g) => { window.__took = [tid, slot, !!g]; }; });
    const want = await pg.evaluate(() => { const b = document.querySelectorAll('#sheet [data-apeek]')[9]; const a = b.closest('article'); return { no: a.querySelector('.stamp, .kp-head b').textContent.replace('区域', '').trim(), slot: a.querySelector('[data-slot]').dataset.slot }; });
    await clk(pg, '#sheet [data-apeek="9"]');
    await pg.waitForTimeout(500);
    const pk = await pg.evaluate(() => { const b = document.querySelector('#peekBar'); return { view: currentView, bar: !!b && !b.hidden, txt: b ? b.textContent : '', pts: document.querySelectorAll('.pk-pt').length, take: !!(b && b.querySelector('[data-pk="take"]')), back: !!(b && b.querySelector('[data-pk="back"]')) }; });
    ok(pk.view === 'map' && pk.bar && pk.take && pk.back && pk.txt.includes(want.no) && /留守宅カード/.test(pk.txt), `${tag}：留守宅カードの「地図」で地図が開き、帯に区域${want.no}・「受け取る」「一覧にもどる」`, pk);
    ok(pk.pts >= 1, `${tag}：カードの家に点が出る`, pk.pts);
    await clk(pg, '#peekBar [data-pk="back"]');
    await pg.waitForTimeout(300);
    const bk = await pg.evaluate(() => ({ title: (document.querySelector('#sheet h2') || {}).textContent, open: !document.querySelector('#sheet').hidden, y: document.querySelector('#sheet').scrollTop }));
    ok(bk.open && bk.title === '留守宅カードをえらぶ' && await awayRows(pg) === shownMax, `${tag}：「一覧にもどる」で、同じ留守宅カードの一覧（もっと見るも開いたまま）`, [bk, await awayRows(pg)]);
    ok(Math.abs(bk.y - y0) <= 4, `${tag}：もとの位置にもどる`, [bk.y, y0]);
    // 帯の「受け取る」：そのカード（区域・時間帯）を受け取る
    await clk(pg, '#sheet [data-apeek="9"]');
    await pg.waitForTimeout(400);
    await clk(pg, '#peekBar [data-pk="take"]');
    const took = await pg.evaluate(() => window.__took && [terrById(window.__took[0]).no, window.__took[1], window.__took[2]]);
    ok(took && took[0] === want.no && took[1] === want.slot && took[2] === false, `${tag}：帯の「受け取る」で、その留守宅カードを受け取る`, [took, want]);
    await pg.evaluate(() => { showView('cards'); openAwayPick(false); });
    await clk(pg, '#apMore');
  }
  if (!simple) {
    // くわしい：並べ方を変えても開いたまま
    await clk(pg, '#sheet [data-asort="many"]');
    ok(await awayRows(pg) === shownMax, `${tag}：留守宅カードの並べ方を変えても開いたまま`, await awayRows(pg));
    // 地域のようすから「もどる」と開いたまま（地域のようすが出る区域があるときだけ）
    const hasProf = await pg.evaluate(() => !!document.querySelector('#sheet [data-prof]'));
    if (hasProf) {
      await clk(pg, '#sheet [data-prof]');
      await clk(pg, '#profBack');
      ok(await awayRows(pg) === shownMax, `${tag}：地域のようすから「もどる」と開いたまま`, await awayRows(pg));
    } else {
      // 試作のデータには地域のようすの出る区域がないので、「もどる」が呼ぶ形（openAwayPick(…, true)）で確かめる
      await pg.evaluate(() => openAwayPick(false, true));
      ok(await awayRows(pg) === shownMax, `${tag}：地域のようすから「もどる」形で開き直すと開いたまま`, await awayRows(pg));
    }
  }
  ok(await over(pg) <= 0, `${tag}：横にはみ出さない（全部）`, await over(pg));
  ok(!errs.length, `${tag}：JS のエラーなし`, errs);
  await ctx.close();
}

// 受け取れる区域3枚・係に頼む区域が残り：受け取れる3＋係に頼む2。見出しは両方
{
  const { pg, ctx, errs } = await page(390, false);
  const r = await pg.evaluate(() => {
    D().settings.autoFree = 0;
    const fs = freeTerrs(); fs.forEach((t, i) => { if (i < 3) t.lend = 'open'; else delete t.lend; delete t.free; });
    Store.save(); openRequestSheet(false);
    const S = document.querySelector('#sheet');
    return { take: S.querySelectorAll('[data-take]').length, ask: S.querySelectorAll('article [data-ask]').length,
      heads: [...S.querySelectorAll('p.q')].map(p => p.textContent).join('|'), all: S.querySelectorAll('[data-ask=""]').length };
  });
  ok(r.take === 3 && r.ask === 2, '受け取れる3枚＋係に頼む2枚で5件', r);
  ok(/今すぐ受け取れる区域/.test(r.heads) && /係に頼む区域/.test(r.heads), '「今すぐ受け取れる区域」「係に頼む区域」の見出しは両方出る', r.heads);
  ok(r.all === 1, '「どこでもよいので係に頼む」は今までどおり', r);
  ok(!errs.length, 'JS のエラーなし（受け取れる・係に頼むがまざる）', errs);
  await ctx.close();
}

// ちょうど5件・4件：「もっと見る」は出さない
for (const n of [5, 4]) {
  const { pg, ctx } = await page(390, false);
  const r = await pg.evaluate(n => {
    freeTerrs().slice(n).forEach(t => { t.lend = 'stop'; });
    Store.save(); openRequestSheet(false);
    const a = document.querySelectorAll('#sheet article.pick').length, m = !!document.querySelector('#reqMore');
    const all = freeTerrs();
    window.awaySuggestions = () => Array.from({ length: n }, (_, i) => ({ t: all[i % all.length], slot: SLOTS[0], keys: ['x' + i], focus: false, ext: false, dist: null }));
    openAwayPick(false);
    return { a, m, b: document.querySelectorAll('#sheet article.ritem, #sheet article.pick').length, m2: !!document.querySelector('#apMore') };
  }, n);
  ok(r.a === n && !r.m && r.b === n && !r.m2, `ちょうど${n}件：全部出て、「もっと見る」は出ない（区域・留守宅カード）`, r);
  await ctx.close();
}

// 留守宅カードを持てる枚数に届いているとき：地図の帯に「受け取る」を出さない（一覧の「受け取る」が押せないのと同じ）
for (const simple of [false, true]) {
  const { pg, ctx, errs } = await page(390, simple);
  await pg.evaluate(() => { D().settings.awayMax = 0; openAwayPick(false); });
  const dis = await pg.evaluate(() => [...document.querySelectorAll('#sheet [data-awaytake2]')].every(b => b.disabled));
  await clk(pg, '#sheet [data-apeek="0"]');
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => ({ bar: !document.querySelector('#peekBar').hidden, take: !!document.querySelector('#peekBar [data-pk="take"]'), back: !!document.querySelector('#peekBar [data-pk="back"]') }));
  ok(dis && r.bar && !r.take && r.back, `${simple ? 'かんたん' : 'くわしい'}：持てる枚数に届いているときは、地図の帯に「受け取る」を出さない`, [dis, r]);
  ok(!errs.length, `${simple ? 'かんたん' : 'くわしい'}：JS のエラーなし（持てる枚数に届いている）`, errs);
  await ctx.close();
}

// 本物の候補・本物の受け取り（監査 L1）：地図の帯の「受け取る」で、押した行と同じ区域・時間帯・グループ・全体の集まりのカードができる
for (const simple of [false, true]) for (const who of ['p', 'grp', 'all']) {
  const tag = `${simple ? 'かんたん' : 'くわしい'}・${{ p: '個人', grp: 'グループ奉仕', all: '全体の集まり' }[who]}`;
  const { pg, ctx, errs } = await page(390, simple, 'ja', true);
  await pg.evaluate(who => {
    if (who === 'p') { openAwayPick(false); return; }
    openRequestSheet(true); if (who === 'all') document.querySelector('#sheet [data-ruse="all"]').click();
    document.querySelector('#sheet [data-gaway]').click();
  }, who);
  await pg.waitForTimeout(300);
  const row = await pg.evaluate(() => { const b = document.querySelector('#sheet [data-apeek="0"]'); const a = b && b.closest('article'); const t = a && a.querySelector('[data-slot]');
    return t ? { tid: t.dataset.awaytake2, slot: t.dataset.slot, n: document.querySelectorAll('#sheet [data-apeek]').length } : null; });
  ok(!!row, `${tag}：本物の候補で、留守宅カードの行と「地図」が出る`, row);
  if (row) {
    const n0 = await pg.evaluate(() => D().awayCards.length);
    await clk(pg, '#sheet [data-apeek="0"]');
    await pg.waitForTimeout(400);
    const pts = await pg.evaluate(() => document.querySelectorAll('.pk-pt').length);
    await clk(pg, '#peekBar [data-pk="take"]');
    await pg.waitForTimeout(300);
    const c = await pg.evaluate(() => { const c = D().awayCards[D().awayCards.length - 1]; return c && { tid: c.terrId, slot: c.slot, group: c.group || null, use: c.use || null, n: c.keys.length }; });
    const n1 = await pg.evaluate(() => D().awayCards.length);
    const gOk = who === 'p' ? c && c.group === null && c.use === null : who === 'grp' ? c && !!c.group && c.use === null : c && !!c.group && c.use === 'all';
    ok(n1 === n0 + 1 && c && c.tid === row.tid && c.slot === row.slot && gOk, `${tag}：帯の「受け取る」で、同じ区域・時間帯・集まりのカードができる`, [row, c]);
    ok(pts >= 1 && pts <= c.n, `${tag}：カードの家に点が出る（${pts}）`, [pts, c && c.n]);
  }
  ok(!errs.length, `${tag}：JS のエラーなし`, errs);
  await ctx.close();
}

// スペイン語
{
  const { pg, ctx, errs } = await page(390, false, 'es');
  await pg.evaluate(() => openRequestSheet(false));
  await pg.waitForTimeout(300);
  const t = await txt(pg, '#reqMore');
  ok(/Ver más/.test(t || ''), 'スペイン語：「もっと見る」が訳される', t);
  await pg.evaluate(() => openAwayPick(false));
  await pg.waitForTimeout(300);
  const al = await pg.evaluate(() => (document.querySelector('#sheet [data-apeek]') || {}).getAttribute && document.querySelector('#sheet [data-apeek]').getAttribute('aria-label'));
  ok(/^Ver en el mapa las casas/.test(al || ''), 'スペイン語：留守宅カードの「地図」の読み上げが訳される', al);
  await clk(pg, '#sheet [data-apeek="0"]');
  await pg.waitForTimeout(500);
  const sub = await pg.evaluate(() => (document.querySelector('#peekBar .pk-s') || {}).textContent || '');
  ok(/casas \(puntos naranjas\)/.test(sub) && !/[\u3040-\u30ff]/.test(sub), 'スペイン語：地図の帯の説明が訳される', sub);
  await pg.screenshot({ path: '/tmp/es-peek.png' });
  ok(await over(pg) <= 0, 'スペイン語：横にはみ出さない', await over(pg));
  ok(!errs.length, 'スペイン語：JS のエラーなし', errs);
  await ctx.close();
}

await b.close();
console.log(ng ? `\nNG ${ng}件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
