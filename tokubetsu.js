/* =========================================================
   tokubetsu.js  特別区域を、決めた件数ずつのカードに分ける（2026-10-21）

   ・コンビニ・オートロックなどの特別区域は、全域で集めると1枚に入る件数が多くなりすぎる。
     計画的に続けて回れるよう、となり合う家を「1枚あたり○件」ずつのカードに自動で分ける
     （コンビニは10件・オートロックは12件がはじめの値）。作る人は、地図で分け方と件数を見ながら、
     件数を変えたり、家をタップして別のカードに移したりできる
   ・分けたカードは、それぞれが1つの特別区域（区域番号「S1-1」「S1-2」…）。受け取り・返却・S-13 はふつうの区域と同じ
       special.ids … そのカードで回る家（線ではなく家で決める。となりのカードと重ならない）
       special.grp … 同じ条件から分けたカードの組の印　special.gn … 組の名前（例：コンビニ）
   ・特別区域で回る家は、ふつうの区域カードには「訪ねる家」として出さない（special.excl。はじめは外す）。
     係の画面の区域の一覧で、組ごとに「ふつうのカードから：外す／外さない」を切りかえられる
   ・カードに入っていない家（あとから登録した店など）は、組の画面で「近いカードに入れる」

   index.html：kyoukai.js のあとに <script src="tokubetsu.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof setSheet !== 'function') return;

  const PAL = ['#C2410C', '#1D4ED8', '#047857', '#7C3AED', '#B45309', '#BE185D', '#0E7490', '#4D7C0F'];
  /* カードの分け方（sp.by）：'bld' 建物（家）の数・'room' 部屋の数。作る人がえらぶ（2026-10-22）
     はじめは、集合住宅だけなら部屋の数（建物ごとに部屋の数がちがうため。1枚40部屋くらい）。
     オートロックは住民への配慮から、1回に訪ねる建物を少なくしたいので建物の数（1枚4件まで）。ほかは建物の数（10件まで） */
  const evOnly = sp => (sp.ev === 'y' || sp.ev === 'n') && !sp.apt && !sp.lock && !(sp.kinds || []).length;
  const defBy = sp => ((sp.apt || evOnly(sp)) && !sp.lock ? 'room' : 'bld');
  const byRoom = sp => !!sp && (sp.by ? sp.by === 'room' : defBy(sp) === 'room');
  const sizeDef = sp => (byRoom(sp) ? 40 : sp.lock && !sp.apt && !(sp.kinds || []).length ? 4 : 10);
  const MIN_SIZE = 1, MAX_SIZE = 60, MAX_ROOM = 150, ROOM_STEP = 5;
  /* 分け方の切りかえ（集合住宅が入っているときだけ出す） */
  const bySeg = (room, attr) => `<div class="seg tk-by" role="group" aria-label="カードの分け方"><button type="button" ${attr}="bld" aria-pressed="${!room}">建物の数で分ける</button><button type="button" ${attr}="room" aria-pressed="${room}">部屋の数で分ける</button></div>`;
  const sizeMax = sp => (byRoom(sp) ? MAX_ROOM : MAX_SIZE);
  const sizeStep = sp => (byRoom(sp) ? ROOM_STEP : 1);
  const unitWord = sp => (byRoom(sp) ? '部屋' : '件');

  const css = document.createElement('style');
  css.textContent = `
.tk-count{background:#EEF3F8;border-radius:12px;padding:10px 12px;margin:10px 0;font-size:16px;line-height:1.5}
.tk-count b{font-size:20px}
.tk-size{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0}
.tk-size .stepper output{min-width:4.5em}
.spgrp{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;background:#F4EEFA;border:2px solid #CDB6E3;border-radius:12px;padding:8px 10px;margin:14px 0 6px}
.spgrp .stamp{background:#6A1B9A;border-color:#6A1B9A;color:#fff}
.spgrp b{font-size:16px}
.spgrp .muted{font-size:14px}
.spgrp .spx{display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%}
.spgrp .spx > span{font-size:14px}
.spgrp .seg button{min-height:40px;padding:0 12px;font-size:15px}
.spgrp .btn.small{margin-left:auto}
.spnote{background:#F4EEFA;border-left:5px solid #6A1B9A}
.tokbar .tkchips{display:flex;gap:6px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch}
.tokbar .tkchip{flex:none;min-height:42px;border-radius:21px;border:3px solid var(--line);background:#fff;padding:0 12px;font-size:15px;font-weight:700;white-space:nowrap}
.tokbar .tkchip[aria-pressed=true]{background:#FFF7E6;box-shadow:0 0 0 2px #111 inset}
.tokbar .tkstat{font-weight:700;font-size:17px}
.tokbar .tkrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;align-items:center}
.tokbar .tkrow .btn{flex:1 1 auto}
.tokbar .stepper{gap:6px;margin-left:auto}
.tokbar .stepper button{width:46px;height:44px;font-size:24px}
.tokbar .stepper output.wide{min-width:5.2em;font-size:18px}
.tokbar .senhint{margin:4px 0 0;font-size:14px}
.tok-pt{width:22px;height:22px;border-radius:50%;border:2px solid #fff;color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center;box-shadow:0 1px 4px #0006}
.tok-pt.sel{width:28px;height:28px;font-size:14px;outline:3px solid #111}
.tok-lbl span{display:inline-block;transform:translate(-50%,-50%);background:#fff;border:2px solid;border-radius:10px;padding:1px 8px;font-weight:700;font-size:14px;white-space:nowrap;box-shadow:0 1px 3px #0004}
`;
  document.head.appendChild(css);

  /* ---------- 集める・分ける（画面がなくても動く） ---------- */
  const fakeT = sp => ({ special: sp, lentAt: '' });
  const unitsOf = (h, sp) => targets(h).filter(u => spMatch(h, u, fakeT(sp)));
  /* 条件に合う家（区域の外の家はのぞく） */
  function matchHouses(sp) {
    const t = fakeT(sp);
    return D().houses.filter(h => h.terrId && targets(h).some(u => spMatch(h, u, t)));
  }
  /* 緯度経度をメートルの平面に（この範囲では十分な近似） */
  function proj(hs, wf) {
    if (!hs.length) return [];
    const la0 = hs.reduce((s, h) => s + h.lat, 0) / hs.length, k = Math.cos(la0 * Math.PI / 180);
    return hs.map(h => ({ id: h.id, x: h.lng * 111320 * k, y: h.lat * 110540, w: wf ? Math.max(1, wf(h)) : 1 }));
  }
  /* となり合う家を size 件ずつ（1枚あたり size 件まで）に分ける。
     ①端の家から近い順に集める ②2つのカードの家を入れかえて、まとまりがよくなるなら入れかえる（件数は変わらない） */
  function cluster(P, size) {
    const N = P.length;
    if (!N) return [];
    if (P.some(p => p.w > 1)) return clusterW(P, size);
    const n = Math.max(1, Math.ceil(N / Math.max(1, size)));
    const base = Math.floor(N / n), extra = N % n;
    const cap = g => base + (g < extra ? 1 : 0);
    const left = new Set(P.map((_, i) => i)), groups = [];
    const d2 = (a, x, y) => (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
    for (let g = 0; g < n && left.size; g++) {
      let cx = 0, cy = 0;
      left.forEach(i => { cx += P[i].x; cy += P[i].y; });
      cx /= left.size; cy /= left.size;
      let seed = -1, far = -1;
      left.forEach(i => { const d = d2(P[i], cx, cy); if (d > far) { far = d; seed = i; } });
      const grp = [seed]; left.delete(seed);
      let gx = P[seed].x, gy = P[seed].y;
      while (grp.length < cap(g) && left.size) {
        let pick = -1, bd = Infinity;
        left.forEach(i => { const d = d2(P[i], gx, gy); if (d < bd) { bd = d; pick = i; } });
        grp.push(pick); left.delete(pick);
        gx += (P[pick].x - gx) / grp.length; gy += (P[pick].y - gy) / grp.length;
      }
      groups.push(grp);
    }
    if (left.size) groups[groups.length - 1].push(...left);
    // 入れかえてまとまりをよくする（時間の上限つき）
    const cent = g => { let x = 0, y = 0; g.forEach(i => { x += P[i].x; y += P[i].y; }); return { x: x / g.length, y: y / g.length }; };
    const t0 = Date.now();
    for (let it = 0; it < 40 && Date.now() - t0 < 600; it++) {
      let moved = false;
      const C = groups.map(cent);
      for (let a = 0; a < groups.length; a++) {
        for (let b = a + 1; b < groups.length; b++) {
          const ga = groups[a], gb = groups[b];
          for (let ia = 0; ia < ga.length; ia++) {
            for (let ib = 0; ib < gb.length; ib++) {
              const i = ga[ia], j = gb[ib];
              const cur = d2(P[i], C[a].x, C[a].y) + d2(P[j], C[b].x, C[b].y);
              const sw = d2(P[i], C[b].x, C[b].y) + d2(P[j], C[a].x, C[a].y);
              if (sw + 1 < cur) { ga[ia] = j; gb[ib] = i; C[a] = cent(ga); C[b] = cent(gb); moved = true; }
            }
          }
        }
      }
      if (!moved) break;
    }
    // 北から南へ、同じくらいの高さなら西から東へ、番号を付ける（およそ1km ごとの帯）
    const C = groups.map(cent);
    return groups.map((g, i) => ({ g, c: C[i] })).sort((a, b) => Math.round(-a.c.y / 1000) - Math.round(-b.c.y / 1000) || a.c.x - b.c.x).map(x => x.g.map(i => P[i].id));
  }
  /* 部屋の数（重み）で分ける：1枚あたり size 部屋くらいになるよう、近い建物から集める。
     部屋の多い建物は、それだけで1枚になることがある。入れかえは、部屋の数が同じ建物どうしだけ（合計を変えない） */
  function clusterW(P, size) {
    const W = P.reduce((a, p) => a + p.w, 0);
    const n = Math.max(1, Math.ceil(W / Math.max(1, size))), target = W / n;
    const left = new Set(P.map((_, i) => i)), groups = [];
    const d2 = (a, x, y) => (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
    while (left.size) {
      let cx = 0, cy = 0;
      left.forEach(i => { cx += P[i].x; cy += P[i].y; });
      cx /= left.size; cy /= left.size;
      let seed = -1, far = -1;
      left.forEach(i => { const d = d2(P[i], cx, cy); if (d > far) { far = d; seed = i; } });
      const grp = [seed]; left.delete(seed);
      let sum = P[seed].w, gx = P[seed].x, gy = P[seed].y;
      while (sum < target && left.size) {
        let pick = -1, bd = Infinity;
        left.forEach(i => { const d = d2(P[i], gx, gy); if (d < bd) { bd = d; pick = i; } });
        if (sum + P[pick].w > Math.max(target * 1.15, size)) break; // 入れると大きくなりすぎる
        grp.push(pick); left.delete(pick); sum += P[pick].w;
        gx += (P[pick].x - gx) / grp.length; gy += (P[pick].y - gy) / grp.length;
      }
      groups.push(grp);
    }
    // 小さすぎるカード（目安の3分の1未満）は、いちばん近いカードにまとめる（大きくなりすぎない範囲で）
    const cent = g => { let x = 0, y = 0; g.forEach(i => { x += P[i].x; y += P[i].y; }); return { x: x / g.length, y: y / g.length }; };
    const wsum = g => g.reduce((a, i) => a + P[i].w, 0);
    for (let k = groups.length - 1; k >= 0 && groups.length > 1; k--) {
      const g = groups[k]; if (wsum(g) >= target / 3) continue;
      const c = cent(g);
      let best = -1, bd = Infinity;
      groups.forEach((o, j) => { if (j === k || wsum(o) + wsum(g) > size * 1.25) return; const cc = cent(o); const d = (cc.x - c.x) ** 2 + (cc.y - c.y) ** 2; if (d < bd) { bd = d; best = j; } });
      if (best >= 0) { groups[best].push(...g); groups.splice(k, 1); }
    }
    const t0 = Date.now();
    for (let it = 0; it < 30 && Date.now() - t0 < 600; it++) {
      let moved = false;
      const C = groups.map(cent);
      for (let a = 0; a < groups.length; a++) {
        for (let b = a + 1; b < groups.length; b++) {
          const ga = groups[a], gb = groups[b];
          for (let ia = 0; ia < ga.length; ia++) {
            for (let ib = 0; ib < gb.length; ib++) {
              const i = ga[ia], j = gb[ib];
              if (P[i].w !== P[j].w) continue;
              const cur = d2(P[i], C[a].x, C[a].y) + d2(P[j], C[b].x, C[b].y);
              const sw = d2(P[i], C[b].x, C[b].y) + d2(P[j], C[a].x, C[a].y);
              if (sw + 1 < cur) { ga[ia] = j; gb[ib] = i; C[a] = cent(ga); C[b] = cent(gb); moved = true; }
            }
          }
        }
      }
      if (!moved) break;
    }
    const C = groups.map(cent);
    return groups.map((g, i) => ({ g, c: C[i] })).sort((a, b) => Math.round(-a.c.y / 1000) - Math.round(-b.c.y / 1000) || a.c.x - b.c.x).map(x => x.g.map(i => P[i].id));
  }
  window.TokubetsuCore = { cluster, proj };

  /* ---------- 組（同じ条件から分けたカード） ---------- */
  const grpOf = t => (spOf(t).grp || '');
  const cardsOfGrp = g => D().territories.filter(t => isSpecial(t) && grpOf(t) === g).sort(byNo);
  const grpName = t => spOf(t).gn || t.name || specialKindsText(t);
  const nextPrefix = () => { for (let i = 1; i < 100; i++) { const p = 'S' + i; if (!D().territories.some(x => x.no === p || String(x.no).startsWith(p + '-'))) return p; } return 'S' + Date.now().toString(36).slice(-3); };
  const prefixOf = cards => { const m = cards.length ? String(cards[0].no).match(/^(.*)-\d+$/) : null; return m ? m[1] : (cards[0] ? cards[0].no : nextPrefix()); };
  const unitsCount = (ids, sp) => ids.reduce((a, id) => { const h = HID.get(id); return a + (h ? unitsOf(h, sp).length : 0); }, 0);
  const sizeLine = gs => { const c = new Map(); gs.forEach(g => c.set(g.length, (c.get(g.length) || 0) + 1)); return [...c.entries()].sort((a, b) => b[0] - a[0]).map(([k, n]) => `${k}件${n > 1 ? `×${n}` : ''}`).join('・'); };

  /* ---------- 特別区域をつくる・直す（係の画面の「特別区域をつくる」と、区域の一覧の「条件を変える」） ---------- */
  const _openSpecialSheet = window.openSpecialSheet;
  /* ほかの特別区域にも入っている家（例：集合住宅をえらぶと、オートロックの特別区域の建物も入る）。同じ家を2つのカードで訪ねないように */
  const otherSp = () => D().territories.filter(t => isSpecial(t));
  const overlapOf = hs => { const os = otherSp(); return os.length ? hs.filter(h => os.some(t => inSpecial(h, t))) : []; };
  const F = { noDup: true, name: '', autoName: '', prefix: '', kinds: [], lock: false, unmet: false, apt: false, ev: '', by: '', excl: true, size: 10, sizeSet: false };
  const spFromF = () => { const sp = spPickData(F); sp.by = F.by || defBy(sp); return sp; };
  function openCreate(reset) {
    if (!isAdmin()) return;
    if (reset) Object.assign(F, { noDup: true, name: '', autoName: '', prefix: nextPrefix(), kinds: [], lock: false, unmet: false, apt: false, ev: '', by: '', excl: true, size: 10, sizeSet: false });
    const sp = spFromF();
    const ok = spPickOk(F);
    if (!F.sizeSet) F.size = sizeDef(sp);
    F.size = Math.max(MIN_SIZE, Math.min(F.size, sizeMax(sp)));
    const all0 = ok ? matchHouses(sp) : [], dup = overlapOf(all0), dupIds = new Set(dup.map(h => h.id));
    const hs = F.noDup && dup.length ? all0.filter(h => !dupIds.has(h.id)) : all0, nU = hs.reduce((a, h) => a + unitsOf(h, sp).length, 0);
    const room = byRoom(sp), hasApt = hs.some(h => h.type === 'apt');
    const nC = hs.length ? Math.ceil((room ? nU : hs.length) / F.size) : 0; // 部屋で分けるときは、およその枚数
    setSheet(headHtml(null, '特別区域をつくる', 'コンビニ・オートロックなどを集めたカード') + `
      <p class="hint">えらんだ種別の家だけを全域から集めて、となり合う家を、決めた数ずつのカードに分けます。分け方は、次の画面の地図で確かめられます。</p>
      <label class="field">名前 <input type="text" id="spName" maxlength="20" value="${esc(F.name)}" placeholder="例：コンビニ・オートロック"></label>
      <label class="field">区域番号のはじめ <input type="text" id="spNo" maxlength="8" value="${esc(F.prefix)}" autocomplete="off"><small class="hint">カードの番号は「${esc(F.prefix || 'S1')}-1」「${esc(F.prefix || 'S1')}-2」…になります</small></label>
      ${spPickHtml(F)}
      ${dup.length ? `<div class="notice warn">ほかの特別区域にも入っている家が ${dup.length}件あります。<label class="check"><input type="checkbox" id="spNoDup"${F.noDup ? ' checked' : ''}>その家は入れない（同じ家を2つのカードで訪ねないように）</label></div>` : ''}
      <div class="tk-count">${ok ? `<b>${nU !== hs.length ? `合う家：${hs.length}件（部屋をふくめ ${nU}）` : `合う家：${hs.length}件`}</b>` : '種別をえらぶと、合う家の数が出ます'}</div>
      ${ok && hs.length ? `${hasApt ? bySeg(room, 'data-tkby') + `<p class="hint">${room ? '部屋の数で分けると、部屋の多い建物は1枚に1棟だけになることがあります。' : '建物の数で分けると、1回に訪ねる建物の数をおさえられます（オートロックなど、住民への配慮が必要なとき）。'}</p>` : ''}
        <div class="tk-size"><span>1枚あたり</span><div class="stepper"><button type="button" data-tksz="-1" aria-label="${unitWord(sp)}の数を減らす">−</button><output class="wide">${F.size}${unitWord(sp)}${room ? 'くらい' : 'まで'}</output><button type="button" data-tksz="1" aria-label="${unitWord(sp)}の数を増やす">＋</button></div>
        <b>→ ${room ? '約' : ''}${nC}枚</b></div>` : ''}
      <label class="check"><input type="checkbox" id="spExcl"${F.excl && !F.unmet ? ' checked' : ''}${F.unmet ? ' disabled' : ''}>この家を、ふつうの区域カードから外す（2回訪ねないように）</label>
      ${F.unmet ? '<p class="hint">「一度も会えていない家だけ」の特別区域は、ふつうの区域カードからは外しません（会えると対象が変わるため）。</p>' : ''}
      <button class="btn primary block" id="spGo"${ok && hs.length ? '' : ' disabled'}>地図で分け方を見る</button>
      <button class="btn block" id="spOne"${ok && hs.length ? '' : ' disabled'}>分けずに1枚のカードにする</button>
      <button class="btn block" data-close>やめる</button>`);
    const S = $('#sheet');
    const keep = () => { F.name = $('#spName').value.trim(); F.prefix = normNo($('#spNo').value); const ex = $('#spExcl'); if (ex && !ex.disabled) F.excl = ex.checked; };
    spPickBind(S, F, () => {
      keep();
      if (!F.apt && !F.lock) F.by = ''; // 集合住宅がなくなったら、分け方もはじめにもどす
      if (!F.by) F.sizeSet = false;     // 分け方を自分でえらんでいなければ、種別に合う大きさにもどす
      const auto = specialKindsText({ special: spPickData(F) });
      if (!F.name || F.name === F.autoName) { F.name = auto.slice(0, 20); F.autoName = F.name; }
      sheetKeep = true; openCreate();
    });
    if ($('#spNoDup', S)) $('#spNoDup', S).onchange = e => { keep(); F.noDup = e.target.checked; sheetKeep = true; openCreate(); };
    $$('[data-tkby]', S).forEach(b => b.onclick = () => { keep(); if (F.by === b.dataset.tkby || (!F.by && defBy(spFromF()) === b.dataset.tkby)) return; F.by = b.dataset.tkby; F.sizeSet = false; sheetKeep = true; openCreate(); });
    $$('[data-tksz]', S).forEach(b => b.onclick = () => { keep(); const sp0 = spFromF(); F.size = Math.max(MIN_SIZE, Math.min(sizeMax(sp0), F.size + Number(b.dataset.tksz) * sizeStep(sp0))); F.sizeSet = true; sheetKeep = true; openCreate(); });
    const check = () => {
      keep();
      if (!F.prefix || !NO_RE.test(F.prefix)) { toast('区域番号のはじめは、英数字で入れてください（例：S1）'); return false; }
      if (D().territories.some(x => x.no === F.prefix || String(x.no).startsWith(F.prefix + '-'))) { toast(`「${F.prefix}」ではじまる区域が、もうあります`); return false; }
      return true;
    };
    $('#spGo').onclick = () => {
      if (!check()) return;
      const sp2 = Object.assign(spFromF(), { excl: F.unmet ? false : F.excl });
      startSplit({ sp: sp2, name: F.name || specialKindsText({ special: sp2 }), prefix: F.prefix, size: F.size, hs: pickIds(sp2), back: () => openCreate() });
    };
    $('#spOne').onclick = () => {
      if (!check()) return;
      const sp2 = Object.assign(spFromF(), { excl: F.unmet ? false : F.excl });
      const name = (F.name || specialKindsText({ special: sp2 })).slice(0, 30), no = F.prefix;
      const pts = polyTerrs().flatMap(x => x.polygon.map(v => [v[0], v[1], 1]));
      const all = pts.length ? pts : D().houses.map(h => [h.lat, h.lng]);
      closeSheet();
      // ほかの特別区域の家をのぞくときは、家を名指しした1枚のカードにする（線では分けられないため）
      const ids = pickIds(sp2), hasDup = ids.length !== matchHouses(sp2).length;
      commit(`特別区域 ${no}（${name}）をつくりました`, () => {
        if (hasDup) D().territories.push({ id: 't' + uid(), no, name, polygon: hullOf(ids), special: Object.assign({}, sp2, { ids }), holder: null, lentAt: null, lend: 'auto' });
        else D().territories.push({ id: 't' + uid(), no, name, polygon: xlHull(all, 120), special: sp2, holder: null, lentAt: null, lend: 'auto' });
      });
    };
    function pickIds(sp2) {
      const all = matchHouses(sp2);
      if (!F.noDup) return all.map(h => h.id);
      const d = new Set(overlapOf(all).map(h => h.id));
      return all.filter(h => !d.has(h.id)).map(h => h.id);
    }
  }

  /* 組（または分けていない特別区域）の画面 */
  function openGroup(tid) {
    const t0 = terrById(tid); if (!t0 || !isAdmin()) return;
    const g = grpOf(t0), cards = g ? cardsOfGrp(g) : [t0], sp = spOf(t0);
    const back = () => openGroup(tid);
    const inCards = new Set(cards.flatMap(t => (spIds(t) ? [...spIds(t)] : [])));
    const own = new Set(cards.map(t => t.id)), others = otherSp().filter(t => !own.has(t.id));
    const notOther = h => !others.some(t => inSpecial(h, t)); // ほかの特別区域の家は、この組に入れない
    const orphan = g ? matchHouses(sp).filter(h => !inCards.has(h.id) && notOther(h)) : [];
    const excl = spExcludes(t0) || (sp.excl !== false && !sp.unmet);
    setSheet(headHtml(null, `特別区域 ${esc(g ? prefixOf(cards) : t0.no)}：${esc(grpName(t0))}`, `${cards.length}枚・種別：${esc(specialKindsText(t0))}`) + `
      <p class="q">ふつうの区域カードから</p>
      ${sp.unmet ? '<p class="hint">「一度も会えていない家」の特別区域は、ふつうの区域カードから外しません。</p>' : `<div class="seg" role="group" aria-label="ふつうの区域カードから外すか">
        <button type="button" data-tgx="1" aria-pressed="${excl}">外す（2回訪ねない）</button><button type="button" data-tgx="0" aria-pressed="${!excl}">外さない</button></div>
        <p class="hint">「外す」にすると、この家は、ふつうの区域カードの地図に「特」の印で薄く出て、訪ねる家に数えません。貸出中止にしたカードの家は、ふつうの区域カードにもどります。</p>`}
      <p class="q">カード</p>
      ${cards.map(t => { const n = housesOf(t.id).length, u = housesOf(t.id).reduce((a, h) => a + specialTargets(h, t).length, 0); return `<div class="tlrow"><span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span><div>
        <p><b>${n}件</b>${u !== n ? `（部屋 ${u}）` : ''}${typeof evTag === 'function' ? evTag(t) : ''}</p><p class="muted">${t.holder ? `貸出中：${esc(uname(t.holder))}さん` : lendMode(t) === 'stop' ? '貸出中止' : '空いています'}</p></div>
        <div class="btns"><button type="button" class="btn small" data-tgmap="${t.id}">地図</button>${window.KM && window.KM.openKarte ? `<button type="button" class="btn small primary" data-tgkarte="${t.id}">カルテ</button>` : ''}</div></div>`; }).join('')}
      ${orphan.length ? `<div class="notice warn">どのカードにも入っていない家が ${orphan.length}件あります（あとから登録した店など）。<div class="actions"><button type="button" class="btn small primary" id="tgOrphan">近いカードに入れる</button></div></div>` : ''}
      ${g ? `<button class="btn block primary" id="tgSplit">地図で分け直す（件数を変える・家を移す）</button>` : `<button class="btn block primary" id="tgSplit">件数で分ける（地図で分け方を見る）</button>`}
      ${g ? '' : '<button class="btn block" id="tgCond">条件を変える</button>'}
      <details class="tk-more"><summary>消す</summary><p class="hint">特別区域のカードを消しても、家と訪問の記録は、ふつうの区域にそのまま残ります。</p>
        <button class="btn danger block" id="tgDel">${g ? `この特別区域の${cards.length}枚を全部消す` : 'この特別区域を消す'}</button></details>
      <button class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    $$('[data-tgx]', S).forEach(b => b.onclick = () => setExcl(cards, b.dataset.tgx === '1', back));
    $$('[data-tgmap]', S).forEach(b => b.onclick = () => { closeSheet(); openTerr(b.dataset.tgmap); });
    $$('[data-tgkarte]', S).forEach(b => b.onclick = () => window.KM.openKarte(b.dataset.tgkarte, back));
    if ($('#tgOrphan')) $('#tgOrphan').onclick = () => addOrphans(cards, orphan, back);
    if ($('#tgCond')) $('#tgCond').onclick = () => _openSpecialSheet(tid);
    $('#tgSplit').onclick = () => {
      const lentIds = new Set(cards.filter(t => t.holder).flatMap(t => housesOf(t.id).map(h => h.id)));
      const hs = matchHouses(sp).filter(h => !lentIds.has(h.id) && (inCards.has(h.id) || notOther(h))).map(h => h.id);
      if (!hs.length) { toast('分け直せる家がありません（貸出中のカードの家は動かせません）'); return; }
      const free = cards.filter(t => !t.holder);
      const room = byRoom(sp), tot = room ? hs.reduce((a, id) => { const h = HID.get(id); return a + (h ? unitsOf(h, sp).length : 0); }, 0) : hs.length;
      const size = g ? Math.max(MIN_SIZE, Math.min(sizeMax(sp), Math.round(tot / Math.max(1, free.length)))) : sizeDef(sp);
      startSplit({ sp: Object.assign({}, sp), name: grpName(t0), prefix: g ? prefixOf(cards) : t0.no, size, hs, edit: { g, cards, single: g ? null : t0 }, back });
    };
    $('#tgDel').onclick = async () => {
      const lent = cards.filter(t => t.holder);
      if (!await ask(`特別区域「${grpName(t0)}」の${cards.length}枚を消します。${lent.length ? `\n貸出中のカード（${lent.map(t => t.no).join('・')}）の貸し出しも終わります。` : ''}\n家と訪問の記録は、ふつうの区域に残ります。よろしいですか？`, { ok: '消す' })) return;
      closeSheet();
      commit(`特別区域「${grpName(t0)}」を消しました`, () => cards.forEach(t => deleteTerrData(t.id, false)));
    };
  }
  function setExcl(cards, on, after) {
    commit(on ? '特別区域の家を、ふつうの区域カードから外しました' : '特別区域の家を、ふつうの区域カードでも回るようにしました', () => {
      cards.forEach(t => { const x = terrById(t.id); if (x) x.special = Object.assign({}, x.special, { excl: on }); });
    });
    if (after) after();
  }
  function addOrphans(cards, orphan, after) {
    const free = cards.filter(t => spIds(t));
    if (!free.length) return;
    const cen = new Map(free.map(t => { const hs = housesOf(t.id); return [t.id, hs.length ? [hs.reduce((s, h) => s + h.lat, 0) / hs.length, hs.reduce((s, h) => s + h.lng, 0) / hs.length] : center(t.polygon)]; }));
    commit(`カードに入っていなかった家 ${orphan.length}件を、近いカードに入れました`, () => {
      orphan.forEach(h => {
        let best = null, bd = Infinity;
        free.forEach(t => { const d = distM(cen.get(t.id), [h.lat, h.lng]); if (d < bd) { bd = d; best = t; } });
        if (!best) return;
        const x = terrById(best.id);
        const ids = (x.special.ids || []).concat(h.id);
        x.special = Object.assign({}, x.special, { ids });
        x.polygon = hullOf(ids);
      });
    });
    if (after) after();
  }
  const hullOf = ids => { const pts = ids.map(id => HID.get(id)).filter(Boolean).map(h => [h.lat, h.lng]); return pts.length ? xlHull(pts, 40) : []; };

  window.openSpecialSheet = function (tid) {
    if (!tid) { openCreate(true); return; }
    const t = terrById(tid);
    if (!t || !isSpecial(t)) { _openSpecialSheet(tid); return; }
    openGroup(tid);
  };

  /* ---------- 地図で分け方を見る（mode 'tok'） ---------- */
  let P = null, lay = null;
  function ensureBar() {
    if ($('#tokBar')) return;
    const bar = document.createElement('div');
    bar.className = 'modebar senbar tokbar'; bar.id = 'tokBar'; bar.hidden = true;
    bar.innerHTML = '<div class="barhead"><p><b id="tokTitle"></b></p><button class="foldbtn" id="tokEnd">やめる</button></div><div id="tokBody"></div>';
    const d = $('#drawBar');
    d.parentNode.insertBefore(bar, d.nextSibling);
    $('#tokEnd').onclick = () => finish(true);
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-tok]'); if (!b) return;
      act(b.dataset.tok, b.dataset);
    });
  }
  function startSplit(o) {
    const hs = o.hs.map(id => HID.get(id)).filter(Boolean);
    if (!o.sp.by) o.sp.by = defBy(o.sp);
    P = Object.assign({}, o, { groups: cluster(proj(hs, wfOf(o.sp)), o.size), sel: 0, hasApt: hs.some(h => h.type === 'apt') });
    closeSheet();
    ensureBar();
    try { firstMapShow = false; zoomHintShown = true; } catch (e) { /* 何もしない */ }
    showView('map');
    if (!lay) lay = L.layerGroup().addTo(map);
    setMode('tok');
    $('#tokBar').hidden = false;
    paint();
    const b = L.latLngBounds(hs.map(h => [h.lat, h.lng]));
    setTimeout(() => { map.invalidateSize(); if (b.isValid()) map.fitBounds(b, { paddingTopLeft: [16, ($('#tokBar').offsetHeight || 0) + 20], paddingBottomRight: [16, 30], maxZoom: 17 }); }, 80);
  }
  function regroup() {
    const hs = P.groups.flat().map(id => HID.get(id)).filter(Boolean);
    P.groups = cluster(proj(hs, wfOf(P.sp)), P.size);
    P.sel = Math.min(P.sel, P.groups.length - 1);
    paint();
  }
  const wfOf = sp => (byRoom(sp) ? h => unitsOf(h, sp).length : null);
  /* カードの大きさ：集合住宅は部屋の数、ほかは家の件数 */
  const gCount = g => (byRoom(P.sp) ? g.reduce((a, id) => { const h = HID.get(id); return a + (h ? unitsOf(h, P.sp).length : 0); }, 0) : g.length);
  function paint() { paintBar(); paintMap(); }
  function paintBar() {
    const gs = P.groups, n = gs.reduce((a, g) => a + gCount(g), 0), uw = unitWord(P.sp);
    $('#tokTitle').textContent = `特別区域：${P.name}`;
    $('#tokBody').innerHTML = `
      <div class="tkrow"><span class="tkstat">${n}${uw} → ${gs.length}枚</span><div class="stepper" role="group" aria-label="1枚あたりの${uw}の数"><button type="button" data-tok="size" data-d="-1" aria-label="1枚あたりの${uw}の数を減らす">−</button><output class="wide">${P.size}${uw}${byRoom(P.sp) ? 'くらい' : 'まで'}</output><button type="button" data-tok="size" data-d="1" aria-label="1枚あたりの${uw}の数を増やす">＋</button></div></div>
      ${P.hasApt ? bySeg(byRoom(P.sp), 'data-tok="by" data-v') : ''}
      <div class="tkchips" role="group" aria-label="カード">${gs.map((g, i) => `<button type="button" class="tkchip" data-tok="sel" data-i="${i}" aria-pressed="${i === P.sel}" style="border-color:${PAL[i % PAL.length]}">${esc(P.prefix)}-${i + 1}（${gCount(g)}）</button>`).join('')}</div>
      <p class="senhint">印をタップすると ${esc(P.prefix)}-${P.sel + 1} に移します。カードを押すと、そこを見せます。（　）は${byRoom(P.sp) ? '部屋の数' : '件数'}です。</p>
      <div class="tkrow"><button type="button" class="btn small primary" data-tok="ok">この分け方でつくる</button><button type="button" class="btn small" data-tok="back">条件にもどる</button></div>`;
  }
  const lbl = (ll, text, col) => L.marker(ll, { icon: L.divIcon({ className: 'tok-lbl', html: `<span style="border-color:${col};color:${col}">${esc(text)}</span>`, iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' });
  function paintMap() {
    if (!lay) return;
    lay.clearLayers();
    P.groups.forEach((g, gi) => {
      const col = PAL[gi % PAL.length], on = gi === P.sel;
      const hs = g.map(id => HID.get(id)).filter(Boolean);
      if (!hs.length) return;
      if (hs.length >= 2) L.polygon(xlHull(hs.map(h => [h.lat, h.lng]), 25), { color: col, weight: on ? 5 : 3, dashArray: on ? null : '6 5', fillColor: col, fillOpacity: on ? 0.16 : 0.05, interactive: false }).addTo(lay);
      const c = [hs.reduce((s, h) => s + h.lat, 0) / hs.length, hs.reduce((s, h) => s + h.lng, 0) / hs.length];
      lbl(c, `${P.prefix}-${gi + 1}（${gCount(g)}）`, col).addTo(lay);
      hs.forEach(h => {
        const m = L.marker([h.lat, h.lng], { icon: L.divIcon({ className: '', html: `<div class="tok-pt${on ? ' sel' : ''}" style="background:${col}">${gi + 1}</div>`, iconSize: [on ? 28 : 22, on ? 28 : 22], iconAnchor: [on ? 14 : 11, on ? 14 : 11] }), keyboard: false, zIndexOffset: on ? 2000 : 1000, title: h.label || '' });
        m.on('click', () => moveTo(h.id));
        m.addTo(lay);
      });
    });
  }
  function moveTo(hid) {
    const from = P.groups.findIndex(g => g.includes(hid)), to = P.sel;
    if (from < 0 || from === to) { if (from >= 0) toast(`すでに ${P.prefix}-${to + 1} に入っています`); return; }
    if (P.groups[from].length <= 1) { toast('カードの家が1件だけのときは移せません'); return; }
    P.groups[from] = P.groups[from].filter(x => x !== hid);
    P.groups[to].push(hid);
    paint();
    const uw = unitWord(P.sp);
    toast(`${P.prefix}-${to + 1} に移しました（${P.prefix}-${to + 1}：${gCount(P.groups[to])}${uw}・${P.prefix}-${from + 1}：${gCount(P.groups[from])}${uw}）`);
  }
  function act(k, ds) {
    if (k === 'by') { if (ds.v === P.sp.by) return; P.sp = Object.assign({}, P.sp, { by: ds.v }); P.size = sizeDef(P.sp); regroup(); return; }
    if (k === 'size') { P.size = Math.max(MIN_SIZE, Math.min(sizeMax(P.sp), P.size + Number(ds.d) * sizeStep(P.sp))); regroup(); return; }
    if (k === 'sel') {
      P.sel = Number(ds.i); paint();
      const hs = P.groups[P.sel].map(id => HID.get(id)).filter(Boolean);
      if (hs.length) { const b = L.latLngBounds(hs.map(h => [h.lat, h.lng])); map.fitBounds(b, { paddingTopLeft: [16, ($('#tokBar').offsetHeight || 0) + 30], paddingBottomRight: [16, 40], maxZoom: 18 }); }
      return;
    }
    if (k === 'back') { const b = P.back; finish(false); if (b) b(); return; }
    if (k === 'ok') { save(); return; }
  }
  function finish(toAdmin) {
    if (lay) lay.clearLayers();
    if ($('#tokBar')) $('#tokBar').hidden = true;
    if (mode === 'tok') setMode('normal');
    P = null;
    if (toAdmin) { showView('admin'); }
  }
  async function save() {
    const o = P; if (!o) return;
    const gs = o.groups.filter(g => g.length);
    const e = o.edit;
    if (e && e.g) {
      const free = e.cards.filter(t => !t.holder);
      const drop = free.slice(gs.length);
      if (drop.length && !await ask(`カードが${free.length}枚から${gs.length}枚になります。使わなくなるカード（${drop.map(t => t.no).join('・')}）は消えます（家と記録は、ふつうの区域に残ります）。よろしいですか？`, { ok: '分け直す' })) return;
    }
    const grp = e && e.g ? e.g : 'g' + uid();
    const used = new Set(D().territories.map(t => String(t.no)));
    let idx = 0;
    const nextNo = () => { let no; do { idx++; no = `${o.prefix}-${idx}`; } while (used.has(no)); used.add(no); return no; };
    const name = (o.name || specialKindsText({ special: o.sp })).slice(0, 20);
    const finishMsg = e ? `特別区域「${name}」を${gs.length}枚に分け直しました` : `特別区域「${name}」を${gs.length}枚のカードにしました`;
    finish(false);
    commit(finishMsg, () => {
      const base = Object.assign({}, o.sp, { grp, gn: name });
      delete base.ids;
      const reuse = e && e.g ? e.cards.filter(t => !t.holder).map(t => terrById(t.id)).filter(Boolean) : [];
      gs.forEach((ids, i) => {
        const sp = Object.assign({}, base, { ids: ids.slice() });
        const r = reuse[i];
        if (r) { r.special = sp; r.polygon = hullOf(ids); r.name = `${name} ${String(r.no).split('-').pop()}`; return; }
        const no = nextNo();
        D().territories.push({ id: 't' + uid(), no, name: `${name} ${no.split('-').pop()}`, polygon: hullOf(ids), special: sp, holder: null, lentAt: null, lend: 'auto' });
      });
      reuse.slice(gs.length).forEach(t => deleteTerrData(t.id, false));
      if (e && e.single && terrById(e.single.id) && !e.single.holder) deleteTerrData(e.single.id, false); // 分けていなかった特別区域は、分けたカードに置きかえる
      if (e && e.g) e.cards.filter(t => t.holder).forEach(t => { const x = terrById(t.id); if (x) x.special = Object.assign({}, x.special, { gn: name, excl: base.excl }); });
    });
    showView('admin');
    // できたカードの組の画面を見せる（「外す／外さない」と、カードごとの件数を確かめられる）
    setTimeout(() => { const c = D().territories.find(t => spOf(t).grp === grp); if (c) openGroup(c.id); }, 60);
  }
  function onMode(m) { if (m !== 'tok' && P) { if (lay) lay.clearLayers(); if ($('#tokBar')) $('#tokBar').hidden = true; P = null; } }

  /* ---------- 係の画面「区域」の一覧：特別区域の組の見出し（外す／外さないの切りかえ） ---------- */
  function paintGroupHeads() {
    const list = document.getElementById('adTerrs');
    if (!list) return;
    const seen = new Set();
    $$('.trow', list).forEach(row => {
      const o = row.querySelector('[data-open]'), t = o ? terrById(o.dataset.open) : null;
      if (!t || !isSpecial(t)) return;
      const key = grpOf(t) || t.id;
      if (seen.has(key)) return;
      seen.add(key);
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains('spgrp')) return;
      const cards = grpOf(t) ? cardsOfGrp(grpOf(t)) : [t], sp = spOf(t);
      const n = cards.reduce((a, x) => a + housesOf(x.id).length, 0), ex = sp.excl !== false && !sp.unmet;
      row.insertAdjacentHTML('beforebegin', `<div class="spgrp"><span class="stamp sm">特</span><b>特別区域：${esc(grpName(t))}</b>
        <span class="muted">${cards.length}枚・${n}件・${esc(specialKindsText(t))}</span>
        <button type="button" class="btn small" data-spg="${t.id}">設定</button>
        ${sp.unmet ? '' : `<div class="spx"><span>ふつうの区域カードから</span><div class="seg" role="group" aria-label="ふつうの区域カードから外すか">
          <button type="button" data-spx="${t.id}" data-v="1" aria-pressed="${ex}">外す</button><button type="button" data-spx="${t.id}" data-v="0" aria-pressed="${!ex}">外さない</button></div></div>`}</div>`);
    });
    if (!list.dataset.spbound) {
      list.dataset.spbound = '1';
      list.addEventListener('click', e => {
        const g = e.target.closest('[data-spg]'); if (g) { openGroup(g.dataset.spg); return; }
        const x = e.target.closest('[data-spx]'); if (!x) return;
        const t = terrById(x.dataset.spx); if (!t) return;
        const on = x.dataset.v === '1';
        if ((spOf(t).excl !== false) === on) return;
        setExcl(grpOf(t) ? cardsOfGrp(grpOf(t)) : [t], on);
      });
    }
  }
  const _renderAdmin = window.renderAdmin;
  window.renderAdmin = function () {
    const r = _renderAdmin.apply(this, arguments);
    try { if (isAdmin() && adPane === 'terr') paintGroupHeads(); } catch (e) { console.error(e); }
    return r;
  };

  /* ---------- 家の記録の画面：特別区域で回る家のお知らせ ---------- */
  window.spNotice = function (h, unit) {
    if (!h) return '';
    const u = unit || '';
    if (h.type === 'apt' && !unit) return '';
    const t = coverOf(h, u);
    if (!t || myTerr(t)) return '';
    const w = unit ? '部屋' : '家';
    return `<div class="notice spnote"><b>特別区域 ${esc(t.no)}（${esc(grpName(t))}）で回る${w}です。</b>ふつうの区域カードでは、訪ねなくてよい${w}です。</div>`;
  };

  // 記録の画面（くわしい・かんたん・二世帯・アパートの続けて入力）は、どれも注意（！）のお知らせを出す。そのすぐ下に続けて出す
  const _chui = window.chuiNotice;
  if (typeof _chui === 'function') window.chuiNotice = (h, u) => _chui(h, u) + window.spNotice(h, u);

  window.tokubetsu = { click: () => {}, onMode, open: openGroup, create: () => openCreate(true), active: () => typeof mode !== 'undefined' && mode === 'tok' };
})();
