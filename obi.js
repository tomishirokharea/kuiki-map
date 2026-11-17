/* =========================================================
   区域マップ：みんなの奉仕のひと言（obi.js・2026-11-17）の文と選び方

   ・サーバーが返す obi（数と日付だけ。個人が特定される情報は入っていない）から、1日1回のひと言を1つ選ぶ。
   ・S5（この奉仕年度は全区域の○%）は obi.cv から画面で作る（cv が無い・all が0なら作らない）。
   ・日付の合わない項目（きのうのまとめが前の日でない・先週のまとめが前の週でない）は選ばない。日付は端末の日付（日本で使う前提）。
   ・前の日と同じ種類は続けない（ほかに選べるものがなければ続ける）。S2 は2倍の重みで選ぶ。
   ・何が来ても投げない（壊れた obi は null を返す）。画面の部品（ホームのカード）は別のファイル。
   ========================================================= */
(function () {
  'use strict';
  const T = s => (window.KI && typeof window.KI.t === 'function' ? window.KI.t(s) : s); // 文を1つずつ訳す（iken.js などと同じ）
  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

  // 端末の日付から、前の日と、前の週の月曜（どちらも YYYY-MM-DD）
  function dates(today) {
    const t = today && typeof today.getTime === 'function' && !isNaN(today.getTime()) ? today : new Date();
    const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
    const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7) - 7);
    return { d: ymd(y), w: ymd(mon) };
  }

  // '土日・夕方' → '土日の夕方'
  const slotName = s => String(s == null ? '' : s).replace('・', 'の');

  // 小数1けた、.0 は付けない（2 → "2"、2.5 → "2.5"）
  const fmtX = x => String(Math.round(num(x) * 10) / 10);

  // ひと言の文（0軒の形も）
  function text(it) {
    if (!it || typeof it !== 'object') return '';
    const n = num(it.n), m = num(it.m);
    let s = '';
    switch (it.k) {
      case 'S1': s = m === 0 ? `先週は留守だった家を${n}軒訪ねる努力が払われました。` : `先週は留守だった家を訪ねる努力が払われ、${n}軒中、${m}軒の方にお会いできました。`; break;
      case 'S2': s = m === 0 ? `先週は時間帯を変えて${n}軒を訪ねる努力が払われました。` : `先週は時間帯を変えて訪ねる努力が払われ、${n}軒中、${m}軒の方にお会いできました。`; break;
      case 'S3': s = m === 0 ? `きのうは${n}軒を訪ねる努力が払われました。` : `きのうは${n}軒を訪ねる努力が払われ、${m}軒の方にお会いできました。`; break;
      case 'S4': s = `先週は、個人の区域カードや留守宅カードで、${m}軒の方に真理に接する機会が差し伸べられました。`; break;
      case 'S5': s = `この奉仕年度は、全区域の${num(it.pct)}%を回ることができました。`; break;
      case 'S6': s = `${slotName(it.s)}は、ほかの時間帯の${fmtX(it.x)}倍の割合でお会いできています（この4週間）。`; break;
      case 'S7': s = m === 0 ? `きのうは雨の予報でしたが、${n}軒を訪ねる努力が払われました。` : `きのうは雨の予報でしたが、${n}軒を訪ねる努力が払われ、${m}軒の方にお会いできました。`; break;
      default: return '';
    }
    return T(s);
  }

  // 今日選べる項目（日付の合わないもの・S4 の0軒を外し、cv から S5 を足す）
  function eligible(obi, today) {
    const out = [];
    if (!obi || typeof obi !== 'object') return out;
    const dt = dates(today);
    (Array.isArray(obi.it) ? obi.it : []).forEach(it => {
      if (!it || typeof it !== 'object') return;
      const k = it.k;
      if (k === 'S3' || k === 'S7') { if (obi.d !== dt.d) return; }
      else if (k === 'S1' || k === 'S2' || k === 'S4') { if (obi.w !== dt.w) return; }
      else if (k !== 'S6') return;
      if (k === 'S4' && !(num(it.m) > 0)) return;
      out.push(it);
    });
    const cv = obi.cv;
    if (cv && num(cv.all) > 0) out.push({ k: 'S5', pct: Math.floor(num(cv.done) / num(cv.all) * 100) });
    return out;
  }

  // ひと言を1つ選ぶ。last＝前の日の種類。選べるものが無ければ last を外さずにもう一度。それでも無ければ null
  function pick(obi, today, last, rng) {
    try {
      const all = eligible(obi, today);
      let c = all.filter(it => it.k !== last);
      if (!c.length) c = all;
      if (!c.length) return null;
      const w = it => (it.k === 'S2' ? 2 : 1);
      const total = c.reduce((a, it) => a + w(it), 0);
      const r = (typeof rng === 'function' ? rng() : Math.random());
      let x = (isFinite(r) ? Math.min(Math.max(r, 0), 0.999999999) : 0) * total;
      for (const it of c) { x -= w(it); if (x < 0) return it; }
      return c[c.length - 1];
    } catch (e) { return null; }
  }

  // 毎日はじめのひと言に出す1つ（1回開くごとに1回だけ呼ぶ）。前の日の種類は localStorage 'kuiki_obi_last'。選べなければ null。何があっても投げない
  function helloText(today) {
    try {
      // R7：みんなの奉仕は、およそ2日に1日だけ。ふだんの言葉（helloWord）と同じ種：人ごと・日ごとに決まる。奉仕の日でなければ、何も読まず・書かず null
      const t = today && typeof today.getTime === 'function' && !isNaN(today.getTime()) ? today : new Date();
      const day = Math.floor((t - new Date(t.getFullYear(), 0, 0)) / 864e5);
      let hsh = 0; String(me().id).split('').forEach(c => { hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0; });
      if ((day + hsh) % 2 !== 0) return null;
      let last = null;
      try { last = localStorage.getItem('kuiki_obi_last'); } catch (e) { last = null; }
      const obi = typeof OBI !== 'undefined' ? OBI : null; // app.js が控えている、サーバーから届いた最新の obi
      const it = pick(obi, today, last);
      if (!it) return null;
      const tx = text(it);
      if (!tx) return null;
      try { localStorage.setItem('kuiki_obi_last', it.k); } catch (e) { /* 書けなくても出す */ }
      return { text: tx, k: it.k };
    } catch (e) { return null; }
  }

  window.ObiR = { text, pick, slotName, dates, eligible, helloText };
})();
