/* =========================================================
   kyohi.js  係の画面の「拒否」（2026-10-17）

   ・入口：係の画面 ＞ 区域 ＞［一覧］［状況］［拒否］［期限の地図］の「拒否」
   ・一覧：区域ごとにたたんで出す（「区域12　拒否5件」の行を押すと開く）。上に「すべて／要確認」と検索
           奉仕者が訪問で記録した拒否も、係が取り込んだ・追加した拒否も、同じ一覧に入る
           1件を押すと、くわしい画面（地図で見る・家をえらび直す・住所を直す・外す）
   ・取り込み：
       エクセル … 住所の列だけを読む（見出し「住所」など。見出しがなければ、住所らしいセルをさがす）。
                   区域番号の列か、シート名が区域番号なら、その区域にする。なければ地図の区域の線で決める。
                   住所の文字だけを国土地理院の住所検索に送り、場所を調べる。
       マイマップ … KML／KMZ のピン（場所が正確）。えらんだレイヤーのピンだけ。
                   ピンの名前・説明は、住所の形のときだけ残す（人の名前などは残さない）
       どちらも、近くに家の印が1軒だけなら、その家に自動でつなぐ（「自動」の目印。あとで確かめる）。
       迷うときは「場所だけの拒否」として地図に赤い点線の印を出し、係が地図で家をタップしてつなぐ
   ・係の追加：「＋ 地図でえらぶ」（家をタップ → 拒否。続けてえらべる。家の印がない所は、その場所に印を置く）
               「＋ 住所で追加」（住所を入れる → その場所の地図で家をタップ）
   ・要確認（自動でつないだ・場所だけ・場所が分からない）は「地図で順に確かめる」で、地図の上で1件ずつ片づけられる
   ・データ：D().dnc（キーは「家id|部屋」か「pin:…」。値の形は index.html の dncDrop の上の説明）
   ・奉仕者の画面：場所だけの拒否も地図に赤い点線の印で出る（押すと「このあたりに拒否の家があります」と住所）

   index.html：<script src="naoshi.js"></script> の次に <script src="kyohi.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof isPinKey !== 'function') return;

  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.10')) {
    CHANGELOG.unshift({ v: '2026.13.10', items: [
      ['拒', '区域係の画面の「区域」に「拒否」の一覧ができました（エクセルの住所・マイマップのピンから取り込めます）'],
      ['拒', '家の印とまだつながっていない拒否も、地図に赤い点線の印で出るようになりました']
    ] });
  }

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .dnc-sum{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:2px 0 10px}
  .dnc-sum button{min-height:64px;border-radius:12px;border:2px solid var(--line);background:#fff;font:inherit;color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2;padding:4px}
  .dnc-sum button b{font-size:24px}
  .dnc-sum button span{font-size:14px;font-weight:700}
  .dnc-sum button[aria-pressed="true"]{border-color:var(--brand);background:var(--terr-soft);box-shadow:inset 0 0 0 1px var(--brand)}
  .dnc-sum button.chk b{color:var(--draw)}
  .dnc-sum button.chk.zero b{color:var(--ink2)}
  .dnc-add{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .dnc-add .btn{white-space:normal;line-height:1.2;padding:0 8px}
  .dnc-imp{margin:10px 0 4px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:0 12px}
  .dnc-imp summary{min-height:48px;display:flex;align-items:center;font-weight:700;cursor:pointer}
  .dnc-imp .row{margin:4px 0 10px}
  .dnc-imp .btn{white-space:normal;line-height:1.2}
  .dnc-q{width:100%;min-height:50px;font-size:17px;border:2px solid var(--line);border-radius:12px;padding:0 12px;margin:10px 0 4px;background:#fff;color:var(--ink)}
  .dnc-review{width:100%;margin:6px 0 2px;border-color:var(--draw);color:var(--draw);background:#FFF7F2}
  .dncg{border:1px solid var(--line);border-radius:12px;background:#fff;margin:8px 0;overflow:hidden}
  .dncg>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:8px 10px;min-height:62px;cursor:pointer}
  .dncg>summary::-webkit-details-marker{display:none}
  .dncg>summary .stamp{width:44px;height:44px;font-size:19px}
  .dncg>summary .nm{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dncg>summary .cnt{font-weight:700;white-space:nowrap}
  .dncg>summary .ck{background:#FFF1E8;color:var(--draw);border-radius:99px;padding:2px 8px;font-size:13px;font-weight:700;white-space:nowrap}
  .dncg>summary::after{content:'›';font-size:28px;line-height:1;color:var(--ink2);transition:transform .15s}
  .dncg[open]>summary::after{transform:rotate(90deg)}
  .dncg[open]>summary{border-bottom:1px solid var(--line);background:#F7FAF9}
  .dncrow{display:flex;align-items:center;gap:10px;width:100%;border:0;border-bottom:1px solid #E6ECE9;background:#fff;font:inherit;color:inherit;text-align:left;padding:10px;min-height:64px;cursor:pointer}
  .dncrow:last-child{border-bottom:0}
  .dncrow:active{background:var(--terr-soft)}
  .dncrow .pin{flex:none;width:30px;height:30px;font-size:14px;border-width:2px}
  .dncrow .tx{flex:1;min-width:0;line-height:1.35}
  .dncrow .tx b{display:block;font-size:16px;word-break:break-all}
  .dncrow .tx small{display:block;color:var(--ink2);font-size:13px}
  .dncrow .chev{font-size:26px;color:var(--ink2)}
  .dtag{display:inline-block;border-radius:6px;padding:0 6px;margin-right:4px;font-size:12px;font-weight:700;line-height:1.6}
  .dtag.auto{background:#FFF4D6;color:#6B4200}
  .dtag.pin{background:#FFF1E8;color:var(--draw)}
  .dtag.nopos{background:#FDECEC;color:#8B1A1A}
  .dnc-none{text-align:center;color:var(--ink2);padding:24px 8px}
  .pin.dncpin{border-style:dashed;border-color:#fff;box-shadow:0 0 0 2px var(--ref),0 1px 3px #0006}
  .pin.dncpin.appx{opacity:.85}
  .pin.dncpin.cur{box-shadow:0 0 0 4px var(--draw),0 1px 3px #0006}
  .dnchead{display:flex;gap:12px;align-items:flex-start;margin:6px 0 10px}
  .dnchead .pin{flex:none}
  .dnchead b{font-size:19px;word-break:break-all;display:block}
  .dnchead small{color:var(--ink2)}
  .dncmeta{margin:6px 0 10px;color:var(--ink2);font-size:15px}
  .dncbar p{margin:0;line-height:1.45}
  .dncbar .addr{font-size:17px;word-break:break-all}
  .dncbar .row .btn{flex:1 1 auto}
  .dncbar .prog{float:right;font-size:13px;color:var(--ink2);font-weight:700}
  .dncfold{margin:8px 0}
  .dncfold summary{cursor:pointer;color:var(--ink2);min-height:40px;display:flex;align-items:center}
  .dncfold ul{margin:4px 0;padding-left:20px;max-height:40vh;overflow:auto}
  .dnc-flist label.check{display:flex;gap:10px;align-items:center;min-height:52px;border-bottom:1px solid #E6ECE9}
  .dnc-unit{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;margin:10px 0}
  .dnc-unit button{min-height:56px;border-radius:12px;border:2px solid var(--ink);background:#fff;font:inherit;font-weight:700;color:var(--ink)}
  .dnc-sel{width:100%;min-height:50px;font-size:17px;border:2px solid var(--line);border-radius:12px;padding:0 10px;background:#fff;color:var(--ink)}
  .dnc-unit button:disabled{border-color:var(--ref);background:var(--ref-bg);color:#8B1A1A}
  `;
  document.head.appendChild(css);

  const SRC = { xl: 'エクセル', kml: 'マイマップ', adm: '係が追加' };
  const now = () => new Date().toISOString();
  const ui = { q: '', filter: 'all', open: new Set() };

  /* =========================================================
     一覧のもとになるデータ
     ========================================================= */
  function refusedAt(k) {
    let at = '';
    visitsOf(k).forEach(v => { if (v.result === 'refused' && v.at > at) at = v.at; });
    return at;
  }
  function entryOf(k) {
    const raw = D().dnc[k];
    if (raw === undefined) return null;
    const v = raw && typeof raw === 'object' ? raw : {};
    if (isPinKey(k)) {
      const has = v.lat != null && isFinite(v.lat);
      const tid = dncTerrOf(v);
      return { k, v, h: null, unit: '', tid, no: v.no || '', lat: has ? v.lat : null, lng: has ? v.lng : null, state: has ? 'pin' : 'nopos', at: v.at || '' };
    }
    const [hid, unit] = parseKey(k), h = houseById(hid);
    if (!h) return null; // 家がもう無い（ほかの端末で消えた）
    return { k, v, h, unit, tid: h.terrId || null, no: '', lat: h.lat, lng: h.lng, state: v.auto ? 'auto' : 'ok', at: v.at || refusedAt(k) };
  }
  function allEntries() {
    const out = [];
    for (const k in D().dnc) { const e = entryOf(k); if (e) out.push(e); }
    return out;
  }
  const isCheck = e => e.state !== 'ok';
  function placeName(e) {
    if (!e.h) return '';
    const h = e.h;
    if (h.type === 'apt') return `${h.label || (h.units.length > 1 ? '集合住宅' : '建物')}　${e.unit ? unitTitle(h, e.unit) : ''}`.trim();
    return h.label || '一戸建て';
  }
  const titleOf = e => e.v.a || placeName(e) || '（住所の記録なし）';
  function srcText(e) {
    const s = SRC[e.v.s] || '訪問で記録';
    return e.at ? `${s}・${fmtDay(e.at)}` : s;
  }
  function stateTag(e) {
    if (e.state === 'auto') return '<span class="dtag auto">自動でつないだ</span>';
    if (e.state === 'pin') return `<span class="dtag pin">${e.v.appx ? '場所はだいたい' : '家とつながっていない'}</span>`;
    if (e.state === 'nopos') return '<span class="dtag nopos">場所が分からない</span>';
    return '';
  }
  const sortEntries = list => list.sort((a, b) => (a.v.a || placeName(a)).localeCompare(b.v.a || placeName(b), 'ja', { numeric: true }));
  /* 区域ごとにまとめる（区域番号の順。区域の分からないものは最後） */
  function groupsOf(list) {
    const g = new Map();
    list.forEach(e => {
      const key = e.tid ? 't:' + e.tid : e.no ? 'n:' + e.no : 'x';
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(e);
    });
    const arr = [...g.entries()].map(([key, es]) => {
      const t = key.startsWith('t:') ? terrById(key.slice(2)) : null;
      const no = t ? t.no : key.startsWith('n:') ? key.slice(2) : '';
      return { key, t, no, name: t ? t.name : no ? '（この番号の区域の線がありません）' : '区域が分からない拒否', es: sortEntries(es) };
    });
    return arr.sort((a, b) => (a.no ? 0 : 1) - (b.no ? 0 : 1) || cmpNo(a.no, b.no));
  }
  const reviewList = () => {
    const out = [];
    groupsOf(allEntries().filter(isCheck)).forEach(g => g.es.forEach(e => out.push(e.k)));
    return out;
  };

  /* =========================================================
     係の画面 ＞ 区域 ＞ 拒否
     ========================================================= */
  function renderDncAdmin() {
    const box = $('#adDnc');
    if (!box || !isAdmin()) return;
    const all = allEntries(), nCheck = all.filter(isCheck).length;
    if (ui.filter === 'check' && !nCheck) ui.filter = 'all';
    const q = ui.q.trim().normalize('NFKC').toLowerCase();
    let list = ui.filter === 'check' ? all.filter(isCheck) : all;
    const gs = groupsOf(list);
    let shown = gs;
    if (q) {
      shown = gs.map(g => {
        const hitG = String(g.no).toLowerCase() === q || String(g.name).normalize('NFKC').toLowerCase().includes(q);
        const es = hitG ? g.es : g.es.filter(e => (titleOf(e) + ' ' + placeName(e)).normalize('NFKC').toLowerCase().includes(q));
        return Object.assign({}, g, { es });
      }).filter(g => g.es.length);
    }
    const autoOpen = !!q || ui.filter === 'check' || shown.length === 1;
    const keepFocus = document.activeElement && document.activeElement.id === 'dncQ';
    box.innerHTML = `
      <h2 class="sec">拒否の家</h2>
      <div class="dnc-sum" role="group" aria-label="しぼりこみ">
        <button type="button" data-dncf="all" aria-pressed="${ui.filter === 'all'}"><b>${all.length}</b><span>すべて</span></button>
        <button type="button" data-dncf="check" class="chk${nCheck ? '' : ' zero'}" aria-pressed="${ui.filter === 'check'}"${nCheck ? '' : ' disabled'}><b>${nCheck}</b><span>要確認（家とつなぐ）</span></button>
      </div>
      ${nCheck ? `<button type="button" class="btn block dnc-review" id="dncReview">地図で順に確かめる（${nCheck}件）</button>` : ''}
      <div class="dnc-add">
        <button type="button" class="btn primary" id="dncAddMap">＋ 地図でえらぶ</button>
        <button type="button" class="btn" id="dncAddAddr">＋ 住所で追加</button>
      </div>
      <details class="dnc-imp"${all.length ? '' : ' open'}><summary>エクセル・マイマップから取り込む</summary>
        <div class="row">
          <label class="btn">エクセル（住所の一覧）<input type="file" id="dncXl" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
          <!-- iPhoneでは accept に .kml を書くとファイルを選べないことがあるため、あえて指定しない -->
          <label class="btn">マイマップ（ピン）<input type="file" id="dncKml" hidden></label>
        </div>
        <p class="hint">エクセルは<b>住所の列だけ</b>を読みます（区域番号の列やシート名があれば、その区域に入れます）。名前などほかの列は読みません。<br>
          マイマップは「KML/KMZにエクスポート」したファイルを選び、拒否のピンのレイヤーをえらびます。</p>
      </details>
      ${all.length ? `<input type="search" class="dnc-q" id="dncQ" placeholder="住所・区域番号でさがす" value="${esc(ui.q)}" aria-label="住所・区域番号でさがす">` : ''}
      <div id="dncGroups">${!all.length
        ? '<p class="dnc-none">拒否の家はまだありません。<br>奉仕者が「拒否」と記録すると、ここに入ります。</p>'
        : !shown.length ? '<p class="dnc-none">見つかりませんでした</p>'
        : shown.map(g => groupHtml(g, autoOpen || ui.open.has(g.key))).join('')}</div>`;
    if (keepFocus) { const i = $('#dncQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    bindAdmin(box);
  }
  function groupHtml(g, open) {
    const ck = g.es.filter(isCheck).length;
    const stamp = g.no ? `<span class="stamp sm${noCls(g.no)}">${esc(g.no)}</span>` : '<span class="stamp sm">？</span>';
    return `<details class="dncg" data-g="${esc(g.key)}"${open ? ' open' : ''}><summary>${stamp}<span class="nm" data-notr>${esc(g.name)}</span>
      ${ck ? `<span class="ck">要確認${ck}</span>` : ''}<span class="cnt">${g.es.length}件</span></summary>
      ${open ? rowsHtml(g.es) : ''}</details>`;
  }
  const rowsHtml = es => es.map(e => `<button type="button" class="dncrow" data-dk="${esc(e.k)}">
      <i class="pin st-dnc${isPinKey(e.k) ? ' dncpin' : ''}">拒</i>
      <span class="tx"><b data-notr>${esc(titleOf(e))}</b><small>${stateTag(e)}${e.v.a && e.h ? `<span data-notr>${esc(placeName(e))}</span>・` : ''}${esc(srcText(e))}</small></span>
      <span class="chev" aria-hidden="true">›</span></button>`).join('');

  function bindAdmin(box) {
    $$('[data-dncf]', box).forEach(b => b.onclick = () => { ui.filter = b.dataset.dncf; renderDncAdmin(); });
    const qi = $('#dncQ');
    if (qi) {
      let tm = null;
      qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { ui.q = qi.value; renderDncAdmin(); }, 250); };
    }
    $$('.dncg', box).forEach(d => d.addEventListener('toggle', () => {
      const key = d.dataset.g;
      if (d.open) {
        ui.open.add(key);
        if (!d.querySelector('.dncrow')) { // 開いたときに中身を作る（たくさんあっても軽いように）
          const g = groupsOf(ui.filter === 'check' ? allEntries().filter(isCheck) : allEntries()).find(x => x.key === key);
          if (g) { d.insertAdjacentHTML('beforeend', rowsHtml(g.es)); bindRows(d); }
        }
      } else ui.open.delete(key);
    }));
    bindRows(box);
    const on = (id, f) => { const el = $('#' + id); if (el) el.onclick = f; };
    on('dncAddMap', () => startAdd({}));
    on('dncAddAddr', openAddrSheet);
    on('dncReview', () => startReview(reviewList(), 0));
    const xl = $('#dncXl'); if (xl) xl.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) readXl(f); };
    const km = $('#dncKml'); if (km) km.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) readKml(f); };
  }
  function bindRows(root) { $$('[data-dk]', root).forEach(b => b.onclick = () => openDetail(b.dataset.dk)); }

  /* ---------- 1件のくわしい画面 ---------- */
  function openDetail(k) {
    const e = entryOf(k);
    if (!e) { toast('この拒否は、もうありません'); renderDncAdmin(); return; }
    const t = e.tid ? terrById(e.tid) : null;
    const note = e.state === 'auto'
      ? `<div class="notice warn"><b>住所から、近くの家に自動でつなぎました。</b><br>地図で、この家で合っているか確かめてください。
          <div class="actions"><button class="btn small primary" id="ddOk">合っている</button><button class="btn small" id="ddPick">ちがう家をえらぶ</button></div></div>`
      : e.state === 'pin'
        ? `<div class="notice warn"><b>まだ家の印とつながっていません。</b><br>地図には${e.v.appx ? '住所から調べた<b>だいたいの場所</b>' : 'この場所'}に、赤い点線の拒否の印を出しています。
          <div class="actions"><button class="btn small primary" id="ddPick">地図で家をえらぶ</button></div></div>`
        : e.state === 'nopos'
          ? `<div class="notice warn"><b>住所から場所が分かりませんでした。</b><br>地図には出ていません。地図で家をえらんでください。
            <div class="actions"><button class="btn small primary" id="ddPick">地図で家をえらぶ</button></div></div>`
          : '';
    setSheet(headHtml(t, '拒否の家', t ? esc(t.name) : e.no ? `区域${esc(e.no)}` : '') + `
      <div class="dnchead"><i class="pin st-dnc${isPinKey(k) ? ' dncpin' : ''}">拒</i><div><b data-notr>${esc(titleOf(e))}</b>${e.v.a && e.h ? `<small data-notr>${esc(placeName(e))}</small>` : ''}</div></div>
      ${note}
      <p class="dncmeta">登録：${esc(srcText(e))}</p>
      <label class="field"><span>住所（メモ）</span><input type="text" id="ddA" maxlength="120" value="${esc(e.v.a || '')}" placeholder="例：豊見城市字高安123"></label>
      <button type="button" class="btn block" id="ddSaveA" hidden>住所を保存する</button>
      ${e.lat != null ? '<button type="button" class="btn block" id="ddMap">地図で見る</button>' : ''}
      ${e.state === 'ok' ? '<button type="button" class="btn block" id="ddPick">ちがう家につなぎ直す</button>' : ''}
      <button type="button" class="btn block danger" id="ddDel">拒否を外す</button>
      <button type="button" class="btn block" data-close>閉じる</button>`);
    const ai = $('#ddA'), sv = $('#ddSaveA');
    ai.oninput = () => { sv.hidden = ai.value.trim() === (e.v.a || ''); };
    sv.onclick = () => {
      const a = ai.value.trim().slice(0, 120);
      commit(a ? '住所を保存しました' : '住所を消しました', () => {
        const cur = D().dnc[k]; if (cur === undefined) return;
        const o = cur && typeof cur === 'object' ? Object.assign({}, cur) : {};
        if (a) o.a = a; else delete o.a;
        D().dnc[k] = Object.keys(o).length ? o : true;
      });
      openDetail(k);
    };
    const on = (id, f) => { const el = $('#' + id); if (el) el.onclick = f; };
    on('ddOk', () => { confirmAuto(k); closeSheet(); });
    on('ddPick', () => startReview([k], 0));
    on('ddMap', () => { closeSheet(); showOnMap(e); });
    on('ddDel', async () => {
      if (!await ask('この家の拒否を外しますか？', { title: 'この家の拒否を外しますか？', body: '地図の拒否の印も消えます。訪問の記録は残ります。まちがえたときは、お知らせの「取り消す」でもどせます。', ok: '外す' })) return;
      closeSheet();
      commit('拒否を外しました', () => { delete D().dnc[k]; });
    });
  }
  function confirmAuto(k) {
    commit('この家で確かめました', () => {
      const cur = D().dnc[k];
      if (cur && typeof cur === 'object') { const o = Object.assign({}, cur); delete o.auto; D().dnc[k] = o; }
    });
  }

  /* =========================================================
     地図
     ========================================================= */
  let pinLayer = null, flashLayer = null;
  function renderDncPins() {
    if (typeof map === 'undefined' || !map) return;
    if (!pinLayer) pinLayer = L.layerGroup().addTo(map);
    pinLayer.clearLayers();
    if (mode === 'draw' && typeof drawTap !== 'undefined' && drawTap === 'line') return;
    if (map.getZoom() < 15) return;
    const b = map.getBounds().pad(0.2), cur = pick && pick.cur;
    dncPins().forEach(([k, v]) => {
      if (!b.contains([v.lat, v.lng])) return;
      const m = L.marker([v.lat, v.lng], {
        icon: L.divIcon({ className: '', html: `<div class="pin st-dnc dncpin${v.appx ? ' appx' : ''}${cur === k ? ' cur' : ''}">拒</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
        title: '拒否', zIndexOffset: 500, keyboard: false
      });
      m.on('click', () => pinTap(k));
      m.addTo(pinLayer);
    });
  }
  function pinTap(k) {
    if (pick) {
      if (pick.kind === 'review' && pick.cur === k) { toast('この印の家を、地図の家の印からタップしてください'); return; }
      toast('ここには、もう拒否の印があります');
      return;
    }
    if (isAdmin()) { openDetail(k); return; }
    const v = D().dnc[k] || {}, t = dncTerrOf(v) ? terrById(dncTerrOf(v)) : null;
    setSheet(headHtml(t, '拒否の家', '') + `
      <div class="notice refnote"><b>このあたりに、訪問を断られた家があります。</b><br>訪問しないでください。</div>
      ${v.a ? `<p>住所：<b data-notr>${esc(v.a)}</b></p>` : ''}
      <p class="hint">${v.appx ? '住所から調べた、だいたいの場所に印を出しています。' : '地図の家の印とまだつながっていないため、この印で知らせています。'}</p>
      <button type="button" class="btn primary block" data-close>わかりました</button>`);
  }
  function flashAt(lat, lng) {
    if (!map) return;
    if (flashLayer) map.removeLayer(flashLayer);
    flashLayer = L.circleMarker([lat, lng], { radius: 26, color: '#C2410C', weight: 4, fill: false, interactive: false }).addTo(map);
    const fl = flashLayer;
    setTimeout(() => { if (flashLayer === fl) { map.removeLayer(fl); flashLayer = null; } }, 5000);
  }
  function goMap(lat, lng, z) {
    showView('map');
    setTimeout(() => { if (lat != null) map.setView([lat, lng], z || 19); }, 120); // 地図を初めて開いたとき、全体に合わせる動きのあとで
  }
  function showOnMap(e) {
    goMap(e.lat, e.lng, 19);
    setTimeout(() => flashAt(e.lat, e.lng), 200);
  }

  /* ---------- 地図でえらぶ（追加・つなぐ・順に確かめる） ----------
     pick = { kind: 'add', a?（住所で追加のとき）, n（追加した数） }
          | { kind: 'review', keys, i, cur（今のキー）, done（片づけた数） } */
  let pick = null, bar = null, ring = null;
  function barEl() {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'modebar dncbar';
      bar.id = 'dncBar';
      $('#view-map').appendChild(bar);
      bar.addEventListener('click', e => { const b = e.target.closest('[data-dncb]'); if (b) barAct(b.dataset.dncb); });
    }
    return bar;
  }
  function setBar(html) { const b = barEl(); b.innerHTML = html; b.hidden = false; }
  function setRing(lat, lng, r) {
    if (ring) { map.removeLayer(ring); ring = null; }
    if (lat == null) return;
    ring = r ? L.circle([lat, lng], { radius: r, color: '#C2410C', weight: 3, dashArray: '6 6', fill: true, fillOpacity: 0.06, interactive: false }).addTo(map)
      : L.circleMarker([lat, lng], { radius: 26, color: '#C2410C', weight: 4, fill: false, interactive: false }).addTo(map);
  }
  function pickOn() {
    if (mode !== 'normal') setMode('normal');
    document.body.classList.add('focusmode');
    $('#mapTools').hidden = true;
    setTimeout(() => map && map.invalidateSize(), 30);
  }
  function dncPickEnd(silent) {
    if (!pick) return;
    pick = null;
    if (bar) bar.hidden = true;
    if (ring && map) { map.removeLayer(ring); ring = null; }
    if (mode === 'normal') { document.body.classList.remove('focusmode'); $('#mapTools').hidden = false; }
    if (map) { setTimeout(() => map.invalidateSize(), 30); renderDncPins(); }
    if (!silent) { showView('admin'); setAdPane('dnc'); renderAdmin(); }
  }

  /* 追加：家をタップ → 拒否。家の印がない所は、その場所に印を置く */
  function startAdd(o) {
    closeSheet();
    pick = { kind: 'add', a: o.a || '', n: 0, one: !!o.a };
    showView('map');
    pickOn();
    paintAddBar();
    if (o.lat != null) setTimeout(() => { map.setView([o.lat, o.lng], o.appx ? 17 : 18); setRing(o.lat, o.lng, o.appx ? 60 : 0); }, 120);
  }
  function paintAddBar() {
    setBar(`<p>${pick.a ? `<span class="addr" data-notr><b>${esc(pick.a)}</b></span><br>` : ''}<b>拒否にする家をタップしてください。</b>
      <br><small class="muted">アパートは、そのあと部屋をえらびます。家の印がない所は、その場所をタップすると印だけ置けます。</small></p>
      <div class="row">${pick.n ? `<span class="muted">${pick.n}件 追加しました</span>` : ''}<button type="button" class="btn small primary" data-dncb="end">${pick.n ? 'おわって一覧へ' : 'やめる'}</button></div>`);
  }

  /* 順に確かめる：自動でつないだ家・場所だけの印・場所が分からないものを、1件ずつ */
  function startReview(keys, i) {
    closeSheet();
    pick = { kind: 'review', keys: keys.slice(), i: i || 0, done: 0, cur: null };
    showView('map');
    pickOn();
    setTimeout(reviewShow, 120);
  }
  function reviewShow() {
    if (!pick || pick.kind !== 'review') return;
    while (pick.i < pick.keys.length) { // 消えた・もう片づいたものはとばす
      const e = entryOf(pick.keys[pick.i]);
      if (e && isCheck(e)) break;
      if (e && pick.keys.length === 1) break; // 1件だけ（つなぎ直し）のときは、片づいていても出す
      pick.i++;
    }
    if (pick.i >= pick.keys.length) {
      pick.cur = null; setRing(null);
      renderDncPins();
      setBar(`<p><b>✓ ${pick.done ? `${pick.done}件を確かめました。` : ''}${pick.keys.length > 1 ? '確かめる拒否は、もうありません。' : ''}</b></p>
        <div class="row"><button type="button" class="btn small primary" data-dncb="end">一覧にもどる</button><button type="button" class="btn small" data-dncb="stay">地図を見る</button></div>`);
      return;
    }
    const e = entryOf(pick.keys[pick.i]);
    pick.cur = e.k;
    const left = pick.keys.length - pick.i, prog = pick.keys.length > 1 ? `<span class="prog">あと${left}件</span>` : '';
    const t = e.tid ? terrById(e.tid) : null, where = t ? `区域${esc(t.no)}　` : e.no ? `区域${esc(e.no)}　` : '';
    let msg, btns;
    if (e.state === 'auto') {
      msg = '<b>この家で合っていますか？</b><br><small class="muted">ちがうときは、正しい家の印をタップしてください。</small>';
      btns = '<button type="button" class="btn small primary" data-dncb="ok">合っている</button>';
      setRing(e.lat, e.lng, 0);
      map.setView([e.lat, e.lng], 19);
    } else if (e.state === 'pin' || (e.state === 'ok' && pick.keys.length === 1)) {
      msg = '<b>拒否の家の印をタップしてください。</b><br><small class="muted">' + (e.state === 'pin' && e.v.appx ? '点線の円は、住所から調べただいたいの場所です。' : '') + '家の印がないときは、その場所をタップすると印を動かせます。</small>';
      btns = '';
      setRing(e.lat, e.lng, e.v.appx ? 60 : 0);
      map.setView([e.lat, e.lng], e.v.appx ? 17 : 19);
    } else { // 場所が分からない
      msg = '<b>地図を動かして、拒否の家の印をタップしてください。</b><br><small class="muted">家の印がないときは、その場所をタップすると印を置けます。</small>';
      btns = '';
      setRing(null);
      if (t && okPoly(t.polygon)) fitTerr(t.id);
    }
    renderDncPins();
    setBar(`<p>${prog}<small class="muted">${where}</small><span class="addr" data-notr><b>${esc(titleOf(e))}</b></span><br>${msg}</p>
      <div class="row">${btns}${pick.keys.length > 1 ? '<button type="button" class="btn small" data-dncb="skip">とばす</button>' : ''}<button type="button" class="btn small" data-dncb="end">${pick.keys.length > 1 ? 'おわる' : 'やめる'}</button></div>`);
  }
  function reviewNext(didOne) {
    if (!pick) return;
    if (didOne) pick.done++;
    pick.i++;
    reviewShow();
  }
  function barAct(a) {
    if (!pick) { if (bar) bar.hidden = true; return; }
    if (a === 'end') { dncPickEnd(false); return; }
    if (a === 'stay') { dncPickEnd(true); return; }
    if (a === 'skip') { reviewNext(false); return; }
    if (a === 'ok' && pick.cur) { confirmAuto(pick.cur); reviewNext(true); }
  }

  /* 家をタップしたとき（index.html の onHouseTap から） */
  function dncPickHouse(id) {
    if (!pick) return false;
    const h = houseById(id); if (!h) return true;
    if (h.type === 'apt' && h.units.length) { chooseUnit(h); return true; }
    if (h.type === 'apt') { toast('部屋のない建物です。建物の編集で部屋を入れてから、えらんでください'); return true; }
    applyHouse(h, '');
    return true;
  }
  function chooseUnit(h) {
    setSheet(headHtml(terrById(h.terrId), esc(h.label || '集合住宅'), '拒否の部屋をえらんでください') + `
      <div class="dnc-unit">${h.units.map(u => `<button type="button" data-du="${esc(u)}"${D().dnc[K(h.id, u)] && !(pick && pick.cur === K(h.id, u)) ? ' disabled' : ''}>${esc(uName(h, u))}</button>`).join('')}</div>
      <p class="hint">赤い部屋は、もう拒否になっています。</p>
      <button type="button" class="btn block" data-close>やめる</button>`);
    $$('[data-du]', $('#sheet')).forEach(b => b.onclick = () => { closeSheet(); applyHouse(h, b.dataset.du); });
  }
  function applyHouse(h, unit) {
    const k = K(h.id, unit), name = h.type === 'apt' ? `${h.label || '集合住宅'} ${unitTitle(h, unit)}` : (h.label || 'この家');
    if (pick.kind === 'review') {
      const from = pick.cur;
      if (!from || !D().dnc[from]) { reviewNext(false); return; }
      if (from === k) { if (D().dnc[k].auto) confirmAuto(k); reviewNext(true); return; }
      commit(`${name}を拒否の家にしました`, () => moveTo(from, h, unit));
      reviewNext(true);
      return;
    }
    // 追加
    if (D().dnc[k]) { toast('この家は、もう拒否になっています'); return; }
    askAddr(`${esc(name)}を拒否にしますか？`, pick.a, '拒否にする', a => {
      commit(`${name}を拒否にしました`, () => {
        D().dnc[k] = Object.assign({ s: 'adm', at: now(), lat: r6(h.lat), lng: r6(h.lng) }, a ? { a } : {});
        delete D().follows[k]; delete D().released[k];
      });
      afterAdd();
    }, terrById(h.terrId));
  }
  /* 拒否を、ほかの家（部屋）に移す。移す先にもう拒否があれば、住所などをまぜる */
  function moveTo(from, h, unit) {
    const src = D().dnc[from], k = K(h.id, unit);
    const o = src && typeof src === 'object' ? Object.assign({}, src) : {};
    ['p', 'appx', 'auto', 't', 'no'].forEach(x => delete o[x]);
    o.lat = r6(h.lat); o.lng = r6(h.lng);
    const cur = D().dnc[k];
    D().dnc[k] = cur && typeof cur === 'object' ? Object.assign({}, o, cur, { a: cur.a || o.a }) : (Object.keys(o).length ? o : true);
    if (from !== k) delete D().dnc[from];
    delete D().follows[k]; delete D().released[k];
  }

  /* 家のない場所をタップしたとき（index.html の地図のタップから） */
  function dncPickClick(ll) {
    if (!pick) return false;
    if (pick.kind === 'review' && !pick.cur) return true;
    if (map.getZoom() < 17) { map.setView(ll, 18); toast('拡大しました。拒否の家の印をタップしてください'); return true; }
    const terr = terrOf(ll.lat, ll.lng), lat = Math.round(ll.lat * 1e6) / 1e6, lng = Math.round(ll.lng * 1e6) / 1e6;
    if (pick.kind === 'review') {
      const from = pick.cur, cv = D().dnc[from], isPin = isPinKey(from), move = isPin && cv && cv.lat != null;
      const q = move ? '拒否の印を、ここに動かしますか？' : 'ここに、拒否の印を置きますか？';
      ask(q, { title: q, body: '家の印がない場所です。家の印があるときは、家の印をタップしてください。', ok: move ? 'ここに動かす' : 'ここに置く', danger: false }).then(yes => {
        if (!yes || !pick) return;
        commit('拒否の印の場所を決めました', () => {
          const src = D().dnc[from]; if (src === undefined) return;
          const o = Object.assign({}, src && typeof src === 'object' ? src : {}, { p: 1, lat, lng });
          delete o.appx; delete o.auto; delete o.no;
          if (terr) o.t = terr; else delete o.t;
          if (isPin) D().dnc[from] = o; else { delete D().dnc[from]; D().dnc['pin:' + uid()] = o; }
        });
        reviewNext(true);
      });
      return true;
    }
    askAddr('ここに拒否の印を置きますか？', pick.a, 'ここに置く', a => {
      commit('拒否の印を置きました', () => {
        D().dnc['pin:' + uid()] = Object.assign({ p: 1, s: 'adm', at: now(), lat, lng }, terr ? { t: terr } : {}, a ? { a } : {});
      });
      afterAdd();
    }, terr ? terrById(terr) : null, '家の印がない場所です。家の印があるときは、家の印をタップしてください。');
    return true;
  }
  function afterAdd() {
    if (!pick) return;
    pick.n++;
    if (pick.one) { dncPickEnd(true); toast('拒否を追加しました。一覧は「係の画面」＞「区域」＞「拒否」で見られます'); return; }
    pick.a = '';
    paintAddBar();
  }
  /* 追加の確認：住所（メモ）を入れられる */
  function askAddr(title, a, okLabel, done, t, note) {
    setSheet(headHtml(t || null, title, '') + `
      ${note ? `<p class="hint">${note}</p>` : ''}
      <label class="field"><span>住所（メモ・入れなくてもよい）</span><input type="text" id="dkA" maxlength="120" value="${esc(a || '')}" placeholder="例：豊見城市字高安123"></label>
      <p class="hint">名前は入れないでください。</p>
      <button type="button" class="btn primary block" id="dkOk">${okLabel}</button>
      <button type="button" class="btn block" data-close>やめる</button>`);
    $('#dkOk').onclick = () => { const v = $('#dkA').value.trim().slice(0, 120); closeSheet(); done(v); };
  }

  /* ---------- 住所で追加 ---------- */
  function openAddrSheet() {
    setSheet(headHtml(null, '住所で拒否を追加', '') + `
      <label class="field"><span>住所</span><input type="text" id="daA" maxlength="120" placeholder="例：豊見城市字高安123" autocomplete="off"></label>
      <p class="hint">住所の場所の地図を出します。拒否の家の印をタップしてください。<br>住所の文字だけを国土地理院の住所検索に送って、場所を調べます。</p>
      <button type="button" class="btn primary block" id="daGo">地図で家をえらぶ</button>
      <button type="button" class="btn block" id="daOnly" style="white-space:normal;line-height:1.3">住所だけ登録する<br><small>（あとで地図で家とつなぐ）</small></button>
      <button type="button" class="btn block" data-close>やめる</button>`);
    const inp = $('#daA');
    const go = async onlyAddr => {
      const a = inp.value.trim().slice(0, 120);
      if (!a) { toast('住所を入れてください'); inp.focus(); return; }
      const e = parseAddr(a, defMuni([]));
      let pos = null;
      if (e) {
        toast('場所を調べています…');
        try { const g = await xlGeocode([e.q], () => {}); pos = xlPick(e, g.get(e.q)); } catch (err) { pos = null; }
        const tt = $('#toast'); if (tt && !tt.querySelector('button')) tt.hidden = true;
      }
      if (onlyAddr) {
        const terr = pos ? terrOf(pos.lat, pos.lng) : null;
        closeSheet();
        commit('拒否の住所を登録しました', () => {
          D().dnc['pin:' + uid()] = Object.assign({ p: 1, s: 'adm', at: now(), a }, pos ? { lat: r6(pos.lat), lng: r6(pos.lng) } : {}, pos && !pos.good ? { appx: 1 } : {}, terr ? { t: terr } : {});
        });
        renderDncAdmin();
        return;
      }
      if (!pos) toast('住所から場所が分かりませんでした。地図を動かして、家をさがしてください');
      startAdd(Object.assign({ a }, pos ? { lat: pos.lat, lng: pos.lng, appx: !pos.good } : {}));
    };
    $('#daGo').onclick = () => go(false);
    $('#daOnly').onclick = () => go(true);
    setTimeout(() => inp.focus(), 200);
  }

  /* =========================================================
     住所の読み取り（index.html のエクセル取り込みの部品を使う）
     ========================================================= */
  const r6 = n => Math.round(n * 1e6) / 1e6;
  const BLD_RE = /[ァ-ヶー]|ハイツ|荘|マンション|アパート|コーポ|団地|住宅|ビル|棟|寮|レジデンス|ハウス|メゾン|パレス|ヴィラ|コート/;
  /* 住所らしい文字か（数字と漢字がある。名前には数字がない） */
  const looksAddr = c => !!c && /\d/.test(c) && /[一-鿿]/.test(c) && c.length <= 120 && !/^\d{4}[-/年]/.test(c);
  function parseAddr(raw, muni) {
    let s = xlNorm(raw).replace(/^〒?\s*\d{3}-?\d{4}\s*/, '');
    let p = xlParseJa(s), noMuni = false;
    if (!p && muni) { p = xlParseJa(muni + s.replace(/^沖縄県/, '')); noMuni = !!p; }
    if (!p || !p.nums.length) return null;
    const tail = xlSplitTail(p.rest);
    const label = tail.label && BLD_RE.test(tail.label) ? tail.label : ''; // 建物の名前だけ残す（人の名前は残さない）
    const a = `${p.muni}${p.town}${p.nums.join('-')}${label ? ' ' + label : ''}${tail.unit ? ' ' + tail.unit : ''}`;
    return { q: '沖縄県' + p.muni + p.town + p.nums.join('-'), muni: p.muni, town: p.town, nums: p.nums, unit: tail.unit, a: a.slice(0, 120), noMuni };
  }
  function defMuni(list) {
    const cnt = {};
    list.forEach(e => { if (e && !e.noMuni) cnt[e.muni] = (cnt[e.muni] || 0) + 1; });
    const best = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    return best || lsGet('kuiki_dnc_muni') || '豊見城市';
  }
  const addrKey = a => xlNorm(a).replace(/^沖縄県/, '').replace(/[\s字]/g, '');
  function haveAddr() {
    const s = new Set();
    for (const k in D().dnc) { const v = D().dnc[k]; if (v && v.a) s.add(addrKey(v.a)); }
    return s;
  }

  /* 近くの家をさがす（家が多くても速いように、地図をます目に分けておく） */
  function houseGrid() {
    const g = new Map(), cell = (la, ln) => Math.round(la * 2000) + ':' + Math.round(ln * 2000);
    D().houses.forEach(h => { const k = cell(h.lat, h.lng); (g.get(k) || g.set(k, []).get(k)).push(h); });
    return (la, ln, r) => {
      const cy = Math.round(la * 2000), cx = Math.round(ln * 2000), out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        (g.get((cy + dy) + ':' + (cx + dx)) || []).forEach(h => { const d = xlDist([h.lat, h.lng], [la, ln]); if (d <= r) out.push([h, d]); });
      }
      return out.sort((a, b) => a[1] - b[1]);
    };
  }
  const unitMatch = (h, unit) => h.units.find(u => u === unit || uName(h, u) === unit || String(uName(h, u)).replace(/号室?$/, '') === unit);

  /* 1件の行き先を決める：家につなぐ（自動）／場所だけ／場所が分からない */
  function placeOne(near, pos, unit, exact) {
    if (!pos) return { kind: 'nopos' };
    if (unit) {
      const apt = near(pos.lat, pos.lng, exact ? 15 : 30).find(([h]) => h.type === 'apt' && unitMatch(h, unit));
      if (apt && (exact || pos.good)) return { kind: 'house', h: apt[0], unit: unitMatch(apt[0], unit) };
    }
    if (exact || pos.good) {
      const hs = near(pos.lat, pos.lng, exact ? 10 : 15).filter(([h]) => h.type !== 'apt');
      if (hs.length === 1 || (hs.length > 1 && hs[0][1] <= 4 && hs[1][1] > (exact ? 9 : 14))) return { kind: 'house', h: hs[0][0], unit: '' };
    }
    return { kind: 'pin' };
  }

  /* =========================================================
     エクセルの取り込み
     ========================================================= */
  const HEAD_A = /^(住所|所在地|住所1|住所１|address|direcci[oó]n ?1?)$/i;
  const HEAD_N = /^(区域|区域番号|区域no\.?|区域NO|番号|no\.?|territorio|zona)$/i;
  async function readXl(file) {
    let rows = [];
    try {
      toast('エクセルを読んでいます…');
      await loadScript(LIB.xlsx);
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      wb.SheetNames.forEach(n => {
        const data = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
        const tm = /^\s*\(([^)]+)\)/.exec(n), sno = normNo(tm ? tm[1] : n);
        const sheetNo = NO_RE.test(sno) && D().territories.some(t => t.no === sno) ? sno : '';
        const hi = data.slice(0, 10).findIndex(r => (r || []).some(c => HEAD_A.test(xlNorm(c))));
        let aCol = -1, nCol = -1, start = 0;
        if (hi >= 0) {
          const head = data[hi].map(c => xlNorm(c));
          aCol = head.findIndex(h => HEAD_A.test(h)); nCol = head.findIndex(h => HEAD_N.test(h)); start = hi + 1;
        }
        data.slice(start).forEach(r => {
          if (!r) return;
          const raw = aCol >= 0 ? xlNorm(r[aCol]) : (r.map(xlNorm).find(looksAddr) || '');
          if (!raw) return;
          const no = nCol >= 0 ? normNo(r[nCol]) : sheetNo;
          rows.push({ raw, no: NO_RE.test(no) ? no : '' });
        });
      });
    } catch (e) {
      infoSheet('ファイルを読み込めませんでした', 'エクセル（.xlsx）のファイルを選んでください。はじめて使うときは、インターネットにつながっている必要があります。');
      return;
    }
    if (!rows.length) {
      infoSheet('住所が見つかりませんでした', '「住所」という見出しの列に、住所を入れてください（例：豊見城市字高安123）。見出しがないときは、住所の入ったセルをさがして読みます。');
      return;
    }
    xlConfirm(rows, file.name || '', null);
  }
  function xlPrepare(rows, muni) {
    const have = haveAddr(), seen = new Set(), ok = [], bad = [];
    let dup = 0, exist = 0;
    rows.forEach(r => {
      const e = parseAddr(r.raw, muni);
      if (!e) { bad.push(r.raw); return; }
      const key = addrKey(e.a);
      if (have.has(key)) { exist++; return; }
      if (seen.has(key)) { dup++; return; }
      seen.add(key);
      ok.push(Object.assign(e, { no: r.no }));
    });
    return { ok, bad, dup, exist };
  }
  function xlConfirm(rows, fileName, muniSel) {
    const probe = rows.map(r => parseAddr(r.raw, '')).filter(Boolean);
    const muni = muniSel || defMuni(probe);
    const P = xlPrepare(rows, muni), noMuni = P.ok.filter(e => e.noMuni).length;
    const withNo = P.ok.filter(e => e.no).length;
    setSheet(headHtml(null, 'エクセルから拒否の住所を取り込む', esc(fileName)) + `
      <div class="notice info">住所が <b>${P.ok.length}件</b> 見つかりました。${withNo ? `<br>（うち区域番号つき ${withNo}件）` : ''}
        ${P.exist ? `<br>すでに登録されている住所 ${P.exist}件は入れません。` : ''}${P.dup ? `<br>同じ住所の重なり ${P.dup}件は1件にまとめます。` : ''}</div>
      <p class="hint">読むのは<b>住所と区域番号の列だけ</b>です。名前などほかの列は読みません。<br>
        「場所を調べる」を押すと、住所の文字だけを国土地理院の住所検索に送って、地図の位置にします。</p>
      ${noMuni ? `<label class="field"><span>市町村が書いていない住所（${noMuni}件）の市町村</span><select id="dxMuni" class="dnc-sel">${XL_MUNI_LIST.slice().sort().map(m => `<option${m === muni ? ' selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}
      ${P.bad.length ? `<details class="dncfold"><summary>読めなかった住所（${P.bad.length}件）</summary><p class="hint">番地のない住所などです。「＋ 住所で追加」で1件ずつ入れられます。</p><ul>${P.bad.slice(0, 200).map(x => `<li data-notr>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <button type="button" class="btn primary block" id="dxGo"${P.ok.length ? '' : ' disabled'}>場所を調べる（${P.ok.length}件）</button>
      <button type="button" class="btn block" data-close>やめる</button>`);
    const ms = $('#dxMuni');
    if (ms) ms.onchange = () => { lsSet('kuiki_dnc_muni', ms.value); xlConfirm(rows, fileName, ms.value); };
    $('#dxGo').onclick = () => xlLocateAll(P.ok, fileName);
  }
  async function xlLocateAll(list, fileName) {
    const qs = Array.from(new Set(list.map(e => e.q)));
    setSheet(headHtml(null, '住所から場所を調べています', esc(fileName)) + `<p class="hint">住所 ${qs.length}件。しばらくお待ちください（この画面を閉じないでください）。</p>
      <div class="bar"><i id="dxBar" style="width:0%"></i></div><p class="muted" id="dxCnt">0 / ${qs.length}</p>`);
    let geo;
    try {
      geo = await xlGeocode(qs, n => { const b = $('#dxBar'), c = $('#dxCnt'); if (b) b.style.width = Math.round(n / qs.length * 100) + '%'; if (c) c.textContent = `${n} / ${qs.length}`; });
    } catch (e) {
      infoSheet('場所を調べられませんでした', 'インターネットの接続を確かめて、もう一度ためしてください。');
      return;
    }
    const near = houseGrid(), plan = [], seenPos = [];
    list.forEach(e => {
      const pos = xlPick(e, geo.get(e.q));
      const t = e.no ? D().territories.find(x => x.no === e.no) : null;
      const pl = placeOne(near, pos, e.unit, false);
      const item = { e, pos, tid: t ? t.id : pos ? terrOf(pos.lat, pos.lng) : null, pl };
      if (pl.kind === 'pin') { // 同じ場所に重なる印は、少しずつずらす（丁目までしか分からなかったときなど）
        const p = [pos.lat, pos.lng], k = seenPos.filter(x => xlDist(x, p) < 4).length;
        seenPos.push(p);
        if (k) { const r = 9 * Math.sqrt(k), ang = k * 2.4; item.lat = pos.lat + r * Math.sin(ang) / 110540; item.lng = pos.lng + r * Math.cos(ang) / (111320 * Math.cos(pos.lat * Math.PI / 180)); }
      }
      plan.push(item);
    });
    showPlan(plan, 'xl', fileName);
  }

  /* 取り込む前の確認（エクセル・マイマップ共通） */
  function showPlan(plan, src, fileName) {
    const nH = plan.filter(p => p.pl.kind === 'house' && !D().dnc[K(p.pl.h.id, p.pl.unit)]).length;
    const nSame = plan.filter(p => p.pl.kind === 'house' && D().dnc[K(p.pl.h.id, p.pl.unit)]).length;
    const nPin = plan.filter(p => p.pl.kind === 'pin').length, nNo = plan.filter(p => p.pl.kind === 'nopos').length;
    const byT = new Map();
    plan.forEach(p => { const t = p.tid ? terrById(p.tid) : null, key = t ? t.no : p.e.no || '？'; byT.set(key, (byT.get(key) || 0) + 1); });
    setSheet(headHtml(null, '取り込む内容の確認', esc(fileName)) + `
      <div class="tiles"><div class="tile"><b>${nH}</b><span>家に自動でつなぐ</span></div>
        <div class="tile"><b>${nPin}</b><span>地図に印だけ置く</span></div>
        ${nNo ? `<div class="tile alert"><b>${nNo}</b><span>場所が分からない</span></div>` : ''}</div>
      ${nSame ? `<p class="hint">すでに拒否になっている家 ${nSame}件は、住所だけを書き足します。</p>` : ''}
      ${nNo ? `<p class="hint">「場所が分からない」${nNo}件も一覧には入ります（地図には出ません）。あとで地図で家をえらんでください。</p>` : ''}
      <p class="hint">「自動でつなぐ」は、近くに家の印が1軒だけあったものです。印だけのもの・場所が分からないものと一緒に「要確認」に入るので、あとで「地図で順に確かめる」で片づけられます。<br>
        どれも、取り込んだときから地図に拒否の印が出ます（場所が分からないものをのぞく）。</p>
      <details class="dncfold"><summary>区域ごとの件数</summary><ul>${[...byT.entries()].sort((a, b) => (a[0] === '？') - (b[0] === '？') || cmpNo(a[0], b[0])).map(([no, n]) => `<li>${no === '？' ? '区域が分からない' : '区域' + esc(no)}：${n}件</li>`).join('')}</ul></details>
      <button type="button" class="btn primary block" id="dpGo"${plan.length ? '' : ' disabled'}>拒否 ${plan.length}件を取り込む</button>
      <button type="button" class="btn block" data-close>やめる</button>`);
    $('#dpGo').onclick = () => commitPlan(plan, src);
  }
  function commitPlan(plan, src) {
    const at = now();
    closeSheet();
    commit(`拒否 ${plan.length}件を取り込みました`, () => {
      plan.forEach(p => {
        const base = Object.assign({ s: src, at }, p.e.a ? { a: p.e.a } : {});
        if (p.pl.kind === 'house') {
          const h = p.pl.h, k = K(h.id, p.pl.unit), cur = D().dnc[k];
          if (cur) { if (typeof cur === 'object') { if (!cur.a && base.a) D().dnc[k] = Object.assign({}, cur, { a: base.a }); } else D().dnc[k] = Object.assign(base, { lat: r6(h.lat), lng: r6(h.lng) }); return; }
          D().dnc[k] = Object.assign(base, { lat: r6(h.lat), lng: r6(h.lng), auto: 1 });
          delete D().follows[k]; delete D().released[k];
          return;
        }
        const o = Object.assign(base, { p: 1 });
        if (p.pos) { o.lat = r6(p.lat != null ? p.lat : p.pos.lat); o.lng = r6(p.lng != null ? p.lng : p.pos.lng); if (!p.pos.good) o.appx = 1; }
        if (p.tid) o.t = p.tid; else if (p.e.no) o.no = p.e.no;
        D().dnc['pin:' + uid()] = o;
      });
    });
    ui.filter = 'check'; ui.q = '';
    showView('admin'); setAdPane('dnc'); renderAdmin();
  }

  /* =========================================================
     マイマップ（KML／KMZ）のピンの取り込み
     ========================================================= */
  async function readKml(file) {
    let pins = [];
    try {
      const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      let text;
      if (head[0] === 0x50 && head[1] === 0x4B) {
        toast('KMZファイルを開いています…');
        await loadScript(LIB.zip);
        const zip = await window.JSZip.loadAsync(file);
        const f = zip.file('doc.kml') || zip.file(/\.kml$/i)[0];
        if (!f) throw new Error('nokml');
        text = await f.async('string');
      } else text = await file.text();
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
      const nameOf = el => { const n = [...el.children].find(c => c.localName === 'name'); return n ? n.textContent.trim() : ''; };
      for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
        if (pm.getElementsByTagNameNS('*', 'Polygon').length || pm.getElementsByTagNameNS('*', 'LineString').length) continue;
        const pt = pm.getElementsByTagNameNS('*', 'Point')[0]; if (!pt) continue;
        const ce = pt.getElementsByTagNameNS('*', 'coordinates')[0]; if (!ce) continue;
        const [ln, la] = ce.textContent.trim().split(/[\s,]+/).map(Number);
        if (!isFinite(la) || !isFinite(ln)) continue;
        let fo = pm.parentElement, folder = '';
        while (fo && !folder) { if (fo.localName === 'Folder' || fo.localName === 'Document') folder = nameOf(fo); fo = fo.parentElement; }
        const de = [...pm.children].find(c => c.localName === 'description');
        const desc = de ? de.textContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
        pins.push({ lat: la, lng: ln, folder: folder || '（名前のないレイヤー）', texts: [nameOf(pm), desc] });
      }
    } catch (e) {
      infoSheet('ファイルを読み込めませんでした', 'マイマップで「KML/KMZにエクスポート」したファイルを選んでください。書き出すときは「ネットワーク リンク」のチェックを外してください。');
      return;
    }
    if (!pins.length) { infoSheet('ピンが見つかりませんでした', 'このファイルには、ピン（地点）が入っていません。拒否の家のピンがあるマイマップを書き出してください。'); return; }
    kmlConfirm(pins, file.name || '');
  }
  function kmlConfirm(pins, fileName) {
    const fs = new Map();
    pins.forEach(p => fs.set(p.folder, (fs.get(p.folder) || 0) + 1));
    const names = [...fs.keys()], hit = names.filter(n => /拒/.test(n));
    const use = new Set(hit.length ? hit : names);
    const paint = () => {
      const n = pins.filter(p => use.has(p.folder)).length;
      setSheet(headHtml(null, 'マイマップから拒否のピンを取り込む', esc(fileName)) + `
        <p class="q">拒否の家のピンが入っているレイヤーをえらんでください</p>
        <div class="dnc-flist">${names.map((f, i) => `<label class="check"><input type="checkbox" data-kf="${i}"${use.has(f) ? ' checked' : ''}><span><b data-notr>${esc(f)}</b>　ピン ${fs.get(f)}本</span></label>`).join('')}</div>
        ${!hit.length ? '<div class="notice warn">「拒否」という名前のレイヤーがありませんでした。拒否の家ではないピンがまざっていないか、確かめてからえらんでください。</div>' : ''}
        <p class="hint">ピンの場所をそのまま使います。ピンの名前・説明は、住所の形のときだけ住所として残します（人の名前などは残しません）。すでに拒否の印がある場所のピンは入れません。</p>
        <button type="button" class="btn primary block" id="dkGo"${n ? '' : ' disabled'}>${n}本のピンを調べる</button>
        <button type="button" class="btn block" data-close>やめる</button>`);
      $$('[data-kf]', $('#sheet')).forEach(x => x.onchange = () => { const f = names[Number(x.dataset.kf)]; if (x.checked) use.add(f); else use.delete(f); sheetKeep = true; paint(); });
      $('#dkGo').onclick = () => kmlPlan(pins.filter(p => use.has(p.folder)), fileName);
    };
    paint();
  }
  function kmlPlan(pins, fileName) {
    const near = houseGrid(), muni = defMuni([]);
    const old = allEntries().filter(e => e.lat != null).map(e => [e.lat, e.lng]);
    const plan = [];
    let skip = 0;
    pins.forEach(p => {
      if (old.some(x => xlDist(x, [p.lat, p.lng]) < 3)) { skip++; return; }
      old.push([p.lat, p.lng]);
      const parsed = p.texts.map(tx => (looksAddr(xlNorm(tx)) ? parseAddr(tx, muni) : null)).find(Boolean);
      const pos = { lat: p.lat, lng: p.lng, good: true };
      const pl = placeOne(near, pos, parsed ? parsed.unit : '', true);
      plan.push({ e: { a: parsed ? parsed.a : '' }, pos, tid: terrOf(p.lat, p.lng), pl });
    });
    if (!plan.length) { infoSheet('取り込むピンはありません', `えらんだピン ${pins.length}本は、どれも、すでに拒否の印がある場所でした。`); return; }
    if (skip) toast(`すでに拒否の印がある場所のピン ${skip}本は入れません`);
    showPlan(plan, 'kml', fileName);
  }

  /* ---------- 地図の「印の見かた」に、場所だけの拒否を足す ---------- */
  const lg = document.querySelector('#legend .legendgrid');
  if (lg && !lg.querySelector('.dncpin')) {
    const ref = [...lg.children].find(x => x.querySelector('.st-dnc'));
    const sp = document.createElement('span');
    sp.innerHTML = '<i class="pin st-dnc dncpin">拒</i>拒否（家の印とまだつながっていない。このあたりの家）';
    if (ref) ref.after(sp); else lg.appendChild(sp);
  }

  window.renderDncAdmin = renderDncAdmin;
  window.renderDncPins = renderDncPins;
  window.dncPickHouse = dncPickHouse;
  window.dncPickClick = dncPickClick;
  window.dncPickEnd = dncPickEnd;
  if (typeof currentView !== 'undefined' && currentView === 'map' && typeof map !== 'undefined' && map) renderDncPins();
})();
