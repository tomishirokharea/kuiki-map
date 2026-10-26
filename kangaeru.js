/* =========================================================
   kangaeru.js  おすすめタブ（完了のあとの留守宅・近くの数軒）＋「自分で考える奉仕」
   指示書：claude/kangaeru-housi-jissou-shijisho.md ／ claude/osusume-narabekae-jissou-shijisho.md ／ claude/osusume-kanryougo-20261026.md
   読み込み：index.html の schedule.js → kantan.js のあとに <script src="kangaeru.js"></script>
   ・ホームには、おすすめを出さない（毎日のひと言・今日やること・ホームの「今日のおすすめ」を消す）
   ・2026-10-26 から：区域カードのタブは S-13 の完了まで（新規 → 留守宅カード → 完了）。おすすめタブは、完了した区域の
     残りの留守宅を、近くの数軒ずつ出す（区域カード・留守宅カードは出さない）。いつ（今／ほかの時間帯）をえらび、
     3つの欄（近さ・前に訪ねた・若い世代）で並べかえる。「今行く」「予定に入れる」で、その家をほかの人のおすすめから外す（押さえ）
   ・地図：区域の線を枠にして、回る家に番号（KF）
   ・距離の起点：今いる場所／会館（config.js の hall）／地図でえらんだ場所（このスマホの中だけ）
   ・役に立った記録・会衆の目標は保留（コードは残し、表示だけ止めてある）
   ・ふり返りは、おすすめタブのいちばん下（このスマホの中だけ）
   サーバーに新しく送るのは、区域の t.paperDone（係のスマホが書く）と、係の設定 kgGoal だけ（今回は増やしていない）
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof renderHome !== 'function') return;
  const KM = window.KM;            // schedule.js が出す窓口。年間カバー・前回回り終えた日・時間帯の表は、ここの関数だけを使う（写さない）
  if (!KM || typeof KM.coverInfo !== 'function') return;

  const SLB = ['朝', '昼', '午後', '夕方', '夜'], SLC = ['平日', '土曜', '日曜'];
  const BT = ['09:00', '12:00', '15:00', '17:00', '19:00'];   // 時間帯のはじめ（朝・昼・午後・夕方・夜）
  const FEW = KM.SL_FEW, BEST = KM.SL_BEST, MIN_HOMES = 10;
  const num = (v, d) => (v === undefined || v === null || v === '' || !isFinite(Number(v)) ? d : Number(v));

  /* ---------- 見た目 ---------- */

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `.kgcard{margin:10px 0}
.kgthanks{background:#E8F5E9;border:2px solid #2E7D32;border-radius:14px;padding:12px 14px}
.kgbig{font-size:34px;font-weight:700;color:var(--brand-ink);line-height:1.2}
.kgwhy{display:block;width:100%;min-height:44px;text-align:left;background:none;border:0;padding:8px 0;color:var(--ink2);font-size:16px;line-height:1.5} /* 押せる所は44px以上（改善案A9） */
.kgwhy:after{content:' ›';font-weight:700}
.kgsm{font-size:15px;color:var(--ink2)}
.kgday{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:6px 0}
.kgday .choice{min-height:60px;font-size:17px}
.kgtbl td.kgmine,.kgtblbox td.kgmine{outline:4px solid #C2410C;outline-offset:-4px}
.kgstat{font-size:17px;font-weight:700;margin:6px 0 4px}
.kgorg{display:inline-flex;align-items:center;min-height:44px;border:2px solid var(--line);background:#fff;border-radius:22px;padding:0 14px;font-size:16px;color:var(--ink);margin:4px 0}
.kgorg:after{content:'▾';margin-left:6px;color:var(--brand-ink)}
.kgsorts{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 8px;-webkit-overflow-scrolling:touch}
.kgsort{flex:none;min-height:46px;border:2px solid var(--line);background:#fff;border-radius:23px;padding:0 15px;font-size:16px;color:var(--ink);white-space:nowrap}
.kgsort[aria-pressed=true],.kgcol.on{background:#DCE8F7;border-color:var(--brand-ink);color:var(--brand-ink);font-weight:700}
.kgc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0}
.kgct{font-weight:700;font-size:17px;margin:0 0 6px;line-height:1.4}
.kgbadge{display:inline-block;font-size:13px;font-weight:400;border-radius:9px;padding:0 8px;background:#E3ECF6;color:var(--brand-ink);margin-left:6px;vertical-align:1px}
.kgcols{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:6px 0}
.kgcols.two{grid-template-columns:repeat(2,1fr);gap:8px}
.kgcol{border:1.5px solid var(--line);border-radius:10px;background:#fff;padding:5px 2px;text-align:center;min-height:62px;color:var(--ink);font-size:15px;line-height:1.25}
.kgcol svg{width:16px;height:16px;display:block;margin:0 auto 1px;color:var(--ink2)}
.kgcol small{display:block;font-size:12px;color:var(--ink2);line-height:1.2}
.kgcol b{display:block;font-size:15px}
.kgev{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}
.kgev small{display:block;color:var(--ink2)}
.uiseg button:disabled{opacity:.45}
.kgbody.simple .kgstat{font-size:22px}
.kgbody.simple .kgsm{font-size:18px}
.kgbody.simple .kgsort{min-height:60px;font-size:20px;padding:0 20px}
.kgbody.simple .kgsorts{flex-wrap:wrap;overflow:visible}
.kgbody.simple .kgsort{white-space:normal;flex:1 1 auto;line-height:1.3;padding-top:6px;padding-bottom:6px}
.kgbody.simple .kgct{font-size:23px}
.kgbody.simple .kgcol{min-height:84px}
.kgbody.simple .kgcol small{font-size:17px}
.kgbody.simple .kgcol b{font-size:28px}
.kgbody.simple .kgcol svg{width:22px;height:22px}
.kgbody.simple .kgwhy{font-size:19px}
.kgbody.simple .kgbig{font-size:34px}
.kgbody.simple .actions .btn{min-height:62px;font-size:21px}
.kgbody.simple .kgplan{min-height:48px;font-size:17px}
.kgbody.simple .kgev{font-size:19px}
.kgmin{font-size:14px;font-weight:400;color:var(--ink2);margin-left:8px;white-space:nowrap}
.kgcols.three{grid-template-columns:repeat(3,1fr)}
.kgwhen{margin:4px 0 8px}
.kgwhen button{min-height:46px;font-size:16px}
.kgwhen button:disabled{opacity:.45}
.kgevb{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.kgslots{grid-template-columns:repeat(4,1fr)}
.kgslots .choice{min-height:56px;font-size:16px}
.kglost{margin:8px 0}
.kgbody.simple .kgmin{font-size:17px}
.kgbody.simple .kgevb .btn{min-height:52px;font-size:18px}`;
  document.head.appendChild(css);

  /* ---------- 計算の結果を少しのあいだ覚える ---------- */
  const MEMO = new Map();
  let memoAt = 0;
  const memo = (key, fn) => {
    if (Date.now() - memoAt > 60000) { MEMO.clear(); memoAt = Date.now(); }
    if (!MEMO.has(key)) MEMO.set(key, fn());
    return MEMO.get(key);
  };
  const _buildIndex = window.buildIndex;
  window.buildIndex = function () { MEMO.clear(); return _buildIndex.apply(this, arguments); };
  const vl = () => D().visits.length;

  /* ---------- 日付・曜日・区分 ---------- */
  const colOf = d => { const w = d.getDay(); return w === 0 ? 2 : w === 6 ? 1 : (holidayOf(ymd(d)) ? 2 : 0); }; // 祝日は日曜
  const slotCol = slot => { const n = colOf(new Date()); return String(slot).indexOf('土日') === 0 ? (n > 0 ? n : 1) : 0; };
  const slotBand = slot => Math.max(0, SLB.indexOf(String(slot).split('・')[1]));
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const daysFrom = s => Math.floor((Date.now() - parseYmd(s).getTime()) / DAY);
  const offToday = () => (Array.isArray(D().settings.offDays) ? D().settings.offDays : []).indexOf(ymd(new Date())) >= 0;
  const eligible = () => D().territories.filter(t => !t.dummy && !isSpecial(t));
  const goalOn = () => num(D().settings.kgGoal, 1) !== 0;
  const uiOn = k => UI[k] !== 'off';

  /* =========================================================
     案3 会衆の年間カバー
     ・係の「今日」タブと同じ数え方：対象は eligible()、前回回り終えた日から365日以内を「回った」
     ・前回回り終えた日＝アプリの記録（completedAt）と、紙の記録の完了日（t.paperDone／係のスマホ内のS-13）の新しいほう
     ========================================================= */
  const lastDoneOf = t => KM.lastDone(t);
  function coverStats() {
    const c = KM.coverInfo();                     // 係の「今日」タブと同じ関数。数が食いちがうことはない
    return { total: c.total, done: c.covered, left: c.total - c.covered, pct: c.total ? Math.round(c.covered / c.total * 100) : 0 };
  }
  /* 今月、それまで会えていなかった（留守の記録だけがあった）家で、会えた数（だれが会えたかは問わない） */
  function monthMet() {
    const now = new Date();
    return memo('kgmm' + ymOf(now) + '|' + vl(), () => {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const ok = new Set(eligible().map(t => t.id));
      let n = 0;
      IDX.forEach(a => {
        if (!a || !a.length) return;
        let away = false;
        for (let i = a.length - 1; i >= 0; i--) {      // 古い順に見る
          const v = a[i];
          if (v.result === 'away') { away = true; continue; }
          if (v.result === 'met') {
            if (away && v.at >= start) { const h = HID.get(v.houseId); if (h && ok.has(h.terrId)) n++; }
            break;                                       // 最初に会えた記録だけが対象
          }
        }
      });
      return n;
    });
  }
  /* 係のスマホで、紙の記録（S-13）のいちばん新しい完了日を、各区域の t.paperDone に書く。
     書く主体は係だけ。まだ paperDone がない区域には、はじめの1回でまとめて書かれる */
  /* あわせて、紙の記録で「割り当てたが、まだ完了していない」区域は t.paperLentAt（割り当てた日）を書く（2026.13.48）。
     ・名前は書かない（伝道者のスマホには「紙の記録で貸出中」だけが分かればよい。名前は係のスマホの S-13 から出す）
     ・その割り当てのあとに、アプリで貸し出した区域は、アプリの記録を優先する（紙のカードをアプリの担当に渡したとき） */
  function syncPaperDone() {
    if (!isAdmin() || Store.needMeta || !Array.isArray(D().s13)) return;
    const best = new Map(), lastA = new Map(), appLent = new Map();
    const later = (m, k, v) => { if (v && (!m.has(k) || m.get(k) < v)) m.set(k, v); };
    D().s13.forEach(x => {
      if (!x || !x.terrId) return;
      if (x.c) later(best, x.terrId, String(x.c));
      // いちばん新しい紙の割り当て（完了した日付が空なら、まだ紙で持っている）
      if (x.kind === 'a' && x.a) { const o = lastA.get(x.terrId); if (!o || String(o.a) < String(x.a)) lastA.set(x.terrId, x); }
    });
    const open = new Map();
    lastA.forEach((x, k) => { if (!x.c) open.set(k, String(x.a)); });
    (D().returns || []).forEach(r => { if (r && r.terrId && r.lentAt) later(appLent, r.terrId, dstr(r.lentAt)); });
    let ch = false;
    D().territories.forEach(t => {
      const want = best.get(t.id) || '';
      if ((t.paperDone || '') !== want) { if (want) t.paperDone = want; else delete t.paperDone; ch = true; }
      const pa = open.get(t.id) || '';
      const app = [t.lentAt ? dstr(t.lentAt) : '', appLent.get(t.id) || ''].sort().pop();
      const wantL = pa && !t.holder && pa > app ? pa : '';
      if ((t.paperLentAt || '') !== wantL) { if (wantL) t.paperLentAt = wantL; else delete t.paperLentAt; ch = true; }
    });
    if (ch) { KM.memoClear(); Store.save(true); }
  }
  const _renderAll = window.renderAll;
  window.renderAll = function () {
    const r = _renderAll.apply(this, arguments);
    try { syncPaperDone(); } catch (e) { console.error(e); }
    try { tidyHolds(); } catch (e) { console.error(e); }
    return r;
  };

  function goalHtml(simple) {
    if (!goalOn() || !uiOn('kgGoal')) return '';
    const c = coverStats();
    if (!c.total) return '';
    if (simple) return `<div class="today homecard kgcard"><p class="kgbig">${c.pct}%</p><p>今年、会衆で区域の${c.pct}%を回りました</p></div>`;
    const mm = monthMet();
    return `<div class="today homecard kgcard"><b>今年、会衆で区域の <span class="kgbig">${c.pct}%</span> を回りました</b>
      <div class="progress big" role="progressbar" aria-valuenow="${c.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="今年回った区域の割合"><i style="width:${c.pct}%"></i></div>
      <p class="muted">あと${c.left}区域</p>
      ${mm ? `<p>今月、会えていなかった家の <b>${mm}軒</b> で会えました</p>` : ''}
      <p class="kgsm">みんなで目指す目標です</p></div>`;
  }

  /* =========================================================
     案1 あなたの記録が役に立ちました
     ・自分が「留守」を記録した家（部屋）に、その後、ほかの人の「会えた」がついた数
     ・家や人は出さない。区域ごとの軒数だけ。前回「わかりました」を押した日時より新しい分だけ知らせる
     ========================================================= */
  const thKey = () => 'kuiki_thanks_' + me().id;
  function thanksInfo() {
    return memo('kgth' + me().id + '|' + vl(), () => {
      const my = me().id, items = [];
      IDX.forEach((a, k) => {
        if (!a || a.length < 2) return;
        let oldMine = null;
        for (let i = a.length - 1; i >= 0; i--) if (a[i].by === my && a[i].result === 'away') { oldMine = a[i]; break; }
        if (!oldMine) return;
        const w = a.find(v => v.result === 'met' && v.by !== my && v.at > oldMine.at);   // 新しい順なので、いちばん新しい「ほかの人の会えた」
        if (!w) return;
        const h = HID.get(w.houseId);
        items.push({ k, metAt: w.at, tid: h ? h.terrId : null });
      });
      return { items, total: items.length };
    });
  }
  function thanksFresh() {
    const seen = lsGet(thKey()) || '';
    return thanksInfo().items.filter(x => x.metAt > seen);
  }
  function thanksTerrText(items) {
    const m = new Map();
    items.forEach(x => { if (x.tid) m.set(x.tid, (m.get(x.tid) || 0) + 1); });
    return [...m.entries()].map(([tid, n]) => ({ t: terrById(tid), n })).filter(x => x.t).sort((p, q) => cmpNo(p.t.no, q.t.no))
      .map(x => `区域${esc(x.t.no)}で${x.n}軒`).join('・');
  }
  function thanksHtml(simple) {
    if (!uiOn('kgThanks')) return '';
    const th = thanksInfo(), fresh = thanksFresh();
    if (fresh.length) {
      if (simple) return `<div class="kgthanks kgcard"><p><b>あなたの留守の記録で、${fresh.length}軒の人に会えました</b></p>
        <button type="button" class="btn primary block" data-kgthok>わかりました</button></div>`;
      return `<div class="kgthanks kgcard"><p><b>あなたが留守を記録した家で、別の日に会えた人がいます　${fresh.length}軒</b></p>
        <p>ありがとうございました</p>
        <div class="row"><button type="button" class="btn small" data-kgthsee>見る</button><button type="button" class="btn small primary" data-kgthok>わかりました</button></div></div>`;
    }
    return '';
  }
  const thanksFoot = () => {
    if (!uiOn('kgThanks')) return '';
    const n = thanksInfo().total;
    return n ? `<p class="kgsm">これまでに役に立った記録　${n}軒</p>` : '';
  };
  function thanksDone() {
    const items = thanksInfo().items;
    const top = items.reduce((a, x) => (x.metAt > a ? x.metAt : a), lsGet(thKey()) || '');
    lsSet(thKey(), top);
    closeSheet();
    renderHome();
  }
  function openThanks() {
    const fresh = thanksFresh();
    setSheet(headHtml(null, 'あなたの記録が役に立ちました', '') + `
      <div class="kgthanks"><p><b>${fresh.length ? thanksTerrText(fresh) : 'いまのところ、新しい知らせはありません'}</b></p></div>
      <p class="muted">どの家か、だれが会えたかは出していません。</p>
      <p class="hint">留守の記録が、次の人の訪問に生かされています</p>
      <button class="btn primary block" id="kgThDone">わかりました</button>
      <button class="btn block" data-close>閉じる</button>`);
    $('#kgThDone').onclick = thanksDone;
  }

  /* =========================================================
     案4 自分だけのふり返り（このスマホの中だけ。送らない）
     ========================================================= */
  function myStats() {
    return memo('kgme' + me().id + '|' + vl(), () => {
      const now = new Date(), cut = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString(), my = me().id;
      const kv = new Set(), km = new Set(), n = new Array(15).fill(0), m = new Array(15).fill(0);
      let tot = 0;
      for (const v of D().visits) {
        if (v.by !== my || v.at < cut) continue;
        const d = new Date(v.at); if (isNaN(d)) continue;
        const k = K(v.houseId, v.unit);
        kv.add(k); tot++;
        const met = v.result === 'met' || v.result === 'refused';
        if (v.result === 'met') km.add(k);
        const c = SLB.indexOf(bandOf(d)) * 3 + colOf(d);
        n[c]++; if (met) m[c]++;
      }
      let best = -1, bp = -1;
      if (tot >= 20) for (let c = 0; c < 15; c++) if (n[c] >= FEW && m[c] / n[c] > bp) { bp = m[c] / n[c]; best = c; }
      return { homes: kv.size, met: km.size, n, m, tot, best: bp > 0 ? best : -1 };
    });
  }
  const lookWord = s => (s.best >= 0 ? `あなたは${SLC[s.best % 3]}の${SLB[Math.floor(s.best / 3)]}によく会えています` : '記録が増えると、ここにヒントが出ます');


  /* =========================================================
     ふり返り（おすすめタブのいちばん下。このスマホの中だけ。送らない）
     ========================================================= */
  function lookSection(simple) {
    const s = myStats();
    if (simple) return `<h2 class="sec">ふり返り</h2><div class="kgc"><p class="kgbig">${esc(lookWord(s))}</p><p class="kgsm">訪ねた家 ${s.homes}軒・会えた ${s.met}軒</p></div>`;
    const rows = SLB.map((b, bi) => `<tr><th>${b}<br><small>${BAND_HINT[b]}</small></th>${[0, 1, 2].map(ci => {
      const c = bi * 3 + ci, n = s.n[c];
      if (n < FEW) return '<td></td>';
      const p = Math.round(s.m[c] / n * 100);
      return `<td style="background:rgba(21,101,192,${(0.06 + p / 100 * 0.5).toFixed(2)})"><b>${p}%</b><br><small>${n}件</small></td>`;
    }).join('')}</tr>`).join('');
    return `<h2 class="sec">ふり返り</h2><div class="kgc">
      <div class="notice info">このスマホの中だけで見られます。係やほかの人には送られません。</div>
      <p class="q">直近3か月：訪ねた家 ${s.homes}軒・会えた ${s.met}軒</p>
      <p><b>${esc(lookWord(s))}</b></p>
      <table class="slots slotnew kgtbl" aria-label="あなたの曜日と時間帯ごとの会えた割合"><tr><th></th>${SLC.map(x => `<th>${x}</th>`).join('')}</tr>${rows}</table>
      <p class="hint">会えた割合の濃さです。記録が${FEW}件に満たない欄は空けています。人と比べる数字は出していません。</p></div>`;
  }

  const dayText = (col, bi) => `${SLC[col]}の${SLB[bi]}`;

  /* =========================================================
     時間帯の集計（区域×月×曜日区分×時間帯）。「区域のようす」と、おすすめの理由に使う
     ========================================================= */
  const slotQ = (tid, per) => { const t = terrById(tid); return t ? KM.slotQuery([t], per) : { n: new Array(15).fill(0), m: new Array(15).fill(0) }; };
  const homesOf = t => memo('kgh' + t.id + '|' + D().houses.length, () => housesOf(t.id).reduce((a, h) => a + targets(h).length, 0));

  /* =========================================================
     案2 理由を押すと「区域のようす」（伝道者向け。名前・S-13・拒否の数・何度訪ねても会えない家は出さない）
     ========================================================= */
  function topSlots(tid) {
    const q = slotQ(tid, 12), out = [];
    for (let c = 0; c < 15; c++) if (q.n[c] >= BEST) out.push({ c, p: q.m[c] / q.n[c] });
    return out.sort((a, b) => b.p - a.p).slice(0, 3);
  }
  // 表は schedule.js の slotTableHtml をそのまま使う（係の画面と同じ表）。今の曜日・時間帯の欄に枠を付け、
  // 「試してみてください」の呼びかけは伝道者向けには出さない
  function infoTable(tid, per) {
    const t = terrById(tid);
    return `<div class="kgtblbox">${KM.slotTableHtml({ sc: 'terr', terrs: [t], t, all: [t] }, per)}</div>`;
  }
  function markSlot(S, hl) {
    const tb = S.querySelector('.kgtblbox table'); if (!tb) return;
    const row = tb.rows[Math.floor(hl / 3) + 1], cell = row && row.cells[(hl % 3) + 1];
    if (cell) cell.classList.add('kgmine');
    S.querySelectorAll('.kgtblbox .hint-strong').forEach(e => e.remove());
  }
  const ST_PER = { v: 4 };
  const on2 = (S, sel, fn) => { const b = S.querySelector(sel); if (b) b.onclick = fn; };
  window.openTerrInfo = function (tid, col, bi, from) {
    const t = terrById(tid); if (!t) return;
    const simple = isSimple(), homes = homesOf(t), few = homes < MIN_HOMES;
    col = col == null ? colOf(new Date()) : col;
    bi = bi == null ? Math.max(0, SLB.indexOf(bandOf(new Date()))) : bi;
    const hl = bi * 3 + col;
    let state;
    if (t.holder === me().id) { const r = roundInfo(tid); state = r ? `あと${r.c.todo}軒` : '回っています'; }
    else {
      const l = lastDoneOf(t);
      state = (l ? `前回回り終えたのは${parseYmd(l).getFullYear()}年${parseYmd(l).getMonth() + 1}月` : '前回の記録はありません') + '・' +
        (t.holder ? 'だれかが回っています' : t.awayPoolAt ? '留守宅カードで回っています' : '空いています');
    }
    let line = '', top = '', unmet = 0;
    if (!few) {
      const q = slotQ(tid, 4), c = hl;
      line = q.n[c] ? `<p><b>この時間帯は（${dayText(col, bi)}）：</b>会えた割合 ${Math.round(q.m[c] / q.n[c] * 100)}%（${q.n[c]}件）</p>`
        : `<p><b>この時間帯は（${dayText(col, bi)}）：</b>まだ試していません</p>`;
      const ts = topSlots(tid);
      top = `<p class="q">会いやすい時間</p>` + (ts.length ? `<ol class="plan">${ts.map(x => `<li><span class="numbadge">${ts.indexOf(x) + 1}</span><p class="${simple ? 'kgbig' : ''}"><b>${dayText(x.c % 3, Math.floor(x.c / 3))}</b>　${Math.round(x.p * 100)}%</p></li>`).join('')}</ol>`
        : '<p class="muted">記録が増えると、ここに出ます。</p>');
    }
    housesOf(tid).forEach(h => targets(h).forEach(u => { const k = K(h.id, u); if (!D().dnc[k] && isUnmet(k)) unmet++; }));
    // この区域の留守宅で試した時間帯（参考。完了の条件ではない）。この区域の家だけ調べる（3万件を1周しない）。くわしい表示だけ、会えていない家があるときだけ
    let triedBox = '';
    if (!few && !simple) {
      const tc = triedOf(unmetIndex(tid).get(tid));
      if (tc != null) triedBox = `<button type="button" class="kgwhy" data-kgtried>この区域の留守宅で試した時間帯：${tc} / ${SLOTS.length}</button>
        <p class="hint">${SLOTS.length}通りすべてを試す必要はありません。会えなかった家の${awayRetPct()}%を訪ね直すと、区域が完了します</p>`;
    }
    const age = (!simple && typeof AGE_ON !== 'undefined' && AGE_ON && typeof ageMap === 'function' && ageMap())
      ? `<p><button type="button" class="agetype at-mix" data-prof="${esc(tid)}" data-back="">この地域のようす ›</button></p>` : '';
    const tableBox = few
      ? '<div class="slpriv"><b>家が少ない区域なので、くわしい数は出していません。</b></div>'
      : simple ? '' : `<div class="seg" role="group" aria-label="期間"><button type="button" data-kgper="4" aria-pressed="${ST_PER.v === 4}">直近4か月</button><button type="button" data-kgper="12" aria-pressed="${ST_PER.v === 12}">1年</button></div>
          ${infoTable(tid, ST_PER.v)}<p class="hint">枠で囲んだ欄が、今のおすすめの曜日・時間帯です。人と比べる数字は出していません。</p>`;
    const yg = youngOf(t);
    const youngLine = !simple && yg ? `<p class="muted">若い世代：${yg === 2 ? '多い' : 'ふつう'}（区域の統計からの目安です）</p>` : '';
    const hasKarte = isAdmin() && typeof KM.openKarte === 'function';
    setSheet(headHtml(t, `区域${esc(t.no)}のようす`, esc(t.name || '')) + `
      <p><b>${esc(state)}</b></p>${line}${triedBox}${simple ? '' : tableBox}${top}${simple && few ? tableBox : ''}
      ${simple ? '' : `${age}<p class="muted">家・部屋 ${homes}軒・会えていない家 ${unmet}軒</p>${youngLine}`}
      <div class="actions"><button type="button" class="btn primary" id="kgiMap">地図で見る</button>
        ${simple ? '' : '<button type="button" class="btn" id="kgiPlan">予定に入れる</button>'}
        ${from && from.now ? '<button type="button" class="btn primary" id="kgiGo">今行く</button>' : ''}
        ${hasKarte && !simple ? '<button type="button" class="btn" id="kgiKarte">カルテを開く（係）</button>' : ''}</div>
      <button class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet'), on = (id, fn) => { const b = $('#' + id, S); if (b) b.onclick = fn; };
    markSlot(S, hl);
    on2(S, '[data-kgtried]', () => { const b = S.querySelector('.kgtblbox'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); // すぐ下の曜日×時間帯の表へ
    $$('[data-kgper]', S).forEach(b => b.onclick = () => { ST_PER.v = Number(b.dataset.kgper); sheetKeep = true; window.openTerrInfo(tid, col, bi, from); });
    on('kgiMap', () => { closeSheet(); if (from && from.kind === 'after') openKF({ tid, keys: from.keys }); else openTerr(tid); }); // おすすめの家は、区域の線と回る家の番号
    on('kgiPlan', () => openPlan(from || { kind: 'round', t, col, bi, title: `区域${t.no}` }));
    on('kgiGo', () => { closeSheet(); goPick(from); });
    on('kgiKarte', () => { closeSheet(); KM.openKarte(tid); });
  };

  /* =========================================================
     案2 予定に入れる（自分の予定。このスマホの中だけ）
     ========================================================= */
  function nextDate(col, bi) {
    const nowH = new Date().getHours(), today = ymd(new Date()), startH = Number(BT[bi].slice(0, 2));
    for (let i = 0; i < 15; i++) {
      const s = addDays(today, i), d = parseYmd(s), c = colOf(d);
      if ((col === 0 ? c === 0 : c === col || (col === 1 && c > 0)) && (i > 0 || startH > nowH)) return s;
    }
    return addDays(today, 1);
  }
  const nextWeekday = w => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + ((w - t.getDay() + 7) % 7 || 7)); return ymd(t); };
  function openPlan(it) {
    if (it && it.kind === 'after') { openPlanAfter(it); return; } // おすすめの家（完了のあとの留守宅）：その日の終わりまで家を押さえる
    const st = { date: nextDate(it.col, it.bi), bi: it.bi };
    const night = num(D().settings.nightOn, 0) === 1;
    const bands = night ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
    const paint = () => {
      const today = ymd(new Date()), opts = [['今日', today], ['明日', addDays(today, 1)], ['今度の土曜', nextWeekday(6)], ['今度の日曜', nextWeekday(0)]];
      setSheet(headHtml(null, '予定に入れる', esc(it.title)) + `
        ${it.kind === 'card' ? '<div class="notice info">カードは、その日に受け取ります（ほかの人が先に受け取ることもあります）</div>' : ''}
        <p class="q">いつにしますか</p>
        <div class="kgday">${opts.map(([l, v]) => `<button type="button" class="choice${st.date === v ? ' on' : ''}" data-kgd="${v}" aria-pressed="${st.date === v}">${l}<small>${fmtYmd(v)}</small></button>`).join('')}</div>
        <label class="field"><span>日付をえらぶ</span><input type="date" id="kgDate" min="${today}" value="${esc(st.date)}"></label>
        <p class="q">時間帯</p>
        <div class="kgday">${bands.map(b => `<button type="button" class="choice${st.bi === b ? ' on' : ''}" data-kgb="${b}" aria-pressed="${st.bi === b}">${SLB[b]}<small>${BAND_HINT[SLB[b]]}</small></button>`).join('')}</div>
        <button class="btn primary block" id="kgSave">この日に入れる</button>
        <button class="btn block" data-close>やめる</button>`);
      const S = $('#sheet');
      $$('[data-kgd]', S).forEach(b => b.onclick = () => { st.date = b.dataset.kgd; sheetKeep = true; paint(); });
      $$('[data-kgb]', S).forEach(b => b.onclick = () => { st.bi = Number(b.dataset.kgb); sheetKeep = true; paint(); });
      $('#kgDate').onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { st.date = e.target.value; sheetKeep = true; paint(); } };
      $('#kgSave').onclick = () => {
        if (st.date < ymd(new Date())) { toast('今日より前の日は入れられません'); return; }
        const dl = SLC[colOf(parseYmd(st.date))], band = SLB[st.bi];
        const title = it.kind === 'card' ? `区域${it.t.no}の留守宅（${dl}・${band}）` : it.kind === 'round' ? `区域${it.t.no}の続き（${dl}・${band}）`
          : it.kind === 'terr' ? `区域${it.t.no}を受け取る（${dl}・${band}）` : `区域${it.t.no}のおすすめの家（${dl}・${band}）`;
        const o = myData();
        o.events.push({ id: uid(), date: st.date, time: BT[st.bi], title, tid: it.t.id, rk: it.kind === 'group' ? ((it.sel && it.sel[0] && it.sel[0].rk) || 'reco') : it.kind, band });
        mySave(o);
        renderHome();
        if (currentView === 'reco') renderRecoView();
        setSheet(headHtml(null, '予定に入れました', esc(title)) + `
          <p class="okmsg"><b>${fmtYmd(st.date)}　${BT[st.bi]}ごろ</b>の予定に入りました。ホームの「これからの予定」に出ます。</p>
          <a class="btn block" href="${gcalUrl(title, st.date, BT[st.bi], '', '', '')}" target="_blank" rel="noopener">Googleカレンダーに入れる</a>
          <button class="btn primary block" data-close>閉じる</button>`);
        toast('予定に入れました');
      };
    };
    paint();
  }
  /* 予定の行の「地図をひらく」 */
  function openEvent(id) {
    const e = myData().events.find(x => x.id === id);
    if (!e || !e.tid) return;
    closeSheet();
    if (e.hold) { openHoldById(e.hold); return; } // おすすめの予定（押さえた家）：地図に区域の線と、回る家の番号
    if (e.rk === 'card') openAwayPick(false); else openTerr(e.tid);
  }
  const evBtn = id => `<button type="button" class="btn small" data-kgopen="${esc(id)}">地図をひらく</button>`;
  const _calHtml = window.calHtml;
  window.calHtml = function () {
    let h = _calHtml.apply(this, arguments);
    try {
      myData().events.filter(e => e.tid).forEach(e => {
        const needle = `${esc(e.title)}</span><small>自分の予定</small>`;
        h = h.replace(needle, `${esc(e.title)}<br>${evBtn(e.id)}</span><small>自分の予定</small>`);
      });
    } catch (err) { console.error(err); }
    return h;
  };
  if (typeof todayTodoHtml === 'function') {
    const _todo = window.todayTodoHtml;
    window.todayTodoHtml = function () {
      let h = _todo.apply(this, arguments);
      try {
        const today = ymd(new Date());
        myData().events.filter(e => e.tid && e.date === today).forEach(e => {
          h = h.replace(`${esc(e.title)}</b></div>`, `${esc(e.title)}</b></div>${evBtn(e.id).replace('btn small', 'btn')}`);
        });
      } catch (err) { console.error(err); }
      return h;
    };
  }


  /* =========================================================
     おすすめタブ：このスマホだけの設定（歯車）と、距離の起点
     ========================================================= */
  let tmpSimple = null;                                  // kantan.js をくぐるあいだだけ使う目印
  const isS = () => (tmpSimple === null ? isSimple() : tmpSimple);
  const pk = (n) => 'kuiki_kg' + n + '_' + me().id;
  const tabPref = () => { const v = lsGet(pk('tab')); return v === 'on' || v === 'off' ? v : ''; };
  const recoTabOn = () => !!Store.data && recoOn() && (tabPref() ? tabPref() === 'on' : !isSimple());   // はじめ：くわしい＝出す／かんたん＝出さない
  const revOn = () => lsGet(pk('rev')) !== 'off';                                                    // はじめ：出す
  const sortKeyOf = () => 'kuiki_osort_' + me().id;
  const hallPos = () => { const h = window.KUIKI_CONFIG && window.KUIKI_CONFIG.hall; return Array.isArray(h) && h.length === 2 && isFinite(h[0]) && isFinite(h[1]) && (Number(h[0]) || Number(h[1])) ? [Number(h[0]), Number(h[1])] : null; };

  const ORG = { type: 'here', pick: null, who: '' };
  function orgLoad() {
    if (ORG.who === me().id) return;
    ORG.who = me().id; ORG.type = 'here'; ORG.pick = null;
    try {
      const o = JSON.parse(lsGet(pk('org')) || 'null');
      if (o) {
        if (o.type === 'hall' || o.type === 'pick') ORG.type = o.type;
        if (Array.isArray(o.pick) && o.pick.length === 2 && isFinite(o.pick[0]) && isFinite(o.pick[1])) ORG.pick = [Number(o.pick[0]), Number(o.pick[1])];
      }
    } catch (e) { /* はじめにもどす */ }
    if (ORG.type === 'hall' && !hallPos()) ORG.type = 'here';
    if (ORG.type === 'pick' && !ORG.pick) ORG.type = 'here';
  }
  const orgSave = () => lsSet(pk('org'), JSON.stringify({ type: ORG.type, pick: ORG.pick }));   // 地図でえらんだ場所も、このスマホの中だけ
  function orgPos() {
    orgLoad();
    if (isS() || ORG.type === 'here') return myPos || null;
    return ORG.type === 'hall' ? hallPos() : ORG.pick;
  }
  const orgSig = () => { const p = orgPos(); return (isS() ? 's' : ORG.type) + '|' + (p ? p[0].toFixed(5) + ',' + p[1].toFixed(5) : ''); };
  function orgWord() { return isS() || ORG.type === 'here' ? 'ここ' : ORG.type === 'hall' ? '会館' : 'えらんだ場所'; }
  const orgLabel = () => (ORG.type === 'hall' ? '会館から' : ORG.type === 'pick' ? '地図でえらんだ場所から' : '今いる場所から');

  /* =========================================================
     おすすめの候補（2026-10-26 から：完了した区域の、残りの留守宅だけ）
     ・区域カードのタブの役目は、S-13 の完了まで（新規 → 留守宅カード → 完了）
     ・おすすめタブは、完了した区域（次に区域カードとして受け取られるまで）の残りの留守宅を、近くの数軒ずつ出す。
       区域カード・留守宅カードの考え方は出さない（区域の線は、場所の目安の「枠」として地図に出す）
     ・出す家：係の「完了のあとの留守宅（おすすめ）」の決め（寝かせる日数・出す期間・1軒あたりの回数・オートロック）と、
       留守宅訪問のルール（間隔・同じ時間帯を重ねない）。えらんだ時間帯に、まだ訪ねていない家だけ（家ごとの留守の時間帯は見せない）
     ・ほかの人が押さえた家（今行く・予定に入れる）・留守宅カードの家・拒否・再訪問・立入禁止／手紙のみの建物は出さない
     ========================================================= */
  const recoN = () => Math.max(1, Math.min(5, num(D().settings.recoCount, 3)));     // 1つのおすすめに入れる家の数
  const osaeMaxN = () => Math.max(1, Math.min(5, num(D().settings.osaeMax, 2)));    // 押さえられる予定の数
  const osaeDaysN = () => Math.max(1, Math.min(14, num(D().settings.osaeDays, 7))); // 何日先まで予定に入れられるか
  const nightOk = () => num(D().settings.nightOn, 0) === 1;
  const slotOk = s => nightOk() || !String(s).endsWith('・夜');
  const BEND = [11, 14, 17, 19, 24];                                                // 時間帯の終わり（朝・昼・午後・夕方・夜）
  const offDay = s => (Array.isArray(D().settings.offDays) ? D().settings.offDays : []).indexOf(s) >= 0;
  const rainRank = h => (h.type === 'apt' ? (h.ac === 'ev' ? 0 : 1) : 2);           // 雨の日：0 エレベーターありの集合住宅・1 ほかの集合住宅・2 そのほか
  const rainy = () => typeof isRainy === 'function' && isRainy();
  const ceil5 = m => Math.max(5, Math.ceil(m / 5) * 5);
  const endOfDayIso = s => { const d = parseYmd(s); d.setHours(23, 59, 59, 999); return d.toISOString(); };
  const keyHid = k => k.slice(0, k.indexOf('|'));
  const keyUnit = k => k.slice(k.indexOf('|') + 1);

  /* ---------- 押さえ（holds。サーバーのデータ。app.js の holdLive・liveHolds） ----------
     ・今行く：今日の終わりまで／予定に入れる：予定の日の終わりまで。使っても使わなくても期限で外れる
     ・押さえた家は、ほかの人のおすすめに出ない。区域が次に区域カードとして受け取られたら効かない（そのときは本人に知らせる）
     ・どの端末で作ったかだけを、このスマホに覚える（カレンダーの予定を消したら、その押さえも終える。ほかの端末の押さえは終えない） */
  const myLive = () => liveHolds().filter(h => h.by === me().id);
  const myPlans = () => myLive().filter(h => h.kind === 'plan');
  const holdById = id => (D().holds || []).find(h => h.id === id) || null;
  const holdTaken = h => { const t = terrById(h.terrId); return !t || !!t.holder || !!t.awayPoolAt || String(t.completedAt || '') !== String(h.comp || ''); };
  const myLost = () => (D().holds || []).filter(h => h.by === me().id && !h.endedAt && Date.parse(h.until) > Date.now() && holdTaken(h));
  const holdTitle = h => { const t = terrById(h.terrId); return `区域${t ? t.no : '-'}の家 ${(h.keys || []).length}軒`; };
  const madeHere = () => { try { const a = JSON.parse(lsGet(pk('holds')) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const markHere = id => lsSet(pk('holds'), JSON.stringify(madeHere().filter(x => x !== id).concat(id).slice(-40)));
  const myHeldKeys = () => { const s = new Set(); myLive().forEach(h => (h.keys || []).forEach(k => s.add(k))); return s; };
  function heldByOthers() { const s = new Set(); liveHolds().forEach(h => { if (h.by !== me().id) (h.keys || []).forEach(k => s.add(k)); }); return s; }
  /* このスマホで作った予定の押さえで、カレンダーの予定を消したものを終える（だまって。ほかの人のおすすめに戻す） */
  let tidying = false;
  function tidyHolds() {
    if (tidying || !Store.data) return;
    const here = madeHere(); if (!here.length) return;
    const evs = new Set(myData().events.map(e => e.hold).filter(Boolean)), now = new Date().toISOString();
    const gone = myPlans().filter(h => here.includes(h.id) && !evs.has(h.id));
    const keep = here.filter(id => { const h = holdById(id); return h && !h.endedAt && Date.parse(h.until) > Date.now(); });
    if (keep.length !== here.length) lsSet(pk('holds'), JSON.stringify(keep));
    if (!gone.length) return;
    tidying = true;
    try { gone.forEach(h => { h.endedAt = now; }); Store.save(true); } finally { tidying = false; }
  }
  function newHold(c, kind, date, slot) {
    const t = c.t, now = new Date().toISOString();
    const h = { id: 'o' + uid(), by: me().id, at: now, until: kind === 'plan' ? endOfDayIso(date) : endOfToday(), kind, terrId: t.id, comp: t.completedAt, keys: c.keys.slice() };
    if (kind === 'plan') { h.date = date; h.slot = slot; }
    return h;
  }
  function endHold(id) {
    const h = holdById(id); if (!h || h.endedAt) return;
    const title = holdTitle(h);
    commitIn([], `${title}の予定をやめました。ほかの人のおすすめにも出るようになります`, () => { h.endedAt = new Date().toISOString(); });
    const o = myData(), n = o.events.length;
    o.events = o.events.filter(e => e.hold !== id);
    if (o.events.length !== n) { mySave(o); renderHome(); }
    if (KF && KF.hold === id) { KF = null; renderTerrs(); renderHouses(); syncTerrJump(); }
    if (currentView === 'reco') renderRecoView();
  }

  /* ---------- 候補の家（えらんだ時間帯に、まだ訪ねていない家） ---------- */
  function afterItems(slot) {
    const st = D().settings;
    const tsig = D().territories.map(t => t.id + ':' + (t.holder || '') + ':' + (t.completedAt || '') + ':' + (t.awayPoolAt || '') + ':' + (t.extStop ? 1 : 0) + ':' + (t.lend || '') + ':' + (Array.isArray(t.focus) ? t.focus.length : 0)).join(',');
    const hsig = (D().holds || []).map(h => h.id + (h.endedAt ? 'e' : '')).join(',');
    const ssig = [st.extRest, st.extCap, st.extDays, st.extStopBefore, st.recoLock, st.awayRecentDays, st.awayNoRepeat, st.awayScope, st.freeAfterDays, st.autoFree].join('|');
    return memo(['kga', slot, vl(), D().houses.length, D().awayCards.length, Object.keys(D().dnc).length, tsig, hsig, ssig, me().id].join('|'), () => {
      const rl = extRl(), now = Date.now(), lockOk = num(st.recoLock, 0) === 1;
      const locked = new Set(); activeCards().forEach(c => c.keys.forEach(k => locked.add(k)));
      const others = heldByOthers(), mine = myHeldKeys();
      const out = [], seen = new Set();
      for (const t of D().territories) {
        const rs = recoState(t); if (!rs || !rs.open) continue;
        // おすすめに出している区域の家だけを調べる（3万件を1周しない）
        const items = isSpecial(t) ? unmetOfSpecial(t) : (unmetIndex(t.id).get(t.id) || []);
        if (!items.length) continue;
        const fs = focusSlots(t).includes(slot); // 区域係が重点にした時間帯
        for (const x of items) {
          const h = x.h;
          if (seen.has(x.k) || !isFinite(h.lat) || !isFinite(h.lng)) continue;
          if (h.type === 'apt' && (h.ban === 'no' || h.ban === 'letter')) continue; // 立入禁止・手紙のみの建物
          if (h.type === 'apt' && h.lock && !lockOk) continue;                     // オートロック（係の設定）
          if (locked.has(x.k) || others.has(x.k) || mine.has(x.k)) continue;
          if (!awayOk(x, slot, rl, now)) continue;                                  // 1軒あたりの回数・間隔・同じ時間帯を重ねない
          seen.add(x.k);
          out.push({ k: x.k, h, u: x.u, t, lastAt: x.lastAt, focus: fs });
        }
      }
      return out;
    });
  }
  /* 近くの数軒にまとめる：区域ごとに、起点にいちばん近い家（起点がなければ、いちばん長く訪ねていない家）から、
     近い家を recoN 軒まで。回る順は、起点から近い順につなぐ。雨の日は集合住宅の部屋から（エレベーターありが先） */
  function buildClusters(items, pos, rain) {
    const N = recoN(), byT = new Map(), out = [];
    items.forEach(x => { if (!byT.has(x.t.id)) byT.set(x.t.id, []); byT.get(x.t.id).push(x); });
    byT.forEach(arr => {
      const stops = new Map();
      arr.forEach(x => {
        let s = stops.get(x.h.id);
        if (!s) stops.set(x.h.id, s = { h: x.h, xs: [], last: x.lastAt, rank: rainRank(x.h) });
        s.xs.push(x); if (x.lastAt < s.last) s.last = x.lastAt;
      });
      let pool = [...stops.values()];
      if (rain) { const best = Math.min(...pool.map(s => s.rank)); if (best < 2) pool = pool.filter(s => s.rank <= 1); }
      const seeds = rain && pool.some(s => s.rank === 0) ? pool.filter(s => s.rank === 0) : pool;
      const dOfS = s => distM(pos, [s.h.lat, s.h.lng]);
      const seed = pos ? seeds.reduce((a, s) => (dOfS(s) < dOfS(a) ? s : a)) : seeds.reduce((a, s) => (s.last < a.last ? s : a));
      const sp = [seed.h.lat, seed.h.lng];
      const near = pool.slice().sort((a, b) => (a === seed ? -1 : b === seed ? 1 : distM(sp, [a.h.lat, a.h.lng]) - distM(sp, [b.h.lat, b.h.lng])));
      const sel = []; let n = 0;
      for (const s of near) {
        if (n >= N) break;
        const xs = s.xs.slice().sort((a, b) => (a.lastAt < b.lastAt ? -1 : a.lastAt > b.lastAt ? 1 : 0)).slice(0, N - n);
        sel.push({ h: s.h, xs }); n += xs.length;
      }
      const route = [], rest = sel.slice();
      let cur = pos || sp, walk = 0;
      while (rest.length) {
        let bi = 0, bd = Infinity;
        rest.forEach((s, i) => { const d = distM(cur, [s.h.lat, s.h.lng]); if (d < bd) { bd = d; bi = i; } });
        const s = rest.splice(bi, 1)[0];
        s.leg = pos || route.length ? bd : null;
        if (s.leg != null) walk += bd;
        route.push(s); cur = [s.h.lat, s.h.lng];
      }
      const keys = route.flatMap(s => s.xs.map(x => x.k));
      const last = route.reduce((a, s) => s.xs.reduce((b, x) => (x.lastAt < b ? x.lastAt : b), a), '9999');
      out.push({ kind: 'after', t: arr[0].t, stops: route, keys, n: keys.length, dist: pos ? route[0].leg : null, mins: ceil5(walk / 67 + 4 * keys.length),
        last, rank: Math.max(...route.map(s => rainRank(s.h))), rain: !!rain, focus: arr[0].focus });
    });
    out.forEach((c, i) => { c.i = i; });
    return out;
  }

  /* ---------- いつ（今／ほかの時間帯）・並べかえ ---------- */
  const VIEW = { shown: 10, list: null, order: [], slot: null, sig: '' };   // slot：null＝今
  let TOK = 0;
  const DOW = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
  const curSlot = () => slotOf(new Date());
  const nowOk = () => !offToday() && slotOk(curSlot());
  function nextOkSlot() { // 今が夜・訪問を控える日のとき：次に回れる時間帯
    const d = new Date();
    for (let i = 1; i <= 72; i++) {
      d.setTime(Date.now() + i * 3600000);
      const h = d.getHours(); if (h < 9) continue;
      const s = slotOf(d);
      if (slotOk(s) && !offDay(ymd(d))) return s;
    }
    return SLOTS[0];
  }
  const viewSlot = () => VIEW.slot || (nowOk() ? curSlot() : nextOkSlot());
  const isNowView = () => !VIEW.slot && nowOk();
  const SORTS = [['near', '近い順'], ['long', '長く訪ねていない順'], ['young', '若い世代が多い順']];
  const SORT_NOTE = {
    near: '起点から、いちばん近い家までの距離で並べています',
    long: 'だれかが最後に訪ねてから、長くたっている順に並べています',
    young: '若い世代は、区域の統計からの目安です（家ごとの数字ではありません）'
  };
  const simpleSorts = () => SORTS.filter(s => s[0] === 'near' || s[0] === 'long');
  function sortKey() {
    const ok = (isS() ? simpleSorts() : SORTS).map(s => s[0]), v = lsGet(sortKeyOf());
    if (ok.includes(v)) return v;
    return orgPos() ? 'near' : 'long';
  }
  const cmpN = (a, b) => (a === b ? 0 : a - b);
  const dOf = c => (c.dist == null ? Infinity : c.dist);
  function sortList(list, key) {
    const near = (a, b) => cmpN(dOf(a), dOf(b));
    const f = {
      near,
      long: (a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) || near(a, b),
      young: (a, b) => cmpN(youngOf(b.t), youngOf(a.t)) || near(a, b)
    }[key] || near;
    // 雨の日は集合住宅を先に・区域係が重点にした時間帯の区域を先に。そのあとで、えらんだ並べ方
    return list.slice().sort((a, b) => (a.rain ? cmpN(a.rank, b.rank) : 0) || cmpN(b.focus ? 1 : 0, a.focus ? 1 : 0) || f(a, b) || cmpN(a.i, b.i));
  }
  function getList(slot) {
    const pos = orgPos(), rain = rainy();
    const sig = [slot, pos ? pos[0].toFixed(5) + ',' + pos[1].toFixed(5) : '', rain ? 1 : 0].join('|');
    return memo('kgl|' + sig + '|' + vl() + '|' + (D().holds || []).length, () => buildClusters(afterItems(slot), pos, rain));
  }

  /* ---------- 5つの欄 → 3つの欄（近さ・前回・若い世代）。欄を押しても並べかえる ---------- */
  const youngInfo = () => memo('kgyg|' + D().territories.length + '|' + vl(), () => {
    if (!(typeof AGE_ON !== 'undefined' && AGE_ON && typeof ageMap === 'function' && ageMap())) return null;
    const m = new Map(), arr = [];
    eligible().forEach(t => { try { const y = youngShare(t); if (y && y.pct != null) { m.set(t.id, y.pct); arr.push(y.pct); } } catch (e) { /* とばす */ } });
    arr.sort((a, b) => b - a);
    return { m, thr: arr.length ? arr[Math.max(0, Math.ceil(arr.length / 3) - 1)] : null };   // 市内で上から3分の1が「多い」
  });
  const youngOf = t => { const y = youngInfo(); if (!y || !y.m.has(t.id)) return 0; return y.thr > 0 && y.m.get(t.id) >= y.thr ? 2 : 1; };   // 2 多い・1 ふつう・0 ―
  const COLS = [
    ['near', '近さ', SVG('<path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>')],
    ['long', '前に訪ねた', SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')],
    ['young', '若い世代', SVG('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c0-3.2 2.5-5 5.5-5s5.5 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.2"/><path d="M16.5 14.2c2.4 0 4 1.5 4 4.3"/>')]
  ];
  function cellVals(c) {
    const d = c.last && c.last !== '9999' ? Math.max(0, daysSince(c.last)) : null;
    return {
      near: c.dist == null ? '―' : fmtDist(c.dist),
      long: d == null ? '―' : d === 0 ? '今日' : `${d}日前`,
      young: ['―', 'ふつう', '多'][youngOf(c.t)]
    };
  }
  /* 理由（1行）。押すと「区域のようす」 */
  function reasonFor(c, slot) {
    if (c.rain && c.rank < 2) return `雨の日なので、集合住宅の部屋です${c.rank === 0 ? '（エレベーターあり）' : ''}`;
    if (c.focus) return `${slotShort(slot)}は、区域係が重点にしている時間帯です`;
    if (c.dist != null && c.dist <= num(D().settings.recoDist, 500)) {
      const mn = Math.max(1, Math.round(c.dist / 67));
      return `${orgWord()}から約${fmtDist(c.dist)}。歩いて約${mn}分です`;
    }
    return awayRule().nr ? `${slotShort(slot)}に、まだ訪ねていない家です` : 'まだ会えていない家です';
  }

  /* ---------- 画面 ---------- */
  const evRow = (e, withDate) => `<div class="kgev"><div><b>${e.time ? `<span>${esc(e.time)}</span>　` : ''}${esc(e.title)}</b>${withDate ? `<small>${fmtYmd(e.date)}</small>` : ''}</div>${evBtn(e.id)}</div>`;
  const oldPlans = future => { // 前の形の予定（区域カード・留守宅カードなど。押さえのない予定）
    const today = ymd(new Date());
    return myData().events.filter(e => e.tid && !e.hold && (future ? e.date > today : e.date === today)).sort((a, b) => ((a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1));
  };
  // 日付と時間帯は、べつの文字にする（スペイン語の辞書で、それぞれ訳せるように）
  const holdWhen = h => (h.kind !== 'plan' ? '<span>今日の終わりまで</span>'
    : `<span>${h.date === ymd(new Date()) ? '今日' : esc(fmtYmd(h.date))}</span>・<span>${esc(slotShort(h.slot || curSlot()))}</span>`);
  const holdRow = h => `<div class="kgev"><div><b>${esc(holdTitle(h))}</b><small>${holdWhen(h)}</small></div>
    <div class="kgevb"><button type="button" class="btn small primary" data-kghmap="${esc(h.id)}">地図をひらく</button><button type="button" class="btn small" data-kghend="${esc(h.id)}">やめる</button></div></div>`;
  function paintMine() {
    const top = $('#kgMine'), bot = $('#kgPlans'); if (!top && !bot) return;
    const today = ymd(new Date()), lives = myLive().sort((a, b) => ((a.date || '') + (a.slot || '') < (b.date || '') + (b.slot || '') ? -1 : 1));
    const nowH = lives.filter(h => h.kind !== 'plan' || h.date === today), futH = lives.filter(h => h.kind === 'plan' && h.date > today);
    const lost = myLost().map(h => { const t = terrById(h.terrId); return `<div class="notice warn kglost"><b>区域${esc(t ? t.no : '-')}は今、区域カードで回っています。</b>予定に入れた家は外れました（おすすめから、ほかの家をえらべます）。
      <div class="row"><button type="button" class="btn small" data-kglostok="${esc(h.id)}">わかりました</button></div></div>`; }).join('');
    const oldT = oldPlans(false);
    if (top) top.innerHTML = lost + (nowH.length || oldT.length ? `<h2 class="sec">今日の予定</h2>${nowH.map(holdRow).join('')}${oldT.map(e => evRow(e, false)).join('')}` : '');
    const oldF = isS() ? [] : oldPlans(true).slice(0, 6);
    if (bot) bot.innerHTML = futH.length || oldF.length ? `<h2 class="sec">あなたの予定</h2>${futH.map(holdRow).join('')}${oldF.map(e => evRow(e, true)).join('')}
      ${futH.length ? '<p class="hint">予定の日の終わりまで、その家をほかの人のおすすめに出しません。使わなかったときは、そのあと、またおすすめに出ます。</p>' : ''}` : '';
  }
  function paintWhen() {
    const el = $('#kgWhen'); if (!el) return;
    const now = new Date(), slot = viewSlot(), nv = isNowView();
    const note = offToday() ? '今日は、区域係が訪問を控える日にしています。'
      : !slotOk(curSlot()) ? '夜（19時〜）は、おすすめを出していません（区域係の決め）。' : '';
    const head = nv ? `今は${DOW[now.getDay()]}の${bandOf(now)}です` : `${slotShort(slot)}に訪ねる家`;
    if (isS()) { el.innerHTML = `<p class="kgstat">${esc(head)}</p>${note ? `<p class="kgsm">${note}${slotShort(slot)}の予定に入れられます。</p>` : ''}`; return; }
    el.innerHTML = `<p class="kgstat">${esc(head)}</p>
      <div class="seg kgwhen" role="group" aria-label="いつ訪ねるか"><button type="button" data-kgwhen="now" aria-pressed="${nv}"${nowOk() ? '' : ' disabled'}>今</button><button type="button" data-kgwhen="pick" aria-pressed="${!nv}">${nv ? 'ほかの時間帯' : esc(slotShort(slot))} ▾</button></div>
      ${note ? `<p class="kgsm">${note}ほかの時間帯の予定に入れられます。</p>` : ''}`;
  }
  function paintSorts() {
    const el = $('#kgSorts'); if (!el) return;
    const simple = isS(), sk = sortKey();
    el.innerHTML = `<div class="kgsorts" role="group" aria-label="並べかえ">${(simple ? simpleSorts() : SORTS).map(([k, l]) =>
      `<button type="button" class="kgsort" data-kgs="${k}" aria-pressed="${sk === k}">${l}</button>`).join('')}</div>` +
      (simple ? '' : `<p class="kgsm">${SORT_NOTE[sk]}</p>`);
  }
  function paintOrg() {
    const el = $('#kgOrg'); if (!el) return;
    orgLoad();
    const loc = !orgPos() && (isS() || ORG.type === 'here') ? '<div class="row"><button type="button" class="btn small" data-kgloc>現在地を使う</button></div>' : '';
    el.innerHTML = (isS() ? '<p class="kgsm">今いる場所から探します</p>' : `<button type="button" class="kgorg" data-kgorg>距離は：${orgLabel()}</button>`) + loc;
  }
  function cardHtml(c, i, simple, sk, slot, nv) {
    const v = cellVals(c);
    const cols = (simple ? COLS.filter(x => x[0] !== 'young') : COLS).map(([k, lab, ic]) =>
      `<button type="button" class="kgcol${sk === k ? ' on' : ''}" data-kgs="${k}" aria-pressed="${sk === k}">${ic}<small>${lab}</small><b>${esc(v[k])}</b></button>`).join('');
    c.reason = reasonFor(c, slot); c.slot = slot; c.now = nv; c.col = slotCol(slot); c.bi = slotBand(slot);
    c.title = `区域${c.t.no}の家 ${c.n}軒`;
    const badges = (c.focus ? '<span class="kgbadge">区域係のおすすめ</span>' : '') + (c.rain && c.rank === 0 ? '<span class="kgbadge">エレベーターあり</span>' : c.rain && c.rank === 1 ? '<span class="kgbadge">集合住宅</span>' : '');
    let acts;
    if (simple) {
      acts = nv ? `<button type="button" class="btn primary block" data-kggo="${i}">今行く</button><button type="button" class="btn small kgplan" data-kgplan="${i}">予定に入れる</button>`
        : `<button type="button" class="btn primary block" data-kgplan="${i}">予定に入れる</button>`;
    } else {
      acts = nv ? `<button type="button" class="btn small primary" data-kggo="${i}">今行く</button><button type="button" class="btn small" data-kgplan="${i}">予定に入れる</button>`
        : `<button type="button" class="btn small primary" data-kgplan="${i}">予定に入れる</button><button type="button" class="btn small" data-kgview="${i}">地図で見る</button>`;
    }
    return `<article class="kgc"><p class="kgct">${esc(c.title)}<span class="kgmin">約${c.mins}分</span>${badges}</p>
      <div class="kgcols${simple ? ' two' : ' three'}" role="group" aria-label="並べかえる欄">${cols}</div>
      <button type="button" class="kgwhy" data-kginfo="${i}">${esc(c.reason)}</button>
      <div class="actions">${acts}</div></article>`;
  }
  function paintList() {
    const el = $('#kgList'); if (!el) return;
    const simple = isS(), sk = sortKey(), slot = viewSlot(), nv = isNowView();
    const list = VIEW.list; if (!list) return;
    VIEW.order = sortList(list, sk);
    const show = VIEW.order.slice(0, VIEW.shown);
    let h = '';
    if (show.some(c => c.rain && c.rank < 2)) h += '<p class="notice rainnote"><b>雨のため、集合住宅の部屋を先に出しています</b>（エレベーターありが先）。<small>天気：Open-Meteo</small></p>';
    h += show.map((c, i) => cardHtml(c, i, simple, sk, slot, nv)).join('');
    if (!show.length) {
      h = !D().territories.some(t => { const r = recoState(t); return r && r.open; })
        ? '<div class="empty">今出せるおすすめはありません。<br>区域が完了すると、まだ会えていない家がここに出ます。</div>'
        : `<div class="empty">${esc(slotShort(slot))}に訪ねられる家は、今はありません。${simple ? '' : '<br>「ほかの時間帯」をえらぶと、出ることがあります。'}</div>`;
    }
    if (VIEW.order.length > show.length) h += `<button type="button" class="btn block" data-kgmore>もっと見る</button>`;
    el.innerHTML = h;
  }
  function fill(tok) {
    if (tok !== TOK || !recoTabOn()) return;
    const simple = isS();
    try { VIEW.list = getList(viewSlot()); } catch (e) { console.error(e); VIEW.list = []; }
    paintOrg(); paintSorts(); paintList(); paintMine();
    const rv = $('#kgRev');
    if (rv && revOn()) setTimeout(() => { if (tok !== TOK) return; try { rv.innerHTML = lookSection(simple); } catch (e) { console.error(e); } }, 0);
  }
  window.renderRecoView = function () {
    const box = $('#recoPane'); if (!box || $('#view-reco').hidden) return;
    if (!recoTabOn()) { box.innerHTML = '<div class="empty">今は、おすすめを出さない設定です。</div>'; return; }
    orgLoad();
    try { tidyHolds(); } catch (e) { console.error(e); }
    const simple = isS(), tok = ++TOK;
    VIEW.shown = simple ? 3 : 10;
    box.innerHTML = `<div class="kgbody${simple ? ' simple' : ''}">
      <div id="kgMine"></div>
      <h2 class="sec">おすすめ</h2>
      ${simple ? '' : '<p class="kgsm">回り終えた区域で、まだ会えていない家を、近くの数軒ずつ出しています。カードを受け取らなくても回れます。</p>'}
      <div id="kgWhen"></div><div id="kgOrg"></div>
      <div id="kgSorts"></div>
      <div id="kgList"><p class="muted">さがしています…</p></div>
      <div id="kgPlans"></div><div id="kgRev"></div></div>`;
    paintWhen(); paintSorts(); paintMine();
    setTimeout(() => fill(tok), 0);                                   // 枠を先に出し、一覧はそのあとで作る
    try { autoLocate(); } catch (e) { /* 現在地の自動取得だけの話 */ }
  };
  /* 位置情報をすでに許可しているスマホでは、だまって現在地を取る */
  let locTried = false;
  function autoLocate() {
    if (locTried || myPos) return;
    locTried = true;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(p => {
          if (p.state === 'granted') locate(() => { if (currentView === 'reco') renderRecoView(); });
        }).catch(() => {});
      }
    } catch (e) { /* 何もしない */ }
  }
  function setSort(k) {
    lsSet(sortKeyOf(), k);
    VIEW.shown = isS() ? 3 : 10;
    paintSorts(); paintList();                                        // 作った一覧を並べ直すだけ
    const b = document.querySelector('#kgSorts [data-kgs="' + k + '"]'); if (b) b.focus({ preventScroll: true });
  }
  /* いつ訪ねるか（ほかの時間帯をえらぶ）。えらんだ時間帯は、この画面を開いているあいだだけ */
  function openWhen() {
    const cur = viewSlot(), bands = SLB.filter((b, i) => i < 4 || nightOk());
    const cell = s => `<button type="button" class="choice${s === cur ? ' on' : ''}" data-kgslot="${esc(s)}" aria-pressed="${s === cur}">${esc(slotShort(s).split('の')[1])}<small>${BAND_HINT[s.split('・')[1]] || ''}</small></button>`;
    setSheet(headHtml(null, 'いつ訪ねますか', 'その時間帯に、まだ訪ねていない家を出します') +
      ['平日', '土日'].map(dt => `<p class="q">${dtName(dt)}</p><div class="kgday kgslots">${bands.map(b => cell(dt + '・' + b)).join('')}</div>`).join('') +
      (nowOk() ? '<button type="button" class="btn block" data-kgslot="">今にもどす</button>' : '') +
      '<p class="hint">家ごとに、いつ留守だったかは出しません。えらんだ時間帯に、まだ訪ねていない家だけを出します。</p><button class="btn block" data-close>閉じる</button>');
    $$('[data-kgslot]', $('#sheet')).forEach(b => b.onclick = () => {
      const s = b.dataset.kgslot;
      VIEW.slot = s && !(s === curSlot() && nowOk()) ? s : null;
      closeSheet(); renderRecoView();
    });
  }

  /* 距離の起点の切りかえ */
  let kgPicking = false;
  function openOrigin() {
    orgLoad();
    const hall = hallPos(), cur = ORG.type;
    const opt = (k, label, sub) => `<button type="button" class="choice${cur === k ? ' on' : ''}" data-kgo="${k}" aria-pressed="${cur === k}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
    setSheet(headHtml(null, '距離の起点', 'どこからの近さで、並べるかを決めます') +
      `<div class="kgday" style="grid-template-columns:1fr">${opt('here', '今いる場所', '')}${hall ? opt('hall', '会館', '') : ''}${opt('pick', '地図でえらんだ場所', '何かのついでに回るときに')}${lmOk() ? '<button type="button" class="btn block" data-kglm>目印からえらぶ</button>' : ''}</div>
      ${ORG.pick ? '<button type="button" class="btn block" data-kgrepick>地図で場所をえらび直す</button>' : ''}
      <p class="hint">えらんだ場所は、このスマホの中だけに置きます。</p>
      <button class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    $$('[data-kgo]', S).forEach(b => b.onclick = () => {
      const k = b.dataset.kgo;
      if (k === 'pick' && !ORG.pick) { startPick(); return; }
      ORG.type = k; orgSave(); closeSheet();
      if (k === 'here' && !myPos) locate(() => { renderRecoView(); }); else renderRecoView();
    });
    const rp = $('[data-kgrepick]', S); if (rp) rp.onclick = startPick;
    const lb = $('[data-kglm]', S);   // 会館・学校などの目印を起点にする（chizu.js。えらんだ場所は「地図でえらんだ場所」と同じく、このスマホの中だけ）
    if (lb) lb.onclick = () => window.KZ.pickLandmark(it => {
      ORG.type = 'pick'; ORG.pick = [it.lat, it.lng]; orgSave();
      renderRecoView(); toast('「' + it.name + '」を起点にしました');
    });
  }
  const lmOk = () => !isS() && !!(window.KZ && window.KZ.pickLandmark && window.KZ.landmarks && window.KZ.landmarks().length);
  function startPick() {
    closeSheet(); kgPicking = true; showView('map');
    pickPlace = ll => {
      kgPicking = false;
      ORG.type = 'pick'; ORG.pick = [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6]; orgSave();
      showView('reco'); toast('場所をえらびました');
    };
    toast('距離の起点にする場所を、地図でタップしてください');
  }

  /* ---------- 今行く／予定に入れる／地図で見る ---------- */
  function goNow(c) {
    const now = new Date().toISOString();
    const prev = myLive().filter(h => h.kind !== 'plan');
    const h = newHold(c, 'now');
    commitIn([], `区域${c.t.no}の家 ${c.n}軒を、今日の終わりまで、あなたの予定にしました`, () => { prev.forEach(p => { p.endedAt = now; }); D().holds.push(h); },
      () => { if (KF && KF.hold === h.id) KF.hold = null; }); // 取り消したときは、地図は「見るだけ」にもどる
    markHere(h.id);
    openHoldMap(h);
  }
  const goPick = c => (c && c.kind === 'after' ? goNow(c) : null);
  function openPlanAfter(c) {
    const slot = c.slot || viewSlot(), [dt, band] = slot.split('・'), bi = Math.max(0, SLB.indexOf(band));
    if (myPlans().length >= osaeMaxN()) {
      setSheet(headHtml(null, '予定に入れる', esc(c.title)) + `<div class="notice warn">予定は${osaeMaxN()}つまで入れられます。「あなたの予定」で使わない予定を「やめる」と、入れられます。</div><button class="btn block" data-close>閉じる</button>`);
      return;
    }
    const t = c.t, rs = recoState(t), today = ymd(new Date());
    let lastDay = addDays(today, osaeDaysN());
    if (rs && rs.end) { const e = ymd(new Date(rs.end - 1)); if (e < lastDay) lastDay = e; }
    const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= today && s <= lastDay && dayTypeOf(parseYmd(s)) === dt && !offDay(s) && (s !== today || new Date().getHours() < BEND[bi]);
    const days = [];
    for (let i = 0; i <= 15 && days.length < 4; i++) { const s = addDays(today, i); if (okDay(s)) days.push(s); }
    if (!days.length) {
      setSheet(headHtml(null, '予定に入れる', esc(c.title)) + `<div class="notice warn">${fmtYmd(lastDay)}までに、${esc(slotShort(slot))}の日がありません。ほかの時間帯をえらんでください。</div><button class="btn block" data-close>閉じる</button>`);
      return;
    }
    const st = { date: days[0] };
    const label = s => (s === today ? '今日' : s === addDays(today, 1) ? '明日' : DOW[parseYmd(s).getDay()]);
    const paint = () => {
      setSheet(headHtml(null, '予定に入れる', esc(c.title)) + `
        <p class="q">時間帯</p><p><b>${esc(slotShort(slot))}</b>（${BAND_HINT[band] || ''}）</p>
        <p class="q">いつにしますか</p>
        <div class="kgday">${days.map(v => `<button type="button" class="choice${st.date === v ? ' on' : ''}" data-kgd="${v}" aria-pressed="${st.date === v}">${label(v)}<small>${fmtYmd(v)}</small></button>`).join('')}</div>
        <label class="field"><span>日付をえらぶ（${fmtYmd(lastDay)}まで）</span><input type="date" id="kgDate" min="${today}" max="${lastDay}" value="${esc(st.date)}"></label>
        <p class="hint">予定の日の終わりまで、この家をほかの人のおすすめに出しません。使わなかったときは、そのあと、またおすすめに出ます。</p>
        <button class="btn primary block" id="kgSave">この日に入れる</button>
        <button class="btn block" data-close>やめる</button>`);
      const S = $('#sheet');
      $$('[data-kgd]', S).forEach(b => b.onclick = () => { st.date = b.dataset.kgd; sheetKeep = true; paint(); });
      $('#kgDate').onchange = e => {
        const v = e.target.value;
        if (!okDay(v)) { toast(`${slotShort(slot)}に回れる日（${dtName(dt)}・${fmtYmd(lastDay)}まで）をえらんでください`); e.target.value = st.date; return; }
        st.date = v; sheetKeep = true; paint();
      };
      $('#kgSave').onclick = () => {
        if (!okDay(st.date)) { toast('この日は入れられません'); return; }
        if (myPlans().length >= osaeMaxN()) { toast(`予定は${osaeMaxN()}つまでです`); return; }
        const h = newHold(c, 'plan', st.date, slot);
        const title = `区域${t.no}の家 ${c.n}軒（${slotShort(slot)}）`;
        commitIn([], `${fmtYmd(st.date)}の予定に入れました（${title}）`, () => { D().holds.push(h); },
          () => { const o2 = myData(); o2.events = o2.events.filter(e => e.hold !== h.id); mySave(o2); renderHome(); }); // 取り消したときは、カレンダーの予定も消す
        markHere(h.id);
        const o = myData();
        o.events.push({ id: uid(), date: st.date, time: BT[bi], title, tid: t.id, rk: 'after', band, hold: h.id });
        mySave(o);
        renderHome();
        if (currentView === 'reco') renderRecoView();
        setSheet(headHtml(null, '予定に入れました', esc(title)) + `
          <p class="okmsg"><b>${fmtYmd(st.date)}　${BT[bi]}ごろ</b>の予定に入りました。おすすめの「あなたの予定」と、ホームの「これからの予定」に出ます。</p>
          <p class="hint">その日になったら「地図をひらく」を押すと、地図に区域の線と、回る家の番号が出ます。</p>
          <a class="btn block" href="${gcalUrl(title, st.date, BT[bi], '', '', '')}" target="_blank" rel="noopener">Googleカレンダーに入れる</a>
          <button class="btn primary block" data-close>閉じる</button>`);
      };
    };
    paint();
  }

  /* ---------- 地図：区域の線を枠にして、回る家に番号（①②③） ----------
     KF：{ tid, keys（家id|部屋の Set）, nums（家id → 番号）, hold（押さえの id。見るだけのときは null）, since（この時刻のあとの記録で緑のチェック） } */
  let KF = null;
  function openKF(o) {
    clearTarget(); followMap = false; focusCard = null; roundTerr = null; curTerr = null; firstMapShow = false; barHidden = false;
    const nums = new Map(); let n = 0;
    o.keys.forEach(k => { const hid = keyHid(k); if (!nums.has(hid)) nums.set(hid, ++n); });
    KF = { tid: o.tid, keys: new Set(o.keys), nums, hold: o.hold || null, since: o.since || new Date().toISOString() };
    o.keys.forEach(k => recoMark(keyHid(k), keyUnit(k), 'after'));
    showView('map');
    setTimeout(() => { map.invalidateSize(); syncTerrJump(); renderTerrs(); renderHouses(); if (KF) fitTerr(KF.tid); }, 80);
  }
  function openHoldMap(h) {
    if (!h) return;
    const keys = (h.keys || []).filter(k => !D().dnc[k] && houseById(keyHid(k)));
    openKF({ tid: h.terrId, keys, hold: h.id, since: h.at });
    if (h.kind === 'plan' && h.slot && h.slot !== curSlot()) setTimeout(() => toast(`今は${slotShort(curSlot())}です（予定は${slotShort(h.slot)}）`), 600);
  }
  function openHoldById(id) {
    const h = holdById(id);
    if (h && holdLive(h)) { openHoldMap(h); return; }
    if (h && !h.endedAt && Date.parse(h.until) > Date.now() && holdTaken(h)) {
      const t = terrById(h.terrId); toast(`区域${t ? t.no : '-'}は今、区域カードで回っています。予定の家は外れました`);
    } else toast('この予定の家は、もう押さえていません。おすすめから、もう一度えらべます');
    showView('reco');
  }
  function paintKFBar() {
    const bar = $('#cardBar'); if (!bar || !KF) return;
    $('#legendBtn').classList.toggle('hasbar', barHidden);
    if (barHidden) { bar.hidden = true; return; }
    const t = terrById(KF.tid), keys = [...KF.keys], done = keys.filter(k => visitedSince(k, KF.since)).length;
    const h = KF.hold ? holdById(KF.hold) : null, live = !!h && holdLive(h);
    const when = !h ? '見るだけです（まだ予定に入れていません）' : !live ? 'この予定の押さえは、もう終わっています'
      : h.kind === 'plan' ? `${fmtYmd(h.date)}の予定です（その日の終わりまで、ほかの人のおすすめに出しません）` : '今日の終わりまで、あなたの予定です（ほかの人のおすすめに出しません）';
    const key = (cls, mark, label) => `<span><i class="pin mini st-plain${cls}">${mark}</i>${label}</span>`;
    bar.hidden = false; bar.classList.remove('mini');
    bar.innerHTML = `<p><b>おすすめの家　区域${esc(t ? t.no : '-')}</b>　${keys.length}軒・番号の順に回れます</p>
      <p class="keys">${key(' hl', '', `まだの家 ${keys.length - done}`)}${key(' done', '<u>✓</u>', `訪ねた家 ${done}`)}</p>
      <p class="muted">${esc(when)}</p>
      ${keys.length && done === keys.length ? '<p class="okmsg"><b>すべて訪ねました。</b>おつかれさまでした。</p>' : ''}
      <div class="row"><button class="btn small" id="kfClose">表示を戻す</button>${live ? '<button class="btn small" id="kfEnd">この予定をやめる</button>' : ''}${!h && $('#view-reco') ? '<button class="btn small" id="kfBack">おすすめにもどる</button>' : ''}</div>`;
    $('#kfClose').onclick = () => { KF = null; renderTerrs(); renderHouses(); syncTerrJump(); };
    const e = $('#kfEnd'); if (e) e.onclick = () => endHold(h.id);
    const bk = $('#kfBack'); if (bk) bk.onclick = () => { KF = null; showView('reco'); };
  }
  // 地図の関数を包む（KF があるときだけ、ちがう動きにする）
  const wrapFn = (name, fn) => { const f = window[name]; if (typeof f === 'function') window[name] = function () { return fn.call(this, f, arguments); }; };
  wrapFn('selTerrId', (f, a) => (KF && terrById(KF.tid) ? KF.tid : f.apply(null, a)));
  wrapFn('focusFn', (f, a) => {
    if (!KF) return f.apply(null, a);
    roundNums = KF.nums;
    const since = KF.since, ks = KF.keys;
    return k => (ks.has(k) ? (visitedSince(k, since) ? 'done' : 'hl') : (D().dnc[k] ? 'refuse' : 'dim'));
  });
  wrapFn('openTerrIds', (f, a) => { const s = f.apply(null, a); if (KF) s.add(KF.tid); return s; });
  wrapFn('myPlaces', (f, a) => {
    const r = f.apply(null, a);
    try { myHeldKeys().forEach(k => r.keys.add(k)); if (KF) KF.keys.forEach(k => r.keys.add(k)); } catch (e) { console.error(e); }
    return r;
  });
  wrapFn('needTerrConfirm', (f, a) => {
    const keys = a[1];
    if (keys && keys.length) { const mine = myHeldKeys(); if (keys.every(k => mine.has(k) || (KF && KF.keys.has(k)))) return false; }
    return f.apply(null, a);
  });
  wrapFn('renderCardBar', (f, a) => { const r = f.apply(null, a); try { if (KF) paintKFBar(); } catch (e) { console.error(e); } return r; });
  wrapFn('syncTerrJump', (f, a) => {
    const r = f.apply(null, a);
    try {
      const sel = $('#terrJump'); if (!sel) return r;
      const old = sel.querySelector('option[value="__kf"]'); if (old) old.remove();
      if (KF) { const t = terrById(KF.tid); sel.insertAdjacentHTML('afterbegin', `<option value="__kf">おすすめの家　区域 ${esc(t ? t.no : '-')}</option>`); sel.value = '__kf'; }
    } catch (e) { console.error(e); }
    return r;
  });
  wrapFn('selectTerr', (f, a) => {
    const id = a[0], o = a[1] || {};
    if (KF) {
      if (!id || id === KF.tid || id === '__kf') { clearTarget(); if (id === '__kf' || o.fit) fitTerr(KF.tid); syncTerrJump(); return; } // 同じ区域・区域をえらばないときは、おすすめの表示のまま
      KF = null;
    }
    return f.apply(null, a);
  });
  ['goTo', 'openTerr', 'openAwayCard', 'openFollowMap'].forEach(n => wrapFn(n, (f, a) => { KF = null; return f.apply(null, a); }));
  wrapFn('recoSrc', (f, a) => f.apply(null, a) || (myHeldKeys().has(K(a[0], a[1] || '')) ? 'reco:after' : '')); // 押さえた家の記録は、おすすめから訪ねた記録として数える
  // 「?」：おすすめの家を見ていて下の案内を隠しているときは、まず案内をもう一度出す
  document.addEventListener('click', e => {
    if (!KF || !barHidden || !e.target.closest || !e.target.closest('#legendBtn')) return;
    e.preventDefault(); e.stopImmediatePropagation(); barHidden = false; renderCardBar();
  }, true);

  /* ---------- 押したときの動き ---------- */
  function setPref(what, v, btn) {
    lsSet(pk(what), v);
    if (btn && btn.parentNode) btn.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    if (what === 'tab') {
      updateTabs();
      if (!recoTabOn() && currentView === 'reco') showView('home');
      toast(v === 'on' ? 'おすすめのタブを出すようにしました' : 'おすすめのタブを出さないようにしました');
    } else {
      if (currentView === 'reco') renderRecoView();
      toast(v === 'on' ? 'おすすめにふり返りを出すようにしました' : 'おすすめにふり返りを出さないようにしました');
    }
  }
  document.addEventListener('click', e => {
    const q = s => e.target.closest && e.target.closest(s);
    let x;
    if ((x = q('[data-kgopen]'))) { e.preventDefault(); e.stopPropagation(); openEvent(x.dataset.kgopen); return; }
    if ((x = q('[data-kgui]'))) { e.preventDefault(); e.stopPropagation(); if (!x.disabled) setPref(x.dataset.kgui, x.dataset.v, x); return; }
    if (!q('#view-reco')) return;
    const it = (el, k) => VIEW.order[Number(el.dataset[k])];
    if ((x = q('[data-kgs]'))) { e.stopPropagation(); setSort(x.dataset.kgs); }
    else if (q('[data-kgorg]')) openOrigin();
    else if ((x = q('[data-kgwhen]'))) { if (x.dataset.kgwhen === 'pick') openWhen(); else if (VIEW.slot) { VIEW.slot = null; renderRecoView(); } }
    else if (q('[data-kgmore]')) { VIEW.shown += isS() ? 3 : 10; paintList(); }
    else if (q('[data-kgloc]')) { locate(() => { renderRecoView(); }); }
    else if ((x = q('[data-kggo]'))) { const c = it(x, 'kggo'); if (c) goNow(c); }
    else if ((x = q('[data-kgplan]'))) { const c = it(x, 'kgplan'); if (c) openPlanAfter(c); }
    else if ((x = q('[data-kgview]'))) { const c = it(x, 'kgview'); if (c) openKF({ tid: c.t.id, keys: c.keys }); }
    else if ((x = q('[data-kginfo]'))) { const c = it(x, 'kginfo'); if (c) window.openTerrInfo(c.t.id, c.col, c.bi, c); }
    else if ((x = q('[data-kghmap]'))) openHoldById(x.dataset.kghmap);
    else if ((x = q('[data-kghend]'))) { const h = holdById(x.dataset.kghend); if (h) ask(`${holdTitle(h)}の予定をやめますか？\nほかの人のおすすめにも出るようになります。`, { ok: 'やめる', danger: false }).then(ok => { if (ok) endHold(h.id); }); }
    else if ((x = q('[data-kglostok]'))) { const h = holdById(x.dataset.kglostok); if (h && !h.endedAt) { h.endedAt = new Date().toISOString(); Store.save(true); paintMine(); } }
  }, true);

  /* =========================================================
     ほかの画面のおすすめを消す／タブの出しかた（kantan.js の関数も「包む」形）
     ========================================================= */
  // ホーム：毎日のひと言の「今のおすすめ」の欄
  const _showHello = window.showHello;
  window.showHello = function () {
    const r = _showHello.apply(this, arguments);
    try { const el = document.getElementById('hello'); if (el) { const a = el.querySelector('.hsec'), b = el.querySelector('#helloReco'); if (a) a.remove(); if (b) b.remove(); } } catch (e) { console.error(e); }
    return r;
  };
  // ホーム：「今日やること」の「今がチャンス・留守宅カード」。おすすめは、おすすめタブだけに出す
  window.chanceCard = function () { return null; };
  // 下のタブ
  const _updateTabs = window.updateTabs;
  window.updateTabs = function () {
    const r = _updateTabs.apply(this, arguments);
    try {
      const rec = document.getElementById('tabReco');
      if (rec && Store.data) {
        rec.hidden = !recoTabOn();
        const tabs = document.getElementById('tabs');
        if (tabs) {
          const n = [...tabs.children].filter(b => b.tagName === 'BUTTON' && !b.hidden).length;
          tabs.style.setProperty('--tabs', n); tabs.classList.toggle('many', n >= 6);
        }
      }
    } catch (e) { console.error(e); }
    return r;
  };
  const _showView = window.showView;
  window.showView = function (name) {
    if (kgPicking && name !== 'map' && name !== 'reco') { kgPicking = false; pickPlace = null; }
    if (name === 'reco') {
      if (!recoTabOn()) name = 'home';
      else if (isSimple()) {                                          // kantan.js は簡単モードで 'reco' をホームへ戻すので、このあいだだけ詳しいモードに見せる
        tmpSimple = true; const m = UI.mode; UI.mode = 'detail';
        try { return _showView.call(this, name); } finally { UI.mode = m; tmpSimple = null; }
      }
    }
    return _showView.call(this, name);
  };
  const _applyUi = window.applyUi;
  window.applyUi = function () {
    const was = !!Store.data && currentView === 'reco';
    const r = _applyUi.apply(this, arguments);
    try { if (was && currentView !== 'reco' && recoTabOn()) showView('reco'); } catch (e) { console.error(e); }
    return r;
  };

  /* =========================================================
     歯車の設定（各自）と、日の画面の「地図をひらく」
     ・「おすすめのタブを出す」「おすすめにふり返りを出す」を「使う機能」の中に足す（かんたんモードでも選べる）
     ・係が recoOn=0 のときは押せない
     ========================================================= */
  function prefRows() {
    const seg = (k, cur, dis) => `<div class="seg uiseg" role="group">${[['on', '出す'], ['off', '出さない']].map(([v, l]) =>
      `<button type="button" data-kgui="${k}" data-v="${v}" aria-pressed="${cur === v}"${dis ? ' disabled' : ''}>${l}</button>`).join('')}</div>`;
    if (!recoOn()) {
      return `<div class="featrow"><p><b>おすすめのタブを出す</b><small>区域係が、おすすめを使わない設定にしています</small></p>${seg('tab', 'off', true)}</div>`;
    }
    return `<div class="featrow"><p><b>おすすめのタブを出す</b><small>下のタブに「おすすめ」を出します。回り終えた区域で、まだ会えていない家を、近くの数軒ずつえらべます</small></p>${seg('tab', recoTabOn() ? 'on' : 'off')}</div>
      <div class="featrow"><p><b>おすすめにふり返りを出す</b><small>あなたの記録のふり返りを、おすすめのいちばん下に出します（このスマホの中だけ）</small></p>${seg('rev', revOn() ? 'on' : 'off')}</div>`;
  }
  const _setSheet = window.setSheet;
  window.setSheet = function (html) {
    try {
      if (typeof html === 'string') {
        if (html.indexOf('id="uiReset"') >= 0 && html.indexOf('<h3 class="sub">ホームに出すもの</h3>') >= 0 && Store.data) {
          html = html.replace('<h3 class="sub">ホームに出すもの</h3>', prefRows() + '<h3 class="sub">ホームに出すもの</h3>')
            .replace('その日はじめて開いたときに、ひと言・今日の目標・今の時間帯におすすめの家を出します（まわりをさわると閉じます）', 'その日はじめて開いたときに、ひと言・今日の目標を出します（まわりをさわると閉じます）')
            .replace('今日の集まり・自分の予定・再訪問の約束・区域カード・今がチャンスの留守宅カードを、ホームのいちばん上にまとめます', '今日の集まり・自分の予定・再訪問の約束・区域カードを、ホームのいちばん上にまとめます');
        }
        if (html.indexOf('data-evdel') >= 0) {
          myData().events.filter(e => e.tid).forEach(e => {
            html = html.replace(`<button class="btn small danger" data-evdel="${esc(e.id)}">`, `${evBtn(e.id)}<button class="btn small danger" data-evdel="${esc(e.id)}">`);
          });
        }
      }
    } catch (err) { console.error(err); }
    return _setSheet.call(this, html);
  };

  /* ---------- 「速さを測る」に行を足す（いちばん古いスマホで0.3秒未満が目安） ---------- */
  if (typeof runPerfCheck === 'function') {
    const _perf = window.runPerfCheck;
    window.runPerfCheck = function () {
      _perf.apply(this, arguments);
      try {
        const rows = [];
        const T = (name, fn) => {
          const t0 = performance.now();
          try { MEMO.clear(); fn(); } catch (e) { console.error(e); rows.push([name, -1]); return; }
          rows.push([name, performance.now() - t0]);
        };
        T('おすすめの一覧づくり', () => { const l = buildClusters(afterItems(viewSlot()), orgPos(), rainy()); sortList(l, sortKey()); });
        T('ふり返り', () => { myStats(); });
        const tb = document.querySelector('#sheet table.slots');
        if (!tb) return;
        const mark = ms => (ms < 0 ? '×（エラー）' : ms < 100 ? '◎ 速い' : ms < 300 ? '○ ふつう' : ms < 1000 ? '△ 少し待つ' : '× 重い');
        tb.insertAdjacentHTML('beforeend', rows.map(([n, ms]) => `<tr><th style="text-align:left">${esc(n)}</th><td>${ms < 0 ? '—' : Math.round(ms) + 'ms'}</td><td>${mark(ms)}</td></tr>`).join(''));
      } catch (e) { console.error(e); }
    };
  }

  /* =========================================================
     ネットがないときの地図（国土地理院の淡色地図の画像を、このスマホに残す）
     ・sw.js が「一度見た地図」を残す（区域のまわりだけ）。ここでは次の4つをする
       1. 「今必要な範囲」（自分の区域・今日回る区域・回る範囲・自分の留守宅カード）の地図を、ボタンなしで少しずつ取っておく
       2. 範囲から外れた画像・90日使っていない画像・2,000枚をこえた画像を消す
       3. ネットにつながっていないとき、地図の上に小さな帯を出す
       4. 歯車に「保存した地図」の大きさと「保存した地図を消す」を出す（くわしいモードだけ）
     ・残すのは地図の画像だけ。家や記録は、今のしくみ（IndexedDB）のまま
     ・国土地理院の負担を小さくするため、1枚ずつ0.2秒あけて、必要な範囲（60枚前後）だけを取る。全区域をまとめて取る機能は作らない
     ・画像ごとの「どの範囲で必要か」「最後に使った日」は、このスマホの IndexedDB（kuiki-tiles）に覚える
     ========================================================= */
  const TM = (function () {
    const CACHE = 'kuiki-tiles-v1', DBN = 'kuiki-tiles';
    const ZMIN = 15, ZMAX = 18, PAD_M = 150, REGION_M = 500, RANGE_CAP = 600;
    const MAX_TILES = 2000, MAX_AGE = 90 * 864e5, GAP = 200, FLUSH_MS = 60000, KB_EST = 22; // KB_EST＝1枚あたりの目安
    const urlOf = k => { const a = k.split('/'); return TILE_PALE.replace('{z}', a[0]).replace('{x}', a[1]).replace('{y}', a[2]); };
    const keyOf = u => { const m = /\/xyz\/pale\/(\d+\/\d+\/\d+)\.png/.exec(String(u || '')); return m ? m[1] : null; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const canCache = () => typeof caches !== 'undefined' && typeof indexedDB !== 'undefined';
    let held = false;            // 「保存した地図を消す」のあと、次にネットにつながるまで取り直さない
    let pumping = false, running = false, again = false, lastSig = '', timer = null, bandDismissed = false;
    let queue = [];
    const used = new Map();      // 画面で使った画像 → 時刻（1分に1回まとめて書く）
    let _db = null;

    /* ---------- IndexedDB ---------- */
    const idb = () => _db || (_db = new Promise((res, rej) => {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'k' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { _db = null; rej(r.error); };
    }));
    const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    async function getAll() { const db = await idb(); return reqP(db.transaction('meta').objectStore('meta').getAll()); }
    async function writeMany(puts, dels) {
      if (!puts.length && !dels.length) return;
      const db = await idb(), t = db.transaction('meta', 'readwrite'), s = t.objectStore('meta');
      puts.forEach(m => s.put(m)); dels.forEach(k => s.delete(k));
      return txDone(t);
    }

    /* ---------- 場所の計算 ---------- */
    const padBox = (b, m) => { // [南, 西, 北, 東] にまわり m メートルを足す
      const dLat = m / 111320, dLng = m / (111320 * Math.max(0.2, Math.cos((b[0] + b[2]) / 2 * Math.PI / 180)));
      return [b[0] - dLat, b[1] - dLng, b[2] + dLat, b[3] + dLng];
    };
    const tx = (lng, z) => Math.floor((lng + 180) / 360 * Math.pow(2, z));
    const ty = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); };
    function tilesOf(box) { // 1つの範囲の画像の一覧（600枚をこえるときは、いちばん拡大の画像から減らす）
      for (let zmax = ZMAX; zmax >= ZMIN; zmax--) {
        const out = [];
        for (let z = ZMIN; z <= zmax; z++) {
          const n = Math.pow(2, z) - 1, x0 = Math.max(0, tx(box[1], z)), x1 = Math.min(n, tx(box[3], z)), y0 = Math.max(0, ty(box[2], z)), y1 = Math.min(n, ty(box[0], z));
          for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(z + '/' + x + '/' + y);
        }
        if (out.length <= RANGE_CAP || zmax === ZMIN) return out;
      }
      return [];
    }
    const boxOfPts = pts => {
      let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
      pts.forEach(p => { if (p[0] < s) s = p[0]; if (p[0] > n) n = p[0]; if (p[1] < w) w = p[1]; if (p[1] > e) e = p[1]; });
      return isFinite(s) && isFinite(w) ? [s, w, n, e] : null;
    };

    /* 今必要な範囲：id → [南,西,北,東]（まわり150mを足したもの） */
    function wantedBoxes() {
      const out = new Map();
      if (!Store.data) return out;
      D().territories.forEach(t => {
        if (t.dummy || !okPoly(t.polygon)) return;
        let need = false;
        try { need = myTerr(t) || !!myPart(t); } catch (e) { need = false; }
        if (!need) return;
        const b = boxOfPts(t.polygon); if (b) out.set('t:' + t.id, padBox(b, PAD_M));
      });
      activeCards().forEach(c => { // 自分の留守宅カード・グループで今日回る人に入っている留守宅カード
        if (c.dummy || !(c.by === me().id || isCardHelper(c))) return;
        const pts = (c.keys || []).map(k => houseById(parseKey(k)[0])).filter(Boolean).map(h => [h.lat, h.lng]);
        const b = boxOfPts(pts); if (b) out.set('c:' + c.id, padBox(b, PAD_M));
      });
      liveHolds().forEach(h => { // おすすめで押さえた家（今行く・予定に入れる）
        if (h.by !== me().id) return;
        const pts = (h.keys || []).map(k => houseById(parseKey(k)[0])).filter(Boolean).map(x => [x.lat, x.lng]);
        const b = boxOfPts(pts); if (b) out.set('o:' + h.id, padBox(b, PAD_M));
      });
      return out;
    }
    /* 一度見た地図を残してよい場所：全区域を囲む四角＋500m（sw.js に知らせる） */
    function regionBox() {
      if (!Store.data) return null;
      const pts = [];
      D().territories.forEach(t => { if (!t.dummy && okPoly(t.polygon)) t.polygon.forEach(p => pts.push(p)); });
      const b = boxOfPts(pts);
      return b ? padBox(b, REGION_M) : null;
    }
    function postArea(box) {
      try {
        if (!('serviceWorker' in navigator)) return;
        const msg = { type: 'kuiki-tile-area', box };
        if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(msg);
        navigator.serviceWorker.ready.then(r => { if (r.active) r.active.postMessage(msg); }).catch(() => {});
      } catch (e) { /* 知らせられなくても、地図は見られる */ }
    }

    /* ---------- 取ってよいか ---------- */
    function canFetch() {
      if (held || navigator.onLine === false) return false;
      const c = navigator.connection;
      if (c && (c.type === 'cellular' || c.saveData)) return false; // モバイル通信・データ節約のときは、Wi-Fi になるまで待つ（分からない端末は取る）
      return true;
    }

    /* ---------- 使った日の記録（まとめて書く） ---------- */
    function noteUsed(e) { const k = keyOf(e && e.tile && e.tile.src); if (k) used.set(k, Date.now()); }
    function attach() {
      try {
        if (typeof baseLayers === 'undefined' || !baseLayers) return;
        ['pale', 'paleLow'].forEach(n => { const l = baseLayers[n]; if (l && !l.__kgTM) { l.__kgTM = 1; l.on('tileload', noteUsed); } });
      } catch (e) { /* なにもしない */ }
    }
    async function flush() {
      if (!used.size || !canCache()) return;
      const snap = [...used]; used.clear();
      try {
        const db = await idb(), t = db.transaction('meta', 'readwrite'), s = t.objectStore('meta');
        snap.forEach(([k, u]) => {
          const g = s.get(k);
          g.onsuccess = () => { const m = g.result || { k, r: [], u }; m.u = Math.max(m.u || 0, u); s.put(m); };
        });
        await txDone(t);
      } catch (e) { snap.forEach(([k, u]) => { if (!used.has(k)) used.set(k, u); }); }
    }

    /* ---------- 比べて、取る・消す ---------- */
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    async function reconcile() {
      if (running) { again = true; return; }
      running = true;
      try {
        if (!canCache() || !Store.data) return;
        const want = wantedBoxes(), tid = new Map();
        want.forEach((box, id) => tilesOf(box).forEach(k => { let a = tid.get(k); if (!a) tid.set(k, a = []); a.push(id); }));
        tid.forEach(a => a.sort());
        const cache = await caches.open(CACHE), now = Date.now();
        const metas = await getAll(), mm = new Map(metas.map(m => [m.k, m]));
        const puts = [], dels = [];
        mm.forEach(m => {
          const nr = tid.get(m.k) || [], old = (m.r || []).slice().sort();
          if (same(old, nr)) return;
          if (old.length && !nr.length) { dels.push(m.k); mm.delete(m.k); } // 範囲から外れた（ほかの範囲で使っていない）画像は消す
          else { m.r = nr; puts.push(m); }
        });
        tid.forEach((r, k) => { if (!mm.has(k)) { const m = { k, r, u: now }; mm.set(k, m); puts.push(m); } });
        await writeMany(puts, dels);
        for (const k of dels) await cache.delete(urlOf(k), { ignoreVary: true }).catch(() => {});
        const have = new Set((await cache.keys()).map(r => keyOf(r.url)).filter(Boolean));
        queue = [...tid.keys()].filter(k => !have.has(k) && !(mm.get(k) || {}).miss)
          .sort((a, b) => (+a.split('/')[0]) - (+b.split('/')[0]));
        await sweep(cache);
        pump();
      } catch (e) { console.error(e); }
      finally { running = false; if (again) { again = false; setTimeout(reconcile, 300); } }
    }
    /* 消す決まり：90日使っていない画像／2,000枚をこえた分（長く使っていないものから）。今必要な範囲の画像は消さない */
    async function sweep(cache) {
      try {
        cache = cache || await caches.open(CACHE);
        const now = Date.now(), metas = await getAll(), mm = new Map(metas.map(m => [m.k, m]));
        const present = new Set((await cache.keys()).map(r => keyOf(r.url)).filter(Boolean));
        const puts = [], dels = [], gone = [];
        present.forEach(k => { if (!mm.has(k)) { const m = { k, r: [], u: now }; mm.set(k, m); puts.push(m); } }); // sw.js が残した画像
        mm.forEach((m, k) => {
          const need = !!(m.r && m.r.length);
          if (!present.has(k)) { if (!need && !m.miss) { dels.push(k); mm.delete(k); } return; } // 画像のない記録は片づける
          if (!need && now - (m.u || 0) > MAX_AGE) { dels.push(k); gone.push(k); present.delete(k); mm.delete(k); }
        });
        if (present.size > MAX_TILES) {
          const cand = [...present].map(k => mm.get(k)).filter(m => m && !(m.r && m.r.length)).sort((a, b) => (a.u || 0) - (b.u || 0));
          let over = present.size - MAX_TILES;
          for (const m of cand) { if (over <= 0) break; dels.push(m.k); gone.push(m.k); mm.delete(m.k); over--; }
        }
        await writeMany(puts, dels);
        for (const k of gone) await cache.delete(urlOf(k), { ignoreVary: true }).catch(() => {});
      } catch (e) { console.error(e); }
    }

    /* 1枚ずつ、0.2秒あけて取る。つながらなくなったら止める */
    async function pump() {
      if (pumping || !queue.length) return;
      pumping = true;
      try {
        const cache = await caches.open(CACHE);
        while (queue.length) {
          if (!canFetch()) break;
          const k = queue.shift(), u = urlOf(k);
          if (await cache.match(u, { ignoreVary: true })) continue;
          let res;
          try { res = await fetch(u, { mode: 'cors', credentials: 'omit' }); }
          catch (e) { queue.unshift(k); break; } // 電波が切れた。次につながったときに続きから
          if (res && res.ok && res.type === 'cors') await cache.put(u, res).catch(() => {});
          else if (res && res.status === 404) markMiss(k); // 地図のない場所（海など）。次からは取りに行かない
          await sleep(GAP);
        }
      } catch (e) { console.error(e); }
      finally { pumping = false; if (!queue.length) sweep(); }
    }
    async function markMiss(k) {
      try { const db = await idb(), s = db.transaction('meta', 'readwrite').objectStore('meta'), g = await reqP(s.get(k)); if (g) { g.miss = 1; s.put(g); } } catch (e) { /* なにもしない */ }
    }

    /* ---------- いつ確かめるか ---------- */
    function check(force) {
      attach();
      if (!canCache() || !Store.data) return;
      try {
        const want = wantedBoxes(), rb = regionBox();
        const a = JSON.stringify([...want].map(([id, b]) => [id, b.map(x => Math.round(x * 1e5))])), r = JSON.stringify(rb && rb.map(x => Math.round(x * 1e4)));
        const sig = a + '|' + r;
        if (r !== lastSig.split('|')[1]) postArea(rb);
        if (!force && sig === lastSig && !queue.length) return;
        lastSig = sig;
        reconcile();
      } catch (e) { console.error(e); }
    }
    function later(ms, force) { clearTimeout(timer); timer = setTimeout(() => check(force), ms); }
    window.addEventListener('online', () => { held = false; hideBand(); later(500, true); });
    window.addEventListener('offline', () => { bandDismissed = false; showBand(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else { later(800); showBand(); } });
    window.addEventListener('pagehide', flush);
    try { if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', () => later(800, true)); } catch (e) { /* なにもしない */ }
    setInterval(flush, FLUSH_MS);
    setInterval(() => check(false), 10 * 60000); // 日付が変わって「今日回る人」から外れた、などを拾う
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => postArea(regionBox())); } catch (e) { /* なにもしない */ }

    /* ---------- ネットがないときの帯（地図の画面だけ） ---------- */
    function showBand() {
      try {
        const v = document.getElementById('view-map'); if (!v) return;
        let b = document.getElementById('kgOffBand');
        if (navigator.onLine !== false || bandDismissed || v.hidden) { if (b) b.hidden = true; return; }
        if (!b) {
          b = document.createElement('button'); b.type = 'button'; b.id = 'kgOffBand'; b.setAttribute('role', 'status');
          b.textContent = '電波がないため、保存した地図を表示しています';
          b.addEventListener('click', () => { bandDismissed = true; b.hidden = true; });
          v.appendChild(b);
        }
        b.hidden = false;
      } catch (e) { /* なにもしない */ }
    }
    function hideBand() { const b = document.getElementById('kgOffBand'); if (b) b.hidden = true; bandDismissed = false; }

    /* ---------- 歯車：保存した地図 ---------- */
    async function sizeMB() { // 全部は読まず、最大40枚の平均から目安を出す。保存がなければ null
      if (!canCache()) return null;
      const cache = await caches.open(CACHE), keys = await cache.keys();
      if (!keys.length) return null;
      let sum = 0, n = 0;
      const step = Math.max(1, Math.floor(keys.length / 40));
      for (let i = 0; i < keys.length && n < 40; i += step) {
        const r = await cache.match(keys[i], { ignoreVary: true });
        if (r) { try { sum += (await r.blob()).size; n++; } catch (e) { /* なにもしない */ } }
      }
      const mb = n ? sum / n * keys.length / 1048576 : keys.length * KB_EST / 1024;
      return Math.max(1, Math.round(mb));
    }
    function gearHtml() {
      if (!canCache()) return '';
      return `<h3 class="sub adv">地図の保存</h3><div class="featrow adv" id="kgTileRow"><p><b id="kgTileSize">保存した地図</b><small>区域を回るとき、電波がなくても地図が見えるように、このスマホに残してある地図の画像です。</small></p>
        <div class="row" style="margin-top:8px"><button type="button" class="btn small" id="kgTileClear">保存した地図を消す</button></div>
        <small class="kgsm">消しても、いま必要な区域の地図は、次にネットにつながったときに自動で取り直します。</small></div>`;
    }
    async function fillSize() {
      try {
        const mb = await sizeMB(), el = document.getElementById('kgTileSize'); if (!el) return;
        el.textContent = mb === null ? '保存した地図：まだありません' : '保存した地図：約' + mb + 'MB';
      } catch (e) { /* なにもしない */ }
    }
    async function clearAll() {
      held = true; queue = []; used.clear(); lastSig = '';
      try {
        if (canCache()) {
          await caches.delete(CACHE);
          const db = await idb(), t = db.transaction('meta', 'readwrite'); t.objectStore('meta').clear(); await txDone(t);
        }
      } catch (e) { console.error(e); }
    }
    document.addEventListener('click', async e => {
      const b = e.target.closest && e.target.closest('#kgTileClear'); if (!b) return;
      if (!(await ask('保存した地図を消しますか？消しても、いま必要な区域の地図は、次にネットにつながったときに自動で取り直します。', { danger: true }))) return;
      await clearAll(); toast('保存した地図を消しました');
      const el = document.getElementById('kgTileSize'); if (el) el.textContent = '保存した地図：まだありません';
    });

    return { check, later, attach, showBand, gearHtml, fillSize, _t: { tilesOf, keyOf, urlOf, wantedBoxes, regionBox, reconcile, sweep, flush, getAll, clearAll, padBox, canFetch, hold: v => { held = v; } } };
  })();

  if (!document.getElementById('kgTileCss')) {
    const tcss = document.createElement('style'); tcss.id = 'kgTileCss';
    tcss.textContent = `#kgOffBand{position:absolute;left:10px;right:10px;top:72px;z-index:510;background:#37474F;color:#fff;border:0;border-radius:12px;padding:8px 14px;min-height:44px;font-size:16px;font-weight:700;line-height:1.4;text-align:left;box-shadow:0 2px 8px #0005;overflow-wrap:anywhere}
#kgOffBand:after{content:'  ×';font-weight:700}
#kgOffBand[hidden]{display:none}`;
    document.head.appendChild(tcss);
  }
  /* アプリを開いたとき・画面を描き直したとき・区域を受け取ったとき（受け取ると画面が描き直される）に確かめる */
  (function () {
    const _ra = window.renderAll;
    if (typeof _ra === 'function') {
      window.renderAll = function () { const r = _ra.apply(this, arguments); try { TM.later(1500); } catch (e) { /* なにもしない */ } return r; };
    }
    const _sv = window.showView;
    if (typeof _sv === 'function') {
      window.showView = function () {
        const r = _sv.apply(this, arguments);
        try { TM.attach(); TM.showBand(); } catch (e) { /* なにもしない */ }
        return r;
      };
    }
    const _ss = window.setSheet;
    window.setSheet = function (html) {
      try {
        if (typeof html === 'string' && html.indexOf('id="uiReset"') >= 0 && UI.mode === 'detail') {
          html = html.replace('<button class="btn block" id="uiReset">', TM.gearHtml() + '<button class="btn block" id="uiReset">');
          setTimeout(() => TM.fillSize(), 0);
        }
      } catch (e) { console.error(e); }
      return _ss.call(this, html);
    };
    window.KMTile = TM;
    setTimeout(() => { try { TM.later(100, true); } catch (e) { /* なにもしない */ } }, 1200);
  })();

  /* 更新のお知らせ（CHANGELOG）は index.html に書いてある */

  if (Store.data) { try { syncPaperDone(); updateTabs(); if (currentView === 'reco') renderRecoView(); } catch (e) { console.error(e); } }
})();
