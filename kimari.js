/* =========================================================
   区域マップ：区域係の「状況」と設定「区域の決め」を左右に（kimari.js・2026-10-25）

   ねらい：左で問題を見つけて、右でその場で直す
   ・状況の各見出しの下に「かかわる設定」の札（短い名前と今の値）を出す
   ・札を押すと、その設定に飛んで光り、「変えると：…」「効く状況：…」を出す
     パソコン（幅1,180px以上）：右の欄「区域の決め」／スマホ：下から出る画面（その設定だけ。「…をすべて見る」で同じグループ）
   ・設定は「区域の決め」1か所にまとめる（貸し出しのきまり・期限の見張りの中の区域係の決め・留守宅の設定）
     設定の行と、押したときの処理は今までと同じ（app.js・schedule.js・tsuzuki.js が #krLend などの箱に描く）
   ・右の欄は閉じられる（この端末に覚える）。閉じたときは、状況の上の「区域の決め（設定）を右に出す」で出す
   ========================================================= */
(function () {
  'use strict';
  const $id = id => document.getElementById(id);
  const RULES = $id('adRules'), SIDE = $id('krSide'), VA = $id('view-admin');
  if (!RULES || !SIDE || !VA || typeof D !== 'function') return;

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `
#krSide{display:none}
.krules .krhead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.krules .krhead h2{margin:4px 0}
.krules details.krg{border-top:1px solid var(--line);padding:2px 0}
.krules details.krg>summary{font-weight:700;font-size:16px;padding:12px 2px;cursor:pointer;min-height:44px;box-sizing:border-box}
.krules .krbox>.setrow{border-radius:10px}
#view-admin .krchips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 12px;color:var(--ink2);font-size:.8rem}
#view-admin .krchips>span{font-size:inherit}
#view-admin button.krchip{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:4px;width:auto!important;min-width:0!important;min-height:40px!important;height:auto!important;margin:0!important;padding:4px 12px!important;border-radius:999px!important;font-size:.875rem!important;font-weight:400!important;line-height:1.2!important;background:#F3F5F7!important;border:1px solid #C9D2DA!important;color:var(--ink)!important;white-space:nowrap!important;box-shadow:none!important;text-align:left!important}
#view-admin button.krchip b{display:inline!important;font-weight:700;margin:0!important;font-size:inherit!important}
#view-admin button.krchip[aria-pressed=true]{background:#FFF4C2!important;border-color:#B98F00!important;box-shadow:0 0 0 2px #FFE58A!important}
#adRules .setrow.kr-hit{background:#FFF8D6;box-shadow:0 0 0 2px #B98F00 inset;padding-left:8px;padding-right:8px}
#adRules .kr-eff{display:block;margin:6px 0 0;padding:6px 8px;border-left:4px solid #B98F00;background:#FFFBE6;color:#3D3000;font-size:.875rem;line-height:1.55;font-weight:400;border-radius:4px}
#adRules .kr-where{display:block;margin:4px 0 0;color:var(--ink2);font-size:.8rem;font-weight:400;line-height:1.5}
#adRules .kr-hide{display:none!important}
#sheet #adRules .krhead,#sheet #adRules>.hint{display:none}
#sheet .krnow{margin:0 0 10px;padding:8px 12px;border:2px solid var(--line);border-radius:12px;background:#fff;font-size:.95rem;line-height:1.6}
#sheet .krnow .krn{font-weight:700}
#view-admin .krtopbtn{margin-top:8px}
#view-admin .tile{position:relative}
#view-admin .krdelta{position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:999px;background:#fff;border:2px solid #B98F00;font-size:.8rem;font-weight:700;color:#3D3000;line-height:1.3;pointer-events:none}
#view-admin .krfold-h{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;-webkit-tap-highlight-color:transparent}
#view-admin .krfold-h .krfold-i{flex:none;font-size:.8rem;font-weight:700;color:var(--brand);border:2px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap;background:#fff}
#view-admin .krfold-h:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
#view-admin .kr-folded{display:none!important}
#view-admin .krfold-sum{margin:0 0 10px;font-size:.95rem;line-height:1.6;color:var(--ink)}
#view-admin .krfold-sum .krn{white-space:nowrap;font-weight:700}
@media (min-width:1180px){
  #view-admin.kr-on .wrap{max-width:1560px}
  #view-admin.kr-on .krwrap{display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,36%,480px);gap:20px;align-items:start}
  #view-admin.kr-on #krSide{display:block;position:sticky;top:12px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;
    background:var(--paper,#fff);border:2px solid var(--line);border-radius:14px;padding:6px 14px 16px;box-sizing:border-box}
  #view-admin.kr-on #krOpenAll{display:none}
  body.sheet-open #view-admin.kr-on .krwrap{display:block}
  body.sheet-open #view-admin.kr-on #krSide{display:none}
}`;
  document.head.appendChild(css);

  /* ---------- 設定ごとの短い名前・今の値・効く状況 ---------- */
  const st = () => D().settings;
  const tries = () => (window.KM && KM.triesAll ? KM.triesAll() : Math.max(2, Math.min(10, Number(st().awayTries) || 3)));
  const ext = () => (typeof extSet === 'function' ? extSet() : { on: false });
  // s：札の短い名前（「：」まで）・t：設定の行の名前（下から出る画面の見出し・お知らせ）・v：今の値・w：効く状況
  const F = {
    lendDays: { s: '返却の目安：', t: '返却の目安（受け取ってから）', v: () => `${lendDays()}日`, w: '期限の見張り（今月中に出したい区域・声かけ候補）・全体の状況（返却の目安を過ぎた貸出）' },
    awayRetPct: { s: '留守宅の目安：', t: '留守宅を回り終えたとみなす割合', v: () => `${awayRetPct()}%`, w: '期限の見張り（正式な返却になるか → 1年の期限）・全体の状況（留守宅カードで回っている区域）' },
    donePct: { s: '完了の目安：', t: '区域カードを「完了」にできる目安', v: () => `${st().donePct}%`, w: '期限の見張り（正式な返却になるか → 1年の期限）' },
    awayTries: { s: '留守宅を終える回数：', t: '留守宅を終える回数', v: () => `${tries()}回`, w: '手紙の候補・何度訪ねても会えない家・まだ試していない家の数' },
    extOn: { s: '返却後の留守宅カード：', t: '返却後の留守宅カード', v: () => (ext().on ? '使う' : '使わない'), w: '留守宅の状況（返却後の区域）・まだ試していない家の数' },
    extRest: { s: '寝かせる日数：', t: '寝かせる日数', v: () => `${ext().rest}日`, w: '留守宅の状況（返却後の区域の「寝かせ中」）', need: () => ext().on },
    extDays: { s: '出す期間：', t: '出す期間', v: () => `${ext().days}日`, w: '留守宅の状況（返却後の区域の「期間が終わった」）', need: () => ext().on },
    freeAfterDays: { s: '自由に受け取れるまで：', t: '正式に返却されてから、自動で受け取り可になるまで', v: () => `${Number(st().freeAfterDays) || 0}日`, w: '留守宅の状況（返却後の区域が止まる日）' },
    awayScope: { s: '試した時間帯の数え方：', t: '試した時間帯の数え方', v: () => (typeof awayRule === 'function' && awayRule().sc ? '前回の巡回も含める' : '今回の巡回だけ'), w: 'まだ試していない家の数・区域ごと' },
    keepMonths: { s: '記録を残す期間：', t: '訪問記録を残す期間', v: () => `${Number(st().keepMonths) || 24}か月`, w: '会えた成果（設定タブにあります）', tab: 'set' }
  };
  // 状況の見出し → 札に出す設定
  const prevH = (id, tag) => { const el = $id(id); let p = el && el.previousElementSibling; while (p && p.tagName !== tag) p = p.previousElementSibling; return p; };
  const BLOCKS = [
    { h: () => document.querySelector('#adDue > h2'), keys: ['lendDays', 'awayRetPct', 'donePct', 'awayTries'] },
    { h: () => prevH('adTiles', 'H2'), keys: ['lendDays', 'awayRetPct'] },
    { h: () => document.querySelector('#adAch > h2'), keys: ['keepMonths'] },
    { h: () => $id('adCandH'), keys: ['awayTries'] },
    { h: () => prevH('adAwaySet', 'H2'), keys: ['extOn', 'extRest', 'extDays', 'freeAfterDays'] },
    { h: () => { const s = $id('adAwaySlots'); return s ? prevHOf(s.closest('.scroll') || s, 'H3') : null; }, keys: ['awayScope', 'extOn', 'awayTries'] },
    { h: () => prevH('adAwayTerrs', 'H3'), keys: ['awayScope', 'awayTries'] },
    { h: () => $id('adHardH'), keys: ['awayTries'] }
  ];
  function prevHOf(el, tag) { let p = el && el.previousElementSibling; while (p && p.tagName !== tag) p = p.previousElementSibling; return p; }
  // 下から出る画面に出す「いまの状況」の数（左の状況の数字を読む）
  const num = sel => { const b = document.querySelector(sel); return b ? b.textContent.trim() : null; };
  // 手紙の候補の数（一覧と同じ数え方。一覧は30件まで出して「ほか○件」なので、数は留守宅の索引から数える）
  const hardN = () => { try { return typeof unmetIndex === 'function' ? String([...unmetIndex().values()].flat().filter(x => x.hard).length) : null; } catch (e) { return null; } };
  const extN = () => { const t = document.querySelector('#adAwaySet table'); return t ? String(Math.max(0, t.querySelectorAll('tr').length - 1)) : (ext().on ? '0' : null); };
  const NOW = {
    lendDays: () => [['声かけ候補', num('#adDue [data-duetl="pace"] b'), '件'], ['今月中に出したい区域', num('#adDue [data-duetl="need"] b'), '件'], ['返却の目安を過ぎた貸出', num('#adTiles [data-tl="over"] b'), '件']],
    awayRetPct: () => [['1年の期限を過ぎた区域', num('#adDue [data-duetl="over"] b'), '件'], ['期限まで60日以内', num('#adDue [data-duetl="warn"] b'), '件']],
    donePct: () => [['1年の期限を過ぎた区域', num('#adDue [data-duetl="over"] b'), '件'], ['期限まで60日以内', num('#adDue [data-duetl="warn"] b'), '件']],
    awayTries: () => [['手紙の候補', hardN(), '件']],
    extOn: () => [['返却後の区域', extN(), '区域']],
    extRest: () => [['返却後の区域', extN(), '区域']],
    extDays: () => [['返却後の区域', extN(), '区域']],
    freeAfterDays: () => [['返却後の区域', extN(), '区域']]
  };

  /* ---------- 設定の行に、どの設定かの印（data-krk）を付ける（「？」の説明と同じ見つけ方） ---------- */
  const SRC = [['data-sset', null], ['data-kset', null], ['data-aset', null], ['data-set', null], ['data-dueset', null], ['data-range', null],
    ['data-takemax', 'selfTakeMax'], ['data-donepct', 'donePct'], ['data-offadd', 'offDays']];
  function keyOf(row) {
    if (row.getAttribute('data-hk')) return row.getAttribute('data-hk');
    for (let i = 0; i < SRC.length; i++) { const el = row.querySelector('[' + SRC[i][0] + ']'); if (el) return SRC[i][1] || el.getAttribute(SRC[i][0]); }
    return '';
  }
  function tagRows() { RULES.querySelectorAll('.setrow').forEach(r => { const k = keyOf(r); if (k) r.setAttribute('data-krk', k); }); }
  const rowOf = k => RULES.querySelector(`.setrow[data-krk="${k}"]`);
  const groupOf = row => (row ? row.closest('details.krg') : null);

  /* ---------- 状態 ---------- */
  const SIDE_OFF = 'kuiki_kr_side_off';
  const sideOff = () => { try { return lsGet(SIDE_OFF) === '1'; } catch (e) { return false; } };
  const setSideOff = v => { try { if (v) lsSet(SIDE_OFF, '1'); else lsDel(SIDE_OFF); } catch (e) { /* 何もしない */ } };
  const wideMq = window.matchMedia ? window.matchMedia('(min-width:1180px)') : null;
  const wide = () => !!(wideMq && wideMq.matches);
  const inSheet = () => !!RULES.closest('#sheet');
  let hit = '', hitAt = 0, focusKey = '';

  function sync() {
    const on = typeof isAdmin === 'function' && isAdmin() && adPane === 'status';
    VA.classList.toggle('kr-on', on && !sideOff());
    requestAnimationFrame(fitSide); // 高さを測るのは描いたあと（描き直しの途中で画面全体の並べ直しをさせないため）
    const b = $id('krOpenAll');
    if (b) b.textContent = wide() && sideOff() ? '区域の決め（設定）を右に出す' : '区域の決め（設定）を開く';
    if (inSheet() && $id('sheet').hidden) home();
  }

  // 右の欄の高さ：係の画面（上の帯の下からいちばん下まで）に収める（文字の大きさで上の帯の高さが変わるため、その場で測る）
  function fitSide() {
    if (!wide() || !VA.classList.contains('kr-on')) { SIDE.style.maxHeight = ''; return; }
    const h = VA.clientHeight || window.innerHeight;
    // 文字の大きさ（係の画面は zoom で大きくする）のぶんだけ割る
    const z = Number(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
    SIDE.style.maxHeight = Math.max(240, (h - 24) / z) + 'px';
  }
  window.addEventListener('resize', () => { try { fitSide(); } catch (e) { /* 何もしない */ } });

  /* ---------- 札 ---------- */
  function chipsHtml(keys) {
    const ks = keys.filter(k => F[k] && (!F[k].need || F[k].need()));
    if (!ks.length) return '';
    return `<span>かかわる設定：</span>` + ks.map(k => `<button type="button" class="krchip" data-krgo="${k}" aria-pressed="${k === hit}">${F[k].s}<b>${F[k].v()}</b></button>`).join('');
  }
  function paintChips() {
    document.querySelectorAll('#krWrap .krchips').forEach(x => x.remove());
    if (adPane !== 'status') return;
    BLOCKS.forEach(b => {
      let h = null;
      try { h = b.h(); } catch (e) { h = null; }
      if (!h || !h.parentNode) return;
      const html = chipsHtml(b.keys);
      if (!html) return;
      const d = document.createElement('div');
      d.className = 'krchips'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'かかわる設定');
      d.innerHTML = html;
      h.insertAdjacentElement('afterend', d);
    });
  }

  /* ---------- 押した設定を光らせ、変えたときの影響を出す ---------- */
  function helpChange(k) {
    const H = window.HELP; if (!H) return '';
    const lang = window.KI && KI.lang === 'es' ? 'es' : 'ja';
    const it = (H[lang] && H[lang][k]) || (H.ja && H.ja[k]);
    return it && it.change ? it.change : '';
  }
  function applyHit() {
    RULES.querySelectorAll('.kr-hit').forEach(r => r.classList.remove('kr-hit'));
    RULES.querySelectorAll('.kr-eff, .kr-where').forEach(x => x.remove());
    if (!hit) return;
    const row = rowOf(hit), f = F[hit];
    if (!row || !f) return;
    row.classList.add('kr-hit');
    const lab = row.firstElementChild;
    if (!lab) return;
    const ch = helpChange(hit);
    lab.insertAdjacentHTML('beforeend', (ch ? `<span class="kr-eff"><b>変えると：</b>${esc(ch)}</span>` : '') + `<span class="kr-where"><b>効く状況：</b>${esc(f.w)}</span>`);
  }
  function scrollInto(box, el) {
    if (!box || !el) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12;
    try { box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); } catch (e) { box.scrollTop = Math.max(0, top); }
  }
  function focusCtl(row) {
    const c = row && row.querySelector('input,button:not(.qhelp)');
    if (c) try { c.focus({ preventScroll: true }); } catch (e) { /* 何もしない */ }
  }

  /* ---------- 下から出る画面（スマホ・右の欄を閉じているとき） ---------- */
  function home() {
    if (RULES.parentNode !== SIDE) SIDE.appendChild(RULES);
    RULES.classList.remove('kr-focus');
    RULES.querySelectorAll('.kr-hide').forEach(x => x.classList.remove('kr-hide'));
    focusKey = '';
  }
  function applyFocus() {
    RULES.querySelectorAll('.kr-hide').forEach(x => x.classList.remove('kr-hide'));
    if (!inSheet() || !focusKey) { RULES.classList.remove('kr-focus'); return; }
    const row = rowOf(focusKey), g = groupOf(row);
    if (!row || !g) { RULES.classList.remove('kr-focus'); return; }
    RULES.classList.add('kr-focus');
    g.open = true;
    RULES.querySelectorAll('details.krg').forEach(x => { if (x !== g) x.classList.add('kr-hide'); });
    const sum = g.querySelector('summary'); if (sum) sum.classList.add('kr-hide');
    const box = row.parentNode;
    [...box.children].forEach(x => { if (x !== row) x.classList.add('kr-hide'); });
  }
  function paintNow() {
    const el = $id('krNow'); if (!el) return;
    const f = NOW[focusKey || hit];
    const items = f ? f().filter(x => x[1] != null) : [];
    el.hidden = !items.length;
    el.innerHTML = items.length ? `<b>いまの状況</b><br>${items.map(x => `<span class="krn">${esc(x[0])} ${esc(x[1])}${esc(x[2])}</span>`).join('<br>')}` : '';
  }
  function openSheet(key, g) {
    const f = key ? F[key] : null, row = key ? rowOf(key) : null, grp = groupOf(row) || (g ? RULES.querySelector(`details.krg[data-krg="${g}"]`) : null);
    const gl = grp ? (grp.querySelector('summary') || {}).textContent || '' : '';
    setSheet(headHtml(null, f ? esc(f.t) : '区域の決め（設定）', f ? '区域の決め（設定）' : '変えると、すぐ全員に効きます') +
      (f ? '<p class="krnow" id="krNow" aria-live="polite" hidden></p>' : '') +
      '<div id="krSlot"></div>' +
      (f && gl ? `<button type="button" class="btn block wrap" data-krall>「${esc(gl)}」の設定をすべて見る</button>` : '') +
      '<button type="button" class="btn block" data-close>閉じる</button>');
    const slot = $id('krSlot'); if (!slot) return;
    slot.appendChild(RULES);
    focusKey = key || '';
    if (grp) grp.open = true;
    applyHit(); applyFocus(); paintNow();
    if (!key && grp) scrollInto($id('sheet'), grp);
    if (row) focusCtl(row);
  }

  /* ---------- 札を押したとき・入り口から開くとき ---------- */
  function goTab(pane, key) {
    adPane = pane; renderAdmin();
    window.scrollTo(0, 0);
    setTimeout(() => {
      const c = document.querySelector(`#view-admin [data-kset="${key}"]`), row = c && c.closest('.setrow');
      if (!row) return;
      row.scrollIntoView({ block: 'center' });
      row.style.boxShadow = '0 0 0 3px #E0B400 inset'; setTimeout(() => { row.style.boxShadow = ''; }, 4000);
    }, 60);
  }
  function go(key) {
    const f = F[key]; if (!f) return;
    if (f.tab) { goTab(f.tab, key); return; }
    hit = key; hitAt = Date.now();
    document.querySelectorAll('#view-admin .krchip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.krgo === key)));
    if (wide() && !sideOff() && !inSheet()) {
      if (!$id('sheet').hidden) closeSheet();
      const row = rowOf(key), g = groupOf(row);
      if (g) g.open = true;
      applyHit();
      if (row) { scrollInto(SIDE, row); focusCtl(row); }
    } else openSheet(key);
  }
  function open(g) {
    if (adPane !== 'status') { adPane = 'status'; renderAdmin(); window.scrollTo(0, 0); }
    if (wide()) {
      if (sideOff()) { setSideOff(false); sync(); }
      if (!$id('sheet').hidden) closeSheet();
      const grp = g ? RULES.querySelector(`details.krg[data-krg="${g}"]`) : null;
      if (grp) { grp.open = true; scrollInto(SIDE, grp); }
    } else openSheet('', g);
  }
  document.addEventListener('click', e => {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    let x;
    if ((x = t.closest('[data-krgo]'))) { e.preventDefault(); go(x.dataset.krgo); }
    else if (t.closest('#krOpenAll')) { e.preventDefault(); if (wide()) { setSideOff(false); sync(); } else openSheet('', 'lend'); }
    else if (t.closest('[data-krclose]')) { e.preventDefault(); if (inSheet()) closeSheet(); else { setSideOff(true); sync(); } }
    else if (t.closest('[data-krall]')) {
      e.preventDefault();
      const k = focusKey; focusKey = '';
      applyFocus();
      const b = t.closest('[data-krall]'); if (b) b.hidden = true;
      const row = k ? rowOf(k) : null; if (row) scrollInto($id('sheet'), row);
    }
  });

  /* ---------- 描き直したあと：印・札・光・しぼり込みを付け直す ---------- */
  /* ---------- 変えたあと：左の変わった数字に「前 → 今」の印（10秒）・お知らせに「取り消す」 ---------- */
  const CTL = '[data-sset],[data-kset],[data-aset],[data-dueset],[data-donepct],[data-takemax],[data-range],[data-offadd],[data-offdel]';
  let pending = null, delta = null;
  const snapNums = () => { const o = {}; document.querySelectorAll('#adDue [data-duetl], #adTiles [data-tl]').forEach(t => { const b = t.querySelector('b'); if (b) o[(t.dataset.duetl ? 'd:' + t.dataset.duetl : 't:' + t.dataset.tl)] = b.textContent.trim(); }); return o; };
  const snapVals = () => { const o = {}; Object.keys(F).forEach(k => { try { o[k] = F[k].v(); } catch (e) { o[k] = ''; } }); return o; };
  const grab = e => {
    const t = e.target && e.target.closest ? e.target.closest(CTL) : null;
    if (!t || !t.closest('#adRules')) return;
    pending = { at: Date.now(), nums: snapNums(), vals: snapVals(), set: JSON.stringify(D().settings), prev: JSON.parse(JSON.stringify(D().settings)) };
  };
  document.addEventListener('click', grab, true);
  document.addEventListener('pointerdown', grab, true); // スライダー：動かしはじめに控える（変わるのは、はなしたとき）
  document.addEventListener('keydown', grab, true); // キーボードでスライダーを動かすとき
  function checkChange() {
    if (!pending) return;
    if (Date.now() - pending.at > 30000) { pending = null; return; }
    if (JSON.stringify(D().settings) === pending.set) return; // まだ変わっていない（確かめの画面の途中など）
    const p = pending; pending = null;
    const now = snapNums(), map = {};
    Object.keys(now).forEach(k => { if (p.nums[k] != null && p.nums[k] !== now[k]) map[k] = [p.nums[k], now[k]]; });
    delta = { map, until: Date.now() + 10000 };
    const vals = snapVals(), ch = Object.keys(F).filter(k => p.vals[k] !== vals[k]);
    const msg = ch.length === 1 ? `${F[ch[0]].t}を ${p.vals[ch[0]]} → ${vals[ch[0]]} にしました` : '設定を変えました';
    // 設定の処理が、このあとで「設定を変えました」を出すので、それよりあとに出す
    setTimeout(() => toast(msg, null, { label: '取り消す', fn: () => undo(p.prev) }), 0);
  }
  function undo(prev) {
    delta = null; document.querySelectorAll('#view-admin .krdelta').forEach(x => x.remove());
    const s = D().settings;
    new Set(Object.keys(prev).concat(Object.keys(s))).forEach(k => {
      if (JSON.stringify(prev[k]) === JSON.stringify(s[k])) return;
      if (prev[k] === undefined) delete s[k]; else s[k] = prev[k];
    });
    Store.save(); renderAll(); toast('設定をもとにもどしました');
  }
  function paintDelta() {
    if (!delta || Date.now() > delta.until) { delta = null; return; }
    Object.keys(delta.map).forEach(k => {
      const sel = k.startsWith('d:') ? `#adDue [data-duetl="${k.slice(2)}"]` : `#adTiles [data-tl="${k.slice(2)}"]`;
      const t = document.querySelector(sel); if (!t || t.querySelector('.krdelta')) return;
      const b = t.querySelector('b'); if (!b || b.textContent.trim() !== delta.map[k][1]) return; // そのあとで数字が変わったときは出さない
      t.insertAdjacentHTML('beforeend', `<span class="krdelta" aria-label="${esc(delta.map[k][0])}から${esc(delta.map[k][1])}に変わりました">${esc(delta.map[k][0])} → ${esc(delta.map[k][1])}</span>`);
    });
    const left = delta.until - Date.now();
    clearTimeout(paintDelta.tm);
    paintDelta.tm = setTimeout(() => { document.querySelectorAll('#view-admin .krdelta').forEach(x => x.remove()); }, Math.max(0, left));
  }

  /* ---------- スマホ：状況の見出しをたたむ（期限の見張りだけ開いておく・開け閉めはこの端末に覚える） ---------- */
  const FOLD = 'kuiki_kr_fold';
  let foldState = null;
  const folds = () => { if (!foldState) { try { foldState = JSON.parse(lsGet(FOLD) || '{}') || {}; } catch (e) { foldState = {}; } } return foldState; };
  const isOpen = id => { const f = folds(); return f[id] != null ? !!f[id] : id === 'due'; };
  const setOpenF = (id, v) => { folds()[id] = v ? 1 : 0; try { lsSet(FOLD, JSON.stringify(foldState)); } catch (e) { /* 何もしない */ } };
  // 見出しごとの、たたんだときの要点
  const dueNum = k => num(`#adDue [data-duetl="${k}"] b`), tileNum = k => num(`#adTiles [data-tl="${k}"] b`);
  const SUMS = {
    due: () => [['1年の期限を過ぎた', dueNum('over')], ['期限まで60日以内', dueNum('warn')], ['今月中に出したい', dueNum('need')], ['声かけ候補', dueNum('pace')]],
    tiles: () => [['区域の数', tileNum('terr')], ['返却の目安を過ぎた貸出', tileNum('over')], ['この90日で会えた', tileNum('met')]],
    away: () => (ext().on ? [['返却後の区域', extN()]] : []),
    hard: () => [['手紙の候補', hardN()]]
  };
  const sumHtml = a => a.filter(x => x[1] != null).map(x => `<span class="krn">${esc(x[0])} ${esc(x[1])}</span>`).join('・');
  // 状況の見出し（id・見つけ方・中身の終わり）
  function foldBlocks() {
    const out = [], panes = [document.querySelector('.apane[data-apane="status"]'), document.querySelector('.apane[data-apane="status2"]')];
    const BOX = { adDue: 'due', adSlotBox: 'slot', adAch: 'ach', adCand: 'cand' };
    // 見出しは、文字ではなく、すぐ下の箱で見分ける（スペイン語の画面でも同じに動くように）
    const HID = new Map();
    const put = (h, id) => { if (h) HID.set(h, id); };
    put(prevH('adTiles', 'H2'), 'tiles'); put(prevH('adMeetHint', 'H2'), 'meet'); put(prevH('adAwaySet', 'H2'), 'away');
    { const sl = $id('adAwaySlots'); put(sl ? prevHOf(sl.closest('.scroll') || sl, 'H3') : null, 'slots2'); }
    put(prevH('adAwayTerrs', 'H3'), 'terrs'); put($id('adHardH'), 'hard');
    const ID = h => HID.get(h) || '';
    panes.forEach(pane => {
      if (!pane) return;
      let cur = null;
      [...pane.children].forEach(el => {
        if (el.hidden || el.classList.contains('krchips') || el.classList.contains('krfold-sum')) return;
        if (BOX[el.id]) { const h = el.querySelector(':scope > h2'); cur = null; if (h) out.push({ id: BOX[el.id], h, body: [...el.children].filter(x => x !== h && !x.classList.contains('krchips') && !x.classList.contains('krfold-sum')) }); return; }
        if (/^H[23]$/.test(el.tagName)) { const id = ID(el); cur = id ? { id, h: el, body: [] } : null; if (cur) out.push(cur); return; }
        if (cur) cur.body.push(el);
      });
    });
    return out;
  }
  function paintFolds() {
    document.querySelectorAll('#view-admin .kr-folded').forEach(x => x.classList.remove('kr-folded'));
    document.querySelectorAll('#view-admin .krfold-sum').forEach(x => x.remove());
    document.querySelectorAll('#view-admin .krfold-h').forEach(h => { h.classList.remove('krfold-h'); h.removeAttribute('role'); h.removeAttribute('tabindex'); h.removeAttribute('aria-expanded'); const i = h.querySelector('.krfold-i'); if (i) i.remove(); });
    if (adPane !== 'status' || wide()) return;
    foldBlocks().forEach(b => {
      const open = isOpen(b.id);
      b.h.classList.add('krfold-h'); b.h.setAttribute('role', 'button'); b.h.setAttribute('tabindex', '0'); b.h.setAttribute('aria-expanded', String(open)); b.h.dataset.krfold = b.id;
      b.h.insertAdjacentHTML('beforeend', `<span class="krfold-i" aria-hidden="true">${open ? 'たたむ ▴' : '開く ▾'}</span>`);
      if (open) return;
      b.body.forEach(x => x.classList.add('kr-folded'));
      const sum = SUMS[b.id] ? sumHtml(SUMS[b.id]()) : '';
      if (sum) {
        const chips = b.h.nextElementSibling && b.h.nextElementSibling.classList.contains('krchips') ? b.h.nextElementSibling : null;
        (chips || b.h).insertAdjacentHTML('afterend', `<p class="krfold-sum">${sum}</p>`);
      }
    });
  }
  const toggleFold = h => { const id = h.dataset.krfold; if (!id) return; setOpenF(id, !isOpen(id)); paintFolds(); };
  // 「今日」タブの「見る」などで状況の中の場所に飛ぶときは、その見出しを開いておく（たたんだ中には飛べないため）
  const ANCHOR = { adDue: 'due', adTiles: 'tiles', adSlotBox: 'slot', adAch: 'ach', adMeet: 'meet', adCand: 'cand', adAwaySet: 'away', adAwaySlots: 'slots2', adAwayTerrs: 'terrs', adHard: 'hard' };
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('[data-tgo="status"][data-anchor]') : null;
    const id = b && ANCHOR[b.dataset.anchor];
    if (id && !isOpen(id)) setOpenF(id, true);
  }, true);
  VA.addEventListener('click', e => {
    const h = e.target && e.target.closest ? e.target.closest('.krfold-h') : null;
    if (!h || e.target.closest('button:not(.krfold-i), a, input, select')) return;
    toggleFold(h);
  });
  VA.addEventListener('keydown', e => {
    const h = e.target && e.target.classList && e.target.classList.contains('krfold-h') ? e.target : null;
    if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleFold(h); }
  });

  function after() {
    sync();
    tagRows();
    if (adPane === 'status') paintChips();
    if (hit && Date.now() - hitAt > 10 * 60000) hit = '';
    applyHit();
    if (inSheet()) { applyFocus(); paintNow(); }
    checkChange();
    paintDelta();
    paintFolds();
  }
  const _renderAdmin = window.renderAdmin;
  if (typeof _renderAdmin === 'function') {
    window.renderAdmin = function () {
      const r = _renderAdmin.apply(this, arguments);
      try { after(); } catch (e) { console.error(e); }
      return r;
    };
  }
  // 下から出る画面を閉じたり、別の画面に変えたりしたときは、区域の決めを元の場所（右の欄）に戻す
  const _setSheet = window.setSheet, _closeSheet = window.closeSheet;
  window.setSheet = function () { if (inSheet()) home(); return _setSheet.apply(this, arguments); };
  window.closeSheet = function () { const r = _closeSheet.apply(this, arguments); if (inSheet()) home(); return r; };
  if (wideMq && wideMq.addEventListener) wideMq.addEventListener('change', () => { try { sync(); paintFolds(); } catch (e) { /* 何もしない */ } });

  // 状況の上（S-12 の下）に、区域の決めを開くボタン（パソコンで右の欄が出ているときは隠す）
  const s12 = $id('adS12');
  if (s12 && !$id('krOpenAll')) s12.insertAdjacentHTML('afterend', '<button type="button" class="btn block krtopbtn" id="krOpenAll">区域の決め（設定）を開く</button>');

  window.KR = { open, go, F };
})();
