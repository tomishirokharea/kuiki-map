/* =========================================================
   区域マップ：回る範囲を「集合住宅の部屋ごと」に分ける（heya-wake.js・2026-11-08）
   ・「回る範囲を分ける」の最中に集合住宅をタップすると、部屋が建物の形（上の階が上）で並ぶ
   ・部屋をタップ、または指でなぞると、まとめてえらべる（iPhone の写真をえらぶのと同じ。
     えらんだ部屋からなぞりはじめると、はずれる）。階の名前を押すと、その階を全部
   ・えらんだ部屋は「この範囲をわたす」で、今までどおり人にわたす（囲みと組み合わせてもよい）
   ・データ：parts の1件に rooms: { 建物のid: [部屋…] }（部屋だけなら ro: 1）。決まりは app.js の partHas
   ・app.js のあとに読む（partDraw・partObj・partsOf・partHas・roomsText・unitGroups などを使う）
   ========================================================= */
(function () {
  'use strict';
  /* 分けられる部屋：区域の建物の部屋。グループの留守宅カードなら、カードに入っている部屋だけ */
  function poolUnits(h) {
    if (!partDraw || !h || h.type !== 'apt') return [];
    if (partDraw.cid) {
      const c = partObj(partDraw); if (!c) return [];
      const ks = new Set(c.keys || []);
      return h.units.filter(u => ks.has(K(h.id, u)));
    }
    return h.terrId === partDraw.tid ? h.units.slice() : [];
  }
  const can = h => !!(h && h.type === 'apt' && h.units.length && mode === 'part' && partDraw && poolUnits(h).length);

  /* 指でなぞる道具のときの「ちょんとタップ」：近くの集合住宅をさがす（26px 以内） */
  function hitAt(pt) {
    if (!partDraw || !map) return null;
    const r = map.getContainer().getBoundingClientRect(), x = pt[0] - r.left, y = pt[1] - r.top;
    let best = null, bd = 26;
    housesOf(partDraw.tid).forEach(h => {
      if (!can(h)) return;
      const p = map.latLngToContainerPoint([h.lat, h.lng]), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }

  /* 並べ方：階（棟）ごとの行。1行に7部屋をこえるときは折り返す（スマホの幅に収める） */
  function rowsOf(h, pool) {
    const ps = new Set(pool), rows = [];
    unitGroups(h).forEach(([g, us]) => {
      const a = us.filter(u => ps.has(u)); if (!a.length) return;
      for (let i = 0; i < a.length; i += 7) rows.push({ g: i ? '' : g, us: a.slice(i, i + 7), gk: g });
    });
    return rows;
  }
  const shortName = q => { const n = uname((q.uids || [])[0] || '') || ''; return (n.split(/[\s　]/)[0] || n).slice(0, 4) + ((q.uids || []).length > 1 ? 'ほか' : ''); };

  function open(hid) {
    const h = houseById(hid);
    if (!can(h)) return;
    const cur = $('#sheet'); // 指でなぞる道具のタップと、印のタップが重なったとき：同じ建物の画面がもう出ていれば、出し直さない
    if (cur && !cur.hidden && cur.querySelector(`.roomgrid[data-hid="${CSS.escape(hid)}"]`)) return;
    const t = terrById(partDraw.tid), po = partObj(partDraw); if (!t || !po) return;
    const pool = poolUnits(h), all = partsOf(po);
    const sel = new Set((partDraw.rooms[hid] || []).filter(u => pool.includes(u)));
    const since = unitDoneSince(h);
    // ほかの範囲に入っている部屋（だれの範囲か）
    const owner = new Map();
    all.forEach(q => pool.forEach(u => { if (!owner.has(u) && partHas(q, h, u, all)) owner.set(u, q); }));
    const rows = rowsOf(h, pool);
    const cols = Math.max(...rows.map(r => r.us.length));
    const cell = (u, r, c) => {
      const k = K(hid, u), ref = !!D().dnc[k], done = !ref && visitedSince(k, since), q = owner.get(u);
      const sub = ref ? (dncSkip(k) ? 'ー' : '拒') : done ? '済' : '';
      return `<button type="button" class="rcell${sel.has(u) ? ' on' : ''}${q ? ' taken' : ''}" data-ru="${esc(u)}" data-r="${r}" data-c="${c}" aria-pressed="${sel.has(u)}"
        aria-label="${esc(unitTitle(h, u))}${sub ? '（' + (ref ? (dncSkip(k) ? '訪問しない' : '拒否') : '訪問済み') + '）' : ''}${q ? '（' + esc(partName(q)) + 'の範囲）' : ''}">
        <b>${esc(uName(h, u))}</b>${sub ? `<i>${sub}</i>` : ''}${q ? `<small>${esc(shortName(q))}</small>` : ''}</button>`;
    };
    const grid = `<div class="roomgrid" data-hid="${esc(hid)}" style="--cols:${cols}">${rows.map((row, r) => `
      <div class="rrow">${row.g ? `<button type="button" class="rfloor" data-rg="${esc(row.gk)}">${esc(row.g)}</button>` : '<span class="rfloor blank"></span>'}
        ${row.us.map((u, c) => cell(u, r, c)).join('')}</div>`).join('')}</div>`;
    const hasPoly = partDraw.pts.length >= 3;
    setSheet(headHtml(t, esc(h.label || '集合住宅'), `わたす部屋をえらぶ　${pool.length}部屋`) + `
      <p class="hint">部屋をタップするか、指でなぞると、まとめてえらべます。えらんだ部屋からなぞると、はずれます。階の名前を押すと、その階を全部えらびます。${hasPoly ? '<br>地図で囲んだ範囲と合わせて、わたします。' : ''}</p>
      ${grid}
      <div class="rlegend muted"><span><b class="lg on"></b>えらんだ部屋</span>${owner.size ? '<span><b class="lg taken"></b>ほかの人の範囲（えらぶと、こちらに移ります）</span>' : ''}<span>済＝訪問済み　拒＝拒否</span></div>
      <div class="row"><button type="button" class="btn small" id="rwAll">全部えらぶ</button><button type="button" class="btn small" id="rwNone">全部はずす</button></div>
      <p class="rcount" id="rwCount" aria-live="polite"></p>
      <button type="button" class="btn primary block" id="rwGive">この範囲をわたす</button>
      <button type="button" class="btn block" id="rwMap">地図にもどって続ける</button>
      <button type="button" class="btn block" data-close>やめる</button>`);
    const S = $('#sheet'), G = $('.roomgrid', S);
    const cells = $$('[data-ru]', G);
    const paint = () => {
      cells.forEach(b => { const on = sel.has(b.dataset.ru); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      const us = h.units.filter(u => sel.has(u));
      $('#rwCount').textContent = us.length ? `えらんだ部屋：${roomsText(h, us)}` : 'まだ部屋をえらんでいません';
      $('#rwGive').disabled = !us.length && !hasPoly;
    };
    const keep = () => { const us = h.units.filter(u => sel.has(u)); if (us.length) partDraw.rooms[hid] = us; else delete partDraw.rooms[hid]; };
    // 指でなぞる：はじめの部屋から今の部屋までの四角を、まとめてえらぶ（はずす）
    let drag = null;
    G.addEventListener('pointerdown', e => {
      const c = e.target.closest('[data-ru]'); if (!c || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { r0: +c.dataset.r, c0: +c.dataset.c, add: !sel.has(c.dataset.ru), base: new Set(sel), x: e.clientX, y: e.clientY, moved: false, cell: c };
    });
    G.addEventListener('pointermove', e => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.moved = true;
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY), c = el && el.closest && el.closest('.roomgrid [data-ru]');
      if (!c) return;
      const r1 = +c.dataset.r, c1 = +c.dataset.c, ra = Math.min(drag.r0, r1), rb = Math.max(drag.r0, r1), ca = Math.min(drag.c0, c1), cb = Math.max(drag.c0, c1);
      sel.clear(); drag.base.forEach(u => sel.add(u));
      cells.forEach(b => { const r = +b.dataset.r, cc = +b.dataset.c; if (r >= ra && r <= rb && cc >= ca && cc <= cb) { if (drag.add) sel.add(b.dataset.ru); else sel.delete(b.dataset.ru); } });
      paint();
    });
    const end = e => {
      if (!drag) return;
      const d = drag; drag = null;
      if (e.type === 'pointercancel') { if (!d.moved) return; } // 画面のスクロールになったとき：なぞった分はそのまま
      else if (!d.moved) { const u = d.cell.dataset.ru; if (sel.has(u)) sel.delete(u); else sel.add(u); paint(); }
    };
    G.addEventListener('pointerup', end);
    G.addEventListener('pointercancel', end);
    cells.forEach(b => b.addEventListener('click', e => { if (e.detail === 0) { const u = b.dataset.ru; if (sel.has(u)) sel.delete(u); else sel.add(u); paint(); } })); // キーボード
    $$('[data-rg]', G).forEach(b => b.onclick = () => {
      const us = rows.filter(r => r.gk === b.dataset.rg).flatMap(r => r.us), allOn = us.every(u => sel.has(u));
      us.forEach(u => (allOn ? sel.delete(u) : sel.add(u))); paint();
    });
    $('#rwAll').onclick = () => { pool.forEach(u => sel.add(u)); paint(); };
    $('#rwNone').onclick = () => { sel.clear(); paint(); };
    $('#rwGive').onclick = () => { keep(); closeSheet(); renderPartDraw(); openPartAssign(); };
    $('#rwMap').onclick = () => { keep(); closeSheet(); renderPartDraw(); };
    // 画面がスクロールしないほど短いときは、たて方向になぞってもえらべるようにする（長いときは、たては画面のスクロール）
    if (S.scrollHeight <= S.clientHeight + 2) G.style.touchAction = 'none';
    paint();
  }

  window.heyaWake = { can, open, hitAt };
})();
