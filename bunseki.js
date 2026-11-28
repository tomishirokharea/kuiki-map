/* =========================================================
   区域係の「分析用に書き出す」（bunseki.js・2026.13.178・2026-11-28）

   ねらい：区域の回り方の今の様子を、AI（Claude・ChatGPT・Gemini など。無料版も）に読ませて、
          分析・アイデア・「区域の決まり」をどう変えるとよさそうかの助言をもらう
   ・ボタンは係の画面の「状況」タブのいちばん上（「？ この画面の使い方」の左）。区域係だけ
   ・書き出すのは、区域番号・時間帯・件数・日数・割合と、区域の決まり（今の値と「変えると」の説明）だけ。
     人の名前・番号、住所、家の位置、家ごと・人ごとの記録、注意の文、メモ、特別区域は入れない
   ・数え方は画面と同じ関数を使う：時間帯の表（KM.slotAgg）、区域カードと留守宅カード（JG・JGUI.inputs）、
     期限（KM.dueInfo）、まだ会えていない割合（KM.awayRate）、設定の説明（help.js の KUIKI_HELP）
   ・係の端末の中で作るだけ。サーバーには送らない（書き出しの履歴に「だれが・いつ」だけ残す。中身は残さない）
   ・書き出す中身は AI に読ませるものなので、スペイン語の画面でも日本語のまま（ボタンと画面は訳す）
   ========================================================= */
(function () {
  'use strict';
  if (typeof window.renderAdmin !== 'function') return;

  const KMx = () => window.KM || {};
  const pad2 = n => String(n).padStart(2, '0');
  const ymdOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dOnly = s => (s ? String(s).slice(0, 10) : '');
  const DAY = 86400000;
  const daysBetween = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return isFinite(x) && isFinite(y) ? Math.round((y - x) / DAY) : ''; };
  const pct = (m, n) => (n ? Math.round(m / n * 100) : '');
  const FEW = 5; // 訪問が5件未満の割合は「参考」（時間帯の表の SL_FEW と同じ）

  // 出さない設定（通信・表示・連携など、回り方と関係のないもの）
  const SKIP_SET = ['syncGroupSec', 'syncNormalSec', 'cacheDays', 'mapStd', 's21On', 'ikenOn', 'ikenWho', 'wxOn', 'obiOn', 'memoSync'];

  /* CSV の1行。カンマ・"・改行があれば囲む（改行は空白にする） */
  function csv(rows) {
    return rows.map(r => r.map(c => {
      if (typeof c === 'number') return String(c);
      const s = String(c == null ? '' : c).replace(/[\r\n]+/g, ' ');
      return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
  }

  /* 期間：months＝4 か 12。時間帯の表と同じく、今月をふくむ months か月（月初から） */
  function period(months) {
    const now = new Date(), from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    return { months, from, fromS: ymdOf(from), todayS: ymdOf(now), now };
  }

  /* ---------- 3・4：曜日×時間帯（時間帯の表と同じ数え方） ---------- */
  function slotPart(p) {
    const K = KMx(), SLB = K.SLB || [], SLC = K.SLC || [];
    const agg = typeof K.slotAgg === 'function' ? K.slotAgg() : new Map();
    const terrs = (typeof K.eligible === 'function' ? K.eligible() : []);
    const noOf = new Map(terrs.map(t => [t.id, t.no]));
    const all = new Map(), per = [];
    agg.forEach((a, tid) => {
      if (!noOf.has(tid)) return;
      for (let b = 0; b < SLB.length; b++) for (let c = 0; c < SLC.length; c++) {
        let n = 0, m = 0;
        for (let off = 0; off < p.months; off++) { n += a[off * 30 + b * 3 + c]; m += a[off * 30 + 15 + b * 3 + c]; }
        if (!n) continue;
        const k = SLC[c] + ',' + SLB[b];
        const x = all.get(k) || [0, 0]; x[0] += n; x[1] += m; all.set(k, x);
        per.push([noOf.get(tid), SLC[c], SLB[b], n, m, n >= FEW ? pct(m, n) : '参考']);
      }
    });
    const allRows = [];
    SLC.forEach(c => SLB.forEach(b => { const x = all.get(c + ',' + b); if (x) allRows.push([c, b, x[0], x[1], x[0] >= FEW ? pct(x[1], x[0]) : '参考']); }));
    per.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja', { numeric: true }) || SLC.indexOf(a[1]) - SLC.indexOf(b[1]) || SLB.indexOf(a[2]) - SLB.indexOf(b[2]));
    return { allRows, per };
  }

  /* ---------- 5：区域カードと留守宅カード（状況のグラフと同じ数え方） ---------- */
  function cardPart(p) {
    const out = { total: { area: [0, 0, 0, 0], card: [0, 0, 0, 0], unsplit: [0, 0, 0, 0] }, per: [] };
    if (!window.JG || !window.JGUI || typeof JGUI.inputs !== 'function') return out;
    const inp = JGUI.inputs(); inp.terr = true; inp.from = p.fromS;
    const r = JG.build(inp);
    const rows = JG.detail(r, { from: p.fromS, to: r.today });
    const noOf = new Map(D().territories.map(t => [t.id, t.no]));
    rows.forEach(x => {
      const line = [noOf.get(x.terr) || ''];
      ['area', 'card', 'unsplit'].forEach(c => {
        const t = x[c], n = t.met + t.refused + t.away;
        const T = out.total[c]; T[0] += n; T[1] += t.met; T[2] += t.away; T[3] += t.refused;
        line.push(n, t.met);
      });
      if (line.slice(1).some(v => v)) out.per.push(line);
    });
    out.per.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja', { numeric: true }));
    return out;
  }

  /* ---------- 6：区域の一覧 ---------- */
  function terrPart() {
    const K = KMx(), today = new Date().toISOString();
    const terrs = (typeof K.eligible === 'function' ? K.eligible() : []).slice()
      .sort((a, b) => String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }));
    return terrs.map(t => {
      let aza = '';
      try { if (typeof AGE_ON !== 'undefined' && AGE_ON && typeof terrAza === 'function') aza = terrAza(t).slice().sort((a, b) => b.r - a.r).map(a => azaShow(a.n)).filter(Boolean).slice(0, 3).join('・'); } catch (e) { aza = ''; }
      const lent = isLent(t), since = t.holder ? t.lentAt : t.paperLentAt;
      const st = lent ? (t.holder ? '貸出中' : '貸出中（紙）') : t.awayPoolAt ? '留守宅カード' : lendMode(t) === 'stop' ? '貸出中止' : '空き';
      let due = null; try { due = typeof K.dueInfo === 'function' ? K.dueInfo(t) : null; } catch (e) { due = null; }
      let homes = 0; try { homes = housesOf(t.id).reduce((a, h) => a + targets(h).length, 0); } catch (e) { homes = ''; }
      let away = ''; try { const a = typeof K.awayRate === 'function' ? K.awayRate(t) : null; away = a == null ? '' : Math.round(a * 100); } catch (e) { away = ''; }
      let young = ''; try { const y = typeof K.youngPct === 'function' ? K.youngPct(t) : null; young = y == null ? '' : Math.round(y); } catch (e) { young = ''; }
      return [t.no, t.pno || '', aza, st, lent && since ? daysBetween(since, today) : '', lent && overDue(t) ? 'はい' : '',
        due && due.last ? due.last : '', due && due.left != null ? due.left : '', homes, away, young];
    });
  }

  /* ---------- 7：返却の記録（期間内） ---------- */
  function retPart(p) {
    const noOf = new Map(D().territories.filter(t => !t.dummy && !isSpecial(t)).map(t => [t.id, t.no]));
    return (D().returns || []).filter(r => r && noOf.has(r.terrId) && dOnly(r.at) >= p.fromS)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .map(r => [noOf.get(r.terrId), dOnly(r.lentAt), dOnly(r.at), r.lentAt ? daysBetween(r.lentAt, r.at) : '',
        r.completed ? '正式な返却' : r.ho ? '留守宅カードに切りかえ' : '途中の返却', r.pct == null ? '' : r.pct,
        r.ga ? '全体の集まり' : r.g ? 'グループ奉仕' : '個人']);
  }

  /* ---------- 8：区域の決まり ---------- */
  function setPart() {
    const H = window.KUIKI_HELP, s = (D().settings || {});
    if (!H || !H.def || !H.ja) return [];
    return Object.keys(H.def).filter(k => SKIP_SET.indexOf(k) < 0 && H.ja[k]).map(k => {
      const h = H.ja[k], v = Object.prototype.hasOwnProperty.call(s, k) && s[k] != null && s[k] !== '' ? s[k] : H.def[k];
      return [h.t || k, k, typeof v === 'object' ? JSON.stringify(v) : v, h.dt || H.def[k], h.what || '', h.change || ''];
    });
  }

  const PROMPT = [
    'あなたは、地域を家から家へ訪ねる活動で、「区域」の回り方を区域係と一緒に考える相談相手です。',
    'このファイルは、区域係のアプリから書き出した集計です。目的は、まだ会えていない人（特に若い世代）に、曜日や時間帯を工夫して会えるようにすることです。',
    '次のことを守って、日本語で、やさしい言葉で答えてください。',
    '1. 記録から分かる事実と、あなたの推定を分けて書く（推定には「推定」と書く）',
    '2. 「区域の決まり」を変える提案は、下の表の「名前」（アプリの画面の表示）で、「今の値 → 提案の値」の形で書く。変えたときの良い面と悪い面の両方を書く',
    '3. 訪問が5件未満の割合（表では「参考」）は、参考程度として扱う',
    '4. このファイルに人の名前・住所は入っていない。個人を推測しない',
    '5. 時間は記録を入力した時刻なので、あとからまとめて入力した記録は、実際の訪問時間とずれることがある',
    '6. 最後に、区域係が今月できることを3つまでにまとめる'
  ].join('\n');

  /* 書き出す文の全体 */
  function text(months) {
    const p = period(months === 4 ? 4 : 12);
    const slot = slotPart(p), card = cardPart(p), terr = terrPart(), ret = retPart(p), set = setPart();
    const none = '（記録なし）';
    const tb = (rows, head) => (rows.length ? csv([head].concat(rows)) : none);
    const ct = card.total, cRow = (name, a) => [name, a[0], a[1], a[0] >= FEW ? pct(a[1], a[0]) : '参考', a[2], a[3]];
    const SLB = KMx().SLB || [];
    return [
      '# 区域の回り方の分析用データ（区域マップ）',
      '',
      '## 1. AI へのお願い',
      PROMPT,
      '',
      '## 2. 前提',
      csv([['項目', '内容'],
        ['作った日', p.todayS],
        ['期間', `直近${p.months}か月（${p.fromS} から ${p.todayS}）`],
        ['区域の数', terr.length],
        ['時間帯の区切り', '朝＝11時まで／昼＝11〜14時／午後＝14〜17時／夕方＝17〜19時／夜＝19時から'],
        ['曜日の分け方', '平日・土曜・日曜（祝日は日曜に数える）'],
        ['3・4の数え方', '訪問＝記録の数。会えた側＝会えた＋拒否（人が出てきた）'],
        ['5の数え方', '同じ日の同じ家（部屋）は1軒。結果は 会えた＞拒否＞留守 の順で1つ。区域カード＝区域を受け取って回った分、留守宅カード＝会えていない家だけを回った分、分けられない＝古い記録で見分けられない分'],
        ['入っていないもの', '特別区域（コンビニ・集合住宅など）・人の名前や番号・住所・家ごとの記録']]),
      '',
      `## 3. 全体：曜日×時間帯（時間帯の区切りの順：${SLB.join('・')}）`,
      tb(slot.allRows, ['曜日', '時間帯', '訪問', '会えた側', '会えた側の割合%']),
      '',
      '## 4. 区域ごと：曜日×時間帯（訪問のある行だけ）',
      tb(slot.per, ['区域', '曜日', '時間帯', '訪問', '会えた側', '会えた側の割合%']),
      '',
      '## 5. 区域カードと留守宅カード（訪ねた家の数）',
      (ct.area[0] + ct.card[0] + ct.unsplit[0]) ? csv([['種類', '訪ねた', '会えた', '会えた割合%', '留守', '拒否'], cRow('区域カード', ct.area), cRow('留守宅カード', ct.card), cRow('分けられない', ct.unsplit)]) : none,
      '',
      '区域ごと：',
      tb(card.per, ['区域', '区域カード訪ねた', '区域カード会えた', '留守宅カード訪ねた', '留守宅カード会えた', '分けられない訪ねた', '分けられない会えた']),
      '',
      '## 6. 区域の一覧（今の様子）',
      tb(terr, ['区域', '親番号', '主な字', '状態', '貸出からの日数', '返却の目安を過ぎた', '前回回り終えた日', '年1回の期限までの日数', '家（部屋）の数', 'まだ会えていない割合%', '若い世代の割合%']),
      '',
      '## 7. 返却の記録（期間内）',
      tb(ret, ['区域', '貸出日', '返却日', '日数', '返却の種類', '回った割合%', '使い道']),
      '',
      '## 8. 区域の決まり（アプリの設定。区域係が「設定」タブの「区域の決まり」で変えられる）',
      tb(set, ['名前', 'キー', '今の値', 'はじめの値', 'これは何', '変えると'])
    ].join('\n') + '\n';
  }

  const fileName = () => `区域分析_${ymdOf(new Date()).replace(/-/g, '')}.txt`;
  let months = 4;

  function saveFile(body) {
    const name = fileName();
    let file = null;
    try { file = new File(['﻿' + body], name, { type: 'text/plain' }); } catch (e) { file = null; }
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file] }).then(() => true, e => { if (e && e.name === 'AbortError') return false; download(body, name); return true; });
    }
    download(body, name);
    return Promise.resolve(true);
  }
  function download(body, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/plain;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
  function logOut(how) { try { if (typeof KMx().opsLog === 'function') KMx().opsLog('書き出し：分析用', `直近${months}か月・${how}`); } catch (e) { console.error(e); } }

  function sheetHtml() {
    const b = (v, l) => `<button type="button" class="btn${months === v ? ' primary' : ''}" data-bk-per="${v}" aria-pressed="${months === v}">${l}</button>`;
    return headHtml(null, '分析用に書き出す', '') +
      `<p>区域の回り方の集計と「区域の決まり」を、1つのファイルにします。AI（Claude・ChatGPT・Gemini など）に添付するか、コピーして貼ると、分析と、設定をどう変えるとよさそうかの助言がもらえます。</p>
      <ul class="khist"><li>名前・住所・家ごとの記録は入りません（区域番号・時間帯・件数・日数・割合だけ）。</li>
      <li>AI の答えは提案です。設定を変えるときは、画面の数字と見くらべてから「設定」タブで変えてください（変えたあとも取り消せます）。</li></ul>
      <p class="kq">期間</p><div class="slpick">${b(4, '直近4か月')}${b(12, '1年')}</div>
      <button type="button" class="btn primary block" data-bk-save>ファイルで保存・共有する</button>
      <button type="button" class="btn block" data-bk-copy>コピーする（AI に貼るとき）</button>
      <button type="button" class="btn block" data-close>閉じる</button>`;
  }
  function openSheet() {
    if (!isAdmin()) return;
    setSheet(sheetHtml());
  }
  document.addEventListener('click', e => {
    const sh = document.getElementById('sheet');
    if (!sh || !sh.contains(e.target)) return;
    const per = e.target.closest('[data-bk-per]');
    if (per) { months = Number(per.getAttribute('data-bk-per')) === 12 ? 12 : 4; setSheet(sheetHtml()); return; }
    if (e.target.closest('[data-bk-save]')) {
      if (!isAdmin()) return;
      let body;
      try { body = text(months); } catch (err) { console.error(err); toast('書き出せませんでした。もう一度お試しください'); return; }
      saveFile(body).then(done => { if (done) { logOut('ファイル'); toast('書き出しました'); } }, err => { console.error(err); toast('書き出せませんでした'); });
      return;
    }
    if (e.target.closest('[data-bk-copy]')) {
      if (!isAdmin()) return;
      let body;
      try { body = text(months); } catch (err) { console.error(err); toast('書き出せませんでした。もう一度お試しください'); return; }
      const ok = () => { logOut('コピー'); toast('コピーしました。AI の入力欄に貼ってください'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).then(ok, () => toast('コピーできませんでした。「ファイルで保存・共有する」をお使いください'));
      else toast('コピーできませんでした。「ファイルで保存・共有する」をお使いください');
    }
  });

  /* 状況タブのいちばん上の帯（schedule.js の paintTopBar が「？ この画面の使い方」を描いたあと）に、ボタンを足す */
  const css = document.createElement('style');
  css.textContent = '.adtop .adbunseki{margin-right:auto}';
  document.head.appendChild(css);
  function paintBtn() {
    const top = document.querySelector('#adTopBar .adtop');
    if (!top) return;
    const cur = top.querySelector('[data-bunseki]');
    const show = isAdmin() && typeof adPane !== 'undefined' && adPane === 'status' && !(typeof KMx().locked === 'function' && KMx().locked());
    if (!show) { if (cur) cur.remove(); return; }
    if (cur) return;
    top.insertAdjacentHTML('afterbegin', '<button type="button" class="adhelp adbunseki" data-bunseki>↓ 分析用に書き出す</button>');
    top.querySelector('[data-bunseki]').addEventListener('click', openSheet);
  }
  const _render = window.renderAdmin;
  window.renderAdmin = function () {
    const r = _render.apply(this, arguments);
    try { paintBtn(); } catch (e) { console.error(e); }
    return r;
  };

  window.BUNSEKI = { text, csv, open: openSheet };
})();
