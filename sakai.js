/* =========================================================
   sakai.js  区域マップ：会衆の境（S-54「会衆の区域割り当て」のKML）を、区域とは別の線として地図に出す（2026-11-18）

   ・この前半は、画面がなくても動く純粋な部品（Node の試験でも読める）。
     地図の層・凡例・取り込み画面は、後半（window があるときだけ）に足す
   ・境の線は多すぎる点を減らして小数5けたに丸める（保存と描画を軽くするため）
   ========================================================= */
(function () {
  'use strict';

  /* =========================================================
     純粋な部品（DOM・Leaflet・app.js の関数にはさわらない）
     ========================================================= */
  /* 近似はapp.jsと同じ：[緯度,経度] → 北緯の最初の点の cos を使ったメートル */
  const mXY = (p, cosLat) => [p[1] * 111320 * cosLat, p[0] * 110540];
  const cosOf = pts => Math.cos(pts[0][0] * Math.PI / 180);
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  /* 形を変えない程度に点を減らす（Douglas-Peucker・app.js の simplifyRing と同じ考え方） */
  function simplifyRing(pts, tol) {
    if (pts.length <= 4) return pts;
    const cosLat = cosOf(pts), xy = pts.map(p => mXY(p, cosLat));
    const keep = new Uint8Array(pts.length), last = pts.length - 1;
    let far = 0, fd = -1;
    xy.forEach((q, i) => { const d = (q[0] - xy[0][0]) ** 2 + (q[1] - xy[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
    keep[0] = keep[far] = keep[last] = 1;
    const stack = [[0, far], [far, last]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let mi = -1, md = tol;
      for (let i = a + 1; i < b; i++) { const d = segDist(xy[i], xy[a], xy[b]); if (d > md) { md = d; mi = i; } }
      if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = pts.filter((_, i) => keep[i]);
    return out.length >= 3 ? out : pts;
  }
  /* 輪の広さ（m²） */
  function ringAreaM2(pts) {
    const cosLat = cosOf(pts), xy = pts.map(p => mXY(p, cosLat));
    let a = 0;
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) a += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]);
    return Math.abs(a / 2);
  }
  const ringsAreaM2 = rings => (rings || []).reduce((s, r) => s + (r.length >= 3 ? ringAreaM2(r) : 0), 0);
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const count = rings => rings.reduce((s, r) => s + r.length, 0);

  /* 点の数を max 以下にする。小数5けたに丸め、ずれの許しを 1m から2倍ずつ大きくして全部の輪をなめらかにする */
  function capRings(rings, max = 300) {
    const before = count(rings || []);
    let cur = (rings || []).map(r => r.map(p => [r5(p[0]), r5(p[1])])).filter(r => r.length >= 3);
    for (let tol = 1; count(cur) > max && tol <= 1e5; tol *= 2) {
      cur = cur.map(r => simplifyRing(r, tol).map(p => [r5(p[0]), r5(p[1])])).filter(r => r.length >= 3);
    }
    return { rings: cur, before, after: count(cur) };
  }

  /* 点が輪の中か（偶奇判定） */
  function inRing(lat, lng, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[0] > lat) !== (b[0] > lat) && lng < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1]) c = !c;
    }
    return c;
  }
  /* メートルの座標 [x,y] どうしでの内外判定 */
  function inXY(x, y, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  /* 塊（outer から holes を除いた形）の、幅が 2×half 以上ある部分の広さが needM2 以上あるか。
     step m 間隔の点で測る：辺から half m 以上はなれた点（芯）を求め、芯から half m 以内にある点を数える
     （芯をもとの広さに戻した形）。数×step² が足りた時点で true を返す */
  function coreAreaAtLeast(outer, holes, needM2, step = 10, half = 10) {
    if (!outer || outer.length < 3) return false;
    const cosLat = cosOf(outer), o = outer.map(p => mXY(p, cosLat));
    const hs = (holes || []).filter(h => h && h.length >= 3).map(h => h.map(p => mXY(p, cosLat)));
    const edges = [];
    [o].concat(hs).forEach(r => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) edges.push([r[j], r[i]]); });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    o.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    const nx = Math.floor((x1 - x0) / step) + 1, ny = Math.floor((y1 - y0) / step) + 1;
    const inn = [], core = new Uint8Array(nx * ny);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = x0 + step / 2 + i * step, y = y0 + step / 2 + j * step;
        if (x > x1 || y > y1 || !inXY(x, y, o) || hs.some(h => inXY(x, y, h))) continue;
        inn.push([i, j]);
        let near = false;
        for (let k = 0; k < edges.length; k++) { if (segDist([x, y], edges[k][0], edges[k][1]) < half) { near = true; break; } }
        if (!near) core[i * ny + j] = 1;
      }
    }
    const r = Math.ceil(half / step), lim = half + step * 0.01;
    let n = 0;
    for (const [i, j] of inn) {
      let hit = false;
      for (let a = -r; a <= r && !hit; a++) {
        for (let b = -r; b <= r; b++) {
          const ii = i + a, jj = j + b;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || !core[ii * ny + jj]) continue;
          if (Math.hypot(a, b) * step <= lim) { hit = true; break; }
        }
      }
      if (hit && ++n * step * step >= needM2) return true;
    }
    return false;
  }

  /* S-54 の KML の文章 → 名前・更新日・四方の境・輪（[[lat,lng]…]）。こわれた XML は例外 */
  function parseS54(text, DP) {
    const P = DP || (typeof window !== 'undefined' ? window.DOMParser : null);
    if (!P) throw new Error('noparser');
    const doc = new P().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
    const NS = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag));
    const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    const coords = el => {
      const c = el && el.getElementsByTagNameNS('*', 'coordinates')[0];
      if (!c) return [];
      return c.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number))
        .filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]) && Math.abs(a[1]) <= 90 && Math.abs(a[0]) <= 180)
        .map(a => [a[1], a[0]]);
    };
    const pms = NS(doc, 'Placemark');
    const ext = {};
    pms.forEach(pm => NS(pm, 'Data').forEach(d => {
      const k = d.getAttribute('name'), v = d.getElementsByTagNameNS('*', 'value')[0];
      if (k && v && !(k in ext)) ext[k] = v.textContent.trim();
    }));
    const kid = (el, tag) => Array.from(el.children).find(c => c.localName === tag);
    const pmName = pms.length && kid(pms[0], 'name') ? kid(pms[0], 'name').textContent.trim() : '';
    const dEl = NS(doc, 'Document')[0], dName = dEl && kid(dEl, 'name') ? kid(dEl, 'name').textContent.trim() : '';
    const rings = [];
    let polys = 0;
    pms.forEach(pm => NS(pm, 'Polygon').forEach(pg => {
      polys++;
      const ob = pg.getElementsByTagNameNS('*', 'outerBoundaryIs')[0];
      if (!ob) return;
      const pts = [];
      coords(ob).forEach(p => { if (!pts.length || !same(pts[pts.length - 1], p)) pts.push(p); });
      while (pts.length > 1 && same(pts[0], pts[pts.length - 1])) pts.pop();
      if (pts.length >= 3) rings.push(pts);
    }));
    const iso = ext.LastUpdatedIso || '';
    return {
      name: ext.Name || pmName || dName || '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '',
      type: ext.Type || '',
      borders: { n: ext.BorderNorth || '', e: ext.BorderEast || '', s: ext.BorderSouth || '', w: ext.BorderWest || '' },
      rings, polys,
      network: NS(doc, 'NetworkLink').length > 0
    };
  }

  const SK_API = { capRings, ringsAreaM2, inRing, coreAreaAtLeast, parseS54 };
  if (typeof module !== 'undefined' && module.exports) module.exports = SK_API;
  if (typeof window === 'undefined') return;
  window.Sakai = Object.assign(window.Sakai || {}, SK_API);

  /* =========================================================
     地図に出す（会衆の境：灰色の破線・区域の線より下・押せない）
     ========================================================= */
  const SK_COLOR = { pale: '#374151', photo: '#F3F4F6' }; // 淡色地図：こい灰／写真：うす灰（写真の上でも見える色）
  /* 読み込んだ境のうち、使える輪だけ（3点以上で、点がすべて緯度・経度の数）。ない・こわれていれば null */
  function skRings() {
    let ca;
    try { ca = D().settings.congArea; } catch (e) { return null; }
    if (!ca || typeof ca !== 'object' || !Array.isArray(ca.rings)) return null;
    const rings = ca.rings.filter(r => typeof okPoly === 'function' && okPoly(r));
    return rings.length ? rings : null;
  }
  function skInfo() {
    const rings = skRings();
    if (!rings) return null;
    const ca = D().settings.congArea;
    return { n: String(ca.n || ''), d: String(ca.d || ''), pts: rings.reduce((a, r) => a + r.length, 0), nRings: rings.length };
  }
  /* 「2024-12-11」→「2024年12月11日」（日付でなければ ''） */
  function skDateText(d) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${m[1]}年${+m[2]}月${+m[3]}日` : ''; }
  const skCanImport = () => !LIVE || Number(D().settings.capArea) === 1; // 古いサーバーには、境を送らない（送っても捨てられるため）

  let skLayer = null, skSig = '', skFirstDone = false, skBound = false;
  function skEnsurePane() {
    if (map.getPane('congPane')) return;
    map.createPane('congPane'); // 区域の線（350）より下。タップは下の区域・地図に通す
    map.getPane('congPane').style.zIndex = 340;
    map.getPane('congPane').style.pointerEvents = 'none';
  }
  /* はじめの表示：区域が1つもなく境があるときだけ、境が入る範囲に合わせる（1回だけ）。区域があれば何も変えない。
     境がまだないあいだは「1回」を使わない（境があとから届いたときに合わせるため） */
  function skFirstView(rings) {
    if (skFirstDone || !map || !rings) return;
    const sz = map.getSize();
    if (!sz.x || !sz.y) return; // 地図のタブがまだ開いていない（開いたあとの描き直しでやる）
    skFirstDone = true;
    let has = false;
    try { has = D().territories.some(t => okPoly(t.polygon)); } catch (e) { has = true; }
    if (has) return;
    const pts = [];
    rings.forEach(r => r.forEach(p => pts.push([p[0], p[1]])));
    map.fitBounds(L.latLngBounds(pts), { animate: false, padding: [20, 20] });
  }
  function skRender() {
    if (!map) return;
    if (!skBound) { skBound = true; map.on('resize', () => { try { skRender(); } catch (e) { console.error(e); } }); } // 地図のタブをはじめて開いて大きさが決まったとき、はじめの表示をやり直す
    const rings = skRings();
    skFirstView(rings);
    const photo = typeof baseName !== 'undefined' && baseName === 'photo';
    const ca = rings ? D().settings.congArea : null;
    const sig = rings ? [ca.at || '', rings.length, rings.reduce((a, r) => a + r.length, 0), photo ? 'photo' : 'pale'].join('|') : '';
    if (sig === skSig) return; // 同じ内容なら描き直さない
    skSig = sig;
    if (skLayer) { map.removeLayer(skLayer); skLayer = null; }
    if (!rings) return;
    skEnsurePane();
    skLayer = L.polygon(rings, {
      pane: 'congPane', interactive: false, fill: false, color: photo ? SK_COLOR.photo : SK_COLOR.pale,
      weight: 2.5, opacity: 0.65, dashArray: '10 7', lineJoin: 'round'
    }).addTo(map);
  }
  /* 凡例（「?」の「印の見かた」）に、境があるときだけ1行を足す */
  function skLegend() {
    const grid = document.querySelector('#legendKeys .legendgrid');
    if (!grid) return;
    let row = document.getElementById('skLegendRow');
    if (!skRings()) { if (row) row.remove(); return; }
    if (!row) {
      row = document.createElement('span'); row.id = 'skLegendRow';
      row.innerHTML = '<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true" style="flex:none;margin:8px"><path d="M2 7H32" stroke="#374151" stroke-width="2.5" stroke-dasharray="7 5" stroke-linecap="round" fill="none"/></svg>会衆の境（S-54）';
      grid.appendChild(row);
    }
  }

  window.Sakai = Object.assign(window.Sakai || {}, { rings: skRings, info: skInfo, render: skRender, canImport: skCanImport, dateText: skDateText });

  /* 区域を描き直すとき・地図の種類を切りかえたとき・凡例を作り直すときに、いっしょに描く（元の動きはそのまま） */
  const _renderTerrs = window.renderTerrs;
  if (typeof _renderTerrs === 'function') {
    window.renderTerrs = function () { const r = _renderTerrs.apply(this, arguments); try { skRender(); } catch (e) { console.error(e); } return r; };
  }
  const _setBase = window.setBase;
  if (typeof _setBase === 'function') {
    window.setBase = function () { const r = _setBase.apply(this, arguments); try { skRender(); } catch (e) { console.error(e); } return r; };
  }
  const _renderLegend = window.renderLegend;
  if (typeof _renderLegend === 'function') {
    window.renderLegend = function () { const r = _renderLegend.apply(this, arguments); try { skLegend(); } catch (e) { console.error(e); } return r; };
  }

  /* =========================================================
     取り込む・入れなおす・消す（区域係だけ。入口は torikomi.js の「区域の線・取り込み」）
     ========================================================= */
  const SK_MAX_RINGS = 20; // サーバー（CONG_RINGS_MAX）と同じ。これより多い輪は取り込まない
  const SK_PREV = { color: '#D97706', weight: 3.5, opacity: 0.95, dashArray: '8 6' }; // 仮の線：今の境（灰色）と見分けのつく色
  const skCss = document.createElement('style');
  skCss.textContent = '#skConfirm .sk-row{display:flex;gap:10px;padding:7px 2px;border-bottom:1px solid var(--line)}#skConfirm .sk-row span{flex:none;width:5.5em;color:var(--ink2)}#skConfirm .sk-row b{flex:1;min-width:0;word-break:break-all}';
  document.head.appendChild(skCss);
  const skSleep = ms => new Promise(r => setTimeout(r, ms));
  const skEsc = x => (typeof esc === 'function' ? esc(x) : String(x));

  /* ファイル → KML の文章（KMZ は app.js の readKmlFile と同じ手順：先頭が PK なら zip の doc.kml か最初の .kml） */
  async function skReadText(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4B) {
      await loadScript(LIB.zip);
      const zip = await window.JSZip.loadAsync(file);
      const f = zip.file('doc.kml') || zip.file(/\.kml$/i)[0];
      if (!f) throw new Error('nokml');
      return f.async('string');
    }
    return file.text();
  }

  /* 確認の画面にいるあいだだけ、仮の線を地図に出す（閉じ方を問わず、画面が消えたら線も消して、地図の見た目をもとに戻す） */
  let skPrev = null, skPrevObs = null, skPrevSaved = null;
  function skPreviewOff(restore) {
    if (skPrevObs) { skPrevObs.disconnect(); skPrevObs = null; }
    if (skPrev) { try { map.removeLayer(skPrev); } catch (e) { /* 何もしない */ } skPrev = null; }
    const sv = skPrevSaved; skPrevSaved = null;
    if (restore && sv && map) {
      try { map.setView(sv.c, sv.z, { animate: false }); } catch (e) { /* 何もしない */ }
      if (sv.view && typeof currentView !== 'undefined' && currentView !== sv.view) { try { showView(sv.view); } catch (e) { /* 何もしない */ } }
    }
  }
  async function skPreviewOn(rings) {
    skPreviewOff(false);
    if (!map) return;
    const sv = { c: map.getCenter(), z: map.getZoom(), view: typeof currentView !== 'undefined' ? currentView : '' };
    skPrevSaved = sv;
    skEnsurePane();
    if (sv.view !== 'map') { showView('map'); await skSleep(90); } // 地図が見えるように（閉じる・やめるでもとの画面に戻す）
    if (!document.getElementById('skConfirm') || skPrevSaved !== sv) return; // 待っているあいだに画面が閉じた
    map.invalidateSize();
    skPrev = L.polygon(rings, Object.assign({ pane: 'congPane', interactive: false, fill: false, lineJoin: 'round' }, SK_PREV)).addTo(map);
    const sz = map.getSize(), sh = $('#sheet').getBoundingClientRect().height || 0;
    map.fitBounds(skPrev.getBounds(), { animate: false, paddingTopLeft: [20, 20], paddingBottomRight: [20, Math.min(sh + 10, Math.round(sz.y * 0.6))] });
    const sheet = $('#sheet');
    skPrevObs = new MutationObserver(() => { if (!document.getElementById('skConfirm') || sheet.hidden) skPreviewOff(true); });
    skPrevObs.observe(sheet, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  }

  const skKm2 = m2 => { const k = m2 / 1e6; return (k < 10 ? k.toFixed(2) : k.toFixed(1)); };
  const skInJapan = rings => rings.every(r => r.every(p => p[0] >= 20 && p[0] <= 46 && p[1] >= 122 && p[1] <= 154)); // サーバー（cleanCongArea_）と同じ範囲

  /* ファイル → 確認の画面 →「会衆の境にする」で保存 */
  async function skOpenImport(file) {
    if (typeof isAdmin === 'function' && !isAdmin()) { toast('区域係だけが使えます'); return; }
    if (!skCanImport()) { infoSheet('会衆の境を取り込む', skEsc('サーバーを更新してから取り込んでください')); return; }
    let parsed;
    try { parsed = SK_API.parseS54(await skReadText(file)); } catch (e) {
      infoSheet('ファイルを読み込めませんでした', 'S-54「会衆の区域割り当て」のKML（またはKMZ）のファイルを選んでください。KMZのときは、インターネットにつながっている必要があります。');
      return;
    }
    const cap = SK_API.capRings(parsed.rings, 300);
    if (!cap.rings.length) {
      infoSheet('会衆の境が見つかりませんでした', parsed.network
        ? 'このファイルには地図の中身が入っていません。「ネットワーク リンク」を外して、もう一度書き出してください。'
        : 'このファイルには、境（面）の線がありません。S-54「会衆の区域割り当て」のKMLを選んでください。');
      return;
    }
    const name = (parsed.name || String(file.name || '').replace(/\.[^.]+$/, '')).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
    const tooMany = cap.rings.length > SK_MAX_RINGS || parsed.rings.length > SK_MAX_RINGS;
    const outside = !skInJapan(cap.rings);
    const notS54 = parsed.type !== 'Congregation';
    const row = (k, v) => v ? `<div class="sk-row"><span>${k}</span><b>${skEsc(v)}</b></div>` : '';
    const b = parsed.borders, dt = skDateText(parsed.date);
    const nPts = cap.after;
    const warns = [];
    if (notS54) warns.push(`S-54 のファイルではないかもしれません（区域の線が${parsed.polys}本あります）`);
    if (tooMany) warns.push('区域の線が多すぎて、会衆の境にはできません（会衆の境は20本までです）');
    else if (outside) warns.push('日本のまわりの場所ではないので、会衆の境にはできません');
    if (cap.after < cap.before) warns.push(`点の数が多いので、形を少しなめらかにしました（${cap.before}点 → ${cap.after}点）`);
    const had = !!skInfo();
    setSheet(headHtml(null, '会衆の境を取り込む', skEsc(file.name || '')) + `<div id="skConfirm">
      ${row('名前', name)}${row('最終更新', dt)}${row('北', b.n)}${row('東', b.e)}${row('南', b.s)}${row('西', b.w)}
      ${row('点の数', `${nPts}点`)}${row('広さ', `約${skKm2(SK_API.ringsAreaM2(cap.rings))} km²`)}
      ${warns.map(w => `<div class="notice warn">${skEsc(w)}</div>`).join('')}
      ${had && !tooMany && !outside ? `<p class="hint">今の会衆の境は、このファイルのものに置きかわります。区域は変わりません。</p>` : ''}
      ${tooMany || outside ? '' : '<button type="button" class="btn primary block" id="skGo">会衆の境にする</button>'}
      <button type="button" class="btn block" data-skno>やめる</button></div>`);
    const S = $('#sheet');
    $$('[data-skno]', S).forEach(x => { x.onclick = () => { skPreviewOff(true); closeSheet(); }; });
    const go = $('#skGo');
    if (go) go.onclick = () => {
      if (!skCanImport()) { toast('サーバーを更新してから取り込んでください'); return; }
      skPreviewOff(false);
      const now = new Date().toISOString();
      D().settings.congArea = { v: 1, n: name, d: parsed.date || '', at: now, rings: cap.rings };
      closeSheet();
      Store.save(); renderAll();
      if (typeof currentView !== 'undefined' && currentView !== 'map') { try { showView('map'); } catch (e) { /* 何もしない */ } }
      toast('会衆の境を取り込みました');
    };
    skPreviewOn(cap.rings).catch(e => console.error(e));
  }

  /* 境を消す（区域は変わらない）。確かめてから */
  async function skClear() {
    if (typeof isAdmin === 'function' && !isAdmin()) { toast('区域係だけが使えます'); return; }
    if (!skInfo()) return;
    if (!await ask('地図の境の線を消します。区域は変わりません。', { title: '会衆の境を消しますか？', body: '地図の境の線を消します。区域は変わりません。', ok: '消す', danger: true })) return;
    D().settings.congArea = {};
    Store.save(); renderAll();
    toast('会衆の境を消しました');
  }
  window.Sakai.openImport = skOpenImport;
  window.Sakai.clear = skClear;
})();
