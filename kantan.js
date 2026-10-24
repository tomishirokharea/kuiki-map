/* =========================================================
   kantan.js  簡単モード（シニア向け）見直し　第1段・第2段
   第1段（見た目）
   ・body.simple の文字・ボタン・下のタブ・会えた／留守／拒否の大きさ、ボタンの間隔
   ・13〜15pxの小さな文字をやめる／説明文（.hint）は、残す3つ以外をかくす
   ・集合住宅の部屋と地図の印：薄くせず「済」と緑の淡い背景／✓を大きく
   第2段（かくす・ととのえる）
   ・下のタブ：おすすめを出さない（showView('reco') もホームへ）
   ・毎日のひと言：出さない（計算もしない）
   ・設定（歯車）：言語・画面の見え方・文字の大きさ・地図／写真だけ。「機能をふやす」の中に奉仕時間・再訪問
   ・家の記録（openTarget）：名前・大事なお知らせ・会えた／留守・離して拒否・前回の記録1行・閉じる
   ・区域カード画面：今日の記録1行／「あと○軒」を大きく／ボタンは「返す」だけ（グループ区域は2段目に小さく）
   ・上の「未送信」の言葉
   守っていること
   ・詳しいモードの見た目と動きは変えない（isSimple() のときだけ働く）
   ・係の画面・区域カルテ・S-12・S-13・自動ロックは、body.kadm を付けて、簡単モードの見た目をかけない
   ・データの形・サーバー（Code.gs）は変えない
   使い方：index.html の <script src="schedule.js"></script> の次の行に、次の1行を足す
     <script src="kantan.js"></script>
   あわせて、index.html の meta app-version を 2026.11.26 に上げる（更新のお知らせに必要）
   ---------------------------------------------------------
   スペイン語の辞書（i18n-es.js）に足す、新しい日本語の文（辞書の形を見て、足してください）
     今日の記録／件／あと／軒／返す／返す日を過ぎています／返す目安：／地図をひらく／まで
     今日回る人をえらぶ／回る範囲を分ける／機能をふやす／前回：／閉じる／最近会えた家です
     拒否の家です。訪問しないでください。／拒否の部屋です。訪問しないでください。
     ほかの人が再訪問している家です。／ほかの人が再訪問している部屋です。／訪問は控えてください。
     それでも記録する／拒否マークを外す／← 部屋の一覧にもどる／区域の線の外
     この家に赤い「拒」の印がつきます／この部屋に赤い「拒」の印がつきます
     まだ送っていない記録／電波が戻ったら送ります／かんたんな表示を、見やすくしました
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof renderAdmin !== 'function' || typeof isSimple !== 'function') return;

  const simple = () => isSimple();

  /* ---------- お知らせ（更新のお知らせに出す） ---------- */
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.11.26')) {
    CHANGELOG.unshift({ v: '2026.11.26', items: [['見', 'かんたんな表示を、見やすくしました']] });
  }

  /* =========================================================
     係の画面などには、簡単モードの見た目をかけない（body.kadm）
     ・係の画面（#view-admin）、S-13、自動ロックの画面
     ・係の画面から開いた下の画面（カルテ・調整・S-12・区域の番号と名前）
     ========================================================= */
  let admSheet = false;
  const ADMIN_SHEET = /のカルテ<\/h2>|の調整<\/h2>|id="fNo"|data-spk=|id="s12|data-s12|id="s13|id="adjYoung|id="kLend/;
  function syncAdm() {
    const s13 = document.getElementById('s13View'), lock = document.getElementById('alockScr');
    document.body.classList.toggle('kadm', currentView === 'admin' || admSheet || !!(s13 && !s13.hidden) || !!(lock && !lock.hidden));
  }
  const s13El = document.getElementById('s13View');
  if (s13El && window.MutationObserver) new MutationObserver(syncAdm).observe(s13El, { attributes: true, attributeFilter: ['hidden'] });

  /* =========================================================
     第1段：見た目だけ（body.simple、係の画面を除く）
     ========================================================= */
  const P = 'body.simple:not(.kadm)';
  const R = (sel, decl) => sel.split(',').map(s => `${P} ${s.trim()}`).join(',') + `{${decl}}`;
  const css = document.createElement('style');
  css.textContent = [
    `${P}{font-size:20px}`,
    R('.muted', 'font-size:18px'),
    R('.sec', 'font-size:23px'),
    R('.btn', 'min-height:56px;font-size:19px'),
    R('.btn.small', 'min-height:52px;font-size:18px'),
    R('.btn.block', 'margin-top:12px'),
    R('.actions,.row', 'gap:12px'),
    R('.choices', 'gap:12px'),
    R('.choice', 'min-height:104px;font-size:24px'),
    R('.choice small', 'font-size:16px'),
    R('.refbtn', 'min-height:60px;font-size:19px;margin-top:32px;background:#fff;border-color:var(--ref);color:var(--ref)'),
    R('nav.tabs button', 'min-height:72px;font-size:17px'),
    R('nav.tabs svg', 'width:30px;height:30px'),
    // 小さな文字：16px以上にするか、出さない
    R('.pill,.keys,.keys span,.unit small,.cardbar .keys,#legendInfo .keys', 'font-size:16px'),
    R('.tabbadge', 'font-size:16px;min-width:28px;height:28px'),
    R('.stamp small', 'display:none'),
    // 説明文：残す3つ以外はかくす
    R('.hint:not(.hint-must)', 'display:none'),
    R('.hint.hint-must', 'display:block;font-size:17px;color:var(--ink)'),
    // 部屋：薄くせず、「済」の文字＋緑の淡い背景
    R('.uchip', 'min-width:64px;min-height:52px;font-size:18px'),
    R('.unit.done,.uchip.donec', 'background-image:none;background-color:#DDF1EA;color:var(--ink);border-color:#2E7D32;font-weight:700'),
    R('.unit.done u', 'font-size:0;width:auto;min-width:34px;height:26px;padding:0 6px;border-radius:13px'),
    R('.unit.done u::after', "content:'済';font-size:16px;color:#fff"),
    R('.uchip.donec::after', "content:'済';width:auto;min-width:30px;height:24px;padding:0 6px;border-radius:12px;font-size:16px;right:-8px;top:-12px"),
    // 地図の印の✓を大きく
    R('#map .pin:not(.mini) u', 'width:24px;height:24px;font-size:16px;left:-11px;top:-11px'),
    // 記録のあとの「取り消す」などのお知らせ：文字18px・ボタンの高さ52px（指示書3.9・点検④U1。小さな帯にはしない＝schedule.js）
    R('.xmini', 'width:52px;height:52px;font-size:30px;right:-10px;top:-12px'), // 設定の小さな「×」も、押しやすい大きさに（点検④U11）
    R('.grabhint', 'padding:0 44px'), // 「下にスワイプすると…」の文が、大きくした「×」の下に入らないように（左右そろえて中央のまま）
    R('#toast', 'font-size:calc(18px * var(--z,1))'),
    R('#toast button', 'min-height:calc(52px * var(--z,1));font-size:calc(18px * var(--z,1));padding:0 16px'),
    // 区域カードの「あと○軒」
    `.kleft{margin:6px 0 2px;font-size:20px}.kleft b{font-size:38px;line-height:1.15;color:var(--terr)}`,
    `.kmore{background:#fff;border:2px solid var(--line);border-radius:12px;padding:0 12px;margin:12px 0}`,
    `.kmore>summary{min-height:56px;display:flex;align-items:center;font-weight:700;font-size:20px;cursor:pointer}`,
    `.kmore[open]{padding-bottom:6px}`
  ].join('\n');
  document.head.appendChild(css);

  /* =========================================================
     第2段（1）下のタブ：おすすめは出さない
     ========================================================= */
  const _updateTabs = window.updateTabs;
  window.updateTabs = function () {
    _updateTabs.apply(this, arguments);
    if (!simple()) return;
    const rec = document.getElementById('tabReco');
    if (rec) rec.hidden = true;
    const tabs = document.getElementById('tabs');
    if (tabs) {
      const n = [...tabs.children].filter(b => b.tagName === 'BUTTON' && !b.hidden).length;
      tabs.style.setProperty('--tabs', n);
      tabs.classList.toggle('many', n >= 6);
    }
  };
  const _showView = window.showView;
  window.showView = function (name) {
    if (simple() && name === 'reco') name = 'home';
    const r = _showView.call(this, name);
    syncAdm();
    return r;
  };
  const _applyUi = window.applyUi;
  window.applyUi = function () {
    const r = _applyUi.apply(this, arguments);
    if (Store.data) {
      try {
        updateTabs();
        if (simple() && currentView === 'reco') showView('home');
      } catch (e) { console.error(e); }
    }
    return r;
  };

  /* =========================================================
     第2段（2）毎日のひと言：簡単モードでは出さない（3万件を回る計算もしない）
     ========================================================= */
  const _showHello = window.showHello;
  window.showHello = function () {
    if (simple()) { setTimeout(() => { try { checkReport(); } catch (e) { /* 月末の報告だけの話 */ } }, 500); return; }
    return _showHello.apply(this, arguments);
  };

  /* =========================================================
     第2段（3）設定（歯車）
     ・出すもの：言語・画面の見え方・文字の大きさ・地図／写真
     ・「機能をふやす」（たたんだ見出し）の中に、奉仕時間と再訪問だけ
     ========================================================= */
  let kOpen = false;
  function trimSettings() {
    const body = document.getElementById('sheetBody');
    if (!body) return;
    const kids = [...body.children];
    const h3 = el => (el.tagName === 'H3' ? el.textContent.trim() : '');
    // 地図の画面から開いたとき：「地図／写真」だけ残す（線の色・太さ・地図の回転は出さない）
    const baseH = kids.find(el => h3(el) === '地図の見た目');
    if (baseH) {
      const viewH = kids.find(el => h3(el) === '画面の見え方');
      let on = false;
      for (const el of kids) {
        if (el === baseH) { on = true; continue; }
        if (!on) continue;
        if (el === viewH) break;
        if (el.classList && el.classList.contains('basepick')) continue;
        el.remove();
      }
    }
    // 使う機能：奉仕時間・（タイマー）・再訪問だけを、「機能をふやす」の中に入れる
    const featH = kids.find(el => h3(el) === '使う機能');
    if (featH) {
      const keep = [], drop = [];
      let inKeep = true, on = false;
      for (const el of kids) {
        if (el === featH) { on = true; continue; }
        if (!on) continue;
        if (el.id === 'uiReset') break;
        if (el.tagName === 'H3') { inKeep = false; drop.push(el); continue; }
        (inKeep ? keep : drop).push(el);
      }
      drop.forEach(e => e.remove());
      const det = document.createElement('details');
      det.className = 'kmore';
      if (kOpen) det.open = true;
      det.innerHTML = '<summary>機能をふやす</summary>';
      keep.forEach(e => det.appendChild(e));
      featH.replaceWith(det);
      det.addEventListener('toggle', () => { kOpen = det.open; });
    }
  }
  const _setSheet = window.setSheet;
  window.setSheet = function (html) {
    const s = String(html);
    if (ADMIN_SHEET.test(s)) admSheet = true;
    _setSheet.apply(this, arguments);
    syncAdm();
    try { if (simple() && s.indexOf('id="uiReset"') >= 0) trimSettings(); } catch (e) { console.error(e); }
  };
  const _closeSheet = window.closeSheet;
  window.closeSheet = function () {
    admSheet = false;
    const r = _closeSheet.apply(this, arguments);
    syncAdm();
    return r;
  };

  /* =========================================================
     第2段（4）区域カード画面
     ・今日の記録は1行
     ・カード：番号・名前・「あと○軒」（大きく）・返却の目安。ボタンは「返す」だけ
       （グループ区域の担当者は「今日回る人」「範囲を分ける」を2段目に小さく残す）
     ・留守宅カード：番号・時間帯・「あと○軒」・「地図をひらく」・「返す」
     ・「ほかの区域を見る」は出さない（CSS）／「区域の番号か名前を押すと…」だけ残す
     ========================================================= */
  const _renderToday = window.renderToday;
  window.renderToday = function () {
    if (!simple()) return _renderToday.apply(this, arguments);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const iso = start.toISOString(), me0 = me().id, vs = D().visits;
    let n = 0;
    for (let i = 0; i < vs.length; i++) if (vs[i].by === me0 && vs[i].at >= iso) n++;
    $('#todayBox').innerHTML = `<div class="today"><b>${esc(me().name)}さん</b>　今日の記録 <b>${n}件</b></div>`;
  };

  const _cardHtml = window.cardHtml;
  window.cardHtml = function (t, own, helper) {
    if (!simple() || !(own || helper)) return _cardHtml.apply(this, arguments);
    let left = null;
    try { const r = roundInfo(t.id, true); if (r) left = r.c.todo; } catch (e) { left = null; }
    const due = dueOf(t), over = own && due && Date.parse(due) < Date.now();
    const lead = !own && typeof isLead === 'function' && isLead(t), ld = own && typeof leadOf === 'function' ? leadOf(t) : null; // 今日の司会（2026-10-24）
    const sub = (t.group ? `<span class="gbadge">${esc(useName(t))}の区域</span> ` : '') +
      (own ? (over ? '<span class="tag-warn">返す日を過ぎています</span>' : (due ? `返す目安：${fmtDay(due)}` : ''))
        : lead ? `<span class="leadtag">今日の司会</span>担当：${esc(uname(t.holder))}さん`
        : `${esc(uname(t.holder))}さんの区域を、一緒に回ります`);
    const mp = !own && !lead ? myPart(t) : null;
    const grpRow = (own || lead) && t.group && D().settings.groupOn !== 0
      ? `<div class="actions"><button class="btn small" data-helpers="${esc(t.id)}">今日回る人をえらぶ</button><button class="btn small" data-parts="${esc(t.id)}">回る範囲を分ける</button>${lead ? `<button class="btn small" data-leadquit="${esc(t.id)}">司会をやめる</button>` : ''}</div>` : '';
    return `<article class="tcard tc2${t.group ? ' grp' : ''}">
      ${openHead(`data-open="${esc(t.id)}"`, `区域${esc(t.no)} ${esc(t.name)}`,
        `<span class="stamp${noCls(t.no)}${t.group ? ' grp' : ''}"><small>${!t.group ? '区域' : isAllUse(t) ? '全体' : 'グループ'}</small>${esc(t.no)}</span>`, esc(t.name), sub)}
      <div class="tbody">${left != null ? `<p class="kleft">あと <b>${left}</b> 軒</p>` : ''}
        ${own && typeof paperHandOf === 'function' && paperHandOf(t) ? '<p class="muted">紙のカードから引き継いだ区域です（紙で回った家は、数に入っていません）</p>' : ''}
        ${mp ? `<p class="hint-strong">今日のあなたの範囲があります（${esc(partMates(mp).map(u => uname(u) + 'さん').join('・') || 'ひとり')}と）</p>` : ''}
        ${ld ? `<div class="leadline"><p><span class="leadtag">今日の司会</span><b>${esc(uname(ld.uid))}さん</b></p><button type="button" class="btn small" data-leadoff="${esc(t.id)}">司会を外す</button></div>` : ''}</div>
      ${own ? `<div class="actions"><button class="btn primary" data-open="${esc(t.id)}">地図をひらく</button><button class="btn" data-return="${esc(t.id)}">返す</button></div>` : ''}
      ${grpRow}
    </article>`;
  };

  const _awayCardHtml = window.awayCardHtml;
  window.awayCardHtml = function (c, kind) {
    if (!simple()) return _awayCardHtml.apply(this, arguments);
    const t = terrById(c.terrId), p = cardProgress(c);
    const hs = cardHelpers(c), hh = kind === 'help' ? hs.find(h => h.uid === me().id) : null;
    const left = Math.max(0, p.total - p.done);
    return `<article class="tcard tc2 away">
      ${openHead(`data-awayopen="${esc(c.id)}"`, `留守宅カード ${esc(slotText(c.slot))}`,
        `<span class="stamp away${t ? noCls(t.no) : ''}"><small>留守宅</small>${t ? esc(t.no) : '-'}</span>`,
        slotText(c.slot), (c.group ? `<span class="gbadge">${esc(useName(c))}</span> ` : '') + `区域${t ? esc(t.no) : '-'}　${t ? esc(t.name) : ''}` +
          (hh ? `<br>${esc(uname(hh.by))}さんの留守宅カードを、今日回ります` : ''))}
      <div class="tbody"><p class="kleft">あと <b>${left}</b> 軒</p>
        <p class="muted">${c.day ? '今日の終わりに自動で終わります' : fmtDay(c.expiresAt) + 'まで'}</p></div>
      <div class="actions"><button class="btn primary" data-awayopen="${esc(c.id)}">地図をひらく</button>${kind === 'help' ? '' : `<button class="btn" data-awayend="${esc(c.id)}">返す</button>`}</div>
      ${kind === 'gown' && D().settings.groupOn !== 0 ? `<div class="actions"><button class="btn small" data-chelpers="${esc(c.id)}">今日回る人をえらぶ</button></div>` : ''}
    </article>`;
  };

  const _renderCards = window.renderCards;
  window.renderCards = function () {
    // 「ほかの区域を見る」は、簡単モードでは出さない（10/09 の指示書3.3・改善案A9。くわしいモードは今までどおり）
    { const ad = document.getElementById('allDetails'); if (ad) { if (simple() && ad.open) ad.open = false; ad.hidden = simple(); } }
    const r = _renderCards.apply(this, arguments);
    if (simple()) $$('#myCards .taphint').forEach(e => e.classList.add('hint-must'));
    // 「ホーム画面に追加」の案内は、簡単モードでは区域カードのあとに（文字を大きくしても、最初の画面に区域カードが入るように・点検④U6）
    const ha = document.getElementById('homeAdd'), pm = document.getElementById('paneMine');
    if (ha && pm) {
      if (simple()) { if (pm.nextElementSibling !== ha) pm.after(ha); }
      else if (pm.previousElementSibling !== ha) pm.before(ha);
    }
    return r;
  };

  /* =========================================================
     第2段（5）家の記録（openTarget）
     上から：家の名前／大事なお知らせだけ／会えた・留守／離して拒否／前回の記録1行／閉じる
     出さない：これまでの記録の一覧・くわしく表示・留守だった時間帯の案内・Googleマップ・家の編集・仮の家のお知らせ
     押したらすぐ閉じる（quickVisit のまま）。住んでいる人に関わる情報（年代・メモ）は出さない
     ========================================================= */
  const _refuseStepHtml = window.refuseStepHtml;
  window.refuseStepHtml = function (isUnit) {
    if (!simple()) return _refuseStepHtml.apply(this, arguments);
    return `<div class="refhead"><i class="pin st-dnc">拒</i><b>拒否として記録します</b></div>
      <p class="hint-must">この${isUnit ? '部屋' : '家'}に赤い「拒」の印がつきます</p>
      <button class="btn block refok" data-refok>拒否として記録する</button>
      <button class="btn block" data-back="result">まちがえた（もどる）</button>`;
  };

  const _openTarget = window.openTarget;
  window.openTarget = function (hid, unit, fromBuilding, review) {
    if (!simple()) return _openTarget.apply(this, arguments);
    simpleTarget(hid, unit || '', !!fromBuilding);
  };

  function simpleTarget(hid, unit, fromBuilding) {
    const h = houseById(hid); if (!h) return;
    const t = terrById(h.terrId), k = K(hid, unit);
    const st = { step: 'result', override: false };
    const title = targetName(h, unit);
    const sub = t ? `区域${esc(t.no)}　${esc(t.name || '')}` : '区域の線の外';
    const what = unit ? '部屋' : '家';
    const paint = () => {
      const dnc = D().dnc[k], f = fol(k), mineF = !!f && f.by === me().id, other = !!f && !mineF;
      const blocked = (dnc && !isAdmin()) || (other && !isAdmin() && !st.override && recentMet(k));
      let b = headHtml(t, title, sub);
      if (fromBuilding) b += '<button class="btn small" id="backBld">← 部屋の入力にもどる</button>';
      // 大事なお知らせだけ（どれも1〜2行）
      if (dnc) {
        b += `<div class="notice refnote"><b>拒否の${what}です。訪問しないでください。</b>${isAdmin() ? '<span class="actions"><button class="btn small" id="unDnc">拒否マークを外す</button></span>' : ''}</div>`;
      } else if (other) {
        b += `<div class="notice warn"><b>ほかの人が再訪問している${what}です。</b>${blocked ? '訪問は控えてください。<span class="actions"><button class="btn small" id="shOverride">それでも記録する</button></span>' : ''}</div>`;
      }
      if (window.chuiNotice) b += window.chuiNotice(h, unit); // 注意（！）
      if (!blocked && st.step === 'result') b += recentOtherHtml(k);
      if (!dnc && recentMet(k)) {
        const m = sum(k).met;
        b += `<div class="notice info"><b>最近会えた${what}です</b>${m ? `（${daysSince(m.at)}日前）` : ''}</div>`;
      }
      if (!blocked) {
        if (st.step === 'result') b += resultChoicesHtml('');
        else if (st.step === 'follow') b += followAskHtml();
        else if (st.step === 'memo') b += memoStepHtml(k);
        else if (st.step === 'dnc') b += refuseStepHtml(!!unit);
      }
      if (st.step === 'result') {
        const last = visitsOf(k)[0];
        if (last) { const d = new Date(last.at); b += `<p class="muted">前回：${d.getMonth() + 1}月${d.getDate()}日　${RESULT_LABEL[last.result]}</p>`; }
      }
      b += '<button class="btn block" data-close>閉じる</button>';
      setSheet(b);

      const S2 = $('#sheet');
      $$('[data-res]', S2).forEach(x => x.onclick = () => {
        const r = x.dataset.res, save = (res, ex) => saveVisit(hid, unit, res, ex);
        if (r === 'met') { if (metNext(st, k, save)) paint(); }
        else if (r === 'refused') { st.step = 'dnc'; paint(); }
        else saveVisit(hid, unit, 'away', {});
      });
      $$('[data-int]', S2).forEach(x => x.onclick = () => { st.step = 'dnc'; paint(); }); // 「拒否」ボタン
      $$('[data-fol]', S2).forEach(x => x.onclick = () => { if (x.dataset.fol === '1') { st.step = 'memo'; paint(); } else saveVisit(hid, unit, 'met', {}); });
      $$('[data-memosave]', S2).forEach(x => x.onclick = () => saveFollowVisit(hid, unit, $('#stepMemo').value, false, readNext('stepNext')));
      $$('[data-refok]', S2).forEach(x => x.onclick = () => saveVisit(hid, unit, 'refused', { dnc: true }));
      $$('[data-back]', S2).forEach(x => x.onclick = () => { st.step = x.dataset.back; paint(); });
      const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
      on('backBld', () => openAptSeq(hid, unit));
      on('unDnc', () => { commit('拒否マークを外しました', () => { delete D().dnc[k]; }); paint(); });
      on('shOverride', () => { st.override = true; paint(); });
    };
    paint();
  }

  /* =========================================================
     第2段（6）言葉：上の「未送信 ○件」
     ========================================================= */
  const _updateSyncBadge = window.updateSyncBadge;
  window.updateSyncBadge = function () {
    const r = _updateSyncBadge.apply(this, arguments);
    try {
      const el = document.getElementById('syncState');
      if (simple() && el && !el.hidden && Store.queue) {
        const n = Store.queue.length, t = el.textContent || '';
        if (/^電波待ち/.test(t)) el.textContent = '電波が戻ったら送ります';
        else if (/^未送信/.test(t)) el.textContent = `まだ送っていない記録 ${n}件`;
      }
    } catch (e) { /* 表示だけの話 */ }
    return r;
  };

  /* =========================================================
     第4段（1）ホーム（指示書3.2）
     ・あいさつ → たのまれた区域（今のまま）→ 次の集まり（道順）→ あなたの区域カード（3枚まで・あと○軒・地図をひらく）
       → これからの予定（14日・5件まで。押すと今の画面）→「カレンダーで見る」を押したときだけカレンダー
     ・奉仕時間を使う人は、タイマー・目標がその上（今のまま）。予定の印刷（監督・係）も今のまま
     ========================================================= */
  let calOpen = false;
  const css4 = document.createElement('style');
  css4.textContent = [
    R('.homemain>h2.sec', 'display:none'),
    `.khome .sec{margin-top:18px}`,
    `.knext{background:#fff;border:2px solid var(--line);border-radius:16px;padding:12px 16px;margin:10px 0}`,
    `.knext .klbl{font-weight:700;color:var(--ink2);margin:0}`,
    `.knext .kdate{font-size:26px;font-weight:700;margin:4px 0 0;line-height:1.3}`,
    `.knext .ktime{font-size:21px;margin:2px 0 4px}`,
    `.khcard{background:#fff;border:2px solid var(--line);border-radius:16px;padding:12px 16px;margin:10px 0}`,
    `.khcard .khrow{display:flex;gap:12px;align-items:center}`,
    `.khcard .kleft{margin:2px 0 0}`,
    `.khcard .kp-nm{margin-left:.5em;font-weight:400}`,
    // 地図（指示書3.6）：区域えらび・右下のボタンを大きく、「あと○軒」の帯、印の見かたは「?」の中に4つだけ
    R('.maptools select', 'min-height:56px;font-size:20px'),
    R('.helpbtn', 'width:56px;height:56px'),
    R('#legendKeys', 'display:none'),
    // 「あと○軒」は区域えらびの右に同じ高さで並べる（地図を広く見せる・改善案A1）。入らない幅のときは、折り返して今までどおり下の段に
    `.maptools>.kband{flex:1 1 auto;min-width:0;display:flex;box-shadow:none;pointer-events:none;margin:0}`,
    `.kband span.kb{display:flex;align-items:center;justify-content:center;gap:.25em;width:100%;min-height:56px;box-sizing:border-box;background:#fff;border:2px solid var(--terr);border-radius:12px;padding:4px 12px;font-size:18px;font-weight:700;box-shadow:0 2px 6px #0003;white-space:nowrap}`,
    `.kband span.kb b{font-size:22px;color:var(--terr)}`
  ].join('\n');
  document.head.appendChild(css4);

  const nameOf = t => { const nm = String(t.name || '').trim(); return nm && nm !== '区域' + t.no && nm !== String(t.no) ? nm : ''; };
  const leftOf = t => { try { const r = roundInfo(t.id, true); return r ? r.c.todo : null; } catch (e) { return null; } };
  const _renderHome = window.renderHome;
  window.renderHome = function () {
    const out = _renderHome.apply(this, arguments);
    try { if (simple()) simpleHome(); } catch (e) { console.error(e); }
    return out;
  };
  function simpleHome() {
    const view = document.getElementById('view-home'), cal = document.getElementById('homeCal');
    if (!view || view.hidden || !cal) return;
    const calInner = cal.innerHTML; // 今のカレンダー（「カレンダーで見る」を押したときだけ出す）
    const now = new Date(), today = ymd(now), until = new Date(); until.setDate(until.getDate() + 14);
    const last = ymd(until), hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // 今日の集まりは、終わったもの（終わりの時刻がないときは、はじまりから2時間）を「次」にしない
    const endOf = s => { if (s.end) return s.end; if (!s.time) return '24:00'; const [h, m] = s.time.split(':').map(Number); return `${String(Math.min(24, h + 2)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`; };
    const scheds = D().schedules.filter(s => s.date >= today && (!s.group || s.group === myGroup() || isAdmin()) && !(s.date === today && endOf(s) < hm))
      .sort((a, b) => ((a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1));
    const next = scheds[0] || null;
    const href = next ? placeHref(next) : '';
    let h = '<div class="khome">';
    h += next
      ? `<div class="knext"><p class="klbl">次の集まり</p>
          <p class="kdate">${next.date === today ? '<span>今日</span>　' : ''}${fmtYmd(next.date)}</p>
          <p class="ktime">${schedLine(next)}</p>
          <p class="muted">${esc(schedGroupName(next.group))}${next.note ? '　' + esc(next.note) : ''}</p>
          ${href ? `<a class="btn primary block" href="${esc(href)}" target="_blank" rel="noopener">道順</a>` : ''}</div>`
      : '<div class="knext"><p class="klbl">次の集まり</p><p class="ktime">予定はまだありません</p></div>';
    const mine = D().territories.filter(t => t.holder === me().id).sort(byNo);
    h += '<h2 class="sec">あなたの区域カード</h2>';
    h += mine.length ? mine.slice(0, 3).map(t => {
      const left = leftOf(t), nm = nameOf(t);
      return `<article class="khcard"><div class="khrow"><span class="stamp${noCls(t.no)}${t.group ? ' grp' : ''}">${esc(t.no)}</span>
          <div><b>区域${esc(t.no)}</b>${nm ? `<span class="kp-nm">${esc(nm)}</span>` : ''}
            ${left != null ? `<p class="kleft">あと <b>${left}</b> 軒</p>` : ''}</div></div>
          <button type="button" class="btn primary block" data-openterr="${esc(t.id)}">地図をひらく</button></article>`;
    }).join('') + (mine.length > 3 ? `<p class="muted">ほかに区域カードが${mine.length - 3}枚あります。「区域カード」の画面で見られます。</p>` : '')
      : '<p class="muted">持っている区域カードはありません。</p>';
    // これからの予定：次の集まりのあと、14日の中で5件まで（集まり＋自分の予定）
    const items = scheds.filter(s => s !== next && s.date <= last).map(s => ({ k: s.date + (s.time || ''), html: schedRow(s, true) }));
    (myData().events || []).filter(e => e.date >= today && e.date <= last).forEach(e => items.push({
      k: e.date + (e.time || ''),
      html: `<article class="ritem k-young" data-day="${esc(e.date)}" role="button" tabindex="0"><div><p class="rt">${fmtYmd(e.date)}</p>
        <p>${e.time ? esc(e.time) + '　' : ''}${esc(e.title)}</p><p class="muted">自分の予定</p></div><span class="chev" aria-hidden="true">›</span></article>`
    }));
    items.sort((a, b) => (a.k < b.k ? -1 : 1));
    if (items.length) h += '<h2 class="sec">これからの予定</h2>' + items.slice(0, 5).map(x => x.html).join('');
    h += `<button type="button" class="btn block" id="kCalBtn" aria-expanded="${calOpen}">${calOpen ? 'カレンダーを閉じる' : 'カレンダーで見る'}</button></div>`;
    cal.innerHTML = h + (calOpen ? calInner : '');
    const b = document.getElementById('kCalBtn');
    if (b) b.onclick = () => { calOpen = !calOpen; renderHome(); };
  }

  /* =========================================================
     第4段（2）地図（指示書3.6）
     ・回さない・「進み具合」に固定・印の大きさ（index.html の rotAllowed・roundMode・pinScale）
     ・「?」の中：あと○軒・「返す」・印の見かた4つだけ
     ・自分の区域をえらんでいるとき、上の区域えらびの下に「区域12　あと28軒」の帯
     ========================================================= */
  const _renderLegend = window.renderLegend;
  window.renderLegend = function () {
    const out = _renderLegend.apply(this, arguments);
    try { if (simple()) simpleLegend(); } catch (e) { console.error(e); }
    return out;
  };
  function simpleLegend() {
    const box = document.getElementById('legendInfo'); if (!box) return;
    const key = (cls, mark, label) => `<span><i class="pin mini st-plain${cls}">${mark}</i>${label}</span>`;
    const keys = `<p class="keys">${key('', '', 'まだ訪ねていない家')}${key(' done', '<u>✓</u>', '訪ねた家')}${key(' prev', '<u class="b">✓</u>', '最近会えた家')}<span><i class="pin mini st-dnc">拒</i>拒否（訪問しない）</span></p>`;
    const r = typeof roundTerr !== 'undefined' && roundTerr ? roundInfo(roundTerr) : null;
    if (!r) { box.innerHTML = keys; return; }
    const n = r.c, own = r.t.holder === me().id, lead = !own && typeof isLead === 'function' && isLead(r.t);
    // ほかの部品が足した行（前の人の続き・今日のあなたの範囲）は残す
    const cont = [...box.querySelectorAll('p.muted')].find(p => /前の人/.test(p.textContent));
    const part = [...box.querySelectorAll('.okmsg')].find(p => /今日のあなたの範囲/.test(p.textContent));
    const nm = nameOf(r.t);
    box.innerHTML = `<p class="lgtitle"><b><span>区域${esc(r.t.no)}</span>${nm ? ` <span>${esc(nm)}</span>` : ''}</b>${own ? '' : lead ? '（今日の司会）' : '（一緒に回る）'}</p>
      ${n.todo ? `<p class="kleft">あと <b>${n.todo}</b> 軒</p>` : '<p class="okmsg"><b>すべての家に緑のチェックがつきました。</b>区域を回り終えました。</p>'}
      <div class="progress big" role="progressbar" aria-valuenow="${r.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="回った割合"><i style="width:${r.pct}%"></i></div>
      <div id="kLgKeep"></div>
      ${keys}
      <div class="row">${(own || lead) && r.t.group && D().settings.groupOn !== 0 ? '<button type="button" class="btn small" id="lgParts">回る範囲を分ける</button>' : ''}${own ? '<button type="button" class="btn" id="lgReturn">返す</button>' : ''}</div>`;
    const keep = document.getElementById('kLgKeep');
    if (part) keep.appendChild(part);
    if (cont) keep.appendChild(cont);
    const lp = document.getElementById('lgParts'), lr = document.getElementById('lgReturn');
    if (lp) lp.onclick = () => { toggleLegend(false); startPartSplit(r.t.id); };
    if (lr) lr.onclick = () => { toggleLegend(false); openReturnSheet(r.t.id); };
  }
  let bandTm = 0;
  /* 区域えらびの幅を、えらんでいる区域の文字に合わせる（いちばん長い選択肢の幅にならないように）。
     文字を「とても大きく」にしても、「あと○軒」と1段に並びやすくする（改善案A1）。入らなければ、帯は下の段に折り返す */
  let fitCv = null;
  function fitJump(on) {
    const sel = document.getElementById('terrJump'); if (!sel) return;
    const o = on ? sel.options[sel.selectedIndex] : null;
    if (!o) { sel.style.width = ''; return; }
    try {
      const cs = getComputedStyle(sel);
      fitCv = fitCv || document.createElement('canvas');
      const cx = fitCv.getContext('2d');
      cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const w = Math.ceil(cx.measureText(o.text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + 30); // 30：右の▼の分
      sel.style.width = w + 'px'; // いちばん広くても CSS の max-width（44vw）まで
    } catch (e) { sel.style.width = ''; }
  }
  function paintBand() {
    const tools = document.getElementById('mapTools'); if (!tools) return;
    let el = document.getElementById('kBand');
    const r = simple() && currentView === 'map' && typeof roundTerr !== 'undefined' && roundTerr ? roundInfo(roundTerr) : null;
    fitJump(!!r);
    if (!r) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'kBand'; el.className = 'kband'; el.setAttribute('aria-live', 'polite'); tools.appendChild(el); }
    // 区域の番号は左の区域えらびに出ているので、ここは「あと○軒」だけ（改善案A1）。読み上げでは区域の番号も伝える
    el.innerHTML = `<span class="kb" aria-label="区域${esc(r.t.no)}　あと${r.c.todo}軒"><span>あと</span> <b>${r.c.todo}</b> <span>軒</span></span>`;
    el.hidden = false;
  }
  const bandSoon = () => { clearTimeout(bandTm); bandTm = setTimeout(() => { try { paintBand(); } catch (e) { console.error(e); } }, 200); };
  const _renderHouses = window.renderHouses;
  window.renderHouses = function () {
    const out = _renderHouses.apply(this, arguments);
    bandSoon();
    return out;
  };
  const _showView2 = window.showView;
  window.showView = function () {
    const out = _showView2.apply(this, arguments);
    bandSoon();
    return out;
  };
  const _applyUi2 = window.applyUi;
  window.applyUi = function () {
    const out = _applyUi2.apply(this, arguments);
    try { if (typeof applyRotSetting === 'function' && typeof map !== 'undefined' && map) applyRotSetting(); bandSoon(); } catch (e) { console.error(e); }
    return out;
  };

  /* 画面ができたあと：今の状態にそろえる */
  try { syncAdm(); if (Store.data) { updateTabs(); } } catch (e) { console.error(e); }
  if (Store.data && typeof map !== 'undefined' && map) { try { renderAll(); } catch (e) { console.error(e); } }
})();
