/* =========================================================
   chizu.js  区域マップ：地図を分かりやすくする（標準地図・目印）
   読み込む順番：schedule.js → kantan.js → kangaeru.js → chizu.js（いちばん最後）
   方向A：地理院の「標準地図」（地名の多い地図）を選べる／家の印が見えるよう、地図の層ぜんぶを少し薄くする
   方向B：会館・学校などの「目印」を、地図・区域カード・S-12 に出す（登録・直す・消す・CSV は区域係だけ）
   ・index.html の関数は、置きかえずに「包んで」います（元の動きはそのまま）
   ・目印のデータは、サーバーの lm_pull（変わった分だけ）でもらい、端末の IndexedDB に残す（圏外でも出る）
   ・個人の家・人の名前は登録させない（確かめの画面／サーバーの検査）。名前は、どこで出すときも esc する
   ========================================================= */
(function () {
  'use strict';

  /* =========================================================
     純粋な部品（画面がなくても動く。確かめ用に外へも出す）
     ========================================================= */
  const LM_KINDS = [
    ['kaikan', '会館', '会'], ['school', '学校', '学'], ['kominkan', '公民館・集会所', '公'], ['shop', '店', '店'],
    ['park', '公園', '園'], ['yakusho', '役所・病院', '役'], ['bus', 'バス停', 'バ'], ['other', 'その他', '他']
  ];
  const LM_IDS = LM_KINDS.map(k => k[0]);
  const lmKindName = id => { const k = LM_KINDS.find(x => x[0] === id); return k ? k[1] : ''; };
  const lmKindMark = id => { const k = LM_KINDS.find(x => x[0] === id); return k ? k[2] : '他'; };
  const lmPri = id => { const i = LM_IDS.indexOf(id); return i < 0 ? 99 : i; };
  function lmKindFromText(s) {
    const t = String(s == null ? '' : s).normalize('NFKC').trim();
    const k = LM_KINDS.find(x => x[0] === t || x[1] === t);
    return k ? k[0] : '';
  }
  const lmClean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const lmTextBad = t => {
    const n = t.normalize('NFKC');
    return /[<>"']/.test(t) || /[<>"']/.test(n) || /^[=+\-@]/.test(t) || /^[=+\-@]/.test(n);
  };
  /* 名前の検査（1〜20文字・使えない文字・先頭の = + - @）。person：個人の家かもしれない（確かめの画面を1回出す） */
  function lmNameCheck(raw) {
    const name = lmClean(raw);
    const n = Array.from(name).length;
    if (n < 1) return { ok: false, why: '名前を入れてください' };
    if (n > 20) return { ok: false, why: '名前は20文字までです' };
    if (lmTextBad(name)) return { ok: false, why: '使えない文字があります' };
    return { ok: true, name, person: /さん|様|宅|邸/.test(name.replace(/住宅/g, '')) }; // 「住宅」（市営住宅など）の「宅」では確かめない
  }
  function lmSrcCheck(raw) {
    const s = lmClean(raw);
    if (!s) return { ok: false, why: '出典を入れてください' };
    if (Array.from(s).length > 40) return { ok: false, why: '出典は40文字までです' };
    if (lmTextBad(s)) return { ok: false, why: '使えない文字があります' };
    return { ok: true, src: s };
  }
  function mDist(a, b) {
    const dy = (a[0] - b[0]) * 110540, dx = (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }
  const lmSrcLine = items => {
    const set = [];
    (items || []).forEach(x => { if (x && x.src && set.indexOf(x.src) < 0) set.push(x.src); });
    return set.length ? '目印の一部は『' + set.join('・') + '』を加工して作成' : '';
  };
  function tileXY(lat, lng, z) {
    const n = Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    const x = Math.floor((lng + 180) / 360 * n), y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
    return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
  }
  /* box：[南, 西, 北, 東]。1つの範囲・1つの拡大の度合いで、cap 枚まで */
  function tileUrls(tpl, box, zs, cap) {
    const out = [];
    zs.forEach(z => {
      const a = tileXY(box[2], box[1], z), b = tileXY(box[0], box[3], z);
      let n = 0;
      for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) {
        if (n++ >= cap) return;
        out.push(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }
    });
    return out;
  }
  /* CSV（1行目は見出し）：名前,種類,緯度,経度 → 取りこむ・確かめ・外す に分ける。bounds：[南,西,北,東]（なければ null） */
  function lmCsvEval(rows, existing, bounds) {
    const ok = [], ask = [], bad = [];
    const seen = (existing || []).map(x => ({ name: x.name, lat: x.lat, lng: x.lng }));
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => !String(c == null ? '' : c).trim())) continue;
      const line = i + 1;
      const kind = lmKindFromText(r[1]);
      if (!kind) { bad.push({ line, why: '種類が8つのどれでもありません' }); continue; }
      const nc = lmNameCheck(r[0]);
      if (!nc.ok) { bad.push({ line, why: nc.why }); continue; }
      const lat = Number(String(r[2] == null ? '' : r[2]).trim()), lng = Number(String(r[3] == null ? '' : r[3]).trim());
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { bad.push({ line, why: '場所の数字が読めません' }); continue; }
      if (bounds && (lat < bounds[0] || lat > bounds[2] || lng < bounds[1] || lng > bounds[3])) { bad.push({ line, why: '区域のまわりの外です' }); continue; }
      if (seen.some(x => x.name === nc.name && mDist([x.lat, x.lng], [lat, lng]) <= 50)) { bad.push({ line, why: '同じ名前で50m以内に、すでにあります' }); continue; }
      const item = { name: nc.name, kind, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, line };
      seen.push({ name: nc.name, lat, lng });
      (nc.person ? ask : ok).push(item);
    }
    return { ok, ask, bad };
  }

  const KZ = { LM_KINDS, lmNameCheck, lmSrcCheck, lmKindFromText, lmSrcLine, tileXY, tileUrls, lmCsvEval, mDist };
  if (typeof module !== 'undefined' && module.exports) module.exports = KZ;
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof L === 'undefined' || typeof document === 'undefined') return;
  window.KZ = KZ;

  /* =========================================================
     見た目（CSS）
     ========================================================= */
  const css = document.createElement('style');
  css.textContent = `#map.leaflet-container{background:#fff}
body.kind-std .pin.st-plain{border-width:4px}
.bprev.std{background:linear-gradient(135deg,#EFE7D4 0 30%,#fff 30% 36%,#D8E6D0 36% 62%,#E88 62% 66%,#fff 66% 72%,#EFE7D4 72%)}
.lm-mark,.lm-label{background:none;border:0}
.lmchip{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:5px;background:#17324D;color:#fff;font:700 14px/1 var(--font,sans-serif);border:1.5px solid #fff;box-shadow:0 0 0 1px #17324D66;vertical-align:middle}
.lm-label span{position:absolute;left:0;top:14px;transform:translateX(-50%);white-space:nowrap;font-weight:700;font-size:14px;line-height:1.3;color:#17324D;pointer-events:none;
  text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 3px #fff,0 0 3px #fff}
body.simple .lm-label span{font-size:16px}
#lmLegend{margin-top:10px;border-top:2px solid var(--line);padding-top:8px}
#lmLegend .legendgrid{margin:6px 0}
.lmnear{color:var(--ink2);font-size:15px;font-weight:400}
.topen .tname small.lmnear{font-size:15px;color:var(--ink2)}
body.simple .lmnear,body.simple .topen .tname small.lmnear{font-size:16px}
.lmkinds{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
.lmkinds .choice{min-height:60px;flex-direction:row;justify-content:flex-start;gap:8px;padding:6px 10px;font-size:16px}
.lmrow{background:#fff;border:2px solid var(--line);border-radius:12px;margin-bottom:8px;overflow:hidden}
.lmhead{display:flex;align-items:center;gap:8px;width:100%;min-height:52px;padding:6px 10px;border:0;background:none;text-align:left;flex-wrap:wrap}
.lmhead b{overflow-wrap:anywhere}.lmhead small{color:var(--ink2);font-size:14px}
.lmacts{display:flex;gap:8px;flex-wrap:wrap;padding:0 10px 10px}
.lmsrc{font-size:13px;color:var(--ink2);margin:4px 0 0}
#s12kindBox{margin:6px 0}`;
  document.head.appendChild(css);

  /* =========================================================
     方向A：地図の種類（見やすい地図／地名の多い地図／写真）
     ========================================================= */
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const TILE_STD = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
  const TILE_CACHE = 'kuiki-tiles-v1';                      // sw.js と同じ入れ物
  const K = { done: false, lastMap: 'pale' };
  const kindKey = () => 'kuiki_basekind_' + (Store.data ? me().id : 'guest');
  const adminKind = () => (Store.data && Number(D().settings.mapStd) === 1 ? 'std' : 'pale');
  function wantKind() {
    const s = lsGet(kindKey());
    if (s === 'pale' || s === 'std' || s === 'photo') return s;      // 自分で選んだもの
    if (typeof UI !== 'undefined' && UI.base === 'photo') return 'photo';
    return adminKind();                                              // まだ選んでいない人は、係の決めたもの
  }
  function syncPaneOpacity() {
    if (!map) return;
    const p = map.getPane('basePane'); if (!p) return;
    const t = parseFloat(map.getPane('tilePane').style.opacity);     // 線引きの「地図の濃さ」（schedule/index が tilePane に付ける）
    const o = isFinite(t) ? t : 1;
    p.style.opacity = String(o * (baseName === 'std' ? 0.75 : 1));   // 層ぜんぶをまとめて薄くする（画像1枚ずつには付けない）
  }
  function setupKinds() {
    if (K.done || !map) return;
    K.done = true;
    map.createPane('basePane');
    map.getPane('basePane').style.zIndex = 200;
    Object.keys(baseLayers).forEach(k => { const l = baseLayers[k]; if (l && l.addTo && map.hasLayer(l)) map.removeLayer(l); });
    const mk = (url, nat, extra) => L.tileLayer(url, Object.assign({ pane: 'basePane', maxZoom: 20, maxNativeZoom: nat }, extra));
    baseLayers.pale = mk(TILE_PALE, 18, { crossOrigin: 'anonymous', errorTileUrl: BLANK, attribution: GSI_ATTR });
    baseLayers.std = mk(TILE_STD, 18, { crossOrigin: 'anonymous', errorTileUrl: BLANK, attribution: GSI_ATTR });
    baseLayers.photo = mk(TILE_PHOTO, 18, { attribution: GSI_ATTR });
    baseLayers.paleLow = mk(TILE_PALE, 16, { crossOrigin: 'anonymous', errorTileUrl: BLANK });  // 圏外で、くわしい画像がないとき見える「ぼやけた代わり」
    baseLayers.stdLow = mk(TILE_STD, 16, { crossOrigin: 'anonymous', errorTileUrl: BLANK });
    try { new MutationObserver(syncPaneOpacity).observe(map.getPane('tilePane'), { attributes: true, attributeFilter: ['style'] }); } catch (e) { /* 線引きの濃さだけ連動しない */ }
    applyBase(wantKind());
    lmEnsureLayer();
    lmLoad();
  }
  function applyBase(name) {
    if (!map || !baseLayers.std) return;
    if (name !== 'pale' && name !== 'std' && name !== 'photo') name = 'pale';
    Object.keys(baseLayers).forEach(k => { const l = baseLayers[k]; if (l && l.addTo && map.hasLayer(l)) map.removeLayer(l); });
    baseName = name;
    if (name === 'pale' || name === 'std') baseLayers[name + 'Low'].addTo(map);
    baseLayers[name].addTo(map);
    syncPaneOpacity();
    document.body.classList.toggle('kind-std', name === 'std');
    stdPrefetchSoon(3000);
  }
  /* index.html・各画面の setBase の呼び出しは「本人の選び」として覚える */
  window.setBase = function (name) {
    if (!map) return;
    try { if (Store.data && (name === 'pale' || name === 'std' || name === 'photo')) lsSet(kindKey(), name); } catch (e) { /* 覚えられなくても動く */ }
    applyBase(name);
  };
  /* 「写真にする／地図にする」：写真から戻るときは、直前の地図の種類にもどる */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#addBase');
    if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (baseName !== 'photo') K.lastMap = baseName;
    window.setBase(baseName === 'photo' ? K.lastMap : 'photo');
    if (typeof updateAddBar === 'function') updateAddBar();
  }, true);
  const _updateAddBar = window.updateAddBar;
  if (typeof _updateAddBar === 'function') {
    window.updateAddBar = function () {
      _updateAddBar.apply(this, arguments);
      const b = $('#addBase'); if (b) b.textContent = baseName === 'photo' ? '地図にする' : '写真にする';
    };
  }

  /* ---- 歯車の設定（地図の画面から開いたとき）：「地図／写真」を3つにする ---- */
  function patchBasePick() {
    const pale = document.querySelector('#sheet [data-ui="base"][data-v="pale"]');
    if (!pale || document.querySelector('#sheet [data-ui="base"][data-v="std"]')) return;
    pale.classList.toggle('on', baseName === 'pale');
    pale.setAttribute('aria-pressed', String(baseName === 'pale'));
    pale.innerHTML = '<i class="bprev pale"></i>見やすい地図';
    const std = pale.cloneNode(false);
    std.dataset.v = 'std';
    std.className = 'choice' + (baseName === 'std' ? ' on' : '');
    std.setAttribute('aria-pressed', String(baseName === 'std'));
    std.innerHTML = '<i class="bprev std"></i>地名の多い地図';
    pale.after(std);
    const box = pale.parentNode;
    if (box && box.classList.contains('two')) { box.classList.remove('two'); box.classList.add('three'); }
  }
  /* ---- S-12 の印刷の画面：地図の種類と、目印を入れるかをえらぶ ---- */
  const S12X = { kind: null, lm: true, cur: { kind: 'pale', lm: true } };
  function patchS12Sheet() {
    if (!document.getElementById('s12Back') || document.getElementById('s12kindBox')) return;
    const first = document.querySelector('#sheet [data-s12size]'); if (!first) return;
    const kind = S12X.kind || adminKind();
    first.parentNode.insertAdjacentHTML('afterend', `<div id="s12kindBox"><p class="q">地図</p>
      <div class="seg" role="group" aria-label="地図の種類">
        <button type="button" data-s12kind="pale" aria-pressed="${kind === 'pale'}">見やすい地図</button>
        <button type="button" data-s12kind="std" aria-pressed="${kind === 'std'}">地名の多い地図</button></div>
      <label class="check"><input type="checkbox" id="s12Lm"${S12X.lm ? ' checked' : ''}>目印を入れる</label></div>`);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-s12kind]'); if (!b) return;
    S12X.kind = b.dataset.s12kind;
    $$('#s12kindBox [data-s12kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 's12Lm') S12X.lm = e.target.checked; });

  /* ---- 画面の部品（#sheet）を作ったあとの付けたし ---- */
  const _setSheet = window.setSheet;
  window.setSheet = function () {
    const r = _setSheet.apply(this, arguments);
    try { patchBasePick(); patchS12Sheet(); patchPickRows(); } catch (e) { console.error(e); }
    return r;
  };

  /* ---- S-12：標準地図の画像・目印・出典 ---- */
  const _printS12 = window.printS12;
  if (typeof _printS12 === 'function') {
    window.printS12 = function () {
      S12X.cur = { kind: S12X.kind || adminKind(), lm: S12X.lm };
      return _printS12.apply(this, arguments);
    };
  }
  window.s12Tiles = function (v) {
    const tpl = S12X.cur.kind === 'std' ? TILE_STD : S12_TILE;
    const out = [];
    for (let tx = Math.floor(v.x / 256); tx <= Math.floor((v.x + v.w) / 256); tx++) {
      for (let ty = Math.floor(v.y / 256); ty <= Math.floor((v.y + v.h) / 256); ty++) {
        out.push({ url: tpl.replace('{z}', v.z).replace('{x}', tx).replace('{y}', ty), x: tx * 256 - v.x, y: ty * 256 - v.y });
      }
    }
    return out;
  };
  const _s12MapSvg = window.s12MapSvg;
  if (typeof _s12MapSvg === 'function') {
    window.s12MapSvg = function (c) {
      let s = _s12MapSvg.apply(this, arguments);
      try {
        if (S12X.cur.kind === 'std') s = s.replace('出典：国土地理院（淡色地図）', '出典：国土地理院（標準地図）');
        if (S12X.cur.lm && c && c.v) s = s12Landmarks(s, c);
      } catch (e) { console.error(e); }
      return s;
    };
  }
  function s12Landmarks(svg, c) {
    const v = c.v, k = v.k, f = n => Math.round(n * 10) / 10, mm = n => f(n * k);
    const P = (lat, lng) => { const p = s12Px(lat, lng, v.z); return [p[0] - v.x, p[1] - v.y]; };
    const list = [];
    LM.items.forEach(it => {
      const [x, y] = P(it.lat, it.lng);
      if (x > -mm(3) && y > -mm(3) && x < v.w + mm(3) && y < v.h + mm(3)) list.push({ it, x: f(x), y: f(y) });
    });
    if (!list.length) return svg;
    list.sort((a, b) => lmPri(a.it.kind) - lmPri(b.it.kind));
    const use = list.slice(0, 80), sz = mm(2.8);
    const marks = use.map(o => `<rect x="${f(o.x - sz / 2)}" y="${f(o.y - sz / 2)}" width="${sz}" height="${sz}" rx="${mm(0.5)}" fill="#17324D" stroke="#fff" stroke-width="${mm(0.25)}"/>` +
      `<text x="${o.x}" y="${f(o.y + mm(0.1))}" font-size="${mm(2)}" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${esc(lmKindMark(o.it.kind))}</text>`).join('');
    const halo = `stroke="#fff" stroke-width="${mm(0.7)}" paint-order="stroke" stroke-linejoin="round"`;
    const names = use.filter(o => o.it.kind === 'kaikan' || use.length <= 40).map(o => {
      const a = Array.from(o.it.name), t = a.length > 10 ? a.slice(0, 10).join('') + '…' : o.it.name;
      return `<text x="${o.x}" y="${f(o.y + mm(2))}" font-size="${mm(1.9)}" font-weight="700" fill="#17324D" text-anchor="middle" dominant-baseline="hanging" ${halo}>${esc(t)}</text>`;
    }).join('');
    // 印（四角）は家より下・名前は家より上（コンパスの前）に入れる
    let idx = svg.lastIndexOf('<image');
    idx = idx >= 0 ? svg.indexOf('/>', idx) + 2 : svg.indexOf('>') + 1;
    const eo = svg.indexOf('fill-rule="evenodd"/>');
    if (eo >= 0) idx = eo + 'fill-rule="evenodd"/>'.length;
    svg = svg.slice(0, idx) + marks + svg.slice(idx);
    const ci = svg.lastIndexOf('<g><circle cx=');
    return ci >= 0 ? svg.slice(0, ci) + names + svg.slice(ci) : svg.replace(/<\/svg>\s*$/, names + '</svg>');
  }
  const _s12FrontHtml = window.s12FrontHtml;
  if (typeof _s12FrontHtml === 'function') {
    window.s12FrontHtml = function () {
      let h = _s12FrontHtml.apply(this, arguments);
      try {
        const src = S12X.cur.lm ? lmSrcLine(LM.items) : '';
        if (src) h = h.replace(/<\/p>\s*<\/div>\s*$/, '<br>' + esc(src) + '</p></div>');
      } catch (e) { console.error(e); }
      return h;
    };
  }

  /* ---- 標準地図の画像を、必要な範囲だけ自動で保存する（保存は sw.js が行う） ----
     ・今の地図が「地名の多い地図」のときだけ取る。ズーム15〜18・区域のまわり150m・0.2秒ずつ・取ってあるものは取らない
     ・消す決まり：範囲から外れたもの（今の種類が標準のとき）／90日使っていないもの／全体2,000枚をこえたもの（必要な範囲は消さない） */
  const SP = { running: false, timer: 0, sig: '', sigAt: 0 };
  const SP_META = 'std_meta';
  function neededStd() {
    const boxes = [], pad = (pts) => {
      let s = 90, n = -90, w = 180, e = -180;
      pts.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
      const dLa = 150 / 110540, dLn = 150 / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
      boxes.push([s - dLa, w - dLn, n + dLa, e + dLn]);
    };
    const id = me().id;
    D().territories.forEach(t => { if (!t.dummy && okPoly(t.polygon) && myTerr(t)) pad(t.polygon); });
    activeCards().forEach(c => {
      if (c.by !== id && !isCardHelper(c)) return;
      const pts = [];
      (c.keys || []).forEach(k => { const h = houseById(parseKey(k)[0]); if (h) pts.push([h.lat, h.lng]); });
      if (pts.length) pad(pts);
    });
    const set = new Set();
    boxes.forEach(b => tileUrls(TILE_STD, b, [15, 16, 17, 18], 400).forEach(u => set.add(u)));
    return set;
  }
  function stdPrefetchSoon(ms) {
    clearTimeout(SP.timer);
    SP.timer = setTimeout(stdPrefetch, ms == null ? 8000 : ms);
  }
  async function stdPrefetch() {
    if (SP.running || !Store.data || !map || typeof caches === 'undefined') return;
    SP.running = true;
    try {
      const cache = await caches.open(TILE_CACHE);
      const need = neededStd();
      let meta = (await IDB.get(SP_META).catch(() => null)) || {};
      const now = Date.now();
      const cell = navigator.connection && (navigator.connection.type === 'cellular' || navigator.connection.saveData);
      const sig = need.size + ':' + [...need][0] + ':' + [...need].pop();
      const fresh = sig === SP.sig && now - SP.sigAt < 10 * 60000;
      if (baseName === 'std' && !cell && !fresh && navigator.onLine !== false) {
        for (const u of need) {
          if (navigator.onLine === false || baseName !== 'std') break;
          if (await cache.match(u, { ignoreVary: true })) { meta[u] = now; continue; }
          try {
            const r = await fetch(u, { mode: 'cors' });
            if (r.ok) { await r.arrayBuffer(); meta[u] = now; }   // sw.js が、区域のまわりのものだけ保存する
          } catch (e) { break; }                                    // 電波が切れたら止める（次に開いたとき続きから）
          await new Promise(r => setTimeout(r, 200));
        }
        SP.sig = sig; SP.sigAt = Date.now();
      }
      // 消す決まり
      const del = new Set();
      Object.keys(meta).forEach(u => {
        if (need.has(u)) return;
        if (baseName === 'std') del.add(u);                         // 範囲から外れた（いまも標準を使っている人だけ）
        else if (now - meta[u] > 90 * 86400000) del.add(u);
      });
      Object.keys(meta).forEach(u => { if (!need.has(u) && now - meta[u] > 90 * 86400000) del.add(u); });
      const total = (await cache.keys()).length;
      if (total - del.size > 2000) {                                // 全体の上限（2つの種類をあわせて数える）
        const rest = Object.keys(meta).filter(u => !need.has(u) && !del.has(u)).sort((a, b) => meta[a] - meta[b]);
        for (let i = 0; i < rest.length && total - del.size > 2000; i++) del.add(rest[i]);
      }
      for (const u of del) { await cache.delete(u, { ignoreVary: true }).catch(() => {}); delete meta[u]; }
      await IDB.set(SP_META, meta).catch(() => {});
    } catch (e) { console.warn(e); } finally { SP.running = false; }
  }
  window.addEventListener('online', () => stdPrefetchSoon(2000));

  /* ---- 係の設定：伝道者の地図の「はじめの種類」 ---- */
  const lockedNow = () => { const s = document.getElementById('alockScr'); return !!s && !s.hidden; };
  function paintMapKindBox() {
    const pane = document.querySelector('[data-apane="set"]'); if (!pane || lockedNow()) return;
    let box = document.getElementById('adMapKind');
    if (!box) {
      box = document.createElement('div'); box.id = 'adMapKind';
      const ref = document.getElementById('adLockBox') || document.getElementById('adOpsBox');
      pane.insertBefore(box, ref ? ref.nextSibling : pane.firstChild);
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-mapstd]'); if (!b) return;
        D().settings.mapStd = Number(b.dataset.mapstd);
        Store.save(); renderAll(); toast('設定を変えました');
      });
    }
    const on = Number(D().settings.mapStd) === 1;
    box.innerHTML = `<h2 class="sec">地図の種類</h2>
      <div class="setrow"><span>伝道者の地図のはじめの種類<br><small class="hint">自分で選んでいない人の地図に使います。「地名の多い地図」は地名や道が濃く出るので、地図を少し薄くして使います。写真はそのままです</small></span>
        <div class="seg" role="group" aria-label="伝道者の地図のはじめの種類">
          <button type="button" data-mapstd="0" aria-pressed="${!on}">見やすい地図</button>
          <button type="button" data-mapstd="1" aria-pressed="${on}">地名の多い地図</button></div></div>`;
  }

  /* =========================================================
     方向B：目印
     ========================================================= */
  const LM = { items: [], rev: 0, lastPull: 0, pulling: false, started: false };
  const LMUI = { kind: '', q: '', open: '' };
  let lmGroup = null, areaMemo = null, lmTimer = 0, persistTm = 0;
  const lmOn = () => lsGet('kuiki_lm_on') !== '0';

  function lmMerge(items) {
    const m = new Map(LM.items.map(x => [x.id, x]));
    (items || []).forEach(x => {
      if (!x || !x.id) return;
      if (x.del) { m.delete(String(x.id)); return; }
      const lat = Number(x.lat), lng = Number(x.lng);
      if (LM_IDS.indexOf(x.kind) < 0 || !isFinite(lat) || !isFinite(lng) || typeof x.name !== 'string') return;
      m.set(String(x.id), { id: String(x.id), name: x.name, kind: x.kind, lat, lng, src: String(x.src || ''), rev: Number(x.rev) || 0 });
    });
    LM.items = [...m.values()];
    areaMemo = null;
  }
  function lmPersist() {
    clearTimeout(persistTm);
    persistTm = setTimeout(() => { try { IDB.set('lm_v1', { rev: LM.rev, items: LM.items }).catch(() => {}); } catch (e) { /* 端末に残せなくても動く */ } }, 500);
  }
  function lmLoad() {
    IDB.get('lm_v1').then(v => {
      if (v && Array.isArray(v.items) && !LM.items.length) { LM.items = v.items; LM.rev = Number(v.rev) || 0; areaMemo = null; lmRender(); lmLegendPaint(); lmRepaintViews(); }
    }).catch(() => {});
  }
  function lmRepaintViews() { try { if (currentView === 'cards') renderCards(); } catch (e) { /* 次の描き直しで出る */ } }
  async function lmPull(force) {
    if (!LIVE || !Store.data || LM.pulling) return;
    if (!force && Date.now() - LM.lastPull < 3 * 60000) return;
    LM.pulling = true; LM.lastPull = Date.now();
    try {
      const body = { since: LM.rev };
      const hall = window.KUIKI_CONFIG && window.KUIKI_CONFIG.hall;
      if (isAdmin() && Array.isArray(hall) && hall.length === 2) body.hall = [Number(hall[0]), Number(hall[1])];
      let j = await api('lm_pull', body);
      if (Number(j.rev) < LM.rev) { LM.items = []; LM.rev = 0; j = await api('lm_pull', { since: 0 }); } // サーバーの番号が小さい＝作り直された
      lmMerge(j.items); LM.rev = Math.max(LM.rev, Number(j.rev) || 0);
      lmPersist(); lmRender(); lmLegendPaint(); lmRepaintViews();
      if (document.getElementById('adLmBox')) paintLmList();
    } catch (e) { /* 古いサーバー・電波がないとき：保存してある目印をそのまま使う */ } finally { LM.pulling = false; }
  }
  /* 係：登録・直す（chunk 300件ずつ）。試作版は、この端末だけに残す */
  async function lmSend(items, opt) {
    const saved = [], rejected = [];
    let same = 0; // 同じ目印（名前・種類・場所）がもうあって、サーバーが足さなかった数（点検②V11）
    if (!LIVE) {
      items.forEach(it => { const id = it.id || 'l' + uid(); const rev = ++LM.rev; saved.push({ id, name: it.name, kind: it.kind, lat: it.lat, lng: it.lng, src: it.src || '', rev }); });
      lmMerge(saved); lmPersist(); lmRender(); lmLegendPaint();
      return { saved, rejected, same };
    }
    for (let i = 0; i < items.length; i += 300) {
      const chunk = items.slice(i, i + 300).map(x => ({ id: x.id || '', name: x.name, kind: x.kind, lat: x.lat, lng: x.lng, src: x.src || '' }));
      const j = await api('lm_save', { items: chunk, import: !!(opt && opt.csv) }, { timeout: 90000 });
      (j.items || []).forEach(x => saved.push(x));
      (j.rejected || []).forEach(x => rejected.push(x));
      same += Number(j.same) || 0;
      LM.rev = Math.max(LM.rev, Number(j.rev) || 0);
    }
    lmMerge(saved); lmPersist(); lmRender(); lmLegendPaint(); lmRepaintViews();
    if (document.getElementById('adLmBox')) paintLmList(); // 係の画面の目印の一覧と件数も、すぐ新しくする
    return { saved, rejected, same };
  }
  async function lmDelSend(id) {
    if (LIVE) { const j = await api('lm_del', { id }); LM.rev = Math.max(LM.rev, Number(j.rev) || 0); }
    else LM.rev++;
    lmMerge([{ id, del: 1 }]); lmPersist(); lmRender(); lmLegendPaint(); lmRepaintViews();
    if (document.getElementById('adLmBox')) paintLmList();
  }

  /* ---- 地図に出す ---- */
  function lmEnsureLayer() {
    if (lmGroup || !map) return;
    map.createPane('lmPane');      map.getPane('lmPane').style.zIndex = 350;      map.getPane('lmPane').style.pointerEvents = 'none';        // 家の印・区域の線より下
    map.createPane('lmLabelPane'); map.getPane('lmLabelPane').style.zIndex = 655; map.getPane('lmLabelPane').style.pointerEvents = 'none';   // 名前の文字は家の印より上
    lmGroup = L.layerGroup().addTo(map);
    map.on('moveend zoomend', () => { clearTimeout(lmTimer); lmTimer = setTimeout(lmRender, 60); });   // 家の印の描き直しとは別に動かす
  }
  function lmRender() {
    if (!map || !lmGroup) return;
    lmGroup.clearLayers();
    if (!lmOn() || !LM.items.length) return;
    const z = map.getZoom(), b = map.getBounds().pad(0.25), vis = typeof rotVisTest === 'function' ? rotVisTest(0.25) : null;
    let cand = LM.items.filter(it => (z >= 15 || it.kind === 'kaikan') && b.contains([it.lat, it.lng]) && (!vis || vis(it.lat, it.lng)));
    cand.sort((a, c) => lmPri(a.kind) - lmPri(c.kind));
    cand = cand.slice(0, 200);
    const names = z >= 16;
    cand.forEach(it => {
      L.marker([it.lat, it.lng], { pane: 'lmPane', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'lm-mark', html: `<span class="lmchip">${esc(lmKindMark(it.kind))}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(lmGroup);
      if (names) {
        const a = Array.from(it.name), t = a.length > 10 ? a.slice(0, 10).join('') + '…' : it.name;
        L.marker([it.lat, it.lng], { pane: 'lmLabelPane', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'lm-label', html: `<span data-notr>${esc(t)}</span>`, iconSize: [0, 0] }) }).addTo(lmGroup);
      }
    });
  }
  /* 凡例（「?」）の中：目印を出す（入／切）・印の見かた・出典 */
  function lmLegendPaint() {
    const lg = document.getElementById('legend'); if (!lg) return;
    let b = document.getElementById('lmLegend');
    if (!b) {
      b = document.createElement('div'); b.id = 'lmLegend'; lg.appendChild(b);
      b.addEventListener('change', e => { if (e.target.id === 'lmOnChk') { lsSet('kuiki_lm_on', e.target.checked ? '1' : '0'); lmRender(); } });
    }
    const src = lmSrcLine(LM.items);
    b.innerHTML = `<label class="check"><input type="checkbox" id="lmOnChk"${lmOn() ? ' checked' : ''}>目印を出す</label>` +
      (isSimple() ? '<p class="hint">紺の四角は、会館・学校などの目印です</p>'
        : `<div class="legendgrid">${LM_KINDS.map(k => `<span><span class="lmchip">${k[2]}</span>${k[1]}</span>`).join('')}</div>`) +
      (src ? `<p class="hint">${esc(src)}</p>` : '');
  }
  const _renderLegend = window.renderLegend;
  if (typeof _renderLegend === 'function') {
    window.renderLegend = function () { const r = _renderLegend.apply(this, arguments); try { lmLegendPaint(); } catch (e) { console.error(e); } return r; };
  }

  /* ---- 区域の「目安の場所」：○○小学校のあたり ---- */
  function lmAreaMap() {
    const terrs = polyTerrs ? polyTerrs() : [];
    const key = LM.rev + ':' + LM.items.length + ':' + terrs.length + ':' + terrs.reduce((a, t) => a + t.polygon.length, 0);
    if (areaMemo && areaMemo.key === key) return areaMemo.m;
    const m = new Map();
    if (LM.items.length) {
      terrs.forEach(t => {
        const poly = t.polygon, bb = bboxOf(poly), pad = 0.0035;
        let best = null;
        LM.items.forEach(it => {
          if (it.lat < bb[0] - pad || it.lat > bb[1] + pad || it.lng < bb[2] - pad || it.lng > bb[3] + pad) return;
          let d = 0;
          if (!inPoly(it.lat, it.lng, poly)) {
            const cos = Math.cos(it.lat * Math.PI / 180), p = mXY([it.lat, it.lng], cos);
            d = Infinity;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(p, mXY(poly[j], cos), mXY(poly[i], cos)));
            if (d > 300) return;
          }
          const dc = mDist(center(poly), [it.lat, it.lng]);
          if (!best || lmPri(it.kind) < lmPri(best.kind) || (lmPri(it.kind) === lmPri(best.kind) && dc < best.dc)) best = { name: it.name, kind: it.kind, dc };
        });
        if (best) m.set(t.id, best.name);
      });
    }
    areaMemo = { key, m };
    return m;
  }
  const lmNear = tid => { try { return lmAreaMap().get(tid) || ''; } catch (e) { return ''; } };
  const _cardHtml = window.cardHtml;
  if (typeof _cardHtml === 'function') {
    window.cardHtml = function (t) {
      let h = _cardHtml.apply(this, arguments);
      try {
        const nm = t && lmNear(t.id);
        if (nm && typeof h === 'string') h = h.replace(/(<span class="tname"><b>[\s\S]*?<\/b>)/, m => m + '<small class="lmnear" data-notr-part>' + esc(nm) + 'のあたり</small>');
      } catch (e) { console.error(e); }
      return h;
    };
  }
  function patchPickRows() {   // 「区域をもらう」の一覧：名前のあとに「○○のあたり」
    $$('#sheet .pick').forEach(row => {
      if (row.querySelector('.lmnear')) return;
      const btn = row.querySelector('[data-take],[data-ask]'), tid = btn && (btn.dataset.take || btn.dataset.ask), nm = tid && lmNear(tid), nb = row.querySelector('div > b');
      if (nm && nb) nb.insertAdjacentHTML('afterend', `<span class="lmnear"> ${esc(nm)}のあたり</span>`);
    });
  }

  /* ---- 目印をえらぶ（おすすめの距離の起点などから使えるように） ---- */
  function pickLandmark(cb) {
    const paint = q => {
      const list = LM.items.filter(x => !q || x.name.indexOf(q) >= 0).sort((a, b) => lmPri(a.kind) - lmPri(b.kind) || a.name.localeCompare(b.name, 'ja')).slice(0, 40);
      $('#lmPickList').innerHTML = list.length ? list.map(x => `<button type="button" class="btn block" data-lmpick="${esc(x.id)}"><span class="lmchip">${esc(lmKindMark(x.kind))}</span> <span data-notr>${esc(x.name)}</span></button>`).join('')
        : '<p class="muted">目印がありません。</p>';
    };
    setSheet(headHtml(null, '目印からえらぶ', '') + `<label class="field"><span>名前でさがす</span><input type="text" id="lmPickQ" autocomplete="off" placeholder="名前の一部を入れる"></label><div id="lmPickList"></div><button class="btn block" data-close>やめる</button>`);
    paint('');
    $('#lmPickQ').oninput = e => paint(e.target.value.trim());
    $('#lmPickList').onclick = e => {
      const b = e.target.closest('[data-lmpick]'); if (!b) return;
      const it = LM.items.find(x => x.id === b.dataset.lmpick); closeSheet(); if (it && cb) cb(it);
    };
  }
  KZ.pickLandmark = pickLandmark; KZ.landmarks = () => LM.items.slice(); KZ.nearName = lmNear; KZ.baseKind = () => baseName;

  /* =========================================================
     係：登録・直す・消す（地図の長押し／一覧／CSV）
     ========================================================= */
  const PRIV = '個人の家や、人の名前は登録しないでください';
  const _openDirPopup = window.openDirPopup;
  if (typeof _openDirPopup === 'function') {
    window.openDirPopup = function (latlng) {
      _openDirPopup.apply(this, arguments);
      try {
        if (!isAdmin() || lockedNow()) return;
        const p = map._popup; if (!p || !p.getContent) return;
        const c = p.getContent();
        if (typeof c !== 'string' || c.indexOf('data-lmreg') >= 0) return;
        p.setContent(c + `<div style="margin-top:8px"><button type="button" class="btn primary" data-lmreg="${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}">ここに目印を登録</button></div>`);
      } catch (e) { console.error(e); }
    };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-lmreg]'); if (!b || !isAdmin()) return;
    const [lat, lng] = b.dataset.lmreg.split(',').map(Number);
    try { map.closePopup(); } catch (x) { /* 閉じられなくてもよい */ }
    openLmForm({ lat, lng });
  });
  function openLmForm(opt) {
    const it = opt.item || null;
    let kind = it ? it.kind : '';
    const pos = it ? [it.lat, it.lng] : [Math.round(opt.lat * 1e6) / 1e6, Math.round(opt.lng * 1e6) / 1e6];
    setSheet(headHtml(null, it ? '目印を直す' : 'ここに目印を登録', '') + `
      <div class="notice warn">${PRIV}</div>
      <label class="field"><span>名前（20文字まで）</span><input type="text" id="lmName" maxlength="60" autocomplete="off" value="${esc(it ? it.name : '')}"></label>
      <p class="q">種類</p>
      <div class="lmkinds">${LM_KINDS.map(k => `<button type="button" class="choice${kind === k[0] ? ' on' : ''}" data-lmk="${k[0]}" aria-pressed="${kind === k[0]}"><span class="lmchip">${k[2]}</span>${k[1]}</button>`).join('')}</div>
      ${it ? '<button class="btn block" id="lmMove">場所を地図で動かす</button>' : ''}
      <button class="btn primary block" id="lmSave">${it ? '保存する' : '登録する'}</button>
      <button class="btn block" data-close>やめる</button>`);
    $$('#sheet [data-lmk]').forEach(b => b.onclick = () => {
      kind = b.dataset.lmk;
      $$('#sheet [data-lmk]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    });
    const go = async (lat, lng) => {
      const nc = lmNameCheck($('#lmName').value);
      if (!nc.ok) { toast(nc.why); return false; }
      if (!kind) { toast('種類をえらんでください'); return false; }
      if (nc.person && !await ask('', { title: '個人の家ではありませんか？', body: '名前に「さん」「様」「宅」「邸」が入っています。個人の家や、人の名前は登録できません。', ok: '個人の家ではない（登録する）', cancel: '直す', danger: false })) return false;
      closeSheet();
      try {
        const r = await lmSend([{ id: it ? it.id : '', name: nc.name, kind, lat, lng, src: it ? it.src : '' }]);
        toast(r.rejected.length ? (r.rejected[0].why || '登録できませんでした') : (it ? '目印を直しました' : '目印を登録しました'));
      } catch (err) { toast('登録できませんでした。通信を確認してください'); }
      return true;
    };
    $('#lmSave').onclick = () => go(pos[0], pos[1]);
    if ($('#lmMove')) $('#lmMove').onclick = async () => {
      const nc = lmNameCheck($('#lmName').value);
      if (!nc.ok) { toast(nc.why); return; }
      if (!kind) { toast('種類をえらんでください'); return; }
      closeSheet(); showView('map'); firstMapShow = false;
      setTimeout(() => map.setView([it.lat, it.lng], 18), 120);
      toast('新しい場所をタップしてください');
      pickPlace = ll => {
        lmSend([{ id: it.id, name: nc.name, kind, lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6, src: it.src }])
          .then(r => toast(r.rejected.length ? (r.rejected[0].why || '直せませんでした') : '目印を直しました')).catch(() => toast('直せませんでした。通信を確認してください'));
      };
    };
  }
  async function lmDelete(id) {
    const it = LM.items.find(x => x.id === id); if (!it) return;
    if (!await ask('「' + it.name + '」を消します。よろしいですか？')) return;
    try {
      await lmDelSend(id);
      toast('目印を消しました', () => { lmSend([{ id, name: it.name, kind: it.kind, lat: it.lat, lng: it.lng, src: it.src }]).then(() => toast('もどしました')).catch(() => toast('もどせませんでした')); });
    } catch (e) { toast('消せませんでした。通信を確認してください'); }
  }
  /* 区域のまわり（全区域を囲む四角＋2km）。区域がなければ null */
  function lmBounds() {
    const ts = polyTerrs(); if (!ts.length) return null;
    let s = 90, n = -90, w = 180, e = -180;
    ts.forEach(t => t.polygon.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }));
    const dLa = 2000 / 110540, dLn = 2000 / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
    return [s - dLa, w - dLn, n + dLa, e + dLn];
  }
  /* ---- 係の画面「設定・データ」：地図の目印 ---- */
  function lmListHtml() {
    let list = LM.items.slice().sort((a, b) => lmPri(a.kind) - lmPri(b.kind) || a.name.localeCompare(b.name, 'ja'));
    if (LMUI.kind) list = list.filter(x => x.kind === LMUI.kind);
    if (LMUI.q) list = list.filter(x => x.name.indexOf(LMUI.q) >= 0);
    if (!list.length) return '<div class="empty">目印がありません。</div>';
    return list.slice(0, 60).map(x => `<div class="lmrow"><button type="button" class="lmhead" data-lmopen="${esc(x.id)}" aria-expanded="${LMUI.open === x.id}">
        <span class="lmchip">${esc(lmKindMark(x.kind))}</span><b data-notr>${esc(x.name)}</b><small>${esc(lmKindName(x.kind))}${x.src ? '・<span data-notr>' + esc(x.src) + '</span>' : ''}</small></button>
        ${LMUI.open === x.id ? `<div class="lmacts"><button type="button" class="btn small" data-lmmap="${esc(x.id)}">地図で見る</button><button type="button" class="btn small" data-lmedit="${esc(x.id)}">直す</button><button type="button" class="btn small danger" data-lmdel="${esc(x.id)}">消す</button></div>` : ''}</div>`).join('') +
      (list.length > 60 ? `<p class="muted">ほか ${list.length - 60}件。種類やさがす欄で絞りこんでください。</p>` : '');
  }
  function paintLmList() {
    const l = document.getElementById('lmList'); if (l) l.innerHTML = lmListHtml();
    const c = document.getElementById('lmCount'); if (c) c.textContent = LM.items.length + '件';
    $$('#lmChips [data-lmf]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.lmf || '') === LMUI.kind)));
  }
  function paintLmAdmin() {
    const pane = document.querySelector('[data-apane="set"]'); if (!pane || lockedNow()) return;
    let box = document.getElementById('adLmBox');
    if (box) { paintLmList(); return; }
    box = document.createElement('div'); box.id = 'adLmBox';
    const ref = document.getElementById('adMapKind') || document.getElementById('adLockBox') || document.getElementById('adOpsBox');
    pane.insertBefore(box, ref ? ref.nextSibling : pane.firstChild);
    box.innerHTML = `<h2 class="sec">地図の目印（<span id="lmCount">${LM.items.length}件</span>）</h2>
      <p class="hint">会館・学校・店など、だれでも分かる公の場所だけです。登録は、地図を長押しして「ここに目印を登録」を押します。<br>${PRIV}。</p>
      <div class="chips" id="lmChips" role="group" aria-label="種類で絞りこむ">
        <button type="button" class="chip" data-lmf="" aria-pressed="true">すべて</button>
        ${LM_KINDS.map(k => `<button type="button" class="chip" data-lmf="${k[0]}" aria-pressed="false">${k[1]}</button>`).join('')}</div>
      <label class="field"><span>名前でさがす</span><input type="text" id="lmQ" autocomplete="off" placeholder="名前の一部を入れる"></label>
      <div id="lmList"></div>
      <h3 class="sub">まとめて取りこむ（CSV）</h3>
      <p class="hint">形：名前,種類,緯度,経度（1行目は見出し）。種類は、会館・学校・公民館・集会所・店・公園・役所・病院・バス停・その他のどれかです。</p>
      <label class="btn">CSVをえらぶ<input type="file" id="lmCsv" hidden></label>`;
    paintLmList();
    box.addEventListener('click', e => {
      const q = s => e.target.closest(s);
      let x;
      if ((x = q('[data-lmf]'))) { LMUI.kind = x.dataset.lmf || ''; paintLmList(); }
      else if ((x = q('[data-lmopen]'))) { LMUI.open = LMUI.open === x.dataset.lmopen ? '' : x.dataset.lmopen; paintLmList(); }
      else if ((x = q('[data-lmmap]'))) { const it = LM.items.find(i => i.id === x.dataset.lmmap); if (it) { showView('map'); firstMapShow = false; setTimeout(() => map.setView([it.lat, it.lng], 18), 150); } }
      else if ((x = q('[data-lmedit]'))) { const it = LM.items.find(i => i.id === x.dataset.lmedit); if (it) openLmForm({ item: it }); }
      else if ((x = q('[data-lmdel]'))) lmDelete(x.dataset.lmdel);
    });
    box.addEventListener('input', e => { if (e.target.id === 'lmQ') { LMUI.q = e.target.value.trim(); paintLmList(); } });
    box.addEventListener('change', e => { if (e.target.id === 'lmCsv') { const f = e.target.files[0]; e.target.value = ''; if (f) lmImportFile(f); } });
  }
  async function lmImportFile(file) {
    let text;
    try {
      const buf = await file.arrayBuffer();
      text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('\uFFFD')) { try { text = new TextDecoder('shift_jis').decode(buf); } catch (e) { /* そのまま */ } }
    } catch (e) { infoSheet('ファイルを読めませんでした', 'CSVのファイルをえらんでください。'); return; }
    const res = lmCsvEval(parseCsvText(text.replace(/^\uFEFF/, '')), LM.items, lmBounds());
    openLmImport(res, file.name || '');
  }
  function openLmImport(res, fname) {
    const kn = k => lmKindName(k);
    setSheet(headHtml(null, '目印をまとめて取りこむ', esc(fname)) + `
      <div class="notice warn">
        <p>国土数値情報など、出典を書けば使ってよいと書かれたデータを使ってください</p>
        <p>データごとの使える条件（商用不可などがないか）を確かめてください</p>
        <p>OpenStreetMap・Google マップのデータは使わないでください</p></div>
      <label class="field"><span>出典（必ず入れてください）</span><input type="text" id="lmSrc" maxlength="40" autocomplete="off" placeholder="例：国土数値情報（国土交通省）"></label>
      <p class="q">取りこむ前の確かめ</p>
      <p>取りこめる <b>${res.ok.length}件</b>${res.ask.length ? `　確かめが必要 <b>${res.ask.length}件</b>` : ''}${res.bad.length ? `　取りこまない <b>${res.bad.length}件</b>` : ''}</p>
      ${res.ok.length ? `<p class="muted">最初の5行：</p><ul>${res.ok.slice(0, 5).map(x => `<li>行${x.line}　<b data-notr>${esc(x.name)}</b>（${esc(kn(x.kind))}）</li>`).join('')}</ul>` : ''}
      ${res.ask.length ? `<p class="q">個人の家ではありませんか？</p><p class="hint">名前に「さん」「様」「宅」「邸」が入っている行です。個人の家ではないものだけ、チェックを入れてください（はじめは外れています）。</p>
        ${res.ask.map((x, i) => `<label class="check"><input type="checkbox" data-lmask="${i}"><span>行${x.line}　<b data-notr>${esc(x.name)}</b>（${esc(kn(x.kind))}）</span></label>`).join('')}` : ''}
      ${res.bad.length ? `<details class="more"><summary>取りこまない行（${res.bad.length}件）</summary><ul>${res.bad.slice(0, 30).map(x => `<li>行${x.line}：${esc(x.why)}</li>`).join('')}</ul>${res.bad.length > 30 ? `<p class="muted">ほか ${res.bad.length - 30}件</p>` : ''}</details>` : ''}
      <button class="btn primary block" id="lmImpGo">取りこむ</button>
      <button class="btn block" data-close>やめる</button>`);
    $('#lmImpGo').onclick = async () => {
      const sc = lmSrcCheck($('#lmSrc').value);
      if (!sc.ok) { toast(sc.why); return; }
      const items = res.ok.concat(res.ask.filter((x, i) => { const c = document.querySelector(`#sheet [data-lmask="${i}"]`); return c && c.checked; }));
      if (!items.length) { toast('取りこむ目印がありません'); return; }
      closeSheet();
      toast('取りこんでいます…');
      try {
        const r = await lmSend(items.map(x => ({ name: x.name, kind: x.kind, lat: x.lat, lng: x.lng, src: sc.src })), { csv: true });
        // 同じ目印がもうあった分は足さない（取りこみの押し直し・同じ一覧の取りこみ直しで、目印を2つにしない）
        toast(`${r.saved.length - r.same}件を取りこみました${r.same ? `。同じ目印がもうあった${r.same}件は、足していません` : ''}${r.rejected.length ? `（サーバーが外したもの ${r.rejected.length}件）` : ''}`);
      } catch (e) { toast('取りこめませんでした。通信を確認してください'); }
    };
  }

  /* =========================================================
     つなぎ込み
     ========================================================= */
  const _initMap = window.initMap;
  window.initMap = function () {
    const r = _initMap.apply(this, arguments);
    try { setupKinds(); } catch (e) { console.error(e); }
    return r;
  };
  const _renderAll = window.renderAll;
  window.renderAll = function () {
    const r = _renderAll.apply(this, arguments);
    try {
      if (Store.data && map && K.done) {
        if (!LM.started) {
          LM.started = true; lmPull(true);
          setInterval(() => { if (!document.hidden) lmPull(false); }, 5 * 60000);
          document.addEventListener('visibilitychange', () => { if (!document.hidden) lmPull(false); });
        }
        if (!lsGet(kindKey())) { const w = wantKind(); if (w !== baseName) applyBase(w); }   // 係が「はじめの種類」を変えたとき
        stdPrefetchSoon(30000);
      }
    } catch (e) { console.error(e); }
    return r;
  };
  const _renderAdmin = window.renderAdmin;
  window.renderAdmin = function () {
    const r = _renderAdmin.apply(this, arguments);
    try { if (isAdmin() && adPane === 'set') { paintMapKindBox(); paintLmAdmin(); } } catch (e) { console.error(e); }
    return r;
  };
  const _perf = window.runPerfCheck;
  if (typeof _perf === 'function') {
    window.runPerfCheck = function () {
      _perf.apply(this, arguments);
      try {
        const tb = document.querySelector('#sheet table.slots'); if (!tb) return;
        const t0 = performance.now(); for (let i = 0; i < 3; i++) lmRender();
        const ms = (performance.now() - t0) / 3;
        const mark = ms < 100 ? '◎ 速い' : ms < 300 ? '○ ふつう' : ms < 1000 ? '△ 少し待つ' : '× 重い';
        tb.insertAdjacentHTML('beforeend', `<tr><th style="text-align:left">目印の描画（${LM.items.length}件）</th><td>${Math.round(ms)}ms</td><td>${mark}</td></tr>`);
      } catch (e) { console.error(e); }
    };
  }

  /* 画面ができたあとに読み込まれたとき（試作版など） */
  if (typeof map !== 'undefined' && map) { try { setupKinds(); lmLegendPaint(); } catch (e) { console.error(e); } }
})();
