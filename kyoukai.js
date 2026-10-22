/* =========================================================
   kyoukai.js  区域の線を直す（区域係だけ）（2026-10-19）

   使い方：地図で区域をタップしてえらぶ → 下のボタンから、やりたいことを1つえらぶ
     ・形を直す ……… 今までの線の直し方（点を動かす・足す・消す）。隣と共有している点は一緒に動く
     ・となりに合わせる … 隣の区域の線との小さなずれ（数m）を、ボタン1つでそろえる（共有の点にする）
     ・分ける ……… 区域を横切る線を引くと、2つの区域に分かれる（番号は「5-4」のように付ける）
     ・1つにする …… となりの区域をタップすると、2つが1つになる
     ・すき間・重なり … 区域のあいだのすき間と、重なっている所を赤く出し、どちらの区域にするかをえらんで直す
     ・戻す ……… この画面で行った操作を、1つずつ元にもどす
   作業中は、家の印を隠して線を見やすくする。ボタンは、そのとき使えるものだけを出す

   データ：D().territories の polygon（[緯度, 経度] の並び）を直す。家の区域は reassign() で決め直す
   計算：polygon-clipping（vendor）を使う。共有している点は、元の点の値をそのまま使う（隣と同じ点のままにする）

   index.html：<script src="chui.js"></script> などのあとに <script src="kyoukai.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof L === 'undefined') return;

  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.33')) {
    CHANGELOG.unshift({ v: '2026.13.33', items: [
      ['線', '区域係の「線を直す」が新しくなりました。地図で区域をタップして、「形を直す」「となりに合わせる」「分ける」「1つにする」からえらびます'],
      ['線', '区域のあいだのすき間と重なりを赤く出し、どちらの区域にするかをえらぶだけで直せます'],
      ['線', '点を動かすとき、点が指の少し上に出るので、指にかくれずに合わせられます。隣の区域と共有している点は、隣と一緒に動きます']
    ] });
  }

  if (typeof LIB !== 'undefined' && !LIB.pclip) LIB.pclip = 'vendor/polygon-clipping-0.15.7/polygon-clipping.umd.min.js';

  /* ---------- 決まりの数 ---------- */
  const TAP_PX = 22;          // 点にくっつく近さ（画面の上の距離）
  const OV_MIN = 1;           // これより小さい重なり（㎡）は、計算のずれとみなす
  const GAP_MIN = 1;          // これより小さいすき間（㎡）は、計算のずれとみなす
  const GAP_MAX = 5000;       // これより大きい囲まれた部分は、わざと区域にしていない所（基地・公園など）とみなす
  const HOLE_DROP = 150;      // 1つにしたとき、これより小さい穴は区域に入れてしまう
  const COL_A = '#C2410C', COL_B = '#1D4ED8', COL_ISSUE = '#DC2626';

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .senbar .senhint{margin:6px 0 0;font-size:15px;line-height:1.5;color:var(--ink2)}
  .senbar .sengrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  .senbar .sengrid .btn{width:100%;padding:0 8px;font-size:17px}
  .senbar .sengrid .btn i{font-style:normal;font-size:19px}
  .senbar .senrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .senbar .senrow .btn{flex:1 1 auto}
  .senbar .senstat{margin:6px 0 0;font-weight:700}
  .senbar .senstat .ov{color:${COL_ISSUE}}
  .sen-lbl span{display:inline-block;transform:translate(-50%,-50%);background:#fff;border:3px solid currentColor;border-radius:10px;padding:2px 8px;font-weight:900;font-size:15px;white-space:nowrap;box-shadow:0 1px 3px #0005}
  .sen-iss{width:30px;height:30px;border-radius:50%;background:${COL_ISSUE};color:#fff;border:3px solid #fff;box-shadow:0 1px 4px #0007;display:grid;place-items:center;font-weight:900;font-size:17px;line-height:1}
  .sen-iss.on{background:#7F1D1D;transform:scale(1.25)}
  path.sen-blink{animation:senBlink 1.1s ease-in-out infinite}
  @keyframes senBlink{50%{fill-opacity:.15;stroke-opacity:.4}}
  @media (prefers-reduced-motion: reduce){path.sen-blink{animation:none}}
  .sen-cut{width:18px;height:18px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 1px 3px #0007}
  .sen-cut.drag{width:28px;height:28px;border-width:4px;cursor:grab;box-shadow:0 0 0 3px #11111133,0 1px 4px #0007}
  .senbar .sencnt{margin:6px 0 0;font-size:15px;line-height:1.5}
  .senbar .sencnt b{font-size:17px}
  .senbar .sencnt .a{color:${COL_A}}.senbar .sencnt .b{color:${COL_B}}
  .lifting>.dv,.lifting>.dmid{transform:scale(1.3);box-shadow:0 0 0 3px #fff,0 0 0 6px var(--draw),0 2px 6px #0007}`;
  document.head.appendChild(css);

  /* ---------- 状態 ---------- */
  // tid：えらんでいる区域／tool：null・split・merge・fit・check
  const S = { tid: null, tool: null, cut: [], split: null, fit: null, issues: [], ii: -1, scope: null, undo: [], drawSnap: null };
  let lay = null;

  /* ---------- 計算の道具 ---------- */
  const pc = () => window.polygonClipping;
  async function ensurePc() {
    if (pc()) return true;
    try { await loadScript(LIB.pclip); } catch (e) { /* 下で知らせる */ }
    if (!pc()) toast('計算の部品を読み込めませんでした。インターネットにつながる所で、もう一度開いてください');
    return !!pc();
  }
  const toPC = ring => [[...ring, ring[0]].map(p => [p[1], p[0]])];   // [経度, 緯度]、閉じた形
  const fromRing = r => { const a = r.map(p => [p[1], p[0]]); if (a.length > 1 && a[0][0] === a[a.length - 1][0] && a[0][1] === a[a.length - 1][1]) a.pop(); return a; };
  const key8 = p => p[0].toFixed(8) + ',' + p[1].toFixed(8);
  /* 計算した形の点を、元の区域の点の値にそろえる（隣と共有している点を、同じ点のままにする） */
  function exactify(ring, sources) {
    const m = new Map();
    sources.forEach(poly => poly.forEach(p => m.set(key8(p), p)));
    const all = [...m.values()];
    return dropDup(ring.map(p => {
      const o = m.get(key8(p));
      if (o) return [o[0], o[1]];
      // 計算でできた、元の角のすぐ近く（25cm以内）の点は、元の角にする
      const k = 111320 * Math.cos(p[0] * Math.PI / 180);
      let best = null, bd = 0.25;
      for (const q of all) { const d = Math.hypot((q[0] - p[0]) * 110574, (q[1] - p[1]) * k); if (d < bd) { bd = d; best = q; } }
      return best ? [best[0], best[1]] : p;
    }));
  }
  /* 平らな座標（m）にする：区域くらいの広さなら、これで十分 */
  function projector(o) {
    const kx = 111320 * Math.cos(o[0] * Math.PI / 180), ky = 110574;
    return { f: p => [(p[1] - o[1]) * kx, (p[0] - o[0]) * ky], b: q => [o[0] + q[1] / ky, o[1] + q[0] / kx] };
  }
  function segHit(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    if (t < 0 || t > 1 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { t, u: Math.max(0, Math.min(1, u)) };
  }
  function nearOnSeg(q, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    const p = [a[0] + dx * u, a[1] + dy * u];
    return { u, p, d: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  }
  function pipXY(q, R) {
    let c = false;
    for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
      const [xi, yi] = R[i], [xj, yj] = R[j];
      if (((yi > q[1]) !== (yj > q[1])) && (q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  /* 線が自分と交差していないか（区域の形がこわれていないか） */
  function selfCross(ring) {
    const P = projector(ring[0]), R = ring.map(P.f), n = R.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const h = segHit(R[i], R[(i + 1) % n], R[j], R[(j + 1) % n]);
        if (h && h.t > 1e-6 && h.t < 1 - 1e-6 && h.u > 1e-6 && h.u < 1 - 1e-6) return true;
      }
    }
    return false;
  }
  const bbM = (poly, m) => { const b = bboxOf(poly), dl = m / 110574, dn = m / (111320 * Math.cos(b[0] * Math.PI / 180)); return [b[0] - dl, b[1] + dl, b[2] - dn, b[3] + dn]; };
  const bbHit = (a, b) => !(a[1] < b[0] || b[1] < a[0] || a[3] < b[2] || b[3] < a[2]);
  /* となりの区域（線が m メートル以内に来るもの） */
  function neighbors(t, m) {
    const b = bbM(t.polygon, m);
    return polyTerrs().filter(x => x.id !== t.id && bbHit(b, bboxOf(x.polygon)));
  }
  const mpp = () => { const c = map.getCenter(); return 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8); }; // 1画面点あたりのm
  const area = ring => (ring && ring.length >= 3 ? ringAreaM2(ring) : 0);
  const m2 = a => (a >= 100 ? `${Math.round(a).toLocaleString()}㎡` : `${a.toFixed(a < 10 ? 1 : 0)}㎡`);
  const tno = id => { const t = terrById(id); return t ? t.no : '?'; };

  /* ---------- 区域を地図の点からえらぶ（小さい区域を先に） ---------- */
  function terrAt(ll) {
    const hit = polyTerrs().filter(t => inPoly(ll.lat, ll.lng, t.polygon));
    if (!hit.length) return null;
    hit.sort((a, b) => (a.rest ? 1 : 0) - (b.rest ? 1 : 0) || area(a.polygon) - area(b.polygon));
    return hit[0];
  }

  /* ---------- 分ける ----------
     cut：引いた線（[緯度, 経度] の並び）。はしは区域の外までのばして考えるので、区域の中から引き始めてもよい
     区域を最初に横切る所で、2つの形にする */
  function splitRing(ring, cut) {
    if (cut.length < 2) return null;
    const P = projector(ring[0]), R = ring.map(P.f), n = R.length, C0 = cut.map(P.f);
    const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + dx / l * 20000, a[1] + dy / l * 20000]; };
    const C = [ext(C0[0], C0[1]), ...C0, ext(C0[C0.length - 1], C0[C0.length - 2])];
    let hits = [];
    for (let s = 0; s < C.length - 1; s++) {
      for (let e = 0; e < n; e++) {
        const h = segHit(C[s], C[s + 1], R[e], R[(e + 1) % n]);
        if (!h) continue;
        const q = [C[s][0] + (C[s + 1][0] - C[s][0]) * h.t, C[s][1] + (C[s + 1][1] - C[s][1]) * h.t];
        hits.push({ s, t: h.t, e, u: h.u, q });
      }
    }
    hits.sort((a, b) => a.s - b.s || a.t - b.t);
    hits = hits.filter((h, i) => !i || Math.hypot(h.q[0] - hits[i - 1].q[0], h.q[1] - hits[i - 1].q[1]) > 0.05); // 角を通ったとき、同じ所が2回出る
    for (let k = 0; k + 1 < hits.length; k++) {
      const a = hits[k], b = hits[k + 1];
      const mid = a.s === b.s ? [(a.q[0] + b.q[0]) / 2, (a.q[1] + b.q[1]) / 2] : [(a.q[0] + C[a.s + 1][0]) / 2, (a.q[1] + C[a.s + 1][1]) / 2];
      if (!pipXY(mid, R)) continue;
      const llOf = h => (h.u < 1e-6 ? ring[h.e].slice() : h.u > 1 - 1e-6 ? ring[(h.e + 1) % n].slice() : P.b(h.q));
      const inner = C.slice(a.s + 1, b.s + 1).map(P.b); // 区域の中を通る、引いた線の点
      const walk = (A, B) => {
        const out = [];
        if (A.e === B.e && A.u <= B.u) return out;
        let k2 = (A.e + 1) % n; out.push(k2);
        let guard = 0;
        while (k2 !== B.e && guard++ < n + 2) { k2 = (k2 + 1) % n; out.push(k2); }
        return out;
      };
      const qa = llOf(a), qb = llOf(b);
      const r1 = dropDup([qa, ...walk(a, b).map(i => ring[i].slice()), qb, ...inner.slice().reverse()]);
      const r2 = dropDup([qb, ...walk(b, a).map(i => ring[i].slice()), qa, ...inner]);
      if (r1.length < 3 || r2.length < 3 || area(r1) < 5 || area(r2) < 5) return { err: '分けたあとの区域が小さすぎます。線を引き直してください' };
      if (selfCross(r1) || selfCross(r2)) return { err: '線が区域の線と交わっています。区域を1回だけ横切るように引いてください' };
      return { a: r1, b: r2 };
    }
    return { err: hits.length ? '線が区域の中を通っていません' : '線が区域を横切っていません' };
  }
  function nextKidNo(base) {
    const nos = new Set(D().territories.map(t => String(t.no)));
    let i = 1;
    while (nos.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
  /* 線の中の家・部屋の数（集合住宅は部屋ごと。特別区域で回る部屋は、ふつうの区域カードに入らないので数えない） */
  function countIn(tid, ring) {
    const t = terrById(tid), o = { n: 0, house: 0, apt: 0, units: 0 };
    housesOf(tid).forEach(h => {
      if (ring && !inPoly(h.lat, h.lng, ring)) return;
      const us = typeof unitsIn === 'function' ? unitsIn(h, t) : targets(h);
      if (!us.length) return;
      o.n += us.length;
      if (h.type === 'apt') { o.apt++; o.units += us.length; } else o.house++;
    });
    return o;
  }
  const housesIn = (tid, ring) => countIn(tid, ring).n;
  const cntText = c => `家・部屋 ${c.n}${c.apt ? `（一戸建てなど ${c.house}・集合住宅 ${c.apt}棟 ${c.units}部屋）` : ''}`;

  /* ---------- となりに合わせる ----------
     この区域の角を、近く（tol m 以内）の隣の点・線にそろえ、隣の点が線のすぐ近くにあれば、その点を足す */
  function fitRing(t, tol) {
    const ring = t.polygon, P = projector(ring[0]), R = ring.map(P.f), n = R.length;
    const nb = neighbors(t, tol).map(x => ({ t: x, pts: x.polygon, xy: x.polygon.map(P.f) }));
    if (!nb.length) return null;
    const done = new Set(); let moved = 0, added = 0;
    const sn = R.map((q, i) => {
      let best = null, bd = tol;
      nb.forEach(o => o.xy.forEach((w, k) => { const d = Math.hypot(w[0] - q[0], w[1] - q[1]); if (d < bd) { bd = d; best = o.pts[k]; } }));
      if (best) { if (bd > 0.01) moved++; return { ll: best.slice(), xy: P.f(best) }; }
      let bq = null; bd = tol;
      nb.forEach(o => { const m = o.xy.length; for (let k = 0; k < m; k++) { const c = nearOnSeg(q, o.xy[k], o.xy[(k + 1) % m]); if (c.d < bd) { bd = c.d; bq = c.p; } } });
      if (bq && bd > 0.05) { moved++; return { ll: P.b(bq), xy: bq }; }
      return { ll: ring[i].slice(), xy: q };
    });
    sn.forEach(s => done.add(key8(s.ll)));
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(sn[i].ll);
      const a = sn[i].xy, b = sn[(i + 1) % n].xy, cands = [];
      nb.forEach(o => o.xy.forEach((w, k) => {
        const c = nearOnSeg(w, a, b);
        if (c.u <= 0.001 || c.u >= 0.999 || c.d >= tol) return;
        const kk = key8(o.pts[k]);
        if (done.has(kk)) return;
        done.add(kk); cands.push({ u: c.u, ll: o.pts[k].slice() });
      }));
      cands.sort((x, y) => x.u - y.u).forEach(c => { out.push(c.ll); added++; });
    }
    const ring2 = dropDup(out);
    if (!moved && !added) return { same: true };
    if (ring2.length < 3 || selfCross(ring2)) return { err: 'うまく合わせられませんでした（線が交わってしまいます）。「形を直す」で点を動かしてください' };
    const a0 = area(ring), a1 = area(ring2);
    if (a0 && Math.abs(a1 - a0) / a0 > 0.25) return { err: '合わせると形が大きく変わってしまいます。少し拡大して、もう一度ためしてください' };
    return { ring: ring2, moved, added, nb: nb.map(o => o.t.id) };
  }

  /* ---------- すき間・重なりを探す ---------- */
  function findIssues(tid) {
    const P = pc(); if (!P) return [];
    const all = polyTerrs();
    const t = tid ? terrById(tid) : null;
    const scope = t ? [t, ...neighbors(t, 3)] : all;
    const bb = new Map(scope.map(x => [x.id, bboxOf(x.polygon)]));
    const out = [];
    // 重なり
    for (let i = 0; i < scope.length; i++) {
      for (let j = i + 1; j < scope.length; j++) {
        const a = scope[i], b = scope[j];
        if (t && a.id !== t.id && b.id !== t.id) continue;
        if (!bbHit(bb.get(a.id), bb.get(b.id))) continue;
        let r;
        try { r = P.intersection(toPC(a.polygon), toPC(b.polygon)); } catch (e) { continue; }
        r.forEach(poly => { const ring = fromRing(poly[0]); const ar = area(ring); if (ar >= OV_MIN) out.push({ k: 'ov', a: a.id, b: b.id, ring, area: ar }); });
      }
    }
    // すき間（区域に囲まれて、どの区域にも入っていない所）
    // 区域どうしが「点だけ」でふれていると、すき間が外とつながっているとみなされてしまう。
    // そこで、2つ以上の区域がふれている点に小さな四角（5cm）を置いてつなげてから、囲まれた所を探す
    const tiny = touchPoints(scope).map(p => sqAt(p, 0.05));
    let u = null;
    try { u = P.union(...scope.map(x => toPC(x.polygon)), ...tiny); } catch (e) { u = null; }
    (u || []).forEach(poly => poly.slice(1).forEach(h => {
      const raw = fromRing(h);
      if (area(raw) < GAP_MIN || area(raw) > GAP_MAX) return;
      const adj = scope.filter(x => touches(raw, x.polygon));
      if (t && !adj.some(x => x.id === t.id)) return;
      if (!adj.length) return;
      // 本当のすき間の形：四角の分を広げてから、区域を引く（区域の線ぴったりの形になる）
      let g = null;
      try { g = P.difference(P.union(toPC(raw), ...raw.map(p => sqAt(p, 0.12))), ...adj.map(x => toPC(x.polygon))); } catch (e) { g = null; }
      const pieces = (g || []).map(q => fromRing(q[0])).filter(r => r.length >= 3).sort((p1, p2) => area(p2) - area(p1));
      if (!pieces.length) return;
      const ring = exactify(pieces[0], adj.map(x => x.polygon)), ar = area(ring);
      if (ring.length < 3 || ar < GAP_MIN) return;
      out.push({ k: 'gap', ring, area: ar, adj: adj.map(x => x.id) });
    }));
    out.sort((a, b) => b.area - a.area);
    return out;
  }
  /* 四角（m メートル四方の半分＝h）を、polygon-clipping の形で */
  function sqAt(p, h) {
    const dl = h / 110574, dn = h / (111320 * Math.cos(p[0] * Math.PI / 180));
    return [[[p[1] - dn, p[0] - dl], [p[1] + dn, p[0] - dl], [p[1] + dn, p[0] + dl], [p[1] - dn, p[0] + dl], [p[1] - dn, p[0] - dl]]];
  }
  /* 2つ以上の区域がふれている点（同じ角、またはほかの区域の線の上にある角） */
  function touchPoints(scope) {
    const cnt = new Map(), pts = new Map();
    scope.forEach(x => new Set(x.polygon.map(key8)).forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1)));
    scope.forEach(x => x.polygon.forEach(p => { const k = key8(p); if (cnt.get(k) > 1) pts.set(k, p); }));
    const bb = new Map(scope.map(x => [x.id, bbM(x.polygon, 1)]));
    scope.forEach(x => {
      const P = projector(x.polygon[0]);
      scope.forEach(y => {
        if (y === x || !bbHit(bb.get(x.id), bb.get(y.id))) return;
        const Y = y.polygon.map(P.f), m = Y.length;
        x.polygon.forEach(p => {
          const k = key8(p); if (pts.has(k)) return;
          const q = P.f(p);
          for (let i = 0; i < m; i++) if (nearOnSeg(q, Y[i], Y[(i + 1) % m]).d < 0.05) { pts.set(k, p); break; }
        });
      });
    });
    return [...pts.values()];
  }
  function touches(ring, poly) {
    const P = projector(ring[0]), R = poly.map(P.f), m = R.length;
    return ring.some(p => { const q = P.f(p); for (let k = 0; k < m; k++) if (nearOnSeg(q, R[k], R[(k + 1) % m]).d < 0.5) return true; return false; });
  }

  /* ---------- 元にもどせるように控える ---------- */
  function snapNow() {
    return JSON.stringify({ t: D().territories, s13: D().s13 || [], cards: (D().awayCards || []).map(c => [c.id, c.endedAt || null]), req: (D().requests || []).map(r => [r.id, r.terrId || null]) });
  }
  function doCommit(msg, fn) {
    S.undo.push({ msg, snap: snapNow() });
    if (S.undo.length > 20) S.undo.shift();
    commit(msg, fn);
  }
  function undoLast() {
    const u = S.undo.pop();
    if (!u) { toast('もどせる操作はありません'); return; }
    const o = JSON.parse(u.snap);
    commit(`元にもどしました（${u.msg}）`, () => {
      D().territories = o.t;
      D().s13 = o.s13;
      const ce = new Map(o.cards);
      (D().awayCards || []).forEach(c => { if (!ce.has(c.id)) return; const v = ce.get(c.id); if (v) c.endedAt = v; else delete c.endedAt; });
      const rq = new Map(o.req);
      (D().requests || []).forEach(r => { if (rq.has(r.id)) r.terrId = rq.get(r.id); });
      reassign();
    });
    if (S.tid && !terrById(S.tid)) S.tid = null;
    setTool(null);
  }

  /* ---------- 画面（上の帯） ---------- */
  function ensureBar() {
    if ($('#senBar')) return;
    const bar = document.createElement('div');
    bar.className = 'modebar senbar'; bar.id = 'senBar'; bar.hidden = true;
    bar.innerHTML = `<div class="barhead"><p><b id="senTitle"></b></p><button class="foldbtn" id="senEnd">終わる</button></div>
      <p class="senhint" id="senHint"></p><div id="senBody"></div>`;
    const d = $('#drawBar');
    d.parentNode.insertBefore(bar, d.nextSibling);
    $('#senEnd').onclick = close;
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-sen]'); if (!b) return;
      act(b.dataset.sen, b.dataset);
    });
  }
  const btn = (k, label, cls, extra) => `<button type="button" class="btn ${cls || ''}" data-sen="${k}"${extra || ''}>${label}</button>`;
  function paintBar() {
    const t = S.tid ? terrById(S.tid) : null;
    const title = $('#senTitle'), hint = $('#senHint'), body = $('#senBody');
    const undoBtn = S.undo.length ? btn('undo', '↶ 戻す', 'small') : '';
    if (!t) {
      title.textContent = '区域の線を直す';
      if (S.tool === 'check') { paintCheckBar(title, hint, body); return; }
      hint.textContent = '直したい区域をタップしてください。';
      body.innerHTML = `<div class="senrow">${btn('checkAll', '全部の区域のすき間・重なりを調べる', 'small')}${undoBtn}</div>`;
      return;
    }
    title.textContent = `区域${t.no}`;
    if (!S.tool) {
      hint.textContent = 'やりたいことをえらんでください。ほかの区域をタップすると切りかわります。';
      body.innerHTML = `<div class="sengrid">
          ${btn('shape', '<i>✎</i>形を直す')}${btn('fit', '<i>⇆</i>となりに合わせる')}
          ${btn('split', '<i>✂</i>分ける')}${btn('merge', '<i>＋</i>1つにする')}</div>
        <div class="senrow">${btn('check', 'すき間・重なりを調べる', 'small')}${undoBtn}</div>`;
      return;
    }
    if (S.tool === 'split') {
      const sp = S.split;
      hint.textContent = !S.cut.length ? '区域を横切るように、切る線の始まりの場所をタップします。'
        : S.cut.length === 1 ? '線の終わりの場所をタップします。曲げたいときは、曲がる所も順番にタップします。'
          : sp && sp.err ? sp.err : '黒い点を指で動かすと、分かれ方と数がすぐ変わります。よければ「これで分ける」を押します。';
      body.innerHTML = `<p class="sencnt" id="senCnt">${splitCntHtml()}</p><div class="senrow">${S.cut.length ? btn('cutBack', '1つ戻す', 'small') : ''}
        ${sp && sp.a ? btn('splitOk', 'これで分ける', 'small primary') : ''}${btn('cancel', 'やめる', 'small')}</div>`;
      return;
    }
    if (S.tool === 'merge') {
      hint.textContent = `区域${t.no}と1つにする、となりの区域をタップしてください。`;
      body.innerHTML = `<div class="senrow">${btn('cancel', 'やめる', 'small')}</div>`;
      return;
    }
    if (S.tool === 'fit') {
      const f = S.fit;
      hint.textContent = `区域${t.no}の線を、となりの区域の線にそろえます（${f.tol}m以内のずれ）。点線が今の線、オレンジが合わせたあとの線です。`;
      body.innerHTML = `<p class="senstat">角を ${f.moved}か所 動かし、${f.added}か所 足します</p>
        <div class="senrow">${btn('fitOk', 'これで合わせる', 'small primary')}${btn('cancel', 'やめる', 'small')}</div>`;
      return;
    }
    if (S.tool === 'check') paintCheckBar(title, hint, body);
  }
  function paintCheckBar(title, hint, body) {
    const is = S.issues, n = is.length;
    if (!n) {
      hint.textContent = S.tid ? `区域${tno(S.tid)}のまわりに、すき間や重なりはありません。` : 'すき間や重なりは見つかりませんでした。';
      body.innerHTML = `<div class="senrow">${btn('cancel', 'もどる', 'small')}</div>`;
      return;
    }
    const gaps = is.filter(x => x.k === 'gap').length, ovs = n - gaps;
    const x = is[S.ii] || null;
    let head = `<p class="senstat">${gaps ? `すき間 ${gaps}か所` : ''}${gaps && ovs ? '・' : ''}${ovs ? `<span class="ov">重なり ${ovs}か所</span>` : ''}</p>`;
    if (S.autoN) head += `<div class="senrow">${btn('fixAll', `まとめて直す（${S.autoN}か所）`, 'small primary')}</div>`;
    if (!x) {
      hint.textContent = '赤い所が、すき間と重なりです。赤い「！」をタップすると、直し方をえらべます。';
      body.innerHTML = head + `<div class="senrow">${btn('issue', '1か所目を見る', 'small primary', ' data-i="0"')}${btn('cancel', 'もどる', 'small')}</div>`;
      return;
    }
    const nav = `${S.ii > 0 ? btn('issue', '前へ', 'small', ` data-i="${S.ii - 1}"`) : ''}${S.ii < n - 1 ? btn('issue', '次へ', 'small', ` data-i="${S.ii + 1}"`) : ''}${S.undo.length ? btn('undo', '↶ 戻す', 'small') : ''}`;
    if (x.k === 'gap') {
      hint.textContent = `${S.ii + 1}/${n}：すき間（${m2(x.area)}）。どの区域に入れますか？`;
      body.innerHTML = head + `<div class="senrow">${x.adj.map(id => btn('gapTo', `区域${esc(tno(id))}に入れる`, 'small primary', ` data-t="${id}"`)).join('')}</div>
        <div class="senrow">${nav}${btn('cancel', 'もどる', 'small')}</div>`;
    } else {
      hint.textContent = `${S.ii + 1}/${n}：区域${tno(x.a)}と区域${tno(x.b)}が重なっています（${m2(x.area)}）。どちらの区域にしますか？`;
      body.innerHTML = head + `<div class="senrow">${btn('ovTo', `区域${esc(tno(x.a))}にする`, 'small primary', ` data-t="${x.a}"`)}${btn('ovTo', `区域${esc(tno(x.b))}にする`, 'small primary', ` data-t="${x.b}"`)}</div>
        <div class="senrow">${nav}${btn('cancel', 'もどる', 'small')}</div>`;
    }
  }

  /* ---------- 地図に描く ---------- */
  const lbl = (ll, text, col) => L.marker(ll, { icon: L.divIcon({ className: 'sen-lbl', html: `<span style="color:${col}">${esc(text)}</span>`, iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' });
  function paintMap() {
    if (!lay) return;
    lay.clearLayers();
    if (shapeLay) shapeLay.clearLayers();
    const t = S.tid ? terrById(S.tid) : null;
    if (S.tool === 'check') { paintIssues(); return; }
    if (!t) return;
    if (S.tool === 'split' && S.split && S.split.a) {
      paintSplitShape();
    } else if (S.tool === 'fit' && S.fit) {
      L.polygon(t.polygon, { color: '#475569', weight: 3, dashArray: '6 6', fill: false, interactive: false }).addTo(lay);
      L.polygon(S.fit.ring, { color: COL_A, weight: 5, fillColor: COL_A, fillOpacity: 0.12, interactive: false }).addTo(lay);
    } else {
      L.polygon(t.polygon, { color: COL_A, weight: 6, fillColor: COL_A, fillOpacity: 0.14, interactive: false }).addTo(lay);
    }
    if (S.tool === 'merge') {
      neighbors(t, 2).forEach(x => L.polygon(x.polygon, { color: COL_B, weight: 3, dashArray: '8 6', fillColor: COL_B, fillOpacity: 0.06, interactive: false }).addTo(lay));
    }
    if (S.tool === 'split' && S.cut.length) {
      S.cutLine = L.polyline(S.cut, { color: '#111', weight: 3, dashArray: '6 5', interactive: false }).addTo(lay);
      // 切る線の点は、指で動かせる（動かしている間も、分かれ方と数がすぐ変わる）
      S.cut.forEach((p, i) => {
        const m = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="sen-cut drag"></div>', iconSize: [28, 28], iconAnchor: [14, 14] }), draggable: true, keyboard: false, zIndexOffset: 2500 }).addTo(lay);
        m.on('drag', e => { const ll = e.target.getLatLng(); S.cut[i] = [ll.lat, ll.lng]; if (S.cutLine) S.cutLine.setLatLngs(S.cut); liveSplit(); });
        m.on('dragend', () => { recalcSplit(); });
      });
    }
  }
  /* 分けた2つの形と、それぞれの数（地図の上） */
  let shapeLay = null;
  function paintSplitShape() {
    if (!shapeLay) shapeLay = L.layerGroup().addTo(map);
    shapeLay.clearLayers();
    const sp = S.split;
    if (!(S.tool === 'split' && sp && sp.a)) return;
    L.polygon(sp.a, { color: COL_A, weight: 4, fillColor: COL_A, fillOpacity: 0.28, interactive: false }).addTo(shapeLay);
    L.polygon(sp.b, { color: COL_B, weight: 4, fillColor: COL_B, fillOpacity: 0.28, interactive: false }).addTo(shapeLay);
    lbl(center(sp.a), `${sp.na}`, COL_A).addTo(shapeLay);
    lbl(center(sp.b), `${sp.nb}`, COL_B).addTo(shapeLay);
  }
  function splitCntHtml() {
    const t = terrById(S.tid); if (!t) return '';
    const all = S.allCnt || (S.allCnt = countIn(t.id, null));
    const sp = S.split;
    if (!(sp && sp.a)) return `区域${esc(t.no)}：<b>${cntText(all)}</b>`;
    const pct = n => (all.n ? Math.round(n / all.n * 100) : 0);
    return `区域${esc(t.no)}：${all.n}　→　<b class="a">■ オレンジ ${sp.na}</b>（${pct(sp.na)}%）　<b class="b">■ 青 ${sp.nb}</b>（${pct(sp.nb)}%）`;
  }
  /* 点を動かしている間：形と数だけを描き直す（点そのものは作り直さない） */
  let liveRaf = 0;
  function liveSplit() {
    if (liveRaf) return;
    liveRaf = requestAnimationFrame(() => {
      liveRaf = 0;
      const t = terrById(S.tid); if (!t || S.cut.length < 2) return;
      const r = splitRing(t.polygon, S.cut);
      if (r && r.a) {
        const na = housesIn(t.id, r.a), nb = housesIn(t.id, r.b);
        // ドラッグ中は、オレンジ（今の区域）と青を入れかえない（色がちらつかないように）。前と近いほうをオレンジにする
        const prevA = S.split && S.split.a ? center(S.split.a) : null;
        const keepA = prevA ? distM(prevA, center(r.a)) <= distM(prevA, center(r.b)) : (na > nb || (na === nb && area(r.a) >= area(r.b)));
        S.split = keepA ? { a: r.a, b: r.b, na, nb } : { a: r.b, b: r.a, na: nb, nb: na };
      } else S.split = r;
      paintSplitShape();
      const c = $('#senCnt'); if (c) c.innerHTML = splitCntHtml();
      const h = $('#senHint'); if (h) h.textContent = S.split && S.split.err ? S.split.err : '黒い点を指で動かすと、分かれ方と数がすぐ変わります。よければ「これで分ける」を押します。';
    });
  }
  function paintIssues() {
    S.issues.forEach((x, i) => {
      const on = i === S.ii;
      L.polygon(x.ring, { color: COL_ISSUE, weight: on ? 5 : 3, fillColor: COL_ISSUE, fillOpacity: 0.55, interactive: false, className: on ? 'sen-blink' : '' }).addTo(lay);
      const m = L.marker(labelPoint(x.ring), { icon: L.divIcon({ className: '', html: `<div class="sen-iss${on ? ' on' : ''}">！</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: false, zIndexOffset: on ? 3000 : 2500 });
      m.on('click', () => focusIssue(i));
      m.addTo(lay);
    });
    if (S.tid && terrById(S.tid)) L.polygon(terrById(S.tid).polygon, { color: COL_A, weight: 4, fill: false, interactive: false }).addTo(lay);
  }
  function paint() { paintBar(); paintMap(); }

  /* ---------- 地図の表示を区域に合わせる ---------- */
  function fitTo(poly) {
    if (!okPoly(poly)) return;
    const bar = $('#senBar'), top = bar && !bar.hidden ? bar.offsetHeight + 20 : 20;
    map.fitBounds(L.latLngBounds(poly), { paddingTopLeft: [16, top], paddingBottomRight: [16, 40], maxZoom: 19 });
  }
  function focusIssue(i) {
    S.ii = i;
    paint();
    const x = S.issues[i]; if (!x) return;
    const bar = $('#senBar'), top = bar && !bar.hidden ? bar.offsetHeight + 20 : 20;
    const b = L.latLngBounds(x.ring).pad(x.area < 50 ? 3 : 0.8);
    map.fitBounds(b, { paddingTopLeft: [16, top], paddingBottomRight: [16, 40], maxZoom: 20 });
  }

  /* ---------- 入口・出口 ---------- */
  async function open(tid, o) {
    o = o || {};
    if (!isAdmin()) { toast('区域の線を直せるのは、区域係だけです'); return; }
    if (typeof showView === 'function' && currentView !== 'map') showView('map');
    focusCard = null; roundTerr = null; curTerr = null;
    ensureBar();
    if (!lay) lay = L.layerGroup();
    lay.addTo(map);
    setMode('sen');
    renderTerrs(); // 地図の区域の線は、タップしても区域の画面を出さない（ここでえらぶ）
    const t = tid ? terrById(tid) : null;
    S.tid = t && okPoly(t.polygon) ? t.id : null;
    S.tool = null; S.cut = []; S.split = null; S.fit = null; S.issues = []; S.ii = -1;
    paint();
    if (S.tid && !o.keepView) setTimeout(() => fitTo(t.polygon), 60);
    ensurePc();
  }
  function close() {
    S.tid = null; S.tool = null;
    setMode('normal');
    renderTerrs(); renderHouses();
  }
  /* setMode から呼ばれる（ほかの画面に移ったときも、ここで片づける） */
  function onMode(m) {
    const bar = $('#senBar');
    if (bar) bar.hidden = m !== 'sen';
    if (m !== 'sen' && lay && typeof map !== 'undefined' && map) { lay.clearLayers(); lay.remove(); }
    if (m !== 'sen' && shapeLay) shapeLay.clearLayers();
  }
  /* 「形を直す」から戻ってきたとき */
  function back(tid) {
    if (typeof currentView !== 'undefined' && currentView !== 'map') { S.drawSnap = null; return; }
    // 形を直していなければ、「戻す」に入れた控えを消す
    if (S.drawSnap) {
      const changed = JSON.stringify(D().territories) !== JSON.stringify(JSON.parse(S.drawSnap.snap).t);
      if (changed) { S.undo.push(S.drawSnap); if (S.undo.length > 20) S.undo.shift(); }
      S.drawSnap = null;
    }
    open(terrById(tid) ? tid : null, { keepView: true });
  }

  /* ---------- ボタン ---------- */
  function setTool(tool) {
    S.tool = tool; S.cut = []; S.split = null; S.fit = null; S.allCnt = null;
    if (shapeLay) shapeLay.clearLayers();
    if (tool !== 'check') { S.issues = []; S.ii = -1; }
    paint();
  }
  async function act(k, ds) {
    const t = S.tid ? terrById(S.tid) : null;
    if (k === 'undo') { undoLast(); return; }
    if (k === 'cancel') { setTool(null); return; }
    if (k === 'checkAll' || k === 'check') {
      if (!pc() && !await ensurePc()) return;
      toast('調べています…');
      setTimeout(() => {
        S.tool = 'check'; S.scope = k === 'check' ? S.tid : null; S.issues = findIssues(S.scope); markAuto(); S.ii = -1;
        paint();
        if (!S.issues.length) toast('すき間や重なりはありませんでした');
        else { toast(`すき間・重なりが ${S.issues.length}か所 見つかりました`); const b = L.latLngBounds(S.issues.flatMap(x => x.ring)); if (k === 'checkAll') map.fitBounds(b.pad(0.2)); }
      }, 30);
      return;
    }
    if (k === 'fixAll') { fixAll(); return; }
    if (k === 'issue') { focusIssue(Number(ds.i)); return; }
    if (k === 'gapTo') { fixGap(S.issues[S.ii], ds.t); return; }
    if (k === 'ovTo') { fixOv(S.issues[S.ii], ds.t); return; }
    if (!t) return;
    if (k === 'shape') {
      S.drawSnap = { msg: `区域${t.no}の形を直した`, snap: snapNow() };
      startDraw(t.id, { fromSen: true });
      return;
    }
    if (k === 'split') { if (!pc() && !await ensurePc()) return; setTool('split'); return; }
    if (k === 'merge') { if (!pc() && !await ensurePc()) return; setTool('merge'); return; }
    if (k === 'fit') {
      const tol = Math.round(Math.max(2, Math.min(8, mpp() * 14)) * 10) / 10;
      const f = fitRing(t, tol);
      if (!f) { toast(`区域${t.no}のとなりに、区域がありません`); return; }
      if (f.err) { infoSheet('となりに合わせられませんでした', esc(f.err)); return; }
      if (f.same) { toast(`区域${t.no}の線は、となりの区域とそろっています（${tol}m以内のずれはありません）`); return; }
      S.tool = 'fit'; S.fit = Object.assign(f, { tol }); S.cut = []; S.split = null;
      paint();
      return;
    }
    if (k === 'fitOk') {
      const f = S.fit; if (!f) return;
      doCommit(`区域${t.no}の線を、となりの区域に合わせました`, () => { const x = terrById(t.id); if (x) { x.polygon = f.ring; reassign(); } });
      setTool(null);
      return;
    }
    if (k === 'cutBack') { S.cut.pop(); recalcSplit(); return; }
    if (k === 'splitOk') { openSplitSheet(); return; }
  }

  /* ---------- 地図のタップ ---------- */
  function click(ll) {
    if (S.tool === 'split') {
      const t = terrById(S.tid); if (!t) return;
      // 区域の角の近くなら、その角にくっつける（角を通って切れる）
      let p = [ll.lat, ll.lng], bd = TAP_PX;
      const q = map.latLngToContainerPoint(ll);
      t.polygon.forEach(v => { const d = q.distanceTo(map.latLngToContainerPoint(v)); if (d < bd) { bd = d; p = v.slice(); } });
      S.cut.push(p);
      recalcSplit();
      return;
    }
    if (S.tool === 'check') {
      const i = S.issues.findIndex(x => inPoly(ll.lat, ll.lng, x.ring));
      if (i >= 0) focusIssue(i);
      return;
    }
    if (S.tool === 'fit') return;
    const hit = terrAt(ll);
    if (S.tool === 'merge') {
      if (!hit) { toast('区域の中をタップしてください'); return; }
      if (hit.id === S.tid) { toast('となりの区域をタップしてください'); return; }
      askMerge(terrById(S.tid), hit);
      return;
    }
    if (!hit) { if (S.tid) { S.tid = null; paint(); } else toast('区域の中をタップしてください'); return; }
    if (hit.id === S.tid) return;
    S.tid = hit.id; S.tool = null;
    paint();
  }

  /* ---------- 分ける ---------- */
  function recalcSplit() {
    const t = terrById(S.tid);
    const prevA = S.split && S.split.a ? center(S.split.a) : null;
    S.split = null;
    if (t && S.cut.length >= 2) {
      const r = splitRing(t.polygon, S.cut);
      if (r && r.a) {
        // 家の多いほう（同じなら広いほう）を、今の区域として残す。点を動かしたあとは、前のオレンジに近いほうをオレンジのままにする
        const na = housesIn(t.id, r.a), nb = housesIn(t.id, r.b);
        const keepA = prevA ? distM(prevA, center(r.a)) <= distM(prevA, center(r.b)) : (na > nb || (na === nb && area(r.a) >= area(r.b)));
        S.split = keepA ? { a: r.a, b: r.b, na, nb } : { a: r.b, b: r.a, na: nb, nb: na };
      } else S.split = r;
    }
    paint();
  }
  function openSplitSheet() {
    const t = terrById(S.tid), sp = S.split;
    if (!t || !sp || !sp.a) return;
    const base = t.pno || t.no;
    const sugB = nextKidNo(base);
    const paintSheet = () => {
      setSheet(headHtml(null, `区域${esc(t.no)}を分ける`, '') + `
        <p><b style="color:${COL_A}">■ オレンジ</b>：今の区域のまま（${cntText(countIn(t.id, sp.a))}）</p>
        <label class="field"><span>オレンジの区域番号</span><input type="text" id="sNoA" maxlength="10" autocomplete="off" value="${esc(t.no)}"></label>
        <p><b style="color:${COL_B}">■ 青</b>：新しい区域（${cntText(countIn(t.id, sp.b))}）</p>
        <label class="field"><span>青の区域番号</span><input type="text" id="sNoB" maxlength="10" autocomplete="off" value="${esc(sugB)}">
          <small class="hint">「5-4」のようにハイフンで枝番を付けます。</small></label>
        <button class="btn block" id="sSwap">オレンジと青を入れかえる</button>
        <div class="notice">${t.holder ? `今は${esc(uname(t.holder))}さんに貸し出し中です。貸し出しは、オレンジの区域にだけ残ります。<br>` : ''}
          訪問の記録は、家と一緒にそれぞれの区域に入ります。青の区域の割り当ての記録（S-13）は、これから始まります。</div>
        <button class="btn primary block" id="sOk">分ける</button>
        <button class="btn block" data-close>もどる</button>`);
      $('#sSwap').onclick = () => {
        const a = sp.a, na = sp.na; sp.a = sp.b; sp.na = sp.nb; sp.b = a; sp.nb = na;
        paintMap(); paintSheet();
      };
      $('#sOk').onclick = () => {
        const noA = normNo($('#sNoA').value), noB = normNo($('#sNoB').value);
        if (!NO_RE.test(noA) || !NO_RE.test(noB)) { toast('区域番号は「53」「53-1」のように入力してください'); return; }
        if (noA === noB) { toast('オレンジと青は、ちがう番号にしてください'); return; }
        const used = no => D().territories.some(x => String(x.no) === no && x.id !== t.id);
        if (used(noA)) { toast(`区域${noA}はすでにあります`); return; }
        if (used(noB)) { toast(`区域${noB}はすでにあります`); return; }
        closeSheet();
        const ra = sp.a, rb = sp.b;
        doCommit(`区域${t.no}を、区域${noA}と区域${noB}に分けました`, () => {
          const x = terrById(t.id); if (!x) return;
          x.polygon = ra;
          if (noA !== String(x.no)) { x.no = noA; if (!x.name || /^区域/.test(x.name)) x.name = `区域${noA}`; }
          const nt = { id: 't' + uid(), no: noB, name: `区域${noB}`, polygon: rb, holder: null, lentAt: null };
          if (x.pno && noB.startsWith(x.pno + '-')) { nt.pno = x.pno; if (x.pnm) nt.pnm = x.pnm; }
          D().territories.push(nt);
          reassign();
        });
        setTool(null);
      };
    };
    paintSheet();
  }

  /* ---------- 1つにする ---------- */
  async function askMerge(a, b) {
    if (!a || !b) return;
    if (b.holder) { infoSheet('1つにできません', `区域${esc(b.no)}は、今${esc(uname(b.holder))}さんに貸し出し中です。返却されてから1つにしてください。`); return; }
    let r;
    try { r = pc().union(toPC(a.polygon), toPC(b.polygon)); } catch (e) { r = null; }
    if (!r || r.length !== 1) { infoSheet('1つにできません', `区域${esc(a.no)}と区域${esc(b.no)}は、となり合っていません（はなれています）。先に「すき間・重なりを調べる」で、あいだをうめてください。`); return; }
    const holes = r[0].slice(1).map(fromRing);
    if (holes.some(h => area(h) > HOLE_DROP)) { infoSheet('1つにできません', '1つにすると、あいだにほかの区域や大きなすき間が囲まれてしまいます。'); return; }
    const ring = exactify(fromRing(r[0][0]), [a.polygon, b.polygon]);
    if (ring.length < 3) return;
    const nb = housesOf(b.id).length;
    const s13n = (D().s13 || []).filter(x => x.terrId === b.id && x.kind === 'a').length;
    // 結果を見せてから確かめる
    lay.clearLayers();
    L.polygon(ring, { color: COL_A, weight: 5, fillColor: COL_A, fillOpacity: 0.2, interactive: false }).addTo(lay);
    const ok = await ask('', {
      title: `区域${b.no}を区域${a.no}に入れて、1つにしますか？`,
      body: `区域${b.no}の家 ${nb}件は、区域${a.no}に入ります。区域${b.no}は一覧からなくなります。` +
        (s13n ? `\n区域${b.no}の割り当ての記録（S-13）${s13n}件は、区域${a.no}の記録に移します。` : ''),
      ok: '1つにする', cancel: 'やめる', danger: false
    });
    if (!ok) { paint(); return; }
    doCommit(`区域${b.no}を区域${a.no}に入れて、1つにしました`, () => {
      const x = terrById(a.id); if (!x) return;
      x.polygon = ring;
      (D().s13 || []).forEach(s => {
        if (s.terrId !== b.id) return;
        if (s.kind === 'p' && (D().s13 || []).some(z => z.kind === 'p' && z.terrId === a.id && Number(z.year) === Number(s.year))) return;
        s.terrId = a.id;
      });
      deleteTerrData(b.id, false);
      reassign();
    });
    setTool(null);
  }

  /* ---------- すき間・重なりを直す ---------- */
  function afterFix() {
    S.issues = findIssues(S.scope); markAuto();
    S.ii = S.issues.length ? Math.min(S.ii, S.issues.length - 1) : -1;
    paint();
    if (S.ii >= 0) focusIssue(S.ii); else toast('すき間・重なりは、すべて直りました');
  }
  /* すき間を区域 t に入れた新しい線（1か所ずつ・まとめて、同じ処理）。PO：区域の線を返す関数（まとめて直すときは、直したあとの線を返す） */
  function gapRing(t, x, PO) {
    let r;
    try { r = pc().union(toPC(PO(t)), toPC(x.ring)); } catch (e) { r = null; }
    if (!r || r.length !== 1) return null;
    const ring = exactify(fromRing(r[0][0]), [PO(t), x.ring, ...neighbors(t, 3).map(PO)]);
    return ring.length < 3 || selfCross(ring) ? null : ring;
  }
  /* 区域 lose から、重なり（区域 keep の線）を引いた形。大きい順（なければ null） */
  function ovPieces(lose, keep, PO) {
    let r;
    try { r = pc().difference(toPC(PO(lose)), toPC(PO(keep))); } catch (e) { r = null; }
    const pieces = (r || []).map(p => fromRing(p[0])).map(g => ({ g, a: area(g) })).filter(p => p.a >= 0.5).sort((p, q) => q.a - p.a);
    return pieces.length ? pieces : null;
  }
  function ovRing(lose, keep, pieces, PO) {
    const ring = exactify(pieces[0].g, [PO(lose), PO(keep), ...neighbors(lose, 3).map(PO)]);
    return ring.length < 3 || selfCross(ring) ? null : ring;
  }
  const livePoly = t => t.polygon;
  function fixGap(x, tid) {
    const t = terrById(tid); if (!x || !t) return;
    const ring = gapRing(t, x, livePoly);
    if (!ring) { toast('うまく入れられませんでした。「形を直す」で直してください'); return; }
    doCommit(`すき間を区域${t.no}に入れました`, () => { const y = terrById(tid); if (y) { y.polygon = ring; reassign(); } });
    afterFix();
  }
  async function fixOv(x, keepId) {
    if (!x) return;
    const loseId = keepId === x.a ? x.b : x.a, lose = terrById(loseId), keep = terrById(keepId);
    if (!lose || !keep) return;
    const pieces = ovPieces(lose, keep, livePoly);
    if (!pieces) { toast('うまく直せませんでした。「形を直す」で直してください'); return; }
    if (pieces.length > 1 && pieces[1].a > 5) {
      const ok = await ask('', { title: `区域${lose.no}が2つに分かれてしまいます`, body: `重なりを区域${keep.no}にすると、区域${lose.no}の小さいほう（${m2(pieces[1].a)}）は、どの区域にも入らなくなります。続けますか？`, ok: '続ける', danger: false });
      if (!ok) return;
    }
    const ring = ovRing(lose, keep, pieces, livePoly);
    if (!ring) { toast('うまく直せませんでした。「形を直す」で直してください'); return; }
    doCommit(`重なっていた所を区域${keep.no}にしました`, () => { const y = terrById(loseId); if (y) { y.polygon = ring; reassign(); } });
    afterFix();
  }

  /* ---------- まとめて直す ----------
     となり合う区域の境目にできた、小さなすき間・細い重なりを、決まりに合う所だけ自動で直す（1回の commit。取り消す・↶ 戻す は1回で全部もどる）。
     決まりに合わない所は、そのまま赤く残るので、1か所ずつ選ぶ。数値（SLIVER_M2・SLIVER_THIN）と「接する長さ」の計算は、kml-koushin.js と同じものを使う */
  const NEAR_RATIO = 0.1;     // 接する長さの1位と2位の差がこれより小さく、中に家があれば、自動にしない
  const OV_SPLIT_M2 = 5;      // 重なりを引いて、残りが2つに分かれたとき、小さいほうがこれより大きければ「分かれる」
  const isLocked = t => !t || !!t.dummy || isSpecial(t);   // 特別区域・検証用の区域は、自動で直さない
  const ringLen = ring => { let s = 0; for (let i = 0; i < ring.length; i++) s += distM(ring[i], ring[(i + 1) % ring.length]); return s; };
  function housesInRing(ring) {
    const b = bboxOf(ring), out = [];
    for (const h of D().houses) { if (h.lat < b[0] || h.lat > b[1] || h.lng < b[2] || h.lng > b[3]) continue; if (inPoly(h.lat, h.lng, ring)) out.push(h); }
    return out;
  }
  /* 1か所を自動で直せるか。直せる：{ to / keep, moved }　直せない：{ why } */
  function planAuto(x) {
    const K = window.KmlKoushin || {};
    if (x.k === 'gap') {
      if (!K.sharedLen) return { why: '部品' };
      const thin = 4 * Math.PI * x.area / Math.pow(ringLen(x.ring), 2);
      if (!(x.area < K.SLIVER_M2 || thin < K.SLIVER_THIN)) return { why: '広い' };
      const adj = x.adj.map(terrById).filter(Boolean);
      if (!adj.length || adj.some(isLocked)) return { why: '特別' };
      const gp = toPC(x.ring);
      const ls = adj.map(t => ({ t, l: K.sharedLen(gp, [toPC(t.polygon)], null) })).filter(o => o.l > 0).sort((p, q) => q.l - p.l);
      if (!ls.length) return { why: '接していない' };
      const hs = housesInRing(x.ring);
      if (hs.length && ls.length > 1 && (ls[0].l - ls[1].l) / ls[0].l < NEAR_RATIO) return { why: '決められない' };
      const moved = hs.filter(h => h.terrId !== ls[0].t.id).length;
      if (moved && ls[0].t.holder) return { why: '貸出中' };
      return { to: ls[0].t.id, moved };
    }
    const a = terrById(x.a), b = terrById(x.b);
    if (isLocked(a) || isLocked(b)) return { why: '特別' };
    const hs = housesInRing(x.ring);
    if (hs.length) {
      const ids = new Set(hs.map(h => h.terrId || ''));
      if (ids.size !== 1) return { why: '家がばらばら' };
      const id = [...ids][0];
      return id === x.a || id === x.b ? { keep: id, moved: 0 } : { why: '家がほかの区域' };
    }
    const okSide = (lose, keep) => { const r = ovPieces(lose, keep, livePoly); return !!r && !(r.length > 1 && r[1].a > OV_SPLIT_M2); };
    const aOk = okSide(a, b), bOk = okSide(b, a);   // aOk：aから引いてもよい（残す側は b）
    if (!aOk && !bOk) return { why: '分かれる' };
    if (aOk && bOk) return { keep: area(a.polygon) >= area(b.polygon) ? a.id : b.id, moved: 0 };
    return { keep: aOk ? b.id : a.id, moved: 0 };
  }
  /* 見つけた所すべてに、自動で直せるかを付ける */
  function markAuto() {
    S.issues.forEach(x => { try { x.auto = planAuto(x); } catch (e) { x.auto = { why: 'エラー' }; } });
    S.autoN = S.issues.filter(x => x.auto && !x.auto.why).length;
  }
  async function fixAll() {
    const items = S.issues.filter(x => x.auto && !x.auto.why);
    if (!items.length) return;
    if (!pc() && !await ensurePc()) return;
    const g = items.filter(x => x.k === 'gap').length, o = items.length - g, c = items.reduce((a, x) => a + x.auto.moved, 0), d = S.issues.length - items.length;
    const ok = await ask('', { title: 'まとめて直しますか？', body: `すき間 ${g}か所・重なり ${o}か所を自動で直します。家が別の区域に移る所：${c}軒。残り ${d}か所は、1か所ずつ選んでください`, ok: 'まとめて直す', danger: false });
    if (!ok) return;
    // 直したあとの線を、先にまとめて計算する（前に直した所を、あとの計算に使う）
    const over = new Map(), PO = t => over.get(t.id) || t.polygon;
    let gg = 0, oo = 0;
    for (const x of items) {
      if (x.k === 'gap') {
        const t = terrById(x.auto.to), ring = t && gapRing(t, x, PO);
        if (ring) { over.set(t.id, ring); gg++; }
      } else {
        const keep = terrById(x.auto.keep), lose = keep && terrById(keep.id === x.a ? x.b : x.a), pieces = lose && ovPieces(lose, keep, PO);
        if (!pieces || (pieces.length > 1 && pieces[1].a > OV_SPLIT_M2)) continue;
        const ring = ovRing(lose, keep, pieces, PO);
        if (ring) { over.set(lose.id, ring); oo++; }
      }
    }
    if (!over.size) { toast('うまく直せませんでした。1か所ずつ直してください'); return; }
    doCommit(`すき間 ${gg}か所・重なり ${oo}か所を、まとめて直しました`, () => {
      over.forEach((ring, id) => { const y = terrById(id); if (y) y.polygon = ring; });
      reassign();
    });
    S.issues = findIssues(S.scope); markAuto(); S.ii = -1;
    paint();
  }

  /* ---------- 係の画面の「区域」に、入口のボタンを足す ---------- */
  function addEntry() {
    const nb = $('#adNewTerr');
    if (!nb || $('#adSenEdit')) return;
    const b = document.createElement('button');
    b.className = 'btn'; b.id = 'adSenEdit'; b.type = 'button';
    b.textContent = '地図で区域の線を直す（分ける・1つにする）';
    b.onclick = () => open(null);
    nb.parentNode.insertBefore(b, nb);
  }
  addEntry();

  window.kyoukai = {
    open, close, click, back, onMode,
    _auto: { findIssues, planAuto, markAuto, fixAll, paint, state: S }, // ためしに動かすとき用
    active: () => typeof mode !== 'undefined' && mode === 'sen'
  };
})();
