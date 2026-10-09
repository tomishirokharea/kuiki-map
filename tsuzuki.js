/* =========================================================
   tsuzuki.js  途中で返された区域を、次の人が「続きから」回れるようにする
   ・index.html の <script src="kantan.js"></script> の「あと」に1行足して読み込む
   ・index.html / schedule.js / kantan.js は書きかえない（関数をつつんで足す）

   しくみ
   ・区域に2項目：t.roundFrom（今の1回目を回りはじめた日）／ t.lastRoundFrom（途中で返したとき残す日）
   ・受け取る・貸し出す・担当えらびは、すべて commit() を通るので、そこで1か所だけ見て決める
   ・「続きから」の条件：途中で返された区域・返されてから設定の日数以内（はじめ60日・0＝使わない）・lastRoundFrom がある
   ・緑のチェックなどの基準は roundFrom（なければ受け取った日）。返却の目安・S-13・returns は今までどおり
   ・個人情報：次の人には「前の人」とだけ出す。名前・年代・メモは出さない

   スペイン語の辞書に足す日本語：
   続きから／前の人が／回りました／に返却／この回で訪ねた家・部屋／前の人／あなた／まだ／
   この区域は、前の人の続きです。緑のチェックの家は、もう訪ねてあります。白い家から回ってください。／
   前の人が{n}軒回りました。白い家 {m}軒が残っています。／
   前の人の続き（{日}から回っています）／
   途中で返された区域を、次の人が続きから回る期間／0にすると使いません
   ========================================================= */
(function () {
  'use strict';
  if (typeof Store === 'undefined' || typeof D !== 'function' || typeof commit !== 'function' ||
      typeof roundInfo !== 'function' || typeof terrById !== 'function' || typeof setSheet !== 'function') return;

  const DAYMS = 86400000;
  const esc2 = s => (typeof esc === 'function' ? esc(s) : String(s));
  const contDays = () => { const v = D().settings.contDays; return v == null || v === '' ? 60 : (Number(v) || 0); };
  /* schedule.js の isPartial と同じ：担当者なし・留守宅カードで回っていない・回り終えた日より後に返却 */
  const isPartial = t => !!t && !t.holder && !t.awayPoolAt && !!t.returnedAt && (!t.completedAt || t.returnedAt > t.completedAt);
  /* 受け取るとき「続きから」になる区域か（受け取る前の状態で調べる） */
  function canCont(t) {
    if (!isPartial(t) || !t.lastRoundFrom) return false;
    const d = contDays();
    return !!d && (Date.now() - Date.parse(t.returnedAt)) <= d * DAYMS;
  }
  /* 今、続きから回っている区域か */
  const isCont = t => !!t && !!t.holder && !!t.roundFrom && !!t.lentAt && t.roundFrom < t.lentAt;
  const simple = () => { try { return typeof isSimple === 'function' && isSimple(); } catch (e) { return false; } };

  /* ---------- 1 受け取り・返却の決まり（commit をつつむ） ---------- */
  const _commit = window.commit;
  window.commit = function (msg, fn, onUndo) {
    const f = function () {
      const pre = new Map();
      try {
        D().territories.forEach(t => pre.set(t.id, { holder: t.holder, lentAt: t.lentAt, cont: canCont(t), rf: t.roundFrom || t.lentAt || '', pool: t.awayPoolAt, comp: t.completedAt }));
      } catch (e) { console.error(e); }
      const ret = fn.apply(this, arguments);
      try {
        D().territories.forEach(t => {
          const p = pre.get(t.id); if (!p) return;
          if (!p.holder && t.holder && t.lentAt) {            // 新しく受け取った・貸し出した
            if (p.cont) t.roundFrom = t.lastRoundFrom; else t.roundFrom = t.lentAt;
            delete t.lastRoundFrom;
          } else if (p.holder && t.holder && t.lentAt && t.lentAt !== p.lentAt) { // 担当者を入れかえた＝新しく回りはじめる
            t.roundFrom = t.lentAt; delete t.lastRoundFrom;
          } else if (p.holder && !t.holder) {                   // 返した
            if (t.awayPoolAt !== p.pool || t.completedAt !== p.comp) { delete t.lastRoundFrom; }   // 留守宅カードにした／回り終えた
            else if (p.rf) t.lastRoundFrom = p.rf;                                                   // 途中で返した
            delete t.roundFrom;
          }
        });
      } catch (e) { console.error(e); }
      return ret;
    };
    return _commit.call(this, msg, f, onUndo);
  };

  /* ---------- 2 「回りはじめた日」を使う場所 ---------- */
  const _roundInfo = window.roundInfo;
  window.roundInfo = function (tid, anyHolder) {
    const t = terrById(tid);
    if (!t || !t.holder || !isCont(t)) return _roundInfo.apply(this, arguments);
    const l = t.lentAt; t.lentAt = t.roundFrom;   // 計算のあいだだけ（同期処理なので他と混ざらない）
    try { return _roundInfo.apply(this, arguments); } finally { t.lentAt = l; }
  };
  window.periodStart = function (h) {
    const t = h.terrId ? terrById(h.terrId) : null;
    if (!t) return '';
    if (t.holder && t.roundFrom) return t.roundFrom;
    if (!t.holder && t.lastRoundFrom && isPartial(t)) return t.lastRoundFrom; // 担当者のいない途中返却：どこまで回ったかが分かる
    return t.lentAt || t.returnedAt || t.completedAt || '';
  };
  window.unitDoneSince = function (h) {
    const t = terrById(h.terrId);
    return myTerr(t) && t.lentAt ? (t.roundFrom || t.lentAt) : todayIso();
  };

  /* 続きの区域の数（前の人／あなた／まだ）。開いたときだけ、その区域の家だけで数える */
  function contCounts(t) {
    const r = roundInfo(t.id, true); if (!r) return null;
    let prev = 0, mine = 0;
    r.map.forEach((st, k) => {
      if (st !== 'done' && st !== 'other') return;
      if (visitsOf(k).some(v => v.at >= t.roundFrom && v.at < t.lentAt)) prev++; else mine++;
    });
    return { prev, mine, todo: r.c.todo };
  }
  /* 空いている区域の「前の人が回った数」（受け取る前の一覧用）。受け取ったと仮定して数える */
  function freeCounts(t) {
    const h0 = t.holder, l0 = t.lentAt;
    t.holder = '_free'; t.lentAt = t.lastRoundFrom;
    try {
      const r = _roundInfo(t.id, true); if (!r) return null;
      const inc = D().settings.skipDone !== 0 ? r.c.recent : 0;
      return { done: r.c.done + inc, total: r.c.todo + r.c.done + inc, todo: r.c.todo };
    } catch (e) { return null; } finally { t.holder = h0; t.lentAt = l0; }
  }

  /* ---------- 3 画面 ---------- */
  /* 区域カード：小さく「続きから」／「この回で訪ねた家」 */
  const _cardHtml = window.cardHtml;
  window.cardHtml = function (t, own) {
    let html = _cardHtml.apply(this, arguments);
    if (own && isCont(t)) {
      try {
        const since = Date.parse(t.roundFrom), s = typeof terrStats === 'function' ? terrStats(t, since) : null;
        if (s) html = html.replace(/受け取ってから訪問した家・部屋 \d+ \/ \d+/, `この回で訪ねた家・部屋 ${s.visited} / ${s.n}`);
        html = html.replace('</button>', `</button><p class="muted"><b>続きから</b>${simple() ? '' : '（前の人が回った家は、緑のチェックです）'}</p>`);
      } catch (e) { console.error(e); }
    }
    return html;
  };

  /* 受け取るときの確認 */
  const _ask = window.ask;
  window.ask = function (msg, o) {
    try {
      const m = /^区域(.+?)を受け取ります。よろしいですか？$/.exec(String(msg));
      if (m) {
        const t = D().territories.find(x => String(x.no) === m[1] && !x.holder);
        if (t && canCont(t)) msg = `区域${m[1]}を受け取ります。この区域は、前の人の続きです。緑のチェックの家は、もう訪ねてあります。白い家から回ってください。よろしいですか？`;
      }
    } catch (e) { console.error(e); }
    return _ask.call(this, msg, o);
  };

  /* 「区域をもらう」一覧の表示／係のカルテ（setSheet に入る文を整える） */
  const _setSheet = window.setSheet;
  window.setSheet = function (html) {
    try {
      if (typeof html === 'string') {
        if (html.indexOf('class="pick"') >= 0 && /data-(take|ask)="t/.test(html)) {
          html = html.replace(/<article class="pick">[\s\S]*?<\/article>/g, a => {
            const m = /data-(?:take|ask)="([^"]+)"/.exec(a), t = m ? terrById(m[1]) : null;
            if (!t || !canCont(t)) return a;
            const c = freeCounts(t); if (!c) return a;
            const txt = simple() ? `続きから　あと${c.todo}軒`
              : `続きから　前の人が ${c.done} / ${c.total}軒 回りました（${typeof fmtDay === 'function' ? fmtDay(t.returnedAt) : ''}に返却）`;
            const tag = `<span class="ptag">${txt}</span>`;
            return /<span class="ptag">[\s\S]*?<\/span>/.test(a) ? a.replace(/<span class="ptag">[\s\S]*?<\/span>/, tag)
              : a.replace(/(<p class="muted">[^<]*)(<\/p>)/, `$1 ${tag}$2`);
          });
        }
        if (html.indexOf('のカルテ</h2>') >= 0) {
          const m = /区域(.+?)のカルテ<\/h2>/.exec(html);
          const t = m ? D().territories.find(x => String(x.no) === m[1] && x.holder) : null;
          if (t && isCont(t)) {
            const line = `<p class="muted"><b>前の人の続き</b>（${typeof fmtDay === 'function' ? fmtDay(t.roundFrom) : ''}から回っています）</p>`;
            html = html.replace(/(<div class="cover [^"]*" role="status">[\s\S]*?<\/div><\/div>)/, '$1' + line);
          }
        }
      }
    } catch (e) { console.error(e); }
    return _setSheet.call(this, html);
  };

  /* 「?」の中：前の人 ／ あなた ／ まだ */
  const _renderLegend = window.renderLegend;
  if (typeof _renderLegend === 'function') {
    window.renderLegend = function () {
      const out = _renderLegend.apply(this, arguments);
      try {
        const t = typeof roundTerr !== 'undefined' && roundTerr ? terrById(roundTerr) : null;
        const box = document.getElementById('legendInfo'), bar = box && box.querySelector('.progress.big');
        if (t && isCont(t) && bar) {
          const c = contCounts(t);
          if (c) bar.insertAdjacentHTML('afterend', `<p class="muted">前の人 <b>${c.prev}軒</b> ／ あなた <b>${c.mine}軒</b> ／ まだ <b>${c.todo}軒</b></p>`);
        }
      } catch (e) { console.error(e); }
      return out;
    };
  }

  /* はじめて地図を開いたとき：案内を1つ（押すと消える。同じ区域・同じ受け取りでは1回だけ） */
  const _openTerr = window.openTerr;
  if (typeof _openTerr === 'function') {
    window.openTerr = function (id) {
      const out = _openTerr.apply(this, arguments);
      try {
        const t = terrById(id);
        if (t && isCont(t) && t.holder === me().id) {
          const key = 'km_cont_' + t.id + '_' + t.lentAt;
          let seen = false;
          try { seen = !!localStorage.getItem(key); } catch (e) { /* 保存できなくても動く */ }
          if (!seen) {
            const c = contCounts(t);
            if (c) setTimeout(() => {
              const old = document.getElementById('kmContBanner'); if (old) old.remove();
              const b = document.createElement('button');
              b.type = 'button'; b.id = 'kmContBanner';
              b.textContent = `前の人が${c.prev}軒回りました。白い家 ${c.todo}軒が残っています。`;
              b.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:2000;background:#14532D;color:#fff;border:0;border-radius:14px;padding:14px 16px;font-size:18px;font-weight:700;line-height:1.5;text-align:left;box-shadow:0 4px 14px rgba(0,0,0,.35)';
              b.onclick = () => b.remove();
              document.body.appendChild(b);
              setTimeout(() => { if (b.parentNode) b.remove(); }, 20000);
              try { localStorage.setItem(key, '1'); } catch (e) { /* 何もしない */ }
            }, 700);
          }
        }
      } catch (e) { console.error(e); }
      return out;
    };
  }

  /* 係の設定：続きから回る期間（「返却の目安」の下に足す） */
  const _renderInbox = window.renderInbox;
  if (typeof _renderInbox === 'function') {
    window.renderInbox = function () {
      const out = _renderInbox.apply(this, arguments);
      try {
        const box = document.getElementById('adTakeSet');
        if (box && !box.querySelector('[data-range="contDays"]')) {
          const v = contDays();
          box.insertAdjacentHTML('beforeend', `<div class="setrow">
      <span>途中で返された区域を、次の人が続きから回る期間<br><small class="hint">途中で返却された区域を、この日数のあいだに受け取ると、前の人が訪ねた家は「済み」のまま続きから回れます。0にすると使いません</small></span>
      <div class="rng"><input type="range" min="0" max="365" step="5" value="${v}" data-range="contDays" data-unit="日" aria-label="日数"><output>${v}日</output></div></div>`);
        }
      } catch (e) { console.error(e); }
      return out;
    };
  }

  /* 更新のお知らせ */
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.11.27')) {
    CHANGELOG.unshift({ v: '2026.11.27', items: [['続', '途中で返された区域を、次の人が続きから回れるようにしました']] });
  }

  /* 画面ができたあと：今の状態にそろえる */
  try { if (Store.data && typeof map !== 'undefined' && map) renderAll(); } catch (e) { console.error(e); }
})();
