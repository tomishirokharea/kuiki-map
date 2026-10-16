/* =========================================================
   schedule.js  区域マップ 追加機能（第1弾〜第6弾）
   第1弾
   ・係の画面「状況」に「期限の見張り」を出す（1区域は返却の目安まで・全区域は1年）
   ・「区域をもらう」一覧に「おすすめ順」を加え、はじめの並び順にする
   第2弾
   ・若い世代の優先度（弱・中・強）／留守宅を終える回数（手紙の候補）／夜を提案に入れるか／訪問を控える日
   ・区域ごとの調整（若い世代の割合の手直し・留守宅を終える回数）／区域の大きさの見直し候補
   地域のようす
   ・区域・留守宅カードに、地域のタイプ（子育て世代型など）・20〜49歳の割合と市内の順位・区域のおよその人数を出す
   ・押すと、年代の割合・子どもの内訳・会いやすい時間・訪問の準備のヒントを出す（統計からの予想）
   第3弾（係の画面の見直し）
   ・係の画面の最初のタブを「今日」にする：年間カバーの状況と、今日対応することだけを並べる
     （区域の貸し出しと、自分で受け取られた区域の確認は、その場で1タップ・取り消せる）
   ・「状況」タブの時間帯の表を、曜日（平日・土曜・日曜）×時間帯の新しい表に置き換える
     （全区域／字／区域・直近4か月／1年。未試行・データ少を分けて出す）
   ・「速さを測る」に、新しい集計の時間を加える
   第4弾
   ・区域カルテ：「区域」タブ・期限の見張り・「今日」タブの「カルテ」ボタンから、1区域の状態・期限・次の一手・時間帯の表・S-13の履歴を1画面で見る
   ・「設定・データ」タブの上に「毎月の点検」（要確認は「今日」タブにも出る）と、設定の変更履歴
     （整理・バックアップ・セルの数はサーバーの ops 問い合わせで読む。Code.gs も新しい版にする）
   第5弾
   ・「状況」タブの下に「何度訪ねても会えない家」（住んでいないかもしれない家）を出す（区域係だけ。家のデータには印を付けない）
   ・地図に係だけの「期限で色分け」（記号・線の形・凡例つき。区域を押すとカルテ）
   ・この端末の自動ロック（番号・顔認証/指紋。「設定・データ」タブで決める。のぞき見を防ぐためのもの）
   第6弾（係の画面の見直し：操作性・機能性）
   ・タブを「今日・区域・予定・人・設定」にし、「状況」は「区域」タブの中で切りかえる／区域をさがす欄／一覧の操作をたたむ
   ・区域の操作をカルテに集める／係どうしで同じ仕事をしない（最新を確かめてから決める・だれが対応したかを残す）
   ・申し込みの見送りなど戻せる操作は確認を出さず「取り消す」で守る／パソコンではカルテを右に並べる／各画面の使い方
   ・時間帯の表から留守宅カードを「重点」にする／受け取られていない留守宅カードと紹介の紙／期限の見通しと会えた成果
   ・集まりに合う区域／名前をかくす（この端末だけ）／S-12・S-13の印刷に注意書き／書き出しの記録（サーバーの operations）
   使い方：index.html の </body> の直前に、次の1行を足すだけ
     <script src="schedule.js"></script>
   第2弾の決めを保存するには、サーバー（Code.gs）の設定の部分に youngW・awayTries・nightOn・offDays を足します。
   年齢データの自動取り込みは、サーバーの AgeAuto.gs が行います。
   計算は、スマホに読み込みずみの区域・家・記録・S-13 から行います（通信は増えません・サーバーには何も保存しません）。
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
.ptag{display:inline-block;background:#FFF1E8;border:2px solid #C2410C;color:#7A2E00;border-radius:8px;padding:0 8px;font-weight:700;font-size:15px;margin-left:4px}
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
  /* 前回回り終えた日：アプリの記録・紙の記録の完了日（t.paperDone）・S-13に転記した紙の記録のうち、いちばん新しいもの */
  function lastDone(t) {
    const c = [];
    if (t.completedAt) c.push(dstr(t.completedAt));
    if (t.paperDone) c.push(String(t.paperDone)); // 係のスマホが書く、紙の記録の完了日（伝道者のスマホにはS-13がないため）
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
        items.forEach(x => { if (!x.hard && slotCount(x.triedAll != null ? x.triedAll : x.tried) >= n) { x.hard = true; x.letter = true; } }); // 手紙の候補は、これまでの全記録で数える（留守宅カードに入れるかは、「留守宅訪問のルール」で決める）
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
    const tr = x => (x.triedAll != null ? x.triedAll : x.tried);
    const hard = [...unmetIndex().values()].flat().filter(x => x.hard)
      .sort((a, b) => slotCount(tr(b)) - slotCount(tr(a)) || (a.first < b.first ? -1 : 1));
    box.innerHTML = `<p class="hint">違う時間帯で${triesAll()}回（区域ごとに変えたときは、その回数）留守だった家の一覧です。留守宅カードに入れるかどうかは、「区域」＞「状況」の「留守宅訪問のルール」で決めます。ふだんの区域カードでは、これまでどおり訪ねます。</p>` +
      (hard.length ? hard.slice(0, 30).map(x => {
        const t = TID.get(x.h.terrId);
        return `<article class="ritem k-new"><div>
          <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> ${targetName(x.h, x.u)}</p>
          <p class="muted">留守 ${visitsOf(x.k).length}回・試した時間帯 ${slotCount(tr(x))}つ（${slotList(tr(x)).map(slotShort).join('、')}）</p>
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
    </div><div class="duebtns"><button class="btn small" data-open="${t.id}">地図</button><button class="btn small" data-dueadj="${t.id}">調整</button><button class="btn small primary" data-karte="${t.id}">カルテ</button></div></div>`;
  };
  const adjTag = t => {
    const a = [];
    if (fixOf(t) != null) a.push(`若い世代 ${fixOf(t)}%（手直し）`);
    if (t.awayTries != null) a.push(`手紙の候補は${triesFor(t)}回から`);
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
    return `<details class="dueset"${setOpen ? ' open' : ''}><summary>区域係の決め（若い世代 ${yl}・手紙の候補は${triesAll()}回から・控える日 ${offs.length}日）</summary>
      <div class="setrow"><span>おすすめ順で、若い世代の多い区域をどれだけ前に出すか<br><small class="hint">夏休み・年末年始・連休など、若い世代が家にいやすい時期は「強」にします。どれにしても、期限の近い区域がいちばん前です</small></span>
        ${seg('youngW', YW, yw)}</div>
      <div class="setrow"><span>留守宅を終える回数<br><small class="hint">違う時間帯でこの回数留守だった家を「手紙の候補」の一覧に出します（留守宅の画面に出ます）。留守宅カードに入れるかどうかは、「留守宅訪問のルール」で決めます。区域ごとにも変えられます（各区域の「調整」）</small></span>
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
    else if ((x = q('[data-karte]'))) openKarte(x.dataset.karte);
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
        <p class="hint">違う時間帯でこの回数留守だった家を「手紙の候補」の一覧に出します。単身向けのアパートが多い区域などは、回数を増やします。</p>
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
      if (isAdmin()) fixTabLabel();
      if (lkLocked() && currentView === 'admin') { const ls = document.getElementById('alockScr'); if (!ls || ls.hidden) showLockScreen(); return; }
      if (isAdmin() && adPane === 'terr') paintKarteBtns();
      if (isAdmin() && adPane === 'set') { paintOps(); paintLockBox(); loadOps(false); }
      if (isAdmin() && adPane === 'status') {
        paintCand(); loadOps(false);
        paintDue();
        paintSlotBox();
        const d = document.querySelector('#adDue details.dueset');
        if (d) d.addEventListener('toggle', () => { setOpen = d.open; });
      }
    } catch (e) { console.error(e); }
  };

  /* ---------- 途中で返却された区域・まったく回らずに返却された区域：自動受け取りの対象にする ----------
     ・「自動受け取り」を使っているとき、回り終えた記録のない返却（途中・未着手）は、日数を待たずに、すぐ自由に受け取れる
       （回り終えて返却した区域は、これまでどおり、決めた日数がたってから）
     ・受け取る人が分かるように、一覧に「途中で返却（約○%）」「ほとんど回らずに返却」と出す
     ・係の仕事は増やさない（「今日」タブにも出さない） */
  const _autoFreeOf = window.autoFreeOf;
  const isPartial = t => !!t && !t.holder && !t.awayPoolAt && !!t.returnedAt && (!t.completedAt || t.returnedAt > t.completedAt);
  window.autoFreeOf = function (t) {
    if (t && Number(D().settings.autoFree) === 1 && isPartial(t)) return true;
    return _autoFreeOf.apply(this, arguments);
  };
  /* 途中返却の説明（受け取る人に見せる）。返却のときの進み具合は、返却の記録（returns）から読む */
  function partialInfo(t) {
    if (!isPartial(t)) return null;
    let r = null;
    D().returns.forEach(x => { if (x.terrId === t.id && !x.pool && (!r || x.at > r.at)) r = x; });
    const pct = r && r.pct != null ? Math.round(Number(r.pct)) : null;
    return { pct, at: t.returnedAt, none: pct == null || pct <= 5 };
  }
  const partialTag = t => {
    const p = partialInfo(t);
    if (!p) return '';
    return `<span class="ptag">！ ${p.none ? 'ほとんど回らずに返却' : `途中で返却（回ったのは約${p.pct}%）`}</span>`;
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
    // 今すぐ受け取れる区域と、係に頼む区域を分ける（並びは、それぞれの中で選んだ並べ方のまま）
    const canGet = x => isFree(x.t) && canTake;
    const askWhy = x => canGet(x) ? '' : `<p class="muted">${isFree(x.t) ? '持てる枚数に届いています' : '係が貸し出す区域です'}</p>`;
    const rowHtml = x => { const { t, last, n, dist, yg } = x; return `<article class="pick">
        <span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span>
        <div><b>${esc(t.name)}</b>
          ${reqSort === 'reco' ? recoLine(x) : ''}
          <p class="muted">${n}軒・部屋　${last ? `前回返却した日 ${fmtDay(last)}` : 'まだ回ったことがない区域'}${partialTag(t) ? ' ' + partialTag(t) : ''}${dist != null ? `　ここから約${fmtDist(dist)}` : ''}</p>${yg && yg.pct != null && !yg.city ? `<p class="muted">${yg.manual ? `若い世代 ${yg.pct}%（区域係が手直し）` : yg.city ? '' : `若い世代 ${yg.pct}%（会えた記録 ${yg.n}件から）`}</p>` : ''}${profLine(t, 'req')}${askWhy(x)}</div>
        ${canGet(x)
          ? `<button class="btn small primary" data-take="${t.id}">受け取る</button>`
          : `<button class="btn small" data-ask="${t.id}">係に頼む</button>`}
      </article>`; };
    const rowsCan = list.filter(canGet).map(rowHtml).join(''), rowsAsk = list.filter(x => !canGet(x)).map(rowHtml).join('');
    const both = !!rowsCan && !!rowsAsk;   // 両方あるときだけ、見出しで分ける
    const rows = (both ? '<p class="q">今すぐ受け取れる区域</p>' : '') + rowsCan + (both ? '<p class="q">係に頼む区域（係が決めて届けます）</p>' : '') + rowsAsk;
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
      else if (back && back.indexOf('karte:') === 0) openKarte(back.slice(6));
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
      <p class="rt"><span class="stamp xs${noCls(x.t.no)}">${esc(x.t.no)}</span> ${slotText(x.slot)}${x.slot === cur ? ' <span class="nowtag">今</span>' : ''}${x.focus ? ' <span class="focustag">区域係のおすすめ</span>' : ''}${dayOnlyN(x.keys.length) ? ' <span class="daytag">今日だけ</span>' : ''}</p>
      ${x.chance != null ? `<p class="metline">会える見込み 約${pctTxt(x.chance)}<small class="muted">（目安）</small></p>` : ''}
      ${profLine(x.t, 'away')}
      <p class="muted">会えていない家 ${x.um}軒のうち、<b>${slotShort(x.slot)}にまだ訪ねていない ${x.keys.length}軒</b>がこのカードに入ります${x.longDays ? `。いちばん長い家は${x.longDays}日会えていません` : ''}</p>
      ${x.dist != null || x.t.holder ? `<p class="muted">${[x.dist != null ? `ここから約${fmtDist(x.dist)}` : '', x.t.holder ? 'あなたの区域' : ''].filter(Boolean).join('　')}</p>` : ''}
      ${x.tc != null && !isSimple() ? `<p class="muted">試した時間帯 ${x.tc}/${SLOTS.length}</p>` : ''}
      ${x.ext && !isSimple() ? '<p class="muted">区域は回り終えています（残りの留守宅）</p>' : ''}
    </div><button class="btn small primary" ${attr}="${x.t.id}" data-slot="${x.slot}"${full ? ' disabled' : ''}>受け取る</button></article>`;
  const withAway = (list, idx) => list.map(x => {
    const items = idx.get(x.t.id) || [], ks = new Set(x.keys);
    const oldest = items.reduce((a, i) => (ks.has(i.k) && (!a || i.first < a) ? i.first : a), '');
    // tc：この区域の「試した時間帯」（会えていない家の分をすべて合わせた数。参考の数字）。索引は呼び出し側で1回だけ作ったものを使う
    return Object.assign(x, { um: items.filter(i => !i.hard).length, longDays: oldest ? daysSince(oldest) : 0, tc: triedOf(items) });
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
        list.sort((a, b) => (b.focus ? 1 : 0) - (a.focus ? 1 : 0)); // 区域係のおすすめ（重点の時間帯）を先に。ほかの並びはそのまま
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

  /* =========================================================
     第3弾（1）時間帯の表：曜日（平日・土曜・日曜）× 時間帯（朝・昼・午後・夕方・夜）
     ・「会えた＋拒否」を会えた側、「留守」を会えなかった側として数える
     ・祝日は日曜に数える（祝日の判定は index.html の holidayOf。この表の中だけで使い、
       留守宅カード・おすすめ・会える見込みの時間帯の判定 slotOf は変えない）
     ・全区域／字ごと／区域ごと、直近4か月／1年（月単位）
     ・集計は係の端末の中で、直近12か月の記録を1周して作る（サーバーには何も保存しない）
     ========================================================= */
  const SLB = ['朝', '昼', '午後', '夕方', '夜'], SLC = ['平日', '土曜', '日曜'];
  const SL_FEW = 5, SL_BEST = 10, SL_AZA_MIN = 10;
  const slotState = { scope: 'all', sel: '', period: 4 };
  const css3 = document.createElement('style');
  css3.textContent = `.slscope{font-size:23px;font-weight:700;margin:10px 0 4px;line-height:1.4}
.slscope small{display:block;font-size:15px;font-weight:400;color:var(--ink2)}
.slotnew{min-width:0;width:100%;table-layout:fixed}
.slotnew th{font-size:15px}
.slotnew td{height:78px;padding:4px 2px}
.slotnew td small{color:var(--ink2);font-size:13px}
.slotnew td.sl-few{background:#F4F4F4;color:#555}
.slotnew td.sl-none{background:#fff;border:3px dashed #8A6D00;color:#8A6D00}
.slotnew td.sl-none.sl-emph{background:#FFF4D6;border:4px solid #C2410C;color:#7A2E00;font-size:18px}
.slotnew td.sl-few b{font-size:14px}
.slpick{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.slpick select{min-height:50px;border-radius:10px;border:2px solid var(--ink);padding:0 8px;background:#fff;font-size:17px;max-width:100%}
.slpriv{background:#F4F4F4;border-radius:12px;padding:14px;margin:8px 0}`;
  document.head.appendChild(css3);

  /* 記録を1周して、区域×月（今月からの数）×（時間帯・曜日）に足し込む。n は 0〜14、m は 15〜29 の場所 */
  function buildSlotAgg() {
    const now = new Date(), base = now.getFullYear() * 12 + now.getMonth();
    const cut = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
    const ok = new Set(eligible().map(t => t.id));
    const by = new Map();
    const vs = D().visits;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.at < cut) continue;
      const h = HID.get(v.houseId);
      if (!h || !ok.has(h.terrId)) continue;
      const d = new Date(v.at);
      if (isNaN(d)) continue;
      const off = base - (d.getFullYear() * 12 + d.getMonth());
      if (off < 0 || off > 11) continue;
      const w = d.getDay();
      const col = w === 0 ? 2 : w === 6 ? 1 : (holidayOf(ymd(d)) ? 2 : 0); // 祝日は日曜に数える
      const c = SLB.indexOf(bandOf(d)) * 3 + col;
      let a = by.get(h.terrId);
      if (!a) by.set(h.terrId, a = new Int32Array(12 * 30));
      a[off * 30 + c]++;
      if (v.result === 'met' || v.result === 'refused') a[off * 30 + 15 + c]++;
    }
    return by;
  }
  const slotAgg = () => memo('slotagg', buildSlotAgg);

  /* 字ごとの区域のまとまり（その区域でいちばん割合の大きい字に、区域ごと入れる。字が決まっていない区域は「字なし」） */
  function azaGroups() {
    return memo('azag', () => {
      const g = new Map();
      eligible().forEach(t => {
        const list = terrAza(t).slice().sort((a, b) => b.r - a.r);
        const nm = list.length ? (azaShow(String(list[0].n || '').replace(/^.*\s/, '')) || '字なし') : '字なし';
        if (!g.has(nm)) g.set(nm, { name: nm, terrs: [], homes: 0 });
        const o = g.get(nm);
        o.terrs.push(t);
        o.homes += housesOf(t.id).reduce((a, h) => a + targets(h).length, 0);
      });
      return [...g.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    });
  }
  /* いま見ている範囲：区域の一覧と、見出し */
  function slotScope() {
    const all = eligible().slice().sort(byNo), gs = azaGroups();
    const hasAza = gs.some(x => x.name !== '字なし');
    let sc = slotState.scope;
    if (sc === 'aza' && !hasAza) sc = 'all';
    if (sc === 'aza') {
      let g = gs.find(x => x.name === slotState.sel) || gs[0];
      return { sc, hasAza, terrs: g.terrs, g, title: `字：${g.name}`, sub: `区域 ${g.terrs.map(t => t.no).join('・')}（家・部屋 ${g.homes}軒）`, gs };
    }
    if (sc === 'terr') {
      const t = all.find(x => x.id === slotState.sel) || all[0];
      return { sc, hasAza, terrs: t ? [t] : [], all, t, title: t ? `区域${t.no}　${t.name || ''}` : '区域がありません', sub: t && prof(t) ? `字：${prof(t).aza}` : '' };
    }
    return { sc: 'all', hasAza, terrs: all, title: '全区域', sub: `${all.length}区域のぜんぶ` };
  }
  function slotQuery(terrs, p) {
    const agg = slotAgg(), n = new Array(15).fill(0), m = new Array(15).fill(0);
    terrs.forEach(t => {
      const a = agg.get(t.id);
      if (!a) return;
      for (let o = 0; o < p; o++) for (let c = 0; c < 15; c++) { n[c] += a[o * 30 + c]; m[c] += a[o * 30 + 15 + c]; }
    });
    return { n, m };
  }
  function periodLabel(p) {
    const now = new Date(), a = new Date(now.getFullYear(), now.getMonth() - (p - 1), 1);
    return a.getFullYear() === now.getFullYear()
      ? `${a.getFullYear()}年${a.getMonth() + 1}月〜${now.getMonth() + 1}月`
      : `${a.getFullYear()}年${a.getMonth() + 1}月〜${now.getFullYear()}年${now.getMonth() + 1}月`;
  }
  function slotTableHtml(scopeOv, perOv) {
    const s = scopeOv || slotScope(), per = perOv || slotState.period, q = slotQuery(s.terrs, per), emph = s.sc !== 'all';
    // いちばん会えている欄（10件以上ある欄だけ）
    let best = -1, bp = -1;
    for (let c = 0; c < 15; c++) if (q.n[c] >= SL_BEST && q.m[c] / q.n[c] > bp) { bp = q.m[c] / q.n[c]; best = c; }
    // 1つの区域の表では、まだ試していない枠・記録の少ない枠から、その時間帯の留守宅カードを「重点」にできる（区域係だけ）
    const one = s.terrs.length === 1 && isAdmin() ? s.terrs[0] : null;
    const fBtn = c => {
      if (!one) return '';
      const slot = cardSlotOf(c), on = focusSlots(one).includes(slot);
      return on ? `<br><span class="slfocus on">重点中</span>`
        : `<br><button type="button" class="slfocus" data-focust="${one.id}" data-focuss="${slot}" aria-label="${esc(slotShort(slot))}の留守宅カードを出す">出す</button>`;
    };
    const cell = c => {
      const n = q.n[c], m = q.m[c];
      if (!n) return `<td class="sl-none${emph ? ' sl-emph' : ''}"><b>未試行</b>${fBtn(c)}</td>`;
      if (n < SL_FEW) return `<td class="sl-few"><b>データ少</b><br><small>${n}件</small>${fBtn(c)}</td>`;
      const p = Math.round(m / n * 100);
      return `<td class="${c === best ? 'best' : ''}" style="background:rgba(21,101,192,${(0.06 + p / 100 * 0.5).toFixed(2)})"><b>${p}%</b><br><small>${n}件</small><div class="bar"><i style="width:${p}%"></i></div></td>`;
    };
    const rows = SLB.map((b, bi) => `<tr><th>${b}<br><small>${BAND_HINT[b]}</small></th>${[0, 1, 2].map(ci => cell(bi * 3 + ci)).join('')}</tr>`).join('');
    const none = q.n.filter(x => !x).length, few = q.n.filter(x => x > 0 && x < SL_FEW).length;
    return `<table class="slots slotnew" aria-label="曜日と時間帯ごとの会えた割合"><tr><th></th>${SLC.map(x => `<th>${x}</th>`).join('')}</tr>${rows}</table>
      <p class="hint">期間：<b>${periodLabel(per)}</b>（今月をふくむ${per}か月）　記録 ${q.n.reduce((a, b) => a + b, 0)}件</p>
      ${emph && none ? `<p class="hint-strong">未試行の枠が${none}つあります。留守宅カードや訪問の計画で、その曜日・時間帯を試してみてください。</p>` : ''}
      ${few ? `<p class="hint">「データ少」は、記録が${SL_FEW}件に満たない枠です。割合は出していません。</p>` : ''}`;
  }
  function slotBoxHtml() {
    const s = slotScope(), st = slotState;
    const sel = s.sc === 'aza'
      ? `<select id="slSel" aria-label="字をえらぶ">${s.gs.map(g => `<option value="${esc(g.name)}"${g.name === s.g.name ? ' selected' : ''}>${esc(g.name)}（${g.terrs.length}区域）</option>`).join('')}</select>`
      : s.sc === 'terr'
        ? `<select id="slSel" aria-label="区域をえらぶ">${s.all.map(t => `<option value="${t.id}"${s.t && t.id === s.t.id ? ' selected' : ''}>区域${esc(t.no)}　${esc(t.name || '')}</option>`).join('')}</select>` : '';
    const tiny = s.sc === 'aza' && s.g.homes < SL_AZA_MIN;
    return `<h2 class="sec">曜日と時間帯ごとの「会えた」割合（拒否を含む）</h2>
      <p class="hint">「会えた」と「拒否」を会えた側、「留守」を会えなかった側として数えています。</p>
      <div class="seg" role="group" aria-label="見る範囲">
        <button type="button" data-ssc="all" aria-pressed="${s.sc === 'all'}">全区域</button>
        ${s.hasAza ? `<button type="button" data-ssc="aza" aria-pressed="${s.sc === 'aza'}">字ごと</button>` : ''}
        <button type="button" data-ssc="terr" aria-pressed="${s.sc === 'terr'}">区域ごと</button></div>
      <div class="slpick">${sel}
        <div class="seg" role="group" aria-label="期間"><button type="button" data-sper="4" aria-pressed="${st.period === 4}">直近4か月</button><button type="button" data-sper="12" aria-pressed="${st.period === 12}">1年</button></div></div>
      <p class="slscope">いま見ているのは：${esc(s.title)}${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</p>
      ${tiny ? `<div class="slpriv"><b>この字は、家・部屋が${SL_AZA_MIN}軒に満たないため、表を出しません。</b><br>少ない軒数では、特定の家の様子が推測できてしまうためです。「区域ごと」か「全区域」で見てください。</div>` : slotTableHtml()}
      <p class="hint">祝日は日曜に含みます。時間は、記録を入力した時刻で数えています（あとからまとめて入力した記録は、実際の訪問時間とずれます）。留守宅カードの時間帯（平日／土日）とは、土曜と日曜を分けて数える点がちがいます。</p>`;
  }
  /* 係の画面「状況」の、古い表（直近180日）を隠して、新しい表を出す */
  function paintSlotBox() {
    const tbl = document.getElementById('adSlots');
    if (!tbl) return;
    const wrap = tbl.parentNode, hint = wrap.previousElementSibling, h2 = hint && hint.previousElementSibling;
    [wrap, hint, h2].forEach(x => { if (x) x.hidden = true; });
    let box = document.getElementById('adSlotBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adSlotBox';
      (h2 || wrap).parentNode.insertBefore(box, h2 || wrap);
      box.addEventListener('click', e => {
        const a = e.target.closest('[data-ssc]'), b = e.target.closest('[data-sper]');
        if (a) { slotState.scope = a.dataset.ssc; slotState.sel = ''; paintSlotBox(); }
        else if (b) { slotState.period = Number(b.dataset.sper); paintSlotBox(); }
      });
      box.addEventListener('change', e => { if (e.target.id === 'slSel') { slotState.sel = e.target.value; paintSlotBox(); } });
    }
    box.innerHTML = slotBoxHtml();
  }

  /* =========================================================
     第3弾（2）係の画面の最初のタブ「今日」
     ・上：年間カバーの状況（言葉・色・記号で示す）
     ・下：今日対応することだけを並べる（対応がないものは出さない）
     ・区域の貸し出し（申し込み）と、自分で受け取られた区域の確認は、その場で1タップ（取り消せる）
     ・くわしい一覧と操作は、これまでどおり下に残している
     ========================================================= */
  const css4 = document.createElement('style');
  css4.textContent = `.cover{display:flex;gap:12px;align-items:center;border:3px solid;border-radius:14px;padding:10px 12px;margin:6px 0 14px}
.cover i{font-style:normal;font-size:26px;font-weight:700;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
.cover b{font-size:21px}.cover small{display:block;font-size:15px;color:var(--ink2);line-height:1.5}
.cv-ok{border-color:#2E7D32;background:#E8F5E9}.cv-ok i{background:#2E7D32}
.cv-warn{border-color:#C2410C;background:#FFF1E8}.cv-warn i{background:#C2410C}
.cv-bad{border-color:#B71C1C;background:#FFEBEE}.cv-bad i{background:#B71C1C}
.cv-none{border-color:#546E7A;background:#ECEFF1}.cv-none i{background:#546E7A}
.tdnone{text-align:center;padding:22px 12px;font-size:22px;background:#fff;border:2px dashed var(--line);border-radius:14px}
.tdnone small{display:block;font-size:15px;color:var(--ink2);margin-top:4px}
.tdrow .duebtns{min-width:9em}.tdrow .duebtns .btn{white-space:normal}`;
  document.head.appendChild(css4);

  function coverInfo() {
    const ds = eligible().map(dueInfo);
    const known = ds.filter(d => d.last), over = ds.filter(d => d.st === 'over'), warn = ds.filter(d => d.st === 'warn'), none = ds.filter(d => d.st === 'none');
    let cls = 'cv-ok', mark = '✓', word = '順調';
    if (!known.length) { cls = 'cv-none'; mark = '？'; word = 'まだ判定できません'; }
    else if (over.length) { cls = 'cv-bad'; mark = '▲'; word = '遅れ気味'; }
    else if (warn.length) { cls = 'cv-warn'; mark = '！'; word = '要注意'; }
    // total・covered は会衆の目標（kangaeru.js）が使う：前回回り終えて365日以内の区域の数
    return { cls, mark, word, known: known.length, over: over.length, warn: warn.length, none: none.length, total: ds.length, covered: known.length - over.length };
  }
  const listNos = (ts, max) => {
    const a = ts.slice(0, max || 8).map(t => esc(t.no));
    return a.join('・') + (ts.length > (max || 8) ? `　ほか${ts.length - (max || 8)}区域` : '');
  };
  const terrBtns = (ts, max) => ts.slice(0, max || 3).map(t => `<button type="button" class="btn small" data-topen="${t.id}">区域${esc(t.no)}の地図</button>`).join('');

  /* 今日の対応の項目。対応がないものは作らない */
  function todayItems() {
    const out = [], now = Date.now(), ts = eligible(), m = monthStats();
    const go = (pane, anchor, label) => `<button type="button" class="btn small primary" data-tgo="${pane}" data-anchor="${anchor || ''}">${label || '見る'}</button>`;
    const row = (tone, title, sub, btns) => out.push({ tone, title, sub, btns });
    // 1 スマホの登録の申し込み（本人の番号を確かめる必要があるので、ここでは決めない）
    if (LIVE && typeof devPending === 'function') {
      const n = devPending().length;
      if (n) row('#C2410C', `スマホの登録の申し込み　${n}件`, '本人のスマホに出ている番号と同じか、確かめてから登録します', go('inbox', 'adDevices', '確かめる'));
    }
    // 2 区域カードの申し込み（その場で貸し出せる）
    const free = freeTerrs().map(t => ({ t, last: t.completedAt })).sort(byLongest);
    D().requests.filter(r => !r.type && r.status === 'pending').sort((a, b) => (a.at < b.at ? -1 : 1)).forEach(r => {
      const selEl = document.querySelector(`[data-reqterr="${r.id}"]`);
      const want = r.terrId ? terrById(r.terrId) : null;
      const pick = (selEl && terrById(selEl.value)) || (want && free.some(x => x.t.id === want.id) ? want : (free[0] ? free[0].t : null));
      const held = D().territories.filter(t => t.holder === r.by);
      const over = held.filter(t => t.lentAt && daysSince(t.lentAt) > 120).length;
      row('#1565C0', `${esc(uname(r.by))}さんが、区域カードを申し込んでいます${r.forGroup ? `（${esc(r.forGroup)}グループ用）` : ''}`,
        `希望：${want ? `区域${esc(want.no)}${want.holder ? '（すでに貸出中）' : ''}` : 'どこでもよい'}　今持っているカード ${held.length}枚${over ? `<span class="tag-warn">4か月超 ${over}枚</span>` : ''}`,
        (pick ? `<button type="button" class="btn small primary" data-tok="${r.id}" data-tterr="${pick.id}">区域${esc(pick.no)}を貸し出す</button>` : '<span class="muted">空いている区域がありません</span>') +
        `<button type="button" class="btn small" data-tno="${r.id}">見送る</button>`);
    });
    // 3 家の削除の申請（記録も消えるので、ここでは決めない）
    const dn = delReqs().length;
    if (dn) row('#B3261E', `家の削除の申請　${dn}件`, '申請した人に確認してから、「削除する」か「見送る」を選びます', go('inbox', 'adInbox', '確かめる'));
    // 4 自分で受け取られた区域（その場で確認できる）
    D().territories.filter(t => t.holder && t.selfTakenAt && t.selfSeen === false).forEach(t => {
      row('#00796B', `${esc(uname(t.holder))}さんが、区域${esc(t.no)}を自分で受け取りました`, `${fmtDay(t.selfTakenAt)}に受け取り（今 ${heldCount(t.holder)}枚）`,
        `<button type="button" class="btn small primary" data-ttaken="${t.id}">確認した</button><button type="button" class="btn small" data-topen="${t.id}">地図</button>`);
    });
    // 5 今月中に出したい区域
    if (m.need.length) row('#C2410C', `今月中に出したい区域　${m.need.length}区域`, `出さないと1年の期限に間に合いません：区域${listNos(m.need.map(d => d.t))}`, go('status', 'adDue') + karteBtns(m.need.map(d => d.t), 2));
    // 6 1年の期限
    if (m.over.length) row('#B71C1C', `1年の期限を過ぎた区域　${m.over.length}区域`, `区域${listNos(m.over.map(d => d.t))}`, go('status', 'adDue') + karteBtns(m.over.map(d => d.t), 2));
    if (m.warn.length) row('#C2410C', `1年の期限まで${PIN_DAYS}日以内の区域　${m.warn.length}区域`, `区域${listNos(m.warn.map(d => d.t))}`, go('status', 'adDue'));
    // 7 返却の目安を過ぎた貸出
    const late = ts.filter(t => t.holder && t.lentAt && Date.parse(dueOf(t)) < now);
    if (late.length) row('#C2410C', `返却の目安を過ぎた貸出　${late.length}件`,
      late.slice(0, 4).map(t => `区域${esc(t.no)}（${esc(uname(t.holder))}さん・${daysSince(dueOf(t))}日超過）`).join('、') + (late.length > 4 ? `　ほか${late.length - 4}件` : '') + '。声をかけるかどうかは、係が決めてください。',
      karteBtns(late, 3));
    // 8 留守宅カードが長く受け取られていない区域（第6弾：日数と、受け取れるカードの時間帯を出す。集まりで紹介する紙を印刷できる）
    const stuck = unclaimedCards();
    if (stuck.length) row('#8A6D00', `受け取られていない留守宅カード　${stuck.length}区域`,
      stuck.slice(0, 4).map(x => `区域${esc(x.t.no)}（${x.days}日・${x.slots.slice(0, 3).map(sl => esc(slotShort(sl))).join('、')}${x.slots.length > 3 ? `など${x.slots.length}枚` : ''}）`).join('、') + (stuck.length > 4 ? `　ほか${stuck.length - 4}区域` : '') +
        '。集まりで紹介すると、受け取ってもらいやすくなります。',
      `<button type="button" class="btn small primary" data-tcardprint>紹介の紙を印刷</button>` + go('status', 'adAwaySet', '留守宅の状況'));
    // 9 年齢データ・字
    if (typeof AGE_ON !== 'undefined' && AGE_ON) {
      const cur = typeof ageCur === 'function' ? ageCur() : null;
      if (!cur) row('#546E7A', '年齢データがまだありません', '入れると、会いやすい時間や地域のようすが出ます', go('set', 'adAge', '設定へ'));
      else if (ageStale(cur)) row('#546E7A', '年齢データが古くなっています', `${esc(cur.asOf || '')}時点のデータです。新しくしてください`, go('set', 'adAge', '設定へ'));
      const bad = ts.filter(t => t.azaErr && !(t.azaManual && t.azaManual.length));
      if (bad.length) row('#546E7A', `字を調べられなかった区域　${bad.length}区域`, `区域${listNos(bad)}。「字を直す」で手で決められます`, go('terr', 'adTerrs', '区域の一覧へ'));
    }
    // 10 毎月の点検で要確認のもの
    const warns = opsItems().filter(i => i.state === 'warn');
    if (warns.length) row('#8A6D00', `点検で要確認　${warns.length}件`, warns.map(i => esc(i.title)).join('、'), go('set', 'adOps', '点検を見る'));
    return out;
  }
  function coverHtml() {
    const c = coverInfo();
    return `<div class="cover ${c.cls}" role="status"><i aria-hidden="true">${c.mark}</i>
      <div><b>年間カバー：${c.word}</b>
        <small>1年以内に回っていない区域：<b style="font-size:inherit">${c.over}区域</b>　／　期限まで${PIN_DAYS}日以内：${c.warn}区域</small>
        <small>1年以内に回った区域：${c.known - c.over} / ${c.known}${c.none ? `</small><small>前回の記録なし ${c.none}区域 → S-13に転記してください` : ''}</small></div></div>`;
  }
  function fixTabLabel() {
    const b = document.querySelector('#adTabs [data-ap="inbox"]');
    if (b && b.firstChild && b.firstChild.nodeType === 3 && b.firstChild.textContent !== '今日') b.firstChild.textContent = '今日';
  }
  function goPane(pane, anchor) {
    setAdPane(pane);
    renderAdmin();
    $('#view-admin').scrollTop = 0;
    if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
  function paintToday() {
    if (!isAdmin()) return;
    const pane = document.querySelector('[data-apane="inbox"]');
    if (!pane) return;
    let box = document.getElementById('adToday');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adToday';
      pane.insertBefore(box, pane.firstChild);
      box.addEventListener('click', e => {
        const q = s => e.target.closest(s);
        let x;
        if ((x = q('[data-tgo]'))) goPane(x.dataset.tgo, x.dataset.anchor);
        else if ((x = q('[data-tok]'))) approveReq(x.dataset.tok, x.dataset.tterr);
        else if ((x = q('[data-tno]'))) declineReq(x.dataset.tno);
        else if ((x = q('[data-ttaken]'))) {
          const t = terrById(x.dataset.ttaken);
          if (t) commit(`区域${t.no}の受け取りを確認しました`, () => { t.selfSeen = true; t.selfSeenBy = me().id; t.selfSeenAt = new Date().toISOString(); });
        }
        else if ((x = q('[data-topen]'))) openTerr(x.dataset.topen);
        else if ((x = q('[data-tkarte]'))) openKarte(x.dataset.tkarte);
        else if (q('[data-tcardprint]')) printCardIntro();
      });
    }
    const items = todayItems();
    box.innerHTML = coverHtml() + aheadHtml() + `<h2 class="sec">今日の対応</h2>` + (items.length
      ? items.map(i => `<div class="duerow tdrow" style="border-left-color:${i.tone}"><div><p><b>${i.title}</b></p><p class="muted">${i.sub}</p></div><div class="duebtns">${i.btns}</div></div>`).join('') +
        '<p class="hint">くわしい一覧と、そのほかの操作は、この下にあります。</p>'
      : '<div class="tdnone"><b>今日対応することはありません</b><small>新しい申し込みや、急ぎの区域はありません</small></div>') + othersDoneHtml();
    // 以前の「待っているものはありません」の表示は、ここに一本化する
    const em = document.getElementById('adInboxEmpty');
    if (em) em.innerHTML = '';
    const cnt = document.getElementById('apCnt');
    if (cnt) { cnt.textContent = items.length; cnt.hidden = !items.length; }
    fixTabLabel();
    loadOps(false);
  }
  const _renderInbox = window.renderInbox;
  window.renderInbox = function () {
    _renderInbox.apply(this, arguments);
    try { paintToday(); } catch (e) { console.error(e); }
  };

  /* =========================================================
     第3弾（3）「速さを測る」に、新しい集計の時間を加える
     ========================================================= */
  if (typeof runPerfCheck === 'function') {
    const _perf = window.runPerfCheck;
    window.runPerfCheck = function () {
      _perf.apply(this, arguments);
      try {
        const rows = [];
        const T = (name, fn, k) => {
          const n = k || 1, t0 = performance.now();
          try { for (let i = 0; i < n; i++) fn(); } catch (e) { rows.push([name, -1]); return; }
          rows.push([name, (performance.now() - t0) / n]);
        };
        T('時間帯の表：記録を1周して集計', () => buildSlotAgg(), 2);
        T('時間帯の表：表を作る', () => { MEMO.delete('slotagg'); slotBoxHtml(); }, 3);
        T('「今日」：対応の項目づくり', () => { MEMO.clear(); todayItems(); coverInfo(); }, 3);
        T('訪ねても会えない家：一覧を作る', () => { MEMO.delete('cand'); candBuild(); }, 2);
        const kt = eligible()[0];
        if (kt) T('区域カルテ：1区域ぶんを作る', () => karteHtml(kt), 3);
        const tb = document.querySelector('#sheet table.slots');
        if (!tb) return;
        const mark = ms => (ms < 0 ? '×（エラー）' : ms < 100 ? '◎ 速い' : ms < 300 ? '○ ふつう' : ms < 1000 ? '△ 少し待つ' : '× 重い');
        tb.insertAdjacentHTML('beforeend', rows.map(([n, ms]) =>
          `<tr><th style="text-align:left">${esc(n)}</th><td>${ms < 0 ? '—' : Math.round(ms) + 'ms'}</td><td>${mark(ms)}</td></tr>`).join(''));
        const copy = document.getElementById('pfCopy');
        if (copy) copy.onclick = () => {
          const text = `区域マップ 動作の速さ（${navigator.userAgent.slice(0, 80)}）\n家${D().houses.length} 記録${D().visits.length}\n` +
            [...tb.querySelectorAll('tr')].slice(1).map(tr => [...tr.children].map(c => c.textContent.trim()).join(' / ')).join('\n');
          copyText(text).then(ok => toast(ok ? 'コピーしました' : 'コピーできませんでした'));
        };
      } catch (e) { console.error(e); }
    };
  }

  /* =========================================================
     第4弾（1）区域カルテ：1つの区域の「今」と「次の一手」を1画面に
     ・入り口：「区域」タブの各行・「状況」タブの期限の見張り・「今日」タブの項目にある「カルテ」ボタン
     ・区域全体の集計だけ。個々の家の一覧・家ごとの記録は出さない（10軒未満の区域は、割合と時間帯の表も出さない）
     ・時間帯の表は、第3弾の集計（区域×月）を使い回す（記録を回し直さない）
     ========================================================= */
  const css5 = document.createElement('style');
  css5.textContent = `.kq{font-weight:700;font-size:19px;margin:16px 0 4px}
.kadv{background:#FFF8E1;border:2px solid #8A6D00;border-radius:12px;padding:10px 12px;margin:8px 0}
.kadv p{margin:2px 0;font-size:18px}
.khist{list-style:none;margin:4px 0;padding:0}.khist li{padding:6px 0;border-bottom:1px solid var(--line);font-size:16px}
.kact{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.kact .btn{flex:1 1 9em}
.klend{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.klend select{min-height:50px;border-radius:10px;border:2px solid var(--ink);padding:0 8px;background:#fff;font-size:17px;max-width:100%}
.opsrow .btn{white-space:normal}.opsh{list-style:none;margin:4px 0;padding:0}.opsh li{padding:6px 0;border-bottom:1px solid var(--line);font-size:15px}`;
  document.head.appendChild(css5);

  const karteState = { period: 4 };
  const karteHomes = t => housesOf(t.id).reduce((a, h) => a + targets(h).length, 0);
  const karteDnc = t => { let n = 0; housesOf(t.id).forEach(h => targets(h).forEach(u => { if (D().dnc[K(h.id, u)]) n++; })); return n; };
  /* S-13のこの区域の履歴（新しい順に5件）。誰が受け取ったかの記録であって、人ごとの集計ではない */
  function karteHist(t) {
    const list = [];
    D().returns.filter(r => r.terrId === t.id && r.lentAt).forEach(r => list.push({ name: uname(r.by), a: dstr(r.lentAt), c: r.completed ? dstr(r.at) : '', ret: dstr(r.at) }));
    if (t.holder && t.lentAt) list.push({ name: uname(t.holder), a: dstr(t.lentAt), cur: true });
    (D().s13 || []).filter(x => x.kind === 'a' && x.terrId === t.id).forEach(x => list.push({ name: x.name, a: x.a, c: x.c || '' }));
    return list.filter(x => x.a).sort((p, q) => (p.a < q.a ? 1 : p.a > q.a ? -1 : 0)).slice(0, 5);
  }
  /* 次の一手（多くても2行）。ルールで選ぶ */
  function karteAdvice(t, homes) {
    const out = [], di = dueInfo(t);
    if (di.left != null && di.left < 0) out.push('1年の期限を過ぎています。早めに回れるようにしてください。');
    else if (di.left != null && di.left <= PIN_DAYS) out.push(`1年の期限まで、あと${di.left}日です。早めに貸し出してください。`);
    else if (di.st === 'none') out.push('前回回り終えた日の記録がありません。S-13に転記してください。');
    if (homes >= SL_AZA_MIN) {
      const q = slotQuery([t], 4), names = [];
      for (let bi = 0; bi < 5; bi++) for (let ci = 0; ci < 3; ci++) {
        if (bi === 4 && !nightOn()) continue;
        if (!q.n[bi * 3 + ci]) names.push(`${SLC[ci]}の${SLB[bi]}`);
      }
      let best = -1, bp = -1;
      for (let c = 0; c < 15; c++) if (q.n[c] >= SL_BEST && q.m[c] / q.n[c] > bp) { bp = q.m[c] / q.n[c]; best = c; }
      const ar = awayRate(t);
      if (ar >= 0.4) out.push(`訪ねた家のうち、まだ会えていない家が${Math.round(ar * 100)}%あります。${best >= 0 ? `いちばん会えているのは${SLC[best % 3]}の${SLB[Math.floor(best / 3)]}（${Math.round(bp * 100)}%）です。` : ''}`);
      if (names.length) out.push(`まだ試していない枠：${names.slice(0, 4).join('・')}${names.length > 4 ? `など${names.length}枠` : ''}。`);
    } else out.push(`家・部屋が${SL_AZA_MIN}軒に満たないため、時間帯の提案は出していません。`);
    if (!out.length) out.push('今のところ、急ぐことはありません。');
    return out.slice(0, 2);
  }
  function karteHtml(t) {
    const homes = karteHomes(t), few = homes < SL_AZA_MIN, di = dueInfo(t), per = karteState.period;
    // 1 今の状態
    let cls = 'cv-none', mark = '○', word = '空いています', sub = '';
    if (t.holder) {
      const over = t.lentAt && Date.parse(dueOf(t)) < Date.now();
      let prog = '';
      try { const r = roundInfo(t.id, true); if (r) prog = r.phase === 'away' ? `　留守宅を訪ね直す段階：${r.aw.pct}%（目安 ${awayRetPct()}%）` : `　1回目：${r.pct1}%`; } catch (e) { /* 進み具合なしで出す */ }
      cls = over ? 'cv-bad' : 'cv-ok'; mark = over ? '▲' : '✓'; word = over ? '貸出中（返却の目安を過ぎています）' : '貸出中';
      sub = `${esc(uname(t.holder))}さん・${t.lentAt ? fmtDay(t.lentAt) + 'に受け取り（' + daysSince(t.lentAt) + '日目）' : ''}　返却の目安 ${t.lentAt ? fmtDay(dueOf(t)) : '—'}${prog}`;
    } else if (t.awayPoolAt) { cls = 'cv-warn'; mark = '！'; word = '留守宅カードで回っています'; }
    else if (lendMode(t) === 'stop') { word = '貸出中止にしています'; mark = '－'; }
    { const pi = !t.holder && partialInfo(t); if (pi) { word = '空いています（途中で返却）'; sub = `${fmtDay(pi.at)}に返却・${pi.none ? 'ほとんど回っていません' : '回ったのは約' + pi.pct + '%'}`; } }
    const dueTxt = di.left == null ? '前回の記録がありません' : di.left < 0 ? `1年の期限を${-di.left}日過ぎています` : `1年の期限まで あと${di.left}日`;
    // 4 時間帯の表 5 数字
    let table, nums = '';
    if (few) {
      table = `<div class="slpriv"><b>この区域は、家・部屋が${SL_AZA_MIN}軒に満たないため、割合と時間帯の表を出しません。</b><br>少ない軒数では、特定の家の様子が推測できてしまうためです。</div>`;
    } else {
      const q = slotQuery([t], per), n = q.n.reduce((a, b) => a + b, 0), m = q.m.reduce((a, b) => a + b, 0), p = n ? Math.round(m / n * 100) : 0;
      table = `<div class="seg" role="group" aria-label="期間"><button type="button" data-kper="4" aria-pressed="${per === 4}">直近4か月</button><button type="button" data-kper="12" aria-pressed="${per === 12}">1年</button></div>` +
        slotTableHtml({ sc: 'terr', terrs: [t] }, per);
      nums = `<p>${periodLabel(per)}の記録 <b>${n}件</b>${n ? `：会えた <b>${p}%</b>（拒否を含む）・留守 <b>${100 - p}%</b>` : ''}</p><p>訪問を控える家・部屋（拒否）<b>${karteDnc(t)}</b>軒</p>${candCountFor(t) ? `<p>何度訪ねても会えない家・部屋 <b>${candCountFor(t)}</b>軒（「状況」タブの下で確かめられます）</p>` : ''}`;
    }
    const hist = karteHist(t);
    const free = !t.holder && lendMode(t) !== 'stop';
    const users = free ? D().users.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja')) : [];
    return headHtml(t, `区域${esc(t.no)}のカルテ`, esc(t.name || '')) + `
      <div class="cover ${cls}" role="status"><i aria-hidden="true">${mark}</i><div><b>${word}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>
      <p class="kq">期限</p>
      <p>前回回り終えた日：<b>${di.last ? showDay(di.last) : '記録なし'}</b>　／　<b>${dueTxt}</b></p>
      <p class="kq">次の一手</p>
      <div class="kadv">${karteAdvice(t, homes).map(x => `<p>${esc(x)}</p>`).join('')}</div>
      ${focusLineHtml(t)}
      <p class="kq">曜日と時間帯ごとの「会えた」割合</p>
      ${table}
      <p class="kq">数字</p>
      <p>家・部屋 <b>${homes}</b>軒</p>${nums}
      <p class="kq">地域のようす</p>
      ${profLine(t, 'karte:' + t.id) || '<p class="muted">年齢データがないため、出せません。</p>'}
      <p class="kq">S-13の履歴（新しい順）</p>
      ${hist.length ? `<ul class="khist">${hist.map(h => `<li>${showDay(h.a)} 〜 ${h.c ? showDay(h.c) : h.cur ? '貸出中' : h.ret ? '返却 ' + showDay(h.ret) : ''}　${esc(h.name)}さん</li>`).join('')}</ul>` : '<p class="muted">記録がありません。</p>'}
      ${free ? `<p class="kq">貸し出す</p><div class="klend"><select id="kLendSel" aria-label="貸し出す人をえらぶ"><option value="">人をえらんでください</option>${users.map(u => `<option value="${u.id}">${esc(u.name)}（今 ${heldCount(u.id)}枚）</option>`).join('')}</select>
        <button type="button" class="btn primary" id="kLend">貸し出す</button></div>` : ''}
      <div class="kact"><button type="button" class="btn" data-kmap="${t.id}">地図で見る</button><button type="button" class="btn" data-ks12="${t.id}">S-12を印刷</button><button type="button" class="btn" data-kadj="${t.id}">区域の調整</button></div>
      ${karteOpsHtml(t)}
      <button class="btn block" data-close>閉じる</button>`;
  }
  function openKarte(tid) {
    const t = terrById(tid);
    if (!t || !isAdmin() || lkLocked()) return;
    setSheet(karteHtml(t));
    const S = $('#sheet');
    $$('[data-kper]', S).forEach(b => b.onclick = () => { karteState.period = Number(b.dataset.kper); sheetKeep = true; openKarte(tid); });
    const go = (sel, fn) => { const b = $(sel, S); if (b) b.onclick = fn; };
    go('[data-kmap]', () => { closeSheet(); openTerr(tid); });
    go('[data-ks12]', () => printS12([tid], s12Opt.size, s12Opt.back));
    go('[data-kadj]', () => openAdj(tid));
    bindKarteOps(t, S);
    go('#kLend', () => {
      const v = ($('#kLendSel', S) || {}).value;
      if (!v) { toast('貸し出す人をえらんでください'); return; }
      closeSheet();
      commit(`区域${t.no}を${uname(v)}さんに貸し出しました`, () => {
        t.holder = v; t.lentAt = new Date().toISOString();
        t.helpers = []; t.group = null; t.firstDoneAt = null; t.firstDonePct = null; t.awayPoolAt = null; t.poolRetId = null;
      });
    });
  }
  let karteBound = false;
  function paintKarteBtns() {
    const list = document.getElementById('adTerrs');
    if (!list) return;
    $$('.trow', list).forEach(row => {
      const act = row.querySelector('.actions'), o = row.querySelector('[data-open]');
      if (!act || !o || act.querySelector('[data-karte]')) return;
      act.insertAdjacentHTML('afterbegin', `<button type="button" class="btn small primary" data-karte="${o.dataset.open}">カルテ</button>`);
    });
    if (!karteBound) {
      karteBound = true;
      list.addEventListener('click', e => { const b = e.target.closest('[data-karte]'); if (b) openKarte(b.dataset.karte); });
    }
  }
  const karteBtns = (ts, max) => ts.slice(0, max || 2).map(t => `<button type="button" class="btn small" data-tkarte="${t.id}">区域${esc(t.no)}のカルテ</button>`).join('');

  /* =========================================================
     第4弾（2）毎月の点検（「設定・データ」タブの上）／設定の変更履歴／整理とバックアップの状態
     ・サーバーの ops 問い合わせで読む（区域係だけ・同期には乗せない）。5分に1回まで
     ・要確認の項目は「今日」タブにも1行出す
     ========================================================= */
  const opsState = { data: null, at: 0, busy: false, fail: '' };
  const OPS_MANUAL = {
    devices: ['使わなくなったスマホの登録を外す', '辞めた人や、使わなくなったスマホの登録がないか、「今日」タブの下のスマホの一覧で確かめます'],
    people: ['区域係とグループの名簿を見直す', '転出・退会した人や、役割が変わった人がいないか確かめます']
  };
  async function loadOps(force) {
    if (!LIVE || !isAdmin() || opsState.busy) return;
    if (!force && opsState.at && Date.now() - opsState.at < 300000) return;
    opsState.busy = true;
    try {
      const j = await api('ops');
      if (j && j.ok) { opsState.data = j; opsState.fail = ''; } else opsState.fail = 'old';
    } catch (e) { opsState.fail = /unknown_action|ops/.test(String((e && e.message) || e)) ? 'old' : 'net'; }
    finally { opsState.busy = false; opsState.at = Date.now(); }
    repaintOps();
  }
  function opsItems() {
    const items = [], od = opsState.data;
    const add = (id, title, state, detail) => items.push({ id, title, state, detail });
    const wait = !LIVE ? '試作版では見られません' : opsState.fail === 'old' ? 'サーバー（Code.gs）がまだ新しい版になっていません' : opsState.fail === 'net' ? '読み込めませんでした。あとでもう一度ためしてください' : '確かめています…';
    // 年齢データ
    if (typeof AGE_ON !== 'undefined' && AGE_ON) {
      const cur = typeof ageCur === 'function' ? ageCur() : null;
      if (!cur) add('age', '年齢データが新しいか', 'warn', 'まだ入っていません');
      else if (ageStale(cur)) add('age', '年齢データが新しいか', 'warn', `${esc(cur.asOf || '')}時点のデータで、古くなっています`);
      else add('age', '年齢データが新しいか', 'ok', `${esc(cur.asOf || '')}時点`);
    }
    // S-13
    const cv = coverInfo();
    add('s13', 'S-13の「記録なし」の区域', cv.none ? 'warn' : 'ok', cv.none ? `${cv.none}区域 → S-13に転記してください` : 'ありません');
    // 保存期間（個人情報の方針は2年まで）
    const km = Number(D().settings.keepMonths) || 12;
    add('keep', '訪問記録を残す期間', km > 24 ? 'warn' : 'ok', km > 24 ? `${km}か月です。個人情報の方針（2年）をこえています。24か月以下にしてください` : `${km}か月`);
    // 自動整理
    if (!od) add('clean', '毎月の自動整理が動いたか', 'wait', wait);
    else if (od.cleanOn === false) add('clean', '毎月の自動整理が動いたか', 'warn', '毎月の自動整理が設定されていません（スプレッドシートの「区域マップ」メニューから設定）');
    else if (!od.clean) add('clean', '毎月の自動整理が動いたか', 'wait', '記録がまだありません。次の毎月1日の整理から表示されます');
    else {
      const d = daysSince(od.clean.at), c = od.clean;
      add('clean', '毎月の自動整理が動いたか', d > 40 ? 'warn' : 'ok',
        `${d > 40 ? `最後に動いたのは${d}日前です。` : ''}最後：${fmtDay(c.at)}　消した記録：訪問 ${c.visits}件・留守宅カード ${c.cards}件・申し込み ${c.reqs}件`);
    }
    // バックアップ
    if (!od) add('backup', '自動バックアップが動いているか', 'wait', wait);
    else {
      const b = od.backup || {};
      if (b.err) add('backup', '自動バックアップが動いているか', 'warn', `失敗しています：${esc(b.err)}`);
      else if (b.on === false) add('backup', '自動バックアップが動いているか', 'warn', '止まっています（スプレッドシートの「区域マップ」メニューから始めてください）');
      else if (!b.last) add('backup', '自動バックアップが動いているか', 'warn', 'まだバックアップがありません');
      else if (daysSince(b.last) > 10) add('backup', '自動バックアップが動いているか', 'warn', `最後のバックアップが${daysSince(b.last)}日前です（毎週日曜のはずです）`);
      else add('backup', '自動バックアップが動いているか', 'ok', `最後：${fmtDay(b.last)}`);
    }
    // セルの数
    if (!od) add('cells', 'スプレッドシートの大きさ', 'wait', wait);
    else if (!od.cells) add('cells', 'スプレッドシートの大きさ', 'wait', '調べられませんでした');
    else add('cells', 'スプレッドシートの大きさ', od.cells.pct >= 70 ? 'warn' : 'ok',
      `${od.cells.pct}%を使っています（${od.cells.total.toLocaleString()} / ${od.cells.limit.toLocaleString()}セル）${od.cells.pct >= 70 ? '。「shrinkSheets」を実行してください' : ''}`);
    // 係が自分でチェックする項目（月が変わると空に戻る）
    const chk = (od && od.checks && od.checks.items) || {};
    Object.keys(OPS_MANUAL).forEach(id => {
      const c = chk[id];
      if (!od) add(id, OPS_MANUAL[id][0], 'wait', wait);
      else add(id, OPS_MANUAL[id][0], c ? 'done' : 'todo', c ? `${esc(c.by)}さんが${fmtDay(c.at)}に確認` : OPS_MANUAL[id][1]);
    });
    return items;
  }
  function paintOps() {
    if (!isAdmin()) return;
    const pane = document.querySelector('[data-apane="set"]');
    if (!pane) return;
    let box = document.getElementById('adOpsBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adOpsBox';
      pane.insertBefore(box, pane.firstChild);
      box.addEventListener('click', async e => {
        const c = e.target.closest('[data-opschk]'), r = e.target.closest('[data-opsre]');
        if (c) {
          try {
            const j = await api('ops_check', { id: c.dataset.opschk, on: c.dataset.on === '1' });
            if (j && j.ok && opsState.data) opsState.data.checks = j.checks;
            repaintOps();
          } catch (err) { toast('保存できませんでした'); }
        } else if (r) { toast('確かめています…'); loadOps(true); }
      });
    }
    const items = opsItems(), warn = items.filter(i => i.state === 'warn').length;
    const MK = { ok: ['#2E7D32', '✓ 済み'], warn: ['#C2410C', '！ 要確認'], wait: ['#546E7A', '・ 確認中'], todo: ['#8A6D00', '□ 未チェック'], done: ['#2E7D32', '✓ チェック済み'] };
    const hist = (opsState.data && opsState.data.history) || [];
    box.innerHTML = `<h2 class="sec" id="adOps">毎月の点検</h2>
      <div class="cover ${warn ? 'cv-warn' : 'cv-ok'}" role="status"><i aria-hidden="true">${warn ? '！' : '✓'}</i><div><b>${warn ? `要確認が${warn}件あります` : 'いまのところ、問題はありません'}</b><small>月が変わると、係のチェックは空に戻ります</small></div></div>
      ${items.map(i => `<div class="duerow opsrow" style="border-left-color:${MK[i.state][0]}"><div><p><b>${MK[i.state][1]}</b>　${esc(i.title)}</p><p class="muted">${i.detail}</p></div>
        ${i.state === 'todo' ? `<div class="duebtns"><button type="button" class="btn small primary" data-opschk="${i.id}" data-on="1">確認した</button></div>`
          : i.state === 'done' ? `<div class="duebtns"><button type="button" class="btn small" data-opschk="${i.id}" data-on="0">取り消す</button></div>` : '<div></div>'}</div>`).join('')}
      <details class="dueset"><summary>設定の変更・書き出しの履歴（新しい順・${hist.length}件）</summary>
        ${hist.length ? `<ul class="opsh">${hist.map(h => /^書き出し：/.test(h.name)
          ? `<li>${esc(h.at)}　${esc(h.who)}さん：<b>${esc(h.name)}</b>${h.to ? `（${esc(h.to)}）` : ''}</li>`
          : `<li>${esc(h.at)}　${esc(h.who)}さん：${esc(h.name)}　${esc(h.from)} → ${esc(h.to)}</li>`).join('')}</ul>` : '<p class="muted">履歴はまだありません。これから変えた設定や、書き出し・印刷が、ここに残ります。</p>'}
        <p class="hint">この履歴は区域係だけが見られます。設定の値と、だれがいつ何を書き出したか（S-12・S-13の印刷、CSV）だけを残し、家や訪問の記録の中身は入れていません。</p></details>
      <button type="button" class="btn small" data-opsre="1">最新の状態にする</button>`;
  }
  function repaintOps() {
    try { paintOps(); } catch (e) { console.error(e); }
    try { paintToday(); } catch (e) { console.error(e); }
    try { if (document.getElementById('adCand')) paintCand(); } catch (e) { console.error(e); }
  }

  /* =========================================================
     第5弾（1）訪ねても会えない家（住んでいないかもしれない家）を、係が確かめる
     ・係の画面「状況」タブの下にだけ出す。その場で計算するだけで、家のデータには何も印を付けない
     ・伝道者のスマホには送らない／印刷・CSV・PDFには出さない
     ・「人が住んでいた」は、サーバーに「確認ずみ」の印として（家の番号だけ）半年間おぼえる（係の問い合わせ ops でだけ返す）
     ========================================================= */
  const CAND = { minAway: 4, minSlots: 3, minSpanDays: 60, keepDays: 180 };
  const candSeen = new Set();           // 「様子を見る」：この画面を開いているあいだだけ隠す
  const ckLocal = {};                   // 試作版（サーバーなし）のとき、この画面を開いているあいだだけおぼえる
  const todayNum = () => Math.floor(Date.now() / 86400000);
  const ckMap = () => (opsState.data && opsState.data.ck) || ckLocal;
  const ckOn = k => { const v = ckMap()[k]; return v != null && todayNum() - Number(v) < CAND.keepDays; };
  const NIGHT_OR_WEEKEND = (1 << 4) | 0x3E0;   // 平日・夜 と 土日の全部（SLOTS の並びは 平日5つ→土日5つ）
  /* 候補を数える：一度も会えていない／留守を4回以上／3つ以上の違う時間帯／夜か土日をふくむ／最初から最後まで2か月以上 */
  function candBuild() {
    return memo('cand', () => {
      const ok = new Set(eligible().map(t => t.id)), by = new Map(), prov = new Map();
      for (const h of D().houses) {
        if (!h.terrId || !ok.has(h.terrId)) continue;
        for (const u of targets(h)) {
          const k = K(h.id, u), s = sum(k);
          if (D().dnc[k]) continue;
          if (!s.n) { if (h.prov && !u) { if (!prov.has(h.terrId)) prov.set(h.terrId, []); prov.get(h.terrId).push({ k, h, u }); } continue; }
          if (!s.unmet || s.awayN < CAND.minAway || slotCount(s.awaySlots) < CAND.minSlots || !(s.awaySlots & NIGHT_OR_WEEKEND)) continue;
          const vs = visitsOf(k), span = (Date.parse(s.last.at) - Date.parse(vs[vs.length - 1].at)) / DAY;
          if (span < CAND.minSpanDays) continue;
          if (!by.has(h.terrId)) by.set(h.terrId, []);
          by.get(h.terrId).push({ k, h, u, s, span: Math.round(span), first: vs[vs.length - 1].at, letter: slotCount(s.slots) >= triesFor(TID.get(h.terrId)) });
        }
      }
      return { by, prov };
    });
  }
  const candCountFor = t => { const c = candBuild(), a = c.by.get(t.id) || []; return a.filter(x => !ckOn(x.k)).length; };
  const candName = x => (x.h.type === 'apt' ? `${esc(x.h.label || '集合住宅')} ${esc(x.u)}` : esc(x.h.label || '目印なし'));
  function candRow(x, prov) {
    const isApt = x.h.type === 'apt';
    return `<div class="duerow" style="border-left-color:#8A6D00"><div><p><b>${candName(x)}</b></p>
      <p class="muted">${prov ? 'まだ一度も訪ねていない仮の家です' : `留守 ${x.s.awayN}回（${slotCount(x.s.awaySlots)}つの時間帯）・${showDay(dstr(x.first))}〜${showDay(dstr(x.s.last.at))}`}${x.letter ? '<span class="tag-warn">手紙の候補にも入っています</span>' : ''}</p></div>
      <div class="duebtns"><button type="button" class="btn small" data-cmap="${x.h.id}">地図で見る</button>
        ${isApt ? '<span class="muted">部屋は地図で確かめてください</span>' : `<button type="button" class="btn small danger" data-cgone="${x.h.id}">空き家だった</button>`}
        <button type="button" class="btn small primary" data-clive="${esc(x.k)}">人が住んでいた</button>
        <button type="button" class="btn small" data-cwait="${esc(x.k)}">様子を見る</button></div></div>`;
  }
  function paintCand() {
    if (!isAdmin() || lkLocked()) return;
    const pane = document.querySelector('[data-apane="status"]');
    if (!pane) return;
    let box = document.getElementById('adCand');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adCand';
      pane.appendChild(box);
      box.addEventListener('click', async e => {
        const q = s => e.target.closest(s);
        let x;
        if ((x = q('[data-cmap]'))) {
          const h = houseById(x.dataset.cmap);
          if (h) { openTerr(h.terrId); setTimeout(() => { try { if (h.lat != null) map.setView([h.lat, h.lng], 19); } catch (err) { /* 地図だけ開く */ } }, 500); }
        } else if ((x = q('[data-cwait]'))) { candSeen.add(x.dataset.cwait); paintCand(); }
        else if ((x = q('[data-clive]'))) {
          const k = x.dataset.clive;
          if (LIVE) { try { const j = await api('ops_ck', { k, on: true }); if (opsState.data) opsState.data.ck = j.ck; } catch (err) { toast('保存できませんでした（サーバーが新しい版か確かめてください）'); return; } }
          else ckLocal[k] = todayNum();
          toast('候補から外しました（半年は出しません）'); paintCand();
        } else if ((x = q('[data-cgone]'))) {
          const h = houseById(x.dataset.cgone);
          if (h && await ask(`「${h.label || '目印なし'}」を消します。訪問の記録も一緒に消えます（消したあとの「取り消す」で戻せます）。よろしいですか？`)) deleteHouse(h.id);
        }
      });
    }
    const c = candBuild();
    const tids = [...c.by.keys()].filter(id => c.by.get(id).some(x => !ckOn(x.k) && !candSeen.has(x.k)));
    const total = tids.reduce((a, id) => a + c.by.get(id).filter(x => !ckOn(x.k) && !candSeen.has(x.k)).length, 0);
    const provN = [...c.prov.values()].reduce((a, l) => a + l.length, 0);
    const terrs = tids.map(id => TID.get(id)).filter(Boolean).sort(byNo);
    box.innerHTML = `<h2 class="sec" id="adCandH">何度訪ねても会えない家（${total}軒）</h2>
      <div class="notice warn"><b>この一覧は、区域係だけが見るものです。</b>住んでいないかもしれない家の情報なので、人に見せたり、写真に撮ったり、書き写したりしないでください。</div>
      <p class="hint">違う時間帯で${CAND.minAway}回以上留守で、一度も会えていない家です（夜か土日を含み、最初から最後まで${Math.round(CAND.minSpanDays / 30)}か月以上）。現地で様子を確かめて、「空き家だった」か「人が住んでいた」を選びます。</p>
      ${terrs.length ? terrs.map(t => {
        const list = c.by.get(t.id).filter(x => !ckOn(x.k) && !candSeen.has(x.k));
        return `<details class="dueset"><summary>区域${esc(t.no)}　${esc(t.name || '')}（${list.length}軒）</summary>${list.map(x => candRow(x, false)).join('')}</details>`;
      }).join('') : '<div class="tdnone"><b>確かめる家はありません</b></div>'}
      ${provN ? `<details class="dueset"><summary>地図から入れた仮の家で、まだ一度も訪ねていない家（${provN}軒）</summary>${[...c.prov.entries()].map(([id, l]) => TID.get(id) ? `<p class="q">区域${esc(TID.get(id).no)}</p>` + l.filter(x => !ckOn(x.k) && !candSeen.has(x.k)).slice(0, 30).map(x => candRow(x, true)).join('') : '').join('')}</details>` : ''}`;
  }

  /* =========================================================
     第5弾（2）区域の地図の「期限で色分け」（係だけ・この端末だけ）
     ・前回回り終えた日からの日数で、区域の塗りを変える。色だけでなく、記号・線の形・凡例でも分かる
     ・区域の線（約80）だけを塗り替える。家の印は描き直さない
     ・番号の札は、縮尺に合わせて出し分ける
       縮小：色だけ → 中間：小さな番号 → 拡大：くわしい札。重なるときは、期限の近い区域を優先
     ・係の画面では、「切」のときも同じ出し分けにする（番号が重なって区域が見えなくなるのを防ぐ）
     ========================================================= */
  const cssDm = document.createElement('style');
  cssDm.textContent = `.maptools{align-items:flex-start}
.dm-ctl{position:relative;margin:0 0 0 auto;align-self:flex-start;font-size:15px;line-height:1.5}
.dm-ctl[hidden]{display:none}
.maptools>.dm-ctl{box-shadow:none}
.dm-ctl>.btn.small{min-height:52px;border-radius:12px;padding-left:14px;padding-right:14px;white-space:nowrap;box-shadow:0 2px 6px #0003}
.dm-drop{position:absolute;top:calc(100% + 6px);right:0;width:max-content;max-width:min(250px,calc(100vw - 20px));display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.dm-drop>*{background:var(--paper,#fff);border:2px solid var(--ink,#222);border-radius:12px;box-shadow:0 2px 6px #0003;box-sizing:border-box}
.dm-drop .dm-hint{margin:0;padding:2px 10px;white-space:nowrap}
.dm-drop details{padding:0 8px;width:100%}
.dm-ctl .sw{display:inline-block;width:16px;height:16px;border-radius:4px;border:2px solid #333;vertical-align:-3px;margin-right:4px}
.dm-ctl p{margin:3px 0}.dm-ctl summary{cursor:pointer;min-height:36px;line-height:36px;font-weight:700}
body.duemode .terr-label:not(.duelab){display:none}
.duelab span{pointer-events:auto;cursor:pointer;display:inline-block;min-height:34px;line-height:30px;background:#fff;border:2px solid #222;border-radius:8px;padding:1px 6px;font-weight:700;font-size:15px;white-space:nowrap;color:#111}
.duelab.cp span{min-height:0;line-height:18px;font-size:13px;padding:0 4px;border-width:1.5px;border-radius:6px}
.duelab.ro span{pointer-events:none;cursor:default}
.duelab.off span{border-color:var(--terr);color:var(--terr)}`;
  document.head.appendChild(cssDm);
  const DMC = {
    ok: ['#0072B2', '✓', '4か月以内に回った'], mid: ['#F0E442', '！', '4〜8か月前'], long: ['#E69F00', '▲', '8か月〜1年前'],
    over: ['#D55E00', '✕', '1年をこえた'], none: ['#8C8C8C', '？', '前回の記録なし']
  };
  const DM_PRI = { over: 0, long: 1, mid: 2, none: 3, ok: 4 };   // 札が重なったときに残す順（期限が近い区域を先に）
  const cssAt = document.createElement('style');
  cssAt.textContent = '.leaflet-control-attribution{font-size:10px;opacity:.75;padding:0 4px}';
  document.head.appendChild(cssAt);
  const dmState = { on: lsGet('kuiki_duemode') === '1' };
  let dueLayer = null, dmCtl = null, dmRaf = 0, dmHtml = '';
  function dmClass(t) {
    const d = dueInfo(t);
    if (!d.last) return 'none';
    const days = daysFrom(d.last);
    return days <= 120 ? 'ok' : days <= 240 ? 'mid' : days <= YEAR ? 'long' : 'over';
  }
  /* 今の縮尺で、番号の札をどう出すか。画面に入っている区域の広さ（真ん中の値）で決める */
  function dmLabelMode(list, on) {
    const b = map.getBounds(), areas = [];
    list.forEach(t => {
      if (!b.intersects(L.latLngBounds(t.polygon))) return;
      const a = terrScreenArea(t);
      if (a > 0) areas.push(a);
    });
    if (!areas.length) return 'full';
    areas.sort((x, y) => x - y);
    const med = areas[Math.floor(areas.length / 2)];
    return med < (on ? 1500 : 400) ? 'none' : med < 6000 ? 'cp' : 'full';
  }
  function paintDueMap() {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    // 地図の右下の「Leaflet」の文字は消す（国土地理院の出典表示だけ残す）
    try { if (map.attributionControl) map.attributionControl.setPrefix(false); } catch (e) { /* 表示だけの話なので無視 */ }
    if (!dmCtl) {
      // 操作の枠は、地図の上の「区域をえらぶ・家を追加」と同じ入れ物に入れる。
      // 同じ行に入りきらないときは自然に次の行へ回るので、どんな画面の幅・文字の大きさでも重ならない
      const host = document.getElementById('mapTools');
      if (!host) return;
      const d = document.createElement('div'); d.className = 'dm-ctl'; d.id = 'dmCtl'; d.hidden = true;
      host.appendChild(d); dmCtl = d;
      d.addEventListener('click', e => {
        if (!e.target.closest('[data-dmtog]')) return;
        dmState.on = !dmState.on; lsSet('kuiki_duemode', dmState.on ? '1' : '0');
        renderTerrs();
      });
      // 拡大・縮小・移動のあと、番号の札を出し直す（続けて動かしているあいだは、描き直しは1コマに1回まで）
      map.on('zoomend moveend', () => {
        if (dmRaf) return;
        dmRaf = requestAnimationFrame(() => { dmRaf = 0; try { paintDueMap(); } catch (e) { console.error(e); } });
      });
    }
    if (!dueLayer) dueLayer = L.layerGroup().addTo(map);
    dueLayer.clearLayers();
    const show = isAdmin() && !lkLocked(), on = show && dmState.on;
    document.body.classList.toggle('duemode', show);
    const ctl = document.getElementById('dmCtl');
    ctl.hidden = !show;
    if (!show) return;
    const ts = polyTerrs().filter(t => on ? !t.dummy : true);
    const mode = dmLabelMode(ts, on);
    // 操作の枠：中身が変わったときだけ作り直す（開いている凡例が、地図を動かすたびに閉じないように）
    // ボタンは1つだけを同じ行に置く。説明と凡例は、ボタンの下に重ねて出す（行の高さを変えないため）
    const html = `<button type="button" class="btn small ${on ? 'primary' : ''}" data-dmtog aria-pressed="${on}" aria-label="期限で色分け：${on ? '入' : '切'}">期限：${on ? '入' : '切'}</button>` +
      (mode === 'none' || on ? '<div class="dm-drop">' +
        (mode === 'none' ? '<p class="dm-hint">拡大すると番号が出ます</p>' : '') +
        (on ? `<details><summary>凡例（色・記号の意味）</summary><div>${Object.keys(DMC).map(k => `<p><span class="sw" style="background:${DMC[k][0]}"></span>${DMC[k][1]} ${DMC[k][2]}</p>`).join('')}<p>線が破線＝貸出中（番号の横に「貸」）<br>点線＝貸出中止（「止」）</p><p class="muted"><b>番号の札</b>か、色のついた場所を押すと、その区域の詳しい情報（カルテ）が開きます</p></div></details>` : '') +
        '</div>' : '');
    if (html !== dmHtml) {
      const wasOpen = !!(ctl.querySelector('details') && ctl.querySelector('details').open);
      ctl.innerHTML = html; dmHtml = html;
      if (wasOpen && ctl.querySelector('details')) ctl.querySelector('details').open = true;
    }
    // 区域の塗り（「入」のときだけ）。縮小しているときは、色を濃く・線を細くして、色が見やすいようにする
    if (on) {
      for (const t of ts) {
        const c = DMC[dmClass(t)], held = !!t.holder, stop = lendMode(t) === 'stop';
        L.polygon(t.polygon, { color: '#222', weight: held || stop ? (mode === 'none' ? 2.5 : 4) : (mode === 'none' ? 1.2 : 2),
          dashArray: held ? '10 6' : stop ? '2 8' : null, fillColor: c[0], fillOpacity: mode === 'none' ? 0.6 : 0.4, opacity: 0.9, bubblingMouseEvents: false })
          .on('click', () => openKarte(t.id)).addTo(dueLayer);
      }
    }
    // 番号の札：縮尺で出し分け、重なるものは優先順で残す
    if (mode === 'none') return;
    const sz = map.getSize(), c0 = sz.divideBy(2), sel = on ? null : selTerrId();
    const scr = ll => { const p = map.latLngToContainerPoint(ll); return map._kmRad ? c0.add(rotPt(p.subtract(c0), map._kmRad)) : p; };
    const cp = mode === 'cp';
    const items = [];
    ts.forEach(t => {
      const ll = center(t.polygon), p = scr(ll);
      if (p.x < -20 || p.y < -20 || p.x > sz.x + 20 || p.y > sz.y + 20) return;
      let text, pri;
      if (on) {
        const k = dmClass(t), c = DMC[k], held = !!t.holder, stop = lendMode(t) === 'stop';
        text = cp ? `${c[1]}${t.no}` : `${c[1]} ${t.no}${held ? ' 貸' : stop ? ' 止' : ''}`;
        pri = DM_PRI[k];
      } else {
        text = `${t.group ? 'G ' : ''}${t.no}`;
        pri = sel && t.id === sel ? 0 : 1;
      }
      items.push({ t, ll, p, text, pri });
    });
    items.sort((a, b) => a.pri - b.pri || cmpNo(a.t.no, b.t.no));
    const placed = [];
    for (const it of items) {
      const w = cp ? 10 + 9 * it.text.length : 18 + 11 * it.text.length, h = cp ? 24 : 36;
      const r = [it.p.x - w / 2 - 2, it.p.y - h / 2 - 2, it.p.x + w / 2 + 2, it.p.y + h / 2 + 2];
      if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;   // 先に置いた札と重なるものは出さない
      placed.push(r);
      const faint = !on && sel && it.t.id !== sel;
      const m = L.marker(it.ll, { icon: L.divIcon({ className: `terr-label duelab${cp ? ' cp' : ''}${on ? '' : ' ro off'}${faint ? ' faint' : ''}`, html: `<span>${esc(it.text)}</span>`, iconSize: [0, 0] }),
        interactive: on, bubblingMouseEvents: false, keyboard: false, pane: 'labelPane' });
      if (on) m.on('click', () => openKarte(it.t.id));
      m.addTo(dueLayer);
    }
  }
  const _renderTerrs = window.renderTerrs;
  window.renderTerrs = function () {
    _renderTerrs.apply(this, arguments);
    try { paintDueMap(); } catch (e) { console.error(e); }
  };

  /* =========================================================
     第5弾（3）係の画面の自動ロック（この端末だけ）
     ・これは「のぞき見を防ぐ」ためのものです。端末の中のデータを暗号化するものではありません
     ・ロックするのは、係の画面と、そこから開いた画面だけ。区域カード・地図・記録の入力は止めない／同期も止めない
     ・解除は、この端末で決めた番号（4〜6桁・そのままでは保存しない）。顔認証・指紋は、番号とあわせて使える
     ・時間は、最後に係の画面を触ってから数える（ほかの画面を使っていても、時間がたてばロックされる）
     ========================================================= */
  const cssLk = document.createElement('style');
  cssLk.textContent = `#alockScr{position:fixed;inset:0;z-index:4800;background:var(--bg,#F4F1EA);display:grid;place-items:center;padding:24px;overflow:auto}
#alockScr[hidden]{display:none}#alockScr .lkbox{max-width:420px;width:100%;text-align:center}
#alockScr input{font-size:30px;letter-spacing:.4em;text-align:center;width:100%;min-height:62px;border:3px solid var(--ink,#222);border-radius:12px;background:#fff}
#alockScr .btn{margin-top:10px}.lkmsg{min-height:1.6em;color:#B71C1C;font-weight:700}
.lkset input[type=password]{font-size:22px;letter-spacing:.3em;min-height:50px;border:2px solid var(--ink,#222);border-radius:10px;padding:0 10px;width:9em;background:#fff}
.lkset select{min-height:50px;border-radius:10px;border:2px solid var(--ink,#222);padding:0 8px;background:#fff;font-size:17px}`;
  document.head.appendChild(cssLk);
  const LK_CFG = 'kuiki_alock', LK_FAIL = 'kuiki_alock_f';
  const lk = { locked: false, last: Date.now(), cb: null };
  const lkCfg = () => { try { return JSON.parse(lsGet(LK_CFG) || 'null'); } catch (e) { return null; } };
  const lkSave = c => (c ? lsSet(LK_CFG, JSON.stringify(c)) : lsDel(LK_CFG));
  const lkFails = () => { try { return JSON.parse(lsGet(LK_FAIL) || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; } };
  const lkCan = () => !!(window.crypto && crypto.subtle && window.TextEncoder);
  const bioCan = () => !!(window.PublicKeyCredential && navigator.credentials && lkCan());
  const lkActive = () => { try { return isAdmin() && !!lkCfg(); } catch (e) { return false; } };
  const lkLocked = () => lkActive() && lk.locked;
  const b64e = u8 => btoa(String.fromCharCode.apply(null, u8));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function pinHash(pin, salt, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return b64e(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(salt), iterations: iter }, key, 256)));
  }
  async function lkSetPin(pin) {
    const salt = b64e(crypto.getRandomValues(new Uint8Array(16))), iter = 150000, old = lkCfg() || {};
    lkSave({ salt, iter, hash: await pinHash(pin, salt, iter), bio: old.bio || null, min: old.min || 10 });
    lsDel(LK_FAIL);
  }
  async function bioEnroll() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: '区域マップ' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'kuiki-admin', displayName: '区域係' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000, attestation: 'none' } });
    const c = lkCfg(); c.bio = b64e(new Uint8Array(cred.rawId)); lkSave(c);
  }
  async function bioCheck() {
    const c = lkCfg();
    await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: b64d(c.bio) }], userVerification: 'required', timeout: 60000 } });
  }
  function lkUnlocked() {
    lk.locked = false; lk.last = Date.now(); lsDel(LK_FAIL);
    const s = document.getElementById('alockScr'); if (s) s.hidden = true;
    const cb = lk.cb; lk.cb = null;
    try { paintDueMap(); } catch (e) { /* 地図なし */ }
    if (cb) cb();
  }
  function lockNow() {
    if (!lkActive() || lk.locked) return;
    lk.locked = true;
    if (currentView === 'admin' || !document.getElementById('s13View').hidden) {
      closeSheet();
      document.getElementById('s13View').hidden = true;
      showLockScreen();
    }
    try { paintDueMap(); } catch (e) { /* 地図なし */ }
  }
  function showLockScreen(cb) {
    lk.cb = cb || null;
    let s = document.getElementById('alockScr');
    if (!s) {
      s = document.createElement('div'); s.id = 'alockScr'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
      document.body.appendChild(s);
      s.addEventListener('click', async e => {
        const msg = s.querySelector('.lkmsg'), inp = s.querySelector('input');
        const c = lkCfg();
        if (e.target.closest('[data-lkok]')) {
          const f = lkFails();
          if (Date.now() < f.until) { msg.textContent = `あと${Math.ceil((f.until - Date.now()) / 1000)}秒待ってから、もう一度ためしてください`; return; }
          const pin = inp.value;
          if (!c || !/^\d{4,6}$/.test(pin)) { msg.textContent = '4〜6桁の数字を入れてください'; return; }
          const h = await pinHash(pin, c.salt, c.iter);
          if (h === c.hash) { inp.value = ''; lkUnlocked(); return; }
          f.n++; f.until = f.n >= 5 ? Date.now() + Math.min(300, 30 * Math.pow(2, f.n - 5)) * 1000 : 0; lsSet(LK_FAIL, JSON.stringify(f));
          inp.value = ''; msg.textContent = f.until ? `まちがえました。${Math.ceil((f.until - Date.now()) / 1000)}秒待ってください` : `番号がちがいます（あと${5 - f.n}回で待ち時間が入ります）`;
        } else if (e.target.closest('[data-lkbio]')) {
          try { await bioCheck(); lkUnlocked(); } catch (err) { msg.textContent = '顔認証・指紋で開けませんでした。番号を入れてください'; }
        } else if (e.target.closest('[data-lkhome]')) { s.hidden = true; lk.cb = null; showView('home'); }
        else if (e.target.closest('[data-lkforget]')) {
          if (!await ask('このスマホの「係」としての登録を外して、登録し直します。\n区域係からもらったリンクを開き直し、ほかの区域係に承認してもらう必要があります。\n（このスマホの区域の情報は消えます。サーバーのデータは消えません）\nよろしいですか？')) return;
          lkSave(null); lsDel(LK_FAIL);
          Store.authLost = true; clearTimeout(Store.cacheTimer); IDB.clearCache().catch(() => {}); clearAllMemos();
          [TOKEN_KEY, QUEUE_KEY, SYNC_KEY, PENDING_KEY, FAILED_KEY].forEach(lsDel); Store.queue = [];
          s.hidden = true;
          showBlocking('登録を外しました', 'もう一度使うときは、区域係からもらったリンクを開いてください。ほかの区域係が、このスマホの登録を承認します。');
        }
      });
      s.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const b = s.querySelector('[data-lkok]'); if (b) b.click(); } });
    }
    const c = lkCfg() || {};
    s.innerHTML = `<div class="lkbox"><h2>係の画面はロックされています</h2>
      <p class="muted">${c.min || 10}分以上、さわっていなかったためです。番号を入れてください。</p>
      <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" aria-label="番号（4〜6桁）">
      <p class="lkmsg" role="alert"></p>
      <button type="button" class="btn primary block" data-lkok>開く</button>
      ${c.bio && bioCan() ? '<button type="button" class="btn block" data-lkbio>顔認証・指紋で開く</button>' : ''}
      <button type="button" class="btn block" data-lkhome>ほかの画面へ</button>
      <p><button type="button" class="btn small" data-lkforget>番号を忘れた</button></p></div>`;
    s.hidden = false;
    const f = lkFails();
    if (Date.now() < f.until) s.querySelector('.lkmsg').textContent = `あと${Math.ceil((f.until - Date.now()) / 1000)}秒待ってください`;
    setTimeout(() => { const i = s.querySelector('input'); if (i) i.focus(); }, 50);
  }
  /* 係の画面を触ったら、時間を数え直す。時間がたったら、ロックする */
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => {
    if (currentView === 'admin' || !document.getElementById('s13View').hidden) { if (!lk.locked) lk.last = Date.now(); }
  }, true));
  function lkCheck() {
    if (!lkActive() || lk.locked) return;
    const c = lkCfg();
    if (Date.now() - lk.last >= (c.min || 10) * 60000) lockNow();
  }
  setInterval(lkCheck, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lkCheck(); });
  window.addEventListener('pageshow', lkCheck);
  if (lkCfg()) lk.locked = true;   // アプリを開き直したときは、最初からロックしておく
  const _showView = window.showView;
  window.showView = function (name) {
    if (name === 'admin' && lkLocked()) { showLockScreen(() => _showView.call(this, 'admin')); return; }
    return _showView.apply(this, arguments);
  };
  /* 「設定・データ」タブ：この端末の自動ロック */
  function paintLockBox() {
    if (!isAdmin() || lkLocked()) return;
    const pane = document.querySelector('[data-apane="set"]');
    if (!pane) return;
    let box = document.getElementById('adLockBox');
    if (!box) {
      box = document.createElement('div'); box.id = 'adLockBox'; box.className = 'lkset';
      const ref = document.getElementById('adOpsBox');
      pane.insertBefore(box, ref ? ref.nextSibling : pane.firstChild);
      box.addEventListener('click', async e => {
        const q = s => e.target.closest(s), c = lkCfg();
        try {
          if (q('[data-lkset]')) {
            const a = $('#lkP1').value, b = $('#lkP2').value;
            if (!/^\d{4,6}$/.test(a)) { toast('4〜6桁の数字を入れてください'); return; }
            if (a !== b) { toast('2回の番号が同じではありません'); return; }
            await lkSetPin(a); lk.locked = false; lk.last = Date.now(); toast('自動ロックを始めました'); paintLockBox();
          } else if (q('[data-lknow]')) { lockNow(); }
          else if (q('[data-lkbioon]')) { await bioEnroll(); toast('顔認証・指紋を使えるようにしました'); paintLockBox(); }
          else if (q('[data-lkbiooff]')) { c.bio = null; lkSave(c); paintLockBox(); }
          else if (q('[data-lkoff]')) { if (await ask('この端末の自動ロックをやめます。よろしいですか？')) { lkSave(null); lsDel(LK_FAIL); lk.locked = false; paintLockBox(); paintDueMap(); } }
        } catch (err) { toast('うまくいきませんでした：' + ((err && err.message) || err)); }
      });
      box.addEventListener('change', e => { if (e.target.id === 'lkMin') { const c = lkCfg(); if (c) { c.min = Number(e.target.value); lkSave(c); toast('ロックまでの時間を変えました'); } } });
    }
    const c = lkCfg(), mins = [5, 10, 15, 20, 30];
    box.innerHTML = `<h2 class="sec">この端末の自動ロック</h2>
      <div class="notice info"><b>のぞき見を防ぐためのものです。</b>端末の中のデータを暗号化するものではありません。この端末の画面ロック（パスコードなど）も、必ず設定してください。この設定は、この端末だけに保存されます。</div>
      <p class="hint">係の画面を触らないまま時間がたつと、係の画面を隠します（区域カード・地図・記録の入力は、そのまま使えます）。</p>
      ${!lkCan() ? '<p class="muted">この環境では使えません（安全な接続のときだけ使えます）。</p>' : !c ? `
        <p>番号（4〜6桁）を決めます。<br><input type="password" id="lkP1" inputmode="numeric" maxlength="6" autocomplete="new-password" aria-label="新しい番号"> <input type="password" id="lkP2" inputmode="numeric" maxlength="6" autocomplete="new-password" aria-label="もう一度同じ番号"></p>
        <button type="button" class="btn primary" data-lkset>この番号で始める</button>` : `
        <p>状態：<b>✓ 使っています</b>　ロックまでの時間 <select id="lkMin" aria-label="ロックまでの時間">${mins.map(m => `<option value="${m}"${(c.min || 10) === m ? ' selected' : ''}>${m}分</option>`).join('')}</select></p>
        <div class="kact"><button type="button" class="btn" data-lknow>今すぐロックする</button>
          ${bioCan() ? (c.bio ? '<button type="button" class="btn" data-lkbiooff>顔認証・指紋をやめる</button>' : '<button type="button" class="btn" data-lkbioon>顔認証・指紋も使う</button>') : ''}
          <button type="button" class="btn danger" data-lkoff>自動ロックをやめる</button></div>
        <p class="hint">番号を忘れたときは、ロックの画面の「番号を忘れた」から、このスマホの登録を外して登録し直します（ほかの区域係の承認が必要です）。番号をかえるときは、いったん「自動ロックをやめる」から決め直してください。</p>`}`;
  }

  /* =========================================================
     記録のあとの表示（静かにする）
     ・記録のあとの「次のおすすめ」の枠は出さない
     ・「取り消す」は、画面の一番下に、小さく目立たない帯で出す（数秒で消える）
     ========================================================= */
  const cssQ = document.createElement('style');
  cssQ.textContent = `#toast.quiet,body.sheet-open #toast.quiet,body.wheel-open #toast.quiet{top:auto;bottom:calc(4px + env(safe-area-inset-bottom));z-index:900;background:#5b6661;color:#e9eeec;border-radius:10px;padding:4px 6px 4px 10px;gap:8px;font-size:13px;box-shadow:none;opacity:.88;max-width:calc(100% - 16px)}
#toast.quiet button{min-height:32px;border-width:1px;border-radius:8px;font-size:13px;padding:0 10px;font-weight:600}`;
  document.head.appendChild(cssQ);
  window.showNextPanel = function () { return false; };
  const _quickVisit = window.quickVisit;
  let quietOn = false;
  window.quickVisit = function () {
    quietOn = true;
    try { return _quickVisit.apply(this, arguments); } finally { quietOn = false; }
  };
  const _toast = window.toast;
  let quietTm = 0;
  window.toast = function () {
    const r = _toast.apply(this, arguments);
    try {
      const el = document.getElementById('toast');
      clearTimeout(quietTm);
      el.classList.toggle('quiet', quietOn);
      if (quietOn) quietTm = setTimeout(() => { el.hidden = true; el.classList.remove('quiet'); }, 8000);
    } catch (e) { /* 表示だけの話 */ }
    return r;
  };

  /* =========================================================
     第6弾 区域係の画面の見直し（操作性・機能性）
     （1）区域をさがす欄／区域の一覧の「そのほかの操作」をたたむ／貸し出しのきまりをたたむ
     （2）区域の操作をカルテに集める（返却・担当・貸し出しのきまり・線・番号・字・削除）
     （3）係どうしで同じ仕事をしない：貸し出す・見送る前に最新を確かめる。だれが対応したかを残し、「今日」に出す
     （4）戻せる操作は確認を出さず、「取り消す」で守る（申し込みの見送りなど）
     （5）パソコン（幅1180px以上）では、カルテなどを右側に出して、一覧と並べて見る
     （6）各画面の「この画面の使い方」
     （7）時間帯の表の「未試行」から、その時間帯の留守宅カードを「重点」にする（全員の一覧の上に「区域係のおすすめ」）
     （8）受け取られていない留守宅カード：日数と時間帯を出し、集まりで紹介する紙を印刷する
     （9）「今日」に、これからの期限の見通しと、今月の成果（はじめて会えた家）を1行で出す
     （10）「予定」に、これからの集まりに合う区域（曜日・時間帯・近さ・期限から）
     （11）「状況」に、会えた成果（はじめて会えた家・時間帯を変えて会えた家。会衆全体の数だけ）
     （12）名前をかくす（この端末だけ）／S-12・S-13の印刷に「区域係用・持ち出し注意・印刷日」
     （13）書き出し・印刷の記録（だれがいつ。サーバーの operations に残す。中身は残さない）
     （14）「速さを測る」に、新しい計算の時間と目安
     ========================================================= */
  const css6 = document.createElement('style');
  css6.textContent = `.focustag{display:inline-block;background:#E8F0FE;border:2px solid #1565C0;color:#0D47A1;border-radius:8px;padding:0 6px;font-size:14px;font-weight:700;vertical-align:middle}
.slfocus{display:inline-block;margin-top:4px;min-height:36px;border:2px solid #1565C0;background:#fff;color:#0D47A1;border-radius:8px;font-size:13px;font-weight:700;padding:0 4px;line-height:1.2;max-width:100%;white-space:normal}
#adS13,#adS12{white-space:normal;height:auto;min-height:56px;line-height:1.4;padding-top:8px;padding-bottom:8px}
.slfocus.on{border-style:solid;background:#E8F0FE;padding:4px;min-height:0}
.slotnew td{height:auto;min-height:78px}
.kfocus{background:#E8F0FE;border:2px solid #1565C0;border-radius:12px;padding:8px 12px;margin:8px 0}
.kfocus p{margin:2px 0}
.kops{display:flex;flex-direction:column;gap:8px;margin:6px 0 10px}
.kops .krow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.kops .krow .btn{flex:1 1 9em}
.kops label{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-weight:700}
.kops select{min-height:50px;border-radius:10px;border:2px solid var(--ink);padding:0 8px;background:#fff;font-size:17px;max-width:100%}
.kops details summary{min-height:44px;line-height:44px;cursor:pointer;color:#B3261E;font-weight:700}
.moreops{flex-basis:100%}
.moreops>summary{cursor:pointer;min-height:44px;line-height:44px;font-weight:700;color:var(--ink2)}
.moreops>div{display:flex;flex-wrap:wrap;gap:8px}
.tfind{position:sticky;top:0;z-index:5;background:var(--bg,#F4F1EA);padding:6px 0 8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tfind input{flex:1 1 14em;min-height:54px;font-size:19px;border:2px solid var(--ink);border-radius:12px;padding:0 12px;background:#fff}
.tfind output{font-size:16px;color:var(--ink2)}
.tfind button{min-height:54px}
.adtop{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin:-4px 0 10px}
.adtop .btn{min-height:44px}
.ahead{border:2px solid var(--line);background:#fff;border-radius:14px;padding:8px 12px;margin:-6px 0 14px;font-size:16px;line-height:1.6}
.ahead p{margin:2px 0}.ahead b{font-size:18px}.ahead .hot{color:#B71C1C}
.mfit{background:#fff;border:2px solid var(--line);border-left:10px solid #1565C0;border-radius:12px;padding:10px 12px;margin-bottom:8px}
.mfit p{margin:2px 0}.mfit .krow{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.achtbl td.num{text-align:right;white-space:nowrap}
.prmark{display:none}
#printArea .prmark{display:block;position:fixed;right:0;top:0;font-size:7pt;line-height:1.2;color:#444;background:#fff;padding:0 1mm;z-index:9}
#printArea .cintro{padding:0 4mm;font-family:inherit}
#printArea .cintro h1{font-size:20pt;margin:0 0 2mm}
#printArea .cintro p{font-size:11pt;margin:1mm 0}
#printArea .cintro table{width:100%;border-collapse:collapse;margin-top:3mm}
#printArea .cintro th,#printArea .cintro td{border:0.3mm solid #333;padding:1.6mm 2mm;font-size:12pt;text-align:left}
#printArea .cintro td.n{text-align:right}
@media (min-width:1180px){
  body.adwide.sheet-open #backdrop{background:transparent;pointer-events:none}
  body.adwide #sheet{left:auto!important;right:20px;top:72px;bottom:20px!important;width:min(600px,44vw);max-height:none!important;border-radius:16px;box-shadow:0 6px 24px #0004}
  body.adwide.sheet-open #view-admin .wrap{margin-right:calc(min(600px,44vw) + 36px);margin-left:0}
}`;
  document.head.appendChild(css6);

  const today6 = () => ymd(new Date());
  const N = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[－ー―‐−–—]/g, '-').replace(/\s+/g, '');

  /* ---------- （12）名前をかくす（この端末だけ。係の画面の中だけ。S-13 と印刷は、記録なのでそのまま） ---------- */
  const HIDE_KEY = 'kuiki_hidenames';
  const hideNames = () => lsGet(HIDE_KEY) === '1';
  try {
    unameMask = id => (hideNames() && typeof currentView !== 'undefined' && currentView === 'admin' && id ? '●●' : null);
  } catch (e) { /* 古い index.html のときは使わない */ }

  /* ---------- （6）各画面の「この画面の使い方」と「名前をかくす」 ---------- */
  const HELP = {
    inbox: ['「今日」でやること',
      ['いちばん上の色の帯で、1年で全区域を回れているかが分かります（緑の✓なら順調）。',
        '「今日の対応」に出たものだけ対応すれば大丈夫です。何もなければ「今日対応することはありません」と出ます。',
        '申し込みは「区域○を貸し出す」を押すだけです。まちがえたときは、下に出る「取り消す」で戻せます。',
        '貸し出す前に、ほかの区域係がもう対応していないかを自動で確かめます。ほかの係が対応したことは、いちばん下に出ます。'],
      ['毎日（奉仕に出る前）：このタブを開いて、出ているものに対応する', '毎週：「受け取られていない留守宅カード」が出ていたら、紙を印刷して集まりで紹介する']],
    terr: ['「区域」でやること',
      ['上の欄に、番号（例：53）・名前・字・持っている人の名前を入れると、すぐ見つかります。',
        '区域の操作は「カルテ」にまとめています（貸し出し・返却・貸出中止・線を直す・S-12の印刷など）。',
        '「状況」で、期限・時間帯の表・留守宅のようすが見られます。「期限の地図」で、期限ごとに色分けした地図が見られます。',
        '自動受け取り・枚数・返却の目安などの決まりは、「貸し出しのきまり」を開くと変えられます。'],
      ['毎月：「状況」で、期限の近い区域と「何度訪ねても会えない家」を確かめる']],
    status: ['「状況」でやること',
      ['期限の見張り：全区域を1年で回るために、今月出したい区域が分かります。',
        '時間帯の表：「区域ごと」にすると、まだ試していない枠などに「出す」ボタンが出ます。押すと、その時間帯の留守宅カードが、全員の一覧の上に「区域係のおすすめ」として出ます。',
        '会えた成果：はじめて会えた家と、時間帯を変えて会えた家の数です（会衆全体の数だけで、人ごとの数は出しません）。'],
      ['毎月：期限の見張りと、何度訪ねても会えない家を確かめる']],
    sched: ['「予定」でやること',
      ['集まりの予定を入れると、その人たちのホーム画面に出ます。',
        '「集まりに合う区域」で、集まりの曜日・時間帯に会えている区域や、まだ試していない区域を、近い順に3つまで出します。そのまま貸し出せます。'],
      ['毎月の終わり：翌月の予定を印刷して、掲示板に張る']],
    people: ['「人」でやること',
      ['人の追加・グループ・役割（監督・司会者・区域係）を変えます。',
        'スマホの登録の申し込みは「今日」タブに出ます。'],
      ['毎月：名簿を見直して、「設定」タブの毎月の点検で「確認した」を押す']],
    set: ['「設定」でやること',
      ['いちばん上の「毎月の点検」で、要確認がないか確かめます。',
        'この端末の自動ロック、年齢データ、おすすめの決まり、CSVの書き出しなどがあります。',
        'S-12・S-13の印刷やCSVの書き出しは、だれがいつ行ったかが「書き出しの履歴」に残ります（中身は残しません）。'],
      ['毎月の初め：点検の項目を上から確かめる']]
  };
  function openHelp() {
    const k = adPane === 'status2' ? 'status' : adPane, h = HELP[k] || HELP.inbox;
    setSheet(headHtml(null, h[0], 'この画面の使い方') +
      `<ul class="khist">${h[1].map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="kq">決まってやること</p><ul class="khist">${h[2].map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="btn block primary" data-close>わかりました</button>`);
  }
  function paintTopBar() {
    const bar = document.getElementById('adTopBar');
    if (!bar) return;
    if (!bar.dataset.bound) {
      bar.dataset.bound = '1';
      bar.addEventListener('click', e => {
        if (e.target.closest('[data-adhelp]')) openHelp();
        else if (e.target.closest('[data-hidename]')) {
          lsSet(HIDE_KEY, hideNames() ? '0' : '1');
          toast(hideNames() ? '係の画面で、名前をかくしました（この端末だけ）' : '名前を表示します');
          renderAll();
        }
      });
    }
    bar.innerHTML = `<div class="adtop"><button type="button" class="btn small" data-adhelp>？ この画面の使い方</button>${isAdmin()
      ? `<button type="button" class="btn small${hideNames() ? ' primary' : ''}" data-hidename aria-pressed="${hideNames()}">${hideNames() ? '名前をかくしています' : '名前をかくす'}</button>` : ''}</div>`;
  }

  /* ---------- （5）パソコンでは、カルテなどを右に出して、一覧と並べる ---------- */
  const wideOn = () => document.body.classList.toggle('adwide', typeof currentView !== 'undefined' && currentView === 'admin');
  const _showView6 = window.showView;
  window.showView = function () { const r = _showView6.apply(this, arguments); try { wideOn(); } catch (e) { /* 表示だけ */ } return r; };

  /* ---------- （1）区域をさがす・一覧をすっきり ---------- */
  let findQ = '';
  function terrHay(t) {
    const h = userById(t.holder);
    let aza = '';
    try { if (AGE_ON) aza = azaText(t); } catch (e) { /* 字なし */ }
    return N(`${t.name || ''} ${aza} ${h ? h.name : ''} ${t.group || ''}`);
  }
  function terrHit(t, q) {
    if (!q) return true;
    const no = N(t.no);
    if (/^[0-9a-z-]+$/.test(q) && no.startsWith(q)) return true;
    return no === q || terrHay(t).includes(q);
  }
  function applyFind() {
    const list = document.getElementById('adTerrs');
    if (!list) return [];
    const q = N(findQ), hits = [];
    $$('.trow', list).forEach(row => {
      const o = row.querySelector('[data-open]'), t = o ? terrById(o.dataset.open) : null;
      const ok = !t || terrHit(t, q);
      row.hidden = !ok;
      if (ok && t) hits.push(t);
    });
    const out = document.getElementById('adTerrQn');
    if (out) out.textContent = q ? (hits.length ? `${hits.length}区域` : '見つかりません') : '';
    return hits;
  }
  function paintTerrFind() {
    const list = document.getElementById('adTerrs');
    if (!list) return;
    let box = document.getElementById('adTerrFind');
    if (!box) {
      box = document.createElement('div'); box.id = 'adTerrFind'; box.className = 'tfind';
      box.innerHTML = `<input type="search" id="adTerrQ" enterkeyhint="search" autocomplete="off" placeholder="番号・名前・字・持っている人" aria-label="区域をさがす（番号・名前・字・持っている人の名前）">
        <output id="adTerrQn" aria-live="polite"></output>`;
      const h2 = list.parentNode.querySelector('h2.sec'); // 見出し「区域の一覧」のすぐ下（設定より上）に置く
      if (h2) h2.after(box); else list.parentNode.insertBefore(box, list);
      const inp = box.querySelector('input');
      inp.addEventListener('input', () => { findQ = inp.value; applyFind(); });
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const hits = applyFind();
        if (hits.length === 1) { inp.blur(); openKarte(hits[0].id); }
      });
    }
    applyFind();
  }
  /* 一覧の各行：よく使う「カルテ・地図・担当・貸し出し」だけを出し、ほかは「そのほかの操作」にたたむ */
  function foldRowOps() {
    const list = document.getElementById('adTerrs');
    if (!list) return;
    $$('.trow .actions', list).forEach(act => {
      if (act.querySelector('.moreops')) return;
      const more = $$('[data-redraw],[data-rename],[data-azaedit],[data-spedit],[data-delterr]', act);
      if (!more.length) return;
      const d = document.createElement('details'); d.className = 'moreops';
      d.innerHTML = '<summary>そのほかの操作</summary><div></div>';
      more.forEach(b => d.lastChild.appendChild(b));
      act.appendChild(d);
    });
  }
  /* 「区域」タブの上にある、貸し出しのきまり（たくさんの設定）を、ふだんはたたんでおく */
  let takeOpen = false;
  function foldTakeSet() {
    const box = document.getElementById('adTakeSet');
    if (!box || !box.firstElementChild || box.querySelector(':scope > details.takefold')) return;
    const st = D().settings;
    const d = document.createElement('details'); d.className = 'dueset takefold'; d.open = takeOpen;
    d.innerHTML = `<summary>貸し出しのきまり（自動受け取り ${Number(st.autoFree) === 1 ? '使う' : '使わない'}・返却の目安 ${lendDays()}日・1人 ${st.holdMaxPersonal || 2}枚まで）</summary>`;
    while (box.firstChild) d.appendChild(box.firstChild);
    box.appendChild(d);
    d.addEventListener('toggle', () => { takeOpen = d.open; });
  }

  /* ---------- （2）カルテ：区域の操作を集める ---------- */
  function karteOpsHtml(t) {
    const users = D().users.filter(u => !u.inactive).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
    const pool = poolInfo(t), hg = t.holder ? (userById(t.holder) || {}).group : '';
    const lm = lendMode(t);
    return `<p class="kq">区域の操作</p><div class="kops">
      ${t.holder ? `<div class="krow"><button type="button" class="btn primary" data-kret>返却する（回り終えたかを確かめる）</button></div>
        <label>担当を変える <select data-khold aria-label="担当を変える"><option value="">えらんでください</option>${users.filter(u => u.id !== t.holder).map(u => `<option value="${u.id}">${esc(u.name)}（今 ${heldCount(u.id)}枚）</option>`).join('')}</select></label>
        ${hg ? `<label class="check"><input type="checkbox" data-kgrp${t.group ? ' checked' : ''}>${esc(hg)}グループの区域にする</label>` : ''}` : ''}
      ${pool ? `<div class="krow"><button type="button" class="btn" data-kpoolfin>正式に返却したことにする（留守宅の訪ね直し ${pool.pct}%）</button></div>` : ''}
      <label>貸し出しのきまり <select data-klend aria-label="貸し出しのきまり">
        <option value="auto"${lm === 'auto' ? ' selected' : ''}>きまりのとおり</option>
        <option value="open"${lm === 'open' ? ' selected' : ''}>貸出可能にする</option>
        <option value="stop"${lm === 'stop' ? ' selected' : ''}>貸出中止にする</option></select></label>
      <div class="krow"><button type="button" class="btn" data-kredraw>線を直す</button><button type="button" class="btn" data-krename>番号・名前</button>
        ${AGE_ON ? '<button type="button" class="btn" data-kaza>字を直す</button>' : ''}${isSpecial(t) ? '<button type="button" class="btn" data-kspec>条件を変える</button>' : ''}</div>
      <details><summary>区域を削除する</summary><p class="hint">家を残すか、まとめて消すかを、次の画面でえらびます。</p><button type="button" class="btn danger block" data-kdel>この区域を削除する</button></details>
    </div>`;
  }
  function bindKarteOps(t, S) {
    const on = (sel, ev, fn) => { const el = $(sel, S); if (el) el[ev] = fn; };
    on('[data-kret]', 'onclick', () => { closeSheet(); openReturnSheet(t.id); });
    on('[data-khold]', 'onchange', e => {
      const v = e.target.value; if (!v) return;
      closeSheet();
      commit(`区域${t.no}の担当を${uname(v)}さんに変えました`, () => {
        t.holder = v; t.lentAt = new Date().toISOString();
        t.helpers = []; t.group = null; t.firstDoneAt = null; t.firstDonePct = null; t.awayPoolAt = null; t.poolRetId = null;
      });
    });
    on('[data-kgrp]', 'onchange', e => {
      const g = (userById(t.holder) || {}).group || null, ck = e.target.checked;
      commit(ck ? `区域${t.no}を${g}グループの区域にしました` : `区域${t.no}を個人の区域にしました`, () => { t.group = ck ? g : null; });
    });
    on('[data-klend]', 'onchange', e => {
      const v = e.target.value;
      commit(v === 'stop' ? `区域${t.no}を貸出中止にしました` : v === 'open' ? `区域${t.no}を貸出可能にしました` : `区域${t.no}は、きまりのとおりに貸し出します`, () => { t.lend = v; delete t.free; });
      sheetKeep = true; openKarte(t.id);
    });
    on('[data-kpoolfin]', 'onclick', async () => {
      const p = poolInfo(t); if (!p) return;
      if (!await ask(`区域${t.no}を、今日、正式に返却されたことにします（留守宅の訪ね直し ${p.pct}%）。よろしいですか？`, { ok: '記録する', danger: false })) return;
      closeSheet();
      commit(`区域${t.no}を正式に返却されたことにしました`, () => poolFinish(t, new Date().toISOString(), p.pct));
    });
    on('[data-kredraw]', 'onclick', () => { closeSheet(); startDraw(t.id); });
    on('[data-krename]', 'onclick', () => openTerrForm({ terr: t }));
    on('[data-kaza]', 'onclick', () => openAzaEdit(t.id));
    on('[data-kspec]', 'onclick', () => openSpecialSheet(t.id));
    on('[data-kdel]', 'onclick', () => openDeleteTerr(t.id));
    $$('[data-focusoff]', S).forEach(b => b.onclick = () => focusOff(t.id, b.dataset.focusoff, () => openKarte(t.id)));
  }

  /* ---------- （7）時間帯の重点（留守宅カードを出す） ---------- */
  const cardSlotOf = c => `${c % 3 === 0 ? '平日' : '土日'}・${SLB[Math.floor(c / 3)]}`;
  function focusList(t) {
    const td = today6();
    return (Array.isArray(t && t.focus) ? t.focus : []).filter(f => f && SLOTS.includes(f.s) && String(f.until || '') >= td);
  }
  function focusLineHtml(t) {
    const fl = focusList(t);
    if (!fl.length) return '';
    return `<div class="kfocus"><p><b>重点の時間帯（留守宅カードを「区域係のおすすめ」として出しています）</b></p>${fl.map(f =>
      `<p>${esc(slotShort(f.s))}（${showDay(f.until)}まで）　<button type="button" class="btn small" data-focusoff="${esc(f.s)}">やめる</button></p>`).join('')}</div>`;
  }
  function focusOff(tid, slot, back) {
    const t = terrById(tid); if (!t) return;
    closeSheet();
    commit(`区域${t.no}の${slotShort(slot)}の重点をやめました`, () => { t.focus = focusList(t).filter(f => f.s !== slot); if (!t.focus.length) delete t.focus; });
    if (back) back();
  }
  function openFocus(tid, slot, back) {
    const t = terrById(tid);
    if (!t || !isAdmin() || !SLOTS.includes(slot)) return;
    let days = 14;
    const keys = cardKeys(unmetIndex().get(t.id) || [], slot, lockedKeys(), rlFor(t)); // 返却後の区域は、返却後のルール
    const paint = () => {
      setSheet(headHtml(t, `区域${esc(t.no)}の留守宅カードを出す`, slotText(slot)) + `
        <p>この区域で、まだ会えていない家のうち、<b>${esc(slotShort(slot))}にまだ訪ねていない家が ${keys.length}軒</b>あります。</p>
        ${keys.length ? '' : '<div class="notice warn">今は、このカードに入れる家がありません（まだ1回目の訪問がすんでいない家は、区域カードで回ります）。重点にしておくと、留守の記録がついた家から入ります。</div>'}
        ${t.holder ? `<div class="notice info">今は貸出中（${esc(uname(t.holder))}さん）なので、このカードは担当の人の「留守宅カード」の一覧にだけ、上の方に出ます。</div>`
          : '<p class="hint">全員の「留守宅カードをえらぶ」の一覧で、<b>「区域係のおすすめ」</b>として上に出ます。ふだん留守宅カードを出していない区域でも、この時間帯のカードだけは出ます。</p>'}
        <p class="q">いつまで出しますか</p>
        <div class="seg" role="group" aria-label="期間">${[[7, '1週間'], [14, '2週間'], [28, '4週間']].map(([d, l]) => `<button type="button" data-keep data-fday="${d}" aria-pressed="${days === d}">${l}</button>`).join('')}</div>
        <p class="muted">${showDay(addDays(today6(), days))}まで。期限が来ると、自動で終わります。</p>
        <button type="button" class="btn primary block" id="focusGo">重点にする</button>
        <button type="button" class="btn block" data-close>やめる</button>`);
      const S = $('#sheet');
      $$('[data-fday]', S).forEach(b => b.onclick = () => { days = Number(b.dataset.fday); paint(); });
      $('#focusGo').onclick = () => {
        const until = addDays(today6(), days);
        closeSheet();
        commit(`区域${t.no}の${slotShort(slot)}を重点にしました（${showDay(until)}まで）`, () => {
          t.focus = focusList(t).filter(f => f.s !== slot).concat({ s: slot, until, at: today6(), by: me().id }).slice(-4);
        });
        if (back) back();
      };
    };
    paint();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-focust]');
    if (!b) return;
    const inSheet = !!b.closest('#sheet');
    openFocus(b.dataset.focust, b.dataset.focuss, inSheet ? () => openKarte(b.dataset.focust) : null);
  });

  /* ---------- （8）受け取られていない留守宅カード ---------- */
  const STUCK_DAYS = 14;
  function unclaimedCards() {
    return memo('uncl', () => {
      if (offToday()) return [];
      const by = new Map();
      awaySuggestions('__nobody__', SLOTS).forEach(x => { if (!by.has(x.t.id)) by.set(x.t.id, []); by.get(x.t.id).push(x.slot); });
      const act = activeCards(), out = [];
      by.forEach((slots, tid) => {
        const t = TID.get(tid);
        if (!t || t.holder) return;
        const fl = focusList(t);
        if (!t.awayPoolAt && !fl.length) return; // 回り終えた区域のカードは、いつでも受け取れるものなので数えない
        if (act.some(c => c.terrId === tid)) return;
        let since = t.awayPoolAt || '';
        fl.forEach(f => { if (f.at && f.at > since) since = f.at; });
        D().awayCards.forEach(c => { if (c.terrId === tid && c.at > since) since = c.at; });
        const days = since ? daysSince(since) : 0;
        if (days >= STUCK_DAYS) out.push({ t, days, slots: slots.sort(bySlot) });
      });
      return out.sort((a, b) => b.days - a.days);
    });
  }
  function printCardIntro() {
    const list = awaySuggestions('__nobody__', SLOTS);
    if (!list.length) { toast('今、だれでも受け取れる留守宅カードはありません'); return; }
    const rows = list.slice().sort((a, b) => (b.focus ? 1 : 0) - (a.focus ? 1 : 0) || (b.t.awayPoolAt ? 1 : 0) - (a.t.awayPoolAt ? 1 : 0) ||
      cmpNo(a.t.no, b.t.no) || bySlot(a.slot, b.slot)).slice(0, 36);
    const html = `<div class="cintro"><h1>留守宅カードのご案内</h1>
      <p>${esc(fmtDay(new Date().toISOString()))}現在。区域マップの「区域カード」画面 →「留守宅カードをえらぶ」から受け取れます。</p>
      <p>留守宅カードは、まだ会えていない家を、前とちがう曜日・時間帯に訪ねるためのカードです。1時間ほどで回れます。</p>
      <table><tr><th>区域</th><th>時間帯</th><th>家・部屋</th><th></th></tr>
      ${rows.map(x => `<tr><td>区域${esc(x.t.no)}　${esc(x.t.name || '')}</td><td>${slotText(x.slot)}</td><td class="n">${x.keys.length}軒</td><td>${x.focus ? '区域係のおすすめ' : ''}</td></tr>`).join('')}</table>
      ${list.length > rows.length ? `<p>ほかにも ${list.length - rows.length}枚あります。アプリで見てください。</p>` : ''}</div>`;
    printDoc(html, false);
  }

  /* ---------- （9）「今日」の見通しと成果（1〜2行） ---------- */
  function aheadHtml() {
    const m = monthStats(), hot = Math.max(3, Math.ceil(m.avg * 1.5));
    const ms = m.months.slice(0, 3);
    const a = achieveStats().months[0];
    return `<div class="ahead"><p>これからの1年の期限：${ms.map(x => `<span class="${x.list.length >= hot ? 'hot' : ''}">${x.label} <b>${x.list.length}</b>区域${x.list.length >= hot ? '（多い）' : ''}</span>`).join('　')}
      <button type="button" class="btn small" data-tgo="status" data-anchor="adDue">見る</button></p>
      <p>今月はじめて会えた家・部屋：<b>${a.first}</b>軒（うち時間帯を変えて会えた：<b>${a.changed}</b>軒）</p></div>`;
  }
  /* ほかの区域係が、最近（24時間）対応したこと */
  function othersDoneHtml() {
    const mine = me().id, since = Date.now() - DAY, list = [];
    D().requests.forEach(r => {
      if (!r.decidedBy || r.decidedBy === mine || !(Date.parse(r.decidedAt) > since)) return;
      const t = r.terrId ? terrById(r.terrId) : null;
      const what = r.type === 'delHouse' ? `家の削除の申請を${r.status === 'approved' ? '受け付けました' : '見送りました'}`
        : r.status === 'approved' ? `${esc(uname(r.by))}さんに${t ? `区域${esc(t.no)}を` : '区域を'}貸し出しました` : `${esc(uname(r.by))}さんの申し込みを見送りました`;
      list.push({ at: r.decidedAt, html: `${esc(uname(r.decidedBy))}さんが、${what}` });
    });
    D().territories.forEach(t => {
      if (!t.selfSeenBy || t.selfSeenBy === mine || !(Date.parse(t.selfSeenAt) > since)) return;
      list.push({ at: t.selfSeenAt, html: `${esc(uname(t.selfSeenBy))}さんが、区域${esc(t.no)}の受け取りを確認しました` });
    });
    if (!list.length) return '';
    list.sort((a, b) => (a.at < b.at ? 1 : -1));
    return `<details class="dueset"><summary>ほかの区域係が対応したこと（24時間以内・${list.length}件）</summary>
      <ul class="opsh">${list.map(x => `<li>✓ ${fmtTime(new Date(x.at))}　${x.html}</li>`).join('')}</ul></details>`;
  }

  /* ---------- （3）（4）係どうしで同じ仕事をしない・戻せる操作は確認を出さない ---------- */
  let decideBusy = false;
  async function fresh() {
    if (!LIVE || navigator.onLine === false) return;
    try { await Promise.race([refresh(true), wait(5000)]); } catch (e) { /* 通信できなくても、今のデータで続ける */ }
  }
  const doneMsg = r => (r.decidedBy && r.decidedBy !== me().id ? `${uname(r.decidedBy)}さんが、すでに対応しました` : 'この申し込みは、すでに対応ずみです');
  async function decide(id, fn) {
    if (decideBusy) return;
    decideBusy = true;
    try {
      await fresh();
      const r = D().requests.find(x => x.id === id);
      if (!r) { toast('この申し込みは、もうありません'); renderAll(); return; }
      if (r.status !== 'pending') { toast(doneMsg(r)); renderAll(); return; }
      await fn(r);
    } finally { decideBusy = false; }
  }
  window.approveReq = function (id, tid0) {
    const sel = document.querySelector(`[data-reqterr="${id}"]`);
    const tid = tid0 || (sel ? sel.value : '');
    return decide(id, r => {
      const t = terrById(tid);
      if (!t) { toast('その区域は貸し出せません'); return; }
      if (t.holder) { toast(`区域${t.no}は、${uname(t.holder)}さんがすでに持っています。ほかの区域をえらんでください`); renderAll(); return; }
      commit(`区域${t.no}を${uname(r.by)}さんに貸し出しました`, () => {
        const now = new Date().toISOString();
        t.holder = r.by; t.lentAt = now; t.helpers = []; t.firstDoneAt = null; t.firstDonePct = null; t.awayPoolAt = null; t.poolRetId = null;
        t.group = r.forGroup || null;
        Object.assign(r, { status: 'approved', terrId: t.id, decidedAt: now, decidedBy: me().id, seen: false });
      });
    });
  };
  window.declineReq = function (id) {
    return decide(id, r => commit(`${uname(r.by)}さんの申し込みを見送りました`, () => {
      Object.assign(r, { status: 'declined', decidedAt: new Date().toISOString(), decidedBy: me().id, seen: false });
    }));
  };
  window.approveDel = function (id) {
    return decide(id, async r => {
      const h = houseById(r.houseId);
      const name = h ? (h.type === 'apt' ? `${h.label || '集合住宅'}（${h.units.length}部屋）` : (h.label || '家')) : '';
      if (h && !await ask(`${uname(r.by)}さんの申請で「${name}」を消します。訪問の記録も一緒に消えます。よろしいですか？`)) return;
      commit(h ? `「${name}」を削除しました` : '申請を閉じました', () => {
        if (h) deleteHouseData(h.id);
        Object.assign(r, { status: 'approved', decidedAt: new Date().toISOString(), decidedBy: me().id, seen: false });
      });
    });
  };
  window.declineDel = function (id) {
    return decide(id, r => commit('削除の申請を見送りました', () => {
      Object.assign(r, { status: 'declined', decidedAt: new Date().toISOString(), decidedBy: me().id, seen: false });
    }));
  };

  /* ---------- （10）集まりに合う区域 ---------- */
  function placePos(s) {
    const pl = N(s && s.place);
    if (pl && window.KZ && typeof KZ.landmarks === 'function') {
      const hit = KZ.landmarks().filter(x => x && x.name && isFinite(x.lat) && isFinite(x.lng))
        .find(x => { const n = N(x.name); return n.length >= 2 && (pl.includes(n) || n.includes(pl)); });
      if (hit) return { pos: [Number(hit.lat), Number(hit.lng)], name: hit.name };
    }
    const h = window.KUIKI_CONFIG && window.KUIKI_CONFIG.hall;
    if (Array.isArray(h) && h.length === 2 && isFinite(h[0]) && isFinite(h[1]) && (Number(h[0]) || Number(h[1]))) return { pos: [Number(h[0]), Number(h[1])], name: '会館' };
    return null;
  }
  function meetCell(s) {
    const d = new Date(`${s.date}T${s.time || '09:00'}:00`);
    if (isNaN(d)) return null;
    const w = d.getDay(), col = w === 0 ? 2 : w === 6 ? 1 : (holidayOf(ymd(d)) ? 2 : 0);
    const bi = SLB.indexOf(bandOf(d));
    return { c: bi * 3 + col, label: `${SLC[col]}の${SLB[bi]}` };
  }
  function meetFit(s) {
    const mc = meetCell(s);
    if (!mc) return [];
    const org = placePos(s);
    return freeTerrs().filter(t => !t.dummy && !isSpecial(t) && okPoly(t.polygon)).map(t => {
      const homes = karteHomes(t), q = slotQuery([t], 12), n = q.n[mc.c], m = q.m[mc.c];
      const few = homes < SL_AZA_MIN, untried = !n, rate = !few && n >= SL_FEW ? m / n : null;
      const di = dueInfo(t), urg = di.left == null ? 1 : Math.max(0, Math.min(1, 1 - di.left / YEAR));
      const dist = org ? distM(org.pos, center(t.polygon)) : null;
      const sc = (untried ? 0.6 : rate != null ? rate : 0.3) + urg * 0.8 - (dist != null ? Math.min(dist / 5000, 1) * 0.6 : 0);
      const why = [];
      if (few) why.push('家・部屋が少ない区域です');
      else if (untried) why.push(`${mc.label}は、まだ試していません`);
      else if (rate != null) why.push(`${mc.label}に会えた割合 ${Math.round(rate * 100)}%`);
      else why.push(`${mc.label}の記録は少なめです`);
      why.push(di.left == null ? '前回の記録なし' : di.left < 0 ? `1年の期限を${-di.left}日過ぎています` : `1年の期限まで あと${di.left}日`);
      if (dist != null) why.push(`${esc(org.name)}から約${fmtDist(dist)}`);
      return { t, sc, why, dist };
    }).sort((a, b) => b.sc - a.sc || cmpNo(a.t.no, b.t.no)).slice(0, 3);
  }
  function openMeetFit(sid) {
    const s = D().schedules.find(x => x.id === sid);
    if (!s) return;
    const mc = meetCell(s), list = meetFit(s), admin = isAdmin();
    const pref = D().users.filter(u => !u.inactive && s.group && u.group === s.group && (u.overseer || u.leader));
    const others = D().users.filter(u => !u.inactive && !pref.includes(u)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
    const opt = u => `<option value="${u.id}">${esc(u.name)}${u.overseer ? '（監督）' : u.leader ? '（司会者）' : ''}</option>`;
    setSheet(headHtml(null, '集まりに合う区域', `${fmtYmd(s.date)} ${esc(s.time || '')}　${esc(s.place || '')}　${esc(schedGroupName(s.group))}`) + `
      <p class="hint">${mc ? `${esc(mc.label)}の集まりです。` : ''}空いている区域から、この時間帯に会えている区域・まだ試していない区域・期限の近い区域を、近い順に考えて3つまで出しています（記録と統計からの目安です）。${placePos(s) ? '' : '場所の位置が分からないため、近さは使っていません（地図の目印に同じ名前があると、近さも使います）。'}</p>
      ${list.length ? list.map(x => `<div class="mfit"><p><b>区域${esc(x.t.no)}</b>　${esc(x.t.name || '')}</p>${x.why.map(w => `<p class="muted">${w}</p>`).join('')}
        <div class="krow"><button type="button" class="btn small" data-mfmap="${x.t.id}">地図</button>${admin ? `<button type="button" class="btn small" data-mfkarte="${x.t.id}">カルテ</button>` : ''}</div>
        ${admin ? `<div class="klend"><select data-mfuser="${x.t.id}" aria-label="貸し出す人"><option value="">貸し出す人をえらぶ</option>${pref.length ? `<optgroup label="${esc(s.group)}グループの監督・司会者">${pref.map(opt).join('')}</optgroup>` : ''}<optgroup label="ほかの人">${others.map(opt).join('')}</optgroup></select>
          <button type="button" class="btn small primary" data-mflend="${x.t.id}">${s.group ? 'グループの区域として貸し出す' : '貸し出す'}</button></div>` : ''}</div>`).join('')
        : '<div class="tdnone"><b>今、空いている区域がありません</b></div>'}
      ${admin ? '' : '<p class="hint">区域が必要なときは、「区域カード」画面の「区域をもらう」から申し込んでください。</p>'}
      <button type="button" class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    $$('[data-mfmap]', S).forEach(b => b.onclick = () => { closeSheet(); openTerr(b.dataset.mfmap); });
    $$('[data-mfkarte]', S).forEach(b => b.onclick = () => openKarte(b.dataset.mfkarte));
    $$('[data-mflend]', S).forEach(b => b.onclick = () => {
      const t = terrById(b.dataset.mflend), sel = $(`[data-mfuser="${b.dataset.mflend}"]`, S), v = sel ? sel.value : '';
      if (!v) { toast('貸し出す人をえらんでください'); return; }
      if (!t || t.holder) { toast('その区域は、もう貸し出されています'); return; }
      const u = userById(v), g = s.group && u && u.group === s.group ? s.group : null;
      closeSheet();
      commit(`区域${t.no}を${uname(v)}さんに${g ? `（${g}グループの区域として）` : ''}貸し出しました`, () => {
        t.holder = v; t.lentAt = new Date().toISOString();
        t.helpers = []; t.group = g; t.firstDoneAt = null; t.firstDonePct = null; t.awayPoolAt = null; t.poolRetId = null;
      });
    });
  }
  function paintMeetFit() {
    const host = document.getElementById('adSched');
    if (!host || !(isAdmin() || isOverseer())) return;
    const td = today6(), lim = addDays(td, 14);
    const list = D().schedules.filter(s => s.date >= td && s.date <= lim && (isAdmin() || s.group === myGroup()))
      .sort((a, b) => ((a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1)).slice(0, 8);
    const box = document.createElement('div');
    box.id = 'adMeetFit';
    box.innerHTML = `<h2 class="sec">集まりに合う区域（これからの2週間）</h2>
      ${list.length ? `<p class="hint">集まりの曜日・時間帯に会えている区域や、まだ試していない区域を出します。</p>${list.map(s => `<div class="duerow" style="border-left-color:#1565C0"><div>
          <p><b>${fmtYmd(s.date)} ${esc(s.time || '')}</b>　${esc(s.place || '')}</p><p class="muted">${esc(schedGroupName(s.group))}</p></div>
          <div class="duebtns"><button type="button" class="btn small primary" data-mfit="${esc(s.id)}">合う区域を見る</button></div></div>`).join('')}`
        : '<p class="muted">これからの2週間に、集まりの予定はありません。</p>'}`;
    box.addEventListener('click', e => { const b = e.target.closest('[data-mfit]'); if (b) openMeetFit(b.dataset.mfit); });
    const old = document.getElementById('adMeetFit');
    if (old) old.replaceWith(box); else host.appendChild(box);
  }
  if (typeof renderSchedAdmin === 'function') {
    const _renderSchedAdmin = window.renderSchedAdmin;
    window.renderSchedAdmin = function () {
      _renderSchedAdmin.apply(this, arguments);
      try { paintMeetFit(); } catch (e) { console.error(e); }
    };
  }

  /* ---------- （11）会えた成果（会衆全体の数だけ） ----------
     ・はじめて会えた家・部屋：その家の記録のうち、いちばん古い「会えた」が、その月にあるもの
     ・時間帯を変えて会えた：その前に留守の記録があり、会えた時間帯が、留守だった時間帯のどれともちがうもの
     ・記録を残す期間（設定）より前に会えた家は、はじめてとして数えることがある */
  function achieveStats() {
    return memo('ach', () => {
      const now = new Date(), months = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ ym: ymOf(d), label: `${d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '年' : ''}${d.getMonth() + 1}月`, first: 0, changed: 0 });
      }
      const startIso = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
      const byYm = new Map(months.map(x => [x.ym, x]));
      const ok = new Set(eligible().map(t => t.id));
      for (const a of IDX.values()) {
        if (!a || !a.length || a[0].at < startIso) continue; // 新しい順。期間に記録がない家は飛ばす
        let fi = -1;
        for (let i = a.length - 1; i >= 0; i--) if (a[i].result === 'met') { fi = i; break; }
        if (fi < 0 || a[fi].at < startIso) continue;
        const v = a[fi], h = HID.get(v.houseId);
        if (!h || !ok.has(h.terrId)) continue;
        const mo = byYm.get(ymOf(new Date(v.at)));
        if (!mo) continue;
        mo.first++;
        let away = 0;
        for (let i = fi + 1; i < a.length; i++) if (a[i].result === 'away') away |= SLOT_BIT[slotOfVisit(a[i])];
        if (away && !(away & SLOT_BIT[slotOfVisit(v)])) mo.changed++;
      }
      return { months };
    });
  }
  function paintAchieve() {
    const pane = document.querySelector('[data-apane="status"]');
    if (!pane) return;
    let box = document.getElementById('adAch');
    if (!box) {
      box = document.createElement('div'); box.id = 'adAch';
      const ref = document.getElementById('adSlotBox');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(box, ref.nextSibling); else pane.appendChild(box);
    }
    const ms = achieveStats().months, max = Math.max(1, ...ms.map(x => x.first));
    box.innerHTML = `<h2 class="sec">会えた成果（会衆全体）</h2>
      <p class="hint">「はじめて会えた」は、その月に、その家・部屋ではじめて「会えた」の記録がついた数です。「時間帯を変えて」は、前に留守だった時間帯とはちがう時間帯で会えた数です。人ごとの数は出しません。</p>
      <div class="scroll"><table class="slots narrow achtbl"><tr><th>月</th><th>はじめて会えた</th><th>うち時間帯を変えて</th><th style="width:40%"></th></tr>
      ${ms.map(x => `<tr><th>${x.label}</th><td class="num"><b>${x.first}</b>軒</td><td class="num">${x.changed}軒</td><td><div class="bar"><i style="width:${Math.round(x.first / max * 100)}%"></i></div></td></tr>`).join('')}</table></div>
      <p class="hint">訪問記録は${Number(D().settings.keepMonths) || 12}か月分を残しています。それより前に会えたことがある家も、はじめてとして数えることがあります。</p>`;
  }

  /* ---------- （12）（13）印刷の注意書きと、書き出しの記録 ---------- */
  const OPSQ = 'kuiki_opslogq';
  async function opsLog(kind, detail) {
    if (!LIVE || !isAdmin() || navigator.webdriver) return; // 紙の予備を作るロボットは記録しない
    let q = [];
    try { q = JSON.parse(lsGet(OPSQ) || '[]'); } catch (e) { q = []; }
    q.push({ kind: String(kind).slice(0, 30), detail: String(detail || '').slice(0, 60), at: new Date().toISOString() });
    q = q.slice(-20);
    lsSet(OPSQ, JSON.stringify(q));
    try {
      const j = await api('ops_log', { items: q });
      if (j && j.ok) { lsDel(OPSQ); opsState.at = 0; }
    } catch (e) { /* 通信できないときは、次の書き出しのときにまとめて送る */ }
  }
  let s12N = 0;
  if (typeof printS12 === 'function') {
    const _printS12 = window.printS12;
    window.printS12 = function (ids) { s12N = Array.isArray(ids) ? ids.length : 0; return _printS12.apply(this, arguments); };
  }
  if (typeof printDoc === 'function') {
    const _printDoc = window.printDoc;
    window.printDoc = function (html, landscape, pageCss) {
      try {
        const kind = /class="s12doc"/.test(html) ? 'S-12' : /class="s13page"/.test(html) ? 'S-13' : '';
        if (kind) {
          const d = new Date();
          html += `<div class="prmark">区域係用・持ち出し注意・印刷日 ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}</div>`;
          const yr = (html.match(/奉仕年度：<u>([^<]*)<\/u>/) || [])[1];
          opsLog(`書き出し：${kind}の印刷`, kind === 'S-12' ? (s12N ? `${s12N}区域` : '') : (yr ? `${yr}奉仕年度` : ''));
        }
      } catch (e) { console.error(e); }
      return _printDoc.call(this, html, landscape, pageCss);
    };
  }
  if (typeof exportCsv === 'function') {
    const _exportCsv = window.exportCsv;
    window.exportCsv = function () {
      const r = _exportCsv.apply(this, arguments);
      try { opsLog('書き出し：訪問記録のCSV', `${D().visits.length}件`); } catch (e) { console.error(e); }
      return r;
    };
    const csvBtn = document.getElementById('adCsv');
    if (csvBtn) csvBtn.onclick = () => window.exportCsv();
  }

  /* ---------- （14）「速さを測る」 ---------- */
  if (typeof runPerfCheck === 'function') {
    const _perf6 = window.runPerfCheck;
    window.runPerfCheck = function () {
      _perf6.apply(this, arguments);
      try {
        const rows = [];
        const T = (name, fn, k) => {
          const n = k || 1, t0 = performance.now();
          try { for (let i = 0; i < n; i++) fn(); } catch (e) { rows.push([name, -1]); return; }
          rows.push([name, (performance.now() - t0) / n]);
        };
        T('会えた成果：記録を1周して集計', () => { MEMO.delete('ach'); achieveStats(); }, 2);
        T('受け取られていない留守宅カード', () => { MEMO.delete('uncl'); unclaimedCards(); }, 2);
        const sc = D().schedules.find(s => s.date >= today6());
        T('集まりに合う区域：1回分', () => meetFit(sc || { date: today6(), time: '10:00', place: '' }), 3);
        T('区域をさがす：全区域を調べる', () => { const q = N('1'); eligible().forEach(t => terrHit(t, q)); }, 5);
        const tb = document.querySelector('#sheet table.slots');
        if (!tb) return;
        const mark = ms => (ms < 0 ? '×（エラー）' : ms < 100 ? '◎ 速い' : ms < 300 ? '○ ふつう' : ms < 1000 ? '△ 少し待つ' : '× 重い');
        tb.insertAdjacentHTML('beforeend', rows.map(([n, ms]) =>
          `<tr><th style="text-align:left">${esc(n)}</th><td>${ms < 0 ? '—' : Math.round(ms) + 'ms'}</td><td>${mark(ms)}</td></tr>`).join(''));
        if (!document.getElementById('pfGoal')) tb.insertAdjacentHTML('afterend', '<p class="hint" id="pfGoal">目安：どの項目も300ms（○ ふつう）までなら、タブの切りかえや画面を開くときに待たされません。△や×が出たら、その結果をコピーして知らせてください。</p>');
      } catch (e) { console.error(e); }
    };
  }

  /* ---------- 係の画面に、第6弾の部品を出す ---------- */
  const _renderAdmin6 = window.renderAdmin;
  window.renderAdmin = function () {
    _renderAdmin6.apply(this, arguments);
    try {
      wideOn();
      paintTopBar();
      if (!isAdmin() || lkLocked()) return;
      if (adPane === 'terr') { foldTakeSet(); foldRowOps(); paintTerrFind(); }
      if (adPane === 'status') paintAchieve();
    } catch (e) { console.error(e); }
  };
  if (typeof renderOverseer === 'function') {
    const _renderOverseer = window.renderOverseer;
    window.renderOverseer = function () {
      _renderOverseer.apply(this, arguments);
      try { wideOn(); paintTopBar(); } catch (e) { console.error(e); }
    };
  }
  /* 「区域」タブの中の「期限の地図」：地図を開いて、期限の色分けを入れる */
  {
    const sub = document.getElementById('adTerrSub');
    if (sub) sub.addEventListener('click', e => {
      if (!e.target.closest('[data-admap]')) return;
      dmState.on = true; lsSet('kuiki_duemode', '1');
      showView('map');
      try { renderTerrs(); } catch (err) { console.error(err); }
    });
  }

  /* ほかの部品（kangaeru.js）が同じ計算を使うための窓口。写さずに、ここの関数をそのまま使ってもらう */
  window.KM = { coverInfo, lastDone, dueInfo, eligible, slotQuery, slotTableHtml, openKarte, SL_FEW, SL_BEST, memoClear: () => MEMO.clear() };

  /* 試作版などで、この部品より先に画面ができていたときは描き直す */
  if (Store.data && typeof map !== 'undefined' && map) { try { renderAll(); } catch (e) { console.error(e); } }
})();
