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
   取り込みのしかたは2通り
     A) CSV：住所を国土地理院の住所検索で位置にする
     B) マイマップのKML/KMZ：CSVをGoogleマイマップに読ませて、ピンを地図で確かめ・直してから書き出したもの
        （位置はマイマップのピンの位置をそのまま使う。ピンの「建物名・区域・階数・1F有・オートロック・立入」の列だけを読む）
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
  // 前回までの取り込みで「新しく置いた」家：目印(imp)があるもの。目印をつける前の取り込みの家は、
  // 「アパートの印があり、仮の家でなく、係が最近(7日以内)つくった家」を候補にする（係が件数を見て、消すかどうかえらぶ）
  const isNewImp = h => h.type === 'apt' && !!h.imp;
  const isLegacyNew = h => h.type === 'apt' && !h.imp && !h.prov && h.createdBy === me().id && Date.now() - Date.parse(h.createdAt) < 7 * 86400000;
  function counts() {
    const d = D();
    const apt = d.houses.filter(h => h.type === 'apt');
    return {
      visits: d.visits.length, dnc: Object.keys(d.dnc || {}).filter(k => { const v = d.dnc[k]; return k.indexOf('|') > 0 && !(v && typeof v === 'object' && (v.a || v.s)); }).length, // 住所のある拒否は残すので数えない follows: Object.keys(d.follows || {}).length,
      cards: (d.awayCards || []).length, apt: apt.length, houses: d.houses.length, prov: d.houses.filter(h => h.prov).length,
      imp: apt.filter(isNewImp).length, legacy: apt.filter(isLegacyNew).length
    };
  }
  function resetData(opt) {
    const d = D();
    opt = opt || {};
    d.visits = []; d.follows = {}; d.awayCards = [];
    // 拒否：訪問で記録したものは消す。取り込み・係が追加した住所のある拒否は、場所だけの拒否にして残す（kyohi.js）
    Object.keys(d.dnc || {}).forEach(k => { if (k.indexOf('|') < 0) return; if (typeof dncDrop === 'function') dncDrop(k); else delete d.dnc[k]; });
    // 取り込みで新しく置いた家は、家ごと消す（元からあった家は残して、ふつうの家にもどす）
    d.houses = d.houses.filter(h => !(isNewImp(h) || (opt.legacy && isLegacyNew(h))));
    d.houses.forEach(h => {
      if (h.type === 'apt') {
        h.type = 'house'; h.units = []; h.label = '';
        delete h.lock; delete h.uk; delete h.ul; delete h.kind; delete h.ban;
      } else delete h.ban;
      delete h.imp; delete h.cid;
    });
    Store.save();
    renderAll();
  }

  /* アパートだけ消す：部屋ごとの記録は消し、家ぜんたいの記録（部屋なしの記録）は残す。取り込みで置いた家は家ごと消す */
  function aptCounts() {
    const d = D();
    const apt = d.houses.filter(h => h.type === 'apt'), ids = new Set(apt.map(h => h.id));
    const roomV = d.visits.filter(v => v.unit && ids.has(v.houseId)).length;
    const inApt = k => { const i = k.lastIndexOf('|'); return i > 0 && ids.has(k.slice(0, i)) && k.slice(i + 1) !== ''; };
    return {
      apt: apt.length, imp: apt.filter(isNewImp).length, legacy: apt.filter(isLegacyNew).length, roomV,
      roomD: Object.keys(d.dnc || {}).filter(inApt).length, roomF: Object.keys(d.follows || {}).filter(inApt).length
    };
  }
  function resetApts(opt) {
    const d = D();
    opt = opt || {};
    const gone = new Set(d.houses.filter(h => isNewImp(h) || (opt.legacy && isLegacyNew(h))).map(h => h.id));
    const apt = new Set(d.houses.filter(h => h.type === 'apt').map(h => h.id));
    const inApt = k => { const i = k.lastIndexOf('|'); if (i <= 0) return false; const id = k.slice(0, i); return gone.has(id) || (apt.has(id) && k.slice(i + 1) !== ''); };
    d.visits = d.visits.filter(v => !(gone.has(v.houseId) || (apt.has(v.houseId) && v.unit)));
    Object.keys(d.dnc || {}).forEach(k => { if (inApt(k)) { if (typeof dncDrop === 'function') dncDrop(k); else delete d.dnc[k]; } });
    Object.keys(d.follows || {}).forEach(k => { if (inApt(k)) delete d.follows[k]; });
    d.houses = d.houses.filter(h => !gone.has(h.id));
    d.houses.forEach(h => {
      if (h.type === 'apt') { h.type = 'house'; h.units = []; h.label = ''; delete h.lock; delete h.uk; delete h.ul; delete h.kind; delete h.ban; }
      delete h.imp; delete h.cid;
    });
    Store.save();
    renderAll();
  }
  function openResetApt() {
    const c = aptCounts();
    setSheet(headHtml(null, 'アパートを全部消す', '元にもどせません') + `
      <div class="notice warn"><b>次のものを消します。</b><br>アパート ${c.apt}棟の「アパート」の印と部屋（ふつうの家にもどります）<br>
        部屋ごとの記録：訪問 ${c.roomV}件／拒否 ${c.roomD}件／再訪問 ${c.roomF}件<br>
        取り込みで新しく置いた家 ${c.imp}軒（家ごと消えます）</div>
      ${c.legacy ? `<label class="check"><input type="checkbox" id="aiLegacy2">前回までの取り込みで新しく置いたと思われる家も、家ごと消す（${c.legacy}軒）</label>` : ''}
      <p class="hint"><b>残すもの：</b>一戸建ての訪問の記録・家の場所・仮の家の印・区域の線と担当・予定・利用者。<br>登録ずみの「候補」（エクセルの建物）にも、手をふれません。</p>
      <button class="btn block" id="aiBk">消す前の控えをファイルに保存する</button>
      <label class="check"><input type="checkbox" id="aiSure">スプレッドシートのバックアップを取りました</label>
      <label class="field"><span>確認のため「アパート消去」と入力してください</span><input type="text" id="aiWord" autocomplete="off"></label>
      <button class="btn block danger" id="aiGo" disabled>アパートを全部消す</button>
      <button class="btn block" id="aiBack">もどる</button>`);
    const upd = () => { $('#aiGo').disabled = !($('#aiSure').checked && $('#aiWord').value.trim() === 'アパート消去'); };
    $('#aiSure').onchange = upd; $('#aiWord').oninput = upd;
    $('#aiBk').onclick = () => { try { downloadBackup(); toast('控えを保存しました'); } catch (e) { toast('控えを保存できませんでした'); } };
    $('#aiBack').onclick = openMain;
    $('#aiGo').onclick = () => {
      if (!isAdmin()) return;
      resetApts({ legacy: !!($('#aiLegacy2') && $('#aiLegacy2').checked) });
      toast('アパートを消しました。次は「候補を登録」です');
      openMain();
    };
  }

  /* ---------- 候補の登録（エクセルの建物を、区域ごとの「候補」にする） ----------
     家は作りません。区域ごとに「建物名・階数・1階の有無・オートロック・立入禁止・だいたいの位置」を持たせ、
     現場で付近の候補をえらんだときに、階数などが自動で入ります。区域は一覧の「区域」欄が正です。 */
  const hash36 = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function candStats() {
    const used = new Set(); D().houses.forEach(h => { if (h.cid) used.add(h.cid); });
    let all = 0, left = 0;
    D().territories.forEach(t => (t.cands || []).forEach(c => { all++; if (!used.has(c.i)) left++; }));
    return { all, left, used: all - left };
  }
  async function readForCand(file) {
    const isMap = /\.(kml|kmz)$/i.test(file.name || '');
    if (isMap) {
      let r;
      try { r = parseMyMap(await readKmlText(file)); } catch (e) { r = null; }
      if (!r || !r.list.length) { infoSheet('建物のピンが見つかりませんでした', 'マイマップから書き出したKML/KMZ（「ネットワーク リンク」はチェックを外す）を選んでください。'); return; }
      showCandPlan(makeCandPlan(r.list), file.name || '');
      return;
    }
    let list;
    try { const rows = parseCsv(await readText(file)); list = rows.length > 1 ? buildings(rows) : null; } catch (e) { list = null; }
    if (!list || !list.length) { infoSheet('一覧を読み込めませんでした', '「建物ID,区域,建物名,住所,階数,1F有,オートロック,立入,確認事項」の見出しがあるCSVを選んでください。'); return; }
    list.forEach(b => {
      const p = b.addr ? xlParseJa('沖縄県' + b.addr) : null;
      if (p) b.entry = { q: '沖縄県' + p.muni + p.town + p.nums.join('-'), nums: p.nums, muni: p.muni, town: p.town };
    });
    const qs = Array.from(new Set(list.filter(b => b.entry).map(b => b.entry.q)));
    setSheet(headHtml(null, '住所から場所を調べています', esc(file.name || '')) + `<p class="hint">住所 ${qs.length}件。しばらくお待ちください（この画面を閉じないでください）。</p>
      <div class="bar"><i id="aiBar" style="width:0%"></i></div><p class="muted" id="aiCnt">0 / ${qs.length}</p>`);
    let geo;
    try {
      geo = await xlGeocode(qs, n => { const b = $('#aiBar'), c = $('#aiCnt'); if (b) b.style.width = Math.round(n / Math.max(1, qs.length) * 100) + '%'; if (c) c.textContent = `${n} / ${qs.length}`; });
    } catch (e) { infoSheet('場所を調べられませんでした', 'インターネットの接続を確かめて、もう一度ためしてください。'); return; }
    list.forEach(b => { b.pos = b.entry ? xlPick(b.entry, geo.get(b.entry.q)) : null; });
    showCandPlan(makeCandPlan(list), file.name || '');
  }
  function makeCandPlan(list) {
    const plan = { by: new Map(), miss: [], noTerr: new Set(), n: 0 };
    const seen = new Set();
    list.forEach((b, idx) => {
      const t = terrByNo(b.terr);
      if (!t) { plan.noTerr.add(b.terr || '（区域なし）'); return; }
      if (!b.pos) { plan.miss.push(b); return; }
      let id = String(b.ref || '').replace(/[^\w.\-]/g, '').slice(0, 40) || ('x' + hash36(`${tkey(b.terr)}|${b.name}|${b.addr}`));
      if (seen.has(id)) id = (id + '-' + idx).slice(0, 40);
      seen.add(id);
      const c = { i: id, n: b.name.slice(0, 40), la: round6(b.pos.lat), ln: round6(b.pos.lng) };
      if (b.floors) c.f = b.floors;
      if (b.floor1 === '0') c.g = 0;
      if (b.lock) c.k = 1;
      if (b.ban) c.b = b.ban;
      if (!plan.by.has(t.id)) plan.by.set(t.id, []);
      plan.by.get(t.id).push(c);
      plan.n++;
    });
    return plan;
  }
  function showCandPlan(plan, fileName) {
    const noT = Array.from(plan.noTerr), nMiss = plan.miss.length;
    setSheet(headHtml(null, '候補として登録する内容', esc(fileName)) + `
      <div class="tiles"><div class="tile"><b>${plan.n}</b><span>候補にする建物</span></div>
        <div class="tile"><b>${plan.by.size}</b><span>区域</span></div>
        <div class="tile"><b>${nMiss}</b><span>場所が分からない</span></div></div>
      <p class="hint">家は作りません。区域ごとに「候補」として持たせます。現場で家の画面から「アパート・マンションだった」を押すと、付近の候補が近い順に出て、えらぶと階数などが自動で入ります。使った候補は、次から出ません。<br>
        同じ区域の候補は、このファイルの内容に置きかわります（登録ずみの建物はそのままです）。</p>
      ${noT.length ? `<div class="notice warn">一覧の区域 ${esc(noT.join('・'))} は、アプリに区域がありません。その建物は候補にしません。</div>` : ''}
      ${nMiss ? `<details class="more"><summary>場所が分からない建物（${nMiss}棟）：候補にしません</summary>
        <p class="hint">場所がないと「付近の候補」に出せません。マイマップのKMLで場所を直して、もう一度取り込めます。</p><ul>${plan.miss.map(b => `<li>区域${esc(b.terr)}　${lineOf(b)}</li>`).join('')}</ul></details>` : ''}
      <button class="btn primary block" id="aiCandGo"${plan.n ? '' : ' disabled'}>${plan.n}棟を候補にする</button>
      <button class="btn block" data-close>やめる</button>`);
    $('#aiCandGo').onclick = () => {
      if (!isAdmin()) return;
      plan.by.forEach((list, tid) => {
        const t = terrById(tid); if (!t) return;
        t.cands = list.sort((a, b) => String(a.n).localeCompare(String(b.n), 'ja'));
      });
      Store.save(); renderAll();
      toast(`${plan.n}棟を候補にしました`);
      openMain();
    };
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
    const c = counts(), cs = candStats();
    setSheet(headHtml(null, 'アパートの登録', 'けす → 候補をいれる の順に進めます') + `
      <div class="notice info">使いはじめの前に、実際のアパートの一覧に合わせるための画面です。<b>区域係だけ</b>が使えます。</div>
      <h3 class="sub">① 先にバックアップをとる</h3>
      <p class="hint">スプレッドシートのメニューから「今すぐバックアップ」を押してください。消すのは元にもどせません。</p>
      <h3 class="sub">② 入っているアパートを全部消す</h3>
      <p class="hint">アパート ${c.apt}棟を、ふつうの家にもどします（取り込みで置いた家 ${c.imp}軒は家ごと消えます）。一戸建ての記録・家の場所・区域の線は残ります。</p>
      <button class="btn block danger" id="aiResetApt">アパートだけ全部消す…</button>
      <h3 class="sub">③ エクセルの建物を「候補」にする（おすすめ）</h3>
      <p class="hint">家は作らず、区域ごとに候補として持たせます。現場で付近の候補をえらぶだけで、名前・階数・オートロックが入ります。<br>
        いまの候補：<b>${cs.all}棟</b>（使った ${cs.used}／残り ${cs.left}）</p>
      <label class="btn primary block">KML・KMZ・CSVを選んで、候補にする<input type="file" id="aiCandFile" accept=".kml,.kmz,.csv,text/csv,text/plain,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" hidden></label>
      <p class="hint">場所は、マイマップで直したKML／KMZのピンの場所を使います（CSVのときは住所から調べます）。住所はアプリに保存しません。</p>
      <details class="more"><summary>くわしい方法（全部の記録のリセット・家に直接取り込む）</summary>
        <h3 class="sub">全部の記録をリセット</h3>
        <p class="hint">訪問の記録 ${c.visits}件・拒否 ${c.dnc}件・再訪問 ${c.follows}件・留守宅カード ${c.cards}件も、すべて消します。</p>
        <button class="btn block danger" id="aiReset">すべてリセットする…</button>
        <h3 class="sub">家に直接取り込む</h3>
        <p class="hint">住所の場所のすぐ近くの家を、そのままアパートに変えます。位置がずれると、まちがいやすい方法です。</p>
        <label class="btn block">KML・KMZ・CSVを選ぶ<input type="file" id="aiFile" accept=".kml,.kmz,.csv,text/csv,text/plain,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" hidden></label>
      </details>
      <button class="btn block" data-close>閉じる</button>`);
    $('#aiReset').onclick = openReset;
    $('#aiResetApt').onclick = openResetApt;
    $('#aiFile').onchange = e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) readFile(f);
    };
    $('#aiCandFile').onchange = e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) readForCand(f);
    };
  }

  function openReset() {
    const c = counts();
    setSheet(headHtml(null, 'リセットの確認', '元にもどせません') + `
      <div class="notice warn"><b>次のものを消します。</b><br>訪問の記録 ${c.visits}件／拒否 ${c.dnc}件／再訪問 ${c.follows}件／留守宅カード ${c.cards}件<br>
        アパート ${c.apt}棟の「アパート」の印と部屋の名前（ふつうの家にもどります）<br>
        取り込みで新しく置いた家 ${c.imp}軒（家ごと消えます）</div>
      ${c.legacy ? `<label class="check"><input type="checkbox" id="aiLegacy">前回までの取り込みで新しく置いたと思われる家も、家ごと消す（${c.legacy}軒）</label>
        <p class="hint">「アパートの印がある・仮の家ではない・7日以内に係がつくった」家です。前回の確認画面の「新しく置く」の数と近ければ、チェックを入れてください。</p>` : ''}
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
      resetData({ legacy: !!($('#aiLegacy') && $('#aiLegacy').checked) });
      toast('リセットしました。次は「アパートを取り込む」です');
      openMain();
    };
  }

  /* マイマップのKML：ピン（Point）だけを読む。読む列は決めたものだけ（それ以外の列・説明欄は読まない） */
  function parseMyMap(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
    const out = { list: [], network: doc.getElementsByTagNameNS('*', 'NetworkLink').length > 0, noCols: 0 };
    for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
      const pt = pm.getElementsByTagNameNS('*', 'Point')[0];
      if (!pt) continue; // 線・図形（区域）は、ここでは読まない
      const c = kmlCoords(pt)[0];
      if (!c) continue;
      const data = {};
      for (const d of pm.getElementsByTagNameNS('*', 'Data')) {
        const v = d.getElementsByTagNameNS('*', 'value')[0];
        data[String(d.getAttribute('name') || '').trim()] = v ? v.textContent.trim() : '';
      }
      if (!('区域' in data) && !('階数' in data)) { out.noCols++; continue; }
      const nameEl = [...pm.children].find(x => x.localName === 'name');
      const g = k => String(data[k] == null ? '' : data[k]).trim();
      const ban = g('立入');
      out.list.push({
        ref: g('建物ID'), terr: g('区域'), name: (g('建物名') || (nameEl ? nameEl.textContent.trim() : '')).slice(0, 40), addr: g('住所'),
        floors: Math.max(0, Math.min(MAX_FLOORS, Math.floor(num(g('階数'))))), floor1: g('1F有') === '0' ? '0' : '1',
        lock: g('オートロック') === '1', ban: ban === 'no' || ban === 'letter' ? ban : '', memo: '',
        pos: { lat: c[0], lng: c[1], good: true }, fromMap: true
      });
    }
    return out;
  }
  async function readKmlText(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4B) { // KMZ（圧縮されたKML）
      toast('KMZファイルを開いています…');
      await loadScript(LIB.zip);
      const zip = await window.JSZip.loadAsync(file);
      const f = zip.file('doc.kml') || zip.file(/\.kml$/i)[0];
      if (!f) throw new Error('nokml');
      return f.async('string');
    }
    return file.text();
  }

  async function readFile(file) {
    let list;
    const isMap = /\.(kml|kmz)$/i.test(file.name || '');
    if (isMap) {
      let r;
      try { r = parseMyMap(await readKmlText(file)); } catch (e) { r = null; }
      if (!r) { infoSheet('ファイルを読み込めませんでした', 'Googleマイマップの「KML/KMZにエクスポート」で書き出したファイルを選んでください。KMZのときは、インターネットにつながっている必要があります。'); return; }
      if (!r.list.length) {
        infoSheet('建物のピンが見つかりませんでした', r.network
          ? 'このファイルには地図の中身が入っていません。書き出すときに「ネットワーク リンク」のチェックを外して、もう一度書き出してください。'
          : '取り込み用のCSV（見出しに「区域」「階数」などがあるもの）をマイマップに読ませた地図を、書き出してください。');
        return;
      }
      list = r.list;
      list.forEach(b => { b.units = unitsOf(b); });
      showPlan(makePlan(list, new Map()), file.name || '', r.noCols);
      return;
    }
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
    list.forEach(b => { if (!b.fromMap && b.entry && b.entry.nums.length) cnt.set(b.entry.q, (cnt.get(b.entry.q) || 0) + 1); });
    const plan = { convert: [], create: [], miss: [], already: 0, noTerr: new Set() };
    // すでに登録した建物（同じ名前で近くにある）は、二度つくらない
    const apts = D().houses.filter(h => h.type === 'apt' && h.label);
    const ex = list.map(b => {
      const t = terrByNo(b.terr); if (!t) plan.noTerr.add(b.terr);
      b.t = t || null;
      if (!b.fromMap) b.pos = b.entry ? xlPick(b.entry, geo.get(b.entry.q)) : null;
      return b;
    });
    const placeable = [];
    ex.forEach(b => {
      if (!b.pos) { plan.miss.push(b); return; }
      if (apts.some(h => h.label === b.name && xlDist([h.lat, h.lng], [b.pos.lat, b.pos.lng]) <= MATCH_M * 2)) { plan.already++; return; }
      b.why = [];
      if (!b.fromMap) {
        if (!b.entry.nums.length) b.why.push('番地が分からないため、だいたいの場所');
        else if (!b.pos.good) b.why.push('番地まで合わず、だいたいの場所');
        if (cnt.get(b.entry.q) > 1 && b.entry.nums.length) b.why.push('同じ住所に建物が複数あります');
      }
      placeable.push(b);
    });
    // マイマップのピン：同じ場所（4m以内）に別の建物のピンが重なっているものだけ、確かめる建物にする
    placeable.forEach(b => {
      if (b.fromMap && placeable.some(o => o !== b && o.fromMap && xlDist([o.pos.lat, o.pos.lng], [b.pos.lat, b.pos.lng]) < 4)) b.why.push('同じ場所に別の建物のピンが重なっています');
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

  function showPlan(plan, fileName, noCols) {
    const nCv = plan.convert.length, nCr = plan.create.length, nMiss = plan.miss.length;
    const noT = Array.from(plan.noTerr);
    setSheet(headHtml(null, '取り込む内容の確認', esc(fileName)) + `
      <div class="tiles"><div class="tile"><b>${nCv}</b><span>家に重ねる</span></div>
        <div class="tile"><b>${nCr}</b><span>新しく置く（要確認）</span></div>
        <div class="tile"><b>${nMiss}</b><span>場所が分からない</span></div></div>
      ${plan.already ? `<p class="hint">すでに登録してある ${plan.already}棟は、入れません。</p>` : ''}
      ${noCols ? `<p class="hint">取り込み用の列がないピン ${noCols}個は、読まずにとばしました。</p>` : ''}
      <p class="hint"><b>家に重ねる</b>：住所の場所のすぐ近くにある家（仮の家を優先）を、アパートに変えます。<br>
        <b>新しく置く</b>：近くに家がない・場所があいまい・ピンが重なっている建物です。取り込んだあとの一覧で、1棟ずつ地図で確かめてください。</p>
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
      const h = { id: 'h' + uid(), terrId: terrOf(b.lat, b.lng), type: 'apt', lat: round6(b.lat), lng: round6(b.lng), label: '', units: [], createdAt: now, createdBy: me().id, imp: true };
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
        <p class="hint">押すと地図がその建物に移ります。場所がちがうときは、建物の「建物の編集」→「区域係だけの操作」→「この建物の場所を直す」で直せます。近くに残った「仮の家」は、家の画面の「ここは家ではない（消す）」で消せます。</p>
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
  window.AptImport = { parseCsv, buildings, unitsOf, makePlan, parseMyMap, resetData, counts, makeCandPlan, resetApts, aptCounts };
})();
