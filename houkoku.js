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
   ・締切（S21 v37・2026-10-28 から。以前は v23 の翌月5日）：締切は翌月10日（S21 の設定。s21_me の deadline）。
     締切を過ぎた月（s21_me の locked）は、まだ出していなくても、ここからは送れない・直せない。書記に伝えてもらう（書記が入力する）。
     その月は見るだけ：出した報告があれば中身、なければ「まだ会衆に届いていません」と、記録した時間（書記に伝えるとき用）。
     送って s21_locked が返ったら・送り直しで締切を過ぎていたら、下書きは残さない（送り直しのときは、画面で知らせる）。
     電波がなく確かめられないときも、この端末の時計で締切を過ぎていれば、入力の画面を出さない（送れない下書きを作らない）。
   ・S21 が受け付けたあとで返事だけ届かなかった下書きは、締切の判定より先に S21 の報告と中身を比べ、同じなら「報告しました」にする（2026-10-30 C1-5）。
   ・報告の画面に、つながっている S21 側の名前を出す（「S21 の「○○」さんとして送ります」。2026-10-30 C1-2）。
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
  /* 締切：その月の翌月の締切日（S21 の deadline。わからないときは app.js の reportDl()＝この端末に覚えた値か10日）の終わりまで */
  const dlOf = dl => { const n = Number(dl); return n >= 1 && n <= 28 && Math.floor(n) === n ? n : reportDl(); };
  const dlDate = (ym, dl) => `${Mo(ym) === 12 ? 1 : Mo(ym) + 1}月${dlOf(dl)}日`; // 例：10月の報告 → 「11月10日」
  const pastDl = (ym, dl) => Date.now() >= new Date(Number(String(ym).slice(0, 4)), Mo(ym), dlOf(dl) + 1).getTime(); // 締切日の翌日0時から
  const errText = (e, ym) => {
    const c = e && (e.code || e.message);
    if (c === 's21_locked') return ym ? `${Mo(ym)}月の報告は締切（${dlDate(ym)}）を過ぎたため、ここからは送ることも直すこともできません。書記に伝えてください（書記が入力します）。`
      : 'この月の報告は締切を過ぎたため、ここからは送ることも直すこともできません。書記に伝えてください（書記が入力します）。';
    if (c === 's21_noperson') return '会衆の報告システムで、名前が見つかりませんでした。区域係に伝えてください。';
    if (c === 's21_inactive') return '会衆の報告システムで、報告の対象になっていません。区域係か書記に伝えてください。';
    if (c === 's21_key' || c === 's21_nocfg' || c === 's21_off') return '会衆の報告システムにつながっていません。区域係に伝えてください。';
    if (c === 's21_invalid' || c === 's21_badym') return '入れた内容を受け付けてもらえませんでした。数字を確かめてください。';
    if (c === 'slow') return '続けて送ったため、少し待ってから送ってください。';
    return '電波が弱いか、会衆の報告システムが混み合っていて、送れませんでした。';
  };
  /* S21 の報告と、送ろうとした内容（下書き）が同じか（受け付けられたのに返事だけ届かなかったかを見分ける。C1-5）
     備考は、サーバー（s21.gs の s21Clean_）と同じく制御文字を除き、200字までで比べる */
  const remN = s => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, 200).trim();
  const sameRep = (r, v) => !!r && !r.empty && !!v && !!r.preached === !!v.preached && (Number(r.studies) || 0) === (Number(v.studies) || 0) &&
    !!r.aux === !!v.aux && (Number(r.hours) || 0) === (Number(v.hours) || 0) && (Number(r.actHours) || 0) === (Number(v.actHours) || 0) &&
    remN(r.remarks) === remN(v.remarks);
  /* つながっている S21 側の名前（C1-2）。前に確かめたことがないとき（unknown）は、区域マップの名前で「○○さんの報告」 */
  const whoLine = (ctx, pio) => ctx.unknown ? `${ctx.person.name || ''}さんの報告${pio ? '（開拓者）' : ''}`
    : `S21 の「${ctx.person.name || ''}」さんとして送ります${pio ? '（開拓者）' : ''}`;

  /* ---- この端末に残すもの（本人のスマホの中だけ） ---- */
  function remember(fn) { const o = myData(); o.s21q = o.s21q || {}; o.s21p = o.s21p || null; fn(o); mySave(o); }
  // kind：'pub'（伝道者）・'aux'（補助開拓）・'rp'（開拓者）。ホームの「報告済み」の文に使う
  function markSent(ym, v, late, kind, auxH) {
    remember(o => {
      o.reports[ym] = { kind: kind || (v.aux ? 'aux' : v.hours ? 'rp' : 'pub'), pre: !!v.preached || v.hours > 0 || v.studies > 0, h: v.hours || 0, les: v.studies || 0, auxH: auxH || 0, at: new Date().toISOString(), how: 's21', late: late ? 1 : 0 };
      o.lastLes = v.studies || 0;
      delete o.s21q[ym];
    });
    renderHome();
  }

  /* ---- 報告の入力（S-4 の並び）：S21 に送る画面と、LINE で送る画面（app.js の openReportLine）で同じものを使う ----
     状態 st = { pre: true|false|null（伝道した：はい・いいえ・まだ）, studies, aux: 0|15|30（補助開拓の時間の目安）, hours, actHours, remarks（本人の備考） }
     ・伝道者：「伝道した」を「はい｜いいえ」。はいなら研究の数・補助開拓（していない｜15時間｜30時間）、補助なら時間。いいえなら、ほかは出さない
     ・開拓者：「伝道した」は聞かない（時間か研究が1以上なら伝道した）。研究の数・時間・承認された活動の時間
     ・補助開拓の時間（15・30）は、備考の頭に「補助開拓（15時間）」と入れて送る（S21 の補助開拓の印は aux） */
  const AUX_RE = /^補助開拓（(15|30)時間）[ 　]?/;
  const auxTag = n => `補助開拓（${n}時間）`;
  function splitRemarks(r) { const m = AUX_RE.exec(r || ''); return m ? { aux: Number(m[1]), rest: String(r).slice(m[0].length) } : { aux: 0, rest: String(r || '') }; }
  function joinRemarks(aux, rest) { return ((aux ? auxTag(aux) + (rest ? '　' : '') : '') + (rest || '')).slice(0, 200); }
  /* S21 の報告（または送った内容）から、入力の状態を作る */
  function stFromReport(r, pio) {
    const sp = splitRemarks(r.remarks);
    return { pre: pio ? true : !!r.preached, studies: r.studies || 0, aux: !pio && r.aux ? (sp.aux || 30) : 0, hours: r.hours || 0, actHours: r.actHours || 0, remarks: sp.rest };
  }
  /* 送る内容（S21 の項目）にする */
  function toBody(st, pio) {
    if (pio) return { preached: st.hours > 0 || st.studies > 0, studies: st.studies, aux: false, hours: st.hours, actHours: st.actHours || 0, remarks: (st.remarks || '').slice(0, 200) };
    if (st.pre !== true) return { preached: false, studies: 0, aux: false, hours: 0, actHours: 0, remarks: (st.remarks || '').slice(0, 200) };
    return { preached: true, studies: st.studies, aux: st.aux > 0, hours: st.aux > 0 ? st.hours : 0, actHours: 0, remarks: joinRemarks(st.aux, st.remarks) };
  }
  /* 送る前の確かめ。止めるときは false */
  async function checkSt(st, pio, ym) {
    if (!pio && st.pre == null) { toast('「1カ月間に何らかの形で伝道した」の「はい」か「いいえ」を選んでください'); return false; }
    if (pio && !st.hours && !st.studies && !await ask(`時間も研究も0です。このまま${Mo(ym)}月の報告を送りますか？`, { ok: '送る', danger: false })) return false;
    if (!pio && st.pre && st.aux && !st.hours && !await ask(`補助開拓で、時間が0です。このまま${Mo(ym)}月の報告を送りますか？`, { ok: '送る', danger: false })) return false;
    return true;
  }
  const numRow = (st, k, label, unit, max, hint) => `<div class="rpline"><p class="q" style="margin:0">${label}${hint ? `<br><small class="muted">${hint}</small>` : ''}</p>
    <div class="stepper"><button type="button" data-rfd="${k}" data-d="-1" aria-label="${label}を1へらす">−</button>
      <div class="dmin"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${String(max).length}" data-rfn="${k}" value="${st[k]}" aria-label="${label}（数字を入れる）" autocomplete="off"><span>${unit}</span></div>
      <button type="button" data-rfd="${k}" data-d="1" aria-label="${label}を1ふやす">＋</button></div></div>`;
  /* o = { pio, done（その月に記録した分）, act（承認された活動を出す）, rem（備考を出す） } */
  function formHtml(st, o) {
    const pio = !!o.pio, yes = st.pre === true, showH = pio || (yes && st.aux > 0);
    const hHint = o.done % 60 ? `記録は${fmtMin(o.done)}です（1時間に満たない分は入れていません）` : '';
    return `<div class="rform">
      ${pio ? '' : `<p class="q" style="margin:10px 0 0">1カ月間に何らかの形で伝道した</p>
        <div class="seg rppick big" role="group" aria-label="1カ月間に何らかの形で伝道した"><button type="button" data-keep data-rfpre="1" aria-pressed="${yes}">はい</button><button type="button" data-keep data-rfpre="0" aria-pressed="${st.pre === false}">いいえ</button></div>`}
      ${pio || yes ? numRow(st, 'studies', '司会した聖書研究（レッスン）の数', '件', S_MAX, '') : ''}
      ${!pio && yes ? `<p class="q" style="margin:10px 0 0">補助開拓者として奉仕した</p>
        <div class="seg rppick" role="group" aria-label="補助開拓者として奉仕した">${[[0, 'していない'], [15, '補助 15時間'], [30, '補助 30時間']].map(([v, l]) =>
          `<button type="button" data-keep data-rfaux="${v}" aria-pressed="${st.aux === v}">${l}</button>`).join('')}</div>
        ${st.aux ? `<p class="muted" style="margin:2px 0 0">備考に「${auxTag(st.aux)}」と入れて送ります</p>` : ''}` : ''}
      ${showH ? numRow(st, 'hours', '時間', '時間', H_MAX, hHint) : ''}
      ${pio && o.act ? `<details class="more"${st.actHours ? ' open' : ''}><summary>承認された活動の時間を入れる</summary>${numRow(st, 'actHours', '承認された活動の時間', '時間', H_MAX, '報告の時間には加えません')}</details>` : ''}
      ${o.rem ? `<details class="more"${st.remarks ? ' open' : ''}><summary>備考を書く</summary>
        <div class="field"><textarea id="rfRem" rows="3" maxlength="${st.aux ? 190 : 200}" aria-label="備考">${esc(st.remarks)}</textarea></div></details>` : ''}
    </div>`;
  }
  function formRead(st) {
    const S = $('#sheet');
    const n = k => { const el = $(`[data-rfn="${k}"]`, S); return el ? clampInt(el.value, k === 'studies' ? S_MAX : H_MAX) : st[k]; };
    const rm = $('#rfRem', S);
    Object.assign(st, { studies: n('studies'), hours: n('hours'), actHours: n('actHours'), remarks: rm ? rm.value.slice(0, 200) : st.remarks });
    return st;
  }
  /* redraw：選んだものが変わったとき（はい・いいえ・補助）。change：数字や文が変わったとき（LINE の文を直すため） */
  function formBind(st, redraw, change) {
    const S = $('#sheet');
    $$('[data-rfd]', S).forEach(b => b.onclick = () => {
      const k = b.dataset.rfd, el = $(`[data-rfn="${k}"]`, S), max = k === 'studies' ? S_MAX : H_MAX;
      el.value = Math.max(0, Math.min(max, clampInt(el.value, max) + Number(b.dataset.d)));
      formRead(st); if (change) change();
    });
    $$('[data-rfn]', S).forEach(el => {
      el.onfocus = () => setTimeout(() => { try { el.select(); } catch (x) { /* 何もしない */ } }, 0);
      el.onblur = () => { el.value = clampInt(el.value, el.dataset.rfn === 'studies' ? S_MAX : H_MAX); formRead(st); if (change) change(); };
      el.oninput = () => { formRead(st); if (change) change(); };
    });
    if ($('#rfRem', S)) $('#rfRem', S).oninput = () => { formRead(st); if (change) change(); };
    $$('[data-rfpre]', S).forEach(b => b.onclick = () => { formRead(st); st.pre = b.dataset.rfpre === '1'; redraw(); });
    $$('[data-rfaux]', S).forEach(b => b.onclick = () => { formRead(st); st.aux = Number(b.dataset.rfaux); redraw(); });
  }
  window.RepForm = { html: formHtml, read: formRead, bind: formBind, check: checkSt, toBody, fromReport: stFromReport, auxTag };

  /* ---- 報告の画面 ---- */
  function open(ym, opt) {
    opt = opt || {};
    const dry = !!opt.dry;
    const o0 = myData(), done = monthMin(o0, ym), goal = (o0.goals || {})[ym] || 0;
    const title = dry ? `${Mo(ym)}月の奉仕報告（試し）` : opt.auto ? 'おつかれさまでした！' : `${Mo(ym)}月の奉仕報告`;
    setSheet(headHtml(null, title, dry ? '試しに送ります（会衆の記録は変わりません）' : opt.auto ? `${Mo(ym)}月の奉仕報告` : '') +
      (opt.pick ? reportPickHtml(ym) : '') + '<div class="notice info" role="status">会衆の報告を確かめています…<br><small>はじめは数秒かかることがあります</small></div>' +
      '<button class="btn block" data-close>閉じる</button>');
    if (opt.pick) bindReportPick(opt);
    api('s21_me', { ym }, { timeout: 45000 }).then(r => {
      const dl = dlOf(r.deadline);
      remember(o => { o.s21p = { name: r.person.name, pioneer: !!r.person.pioneer, dl }; }); // dl：締切日（ホームの「報告の時期」にも使う）
      paint(ym, opt, { person: r.person, report: r.report && !r.report.empty ? r.report : null, locked: !!r.locked, deadline: dl, done, goal });
    }, e => {
      const c = e && (e.code || e.message);
      if (c === 'auth') return;
      // 締切後で送れなかったあと、確かめ直せなかった：案内だけ（入力の画面には戻さない）
      if (opt.lockedNow) { infoSheet('送れませんでした', esc(errText({ code: 's21_locked' }, ym))); return; }
      if (!dry && (c === 's21_noperson' || c === 's21_inactive' || c === 's21_off' || c === 's21_nocfg' || c === 's21_key')) {
        openReportLine(ym, Object.assign({}, opt, { note: errText(e) + '下の方法で送ることもできます。' }));
        return;
      }
      // つながらない：前に確かめた本人の情報で入力だけできるようにし、送るのはつながったとき
      const p = myData().s21p;
      paint(ym, opt, { person: p || { name: me().name, pioneer: false }, report: null, deadline: dlOf(p && p.dl), done, goal, offline: true, unknown: !p, err: e });
    });
  }

  /* 送った・出した報告の中身（1行ずつ。ことばの切りかえで訳せるように） */
  function sumHtml(b) {
    const L = [b.preached ? '伝道した' : '伝道していない'];
    if (b.preached) L.push(`聖書研究 ${b.studies || 0}件`);
    if (b.aux) { const a = splitRemarks(b.remarks).aux; L.push(a ? auxTag(a) : '補助開拓'); }
    if (b.hours) L.push(`時間 ${b.hours}時間`);
    if (b.actHours) L.push(`承認された活動 ${b.actHours}時間`);
    return L.map(esc).join('<br>');
  }
  /* 締切を過ぎた月：見るだけ（入力・送る・LINE はなし。案内と閉じるだけ）
     ・出した報告がある：中身と「ここからは直せません。直すときは書記に」
     ・まだ出していない：「まだ会衆に届いていません。ここからは送れません。書記に」と、書記に伝えるときのための記録した時間
     ・電波がなく確かめられない（この端末の時計で締切を過ぎている）：送ることも直すこともできない、書記に */
  function paintLocked(ym, opt, ctx, justNow) {
    const rep = ctx.report, pio = !!ctx.person.pioneer, D = dlDate(ym, ctx.deadline);
    const head = opt.dry ? `${Mo(ym)}月の奉仕報告（試し）` : `${Mo(ym)}月の奉仕報告`;
    const rec = ctx.done ? `<div class="rpbox"><p class="muted" style="margin:0">${Mo(ym)}月に記録した時間（${monthDays(myData(), ym)}日）</p><p class="big">${fmtMin(ctx.done)}</p></div>` : '';
    const body = rep ? `<p class="okmsg">${rep.submitted ? subDate(rep.submitted) + 'に' : ''}会衆に報告しました。</p>
        <div class="rpbox">${sumHtml(rep)}</div>
        <div class="notice ${justNow ? 'warn' : 'info'}" role="status">${Mo(ym)}月の報告は締切（${D}）を過ぎたため、ここからは直せません。直す必要があるときは、書記に伝えてください（書記が入力します）。</div>`
      : ctx.offline ? `<div class="notice warn" role="status">${esc(errText({ code: 's21_locked' }, ym))}</div>${rec}`
        : `<div class="notice warn" role="status">${Mo(ym)}月の報告は、まだ会衆に届いていません。<br>締切（${D}）を過ぎたため、ここからは送れません。書記に伝えてください（書記が入力します）。</div>${rec}`;
    setSheet(headHtml(null, head, '') + `
      ${opt.pick ? reportPickHtml(ym) : ''}
      <p class="muted" style="margin:6px 0 2px">${esc(ctx.person.name || '')}さんの報告${pio ? '（開拓者）' : ''}</p>
      ${body}
      <button class="btn primary block" data-close>閉じる</button>`);
    if (opt.pick) bindReportPick(opt);
  }

  function paint(ym, opt, ctx) {
    const justNow = !!opt.lockedNow; // 送ったら締切後で断られた（案内を目立たせる）
    if (justNow) { opt = Object.assign({}, opt); delete opt.lockedNow; }
    // 送れなかったはずの下書きと同じ中身が S21 に届いていた（返事だけ届かなかった）：報告済みにして、下書きを消す（C1-5）
    const d0 = (myData().s21q || {})[ym];
    if (!opt.dry && d0 && sameRep(ctx.report, d0.v)) markSent(ym, d0.v, ctx.report.late, d0.kind, d0.auxH);
    // 締切を過ぎた月（S21 の locked。まだ出していなくても）・変えられない報告・電波がなくてもこの端末の時計で締切を過ぎた月
    if (ctx.locked || (ctx.report && ctx.report.locked) || (ctx.offline && pastDl(ym, ctx.deadline))) {
      if ((myData().s21q || {})[ym]) { remember(o => { delete o.s21q[ym]; }); renderHome(); } // 送れない下書きは残さない
      paintLocked(ym, opt, ctx, justNow);
      return;
    }
    const dry = !!opt.dry;
    const o = myData(), draft = (o.s21q || {})[ym], rep = ctx.report, pio = !!ctx.person.pioneer;
    const fromRec = Math.floor(ctx.done / 60);
    const st = draft ? stFromReport(draft.v, pio)
      : rep ? stFromReport(rep, pio)
        : { pre: pio || ctx.done > 0 ? true : null, studies: o.lastLes || 0, aux: 0, hours: fromRec, actHours: 0, remarks: '' };
    if (draft && !pio && !draft.v.preached) st.pre = false;
    const draw = () => {
      const head = dry ? `${Mo(ym)}月の奉仕報告（試し）` : opt.auto ? 'おつかれさまでした！' : `${Mo(ym)}月の奉仕報告`;
      const sub = dry ? '試しに送ります（会衆の記録は変わりません）' : opt.auto ? `${Mo(ym)}月の奉仕報告` : '';
      setSheet(headHtml(null, head, sub) + `
        ${opt.pick ? reportPickHtml(ym) : ''}
        ${opt.auto ? `<p class="praise">${esc(praiseLine(ctx.done, ctx.goal))}</p>` : ''}
        ${ctx.done ? `<div class="rpbox"><p class="muted" style="margin:0">${Mo(ym)}月に記録した時間（${monthDays(o, ym)}日）</p><p class="big">${fmtMin(ctx.done)}</p></div>` : ''}
        <p class="muted s21who" style="margin:6px 0 2px">${esc(whoLine(ctx, pio))}</p>
        ${ctx.offline ? `<div class="notice warn">${esc(errText(ctx.err))}${ctx.unknown ? '<br>入力しておくと、つながったときに送ります（開拓者の人は、つながってから時間を確かめてください）。' : '<br>入力して「会衆に報告する」を押すと、電波が戻ったときに自動で送ります。'}</div>` : ''}
        ${justNow ? `<div class="notice warn" role="status">${esc(errText({ code: 's21_locked' }, ym))}</div>` : ''}
        ${draft ? `<div class="notice warn">まだ送れていない報告があります（${fmtDate(draft.at)}に入力）。「会衆に報告する」を押すと、もう一度送ります。</div>` : ''}
        ${rep && !draft ? `<p class="okmsg">${rep.submitted ? subDate(rep.submitted) + 'に' : ''}会衆に報告しました。直して送ると、上書きされます。</p>` : ''}
        ${formHtml(st, { pio, done: ctx.done, act: true, rem: true })}
        <button class="btn primary block" id="s21Send">${dry ? '試しに送る' : '会衆に報告する'}</button>
        <p class="hint">報告は会衆の報告システム（S21）に送られます。区域マップのサーバーには残りません。締切（${dlDate(ym, ctx.deadline)}）までは、直して送り直せます。</p>
        ${dry ? '' : '<details class="more"><summary>ほかの方法で送る（LINE・コピー）</summary><button class="btn block" id="s21Line">LINEなどで送る画面を開く</button></details>'}
        <button class="btn block" data-close>${rep ? '閉じる' : 'あとで'}</button>`);
      const S = $('#sheet');
      formBind(st, draw);
      if ($('#s21Line', S)) $('#s21Line', S).onclick = () => { formRead(st); openReportLine(ym, Object.assign({}, opt, { kind: pio ? 'rp' : 'pub', st: Object.assign({}, st) })); };
      $('#s21Send', S).onclick = async () => { formRead(st); if (await checkSt(st, pio, ym)) send(ym, opt, ctx, st); };
      if (opt.pick) bindReportPick(opt);
    };
    draw();
  }

  async function send(ym, opt, ctx, st) {
    const dry = !!opt.dry, pio = !!ctx.person.pioneer;
    const body = Object.assign({ ym }, toBody(st, pio));
    if (dry) body.dryRun = true;
    const btn = $('#s21Send'); if (btn) { btn.disabled = true; btn.textContent = '送っています…'; }
    try {
      const r = await api('s21_send', body, { timeout: 45000 });
      if (!dry) markSent(ym, body, r.late, pio ? 'rp' : body.aux ? 'aux' : 'pub', st.aux);
      done(ym, opt, body, r);
      // 終わっていない月を送ったとき：あとで足した時間は、月末にもう一度知らせる（LINE で送るときと同じ・M12・2026.13.105）
      if (!dry && ym === ymOf(new Date()) && !isLastDayStr(ymd(new Date())) && featTime() && UI.fTimer !== 'off') setTimeout(() => toast('月の途中の報告です。このあと時間を足したときは、月末にもう一度お知らせします'), 1800);
    } catch (e) {
      const c = e && (e.code || e.message);
      if (c === 'auth') return;
      if (c === 's21_locked') { // 締切を過ぎて、すでに報告がある：下書きは残さず、その月を見るだけで開き直す
        if ((myData().s21q || {})[ym]) { remember(o => { delete o.s21q[ym]; }); renderHome(); }
        open(ym, Object.assign({}, opt, { lockedNow: true }));
        return;
      }
      if (btn) { btn.disabled = false; btn.textContent = dry ? '試しに送る' : '会衆に報告する'; }
      if (!dry && isRetry(e) && c !== 'slow') {
        remember(o => { o.s21q[ym] = { v: body, kind: pio ? 'rp' : body.aux ? 'aux' : 'pub', auxH: st.aux, at: new Date().toISOString() }; });
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
      <div class="rpbox">${sumHtml(body)}</div>
      ${r.late ? '<div class="notice info">翌月の会衆の報告に加えられます。</div>' : ''}
      <button class="btn primary block" data-close>閉じる</button>`);
    if (!dry) toast('奉仕報告を送りました');
  }

  /* ---- 送れなかった報告を、電波が戻ったら送り直す ----
     ほかの端末で、あとから送り直していたら（S21 の提出日時のほうが新しければ）、古い下書きは送らずに消す。
     締切を過ぎていたら、下書きを消して知らせる（「電波が戻ったら送ります」と伝えてあるので、トーストだけにしない。
     ほかの画面が開いているときは、じゃまをしないようトースト） */
  function lostNotice(ym, dl, had) {
    // had：前に送った報告は S21 に届いている（直した内容だけが届かなかった）
    const msg = had ? `${Mo(ym)}月の奉仕報告を直した内容は、送れないまま締切（${dlDate(ym, dl)}）を過ぎました。前に送った報告は、会衆に届いています。直す必要があるときは、書記に伝えてください（書記が入力します）。`
      : `${Mo(ym)}月の奉仕報告は、送れないまま締切（${dlDate(ym, dl)}）を過ぎました。書記に伝えてください（書記が入力します）。`;
    if (typeof overlayOpen === 'function' && !overlayOpen()) infoSheet('奉仕報告を送れませんでした', esc(msg)); else toast(msg);
  }
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
          const has = !!(m.report && !m.report.empty);
          // 締切の判定より先に：前に送ったときに S21 が受け付けていた（返事だけ届かなかった）なら、報告済みにする（C1-5）
          if (has && sameRep(m.report, item.v)) {
            markSent(ym, item.v, m.report.late, item.kind, item.auxH);
            toast(`${Mo(ym)}月の奉仕報告は、会衆に届いていました（報告しました）`);
            continue;
          }
          const sub = has ? Date.parse(m.report.submitted) : NaN;
          if (isFinite(sub) && sub > Date.parse(item.at)) { remember(o => { delete o.s21q[ym]; }); continue; }
          if (m.locked || (has && m.report.locked)) { // 締切を過ぎた月（まだ出していなくても）：送れないので下書きを消す
            remember(o => { delete o.s21q[ym]; }); renderHome();
            lostNotice(ym, m.deadline, has);
            continue;
          }
          const r = await api('s21_send', item.v, { timeout: 45000 });
          markSent(ym, item.v, r.late, item.kind, item.auxH);
          toast(`${Mo(ym)}月の奉仕報告を送りました${r.late ? '（翌月の会衆の報告に加えられます）' : ''}`);
        } catch (e) {
          if (isRetry(e)) break; // まだつながらない：次の機会に
          remember(o => { delete o.s21q[ym]; });
          if (e && (e.code || e.message) === 's21_locked') { renderHome(); lostNotice(ym); continue; } // 締切を過ぎた
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
  async function loadCfg(note) {
    const box = $('#s21Cfg'); if (!box) return;
    let c;
    try { c = await api('s21_cfg', {}, { timeout: 30000 }); } catch (e) { box.innerHTML = '<p class="hint">つながり方を確かめられませんでした。電波を確かめてください。</p>'; return; }
    const ready = c.url && c.keySet;
    box.innerHTML = `${note ? `<div class="notice warn" role="status">${esc(note)}</div>` : ''}
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
      try {
        const r = await api('s21_set', body, { timeout: 30000 }); $('#s21Key').value = '';
        // URL を変えると、前の連携キーはサーバーで消える（前のキーを新しい宛先に送らないため。C3-11a）
        if (r.keyCleared) { toast('保存しました。連携キーを入れ直してください'); loadCfg('S21 のURLを変えたので、前の連携キーを消しました。S21 の書記の画面で発行した連携キーを入れ直してください。'); }
        else { toast('保存しました'); loadCfg(); }
      }
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
      open(reportYmNow(), { dry: true }); // 締切日までは先月、過ぎたら今月（締切を過ぎた先月は見るだけになるため。app.js と同じ決め方）
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
    // same：同じ名前の人がどこにいるか（map＝区域マップの使う人に2人以上・s21＝S21 の名簿に2人以上。C1-1）
    const why = { none: '名前が見つかりません', ambig: '同じ名前が2人以上います', gone: 'えらんだ人が S21 にいません' };
    const whyOf = p => p.how === 'ambig' && p.same === 'map' ? '区域マップに同じ名前の人がいます。手で対応づけてください'
      : p.how === 'ambig' && p.same === 's21' ? 'S21 に同じ名前の人が2人以上います。手でえらんでください'
      : p.how === 'ambig' && p.same === 'taken' ? '同じ名前の S21 の人は、ほかの人に対応づけてあります。手でえらんでください' : why[p.how];
    const row = p => `<div class="setrow"><span>${esc(p.name)}${p.how === 'manual' ? '<br><small class="muted">区域係がえらびました</small>' : whyOf(p) ? `<br><small class="muted">${whyOf(p)}</small>` : ''}</span>
      <select class="s21sel" data-s21link="${esc(p.uid)}" aria-label="${esc(p.name)}さんの S21 での名前">${opts(p.pid)}</select></div>`;
    setSheet(headHtml(null, '名前の対応', `つながっている人 ${good.length}人・見つからない人 ${bad.length}人`) + `
      <p class="muted">S21 と名前が合う人は、自動でつながっています。見つからない人と、同じ名前の人がいる人は、S21 の名前をえらんでください（同じ名前の人は、まちがえて別の人の報告にならないよう、自動ではつなぎません）。「奉仕時間」を使っていない人は、そのままでもかまいません。</p>
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
