/* =========================================================
   区域マップ：こまったこと・提案を送る（iken.js・2026-11-05）

   ・ホームのいちばん下に1行だけ「こまったこと・提案を送る」。区域係の設定「こまったこと・提案」が「受け付ける」のときだけ出る。
     送れる人は係が決める（監督・司会者・係だけ／全員）。サーバー（iken.gs）でも同じ決まりで確かめる。
   ・送った人（名前・役割）はサーバーに残り、区域係の画面で、だれが何を送ったかが分かる（2026-11-05 変更）。
   ・送る人がすること：種類を1つえらぶ → 書く（キーボードのマイクで話してもよい）→ 送る。
     AI でまとめるための情報（直前に見ていた画面・版・モード・端末・電波・30分以内の通信のエラー）は、アプリが自動で付ける。
     付ける情報は「一緒に送る情報」で見られる。住所・記録の中身は付けない。
   ・電波がないときは、この端末に取っておき（5件まで）、電波が戻ったら送る。
   ・区域係の画面「設定・データ」：受け付ける／受け付けない・送れる人・届いた声の一覧（状態：未対応・対応中・済・見送り）・
     「AIに渡す形でコピー」（指示文と一緒に。送った人の名前は外し、役割だけ残す）。
   ========================================================= */
(function () {
  'use strict';

  const MAX = 500, QKEY = 'kuiki_iken_q', PH_MAX = 10, PH_PX = 1280, PH_BYTES = 400000;
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
      ? `<div class="ikenhome"><button type="button" class="btn block" data-iken>こまったこと・提案を送る</button></div>` : '';
  }

  /* ---- 送る画面 ---- */
  let kind = '', photos = [], curCid = '';
  const newCid = () => 'ik' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  /* 写真を縮める：長い辺 PH_PX まで・JPEG。大きければ画質を下げる。描き直すので、撮った場所などの情報（Exif）は消える */
  async function shrink(file) {
    let src;
    try { src = await createImageBitmap(file); }
    catch (e) {
      src = await new Promise((ok, ng) => { const im = new Image(); const u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); ng(e); }; im.src = u; });
    }
    const w0 = src.width, h0 = src.height, k = Math.min(1, PH_PX / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    let url = '';
    for (const q of [0.8, 0.65, 0.5, 0.35]) { url = c.toDataURL('image/jpeg', q); if (url.length * 0.75 <= PH_BYTES) break; }
    const b64 = url.slice(url.indexOf(',') + 1);
    if (!/^\/9j\//.test(b64) || b64.length * 0.75 > PH_BYTES) throw new Error('photo');
    return { url, b64 };
  }
  function thumbs() {
    const box = $('#ikThumbs'); if (!box) return;
    box.innerHTML = photos.map((p, i) => `<span style="position:relative;display:inline-block">
        <img src="${p.url}" alt="えらんだ写真 ${i + 1}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:2px solid var(--line)">
        <button type="button" data-ikdel="${i}" aria-label="写真 ${i + 1} を外す" style="position:absolute;top:-10px;right:-10px;width:36px;height:36px;border-radius:99px;border:2px solid var(--ink);background:#fff;font-weight:700;font-size:18px">×</button></span>`).join('');
    $$('[data-ikdel]', box).forEach(b => { b.onclick = () => { photos.splice(Number(b.dataset.ikdel), 1); thumbs(); }; });
    const pk = $('#ikPick'); if (pk) { pk.disabled = photos.length >= PH_MAX; pk.textContent = photos.length ? `写真をえらぶ（あと${PH_MAX - photos.length}枚）` : `写真をえらぶ（${PH_MAX}枚まで）`; }
  }
  function open() {
    if (!allowed()) { toast('いまは受け付けていません'); home(); return; }
    kind = ''; photos = []; curCid = newCid(); // 押し直しても同じ番号で送る（届いていれば2件にならない）
    const c = ctx();
    setSheet(`<h2>こまったこと・提案を送る</h2>
      <p class="hint">区域係が読んで、使いやすくするために役立てます。くわしくお聞きすることがあるかもしれません。そのときは、ご協力をお願いします。</p>
      <p style="font-weight:700;margin:12px 0 6px">どんなことですか？</p>
      <div class="ikkinds" role="group" aria-label="どんなことですか" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${KINDS.map(k => `<button type="button" class="chip" data-ikkind="${k[0]}" aria-pressed="false" style="border-radius:12px">${k[1]}</button>`).join('')}</div>
      <label class="field">くわしく教えてください<textarea id="ikText" rows="5" maxlength="${MAX}" placeholder="${esc(KINDS[0][2])}"></textarea></label>
      <p class="hint" style="margin-top:-8px">キーボードのマイクを押すと、話して入力できます。家の人の名前・住所・電話番号は書かないでください。<span id="ikCnt" style="float:right">0/${MAX}</span></p>
      <input type="file" id="ikFile" accept="image/*" multiple hidden>
      <button type="button" class="btn block" id="ikPick">写真をえらぶ（${PH_MAX}枚まで）</button>
      <div id="ikThumbs" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"></div>
      <details class="more"><summary>一緒に送る情報</summary><p class="hint">${ctxLines(c).map(esc).join('<br>')}<br>（住所・記録の中身は送りません）</p></details>
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
    const fi = $('#ikFile');
    $('#ikPick').onclick = () => fi.click(); // iPhone は「フォトライブラリ・写真を撮る・ファイル」、Android はギャラリーからえらべる
    fi.onchange = async () => {
      const list = [...(fi.files || [])]; fi.value = '';
      if (!list.length) return;
      const room = PH_MAX - photos.length;
      if (list.length > room) toast(`写真は${PH_MAX}枚までです。はじめの${room}枚を入れました`);
      const pk = $('#ikPick'); if (pk) { pk.disabled = true; pk.textContent = '写真を用意しています…'; }
      let bad = 0;
      for (const f of list.slice(0, room)) { try { photos.push(await shrink(f)); } catch (e) { bad++; } }
      thumbs();
      if (bad) toast(`${bad}枚の写真は読めませんでした`);
    };
    btn.onclick = () => send(ta.value);
    // 書いている途中で外を押して消えないように
    sheetGuard = async () => {
      if ((ta.value.trim() || photos.length) && !await ask('書いた内容は送られません。閉じてもよいですか？', { ok: '閉じる', danger: false })) return;
      closeSheet();
    };
    $$('[data-close]', $('#sheet')).forEach(b => { b.onclick = sheetGuard; });
  }

  async function send(raw) {
    const text = String(raw || '').trim().slice(0, MAX);
    if (!kind || !text) return;
    // 電話番号・番地のような数字があれば、確かめる（送る前に気づいてもらうため。止めはしない）
    // 区域の番号（14-3 など）では出さない：3つ組の数字（電話・住所）と「○番地・○号」だけ（監査 L-3）
    if (/\d+[-‐－ー]\d+[-‐－ー]\d+|\d+\s*(番地|号)/.test(text.normalize('NFKC'))) {
      if (!await ask('住所や電話番号のような数字があります。家の人のことがわかる内容なら、消してから送ってください。\nこのまま送りますか？', { ok: 'このまま送る', cancel: 'もどって直す', danger: false })) return;
    }
    const ph = photos.slice(0, PH_MAX);
    if (ph.length && navigator.onLine === false) { toast('写真があるときは、電波のあるところで送ってください'); return; }
    const item = { cid: curCid || newCid(), kind, text, ctx: ctx(), uid: D().currentUser, pn: ph.length };
    const btn = $('#ikSend'); if (btn) { btn.disabled = true; btn.textContent = '送っています…'; }
    const r = await post(item, ph.length > 0); // 写真があるときは、端末に取っておかない（大きいため）
    if (r === 'ok') {
      let bad = 0;
      for (let i = 0; i < ph.length; i++) {
        if (btn) btn.textContent = `写真を送っています ${i + 1}/${ph.length}`;
        if (!await sendPhoto(item.cid, i, ph[i].b64)) bad++;
      }
      sheetGuard = null; closeSheet(); photos = [];
      toast(bad ? `文は届きました。写真のうち${bad}枚は送れませんでした` : 'ありがとうございます。送りました');
      return;
    }
    if (r === 'queued' && !ph.length) { sheetGuard = null; closeSheet(); toast('電波がないので、このスマホに取っておきました。つながったら自動で送ります'); return; }
    if (btn) { btn.disabled = false; btn.textContent = '送る'; }
    toast(r === 'queued' ? '送れませんでした。電波のあるところで、もう一度押してください' : r === 'many' ? 'たくさん送っていただき、ありがとうございます。しばらく（6時間ほど）してから、また送ってください'
      : r === 'off' ? 'いまは受け付けていません' : r === 'old' ? 'サーバーの準備がまだできていません。区域係に伝えてください' : '送れませんでした。もう一度押してください');
  }
  /** 'ok'・'queued'・'many'・'off'・'old'（サーバーが古い）・'fail' */
  async function post(item, noQueue) {
    try {
      await api('iken_send', { cid: item.cid, kind: item.kind, text: item.text, ctx: item.ctx, pn: item.pn || 0 }, { timeout: 30000 });
      return 'ok';
    } catch (e) {
      const c = e && (e.code || e.message);
      if (c === 'many' || c === 'off') return c;
      if (c === 'unknown_action') return 'old';
      if (c === 'bad_request' || c === 'auth') return 'fail';
      if (e && e.retry) { if (!noQueue) queue(item); return 'queued'; }
      return 'fail';
    }
  }
  /** 写真を1枚送る。電波の問題なら3回まで送り直す（同じ番号は1枚だけ入る） */
  async function sendPhoto(cid, i, b64) {
    for (let k = 0; k < 3; k++) {
      try { await api('iken_photo', { cid, i, data: b64 }, { timeout: 60000 }); return true; }
      catch (e) { if (!(e && e.retry)) return false; await new Promise(r => setTimeout(r, 1500 * (k + 1))); }
    }
    return false;
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
      let sent = 0, lost = 0;
      for (const it of q) {
        // 取っておいたあとで、この端末に別の人が登録し直したときは、その人の名前で送らない（監査 L-5）
        if (it.uid && D() && it.uid !== D().currentUser) { lost++; continue; }
        const r = await post(it, true);
        if (r === 'ok') sent++;
        else if (r === 'queued' || r === 'many' || r === 'old') rest.push(it); // まだ送れない（同じ cid なので、送り直しても2件にはならない）
        else lost++; // 受け付けていない・断られた（監査 M-1：黙って消さず、知らせる）
      }
      lsSet(QKEY, JSON.stringify(rest));
      if (lost) toast(`取っておいた「こまったこと・提案」のうち ${lost}件は送れませんでした`);
      else if (sent) toast('取っておいた「こまったこと・提案」を送りました');
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
      <div class="setrow"><span>ホームに「こまったこと・提案を送る」を出す<br><small class="hint">届いた声は、送った人の名前と一緒にこの下で見られます。AIに渡す形でコピーするときは、名前を外します</small></span>
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
    catch (e) { items = null; toast(e && e.code === 'unknown_action' ? 'サーバーの準備がまだできていません（サーバーの更新が必要です）' : '読み込めませんでした。電波を確かめて、もう一度押してください'); }
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
          <p style="margin:0 0 4px"><b>${esc(KIND_NAME[x.kind] || x.kind)}</b>　<small class="hint">${esc(fmtAt(x.at))}・${esc(plain(x.who) || '（名前なし）')}（${esc(x.role)}）・${esc(ST_NAME[x.status] || x.status)}</small></p>
          <p style="margin:0 0 6px;white-space:pre-wrap;word-break:break-word">${esc(plain(x.text))}</p>
          ${x.pc ? `<button type="button" class="btn small" data-ikph="${esc(x.id)}" data-ikpn="${Number(x.pc) || 0}" style="margin:0 0 6px">写真を見る（${Number(x.pc) || 0}枚）</button>` : ''}
          <p class="hint" style="margin:0 0 6px">${esc([VIEW_NAME[x.scr] || x.scr, x.ver, MODE_NAME[x.mode], DEV_NAME[x.dev], x.net === 'off' ? '電波なし' : '', plain(x.err)].filter(Boolean).join('・'))}</p>
          <div class="seg" role="group" aria-label="状態">${['doing', 'done', 'skip', 'new'].map(s => `<button type="button" data-ikmark="${esc(x.id)}" data-ikst="${s}" aria-pressed="${x.status === s}">${ST_NAME[s]}</button>`).join('')}</div>
        </div>`).join('') : '<div class="empty">ここに出す声はありません</div>'}`;
  }
  function fmtAt(s) { const t = Date.parse(s); if (!isFinite(t)) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function bindList() {
    $$('[data-ikf]').forEach(b => { b.onclick = () => { filt = b.dataset.ikf; renderAdmin(); }; });
    const rl = $('#ikReload'); if (rl) rl.onclick = load;
    const cp = $('#ikCopy'); if (cp) cp.onclick = copyForAi;
    $$('[data-ikph]').forEach(b => { b.onclick = () => showPhotos(b.dataset.ikph, Number(b.dataset.ikpn) || 0); });
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
  async function showPhotos(id, n) {
    setSheet(`<h2>写真（${n}枚）</h2><div id="ikPh">${Array.from({ length: n }, (_, i) => `<p class="hint" id="ikPh${i}">${i + 1}枚目を読み込んでいます…</p>`).join('')}</div>
      <div class="row"><button type="button" class="btn primary" data-close>閉じる</button></div>`);
    for (let i = 0; i < n; i++) {
      const el = $('#ikPh' + i); if (!el) return; // 閉じた
      try {
        const r = await api('iken_photo_get', { id, i }, { timeout: 60000 });
        if (!/^\/9j\//.test(String(r.data || ''))) throw new Error('photo');
        el.outerHTML = `<img src="data:image/jpeg;base64,${r.data}" alt="写真 ${i + 1}" style="display:block;width:100%;height:auto;border-radius:10px;margin:0 0 10px">`;
      } catch (e) { el.textContent = `${i + 1}枚目は読み込めませんでした`; }
    }
  }
  function aiText(L) {
    const d = new Date();
    const head = `# 区域マップ：こまったこと・提案（${L.length}件・${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 時点）

次は、区域マップ（家から家への訪問を記録し、区域カードを管理するスマホのアプリ）の利用者から届いた声です（送った人の名前は外してあります）。利用者には年配の人やスマホに不慣れな人も多くいます。区域係として改善の計画を立てたいので、次をしてください。

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
    return head + L.map(x => `- ${x.id.slice(-6)}｜${x.at.slice(0, 16).replace('T', ' ')}（UTC）｜${KIND_NAME[x.kind] || x.kind}｜${x.role}｜${VIEW_NAME[x.scr] || x.scr || '—'}｜${x.ver || '—'}｜${MODE_NAME[x.mode] || '—'}｜${DEV_NAME[x.dev] || '—'}｜${x.net === 'off' ? 'なし' : x.net === 'on' ? 'あり' : '—'}｜${plain(x.err) || 'なし'}｜${ST_NAME[x.status] || x.status}${x.pc ? `｜写真 ${x.pc}枚（係が別に渡す）` : ''}
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
