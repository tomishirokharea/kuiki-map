/* =========================================================
   apt-import.js  区域マップ：アパートの登録（やり直し・取り込み）  ※区域係だけ

   使いはじめの前に、実際のアパートの一覧に合わせて、次の2つをやり直すための画面です。
   ① リセット：訪問の記録・拒否・再訪問・留守宅カードを消し、アパートの印と部屋を元の「家」にもどす
        （「仮の家」の印と場所はそのまま。区域の線・担当・予定・利用者には手をふれない）
   ② 取り込み：個人情報を除いた一覧（CSV）から、建物の名前・階・オートロック・立入禁止を登録する
        ・住所は国土地理院の住所検索で地図の位置にするだけで、アプリには住所を保存しない
        ・位置の近く（MATCH_M m 以内）にある家（仮の家を優先）を、そのままアパートに変える
        ・同じ住所に建物が複数ある・番地までは分からない・近くに家がない建物は、新しく置いて「確認する建物」に出す
        ・場所が分からない建物は作らず、一覧にして出す（地図で「＋ 家」から入れる）
        ・部屋は「1階・2階…」の階ごとの枠（1階に部屋がない建物は2階から）
   CSVの列：建物ID,区域,建物名,住所,階数,1F有,オートロック,立入,確認事項
   index.html の xlParseJa / xlGeocode / xlPick（エクセル取り込みと同じ仕組み）を使います。
   ========================================================= */
(function () {
  'use strict';
  const MATCH_M = 25;      // 住所の位置から、この距離以内の家を「その建物」とみなす（m）
  const MAX_ROWS = 3000;
  const MAX_FLOORS = 40;

  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const tkey = s => { const x = normNo(s); return /^\d+$/.test(x) ? String(parseInt(x, 10)) : x; }; // 「01」と「1」を同じ区域にする
  const terrByNo = no => D().territories.find(t => tkey(t.no) === tkey(no));
  const round6 = v => Math.round(v * 1e6) / 1e6;

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(x => x !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some(x => x !== '')) rows.push(row);
    return rows;
  }
  async function readText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('shift_jis').decode(buf); } // エクセルで保存し直したCSV
  }
  function buildings(rows) {
    const head = rows[0].map(c => String(c || '').trim());
    const col = n => head.indexOf(n);
    const C = { ref: col('建物ID'), terr: col('区域'), name: col('建物名'), addr: col('住所'), fl: col('階数'), f1: col('1F有'), lock: col('オートロック'), ban: col('立入'), memo: col('確認事項') };
    if (C.name < 0 || C.addr < 0 || C.terr < 0) return null;
    const g = (r, i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : '');
    return rows.slice(1, MAX_ROWS + 1).map(r => ({
      ref: g(r, C.ref), terr: g(r, C.terr), name: g(r, C.name).slice(0, 40), addr: g(r, C.addr),
      floors: Math.max(0, Math.min(MAX_FLOORS, Math.floor(num(g(r, C.fl))))), floor1: g(r, C.f1) === '0' ? '0' : '1',
      lock: g(r, C.lock) === '1', ban: g(r, C.ban) === 'no' || g(r, C.ban) === 'letter' ? g(r, C.ban) : '', memo: g(r, C.memo)
    })).filter(b => b.name || b.addr);
  }
  function unitsOf(b) { // 階ごとの枠。階数が分からない建物は「?」ひとつ
    if (!b.floors) return ['?'];
    const us = [];
    for (let i = b.floor1 === '0' ? 2 : 1; i <= b.floors; i++) us.push(i + '階');
    return us.length ? us : ['?'];
  }

  /* ---------- リセット ---------- */
  function counts() {
    const d = D();
    const apt = d.houses.filter(h => h.type === 'apt');
    return {
      visits: d.visits.length, dnc: Object.keys(d.dnc || {}).length, follows: Object.keys(d.follows || {}).length,
      cards: (d.awayCards || []).length, apt: apt.length, houses: d.houses.length, prov: d.houses.filter(h => h.prov).length
    };
  }
  function resetData() {
    const d = D();
    d.visits = []; d.dnc = {}; d.follows = {}; d.awayCards = [];
    d.houses.forEach(h => {
      if (h.type === 'apt') {
        h.type = 'house'; h.units = []; h.label = '';
        delete h.lock; delete h.uk; delete h.ul; delete h.kind; delete h.ban;
      } else delete h.ban;
    });
    Store.save();
    renderAll();
  }
  function downloadBackup() {
    const d = D();
    const o = { app: 'kuiki-map', kind: 'before-apt-reset', at: new Date().toISOString(), visits: d.visits, dnc: d.dnc, follows: d.follows, awayCards: d.awayCards, apt: d.houses.filter(h => h.type === 'apt') };
    const a = document.createElement('a');
    const t = new Date(), p = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' }));
    a.download = `区域マップ_リセット前の控え_${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}_${p(t.getHours())}${p(t.getMinutes())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- 画面 ---------- */
  function openMain() {
    const c = counts();
    setSheet(headHtml(null, 'アパートの登録', 'リセット → 取り込み の順に進めます') + `
      <div class="notice info">使いはじめの前に、実際のアパートの一覧に合わせるための画面です。<b>区域係だけ</b>が使えます。</div>
      <h3 class="sub">① 先にバックアップをとる</h3>
      <p class="hint">スプレッドシートのメニューから「今すぐバックアップ」を押してください。リセットは元にもどせないため、これが本当の控えになります。</p>
      <h3 class="sub">② リセット</h3>
      <p class="hint">消すもの：訪問の記録 ${c.visits}件・拒否 ${c.dnc}件・再訪問 ${c.follows}件・留守宅カード ${c.cards}件<br>
        アパートの印と部屋（${c.apt}棟）は、ふつうの家にもどします。<br>
        <b>残すもの：</b>仮の家の印と場所（${c.prov}軒）・家の場所・区域の線と担当・予定・利用者</p>
      <button class="btn block danger" id="aiReset">リセットする…</button>
      <h3 class="sub">③ アパートを取り込む</h3>
      <p class="hint">個人情報を除いた一覧（CSV）を選びます。住所は位置を調べるためだけに使い、アプリには保存しません。</p>
      <label class="btn primary block">取り込み用のCSVを選ぶ<input type="file" id="aiFile" accept=".csv,text/csv,text/plain" hidden></label>
      <button class="btn block" data-close>閉じる</button>`);
    $('#aiReset').onclick = openReset;
    $('#aiFile').onchange = e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) readCsvFile(f);
    };
  }

  function openReset() {
    const c = counts();
    setSheet(headHtml(null, 'リセットの確認', '元にもどせません') + `
      <div class="notice warn"><b>次のものを消します。</b><br>訪問の記録 ${c.visits}件／拒否 ${c.dnc}件／再訪問 ${c.follows}件／留守宅カード ${c.cards}件<br>
        アパート ${c.apt}棟の「アパート」の印と部屋の名前（ふつうの家にもどります）</div>
      <p class="hint">仮の家の印・家の場所・区域の線と担当は、そのまま残ります。各自のスマホに残っている再訪問のメモは、このリセットでは消えません。</p>
      <button class="btn block" id="aiBk">リセット前の控えをファイルに保存する</button>
      <label class="check"><input type="checkbox" id="aiSure">スプレッドシートのバックアップを取りました</label>
      <label class="field"><span>確認のため「リセット」と入力してください</span><input type="text" id="aiWord" autocomplete="off" inputmode="text"></label>
      <button class="btn block danger" id="aiGo" disabled>リセットする</button>
      <button class="btn block" id="aiBack">もどる</button>`);
    const upd = () => { $('#aiGo').disabled = !($('#aiSure').checked && $('#aiWord').value.trim() === 'リセット'); };
    $('#aiSure').onchange = upd; $('#aiWord').oninput = upd;
    $('#aiBk').onclick = () => { try { downloadBackup(); toast('控えを保存しました'); } catch (e) { toast('控えを保存できませんでした'); } };
    $('#aiBack').onclick = openMain;
    $('#aiGo').onclick = () => {
      if (!isAdmin()) return;
      resetData();
      toast('リセットしました。次は「アパートを取り込む」です');
      openMain();
    };
  }

  async function readCsvFile(file) {
    let list;
    try {
      const rows = parseCsv(await readText(file));
      list = rows.length > 1 ? buildings(rows) : null;
    } catch (e) { list = null; }
    if (!list || !list.length) {
      infoSheet('一覧を読み込めませんでした', '「建物ID,区域,建物名,住所,階数,1F有,オートロック,立入,確認事項」の見出しがあるCSVを選んでください。');
      return;
    }
    locate(list, file.name || '');
  }

  /* 住所 → 位置 → どの家に重ねるかを決める */
  async function locate(list, fileName) {
    list.forEach(b => {
      b.units = unitsOf(b);
      const p = b.addr ? xlParseJa('沖縄県' + b.addr) : null;
      if (p) { b.entry = { q: '沖縄県' + p.muni + p.town + p.nums.join('-'), nums: p.nums, muni: p.muni, town: p.town }; }
    });
    const qs = Array.from(new Set(list.filter(b => b.entry).map(b => b.entry.q))); // 番地のない住所も、町のまん中だけ調べる
    setSheet(headHtml(null, '住所から場所を調べています', esc(fileName)) + `<p class="hint">住所 ${qs.length}件。しばらくお待ちください（この画面を閉じないでください）。</p>
      <div class="bar"><i id="aiBar" style="width:0%"></i></div><p class="muted" id="aiCnt">0 / ${qs.length}</p>`);
    let geo;
    try {
      geo = await xlGeocode(qs, n => { const b = $('#aiBar'), c = $('#aiCnt'); if (b) b.style.width = Math.round(n / Math.max(1, qs.length) * 100) + '%'; if (c) c.textContent = `${n} / ${qs.length}`; });
    } catch (e) {
      infoSheet('場所を調べられませんでした', 'インターネットの接続を確かめて、もう一度ためしてください。');
      return;
    }
    const plan = makePlan(list, geo);
    showPlan(plan, fileName);
  }

  function makePlan(list, geo) {
    const cnt = new Map();
    list.forEach(b => { if (b.entry && b.entry.nums.length) cnt.set(b.entry.q, (cnt.get(b.entry.q) || 0) + 1); });
    const plan = { convert: [], create: [], miss: [], already: 0, noTerr: new Set() };
    // すでに登録した建物（同じ名前で近くにある）は、二度つくらない
    const apts = D().houses.filter(h => h.type === 'apt' && h.label);
    const ex = list.map(b => {
      const t = terrByNo(b.terr); if (!t) plan.noTerr.add(b.terr);
      b.t = t || null;
      b.pos = b.entry ? xlPick(b.entry, geo.get(b.entry.q)) : null;
      return b;
    });
    const placeable = [];
    ex.forEach(b => {
      if (!b.pos) { plan.miss.push(b); return; }
      if (apts.some(h => h.label === b.name && xlDist([h.lat, h.lng], [b.pos.lat, b.pos.lng]) <= MATCH_M * 2)) { plan.already++; return; }
      b.why = [];
      if (!b.entry.nums.length) b.why.push('番地が分からないため、だいたいの場所');
      else if (!b.pos.good) b.why.push('番地まで合わず、だいたいの場所');
      if (cnt.get(b.entry.q) > 1 && b.entry.nums.length) b.why.push('同じ住所に建物が複数あります');
      placeable.push(b);
    });
    // 確実な建物（番地が合う・住所がひとつだけ）は、近くの家に重ねる
    const sure = placeable.filter(b => !b.why.length);
    const grid = new Map(), cell = (la, ln) => Math.round(la * 2000) + ':' + Math.round(ln * 2000);
    D().houses.forEach(h => {
      if (h.type !== 'house') return;
      const k = cell(h.lat, h.lng); (grid.get(k) || grid.set(k, []).get(k)).push(h);
    });
    const pairs = [];
    sure.forEach((b, i) => {
      const cy = Math.round(b.pos.lat * 2000), cx = Math.round(b.pos.lng * 2000);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        (grid.get((cy + dy) + ':' + (cx + dx)) || []).forEach(h => {
          const d = xlDist([h.lat, h.lng], [b.pos.lat, b.pos.lng]);
          if (d <= MATCH_M) pairs.push({ i, h, d, score: d - (h.prov ? 3 : 0) - (b.t && h.terrId === b.t.id ? 5 : 0) });
        });
      }
    });
    pairs.sort((a, b) => a.score - b.score);
    const usedB = new Set(), usedH = new Set();
    pairs.forEach(p => {
      if (usedB.has(p.i) || usedH.has(p.h.id)) return;
      usedB.add(p.i); usedH.add(p.h.id);
      plan.convert.push({ b: sure[p.i], h: p.h });
    });
    sure.forEach((b, i) => { if (!usedB.has(i)) { b.why.push('近くに家がなかったため、新しく置きました'); plan.create.push(b); } });
    placeable.filter(b => b.why.length && !sure.includes(b)).forEach(b => plan.create.push(b));
    // 同じ場所に重なる建物は、少しずつずらして並べる
    const seen = [];
    plan.create.forEach(b => {
      let la = b.pos.lat, ln = b.pos.lng;
      const k = seen.filter(x => xlDist(x, [la, ln]) < 4).length;
      seen.push([la, ln]);
      if (k) { const r = 9 * Math.sqrt(k), a = k * 2.4; la += r * Math.sin(a) / 110540; ln += r * Math.cos(a) / (111320 * Math.cos(la * Math.PI / 180)); }
      b.lat = la; b.lng = ln;
    });
    return plan;
  }

  const lineOf = b => `${esc(b.name || '（名前なし）')}　<span class="muted" data-notr>${esc(b.addr || '住所なし')}</span>`;

  function showPlan(plan, fileName) {
    const nCv = plan.convert.length, nCr = plan.create.length, nMiss = plan.miss.length;
    const noT = Array.from(plan.noTerr);
    setSheet(headHtml(null, '取り込む内容の確認', esc(fileName)) + `
      <div class="tiles"><div class="tile"><b>${nCv}</b><span>家に重ねる</span></div>
        <div class="tile"><b>${nCr}</b><span>新しく置く（要確認）</span></div>
        <div class="tile"><b>${nMiss}</b><span>場所が分からない</span></div></div>
      ${plan.already ? `<p class="hint">すでに登録してある ${plan.already}棟は、入れません。</p>` : ''}
      <p class="hint"><b>家に重ねる</b>：住所の場所のすぐ近くにある家（仮の家を優先）を、アパートに変えます。<br>
        <b>新しく置く</b>：同じ住所に建物が複数ある・番地まで分からない・近くに家がない建物です。取り込んだあとの一覧で、1棟ずつ地図で確かめてください。</p>
      ${noT.length ? `<div class="notice warn">一覧の区域 ${esc(noT.join('・'))} は、アプリに区域がありません。場所の線の中にある区域に入ります。</div>` : ''}
      ${nMiss ? `<details class="more"><summary>場所が分からない建物（${nMiss}棟）：作りません</summary>
        <p class="hint">地図で「＋ 家」から入れてください。</p><ul>${plan.miss.map(b => `<li>区域${esc(b.terr)}　${lineOf(b)}</li>`).join('')}</ul>
        <button class="btn small" id="aiCopyMiss">この一覧をコピー</button></details>` : ''}
      <button class="btn primary block" id="aiCommit"${nCv + nCr ? '' : ' disabled'}>${nCv + nCr}棟を登録する</button>
      <button class="btn block" data-close>やめる</button>`);
    if ($('#aiCopyMiss')) $('#aiCopyMiss').onclick = async () => {
      const t = plan.miss.map(b => `区域${b.terr}\t${b.name}\t${b.addr}`).join('\n');
      try { await navigator.clipboard.writeText(t); toast('コピーしました'); } catch (e) { toast('コピーできませんでした'); }
    };
    $('#aiCommit').onclick = () => commitPlan(plan);
  }

  function apply(b, h) {
    h.type = 'apt'; h.label = b.name.slice(0, 40); h.units = b.units.slice(0, 300);
    delete h.prov; delete h.kind; delete h.uk; delete h.ul;
    if (b.lock) h.lock = true; else delete h.lock;
    if (b.ban) h.ban = b.ban; else delete h.ban;
  }
  function commitPlan(plan) {
    if (!isAdmin()) return;
    const check = [];
    const now = new Date().toISOString();
    const diffTerr = (b, h) => { const a = terrOf(h.lat, h.lng); return b.t && a !== b.t.id ? ` 一覧の区域${b.terr}と、線の区域がちがいます` : ''; };
    plan.convert.forEach(({ b, h }) => {
      apply(b, h);
      const w = diffTerr(b, h);
      if (w) check.push({ id: h.id, b, note: w.trim() });
    });
    plan.create.forEach(b => {
      const h = { id: 'h' + uid(), terrId: terrOf(b.lat, b.lng), type: 'apt', lat: round6(b.lat), lng: round6(b.lng), label: '', units: [], createdAt: now, createdBy: me().id };
      apply(b, h);
      D().houses.push(h);
      check.push({ id: h.id, b, note: (b.why.join('。') + diffTerr(b, h)).trim() });
    });
    Store.save();
    renderAll();
    firstMapShow = false;
    showView('map');
    setTimeout(() => showResult(plan, check), 500);
  }

  function showResult(plan, check) {
    const live = check.filter(c => houseById(c.id));
    setSheet(headHtml(null, '登録しました', '') + `
      <p>家に重ねた建物：<b>${plan.convert.length}</b>　新しく置いた建物：<b>${plan.create.length}</b>${plan.miss.length ? `　作れなかった建物：<b>${plan.miss.length}</b>` : ''}</p>
      ${live.length ? `<h3 class="sub">確かめる建物（${live.length}棟）</h3>
        <p class="hint">押すと地図がその建物に移ります。場所がちがうときは、建物の画面の「建物の編集」→「この建物の場所を直す」で直せます。近くに残った「仮の家」は、家の画面の「ここは家ではない（消す）」で消せます。</p>
        <div class="list">${live.map(c => `<button class="btn block" data-aigo="${esc(c.id)}">区域${esc(c.b.terr)}　${lineOf(c.b)}${c.note ? `<br><small class="muted">${esc(c.note)}</small>` : ''}</button>`).join('')}</div>` : '<p class="hint">すべて、住所の場所のすぐ近くの家に重ねました。</p>'}
      <button class="btn block" data-close>閉じる</button>`);
    $$('[data-aigo]', $('#sheet')).forEach(x => x.onclick = () => {
      const h = houseById(x.dataset.aigo); if (!h) return;
      closeSheet(); showView('map');
      setTimeout(() => { map.setView([h.lat, h.lng], 18); openBuilding(h.id); }, 150);
    });
  }

  /* 「区域」の一覧にあるボタンから開く（係だけ） */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#adAptImp');
    if (!b) return;
    if (!isAdmin()) { toast('区域係だけが使えます'); return; }
    openMain();
  });
  window.AptImport = { parseCsv, buildings, unitsOf, makePlan, resetData, counts };
})();
