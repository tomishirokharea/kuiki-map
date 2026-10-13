/* =========================================================
   apt-wizard.js  区域マップ：アパートの「候補えらび」と「階・部屋の入力」

   現場での流れ
     ① 家の画面の「アパートだった」→ 付近の候補（エクセルの建物）が近い順に出る
        → 1つえらぶと、建物名・階数・1階の有無・オートロック・立入禁止が自動で入る
        → えらんだ候補は「使った」ことになり、次からは候補に出ない（残りだけが並ぶ）
     ② 同じ画面で、階の数と部屋の入れ方をえらぶ
        ・階だけ入れる      ：「1階・2階…」の枠だけ作る（部屋は訪問しながら）
        ・部屋番号まで入れる：書き方（101／2-1／2A／A棟101）と1階の部屋数をえらぶと、まとめて作れる
          できた部屋は1つずつ「直す・消す」ができ、自由な書き方でも足せる
     ③ 登録すると、そのまま訪問の入力（openAptSeq）に進む。現場で全部入力して終えることもできる
   候補の置き場：区域ごとの territory.cands（エクセルから、アパートの登録画面で入れる）
   使った印    ：家の cid（候補の番号）。家を消すと、その候補はまた出る
   index.html の関数（setSheet・commit・houseById・visitsOf など）を使います。
   ========================================================= */
(function () {
  'use strict';
  const RADIUS = 600;      // 候補を探す範囲（m）
  const SHOW = 6;          // 最初に出す件数
  const MAX_FLOORS = 40;
  const FRAME = /^\d+階$/; // 「2階」のような階の枠

  /* ---------- 見た目（このファイルだけで完結） ---------- */
  const css = document.createElement('style');
  css.textContent = `
.aw-cand{display:block;width:100%;text-align:left;border:2px solid var(--line);background:#fff;border-radius:14px;padding:12px 14px;margin:0 0 10px;font:inherit;color:var(--ink);min-height:64px}
.aw-cand b{display:block;font-size:19px;line-height:1.35}
.aw-cand span{display:block;font-size:15px;color:var(--ink2);margin-top:2px}
.aw-cand:active{background:var(--terr-soft);border-color:var(--terr)}
.aw-tag{display:inline-block;font-size:13px;font-weight:700;border-radius:99px;padding:2px 10px;margin:4px 6px 0 0;background:var(--terr-soft);color:#0b3d32}
.aw-tag.ban{background:var(--ref-bg);color:var(--danger)}
.aw-tag.warn{background:var(--warn-bg);color:#6b4700}
.aw-from{display:flex;align-items:center;gap:8px;background:var(--terr-soft);border-radius:12px;padding:10px 12px;margin:0 0 12px;font-size:15px}
.aw-from b{flex:1}
.aw-from button{border:0;background:#fff;border-radius:99px;min-height:40px;padding:0 14px;font:inherit;font-weight:700;color:var(--ink)}
.aw-row{display:flex;align-items:center;gap:12px;margin:8px 0}
.aw-row>span{min-width:92px;font-weight:700}
.aw-seg{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px}
.aw-seg button{min-height:52px;padding:0 16px;border-radius:12px;border:2px solid var(--line);background:#fff;font:inherit;font-size:17px;font-weight:700;color:var(--ink)}
.aw-seg button.on{border-color:var(--terr);background:var(--terr-soft);color:#0b3d32}
.aw-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.aw-chip{min-width:56px;min-height:48px;padding:0 12px;border-radius:12px;border:2px solid var(--ink2);background:#fff;font:inherit;font-size:18px;font-weight:700;color:var(--ink)}
.aw-chip.sel{border-color:var(--terr);background:var(--terr-soft)}
.aw-chip.rec{border-style:dashed}
.aw-fl{width:100%;font-size:14px;color:var(--ink2);margin:6px 0 0;font-weight:700}
.aw-edit{background:#F6F8F7;border-radius:12px;padding:10px 12px;margin:6px 0 10px}
.aw-edit .inline{display:flex;gap:8px;margin-top:6px}
.aw-edit input,.aw-add input{flex:1;min-width:0;min-height:48px;border-radius:10px;border:2px solid var(--ink2);padding:0 10px;font:inherit;font-size:18px}
.aw-add{display:flex;gap:8px;margin:8px 0}
.aw-bar{position:sticky;bottom:-1px;background:#fff;border-top:1px solid var(--line);padding:10px 0 6px;margin-top:14px;z-index:2}
.aw-bar p{margin:0 0 6px;font-size:15px;color:var(--ink2);text-align:center}
.aw-prefix{width:110px;min-height:48px;border-radius:10px;border:2px solid var(--ink2);padding:0 10px;font:inherit;font-size:18px;text-align:center}
`;
  document.head.appendChild(css);

  /* ---------- 候補 ---------- */
  const usedCids = () => { const s = new Set(); D().houses.forEach(h => { if (h.cid) s.add(h.cid); }); return s; };
  function nearby(ll, tid) {
    const used = usedCids(), out = [];
    let left = 0;
    D().territories.forEach(t => {
      (t.cands || []).forEach(c => {
        if (used.has(c.i)) return;
        if (t.id === tid) left++;
        const d = distM([ll.lat, ll.lng], [c.la, c.ln]);
        if (d <= RADIUS) out.push({ c, d, tid: t.id });
      });
    });
    out.sort((a, b) => a.d - b.d);
    return { list: out, left };
  }
  const candCount = (tid) => { const t = terrById(tid); if (!t || !t.cands) return 0; const u = usedCids(); return t.cands.filter(c => !u.has(c.i)).length; };
  const dTxt = d => d < 20 ? 'すぐ近く' : d < 1000 ? `約${Math.round(d / 10) * 10}m` : `約${(d / 1000).toFixed(1)}km`;
  const tags = c => `${c.f ? `<span class="aw-tag">${c.f}階建て</span>` : '<span class="aw-tag warn">階数 不明</span>'}${c.g === 0 ? '<span class="aw-tag">1階に部屋なし</span>' : ''}${c.k ? '<span class="aw-tag">オートロック</span>' : ''}${c.b === 'no' ? '<span class="aw-tag ban">立入禁止</span>' : c.b === 'letter' ? '<span class="aw-tag ban">手紙のみ</span>' : ''}`;

  /* ---------- 部屋の名前 ---------- */
  const FMTS = [['n3', '101', '階＋番号'], ['dash', '2-1', '階－番号'], ['alpha', '2A', '階＋英字'], ['free', '自由', '自分で入力']];
  const sample = (fmt, pre) => fmt === 'free' ? '好きな書き方で入力' : [1, 2].map(r => fmtUnit(fmt, 2, r, pre)).join('、') + '…';
  function fmtUnit(fmt, fl, r, pre) {
    const p = pre || '';
    if (fmt === 'dash') return cleanUnit(`${p}${fl}-${r}`);
    if (fmt === 'alpha') return cleanUnit(`${p}${fl}${r <= 26 ? String.fromCharCode(64 + r) : r}`);
    return cleanUnit(`${p}${fl}${String(r).padStart(2, '0')}`);
  }
  const normNum = v => String(v || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[ー－―‐−]/g, '-');
  const splitUnits = text => {
    const seen = new Set();
    return normNum(text).split(/[\s,、，・]+/).map(cleanUnit).filter(x => x && !seen.has(x) && seen.add(x));
  };
  const guessFloors = h => {
    let m = 0;
    (h.units || []).forEach(u => {
      let x = /^(\d+)階$/.exec(u);
      if (!x) x = /^\D*?(\d)\d{2}$/.exec(u) || /^\D*?(\d)-\d+$/.exec(u) || /^(\d)[A-Za-z]$/.exec(u);
      if (x) m = Math.max(m, +x[1]);
    });
    return m || 2;
  };

  /* ---------- 状態から、できあがりの部屋を作る ---------- */
  function hasRec(s, u) {
    if (!s.h) return false;
    const k = K(s.h.id, u);
    return !!(visitsOf(k).length || D().dnc[k] || fol(k));
  }
  function gen(s) {
    const out = [];
    for (let i = 0; i < s.floors; i++) {
      const fl = i + 1;
      if (s.mode === 'floor') { if (fl === 1 && !s.g1) continue; out.push(`${fl}階`); continue; }
      const n = fl === 1 && !s.g1 ? 0 : (s.same ? s.cnt0 : (s.cnt[i] == null ? s.cnt0 : s.cnt[i]));
      if (s.fmt === 'free') continue;
      for (let r = 1; r <= n; r++) out.push(fmtUnit(s.fmt, fl, r, s.prefix));
    }
    return out;
  }
  function finalUnits(s) {
    let list;
    if (s.mode === 'keep') list = s.ex.slice();
    else if (s.mode === 'floor') list = (s.edit ? s.ex.filter(u => !FRAME.test(u)) : []).concat(gen(s));
    else list = (s.edit ? s.ex.filter(u => hasRec(s, u)) : []).concat(gen(s));
    list = list.concat(s.extra).filter(u => !s.del.has(u));
    if (s.edit) s.ex.forEach(u => { if (hasRec(s, u) && !list.includes(u)) list.push(u); }); // 記録のある部屋は、かならず残す
    return [...new Set(list.filter(Boolean))].slice(0, 300);
  }
  // 階の枠に記録があるまま部屋を作ると、その枠は「（部屋不明）」の名前で残す（記録はなくならない）
  const unknownFrame = (s, u) => s.edit && s.mode === 'room' && FRAME.test(u) && hasRec(s, u);
  const labelOf = (s, u) => (s.ren[u] || (s.edit && s.h.ul && s.h.ul[u]) || (unknownFrame(s, u) ? u + '（部屋不明）' : u));
  const canDel = (s, u) => !hasRec(s, u) && (isAdmin() || !s.edit || !s.ex.includes(u) || FRAME.test(u));

  /* ---------- 入り口 ---------- */
  function openWizard(hid, opt) {
    opt = opt || {};
    const h = hid ? houseById(hid) : null;
    if (hid && !h) return;
    const ll = h ? { lat: h.lat, lng: h.lng } : opt.ll;
    if (!ll) return;
    const tid = h ? h.terrId : (opt.tid || terrOf(ll.lat, ll.lng));
    const edit = !!h && h.type === 'apt';
    const s = {
      h, hid, ll, tid, edit, step: edit ? 'form' : 'pick', cand: null, more: false,
      name: h ? (h.label || '') : '', floors: edit ? guessFloors(h) : 3, g1: true, lock: !!(h && h.lock), ban: (h && h.ban) || '',
      mode: edit ? 'keep' : 'floor', fmt: 'n3', prefix: '', cnt0: 4, same: true, cnt: [], ex: edit ? h.units.slice() : [],
      extra: [], del: new Set(), ren: {}, sel: null, freeText: ''
    };
    if (edit) s.g1 = !h.units.length || h.units.some(u => u === '1階' || /^\D*?1\d{2}$/.test(u) || /^\D*?1-\d+$/.test(u) || /^1[A-Za-z]$/.test(u));
    paint(s);
  }

  /* ---------- 画面 ---------- */
  function paint(s, keepScroll) {
    if (keepScroll) { try { sheetKeep = true; } catch (e) { /* なくてもよい */ } }
    s.step === 'pick' ? paintPick(s) : paintForm(s);
  }

  function paintPick(s) {
    const t = terrById(s.tid), { list, left } = nearby(s.ll, s.tid);
    const shown = s.more ? list.slice(0, 30) : list.slice(0, SHOW);
    setSheet(headHtml(t, 'アパート・マンションをえらぶ', t ? `区域${esc(t.no)}　${esc(t.name)}` : '区域の線の外') + `
      ${list.length ? `<p class="q">この付近の建物（近い順）</p><p class="hint">えらぶと、名前・階数・オートロックが自動で入ります。使った建物は、次から出ません。</p>` : ''}
      ${shown.map(x => `<button class="aw-cand" data-ci="${esc(x.c.i)}"><b>${esc(x.c.n || '（名前なし）')}</b><span>${dTxt(x.d)}${x.tid !== s.tid ? '　別の区域' : ''}</span>${tags(x.c)}</button>`).join('')}
      ${list.length > shown.length ? `<button class="btn block" id="awMore">ほかの候補も見る（あと${list.length - shown.length}件）</button>` : ''}
      ${list.length ? '' : `<p class="notice">この付近（${RADIUS}m）には、使える候補がありません。${left ? '' : '候補が入っていない区域です。'}</p>`}
      <button class="btn block" id="awNew">候補にない建物（自分で入力する）</button>
      <button class="btn block" id="awClose">やめる</button>`);
    const S = $('#sheet');
    $$('[data-ci]', S).forEach(b => b.onclick = () => {
      const f = list.find(x => x.c.i === b.dataset.ci); if (!f) return;
      const c = f.c;
      s.cand = c; s.name = c.n || s.name; if (c.f) s.floors = Math.min(MAX_FLOORS, c.f);
      s.g1 = c.g !== 0; s.lock = !!c.k; s.ban = c.b || ''; s.step = 'form'; paint(s);
    });
    if ($('#awMore')) $('#awMore').onclick = () => { s.more = true; paint(s, true); };
    $('#awNew').onclick = () => { s.step = 'form'; paint(s); };
    $('#awClose').onclick = () => { closeSheet(); if (s.hid) openTarget(s.hid, '', false); };
  }

  function stepper(attr, v, lbl) {
    return `<div class="stepper"><button type="button" ${attr} data-d="-1" aria-label="${lbl}を減らす">−</button><output>${v}</output><button type="button" ${attr} data-d="1" aria-label="${lbl}を増やす">＋</button></div>`;
  }

  function paintForm(s) {
    const t = terrById(s.tid), us = finalUnits(s), edit = s.edit;
    const room = s.mode === 'room', keep = s.mode === 'keep';
    const chips = us.map(u => `<button class="aw-chip${s.sel === u ? ' sel' : ''}${hasRec(s, u) ? ' rec' : ''}" data-chip="${esc(u)}">${esc(labelOf(s, u))}</button>`).join('');
    let editor = '';
    if (s.sel && us.includes(s.sel)) {
      const u = s.sel, rec = hasRec(s, u);
      editor = `<div class="aw-edit"><b>「${esc(labelOf(s, u))}」を直す</b>${rec ? '<div class="hint">この部屋には記録があります。名前を直しても記録は残ります。</div>' : ''}
        <div class="inline"><input type="text" id="awRen" maxlength="12" value="${esc(labelOf(s, u))}" aria-label="部屋の名前"><button class="btn small primary" id="awRenOk">直す</button></div>
        <div class="inline">${canDel(s, u) ? '<button class="btn small danger" id="awDelOne">この部屋を消す</button>' : `<span class="hint">${rec ? '記録のある部屋は消せません。' : '消すには、区域係に相談してください。'}</span>`}<button class="btn small" id="awSelOff">とじる</button></div></div>`;
    }
    const perFloor = room && !s.same ? `<div class="floorlist">${Array.from({ length: s.floors }, (_, i) => {
      const dis = i === 0 && !s.g1;
      return `<div class="floorrow"><b>${i + 1}階</b>${dis ? '<span class="muted">部屋なし</span>' : stepper(`data-fc="${i}"`, s.cnt[i] == null ? s.cnt0 : s.cnt[i], `${i + 1}階の部屋`)}</div>`;
    }).join('')}</div>` : '';
    setSheet(headHtml(t, edit ? '部屋を入力する・直す' : 'アパート・マンションの登録', t ? `区域${esc(t.no)}　${esc(t.name)}` : '') + `
      ${s.cand ? `<div class="aw-from"><b>候補：${esc(s.cand.n || '（名前なし）')}</b><button id="awBack">えらびなおす</button></div>` : (!edit && !s.cand ? '<div class="aw-from"><b>候補を使わず、自分で入力</b><button id="awBack">候補を見る</button></div>' : '')}
      ${s.cand && s.ban ? `<div class="notice refnote"><b>${s.ban === 'no' ? '立入禁止の建物です。' : '手紙のみの建物です。'}</b>${isAdmin() ? '' : '係の確認のあと、地図に注意が出ます。'}</div>` : ''}
      <label class="field"><span>建物名</span><input type="text" id="awName" maxlength="30" value="${esc(s.name)}" placeholder="例：〇〇ハイツ"><small class="hint">住んでいる人の名前は書かないでください。</small></label>
      <div class="aw-row"><span>階の数</span>${stepper('data-fl="1"', s.floors, '階')}</div>
      <label class="check locrow"><input type="checkbox" id="awG1"${s.g1 ? ' checked' : ''}>1階に部屋がある</label>
      <label class="check locrow"><input type="checkbox" id="awLock"${s.lock ? ' checked' : ''}>オートロックの建物</label>
      ${isAdmin() ? `<label class="field"><span>立ち入りについて</span><select id="awBan"><option value=""${!s.ban ? ' selected' : ''}>ふつう</option><option value="no"${s.ban === 'no' ? ' selected' : ''}>立入禁止</option><option value="letter"${s.ban === 'letter' ? ' selected' : ''}>手紙のみ</option></select></label>` : ''}

      <p class="q">部屋の入れ方</p>
      <div class="choices two">
        ${edit ? `<button class="choice${keep ? ' on' : ''}" data-mode="keep" aria-pressed="${keep}">いまの部屋を<br>直す</button>` : `<button class="choice${s.mode === 'floor' ? ' on' : ''}" data-mode="floor" aria-pressed="${s.mode === 'floor'}">階だけ入れる<br><small>部屋は回りながら</small></button>`}
        <button class="choice${room ? ' on' : ''}" data-mode="room" aria-pressed="${room}">部屋番号まで<br>入れる<small></small></button>
      </div>
      ${room ? `
        <p class="q">部屋番号の書き方</p>
        <div class="aw-seg">${FMTS.map(f => `<button data-fmt="${f[0]}" class="${s.fmt === f[0] ? 'on' : ''}" aria-pressed="${s.fmt === f[0]}">${f[1]}<small style="display:block;font-size:12px;font-weight:400">${f[2]}</small></button>`).join('')}</div>
        ${s.fmt === 'free' ? '' : `<p class="hint">例：${esc(sample(s.fmt, s.prefix))}</p>
        <div class="aw-row"><span>頭につける</span><input class="aw-prefix" id="awPre" maxlength="4" value="${esc(s.prefix)}" placeholder="なし" aria-label="頭につける文字">
          <div class="aw-seg" style="margin:0">${['A棟', 'B棟'].map(p => `<button data-pre="${p}" class="${s.prefix === p ? 'on' : ''}" style="min-height:44px">${p}</button>`).join('')}</div></div>
        <div class="aw-row"><span>1階の部屋数</span>${s.same ? stepper('data-c0="1"', s.cnt0, '部屋') : '<span class="muted">階ごとに設定</span>'}</div>
        <label class="check locrow"><input type="checkbox" id="awSame"${s.same ? '' : ' checked'}>階ごとに部屋の数がちがう</label>
        ${perFloor}`}
        ${edit ? `<div class="notice warn">いまの部屋のうち、記録のあるものは残ります。記録のないものは、ここで作る部屋にかわります。</div>` : ''}` : ''}

      ${keep || room || s.mode === 'floor' ? `<p class="q">${room || keep ? '部屋の一覧（タップで直す・消す）' : 'できる階'}</p>
      <div class="aw-chips">${chips || '<span class="muted">まだありません</span>'}</div>${editor}
      ${s.mode === 'floor' ? '' : `<div class="aw-add"><input type="text" id="awAdd" placeholder="足す部屋（例：管理人室　305）" aria-label="部屋を足す" value="${esc(s.freeText)}"><button class="btn" id="awAddOk">足す</button></div>
      <p class="hint">空白で区切ると、まとめて足せます。全角や「ー」は自動でそろえます。</p>`}` : ''}

      <div class="aw-bar"><p>${s.floors}階建て・${us.length}${s.mode === 'floor' ? '個の枠' : '部屋'}</p>
        <button class="btn primary block" id="awSave"${us.length ? '' : ' disabled'}>${edit ? '保存する' : '登録して、訪問の入力へ'}</button>
        <button class="btn block" id="awClose">やめる</button></div>`);
    bindForm(s);
  }

  function bindForm(s) {
    const S = $('#sheet'), again = () => paint(s, true);
    const nm = $('#awName'); if (nm) nm.oninput = () => { s.name = nm.value; };
    $$('[data-fl]', S).forEach(b => b.onclick = () => { s.floors = Math.max(1, Math.min(MAX_FLOORS, s.floors + (+b.dataset.d))); again(); });
    $$('[data-c0]', S).forEach(b => b.onclick = () => { s.cnt0 = Math.max(1, Math.min(60, s.cnt0 + (+b.dataset.d))); again(); });
    $$('[data-fc]', S).forEach(b => b.onclick = () => { const i = +b.dataset.fc; s.cnt[i] = Math.max(0, Math.min(60, (s.cnt[i] == null ? s.cnt0 : s.cnt[i]) + (+b.dataset.d))); again(); });
    $$('[data-mode]', S).forEach(b => b.onclick = () => { s.mode = b.dataset.mode; s.sel = null; again(); });
    $$('[data-fmt]', S).forEach(b => b.onclick = () => { s.fmt = b.dataset.fmt; again(); });
    $$('[data-pre]', S).forEach(b => b.onclick = () => { s.prefix = s.prefix === b.dataset.pre ? '' : b.dataset.pre; again(); });
    const pre = $('#awPre'); if (pre) pre.onchange = () => { s.prefix = cleanUnit(normNum(pre.value)).slice(0, 4); again(); };
    const g1 = $('#awG1'); if (g1) g1.onchange = () => { s.g1 = g1.checked; again(); };
    const lk = $('#awLock'); if (lk) lk.onchange = () => { s.lock = lk.checked; };
    const bn = $('#awBan'); if (bn) bn.onchange = () => { s.ban = bn.value; };
    const sm = $('#awSame'); if (sm) sm.onchange = () => {
      s.same = !sm.checked;
      if (!s.same) s.cnt = Array.from({ length: s.floors }, () => s.cnt0);
      again();
    };
    $$('[data-chip]', S).forEach(b => b.onclick = () => { s.sel = s.sel === b.dataset.chip ? null : b.dataset.chip; again(); });
    if ($('#awSelOff')) $('#awSelOff').onclick = () => { s.sel = null; again(); };
    if ($('#awRenOk')) $('#awRenOk').onclick = () => {
      const v = cleanUnit(normNum($('#awRen').value)); if (!v) { toast('部屋の名前を入れてください'); return; }
      const u = s.sel;
      if (v === u) delete s.ren[u]; else s.ren[u] = v;
      s.sel = null; again();
    };
    if ($('#awDelOne')) $('#awDelOne').onclick = () => {
      const u = s.sel;
      const i = s.extra.indexOf(u);
      if (i >= 0) s.extra.splice(i, 1); else s.del.add(u);
      delete s.ren[u]; s.sel = null; again();
    };
    const ad = $('#awAdd');
    if (ad) ad.oninput = () => { s.freeText = ad.value; };
    const addOk = () => {
      const add = splitUnits(s.freeText); if (!add.length) return;
      const cur = new Set(finalUnits(s));
      add.forEach(u => { s.del.delete(u); if (!cur.has(u)) { s.extra.push(u); cur.add(u); } });
      s.freeText = ''; again();
    };
    if ($('#awAddOk')) $('#awAddOk').onclick = addOk;
    if (ad) ad.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addOk(); } };
    if ($('#awBack')) $('#awBack').onclick = () => { s.step = 'pick'; s.cand = null; paint(s); };
    if ($('#awClose')) $('#awClose').onclick = () => { closeSheet(); if (s.hid) (s.edit ? openBuilding : (id) => openTarget(id, '', false))(s.hid); };
    $('#awSave').onclick = () => save(s);
  }

  /* ---------- 登録 ---------- */
  function save(s) {
    const us = finalUnits(s);
    if (!us.length) { toast('部屋（または階）を入れてください'); return; }
    const label = String(s.name || '').trim().slice(0, 30);
    const hid = s.hid || ('h' + uid());
    const lost = s.edit ? s.h.units.filter(u => !us.includes(u)).length : 0;
    closeSheet();
    commit(`${label || '建物'}を${s.edit ? '保存' : '登録'}しました（${us.length}${s.mode === 'floor' ? '個の枠' : '部屋'}）`, () => {
      let h = s.h ? houseById(hid) : null;
      if (!h) {
        h = { id: hid, terrId: s.tid || null, type: 'apt', lat: s.ll.lat, lng: s.ll.lng, label, units: us, createdAt: new Date().toISOString(), createdBy: me().id };
        D().houses.push(h);
      } else { h.type = 'apt'; h.units = us; h.label = label; }
      if (s.lock) h.lock = true; else delete h.lock;
      if (isAdmin()) { if (s.ban) h.ban = s.ban; else delete h.ban; }
      else if (s.cand && s.cand.b) h.ban = s.cand.b; // 候補の立入禁止。サーバーも候補と照らして確かめる
      if (s.cand) h.cid = s.cand.i;
      if (!s.edit) { delete h.prov; delete h.uk; } // 確かめた建物なので「仮の家」ではなくなる
      const ul = {};
      us.forEach(u => {
        const v = s.ren[u] || (h.ul && h.ul[u]) || (unknownFrame(s, u) ? u + '（部屋不明）' : '');
        if (v && v !== u) ul[u] = cleanUnit(v);
      });
      if (Object.keys(ul).length) h.ul = ul; else delete h.ul;
      if (h.uk) { Object.keys(h.uk).forEach(u => { if (!us.includes(u)) delete h.uk[u]; }); if (!Object.keys(h.uk).length) delete h.uk; }
    });
    if (lost) toast(`部屋 ${lost}件が、置きかわりました。まちがえたら「取り消す」でもどせます`);
    setTimeout(() => { if (s.edit) openBuilding(hid); else openAptSeq(hid); }, 300);
  }

  /* ---------- 家の画面・建物の画面から入るボタン ---------- */
  window.openAptWizard = openWizard;
  window.openConvertApt = hid => openWizard(hid);   // 「アパート・マンションに変える」も、この画面にする
  window.aptQuickHtml = h => {
    if (!h || h.type !== 'house') return '';
    const n = nearby({ lat: h.lat, lng: h.lng }, h.terrId).list.length;
    return `<p class="q">気づいたこと</p><button class="btn block" data-aptwiz="${esc(h.id)}">アパート・マンションだった${n ? `<small style="display:block;font-weight:400">近くの候補 ${n}件から えらべます</small>` : ''}</button>`;
  };
  window.aptRoomsHtml = h => {
    if (!h || h.type !== 'apt') return '';
    const frames = h.units.length && h.units.every(u => FRAME.test(u));
    return `<button class="btn ${frames ? 'primary ' : ''}block" data-aptedit="${esc(h.id)}">${frames || !h.units.length ? '部屋番号を入れる（階ごとにまとめて）' : '部屋を足す・直す・まとめて作る'}</button>`;
  };
  window.aptCandCount = candCount;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-aptwiz]');
    if (a) { e.preventDefault(); openWizard(a.dataset.aptwiz); return; }
    const b = e.target.closest && e.target.closest('[data-aptedit]');
    if (b) { e.preventDefault(); openWizard(b.dataset.aptedit); }
  });
})();
