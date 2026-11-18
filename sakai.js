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
  /* 塊（outer から holes を除いた形）に、辺から half m 以上はなれた広さが needM2 以上あるか。
     step m 間隔の点を数え、足りた時点で true を返す */
  function coreAreaAtLeast(outer, holes, needM2, step = 10, half = 10) {
    if (!outer || outer.length < 3) return false;
    const cosLat = cosOf(outer), o = outer.map(p => mXY(p, cosLat));
    const hs = (holes || []).filter(h => h && h.length >= 3).map(h => h.map(p => mXY(p, cosLat)));
    const edges = [];
    [o].concat(hs).forEach(r => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) edges.push([r[j], r[i]]); });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    o.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    let n = 0;
    for (let x = x0 + step / 2; x <= x1; x += step) {
      for (let y = y0 + step / 2; y <= y1; y += step) {
        if (!inXY(x, y, o) || hs.some(h => inXY(x, y, h))) continue;
        let near = false;
        for (let k = 0; k < edges.length; k++) { if (segDist([x, y], edges[k][0], edges[k][1]) < half) { near = true; break; } }
        if (near) continue;
        if (++n * step * step >= needM2) return true;
      }
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

  /* ここから下（地図の層・凡例・取り込み画面）は、後の作業で足す */
})();
