/* =========================================================
   gaikokugo.js  外国語の家（2026-11-08・GK）

   ・家の編集の種別「外国語」と言語（英語・中国語・ネパール語・スペイン語・韓国語・タガログ語・手話）
     データと判定は app.js（D().langs・LANGS・langNo・dncAt・kindChips・setLang）
   ・ここは区域係の画面 ＞ 区域 ＞ 家の印 の「外 外国語」：
       ① 言語ごとに「区域カードで訪問する／しない」（係の設定 langSkip）
       ② 言語ごと → 区域ごとの一覧（住所は地番の地図から・地図で見る）
       ③ 言語ごとの一覧を送る（外国語の会衆に知らせるとき。住所と地図のリンクだけ）
   ・個人情報：言語は区域係だけが見る（サーバーが係以外に渡さない）。手話は障害を示すことがあり、
     言語は国籍の推測につながるため。一覧を送るときも、名前やメモは入れない（もともと持っていない）

   index.html：<script src="kyohi.js"></script> と chui.js の次に <script src="gaikokugo.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof LANGS === 'undefined') return;

  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.132')) {
    CHANGELOG.unshift({ v: '2026.13.132', items: [
      ['外', '家の編集の「種別」に「外国語」を足しました。言葉が通じない家を訪ねたときに付けて、何語かをえらびます（英語・中国語・ネパール語・スペイン語・韓国語・タガログ語・手話）'],
      ['外', '地図では、外国語の家に「外」の印が出ます']
    ] });
  }

  const st = document.createElement('style');
  st.textContent = `
  .ch-seg.four{grid-template-columns:repeat(4,1fr)}
  .ch-seg.four button{flex-direction:column;gap:2px;font-size:14px;line-height:1.15;min-height:58px;padding:0 2px}
  /* 外国語の印：ほかの種別（会社の青・事業所の緑など）とまぎれない赤紫。白い字で頭文字（区域係）か「外」（2026-11-08 見やすさの直し） */
  .kb.k-lang,.pin .kb.k-lang{background:#AD1457;color:#fff}
  .kb.k-lang .lg{font-style:normal;font-size:13px;font-weight:900;line-height:1;color:#fff}
  /* 部屋のボタンでは、角に出すと上の部屋の印に見えるので、拒・ー と同じく名前の前に並べる（2026-11-08） */
  .uchip .kb.k-lang{position:static;display:inline-grid;vertical-align:-3px;width:20px;height:20px;margin-right:3px;border-width:0;box-shadow:none}
  .uchip .kb.k-lang .lg{font-size:12px}
  .unit .kb.k-lang .lg{font-size:14px}
  .langpick{margin:6px 0 4px;padding:8px 10px;border:2px solid #AD145755;border-radius:12px;background:#FCE4EC66}
  .langpick .q{margin-top:0}
  .lgset{display:grid;gap:6px;margin:6px 0 12px}
  .lgset .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border:1.5px solid var(--line);border-radius:12px;background:#fff}
  .lgset .row b{font-size:16px}
  .lgset .tg{display:flex;gap:4px}
  .lgset .tg button{min-height:44px;min-width:76px;border-radius:10px;border:2px solid var(--line);background:#fff;font:inherit;font-weight:700;color:var(--ink)}
  .lgset .tg button[aria-pressed="true"]{border-color:#00838F;background:#00838F;color:#fff}
  .lgset .tg button.no[aria-pressed="true"]{border-color:#6B7280;background:#6B7280}
  .lgrow .ad{display:block;color:var(--ink2);font-size:13px}
  `;
  document.head.appendChild(st);

  /* 外国語の家・部屋の一覧（区域係の端末だけ言語が分かる）。もうない家・部屋の印は出さない */
  function langEntries() {
    const out = [], m = D().langs || {};
    for (const k in m) {
      const v = m[k]; if (!v || !v.l || LANG_IDX[v.l] === undefined) continue;
      const [hid, unit] = parseKey(k), h = houseById(hid);
      if (!h || (unit ? !(h.type === 'apt' && h.units.includes(unit)) : h.type === 'apt')) continue;
      out.push({ k, l: v.l, at: v.at, h, unit, tid: h.terrId || null });
    }
    return out;
  }
  window.langCount = () => langEntries().length;

  const nameOf = e => {
    const h = e.h;
    if (h.type === 'apt') return `${h.label || '集合住宅'}　${unitTitle(h, e.unit)}`;
    return h.label || '一戸建て';
  };

  /* 住所（地番）：その家の場所が入る地番の土地を、地番の地図（chiban/）から探す。端末の中だけで調べる（住所を外に送らない） */
  const ADDR = new Map();
  async function addrOf(e) {
    if (ADDR.has(e.h.id)) return ADDR.get(e.h.id);
    const t = e.tid ? terrById(e.tid) : null;
    const names = typeof terrAza === 'function' ? terrAza(t).map(a => a.n) : [];
    let a = '';
    try { a = window.chibanAt ? (await window.chibanAt(e.h.lat, e.h.lng, names)) || '' : ''; } catch (err) { a = ''; }
    ADDR.set(e.h.id, a);
    return a;
  }
  const mapUrl = h => `https://www.google.com/maps?q=${Number(h.lat).toFixed(6)},${Number(h.lng).toFixed(6)}`;

  const ui = { open: new Set() };
  function skipBits() { return Number(D().settings.langSkip) || 0; }

  window.renderLangAdmin = function (box) {
    const es = langEntries();
    const byL = new Map(LANGS.map(([l]) => [l, []]));
    es.forEach(e => byL.get(e.l).push(e));
    const bits = skipBits();
    box.insertAdjacentHTML('beforeend', `
      <h2 class="sec">外国語の家</h2>
      <p class="hint">家の編集の「種別」で「外国語」をえらんだ家・部屋です。言語は区域係だけに見えます（ほかの人の地図には「外」とだけ出ます）。</p>
      <p class="q">区域カードで訪問しますか</p>
      <p class="hint">「しない」にした言語の家は、地図で灰色の「ー」になり、区域カードの数・留守宅・おすすめから外れます。外国語の会衆が回るときに使います。変えるとすぐ全員に効き、もどせます。</p>
      <div class="lgset">${LANGS.map(([l, nm], i) => { const no = !!(bits & (1 << i)); return `<div class="row"><b>${esc(nm)}<small class="muted"> ${byL.get(l).length}件</small></b>
        <span class="tg" role="group" aria-label="${esc(nm)}の家を区域カードで訪問するか"><button type="button" data-lgset="${i}" data-v="0" aria-pressed="${!no}">訪問する</button><button type="button" class="no" data-lgset="${i}" data-v="1" aria-pressed="${no}">しない</button></span></div>`; }).join('')}</div>
      ${!es.length ? '<p class="dnc-none">外国語の家はまだありません。</p>' : LANGS.filter(([l]) => byL.get(l).length).map(([l, nm]) => {
        const list = byL.get(l).sort((a, b) => cmpNo((terrById(a.tid) || {}).no || '', (terrById(b.tid) || {}).no || '') || nameOf(a).localeCompare(nameOf(b), 'ja', { numeric: true }));
        return `<details class="dncg"${ui.open.has(l) ? ' open' : ''} data-lgg="${l}"><summary><span class="stamp sm">${esc(LANGS[LANG_IDX[l]][2])}</span><span class="nm">${esc(nm)}</span><span class="cnt">${list.length}件</span></summary>
          ${list.map(e => { const t = e.tid ? terrById(e.tid) : null; return `<button type="button" class="dncrow lgrow" data-lgk="${esc(e.k)}"><i class="pin st-new">外</i><span class="tx"><b data-notr>${t ? `区域${esc(t.no)}　` : ''}${esc(nameOf(e))}</b><small><span class="ad" data-lgad="${esc(e.h.id)}">住所を調べています…</span>${e.at ? fmtDay(e.at) : ''}</small></span><span class="chev" aria-hidden="true">›</span></button>`; }).join('')}
          <button type="button" class="btn block" data-lgsend="${l}">${esc(nm)}の一覧を送る（住所と地図）</button></details>`;
      }).join('')}`);
    $$('[data-lgset]', box).forEach(b => b.onclick = () => {
      const i = Number(b.dataset.lgset), on = b.dataset.v === '1', cur = skipBits();
      const v = on ? (cur | (1 << i)) : (cur & ~(1 << i));
      if (v === cur) return;
      D().settings.langSkip = v; Store.save(); renderAll();
      toast(`${LANGS[i][1]}の家を、区域カードで${on ? '訪問しない' : '訪問する'}ようにしました`);
    });
    $$('[data-lgg]', box).forEach(d => {
      const fill = () => $$('[data-lgad]', d).forEach(async sp => {
        const e = es.find(x => x.h.id === sp.dataset.lgad); if (!e) return;
        const a = await addrOf(e);
        sp.textContent = a || '住所は分かりません（地図で見てください）';
      });
      if (d.open) fill();
      d.addEventListener('toggle', () => { if (d.open) { ui.open.add(d.dataset.lgg); fill(); } else ui.open.delete(d.dataset.lgg); });
    });
    $$('[data-lgk]', box).forEach(b => b.onclick = () => openLangDetail(b.dataset.lgk));
    $$('[data-lgsend]', box).forEach(b => b.onclick = () => sendList(b.dataset.lgsend));
  };

  function openLangDetail(k) {
    const e = langEntries().find(x => x.k === k);
    if (!e) { toast('この印は、もうありません'); renderAll(); return; }
    const t = e.tid ? terrById(e.tid) : null;
    setSheet(headHtml(t, '外国語の' + (e.unit ? '部屋' : '家'), t ? esc(t.name || '') : '') + `
      <p><b data-notr>${esc(nameOf(e))}</b></p>
      <p>言語：<b>${esc(langName(e.l))}</b>${e.at ? `<small class="muted">（${fmtDay(e.at)}）</small>` : ''}</p>
      <p class="muted" id="lgAd">住所を調べています…</p>
      <button type="button" class="btn block" id="lgMap">地図で見る</button>
      <p class="hint">言語を変える・外すときは、家の画面の「この家を編集」（部屋は「この部屋の編集」）の種別で変えます。</p>
      <button type="button" class="btn block" data-close>閉じる</button>`);
    addrOf(e).then(a => { const el = $('#lgAd'); if (el) el.textContent = a ? '住所（地番）：' + a : '住所は分かりません'; });
    $('#lgMap').onclick = () => { closeSheet(); goTo(e.h.id, e.unit); };
  }

  async function sendList(l) {
    const es = langEntries().filter(e => e.l === l);
    if (!es.length) return;
    toast('一覧を作っています…');
    const lines = [];
    for (const e of es) {
      const t = e.tid ? terrById(e.tid) : null, a = await addrOf(e);
      lines.push(`・${t ? '区域' + t.no + '　' : ''}${a || '住所不明'}${e.h.type === 'apt' ? '　' + (e.h.label || '集合住宅') + ' ' + unitTitle(e.h, e.unit) : ''}\n  ${mapUrl(e.h)}`);
    }
    const text = `${langName(l)}の家（${es.length}件）\n${lines.join('\n')}`;
    if (navigator.share) { navigator.share({ title: `${langName(l)}の家`, text }).catch(() => {}); return; }
    if (typeof copyText === 'function') { await copyText(text); toast('一覧をコピーしました。メールなどに貼りつけてください'); }
  }
})();
