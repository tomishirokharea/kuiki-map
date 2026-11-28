/* =========================================================
   区域係の「分析用に書き出す」（bunseki.js・2026.13.178・2026-11-28／2026.13.179 で AI の答えの型・要点・親番号ごとを足した）

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
  const DAY = 86400000;
  const daysBetween = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return isFinite(x) && isFinite(y) ? Math.round((y - x) / DAY) : ''; };
  const pct = (m, n) => (n ? Math.round(m / n * 100) : '');
  const FEW = 5; // 訪問が5件未満の割合は「参考」（時間帯の表の SL_FEW と同じ）
  const SMALL_NOTE = '10軒未満のため出さない';
  /* 家・部屋が少ない区域（10軒未満）：画面と同じく、区域ごとの時間帯・割合は出さない（特定の家の様子が推測できてしまうため・監査 I-1）。
     全体（4章）には足したまま */
  function isSmall(t) {
    const K = KMx(), min = K.SL_AZA_MIN || 10;
    try { return typeof K.karteHomes === 'function' ? K.karteHomes(t) < min : false; } catch (e) { return false; }
  }
  const DATE = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : ymdOf(d); }; // 日本（端末）の日付（監査 m-3）

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

  /* ---------- 4・5：曜日×時間帯（時間帯の表と同じ数え方） ---------- */
  function slotPart(p) {
    const K = KMx(), SLB = K.SLB || [], SLC = K.SLC || [];
    const agg = typeof K.slotAgg === 'function' ? K.slotAgg() : new Map();
    const terrs = (typeof K.eligible === 'function' ? K.eligible() : []);
    const noOf = new Map(terrs.map(t => [t.id, t.no]));
    const small = new Set(terrs.filter(isSmall).map(t => t.id));
    const all = new Map(), per = [];
    agg.forEach((a, tid) => {
      if (!noOf.has(tid)) return;
      for (let b = 0; b < SLB.length; b++) for (let c = 0; c < SLC.length; c++) {
        let n = 0, m = 0;
        for (let off = 0; off < p.months; off++) { n += a[off * 30 + b * 3 + c]; m += a[off * 30 + 15 + b * 3 + c]; }
        if (!n) continue;
        const k = SLC[c] + ',' + SLB[b];
        const x = all.get(k) || [0, 0]; x[0] += n; x[1] += m; all.set(k, x);
        if (!small.has(tid)) per.push([noOf.get(tid), SLC[c], SLB[b], n, m, n >= FEW ? pct(m, n) : '参考']);
      }
    });
    // 区域ごとに訪問5件以上の行だけの合計（少ない記録の区域が割合を大きく動かしていないかを見るため・2026-11-28）。区域ごとの表（per）と同じ行から数える
    const big = new Map();
    per.forEach(r => { if (r[3] < FEW) return; const k = r[1] + ',' + r[2]; const x = big.get(k) || [0, 0]; x[0] += r[3]; x[1] += r[4]; big.set(k, x); });
    const allRows = [];
    SLC.forEach(c => SLB.forEach(b => {
      const x = all.get(c + ',' + b); if (!x) return;
      const y = big.get(c + ',' + b) || [0, 0];
      allRows.push([c, b, x[0], x[1], x[0] >= FEW ? pct(x[1], x[0]) : '参考', y[0], y[1], y[0] >= FEW ? pct(y[1], y[0]) : '参考']);
    }));
    per.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja', { numeric: true }) || SLC.indexOf(a[1]) - SLC.indexOf(b[1]) || SLB.indexOf(a[2]) - SLB.indexOf(b[2]));
    return { allRows, per };
  }

  /* ---------- 6：区域カードと留守宅カード（状況のグラフと同じ数え方） ---------- */
  function cardPart(p) {
    const out = { total: { area: [0, 0, 0, 0], card: [0, 0, 0, 0], unsplit: [0, 0, 0, 0] }, per: [] };
    if (!window.JG || !window.JGUI || typeof JGUI.inputs !== 'function') return out;
    const inp = JGUI.inputs(); inp.terr = true; inp.from = p.fromS;
    const r = JG.build(inp);
    const rows = JG.detail(r, { from: p.fromS, to: r.today });
    const noOf = new Map(D().territories.map(t => [t.id, t.no]));
    const small = new Set(D().territories.filter(t => !t.dummy && isSmall(t)).map(t => t.id));
    rows.forEach(x => {
      const line = [noOf.get(x.terr) || ''];
      ['area', 'card', 'unsplit'].forEach(c => {
        const t = x[c], n = t.met + t.refused + t.away;
        const T = out.total[c]; T[0] += n; T[1] += t.met; T[2] += t.away; T[3] += t.refused;
        line.push(n, t.met);
      });
      if (!small.has(x.terr) && line.slice(1).some(v => v)) out.per.push(line);
    });
    out.per.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja', { numeric: true }));
    return out;
  }

  /* ---------- 7：区域の一覧 ---------- */
  function terrPart() {
    const K = KMx(), today = new Date().toISOString();
    const terrs = (typeof K.eligible === 'function' ? K.eligible() : []).slice()
      .sort((a, b) => String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }));
    // 一度でも訪ねた記録のある区域（awayRate は、訪ねた家が0軒でも0を返すので、0と「まだ訪ねていない」を分ける・監査 m-2）
    const visited = new Set();
    (D().visits || []).forEach(v => { const h = typeof houseById === 'function' ? houseById(v.houseId) : null; if (h) visited.add(h.terrId); });
    return terrs.map(t => {
      const sm = isSmall(t);
      let aza = '';
      try { if (typeof AGE_ON !== 'undefined' && AGE_ON && typeof terrAza === 'function') aza = terrAza(t).slice().sort((a, b) => b.r - a.r).map(a => azaShow(a.n)).filter(Boolean).slice(0, 3).join('・'); } catch (e) { aza = ''; }
      const lent = isLent(t), since = t.holder ? t.lentAt : t.paperLentAt;
      const st = lent ? (t.holder ? '貸出中' : '貸出中（紙）') : t.awayPoolAt ? '留守宅カード' : lendMode(t) === 'stop' ? '貸出中止' : '空き';
      let due = null; try { due = typeof K.dueInfo === 'function' ? K.dueInfo(t) : null; } catch (e) { due = null; }
      let homes = 0; try { homes = housesOf(t.id).reduce((a, h) => a + targets(h).length, 0); } catch (e) { homes = ''; }
      let away = ''; try { const a = !sm && visited.has(t.id) && typeof K.awayRate === 'function' ? K.awayRate(t) : null; away = a == null ? '' : Math.round(a * 100); } catch (e) { away = ''; }
      let young = ''; try { const y = typeof K.youngPct === 'function' ? K.youngPct(t) : null; young = y == null ? '' : Math.round(y); } catch (e) { young = ''; }
      return [t.no, t.pno || '', aza, st, lent && since ? daysBetween(since, today) : '', lent && overDue(t) ? 'はい' : '',
        due && due.last ? due.last : '', due && due.left != null ? due.left : '', homes, away, young, sm ? SMALL_NOTE : ''];
    });
  }

  /* ---------- 3：要点（アプリが数えた数。AI が足し直さなくてよいように・2026-11-28） ----------
     terr の行：[0 区域, 1 親番号, 2 字, 3 状態, 4 貸出からの日数, 5 目安を過ぎた, 6 前回回り終えた日, 7 年1回の期限までの日数, 8 家の数, 9 会えていない割合, 10 若い世代, 11 備考] */
  function keyPart(terr, card, slot) {
    const n = w => terr.filter(r => r[3] === w).length;
    const parents = new Set(terr.map(r => String(r[1] || r[0])));
    const left = r => (r[7] === '' ? null : Number(r[7]));
    const ct = card.total, cardTerrs = card.per.filter(r => r[3] > 0).length;
    const smallVis = slot.allRows.reduce((a, r) => a + r[2] - r[5], 0), allVis = slot.allRows.reduce((a, r) => a + r[2], 0);
    return [
      ['区域の数', terr.length, `親番号 ${parents.size}（枝番に分けた区域をふくむ）`],
      ['貸出中', n('貸出中') + n('貸出中（紙）'), `うち紙 ${n('貸出中（紙）')}`],
      ['空き', n('空き'), 'だれも持っていない区域'],
      ['留守宅カードの区域', n('留守宅カード'), '1回目を回り終え、会えていない家だけを留守宅カードとして出している区域'],
      ['貸出中止', n('貸出中止'), ''],
      ['返却の目安を過ぎた貸出中の区域', terr.filter(r => r[5] === 'はい').length, ''],
      ['年1回の期限を過ぎた区域', terr.filter(r => left(r) != null && left(r) < 0).length, '全区域を1年で回る目標'],
      ['年1回の期限まで60日以内の区域', terr.filter(r => left(r) != null && left(r) >= 0 && left(r) <= 60).length, ''],
      ['年1回の期限まで61〜120日の区域', terr.filter(r => left(r) != null && left(r) > 60 && left(r) <= 120).length, ''],
      ['前回回り終えた日の記録がない区域', terr.filter(r => left(r) == null).length, ''],
      ['区域カードの会えた割合%', ct.area[0] >= FEW ? pct(ct.area[1], ct.area[0]) : '参考', `訪ねた ${ct.area[0]}軒・会えた ${ct.area[1]}軒`],
      ['留守宅カードの会えた割合%', ct.card[0] >= FEW ? pct(ct.card[1], ct.card[0]) : '参考', `訪ねた ${ct.card[0]}軒・会えた ${ct.card[1]}軒・記録のあった区域 ${cardTerrs}（10軒未満の区域をのぞく）`],
      ['「5件以上の行だけ」に入らない訪問の割合%', allVis ? pct(smallVis, allVis) : '', '区域×曜日×時間帯で訪問5件未満の行と、10軒未満の区域をのぞく。大きいと、全体の時間帯の割合が少ない記録に引っぱられている']
    ];
  }

  /* ---------- 8：親番号ごとのまとめ ---------- */
  function parentPart(terr) {
    const by = new Map();
    terr.forEach(r => {
      const k = String(r[1] || r[0]);
      const x = by.get(k) || { n: 0, lent: 0, free: 0, pool: 0, stop: 0, over: 0, minLeft: null, homes: 0 };
      x.n++;
      if (r[3] === '貸出中' || r[3] === '貸出中（紙）') x.lent++; else if (r[3] === '空き') x.free++; else if (r[3] === '留守宅カード') x.pool++; else if (r[3] === '貸出中止') x.stop++;
      if (r[7] !== '') { const l = Number(r[7]); if (l < 0) x.over++; if (x.minLeft == null || l < x.minLeft) x.minLeft = l; }
      x.homes += Number(r[8]) || 0;
      by.set(k, x);
    });
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja', { numeric: true }))
      .map(([k, x]) => [k, x.n, x.lent, x.free, x.pool, x.stop, x.minLeft == null ? '' : x.minLeft, x.over, x.homes]);
  }

  /* ---------- 9：返却の記録（期間内） ---------- */
  function retPart(p) {
    const noOf = new Map(D().territories.filter(t => !t.dummy && !isSpecial(t)).map(t => [t.id, t.no]));
    return (D().returns || []).filter(r => r && noOf.has(r.terrId) && DATE(r.at) >= p.fromS)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .map(r => [noOf.get(r.terrId), DATE(r.lentAt), DATE(r.at), r.lentAt ? daysBetween(r.lentAt, r.at) : '',
        r.completed ? '正式な返却' : r.ho ? '留守宅カードに切りかえ' : '途中の返却', r.pct == null ? '' : r.pct,
        r.ga ? '全体の集まり' : r.g ? 'グループ奉仕' : '個人']);
  }

  /* ---------- 10：区域の決まり ---------- */
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
    '読む人は区域係で、スマホで読みます。短い文と、やさしい日本語（専門用語や英語を使わない）で答えてください。',
    '',
    '【答えの型】次の見出しを、この順で答えに使う（答えのための見出しで、このファイルの章ではない）。全体でスマホの画面2〜3枚に収まる長さにする。',
    '### ひと目で',
    '　いちばん大事なことを3行まで。',
    '### 今の様子',
    '　「3. 要点」の数字を中心に、良いところと気になるところ。表を使うときは5行まで。',
    '### 課題',
    '　大事な順に3つまで。それぞれ「何が問題か」「根拠の数字（どの表のどの数か）」「このままだとどうなるか」を1〜2行で。',
    '### 決まりの提案',
    '　0〜2つ。「名前：今の値 → 提案の値」（名前は「10. 区域の決まり」の表示どおり）。良い面・悪い面・変えたあと何を見て確かめるか。根拠が弱いときは、無理に出さず「今は変えなくてよい」と書く。',
    '### 今月やること',
    '　3つまで。区域番号（親番号でまとめてよい）と、区域係がすることを具体的に。',
    '### このデータで分からないこと',
    '　2つまで。',
    '',
    '【守ること】',
    '1. このファイルの数字だけを使う（ほかの資料やインターネットの情報は使わない。質問を返さず、分かる範囲で答える）',
    '2. 記録から分かる事実と推定を分ける。推定の文の頭に「（推定）」と付ける。自分で足し直した数には「（計算）」と付ける',
    '3. 訪問が5件未満の割合（表では「参考」）は、結論に使わない。4章の全体の割合は、右の「5件以上の行だけ」の列も見くらべる',
    '4. 人の名前・住所は入っていない。個人を推測しない',
    '5. 時間は記録を入力した時刻。あとからまとめて入力した記録は、実際の訪問時間とずれることがある'
  ].join('\n');

  /* 書き出す文の全体 */
  function text(months) {
    const p = period(months === 4 ? 4 : 12);
    const slot = slotPart(p), card = cardPart(p), terr = terrPart(), ret = retPart(p), set = setPart();
    const key = keyPart(terr, card, slot), par = parentPart(terr);
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
        ['区域の数', `${terr.length}（親番号 ${par.length}）`],
        ['時間帯の区切り', '朝＝11時まで／昼＝11〜14時／午後＝14〜17時／夕方＝17〜19時／夜＝19時から'],
        ['曜日の分け方', '平日・土曜・日曜（祝日は日曜に数える）'],
        ['4・5の数え方', '訪問＝記録の数。会えた側＝会えた＋拒否（人が出てきた）'],
        ['6の数え方', '同じ日の同じ家（部屋）は1軒。結果は 会えた＞拒否＞留守 の順で1つ。区域カード＝区域を受け取って回った分、留守宅カード＝会えていない家だけを回った分、分けられない＝古い記録で見分けられない分'],
        ['入っていないもの', '特別区域（コンビニ・集合住宅など）・人の名前や番号・住所・家ごとの記録。家・部屋が10軒未満の区域の、区域ごとの時間帯・割合'],
        ['このデータで分からないこと', '会えた人の年代（アプリは記録しない）・だれが回ったか・実際に訪ねた時刻（記録を入力した時刻だけ）']]),
      '',
      '## 3. 要点（アプリが数えた数）',
      csv([['項目', '数', 'メモ']].concat(key)),
      '',
      `## 4. 全体：曜日×時間帯（時間帯の区切りの順：${SLB.join('・')}）`,
      '右の3列は、5章の区域ごとの行のうち訪問5件以上の行だけを足した数（少ない記録の区域に割合が引っぱられていないかを見る）',
      tb(slot.allRows, ['曜日', '時間帯', '訪問', '会えた側', '会えた側の割合%', '5件以上の行だけ：訪問', '5件以上の行だけ：会えた側', '5件以上の行だけ：割合%']),
      '',
      '## 5. 区域ごと：曜日×時間帯（訪問のある行だけ）',
      tb(slot.per, ['区域', '曜日', '時間帯', '訪問', '会えた側', '会えた側の割合%']),
      '',
      '## 6. 区域カードと留守宅カード（訪ねた家の数）',
      (ct.area[0] + ct.card[0] + ct.unsplit[0]) ? csv([['種類', '訪ねた', '会えた', '会えた割合%', '留守', '拒否'], cRow('区域カード', ct.area), cRow('留守宅カード', ct.card), cRow('分けられない', ct.unsplit)]) : none,
      '',
      '区域ごと：',
      tb(card.per, ['区域', '区域カード訪ねた', '区域カード会えた', '留守宅カード訪ねた', '留守宅カード会えた', '分けられない訪ねた', '分けられない会えた']),
      '',
      '## 7. 区域の一覧（今の様子）',
      tb(terr, ['区域', '親番号', '主な字', '状態', '貸出からの日数', '返却の目安を過ぎた', '前回回り終えた日', '年1回の期限までの日数', '家（部屋）の数', '訪ねた家のうちまだ会えていない割合%', '若い世代の割合%', '備考']),
      '',
      '## 8. 親番号ごとのまとめ',
      tb(par, ['親番号', '区域の数', '貸出中', '空き', '留守宅カード', '貸出中止', '年1回の期限までの最短日数', '期限を過ぎた区域', '家（部屋）の数']),
      '',
      '## 9. 返却の記録（期間内）',
      tb(ret, ['区域', '貸出日', '返却日', '日数', '返却の種類', '回った割合%', '使い道']),
      '',
      '## 10. 区域の決まり（アプリの設定。区域係が「設定」タブの「区域の決まり」で変えられる）',
      tb(set, ['名前', 'キー', '今の値', 'はじめの値', 'これは何', '変えると'])
    ].join('\n') + '\n';
  }

  const fileName = () => `区域分析_${ymdOf(new Date()).replace(/-/g, '')}.txt`;
  let months = 4;

  let busy = false; // 作っている・共有の画面を出している間は、もう一度押しても何もしない（監査 m-5）
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
      if (!isAdmin() || busy) return;
      let body;
      try { body = text(months); } catch (err) { console.error(err); toast('書き出せませんでした。もう一度お試しください'); return; }
      busy = true;
      saveFile(body).then(done => { if (done) { logOut('ファイル'); toast('書き出しました'); } }, err => { console.error(err); toast('書き出せませんでした'); })
        .then(() => { setTimeout(() => { busy = false; }, 1500); });
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
