/* =========================================================
   schedule.js  区域マップ 追加機能（第1弾）
   ・係の画面「状況」に「期限の見張り」を出す（1区域は返却の目安まで・全区域は1年）
   ・「区域をもらう」一覧に「おすすめ順」を加え、はじめの並び順にする
   使い方：index.html の </body> の直前に、次の1行を足すだけ
     <script src="schedule.js"></script>
   サーバー（GAS）・スプレッドシートは変えません。
   計算は、スマホに読み込みずみの区域・家・記録・S-13 から行います（通信は増えません）。
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof renderAdmin !== 'function') return;

  const YEAR = 365;                           // 全区域を回る期間（日）
  const PIN_DAYS = 60;                        // 期限までこの日数を切った区域は、一覧のいちばん上に出す
  const W_DUE = 60, W_YOUNG = 25, W_AWAY = 15; // おすすめ順の点数の配分
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
.duerow p{margin:0}`;
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
      x.sc = Math.round(dueP * W_DUE + rank(x.y) * W_YOUNG + x.a * W_AWAY);
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
    </div><button class="btn small" data-open="${t.id}">地図</button></div>`;
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
      box.addEventListener('click', e => { if (e.target.closest('[data-dues13]')) openS13(); });
    }
    const m = monthStats(), ld = lendDays();
    const paces = m.ts.filter(t => t.holder).map(paceOf).filter(p => p && p.msg).sort((a, b) => b.el - a.el);
    const maxN = Math.max(1, ...m.months.map(x => x.list.length));
    const peak = m.months.filter(x => x.list.length >= Math.max(3, Math.ceil(m.avg * 1.5)));
    const order = m.ds.slice().sort((a, b) => RANK[a.st] - RANK[b.st] ||
      (a.left == null ? 1 : b.left == null ? -1 : a.left - b.left) || cmpNo(a.t.no, b.t.no));
    const SHOW = 8;
    box.innerHTML = `<h2 class="sec">期限の見張り</h2>
      <p class="hint">1区域は留守宅も含めて返却の目安（${ld}日）以内、全区域は前回回り終えた日から1年以内に回る、という原則で計算しています。
        前回回り終えた日は、アプリの記録とS-13に転記した紙の記録のうち、新しいほうを使います。</p>
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
      <h3 class="sub">区域ごとの期限（急ぐ順）</h3>
      ${m.none.length ? `<p class="hint">「前回の記録なし」の区域は、S-13に紙の記録（前回完了した日付）を転記すると期限が出ます。
        <button type="button" class="btn small" data-dues13>S-13を開く</button></p>` : ''}
      ${order.slice(0, SHOW).map(dueRow).join('')}
      ${order.length > SHOW ? `<details class="more"><summary>ほかの区域を見る（${order.length - SHOW}）</summary>${order.slice(SHOW).map(dueRow).join('')}</details>` : ''}`;
  }
  const _renderAdmin = window.renderAdmin;
  window.renderAdmin = function () {
    _renderAdmin.apply(this, arguments);
    try { if (isAdmin() && adPane === 'status') paintDue(); } catch (e) { console.error(e); }
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
          <p class="muted">${n}軒・部屋　${last ? `前回返却した日 ${fmtDay(last)}` : 'まだ回ったことがない区域'}${dist != null ? `　ここから約${fmtDist(dist)}` : ''}</p>${yg && yg.pct != null ? `<p class="muted">${yg.city ? `20〜39歳 ${yg.pct}%（市の年齢データ）` : `若い世代 ${yg.pct}%（会えた記録 ${yg.n}件から）`}</p>` : ''}${ageLine(t)}</div>
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
      ${reqSort === 'young' ? `<p class="hint">${AGE_ON && ageMap() ? '市の年齢データ（字ごとの20〜39歳の割合）から出しています。字が決まっていない区域は、「会えた」記録の年代から出します。' : '市の年齢データが入っていないので、これまでに「会えた」と記録したときの年代から出した目安です。'}</p>` : ''}
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

  /* 試作版などで、この部品より先に画面ができていたときは描き直す */
  if (Store.data && typeof map !== 'undefined' && map) { try { renderAll(); } catch (e) { console.error(e); } }
})();
