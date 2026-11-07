/* 区域係の「状況」：区域カードと留守宅カードの「会えた・留守・拒否」の数え方（joukyou-graph.js・2026-10-31）
   ・この中は数える関数だけ（画面は作らない）。集計は係の端末の中だけで行い、サーバーには何も保存しない
   ・出すのは会衆全体の日ごとの数と、区域ごとの内訳（棒を押したときに区域係だけに出す。2026-11-07）。人・家ごとには分けない
   ・数え方：同じ日の同じ家（部屋）は1軒。結果は 会えた＞拒否＞留守 の順で1つにする。カードは、その日の最初の訪問のカード
   ・カードの見分け：記録の src に印（card／area）があればそれに従う。おすすめから開いた記録は、おすすめの印（reco…）のあとに付く（reco:after card）。
     印のない記録（古い記録・印のないおすすめ）だけ、留守宅カードの記録（持ち主・今日回る人・家・期間）から見分ける。
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
    const kindOf = (v, key, day) => {
      const src = v.src ? String(v.src) : '';
      if (src) { // 印：card／area。おすすめの記録は、おすすめの印（reco…）の半角スペースのあとに付く（例：reco:after card）
        const sp = src.lastIndexOf(' '), mk = sp >= 0 ? src.slice(sp + 1) : src;
        if (mk === 'card') return 'card';
        if (mk === 'area') return 'area';
      }
      // 印がない記録（古い記録・印のないおすすめ）：90日以内は留守宅カードの記録から見分け、それより前は分けられない
      if (day < unsplitBefore) return 'unsplit'; // カードの記録も消えている
      return inferred(v, Date.parse(v.at), key); // 時間を読むのは、印がなく新しい記録のときだけ
    };
    // 同じ日・同じ家（部屋）を1軒にまとめる。家（部屋）ごとの記録の索引（新しい順）を使い、1年より前は読まずに止める（速さ・指示書5.）
    // 日は番号（dayId）で扱う：日付の文字から番号を引くのは、1時間ごとに1回だけ。数は配列にためて、最後に日付ごとの Map にする
    const dayIds = new Map(), dayStr = [], dayFlag = [], hourDay = new Map(), okHouse = new Map(), tDay = [];
    let counts = new Int32Array(9 * 64);
    const idOf = str => { // 日の番号。flag：0＝数える／1＝今日より先（飛ばす）／2＝期間より前（ここで止める）
      let id = dayIds.get(str);
      if (id === undefined) { id = dayStr.length; dayIds.set(str, id); dayStr.push(str); dayFlag.push(str > today ? 1 : str < from ? 2 : 0); if (counts.length < 9 * dayStr.length) { const n = new Int32Array(counts.length * 2); n.set(counts); counts = n; } }
      return id;
    };
    const dayOf = at => { // 時刻の文字を切り出さず、数字だけで1時間ごとの見出しを作る（記録30万件でも、文字のごみを作らない）。-1＝日付でない
      if (at.length >= 13 && at.charCodeAt(10) === 84 && at.charCodeAt(at.length - 1) === 90) {
        const yy = (at.charCodeAt(0) - 48) * 1000 + (at.charCodeAt(1) - 48) * 100 + (at.charCodeAt(2) - 48) * 10 + (at.charCodeAt(3) - 48),
          mo = (at.charCodeAt(5) - 48) * 10 + (at.charCodeAt(6) - 48), dd = (at.charCodeAt(8) - 48) * 10 + (at.charCodeAt(9) - 48), hh = (at.charCodeAt(11) - 48) * 10 + (at.charCodeAt(12) - 48);
        const k = (((yy * 12 + mo) * 32 + dd) * 24) + hh;
        if (k === k) {
          let d = hourDay.get(k);
          if (d === undefined) { const t0 = Date.UTC(yy, mo - 1, dd, hh); d = isFinite(t0) && ymd(t0) === ymd(t0 + 3599999) ? idOf(ymd(t0)) : -2; hourDay.set(k, d); }
          if (d >= 0) return d;
        }
      }
      const t = Date.parse(at);
      return isFinite(t) ? idOf(ymd(t)) : -1;
    };
    // 家の区域（数える区域でなければ ''）。家ごとに1回だけ引く
    const terrOf = hid => { let b = okHouse.get(hid); if (b === undefined) { const terr = o.terrOfHouse(hid); okHouse.set(hid, b = terr && o.eligible.has(terr) ? String(terr) : ''); } return b; };
    const RES = { met: 0, refused: 1, away: 2 }, CAT = { area: 0, card: 1, unsplit: 2 };
    let curKey = '';
    const desc = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
    // 日・カード・結果ごとの数に1を足す。o.terr のときだけ、区域ごとの内訳（tDay：日の番号 → 区域 → 9つの数）にも足す
    // （内訳は棒を押したときだけ、その期間の分を作る。ふだんのグラフは今までと同じ速さ。監査 M-3）
    const withTerr = !!o.terr;
    const bump = (id, terr, first, res) => {
      const q = CAT[kindOf(first, curKey, dayStr[id])] * 3 + (RES[res] === undefined ? 2 : RES[res]);
      counts[id * 9 + q]++;
      if (!withTerr) return;
      let m = tDay[id]; if (!m) tDay[id] = m = new Map();
      let a = m.get(terr); if (!a) m.set(terr, a = new Int32Array(9));
      a[q]++;
    };
    const processList = list => {
      const f0 = list[0];
      const terr = f0 ? terrOf(f0.houseId) : '';
      if (!terr) return;
      for (let i = 1; i < list.length; i++) if (list[i].at > list[i - 1].at) { list = list.slice().sort(desc); break; } // 新しい順でないときだけ、並べ直す
      curKey = f0.houseId + '|' + (f0.unit || '');
      let cur = -1, res = '', first = null;
      for (let i = 0; i < list.length; i++) {
        const v = list[i], id = dayOf(v.at);
        if (id < 0) continue;
        const fl = dayFlag[id];
        if (fl === 1) continue;
        if (fl === 2) break;
        if (id !== cur) { if (first) bump(cur, terr, first, res); cur = id; res = v.result; first = v; }
        else { if ((rank[v.result] || 0) > (rank[res] || 0)) res = v.result; first = v; } // 新しい順なので、最後に見たものが、その日の最初の訪問
      }
      if (first) bump(cur, terr, first, res);
    };
    if (o.index) { for (const list of o.index) processList(list); }
    else { // 索引がないとき（試験・ほかの使い方）：家（部屋）ごとにまとめてから、同じ数え方をする
      const byKey = new Map(), vs = o.visits || [];
      for (let i = 0; i < vs.length; i++) { const v = vs[i], k = v.houseId + '|' + (v.unit || ''); let a = byKey.get(k); if (!a) byKey.set(k, a = []); a.push(v); }
      byKey.forEach(a => processList(a.sort(desc)));
    }
    const days = new Map(), terrDays = new Map();
    for (let id = 0; id < dayStr.length; id++) {
      if (dayFlag[id] !== 0) continue;
      let any = false;
      for (let q = 0; q < 9; q++) if (counts[id * 9 + q]) { any = true; break; }
      if (!any) continue;
      const d = empty();
      CATS.forEach((c, ci) => { d[c].met = counts[id * 9 + ci * 3]; d[c].refused = counts[id * 9 + ci * 3 + 1]; d[c].away = counts[id * 9 + ci * 3 + 2]; });
      days.set(dayStr[id], d);
      if (tDay[id]) terrDays.set(dayStr[id], tDay[id]);
    }
    // 集まりのあった日（予定にあるものは、掃除などもすべて集まりとして数える）
    const gather = new Map();
    (o.schedules || []).forEach(s => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) return;
      let a = gather.get(s.date);
      if (!a) gather.set(s.date, a = []);
      a.push({ group: s.group || '', time: s.time || '' });
    });
    gather.forEach(a => a.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0)));
    return { days, terrDays, gather, from, today, unsplitBefore, thinBefore };
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

  /* 区域ごとの内訳：build({ terr: true }) の結果の from〜to の日を足して、区域ごとに 区域カード・留守宅カード・分けられない の数を返す（棒を押したときだけ作る） */
  function detail(r, p) {
    const by = new Map();
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
      const m = r.terrDays && r.terrDays.get(d);
      if (!m) continue;
      m.forEach((a, terr) => {
        let x = by.get(terr); if (!x) by.set(terr, x = { terr, area: tally(), card: tally(), unsplit: tally() });
        CATS.forEach((c, ci) => { x[c].met += a[ci * 3]; x[c].refused += a[ci * 3 + 1]; x[c].away += a[ci * 3 + 2]; });
      });
    }
    return [...by.values()];
  }

  /* 訪ねた数・会えた割合（会えた÷訪ねた。拒否は会えたに入れない）。訪ねた数が minN 未満なら割合は出さない（データ少） */
  function rate(t, minN) {
    const n = t.met + t.refused + t.away, few = n < minN;
    return { n, met: t.met, refused: t.refused, away: t.away, few, pct: few ? null : Math.round(t.met / n * 100) };
  }

  const api = { build, rollup, compare, detail, rate, FEW_BAR, FEW_ROW, SPLIT_DAYS, ymd, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JG = api;

  /* =========================================================
     画面（区域係の「状況」）
     ・「会えた成果」のすぐ下に「区域カードと留守宅カード」を足す。スマホでははじめはたたむ（kimari.js の foldBlocks）
     ・1つの棒グラフに、日（週・月）ごとに2本の棒を並べる（左：区域カード・右：留守宅カード。2026-11-07）
       枠の高さ＝訪ねた軒数、塗った部分＝会えた軒数、棒の上の数字＝会えた割合。どちらがよく会えているかを、横でくらべられる
       直近30日は、訪ねた記録のある日だけを並べる。棒が細くならないよう、入りきらないときは横に動かして見る（新しい日が右。はじめは右の端）
     ・棒（その日の列）を押すと、下から区域ごとの内訳が出る。内訳の区域を押すと、その区域のカルテ。カルテの「もどる」で内訳にもどる
       （状況の「全体の状況」の数字 → 内訳 → カルテ と同じ動き）。人・家ごとには分けない
     ・画面を先に出し、計算はそのあとで行う。結果は、記録・カード・予定が変わるまで覚えておく（期間の切りかえで計算し直さない）
     ========================================================= */
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.renderAdmin !== 'function') return;
  const WD = '日月火水木金土';
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $id = id => document.getElementById(id);
  const THROTTLE_MS = 5000; // 記録が届くたびではなく、数秒に1回にまとめる（監査 M-2）
  const st = { period: 30, selKey: '', sig: '', drawn: '', agg: null, pending: false, timer: 0, builds: 0, throttle: THROTTLE_MS, scrollX: null, atEnd: true };
  const PERIODS = [[30, '直近30日'], [90, '直近90日'], [365, '1年']];
  const COL = { area: '#1565C0', card: '#A84300' }; // 区域カード：青／留守宅カード：橙（橙は斜線も付け、色だけで分けない）
  const AX = 36, PH = 170, SLOT_MIN = 72, SLOT_MAX = 110;
  const css = document.createElement('style');
  css.textContent = `#adJG .jg-seg{margin:6px 0 10px}
#adJG .jg-sum p{display:flex;gap:6px;align-items:flex-start;margin:6px 0;font-size:.95rem;line-height:1.5}
#adJG .jg-sum svg{flex:none;margin-top:3px}
#adJG .jg-sum b{white-space:nowrap}
#adJG .jg-wrap{display:flex;align-items:flex-start;margin:8px 0 4px}
#adJG .jg-axis{flex:none;display:block}
#adJG .jg-sc{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
#adJG svg.jg-chart{display:block;touch-action:pan-x pan-y;cursor:pointer;outline-offset:-2px}
#adJG svg text{font-family:inherit;fill:#17324D}
#adJG .jg-leg{display:flex;flex-wrap:wrap;gap:6px 16px;margin:8px 0;font-size:.95rem;line-height:1.5}
#adJG .jg-leg span{display:inline-flex;align-items:center;gap:6px}
#adJG .jg-leg svg{flex:none}
#adJG .jg-tbl td{vertical-align:top}
#adJG .jg-tbl td small{display:block;color:var(--ink2,#44546a);font-size:.8rem}
#adJG .jg-tbl td.jg-few{background:#F4F4F4;color:#555}
.jg-cmp{margin:6px 0 12px}
.jg-cmp p{margin:8px 0 2px;line-height:1.5}
.jg-mb{display:block;height:14px;margin:4px 0 2px;border:1.5px solid #1565C0;background:#fff;border-radius:3px;box-sizing:border-box;min-width:4px;overflow:hidden}
.jg-mb i{display:block;height:100%;background:#1565C0}
.jg-mb.card{border-color:#A84300}
.jg-mb.card i{background:repeating-linear-gradient(135deg,#E07000 0 4px,#fff 4px 6px)}
.jg-mb.none{border-style:dashed;border-color:#8a97a8}
.jg-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;width:100%;min-height:56px;margin:0 0 6px;padding:8px 10px;
  border:2px solid var(--line,#c9d3de);border-radius:12px;background:#fff;color:inherit;font:inherit;text-align:left;cursor:pointer}
.jg-row:disabled{cursor:default;opacity:.75}
.jg-row .jg-rb{min-width:0;display:block}
.jg-row .jg-rb b{display:block;overflow-wrap:anywhere}
.jg-row small{display:block;color:var(--ink2,#44546a);font-size:.88rem;line-height:1.5;overflow-wrap:anywhere}
.jg-row .tl-go{font-size:1.4rem;color:#5b6b80}
.jg-nav{display:flex;gap:8px;margin:4px 0 10px}
.jg-nav .btn{flex:1}`;
  document.head.appendChild(css);

  const terrSet = () => new Set(D().territories.filter(t => !t.dummy && !isSpecial(t)).map(t => t.id));
  // 覚えた結果を作り直すかどうかの見分け（監査 L-2）：記録の数と最後の記録、家・区域の数、予定、留守宅カードの中身（持ち主・期間・終わった日・家・今日回る人）
  const keyHash = ks => { let h = ks ? ks.length : 0; if (ks) for (let i = 0; i < ks.length; i++) { const k = String(ks[i]); for (let j = 0; j < k.length; j++) h = (h * 31 + k.charCodeAt(j)) | 0; } return h; };
  const dataSig = () => {
    const d = D(), vs = d.visits || [], cs = d.awayCards || [], sc = d.schedules || [];
    const cards = cs.map(x => [x.id, x.by, x.at, x.endedAt || '', x.expiresAt || '', x.dummy ? 1 : 0, keyHash(x.keys), (x.helpers || []).map(h => h.uid + '@' + h.until).join('/')].join(',')).join(';');
    return [vs.length, vs.length ? vs[vs.length - 1].id : '', (d.houses || []).length, terrSet().size, cards, sc.map(x => x.date + x.group + x.time).join(','), d.settings && d.settings.keepMonths, ymd(Date.now())].join('|');
  };
  const rangeOf = (period, today) => {
    if (period === 30) return { from: addDays(today, -29), to: today, unit: 'day' };
    if (period === 90) { const f = addDays(today, -89), dd = parseYmd(f); return { from: addDays(f, -((dd.getDay() + 6) % 7)), to: today, unit: 'week' }; }
    const n = parseYmd(today); return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 11, 1)), to: today, unit: 'month' };
  };
  const md = k => { const a = k.split('-'); return `${Number(a[1])}/${Number(a[2])}`; };
  const jpDay = k => { const d = parseYmd(k); return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`; };
  const visN = t => t.met + t.refused + t.away;
  const tot = (bars, c) => bars.reduce((a, b) => { a.met += b[c].met; a.refused += b[c].refused; a.away += b[c].away; return a; }, tally());
  const sumLine = t => { const r = rate(t, FEW_BAR); return `訪ねた ${r.n}軒・会えた ${r.met}軒（${r.few ? 'データ少' : r.pct + '%'}）・留守 ${r.away}軒・拒否 ${r.refused}軒`; };
  // 集まりの名前は1つずつ別の部品にする（スペイン語に訳すとき、組み合わせごとの辞書を作らなくてよいように）
  const gatherText = a => (a && a.length ? a.map(g => `<span>${g.group ? esc(g.group) + 'グループ' : '全体の集まり'}${g.time ? ' ' + esc(g.time) : ''}</span>`).join('<span>・</span>') : '<span>なし</span>');
  // 横軸の「集」の印は、辞書の「集」（別の意味で使われている）に頼らず、言語に合わせて出す（日本語＝集・スペイン語＝R。data-notr で自動の置きかえから外す）
  const MK = () => (window.KI && window.KI.lang === 'es' ? 'R' : '集');

  const curIdx = () => (typeof IDX !== 'undefined' ? IDX : null);
  const inputs = () => { const d = D(); return { index: typeof IDX !== 'undefined' && IDX instanceof Map && IDX.size ? IDX.values() : null, visits: d.visits || [], terrOfHouse: hid => { const h = houseById(hid); return h && h.terrId; }, eligible: terrSet(), cards: d.awayCards || [], schedules: d.schedules || [], now: Date.now(), keepMonths: d.settings && d.settings.keepMonths }; };
  function compute(force) {
    const d = D(), sig = dataSig(), a = st.agg;
    if (a && a.sig === sig && a.vref === d.visits && a.iref === curIdx()) return a; // 記録の入れ物（配列・索引）が置きかわったときも、作り直す
    if (!force && a && Date.now() - a.at < st.throttle) { later(); return a; } // 数秒に1回にまとめる：今回は古い結果のまま、少しあとにもう一度確かめる
    st.builds++;
    const inp = inputs(), r = build(inp);
    st.agg = { sig, at: Date.now(), now: inp.now, vref: d.visits, iref: curIdx(), r };
    return st.agg;
  }
  function later() { // 間引いた分は、数秒あとに1回だけもう一度確かめる（そのとき見えていなければ、作り直さない）
    if (st.timer) return;
    st.timer = setTimeout(() => { st.timer = 0; try { refresh(false); } catch (e) { console.error(e); } }, Math.max(300, st.throttle - (Date.now() - (st.agg ? st.agg.at : 0))));
  }
  // いま見えているか（状況を開いていて、たたんでいない）
  const shown = () => { const box = $id('adJG'), body = box && $id('jgBody'); return !!(body && box.offsetParent !== null && body.offsetParent !== null && typeof adPane !== 'undefined' && adPane === 'status'); };
  function refresh(force) {
    const box = $id('adJG'), body = box && $id('jgBody');
    if (!body) return;
    if (!shown()) { // たたんでいる・状況を開いていない間は、作り直さない（まだ一度も作っていないときだけ、要点のために1回作る）
      if (!st.agg) { compute(true); refreshSum(box); }
      return;
    }
    draw(force);
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
<pattern id="jgCardM" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E07000"/><rect x="4" width="2" height="6" fill="#fff"/></pattern>
<pattern id="jgNo" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#F2F2F2"/><path d="M0,0 L8,8 M8,0 L0,8" stroke="#BDBDBD" stroke-width=".8"/></pattern></defs></svg>`;
  const MFILL = { area: COL.area, card: 'url(#jgCardM)' };
  // 凡例・数の行の小さな見本：枠＝訪ねた、塗り＝会えた
  const swatch = c => `<svg width="24" height="18" aria-hidden="true"><rect x="1" y="1" width="22" height="16" fill="#fff" stroke="${COL[c]}" stroke-width="1.5"/><rect x="1" y="9" width="22" height="8" fill="${MFILL[c]}" stroke="${COL[c]}" stroke-width="1"/></svg>`;
  const LEGEND = () => `<div class="jg-leg" aria-label="凡例"><span>${swatch('area')}左：区域カード（青）</span><span>${swatch('card')}右：留守宅カード（橙の斜線）</span>
<span>枠の高さ＝訪ねた軒数・塗った部分＝会えた軒数・棒の上の数字＝会えた割合</span>
<span><svg width="22" height="16" aria-hidden="true"><rect x="1" y="1" width="20" height="14" fill="#FFE9A8" stroke="#C99A00"/></svg><b data-notr>${MK()}</b> 集まりのあった日</span>
<span><svg width="22" height="16" aria-hidden="true"><rect x="2" y="2" width="18" height="12" fill="#fff" stroke="#17324D" stroke-dasharray="3 2"/></svg>途中（今日をふくむ）</span></div>`;

  function niceMax(v) { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  const ticks = max => (max <= 5 ? [0, max] : [0, max / 2, max]);

  /* グラフの形（棒の幅・全体の幅）。押した場所から棒を見つけるときも同じものを使う */
  function geom(n, unit, availW) {
    const T = 22, B = unit === 'day' ? 58 : 42, H = T + PH + B, plotW = Math.max(160, availW - AX);
    const slot = Math.max(SLOT_MIN, Math.min(SLOT_MAX, plotW / Math.max(1, n)));
    const bw = Math.min(28, Math.floor(slot * 0.34)); // 2本の割合の数字（11px）が重ならない幅
    return { T, B, H, slot, bw, W: Math.ceil(slot * n), plotW };
  }

  function axisSvg(g, max) {
    const Y = v => g.T + PH - v / max * PH;
    return `<svg class="jg-axis" width="${AX}" height="${g.H}" viewBox="0 0 ${AX} ${g.H}" aria-hidden="true">${ticks(max).map(v => `<text x="${AX - 5}" y="${Y(v) + 4}" font-size="13" text-anchor="end">${Math.round(v)}</text>`).join('')}</svg>`;
  }

  function chartSvg(bars, max, g, unit, r) {
    const { T, H, slot, bw, W } = g, Y = v => T + PH - v / max * PH, out = [], gap = 4;
    out.push(`<svg class="jg-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" tabindex="0" aria-label="区域カードと留守宅カードの、訪ねた数と会えた数の棒グラフ。棒を押すか、左右の矢印キーでえらんで決定キーを押すと、区域ごとの内訳が出ます">`);
    bars.forEach((b, i) => {
      const x0 = i * slot;
      if (b.end < r.unsplitBefore) out.push(`<rect x="${x0}" y="${T}" width="${slot}" height="${PH}" fill="url(#jgNo)"/>`); // 分けられない期間
      if (b.gatherDays) out.push(`<rect x="${x0}" y="${T}" width="${slot}" height="${PH}" fill="#FFE9A8" opacity=".7"/>`);
    });
    ticks(max).forEach(v => out.push(`<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="#C9D3DE" stroke-width="1"/>`));
    bars.forEach((b, i) => {
      const x0 = i * slot, cx = x0 + slot / 2, px = x0 + (slot - (bw * 2 + gap)) / 2;
      let top = Y(0);
      ['area', 'card'].forEach((c, ci) => {
        const t = b[c], n = visN(t), x = px + ci * (bw + gap);
        if (!n) return;
        const h = Math.max(2, n / max * PH), y = Y(0) - h;
        top = Math.min(top, y);
        out.push(`<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="#fff" stroke="${COL[c]}" stroke-width="1.5"/>`);
        if (t.met) { const hm = Math.max(1.5, t.met / max * PH); out.push(`<rect x="${x}" y="${Y(0) - hm}" width="${bw}" height="${hm}" fill="${MFILL[c]}" stroke="${COL[c]}" stroke-width="1"/>`); }
        const rr = rate(t, FEW_BAR);
        if (!rr.few) out.push(`<text x="${x + bw / 2}" y="${y - 4}" font-size="11" font-weight="700" text-anchor="middle" style="fill:${COL[c]}">${rr.pct}%</text>`);
      });
      if (b.current) out.push(`<rect x="${px - 3}" y="${Math.min(top - 18, Y(0) - 8)}" width="${bw * 2 + gap + 6}" height="${Y(0) - Math.min(top - 18, Y(0) - 8) + 2}" fill="none" stroke="#17324D" stroke-width="1.5" stroke-dasharray="3 2"/>`);
      if (b.key === st.selKey) out.push(`<rect x="${x0 + 1.5}" y="${T - 20}" width="${slot - 3}" height="${PH + 20 + 4}" fill="none" stroke="#17324D" stroke-width="2.5" rx="6"/>`);
      // 横軸：日付・曜日（日）／週のはじめ（週）／月（月）。2行目・3行目に「集」「途中」
      const l2 = [];
      if (unit === 'day') {
        out.push(`<text x="${cx}" y="${T + PH + 16}" font-size="13" text-anchor="middle">${md(b.key)}</text>`);
        out.push(`<text x="${cx}" y="${T + PH + 32}" font-size="13" text-anchor="middle">${WD[parseYmd(b.key).getDay()]}</text>`);
      } else out.push(`<text x="${cx}" y="${T + PH + 16}" font-size="13" text-anchor="middle">${unit === 'week' ? md(b.key) + '〜' : `${Number(b.key.slice(5))}月`}</text>`);
      if (b.gatherDays) l2.push(`<tspan data-notr font-weight="700">${MK()}${unit === 'day' ? '' : b.gatherDays}</tspan>`);
      if (b.current) l2.push('<tspan>途中</tspan>');
      if (l2.length) out.push(`<text x="${cx}" y="${T + PH + (unit === 'day' ? 49 : 33)}" font-size="13" text-anchor="middle">${l2.join('<tspan> </tspan>')}</text>`);
    });
    out.push('</svg>');
    return out.join('');
  }

  function cmpCell(t) {
    const x = rate(t, FEW_ROW);
    return x.few ? `<td class="jg-few"><b>データ少</b><small>訪ねた ${x.n}軒</small></td>` : `<td><b>${x.pct}%</b><small>訪ねた ${x.n}軒・会えた ${x.met}軒</small></td>`;
  }

  /* 期間のうち、棒にするもの：直近30日は、訪ねた記録のある日（と今日）だけ。週・月は全部 */
  function barsOf(r, period) {
    const g = rangeOf(period, r.today);
    let bars = rollup(r, { unit: g.unit, from: g.from, to: g.to, today: r.today });
    if (g.unit === 'day') bars = bars.filter(b => b.current || visN(b.area) + visN(b.card) + visN(b.unsplit) > 0);
    return { g, bars };
  }

  function draw(force) {
    const box = $id('adJG'), body = box && $id('jgBody');
    if (!body) return;
    const { r } = compute(force);
    const { g, bars } = barsOf(r, st.period);
    const all = rollup(r, { unit: g.unit, from: g.from, to: g.to, today: r.today }); // 合計とくらべは、期間の全部の日で
    const availW = Math.floor(body.clientWidth || 320), geo = geom(bars.length, g.unit, availW);
    const mx = niceMax(Math.max(1, ...bars.map(b => Math.max(visN(b.area), visN(b.card)))));
    const sig = [st.agg.sig, st.period, st.selKey, availW].join('#');
    if (st.drawn === sig && body.firstChild) return;
    const keepX = st.drawnPer === st.period && st.scrollX != null; // 同じ期間の描き直し（えらんだ・幅が変わった・記録が増えた）は、横の位置をそのまま
    st.drawn = sig; st.drawnPer = st.period;
    const cmp = compare(r, { from: g.from, to: g.to }), gd = cmp.area.gather.days, nd = cmp.area.nogather.days;
    const label = (PERIODS.find(x => x[0] === st.period) || PERIODS[0])[1];
    const notes = [];
    if (g.from < r.unsplitBefore) notes.push(`${jpDay(r.unsplitBefore).replace(/（.）/, '')}より前は、印のない記録を区域カードか留守宅カードか分けられません（斜めの網の部分）。印のある記録だけ棒に出ています。`);
    if (r.thinBefore && g.from < r.thinBefore) notes.push(`${jpDay(r.thinBefore).replace(/（.）/, '')}より前は、記録が整理されていて数が少なめです（訪問記録を残す期間：${Number(D().settings.keepMonths)}か月）。`);
    const line = c => `<p>${swatch(c)}<span><b>${c === 'area' ? '区域カード' : '留守宅カード'}</b>　${sumLine(tot(all, c))}</span></p>`;
    const has = bars.some(b => visN(b.area) + visN(b.card) > 0);
    body.innerHTML = `${DEFS}
      <p class="hint">会衆全体の「訪ねた家の数」です。日ごとに、区域カード（左）と留守宅カード（右）の棒を並べて、どちらがよく会えているかをくらべます。</p>
      <div class="seg jg-seg" role="group" aria-label="期間">${PERIODS.map(p => `<button type="button" data-jgper="${p[0]}" aria-pressed="${p[0] === st.period}">${p[1]}</button>`).join('')}</div>
      <div class="jg-sum">${line('area')}${line('card')}</div>
      ${has ? `<div class="jg-wrap">${axisSvg(geo, mx)}<div class="jg-sc" id="jgSc">${chartSvg(bars, mx, geo, g.unit, r)}</div></div>` : '<div class="empty">この期間に、訪ねた記録はありません</div>'}
      ${LEGEND()}
      ${has ? `<p class="hint"><span>棒（その日の列）を押すと、区域ごとの内訳が出ます。内訳の区域を押すと、その区域のカルテが開きます。</span>${geo.W > geo.plotW ? '<span>入りきらない日は、グラフを横に動かすと見られます。</span>' : ''}${g.unit === 'day' ? '<span>訪ねた記録のない日は、のせていません。</span>' : ''}</p>` : ''}
      ${notes.map(x => `<p class="hint">${esc(x)}</p>`).join('')}
      <h3>くらべ（${label}）</h3>
      <p class="hint">集まりのあった日 ${gd}日・集まりのなかった日 ${nd}日。「会えた割合」は、会えた÷訪ねた です。</p>
      <div class="scroll"><table class="slots narrow jg-tbl" aria-label="集まりのあった日となかった日の会えた割合"><tr><th></th><th>集まりのあった日</th><th>集まりのなかった日</th></tr>
        <tr><th>区域カード</th>${cmpCell(cmp.area.gather)}${cmpCell(cmp.area.nogather)}</tr>
        <tr><th>留守宅カード</th>${cmpCell(cmp.card.gather)}${cmpCell(cmp.card.nogather)}</tr></table></div>
      <p class="hint"><span>訪ねた数が${FEW_BAR}軒未満の棒、${FEW_ROW}軒未満の表の欄は、割合を出しません（データ少）。</span><span>留守宅カードの家は、もともと会いにくかった家です。割合が区域カードより低くても、役に立っていないとは限りません。</span></p>`;
    st.bars = bars; st.unit = g.unit; st.r = r; st.geo = geo;
    const sc = $id('jgSc');
    if (sc) {
      sc.scrollLeft = keepX && !st.atEnd ? st.scrollX : sc.scrollWidth; // はじめは右の端（新しい日）。右の端を見ていたときは、日が増えても右の端
      const mark = () => { st.scrollX = sc.scrollLeft; st.atEnd = sc.scrollLeft >= sc.scrollWidth - sc.clientWidth - 4; };
      mark();
      sc.addEventListener('scroll', mark, { passive: true });
    }
    refreshSum(box);
  }

  // えらんだ棒が見える位置まで、横に動かす（矢印キーのとき）
  function reveal(i) {
    const sc = $id('jgSc'); if (!sc || !st.geo) return;
    const x = i * st.geo.slot;
    if (x < sc.scrollLeft) sc.scrollLeft = x; else if (x + st.geo.slot > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + st.geo.slot - sc.clientWidth;
    st.scrollX = sc.scrollLeft;
  }
  // えらんだ棒は、番号ではなく棒の key（日付）で覚える。記録が届いて棒が増えても、同じ日を指す（監査 M-1）
  const idxOf = key => (st.bars && key ? st.bars.findIndex(b => b.key === key) : -1);
  // その日より前で、いちばん近い棒（ないときは -1）。その日がなくなったとき（記録を取り消した・日をまたいだ）に使う
  const nearIdx = key => { let n = -1; (st.bars || []).forEach((b, j) => { if (b.key <= key) n = j; }); return n; };
  function select(key) {
    if (!st.bars) return;
    st.selKey = key || '';
    st.drawn = ''; // 描き直す（同じ期間なので、横の位置はそのまま）
    draw(false);
    const i = idxOf(st.selKey);
    if (i >= 0) { reveal(i); const lv = $id('jgSel'); const b = st.bars[i]; if (lv) lv.innerHTML = `<span>${barHead(b, st.unit)}</span> <span>区域カード：</span><span>${numLine(b.area)}</span> <span>留守宅カード：</span><span>${numLine(b.card)}</span>`; }
  }
  // 区域ごとの内訳：棒を押したときに、その期間の分だけ数える（覚えておき、記録が変わったら作り直す）
  function detailOf(b) {
    const a = st.agg, k = b.start + '|' + b.end;
    if (!a.det) a.det = new Map();
    let det = a.det.get(k);
    if (!det) {
      const r2 = build(Object.assign(inputs(), { terr: true, from: b.start, now: a.now }));
      det = detail(r2, { from: b.start, to: b.end });
      a.det.set(k, det);
    }
    return det;
  }

  /* ---- 棒を押したとき：下から区域ごとの内訳（カード2つのくらべ → 区域カード・留守宅カードの区域ごと → 分けられない記録） ---- */
  const barHead = (b, unit) => unit === 'day' ? jpDay(b.key)
    : unit === 'week' ? `${jpDay(b.start).replace(/（.）/, '')}〜${jpDay(b.end).replace(/（.）/, '')}の週` : `${Number(b.key.slice(0, 4))}年${Number(b.key.slice(5))}月`;
  const mini = (t, max, c) => { const n = visN(t); return `<span class="jg-mb ${n ? c : 'none'}" style="width:${n ? Math.max(4, Math.round(n / max * 100)) : 100}%" aria-hidden="true"><i style="width:${n ? Math.round(t.met / n * 100) : 0}%"></i></span>`; };
  const numLine = t => { const r = rate(t, FEW_BAR); return r.n ? `訪ねた ${r.n}軒・会えた ${r.met}軒（${r.few ? 'データ少' : r.pct + '%'}）・留守 ${r.away}軒・拒否 ${r.refused}軒` : '訪ねた 0軒'; };
  function rowHtml(x, c, max) {
    const t = typeof terrById === 'function' ? terrById(x.terr) : null, ok = !!(t && window.KM && KM.openKarte);
    const stamp = t ? `<span class="stamp sm${typeof noCls === 'function' ? noCls(t.no) : ''}">${esc(t.no)}</span>` : '<span class="stamp sm">-</span>';
    return `<button type="button" class="jg-row" ${ok ? `data-jgt="${esc(x.terr)}"` : 'disabled'}>${stamp}<span class="jg-rb"><b>${t ? esc(t.name || '区域' + t.no) : '今はない区域'}</b>${mini(x[c], max, c)}<small>${numLine(x[c])}</small></span>${ok ? '<span class="tl-go" aria-hidden="true">›</span>' : '<span></span>'}</button>`;
  }
  // 内訳を開く。key：棒の key（日付）。その日がもうないとき（日をまたいだ・記録を取り消した）は、その前でいちばん近い棒
  function openBar(key, keep) {
    // 記録が届いて、まだ数え直していないとき（数秒に1回にまとめている間）は、先に数え直す。上の合計と区域ごとの数をそろえる（再監査 N-3）
    if (st.agg && dataSig() !== st.agg.sig) {
      compute(true);
      if (shown()) draw(false); else { const x = barsOf(st.agg.r, st.period); st.bars = x.bars; st.unit = x.g.unit; st.r = st.agg.r; }
    }
    const bars = st.bars, r = st.r, unit = st.unit;
    if (!bars || !bars.length || typeof setSheet !== 'function') return;
    let i = idxOf(key);
    if (i < 0) i = Math.max(0, nearIdx(key));
    const b = bars[i];
    key = b.key;
    const det = detailOf(b);
    const byNo = (a, b2) => { const ta = terrById(a.terr), tb = terrById(b2.terr); return String(ta ? ta.no : '').localeCompare(String(tb ? tb.no : ''), 'ja', { numeric: true }); };
    const sec = (c, name) => {
      const L = det.filter(x => visN(x[c]) > 0).sort((a, b2) => visN(b2[c]) - visN(a[c]) || byNo(a, b2));
      if (!L.length) return '';
      const max = Math.max(...L.map(x => visN(x[c])));
      return `<h3 class="sub">${name}（${L.length}区域）</h3>${L.map(x => rowHtml(x, c, max)).join('')}`;
    };
    const top = Math.max(1, visN(b.area), visN(b.card));
    const unitName = unit === 'day' ? '日' : unit === 'week' ? '週' : '月';
    const un = visN(b.unsplit);
    const html = (typeof headHtml === 'function' ? headHtml(null, barHead(b, unit), '') : `<h2>${barHead(b, unit)}</h2>`) + `
      <p class="muted">${unit === 'day' ? `<span>集まり：</span>${gatherText(r.gather.get(b.key))}` : `<span>集まりのあった日：${b.gatherDays}日</span>`}${b.current ? '<span>（途中の数です）</span>' : ''}</p>
      <div class="jg-cmp">
        <p><b>区域カード</b></p>${mini(b.area, top, 'area')}<small>${numLine(b.area)}</small>
        <p><b>留守宅カード</b></p>${mini(b.card, top, 'card')}<small>${numLine(b.card)}</small>
      </div>
      ${det.length ? '<p class="hint">区域を押すと、その区域のカルテが開きます。多く訪ねた区域から並べています。</p>' : '<div class="empty">訪ねた記録はありません</div>'}
      ${sec('area', '区域カード')}${sec('card', '留守宅カード')}${un ? `${sec('unsplit', '分けられない記録')}<p class="hint">印のない古い記録です。区域カードか留守宅カードかは分けられません。</p>` : ''}
      <div class="jg-nav"><button type="button" class="btn" data-jgnav="-1"${i > 0 ? '' : ' disabled'}>‹ 前の${unitName}</button><button type="button" class="btn" data-jgnav="1"${i < bars.length - 1 ? '' : ' disabled'}>次の${unitName} ›</button></div>
      <button type="button" class="btn block" data-close>閉じる</button>`;
    if (keep && typeof sheetKeep !== 'undefined') sheetKeep = true; // 前・次：画面のいちばん上にもどさない
    setSheet(html);
    const S = $id('sheet'); if (!S) return;
    S.querySelectorAll('[data-jgt]').forEach(x => { x.onclick = () => KM.openKarte(x.dataset.jgt, () => openBar(key)); });
    S.querySelectorAll('[data-jgnav]').forEach(x => { x.onclick = () => { // 開いている日がなくなっていたら、その前の近い棒を基準にする（再監査 N-1）
      const L = st.bars || [], d = Number(x.dataset.jgnav), c = idxOf(key), n = nearIdx(key);
      const j = c >= 0 ? c + d : d < 0 ? n : n + 1;
      if (j >= 0 && j < L.length) openBar(L[j].key, true);
    }; });
    if (shown()) select(key); else st.selKey = key; // グラフでも、えらんだ日に枠を付ける
  }

  function paint() {
    const pane = document.querySelector('[data-apane="status"]');
    if (!pane) return;
    let box = $id('adJG');
    if (!box) {
      box = document.createElement('div'); box.id = 'adJG';
      box.innerHTML = '<h2 class="sec" data-hqk="joukyouGraph">区域カードと留守宅カード</h2><div id="jgBody"><p class="hint">集計しています…</p></div><p id="jgSel" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);margin:0"></p>'; // 読み上げの場所は描き直さない
      const ref = $id('adAch');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(box, ref.nextSibling); else pane.appendChild(box);
      box.addEventListener('click', e => {
        const per = e.target.closest('[data-jgper]');
        if (per) { st.period = Number(per.dataset.jgper); st.selKey = ''; st.drawn = ''; st.drawnPer = 0; st.scrollX = null; draw(false); return; }
        const svg = e.target.closest('svg.jg-chart');
        if (svg && st.bars && st.geo) {
          const rc = svg.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width * st.geo.W;
          const i = Math.floor(x / st.geo.slot);
          if (i >= 0 && i < st.bars.length) openBar(st.bars[i].key);
        }
      });
      box.querySelector(':scope > h2').addEventListener('click', () => { setTimeout(() => { try { refresh(true); } catch (e) { console.error(e); } }, 0); }); // たたんだ見出しを開いたとき：古くなっていれば、すぐ最新にする（kimari.js が開け閉めしたあと）
      box.addEventListener('keydown', e => {
        if (!e.target.closest || !e.target.closest('svg.jg-chart') || !st.bars) return;
        const n = st.bars.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const cur = idxOf(st.selKey);
          select(st.bars[Math.max(0, Math.min(n - 1, (cur < 0 ? n : cur) + (e.key === 'ArrowLeft' ? -1 : 1)))].key);
          const c = box.querySelector('svg.jg-chart'); if (c) c.focus({ preventScroll: true });
        } else if ((e.key === 'Enter' || e.key === ' ') && idxOf(st.selKey) >= 0) { e.preventDefault(); openBar(st.selKey); }
      });
      let rt = 0;
      window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { try { if (document.body.contains(box) && shown()) draw(false); } catch (e) { console.error(e); } }, 150); });
    }
    if (st.pending) return;
    st.pending = true;
    setTimeout(() => { // 画面を先に出し、計算はそのあと
      st.pending = false;
      try { if ($id('adJG')) refresh(false); } catch (e) { console.error(e); const b = $id('jgBody'); if (b) b.innerHTML = '<p class="hint">グラフを作れませんでした。</p>'; }
    }, 0);
  }

  const _renderAdminJg = window.renderAdmin;
  window.renderAdmin = function () {
    _renderAdminJg.apply(this, arguments);
    try { if (isAdmin() && adPane === 'status' && !(typeof window.lkLocked === 'function' && window.lkLocked())) paint(); } // 画面ロック中は出さない（schedule.js が window に出している lkLocked）
    catch (e) { console.error(e); }
  };
  window.JGUI = { sum, paint, openBar, detailOf, state: st, recompute: () => { st.agg = null; return compute(true); } }; // recompute：「速さを測る」用（覚えた結果を捨てて作り直す）
})(typeof window !== 'undefined' ? window : globalThis);
