/* =========================================================
   torikomi.js  区域係の「区域の線・取り込み」（2026-10-21）

   ・入口：係の画面 ＞ 区域 ＞「区域の線・取り込み」（一覧の上の2つのボタンの左）
   ・一覧の上に並んでいた「新しい区域の線を引く」「地図で区域の線を直す」「区域の取り込み・特別区域・アパートの登録」を、
     下から出る1つの画面にまとめる（一覧まですぐ届くように）
   ・取り込みは、変えたいものだけをえらべるようにする
       区域の線だけ（マイマップ）／拒否・注意だけ（マイマップ・エクセル）／アパートだけ／区域と家（エクセル）／
       まとめて新しくする（区域の線と拒否・注意を全部置きかえ）
   ・区域の線を消す（家・拒否・記録は残す）：区域をえらんで、線だけを消す
   ・元のボタンとファイルの入り口（#adNewTerr・#adKmlAll など）は index.html の #adMakeSrc に残し、その動きをそのまま使う

   index.html：kyoukai.js のあとに <script src="torikomi.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof setSheet !== 'function') return;

  const css = document.createElement('style');
  css.textContent = `
.tk-sec{margin:14px 0 4px;font-size:15px;color:var(--ink2);font-weight:700}
.tk-it{display:flex;align-items:center;gap:10px;width:100%;min-height:62px;border:2px solid var(--line);border-radius:12px;background:#fff;padding:8px 12px;margin:6px 0;text-align:left;font:inherit;color:var(--ink);cursor:pointer}
.tk-it:active{background:#EEF3F8}
.tk-it.primary{border-color:var(--brand)}
.tk-it .ic{flex:none;width:34px;height:34px;border-radius:9px;background:#E3ECF6;color:var(--brand);display:grid;place-items:center;font-weight:700;font-size:18px}
.tk-it .tx{flex:1;min-width:0;line-height:1.35}
.tk-it .tx b{display:block;font-size:16px}
.tk-it .tx small{display:block;font-size:13px;color:var(--ink2)}
.tk-it .chev{flex:none;color:var(--ink2);font-size:20px}
.tk-it input[type=file]{display:none}
.tk-more{border:2px solid var(--line);border-radius:12px;padding:2px 10px;margin:8px 0;background:#fff}
.tk-more summary{min-height:48px;display:flex;align-items:center;font-weight:700;cursor:pointer}
.tk-del{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--line)}
.tk-del input{width:24px;height:24px;flex:none}
.tk-del .tx{flex:1;min-width:0}
.tk-del .tx small{display:block;color:var(--ink2)}
`;
  document.head.appendChild(css);

  const item = (key, ic, title, sub, file, cls) => file
    ? `<label class="tk-it${cls ? ' ' + cls : ''}"><span class="ic" aria-hidden="true">${ic}</span><span class="tx"><b>${title}</b><small>${sub}</small></span><span class="chev" aria-hidden="true">›</span><input type="file" data-tkf="${key}"${file === 'multi' ? ' multiple' : ''}${key === 'xlsx' || key === 'dncXl' ? ' accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"' : ''}></label>`
    : `<button type="button" class="tk-it${cls ? ' ' + cls : ''}" data-tk="${key}"><span class="ic" aria-hidden="true">${ic}</span><span class="tx"><b>${title}</b><small>${sub}</small></span><span class="chev" aria-hidden="true">›</span></button>`;

  /* ---------- 区域の線・取り込み（下から出る画面） ---------- */
  function openMake() {
    if (!isAdmin()) { toast('区域係だけが使えます'); return; }
    const nT = D().territories.filter(t => !t.dummy && !isSpecial(t)).length;
    setSheet(headHtml(null, '区域の線・取り込み', `全部で ${nT}区域`) + `
      <p class="tk-sec">地図で</p>
      ${item('new', '＋', '新しい区域の線を引く', '地図をタップして、区域の線を引きます', null, 'primary')}
      ${item('fix', '✎', '区域の線を直す', '形・となりに合わせる・分ける（家の数を見ながら）・1つにする')}
      ${item('del', '−', '区域の線を消す', '線だけを消します。家・拒否・訪問の記録は残ります')}
      <p class="tk-sec">ファイルから（えらんだものだけが変わります）</p>
      ${item('lines', '線', '区域の線だけ（マイマップ）', 'ファイルにある区域の線だけを新しくします。拒否・注意・家はそのまま', 'multi')}
      ${item('pins', '拒', '拒否・注意だけ（マイマップ）', '区域の線は変えずに、ピンを拒否・注意として入れます', 'multi')}
      ${item('dncXl', '拒', '拒否だけ（エクセル・CSVの住所の一覧）', '住所から場所を調べて、拒否として入れます', 'one')}
      ${item('apt', '集', 'アパートだけ（アパートの一覧）', 'アパートの一覧から、建物と階ごとの部屋を登録します')}
      ${item('xlsx', '表', '区域と家（エクセル）', 'シートごとの住所の一覧から、区域の線と家の印をつくります', 'one')}
      <details class="tk-more"><summary>まとめて新しくする</summary>
        ${item('all', '⟳', '区域の線と拒否・注意をまとめて新しくする', '全区域のKMLをえらびます。今の区域の線と拒否を置きかえます（全部置きかえ）', 'multi')}
      </details>
      <p class="tk-sec">特別区域</p>
      ${item('special', '特', '特別区域をつくる', 'コンビニ・オートロックなどを集めて、決めた件数ずつのカードに分けます')}
      <button type="button" class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    $$('[data-tk]', S).forEach(b => b.onclick = () => go(b.dataset.tk));
    $$('[data-tkf]', S).forEach(inp => inp.onchange = e => {
      const fs = [...e.target.files]; e.target.value = '';
      if (!fs.length) return;
      closeSheet();
      const k = inp.dataset.tkf;
      if (k === 'lines' || k === 'pins' || k === 'all') { if (window.kmlKoushinStart) window.kmlKoushinStart(fs, k); return; }
      if (k === 'dncXl') { if (window.kyohiApi && window.kyohiApi.readXl) window.kyohiApi.readXl(fs[0]); return; }
      if (k === 'xlsx') readXlsxFile(fs[0]);
    });
  }
  function go(k) {
    if (k === 'new') { closeSheet(); $('#adNewTerr').click(); return; }
    if (k === 'fix') { closeSheet(); if (window.kyoukai) window.kyoukai.open(null); return; }
    if (k === 'del') { openDelLines(); return; }
    if (k === 'apt') { closeSheet(); $('#adAptImp').click(); return; }
    if (k === 'special') { openSpecialSheet(null); return; }
  }

  /* ---------- 区域の線を消す（家・拒否・記録は残す） ---------- */
  const del = { sel: new Set(), q: '' };
  function openDelLines() {
    const ts = D().territories.filter(t => !t.dummy && !isSpecial(t)).sort(byNo);
    const q = del.q.trim().normalize('NFKC');
    const shown = q ? ts.filter(t => String(t.no).startsWith(q) || String(t.name || '').normalize('NFKC').includes(q)) : ts;
    const lent = [...del.sel].map(terrById).filter(t => t && t.holder);
    setSheet(headHtml(null, '区域の線を消す', '家・拒否・訪問の記録は残ります') + `
      <p class="hint">消した区域の家は「区域の外の家」になり、あとで線を引くと、その区域に入ります。区域の割り当ての記録（S-13）は残ります。
        線を引き直すだけなら、消さずに「区域の線を直す」を使ってください。</p>
      <input type="search" id="tkDelQ" value="${esc(del.q)}" placeholder="番号・名前でさがす" aria-label="区域をさがす" style="width:100%;min-height:50px;border-radius:12px;border:2px solid var(--ink2);padding:0 12px;font-size:17px;margin:4px 0 8px">
      <div class="row"><button type="button" class="btn small" id="tkDelAll">${shown.every(t => del.sel.has(t.id)) && shown.length ? '表示中をすべて外す' : '表示中をすべてえらぶ'}</button></div>
      <div>${shown.map(t => `<label class="tk-del"><input type="checkbox" data-tkd="${t.id}"${del.sel.has(t.id) ? ' checked' : ''}>
        <span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span><span class="tx"><b>${esc(t.name || '')}</b><small>家 ${housesOf(t.id).length}件${t.holder ? `・貸出中（${esc(uname(t.holder))}さん）` : ''}</small></span></label>`).join('') || '<div class="empty">見つかりません</div>'}</div>
      ${lent.length ? `<div class="notice warn">貸し出し中の区域があります（${lent.map(t => esc(t.no)).join('・')}）。消すと、その貸し出しは終わります。</div>` : ''}
      <button type="button" class="btn danger block" id="tkDelGo"${del.sel.size ? '' : ' disabled'}>えらんだ ${del.sel.size}区域の線を消す</button>
      <button type="button" class="btn block" id="tkDelBack">もどる</button>`);
    const S = $('#sheet');
    const qi = $('#tkDelQ');
    let tm = null;
    qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { del.q = qi.value; sheetKeep = true; openDelLines(); const n = $('#tkDelQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
    $$('[data-tkd]', S).forEach(c => c.onchange = () => { if (c.checked) del.sel.add(c.dataset.tkd); else del.sel.delete(c.dataset.tkd); sheetKeep = true; openDelLines(); });
    $('#tkDelAll').onclick = () => { const all = shown.length && shown.every(t => del.sel.has(t.id)); shown.forEach(t => { if (all) del.sel.delete(t.id); else del.sel.add(t.id); }); sheetKeep = true; openDelLines(); };
    $('#tkDelBack').onclick = () => { del.sel.clear(); del.q = ''; openMake(); };
    $('#tkDelGo').onclick = async () => {
      const ids = [...del.sel].filter(id => terrById(id));
      if (!ids.length) return;
      const nos = ids.map(id => terrById(id).no).sort(cmpNo);
      if (!await ask(`区域 ${nos.slice(0, 15).join('・')}${nos.length > 15 ? ` ほか（${nos.length}区域）` : ''} の線を消します。\n家・拒否・訪問の記録は残ります。よろしいですか？`, { ok: '線を消す' })) return;
      closeSheet();
      del.sel.clear(); del.q = '';
      commit(`区域 ${nos.length}つの線を消しました（家は残しました）`, () => ids.forEach(id => deleteTerrData(id, false)));
    };
  }

  /* ---------- 入口 ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#adMake');
    if (b) openMake();
  });
  window.torikomi = { open: openMake, delLines: openDelLines };
})();
