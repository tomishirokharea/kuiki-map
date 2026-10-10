/* =========================================================
   kangaeru.js  おすすめタブ（並べかえて選ぶ）＋「自分で考える奉仕」
   指示書：claude/kangaeru-housi-jissou-shijisho.md ／ claude/osusume-narabekae-jissou-shijisho.md
   読み込み：index.html の schedule.js → kantan.js のあとに <script src="kangaeru.js"></script>
   ・ホームには、おすすめを出さない（毎日のひと言・今日やること・ホームの「今日のおすすめ」を消す）
   ・おすすめは「おすすめタブ」だけ：家のまとまり／留守宅カード／区域カードを1つの一覧にまぜ、
     5つの欄（近さ・時間・会えていない・若い世代・今の時間）で並べかえて選ぶ
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
.kgbig{font-size:34px;font-weight:700;color:var(--brand);line-height:1.2}
.kgwhy{display:block;width:100%;text-align:left;background:none;border:0;padding:4px 0;color:var(--ink2);font-size:16px;line-height:1.5}
.kgwhy:after{content:' ›';font-weight:700}
.kgsm{font-size:15px;color:var(--ink2)}
.kgday{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:6px 0}
.kgday .choice{min-height:60px;font-size:17px}
.kgtbl td.kgmine,.kgtblbox td.kgmine{outline:4px solid #C2410C;outline-offset:-4px}
.kgstat{font-size:17px;font-weight:700;margin:6px 0 4px}
.kgorg{display:inline-flex;align-items:center;min-height:44px;border:2px solid var(--line);background:#fff;border-radius:22px;padding:0 14px;font-size:16px;color:var(--ink);margin:4px 0}
.kgorg:after{content:'▾';margin-left:6px;color:var(--brand)}
.kgsorts{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 8px;-webkit-overflow-scrolling:touch}
.kgsort{flex:none;min-height:46px;border:2px solid var(--line);background:#fff;border-radius:23px;padding:0 15px;font-size:16px;color:var(--ink);white-space:nowrap}
.kgsort[aria-pressed=true],.kgcol.on{background:#DCE8F7;border-color:var(--brand);color:var(--brand);font-weight:700}
.kgc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0}
.kgct{font-weight:700;font-size:17px;margin:0 0 6px;line-height:1.4}
.kgbadge{display:inline-block;font-size:13px;font-weight:400;border-radius:9px;padding:0 8px;background:#E3ECF6;color:var(--brand);margin-left:6px;vertical-align:1px}
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
.kgbody.simple .kgev{font-size:19px}`;
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
  function syncPaperDone() {
    if (!isAdmin() || Store.needMeta || !Array.isArray(D().s13)) return;
    const best = new Map();
    D().s13.forEach(x => { if (x && x.terrId && x.c) { const c = String(x.c); if (!best.has(x.terrId) || best.get(x.terrId) < c) best.set(x.terrId, c); } });
    let ch = false;
    D().territories.forEach(t => {
      const want = best.get(t.id) || '';
      if ((t.paperDone || '') === want) return;
      if (want) t.paperDone = want; else delete t.paperDone;
      ch = true;
    });
    if (ch) { KM.memoClear(); Store.save(true); }
  }
  const _renderAll = window.renderAll;
  window.renderAll = function () {
    const r = _renderAll.apply(this, arguments);
    try { syncPaperDone(); } catch (e) { console.error(e); }
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

  /* =========================================================
     理由（1行）。選び方は前回の決まり（指示書4.3）のまま
     ========================================================= */
  const dayText = (col, bi) => `${SLC[col]}の${SLB[bi]}`;
  function reasonFor(it) {
    const t = it.t, col = it.col, bi = it.bi, c = bi * 3 + col, homes = homesOf(t);
    const q = slotQ(t.id, 4), n = q.n[c], m = q.m[c];
    if (!n && homes >= MIN_HOMES) return `${dayText(col, bi)}は、この区域でまだ試していない時間です`;
    if (homes >= MIN_HOMES && n >= BEST) {
      const tn = q.n.reduce((a, b) => a + b, 0), tm = q.m.reduce((a, b) => a + b, 0);
      if (tn && m / n > tm / tn) return `${dayText(col, bi)}は、この区域で会えた割合が高い時間です（${Math.round(m / n * 100)}%）`;
    }
    if (it.dist != null && it.dist <= num(D().settings.recoDist, 500)) {
      const w = orgWord(), mn = Math.max(1, Math.round(it.dist / 67));
      return `${w}から約${fmtDist(it.dist)}。歩いて約${mn}分です`;
    }
    if (it.kind === 'round' && it.left) return `あと${it.left}軒で、区域を回り終えます`;
    return it.why ? String(it.why) : '今の時間に訪ねられる家があります';
  }

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
    const age = (!simple && typeof AGE_ON !== 'undefined' && AGE_ON && typeof ageMap === 'function' && ageMap())
      ? `<p><button type="button" class="agetype at-mix" data-prof="${tid}" data-back="">この地域のようす ›</button></p>` : '';
    const tableBox = few
      ? '<div class="slpriv"><b>家が少ない区域なので、くわしい数は出していません。</b></div>'
      : simple ? '' : `<div class="seg" role="group" aria-label="期間"><button type="button" data-kgper="4" aria-pressed="${ST_PER.v === 4}">直近4か月</button><button type="button" data-kgper="12" aria-pressed="${ST_PER.v === 12}">1年</button></div>
          ${infoTable(tid, ST_PER.v)}<p class="hint">枠で囲んだ欄が、今のおすすめの曜日・時間帯です。人と比べる数字は出していません。</p>`;
    const yg = youngOf(t);
    const youngLine = !simple && yg ? `<p class="muted">若い世代：${yg === 2 ? '多い' : 'ふつう'}（区域の統計からの目安です）</p>` : '';
    const hasKarte = isAdmin() && typeof KM.openKarte === 'function';
    setSheet(headHtml(t, `区域${esc(t.no)}のようす`, esc(t.name || '')) + `
      <p><b>${esc(state)}</b></p>${line}${simple ? '' : tableBox}${top}${simple && few ? tableBox : ''}
      ${simple ? '' : `${age}<p class="muted">家・部屋 ${homes}軒・会えていない家 ${unmet}軒</p>${youngLine}`}
      <div class="actions"><button type="button" class="btn primary" id="kgiMap">地図で見る</button>
        ${simple ? '' : '<button type="button" class="btn" id="kgiPlan">予定に入れる</button>'}
        ${from ? '<button type="button" class="btn primary" id="kgiGo">今行く</button>' : ''}
        ${hasKarte && !simple ? '<button type="button" class="btn" id="kgiKarte">カルテを開く（係）</button>' : ''}</div>
      <button class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet'), on = (id, fn) => { const b = $('#' + id, S); if (b) b.onclick = fn; };
    markSlot(S, hl);
    $$('[data-kgper]', S).forEach(b => b.onclick = () => { ST_PER.v = Number(b.dataset.kgper); sheetKeep = true; window.openTerrInfo(tid, col, bi, from); });
    on('kgiMap', () => { closeSheet(); openTerr(tid); });
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
     候補をつくる（家のまとまり／留守宅カード／区域カード）
     ・同じ家を2つの候補に入れない：区域カードの続き → 留守宅カード → （新しくもらえる区域）→ 家のまとまり の順に優先
     ・家のまとまりは computeHomeReco と同じ家（係の設定もそのまま）。「一度に出す件数」は使わない
     ========================================================= */
  const hasUnmet = k => !D().dnc[k] && !D().follows[k] && !relOf(k) && isUnmet(k);
  const unmetCount = t => memo('kgum' + t.id + '|' + vl(), () => {
    let n = 0;
    housesOf(t.id).forEach(h => targets(h).forEach(u => { if (hasUnmet(K(h.id, u))) n++; }));
    return n;
  });
  const cenOf = t => memo('kgcen' + t.id, () => (okPoly(t.polygon) ? center(t.polygon) : null));
  const ptsOfTerr = t => memo('kgpt' + t.id + '|' + D().houses.length, () => housesOf(t.id).filter(h => isFinite(h.lat) && isFinite(h.lng)).map(h => [h.lat, h.lng]));
  const ceil5 = m => Math.max(5, Math.ceil(m / 5) * 5);
  const minDist = (pos, pts) => { let b = Infinity; for (let i = 0; i < pts.length; i++) { const d = distM(pos, pts[i]); if (d < b) b = d; } return b === Infinity ? null : b; };

  /* 家のまとまり：起点にいちばん近い家から、近い順に3軒 */
  function pickSel(c, pos) {
    const arr = c.pool;
    let sel;
    if (pos) { arr.forEach(x => { x._d = distM(pos, [x.h.lat, x.h.lng]); }); sel = arr.slice().sort((a, b) => a._d - b._d).slice(0, 3); }
    else sel = arr.slice().sort((a, b) => b.sc - a.sc).slice(0, 3);
    // 近い順につなぐ（1軒目は起点にいちばん近い家）
    const out = [sel.shift()];
    while (sel.length) {
      const last = out[out.length - 1];
      let bi = 0, bd = Infinity;
      sel.forEach((x, i) => { const d = distM([last.h.lat, last.h.lng], [x.h.lat, x.h.lng]); if (d < bd) { bd = d; bi = i; } });
      const x = sel.splice(bi, 1)[0]; x.leg = bd; out.push(x);
    }
    out[0].leg = pos ? out[0]._d : null;
    let walk = 0; out.forEach(x => { if (x.leg != null) walk += x.leg; });
    c.sel = out; c.dist = pos ? out[0]._d : null;
    c.mins = ceil5(walk / 67 + 4 * out.length);
    c.unmet = out.filter(x => hasUnmet(x.k)).length;
    c.why = out[0].why;
    c.title = `区域${c.t.no}の家 ${out.length}軒`;
  }
  /* 起点が変わったとき：距離だけを計算し直す（家を全部回し直さない） */
  function setDists(list) {
    const pos = orgPos(), sig = orgSig();
    if (list.sig === sig) return;
    list.sig = sig;
    list.forEach(c => {
      c.reason = null;
      if (c.kind === 'group') pickSel(c, pos);
      else c.dist = pos && c.pts && c.pts.length ? minDist(pos, c.pts) : null;
    });
  }

  function buildCands() {
    const now = new Date(), cur = slotOf(now), my = me().id, col0 = colOf(now), bi0 = Math.max(0, SLB.indexOf(bandOf(now)));
    const out = [], mineT = new Set(), roundT = new Set(), cardHouse = new Set();
    D().territories.forEach(t => { if (t.holder && myTerr(t) && !t.dummy) mineT.add(t.id); });
    // 1 自分の区域カードの続き
    mineT.forEach(tid => {
      const t = terrById(tid);
      try {
        const r = roundInfo(tid);
        if (r && r.c.todo > 0) {
          roundT.add(tid);
          out.push({ kind: 'round', t, left: r.c.todo, unmet: unmetCount(t), col: col0, bi: bi0, now: true, mine: true, title: `区域${t.no}の続き`,
            pts: r.items.filter(x => isFinite(x.h.lat)).map(x => [x.h.lat, x.h.lng]) });
        }
      } catch (e) { /* この区域はとばす */ }
    });
    // 2 留守宅カード：区域ごとに、今の時間帯のカード1枚と、ほかの時間帯でいちばん会える見込みが高いカード1枚まで
    if (myAwayCount(false) < D().settings.awayMax) {
      const byT = new Map();
      awaySuggestions(my, SLOTS).forEach(x => {
        if (roundT.has(x.t.id) || x.t.dummy) return;
        const p = meetChance(x.t, x.slot).p;
        x.exp = x.keys.length * p;
        if (!byT.has(x.t.id)) byT.set(x.t.id, []);
        byT.get(x.t.id).push(x);
      });
      byT.forEach(list => {
        const curC = list.find(x => x.slot === cur) || null, curKeys = new Set(curC ? curC.keys : []);
        const rest = list.filter(x => x.slot !== cur && !x.keys.some(k => curKeys.has(k))).sort((a, b) => b.exp - a.exp);
        [curC, rest[0]].forEach(x => {
          if (!x) return;
          const hs = x.keys.map(k => houseById(parseKey(k)[0])).filter(h => h && isFinite(h.lat));
          x.keys.forEach(k => cardHouse.add(parseKey(k)[0]));
          out.push({ kind: 'card', t: x.t, slot: x.slot, keys: x.keys, unmet: x.keys.length, col: slotCol(x.slot), bi: slotBand(x.slot), now: x.slot === cur, mine: false,
            title: `区域${x.t.no}の留守宅カード（${slotShort(x.slot)}のカード）`, why: `${x.keys.length}軒のうち、約${Math.max(1, Math.round(x.exp))}軒で会えそう`,
            pts: hs.map(h => [h.lat, h.lng]) });
        });
      });
    }
    // 3 新しくもらえる区域（「区域をもらう」のおすすめ順＝返却から長い順の上位3つ）
    if (hasRoom(false)) {
      const taken = new Set(out.map(c => c.t.id));
      freeTerrs().filter(t => !taken.has(t.id)).map(t => ({ t, last: [t.completedAt, t.returnedAt].filter(Boolean).sort().pop() || '' }))
        .sort(byLongest).slice(0, 3).forEach(({ t }) => {
          const take = isFree(t) && canTakeFree(false);
          out.push({ kind: 'terr', t, take, unmet: unmetCount(t), col: col0, bi: bi0, now: true, mine: false, title: `区域${t.no}をもらう`,
            why: take ? '空いている区域です。すぐ受け取れます' : '空いている区域です。係に頼むと受け取れます', pts: ptsOfTerr(t) });
        });
    }
    // 4 家のまとまり（computeHomeReco と同じ家。自分の区域・カードの家・もらえる区域の家は入れない）
    const ex = new Set(mineT);
    out.forEach(c => { if (c.kind === 'terr') ex.add(c.t.id); });
    let reco = [];
    try { window.KG_RECO_ALL = true; reco = computeHomeReco().list; } catch (e) { console.error(e); } finally { window.KG_RECO_ALL = false; }
    const pools = new Map();
    reco.forEach(x => {
      if (ex.has(x.t.id) || cardHouse.has(x.h.id) || x.t.dummy || !isFinite(x.h.lat) || !isFinite(x.h.lng)) return;
      if (!pools.has(x.t.id)) pools.set(x.t.id, []);
      pools.get(x.t.id).push(x);
    });
    pools.forEach(pool => out.push({ kind: 'group', t: pool[0].t, pool, col: col0, bi: bi0, now: true, mine: false }));
    out.forEach((c, i) => { c.i = i; });
    out.sig = null;
    return out;
  }
  function getCands() {
    const cur = slotOf(new Date()), key = ['kgc', me().id, cur, vl(), D().awayCards.length, D().houses.length, D().territories.filter(t => t.holder === me().id).length,
      myPos ? myPos[0].toFixed(4) + ',' + myPos[1].toFixed(4) : '', D().settings.recoKinds, D().settings.recoDist, D().settings.recoOthers].join('|');
    return memo(key, buildCands);
  }

  /* ---------- 5つの欄と、並べかえ ---------- */
  const youngInfo = () => memo('kgyg|' + D().territories.length + '|' + vl(), () => {
    if (!(typeof AGE_ON !== 'undefined' && AGE_ON && typeof ageMap === 'function' && ageMap())) return null;
    const m = new Map(), arr = [];
    eligible().forEach(t => { try { const y = youngShare(t); if (y && y.pct != null) { m.set(t.id, y.pct); arr.push(y.pct); } } catch (e) { /* とばす */ } });
    arr.sort((a, b) => b - a);
    return { m, thr: arr.length ? arr[Math.max(0, Math.ceil(arr.length / 3) - 1)] : null };   // 市内で上から3分の1が「多い」
  });
  const youngOf = t => { const y = youngInfo(); if (!y || !y.m.has(t.id)) return 0; return y.thr > 0 && y.m.get(t.id) >= y.thr ? 2 : 1; };   // 2 多い・1 ふつう・0 ―
  const TRANK = { group: 0, card: 1, round: 2, terr: 2 };                                                                                  // 15分 → 1時間 → 半日
  const COLS = [
    ['near', '近さ', SVG('<path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>')],
    ['time', '時間', SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')],
    ['unmet', '会えていない', SVG('<path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9h12v-9"/>')],
    ['young', '若い世代', SVG('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c0-3.2 2.5-5 5.5-5s5.5 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.2"/><path d="M16.5 14.2c2.4 0 4 1.5 4 4.3"/>')],
    ['now', '今の時間', SVG('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>')]
  ];
  const SORTS = [['near', '近い順'], ['time', '時間が短い順'], ['unmet', '会えていない家が多い順'], ['young', '若い世代が多い順'], ['now', '今の時間に合う順']];
  const SORT_NOTE = {
    near: '起点から、いちばん近い家までの距離で並べています',
    time: '回るのにかかる時間の目安で並べています（15分 → 1時間 → 半日）',
    unmet: '留守の記録だけの、会えていない家の数で並べています',
    young: '若い世代は、区域の統計からの目安です（家ごとの数字ではありません）',
    now: '今の時間に回るのに合うものを、先に並べています'
  };
  const simpleSorts = () => SORTS.filter(s => s[0] === 'near' || s[0] === 'unmet');
  function sortKey() {
    const simple = isS(), ok = (simple ? simpleSorts() : SORTS).map(s => s[0]), v = lsGet(sortKeyOf());
    if (ok.includes(v)) return v;
    return simple ? (myPos ? 'near' : 'unmet') : 'now';
  }
  const cmpN = (a, b) => (a === b ? 0 : a - b);
  const dOf = c => (c.dist == null ? Infinity : c.dist);
  function sortList(list, key) {
    const near = (a, b) => cmpN(dOf(a), dOf(b));
    const f = {
      near,
      time: (a, b) => cmpN(TRANK[a.kind], TRANK[b.kind]) || near(a, b),
      unmet: (a, b) => cmpN(b.unmet, a.unmet) || near(a, b),
      young: (a, b) => cmpN(youngOf(b.t), youngOf(a.t)) || cmpN(b.unmet, a.unmet) || near(a, b),
      now: (a, b) => cmpN(b.now ? 1 : 0, a.now ? 1 : 0) || near(a, b)
    }[key] || near;
    return list.slice().sort((a, b) => f(a, b) || (a.i - b.i));
  }
  function cellVals(c) {
    return {
      near: c.dist == null ? '―' : fmtDist(c.dist),
      time: c.kind === 'group' ? `約${c.mins}分` : c.kind === 'card' ? '1時間' : '半日',
      unmet: `${c.unmet}軒`,
      young: ['―', 'ふつう', '多'][youngOf(c.t)],
      now: c.now ? '○' : '―'
    };
  }

  /* ---------- 画面 ---------- */
  const VIEW = { shown: 10, list: null, order: [] };
  let TOK = 0;
  const DOW = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
  const plansOf = (future) => {
    const today = ymd(new Date());
    return myData().events.filter(e => e.tid && (future ? e.date > today : e.date === today)).sort((a, b) => ((a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1));
  };
  const evRow = (e, withDate) => `<div class="kgev"><div><b>${e.time ? `<span>${esc(e.time)}</span>　` : ''}${esc(e.title)}</b>${withDate ? `<small>${fmtYmd(e.date)}</small>` : ''}</div>${evBtn(e.id)}</div>`;

  function cardHtml(c, i, simple, sk) {
    const v = cellVals(c);
    const cols = (simple ? COLS.filter(x => x[0] === 'near' || x[0] === 'unmet') : COLS).map(([k, lab, ic]) =>
      `<button type="button" class="kgcol${sk === k ? ' on' : ''}" data-kgs="${k}" aria-pressed="${sk === k}">${ic}<small>${lab}</small><b>${esc(v[k])}</b></button>`).join('');
    if (c.reason == null) c.reason = reasonFor(c);
    const goLabel = c.kind === 'terr' ? (c.take ? '受け取る' : '係に頼む') : '今行く';
    let acts;
    if (simple) {
      acts = (c.now ? `<button type="button" class="btn primary block" data-kggo="${i}">${goLabel}</button>` : `<button type="button" class="btn primary block" data-kgplan="${i}">予定に入れる</button>`) +
        (c.now ? `<button type="button" class="btn small kgplan" data-kgplan="${i}">予定に入れる</button>` : '');
    } else {
      acts = (c.now ? `<button type="button" class="btn small primary" data-kggo="${i}">${goLabel}</button><button type="button" class="btn small" data-kgplan="${i}">予定に入れる</button>`
        : `<button type="button" class="btn small primary" data-kgplan="${i}">予定に入れる</button>`) +
        (c.kind === 'group' ? `<button type="button" class="btn small" data-kgchain="${i}">回る順番</button>` : '');
    }
    return `<article class="kgc"><p class="kgct">${esc(c.title)}${c.mine ? '<span class="kgbadge">あなたの区域カード</span>' : ''}</p>
      <div class="kgcols${simple ? ' two' : ''}" role="group" aria-label="並べかえる欄">${cols}</div>
      <button type="button" class="kgwhy" data-kginfo="${i}">${esc(c.reason)}</button>
      <div class="actions">${acts}</div></article>`;
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
    el.innerHTML = (isS() ? '' : `<button type="button" class="kgorg" data-kgorg>距離は：${orgLabel()}</button>`) + loc;
  }
  function paintList() {
    const el = $('#kgList'); if (!el) return;
    const simple = isS(), sk = sortKey();
    if (offToday()) { el.innerHTML = '<div class="notice warn">今日は、区域係が訪問を控える日にしています</div>'; return; }
    const list = VIEW.list;
    if (!list) return;
    setDists(list);
    VIEW.order = sortList(list, sk);
    const show = VIEW.order.slice(0, VIEW.shown);
    let h = show.map((c, i) => cardHtml(c, i, simple, sk)).join('');
    if (!h) h = '<div class="empty">今出せるおすすめはありません。</div>';
    if (VIEW.order.length > show.length) h += `<button type="button" class="btn block" data-kgmore>もっと見る</button>`;
    el.innerHTML = h;
  }
  function fill(tok) {
    if (tok !== TOK || !recoTabOn()) return;
    const simple = isS();
    try { VIEW.list = offToday() ? [] : getCands(); } catch (e) { console.error(e); VIEW.list = []; }
    paintOrg(); paintSorts(); paintList();
    const fut = $('#kgPlans'); if (fut && !simple) { const p = plansOf(true).slice(0, 6); fut.innerHTML = p.length ? `<h2 class="sec">あなたの予定</h2>${p.map(e => evRow(e, true)).join('')}` : ''; }
    const rv = $('#kgRev');
    if (rv && revOn()) setTimeout(() => { if (tok !== TOK) return; try { rv.innerHTML = lookSection(simple); } catch (e) { console.error(e); } }, 0);
  }
  window.renderRecoView = function () {
    const box = $('#recoPane'); if (!box || $('#view-reco').hidden) return;
    if (!recoTabOn()) { box.innerHTML = '<div class="empty">今は、おすすめを出さない設定です。</div>'; return; }
    orgLoad();
    const simple = isS(), now = new Date(), tok = ++TOK, today = plansOf(false);
    VIEW.shown = simple ? 3 : 10;
    box.innerHTML = `<div class="kgbody${simple ? ' simple' : ''}">
      ${today.length ? `<h2 class="sec">今日の予定</h2>${today.map(e => evRow(e, false)).join('')}` : ''}
      <h2 class="sec">おすすめ</h2>
      <p class="kgstat">今は${DOW[now.getDay()]}の${bandOf(now)}です</p>
      ${simple ? '<p class="kgsm">今いる場所から探します</p>' : ''}<div id="kgOrg"></div>
      <div id="kgSorts"></div>
      <div id="kgList"><p class="muted">さがしています…</p></div>
      <div id="kgPlans"></div><div id="kgRev"></div></div>`;
    paintSorts();
    setTimeout(() => fill(tok), 0);                                   // 枠を先に出し、一覧はそのあとで作る
    try { maybeAutoLocate(); } catch (e) { /* 現在地の自動取得だけの話 */ }
  };

  function setSort(k) {
    lsSet(sortKeyOf(), k);
    VIEW.shown = isS() ? 3 : 10;
    paintSorts(); paintList();                                        // 作った一覧を並べ直すだけ
    const b = document.querySelector('#kgSorts [data-kgs="' + k + '"]'); if (b) b.focus({ preventScroll: true });
  }

  /* 距離の起点の切りかえ */
  let kgPicking = false;
  function openOrigin() {
    orgLoad();
    const hall = hallPos(), cur = ORG.type;
    const opt = (k, label, sub) => `<button type="button" class="choice${cur === k ? ' on' : ''}" data-kgo="${k}" aria-pressed="${cur === k}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
    setSheet(headHtml(null, '距離の起点', 'どこからの近さで、並べるかを決めます') +
      `<div class="kgday" style="grid-template-columns:1fr">${opt('here', '今いる場所', '')}${hall ? opt('hall', '会館', '') : ''}${opt('pick', '地図でえらんだ場所', '何かのついでに回るときに')}</div>
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
  }
  function startPick() {
    closeSheet(); kgPicking = true; showView('map');
    pickPlace = ll => {
      kgPicking = false;
      ORG.type = 'pick'; ORG.pick = [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6]; orgSave();
      showView('reco'); toast('場所をえらびました');
    };
    toast('距離の起点にする場所を、地図でタップしてください');
  }

  /* 今行く／予定に入れる／回る順番 */
  function goPick(it) {
    CHANCE_CACHE = null;
    if (it.kind === 'card') takeAwayCard(it.t.id, it.slot);
    else if (it.kind === 'round') openTerr(it.t.id);
    else if (it.kind === 'terr') { reqForGroup = false; if (it.take) takeTerr(it.t.id); else askTerr(it.t.id); }
    else { const s = it.sel[0]; recoMark(s.h.id, s.u, s.rk); goTo(s.h.id, s.u, false, s.rk); }
  }
  function openChain(c) {
    setSheet(headHtml(null, '回る順番', `約${c.mins}分`) + c.sel.map((x, i) => `<article class="ritem"><div><p class="rt"><span class="numbadge">${i + 1}</span> ${targetName(x.h, x.u)}</p>
        ${x.leg != null ? `<p class="muted">${i === 0 ? (isS() || ORG.type === 'here' ? 'ここから' : ORG.type === 'hall' ? '会館から' : 'えらんだ場所から') : '前の家から'}約${fmtDist(x.leg)}</p>` : ''}</div>
        <button type="button" class="btn small primary" data-kgq="${i}">地図で見る</button></article>`).join('') +
      '<p class="hint">最近会えた家・拒否の家・ほかの人の留守宅カードの家は入れていません。</p><button class="btn block" data-close>閉じる</button>');
    $$('[data-kgq]', $('#sheet')).forEach(b => b.onclick = () => {
      const x = c.sel[Number(b.dataset.kgq)];
      closeSheet(); recoMark(x.h.id, x.u, x.rk); goTo(x.h.id, x.u, false, x.rk);
    });
  }

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
    else if (q('[data-kgmore]')) { VIEW.shown += isS() ? 3 : 10; paintList(); }
    else if (q('[data-kgloc]')) { locate(() => { RECO_CACHE = null; renderRecoView(); }); }
    else if ((x = q('[data-kggo]'))) { const c = it(x, 'kggo'); if (c) goPick(c); }
    else if ((x = q('[data-kgplan]'))) { const c = it(x, 'kgplan'); if (c) openPlan(c); }
    else if ((x = q('[data-kgchain]'))) { const c = it(x, 'kgchain'); if (c) openChain(c); }
    else if ((x = q('[data-kginfo]'))) { const c = it(x, 'kginfo'); if (c) window.openTerrInfo(c.t.id, c.col, c.bi, c); }
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
    return `<div class="featrow"><p><b>おすすめのタブを出す</b><small>下のタブに「おすすめ」を出します。近くの会えていない家や留守宅カードを、並べかえて選べます</small></p>${seg('tab', recoTabOn() ? 'on' : 'off')}</div>
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
            html = html.replace(`<button class="btn small danger" data-evdel="${e.id}">`, `${evBtn(e.id)}<button class="btn small danger" data-evdel="${e.id}">`);
          });
        }
      }
    } catch (err) { console.error(err); }
    return _setSheet.call(this, html);
  };

  /* ---------- 係の画面：おすすめの設定から「一度に出す件数」を消す（この件数はもう使わない） ---------- */
  const _renderRecoAdmin = window.renderRecoAdmin;
  if (typeof _renderRecoAdmin === 'function') {
    window.renderRecoAdmin = function () {
      const r = _renderRecoAdmin.apply(this, arguments);
      try {
        const box = document.getElementById('adReco');
        if (box) {
          const b = box.querySelector('[data-kset="recoCount"]'), row = b && b.closest('.setrow');
          if (row) row.remove();
          const h = box.querySelector('h2.sec'); if (h && h.textContent.indexOf('ホームの') === 0) h.textContent = 'おすすめのタブ';
          box.querySelectorAll('p.hint').forEach(p => {
            p.innerHTML = p.innerHTML.replace('<br>えらんだ種類から、順番に1件ずつ出します。', '')
              .replace('カードを受け取らなくても、空いた時間に2〜3件回れる家を、全員の画面の下のタブ「おすすめ」に出します。', 'カードを受け取らなくても回れる家や、留守宅カード・区域カードを、全員の画面の下のタブ「おすすめ」に、並べかえて選べる形で出します。');
          });
        }
      } catch (e) { console.error(e); }
      return r;
    };
  }

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
        T('おすすめの一覧づくり', () => { RECO_CACHE = null; CHANCE_CACHE = null; const l = buildCands(); setDists(l); sortList(l, sortKey()); });
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
