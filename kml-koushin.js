/* =========================================================
   kml-koushin.js  マイマップ（KML）で、区域と拒否・注意を新しくする（2026-10-18）

   ・入口：係の画面 ＞ 区域 ＞「区域の取り込み…」＞［マイマップで区域と拒否を新しくする（全部置きかえ）］
   ・読めるもの：KML・KMZ・ZIP（Googleドライブのフォルダをまとめてダウンロードしたもの）。いくつでもまとめて選べる
   ・マイマップの作り（豊見城会衆区域 2026-10）
       親の区域  … 線の名前が「A05」「B18」「G62」（英字＝ブロック、数字＝区域番号）
       枝番の区域 … 線の名前が「5-①」「5-③」（丸数字か数字）→ 区域番号「5-1」「5-3」
                   枝番の線がない親（例：18）は、親の線をそのまま区域「18」にする
       枝番の目印 … 「ポイント ①」などのピン → 拒否・注意としては取り込まない。線のない枝番を作る手がかりに使う（下の「枝番の整理」）
       拒否のピン … 赤紫など。説明欄に「18-① 1-905、1-1001」のように部屋番号（「18-①」は枝番の参照なので読まない）
       注意のピン … 黒いピン（例：「5-③ 夜勤」）。部屋番号のあとのカッコ書き「1002（夜勤）」も注意
   ・枝番の整理（2026-10-21）：親の線の中で、枝番が重なり・すき間なく、親とぴったり同じ形になるようにする（親ごと。planTerrs ＞ planKids）
        ① 線を単純化して、となりの区域の角にそろえる（このあとは単純化しない）
        ② 枝番の線を親の線で切る（はみ出した広さが OVER_NOTE_M2 以上なら、確認画面にお知らせ）
        ③ 枝番どうしの重なりは、広さの小さいほうの枝番に入れる（大きいほうに穴ができたら、幅0の切れ込みで1本の輪にする）
        ④ 親から枝番を引いた残りの塊に番号を付ける
             1) 目印が中にある塊 → その番号の枝番（2) 目印が塊の外なら、MARK_NEAR_M 以内でいちばん近い塊）
             3) 目印が1つもなく、枝番が1つだけ抜けているとき → 今までどおり、いちばん大きい塊（MIN_GEN_M2 以上）をその番号に
             4) 小さい（SLIVER_M2 未満）・細長い（SLIVER_THIN 未満）塊 → 境界を接する長さがいちばん長い枝番に入れる
             5) どれにも当たらない塊は、番号を付けない（そこの家は「枝番の線の外に残った家」。係が線を引き直す）
        ⑤ 面積の合計が親の 99.5〜100.5% の外、または重なりが 1㎡ 以上残るときは、確認画面で知らせる（取り込みは止めない）
        polygon-clipping が読めない・計算できないときは、直さずにそのまま入れる（お知らせを出す）
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

  /* 枝番の整理（親の線で切る・重なりを直す・残りに番号を付ける）で使う数値 */
  const MIN_GEN_M2 = 150;      // 抜けた枝番として作る部分の、いちばん小さい広さ（目印がないとき。これより小さいすき間は、線のずれとみなす）
  const OVER_NOTE_M2 = 50;     // はみ出し・重なりをお知らせに出す広さ
  const SLIVER_M2 = 300;       // これより小さい残りは、となりの枝番に入れる
  const SLIVER_THIN = 0.1;     // 4πA/L² がこれより小さい（細長い）残りも、となりの枝番に入れる
  const MARK_NEAR_M = 30;      // 目印が塊の外にあっても、この距離までは使う
  const EDGE_NEAR_M = 2;       // 「接している」とみなす距離
  const GAP_NOTE_M2 = 1;       // 確認画面の「すき間を入れます」に数えるすき間の、いちばん小さい広さ（これより小さいのは計算のずれ。入れるだけで数えない）

  /* =========================================================
     読みとり（画面がなくても動く部分。ためしに動かすときは root.KmlKoushin を使う）
     ========================================================= */
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const DASH = '[-－ー―‐−–—]';
  const RE_PARENT = /^\s*([A-Za-zＡ-Ｚａ-ｚ])\s*0*(\d{1,3})\s*$/;
  const RE_KID = new RegExp('^\\s*0*(\\d{1,3})\\s*' + DASH + '\\s*([' + CIRC + ']|\\d{1,2})\\s*$');
  /* 枝番の目印のピン：名前が「ポイント ①」「ポイント 1」「ポイント11」「①」だけのもの（説明なし）。
     番地だけの名前（例：305-2）は目印にしない（拒否として入れ、要確認にする） */
  const isMark = (name, desc) => {
    if (String(desc || '').trim()) return false;
    const raw = String(name || '').trim();
    if (new RegExp('^[' + CIRC + ']$').test(raw)) return true;
    return /^(ポイント|ﾎﾟｲﾝﾄ|point|スタート|start)\s*\d{1,3}$/i.test(raw.normalize('NFKC'));
  };
  const REF_W = /拒|断わ|断り|断る|お断|NG|ＮＧ|来ないで|訪問(しない|不可|禁止|お断)|もう来/;
  const WARN_W = /犬|猫|控え|注意|午前|午後|夕|夜勤|夜|朝|昼|時|曜|ノック|インターホン|チャイム|ベル|鳴らさ|留守|吠|危|工事|休み|寝|赤ちゃん|乳児|裏|玄関|門/;
  /* 時間・曜日の条件つきの「訪問しない」（例：夕方は訪問しない・午前中は来ないで・日曜は控える）は拒否ではなく注意（2026.13.26）。
     「一切」「二度と」などがあれば、時間の言葉があっても拒否のまま */
  const COND_W = /夕|午前|午後|夜|朝|昼|日中|平日|休日|週末|土日|[月火水木金土日]曜|祝|\d+\s*時|時間帯|食事/;
  const ABS_W = /一切|二度と|絶対|すべて|全て|いつも|完全|永久/;
  /* 文から種類を決める：'dnc'（拒否）・'warn'（注意）・''（決め手なし） */
  const kindOf = t => {
    t = String(t || '');
    if (REF_W.test(t)) return COND_W.test(t) && !ABS_W.test(t) ? 'warn' : 'dnc';
    return WARN_W.test(t) ? 'warn' : '';
  };
  const SENS_W = /病|認知|障害|障がい|亡|死|入院|宗教|学会|離婚|生活保護|借金|暴力|警察|ＤＶ|DV|妊|手術|薬|精神|うつ|介護|施設に入/;
  const BLD = /[ァ-ヶー]{2,}|荘|ハイツ|団地|棟|マンション|アパート|コーポ|レジデンス|ハウス|ビル/;
  const looksAddr = c => !!c && /\d/.test(c) && /[一-鿿]/.test(c) && c.length <= 120;
  /* 名前を区域番号の形にそろえる（「01-①」→「1-1」・「１２」→「12」）。区域番号の形でなければ '' */
  const noKey = name => {
    const t = String(name || '').trim().replace(/^(区域|No\.?|№|#)\s*/i, '').normalize('NFKC').replace(/\s+/g, '').replace(/[-－ー―‐−–—]/g, '-');
    return /^\d{1,3}(-\d{1,2})?$/.test(t) ? t.split('-').map(x => String(Number(x))).join('-') : '';
  };
  const circN = c => (CIRC.indexOf(c) >= 0 ? CIRC.indexOf(c) + 1 : Number(c));
  /* 目印のピンの番号：「ポイント 5」「ポイント ⑤」「⑤」→ 5（NFKC で丸数字も数字になる） */
  const markNo = name => { const m = String(name || '').trim().normalize('NFKC').match(/(\d{1,3})\s*$/); return m ? Number(m[1]) : 0; };

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
    const out = { file: fileName || '', parents: [], kids: [], others: [], pins: [], marks: [] };
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
      if (isMark(name, desc)) { out.marks.push({ n: markNo(name), lat: c[0], lng: c[1], file: fileName || '' }); continue; } // 「ポイント ①」「ポイント 1」など、枝番の目印（拒否・注意には入れない。枝番の区域づくりに使う）
      let fo = pm.parentElement, folder = '';
      while (fo && !folder) { if (fo.localName === 'Folder') folder = textOf(fo, 'name'); fo = fo.parentElement; }
      out.pins.push({ name, desc, style, lat: c[0], lng: c[1], file: fileName || '', folder });
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
    d = d.replace(/(?<![\d.．/])(\d{1,2}\s*-\s*\d{3,4}|\d{3,4})(?![\d年月日時:/.．])(?:号室?)?\s*(?:\(([^)]*)\))?/g, (m0, r, n) => { rooms.push({ room: r.replace(/\s/g, ''), note: (n || '').trim() }); return ' '; });
    const left = d.replace(/[、,，。・/／\s]+/g, ' ').trim();
    let nm = String(p.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!rooms.length && BLD.test(nm)) { // 名前の終わりの部屋番号（例：コーポ白菊302・メゾンオオタ 302）
      const m = nm.match(/[\s゠-ヿ一-鿿]\s*(\d{3,4})(?:号室?)?$/);
      if (m) { rooms.push({ room: m[1], note: '' }); nm = nm.slice(0, m.index + 1).trim(); }
    }
    // 番地だけの名前（例：305-2）も、場所の手がかりとして残す（人の名前には数字が入らないので、数字のある名前だけ）
    const part = !looksAddr(nm) && /\d/.test(nm) && nm.length <= 40;
    const a = looksAddr(nm) || part ? nm.slice(0, 120) : '';
    // ピンの元の文（名前／説明）をそのまま残す。部屋番号などを、あとで区域係が確かめられるように
    const orig = [String(p.name || '').trim(), String(p.desc || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' ／ ').slice(0, 300);
    const base = { lat: p.lat, lng: p.lng, a, src: p.name, file: p.file, folder: p.folder || '', black, part, o: orig };
    const items = [];
    if (rooms.length) {
      rooms.forEach(r => {
        let kind, note;
        if (r.note) { kind = kindOf(r.note) === 'dnc' ? 'dnc' : 'warn'; note = r.note; }
        else if (black) { kind = 'warn'; note = left; }
        else if (left && kindOf(left) === 'warn') { kind = 'warn'; note = left; }
        else { kind = 'dnc'; note = left; }
        items.push(Object.assign({}, base, { room: r.room, kind, note: kind === 'warn' ? note.slice(0, 80) : '', m: kind === 'dnc' ? note.slice(0, 200) : '' }));
      });
    } else {
      let kind = 'dnc', note = '';
      if (black) { kind = 'warn'; note = left || (!looksAddr(nm) ? nm : ''); }
      else if (left && kindOf(left) === 'warn') { kind = 'warn'; note = left; }
      else if (!left && !a && kindOf(nm) === 'warn') { kind = 'warn'; note = nm; }
      // 拒否のときも、ピンのメモ（説明欄）は区域係が見られるように残す（m）。注意に切りかえたら、注意の文の下書きにする
      const m = kind === 'dnc' ? (left || (!a && !looksAddr(nm) && REF_W.test(nm) ? nm : '')) : '';
      items.push(Object.assign({}, base, { room: '', kind, note: note.slice(0, 80), m: m.slice(0, 200) }));
    }
    items.forEach(it => { it.sens = SENS_W.test((it.note || '') + ' ' + (it.m || '')); });
    return items;
  }
  /* 区域の線をまとめる（同じ親・同じ枝番が2つのファイルにあれば、あとのものは使わない） */
  function mergeParsed(list) {
    const parents = new Map(), kidm = new Map(), others = [], pins = [], dup = [], marks = [];
    list.forEach(x => {
      x.parents.forEach(p => { if (!parents.has(p.pno)) parents.set(p.pno, p); });
      x.kids.forEach(k => { const no = k.pno + '-' + k.b; if (kidm.has(no)) dup.push(no); else kidm.set(no, Object.assign({ no }, k)); });
      x.others.forEach(o => others.push(o));
      pins.push(...x.pins);
      marks.push(...x.marks);
    });
    return { parents, kids: kidm, others, pins, marks, dup };
  }

  /* 外へ */
  root.KmlKoushin = { parseKmlText, splitPin, mergeParsed, noKey, kindOf, RE_PARENT, RE_KID };
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof document === 'undefined') return;
  Object.assign(root.KmlKoushin, { planTerrs, houseFit, terrOfSpecs, gapHouses }); // ためしに動かすとき用（index.html の関数が使える環境で）

  /* =========================================================
     ここから画面
     ========================================================= */
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.19' && c.items.some(i => /枝番/.test(i[1])))) {
    const cl = CHANGELOG.find(c => c.v === '2026.13.19');
    const it = [['区', '区域の線と番号が新しくなりました。枝番の区域（例：5-1）は、地図で親の区域（5）の太い線の中に出ます'],
      ['区', '区域係の画面から、マイマップ（KML）で区域と拒否・注意をまとめて新しくできるようになりました']];
    if (cl) cl.items.push(...it); else CHANGELOG.unshift({ v: '2026.13.19', items: it });
  }
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.26')) {
    CHANGELOG.unshift({ v: '2026.13.26', items: [
      ['！', 'マイマップの取り込みで、「夕方は訪問しない」のような時間・曜日つきのピンは、拒否ではなく注意（！）になるようにしました'],
      ['拒', '区域係の画面の拒否の家に、マイマップのメモが出るようになり、「注意（！）に変える」ボタンを付けました']] });
  }
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.29')) {
    CHANGELOG.unshift({ v: '2026.13.29', items: [
      ['拒', '地図を遠くから見ているときは、拒否の印を出さないようにしました。1つの区域が画面に入るくらいまで近づくと出ます']] });
  }
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.28')) {
    CHANGELOG.unshift({ v: '2026.13.28', items: [
      ['！', '注意（！）の印を、見やすい朱色にしました。集合住宅では、部屋の数と重ならないよう建物の左に出します']] });
  }
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.27')) {
    CHANGELOG.unshift({ v: '2026.13.27', items: [
      ['拒', '地図の拒否は、遠くから見ると小さな赤い点、区域が画面に入るくらい近づくと小さめの「拒」になりました'],
      ['拒', '拒否の家に部屋番号が出るようになりました。区域係の画面では、マイマップのピンの元の文も確かめられます']] });
  }
  LIB.pclip = 'vendor/polygon-clipping-0.15.7/polygon-clipping.umd.min.js';
  const r6 = x => Math.round(Number(x) * 1e6) / 1e6;
  const now = () => new Date().toISOString();
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

  /* ---------- 枝番の整理に使う、形の小道具（polygon-clipping の形：多角形＝輪の並び［外周, 穴…］、多角形の集まり＝多角形の並び） ---------- */
  const fmtM2 = x => Math.round(x).toLocaleString('ja-JP');
  const llOf = r => r.map(p => [p[1], p[0]]); // polygon-clipping の輪 → [緯度, 経度]
  const polyArea = poly => ringAreaM2(llOf(poly[0])) - poly.slice(1).reduce((a, h) => a + ringAreaM2(llOf(h)), 0);
  const mpArea = mp => (mp || []).reduce((a, poly) => a + polyArea(poly), 0);
  const polyLen = poly => poly.reduce((a, r) => { for (let i = 1; i < r.length; i++) a += distM([r[i - 1][1], r[i - 1][0]], [r[i][1], r[i][0]]); return a; }, 0);
  const largest = mp => (mp || []).map(poly => ({ poly, a: polyArea(poly) })).sort((x, y) => y.a - x.a)[0];
  const bbPoly = poly => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; poly[0].forEach(p => { if (p[1] < a) a = p[1]; if (p[1] > b) b = p[1]; if (p[0] < c) c = p[0]; if (p[0] > d) d = p[0]; }); return [a, b, c, d]; }; // [緯度の小, 大, 経度の小, 大]
  const bbMP = mp => mp.map(bbPoly).reduce((q, x) => [Math.min(q[0], x[0]), Math.max(q[1], x[1]), Math.min(q[2], x[2]), Math.max(q[3], x[3])], [Infinity, -Infinity, Infinity, -Infinity]);
  const bbHit = (a, b) => !(a[1] < b[0] || b[1] < a[0] || a[3] < b[2] || b[3] < a[2]);
  const pcDo = (op, ...args) => { try { return window.polygonClipping[op](...args); } catch (e) { return null; } };
  const inPC = (lat, lng, poly) => { let c = false; for (const r of poly) if (inPoly(lat, lng, llOf(r))) c = !c; return c; };
  /* 点から、多角形の線までの距離（m） */
  function distToPolys(lat, lng, polys) {
    const cos = Math.cos(lat * Math.PI / 180), p = mXY([lat, lng], cos);
    let best = Infinity;
    for (const poly of polys) for (const r of poly) for (let i = 1; i < r.length; i++) {
      const d = segDist(p, mXY([r[i - 1][1], r[i - 1][0]], cos), mXY([r[i][1], r[i][0]], cos));
      if (d < best) best = d;
    }
    return best;
  }
  /* 残りの塊 poly が、枝番 mp と接している長さ（m）：塊の辺のうち、真ん中の点が枝番の線から EDGE_NEAR_M 以内にある辺の長さの合計。
     親の外周線の上にある辺（親 P の線から ON_EDGE_M 以内）は、外側との境目で、枝番とは接していないので数えない
     （親で切った枝番の線は外周線に重なるため、細いすき間では、外周側の辺まで接していると数えてしまうので） */
  const ON_EDGE_M = 0.05;
  function sharedLen(poly, mp, P) {
    let sum = 0;
    for (const r of poly) for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i], la = (a[1] + b[1]) / 2, ln = (a[0] + b[0]) / 2;
      if (P && distToPolys(la, ln, P) <= ON_EDGE_M) continue;
      if (distToPolys(la, ln, mp) <= EDGE_NEAR_M) sum += distM([a[1], a[0]], [b[1], b[0]]);
    }
    return sum;
  }
  /* 穴のある形を1本の輪にする：外周と穴を、いちばん近い2点で結ぶ「切れ込み」（幅0）でつなぐ。偶奇判定（inPoly）なので、穴の中は区域の外になる */
  function bridgePoly(poly) {
    let ring = fromPC(poly[0]);
    for (const h of poly.slice(1)) {
      const hole = fromPC(h);
      if (hole.length < 3 || ring.length < 3) continue;
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < ring.length; i++) for (let j = 0; j < hole.length; j++) { const d = distM(ring[i], hole[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
      const hs = hole.slice(bj).concat(hole.slice(0, bj)); // 穴の輪を、つなぐ点から始める
      ring = ring.slice(0, bi + 1).concat(hs, [hs[0]], ring.slice(bi)); // 外周の点 → 穴を1周 → 外周の同じ点（幅0の切れ込み）
    }
    return ring;
  }

  /* 親1つぶんの枝番を整える。
     3-2 親の線で切る → 3-3 重なりを小さいほうの枝番に入れる → 3-4 親から枝番を引いた残りに番号を付ける（目印・今のルール・細いすき間は近くの枝番へ）
     → 3-5 面積の確かめ。polygon-clipping が失敗したら例外を投げる（呼んだ側が「直さずに入れる」にもどす） */
  function planKids(pno, v, ctx) {
    const { marks, claimed, usedNos, anyParent } = ctx;
    const { pp, ks } = v;
    const out = { specs: [], madeMark: [], madeOld: [], absorbed: [], fixNotes: [], notes: [], checks: [], claimed: [] };
    const P = [toPC(pp)];
    const need = r => { if (!r) throw new Error('pc'); return r; };
    // 3-2 親の線で切る
    let kidsG = [];
    const outsiders = [];
    ks.forEach(k => {
      const kp = [toPC(k.ring)];
      const inter = need(pcDo('intersection', kp, P));
      if (!inter.length || mpArea(inter) < 0.5) { outsiders.push(k); out.notes.push(`区域${k.no}の線が、親の線（区域${pno}）の外にあります（そのまま入れます）`); return; }
      const over = mpArea(need(pcDo('difference', kp, P)));
      if (over >= OVER_NOTE_M2) out.fixNotes.push(`区域${k.no}の線が親の外に約${fmtM2(over)}㎡出ていたので切りました`);
      kidsG.push({ no: k.no, b: k.b, raw: k.raw, gen: false, g: inter });
    });
    // 3-3 重なりは、広さの小さいほうの枝番に入れる（大きいほうから、それより小さい枝番を引く）
    kidsG.forEach(k => { k.a = mpArea(k.g); k.bb = bbMP(k.g); });
    const asc = [...kidsG].sort((x, y) => x.a - y.a || Number(x.b) - Number(y.b));
    const orig = new Map(asc.map(k => [k, k.g]));
    asc.forEach((big, i) => {
      const subs = [];
      for (let j = 0; j < i; j++) {
        const sm = asc[j];
        if (!bbHit(big.bb, sm.bb)) continue;
        const a = mpArea(need(pcDo('intersection', orig.get(big), orig.get(sm))));
        if (a < 0.01) continue;
        subs.push(orig.get(sm));
        if (a >= OVER_NOTE_M2) out.fixNotes.push(`区域${big.no}と${sm.no}が約${fmtM2(a)}㎡重なっていたので、${sm.no}（小さいほう）に入れました`);
      }
      if (subs.length) big.g = need(pcDo('difference', orig.get(big), ...subs));
    });
    // 2つ以上に分かれたら、いちばん大きい部分をその枝番にする（ほかは、残りとして次に回る）
    kidsG = kidsG.filter(k => {
      const L = largest(k.g);
      if (!L) { out.notes.push(`区域${k.no}の線は、ほかの枝番にすべて重なっていたので入れません`); return false; }
      k.g = [L.poly];
      return true;
    });
    // 3-4 親から枝番を引いた残りに番号を付ける
    const rest = need(pcDo('difference', P, ...kidsG.map(k => k.g)));
    const blobs = rest.map(poly => { const a = polyArea(poly), L = polyLen(poly); return { poly, a, thin: L > 0 ? 4 * Math.PI * a / (L * L) : 0, taken: false, hold: false }; }).filter(b => b.a > 0.01);
    const have = n => usedNos.has(pno + '-' + n) || kidsG.some(k => Number(k.b) === n);
    const mine = marks.filter(mk => inPoly(mk.lat, mk.lng, pp)); // 親の線の中にある目印（ファイル名ではなく、場所で決める）
    // すでに線のある番号の目印が、残りの部分にある：作らずにお知らせ
    mine.forEach(mk => {
      if (!have(mk.n)) return;
      if (blobs.some(b => inPC(mk.lat, mk.lng, b.poly))) out.notes.push(`区域${pno}-${mk.n}の目印が、枝番の線の外（線のない部分）にあります。線か目印の位置を確かめてください`);
    });
    const cand = marks.filter(mk => mk.n > 0 && !claimed.has(mk) && !have(mk.n) && (inPoly(mk.lat, mk.lng, pp) || !anyParent(mk)));
    const nums = [...new Set(cand.map(mk => mk.n))].sort((x, y) => x - y);
    const want = new Map(); // 番号 → 作る塊
    const conf = new Set();
    // 1) 目印が中にある塊（同じ番号の目印が2つの塊にあれば、広いほう）
    nums.forEach(n => {
      let best = null;
      cand.filter(mk => mk.n === n).forEach(mk => blobs.forEach(b => { if (inPC(mk.lat, mk.lng, b.poly) && (!best || b.a > best.a)) best = b; }));
      if (best) want.set(n, best);
    });
    const byBlob = new Map();
    want.forEach((b, n) => (byBlob.get(b) || byBlob.set(b, []).get(b)).push(n));
    byBlob.forEach((ns, b) => {
      if (ns.length < 2) return;
      b.hold = true; ns.forEach(n => { want.delete(n); conf.add(n); });
      out.notes.push(`区域${pno}：枝番の線のない1つの部分（約${fmtM2(b.a)}㎡）に、${ns.map(n => pno + '-' + n).join('・')} の目印があり、どの番号か決められないので作りません。線を引いてください`);
    });
    // 2) 目印が塊の外にある：まだ番号のない塊のうち、MARK_NEAR_M 以内でいちばん近い塊
    nums.filter(n => !want.has(n) && !conf.has(n)).forEach(n => {
      const used = new Set(want.values());
      let best = null, bd = MARK_NEAR_M;
      cand.filter(mk => mk.n === n).forEach(mk => blobs.forEach(b => {
        if (b.taken || b.hold || used.has(b)) return;
        const d = distToPolys(mk.lat, mk.lng, [b.poly]);
        if (d <= bd) { bd = d; best = b; }
      }));
      if (best) want.set(n, best);
      else out.notes.push(`区域${pno}-${n}の目印がありますが、作れる場所（枝番の線のない部分）が見つかりませんでした`);
    });
    const make = (n, b, how) => {
      const no = pno + '-' + n;
      kidsG.push({ no, b: String(n), raw: `（自動）${pno}-${CIRC[n - 1] || n}`, gen: true, g: [b.poly], a: b.a, bb: bbMP([b.poly]) });
      b.taken = true;
      (how === 'mark' ? out.madeMark : out.madeOld).push(no);
    };
    [...want.entries()].sort((x, y) => x[0] - y[0]).forEach(([n, b]) => { make(n, b, 'mark'); cand.filter(mk => mk.n === n).forEach(mk => out.claimed.push(mk)); });
    // 3) 目印が1つもなく、枝番が1つだけ抜けている（今のルール）：いちばん大きい塊（MIN_GEN_M2 以上）をその番号にする
    if (!mine.length && ks.length) {
      const nn = ks.map(k => Number(k.b)), max = Math.max(...nn), miss = [];
      for (let i = 1; i <= max; i++) if (!nn.includes(i) && !usedNos.has(pno + '-' + i)) miss.push(i);
      if (miss.length === 1) {
        const big = blobs.filter(b => !b.taken && !b.hold && b.a >= MIN_GEN_M2).sort((x, y) => y.a - x.a)[0];
        if (big) make(miss[0], big, 'old');
      }
    }
    // 4) 細いすき間・小さいすき間：境界を接する長さがいちばん長い枝番に入れる
    //    接する長さは、すき間を入れる前の枝番の線で測る（入れる順番で、結果が変わらないように）
    kidsG.forEach(k => { k.g0 = k.g; });
    blobs.filter(b => !b.taken && !b.hold).sort((x, y) => y.a - x.a).forEach(b => {
      if (!(b.a < SLIVER_M2 || b.thin < SLIVER_THIN)) return;
      let best = null, bl = 0;
      kidsG.forEach(k => { const l = sharedLen(b.poly, k.g0, P); if (l > bl) { bl = l; best = k; } });
      if (!best) return;
      const u = need(pcDo('union', best.g, b.poly)), L = largest(u);
      if (!L) return;
      best.g = [L.poly]; b.taken = true;
      out.absorbed.push({ pno, to: best.no, a: b.a, poly: b.poly, bb: bbPoly(b.poly) });
    });
    // 5) どれにも当たらない塊は、番号を付けない（家は「枝番の線の外に残った家」として数え、係が線を引き直す）
    kidsG.forEach(k => { k.ring = bridgePoly(largest(k.g).poly); });
    kidsG.forEach(k => out.specs.push({ no: k.no, pno, pnm: v.p.pnm, pp, poly: k.ring, kind: k.gen ? 'gen' : 'kid', raw: k.raw }));
    outsiders.forEach(k => out.specs.push({ no: k.no, pno, pnm: v.p.pnm, pp, poly: k.ring, kind: 'kid', raw: k.raw }));
    // 3-5 確かめ（合わなくても取り込みは止めない）
    const sum = kidsG.reduce((a, k) => a + ringAreaM2(k.ring), 0), parentA = ringAreaM2(pp), pct = 100 * sum / parentA;
    if (kidsG.length && (pct < 99.5 || pct > 100.5)) out.checks.push(`区域${pno}：枝番の面積の合計が、親の線の ${pct.toFixed(1)}% です（${pct < 99.5 ? '枝番の線のない部分が残っています' : '枝番が重なっているか、はみ出しています'}）`);
    for (let i = 0; i < kidsG.length; i++) for (let j = i + 1; j < kidsG.length; j++) {
      if (!bbHit(bbMP(kidsG[i].g), bbMP(kidsG[j].g))) continue;
      const a = mpArea(pcDo('intersection', kidsG[i].g, kidsG[j].g) || []);
      if (a >= 1) out.checks.push(`区域${pno}：${kidsG[i].no}と${kidsG[j].no}が、約${fmtM2(a)}㎡重なったままです`);
    }
    return out;
  }

  function planTerrs(m) {
    const notes = [], specs = [];
    const info = { made: [], madeMark: [], madeOld: [], absorbed: [], fixNotes: [], checks: [] };
    const pcOk = !!window.polygonClipping;
    if (!pcOk) notes.push('枝番の線を整える部品を読めなかったので、枝番の線は直さずにそのまま入れます（親の線で切る・重なりを直す・すき間を埋める・目印から枝番を作る、は行いません）');
    // 1) 線のある区域を、単純化して、となりの区域の角にそろえる（このあとの切る・引くの前に行う。あとで単純化すると、小さなすき間や重なりがまたできるため）
    const lines = [], seen = new Set(), P = new Map(), allPP = [];
    m.parents.forEach((p, pno) => {
      const ks = [...m.kids.values()].filter(k => k.pno === pno).sort((a, b) => Number(a.b) - Number(b.b));
      const pp = simp(p.ring);
      allPP.push(pp);
      if (!ks.length) { lines.push({ no: pno, pno: '', pnm: p.pnm, ring: pp, kind: 'single' }); seen.add(pno); return; }
      const v = { p, pp, ks: [] };
      P.set(pno, v);
      ks.forEach(k => { const o = { no: k.no, pno, pnm: p.pnm, raw: k.raw, b: k.b, kind: 'kid', ring: simp(k.ring) }; lines.push(o); v.ks.push(o); seen.add(k.no); });
    });
    // 親の線がない枝番（ファイルの書きまちがいなど）も、区域として入れる
    m.kids.forEach(k => { if (!m.parents.has(k.pno)) { lines.push({ no: k.no, pno: k.pno, pnm: '', raw: k.raw, kind: 'kid', ring: simp(k.ring) }); seen.add(k.no); notes.push(`枝番 ${k.no} の親（区域${k.pno}）の線がありませんでした`); } });
    m.others.forEach(o => {
      const s = typeof splitName === 'function' ? splitName(o.raw) : { no: '' };
      if (s.no && NO_RE.test(s.no) && !seen.has(s.no)) { lines.push({ no: s.no, pno: '', pnm: o.raw, ring: simp(o.ring), kind: 'single' }); seen.add(s.no); }
      else notes.push(`線「${o.raw || '名前なし'}」は、区域番号が分からないので入れません`);
    });
    m.dup.forEach(no => notes.push(`枝番 ${no} が2つのファイルにありました（はじめのものを使います）`));
    lines.sort((a, b) => cmpNo(a.no, b.no));
    const pool = [];
    lines.forEach(l => { const q = dropDup(snapToPool(l.ring.map(p => p.slice()), pool)); if (q.length >= 3) l.ring = q; });
    // 2) 親ごとに、枝番を整える（3-2〜3-5）。できなければ、直さずに入れる
    const marks = Array.isArray(m.marks) ? m.marks : [], claimed = new Set();
    const anyParent = mk => allPP.some(pp => inPoly(mk.lat, mk.lng, pp));
    const specOf = (l, pp) => { const s = { no: l.no, pno: l.pno, pnm: l.pnm, poly: l.ring, kind: l.kind, raw: l.raw }; if (pp) s.pp = pp; return s; };
    lines.filter(l => !(l.pno && P.has(l.pno))).forEach(l => specs.push(specOf(l)));
    [...P.entries()].sort((a, b) => cmpNo(a[0], b[0])).forEach(([pno, v]) => {
      let r = null;
      if (pcOk) {
        try { r = planKids(pno, v, { marks, claimed, usedNos: seen, anyParent }); }
        catch (e) { notes.push(`区域${pno}：枝番の線を整えられませんでした（線が交差しているかもしれません）。直さずに入れます`); }
      }
      if (!r) { v.ks.forEach(o => specs.push(specOf(o, v.pp))); return; }
      specs.push(...r.specs);
      r.claimed.forEach(mk => claimed.add(mk));
      info.madeMark.push(...r.madeMark); info.madeOld.push(...r.madeOld);
      info.absorbed.push(...r.absorbed); info.fixNotes.push(...r.fixNotes); info.checks.push(...r.checks);
      notes.push(...r.notes);
    });
    info.made = info.madeMark.concat(info.madeOld);
    specs.sort((a, b) => cmpNo(a.no, b.no));
    return Object.assign({ specs, notes }, info);
  }
  /* すき間を近くの枝番に入れたとき、そのすき間にある家：枝番の番号 → 家のid（確認画面で、入る家を先に見せるため） */
  function gapHouses(absorbed, scope) {
    const by = new Map();
    if (!absorbed || !absorbed.length) return by;
    for (const h of D().houses) {
      if (scope && h.terrId && !scope.has(h.terrId)) continue;
      for (const g of absorbed) {
        const b = g.bb;
        if (h.lat < b[0] || h.lat > b[1] || h.lng < b[2] || h.lng > b[3]) continue;
        if (inPC(h.lat, h.lng, g.poly)) { (by.get(g.to) || by.set(g.to, []).get(g.to)).push(h.id); break; }
      }
    }
    return by;
  }
  /* 家がどの新しい区域に入るか（枝番の外に残る家を数える） */
  function houseFit(specs, scope) {
    const bx = specs.map(s => ({ s, b: bboxOf(s.poly) }));
    const pps = new Map();
    specs.forEach(s => { if (s.pno && s.pp && !pps.has(s.pno)) pps.set(s.pno, { pp: s.pp, b: bboxOf(s.pp) }); });
    const gaps = new Map(); let outside = 0;
    for (const h of D().houses) {
      if (scope && h.terrId && !scope.has(h.terrId)) continue; // 新しくしない区域の家は見ない
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
  /* mode：'all'＝区域の線と拒否・注意をまとめて新しくする（全部置きかえ）
           'lines'＝区域の線だけ（はじめは、ファイルにある区域だけを新しくする。拒否・注意・家はそのまま）
           'pins'＝拒否・注意だけ（区域の線は変えない。はじめは、今の拒否に足す。同じ家・同じ場所は足さない） */
  async function start(files, mode) {
    if (!isAdmin()) return;
    if (!files || !files.length) return;
    mode = mode === 'lines' || mode === 'pins' ? mode : 'all';
    toast('ファイルを読んでいます…');
    let texts;
    try { texts = await readFiles(files); } catch (e) { infoSheet('ファイルを読み込めませんでした', 'マイマップの「KML/KMZにエクスポート」で書き出したファイル（またはそれをまとめたZIP）を選んでください。'); return; }
    const parsed = [], bad = [];
    texts.forEach(t => { try { parsed.push(parseKmlText(t.text, t.name)); } catch (e) { bad.push(t.name); } });
    const m = mergeParsed(parsed);
    const hasLines = m.parents.size || m.kids.size || m.others.length;
    if (mode !== 'pins' && !m.parents.size && !m.kids.size) { infoSheet('区域の線が見つかりませんでした', 'マイマップで書き出すときに「ネットワーク リンク」のチェックを外して、もう一度書き出してください。'); return; }
    if (mode === 'pins' && !m.pins.length) { infoSheet('ピンが見つかりませんでした', 'このファイルには、ピン（地点）が入っていません。拒否・注意のピンがあるマイマップを書き出してください。'); return; }
    try { await loadScript(LIB.pclip); } catch (e) { /* なくても、抜けた枝番を作らないだけ */ }
    const tp = mode !== 'pins' || hasLines ? planTerrs(m) : { specs: [], notes: [], made: [], madeMark: [], madeOld: [], absorbed: [], fixNotes: [], checks: [] };
    const items = [];
    if (mode !== 'lines') m.pins.forEach(p => splitPin(p).forEach(it => items.push(it)));
    // ピンの区域：線も新しくするときは新しい線で、拒否・注意だけのときは今の区域の線で決める
    const tno = mode === 'pins' ? ((la, ln) => { const id = terrOf(la, ln), t = id ? terrById(id) : null; return t ? normNo(t.no) : ''; }) : terrOfSpecs(tp.specs);
    // ピンの名前が区域番号と同じもの（例：「1-1」「01-①」「12」）は、枝番などの目印の可能性が高いので、はじめは「入れない」にする
    const nos = new Set(tp.specs.map(s => s.no).concat(tp.specs.filter(s => s.pno).map(s => s.pno)));
    if (mode === 'pins') D().territories.forEach(t => { if (!isSpecial(t)) { nos.add(normNo(t.no)); if (t.pno) nos.add(String(t.pno)); } });
    items.forEach((it, i) => {
      it.i = i; it.tno = tno(it.lat, it.lng);
      it.sameNo = !it.room && nos.has(noKey(it.src));
      it.use = !it.sameNo;
    });
    // ピンのレイヤー（マイマップのフォルダ）が2つ以上あるときは、レイヤーごとに入れる・入れないをえらべる
    const folders = [...new Set(items.map(it => it.folder || ''))];
    const st = { mode, files: texts.length, bad, m, tp, items, fit: mode === 'pins' ? { gaps: new Map(), outside: 0 } : null, mv: new Map(),
      replaceDnc: mode === 'all', scope: mode === 'lines' ? 'files' : 'all', pinWay: 'add', folders, offFolders: new Set() };
    if (mode !== 'pins') refit(st);
    ui.tab = mode === 'pins' ? 'pin' : 'terr';
    preview(st);
  }
  /* 家の数えなおし：新しい線で、枝番の外に残る家・すき間から枝番に入る家（「どこまで新しくするか」を変えたときもやりなおす） */
  function refit(st) {
    const scope = st.scope === 'files' ? scopeTids(st.tp.specs) : null;
    st.fit = houseFit(st.tp.specs, scope);
    st.mv = gapHouses(st.tp.absorbed, scope);
  }
  /* 「ファイルにある区域だけ」新しくするときに、新しくする今の区域：番号が同じ区域と、同じ親の番号の区域（枝番が変わる・親を枝番に分ける） */
  function scopeOld(specs) {
    const nos = new Set(specs.map(s => s.no)), pars = new Set();
    specs.forEach(s => { pars.add(s.pno || s.no); });
    return D().territories.filter(t => !t.dummy && !isSpecial(t) && (nos.has(normNo(t.no)) || pars.has(String(t.pno || '')) || pars.has(normNo(t.no)) || pars.has(normNo(t.no).split('-')[0])));
  }
  const scopeTids = specs => new Set(scopeOld(specs).map(t => t.id));

  /* ---------- 確認の画面 ---------- */
  const ui = { open: new Set(), tab: 'terr' };
  function oldInfo(specs, scope) {
    const nos = new Set(specs.map(s => s.no));
    const olds = scope === 'files' ? scopeOld(specs) : D().territories.filter(t => !t.dummy && !isSpecial(t));
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
        ${k === 'dnc' && it.m ? `<small class="kk-memo">メモ：<span data-notr>${esc(it.m)}</span></small>` : ''}
        ${it.sameNo ? '<small class="kk-part">名前が区域番号と同じなので、目印とみなして入れません（拒否なら左の印を押してください）</small>' : ''}
        ${it.part && !it.sameNo ? '<small class="kk-part">住所が番地だけです（取り込んだあと「要確認」で家を確かめてください）</small>' : ''}
        ${it.sens && k !== 'skip' ? '<small class="kk-sens">病気・家庭の事情など、個人のことが書かれていないか確かめてください</small>' : ''}
        <small>ピン：<span data-notr>${esc(it.o || String(it.src || ''))}</span>${it.black ? '（黒いピン）' : ''}</small></div></div>`;
  }
  const TITLE = { all: 'マイマップで区域と拒否を新しくする', lines: 'マイマップから区域の線だけを取り込む', pins: 'マイマップから拒否・注意だけを取り込む' };
  /* 拒否・注意だけのとき：入れなおす区域（ピンがある区域）と、そこにある今の拒否・注意の数 */
  function pinScope(st) {
    const tids = new Set();
    st.items.forEach(it => { if (it.use && !st.offFolders.has(it.folder || '')) { const id = terrOf(it.lat, it.lng); if (id) tids.add(id); } });
    let dnc = 0, cau = 0;
    for (const k in D().dnc) if (tids.has(dncTidOf(k, D().dnc[k]))) dnc++;
    for (const k in C()) { const v = C()[k]; if (v && v.s === 'kml' && tids.has(dncTidOf(k, v))) cau++; }
    return { tids, dnc, cau };
  }
  const dncTidOf = (k, v) => { if (isPinKey(k)) return dncTerrOf(v); const h = houseById(String(k).split('|')[0]); return h ? h.terrId : null; };
  const live = (st, it) => it.use && !st.offFolders.has(it.folder || '');
  function preview(st) {
    const { tp, items, fit, mode } = st;
    const oi = mode === 'pins' ? null : oldInfo(tp.specs, st.scope), dc = dncCounts();
    const nKid = tp.specs.filter(s => s.pno).length, nPar = new Set(tp.specs.filter(s => s.pno).map(s => s.pno)).size, nSingle = tp.specs.filter(s => !s.pno).length;
    const nD = items.filter(i => live(st, i) && i.kind === 'dnc').length, nW = items.filter(i => live(st, i) && i.kind === 'warn').length;
    const gapList = fit ? [...fit.gaps.entries()].sort((a, b) => cmpNo(a[0], b[0])) : [];
    // すき間を近くの枝番に入れる：親ごとの数と広さ（1㎡未満は、計算のずれなので数えない）。すき間に家があれば、その家
    const absBy = new Map();
    tp.absorbed.filter(x => x.a >= GAP_NOTE_M2).forEach(x => { const v = absBy.get(x.pno) || { n: 0, a: 0 }; v.n++; v.a += x.a; absBy.set(x.pno, v); });
    const absList = [...absBy.entries()].sort((a, b) => cmpNo(a[0], b[0]));
    const mvList = [...(st.mv || new Map()).entries()].sort((a, b) => cmpNo(a[0], b[0]));
    const byT = new Map();
    items.forEach(it => { if (st.offFolders.has(it.folder || '')) return; const key = it.tno || '？'; (byT.get(key) || byT.set(key, []).get(key)).push(it); });
    const tGroups = [...byT.entries()].sort((a, b) => (a[0] === '？') - (b[0] === '？') || cmpNo(a[0], b[0]));
    const nKmlCau = Object.values(C()).filter(v => v && v.s === 'kml').length;
    const showTerr = mode !== 'pins', showPin = mode !== 'lines';
    const tab = showTerr && showPin ? ui.tab : showTerr ? 'terr' : 'pin';
    const ps = mode === 'pins' ? pinScope(st) : null;
    setSheet(headHtml(null, TITLE[mode], `ファイル ${st.files}件`) + `
      <div class="tiles">
        ${showTerr ? `<div class="tile"><b>${nPar + nSingle}</b><span>区域（親）</span></div>
        <div class="tile"><b>${nKid}</b><span>枝番の区域</span></div>` : ''}
        ${showPin ? `<div class="tile"><b>${nD}</b><span>拒否</span></div>
        <div class="tile"><b>${nW}</b><span>注意（！）</span></div>` : ''}
      </div>
      ${st.bad.length ? `<div class="notice warn">読めなかったファイル：${st.bad.map(esc).join('、')}</div>` : ''}
      ${showTerr && showPin ? `<div class="seg kk-tabs" role="group">
        <button type="button" data-kktab="terr" aria-pressed="${tab === 'terr'}">区域の線</button>
        <button type="button" data-kktab="pin" aria-pressed="${tab === 'pin'}">拒否・注意（${nD + nW}）</button>
      </div>` : ''}
      <div id="kkBody">${tab === 'terr' ? `
        <h3 class="sub">区域の線</h3>
        <ul class="kk-ul">
          <li>枝番のある区域 ${nPar}（枝番 ${nKid}）・枝番のない区域 ${nSingle}</li>
          ${tp.madeMark.length ? `<li><b>目印から作る枝番：</b>${tp.madeMark.map(esc).join('、')}（目印「ポイント ⑤」などの場所）</li>` : ''}
          ${tp.madeOld.length ? `<li><b>抜けていた枝番を自動で作ります：</b>${tp.madeOld.map(esc).join('、')}（ほかの枝番に囲まれた部分）</li>` : ''}
          ${absList.length ? `<li><b>線のすき間を近くの枝番に入れます：</b>${absList.map(([p, v]) => `区域${esc(p)} ${v.n}か所（合計 約${fmtM2(v.a)}㎡）`).join('、')}</li>` : ''}
          ${mvList.length ? `<li><b>すき間にある家（近くの枝番に入ります）：</b><ul class="kk-mv">${mvList.map(([no, ids]) => `<li>区域${esc(no)}へ入れる家：${ids.length}軒 <button type="button" class="btn small" data-kkmap="${esc(ids[0])}">地図で見る</button></li>`).join('')}</ul></li>` : ''}
          <li>番号が同じ今の区域 ${oi.keep.length}：線と名前を新しくします（貸し出し・S-13の記録は引き継ぎます${oi.lentKeep.length ? `。貸し出し中 ${oi.lentKeep.length}` : ''}）</li>
          <li>なくなる今の区域 ${oi.gone.length}${oi.gone.length ? `（${oi.gone.slice(0, 12).map(t => esc(t.no)).join('・')}${oi.gone.length > 12 ? ' ほか' : ''}）` : ''}：消します（家は残り、新しい線で区域を決め直します）</li>
          ${mode === 'lines' && st.scope === 'files' ? `<li>ファイルにない区域（${Math.max(0, D().territories.filter(t => !t.dummy && !isSpecial(t)).length - oi.keep.length - oi.gone.length)}）は、そのままです</li>` : ''}
          ${mode === 'lines' ? '<li>拒否・注意・家の印は変えません</li>' : ''}
          ${m0(st)}
        </ul>
        ${oi.lentGone.length ? `<div class="notice warn"><b>貸し出し中の区域で、番号がなくなるものがあります：</b>${oi.lentGone.map(t => `区域${esc(t.no)}（${esc(uname(t.holder))}さん）`).join('、')}<br>この区域の貸し出しは終わります。</div>` : ''}
        ${gapList.length ? `<div class="notice warn"><b>枝番の線の外に残る家があります（どの区域にも入りません）：</b><br>${gapList.map(([p, n]) => `区域${esc(p)}：${n}軒`).join('、')}<br>新しくしたあと、「区域の線・取り込み」の「区域の線を直す」で、枝番の線を引き直してください。</div>` : ''}
        ${tp.checks.length ? `<div class="notice warn"><b>枝番の面積が、親の線と合わない区域があります：</b><br>${tp.checks.map(esc).join('<br>')}<br>取り込みはできます。新しくしたあと、「区域の線を直す」で確かめてください。</div>` : ''}
        ${fit && fit.outside ? `<p class="hint">どの区域の線にも入らない家：${fit.outside}軒（区域の外の家として残ります）</p>` : ''}
        ${tp.fixNotes.length ? `<details class="dncfold"><summary>直した重なり・はみ出し ${tp.fixNotes.length}件</summary><ul>${tp.fixNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
        ${tp.notes.length ?`<details class="dncfold"><summary>気づいたこと ${tp.notes.length}件</summary><ul>${tp.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}`
      : `
        <h3 class="sub">拒否・注意</h3>
        ${st.folders.length > 1 ? `<p class="q">入れるレイヤー（マイマップのフォルダ）</p><div class="kk-folders">${st.folders.map(f => `<label class="check"><input type="checkbox" data-kkfo="${esc(f)}"${st.offFolders.has(f) ? '' : ' checked'}>${esc(f || '（名前のないレイヤー）')}（${items.filter(i => (i.folder || '') === f).length}）</label>`).join('')}</div>` : ''}
        <p class="hint">左の印を押すと「拒否 → 注意 → 入れない」の順に切りかわります。黒いピンと、部屋番号のあとのカッコ書き（例：1002（夜勤））、<b>時間や曜日つきの「訪問しない」（例：夕方は訪問しない）</b>は「注意」にしています。<br>
          注意の内容は、その家を訪ねる人みんなが見ます。<b>名前・病気・家庭の事情など、個人のことは書かない</b>でください。</p>
        ${items.some(i => i.sens) ? `<div class="notice warn">個人の事情が書かれているかもしれない注意が ${items.filter(i => i.sens).length}件あります（<span class="kk-sens">目印</span>のもの）。内容を確かめてください。</div>` : ''}
        ${tGroups.map(([no, its]) => `<details class="dncg kk-g" data-kg="${esc(no)}"${ui.open.has(no) ? ' open' : ''}><summary><span class="stamp sm${noCls(no)}">${esc(no)}</span><span class="nm">${no === '？' ? (mode === 'pins' ? '区域の線の外' : '新しい区域の線の外') : '区域' + esc(no)}</span>
          <span class="cnt">拒 ${its.filter(i => i.use && i.kind === 'dnc').length}・！ ${its.filter(i => i.use && i.kind === 'warn').length}</span></summary>
          ${ui.open.has(no) ? its.map(itemRow).join('') : ''}</details>`).join('')}
        ${st.m.marks.length ? `<p class="hint">枝番の目印のピン（「ポイント ①」など）${st.m.marks.length}本は、拒否・注意としては入れません${mode === 'pins' ? '' : '（枝番の区域づくりに使います）'}。</p>` : ''}
        ${items.some(i => i.sameNo) ? `<p class="hint">名前が区域番号と同じピン ${items.filter(i => i.sameNo).length}本は、目印とみなして「入れない」にしています（各区域の一覧で確かめられます）。</p>` : ''}`}
      </div>
      <div class="dx-foot">
        ${mode === 'all' ? `<label class="check"><input type="checkbox" id="kkRep"${st.replaceDnc ? ' checked' : ''}>今ある拒否 ${dc.all}件をすべて消して入れなおす<small>（訪問で記録 ${dc.visit}・取り込み ${dc.imp}・アパートの部屋 ${dc.room}）</small></label>
        ${nKmlCau ? `<p class="hint">以前にマイマップから入れた注意 ${nKmlCau}件は入れなおします（奉仕者・係が書いた注意は残します）。</p>` : ''}` : ''}
        ${mode === 'lines' ? `<p class="q">どこまで新しくしますか</p><div class="choices two kk-way">
          <button type="button" class="choice" data-kkscope="files" aria-pressed="${st.scope === 'files'}">ファイルにある区域だけ<small>同じ番号・同じ親の区域だけを新しくします。ほかの区域はそのまま</small></button>
          <button type="button" class="choice" data-kkscope="all" aria-pressed="${st.scope === 'all'}">全部置きかえる<small>ファイルにない区域は消します（家は残ります）。全区域のファイルをえらんだときに</small></button></div>` : ''}
        ${mode === 'pins' ? `<p class="q">今ある拒否・注意は</p><div class="choices two kk-way">
          <button type="button" class="choice" data-kkway="add" aria-pressed="${st.pinWay === 'add'}">残して、足す<small>同じ家・同じ場所の拒否は、もう一度入れません</small></button>
          <button type="button" class="choice" data-kkway="replace" aria-pressed="${st.pinWay === 'replace'}">入れなおす<small>ピンのある区域（${ps.tids.size}）の拒否 ${ps.dnc}件と、マイマップから入れた注意 ${ps.cau}件を消してから入れます</small></button></div>` : ''}
        <button type="button" class="btn primary block" id="kkGo">${mode === 'lines' ? 'この内容で区域の線を新しくする' : mode === 'pins' ? 'この内容で拒否・注意を入れる' : 'この内容で新しくする'}</button>
        <button type="button" class="btn block" data-close>やめる</button>
      </div>`);
    const S = $('#sheet');
    $$('[data-kktab]', S).forEach(b => b.onclick = () => { ui.tab = b.dataset.kktab; sheetKeep = true; preview(st); });
    if ($('#kkRep')) $('#kkRep').onchange = e => { st.replaceDnc = e.target.checked; };
    $$('[data-kkscope]', S).forEach(b => b.onclick = () => {
      st.scope = b.dataset.kkscope; refit(st); sheetKeep = true; preview(st);
    });
    $$('[data-kkway]', S).forEach(b => b.onclick = () => { st.pinWay = b.dataset.kkway; sheetKeep = true; preview(st); });
    // すき間にある家を地図で見る（確認画面を閉じて地図へ。あとで確認画面にもどれる）
    $$('[data-kkmap]', S).forEach(b => b.onclick = () => {
      closeSheet(); goTo(b.dataset.kkmap);
      setTimeout(() => toast('取り込みの確認画面を、いったん閉じました', null, { label: '確認画面にもどる', fn: () => preview(st) }), 1600);
    });
    $$('[data-kkfo]', S).forEach(b => b.onchange = () => { const f = b.dataset.kkfo; if (b.checked) st.offFolders.delete(f); else st.offFolders.add(f); sheetKeep = true; preview(st); });
    $$('.kk-g', S).forEach(d => d.addEventListener('toggle', () => {
      const no = d.dataset.kg;
      if (d.open) { ui.open.add(no); if (!d.querySelector('.kk-it')) { d.insertAdjacentHTML('beforeend', items.filter(i => (i.tno || '？') === no && !st.offFolders.has(i.folder || '')).map(itemRow).join('')); } }
      else ui.open.delete(no);
    }));
    const body = $('#kkBody'); // 描き直すたびに作り直される入れ物に付ける（同じ処理が2回動かないように）
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-cyc]'); if (!b) return;
      const it = items[Number(b.dataset.cyc)];
      if (!it.use) { it.use = true; it.kind = 'dnc'; } else if (it.kind === 'dnc') { it.kind = 'warn'; if (!it.note && it.m) it.note = it.m; } else it.use = false;
      const row = b.closest('.kk-it'); row.outerHTML = itemRow(it);
    });
    body.addEventListener('input', e => { const x = e.target; if (x.dataset && x.dataset.note != null) items[Number(x.dataset.note)].note = x.value.slice(0, 80); });
    $('#kkGo').onclick = () => confirmGo(st);
  }
  const m0 = st => (st.m.dup.length ? `<li>同じ枝番が2つあったもの：${st.m.dup.map(esc).join('、')}</li>` : '');

  async function confirmGo(st) {
    const mode = st.mode;
    let body;
    if (mode === 'pins') {
      const ps = pinScope(st), n = st.items.filter(i => live(st, i)).length;
      if (!n) { toast('入れる拒否・注意がありません'); return; }
      body = st.pinWay === 'replace'
        ? `ピンのある区域（${ps.tids.size}）の今の拒否 ${ps.dnc}件と、マイマップから入れた注意 ${ps.cau}件を消して、マイマップの拒否・注意（${n}件）を入れます。区域の線は変えません。`
        : `今の拒否・注意は残して、マイマップの拒否・注意（${n}件）を足します。同じ家・同じ場所のものは足しません。区域の線は変えません。`;
    } else {
      const oi = oldInfo(st.tp.specs, st.scope);
      body = mode === 'lines'
        ? `${st.scope === 'files' ? 'ファイルにある区域' : 'すべての区域'}の線を新しくします（番号が同じ区域 ${oi.keep.length}・なくなる区域 ${oi.gone.length}）。拒否・注意・家の印は変えません。`
        : `区域の線をすべて新しくします（なくなる区域 ${oi.gone.length}）。${st.replaceDnc ? '今の拒否はすべて消して、' : ''}マイマップの拒否・注意を入れます。`;
    }
    const ok = await ask(TITLE[mode].replace(/する$/, 'しますか？').replace(/取り込む$/, '取り込みますか？'), {
      title: TITLE[mode].replace(/する$/, 'しますか？').replace(/取り込む$/, '取り込みますか？'),
      body: body + '\n始める前に、今の区域・拒否・注意を、この端末にファイルで控えます。',
      ok: mode === 'pins' ? '入れる' : '新しくする'
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
    const { specs } = st.tp, at = now(), mode = st.mode;
    const res = { nNew: 0, nKeep: 0, nGone: 0, dnc: 0, cau: 0, pinOnly: 0, skip: 0, delD: 0, delC: 0 };
    closeSheet();
    const before = new Map(D().houses.map(h => [h.id, h.terrId || null]));
    const msg = mode === 'lines' ? '区域の線を新しくしました' : mode === 'pins' ? '拒否・注意を取り込みました' : '区域と拒否・注意を新しくしました';
    commit(msg, () => {
      // 1) 区域（拒否・注意だけのときは、さわらない）
      if (mode !== 'pins') {
        const olds = mode === 'lines' && st.scope === 'files' ? scopeOld(specs) : D().territories.filter(t => !t.dummy && !isSpecial(t));
        const byNo = new Map();
        olds.forEach(t => byNo.set(normNo(t.no), t));
        // ファイルにある区域だけのとき：ほかの区域と同じ番号の線は、その区域を新しくする（親の番号がちがっても、番号が同じなら同じ区域）
        if (mode === 'lines' && st.scope === 'files') D().territories.forEach(t => { if (!t.dummy && !isSpecial(t) && !byNo.has(normNo(t.no)) && specs.some(x => x.no === normNo(t.no))) byNo.set(normNo(t.no), t); });
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
        olds.filter(t => !used.has(t.id)).map(t => t.id).forEach(id => { deleteTerrData(id, false); res.nGone++; });
        reassign();
        // 家の区域は、画面からは送らない（3万件になることがあるので）。サーバーが同じ決め方で決め直す（下の kmlAfterFlush）
        if (LIVE && Store.fp && Store.fp.houses) D().houses.forEach(h => { if ((h.terrId || null) !== before.get(h.id)) Store.fp.houses.set(h.id, JSON.stringify(h)); });
      }
      if (mode === 'lines') return;
      // 2) 拒否・注意（今あるものを消す）
      const cm = C();
      if (mode === 'all') {
        if (st.replaceDnc) { D().dnc = {}; }
        Object.keys(cm).forEach(k => { if (cm[k] && cm[k].s === 'kml') delete cm[k]; });
      } else if (st.pinWay === 'replace') {
        const tids = pinScope(st).tids;
        Object.keys(D().dnc).forEach(k => { if (tids.has(dncTidOf(k, D().dnc[k]))) { delete D().dnc[k]; res.delD++; } });
        Object.keys(cm).forEach(k => { if (cm[k] && cm[k].s === 'kml' && tids.has(dncTidOf(k, cm[k]))) { delete cm[k]; res.delC++; } });
      }
      // 足すときは、同じ家・同じ場所（3m以内・同じ部屋）の拒否・注意を、もう一度入れない
      const addOnly = mode === 'pins' && st.pinWay === 'add';
      const pinNear = (m, lat, lng, room) => Object.keys(m).some(k => {
        const v = m[k]; if (!isPinKey(k) || !v || typeof v !== 'object' || !isFinite(v.lat)) return false;
        return (v.room || '') === (room || '') && Math.abs(v.lat - lat) < 0.00003 && Math.abs(v.lng - lng) < 0.00003;
      });
      // 3) 入れる
      const api = window.kyohiApi, near = api.houseGrid();
      st.items.forEach(it => {
        if (!live(st, it)) return;
        const base = { s: 'kml', at };
        if (it.a) base.a = it.a;
        if (it.kind === 'dnc' && it.m) base.m = it.m; // ピンのメモ（区域係だけが見る）
        if (it.kind === 'dnc' && it.o) base.o = it.o; // ピンの元の文（区域係だけが見る）
        const pos = { lat: it.lat, lng: it.lng, good: true };
        if (it.room) { // アパートの部屋：建物のそばの、場所だけの印に部屋番号を付ける
          const apt = near(it.lat, it.lng, 30).find(([h]) => h.type === 'apt');
          const o = Object.assign(base, { p: 1, room: it.room, lat: r6(apt ? apt[0].lat : it.lat), lng: r6(apt ? apt[0].lng : it.lng) });
          if (apt) o.h = apt[0].id;
          const tid = apt ? apt[0].terrId : terrOf(it.lat, it.lng); if (tid) o.t = tid;
          if (addOnly && pinNear(it.kind === 'warn' ? cm : D().dnc, o.lat, o.lng, it.room)) { res.skip++; return; }
          if (it.kind === 'warn') { if (it.note) o.n = it.note; delete o.a; cm['pin:' + uid()] = o; res.cau++; }
          else { D().dnc['pin:' + uid()] = o; res.dnc++; }
          return;
        }
        const pl = api.placeOne(near, pos, '', true);
        if (pl.kind === 'house') {
          const h = pl.h, k = K(h.id, '');
          if (it.kind === 'warn') { if (addOnly && cm[k]) { res.skip++; return; } cm[k] = { s: 'kml', at }; if (it.note) cm[k].n = it.note; res.cau++; }
          else { if (addOnly && D().dnc[k]) { res.skip++; return; } D().dnc[k] = Object.assign(base, { lat: r6(h.lat), lng: r6(h.lng), auto: 1 }); delete D().follows[k]; delete D().released[k]; delete cm[k]; res.dnc++; }
          return;
        }
        if (it.kind === 'warn') { // 近くにアパートがあれば、建物ぜんたいの注意にする
          const apt = near(it.lat, it.lng, 15).find(([h]) => h.type === 'apt');
          if (apt) { const k = K(apt[0].id, ''); if (addOnly && cm[k]) { res.skip++; return; } cm[k] = { s: 'kml', at }; if (it.note) cm[k].n = it.note; res.cau++; return; }
        }
        const o = Object.assign(base, { p: 1, lat: r6(it.lat), lng: r6(it.lng) });
        const tid = terrOf(it.lat, it.lng); if (tid) o.t = tid;
        if (addOnly && pinNear(it.kind === 'warn' ? cm : D().dnc, o.lat, o.lng, '')) { res.skip++; return; }
        res.pinOnly++;
        if (it.kind === 'warn') { if (it.note) o.n = it.note; delete o.a; cm['pin:' + uid()] = o; res.cau++; }
        else { D().dnc['pin:' + uid()] = o; res.dnc++; }
      });
    });
    toast(msg + (mode === 'pins' ? '' : '（取り消すときは、控えのファイルから係に相談してください）')); // 3万件の家をもどす「取り消す」は出さない
    if (LIVE) { if (mode !== 'pins') lsSet(NEED_KEY, '1'); flush(true); }
    // 4) 終わりの画面
    const gaps = st.fit ? [...st.fit.gaps.entries()].sort((a, b) => cmpNo(a[0], b[0])) : [];
    const terrLine = `<li>区域：新しく ${res.nNew}・線を新しくした ${res.nKeep}・消した ${res.nGone}${st.tp.made.length ? `（自動で作った枝番：${st.tp.made.map(esc).join('、')}）` : ''}</li>`;
    const pinLine = `<li>拒否 ${res.dnc}件・注意（！）${res.cau}件${res.skip ? `・同じものがあったので入れなかった ${res.skip}件` : ''}${res.delD || res.delC ? `（入れる前に消した拒否 ${res.delD}・注意 ${res.delC}）` : ''}${res.pinOnly ? `（うち家の印とつながっていないもの ${res.pinOnly}件は「拒否・！」の一覧の「要確認」から地図で家とつなげます）` : ''}</li>`;
    infoSheet(msg, `
      <ul class="kk-ul">${mode !== 'pins' ? terrLine : ''}${mode !== 'lines' ? pinLine : ''}</ul>
      ${gaps.length ? `<div class="notice warn"><b>枝番の線の外に残った家：</b>${gaps.map(([p, n]) => `区域${esc(p)} ${n}軒`).join('、')}<br>「区域の線・取り込み」の「区域の線を直す」で、枝番の線を引き直してください。</div>` : ''}
      <p class="hint">控えのファイル（${mode === 'pins' ? '取り込む前の区域・拒否・注意の控え' : '区域を新しくする前の控え'}）が、この端末に保存されています。</p>`);
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
  .kk-note{width:100%;min-height:44px;font-size:16px;border:2px solid #E8590C;border-radius:10px;padding:0 8px;margin:4px 0;background:#FFF1E6}
  .kk-part{display:inline-block;background:#FFF4D6;color:#6B4200;border-radius:6px;padding:0 6px;font-weight:700}
  .kk-memo{display:inline-block;background:#F1F3F5;color:var(--ink);border-radius:6px;padding:0 6px}
  .kk-sens{display:inline-block;background:#FDECEC;color:#8B1A1A;border-radius:6px;padding:0 6px;font-weight:700}
  .kk-way .choice[aria-pressed=true]{border-color:var(--brand);background:#DCE8F7;box-shadow:inset 0 0 0 1px var(--brand)}
  .kk-folders{display:flex;flex-direction:column;gap:2px;margin:4px 0 10px}
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
    if (e.target && e.target.id === 'adKmlAll') { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) start(fs, 'all'); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
