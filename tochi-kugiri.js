/* =========================================================
   tochi-kugiri.js  区域マップ：土地の区切り（登記所備付地図の筆の線）を地図とS-12に出す（2026-11-13）

   ・データは chiban/（法務省の登記所備付地図を AIGID が GeoJSON にしたもの・CC BY）。kyohi.js が住所しらべに
     使っているのと同じ表を、こちらは「線」として地図に描く。地番の数字は出さない（所有者しらべにつながるため）
   ・出すとき：区域3個分以下まで拡大したとき（拒否の「拒」の印と同じ目安）。線引き中（区域の線・特別区域の分け方）は出さない
   ・層：家の印・区域の線・目印より下（zIndex 330・タップを通す）。薄い細線で、背景としてだけ見せる
   ・凡例：「土地の区切りを出す」の入/切（端末ごと・はじめは入）と、目安の注意・出典（CC BY の表示）
   ・保存：読んだ字のファイルは IndexedDB に版（asof）つきで残す（圏外でも出る・通信を減らす）。
     自分の区域・持っているカードにかかる字は、起動のあとに先読みする（1日1回）
   ・S-12・区域カードの「印刷」：s12Load を包んで必要な字を先に読み、s12MapSvg を包んで家より下に線を足す。
     印刷の画面に「土地の区切りを入れる」（はじめは入）。出典の行に登記所備付地図を足す
   ・表のない市町村（配布パックの会衆など）では、何も出ない・何も足さない（chiban/index.json が無ければ静かに休む）
   ========================================================= */
(function () {
  'use strict';

  /* =========================================================
     純粋な部品（画面がなくても動く。確かめ用に外へも出す）
     ========================================================= */
  /* 範囲 [南, 西, 北, 東] どうしが重なるか */
  const boxHit = (a, b) => !!a && !!b && !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  /* 符号化した土地（[地番, 緯度×1e6, 経度×1e6, 差…]）→ { ring: [[lat,lng]…]（閉じた線）, b: 範囲 } */
  function decodeFude(e) {
    const cy = e[1], cx = e[2], ring = [];
    let s = Infinity, w = Infinity, n = -Infinity, x = -Infinity;
    for (let i = 3; i + 1 < e.length; i += 2) {
      const la = (cy + e[i]) / 1e6, ln = (cx + e[i + 1]) / 1e6;
      ring.push([la, ln]);
      if (la < s) s = la; if (la > n) n = la;
      if (ln < w) w = ln; if (ln > x) x = ln;
    }
    if (ring.length < 3) return null;
    ring.push(ring[0]); // 閉じる
    return { ring, b: [s, w, n, x] };
  }
  /* 字のファイル（{p:[…]}）→ 土地の一覧（範囲つき） */
  const decodeAza = j => ((j && j.p) || []).map(decodeFude).filter(Boolean);
  const TK_API = { boxHit, decodeFude, decodeAza };
  if (typeof module !== 'undefined' && module.exports) module.exports = TK_API;
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof L === 'undefined' || typeof document === 'undefined') return;

  /* =========================================================
     データ（chiban/）の読み込みと保存
     ・top：chiban/index.json（市町村と範囲）。cidx：市町村ごとの index.json（字と範囲）
     ・字のファイルは IndexedDB（tk:f:<コード>/<字コード>）に版つきで保存し、圏外はそこから読む
     ========================================================= */
  const TK = {
    top: undefined,          // undefined＝まだ、null＝無い（この会衆には表がない）
    cidx: {},                // コード → index.json（読み込み中は Promise）
    azas: new Map(),         // '<コード>/<字コード>' → 土地の一覧（読み込み中は 'loading'、失敗は 'bad'）
    bad: 0,                  // 読めなかった字のファイルの数（紙の予備ロボットが見る）
    s12: true,               // S-12・区域カードの印刷に入れるか（印刷の画面のチェック）
    cur12: true              // 今の印刷で入れるか（printS12 を押したときの値）
  };
  const idbOk = () => typeof IDB !== 'undefined' && window.indexedDB;
  const fetchJson = path => fetch('chiban/' + path).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });

  async function tkTop() {
    if (TK.top !== undefined) return TK.top;
    TK.top = (async () => {
      try {
        const j = await fetchJson('index.json');
        if (idbOk()) IDB.set('tk:top', j).catch(() => {});
        return j && j.munis ? j : null;
      } catch (e) {
        try { const c = idbOk() ? await IDB.get('tk:top') : null; if (c && c.munis) return c; } catch (x) { /* 下へ */ }
        // 404＝表がない会衆（もう聞かない）。それ以外（電波がないなど）は、1分後にもう一度聞けるようにする（監査 Minor3）
        if (!/http 404/.test(String(e && e.message))) setTimeout(() => { if (TK.top === null) TK.top = undefined; }, 60000);
        return null;
      }
    })();
    TK.top = await TK.top;
    return TK.top;
  }
  async function tkCidx(code, asof) {
    if (!TK.cidx[code]) {
      TK.cidx[code] = (async () => {
        try {
          const j = await fetchJson(code + '/index.json');
          if (idbOk()) { IDB.set('tk:cidx:' + code, j).catch(() => {}); tkSweep(code, j.asof).catch(() => {}); }
          try { tkLegendPaint(); } catch (x) { /* 凡例の出典を新しくするだけ（監査 Minor7） */ }
          return j;
        } catch (e) {
          try { const c = idbOk() ? await IDB.get('tk:cidx:' + code) : null; return c && c.asof === asof ? c : c || null; } catch (x) { return null; }
        }
      })();
      TK.cidx[code] = await TK.cidx[code];
    }
    return TK.cidx[code];
  }
  /* 字のファイルを読み、展開して覚える。done：読み終えたら呼ぶ（地図の描き直し用） */
  function tkAza(code, f, asof, done) {
    const key = code + '/' + f;
    const got = TK.azas.get(key);
    if (got !== undefined) return got === 'loading' || got === 'bad' ? null : got;
    TK.azas.set(key, 'loading');
    (async () => {
      let j = null;
      try {
        const c = idbOk() ? await IDB.get('tk:f:' + key) : null;
        if (c && c.v === asof && c.j) j = c.j;
      } catch (e) { /* 保存が読めなくても、インターネットから読む */ }
      if (!j) {
        try {
          j = await fetchJson(key + '.json');
          if (idbOk()) {
            IDB.set('tk:f:' + key, { v: asof, j }).catch(() => {});
            tkReg(key, asof).catch(() => {});
          }
        } catch (e) { j = null; }
      }
      if (j) TK.azas.set(key, decodeAza(j));
      else {
        TK.azas.set(key, 'bad'); TK.bad++;
        // 1分後にもう一度ためせる（消したら描き直しも仕掛ける・監査 Minor6）
        setTimeout(() => { if (TK.azas.get(key) === 'bad') { TK.azas.delete(key); try { renderTochiKugiri(); } catch (x) { /* */ } } }, 60000);
      }
      if (done) done();
    })();
    return null;
  }
  /* 保存した字のファイルの一覧（tk:reg）。版が変わったら古いのを消す */
  async function tkReg(key, asof) {
    const reg = (await IDB.get('tk:reg').catch(() => null)) || {};
    reg[key] = asof;
    await IDB.set('tk:reg', reg).catch(() => {});
  }
  async function tkSweep(code, asof) {
    const reg = (await IDB.get('tk:reg').catch(() => null)) || {};
    let ch = false;
    for (const k in reg) {
      if (k.indexOf(code + '/') === 0 && reg[k] !== asof) { await IDB.del('tk:f:' + k).catch(() => {}); delete reg[k]; ch = true; }
    }
    if (ch) await IDB.set('tk:reg', reg).catch(() => {});
  }

  /* =========================================================
     地図に出す
     ========================================================= */
  const tkOn = () => lsGet('kuiki_tk_on') !== '0'; // はじめは入
  let tkPane = null, tkGroup = null, tkRenderer = null, lastSig = '';
  function tkEnsure() {
    if (tkGroup || !map) return;
    map.createPane('tkPane');
    map.getPane('tkPane').style.zIndex = 330;              // 家の印（450）・区域の線・目印（350）より下
    map.getPane('tkPane').style.pointerEvents = 'none';    // タップは下の区域に通す
    tkRenderer = L.canvas({ pane: 'tkPane', padding: 0.3 });
    tkGroup = L.layerGroup().addTo(map);
  }
  /* 出すかどうか：区域3個分以下（拒の印と同じ）かつズーム16以上。区域がまだ無い画面はズーム17以上 */
  function tkShow() {
    if (!map || !tkOn()) return false;
    if ((mode === 'draw' && typeof drawTap !== 'undefined' && drawTap === 'line') || mode === 'sen' || mode === 'tok') return false;
    const z = map.getZoom();
    if (z < 16) return false;
    const n = typeof terrsOnScreen === 'function' ? terrsOnScreen() : Infinity;
    return n <= 3 || (n === Infinity && z >= 17);
  }
  const TK_CAP = 2500; // 一度に描く土地の数の上限（それより多い分は、もう少し拡大すると出る）
  function renderTochiKugiri() {
    if (!map) return;
    const sz = map.getSize();
    if (!sz.x || !sz.y) return; // 地図のタブがまだ開いていない（開いたときに renderHouses から呼ばれる）
    tkEnsure();
    if (!tkShow()) { if (lastSig) { tkGroup.clearLayers(); lastSig = ''; } return; }
    const top = TK.top;
    if (top === undefined) { tkTop().then(() => renderTochiKugiri()).catch(() => {}); return; }
    if (!top) return; // この会衆には表がない
    const b = map.getBounds().pad(0.15), box = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    const photo = typeof baseName !== 'undefined' && baseName === 'photo';
    const rings = [];
    let loading = false;
    for (const muni in top.munis) {
      const mv = top.munis[muni];
      if (mv.b && !boxHit(mv.b, box)) continue;
      const idx = TK.cidx[mv.code];
      if (idx === undefined) { tkCidx(mv.code, mv.asof).then(() => renderTochiKugiri()).catch(() => {}); loading = true; continue; }
      if (!idx || !idx.azas) continue;
      for (const aza in idx.azas) {
        const v = idx.azas[aza];
        if (!v.b || !boxHit(v.b, box)) continue; // 範囲のない古い表は出さない（作り直すと出る）
        const list = tkAza(idx.code, v.f, idx.asof, () => renderTochiKugiri());
        if (!list) { loading = true; continue; }
        for (const fd of list) {
          if (rings.length >= TK_CAP) break;
          if (boxHit(fd.b, box)) rings.push(fd.ring);
        }
      }
    }
    const sig = map.getZoom() + ':' + box.map(x => x.toFixed(5)).join(',') + ':' + rings.length + ':' + (photo ? 'p' : 'm') + (loading ? ':l' : '');
    if (sig === lastSig) return;
    lastSig = sig;
    tkGroup.clearLayers();
    if (!rings.length) return;
    L.polyline(rings, {
      renderer: tkRenderer, pane: 'tkPane', interactive: false, smoothFactor: 1,
      color: photo ? '#FFE3A1' : '#8B6F47', weight: 1, opacity: photo ? 0.6 : 0.45
    }).addTo(tkGroup);
  }
  window.renderTochiKugiri = renderTochiKugiri; // app.js の renderHouses から呼ぶ

  /* 地図の種類を切りかえたとき（写真⇔地図）は、線の色を描き直す */
  const _setBase = window.setBase;
  if (typeof _setBase === 'function') {
    window.setBase = function () { const r = _setBase.apply(this, arguments); try { renderTochiKugiri(); } catch (e) { console.error(e); } return r; };
  }

  /* =========================================================
     凡例（「?」）：入/切・目安の注意・出典
     ========================================================= */
  const TK_NOTE = '登記上の土地の区切りの目安です。実際の敷地や塀とは違うことがあります';
  function tkSrcLine() {
    const codes = Object.keys(TK.cidx || {}).map(c => TK.cidx[c]).filter(x => x && x.src);
    if (!codes.length) return '';
    const set = [];
    codes.forEach(x => { if (set.indexOf(x.src) < 0) set.push(x.src); });
    return '土地の区切りは、' + set.join('・');
  }
  function tkLegendPaint() {
    const lg = document.getElementById('legend'); if (!lg) return;
    if (TK.top === undefined) { tkTop().then(() => { if (TK.top) tkLegendPaint(); }).catch(() => {}); return; }
    if (!TK.top || !TK.top.munis) return; // 表がない会衆には出さない（読み込みの途中＝Promise のあいだも出さない・監査 Minor4）
    let b = document.getElementById('tkLegend');
    if (!b) {
      b = document.createElement('div'); b.id = 'tkLegend'; lg.appendChild(b);
      b.addEventListener('change', e => { if (e.target.id === 'tkOnChk') { lsSet('kuiki_tk_on', e.target.checked ? '1' : '0'); renderTochiKugiri(); } });
    }
    const src = tkSrcLine();
    b.innerHTML = `<label class="check"><input type="checkbox" id="tkOnChk"${tkOn() ? ' checked' : ''}>土地の区切りを出す</label>` +
      `<p class="hint">地図を拡大すると、うすい線で出ます。${TK_NOTE}。</p>` +
      (src ? `<p class="hint">${esc(src)}</p>` : '');
  }
  const _renderLegend = window.renderLegend;
  if (typeof _renderLegend === 'function') {
    window.renderLegend = function () { const r = _renderLegend.apply(this, arguments); try { tkLegendPaint(); } catch (e) { console.error(e); } return r; };
  }

  /* =========================================================
     先読み（圏外に備える）：自分の区域・持っているカードにかかる字のファイルを保存する（1日1回）
     ========================================================= */
  function tkWantBoxes() {
    const out = [];
    try {
      D().territories.forEach(t => { if (!t.dummy && okPoly(t.polygon) && myTerr(t)) { const bb = ptsBox(t.polygon); if (bb) out.push(bb); } });
      activeCards().forEach(c => {
        if (c.dummy || !(c.by === me().id || isCardHelper(c))) return;
        const pts = (c.keys || []).map(k => houseById(parseKey(k)[0])).filter(Boolean).map(h => [h.lat, h.lng]);
        const bb = ptsBox(pts); if (bb) out.push(bb);
      });
    } catch (e) { /* 読めなくても害はない */ }
    return out;
  }
  const ptsBox = pts => {
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    (pts || []).forEach(p => { if (p[0] < s) s = p[0]; if (p[0] > n) n = p[0]; if (p[1] < w) w = p[1]; if (p[1] > e) e = p[1]; });
    return isFinite(s) ? [s, w, n, e] : null;
  };
  async function tkPrefetch() {
    if (!idbOk() || navigator.onLine === false || !Store.data) return;
    const today = new Date().toISOString().slice(0, 10);
    if (lsGet('kuiki_tk_pf') === today) return;
    const top = await tkTop();
    if (!top) return;
    const boxes = tkWantBoxes();
    if (!boxes.length) return;
    for (const muni in top.munis) {
      const mv = top.munis[muni];
      if (mv.b && !boxes.some(bb => boxHit(mv.b, bb))) continue;
      const idx = await tkCidx(mv.code, mv.asof);
      if (!idx || !idx.azas) continue;
      for (const aza in idx.azas) {
        const v = idx.azas[aza];
        if (!v.b || !boxes.some(bb => boxHit(v.b, bb))) continue;
        const key = idx.code + '/' + v.f;
        try {
          const c = await IDB.get('tk:f:' + key).catch(() => null);
          if (c && c.v === idx.asof) continue;
          const j = await fetchJson(key + '.json');
          await IDB.set('tk:f:' + key, { v: idx.asof, j });
          await tkReg(key, idx.asof);
        } catch (e) { return; } // 電波が切れたら、次に開いたときにまた
        await new Promise(r => setTimeout(r, 300)); // 続けて取らない（GitHub Pages への負担を小さく）
      }
    }
    lsSet('kuiki_tk_pf', today);
  }
  setTimeout(() => { tkPrefetch().catch(() => {}); }, 15000);

  /* =========================================================
     S-12・区域カードの「印刷」
     ・s12Load（地図の画像をまとめて受け取る所）を包み、カードの範囲の字を先に読んでおく
     ・s12MapSvg を包み、区域の外の白いおおいの直後（家より下）に線を足す
     ========================================================= */
  /* 世界ピクセル（ズーム z）→ 緯度・経度（s12Px の逆） */
  function tkUnPx(x, y, z) {
    const n = 256 * Math.pow(2, z);
    const lng = x / n * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return [lat, lng];
  }
  const tkViewBox = v => {
    const a = tkUnPx(v.x, v.y + v.h, v.z), b = tkUnPx(v.x + v.w, v.y, v.z);
    return [a[0], a[1], b[0], b[1]];
  };
  /* カードの範囲の字を読み終えるまで待つ（印刷は一度きりの処理なので、ここだけは待ってそろえる） */
  async function tkPreload(cards) {
    const top = await tkTop();
    if (!top) return;
    const boxes = (cards || []).filter(c => c && c.v).map(c => tkViewBox(c.v));
    if (!boxes.length) return;
    for (const muni in top.munis) {
      const mv = top.munis[muni];
      if (mv.b && !boxes.some(bb => boxHit(mv.b, bb))) continue;
      const idx = await tkCidx(mv.code, mv.asof);
      if (!idx || !idx.azas) continue;
      for (const aza in idx.azas) {
        const v = idx.azas[aza];
        if (!v.b || !boxes.some(bb => boxHit(v.b, bb))) continue;
        const key = idx.code + '/' + v.f;
        if (TK.azas.get(key) === 'bad') TK.azas.delete(key); // 前に読めなかった字は、読み直してから印刷する（読めないままだと待ち続けて印刷が止まる・監査 Critical1）
        if (TK.azas.get(key) === undefined) {
          await new Promise(res => { const r = tkAza(idx.code, v.f, idx.asof, res); if (r) res(); });
        } else if (TK.azas.get(key) === 'loading') {
          await new Promise(res => { const t = setInterval(() => { const g = TK.azas.get(key); if (g !== 'loading') { clearInterval(t); res(); } }, 100); });
        }
      }
    }
  }
  const _s12Load = window.s12Load;
  if (typeof _s12Load === 'function') {
    window.s12Load = async function (cards) {
      // 係のS-12・伝道者の「印刷・送る」・紙の予備ロボットの全部がここを通るので、入れるかどうかはここで決める（監査 Important2）
      TK.cur12 = TK.s12;
      try { if (TK.cur12) await tkPreload(cards); } catch (e) { console.error(e); }
      return _s12Load.apply(this, arguments);
    };
  }
  /* 線のSVG：区域の外の白いおおい（fill-rule="evenodd"）の直後＝家・目印より下に入れる */
  function tkS12Svg(svg, c) {
    const v = c.v, k = v.k, f = n => Math.round(n * 10) / 10, mm = n => f(n * k);
    const box = tkViewBox(v);
    const P = (lat, lng) => { const p = s12Px(lat, lng, v.z); return [p[0] - v.x, p[1] - v.y]; };
    let d = '', n = 0;
    TK.azas.forEach(list => {
      if (!Array.isArray(list)) return;
      for (const fd of list) {
        if (n >= TK_CAP || !boxHit(fd.b, box)) continue;
        n++;
        d += fd.ring.map((p, i) => { const [x, y] = P(p[0], p[1]); return (i ? 'L' : 'M') + f(x) + ',' + f(y); }).join('') + 'Z';
      }
    });
    if (!d) return svg;
    const path = `<path d="${d}" fill="none" stroke="#8B6F47" stroke-width="${Math.max(0.4, mm(0.12))}" stroke-opacity="0.5" stroke-linejoin="round"/>`;
    const eo = svg.indexOf('fill-rule="evenodd"/>');
    let idx = eo >= 0 ? eo + 'fill-rule="evenodd"/>'.length : -1;
    if (idx < 0) { const im = svg.lastIndexOf('<image'); idx = im >= 0 ? svg.indexOf('/>', im) + 2 : svg.indexOf('>') + 1; }
    svg = svg.slice(0, idx) + path + svg.slice(idx);
    return svg.replace('出典：国土地理院（', '出典：登記所備付地図データ（法務省／AIGID）・国土地理院（');
  }
  const _s12MapSvg = window.s12MapSvg;
  if (typeof _s12MapSvg === 'function') {
    window.s12MapSvg = function (c) {
      let s = _s12MapSvg.apply(this, arguments);
      try { if (TK.cur12 && TK.top && c && c.v) s = tkS12Svg(s, c); } catch (e) { console.error(e); }
      return s;
    };
  }
  /* 印刷の画面に「土地の区切りを入れる」（chizu.js の「目印を入れる」の下） */
  function tkPatchS12Sheet() {
    if (!TK.top || !document.getElementById('s12Back') || document.getElementById('tkS12Chk')) return;
    const lm = document.getElementById('s12Lm');
    if (!lm || !lm.closest('label')) return;
    lm.closest('label').insertAdjacentHTML('afterend', `<label class="check"><input type="checkbox" id="tkS12Chk"${TK.s12 ? ' checked' : ''}>土地の区切りを入れる</label>`);
  }
  document.addEventListener('change', e => { if (e.target && e.target.id === 'tkS12Chk') TK.s12 = e.target.checked; });
  const _setSheet = window.setSheet;
  if (typeof _setSheet === 'function') {
    window.setSheet = function () { const r = _setSheet.apply(this, arguments); try { tkPatchS12Sheet(); } catch (e) { console.error(e); } return r; };
  }

  /* =========================================================
     紙の予備ロボット（tools/kami-yobi.mjs）が使う窓口
     ========================================================= */
  window.tochiKugiri = {
    ver: async () => { // データの版（市町村コード：年月）。変わったら S-12 を作り直すために sig に入れる
      const top = await tkTop().catch(() => null);
      if (!top) return '';
      return Object.keys(top.munis).map(m => top.munis[m].code + ':' + (top.munis[m].asof || '')).sort().join(' ');
    },
    bad: () => TK.bad,
    dbg: () => lastSig, // 確かめ用：今描いている内容の印（ズーム:範囲:土地の数:地図の種類）
    _t: TK_API // 確かめ用
  };
})();
