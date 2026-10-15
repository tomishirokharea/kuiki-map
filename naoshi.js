/* =========================================================
   naoshi.js  まちがえた記録の直し方・二世帯住宅（2026-10-15）

   1. まちがえた記録の直し方
   ・本人：自分の記録を、その日のうち（区域を返す前）に直せる
   ・司会者・グループ監督：自分が持つグループの区域（グループの留守宅カード）の、その日の記録を直せる
   ・区域係：いつでも直せる
   ・直し方：取り消す／会えた⇔留守に変える（記録した時刻は元のまま）。拒否を取り消すと、拒否の印も外れる
   ・入口：家の画面の「あなたの記録：今日 10:12 留守［直す］」（かんたん・くわしい両方）
           区域カード画面の「今日の記録を見る・直す」／グループの区域の「今日の記録を直す」
   ・ほかの人の名前は出さない（時刻と家の場所だけ）
   ・サーバー（Code.gs）でも、同じ決まりで確かめる（画面で隠すだけにしない）

   2. 二世帯住宅
   ・1つの建物に丸印は1つ。中は「部屋が2つ（3つ）の集合住宅」として記録する（部屋＝世帯）
   ・分かれ方：上下（2階・1階／3階・2階・1階）・左右（道から玄関を見て左・右）・前後（奥・表）
   ・地図の印：丸を分かれ方に合わせて分け、世帯ごとの状態で塗る。右上に世帯の数
   ・記録の画面：建物と同じ並びで世帯を出し、1つ記録しても閉じずに次の世帯へ
   ・くわしい表示の人なら、だれでも「二世帯住宅にする」を使える。1軒にもどすのは区域係
   ・世帯の名前は場所だけ（表札の名前・続柄は使わない）

   index.html：<script src="apt-wizard.js"></script> の次に <script src="naoshi.js"></script>
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof openTarget !== 'function') return;

  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.12.6')) {
    CHANGELOG.unshift({ v: '2026.12.6', items: [['直', '電波が悪いときに送り直しても、記録が二重にならないようにしました']] });
  }
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.12.5')) {
    CHANGELOG.unshift({ v: '2026.12.5', items: [
      ['直', 'まちがえた記録を、その日のうちなら自分で直せるようになりました'],
      ['直', '司会者・グループ監督は、グループの区域のその日の記録を直せるようになりました'],
      ['家', '二世帯住宅を、1つの印のまま世帯ごとに記録できるようになりました']
    ] });
  }

  /* ---------- 見た目 ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .fixline{display:flex;align-items:center;gap:10px;background:#F2F6FB;border:1px solid #C9D7E8;border-radius:12px;padding:10px 12px;margin:8px 0}
  .fixline span{flex:1;line-height:1.4}
  .fixline .btn{flex:none;min-height:44px}
  body.simple .fixline .btn{min-height:52px;font-size:18px}
  .fixrow{display:flex;align-items:center;gap:10px;border-bottom:1px solid #E1E5EA;padding:10px 2px}
  .fixrow .ft{flex:1;line-height:1.4}
  .fixrow .ft small{display:block;color:#5E6E77}
  .fixacts .btn{margin-top:10px}
  .dupx{display:grid;gap:8px;margin:10px 0}
  .dupx.ud{grid-template-columns:1fr}
  .dupx.lr{grid-template-columns:1fr 1fr}
  .dupx button.du{border:2px solid #C9D2D8;background:#fff;border-radius:14px;padding:12px;text-align:left;font:inherit;color:inherit;min-height:64px;display:flex;flex-direction:column;justify-content:center}
  .dupx button.du b{font-size:19px}
  .dupx button.du small{color:#5E6E77;font-size:15px;margin-top:2px}
  .dupx button.du.done{background:#E5F2EE;border-color:#9FD0C3}
  .dupx button.du.ref{background:#FBE9E7;border-color:#E3A3A3}
  .dupx button.du.sel{border-color:var(--brand,#17324D);box-shadow:0 0 0 3px rgba(23,50,77,.18)}
  body.simple .dupx button.du b{font-size:22px}
  .pin.dupx-pin{background:none!important;border:0!important;box-shadow:none!important;width:36px;height:36px;border-radius:50%}
  .pin.dupx-pin svg{width:36px;height:36px;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
  .pin.dupx-pin.dim{opacity:.3}
  .pin.dupx-pin.locked{filter:grayscale(1);opacity:.35}
  .pin.dupx-pin s{position:absolute;left:-10px;top:-10px}
  .dulay .choice small{display:block}
  `;
  document.head.appendChild(css);

  /* =========================================================
     1. まちがえた記録の直し方
     ========================================================= */
  const dayNo = t => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const isToday = iso => { const t = Date.parse(iso); return isFinite(t) && dayNo(t) === dayNo(Date.now()); };
  const hhmm = iso => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const terrOfVisit = v => { const h = houseById(v.houseId); return h && h.terrId ? terrById(h.terrId) : null; };
  const returnedSince = (t, at) => !!t && (D().returns || []).some(r => r && r.terrId === t.id && r.at > at);
  function groupHolds(v) {
    if (typeof canGroupTerr !== 'function' || !canGroupTerr()) return false;
    const t = terrOfVisit(v);
    if (t && t.group && t.holder === me().id) return true;
    const k = K(v.houseId, v.unit);
    return activeCards().some(c => c.group && c.by === me().id && Array.isArray(c.keys) && c.keys.includes(k));
  }
  /* 直せる記録か（サーバーの visitCanDelete_ と同じ決まり） */
  function canFixVisit(v) {
    if (!v) return false;
    if (isAdmin()) return true;
    if (!isToday(v.at)) return false;
    if (v.by === me().id) return !returnedSince(terrOfVisit(v), v.at);
    return groupHolds(v);
  }
  function denyMsg(v) {
    if (!isToday(v.at)) return '前の日の記録は、区域係が直します。区域係に頼んでください';
    if (v.by === me().id) return '区域を返したあとの記録は、区域係が直します';
    return 'ほかの人の記録は、区域係に頼んでください';
  }
  window.canFixVisit = canFixVisit;

  /* 直す：action = 'cancel'｜'met'｜'away' */
  function doFix(v, action, after) {
    const cur = D().visits.find(x => x.id === v.id);
    if (!cur) { toast('この記録は、もう取り消されています'); if (after) after(); return; }
    if (!canFixVisit(cur)) { toast(denyMsg(cur)); return; }
    const k = K(cur.houseId, cur.unit);
    const dropDnc = cur.result === 'refused' && !!D().dnc[k] && !visitsOf(k).some(x => x.id !== cur.id && x.result === 'refused');
    const nv = action === 'met' || action === 'away'
      ? { id: uid(), houseId: cur.houseId, unit: cur.unit || '', result: action, at: cur.at, by: me().id } : null;
    const msg = nv ? `「${RESULT_LABEL[action]}」に直しました` : (dropDnc ? '記録を取り消し、拒否の印も外しました' : '記録を取り消しました');
    const fn = () => {
      D().visits = D().visits.filter(x => x.id !== cur.id);
      if (nv) D().visits.push(nv);
      if (dropDnc) delete D().dnc[k];
    };
    if (cur.by === me().id) commit(msg, fn); // 自分の記録：「取り消す」でもとにもどせる
    else { fn(); Store.save(false); renderAll(); toast(msg); } // ほかの人の記録：もどすときは、区域係が記録し直す
    if (after) after();
  }

  /* 記録を消す（家の画面の「これまでの記録」を左にスワイプしたとき）：決まりを広げて置きかえる */
  window.deleteVisit = function (v, after) {
    if (!canFixVisit(v)) { toast(denyMsg(v)); return; }
    doFix(v, 'cancel', after);
  };

  function placeOf(v) {
    const h = houseById(v.houseId);
    if (!h) return '（消された家）';
    const t = h.terrId ? terrById(h.terrId) : null;
    return `${t ? `区域${esc(t.no)}　` : ''}${targetName(h, v.unit)}`;
  }

  /* 直す画面 */
  function openFixVisit(v, back) {
    if (!canFixVisit(v)) { toast(denyMsg(v)); return; }
    const mine = v.by === me().id;
    setSheet(headHtml(null, '記録を直す', `${isToday(v.at) ? '今日' : fmtDate(v.at)} ${hhmm(v.at)}　${RESULT_LABEL[v.result]}`) + `
      <p>${placeOf(v)}</p>
      ${mine ? '' : '<p class="hint-must">グループの記録です（だれの記録かは出ません）</p>'}
      <div class="fixacts">
        ${v.result === 'away' ? '<button class="btn primary block" data-fx="met">「会えた」に変える</button>' : ''}
        ${v.result === 'met' ? '<button class="btn primary block" data-fx="away">「留守」に変える</button>' : ''}
        <button class="btn danger block" data-fx="cancel">${v.result === 'refused' ? '拒否の記録を取り消す' : 'この記録を取り消す'}</button>
        <button class="btn block" id="fxBack">もどる</button>
      </div>
      <p class="hint-must">記録した時刻は、元のまま残ります。直せるのは、その日のうちです。</p>`);
    $$('[data-fx]', $('#sheet')).forEach(b => b.onclick = async () => {
      const a = b.dataset.fx;
      if (a === 'cancel' && !await ask(`${hhmm(v.at)}の「${RESULT_LABEL[v.result]}」の記録を取り消します。よろしいですか？`)) return;
      doFix(v, a, back || closeSheet);
    });
    $('#fxBack').onclick = () => (back ? back() : closeSheet());
  }
  window.openFixVisit = openFixVisit;

  /* 今日の記録の一覧（自分の記録／グループの区域の記録） */
  function openFixList(scope) {
    const since = todayIso();
    const t = scope.tid ? terrById(scope.tid) : null;
    const list = D().visits.filter(v => v.at >= since && isToday(v.at) && (scope.tid
      ? (() => { const h = houseById(v.houseId); return h && h.terrId === scope.tid; })()
      : v.by === me().id)).sort((a, b) => (a.at < b.at ? 1 : -1));
    const rows = list.map(v => `<div class="fixrow"><div class="ft"><b>${hhmm(v.at)}　${RESULT_LABEL[v.result]}</b><small>${placeOf(v)}</small></div>
      ${canFixVisit(v) ? `<button class="btn small" data-fxv="${esc(v.id)}">直す</button>` : '<small class="muted">係が直します</small>'}</div>`).join('');
    setSheet(headHtml(t, scope.tid ? '今日の記録を直す' : '今日の記録', scope.tid ? `区域${t ? esc(t.no) : ''}　${list.length}件（名前は出ません）` : `${list.length}件`) +
      (rows || '<p class="muted">今日の記録はまだありません。</p>') +
      '<p class="hint-must">直せるのは、その日のうちです。次の日からは、区域係が直します。</p><button class="btn block" data-close>閉じる</button>');
    $$('[data-fxv]', $('#sheet')).forEach(b => b.onclick = () => {
      const v = D().visits.find(x => x.id === b.dataset.fxv);
      if (v) openFixVisit(v, () => openFixList(scope));
    });
  }
  window.openFixList = openFixList;

  document.addEventListener('click', e => {
    const x = e.target.closest && e.target.closest('[data-fixday],[data-fixmine]');
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    if (x.dataset.fixday) openFixList({ tid: x.dataset.fixday }); else openFixList({ mine: true });
  }, true);

  /* 区域カード画面：今日の記録の行に「見る・直す」 */
  const _renderToday = window.renderToday;
  window.renderToday = function () {
    const r = _renderToday.apply(this, arguments);
    const box = document.getElementById('todayBox');
    if (box && !box.querySelector('[data-fixmine]')) {
      const since = todayIso(), my = me().id;
      if (D().visits.some(v => v.by === my && v.at >= since)) {
        const d = box.querySelector('.today') || box;
        d.insertAdjacentHTML('beforeend', ' <button type="button" class="btn small" data-fixmine="1">今日の記録を見る・直す</button>');
      }
    }
    return r;
  };
  /* グループの区域カード：「今日の記録を直す」 */
  const _cardHtml = window.cardHtml;
  window.cardHtml = function (t, own) {
    const html = _cardHtml.apply(this, arguments);
    if (!own || !t || !t.group || typeof canGroupTerr !== 'function' || !canGroupTerr()) return html;
    const i = html.lastIndexOf('</article>');
    if (i < 0) return html;
    return html.slice(0, i) + `<div class="actions"><button type="button" class="btn small" data-fixday="${esc(t.id)}">今日の記録を直す</button></div>` + html.slice(i);
  };

  /* 家の画面：「あなたの記録：今日 10:12 留守［直す］」の1行 */
  let curTgt = null;
  const _openTarget = window.openTarget;
  window.openTarget = function (hid, unit) {
    curTgt = { hid, unit: unit || '' };
    return _openTarget.apply(this, arguments);
  };
  const _closeSheet = window.closeSheet;
  window.closeSheet = function () { curTgt = null; return _closeSheet.apply(this, arguments); };

  function fixLineHtml(k) {
    const v = visitsOf(k).find(x => isToday(x.at) && canFixVisit(x));
    if (!v) return '';
    return `<div class="fixline"><span><b>${v.by === me().id ? 'あなたの記録' : '今日の記録'}</b>：今日 ${hhmm(v.at)}　${RESULT_LABEL[v.result]}</span><button type="button" class="btn small" data-fxline="${esc(v.id)}">直す</button></div>`;
  }
  function bindFixLine(S, back) {
    $$('[data-fxline]', S).forEach(b => b.onclick = () => {
      const v = D().visits.find(x => x.id === b.dataset.fxline);
      if (v) openFixVisit(v, back);
    });
  }

  const _setSheet = window.setSheet;
  window.setSheet = function () {
    const r = _setSheet.apply(this, arguments);
    try { afterSheet(); } catch (e) { console.warn(e); }
    return r;
  };
  function afterSheet() {
    const S = document.getElementById('sheet');
    if (!S || !curTgt || S.querySelector('.dupx, .unitstrip, .fixline')) return;
    const h = houseById(curTgt.hid); if (!h) return;
    const title = S.querySelector('#sheetTitle');
    if (!title || title.innerHTML !== targetName(h, curTgt.unit)) return; // 家の記録の画面のときだけ
    const { hid, unit } = curTgt;
    const k = K(hid, unit);
    // 1) 直す の1行（結果をえらぶ画面のとき）
    const res = S.querySelector('[data-res]');
    if (res) {
      const html = fixLineHtml(k);
      if (html) {
        const box = res.closest('.choices') || res;
        box.insertAdjacentHTML('beforebegin', html);
        bindFixLine(S, () => openTarget(hid, unit));
      }
    }
    // 2) 二世帯住宅にする（くわしい表示・一戸建て）
    const ed = S.querySelector('#fEditHouse');
    if (ed && !unit && h.type === 'house' && !isSimple() && !S.querySelector('#fDuplex')) {
      ed.insertAdjacentHTML('afterend', '<button class="btn block" id="fDuplex">二世帯住宅にする</button>');
      S.querySelector('#fDuplex').onclick = () => openDuplexConvert(hid);
    }
  }

  /* =========================================================
     2. 二世帯住宅
     ========================================================= */
  const LAYS = {
    ud: { name: '上下', sub: '2階・1階', units: ['2階', '1階'] },
    ud3: { name: '上下（3世帯）', sub: '3階・2階・1階', units: ['3階', '2階', '1階'], mu: 'ud' },
    lr: { name: '左右', sub: '道から玄関を見て左・右', units: ['左', '右'] },
    fb: { name: '前後', sub: '表と奥（奥にも玄関がある）', units: ['奥', '表'] }
  };
  const LAY_NAME = { ud: '上下', lr: '左右', fb: '前後' };
  const isDuplex = h => !!h && h.type === 'apt' && !!LAY_NAME[h.mu] && Array.isArray(h.units) && h.units.length >= 2;
  window.isDuplex = isDuplex;
  const sideName = u => `${u}の世帯`;

  /* ---------- 地図の印 ---------- */
  const FILL = { todo: '#FFFFFF', done: '#E5F2EE', met: '#E3ECF6', away: '#FFF4CC', ref: '#C62828', faint: '#E6EAEE', lock: '#C9CFCC' };
  const MARK = { done: '#0E7C66', met: '#2F5D8A' };
  function bandIcon(x, y, st, s) {
    if (st === 'done' || st === 'met') return `<path d="M${x - 3.6 * s},${y + 0.2 * s} l${2.6 * s},${2.7 * s} l${4.8 * s},${-5.4 * s}" fill="none" stroke="${MARK[st]}" stroke-width="${2.3 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (st === 'ref') return `<path d="M${x - 2.8 * s},${y - 2.8 * s} l${5.6 * s},${5.6 * s} M${x + 2.8 * s},${y - 2.8 * s} l${-5.6 * s},${5.6 * s}" stroke="#fff" stroke-width="${2 * s}" stroke-linecap="round"/>`;
    if (st === 'away') return `<text x="${x}" y="${y + 3.2 * s}" font-size="${8.5 * s}" text-anchor="middle" fill="#7A5C00" font-weight="700">留</text>`;
    return '';
  }
  function splitSvg(lay, sts) {
    const c = 18, r = 15, n = sts.length, out = [];
    const bands = [];
    if (lay === 'lr') {
      bands.push({ d: `M${c},${c - r} A${r},${r} 0 0 0 ${c},${c + r} Z`, cx: c - r * 0.47, cy: c });
      bands.push({ d: `M${c},${c - r} A${r},${r} 0 0 1 ${c},${c + r} Z`, cx: c + r * 0.47, cy: c });
    } else if (n === 2) {
      bands.push({ d: `M${c - r},${c} A${r},${r} 0 0 1 ${c + r},${c} Z`, cx: c, cy: c - r * 0.47 });
      bands.push({ d: `M${c - r},${c} A${r},${r} 0 0 0 ${c + r},${c} Z`, cx: c, cy: c + r * 0.5 });
    } else {
      const y1 = c - r / 3, y2 = c + r / 3, x1 = Math.sqrt(r * r - (r / 3) * (r / 3));
      bands.push({ d: `M${c - x1},${y1} A${r},${r} 0 0 1 ${c + x1},${y1} Z`, cx: c, cy: c - r * 0.62 });
      bands.push({ d: `M${c - x1},${y1} L${c + x1},${y1} A${r},${r} 0 0 1 ${c + x1},${y2} L${c - x1},${y2} A${r},${r} 0 0 1 ${c - x1},${y1} Z`, cx: c, cy: c });
      bands.push({ d: `M${c - x1},${y2} A${r},${r} 0 0 0 ${c + x1},${y2} Z`, cx: c, cy: c + r * 0.66 });
    }
    bands.forEach((b, i) => out.push(`<path d="${b.d}" fill="${FILL[sts[i]] || FILL.todo}"/>`));
    out.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#17324D" stroke-width="2.2"/>`);
    if (lay === 'lr') out.push(`<line x1="${c}" y1="${c - r}" x2="${c}" y2="${c + r}" stroke="#17324D" stroke-width="2"/>`);
    else if (n === 2) out.push(`<line x1="${c - r}" y1="${c}" x2="${c + r}" y2="${c}" stroke="#17324D" stroke-width="2"/>`);
    else { const x1 = Math.sqrt(r * r - (r / 3) * (r / 3)); out.push(`<line x1="${c - x1}" y1="${c - r / 3}" x2="${c + x1}" y2="${c - r / 3}" stroke="#17324D" stroke-width="1.8"/><line x1="${c - x1}" y1="${c + r / 3}" x2="${c + x1}" y2="${c + r / 3}" stroke="#17324D" stroke-width="1.8"/>`); }
    const s = n === 3 ? 0.62 : 0.78;
    bands.forEach((b, i) => out.push(bandIcon(b.cx, b.cy, sts[i], s)));
    out.push(`<circle cx="30" cy="6" r="5.6" fill="#17324D" stroke="#fff" stroke-width="1.2"/><text x="30" y="8.7" font-size="8" text-anchor="middle" fill="#fff" font-weight="700">${n}</text>`);
    return `<svg viewBox="0 0 36 36" aria-hidden="true">${out.join('')}</svg>`;
  }
  function unitState(h, u, ff, since, locked) {
    if (locked) return 'lock';
    const k = K(h.id, u);
    if (D().dnc[k]) return 'ref';
    if (ff) {
      const f = ff(k);
      if (f === 'dim') return 'faint';
      if (f === 'hl') return 'away';
      if (f === 'done') return 'done';
      if (f === 'prev') return 'met';
      return 'todo';
    }
    const p = pinState(k, since);
    if (p === 'met' || p === 'away') return otherDone(h, k, since) ? 'met' : 'done';
    return p === 'plain' && recentMet(k) ? 'met' : 'todo';
  }
  const _houseIcon = window.houseIcon;
  window.houseIcon = function (h, ff, locked) {
    if (!isDuplex(h)) return _houseIcon.apply(this, arguments);
    const since = periodStart(h);
    const sts = h.units.map(u => unitState(h, u, ff, since, locked));
    const allDim = !locked && ff && sts.every(x => x === 'faint');
    const nb = !locked && typeof roundNums !== 'undefined' && roundNums && roundNums.has(h.id) ? `<s>${roundNums.get(h.id)}</s>` : '';
    return L.divIcon({ className: '', html: `<div class="pin dupx-pin${locked ? ' locked' : ''}${allDim ? ' dim' : ''}" title="二世帯住宅（${LAY_NAME[h.mu]}）">${splitSvg(h.mu, sts)}${nb}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
  };

  /* ---------- 記録の画面 ---------- */
  function openDuplex(hid, selUnit) {
    const h0 = houseById(hid); if (!isDuplex(h0)) return;
    const t = terrById(h0.terrId);
    const since = unitDoneSince(h0);
    const isRef = u => !!D().dnc[K(hid, u)];
    const doneNow = u => !isRef(u) && visitedSince(K(hid, u), since);
    const firstTodo = () => { const h = houseById(hid); return (h && h.units.find(u => !doneNow(u) && !isRef(u))) || null; };
    const st = { unit: selUnit || firstTodo(), step: 'result', age: null, interest: null, override: false };
    const pick = u => { Object.assign(st, { unit: u, step: 'result', age: null, interest: null, override: false }); paint(); };
    const save = (result, extra) => { const u = st.unit; saveVisit(hid, u, result, extra, true); pick(firstTodo()); };

    const paint = () => {
      const h = houseById(hid); if (!isDuplex(h)) { closeSheet(); return; }
      const lay = h.mu, cols = lay === 'lr' && !isSimple() ? 'lr' : 'ud';
      const cell = u => {
        const k = K(hid, u), last = visitsOf(k)[0];
        const cls = isRef(u) ? ' ref' : doneNow(u) ? ' done' : '';
        const sub = isRef(u) ? '拒否の世帯' : doneNow(u) && last ? `済：${RESULT_LABEL[last.result]}　${isToday(last.at) ? hhmm(last.at) : fmtDate(last.at)}` : 'まだ';
        return `<button type="button" class="du${cls}${u === st.unit ? ' sel' : ''}" data-du="${esc(u)}"><b>${esc(sideName(u))}</b><small>${sub}</small></button>`;
      };
      let b = headHtml(t, `二世帯住宅（${LAY_NAME[lay]}）`, lay === 'lr' ? '左・右は、道から玄関を見たときの向きです' : (t ? `区域${esc(t.no)}　${esc(t.name || '')}` : ''));
      b += banNotice(h);
      b += `<div class="dupx ${cols}">${h.units.map(cell).join('')}</div>`;
      if (!st.unit) {
        const all = h.units.every(u => doneNow(u) || isRef(u));
        b += `<div class="okmsg"><b>${all ? 'すべての世帯を訪ねました。' : '世帯を押すと、その世帯を記録できます。'}</b></div>
          <button class="btn primary block" data-close>閉じる</button>`;
      } else {
        const u = st.unit, k = K(hid, u), f = fol(k), last = visitsOf(k)[0];
        const other = !!f && f.by !== me().id;
        b += `<p class="seqroom"><b>${esc(sideName(u))}</b></p>`;
        b += `<p class="muted">${last ? `前回：${fmtDate(last.at)}　${RESULT_LABEL[last.result]}` : 'はじめて訪ねる世帯'}</p>`;
        b += fixLineHtml(k);
        b += recentOtherHtml(k);
        if (D().dnc[k]) b += `<div class="notice refnote"><b>拒否の世帯です。</b>訪問しないでください。${h.units.length > 1 ? 'ほかの世帯は訪ねられます。' : ''}</div>`;
        else if (other && !isAdmin() && !st.override && recentMet(k)) b += `<div class="notice warn"><b>再訪問を受け持っている人がいます。</b>訪問は控えてください。<span class="actions"><button class="btn small" id="duOverride">それでも記録する</button></span></div>`;
        else b += st.step === 'result' ? resultChoicesHtml('') : seqStepsHtml(st, k);
        b += '<button class="btn block" data-close>閉じる</button>';
      }
      b += navLink(h);
      if (!isSimple()) {
        b += `<details class="more"><summary>この建物の編集</summary>
          <p class="hint">分かれ方：${LAY_NAME[lay]}（${h.units.map(esc).join('・')}）</p>
          ${isAdmin() ? '<button class="btn block" id="duUndo">1軒の家にもどす（区域係）</button>' : '<p class="hint">1軒の家にもどすときは、区域係に頼んでください。</p>'}
          ${delReqOf(h.id) ? '<p class="tag-warn">この建物は削除を申請中です（区域係の確認待ち）</p>' : `<button class="btn small danger" id="duDel">${isAdmin() ? 'この建物を削除する' : 'この建物の削除を申請する'}</button>`}
        </details>`;
      }
      setSheet(b);

      const S = $('#sheet'), k = st.unit ? K(hid, st.unit) : null;
      $$('[data-du]', S).forEach(x => x.onclick = () => pick(x.dataset.du));
      $$('[data-res]', S).forEach(x => x.onclick = () => {
        const r = x.dataset.res;
        if (r === 'met') { if (metNext(st, k, save)) paint(); }
        else if (r === 'refused') { st.step = 'dnc'; paint(); }
        else save('away', {});
      });
      $$('[data-age]', S).forEach(x => x.onclick = () => { st.age = x.dataset.age; if (metNext(st, k, save)) paint(); });
      $$('[data-int]', S).forEach(x => x.onclick = () => {
        const it = x.dataset.int;
        if (it === '拒否') { st.step = 'dnc'; paint(); }
        else if (INTERESTED.has(it) && !fol(k)) { st.interest = it; st.step = 'follow'; paint(); }
        else save('met', { age: st.age, interest: it });
      });
      $$('[data-fol]', S).forEach(x => x.onclick = () => { if (x.dataset.fol === '1') { st.step = 'memo'; paint(); } else save('met', {}); });
      $$('[data-memosave]', S).forEach(x => x.onclick = () => {
        saveFollowVisit(hid, st.unit, $('#stepMemo').value, true, readNext('stepNext'));
        pick(firstTodo());
      });
      $$('[data-refok]', S).forEach(x => x.onclick = () => save('refused', { age: st.age, dnc: true }));
      $$('[data-back]', S).forEach(x => x.onclick = () => { st.step = x.dataset.back; paint(); });
      bindFixLine(S, () => openDuplex(hid, st.unit));
      const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
      on('duOverride', () => { st.override = true; paint(); });
      on('duUndo', () => undoDuplex(hid));
      on('duDel', async () => {
        if (!isAdmin()) { closeSheet(); openDelRequest(h); return; }
        if (!await ask('この二世帯住宅と、すべての世帯の記録を削除します。よろしいですか？')) return;
        closeSheet(); deleteHouse(hid);
      });
    };
    paint();
  }
  window.openDuplex = openDuplex;
  const _openAptSeq = window.openAptSeq;
  window.openAptSeq = function (hid, startUnit) { return isDuplex(houseById(hid)) ? openDuplex(hid, startUnit) : _openAptSeq.apply(this, arguments); };
  const _openBuilding = window.openBuilding;
  window.openBuilding = function (hid) { return isDuplex(houseById(hid)) ? openDuplex(hid) : _openBuilding.apply(this, arguments); };

  /* ---------- 二世帯住宅にする（くわしい表示の人なら、だれでも） ---------- */
  function openDuplexConvert(hid) {
    if (typeof simpleBlock === 'function' && simpleBlock('二世帯住宅に変えることは')) return;
    const h = houseById(hid); if (!h || h.type !== 'house') return;
    const t = terrById(h.terrId), k0 = K(hid, '');
    const fixable = visitsOf(k0).filter(v => isToday(v.at) && v.by === me().id && canFixVisit(v));
    const st = { lay: null, assign: {} };
    const paint = () => {
      let b = headHtml(t, '二世帯住宅にする', esc(h.label || '一戸建て'));
      if (!st.lay) {
        b += `<p>玄関・インターホン・ポストが2つあるときに使います。迷ったときは、1軒のままにしてください。</p>
          <p class="q">分かれ方をえらんでください</p>
          <div class="choices dulay">${Object.keys(LAYS).map(id => `<button class="choice" data-lay="${id}">${LAYS[id].name}<small>${LAYS[id].sub}</small></button>`).join('')}</div>
          <p class="hint-must">世帯の名前は場所（2階・左など）だけです。表札の名前は使いません。</p>
          <button class="btn block" id="dcBack">もどる</button>`;
      } else {
        const L0 = LAYS[st.lay];
        b += `<p class="q">今日の記録は、どの世帯の記録ですか？</p>`;
        fixable.forEach(v => {
          const cur = st.assign[v.id] || '';
          b += `<p><b>今日 ${hhmm(v.at)}　${RESULT_LABEL[v.result]}</b></p>
            <div class="choices two">${L0.units.map(u => `<button class="choice${cur === u ? ' on' : ''}" data-as="${esc(v.id)}" data-u="${esc(u)}" aria-pressed="${cur === u}">${esc(sideName(u))}</button>`).join('')}
            <button class="choice${cur === '?' ? ' on' : ''}" data-as="${esc(v.id)}" data-u="?" aria-pressed="${cur === '?'}">分からない</button></div>`;
        });
        b += `<p class="hint">「分からない」を選んだ記録は、建物の記録として残り、どの世帯も「まだ」になります。</p>
          <button class="btn primary block" id="dcSave"${fixable.every(v => st.assign[v.id]) ? '' : ' disabled'}>二世帯住宅（${L0.name}）にする</button>
          <button class="btn block" id="dcBack2">分かれ方をえらび直す</button>`;
      }
      setSheet(b);
      const S = $('#sheet');
      $$('[data-lay]', S).forEach(x => x.onclick = () => { st.lay = x.dataset.lay; if (!fixable.length) save(); else paint(); });
      $$('[data-as]', S).forEach(x => x.onclick = () => { st.assign[x.dataset.as] = x.dataset.u; sheetKeep = true; paint(); });
      const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
      on('dcBack', () => openTarget(hid, '', false));
      on('dcBack2', () => { st.lay = null; paint(); });
      on('dcSave', save);
    };
    const save = () => {
      const L0 = LAYS[st.lay];
      const units = L0.units.slice(), mu = L0.mu || st.lay;
      const fn = () => {
        const h2 = houseById(hid); if (!h2) return;
        h2.type = 'apt'; h2.units = units; h2.mu = mu;
        if (!h2.label) h2.label = '二世帯住宅';
        delete h2.prov; delete h2.uk; delete h2.ul; delete h2.lock;
        fixable.forEach(v => {
          const u = st.assign[v.id];
          if (!u || u === '?') return;
          D().visits = D().visits.filter(x => x.id !== v.id);
          D().visits.push({ id: uid(), houseId: hid, unit: u, result: v.result, at: v.at, by: me().id });
        });
      };
      const msg = `二世帯住宅（${L0.name}）にしました`;
      closeSheet();
      if (isAdmin()) commit(msg, fn);
      else { fn(); Store.save(false); renderAll(); toast(msg + '。もどすときは区域係に頼んでください'); } // 1軒にもどすのは区域係だけなので、「取り消す」は出さない
      setTimeout(() => openDuplex(hid), 300);
    };
    paint();
  }
  window.openDuplexConvert = openDuplexConvert;

  /* ---------- 1軒の家にもどす（区域係） ---------- */
  async function undoDuplex(hid) {
    if (!isAdmin()) { toast('1軒の家にもどすときは、区域係に頼んでください'); return; }
    const h = houseById(hid); if (!isDuplex(h)) return;
    const n = h.units.reduce((a, u) => a + visitsOf(K(hid, u)).length, 0);
    if (!await ask(`1軒の家にもどします。${n ? `世帯ごとの記録 ${n}件は、地図の印からは見えなくなります。` : ''}よろしいですか？`)) return;
    closeSheet();
    commit('1軒の家にもどしました', () => {
      const h2 = houseById(hid); if (!h2) return;
      h2.units.forEach(u => { const k = K(hid, u); delete D().dnc[k]; delete D().follows[k]; delete D().released[k]; });
      h2.type = 'house'; h2.units = []; delete h2.mu;
      if (h2.label === '二世帯住宅') h2.label = '';
    });
  }
})();
