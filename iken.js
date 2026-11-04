/* =========================================================
   区域マップ：こまったこと・提案を送る（iken.js・2026-11-05）

   ・ホームのいちばん下に1行だけ「こまったこと・提案を送る」。区域係の設定「こまったこと・提案」が「受け付ける」のときだけ出る。
     送れる人は係が決める（監督・司会者・係だけ／全員）。サーバー（iken.gs）でも同じ決まりで確かめる。
   ・送るのは名前なし：送った人の名前・id はサーバーに残らない（残るのは役割だけ）。
   ・送る人がすること：種類を1つえらぶ → 書く（キーボードのマイクで話してもよい）→ 送る。
     AI でまとめるための情報（直前に見ていた画面・版・モード・端末・電波・30分以内の通信のエラー）は、アプリが自動で付ける。
     付ける情報は「一緒に送る情報」で見られる。住所・名前・記録の中身は付けない。
   ・電波がないときは、この端末に取っておき（5件まで）、電波が戻ったら送る。
   ・区域係の画面「設定・データ」：受け付ける／受け付けない・送れる人・届いた声の一覧（状態：未対応・対応中・済・見送り）・
     「AIに渡す形でコピー」（指示文と一緒に。送った人の役割は残る）。
   ========================================================= */
(function () {
  'use strict';

  const MAX = 500, QKEY = 'kuiki_iken_q';
  const KINDS = [
    ['komatta', 'こまった・動かない', '例：地図が白いまま出てこない'],
    ['wakaran', '分かりにくい', '例：「返す」を押したら、どうなるのか分からない'],
    ['teian', 'こうしてほしい', '例：○○ができるとうれしい'],
    ['sonota', 'その他', '気づいたことを自由に']
  ];
  const KIND_NAME = { komatta: 'こまった・動かない', wakaran: '分かりにくい', teian: 'こうしてほしい', sonota: 'その他' };
  const ST_NAME = { new: '未対応', doing: '対応中', done: '済', skip: '見送り' };
  const MODE_NAME = { kantan: 'かんたん', kuwashii: 'くわしい' };
  const DEV_NAME = { iphone: 'iPhone', ipad: 'iPad', android: 'Android', pc: 'パソコン', other: 'その他' };
  const VIEW_NAME = { home: 'ホーム', cards: '区域カード', map: '地図', follow: '再訪問', reco: 'おすすめ', admin: '区域係' };

  const st = () => (D() && D().settings) || {};
  const allowed = () => {
    if (!LIVE || !D() || Number(st().ikenOn) !== 1) return false;
    if (Number(st().ikenWho) === 0) return true;
    const m = me() || {};
    return isAdmin() || !!m.overseer || !!m.leader;
  };
  /** シートで式にしないために付けた先頭の ' を外して見せる */
  const plain = s => String(s || '').replace(/^'(?=[=+\-@＝＋－＠])/, '');

  /* ---- 直前に見ていた画面（下のタブで切りかえたもの） ---- */
  let lastView = '', lastViewAt = 0;
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#tabs button[data-view]');
    if (b && b.dataset.view !== 'home') { lastView = b.dataset.view; lastViewAt = Date.now(); }
  }, true);

  function ctx() {
    const ua = navigator.userAgent || '';
    const dev = /iPhone|iPod/.test(ua) ? 'iphone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ipad'
      : /Android/.test(ua) ? 'android' : /Windows|Macintosh|Linux|CrOS/.test(ua) ? 'pc' : 'other';
    let err = '';
    try {
      const j = JSON.parse(lsGet(LASTERR_KEY) || 'null');
      if (j && Date.now() - Date.parse(j.at) < 30 * 60000) err = `${String(j.action || '').slice(0, 30)}:${String(j.code || '').slice(0, 30)}`;
    } catch (e) { /* 何もしない */ }
    const scr = lastView && Date.now() - lastViewAt < 10 * 60000 ? lastView : (typeof currentView === 'string' ? currentView : 'home');
    return {
      scr: /^[a-z0-9_-]{1,30}$/.test(scr) ? scr : '', ver: APP_VERSION, mode: UI.mode === 'detail' ? 'kuwashii' : 'kantan', dev,
      net: navigator.onLine === false ? 'off' : 'on', err, lang: document.documentElement.lang === 'es' ? 'es' : 'ja'
    };
  }
  function ctxLines(c) {
    return [`直前に見ていた画面：${VIEW_NAME[c.scr] || c.scr || '—'}`, `アプリの版：${c.ver}`, `表示：${MODE_NAME[c.mode]}`,
      `端末：${DEV_NAME[c.dev]}`, `電波：${c.net === 'off' ? 'なし' : 'あり'}`, `30分以内の通信のエラー：${c.err || 'なし'}`];
  }

  /* ---- ホームの入口 ---- */
  function home() {
    const box = $('#homeIken'); if (!box) return;
    box.innerHTML = allowed()
      ? `<div class="ikenhome"><button type="button" class="btn block" data-iken>こまったこと・提案を送る</button>
          <p class="hint" style="text-align:center;margin-top:4px">名前は送られません</p></div>` : '';
  }

  /* ---- 送る画面 ---- */
  let kind = '';
  function open() {
    if (!allowed()) { toast('いまは受け付けていません'); home(); return; }
    kind = '';
    const c = ctx();
    setSheet(`<h2>こまったこと・提案を送る</h2>
      <p class="hint">名前は送られません。区域係が読んで、使いやすくするために役立てます。</p>
      <p style="font-weight:700;margin:12px 0 6px">どんなことですか？</p>
      <div class="ikkinds" role="group" aria-label="どんなことですか" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${KINDS.map(k => `<button type="button" class="chip" data-ikkind="${k[0]}" aria-pressed="false" style="border-radius:12px">${k[1]}</button>`).join('')}</div>
      <label class="field">くわしく教えてください<textarea id="ikText" rows="5" maxlength="${MAX}" placeholder="${esc(KINDS[0][2])}"></textarea></label>
      <p class="hint" style="margin-top:-8px">キーボードのマイクを押すと、話して入力できます。家の人の名前・住所・電話番号は書かないでください。<span id="ikCnt" style="float:right">0/${MAX}</span></p>
      <details class="more"><summary>一緒に送る情報</summary><p class="hint">${ctxLines(c).map(esc).join('<br>')}<br>（あなたの名前・住所・記録の中身は送りません）</p></details>
      <div class="row" style="margin-top:14px"><button type="button" class="btn" data-close>やめる</button>
        <button type="button" class="btn primary" id="ikSend" disabled>送る</button></div>`);
    const ta = $('#ikText'), btn = $('#ikSend');
    const ready = () => { const n = ta.value.trim().length; $('#ikCnt').textContent = `${ta.value.length}/${MAX}`; btn.disabled = !(kind && n); };
    $$('[data-ikkind]').forEach(b => {
      b.onclick = () => {
        kind = b.dataset.ikkind;
        $$('[data-ikkind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        ta.placeholder = (KINDS.find(k => k[0] === kind) || KINDS[0])[2];
        ready(); ta.focus();
      };
    });
    ta.oninput = ready;
    btn.onclick = () => send(ta.value);
    // 書いている途中で外を押して消えないように
    sheetGuard = async () => {
      if (ta.value.trim() && !await ask('書いた内容は送られません。閉じてもよいですか？', { ok: '閉じる', danger: false })) return;
      closeSheet();
    };
    $$('[data-close]', $('#sheet')).forEach(b => { b.onclick = sheetGuard; });
  }

  async function send(raw) {
    const text = String(raw || '').trim().slice(0, MAX);
    if (!kind || !text) return;
    // 電話番号・番地のような数字があれば、確かめる（送る前に気づいてもらうため。止めはしない）
    if (/\d{2,4}[-‐－ー]\d{2,4}[-‐－ー]\d{3,4}|\d+[-‐－ー]\d+[-‐－ー]?\d*\s*(番地|号)?/.test(text.normalize('NFKC'))) {
      if (!await ask('住所や電話番号のような数字があります。家の人のことがわかる内容なら、消してから送ってください。\nこのまま送りますか？', { ok: 'このまま送る', cancel: 'もどって直す', danger: false })) return;
    }
    const item = { cid: 'ik' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), kind, text, ctx: ctx() };
    const btn = $('#ikSend'); if (btn) { btn.disabled = true; btn.textContent = '送っています…'; }
    const r = await post(item);
    if (r === 'ok') { sheetGuard = null; closeSheet(); toast('ありがとうございます。送りました'); return; }
    if (r === 'queued') { sheetGuard = null; closeSheet(); toast('電波がないので、このスマホに取っておきました。つながったら自動で送ります'); return; }
    if (btn) { btn.disabled = false; btn.textContent = '送る'; }
    toast(r === 'many' ? 'たくさん送っていただき、ありがとうございます。しばらく（6時間ほど）してから、また送ってください'
      : r === 'off' ? 'いまは受け付けていません' : '送れませんでした。もう一度押してください');
  }
  /** 'ok'・'queued'・'many'・'off'・'fail' */
  async function post(item, fromQueue) {
    try {
      await api('iken_send', { cid: item.cid, kind: item.kind, text: item.text, ctx: item.ctx }, { timeout: 30000 });
      return 'ok';
    } catch (e) {
      const c = e && (e.code || e.message);
      if (c === 'many' || c === 'off' || c === 'bad_request') return c === 'bad_request' ? 'fail' : c;
      if (e && e.retry) { if (!fromQueue) queue(item); return 'queued'; }
      return 'fail';
    }
  }
  function queue(item) {
    let q = []; try { q = JSON.parse(lsGet(QKEY) || '[]'); } catch (e) { q = []; }
    q = q.filter(x => x && x.cid !== item.cid).concat([item]).slice(-5);
    lsSet(QKEY, JSON.stringify(q));
  }
  let flushing = false;
  async function flush() {
    if (flushing || !LIVE || navigator.onLine === false) return;
    let q = []; try { q = JSON.parse(lsGet(QKEY) || '[]'); } catch (e) { q = []; }
    if (!q.length) return;
    flushing = true;
    try {
      const rest = [];
      for (const it of q) {
        const r = await post(it, true);
        if (r === 'queued') rest.push(it); // まだ届かない（同じ cid なので、送り直しても2件にはならない）
      }
      lsSet(QKEY, JSON.stringify(rest));
      if (rest.length < q.length) toast('取っておいた「こまったこと・提案」を送りました');
    } finally { flushing = false; }
  }
  window.addEventListener('online', () => setTimeout(flush, 3000));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(flush, 6000); });
  setTimeout(flush, 12000);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-iken]')) open(); });

  /* ---- 区域係：設定と、届いた声 ---- */
  let items = null, filt = 'open', loading = false;
  function renderAdmin() {
    const box = $('#adIken'); if (!box) return;
    if (!LIVE) { box.innerHTML = ''; return; }
    const on = Number(st().ikenOn) === 1, all = Number(st().ikenWho) === 0;
    box.innerHTML = `<h2 class="sec">こまったこと・提案</h2>
      <div class="setrow"><span>ホームに「こまったこと・提案を送る」を出す<br><small class="hint">名前なしで送られます。届いた声はこの下で見られ、AIに渡す形でコピーできます</small></span>
        <div class="seg" role="group" aria-label="こまったこと・提案を受け付ける"><button type="button" data-sset="ikenOn" data-v="1" aria-pressed="${on}">受け付ける</button>
        <button type="button" data-sset="ikenOn" data-v="0" aria-pressed="${!on}">受け付けない</button></div></div>
      ${on ? `<div class="setrow"><span>送れる人</span>
        <div class="seg" role="group" aria-label="送れる人"><button type="button" data-sset="ikenWho" data-v="1" aria-pressed="${!all}">監督・司会者・係</button>
        <button type="button" data-sset="ikenWho" data-v="0" aria-pressed="${all}">全員</button></div></div>` : ''}
      <div id="ikList">${items ? listHtml() : `<button type="button" class="btn block" id="ikLoad">届いた声を見る</button>`}</div>`;
    const b = $('#ikLoad'); if (b) b.onclick = load;
    bindList();
  }
  async function load() {
    if (loading) return;
    loading = true;
    const box = $('#ikList'); if (box) box.innerHTML = '<p class="hint">読み込んでいます…</p>';
    try { const r = await api('iken_list', {}, { timeout: 45000 }); items = r.items || []; }
    catch (e) { items = null; toast('読み込めませんでした。電波を確かめて、もう一度押してください'); }
    finally { loading = false; }
    renderAdmin();
  }
  const shown = () => (items || []).filter(x => filt === 'all' ? true : filt === 'open' ? (x.status === 'new' || x.status === 'doing') : (x.status === 'done' || x.status === 'skip'));
  function listHtml() {
    const n = k => (items || []).filter(x => k === 'open' ? x.status === 'new' || x.status === 'doing' : k === 'closed' ? x.status === 'done' || x.status === 'skip' : true).length;
    const L = shown();
    return `<div class="seg" role="group" aria-label="表示する声" style="margin:8px 0">
        ${[['open', 'まだのもの'], ['closed', '済・見送り'], ['all', 'すべて']].map(f => `<button type="button" data-ikf="${f[0]}" aria-pressed="${filt === f[0]}">${f[1]}（${n(f[0])}）</button>`).join('')}</div>
      <div class="row" style="margin-bottom:8px"><button type="button" class="btn primary" id="ikCopy"${L.length ? '' : ' disabled'}>AIに渡す形でコピー（${L.length}件）</button>
        <button type="button" class="btn" id="ikReload">読み込み直す</button></div>
      ${L.length ? L.map(x => `<div class="setrow" style="display:block">
          <p style="margin:0 0 4px"><b>${esc(KIND_NAME[x.kind] || x.kind)}</b>　<small class="hint">${esc(fmtAt(x.at))}・${esc(x.role)}・${esc(ST_NAME[x.status] || x.status)}</small></p>
          <p style="margin:0 0 6px;white-space:pre-wrap;word-break:break-word">${esc(plain(x.text))}</p>
          <p class="hint" style="margin:0 0 6px">${esc([VIEW_NAME[x.scr] || x.scr, x.ver, MODE_NAME[x.mode], DEV_NAME[x.dev], x.net === 'off' ? '電波なし' : '', plain(x.err)].filter(Boolean).join('・'))}</p>
          <div class="seg" role="group" aria-label="状態">${['doing', 'done', 'skip', 'new'].map(s => `<button type="button" data-ikmark="${esc(x.id)}" data-ikst="${s}" aria-pressed="${x.status === s}">${ST_NAME[s]}</button>`).join('')}</div>
        </div>`).join('') : '<div class="empty">ここに出す声はありません</div>'}`;
  }
  function fmtAt(s) { const t = Date.parse(s); if (!isFinite(t)) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function bindList() {
    $$('[data-ikf]').forEach(b => { b.onclick = () => { filt = b.dataset.ikf; renderAdmin(); }; });
    const rl = $('#ikReload'); if (rl) rl.onclick = load;
    const cp = $('#ikCopy'); if (cp) cp.onclick = copyForAi;
    $$('[data-ikmark]').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.ikmark, s = b.dataset.ikst, x = (items || []).find(y => y.id === id);
        if (!x || x.status === s) return;
        try {
          await api('iken_mark', { ids: [id], status: s }, { timeout: 30000 });
          x.status = s; renderAdmin(); toast(`「${ST_NAME[s]}」にしました`);
        } catch (e) { toast('変えられませんでした。もう一度押してください'); }
      };
    });
  }
  function aiText(L) {
    const d = new Date();
    const head = `# 区域マップ：こまったこと・提案（${L.length}件・${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 時点）

次は、区域マップ（家から家への訪問を記録し、区域カードを管理するスマホのアプリ）の利用者から、名前なしで届いた声です。利用者には年配の人やスマホに不慣れな人も多くいます。区域係として改善の計画を立てたいので、次をしてください。

1. 1件ずつ「不具合／分かりにくい／要望／その他」に分け直し、どの画面・機能の話かを書く（本文から推定したものは「推定」と書く）
2. 同じ内容の声をまとめ、件数を数える
3. 重大度を付ける（高：記録が消える・送れない・まちがって記録される／中：操作に迷う・時間がかかる／低：見た目・好み）
4. 不具合は、再現の手がかり（版・端末・表示のモード・電波・直前のエラー）を整理し、確かめる手順を書く
5. 「すぐ直せる」「検討が必要」「見送ってよい」に分け、理由を一言そえる
6. 本文に人の名前・住所・電話番号らしきものがあれば、その部分は使わずに伏せ、そのことを書く
7. 送った人を推測しない

出力：表（番号・分類・画面・重大度・件数・まとめ・次の一手・元の id）と、全体の傾向を3行ほど。

## データ（id｜日時｜種類｜送った人の役割｜直前の画面｜版｜表示｜端末｜電波｜直前のエラー｜状態）
`;
    return head + L.map(x => `- ${x.id.slice(-6)}｜${x.at.slice(0, 16).replace('T', ' ')}（UTC）｜${KIND_NAME[x.kind] || x.kind}｜${x.role}｜${VIEW_NAME[x.scr] || x.scr || '—'}｜${x.ver || '—'}｜${MODE_NAME[x.mode] || '—'}｜${DEV_NAME[x.dev] || '—'}｜${x.net === 'off' ? 'なし' : x.net === 'on' ? 'あり' : '—'}｜${plain(x.err) || 'なし'}｜${ST_NAME[x.status] || x.status}
  本文：${plain(x.text).replace(/\s*\n\s*/g, ' ／ ')}`).join('\n') + '\n';
  }
  async function copyForAi() {
    const t = aiText(shown());
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); ok = true; } } catch (e) { ok = false; }
    if (ok) { toast('コピーしました。Claude などの AI に貼り付けてください'); return; }
    // コピーできない端末：画面に出して、長押しでコピーしてもらう
    setSheet(`<h2>AIに渡す形</h2><p class="hint">下の文をすべてえらんでコピーし、AI に貼り付けてください。</p>
      <label class="field"><textarea id="ikAi" rows="12" readonly>${esc(t)}</textarea></label>
      <div class="row"><button type="button" class="btn primary" data-close>閉じる</button></div>`);
    const a = $('#ikAi'); if (a) { a.focus(); a.select(); }
  }

  window.IkenR = { home, open, renderAdmin, flush, _aiText: aiText, _ctx: ctx };
})();
