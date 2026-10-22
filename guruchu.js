/* =========================================================
   グループの中心（guruchu.js）2026-10-23
   ・区域係が、グループごとに「このグループの人は、だいたいこのあたりに住んでいる」という点を地図に置く。
     1グループ2点まで（住まいが2か所に分かれているグループだけ2点目を置く）。置けるのは区域係だけ。
   ・人の名前・住所・家の場所は、どこにも入れない。保存するのは D().settings.groupPts
     （{ グループ名: [[緯度, 経度], …] }。サーバーは Code.gs の cleanGroupPts_ で確かめる）だけ。
   ・使い道（新しいボタンやタブは足さない。今ある並べ方に「近さ」を加えるだけ）
     ① 区域をもらう（グループ奉仕）：「近い順」はグループの中心から（現在地は使わない）。
        「おすすめ順」は今の点数を75点分に縮め、近さを25点加える。期限の近い「急ぎ」は、いちばん上のまま（schedule.js）
     ② 集まりに合う区域：グループの集まりで場所が分からないときは、グループの中心から計る。
        全体の集まりでは、どのグループの中心からも遠い区域を少し先に出す（schedule.js）
     ③ 係の画面「人」：グループごとの中心の数・近い区域の数（急ぎの数）、どのグループからも遠い区域
   ・2点あるグループは、近いほうの点から計る。区域の位置は、区域の中の点（labelPoint）
   ・中心は係の画面だけに出す（伝道者の地図には出さない）
   ========================================================= */
(function () {
  'use strict';

  const MAX = 2;           // 1グループに置ける中心の数（サーバーの GROUP_PTS_MAX と同じ）
  const NEAR_FULL = 4000;  // m。中心からこれ以上はなれると、近さは0点（豊見城の端から端がおよそ5〜6km）
  const W_NEAR = 25;       // おすすめ順で、近さに付ける点数（残りの75点が、今までの期限・若い世代・会えなかった家）
  const FAR_M = 2500;      // m。どのグループの中心からもこれ以上はなれた区域を「遠い区域」とする

  /* ---------- 中心の読み書き ---------- */
  const okPt = p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
  const allPts = () => { const s = D().settings || {}; return s.groupPts && typeof s.groupPts === 'object' && !Array.isArray(s.groupPts) ? s.groupPts : {}; };
  const ptsOf = g => { const a = allPts()[normGroup(g)]; return Array.isArray(a) ? a.filter(okPt).slice(0, MAX) : []; };
  const has = g => !!g && ptsOf(g).length > 0;
  /* 今いるグループのうち、中心を置いたグループ（使われなくなったグループの中心は、計算に入れない） */
  const liveGroups = () => groupsAll().filter(has);
  const r5 = n => Math.round(n * 1e5) / 1e5;

  /* ---------- 近さ ---------- */
  const terrPos = t => (t && okPoly(t.polygon) ? labelPoint(t.polygon) : null);
  /* グループの中心から区域までの距離（m）。2点あるときは近いほう。分からなければ null */
  function dist(g, t) {
    const ps = ptsOf(g), c = terrPos(t);
    if (!ps.length || !c) return null;
    return Math.min(...ps.map(p => distM(p, c)));
  }
  /* 近さの点（0〜1）：0mで1、NEAR_FULL 以上で0 */
  const nearP = d => (d == null ? 0 : Math.max(0, 1 - d / NEAR_FULL));
  /* その区域にいちばん近いグループ（中心を置いたグループの中で） */
  function nearest(t) {
    let best = null;
    liveGroups().forEach(g => { const d = dist(g, t); if (d != null && (!best || d < best.d)) best = { g, d }; });
    return best;
  }
  /* どのグループの中心からも遠い区域か（中心が1つもなければ false） */
  function far(t) { const n = nearest(t); return !!n && n.d >= FAR_M; }

  /* 区域係の数字に使う区域（ふつうの区域カード。特別区域と見本は数えない） */
  const terrs = () => D().territories.filter(t => !t.dummy && !isSpecial(t) && okPoly(t.polygon));
  const urgent = t => { try { const d = window.KM && KM.dueInfo(t); return !!d && d.left != null && d.left <= KM.PIN_DAYS; } catch (e) { return false; } };
  /* グループごとの「いちばん近い区域」の数と急ぎの数、遠い区域 */
  function summary() {
    const by = new Map(liveGroups().map(g => [g, { n: 0, urg: 0 }])), farList = [];
    if (!by.size) return { by, farList };
    terrs().forEach(t => {
      const n = nearest(t); if (!n) return;
      const s = by.get(n.g); s.n++; if (urgent(t)) s.urg++;
      if (n.d >= FAR_M) farList.push(t);
    });
    farList.sort((a, b) => cmpNo(a.no, b.no));
    return { by, farList };
  }

  window.GC = { MAX, W: W_NEAR, FAR_M, ptsOf, has, dist, nearP, nearest, far, any: () => liveGroups().length > 0 };

  /* ---------- 保存（区域係だけ。取り消せる） ---------- */
  function savePts(g, pts, msg) {
    const k = normGroup(g);
    commit(msg, () => {
      const cur = Object.assign({}, allPts());
      const ok = (pts || []).filter(okPt).slice(0, MAX).map(p => [r5(p[0]), r5(p[1])]);
      if (ok.length) cur[k] = ok; else delete cur[k];
      D().settings.groupPts = cur;
    });
  }

  /* ---------- 地図：中心の印（係が置く・見るときだけ。伝道者の地図には出さない） ---------- */
  let layer = null, picking = false;
  const css = document.createElement('style');
  css.textContent = `.gcpin{display:flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 8px;border-radius:22px;background:#6A1B9A;color:#fff;border:3px solid #fff;box-shadow:0 2px 6px #0006;font:800 16px/1 system-ui,sans-serif;white-space:nowrap;box-sizing:border-box}
.gcpin.dim{background:#9E9E9E}
.gcbox{background:#fff;border:2px solid var(--line);border-radius:12px;padding:4px 12px 10px;margin:4px 0 16px}
.gcbox h3{display:flex;align-items:center;margin:10px 0 4px}
.gcrow{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.gcrow p{margin:0}
.gcpt{display:grid;grid-template-columns:1fr;gap:8px;border:2px solid var(--line);border-radius:12px;padding:10px 12px;margin:0 0 10px;background:#fff}
.gcpt .krow{display:flex;flex-wrap:wrap;gap:8px}
.gcpt .krow .btn{flex:1 1 30%;min-width:90px}`;
  document.head.appendChild(css);
  const theMap = () => (typeof map !== 'undefined' && map ? map : null); // map は index.html の let（window には付かない）
  function clearLayer() { const m = theMap(); if (layer && m) m.removeLayer(layer); layer = null; }
  function showPins(g, focus) {
    clearLayer();
    const m = theMap(); if (!m || !window.L) return;
    // 区域の番号の札（labelPane 650）より上に出す
    if (!m.getPane('gcPane')) { m.createPane('gcPane'); m.getPane('gcPane').style.zIndex = 700; m.getPane('gcPane').style.pointerEvents = 'none'; }
    layer = L.layerGroup().addTo(m);
    const label = (gg, i, n) => `${esc(gg)}${n > 1 ? '・' + (i + 1) : ''}`;
    // 置いているグループの印を濃く、ほかのグループは薄く（重なり具合が分かるように）
    liveGroups().forEach(gg => {
      const ps = ptsOf(gg);
      ps.forEach((p, i) => L.marker(p, { pane: 'gcPane', interactive: false, keyboard: false, zIndexOffset: gg === g ? 1000 : 0,
        icon: L.divIcon({ className: '', html: `<div class="gcpin${gg === g ? '' : ' dim'}" data-notr>${label(gg, i, ps.length)}</div>`, iconSize: [60, 44], iconAnchor: [30, 22] }) }).addTo(layer));
    });
    if (focus) m.setView(focus, Math.max(15, Math.min(16, m.getZoom())));
  }

  /* 地図で場所をえらぶ（pickPlace は index.html の地図のタップで呼ばれる） */
  function pick(g, idx) {
    const ps = ptsOf(g);
    closeSheet(); showView('map');
    picking = true;
    setTimeout(() => {
      const m = theMap(); if (!m) return;
      // 家の印が押せない広さ（16まで）で見せる。中心は「だいたいこのあたり」でよいため
      if (ps[idx]) m.setView(ps[idx], Math.min(16, Math.max(14, m.getZoom())));
      else if (ps.length) m.setView(ps[0], 14);
      else if (typeof fitAll === 'function') fitAll();
      showPins(g);
    }, 150);
    pickPlace = ll => {
      picking = false;
      const next = ps.slice();
      next[idx] = [ll.lat, ll.lng];
      savePts(g, next, idx < ps.length ? `${g}グループの中心を動かしました` : `${g}グループの中心を置きました`);
      backToGroup(g);
    };
    toast(`${g}グループの人が、だいたい住んでいるあたりをタップしてください`, null, { label: 'やめる', fn: () => cancelPick(g) });
  }
  function cancelPick(g) {
    if (!picking) return;
    picking = false; pickPlace = null; clearLayer();
    backToGroup(g);
  }
  function backToGroup(g) {
    clearLayer();
    showView('admin');
    if (typeof setAdPane === 'function') setAdPane('people');
    renderPeople();
    openGroup(g);
  }
  // ほかの画面に移ったら、えらぶのをやめる（あとで地図をさわって、思わず置いてしまわないように）
  const _showView = window.showView;
  window.showView = function (name) {
    if (name !== 'map') { if (picking) { picking = false; pickPlace = null; } clearLayer(); }
    return _showView.apply(this, arguments);
  };

  /* ---------- 係の画面：グループの中心のシート ---------- */
  function openGroup(g) {
    if (!isAdmin()) return;
    const ps = ptsOf(g), s = summary().by.get(g);
    const info = s ? `いちばん近いのがこのグループの区域：${s.n}枚${s.urg ? `（そのうち急ぎ ${s.urg}枚）` : ''}` : '';
    setSheet(headHtml(null, `${esc(g)}グループの中心`, `${groupMembers(g).length}人のグループ`) + `
      <p class="hint">このグループの人が、だいたい住んでいるあたりです。グループ奉仕の区域を「近い順」「おすすめ順」で並べるときに使います。${helpBtn('groupPts')}</p>
      ${ps.length ? ps.map((p, i) => `<div class="gcpt"><b>中心${ps.length > 1 ? i + 1 : ''}</b>
        <div class="krow"><button type="button" class="btn small" data-gcsee="${i}">地図で見る</button>
          <button type="button" class="btn small" data-gcmove="${i}">動かす</button>
          <button type="button" class="btn small danger" data-gcdel="${i}">消す</button></div></div>`).join('')
        : '<div class="notice">まだ中心を置いていません。置くまでは、このグループの「近い順」は今いる場所から計ります。</div>'}
      ${info ? `<p class="muted">${info}</p>` : ''}
      ${ps.length < MAX ? `<button type="button" class="btn ${ps.length ? '' : 'primary '}block" data-gcadd>${ps.length ? '＋ 2つ目の中心を置く' : '中心を地図に置く'}</button>
        ${ps.length ? '<p class="hint">グループの人の住まいが、2か所に分かれているときだけ置きます。区域は、近いほうの中心から計ります。</p>' : ''}` : ''}
      <button type="button" class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    const add = $('[data-gcadd]', S); if (add) add.onclick = () => pick(g, ps.length);
    $$('[data-gcmove]', S).forEach(b => b.onclick = () => pick(g, Number(b.dataset.gcmove)));
    $$('[data-gcsee]', S).forEach(b => b.onclick = () => {
      const p = ps[Number(b.dataset.gcsee)]; if (!p) return;
      closeSheet(); showView('map');
      setTimeout(() => showPins(g, p), 150);
      toast(`${g}グループの中心です（紫の印）。ほかのグループは灰色です`, null, { label: 'もどる', fn: () => backToGroup(g) });
    });
    $$('[data-gcdel]', S).forEach(b => b.onclick = () => {
      const i = Number(b.dataset.gcdel), next = ps.filter((_, j) => j !== i);
      savePts(g, next, next.length ? `${g}グループの中心を1つ消しました` : `${g}グループの中心を消しました`);
      openGroup(g);
    });
  }
  /* 使われなくなったグループ（名前を変えた・なくなった）の中心を消す */
  function dropOld(k) {
    commit(`使われていないグループ「${k}」の中心を消しました`, () => {
      const cur = Object.assign({}, allPts()); delete cur[k]; D().settings.groupPts = cur;
    });
  }

  /* ---------- 係の画面「人」：グループの中心の欄（区域係だけ） ---------- */
  function boxHtml() {
    const groups = groupsAll();
    const { by, farList } = summary();
    const old = Object.keys(allPts()).filter(k => !groups.includes(k) && Array.isArray(allPts()[k]) && allPts()[k].length);
    const rows = groups.map(g => {
      const n = ptsOf(g).length, s = by.get(g);
      const sub = n ? `中心 ${n}つ${s ? `・近い区域 ${s.n}枚${s.urg ? `（急ぎ ${s.urg}枚）` : ''}` : ''}` : 'まだ置いていません';
      return `<div class="gcrow"><div><b>${esc(g)}グループ</b><p class="muted">${sub}</p></div>
        <button type="button" class="btn small${n ? '' : ' primary'}" data-gcopen="${esc(g)}">${n ? '見る・直す' : '中心を置く'}</button></div>`;
    }).join('');
    const farTxt = farList.length ? `<p class="muted" style="margin-top:8px">どのグループの中心からも${fmtDist(FAR_M)}以上はなれた区域：${farList.length}枚（区域番号 ${farList.slice(0, 10).map(t => esc(t.no)).join(', ')}${farList.length > 10 ? ' …' : ''}）。全体の集まりの「集まりに合う区域」で、少し先に出します。</p>` : '';
    const oldTxt = old.map(k => `<div class="gcrow"><div><b>${esc(k)}</b><p class="muted">今はこのグループの人がいません（名前を変えたときなど）</p></div>
        <button type="button" class="btn small danger" data-gcold="${esc(k)}">消す</button></div>`).join('');
    return `<h3 class="sub">グループの中心${helpBtn('groupPts')}</h3>
      <p class="hint">グループの人がだいたい住んでいるあたりを地図に置くと、グループ奉仕の区域を、そのグループに近い順に出せます。名前や住所は使いません。</p>
      ${groups.length ? rows : '<p class="muted">グループがまだありません。下の一覧で、人にグループを決めてください。</p>'}${oldTxt}${farTxt}`;
  }
  function paintBox() {
    const box = document.getElementById('adPeople');
    if (!box || !isAdmin()) return;
    let el = document.getElementById('gcBox');
    if (!el) {
      el = document.createElement('section'); el.id = 'gcBox'; el.className = 'gcbox';
      el.addEventListener('click', e => {
        const o = e.target.closest('[data-gcopen]'); if (o) { openGroup(o.dataset.gcopen); return; }
        const d = e.target.closest('[data-gcold]'); if (d) dropOld(d.dataset.gcold);
      });
    }
    el.innerHTML = boxHtml();
    // 「人とグループ」の見出し・ボタン・説明のすぐあと（人の一覧の前）に置く。描き直しを飛ばしたとき（入力中）は、置いた場所のまま
    if (el.parentNode !== box) {
      const first = box.querySelector('article.trow');
      if (first) box.insertBefore(el, first); else box.appendChild(el);
    }
  }
  const _renderPeople = window.renderPeople;
  window.renderPeople = function () {
    const r = _renderPeople.apply(this, arguments);
    try { paintBox(); } catch (e) { console.error(e); }
    return r;
  };
})();
