/* =========================================================
   schedule.js  区域マップ 追加機能（第1弾・第2弾）
   第1弾
   ・係の画面「状況」に「期限の見張り」を出す（1区域は返却の目安まで・全区域は1年）
   ・「区域をもらう」一覧に「おすすめ順」を加え、はじめの並び順にする
   第2弾
   ・若い世代の優先度（弱・中・強）／留守宅を終える回数（手紙の候補）／夜を提案に入れるか／訪問を控える日
   ・区域ごとの調整（若い世代の割合の手直し・留守宅を終える回数）／区域の大きさの見直し候補
   地域のようす
   ・区域・留守宅カードに、地域のタイプ（子育て世代型など）・20〜49歳の割合と市内の順位・区域のおよその人数を出す
   ・押すと、年代の割合・子どもの内訳・会いやすい時間・訪問の準備のヒントを出す（統計からの予想）
   使い方：index.html の </body> の直前に、次の1行を足すだけ
     <script src="schedule.js"></script>
   第2弾の決めを保存するには、サーバー（Code.gs）の設定の部分に youngW・awayTries・nightOn・offDays を足します。
   年齢データの自動取り込みは、サーバーの AgeAuto.gs が行います。
   計算は、スマホに読み込みずみの区域・家・記録・S-13 から行います（通信は増えません）。
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof renderAdmin !== 'function') return;

  const YEAR = 365;                           // 全区域を回る期間（日）
  const PIN_DAYS = 60;                        // 期限までこの日数を切った区域は、一覧のいちばん上に出す
  const W_DUE = 60, W_AWAY = 15;              // おすすめ順の点数の配分（若い世代の点数は、係が「弱・中・強」で決める）
  const YW = [[10, '弱'], [25, '中'], [40, '強']];
  const num = (v, d) => (v === undefined || v === null || v === '' || !isFinite(Number(v)) ? d : Number(v));
  const wYoung = () => Math.max(0, Math.min(40, num(D().settings.youngW, 25)));
  /* 留守宅を終える回数：違う時間帯でこの回数留守だった家は、留守宅カードに入れず「手紙の候補」にする（区域ごとにも決められる） */
  const triesAll = () => Math.max(2, Math.min(10, num(D().settings.awayTries, 3)));
  const triesFor = t => (t && t.awayTries != null && isFinite(Number(t.awayTries)) ? Math.max(2, Math.min(10, Number(t.awayTries))) : triesAll());
  const nightOn = () => num(D().settings.nightOn, 0) === 1;
  /* 訪問を控える日（区域係が決める）。過ぎた日は、次に保存するときに消える */
  const offDays = () => (Array.isArray(D().settings.offDays) ? D().settings.offDays : []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  const offToday = () => offDays().includes(ymd(new Date()));
  const fixOf = t => (t && t.youngFix != null && t.youngFix !== '' && isFinite(Number(t.youngFix)) ? Math.max(0, Math.min(100, Math.round(Number(t.youngFix)))) : null);
  const EVE = ['平日・夕方', '土日・朝', '土日・昼', '土日・午後', '土日・夕方'];
  const ST = {
    over: ['#B71C1C', '#FFEBEE', '期限超過'],
    warn: ['#C2410C', '#FFF1E8', '要注意'],
    soon: ['#8A6D00', '#FFF8E1', 'そろそろ'],
    ok: ['#2E7D32', '#E8F5E9', '余裕あり'],
    none: ['#546E7A', '#ECEFF1', '記録なし']
  };
  const RANK = { over: 0, warn: 1, soon: 2, ok: 3, none: 4 };

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `.duechip{display:inline-block;border-radius:8px;padding:0 8px;font-weight:700;font-size:14px;border:1.5px solid;white-space:nowrap}
.duepin{display:inline-block;background:#B71C1C;color:#fff;border-radius:6px;padding:0 6px;font-size:13px;font-weight:700;margin-right:4px}
.duemeet{display:inline-block;background:var(--terr-soft);color:var(--terr);border-radius:6px;padding:0 6px;font-size:13px;font-weight:700}
.duetbl th,.duetbl td{text-align:left;vertical-align:middle}
.duetbl td.num{text-align:right;white-space:nowrap}
.duerow{background:#fff;border:2px solid var(--line);border-left-width:10px;border-radius:12px;padding:10px 12px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center}
.duerow p{margin:0}
.duebtns{display:flex;flex-direction:column;gap:6px}
.dueset{border:2px solid var(--line);border-radius:12px;padding:4px 12px;margin:8px 0 12px;background:#fff}
.dueset summary{font-weight:700;padding:8px 0;cursor:pointer}
.offlist{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.offlist button{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:4px 10px;font-size:15px}
.dueadd{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dueadd input{font-size:17px;padding:6px 8px;border:2px solid var(--line);border-radius:8px}`;
  document.head.appendChild(css);

  /* ---------- 計算の結果を少しのあいだ覚えておく（記録が届いて索引を作り直したら消す） ---------- */
  const MEMO = new Map();
  let memoAt = 0;
  const memo = (key, fn) => {
    if (Date.now() - memoAt > 60000) { MEMO.clear(); memoAt = Date.now(); }
    if (!MEMO.has(key)) MEMO.set(key, fn());
    return MEMO.get(key);
  };
  const _buildIndex = window.buildIndex;
  window.buildIndex = function () { MEMO.clear(); return _buildIndex.apply(this, arguments); };

  /* ---------- 日付 ---------- */
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const daysFrom = s => Math.floor((Date.now() - parseYmd(s).getTime()) / DAY);
  const showDay = s => (s ? fmtDay(parseYmd(s).toISOString()) : '—');

  /* ---------- 区域ごとの期限 ---------- */
  const eligible = () => D().territories.filter(t => !t.dummy && !isSpecial(t));
  /* 前回回り終えた日：アプリの記録と、S-13に転記した紙の記録のうち新しいほう */
  function lastDone(t) {
    const c = [];
    if (t.completedAt) c.push(dstr(t.completedAt));
    (D().s13 || []).forEach(x => { if (x && x.terrId === t.id && x.c) c.push(String(x.c)); });
    return c.filter(Boolean).sort().pop() || '';
  }
  function dueInfo(t) {
    return memo('d' + t.id, () => {
      const last = lastDone(t), left = last ? YEAR - daysFrom(last) : null;
      const st = left == null ? 'none' : left < 0 ? 'over' : left <= PIN_DAYS ? 'warn' : left <= 120 ? 'soon' : 'ok';
      return { t, last, left, st, deadline: last ? addDays(last, YEAR) : '', startBy: last ? addDays(last, YEAR - lendDays()) : '' };
    });
  }
  /* 前回会えなかった家の割合（訪ねたことのある家のうち、まだ一度も会えていない家） */
  function awayRate(t) {
    return memo('a' + t.id, () => {
      let n = 0, un = 0;
      housesOf(t.id).forEach(h => targets(h).forEach(u => {
        const k = K(h.id, u), s = sum(k);
        if (!s.n || D().dnc[k]) return;
        n++; if (s.unmet) un++;
      }));
      return n ? un / n : 0;
    });
  }
  const youngPct = t => memo('y' + t.id, () => { const y = youngShare(t); return y && y.pct != null ? y.pct : null; });
  /* 会いやすい時間帯の目安（年齢データと記録から。既存の meetChance を使う） */
  function meetLabel(t) {
    return memo('m' + t.id, () => {
      if (typeof meetChance !== 'function' || typeof DAY_SLOTS === 'undefined') return '';
      const avg = list => list.reduce((a, s) => a + meetChance(t, s).p, 0) / list.length;
      const day = avg(DAY_SLOTS), eve = avg(EVE);
      return eve > day * 1.15 ? '夕方・土日向き' : day > eve * 1.15 ? '平日の昼も会いやすい' : '';
    });
  }
  /* おすすめ順：期限の近さ60点＋若い世代の多さ25点＋会えなかった家の多さ15点。期限まで60日以内は最上部 */
  function scoreList(ts) {
    const info = ts.map(t => ({ t, d: dueInfo(t), y: youngPct(t), a: awayRate(t) }));
    const ys = info.map(x => x.y).filter(v => v != null);
    const rank = v => (v == null || !ys.length ? 0.5 : (ys.filter(x => x < v).length + ys.filter(x => x === v).length / 2) / ys.length);
    info.forEach(x => {
      const dueP = x.d.last ? Math.min(1, Math.max(0, daysFrom(x.d.last) / YEAR)) : 1;
      x.sc = Math.round(dueP * W_DUE + rank(x.y) * wYoung() + x.a * W_AWAY);
      x.pin = x.d.left != null && x.d.left <= PIN_DAYS;
    });
    return info.sort((p, q) => (q.pin - p.pin) || (p.pin ? p.d.left - q.d.left : 0) || (q.sc - p.sc) || cmpNo(p.t.no, q.t.no));
  }
  /* 貸出中の区域の進み具合（返却の目安に対して） */
  function paceOf(t) {
    if (!t.holder || !t.lentAt) return null;
    const r = roundInfo(t.id, true);
    if (!r) return null;
    const el = daysSince(t.lentAt) / lendDays();
    const prog = r.phase === 'first' ? Math.round(r.pct1 * 0.8) : Math.round(80 + r.aw.pct * 0.2);
    let msg = '';
    if (el >= 1) msg = '返却の目安を過ぎています';
    else if (el >= 0.5 && prog < el * 100 * 0.6) msg = '進み具合が遅れています';
    return { t, el, prog, msg, phase: r.phase };
  }
  function monthStats() {
    const ts = eligible(), now = new Date(), today = ymd(now), ym = ymOf(now);
    const endM = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const ds = ts.map(dueInfo);
    const need = ds.filter(d => !d.t.holder && !d.t.awayPoolAt && d.last && d.startBy <= endM).sort((a, b) => a.left - b.left);
    const given = new Set();
    ts.forEach(t => { if (t.lentAt && dstr(t.lentAt).startsWith(ym)) given.add(t.id + dstr(t.lentAt)); });
    (D().returns || []).forEach(r => { if (r.lentAt && dstr(r.lentAt).startsWith(ym)) given.add(r.terrId + dstr(r.lentAt)); });
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ ym: ymOf(d), label: `${d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '年' : ''}${d.getMonth() + 1}月`, list: [] });
    }
    ds.forEach(d => {
      if (!d.deadline || d.deadline < today) return;
      const m = months.find(x => x.ym === d.deadline.slice(0, 7));
      if (m) m.list.push(d);
    });
    return { ts, ds, need, given: given.size, avg: Math.ceil(ts.length / 12), months,
      over: ds.filter(d => d.st === 'over'), warn: ds.filter(d => d.st === 'warn'), none: ds.filter(d => d.st === 'none') };
  }

  /* 区域の大きさの見直し候補：これまで回り終えるのに、返却の目安より長くかかっている区域（直近3回の平均） */
  function sizeCheck() {
    const by = new Map();
    (D().returns || []).forEach(r => {
      if (!r || !r.completed || !r.lentAt || !r.at) return;
      const d = Math.round((Date.parse(r.at) - Date.parse(r.lentAt)) / DAY);
      if (!(d >= 0)) return;
      if (!by.has(r.terrId)) by.set(r.terrId, []);
      by.get(r.terrId).push({ at: String(r.at), d });
    });
    const ld = lendDays(), out = [];
    eligible().forEach(t => {
      const a = (by.get(t.id) || []).sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, 3);
      if (!a.length) return;
      const avg = Math.round(a.reduce((s, x) => s + x.d, 0) / a.length);
      if (avg > ld) out.push({ t, avg, n: a.length, homes: terrStats(t, 0).n });
    });
    return out.sort((a, b) => b.avg - a.avg);
  }

  /* ---------- 若い世代の割合の手直し（区域係が区域ごとに決めた数を優先する） ---------- */
  const _youngShare = window.youngShare;
  window.youngShare = function (t) {
    const f = fixOf(t);
    if (f != null) return { pct: f, manual: true, n: 0, y: 0 };
    const p = prof(t); // 市の年齢データ（20〜49歳。古いデータは20〜39歳）
    return p ? { city: true, pct: Math.round(p.tv), lbl: p.tl } : _youngShare.apply(this, arguments);
  };
  /* 会える見込み：年齢データがある区域は、手直しした割合で若い世代を置きかえる（ほかの年代は元の比で残りを分ける） */
  if (typeof terrMix === 'function') {
    const _terrMix = window.terrMix;
    window.terrMix = function (t) {
      const mx = _terrMix.apply(this, arguments), f = fixOf(t);
      if (!mx || f == null) return mx;
      const y = f / 100, rest = (mx.m + mx.o) || 1;
      return Object.assign({}, mx, { y, m: (1 - y) * mx.m / rest, o: (1 - y) * mx.o / rest });
    };
  }

  /* ---------- 留守宅を終える回数（手紙の候補） ---------- */
  if (typeof unmetIndex === 'function') {
    const _unmetIndex = window.unmetIndex;
    window.unmetIndex = function () {
      const m = _unmetIndex.apply(this, arguments);
      m.forEach((items, tid) => {
        const n = triesFor(TID.get(tid));
        items.forEach(x => { if (!x.hard && slotCount(x.tried) >= n) { x.hard = true; x.letter = true; } });
      });
      return m;
    };
  }
  if (typeof renderAwayAdmin === 'function') {
    const _renderAwayAdmin = window.renderAwayAdmin;
    window.renderAwayAdmin = function () {
      _renderAwayAdmin.apply(this, arguments);
      try { paintLetters(); } catch (e) { console.error(e); }
    };
  }
  function paintLetters() {
    const box = document.getElementById('adHard');
    if (!box) return;
    const head = box.previousElementSibling && box.previousElementSibling.previousElementSibling;
    if (head && head.tagName === 'H3') head.textContent = '手紙の候補（違う時間帯で何度も留守だった家）';
    const hard = [...unmetIndex().values()].flat().filter(x => x.hard)
      .sort((a, b) => slotCount(b.tried) - slotCount(a.tried) || (a.first < b.first ? -1 : 1));
    box.innerHTML = `<p class="hint">違う時間帯で${triesAll()}回（区域ごとに変えたときは、その回数）留守だった家は、留守宅カードに入れません。ふだんの区域カードでは、これまでどおり訪ねます。</p>` +
      (hard.length ? hard.slice(0, 30).map(x => {
        const t = TID.get(x.h.terrId);
        return `<article class="ritem k-new"><div>
          <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> ${targetName(x.h, x.u)}</p>
          <p class="muted">留守 ${visitsOf(x.k).length}回・試した時間帯 ${slotCount(x.tried)}つ（${slotList(x.tried).map(slotShort).join('、')}）</p>
        </div><button class="btn small" data-go="${x.h.id}" data-unit="${esc(x.u)}">地図で見る</button></article>`;
      }).join('') + (hard.length > 30 ? `<p class="muted">ほか ${hard.length - 30}件</p>` : '')
        : '<div class="empty">今はありません。</div>');
  }
  /* 留守宅を回る段階の案内：夜は、係が「入れる」にしたときだけ提案する */
  if (typeof awayAdvice === 'function') {
    window.awayAdvice = function (r) {
      const tried = slotList(r.aw.slots);
      const untried = SLOTS.filter(x => !tried.includes(x) && (nightOn() || !x.endsWith('・夜')));
      const triedDay = new Set(tried.map(x => x.split('・')[0]));
      const pick = untried.filter(x => !triedDay.has(x.split('・')[0])).concat(untried.filter(x => triedDay.has(x.split('・')[0]))).slice(0, 3);
      return `<p class="muted">1回目に留守だった時間帯：<b>${tried.length ? tried.map(slotShort).join('、') : '記録なし'}</b></p>` +
        (pick.length ? `<p class="muted">まだ訪ねていない時間帯：<b>${pick.map(slotShort).join('、')}</b> など</p>` : '') +
        (offToday() ? '<p class="tag-warn">今日は、区域係が「訪問を控える日」にしています。</p>' : '') +
        '<p class="hint">ふつうは別の日に訪ねます。できれば1週間以内に、最初とは違う曜日・違う時間帯に訪ねると効果的です。</p>';
    };
  }

  /* ---------- 訪問を控える日：おすすめと留守宅カードの提案を止める ---------- */
  const OFF_NOTE = '<div class="notice warn">今日は、区域係が「訪問を控える日」にしています。おすすめと留守宅カードの提案はお休みです。</div>';
  if (typeof awaySuggestions === 'function') {
    const _awaySuggestions = window.awaySuggestions;
    window.awaySuggestions = function () { return offToday() ? [] : _awaySuggestions.apply(this, arguments); };
  }
  if (typeof computeHomeReco === 'function') {
    const _computeHomeReco = window.computeHomeReco;
    window.computeHomeReco = function () { return offToday() ? { list: [], needPos: false } : _computeHomeReco.apply(this, arguments); };
  }
  if (typeof homeRecoHtml === 'function') {
    const _homeRecoHtml = window.homeRecoHtml;
    window.homeRecoHtml = function () {
      if (!offToday()) return _homeRecoHtml.apply(this, arguments);
      lastReco = [];
      return recoOn() ? `<h2 class="sec">空いた時間に、おすすめ</h2>${OFF_NOTE}` : '';
    };
  }
  /* 留守宅カードの一覧（renderAwaySuggest・openAwayPick）は、下の「地域のようす」で作り直しています */

  /* ---------- 表示の部品 ---------- */
  const chip = st => `<span class="duechip" style="color:${ST[st][0]};background:${ST[st][1]};border-color:${ST[st][0]}">${ST[st][2]}</span>`;
  const leftTxt = d => (d.left == null ? '前回の記録なし' : d.left < 0 ? `期限を${-d.left}日 過ぎています` : `期限まであと${d.left}日`);
  const meetTag = t => { const ml = meetLabel(t); return ml ? ` <span class="duemeet">${ml}</span>` : ''; };
  const dueRow = d => {
    const t = d.t;
    return `<div class="duerow" style="border-left-color:${ST[d.st][0]}"><div>
      <p>${chip(d.st)} <b>区域${esc(t.no)}</b> ${esc(t.name || '')}</p>
      <p class="muted">前回回り終えた日 ${showDay(d.last)}・期限 ${d.deadline ? showDay(d.deadline) : '—'}（${leftTxt(d)}）</p>
      <p class="muted">${t.holder ? `貸出中：${esc(uname(t.holder))}さん（返却の目安 ${fmtDay(dueOf(t))}）` : t.awayPoolAt ? '留守宅カードで回っています' : '空いています'}${meetTag(t)}</p>
      ${adjTag(t)}
    </div><div class="duebtns"><button class="btn small" data-open="${t.id}">地図</button><button class="btn small" data-dueadj="${t.id}">調整</button></div></div>`;
  };
  const adjTag = t => {
    const a = [];
    if (fixOf(t) != null) a.push(`若い世代 ${fixOf(t)}%（手直し）`);
    if (t.awayTries != null) a.push(`留守宅は${triesFor(t)}回まで`);
    return a.length ? `<p class="muted">この区域だけの決め：${a.join('・')}</p>` : '';
  };

  /* ---------- 係の画面「状況」：期限の見張り ---------- */
  function paintDue() {
    const pane = document.querySelector('[data-apane="status"]');
    if (!pane) return;
    let box = document.getElementById('adDue');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adDue';
      const anchor = document.getElementById('adTiles');
      pane.insertBefore(box, anchor && anchor.previousElementSibling ? anchor.previousElementSibling : pane.firstChild);
      box.addEventListener('click', dueClick);
    }
    const m = monthStats(), ld = lendDays();
    const paces = m.ts.filter(t => t.holder).map(paceOf).filter(p => p && p.msg).sort((a, b) => b.el - a.el);
    const maxN = Math.max(1, ...m.months.map(x => x.list.length));
    const peak = m.months.filter(x => x.list.length >= Math.max(3, Math.ceil(m.avg * 1.5)));
    const order = m.ds.slice().sort((a, b) => RANK[a.st] - RANK[b.st] ||
      (a.left == null ? 1 : b.left == null ? -1 : a.left - b.left) || cmpNo(a.t.no, b.t.no));
    const SHOW = 8, sizes = sizeCheck();
    box.innerHTML = `<h2 class="sec">期限の見張り</h2>
      <p class="hint">1区域は留守宅も含めて返却の目安（${ld}日）以内、全区域は前回回り終えた日から1年以内に回る、という原則で計算しています。
        前回回り終えた日は、アプリの記録とS-13に転記した紙の記録のうち、新しいほうを使います。</p>
      ${setHtml()}
      <div class="tiles">
        <div class="tile${m.over.length ? ' alert' : ''}"><b>${m.over.length}</b>1年の期限を過ぎた区域</div>
        <div class="tile${m.warn.length ? ' alert' : ''}"><b>${m.warn.length}</b>期限まで${PIN_DAYS}日以内</div>
        <div class="tile${m.need.length ? ' alert' : ''}"><b>${m.need.length}</b>今月中に出したい区域<br><small>出さないと期限に間に合わない</small></div>
        <div class="tile"><b>${m.given}</b>今月出した区域<br><small>目安は毎月 約${m.avg}区域</small></div>
        <div class="tile${paces.length ? ' alert' : ''}"><b>${paces.length}</b>声かけ候補（貸出中）</div>
        ${m.none.length ? `<div class="tile"><b>${m.none.length}</b>前回の記録なし</div>` : ''}
      </div>
      ${m.need.length ? `<h3 class="sub">今月中に出したい区域</h3>
        <p class="hint">返却の目安（${ld}日）を考えると、今月中に貸し出さないと1年の期限に間に合わない区域です。急ぐ順です。</p>
        ${m.need.map(dueRow).join('')}` : ''}
      ${paces.length ? `<h3 class="sub">声かけ候補（貸出中）</h3>
        <p class="hint">受け取ってからの日数のわりに、進み具合が遅い区域です。本人に自動で知らせることはしません。必要なときは、区域係から声をかけてください。</p>
        ${paces.map(p => `<div class="duerow" style="border-left-color:${ST.warn[0]}"><div>
          <p><b>区域${esc(p.t.no)}</b> ${esc(p.t.name || '')}</p>
          <p class="muted">${esc(uname(p.t.holder))}さん・受け取ってから${daysSince(p.t.lentAt)}日・進み具合 約${p.prog}%${p.phase === 'away' ? '（留守宅を回る段階）' : ''}</p>
          <p class="tag-warn">${p.msg}</p></div><button class="btn small" data-open="${p.t.id}">地図</button></div>`).join('')}` : ''}
      <h3 class="sub">これから12か月の期限</h3>
      <p class="hint">その月に1年の期限をむかえる区域の数です。数が多い月の区域は、前の月に早めに出すと、翌年の山も平らになります。</p>
      <div class="scroll"><table class="slots narrow duetbl"><tr><th>月</th><th>区域</th><th style="width:55%"></th></tr>
        ${m.months.map(x => `<tr><th>${x.label}</th><td class="num"><b>${x.list.length}</b></td>
          <td><div class="bar"><i style="width:${Math.round(x.list.length / maxN * 100)}%"></i></div>${x.list.length ? `<small class="muted">${x.list.map(d => esc(d.t.no)).join('・')}</small>` : ''}</td></tr>`).join('')}</table></div>
      ${peak.length ? `<div class="notice warn">${peak.map(x => {
        const fr = x.list.filter(d => !d.t.holder).map(d => esc(d.t.no));
        return `<b>${x.label}</b>に期限が${x.list.length}区域集まっています${fr.length ? `（空いている区域：${fr.join('・')}）` : ''}`;
      }).join('<br>')}<br>前の月に早めに出すと、分散できます。</div>` : ''}
      ${sizes.length ? `<h3 class="sub">区域の大きさの見直し候補</h3>
        <p class="hint">これまで回り終えるのに、返却の目安（${ld}日）より長くかかっている区域です（直近3回までの平均）。区域を分けるかどうかを検討してください。</p>
        ${sizes.map(s => `<div class="duerow" style="border-left-color:${ST.soon[0]}"><div>
          <p><b>区域${esc(s.t.no)}</b> ${esc(s.t.name || '')}</p>
          <p class="muted">回り終えるまで平均${s.avg}日（${s.n}回の平均）・${s.homes}軒・部屋</p></div>
          <button class="btn small" data-open="${s.t.id}">地図</button></div>`).join('')}` : ''}
      <h3 class="sub">区域ごとの期限（急ぐ順）</h3>
      ${m.none.length ? `<p class="hint">「前回の記録なし」の区域は、S-13に紙の記録（前回完了した日付）を転記すると期限が出ます。
        <button type="button" class="btn small" data-dues13>S-13を開く</button></p>` : ''}
      ${order.slice(0, SHOW).map(dueRow).join('')}
      ${order.length > SHOW ? `<details class="more"><summary>ほかの区域を見る（${order.length - SHOW}）</summary>${order.slice(SHOW).map(dueRow).join('')}</details>` : ''}`;
  }
  /* 区域係の決め（おすすめ順・留守宅・訪問を控える日）。開いているかどうかを覚えておく */
  let setOpen = false;
  function setHtml() {
    const yw = wYoung(), yl = (YW.find(x => x[0] === yw) || [0, yw + '点'])[1], offs = offDays().filter(x => x >= ymd(new Date()));
    const seg = (key, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) =>
      `<button type="button" data-sset="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
    return `<details class="dueset"${setOpen ? ' open' : ''}><summary>区域係の決め（若い世代 ${yl}・留守宅は${triesAll()}回まで・控える日 ${offs.length}日）</summary>
      <div class="setrow"><span>おすすめ順で、若い世代の多い区域をどれだけ前に出すか<br><small class="hint">夏休み・年末年始・連休など、若い世代が家にいやすい時期は「強」にします。どれにしても、期限の近い区域がいちばん前です</small></span>
        ${seg('youngW', YW, yw)}</div>
      <div class="setrow"><span>留守宅を終える回数<br><small class="hint">違う時間帯でこの回数留守だった家は、留守宅カードに入れず「手紙の候補」にします（留守宅の画面に出ます）。区域ごとにも変えられます（各区域の「調整」）</small></span>
        <div class="stepper"><button type="button" data-dueset="awayTries" data-d="-1" aria-label="減らす">−</button><output class="wide">${triesAll()}回</output>
        <button type="button" data-dueset="awayTries" data-d="1" aria-label="増やす">＋</button></div></div>
      <div class="setrow"><span>夜（19時〜）も、留守宅を訪ねる時間帯として提案する</span>
        ${seg('nightOn', [[1, '提案する'], [0, '提案しない']], nightOn() ? 1 : 0)}</div>
      <div class="setrow" style="display:block"><span>訪問を控える日<br><small class="hint">この日は、全員の画面で「おすすめ」と「留守宅カード」の提案を止めます（地域の行事の日など）</small></span>
        <div class="offlist">${offs.map(x => `<button type="button" data-offdel="${x}" aria-label="${showDay(x)}を消す">${showDay(x)}（${'日月火水木金土'[parseYmd(x).getDay()]}） ×</button>`).join('') || '<span class="muted">登録はありません</span>'}</div>
        <div class="dueadd"><input type="date" id="dueOffIn" min="${ymd(new Date())}" aria-label="訪問を控える日"><button type="button" class="btn small" data-offadd>追加する</button></div></div>
    </details>`;
  }
  const saveSet = (fn, msg) => { fn(D().settings); Store.save(); renderAll(); toast(msg || '設定を変えました'); };
  function dueClick(e) {
    const q = s => e.target.closest(s);
    let x;
    if (q('[data-dues13]')) openS13();
    else if ((x = q('[data-dueset]'))) saveSet(s => { s.awayTries = Math.max(2, Math.min(10, triesAll() + Number(x.dataset.d))); });
    else if ((x = q('[data-offdel]'))) { const v = x.dataset.offdel; saveSet(s => { s.offDays = offDays().filter(d => d !== v && d >= ymd(new Date())); }, '訪問を控える日を消しました'); }
    else if (q('[data-offadd]')) {
      const v = ($('#dueOffIn') || {}).value || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('日付をえらんでください'); return; }
      if (v < ymd(new Date())) { toast('今日より前の日は登録できません'); return; }
      const cur = offDays().filter(d => d >= ymd(new Date()));
      if (cur.includes(v)) { toast('その日は登録ずみです'); return; }
      if (cur.length >= 30) { toast('登録できるのは30日までです'); return; }
      saveSet(s => { s.offDays = cur.concat(v).sort(); }, '訪問を控える日を登録しました');
    }
    else if ((x = q('[data-dueadj]'))) openAdj(x.dataset.dueadj);
  }
  /* 区域ごとの調整：若い世代の割合の手直し・留守宅を終える回数 */
  function openAdj(tid) {
    const t = TID.get(tid); if (!t) return;
    const p0 = prof(t), orig = p0 ? { pct: Math.round(p0.tv), city: true, lbl: p0.tl } : _youngShare(t), f = fixOf(t);
    let tries = t.awayTries != null ? triesFor(t) : null;
    const paint = () => {
      setSheet(headHtml(t, `区域${esc(t.no)}の調整`, esc(t.name || '')) + `
        <p class="q">若い世代の割合</p>
        <p class="muted">今の数字：${orig.pct != null ? `${orig.pct}%（${orig.city ? `市の年齢データ・${orig.lbl || '20〜39歳'}` : `会えた記録 ${orig.n}件から`}）` : 'データがありません'}</p>
        <p class="hint">大きな団地が一か所だけあるなど、実際とずれているときに、区域係が直します。「おすすめ順」と「会える見込み」に使います。</p>
        <div class="dueadd"><input type="number" id="adjYoung" min="0" max="100" step="1" inputmode="numeric" value="${f != null ? f : ''}" placeholder="例：35" style="width:7em"> %
          <button type="button" class="btn small primary" id="adjYoungSave">この数字にする</button>
          ${f != null ? '<button type="button" class="btn small" id="adjYoungClear">手直しをやめる</button>' : ''}</div>
        <p class="q">留守宅を終える回数</p>
        <p class="hint">違う時間帯でこの回数留守だった家は、留守宅カードに入れず「手紙の候補」にします。単身向けのアパートが多い区域などは、回数を増やします。</p>
        <div class="setrow"><span>${tries == null ? `全体の決め（${triesAll()}回）に合わせる` : `この区域は${tries}回まで`}</span>
          <div class="stepper"><button type="button" data-adjt="-1" aria-label="減らす">−</button><output class="wide">${tries == null ? triesAll() : tries}回</output>
          <button type="button" data-adjt="1" aria-label="増やす">＋</button></div></div>
        ${tries != null ? '<button type="button" class="btn small" id="adjTriesAll">全体の決めに合わせる</button>' : ''}
        <button class="btn block primary" id="adjTriesSave"${(tries == null ? null : tries) === (t.awayTries != null ? triesFor(t) : null) ? ' disabled' : ''}>回数を保存する</button>
        <button class="btn block" data-close>もどる</button>`);
      const S = $('#sheet');
      $$('[data-adjt]', S).forEach(b => b.onclick = () => { tries = Math.max(2, Math.min(10, (tries == null ? triesAll() : tries) + Number(b.dataset.adjt))); paint(); });
      if ($('#adjTriesAll')) $('#adjTriesAll').onclick = () => { tries = null; paint(); };
      $('#adjTriesSave').onclick = () => {
        closeSheet();
        commit(`区域${t.no}の留守宅を終える回数を${tries == null ? '全体の決めに合わせました' : `${tries}回にしました`}`, () => {
          if (tries == null) delete t.awayTries; else t.awayTries = tries;
        });
      };
      $('#adjYoungSave').onclick = () => {
        const raw = $('#adjYoung').value.trim(), v = Number(raw);
        if (raw === '' || !isFinite(v) || v < 0 || v > 100) { toast('0〜100の数字を入れてください'); return; }
        closeSheet();
        commit(`区域${t.no}の若い世代の割合を${Math.round(v)}%にしました`, () => { t.youngFix = Math.round(v); });
      };
      if ($('#adjYoungClear')) $('#adjYoungClear').onclick = () => {
        closeSheet();
        commit(`区域${t.no}の若い世代の割合の手直しをやめました`, () => { delete t.youngFix; });
      };
    };
    paint();
  }

  const _renderAdmin = window.renderAdmin;
  window.renderAdmin = function () {
    _renderAdmin.apply(this, arguments);
    try {
      if (isAdmin() && adPane === 'status') {
        paintDue();
        const d = document.querySelector('#adDue details.dueset');
        if (d) d.addEventListener('toggle', () => { setOpen = d.open; });
      }
    } catch (e) { console.error(e); }
  };

  /* ---------- 「区域をもらう」一覧：おすすめ順を加える ---------- */
  reqSort = 'reco';
  window.openRequestSheet = function (g) {
    if (g !== undefined) reqForGroup = !!g;
    if (!canGroupTerr()) reqForGroup = false;
    const G = reqForGroup, canTake = canTakeFree(G), free = freeTerrs();
    if (reqSort === 'near' && !myPos) reqSort = 'reco';
    const sx = new Map(scoreList(free).map((x, i) => [x.t.id, Object.assign(x, { order: i })]));
    const list = free.map(t => ({ t, last: [t.completedAt, t.returnedAt].filter(Boolean).sort().pop() || '', n: terrStats(t, 0).n,
      dist: myPos ? distM(myPos, center(t.polygon)) : null, yg: reqSort === 'young' ? youngShare(t) : null, sx: sx.get(t.id) }));
    const SORTS = { reco: (a, b) => a.sx.order - b.sx.order, near: (a, b) => a.dist - b.dist, long: byLongest, many: (a, b) => b.n - a.n,
      young: (a, b) => ((b.yg.pct == null ? -1 : b.yg.pct) - (a.yg.pct == null ? -1 : a.yg.pct)) || byLongest(a, b) };
    list.sort(SORTS[reqSort] || SORTS.reco);
    const recoLine = x => `<p class="muted">${x.sx.pin ? '<span class="duepin">急ぎ</span>' : ''}${chip(x.sx.d.st)} ${leftTxt(x.sx.d)}${meetTag(x.t)}</p>`;
    const rows = list.map(x => { const { t, last, n, dist, yg } = x; return `<article class="pick">
        <span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span>
        <div><b>${esc(t.name)}</b>
          ${reqSort === 'reco' ? recoLine(x) : ''}
          <p class="muted">${n}軒・部屋　${last ? `前回返却した日 ${fmtDay(last)}` : 'まだ回ったことがない区域'}${dist != null ? `　ここから約${fmtDist(dist)}` : ''}</p>${yg && yg.pct != null && !yg.city ? `<p class="muted">${yg.manual ? `若い世代 ${yg.pct}%（区域係が手直し）` : yg.city ? '' : `若い世代 ${yg.pct}%（会えた記録 ${yg.n}件から）`}</p>` : ''}${profLine(t, 'req')}</div>
        ${isFree(t) && canTake
          ? `<button class="btn small primary" data-take="${t.id}">受け取る</button>`
          : `<button class="btn small" data-ask="${t.id}">係に頼む</button>`}
      </article>`; }).join('');
    setSheet(headHtml(null, G ? `${esc(myGroup())}グループの区域をもらう` : (canGroupTerr() ? '個人の区域をもらう' : '区域カードをもう1枚'),
        `持てるのは${holdMax(G)}枚まで（今 ${heldOf(G)}枚・申し込み中 ${pendingOf(G).length}件）`) + `
      ${G ? `<div class="seg" role="group" aria-label="もらうカード"><button type="button" aria-pressed="true">区域カード</button><button type="button" data-gaway aria-pressed="false">留守宅カード</button></div>
        <p class="hint">グループの区域は、奉仕の集まりで使います。受け取ったら「今日回る人をえらぶ」で、回る人を決められます。</p>` : ''}
      <p class="hint">「受け取る」の区域は、すぐにあなたのカードになります。<br>「係に頼む」の区域は、係が決めてから届きます。</p>
      ${!canTake && list.some(x => isFree(x.t)) ? `<div class="notice warn">この区域は自分では受け取れません（${G ? '' : `自分で受け取れるのは${D().settings.selfTakeMax}枚まで・`}上限に届いています）。係に頼むことはできます。</div>` : ''}
      <p class="q">並べ方</p>
      <div class="sortchips" role="group" aria-label="並べ方">
        <button type="button" class="chip" data-rsort="reco" aria-pressed="${reqSort === 'reco'}">おすすめ順</button>
        <button type="button" class="chip" data-rsort="near" aria-pressed="${reqSort === 'near'}">近い順</button>
        <button type="button" class="chip" data-rsort="long" aria-pressed="${reqSort === 'long'}">返却から長い順</button>
        <button type="button" class="chip" data-rsort="young" aria-pressed="${reqSort === 'young'}">若い世代が多い順</button>
        <button type="button" class="chip" data-rsort="many" aria-pressed="${reqSort === 'many'}">家が多い順</button></div>
      ${reqSort === 'reco' ? `<p class="hint">期限の近さ（いちばん重く見ます）・若い世代の多さ・前回会えなかった家の多さから並べています。期限まで${PIN_DAYS}日を切った区域は、いちばん上に出します。</p>` : ''}
      ${reqSort === 'near' ? '<div class="row"><button class="btn small" id="reqNear">現在地を更新する</button></div>' : ''}
      ${reqSort === 'young' ? `<p class="hint">${AGE_ON && ageMap() ? '市の年齢データ（字ごとの20〜49歳の割合）から出しています。字が決まっていない区域は、「会えた」記録の年代から出します。' : '市の年齢データが入っていないので、これまでに「会えた」と記録したときの年代から出した目安です。'}</p>` : ''}
      ${rows || '<div class="empty">今、空いている区域はありません。</div>'}
      <button class="btn block primary" data-ask="">どこでもよいので係に頼む</button>
      <button class="btn block" data-close>もどる</button>`);
    const S = $('#sheet');
    if ($('#reqNear')) $('#reqNear').onclick = () => locate(window.openRequestSheet);
    $$('[data-rsort]', S).forEach(x => x.onclick = () => {
      reqSort = x.dataset.rsort;
      if (reqSort === 'near' && !myPos) { locate(window.openRequestSheet); return; }
      window.openRequestSheet();
    });
    if ($('[data-gaway]', S)) $('[data-gaway]', S).onclick = () => openAwayPick(true);
    $$('[data-take]', S).forEach(x => x.onclick = () => takeTerr(x.dataset.take));
    $$('[data-ask]', S).forEach(x => x.onclick = () => askTerr(x.dataset.ask || null));
  };

  /* =========================================================
     地域のようす（市の年齢データから）
     ・区域の年代の割合（子ども・20〜49歳・65歳以上）、市内での順位、区域のおよその人数
     ・地域のタイプ（子育て世代型など）と、会いやすい時間・訪問の準備のヒント
     ・すべて字ごとの統計からの一般的な予想。家ごとの年代は出さない
     ========================================================= */
  const css2 = document.createElement('style');
  css2.textContent = `.agetype{display:inline-block;border:1.5px solid;border-radius:999px;padding:1px 10px;font-weight:700;font-size:14px;background:#fff;cursor:pointer;margin-right:4px}
.at-kids{color:#9A3412;border-color:#9A3412;background:#FFF4EC}.at-work{color:#1E40AF;border-color:#1E40AF;background:#EEF3FF}
.at-old{color:#065F46;border-color:#065F46;background:#ECFDF5}.at-mix{color:#475569;border-color:#475569;background:#F1F5F9}
.pbar{display:grid;grid-template-columns:9.5em 1fr auto;gap:8px;align-items:center;margin:6px 0}
.pbar span{font-size:15px}.pbar em{font-style:normal;font-weight:700;white-space:nowrap}.pbar small{font-weight:400;color:var(--ink2,#555)}
.pbt{position:relative;height:14px;background:#E9EEF2;border-radius:7px}
.pbt i{position:absolute;left:0;top:0;bottom:0;background:var(--terr,#17324D);border-radius:7px}
.pbt b{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1px;background:#B71C1C;border-radius:2px}
.plist{margin:4px 0 8px;padding-left:1.4em}.plist li{margin:4px 0}`;
  document.head.appendChild(css2);

  const TYPES = {
    kids: { name: '子育て世代型', good: '子どものいる家庭が多い地域です。', time: '平日の夕方（17〜19時）・土曜の朝',
      prep: ['子育て・家族・しつけの話題を用意する', '子どもが学校から帰る夕方は、親も家にいやすい時間です'] },
    work: { name: '若い働く世代型', good: '20〜40代の働く世代が多い地域です。', time: '平日の夕方・土日',
      prep: ['仕事・将来・ストレス・人間関係の話題を用意する', '昼の留守が多いときは、夕方や土日に訪ねる'] },
    old: { name: '年配の方が多い型', good: '年配の方が多く、平日の昼でも会いやすい地域です。', time: '平日の朝・昼',
      prep: ['健康・家族・地域のつながりの話題を用意する', 'ゆっくり話せるように、時間に余裕をもって訪ねる'] },
    mix: { name: 'いろいろな世代型', good: 'いろいろな世代が住んでいる地域です。', time: '曜日や時間帯を変えて',
      prep: ['いくつかの話題を用意する', '留守の家は、曜日や時間帯を変えて訪ねる'] }
  };
  const AGE_F = ['c', 'y', 'm', 'o', 't', 'c0', 'c1', 'c2'];
  /* 市町村ごとの平均（人口で重みをつける） */
  function cityAvg(muni) {
    return memo('cv' + muni, () => {
      const am = ageMap(); if (!am) return null;
      const areas = [...am.values()].filter(a => a.k !== '__all' && String(a.k).split(':')[0] === muni && a.pop > 0);
      const pop = areas.reduce((s, a) => s + a.pop, 0);
      if (!areas.length || !pop) return null;
      const o = {};
      AGE_F.forEach(f => { o[f] = areas.every(a => a[f] != null) ? areas.reduce((s, a) => s + Number(a[f]) * a.pop, 0) / pop : null; });
      return o;
    });
  }
  function typeOf(p, cv) {
    const r = (a, b) => (b ? a / b : 1);
    if (r(p.o, cv.o) >= 1.25) return 'old';
    if (r(p.c, cv.c) >= 1.15 && (!p.hi || p.hi >= 0.98)) return 'kids';
    if (r(p.tv, cv[p.tk]) >= 1.08 && r(p.c, cv.c) < 1.05) return 'work';
    return 'mix';
  }
  function prof(t) {
    if (!t || !AGE_ON || typeof ageMap !== 'function' || typeof terrAza !== 'function') return null;
    return memo('p' + t.id, () => {
      const am = ageMap(); if (!am) return null;
      const list = terrAza(t).filter(a => am.has(a.k)).map(a => ({ a: am.get(a.k), r: Number(a.r) || 0, k: a.k }));
      const w = list.reduce((s, x) => s + x.r, 0);
      if (!list.length || !w) return null;
      const has = f => list.every(x => x.a[f] != null);
      const avg = f => list.reduce((s, x) => s + (Number(x.a[f]) || 0) * x.r, 0) / w;
      const main = list.slice().sort((a, b) => b.r - a.r)[0], muni = String(main.k).split(':')[0], cv = cityAvg(muni);
      const tk = has('t') && cv && cv.t != null ? 't' : 'y';
      const p = { c: avg('c'), o: avg('o'), tk, tv: avg(tk), tl: tk === 't' ? '20〜49歳' : '20〜39歳', hi: has('hi') ? avg('hi') : null,
        c0: has('c0') ? avg('c0') : null, c1: has('c1') ? avg('c1') : null, c2: has('c2') ? avg('c2') : null,
        aza: azaShow(String(main.a.n || '').replace(/^.*\s/, '')), naza: list.length, muni, cv };
      // 市内の順位（同じ市町村の字の中で、割合が高い順）
      const peers = [...am.values()].filter(a => a.k !== '__all' && String(a.k).split(':')[0] === muni && a[tk] != null).sort((a, b) => b[tk] - a[tk]);
      const i = peers.findIndex(a => a.k === main.a.k);
      if (i >= 0 && peers.length >= 3) p.rank = { i: i + 1, n: peers.length, top: i + 1 <= Math.ceil(peers.length / 2) }; // 上位半分のときだけ「○番目に多い」と出す
      // この区域のおよその人数：字の人口を、登録した家の数の割合で分ける
      if (typeof azaHouseShare === 'function') {
        const sh = azaHouseShare(), n = sh.per.get(t.id) || 0;
        if (n) {
          const est = f => list.reduce((s, x) => s + (sh.tot[x.k] ? x.a.pop * (Number(x.a[f]) || 0) / 100 * (n * x.r / sh.tot[x.k]) : 0), 0);
          const rnd = v => (v >= 100 ? Math.round(v / 10) * 10 : Math.round(v));
          const e1 = est(tk), e2 = est('c');
          // 家の登録が少ない字では多めに出るので、1軒あたり3人を超えるときは出さない
          if (e1 >= 1 && e1 <= n * 3) p.est = rnd(e1);
          if (e2 >= 1 && e2 <= n * 3) p.estKids = rnd(e2);
        }
      }
      p.type = cv ? typeOf(p, cv) : 'mix';
      return p;
    });
  }
  function profLine(t, back) {
    const p = prof(t);
    if (!p) return typeof ageLine === 'function' ? ageLine(t) : '';
    return `<p class="agelines"><button type="button" class="agetype at-${p.type}" data-prof="${t.id}" data-back="${back || ''}">${TYPES[p.type].name} ›</button>` +
      `${esc(p.aza)}は${p.tl}が${Math.round(p.tv)}%${p.rank && p.rank.top ? `・市内${p.rank.n}地域で<b>${p.rank.i}番目</b>に多い` : ''}</p>` +
      (p.est ? `<p class="muted">この区域に${p.tl}がおよそ${p.est}人（推計）</p>` : '');
  }
  function srcText(muni) {
    const d = typeof ageCur === 'function' ? (ageCur() || {}) : {};
    const doc = (d.docs || []).find(x => x && x.id === 'cur:' + muni) || null;
    if (doc && doc.src === 'estat') return `出典：総務省統計局「国勢調査 小地域集計」（e-Stat）を加工して作成${doc.asOf ? `（${esc(doc.asOf)}）` : ''}`;
    return `出典：${esc((doc && doc.city) || '市')}「地域・年齢別人口」${doc && doc.asOf ? `（${esc(doc.asOf)}時点）` : ''}を加工して作成（CC BY 2.1 JP）`;
  }
  let awayG = false;
  function openProfile(tid, back) {
    const t = TID.get(tid), p = t && prof(t);
    if (!p) return;
    const T = TYPES[p.type], cv = p.cv || {}, r = v => Math.round(v * 10) / 10;
    const bar = (label, v, c) => `<div class="pbar"><span>${label}</span><div class="pbt"><i style="width:${Math.min(100, v / 0.6)}%"></i>` +
      `${c != null ? `<b style="left:${Math.min(100, c / 0.6)}%" title="市の平均"></b>` : ''}</div><em>${Math.round(v)}%${c != null ? `<small>（市 ${Math.round(c)}%）</small>` : ''}</em></div>`;
    const best = SLOTS.filter(s => nightOn() || !s.endsWith('・夜')).map(s => [s, meetChance(t, s).p]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    setSheet(headHtml(t, 'この地域のようす', '統計からの予想') + `
      <p><span class="agetype at-${p.type}">${T.name}</span> ${T.good}</p>
      <p class="muted">${esc(p.aza)}${p.naza > 1 ? ` ほか${p.naza - 1}地域` : ''}の年代の割合（赤い線は市の平均）</p>
      ${bar('子ども（0〜14歳）', p.c, cv.c)}${bar(p.tl, p.tv, cv[p.tk])}${bar('65歳以上', p.o, cv.o)}
      ${p.c0 != null ? `<p class="muted">子どもの内訳：未就学（0〜4歳）${r(p.c0)}%・小学生ごろ（5〜9歳）${r(p.c1)}%・中学生ごろ（10〜14歳）${r(p.c2)}%</p>` : ''}
      ${p.hi ? `<p class="muted">1世帯の人数：市の平均の${p.hi.toFixed(2)}倍</p>` : ''}
      ${p.rank && p.rank.top ? `<p>${p.tl}の割合は、市内${p.rank.n}地域で<b>${p.rank.i}番目</b>に多い地域です。</p>` : ''}
      ${p.est ? `<p>この区域には、${p.tl}がおよそ<b>${p.est}人</b>${p.estKids ? `、子どもがおよそ<b>${p.estKids}人</b>` : ''}住んでいる計算です。</p>` : ''}
      <p class="q">会いやすい時間（予想）</p>
      <p>${T.time}<small class="muted">（年代からの目安）</small></p>
      <p class="muted">これまでの記録もふくめた会える見込み：${best.map(([s, v]) => `${slotShort(s)} 約${pctTxt(v)}`).join('・')}</p>
      <p class="q">訪問の準備のヒント</p>
      <ul class="plist">${T.prep.map(x => `<li>${x}</li>`).join('')}</ul>
      <p class="hint">字ごとの統計からの一般的な予想です。玄関の向こうの方は、一人ひとり違います。人数は、登録した家の数から割り出した目安です。</p>
      <p class="hint">${srcText(p.muni)}</p>
      <button class="btn block" id="profBack">${back ? 'もどる' : '閉じる'}</button>`);
    $('#profBack').onclick = () => {
      if (back === 'req') window.openRequestSheet();
      else if (back === 'away') window.openAwayPick(awayG);
      else closeSheet();
    };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-prof]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openProfile(b.dataset.prof, b.dataset.back || '');
  }, true);

  /* 会える見込み：子どもが多い地域は、平日の夕方・土日の朝と昼を少し高く（親が家にいやすい）。未就学児が多い地域は平日の朝・昼も少し高く */
  function kidF(t, slot) {
    const p = prof(t);
    if (!p || !p.cv || !p.cv.c) return 1;
    let f = 1;
    const rc = p.c / p.cv.c;
    if (rc > 1 && (slot === '平日・夕方' || slot === '土日・朝' || slot === '土日・昼')) f += Math.min(0.15, (rc - 1) * 0.5);
    if (p.c0 != null && p.cv.c0 && p.c0 / p.cv.c0 > 1.1 && (slot === '平日・朝' || slot === '平日・昼')) f += Math.min(0.1, (p.c0 / p.cv.c0 - 1) * 0.3);
    return f;
  }
  if (typeof meetChance === 'function' && typeof rateStats === 'function' && typeof mixIdx === 'function') {
    window.meetChance = function (t, slot) {
      const st = rateStats(), mx = terrMix(t);
      let prior = mx ? Math.min(0.95, Math.max(0.02, mixIdx(mx, slot) * st.R / st.meanIdx)) : st.R;
      prior = Math.min(0.95, prior * kidF(t, slot));
      const c = st.per.get(t.id + '|' + slot) || { n: 0, m: 0 };
      return { p: (c.m + prior * PRIOR_K) / (c.n + PRIOR_K), n: c.n };
    };
  }

  /* 市のCSVを手で読み込んだときも、20〜49歳と子どもの内訳を残す（e-Stat の形は、今までどおり） */
  if (typeof parseAgeCsv === 'function') {
    const _parseAgeCsv = window.parseAgeCsv;
    window.parseAgeCsv = function (text) {
      const res = _parseAgeCsv.apply(this, arguments);
      try { addBands(res, text); } catch (e) { console.warn(e); }
      return res;
    };
  }
  function addBands(res, text) {
    if (!res || !Array.isArray(res.areas)) return;
    const rows = parseCsvText(String(text || '').replace(/^﻿/, '')).map(r => r.map(c => String(c).normalize('NFKC').trim()));
    if (rows.slice(0, 5).some(r => r.includes('KEY_CODE'))) return;
    const isAge = c => AGE_RE.test(c) && !/再掲|人口/.test(c);
    const hi = rows.findIndex(r => r.filter(isAge).length >= 3);
    if (hi < 0) return;
    const head = rows[hi], nameCol = head.findIndex(c => /地域名|町丁|字名|地区名|町名/.test(c));
    if (nameCol < 0) return;
    const cols = [];
    head.forEach((c, i) => { if (!isAge(c)) return; const m = c.match(AGE_RE); cols.push({ i, lo: Number(m[1] != null ? m[1] : m[3]), sex: /男/.test(c) ? 'm' : /女/.test(c) ? 'f' : 't' }); });
    const hasSex = cols.some(a => a.sex !== 't'), use = cols.filter(a => (hasSex ? a.sex !== 't' : true));
    const n = v => { const x = Number(String(v || '').replace(/[,\s]/g, '')); return isFinite(x) ? x : 0; };
    const by = new Map();
    rows.slice(hi + 1).forEach(r => {
      const name = String(r[nameCol] || '').trim();
      if (!name) return;
      const s = { tot: 0, t: 0, c0: 0, c1: 0, c2: 0 };
      use.forEach(a => { const v = n(r[a.i]); s.tot += v; if (a.lo >= 20 && a.lo < 50) s.t += v; if (a.lo === 0) s.c0 += v; else if (a.lo === 5) s.c1 += v; else if (a.lo === 10) s.c2 += v; });
      if (s.tot > 0 && !by.has(azaKey(name))) by.set(azaKey(name), s);
    });
    const pc = (v, tot) => Math.round(v / tot * 1000) / 10;
    res.areas.forEach(a => { const s = by.get(a.k); if (s) ['t', 'c0', 'c1', 'c2'].forEach(f => { a[f] = pc(s[f], s.tot); }); });
    const ok = res.areas.filter(a => a.t != null), pop = ok.reduce((s, a) => s + a.pop, 0);
    if (res.all && pop) ['t', 'c0', 'c1', 'c2'].forEach(f => { res.all[f] = Math.round(ok.reduce((s, a) => s + a[f] * a.pop, 0) / pop * 10) / 10; });
  }

  /* 自分の区域カード：地域のタイプを1行で出す（押すと、くわしく） */
  if (typeof cardHtml === 'function') {
    const _cardHtml = window.cardHtml;
    window.cardHtml = function (t, own, helper) {
      const h = _cardHtml.apply(this, arguments);
      if (!(own || helper)) return h;
      let line = '';
      try { if (prof(t)) line = profLine(t, ''); } catch (e) { console.error(e); }
      const i = h.lastIndexOf('<div class="actions">');
      return !line || i < 0 ? h : h.slice(0, i) + `<div class="tbody">${line}</div>` + h.slice(i);
    };
  }

  /* 留守宅カードの一覧：地域のようすと、「この時間帯にまだ訪ねていない家」の数を出す */
  const awayItem = (x, cur, full, attr) => `<article class="ritem k-away"><div>
      <p class="rt"><span class="stamp xs${noCls(x.t.no)}">${esc(x.t.no)}</span> ${slotText(x.slot)}${x.slot === cur ? ' <span class="nowtag">今</span>' : ''}</p>
      ${x.chance != null ? `<p class="metline">会える見込み 約${pctTxt(x.chance)}<small class="muted">（目安）</small></p>` : ''}
      ${profLine(x.t, 'away')}
      <p class="muted">会えていない家 ${x.um}軒のうち、<b>${slotShort(x.slot)}にまだ訪ねていない ${x.keys.length}軒</b>がこのカードに入ります${x.longDays ? `。いちばん長い家は${x.longDays}日会えていません` : ''}</p>
      ${x.dist != null || x.t.holder ? `<p class="muted">${[x.dist != null ? `ここから約${fmtDist(x.dist)}` : '', x.t.holder ? 'あなたの区域' : ''].filter(Boolean).join('　')}</p>` : ''}
    </div><button class="btn small primary" ${attr}="${x.t.id}" data-slot="${x.slot}"${full ? ' disabled' : ''}>受け取る</button></article>`;
  const withAway = (list, idx) => list.map(x => {
    const items = idx.get(x.t.id) || [], ks = new Set(x.keys);
    const oldest = items.reduce((a, i) => (ks.has(i.k) && (!a || i.first < a) ? i.first : a), '');
    return Object.assign(x, { um: items.filter(i => !i.hard).length, longDays: oldest ? daysSince(oldest) : 0 });
  });
  if (typeof renderAwaySuggest === 'function') {
    window.renderAwaySuggest = function () {
      const u = me(), reg = !!(u.slots && u.slots.length), cur = slotOf(new Date());
      const slots = reg ? u.slots.slice().sort(bySlot) : [cur];
      const st = D().settings, mine = myAwayCount(false), full = mine >= st.awayMax;
      $('#slotEdit').textContent = reg ? '行ける時間を変える' : '行ける時間を登録する';
      $('#awayHint').innerHTML = (offToday() ? OFF_NOTE : '') + (reg
          ? `あなたの行ける時間（${slots.map(slotShort).join('、')}）に合うカードです。`
          : `今の時間帯（${slotShort(cur)}）に合うカードです。`) +
        awayExpText() + '回り終えたら「返却する」を押します。' +
        (mine ? `<br><b>受け取り中 ${mine}枚</b>（${st.awayMax}枚まで）。「区域カード」画面にあります。` : '');
      const list = withAway(awaySuggestions(u.id, slots).slice(0, 10), unmetIndex());
      $('#awayList').innerHTML = list.length ? list.map(x => awayItem(x, cur, full, 'data-awaytake')).join('') +
        (full ? '<p class="hint">持てる枚数に達しています。受け取り中のカードを終えると、受け取れます。</p>' : '')
        : `<div class="empty">今、合う留守宅カードはありません。${reg ? '' : '<br>「行ける時間を登録する」と、ほかの時間帯のカードも探せます。'}</div>`;
    };
  }
  if (typeof openAwayPick === 'function') {
    window.openAwayPick = function (grp) {
      const G = !!grp && canGroupTerr();
      awayG = G;
      const u = me(), reg = !!(u.slots && u.slots.length), cur = slotOf(new Date());
      if (G && !awayGroupSlot) awayGroupSlot = nextGroupSlot();
      const key = 'kuiki_awaysort_' + u.id, ageOn = !!(AGE_ON && ageMap());
      const paint = () => {
        const slots = G ? [awayGroupSlot] : reg ? u.slots.slice().sort(bySlot) : [cur];
        let sort = lsGet(key) || 'long';
        if (sort === 'young' && !ageOn) sort = 'long';
        if (sort === 'near' && !myPos) { locate(paint); }
        const list = withAway(awaySuggestions(u.id, slots), unmetIndex()).map(x => Object.assign(x, { chance: meetChance(x.t, x.slot).p }));
        const yv = x => { const p = prof(x.t); return p ? p.tv : -1; };
        const by = {
          near: (a, b) => (a.dist == null ? 1e12 : a.dist) - (b.dist == null ? 1e12 : b.dist),
          long: (a, b) => b.longDays - a.longDays,
          many: (a, b) => b.keys.length - a.keys.length,
          now: (a, b) => (a.slot === cur ? 0 : 1) - (b.slot === cur ? 0 : 1) || b.keys.length - a.keys.length,
          easy: (a, b) => b.chance - a.chance || b.keys.length - a.keys.length,
          young: (a, b) => yv(b) - yv(a) || b.keys.length - a.keys.length
        };
        list.sort(by[sort] || by.long);
        const full = myAwayCount(G) >= D().settings.awayMax;
        const sorts = [['easy', '会いやすい順'], ['near', '近い順'], ['long', '長く会えていない順'], ['many', '家が多い順']]
          .concat(ageOn ? [['young', '若い世代が多い順']] : []).concat(G ? [] : [['now', '今の時間帯']]);
        setSheet(headHtml(null, G ? `${esc(myGroup())}グループで回る留守宅カード` : '留守宅カードをえらぶ',
            G ? `持てるのは${D().settings.awayMax}枚まで（今 ${myAwayCount(true)}枚）` : reg ? `行ける時間：${slots.map(slotShort).join('、')}` : `今の時間帯：${slotShort(cur)}`) + `
          ${offToday() ? OFF_NOTE : ''}
          ${G ? `<div class="seg" role="group" aria-label="もらうカード"><button type="button" data-gterr aria-pressed="false">区域カード</button><button type="button" aria-pressed="true">留守宅カード</button></div>
            <label class="field"><span>集まりの時間帯</span><select id="apGSlot">${SLOTS.map(x => `<option value="${x}"${x === awayGroupSlot ? ' selected' : ''}>${slotText(x)}</option>`).join('')}</select></label>` : ''}
          <div class="seg uiseg" role="group" aria-label="並び順">
            ${sorts.map(([v, l]) => `<button type="button" data-asort="${v}" aria-pressed="${sort === v}">${l}</button>`).join('')}
          </div>
          ${G ? '' : `<div class="row"><button class="btn small" id="apSlots">${reg ? '行ける時間を変える' : '行ける時間を登録する'}</button></div>`}
          ${full ? `<div class="notice warn">${G ? 'グループの' : ''}留守宅カードは${D().settings.awayMax}枚まで持てます。受け取り中のカードを終えると、受け取れます。</div>` : ''}
          ${list.length ? list.slice(0, 20).map(x => awayItem(x, cur, full, 'data-awaytake2')).join('')
            : `<div class="empty">今、合う留守宅カードはありません。${G ? '<br>集まりの時間帯を変えると、ほかのカードが見つかることがあります。' : reg ? '' : '<br>「行ける時間を登録する」と、ほかの時間帯のカードも探せます。'}</div>`}
          <p class="hint">${awayExpText()}回り終えたら「返却する」を押します。${G ? '<br>受け取ったら「今日回る人」をえらぶと、その人たちも今日だけ記録できます。' : ''}<br>「会える見込み」は、その区域の年齢の割合と、これまでの記録から出した目安です。</p>
          <button class="btn block" data-close>もどる</button>`);
        const S = $('#sheet');
        $$('[data-asort]', S).forEach(b => b.onclick = () => { lsSet(key, b.dataset.asort); paint(); });
        if ($('#apSlots')) $('#apSlots').onclick = openSlotSheet;
        if ($('#apGSlot')) $('#apGSlot').onchange = e => { awayGroupSlot = e.target.value; paint(); };
        if ($('[data-gterr]', S)) $('[data-gterr]', S).onclick = () => window.openRequestSheet(true);
        $$('[data-awaytake2]', S).forEach(b => b.onclick = () => { closeSheet(); takeAwayCard(b.dataset.awaytake2, b.dataset.slot, G); });
      };
      paint();
    };
  }

  /* 試作版などで、この部品より先に画面ができていたときは描き直す */
  if (Store.data && typeof map !== 'undefined' && map) { try { renderAll(); } catch (e) { console.error(e); } }
})();
