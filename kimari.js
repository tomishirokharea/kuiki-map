/* =========================================================
   区域マップ：区域係の「区域の決まり」を設定タブに集める（kimari.js・2026-10-25／2026-11-09 見直し）

   ねらい：状況で問題を見つけて、設定タブの「区域の決まり」で直す
   ・状況の各見出しの下に「かかわる設定」の札（短い名前と今の値）を出す
   ・札を押すと、設定タブに切りかわり、その設定のまとまりを開いて光らせ、「変えると：…」「効く状況：…」を出す
   ・設定は設定タブのいちばん上「区域の決まり」1か所にまとめる（よく調整する6項目は開いて置き、ほかの5つのまとまりはたたむ）
     設定の行と、押したときの処理は今までと同じ（app.js・schedule.js・tsuzuki.js が #krLend などの箱に描く）。
     描いたあとで、置き場所の表（PLACE）にしたがって行を移す（placeRows）。行はいつも1つだけ
   ・まとまりの開け閉めは、この端末に覚える
   ・前の「状況と区域の決まりを左右に並べる」（パソコンの右の欄・スマホの下から出る画面）は、やめた（KS-12）
   ========================================================= */
(function () {
  'use strict';
  const $id = id => document.getElementById(id);
  const RULES = $id('adRules'), VA = $id('view-admin');
  if (!RULES || !VA || typeof D !== 'function') return;

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `
.krules details.krg{border-top:1px solid var(--line);padding:2px 0}
.krules details.krg>summary,#setMaint>summary{font-weight:700;font-size:16px;padding:12px 2px;cursor:pointer;min-height:44px;box-sizing:border-box}
.krules .krbox>.setrow{border-radius:10px}
#view-admin .setsec{margin:0 0 18px}
#view-admin .setsec>h2.sec,#view-admin #setMaint>summary{font-size:22px;margin:28px 0 10px;padding:8px 12px;border-left:6px solid var(--terr);background:var(--terr-soft);border-radius:0 8px 8px 0}
#view-admin #setMaint{padding:0}
#setMap:has(#adS21:empty):has(#adIken:empty) #setMapEtcH{display:none}
#view-admin .krchips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 12px;color:var(--ink2);font-size:.8rem}
#view-admin .krchips>span{font-size:inherit}
#view-admin button.krchip{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:4px;width:auto!important;min-width:0!important;min-height:40px!important;height:auto!important;margin:0!important;padding:4px 12px!important;border-radius:999px!important;font-size:.875rem!important;font-weight:400!important;line-height:1.2!important;background:#F3F5F7!important;border:1px solid #C9D2DA!important;color:var(--ink)!important;white-space:nowrap!important;box-shadow:none!important;text-align:left!important}
#view-admin button.krchip b{display:inline!important;font-weight:700;margin:0!important;font-size:inherit!important}
#view-admin button.krchip[aria-pressed=true]{background:#FFF4C2!important;border-color:#B98F00!important;box-shadow:0 0 0 2px #FFE58A!important}
#adRules .setrow.kr-hit{background:#FFF8D6;box-shadow:0 0 0 2px #B98F00 inset;padding-left:8px;padding-right:8px}
#adRules .kr-eff{display:block;margin:6px 0 0;padding:6px 8px;border-left:4px solid #B98F00;background:#FFFBE6;color:#3D3000;font-size:.875rem;line-height:1.55;font-weight:400;border-radius:4px}
#adRules .kr-where{display:block;margin:4px 0 0;color:var(--ink2);font-size:.8rem;font-weight:400;line-height:1.5}
#view-admin .tile{position:relative}
#view-admin .krdelta{position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:999px;background:#fff;border:2px solid #B98F00;font-size:.8rem;font-weight:700;color:#3D3000;line-height:1.3;pointer-events:none}
#view-admin .krfold-h{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;-webkit-tap-highlight-color:transparent}
#view-admin .krfold-h .krfold-i{flex:none;font-size:.8rem;font-weight:700;color:var(--brand-ink);border:2px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap;background:#fff}
#view-admin .krfold-h:focus-visible{outline:3px solid var(--brand-ink);outline-offset:2px}
#view-admin .kr-folded{display:none!important}
#view-admin .krfold-sum{margin:0 0 10px;font-size:.95rem;line-height:1.6;color:var(--ink)}
#view-admin .krfold-sum .krn{white-space:nowrap;font-weight:700}`;
  document.head.appendChild(css);

  /* ---------- 設定ごとの短い名前・今の値・効く状況 ---------- */
  const st = () => D().settings;
  const tries = () => (window.KM && KM.triesAll ? KM.triesAll() : Math.max(2, Math.min(10, Number(st().awayTries) || 3)));
  const ext = () => (typeof extSet === 'function' ? extSet() : { on: false });
  // s：札の短い名前（「：」まで）・t：設定の行の名前（下から出る画面の見出し・お知らせ）・v：今の値・w：効く状況
  const F = {
    lendDays: { s: '返却の目安：', t: '返却の目安（受け取ってから）', v: () => `${lendDays()}日`, w: '期限の見張り（今月中に出したい区域・声かけ候補）・全体の状況（返却の目安を過ぎた貸出）' },
    awayRetPct: { s: '留守宅の目安：', t: '留守宅を回り終えたとみなす割合', v: () => `${awayRetPct()}%`, w: '期限の見張り（正式な返却になるか → 年1回の期限）・全体の状況（留守宅カードで回っている区域）' },
    awayAgainSlot: { s: '訪ね直しの条件：', t: '留守宅を「訪ね直した」と数える条件', v: () => (typeof againSlot === 'function' && againSlot() ? '別の日・別の時間帯' : '別の日'), w: '期限の見張り（正式な返却になるか → 年1回の期限）・全体の状況（留守宅カードで回っている区域）' },
    donePct: { s: '完了の目安：', t: '区域カードを「完了」にできる目安', v: () => `${st().donePct}%`, w: '期限の見張り（正式な返却になるか → 年1回の期限）' },
    awayTries: { s: '留守宅を終える回数：', t: '留守宅を終える回数', v: () => `${tries()}回`, w: '手紙の候補・何度訪ねても会えない家・まだ試していない家の数' },
    extRest: { s: '寝かせる日数：', t: '寝かせる日数（完了のあと）', v: () => `${ext().rest}日`, w: '留守宅の状況（完了した区域の「寝かせ中」）' },
    extDays: { s: 'おすすめに出す期間：', t: 'おすすめに出す期間', v: () => `${ext().days}日`, w: '留守宅の状況（完了した区域の「期間が終わった」）' },
    freeAfterDays: { s: '自由に受け取れるまで：', t: '正式に返却されてから、自動で受け取り可になるまで', v: () => `${Number(st().freeAfterDays) || 0}日`, w: '留守宅の状況（完了した区域を、おすすめに出すのをやめる日）' },
    awayScope: { s: '試した時間帯の数え方：', t: '試した時間帯の数え方', v: () => (typeof awayRule === 'function' && awayRule().sc ? '前回の巡回も含める' : '今回の巡回だけ'), w: 'まだ試していない家の数・区域ごと' },
    keepMonths: { s: '記録を残す期間：', t: '訪問記録を残す期間', v: () => `${Number(st().keepMonths) || 24}か月`, w: '会えた成果（設定タブにあります）', tab: 'set' }
  };
  // 状況の見出し → 札に出す設定
  const prevH = (id, tag) => { const el = $id(id); let p = el && el.previousElementSibling; while (p && p.tagName !== tag) p = p.previousElementSibling; return p; };
  const BLOCKS = [
    { h: () => document.querySelector('#adDue > h2'), keys: ['lendDays', 'awayRetPct', 'awayAgainSlot', 'donePct', 'awayTries'] },
    { h: () => prevH('adTiles', 'H2'), keys: ['lendDays', 'awayRetPct'] },
    { h: () => document.querySelector('#adAch > h2'), keys: ['keepMonths'] },
    { h: () => $id('adCandH'), keys: ['awayTries'] },
    { h: () => prevH('adAwaySet', 'H2'), keys: ['extRest', 'extDays', 'freeAfterDays'] },
    { h: () => { const s = $id('adAwaySlots'); return s ? prevHOf(s.closest('.scroll') || s, 'H3') : null; }, keys: ['awayScope', 'awayTries'] },
    { h: () => prevH('adAwayTerrs', 'H3'), keys: ['awayScope', 'awayTries'] },
    { h: () => $id('adHardH'), keys: ['awayTries'] }
  ];
  function prevHOf(el, tag) { let p = el && el.previousElementSibling; while (p && p.tagName !== tag) p = p.previousElementSibling; return p; }
  // 状況の数字を読む（たたんだときの要点）
  const num = sel => { const b = document.querySelector(sel); return b ? b.textContent.trim() : null; };
  // 手紙の候補の数（一覧と同じ数え方。一覧は30件まで出して「ほか○件」なので、数は留守宅の索引から数える）
  const hardN = () => { try { return typeof unmetIndex === 'function' ? String([...unmetIndex().values()].flat().filter(x => x.hard).length) : null; } catch (e) { return null; } };
  const extN = () => { const t = document.querySelector('#adAwaySet table'); return t ? String(Math.max(0, t.querySelectorAll('tr').length - 1)) : '0'; }; // 完了した区域の数

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

  /* ---------- 置き場所の表：設定 → 入れる箱（KS-15）。ここに無い設定は、描いた箱のまま ----------
     krTop＝よく調整する（開いて置く）。6項目は下のまとまりには重ねて出さない */
  const PLACE = {
    krTop: ['lendDays', 'donePct', 'awayRetPct', 'autoFree', 'holdMaxPersonal', 'awayCap'],
    krLend: ['awayAgainSlot', 'lowOn', 'lowWait', 'freeAfterDays', 'skipDays', 'followSkipDays', 'skipDone', 'contDays'],
    krExt: ['recoOn', 'wxOn'],
    krTake: ['selfTakeMax', 'holdMaxGroup', 'reqMaxPersonal', 'reqMaxGroup'],
    krTips: ['youngW', 'awayTries', 'nightOn', 'offDays', 'groupOn', 'groupMax', 'lockOthers', 'memoSync']
  };
  const BOX_OF = {};
  Object.keys(PLACE).forEach(b => PLACE[b].forEach(k => { BOX_OF[k] = b; }));
  // 行を置き場所の箱に移す（もう置き場所のまとまりにあれば何もしない）。
  // 箱は描くたびに中身を描き直すので、元の箱に新しい行が出る。そのときは、置き場所に残っている古い行を消して、新しい行を移す（行はいつも1つ）
  function placeRows() {
    Object.keys(PLACE).forEach(bid => {
      const box = $id(bid), grp = box && box.closest('details.krg');
      if (!box || !grp) return;
      PLACE[bid].forEach(k => {
        const rows = [...RULES.querySelectorAll(`.setrow[data-krk="${k}"]`)];
        if (!rows.length) return;
        const fresh = rows.filter(r => r.closest('details.krg') !== grp);
        if (!fresh.length) { rows.slice(1).forEach(r => r.remove()); return; } // もう置き場所にある（念のため、重なりは1つにする）
        rows.filter(r => r.closest('details.krg') === grp).forEach(r => r.remove()); // 置き場所の古い行
        fresh.slice(0, -1).forEach(r => r.remove());
        box.appendChild(fresh[fresh.length - 1]);
      });
      // よく調整する：表の順にそろえる（並びが違うときだけ動かす）
      if (bid === 'krTop') {
        const want = PLACE.krTop.map(k => box.querySelector(`:scope > .setrow[data-krk="${k}"]`)).filter(Boolean);
        const now = [...box.children].filter(x => want.includes(x));
        if (want.some((r, i) => now[i] !== r)) want.forEach(r => box.appendChild(r));
      }
    });
  }
  // 描き直し（app.js・schedule.js などが、それぞれの時に箱を描く）を見張って、すぐ置き場所をそろえる（画面に出る前・同じ処理の続きで動く）
  let placing = false;
  const mo = window.MutationObserver ? new MutationObserver(() => {
    if (placing) return;
    placing = true;
    try { tagRows(); placeRows(); } catch (e) { console.error(e); } finally { mo.takeRecords(); placing = false; }
  }) : null;
  if (mo) mo.observe(RULES, { childList: true, subtree: true });

  /* ---------- まとまりの開け閉め：はじめは「よく調整する」だけ開く。開け閉めはこの端末に覚える ---------- */
  const OPEN_KEY = 'kuiki_kr_open';
  let openState = null;
  const opens = () => { if (!openState) { try { openState = JSON.parse(lsGet(OPEN_KEY) || '{}') || {}; } catch (e) { openState = {}; } } return openState; };
  RULES.querySelectorAll('details.krg[data-krg]').forEach(d => {
    const v = opens()[d.dataset.krg];
    if (v != null) d.open = !!v;
  });
  RULES.addEventListener('toggle', e => {
    const d = e.target;
    if (!d || !d.matches || !d.matches('details.krg[data-krg]')) return;
    opens()[d.dataset.krg] = d.open ? 1 : 0;
    try { lsSet(OPEN_KEY, JSON.stringify(openState)); } catch (err) { /* 何もしない */ }
  }, true);
  // 前の右の欄を閉じた印は、もう使わない（1回だけ消す）
  try { if (lsGet('kuiki_kr_side_off') != null) lsDel('kuiki_kr_side_off'); } catch (e) { /* 何もしない */ }

  /* ---------- 状態 ---------- */
  // 状況の見出しをたたむのは、スマホ（幅1,180px未満）だけ
  const wideMq = window.matchMedia ? window.matchMedia('(min-width:1180px)') : null;
  const wide = () => !!(wideMq && wideMq.matches);
  let hit = '', hitAt = 0;

  /* ---------- 札 ---------- */
  function chipsHtml(keys) {
    const ks = keys.filter(k => F[k] && (!F[k].need || F[k].need()));
    if (!ks.length) return '';
    return `<span>かかわる設定：</span>` + ks.map(k => `<button type="button" class="krchip" data-krgo="${k}" aria-pressed="${k === hit}">${F[k].s}<b>${F[k].v()}</b></button>`).join('');
  }
  function paintChips() {
    document.querySelectorAll('#view-admin .krchips').forEach(x => x.remove());
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
  function focusCtl(row) {
    const c = row && row.querySelector('input,button:not(.qhelp)');
    if (c) try { c.focus({ preventScroll: true }); } catch (e) { /* 何もしない */ }
  }

  /* ---------- 札を押したとき・入り口から開くとき：設定タブに切りかえて、その行（まとまり）を開いて見せる ---------- */
  // （Task 6 で、状況にもどるボタンを足す予定。それまでは、設定タブに切りかえるだけ）
  function toSet() {
    if (adPane !== 'set') { adPane = 'set'; renderAdmin(); }
  }
  function goTab(pane, key) {
    adPane = pane; renderAdmin();
    window.scrollTo(0, 0);
    setTimeout(() => {
      const c = document.querySelector(`#view-admin [data-kset="${key}"]`), row = c && c.closest('.setrow');
      if (!row) return;
      const d = row.closest('details'); if (d) d.open = true;
      row.scrollIntoView({ block: 'center' });
      row.style.boxShadow = '0 0 0 3px #E0B400 inset'; setTimeout(() => { row.style.boxShadow = ''; }, 4000);
    }, 60);
  }
  function showRow(row) {
    const g = groupOf(row);
    if (g) g.open = true;
    try { row.scrollIntoView({ block: 'center' }); } catch (e) { row.scrollIntoView(); }
    focusCtl(row);
  }
  function go(key) {
    const f = F[key];
    if (f && f.tab) { goTab(f.tab, key); return; }
    hit = key; hitAt = Date.now();
    document.querySelectorAll('#view-admin .krchip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.krgo === key)));
    toSet();
    applyHit();
    const row = rowOf(key);
    if (row) showRow(row);
  }
  // open(設定の名前 か まとまりの名前（lend・away・ext・take・tips・top）)
  function open(g) {
    if (g && rowOf(g)) { go(g); return; }
    toSet();
    const grp = g ? RULES.querySelector(`details.krg[data-krg="${g}"]`) : null;
    if (grp) { grp.open = true; try { grp.scrollIntoView({ block: 'start' }); } catch (e) { grp.scrollIntoView(); } }
    else { const s = $id('setRules'); if (s) s.scrollIntoView(); }
  }
  document.addEventListener('click', e => {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    const x = t.closest('[data-krgo]');
    if (x) { e.preventDefault(); go(x.dataset.krgo); }
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
    due: () => [['年1回の期限を過ぎた', dueNum('over')], ['期限まで60日以内', dueNum('warn')], ['今月中に出したい', dueNum('need')], ['声かけ候補', dueNum('pace')]],
    tiles: () => [['区域の数', tileNum('terr')], ['返却の目安を過ぎた貸出', tileNum('over')], ['この90日で会えた', tileNum('met')]],
    away: () => [['完了した区域', extN()]],
    hard: () => [['手紙の候補', hardN()]],
    jg: () => (window.JGUI ? JGUI.sum() : []) // 区域カードと留守宅カードのグラフ（joukyou-graph.js）：直近30日の会えた割合
  };
  const sumHtml = a => a.filter(x => x[1] != null).map(x => `<span class="krn">${esc(x[0])} ${esc(x[1])}</span>`).join('・');
  // 状況の見出し（id・見つけ方・中身の終わり）
  function foldBlocks() {
    const out = [], panes = [document.querySelector('.apane[data-apane="status"]'), document.querySelector('.apane[data-apane="status2"]')];
    const BOX = { adDue: 'due', adSlotBox: 'slot', adAch: 'ach', adJG: 'jg', adCand: 'cand' };
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
  const ANCHOR = { adDue: 'due', adTiles: 'tiles', adSlotBox: 'slot', adAch: 'ach', adJG: 'jg', adMeet: 'meet', adCand: 'cand', adAwaySet: 'away', adAwaySlots: 'slots2', adAwayTerrs: 'terrs', adHard: 'hard' };
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
    tagRows();
    placeRows();
    if (adPane === 'status') paintChips();
    if (hit && Date.now() - hitAt > 10 * 60000) hit = '';
    applyHit();
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
  if (wideMq && wideMq.addEventListener) wideMq.addEventListener('change', () => { try { paintFolds(); } catch (e) { /* 何もしない */ } });

  window.KR = { open, go, F, PLACE };
})();
