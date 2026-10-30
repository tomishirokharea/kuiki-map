/* 区域係の「状況」：区域カードと留守宅カードの「会えた・留守・拒否」の数え方（joukyou-graph.js・2026-10-31）
   ・この中は数える関数だけ（画面は作らない）。集計は係の端末の中だけで行い、サーバーには何も保存しない
   ・出すのは会衆全体の日ごとの数だけ。人・家・区域ごとには分けない
   ・数え方：同じ日の同じ家（部屋）は1軒。結果は 会えた＞拒否＞留守 の順で1つにする。カードは、その日の最初の訪問のカード
   ・カードの見分け：記録の src に印があればそれに従う（card:<留守宅カードのid>／area／おすすめ reco…＝区域カード）。
     印のない古い記録だけ、留守宅カードの記録（持ち主・今日回る人・家・期間）から見分ける。
     終わった留守宅カードは、サーバーが90日で消すので、印のない記録でそれより前のものは「分けられない」（unsplit）
   ・日付は端末の時刻（今の時間帯の表と同じ） */
(function (root) {
  'use strict';
  const DAY = 86400000, SPLIT_DAYS = 90, FEW_BAR = 5, FEW_ROW = 20;
  const pad = n => String(n).padStart(2, '0');
  const ymd = x => { const d = x instanceof Date ? x : new Date(x); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseYmd = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 12, 0, 0); }; // 正午にして、夏時間などでずれないようにする
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const tally = () => ({ met: 0, refused: 0, away: 0 });
  const empty = () => ({ area: tally(), card: tally(), unsplit: tally() });
  const CATS = ['area', 'card', 'unsplit'];
  const rank = { met: 3, refused: 2, away: 1 };

  function build(o) {
    const now = o.now == null ? Date.now() : o.now, today = ymd(now);
    const nowD = new Date(now);
    const from = o.from || ymd(new Date(nowD.getFullYear(), nowD.getMonth() - 11, 1));
    const fromMs = parseYmd(from).getTime() - 12 * 3600000;
    const unsplitBefore = ymd(now - SPLIT_DAYS * DAY + DAY); // カードの記録が確実に残っている日から（終わって90日で消える）
    const km = Number(o.keepMonths);
    const thinBefore = isFinite(km) && km > 0 ? ymd(now - km * 30.5 * DAY) : null;
    // 留守宅カードの記録：家の鍵ごとに引けるようにする
    const idx = new Map();
    (o.cards || []).forEach(c => {
      if (!c || c.dummy || !Array.isArray(c.keys)) return;
      const s = Date.parse(c.at), e = Date.parse(c.endedAt || c.expiresAt);
      if (!isFinite(s) || !isFinite(e)) return;
      const rec = { by: c.by, s, e, helpers: Array.isArray(c.helpers) ? c.helpers : [] };
      c.keys.forEach(k => { let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(rec); });
    });
    const inferred = (v, t, key) => {
      const a = idx.get(key);
      if (!a) return 'area';
      for (const c of a) {
        if (t < c.s || t > c.e) continue;
        if (v.by === c.by || c.helpers.some(h => h && h.uid === v.by && t <= Date.parse(h.until))) return 'card';
      }
      return 'area';
    };
    const kindOf = (v, t, key, day) => {
      const src = String(v.src || '');
      if (src.indexOf('card:') === 0) return 'card';
      if (src === 'area' || src.indexOf('reco') === 0) return 'area';
      if (day < unsplitBefore) return 'unsplit'; // 印がなく、カードの記録も消えている
      return inferred(v, t, key);
    };
    // 同じ日・同じ家（部屋）を1軒にまとめる
    const groups = new Map(), dayMemo = new Map(); // 日付の文字は15分ごとに覚える（記録のたびに作らない）
    const vs = o.visits || [];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i], t = Date.parse(v.at);
      if (!(t >= fromMs) || t > now + DAY) continue;
      const terr = o.terrOfHouse(v.houseId);
      if (!terr || !o.eligible.has(terr)) continue;
      const q = (t / 900000) | 0;
      let day = dayMemo.get(q);
      if (day === undefined) dayMemo.set(q, day = ymd(t));
      if (day < from || day > today) continue;
      const key = v.houseId + '|' + (v.unit || ''), gk = key + '#' + day;
      const g = groups.get(gk);
      if (!g) groups.set(gk, { v, t, key, day, res: v.result });
      else {
        if ((rank[v.result] || 0) > (rank[g.res] || 0)) g.res = v.result;
        if (t < g.t) { g.v = v; g.t = t; }
      }
    }
    const days = new Map();
    groups.forEach(g => {
      const cat = kindOf(g.v, g.t, g.key, g.day);
      let d = days.get(g.day);
      if (!d) days.set(g.day, d = empty());
      d[cat][g.res === 'met' ? 'met' : g.res === 'refused' ? 'refused' : 'away']++;
    });
    // 集まりのあった日（予定にあるものは、掃除などもすべて集まりとして数える）
    const gather = new Map();
    (o.schedules || []).forEach(s => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) return;
      let a = gather.get(s.date);
      if (!a) gather.set(s.date, a = []);
      a.push({ group: s.group || '', time: s.time || '' });
    });
    gather.forEach(a => a.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0)));
    return { days, gather, from, today, unsplitBefore, thinBefore };
  }

  const bucketKey = (day, unit) => {
    if (unit === 'month') return day.slice(0, 7);
    if (unit === 'week') { const d = parseYmd(day); return addDays(day, -((d.getDay() + 6) % 7)); } // 月曜はじまり
    return day;
  };

  /* 日ごとの数を、日・週・月の棒にまとめる（作った日ごとの数を足すだけ）。r.today の棒は current（途中）*/
  function rollup(r, p) {
    const unit = p.unit || 'day', today = p.today || r.today, bars = [], by = new Map();
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
      const k = bucketKey(d, unit);
      let b = by.get(k);
      if (!b) { by.set(k, b = { key: k, start: d, end: d, area: tally(), card: tally(), unsplit: tally(), gatherDays: 0, days: 0, current: k === bucketKey(today, unit) }); bars.push(b); }
      b.end = d; b.days++;
      const x = r.days.get(d);
      if (x) CATS.forEach(c => { b[c].met += x[c].met; b[c].refused += x[c].refused; b[c].away += x[c].away; });
      if (r.gather.has(d)) b.gatherDays++;
    }
    return bars;
  }

  /* 「くらべ」の表：区域カード・留守宅カード × 集まりのあった日・なかった日 */
  function compare(r, p) {
    const out = {};
    ['area', 'card'].forEach(c => { out[c] = { gather: Object.assign(tally(), { days: 0 }), nogather: Object.assign(tally(), { days: 0 }) }; });
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
      const g = r.gather.has(d) ? 'gather' : 'nogather', x = r.days.get(d);
      ['area', 'card'].forEach(c => {
        const t = out[c][g]; t.days++;
        if (x) { t.met += x[c].met; t.refused += x[c].refused; t.away += x[c].away; }
      });
    }
    return out;
  }

  /* 訪ねた数・会えた割合（会えた÷訪ねた。拒否は会えたに入れない）。訪ねた数が minN 未満なら割合は出さない（データ少） */
  function rate(t, minN) {
    const n = t.met + t.refused + t.away, few = n < minN;
    return { n, met: t.met, refused: t.refused, away: t.away, few, pct: few ? null : Math.round(t.met / n * 100) };
  }

  const api = { build, rollup, compare, rate, FEW_BAR, FEW_ROW, SPLIT_DAYS, ymd, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JG = api;

  /* =========================================================
     画面（区域係の「状況」。会衆全体の数だけ。人・家・区域ごとには分けない）
     ・「会えた成果」のすぐ下に「区域カードと留守宅カード」を足す。スマホでははじめはたたむ（kimari.js の foldBlocks）
     ・積み上げの棒グラフを2つ縦に並べる（上：区域カード・下：留守宅カード）。縦の目盛りと横の日付はそろえる
     ・画面を先に出し、計算はそのあとで行う。結果は、記録・カード・予定が変わるまで覚えておく（期間の切りかえで計算し直さない）
     ========================================================= */
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.renderAdmin !== 'function') return;
  const WD = '日月火水木金土';
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $id = id => document.getElementById(id);
  const st = { period: 30, sel: -1, sig: '', drawn: '', agg: null, pending: false };
  const PERIODS = [[30, '直近30日'], [90, '直近90日'], [365, '1年']];
  const css = document.createElement('style');
  css.textContent = `#adJG .jg-seg{margin:6px 0 10px}
#adJG .jg-h{display:flex;flex-wrap:wrap;gap:2px 12px;align-items:baseline;margin:14px 0 2px}
#adJG .jg-h b{font-size:1.15rem}
#adJG .jg-h span{font-size:.95rem;line-height:1.5}
#adJG svg.jg-chart{display:block;width:100%;height:auto;max-width:100%;touch-action:manipulation;cursor:pointer;outline-offset:2px}
#adJG svg.jg-chart text{font-family:inherit;fill:#17324D}
#adJG .jg-leg{display:flex;flex-wrap:wrap;gap:6px 16px;margin:8px 0;font-size:.95rem;line-height:1.5}
#adJG .jg-leg span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
#adJG .jg-leg svg{flex:none}
#adJG .jg-line{margin:8px 0;padding:10px 12px;border:2px solid var(--line,#c9d3de);border-radius:12px;font-size:1rem;line-height:1.7;overflow-wrap:anywhere}
#adJG .jg-line b{white-space:nowrap}
#adJG .jg-tbl td{vertical-align:top}
#adJG .jg-tbl td small{display:block;color:var(--ink2,#44546a);font-size:.8rem}
#adJG .jg-tbl td.jg-few{background:#F4F4F4;color:#555}`;
  document.head.appendChild(css);

  const terrSet = () => new Set(D().territories.filter(t => !t.dummy && !isSpecial(t)).map(t => t.id));
  const dataSig = () => {
    const d = D(), vs = d.visits || [], cs = d.awayCards || [], sc = d.schedules || [];
    return [vs.length, vs.length ? vs[vs.length - 1].id : '', cs.length, cs.reduce((a, c) => a + (c.endedAt ? 1 : 0), 0), sc.map(x => x.date + x.group + x.time).join(','), d.settings && d.settings.keepMonths, ymd(Date.now())].join('|');
  };
  const rangeOf = (period, today) => {
    if (period === 30) return { from: addDays(today, -29), to: today, unit: 'day' };
    if (period === 90) { const f = addDays(today, -89), dd = parseYmd(f); return { from: addDays(f, -((dd.getDay() + 6) % 7)), to: today, unit: 'week' }; }
    const n = parseYmd(today); return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 11, 1)), to: today, unit: 'month' };
  };
  const md = k => { const a = k.split('-'); return `${Number(a[1])}/${Number(a[2])}`; };
  const jpDay = k => { const d = parseYmd(k); return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`; };
  const tot = (bars, c) => bars.reduce((a, b) => { a.met += b[c].met; a.refused += b[c].refused; a.away += b[c].away; return a; }, tally());
  const sumLine = t => { const r = rate(t, FEW_BAR); return `訪ねた ${r.n}軒・会えた ${r.met}軒（${r.few ? 'データ少' : r.pct + '%'}）・留守 ${r.away}軒・拒否 ${r.refused}軒`; };
  const cardPart = (name, t) => {
    const r = rate(t, FEW_BAR);
    if (!r.n) return `<b>${name}：</b>訪ねた 0軒`;
    return `<b>${name}：</b>訪ねた ${r.n}軒・会えた ${r.met}軒（${r.few ? 'データ少' : r.pct + '%'}）・留守 ${r.away}軒${r.refused ? `・拒否 ${r.refused}軒` : ''}`;
  };
  const gatherText = a => (a && a.length ? a.map(g => `${g.group ? esc(g.group) + 'グループ' : '全体の集まり'}${g.time ? ' ' + esc(g.time) : ''}`).join('・') : 'なし');

  function compute() {
    const sig = dataSig();
    if (st.agg && st.agg.sig === sig) return st.agg;
    const d = D(), r = build({ visits: d.visits || [], terrOfHouse: hid => { const h = houseById(hid); return h && h.terrId; }, eligible: terrSet(), cards: d.awayCards || [], schedules: d.schedules || [], now: Date.now(), keepMonths: d.settings && d.settings.keepMonths });
    st.agg = { sig, r };
    return st.agg;
  }
  /* たたんだときの要点（kimari.js の SUMS）：直近30日の会えた割合 */
  function sum() {
    if (!st.agg) return [['集計しています', '']];
    const r = st.agg.r, g = rangeOf(30, r.today), bars = rollup(r, { unit: 'day', from: g.from, to: g.to, today: r.today });
    const p = c => { const x = rate(tot(bars, c), FEW_BAR); return x.few ? 'データ少' : x.pct + '%'; };
    return [['直近30日の会えた割合：区域カード', p('area')], ['留守宅カード', p('card')]];
  }
  const sumHtml = a => a.filter(x => x[1] != null).map(x => `<span class="krn">${esc(x[0])} ${esc(x[1])}</span>`).join('・');
  function refreshSum(box) {
    const body = box.querySelector('#jgBody'), h = box.querySelector(':scope > h2');
    if (!body || !h || !body.classList.contains('kr-folded')) return;
    let p = box.querySelector(':scope > .krfold-sum');
    if (!p) { h.insertAdjacentHTML('afterend', '<p class="krfold-sum"></p>'); p = box.querySelector(':scope > .krfold-sum'); }
    p.innerHTML = sumHtml(sum());
  }

  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<pattern id="jgAway" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#E3F0FC"/><path d="M-1,7 L7,-1" stroke="#1565C0" stroke-width="1.3"/></pattern>
<pattern id="jgRef" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#D9D9D9"/><circle cx="2" cy="2" r="1" fill="#555"/></pattern>
<pattern id="jgNo" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#F2F2F2"/><path d="M0,0 L8,8 M8,0 L0,8" stroke="#BDBDBD" stroke-width=".8"/></pattern></defs></svg>`;
  const FILL = { met: '#1565C0', away: 'url(#jgAway)', refused: 'url(#jgRef)' };
  const swatch = (k, label) => `<span><svg width="22" height="16" aria-hidden="true"><rect x="1" y="1" width="20" height="14" fill="${FILL[k]}" stroke="#17324D"/></svg>${label}</span>`;
  const LEGEND = `<div class="jg-leg" aria-label="凡例">${swatch('met', '会えた（塗りつぶし）')}${swatch('away', '留守（斜線）')}${swatch('refused', '拒否（点々）')}
<span><svg width="22" height="16" aria-hidden="true"><rect x="1" y="1" width="20" height="14" fill="#FFE9A8" stroke="#C99A00"/></svg><b>集</b> 集まりのあった日</span>
<span><svg width="22" height="16" aria-hidden="true"><rect x="2" y="2" width="18" height="12" fill="#fff" stroke="#17324D" stroke-dasharray="3 2"/></svg>途中（今日をふくむ）</span></div>`;

  function niceMax(v) { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

  function chartSvg(bars, cat, max, W, H, unit, r) {
    const L = 38, R = 8, T = 10, B = unit === 'day' ? 52 : 36, pw = W - L - R, ph = H - T - B, n = bars.length, slot = pw / n, bw = Math.max(2, Math.min(slot - 1, slot * 0.72));
    const Y = v => T + ph - v / max * ph, out = [];
    const wstep = slot * 2 >= 70 ? 2 : 3; // 週の日付は、となりと重ならない間隔で出す
    out.push(`<svg class="jg-chart" data-jgc="${cat}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${cat === 'area' ? '区域カード' : '留守宅カード'}の訪ねた数の棒グラフ。左右の矢印キーか、棒を押すと、その日の数が下に出ます">`);
    // 分けられない期間（印のない記録は、区域カードか留守宅カードか分けられない）
    const nb = bars.filter(b => b.end < r.unsplitBefore).length;
    if (nb) {
      out.push(`<rect x="${L}" y="${T}" width="${nb * slot}" height="${ph}" fill="url(#jgNo)"/>`);
      if (nb * slot >= 110) out.push(`<text x="${L + nb * slot / 2}" y="${T + 16}" font-size="13" text-anchor="middle">分けられません</text>`);
    }
    // 集まりのあった日の帯
    bars.forEach((b, i) => { if (b.gatherDays) out.push(`<rect x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}" fill="#FFE9A8" opacity=".7"/>`); });
    // 目盛り
    (max <= 5 ? [0, max] : [0, max / 2, max]).forEach(v => out.push(`<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#C9D3DE" stroke-width="1"/><text x="${L - 5}" y="${Y(v) + 4}" font-size="13" text-anchor="end">${Math.round(v)}</text>`));
    out.push(`<text x="${L - 5}" y="${T - 1}" font-size="13" text-anchor="end" opacity="0">軒</text>`);
    bars.forEach((b, i) => {
      const x = L + i * slot + (slot - bw) / 2, cx = L + i * slot + slot / 2, t = b[cat];
      let y = Y(0), top = y;
      ['met', 'away', 'refused'].forEach(k => {
        if (!t[k]) return;
        const h = Math.max(1, t[k] / max * ph);
        y -= h; top = y;
        out.push(`<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${FILL[k]}" stroke="#17324D" stroke-width="1"/>`);
      });
      if (b.current) out.push(`<rect x="${x - 1}" y="${Math.min(top, Y(0) - 4) - 1}" width="${bw + 2}" height="${Y(0) - Math.min(top, Y(0) - 4) + 2}" fill="none" stroke="#17324D" stroke-width="1.5" stroke-dasharray="3 2"/>`);
      if (i === st.sel) out.push(`<rect x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}" fill="none" stroke="#17324D" stroke-width="2"/>`);
      // 横軸の日付
      const lab = unit === 'day' ? (i % 7 === 0 ? md(b.key) : '') : unit === 'week' ? (i % wstep === 0 ? md(b.key) : '') : `${Number(b.key.slice(5))}月`;
      if (lab) out.push(`<text x="${cx}" y="${T + ph + 16}" font-size="13" text-anchor="middle">${lab}</text>`);
      if (b.gatherDays) {
        if (unit === 'day') out.push(`<text x="${cx}" y="${T + ph + 33}" font-size="13" font-weight="700" text-anchor="middle">集</text>`);
        else out.push(`<text x="${cx}" y="${T + 15}" font-size="13" text-anchor="middle">集${b.gatherDays}</text>`);
      }
      if (b.current) out.push(`<text x="${cx}" y="${H - 4}" font-size="13" text-anchor="${cx > W - 30 ? 'end' : 'middle'}">途中</text>`);
    });
    out.push('</svg>');
    return out.join('');
  }

  function lineHtml(bars, i, unit, r) {
    const b = bars[i];
    if (!b) return '棒を押すと、その日（週・月）の数が出ます。';
    let head, gat;
    if (unit === 'day') { head = jpDay(b.key); gat = `<b>集まり：</b>${gatherText(r.gather.get(b.key))}`; }
    else {
      head = unit === 'week' ? `${jpDay(b.start).replace(/（.）/, '')}〜${jpDay(b.end).replace(/（.）/, '')}の週` : `${Number(b.key.slice(0, 4))}年${Number(b.key.slice(5))}月`;
      gat = `<b>集まりのあった日：</b>${b.gatherDays}日`;
    }
    const un = rate(b.unsplit, 1).n;
    return `<b>${head}</b>　${gat}　${cardPart('区域カード', b.area)}　${cardPart('留守宅カード', b.card)}${un ? `　<b>分けられない記録：</b>${un}軒` : ''}${b.current ? '　（途中の数です）' : ''}`;
  }

  function cmpCell(t) {
    const x = rate(t, FEW_ROW);
    return x.few ? `<td class="jg-few"><b>データ少</b><small>訪ねた ${x.n}軒</small></td>` : `<td><b>${x.pct}%</b><small>訪ねた ${x.n}軒・会えた ${x.met}軒</small></td>`;
  }

  function draw() {
    const box = $id('adJG'), body = box && $id('jgBody');
    if (!body) return;
    const { r } = compute();
    const g = rangeOf(st.period, r.today), bars = rollup(r, { unit: g.unit, from: g.from, to: g.to, today: r.today });
    const W = Math.max(260, Math.min(900, Math.floor(body.clientWidth || 320))), H = W < 520 ? 160 : 200;
    const mx = niceMax(Math.max(1, ...bars.map(b => Math.max(b.area.met + b.area.away + b.area.refused, b.card.met + b.card.away + b.card.refused))));
    if (st.sel >= bars.length) st.sel = -1;
    const cmp = compare(r, { from: g.from, to: g.to }), gd = cmp.area.gather.days, nd = cmp.area.nogather.days;
    const label = (PERIODS.find(x => x[0] === st.period) || PERIODS[0])[1];
    const notes = [];
    if (g.from < r.unsplitBefore) notes.push(`${jpDay(r.unsplitBefore).replace(/（.）/, '')}より前は、印のない記録を区域カードか留守宅カードか分けられません（斜めの網の部分）。印のある記録だけ棒に出ています。`);
    if (r.thinBefore && g.from < r.thinBefore) notes.push(`${jpDay(r.thinBefore).replace(/（.）/, '')}より前は、記録が整理されていて数が少なめです（訪問記録を残す期間：${Number(D().settings.keepMonths)}か月）。`);
    const sig = [st.agg.sig, st.period, st.sel, W].join('#');
    if (st.drawn === sig && body.firstChild) return;
    st.drawn = sig;
    const head = (name, c) => `<div class="jg-h"><b>${name}</b><span>${sumLine(tot(bars, c))}</span></div>`;
    body.innerHTML = `${DEFS}
      <p class="hint">会衆全体の、日ごとの「訪ねた家の数」です。区域カードと留守宅カードで、どれだけ人に会えているかをくらべます。</p>
      <div class="seg jg-seg" role="group" aria-label="期間">${PERIODS.map(p => `<button type="button" data-jgper="${p[0]}" aria-pressed="${p[0] === st.period}">${p[1]}</button>`).join('')}</div>
      ${head('区域カード', 'area')}${chartSvg(bars, 'area', mx, W, H, g.unit, r)}
      ${head('留守宅カード', 'card')}${chartSvg(bars, 'card', mx, W, H, g.unit, r)}
      ${LEGEND}
      <p class="jg-line" id="jgLine" aria-live="polite">${lineHtml(bars, st.sel, g.unit, r)}</p>
      ${notes.map(x => `<p class="hint">${esc(x)}</p>`).join('')}
      <h3>くらべ（${label}）</h3>
      <p class="hint">集まりのあった日 ${gd}日・集まりのなかった日 ${nd}日。「会えた割合」は、会えた÷訪ねた です。</p>
      <div class="scroll"><table class="slots narrow jg-tbl" aria-label="集まりのあった日となかった日の会えた割合"><tr><th></th><th>集まりのあった日</th><th>集まりのなかった日</th></tr>
        <tr><th>区域カード</th>${cmpCell(cmp.area.gather)}${cmpCell(cmp.area.nogather)}</tr>
        <tr><th>留守宅カード</th>${cmpCell(cmp.card.gather)}${cmpCell(cmp.card.nogather)}</tr></table></div>
      <p class="hint">訪ねた数が${FEW_BAR}軒未満の棒、${FEW_ROW}軒未満の表の欄は、割合を出しません（データ少）。</p>`;
    st.bars = bars; st.unit = g.unit; st.r = r;
    refreshSum(box);
  }

  function select(i) {
    if (!st.bars) return;
    st.sel = i;
    st.drawn = '';
    draw();
  }

  function paint() {
    const pane = document.querySelector('[data-apane="status"]');
    if (!pane) return;
    let box = $id('adJG');
    if (!box) {
      box = document.createElement('div'); box.id = 'adJG';
      box.innerHTML = '<h2 class="sec" data-hqk="joukyouGraph">区域カードと留守宅カード</h2><div id="jgBody"><p class="hint">集計しています…</p></div>';
      const ref = $id('adAch');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(box, ref.nextSibling); else pane.appendChild(box);
      box.addEventListener('click', e => {
        const per = e.target.closest('[data-jgper]');
        if (per) { st.period = Number(per.dataset.jgper); st.sel = -1; st.drawn = ''; draw(); return; }
        const svg = e.target.closest('svg.jg-chart');
        if (svg && st.bars) {
          const rc = svg.getBoundingClientRect(), W = svg.viewBox.baseVal.width, x = (e.clientX - rc.left) / rc.width * W - 38, slot = (W - 46) / st.bars.length;
          const i = Math.floor(x / slot);
          if (i >= 0 && i < st.bars.length) select(i === st.sel ? -1 : i);
        }
      });
      box.addEventListener('keydown', e => {
        if (!e.target.closest || !e.target.closest('svg.jg-chart') || !st.bars) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const n = st.bars.length; select(Math.max(0, Math.min(n - 1, (st.sel < 0 ? n : st.sel) + (e.key === 'ArrowLeft' ? -1 : 1)))); const c = box.querySelector('svg.jg-chart'); if (c) c.focus({ preventScroll: true }); }
      });
      let rt = 0;
      window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { try { if (document.body.contains(box) && !box.hidden) { st.drawn = ''; draw(); } } catch (e) { console.error(e); } }, 150); });
    }
    if (st.pending) return;
    st.pending = true;
    setTimeout(() => { // 画面を先に出し、計算はそのあと
      st.pending = false;
      try { if ($id('adJG')) draw(); } catch (e) { console.error(e); const b = $id('jgBody'); if (b) b.innerHTML = '<p class="hint">グラフを作れませんでした。</p>'; }
    }, 0);
  }

  const _renderAdminJg = window.renderAdmin;
  window.renderAdmin = function () {
    _renderAdminJg.apply(this, arguments);
    try { if (isAdmin() && adPane === 'status' && $id('adAch')) paint(); } // 「会えた成果」の箱は、画面ロック中は作られない（schedule.js）ので、それを目印にする
    catch (e) { console.error(e); }
  };
  window.JGUI = { sum, paint, state: st };
})(typeof window !== 'undefined' ? window : globalThis);
