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
})(typeof window !== 'undefined' ? window : globalThis);
