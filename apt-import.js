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
   CSVの列：建物名,住所,建物ID,階数,1F有,建物タイプ,備考（1F有は TRUE/FALSE でもよい。見出しの前に余計な行があってもよい）
     ・区域の欄は使わない（2026.13.25〜）。区域は、住所から出した場所が入る区域の線で決める（線の外なら、いちばん近い区域）
     ・建物タイプ：オートロック／立入禁止／手紙のみ／エレベーター有／縦階段 を建物の情報にする
     ・備考：部屋ごとの拒否（例：603拒）は拒否の一覧へ、のこりは「建物のメモ」（建物の画面で、だれでも直せる）にする
   取り込みのしかたは2通り
     A) CSV：住所を国土地理院の住所検索で位置にする
     B) マイマップのKML/KMZ：CSVをGoogleマイマップに読ませて、ピンを地図で確かめ・直してから書き出したもの
        （位置はマイマップのピンの位置をそのまま使う。ピンの「建物名・区域・階数・1F有・オートロック・立入」の列だけを読む）
   index.html の xlParseJa / xlGeocode / xlPick（エクセル取り込みと同じ仕組み）を使います。
   地番の地図（kyohi.js の chibanFind・法務省の登記所備付地図）がある市町村では、先に住所の地番の土地を調べ、
   「土地の中にある家」に重ねます（国土地理院の点から近い家をえらぶより正確）。土地の中に家の印がなければ、土地の中に新しく置きます。
   ========================================================= */
(function () {
  'use strict';
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.25')) {
    CHANGELOG.unshift({ v: '2026.13.25', items: [
      ['集', 'アパートの一覧の取り込みで、区域番号を使わなくなりました。住所から場所を調べ、近くに家の印があればその家をアパートにし、なければ現場でえらぶ候補にします'],
      ['集', 'アパートの建物に「建物のメモ」と「エレベーター・縦階段」が入れられるようになりました。建物の編集画面で、くわしい表示の人ならだれでも書けます。部屋を入力する画面の上に出ます']
    ] });
  }
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.24')) {
    CHANGELOG.unshift({ v: '2026.13.24', items: [
      ['集', 'アパートの一覧の建物のうち、住所の土地の中（または場所のすぐ近く）に家の印が1つだけあるものは、候補にせず、その家に自動で入れるようになりました（区域係が建物の画面で確かめられます）']
    ] });
  }
  const MATCH_M = 25;      // 住所の位置から、この距離以内の家を「その建物」とみなす（m）
  const MAX_ROWS = 3000;
  const MAX_FLOORS = 40;

  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const tkey = s => { const x = normNo(s); return /^\d+$/.test(x) ? String(parseInt(x, 10)) : x; }; // 「01」と「1」を同じ区域にする
  const terrByNo = no => D().territories.find(t => tkey(t.no) === tkey(no));
  const round6 = v => Math.round(v * 1e6) / 1e6;

  /* ---------- 地番の地図（kyohi.js） ---------- */
  /* 住所の地番の土地をさがす。見つかった建物は、国土地理院に聞かない（住所の文字を外に送らない） */
  async function chibanAll(list) {
    if (typeof window.chibanFind !== 'function') return 0;
    let n = 0;
    for (const b of list) {
      if (b.fromMap || !b.entry || !b.entry.nums.length) continue;
      const r = await window.chibanFind(Object.assign({ raw: b.addr }, b.entry)).catch(() => null);
      if (r) { b.cb = r; n++; }
    }
    return n;
  }
  const cbPos = b => ({ lat: b.cb.pos.lat, lng: b.cb.pos.lng, good: !!b.cb.pos.exact, chiban: true });
  const inParcel = (b, la, ln) => b.cb.polys.some(r => r.length >= 3 && inPoly(la, ln, r));
  /* 地番の土地の、地図のます目（cell）の範囲 */
  function parcelCells(b) {
    let s = 90, n = -90, w = 180, e = -180;
    b.cb.polys.forEach(r => r.forEach(([la, ln]) => { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, ln); e = Math.max(e, ln); }));
    const out = [];
    for (let y = Math.round(s * 2000) - 1; y <= Math.round(n * 2000) + 1; y++) for (let x = Math.round(w * 2000) - 1; x <= Math.round(e * 2000) + 1; x++) out.push(y + ':' + x);
    return out.slice(0, 400); // とても大きな土地（畑など）でも重くならないように
  }

  /* ---------- 備考の部屋ごとの拒否 → 拒否の一覧（場所だけの拒否。建物のそばに印） ---------- */
  const roomLabel = r => (/^[0-9\-]+$/.test(r) && /\d$/.test(r) ? r + '号室' : r);
  function refCount(list) { return list.reduce((n, b) => n + ((b.refs || []).length), 0); }
  /* at：{ lat, lng, tid, h（家id）, cid（候補の番号） } */
  function addRoomRefs(b, at, now) {
    if (!b.refs || !b.refs.length || at.lat == null) return 0;
    const dnc = D().dnc;
    const have = new Set();
    Object.keys(dnc).forEach(k => {
      const v = dnc[k];
      if (v && v.room && ((at.h && v.h === at.h) || (at.cid && v.cid === at.cid))) have.add(v.room);
    });
    let n = 0;
    b.refs.forEach((room, i) => {
      if (have.has(room)) return;
      const ang = i * 2.4, r = 3 + 1.5 * i; // 同じ建物の印が重ならないように、建物のまわりに少しずつずらす
      const lat = at.lat + r * Math.sin(ang) / 110540, lng = at.lng + r * Math.cos(ang) / (111320 * Math.cos(at.lat * Math.PI / 180));
      const o = { p: 1, s: 'xl', at: now, room, a: `${b.addr ? b.addr.replace(/^沖縄県/, '') + ' ' : ''}${b.name || '集合住宅'} ${roomLabel(room)}`.slice(0, 120),
        lat: round6(lat), lng: round6(lng) };
      if (at.tid) o.t = at.tid;
      if (at.h) o.h = at.h;
      if (at.cid) o.cid = at.cid;
      dnc['pin:' + uid()] = o;
      n++;
    });
    return n;
  }
  const refBox = (n, id) => n ? `<label class="check"><input type="checkbox" id="${id}" checked><span>備考の<b>部屋ごとの拒否 ${n}件</b>を、拒否の一覧に入れる<br><small class="muted">例：「603拒」→「〇〇アパート 603号室」。建物のそばに拒否の印を出し、建物の画面にも「拒否の部屋」として出します。備考のほかの文字は「建物のメモ」に入ります（拒否の部屋はメモに入れません）。</small></span></label>` : '';

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
  /* 一覧の読み取り。見出しの名前がちがう一覧（「区域番号」「建物タイプ」、1F有が TRUE/FALSE など）や、
     見出しの前に余計な行がある一覧も読む。読むのは必要な列だけ（司会者・日付・備考などの列は読まない） */
  const HEAD = {
    ref: /^(建物ID|建物id|ID)$/i, terr: /^(区域|区域番号|区域No\.?|区域NO)$/i, name: /^(建物名|建物の名前|名前)$/, addr: /^(住所|所在地)$/,
    fl: /^(階数|階)$/, f1: /^(1F有|１F有|1階有|1階に部屋)$/i, lock: /^(オートロック)$/, ban: /^(立入|立ち入り)$/, type: /^(建物タイプ|種類|タイプ)$/, memo: /^(確認事項)$/,
    note: /^(備考|メモ)$/
  };
  /* 備考から、部屋ごとの拒否だけを取り出す（例：「603拒」「1-1001拒」「拒302」「302(B302)拒」）。
     備考のほかの文字は読まない。部屋の書き方の漢字・かな（人の名前のこともある）は捨て、数字・英字・記号だけ残す。
     「拒」のあとの文字（日付・年代などのメモ）も捨てる */
  function refRooms(note) {
    const out = [];
    String(note || '').normalize('NFKC').split(/[,、，\s]+/).forEach(tok => {
      if (tok.indexOf('拒') < 0) return;
      let room = tok.startsWith('拒') ? tok.slice(1) : tok.slice(0, tok.indexOf('拒'));
      room = room.replace(/[^0-9A-Za-z\-()#]/g, ' ').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (room && /\d/.test(room) && !out.includes(room)) out.push(room);
    });
    return out;
  }
  /* 備考から、部屋ごとの拒否（拒否の一覧に入れるもの）をのぞいた残り。区切りは「、」にそろえる */
  function dropRefs(note) {
    const parts = String(note || '').split(/([,、，\s]+)/), out = [];
    for (let i = 0; i < parts.length; i += 2) {
      const tok = parts[i]; if (!tok) continue;
      if (tok.normalize('NFKC').indexOf('拒') >= 0 && refRooms(tok).length) continue;
      out.push(tok);
    }
    return out.join('、');
  }
  const noteTrim = v => String(v || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').replace(/^[、,\s]+|[、,\s]+$/g, '').slice(0, 200);
  /* 建物のメモは、だれでも見る。住んでいる人のこと（国籍・年齢や性別・病気・名前など）らしい言葉を見つける */
  const SENS = /(インドネシア|カンボジア|ベトナム|フィリピン|中国|韓国|台湾|ネパール|ブラジル|ペルー|ミャンマー|スリランカ|アメリカ|米国|外国|外人|[ァ-ヶー]{2,}人|\d外|[男女](?:性|\s*\d+)|\d0代|高齢|老人|病気|障[害が]い?|認知症|入院|車[い椅]す|精神|妊娠|離婚|生活保護|[一-龠]{1,3}さん)/g;
  const sensWords = text => {
    const out = [];
    String(text || '').normalize('NFKC').replace(SENS, m => { if (!/^(大家|管理人)さん$/.test(m) && !out.includes(m)) out.push(m); return m; });
    return out;
  };
  window.bldSens = sensWords;
  const yes = v => /^(1|true|有|あり|○|〇|はい|yes)$/i.test(String(v || '').trim());
  const noo = v => /^(0|false|無|なし|×|いいえ|no)$/i.test(String(v || '').trim());
  function buildings(rows) {
    const norm = c => String(c == null ? '' : c).normalize('NFKC').trim();
    const hi = rows.slice(0, 10).findIndex(r => r.some(c => HEAD.name.test(norm(c))) && r.some(c => HEAD.addr.test(norm(c))));
    if (hi < 0) return null;
    const head = rows[hi].map(norm);
    const col = k => head.findIndex(h => HEAD[k].test(h));
    const C = {}; Object.keys(HEAD).forEach(k => { C[k] = col(k); });
    if (C.name < 0 || C.addr < 0) return null; // 区域の欄はなくてもよい（使わない）
    const g = (r, i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : '');
    return rows.slice(hi + 1, hi + 1 + MAX_ROWS).map(r => {
      const type = g(r, C.type), banV = g(r, C.ban);
      const ban = banV === 'no' || banV === 'letter' ? banV : /立入禁止|立ち入り禁止/.test(type) ? 'no' : /手紙/.test(type) ? 'letter' : '';
      const note = [g(r, C.note), g(r, C.memo)].filter(Boolean).join(' ');
      return {
        ac: /エレベーター|エレベータ|ＥＶ|^EV$/i.test(type) ? 'ev' : /縦階段|たて階段/.test(type) ? 'st' : '',
        note: noteTrim(note), noteRest: noteTrim(dropRefs(note)),
        ref: g(r, C.ref), terr: g(r, C.terr), name: g(r, C.name).slice(0, 40), addr: g(r, C.addr),
        floors: Math.max(0, Math.min(MAX_FLOORS, Math.floor(num(g(r, C.fl))))), floor1: noo(g(r, C.f1)) ? '0' : '1',
        lock: yes(g(r, C.lock)) || /オートロック/.test(type), ban, memo: g(r, C.memo),
        refs: refRooms(note)
      };
    }).filter(b => b.name || b.addr);
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
    if (!list || !list.length) { infoSheet('一覧を読み込めませんでした', '「建物名」「住所」の見出しがあるCSVを選んでください。<br>あれば「建物ID」「階数」「1F有」「建物タイプ」「備考」も読みます（区域・司会者・日付などの列は読みません）。'); return; }
    list.forEach(b => {
      const p = b.addr ? xlParseJa(b.addr) : null; // 「沖縄県」があってもなくても読める
      if (p) b.entry = { q: '沖縄県' + p.muni + p.town + p.nums.join('-'), nums: p.nums, muni: p.muni, town: p.town };
    });
    setSheet(headHtml(null, '住所から場所を調べています', esc(file.name || '')) + `<p class="hint">しばらくお待ちください（この画面を閉じないでください）。</p>
      <div class="bar"><i id="aiBar" style="width:0%"></i></div><p class="muted" id="aiCnt">地番の地図で調べています…</p>`);
    await chibanAll(list);
    const qs = Array.from(new Set(list.filter(b => b.entry && !b.cb).map(b => b.entry.q)));
    let geo = new Map();
    if (qs.length) {
      try {
        geo = await xlGeocode(qs, n => { const b = $('#aiBar'), c = $('#aiCnt'); if (b) b.style.width = Math.round(n / Math.max(1, qs.length) * 100) + '%'; if (c) c.textContent = `国土地理院で調べています ${n} / ${qs.length}`; });
      } catch (e) { infoSheet('場所を調べられませんでした', 'インターネットの接続を確かめて、もう一度ためしてください。'); return; }
    }
    list.forEach(b => { b.pos = b.cb ? cbPos(b) : b.entry ? xlPick(b.entry, geo.get(b.entry.q)) : null; });
    showCandPlan(makeCandPlan(list), file.name || '');
  }
  /* 区域：住所の場所が入る区域の線（線の外なら、いちばん近い区域）。一覧の区域の欄は使わない */
  let terrBoxes = null;
  function terrAt(la, ln) {
    const id = terrOf(la, ln);
    if (id) return { id, out: false };
    if (!terrBoxes) terrBoxes = polyTerrs().filter(t => !t.rest).map(t => { const b = bboxOf(t.polygon); return { t, la: (b[0] + b[1]) / 2, ln: (b[2] + b[3]) / 2 }; });
    let best = null, bd = Infinity;
    terrBoxes.forEach(x => { const d = xlDist([x.la, x.ln], [la, ln]); if (d < bd) { bd = d; best = x.t; } });
    return best ? { id: best.id, out: true } : null;
  }
  function makeCandPlan(list) {
    const plan = { by: new Map(), miss: [], noAddr: 0, out: 0, n: 0, items: [] };
    terrBoxes = null;
    // 建物ID：一覧の中で1つだけのときに使う（同じIDが2つ以上ある一覧もあるので、そのときは名前と住所から作る）
    const refCnt = new Map();
    list.forEach(b => { const r = String(b.ref || '').replace(/[^\w.\-]/g, '').slice(0, 40); b.rid = r; if (r) refCnt.set(r, (refCnt.get(r) || 0) + 1); });
    const seen = new Set();
    list.forEach((b, idx) => {
      if (!b.pos) { if (b.addr) plan.miss.push(b); else plan.noAddr++; return; }
      const ta = terrAt(b.pos.lat, b.pos.lng);
      if (!ta) { plan.miss.push(b); return; }
      if (ta.out) plan.out++;
      let id = b.rid && refCnt.get(b.rid) === 1 ? b.rid : ('x' + hash36(`${b.name}|${String(b.addr || '').normalize('NFKC')}`));
      if (seen.has(id)) id = (id + '-' + idx).slice(0, 40);
      seen.add(id);
      const c = { i: id, n: b.name.slice(0, 40), la: round6(b.pos.lat), ln: round6(b.pos.lng) };
      const it = { b, c, tid: ta.id };
      plan.items.push(it);
      if (b.refs && b.refs.length) (plan.refs || (plan.refs = [])).push(it);
      if (b.floors) c.f = b.floors;
      if (b.floor1 === '0') c.g = 0;
      if (b.lock) c.k = 1;
      if (b.ban) c.b = b.ban;
      if (b.ac) c.ac = b.ac;
      if (!b.fromMap && !b.pos.good) c.p = 1; // 番地まで分からず、だいたいの場所
      if (!plan.by.has(ta.id)) plan.by.set(ta.id, []);
      plan.by.get(ta.id).push(c);
      plan.n++;
    });
    plan.auto = autoPicks(plan);
    plan.sens = plan.items.filter(it => sensWords(it.b.noteRest).length);
    return plan;
  }

  /* ---------- 近くに家の印がある建物は、その家をアパートにする（2026.13.25） ----------
       ・地番の土地が分かった建物：土地の中にある家の印（複数なら、土地のまん中に近い印）
       ・住所の検索で番地まで合った建物：MATCH_M m 以内でいちばん近い家の印（仮の家を先に）
       ・マイマップのピン：15m以内でいちばん近い家の印
     候補のまま残すもの：近くに家の印がない・番地まで分からない・同じ住所に建物が複数・
       二世帯住宅や会社・店にした家・すでに別の名前のアパート
     1つの家の印には1棟だけ（近い組から決める）。入れた建物には「自動」の目印をつけ、区域係が建物の画面で確かめる */
  function autoPicks(plan) {
    const used = new Set(); D().houses.forEach(h => { if (h.cid) used.add(h.cid); });
    const grid = new Map(), cell = (la, ln) => Math.round(la * 2000) + ':' + Math.round(ln * 2000);
    D().houses.forEach(h => { const k = cell(h.lat, h.lng); (grid.get(k) || grid.set(k, []).get(k)).push(h); });
    const near = (la, ln, r) => {
      const cy = Math.round(la * 2000), cx = Math.round(ln * 2000), out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        (grid.get((cy + dy) + ':' + (cx + dx)) || []).forEach(h => { const d = xlDist([h.lat, h.lng], [la, ln]); if (d <= r) out.push([h, d]); });
      }
      return out;
    };
    const fits = (h, name) => {
      if (h.cid) return false;
      if (h.type === 'apt') return !h.label || h.label === name;                  // 名前のないアパート・同じ名前のアパートだけ
      if (h.units && h.units.length) return false;                                // 二世帯住宅
      return !h.kind || h.kind === 'home';                                        // 会社・店などにした家はのぞく
    };
    const qCnt = new Map();
    plan.items.forEach(({ b }) => { if (b.entry && b.entry.nums.length) qCnt.set(b.entry.q, (qCnt.get(b.entry.q) || 0) + 1); });
    const pairs = [];
    plan.items.forEach(it => {
      const { b, c } = it;
      if (used.has(c.i)) return;                                                  // もう使った候補
      if (b.entry && qCnt.get(b.entry.q) > 1) return;                             // 同じ住所に建物が複数（団地の号棟など）
      let hs;
      if (b.cb) {
        hs = [];
        parcelCells(b).forEach(k => (grid.get(k) || []).forEach(x => { if (inParcel(b, x.lat, x.lng)) hs.push([x, xlDist([x.lat, x.lng], [c.la, c.ln]) - 1000]); }));
        it.inside = hs.length;
        if (!hs.length) hs = b.cb.pos.exact ? near(c.la, c.ln, 12) : [];          // 土地の中に印がない：土地のすぐそばだけ見る
      } else if (b.fromMap) {
        hs = near(c.la, c.ln, 15);
      } else {
        if (!(b.pos && b.pos.good)) return;                                       // 番地まで合っていない
        hs = near(c.la, c.ln, MATCH_M);
      }
      hs.forEach(([h, d]) => {
        if (!fits(h, c.n)) return;
        pairs.push({ it, h, d, sc: d - (h.prov ? 3 : 0) - (h.type === 'apt' ? 20 : 0) });
      });
    });
    pairs.sort((a, b) => a.sc - b.sc);
    const usedIt = new Set(), usedH = new Set(), picks = [];
    pairs.forEach(p => {
      if (usedIt.has(p.it) || usedH.has(p.h.id)) return;
      usedIt.add(p.it); usedH.add(p.h.id);
      picks.push({ it: p.it, h: p.h, kind: p.h.type === 'apt' ? 2 : 1 });
    });
    return picks;
  }
  /* note：建物のメモに入れる文（取り込みの確認画面で直したもの） */
  function applyAuto(p) {
    const h = houseById(p.h.id), c = p.it.c;
    if (!h || h.cid) return false;
    if (p.kind === 1) {
      if (h.type !== 'house' || (h.units && h.units.length)) return false;
      h.type = 'apt'; h.label = String(c.n || '').slice(0, 40);
      h.units = unitsOf({ floors: c.f || 0, floor1: c.g === 0 ? '0' : '1' });
      delete h.prov; delete h.kind; delete h.uk; delete h.ul;
      if (c.k) h.lock = true; else delete h.lock;
      if (c.b) h.ban = c.b; else delete h.ban;
      if (c.m) h.bn = c.m; else delete h.bn;
      if (c.ac) h.ac = c.ac; else delete h.ac;
    } else {
      if (h.type !== 'apt') return false;
      if (!h.label) h.label = String(c.n || '').slice(0, 40);
      if (!h.units.length) h.units = unitsOf({ floors: c.f || 0, floor1: c.g === 0 ? '0' : '1' });
      if (c.k) h.lock = true;
      if (c.b && !h.ban) h.ban = c.b;
      if (c.m && !h.bn) h.bn = c.m;
      if (c.ac && !h.ac) h.ac = c.ac;
    }
    h.cid = c.i; c.a = p.kind;
    return true;
  }
  function candOf(cid) {
    for (const t of D().territories) { const c = (t.cands || []).find(x => x.i === cid); if (c) return { c, t }; }
    return null;
  }
  /* 自動で入れて、まだ確かめていない建物 */
  function autoPending() {
    const out = [];
    D().houses.forEach(h => { if (!h.cid) return; const f = candOf(h.cid); if (f && f.c.a) out.push({ h, c: f.c, t: f.t }); });
    return out.sort((a, b) => String(a.t.no).localeCompare(String(b.t.no), 'ja', { numeric: true }) || String(a.c.n).localeCompare(String(b.c.n), 'ja'));
  }
  const autoBox = n => n ? `<label class="check"><input type="checkbox" id="aiCandAuto" checked><span>近くに家の印がある<b>${n}棟</b>は、その家の印をアパートにする<br><small class="muted">住所の土地の中か、住所の場所のすぐ近く（${MATCH_M}m以内）にある家の印です。「自動」の目印をつけるので、あとで地図で確かめられます。チェックを外すと、全部を候補にします。</small></span></label>` : '';

  /* 建物の編集画面のお知らせ（区域係だけ）。index.html の openBuilding から呼ぶ */
  window.aptAutoNotice = h => {
    if (!h || !h.cid || !isAdmin()) return '';
    const f = candOf(h.cid); if (!f || !f.c.a) return '';
    const conv = f.c.a === 1;
    return `<div class="notice info"><b>一覧の「${esc(f.c.n || '名前なし')}」を、自動でこの${conv ? '家の印' : '建物'}に入れました。</b><br>
      <small>${conv ? '住所の場所にあった家の印を、アパートに変えています。' : 'すでにあったアパートに、一覧の建物をつなぎました。'}場所と建物が合っているか確かめてください。</small>
      <div class="inline" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn small primary" data-aaok="${esc(h.id)}">合っている</button>
      <button class="btn small" data-aaundo="${esc(h.id)}">ちがう（${conv ? '元の家にもどす' : 'つながりを外す'}）</button></div></div>`;
  };
  let autoQueue = null; // 「順に確かめる」の残り
  function nextAuto() {
    if (!autoQueue) return false;
    autoQueue = autoQueue.filter(id => { const h = houseById(id); const f = h && h.cid && candOf(h.cid); return f && f.c.a; });
    const id = autoQueue[0];
    if (!id) { autoQueue = null; toast('自動で入れた建物を、すべて確かめました'); return false; }
    const h = houseById(id);
    closeSheet(); showView('map');
    setTimeout(() => { map.setView([h.lat, h.lng], 18); openBuilding(id); }, 150);
    return true;
  }
  function autoOk(hid) {
    const h = houseById(hid), f = h && h.cid && candOf(h.cid); if (!f) return;
    commit('合っていることにしました', () => { delete f.c.a; });
    if (!nextAuto()) setTimeout(() => openBuilding(hid), 30);
  }
  async function autoUndo(hid) {
    const h = houseById(hid), f = h && h.cid && candOf(h.cid); if (!f) return;
    const conv = f.c.a === 1;
    if (conv && h.units.some(u => unitHasRec(hid, u))) { toast('部屋に記録があるので、もどせません。建物の編集で直してください'); return; }
    if (!await ask(conv ? `「${h.label || '集合住宅'}」を元の家にもどします。一覧の建物は、また現場でえらべる候補になります。` : '一覧の建物とのつながりを外します。建物はそのまま残ります。')) return;
    commit(conv ? '元の家にもどしました' : 'つながりを外しました', () => {
      const x = houseById(hid); if (!x) return;
      delete f.c.a; delete x.cid;
      if (conv) {
        x.type = 'house'; x.units = []; x.label = '';
        delete x.lock; delete x.ban; delete x.ul; delete x.uk; delete x.bn; delete x.ac;
        const dnc = D().dnc; // 部屋ごとの拒否の印は、建物とのつながりだけ外して、場所の印として残す
        Object.keys(dnc).forEach(k => { const v = dnc[k]; if (v && typeof v === 'object' && v.room && v.h === hid) delete v.h; });
      }
    });
    if (!nextAuto()) { closeSheet(); if (conv) setTimeout(() => openTarget(hid, '', false), 30); else setTimeout(() => openBuilding(hid), 30); }
  }
  function openAutoList() {
    const list = autoPending();
    setSheet(headHtml(null, '自動で入れた建物', `まだ確かめていない ${list.length}棟`) + `
      <p class="hint">一覧の建物を、家の印と一致したので自動で入れたものです。押すと地図がその建物に移り、「合っている」「ちがう」をえらべます。</p>
      ${list.length ? `<button class="btn primary block" id="aaSeq">地図で順に確かめる</button>
        <div class="list">${list.map(x => `<button class="btn block" data-aigo="${esc(x.h.id)}">区域${esc(x.t.no)}　${esc(x.c.n || '（名前なし）')}${x.h.terrId !== x.t.id ? '<br><small class="muted">一覧の区域と、線の区域がちがいます</small>' : ''}${x.c.a === 2 ? '<br><small class="muted">すでにあったアパートにつないだ</small>' : ''}</button>`).join('')}</div>
        <button class="btn block" id="aaAllOk">全部、合っていることにする</button>` : '<p class="notice">確かめる建物はありません。</p>'}
      <button class="btn block" id="aaBack">もどる</button>`);
    if ($('#aaSeq')) $('#aaSeq').onclick = () => { autoQueue = list.map(x => x.h.id); nextAuto(); };
    $$('[data-aigo]', $('#sheet')).forEach(x => x.onclick = () => {
      const h = houseById(x.dataset.aigo); if (!h) return;
      autoQueue = null; closeSheet(); showView('map');
      setTimeout(() => { map.setView([h.lat, h.lng], 18); openBuilding(h.id); }, 150);
    });
    if ($('#aaAllOk')) $('#aaAllOk').onclick = async () => {
      if (!await ask(`${list.length}棟を、地図で見ずに「合っている」にします。よろしいですか？`)) return;
      commit(`${list.length}棟を合っていることにしました`, () => { autoPending().forEach(x => { delete x.c.a; }); });
      openAutoList();
    };
    $('#aaBack').onclick = openMain;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-aaok],[data-aaundo]');
    if (!a) return;
    e.preventDefault();
    if (!isAdmin()) { toast('区域係だけが使えます'); return; }
    if (a.dataset.aaok) autoOk(a.dataset.aaok); else autoUndo(a.dataset.aaundo);
  });

  function showCandPlan(plan, fileName) {
    const nMiss = plan.miss.length, nAuto = plan.auto.length;
    const sensRow = (it, i) => `<div class="field"><span>${esc(it.b.name || '（名前なし）')}　<small class="muted">気になる言葉：${esc(sensWords(it.b.noteRest).join('・'))}</small></span>
      <textarea data-sens="${i}" rows="2" maxlength="200" aria-label="${esc(it.b.name || '')}のメモ">${esc(it.b.noteRest)}</textarea></div>`;
    setSheet(headHtml(null, '登録する内容の確認', esc(fileName)) + `
      <div class="tiles"><div class="tile"><b>${nAuto}</b><span>家の印をアパートに</span></div>
        <div class="tile"><b>${plan.n - nAuto}</b><span>候補にする（近くに印がない）</span></div>
        <div class="tile"><b>${nMiss}</b><span>場所が分からない</span></div></div>
      ${autoBox(nAuto)}
      <p class="hint">一覧の区域の欄は使いません。住所の場所が入る区域の線で決めます${plan.out ? `（線の外の${plan.out}棟は、いちばん近い区域）` : ''}。<br>
        <b>候補</b>は、現場で家の画面から「アパート・マンションだった」を押すと、近い順に出ます。えらぶと名前・階数・オートロック・メモが入ります。<br>
        建物タイプ（オートロック・立入禁止・手紙のみ・エレベーター・縦階段）と階数、備考も入れます。前に登録した候補は、このファイルの内容に置きかわります（使った候補はそのまま）。</p>
      ${plan.sens.length ? `<details class="more" open><summary>メモに住んでいる人のことらしい言葉がある建物（${plan.sens.length}棟）</summary>
        <p class="hint">建物のメモは、くわしい表示の人みんなが見ます。国籍・年齢や性別・病気・名前などは消すか、「英語の文書」「夕方は控える」のように訪問に必要なことだけに書きかえてください。</p>
        ${plan.sens.map(it => sensRow(it, plan.items.indexOf(it))).join('')}</details>` : ''}
      ${nMiss ? `<details class="more"><summary>場所が分からない建物（${nMiss}棟）：登録しません</summary>
        <p class="hint">住所に番地がない・町の名前が読めない建物です。地図で家の印をタップして「アパート・マンションだった」から入れてください。</p><ul>${plan.miss.map(b => `<li>${lineOf(b)}</li>`).join('')}</ul>
        <button class="btn small" id="aiCopyMiss">この一覧をコピー</button></details>` : ''}
      ${refBox((plan.refs || []).reduce((n, x) => n + x.b.refs.length, 0), 'aiCandRefs')}
      <button class="btn primary block" id="aiCandGo"${plan.n ? '' : ' disabled'}>${plan.n}棟を登録する</button>
      <button class="btn block" data-close>やめる</button>`);
    const edited = new Map();
    $$('[data-sens]', $('#sheet')).forEach(x => x.oninput = () => edited.set(+x.dataset.sens, x.value));
    if ($('#aiCopyMiss')) $('#aiCopyMiss').onclick = async () => {
      try { await navigator.clipboard.writeText(plan.miss.map(b => `${b.name}\t${b.addr}`).join('\n')); toast('コピーしました'); } catch (e) { toast('コピーできませんでした'); }
    };
    $('#aiCandGo').onclick = () => {
      if (!isAdmin()) return;
      const withRefs = !!($('#aiCandRefs') && $('#aiCandRefs').checked);
      const withAuto = !!($('#aiCandAuto') && $('#aiCandAuto').checked);
      // 建物のメモ：備考から部屋ごとの拒否（例：603拒）をのぞいた残り。拒否は拒否の一覧で持つ（メモには入れない）
      plan.items.forEach((it, i) => {
        const v = noteTrim(edited.has(i) ? edited.get(i) : it.b.noteRest);
        if (v) it.c.m = v; else delete it.c.m;
      });
      // 前の候補を置きかえる：このファイルにない候補は、使ったもの（家につながっているもの）だけ残す
      const oldA = new Map(), usedIds = new Set(), newIds = new Set(plan.items.map(x => x.c.i));
      D().houses.forEach(h => { if (h.cid) usedIds.add(h.cid); });
      D().territories.forEach(t => {
        if (!t.cands) return;
        t.cands.forEach(c => { if (c.a) oldA.set(c.i, c.a); });
        const keep = t.cands.filter(c => !newIds.has(c.i) && usedIds.has(c.i));
        if (keep.length) t.cands = keep; else delete t.cands;
      });
      plan.by.forEach((list, tid) => {
        const t = terrById(tid); if (!t) return;
        list.forEach(c => { if (oldA.has(c.i) && usedIds.has(c.i)) c.a = oldA.get(c.i); });
        t.cands = (t.cands || []).concat(list).sort((a, b) => String(a.n).localeCompare(String(b.n), 'ja')).slice(0, 600);
      });
      let nAuto = 0;
      if (withAuto) plan.auto.forEach(p => { if (applyAuto(p)) nAuto++; });
      let nRef = 0;
      if (withRefs) {
        const now = new Date().toISOString(), used = new Map();
        D().houses.forEach(h => { if (h.cid) used.set(h.cid, h); });
        (plan.refs || []).forEach(({ b, c, tid }) => {
          const h = used.get(c.i); // アパートにした建物は、その家につなぐ
          nRef += addRoomRefs(b, h ? { lat: h.lat, lng: h.lng, tid: h.terrId || tid, h: h.id, cid: c.i } : { lat: c.la, lng: c.ln, tid, cid: c.i }, now);
        });
      }
      Store.save(); renderAll();
      toast(`${plan.n}棟を登録しました（家の印をアパートに ${nAuto}棟・候補 ${plan.n - nAuto}棟）${nRef ? `。部屋ごとの拒否 ${nRef}件を拒否の一覧に入れました` : ''}`);
      if (nAuto) openAutoList(); else openMain();
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
    const c = counts(), cs = candStats(), nAutoP = autoPending().length;
    setSheet(headHtml(null, 'アパートの登録', 'けす → 候補をいれる の順に進めます') + `
      <div class="notice info">使いはじめの前に、実際のアパートの一覧に合わせるための画面です。<b>区域係だけ</b>が使えます。</div>
      <h3 class="sub">① 先にバックアップをとる</h3>
      <p class="hint">スプレッドシートのメニューから「今すぐバックアップ」を押してください。消すのは元にもどせません。</p>
      <h3 class="sub">② 入っているアパートを全部消す</h3>
      <p class="hint">アパート ${c.apt}棟を、ふつうの家にもどします（取り込みで置いた家 ${c.imp}軒は家ごと消えます）。一戸建ての記録・家の場所・区域の線は残ります。</p>
      <button class="btn block danger" id="aiResetApt">アパートだけ全部消す…</button>
      <h3 class="sub">③ アパートの一覧（CSV）を登録する（おすすめ）</h3>
      <p class="hint">住所から場所を調べ、<b>近くに家の印があれば、その印をアパート</b>にします（名前・階数・オートロック・メモが入ります）。<b>近くに印がない建物</b>は、現場でえらぶ<b>候補</b>にします。<br>
        区域番号の欄は使いません（場所が入る区域の線で決めます）。<br>
        いまの候補：<b>${cs.all}棟</b>（使った ${cs.used}／残り ${cs.left}）</p>
      ${nAutoP ? `<button class="btn block" id="aiAutoList">自動で入れた建物を確かめる（${nAutoP}棟）</button>` : ''}
      <label class="btn primary block">CSV（またはKML・KMZ）を選んで登録する<input type="file" id="aiCandFile" accept=".kml,.kmz,.csv,text/csv,text/plain,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" hidden></label>
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
    if ($('#aiAutoList')) $('#aiAutoList').onclick = openAutoList;
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
      infoSheet('一覧を読み込めませんでした', '「区域（区域番号）」「建物名」「住所」の見出しがあるCSVを選んでください。<br>あれば「建物ID」「階数」「1F有」「オートロック」「立入」「建物タイプ」も読みます（ほかの列は読みません）。');
      return;
    }
    locate(list, file.name || '');
  }

  /* 住所 → 位置 → どの家に重ねるかを決める */
  async function locate(list, fileName) {
    list.forEach(b => {
      b.units = unitsOf(b);
      const p = b.addr ? xlParseJa(b.addr) : null; // 「沖縄県」があってもなくても読める
      if (p) { b.entry = { q: '沖縄県' + p.muni + p.town + p.nums.join('-'), nums: p.nums, muni: p.muni, town: p.town }; }
    });
    setSheet(headHtml(null, '住所から場所を調べています', esc(fileName)) + `<p class="hint">しばらくお待ちください（この画面を閉じないでください）。</p>
      <div class="bar"><i id="aiBar" style="width:0%"></i></div><p class="muted" id="aiCnt">地番の地図で調べています…</p>`);
    await chibanAll(list);
    const qs = Array.from(new Set(list.filter(b => b.entry && !b.cb).map(b => b.entry.q))); // 番地のない住所も、町のまん中だけ調べる
    let geo = new Map();
    if (qs.length) {
      try {
        geo = await xlGeocode(qs, n => { const b = $('#aiBar'), c = $('#aiCnt'); if (b) b.style.width = Math.round(n / Math.max(1, qs.length) * 100) + '%'; if (c) c.textContent = `国土地理院で調べています ${n} / ${qs.length}`; });
      } catch (e) {
        infoSheet('場所を調べられませんでした', 'インターネットの接続を確かめて、もう一度ためしてください。');
        return;
      }
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
      const t = b.terr ? terrByNo(b.terr) : null; if (!t && b.terr) plan.noTerr.add(b.terr);
      b.t = t || null;
      if (!b.fromMap) b.pos = b.cb ? cbPos(b) : b.entry ? xlPick(b.entry, geo.get(b.entry.q)) : null;
      return b;
    });
    const grid = new Map(), cell = (la, ln) => Math.round(la * 2000) + ':' + Math.round(ln * 2000);
    D().houses.forEach(h => {
      if (h.type !== 'house') return;
      const k = cell(h.lat, h.lng); (grid.get(k) || grid.set(k, []).get(k)).push(h);
    });
    const insideOf = b => { const out = []; parcelCells(b).forEach(k => (grid.get(k) || []).forEach(h => { if (inParcel(b, h.lat, h.lng)) out.push(h); })); return out; };
    const placeable = [];
    ex.forEach(b => {
      if (!b.pos) { plan.miss.push(b); return; }
      if (apts.some(h => h.label === b.name && xlDist([h.lat, h.lng], [b.pos.lat, b.pos.lng]) <= MATCH_M * 2)) { plan.already++; return; }
      b.why = [];
      if (!b.fromMap) {
        if (!b.entry.nums.length) b.why.push('番地が分からないため、だいたいの場所');
        else if (!b.pos.good && b.cb) {
          // 地番が分かれていた（123 → 123-1・123-2…）：分かれた土地ぜんぶの中に家が1軒だけなら、その家に重ねる
          if (insideOf(b).length === 1 && !(cnt.get(b.entry.q) > 1)) b.note = '住所の地番が分かれていたので、分かれた土地の中にある1軒に重ねました';
          else b.why.push('住所の地番が分かれていて、どの土地か決められなかったため、もとの地番の土地の中に置きました');
        } else if (!b.pos.good) b.why.push('番地まで合わず、だいたいの場所');
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
    const pairs = [];
    sure.forEach((b, i) => {
      if (b.cb) { // 地番の土地が分かった建物：土地の中にある家だけを見る（距離は関係ない）
        const inside = insideOf(b);
        b.inside = inside.length;
        inside.forEach(h => {
          const d = xlDist([h.lat, h.lng], [b.pos.lat, b.pos.lng]);
          pairs.push({ i, h, d, score: d - 1000 - (h.prov ? 3 : 0) }); // 土地の中の家は、ほかの建物の「近くの家」より先にえらぶ
        });
        return;
      }
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
      const b = sure[p.i];
      if (b.cb && b.inside > 1) b.note = `土地の中に家の印が${b.inside}つあったので、いちばん土地のまん中に近い家をアパートにしました`;
      if (b.cb && b.cb.pos.old) b.note = ((b.note ? b.note + '。' : '') + `今の地図にない古い地番なので、${b.cb.pos.old}年の地図で場所を調べました`);
      else if (b.cb && b.note) { /* 地番が分かれていたときの説明をそのまま使う */ }
      plan.convert.push({ b, h: p.h });
    });
    sure.forEach((b, i) => { if (!usedB.has(i)) { b.why.push(b.cb ? '地番の土地の中に家の印がなかったため、土地の中に新しく置きました' : '近くに家がなかったため、新しく置きました'); plan.create.push(b); } });
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
    plan.nCb = list.filter(b => b.cb && b.pos).length;
    plan.nOld = list.filter(b => b.cb && b.cb.pos.old && b.pos).length;
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
      ${plan.nCb ? `<p class="hint"><b>${plan.nCb}棟</b>は、地番の地図で住所の土地まで分かりました。その土地の中にある家をアパートにします。${plan.nOld ? `<br>うち<b>${plan.nOld}棟</b>は今の地図にない古い地番で、前の年の地図で場所を調べました。` : ''}</p>` : ''}
      <p class="hint"><b>家に重ねる</b>：住所の土地の中の家（地番の地図で分かったとき）か、住所の場所のすぐ近くの家（仮の家を優先）を、アパートに変えます。<br>
        <b>新しく置く</b>：近くに家がない・場所があいまい・ピンが重なっている建物です。取り込んだあとの一覧で、1棟ずつ地図で確かめてください。</p>
      ${noT.length ? `<div class="notice warn">一覧の区域 ${esc(noT.join('・'))} は、アプリに区域がありません。場所の線の中にある区域に入ります。</div>` : ''}
      ${nMiss ? `<details class="more"><summary>場所が分からない建物（${nMiss}棟）：作りません</summary>
        <p class="hint">地図で「＋ 家」から入れてください。</p><ul>${plan.miss.map(b => `<li>区域${esc(b.terr)}　${lineOf(b)}</li>`).join('')}</ul>
        <button class="btn small" id="aiCopyMiss">この一覧をコピー</button></details>` : ''}
      ${refBox(refCount(plan.convert.map(x => x.b).concat(plan.create)), 'aiRefs')}
      <button class="btn primary block" id="aiCommit"${nCv + nCr ? '' : ' disabled'}>${nCv + nCr}棟を登録する</button>
      <button class="btn block" data-close>やめる</button>
      ${plan.nCb && window.chibanSrc ? `<p class="hint">地番の場所は、${esc(window.chibanSrc())}</p>` : ''}`);
    if ($('#aiCopyMiss')) $('#aiCopyMiss').onclick = async () => {
      const t = plan.miss.map(b => `区域${b.terr}\t${b.name}\t${b.addr}`).join('\n');
      try { await navigator.clipboard.writeText(t); toast('コピーしました'); } catch (e) { toast('コピーできませんでした'); }
    };
    $('#aiCommit').onclick = () => { plan.withRefs = !!($('#aiRefs') && $('#aiRefs').checked); commitPlan(plan); };
  }

  function apply(b, h) {
    h.type = 'apt'; h.label = b.name.slice(0, 40); h.units = b.units.slice(0, 300);
    delete h.prov; delete h.kind; delete h.uk; delete h.ul;
    if (b.lock) h.lock = true; else delete h.lock;
    if (b.ban) h.ban = b.ban; else delete h.ban;
    const bn = noteTrim(b.noteRest); if (bn) h.bn = bn; else delete h.bn;
    if (b.ac) h.ac = b.ac; else delete h.ac;
  }
  function commitPlan(plan) {
    if (!isAdmin()) return;
    const check = [];
    const now = new Date().toISOString();
    const diffTerr = (b, h) => { const a = terrOf(h.lat, h.lng); return b.t && a !== b.t.id ? ` 一覧の区域${b.terr}と、線の区域がちがいます` : ''; };
    plan.convert.forEach(({ b, h }) => {
      apply(b, h);
      if (plan.withRefs) addRoomRefs(b, { lat: h.lat, lng: h.lng, tid: h.terrId, h: h.id }, now);
      const w = ((b.note || '') + diffTerr(b, h)).trim();
      if (w) check.push({ id: h.id, b, note: w });
    });
    plan.create.forEach(b => {
      const h = { id: 'h' + uid(), terrId: terrOf(b.lat, b.lng), type: 'apt', lat: round6(b.lat), lng: round6(b.lng), label: '', units: [], createdAt: now, createdBy: me().id, imp: true };
      apply(b, h);
      D().houses.push(h);
      if (plan.withRefs) addRoomRefs(b, { lat: h.lat, lng: h.lng, tid: h.terrId, h: h.id }, now);
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
  window.AptImport = { parseCsv, buildings, unitsOf, makePlan, dropRefs, sensWords, applyAuto, parseMyMap, resetData, counts, makeCandPlan, autoPicks, autoPending, resetApts, aptCounts };
})();
