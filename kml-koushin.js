/* =========================================================
   kml-koushin.js  マイマップ（KML）で、区域と拒否・注意を新しくする（2026-10-18）

   ・入口：係の画面 ＞ 区域 ＞「区域の取り込み…」＞［マイマップで区域と拒否を新しくする（全部置きかえ）］
   ・読めるもの：KML・KMZ・ZIP（Googleドライブのフォルダをまとめてダウンロードしたもの）。いくつでもまとめて選べる
   ・マイマップの作り（豊見城会衆区域 2026-10）
       親の区域  … 線の名前が「A05」「B18」「G62」（英字＝ブロック、数字＝区域番号）
       枝番の区域 … 線の名前が「5-①」「5-③」（丸数字か数字）→ 区域番号「5-1」「5-3」
                   枝番の線がない親（例：18）は、親の線をそのまま区域「18」にする
       枝番の目印 … 「ポイント ①」などのピン → 取り込まない
       拒否のピン … 赤紫など。説明欄に「18-① 1-905、1-1001」のように部屋番号（「18-①」は枝番の参照なので読まない）
       注意のピン … 黒いピン（例：「5-③ 夜勤」）。部屋番号のあとのカッコ書き「1002（夜勤）」も注意
   ・枝番の抜け：親の中で、枝番が1つだけ抜けていて（例：5-② がない）ほかの枝番に囲まれた部分があるときは、
                その部分を抜けた番号の区域として自動で作る（2026-10-18 の取り決め）。
                それ以外で枝番の線の外に残る家は、確認画面と終わりの画面で知らせ、係が線を引き直す
   ・置きかえ：区域…番号が同じ区域は、そのまま（貸し出し・S-13の記録を引き継ぐ）線と名前だけ新しく。
                     番号がなくなる区域は消す（家は残り、新しい線で区域を決め直す）。特別区域・検証用の区域はそのまま
              拒否…今ある拒否をすべて消して、KMLのピンで入れなおす（チェックを外すと、今の拒否も残す）
              注意…以前にマイマップから入れた注意だけ入れなおす（奉仕者・係が書いた注意は残す）
   ・個人情報：ピンの名前は、住所の形のときだけ住所として残す（人の名前などは残さない）。
              注意の文に病気・家庭の事情などが書かれていそうなものは、確認画面で目印を付ける
   ・置きかえる前に、今の区域・拒否・注意を、この端末にファイルで控える

   index.html：<script src="chui.js"></script> の次に <script src="kml-koushin.js"></script>
   ========================================================= */
(function (root) {
  'use strict';

  /* =========================================================
     読みとり（画面がなくても動く部分。ためしに動かすときは root.KmlKoushin を使う）
     ========================================================= */
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const DASH = '[-－ー―‐−–—]';
  const RE_PARENT = /^\s*([A-Za-zＡ-Ｚａ-ｚ])\s*0*(\d{1,3})\s*$/;
  const RE_KID = new RegExp('^\\s*0*(\\d{1,3})\\s*' + DASH + '\\s*([' + CIRC + ']|\\d{1,2})\\s*$');
  const RE_MARK = /^\s*(ポイント|ﾎﾟｲﾝﾄ|point|スタート|start)?\s*[①-⑳]?\s*$/i;
  const REF_W = /拒|断わ|断り|断る|お断|NG|ＮＧ|来ないで|訪問(しない|不可|禁止|お断)|もう来/;
  const WARN_W = /犬|猫|控え|注意|午前|午後|夜勤|夜|朝|昼|時|曜|ノック|インターホン|チャイム|ベル|鳴らさ|留守|吠|危|工事|休み|寝|赤ちゃん|乳児|裏|玄関|門/;
  const SENS_W = /病|認知|障害|障がい|亡|死|入院|宗教|学会|離婚|生活保護|借金|暴力|警察|ＤＶ|DV|妊|手術|薬|精神|うつ|介護|施設に入/;
  const BLD = /[ァ-ヶー]{2,}|荘|ハイツ|団地|棟|マンション|アパート|コーポ|レジデンス|ハウス|ビル/;
  const looksAddr = c => !!c && /\d/.test(c) && /[一-鿿]/.test(c) && c.length <= 120;
  const circN = c => (CIRC.indexOf(c) >= 0 ? CIRC.indexOf(c) + 1 : Number(c));

  function kids(el, name) { return [...el.children].filter(c => c.localName === name); }
  function textOf(el, name) { const n = kids(el, name)[0]; return n ? n.textContent.trim() : ''; }
  function coordsOf(el) {
    const c = el && el.getElementsByTagNameNS('*', 'coordinates')[0];
    if (!c) return [];
    return c.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number))
      .filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]) && Math.abs(a[1]) <= 90 && Math.abs(a[0]) <= 180)
      .map(a => [a[1], a[0]]);
  }
  /* 1つのKMLの中身を読む → { parents, kids, others, pins, marks } */
  function parseKmlText(text, fileName, DP) {
    const doc = new (DP || DOMParser)().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
    const out = { file: fileName || '', parents: [], kids: [], others: [], pins: [], marks: 0 };
    for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
      const name = textOf(pm, 'name'), desc = textOf(pm, 'description').replace(/<[^>]*>/g, ' ');
      const style = textOf(pm, 'styleUrl');
      const polys = [...pm.getElementsByTagNameNS('*', 'Polygon')].map(p => coordsOf(p.getElementsByTagNameNS('*', 'outerBoundaryIs')[0] || p))
        .concat([...pm.getElementsByTagNameNS('*', 'LineString')].map(coordsOf)).filter(r => r.length >= 3);
      if (polys.length) {
        const ring = polys.sort((a, b) => b.length - a.length)[0];
        let m;
        if ((m = name.match(RE_PARENT))) out.parents.push({ pno: String(Number(m[2])), pnm: name.trim().normalize('NFKC'), ring });
        else if ((m = name.match(RE_KID))) out.kids.push({ pno: String(Number(m[1])), b: String(circN(m[2])), raw: name.trim(), ring });
        else out.others.push({ raw: name.trim(), ring });
        continue;
      }
      const pt = pm.getElementsByTagNameNS('*', 'Point')[0];
      if (!pt) continue;
      const c = coordsOf(pt)[0];
      if (!c) continue;
      if (RE_MARK.test(name) && !desc.trim()) { out.marks++; continue; } // 「ポイント ①」など、枝番の目印
      out.pins.push({ name, desc, style, lat: c[0], lng: c[1], file: fileName || '' });
    }
    return out;
  }
  /* ピン1本を、拒否・注意の項目に分ける */
  function splitPin(p) {
    const black = /-000000(?:-|$)/.test(p.style || '');
    let d = String(p.desc || '');
    d = d.replace(new RegExp('\\d+\\s*' + DASH + '\\s*[' + CIRC + '](?:\\s*[、,，・]\\s*[' + CIRC + '])*', 'g'), ' ') // 「18-①」「62－②、④」＝枝番の参照
      .replace(new RegExp('[' + CIRC + '](?:\\s*[、,，]\\s*[' + CIRC + '])*', 'g'), ' ');
    d = d.normalize('NFKC');
    const rooms = [];
    d = d.replace(/(\d{1,2}\s*-\s*\d{3,4}|\d{3,4})(?![\d年月日時:/])(?:号室?)?\s*(?:\(([^)]*)\))?/g, (m0, r, n) => { rooms.push({ room: r.replace(/\s/g, ''), note: (n || '').trim() }); return ' '; });
    const left = d.replace(/[、,，。・/／\s]+/g, ' ').trim();
    let nm = String(p.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!rooms.length && BLD.test(nm)) { // 名前の終わりの部屋番号（例：コーポ白菊302・メゾンオオタ 302）
      const m = nm.match(/[\s゠-ヿ一-鿿]\s*(\d{3,4})(?:号室?)?$/);
      if (m) { rooms.push({ room: m[1], note: '' }); nm = nm.slice(0, m.index + 1).trim(); }
    }
    const a = looksAddr(nm) ? nm.slice(0, 120) : '';
    const base = { lat: p.lat, lng: p.lng, a, src: p.name, file: p.file, black };
    const items = [];
    if (rooms.length) {
      rooms.forEach(r => {
        let kind, note;
        if (r.note) { kind = REF_W.test(r.note) ? 'dnc' : 'warn'; note = r.note; }
        else if (black) { kind = 'warn'; note = left; }
        else { kind = 'dnc'; note = ''; }
        items.push(Object.assign({}, base, { room: r.room, kind, note: kind === 'warn' ? note.slice(0, 80) : '' }));
      });
    } else {
      let kind = 'dnc', note = '';
      if (black) { kind = 'warn'; note = left || (!looksAddr(nm) ? nm : ''); }
      else if (left && !REF_W.test(left) && WARN_W.test(left)) { kind = 'warn'; note = left; }
      else if (!left && !a && WARN_W.test(nm) && !REF_W.test(nm)) { kind = 'warn'; note = nm; }
      items.push(Object.assign({}, base, { room: '', kind, note: note.slice(0, 80) }));
    }
    items.forEach(it => { it.sens = SENS_W.test(it.note || ''); });
    return items;
  }
  /* 区域の線をまとめる（同じ親・同じ枝番が2つのファイルにあれば、あとのものは使わない） */
  function mergeParsed(list) {
    const parents = new Map(), kidm = new Map(), others = [], pins = [], dup = [];
    let marks = 0;
    list.forEach(x => {
      x.parents.forEach(p => { if (!parents.has(p.pno)) parents.set(p.pno, p); });
      x.kids.forEach(k => { const no = k.pno + '-' + k.b; if (kidm.has(no)) dup.push(no); else kidm.set(no, Object.assign({ no }, k)); });
      x.others.forEach(o => others.push(o));
      pins.push(...x.pins);
      marks += x.marks;
    });
    return { parents, kids: kidm, others, pins, marks, dup };
  }

  /* 外へ */
  root.KmlKoushin = { parseKmlText, splitPin, mergeParsed, RE_PARENT, RE_KID };
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof document === 'undefined') return;

  /* =========================================================
     ここから画面
     ========================================================= */
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.19' && c.items.some(i => /枝番/.test(i[1])))) {
    const cl = CHANGELOG.find(c => c.v === '2026.13.19');
    const it = [['区', '区域の線と番号が新しくなりました。枝番の区域（例：5-1）は、地図で親の区域（5）の太い線の中に出ます'],
      ['区', '区域係の画面から、マイマップ（KML）で区域と拒否・注意をまとめて新しくできるようになりました']];
    if (cl) cl.items.push(...it); else CHANGELOG.unshift({ v: '2026.13.19', items: it });
  }
  LIB.pclip = 'vendor/polygon-clipping-0.15.7/polygon-clipping.umd.min.js';
  const r6 = x => Math.round(Number(x) * 1e6) / 1e6;
  const now = () => new Date().toISOString();
  const MIN_GEN_M2 = 150;   // 抜けた枝番として作る部分の、いちばん小さい広さ（これより小さいすき間は、線のずれとみなす）
  const C = () => D().caution || (D().caution = {});

  /* ---------- ファイルを読む（KML・KMZ・ZIP。いくつでも） ---------- */
  async function readFiles(files) {
    const texts = [];
    const isZip = async f => { const h = new Uint8Array(await f.slice(0, 2).arrayBuffer()); return h[0] === 0x50 && h[1] === 0x4B; };
    for (const f of files) {
      if (await isZip(f)) {
        await loadScript(LIB.zip);
        const zip = await window.JSZip.loadAsync(f);
        for (const z of Object.values(zip.files)) {
          if (z.dir) continue;
          if (/\.kml$/i.test(z.name)) texts.push({ name: z.name.split('/').pop(), text: await z.async('string') });
          else if (/\.kmz$/i.test(z.name)) { // ZIPの中のKMZ
            const inner = await window.JSZip.loadAsync(await z.async('uint8array'));
            const k = inner.file('doc.kml') || inner.file(/\.kml$/i)[0];
            if (k) texts.push({ name: z.name.split('/').pop(), text: await k.async('string') });
          }
        }
      } else texts.push({ name: f.name || '', text: await f.text() });
    }
    return texts;
  }

  /* ---------- 新しい区域の形を決める ---------- */
  const simp = ring => { const p = dropDup(ring); return p.length >= 3 ? simplifyRing(p, SIMPLIFY_M) : p; };
  const toPC = ring => [[...ring, ring[0]].map(p => [p[1], p[0]])]; // polygon-clipping は [x, y]（経度, 緯度）
  const fromPC = r => dropDup(r.map(p => [p[1], p[0]]));
  function genMissing(m, notes) {
    // 枝番が1つだけ抜けている親：親の線から、ほかの枝番の線を引いた残りの、いちばん大きい部分を、その番号の区域にする
    const pc = window.polygonClipping, made = [];
    m.parents.forEach((p, pno) => {
      const ks = [...m.kids.values()].filter(k => k.pno === pno);
      if (!ks.length) return;
      const nums = ks.map(k => Number(k.b)), max = Math.max(...nums);
      const miss = []; for (let i = 1; i <= max; i++) if (!nums.includes(i)) miss.push(i);
      if (miss.length !== 1 || !pc) return;
      let rest;
      try { rest = pc.difference(toPC(p.ring), ...ks.map(k => toPC(k.ring))); } catch (e) { notes.push(`区域${pno}：抜けた枝番 ${pno}-${miss[0]} を作れませんでした（線が交差しています）`); return; }
      const rings = rest.map(poly => fromPC(poly[0])).filter(r => r.length >= 3).map(r => ({ r, a: ringAreaM2(r) })).sort((a, b) => b.a - a.a);
      if (!rings.length || rings[0].a < MIN_GEN_M2) return;
      const no = pno + '-' + miss[0];
      m.kids.set(no, { no, pno, b: String(miss[0]), raw: `（自動）${pno}-${CIRC[miss[0] - 1] || miss[0]}`, ring: rings[0].r, gen: true });
      made.push(no);
    });
    return made;
  }
  function planTerrs(m) {
    const notes = [], specs = [];
    const made = genMissing(m, notes);
    m.parents.forEach((p, pno) => {
      const ks = [...m.kids.values()].filter(k => k.pno === pno).sort((a, b) => Number(a.b) - Number(b.b));
      const pp = simp(p.ring);
      if (!ks.length) { specs.push({ no: pno, pno: '', pnm: p.pnm, poly: pp, kind: 'single' }); return; }
      ks.forEach(k => specs.push({ no: k.no, pno, pnm: p.pnm, pp, poly: simp(k.ring), kind: k.gen ? 'gen' : 'kid', raw: k.raw }));
    });
    // 親の線がない枝番（ファイルの書きまちがいなど）も、区域として入れる
    m.kids.forEach(k => { if (!m.parents.has(k.pno)) { specs.push({ no: k.no, pno: k.pno, pnm: '', poly: simp(k.ring), kind: 'kid', raw: k.raw }); notes.push(`枝番 ${k.no} の親（区域${k.pno}）の線がありませんでした`); } });
    m.others.forEach(o => {
      const s = typeof splitName === 'function' ? splitName(o.raw) : { no: '' };
      if (s.no && NO_RE.test(s.no) && !specs.some(x => x.no === s.no)) specs.push({ no: s.no, pno: '', pnm: o.raw, poly: simp(o.ring), kind: 'single' });
      else notes.push(`線「${o.raw || '名前なし'}」は、区域番号が分からないので入れません`);
    });
    m.dup.forEach(no => notes.push(`枝番 ${no} が2つのファイルにありました（はじめのものを使います）`));
    specs.sort((a, b) => cmpNo(a.no, b.no));
    // となりの区域と近い角（3m以内）を、同じ点にそろえる（あとで線を直すとき、となりと一緒に動かせる）
    const pool = [];
    specs.forEach(s => { const q = dropDup(snapToPool(s.poly.map(p => p.slice()), pool)); if (q.length >= 3) s.poly = q; });
    return { specs, notes, made };
  }
  /* 家がどの新しい区域に入るか（枝番の外に残る家を数える） */
  function houseFit(specs) {
    const bx = specs.map(s => ({ s, b: bboxOf(s.poly) }));
    const pps = new Map();
    specs.forEach(s => { if (s.pno && s.pp && !pps.has(s.pno)) pps.set(s.pno, { pp: s.pp, b: bboxOf(s.pp) }); });
    const gaps = new Map(); let outside = 0;
    for (const h of D().houses) {
      let hit = null;
      for (const x of bx) { const b = x.b; if (h.lat < b[0] || h.lat > b[1] || h.lng < b[2] || h.lng > b[3]) continue; if (inPoly(h.lat, h.lng, x.s.poly)) { hit = x.s; break; } }
      if (hit) continue;
      let gp = null;
      pps.forEach((v, pno) => { const b = v.b; if (!gp && h.lat >= b[0] && h.lat <= b[1] && h.lng >= b[2] && h.lng <= b[3] && inPoly(h.lat, h.lng, v.pp)) gp = pno; });
      if (gp) gaps.set(gp, (gaps.get(gp) || 0) + 1); else outside++;
    }
    return { gaps, outside };
  }
  function terrOfSpecs(specs) {
    const bx = specs.map(s => ({ s, b: bboxOf(s.poly) }));
    return (la, ln) => { for (const x of bx) { const b = x.b; if (la < b[0] || la > b[1] || ln < b[2] || ln > b[3]) continue; if (inPoly(la, ln, x.s.poly)) return x.s.no; } return ''; };
  }

  /* ---------- 入口 ---------- */
  async function start(files) {
    if (!isAdmin()) return;
    if (!files || !files.length) return;
    toast('ファイルを読んでいます…');
    let texts;
    try { texts = await readFiles(files); } catch (e) { infoSheet('ファイルを読み込めませんでした', 'マイマップの「KML/KMZにエクスポート」で書き出したファイル（またはそれをまとめたZIP）を選んでください。'); return; }
    const parsed = [], bad = [];
    texts.forEach(t => { try { parsed.push(parseKmlText(t.text, t.name)); } catch (e) { bad.push(t.name); } });
    const m = mergeParsed(parsed);
    if (!m.parents.size && !m.kids.size) { infoSheet('区域の線が見つかりませんでした', 'マイマップで書き出すときに「ネットワーク リンク」のチェックを外して、もう一度書き出してください。'); return; }
    try { await loadScript(LIB.pclip); } catch (e) { /* なくても、抜けた枝番を作らないだけ */ }
    const tp = planTerrs(m);
    const items = [];
    m.pins.forEach(p => splitPin(p).forEach(it => items.push(it)));
    const tno = terrOfSpecs(tp.specs);
    items.forEach((it, i) => { it.i = i; it.tno = tno(it.lat, it.lng); it.use = true; });
    const fit = houseFit(tp.specs);
    const st = { files: texts.length, bad, m, tp, items, fit, replaceDnc: true };
    preview(st);
  }

  /* ---------- 確認の画面 ---------- */
  const ui = { open: new Set(), tab: 'terr' };
  function oldInfo(specs) {
    const nos = new Set(specs.map(s => s.no));
    const olds = D().territories.filter(t => !t.dummy && !isSpecial(t));
    const keep = olds.filter(t => nos.has(normNo(t.no))), gone = olds.filter(t => !nos.has(normNo(t.no)));
    return { keep, gone, lentGone: gone.filter(t => t.holder), lentKeep: keep.filter(t => t.holder) };
  }
  function dncCounts() {
    let visit = 0, imp = 0, room = 0;
    for (const k in D().dnc) { const v = D().dnc[k]; if (v && typeof v === 'object' && v.room) room++; else if (v && typeof v === 'object' && (v.s || v.a)) imp++; else visit++; }
    return { visit, imp, room, all: visit + imp + room };
  }
  const itemPlace = it => `${it.a || it.src || '（名前なし）'}${it.room ? '　' + (/\d$/.test(it.room) ? it.room + '号室' : it.room) : ''}`;
  function itemRow(it) {
    const k = it.use ? it.kind : 'skip';
    const icon = k === 'dnc' ? '<i class="pin st-dnc">拒</i>' : k === 'warn' ? '<i class="pin st-cau">！</i>' : '<i class="pin st-new">－</i>';
    return `<div class="kk-it${k === 'skip' ? ' off' : ''}" data-it="${it.i}">
      <button type="button" class="kk-kind" data-cyc="${it.i}" aria-label="種類を切りかえる（拒否→注意→入れない）">${icon}<small>${k === 'dnc' ? '拒否' : k === 'warn' ? '注意' : '入れない'}</small></button>
      <div class="tx"><b data-notr>${esc(itemPlace(it))}</b>
        ${k === 'warn' ? `<input type="text" class="kk-note" data-note="${it.i}" maxlength="80" value="${esc(it.note || '')}" placeholder="注意の内容（例：犬がいます）">` : ''}
        ${it.sens && k === 'warn' ? '<small class="kk-sens">病気・家庭の事情など、個人のことが書かれていないか確かめてください</small>' : ''}
        <small>ピン：<span data-notr>${esc(String(it.src || '').slice(0, 60))}</span>${it.black ? '（黒いピン）' : ''}</small></div></div>`;
  }
  function preview(st) {
    const { tp, items, fit } = st;
    const oi = oldInfo(tp.specs), dc = dncCounts();
    const nKid = tp.specs.filter(s => s.pno).length, nPar = new Set(tp.specs.filter(s => s.pno).map(s => s.pno)).size, nSingle = tp.specs.filter(s => !s.pno).length;
    const nD = items.filter(i => i.use && i.kind === 'dnc').length, nW = items.filter(i => i.use && i.kind === 'warn').length;
    const gapList = [...fit.gaps.entries()].sort((a, b) => cmpNo(a[0], b[0]));
    const byT = new Map();
    items.forEach(it => { const key = it.tno || '？'; (byT.get(key) || byT.set(key, []).get(key)).push(it); });
    const tGroups = [...byT.entries()].sort((a, b) => (a[0] === '？') - (b[0] === '？') || cmpNo(a[0], b[0]));
    const nKmlCau = Object.values(C()).filter(v => v && v.s === 'kml').length;
    setSheet(headHtml(null, 'マイマップで区域と拒否を新しくする', `ファイル ${st.files}件`) + `
      <div class="tiles">
        <div class="tile"><b>${nPar + nSingle}</b><span>区域（親）</span></div>
        <div class="tile"><b>${nKid}</b><span>枝番の区域</span></div>
        <div class="tile"><b>${nD}</b><span>拒否</span></div>
        <div class="tile"><b>${nW}</b><span>注意（！）</span></div>
      </div>
      ${st.bad.length ? `<div class="notice warn">読めなかったファイル：${st.bad.map(esc).join('、')}</div>` : ''}
      <div class="seg kk-tabs" role="group">
        <button type="button" data-kktab="terr" aria-pressed="${ui.tab === 'terr'}">区域の線</button>
        <button type="button" data-kktab="pin" aria-pressed="${ui.tab === 'pin'}">拒否・注意（${nD + nW}）</button>
      </div>
      <div id="kkBody">${ui.tab === 'terr' ? `
        <h3 class="sub">区域の線</h3>
        <ul class="kk-ul">
          <li>枝番のある区域 ${nPar}（枝番 ${nKid}）・枝番のない区域 ${nSingle}</li>
          ${tp.made.length ? `<li><b>抜けていた枝番を自動で作ります：</b>${tp.made.map(esc).join('、')}（ほかの枝番に囲まれた部分）</li>` : ''}
          <li>番号が同じ今の区域 ${oi.keep.length}：線と名前を新しくします（貸し出し・S-13の記録は引き継ぎます${oi.lentKeep.length ? `。貸し出し中 ${oi.lentKeep.length}` : ''}）</li>
          <li>なくなる今の区域 ${oi.gone.length}：消します（家は残り、新しい線で区域を決め直します）</li>
          ${m0(st)}
        </ul>
        ${oi.lentGone.length ? `<div class="notice warn"><b>貸し出し中の区域で、番号がなくなるものがあります：</b>${oi.lentGone.map(t => `区域${esc(t.no)}（${esc(uname(t.holder))}さん）`).join('、')}<br>この区域の貸し出しは終わります。</div>` : ''}
        ${gapList.length ? `<div class="notice warn"><b>枝番の線の外に残る家があります（どの区域にも入りません）：</b><br>${gapList.map(([p, n]) => `区域${esc(p)}：${n}軒`).join('、')}<br>新しくしたあと、区域の一覧の「線を直す」で、枝番の線を引き直してください。</div>` : ''}
        ${fit.outside ? `<p class="hint">どの区域の線にも入らない家：${fit.outside}軒（区域の外の家として残ります）</p>` : ''}
        ${tp.notes.length ? `<details class="dncfold"><summary>気づいたこと ${tp.notes.length}件</summary><ul>${tp.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}`
      : `
        <h3 class="sub">拒否・注意</h3>
        <p class="hint">左の印を押すと「拒否 → 注意 → 入れない」の順に切りかわります。黒いピンと、部屋番号のあとのカッコ書き（例：1002（夜勤））は「注意」にしています。<br>
          注意の内容は、その家を訪ねる人みんなが見ます。<b>名前・病気・家庭の事情など、個人のことは書かない</b>でください。</p>
        ${items.some(i => i.sens) ? `<div class="notice warn">個人の事情が書かれているかもしれない注意が ${items.filter(i => i.sens).length}件あります（<span class="kk-sens">目印</span>のもの）。内容を確かめてください。</div>` : ''}
        ${tGroups.map(([no, its]) => `<details class="dncg kk-g" data-kg="${esc(no)}"${ui.open.has(no) ? ' open' : ''}><summary><span class="stamp sm${noCls(no)}">${esc(no)}</span><span class="nm">${no === '？' ? '新しい区域の線の外' : '区域' + esc(no)}</span>
          <span class="cnt">拒 ${its.filter(i => i.use && i.kind === 'dnc').length}・！ ${its.filter(i => i.use && i.kind === 'warn').length}</span></summary>
          ${ui.open.has(no) ? its.map(itemRow).join('') : ''}</details>`).join('')}
        ${st.m.marks ? `<p class="hint">枝番の目印のピン（「ポイント ①」など）${st.m.marks}本は入れません。</p>` : ''}`}
      </div>
      <div class="dx-foot">
        <label class="check"><input type="checkbox" id="kkRep"${st.replaceDnc ? ' checked' : ''}>今ある拒否 ${dc.all}件をすべて消して入れなおす<small>（訪問で記録 ${dc.visit}・取り込み ${dc.imp}・アパートの部屋 ${dc.room}）</small></label>
        ${nKmlCau ? `<p class="hint">以前にマイマップから入れた注意 ${nKmlCau}件は入れなおします（奉仕者・係が書いた注意は残します）。</p>` : ''}
        <button type="button" class="btn primary block" id="kkGo">この内容で新しくする</button>
        <button type="button" class="btn block" data-close>やめる</button>
      </div>`);
    const S = $('#sheet');
    $$('[data-kktab]', S).forEach(b => b.onclick = () => { ui.tab = b.dataset.kktab; sheetKeep = true; preview(st); });
    $('#kkRep').onchange = e => { st.replaceDnc = e.target.checked; };
    $$('.kk-g', S).forEach(d => d.addEventListener('toggle', () => {
      const no = d.dataset.kg;
      if (d.open) { ui.open.add(no); if (!d.querySelector('.kk-it')) { d.insertAdjacentHTML('beforeend', items.filter(i => (i.tno || '？') === no).map(itemRow).join('')); } }
      else ui.open.delete(no);
    }));
    const body = $('#kkBody'); // 描き直すたびに作り直される入れ物に付ける（同じ処理が2回動かないように）
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-cyc]'); if (!b) return;
      const it = items[Number(b.dataset.cyc)];
      if (!it.use) { it.use = true; it.kind = 'dnc'; } else if (it.kind === 'dnc') it.kind = 'warn'; else it.use = false;
      const row = b.closest('.kk-it'); row.outerHTML = itemRow(it);
    });
    body.addEventListener('input', e => { const x = e.target; if (x.dataset && x.dataset.note != null) items[Number(x.dataset.note)].note = x.value.slice(0, 80); });
    $('#kkGo').onclick = () => confirmGo(st);
  }
  const m0 = st => (st.m.dup.length ? `<li>同じ枝番が2つあったもの：${st.m.dup.map(esc).join('、')}</li>` : '');

  async function confirmGo(st) {
    const oi = oldInfo(st.tp.specs);
    const ok = await ask('区域と拒否を新しくしますか？', {
      title: '区域と拒否を新しくしますか？',
      body: `区域の線をすべて新しくします（なくなる区域 ${oi.gone.length}）。${st.replaceDnc ? '今の拒否はすべて消して、' : ''}マイマップの拒否・注意を入れます。\n始める前に、今の区域・拒否・注意を、この端末にファイルで控えます。すぐあとなら、お知らせの「取り消す」でもどせます。`,
      ok: '新しくする'
    });
    if (!ok) return;
    downloadBackup();
    apply(st);
  }
  function downloadBackup() {
    try {
      const d = D(), t = new Date(), p = n => String(n).padStart(2, '0');
      const o = { app: 'kuiki-map', kind: 'before-kml-koushin', at: t.toISOString(), territories: d.territories, dnc: d.dnc, caution: d.caution || {} };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' }));
      a.download = `区域マップ_区域を新しくする前の控え_${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}_${p(t.getHours())}${p(t.getMinutes())}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { /* 控えが作れなくても続ける（取り消すでもどせる） */ }
  }

  /* ---------- 置きかえる ---------- */
  function apply(st) {
    const { specs } = st.tp, at = now();
    const res = { nNew: 0, nKeep: 0, nGone: 0, dnc: 0, cau: 0, pinOnly: 0 };
    closeSheet();
    const before = new Map(D().houses.map(h => [h.id, h.terrId || null]));
    commit('区域と拒否・注意を新しくしました', () => {
      // 1) 区域
      const byNo = new Map();
      D().territories.forEach(t => { if (!t.dummy && !isSpecial(t)) byNo.set(normNo(t.no), t); });
      const used = new Set();
      const ppDone = new Set(); // 親の線は、親ごとに1つの枝番にだけ持たせる（送る大きさを小さくする）
      specs.forEach(s => {
        const old = byNo.get(s.no);
        const set = t => {
          t.polygon = s.poly; t.name = `区域${s.no}`;
          if (s.pno) { t.pno = s.pno; if (s.pp && !ppDone.has(s.pno)) { t.pp = s.pp; ppDone.add(s.pno); } else delete t.pp; } else { delete t.pno; delete t.pp; }
          if (s.pnm) t.pnm = s.pnm; else delete t.pnm;
          delete t.rest;
        };
        if (old) { set(old); used.add(old.id); res.nKeep++; }
        else { const t = { id: 't' + uid(), no: s.no, holder: null, lentAt: null }; set(t); D().territories.push(t); used.add(t.id); res.nNew++; }
      });
      D().territories.filter(t => !t.dummy && !isSpecial(t) && !used.has(t.id)).map(t => t.id).forEach(id => { deleteTerrData(id, false); res.nGone++; });
      reassign();
      // 家の区域は、画面からは送らない（3万件になることがあるので）。サーバーが同じ決め方で決め直す（下の kmlAfterFlush）
      if (LIVE && Store.fp && Store.fp.houses) D().houses.forEach(h => { if ((h.terrId || null) !== before.get(h.id)) Store.fp.houses.set(h.id, JSON.stringify(h)); });
      // 2) 拒否・注意（今あるものを消す）
      if (st.replaceDnc) { D().dnc = {}; }
      const cm = C();
      Object.keys(cm).forEach(k => { if (cm[k] && cm[k].s === 'kml') delete cm[k]; });
      // 3) 入れる
      const api = window.kyohiApi, near = api.houseGrid();
      st.items.forEach(it => {
        if (!it.use) return;
        const base = { s: 'kml', at };
        if (it.a) base.a = it.a;
        const pos = { lat: it.lat, lng: it.lng, good: true };
        if (it.room) { // アパートの部屋：建物のそばの、場所だけの印に部屋番号を付ける
          const apt = near(it.lat, it.lng, 30).find(([h]) => h.type === 'apt');
          const o = Object.assign(base, { p: 1, room: it.room, lat: r6(apt ? apt[0].lat : it.lat), lng: r6(apt ? apt[0].lng : it.lng) });
          if (apt) o.h = apt[0].id;
          const tid = apt ? apt[0].terrId : terrOf(it.lat, it.lng); if (tid) o.t = tid;
          if (it.kind === 'warn') { if (it.note) o.n = it.note; delete o.a; cm['pin:' + uid()] = o; res.cau++; }
          else { D().dnc['pin:' + uid()] = o; res.dnc++; }
          return;
        }
        const pl = api.placeOne(near, pos, '', true);
        if (pl.kind === 'house') {
          const h = pl.h, k = K(h.id, '');
          if (it.kind === 'warn') { cm[k] = { s: 'kml', at }; if (it.note) cm[k].n = it.note; res.cau++; }
          else { D().dnc[k] = Object.assign(base, { lat: r6(h.lat), lng: r6(h.lng), auto: 1 }); delete D().follows[k]; delete D().released[k]; delete cm[k]; res.dnc++; }
          return;
        }
        if (it.kind === 'warn') { // 近くにアパートがあれば、建物ぜんたいの注意にする
          const apt = near(it.lat, it.lng, 15).find(([h]) => h.type === 'apt');
          if (apt) { const k = K(apt[0].id, ''); cm[k] = { s: 'kml', at }; if (it.note) cm[k].n = it.note; res.cau++; return; }
        }
        const o = Object.assign(base, { p: 1, lat: r6(it.lat), lng: r6(it.lng) });
        const tid = terrOf(it.lat, it.lng); if (tid) o.t = tid;
        res.pinOnly++;
        if (it.kind === 'warn') { if (it.note) o.n = it.note; delete o.a; cm['pin:' + uid()] = o; res.cau++; }
        else { D().dnc['pin:' + uid()] = o; res.dnc++; }
      });
    });
    toast('区域と拒否・注意を新しくしました（取り消すときは、控えのファイルから係に相談してください）'); // 3万件の家をもどす「取り消す」は出さない
    if (LIVE) { lsSet(NEED_KEY, '1'); flush(true); }
    // 4) 終わりの画面
    const gaps = [...st.fit.gaps.entries()].sort((a, b) => cmpNo(a[0], b[0]));
    infoSheet('区域と拒否・注意を新しくしました', `
      <ul class="kk-ul"><li>区域：新しく ${res.nNew}・線を新しくした ${res.nKeep}・消した ${res.nGone}${st.tp.made.length ? `（自動で作った枝番：${st.tp.made.map(esc).join('、')}）` : ''}</li>
      <li>拒否 ${res.dnc}件・注意（！）${res.cau}件${res.pinOnly ? `（うち家の印とつながっていないもの ${res.pinOnly}件は「拒否・！」の一覧の「要確認」から地図で家とつなげます）` : ''}</li></ul>
      ${gaps.length ? `<div class="notice warn"><b>枝番の線の外に残った家：</b>${gaps.map(([p, n]) => `区域${esc(p)} ${n}軒`).join('、')}<br>区域の一覧の「線を直す」で、枝番の線を引き直してください。</div>` : ''}
      <p class="hint">控えのファイル（区域を新しくする前の控え）が、この端末に保存されています。</p>`);
    firstMapShow = false;
  }

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .kk-ul{margin:4px 0 8px;padding-left:20px;line-height:1.6}
  .kk-tabs{margin:10px 0}
  .kk-it{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-bottom:1px solid #E6ECE9;background:#fff}
  .kk-it.off{opacity:.55}
  .kk-it .tx{flex:1;min-width:0;line-height:1.35}
  .kk-it .tx b{display:block;font-size:15px;word-break:break-all}
  .kk-it .tx small{display:block;color:var(--ink2);font-size:13px;word-break:break-all}
  .kk-kind{flex:none;width:64px;min-height:56px;border-radius:10px;border:2px solid var(--line);background:#fff;font:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
  .kk-kind .pin{width:26px;height:26px;font-size:13px;border-width:2px}
  .kk-kind small{font-size:12px;font-weight:700}
  .kk-note{width:100%;min-height:44px;font-size:16px;border:2px solid #CA8A04;border-radius:10px;padding:0 8px;margin:4px 0;background:#FEF9C3}
  .kk-sens{display:inline-block;background:#FDECEC;color:#8B1A1A;border-radius:6px;padding:0 6px;font-weight:700}
  `;
  document.head.appendChild(css);

  /* 区域を送り終えたら、サーバーに家の区域を決め直してもらう（送れないまま閉じても、次に送り終えたときに行う） */
  const NEED_KEY = 'kuiki_kml_reassign';
  let reassigning = false;
  window.kmlAfterFlush = async () => {
    if (reassigning || !LIVE || lsGet(NEED_KEY) !== '1' || !isAdmin() || Store.queue.length) return;
    reassigning = true;
    try {
      const r = await api('reassign', {}, { timeout: 300000 });
      lsDel(NEED_KEY);
      toast(`家 ${r.changed || 0}件の区域を、サーバーで新しい線に合わせました`);
      Store.needFull = true; reloadAll(true).catch(() => {});
    } catch (e) { /* 次に送り終えたときに、もう一度ためす */ } finally { reassigning = false; }
  };
  window.kmlKoushinStart = start;
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'adKmlAll') { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) start(fs); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
