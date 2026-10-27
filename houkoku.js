/* =========================================================
   区域マップ：奉仕報告を会衆の報告システム（S21）に送る（houkoku.js・2026-10-27）

   ・使えるのは「奉仕時間」を使う人だけ（設定の「使う機能」）。区域係の設定「奉仕報告を S21 に送る」が「使う」のとき。
     どちらかがオフなら、月末の奉仕報告の画面は今までどおり（LINEで送る）。
   ・本人の登録や URL の貼り付けはいらない。区域マップのサーバー（s21.gs）が、端末の登録から本人を決め、
     S21 の名簿と名前で対応づけて送る。S21 のトークン・連携キーは端末に来ない。
   ・入口は今までどおり（ホームの月のまとめ・月末の夜8時の自動表示・月ごとの記録）。app.js の openReportSheet がここを呼ぶ。
   ・画面の並びは S-4 と同じ：伝道した・聖書研究・補助開拓・時間（開拓者か補助開拓のときだけ）・承認された活動（開拓者）・備考。
   ・送れなかったときは、この端末に下書き（o.s21q）を残し、電波が戻ったら送り直す。送れたら消す。
     報告の中身は区域マップのサーバーにも残らない。この端末には、今までどおり「送った月・数・日時」（o.reports）だけが残る。
   ・区域係の画面「設定・データ」に、つなぎ方（URL・連携キー・接続テスト・名前の対応・試しに送る）。
   ========================================================= */
(function () {
  'use strict';

  const H_MAX = 300, S_MAX = 99;
  const on = () => LIVE && !!D() && Number((D().settings || {}).s21On) === 1;
  const use = () => on() && featTime();
  const Mo = ym => Number(String(ym).slice(5));
  const clampInt = (v, max) => { const n = parseInt(String(v).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10); return isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
  const subDate = s => { const t = Date.parse(s); return isFinite(t) ? fmtDate(new Date(t).toISOString()) : esc(s || ''); };
  const RETRY = ['timeout', 'network', 'nonjson', 'busy', 'server', 's21_net', 's21_busy', 's21_server', 'slow'];
  const isRetry = e => RETRY.indexOf(e && (e.code || e.message)) >= 0 || /^http/.test(String(e && (e.code || e.message)));
  const errText = e => {
    const c = e && (e.code || e.message);
    if (c === 's21_noperson') return '会衆の報告システムで、名前が見つかりませんでした。区域係に伝えてください。';
    if (c === 's21_inactive') return '会衆の報告システムで、報告の対象になっていません。区域係か書記に伝えてください。';
    if (c === 's21_key' || c === 's21_nocfg' || c === 's21_off') return '会衆の報告システムにつながっていません。区域係に伝えてください。';
    if (c === 's21_invalid' || c === 's21_badym') return '入れた内容を受け付けてもらえませんでした。数字を確かめてください。';
    if (c === 'slow') return '続けて送ったため、少し待ってから送ってください。';
    return '電波が弱いか、会衆の報告システムが混み合っていて、送れませんでした。';
  };

  /* ---- この端末に残すもの（本人のスマホの中だけ） ---- */
  function remember(fn) { const o = myData(); o.s21q = o.s21q || {}; o.s21p = o.s21p || null; fn(o); mySave(o); }
  function markSent(ym, v, late) {
    remember(o => {
      o.reports[ym] = { h: v.hours || 0, les: v.studies || 0, at: new Date().toISOString(), how: 's21', late: late ? 1 : 0 };
      o.lastLes = v.studies || 0;
      delete o.s21q[ym];
    });
    renderHome();
  }

  /* ---- 報告の画面 ---- */
  function open(ym, opt) {
    opt = opt || {};
    const dry = !!opt.dry;
    const o0 = myData(), done = monthMin(o0, ym), goal = (o0.goals || {})[ym] || 0;
    const title = dry ? `${Mo(ym)}月の奉仕報告（試し）` : opt.auto ? 'おつかれさまでした！' : `${Mo(ym)}月の奉仕報告`;
    setSheet(headHtml(null, title, dry ? '試しに送ります（会衆の記録は変わりません）' : opt.auto ? `${Mo(ym)}月の奉仕報告` : '') +
      '<div class="notice info" role="status">会衆の報告を確かめています…<br><small>はじめは数秒かかることがあります</small></div>' +
      '<button class="btn block" data-close>閉じる</button>');
    api('s21_me', { ym }, { timeout: 45000 }).then(r => {
      remember(o => { o.s21p = { name: r.person.name, pioneer: !!r.person.pioneer }; });
      paint(ym, opt, { person: r.person, report: r.report && !r.report.empty ? r.report : null, done, goal });
    }, e => {
      const c = e && (e.code || e.message);
      if (c === 'auth') return;
      if (!dry && (c === 's21_noperson' || c === 's21_inactive' || c === 's21_off' || c === 's21_nocfg' || c === 's21_key')) {
        openReportLine(ym, Object.assign({}, opt, { note: errText(e) + '下の方法で送ることもできます。' }));
        return;
      }
      // つながらない：前に確かめた本人の情報で入力だけできるようにし、送るのはつながったとき
      const p = myData().s21p;
      paint(ym, opt, { person: p || { name: me().name, pioneer: false }, report: null, done, goal, offline: true, unknown: !p, err: e });
    });
  }

  function paint(ym, opt, ctx) {
    const dry = !!opt.dry;
    const o = myData(), draft = (o.s21q || {})[ym], rep = ctx.report, pio = !!ctx.person.pioneer;
    const fromRec = Math.floor(ctx.done / 60);
    const v = draft ? Object.assign({}, draft.v)
      : rep ? { preached: !!rep.preached, studies: rep.studies || 0, aux: !!rep.aux, hours: rep.hours || 0, actHours: rep.actHours || 0, remarks: rep.remarks || '' }
        : { preached: ctx.done > 0, studies: o.lastLes || 0, aux: false, hours: fromRec, actHours: 0, remarks: '' };
    let state = v;
    const read = () => {
      const S = $('#sheet');
      const n = k => { const el = $(`[data-s21n="${k}"]`, S); return el ? clampInt(el.value, k === 'studies' ? S_MAX : H_MAX) : state[k]; };
      const pr = $('#s21Pre', S), rm = $('#s21Rem', S);
      state = Object.assign({}, state, { preached: pr ? pr.checked : state.preached, studies: n('studies'), hours: n('hours'), actHours: n('actHours'), remarks: rm ? rm.value.slice(0, 200) : state.remarks });
      return state;
    };
    const numRow = (k, label, unit, max, hint) => `<div class="rpline"><p class="q" style="margin:0">${label}${hint ? `<br><small class="hint">${hint}</small>` : ''}</p>
      <div class="stepper"><button type="button" data-s21d="${k}" data-d="-1" aria-label="${label}を1へらす">−</button>
        <div class="dmin"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${String(max).length}" data-s21n="${k}" value="${state[k]}" aria-label="${label}（数字を入れる）" autocomplete="off"><span>${unit}</span></div>
        <button type="button" data-s21d="${k}" data-d="1" aria-label="${label}を1ふやす">＋</button></div></div>`;
    const draw = () => {
      const s = state, showH = pio || s.aux;
      const head = dry ? `${Mo(ym)}月の奉仕報告（試し）` : opt.auto ? 'おつかれさまでした！' : `${Mo(ym)}月の奉仕報告`;
      const sub = dry ? '試しに送ります（会衆の記録は変わりません）' : opt.auto ? `${Mo(ym)}月の奉仕報告` : '';
      setSheet(headHtml(null, head, sub) + `
        ${opt.auto ? `<p class="praise">${esc(praiseLine(ctx.done, ctx.goal))}</p>` : ''}
        ${ctx.done ? `<div class="rpbox"><p class="muted" style="margin:0">${Mo(ym)}月に記録した時間（${monthDays(o, ym)}日）</p><p class="big">${fmtMin(ctx.done)}</p></div>` : ''}
        <p class="muted" style="margin:6px 0 2px">${esc(ctx.person.name || '')}さんの報告</p>
        ${ctx.offline ? `<div class="notice warn">${esc(errText(ctx.err))}${ctx.unknown ? '<br>入力しておくと、つながったときに送ります（開拓者の人は、つながってから時間を確かめてください）。' : '<br>入力して「会衆に報告する」を押すと、電波が戻ったときに自動で送ります。'}</div>` : ''}
        ${draft ? `<div class="notice warn">まだ送れていない報告があります（${fmtDate(draft.at)}に入力）。「会衆に報告する」を押すと、もう一度送ります。</div>` : ''}
        ${rep && !draft ? `<p class="okmsg">${rep.submitted ? subDate(rep.submitted) + 'に' : ''}会衆に報告しました。直して送ると、上書きされます。</p>` : ''}
        <label class="check big"><input type="checkbox" id="s21Pre"${s.preached ? ' checked' : ''}>1カ月間に何らかの形で伝道した</label>
        ${numRow('studies', '司会した聖書研究（レッスン）の数', '件', S_MAX, '')}
        ${pio ? '' : `<div class="rpline"><p class="q" style="margin:0">補助開拓者として奉仕した</p>
          <div class="seg" role="group" aria-label="補助開拓者として奉仕した"><button type="button" data-s21aux="1" data-keep aria-pressed="${s.aux}">した</button><button type="button" data-s21aux="0" data-keep aria-pressed="${!s.aux}">していない</button></div></div>`}
        ${showH ? numRow('hours', '時間', '時間', H_MAX, ctx.done % 60 ? `記録は${fmtMin(ctx.done)}です（1時間に満たない分は入れていません）` : '') : ''}
        ${pio ? `<details class="more"${s.actHours ? ' open' : ''}><summary>承認された活動の時間を入れる</summary>${numRow('actHours', '承認された活動の時間', '時間', H_MAX, '報告の時間には加えません')}</details>` : ''}
        <details class="more"${s.remarks ? ' open' : ''}><summary>備考を書く</summary>
          <div class="field"><textarea id="s21Rem" rows="3" maxlength="200" aria-label="備考（200文字まで）">${esc(s.remarks)}</textarea></div></details>
        <button class="btn primary block" id="s21Send">${dry ? '試しに送る' : '会衆に報告する'}</button>
        <p class="hint">報告は会衆の報告システム（S21）に送られます。区域マップのサーバーには残りません。締切（5日）をすぎて送ると、翌月の会衆の報告に加えられます。</p>
        ${dry ? '' : '<details class="more"><summary>ほかの方法で送る（LINE・コピー）</summary><button class="btn block" id="s21Line">LINEなどで送る画面を開く</button></details>'}
        <button class="btn block" data-close>${rep ? '閉じる' : 'あとで'}</button>`);
      const S = $('#sheet');
      $$('[data-s21d]', S).forEach(b => b.onclick = () => {
        const k = b.dataset.s21d, el = $(`[data-s21n="${k}"]`, S), max = k === 'studies' ? S_MAX : H_MAX;
        el.value = Math.max(0, Math.min(max, clampInt(el.value, max) + Number(b.dataset.d)));
      });
      $$('[data-s21n]', S).forEach(el => {
        el.onfocus = () => setTimeout(() => { try { el.select(); } catch (x) { /* 何もしない */ } }, 0);
        el.onblur = () => { el.value = clampInt(el.value, el.dataset.s21n === 'studies' ? S_MAX : H_MAX); };
      });
      $$('[data-s21aux]', S).forEach(b => b.onclick = () => { read(); state.aux = b.dataset.s21aux === '1'; draw(); });
      if ($('#s21Line', S)) $('#s21Line', S).onclick = () => openReportLine(ym, Object.assign({}, opt, { h: pio || state.aux ? read().hours : fromRec, les: read().studies }));
      $('#s21Send', S).onclick = () => send(ym, opt, ctx, read());
    };
    draw();
  }

  async function send(ym, opt, ctx, v) {
    const dry = !!opt.dry, showH = !!ctx.person.pioneer || v.aux;
    const body = { ym, preached: !!v.preached, studies: v.studies, aux: !ctx.person.pioneer && !!v.aux, hours: showH ? v.hours : 0, actHours: ctx.person.pioneer ? v.actHours : 0, remarks: v.remarks || '' };
    if (!body.preached && !body.studies && !body.hours) {
      if (!await ask(`伝道したにチェックがなく、研究も時間も0です。このまま${Mo(ym)}月の報告を送りますか？`, { ok: '送る', danger: false })) return;
    }
    if (dry) body.dryRun = true;
    const btn = $('#s21Send'); if (btn) { btn.disabled = true; btn.textContent = '送っています…'; }
    try {
      const r = await api('s21_send', body, { timeout: 45000 });
      if (!dry) markSent(ym, body, r.late);
      done(ym, opt, body, r);
    } catch (e) {
      const c = e && (e.code || e.message);
      if (c === 'auth') return;
      if (btn) { btn.disabled = false; btn.textContent = dry ? '試しに送る' : '会衆に報告する'; }
      if (!dry && isRetry(e) && c !== 'slow') {
        remember(o => { o.s21q[ym] = { v: body, at: new Date().toISOString() }; });
        setSheet(headHtml(null, `${Mo(ym)}月の奉仕報告`, '') + `<div class="notice warn">${esc(errText(e))}<br>入力した内容はこのスマホに残しました。電波が戻ったら、自動で送ります。</div>
          <button class="btn block" data-close>閉じる</button>`);
        renderHome();
        return;
      }
      infoSheet('送れませんでした', esc(errText(e)) + (e.msg ? `<br><small>${esc(e.msg)}</small>` : ''));
    }
  }

  function done(ym, opt, body, r) {
    const dry = !!opt.dry;
    setSheet(headHtml(null, dry ? '試しに送れました' : '報告しました', `${Mo(ym)}月の奉仕報告`) + `
      <p class="praise">${dry ? '会衆の報告システムにつながっています（記録は変わっていません）。' : 'おつかれさまでした！'}</p>
      <div class="rpbox">${body.preached ? '伝道した・' : ''}聖書研究 ${body.studies}件${body.hours ? `・時間 ${body.hours}時間` : ''}${body.aux ? '・補助開拓' : ''}${body.actHours ? `・承認された活動 ${body.actHours}時間` : ''}</div>
      ${r.late ? '<div class="notice info">締切（5日）をすぎたため、翌月の会衆の報告に加えられます。</div>' : ''}
      <button class="btn primary block" data-close>閉じる</button>`);
    if (!dry) toast('奉仕報告を送りました');
  }

  /* ---- 送れなかった報告を、電波が戻ったら送り直す ----
     ほかの端末で、あとから送り直していたら（S21 の提出日時のほうが新しければ）、古い下書きは送らずに消す */
  let flushing = false;
  async function flushQueue() {
    if (flushing || !use() || !navigator.onLine) return;
    const q = (myData().s21q) || {}, yms = Object.keys(q).sort();
    if (!yms.length) return;
    flushing = true;
    try {
      for (const ym of yms) {
        const item = q[ym];
        try {
          const m = await api('s21_me', { ym }, { timeout: 45000 });
          const sub = m.report && !m.report.empty ? Date.parse(m.report.submitted) : NaN;
          if (isFinite(sub) && sub > Date.parse(item.at)) { remember(o => { delete o.s21q[ym]; }); continue; }
          const r = await api('s21_send', item.v, { timeout: 45000 });
          markSent(ym, item.v, r.late);
          toast(`${Mo(ym)}月の奉仕報告を送りました${r.late ? '（締切後のため、翌月の会衆の報告に加えられます）' : ''}`);
        } catch (e) {
          if (isRetry(e)) break; // まだつながらない：次の機会に
          remember(o => { delete o.s21q[ym]; });
          toast(`${Mo(ym)}月の奉仕報告を送れませんでした。月のまとめから、もう一度送ってください`);
        }
      }
    } finally { flushing = false; }
  }
  window.addEventListener('online', () => setTimeout(flushQueue, 3000));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(flushQueue, 5000); });
  setTimeout(flushQueue, 10000);

  /* ---- 月ごとの記録の表に「会衆に報告済み」を出す ---- */
  function markHist(box) {
    if (!use() || !box) return;
    api('s21_me', {}, { timeout: 45000 }).then(r => {
      const got = {};
      (r.recent || []).concat(r.report ? [r.report] : []).forEach(x => { if (x && x.ym && !x.empty) got[x.ym] = 1; });
      $$('[data-report]', box).forEach(b => { if (got[b.dataset.report]) b.textContent = '会衆に報告済み'; });
    }, () => {});
  }

  /* ---- 区域係：つなぎ方 ---- */
  function renderAdmin() {
    const box = $('#adS21'); if (!box) return;
    if (!LIVE) { box.innerHTML = ''; return; }
    const st = D().settings, onNow = Number(st.s21On) === 1;
    box.innerHTML = `<h2 class="sec">奉仕報告（会衆の報告システム S21）</h2>
      <div class="setrow"><span>奉仕報告を S21 に送る<br><small class="hint">「奉仕時間」を使っている人が、月末の奉仕報告の画面から、そのまま会衆に報告できます。本人の登録や設定はいりません</small></span>
        <div class="seg" role="group" aria-label="奉仕報告を S21 に送る"><button type="button" data-sset="s21On" data-v="1" aria-pressed="${onNow}">使う</button>
        <button type="button" data-sset="s21On" data-v="0" aria-pressed="${!onNow}">使わない</button></div></div>
      ${onNow ? '<div id="s21Cfg"><p class="hint">つながり方を確かめています…</p></div>' : ''}`;
    if (onNow) loadCfg();
  }
  async function loadCfg() {
    const box = $('#s21Cfg'); if (!box) return;
    let c;
    try { c = await api('s21_cfg', {}, { timeout: 30000 }); } catch (e) { box.innerHTML = '<p class="hint">つながり方を確かめられませんでした。電波を確かめてください。</p>'; return; }
    const ready = c.url && c.keySet;
    box.innerHTML = `
      <div class="setrow"><span>つなぎ先：<b>${c.url ? '設定済み' : 'まだ'}</b>・連携キー：<b>${c.keySet ? '設定済み' : 'まだ'}</b><br>
        <small class="hint">S21 のウェブアプリのURLと、S21 の書記の画面で発行した連携キーを入れます。キーは区域マップのサーバーにだけ保存し、この画面にも出しません</small></span></div>
      <details class="more"${ready ? '' : ' open'}><summary>${ready ? 'URL・連携キーを変える' : 'URL・連携キーを入れる'}</summary>
        <label class="field">S21 のURL（…/exec）<input type="text" id="s21Url" inputmode="url" autocomplete="off" spellcheck="false" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></label>
        <label class="field">連携キー<input type="password" id="s21Key" autocomplete="new-password" spellcheck="false" placeholder="${c.keySet ? '変えるときだけ入れる' : '貼り付ける'}"></label>
        <button class="btn primary block" id="s21SaveCfg">保存する</button></details>
      ${ready ? `<div class="row"><button class="btn" id="s21Test">接続テスト</button><button class="btn" id="s21Match">名前の対応を見る</button><button class="btn" id="s21Dry">試しに送ってみる</button></div>
        <p class="hint" id="s21Msg"></p>` : ''}`;
    $('#s21SaveCfg').onclick = async () => {
      const url = $('#s21Url').value.trim(), key = $('#s21Key').value.trim();
      const body = {}; if (url !== (c.url || '')) body.url = url; if (key) body.key = key;
      if (!Object.keys(body).length) { toast('変えたところはありません'); return; }
      try { await api('s21_set', body, { timeout: 30000 }); $('#s21Key').value = ''; toast('保存しました'); loadCfg(); }
      catch (e) { toast(e.code === 's21_badurl' ? 'URLの形がちがいます（…/exec で終わるURL）' : e.code === 's21_badkey' ? '連携キーの形がちがいます' : '保存できませんでした'); }
    };
    if (!ready) return;
    const msg = t => { const m = $('#s21Msg'); if (m) m.textContent = t; };
    $('#s21Test').onclick = async () => {
      msg('つないでいます…');
      try { const r = await api('s21_test', {}, { timeout: 45000 }); msg(`${r.congregation || 'S21'}につながりました`); }
      catch (e) { msg(e.code === 's21_key' ? '連携キーがちがいます。S21 で発行したキーを入れ直してください' : 'つながりませんでした。URLと、S21 側の準備を確かめてください'); }
    };
    $('#s21Match').onclick = () => openMatch(false);
    $('#s21Dry').onclick = () => {
      const d = new Date(), ym = d.getDate() <= 10 ? ymOf(new Date(d.getFullYear(), d.getMonth() - 1, 1)) : ymOf(d);
      open(ym, { dry: true });
    };
  }
  async function openMatch(fresh) {
    setSheet(headHtml(null, '名前の対応', '区域マップの人 → S21 の人') + '<div class="notice info" role="status">S21 の名簿と照らし合わせています…</div><button class="btn block" data-close>閉じる</button>');
    let r;
    try { r = await api('s21_match', { fresh }, { timeout: 45000 }); }
    catch (e) { infoSheet('名簿を確かめられませんでした', e.code === 's21_key' ? '連携キーがちがいます。' : '電波か、S21 側の準備を確かめてください。'); return; }
    paintMatch(r);
  }
  function paintMatch(r) {
    const opts = sel => '<option value="">（えらばない）</option>' + r.roster.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}${p.group ? `（${esc(p.group)}）` : ''}</option>`).join('');
    const bad = r.people.filter(p => p.how === 'none' || p.how === 'ambig' || p.how === 'gone');
    const good = r.people.filter(p => p.how === 'auto' || p.how === 'manual');
    const why = { none: '名前が見つかりません', ambig: '同じ名前が2人以上います', gone: 'えらんだ人が S21 にいません' };
    const row = p => `<div class="setrow"><span>${esc(p.name)}${p.how === 'manual' ? '<br><small class="muted">区域係がえらびました</small>' : why[p.how] ? `<br><small class="muted">${why[p.how]}</small>` : ''}</span>
      <select class="s21sel" data-s21link="${esc(p.uid)}" aria-label="${esc(p.name)}さんの S21 での名前">${opts(p.pid)}</select></div>`;
    setSheet(headHtml(null, '名前の対応', `つながっている人 ${good.length}人・見つからない人 ${bad.length}人`) + `
      <p class="muted">名前が同じ人は、自動でつながっています。見つからない人だけ、S21 の名前をえらんでください。「奉仕時間」を使っていない人は、そのままでもかまいません。</p>
      ${bad.length ? `<h3>見つからない人</h3>${bad.map(row).join('')}` : '<div class="okmsg">全員つながっています。</div>'}
      <details class="more"><summary>つながっている人（${good.length}人）</summary>${good.map(row).join('')}</details>
      <button class="btn block" id="s21Fresh">S21 の名簿を読み直す</button>
      <button class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    $$('[data-s21link]', S).forEach(el => el.onchange = async () => {
      el.disabled = true;
      try { const nr = await api('s21_link', { uid: el.dataset.s21link, pid: el.value }, { timeout: 45000 }); toast('名前の対応を保存しました'); paintMatch(nr); }
      catch (e) { el.disabled = false; toast('保存できませんでした'); }
    });
    $('#s21Fresh', S).onclick = () => openMatch(true);
  }

  window.S21R = { use, open, renderAdmin, markHist, flush: flushQueue };
})();
