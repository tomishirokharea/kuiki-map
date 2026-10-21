/* =========================================================
   chui.js  注意（！）の印（2026-10-18）

   ・「犬がいる」「午前中は訪問を控える」「夜勤」など、拒否ではない注意の情報
   ・データ：D().caution（キーは拒否と同じ「家id|部屋」か「pin:…」）
       値 { n: 注意の文, s: 登録元（kml・adm・pub）, at, lat, lng, p: 1（場所だけ）, t: 区域id,
            room: アパートの部屋（例：1-905）, h: その建物の家id }
     アパートは部屋を階ごとの枠で登録しているので、部屋ごとの注意は「場所だけの注意」に room・h を付けて持つ（拒否と同じ）
     アパートの建物ぜんたいの注意は「家id|」（部屋なし）のキー
   ・地図：家の印の右上に黄色い「！」。拒否の家は「拒」のまま（！は出さない）
   ・家をタップした記録の画面：上に注意の文を出す（訪問の結果ではない）
   ・家の編集（「この家を編集」・部屋の編集）：「この家の印」で なし／！注意／拒否 をえらぶ。！なら注意の文を書ける
     奉仕者は拒否を外せない（区域係だけ）。拒否にすることはできる
   ・係の画面 ＞ 区域 ＞ 拒否・！ の「！注意」：区域ごとの一覧から、文を直す・拒否にする・外す・地図で見る
   ・個人情報：注意の文は、その家を訪ねる人みんなが見る。名前・病気・家庭の事情などは書かない（入力欄に書いてある）

   index.html：<script src="kyohi.js"></script> の次に <script src="chui.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function') return;

  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.19')) {
    CHANGELOG.unshift({ v: '2026.13.19', items: [
      ['！', '「犬がいる」「午前中は控える」など、拒否ではない注意の情報を「！」の印で出すようになりました。家をタップすると、記録の画面の上に注意が出ます'],
      ['！', '「この家を編集」の「この家の印」で、なし・！注意・拒否 を切りかえられます。！では注意の文を書けます'],
      ['！', '区域係の画面の「拒否・！」で、注意の一覧を見て直せます']
    ] });
  }

  const css = document.createElement('style');
  css.textContent = `
  /* 注意（！）の色（2026.13.28）：黄色は地図の上で見えにくいので、拒否の濃い赤とは別の「朱色」にする */
  .pin b.cau{position:absolute;right:-9px;top:-9px;width:20px;height:20px;border-radius:99px;background:#E8590C;color:#fff;font-size:13px;font-weight:900;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 1px 3px #0006;line-height:1}
  /* 集合住宅：右上は残りの部屋の数・右は拒の印なので、！は左に出す */
  .pin.apt b.cau{right:auto;left:-14px;top:50%;transform:translateY(-50%);width:19px;height:19px;font-size:12px}
  .pin.st-cau{background:#E8590C;color:#fff;font-weight:900;box-shadow:0 0 0 2px #fff,0 0 0 4px #E8590C}
  .pin.st-cau.chpin{border-style:dashed;border-color:#fff}
  .notice.chui{background:#FFF1E6;border:2px solid #E8590C;color:#5A1E00}
  .notice.chui .ci{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:99px;background:#E8590C;color:#fff;font-weight:900;margin-right:6px;vertical-align:-5px;border:2px solid #fff;box-shadow:0 0 0 1px #E8590C}
  .notice.chui ul{margin:4px 0 0;padding-left:20px}
  .notice.chui li{margin:2px 0;font-size:17px;word-break:break-all}
  .mk-box{border:1px solid var(--line);border-radius:12px;background:#fff;padding:4px 12px 10px;margin:10px 0}
  .mk-box legend{font-weight:700;padding:0 4px}
  .mk-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0}
  .mk-chips.two{grid-template-columns:repeat(2,1fr)}
  .mk-chips button{min-height:58px;border-radius:12px;border:2px solid var(--line);background:#fff;font:inherit;font-weight:700;color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;line-height:1.1}
  .mk-chips button .pin{width:26px;height:26px;font-size:14px;border-width:2px}
  .mk-chips button[aria-pressed="true"]{border-color:var(--brand);background:var(--terr-soft);box-shadow:inset 0 0 0 1px var(--brand)}
  .mk-chips button:disabled{opacity:.45}
  .mk-box textarea{width:100%;min-height:72px;font-size:17px;border:2px solid var(--line);border-radius:12px;padding:8px 10px;font-family:inherit;background:#fff;color:var(--ink)}
  .ch-seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 10px}
  .ch-seg button{min-height:52px;border-radius:12px;border:2px solid var(--line);background:#fff;font:inherit;font-weight:700;color:var(--ink);display:flex;align-items:center;justify-content:center;gap:8px}
  .ch-seg button .pin{width:26px;height:26px;font-size:14px;border-width:2px}
  .ch-seg button[aria-pressed="true"]{border-color:var(--brand);background:var(--terr-soft);box-shadow:inset 0 0 0 1px var(--brand)}
  .chrow .tx b{white-space:normal}
  .chrow .note{display:block;color:#3F2D00;background:#FEF9C3;border-radius:6px;padding:1px 6px;margin:2px 0;font-size:14px;word-break:break-all}
  `;
  document.head.appendChild(css);

  const C = () => D().caution || (D().caution = {});
  const now = () => new Date().toISOString();
  const r6 = x => Math.round(Number(x) * 1e6) / 1e6;
  const isPinK = k => String(k).indexOf('|') < 0;
  const roomLab = r => (/\d$/.test(r) ? r + '号室' : r);
  const NOTE_HINT = '例：犬がいます／午前中は訪問を控える／夜勤（昼は寝ている）';
  const NOTE_RULE = 'その家を訪ねる人みんなが見ます。名前・病気・家庭の事情など、個人のことは書かないでください。';

  /* ---------- 読む ---------- */
  /* この家（部屋）の注意。アパートの部屋なら、建物ぜんたいの注意と、その部屋の注意（場所だけの印の room）も入れる */
  function notesFor(h, unit) {
    if (!h) return [];
    const m = C(), out = [];
    const add = (k, v, lab) => { if (v && typeof v === 'object') out.push({ k, v, lab }); };
    add(K(h.id, unit || ''), m[K(h.id, unit || '')], '');
    if (h.type === 'apt' && unit) add(K(h.id, ''), m[K(h.id, '')], '建物');
    if (h.type === 'apt') {
      for (const k in m) {
        const v = m[k];
        if (!v || !v.room || !((v.h && v.h === h.id) || (v.cid && h.cid && v.cid === h.cid))) continue;
        if (unit && !roomInUnit(v.room, String(uName(h, unit)))) continue; // 部屋の画面では、その部屋（階の枠ならその階）の注意だけ
        if (!out.some(x => x.k === k)) add(k, v, roomLab(v.room));
      }
    }
    return out;
  }
  /* 「1-905」「302」などの部屋が、画面の部屋（「302」や階の枠「3階」）に入るか */
  function roomInUnit(room, nm) {
    const r = String(room).replace(/^\d+-/, ''), n = String(nm).normalize('NFKC');
    if (r === n || String(room) === n || n.replace(/号室?$/, '') === r) return true;
    const fl = n.match(/^(\d+)\s*(階|F|f)$/);
    return !!fl && /^\d{3,4}$/.test(r) && Number(r.slice(0, -2)) === Number(fl[1]);
  }
  /* 地図の家の印に「！」を付けるか */
  function hasMark(h) {
    if (!h) return false;
    const m = C();
    if (h.type !== 'apt') return !!m[K(h.id, '')] && !D().dnc[K(h.id, '')];
    if (m[K(h.id, '')]) return true;
    if (h.units.some(u => m[K(h.id, u)])) return true;
    for (const k in m) { const v = m[k]; if (v && v.room && v.h === h.id) return true; }
    return false;
  }
  /* 記録の画面に出す注意 */
  function notice(h, unit) {
    const ns = notesFor(h, unit);
    if (!ns.length) return '';
    const li = ns.map(x => `<li>${x.lab ? `<b data-notr>${esc(x.lab)}</b>：` : ''}<span data-notr>${esc(x.v.n || '注意してください')}</span></li>`).join('');
    return `<div class="notice chui"><b><span class="ci">！</span>注意</b>（訪問の前に読んでください）<ul>${li}</ul></div>`;
  }
  window.chuiNotice = notice;
  window.chuiHas = hasMark;
  window.chuiNotes = notesFor;

  /* ---------- 家の編集の「この家の印」 ---------- */
  const markOf = k => (D().dnc[k] ? 'dnc' : C()[k] ? 'warn' : 'none');
  function markHtml(k, st, opt) {
    const o = opt || {}, cur = markOf(k), lockDnc = cur === 'dnc' && !isAdmin();
    const kind = st.kind || cur;
    const chip = (v, icon, lab) => (v === 'dnc' && o.noDnc ? '' : `<button type="button" data-mk="${v}" aria-pressed="${kind === v}"${lockDnc && v !== 'dnc' ? ' disabled' : ''}>${icon}<span>${lab}</span></button>`);
    const n = st.n != null ? st.n : ((C()[k] && C()[k].n) || '');
    return `<fieldset class="mk-box"><legend>この${o.noDnc ? '建物ぜんたい' : k.split('|')[1] ? '部屋' : '家'}の印</legend>
      <div class="mk-chips${o.noDnc ? ' two' : ''}" role="group" aria-label="印の種類">
        ${chip('none', '<i class="pin st-new"></i>', 'なし')}
        ${chip('warn', '<i class="pin st-cau">！</i>', '注意')}
        ${chip('dnc', '<i class="pin st-dnc">拒</i>', '拒否')}
      </div>
      ${kind === 'warn' ? `<label class="field"><span>注意の内容（なくてもよい）</span>
        <textarea id="mkNote" maxlength="80" placeholder="${NOTE_HINT}">${esc(n)}</textarea>
        <small class="hint">${NOTE_RULE}</small></label>` : ''}
      ${kind === 'dnc' && cur !== 'dnc' ? '<p class="hint">拒否にすると、訪問しない家として地図に「拒」が出ます。外せるのは区域係だけです。</p>' : ''}
      ${lockDnc ? '<p class="hint">拒否を外すのは区域係だけです。まちがいのときは区域係に相談してください。</p>' : ''}
      <p class="hint">「！注意」は訪問の結果ではありません。訪ねる前に気をつけることを、みんなに知らせる印です。</p>
    </fieldset>`;
  }
  /* 画面の入力を st に写す（描き直す前に呼ぶ） */
  function markKeep(st) { const t = document.getElementById('mkNote'); if (t) st.n = t.value; }
  function markBind(root, st, repaint) {
    $$('[data-mk]', root).forEach(b => b.onclick = () => { markKeep(st); st.kind = b.dataset.mk; repaint(); });
  }
  const markChanged = (k, st) => {
    if (!st.kind) return false;
    const cur = markOf(k);
    if (st.kind !== cur) return true;
    return cur === 'warn' && st.n != null && st.n.trim() !== ((C()[k] && C()[k].n) || '');
  };
  /* commit の中で呼ぶ */
  function markApply(h, unit, st) {
    const k = K(h.id, unit || ''), cur = markOf(k), kind = st.kind || cur;
    if (kind === cur && !(cur === 'warn' && st.n != null)) return;
    if (cur === 'dnc' && kind !== 'dnc' && !isAdmin()) return;
    if (kind !== 'dnc' && D().dnc[k] !== undefined) { if (typeof dncDrop === 'function') dncDrop(k, h); else delete D().dnc[k]; }
    if (kind !== 'warn') delete C()[k];
    if (kind === 'dnc') {
      if (!D().dnc[k]) D().dnc[k] = isAdmin() ? { s: 'adm', at: now(), lat: r6(h.lat), lng: r6(h.lng) } : true;
      delete D().follows[k]; delete D().released[k];
    }
    if (kind === 'warn') {
      const n = String(st.n != null ? st.n : ((C()[k] && C()[k].n) || '')).replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
      const old = C()[k] && typeof C()[k] === 'object' ? C()[k] : null;
      const o = Object.assign({}, old || { s: isAdmin() ? 'adm' : 'pub' }, { at: now() });
      if (n) o.n = n; else delete o.n;
      C()[k] = o;
    }
  }
  const markMsg = st => (st.kind === 'warn' ? '注意（！）の印を保存しました' : st.kind === 'dnc' ? '拒否の印にしました' : '印を外しました');
  window.chuiMark = { html: markHtml, keep: markKeep, bind: markBind, changed: markChanged, apply: markApply, msg: markMsg };

  /* ---------- 地図：場所だけの注意（家とつながっていない） ---------- */
  let layer = null;
  function renderPins() {
    if (typeof map === 'undefined' || !map) return;
    if (!layer) layer = L.layerGroup().addTo(map);
    layer.clearLayers();
    if (map.getZoom() < 16) return;
    if (typeof mode !== 'undefined' && (mode === 'draw' || mode === 'sen' || mode === 'tok')) return;
    const b = map.getBounds().pad(0.2), m = C();
    for (const k in m) {
      const v = m[k];
      if (!isPinK(k) || !v || v.lat == null || !isFinite(v.lat) || !b.contains([v.lat, v.lng])) continue;
      if (v.h && houseById(v.h)) continue; // 建物につながった部屋の注意は、建物の印の！で出す
      L.marker([v.lat, v.lng], {
        icon: L.divIcon({ className: '', html: '<div class="pin st-cau chpin">！</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
        title: '注意', zIndexOffset: 400, keyboard: false
      }).on('click', () => pinTap(k)).addTo(layer);
    }
  }
  function pinTap(k) {
    if (isAdmin()) { openDetail(k); return; }
    const v = C()[k] || {}, t = v.t ? terrById(v.t) : null;
    setSheet(headHtml(t, '注意', '') + `<div class="notice chui"><b><span class="ci">！</span>このあたりの家の注意</b><ul><li data-notr>${esc(v.room ? roomLab(v.room) + '：' : '')}${esc(v.n || '注意してください')}</li></ul></div>
      <button type="button" class="btn primary block" data-close>わかりました</button>`);
  }
  window.renderChuiPins = renderPins;

  /* =========================================================
     係の画面 ＞ 区域 ＞ 拒否・！ の「！注意」
     ========================================================= */
  const ui = { open: new Set(), q: '' };
  function entryOf(k) {
    const v = C()[k];
    if (!v || typeof v !== 'object') return null;
    if (isPinK(k)) {
      const hb = v.h ? houseById(v.h) : null;
      return { k, v, h: hb, unit: '', tid: v.t || (hb && hb.terrId) || (v.lat != null && typeof terrOf === 'function' ? terrOf(v.lat, v.lng) : null), lat: v.lat, lng: v.lng };
    }
    const [hid, unit] = parseKey(k), h = houseById(hid);
    if (!h) return null;
    return { k, v, h, unit, tid: h.terrId || null, lat: h.lat, lng: h.lng };
  }
  function placeOf(e) {
    if (e.h) {
      if (e.h.type === 'apt') return `${e.h.label || '集合住宅'} ${e.v.room ? roomLab(e.v.room) : e.unit ? unitTitle(e.h, e.unit) : '（建物）'}`;
      return e.h.label || '一戸建て';
    }
    return (e.v.a || '場所だけの注意') + (e.v.room ? ' ' + roomLab(e.v.room) : '');
  }
  const SRC = { kml: 'マイマップ', adm: '係', pub: '奉仕者' };
  function groups() {
    const g = new Map(), q = ui.q.trim().normalize('NFKC').toLowerCase();
    for (const k in C()) {
      const e = entryOf(k); if (!e) continue;
      if (q && !((e.v.n || '') + ' ' + placeOf(e)).normalize('NFKC').toLowerCase().includes(q)) {
        const t = e.tid ? terrById(e.tid) : null;
        if (!(t && String(t.no).toLowerCase() === q)) continue;
      }
      const key = e.tid || 'x';
      (g.get(key) || g.set(key, []).get(key)).push(e);
    }
    return [...g.entries()].map(([key, es]) => {
      const t = key !== 'x' ? terrById(key) : null;
      return { key, t, no: t ? t.no : '', es: es.sort((a, b) => placeOf(a).localeCompare(placeOf(b), 'ja', { numeric: true })) };
    }).sort((a, b) => (a.no ? 0 : 1) - (b.no ? 0 : 1) || cmpNo(a.no, b.no));
  }
  const rowHtml = e => `<button type="button" class="dncrow chrow" data-ck="${esc(e.k)}"><i class="pin st-cau${isPinK(e.k) && !e.h ? ' chpin' : ''}">！</i>
      <span class="tx"><b data-notr>${esc(placeOf(e))}</b><span class="note" data-notr>${esc(e.v.n || '（注意の文なし）')}</span><small>${esc(SRC[e.v.s] || '')}${e.v.at ? '・' + fmtDay(e.v.at) : ''}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
  function renderAdminList(box) {
    const gs = groups(), total = Object.keys(C()).length;
    box.insertAdjacentHTML('beforeend', `
      <h2 class="sec">注意（！）の家</h2>
      <p class="hint">拒否ではない注意（犬・時間帯・夜勤など）です。家を訪ねる人の記録の画面に出ます。<br>家の画面の「この家を編集」の「この家の印」でも、だれでも付けられます。</p>
      ${total ? `<input type="search" class="dnc-q" id="chQ" placeholder="注意の文・建物・区域番号でさがす" value="${esc(ui.q)}">` : ''}
      <div id="chGroups">${!total ? '<p class="dnc-none">注意の家はまだありません。</p>' : !gs.length ? '<p class="dnc-none">見つかりませんでした</p>'
        : gs.map(g => `<details class="dncg" data-cg="${esc(g.key)}"${ui.q || gs.length === 1 || ui.open.has(g.key) ? ' open' : ''}><summary>${g.no ? `<span class="stamp sm${noCls(g.no)}">${esc(g.no)}</span>` : '<span class="stamp sm">？</span>'}
            <span class="nm" data-notr>${g.t ? esc(g.t.name) : '区域が分からない注意'}</span><span class="cnt">${g.es.length}件</span></summary>${g.es.map(rowHtml).join('')}</details>`).join('')}</div>`);
    const qi = $('#chQ');
    if (qi) { let tm = null; qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { ui.q = qi.value; rerender(); setTimeout(() => { const i = $('#chQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250); }; }
    $$('[data-cg]', box).forEach(d => d.addEventListener('toggle', () => { if (d.open) ui.open.add(d.dataset.cg); else ui.open.delete(d.dataset.cg); }));
    $$('[data-ck]', box).forEach(b => b.onclick = () => openDetail(b.dataset.ck));
  }
  const rerender = () => { if (window.renderDncAdmin) window.renderDncAdmin(); };
  window.renderChuiAdmin = renderAdminList;
  window.chuiCount = () => Object.keys(C()).length;

  function openDetail(k) {
    const e = entryOf(k);
    if (!e) { toast('この注意は、もうありません'); rerender(); return; }
    const t = e.tid ? terrById(e.tid) : null;
    setSheet(headHtml(t, '注意（！）', t ? esc(t.name) : '') + `
      <div class="dnchead"><i class="pin st-cau">！</i><div><b data-notr>${esc(placeOf(e))}</b><small>${esc(SRC[e.v.s] || '')}${e.v.at ? '・' + fmtDay(e.v.at) : ''}</small></div></div>
      <label class="field"><span>注意の内容</span><textarea id="cdN" maxlength="80" placeholder="${NOTE_HINT}" style="width:100%;min-height:80px;font-size:17px;border:2px solid var(--line);border-radius:12px;padding:8px 10px;font-family:inherit">${esc(e.v.n || '')}</textarea>
        <small class="hint">${NOTE_RULE}</small></label>
      <button type="button" class="btn primary block" id="cdSave">保存する</button>
      ${e.lat != null ? '<button type="button" class="btn block" id="cdMap">地図で見る</button>' : ''}
      <button type="button" class="btn block" id="cdDnc"><i class="pin st-dnc" style="width:24px;height:24px;font-size:12px;display:inline-grid;vertical-align:-6px;margin-right:6px">拒</i>拒否に変える</button>
      <button type="button" class="btn block danger" id="cdDel">注意を外す</button>
      <button type="button" class="btn block" data-close>閉じる</button>`);
    const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = f; };
    on('cdSave', () => {
      const n = $('#cdN').value.replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
      closeSheet();
      commit('注意を保存しました', () => { const cur = C()[k]; if (!cur) return; const o = Object.assign({}, cur, { at: now() }); if (n) o.n = n; else delete o.n; C()[k] = o; });
      rerender();
    });
    on('cdMap', () => {
      closeSheet(); showView('map');
      setTimeout(() => { map.setView([e.lat, e.lng], 19); }, 120);
    });
    on('cdDnc', async () => {
      if (!await ask('この注意を、拒否に変えますか？', { title: '拒否に変えますか？', body: '訪問しない家として地図に「拒」が出ます。注意の文は消えます。', ok: '拒否に変える' })) return;
      closeSheet();
      commit('拒否に変えました', () => {
        const v = C()[k]; if (!v) return;
        delete C()[k];
        if (isPinK(k)) {
          const o = { s: v.s === 'kml' ? 'kml' : 'adm', at: now(), p: 1 };
          ['lat', 'lng', 't', 'room', 'h', 'a'].forEach(f => { if (v[f] != null && v[f] !== '') o[f] = v[f]; });
          D().dnc['pin:' + uid()] = o;
        } else {
          const h = e.h;
          D().dnc[k] = { s: 'adm', at: now(), lat: r6(h.lat), lng: r6(h.lng) };
          delete D().follows[k]; delete D().released[k];
        }
      });
      rerender();
    });
    on('cdDel', async () => {
      if (!await ask('この注意を外しますか？', { title: '注意を外しますか？', body: '地図の！の印も消えます。まちがえたときは、お知らせの「取り消す」でもどせます。', ok: '外す' })) return;
      closeSheet();
      commit('注意を外しました', () => { delete C()[k]; });
      rerender();
    });
  }
  window.openChuiDetail = openDetail;

  /* 地図の「印の見かた」に！を足す */
  const lg = document.querySelector('#legend .legendgrid');
  if (lg && !lg.querySelector('.st-cau')) {
    const sp = document.createElement('span');
    sp.innerHTML = '<i class="pin st-cau">！</i>注意（犬・時間帯など。訪問はできる）';
    const ref = [...lg.children].find(x => x.querySelector('.st-dnc'));
    if (ref) ref.after(sp); else lg.appendChild(sp);
  }
  if (typeof currentView !== 'undefined' && currentView === 'map' && typeof map !== 'undefined' && map) renderPins();
})();
