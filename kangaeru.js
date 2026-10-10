/* =========================================================
   kangaeru.js  「自分で考える奉仕」（案1〜案4）
   指示書：claude/kangaeru-housi-jissou-shijisho.md
   読み込み：index.html の schedule.js のあとに <script src="kangaeru.js"></script>
   ・案1 あなたの記録が役に立ちました（スマホの中だけで計算）
   ・案2 おすすめに理由／区域のようす／予定に入れる／15分で回れる3軒
   ・案3 会衆の年間カバー（係と同じ数え方・t.paperDone）
   ・案4 自分だけのふり返り
   サーバーに新しく送るのは、区域の t.paperDone（係のスマホが書く）と、係の設定 kgGoal だけ
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
  const css = document.createElement('style');
  css.textContent = `.kgcard{margin:10px 0}
.kgthanks{background:#E8F5E9;border:2px solid #2E7D32;border-radius:14px;padding:12px 14px}
.kgthanks b{font-size:19px}
.kgbig{font-size:34px;font-weight:700;color:var(--brand);line-height:1.2}
.kgwhy{display:block;width:100%;text-align:left;background:none;border:0;padding:4px 0;color:var(--ink2);font-size:16px;line-height:1.5}
.kgwhy:after{content:' ›';font-weight:700}
.kgpick{grid-template-columns:1fr}
.kgsm{font-size:15px;color:var(--ink2)}
.kgday{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:6px 0}
.kgday .choice{min-height:60px;font-size:17px}
.kgtbl td.kgmine,.kgtblbox td.kgmine{outline:4px solid #C2410C;outline-offset:-4px}
.kgbody.simple .kgpick .btn{min-height:60px;font-size:20px}
.kgbody.simple .kgwhy{font-size:18px}
.kgbody.simple .kgsm{font-size:16px}
.kgbody.simple .kgbig{font-size:40px}
.kgbody.simple .kgthanks .btn{min-height:56px;font-size:19px}
.kgfoot .btn{margin-top:8px}`;
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
  function lookHtml() {
    if (isSimple() ? false : !uiOn('kgLook')) return '';
    return '<button type="button" class="btn block" data-kglook>あなたのふり返り（このスマホの中だけ）</button>';
  }
  function openLook() {
    const s = myStats(), simple = isSimple();
    let body;
    if (simple) {
      body = `<p class="kgbig">${esc(lookWord(s))}</p><p class="q">訪ねた家 ${s.homes}軒・会えた ${s.met}軒</p>`;
    } else {
      const rows = SLB.map((b, bi) => `<tr><th>${b}<br><small>${BAND_HINT[b]}</small></th>${[0, 1, 2].map(ci => {
        const c = bi * 3 + ci, n = s.n[c];
        if (n < FEW) return '<td></td>';
        const p = Math.round(s.m[c] / n * 100);
        return `<td style="background:rgba(21,101,192,${(0.06 + p / 100 * 0.5).toFixed(2)})"><b>${p}%</b><br><small>${n}件</small></td>`;
      }).join('')}</tr>`).join('');
      body = `<p class="q">直近3か月：訪ねた家 ${s.homes}軒・会えた ${s.met}軒</p>
        <p><b>${esc(lookWord(s))}</b></p>
        <table class="slots slotnew kgtbl" aria-label="あなたの曜日と時間帯ごとの会えた割合"><tr><th></th>${SLC.map(x => `<th>${x}</th>`).join('')}</tr>${rows}</table>
        <p class="hint">会えた割合の濃さです。記録が${FEW}件に満たない欄は空けています。人と比べる数字は出していません。</p>`;
    }
    setSheet(headHtml(null, 'あなたのふり返り', 'このスマホの中だけで見られます') +
      '<div class="notice info">このスマホの中だけで見られます。係やほかの人には送られません。</div>' + body +
      '<button class="btn block" data-close>閉じる</button>');
  }

  /* =========================================================
     時間帯の集計（区域×月×曜日区分×時間帯）。「区域のようす」と、おすすめの理由に使う
     ========================================================= */
  const slotQ = (tid, per) => { const t = terrById(tid); return t ? KM.slotQuery([t], per) : { n: new Array(15).fill(0), m: new Array(15).fill(0) }; };
  const homesOf = t => memo('kgh' + t.id + '|' + D().houses.length, () => housesOf(t.id).reduce((a, h) => a + targets(h).length, 0));

  /* =========================================================
     案2 おすすめに理由（今日のおすすめ）
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
    if (myPos && okPoly(t.polygon)) {
      const d = distM(myPos, center(t.polygon));
      if (d <= (num(D().settings.recoDist, 500))) return `ここから約${fmtDist(d)}。歩いて約${Math.max(1, Math.round(d / 67))}分です`;
    }
    if (it.kind === 'round' && it.left) return `あと${it.left}軒で、区域を回り終えます`;
    return it.why ? String(it.why) : '今の時間に訪ねられる家があります';
  }
  function buildPicks() {
    const simple = isSimple(), now = new Date(), col0 = colOf(now), bi0 = SLB.indexOf(bandOf(now)), out = [], used = new Set();
    const push = it => { if (!it.t || used.has(it.t.id)) return; used.add(it.t.id); out.push(it); };
    const max = simple ? 1 : 3;
    // 1 今の時間帯の留守宅カード（「今日やること」に同じカードが出ているときは出さない）
    try {
      if (uiEff().todayOn !== 'on') {
        const ch = chanceCard();
        if (ch) push({ kind: 'card', t: ch.t, slot: ch.slot, col: slotCol(ch.slot), bi: slotBand(ch.slot), title: `区域${ch.t.no}の留守宅カード（${slotShort(ch.slot)}）` });
      }
    } catch (e) { console.error(e); }
    // 2 自分の区域カードの続き
    const rounds = [];
    D().territories.filter(t => t.holder === me().id).forEach(t => {
      try { const r = roundInfo(t.id); if (r && r.c.todo > 0) rounds.push({ kind: 'round', t, col: col0, bi: bi0, left: r.c.todo, title: `区域${t.no}の続き` }); } catch (e) { /* とばす */ }
    });
    rounds.sort((a, b) => a.left - b.left);
    // 3 今あるおすすめ（簡単モードと、係が「出さない」のときは使わない）
    const recos = [];
    if (!simple && recoOn()) {
      try {
        computeHomeReco().list.forEach(x => recos.push({ kind: 'reco', t: x.t, h: x.h, u: x.u, rk: x.rk, col: col0, bi: bi0, why: x.why,
          title: `区域${x.t.no}　${targetName(x.h, x.u).replace(/<[^>]*>/g, '')}` }));
      } catch (e) { console.error(e); }
    }
    const seq = [rounds[0], recos[0], recos[1], rounds[1], recos[2], recos[3]];
    seq.forEach(it => { if (it) push(it); });
    const res = out.slice(0, max);
    res.forEach(it => { it.reason = reasonFor(it); });
    return res;
  }
  let picks = [];
  function picksHtml(simple) {
    if (!uiOn('kgReco')) return '';
    if (offToday()) return '<div class="notice warn kgcard">今日は、区域係が「訪問を控える日」にしています。おすすめはお休みです。</div>';
    picks = buildPicks();
    const body = picks.length ? picks.map((it, i) => `<article class="ritem kgpick"><div>
        <p class="rt">${esc(it.title)}</p>
        <button type="button" class="kgwhy" data-kginfo="${i}">${esc(it.reason)}</button></div>
        <div class="actions"><button type="button" class="btn small primary" data-kggo="${i}">今行く</button>
          ${simple ? '' : `<button type="button" class="btn small" data-kgplan="${i}">予定に入れる</button>`}</div></article>`).join('')
      : '<p class="muted">今の時間帯のおすすめは、ありません。区域カードから回れます。</p>';
    return `<h2 class="sec">今日のおすすめ</h2>${body}` + (simple ? '' :
      `<div class="row">${recoOn() ? '<button type="button" class="btn small" data-kgmore>ほかのおすすめ</button>' : ''}<button type="button" class="btn small" data-kgquick>15分で回れる3軒</button></div>`);
  }
  function goPick(it) {
    CHANCE_CACHE = null;
    if (it.kind === 'card') takeAwayCard(it.t.id, it.slot);
    else if (it.kind === 'round') openTerr(it.t.id);
    else { recoMark(it.h.id, it.u, it.rk); goTo(it.h.id, it.u, false, it.rk); }
  }

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
    const hasKarte = isAdmin() && typeof KM.openKarte === 'function';
    setSheet(headHtml(t, `区域${esc(t.no)}のようす`, esc(t.name || '')) + `
      <p><b>${esc(state)}</b></p>${line}${simple ? '' : tableBox}${top}${simple && few ? tableBox : ''}
      ${simple ? '' : `${age}<p class="muted">家・部屋 ${homes}軒・会えていない家 ${unmet}軒</p>`}
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
        const title = it.kind === 'card' ? `区域${it.t.no}の留守宅（${dl}・${band}）` : it.kind === 'round' ? `区域${it.t.no}の続き（${dl}・${band}）` : `区域${it.t.no}のおすすめの家（${dl}・${band}）`;
        const o = myData();
        o.events.push({ id: uid(), date: st.date, time: BT[st.bi], title, tid: it.t.id, rk: it.kind === 'reco' ? (it.rk || 'reco') : it.kind, band });
        mySave(o);
        renderHome();
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
     案2 「15分で回れる3軒」（詳しいモードだけ）
     ========================================================= */
  function nearChain() {
    const st = D().settings, near = 1200, dLat = near / 110540, dLng = near / 100000;
    const skipMs = num(st.recoSkipDays, 14) * DAY, longMs = num(st.recoLongDays, 180) * DAY, others = num(st.recoOthers, 1) !== 0, now = Date.now();
    const cardKeys = new Set();
    activeCards().forEach(c => { if (c.by !== me().id) c.keys.forEach(k => cardKeys.add(k)); });
    const cand = [];
    for (const h of D().houses) {
      if (!h.terrId || Math.abs(h.lat - myPos[0]) > dLat || Math.abs(h.lng - myPos[1]) > dLng) continue;
      const t = terrById(h.terrId);
      if (!t || (!others && t.holder && !myTerr(t))) continue;
      for (const u of targets(h)) {
        const k = K(h.id, u);
        if (D().dnc[k] || D().follows[k] || relOf(k) || recentMet(k) || cardKeys.has(k)) continue;
        const s = sum(k);
        if (!s.n || (s.last && skipMs && now - Date.parse(s.last.at) < skipMs)) continue;
        if (s.met && now - Date.parse(s.met.at) <= longMs) continue;
        cand.push({ h, u });
        break;
      }
    }
    const out = [];
    let at = myPos, total = 0;
    while (out.length < 3 && cand.length) {
      let bi = 0, bd = Infinity;
      cand.forEach((c, i) => { const d = distM(at, [c.h.lat, c.h.lng]); if (d < bd) { bd = d; bi = i; } });
      const c = cand.splice(bi, 1)[0];
      c.d = bd; total += bd; out.push(c); at = [c.h.lat, c.h.lng];
    }
    return { out, mins: Math.ceil(total / 67 + 4 * out.length) };
  }
  function openQuick() {
    if (!myPos) {
      setSheet(headHtml(null, '15分で回れる3軒', '') + `<p class="hint">現在地がわかると、近くの家をえらべます。</p>
        <button class="btn primary block" id="kgLoc">現在地を使う</button><button class="btn block" data-close>閉じる</button>`);
      $('#kgLoc').onclick = () => locate(openQuick);
      return;
    }
    const r = nearChain();
    setSheet(headHtml(null, '15分で回れる3軒', r.out.length && r.mins <= 20 ? `約${r.mins}分` : '') + (r.out.length
      ? r.out.map((c, i) => `<article class="ritem"><div><p class="rt"><span class="numbadge">${i + 1}</span> ${targetName(c.h, c.u)}</p>
          <p class="muted">${i === 0 ? 'ここから' : '前の家から'}約${fmtDist(c.d)}</p></div>
          <button type="button" class="btn small primary" data-kgq="${i}">地図で見る</button></article>`).join('')
        + '<p class="hint">最近会えた家・拒否の家・ほかの人の留守宅カードの家は入れていません。</p>'
      : '<div class="empty">近くに、今おすすめできる家はありません。</div>') + '<button class="btn block" data-close>閉じる</button>');
    $$('[data-kgq]', $('#sheet')).forEach(b => b.onclick = () => {
      const c = r.out[Number(b.dataset.kgq)];
      closeSheet(); recoMark(c.h.id, c.u, 'near'); goTo(c.h.id, c.u, false, 'near');
    });
  }

  /* =========================================================
     ホームへの組み込み（先に画面を出し、計算はそのあとで）
     ========================================================= */
  let fillTok = 0;
  function ensureBox(id, where) {
    const wrap = $('#view-home .wrap');
    if (!wrap) return null;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div'); el.id = id;
      if (where === 'top') { const hello = $('#homeHello'); if (hello && hello.parentNode === wrap) hello.insertAdjacentElement('afterend', el); else wrap.insertBefore(el, wrap.firstChild); }
      else wrap.appendChild(el);
    }
    return el;
  }
  function fillHome(tok) {
    if (tok !== fillTok) return;
    const view = $('#view-home'); if (!view || view.hidden) return;
    const simple = isSimple();
    const top = ensureBox('kgTop', 'top'), foot = ensureBox('kgFoot', 'foot');
    if (!top || !foot) return;
    top.className = 'kgbody' + (simple ? ' simple' : '');
    // 簡単モード：案3は大きな数字1つ、案1は1行
    top.innerHTML = '<p class="muted">さがしています…</p>';
    setTimeout(() => {
      if (tok !== fillTok) return;
      let html = '';
      // 詳しいモード：知らせ → おすすめ → 目標（6.1）／簡単モード：おすすめ → 知らせ(1行) → 目標(1行)（6.2）
      const parts = [() => thanksHtml(simple), () => picksHtml(simple), () => goalHtml(simple)];
      if (simple) parts.unshift(parts.splice(1, 1)[0]);
      parts.forEach(f => { try { html += f(); } catch (e) { console.error(e); } });
      top.innerHTML = html;
      try { foot.innerHTML = `<div class="kgfoot">${thanksFoot()}${lookHtml()}</div>`; } catch (e) { console.error(e); }
    }, 0);
  }
  const _renderHome = window.renderHome;
  window.renderHome = function () {
    const r = _renderHome.apply(this, arguments);
    try { const tok = ++fillTok; setTimeout(() => fillHome(tok), 0); } catch (e) { console.error(e); }
    return r;
  };

  /* ---------- 押したときの動き ---------- */
  document.addEventListener('click', e => {
    const q = s => e.target.closest && e.target.closest(s);
    let x;
    if ((x = q('[data-kgopen]'))) { e.preventDefault(); e.stopPropagation(); openEvent(x.dataset.kgopen); return; }
    if (q('[data-ui^="kg"]')) { setTimeout(() => { try { renderHome(); } catch (err) { /* 表示だけの話 */ } }, 60); return; }
    if (!q('#view-home')) return;
    if (q('[data-kgthok]')) { thanksDone(); }
    else if (q('[data-kgthsee]')) openThanks();
    else if (q('[data-kglook]')) openLook();
    else if (q('[data-kgquick]')) openQuick();
    else if (q('[data-kgmore]')) showView('reco');
    else if ((x = q('[data-kggo]'))) { const it = picks[Number(x.dataset.kggo)]; if (it) goPick(it); }
    else if ((x = q('[data-kgplan]'))) { const it = picks[Number(x.dataset.kgplan)]; if (it) openPlan(it); }
    else if ((x = q('[data-kginfo]'))) { const it = picks[Number(x.dataset.kginfo)]; if (it) window.openTerrInfo(it.t.id, it.col, it.bi, it); }
  }, true);

  /* ---------- 歯車の設定（詳しいモードの「ホームに出すもの」）と、日の画面の「地図をひらく」 ---------- */
  function uiRows() {
    const seg = (key, cur) => `<div class="seg uiseg" role="group">${[['on', '出す'], ['off', '出さない']].map(([v, l]) =>
      `<button type="button" data-ui="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
    const row = (key, name, sub) => `<div class="featrow"><p><b>${name}</b><small>${sub}</small></p>${seg(key, uiOn(key) ? 'on' : 'off')}</div>`;
    return row('kgReco', '今日のおすすめ', '空いた時間におすすめの家や区域を、理由つきで出します') +
      row('kgThanks', '役に立った記録', 'あなたの留守の記録で、ほかの人が会えた家の数を知らせます') +
      (goalOn() ? row('kgGoal', '会衆の目標', '今年、会衆で回った区域の割合を出します')
        : '<div class="featrow"><p><b>会衆の目標</b><small>区域係が「出さない」にしているため、選べません</small></p></div>') +
      row('kgLook', 'ふり返り', 'あなたの記録のふり返りを、このスマホの中だけで見られます');
  }
  const _setSheet = window.setSheet;
  window.setSheet = function (html) {
    try {
      if (typeof html === 'string') {
        if (html.indexOf('id="uiReset"') >= 0 && !isSimple()) html = html.replace('<h3 class="sub">区域カードに出すもの</h3>', uiRows() + '<h3 class="sub">区域カードに出すもの</h3>');
        if (html.indexOf('data-evdel') >= 0) {
          myData().events.filter(e => e.tid).forEach(e => {
            html = html.replace(`<button class="btn small danger" data-evdel="${e.id}">`, `${evBtn(e.id)}<button class="btn small danger" data-evdel="${e.id}">`);
          });
        }
      }
    } catch (err) { console.error(err); }
    return _setSheet.call(this, html);
  };

  /* ---------- 係の設定：伝道者のホームに会衆の目標を出すか ---------- */
  const _renderAdmin = window.renderAdmin;
  window.renderAdmin = function () {
    _renderAdmin.apply(this, arguments);
    try {
      const box = document.getElementById('adDataSet');
      if (isAdmin() && adPane === 'set' && box && !box.querySelector('[data-kgadm]')) {
        const on = goalOn();
        box.insertAdjacentHTML('beforeend', `<div class="setrow" data-kgadm><span>伝道者のホームに、会衆の目標を出す<br><small class="hint">今年、会衆で回った区域の割合を、みんなのホームに出します（個人の件数や順位は出しません）</small></span>
          <div class="seg" role="group" aria-label="会衆の目標"><button type="button" data-sset="kgGoal" data-v="1" aria-pressed="${on}">出す</button><button type="button" data-sset="kgGoal" data-v="0" aria-pressed="${!on}">出さない</button></div></div>`);
      }
    } catch (e) { console.error(e); }
  };

  /* ---------- 「速さを測る」に4行（いちばん古いスマホで0.3秒未満が目安） ---------- */
  if (typeof runPerfCheck === 'function') {
    const _perf = window.runPerfCheck;
    window.runPerfCheck = function () {
      _perf.apply(this, arguments);
      try {
        const rows = [];
        const T = (name, fn) => {
          const t0 = performance.now();
          try { MEMO.clear(); fn(); } catch (e) { rows.push([name, -1]); return; }
          rows.push([name, performance.now() - t0]);
        };
        T('役に立った記録', () => { thanksInfo(); thanksFresh(); });
        T('今日のおすすめ（理由つき）', () => { RECO_CACHE = null; CHANCE_CACHE = null; buildPicks(); });
        T('会衆の目標', () => { coverStats(); monthMet(); });
        T('ふり返り', () => { myStats(); });
        const tb = document.querySelector('#sheet table.slots');
        if (!tb) return;
        const mark = ms => (ms < 0 ? '×（エラー）' : ms < 100 ? '◎ 速い' : ms < 300 ? '○ ふつう' : ms < 1000 ? '△ 少し待つ' : '× 重い');
        tb.insertAdjacentHTML('beforeend', rows.map(([n, ms]) => `<tr><th style="text-align:left">${esc(n)}</th><td>${ms < 0 ? '—' : Math.round(ms) + 'ms'}</td><td>${mark(ms)}</td></tr>`).join(''));
      } catch (e) { console.error(e); }
    };
  }

  /* 更新のお知らせ（CHANGELOG）は index.html に書いてある */

  if (Store.data) { try { syncPaperDone(); renderHome(); } catch (e) { console.error(e); } }
})();
