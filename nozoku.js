/* =========================================================
   nozoku.js  受け取る前に、地図で場所を見る（2026-10-21）

   ・「区域をもらう」の一覧と「おすすめ」タブの各行に「地図」ボタンを付ける
   ・押すと、一覧を閉じて地図を開き、その区域（留守宅カードなら、その家）を目立たせて見せる
   ・地図の下の帯に「受け取る（係に頼む）」「一覧にもどる」を出す。もどると、前の一覧がそのまま開く
   ・受け取るまでは、何も変わらない（区域は受け取っていない）

   index.html：tokubetsu.js のあとに <script src="nozoku.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof setSheet !== 'function') return;

  const css = document.createElement('style');
  css.textContent = `
.peekbar{position:absolute;left:10px;right:10px;bottom:22px;z-index:650;background:var(--paper);border:3px solid #E8590C;border-radius:var(--r);padding:10px 12px;box-shadow:0 4px 12px #0004}
.peekbar .pk-t{margin:0;font-size:17px;line-height:1.4}
.peekbar .pk-s{margin:2px 0 0;font-size:15px;color:var(--ink2);line-height:1.4}
.peekbar .pk-row{display:flex;gap:8px;margin-top:8px}
.peekbar .pk-row .btn{flex:1 1 0;min-height:52px}
body.peeking #cardBar{display:none!important}
.pk-pt{width:14px;height:14px;border-radius:50%;background:#E8590C;border:2px solid #fff;box-shadow:0 1px 3px #0006}
.pickbtns{display:flex;flex-direction:column;gap:6px;flex:none}
.pickbtns .btn{min-width:5.5em}
@media (max-width:420px){.pick .pickbtns{grid-column:2;flex-direction:row;justify-self:start}.pick .pickbtns .btn{grid-column:auto}}
.kgc .actions [data-kgpeek]{order:-1}
@media (min-width:700px){.peekbar{right:auto;width:min(520px,calc(100% - 20px))}}
`;
  document.head.appendChild(css);

  let PK = null, lay = null, inner = false;
  function bar() {
    let b = $('#peekBar');
    if (!b) {
      b = document.createElement('div');
      b.className = 'peekbar'; b.id = 'peekBar'; b.hidden = true;
      const cb = $('#cardBar');
      cb.parentNode.insertBefore(b, cb.nextSibling);
      b.addEventListener('click', e => {
        const x = e.target.closest('[data-pk]'); if (!x || !PK) return;
        const o = PK.o, k = x.dataset.pk;
        end();
        if (k === 'take' && o.take) o.take();
        else if (k === 'back') { inner = true; try { showView(PK0.view); } finally { inner = false; } if (o.back) o.back(); }
      });
    }
    return b;
  }
  let PK0 = { view: 'cards' };
  /* tid：区域。o：{ back：一覧にもどる, take：受け取る（なければ出さない）, takeLabel, sub, pts：目立たせる家の場所（留守宅カード） } */
  function peek(tid, o) {
    const t = terrById(tid); if (!t || typeof map === 'undefined') return;
    o = o || {};
    PK0 = { view: typeof currentView !== 'undefined' && currentView !== 'map' ? currentView : 'cards' };
    closeSheet();
    try { firstMapShow = false; zoomHintShown = true; } catch (e) { /* 地図をはじめて開くときの「全体を見せる」と案内を出さない */ }
    inner = true;
    try { showView('map'); } finally { inner = false; }
    if (typeof mode !== 'undefined' && mode !== 'normal') setMode('normal');
    PK = { tid, o };
    if (!lay) lay = L.layerGroup().addTo(map);
    lay.clearLayers();
    const poly = okPoly(t.polygon) ? t.polygon : null;
    const hs = isSpecial(t) ? housesOf(t.id) : [];
    const pts = o.pts && o.pts.length ? o.pts : hs.map(h => [h.lat, h.lng]);
    if (poly && !(isSpecial(t) && spIds(t))) L.polygon(poly, { color: '#E8590C', weight: 6, fillColor: '#E8590C', fillOpacity: 0.12, interactive: false }).addTo(lay);
    pts.forEach(p => L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="pk-pt"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false, keyboard: false, zIndexOffset: 1500 }).addTo(lay));
    const n = terrStats(t, 0).n, dist = myPos && poly ? distM(myPos, center(poly)) : null;
    const b = bar();
    b.innerHTML = `<p class="pk-t"><span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span> <b>${esc(o.title || t.name || '区域' + t.no)}</b></p>
      <p class="pk-s">${esc(o.sub || `${n}軒・部屋`)}${dist != null ? `　ここから約${fmtDist(dist)}` : ''}</p>
      <div class="pk-row">${o.take ? `<button type="button" class="btn primary" data-pk="take">${esc(o.takeLabel || '受け取る')}</button>` : ''}<button type="button" class="btn" data-pk="back">一覧にもどる</button></div>`;
    b.hidden = false;
    document.body.classList.add('peeking');
    // まわりの様子（大きな道・目印）も見えるよう、区域より少し広く見せる
    const bb0 = pts.length && !poly ? L.latLngBounds(pts) : poly ? L.latLngBounds(poly) : null, bb = bb0 ? bb0.pad(0.5) : null;
    setTimeout(() => {
      map.invalidateSize();
      if (bb && bb.isValid()) map.fitBounds(bb, { paddingTopLeft: [20, 70], paddingBottomRight: [20, (b.offsetHeight || 140) + 30], maxZoom: 17, animate: false });
    }, 80);
  }
  function end() {
    if (lay) lay.clearLayers();
    const b = $('#peekBar'); if (b) b.hidden = true;
    document.body.classList.remove('peeking');
    PK = null;
    try { if (typeof renderHouses === 'function' && map) renderHouses(); } catch (e) { /* 表示だけ */ }
  }
  // ほかのタブに移ったら、見ている途中の表示を消す
  const _showView = window.showView;
  window.showView = function (v) {
    if (PK && !inner) end();
    return _showView.apply(this, arguments);
  };
  // 地図の作業（線引きなど）を始めたら消す
  const _setMode = window.setMode;
  window.setMode = function (m) { if (PK && m !== 'normal') end(); return _setMode.apply(this, arguments); };

  window.nozoku = { peek, end, active: () => !!PK };
})();
