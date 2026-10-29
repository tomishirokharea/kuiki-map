/* =========================================================
   区域マップ：アプリの本体（app.js）
   ・以前は index.html の中に直接書いていたものを、このファイルに移した（改善案C1：読み込み先の制限 CSP を入れるため。中身は同じ）
   ・index.html の版（app-version）を上げるときは、下の APP_JS_VER も同じ番号にする（新しい画面と古い本体がまざっていないかを確かめるため）
   ========================================================= */
'use strict'; // 本体の全体を strict にする（以前と同じ。この行は、ファイルの最初の文でなければならない）
var APP_JS_VER = '2026.13.100';
(function () { // 電波が弱く、新しい index.html と前の版の本体がまざって読み込まれたときは、少し待って1回だけ読み直す
  var m = document.querySelector('meta[name="app-version"]'), hv = m ? m.content : '';
  if (!hv || hv === APP_JS_VER) return;
  var k = 'kuiki_jsver_reload';
  try { if (sessionStorage.getItem(k) === hv) return; sessionStorage.setItem(k, hv); } catch (e) { return; }
  setTimeout(function () { location.reload(); }, 2500);
  throw new Error('app.js ' + APP_JS_VER + ' / index.html ' + hv + '：新しい版を読み込み直します');
})();
'use strict';
/* =========================================================
   区域マップ 試作版
   - データはこの端末の中だけに保存（Store）。
   - 本番では Store の load/save を GAS（Googleスプレッドシート）との
     通信に差し替える予定。画面側の処理はそのまま使う。
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const DAY = 86400000;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* 記録する中身は必要な分だけ（年代は2つ、関心は「また訪ねたいか」だけ） */
const AGES = ['若い世代', 'それ以外'];
const AGE_SUB = { 若い世代: '40代くらいまで', それ以外: '50代くらいから' };
const YOUNG = new Set(['若い世代', '10〜20代', '30〜40代']);        // 以前の記録の値も含める
const INTERESTS = ['再訪問したい', '再訪問しない'];
const INTERESTED = new Set(['再訪問したい', '関心あり', '少しあり']); // 以前の記録の値も含める
const INT_LABEL = { 再訪問したい: '★ また訪ねたい', 再訪問しない: '今回だけ' };
/* 会衆で決める「記録する項目」 */
/* 各自の「使う機能」（歯車の設定・このスマホだけ）。はじめはどちらも「使わない」 */
const featTime = () => UI.fTime === 'on';
/* 再訪問・★・引き継ぎの機能は、画面から外しました（これまでのデータはサーバーに残っています）。
   もどす場合は、ここを () => UI.fFollow === 'on' に戻し、設定の「使う機能」に再訪問の行を足します */
const featFollow = () => UI.fFollow === 'on'; // 再訪問を使う（各自が設定でえらぶ）
/* 年代・「また訪ねたいか」は、会衆で記録する設定で、かつ本人が「再訪問」を使うときだけ聞く */
const recAgeOn = () => false; // 年代は聞かない（会えた → 再訪問するか → メモ）
const recIntOn = () => false;
/* 会えたあと、次に進む画面（記録しない項目はとばす） */
function metNext(st, k, save) {
  if (!featFollow()) { save('met', {}); return false; } // かんたんな記録：会えた、だけを残す
  const f = fol(k);
  if (f && f.by !== me().id) { save('met', {}); return false; } // ほかの人が再訪問している家
  if (f) { st.step = 'memo'; return true; }                      // 自分の再訪問：メモを書き足す
  st.step = 'follow'; return true;                                // また訪ねるかをえらぶ
}
/* 会えたあと：また訪ねるか */
const followAskHtml = () => `<p class="q">会えた方を、また訪ねますか？</p>
  <div class="choices two">
    <button class="choice" data-fol="1">再訪問する<small>メモを残して、再訪問のタブに入ります</small></button>
    <button class="choice" data-fol="0">今回は記録だけ</button>
  </div>
  <button class="btn block" data-back="result">← 結果の選択にもどる</button>`;
/* 再訪問のメモ（このスマホの中だけ） */
function memoStepHtml(k) {
  const m = memoOf(k);
  return `<p class="q">メモ <span class="muted" style="font-size:15px">（${memoScope()}）</span></p>
    <label class="field"><textarea id="stepMemo" rows="5" maxlength="1000" placeholder="例：次は土曜の午前に。前回の話の続きから">${esc(m ? m.text : '')}</textarea></label>
    ${nextInputsHtml('stepNext', m && m.next)}
    <p class="hint">住んでいる人の名前・電話番号は書かないでください。${memoPrivacyNote()}</p>
    <button class="btn primary block" data-memosave>記録する</button>
    <button class="btn block" data-back="result">← 結果の選択にもどる</button>`;
}
/* 会えた（再訪問する）を記録し、メモの先頭に日時を入れて、このスマホに残す */
function saveFollowVisit(hid, unit, text, keepOpen, next) {
  const k = K(hid, unit);
  saveVisit(hid, unit, 'met', { interest: '再訪問したい', follow: true }, keepOpen);
  const now = new Date(), t = String(text || '').trim(), o = memoAll();
  const line = `${now.getMonth() + 1}月${now.getDate()}日 ${fmtTime(now)}　会えた`;
  o[k] = { text: (line + (t ? '\n' + t : '')).slice(0, 1000), at: now.toISOString() };
  if (next) o[k].next = next;
  memoSaveAll(o);
  if (currentView === 'follow') renderFollowList();
}
const backFromInterest = () => (recAgeOn() ? 'age' : 'result');
const backFromFollow = () => (recIntOn() ? 'interest' : backFromInterest());
const ageName = v => (YOUNG.has(v) ? '若い世代' : v === 'わからない' ? 'わからない' : v ? 'それ以外' : '');
const intName = v => (INTERESTED.has(v) ? 'また訪ねたい' : v ? '今回だけ' : '');
const RESULT_LABEL = { met: '会えた', away: '留守', refused: '拒否' };
const ST_LABEL = { new: '未訪問', met: '会えた', away: '留守', refused: '拒否', dnc: '拒否' };
const ST_CHAR = { new: '未', met: '会', away: '留', refused: '拒', dnc: '拒' };

/* 結果の選択：会えた／留守（「また訪ねたいか」を記録しない設定のときは、拒否もここに置く） */
const refuseBtnHtml = () => `<button class="choice refbtn" data-int="拒否"><i class="pin st-dnc">拒</i>拒否<small>もう来ないでほしいと言われた</small></button>`;
function resultChoicesHtml(awaySub) {
  return `<div class="choices two">
      <button class="choice c-met" data-res="met"><i class="pin st-met">会</i>会えた</button>
      <button class="choice c-away" data-res="away"><i class="pin st-away">留</i>留守${awaySub ? `<small>${awaySub}</small>` : ''}</button>
    </div>` + (recIntOn() ? '' : refuseBtnHtml());
}
/* 年代の選択（だいたいで） */
function ageChoicesHtml() {
  return `<p class="q">会えた方は、どちらに近いですか？</p>
    <div class="choices two">${AGES.map(a => `<button class="choice" data-age="${a}">${a}<small>${AGE_SUB[a]}</small></button>`).join('')}</div>
    <p class="hint">だいたいで大丈夫です。子どもだけが出たときは、記録せずに「留守」にしてください。</p>
    <button class="btn block" data-back="result">← 結果の選択にもどる</button>`;
}
/* また訪ねたいか：拒否は離して置き、色も分ける */
function interestChoicesHtml() {
  return `<p class="q">また訪ねたい方でしたか？</p>
    <div class="choices two">${INTERESTS.map(a => `<button class="choice" data-int="${a}">${INT_LABEL[a]}</button>`).join('')}</div>
    ${refuseBtnHtml()}
    <button class="btn block" data-back="${backFromInterest()}">← ${recAgeOn() ? '年代' : '結果'}の選択にもどる</button>`;
}
/* 拒否の確認：まちがえて押しても戻れるようにする */
function refuseStepHtml(isUnit) {
  return `<div class="refhead"><i class="pin st-dnc">拒</i><b>拒否として記録します</b></div>
    <p>地図のこの${isUnit ? '部屋' : '家'}に赤い「拒」のマークが付き、次からおすすめやカードに出なくなります。</p>
    <button class="btn block refok" data-refok>拒否として記録する</button>
    <button class="btn block" data-back="${recIntOn() ? 'interest' : 'result'}">← まちがえた（前の選択にもどる）</button>`;
}
const BANDS = ['朝', '昼', '午後', '夕方', '夜'];
const BAND_HINT = { 朝: '〜11時', 昼: '11〜14時', 午後: '14〜17時', 夕方: '17〜19時', 夜: '19時〜' };
const SLOTS = [];
['平日', '土日'].forEach(dt => BANDS.forEach(b => SLOTS.push(dt + '・' + b)));
const bySlot = (a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b);
const SLOT_BIT = {};
SLOTS.forEach((s, i) => { SLOT_BIT[s] = 1 << i; });
const hasSlot = (mask, s) => !!(mask & SLOT_BIT[s]);
const slotCount = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
const slotList = m => SLOTS.filter(s => hasSlot(m, s));
/* 区域がまだ無いときの表示位置と拡大の度合い（config.js の homeView・homeZoom。無ければ沖縄本島の中ほど） */
const HOME_VIEW = (function () { const v = window.KUIKI_CONFIG && window.KUIKI_CONFIG.homeView; return Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1]) ? [Number(v[0]), Number(v[1])] : [26.33, 127.80]; })();
const HOME_ZOOM = (function () { const z = window.KUIKI_CONFIG && Number(window.KUIKI_CONFIG.homeZoom); return z >= 5 && z <= 19 ? z : 10; })();
const AGE_ON = !!(window.KUIKI_CONFIG && window.KUIKI_CONFIG.ageData); // 年齢データ（市のCSV）を使うか。配布パックでは使わない
const TILE_PALE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const TILE_PHOTO = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

/* 必要になったときだけ読み込む部品（ふだんの起動は軽いまま）
   どれも npm の公式の配布物を vendor に置いたもの。外の配布サイト（CDN）からは読まない（改ざん対策・監査S14） */
const LIB = {
  pdf: 'vendor/pdfjs-3.11.174/pdf.min.js',
  pdfWorker: 'vendor/pdfjs-3.11.174/pdf.worker.min.js',
  zip: 'vendor/jszip-3.10.1/jszip.min.js'
};
const libLoading = {};
function loadScript(url) {
  if (!libLoading[url]) {
    libLoading[url] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = res;
      s.onerror = () => { delete libLoading[url]; s.remove(); rej(new Error('load ' + url)); };
      document.head.appendChild(s);
    });
  }
  return libLoading[url];
}

/* ---------- 時間帯 ---------- */
function bandOf(d) { const h = d.getHours(); return h < 11 ? '朝' : h < 14 ? '昼' : h < 17 ? '午後' : h < 19 ? '夕方' : '夜'; }
function dayTypeOf(d) { const w = d.getDay(); return (w === 0 || w === 6) ? '土日' : '平日'; }
function slotOf(d) { return dayTypeOf(d) + '・' + bandOf(d); }
const fmtTime = d => `${d.getHours()}:${pad(d.getMinutes())}`;
function fmtDate(iso) {
  const d = new Date(iso), y = d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '/' : '';
  return `${y}${d.getMonth() + 1}/${d.getDate()} ${fmtTime(d)}`;
}
const fmtDay = iso => {
  const d = new Date(iso), y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
  return `${y}${d.getMonth() + 1}月${d.getDate()}日`;
};
const daysSince = iso => Math.floor((Date.now() - Date.parse(iso)) / DAY);

/* ---------- 試作データ ---------- */
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeDemo() {
  const r = rng(20260917), now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const users = [
    { id: 'u1', name: '伝道者A', role: 'pub', group: '北', leader: true },
    { id: 'u2', name: '伝道者B', role: 'pub', group: '北', overseer: true },
    { id: 'u3', name: '区域係C', role: 'admin', group: '南' },
    { id: 'u4', name: '伝道者D', role: 'pub', group: '北' },
    { id: 'u5', name: '伝道者E', role: 'pub', group: '南', overseer: true }
  ];
  const rect = (a, b, c, d) => [[a, c], [a, d], [b, d], [b, c]];
  const territories = [
    { id: 't1', no: '1', name: '試作区域 北西', polygon: rect(26.1600, 26.1640, 127.6720, 127.6765), holder: 'u1', lentAt: iso(now - 20 * DAY), completedAt: iso(now - 150 * DAY) },
    { id: 't2', no: '2', name: '試作区域 北東', polygon: rect(26.1600, 26.1640, 127.6765, 127.6810), holder: 'u2', lentAt: iso(now - 130 * DAY), completedAt: iso(now - 300 * DAY) },
    { id: 't3', no: '3', name: '試作区域 南', polygon: rect(26.1560, 26.1600, 127.6720, 127.6810), holder: null, lentAt: null, free: true, completedAt: iso(now - 200 * DAY) },
    { id: 't4', no: '4', name: '試作区域 東', polygon: rect(26.1560, 26.1600, 127.6810, 127.6850), holder: null, lentAt: null, completedAt: iso(now - 60 * DAY) }
  ];
  const labels = ['青い門', '白い塀', '2階建て', '角の家', '駐車場あり', '赤瓦', '花壇あり', '平屋'];
  const houses = [], visits = [];
  const pick = arr => arr[Math.floor(r() * arr.length)];
  territories.forEach(t => {
    const la = t.polygon.map(p => p[0]), ln = t.polygon.map(p => p[1]);
    const la0 = Math.min(...la), la1 = Math.max(...la), ln0 = Math.min(...ln), ln1 = Math.max(...ln);
    const pos = () => [la0 + (la1 - la0) * (0.08 + 0.84 * r()), ln0 + (ln1 - ln0) * (0.08 + 0.84 * r())];
    const n = t.no === '3' ? 30 : t.no === '4' ? 16 : 22;
    for (let i = 0; i < n; i++) {
      const [lat, lng] = pos();
      houses.push({ id: `h${t.no}_${i}`, terrId: t.id, type: 'house', lat, lng, label: pick(labels), units: [], createdAt: iso(now - 400 * DAY) });
    }
    for (let k = 0; k < 2; k++) {
      const [lat, lng] = pos(), units = [];
      const fl = 2 + Math.floor(r() * 3), per = 3 + Math.floor(r() * 2);
      for (let f = 1; f <= fl; f++) for (let u = 1; u <= per; u++) units.push(`${f}${pad(u)}`);
      houses.push({ id: `a${t.no}_${k}`, terrId: t.id, type: 'apt', lat, lng, label: 'アパート' + 'AB'[k], units, createdAt: iso(now - 400 * DAY) });
    }
  });
  houses.forEach(h => {
    targets(h).forEach(unit => {
      const cnt = Math.floor(r() * 4);
      for (let j = 0; j < cnt; j++) {
        const d = new Date(now - Math.floor(r() * 150 + 1) * DAY);
        d.setHours(9 + Math.floor(r() * 11), Math.floor(r() * 60), 0, 0);
        const x = r(), result = x < 0.35 ? 'met' : x < 0.97 ? 'away' : 'refused';
        const v = { id: uid(), houseId: h.id, unit, result, at: d.toISOString(), by: r() < 0.5 ? 'u1' : 'u2' };
        if (result === 'met') { v.age = pick(AGES); v.interest = pick(INTERESTS); }
        if (result === 'refused') v.age = pick(AGES);
        visits.push(v);
      }
    });
  });
  // すべての時間帯で留守の家（試作）
  ['h3_0', 'h3_1'].forEach(hid => {
    for (let i = visits.length - 1; i >= 0; i--) if (visits[i].houseId === hid) visits.splice(i, 1);
    const hours = { 朝: 9, 昼: 12, 午後: 15, 夕方: 18, 夜: 20 };
    let back = 20;
    ['平日', '土日'].forEach(dt => BANDS.forEach(b => {
      const d = new Date(now - back * DAY);
      while (dayTypeOf(d) !== dt) d.setDate(d.getDate() - 1);
      d.setHours(hours[b], 10, 0, 0);
      visits.push({ id: uid(), houseId: hid, unit: '', result: 'away', at: d.toISOString(), by: 'u1' });
      back += 6;
    }));
  });
  users[1].slots = ['平日・夕方', '土日・朝'];
  // 再訪問の受け持ち（試作）
  const follows = {}, released = {};
  const r2 = rng(777);
  houses.forEach(h => targets(h).forEach(unit => {
    const k = K(h.id, unit);
    const m = visits.filter(v => v.houseId === h.id && v.unit === unit && v.result === 'met').sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (!m || !INTERESTED.has(m.interest)) return;
    const x = r2();
    if (x < 0.6) {
      const by = r2() < 0.6 ? 'u1' : 'u2';
      const d = new Date(now - [4, 10, 25, 31, 48, 63][Math.floor(r2() * 6)] * DAY);
      d.setHours(10 + Math.floor(r2() * 8), Math.floor(r2() * 60), 0, 0);
      visits.push({ id: uid(), houseId: h.id, unit, result: 'met', at: d.toISOString(), by, age: m.age, interest: m.interest });
      follows[k] = { by, since: iso(d.getTime() - 60 * DAY), touchedAt: d.toISOString() };
    } else if (x < 0.8) {
      released[k] = { at: iso(now - 9 * DAY), reason: 'handoff' };
    }
  }));
  // 最後の結果が拒否の家には拒否マーク
  const dnc = {};
  houses.forEach(h => targets(h).forEach(unit => {
    const last = visits.filter(v => v.houseId === h.id && v.unit === unit).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (last && last.result === 'refused') { const k = K(h.id, unit); dnc[k] = true; delete follows[k]; delete released[k]; }
  }));
  const requests = [{ id: 'r1', by: 'u2', terrId: 't4', at: iso(now - 2 * DAY), status: 'pending' }];
  // 奉仕の集まりの予定（試作）：今週と来週の土曜・水曜
  const schedules = [];
  for (let w = 0; w < 3; w++) {
    const sat = new Date(now); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7) + 7 * w);
    const wed = new Date(now); wed.setDate(wed.getDate() + ((3 - wed.getDay() + 7) % 7) + 7 * w);
    const f = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    schedules.push({ id: 'sN' + w, group: '北', date: f(sat), time: '09:30', end: '11:30', place: '北公民館の前', note: '区域1を回ります', by: 'u2', at: iso(now) });
    schedules.push({ id: 'sS' + w, group: '南', date: f(sat), time: '10:00', end: '12:00', place: '会館', note: '', by: 'u5', at: iso(now) });
    schedules.push({ id: 'sA' + w, group: '', date: f(wed), time: '19:00', end: '', place: '会館', note: '全体の集まり', by: 'u3', at: iso(now) });
  }
  // S-13 の見本：アプリの返却の記録と、紙から転記した記録
  const dAgo = n => ymd(new Date(now - n * DAY));
  const returns = [
    { id: 'x1', terrId: 't3', by: 'u2', lentAt: iso(now - 330 * DAY), at: iso(now - 290 * DAY), completed: true, pct: 100 },
    { id: 'x2', terrId: 't4', by: 'u1', lentAt: iso(now - 250 * DAY), at: iso(now - 200 * DAY), completed: true, pct: 96 },
    { id: 'x3', terrId: 't3', by: 'u5', lentAt: iso(now - 240 * DAY), at: iso(now - 205 * DAY), completed: false, pct: 60 },
    { id: 'x4', terrId: 't4', by: 'u4', lentAt: iso(now - 120 * DAY), at: iso(now - 60 * DAY), completed: true, pct: 100 }
  ];
  const s13 = [
    { id: 'p1', kind: 'a', terrId: 't1', name: '伝道者F', a: dAgo(360), c: dAgo(300), at: iso(now), by: 'u3' },
    { id: 'p2', kind: 'a', terrId: 't2', name: '伝道者G', a: dAgo(355), c: dAgo(310), at: iso(now), by: 'u3' },
    { id: 'p3', kind: 'a', terrId: 't1', name: '伝道者H', a: dAgo(280), c: dAgo(215), at: iso(now), by: 'u3' },
    { id: 'p4', kind: 'p', terrId: 't2', year: svcYearOf(new Date(now - 365 * DAY)), c: dAgo(420), at: iso(now), by: 'u3' }
  ];
  return { version: 4, users, territories, houses, visits, dnc, follows, released, requests, awayCards: [], returns, s13, schedules,
    settings: { remindDays: 21, escalateDays: 42, selfTakeMax: 2, awayDays: 7, awayMax: 2, donePct: 90, awayCap: 3, awayNoRepeat: 1, awayScope: 0 }, currentUser: 'u1' };
}

/* ---------- 保存 ----------
   config.js に GAS のURLが無いとき：試作モード（この端末だけに保存）
   URLがあるとき：本番モード
   ・最初の1回だけ全部を受け取り、以後は「前回から変わった分」だけをやりとりする
   ・受け取ったデータは端末（IndexedDB）に残し、圏外でも使える
   ・送れなかった変更は端末にためて、つながったときに送る */
/* 練習モード（URL に ?renshu=1）：サーバーには一切送らず、本番とは別の保存場所（名札 renshu）で、ダミーの区域を使って記録を試せる */
const RENSHU = /[?&]renshu=1(&|$)/.test(location.search);
const API_URL = (function () {
  if (RENSHU) return ''; // 練習モードは、サーバーにつながない（＝試作モードと同じ動き）
  const u = window.KUIKI_CONFIG && window.KUIKI_CONFIG.apiUrl;
  return typeof u === 'string' && /^https:\/\/script\.google\.com\//.test(u.trim()) ? u.trim() : '';
})(); // GAS の「ウェブアプリのURL」は config.js に書く
const LIVE = !!API_URL;
const JOIN_KEY = 'kuiki_join', PENDING_KEY = 'kuiki_pending';
const HOME_KEY = 'kuiki_home_code', HOME_SEEN = 'kuiki_home_seen', HOME_OFF = 'kuiki_home_banner_off', FIRST_OK = 'kuiki_first_ok', HOME_WELCOME = 'kuiki_home_welcome';
const TOKEN_KEY = 'kuiki_token', QUEUE_KEY = 'kuiki_queue', OLD_CACHE_KEY = 'kuiki_cache', SYNC_KEY = 'kuiki_sync_at', LOCK_KEY = 'kuiki_lock_ok';
let onMemoVer = null; // 再訪問メモの合図を受け取る（MemoSync が入れる）
const DATA_VER = 2; // データの種類が増えたら上げる（端末が一度だけ全部を読み直す）
const CACHE_KEYS = ['c2_meta', 'c2_houses', 'c2_visits']; // 端末の保存：3つに分けて、変わった分だけ書く
const BIG_SAVE_GAP_MS = 10 * 60000; // 家・記録（大きい部分）を端末に書く間隔の最短（閉じるときは、いつでも書く）
const FAILED_KEY = 'kuiki_failed'; // 何度送っても受け付けられなかった変更（捨てずに取っておく）
const ORPHAN_KEY = 'kuiki_orphan', ORPHAN_DAYS = 7; // 合いことばが使えなくなったときの、まだ送っていない変更（同じ人として登録し直したら送る・点検②H-10）
const metaSigOf = j => JSON.stringify([j.users || null, j.settings || null, j.currentUser || null]);
const ARR_COLS = ['territories', 'houses', 'visits', 'requests', 'awayCards', 'returns', 'schedules', 'users', 's13', 'agedata', 'holds']; // holds＝おすすめの家の押さえ（今行く・予定に入れる。kangaeru.js・2026-10-26）
const MAP_COLS = ['dnc', 'follows', 'released', 'caution']; // caution＝注意（！）の印（chui.js）
const RES_NAME = { m: 'met', a: 'away', r: 'refused' };
const clone = o => JSON.parse(JSON.stringify(o));
/* 保存場所の名札：テスト用のページ（config.js に ns: 'test' があるか、URLに「test」が入っている）は、
   本番とは別の場所に保存する。同じ github.io の中では、本番とテストの保存場所がまざってしまうため
   （まざると、本番の登録や、まだ送っていない記録が、テスト用のサーバーに送られてしまう） */
const NS = (function () {
  if (RENSHU) return 'renshu'; // 練習モードは、本番・テスト版とは別の保存場所
  const c = window.KUIKI_CONFIG && window.KUIKI_CONFIG.ns;
  if (typeof c === 'string' && c.trim()) return c.replace(/[^\w-]/g, '').slice(0, 20);
  return /test/i.test(location.pathname) ? 'test' : '';
})();
const nsKey = k => (NS ? NS + '::' + k : k);
const lsGet = k => { try { return localStorage.getItem(nsKey(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(nsKey(k), v); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(nsKey(k)); } catch (e) { /* 何もしない */ } };
/* 速い保存（commitIn・改善案B2）の確かめ：テスト版（NS が test）・config.js の scopeCheck: true・この端末の kuiki_scope_check=1 のときは、
   毎回「全部を比べる」も行い、書きもらしがあればエラーとして出す（そのうえで一緒に送る） */
const SCOPE_CHECK = NS === 'test' || !!(window.KUIKI_CONFIG && window.KUIKI_CONFIG.scopeCheck) || lsGet('kuiki_scope_check') === '1';
/* 練習モードの保存場所（名札 renshu）を空にする：開くたびに最初から練習できる。本番の保存場所には触らない */
function renshuClear() {
  try { Object.keys(localStorage).filter(k => k.indexOf('renshu::') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { /* 何もしない */ }
  try { if (window.indexedDB) indexedDB.deleteDatabase('kuiki-map-renshu'); } catch (e) { /* 何もしない */ }
}
if (RENSHU) { renshuClear(); lsSet('kuiki_splash_off', '1'); } // 練習のときは、起動のあいさつを出さない

/* 自分が詳細を見られる範囲（担当している区域・受け持っている再訪問） */
function permSig() {
  const id = Store.data.currentUser;
  return {
    t: Store.data.territories.filter(t => t.holder === id).map(t => t.id),
    f: Object.keys(Store.data.follows).filter(k => Store.data.follows[k].by === id)
  };
}
/* 見られない記録の年代・また訪ねたいかを、端末からも消す（区域係は除く） */
function scrubVisits() {
  if (!LIVE) return;
  const d = Store.data, u = d.users.find(x => x.id === d.currentUser);
  if (!u || u.role === 'admin') return;
  const ps = permSig(), hold = new Set(ps.t), fk = new Set(ps.f);
  const terrOfHouse = new Map(d.houses.map(h => [h.id, h.terrId]));
  let gone = 0;
  d.visits.forEach(v => {
    if (v.by === u.id || (v.age === undefined && v.interest === undefined)) return;
    if (hold.has(terrOfHouse.get(v.houseId)) || fk.has(v.houseId + '|' + (v.unit || ''))) return;
    delete v.age; delete v.interest; gone++;
  });
  // 消したものがあったときは、端末の保存（記録）も書き直す（改善案C6）。開いた直後は大きな書きこみをしないので、そのときは次に記録を書くとき（10分ごと・閉じるとき）に書く
  if (gone) { Store.dirty.visits = true; Store.saveCacheSoon(); }
}
/* 新しく区域や再訪問を受け持ったら、その区域の記録の詳細だけを受け取る（3万件を読み直さない） */
let permLoading = false;
function checkPermGain() {
  if (!LIVE || !Store.permSeen || isAdmin() || permLoading || Store.inactive) return;
  // 自分の変更（区域を受け取る・再訪問を受け持つ など）がまだサーバーに届いていないあいだは頼まない。先に頼むと、サーバーはまだ
  // 受け持ちを知らないので、年代などを外して返し、そのまま「受け取り済み」になってしまう。送り終えたとき（flush の最後）にもう一度確かめる
  if (Store.queue.length || flushing) return;
  const ps = permSig();
  const nt = ps.t.filter(x => !Store.permSeen.has('t:' + x));
  let nf = ps.f.filter(x => !Store.permSeen.has('f:' + x));
  // 再訪問の家：ほかの人の記録が「留守」だけ（または記録がない）なら、受け取るものがない（年代・また訪ねたいかは「会えた」「拒否」の記録にしかない）ので、
  // サーバーに頼まない（サーバーは1件のためにも記録を全部読むため・改善案C5①・点検③P9）
  if (nf.length) {
    const want = new Set(nf), need = new Set(), mine = Store.data.currentUser;
    Store.data.visits.forEach(v => {
      if (v.result === 'away' || v.by === mine) return;
      const k = v.houseId + '|' + (v.unit || '');
      if (want.has(k)) need.add(k);
    });
    nf.forEach(k => { if (!need.has(k)) Store.permSeen.add('f:' + k); });
    nf = nf.filter(k => need.has(k));
  }
  if (!nt.length && !nf.length) return;
  permLoading = true;
  api('load', { part: 'tv', terrs: nt, keys: nf }, { timeout: 120000 }).then(r => {
    if (r.mode !== 'tv' || !Array.isArray(r.rows)) { Store.needFull = true; return reloadAll(false); } // 古いサーバーのとき
    mergeVisitRows(r.rows);
    nt.forEach(x => Store.permSeen.add('t:' + x)); nf.forEach(x => Store.permSeen.add('f:' + x));
    Store.dirty.visits = true; Store.saveCacheSoon();
    renderAll();
  }).catch(() => { /* 次の機会にまた受け取る */ }).then(() => { permLoading = false; });
}
function mergeVisitRows(rows) {
  const d = D(), byId = new Map(d.visits.map(v => [v.id, v]));
  rows.forEach(a => {
    const v = { id: a[0], houseId: a[1], unit: a[2], result: RES_NAME[a[3]] || 'away', at: new Date(a[4] * 1000).toISOString(), by: a[5] };
    if (a[6]) v.age = a[6];
    if (a[7]) v.interest = a[7];
    if (a[8]) v.src = a[8];
    if (a[9]) v.oc = 1; // カードを持っていない人の記録（サーバーが付ける）
    const cur = byId.get(v.id);
    if (cur) { delete cur.age; delete cur.interest; if (v.age) cur.age = v.age; if (v.interest) cur.interest = v.interest; if (v.oc) cur.oc = 1; return; }
    d.visits.push(v); byId.set(v.id, v);
    if (Store.fp) Store.fp.visits.set(v.id, 1); // 自分の新しい記録とまちがえて送らないように
  });
}
/* しばらく通信できなかった端末は、保存したデータを消す */
const cacheDaysLimit = () => ((Store.data && Store.data.settings && Store.data.settings.cacheDays) || 30);
function checkExpiry() {
  if (!LIVE || !Store.syncAt) return false;
  if (Date.now() - Store.syncAt <= cacheDaysLimit() * DAY) return false;
  clearTimeout(Store.cacheTimer);
  IDB.clearCache().catch(() => {});
  clearAllMemos();
  Store.data = null;
  showBlocking('端末の情報を消しました', `${cacheDaysLimit()}日以上通信できなかったため、区域の情報をこのスマホから消しました。通信できる場所で開き直すと、また使えます。`);
  return true;
}

/* 端末の大きな保存場所（IndexedDB） */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
      const r = indexedDB.open(NS ? 'kuiki-map-' + NS : 'kuiki-map', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('idb blocked'));
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode), st = tx.objectStore('kv');
      const q = fn(st);
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  get(k) { return this.run('readonly', st => st.get(k)); },
  set(k, v) { return this.run('readwrite', st => st.put(v, k)); },
  del(k) { return this.run('readwrite', st => st.delete(k)); },
  /* いくつかを1回で読む */
  async getMany(keys) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv'), out = {};
      keys.forEach(k => { const q = st.get(k); q.onsuccess = () => { out[k] = q.result; }; });
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  /* いくつかを1回で書く（全部書けるか、全部書けないか。途中までの保存にはならない） */
  putMany(obj) {
    return this.run('readwrite', st => {
      Object.keys(obj).forEach(k => st.put(obj[k], k));
      st.delete('cache'); // 以前の形の保存は使わない
    });
  },
  clearCache() { return this.run('readwrite', st => { ['cache'].concat(CACHE_KEYS).forEach(k => st.delete(k)); }); }
};

/* 同じ物（区域・家など）は、入れかえずに中身だけを書きかえる。
   画面を開いたときにつかんだ区域や家が、あとで届いた変更で「古い物」にならないようにするため
   （古い物を書きかえても保存されず、「押しても変わらない」ことが起きていた） */
function refill(cur, v) {
  if (!cur || !v || typeof cur !== 'object' || typeof v !== 'object' || cur === v) return v;
  Object.keys(cur).forEach(k => { if (!(k in v)) delete cur[k]; });
  return Object.assign(cur, v);
}
/* まだ送っていない変更を、手元のデータに重ねる */
/* 家の部屋の「もとの一覧」：前に送った（または受け取った）家の部屋と、今の部屋がちがうときだけ、前の一覧を返す（点検②V4）。
   サーバーは、足した部屋・消した部屋だけを今の一覧に当てはめるので、ほかの人がほぼ同時に足した部屋が消えない */
function unitsBase(prevJ, h) {
  if (!prevJ || !h) return null;
  let prev = null;
  try { prev = JSON.parse(prevJ); } catch (e) { return null; }
  const a = Array.isArray(prev && prev.units) ? prev.units : [], b = Array.isArray(h.units) ? h.units : [];
  return JSON.stringify(a) === JSON.stringify(b) ? null : a.slice();
}
function applyDiff(st, ch) {
  ARR_COLS.forEach(c => {
    if (!ch[c]) return;
    const m = new Map((st[c] || []).map(x => [x.id, x]));
    ch[c].up.forEach(x => {
      const cur = m.get(x.id), y = clone(x);
      if (c === 'houses') delete y.ub; // 送るときだけに付ける「もとの一覧」は、手元のデータには入れない
      if (cur && c !== 'visits') refill(cur, y); else m.set(x.id, y);
    });
    ch[c].del.forEach(id => m.delete(id));
    st[c] = [...m.values()];
  });
  MAP_COLS.forEach(c => {
    if (!ch[c]) return;
    st[c] = st[c] || {};
    ch[c].up.forEach(x => { st[c][x.id] = clone(x.value); });
    ch[c].del.forEach(id => { delete st[c][id]; });
  });
  if (ch.settings) st.settings = Object.assign({}, st.settings || {}, clone(ch.settings)); // 変えた項目だけのこともあるので、重ねる
}

const Store = {
  key: 'kuiki_demo_v8',
  data: null,
  fp: null,      // 本番：サーバーに伝え済み（または送信待ち）の内容の控え
  seq: null,     // 本番：受け取り済みの変更番号
  token: '',
  queue: [],     // 本番：まだ送っていない変更
  inbox: [],     // 本番：受け取ったが、入力中のため反映を待っている変更
  pulled: false, // 本番：この起動で、サーバーの最新の変更を一度でも受け取ったか（係の端末の自動の確かめは、受け取る前の古いデータでは動かさない。第3回監査 P6）
  needFull: false,
  permSeen: null,  // 本番：詳細を受け取り済みの範囲
  syncAt: 0,       // 本番：最後に通信できた時刻
  expired: false,
  dirty: { meta: false, houses: false, visits: false }, // 端末に書き直す必要がある部分
  metaSig: null,   // 前回受け取った「人・設定」の中身（変わっていなければ、画面の作り直しをしない）
  needMeta: false, // 区域・予定などだけを読み直す（グループが変わったとき）
  inactive: false, // ほかのタブで開かれたので、この画面は止めている
  markAll() { this.dirty = { meta: true, houses: true, visits: true }; this.bigAt = 0; }, // 全部が変わった → 次は家・記録も必ず書く
  /* 家（約3万件）・訪問記録（数十万件になる）を端末に書いた時刻と、そのときの変更番号。
     家・記録は大きいので、変わるたびには書かない（書くたびに画面が数秒止まるため）。
     書かなかったあいだは、端末に残す変更番号を「家・記録を書いたときの番号」にとどめる。
     次に開いたとき、その番号からの差分を受け取り直すので、記録の取りこぼしは起きない */
  bigAt: 0,
  diskSeq: { houses: null, visits: null },
  markCol(c) { this.dirty[c === 'houses' || c === 'visits' ? c : 'meta'] = true; },
  /* 変わったところが何もない返事か（それなら、番号を進めるだけにする） */
  trivial(j) {
    return j.mode === 'delta' && !(j.changes && j.changes.length) && this.metaSig !== null && metaSigOf(j) === this.metaSig;
  },
  load() {
    const s = lsGet(this.key);
    if (s) { try { this.data = JSON.parse(s); this.migrate(); return; } catch (e) { /* 作り直す */ } }
    this.data = makeDemo(); this.migrate(); this.save();
  },
  migrate() {
    const d = this.data;
    d.dnc = d.dnc || {}; d.follows = d.follows || {}; d.released = d.released || {}; d.caution = d.caution || {};
    d.requests = d.requests || []; d.awayCards = d.awayCards || []; d.returns = d.returns || []; d.schedules = d.schedules || [];
    d.territories = d.territories || []; d.houses = d.houses || []; d.visits = d.visits || []; d.users = d.users || [];
    d.settings = Object.assign({ remindDays: 21, escalateDays: 42, selfTakeMax: 2, holdMaxPersonal: 2, holdMaxGroup: 2, freeAfterDays: 0, awayDays: 7, awayMax: 2, donePct: 90, lowOn: 1, lowWait: 7, wxOn: 1, keepMonths: 12, cacheDays: 30, recAge: 1, recInterest: 1, skipDays: 30, skipDone: 1, lockOthers: 1, groupOn: 1, groupMax: 4, memoShare: 1, memoSync: 1, awayRecentDays: 3, awayCardMax: 15, awayAllTerr: 0, syncGroupSec: 7, syncNormalSec: 20, reqMaxPersonal: 1, reqMaxGroup: 1, followSkipDays: 60, lendDays: 120, awayRetPct: 70, autoFree: 0, awayExp: 0, ageShow: 10, ageShowMode: 0, recoOn: 1, recoKinds: 15, recoCount: 3, recoDist: 500, recoLongDays: 180, recoSkipDays: 14, recoOthers: 1, recoCardOut: 1, recoCardBtn: 1, extOn: 1, extRest: 7, extCap: 2, extDays: 60, extStopBefore: 14, awayDayOnly: 3, awayAgainSlot: 1, recoLock: 0, osaeMax: 2, osaeDays: 7, recoLeft: 1 }, d.settings || {});
    d.s13 = d.s13 || [];
    d.agedata = d.agedata || [];
    d.holds = d.holds || [];
  },
  /* 控えを作り直す（訪問記録は件数が多いので、idだけ覚える） */
  buildFp() {
    const fp = {};
    ARR_COLS.forEach(c => { fp[c] = new Map((this.data[c] || []).map(x => [x.id, c === 'visits' ? 1 : JSON.stringify(x)])); });
    MAP_COLS.forEach(c => { fp[c] = new Map(Object.entries(this.data[c] || {}).map(([k, v]) => [k, JSON.stringify(v)])); });
    fp.settings = JSON.stringify(this.data.settings);
    this.fp = fp;
  },
  /* 控えと比べて、変わった分だけを取り出す（取り出した分は控えに入れる）
     only（家の id の Set）：速い保存（commitIn）のときは、家はその分だけを比べる。家のほかの部分（区域・印・受け持ち・設定など）は、いつも全部を比べる */
  collectChanges(skipVisits, only) {
    const out = {}, d = this.data, fp = this.fp;
    ARR_COLS.forEach(c => {
      if (c === 'visits' && skipVisits) return; // 記録を変えていない編集では、数十万件の記録を調べない
      const f = fp[c], up = [], del = [], seen = new Set();
      if (c === 'houses' && only) { // 家2〜3万件を文字にしない（改善案B2）。消した家は、控えにあって今はない家
        for (const x of d.houses || []) {
          if (!only.has(x.id)) continue;
          seen.add(x.id);
          const j = JSON.stringify(x), prevJ = f.get(x.id);
          if (prevJ !== j) {
            const y = JSON.parse(j);
            const ub = unitsBase(prevJ, y); if (ub) y.ub = ub; // 部屋を変えたときは、もとの一覧も送る（点検②V4）
            up.push(y); f.set(x.id, j);
          }
        }
        only.forEach(id => { if (!seen.has(id) && f.has(id)) { del.push(id); f.delete(id); } });
        if (up.length || del.length) out[c] = { up, del };
        return;
      }
      for (const x of d[c] || []) {
        seen.add(x.id);
        if (c === 'visits') { // 訪問記録は追加と削除だけ
          if (!f.has(x.id)) { up.push(clone(x)); f.set(x.id, 1); }
        } else {
          const j = JSON.stringify(x), prevJ = f.get(x.id);
          if (prevJ !== j) {
            const y = JSON.parse(j);
            if (c === 'houses') { const ub = unitsBase(prevJ, y); if (ub) y.ub = ub; } // 部屋を変えたときは、もとの一覧も送る（点検②V4）
            up.push(y); f.set(x.id, j);
          }
        }
      }
      for (const id of [...f.keys()]) if (!seen.has(id)) { del.push(id); f.delete(id); }
      if (up.length || del.length) out[c] = { up, del };
    });
    MAP_COLS.forEach(c => {
      const f = fp[c], obj = d[c] || {}, up = [], del = [];
      Object.keys(obj).forEach(id => {
        const j = JSON.stringify(obj[id]);
        if (f.get(id) !== j) { up.push({ id, value: JSON.parse(j) }); f.set(id, j); }
      });
      for (const id of [...f.keys()]) if (!(id in obj)) { del.push(id); f.delete(id); }
      if (up.length || del.length) out[c] = { up, del };
    });
    const sj = JSON.stringify(d.settings);
    if (sj !== fp.settings) {
      // 変えた項目だけを送る。2人の係がほぼ同時に別の設定を変えても、前の人の変更を元にもどさない（点検②V7。サーバーは送られた項目だけを変える）
      let prev = null;
      try { prev = JSON.parse(fp.settings || 'null'); } catch (e) { prev = null; }
      const cur = JSON.parse(sj);
      if (prev && typeof prev === 'object') {
        const diff = {};
        Object.keys(cur).forEach(k => { if (JSON.stringify(cur[k]) !== JSON.stringify(prev[k])) diff[k] = cur[k]; });
        out.settings = Object.keys(diff).length ? diff : cur;
      } else out.settings = cur;
      fp.settings = sj;
    }
    return out;
  },
  save(skipVisits, only) {
    if (!LIVE) {
      if (!lsSet(this.key, JSON.stringify(this.data))) toast('この端末に保存できませんでした');
      return;
    }
    const ch = this.collectChanges(skipVisits, only);
    if (only) {
      if (SCOPE_CHECK) { // 試験の写し：毎回、全部も比べて、書きもらしがないかを確かめる（あれば一緒に送る）
        const ex = this.collectChanges(true);
        if (Object.keys(ex).length) {
          console.error('区域マップ（試験）：速い保存で書きもらした変更があります', JSON.stringify(Object.keys(ex).map(c => [c, ex[c].up ? ex[c].up.map(x => x.id || x) : ex[c], ex[c].del || []])));
          Object.keys(ex).forEach(c => {
            if (!ch[c] || !ex[c].up) { ch[c] = ex[c]; return; }
            ch[c] = { up: ch[c].up.concat(ex[c].up), del: ch[c].del.concat(ex[c].del) };
          });
        }
      } else { this.scoped = true; this.sweepSoon(); }
    }
    if (!Object.keys(ch).length) return;
    Object.keys(ch).forEach(c => this.markCol(c));
    this.queue.push(ch);
    this.persistQueue();
    this.saveCacheSoon();
    checkPermGain();
    flush();
  },
  /* 速い保存（commitIn）のあとの守り：全部を比べて、書きもらした変更があれば送る（改善案B2）。
     手が空いたとき（最後の保存から5秒）・ほかのアプリに切りかえるとき・閉じるとき・受け取った変更を重ねる前・読み直す前に行う */
  scoped: false,
  sweepTimer: null,
  sweepSoon() {
    clearTimeout(this.sweepTimer);
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      if (mode === 'normal' && isBusy()) { this.sweepSoon(); return; } // 入力している間は待つ
      if (window.requestIdleCallback) requestIdleCallback(() => this.sweep('idle'), { timeout: 5000 }); else this.sweep('idle'); // 地図を動かしている最中などは避ける
    }, 5000);
  },
  /* 受け取った家（ids）に、手元でまだ送っていない変更があるか */
  housesDiffer(ids) {
    const f = this.fp && this.fp.houses; if (!f) return true;
    for (const id of ids) {
      const h = HID.get(id) || (this.data.houses || []).find(x => x.id === id);
      if (h && JSON.stringify(h) !== f.get(id)) return true;
    }
    return false;
  },
  sweep(why) {
    if (!this.scoped) return;
    this.scoped = false;
    clearTimeout(this.sweepTimer); this.sweepTimer = null;
    if (!LIVE || this.inactive || !this.fp || !this.data) return;
    const ch = this.collectChanges(true);
    if (!Object.keys(ch).length) return;
    console.warn('区域マップ：速い保存で書きもらした変更を送ります（' + why + '）', Object.keys(ch).join(','));
    Object.keys(ch).forEach(c => this.markCol(c));
    this.queue.push(ch);
    this.persistQueue();
    this.saveCacheSoon();
    setTimeout(() => flush(), 0);
  },
  /* 家1件だけを、すぐ送信待ちに入れる */
  pushHouse(h, del) {
    if (!LIVE) { this.save(); return; }
    const prevJ = this.fp.houses.get(h.id), y = del ? null : clone(h);
    if (y) { const ub = unitsBase(prevJ, y); if (ub) y.ub = ub; } // 部屋を変えたときは、もとの一覧も送る（点検②V4）
    if (del) this.fp.houses.delete(h.id); else this.fp.houses.set(h.id, JSON.stringify(h));
    this.dirty.houses = true; if (del) this.dirty.visits = true;
    this.queue.push({ houses: { up: del ? [] : [y], del: del ? [h.id] : [] } });
    this.persistQueue();
    this.saveCacheSoon();
    flush();
  },
  /* 記録1件だけを、すぐ送信待ちに入れる（家3万件を調べ直さないので速い） */
  pushVisit(v, del) {
    if (!LIVE) { this.save(); return; }
    if (del) this.fp.visits.delete(v.id); else this.fp.visits.set(v.id, 1);
    this.dirty.visits = true;
    this.queue.push({ visits: { up: del ? [] : [clone(v)], del: del ? [v.id] : [] } });
    this.persistQueue();
    this.saveCacheSoon();
    flush();
  },
  persistQueue() {
    if (this.inactive) return; // ほかのタブが使っているときは、送信待ちを書きかえない
    if (!lsSet(QUEUE_KEY, JSON.stringify(this.queue))) toast('この端末に保存できませんでした。通信できる場所で開き直してください');
    updateSyncBadge();
  },
  /* 送信待ちの変更を重ね、控えもそれに合わせる */
  reapplyQueue() {
    if (this.queue.length) applyDiff(this.data, mergeChanges(this.queue)); // まとめて1回で重ねる（1件ずつだと3万件を何度も数え直すため）
    this.buildFp();
  },
  /* 全部を受け取ったとき */
  setServer(j) {
    this.sweep('full'); // 書きもらした変更は、全部を受け取る前に送信待ちに入れる（入れたものは、受け取ったあとに重ね直す）
    const st = j.state;
    if (st.visitsC) {
      st.visits = st.visitsC.map(a => {
        const v = { id: a[0], houseId: a[1], unit: a[2], result: RES_NAME[a[3]] || 'away', at: new Date(a[4] * 1000).toISOString(), by: a[5] };
        if (a[6]) v.age = a[6];
        if (a[7]) v.interest = a[7];
        if (a[8]) v.src = a[8];
    if (a[9]) v.oc = 1; // カードを持っていない人の記録（サーバーが付ける）
        return v;
      });
      delete st.visitsC;
    }
    this.data = st; this.migrate();
    this.seq = j.seq;
    this.metaSig = null;
    const ps = permSig();
    this.permSeen = new Set(ps.t.map(x => 't:' + x).concat(ps.f.map(x => 'f:' + x)));
    this.reapplyQueue();
    scrubVisits();
    restoreOrphan();
  },
  /* 変わった分だけを受け取ったとき。
     送信待ちがないときは、変わった家・記録だけを直す（3万件を調べ直さない）。
     戻り値 idxOk：記録の索引も1件ずつ直し終えたか（それなら、画面の作り直しで索引を作り直さなくてよい） */
  applyDelta(j) {
    const vBefore = this.data.visits, idxWas = IDX_SRC === vBefore && IDX_LEN === vBefore.length; // 記録の索引が、今の記録と合っているか
    // 速い保存のあと：受け取った変更を重ねる前に、書きもらした変更を送信待ちに入れる。
    // ふだん（送信待ちがない）は、受け取った家に送っていない変更があるときだけ全部を比べる（自分の保存の返事のたびに比べない）
    if (this.scoped) {
      const hs = (j.changes || []).filter(x => x[0] === 'houses').map(x => x[1]);
      if (this.queue.length || !this.fp || (hs.length && this.housesDiffer(hs))) this.sweep('delta');
    }
    const d = this.data, inc = !this.queue.length && !!this.fp, fp = inc ? this.fp : null;
    const idx = {}, dels = {};
    const indexOf = c => idx[c] || (idx[c] = new Map(d[c].map((x, i) => [x.id, i])));
    let idxOk = true, perm = false;
    for (const [c, id, v] of (j.changes || [])) {
      if (c === 'houses' || c === 'territories') idxOk = false;
      if (c === 'territories' || c === 'follows') perm = true;
      if (MAP_COLS.includes(c)) {
        d[c] = d[c] || {};
        if (v === null) delete d[c][id]; else d[c][id] = v;
        if (fp && fp[c]) { if (v === null) fp[c].delete(id); else fp[c].set(id, JSON.stringify(v)); }
        this.dirty.meta = true;
        continue;
      }
      if (!ARR_COLS.includes(c) || c === 'users') continue;
      this.markCol(c);
      const m = indexOf(c);
      if (v === null) {
        if (m.has(id)) {
          (dels[c] = dels[c] || new Set()).add(id);
          if (inc && c === 'visits') idxDelVisit(d[c][m.get(id)]);
        }
        if (fp) fp[c].delete(id);
        continue;
      }
      let loc = v; // 手元に入った物（中身だけを書きかえたときは、もとの物）
      if (m.has(id)) {
        const old = d[c][m.get(id)];
        if (c === 'visits' || !old) d[c][m.get(id)] = v;
        else { refill(old, v); loc = old; } // 区域・家などは中身だけを書きかえる（開いている画面がつかんでいる物を古くしない）
        if (dels[c]) dels[c].delete(id);
        if (inc && c === 'visits') { if (old) idxDelVisit(old); idxAddVisit(v); }
      } else {
        m.set(id, d[c].push(v) - 1);
        if (inc && c === 'visits') idxAddVisit(v);
      }
      // 控えは、手元の物の文字にする。中身だけを書きかえた物は、項目の並びがサーバーとちがうことがあり、
      // サーバーの文字のままだと「変わった」と見て、次の保存のたびに同じ家を送り直していた（改善案B2の確かめで見つけた）
      if (fp) fp[c].set(id, c === 'visits' ? 1 : JSON.stringify(loc));
    }
    Object.keys(dels).forEach(c => { if (dels[c].size) d[c] = d[c].filter(x => !dels[c].has(x.id)); });
    // 記録の索引は1件ずつ直してあるので、消した記録をのぞいた新しい一覧とも合っている（家・区域が変わったときに、記録を分け直さないため・改善案B1）
    if (inc && idxWas && d.visits !== vBefore) { IDX_SRC = d.visits; IDX_LEN = d.visits.length; }
    if (j.users) {
      const oldMe = (d.users || []).find(u => u.id === d.currentUser);
      const newMe = j.users.find(u => u.id === j.currentUser);
      if (oldMe && newMe && (oldMe.group || '') !== (newMe.group || '')) this.needMeta = true; // グループが変わった
      if (metaSigOf(j) !== this.metaSig) this.dirty.meta = true;
      d.users = j.users; d.settings = j.settings; d.currentUser = j.currentUser;
      this.metaSig = metaSigOf(j);
      if (USER_PENDING && USER_PENDING.size) applyUserPending(); // 保存中の人の変更は消さない
    }
    this.migrate();
    if (j.seq != null && j.seq !== this.seq) { this.seq = j.seq; this.dirty.meta = true; }
    if (inc) {
      this.fp.users = new Map((d.users || []).map(x => [x.id, JSON.stringify(x)]));
      this.fp.settings = JSON.stringify(d.settings);
    } else {
      this.reapplyQueue();
    }
    if (perm || !inc) scrubVisits();
    return { idxOk: inc && idxOk, visOk: inc && idxWas }; // visOk：記録の索引は合っている（家・区域の索引だけを作り直せばよい）
  },
  cacheTimer: null,
  saveCacheSoon() {
    if (!LIVE || this.inactive) return;
    clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => this.saveCacheNow(), 2000);
  },
  /* 端末に書く：区域・予定などの「小さい部分」はいつも、家と記録は変わったときだけ */
  /* final：画面を閉じる・ほかのアプリに切りかえるとき（このときは家・記録もまとめて書く） */
  saveCacheNow(final) {
    clearTimeout(this.cacheTimer); this.cacheTimer = null;
    if (!LIVE || this.inactive || this.authLost || !this.data) return;
    const dt = this.dirty;
    if (!dt.meta && !dt.houses && !dt.visits) return;
    const now = Date.now(), cur = Number(this.seq), ds = this.diskSeq || {};
    const known = x => x !== null && x !== undefined && isFinite(Number(x));
    // 家・記録を今書くか：閉じるとき／前に書いてから10分たった／まだ一度も書いていない／番号がわからない
    let big = !!final || !this.bigAt || now - this.bigAt >= BIG_SAVE_GAP_MS || !isFinite(cur);
    if (!big && ((dt.houses && !known(ds.houses)) || (dt.visits && !known(ds.visits)))) big = true;
    const wH = dt.houses && big, wV = dt.visits && big;
    // 書かずに残す部分があるときは、端末に残す番号を、その部分を書いたときの番号にとどめる
    const held = [];
    if (dt.houses && !wH) held.push(Number(ds.houses));
    if (dt.visits && !wV) held.push(Number(ds.visits));
    const diskSeqNow = held.length ? Math.min(cur, ...held) : this.seq;
    const rest = Object.assign({}, this.data);
    delete rest.houses; delete rest.visits;
    const put = { c2_meta: { tag: this.token.slice(0, 12), seq: diskSeqNow, state: rest, savedAt: now, dataVer: DATA_VER } };
    if (wH) put.c2_houses = this.data.houses;
    if (wV) put.c2_visits = this.data.visits;
    this.dirty = { meta: false, houses: dt.houses && !wH, visits: dt.visits && !wV };
    if (wH || wV) this.bigAt = now;
    const seqWritten = this.seq;
    IDB.putMany(put).then(() => {
      const nd = Object.assign({}, this.diskSeq);
      if (wH) nd.houses = seqWritten;
      if (wV) nd.visits = seqWritten;
      this.diskSeq = nd;
    }).catch(() => { this.markAll(); /* 書けなかったときは、次にまた全部を書く */ });
  },
  async loadLive(tk) {
    this.token = tk.token;
    lsDel(OLD_CACHE_KEY); // 以前の保存場所は使わない
    try { this.queue = JSON.parse(lsGet(QUEUE_KEY) || '[]'); } catch (e) { this.queue = []; }
    if (!this.token) throw Object.assign(new Error('no token'), { code: 'auth' });
    let cache = null, legacy = false;
    const within = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('idb timeout')), ms))]);
    try {
      if (tk.changed) await within(IDB.clearCache(), 5000);
      else {
        const got = await within(IDB.getMany(['cache'].concat(CACHE_KEYS)), 8000);
        const m = got.c2_meta;
        if (m && m.state && Array.isArray(got.c2_houses) && Array.isArray(got.c2_visits)) {
          cache = { tag: m.tag, seq: m.seq, savedAt: m.savedAt, dataVer: m.dataVer,
            state: Object.assign({}, m.state, { houses: got.c2_houses, visits: got.c2_visits }) };
        } else if (got.cache) { cache = got.cache; legacy = true; } // 以前の形で保存したデータ
      }
    } catch (e) { cache = null; if (String(e.message) === 'idb timeout') IDB.db = null; }
    this.syncAt = Number(lsGet(SYNC_KEY) || 0) || (cache && cache.savedAt) || 0;
    if (cache) {
      const days = (cache.state && cache.state.settings && cache.state.settings.cacheDays) || 30;
      if (Date.now() - this.syncAt > days * DAY) { // しばらく通信できなかった端末
        try { await IDB.clearCache(); } catch (e) { /* 何もしない */ }
        cache = null; this.expired = true;
        clearAllMemos();
      }
    }
    // 古い版のアプリで保存したデータは使わない（その版が知らなかった「予定」などを、受け取りそこねているため）
    if (cache && cache.dataVer !== DATA_VER) cache = null;
    if (cache && cache.tag === this.token.slice(0, 12) && cache.state) {
      // 区域係：S-13（紙から転記した記録）を持っていない保存なら、区域・予定などだけを読み直す
      const cu = (cache.state.users || []).find(u => u.id === cache.state.currentUser);
      if (cu && cu.role === 'admin' && !Array.isArray(cache.state.s13)) this.needMeta = true;
      if (!Array.isArray(cache.state.agedata)) this.needMeta = true; // 年齢データを持っていない保存（この版より前）
      if (!Array.isArray(cache.state.holds)) this.needMeta = true; // おすすめの押さえを持っていない保存（2026.13.90 より前）
      this.setServer({ seq: cache.seq, state: cache.state }); // すぐ表示して、あとで差分を取りに行く
      this.diskSeq = { houses: cache.seq, visits: cache.seq }; this.bigAt = Date.now(); // 開いた直後に大きな書きこみをしない
      if (legacy) { this.markAll(); this.saveCacheSoon(); } // 新しい形で保存し直す
      return 'cache';
    }
    let last = { pct: 0, stage: 'meta', eta: null };
    loadLog = { t0: Date.now(), reqs: [], marks: [] };
    const j = await loadAll(
      p => { last = p; showLoadProgress(p, 0); },
      n => showLoadProgress(last, n),
      { parallel: 6 });
    await new Promise(r => setTimeout(r, 60)); // 「仕上げ」の表示を先に出してから、重い処理をする
    this.setServer(j);
    this.markAll();
    this.saveCacheSoon();
    this.pulled = true; // サーバーから全部を読み込んだ＝最新
    loadMark('finish');
    setTimeout(loadLogDone, 0); // 最初の画面を描いたあとに締める
    return 'server';
  }
};

/* ---------- 本番：通信 ---------- */
/* ?t= … 個別の招待リンク（これまでどおり）
   ?j= … 共通リンク。すでにこのスマホに使う人が決まっていれば、何もしない（名前は変えられない） */
function readToken() {
  const u = new URL(location.href), t = u.searchParams.get('t'), j = u.searchParams.get('j'), h = u.searchParams.get('h');
  let changed = false;
  if (t) {
    changed = lsGet(TOKEN_KEY) !== t;
    if (changed) { lsDel(QUEUE_KEY); lsDel(PENDING_KEY); } // 別の人のリンク
    lsSet(TOKEN_KEY, t);
    u.searchParams.delete('t');
  }
  if (j) { lsSet(JOIN_KEY, j); u.searchParams.delete('j'); }
  if (h) { lsSet(HOME_KEY, h); u.searchParams.delete('h'); } // ホーム画面のアイコンから、はじめて開いたとき
  if (t || j || h) history.replaceState(null, '', u.pathname + u.search + u.hash); // 画面のURLからコードを消す
  return { token: lsGet(TOKEN_KEY) || '', changed };
}
async function apiRaw(body) {
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('通信エラー ' + res.status);
  return res.json();
}
/* ホーム画面のアイコンから開いているか（iPhoneでは、Safariとデータの置き場所が分かれる） */
const isStandalone = () => window.navigator.standalone === true ||
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
const cleanUrl = () => {
  const u = new URL(location.href);
  u.searchParams.delete('t'); u.searchParams.delete('j'); u.searchParams.delete('h');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
};
let homeUrlDirty = false;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /Android/.test(navigator.userAgent);
const SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const ADDHOME_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
/* ホーム画面に追加する（アプリのように、アイコンから開けるようにする）
   iPhone：ホーム画面のアイコンとSafariは、保存した情報が別々。そのため、15分だけ使える「引きつぎの番号」を
           URLに入れた状態で追加してもらい、アイコンから開いたときに、その番号で使えるようにする（名前の登録はいらない）
   Android：Chromeと情報が同じなので、メニューから追加するだけ */
async function openHomeGuide() {
  if (isStandalone()) { // すでにホーム画面から開いている：アイコンの絵は、追加するときにしかえらべない（2026.13.82）
    infoSheet('ホーム画面から開いています', 'このアプリは、すでにホーム画面のアイコンから開いています。' +
      (isIOS() ? '<br><br>アイコンの絵は、ホーム画面に追加するときにえらびます。iPhoneでは、アイコンを作り直すと、このアイコンの中だけに保存している奉仕時間や自分の予定が消えることがあるので、今のアイコンのまま使うことをおすすめします。'
        : '<br><br>アイコンの絵は、ホーム画面に追加するときにえらびます。変えたいときは、今のアイコンを長押しして削除し、Chromeで区域マップを開いて、もう一度「ホーム画面に追加」をします。'));
    return;
  }
  const ios = isIOS(), android = /Android/.test(navigator.userAgent);
  let ready = !LIVE || !ios, note = '';
  if (LIVE && ios) {
    toast('準備しています…');
    try {
      const j = await api('home_code');
      if (j.code) {
        const u = new URL(location.href);
        u.searchParams.delete('t'); u.searchParams.set('h', j.code);
        history.replaceState(null, '', u.pathname + u.search + u.hash);
        homeUrlDirty = true; ready = true;
      }
    } catch (e) {
      if (e.code === 'unknown_action' && lsGet(TOKEN_KEY)) { // サーバーが古いとき：以前の方法（URLにコード）
        const u = new URL(location.href);
        u.searchParams.set('t', lsGet(TOKEN_KEY));
        history.replaceState(null, '', u.pathname + u.search + u.hash);
        homeUrlDirty = true; ready = true;
      } else note = '<div class="notice warn">インターネットにつながってから、もう一度「ホーム画面に追加」を押してください。</div>';
    }
  }
  lsSet(HOME_SEEN, '1');
  // iOS 26 からの Safari は、共有ボタンが「…」の中に入った（Safari の版は User-Agent の Version/○○。iOS の版の数字は 18_6 のまま変わらない・点検④U4）
  const sv = Number((navigator.userAgent.match(/Version\/(\d+)/) || [])[1]) || 0, ios26 = sv >= 26;
  const iPad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const appNm = esc(uiEff().appName || '区域マップ');
  const MORE_PIC = '<span class="hpic hmore" aria-hidden="true">…</span>';
  // アイコンの絵は、追加する直前にここでえらぶ（2026.13.82。以前は設定の中にあったが、追加したあとに変えても
  // ホーム画面のアイコンは変わらず、iPhoneではホーム画面のアプリとSafariで設定が別々なので、えらんだ絵が使われなかった）
  const curIc = String(uiEff().icon || '区'), curTx = String(uiEff().iconText || '');
  const ownIc = !ICONS.includes(curIc); // 以前に自分で入れた絵は、下の「自分で入れる」欄に入れておく
  // 好きな絵文字と文字は、たたんだ欄に入れる（ふだんは12個から押すだけ。絵文字はスマホの変換で出す・2026.13.85）
  const iconStep = `<p class="hstep">アイコンの絵をえらびます。</p>
    <div class="iconprev"><canvas id="hgPrev" width="180" height="180" aria-label="アイコンの見本"></canvas><p class="hint hint-must">えらばなくても、このまま進めてかまいません。</p></div>
    <div class="iconpick" role="group" aria-label="アイコンの絵">${ICONS.map(v => `<button type="button" data-hicon="${esc(v)}" data-notr aria-pressed="${v === curIc}">${esc(v)}</button>`).join('')}</div>
    <details class="more iconown"${ownIc || curTx ? ' open' : ''}><summary>好きな絵文字や文字を入れる</summary>
      <label class="field"><span>好きな絵文字</span><input type="text" id="hgIc" maxlength="16" value="${ownIc ? esc(curIc) : ''}" placeholder="例：❤️" autocomplete="off" autocapitalize="off" enterkeyhint="done"></label>
      <p class="hint hint-must">「はーと」「さくら」などと打って変換すると、❤️ や 🌸 などの絵文字が出ます。</p>
      <label class="field"><span>絵の下に入れる文字（4文字まで・なくてもかまいません）</span><input type="text" id="hgTx" maxlength="12" value="${esc(curTx)}" placeholder="例：りょう" autocomplete="off" enterkeyhint="done"></label>
    </details>`;
  const NAME_HINT = '<p class="hint hint-must">アイコンの下の名前は、この画面で好きな名前に変えられます。</p>';
  // 文は、スペイン語の辞書で1文ずつ置きかえられるよう、手順ごとに1つの文にする
  const iosStepsList = ios26 && !iPad ? [
      `<p class="hstep">画面の下の右にある「…」を押します。</p>${MORE_PIC}`,
      `<p class="hstep">「共有」を押します。</p><span class="hpic">${SHARE_SVG}共有</span>`,
      `<p class="hstep">「その他」を押して、「ホーム画面に追加」を押します。</p><span class="hpic">${ADDHOME_SVG}ホーム画面に追加</span><p class="hint hint-must">見つからないときは、出てきたメニューを上に動かします。</p>`,
      `<p>右上の <b>「追加」</b> を押します。ホーム画面に「${appNm}」のアイコンができます。</p>${NAME_HINT}`
    ] : [
      `<p>画面の下（iPadは上）にある <b>共有ボタン</b> を押します。</p><span class="hpic">${SHARE_SVG}</span>
        <p class="hint hint-must">見つからないときは、画面の下の「…」を押すと出てきます。</p>`,
      `<p>出てきたメニューを上に動かして、<b>「ホーム画面に追加」</b>を押します。</p><span class="hpic">${ADDHOME_SVG}ホーム画面に追加</span>${ios26 ? '<p class="hint hint-must">「その他」の中にあることもあります。</p>' : ''}`,
      `<p>右上の <b>「追加」</b> を押します。ホーム画面に「${appNm}」のアイコンができます。</p>${NAME_HINT}`
    ];
  iosStepsList.push(`<p>できたアイコンを押して開きます。<b>名前の登録はいりません。</b>そのまま使えます。</p>`);
  iosStepsList.unshift(iconStep);
  const stepsHtml = list => `<ol class="hsteps">${list.map((x, i) => `<li><span class="hnum">${i + 1}</span><div>${x}</div></li>`).join('')}</ol>`;
  const iosSteps = stepsHtml(iosStepsList) +
    (ready ? '<div class="notice info">この画面は開いたままで、1から進めてください。15分以内にアイコンを作って開けば、そのまま使えます。</div>' : '');
  const androidSteps = stepsHtml([
    iconStep,
    '<p>画面の右上の <b>「︙」</b> を押します。</p>',
    '<p><b>「ホーム画面に追加」</b>（または「アプリをインストール」）を押します。</p>',
    '<p><b>「追加」</b> を押します。ホーム画面にアイコンができます。</p>' + NAME_HINT
  ]);
  const pcSteps = '<p>パソコンでは、ブラウザの「ブックマーク（お気に入り）」に入れておくと、すぐ開けます。</p>';
  setSheet(headHtml(null, 'ホーム画面に追加する', 'アプリのように、アイコンから開けます') + note +
    (ios ? iosSteps : android ? androidSteps : pcSteps) +
    `<p class="hint">アイコンを押すと、ブラウザを開かずに区域マップが開きます。人に渡すスマホには追加しないでください。</p>
    <button class="btn primary block" data-close>閉じる</button>`);
  const hp = $('#hgPrev');
  if (hp) {
    drawIcon(hp);
    const icIn = $('#hgIc'), txIn = $('#hgTx');
    let lastPick = ownIc ? UI_DEFAULT.icon : curIc; // 自分で入れた絵を消したときにもどす絵
    const redraw = () => { uiSave(); applyIcon(); drawIcon(hp); }; // ページのアイコン（追加するときに使われる絵）も、その場で変える
    const press = v => $$('[data-hicon]', $('#sheet')).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.hicon === v)));
    $$('[data-hicon]', $('#sheet')).forEach(b => b.onclick = () => {
      UI.icon = lastPick = b.dataset.hicon; if (icIn) icIn.value = '';
      press(UI.icon); redraw();
    });
    // 日本語の変換の途中（「はー」など）は見本を変えず、決まってから変える
    // 入れられる数をこえたら、欄の中もその数までにする（見本と欄の文字をそろえる）
    const cut = (el, n) => { const g = graphemes(el.value); if (g.length > n) el.value = g.slice(0, n).join(''); };
    const onIc = ev => {
      if (ev && ev.isComposing) return;
      cut(icIn, 2);
      const v = clipG(icIn.value, 2);
      UI.icon = v || lastPick; press(UI.icon); redraw();
    };
    const onTx = ev => {
      if (ev && ev.isComposing) return;
      cut(txIn, 4);
      UI.iconText = clipG(txIn.value, 4); redraw();
    };
    if (icIn) ['input', 'compositionend', 'change'].forEach(n => icIn.addEventListener(n, onIc));
    if (txIn) ['input', 'compositionend', 'change'].forEach(n => txIn.addEventListener(n, onTx));
  }
}
/* ホーム画面のアイコンから、はじめて開いたとき：引きつぎの番号で使えるようにする */
async function claimHome() {
  const code = lsGet(HOME_KEY);
  lsDel(HOME_KEY);
  if (!code) return '';
  for (let i = 0; i < 3; i++) { // 混んでいる・回数制限（slow）のときは、少し待って3回までためす
    try {
      const j = await apiRaw({ action: 'home_claim', code, device: deviceLabel() });
      if (j.ok && j.token) { lsSet(TOKEN_KEY, j.token); lsSet(HOME_WELCOME, '1'); return j.token; }
      if (j.error !== 'slow' && j.error !== 'busy') break;
    } catch (e) { break; /* つながらないときは、下の案内を出す */ }
    await new Promise(r => setTimeout(r, 4000));
  }
  return '';
}
/* ホーム画面のアイコンから開いたのに、コードが引き継がれていないとき */
function openHomeHelp() {
  hideBlocking();
  joinPaint(`<h2>このアイコンを作り直してください</h2>
    <p>このアイコンは、作ってから時間がたったため使えません（15分以内に開く必要があります）。iPhoneでは、ホーム画面のアイコンとSafariで、保存した情報が別々に扱われるためです。</p>
    <ol style="padding-left:24px">
      <li>このアイコンを長押しして削除します。</li>
      <li>Safariで区域マップを開き、「区域カード」画面の<b>「ホーム画面に追加」</b>を押して、出てくる手順で追加し直します。</li>
    </ol>
    <a class="btn primary block" href="${esc(location.href)}" target="_blank" rel="noopener">ブラウザで開く</a>`);
}
function deviceLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'パソコン';
}
/* スマホが使えなくなったとき（係が登録を外した・招待リンクを作り直した・使う人を外した） */
function authLost() {
  if (Store.authLost) return;
  Store.authLost = true;
  clearTimeout(Store.cacheTimer);
  IDB.clearCache().catch(() => {});
  clearAllMemos();
  // まだ送っていない記録は消さずに、別に取っておく（招待リンクを作り直したときなど）。同じ人として登録し直したら送り、7日たったら消す（点検②H-10）
  let kept = 0;
  try {
    const uid = Store.data && Store.data.currentUser ? String(Store.data.currentUser) : ''; // currentUser は使う人の id
    if (uid && Store.queue.length) { lsSet(ORPHAN_KEY, JSON.stringify({ uid, at: new Date().toISOString(), queue: Store.queue })); kept = Store.queue.length; }
  } catch (e) { kept = 0; /* 取っておけなくても、消すのは続ける */ }
  [TOKEN_KEY, QUEUE_KEY, SYNC_KEY, PENDING_KEY, FAILED_KEY].forEach(lsDel);
  Store.queue = [];
  showBlocking('このスマホは使えなくなりました',
    '区域係がこのスマホの登録を外したか、リンクが作り直されました。区域の情報は、このスマホから消しました。もう一度使うときは、区域係からもらったリンクを開いてください。' +
    (kept ? `まだ送っていない記録（${kept}件）は、7日のあいだ取っておきます。区域係からもらった新しいリンクを開くと、送ります。` : ''));
}
/* 取っておいた「まだ送っていない記録」を、同じ人として登録し直したときに送る（ちがう人・7日すぎは消す） */
function restoreOrphan() {
  let o = null;
  try { o = JSON.parse(lsGet(ORPHAN_KEY) || 'null'); } catch (e) { o = null; }
  if (!o) return;
  const cu = Store.data && Store.data.currentUser ? String(Store.data.currentUser) : '';
  if (!cu) return;
  lsDel(ORPHAN_KEY);
  if (!Array.isArray(o.queue) || !o.queue.length || o.uid !== cu || !(daysSince(o.at) <= ORPHAN_DAYS)) return;
  Store.sweep('orphan');
  Store.queue = o.queue.concat(Store.queue);
  Store.persistQueue();
  Store.reapplyQueue();
  sendRetry = true; // サーバーは、すでに届いているものを二重にしない
  setTimeout(() => { toast(`前に送れなかった記録を送ります（${o.queue.length}件）`); flush(true); }, 1500);
}

/* ---------- 共通リンク：名前をえらぶ → 係の承認を待つ ---------- */
function joinPaint(html) {
  hideSplash(true);
  const el = $('#joinScreen');
  el.innerHTML = `<div class="joinbox">${window.KI ? KI.picker(true) : ''}${html}</div>`;
  el.hidden = false;
  el.scrollTop = 0;
  const h = el.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function joinError(title, msg, retry) {
  joinPaint(`<h2>${esc(title)}</h2><p>${msg}</p>${retry ? '<button class="btn primary block" id="jRetry">もう一度ためす</button>' : ''}`);
  if (retry) $('#jRetry').onclick = retry;
}
/* 共通リンク（QR）を開いた：その場で申し込み、係の確認を待つ（名前をえらぶ手間なし） */
async function openJoin() {
  hideBlocking();
  joinPaint('<div class="waitbox"><div class="waitspin" aria-hidden="true"></div><h2>申し込んでいます…</h2></div>');
  let j;
  try { j = await apiRaw({ action: 'join_scan', join: lsGet(JOIN_KEY), device: deviceLabel() }); }
  catch (e) { joinError('つながりませんでした', 'インターネットにつながっているか確認してください。', openJoin); return; }
  if (!j.ok) {
    if (j.error === 'join') { lsDel(JOIN_KEY); joinError('このリンクは使えなくなりました', '区域係から、新しいリンク（QR）をもらってください。'); return; }
    // busy＝申し込みが多すぎる（係が承認すれば空く）／slow＝短いあいだに何度も押された（少し待てば通る）
    joinError('申し込めませんでした', j.error === 'busy' ? '申し込みが多すぎるため、今は受け付けられません。区域係に相談してください。'
      : j.error === 'slow' ? '短いあいだに何度も申し込まれました。1分ほど待ってから、もう一度ためしてください。'
      : 'しばらくしてから、もう一度ためしてください。', j.error === 'busy' ? null : openJoin);
    return;
  }
  lsDel(QUEUE_KEY);
  lsSet(TOKEN_KEY, j.token);
  lsSet(PENDING_KEY, JSON.stringify({ code: j.code || '', at: new Date().toISOString() }));
  openWaiting();
}
let waitTimer = null;
function paintWaiting(p) {
  joinPaint(`<div class="waitbox"><div class="waitspin" aria-hidden="true"></div>
    <h2>区域係が確認しています</h2>
    <p>このまま、この画面でお待ちください。係が登録すると、自動で使えるようになります。</p>
    ${p.code ? `<p class="muted">係に見せる番号</p><p class="bigcode">${esc(p.code)}</p>` : ''}
    ${p.name ? `<p class="bigname">${esc(p.name)}さん</p>` : ''}
    <p class="muted" id="wState"></p></div>
    ${p.code ? `<details class="more"${p.hint ? '' : ''}><summary>名前を係に知らせる（なくてもよい）</summary>
      <label class="field"><span>お名前</span><span class="inline"><input type="text" id="wName" maxlength="30" value="${esc(p.hint || '')}" placeholder="例：山田 花子" autocomplete="name"><button class="btn small" id="wNameSend">送る</button></span></label></details>` : ''}
    <button class="btn block" id="wCancel">申し込みを取り消す</button>`);
}
function openWaiting() {
  hideBlocking();
  let p = {};
  try { p = JSON.parse(lsGet(PENDING_KEY) || '{}'); } catch (e) { p = {}; }
  paintWaiting(p);
  const check = async () => {
    clearTimeout(waitTimer);
    if (document.hidden) { waitTimer = setTimeout(check, 3000); return; }
    let j;
    try { j = await apiRaw({ action: 'join_status', token: lsGet(TOKEN_KEY) }); }
    catch (e) { if ($('#wState')) $('#wState').textContent = 'インターネットにつながっていません。つながると、自動で確認します。'; waitTimer = setTimeout(check, 6000); return; }
    if (j.ok && j.status === 'approved') {
      lsDel(PENDING_KEY); lsSet(FIRST_OK, '1');
      joinPaint('<div class="waitbox"><div class="waitok">✓</div><h2>使えるようになりました</h2><p>すぐに開きます…</p></div>');
      setTimeout(() => location.reload(), 1200);
      return;
    }
    if (j.ok && j.status === 'pending') {
      if ($('#wState')) $('#wState').textContent = `確認中です（${fmtTime(new Date())}）`;
      waitTimer = setTimeout(check, 3000); // 係が登録したら、すぐ分かるように
      return;
    }
    if (!j.ok && j.error !== 'auth') { // 混んでいる・回数制限（slow）・サーバーのエラー：申し込みは消さずに、少し待って確かめ直す
      if ($('#wState')) $('#wState').textContent = '混み合っています。少し待ってから、自動で確認します。';
      waitTimer = setTimeout(check, 15000);
      return;
    }
    clearTimeout(waitTimer);
    lsDel(TOKEN_KEY); lsDel(PENDING_KEY);
    joinError('登録は見送りになりました', '区域係に相談してください。', lsGet(JOIN_KEY) ? openJoin : null);
  };
  if ($('#wNameSend')) $('#wNameSend').onclick = async () => {
    const name = $('#wName').value.trim();
    if (!name) { toast('名前を入れてください'); return; }
    try {
      const j = await apiRaw({ action: 'join_hint', token: lsGet(TOKEN_KEY), name });
      if (!j.ok && j.error === 'slow') { toast('混み合っています。1分ほど待ってから、もう一度送ってください'); return; }
      if (!j.ok) throw new Error(j.error);
      p.hint = name; lsSet(PENDING_KEY, JSON.stringify(p));
      toast('係に名前を知らせました');
    } catch (e) { toast('送れませんでした。もう一度ためしてください'); }
  };
  $('#wCancel').onclick = async () => {
    if (!await ask('申し込みを取り消します。よろしいですか？')) return;
    clearTimeout(waitTimer);
    lsDel(TOKEN_KEY); lsDel(PENDING_KEY);
    if (lsGet(JOIN_KEY)) joinError('申し込みを取り消しました', 'もう一度申し込むときは、下のボタンを押してください。', openJoin);
    else joinError('申し込みを取り消しました', 'もう一度使うときは、区域係からもらったリンクを開いてください。');
  };
  check();
}
/* 通信の失敗を、原因ごとに見分ける
   timeout … 返事が来ないまま時間切れ（サーバーの処理が長すぎる・電波が弱い）
   network … つながらなかった
   nonjson … Google側のエラー画面が返ってきた（混み合い・同時に動かせる数の上限など）
   http●●● … 通信のエラー番号
   server  … サーバーの処理の中でエラー
   もう一度ためせば直る見込みのあるものには retry をつける */
const LASTERR_KEY = 'kuiki_last_error';
function noteError(action, e) {
  try { lsSet(LASTERR_KEY, JSON.stringify({ at: new Date().toISOString(), action, code: e.code || e.message, sample: e.sample || '' })); } catch (x) { /* 何もしない */ }
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function api(action, extra, opt) {
  const o = opt || {};
  const T = Date.now(), rqName = loadLog ? reqName(action, extra) : '';
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), o.timeout || 60000) : null;
  let res, text;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, token: Store.token }, extra || {})),
      signal: ctl ? ctl.signal : undefined,
      keepalive: !!o.keepalive // 画面を閉じても、送り終えられるように
    });
    text = await res.text();
  } catch (err) {
    const code = err && err.name === 'AbortError' ? 'timeout' : 'network';
    const e = Object.assign(new Error(code), { code, retry: true });
    logReq(rqName, T, code, 0, 0);
    noteError(action, e); throw e;
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    // 404：サーバーの処理は終わっているのに、Googleの受け渡し先から返事を受け取れなかったことがある → 送り直す
    let where = '';
    try { const u = new URL(res.url); where = u.host + u.pathname.replace(/\/macros\/s\/[^/]+/, '/macros/s/…'); } catch (x) { /* 何もしない */ }
    const what = action + (extra && extra.part ? `:${extra.part}${extra.offset ? '@' + extra.offset : ''}` : '');
    const e = Object.assign(new Error('http' + res.status), { code: 'http' + res.status, retry: res.status >= 429 || res.status === 404,
      sample: `${what}・${where}${res.redirected ? '（転送あり）' : ''}・${String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}` });
    logReq(rqName, T, 'http' + res.status, (text || '').length, 0);
    if (res.status === 404) relayLost = true;
    noteError(action, e); throw e;
  }
  let j;
  try { j = JSON.parse(text); } catch (err) {
    const e = Object.assign(new Error('nonjson'), { code: 'nonjson', retry: true, sample: String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) });
    logReq(rqName, T, 'nonjson：' + e.sample.slice(0, 60), text.length, 0);
    noteError(action, e); throw e;
  }
  logReq(rqName, T, j.ok ? (j.snap ? 'ok（まとめ）' : 'ok') : j.error, text.length, Array.isArray(j.rows) ? j.rows.length : 0);
  if (!j.ok) {
    if (j.error === 'auth') authLost();
    const e = Object.assign(new Error(j.error || 'error'), { code: j.error, retry: j.error === 'server' || j.error === 'busy' });
    if (j.msg) e.msg = String(j.msg).slice(0, 120); // 奉仕報告（S21）が断った理由（houkoku.js）
    if (j.error !== 'auth') noteError(action, e);
    throw e;
  }
  Store.syncAt = Date.now();
  lsSet(SYNC_KEY, String(Store.syncAt));
  if (j.mv && onMemoVer) onMemoVer(j.mv); // 再訪問メモが、ほかの端末で変わった合図
  if (j.wx) { WX = j.wx; lsSet('kuiki_wx', JSON.stringify(j.wx)); } // 雨の日・ひと言の天気（サーバーが調べた天気。weather.gs）。次に開いたとき、届く前でも使えるように控える
  return j;
}
/* ---------- はじめての読み込みの記録（遅いときに、どこで時間がかかったかを調べるため） ----------
   ・通信1回ごとに「何を・いつ始めて・何秒かかって・大きさ・結果」を残す。住所や名前は残さない
   ・終わったら、この端末の中だけに保存する（設定 → 区域係の画面「読み込みの記録」、または終わったときの知らせから見られる） */
const LOADLOG_KEY = 'kuiki_load_log';
let relayLost = false; // Google の受け渡しで返事がなくなった（iPhone の設定が原因のことがある）
let loadLog = null;
function reqName(action, extra) {
  const x = extra || {};
  const names = { meta: '区域・設定など', houses: '家', visits: '訪問の記録', tv: '区域の記録' };
  if (action === 'load' && x.part) return (names[x.part] || x.part) + (x.snap || x.vsnap ? '（まとめた一覧' + (x.offset ? `・${x.offset}件目から` : '') + '）' : x.offset ? `（${x.offset}件目から）` : '');
  return action;
}
function logReq(what, T, res, len, rows) {
  if (!loadLog || !what) return;
  loadLog.reqs.push({ what, s: (T - loadLog.t0) / 1000, sec: (Date.now() - T) / 1000, kb: Math.round((len || 0) / 1024), rows: rows || 0, res: String(res || '') });
}
function loadMark(name) { if (loadLog) loadLog.marks.push({ name, s: (Date.now() - loadLog.t0) / 1000 }); }
function loadLogClose(e) {
  if (!loadLog) return null;
  const L = loadLog; loadLog = null;
  L.total = (Date.now() - L.t0) / 1000;
  L.pageSec = Math.round(performance.now()) / 1000; // ページを開いてから使えるまで
  L.at = new Date().toISOString();
  L.ua = deviceLabel() + '・' + (navigator.userAgent.match(/(Edg|CriOS|FxiOS|Chrome|Firefox|Version)\/[\d.]+/) || [''])[0] + (/Brave/.test(navigator.userAgent) || navigator.brave ? '（Brave）' : '');
  L.net = navigator.connection && navigator.connection.effectiveType ? navigator.connection.effectiveType : '';
  if (e) L.error = String(e.code || e.message || 'unknown') + (e.sample ? `（${e.sample}）` : '');
  lsSet(LOADLOG_KEY, JSON.stringify(L));
  return L;
}
function loadLogDone() {
  const L = loadLogClose(null);
  if (L && L.pageSec > 30) toast(`はじめての読み込みに${Math.round(L.pageSec)}秒かかりました`, null, { label: '記録を見る', fn: openLoadLog });
}
function loadLogText(L) {
  const f = n => (Math.round(n * 10) / 10).toFixed(1);
  const ms = {}; L.marks.forEach(m => { ms[m.name] = m.s; });
  const retries = L.reqs.filter(r => !/^ok/.test(r.res));
  const lines = [
    `はじめての読み込みの記録（${new Date(L.at).toLocaleString('ja-JP')}・${APP_VERSION}）`,
    `端末：${L.ua}${L.net ? '・回線 ' + L.net : ''}`,
    `ページを開いてから使えるまで：${f(L.pageSec)}秒（そのうち読み込み ${f(L.total)}秒）`,
    `区域・設定など：${ms.meta != null ? f(ms.meta) + '秒で届く' : '-'}　家：${ms.houses != null ? f(ms.houses) + '秒で届く' : '-'}　記録：${ms.visits != null ? f(ms.visits) + '秒で届く' : '-'}　仕上げ（端末の中）：${ms.finish != null && ms.visits != null ? f(L.total - ms.visits) + '秒' : '-'}`,
    `やり直し：${retries.length}回${retries.length ? '（' + retries.map(r => r.res).join('、') + '）' : ''}`,
    ...(L.error ? [`結果：読み込めませんでした（${L.error}）`] : []),
    '',
    '開始　かかった　内容　件数　大きさ　結果',
    ...L.reqs.map(r => `${f(r.s)}秒　${f(r.sec)}秒　${r.what}　${r.rows || ''}　${r.kb}KB　${r.res}`)
  ];
  return lines.join('\n');
}
function openLoadLog() {
  let L = null;
  try { L = JSON.parse(lsGet(LOADLOG_KEY) || "null"); } catch (e) { L = null; }
  if (!L) { toast('まだ記録がありません（この端末ではじめて開いたときに残ります）'); return; }
  const txt = loadLogText(L);
  setSheet(headHtml(null, 'はじめての読み込みの記録', 'この端末で、はじめて開いたときの通信の記録') + `
    <pre class="loadlog">${esc(txt)}</pre>
    <button type="button" class="btn primary block" id="llCopy">コピーする</button>
    <p class="hint">遅かったときは、コピーして区域係（または作った人）に送ってください。住所や名前は入っていません。</p>`);
  $('#llCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); toast('コピーしました'); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('#sheet .loadlog')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('選んだ状態にしました。長押しでコピーしてください'); }
  };
}
/* 初回や読み直しは、分けて受け取る（件数が多くても止まらないように） */
function expandHouse(a) {
  return {
    id: a[0], terrId: a[1] || null, type: a[2] === 'a' ? 'apt' : 'house',
    lat: a[3], lng: a[4], label: a[5] || '',
    units: a[6] ? String(a[6]).split('|') : [],
    createdAt: new Date((a[8] || 0) * 1000).toISOString(), createdBy: a[7] || '',
    kind: a[9] || undefined, lock: a[10] ? true : undefined, prov: a[12] ? true : undefined, ban: a[14] === 'n' ? 'no' : a[14] === 'l' ? 'letter' : undefined, imp: a[15] ? true : undefined, cid: a[16] || undefined, mu: a[17] || undefined, bn: a[18] || undefined, ac: a[19] || undefined,
    uk: a[11] ? (() => { try { return JSON.parse(a[11]); } catch (e) { return undefined; } })() : undefined,
    ul: a[13] ? (() => { try { return JSON.parse(a[13]); } catch (e) { return undefined; } })() : undefined
  };
}
/* valid：返事の形を確かめる（まちがった形の返事が来たときも、送り直す） */
async function apiRetry(action, extra, onRetry, valid) {
  // 説明会のように大勢が同時に開くと、Google の「同時に動かせる処理の数」に届くことがある（持ち主1人で30）。
  // あきらめずに、間をあけて（みんながずれるように）6回まで送り直す（合わせて約2分・点検③P6）
  const waits = [2000, 5000, 10000, 20000, 30000, 40000];
  for (let i = 0; ; i++) {
    try {
      const j = await api(action, extra, { timeout: 120000 });
      if (valid && !valid(j)) {
        const what = action + (extra && extra.part ? `:${extra.part}${extra.offset ? '@' + extra.offset : ''}` : '');
        relayLost = true;
        const e = Object.assign(new Error('badreply'), { code: 'badreply', retry: true,
          sample: `${what}・返事の中身：${Object.keys(j || {}).join(',')}${j && j.mode ? '・mode=' + j.mode : ''}${j && j.app ? '・GETとして届いた' : ''}` });
        noteError(action, e); throw e;
      }
      return j;
    } catch (e) {
      if (!e.retry || i >= waits.length) throw e;
      if (onRetry) onRetry(i + 1, e);
      await wait(waits[i] * (0.8 + Math.random() * 0.6)); // みんなが同時にやり直さないよう、ずらす
    }
  }
}
/* 全部を読み込む。onProgress には { pct, stage, eta（残りの秒・わからないときは null） } をわたす
   段階：meta（区域など）→ houses（家）→ visits（訪問の記録）→ finish（仕上げ：スマホの中で整える） */
/* はじめての読み込み（家3万件・記録数十万件でも、短く・確実に）
   ・家と訪問の記録は、サーバーが用意した「まとめた一覧」（house-snap.gs）から受け取る。
     1回の処理が数秒で終わるので、Google の受け渡しで返事がなくなる（http404・GETとして届く）ことが起きにくい
   ・区域・設定など（meta）と、家の一覧、記録の一覧の最初の分を、同時に取りに行く
   ・一覧には、それを作った時点の変更番号 seq がつく。差分は、いちばん古い番号から受け取る（取りこぼさない）
   ・一覧が使えないとき（古いサーバーなど）は、これまでどおりシートから分けて受け取る（meta のあとに）
   ・opt.parallel … 同時に取りに行く数の目安（はじめて開くとき6、全員の読み直しのときは2） */
const PART_STEP = { houses: 5000, visits: 20000 };
// シートから分けて読むときは、前の分と少し重ねて読む。読み込みのあいだに、ほかの人が記録を取り消したり家を消したりすると、
// シートの行が上にずれて、分けめの記録が抜けることがあるため。重なって2回届いた分は、あとで1つにする（点検②V8）
const PART_OVERLAP = { houses: 100, visits: 200 };
async function runPool(tasks, n) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, n), tasks.length) }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
  }));
  return out;
}
async function loadAll(onProgress, onRetry, opt) {
  const par = Math.max(2, (opt && opt.parallel) || 2);
  const prog = o => { if (onProgress) onProgress(o); };
  const valid = j => !!(j && Array.isArray(j.rows));
  prog({ pct: 1, stage: 'meta', eta: null });
  // まとめた一覧は、meta と同時に（使えないときは null）
  const hsnapP = apiRetry('load', { part: 'houses', offset: 0, snap: 1 }, null, valid).catch(() => null);
  const vsnapP = apiRetry('load', { part: 'visits', offset: 0, vsnap: 1 }, null, valid).catch(() => null);
  const meta = await apiRetry('load', { part: 'meta' }, onRetry, j => !!(j && j.state && Array.isArray(j.state.territories)));
  loadMark('meta');
  const st = meta.state;
  const cnt = meta.counts || { houses: 0, visits: 0 };
  if (loadLog) loadLog.counts = cnt;
  const total = Math.max(1, cnt.houses + cnt.visits);
  const finishSec = 2 + total / 60000; // 仕上げ（スマホの中で整える）にかかるおおよその秒数
  const t0 = Date.now();
  let done = 0, housesDone = false;
  const seqs = [Number(meta.seq)];
  const tick = () => {
    const el = (Date.now() - t0) / 1000;
    const eta = done > 0 && el > 2 ? Math.round(Math.max(0, total - done) * el / done + finishSec) : null;
    prog({ pct: Math.min(95, 4 + Math.round(done / total * 91)), stage: housesDone || !cnt.houses ? 'visits' : 'houses', eta });
  };
  prog({ pct: 4, stage: 'houses', eta: null });
  const fetchPart = (part, offset, extra) => apiRetry('load', Object.assign({ part, offset }, extra || {}), onRetry, valid)
    .then(r => { done += r.rows.length; tick(); return r; });
  const inOrder = async (part, off, chunks) => { // 1つずつ順に（前の分と少し重ねて読む）
    const ov = PART_OVERLAP[part] || 0;
    while (off !== null && off !== undefined) {
      const r = await fetchPart(part, off); chunks.push(r.rows);
      off = r.next === null || r.next === undefined ? null : r.next - Math.min(ov, Math.floor((r.next - off) / 10)); // 1回に返す件数が少ないサーバーでも、先へ進む
    }
    return chunks;
  };
  // シートから分けて受け取る（meta のあとに読むので、変更番号の順は正しい）
  const loadPart = async (part, n) => {
    const size = PART_STEP[part], step = size - (PART_OVERLAP[part] || 0), offs = [];
    for (let o = 0; o < Math.max(1, cnt[part] || 0); o += step) offs.push(o);
    const rs = await runPool(offs.map(o => () => fetchPart(part, o)), n);
    if (rs.some((r, k) => r.next !== null && r.next !== undefined && r.next !== offs[k] + size)) return inOrder(part, 0, []); // サーバーの件数がちがう
    const chunks = rs.map(r => r.rows), lastR = rs[rs.length - 1];
    return lastR.next !== null && lastR.next !== undefined ? inOrder(part, lastR.next - (PART_OVERLAP[part] || 0), chunks) : chunks; // 読み込みのあいだに増えた分
  };
  const isSnap = r => !!(r && r.snap && !r.gone && isFinite(Number(r.seq)));
  // 記録の一覧：最初の分から全体の件数がわかるので、残りを同時に（3つまで）
  const visitsFromSnap = async first => {
    if (!isSnap(first)) return null;
    done += first.rows.length; tick();
    const chunks = [first.rows];
    if (first.next !== null && first.next !== undefined) {
      const step = Number(first.next), offs = [];
      for (let o = step; o < (Number(first.total) || 0); o += step) offs.push(o);
      const rs = await runPool(offs.map(o => () => fetchPart('visits', o, { vsnap: 1, ver: first.ver })), 3);
      if (rs.some(r => !isSnap(r))) return null; // 途中で一覧が作り直された → シートから
      rs.forEach(r => chunks.push(r.rows));
    }
    seqs.push(Number(first.seq));
    return chunks;
  };
  const [hc, vc] = await Promise.all([
    hsnapP.then(h => {
      if (isSnap(h) && (h.next === null || h.next === undefined)) { done += h.rows.length; seqs.push(Number(h.seq)); return [h.rows]; }
      return loadPart('houses', Math.ceil(par / 2));
    }).then(c => { housesDone = true; loadMark('houses'); tick(); return c; }),
    vsnapP.then(visitsFromSnap).then(c => c || loadPart('visits', 2))
  ]);
  loadMark('visits');
  // 同じ家・記録が2回届いても、1つにする（読み込みのあいだに行がずれたとき）
  st.houses = [];
  const hs = new Set();
  hc.forEach(rows => rows.forEach(a => { if (hs.has(a[0])) return; hs.add(a[0]); st.houses.push(expandHouse(a)); }));
  const vis = [], vs = new Set();
  vc.forEach(rows => rows.forEach(a => { if (vs.has(a[0])) return; vs.add(a[0]); vis.push(a); }));
  prog({ pct: 96, stage: 'finish', eta: Math.round(finishSec) });
  st.visitsC = vis;
  return { mode: 'full', seq: Math.min(...seqs.filter(x => isFinite(x))), state: st };
}
let reloading = false;
async function reloadAll(delay) {
  if (!LIVE || reloading || Store.inactive) return;
  reloading = true;
  try {
    // 全員が同時に3万件を読み直すとサーバーが混むので、0〜15秒ずらす
    if (delay) { updateSyncBadge('最新の情報を用意しています…'); await wait(Math.random() * 15000); }
    const j = await loadAll(p => updateSyncBadge(`読み込み中 ${p.pct}%`), null, { parallel: 2 });
    Store.needFull = false; Store.needMeta = false;
    Store.inbox = [j];
    applyInbox();
  } finally { reloading = false; updateSyncBadge(); }
}
/* 区域・予定・申し込みなど（家と記録以外）だけを読み直す。グループが変わったときなど */
let metaLoading = false;
async function reloadMeta() {
  if (!LIVE || metaLoading || reloading || Store.inactive) return;
  metaLoading = true;
  try {
    const r = await api('load', { part: 'meta' });
    Store.sweep('meta'); // 読み直した分を入れる前に、書きもらした変更を送信待ちに入れる
    const st = r.state || {}, d = D();
    ['territories', 'requests', 'awayCards', 'returns', 'schedules', 's13', 'agedata', 'holds'].forEach(c => {
      if (!Array.isArray(st[c])) return;
      const old = new Map((d[c] || []).map(x => [x.id, x]));
      d[c] = st[c].map(x => { const cur = old.get(x.id); return cur ? refill(cur, x) : x; }); // 同じ物は中身だけ書きかえる
    });
    MAP_COLS.forEach(c => { if (st[c] && typeof st[c] === 'object') d[c] = st[c]; });
    if (Array.isArray(st.users)) d.users = st.users;
    if (st.settings) d.settings = st.settings;
    // 変更の番号はそのままにする（その間の家・記録の変更は、次の差分で届く）
    Store.needMeta = false; Store.metaSig = null;
    Store.migrate(); Store.reapplyQueue(); scrubVisits();
    Store.dirty.meta = true; Store.saveCacheSoon();
    updateTabs(); renderAll(); checkPermGain();
  } catch (e) { /* 次の機会に */ } finally { metaLoading = false; }
}
let flushing = false, lastRefresh = 0;
/* 取りに行く間隔（係の画面で調整できる）。
   ・みんなが同じ時刻に取りに行かないよう、毎回すこしずらす（集まりで一斉に開いても、サーバーが混まないように）
   ・通信に失敗したら、間隔をのばして様子を見る（最大1分） */
let nextPollAt = 0, pollFail = 0;
function pollGap() {
  const st = D().settings;
  // 集まりの前後は、範囲の割りふりがすぐ届くように、短い間隔で取りに行く
  const base = (groupActive() || meetingNow()) ? (st.syncGroupSec || 7) * 1000
    : (currentView === 'cards' || currentView === 'map') ? (st.syncNormalSec || 20) * 1000 : 25000;
  return Math.min(60000, base * Math.pow(2, pollFail));
}
function schedulePoll() { nextPollAt = Date.now() + pollGap() * (0.85 + Math.random() * 0.3); }
/* 一緒に回っているとき、案内の帯に「〇秒前に更新」を出す */
function updateSyncAge() {
  const el = $('#barAge'); if (!el || !LIVE) return;
  const sec = Store.syncAt ? Math.round((Date.now() - Store.syncAt) / 1000) : null;
  el.textContent = sec == null ? '' : sec < 5 ? 'さっき更新' : `${sec}秒前に更新`;
}
/* 受け取った変更を反映するのを待つのは、線引き・家の追加の最中と、文字を入力している最中だけ
   （記録の画面を開いているだけなら、すぐ反映して、ほかの人のチェックが早く見えるようにする） */
const isBusy = () => {
  if (mode !== 'normal') return true;
  const a = document.activeElement;
  return !$('#sheet').hidden && !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('#sheet').contains(a);
};
/* 受け取った変更は、入力中でなければすぐ、入力中なら終わってから反映する */
function receive(j) {
  if (j.mode === 'full') Store.inbox = [j];
  else Store.inbox = Store.inbox.filter(x => x.mode === 'full').concat([j]);
  applyInbox();
}
function applyInbox() {
  if (!LIVE || !Store.inbox.length || isBusy() || flushing || Store.inactive) return;
  const list = Store.inbox;
  Store.inbox = [];
  let any = false, full = false, idxOk = true, visOk = true;
  list.forEach(j => {
    if (j.mode === 'full') { Store.setServer(j); Store.markAll(); full = true; any = true; return; }
    if (Store.trivial(j)) { // 何も変わっていない（ふだんの問い合わせのほとんど）
      if (j.seq != null && j.seq !== Store.seq) { Store.seq = j.seq; Store.dirty.meta = true; }
      return;
    }
    const r = Store.applyDelta(j);
    any = true;
    if (!r.idxOk) idxOk = false;
    if (!r.visOk) visOk = false;
  });
  Store.saveCacheSoon();
  if (Store.needFull && !reloading) setTimeout(() => reloadAll(true).catch(() => {}), 0);
  else if (Store.needMeta) setTimeout(() => reloadMeta().catch(() => {}), 0);
  // サーバーの最新の変更を受け取った（変わっていない返事も含む）。係の画面を開いていれば、ここで自動の確かめを動かす（開いた直後の古いデータでは動かさない。P6）
  Store.pulled = true;
  if (currentView === 'admin') adminSweepSoon();
  if (!any) return;
  updateTabs();
  // 家・区域だけが変わったときは、家・区域の索引だけを作り直す（記録の分け直しはしない・改善案B1）
  renderAll(full ? false : idxOk ? true : visOk ? 'houses' : false);
  checkPermGain();
  notifyNewPart();
}
/* 自分に範囲がわたされたら、その場で知らせる */
/* ---------- 今日たのまれた区域（「今日回る人」「回る範囲」）のお知らせ ----------
   ・アプリを開いていれば、とどいたときにお知らせを出す
   ・閉じていたときも、次に開いたとき、ホームと区域カードの上に「たのまれました」を出す
     （「わかりました」か「地図をひらく」を押すまで出る。このスマホに覚える） */
const asgSeenKey = () => 'kuiki_asg_seen_' + me().id;
function asgSeen() { try { return new Set(JSON.parse(lsGet(asgSeenKey()) || '[]')); } catch (e) { return new Set(); } }
function asgMarkSeen(keys) {
  const s = asgSeen(); keys.forEach(k => s.add(k));
  lsSet(asgSeenKey(), JSON.stringify([...s].slice(-60)));
}
/* 今日、自分にたのまれている区域（担当者本人の区域はのぞく） */
function todayAsgs() {
  const out = [];
  D().territories.forEach(t => {
    if (t.holder === me().id) return;
    const h = helpersOf(t).find(x => x.uid === me().id), p = myPart(t);
    if (!h && !p) return;
    const keys = [];
    if (h) keys.push(`h:${t.id}:${h.at}`);
    if (p) keys.push(`p:${p.id}`);
    out.push({ t, p, by: (p && p.by) || (h && h.by) || t.holder, keys });
  });
  activeCards().forEach(c => { // グループで回る留守宅カード
    if (c.by === me().id) return;
    const h = cardHelpers(c).find(x => x.uid === me().id), t = terrById(c.terrId);
    if (!h || !t) return;
    out.push({ t, p: null, by: h.by, keys: [`c:${c.id}:${h.at}`], card: c.id, label: `留守宅カード（区域${t.no}・${slotShort(c.slot)}）` });
  });
  return out;
}
function asgNoticeHtml() {
  const seen = asgSeen();
  return todayAsgs().filter(a => a.keys.some(k => !seen.has(k))).map(a => `<div class="notice info asgnote">
    <b>${a.label ? esc(a.label) : `区域${esc(a.t.no)}`}を、今日いっしょに回るように、たのまれました</b><br>
    ${esc(uname(a.by))}さんから${a.p ? `・回る範囲があります（${esc(partMates(a.p).map(u => uname(u) + 'さん').join('・') || 'ひとり')}と）` : ''}
    <span class="actions"><button class="btn small primary" data-asgopen="${esc(a.t.id)}"${a.card ? ` data-asgcard="${esc(a.card)}"` : ''} data-asgkeys="${esc(a.keys.join(' '))}">地図をひらく</button>
      <button class="btn small" data-asgok="${esc(a.keys.join(' '))}">わかりました</button></span></div>`).join('');
}
let seenParts = null;
function notifyNewPart() {
  const now = new Set(), list = todayAsgs();
  list.forEach(a => a.keys.forEach(k => now.add(k)));
  if (seenParts === null) { seenParts = now; if (list.length) paintAsg(); return; }
  const fresh = list.find(a => a.keys.some(k => !seenParts.has(k)));
  seenParts = now;
  if (!fresh) return;
  toast(fresh.p
    ? `区域${fresh.t.no}の回る範囲がとどきました（${partMates(fresh.p).map(u => uname(u) + 'さん').join('・') || 'ひとり'}と）`
    : `${uname(fresh.by)}さんから、${fresh.label || `区域${fresh.t.no}`}を今日いっしょに回るように、たのまれました`,
    null, { label: '地図をひらく', fn: () => { asgMarkSeen(fresh.keys); if (fresh.card) openAwayCard(fresh.card); else openTerr(fresh.t.id); } });
  paintAsg();
}
function paintAsg() {
  if (currentView === 'cards') renderCards();
  if (currentView === 'home') renderHome();
}
/* 送信待ちをまとめて送る（家を続けて190件追加しても、1件ずつ190回ではなく数回で送り終える）。
   あとの変更が前の変更を上書きする順番は、そのまま守る */
const SEND_BATCH = 50; // 1回に送る件数の目安（GASの処理時間が長くなりすぎないように）
const changeCount = ch => Object.keys(ch).reduce((n, c) => n + (c === 'settings' ? 1 : (ch[c].up.length + ch[c].del.length)), 0);
/* 1回の送信の大きさの上限（サーバーは 800KB をこえると受け付けない）。大きい変更は、この大きさまでに分けて送る */
const SEND_MAX_BYTES = 450000;
const SPLIT_ORDER = ['territories', 'agedata', 'houses', 'visits', 'dnc', 'caution', 'follows', 'released', 'requests', 'awayCards', 'schedules', 's13', 'returns'];
function splitChange(ch) {
  const cols = SPLIT_ORDER.filter(c => ch[c]).concat(Object.keys(ch).filter(c => c !== 'settings' && !SPLIT_ORDER.includes(c)));
  const out = [];
  let cur = {}, size = 2;
  const push = () => { if (Object.keys(cur).length) out.push(cur); cur = {}; size = 2; };
  const slot = c => cur[c] || (cur[c] = { up: [], del: [] });
  cols.forEach(c => { // サーバーが受け付ける順（区域 → 家 → 記録 → 拒否…）に分ける
    ch[c].del.forEach(id => { const n = String(id).length + 4; if (size + n > SEND_MAX_BYTES) push(); slot(c).del.push(id); size += n + 30; });
    ch[c].up.forEach(x => { const n = JSON.stringify(x).length + 2; if (size + n > SEND_MAX_BYTES) push(); slot(c).up.push(x); size += n + 30; });
  });
  if (ch.settings !== undefined) cur.settings = ch.settings;
  push();
  return out.length ? out : [ch];
}
function mergeChanges(list) {
  const acc = {}, out = {};
  let settings;
  list.forEach(ch => {
    Object.keys(ch).forEach(c => {
      if (c === 'settings') { settings = Object.assign({}, settings || {}, ch.settings); return; } // 変えた項目だけのこともあるので、重ねる
      const o = acc[c] || (acc[c] = { up: new Map(), del: new Set() });
      ch[c].up.forEach(x => {
        o.del.delete(x.id);
        const prev = o.up.get(x.id);
        // 家の部屋の「もとの一覧」は、まとめる前のいちばん古いもの（サーバーが知っている一覧）を使う（点検②V4）
        if (c === 'houses' && prev && prev.ub) x = Object.assign({}, x, { ub: prev.ub });
        o.up.set(x.id, x);
      });
      ch[c].del.forEach(id => { o.up.delete(id); o.del.add(id); });
    });
  });
  Object.keys(acc).forEach(c => { out[c] = { up: [...acc[c].up.values()], del: [...acc[c].del] }; });
  if (settings !== undefined) out.settings = settings;
  return out;
}
/* 送信に失敗したときは、2秒→4秒→8秒…（最大1分）と間をあけて送り直す。
   同じ変更が何度送っても受け付けられないときは、それを脇に置いて、ほかの記録の送受信を止めない */
let flushFail = 0, flushNextAt = 0, headFail = 0, skewWarned = false;
// 送り直しの印：前の送信の返事が届かなかったとき（と、アプリを開いて最初の送信）は、サーバーに「すでに届いているかもしれない」と伝える。
// サーバーは、その記録がシートにすでにあるか確かめてから入れる（同じ記録が2行にならないように・監査D3）
let sendRetry = true;
const failedList = () => { try { return JSON.parse(lsGet(FAILED_KEY) || '[]') || []; } catch (e) { return []; } };
function parkHead(e) {
  const ch = Store.queue.shift();
  if (!ch) return;
  const list = failedList();
  list.push({ at: new Date().toISOString(), code: String((e && (e.code || e.message)) || ''), ch });
  lsSet(FAILED_KEY, JSON.stringify(list.slice(-30)));
  Store.persistQueue();
  headFail = 0; flushNextAt = 0;
  Store.needFull = true; // 手元だけに残った変更を、サーバーの内容にもどす
  toast('送れない変更が1件ありました。上の「送れない変更」を押すと確かめられます');
}
async function flush(force) {
  if (!LIVE || flushing || Store.inactive || !Store.queue.length) { updateSyncBadge(); return; }
  if (!force && Date.now() < flushNextAt) { updateSyncBadge(); return; }
  flushing = true; updateSyncBadge();
  let rejected = 0, rejectedList = [], fixed = true, take = 1;
  try {
    while (Store.queue.length && !Store.inactive) {
      take = 1;
      if (JSON.stringify(Store.queue[0]).length > SEND_MAX_BYTES) { // 大きすぎる変更（区域をまとめて新しくしたときなど）は分けて送る
        const parts = splitChange(Store.queue[0]);
        if (parts.length > 1) { Store.queue.splice(0, 1, ...parts); Store.persistQueue(); }
      }
      let n = changeCount(Store.queue[0]);
      if (headFail < 2) { // 失敗が続くときは、1件ずつ送って原因の変更を見つける
        while (take < Store.queue.length && n + changeCount(Store.queue[take]) <= SEND_BATCH) n += changeCount(Store.queue[take++]);
      }
      const body = { changes: take === 1 ? Store.queue[0] : mergeChanges(Store.queue.slice(0, take)), since: Store.seq, ct: Date.now() }; // ct：端末の今の時刻（時計がずれていれば、サーバーが記録の日時を直す・点検②V19）
      if (sendRetry) body.re = 1;
      const keepalive = document.hidden && JSON.stringify(body).length < 50000; // 閉じる直前の送信
      sendRetry = true; // 返事が届くまでは「届いたかどうか分からない」
      const j = await api('sync', body, { keepalive });
      sendRetry = false;
      flushFail = 0; headFail = 0; flushNextAt = 0;
      if (j.skew && !skewWarned) { skewWarned = true; setTimeout(() => toast('スマホの時刻がずれています。スマホの設定で、日付と時刻を「自動」にしてください'), 1500); }
      const rj = j.rejected || [];
      if (rj.length) {
        rejected += rj.length; rejectedList = rejectedList.concat(rj);
        // 受け付けられなかった変更は、サーバーの今の内容（fix）で元にもどす。全部を読み直さなくてよい
        if (Array.isArray(j.fix) && !j.fixAll) { if (j.mode !== 'stale') j.changes = (j.changes || []).concat(j.fix); }
        else fixed = false;
      }
      Store.queue.splice(0, take);
      Store.persistQueue();
      if (j.mode === 'stale') Store.needFull = true;            // 差分では追いつけない → 全部を読み直す
      else Store.inbox = Store.inbox.filter(x => x.mode === 'full').concat([j]);
      lastRefresh = Date.now();
    }
  } catch (e) {
    // 使えなくなったスマホは authLost で知らせる。通信できないときは、間をあけて送り直す
    if (e.code !== 'auth' && !Store.inactive) {
      flushFail = Math.min(6, flushFail + 1);
      flushNextAt = Date.now() + Math.min(60000, 2000 * Math.pow(2, flushFail - 1)) * (0.8 + Math.random() * 0.4);
      const bad = !e.retry || e.code === 'server'; // 電波・混雑ではなく、変更の中身が原因かもしれない失敗
      if (bad) {
        headFail++;
        if (take === 1 && headFail >= (e.retry ? 8 : 2)) parkHead(e);
      }
    }
  } finally {
    flushing = false; updateSyncBadge();
  }
  if (rejected) {
    const NAME = { requests: '区域カードの申し込み', territories: '区域', houses: '家', visits: '訪問の記録', follows: '再訪問の受け持ち', awayCards: '留守宅カード', settings: '設定',
      returns: '返却の記録', dnc: '拒否の印', caution: '注意の印', released: '再訪問の引き継ぎ', schedules: '集まりの予定', s13: '区域割り当ての記録（S-13）', agedata: '年齢のデータ', users: '使う人' }; // 名前のない種類も英語のまま出さない（点検②V2）
    const kinds = [...new Set(rejectedList.map(r => NAME[r.c] || 'ほかの変更'))];
    toast(fixed ? `${kinds.join('・')}は受け付けられませんでした。元の状態にもどしました`
      : `${kinds.join('・')}は受け付けられませんでした。最新の情報に更新します`);
    if (!fixed) Store.needFull = true;
  }
  applyInbox();
  checkPermGain(); // 送り終えたので、新しく受け持った分の記録の詳細を受け取る（送る前には頼まない）
  if (!Store.queue.length && window.kmlAfterFlush) window.kmlAfterFlush(); // 区域をまとめて新しくしたあと：家の区域をサーバーで決め直す（kml-koushin.js）
  if (Store.needFull && !Store.queue.length) reloadAll(true).catch(() => {});
}
/* 最新の変更を取りに行く */
async function refresh(force) {
  if (!LIVE || flushing || Store.queue.length || Store.inactive) return;
  if (!force && Date.now() - lastRefresh < 5000) return;
  lastRefresh = Date.now();
  if (Store.needFull) { await reloadAll(false); return; }
  const j = await api('load', { since: Store.seq });
  if (j.mode === 'stale') { Store.needFull = true; await reloadAll(true); return; }
  receive(j);
}
function updateSyncBadge(text) {
  const el = $('#syncState');
  if (!el) return;
  const n = Store.queue.length, dead = LIVE ? failedList().length : 0;
  let t = text || '';
  if (!t) {
    if (flushing) t = '送信中…';
    else if (n) t = navigator.onLine === false ? `電波待ち ${n}件` : flushFail ? `未送信 ${n}件・自動で再送` : `未送信 ${n}件`;
    else if (dead) t = `送れない変更 ${dead}件`;
  }
  el.hidden = !LIVE || !t;
  el.textContent = t;
}
/* 上の「未送信」を押したとき：送信のようす */
function openSyncSheet() {
  if (!LIVE || !Store.data) return;
  const n = Store.queue.length, dead = failedList();
  let last = null;
  try { last = JSON.parse(lsGet(LASTERR_KEY) || 'null'); } catch (e) { last = null; }
  setSheet(headHtml(null, '送信のようす', '') + `
    <div class="setrow"><span>最後にサーバーとつながった時刻<br><b>${Store.syncAt ? fmtDate(new Date(Store.syncAt).toISOString()) : 'まだ'}</b></span></div>
    <p>${n ? `まだ送っていない変更が <b>${n}件</b> あります。電波が戻ると、自動で送ります。アプリを閉じても消えません。`
      : 'まだ送っていない変更はありません。'}</p>
    ${n ? '<button class="btn primary block" id="syNow">今すぐ送る</button>' : ''}
    ${dead.length ? `<div class="notice warn"><b>送れなかった変更が ${dead.length}件 あります。</b>何度送ってもサーバーが受け付けなかった変更です。
      「もう一度送る」を押しても送れないときは、区域係に伝えてください。${last && last.code ? `<br>番号：${esc(last.code)}` : ''}</div>
      <button class="btn block" id="syRetry">もう一度送る</button>
      <button class="btn block danger" id="syDrop">送らずに消す</button>` : ''}
    <button class="btn block" data-close>閉じる</button>`);
  if ($('#syNow')) $('#syNow').onclick = () => { flushFail = 0; flush(true).then(() => { closeSheet(); toast(Store.queue.length ? 'まだ送れていません。電波のよい場所でためしてください' : '送りました'); }); };
  if ($('#syRetry')) $('#syRetry').onclick = () => {
    Store.sweep('retry');
    Store.queue = failedList().map(x => x.ch).filter(Boolean).concat(Store.queue);
    lsDel(FAILED_KEY); Store.persistQueue();
    headFail = 0; flushFail = 0; Store.reapplyQueue(); renderAll();
    closeSheet(); flush(true);
  };
  if ($('#syDrop')) $('#syDrop').onclick = async () => {
    if (!await ask('送れなかった変更を消します。サーバーの内容に合わせて、画面を読み直します。よろしいですか？')) return;
    lsDel(FAILED_KEY); updateSyncBadge(); closeSheet();
    Store.needFull = true; reloadAll(false).catch(() => {});
  };
}

/* ---------- はじめての読み込みの進み具合（あいさつの画面と、読み込み中の画面に出す） ---------- */
const LD_STAGES = [['meta', '区域'], ['houses', '家'], ['visits', '訪問の記録'], ['finish', '仕上げ']];
function fmtEta(sec) {
  if (sec == null) return '残りの時間を計算しています…';
  if (sec < 10) return 'まもなく終わります';
  if (sec < 60) return `あと約${Math.ceil(sec / 10) * 10}秒`;
  const m = Math.floor(sec / 60), r = Math.round((sec % 60) / 10) * 10;
  return `あと約${m}分${r ? r + '秒' : ''}`;
}
function showLoadProgress(p, retry) {
  const si = Math.max(0, LD_STAGES.findIndex(x => x[0] === p.stage));
  const html = `<div class="ldsteps" aria-hidden="true">${LD_STAGES.map((x, i) =>
      `<span class="${i < si ? 'done' : i === si ? 'now' : ''}">${x[1]}</span>`).join('<i>›</i>')}</div>
    <div class="ldbar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="読み込みの進み具合"><i style="width:${p.pct}%"></i></div>
    <p class="ldpct"><b>${p.pct}%</b><span>${p.stage === 'finish' ? 'スマホの中でデータを整えています' : fmtEta(p.eta)}</span></p>
    ${retry ? `<p class="ldnote warn">サーバーからの返事がうまく届かなかったので、自動でもう一度ためしています（${retry}回目）</p>` : ''}
    ${retry && relayLost && isIOS() ? `<p class="ldnote warn"><b>iPhoneの設定が原因のことがあります。</b>「設定」→「Wi‑Fi」→ つないでいるWi‑Fiの「ⓘ」→「IPアドレスのトラッキングを制限」をオフにしてから、この画面を開き直してください。</p>` : ''}
    <p class="ldnote">初めて開くときだけ、時間がかかります。次からはすぐに開きます。画面を閉じずに、このままお待ちください。</p>`;
  const sp = $('#splash');
  if (sp && !sp.hidden) {
    sp.classList.add('loading');
    const b = $('#spProg'); b.innerHTML = html; b.hidden = false;
  }
  showBlocking('読み込んでいます…', '', true);
  const bp = $('#blockProg'); bp.innerHTML = html; bp.hidden = false;
}
function showBlocking(title, msg, keepSplash) {
  if (!keepSplash) hideSplash(true); // 読み込み中は、あいさつの画面をそのまま出しておく
  $('#blockTitle').textContent = title;
  $('#blockMsg').textContent = msg;
  $('#blockMsg').hidden = !msg;
  if (msg && $('#blockProg')) $('#blockProg').hidden = true; // ほかの知らせのときは、進み具合を消す
  $('#blocker').hidden = false;
}
function hideBlocking() { $('#blocker').hidden = true; }
const ERR_TEXT = {
  timeout: 'サーバーの返事が遅く、時間切れになりました。',
  network: 'サーバーにつながりませんでした。',
  nonjson: 'サーバーが混み合っていて、正しい返事が来ませんでした。',
  server: 'サーバーの中でエラーが起きました。',
  badreply: 'サーバーから、思っていたのとちがう形の返事が来ました。'
};
function showLoadError(e) {
  showBlocking('読み込めませんでした', (ERR_TEXT[e && e.code] || '通信がうまくいきませんでした。') + '少し時間をおいて「もう一度読み込む」を押してください。');
  const d = $('#blockDetail');
  d.textContent = `続くときは、区域係にこの番号を伝えてください：${(e && (e.code || e.message)) || 'unknown'}` + (e && e.sample ? `（${e.sample}）` : '') +
    `\n［${API_URL ? API_URL.slice(-12) : 'URLなし'}・${APP_VERSION}］`;
  d.style.whiteSpace = 'pre-line';
  if (NS) d.textContent += `・保存場所「${NS}」`;
  d.hidden = false;
  $('#blockRetry').hidden = false;
  $('#blockRetry').onclick = () => location.reload();
  // iPhone・iPad で、Google の受け渡しで返事がなくなったとき（http404・GETとして届いた）は、設定の案内を出す
  //（「IPアドレスのトラッキングを制限」がオンだと起きることを、2026.9.27 に確かめた）
  let g = $('#blockIosGuide');
  if (isIOS() && e && /^(http404|badreply)/.test(String(e.code || ''))) {
    if (!g) { g = document.createElement('div'); g.id = 'blockIosGuide'; g.className = 'notice warn iosguide'; $('#blockDetail').before(g); }
    g.innerHTML = `<p><b>iPhoneの設定を1か所変えると、読み込めるようになります。</b></p>
      <ol><li>「設定」を開く</li><li>「Wi‑Fi」→ つないでいるWi‑Fiの右の「ⓘ」</li><li>「IPアドレスのトラッキングを制限」をオフ</li><li>ここにもどって「もう一度読み込む」</li></ol>
      <p class="hint">モバイル通信のときは「設定」→「モバイル通信」→「通信のオプション」の中にあります。</p>`;
    g.hidden = false;
  } else if (g) g.hidden = true;
  // 通信の記録（どこで止まったか）を見て、コピーできるようにする
  const L = loadLogClose(e);
  if (L) {
    let b = $('#blockLogBtn');
    if (!b) { b = document.createElement('button'); b.id = 'blockLogBtn'; b.type = 'button'; b.className = 'btn block'; b.style.marginTop = '10px'; $('#blockRetry').after(b); }
    b.textContent = '通信の記録を見る・コピーする';
    b.hidden = false;
    b.onclick = () => {
      let pre = $('#blockLog');
      if (!pre) { pre = document.createElement('pre'); pre.id = 'blockLog'; pre.className = 'loadlog'; b.after(pre); }
      pre.textContent = loadLogText(L);
      if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(() => { b.textContent = 'コピーしました（区域係に送ってください）'; }, () => {});
    };
  }
}
async function logout() {
  const n = Store.queue.length;
  const q = n
    ? `まだ送っていない記録が${n}件あります。消すと送られません。それでもこの端末から消しますか？`
    : 'この端末から、区域マップの情報と招待リンクを消します。奉仕時間、自分の予定（このスマホだけの記録）も消えます。よろしいですか？';
  if (!await ask(q)) return;
  [TOKEN_KEY, QUEUE_KEY, OLD_CACHE_KEY, SYNC_KEY, PENDING_KEY, JOIN_KEY, FAILED_KEY].forEach(lsDel);
  clearAllMemos(true);
  clearTimeout(Store.cacheTimer);
  Store.inactive = true; // このあと保存し直さないように
  IDB.clearCache().catch(() => {});
  showBlocking('この端末から消しました', 'もう一度使うときは、区域係からもらったリンクを開いてください（共通リンクのときは、もう一度、係の承認が必要です）。');
}
const D = () => Store.data;
let HID = new Map(), TID = new Map();
const terrById = id => TID.get(id) || D().territories.find(t => t.id === id);
const houseById = id => HID.get(id) || D().houses.find(h => h.id === id);
const userById = id => D().users.find(u => u.id === id);
/* 名前を隠す（係の画面の「名前をかくす」）：schedule.js が unameMask を入れる。入っていないときは、ふつうの名前 */
let unameMask = null;
const uname = id => (unameMask && unameMask(id)) || (userById(id) || { name: '不明' }).name;
/* スペイン語などの画面で、文の中の人の名前・グループ名を訳さずに残すため、登録されている名前を i18n.js にわたす（改善案C4）。
   人は名簿の名前と S-13 の紙の記録の名前（「グループ奉仕（山田）」のような紙の名前は、かっこの中の名前）。日本語の画面では使われない */
if (window.KI && KI.nameSource) KI.nameSource(() => {
  const d = Store.data;
  if (!d) return null;
  const paper = (d.s13 || []).map(x => x && x.name).filter(Boolean).map(n => { const m = /^(?:グループ奉仕|全体の集まり)（(.+)）$/.exec(n); return m ? m[1] : n; });
  return { people: (d.users || []).map(u => u.name).concat(paper), groups: (d.users || []).map(u => u.group) };
});
function userOptions(sel, noneLabel) {
  return (noneLabel ? `<option value="">${noneLabel}</option>` : '') +
    D().users.map(u => `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
}
const me = () => userById(D().currentUser) || D().users[0];
const isAdmin = () => me().role === 'admin';
const targets = h => h.type === 'apt' ? h.units : [''];
const K = (hid, unit) => hid + '|' + (unit || '');
/* 区域番号：「53」「53-1」などを文字として扱い、数字の順に並べる */
const cmpNo = (a, b) => String(a).localeCompare(String(b), 'ja', { numeric: true });
const byNo = (a, b) => cmpNo(a.no, b.no);
const noCls = no => (String(no).length >= 3 ? ' long' : '');
function normNo(v) {
  return String(v || '').trim()
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[－ー―‐−–—]/g, '-').replace(/\s+/g, '');
}
const NO_RE = /^[0-9A-Za-z]+(-[0-9A-Za-z]+)*$/;
/* 最近会えた家（区域を回るときは、とばしてよい） */
const skipDays = () => Number(D().settings.skipDays || 0);
const followSkipDays = () => Number(D().settings.followSkipDays || 0);
function recentMet(k) {
  // 再訪問の家は「再訪問として最後に会えた日から○日」（係の設定）。それ以外は「最近会えた家」の日数
  const d = D().follows[k] ? followSkipDays() : skipDays();
  if (!d || D().dnc[k]) return false;
  const m = sum(k).met;
  return !!m && Date.now() - Date.parse(m.at) <= d * DAY;
}
const recentMetHouse = h => targets(h).some(u => recentMet(K(h.id, u)));
const canDelHouse = h => isAdmin() || h.createdBy === me().id;

/* 変更 → 保存 → 再表示 → 「取り消す」付きのお知らせ */
/* 変更 → 保存 → 再表示 → 「取り消す」付きのお知らせ
   取り消しは「この操作で変わったものだけ」を元にもどす。
   （そのあいだに届いた、ほかの人の記録や変更は消さない） */
function commit(msg, fn, onUndo) {
  const snapOf = () => JSON.stringify(Object.assign({}, D(), { visits: undefined, currentUser: undefined }));
  const preJson = snapOf(), vArr = D().visits, vLen = vArr.length, preVisits = vArr.slice();
  fn();
  // ほとんどの編集（区域・家・予定など）は記録を変えない。そのときは記録の調べ直しと索引の作り直しをはぶく
  const vSame = D().visits === vArr && vArr.length === vLen;
  Store.save(vSame); renderAll(vSame ? 'houses' : undefined);
  const postJson = snapOf(), postIds = vSame ? null : new Set(D().visits.map(v => v.id));
  toast(msg, () => {
    closeSheet();
    if (onUndo) onUndo();
    undoChange(JSON.parse(preJson), JSON.parse(postJson), preVisits, postIds);
    Store.save(); renderAll(); toast('取り消しました');
  });
}
/* よく使う直し（家の名前・建物と部屋・種別・家を足す・動かす・印・受け持ち）の commit（改善案B2）
   hids：この操作で変える家の id（足す家は、fn の中で D().houses に push すれば、自動で入る）
   ・家（2〜3万件）は、hids と足した家だけを、控え・比べ・送る。家のほかの部分（区域・印・受け持ち・設定など）は今までどおり全部を比べる
   ・「取り消す」の働きは commit と同じ（この操作で変わった分だけをもどす）
   ・書きもらしがあっても失わないよう、あとで全部を比べて、もれた変更も送る（Store.sweep）。テスト版では毎回確かめる（SCOPE_CHECK） */
function commitIn(hids, msg, fn, onUndo) {
  if (!LIVE || !Store.fp) return commit(msg, fn, onUndo); // 試作・練習モード、まだ読み込んでいないとき
  const only = new Set((hids || []).filter(Boolean));
  const hArr = D().houses, hLen = hArr.length;
  const pick = () => { const a = []; if (only.size) for (const h of D().houses) if (only.has(h.id)) a.push(h); return a; };
  const snapOf = () => JSON.stringify(Object.assign({}, D(), { visits: undefined, currentUser: undefined, houses: pick() }));
  const preJson = snapOf(), vArr = D().visits, vLen = vArr.length, preVisits = vArr.slice();
  fn();
  const vSame = D().visits === vArr && vArr.length === vLen;
  if (D().houses !== hArr || hArr.length < hLen) { // 家の一覧を置きかえた・家を消した（この関数を使わない操作）：全部を比べて送る
    console.error('commitIn：家の一覧が置きかわりました。全部を比べて送ります', msg);
    Store.save(vSame);
  } else {
    for (let i = hLen; i < hArr.length; i++) if (hArr[i] && hArr[i].id) only.add(hArr[i].id); // fn の中で足した家
    Store.save(vSame, only);
  }
  renderAll(vSame ? 'houses' : undefined);
  const postJson = snapOf(), postIds = vSame ? null : new Set(D().visits.map(v => v.id));
  toast(msg, () => {
    closeSheet();
    if (onUndo) onUndo();
    undoChange(JSON.parse(preJson), JSON.parse(postJson), preVisits, postIds);
    Store.save(); renderAll(); toast('取り消しました');
  });
}
function undoChange(pre, post, preVisits, postIds) {
  const d = D(), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ARR_COLS.forEach(c => {
    if (c === 'visits') return;
    const a = new Map((pre[c] || []).map(x => [x.id, x])), b = new Map((post[c] || []).map(x => [x.id, x])), changed = new Set();
    a.forEach((x, id) => { if (!b.has(id) || !same(x, b.get(id))) changed.add(id); });
    b.forEach((x, id) => { if (!a.has(id)) changed.add(id); });
    if (!changed.size) return;
    const keep = (d[c] || []).filter(x => !changed.has(x.id));
    changed.forEach(id => { if (a.has(id)) keep.push(a.get(id)); });
    d[c] = keep;
  });
  MAP_COLS.forEach(c => {
    const a = pre[c] || {}, b = post[c] || {};
    new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => {
      if (same(a[k], b[k])) return;
      if (k in a) d[c][k] = a[k]; else delete d[c][k];
    });
  });
  if (!same(pre.settings, post.settings)) d.settings = pre.settings;
  if (!postIds) return; // 記録は変えていなかった
  const preIds = new Set(preVisits.map(v => v.id));
  const added = new Set([...postIds].filter(id => !preIds.has(id)));
  const removed = preVisits.filter(v => !postIds.has(v.id));
  d.visits = d.visits.filter(v => !added.has(v.id)).concat(removed);
}

/* ---------- 記録の索引 ---------- */
let IDX = new Map(), HBT = new Map(), SUM = new Map();
const EMPTY_SUM = { n: 0, last: null, met: null, awayN: 0, slots: 0, metSlots: 0, awaySlots: 0, unmet: false, bestSlot: null };
const sum = k => SUM.get(k) || EMPTY_SUM;
const SLOT_MEMO = new WeakMap();
/* 記録の「曜日・時間帯」を、日時の文字（2026-10-25T01:23:45.678Z の形）から直接出す（改善案B1-2。日時の部品を作らないので速い）。
   使うのは、端末の時刻の地域が「夏時間がなく、1時間単位のずれ」のとき（日本など）だけ。読み込んだときに、今までの出し方と
   1500通りほど比べて、1つでもちがえば使わない。形のちがう日時（+09:00 など）は、今までの出し方で出す */
const SLOT_TXT = [['平日・朝', '平日・昼', '平日・午後', '平日・夕方', '平日・夜'], ['土日・朝', '土日・昼', '土日・午後', '土日・夕方', '土日・夜']];
const BAND_OF_H = Array.from({ length: 24 }, (_, h) => (h < 11 ? 0 : h < 14 ? 1 : h < 17 ? 2 : h < 19 ? 3 : 4)); // bandOf と同じ区切り
const WD_MEMO = new Map(); // 日付（UTC）→ 曜日
let SLOT_OFF = null;       // 端末の時刻のずれ（時間）。null のときは、速い出し方を使わない
function slotFast(s) {
  if (typeof s !== 'string' || (s.length !== 24 && s.length !== 20) || s.charCodeAt(10) !== 84 || s.charCodeAt(s.length - 1) !== 90) return null; // T と Z
  const a = s.charCodeAt(11) - 48, b = s.charCodeAt(12) - 48;
  if (a < 0 || a > 2 || b < 0 || b > 9 || a * 10 + b > 23) return null;
  let h = a * 10 + b + SLOT_OFF, sh = 0;
  if (h >= 24) { h -= 24; sh = 1; } else if (h < 0) { h += 24; sh = -1; }
  const ymd = s.slice(0, 10);
  let w = WD_MEMO.get(ymd);
  if (w === undefined) { const t = Date.parse(ymd + 'T00:00:00Z'); if (!isFinite(t)) return null; w = new Date(t).getUTCDay(); WD_MEMO.set(ymd, w); }
  w = (w + sh + 7) % 7;
  return SLOT_TXT[w === 0 || w === 6 ? 1 : 0][BAND_OF_H[h]];
}
(function () { // この端末で使えるかを確かめる
  try {
    const y = new Date().getFullYear(), offs = new Set();
    for (let yy = y - 3; yy <= y + 1; yy++) for (let m = 0; m < 12; m++) offs.add(new Date(yy, m, 15, 12).getTimezoneOffset());
    if (offs.size !== 1) return; // 夏時間がある
    const off = -[...offs][0];
    if (off % 60) return;        // 30分などのずれ
    SLOT_OFF = off / 60;
    const t0 = Date.UTC(y - 2, 0, 1), same = iso => slotFast(iso) === slotOf(new Date(iso)) && slotFast(iso.replace(/\.\d{3}Z$/, 'Z')) === slotOf(new Date(iso));
    for (let i = 0; i < 1000; i++) if (!same(new Date(t0 + i * (7 * 3600000 + 61007)).toISOString())) { SLOT_OFF = null; return; }
    for (let d = 0; d < 7; d++) for (let hh = 0; hh < 24; hh++) for (const ms of [0, 3599999]) {
      if (!same(new Date(t0 + 500 * 86400000 + d * 86400000 + hh * 3600000 + ms).toISOString())) { SLOT_OFF = null; return; }
    }
  } catch (e) { SLOT_OFF = null; }
})();
function slotOfVisit(v) {
  if (SLOT_OFF !== null) { const f = slotFast(v.at); if (f) return f; }
  let s = SLOT_MEMO.get(v);
  if (!s) { s = slotOf(new Date(v.at)); SLOT_MEMO.set(v, s); }
  return s;
}
/* 記録の索引をつくったときの記録の一覧（同じ一覧・同じ件数なら、記録の索引は作り直さなくてよい） */
let IDX_SRC = null, IDX_LEN = -1;
function buildIndex(only) {
  AGE_CACHE = null; RATE_CACHE = null; SHARE_CACHE = null; CHANCE_CACHE = null; RECO_CACHE = null;
  HBT = new Map(); HID = new Map(); TID = new Map(); SPEC_MEMO = new Map(); SPC = null;
  for (const t of D().territories) TID.set(t.id, t);
  for (const h of D().houses) {
    HID.set(h.id, h);
    if (!HBT.has(h.terrId)) HBT.set(h.terrId, []);
    HBT.get(h.terrId).push(h);
  }
  if (only === 'houses' && IDX_SRC === D().visits && IDX_LEN === D().visits.length) return; // 記録は変わっていない
  IDX = new Map(); SUM = new Map();
  IDX_SRC = D().visits; IDX_LEN = D().visits.length;
  for (const v of D().visits) {
    const k = K(v.houseId, v.unit);
    if (!IDX.has(k)) IDX.set(k, []);
    IDX.get(k).push(v);
  }
  for (const k of IDX.keys()) sumKey(k);
}
/* その家（部屋）だけ、まとめを作り直す */
function sumKey(k) {
  // 会える見込みの集計（RATE_CACHE）は、ここでは捨てない。記録が1件ふえる・へるときは idxAddVisit・idxDelVisit で足し引きする（改善案B3）
  const a = IDX.get(k);
  if (!a || !a.length) { SUM.delete(k); IDX.delete(k); return; }
  a.sort((x, y) => (x.at < y.at ? 1 : -1)); // 新しい順
  const s = { n: a.length, last: a[0], met: null, awayN: 0, slots: 0, metSlots: 0, awaySlots: 0, unmet: true, bestSlot: null };
  let cnt = null;
  for (let i = 0; i < a.length; i++) {
    const v = a[i], sl = slotOfVisit(v), bit = SLOT_BIT[sl]; // 時間帯は記録ごとに1回だけ計算して覚えておく
    s.slots |= bit;
    if (v.result === 'met') {
      if (!s.met) s.met = v;
      s.unmet = false; s.metSlots |= bit;
      cnt = cnt || {};
      cnt[sl] = (cnt[sl] || 0) + 1;
      if (!s.bestSlot || cnt[sl] > cnt[s.bestSlot]) s.bestSlot = sl;
    } else if (v.result === 'away') { s.awayN++; s.awaySlots |= bit; }
    else s.unmet = false;
  }
  SUM.set(k, s);
}
/* 1件の記録だけを足す・消す（全部を数え直さないので、続けて記録しても待たされない） */
function idxAddVisit(v) {
  const k = K(v.houseId, v.unit);
  if (!IDX.has(k)) IDX.set(k, []);
  IDX.get(k).push(v);
  sumKey(k);
  rateStep(v, 1);
  if (IDX_SRC === D().visits) IDX_LEN = D().visits.length; // 1件ずつ直したので、索引は今の記録と合っている
}
function idxDelVisit(v) {
  const k = K(v.houseId, v.unit), a = IDX.get(k);
  if (!a) return;
  const i = a.findIndex(x => x.id === v.id);
  if (i >= 0) { a.splice(i, 1); rateStep(v, -1); }
  sumKey(k);
}
const visitsOf = k => IDX.get(k) || [];
let SPEC_MEMO = new Map();
const housesOf = tid => {
  const t = TID.get(tid);
  if (!isSpecial(t)) return HBT.get(tid) || [];
  const key = D().houses.length + '|' + JSON.stringify(t.special) + '|' + JSON.stringify(t.polygon || []) + '|' + (t.lentAt || '') + '|' + (t.special.unmet ? D().visits.length : 0);
  const m = SPEC_MEMO.get(tid);
  if (m && m.key === key) return m.list;
  // 家を名指しした特別区域（件数で分けたカード）は、その家だけを見る（3万件を全部調べない）
  const ids = spIds(t);
  const list = ids ? [...ids].map(id => HID.get(id)).filter(h => h && inSpecial(h, t)) : D().houses.filter(h => inSpecial(h, t));
  SPEC_MEMO.set(tid, { key, list });
  return list;
};
function statusOf(k) {
  if (D().dnc[k]) return 'dnc';
  const v = visitsOf(k)[0];
  return v ? v.result : 'new';
}
/* 再訪問の受け持ち */
const fol = k => D().follows[k] || null;
const followIdle = f => daysSince(f.touchedAt);
function followStage(f) { const d = followIdle(f), s = D().settings; return d >= s.escalateDays ? 2 : d >= s.remindDays ? 1 : 0; }
function parseKey(k) { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; }
/* ---------- 拒否の印（D().dnc） ----------
   キー：「家id|部屋」＝家につながった拒否／「pin:…」＝家とつながっていない、場所だけの拒否（区域係が取り込み・追加したもの）
   値：true（訪問で記録した拒否）か { a: 住所, s: 登録元（xl・kml・adm）, at, lat, lng, p: 1（場所だけ）, appx: 1（場所はだいたい）, auto: 1（自動でつないだ）, t: 区域id, no: 区域番号 }
   くわしくは kyohi.js */
const isPinKey = k => String(k).indexOf('|') < 0;
const dncTerrOf = d => (d && d.t && terrById(d.t) ? d.t : d && isFinite(d.lat) && d.lat != null ? terrOf(d.lat, d.lng) : null); // 場所だけの拒否の区域
function dncPins() { // 場所だけの拒否（地図に出せるもの）
  const out = [], m = D().dnc || {};
  for (const k in m) { const v = m[k]; if (isPinKey(k) && v && typeof v === 'object' && isFinite(v.lat) && isFinite(v.lng) && v.lat != null) out.push([k, v]); }
  return out;
}
/* 家や部屋を消すとき：住所のある拒否（取り込み・係が追加したもの）は、場所だけの拒否にして残す。訪問で記録した拒否は消す */
function dncDrop(k, h, keepPlain) {
  const m = D().dnc, v = m[k];
  if (v === undefined) return;
  delete m[k];
  h = h || houseById(parseKey(k)[0]);
  // 住所のない拒否（伝道者が付けた true など）も、区域係が家を消すとき（keepPlain）は、家の位置に場所だけの印として残す（H8・D5）。
  // 場所だけの印は区域係しか作れない（サーバーも止める）ので、係以外の画面では今までどおり（住所のある拒否だけ）。
  // 部屋を消す・印を注意に変えるなど、家を消さないときは今までどおり
  const plain = !v || typeof v !== 'object' || !(v.a || v.s);
  if (plain && !(keepPlain && isAdmin() && h && h.lat != null && h.lng != null && Number.isFinite(+h.lat) && Number.isFinite(+h.lng))) return; // 位置のない家は作らない（サーバーが削除を止める）
  const o = Object.assign({}, v && typeof v === 'object' ? v : {}, { p: 1, dk: k });
  delete o.auto;
  if (!o.s) o.s = 'del';
  if (!o.at) o.at = new Date().toISOString();
  const unit = parseKey(k)[1];
  if (unit && !o.room) o.room = unit;
  // 位置は家の位置。家の位置がないときは、拒否にある位置のまま（位置のない印は、サーバーが受け付けない）
  if (h && h.lat != null && h.lng != null && Number.isFinite(+h.lat) && Number.isFinite(+h.lng)) { o.lat = h.lat; o.lng = h.lng; }
  if (h && h.terrId) o.t = h.terrId;
  m['pin:' + uid()] = o;
}
/* 部屋の「表示名」：部屋には変わらない中の番号（units）があり、名前だけを ul で変えられる。
   記録は中の番号に結びついているので、名前を何度直しても記録はそのまま */
const uName = (h, u) => (h && h.ul && h.ul[u]) || u;
const unitTitle = (h, u) => { const n = uName(h, u); return /\d$/.test(n) ? n + '号室' : n; };
const cleanUnit = v => String(v || '').replace(/[|]/g, '').replace(/[\s　]+/g, '').slice(0, 12);
function targetName(h, unit) { return h.type === 'apt' ? `${esc(h.label || '集合住宅')} ${esc(unitTitle(h, unit))}` : esc(h.label || '家'); }
/* 年代・また訪ねたいかを見られるのは、区域係・その区域の担当者・再訪問を受け持っている本人・記録した本人だけ */
function canSeeDetail(k, house) {
  if (isAdmin()) return true;
  const h = house || houseById(parseKey(k)[0]), t = h && terrById(h.terrId), f = fol(k);
  return !!((t && t.holder === me().id) || (f && f.by === me().id));
}
const seeV = (v, k, house) => v.by === me().id || canSeeDetail(k, house);
/* 再訪問のリストから「外した」家（もう訪ねない）：外したときより前の★は数えない */
const closedAt = k => { const r = D().released[k]; return r && r.reason === 'closed' ? r.at : null; };
/* 引き継ぎを待っている家（「外した」家はふくめない） */
const relOf = k => { const r = D().released[k]; return r && r.reason !== 'closed' ? r : null; };
function lastInterest(k) {
  const m = sum(k).met;
  if (!(m && seeV(m, k) && INTERESTED.has(m.interest))) return null;
  const c = closedAt(k);
  return c && m.at <= c ? null : m;
}
const bestSlot = k => sum(k).bestSlot;
const hasFollowIn = h => targets(h).some(u => fol(K(h.id, u)));
function aptLeft(h) { return h.units.filter(u => { const s = statusOf(K(h.id, u)); return s === 'new' || s === 'away'; }).length; }

/* ---------- 集まりの分担（グループ奉仕で、区域の一部を2人1組にわたす） ----------
   データは区域の parts に入れる：parts: [{ id, poly:[[lat,lng]...], uids:[...], by, at, until }]
   ・その日の終わりまで有効。わたした人は helpers にも入るので、その区域の記録ができる
   【GAS側で必要な確認】parts を書きかえてよいのは、その区域の担当者と区域係だけ */
const partsOf = t => ((t && Array.isArray(t.parts) ? t.parts : []).filter(p => p && Date.parse(p.until) > Date.now()));
// 同じ人が複数の範囲に入っていたときは、いちばん新しい範囲を見る
const myPart = t => partsOf(t).filter(p => (p.uids || []).includes(me().id)).sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
const partMates = p => (p.uids || []).filter(u => u !== me().id);
const partName = p => (p.uids || []).map(u => uname(u) + 'さん').join('・');
function partHouseCount(t, p) {
  let n = 0;
  housesOf(t.id).forEach(h => { if (inPoly(h.lat, h.lng, p.poly)) n += targets(h).length; });
  return n;
}
/* 範囲の中身（一戸建ての軒数と、アパート名ごとの部屋数）。keys があれば留守宅カードなどその家・部屋だけを数える */
function partContents(t, poly, keys) {
  const apts = new Map(); let houses = 0, total = 0;
  const add = (h, n) => {
    total += n;
    if (h.type === 'apt') { const a = apts.get(h.id) || { name: h.label || '集合住宅', n: 0 }; a.n += n; apts.set(h.id, a); }
    else houses += n;
  };
  if (keys) {
    const cnt = new Map();
    keys.forEach(k => { const hid = parseKey(k)[0]; cnt.set(hid, (cnt.get(hid) || 0) + 1); });
    cnt.forEach((n, hid) => { const h = houseById(hid); if (h && inPoly(h.lat, h.lng, poly)) add(h, n); });
  } else housesOf(t.id).forEach(h => { if (inPoly(h.lat, h.lng, poly)) add(h, targets(h).length); });
  return { houses, apts: [...apts.values()].sort((a, b) => b.n - a.n), total };
}
function partContentsHtml(c, max) {
  if (!c.total) return '<div class="partsum muted">この範囲には、家の印がありません</div>';
  const lim = max || 6, rows = [];
  if (c.houses) rows.push(`<li><span>一戸建てなど</span><b>${c.houses}軒</b></li>`);
  c.apts.slice(0, lim).forEach(a => rows.push(`<li><span>${esc(a.name)}</span><b>${a.n}部屋</b></li>`));
  if (c.apts.length > lim) {
    const rest = c.apts.slice(lim);
    rows.push(`<li class="muted"><span>ほかの集合住宅 ${rest.length}棟</span><b>${rest.reduce((x, a) => x + a.n, 0)}部屋</b></li>`);
  }
  return `<div class="partsum"><div class="partsum-h">この範囲の中　<b>合計 ${c.total}か所</b></div><ul>${rows.join('')}</ul></div>`;
}
function partContentsText(c) {
  const a = [];
  if (c.houses) a.push(`一戸建てなど${c.houses}軒`);
  c.apts.slice(0, 3).forEach(x => a.push(`${x.name} ${x.n}部屋`));
  if (c.apts.length > 3) a.push(`ほか${c.apts.length - 3}棟`);
  return a.join('・');
}
/* ---------- 区域の判定 ---------- */
function inPoly(lat, lng, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function bboxOf(poly) {
  if (!okPoly(poly)) return [Infinity, -Infinity, Infinity, -Infinity];
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const p of poly) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}
function terrOf(lat, lng) {
  const ts = polyTerrs(), t = ts.find(t => !t.rest && inPoly(lat, lng, t.polygon)) || ts.find(t => t.rest && inPoly(lat, lng, t.polygon)); // 親の残りの部分は、枝番のあとで見る
  return t ? t.id : null;
}
/* 家がどの区域に入るかを決め直す（3万件でも速いように、先に四角の範囲で絞る） */
function reassign() {
  const bx = polyTerrs().map(t => ({ t, b: bboxOf(t.polygon) })).sort((a, b) => (a.t.rest ? 1 : 0) - (b.t.rest ? 1 : 0)); // 親の残りの部分は最後に見る
  for (const h of D().houses) {
    let id = null;
    for (const x of bx) {
      const b = x.b;
      if (h.lat < b[0] || h.lat > b[1] || h.lng < b[2] || h.lng > b[3]) continue;
      if (inPoly(h.lat, h.lng, x.t.polygon)) { id = x.t.id; break; }
    }
    if (h.terrId !== id) h.terrId = id;
  }
}
/* 線が3点未満・壊れている区域は、地図の計算からはずす（サーバーのデータが壊れていても画面を止めない） */
const okPoly = p => Array.isArray(p) && p.length >= 3 && p.every(v => Array.isArray(v) && isFinite(v[0]) && isFinite(v[1]));
const polyTerrs = () => D().territories.filter(t => okPoly(t.polygon) && !isSpecial(t)); // 家の区域を決めるのは、ふつうの区域だけ
/* 特別区域：t.special.kinds の種別（コンビニなど）の家だけを集めた区域。家はふつうの区域に入ったまま。
   線があれば、その線の中の家だけ。ふつうの区域カードからは、その家を外す（2回訪ねないように） */
/* 特別区域の条件（すべてに合う家・部屋だけを集める）
   kinds：種別（コンビニなど。えらばなければ、すべての種別）／ lock：オートロックの建物／ unmet：一度も会えていない家（留守の記録だけ）
   apt：集合住宅（アパート・マンションの住まいの部屋）／ ev：'y' エレベーターあり・'n' エレベーターなし（未確認をふくむ）
   kinds・apt・lock は「どれかに当たる」家を集める。ev・unmet はそのうえでしぼる。集合住宅・オートロックは立入禁止の建物をのぞく
   by：カードの分け方（'bld' 建物の数・'room' 部屋の数。tokubetsu.js）。サーバーの spCover_ と同じ決まり
   excl：その家を、ふつうの区域カードから外す（はじめは外す。留守宅の区域では外さないのがふつう）
   ids：件数で分けたカード（tokubetsu.js）。この家だけを集める（線ではなく家で決める。となりのカードと重ならないように）
   grp：同じ条件から分けたカードの組の印。gn：組の名前 */
const spOf = t => (t && t.special) || {};
const isSpecial = t => { const sp = spOf(t); return !!(t && t.special && ((Array.isArray(sp.kinds) && sp.kinds.length) || sp.lock || sp.unmet || sp.apt || sp.ev === 'y' || sp.ev === 'n')); };
const SPID = new WeakMap();
function spIds(t) {
  const a = spOf(t).ids;
  if (!Array.isArray(a) || !a.length) return null;
  let m = SPID.get(a);
  if (!m) { m = new Set(a.map(String)); SPID.set(a, m); }
  return m;
}
const targetKind = (h, u) => (h.type === 'apt' ? unitKind(h, u) : kindOf(h));
/* 一度も会えていない家：留守の記録はあるが、会えた・拒否の記録がない（at より前の記録だけで決める） */
function unmetAsOf(k, at) {
  if (D().dnc[k]) return false;
  let away = false;
  for (const v of visitsOf(k)) {
    if (at && v.at >= at) continue;
    if (v.result === 'met' || v.result === 'refused') return false;
    if (v.result === 'away') away = true;
  }
  return away;
}
function spMatch(h, u, t) {
  const sp = spOf(t), ks = Array.isArray(sp.kinds) ? sp.kinds : [], ev = sp.ev === 'y' || sp.ev === 'n' ? sp.ev : '';
  // 種別（集合住宅・オートロック・コンビニなど）は「どれかに当たる」家を集める（2026-10-22。以前は条件と種別の両方に合う家）
  const apt = !!sp.apt || (!!ev && !sp.lock && !ks.length); // エレベーターだけの古い形は、集合住宅とみなす
  if (ks.length || apt || sp.lock) {
    const isA = h.type === 'apt' && h.ban !== 'no', k = targetKind(h, u);
    if (!(ks.includes(k) || (apt && isA && k === 'home') || (sp.lock && isA && h.lock))) return false;
  }
  // エレベーターは集合住宅の建物だけにかける（店などの家には関係しない）
  if (ev && h.type === 'apt' && (ev === 'y' ? h.ac !== 'ev' : h.ac === 'ev')) return false;
  // 受け取った人が回っている間は、受け取った日の時点で決める（会えた家が、とちゅうで消えないように）
  if (sp.unmet && !unmetAsOf(K(h.id, u), t.lentAt || '')) return false;
  return true;
}
function inSpecial(h, t) {
  if (!isSpecial(t)) return false;
  const ids = spIds(t);
  if (ids) { if (!ids.has(h.id)) return false; }
  else if (okPoly(t.polygon) && !inPoly(h.lat, h.lng, t.polygon)) return false;
  return targets(h).some(u => spMatch(h, u, t));
}
const specialTargets = (h, t) => targets(h).filter(u => spMatch(h, u, t));
/* ふつうの区域カードから外す特別区域か：excl が false でない・貸出中止でない・「一度も会えていない家」の条件がない
   （会えていない家は、会えると対象が変わるので、ふつうの区域からは外さない。サーバーの spCover_ と同じ決まり） */
const spExcludes = t => isSpecial(t) && spOf(t).excl !== false && !spOf(t).unmet && lendMode(t) !== 'stop';
/* 特別区域で回る家の索引（家id → その家を集める特別区域）。区域・家が変わったら作り直す（buildIndex でも消す） */
let SPC = null;
function spCoverIndex() {
  const ts = D().territories, now = Date.now();
  if (SPC && SPC.ts === ts && SPC.n === ts.length && SPC.hn === D().houses.length && now - SPC.at < 1500) return SPC.map;
  const sps = ts.filter(spExcludes);
  const sig = sps.map(t => t.id + ':' + (t.lend || '') + ':' + JSON.stringify(t.special) + ':' + (spIds(t) ? '' : JSON.stringify(t.polygon || []))).join('|');
  if (SPC && SPC.sig === sig && SPC.hn === D().houses.length) { SPC.at = now; SPC.ts = ts; SPC.n = ts.length; return SPC.map; }
  const map = new Map();
  sps.forEach(t => housesOf(t.id).forEach(h => { let a = map.get(h.id); if (!a) map.set(h.id, a = []); a.push(t); }));
  SPC = { ts, n: ts.length, hn: D().houses.length, at: now, sig, map };
  return map;
}
function coveredBySpecial(h, u) {
  const a = spCoverIndex().get(h.id);
  return !!a && a.some(t => spMatch(h, u, t));
}
/* その家（部屋）を回る特別区域（家の画面の「特別区域で回る家です」に使う） */
const coverOf = (h, u) => (spCoverIndex().get(h.id) || []).find(t => spMatch(h, u, t)) || null;
/* 区域の「回る家・部屋」：特別区域はその条件に合う部屋、ふつうの区域は特別区域で回る部屋をのぞく */
const unitsIn = (h, t) => (isSpecial(t) ? specialTargets(h, t) : targets(h).filter(u => !coveredBySpecial(h, u)));
const houseInTerr = (h, tid) => { const t = terrById(tid); return isSpecial(t) ? inSpecial(h, t) : h.terrId === tid; };
const specialKindsText = t => {
  if (!isSpecial(t)) return '';
  const sp = spOf(t), a = [];
  const evOnly = (sp.ev === 'y' || sp.ev === 'n') && !sp.apt && !sp.lock && !(sp.kinds || []).length;
  if (sp.apt || evOnly) a.push('集合住宅');
  if (sp.lock) a.push('オートロック');
  (sp.kinds || []).forEach(k => a.push(kindName(k)));
  if (sp.ev === 'y') a.push('エレベーターあり');
  if (sp.ev === 'n') a.push('エレベーターなし・未確認');
  if (sp.unmet) a.push('一度も会えていない家');
  return a.join('・');
};
/* 特別区域の「集める種別」をえらぶ部分（つくる画面・条件を変える画面で共通）。st：{ kinds, apt, lock, ev, unmet }
   ・集合住宅・オートロックも種別のボタンにならべる。どれかに当たる家を集める
   ・エレベーターは、集合住宅かオートロックをえらんだときだけ出す。「一度も会えていない家だけ」は下の1行 */
const aptSvg = () => SVG('<path d="M5 21V4h14v17"/><path d="M3 21h18"/><path d="M8.5 7.5h2M13.5 7.5h2M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2"/><path d="M10.5 21v-3h3v3"/>');
function spPickHtml(st) {
  const ks = Object.keys(KINDS).filter(k => k !== 'home'), kk = st.kinds || [];
  const chip = (key, icon, name, on) => `<button type="button" class="kchip" data-sppick="${key}" aria-pressed="${!!on}">${icon}<span>${name}</span></button>`;
  const ap = st.apt || st.lock;
  return `<p class="q">集める種別（いくつでも。どれかに当たる家を集めます）</p>
    <div class="kindpick">${chip('apt', aptSvg(), '集合住宅', st.apt)}${chip('lock', LOCK_SVG, 'オートロック', st.lock)}${ks.map(k => chip('k:' + k, KINDS[k][1], KINDS[k][0], kk.includes(k))).join('')}</div>
    <p class="hint">集合住宅はアパート・マンションの住まいの部屋、オートロックはオートロックの建物です（どちらも立入禁止の建物は入りません）。どれに当たるか迷う建物は「その他」にします。</p>
    ${ap ? `<p class="q">エレベーター</p>
    <div class="seg" role="group" aria-label="エレベーター">${[['', 'どちらでも'], ['y', 'あり'], ['n', 'なし・未確認']].map(([v, l]) => `<button type="button" data-spev="${v}" aria-pressed="${(st.ev || '') === v}">${l}</button>`).join('')}</div>
    <p class="hint">「あり」と「なし・未確認」で2つの特別区域をつくると、高齢の方は「エレベーターあり」のカードをえらべます。</p>` : ''}
    <label class="check"><input type="checkbox" id="spUnmet"${st.unmet ? ' checked' : ''}>一度も会えていない家だけにする</label>`;
}
function spPickBind(S, st, redraw) {
  $$('[data-sppick]', S).forEach(b => b.onclick = () => {
    const k = b.dataset.sppick;
    if (k.startsWith('k:')) { const v = k.slice(2), a = st.kinds || []; st.kinds = a.includes(v) ? a.filter(x => x !== v) : a.concat(v); }
    else st[k] = !st[k];
    if (!st.apt && !st.lock) st.ev = '';
    redraw(k);
  });
  $$('[data-spev]', S).forEach(b => b.onclick = () => { st.ev = b.dataset.spev; redraw('ev'); });
  const u = $('#spUnmet', S); if (u) u.onchange = () => { st.unmet = u.checked; redraw('unmet'); };
}
const spPickOk = st => !!((st.kinds || []).length || st.apt || st.lock || st.unmet);
/* えらんだ内容を、保存する形（special）にする */
function spPickData(st) {
  const sp = { kinds: (st.kinds || []).slice(), lock: !!st.lock, unmet: !!st.unmet };
  if (st.apt) sp.apt = true;
  if (st.ev && (st.apt || st.lock)) sp.ev = st.ev;
  return sp;
}
function center(poly) {
  if (!okPoly(poly)) return HOME_VIEW.slice(); return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]; }
/* 区域の札を置く場所：区域の中で、線からいちばん遠い点（polylabel：粗い格子から、見込みのあるマスだけ細かく分けて探す）。
   center()（点の平均）は、帯・穴・L字やコの字の区域で、区域の外や別の区域の中に出てしまうため、札にはこちらを使う。
   m に直して計算（精度 1m）。切れ込み（同じ点の再訪）のある輪でも、偶奇判定なので、穴の中には置かれない。
   区域ごとに控える：配列が同じで形（点の数・位置の合計）が変わらないあいだは、計算しなおさない（線を直したときは、署名が変わって計算しなおす） */
const LABEL_CACHE = new WeakMap();
function labelPoint(poly) {
  if (!okPoly(poly)) return center(poly);
  let sg = poly.length;
  for (let i = 0; i < poly.length; i++) sg += poly[i][0] * (1 + i % 7) + poly[i][1] * (2 + i % 5);
  const hit = LABEL_CACHE.get(poly);
  if (hit && hit.sg === sg) return hit.pt.slice();
  const c0 = Math.cos(poly[0][0] * Math.PI / 180), n = poly.length;
  const X = poly.map(p => p[1] * 111320 * c0), Y = poly.map(p => p[0] * 110540);
  const sd = (x, y) => { // 区域の中ならプラス、外ならマイナスの、線までの距離
    let inside = false, md = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = X[i], ay = Y[i], bx = X[j], by = Y[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const ex = ax + t * dx - x, ey = ay + t * dy - y, d = ex * ex + ey * ey;
      if (d < md) md = d;
    }
    return (inside ? 1 : -1) * Math.sqrt(md);
  };
  const x0 = Math.min(...X), x1 = Math.max(...X), y0 = Math.min(...Y), y1 = Math.max(...Y);
  const w = x1 - x0, h = y1 - y0, size = Math.min(w, h);
  let best = null;
  if (size > 0) {
    const mk = (x, y, hf) => { const d = sd(x, y); return { x, y, hf, d, mx: d + hf * Math.SQRT2 }; };
    const q = []; // 見込み（mx）の大きい順に取り出す
    const push = c => { q.push(c); let i = q.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (q[p].mx >= q[i].mx) break; [q[p], q[i]] = [q[i], q[p]]; i = p; } };
    const pop = () => { const top = q[0], last = q.pop(); if (q.length) { q[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < q.length && q[l].mx > q[m].mx) m = l; if (r < q.length && q[r].mx > q[m].mx) m = r; if (m === i) break; [q[m], q[i]] = [q[i], q[m]]; i = m; } } return top; };
    const half = size / 2;
    for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) push(mk(x + half, y + half, half));
    best = mk((x0 + x1) / 2, (y0 + y1) / 2, 0);
    let guard = 0;
    while (q.length && guard++ < 20000) {
      const c = pop();
      if (c.d > best.d) best = c;
      if (c.mx - best.d <= 1) continue; // これ以上細かく分けても、1m より良くならない
      const hf = c.hf / 2;
      push(mk(c.x - hf, c.y - hf, hf)); push(mk(c.x + hf, c.y - hf, hf)); push(mk(c.x - hf, c.y + hf, hf)); push(mk(c.x + hf, c.y + hf, hf));
    }
  }
  const pt = best && best.d > 0 ? [best.y / 110540, best.x / (111320 * c0)] : center(poly);
  LABEL_CACHE.set(poly, { sg, pt });
  return pt.slice();
}
function distM(a, b) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLa = toR(b[0] - a[0]), dLn = toR(b[1] - a[1]);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;

function terrStats(t, sinceMs) {
  const now = Date.now(); let n = 0, visited = 0, met = 0, last = null;
  for (const h of housesOf(t.id)) {
    for (const u of unitsIn(h, t)) { // 特別区域で回る家は、ふつうの区域の数に入れない
      n++;
      const s = sum(K(h.id, u));
      if (s.last) {
        if (!last || s.last.at > last) last = s.last.at;
        if (Date.parse(s.last.at) >= sinceMs) visited++;
      }
      if (s.met && now - Date.parse(s.met.at) <= 90 * DAY) met++;
    }
  }
  return { n, visited, met, last };
}

/* ---------- 更新のお知らせ：前に開いたとき以降の変更を、起動したときに見せる ---------- */
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '0';
const CHANGELOG = [
  { v: '2026.13.100', items: [
    ['確', '記録の少ない返却の自動の確かめは、受け取った日から返却した日までの記録で数えるようにしました。1回目のあとに留守宅を回った記録・留守宅カードで訪ね直した記録も数えるので、回り終えた区域が途中の返却にもどることはありません'],
    ['係', '区域係の画面：記録の少ない返却の自動の確かめは、前の人の続きから回った区域では前の人が回りはじめた日から数え、サーバーから最新の記録を受け取ってから動くようにしました']
  ] },
  { v: '2026.13.99', items: [
    ['消', '記録・拒否・注意・再訪問のある家は、「ここは家ではない（消す）」で消せなくなりました。家ではないときは、区域係に削除を申請してください'],
    ['係', '区域係の画面：目安に届かない区域を完了にするときは、「紙や口頭で確かめた」か「アプリの記録で確かめる」を、かならずえらぶようにしました。紙の区域カードの区域では、「留守宅カードにして返す」「1回目を終えたことにする」は出ません']
  ] },
  { v: '2026.13.91', items: [
    ['残', 'おすすめに、回り終えた区域で一度も訪ねていない家（回り残し）も出すようにしました。留守宅より先に出ます。訪ねて留守だったときは、次からは留守宅として、時間をあけて出ます'],
    ['仮', 'おすすめに地図データから入れた「仮の家」が出たときは、家かどうか確かめてください。「今行く」「予定に入れる」で押さえた家なら、家でなければ、その場で消せます']
  ] },
  { v: '2026.13.90', items: [
    ['薦', 'おすすめタブを新しくしました。回り終えた区域で、まだ会えていない家を、近くの数軒ずつ出します。カードを受け取らなくても、空いた時間に回れます'],
    ['時', '「ほかの時間帯」をえらぶと、その時間帯にまだ訪ねていない家が出ます。「予定に入れる」と、その日の終わりまで、その家をほかの人のおすすめに出しません'],
    ['地', '「今行く」「地図をひらく」を押すと、地図に区域の線と、回る家の番号が出ます'],
    ['留', '留守宅カードは、区域が完了するまでになりました。完了したあとの残りの留守宅は、おすすめに出ます。区域係は、留守宅を「訪ね直した」と数える条件（別の日／別の日で、別の時間帯）を「区域の決め」でえらべます']
  ] },
  { v: '2026.13.89', items: [
    ['時', '時間帯の「土日の夜」などを「週末の夜」と出すようにしました。土曜日だけのことではなく、土曜と日曜のどちらも入ります']
  ] },
  { v: '2026.13.88', items: [
    ['色', 'テーマの「じぶんの色」に、明るさを変えるバーを付けました。円で色あいを、となりのバーで明るさをえらべます。明るい黄色や白・黒もえらべます'],
    ['字', '明るい色をえらんだときは、上の帯やボタンの文字が自動で黒になり、どの色でも文字が読めるようにしました']
  ] },
  { v: '2026.13.87', items: [
    ['下', '下のタブを、いま見ている画面でもう一度押すと、その画面のいちばん上にもどるようにしました。地図のタブなら、えらんでいる区域の全体が見えるところにもどります']
  ] },
  { v: '2026.13.86', items: [
    ['時', 'カレンダーの日を押した画面で、奉仕時間を −／＋ だけでなく、数字を押して直接入れられるようにしました。「奉仕時間を保存する」を押すと、保存してホームにもどります。保存しないときは「やめる」を押します'],
    ['左', 'その画面が左右に動いてしまうことがあったのを直しました']
  ] },
  { v: '2026.13.85', items: [
    ['家', '「ホーム画面に追加」でアイコンの絵をえらぶとき、「好きな絵文字や文字を入れる」から、好きな絵文字（「はーと」と打って変換すると❤️）と、絵の下に入れる文字（4文字まで）をアイコンにできるようにしました']
  ] },
  { v: '2026.13.84', items: [
    ['家', '「家を追加」のメニューを小さくしたとき、iPhoneの時刻の表示に重なって見えなくなっていたのを直しました。小さくしたままでも、となりの「追加を終わる」ですぐ終われます']
  ] },
  { v: '2026.13.83', items: [
    ['集', '家を「アパート・マンション」に変える画面でも、エレベーター（まだ確かめていない／あり／なし）と建物のメモを入れられるようにしました。部屋を入力する画面の上に出ます']
  ] },
  { v: '2026.13.82', items: [
    ['家', 'ホーム画面のアイコンの絵は、設定ではなく「ホーム画面に追加」の手順の中でえらぶようにしました。追加したあとに設定で変えても、ホーム画面のアイコンは変わらなかったためです']
  ] },
  { v: '2026.13.77', items: [
    ['返', 'くわしい表示の「返却する」ボタンを、かんたんな表示と同じ「返す」「途中で返す」にそろえました。下から出る画面のいちばん下のボタンは、閉じるだけのときは「閉じる」、入力をやめるときは「やめる」にそろえました']
  ] },
  { v: '2026.13.70', items: [
    ['区', 'かんたんな表示の「区域カードをもう1枚」は、はじめに5件だけ出すようにしました。ほかの区域は「もっと見る」で見られます']
  ] },
  { v: '2026.13.69', items: [
    ['地', 'かんたんな表示の地図で、区域えらびと「あと○軒」を横に並べて、地図を広く見られるようにしました']
  ] },
  { v: '2026.13.68', items: [
    ['家', 'くわしい表示の「二世帯住宅にする」は、家の画面の「この家を編集」の中（下の方）に移しました']
  ] },
  { v: '2026.13.67', items: [
    ['家', 'かんたんな表示のホームに、次の集まりと「あなたの区域カード」を大きく出すようにしました。カレンダーは「カレンダーで見る」で開きます'],
    ['地', 'かんたんな表示の地図に「区域○　あと○軒」の帯を出し、地図は回らないようにしました。留守宅カードをえらぶ画面も見やすくしました']
  ] },
  { v: '2026.13.64', items: [
    ['会', 'かんたんな表示で、記録のあとの「取り消す」を大きく、長め（12秒）に出すようにしました'],
    ['集', '集合住宅で部屋を押したり記録したりしたとき、「会えた・留守」のボタンがいつも見えるようにしました。部屋は階ごとに分け、前回の結果を「会・留・拒」の字でも出します'],
    ['区', 'かんたんな表示の区域カードに「地図をひらく」ボタンを付けました'],
    ['家', 'iPhone（iOS 26）の「ホーム画面に追加」の手順を、新しい画面に合わせました'],
    ['守', '安全と記録の正確さのための見直しをしました（電波が弱い所で返却したときに出ていた「受け付けられませんでした」のお知らせなど）']
  ] },
  { v: '2026.13.56', items: [
    ['近', 'グループ奉仕の区域をもらうとき、「近い順」「おすすめ順」が、グループの中心（区域係が地図に置いた、グループの人がだいたい住んでいるあたり）からの近さを使うようになりました。期限の近い「急ぎ」の区域は、今までどおりいちばん上に出ます']
  ] },
  { v: '2026.13.55', items: [
    ['集', '監督・司会者は、全体の集まり（金曜の晩・日曜の昼など）で使う区域も受け取れるようになりました。グループ奉仕の区域といっしょに「集まりで使う区域」に出ます。S-13には「全体の集まり（名前）」と出ます']
  ] },
  { v: '2026.13.46', items: [
    ['区', 'マイマップの取り込みで、枝番の線のずれや道のすき間がほかの枝番にまとわりつかないようにしました']
  ] },
  { v: '2026.13.45', items: [
    ['区', 'マイマップの取り込みで、枝番の線のずれでできる細い帯をなくしました。区域の番号の札が区域の中の広い所に出るようになりました']
  ] },
  { v: '2026.13.44', items: [
    ['見', 'かんたんな表示の「区域をもらう」を見やすくしました（1つの区域は3行ほど。くわしい内容は「くわしく」の中、並べ方は1つのボタンに）']
  ] },
  { v: '2026.13.43', items: [
    ['天', '毎日はじめのひと言が、ときどき天気に合わせた言葉になります（雨・冷える日・暑い日など）。そのときは今日の気温も出ます']
  ] },
  { v: '2026.13.42', items: [
    ['新', '新しい版にしたとき、一部の画面だけ古いままになることがあったのを直しました']
  ] },
  { v: '2026.13.41', items: [
    ['雨', '雨の日は、団地など集合住宅の多い区域も先に出るようにしました（特別区域のカードだけでなく、ふつうの区域も）']
  ] },
  { v: '2026.13.40', items: [
    ['雨', '雨の日は、全員の「区域をもらう」とおすすめで、集合住宅のカードが自動で先に出るようになりました（エレベーターありが先）。区域係の「おすすめ」の設定で止められます']
  ] },
  { v: '2026.13.39', items: [
    ['特', '区域係：特別区域の「止める・消す」に「貸出中止にする（あとで再開できる）」を加えました。消すときの確認に、ふつうの区域カードやS-13への影響が出ます']
  ] },
  { v: '2026.13.38', items: [
    ['他', '種別に「その他」を加えました。どれに当たるか迷う、住居以外の建物に使います'],
    ['特', '区域係：特別区域をつくる画面の「条件」をなくし、集合住宅・オートロックも種別のボタンにまとめました。カードを「建物の数で分ける」か「部屋の数で分ける」かを選べます（オートロックは、はじめは1枚4件まで）']
  ] },
  { v: '2026.13.37', items: [
    ['集', 'アパートの建物の編集で「エレベーター：まだ確かめていない／あり／なし」を選べるようになりました。分かったら直してください'],
    ['特', '区域係：特別区域の条件に「集合住宅」と「エレベーターあり／なし・未確認」を加えました。集合住宅は部屋の数（はじめは1枚40部屋くらい）でカードに分けます。カードには「エレベーターあり」と文字で出ます']
  ] },
  { v: '2026.13.36', items: [
    ['線', '区域係：「区域の線を直す」で、すき間・重なりを調べたあと、「まとめて直す」で小さなすき間や細い重なりを一度に直せるようになりました（直す前に確認が出ます。残った所は、今までどおり1か所ずつ直せます）']
  ] },
  { v: '2026.13.35', items: [
    ['係', '区域係：マイマップで区域を取り込むとき、枝番の線のない部分も、目印（ポイント ⑤など）から自動で枝番の区域にします'],
    ['係', '区域係：枝番どうしの重なりや、線のずれでできた細いすき間を直して取り込みます（直した内容は確認画面に出ます）']
  ] },
  { v: '2026.13.34', items: [
    ['地', '「区域をもらう」と「おすすめ」で、受け取る前に「地図」を押すと、その区域の場所を地図で確かめられるようになりました'],
    ['特', 'コンビニなどの特別区域で回る家は、ふつうの区域カードの地図に「特」の印で薄く出て、訪ねる家に数えないようにしました（2回訪ねないように）'],
    ['係', '区域係：特別区域を、となり合う家を決めた件数ずつのカードに分けられるようになりました。「状況」の数字を押すと、内訳の区域が出ます'],
    ['係', '区域係：区域の一覧の上をすっきりさせ、取り込みを「区域の線だけ」「拒否・注意だけ」などに分けました。区域を分けるときは、家・部屋の数を見ながら線を動かせます']
  ] },
  { v: '2026.13.16', items: [
    ['直', 'アプリを開くたびに、同じアップデートのお知らせが出てしまうことがあったのを直しました'],
    ['拒', '区域係が拒否をエクセル・CSVから取り込むとき、必要な行だけをえらべるようになりました。同じ住所がすでにあるときに、上書きするかどうかもえらべます']
  ] },
  { v: '2026.13.9', items: [
    ['建', '建物の編集が、建物の形のまま部屋を足したり消したりできる画面になりました（＋で次の番号を足す・部屋をタップで直す）'],
    ['下', 'iPhoneで、下のタブの下に空白が出ることがあったのを直しました']
  ] },
  { v: '2026.13.3', items: [
    ['返', '正式に返却された区域の、まだ会えていない家を、寝かせてから「返却後の留守宅カード」で回れるようになりました'],
    ['今', '家が少ない留守宅カードは、「今日だけ」になりました']
  ] },
  { v: '2026.13.2', items: [
    ['分', 'グループの留守宅カードで、「分ける」「シェア」を選べるようになりました']
  ] },
  { v: '2026.13.1', items: [
    ['時', '留守宅カードの地図に、「まだの時間帯だけ」「すべて」の切りかえがつきました']
  ] },
  { v: '2026.12.8', items: [
    ['進', '留守宅カードに、区域全体の進み具合と、試した時間帯が出るようになりました']
  ] },
  { v: '2026.12.2', items: [
    ['安', '安全のため、区域係が招待リンクを渡すときは、新しく作り直す形になりました']
  ] },
  { v: '2026.12.1', items: [
    ['標', '地図に、地名の多い『標準地図』を選べるようになりました'],
    ['目', '地図に、会館や学校などの目印が出るようになりました']
  ] },
  { v: '2026.11.30', items: [
    ['地', '電波がないところでも、受け取った区域の地図が見られるようになりました'],
    ['左', 'ホームが左右に動いてしまうことがあったのを直しました']
  ] },
  { v: '2026.11.29', items: [
    ['並', 'おすすめを、並べかえて選べるようになりました']
  ] },
  { v: '2026.11.28', items: [
    ['理', 'おすすめに理由が出るようになりました'],
    ['み', 'みんなの目標と、あなたの記録のふり返りが見られるようになりました']
  ] },
  { v: '2026.11.17', items: [
    ['始', '区域マップを使い始めました。歯車の設定から、言語（日本語・スペイン語）をえらべます'],
    ['?', 'わからないことは、区域係にたずねてください']
  ] }
];
const SEEN_VER = 'kuiki_seen_ver';
/* 版の番号のくらべ方：「2026.13.9」と「2026.13.15」を、文字ではなく数字としてくらべる
   （文字のままだと 9 が 15 より大きいことになり、見たお知らせが毎回出てしまっていた） */
function verCmp(a, b) {
  const x = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), y = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
const verMax = list => list.reduce((m, v) => (verCmp(v, m) > 0 ? v : m), '0');
/* ---------- 新しい版があるか確かめる ----------
   ・開いたとき、ほかのアプリから戻ったとき（5分に1回まで）、開きっぱなしなら30分ごと
   ・ファイルの先頭（版の番号の meta）だけを読むので、通信はわずか
   ・新しい版があれば、歯車のとなりに青い更新マークを出す。押すと、送っていない記録を送ってから読み直す */
let updChecked = 0, updFound = '';
async function checkUpdate(force) {
  if (updFound || location.protocol === 'file:') return;
  if (!force && Date.now() - updChecked < 5 * 60000) return;
  updChecked = Date.now();
  try {
    const u = location.pathname + '?vcheck=' + Date.now();
    const res = await fetch(u, { cache: 'no-store', headers: { Range: 'bytes=0-1023' } });
    if (!res.ok && res.status !== 206) return;
    const head = (await res.text()).slice(0, 4096);
    const m = head.match(/<meta name="app-version" content="([^"]+)"/);
    if (m && verCmp(m[1], APP_VERSION) > 0) { updFound = m[1]; $('#btnUpd').hidden = false; }
  } catch (e) { /* 通信できないときは、次の機会にまた確かめる */ }
}
async function doUpdate() {
  const b = $('#btnUpd');
  if (b.classList.contains('busy')) return;
  b.classList.add('busy');
  try {
    if (LIVE && Store.queue.length) { toast('記録を送ってから更新します…'); await flush(true); }
    // 新しいファイルを取り直してから読み直す（スマホに残っている古いファイルを使わないように）
    await fetch(location.pathname, { cache: 'reload' }).catch(() => {});
  } finally {
    location.reload();
  }
}
function watchUpdate() {
  $('#btnUpd').onclick = doUpdate;
  setTimeout(() => checkUpdate(true), 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(false); });
  setInterval(() => { if (!document.hidden) checkUpdate(true); }, 30 * 60000);
}
function showNewsIfAny(then) {
  const seen = lsGet(SEEN_VER);
  // 見た版として残すのは、今の版とお知らせの中で一番新しい番号（古い画面を開いても下がらない）
  lsSet(SEEN_VER, verMax([seen || '0', APP_VERSION].concat(CHANGELOG.map(c => c.v))));
  if (!seen) { then(); return; } // はじめて使う人には出さない
  const who = NS ? 'test' : 'prod'; // only のあるお知らせは、テスト版・本番版のどちらかだけに出す
  const items = CHANGELOG.filter(c => verCmp(c.v, seen) > 0 && (!c.only || c.only === who)).flatMap(c => c.items);
  if (!items.length) { then(); return; }
  const el = $('#news');
  el.innerHTML = `<div class="newsbox"><div class="newshead"><p>アップデートのお知らせ</p><h2>区域マップが新しくなりました</h2></div>
    <ul class="newslist">${items.map(([i, t]) => `<li><i>${esc(i)}</i><span>${esc(t)}</span></li>`).join('')}</ul>
    <button class="btn primary newsgo" id="newsGo">わかりました</button></div>`;
  el.hidden = false;
  const go = () => { el.hidden = true; then(); };
  $('#newsGo').onclick = go;
}

/* ---------- 起動のあいさつ ---------- */
const SPLASH_OFF = 'kuiki_splash_off';
let splashAt = Date.now();
let splashDone = false;
if (lsGet(SPLASH_OFF)) { const el = document.getElementById('splash'); if (el) el.hidden = true; splashDone = true; }
function hideSplash(now) {
  const el = $('#splash');
  if (!el || splashDone) return;
  splashDone = true;
  const sec = (typeof UI !== 'undefined' && Number(uiEff().splashSec)) || 1.8;
  const wait = now ? 0 : Math.max(0, sec * 1000 - (Date.now() - splashAt));
  setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.hidden = true; }, 500); }, wait);
}
/* iPhoneでは、アプリを閉じても画面がそのまま残っていることがあり、開き直しても読み込みが起きない。
   そのため、30分以上あけて戻ってきたときは、もう一度あいさつを出す */
let hiddenAt = 0;
function splashAgain(force) {
  const el = $('#splash');
  if (!el || (!force && lsGet(SPLASH_OFF)) || !Store.data) return;
  splashDone = false; splashAt = Date.now();
  el.classList.remove('out'); el.hidden = false;
  splashGreeting();
  hideSplash();
}
function watchResume() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 30 * 60000) splashAgain();
  });
  window.addEventListener('pageshow', e => { if (e.persisted) splashAgain(); });
}
function splashGreeting() {
  if (splashDone || !Store.data) return;
  const h = new Date().getHours();
  const hi = h < 5 ? 'こんばんは' : h < 10 ? 'おはようございます' : h < 17 ? 'こんにちは' : 'こんばんは';
  $('#spHi').textContent = `${me().name}さん、${hi}`;
  const mineT = D().territories.filter(t => t.holder === me().id).length;
  const bits = [`今は ${slotShort(slotOf(new Date()))}`];
  if (mineT) bits.push(`区域カード ${mineT}枚`);
  $('#spSub').textContent = bits.join('　・　');
}

/* ---------- お知らせ ---------- */
let toastTimer = null;
function toast(msg, undoFn, action, opt) {
  const el = $('#toast');
  const act = action || (undoFn ? { label: '取り消す', fn: undoFn } : null);
  el.innerHTML = `<span>${esc(msg)}</span>` + (act ? `<button type="button">${esc(act.label)}</button>` : '');
  // opt.below：その部品のすぐ下に出す（地図の案内で、右下の「現在地」ボタンを隠さないため・点検④U12）。ふだんは下のタブの上
  const bel = opt && opt.below ? $(opt.below) : null, br = bel ? bel.getBoundingClientRect() : null;
  if (br && br.height > 0) { el.style.top = Math.round(br.bottom + 8) + 'px'; el.style.bottom = 'auto'; }
  else { el.style.top = ''; el.style.bottom = ''; }
  el.hidden = false;
  if (act) el.querySelector('button').onclick = () => { clearTimeout(toastTimer); el.hidden = true; act.fn(); };
  // 「取り消す」などのボタン以外のところ（文字など）をさわると、すぐ消す
  el.onclick = e => { if (e.target.closest('button')) return; clearTimeout(toastTimer); el.hidden = true; };
  clearTimeout(toastTimer);
  const big = document.body.classList.contains('big') ? 1.4 : 1;
  const ms = act ? 12000 * big : Math.min(10000, Math.max(3500, String(msg).length * 180) * big); // 1文字0.18秒の目安
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}


/* ---------- 確認の画面（スマホ標準の小さな確認の代わり） ----------
   大きな文字と大きなボタンで、押しまちがえにくくする。
   ask('〜を削除します。よろしいですか？') → はい：true／やめる：false
   o：{ title, body, ok, cancel, danger } で、見出し・説明・ボタンの文字を変えられる */
function ask(msg, o) {
  o = o || {};
  return new Promise(resolve => {
    const text = String(msg || '').replace(/\s*よろしいですか[？?]\s*$/, '').trim();
    let title = o.title, body = o.body;
    if (!title) {
      const sents = text.match(/[^。？?\n]+[。？?]?/g) || [text];
      const qi = sents.map(x => /[？?]$/.test(x.trim())).lastIndexOf(true); // 問いかけの文があれば、それを見出しに
      if (qi >= 0) { title = sents[qi].trim(); body = sents.filter((x, i) => i !== qi).join('').trim(); }
      else { title = sents[0].trim().replace(/(します|取ります|もどします)。$/, '$1か？'); body = sents.slice(1).join('').trim(); }
    }
    const danger = o.danger != null ? o.danger : /削除|消し|消す|消え|外し|外す|見送|取り消|使えなく|やめ|もどし|戻し|引き直|記録しません/.test(msg);
    const OKS = [[/削除/, '削除する'], [/取り消/, '取り消す'], [/消/, '消す'], [/見送/, '見送る'], [/外/, '外す'], [/受け取/, '受け取る'],
      [/印刷/, '印刷する'], [/引き継/, '引き継ぐ'], [/移します/, '移す'], [/登録/, '登録する'], [/作り直/, '作り直す'], [/もう一度記録/, '記録する'],
      [/もどします|戻します/, 'もどす'], [/引き直/, '引き直す'], [/使わない/, '使わない']];
    const hit = OKS.find(x => x[0].test(msg));
    const ok = o.ok || (hit ? hit[1] : 'はい');
    const box = $('#askBox');
    box.innerHTML = `<div class="askback" data-askno></div>
      <div class="asksheet" role="alertdialog" aria-modal="true" aria-labelledby="askTitle">
        <span class="grab" aria-hidden="true"></span>
        <div class="askhead">${danger ? `<span class="askicon">${SVG('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>')}</span>` : ''}
          <h2 id="askTitle">${esc(title)}</h2></div>
        ${body ? `<div class="askbody">${esc(body)}</div>` : ''}
        <button type="button" class="askbtn ${danger ? 'danger' : 'primary'}" data-askyes>${esc(ok)}</button>
        <button type="button" class="askbtn" data-askno>${esc(o.cancel || 'やめる')}</button>
      </div>`;
    box.hidden = false;
    const done = v => { box.hidden = true; box.innerHTML = ''; document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    document.addEventListener('keydown', key, true);
    box.querySelector('[data-askyes]').onclick = () => done(true);
    $$('[data-askno]', box).forEach(x => { x.onclick = () => done(false); });
    const h = box.querySelector('#askTitle'); h.tabIndex = -1; h.focus({ preventScroll: true });
  });
}

/* ---------- 下から出る画面 ---------- */
/* ＋−や選択ボタンで同じ画面を描き直すときは、見ていた位置と押したボタンをそのままにする */
let sheetKeep = false;
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('#sheet .stepper button, #sheet .chips button, #sheet [data-type], #sheet [data-wd], #sheet #evAdd, #sheet #dMinSave, #sheet #fPreview, #sheet [data-nm], #sheet [data-rule], #sheet #nmSkip, #sheet #pgGo, #sheet [data-keep]');
  if (t) { sheetKeep = true; setTimeout(() => { sheetKeep = false; }, 0); }
}, true);
function setSheet(html) {
  const s = $('#sheet');
  document.body.classList.add('sheet-open');
  // ただのお知らせ（取り消すボタンのないもの）は、画面の下のボタンを隠さないように消す
  const tt = $('#toast');
  if (tt && !tt.hidden && !tt.querySelector('button')) tt.hidden = true;
  const keep = sheetKeep && !s.hidden; sheetKeep = false;
  const top = s.scrollTop;
  let focusSel = '';
  const a = document.activeElement;
  if (keep && a && a !== s && s.contains(a)) {
    const attrs = [...a.attributes].filter(x => x.name === 'id' || x.name.startsWith('data-'));
    if (attrs.length) focusSel = a.tagName.toLowerCase() + attrs.map(x => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  }
  if (typeof dayCtx !== 'undefined') dayCtx = null;
  if (html.indexOf('data-pday') < 0) hideWheel(); // 「目標と計画」以外の画面になったら、時間のダイヤルを閉じる
  s.dataset.swipe = ''; // '1'＝設定の画面（閉じたとき「保存しました」と出す）。どの画面も、下にスワイプで閉じる
  if (html.indexOf('class="grab"') < 0) html = '<span class="grab" aria-hidden="true"></span>' + html; // 上のつまみ（下にスワイプで閉じる印）
  s.style.transform = '';
  $('#sheetBody').innerHTML = html;
  s.hidden = false; $('#backdrop').hidden = false;
  $$('[data-close]', s).forEach(b => { b.onclick = closeSheet; });
  if (keep) {
    s.scrollTop = top;
    const f = focusSel && s.querySelector(focusSel); if (f) f.focus({ preventScroll: true });
    return;
  }
  s.scrollTop = 0;
  const h = s.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function hideWheel() { const w = document.getElementById('wheelPop'); if (w) w.hidden = true; document.body.classList.remove('wheel-open'); }
function closeSheet() {
  hideWheel();
  qrWatching = false;
  if (homeUrlDirty) { cleanUrl(); homeUrlDirty = false; } // URLに戻したコードは、画面を閉じたら消す
  $('#sheet').hidden = true; $('#backdrop').hidden = true;
  document.body.classList.remove('sheet-open');
  $('#sheet').dataset.swipe = ''; $('#sheet').style.transform = '';
  if (tmpMarker && map) { map.removeLayer(tmpMarker); tmpMarker = null; }
  if (LIVE && Store.inbox.length) setTimeout(applyInbox, 0);
}
/* 長い説明は、すぐ消えるお知らせではなく画面で見せる */
function infoSheet(title, html) {
  setSheet(headHtml(null, title, '') + `<div class="notice warn">${html}</div><button class="btn primary block" data-close>わかりました</button>`);
}
const headHtml = (t, title, sub) => `<div class="sheet-head">${t ? `<span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span>` : ''}<div><h2 id="sheetTitle">${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><button class="icon-btn" data-close aria-label="閉じる">×</button></div>`;
const navLink = h => `<a class="btn block" href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}" target="_blank" rel="noopener">Googleマップで道順を見る</a>`;

/* ---------- 地図 ---------- */
let dotRenderer = null;
let map, terrLayer, houseLayer, baseLayers, baseName = 'pale', mode = 'normal';
let tmpMarker = null, draw = null, myPos = null, posMarker = null, firstMapShow = true, zoomCtl = null;

/* ---------- 地図の回転（2本の指でひねる） ----------
   しくみ：Leafletの計算（位置・タップ・拡大・区域に合わせる）は、いつも「北が上」のまま行い、
   見た目だけを、地図の真ん中を軸に回す（地図の土台 mapPane に CSS の rotate をかける）。
   回したときに合わせて直すもの：
   ・指でさわった場所 → 地図の上の場所（家のタップ・長押し・線引き・範囲分け・なぞり）
   ・1本指で動かす向き（家の追加・線の点を動かすときも）
   ・画面の四すみまで地図と家の点を出す（見える範囲を広げて読み込む）
   ・区域に合わせるとき、回した向きで画面に入る大きさにする
   ・家の印・区域の番号・名前・道順の吹き出しは、文字がまっすぐ立ったまま
   区域カード（S-12）の印刷は、この地図とは別に描くので、回転の影響を受けない */
const ROT_START = 12; // これ以上ひねったら回し始める（度）。拡大のつもりで回ってしまわないように
const ROT_SNAP = 8;   // 北からこの角度以内で指をはなしたら、北にもどす（度）
let mapDeg = 0, rotEndAt = 0, rotAnim = 0, lastMoveEnd = 0;
const rotSupported = () => !!(window.CSS && CSS.supports && CSS.supports('rotate', '1deg'));
const rotAllowed = () => rotSupported() && UI.mapRot !== 'off' && UI.mode === 'detail'; // 簡単モードでは2本指で回さない（右下の「北」も出ない・指示書3.6）
const rotPt = (p, rad) => { const c = Math.cos(rad), s = Math.sin(rad); return L.point(p.x * c - p.y * s, p.x * s + p.y * c); };
const degNorm = d => ((d % 360) + 540) % 360 - 180; // -180〜180度に
(function patchLeafletForRotation() {
  const MP = L.Map.prototype;
  // 指でさわった場所：画面の位置を、回した分だけもどしてから地図の位置にする
  const me2cp = MP.mouseEventToContainerPoint;
  MP.mouseEventToContainerPoint = function (e) {
    const p = me2cp.call(this, e);
    if (!this._kmRad) return p;
    const c = this.getSize().divideBy(2);
    return rotPt(p.subtract(c), -this._kmRad).add(c);
  };
  // 画面の対角線の半分（回したとき、この円の中がいつも画面にかかる）
  MP._kmHalf = function () { const s = this.getSize(); return Math.ceil(Math.hypot(s.x, s.y) / 2); };
  // 見えている範囲：回した画面の四すみが入る範囲
  const getBounds = MP.getBounds;
  MP.getBounds = function () {
    if (!this._kmRad) return getBounds.call(this);
    const s = this.getSize(), c = s.divideBy(2), th = -this._kmRad;
    return L.latLngBounds([[0, 0], [s.x, 0], [s.x, s.y], [0, s.y]]
      .map(q => this.containerPointToLatLng(rotPt(L.point(q).subtract(c), th).add(c))));
  };
  // 地図の画像：回しても四すみが空かないように、画面の対角線ぶんの正方形を読み込む
  const tiled = L.GridLayer.prototype._getTiledPixelBounds;
  L.GridLayer.prototype._getTiledPixelBounds = function (center) {
    const m = this._map;
    if (!m._kmRad) return tiled.call(this, center);
    const z = m._animatingZoom ? Math.max(m._animateToZoom, m.getZoom()) : m.getZoom();
    const h = m._kmHalf() / m.getZoomScale(z, this._tileZoom), pc = m.project(center, this._tileZoom).floor();
    return L.bounds(pc.subtract([h, h]), pc.add([h, h]));
  };
  // 区域の線・家の点を描く面：同じく対角線ぶん（iPhoneで描けなくならないよう、大きくなりすぎない）
  const rUpd = L.Renderer.prototype._update;
  L.Renderer.prototype._update = function () {
    const m = this._map;
    if (!m._kmRad) return rUpd.call(this);
    const r = m._kmHalf(), px = L.Browser.retina ? 2 : 1;
    const pad = Math.max(0, Math.min(this.options.padding || 0, (3800 / px / (2 * r) - 1) / 2));
    const half = Math.round(r * (1 + 2 * pad)), c = m.getSize().divideBy(2);
    const min = m.containerPointToLayerPoint(c.subtract([half, half])).round();
    this._bounds = L.bounds(min, min.add([2 * half, 2 * half]));
    this._center = m.getCenter();
    this._zoom = m.getZoom();
  };
  // 区域に合わせる：回した向きのまま、画面（上下の案内の分をのぞく）に入る大きさと中心
  const bcz = MP._getBoundsCenterZoom;
  MP._getBoundsCenterZoom = function (bounds, options) {
    if (!this._kmRad) return bcz.call(this, bounds, options);
    options = options || {};
    bounds = bounds.getBounds ? bounds.getBounds() : L.latLngBounds(bounds);
    const tl = L.point(options.paddingTopLeft || options.padding || [0, 0]),
      br = L.point(options.paddingBottomRight || options.padding || [0, 0]);
    const z0 = this.getZoom(), th = this._kmRad;
    const ps = [bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthEast(), bounds.getSouthWest()].map(ll => rotPt(this.project(ll, z0), th));
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const av = this.getSize().subtract(tl).subtract(br);
    let zoom = this.getScaleZoom(Math.min(av.x / Math.max(1, x1 - x0), av.y / Math.max(1, y1 - y0)), z0);
    const snap = this.options.zoomSnap;
    if (snap) { zoom = Math.round(zoom / (snap / 100)) * (snap / 100); zoom = Math.floor(zoom / snap) * snap; }
    zoom = Math.max(this.getMinZoom(), Math.min(this.getMaxZoom(), zoom));
    if (typeof options.maxZoom === 'number') zoom = Math.min(options.maxZoom, zoom);
    if (!isFinite(zoom)) return bcz.call(this, bounds, options);
    const cs = L.point((x0 + x1) / 2, (y0 + y1) / 2).multiplyBy(this.getZoomScale(zoom, z0)).add(br.subtract(tl).divideBy(2));
    return { center: this.unproject(rotPt(cs, -th), zoom), zoom };
  };
  // 1本指で動かす（地図・線の点）：指の動きを、回した分だけもどして動かす
  const DP = L.Draggable.prototype, dMove = DP._onMove;
  DP._onMove = function (e) {
    const m = typeof map !== 'undefined' ? map : null;
    if (!m || !m._kmRad || !this._enabled || !(this._element === m._mapPane || m._mapPane.contains(this._element))) return dMove.call(this, e);
    if (e.touches && e.touches.length > 1) { this._moved = true; return; }
    const first = e.touches && e.touches.length === 1 ? e.touches[0] : e;
    let off = L.point(first.clientX, first.clientY)._subtract(this._startPoint);
    if (!off.x && !off.y) return;
    if (Math.abs(off.x) + Math.abs(off.y) < this.options.clickTolerance) return;
    off = rotPt(L.point(off.x / this._parentScale.x, off.y / this._parentScale.y), -m._kmRad);
    L.DomEvent.preventDefault(e);
    if (!this._moved) {
      this.fire('dragstart');
      this._moved = true;
      L.DomUtil.addClass(document.body, 'leaflet-dragging');
      this._lastTarget = e.target || e.srcElement;
      if (window.SVGElementInstance && this._lastTarget instanceof window.SVGElementInstance) this._lastTarget = this._lastTarget.correspondingUseElement;
      L.DomUtil.addClass(this._lastTarget, 'leaflet-drag-target');
    }
    this._newPos = this._startPos.add(off);
    this._moving = true;
    this._lastEvent = e;
    this._updatePosition();
  };
  // 家の印・区域の番号・名前：印の位置（根元）を軸に、地図と逆に回して、まっすぐ立たせる
  const setPos = L.Marker.prototype._setPos;
  L.Marker.prototype._setPos = function (pos) {
    setPos.call(this, pos);
    const ic = this._icon;
    if (!ic || !this._map || !this._map._kmRotOn) return;
    ic.style.transformOrigin = `${-(parseFloat(ic.style.marginLeft) || 0)}px ${-(parseFloat(ic.style.marginTop) || 0)}px`;
    ic.style[L.DomUtil.TRANSFORM] += ' rotate(var(--km-unrot,0deg))';
  };
  // 道順の吹き出し：吹き出しの先を軸に、まっすぐ立たせる
  const upright = o => {
    const m = o._map, el = o._container;
    if (!m || !el || !m._kmRotOn || !o._zoomAnimated) return;
    const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
    el.style.transformOrigin = `${-(o._containerLeft || 0)}px ${el.offsetHeight + mb + (o._containerBottom || 0)}px`;
    el.style[L.DomUtil.TRANSFORM] += ' rotate(var(--km-unrot,0deg))';
  };
  const pUpd = L.Popup.prototype._updatePosition, pAnim = L.Popup.prototype._animateZoom;
  L.Popup.prototype._updatePosition = function () { pUpd.call(this); upright(this); };
  L.Popup.prototype._animateZoom = function (e) { pAnim.call(this, e); upright(this); };
})();
/* 地図の向きを変える（deg：北から時計回りに何度回したか。0＝北が上） */
function setMapDeg(deg) {
  if (!map) return;
  deg = degNorm(deg);
  if (Math.abs(deg) < 0.05) deg = 0;
  const was = !!map._kmRad;
  mapDeg = deg;
  map._kmRad = deg * Math.PI / 180;
  const pane = map.getPane('mapPane'), s = map.getSize();
  pane.style.transformOrigin = `${s.x / 2}px ${s.y / 2}px`;
  pane.style.rotate = deg ? `${deg}deg` : '';
  map.getContainer().style.setProperty('--km-unrot', `${-deg}deg`);
  if (was !== !!deg) rotCover();
  const nb = $('#btnNorth');
  if (nb) { nb.hidden = !deg; nb.style.setProperty('--ndeg', `${deg}deg`); }
}
/* 回し始め・北にもどしたとき：地図の画像と点を描く範囲を、あらためて読み込む */
function rotCover() {
  map.eachLayer(l => {
    if (!l._map) return;
    if (l instanceof L.GridLayer) l._update();
    else if (l instanceof L.Renderer) l._update();
  });
}
/* なめらかに向きを変える（北のボタン・北の近くで指をはなしたとき） */
function animateMapDeg(to, after) {
  cancelAnimationFrame(rotAnim);
  const from = mapDeg, d = degNorm(to - from);
  const done = () => { setMapDeg(to); renderHouses(); if (after) after(); };
  if (!d || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { done(); return; }
  const t0 = performance.now(), ms = 280;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    setMapDeg(from + d * (1 - Math.pow(1 - k, 3)));
    if (k < 1) rotAnim = requestAnimationFrame(step); else done();
  };
  rotAnim = requestAnimationFrame(step);
}
/* 回した画面の中（まわりに少し余裕）に入っているか。回していないときは null（いつもの範囲の計算だけで足りる） */
function rotVisTest(pad) {
  if (!map || !map._kmRad) return null;
  const s = map.getSize(), c = s.divideBy(2), cs = Math.cos(map._kmRad), sn = Math.sin(map._kmRad);
  const px = s.x * pad, py = s.y * pad;
  return (lat, lng) => {
    const p = map.latLngToContainerPoint([lat, lng]), dx = p.x - c.x, dy = p.y - c.y;
    const x = dx * cs - dy * sn + c.x, y = dx * sn + dy * cs + c.y;
    return x >= -px && x <= s.x + px && y >= -py && y <= s.y + py;
  };
}
/* 2本の指でひねると回す（拡大・縮小・移動は、これまでどおりLeafletが行う） */
function bindRotate() {
  const el = map.getContainer(), pts = new Map();
  let g = null;
  const ang = () => { const [a, b] = [...pts.values()]; return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; };
  // 指をはなした合図（pointerup）は、さわった家の印などが描き直されて画面から外れると届かないことがある。
  // そのままだと「はなした指」が残り、次に1本の指でさわると2本目と数えて回ってしまう。
  // → 1本目の指（isPrimary：ほかに画面にふれている指がない）でさわったら、残っていた指を全部わすれる
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (e.isPrimary) { pts.clear(); g = null; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g = pts.size === 2 && rotAllowed() ? { a0: ang(), d0: mapDeg, on: false, base: 0 } : null;
  }, true);
  document.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!g || pts.size !== 2) return;
    const d = degNorm(ang() - g.a0);
    if (!g.on) {
      if (Math.abs(d) < ROT_START) return;
      g.on = true; g.base = d;
      cancelAnimationFrame(rotAnim);
      map.closePopup();
    }
    setMapDeg(g.d0 + degNorm(d - g.base));
  }, true);
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (g && g.on) {
      rotEndAt = Date.now();
      if (Math.abs(mapDeg) <= ROT_SNAP) animateMapDeg(0);
      else {
        // 拡大・移動がともなわなかったときも、四すみの家の印を出す
        setTimeout(() => { if (lastMoveEnd < rotEndAt) renderHouses(); }, 450);
        if (!lsGet('kuiki_rot_tip')) { lsSet('kuiki_rot_tip', '1'); toast('地図を回しました。右下の「北」のボタンを押すと、北が上にもどります'); }
      }
    }
    if (pts.size < 2) g = null;
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  // アプリを切りかえた・画面が消えたときも、指の記録を消す
  const reset = () => { pts.clear(); g = null; };
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  // 回した直後に指をはなしたときの「タップ」で、家の記録の画面が出ないように
  el.addEventListener('click', e => { if (Date.now() - rotEndAt < 450) { e.stopPropagation(); e.preventDefault(); } }, true);
  map.on('resize', () => { if (mapDeg) setMapDeg(mapDeg); });
  map.on('moveend', () => { lastMoveEnd = Date.now(); });
  $('#btnNorth').onclick = () => animateMapDeg(0);
}
/* 設定で「回さない」にしたとき */
function applyRotSetting() {
  if (!rotAllowed() && mapDeg) { cancelAnimationFrame(rotAnim); setMapDeg(0); renderHouses(); }
}

function initMap() {
  map = L.map('map', { zoomControl: false, zoomSnap: 0.125, zoomDelta: 1, wheelPxPerZoomLevel: 120, doubleClickZoom: false }).setView(HOME_VIEW, Store.data && (Store.data.territories || []).some(t => okPoly(t.polygon)) ? 17 : HOME_ZOOM);
  map._kmRotOn = rotSupported(); // 回せる端末では、家の印などを「まっすぐ立たせる」準備をしておく（回していないときは何も変わらない）
  bindDoubleTap();
  map.on('zoomend', () => { zoomEndAt = Date.now(); map.getContainer().classList.toggle('zfar', map.getZoom() < 16); }); // 遠くから見るときは枝番の札を小さく
  bindRotate();
  map.createPane('cardPane'); // 古いカードの写真（地図の下）
  map.getPane('cardPane').style.zIndex = 150;
  map.getPane('cardPane').style.pointerEvents = 'none';
  map.on('zoom viewreset zoomend', placeOverlay);
  zoomCtl = L.control.zoom({ position: 'bottomright' }); // ＋−は、線を引く・家を追加するときだけ出す
  const opt = { maxZoom: 20, maxNativeZoom: 18, attribution: GSI_ATTR };
  // 地図の画像は crossOrigin 付きで取る（保存した画像が、ブラウザの容量で「中身の見えない画像」として数MBに数えられないように）。
  // 圏外でくわしい画像がないときは、透明にして、下に敷いた「ズーム16までの画像を引きのばした地図」を見せる
  const TILE_BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  baseLayers = { pale: L.tileLayer(TILE_PALE, Object.assign({ crossOrigin: 'anonymous', errorTileUrl: TILE_BLANK }, opt)), photo: L.tileLayer(TILE_PHOTO, opt),
    paleLow: L.tileLayer(TILE_PALE, { maxZoom: 20, maxNativeZoom: 16, crossOrigin: 'anonymous', errorTileUrl: TILE_BLANK }) };
  baseLayers.paleLow.addTo(map);
  baseLayers.pale.addTo(map);
  terrLayer = L.layerGroup().addTo(map);
  houseLayer = L.layerGroup().addTo(map);
  map.createPane('labelPane'); // 区域の番号は、家の印より上に出す（押しても下の家に届く）
  map.getPane('labelPane').style.zIndex = 650;
  map.getPane('labelPane').style.pointerEvents = 'none';
  map.createPane('dotPane'); // 家の小さな点：区域の線より上（押したとき、区域ではなく家がえらばれるように）
  map.getPane('dotPane').style.zIndex = 450;
  dotRenderer = L.canvas({ pane: 'dotPane', padding: 0.3, tolerance: 12 }); // 小さな点は、見た目より広い範囲で押せる
  map.on('click', e => {
    if (moveHid) { moveHouseTo(e.latlng); return; } // 区域係が「この家の場所を直す」を押したあと
    if (pickPlace) { const f = pickPlace; pickPlace = null; f(e.latlng); return; } // 集まりの場所を地図でえらぶ
    if (window.dncPickClick && window.dncPickClick(e.latlng)) return; // 区域係が拒否の家を地図でえらんでいるとき（kyohi.js）
    if (mode === 'draw') { if (drawTap === 'line') drawClick(e.latlng); else addAt(e.latlng, true); }
    else if (mode === 'add') addAt(e.latlng, false);
    else if (mode === 'part') partTap(e.latlng);
    else if (mode === 'sen' && window.kyoukai) window.kyoukai.click(e.latlng);
    else if (mode === 'tok' && window.tokubetsu) window.tokubetsu.click(e.latlng); // 特別区域の分け方（tokubetsu.js）
  });
  map.on('moveend', renderHouses);
  bindLongPress(); // 長押し（パソコンは右クリック）した場所への道順を、Googleマップで開けるようにする
}
/* 長押しした場所への道順
   ・指を少し動かした・2本指で拡大した・地図が動いたときは出さない（まちがって出ないように）
   ・出したあと、指をはなしたときのタップでは消えない（すぐ消えてしまうのを防ぐ）
   ・歩き／車をえらべる */
function openDirPopup(latlng) {
  const ll = latlng.lat.toFixed(6) + ',' + latlng.lng.toFixed(6);
  const url = mode => `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=${mode}`;
  const pop = L.popup({ className: 'dirpop', closeButton: true, closeOnClick: false, autoPan: !mapDeg, autoPanPadding: [20, 90], maxWidth: 280 })
    .setLatLng(latlng)
    .setContent(`<p class="dirtitle">ここへの道順（Googleマップ）</p>
      <div class="dirbtns"><a class="btn primary" href="${url('walking')}" target="_blank" rel="noopener">${MAP_ICON}歩いて</a>
        <a class="btn" href="${url('driving')}" target="_blank" rel="noopener">車で</a></div>`)
    .openOn(map);
  setTimeout(() => { if (map) map.once('click', () => map.closePopup(pop)); }, 450);
}
function bindLongPress() {
  const el = map.getContainer();
  let timer = null, sx = 0, sy = 0, touches = 0, lastTouch = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    touches++; lastTouch = Date.now();
    if (touches > 1 || mode !== 'normal') { cancel(); return; }
    sx = e.clientX; sy = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (x) { /* 何もしない */ } }
      openDirPopup(map.mouseEventToLatLng({ clientX: sx, clientY: sy })); // 地図を回していても、指の場所になる
    }, 550);
  }, true);
  el.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); }, true);
  const up = e => { if (e.pointerType === 'mouse') return; touches = Math.max(0, touches - 1); cancel(); };
  el.addEventListener('pointerup', up, true);
  el.addEventListener('pointercancel', up, true);
  map.on('movestart zoomstart', cancel);
  // パソコンの右クリック（指の長押しは、上で出しているので出さない）
  map.on('contextmenu', e => {
    if (mode !== 'normal' || Date.now() - lastTouch < 1500) return;
    openDirPopup(e.latlng);
  });
  el.addEventListener('contextmenu', e => e.preventDefault()); // スマホの長押しメニューを出さない
}
/* 地図の印：この区域の「今回」（受け取ってから）の結果だけを色で見せる。まだの家は白い丸で統一 */
const PIN_CHAR = { plain: '', met: '会', away: '留', refused: '拒', dnc: '拒' };
/* 家・部屋の種別（住居がふつう）。地図では住居以外にアイコンを出す */
const SVG = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra || ''}</svg>`;
const KINDS = {
  home: ['住居', SVG('<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10.5V19h12v-8.5"/>')],
  office: ['会社', SVG('<path d="M4 21V5h8v16"/><path d="M12 10h8v11"/><path d="M7 9h2M7 13h2M15 14h2M15 18h2"/>')],
  shop: ['店舗', SVG('<path d="M5 10h14v10H5z"/><path d="M3.5 10 5 5h14l1.5 5"/><path d="M10 20v-5h4v5"/>')],
  biz: ['事務所', SVG('<path d="M13 3H7v18h11V8z"/><path d="M13 3v5h5"/><path d="M10 13h5M10 17h5"/>')],
  factory: ['工場', SVG('<path d="M3 21V11l5 3.5V11l5 3.5V7.5l8 5V21z"/><path d="M7 17h1M12 17h1M17 17h1"/>')],
  school: ['学校', SVG('<path d="M2 9.5 12 4l10 5.5L12 15z"/><path d="M6.5 12v4.2c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8V12"/><path d="M21 10v5"/>')],
  gov: ['役所', SVG('<path d="M3 21h18"/><path d="M4 9.5h16L12 4z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>')],
  police: ['警察', SVG('<path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>')],
  fire: ['消防', SVG('<path d="M12 3c.6 3.2 5.5 5.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.8 1.8-4 2.2-6 1.4 1 2.1 2.2 2.3 3.6C11.6 8.4 11.4 5.8 12 3z"/>')],
  hall: ['公民館', SVG('<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9.5 21v-5h5v5"/><path d="M9 12h6"/>')],
  hospital: ['病院', SVG('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>')],
  conv: ['コンビニ', SVG('<path d="M4 9h16v11H4z"/><path d="M3 9l1.5-4h15L21 9"/><path d="M8 13h3v4H8z"/><path d="M14 13h2"/>')],
  care: ['介護施設', SVG('<circle cx="12" cy="5" r="2"/><path d="M12 7.5v6l3 6"/><path d="M12 13.5l-3 6"/><path d="M9 10.5h6"/><path d="M17.5 12v8"/>')],
  food: ['飲食店', SVG('<path d="M7 3v8"/><path d="M5 3v4a2 2 0 0 0 4 0V3"/><path d="M7 11v10"/><path d="M16 3c-1.7 1.2-2.5 3.2-2.5 6 0 1.4.8 2.3 2.5 2.5V21"/>')],
  other: ['その他', SVG('<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 6V4h8v2"/><circle cx="8.5" cy="13" r="1"/><circle cx="12" cy="13" r="1"/><circle cx="15.5" cy="13" r="1"/>')], // どれに当たるか迷う、住居以外の建物（2026-10-22）
};
const LOCK_SVG = SVG('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>');
const kindOf = h => (h && KINDS[h.kind] ? h.kind : 'home');
const unitKind = (h, u) => { const m = h && h.uk; const v = m && m[u]; return KINDS[v] ? v : 'home'; };
const kindName = k => (KINDS[k] ? KINDS[k][0] : '住居');
const KIND_PH = { office: '例：〇〇株式会社', shop: '例：〇〇スーパー', biz: '例：〇〇事務所', factory: '例：〇〇工場',
  school: '例：〇〇小学校', gov: '例：〇〇市役所', police: '例：〇〇警察署', fire: '例：〇〇消防署',
  hall: '例：〇〇公民館', hospital: '例：〇〇病院', care: '例：〇〇ホーム（介護施設）', conv: '例：〇〇店（コンビニ）', food: '例：食堂〇〇', other: '例：〇〇（どれに当たるか迷う建物）' };
/* 集合住宅の印：居住の部屋が1つでもあれば住居あつかい。全部お店・会社などのときだけ、そのアイコンを出す */
function aptKind(h) {
  if (!h.units.length) return kindOf(h);
  const ks = h.units.map(u => unitKind(h, u));
  if (ks.some(k => k === 'home')) return 'home';
  const cnt = {};
  ks.forEach(k => { cnt[k] = (cnt[k] || 0) + 1; });
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || 'home';
}
const kindBadge = k => (k && k !== 'home' ? `<b class="kb k-${k}" title="${KINDS[k][0]}">${KINDS[k][1]}</b>` : '');
const lockBadge = h => (h.lock ? `<b class="lk" title="オートロック">${LOCK_SVG}</b>` : '');
const BAN_TEXT = { no: ['禁', '立入禁止'], letter: ['手', '手紙のみ'] };
const banBadge = h => (h.type === 'apt' && BAN_TEXT[h.ban] ? `<b class="ban${h.ban === 'letter' ? ' letter' : ''}" title="${BAN_TEXT[h.ban][1]}">${BAN_TEXT[h.ban][0]}</b>` : '');
const banNotice = h => (h && h.type === 'apt' && h.ban === 'no' ? '<div class="notice warn"><b>立入禁止の建物です。</b>中には入らないでください。</div>'
  : h && h.type === 'apt' && h.ban === 'letter' ? '<div class="notice warn"><b>手紙のみの建物です。</b>訪問はせず、手紙を入れてください。</div>' : '')
  + (window.dncRoomNote ? window.dncRoomNote(h) : ''); // 備考から取り込んだ、部屋ごとの拒否（kyohi.js）
/* 建物のメモ（備考）と、エレベーター・縦階段（2026.13.25）。部屋を入力する画面の上に出す */
const AC_NAME = { ev: 'エレベーターあり', no: 'エレベーターなし（階段だけ）', st: 'エレベーターなし（縦階段：階段ごとに上り下り）' };
/* カードのエレベーター（集合住宅の特別区域だけ）。高齢の方がカードをえらびやすいように、文字で出す（2026-10-22）
   全部の建物にエレベーターがあれば「エレベーターあり」。まじっていれば「エレベーターあり 2／5棟」 */
function evSummary(t) {
  if (!isSpecial(t)) return '';
  const bs = housesOf(t.id).filter(h => h.type === 'apt');
  if (!bs.length) return '';
  let y = 0, n = 0, q = 0;
  bs.forEach(h => { if (h.ac === 'ev') y++; else if (h.ac === 'no' || h.ac === 'st') n++; else q++; });
  if (y === bs.length) return 'エレベーターあり';
  if (n === bs.length) return 'エレベーターなし';
  if (q === bs.length) return 'エレベーター 未確認';
  return y ? `エレベーターあり ${y}／${bs.length}棟` : 'エレベーターなし・未確認';
}
/* 雨の日（2026-10-22）：サーバーが30分ごとに調べた天気（Open-Meteo）。端末からは天気のサービスに通信しない。
   雨なら「区域をもらう」のおすすめ順と「おすすめ」タブで、集合住宅のカード（エレベーターありが先）を先に出す。奉仕者の操作はいらない */
let WX = (() => { try { return JSON.parse(lsGet('kuiki_wx') || 'null'); } catch (e) { return null; } })(); // 前に届いた天気（古いものは下の判定で使わない）
const wxFresh = () => !!(WX && WX.at && !WX.off && !WX.err && Date.now() - Date.parse(WX.at) < 2 * 3600000 && Store.data && Number(D().settings.wxOn) !== 0);
const isRainy = () => !!(WX && WX.r === 1 && Date.now() - Date.parse(WX.at) < 2 * 3600000 && Store.data && Number(D().settings.wxOn) !== 0);
/* 集合住宅のカードの順位：0 エレベーターあり・1 ほかの集合住宅・2 それ以外
   ・特別区域の集合住宅・オートロックのカード
   ・ふつうの区域でも、訪ねる部屋の半分以上が集合住宅の部屋なら「集合住宅の区域」（団地など）。
     そのうち半分以上がエレベーターのある建物の部屋なら 0（2026-10-22） */
const APTR = new Map();
let aptrAt = 0, aptrN = -1;
function aptCardRank(t) {
  if (!t) return 2;
  if (isSpecial(t)) {
    const sp = spOf(t);
    if (sp.apt || sp.lock || sp.ev === 'y' || sp.ev === 'n') return sp.ev === 'y' || evSummary(t) === 'エレベーターあり' ? 0 : 1;
    // 種別だけの特別区域（コンビニなど）は、ふつうの区域と同じに数える
  }
  if (Date.now() - aptrAt > 60000 || aptrN !== D().houses.length) { APTR.clear(); aptrAt = Date.now(); aptrN = D().houses.length; }
  if (APTR.has(t.id)) return APTR.get(t.id);
  let all = 0, apt = 0, ev = 0;
  for (const h of housesOf(t.id)) {
    const n = unitsIn(h, t).length;
    all += n;
    if (h.type === 'apt' && h.ban !== 'no') { apt += n; if (h.ac === 'ev') ev += n; }
  }
  const r = all && apt * 2 >= all ? (ev * 2 >= apt ? 0 : 1) : 2;
  APTR.set(t.id, r);
  return r;
}
const rainNote = hit => `<p class="notice rainnote"><b>雨のため、${hit ? '集合住宅の多い区域を先に出しています' : '集合住宅の多い区域をさがしましたが、空いている区域にはありませんでした'}</b>${hit ? '（エレベーターありが先）' : ''}。${hit ? '期限が近い区域は、雨の日もいちばん上に出します。' : ''}<small>天気：Open-Meteo</small></p>`;
const evTag = t => { const x = evSummary(t); return x ? `<span class="evtag">${esc(x)}</span>` : ''; };
function bldMemoHtml(h) {
  if (!h || h.type !== 'apt' || (!h.bn && !h.ac)) return '';
  return `<div class="notice bmemo">${h.ac ? `<span class="bmac">${AC_NAME[h.ac] || ''}</span>` : ''}${h.bn ? `<span class="bmtx"><b>建物のメモ</b>${esc(h.bn)}</span>` : ''}</div>`;
}
function periodStart(h) {
  const t = h.terrId ? terrById(h.terrId) : null;
  return t ? (t.lentAt || t.returnedAt || t.completedAt || '') : ''; // 担当者のいない区域は、返却・回り終えた日から
}
function pinState(k, since) {
  if (D().dnc[k]) return 'dnc';
  const v = sum(k).last;
  return v && since && v.at >= since ? v.result : 'plain';
}
/* 集合住宅で、今回まだ訪ねていない部屋の数 */
function aptTodo(h, since) {
  return h.units.filter(u => { const k = K(h.id, u); return !D().dnc[k] && pinState(k, since) === 'plain' && !recentMet(k); }).length;
}
/* 広い地図で家を押したときは、記録の画面は出さずに、その家まで拡大する（ダブルタップで拡大したときの押しまちがいを防ぐ） */
const TAP_MIN_ZOOM = 17;
let zoomEndAt = 0;
/* 地図をダブルタップすると、その場所を中心に1段階ズームする（線引き・家の追加の最中は使わない） */
function bindDoubleTap() {
  const el = map.getContainer();
  let down = null, last = null;
  el.addEventListener('pointerdown', e => { down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null; }, true);
  el.addEventListener('pointerup', e => {
    if (!e.isPrimary || !down || mode !== 'normal' || Date.now() - rotEndAt < 450) { last = null; return; } // 回した直後は数えない
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { last = null; return; } // 地図を動かしたときは数えない
    const now = Date.now();
    if (last && now - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
      last = null;
      map.setZoomAround(map.mouseEventToContainerPoint(e), Math.min(map.getMaxZoom(), Math.round(map.getZoom()) + 1)); // 回していても、タップした場所を中心に
      return;
    }
    last = { t: now, x: e.clientX, y: e.clientY };
  }, true);
}
/* 種別をえらぶボタン（住居・会社・店舗・事務所・工場） */
function kindChips(cur, attr) {
  return `<div class="kindpick">${Object.entries(KINDS).map(([k, v]) =>
    `<button type="button" class="kchip" data-kind="${k}"${attr || ''} aria-pressed="${(cur || 'home') === k}">${v[1]}<span>${v[0]}</span></button>`).join('')}</div>`;
}
/* 建物・家の種別を保存する */
function setHouseKind(hid, kind, after) {
  const h = houseById(hid); if (!h) return;
  commitIn([hid], `種別を「${kindName(kind)}」にしました`, () => {
    if (kind === 'home') delete h.kind; else h.kind = kind;
  });
  if (after) after();
}
/* 部屋ごとの種別を保存する */
function setUnitKind(hid, unit, kind, after) {
  const h = houseById(hid); if (!h) return;
  commitIn([hid], `${unitTitle(h, unit)}を「${kindName(kind)}」にしました`, () => {
    const m = Object.assign({}, h.uk || {});
    if (kind === 'home') delete m[unit]; else m[unit] = kind;
    if (Object.keys(m).length) h.uk = m; else delete h.uk;
  });
  if (after) after();
}
function setHouseLock(hid, on, after) {
  const h = houseById(hid); if (!h) return;
  commitIn([hid], on ? 'オートロックの建物にしました' : 'オートロックを外しました', () => {
    if (on) h.lock = true; else delete h.lock;
  });
  if (after) after();
}
function setHouseBan(hid, v, after) {
  const h = houseById(hid); if (!h || !isAdmin()) return;
  commitIn([hid], v === 'no' ? '立入禁止の建物にしました' : v === 'letter' ? '手紙のみの建物にしました' : '立ち入りの印を外しました', () => {
    if (v === 'no' || v === 'letter') h.ban = v; else delete h.ban;
  });
  if (after) after();
}
function houseIcon(h, ff, locked) {
  const since = periodStart(h), lk = locked ? ' locked' : '';
  const nb = !locked && roundNums && roundNums.has(h.id) ? `<s>${roundNums.get(h.id)}</s>` : '';
  if (h.type === 'apt') {
    const fo = ''; // 再訪問の印は出しません
    let st = null;
    if (ff && !locked) {
      const arr = targets(h).map(u => ff(K(h.id, u))).sort((a, b) => FOCUS_RANK.indexOf(a) - FOCUS_RANK.indexOf(b));
      st = arr.length ? arr[0] : 'dim';
    } else if (!locked && h.units.length) {
      // すべての部屋を今回訪ねた（拒否の部屋はのぞく）ら、建物の印も薄く＋緑のチェック
      const ks = targets(h).map(u => K(h.id, u)).filter(k => !D().dnc[k]);
      if (ks.length && ks.every(k => pinState(k, since) !== 'plain')) st = 'done';
    }
    const left = aptTodo(h, since);
    const rj = targets(h).some(u => D().dnc[K(h.id, u)]) ? '<b class="rj">拒</b>' : '';
    const cau = !locked && window.chuiHas && window.chuiHas(h) ? '<b class="cau" title="注意">！</b>' : ''; // 注意（chui.js）
    const ak = aptKind(h);
    const nameTag = ''; // 名前は、renderHouses で別の札として出す（小さな点のときも出せるように）
    return L.divIcon({ className: '', html: `<div class="pin apt${h.prov ? ' prov' : ''}${ak !== 'home' ? ' biz' : ''}${focusCls(st)}${lk}">集${left && !nb && !locked ? `<i>${left}</i>` : ''}${fo}${doneMark(st)}${nb}${rj}${cau}${locked ? '' : kindBadge(ak) + lockBadge(h) + banBadge(h)}${nameTag}</div>`, iconSize: [38, 38], iconAnchor: [19, 19] });
  }
  const k = K(h.id, ''), s = pinState(k, since), fo = '';
  // 選んでいないときも、今回訪ねた家（会えた・留守）は薄く＋緑のチェックにする
  const st = locked ? null : ff ? ff(k) : (s === 'met' || s === 'away') ? (otherDone(h, k, since) ? 'prev' : 'done') : (s === 'plain' && recentMet(k) ? 'prev' : null);
  const hk = kindOf(h);
  const cau = !locked && s !== 'dnc' && window.chuiHas && window.chuiHas(h) ? '<b class="cau" title="注意">！</b>' : ''; // 注意（chui.js）
  const sm = s === 'dnc' ? ' sm' : '', px = s === 'dnc' ? 26 : 34; // 拒否の家は、大きくしすぎない（2026.13.26）
  return L.divIcon({ className: '', html: `<div class="pin st-${s}${sm}${h.prov ? ' prov' : ''}${hk !== 'home' ? ' biz' : ''}${focusCls(st)}${lk}">${PIN_CHAR[s]}${fo}${doneMark(st)}${nb}${cau}${locked ? '' : kindBadge(hk)}</div>`, iconSize: [px, px], iconAnchor: [px / 2, px / 2] });
}
/* ---------- 一緒に回る人（グループ） ----------
   区域の担当者が、今日の終わりまで仲間を加える。データは区域の helpers に入れる：
     helpers: [{ uid, until（その日の23:59）, by（加えた担当者）, at }]
   【GAS側で必要な確認】
   ・helpers を書きかえてよいのは、その区域の担当者と区域係だけ
   ・until が過ぎていない helpers の人は、その区域の家の訪問記録・家の追加をしてよい
   ・helpers の人には、ほかの人が記録した年代・また訪ねたいかを送らない（担当者と同じ扱いにしない） */
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); };
function helpersOf(t) {
  if (!t || D().settings.groupOn === 0) return [];
  const now = Date.now();
  return (t.helpers || []).filter(h => Date.parse(h.until) > now);
}
const isHelper = (t, uid) => helpersOf(t).some(h => h.uid === (uid || me().id));
/* 今日の司会（2026-10-24）：集まりで使う区域の担当者が司会できない日に、ほかの監督・司会者が「今日だけ司会」をする。
     lead: { uid（司会する人）, h（そのときの担当者）, until（その日の23:59）, by, at }
   担当者・S-13・持てる枚数は変わらない。1枚につき1人。担当者が変わると（h が合わなくなり）効かなくなる。
   今日の司会は「今日回る人」「回る範囲を分ける」「今日の記録を直す」ができる（返却・担当交代はできない） */
function leadOf(t) {
  if (!t || !t.lead || typeof t.lead !== 'object' || !t.holder || !t.group || D().settings.groupOn === 0) return null;
  const l = t.lead;
  return l.uid && l.uid !== t.holder && l.h === t.holder && Date.parse(l.until) > Date.now() ? l : null;
}
const isLead = (t, uid) => { const l = leadOf(t); return !!l && l.uid === (uid || me().id); };
const canLead = t => !!t && (t.holder === me().id || isLead(t)); // 今日回る人・範囲分け・記録の直しができる
const myTerr = t => !!t && (t.holder === me().id || isHelper(t) || isLead(t)); // 自分が回ってよい区域
/* 今日の奉仕の集まりの時間が近い（30分前〜3時間後）か */
function meetingNow() {
  const today = ymd(new Date()), now = Date.now();
  return schedsOn(today).some(s => {
    const t = Date.parse(`${s.date}T${(s.time || '09:00')}:00`);
    return isFinite(t) && now >= t - 30 * 60000 && now <= t + 3 * 3600000;
  });
}
function groupActive() {
  return D().territories.some(t => (canLead(t) && helpersOf(t).length) || isHelper(t));
}
/* 直前（1時間以内）に、ほかの人が記録していたら知らせる */
function recentOtherHtml(k) {
  const v = sum(k).last;
  if (!v || v.by === me().id) return '';
  const min = Math.floor((Date.now() - Date.parse(v.at)) / 60000);
  // グループの留守宅カードの家は、同じ日に同じ家を2回訪ねないよう、今日の記録なら時間がたっていても知らせる
  const grp = activeCards().some(c => c.group && c.keys.includes(k) && (c.by === me().id || isCardHelper(c)));
  const lim = grp ? Math.max(60, Math.floor((Date.now() - Date.parse(todayIso())) / 60000)) : 60;
  if (min < 0 || min >= lim) return '';
  const ago = min < 1 ? 'たった今' : min < 60 ? `${min}分前に` : `${Math.floor(min / 60)}時間前に`;
  return `<div class="notice warn"><b>${ago}、ほかの人が記録しています（${RESULT_LABEL[v.result]}）。</b><br>${grp ? '同じ日に、同じ家を2回訪ねないようにしてください。' : '同じ家を続けて訪ねていないか確認してください。'}</div>`;
}
function openHelpers(tid, cid) {
  // cid があるときは、グループで回る留守宅カード（c.helpers）の「今日回る人」
  const c = cid ? D().awayCards.find(x => x.id === cid) : null;
  const t = c ? terrById(c.terrId) : terrById(tid);
  if (c ? (c.by !== me().id || !c.group) : !canLead(t)) return;
  const obj = c || t, grp = c ? c.group : t.group, curOf = () => (c ? cardHelpers(c) : helpersOf(t));
  if (D().settings.groupOn === 0) { toast('今は「一緒に回る」は使えない設定です'); return; }
  const max = grp ? 40 : D().settings.groupMax, cur = curOf(), curIds = new Set(cur.map(h => h.uid));
  if (!c) { curIds.add(t.holder); const l = leadOf(t); if (l) curIds.add(l.uid); } // 担当者と今日の司会は、もう記録できるので出さない
  const allU = c ? isAllUse(c) : isAllUse(t); // 全体の集まり（区域・留守宅カード）は、グループで分けずに名前順だけで出す
  const gm = grp && !allU ? groupMembers(grp).filter(u => u.id !== me().id && !curIds.has(u.id)) : [];
  const room = max - cur.length;
  const cand = D().users.filter(u => !u.inactive && u.id !== me().id && !curIds.has(u.id)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const row = u => `<label class="check" data-name="${esc(u.name)}"><input type="checkbox" data-hadd="${esc(u.id)}"${grp && u.group === grp ? ' data-ing="1"' : ''}>${esc(u.name)}</label>`;
  const others = grp && !allU ? cand.filter(u => u.group !== grp) : cand;
  setSheet(headHtml(t, c ? `今日回る人をえらぶ（留守宅カード・${slotShort(c.slot)}）` : grp ? '今日回る人をえらぶ' : '一緒に回る人', `${fmtDay(new Date().toISOString())}の終わりまで`) + `
    ${cur.length ? `<p class="q">${grp ? '今日回る人' : '今日一緒に回る人'}（${cur.length}人）</p>` + cur.map(h => `<div class="setrow"><b>${esc(uname(h.uid))}さん</b><button class="btn small danger" data-hdel="${h.uid}">外す</button></div>`).join('') : ''}
    ${room > 0 ? `<p class="q">加える人をえらぶ</p>
      <label class="field"><span>名前でさがす</span><input type="text" id="hQ" placeholder="名前の一部を入れる" autocomplete="off"></label>
      <div id="hList">
        ${gm.length ? `<div class="hgrp"><b>${esc(grp)}グループ（${gm.length}人）</b><button type="button" class="btn small" id="hAllG">全員えらぶ</button></div>${gm.map(row).join('')}` : ''}
        ${others.length ? (gm.length ? '<div class="hgrp"><b>ほかの人</b></div>' : '') + others.map(row).join('') : ''}
        ${!cand.length ? '<p class="muted">加えられる人がいません。</p>' : ''}
      </div>
      <p class="hint">あと${room}人まで加えられます。</p>
      <button class="btn primary block" id="hSave">えらんだ人を加える</button>`
      : `<div class="notice warn">1つの区域に加えられるのは${max}人までです。</div>`}
    <p class="hint">加えた人は、今日の終わりまで、${c ? 'このカード' : 'この区域'}の家を記録できます。日付が変わると自動で外れます。${featFollow() ? (!c && isLead(t) ? '<br>年代や★などのくわしい記録は、今までどおり担当者にしか見えません。' : '<br>年代や★などのくわしい記録は、今までどおりあなたにしか見えません。') : ''}</p>
    <button class="btn block" data-close>閉じる</button>`);
  const S = $('#sheet');
  $$('[data-hdel]', S).forEach(x => x.onclick = () => {
    const uid = x.dataset.hdel;
    commit(`${uname(uid)}さんを外しました`, () => { obj.helpers = curOf().filter(h => h.uid !== uid); });
    openHelpers(tid, cid);
  });
  if (!$('#hSave')) return;
  if ($('#hAllG')) $('#hAllG').onclick = () => {
    const boxes = $$('#hList input[data-ing]'), all = boxes.every(b => b.checked);
    let n = $$('#hList input:checked').length;
    boxes.forEach(b => {
      if (all) { b.checked = false; return; }
      if (!b.checked && n < room) { b.checked = true; n++; }
    });
    $('#hAllG').textContent = boxes.every(b => b.checked) ? 'えらぶのをやめる' : '全員えらぶ';
    if (!all && boxes.some(b => !b.checked)) toast(`あと${room}人までです`);
  };
  $('#hQ').oninput = e => {
    const q = e.target.value.trim();
    $$('#hList [data-name]').forEach(l => { l.hidden = !!q && !l.dataset.name.includes(q); });
  };
  $('#hList').onchange = e => {
    if (!e.target.checked) return;
    if ($$('#hList input:checked').length > room) { e.target.checked = false; toast(`あと${room}人までです`); }
  };
  $('#hSave').onclick = () => {
    const ids = $$('#hList input:checked').map(x => x.dataset.hadd);
    if (!ids.length) { toast('加える人をえらんでください'); return; }
    const now = new Date().toISOString(), until = endOfToday();
    commit(`${ids.length}人を「${grp ? '今日回る人' : '一緒に回る人'}」に加えました（今日まで）`, () => {
      obj.helpers = curOf().concat(ids.map(uid => ({ uid, until, by: me().id, at: now })));
    });
    openHelpers(tid, cid);
  };
}

/* 係の設定：伝道者の地図では、自分の区域など以外を選べないようにする */
const lockOn = () => !isAdmin() && D().settings.lockOthers !== 0;
function openTerrIds() {
  const s = new Set(D().territories.filter(myTerr).map(t => t.id));
  D().territories.forEach(t => { if (!t.holder && isFree(t)) s.add(t.id); }); // 「自由に受け取ってよい」区域も、地図でえらべる
  const c = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (c) s.add(c.terrId);
  return s;
}
/* 「地図で見る」で目印を付けた家（その家だけは、ほかの区域でもタップできる） */
let target = null, targetMarker = null, targetTimer = null;
function clearTarget() {
  clearTimeout(targetTimer);
  if (targetMarker && map) map.removeLayer(targetMarker);
  targetMarker = null; target = null;
}
function showTargetMarker(h) {
  if (!target || target.hid !== h.id) return;
  if (targetMarker) map.removeLayer(targetMarker);
  const route = !!target.route; // 再訪問のときは、ふだを押すとGoogleマップの道順が開く
  targetMarker = L.marker([h.lat, h.lng], {
    icon: L.divIcon({ className: '', iconSize: [0, 0],
      html: `<div class="tgt"><div class="rt"><span></span><span></span><span></span><span></span></div><div class="ring"></div><b>${route ? 'ここです　タップしてメモ・記録' : 'ここです　タップして開く'}</b></div>` }),
    interactive: !!route, keyboard: false, zIndexOffset: 3000
  }).addTo(map);
  if (route) targetMarker.on('click', () => { const k = K(h.id, target ? target.unit : ''); clearTarget(); openMemo(k); });
  clearTimeout(targetTimer);
  targetTimer = setTimeout(() => { if (targetMarker) { map.removeLayer(targetMarker); targetMarker = null; } }, 15000); // 目印は15秒で消える（家はそのままタップできる）
}
function canTapHouse(h, okT, mine) {
  if (target && target.hid === h.id) return true;
  if (followMap) return true;
  if (!lockOn()) return true;
  const ok = okT || openTerrIds(), my = mine || myPlaces();
  if (ok.has(h.terrId) || targets(h).some(u => my.keys.has(K(h.id, u)))) return true;
  for (const id of ok) { const t = terrById(id); if (isSpecial(t) && inSpecial(h, t)) return true; } // 特別区域の家
  return false;
}
/* 「拡大すると印が出ます」は数秒だけ。タップしても消える */
let zoomHintTimer = null, zoomHintShown = false;
/* はじめの案内（「拡大すると印が出ます」など）は、使い始めて5日たったら出さない（設定で変えられる） */
const FIRST_KEY = 'kuiki_first_use';
if (!lsGet(FIRST_KEY)) lsSet(FIRST_KEY, String(Date.now()));
function beginner() {
  const v = typeof UI !== 'undefined' ? (UI.guide || 'auto') : 'auto'; // かんたんモードの人の設定も、そのまま使う
  if (v === 'on') return true;
  if (v === 'off') return false;
  return Date.now() - Number(lsGet(FIRST_KEY) || Date.now()) < 5 * DAY;
}
function setZoomHint(need) {
  const el = $('#zoomHint');
  if (need && !beginner()) need = false;
  if (!need) { clearTimeout(zoomHintTimer); el.hidden = true; zoomHintShown = false; return; }
  if (zoomHintShown) return;
  zoomHintShown = true; el.hidden = false;
  clearTimeout(zoomHintTimer);
  zoomHintTimer = setTimeout(() => { el.hidden = true; }, 4000);
}
function toggleLegend(open) {
  const on = open === undefined ? $('#legend').hidden : open;
  if (on) renderLegend();
  $('#legend').hidden = !on;
  $('#legendBtn').setAttribute('aria-expanded', String(on));
}
/* 「?」の中身：その区域の進み具合・おすすめ順・細かい数と、印の見かた */
function renderLegend() {
  const box = $('#legendInfo'); if (!box) return;
  const r = roundTerr ? roundInfo(roundTerr) : null;
  $('#legendTitle').textContent = r ? `区域${r.t.no}のようす` : '印の見かた';
  if (!r) { box.innerHTML = ''; $('#legendKeys').open = true; return; }
  const n = r.c, total = n.todo + n.done + n.recent, pct = r.pct, m = roundMode();
  const own = r.t.holder === me().id, lead = !own && isLead(r.t);
  const key = (cls, mark, label) => `<span><i class="pin mini st-plain${cls}">${mark}</i>${label}</span>`;
  const plan = UI.mode !== 'detail' ? [] : roundPlan(r), first = plan[0]; // 簡単モードはおすすめ順を出さないので、計算もしない
  const planUnits = plan.reduce((a, x) => a + x.units.length, 0);
  let body = '';
  if (!n.todo) {
    body = `<p class="okmsg"><b>すべての家に緑のチェックがつきました。</b>区域を回り終えました。</p>`;
  } else if (m === 'progress') {
    body = `<p class="keys">${key('', '', `まだ ${n.todo}`)}${key(' done', '<u>✓</u>', `済み ${n.done - n.other}`)}${n.other ? key(' prev', '<u class="b">✓</u>', `ほかの人が会えた ${n.other}`) : ''}${n.recent ? key(' prev', '<u class="b">✓</u>', `最近会えた ${n.recent}`) : ''}${n.sp ? key(' dim sp', '<u class="sp">特</u>', `特別区域で回る ${n.sp}`) : ''}</p>
      <p class="muted">緑のチェックが全部の家につくと完了です。</p>`;
  } else {
    body = (first
        ? `<p class="next"><span class="numbadge">1</span> 次は <b>${stopLabel(first)}</b><br><span class="muted">${first.reasons.slice(0, 2).join('・')}</span></p>`
        : '<p class="muted">今の時間帯のおすすめはありません。「進み具合」で残りの家を確認してください。</p>') +
      `<p class="keys"><span><span class="numbadge sm">1</span>おすすめ ${plan.length}か所</span>${key(' later', '', `ほかの家 ${n.todo - planUnits}`)}${key(' done', '<u>✓</u>', `済み ${n.done - n.other}`)}${n.other ? key(' prev', '<u class="b">✓</u>', `ほかの人が会えた ${n.other}`) : ''}${n.recent ? key(' prev', '<u class="b">✓</u>', `最近会えた ${n.recent}`) : ''}${n.sp ? key(' dim sp', '<u class="sp">特</u>', `特別区域で回る ${n.sp}`) : ''}</p>`;
  }
  if (n.todo && pct >= D().settings.donePct && own) {
    body = `<p class="okmsg"><b>ほぼ回り終えました（${pct}%）。</b>返却して完了にできます。残りの家は、次に回る人のおすすめに出ます。</p>` + body;
  }
  const helpers = helpersOf(r.t).length;
  const mp2 = myPart(r.t), ps2 = partsOf(r.t);
  box.innerHTML = `<p class="lgtitle"><b>区域${esc(r.t.no)} ${esc(r.t.name)}</b>${own ? '' : lead ? '（今日の司会）' : '（一緒に回る）'}${(own || lead) && helpers ? `（${helpers + 1}人で回る）` : ''}<br>
      <span class="muted">今は${slotShort(r.cur)}　訪ねた家 <b>${n.done} / ${total}</b>（${pct}%）</span></p>
    <div class="progress big" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="回った割合"><i style="width:${pct}%"></i></div>
    <div class="seg" role="group" aria-label="表示の切りかえ">
      <button data-rmode="reco" aria-pressed="${m === 'reco'}">おすすめ順</button>
      <button data-rmode="progress" aria-pressed="${m === 'progress'}">進み具合</button>
    </div>
    ${mp2 ? `<p class="okmsg"><b>今日のあなたの範囲</b>　${esc(partMates(mp2).map(u => uname(u) + 'さん').join('・') || 'ひとり')}と回ります（緑の線の中）</p>
      <div class="row"><a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${center(mp2.poly)[0].toFixed(6)},${center(mp2.poly)[1].toFixed(6)}" target="_blank" rel="noopener">Googleマップでこの範囲へ</a></div>` : ''}
    ${(own || lead) && ps2.length ? `<p class="muted">今日わたした範囲：${ps2.map(p => esc(partName(p))).join(' ／ ')}</p>` : ''}
    ${body}
    <div class="row">${(own || lead) && r.t.group ? '<button class="btn small" id="lgParts">回る範囲を分ける</button>' : ''}${first ? '<button class="btn small primary" id="lgList">おすすめの一覧</button>' : ''}${own ? '<button class="btn small" id="lgReturn">返す</button>' : ''}${LIVE && (helpers || isHelper(r.t)) ? `<button class="btn small" id="barSync">最新にする</button><span class="muted" id="barAge"></span>` : ''}</div>`;
  $$('[data-rmode]', box).forEach(x => x.onclick = () => { me().roundMode = x.dataset.rmode; Store.save(); renderHouses(); renderLegend(); });
  if ($('#lgParts')) $('#lgParts').onclick = () => { toggleLegend(false); startPartSplit(r.t.id); }; // 一覧を出さずに、すぐ地図で分ける
  if ($('#lgList')) $('#lgList').onclick = () => { toggleLegend(false); openPlanSheet(); };
  if ($('#lgReturn')) $('#lgReturn').onclick = () => { toggleLegend(false); openReturnSheet(r.t.id); };
  if ($('#barSync')) { updateSyncAge(); $('#barSync').onclick = () => { $('#barAge').textContent = '更新しています…'; (Store.queue.length ? flush() : refresh(true)).catch(() => {}).then(updateSyncAge); }; }
}
/* 親番号と枝番（2026-10-18）：枝番の区域（例：5-1）は t.pno＝親の番号（5）・t.pnm＝マイマップでの親の名前（A05）・t.pp＝親の線 を持つ。
   t.rest＝1 は「親の線の中で、どの枝番にも入らない部分」の区域（枝番より後に家を割り当てる）
   地図では親の線を太い線で囲み、親の番号を線の上に出す。遠くから見るときは枝番の札を小さくする */
const kidNo = t => (t && t.pno && String(t.no).startsWith(t.pno + '-') ? String(t.no).slice(String(t.pno).length + 1) : '');
function terrLabelHtml(t) {
  const k = kidNo(t);
  return k ? `<span class="kid"><i>${esc(t.pno)}-</i>${esc(k)}</span>` : `<span>${t.group ? 'G ' : ''}${esc(t.no)}</span>`;
}
function renderParents(cur) {
  const ps = new Map();
  for (const t of polyTerrs()) if (t.pno && okPoly(t.pp) && !ps.has(t.pno)) ps.set(t.pno, t);
  const curT = cur ? terrById(cur) : null;
  ps.forEach((t, pno) => {
    const on = !!curT && curT.pno === pno;
    L.polygon(t.pp, { color: '#1E3A5F', weight: on ? 6 : 4.5, opacity: curT && !on ? 0.45 : 0.9, fill: false, interactive: false }).addTo(terrLayer);
    const b = bboxOf(t.pp); // 親の番号は、親の線のいちばん上に出す（枝番の札と重ならないように）
    L.marker([b[1], (b[2] + b[3]) / 2], {
      icon: L.divIcon({ className: `terr-label par${curT && !on ? ' faint' : ''}`, html: `<span>区域 ${esc(pno)}</span>`, iconSize: [0, 0] }),
      interactive: false, keyboard: false, pane: 'labelPane'
    }).addTo(terrLayer);
  });
}
function renderTerrs() {
  terrLayer.clearLayers();
  const cur = selTerrId();
  const tapOk = mode === 'normal'; // 線引き・家の追加のときは、地図のタップを区域の選択に使わない
  const lock = lockOn(), okT = lock ? openTerrIds() : null;
  const list = polyTerrs().slice().sort((a, b) => (b.rest ? 1 : 0) - (a.rest ? 1 : 0)); // 親の残りの部分は下に描く（枝番を押せるように）
  for (const t of list) {
    const on = t.id === cur, dim = !!cur && !on; // えらんだ区域以外は薄く
    const gray = lock && !okT.has(t.id);          // 選べない区域は灰色
    const col = gray ? '#9AA5A0' : terrLineColor();
    const poly = L.polygon(t.polygon, {
      color: col, weight: terrLineWidth(on), opacity: dim ? 0.3 : 1,
      fillColor: col, fillOpacity: gray ? 0.12 : on ? 0.07 : 0.02,
      interactive: tapOk && !gray, bubblingMouseEvents: false
    }).addTo(terrLayer);
    if (tapOk && !gray) poly.on('click', e => {
      // 地図で場所をえらんでいるとき（集まりの場所・目印・グループの中心など）は、区域の中をタップしても、その場所をえらぶ
      if (pickPlace) { const f = pickPlace; pickPlace = null; f(e.latlng); return; }
      selectTerr(t.id === cur ? null : t.id, { toast: t.id !== cur });
    });
    L.marker(labelPoint(t.polygon), {
      icon: L.divIcon({ className: `terr-label${dim ? ' faint' : ''}${gray ? ' gray' : ''}${t.group && !gray ? ' grp' : ''}${kidNo(t) ? ' kidl' : ''}`, html: terrLabelHtml(t), iconSize: [0, 0] }),
      interactive: false, keyboard: false, pane: 'labelPane'
    }).addTo(terrLayer);
    // 今日わたした範囲（担当者には全部、わたされた人には自分の範囲だけ）
    const mp = myPart(t), hold = canLead(t); // 今日の司会にも、わたした範囲を全部見せる
    partsOf(t).forEach(p => {
      if (!hold && (!mp || p.id !== mp.id)) return;
      if (!okPoly(p.poly)) return;
      const own = mp && p.id === mp.id;
      L.polygon(p.poly, { color: own ? '#00796B' : '#C2410C', weight: 4, dashArray: own ? null : '8 6',
        fillColor: own ? '#00796B' : '#C2410C', fillOpacity: own ? 0.08 : 0.05, interactive: false }).addTo(terrLayer);
      L.marker(labelPoint(p.poly), { icon: L.divIcon({ className: 'part-label', html: `<span>${esc(own ? 'あなたの範囲' : partName(p))}</span>`, iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' }).addTo(terrLayer);
    });
  }
  renderParents(cur); // 親番号の線と番号
  // グループの留守宅カードで分けた範囲（カードを持つ人には全部、わたされた人には自分の範囲だけ）
  const fc = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (fc && fc.group && fc.mode === 'split') {
    const mp = myPart(fc), hold = fc.by === me().id;
    partsOf(fc).forEach(p => {
      if ((!hold && (!mp || p.id !== mp.id)) || !okPoly(p.poly)) return;
      const own = mp && p.id === mp.id;
      L.polygon(p.poly, { color: own ? '#00796B' : '#C2410C', weight: 4, dashArray: own ? null : '8 6',
        fillColor: own ? '#00796B' : '#C2410C', fillOpacity: own ? 0.08 : 0.05, interactive: false }).addTo(terrLayer);
      L.marker(labelPoint(p.poly), { icon: L.divIcon({ className: 'part-label', html: `<span>${esc(own ? 'あなたの範囲' : partName(p))}</span>`, iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' }).addTo(terrLayer);
    });
  }
}
/* 区域をえらぶ（地図のタップ・プルダウン・区域カードから共通で使う） */
function selectTerr(id, opts) {
  const o = opts || {}, t = id ? terrById(id) : null;
  clearTarget(); followMap = false;
  // 留守宅カードを見ているときは、ほかをタップしても表示を消さない（同じ区域のとき・区域をえらんでいないとき）
  const card = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (!card || (id && id !== card.terrId)) focusCard = null;
  curTerr = t ? id : null;
  roundTerr = !focusCard && myTerr(t) ? id : null; // 自分の区域（一緒に回る区域も）なら「回る表示」にする
  syncTerrJump();
  renderTerrs(); renderHouses();
  if (t && o.fit) setTimeout(() => fitTerr(id), 80);
  if (t && !isAdmin() && !myTerr(t) && !t.holder && isFree(t)) {
    // 自由に受け取ってよい区域：その場で受け取れるようにする
    toast(`区域${t.no}は、自由に受け取ってよい区域です`, null, { label: '受け取る', fn: () => { reqForGroup = false; takeTerr(t.id); } });
  } else if (t && o.toast && beginner()) toast(`区域${t.no}をえらびました`);
}
/* 今えらんでいる区域（選んでいないときは null） */
function selTerrId() {
  const c = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (c) return c.terrId;
  if (roundTerr) return roundTerr;
  return curTerr && terrById(curTerr) ? curTerr : null;
}
/* 画面上での区域の広さ（ピクセル） */
function terrScreenArea(t) {
  if (!okPoly(t.polygon)) return 0;
  const p = t.polygon.map(v => map.latLngToContainerPoint(v));
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
  return Math.abs(a / 2);
}
/* 画面に何区域分入っているかで、印の濃さを決める（2〜3区域まで近づくと、だんだん現れる） */
const FADE_FULL = 3, FADE_NONE = 12;          // 区域をえらんでいないとき
const FADE_FULL_SEL = 6, FADE_NONE_SEL = 24; // えらんだ区域があるとき（少し早めに出す）
/* 画面に区域が何個ぶん入っているかの目安（拒否の印を出すかどうかにも使う。2026.13.29） */
function terrsOnScreen() {
  const size = map.getSize(), b = map.getBounds();
  const sel = selTerrId(), st = sel && terrById(sel);
  let ref;
  if (st) ref = terrScreenArea(st);
  else {
    const areas = polyTerrs().filter(t => b.intersects(L.latLngBounds(t.polygon))).map(terrScreenArea).filter(a => a > 0);
    if (!areas.length) return Infinity;
    ref = areas.reduce((x, y) => x + y, 0) / areas.length;
  }
  return ref ? (size.x * size.y) / ref : Infinity;
}
function iconFade() {
  const size = map.getSize(), b = map.getBounds();
  const sel = selTerrId(), st = sel && terrById(sel);
  let ref;
  if (st) ref = terrScreenArea(st); // えらんでいる区域を基準にする
  else {
    const areas = polyTerrs()
      .filter(t => b.intersects(L.latLngBounds(t.polygon)))
      .map(terrScreenArea).filter(a => a > 0);
    if (!areas.length) return 1;
    ref = areas.reduce((x, y) => x + y, 0) / areas.length; // 画面に入っている区域の平均の広さ
  }
  if (!ref) return 1;
  const full = st ? FADE_FULL_SEL : FADE_FULL, none = st ? FADE_NONE_SEL : FADE_NONE;
  const n = (size.x * size.y) / ref; // 画面に入る区域の数の目安
  if (n <= full) return 1;
  if (n >= none) return 0;
  return (none - n) / (none - full);
}
function renderHouses() {
  if (!map) return;
  houseLayer.clearLayers();
  if (window.renderDncPins) window.renderDncPins(); // 場所だけの拒否の印（kyohi.js）
  if (window.renderChuiPins) window.renderChuiPins(); // 場所だけの注意の印（chui.js）
  const fkeys = followMap ? new Set(myFollowKeys()) : null;
  const ff = fkeys ? (k => (fkeys.has(k) ? 'hl' : 'dim')) : focusFn();
  renderCardBar();
  if ((mode === 'draw' && drawTap === 'line' && !drawShowHouses) || mode === 'sen' || mode === 'tok') { setZoomHint(false); return; } // 線引き中は写真が見えるように家の印を隠す（特別区域の分け方では、分け方の印だけを出す）
  const fade = fkeys ? 1 : iconFade();
  const b = map.getBounds().pad(0.2), vis = rotVisTest(0.2); // vis：地図を回しているときの、画面に入っているかの確かめ
  const sel = mode === 'normal' ? selTerrId() : null; // 区域をえらんでいるときは、その区域の家だけ
  const list = fkeys
    ? D().houses.filter(h => targets(h).some(u => fkeys.has(K(h.id, u)))) // 再訪問を地図で見る：自分の再訪問だけ
    : fade > 0.05
      ? D().houses.filter(h => (!sel || houseInTerr(h, sel)) && b.contains([h.lat, h.lng]) && (!vis || vis(h.lat, h.lng)))
      : null;
  const show = !!list && list.length <= 4000; // 小さな点なら多くても軽い。それ以上は拡大してから出す
  setZoomHint(!show);
  if (!show) { houseNameLabels(null, false); return; }
  const mine = myPlaces(), dimOthers = !sel && !isAdmin(); // 何も選んでいないときは、自分の区域以外を薄く
  const okT = lockOn() && mode === 'normal' ? openTerrIds() : null;
  // 家が混んでいるとき（印を並べると画面の半分近くをおおうとき）は、小さな点で出す
  const sz = map.getSize(), pinPx = 36 * pinScale();
  // （いちばん近くまで拡大したとき・19以上は、いつもくわしい印。簡単モードは18以上）
  const dense = !fkeys && map.getZoom() < (UI.mode !== 'detail' ? 18 : 19) && (list.length > 800 || list.length * pinPx * pinPx > sz.x * sz.y * 0.45);
  for (const h of list) {
    const allowed = !okT || canTapHouse(h, okT, mine);
    const op = fade * (allowed && dimOthers && !isMyHouse(h, mine) ? 0.4 : 1);
    // 混んでいても大きく出す家：おすすめの番号・「地図で見る」でえらんだ家・留守宅カードの家
    const big = !dense || (roundNums && roundNums.has(h.id)) || (target && target.hid === h.id) ||
      (!!ff && allowed && targets(h).some(u => ff(K(h.id, u)) === 'hl'));
    if (!big) {
      const st = dotStyle(h, ff, !allowed);
      const d = L.circleMarker([h.lat, h.lng], Object.assign({
        renderer: dotRenderer, interactive: allowed, bubblingMouseEvents: false,
        opacity: op * st.o, fillOpacity: op * st.o, dashArray: h.prov ? '3 3' : null
      }, st.s));
      if (allowed) d.on('click', () => onHouseTap(h.id));
      d.addTo(houseLayer);
      continue;
    }
    const m = L.marker([h.lat, h.lng], {
      icon: houseIcon(h, ff, !allowed), title: h.label || '',
      opacity: op,
      interactive: allowed, keyboard: allowed,
      zIndexOffset: roundNums && roundNums.has(h.id) ? 1000 : 0
    });
    if (allowed) m.on('click', () => onHouseTap(h.id));
    m.addTo(houseLayer);
  }
  houseNameLabels(list, dense);
}
/* 名前を出す大きさ：区域カードから地図を開いたときの大きさ（区域が画面にちょうど入る大きさ）から。
   区域をえらんでいるときはその区域の大きさ、えらんでいないときは最後に開いた区域の大きさ */
const NAMEZ_KEY = 'kuiki_name_zoom';
function terrFitZoom(t) {
  const bar = $('#cardBar'), tools = $('#mapTools');
  const top = tools && !tools.hidden ? tools.offsetHeight + 12 : 16;
  const bottom = bar && !bar.hidden ? bar.offsetHeight + 16 : 16;
  return map.getBoundsZoom(L.latLngBounds(t.polygon), false, L.point(24, top + bottom));
}
function nameZoomNow() {
  const id = selTerrId(), t = id && terrById(id);
  if (t && okPoly(t.polygon)) return terrFitZoom(t);
  const v = Number(lsGet(NAMEZ_KEY));
  return v > 0 ? v : 17;
}
/* 名前を出す大きさの調整（設定のスライダー）：0＝区域カードの大きさ、＋1＝そこから1段拡大したとき（2倍）、−1＝1段縮めても（半分） */
const nameZoomOff = k => { const v = Number(UI[k]); return isFinite(v) ? Math.max(-3, Math.min(3, v)) : 0; };
function nameZoomText(v) {
  if (!v) return '区域カードの大きさから';
  const n = Math.abs(v), times = Math.round(Math.pow(2, n) * 10) / 10;
  return v > 0 ? `${n}段 拡大したときから（${times}倍）` : `${n}段 縮めても（${times}分の1）`;
}
function houseNameLabels(list, dense) {
  const z = map.getZoom(), base = nameZoomNow();
  const apt = UI.aptName === 'on' && z >= base + nameZoomOff('aptZoom') - 0.05;
  const fc = UI.fcName === 'on' && z >= base + nameZoomOff('fcZoom') - 0.05;
  if ((!apt && !fc) || mode !== 'normal') return;
  // 設定で「地図に見えている全体」をえらんだときは、えらんだ区域の外の建物の名前も出す
  const all = UI.nameScope === 'all' && !followMap;
  // 区域をえらんでいるときの、ほかの区域の建物の名前は、まわりの区域番号と同じように薄く出す（現場で見る区域の名前を目立たせる）
  let inSel = null;
  if (all) {
    const b = map.getBounds().pad(0.1), onMap = new Set((list || []).map(h => h.id));
    if (selTerrId() && list) inSel = onMap;
    list = D().houses.filter(h => h.label && b.contains([h.lat, h.lng]));
    if (inSel) list.sort((x, y) => (inSel.has(y.id) ? 1 : 0) - (inSel.has(x.id) ? 1 : 0)); // 300件の上限では、えらんだ区域の名前を先に
    dense = dense && list.some(h => onMap.has(h.id));
  }
  if (!list) return;
  let n = 0;
  for (const h of list) {
    if (!h.label || n > 300) continue;
    const k = h.type === 'apt' ? aptKind(h) : kindOf(h);
    const isFc = k !== 'home';
    if (h.type === 'apt' ? !(apt || (fc && isFc)) : !(fc && isFc)) continue; // 一戸建ての「目印」は出さない
    n++;
    const out = !!inSel && !inSel.has(h.id); // えらんだ区域の外（家の印は出ていないので、点のときの位置に）
    L.marker([h.lat, h.lng], {
      icon: L.divIcon({ className: 'hname' + (out ? ' out dot' : dense && !(roundNums && roundNums.has(h.id)) ? ' dot' : ''), html: `<span class="${isFc ? 'fc' : ''}">${esc(h.label)}</span>`, iconSize: [0, 0] }),
      pane: 'labelPane', interactive: false, keyboard: false,
      zIndexOffset: out ? -1000 : 0 // 重なったときは、えらんだ区域の名前が上
    }).addTo(houseLayer);
  }
}
/* 小さな点の色：白＝まだ、緑＝今回訪ねた、青＝最近会えた、赤＝拒否、灰＝選べない家 */
const DOT = {
  plain: { fillColor: '#fff', color: '#17324D', weight: 2 },
  done: { fillColor: '#2E9E7E', color: '#fff', weight: 1.5 },
  prev: { fillColor: '#1565C0', color: '#fff', weight: 1.5 },
  dnc: { fillColor: '#C62828', color: '#fff', weight: 1.5 },
  lock: { fillColor: '#C9CFCC', color: '#9AA5A0', weight: 1.5 }
};
function dotStyle(h, ff, locked) {
  const r = (h.type === 'apt' ? 8 : 6) * (UI.mode !== 'detail' ? (UI.size === 'xlarge' ? 1.25 : 1) * 1.4 : (PINS[uiEff().pin] || PINS.normal)[0]); // 簡単モードの小さな点は半径1.4倍
  if (locked) return { s: Object.assign({ radius: r }, DOT.lock), o: 0.6 };
  const since = periodStart(h), ks = targets(h).map(u => K(h.id, u));
  if (!ks.length) return { s: Object.assign({ radius: r }, DOT.plain), o: 1 };
  const one = k => {
    if (D().dnc[k]) return 'dnc';
    const f = ff ? String(ff(k) || '').split(' ')[0] : null; // 'hl fade' のように、あとに「薄く」の印が付くことがある
    if (f === 'dim') return 'dim';
    if (f === 'done') return 'done';
    if (f === 'prev') return 'prev';
    if (f) return 'plain';
    const p = pinState(k, since);
    return (p === 'met' || p === 'away') ? (otherDone(h, k, since) ? 'prev' : 'done') : (p === 'plain' && recentMet(k) ? 'prev' : 'plain');
  };
  const sts = ks.map(one);
  // 集合住宅：まだの部屋が1つでもあれば「まだ」、全部すんでいれば「すんだ」
  const st = sts.includes('plain') ? 'plain' : sts.every(x => x === 'dnc') ? 'dnc'
    : sts.every(x => x === 'dim') ? 'dim' : sts.includes('done') ? 'done' : sts.includes('prev') ? 'prev' : 'plain';
  if (st === 'dim') return { s: Object.assign({ radius: r }, DOT.plain), o: 0.3 };
  const faded = !!ff && ks.filter(k => !D().dnc[k]).every(k => String(ff(k) || '').indexOf(' fade') > 0); // 全部の部屋が「薄く」のとき
  return { s: Object.assign({ radius: r }, DOT[st]), o: faded ? 0.45 : 1 };
}
function fillTerrJump() {
  const sel = $('#terrJump');
  const all = D().territories.slice().sort(byNo);
  // 区域係はすべて。伝道者は自分の区域カード（一緒に回る区域も）と、自由に受け取ってよい区域
  const freeT = t => !t.holder && isFree(t);
  const ts = isAdmin() ? all : all.filter(t => myTerr(t) || freeT(t));
  const head = ts.length ? '区域をえらぶ' : '受け取っている区域はありません';
  // 枝番の区域は、親の番号ごとにまとめる（例：区域5 の中に 5-1・5-2…）
  const opt = t => `<option value="${esc(t.id)}">区域 ${esc(t.no)}${t.rest ? '（枝番の外）' : ''}${!isAdmin() && !myTerr(t) && freeT(t) ? '（自由に受け取れる）' : ''}</option>`;
  let html = '', gp = null;
  ts.forEach(t => {
    const p = t.pno || null;
    if (p !== gp) { if (gp) html += '</optgroup>'; if (p) html += `<optgroup label="区域 ${esc(p)}（枝番）">`; gp = p; }
    html += opt(t);
  });
  if (gp) html += '</optgroup>';
  sel.innerHTML = `<option value="">${head}</option>` + html;
  syncTerrJump();
}
/* 左上のえらび欄：留守宅カードを見ているときは、そのことが分かるようにする */
function syncTerrJump() {
  const sel = $('#terrJump'); if (!sel) return;
  const card = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  const old = sel.querySelector('option[value="__card"]');
  if (old) old.remove();
  if (card) {
    const t = terrById(card.terrId);
    sel.insertAdjacentHTML('afterbegin', `<option value="__card">留守宅カード　区域 ${esc(t ? t.no : '-')}</option>`);
    sel.value = '__card';
    return;
  }
  sel.value = [...sel.options].some(x => x.value === (curTerr || '')) ? (curTerr || '') : '';
}
/* 自分の区域・自分の受け持ち・自分の留守宅カードの家か */
function myPlaces() {
  const id = me().id;
  const terrs = new Set(D().territories.filter(myTerr).map(t => t.id));
  const keys = new Set(Object.keys(D().follows).filter(k => D().follows[k].by === id));
  activeCards().forEach(c => { if (c.by === id || isCardHelper(c)) c.keys.forEach(k => keys.add(k)); }); // グループの留守宅カードで今日回る人も
  return { terrs, keys };
}
const isMyHouse = (h, mine) => mine.terrs.has(h.terrId) || targets(h).some(u => mine.keys.has(K(h.id, u))) ||
  [...mine.terrs].some(id => { const t = terrById(id); return isSpecial(t) && inSpecial(h, t); });
function fitTerr(id) {
  const t = terrById(id); if (!t || !okPoly(t.polygon)) return;
  // 上の操作ボタンと下の案内に隠れない範囲で、区域をできるだけ大きく表示する
  const bar = $('#cardBar'), tools = $('#mapTools');
  const top = tools && !tools.hidden ? tools.offsetHeight + 12 : 16;
  const bottom = bar && !bar.hidden ? bar.offsetHeight + 16 : 16;
  map.fitBounds(L.latLngBounds(t.polygon), { paddingTopLeft: [12, top], paddingBottomRight: [12, bottom] });
  lsSet(NAMEZ_KEY, String(terrFitZoom(t))); // この大きさから、マンション・学校などの名前を出す
}
function fitAll() {
  const pts = polyTerrs().flatMap(t => t.polygon);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
}
/* 自分の区域カード以外で記録するときの確認（区域ごとに1回。画面を開き直すとまた出る） */
const terrAck = new Set();
function needTerrConfirm(tid, keys) {
  if (!tid || isAdmin()) return false;
  const t = terrById(tid);
  if (!t || myTerr(t) || terrAck.has(tid)) return false;
  // 自分が受け取っている特別区域（オートロック・一度も会えていない家など）の家は、確認しない
  const mySp = D().territories.filter(x => isSpecial(x) && myTerr(x));
  if (keys && keys.length && mySp.length && keys.some(k => {
    const i = k.indexOf('|'), h = houseById(k.slice(0, i)), u = k.slice(i + 1);
    return h && mySp.some(x => (!okPoly(x.polygon) || inPoly(h.lat, h.lng, x.polygon)) && spMatch(h, u, x));
  })) return false;
  if (keys && keys.length) {
    const cardKeys = new Set();
    activeCards().forEach(c => { if (c.by === me().id || isCardHelper(c)) c.keys.forEach(k => cardKeys.add(k)); });
    // 自分の再訪問・引き継ぎ待ち・自分の留守宅カードの家は、確認しない
    if (keys.some(k => { const f = fol(k); return (f && f.by === me().id) || relOf(k) || cardKeys.has(k); })) return false;
  }
  return true;
}
function guardTerr(tid, keys, proceed) {
  if (!needTerrConfirm(tid, keys)) { proceed(); return; }
  const t = terrById(tid);
  setSheet(headHtml(t, 'あなたの区域カードではありません', esc(t.name)) + `
    <div class="notice warn"><b>区域${esc(t.no)}は、あなたが受け取っている区域カードではありません。</b><br>
      ${t.holder ? 'ほかの人が担当しています。' : '今は担当者がいません。'}</div>
    <p class="q">この家を訪問しましたか？</p>
    <button class="btn primary block" id="gOk">はい。訪問しました</button>
    <button class="btn block" data-close>いいえ（やめる）</button>
    <p class="hint">区域カードを回るときは、受け取っている区域だけを訪問してください。<br>
      この区域では、画面を開き直すまで、この確認は出ません。自分の留守宅カードの家では出ません。</p>`);
  $('#gOk').onclick = () => { terrAck.add(tid); closeSheet(); proceed(); };
}
async function onHouseTap(id) {
  const h = houseById(id); if (!h) return;
  if (window.dncPickHouse && window.dncPickHouse(id)) return; // 区域係が拒否の家を地図でえらんでいるとき（kyohi.js）
  if (mode === 'part') { // 回る範囲を分けている最中：記録の画面は出さない
    if (partDraw && partDraw.tool !== 'pen') partTap(L.latLng(h.lat, h.lng));
    return;
  }
  if (mode === 'sen') { if (window.kyoukai) window.kyoukai.click(L.latLng(h.lat, h.lng)); return; }
  if (mode === 'tok') return; // 特別区域の分け方（tokubetsu.js）：家の印は出していない
  if (mode === 'draw' && drawTap === 'line') { drawClick(L.latLng(h.lat, h.lng)); return; }
  if (mode === 'draw') { toast('そこにはもう家があります。まちがえたときは、お知らせの「取り消す」を押してください'); return; }
  if (mode === 'add') {
    if (addMode !== 'del') { toast('そこにはもう家があります。まちがえたときは、お知らせの「取り消す」を押してください'); return; }
    const rec = houseRecText(h);
    // 仮の家（記録・拒否・注意・再訪問のどれもない）は、確認なしですぐ消す。まちがえたら、下の「取り消す」でもどせる（H8）
    if (h.prov && !rec && (isAdmin() || myTerr(terrById(h.terrId)))) { delCount++; updateAddBar(); dropProvHouse(h.id, true); return; }
    if (!isAdmin()) { if (h.prov && rec) toast('記録や拒否・注意・再訪問のある家は、区域係だけが消せます。削除の申請をしてください'); openDelRequest(h); return; } // 伝道者は申請になる
    const name = h.type === 'apt' ? `${h.label || '集合住宅'}（${h.units.length}部屋）` : (h.label || 'この家');
    if (rec && !await ask(`「${name}」を消します。${rec}よろしいですか？`)) return; // 記録・印のある家だけ確かめる（H8）
    delCount++; updateAddBar();
    deleteHouse(h.id);
    return;
  }
  if (followMap) { // 再訪問を地図で見る：自分の再訪問だけ
    const ks = targets(h).map(u => K(h.id, u)).filter(k => { const f = fol(k); return f && f.by === me().id; });
    if (!ks.length) return;
    if (ks.length === 1) { openMemo(ks[0]); return; }
    setSheet(headHtml(terrById(h.terrId), esc(h.label || '集合住宅'), '部屋をえらんでください') +
      ks.map(k => `<button class="btn block" data-fk="${esc(k)}">${esc(unitTitle(h, parseKey(k)[1]))}</button>`).join('') + '<button class="btn block" data-close>閉じる</button>');
    $$('[data-fk]', $('#sheet')).forEach(b => b.onclick = () => openMemo(b.dataset.fk));
    return;
  }
  if (Date.now() - zoomEndAt < 450) return; // ダブルタップで拡大した直後のタップは、家を開かない
  if (map.getZoom() < TAP_MIN_ZOOM && !(target && target.hid === id)) {
    map.setView([h.lat, h.lng], Math.min(map.getMaxZoom(), TAP_MIN_ZOOM + 1));
    toast('家の近くまで拡大しました。もう一度家を押すと記録できます');
    return;
  }
  if (!canTapHouse(h)) { toast('自分の区域以外の家は選べません'); return; }
  const tg = target && target.hid === id ? target : null;
  if (tg) clearTarget();
  if (tg && tg.reco && h.terrId) terrAck.add(h.terrId); // おすすめから開いた家は、区域の確認を出さない
  guardTerr(h.terrId, tg && tg.unit ? [K(h.id, tg.unit)] : targets(h).map(u => K(h.id, u)), () => {
    if (tg && tg.route) { openMemo(K(id, tg.unit)); return; }                 // 再訪問から：メモ・記録の画面
    if (tg && (h.type !== 'apt' || tg.unit)) { openTarget(id, tg.unit, false, true); return; } // まず記録とメモを見る
    if (h.type === 'apt') { if (h.units.length) openAptSeq(id); else openBuilding(id); }
    else openTarget(id, '', false);
  });
}
function setMode(m) {
  if (m !== 'normal' && typeof hideNextPanel === 'function') hideNextPanel();
  if (m !== 'part' && typeof penOff === 'function') penOff(); // えんぴつで囲むのをやめたら、地図をまた動かせるようにする
  mode = m;
  if (m !== 'normal') clearTarget();
  $('#addBar').hidden = m !== 'add';
  if (m === 'add') setAddFold(false); else clearTimeout(addFoldTimer);
  $('#partBar').hidden = m !== 'part';
  $('#drawBar').hidden = m !== 'draw';
  if (window.kyoukai) window.kyoukai.onMode(m); // 区域の線を直す（kyoukai.js）
  if (window.tokubetsu) window.tokubetsu.onMode(m); // 特別区域の分け方（tokubetsu.js）
  $('#mapTools').hidden = m !== 'normal';
  $('#map').classList.toggle('crosshair', m !== 'normal');
  $('#map').classList.toggle('drawing', m === 'draw');
  $('#map').classList.toggle('deleting', m === 'add' && addMode === 'del');
  if (m !== 'draw') clearOverlay();
  if (m === 'normal' && LIVE && Store.inbox.length) setTimeout(applyInbox, 0);
  document.body.classList.toggle('focusmode', m !== 'normal'); // 作業中は上下の帯を隠して地図を広く
  toggleLegend(false);
  $('#legendBtn').hidden = m === 'draw' || m === 'sen' || m === 'tok';
  $('#btnLocate').hidden = m !== 'normal';
  if (map) {
    if (m === 'normal') zoomCtl.remove(); else zoomCtl.addTo(map); // ふだんは指で拡大・縮小。作業中だけ＋−を出す
    map.options.zoomDelta = m === 'draw' ? 0.25 : 1;
    renderHouses();
    setTimeout(() => map.invalidateSize(), 30);
  }
}

/* ---------- 回る範囲を分ける（司会者・監督＝その区域の担当者） ---------- */
let partDraw = null, partLayer = null;
function startPartSplit(tid) {
  const t = terrById(tid);
  if (!canLead(t)) { toast('この区域の担当者（今日の司会）だけが分けられます'); return; }
  showView('map');
  selectTerr(tid, { fit: true });
  partDraw = { tid, pts: [], tool: lsGet('kuiki_parttool') === 'pen' ? 'pen' : 'tap' };
  setMode('part');
  setPartTool(partDraw.tool);
  renderPartDraw();
  toast('地図をタップして、わたす範囲を囲んでください');
}
/* グループの留守宅カードで、地図に線を引いて範囲を分ける（カードを持つ人だけ。分けた範囲は今日の終わりまで） */
function startCardSplit(cid) {
  const c = D().awayCards.find(x => x.id === cid);
  if (!c || !c.group || c.by !== me().id || c.endedAt) { toast('このカードを持つ人だけが分けられます'); return; }
  if (c.mode !== 'split') { toast('「分ける」を選ぶと、範囲を分けられます'); return; }
  openAwayCard(cid);
  partDraw = { tid: c.terrId, cid, pts: [], tool: lsGet('kuiki_parttool') === 'pen' ? 'pen' : 'tap' };
  setMode('part');
  setPartTool(partDraw.tool);
  renderPartDraw();
  toast('地図をタップして、わたす範囲を囲んでください');
}
const partObj = pd => (pd.cid ? D().awayCards.find(x => x.id === pd.cid) : terrById(pd.tid)); // 分ける相手：区域、またはグループの留守宅カード
function endPartSplit() {
  penOff();
  partDraw = null;
  setMode('normal');
  renderPartDraw();
}
function partTap(ll) {
  if (!partDraw || partDraw.tool === 'pen') return;
  partDraw.pts.push([ll.lat, ll.lng]);
  renderPartDraw();
}
/* ---------- 範囲を「指でなぞって」囲む（えんぴつ） ----------
   ・なぞっているあいだは地図が動かないようにし、2本指なら地図の拡大・移動にする
   ・なぞった線は、形を保ったまま点を減らす（サーバーに送る点は60まで） */
let penStroke = null, penBound = false, penLine = null;
function setPartTool(tool) {
  if (!partDraw) return;
  partDraw.tool = tool === 'pen' ? 'pen' : 'tap';
  lsSet('kuiki_parttool', partDraw.tool);
  $$('#partBar [data-parttool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.parttool === partDraw.tool)));
  if (partDraw.tool === 'pen') penOn(); else penOff();
  updatePartBar();
}
function penOn() {
  if (!map) return;
  map.dragging.disable();
  map.getContainer().style.touchAction = 'none';
  $('#map').classList.add('penmode');
  if (penBound) return;
  penBound = true;
  const el = map.getContainer();
  let touches = 0;
  const active = () => mode === 'part' && partDraw && partDraw.tool === 'pen';
  el.addEventListener('pointerdown', e => {
    touches++;
    if (!active()) return;
    if (touches > 1 || !e.isPrimary) { penCancel(); map.dragging.enable(); return; } // 2本指：地図を動かす
    penStroke = [map.mouseEventToLatLng(e)];
    penStroke.px = [[e.clientX, e.clientY]];
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* 何もしない */ }
  });
  el.addEventListener('pointermove', e => {
    if (!penStroke || !active()) return;
    const last = penStroke.px[penStroke.px.length - 1];
    if (Math.hypot(e.clientX - last[0], e.clientY - last[1]) < 4) return;
    penStroke.push(map.mouseEventToLatLng(e)); penStroke.px.push([e.clientX, e.clientY]);
    if (!penLine) penLine = L.polyline([], { color: '#C2410C', weight: 4, interactive: false }).addTo(map);
    penLine.setLatLngs(penStroke);
  });
  const up = () => {
    touches = Math.max(0, touches - 1);
    if (!active()) return;
    if (touches === 0) map.dragging.disable();
    if (!penStroke) return;
    const st = penStroke; penStroke = null;
    if (penLine) { map.removeLayer(penLine); penLine = null; }
    if (st.length < 8) { toast('もう少し大きく、ぐるっと囲んでください'); return; }
    partDraw.pts = simplifyRing(st.map(ll => [ll.lat, ll.lng]), 0.5);
    let tol = 1; // 点が多いときは、形を少しずつゆるめて60点までにする
    while (partDraw.pts.length > 60 && tol < 200) { partDraw.pts = simplifyRing(st.map(ll => [ll.lat, ll.lng]), tol); tol *= 1.6; }
    renderPartDraw();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
function penCancel() {
  penStroke = null;
  if (penLine && map) { map.removeLayer(penLine); penLine = null; }
}
function penOff() {
  penCancel();
  if (!map) return;
  map.dragging.enable();
  map.getContainer().style.touchAction = '';
  $('#map').classList.remove('penmode');
}

function renderPartDraw() {
  if (!map) return;
  if (!partLayer) partLayer = L.layerGroup().addTo(map);
  partLayer.clearLayers();
  if (!partDraw) { updatePartBar(); return; }
  const pts = partDraw.pts;
  if (pts.length >= 2) {
    L.polygon(pts, { color: '#C2410C', weight: 4, dashArray: '8 6', fillColor: '#C2410C', fillOpacity: 0.12, interactive: false }).addTo(partLayer);
  }
  if (partDraw.tool !== 'pen') pts.forEach(pt => L.circleMarker(pt, { radius: 6, color: '#C2410C', weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(partLayer));
  updatePartBar();
}
function updatePartBar() {
  const el = $('#partMsg'); if (!el) return;
  const n = partDraw ? partDraw.pts.length : 0;
  if (partDraw && partDraw.tool === 'pen') {
    el.textContent = n >= 3 ? '囲めました。「この範囲をわたす」を押してください。なぞり直すと、囲みが入れかわります'
      : '指で、わたす範囲をぐるっとなぞって囲みます（地図を動かすときは、2本指で）';
  } else el.textContent = n === 0 ? '地図をタップして、範囲を囲みます'
    : n < 3 ? `あと${3 - n}か所タップすると、範囲になります（今 ${n}か所）`
      : `${n}か所で囲んでいます。「この範囲をわたす」を押してください`;
  const po = partDraw ? partObj(partDraw) : null;
  if (po && n >= 3) { // 囲んだ中の件数をその場で出す（どれくらいの量か分かるように）
    const t = terrById(partDraw.tid), c = t && partContents(t, partDraw.pts, partDraw.cid ? po.keys : null);
    if (c) el.textContent += `\n囲んだ中：${c.total ? `${c.total}か所（${partContentsText(c)}）` : '家の印がありません'}`;
  }
  const ps = po ? partsOf(po) : [];
  $('#partList').textContent = ps.length ? `今日わたした範囲：${ps.map(p => partName(p)).join(' ／ ')}` : '';
  const lb = $('#partListBtn'); if (lb) lb.hidden = !ps.length;
}
/* だれにわたすかをえらぶ */
function openPartAssign() {
  if (!partDraw || partDraw.pts.length < 3) { toast('地図を3か所以上タップして、範囲を囲んでください'); return; }
  const t = terrById(partDraw.tid), po = partObj(partDraw); if (!t || !po) return;
  const poly = partDraw.pts.slice();
  const taken = new Set();
  partsOf(po).forEach(p => (p.uids || []).forEach(u => taken.add(u)));
  const allU = isAllUse(po); // 全体の集まり：今日回る人を先に出す
  const gm = allU ? helpersOf(po).map(h => userById(h.uid)).filter(u => u && !u.inactive && u.id !== me().id)
    : po.group ? groupMembers(po.group).filter(u => u.id !== me().id) : [];
  const others = D().users.filter(u => !u.inactive && u.id !== me().id && !gm.some(g => g.id === u.id));
  const row = u => `<label class="check${taken.has(u.id) ? ' dimmed' : ''}" data-name="${esc(u.name)}"><input type="checkbox" data-pu="${esc(u.id)}">${esc(u.name)}${taken.has(u.id) ? '<span class="muted">（ほかの範囲に入っています）</span>' : ''}</label>`;
  const pc = partContents(t, poly, partDraw.cid ? po.keys : null), n = pc.total;
  setSheet(headHtml(t, 'この範囲をわたす人', `家・部屋 ${n}か所　今日の終わりまで`) + `
    ${partContentsHtml(pc)}
    <p class="hint">ふつうは2人1組です。えらんだ人の画面に、この範囲が今日だけ出ます。</p>
    <label class="field"><span>名前でさがす</span><input type="text" id="puQ" placeholder="名前の一部を入れる" autocomplete="off"></label>
    <div id="puList">
      ${gm.length ? `<div class="hgrp"><b>${allU ? '今日回る人' : `${esc(po.group)}グループ`}</b></div>${gm.map(row).join('')}` : ''}
      ${others.length ? `<div class="hgrp"><b>ほかの人</b></div>${others.map(row).join('')}` : ''}
    </div>
    <button class="btn primary block" id="puSave">この範囲をわたす</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#puQ').oninput = e => {
    const q = e.target.value.trim();
    $$('#puList [data-name]').forEach(l => { l.hidden = !!q && !l.dataset.name.includes(q); });
  };
  $('#puSave').onclick = () => {
    const uids = $$('#puList input:checked').map(x => x.dataset.pu);
    if (!uids.length) { toast('わたす人をえらんでください'); return; }
    if (uids.length > 6) { toast('1つの範囲は6人までです'); return; }
    const now = new Date().toISOString(), until = endOfToday();
    closeSheet();
    commit(`${uids.map(u => uname(u)).join('・')}さんに範囲をわたしました（今日まで）`, () => {
      const t2 = partObj(partDraw);
      // 同じ人が前の範囲にも入っていたら、そちらからは外す（人がいなくなった範囲は消す）
      const rest = partsOf(t2)
        .map(x => Object.assign({}, x, { uids: (x.uids || []).filter(u => !uids.includes(u)) }))
        .filter(x => x.uids.length);
      t2.parts = rest.concat([{ id: 'p' + uid(), poly, uids, by: me().id, at: now, until }]);
      // 記録できるように「今日回る人」にも入れる
      const cur = partDraw.cid ? cardHelpers(t2) : helpersOf(t2), have = new Set(cur.map(h => h.uid));
      t2.helpers = cur.concat(uids.filter(u => !have.has(u)).map(u => ({ uid: u, until, by: me().id, at: now })));
    });
    partDraw.pts = [];
    renderPartDraw();
    renderHouses();
  };
}
/* わたした範囲をやめる */
function openPartList(tid, cid) {
  const t0 = terrById(tid), t = cid ? D().awayCards.find(x => x.id === cid) : t0; if (!t0 || !t) return;
  const ps = partsOf(t);
  setSheet(headHtml(t0, '今日わたした範囲', `${ps.length}件　今日の終わりまで`) + `
    ${ps.length ? ps.map(p => `<div class="setrow"><div><b>${esc(partName(p))}</b><br><small class="muted">${esc(partContentsText(partContents(t0, p.poly, cid ? t.keys : null)) || '家の印なし')}</small></div>
      <button class="btn small danger" data-pdel="${esc(p.id)}">取り消す</button></div>`).join('')
      : '<div class="empty">まだありません。</div>'}
    <button class="btn primary block" id="plAdd">${partDraw && partDraw.tid === tid && partDraw.cid === cid ? '地図にもどって続けて分ける' : '＋ 地図で範囲を分ける'}</button>
    <button class="btn block" data-close>閉じる</button>`);
  $$('[data-pdel]', $('#sheet')).forEach(b => b.onclick = async () => {
    const id = b.dataset.pdel, p = partsOf(t).find(x => x.id === id);
    if (!p || !await ask(`${partName(p)}の範囲を取り消します。よろしいですか？`)) return;
    commit('範囲を取り消しました', () => { t.parts = partsOf(t).filter(x => x.id !== id); });
    if (partDraw) { renderPartDraw(); renderTerrs(); renderHouses(); }
    openPartList(tid, cid);
  });
  $('#plAdd').onclick = () => { closeSheet(); if (!partDraw || partDraw.tid !== tid || partDraw.cid !== cid) { if (cid) startCardSplit(cid); else startPartSplit(tid); } };
}
/* ---------- 家・部屋の記録 ---------- */
function openTarget(hid, unit, fromBuilding, review) {
  const h = houseById(hid); if (!h) return;
  const t = terrById(h.terrId), k = K(hid, unit);
  const st = { step: review ? 'review' : 'result', age: null, interest: null, override: false, detail: !!review };
  const title = targetName(h, unit);
  const sub = t ? `区域${t.no}　${esc(t.name)}` : '区域の線の外';

  const paint = () => {
    const vs = visitsOf(k), dnc = D().dnc[k];
    const f = fol(k), rel = relOf(k);
    const mine = !!f && f.by === me().id, other = !!f && !mine;
    // ほかの人の再訪問の家は、係が決めた日数のあいだだけ訪問を控える
    const blocked = (dnc && !isAdmin()) || (other && !isAdmin() && !st.override && recentMet(k));
    let b = headHtml(t, title, sub);
    if (fromBuilding) b += `<button class="btn small" id="backBld">← 建物の編集にもどる</button>`;
    if (dnc) b += `<div class="notice refnote"><b>拒否の${unit ? '部屋' : '家'}です。</b>訪問しないでください。${isAdmin() && dnc.a ? `<br><small>住所：<span data-notr>${esc(dnc.a)}</span>${dnc.auto ? '（住所から自動でつないだ家です）' : ''}</small>` : ''}${isAdmin() ? '<span class="actions"><button class="btn small" id="unDnc">拒否マークを外す</button></span>' : '<br>まちがいのときは区域係に相談してください。'}</div>`;
    if (h.ban) b += banNotice(h);
    if (unit) b += bldMemoHtml(h);
    if (window.chuiNotice) b += window.chuiNotice(h, unit); // 注意（！）。特別区域で回る家のお知らせも、ここに続けて出す（tokubetsu.js）
    if (!dnc && other) b += `<div class="notice warn"><b>ほかの人が再訪問している${unit ? '部屋' : '家'}です。</b>${recentMet(k) ? '最近会えているので、訪問は控えてください。' : 'しばらく会えていないので、訪ねてもかまいません。'}${blocked ? '<span class="actions"><button class="btn small" id="shOverride">それでも記録する</button></span>' : ''}</div>`;


    if (!blocked) {
      if (st.step === 'result') {
        b += recentOtherHtml(k);
        b += `<p class="q">訪問の結果を選んでください</p>` + resultChoicesHtml('');
      } else if (st.step === 'age') {
        b += ageChoicesHtml();
      } else if (st.step === 'interest') {
        b += interestChoicesHtml();
      } else if (st.step === 'follow') {
        b += followAskHtml();
      } else if (st.step === 'memo') {
        b += memoStepHtml(k);
      } else if (st.step === 'dnc') {
        b += refuseStepHtml(!!unit);
      }
    }

    if (h.prov) b += houseHasRec(h)
      // 記録・拒否・注意・再訪問のある仮の家は、ここでは消せない（H8。係以外はサーバーも止める）
      ? `<div class="notice warn"><b>この家は、地図のデータから自動で入れた「仮の家」です。</b>この家には、訪問の記録・拒否・注意・再訪問のどれかがあるため、ここでは消せません。家ではないときは、区域係に削除を申請してください。
        <span class="actions"><button class="btn small" id="provAsk">${isAdmin() ? 'この家を削除する' : 'この家の削除を申請する'}</button></span></div>`
      : `<div class="notice warn"><b>この家は、地図のデータから自動で入れた「仮の家」です。</b>ほんとうに家があるか確かめてください。記録をつけると、ふつうの家になります。
      <span class="actions"><button class="btn small danger" id="provDrop">ここは家ではない（消す）</button></span></div>`;
    if (recentMet(k)) b += `<div class="notice info"><b>最近（${daysSince(sum(k).met.at)}日前）会えた家です。</b>区域を回るときは、とばしてかまいません。</div>`;
    if (isUnmet(k) && UI.cSlot !== 'off') b += `<div class="notice info">これまで留守だった時間帯：${slotList(triedSlots(k)).map(slotShort).join('、')}<br>ほかの時間帯に訪ねてみてください。</div>`;
    const hasDetail = featFollow() && vs.some(v => seeV(v, k) && (v.age || v.interest));
    b += `<h3 class="sub">これまでの記録${hasDetail ? ` <button class="btn small" id="shDetail">${st.detail ? 'くわしい表示を閉じる' : 'くわしく表示'}</button>` : ''}</h3>`;
    b += vs.length
      ? `<ul class="history">${vs.slice(0, st.step === 'review' ? 10 : 5).map(v => {
          const d = new Date(v.at);
          const sv = seeV(v, k);
          const extra = !sv ? '' : st.detail
            ? (v.result === 'met' ? `（${esc(ageName(v.age))}・${esc(intName(v.interest))}）` : (v.result === 'refused' && v.age ? `（${esc(ageName(v.age))}）` : ''))
            : (featFollow() && v.result === 'met' && INTERESTED.has(v.interest) ? ' ★' : '');
          const mine2 = window.canFixVisit ? window.canFixVisit(v) : (v.by === me().id || isAdmin()); // 直せる記録だけスワイプで取り消せる（naoshi.js）
          const row = `<li class="vrow${mine2 ? ' swipe-body' : ''}"><i class="pin st-${v.result}">${ST_CHAR[v.result]}</i><span>${fmtDate(v.at)}　${slotOf(d)}<br>${RESULT_LABEL[v.result]}${extra}</span></li>`;
          // 自分でつけた記録は、左にスワイプすると取り消せる
          return mine2
            ? `<div class="swipe"><div class="swipe-acts"><button class="del" data-vdel="${esc(v.id)}">取り消し</button></div>${row}</div>`
            : row;
        }).join('')}</ul>${vs.length > (st.step === 'review' ? 10 : 5) ? `<p class="muted">ほか ${vs.length - (st.step === 'review' ? 10 : 5)}件</p>` : ''}`
      : '<p class="muted">まだ記録はありません。</p>';
    if (vs.some(v => (window.canFixVisit ? window.canFixVisit(v) : (v.by === me().id || isAdmin())))) b += '<p class="hint">記録を<b>左にスワイプ</b>すると、取り消せます（その日のうち）。</p>';
    if (st.step === 'review' && !blocked) b += `<button class="btn primary block review-rec" id="shRecord">訪問の結果を記録する</button>`;

    b += navLink(h);
    if (unit) {
      b += `<details class="more"${st.editOpen || (st.mk && st.mk.kind) ? ' open' : ''}><summary>この部屋の編集</summary>
        ${window.chuiMark ? window.chuiMark.html(k, st.mk || (st.mk = {})) + '<button class="btn block" id="mkSave">この部屋の印を保存する</button>' : ''}
        <p class="q">種別</p>${kindChips(unitKind(h, unit))}
        <p class="q">部屋の名前</p><button class="btn block" id="fRename">部屋の名前を直す（101→A-1 など）</button></details>`;
    }
    if (!unit) {
      const hk = kindOf(h);
      b += `<button class="btn block" id="fEditHouse">この家を編集</button>`;
    }
    setSheet(b);

    const S = $('#sheet');
    $$('[data-res]', S).forEach(x => x.onclick = () => {
      const r = x.dataset.res;
      const save = (res, ex) => saveVisit(hid, unit, res, ex);
      if (r === 'met') { if (metNext(st, k, save)) paint(); }
      else if (r === 'refused') { st.step = 'dnc'; paint(); }
      else saveVisit(hid, unit, 'away', {});
    });
    $$('[data-age]', S).forEach(x => x.onclick = () => {
      st.age = x.dataset.age;
      if (metNext(st, k, (res, ex) => saveVisit(hid, unit, res, ex))) paint();
    });
    $$('[data-int]', S).forEach(x => x.onclick = () => {
      const it = x.dataset.int;
      if (it === '拒否') { st.step = 'dnc'; paint(); }
      else if (INTERESTED.has(it) && !fol(k)) { st.interest = it; st.step = 'follow'; paint(); }
      else saveVisit(hid, unit, 'met', { age: st.age, interest: it });
    });
    $$('[data-fol]', S).forEach(x => x.onclick = () => {
      if (x.dataset.fol === '1') { st.step = 'memo'; paint(); } else saveVisit(hid, unit, 'met', {});
    });
    $$('[data-memosave]', S).forEach(x => x.onclick = () => saveFollowVisit(hid, unit, $('#stepMemo').value, false, readNext('stepNext')));
    $$('[data-refok]', S).forEach(x => x.onclick = () => saveVisit(hid, unit, 'refused', { age: st.age, dnc: true }));
    $$('[data-back]', S).forEach(x => x.onclick = () => { st.step = x.dataset.back; paint(); });
    const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    on('backBld', () => openBuilding(hid, unit));
    on('unDnc', () => { commitIn([hid], '拒否マークを外しました', () => { delete D().dnc[k]; }); paint(); });
    on('shRelease', async () => { await followAction('release', k); paint(); });
    on('shStop', () => openReleaseSheet(k, false));
    on('shMemo', () => openMemo(k, paint));
    on('shRecord', () => { st.step = 'result'; st.detail = false; paint(); });
    $$('[data-share]', S).forEach(x => x.onclick = () => shareMemo(k, x.dataset.share, paint));
    on('shOverride', () => { st.override = true; paint(); });
    on('shDetail', () => { st.detail = !st.detail; paint(); });
    on('shTake', () => { followAction('take', k); paint(); });
    if ($('#shAssign')) $('#shAssign').onchange = e => {
      const v = e.target.value;
      if (!v || v === f.by) return;
      commitIn([hid], `受け持ちを${uname(v)}さんに変えました`, () => startFollow(k, v));
      paint();
    };
    on('provDrop', () => dropProvHouse(hid));
    on('provAsk', async () => { // H8：記録・印のある仮の家（係は確かめて削除・係以外は申請）
      const h2 = houseById(hid); if (!h2) return;
      if (!isAdmin()) { closeSheet(); openDelRequest(h2); return; }
      if (!await ask(`この家と、その記録をすべて削除します。${houseRecText(h2)}よろしいですか？`)) return;
      closeSheet(); deleteHouse(hid);
    });
    on('fEditHouse', () => openAddForm(null, null, hid));
    on('fMove', () => startMoveHouse(hid));
    on('fHNameSave', () => {
      const v = $('#fHName').value.trim();
      commitIn([hid], v ? `名前を「${v}」にしました` : '名前を消しました', () => { const h2 = houseById(hid); if (h2) h2.label = v; });
      st.editOpen = true; paint();
    });
    on('fRename', () => openUnitNames(hid, () => openTarget(hid, unit, fromBuilding))); // まちがえたら、下の「取り消す」でもどせる
    if (unit && window.chuiMark) { // この部屋の印（なし・！注意・拒否。chui.js）
      window.chuiMark.bind(S, st.mk || (st.mk = {}), () => paint());
      on('mkSave', () => {
        window.chuiMark.keep(st.mk);
        const mk = st.mk;
        if (!window.chuiMark.changed(k, mk)) { toast('変わったところはありません'); return; }
        commitIn([hid], window.chuiMark.msg(mk), () => { const h2 = houseById(hid); if (h2) window.chuiMark.apply(h2, unit, mk); });
        st.mk = {}; paint();
      });
    }
    $$('[data-vdel]', S).forEach(x => x.onclick = async () => {
      const v = D().visits.find(y => y.id === x.dataset.vdel);
      if (!v) return;
      if (!await ask(`${fmtDate(v.at)}の「${RESULT_LABEL[v.result]}」の記録を取り消します。よろしいですか？`)) return;
      deleteVisit(v, paint);
    });
    $$('[data-kind]', S).forEach(x => x.onclick = () => {
      st.editOpen = true; // 種別をえらんだあとも、名前を入れられるように開いたままにする
      if (unit) setUnitKind(hid, unit, x.dataset.kind, paint);
      else setHouseKind(hid, x.dataset.kind, paint);
    });
    on('fDel', async () => {
      if (!isAdmin()) { closeSheet(); openDelRequest(h); return; }
      if (!await ask(`この家と、その記録をすべて削除します。${houseRecText(houseById(hid))}よろしいですか？`)) return;
      closeSheet(); deleteHouse(hid);
    });
  };
  paint();
}
/* 記録をすぐ画面に出して、送信はうしろで行う（続けて記録しても、印がすぐ変わる） */
function quickVisit(hid, unit, result, extra, msg, onUndo, keepOpen) {
  const now = new Date().toISOString();
  const v = { id: uid(), houseId: hid, unit, result, at: now, by: me().id }; { const rs = recoSrc(hid, unit); if (rs) v.src = rs; }
  if (result === 'met' || result === 'refused') { if (extra.age) v.age = extra.age; }
  if (result === 'met' && extra.interest) v.interest = extra.interest;
  D().visits.push(v);
  idxAddVisit(v);
  Store.pushVisit(v, false);
  confirmProv(hid); // 仮の家は、記録がついた時点で「ある家」になる
  if (map && currentView === 'map') renderHouses();
  if (currentView === 'cards') renderCards();
  const undo = () => {
    closeSheet();
    if (onUndo) onUndo();
    D().visits = D().visits.filter(x => x.id !== v.id);
    idxDelVisit(v);
    Store.pushVisit(v, true);
    renderAll();
    toast('取り消しました');
  };
  // 地図で記録したときは、「取り消す」と「次のおすすめの家」を下に出す（アパートを続けて入力しているときは出さない）
  if (!keepOpen && map && currentView === 'map' && mode === 'normal' && showNextPanel(hid, unit, result, undo)) return;
  toast(msg, undo);
}

/* ---------- 記録のあと：「取り消す」と「次のおすすめの家」 ----------
   地図で「会えた」「留守」を押したあと、下に出す。
   ・取り消しは15秒のあいだ押せる
   ・次の家：留守宅カードならそのカードのまだの家、自分の区域なら「おすすめ順」の家（進み具合の表示ならまだの家）から、
     いま記録した家にいちばん近い家をえらぶ。「とばす」で次の候補に進む */
const NEXT_UNDO_SEC = 15;
let nextState = null, nextTick = null;
function nextCandidates(fromHid) {
  const from = houseById(fromHid);
  const skip = nextState ? nextState.skip : new Set();
  const seen = new Set(), out = [];
  const add = (h, why) => { if (!h || h.id === fromHid || seen.has(h.id) || skip.has(h.id)) return; seen.add(h.id); out.push({ h, why }); };
  const c = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (c) c.keys.filter(k => !visitedSince(k, c.at) && !D().dnc[k]).forEach(k => add(houseById(parseKey(k)[0]), 'この留守宅カードの家'));
  else if (roundTerr) {
    const r = roundInfo(roundTerr);
    if (r && roundMode() === 'reco') roundPlan(r).forEach(sp => add(sp.h, sp.reasons[0] || 'おすすめの家'));
    else if (r) r.items.forEach(x => add(x.h, 'まだ訪ねていない家'));
  }
  const pos = from ? [from.lat, from.lng] : myPos;
  if (pos) { out.forEach(x => { x.dist = distM(pos, [x.h.lat, x.h.lng]); }); out.sort((a, b) => a.dist - b.dist); }
  return out;
}
function showNextPanel(hid, unit, result, undo) {
  if (!focusCard && !roundTerr) return false; // 区域を回っていないときは、ふつうのお知らせ
  { // 回る範囲を分けた区域では出さない（区域全体からえらぶので、ほかの組の範囲の家を案内してしまうため）
    const h0 = houseById(hid), t0 = h0 && h0.terrId ? terrById(h0.terrId) : null;
    if (t0 && partsOf(t0).length) return false;
  }
  clearInterval(nextTick);
  const h = houseById(hid);
  nextState = { hid, unit, result, undo, until: Date.now() + NEXT_UNDO_SEC * 1000, skip: new Set(), name: h ? targetName(h, unit) : '' };
  $('#toast').hidden = true;
  paintNextPanel();
  nextTick = setInterval(() => {
    if (!nextState || $('#nextPanel').hidden) { clearInterval(nextTick); return; }
    const left = Math.ceil((nextState.until - Date.now()) / 1000);
    const bar = $('#npBar'), lb = $('#npLeft');
    if (left <= 0) { clearInterval(nextTick); paintNextPanel(); return; }
    if (bar) bar.style.width = (left / NEXT_UNDO_SEC * 100) + '%';
    if (lb) lb.textContent = `取り消せるのは あと${left}秒`;
  }, 1000);
  return true;
}
function hideNextPanel() {
  clearInterval(nextTick);
  nextState = null;
  const p = $('#nextPanel'); if (p) { p.hidden = true; p.innerHTML = ''; }
}
function paintNextPanel() {
  const st = nextState, el = $('#nextPanel');
  if (!st || !el) return;
  const left = Math.ceil((st.until - Date.now()) / 1000), canUndo = left > 0;
  const nx = nextCandidates(st.hid)[0];
  const num = nx && roundNums ? roundNums.get(nx.h.id) : null;
  const okIcon = SVG('<path d="M4 12.5l4.5 4.5L20 6.5"/>');
  el.innerHTML = `<span class="grab" aria-hidden="true"></span>
    <div class="nprow"><span class="npok st-${st.result}">${okIcon}</span>
      <div class="npmsg"><b>「${RESULT_LABEL[st.result]}」を記録しました</b><small>${st.name}</small></div>
      ${canUndo ? '<button type="button" class="btn" id="npUndo">取り消す</button>' : ''}</div>
    ${canUndo ? `<div class="npbarrow"><div class="npbar"><i id="npBar" style="width:${left / NEXT_UNDO_SEC * 100}%"></i></div><small id="npLeft">取り消せるのは あと${left}秒</small></div>` : ''}
    <div class="npline"></div>
    ${nx ? `<p class="nplab">次のおすすめ</p>
      <div class="npnext"><span class="numbadge">${num || '→'}</span>
        <div><b>${targetName(nx.h, '')}</b><small>${nx.dist != null ? `約${fmtDist(nx.dist)}・` : ''}${esc(nx.why)}</small></div></div>
      <div class="npbtns"><button type="button" class="btn primary" id="npGo">${num ? `${num} へ行く` : 'そこへ行く'}</button>
        <button type="button" class="btn" id="npSkip">とばす</button>
        <button type="button" class="btn npclose" id="npClose">閉じる</button></div>`
      : `<p class="okmsg"><b>このあたりのおすすめの家は、ぜんぶ回りました。</b></p>
      <div class="npbtns"><button type="button" class="btn npclose" id="npClose">閉じる</button></div>`}`;
  el.hidden = false;
  // ボタン以外のところ（文字など）をさわると、枠を閉じる
  el.onclick = e => { if (e.target.closest('button, a, input, select, label')) return; hideNextPanel(); };
  if ($('#npUndo')) $('#npUndo').onclick = () => { const u = st.undo; hideNextPanel(); u(); };
  if ($('#npClose')) $('#npClose').onclick = hideNextPanel;
  if ($('#npSkip')) $('#npSkip').onclick = () => { st.skip.add(nx.h.id); paintNextPanel(); };
  if ($('#npGo')) $('#npGo').onclick = () => {
    const h = nx.h;
    hideNextPanel();
    clearTarget();
    target = { hid: h.id, unit: '' };
    let shown = false;
    const show = () => { if (shown) return; shown = true; renderHouses(); showTargetMarker(h); };
    map.once('moveend', show);
    map.flyTo([h.lat, h.lng], Math.max(map.getZoom(), 18), { duration: 0.7 });
    setTimeout(show, 1200);
  };
}
/* 取り込んだ「仮の家」：記録をつけたら、ふつうの家にする */
function confirmProv(hid) {
  const h = houseById(hid);
  if (!h || !h.prov) return;
  delete h.prov;
  Store.pushHouse(h, false);
}
/* その家の、訪問の記録・拒否・注意・再訪問の受け持ち・引き継ぎの印の数（どの部屋でも。集合住宅は建物ぜんたい '' も。H8・2026-10-29）
   引き継ぎの印は、サーバーと同じく「印があれば」数える（relOf は使わない） */
function houseRecCounts(h) {
  const c = { v: 0, dnc: 0, cau: 0, fol: 0, rel: 0 };
  if (!h) return c;
  const cau = D().caution || {};
  targets(h).concat(h.type === 'apt' ? [''] : []).forEach(u => {
    const k = K(h.id, u);
    c.v += sum(k).n;
    if (D().dnc[k]) c.dnc++;
    if (cau[k]) c.cau++;
    if (D().follows[k]) c.fol++;
    if (D().released[k]) c.rel++;
  });
  return c;
}
/* 記録・印のある家か（係以外は消せない。サーバーも止める） */
const houseHasRec = h => { const c = houseRecCounts(h); return !!(c.v || c.dnc || c.cau || c.fol || c.rel); };
/* 区域係が家を消すときの確認に添える文（何が一緒に消えるか） */
function houseRecText(h) {
  const c = houseRecCounts(h);
  if (!c.v && !c.dnc && !c.cau && !c.fol && !c.rel) return '';
  // 文の形はいつも同じにする（スペイン語の辞書で1つの形で訳せるように）
  return `一緒に消えるもの：訪問の記録 ${c.v}件、拒否 ${c.dnc}件、注意 ${c.cau}件、再訪問の受け持ち ${c.fol + c.rel}件。${c.dnc ? '拒否は、場所だけの印として残します。' : ''}`;
}
/* 仮の家を、その場で消す（地図に出ているだけで、実際には家がないとき） */
function dropProvHouse(hid, inMode) {
  const h = houseById(hid);
  if (!h || !h.prov) return;
  if (houseHasRec(h)) { toast('記録や拒否・注意・再訪問のある家は、ここでは消せません。家ではないときは、区域係に削除を申請してください'); return; } // H8
  const copy = clone(h);
  deleteHouseData(hid);
  Store.pushHouse(copy, true);
  if (!inMode) closeSheet();
  buildIndex();
  renderHouses();
  toast(inMode ? '消しました（続けて押すと、どんどん消せます）' : 'この家を消しました', () => {
    D().houses.push(copy);
    Store.pushHouse(copy, false);
    if (inMode && delCount > 0) { delCount--; updateAddBar(); }
    buildIndex(); renderHouses();
    toast('もどしました');
  });
}
/* 記録を消す（自分の記録だけ） */
function deleteVisit(v, after) {
  if (v.by !== me().id && !isAdmin()) { toast('自分でつけた記録だけ取り消せます'); return; }
  D().visits = D().visits.filter(x => x.id !== v.id);
  idxDelVisit(v);
  Store.pushVisit(v, true);
  renderAll();
  toast('記録を取り消しました', () => {
    D().visits.push(v);
    idxAddVisit(v);
    Store.pushVisit(v, false);
    renderAll();
    toast('もどしました');
    if (after) after();
  });
  if (after) after();
}
function saveVisit(hid, unit, result, extra, keepOpen, onUndo) {
  if (!keepOpen) closeSheet();
  const k = K(hid, unit), cur = fol(k);
  let msg = `${unit ? `${unitTitle(houseById(hid), unit)}を` : ''}「${RESULT_LABEL[result]}」で記録しました`;
  let follow = !!extra.follow;
  if (follow && cur) { follow = false; if (cur.by !== me().id) msg += '（再訪問はすでに受け持ちがあります）'; }
  else if (follow) msg += '。再訪問のタブに入れました';
  if (extra.dnc && cur) msg += '。受け持ちも解除しました';
  // ふつうの記録（会えた・留守）は、すぐ画面に出して、うしろで送る
  if (!follow && !extra.dnc && !(cur && cur.by === me().id)) { quickVisit(hid, unit, result, extra, msg, onUndo, keepOpen); return; }
  commit(msg, () => {
    const now = new Date().toISOString();
    const v = { id: uid(), houseId: hid, unit, result, at: now, by: me().id }; { const rs = recoSrc(hid, unit); if (rs) v.src = rs; }
    if (result === 'met') { // 記録しない設定の項目は、そもそも持たせない
      if (extra.age) v.age = extra.age;
      if (extra.interest) v.interest = extra.interest;
    } else if (result === 'refused' && extra.age) v.age = extra.age;
    D().visits.push(v);
    const f = D().follows[k];
    if (f && f.by === me().id) f.touchedAt = now; // 受け持ち本人の記録で期限を延ばす
    if (follow) startFollow(k, me().id);
    if (extra.dnc) { D().dnc[k] = D().dnc[k] || true; delete D().follows[k]; delete D().released[k]; } // 係が入れた住所は残す
    const hp = houseById(hid); if (hp && hp.prov) delete hp.prov; // 拒否・再訪問つきの記録でも、仮の家は「ある家」になる（H8。会えた・留守と同じ）
  }, onUndo);
}
/* かんたんモードでは、家の追加・削除をさせない（ボタンを隠すだけでなく、処理でも止める） */
const isSimple = () => UI.mode !== 'detail';
function simpleBlock(what) {
  if (!isSimple()) return false;
  toast(`かんたんモードでは${what}できません。歯車の「くわしく」で使えます`);
  return true;
}
function deleteHouse(hid) {
  if (simpleBlock('家を削除')) return;
  if (!isAdmin()) { const h = houseById(hid); if (h) openDelRequest(h); return; } // 伝道者は申請だけ（区域係が確認して消す）
  commit('削除しました', () => deleteHouseData(hid));
}
function deleteHouseData(hid) {
  const h = houseById(hid);
  if (h) targets(h).concat(h.type === 'apt' ? [''] : []).forEach(u => dncDrop(K(hid, u), h, true)); // 拒否は、場所だけの拒否として残す（住所のない拒否も・係だけ。H8・D5）
  D().houses = D().houses.filter(x => x.id !== hid);
  D().visits = D().visits.filter(v => v.houseId !== hid);
  if (h) targets(h).forEach(u => { const k = K(hid, u); delete D().follows[k]; delete D().released[k]; });
}
/* ---------- 家の削除の申請（伝道者 → 区域係が確認して消す） ---------- */
const delReqs = () => D().requests.filter(r => r.type === 'delHouse' && r.status === 'pending');
const delReqOf = hid => D().requests.find(r => r.type === 'delHouse' && r.houseId === hid && r.status === 'pending');
function openDelRequest(h) {
  if (simpleBlock('家を消すことは')) return;
  if (delReqOf(h.id)) { toast('この家は、すでに削除を申請しています'); return; }
  const t = terrById(h.terrId);
  const name = h.type === 'apt' ? `${esc(h.label || '集合住宅')}（${h.units.length}部屋）` : esc(h.label || 'この家');
  setSheet(headHtml(t, '家の削除を申請する', name) + `
    <div class="notice info">家は、区域係が確認してから消します。申請すると、係の画面に<b>あなたの名前</b>と、この家が表示され、係から確認の連絡が来ることがあります。</div>
    <p class="q">消したい理由をえらんでください</p>
    <div class="choices two">
      <button class="choice" data-dr="まちがえて作った">まちがえて作った</button>
      <button class="choice" data-dr="同じ家が2つある">同じ家が2つある</button>
      <button class="choice" data-dr="家がなくなった">家がなくなった<small>取りこわし・空き地など</small></button>
      <button class="choice" data-dr="その他">その他<small>係に直接伝えます</small></button>
    </div>
    <button class="btn block" data-close>やめる</button>`);
  $$('[data-dr]', $('#sheet')).forEach(b => b.onclick = () => {
    const reason = b.dataset.dr;
    closeSheet();
    commit('区域係に、この家の削除を申請しました（係が確認してから消えます）', () => {
      D().requests.push({ id: 'r' + uid(), by: me().id, type: 'delHouse', houseId: h.id, terrId: h.terrId || null,
        label: h.label || '', reason, at: new Date().toISOString(), status: 'pending' });
    });
  });
}
async function approveDel(id) {
  const r = D().requests.find(x => x.id === id); if (!r) return;
  const h = houseById(r.houseId);
  const name = h ? (h.type === 'apt' ? `${h.label || '集合住宅'}（${h.units.length}部屋）` : (h.label || '家')) : '';
  if (h && !await ask(`${uname(r.by)}さんの申請で「${name}」を消します。${(typeof houseRecText === 'function' && houseRecText(h)) || ''}よろしいですか？`)) return; // 件数つき（H8）
  commit(h ? `「${name}」を削除しました` : '申請を閉じました', () => {
    if (h) deleteHouseData(h.id);
    Object.assign(r, { status: 'approved', decidedAt: new Date().toISOString(), seen: false });
  });
}
async function declineDel(id) {
  const r = D().requests.find(x => x.id === id); if (!r) return;
  if (!await ask(`${uname(r.by)}さんの削除の申請を見送ります。よろしいですか？`)) return;
  commit('削除の申請を見送りました', () => {
    Object.assign(r, { status: 'declined', decidedAt: new Date().toISOString(), seen: false });
  });
}

/* ---------- 再訪問のメモ ----------
   ・受け持っている本人のスマホの中（localStorage）に保存する
   ・会衆の設定（memoSync）が「使う」のときは、端末の中で暗号化して、同じ人のほかの端末とも合わせる（下の MemoSync）
   ・受け持ちが終わった家のメモは自動で消す。「この端末から消す」や、長く通信がないときも消す */
const MEMO_PREFIX = 'kuiki_memo_';
const memoKey = () => MEMO_PREFIX + me().id;
function memoAll() { try { return JSON.parse(lsGet(memoKey()) || '{}') || {}; } catch (e) { return {}; } }
function memoSaveRaw(o) {
  if (!Object.keys(o).length) { lsDel(memoKey()); return true; }
  return lsSet(memoKey(), JSON.stringify(o));
}
function memoSaveAll(o) { const r = memoSaveRaw(o); if (onMemoVer) MemoSync.soon(); return r; }
const memoOf = k => memoAll()[k] || null;
/* 受け持ちが外れてから、このスマホのメモを消すまでの猶予（サーバーと同じ10分）。
   すぐ消すと、「取り消す」で受け持ちを戻しても、メモだけは戻らなかった（このスマホだけに保存しているときは、二度と戻らない）。
   また、サーバーに受け付けられなかった受け持ちでも、書いたばかりのメモがその場で消えていた */
const MEMO_GRACE_MS = 10 * 60000;
const memoLostKey = () => MEMO_PREFIX + 'lost_' + me().id; // 名前が kuiki_memo_ で始まるので、端末の情報を消すときに一緒に消える
function purgeMemos() {
  const o = memoAll(), p = pinsAll(), now = Date.now(), gone = [];
  let lost = {};
  try { lost = JSON.parse(lsGet(memoLostKey()) || '{}') || {}; } catch (e) { lost = {}; }
  let lc = false, oc = false, pc = false;
  // 消してよいか：受け持ちが外れてから猶予がたった家だけ（受け持ちにもどったら、外れた時刻を忘れる）
  const expired = k => {
    const f = fol(k);
    if (f && f.by === me().id) { if (lost[k]) { delete lost[k]; lc = true; } return false; }
    if (!lost[k]) { lost[k] = now; lc = true; return false; }
    return now - lost[k] >= MEMO_GRACE_MS;
  };
  Object.keys(o).forEach(k => { if (expired(k)) { delete o[k]; oc = true; gone.push(k); } });
  [...p].forEach(k => { if (expired(k)) { p.delete(k); pc = true; if (gone.indexOf(k) < 0) gone.push(k); } });
  // 消し終えた家・メモもピンもない家の「外れた時刻」は、もういらない
  Object.keys(lost).forEach(k => { if (!(k in o) && !p.has(k)) { delete lost[k]; lc = true; } });
  if (oc) memoSaveRaw(o);
  if (pc) pinsSaveRaw(p);
  if (lc) { if (Object.keys(lost).length) lsSet(memoLostKey(), JSON.stringify(lost)); else lsDel(memoLostKey()); }
  // 受け持ちが終わった家は、ほかの端末と合わせる記録からも外す（サーバーのメモは、サーバーが消す）
  if (gone.length) MemoSync.forget(gone);
}
/* メモ・ピン留めを消す（住んでいる人に関わる記録）。
   withMine のときは、奉仕時間・自分の予定（本人だけの記録）も消す（「この端末から消す」のとき） */
function clearAllMemos(withMine) {
  const pre = [MEMO_PREFIX, 'kuiki_pins_', 'kuiki_gpins_', MSYNC_PREFIX, MKEY_PREFIX].concat(withMine ? ['kuiki_my_'] : []);
  if (typeof MemoSync === 'object') MemoSync.key = null;
  IDB.del('bkgens').catch(() => {}); // このスマホの中に残した、再訪問のバックアップ
  try {
    Object.keys(localStorage).forEach(x => {
      const y = NS ? (x.indexOf(NS + '::') === 0 ? x.slice(NS.length + 2) : null) : (x.indexOf('::') < 0 ? x : null);
      if (y && pre.some(p => y.indexOf(p) === 0)) localStorage.removeItem(x);
    });
  } catch (e) { /* 何もしない */ }
}
/* ---------- 再訪問メモを、同じ人のほかの端末（iPadなど）と合わせる ----------
   ・メモ・次の約束・📌を、家ごとに、この端末の中で暗号化（AES-GCM）してからサーバーへ送る。
     サーバー・係の画面・シートには、読めない文字列しか残らない
   ・鍵は本人ごとに1つ。サーバーが、その人の承認済みの端末にだけ渡す（端末には kuiki_mkey_ として置く）
   ・端末に置く「前回合わせたときの様子」（kuiki_msync_）：
       since＝サーバーの時刻、rows＝家ごとの { v 版, h 中身の印, del 消した }、checked＝全部を確かめた受け持ち
   ・両方の端末で書きかえたときは、新しいほうを上にして、もう一方も「別の端末で書いた内容」として下に残す（消さない）
   ・会衆の設定（memoSync）が「使わない」のとき・古いサーバーのときは、これまでどおり、このスマホの中だけ
   ・送っていない記録（受け持ちなど）を送り終えてから合わせる（サーバーが受け持ちを知ってから、メモが届くように） */
const MSYNC_PREFIX = 'kuiki_msync_', MKEY_PREFIX = 'kuiki_mkey_';
const memoSyncOn = () => LIVE && !!(Store.data && Store.data.settings) && Store.data.settings.memoSync !== 0 &&
  !!(window.crypto && window.crypto.subtle && window.TextEncoder && window.TextDecoder);
const memoScope = () => (memoSyncOn() ? '本人の端末だけ' : 'このスマホだけ');
const memoPrivacyNote = () => (memoSyncOn()
  ? 'メモは暗号化して保管され、同じ人のほかの端末（iPadなど）でも見られます。係の画面やシートでは見られません。'
  : 'メモはこのスマホの中だけに保存され、係やほかの人には送られません。');
/* 2つのメモを、どちらも消さずに合わせる（a が新しいほう） */
function mergeMemoText(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!b || a === b || a.indexOf(b) >= 0) return a;
  if (!a || b.indexOf(a) >= 0) return b;
  return (a + '\n―― 別の端末で書いた内容 ――\n' + b).slice(0, 3000);
}
/* 家1件分の中身（メモ・約束・📌）。何もなければ null */
function memoPl(memos, pins, k) {
  const m = memos[k], p = pins.has(k);
  if (!m && !p) return null;
  return { t: m ? String(m.text || '') : '', at: m ? String(m.at || '') : '', n: m && m.next ? m.next : null, p: p ? 1 : 0 };
}
function memoPlHash(pl) {
  if (!pl) return '';
  const s = JSON.stringify([pl.t, pl.at, pl.n, pl.p]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '.' + s.length;
}
function memoPlApply(memos, pins, k, pl) {
  if (pl && (pl.t || pl.n)) {
    memos[k] = { text: pl.t, at: pl.at || new Date().toISOString() };
    if (pl.n) memos[k].next = pl.n;
  } else delete memos[k];
  if (pl && pl.p) pins.add(k); else pins.delete(k);
}
function memoPlMerge(a, b) {
  const an = Date.parse(a.at) || 0, bn = Date.parse(b.at) || 0;
  const nw = an >= bn ? a : b, od = nw === a ? b : a;
  return { t: mergeMemoText(nw.t, od.t), at: nw.at || od.at, n: nw.n || od.n || null, p: a.p || b.p ? 1 : 0 };
}
const mB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const mUnB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const mAad = (uid, k) => new TextEncoder().encode(uid + '|' + k); // 暗号文を、この人・この家に結びつける（入れかえ防止）
async function memoEnc(key, k, pl) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: mAad(key.uid, k) }, key.ck, new TextEncoder().encode(JSON.stringify(pl)));
  return 'v1.' + mB64(iv) + '.' + mB64(new Uint8Array(ct));
}
async function memoDec(key, k, s) {
  const p = String(s || '').split('.');
  if (p.length !== 3 || p[0] !== 'v1') throw new Error('fmt');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: mUnB64(p[1]), additionalData: mAad(key.uid, k) }, key.ck, mUnB64(p[2]));
  const o = JSON.parse(new TextDecoder().decode(pt)) || {};
  const n = o.n && /^\d{4}-\d{2}-\d{2}$/.test(String(o.n.date || '')) ? { date: String(o.n.date), time: /^\d{1,2}:\d{2}$/.test(String(o.n.time || '')) ? String(o.n.time) : '' } : null;
  return { t: String(o.t || '').slice(0, 3000), at: String(o.at || ''), n, p: o.p ? 1 : 0 };
}
const MemoSync = {
  busy: false,
  dueAt: 0,       // この時刻になったら合わせる（0＝予定なし）
  pull: false,    // 送るものがなくても、サーバーの変更を取りに行く
  seenMv: '',     // 最後に取り込んだ「メモが変わった」合図
  lastAt: 0,      // 最後に合わせた時刻
  fails: 0,
  stopUntil: 0,   // サーバーが対応していない・設定で止めているとき、しばらく聞かない
  key: null,      // { uid, kid, ck }
  editing: null,  // メモの画面で開いている家
  offDone: false,
  stKey() { return MSYNC_PREFIX + me().id; },
  load() {
    try { const o = JSON.parse(lsGet(this.stKey()) || 'null'); if (o && o.rows) { o.checked = Array.isArray(o.checked) ? o.checked : []; return o; } } catch (e) { /* 作り直す */ }
    return { since: 0, rows: {}, checked: [], kid: '' };
  },
  save(st) { lsSet(this.stKey(), JSON.stringify(st)); },
  reset() { lsDel(MSYNC_PREFIX + me().id); lsDel(MKEY_PREFIX + me().id); this.key = null; },
  soon(ms) { const t = Date.now() + (ms == null ? 2000 : ms); if (!this.dueAt || t < this.dueAt) this.dueAt = t; },
  hint(mv) { if (mv && mv !== this.seenMv) { this.pull = true; this.soon(0); } },
  wake() { this.pull = true; this.soon(1500); }, // 画面にもどったとき
  /* 受け持ちが終わった家を、合わせる記録から外す（また受け持ったら、全部を確かめ直す） */
  forget(keys) {
    if (!keys.length || !LIVE || !Store.data) return;
    const st = this.load();
    let ch = false;
    keys.forEach(k => {
      if (st.rows[k]) { delete st.rows[k]; ch = true; }
      const i = st.checked.indexOf(k);
      if (i >= 0) { st.checked.splice(i, 1); ch = true; }
    });
    if (ch) this.save(st);
  },
  /* 1.5秒ごとに呼ばれる。やることがあるときだけ動く */
  tick() {
    if (this.busy || !LIVE || !Store.data || Store.inactive || Store.authLost || document.hidden || !me()) return;
    if (!memoSyncOn()) { // 会衆の設定で止めた：合わせた記録と鍵だけ消す（スマホの中のメモは残す）
      if (!this.offDone && lsGet(MSYNC_PREFIX + me().id)) this.reset();
      this.offDone = true;
      return;
    }
    this.offDone = false;
    const now = Date.now();
    if (now < this.stopUntil) return;
    if (!this.lastAt && !this.dueAt) this.wake();                                  // 開いた直後に1回
    if (this.lastAt && now - this.lastAt > 30 * 60000) { this.pull = true; this.soon(0); } // 合図が届かなくても、30分に1回は確かめる
    if (!this.dueAt || now < this.dueAt) return;
    this.dueAt = 0;
    this.run();
  },
  async getKey(force) {
    const uid = me().id;
    if (!force && this.key && this.key.uid === uid) return this.key;
    let o = null;
    if (!force) { try { o = JSON.parse(lsGet(MKEY_PREFIX + uid) || 'null'); } catch (e) { o = null; } }
    if (!o || !/^[0-9a-f]{64}$/i.test(String(o.key || ''))) {
      const j = await api('memo_key', {});
      o = { key: String(j.key || ''), kid: String(j.kid || '') };
      if (!/^[0-9a-f]{64}$/i.test(o.key)) throw new Error('memo_key');
      lsSet(MKEY_PREFIX + uid, JSON.stringify(o));
    }
    const raw = new Uint8Array(32);
    for (let i = 0; i < 32; i++) raw[i] = parseInt(o.key.substr(i * 2, 2), 16);
    const ck = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    this.key = { uid, kid: o.kid, ck };
    return this.key;
  },
  async run() {
    this.busy = true;
    try {
      for (let round = 0; round < 3; round++) if (!await this.once()) break;
      this.fails = 0;
    } catch (e) {
      const c = e && (e.code || e.message);
      if (c === 'memo_off' || c === 'unknown_action') this.stopUntil = Date.now() + 30 * 60000; // 設定で止めている・古いサーバー
      else if (c !== 'auth') { this.fails = Math.min(6, this.fails + 1); this.soon(30000 * Math.pow(2, this.fails - 1)); }
    } finally { this.busy = false; }
  },
  /* 1回分：送る → 受け取る → 合わせる。もう1回必要なら true */
  async once() {
    const uid = me().id;
    let key = await this.getKey(false);
    let st = this.load();
    if (st.kid && key.kid && st.kid !== key.kid) st = { since: 0, rows: {}, checked: [], kid: '' }; // 鍵が作り直された
    const fs = D().follows || {};
    const myKeys = Object.keys(fs).filter(k => fs[k] && fs[k].by === uid);
    const full = myKeys.some(k => st.checked.indexOf(k) < 0) || !st.since;
    const memos = memoAll(), pins = pinsAll();
    const all = new Set(Object.keys(memos).concat([...pins], Object.keys(st.rows)));
    const items = [], sent = {};
    let size = 0;
    for (const k of all) {
      if (size > 400000 || items.length >= 200) { this.soon(500); break; } // 多いときは分けて送る
      const pl = memoPl(memos, pins, k), h = memoPlHash(pl), r = st.rows[k];
      const f = fs[k], mine = !!(f && f.by === uid);
      if (pl) {
        if (r && !r.del && r.h === h) continue;           // 前回合わせたときから変わっていない
        if (!mine) continue;                               // 受け持っていない家のメモは送らない
        const d = await memoEnc(key, k, pl);
        items.push({ k, base: r ? r.v : 0, d }); sent[k] = h; size += d.length;
      } else if (r && !r.del) {
        if (mine) { items.push({ k, base: r.v, del: 1 }); sent[k] = ''; } // この端末で消した
        else delete st.rows[k];
      }
    }
    if (!items.length && !full && !this.pull) { this.save(st); return false; }
    this.pull = false;
    const j = await api('memo_sync', { since: full ? 0 : st.since, items }, { timeout: 60000 });
    if (j.kid && key.kid && j.kid !== key.kid) { this.reset(); return true; } // 鍵が作り直された：もう一度はじめから
    if (j.kid && !key.kid) key.kid = j.kid;
    st.kid = key.kid || j.kid || '';
    const conf = new Set(j.conflicts || []);
    (j.gone || []).forEach(k => { delete st.rows[k]; }); // ほかの人の受け持ちになった・もうない家
    const memos2 = memoAll(), pins2 = pinsAll(); // 返事を待つあいだに書きかえたかもしれないので、読み直す
    let touched = false, again = conf.size > 0;
    for (const row of (Array.isArray(j.rows) ? j.rows : [])) {
      const [k, v, , del, data] = row;
      if (Object.prototype.hasOwnProperty.call(sent, k) && !conf.has(k)) { // 送った内容が受け付けられた
        st.rows[k] = { v, h: sent[k], del: del ? 1 : 0 };
        continue;
      }
      let srv = null;
      if (!del) { try { srv = await memoDec(key, k, data); } catch (e) { continue; } } // 読めない（鍵が合わない）ものはとばす
      const r = st.rows[k], lp = memoPl(memos2, pins2, k);
      const same = r ? (r.del ? !lp : r.h === memoPlHash(lp)) : !lp; // この端末は、前回合わせたときから変わっていない
      if (same) {
        memoPlApply(memos2, pins2, k, srv); touched = true;
      } else if (srv && lp) { // 両方で変わった：どちらも消さずに合わせ、次の回に送る
        memoPlApply(memos2, pins2, k, memoPlMerge(lp, srv)); touched = true; again = true;
      } else again = true; // 片方で消し、片方で書いた：書いたほうを残して、次の回に送る
      st.rows[k] = { v, h: memoPlHash(srv), del: del ? 1 : 0 };
    }
    if (touched) { memoSaveRaw(memos2); pinsSaveRaw(pins2); }
    st.since = Number(j.now) || st.since;
    if (full) st.checked = myKeys;
    this.save(st);
    this.seenMv = j.mv || this.seenMv;
    this.lastAt = Date.now();
    if (touched) {
      if (currentView === 'follow') renderFollowList();
      else if (currentView === 'home') renderHome();
    }
    return again;
  }
};
onMemoVer = mv => MemoSync.hint(mv);
const memoShort = m => { const t = m.text.split('\n')[0]; return t.length > 40 || m.text.includes('\n') ? t.slice(0, 40) + '…' : t; };
function openMemo(k, back) {
  const [hid, unit] = parseKey(k);
  const h = houseById(hid); if (!h) return;
  const f = fol(k);
  if (!f || f.by !== me().id) { toast('メモは、自分が受け持っている再訪問にだけ書けます'); return; }
  const m = memoOf(k), met = sum(k).met, last = sum(k).last;
  const done = () => { MemoSync.editing = null; if (back) back(); else { closeSheet(); renderAll(); } };
  let openedText = m ? m.text : ''; // 開いたときのメモ（開いているあいだに、ほかの端末の内容が届いたかを見分ける）
  MemoSync.editing = k;
  /* 書きかけのメモと「次の約束」を保存する */
  const keepMemo = () => {
    const el = $('#memoText');
    if (!el) return true;
    let text = el.value.trim();
    const nx = readNext('memoNext'), o = memoAll();
    // 開いているあいだに、ほかの端末で書いた内容が届いていたら、消さずに合わせる
    const cur = o[k] ? o[k].text : '';
    if (cur !== openedText && cur !== text) text = text === openedText ? cur : mergeMemoText(text, cur);
    openedText = text;
    if (text || nx) o[k] = Object.assign({ text, at: new Date().toISOString() }, nx ? { next: nx } : {}); else delete o[k];
    return memoSaveAll(o);
  };
  setSheet(headHtml(terrById(h.terrId), 'メモ・記録', targetName(h, unit)) + `
    <div class="stamps"><button type="button" class="choice c-met" data-stamp="met"><i class="pin st-met">会</i>会えた</button>
      <button type="button" class="choice c-away" data-stamp="away"><i class="pin st-away">留</i>留守</button></div>
    <p class="hint">押すと訪問の記録になり（区域の地図にも反映）、メモのいちばん上に日時と結果が入ります。入った文字は消せます。</p>
    ${met ? `<p class="metline">前回 会えた日：${fmtDate(met.at)}（${slotShort(slotOf(new Date(met.at)))}）</p>` : '<p class="muted">まだ会えた記録はありません。</p>'}
    ${last ? `<p class="muted">前回の記録：${fmtDate(last.at)}　${RESULT_LABEL[last.result]}</p>` : ''}
    <label class="field"><span>メモ（${memoScope()}）</span><textarea id="memoText" rows="8" maxlength="1000" placeholder="例：次は土曜の午前に。前回の話の続きから">${esc(m ? m.text : '')}</textarea></label>
    ${nextInputsHtml('memoNext', m && m.next)}
    <p class="hint">約束の日は、ホームのカレンダーと「今日やること」に出ます（${memoScope()}）。</p>
    ${m && m.next ? `<a class="btn small" href="${gcalUrl('再訪問の約束', m.next.date, m.next.time, '', '', '')}" target="_blank" rel="noopener">約束をGoogleカレンダーに入れる</a>` : ''}
    ${m ? `<p class="muted">最後に保存：${fmtDate(m.at)}</p>` : ''}
    <button class="btn primary block" id="memoSave">メモを保存する</button>
    <a class="btn block" href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}&travelmode=walking" target="_blank" rel="noopener">Googleマップで道順を見る</a>
    <details class="more"><summary>ほかの記録（拒否など）・外に残す・メモを消す</summary>
      <button class="btn block" id="memoRec">くわしく記録する（年代・拒否など）</button>
      ${m ? shareButtonsHtml(true) : ''}
      ${m ? '<button class="btn danger block" id="memoDel">メモを消す</button>' : ''}
    </details>
    <p class="hint">${memoPrivacyNote()}住んでいる人の名前・電話番号は書かないでください。受け持ちが終わると、メモも自動で消えます。</p>
    <button class="btn block" id="memoBack">もどる</button>`);
  $$('[data-stamp]', $('#sheet')).forEach(b => b.onclick = () => {
    const nx = readNext('memoNext'), o = memoAll();
    if (nx) { o[k] = Object.assign({ text: '', at: new Date().toISOString() }, o[k] || {}, { next: nx }); memoSaveAll(o); }
    else if (o[k] && o[k].next) { delete o[k].next; memoSaveAll(o); }
    stampFollow(k, b.dataset.stamp, $('#memoText').value, () => openMemo(k, back));
  });
  $$('[data-share]', $('#sheet')).forEach(x => x.onclick = () => { keepMemo(); shareMemo(k, x.dataset.share, () => openMemo(k, back)); });
  $('#memoRec').onclick = () => { keepMemo(); openTarget(hid, unit, false); };
  $('#memoSave').onclick = () => {
    const text = $('#memoText').value.trim(), nx = readNext('memoNext');
    if (keepMemo() === false) { toast('このスマホに保存できませんでした'); return; }
    toast(text || nx ? `メモを保存しました（${memoScope()}）` : 'メモを消しました');
    if (currentView === 'home') renderHome();
    done();
  };
  if ($('#memoDel')) $('#memoDel').onclick = async () => {
    if (!await ask('このメモを消します。よろしいですか？')) return;
    const o = memoAll(); delete o[k]; memoSaveAll(o);
    toast('メモを消しました');
    done();
  };
  $('#memoBack').onclick = done;
}

/* ---------- メモを外に残す（Googleマップ・LINE・メモ帳など） ----------
   外に残したメモは、このアプリの保護（受け持ちが終わったら消えるなど）の外になるため、最初に一度だけ注意を出す */
const shareOn = () => D().settings.memoShare !== 0;
function shareButtonsHtml(withHead) {
  if (!shareOn()) return '';
  return (withHead ? '<h3 class="sub">外に残す</h3>' : '<p class="q" style="font-size:17px">外に残す</p>') + `<div class="sharegrid">
    <button type="button" data-share="gmap"><i style="background:#1A73E8"></i>Googleマップ</button>
    <button type="button" data-share="line"><i style="background:#06C755"></i>LINE</button>
    <button type="button" data-share="share"><i style="background:#F2B705"></i>メモ帳など</button>
    <button type="button" data-share="copy"><i style="background:var(--ink2)"></i>コピー</button></div>`;
}
const gmapUrl = h => `https://www.google.com/maps/search/?api=1&query=${h.lat.toFixed(6)},${h.lng.toFixed(6)}`;
function memoText(k) {
  const [hid, unit] = parseKey(k), h = houseById(hid), t = h && terrById(h.terrId), m = memoOf(k);
  const name = h.type === 'apt' ? `${h.label || '集合住宅'} ${unitTitle(h, unit)}` : (h.label || '家');
  return `【再訪問メモ】${t ? `区域${t.no} ` : ''}${name}\n${m ? m.text : ''}\n（${fmtDay(m ? m.at : new Date().toISOString())}のメモ）${m && m.next ? '\n次の約束：' + fmtNext(m.next) : ''}\n場所：${gmapUrl(h)}`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 古い方法でためす */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}
function shareMemo(k, how, back) {
  if (!shareOn()) { toast('会衆の設定で、メモを外に残す機能は使えません'); return; }
  if (!memoOf(k)) { toast('先にメモを保存してください'); return; }
  const okKey = 'kuiki_share_ok_' + me().id;
  if (!lsGet(okKey)) { // はじめての1回だけ、注意を読んでもらう
    setSheet(headHtml(null, 'メモをアプリの外に残す前に', '') + `
      <div class="notice warn"><b>外に残したメモは、受け持ちが終わっても自動では消えません。</b>いらなくなったら、自分で消してください。</div>
      <p>・住んでいる人の名前・電話番号・家族のことは書かないでください。</p>
      <p>・LINEで送るときは、<b>自分だけのトーク（Keepメモ）</b>をえらび、ほかの人に送らないでください。</p>
      <p>・スマホには画面ロックを設定しておいてください。</p>
      <button class="btn primary block" id="shOk">わかりました</button>
      <button class="btn block" id="shNo">やめる</button>`);
    $('#shOk').onclick = () => { lsSet(okKey, '1'); shareMemo(k, how, back); };
    $('#shNo').onclick = () => (back ? back() : closeSheet());
    return;
  }
  const text = memoText(k), h = houseById(parseKey(k)[0]);
  if (how === 'line') { // LINEの「送る先をえらぶ」画面が開く（Keepメモもえらべる）
    window.open('https://line.me/R/share?text=' + encodeURIComponent(text), '_blank', 'noopener');
    return;
  }
  if (how === 'share') { // スマホの共有画面（メモ・Google Keepなど）
    if (navigator.share) { navigator.share({ title: '再訪問メモ', text }).catch(() => {}); return; }
    copyText(text).then(ok => toast(ok ? 'コピーしました。メモ帳に貼り付けてください' : 'コピーできませんでした'));
    return;
  }
  if (how === 'copy') { copyText(text).then(ok => toast(ok ? 'メモをコピーしました' : 'コピーできませんでした')); return; }
  // Googleマップ：アプリから直接ピンに書きこむことはできないため、コピーしてから、その場所を開く
  copyText(text).then(ok => {
    setSheet(headHtml(null, 'Googleマップに残す', ok ? 'メモをコピーしました' : '') + `
      <ol class="plan" style="list-style:decimal;padding-left:24px">
        <li style="display:list-item">下の「Googleマップで場所を開く」を押します。</li>
        <li style="display:list-item">ピンの場所が出たら「保存」を押して、自分のリスト（例：再訪問）をえらびます。</li>
        <li style="display:list-item">保存した場所の「メモ」の欄を長押しして「ペースト」します。</li>
      </ol>
      <p class="hint">Googleマップの画面の言葉は、バージョンによって少しちがうことがあります。${ok ? '' : 'コピーできなかったときは、下の「もう一度コピー」を押してください。'}</p>
      <a class="btn primary block" href="${gmapUrl(h)}" target="_blank" rel="noopener">Googleマップで場所を開く</a>
      <button class="btn block" id="gmCopy">もう一度コピー</button>
      <button class="btn block" id="gmBack">もどる</button>`);
    $('#gmCopy').onclick = () => copyText(text).then(r => toast(r ? 'メモをコピーしました' : 'コピーできませんでした'));
    $('#gmBack').onclick = () => (back ? back() : closeSheet());
  });
}

/* =========================================================
   再訪問のバックアップ・復元（再訪問のタブの右上の、雲のボタン）
   ・保存するもの：受け持っている再訪問（リストに出ている家）のメモ・次の約束・📌（本人の分だけ）
   ・保存のしかた（端末によってちがう）
     dir      … 保存するフォルダをえらべる端末（パソコンのChrome・Edgeなど）。はじめの1回だけフォルダをえらび、
                 あとはボタンを押すだけで、そのフォルダに日時の名前のファイルを作る（古いものは新しい10個を残して消す）
     download … フォルダをえらべない端末（スマホ）。はじめの1回だけ保存先を案内し、あとはボタンだけで「ダウンロード」に保存する
                 （iPhoneのSafariでは、Safari自身の「ダウンロードしますか」の確認が毎回出る）
     share    … iPhoneのホーム画面から開いているとき。共有の画面から「"ファイル"に保存」で保存する。
                 iPhoneのブラウザには保存先を覚えておくしくみがないため、毎回、共有の画面が出る
   ・共有の画面は、ボタンを押した直後に出す（間に保存の処理をはさむと、iPhoneが共有の画面を出してくれないことがある）
   ・共有の画面を閉じた（保存しなかった）ときは、バックアップしたことにしない。このスマホの中の控えも残さない
   ・ファイルに保存できたときだけ、このスマホの中にも控えを残す（新しい5回分。まちがえてリストから外したときに、すぐ戻せるように）
   ・件数は、再訪問のタブのリストと同じ数え方（受け持っていて、家が地図にある分）
   ・ファイルはサーバーに送らない。ほかの人のバックアップは戻せない（使う人の番号で確かめる）
   ・以前のパスワードつきのバックアップも、パスワードを入れると戻せる
   ========================================================= */
const BK_KIND = 'kuiki-follow-backup';
const BK_PREFIX = '区域マップ_再訪問_';
const BK_LOCAL_MAX = 5, BK_DIR_MAX = 10;
const bkMode = () => (window.showDirectoryPicker ? 'dir' : isIOS() && isStandalone() ? 'share' : 'download');
const bkSetupKey = () => 'kuiki_bk_setup_' + me().id;
const bkLastKey = () => 'kuiki_bk_at_' + me().id;
function backupPayload() {
  const fs = D().follows || {};
  // リストに出ている再訪問だけ（家が消えたものは入れない）
  const mine = Object.keys(fs).filter(k => fs[k] && fs[k].by === me().id && houseById(parseKey(k)[0]));
  const set = new Set(mine), mo = memoAll(), memos = {}, houses = {};
  Object.keys(mo).forEach(k => { if (set.has(k)) memos[k] = mo[k]; });
  mine.forEach(k => {
    const [hid, unit] = parseKey(k), h = houseById(hid);
    const t = terrById(h.terrId);
    houses[k] = { n: h.type === 'apt' ? `${h.label || '集合住宅'} ${uName(h, unit)}` : (h.label || '家'), t: t ? t.no : '', lat: h.lat, lng: h.lng };
  });
  return { app: 'kuiki-map', kind: BK_KIND, v: 2, uid: me().id, name: me().name, at: new Date().toISOString(),
    memos, pins: [...pinsAll()].filter(k => set.has(k)), follows: mine, houses };
}
const bkFileName = at => { const d = new Date(at); return `${BK_PREFIX}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`; };
/* 件数：再訪問の家の数と、そのうちメモ（または約束）がある家の数 */
const bkSummary = o => {
  const fl = Array.isArray(o.follows) ? o.follows : [], fset = new Set(fl);
  const n = Object.keys(o.memos || {}).filter(k => (!fset.size || fset.has(k)) && o.memos[k] && (o.memos[k].text || o.memos[k].next)).length;
  return `再訪問 ${fl.length}件（メモあり ${n}件）`;
};
/* パスワードつきの古いバックアップを開く */
async function bkKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function bkDecrypt(o, pass) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: mUnB64(o.enc.iv) }, await bkKey(pass, mUnB64(o.enc.salt)), mUnB64(o.enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
/* このスマホの中に残す控え（新しい5回分）。ファイルに保存できたときだけ残す。「この端末から消す」ときは一緒に消える */
async function bkLocalAll() { try { return (await IDB.get('bkgens')) || {}; } catch (e) { return {}; } }
async function bkLocalList() { const a = await bkLocalAll(); return Array.isArray(a[me().id]) ? a[me().id] : []; }
async function bkLocalAdd(o) {
  try { const a = await bkLocalAll(); a[me().id] = [o].concat(Array.isArray(a[me().id]) ? a[me().id] : []).slice(0, BK_LOCAL_MAX); await IDB.set('bkgens', a); } catch (e) { /* 残せなくても、ファイルの保存は続ける */ }
}
/* フォルダ（パソコンなど） */
async function bkDirHandle() { try { return (await IDB.get('bkdir_' + me().id)) || null; } catch (e) { return null; } }
async function bkDirPermit(h, write) {
  const opt = { mode: write ? 'readwrite' : 'read' };
  try {
    if ((await h.queryPermission(opt)) === 'granted') return true;
    return (await h.requestPermission(opt)) === 'granted';
  } catch (e) { return false; }
}
async function bkWriteDir(h, o) {
  const fh = await h.getFileHandle(bkFileName(o.at), { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(o)); await w.close();
  // 古いバックアップは、新しい10個を残して消す（このアプリが作ったファイルだけ）
  const names = [];
  for await (const [name, e] of h.entries()) if (e.kind === 'file' && name.indexOf(BK_PREFIX) === 0 && /\.json$/.test(name)) names.push(name);
  names.sort().reverse().slice(BK_DIR_MAX).forEach(n => { h.removeEntry(n).catch(() => {}); });
}
function bkDownload(o) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' }));
  a.download = bkFileName(o.at);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
/* 共有の画面を出す。'ok'＝保存した／'cancel'＝閉じた／'retry'＝出せなかった／'nosupport'＝この端末では使えない
   ※ この関数は、ボタンを押した処理の中で、ほかの await より先に呼ぶ */
function bkShare(o) {
  let file;
  try { file = new File([JSON.stringify(o)], bkFileName(o.at), { type: 'application/json' }); } catch (e) { return Promise.resolve('nosupport'); }
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return Promise.resolve('nosupport');
  return navigator.share({ files: [file] }) // 題名はつけない（題名だけの別ファイルができるため）
    .then(() => 'ok', e => (e && e.name === 'AbortError' ? 'cancel' : 'retry'));
}
async function bkShareFlow(o, tries) {
  const r = await bkShare(o);
  if (r === 'ok') { await bkLocalAdd(o); bkDone(o, true); return; }
  if (r === 'cancel') { toast('バックアップをやめました（ファイルには保存していません）'); return; }
  if (r === 'retry' && !tries) { bkRetrySheet(o); return; }
  infoSheet('バックアップできませんでした', 'この端末では、共有の画面を出せませんでした。<br>iPhoneをいったん再起動してから、もう一度お試しください。それでもできないときは、区域係に知らせてください。');
}
/* 共有の画面が出なかったとき：もう一度ボタンを押してもらう（押した直後なら出せる） */
function bkRetrySheet(o) {
  setSheet(headHtml(null, 'もう一度押してください', '') + `
    <p>共有の画面を出せませんでした。下のボタンを押すと、共有の画面が出ます。</p>
    <p><b>「"ファイル"に保存」</b>をえらび、保存する場所（おすすめ：iCloud Drive）を決めてください。</p>
    <button class="btn primary block" id="bkAgain">バックアップする</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#bkAgain').onclick = () => { closeSheet(); bkShareFlow(o, 1); };
}
const bkDone = (o, shared) => {
  lsSet(bkLastKey(), o.at); paintFollowBk();
  toast(shared ? `バックアップしました（${bkSummary(o)}）。「ファイル」アプリで「区域マップ」と検索すると見つかります` : `バックアップしました（${bkSummary(o)}）`);
};
/* バックアップのボタン：はじめの1回だけ保存先をたしかめ、あとはボタンだけ */
async function quickBackup() {
  if (!featFollow()) return;
  const o = backupPayload(), mode = bkMode();
  if (!o.follows.length) { toast('バックアップする再訪問がありません'); return; }
  const setup = lsGet(bkSetupKey());
  if (mode === 'dir') {
    const h = setup === 'dir' ? await bkDirHandle() : null;
    if (!h) { bkFirstSheet(); return; }
    if (!await bkDirPermit(h, true)) { toast('フォルダに保存できませんでした。もう一度押してください'); return; }
    try { await bkWriteDir(h, o); } catch (e) { lsDel(bkSetupKey()); bkFirstSheet('前に決めたフォルダに保存できませんでした。もう一度えらんでください。'); return; }
    await bkLocalAdd(o); bkDone(o); return;
  }
  if (setup !== mode) { bkFirstSheet(); return; }
  if (mode === 'share') { bkShareFlow(o); return; } // 共有の画面は、押した直後に出す
  bkDownload(o); await bkLocalAdd(o); bkDone(o);
}
function bkFirstSheet(note) {
  const mode = bkMode();
  const where = mode === 'dir'
    ? '<p>はじめに、バックアップを保存する<b>フォルダ</b>をえらびます。次からは、ボタンを押すだけで、そのフォルダに保存します。</p><p class="hint">例：「ドキュメント」の中に「区域マップ」というフォルダを作って、えらんでください。Googleドライブのフォルダにすると、パソコンをなくしても残ります。</p>'
    : mode === 'share'
      ? '<p>ボタンを押すと、共有の画面が出ます。<b>「"ファイル"に保存」</b>をえらび、保存する場所（おすすめ：iCloud Drive）を決めて、右上の<b>「保存」</b>を押してください。</p><p class="hint">iPhoneでは、保存のたびに共有の画面が出ます（iPhoneのしくみで、保存先を覚えておけないため）。共有の画面を閉じたときは、バックアップされません。</p>'
      : isIOS()
        ? '<p>次からは、ボタンを押すだけで、Safariの<b>「ダウンロード」</b>に保存します（Safariの「ダウンロードしますか」の確認だけ出ます）。</p><p class="hint">iPhoneの「設定」→「アプリ」→「Safari」→「ダウンロード」を<b>「iCloud Drive」</b>にしておくと、スマホをなくしても残ります。</p>'
        : '<p>次からは、ボタンを押すだけで、スマホの<b>「ダウンロード」</b>フォルダに保存します。</p><p class="hint">スマホをなくしたときに備えて、ときどき「ダウンロード」のファイルをGoogleドライブなどに移しておくと安心です。</p>';
  setSheet(headHtml(null, 'バックアップの保存先', '') + (note ? `<div class="notice warn">${esc(note)}</div>` : '') + where + `
    <p class="hint">ファイルに保存できたときは、このスマホの中にも控えを新しい${BK_LOCAL_MAX}回分残します。ファイルにはメモがそのまま入るので、自分だけが使う場所に保存し、人に送らないでください。</p>
    <button class="btn primary block" id="bkFirst">${mode === 'dir' ? '保存するフォルダをえらぶ' : 'わかりました。バックアップする'}</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#bkFirst').onclick = async () => {
    const o = backupPayload();
    if (mode === 'dir') {
      let h;
      try { h = await window.showDirectoryPicker({ id: 'kuiki-backup', mode: 'readwrite', startIn: 'documents' }); }
      catch (e) { if (e && e.name !== 'AbortError') toast('フォルダをえらべませんでした'); return; }
      try { await bkWriteDir(h, o); } catch (e) { toast('そのフォルダには保存できませんでした。別のフォルダをえらんでください'); return; }
      try { await IDB.set('bkdir_' + me().id, h); } catch (e) { /* 次にまたえらぶ */ }
      lsSet(bkSetupKey(), 'dir'); closeSheet(); await bkLocalAdd(o); bkDone(o); return;
    }
    lsSet(bkSetupKey(), mode);
    closeSheet();
    if (mode === 'share') { bkShareFlow(o); return; } // ほかの処理より先に、共有の画面を出す
    bkDownload(o); await bkLocalAdd(o); bkDone(o);
  };
}
/* 復元のボタン
   ・パソコン（フォルダをえらんだ端末）：保存したフォルダを見て、1つならいつのものかを見せて確かめ、複数ならえらんでもらう
   ・スマホ：まず、保存したファイルをえらんでもらう（「ファイル」アプリの中は、アプリから探せないため）。
     このスマホの中の控えは、その下に「控え」として分けて出す */
async function quickRestore() {
  if (!featFollow()) return;
  let list = [];
  const h = bkMode() === 'dir' && lsGet(bkSetupKey()) === 'dir' ? await bkDirHandle() : null;
  let dirOk = false;
  if (h && await bkDirPermit(h, false)) {
    dirOk = true;
    try {
      for await (const [name, e] of h.entries()) {
        if (e.kind !== 'file' || !/\.json$/i.test(name)) continue;
        try {
          const o = JSON.parse(await (await e.getFile()).text());
          if (o && o.app === 'kuiki-map' && o.kind === BK_KIND) list.push({ o, src: 'フォルダ', name });
        } catch (x) { /* ほかのファイルはとばす */ }
      }
    } catch (e) { dirOk = false; }
  }
  const byNew = (a, b) => (String(a.o.at) < String(b.o.at) ? 1 : -1);
  const pick = (primary, label) => `<label class="btn ${primary ? 'primary ' : ''}block">${label}<input type="file" id="bkFile" hidden></label>`;
  if (!dirOk) {
    const loc = (await bkLocalList()).map(o => ({ o })).filter(x => !x.o.uid || x.o.uid === me().id).sort(byNew);
    setSheet(headHtml(null, 'バックアップから戻す', '') + `
      <p>保存したバックアップのファイルをえらんでください。${isIOS() ? '「ファイル」アプリの画面が開きます。' : ''}</p>
      ${pick(true, '保存したファイルをえらぶ')}
      <p class="hint">ファイルの名前は「<b>${BK_PREFIX}日付.json</b>」です。${isIOS() ? '見つからないときは、開いた画面の下の「ブラウズ」を押し、上の検索に「区域マップ」と入れてください。' : '「ダウンロード」の中にあります。'}</p>
      ${loc.length ? `<h3 class="sub">このスマホの中の控え</h3>
        <p class="hint">ファイルに保存できたときに、このスマホの中にも残した控えです。スマホを替えたときや、アプリを消したときは残っていません。</p>
        ${loc.slice(0, BK_LOCAL_MAX).map((x, i) => `<button class="choice wide bkpick" data-bki="${i}">${fmtDate(x.o.at)}<small>${bkSummary(x.o)}${i === 0 ? '・いちばん新しい' : ''}</small></button>`).join('')}` : ''}
      <button class="btn block" data-close>やめる</button>`);
    $$('[data-bki]', $('#sheet')).forEach(b => b.onclick = () => checkRestore(loc[Number(b.dataset.bki)].o));
  } else {
    list = list.filter(x => !x.o.uid || x.o.uid === me().id).sort(byNew);
    if (!list.length) {
      setSheet(headHtml(null, 'バックアップから戻す', '') + `<p>保存したフォルダに、バックアップが見つかりませんでした。保存したファイルをえらんでください。</p>` +
        pick(true, 'ほかのファイルをえらぶ') + '<button class="btn block" data-close>やめる</button>');
    } else if (list.length === 1) {
      const x = list[0];
      setSheet(headHtml(null, 'このバックアップを戻しますか？', '') + `
        <div class="schedbox"><p class="rt">${fmtDate(x.o.at)} のバックアップ</p><p class="muted">${bkSummary(x.o)}（${x.src}）</p></div>
        <button class="btn primary block" id="bkOne">このバックアップを戻す</button>${pick(false, 'ほかのファイルをえらぶ')}<button class="btn block" data-close>やめる</button>`);
      $('#bkOne').onclick = () => checkRestore(x.o);
    } else {
      setSheet(headHtml(null, 'どのバックアップを戻しますか？', `${list.length}件あります（新しい順）`) +
        list.slice(0, 20).map((x, i) => `<button class="choice wide bkpick" data-bki="${i}">${fmtDate(x.o.at)}<small>${bkSummary(x.o)}（${x.src}）${i === 0 ? '・いちばん新しい' : ''}</small></button>`).join('') +
        pick(false, 'ほかのファイルをえらぶ') + '<button class="btn block" data-close>やめる</button>');
      $$('[data-bki]', $('#sheet')).forEach(b => b.onclick = () => checkRestore(list[Number(b.dataset.bki)].o));
    }
  }
  $('#bkFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFromFile(f); };
}
/* ファイルの中身を文字で読む（古いiPhoneでも読めるように） */
function readFileText(file) {
  if (file.text) return file.text();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(r.error); r.readAsText(file); });
}
/* えらんだファイルから戻す */
async function restoreFromFile(file) {
  const fname = String(file && file.name || '（名前なし）'), kb = Math.max(1, Math.round((file && file.size || 0) / 1024));
  const bad = why => infoSheet('このファイルは戻せません', `えらんだファイル：<b>${esc(fname)}</b>（${kb}KB）<br>${why}<br><br>
    バックアップのファイルは「<b>${BK_PREFIX}日付.json</b>」という名前です（最後が .json）。`);
  if (!file || !file.size) { bad('ファイルが空です（中身がありません）。'); return; }
  if (file.size > 10 * 1024 * 1024) { bad('ファイルが大きすぎます。'); return; }
  let text;
  try { text = await readFileText(file); } catch (e) { bad('ファイルを読めませんでした。いったん閉じて、もう一度えらんでください。'); return; }
  text = String(text || '').replace(/^\uFEFF/, '').trim();
  let o = null;
  try { o = JSON.parse(text); } catch (e) {
    const i = text.indexOf('{'), j = text.lastIndexOf('}'); // まわりに別の文字がついていても、中のバックアップを取り出す
    if (i >= 0 && j > i) { try { o = JSON.parse(text.slice(i, j + 1)); } catch (e2) { o = null; } }
  }
  if (!o) { bad(`中身が、区域マップのバックアップの形ではありません（はじめの文字：「${esc(text.slice(0, 20))}」）。`); return; }
  if (o.app !== 'kuiki-map' || o.kind !== BK_KIND) { bad('区域マップの、再訪問のバックアップではありません。'); return; }
  if (o.enc) { askBackupPass(o); return; }
  checkRestore(o);
}
function askBackupPass(enc) {
  if (!(window.crypto && crypto.subtle)) { infoSheet('この端末では開けません', 'パスワードつきのファイルを開くしくみが、このブラウザにありません。'); return; }
  setSheet(headHtml(null, 'パスワードを入れてください', '以前、パスワードをつけて保存したバックアップです') + `
    <label class="field"><span>パスワード</span><input type="password" id="rsPass" autocomplete="current-password" maxlength="64"></label>
    <button class="btn primary block" id="rsGo">開く</button><button class="btn block" data-close>やめる</button>`);
  $('#rsGo').onclick = async () => {
    const b = $('#rsGo'); b.disabled = true; b.textContent = '開いています…';
    try { checkRestore(await bkDecrypt(enc, $('#rsPass').value)); }
    catch (e) { b.disabled = false; b.textContent = '開く'; toast('パスワードがちがいます'); }
  };
}
function cleanMemoRec(m) {
  if (!m || typeof m !== 'object') return null;
  const text = String(m.text || '').slice(0, 3000), at = String(m.at || '') || new Date().toISOString();
  const n = m.next && /^\d{4}-\d{2}-\d{2}$/.test(String(m.next.date || '')) ? { date: String(m.next.date), time: /^\d{1,2}:\d{2}$/.test(String(m.next.time || '')) ? String(m.next.time) : '' } : null;
  if (!text && !n) return null;
  const r = { text, at }; if (n) r.next = n;
  return r;
}
function checkRestore(b) {
  if (!b || b.kind !== BK_KIND || typeof b.memos !== 'object') { infoSheet('このファイルは戻せません', 'ファイルの中身が読めませんでした。'); return; }
  if (b.uid && b.uid !== me().id) { infoSheet('ほかの人のバックアップです', `このファイルは${esc(b.name || 'ほかの人')}さんのバックアップです。本人のバックアップだけ戻せます。`); return; }
  const fs = D().follows || {};
  const keys = Object.keys(b.memos || {}).concat(b.pins || [], b.follows || []).filter((k, i, a) => a.indexOf(k) === i);
  const mine = keys.filter(k => fs[k] && fs[k].by === me().id);
  const free = keys.filter(k => !fs[k] && houseById(parseKey(k)[0]) && !D().dnc[k]); // だれも受け持っていない家
  const other = keys.length - mine.length - free.length;
  setSheet(headHtml(null, 'バックアップから戻す', `${b.at ? fmtDate(b.at) + 'のバックアップ' : ''}`) + `
    <div class="schedbox"><p>バックアップ：<b>${bkSummary(b)}</b></p><p>今のスマホ：<b>${bkSummary(backupPayload())}</b></p></div>
    <p>今も受け持っている家：<b>${mine.length}件</b>（メモ・約束・📌を戻します。今のメモも消さずに合わせます）</p>
    ${!mine.length && !free.length ? '<div class="notice warn">戻せる家がありません。ほかの人が受け持っているか、家がなくなっています。</div>' : ''}
    ${free.length ? `<label class="check"><input type="checkbox" id="rsRevive" checked>受け持ちが外れている家 ${free.length}件も、再訪問にもどす</label>
      <p class="hint">だれも受け持っていない家だけです。もどすと、ほかの人にも「再訪問している家」として伝わります。</p>` : ''}
    ${other ? `<p class="muted">ほかの人が受け持っている家・もうない家 ${other}件は、戻しません。</p>` : ''}
    <button class="btn primary block" id="rsApply">戻す</button><button class="btn block" data-close>やめる</button>`);
  $('#rsApply').onclick = () => {
    const revive = $('#rsRevive') && $('#rsRevive').checked ? free : [];
    closeSheet();
    if (revive.length) commitIn([], `再訪問を${revive.length}件もどしました`, () => { revive.forEach(k => { if (!D().follows[k]) startFollow(k, me().id); }); });
    const f2 = D().follows || {}, ok = new Set(Object.keys(f2).filter(k => f2[k] && f2[k].by === me().id));
    const o = memoAll(), p = pinsAll();
    let n = 0;
    Object.keys(b.memos || {}).forEach(k => {
      if (!ok.has(k)) return;
      const m = cleanMemoRec(b.memos[k]); if (!m) return;
      const c = o[k];
      if (!c) o[k] = m;
      else if (c.text !== m.text || JSON.stringify(c.next || null) !== JSON.stringify(m.next || null)) {
        const newer = (Date.parse(c.at) || 0) >= (Date.parse(m.at) || 0) ? c : m, older = newer === c ? m : c;
        o[k] = Object.assign({ text: mergeMemoText(newer.text, older.text), at: newer.at }, newer.next || older.next ? { next: newer.next || older.next } : {});
      }
      n++;
    });
    (b.pins || []).forEach(k => { if (ok.has(k)) p.add(k); });
    memoSaveAll(o); pinsSave(p);
    renderAll();
    toast(`戻しました（メモ ${n}件${revive.length ? `・再訪問にもどした家 ${revive.length}件` : ''}）`);
  };
}
/* 再訪問のタブの右上の、雲のボタン（前回の日時は、ボタンの説明に入れる） */
const BK_ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 12.5a4 4 0 0 1-.4-8 5.2 5.2 0 0 1 10 1.2 3.4 3.4 0 0 1 .4 6.8"/><path d="M12 22v-9"/><path d="M8.5 16.2 12 12.7l3.5 3.5"/></svg>';
const BK_ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 12.5a4 4 0 0 1-.4-8 5.2 5.2 0 0 1 10 1.2 3.4 3.4 0 0 1 .4 6.8"/><path d="M12 12.5v9"/><path d="M8.5 18.2 12 21.7l3.5-3.5"/></svg>';
function paintFollowBk() {
  const box = $('#followBk'); if (!box) return;
  const last = lsGet(bkLastKey());
  box.innerHTML = `<button type="button" class="bkbtn" id="fbkSave" aria-label="再訪問をバックアップ${last ? '（前回 ' + fmtDate(last) + '）' : ''}" title="バックアップ${last ? '（前回 ' + fmtDate(last) + '）' : ''}">${BK_ICON_UP}<small>バックアップ</small></button>
    <button type="button" class="bkbtn" id="fbkLoad" aria-label="バックアップから復元" title="復元">${BK_ICON_DOWN}<small>復元</small></button>`;
  $('#fbkSave').onclick = quickBackup;
  $('#fbkLoad').onclick = quickRestore;
}
/* 以前の「自分のGoogleマップのピン」（機能は外しました）がスマホに残っていたら消す */
function dropOldGpins() {
  try {
    Object.keys(localStorage).forEach(x => { if (/(^|::)kuiki_(gpins|gpshow)_/.test(x)) localStorage.removeItem(x); });
  } catch (e) { /* 何もしない */ }
}

/* ---------- 再訪問の受け持ちの操作 ---------- */
const RELEASE_MSG = { handoff: '引き継ぎを待つ家にしました', lost: '再訪問のリストから外しました', gone: '再訪問のリストから外しました', admin: '受け持ちを解除しました' };
function startFollow(k, by) {
  const now = new Date().toISOString();
  D().follows[k] = { by, since: now, touchedAt: now };
  delete D().released[k];
}
function releaseFollow(k, reason) {
  delete D().follows[k];
  if (reason === 'handoff') D().released[k] = { at: new Date().toISOString(), reason };
  // 本人が「リストから外した」家は、係の「取り残し」やほかの人の案内に出さない（あとでまた★が付けば、また出る）
  else if (reason === 'lost' || reason === 'gone') D().released[k] = { at: new Date().toISOString(), reason: 'closed' };
  else delete D().released[k];
}
async function followAction(act, k) {
  switch (act) {
    case 'continue':
      if (!fol(k)) return;
      commitIn([], '受け持ちを続けます。期限を延ばしました', () => { D().follows[k].touchedAt = new Date().toISOString(); });
      break;
    case 'handoff':
      if (!await ask('この再訪問をほかの人に引き継ぎます。よろしいですか？')) return;
      commitIn([], RELEASE_MSG.handoff, () => releaseFollow(k, 'handoff'));
      break;
    case 'stop':
      openReleaseSheet(k, true);
      break;
    case 'remove':
      openReleaseSheet(k, false);
      break;
    case 'release':
      if (!await ask('この受け持ちを解除します。よろしいですか？')) return;
      commitIn([], RELEASE_MSG.admin, () => releaseFollow(k, 'admin'));
      break;
    case 'memo':
      openMemo(k);
      break;
    case 'record': { // 再訪問の記録は、この一覧からそのまま残せる（結果は区域の地図にも反映される）
      const [hid2, unit2] = parseKey(k);
      openTarget(hid2, unit2, false, true);
      break;
    }
    case 'take':
      if (fol(k)) { toast('すでに受け持ちがあります'); return; }
      commitIn([], '再訪問を受け持ちます', () => startFollow(k, me().id));
      break;
  }
}
/* 再訪問のリストから外す：押すのは1回。まちがえても、お知らせの「取り消す」でメモごと元にもどる */
function openReleaseSheet(k, onlyStop) {
  const [hid, unit] = parseKey(k);
  const h = houseById(hid); if (!h) return;
  setSheet(headHtml(terrById(h.terrId), 'リストから外します', targetName(h, unit)) + `
    <div class="choices">
      <button class="choice wide" data-rel="lost">リストから外す<small>もう訪ねない（関心がない・引っ越した など）</small></button>
      ${onlyStop ? '' : '<button class="choice wide" data-rel="handoff">ほかの人に引き継ぐ<small>「引き継ぎを待っている家」として、ほかの人に表示されます</small></button>'}
    </div>
    ${memoOf(k) ? '<p class="hint">メモも消えます（メモは引き継がれません）。</p>' : ''}
    <button class="btn block" data-close>もどる（外さない）</button>`);
  $$('[data-rel]', $('#sheet')).forEach(x => x.onclick = () => {
    const rel = x.dataset.rel;
    const memoBefore = memoOf(k), pinned = pinsAll().has(k);
    closeSheet();
    commitIn([], RELEASE_MSG[rel], () => releaseFollow(k, rel), () => {
      if (memoBefore) { const o = memoAll(); o[k] = memoBefore; memoSaveAll(o); }
      if (pinned) { const p = pinsAll(); p.add(k); pinsSave(p); }
    });
  });
}
function followItem(k, f, mode) {
  const [hid, unit] = parseKey(k);
  const h = houseById(hid); if (!h) return '';
  const t = terrById(h.terrId), stg = followStage(f), d = followIdle(f), m = lastInterest(k), bs = bestSlot(k);
  const met = sum(k).met; // 最後に会えた日時
  const state = stg === 2 ? '（確認が必要）' : stg === 1 ? '（しばらく訪問なし）' : '';
  const A = (act, label, cls) => `<button class="btn small ${cls || ''}" data-fact="${act}" data-key="${esc(k)}">${label}</button>`;
  let acts = '';
  const memo = mode === 'mine' ? memoOf(k) : null;
  if (mode === 'mine') {
    acts += A('record', 'ここで記録する', 'primary') + A('memo', memo ? 'メモ・記録を開く' : 'メモを書く');
    if (stg >= 1) acts += A('continue', '続ける', 'primary');
    acts += A('remove', 'リストから外す', 'danger');
  } else {
    acts = A('continue', '延長する') + A('handoff', '引き継ぎ待ちにする') + A('release', '解除する', 'danger') +
      `<label>変更 <select data-reassign="${esc(k)}">${userOptions(f.by)}</select></label>`;
  }
  return `<article class="ritem f-s${stg}"><div>
      <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> ${targetName(h, unit)}</p>
      ${met ? `<p class="metline">前回 会えた日：${fmtDate(met.at)}（${slotShort(slotOf(new Date(met.at)))}）</p>` : '<p class="muted">まだ会えた記録はありません</p>'}
      <p class="muted">${mode === 'admin' ? `受け持ち：${esc(uname(f.by))}さん　` : ''}最後の記録から ${d}日${state}</p>
      ${m ? `<p class="muted">★${YOUNG.has(m.age) ? '・若い世代' : ''}${bs ? `　会えた時間帯：${bs}` : ''}</p>` : ''}
      ${memo ? `<p class="memoline">メモ：${esc(memoShort(memo))}</p>` : ''}
    </div><button class="btn small" data-go="${esc(hid)}" data-unit="${esc(unit)}" data-route="1">地図で見る</button>
    ${acts ? `<div class="actions span">${acts}</div>` : ''}</article>`;
}

/* ---------- 集合住宅：建物の編集 ----------
   建物の姿のまま（上の階が上）部屋を並べる。
   ・各階の右はしの「＋」で、次の番号の部屋を足す（101・102→103、2-1→2-2、2A→2B）
   ・部屋をタップ →「名前を直す」「この部屋を消す」「種別・記録」
   ・「上に階を足す」で、いちばん上の階と同じ部屋数の階を足す
   ・どの操作も、すぐ保存して「取り消す」でもどせる（よろしいですか？は、記録が消えるときだけ）
   ・記録のない部屋は、くわしい表示の人ならだれでも消せる。記録のある部屋は区域係だけ */
const B_FRAME = /^(\d{1,2})階$/;
function unitPos(name) {
  const n = String(name || '');
  let m;
  if ((m = n.match(B_FRAME))) return { pre: '', fl: +m[1], frame: true };
  if ((m = n.match(/^(\D*?)(\d{1,2})(\d{2})(\D*)$/)) && +m[2] > 0) return { pre: m[1], fl: +m[2], rm: +m[3], fmt: 'n', suf: m[4] };
  if ((m = n.match(/^(\D*?)(\d{1,2})[-－ー](\d{1,3})$/)) && +m[2] > 0) return { pre: m[1], fl: +m[2], rm: +m[3], fmt: 'dash', suf: '' };
  if ((m = n.match(/^(\D*?)(\d{1,2})([A-Za-z])$/)) && +m[2] > 0) return { pre: m[1], fl: +m[2], rm: m[3].toUpperCase().charCodeAt(0) - 64, fmt: 'alpha', suf: '' };
  return null;
}
function unitFmt(p, fl, rm) {
  if (p.fmt === 'dash') return cleanUnit(`${p.pre}${fl}-${rm}`);
  if (p.fmt === 'alpha') return rm >= 1 && rm <= 26 ? cleanUnit(`${p.pre}${fl}${String.fromCharCode(64 + rm)}`) : '';
  return rm >= 1 && rm <= 99 ? cleanUnit(`${p.pre}${fl}${pad(rm)}${p.suf || ''}`) : '';
}
const unitHasRec = (hid, u) => { const k = K(hid, u); return !!(visitsOf(k).length || D().dnc[k] || fol(k)); };
const unitUsed = h => new Set(h.units.concat(h.units.map(u => uName(h, u))));
/* 建物の部屋を「棟（頭の文字）→ 階」に分ける。読めない名前は「そのほか」 */
function bldLayout(h) {
  const groups = new Map(), other = [];
  h.units.forEach(u => {
    const p = unitPos(uName(h, u));
    if (!p) { other.push(u); return; }
    if (!groups.has(p.pre)) groups.set(p.pre, { pre: p.pre, floors: new Map(), fmt: null });
    const g = groups.get(p.pre);
    if (!p.frame && !g.fmt) g.fmt = p;
    if (!g.floors.has(p.fl)) g.floors.set(p.fl, []);
    g.floors.get(p.fl).push(u);
  });
  const list = [...groups.values()].sort((a, b) => cmpNo(a.pre, b.pre));
  list.forEach(g => {
    const fls = [...g.floors.keys()], lo = Math.min(...fls), hi = Math.max(...fls);
    g.rows = [];
    for (let f = hi; f >= lo; f--) g.rows.push({ fl: f, units: (g.floors.get(f) || []).sort((a, b) => cmpNo(uName(h, a), uName(h, b))) });
  });
  return { groups: list, other: other.sort((a, b) => cmpNo(uName(h, a), uName(h, b))) };
}
/* その階に足す、次の部屋の名前 */
function nextUnitName(h, g, row) {
  const used = unitUsed(h);
  const ps = row.units.map(u => unitPos(uName(h, u))).filter(p => p && !p.frame);
  const base = ps.length ? ps[ps.length - 1] : (g.fmt || { pre: g.pre, fmt: 'n', suf: '' });
  let rm = ps.length ? Math.max(...ps.map(p => p.rm)) + 1 : 1;
  for (let i = 0; i < 60; i++, rm++) {
    const n = unitFmt(base, row.fl, rm);
    if (!n) return '';
    if (!used.has(n)) return n;
  }
  return '';
}
/* いちばん上の階と同じ部屋数で、上に1階足すときの部屋 */
function nextFloorUnits(h, g) {
  const top = g.rows[0], fl = top.fl + 1, used = unitUsed(h);
  const ps = top.units.map(u => unitPos(uName(h, u))).filter(p => p && !p.frame);
  if (!ps.length) return used.has(`${fl}階`) ? [] : [`${fl}階`];
  return ps.map(p => unitFmt(p, fl, p.rm)).filter(n => n && !used.has(n));
}
function dropUnitData(h, us) {
  const del = new Set(us);
  h.units = h.units.filter(x => !del.has(x));
  us.forEach(u => {
    if (h.ul) delete h.ul[u];
    if (h.uk) delete h.uk[u];
    const k = K(h.id, u); dncDrop(k, h); delete D().follows[k]; delete D().released[k];
  });
  if (h.ul && !Object.keys(h.ul).length) delete h.ul;
  if (h.uk && !Object.keys(h.uk).length) delete h.uk;
}
function openBuilding(hid, startSel) {
  const h0 = houseById(hid); if (!h0) return;
  // かんたんな表示では編集しない。部屋があれば入力の画面へ
  if (isSimple()) {
    if (h0.units.length) { openAptSeq(hid); return; }
    setSheet(headHtml(terrById(h0.terrId), esc(h0.label || '集合住宅'), '') + `${banNotice(h0)}${bldMemoHtml(h0)}${window.chuiNotice ? window.chuiNotice(h0, '') : ''}
      <p class="notice">部屋がまだ登録されていません。</p><button class="btn primary block" data-close>閉じる</button>`);
    return;
  }
  const st = { sel: startSel && h0.units.includes(startSel) ? startSel : null, ren: false };
  const again = () => { sheetKeep = true; paint(); };
  const reopen = () => setTimeout(() => openBuilding(hid), 30); // 取り消したあとも、この画面にもどる
  const save = (msg, fn) => { commitIn([hid], msg, () => { const h = houseById(hid); if (h) fn(h); }, reopen); again(); }; // この建物だけを比べて送る（改善案B2）

  const paint = () => {
    const h = houseById(hid); if (!h) { closeSheet(); return; }
    if (st.sel && !h.units.includes(st.sel)) { st.sel = null; st.ren = false; }
    const t = terrById(h.terrId), lay = bldLayout(h);
    const frames = h.units.length && h.units.every(u => B_FRAME.test(u));
    const fl = lay.groups.reduce((a, g) => Math.max(a, g.rows.length ? g.rows[0].fl : 0), 0);
    const tile = u => {
      const rec = unitHasRec(hid, u), uk = unitKind(h, u), fr = B_FRAME.test(u);
      return `<button type="button" class="bt${st.sel === u ? ' on' : ''}${rec ? ' rec' : ''}${fr ? ' fr' : ''}" data-bt="${esc(u)}" aria-pressed="${st.sel === u}" aria-label="${esc(unitTitle(h, u))}${rec ? '（記録あり）' : ''}">${uk !== 'home' ? kindBadge(uk) : ''}${esc(uName(h, u))}${fr ? '<small>部屋はまだ</small>' : ''}</button>`;
    };
    const actions = u => {
      if (st.ren) return `<div class="bact"><div class="inline"><input type="text" id="bRen" maxlength="12" value="${esc(uName(h, u))}" aria-label="部屋の新しい名前"><button class="btn small primary" id="bRenOk">直す</button></div>
        <button class="btn small block" id="bRenNo">やめる</button>${unitHasRec(hid, u) ? '<p class="hint">名前を直しても、これまでの記録はそのまま残ります。</p>' : ''}</div>`;
      const rec = unitHasRec(hid, u), n = visitsOf(K(hid, u)).length;
      return `<div class="bact"><p class="bact-t"><b>${esc(unitTitle(h, u))}</b>${rec ? `<span class="muted">　記録${n ? n + '件' : 'あり'}</span>` : ''}</p>
        <div class="bact-b"><button class="btn small" id="bRenGo">名前を直す</button>
        ${!rec || isAdmin() ? `<button class="btn small danger" id="bDelOne">この部屋を消す</button>` : ''}
        <button class="btn small" id="bMore">種別・記録</button></div>
        ${rec && !isAdmin() ? '<p class="hint">記録のある部屋は、区域係だけが消せます。</p>' : ''}</div>`;
    };
    const rowHtml = (g, row) => {
      const sel = st.sel && row.units.includes(st.sel);
      return `<div class="brow"><span class="bfl">${row.fl}階</span><div class="btiles">${row.units.map(tile).join('')}
        <button type="button" class="bt add" data-badd="${esc(g.pre)}|${row.fl}" aria-label="${row.fl}階に部屋を足す">＋</button></div></div>${sel ? actions(st.sel) : ''}`;
    };
    let grid = '';
    lay.groups.forEach(g => {
      if (lay.groups.length > 1 || g.pre) grid += `<p class="ugrp">${esc(g.pre || '棟の名前なし')}</p>`;
      grid += `<button type="button" class="btn block baddfl" data-bfl="${esc(g.pre)}">＋ 上に階を足す（${g.rows[0].fl + 1}階）</button>`;
      grid += g.rows.map(r => rowHtml(g, r)).join('');
    });
    if (lay.other.length) {
      grid += `<div class="brow"><span class="bfl">そのほか</span><div class="btiles">${lay.other.map(tile).join('')}</div></div>`;
      if (st.sel && lay.other.includes(st.sel)) grid += actions(st.sel);
    }

    setSheet(headHtml(t, esc(h.label || '集合住宅') + 'の編集', `区域${t ? esc(t.no) : '-'}　${fl ? fl + '階建て・' : ''}${h.units.filter(u => !B_FRAME.test(u)).length}部屋`) + `
      ${banNotice(h)}${window.chuiNotice ? window.chuiNotice(h, '') : ''}${window.aptAutoNotice ? window.aptAutoNotice(h) : ''}
      ${h.units.length ? '<button class="btn block bback" id="seqStart">← 続けて入力にもどる</button>' : ''}
      ${frames || !h.units.length ? `<button class="btn primary block" data-aptedit="${esc(h.id)}">部屋番号を入れる（階ごとにまとめて）</button>` : ''}
      <div class="bgrid">${grid || '<p class="muted">部屋がまだありません。</p>'}</div>
      <p class="hint">「＋」で次の番号の部屋を足します。部屋をタップすると、名前を直したり消したりできます。<span class="recdot" aria-hidden="true"></span>は記録のある部屋です。</p>
      <div class="aw-add"><input type="text" id="bAdd" placeholder="名前で足す（例：管理人室　305）" aria-label="名前で部屋を足す"><button class="btn small" id="bAddOk">足す</button></div>

      <p class="q">建物のこと</p>
      <label class="field bname"><span>建物名</span><span class="inline"><input type="text" id="fLabel" maxlength="30" value="${esc(h.label)}" placeholder="例：〇〇ハイツ"><button class="btn small" id="fLabelSave">保存</button></span>
        <small class="hint">住んでいる人の名前は書かないでください。</small></label>
      <label class="check locrow"><input type="checkbox" id="fLock"${h.lock ? ' checked' : ''}>オートロックの建物</label>
      <label class="field"><span>エレベーター</span><select id="fAc" class="big" aria-label="エレベーター">
        <option value=""${!h.ac ? ' selected' : ''}>まだ確かめていない</option><option value="ev"${h.ac === 'ev' ? ' selected' : ''}>あり</option><option value="no"${h.ac === 'no' ? ' selected' : ''}>なし（階段だけ）</option><option value="st"${h.ac === 'st' ? ' selected' : ''}>なし（縦階段：階段ごとに上り下り）</option></select>
        <small class="hint">分かったら直してください。高齢の方が回る建物をえらぶときに使います。</small></label>
      <label class="field bnote"><span>建物のメモ</span><textarea id="fNote" maxlength="200" rows="3" placeholder="例：1階は店、2階は駐車場。奥の階段からも入れる">${esc(h.bn || '')}</textarea></label>
      <p class="hint" style="margin-top:-6px">部屋を入力する画面の上に出ます。<b>住んでいる人の名前・国籍・年齢・病気などは書かないでください。</b></p>
      <button class="btn small" id="fNoteSave">メモを保存</button>
      <p class="q">建物ぜんたいの種別</p>${kindChips(kindOf(h))}
      <p class="hint">部屋ごとの種別は、部屋をタップして「種別・記録」で変えられます。</p>
      ${h.units.length > 1 ? '<button class="btn block" id="fRename" style="flex-direction:column;gap:0;white-space:normal;min-height:62px">部屋の名前をまとめて変える<small style="font-weight:400;font-size:14px">101→A-1 など</small></button>' : ''}
      ${isAdmin() ? `<details class="more"><summary>区域係だけの操作</summary>
        <label class="field"><span>立ち入りについて</span><select id="fBan" aria-label="立ち入りについて">
          <option value=""${!h.ban ? ' selected' : ''}>ふつう</option><option value="no"${h.ban === 'no' ? ' selected' : ''}>立入禁止</option><option value="letter"${h.ban === 'letter' ? ' selected' : ''}>手紙のみ</option></select></label>
        <button class="btn block" id="fMoveB">この建物の場所を直す</button>
        ${h.units.length ? '<button class="btn block danger" id="fUnitBulk">部屋をえらんで、まとめて削除する</button>' : ''}
      </details>` : ''}
      ${delReqOf(h.id) ? '<p class="tag-warn">この建物は削除を申請中です（区域係の確認待ち）</p>'
        : `<button class="btn small danger" id="fDel" style="margin-top:14px">${isAdmin() ? 'この建物を削除する' : 'この建物の削除を申請する'}</button>`}`);

    const S = $('#sheet'), on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    $$('[data-bt]', S).forEach(x => x.onclick = () => { st.sel = st.sel === x.dataset.bt ? null : x.dataset.bt; st.ren = false; again(); });
    $$('[data-badd]', S).forEach(x => x.onclick = () => {
      if (simpleBlock('部屋を追加')) return;
      const h2 = houseById(hid); if (!h2) return;
      const [pre, f] = x.dataset.badd.split('|'), l2 = bldLayout(h2);
      const g = l2.groups.find(y => y.pre === pre), row = g && g.rows.find(r => r.fl === +f);
      const n = g && row ? nextUnitName(h2, g, row) : '';
      if (!n) { toast('この階には、もう自動で足せません。下の「名前で足す」を使ってください'); return; }
      st.sel = null;
      save(`${n}を足しました`, h => {
        if (unitUsed(h).has(n)) return;
        const fr = `${row.fl}階`; // 階の枠だけの階に部屋を足したら、記録のない枠は消す（記録のある枠は残す）
        if (h.units.includes(fr) && !unitHasRec(hid, fr)) dropUnitData(h, [fr]);
        h.units.push(n); h.units.sort((a, b) => cmpNo(uName(h, a), uName(h, b)));
      });
    });
    $$('[data-bfl]', S).forEach(x => x.onclick = () => {
      if (simpleBlock('部屋を追加')) return;
      const h2 = houseById(hid); if (!h2) return;
      const g = bldLayout(h2).groups.find(y => y.pre === x.dataset.bfl); if (!g) return;
      const us = nextFloorUnits(h2, g), nf = g.rows[0].fl + 1;
      if (!us.length) { toast('足せる部屋がありません（同じ名前の部屋があります）'); return; }
      st.sel = null;
      save(`${nf}階を足しました（${us.length}部屋）`, h => { const used = unitUsed(h); h.units.push(...us.filter(u => !used.has(u))); h.units.sort((a, b) => cmpNo(uName(h, a), uName(h, b))); });
    });
    const addFree = () => {
      if (simpleBlock('部屋を追加')) return;
      const h2 = houseById(hid); if (!h2) return;
      const used = unitUsed(h2);
      const us = parseUnits($('#bAdd').value).map(cleanUnit).filter(u => u && !used.has(u));
      if (!us.length) { toast('新しい部屋の名前を入れてください（同じ名前の部屋は足せません）'); return; }
      save(`${us.join('・')}を足しました`, h => { h.units.push(...us); h.units.sort((a, b) => cmpNo(uName(h, a), uName(h, b))); });
    };
    on('bAddOk', addFree);
    if ($('#bAdd')) $('#bAdd').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addFree(); } };
    on('bRenGo', () => { st.ren = true; again(); setTimeout(() => { const el = $('#bRen'); if (el) { el.focus(); el.select(); } }, 50); });
    on('bRenNo', () => { st.ren = false; again(); });
    const doRen = () => {
      const h2 = houseById(hid), u = st.sel; if (!h2 || !u) return;
      const v = cleanUnit(String($('#bRen').value).replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
      if (!v) { toast('部屋の名前を入れてください'); return; }
      if (v === uName(h2, u)) { st.ren = false; again(); return; }
      if (h2.units.some(x => x !== u && (x === v || uName(h2, x) === v))) { toast(`「${v}」という部屋は、もうあります`); return; }
      st.ren = false;
      save(`${uName(h2, u)}を${v}に直しました`, h => { const m = Object.assign({}, h.ul || {}); if (v === u) delete m[u]; else m[u] = v; if (Object.keys(m).length) h.ul = m; else delete h.ul; });
    };
    on('bRenOk', doRen);
    if ($('#bRen')) $('#bRen').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doRen(); } };
    on('bDelOne', async () => {
      if (simpleBlock('部屋を削除')) return;
      const h2 = houseById(hid), u = st.sel; if (!h2 || !u) return;
      const rec = unitHasRec(hid, u);
      if (rec && !isAdmin()) { toast('記録のある部屋は、区域係だけが消せます'); return; }
      if (rec) {
        const n = visitsOf(K(hid, u)).length;
        if (!await ask(`${unitTitle(h2, u)}を消します。${n ? `この部屋の記録${n}件も見えなくなります。` : ''}よろしいですか？`)) return;
      }
      const name = uName(h2, u);
      st.sel = null;
      save(`${name}を消しました`, h => dropUnitData(h, [u]));
    });
    on('bMore', () => { const u = st.sel; if (u) openTarget(hid, u, true); });
    $$('[data-kind]', S).forEach(x => x.onclick = () => setHouseKind(hid, x.dataset.kind, again));
    if ($('#fLock')) $('#fLock').onchange = e => setHouseLock(hid, e.target.checked);
    if ($('#fBan')) $('#fBan').onchange = e => setHouseBan(hid, e.target.value, again);
    on('fMoveB', () => startMoveHouse(hid));
    on('seqStart', () => openAptSeq(hid));
    on('fRename', () => openUnitNames(hid, () => openBuilding(hid)));
    on('fLabelSave', () => { const v = $('#fLabel').value.trim().slice(0, 30); save('建物名を変えました', h => { h.label = v; }); });
    if ($('#fAc')) $('#fAc').onchange = e => { const v = e.target.value; save(v ? `${AC_NAME[v]}にしました` : 'エレベーターを「まだ確かめていない」にしました', h => { if (v) h.ac = v; else delete h.ac; }); };
    on('fNoteSave', async () => {
      const v = String($('#fNote').value || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 200);
      const h2 = houseById(hid); if (!h2 || v === (h2.bn || '')) { toast('変わったところはありません'); return; }
      const w = window.bldSens ? window.bldSens(v) : [];
      if (w.length && !await ask(`メモに「${w.join('・')}」とあります。建物のメモは、みんなが見ます。住んでいる人のこと（名前・国籍・年齢・病気など）が入っていなければ、このまま保存してください。`, { title: 'このまま保存しますか？', body: `メモに「${w.join('・')}」とあります。建物のメモは、くわしい表示の人みんなが見ます。住んでいる人のこと（名前・国籍・年齢・病気など）が入っていなければ、このまま保存してください。`, ok: '保存する', danger: false })) return;
      save(v ? '建物のメモを保存しました' : '建物のメモを消しました', h => { if (v) h.bn = v; else delete h.bn; });
    });
    on('fUnitBulk', () => openUnitBulkDel(hid));
    on('fDel', async () => {
      const h2 = houseById(hid); if (!h2) return;
      if (!isAdmin()) { closeSheet(); openDelRequest(h2); return; }
      if (!await ask(`「${h2.label || '集合住宅'}」と、すべての部屋の記録を削除します。${houseRecText(h2)}よろしいですか？`)) return;
      closeSheet(); deleteHouse(hid);
    });
  };
  paint();
}

/* ---------- 部屋をえらんで、まとめて削除する（区域係） ---------- */
function openUnitBulkDel(hid) {
  const h0 = houseById(hid); if (!h0 || !h0.units.length) return;
  if (simpleBlock('部屋を削除')) return;
  const sel = new Set();
  const paint = () => {
    const h = houseById(hid); if (!h) { closeSheet(); return; }
    const cell = u => {
      const n = visitsOf(K(hid, u)).length, uk = unitKind(h, u);
      return `<button type="button" data-bu="${esc(u)}" aria-pressed="${sel.has(u)}" aria-label="${esc(unitTitle(h, u))}${sel.has(u) ? '（えらんでいます）' : ''}">${kindBadge(uk)}${esc(uName(h, u))}<small>${n ? `記録${n}件` : '記録なし'}</small></button>`;
    };
    const groups = unitGroups(h);
    const cells = groups.length > 1
      ? groups.map(([g, us]) => `<p class="ugrp">${esc(g || 'そのほか')}</p><div class="bulkgrid">${us.map(cell).join('')}</div>`).join('')
      : `<div class="bulkgrid">${h.units.map(cell).join('')}</div>`;
    const recs = [...sel].reduce((a, u) => a + visitsOf(K(hid, u)).length, 0);
    setSheet(headHtml(terrById(h.terrId), '部屋をまとめて削除', `${esc(h.label || '集合住宅')}　${h.units.length}部屋`) + `
      <p class="hint">消したい部屋を押してえらびます（もう一度押すと、えらぶのをやめます）。部屋番号がまちがっていたとき、部屋がなくなったときに使います。</p>
      <div class="row"><button type="button" class="btn small" id="buAll">${sel.size === h.units.length ? 'えらぶのをやめる' : 'ぜんぶえらぶ'}</button>
        <span class="muted">えらんだ部屋：<b>${sel.size}</b></span></div>
      ${cells}
      ${recs ? `<div class="notice warn">えらんだ部屋には、訪問の記録が${recs}件あります。削除すると見えなくなります。</div>` : ''}
      <button class="btn danger block" id="buGo"${sel.size ? '' : ' disabled'}>${sel.size ? `えらんだ${sel.size}部屋を削除する` : '部屋をえらんでください'}</button>
      <button class="btn block" id="buBack">もどる</button>`);
    const S = $('#sheet');
    $$('[data-bu]', S).forEach(b => b.onclick = () => { const u = b.dataset.bu; if (sel.has(u)) sel.delete(u); else sel.add(u); sheetKeep = true; paint(); });
    $('#buAll').onclick = () => { if (sel.size === h.units.length) sel.clear(); else h.units.forEach(u => sel.add(u)); sheetKeep = true; paint(); };
    $('#buBack').onclick = () => openBuilding(hid);
    $('#buGo').onclick = async () => {
      const us = [...sel].filter(u => h.units.includes(u));
      if (!us.length) return;
      if (us.length === h.units.length && !await ask('すべての部屋を削除します。建物は残ります。よろしいですか？')) return;
      if (us.length < h.units.length && !await ask(`${us.map(u => uName(h, u)).join('・')} の${us.length}部屋を削除します。よろしいですか？`)) return;
      commitIn([hid], `${us.length}部屋を削除しました`, () => {
        const h2 = houseById(hid); if (!h2) return; // いつも最新の家で消す
        const del = new Set(us);
        h2.units = h2.units.filter(x => !del.has(x));
        us.forEach(u => {
          if (h2.ul) delete h2.ul[u];
          if (h2.uk) delete h2.uk[u];
          const k = K(hid, u); dncDrop(k, h2); delete D().follows[k]; delete D().released[k];
        });
        if (h2.ul && !Object.keys(h2.ul).length) delete h2.ul;
        if (h2.uk && !Object.keys(h2.uk).length) delete h2.uk;
      });
      openBuilding(hid);
    };
  };
  paint();
}

/* ---------- 集合住宅：続けて入力 ---------- */
function seqStepsHtml(st, k) {
  if (st.step === 'result') return resultChoicesHtml('押すと次の部屋へ');
  if (st.step === 'age') return ageChoicesHtml();
  if (st.step === 'interest') return interestChoicesHtml();
  if (st.step === 'follow') return followAskHtml();
  if (st.step === 'memo') return memoStepHtml(k);
  if (st.step === 'dnc') return refuseStepHtml(true);
  return '';
}
const UST_GLYPH = { met: '会', away: '留', refused: '拒', dnc: '拒' }, UST_NAME = { met: '会えた', away: '留守', refused: '拒否', dnc: '拒否' };
/* 続けて入力：今の部屋の見出しから「とばして次へ」までが画面に入るように、下から出る画面を動かす。
   部屋の一覧が長い建物で、部屋を押したり記録したりするたびに、ボタンが画面の外に出ないように（点検④U2） */
function seqShowRoom(S) {
  const room = S && S.querySelector('.seqroom'), nav = S && S.querySelector('.seqnav');
  if (!room || !nav) return;
  const sr = S.getBoundingClientRect(), top = room.getBoundingClientRect().top, bot = nav.getBoundingClientRect().bottom;
  if (bot <= sr.bottom - 4 && top >= sr.top) return; // もう見えている
  // 見出しを上の端から少し下に。入りきらないときは、見出しを上の端に。
  // 文字を大きくしているとき（画面の zoom）は、見た目の長さと scrollTop の長さがちがうので、その比で直す
  const z = S.clientHeight ? sr.height / S.clientHeight : 1;
  S.scrollTop += Math.min(top - sr.top - 12, Math.max(0, bot - sr.bottom + 16)) / (z > 0 ? z : 1);
}
function openAptSeq(hid, startUnit) {
  const h0 = houseById(hid); if (!h0 || !h0.units.length) return;
  const t = terrById(h0.terrId);
  const since = unitDoneSince(h0), inRound = since !== todayIso();
  const isRef = u => !!D().dnc[K(hid, u)];
  const doneToday = u => !isRef(u) && visitedSince(K(hid, u), since); // 緑のチェックが付く部屋
  let idx = startUnit ? Math.max(0, h0.units.indexOf(startUnit)) : h0.units.findIndex(u => !doneToday(u) && !isRef(u));
  if (idx < 0) idx = h0.units.length; // すべて入力済み
  const st = { step: 'result', age: null, interest: null, override: false, finished: idx >= h0.units.length };
  const go = i => {
    const n = (houseById(hid) || h0).units.length;
    idx = Math.max(0, i);
    Object.assign(st, { step: 'result', age: null, interest: null, override: false, finished: idx >= n });
    paint();
  };
  // 次に入力する部屋：まだ緑のチェックがなく、拒否でもない部屋
  const nextIdx = from => {
    const us = (houseById(hid) || h0).units;
    for (let i = from; i < us.length; i++) if (!doneToday(us[i]) && !isRef(us[i])) return i;
    return us.length;
  };
  const save = (result, extra) => { saveVisit(hid, houseById(hid).units[idx], result, extra, true); go(nextIdx(idx + 1)); };

  const paint = () => {
    const h = houseById(hid); if (!h) { closeSheet(); return; }
    const n = h.units.length, cnt = h.units.filter(doneToday).length, need = h.units.filter(u => !isRef(u)).length;
    let b = headHtml(t, esc(h.label || '集合住宅'), `${inRound ? '受け取ってから訪ねた部屋' : '今日入力した部屋'} ${cnt} / ${need}`);
    // 部屋のボタン：前回の結果は色だけでなく「会・留・拒」の字でも見せる。部屋が多い建物は階ごとに分ける（点検④U3）
    const chip = u => {
      const i = h.units.indexOf(u), s = statusOf(K(hid, u)), uk = unitKind(h, u), g = UST_GLYPH[s];
      return `<button class="uchip st-${s}${i === idx && !st.finished ? ' cur' : ''}${doneToday(u) ? ' donec' : ''}" data-jump="${i}" aria-label="${esc(unitTitle(h, u))}${uk !== 'home' ? '（' + kindName(uk) + '）' : ''}${g ? '（前回 ' + UST_NAME[s] + '）' : ''}へ">${kindBadge(uk)}${g ? `<b class="ust" aria-hidden="true">${g}</b>` : ''}${esc(uName(h, u))}</button>`;
    };
    const groups = h.units.length > 10 ? unitGroups(h) : [];
    b += groups.length > 1
      ? `<div class="ustrips">${groups.map(([g, us]) => `<p class="ugrp">${esc(g || 'そのほか')}</p><div class="unitstrip">${us.map(chip).join('')}</div>`).join('')}</div>`
      : `<div class="unitstrip">${h.units.map(chip).join('')}</div>`;
    b += banNotice(h) + bldMemoHtml(h);
    if (window.chuiNotice) b += window.chuiNotice(h, st.finished ? '' : h.units[idx]); // 注意（！）
    if (st.finished) {
      b += `<div class="okmsg"><b>${cnt === need ? 'すべての部屋に緑のチェックがつきました。' : '最後の部屋まで進みました。'}</b>部屋番号をタップすると、その部屋を入力できます。</div>
        <button class="btn primary block" data-close>閉じる</button>
        ${isSimple() ? '' : '<button class="btn block" id="seqBack">建物の編集</button>'}`;
    } else {
      const u = h.units[idx], k = K(hid, u), f = fol(k), last = visitsOf(k)[0];
      const other = !!f && f.by !== me().id;
      const uk2 = unitKind(h, u);
      b += `<p class="seqroom"><b>${esc(uName(h, u))}</b>${/\d$/.test(uName(h, u)) ? '号室' : ''}${uk2 !== 'home' ? ` <span class="kindtag">${kindBadge(uk2)}${kindName(uk2)}</span>` : ''} <span class="muted">（${idx + 1} / ${n}）</span></p>`;
      b += `<p class="muted">${last ? `前回：${fmtDate(last.at)}　${RESULT_LABEL[last.result]}` : 'はじめて訪ねる部屋'}</p>`;
      b += recentOtherHtml(k);
      if (D().dnc[k]) b += `<div class="notice refnote"><b>拒否の部屋です。</b>訪問しないで、次の部屋へ進んでください。</div>`;
      else if (other && !isAdmin() && !st.override && recentMet(k)) b += `<div class="notice warn"><b>再訪問を受け持っている人がいます。</b>訪問は控えてください。<span class="actions"><button class="btn small" id="seqOverride">それでも記録する</button></span></div>`;
      else b += seqStepsHtml(st, k);
      b += `<div class="seqnav">
          <button class="btn" id="seqPrev"${idx === 0 ? ' disabled' : ''}>← 前の部屋</button>
          <button class="btn" id="seqNext">とばして次へ →</button></div>
        ${navLink(h)}
        ${isSimple() ? '' : '<button class="btn block" id="seqBack">建物の編集</button>'}`;
    }
    setSheet(b);

    const S = $('#sheet'), k = st.finished ? null : K(hid, h.units[idx]);
    seqShowRoom(S); // 部屋の一覧が長いときも、今の部屋の「会えた・留守」が見えるところまで動かす（点検④U2）
    $$('[data-jump]', S).forEach(x => x.onclick = () => go(Number(x.dataset.jump)));
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
      const u2 = houseById(hid).units[idx];
      saveFollowVisit(hid, u2, $('#stepMemo').value, true, readNext('stepNext'));
      go(nextIdx(idx + 1));
    });
    $$('[data-refok]', S).forEach(x => x.onclick = () => save('refused', { age: st.age, dnc: true }));
    $$('[data-back]', S).forEach(x => x.onclick = () => { st.step = x.dataset.back; paint(); });
    const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    on('seqOverride', () => { st.override = true; paint(); });
    on('seqPrev', () => go(idx - 1));
    on('seqNext', () => go(nextIdx(idx + 1)));
    on('seqBack', () => openBuilding(hid));
  };
  paint();
}

/* ---------- 一戸建てを、アパート・マンションに変える ---------- */
function openConvertApt(hid) {
  const h = houseById(hid); if (!h || h.type !== 'house') return;
  const t = terrById(h.terrId), n = visitsOf(K(hid, '')).length;
  const f = { label: h.label || '', n: newNaming(), lock: false };
  const keep = () => {
    const l = $('#cvLabel'); if (l) f.label = l.value;
    const k = $('#cvLock'); if (k) f.lock = k.checked;
    namingKeep(f.n);
  };
  const paint = () => {
    setSheet(headHtml(t, 'アパート・マンションに変える', esc(h.label || '一戸建て')) + `
      <label class="field"><span>建物名</span><input type="text" id="cvLabel" maxlength="30" value="${esc(f.label)}" placeholder="例：〇〇ハイツ">
        <small class="hint">住んでいる人の名前は書かないでください。</small></label>
      <label class="check locrow"><input type="checkbox" id="cvLock"${f.lock ? ' checked' : ''}>オートロックの建物</label>
      ${namingHtml(f.n)}
      ${n ? `<div class="notice warn">この家の記録 ${n}件は、建物ぜんたいの記録として残り、部屋ごとの記録には入りません。</div>` : ''}
      <button class="btn primary block" id="cvSave">アパート・マンションにする</button>
      <button class="btn block" id="cvBack">もどる</button>`);
    bindNaming(f.n, () => { keep(); paint(); });
    $('#cvBack').onclick = () => openTarget(hid, '', false);
    $('#cvSave').onclick = () => {
      keep();
      const us = genUnits(f.n);
      if (!us.length) { toast('部屋の名前を入れてください'); return; }
      const label = f.label.trim();
      closeSheet();
      commitIn([hid], `${label || '建物'}をアパート・マンションにしました（${us.length}部屋）`, () => {
        h.type = 'apt'; h.units = us; h.label = label;
        if (f.lock) h.lock = true; else delete h.lock;
        delete h.prov; delete h.uk; delete h.ul; // 確かめた建物なので「仮の家」ではなくなる
      });
      setTimeout(() => openAptSeq(hid), 300);
    };
  };
  paint();
}

/* ---------- 部屋の名前の付け方（アパートを新しく作るとき・一戸建てから変えるとき） ----------
   floor：階＋番号（101, 102, 201…）　bldg：棟＋番号（A-1, A-2, B-1…）
   seq：通し番号（1, 2, 3…）　free：自由に入力（管理人室 など）
   skip49：4と9で終わる番号を使わない　pre / suf：前・後ろに付ける文字 */
const NAMING = [['floor', '階＋番号', '101, 102, 201…'], ['bldg', '棟＋番号', 'A-1, A-2, B-1…'], ['seq', '通し番号', '1, 2, 3…'], ['free', '自由に入力', '管理人室 など']];
const newNaming = () => ({ nm: 'floor', rooms: [2, 2], bldgs: [{ name: 'A', n: 4 }, { name: 'B', n: 4 }], seqN: 6, skip49: false, pre: '', suf: '', manual: '' });
function roomNums(n, skip49) {
  const out = [];
  for (let r = 1; out.length < n && r < 300; r++) { if (skip49 && (r % 10 === 4 || r % 10 === 9)) continue; out.push(r); }
  return out;
}
function genUnits(f) {
  let us = [];
  if (f.nm === 'free') us = parseUnits(f.manual);
  else if (f.nm === 'floor') f.rooms.forEach((n, i) => roomNums(n, f.skip49).forEach(r => us.push(`${i + 1}${pad(r)}`)));
  else if (f.nm === 'bldg') f.bldgs.forEach(b => roomNums(b.n, f.skip49).forEach(r => us.push(`${b.name || '?'}-${r}`)));
  else roomNums(f.seqN, f.skip49).forEach(r => us.push(String(r)));
  if (f.nm !== 'free') us = us.map(u => `${f.pre}${u}${f.suf}`);
  return [...new Set(us.map(cleanUnit).filter(Boolean))];
}
const nextBldgName = f => { const ab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const used = new Set(f.bldgs.map(b => b.name)); return [...ab].find(c => !used.has(c)) || String(f.bldgs.length + 1); };
function namingHtml(f) {
  const us = genUnits(f);
  const step = (attr, v, lbl) => `<div class="stepper"><button type="button" ${attr} data-d="-1" aria-label="${lbl}を減らす">−</button><output>${v}</output><button type="button" ${attr} data-d="1" aria-label="${lbl}を増やす">＋</button></div>`;
  let body = '';
  if (f.nm === 'floor') {
    body = `<div class="field"><span>階の数</span><div class="stepper">
        <button type="button" data-floors="-1" aria-label="階を減らす">−</button><output>${f.rooms.length}</output>
        <button type="button" data-floors="1" aria-label="階を増やす">＋</button></div></div>
      <div class="field"><span>階ごとの部屋の数</span><div class="floorlist">${f.rooms.map((n, i) =>
        `<div class="floorrow"><b>${i + 1}階</b>${step(`data-room="${i}"`, n, `${i + 1}階の部屋`)}<span class="muted">部屋</span></div>`).join('')}</div></div>`;
  } else if (f.nm === 'bldg') {
    body = `<div class="field"><span>棟の数</span>${step('data-nb="1"', f.bldgs.length, '棟')}</div>
      <div class="field"><span>棟の名前と、部屋の数</span><div class="floorlist">${f.bldgs.map((b, i) =>
        `<div class="floorrow"><input type="text" class="bname" data-bname="${i}" maxlength="4" value="${esc(b.name)}" aria-label="${i + 1}つめの棟の名前">${step(`data-broom="${i}"`, b.n, `${esc(b.name)}棟の部屋`)}<span class="muted">部屋</span></div>`).join('')}</div>
      <p class="hint">棟の名前は「A」「東」などに変えられます。</p></div>`;
  } else if (f.nm === 'seq') {
    body = `<div class="field"><span>部屋の数</span>${step('data-seq="1"', f.seqN, '部屋')}</div>`;
  } else {
    body = `<label class="field"><span>部屋の名前（空白か「、」で区切る）</span>
        <input type="text" id="nmManual" value="${esc(f.manual)}" placeholder="例：101 102 管理人室 1F店舗"></label>
      <button type="button" class="btn small" id="nmPreview">できる部屋を確認する</button>`;
  }
  const opts = f.nm === 'free' ? '' : `<label class="check"><input type="checkbox" id="nmSkip"${f.skip49 ? ' checked' : ''}>4と9で終わる番号を使わない（104・109 など）</label>
    <div class="inline"><label class="field" style="flex:1;margin:6px 0"><span>前に付ける文字</span><input type="text" id="nmPre" maxlength="6" value="${esc(f.pre)}" placeholder="例：東-"></label>
      <label class="field" style="flex:1;margin:6px 0"><span>後ろに付ける文字</span><input type="text" id="nmSuf" maxlength="6" value="${esc(f.suf)}" placeholder="例：号"></label></div>`;
  return `<p class="q">部屋の名前の付け方</p>
    <div class="nmpick">${NAMING.map(([k, l, e]) => `<button type="button" class="choice${f.nm === k ? ' on' : ''}" data-nm="${k}" aria-pressed="${f.nm === k}">${l}<small>${e}</small></button>`).join('')}</div>
    ${body}${opts}
    <div class="unitprev"><b>できる部屋：${us.length}部屋</b><div>${us.slice(0, 80).map(u => `<span>${esc(u)}</span>`).join('')}${us.length > 80 ? '<span>…</span>' : ''}</div></div>
    <p class="hint">あとからでも、部屋の名前は「部屋の名前を直す」で変えられます。</p>`;
}
function namingKeep(f) {
  $$('#sheet [data-bname]').forEach(x => { const b = f.bldgs[Number(x.dataset.bname)]; if (b) b.name = cleanUnit(x.value).slice(0, 4); });
  const g = id => $('#' + id);
  if (g('nmManual')) f.manual = g('nmManual').value;
  if (g('nmPre')) f.pre = cleanUnit(g('nmPre').value).slice(0, 6);
  if (g('nmSuf')) f.suf = cleanUnit(g('nmSuf').value).slice(0, 6);
  if (g('nmSkip')) f.skip49 = g('nmSkip').checked;
}
/* repaint：画面全体を描き直す関数（呼ぶ前に、ほかの入力欄も読んでおくこと） */
function bindNaming(f, repaint) {
  const S = $('#sheet');
  const again = () => { sheetKeep = true; repaint(); }; // 見ていた位置はそのまま
  $$('[data-nm]', S).forEach(x => x.onclick = () => { f.nm = x.dataset.nm; again(); });
  $$('[data-floors]', S).forEach(x => x.onclick = () => {
    if (Number(x.dataset.floors) > 0) { if (f.rooms.length < 40) f.rooms.push(f.rooms[f.rooms.length - 1] || 1); }
    else if (f.rooms.length > 1) f.rooms.pop();
    again();
  });
  $$('[data-room]', S).forEach(x => x.onclick = () => { const i = Number(x.dataset.room); f.rooms[i] = Math.min(40, Math.max(i === 0 ? 0 : 1, f.rooms[i] + Number(x.dataset.d))); again(); });
  $$('[data-nb]', S).forEach(x => x.onclick = () => {
    if (Number(x.dataset.d) > 0) { if (f.bldgs.length < 12) f.bldgs.push({ name: nextBldgName(f), n: (f.bldgs[f.bldgs.length - 1] || { n: 4 }).n }); }
    else if (f.bldgs.length > 1) f.bldgs.pop();
    again();
  });
  $$('[data-broom]', S).forEach(x => x.onclick = () => { const b = f.bldgs[Number(x.dataset.broom)]; b.n = Math.min(80, Math.max(1, b.n + Number(x.dataset.d))); again(); });
  $$('[data-seq]', S).forEach(x => x.onclick = () => { f.seqN = Math.min(300, Math.max(1, f.seqN + Number(x.dataset.d))); again(); });
  ['nmSkip'].forEach(id => { const el = $('#' + id); if (el) el.onchange = again; });
  ['nmPre', 'nmSuf', 'nmManual'].forEach(id => { const el = $('#' + id); if (el) el.onchange = again; });
  $$('[data-bname]', S).forEach(x => { x.onchange = again; });
  if ($('#nmPreview')) $('#nmPreview').onclick = again;
}

/* ---------- 部屋の名前を直す（記録はそのまま） ---------- */
function unitGroups(h) {
  const g = new Map();
  h.units.forEach(u => {
    const n = uName(h, u);
    let m, key = '';
    if ((m = n.match(/^(.+?)[-－ー]/))) key = /[棟館号]$/.test(m[1]) ? m[1] : m[1] + '棟';
    else if ((m = n.match(/^(\d{1,2})\d{2}$/))) key = `${Number(m[1])}階`;
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(u);
  });
  const list = [...g.entries()];
  if (list.length > 1 && list.every(([k]) => /^\d+階$/.test(k))) list.reverse(); // 階は、上の階から（建物の形に近く）
  return list;
}
function openUnitNames(hid, back) {
  const h = houseById(hid); if (!h || h.type !== 'apt' || !h.units.length) return;
  const cur = h.units.map(u => uName(h, u));
  const st = { names: cur.slice(), rule: '', letters: 'A B C D E F G H', sep: '-', pre: '', suf: '', find: '', repl: '' };
  const keep = () => {
    $$('#sheet [data-ren]').forEach(x => { st.names[Number(x.dataset.ren)] = x.value; });
    ['letters', 'sep', 'pre', 'suf', 'find', 'repl'].forEach(k => { const el = $('#rl_' + k); if (el) st[k] = el.value; });
  };
  const apply = () => {
    const L = st.letters.split(/[\s,、，]+/).filter(Boolean);
    st.names = cur.map((n, i) => {
      if (st.rule === 'floor') {
        const m = n.match(/^(\D*)(\d{1,2})(\d{2})(\D*)$/);
        if (!m) return n;
        const fl = Number(m[2]), rm = Number(m[3]);
        return `${L[fl - 1] || fl}${st.sep}${rm}`;
      }
      if (st.rule === 'seq') return String(i + 1);
      if (st.rule === 'pre') return `${st.pre}${n}${st.suf}`;
      if (st.rule === 'repl') return st.find ? n.split(st.find).join(st.repl) : n;
      if (st.rule === 'reset') return h.units[i];
      return n;
    });
  };
  const paint = () => {
    const clean = st.names.map(cleanUnit);
    const cnt = {}; clean.forEach(n => { cnt[n] = (cnt[n] || 0) + 1; });
    const dups = clean.filter(n => !n || cnt[n] > 1).length;
    const changed = clean.filter((n, i) => n !== cur[i]).length;
    const ruleBox = {
      floor: `<label class="field"><span>1階・2階・3階…に使う文字（空白で区切る）</span><input type="text" id="rl_letters" value="${esc(st.letters)}"></label>
        <label class="field"><span>間に入れる文字</span><input type="text" id="rl_sep" maxlength="2" value="${esc(st.sep)}"></label>
        <p class="hint">例：「A B C」「-」なら、101→A-1、203→B-3 になります。</p>`,
      seq: '<p class="hint">今の並び順で、1, 2, 3…にします。</p>',
      pre: `<div class="inline"><label class="field" style="flex:1"><span>前に付ける</span><input type="text" id="rl_pre" maxlength="6" value="${esc(st.pre)}" placeholder="例：東-"></label>
        <label class="field" style="flex:1"><span>後ろに付ける</span><input type="text" id="rl_suf" maxlength="6" value="${esc(st.suf)}" placeholder="例：号"></label></div>`,
      repl: `<div class="inline"><label class="field" style="flex:1"><span>この文字を</span><input type="text" id="rl_find" maxlength="8" value="${esc(st.find)}" placeholder="例：10"></label>
        <label class="field" style="flex:1"><span>これにする</span><input type="text" id="rl_repl" maxlength="8" value="${esc(st.repl)}" placeholder="例：A-"></label></div>`,
      reset: '<p class="hint">はじめに作ったときの名前にもどします。</p>'
    }[st.rule] || '';
    setSheet(headHtml(terrById(h.terrId), '部屋の名前を直す', esc(h.label || '集合住宅') + `　${h.units.length}部屋`) + `
      <div class="notice info">名前を直しても、<b>これまでの記録はそのまま残ります</b>。</div>
      <p class="q">まとめて変える</p>
      <div class="nmrules">
        <button type="button" data-rule="floor" aria-pressed="${st.rule === 'floor'}">階を文字にする<small>101→A-1、201→B-1</small></button>
        <button type="button" data-rule="seq" aria-pressed="${st.rule === 'seq'}">通し番号にする<small>1, 2, 3…</small></button>
        <button type="button" data-rule="pre" aria-pressed="${st.rule === 'pre'}">前・後ろに文字を足す<small>101→東-101</small></button>
        <button type="button" data-rule="repl" aria-pressed="${st.rule === 'repl'}">文字を置きかえる<small>10→A-（101→A-1）</small></button>
        <button type="button" data-rule="reset" aria-pressed="${st.rule === 'reset'}">はじめの名前にもどす<small>作ったときの名前</small></button>
      </div>
      ${st.rule ? `<div class="rulebox">${ruleBox}<button type="button" class="btn small primary" id="rlApply">この変え方で、下に入れる</button></div>` : ''}
      <p class="q">変える前 → 変えた後 <span class="muted" style="font-size:14px">（1つずつ直せます）</span></p>
      <div class="renlist">${h.units.map((u, i) => {
        const n = clean[i], bad = !n || cnt[n] > 1;
        return `<div class="renrow${bad ? ' dup' : n !== cur[i] ? ' chg' : ''}"><span class="old">${esc(cur[i])}</span><span aria-hidden="true">→</span>
          <input type="text" data-ren="${i}" maxlength="12" value="${esc(st.names[i])}" aria-label="${esc(cur[i])}の新しい名前"></div>`;
      }).join('')}</div>
      ${dups ? `<div class="notice warn">同じ名前か、空の名前が ${dups}か所あります。赤い欄を直してください。</div>` : ''}
      <button class="btn primary block" id="renSave"${dups || !changed ? ' disabled' : ''}>${changed ? `${changed}部屋の名前を直す` : '変わったところはありません'}</button>
      <button class="btn block" id="renBack">もどる</button>`);
    const S = $('#sheet');
    $$('[data-rule]', S).forEach(x => x.onclick = () => { keep(); st.rule = st.rule === x.dataset.rule ? '' : x.dataset.rule; sheetKeep = true; paint(); });
    if ($('#rlApply')) $('#rlApply').onclick = () => { keep(); apply(); sheetKeep = true; paint(); };
    $$('[data-ren]', S).forEach(x => { x.onchange = () => { keep(); sheetKeep = true; paint(); }; });
    $('#renBack').onclick = () => (back ? back() : closeSheet());
    $('#renSave').onclick = () => {
      keep();
      const fin = st.names.map(cleanUnit);
      const c2 = {}; fin.forEach(n => { c2[n] = (c2[n] || 0) + 1; });
      if (fin.some(n => !n || c2[n] > 1)) { sheetKeep = true; paint(); return; }
      const orig = h.units.slice();
      commitIn([hid], `部屋の名前を直しました（${fin.filter((n, i) => n !== cur[i]).length}部屋）`, () => {
        const h2 = houseById(hid) || h, ul = {}; // いつも最新の家に書く
        orig.forEach((u, i) => { if (fin[i] !== u && h2.units.includes(u)) ul[u] = fin[i]; });
        if (Object.keys(ul).length) h2.ul = ul; else delete h2.ul;
      });
      if (back) back(); else closeSheet();
    };
  };
  paint();
}

/* ---------- 家を追加 ----------
   ・一戸建て：地図をタップするだけで、続けて追加
   ・アパート／目印つき：入力画面を開いて追加（追加後も続けてタップできる） */
let addMode = 'quick', addCount = 0, delCount = 0;
const addQuick = () => addMode === 'quick';
const ADD_MSG = {
  quick: '家の場所（屋根の真ん中）をタップすると、すぐに一戸建てとして追加されます。続けてタップできます。',
  form: '追加したい場所をタップすると、入力画面が開きます。',
  del: '消したい家の印をタップすると、すぐ消えます（仮の家・記録のない家）。まちがえたら、下の「取り消す」でもどせます。記録のある家は、確かめてから消します。',
  delReq: '消したい家の印をタップすると、区域係に削除を申請します。係が確認してから消えます。'
};
/* 家を追加するメニューは、少し待つと自動で小さくなる（地図が見やすいように） */
let addFoldTimer = null;
function setAddFold(on) {
  clearTimeout(addFoldTimer);
  $('#addMiniRow').hidden = !on; // 小さくしたときも「追加を終わる」はすぐ押せるように、となりに出す
  $('#addFull').hidden = on;
  $('#addBar').classList.toggle('folded', on);
  if (!on) addFoldTimer = setTimeout(() => { if (mode === 'add') setAddFold(true); }, 5000);
  updateAddBar();
}
function updateAddBar() {
  const mini = $('#addMiniCount');
  if (mini) mini.textContent = [addCount ? `追加 ${addCount}` : '', delCount ? `削除 ${delCount}` : ''].filter(Boolean).join('　');
  if ($('#addBase')) $('#addBase').textContent = baseName === 'pale' ? '写真にする' : '地図にする';
  $('#drawAddCount').textContent = addCount ? `　家 ${addCount}件追加` : '';
  $('#addMsg').textContent = addMode === 'del' && !isAdmin() ? ADD_MSG.delReq : ADD_MSG[addMode];
  $$('#addBar [data-addmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.addmode === addMode)));
  $('#addCount').textContent = [addCount ? `追加 ${addCount}件` : '', delCount ? `削除 ${delCount}件` : ''].filter(Boolean).join('　') || '';
  if (map) $('#map').classList.toggle('deleting', mode === 'add' && addMode === 'del');
}
function addAt(ll, inDraw) {
  if (simpleBlock('家を追加')) return;
  const tid = terrOf(ll.lat, ll.lng);
  // 線引き中は、まだ区域が無い場所にも置ける（線を完成したときに区域が決まる）
  if (!tid && !inDraw) { toast('区域の線の外です。区域の中をタップしてください'); return; }
  if (map.getZoom() < 17) { toast('場所がずれないように、もう少し地図を拡大してからタップしてください'); return; }
  if (!inDraw && lockOn() && !openTerrIds().has(tid)) { toast('家は、自分の区域の中にだけ追加できます'); return; }
  if (!inDraw && needTerrConfirm(tid, null)) { guardTerr(tid, null, () => addAt(ll, inDraw)); return; }
  if (!inDraw && addMode === 'del') { toast('消したい家の印をタップしてください'); return; }
  if (inDraw ? drawTap === 'house' : addQuick()) {
    addCount++; updateAddBar();
    const note = !tid && addCount === 1 ? '。区域は線を完成すると決まります' : '';
    commitIn([], `一戸建てを追加しました（${addCount}件目）${note}`, () => { // 足した家だけを送る（改善案B2）
      D().houses.push({ id: 'h' + uid(), terrId: tid, type: 'house', lat: ll.lat, lng: ll.lng, label: '', units: [], createdAt: new Date().toISOString(), createdBy: me().id });
    });
    return;
  }
  if (tmpMarker) map.removeLayer(tmpMarker);
  tmpMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="pin st-temp">＋</div>', iconSize: [34, 34], iconAnchor: [17, 17] }), interactive: false }).addTo(map);
  openAddForm(ll, tid);
}
/* 部屋番号を作る：自分で入力した番号があればそれを使い、なければ階ごとの数から作る */
function parseUnits(text) {
  const seen = new Set();
  return String(text || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .split(/[\s,、，・]+/).map(x => x.trim()).filter(x => x && x.length <= 10 && !seen.has(x) && seen.add(x));
}
function floorUnits(rooms) {
  const out = [];
  rooms.forEach((n, i) => { for (let r = 1; r <= n; r++) out.push(`${i + 1}${pad(r)}`); });
  return out;
}
function openAddForm(ll, tid, editId) {
  const eh = editId ? houseById(editId) : null; // 家の画面の「この家を編集」から開いたとき
  if (editId && !eh) return;
  if (eh) { ll = { lat: eh.lat, lng: eh.lng }; tid = eh.terrId; }
  const t = tid ? terrById(tid) : null;
  const f = { type: 'apt', label: '', n: Object.assign(newNaming(), { rooms: [2, 4] }), kind: 'home', lock: false, cand: null, ban: '', mk: {} };
  if (mode === 'draw' && drawTap === 'house') f.type = 'house';
  if (eh) { f.type = eh.type; f.label = eh.label || ''; f.kind = kindOf(eh); f.lock = !!eh.lock; }
  const recN = eh ? visitsOf(K(eh.id, '')).length : 0;
  const nrm = x => String(x || '').replace(/[\s　]/g, '').toLowerCase();
  const keep = () => {
    if (window.chuiMark) window.chuiMark.keep(f.mk); // この家の印（chui.js）
    const l = $('#fLabel'); if (l) f.label = l.value;
    const lk2 = $('#fLock'); if (lk2) f.lock = lk2.checked;
    namingKeep(f.n);
  };
  // 建物名の欄：付近の候補（エクセルの建物）を出す。えらんでも、そのまま入力してもよい
  const pickCand = c => {
    keep();
    f.cand = c; f.label = c.n || f.label; f.lock = !!c.k; f.ban = c.b || '';
    if (c.r && c.r.length) { f.n.nm = 'free'; f.n.manual = c.r.join(' '); } // 旧区域カードの部屋（apt-heya.js）
    else if (f.n.nm === 'floor' && c.f) f.n.rooms = Array.from({ length: Math.min(40, c.f) }, (_, i) => i === 0 && c.g === 0 ? 0 : (f.n.rooms[i] != null && f.n.rooms[i] > 0 ? f.n.rooms[i] : (f.n.rooms[f.n.rooms.length - 1] || 2)));
    paint();
  };
  const bindCands = () => {
    const lab = $('#fLabel'), box = $('#fCandBox');
    if (!lab || !box || f.type !== 'apt' || !window.aptNearby) return;
    const show = () => {
      const q = nrm(lab.value);
      let list = window.aptNearby(ll, tid).list;
      if (q) list = list.filter(x => nrm(x.c.n).includes(q));
      list = list.slice(0, 5);
      box.innerHTML = list.length
        ? `<p class="hint">付近の候補（タップでえらべます）</p>` + list.map(x => window.aptCandHtml(x)).join('')
        : (q ? '' : '<p class="hint">この付近に、使える候補はありません。そのまま入力できます。</p>');
      $$('[data-ci]', box).forEach(bt => bt.onclick = () => { const x = list.find(y => y.c.i === bt.dataset.ci); if (x) pickCand(x.c); });
    };
    lab.onfocus = show;
    lab.oninput = () => { f.label = lab.value; show(); };
  };
  const paint = () => {
    const apt = f.type === 'apt';
    setSheet(headHtml(t, eh ? 'この家を編集' : 'ここに追加します', t ? `区域${esc(t.no)}　${esc(t.name)}` : '区域は、線を完成したときに決まります') + `
      <p class="q">建物の種類</p>
      <div class="choices two">
        <button class="choice${!apt ? ' on' : ''}" data-type="house" aria-pressed="${!apt}"><i class="pin st-new">家</i>一戸建て</button>
        <button class="choice${apt ? ' on' : ''}" data-type="apt" aria-pressed="${apt}"><i class="pin apt">集</i>アパート・マンション</button>
      </div>
      ${apt ? `<label class="check locrow"><input type="checkbox" id="fLock"${f.lock ? ' checked' : ''}>オートロックの建物</label>
      <p class="hint">あとからでも、建物の編集で変えられます。</p>` : ''}
      ${apt && f.cand ? `<div class="aw-from"><b>候補：${esc(f.cand.n || '（名前なし）')}</b><button id="fCandOff">はずす</button></div>
        ${f.ban ? `<div class="notice refnote"><b>${f.ban === 'no' ? '立入禁止の建物です。' : '手紙のみの建物です。'}</b></div>` : ''}` : ''}
      <label class="field"><span>${apt ? '建物名' : f.kind !== 'home' ? `${esc(kindName(f.kind))}の名前（なくてもよい）` : '目印（見た目など）'}</span>
        <input type="text" id="fLabel" maxlength="30" value="${esc(f.label)}" placeholder="${apt ? '例：〇〇ハイツ（タップで付近の候補）' : f.kind !== 'home' ? esc(KIND_PH[f.kind] || '例：〇〇') : '例：青い門・2階建て'}">
        <small class="hint">住んでいる人の名前は書かないでください。</small></label>
      ${apt ? '<div id="fCandBox"></div>' : ''}
      <p class="q">${apt ? '建物ぜんたいの種別' : '種別'}</p>${kindChips(f.kind)}
      ${apt ? '<p class="hint">部屋ごとの種別は、あとから部屋の画面で変えられます。</p>' : ''}
      ${apt ? namingHtml(f.n) : ''}
      ${eh && apt && recN ? `<div class="notice warn">この家の記録 ${recN}件は、建物ぜんたいの記録として残り、部屋ごとの記録には入りません。</div>` : ''}
      ${eh && window.chuiMark ? window.chuiMark.html(K(eh.id, ''), f.mk, { noDnc: apt }) : ''}
      <button class="btn primary block" id="fSave">${eh ? '保存する' : 'この場所に追加する'}</button>
      <button class="btn block" data-close>やめる</button>
      ${eh ? `<div class="aw-sep">${isAdmin() ? '<button class="btn block" id="fMove">この家の場所を直す</button>' : ''}
        ${delReqOf(eh.id) ? '<p class="tag-warn">この家は削除を申請中です（区域係の確認待ち）</p>'
          : `<button class="btn small danger" id="fDel">${isAdmin() ? 'この家を削除する' : 'この家の削除を申請する'}</button>`}</div>` : ''}`);
    const S = $('#sheet');
    $$('[data-type]', S).forEach(x => x.onclick = () => { keep(); f.type = x.dataset.type; paint(); });
    $$('[data-kind]', S).forEach(x => x.onclick = () => { keep(); f.kind = x.dataset.kind; paint(); });
    if ($('#fLock')) $('#fLock').onchange = e => { f.lock = e.target.checked; };
    if (f.type === 'apt') { const l = $('#fLabel'), lk = $('#fLock'); bindNaming(f.n, () => { if (l) f.label = l.value; if (lk) f.lock = lk.checked; namingKeep(f.n); paint(); }); }
    bindCands();
    if (eh && window.chuiMark) window.chuiMark.bind(S, f.mk, () => { keep(); paint(); });
    if ($('#fCandOff')) $('#fCandOff').onclick = () => { keep(); f.cand = null; f.ban = ''; paint(); };
    if ($('#fMove')) $('#fMove').onclick = () => startMoveHouse(editId);
    if ($('#fDel')) $('#fDel').onclick = async () => {
      if (!isAdmin()) { closeSheet(); openDelRequest(eh); return; }
      if (!await ask(`この家と、その記録をすべて削除します。${houseRecText(eh)}よろしいですか？`)) return;
      closeSheet(); deleteHouse(editId);
    };
    $('#fSave').onclick = () => {
      keep();
      const label = f.label.trim();
      const us = f.type === 'apt' ? genUnits(f.n) : [];
      if (f.type === 'apt' && !us.length) { toast('部屋の名前を入れてください'); return; }
      closeSheet();
      const setCand = h => { if (f.type === 'apt' && f.cand) { h.cid = f.cand.i; if (f.ban) h.ban = f.ban; } }; // 選んだ候補は、次から出ない
      if (eh) {
        commitIn([editId], f.type === 'apt' ? `${label || '建物'}をアパート・マンションにしました（${us.length}部屋）` : '保存しました', () => {
          const h = houseById(editId); if (!h) return;
          if (window.chuiMark) window.chuiMark.apply(h, '', f.mk); // この家の印（なし・！注意・拒否）
          h.label = label;
          if (f.kind !== 'home') h.kind = f.kind; else delete h.kind;
          if (f.type === 'apt') {
            h.type = 'apt'; h.units = us;
            if (f.lock) h.lock = true; else delete h.lock;
            delete h.prov; delete h.uk; delete h.ul; // 確かめた建物なので「仮の家」ではなくなる
            setCand(h);
          }
        });
        if (f.type === 'apt') setTimeout(() => openAptSeq(editId), 300); else setTimeout(() => openTarget(editId, '', false), 200);
        return;
      }
      addCount++; updateAddBar();
      commitIn([], f.type === 'apt' ? `集合住宅を追加しました（${us.length}部屋）` : '一戸建てを追加しました', () => { // 足した家だけを送る（改善案B2）
        const nh = { id: 'h' + uid(), terrId: tid, type: f.type, lat: ll.lat, lng: ll.lng, label, units: us, createdAt: new Date().toISOString(), createdBy: me().id };
        if (f.kind !== 'home') nh.kind = f.kind;
        if (f.type === 'apt' && f.lock) nh.lock = true;
        setCand(nh);
        D().houses.push(nh);
      });
    };
  };
  paint();
}

/* ---------- 区域の線引き ----------
   ・点はドラッグで動かせる。タップで選んで消せる
   ・線の途中の小さな○で点を増やせる（引き直しでは、地図をタップすると近くの線に点が入る）
   ・隣の区域の点・線の近くをタップすると、そこにくっつく
   ・隣の区域の点から点へつなぐと、その間の点もたどって入れる */
const SNAP_PX = 22, EDGE_PX = 16;
let drawSnapOn = true, drawNbMove = true; // drawNbMove：隣の区域と共有している点を動かしたら、隣の同じ点も一緒に動かす
function startDraw(targetId, opt) {
  showView('map');
  focusCard = null; roundTerr = null;
  drawShowHouses = false; $('#drawHouses').checked = false;
  addCount = 0; updateAddBar();
  setDrawFold(false);
  const t = targetId ? terrById(targetId) : null;
  const tp = t && okPoly(t.polygon) ? t.polygon : null; // 線が壊れている区域は、引き直しにする
  draw = {
    points: tp ? tp.map(p => [p[0], p[1]]) : [],
    snaps: tp ? tp.map(v => sharedSnap(v, t.id)) : [],
    origs: tp ? tp.map(v => v.slice()) : [], // 直す前の位置（隣の区域の同じ点も動かすため）
    edit: !!tp, targetId, sel: -1, hist: [], fromSen: !!(opt && opt.fromSen), // fromSen：「区域の線を直す」（kyoukai.js）から来た。終わったらそこへもどる
    line: L.polyline([], { color: '#C2410C', weight: 4, dashArray: '8 6', interactive: false }).addTo(map),
    hints: L.layerGroup().addTo(map),
    handles: L.layerGroup().addTo(map)
  };
  setMode('draw');
  setDrawTap('line');
  $('#drawTitle').textContent = t ? `区域${t.no}の形を直す` : '新しい区域の線を引く';
  $('#drawSnap').checked = drawSnapOn;
  $('#drawNbMove').checked = drawNbMove;
  // 今ある区域の形を直すときは、家の追加のボタンを出さず、上の案内も小さくして地図を広くする（「ひらく」で案内が出る）
  $('#drawBar .seg').hidden = !!t;
  if (t) setDrawFold(true);
  if (t) setTimeout(() => fitTerr(targetId), 60);
  drawHints();
  redrawDraw();
}
const samePt = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
/* 隣の区域と同じ位置にある点（共有している点） */
function sharedSnap(v, selfId) {
  for (const t of polyTerrs()) {
    if (t.id === selfId) continue;
    const i = t.polygon.findIndex(w => samePt(w, v));
    if (i >= 0) return { ll: v.slice(), tid: t.id, idx: i };
  }
  return null;
}
/* 隣の区域の点（くっつく場所）を小さく表示する */
function drawHints() {
  draw.hints.clearLayers();
  if (!drawSnapOn) return;
  polyTerrs().forEach(t => {
    if (t.id === draw.targetId) return;
    t.polygon.forEach(v => L.circleMarker(v, { radius: 4, color: '#0E7C66', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(draw.hints));
  });
}
const cpt = ll => map.latLngToContainerPoint(ll);
/* 近くの隣の区域の点、なければ線の上の点を探す */
function snapPoint(ll) {
  if (!drawSnapOn) return null;
  const p = cpt(ll);
  let best = null, bd = SNAP_PX;
  polyTerrs().forEach(t => {
    if (t.id === draw.targetId) return;
    t.polygon.forEach((v, i) => { const d = p.distanceTo(cpt(v)); if (d < bd) { bd = d; best = { ll: [v[0], v[1]], tid: t.id, idx: i }; } });
  });
  if (best) return best;
  let ed = EDGE_PX;
  polyTerrs().forEach(t => {
    if (t.id === draw.targetId) return;
    const n = t.polygon.length;
    for (let i = 0; i < n; i++) {
      const a = cpt(t.polygon[i]), b = cpt(t.polygon[(i + 1) % n]);
      const q = L.LineUtil.closestPointOnSegment(p, a, b), d = p.distanceTo(q);
      if (d < ed) { ed = d; const g = map.containerPointToLatLng(q); best = { ll: [g.lat, g.lng], tid: t.id, edge: i }; }
    }
  });
  return best;
}
function pushHist() {
  draw.hist.push({ points: draw.points.map(p => p.slice()), snaps: draw.snaps.slice(), origs: draw.origs.slice() });
  if (draw.hist.length > 60) draw.hist.shift();
}
function drawUndo() {
  if (!draw) return;
  const h = draw.hist.pop();
  if (!h) { toast('戻せる操作はありません'); return; }
  draw.points = h.points; draw.snaps = h.snaps; draw.origs = h.origs; draw.sel = -1;
  redrawDraw();
}
/* 隣の区域の点から点へ：その区域の線をたどる点の並び（近い回りと、反対回り） */
function borderPaths(a, b) {
  if (!a || !b || a.tid !== b.tid || a.idx == null || b.idx == null || a.idx === b.idx) return null;
  const poly = terrById(a.tid).polygon, n = poly.length, fwd = [], back = [];
  for (let k = (a.idx + 1) % n; k !== b.idx; k = (k + 1) % n) fwd.push(k);
  for (let k = (a.idx - 1 + n) % n; k !== b.idx; k = (k - 1 + n) % n) back.push(k);
  const len = ks => {
    const seq = [a.idx, ...ks, b.idx];
    let s = 0;
    for (let i = 1; i < seq.length; i++) s += map.distance(poly[seq[i - 1]], poly[seq[i]]);
    return s;
  };
  const toPts = ks => ks.map(k => ({ ll: [poly[k][0], poly[k][1]], snap: { tid: a.tid, idx: k } }));
  const short = len(fwd) <= len(back) ? fwd : back, other = short === fwd ? back : fwd;
  return { short: toPts(short), other: toPts(other) };
}
function drawClick(ll) {
  const s = snapPoint(ll);
  const pt = s ? s.ll : [ll.lat, ll.lng];
  pushHist();
  draw.sel = -1;
  if (draw.edit && draw.points.length >= 3) {
    // 引き直し：いちばん近い線の途中に点を入れる
    const p = cpt(L.latLng(pt));
    let at = 0, bd = Infinity;
    const n = draw.points.length;
    for (let i = 0; i < n; i++) {
      const a = cpt(draw.points[i]), b = cpt(draw.points[(i + 1) % n]);
      const d = p.distanceTo(L.LineUtil.closestPointOnSegment(p, a, b));
      if (d < bd) { bd = d; at = i + 1; }
    }
    draw.points.splice(at, 0, pt); draw.snaps.splice(at, 0, s); draw.origs.splice(at, 0, null);
    redrawDraw();
    if (s) toast(s.idx != null ? '隣の区域の点にくっつけました' : '隣の区域の線にくっつけました');
    return;
  }
  // 新しく引く：順番に足す。隣の区域の点から点なら、間の点もたどる
  const prev = draw.snaps[draw.snaps.length - 1];
  const paths = borderPaths(prev, s);
  const startLen = draw.points.length;
  const add = list => { list.forEach(x => { draw.points.push(x.ll); draw.snaps.push(x.snap); draw.origs.push(null); }); };
  if (paths && paths.short.length) add(paths.short);
  draw.points.push(pt); draw.snaps.push(s); draw.origs.push(null);
  redrawDraw();
  if (paths && (paths.short.length || paths.other.length)) {
    const swap = () => {
      // 反対回りに入れ直す
      draw.points.splice(startLen); draw.snaps.splice(startLen); draw.origs.splice(startLen);
      const cur = paths.short; paths.short = paths.other; paths.other = cur;
      add(paths.short); draw.points.push(pt); draw.snaps.push(s); draw.origs.push(null);
      redrawDraw();
      toast(`隣の区域の線を、反対回りでたどりました（${paths.short.length}点）`, null, { label: '元に戻す', fn: swap });
    };
    toast(paths.short.length ? `隣の区域の線に沿って、${paths.short.length}点を加えました` : '隣の区域の点にくっつけました',
      null, { label: '反対回りにする', fn: swap });
  } else if (s) {
    toast(s.idx != null ? '隣の区域の点にくっつけました' : '隣の区域の線にくっつけました');
  }
}
function vertexIcon(i, sel, snapped) {
  const cls = ['dv', i === 0 ? 'first' : '', sel ? 'sel' : '', snapped ? 'snapped' : ''].join(' ');
  return L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}
const midIcon = L.divIcon({ className: '', html: '<div class="dmid">＋</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
function redrawDraw() {
  const p = draw.points, n = p.length;
  draw.line.setLatLngs(n > 2 ? [...p, p[0]] : p);
  draw.handles.clearLayers();
  const setLine = () => draw.line.setLatLngs(draw.points.length > 2 ? [...draw.points, draw.points[0]] : draw.points);
  p.forEach((pt, i) => {
    const m = L.marker(pt, { icon: vertexIcon(i, i === draw.sel, !!draw.snaps[i]), zIndexOffset: 2000, keyboard: false });
    m.addTo(draw.handles);
    liftDrag(m, {
      tap: () => { draw.sel = draw.sel === i ? -1 : i; redrawDraw(); },
      start: () => { pushHist(); draw.sel = -1; },
      move: ll => { draw.points[i] = [ll.lat, ll.lng]; setLine(); },
      end: ll => {
        const s = snapPoint(ll);
        draw.snaps[i] = s;
        if (s) draw.points[i] = s.ll;
        redrawDraw();
      }
    });
  });
  // 線の途中の○：タップかドラッグで点を増やす
  const segs = n >= 3 ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m = L.marker(mid, { icon: midIcon, zIndexOffset: 1500, keyboard: false });
    m.addTo(draw.handles);
    let inserted = false;
    const insert = () => { if (inserted) return; inserted = true; pushHist(); draw.points.splice(i + 1, 0, mid.slice()); draw.snaps.splice(i + 1, 0, null); draw.origs.splice(i + 1, 0, null); draw.sel = -1; };
    liftDrag(m, {
      tap: () => { insert(); redrawDraw(); },
      start: insert,
      move: ll => { draw.points[i + 1] = [ll.lat, ll.lng]; setLine(); },
      end: ll => {
        const s = snapPoint(ll);
        draw.snaps[i + 1] = s;
        if (s) draw.points[i + 1] = s.ll;
        redrawDraw();
      }
    });
  }
  $('#drawCount').textContent = n;
  $('#drawDelPt').hidden = draw.sel < 0;
  $('#drawRestart').hidden = !n;
  $('#drawHelp').textContent = drawTap === 'line' ? (draw.edit ? DRAW_HELP.edit : DRAW_HELP.line) : DRAW_HELP[drawTap];
}
/* 線の点を指で動かす：動かしている点は、指の少し上に出す（指にかくれず、どこに置くかが見える）
   h：{ tap()：動かさずにはなした, start()：動かし始め, move(latlng), end(latlng) } */
const LIFT_PX = 64;
function liftDrag(m, h) {
  const el = m.getElement(); if (!el) return;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => {
    if ((e.button && e.button > 0) || !e.isPrimary) return;
    e.stopPropagation(); e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, mouse = e.pointerType === 'mouse';
    let on = false, lift = 0;
    const was = map.dragging.enabled(); map.dragging.disable();
    try { el.setPointerCapture(e.pointerId); } catch (er) { /* 何もしない */ }
    const pos = ev => map.containerPointToLatLng(map.mouseEventToContainerPoint({ clientX: ev.clientX, clientY: ev.clientY - lift }));
    const mv = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (!on) { if (d < 6) return; on = true; el.classList.add('lifting'); h.start(); }
      ev.preventDefault();
      lift = mouse ? 0 : Math.min(LIFT_PX, (d - 6) * 2); // 動かし始めると、点がすっと指の上に出る
      const ll = pos(ev); m.setLatLng(ll); h.move(ll);
    };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('lifting');
      if (was) map.dragging.enable();
      if (on) h.end(m.getLatLng()); else if (ev.type === 'pointerup') h.tap();
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  L.DomEvent.disableClickPropagation(el); // 点をさわったときに、地図のタップ（点を足す）にならないように
}
function deleteSelectedPoint() {
  if (!draw || draw.sel < 0) return;
  pushHist();
  draw.points.splice(draw.sel, 1); draw.snaps.splice(draw.sel, 1); draw.origs.splice(draw.sel, 1);
  draw.sel = -1;
  if (draw.points.length < 3) draw.edit = false;
  redrawDraw();
  toast('点を消しました', null, { label: '戻す', fn: drawUndo });
}
async function restartDraw() {
  if (!await ask('今の線を消して、最初から引き直します。よろしいですか？')) return;
  pushHist();
  draw.points = []; draw.snaps = []; draw.origs = []; draw.sel = -1; draw.edit = false;
  redrawDraw();
  toast('線を消しました。角を順番にタップしてください', null, { label: '戻す', fn: () => { drawUndo(); draw.edit = !!draw.targetId && draw.points.length >= 3; redrawDraw(); } });
}
function endDraw() {
  const back = draw && draw.fromSen ? draw.targetId : null;
  if (draw) { map.removeLayer(draw.line); map.removeLayer(draw.hints); map.removeLayer(draw.handles); }
  draw = null; setMode('normal');
  if (back && window.kyoukai) setTimeout(() => window.kyoukai.back(back), 0); // 「区域の線を直す」にもどる（保存のあとで）
}
async function finishDraw() {
  if (!draw) return;
  if (draw.points.length < 3) { toast('角を3か所以上にしてください'); return; }
  const pts = draw.points.map(p => p.slice());
  if (draw.targetId) {
    const t = terrById(draw.targetId);
    // 隣の区域と共有していた点を動かしたとき、隣の同じ点も動かすか
    const affected = new Map();
    draw.points.forEach((p, i) => {
      const o = draw.origs[i];
      if (!o || samePt(o, p)) return;
      polyTerrs().forEach(tt => {
        if (tt.id === t.id) return;
        tt.polygon.forEach((v, vi) => {
          if (!samePt(v, o)) return;
          if (!affected.has(tt.id)) affected.set(tt.id, []);
          affected.get(tt.id).push([vi, p.slice()]);
        });
      });
    });
    // 隣の区域と共有している点は、隣の同じ点も一緒に動かす（すき間ができないように。「ひらく」のチェックで、この区域だけにもできる）
    const alsoMove = affected.size > 0 && drawNbMove;
    const names = [...affected.keys()].map(id => `区域${terrById(id).no}`).join('・');
    endDraw();
    commit(`区域${t.no}の線を直しました${alsoMove ? `（隣の${names}も一緒に）` : ''}`, () => {
      t.polygon = pts;
      if (alsoMove) affected.forEach((list, id) => { const tt = terrById(id); list.forEach(([vi, p]) => { tt.polygon[vi] = p; }); });
      reassign();
    });
  } else {
    openTerrForm({ pts });
  }
}

function openTerrForm({ pts = null, terr = null }) {
  const maxNo = Math.max(0, ...D().territories.map(t => parseInt(normNo(t.no), 10) || 0));
  setSheet(headHtml(null, terr ? '区域の番号と名前' : '新しい区域', '') + `
    <label class="field"><span>区域番号</span>
      <input type="text" id="fNo" maxlength="10" autocomplete="off" value="${esc(terr ? terr.no : String(maxNo + 1))}">
      <small class="hint">「53」「53-1」のように入力できます（ハイフンで枝番）。</small></label>
    <label class="field"><span>区域の名前（目印になる地名など）</span><input type="text" id="fName" maxlength="30" value="${terr ? esc(terr.name) : ''}" placeholder="例：〇〇公園の北側"></label>
    <button class="btn primary block" id="fSave">保存する</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#fSave').onclick = () => {
    const no = normNo($('#fNo').value), name = $('#fName').value.trim();
    if (!terr && !okPoly(pts)) { closeSheet(); toast('区域の線がありません。線を引き直してください'); return; }
    if (!NO_RE.test(no)) { toast('区域番号は「53」「53-1」のように入力してください'); return; }
    if (D().territories.some(t => String(t.no) === no && t !== terr)) { toast(`区域${no}はすでにあります`); return; }
    closeSheet();
    if (terr) {
      commit('区域の番号と名前を変えました', () => { terr.no = no; terr.name = name || `区域${no}`; });
    } else {
      endDraw();
      commit(`区域${no}を作りました`, () => {
        D().territories.push({ id: 't' + uid(), no, name: name || `区域${no}`, polygon: pts, holder: null, lentAt: null });
        reassign();
      });
    }
  };
}

/* 古いカードの写真・PDFを重ねる
   ・合わせるとき：写真は画面に固定。地図を動かして道を重ねる（回転も調整できる）
   ・固定したあと：写真は地図にくっつき、地図を動かすと一緒に動く
   ・PDFは、えらんだ1ページだけを画像にして重ねる（ファイルは端末の中だけで使い、どこにも送らない） */
let ovState = null; // { url, pinned, rot, center, refZoom, w, h, el, pdf }
let drawShowHouses = false, drawTap = 'line';
const DRAW_HELP = {
  line: '区域の角を順番にタップします。隣の区域の点（緑の○）の近くをタップすると、その点にくっつきます。点はドラッグで動かせ、タップで選ぶと消せます。',
  edit: '点をドラッグして動かします（動かしている点は、指の少し上に出ます）。点をタップして選ぶと「選んだ点を消す」で消せます。線の途中の＋や、線の近くをタップすると点が増えます。隣の区域と共有している点は、隣も一緒に動きます。',
  house: '家の場所（屋根の真ん中）をタップすると、一戸建てが追加されます。まちがえたときは、お知らせの「取り消す」を押します。',
  apt: 'アパートの場所をタップすると、部屋の数を入れる画面が開きます。'
};
function setDrawTap(v) {
  if (v !== 'line' && simpleBlock('家を追加')) v = 'line';
  drawTap = v;
  $$('#drawBar [data-drawtap]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.drawtap === v)));
  $('#drawUndo').hidden = v !== 'line';
  if (draw) { draw.sel = -1; redrawDraw(); } else $('#drawHelp').textContent = DRAW_HELP[v];
  $('#drawDelPt').hidden = true;
  $('#drawRestart').hidden = v !== 'line' || !draw || !draw.points.length;
  if (draw) draw.handles[v === 'line' ? 'addTo' : 'remove'](map);
  $('#drawHouses').parentNode.hidden = v !== 'line';
  closeSheet();
  renderHouses();
}
function setDrawFold(mini) {
  $('#drawBar').classList.toggle('mini', mini);
  $('#drawFold').textContent = mini ? 'ひらく' : 'たたむ';
  $('#drawFold').setAttribute('aria-expanded', String(!mini));
}
function applyOv() {
  map.getPane('tilePane').style.opacity = $('#ovRange').value / 100;
}
function applyRot() {
  if (!ovState) return;
  $('#overlayImg').style.transform = `rotate(${ovState.rot}deg)`;
  $('#ovRotVal').textContent = `${ovState.rot > 0 ? '右に' : ovState.rot < 0 ? '左に' : ''}${Math.abs(ovState.rot)}°`;
  placeOverlay();
}
function loadOverlay(file) {
  if (/pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '')) { openPdf(file); return; }
  setOverlayUrl(URL.createObjectURL(file), false);
}
function setOverlayUrl(url, fromPdf) {
  clearOverlay();
  ovState = { url, pinned: false, rot: 0, pdf: !!fromPdf };
  const img = $('#overlayImg');
  img.src = url; img.hidden = false;
  $('#ovRot').value = 0;
  $('#map').classList.add('see-through');
  applyOv(); applyRot(); updateOvUi();
  toast('地図を動かして、カードの道と地図の道を重ねてください');
}
function updateOvUi() {
  $('#ovCtl').hidden = !ovState;
  if (!ovState) return;
  const p = ovState.pinned;
  $('#ovPin').textContent = p ? '写真の位置を合わせ直す' : '写真を地図に固定する';
  $('#ovPin').classList.toggle('primary', !p);
  $('#ovPage').hidden = !(ovState.pdf && pdfDoc);
  $('#ovPage').textContent = `PDFのページを変える（今 ${pdfPage}ページ目）`;
  $('#ovRotRow').hidden = p;
  $('#ovHint').textContent = p
    ? '写真は地図に固定されています。地図を動かしたり拡大・縮小しても、写真が一緒に動きます。'
    : '地図を動かしたり拡大・縮小して、写真の道と地図の道を重ねます（＋−ボタンは細かく動きます）。傾いているときは「写真の回転」で直し、重なったら「写真を地図に固定する」を押します。';
}
function pinOverlay() {
  const img = $('#overlayImg');
  if (!ovState || !img.naturalWidth) { toast('写真の読み込みが終わってから押してください'); return; }
  const sz = map.getSize();
  const s = Math.min(sz.x / img.naturalWidth, sz.y / img.naturalHeight);
  Object.assign(ovState, {
    w: img.naturalWidth * s, h: img.naturalHeight * s,
    center: map.containerPointToLatLng([sz.x / 2, sz.y / 2]),
    refZoom: map.getZoom(), pinned: true, pinDeg: mapDeg // 固定したときの地図の向き
  });
  if (!ovState.el) {
    ovState.el = document.createElement('img');
    ovState.el.className = 'cardimg leaflet-zoom-hide';
    ovState.el.alt = '';
    ovState.el.src = ovState.url;
  }
  map.getPane('cardPane').appendChild(ovState.el);
  img.hidden = true;
  placeOverlay(); updateOvUi();
  if (mode === 'draw') setDrawFold(true); // 作業する地図を広くする
  toast('写真を地図に固定しました。上の案内は小さくしました（「ひらく」で戻せます）');
}
function unpinOverlay() {
  if (!ovState || !ovState.pinned) return;
  map.setView(ovState.center, ovState.refZoom, { animate: false });
  setMapDeg(ovState.pinDeg || 0); // 固定したときの向きにもどしてから、合わせ直す
  ovState.pinned = false;
  if (ovState.el) ovState.el.remove();
  $('#overlayImg').hidden = false;
  applyRot(); updateOvUi();
}
function placeOverlay() {
  if (!ovState || !ovState.pinned || !map) return;
  const p = map.latLngToLayerPoint(ovState.center);
  const k = map.getZoomScale(map.getZoom(), ovState.refZoom);
  const w = ovState.w * k, h = ovState.h * k, el = ovState.el;
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  el.style.left = `${p.x - w / 2}px`; el.style.top = `${p.y - h / 2}px`;
  el.style.transform = `rotate(${ovState.rot - (ovState.pinDeg || 0)}deg)`; // 写真は地図と一緒に回るので、固定したときの向きの分をもどす
}
function clearOverlay() {
  if (ovState) {
    if (ovState.el) ovState.el.remove();
    URL.revokeObjectURL(ovState.url);
  }
  ovState = null;
  const img = $('#overlayImg');
  img.removeAttribute('src'); img.hidden = true; img.style.transform = '';
  $('#ovCtl').hidden = true;
  $('#map').classList.remove('see-through');
  if (map) map.getPane('tilePane').style.opacity = '';
}

/* ---------- PDFのカード（60ページのPDFでも、使うページだけを画像にする） ---------- */
let pdfDoc = null, pdfName = '', pdfPage = 1, pdfJob = 0;
async function openPdf(file) {
  toast('PDFを開いています…');
  try {
    await loadScript(LIB.pdf);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
    const data = new Uint8Array(await file.arrayBuffer());
    if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) { /* 何もしない */ } }
    pdfDoc = await window.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; // isEvalSupported:false＝細工したPDFでスクリプトが動く弱点（CVE-2024-4367）の公式の回避策（点検①S4）
    pdfName = file.name || 'PDF';
    pdfPage = 1;
    openPdfPicker();
  } catch (e) {
    pdfDoc = null;
    infoSheet('PDFを開けませんでした', 'インターネットにつながっているか、ファイルが壊れていないかを確認して、もう一度えらんでください。パスワード付きのPDFは開けません。');
  }
}
async function renderPdfPage(num, maxPx) {
  const page = await pdfDoc.getPage(num);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: maxPx / Math.max(v1.width, v1.height) });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c;
}
function openPdfPicker() {
  if (!pdfDoc) return;
  const n = pdfDoc.numPages;
  const go = p => { pdfPage = Math.min(n, Math.max(1, Math.round(p) || 1)); paint(); };
  const paint = () => {
    setSheet(headHtml(null, '重ねるページをえらぶ', `${esc(pdfName)}　全${n}ページ`) + `
      <div class="field"><span>ページ</span><div class="stepper">
        <button type="button" data-pg="-1" aria-label="前のページ">−</button>
        <output class="wide">${pdfPage} / ${n}</output>
        <button type="button" data-pg="1" aria-label="次のページ">＋</button></div></div>
      <label class="field"><span>ページ番号を入れて移動</span><span class="inline">
        <input type="number" id="pgNum" min="1" max="${n}" value="${pdfPage}" inputmode="numeric"><button class="btn small" id="pgGo">移動</button></span></label>
      <div class="pdfbox"><canvas id="pdfPrev" width="10" height="10" aria-label="${pdfPage}ページ目の見本"></canvas><p class="muted" id="pdfWait">表示しています…</p></div>
      <button class="btn primary block" id="pgUse">このページを地図に重ねる</button>
      <button class="btn block" data-close>やめる</button>`);
    const S = $('#sheet');
    $$('[data-pg]', S).forEach(x => x.onclick = () => go(pdfPage + Number(x.dataset.pg)));
    $('#pgGo').onclick = () => go(Number($('#pgNum').value));
    $('#pgUse').onclick = usePdfPage;
    const job = ++pdfJob;
    renderPdfPage(pdfPage, 900).then(c => {
      const pv = $('#pdfPrev');
      if (job !== pdfJob || !pv) return;
      pv.width = c.width; pv.height = c.height;
      pv.getContext('2d').drawImage(c, 0, 0);
      $('#pdfWait').hidden = true;
    }).catch(() => { const w = $('#pdfWait'); if (w && job === pdfJob) w.textContent = 'このページは表示できませんでした'; });
  };
  paint();
}
async function usePdfPage() {
  const btn = $('#pgUse');
  if (btn) { btn.disabled = true; btn.textContent = '準備しています…'; }
  try {
    const c = await renderPdfPage(pdfPage, 2400); // 拡大しても道が読める細かさ
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('blob');
    closeSheet();
    setOverlayUrl(URL.createObjectURL(blob), true);
  } catch (e) {
    toast('このページを画像にできませんでした');
    if (btn) { btn.disabled = false; btn.textContent = 'このページを地図に重ねる'; }
  }
}

/* ---------- マイマップ（KML・KMZ）から区域を取り込む ----------
   ・区域の線（図形・閉じた線）だけを取り込む。ピン（家の印）は、個人情報を含むことがあるので取り込まない
   ・説明欄も読まない。取り込むのは「名前」と「線の位置」だけ
   ・ファイルはこの端末の中で読むだけで、「取り込む」を押すまでどこにも送らない */
const IMPORT_SNAP_M = 3, SIMPLIFY_M = 1;
const mXY = (p, cosLat) => [p[1] * 111320 * cosLat, p[0] * 110540];
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}
/* 形を変えない程度に点を減らす（線を直すときに点が多すぎると操作しにくいため） */
function simplifyRing(pts, tol) {
  if (pts.length <= 4) return pts;
  const cosLat = Math.cos(pts[0][0] * Math.PI / 180), xy = pts.map(p => mXY(p, cosLat));
  const keep = new Uint8Array(pts.length), last = pts.length - 1;
  let far = 0, fd = -1;
  xy.forEach((q, i) => { const d = (q[0] - xy[0][0]) ** 2 + (q[1] - xy[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
  keep[0] = keep[far] = keep[last] = 1;
  const stack = [[0, far], [far, last]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let mi = -1, md = tol;
    for (let i = a + 1; i < b; i++) { const d = segDist(xy[i], xy[a], xy[b]); if (d > md) { md = d; mi = i; } }
    if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}
function ringAreaM2(pts) {
  const cosLat = Math.cos(pts[0][0] * Math.PI / 180), xy = pts.map(p => mXY(p, cosLat));
  let a = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) a += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]);
  return Math.abs(a / 2);
}
/* 同じ位置の点が続いていたら1つにする（始めと終わりが同じ点も1つに） */
function dropDup(pts) {
  const out = [];
  pts.forEach(p => { if (!out.length || distM(out[out.length - 1], p) > 0.2) out.push(p); });
  while (out.length > 1 && distM(out[0], out[out.length - 1]) <= 0.2) out.pop();
  return out;
}
function kmlCoords(el) {
  const c = el && el.getElementsByTagNameNS('*', 'coordinates')[0];
  if (!c) return [];
  return c.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number))
    .filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]) && Math.abs(a[1]) <= 90 && Math.abs(a[0]) <= 180)
    .map(a => [a[1], a[0]]);
}
/* マイマップの名前から、区域番号と名前を分ける（例：「区域12 〇〇公園」→ 12 と 〇〇公園） */
function splitName(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/[0-9０-９]+(?:\s*[-－ー―‐−–—]\s*[0-9０-９]+)*/);
  const no = m ? normNo(m[0]) : '';
  let name = m ? s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length) : s;
  name = name.replace(/区域|番号|No\.?|№|＃|#/gi, ' ')
    .replace(/^[\s・:：\-_、。()（）「」]+|[\s・:：\-_、。()（）「」]+$/g, '')
    .replace(/\s+/g, ' ').trim();
  return { no, name: (name || (no ? `区域${no}` : '')).slice(0, 30) };
}
function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
  const out = { rows: [], pins: 0, network: doc.getElementsByTagNameNS('*', 'NetworkLink').length > 0 };
  for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
    const nameEl = [...pm.children].find(c => c.localName === 'name');
    const raw = nameEl ? nameEl.textContent.trim() : '';
    const cands = [];
    for (const p of pm.getElementsByTagNameNS('*', 'Polygon')) {
      const ob = p.getElementsByTagNameNS('*', 'outerBoundaryIs')[0] || p;
      const pts = dropDup(kmlCoords(ob));
      if (pts.length >= 3) cands.push({ pts, open: false });
    }
    for (const l of pm.getElementsByTagNameNS('*', 'LineString')) {
      const orig = kmlCoords(l), pts = dropDup(orig);
      if (pts.length >= 3) cands.push({ pts, open: distM(orig[0], orig[orig.length - 1]) > 15 });
    }
    if (!cands.length) {
      if (pm.getElementsByTagNameNS('*', 'Point').length) out.pins++;
      continue;
    }
    cands.forEach(c => { c.area = ringAreaM2(c.pts); });
    cands.sort((a, b) => b.area - a.area);
    const c = cands[0], notes = [];
    if (cands.length > 1) notes.push(`${cands.length}つに分かれていたので、いちばん大きい部分を使います`);
    if (c.open) notes.push('線の始めと終わりが離れていたので、つないで区域にしました');
    const { no, name } = splitName(raw);
    out.rows.push({ raw, no, name, poly: simplifyRing(c.pts, SIMPLIFY_M), notes, act: 'new' });
  }
  return out;
}
const conflictOf = r => (r.no ? D().territories.find(t => String(t.no) === normNo(r.no)) : null);
async function readKmlFile(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    let text;
    if (head[0] === 0x50 && head[1] === 0x4B) { // KMZ（圧縮されたKML）
      toast('KMZファイルを開いています…');
      await loadScript(LIB.zip);
      const zip = await window.JSZip.loadAsync(file);
      const f = zip.file('doc.kml') || zip.file(/\.kml$/i)[0];
      if (!f) throw new Error('nokml');
      text = await f.async('string');
    } else {
      text = await file.text();
    }
    const parsed = parseKml(text);
    if (!parsed.rows.length) {
      infoSheet('区域の線が見つかりませんでした', parsed.network
        ? 'このファイルには地図の中身が入っていません。マイマップで書き出すときに「ネットワーク リンク」のチェックを外して、もう一度書き出してください。'
        : 'マイマップで区域を「線」または「図形」で描いているか確認してください。ピンだけの地図は取り込めません。');
      return;
    }
    const seen = new Set();
    parsed.rows.sort((a, b) => (a.no ? 0 : 1) - (b.no ? 0 : 1) || cmpNo(a.no, b.no));
    parsed.rows.forEach(r => {
      if (r.no && seen.has(r.no)) { r.act = 'skip'; r.notes.push('同じ番号がファイルの中にもう1つあります'); }
      else if (conflictOf(r)) r.act = 'skip'; // すでにある区域は、はじめは取り込まない
      if (r.no) seen.add(r.no);
    });
    openImportSheet(parsed, file.name || '');
  } catch (e) {
    infoSheet('ファイルを読み込めませんでした', 'Googleマイマップの「KML/KMZにエクスポート」で書き出したファイルを選んでください。KMZのときは、インターネットにつながっている必要があります。');
  }
}
function openImportSheet(parsed, fileName) {
  const rows = parsed.rows;
  const opt = { snap: true };
  const rowHtml = (r, i) => {
    const ex = conflictOf(r);
    if (ex && r.act === 'new') r.act = 'skip';
    if (!ex && r.act === 'replace') r.act = 'new';
    const opts = ex
      ? [['replace', `区域${ex.no}の線を置き換える`], ['skip', '取り込まない']]
      : [['new', '新しい区域として取り込む'], ['skip', '取り込まない']];
    return `<article class="improw${r.act === 'skip' ? ' skip' : ''}" data-i="${i}">
      <label><span>区域番号</span><input type="text" data-f="no" maxlength="10" autocomplete="off" value="${esc(r.no)}" placeholder="例：12"></label>
      <label><span>名前</span><input type="text" data-f="name" maxlength="30" value="${esc(r.name)}"></label>
      <label class="span"><select data-f="act" aria-label="この区域をどうするか">${opts.map(([v, l]) => `<option value="${v}"${v === r.act ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="muted span">マイマップでの名前：${esc(r.raw || '（名前なし）')}　角 ${r.poly.length}か所${ex ? '　<b>同じ番号の区域があります</b>' : ''}</p>
      ${r.notes.map(n => `<p class="muted span">※ ${esc(n)}</p>`).join('')}
    </article>`;
  };
  const updateCount = () => {
    const n = rows.filter(r => r.act !== 'skip').length, b = $('#imGo');
    if (!b) return;
    b.textContent = n ? `${n}件を取り込む` : '取り込む区域がありません';
    b.disabled = !n;
  };
  const paint = keepScroll => {
    const top = keepScroll ? $('#sheet').scrollTop : 0;
    const nCon = rows.filter(r => conflictOf(r)).length;
    setSheet(headHtml(null, 'マイマップから区域を取り込む', esc(fileName)) + `
      <div class="notice info"><b>区域の線が ${rows.length}件見つかりました。</b>${parsed.pins
        ? `<br>ピン（家の印など）${parsed.pins}件は取り込みません。拒否の家など、個人情報が入っていることがあるためです。必要な家は、係が確認してから地図で追加してください。` : ''}</div>
      <p class="hint">区域番号と名前を確認してください。名前に住んでいる人の名前が入っていないかも確認してください。<br>「取り込む」を押すまで、どこにも送りません。</p>
      ${nCon ? `<div class="notice warn">すでにある区域と番号が同じものが ${nCon}件あります。はじめは「取り込まない」にしています。
        <span class="actions"><button class="btn small" id="imAllRep">同じ番号の区域は、すべて線を置き換える</button></span></div>` : ''}
      <label class="check"><input type="checkbox" id="imSnap"${opt.snap ? ' checked' : ''}>隣の区域と近い角（${IMPORT_SNAP_M}m以内）を、同じ点にそろえる</label>
      <p class="hint">そろえると、あとで線を直すときに、隣の区域と一緒に動かせます。</p>
      <div id="imRows">${rows.map(rowHtml).join('')}</div>
      <button class="btn primary block" id="imGo"></button>
      <button class="btn block" data-close>やめる</button>`);
    if (keepScroll) $('#sheet').scrollTop = top;
    updateCount();
    const box = $('#imRows');
    box.addEventListener('input', e => {
      const x = e.target, r = rows[Number(x.closest('[data-i]').dataset.i)];
      if (x.dataset.f === 'name') r.name = x.value;
    });
    box.addEventListener('change', e => {
      const x = e.target, row = x.closest('[data-i]'), r = rows[Number(row.dataset.i)];
      if (x.dataset.f === 'no') { r.no = normNo(x.value); paint(true); }
      else if (x.dataset.f === 'act') { r.act = x.value; row.classList.toggle('skip', r.act === 'skip'); updateCount(); }
    });
    $('#imSnap').onchange = e => { opt.snap = e.target.checked; };
    if ($('#imAllRep')) $('#imAllRep').onclick = () => { rows.forEach(r => { if (conflictOf(r)) r.act = 'replace'; }); paint(true); };
    $('#imGo').onclick = () => doImport(rows, opt.snap);
  };
  paint(false);
}
/* 近い点をそろえる：すでにある区域の角と、先に取り込んだ区域の角に合わせる */
function snapToPool(pts, pool) {
  return pts.map(p => {
    const cosLat = Math.cos(p[0] * Math.PI / 180);
    let best = null, bd = IMPORT_SNAP_M;
    for (const q of pool) {
      const dy = (q[0] - p[0]) * 110540;
      if (dy > bd || dy < -bd) continue;
      const dx = (q[1] - p[1]) * 111320 * cosLat;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) return [best[0], best[1]];
    pool.push(p);
    return p;
  });
}
function doImport(rows, snap) {
  const use = rows.filter(r => r.act !== 'skip');
  if (!use.length) return;
  const nos = new Set();
  for (const r of use) {
    r.no = normNo(r.no);
    const label = r.raw || r.name || '名前なし';
    if (!NO_RE.test(r.no)) { toast(`「${label}」の区域番号を入れてください（例：12、12-1）`); return; }
    if (nos.has(r.no)) { toast(`区域番号${r.no}が2つあります。どちらかを直すか「取り込まない」にしてください`); return; }
    nos.add(r.no);
    r.target = r.act === 'replace' ? conflictOf(r) : null;
    if (r.act === 'new' && conflictOf(r)) { toast(`区域${r.no}はすでにあります`); return; }
    if (r.act === 'replace' && !r.target) { toast(`区域${r.no}が見つかりません`); return; }
  }
  const replaced = new Set(use.filter(r => r.target).map(r => r.target.id));
  const pool = [];
  if (snap) polyTerrs().forEach(t => { if (!replaced.has(t.id)) t.polygon.forEach(p => pool.push(p)); });
  const polys = use.map(r => {
    const base = r.poly.map(p => p.slice());
    if (!snap) return base;
    const s = dropDup(snapToPool(base, pool));
    return s.length >= 3 ? s : base;
  });
  const nNew = use.filter(r => !r.target).length, nRep = use.length - nNew;
  closeSheet();
  commit(`区域を取り込みました（新しく${nNew}件${nRep ? `・線の置き換え${nRep}件` : ''}）`, () => {
    use.forEach((r, i) => {
      if (r.target) r.target.polygon = polys[i];
      else D().territories.push({ id: 't' + uid(), no: r.no, name: r.name.trim() || `区域${r.no}`, polygon: polys[i], holder: null, lentAt: null });
    });
    reassign();
  });
  firstMapShow = false;
  showView('map');
  setTimeout(fitAll, 120);
}

/* ---------- エクセル（シートごとの住所の一覧）から、区域と家を取り込む ----------
   ・1つのシート＝1つの区域。シート名が「(CH)Chatan」なら、区域番号 CH・名前 Chatan
   ・読むのは「住所・建物・部屋・状態」の列だけ。名前・国・メモの列は読まない（どこにも送らず、保存もしない）
   ・住所は、国土地理院の住所検索で地図の位置にする（送るのは住所の文字だけ）
   ・区域の線は、その区域の家をぜんぶ囲む形で自動で作る（家から XL_PAD_M m 外側）
   ・引っ越した・亡くなった家（Se mudó・Se mudaron・falleció）は入れない。「No Visitar」は拒否の家として入れる
   ・住所が丁目までしか分からなかった家は「場所を確かめる家」として最後に一覧で出す（係が「この家の場所を直す」で直せる） */
LIB.xlsx = 'vendor/xlsx-0.18.5/xlsx.full.min.js';
const XL_PAD_M = 250;   // 区域の線を、家からどれだけ外側に引くか（m）
const XL_DUP_M = 6;     // すでにある家とこれより近ければ、同じ家とみなして入れない（m）
const XL_GSI = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';
/* シート名（ローマ字）→ 市町村 */
const XL_MUNI = {
  chatan: '北谷町', ginowan: '宜野湾市', ginoza: '宜野座村', haebaru: '南風原町', nakagusuku: '中城村', naha: '那覇市',
  nanjo: '南城市', nishihara: '西原町', kadena: '嘉手納町', kin: '金武町', kitanaka: '北中城村', kitanakagusuku: '北中城村',
  okinawa: '沖縄市', onna: '恩納村', tomigusuku: '豊見城市', urasoe: '浦添市', uruma: 'うるま市', yomitan: '読谷村',
  yonabaru: '与那原町', itoman: '糸満市', yaese: '八重瀬町', nago: '名護市', motobu: '本部町', nakijin: '今帰仁村',
  higashi: '東村', ogimi: '大宜味村', kunigami: '国頭村', ie: '伊江村', miyakojima: '宮古島市', ishigaki: '石垣市',
  kumejima: '久米島町'
};
const XL_MUNI_LIST = Array.from(new Set(Object.values(XL_MUNI))).sort((a, b) => b.length - a.length);
/* ローマ字の地名 → 漢字（住所の欄が日本語で書かれていない行のため）。市町村ごと */
const XL_TOWN = {
  '北谷町': { chatan: '北谷', kitamae: '北前', mihama: '美浜', miyagi: '宮城', sunabe: '砂辺', kuwae: '桑江', yoshihara: '吉原', toubaru: '桃原', tobaru: '桃原', ihei: '伊平', kamiseido: '上勢頭', hamagawa: '浜川' },
  '宜野湾市': { kakazu: '嘉数', ganeko: '我如古', ginowan: '宜野湾', ojana: '大謝名', mashiki: '真志喜', kiyuna: '喜友名', aichi: '愛知', oyama: '大山', isa: '伊佐', futenma: '普天間', uchidomari: '宇地泊', shimashi: '志真志', nodake: '野嵩', kamiyama: '神山', nagata: '長田', maehara: '真栄原' },
  '宜野座村': { ginoza: '宜野座', kanna: '漢那', matsuda: '松田', sokei: '惣慶', fukuyama: '福山' },
  '南風原町': { tsukazan: '津嘉山', kanegusuku: '兼城', miyahira: '宮平', kyan: '喜屋武', teruya: '照屋' },
  '中城村': { ishado: '伊舎堂', wauke: '和宇慶', wakue: '和宇慶', minamiuebaru: '南上原', arakaki: '新垣', uehara: '上原', toma: '当間', tsuha: '津覇', kuba: '久場' },
  '那覇市': { kokuba: '国場', higawa: '樋川', asato: '安里', tomari: '泊', maejima: '前島', wakasa: '若狭', kume: '久米', nishi: '西', uenoya: '上之屋', izumizaki: '泉崎', matsukawa: '松川', mihara: '三原', makishi: '牧志', matsuo: '松尾', kumoji: '久茂地', shuri: '首里', omoromachi: 'おもろまち', yogi: '与儀', tsuboya: '壺屋', oroku: '小禄', akamine: '赤嶺', ameku: '天久', kainan: '開南', furujima: '古島', aja: '安謝' },
  '南城市': { ozato: '大里', takahira: '大里高平', hyakuna: '玉城百名', tamaki: '玉城', sashiki: '佐敷', chinen: '知念', inamine: '大里稲嶺' },
  '西原町': { morikawa: '森川', chibara: '千原', onaga: '翁長', kohatsu: '小波津', gaja: '我謝', kaneku: '兼久', uchima: '内間', yonagusuku: '与那城', tanabaru: '棚原' },
  '嘉手納町': { mizugama: '水釜', kadena: '嘉手納', yara: '屋良', noguni: '野国', nozato: '野里' },
  '金武町': { kin: '金武', igei: '伊芸', yaka: '屋嘉' },
  '北中城村': { toguchi: '渡口', yagibaru: '屋宜原', waniya: '和仁屋', kishaba: '喜舎場', shimabuku: '島袋', atta: '熱田', aniya: '安谷屋', ogido: '荻道' },
  '沖縄市': { ageda: '安慶田', uechi: '上地', akemichi: '明道', awase: '泡瀬', nakasone: '仲宗根町', chuo: '中央', misato: '美里', shiromaecho: '城前町', chiromaecho: '城前町', chibana: '知花', ikehara: '池原', noborikawa: '登川', moromizato: '諸見里', goya: '胡屋', kamara: '嘉間良', sumiyoshi: '住吉', minamitobaru: '南桃原', sonda: '園田', yogi: '与儀', hiyagon: '比屋根', takahara: '高原', higashi: '東', kaiho: '海邦', koza: '古謝', tobaru: '桃原', kubota: '久保田', yamazato: '山里', yamauchi: '山内', teruya: '照屋', miyazato: '宮里', matsumoto: '松本', izumi: '泉' },
  '恩納村': { kaneku: '前兼久', maeganeku: '前兼久', fuchaku: '冨着', onna: '恩納', nakadomari: '仲泊', yamada: '山田', tancha: '谷茶', seragaki: '瀬良垣', afuso: '安富祖' },
  '豊見城市': { madanbashi: '真玉橋', zayasu: '座安', nesabu: '根差部', tomigusuku: '豊見城', kakazu: '嘉数', iraha: '伊良波', takamine: '高嶺' },
  '浦添市': { makiminato: '牧港', minatogawa: '港川', gusukuma: '城間', serikyaku: '勢理客', yafuso: '屋富祖', takushi: '沢岻', miyagi: '宮城', iso: '伊祖', uchima: '内間', nakama: '仲間', maeda: '前田', kyozuka: '経塚' },
  'うるま市': { ishikawa: '石川', takaesu: '高江洲', gushikawa: '具志川', agena: '安慶名', akamichi: '赤道', taba: '田場', kawasaki: '川崎', akano: '赤野', nakamine: '仲嶺', uezu: '上江洲', ota: '大田', konbu: '昆布', shioya: '塩屋', miyazato: '宮里', yakena: '与那城屋慶名', henza: '与那城平安座' },
  '読谷村': { sobe: '楚辺', namihira: '波平', senaha: '瀬名波', toya: '渡慶次', zakimi: '座喜味', kina: '喜名', furugen: '古堅', takashiho: '高志保', toguchi: '渡具知' },
  '与那原町': { yonabaru: '与那原', ueyonabaru: '上与那原', agarihama: '東浜', itarashiki: '板良敷' }
};
const xlKey = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); // 「Dirección1」→「direccion1」
/* 文字をそろえる（全角→半角・数字のあいだの「ー」などは「-」に） */
function xlNorm(v) {
  if (v == null || v instanceof Date) return '';
  return String(v).normalize('NFKC').replace(/(\d)\s*[‐－−ー―–—~〜]\s*(?=\d)/g, '$1-').replace(/\s+/g, ' ').trim();
}
const XL_KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function xlKanjiNum(s) { // 「十二」→ 12（住所検索の返事の「二丁目」などを数字にする）
  return String(s).replace(/[一二三四五六七八九十]+/g, k => {
    if (k.indexOf('十') < 0) return k.split('').map(c => XL_KANJI[c]).join('');
    const p = k.split('十');
    return String((p[0] ? XL_KANJI[p[0]] : 1) * 10 + (p[1] ? XL_KANJI[p[1]] : 0));
  });
}
/* 日本語の住所を「市町村・字・番地・残り（建物や部屋）」に分ける */
/* 合併する前の市町村名 → 今の住所の書き方（古い一覧の住所でも読めるように） */
const XL_OLD_MUNI = [
  [/^豊見城村/, '豊見城市'],
  [/^具志川市(字)?/, 'うるま市'], [/^石川市(字)?/, 'うるま市石川'], [/^与那城町(字)?/, 'うるま市与那城'], [/^勝連町(字)?/, 'うるま市勝連'],
  [/^佐敷町(字)?/, '南城市佐敷'], [/^知念村(字)?/, '南城市知念'], [/^玉城村(字)?/, '南城市玉城'], [/^大里村(字)?/, '南城市大里'],
  [/^東風平町/, '八重瀬町'], [/^具志頭村/, '八重瀬町'],
  [/^平良市(字)?/, '宮古島市平良'], [/^城辺町(字)?/, '宮古島市城辺'], [/^下地町(字)?/, '宮古島市下地'], [/^上野村(字)?/, '宮古島市上野'], [/^伊良部町(字)?/, '宮古島市伊良部'],
  [/^具志川村/, '久米島町'], [/^仲里村/, '久米島町']
];
function xlParseJa(raw) {
  let s = xlNorm(raw).replace(/^沖縄県/, '').replace(/^(島尻郡|中頭郡|国頭郡|宮古郡|八重山郡)/, '');
  for (const [re, to] of XL_OLD_MUNI) { if (re.test(s)) { s = s.replace(re, to); break; } }
  const muni = XL_MUNI_LIST.find(m => s.startsWith(m));
  if (!muni) return null;
  let rest = s.slice(muni.length).replace(/^\s*字/, '');
  const tm = /^[\u4e00-\u9fff\u3005\u3041-\u309fヶケ]+/.exec(rest);
  if (!tm) return null;
  const town = tm[0].replace(/(近く|付近|あたり)$/, '');
  rest = rest.slice(tm[0].length);
  const nm = /^\s*(\d+)(?:\s*(?:丁目|番地|番|-|の)\s*(\d+)(?![\d階F]))?(?:\s*(?:番地|番|号|-|の)\s*(\d+)(?![\d階F]))?(?:\s*(?:番地|号))?/.exec(rest); // 「2階」「4F」は番地に入れない
  const nums = nm ? [nm[1], nm[2], nm[3]].filter(Boolean) : [];
  if (nm) rest = rest.slice(nm[0].length);
  return { muni, town, nums, rest: rest.replace(/^[\s\-]+/, '').trim() };
}
/* ローマ字の住所（例：1-12-13 Kakazu）から、漢字の住所を作る */
function xlParseRo(dir1, zona, muni) {
  const s = xlNorm(dir1);
  const nm = /\d+(?:-\d+)*/.exec(s);
  const nums = nm ? nm[0].split('-').filter(Boolean).slice(0, 3) : [];
  const word = xlKey(s.replace(/[\d\-()?#.]/g, ' '));
  const dict = XL_TOWN[muni] || {};
  const town = dict[word] || dict[xlKey(zona)];
  return town ? { muni, town, nums, rest: '' } : null;
}
/* 部屋らしい書き方か（#201・2F・A-1・B205・3-A・101.0・Izquierda など） */
const XL_UNIT_RE = /^(#\S+|\d{1,4}(\.0)?|[A-Z]\d{1,4}|[A-Z]-?\d{1,3}|\d{1,2}-[A-Z0-9]{1,4}|\d{1,2}[A-Z]|I?\d?F\b.*|IF\b.*|\d+階.*|Izquierda|Derecha|左側?|右側?)$/i;
function xlUnit(v) {
  let s = xlNorm(v);
  if (!s || /^\d{4}-\d{2}-\d{2}/.test(s) || !XL_UNIT_RE.test(s)) return '';
  s = s.replace(/^#/, '').replace(/\.0$/, '').replace(/^IF/i, '1F').replace(/^(\d+)階/, '$1F').replace(/号室$/, '');
  return s.slice(0, 12);
}
/* 建物の名前（目印）から、人の名前らしいところを外す（「大浦方」「池宮宅」など） */
function xlLabel(s) {
  const t = xlNorm(s)
    .replace(/([\u4e00-\u9fff]{1,3})(様|さん)/g, '')
    .replace(/([\u4e00-\u9fff]{2,3})(方|宅)(?=$|[\s\d(（、,])/g, (m, a) => (/(住|社|営)$/.test(a) ? m : '')) // 住宅・社宅・市営住宅は残す
    .replace(/\(?\d*piso\)?/ig, '')
    .replace(/^[\s\-、,?？]+|[\s\-、,?？]+$/g, '');
  return /[A-Za-z\u3040-\u30ff\u4e00-\u9fff]/.test(t) ? t.slice(0, 30) : '';
}
/* 住所の残りの最後にある部屋（…602・…A-1・…2F）を取り出す */
function xlSplitTail(rest) {
  const m = /\s*((?<![A-Za-z])[A-Z]?\d{1,2}-\d{1,4}|(?<![A-Za-z])[A-Z]-\d{1,3}|\d{1,2}[A-Z](?![A-Za-z])|(?<![A-Za-z])[A-Z]\d{2,4}|\d{3,4}|\d+F|\d+階)\s*$/i.exec(rest || '');
  if (!m) return { label: xlLabel(rest), unit: '' };
  return { label: xlLabel(rest.slice(0, m.index)), unit: xlUnit(m[1]) };
}

/* 1枚のシートを読む。見出しの行（「住所」か「Dirección1」がある行）をさがして、必要な列だけ使う */
function xlReadSheet(name, rows) {
  const hi = rows.slice(0, 8).findIndex(r => (r || []).some(c => /^(住所|direcci[oó]n ?1)$/i.test(xlNorm(c))));
  if (hi < 0) return null;
  const head = rows[hi].map(c => xlKey(c) || xlNorm(c));
  const col = (...keys) => head.findIndex(h => keys.includes(h));
  const C = { zona: col('zona'), d1: col('direccion1', 'direccion'), d2: col('direccion2'), bld: col('edificio'), ja: col('住所'), code: col('codigo', 'estado') };
  const tm = /^\s*\(([^)]+)\)\s*(.*)$/.exec(name);
  const no = normNo(tm ? tm[1] : name).replace(/[^0-9A-Za-z-]/g, '').slice(0, 10);
  const title = (tm ? tm[2] : name).trim() || no;
  let muni = XL_MUNI[xlKey(title)] || '';
  const get = (r, i) => (i >= 0 ? r[i] : '');
  const out = { name, no, title, muni, entries: [], moved: 0, unreadable: [] };
  rows.slice(hi + 1).forEach(r => {
    if (!r || !r.some(c => c !== '' && c != null)) return;
    const ja = xlNorm(get(r, C.ja)), d1 = xlNorm(get(r, C.d1)), zona = xlNorm(get(r, C.zona));
    if (!ja && !d1 && !zona) return;
    const code = xlNorm(get(r, C.code)).toLowerCase();
    if (/^(se mud|falleci|mudad)/.test(code)) { out.moved++; return; }
    let p = ja ? xlParseJa(ja) : null;
    if (p && !muni) muni = out.muni = p.muni;
    if (!p || !p.nums.length) { // 日本語の住所に番地がないときは、ローマ字の住所も試す
      const q = xlParseRo(d1, zona, p ? p.muni : muni);
      if (q && (q.nums.length || !p)) p = Object.assign(q, { rest: p ? p.rest : xlNorm(ja) });
    }
    if (!p) { out.unreadable.push(ja || d1 || zona); return; }
    // 部屋と建物の名前
    const bld = xlNorm(get(r, C.bld)), d2 = get(r, C.d2);
    let unit = xlUnit(bld) || xlUnit(d2), label = bld && !xlUnit(bld) ? xlLabel(bld) : '';
    const tail = xlSplitTail(p.rest);
    if (!unit) unit = tail.unit;
    if (!label) label = tail.label;
    const q = '沖縄県' + p.muni + p.town + p.nums.join('-');
    out.entries.push({ q, nums: p.nums, muni: p.muni, town: p.town, unit, label, dnc: /no ?visitar/.test(code) });
  });
  return out;
}

/* 住所 → 位置（国土地理院）。ブラウザから直接聞けないときは、サーバー（GAS）に頼む */
async function xlGeocode(qs, onProg) {
  const res = new Map();
  let viaServer = !LIVE ? false : null, done = 0;
  const direct = async q => {
    const r = await fetch(XL_GSI + encodeURIComponent(q));
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    return (Array.isArray(j) ? j : []).slice(0, 5).map(f => ({ t: f.properties && f.properties.title, c: f.geometry && f.geometry.coordinates }));
  };
  if (qs.length && viaServer === null) {
    try { res.set(qs[0], await direct(qs[0])); viaServer = false; done = 1; onProg(done); }
    catch (e) { viaServer = true; }
  }
  if (viaServer) {
    for (let i = 0; i < qs.length; i += 40) {
      const part = qs.slice(i, i + 40);
      const j = await api('geocode', { qs: part }, { timeout: 120000 });
      if (!j || !j.ok) throw new Error((j && j.error) || 'geocode');
      part.forEach(q => res.set(q, (j.results && j.results[q]) || []));
      done = Math.min(qs.length, i + 40); onProg(done);
    }
    return res;
  }
  let next = done;
  const worker = async () => {
    while (next < qs.length) {
      const q = qs[next++];
      try { res.set(q, await direct(q)); } catch (e) { res.set(q, []); }
      onProg(++done);
      await new Promise(r => setTimeout(r, 120)); // 国土地理院に負担をかけないように
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return res;
}
/* 検索の答えから、いちばん合うものと、どれくらい正確かを決める */
function xlPick(entry, cands) {
  if (cands && cands[0] && cands[0].cb) { const p = cands[0].cb.pos; return { lat: p.lat, lng: p.lng, good: !!p.exact }; } // 地番の地図で分かった
  const muniCore = entry.muni.replace(/[市町村]$/, '');
  const c = (cands || []).find(x => x && x.c && x.t && x.t.indexOf(muniCore) >= 0 && x.t.indexOf(entry.town.slice(0, 2)) >= 0)
    || (cands || []).find(x => x && x.c && x.t && x.t.indexOf(muniCore) >= 0);
  if (!c) return null;
  const tail = xlKanjiNum(xlNorm(c.t).split(entry.town.slice(-1)).slice(1).join(entry.town.slice(-1)) || '');
  const tn = (tail.match(/\d+/g) || []);
  let hit = 0;
  while (hit < entry.nums.length && hit < tn.length && Number(tn[hit]) === Number(entry.nums[hit])) hit++;
  const good = entry.nums.length > 0 && hit >= Math.min(2, entry.nums.length);
  return { lat: Number(c.c[1]), lng: Number(c.c[0]), good };
}
/* 区域の線：家をぜんぶ囲む凸の形（家のまわり pad m を足す） */
function xlHull(pts, pad) {
  const ring = [];
  pts.forEach(([la, ln, own]) => {
    const r = own == null ? pad : own; // 3つ目の数があれば、その点だけ外側の幅を変える（今の線の角は、そのまま使う）
    const dLa = r / 110540, dLn = r / (111320 * Math.cos(la * Math.PI / 180));
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; ring.push([la + dLa * Math.sin(a), ln + dLn * Math.cos(a)]); }
  });
  const P = ring.map(p => [p[1], p[0]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  let h = lo.slice(0, -1).concat(up.slice(0, -1)).map(p => [Math.round(p[1] * 1e6) / 1e6, Math.round(p[0] * 1e6) / 1e6]);
  while (h.length > 48) h = h.filter((_, i) => i % 2 === 0); // 角が多すぎるときは間引く
  return h;
}
const xlDist = (a, b) => {
  const dy = (a[0] - b[0]) * 110540, dx = (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
};

async function readXlsxFile(file) {
  let sheets;
  try {
    toast('エクセルを読んでいます…');
    await loadScript(LIB.xlsx);
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    sheets = wb.SheetNames.map(n => xlReadSheet(n, window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })))
      .filter(s => s && (s.entries.length || s.moved || s.unreadable.length));
  } catch (e) {
    infoSheet('ファイルを読み込めませんでした', 'エクセル（.xlsx）のファイルを選んでください。はじめて使うときは、インターネットにつながっている必要があります。');
    return;
  }
  if (!sheets.length) {
    infoSheet('住所の一覧が見つかりませんでした', '「住所」か「Dirección1」という見出しのある表を、区域ごとのシートに入れてください。');
    return;
  }
  sheets.forEach(s => { s.use = !!s.entries.length && NO_RE.test(s.no); });
  openXlSheet(sheets, file.name || '');
}

function openXlSheet(sheets, fileName) {
  const exists = s => D().territories.find(t => t.no === s.no);
  const paint = () => {
    const n = sheets.filter(s => s.use).reduce((a, s) => a + s.entries.length, 0);
    setSheet(headHtml(null, 'エクセルから区域と家を取り込む', esc(fileName)) + `
      <div class="notice info">シート（区域）が ${sheets.length}枚 見つかりました。<br>
        読むのは<b>住所・建物・部屋・状態</b>だけです。名前・国・メモの列は読まず、どこにも送りません。</div>
      <p class="hint">「住所から場所を調べる」を押すと、住所の文字だけを国土地理院の住所検索に送って、地図の位置にします。まだ区域や家は作りません。</p>
      <div id="xlRows">${sheets.map((s, i) => `<label class="check xlrow"><input type="checkbox" data-xl="${i}"${s.use ? ' checked' : ''}${s.entries.length && NO_RE.test(s.no) ? '' : ' disabled'}>
        <span><b>区域 ${esc(s.no || '?')}</b>　<span data-notr>${esc(s.title)}${s.muni ? `（${esc(s.muni)}）` : ''}</span><br>
        <small class="muted"><span>家 ${s.entries.length}件</span>${s.entries.some(e => e.dnc) ? `<span>（うち拒否 ${s.entries.filter(e => e.dnc).length}件）</span>` : ''}${s.moved ? `<span>・引っ越しなどで入れない ${s.moved}件</span>` : ''}${s.unreadable.length ? `<span>・住所が読めない ${s.unreadable.length}件</span>` : ''}${exists(s) ? '<span>・</span><b>同じ番号の区域があります（線を広げて家を足します）</b>' : ''}</small></span></label>`).join('')}</div>
      <button class="btn primary block" id="xlGo"${n ? '' : ' disabled'}>住所から場所を調べる（${n}件）</button>
      <button class="btn block" data-close>やめる</button>`);
    $$('[data-xl]', $('#sheet')).forEach(x => x.onchange = () => { sheets[Number(x.dataset.xl)].use = x.checked; paint(); });
    $('#xlGo').onclick = () => xlLocate(sheets, fileName);
  };
  paint();
}

async function xlLocate(sheets, fileName) {
  const use = sheets.filter(s => s.use);
  const qs = Array.from(new Set(use.flatMap(s => s.entries.map(e => e.q))));
  setSheet(headHtml(null, '住所から場所を調べています', esc(fileName)) + `<p class="hint">住所 ${qs.length}件。しばらくお待ちください（この画面を閉じないでください）。</p>
    <div class="bar"><i id="xlBar" style="width:0%"></i></div><p class="muted" id="xlCnt">0 / ${qs.length}</p>`);
  let geo;
  // 地番の地図（kyohi.js の chibanFind。表のある市町村だけ）で分かる住所は、国土地理院に聞かない
  const cbq = new Map();
  if (window.chibanFind) for (const s of use) for (const e of s.entries) { if (!cbq.has(e.q)) { const r = await window.chibanFind(e).catch(() => null); if (r) cbq.set(e.q, r); } }
  const qs2 = qs.filter(q => !cbq.has(q));
  try {
    geo = await xlGeocode(qs2, n => { const b = $('#xlBar'), c = $('#xlCnt'); if (b) b.style.width = Math.round(n / qs2.length * 100) + '%'; if (c) c.textContent = `${n} / ${qs2.length}`; });
    cbq.forEach((r, q) => geo.set(q, [{ cb: r }]));
  } catch (e) {
    infoSheet('場所を調べられませんでした', 'インターネットの接続を確かめて、もう一度ためしてください。続くときは、スプレッドシートのプログラム（Code.gs と appsscript.json）が新しい版か確かめてください。');
    return;
  }
  const plan = use.map(s => {
    const groups = new Map(), notFound = [];
    s.entries.forEach(e => {
      const pos = xlPick(e, geo.get(e.q));
      if (!pos) { notFound.push(e.q.replace(/^沖縄県/, '')); return; }
      const g = groups.get(e.q) || { q: e.q, pos, label: '', es: [] };
      if (!g.label && e.label) g.label = e.label;
      g.es.push(e);
      groups.set(e.q, g);
    });
    // 同じ住所の行は1つの建物にまとめる。部屋の書いていない行が部屋のある行とまざっているときは、その行を「?」の部屋にする
    const list = Array.from(groups.values()).map(g => {
      const units = [];
      g.es.forEach(e => { if (e.unit && !units.includes(e.unit)) units.push(e.unit); });
      const blank = g.es.some(e => !e.unit);
      if (units.length && (blank || g.es.length > units.length) && blank) units.unshift('?');
      if (!units.length && g.es.length > 1) g.es.forEach((e, i) => { units.push(String(i + 1)); e.unit = String(i + 1); });
      const dnc = new Set(g.es.filter(e => e.dnc).map(e => (units.length ? (e.unit || '?') : '')));
      return { q: g.q, pos: g.pos, label: g.label, units, dnc };
    });
    return { s, groups: list, notFound };
  });
  // 同じ場所に重なった家（丁目までしか分からなかったなど）は、少しずつずらして並べる
  const seen = [];
  plan.forEach(p => p.groups.forEach(g => {
    let k = seen.filter(x => xlDist(x, [g.pos.lat, g.pos.lng]) < 4).length;
    seen.push([g.pos.lat, g.pos.lng]);
    if (k) {
      const r = 9 * Math.sqrt(k), a = k * 2.4;
      g.pos.lat += r * Math.sin(a) / 110540; g.pos.lng += r * Math.cos(a) / (111320 * Math.cos(g.pos.lat * Math.PI / 180));
    }
  }));
  const nGood = plan.reduce((a, p) => a + p.groups.filter(g => g.pos.good).length, 0);
  const nApprox = plan.reduce((a, p) => a + p.groups.filter(g => !g.pos.good).length, 0);
  const nMiss = plan.reduce((a, p) => a + p.notFound.length, 0) + use.reduce((a, s) => a + s.unreadable.length, 0);
  const missList = plan.flatMap(p => p.notFound.map(q => [p.s.no, q])).concat(use.flatMap(s => s.unreadable.map(q => [s.no, xlNorm(q) || '-'])));
  setSheet(headHtml(null, '取り込む内容の確認', esc(fileName)) + `
    <div class="tiles"><div class="tile"><b>${nGood}</b><span>番地まで分かった家</span></div>
      <div class="tile"><b>${nApprox}</b><span>だいたいの場所の家</span></div>
      <div class="tile"><b>${nMiss}</b><span>場所が分からない住所</span></div></div>
    <p class="hint">「だいたいの場所」の家は、町や丁目のまん中に置きます。取り込んだあと、一覧から1軒ずつ地図で確かめて、家を押して「この家の場所を直す」で直してください。</p>
    ${nMiss ? `<details class="more"><summary>場所が分からない住所（${nMiss}件）</summary><p class="hint">これらは取り込みません。地図で「＋ 家」から入れてください。</p><ul>${missList.map(x => `<li>区域${esc(x[0])}　<span data-notr>${esc(x[1])}</span></li>`).join('')}</ul></details>` : ''}
    <p class="hint">区域の線は、家から約${XL_PAD_M}m外側を囲む形で作ります。あとから「区域」の一覧で線を引き直せます。</p>
    <button class="btn primary block" id="xlCommit">区域 ${plan.length}つ・家 ${nGood + nApprox}軒を取り込む</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#xlCommit').onclick = () => xlCommit(plan);
}

function xlCommit(plan) {
  // すでにある家の近くは、同じ家とみなして入れない
  const grid = new Map(), cell = (la, ln) => Math.round(la * 2000) + ':' + Math.round(ln * 2000);
  D().houses.forEach(h => { const k = cell(h.lat, h.lng); (grid.get(k) || grid.set(k, []).get(k)).push([h.lat, h.lng]); });
  const near = (la, ln) => {
    const cy = Math.round(la * 2000), cx = Math.round(ln * 2000);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((grid.get((cy + dy) + ':' + (cx + dx)) || []).some(p => xlDist(p, [la, ln]) < XL_DUP_M)) return true;
    }
    return false;
  };
  const now = new Date().toISOString(), check = [];
  let nT = 0, nH = 0, nSkip = 0;
  closeSheet();
  commit('エクセルから区域と家を取り込みました', () => {
    plan.forEach(p => {
      let t = D().territories.find(x => x.no === p.s.no);
      const pts = p.groups.map(g => [g.pos.lat, g.pos.lng]);
      if (t) { // 同じ番号の区域：今の線の角・今の家・新しい家をぜんぶ囲む線にする
        const old = (okPoly(t.polygon) ? t.polygon.map(v => [v[0], v[1], 1]) : [])
          .concat(D().houses.filter(h => h.terrId === t.id).map(h => [h.lat, h.lng]));
        const hull = xlHull(pts.concat(old), XL_PAD_M);
        if (hull.length >= 3) t.polygon = hull;
      } else {
        t = { id: 't' + uid(), no: p.s.no, name: (p.s.title + (p.s.muni ? `（${p.s.muni}）` : '')).slice(0, 30), polygon: xlHull(pts, XL_PAD_M), holder: null, lentAt: null };
        D().territories.push(t); nT++;
      }
      p.groups.forEach(g => {
        if (near(g.pos.lat, g.pos.lng)) { nSkip++; return; }
        const h = { id: 'h' + uid(), terrId: t.id, type: g.units.length ? 'apt' : 'house', lat: Math.round(g.pos.lat * 1e6) / 1e6, lng: Math.round(g.pos.lng * 1e6) / 1e6,
          label: g.label || '', units: g.units.slice(0, 300), createdAt: now, createdBy: me().id };
        D().houses.push(h); nH++; // 同じ取り込みの中の家どうしは比べない（同じ丁目の家は、近くに並べてあるため）
        g.dnc.forEach(u => { D().dnc[K(h.id, u)] = true; });
        if (!g.pos.good) check.push({ id: h.id, q: g.q.replace(/^沖縄県/, ''), no: p.s.no });
      });
    });
  });
  firstMapShow = false;
  showView('map');
  setTimeout(fitAll, 150);
  setTimeout(() => xlCheckSheet(check, nT, nH, nSkip), 600);
}

/* 取り込んだあと：だいたいの場所の家を、1軒ずつ地図で確かめる */
function xlCheckSheet(check, nT, nH, nSkip) {
  const live = check.filter(c => houseById(c.id));
  setSheet(headHtml(null, '取り込みました', '') + `
    <p><span>新しい区域：</span><b>${nT}</b>　<span>家：</span><b>${nH}</b></p>${nSkip ? `<p class="hint">（すでに家があった ${nSkip}軒は入れていません）</p>` : ''}
    ${live.length ? `<h3 class="sub">場所を確かめる家（${live.length}軒）</h3>
      <p class="hint">町や丁目のまん中に置いた家です。押すと地図がその家に移ります。家の画面の「この家の編集」→「この家の場所を直す」で直せます。</p>
      ${live.map(c => `<button class="btn block" data-xlgo="${esc(c.id)}">区域${esc(c.no)}　<span data-notr>${esc(c.q)}</span></button>`).join('')}` : '<p class="hint">すべての家が番地まで分かりました。</p>'}
    <button class="btn block" data-close>閉じる</button>`);
  $$('[data-xlgo]', $('#sheet')).forEach(x => x.onclick = () => {
    const h = houseById(x.dataset.xlgo); if (!h) return;
    closeSheet();
    showView('map');
    setTimeout(() => { map.setView([h.lat, h.lng], 18); openTarget(h.id, ''); }, 120);
  });
}

/* ---------- 区域係：家の場所を直す（地図をタップした所に動かす） ---------- */
let moveHid = null, moveTimer = null;
function startMoveHouse(hid) {
  if (!isAdmin()) return;
  closeSheet();
  moveHid = hid;
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => { if (moveHid) { moveHid = null; toast('場所を直すのをやめました'); } }, 90000);
  toast('新しい場所をタップしてください（地図を大きくしてから）');
}
function moveHouseTo(ll) {
  const hid = moveHid; moveHid = null; clearTimeout(moveTimer);
  const h = houseById(hid);
  if (!h) return;
  if (map.getZoom() < 16) { moveHid = hid; toast('場所がずれないように、もう少し地図を拡大してからタップしてください'); return; }
  commitIn([hid], '家の場所を直しました', () => {
    const h2 = houseById(hid); if (!h2) return;
    h2.lat = Math.round(ll.lat * 1e6) / 1e6; h2.lng = Math.round(ll.lng * 1e6) / 1e6;
    const t = terrOf(h2.lat, h2.lng); if (t) h2.terrId = t; // 線の外に動かしたときは、今の区域のまま
  });
}

/* 区域係の設定：スライダー（動かしている間は数字だけ変え、離したときに保存する） */
document.addEventListener('input', e => {
  const r = e.target.closest && e.target.closest('[data-range]'); if (!r) return;
  const o = r.parentElement.querySelector('output'); if (o) o.textContent = r.value + (r.dataset.unit || '');
});
document.addEventListener('change', e => {
  const r = e.target.closest && e.target.closest('[data-range]'); if (!r || !isAdmin()) return;
  D().settings[r.dataset.range] = Number(r.value); Store.save(); renderAll(); toast('設定を変えました');
});
/* ---------- 特別区域（えらんだ種別の家だけを集めた区域） ---------- */
function openSpecialSheet(tid, keep) {
  const t = tid ? terrById(tid) : null;
  const sp = t && isSpecial(t) ? spOf(t) : {};
  const st = keep || { kinds: (sp.kinds || []).slice(), apt: !!sp.apt, lock: !!sp.lock, ev: sp.ev || '', unmet: !!sp.unmet, excl: sp.excl !== false, no: '', name: '' };
  if (!keep && (sp.ev === 'y' || sp.ev === 'n') && !sp.apt && !sp.lock && !st.kinds.length) st.apt = true; // 古い形
  const nextNo = (() => { for (let i = 1; i < 100; i++) { if (!D().territories.some(x => x.no === 'S' + i)) return 'S' + i; } return 'S'; })();
  setSheet(headHtml(t, t ? `特別区域 ${esc(t.no)} の条件` : '特別区域をつくる', '') + `
    <p class="hint">えらんだ種別の家だけを集めた区域です。受け取った人の地図には、その家だけが出ます。はじめは全域が対象です。あとから「線を直す」で範囲をしぼれます。</p>
    ${t ? '' : `<label class="field">区域番号 <input type="text" id="spNo" value="${esc(st.no || nextNo)}" maxlength="10"></label>
    <label class="field">名前 <input type="text" id="spName" maxlength="30" value="${esc(st.name)}" placeholder="例：オートロック・コンビニ"></label>`}
    ${spPickHtml(st)}
    <label class="check"><input type="checkbox" id="spExcl"${st.excl && !st.unmet ? ' checked' : ''}${st.unmet ? ' disabled' : ''}>この家を、ふつうの区域カードから外す（2回訪ねないように）</label>
    ${st.unmet ? '<p class="hint">「一度も会えていない家だけ」の区域は、ふつうの区域カードからは外しません（会えると対象が変わるため）。回っている人の区域は、受け取った日の時点の家で決まります。</p>' : ''}
    <button class="btn primary block" id="spSave">${t ? '保存する' : 'つくる'}</button>
    <button class="btn block" data-close>やめる</button>`);
  const S = $('#sheet');
  const keepIn = () => { if ($('#spNo')) st.no = $('#spNo').value; if ($('#spName')) st.name = $('#spName').value; const ex = $('#spExcl'); if (ex && !ex.disabled) st.excl = ex.checked; };
  spPickBind(S, st, () => { keepIn(); sheetKeep = true; openSpecialSheet(tid, st); });
  $('#spSave').onclick = () => {
    keepIn();
    if (!spPickOk(st)) { toast('集める種別を1つ以上えらんでください'); return; }
    const special = Object.assign(spPickData(st), { excl: st.unmet ? false : st.excl });
    if (t && spOf(t).by) special.by = spOf(t).by;
    const label = specialKindsText({ special });
    if (t) { closeSheet(); commit(`特別区域 ${t.no} の条件を変えました`, () => { t.special = special; }); return; }
    const no = normNo(st.no || nextNo), name = (String(st.name || '').trim() || label).slice(0, 30);
    if (!NO_RE.test(no)) { toast('区域番号は、英数字で入れてください'); return; }
    if (D().territories.some(x => x.no === no)) { toast('その番号の区域は、もうあります'); return; }
    const pts = polyTerrs().flatMap(x => x.polygon.map(v => [v[0], v[1], 1]));
    const all = pts.length ? pts : D().houses.map(h => [h.lat, h.lng]);
    if (all.length < 1) { toast('先に、ふつうの区域か家をつくってください'); return; }
    closeSheet();
    commit(`特別区域 ${no}（${label}）をつくりました`, () => {
      D().territories.push({ id: 't' + uid(), no, name, polygon: xlHull(all, 120), special, holder: null, lentAt: null, lend: 'auto' });
    });
  };
}
/* ---------- 区域カード画面 ---------- */
function renderToday() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  // 自分の id と今日のはじまりは1回だけ出して、日時は文字どうしで比べる（記録の数×人数の探し方をしない・改善案B4）
  const myId = me().id, since = start.toISOString();
  const mine = D().visits.filter(v => v.by === myId && v.at >= since).sort((a, b) => (a.at < b.at ? -1 : 1));
  let html = `<b>${esc(me().name)}さん</b>　`;
  if (!mine.length) html += '今日の記録はまだありません。';
  else {
    const f = new Date(mine[0].at), l = new Date(mine[mine.length - 1].at);
    const min = Math.round((l - f) / 60000);
    html += `今日の記録 <b>${mine.length}件</b>（会えた ${mine.filter(v => v.result === 'met').length}件）` +
      (featTime() ? `<br><span class="muted">記録した時間 ${fmtTime(f)}〜${fmtTime(l)}（約${Math.floor(min / 60)}時間${min % 60}分）</span>` : '');
  }
  $('#todayBox').innerHTML = `<div class="today">${html}</div>`;
}
/* カードの上の部分：番号・名前・「地図 ›」をまとめて1つの大きなボタンにする（押すと地図がひらく） */
const MAP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
const openHead = (attr, label, stamp, name, sub) => `<button type="button" class="topen" ${attr} aria-label="${label}の地図をひらく">
      ${stamp}<span class="tname"><b>${name}</b>${sub ? `<small>${sub}</small>` : ''}</span>
      <span class="tgo">${MAP_ICON}<span>地図 ›</span></span></button>`;
function cardHtml(t, own, helper) {
  const since = t.lentAt ? Date.parse(t.lentAt) : Date.now() - 90 * DAY;
  const s = terrStats(t, since);
  const pct = s.n ? Math.round(s.visited / s.n * 100) : 0;
  const holder = t.holder ? userById(t.holder) : null;
  const hs = helpersOf(t), groupOk = D().settings.groupOn !== 0;
  const due = dueOf(t), over = due && Date.parse(due) < Date.now();
  const lead = !own && helper && isLead(t), ld = leadOf(t); // lead＝自分が今日の司会。ld＝今日の司会（だれか）
  const who = own ? `受け取ってから ${daysSince(t.lentAt)}日・<span class="${over ? 'tag-warn' : ''}">返却の目安 ${fmtDay(due)}${over ? '（過ぎています）' : ''}</span>${t.firstDoneAt ? '・留守宅を回る段階' : ''}${isSpecial(t) ? `<span class="spbadge">${esc(specialKindsText(t))}</span>${evTag(t)}` : ''}`
    : lead ? `<span class="leadtag">今日の司会</span>担当：${esc(uname(t.holder))}さん（今日まで）`
    : helper ? `${esc(uname(t.holder))}さんの区域を、一緒に回ります（今日まで）`
    : (holder ? `担当：${esc(holder.name)}さん` : '担当者なし');
  const extra = (UI.cProg === 'on'
      ? `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="訪問の進み具合"><i style="width:${pct}%"></i></div>
      <p class="muted">${t.lentAt ? '受け取ってから' : 'この90日で'}訪問した家・部屋 ${s.visited} / ${s.n}</p>` : '') +
    (own && ld ? `<div class="leadline"><p><span class="leadtag">今日の司会</span><b>${esc(uname(ld.uid))}さん</b>（今日まで）</p><button type="button" class="btn small" data-leadoff="${esc(t.id)}">司会を外す</button></div>` : '') +
    ((own || lead) && partsOf(t).length ? `<p class="muted"><b>今日わたした範囲：</b>${partsOf(t).map(p => esc(partName(p))).join(' ／ ')}</p>` : '') +
    (!own && !lead && myPart(t) ? `<p class="hint-strong">今日のあなたの範囲があります（${esc(partMates(myPart(t)).map(u => uname(u) + 'さん').join('・') || 'ひとり')}と）。地図をひらくと、その範囲だけが目立ちます。</p>
      <p class="muted"><a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${center(myPart(t).poly)[0].toFixed(6)},${center(myPart(t).poly)[1].toFixed(6)}" target="_blank" rel="noopener">Googleマップでこの範囲へ</a></p>` : '') +
    ((own || lead) && hs.length ? `<p class="muted"><b>${t.group ? '今日回る人' : '今日一緒に回る人'}（${hs.length}人）：</b>${hs.map(h => esc(uname(h.uid)) + 'さん').join('、')}</p>` : '') +
    ((own || helper) && UI.cReco === 'on' ? roundHint(t) : '') +
    (own && paperHandOf(t) ? '<p class="muted">紙の区域カード（S-13）から引き継いだ区域です。紙で回った家は、アプリの記録には入っていません。返却はこのアプリでしてください。</p>' : '');
  return `<article class="tcard tc2${t.group ? ' grp' : ''}">
    ${openHead(`data-open="${esc(t.id)}"`, `区域${esc(t.no)} ${esc(t.name)}`,
      `<span class="stamp${noCls(t.no)}${t.group ? ' grp' : ''}"><small>${!t.group ? '区域' : isAllUse(t) ? '全体' : 'グループ'}</small>${esc(t.no)}</span>`,
      esc(t.name), (t.group ? `<span class="gbadge">${esc(useName(t))}の区域</span> ` : '') + who)}
    ${extra ? `<div class="tbody">${extra}</div>` : ''}
    <div class="actions">${(own || lead) && groupOk ? `<button class="btn" data-helpers="${esc(t.id)}">${t.group ? '今日回る人をえらぶ' : '一緒に回る人'}</button>${t.group ? `<button class="btn primary" data-parts="${esc(t.id)}">回る範囲を分ける</button>` : ''}` : ''}${own ? `<button class="btn" data-return="${esc(t.id)}">返す</button>` : ''}${lead ? `<button class="btn" data-leadquit="${esc(t.id)}">司会をやめる</button>` : ''}</div>
  </article>`;
}
let cardTab = 'mine';
function setCardTab() {
  $('#paneMine').hidden = false; // 再訪問は、下の「再訪問」タブに移しました
}
function renderCards() {
  renderToday();
  const an = $('#asgNotice'); if (an) an.innerHTML = asgNoticeHtml();
  const ha = $('#homeAdd');
  if (ha) ha.innerHTML = LIVE && isMobile() && !isStandalone() && !lsGet(HOME_OFF)
    ? `<div class="notice info homeadd"><p><b>ホーム画面に追加すると、</b>アプリのようにアイコンからすぐ開けます。</p>
        <span class="actions" style="margin:0"><button class="btn small primary" data-homeadd>追加する</button><button class="btn small" data-homeoff>今はしない</button></span></div>` : '';
  const ts = D().territories.slice().sort(byNo);
  const mine = ts.filter(t => t.holder === me().id);
  const tap = '<p class="hint taphint">区域の番号か名前を押すと、地図がひらきます。</p>';
  if (canGroupTerr()) {
    const gC = mine.filter(t => t.group).sort((a, b) => (isAllUse(a) ? 1 : 0) - (isAllUse(b) ? 1 : 0) || byNo(a, b)), pC = mine.filter(t => !t.group); // グループ奉仕 → 全体の集まり
    const gA = activeCards().filter(c => c.by === me().id && c.group).sort((a, b) => (isAllUse(a) ? 1 : 0) - (isAllUse(b) ? 1 : 0)); // グループで回る留守宅カード（グループ → 全体の集まり）
    const lC = ts.filter(t => t.holder !== me().id && isLead(t)); // 今日の司会（ほかの人のカード）
    $('#myCards').innerHTML = (mine.length || lC.length ? tap : '') +
      `<h2 class="sec gsec">集まりで使う区域</h2>
       <p class="hint">グループ奉仕と全体の集まりで使う区域です。「今日回る人」をえらぶと、その人たちも今日だけ記録できます。</p>` +
      lC.map(t => cardHtml(t, false, true)).join('') +
      (gC.length || gA.length ? gC.map(t => cardHtml(t, true)).join('') + gA.map(c => awayCardHtml(c, 'gown')).join('') : lC.length ? '' : '<p class="muted emptyline">まだありません。</p>') +
      reqBoxesHtml(true) + addBtnHtml(true) +
      `<h2 class="sec">個人の区域</h2>` +
      (pC.length ? pC.map(t => cardHtml(t, true)).join('') : '<p class="muted emptyline">まだありません。</p>') +
      reqBoxesHtml(false) + addBtnHtml(false);
  } else {
    $('#myCards').innerHTML = mine.length ? tap + mine.map(t => cardHtml(t, true)).join('')
      : '<div class="empty">受け取っている区域カードはありません。<br>下のボタンから申し込めます。</div>';
  }
  const helping = ts.filter(t => t.holder !== me().id && (isHelper(t) || isLead(t)) && !(canGroupTerr() && isLead(t))); // 今日の司会は「集まりで使う区域」に出す
  const myDummy = ts.find(t => t.dummy && t.holder === me().id);
  $('#myCards').insertAdjacentHTML('afterbegin', myDummy ? `<div class="notice info"><b>検証用の区域${esc(myDummy.no)}を受け取っています。</b>おすすめや地図の出かたを確かめるための、ダミーの区域です。<span class="actions"><button class="btn small" data-dguide="${esc(myDummy.id)}">確かめ方を見る</button></span></div>` : '');
  const helpC = activeCards().filter(c => c.by !== me().id && isCardHelper(c)); // グループの留守宅カードで、今日回るように頼まれたもの
  $('#myHelp').innerHTML = helping.length || helpC.length ? `<h2 class="sec">今日回る区域</h2><p class="hint">今日の終わりまで、この区域（カード）の家を記録できます。</p>` +
    helping.map(t => cardHtml(t, false, true)).join('') + helpC.map(c => awayCardHtml(c, 'help')).join('') : '';
  renderRequestArea();
  renderMyAwayCards();
  $('#allCards').innerHTML = $('#allDetails').open ? ts.filter(t => !myTerr(t)).map(t => cardHtml(t, false)).join('') : '';

  setCardTab('mine');
}
/* 再訪問のピン留め（このスマホ・本人だけ） */
const pinKey = () => 'kuiki_pins_' + me().id;
function pinsAll() { try { return new Set(JSON.parse(lsGet(pinKey()) || '[]')); } catch (e) { return new Set(); } }
function pinsSaveRaw(p) { if (!p.size) { lsDel(pinKey()); return true; } return lsSet(pinKey(), JSON.stringify([...p])); }
function pinsSave(p) { const r = pinsSaveRaw(p); MemoSync.soon(); return r; }
function togglePin(k) {
  const p = pinsAll();
  if (p.has(k)) p.delete(k); else p.add(k);
  pinsSave(p);
  renderFollowList();
}
let followQ = '';
const FSORT = [['idle', 'しばらく訪問していない順'], ['near', '近い順'], ['recent', '最後に訪問した順'], ['metold', '前回会えた日が古い順'], ['terr', '区域番号順']];
function renderFollowList() {
  const box = $('#myFollows'); if (!box) return;
  const fw = $('#followWhere');
  if (fw) fw.textContent = memoSyncOn() ? 'メモは本人の端末（スマホ・iPadなど）だけで見られます。' : 'メモはこのスマホの中だけに残ります。';
  const sortKey = 'kuiki_fsort_' + me().id, sort = lsGet(sortKey) || 'idle', pins = pinsAll();
  let list = Object.entries(D().follows).filter(([k, f]) => f.by === me().id && houseById(parseKey(k)[0]));
  if (!$('#fQ')) { // 道具（リスト/地図・検索・並び順）は一度だけ作る（検索中に文字が消えないように）
    $('#paneFollow').insertAdjacentHTML('afterbegin', `<div class="ftools">
      <div class="seg" role="group" aria-label="見かた"><button type="button" data-fview="list" aria-pressed="true">リスト</button><button type="button" data-fview="map" aria-pressed="false">地図で見る</button></div>
      <label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
        <input type="search" id="fQ" placeholder="目印・区域・メモでさがす" aria-label="再訪問をさがす"></label>
      <label class="fsort">並び順<select id="fSort">${FSORT.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    </div>`);
    $('#fQ').oninput = e => { followQ = e.target.value.trim(); renderFollowList(); };
    $('#fSort').onchange = e => { lsSet('kuiki_fsort_' + me().id, e.target.value); if (e.target.value === 'near' && !myPos) locate(renderFollowList); renderFollowList(); };
    $$('#paneFollow [data-fview]').forEach(b => b.onclick = () => { if (b.dataset.fview === 'map') openFollowMap(); });
  }
  $('#fSort').value = sort;
  if (followQ) {
    const q = followQ.toLowerCase();
    list = list.filter(([k]) => {
      const [hid, unit] = parseKey(k), h = houseById(hid), t = terrById(h.terrId), m = memoOf(k);
      return [h.label, unit, uName(h, unit), t && t.no, t && t.name, m && m.text].some(v => v && String(v).toLowerCase().includes(q));
    });
  }
  const pos = k => { const h = houseById(parseKey(k)[0]); return [h.lat, h.lng]; };
  const last = k => (sum(k).last ? sum(k).last.at : '');
  const metAt = k => (sum(k).met ? sum(k).met.at : '');
  const cmp = {
    idle: (a, b) => followIdle(b[1]) - followIdle(a[1]),
    near: (a, b) => (myPos ? distM(myPos, pos(a[0])) - distM(myPos, pos(b[0])) : 0),
    recent: (a, b) => (last(a[0]) < last(b[0]) ? 1 : -1),
    metold: (a, b) => (metAt(a[0]) < metAt(b[0]) ? -1 : 1),
    terr: (a, b) => cmpNo((terrById(houseById(parseKey(a[0])[0]).terrId) || {}).no || '', (terrById(houseById(parseKey(b[0])[0]).terrId) || {}).no || '')
  };
  list.sort((a, b) => (pins.has(b[0]) ? 1 : 0) - (pins.has(a[0]) ? 1 : 0) || (cmp[sort] || cmp.idle)(a, b)); // ピン留めはいつも上
  box.innerHTML = (list.length ? list.map(([k, f]) => followCard(k, f, pins.has(k))).join('')
    : (followQ ? '<div class="empty">見つかりませんでした。</div>'
      : '<div class="empty">受け持っている再訪問はありません。<br>また訪ねたい方に会えたら、記録のときに「私が再訪問します」を選べます。</div>')) + (followQ ? '' : handoffHtml());
  paintFollowBk();
}
function followCard(k, f, pinned) {
  const [hid, unit] = parseKey(k), h = houseById(hid), t = terrById(h.terrId);
  const stg = followStage(f), d = followIdle(f), met = sum(k).met, memo = memoOf(k);
  const state = stg === 2 ? '（確認が必要）' : stg === 1 ? '（しばらく訪問なし）' : '';
  const A = (act, label, cls) => `<button class="btn small ${cls || ''}" data-fact="${act}" data-key="${esc(k)}">${label}</button>`;
  let acts = A('memo', 'メモ・記録を開く', 'primary') + `<button class="btn small" data-go="${esc(hid)}" data-unit="${esc(unit)}" data-route="1">地図で見る</button>`;
  if (stg >= 1) acts += A('continue', '続ける');
  acts += A('remove', 'リストから外す', 'danger');
  const memoLines = memo ? memo.text.split('\n').slice(0, 3).join('\n') : '';
  return `<article class="fcard f-s${stg}${pinned ? ' pinned' : ''}">
    <div class="fhead"><button type="button" class="pinbtn" data-pin="${esc(k)}" aria-pressed="${pinned}" aria-label="${pinned ? 'ピン留めを外す' : 'いつも上に表示する'}">📌</button>
      <span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span><b>${targetName(h, unit)}</b></div>
    ${met ? `<p class="metline">前回 会えた日：${fmtDate(met.at)}（${slotShort(slotOf(new Date(met.at)))}）</p>` : '<p class="muted">まだ会えた記録はありません</p>'}
    <p class="muted">最後の記録から ${d}日${state}${myPos ? `　ここから約${fmtDist(distM(myPos, [h.lat, h.lng]))}` : ''}</p>
    <div class="stamps"><button type="button" class="choice c-met" data-fstamp="met" data-key="${esc(k)}"><i class="pin mini st-met">会</i>会えた</button>
      <button type="button" class="choice c-away" data-fstamp="away" data-key="${esc(k)}"><i class="pin mini st-away">留</i>留守</button></div>
    ${memo && memo.next ? `<p class="nextline">次の約束：${esc(fmtNext(memo.next))}</p>` : ''}
    <div class="fmemo${memo ? '' : ' none'}">${memo ? esc(memoLines) : 'メモはまだありません'}</div>
    <div class="actions">${acts}</div></article>`;
}
/* 会えた・留守のスタンプ：訪問の記録として残し（区域の地図にも反映）、メモのいちばん上に日時と結果を入れる */
async function stampFollow(k, res, curText, after) {
  const [hid, unit] = parseKey(k);
  const mine = visitsOf(k).find(v => v.by === me().id);
  if (mine && mine.result === res && Date.now() - Date.parse(mine.at) < 120000 &&
      !await ask(`2分以内に「${RESULT_LABEL[res]}」を記録しています。もう一度記録しますか？`)) return;
  const now = new Date();
  const line = `${now.getMonth() + 1}月${now.getDate()}日 ${fmtTime(now)}　${RESULT_LABEL[res]}`;
  const before = memoOf(k), base = (curText == null ? (before ? before.text : '') : curText).trim();
  const o = memoAll();
  o[k] = Object.assign({}, before || {}, { text: (line + (base ? '\n' + base : '')).slice(0, 1000), at: now.toISOString() });
  memoSaveAll(o);
  const m = sum(k).met;
  const extra = res === 'met' ? { age: m && seeV(m, k) ? m.age : undefined, interest: '再訪問したい' } : {};
  saveVisit(hid, unit, res, extra, true, () => { // 取り消したら、メモも元にもどす
    const o2 = memoAll(); if (before) o2[k] = before; else delete o2[k]; memoSaveAll(o2);
  });
  if (after) after();
}

/* ---------- 区域カードの申し込み・受け取り ---------- */
/* 区域カードの申し込み中：個人用とグループ用を別々に数える（上限は区域係が決める） */
const myPendings = () => D().requests.filter(r => !r.type && r.by === me().id && r.status === 'pending' && Date.now() - Date.parse(r.at) < 30 * DAY);
const reqLimit = forGroup => Number(forGroup ? D().settings.reqMaxGroup : D().settings.reqMaxPersonal) || 1;
const pendingOf = forGroup => myPendings().filter(r => !!r.forGroup === !!forGroup);
const canAsk = forGroup => pendingOf(forGroup).length < reqLimit(forGroup);
/* 自由に受け取ってよい区域：係のチェック、または「返却から○日たった区域」（日数は係が決める） */
/* 区域ごとの貸し出し：auto＝きまりのとおり、open＝貸出可能（いつでも受け取れる）、stop＝貸出中止 */
const lendMode = t => (t && (t.lend === 'open' || t.lend === 'stop' || t.lend === 'auto') ? t.lend : (t && t.free ? 'open' : 'auto'));
/* 自動で受け取り可：区域係が「自動受け取り」を使うとき、正式に返却されてから決めた日数がたった区域と、まだ一度も回ったことのない区域 */
function autoFreeOf(t) {
  if (!t || Number(D().settings.autoFree) !== 1 || t.awayPoolAt || t.paperLentAt) return false;
  // 紙の記録（S-13）で回り終えた日（t.paperDone）も、正式な返却として数える
  const base = [t.completedAt, t.returnedAt, t.paperDone].filter(Boolean).map(String).sort().pop();
  if (!base) return true;
  return daysSince(base) >= (Number(D().settings.freeAfterDays) || 0);
}
/* 紙の記録（S-13）で貸出中の区域：t.paperLentAt（割り当てた日。係のスマホが S-13 から書く。伝道者のスマホにはS-13がないため）
   だれが持っているか（名前）は、係のスマホの S-13 からだけ読む */
const paperLent = t => !!(t && !t.holder && t.paperLentAt);
function paperHoldOf(t) {
  if (!paperLent(t)) return null;
  const x = (D().s13 || []).filter(r => r && r.kind === 'a' && r.terrId === t.id && !r.c && r.a === t.paperLentAt).pop();
  return { a: String(t.paperLentAt), name: x ? String(x.name || '') : '' };
}
const isLent = t => !!(t && (t.holder || paperLent(t)));
/* 紙の区域カード（S-13）から引き継いだ区域：係が S-13 で「グループ奉仕（名前）」を入れて、アプリに渡したもの。
   t.paperHand＝紙で割り当てた日。担当が変わる（受け取った日が変わる）と自然に外れる（サーバーの paperHand_ と同じ） */
const paperHandOf = t => !!(t && t.paperHand && t.holder && t.lentAt && dstr(t.lentAt) === String(t.paperHand));
/* 前回返却した日（区域をもらう一覧の表示・「返却から長い順」）：アプリの返却・回り終えた日と、紙の記録（S-13）で完了した日の新しいほう */
function lastBackOf(t) {
  const c = [t.completedAt, t.returnedAt].filter(Boolean).map(String);
  if (t.paperDone) { const [y, m, d] = String(t.paperDone).split('-').map(Number); if (y && m && d) c.push(new Date(y, m - 1, d).toISOString()); }
  return c.sort().pop() || '';
}
/* 前回回り終えた日（係の区域一覧）：アプリの記録と紙の記録（S-13）の新しいほう。紙の記録なら、そう書く */
function lastDoneTxt(t) {
  const app = t.completedAt ? dstr(t.completedAt) : '', paper = t.paperDone ? String(t.paperDone) : '';
  if (paper && paper > app) { const [y, m, d] = paper.split('-').map(Number); return `${fmtDay(new Date(y, m - 1, d).toISOString())}（紙の記録）`; }
  if (app) return fmtDay(t.completedAt) + (t.completedPct != null && t.completedPct < 100 ? `（${t.completedPct}%）` : '');
  return '記録なし';
}
function isFree(t) {
  if (!t || isLent(t)) return false;
  const m = lendMode(t);
  if (m === 'stop') return false;
  if (m === 'open') return true;
  return autoFreeOf(t);
}
const lendTag = t => {
  if (t && t.holder) return '<span class="lendtag lent">貸出中</span>';
  if (paperLent(t)) return '<span class="lendtag lent">貸出中（紙の記録）</span>';
  const m = lendMode(t);
  if (m === 'stop') return '<span class="lendtag stop">貸出中止</span>';
  if (m === 'open') return '<span class="lendtag open">受取可（係）</span>';
  return autoFreeOf(t) ? '<span class="lendtag auto">受取可（自動）</span>' : '<span class="lendtag adm">係が貸し出す</span>';
};
/* 1人が持てる区域カードの枚数（区域係が決める）。グループ奉仕の区域と個人の区域を、別々に数える。申し込み中もふくむ */
const holdMax = g => Number(g ? D().settings.holdMaxGroup : D().settings.holdMaxPersonal) || 2;
const heldOf = g => D().territories.filter(t => t.holder === me().id && !!t.group === !!g).length;
const hasRoom = g => heldOf(g) + pendingOf(g).length < holdMax(g);
const canTakeFree = g => hasRoom(g) && (g || heldOf(false) < D().settings.selfTakeMax);
const myPending = () => myPendings()[0];
const freeTerrs = () => D().territories.filter(t => !isLent(t) && lendMode(t) !== 'stop' && !t.dummy); // 貸出中止・紙の記録で貸出中の区域は、申し込みの一覧に出さない
const heldCount = uid => D().territories.filter(t => t.holder === uid).length;
const agoLabel = iso => { const d = daysSince(iso); return d === 0 ? '今日' : `${d}日前`; };
const byLongest = (a, b) => ((a.last || '') < (b.last || '') ? -1 : 1); // 長く回っていない順（記録なしが先）

/* 「もう1枚」のボタン（上限に届いていたら、そのことを小さく出す） */
function addBtnHtml(g) {
  const label = g ? '＋ 集まりで使う区域をもらう' : (canGroupTerr() ? '＋ 個人の区域をもらう' : '＋ 区域カードをもう1枚ほしい');
  // 集まりで使う区域：「司会だけする」（ほかの監督・司会者のカードで、今日だけ司会する）を右半分に。枚数の上限とは関係なく出す
  const leadOn = g && canGroupTerr() && D().settings.groupOn !== 0;
  const leadBtn = full => `<button class="btn ${full ? 'block ' : ''}wideadd twoline" data-leadpick><b>司会だけする</b><small>ほかの人のカードを今日だけ使う</small></button>`;
  if (hasRoom(g) && canAsk(g)) {
    return leadOn
      ? `<div class="addpair"><button class="btn wideadd twoline" data-reqopen="g"><b>＋ 区域をもらう</b><small>自分のカードにする</small></button>${leadBtn(false)}</div>`
      : `<button class="btn block wideadd" data-reqopen="${g ? 'g' : 'p'}">${label}</button>`;
  }
  const awayBtn = g && myAwayCount(true) < D().settings.awayMax ? `<button class="btn block wideadd" data-gawaypick>＋ グループで回る留守宅カードをもらう</button>` : '';
  return `<p class="muted capnote">${g ? '集まりで使う区域' : '個人の区域'}は${holdMax(g)}枚までです（申し込み中もふくみます）。</p>` + awayBtn + (leadOn ? leadBtn(true) : '');
}

/* ---------- 今日の司会：ほかの監督・司会者のカードをえらぶ ---------- */
let leadQ = '';
function leadCands() {
  const mg = myGroup();
  const rank = t => (isAllUse(t) ? 1 : t.group === mg ? 0 : 2); // 自分のグループ → 全体の集まり → ほかのグループ
  return D().territories
    .filter(t => t.holder && t.holder !== me().id && t.group && !t.dummy)
    .sort((a, b) => rank(a) - rank(b) || byNo(a, b));
}
function openLeadPick() {
  if (!canGroupTerr() || D().settings.groupOn === 0) return;
  const list = leadCands(), mg = myGroup();
  const secOf = t => (isAllUse(t) ? '全体の集まりの区域' : t.group === mg ? `${t.group}グループの区域` : 'ほかのグループの区域');
  let prev = '';
  const rows = list.map(t => {
    const sec = secOf(t), head = sec !== prev ? `<div class="hgrp leadsec"><b>${esc(sec)}</b></div>` : '';
    prev = sec;
    const s = terrStats(t, t.lentAt ? Date.parse(t.lentAt) : Date.now() - 90 * DAY), l = leadOf(t), mine = l && l.uid === me().id;
    const due = dueOf(t);
    const btn = mine ? '<span class="leadtag">今日の司会</span>'
      : l ? `<span class="muted leadbusy">今日は${esc(uname(l.uid))}さんが司会</span>`
      : `<button class="btn small primary" data-leadtake="${esc(t.id)}">この区域で司会する</button>`;
    return `${head}<article class="pick" data-lq="${esc([t.no, t.name, uname(t.holder)].join(' '))}">
      <span class="stamp sm${noCls(t.no)} grp">${esc(t.no)}</span>
      <div><b>${esc(t.name)}</b>
        <p class="muted">担当：${esc(uname(t.holder))}さん</p>
        <p class="muted">訪問した家 ${s.visited} / ${s.n}${due ? `　返却の目安 ${fmtDay(due)}` : ''}</p></div>
      ${btn}</article>`;
  }).join('');
  setSheet(headHtml(null, '司会だけする', '今日だけ・カードは担当者のまま') + `
    <p class="hint">ほかの監督・司会者が持っている「集まりで使う区域」で、今日だけ司会ができます。カードの担当者、返却の日、S-13の記録は変わりません。あなたが持てる枚数にも数えません。</p>
    <p class="hint">今日の司会は、今日回る人をえらぶ・回る範囲を分ける・今日の記録を直す、ができます。日付が変わると自動で終わります。</p>
    ${list.length > 6 ? `<label class="field"><span>番号・名前・担当者でさがす</span><input type="text" id="leadQ" placeholder="例：5-1、高安" autocomplete="off" value="${esc(leadQ)}"></label>` : ''}
    <div id="leadList">${rows || '<div class="empty">今、ほかの監督・司会者が持っている集まりで使う区域はありません。</div>'}</div>
    <button class="btn block" data-close>閉じる</button>`);
  const S = $('#sheet');
  const filt = () => {
    const q = leadQ.replace(/\s+/g, '');
    $$('#leadList [data-lq]', S).forEach(a => { a.hidden = !!q && !a.dataset.lq.replace(/\s+/g, '').includes(q); });
    $$('#leadList .leadsec', S).forEach(h => { // 見出しの下が全部かくれたら、見出しもかくす
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('leadsec')) { if (!n.hidden) any = true; n = n.nextElementSibling; }
      h.hidden = !any;
    });
  };
  if ($('#leadQ')) { $('#leadQ').oninput = e => { leadQ = e.target.value.trim(); filt(); }; filt(); }
  $$('[data-leadtake]', S).forEach(x => x.onclick = () => takeLead(x.dataset.leadtake));
}
async function takeLead(id) {
  let t = terrById(id);
  if (!t || !t.holder || t.holder === me().id || !t.group) { toast('この区域では司会できません'); return; }
  if (!await ask('', { title: `区域${t.no}で、今日だけ司会しますか？`, body: `カードの担当は${uname(t.holder)}さんのままです。返却の日やS-13の記録は変わりません。`, ok: '司会する', danger: false })) return;
  if (LIVE) { try { await refresh(true); } catch (e) { /* 通信できなくても続ける（サーバーで確かめる） */ } }
  t = terrById(id);
  const l = t && leadOf(t);
  if (!t || !t.holder || t.holder === me().id) { toast('この区域の担当者が変わりました。もう一度えらんでください'); openLeadPick(); return; }
  if (l && l.uid !== me().id) { toast(`今日は${uname(l.uid)}さんが司会をしています`); openLeadPick(); return; }
  closeSheet();
  commit(`区域${t.no}の司会を引き受けました（今日まで）`, () => {
    t.lead = { uid: me().id, h: t.holder, until: endOfToday(), by: me().id, at: new Date().toISOString() };
  });
}
async function quitLead(id, byHolder) {
  const t = terrById(id), l = leadOf(t);
  if (!t || !l) return;
  if (byHolder ? t.holder !== me().id : l.uid !== me().id) return;
  const ok = byHolder
    ? await ask('', { title: `${uname(l.uid)}さんを、今日の司会から外しますか？`, body: `区域${t.no}は、あなたのカードのままです。`, ok: '外す' })
    : await ask('', { title: `区域${t.no}の今日の司会をやめますか？`, body: 'えらんだ「今日回る人」と範囲は、そのまま残ります。', ok: '司会をやめる' });
  if (!ok) return;
  commit(byHolder ? `${uname(l.uid)}さんを今日の司会から外しました` : `区域${t.no}の司会をやめました`, () => { t.lead = null; });
}
function reqBoxesHtml(g) {
  const sent = LIVE ? (Store.queue.length
    ? '<p class="tag-warn">まだ係に送れていません。電波のよい場所でこの画面を開くと、自動で送ります。</p>'
    : '<p class="muted">係に送信ずみです。</p>') : '';
  return myPendings().filter(p => !!p.forGroup === !!g).sort((a, b) => (a.at < b.at ? -1 : 1)).map(p => {
    const t = p.terrId ? terrById(p.terrId) : null;
    return `<div class="reqbox">
      <p><b>${p.forGroup ? (p.use === 'all' ? '全体の集まりの区域を' : `${esc(p.forGroup)}グループの区域を`) : '区域カードを'}申し込み中です</b></p>
      <p class="muted">希望：${t ? `区域${t.no}` : 'どこでもよい'}　${fmtDay(p.at)}に申し込み</p>
      <p class="muted">係が決めると、ここに加わります。</p>${sent}
      <div class="actions"><button class="btn small" data-reqcancel="${esc(p.id)}">申し込みを取り消す</button></div></div>`;
  }).join('');
}
function renderRequestArea() {
  const ps = myPendings().sort((a, b) => (a.at < b.at ? -1 : 1));
  const sent = LIVE ? (Store.queue.length
    ? '<p class="tag-warn">まだ係に送れていません。電波のよい場所でこの画面を開くと、自動で送ります。</p>'
    : '<p class="muted">係に送信ずみです。</p>') : '';
  const boxOf = p => {
    const t = p.terrId ? terrById(p.terrId) : null;
    return `<div class="reqbox">
      <p><b>${p.forGroup ? (p.use === 'all' ? '全体の集まりの区域を' : `${esc(p.forGroup)}グループの区域を`) : '区域カードを'}申し込み中です</b></p>
      <p class="muted">希望：${t ? `区域${t.no}` : 'どこでもよい'}　${fmtDay(p.at)}に申し込み</p>
      <p class="muted">係が決めると、上の区域カードの一覧に加わります。</p>${sent}
      <div class="actions"><button class="btn small" data-reqcancel="${esc(p.id)}">申し込みを取り消す</button></div></div>`;
  };
  // グループの区域を受け取れる人は、グループ・個人それぞれの見出しの中に出す（renderCards）
  if (canGroupTerr()) { $('#reqArea').innerHTML = ''; }
  else {
    const boxes = ps.filter(p => !p.forGroup).map(boxOf).join('');
    $('#reqArea').innerHTML = boxes + addBtnHtml(false);
  }
  const done = D().requests.filter(r => r.by === me().id && (r.status === 'approved' || r.status === 'declined') && !r.seen);
  $('#reqNotice').innerHTML = done.map(r => {
    const t = terrById(r.terrId);
    if (r.type === 'delHouse') return r.status === 'approved'
      ? `<div class="notice info"><b>「${esc(r.label || '家')}」の削除が承認されました。</b>地図から消えています。<span class="actions"><button class="btn small" data-reqseen="${esc(r.id)}">わかりました</button></span></div>`
      : `<div class="notice warn"><b>「${esc(r.label || '家')}」の削除の申請は、見送りになりました。</b>くわしくは区域係に確認してください。<span class="actions"><button class="btn small" data-reqseen="${esc(r.id)}">わかりました</button></span></div>`;
    return r.status === 'approved'
      ? `<div class="notice info"><b>係から区域${t ? t.no : ''}のカードが届きました。</b>「区域カード」の画面から地図をひらけます。<span class="actions"><button class="btn small" data-reqseen="${esc(r.id)}">わかりました</button></span></div>`
      : `<div class="notice warn"><b>申し込みは今回見送りになりました。</b>くわしくは区域係に相談してください。<span class="actions"><button class="btn small" data-reqseen="${esc(r.id)}">わかりました</button></span></div>`;
  }).join('');
}

let reqForGroup = false; // 監督・司会者が「集まりで使う区域」として申し込むとき
let reqUse = 'grp';       // そのときの使い道：grp グループ奉仕・all 全体の集まり
let reqSort = 'long';     // 区域をもらう一覧の並べ方：near 近い順・long 長く回っていない順・young 若い世代・many 家が多い順
/* 区域の「若い世代」の割合：これまでに会えた記録のうち、年代が若い世代だった割合（記録が少ないときは出さない） */
function youngShare(t) {
  const am = AGE_ON ? ageMap() : null;
  if (am) { // 市の年齢データ（字ごとの20〜39歳の割合）を、区域に入っている字の割合で平均する
    const list = terrAza(t).filter(a => am.has(a.k));
    if (list.length) {
      const w = list.reduce((s2, a) => s2 + a.r, 0) || 1;
      return { city: true, pct: Math.round(list.reduce((s2, a) => s2 + am.get(a.k).y * a.r, 0) / w) };
    }
  }
  let n = 0, y = 0;
  for (const h of housesOf(t.id)) for (const u of targets(h)) {
    for (const v of visitsOf(K(h.id, u))) { if (v.result !== 'met' || !v.age) continue; n++; if (YOUNG.has(v.age)) y++; }
  }
  return { n, y, pct: n >= 3 ? Math.round(y / n * 100) : null };
}
function openRequestSheet(g) {
  if (g !== undefined) reqForGroup = !!g;
  if (!canGroupTerr()) reqForGroup = false;
  const G = reqForGroup, canTake = canTakeFree(G);
  const list = freeTerrs().map(t => {
    return { t, last: lastBackOf(t), n: terrStats(t, 0).n, dist: myPos ? distM(myPos, center(t.polygon)) : null, yg: reqSort === 'young' ? youngShare(t) : null };
  });
  if (reqSort === 'near' && !myPos) reqSort = 'long';
  const SORTS = { near: (a, b) => a.dist - b.dist, long: byLongest, many: (a, b) => b.n - a.n,
    young: (a, b) => ((b.yg.pct == null ? -1 : b.yg.pct) - (a.yg.pct == null ? -1 : a.yg.pct)) || byLongest(a, b) };
  list.sort(SORTS[reqSort] || byLongest);
  const rows = list.map(({ t, last, n, dist, yg }) => `<article class="pick">
      <span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span>
      <div><b>${esc(t.name)}</b>
        <p class="muted">${n}軒・部屋　${last ? `前回返却した日 ${fmtDay(last)}` : 'まだ回ったことがない区域'}${dist != null ? `　ここから約${fmtDist(dist)}` : ''}</p>${yg && yg.pct != null ? `<p class="muted">${yg.city ? `20〜39歳 ${yg.pct}%（市の年齢データ）` : `若い世代 ${yg.pct}%（会えた記録 ${yg.n}件から）`}</p>` : ''}${ageLine(t)}</div>
      ${isFree(t) && canTake
        ? `<button class="btn small primary" data-take="${esc(t.id)}">受け取る</button>`
        : `<button class="btn small" data-ask="${esc(t.id)}">係に頼む</button>`}
    </article>`).join('');
  setSheet(headHtml(null, G ? `${esc(myGroup())}グループの区域をもらう` : (canGroupTerr() ? '個人の区域をもらう' : '区域カードをもう1枚'),
      `持てるのは${holdMax(G)}枚まで（今 ${heldOf(G)}枚・申し込み中 ${pendingOf(G).length}件）`) + `
    ${G ? `<div class="seg" role="group" aria-label="もらうカード"><button type="button" aria-pressed="true">区域カード</button><button type="button" data-gaway aria-pressed="false">留守宅カード</button></div>
      <p class="hint">グループの区域は、奉仕の集まりで使います。受け取ったら「今日回る人をえらぶ」で、回る人を決められます。</p>` : ''}
    <p class="hint">「受け取る」の区域は、すぐにあなたのカードになります。<br>「係に頼む」の区域は、係が決めてから届きます。</p>
    ${!canTake && list.some(x => isFree(x.t)) ? `<div class="notice warn">この区域は自分では受け取れません（${G ? '' : `自分で受け取れるのは${D().settings.selfTakeMax}枚まで・`}上限に届いています）。係に頼むことはできます。</div>` : ''}
    <p class="q">並べ方</p>
    <div class="sortchips" role="group" aria-label="並べ方">
      <button type="button" class="chip" data-rsort="near" aria-pressed="${reqSort === 'near'}">近い順</button>
      <button type="button" class="chip" data-rsort="long" aria-pressed="${reqSort === 'long'}">返却から長い順</button>
      <button type="button" class="chip" data-rsort="young" aria-pressed="${reqSort === 'young'}">若い世代が多い順</button>
      <button type="button" class="chip" data-rsort="many" aria-pressed="${reqSort === 'many'}">家が多い順</button></div>
    ${reqSort === 'near' ? '<div class="row"><button class="btn small" id="reqNear">現在地を更新する</button></div>' : ''}
    ${reqSort === 'young' ? `<p class="hint">${AGE_ON && ageMap() ? '市の年齢データ（字ごとの20〜39歳の割合）から出しています。字が決まっていない区域は、「会えた」記録の年代から出します。' : '市の年齢データが入っていないので、これまでに「会えた」と記録したときの年代から出した目安です。'}</p>` : ''}
    ${rows || '<div class="empty">今、空いている区域はありません。</div>'}
    <button class="btn block primary" data-ask="">どこでもよいので係に頼む</button>
    <button class="btn block" data-close>閉じる</button>`);
  const S = $('#sheet');
  if ($('#reqNear')) $('#reqNear').onclick = () => locate(openRequestSheet);
  $$('[data-rsort]', S).forEach(x => x.onclick = () => {
    reqSort = x.dataset.rsort;
    if (reqSort === 'near' && !myPos) { locate(openRequestSheet); return; }
    openRequestSheet();
  });
  if ($('[data-gaway]', S)) $('[data-gaway]', S).onclick = () => openAwayPick(true);
  $$('[data-take]', S).forEach(x => x.onclick = () => takeTerr(x.dataset.take));
  $$('[data-ask]', S).forEach(x => x.onclick = () => askTerr(x.dataset.ask || null));
}
async function takeTerr(id) {
  const t = terrById(id);
  if (!t || t.holder) { toast('この区域はすでに貸し出されています'); return; }
  if (!isFree(t) || !canTakeFree(reqForGroup && canGroupTerr())) { toast('この区域は係に頼んでください'); return; }
  if (!await ask(`区域${t.no}を受け取ります。よろしいですか？`)) return;
  closeSheet();
  commit(`区域${t.no}を受け取りました`, () => {
    const now = new Date().toISOString();
    t.holder = me().id; t.lentAt = now; t.selfTakenAt = now; t.selfSeen = false; t.helpers = []; t.firstDoneAt = null; t.firstDonePct = null; delete t.firstLow; delete t.recLess; t.awayPoolAt = null; t.poolRetId = null;
    t.group = reqForGroup && canGroupTerr() ? myGroup() : null;
    if (t.group && reqUse === 'all') t.use = 'all'; else delete t.use;
    D().requests = D().requests.filter(r => !(r.status === 'pending' && r.by === me().id && r.terrId === id));
  });
}
function askTerr(id) {
  const g = !!(reqForGroup && canGroupTerr());
  if (!hasRoom(g)) { toast(`${g ? 'グループの区域' : '個人の区域'}は${holdMax(g)}枚までです（申し込み中もふくみます）`); return; }
  if (!canAsk(g)) { toast(`${g ? 'グループ用' : '個人'}の申し込みは、${reqLimit(g)}件までです。係の返事を待ってください`); return; }
  const t = id ? terrById(id) : null;
  closeSheet();
  commit(t ? `区域${t.no}を係に申し込みました` : '区域カードを係に申し込みました', () => {
    const r = { id: 'r' + uid(), by: me().id, terrId: id || null, at: new Date().toISOString(), status: 'pending' };
    if (g) r.forGroup = myGroup();
    if (g && reqUse === 'all') r.use = 'all';
    D().requests.push(r);
  });
}

/* 係：申し込みと、自分で受け取られた区域（用件があるときだけ表示） */
function renderInbox() {
  const reqs = D().requests.filter(r => !r.type && r.status === 'pending').sort((a, b) => (a.at < b.at ? -1 : 1));
  const dels = delReqs().sort((a, b) => (a.at < b.at ? -1 : 1));
  const taken = D().territories.filter(t => t.holder && t.selfTakenAt && t.selfSeen === false);
  const free = freeTerrs().map(t => ({ t, last: lastBackOf(t) })).sort(byLongest);
  let html = '';
  if (dels.length) {
    html += `<h2 class="sec">家の削除の申請（${dels.length}件）</h2>
      <p class="hint">申請した人に確認・連絡してから、「削除する」か「見送る」を選んでください。</p>` + dels.map(r => {
      const h = houseById(r.houseId), t = terrById(h ? h.terrId : r.terrId);
      const n = h ? targets(h).reduce((a, u) => a + sum(K(h.id, u)).n, 0) : 0;
      const hasF = !!h && targets(h).some(u => fol(K(h.id, u)));
      const name = h ? (h.type === 'apt' ? `${esc(h.label || '集合住宅')}（集合住宅・${h.units.length}部屋）` : `${esc(h.label || '目印なし')}（一戸建て）`) : esc(r.label || '');
      return `<article class="ritem k-new delreq"><div>
          <p class="who">${esc(uname(r.by))}さん</p>
          <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> 区域${t ? esc(t.no) : '-'}　${name}</p>
          <p class="muted">理由：${esc(r.reason || '—')}　${fmtDate(r.at)}に申請</p>
          ${h ? `<p class="muted">訪問の記録 ${n}件${hasF ? '・<b>再訪問の受け持ちあり</b>' : ''}${h.createdBy ? `　この家を追加した人：${h.createdBy === r.by ? '申請した本人' : esc(uname(h.createdBy)) + 'さん'}` : ''}</p>`
            : '<p class="tag-warn">この家は、すでにありません</p>'}
        </div>${h ? `<button class="btn small" data-go="${esc(h.id)}" data-unit="">地図で見る</button>` : '<span></span>'}
        <div class="actions span">${h ? `<button class="btn small danger" data-delok="${esc(r.id)}">削除する</button>` : ''}<button class="btn small" data-delno="${esc(r.id)}">${h ? '見送る' : '閉じる'}</button></div></article>`;
    }).join('');
  }
  if (reqs.length) {
    html += `<h2 class="sec">区域カードの申し込み（${reqs.length}件）</h2>
      <p class="hint">貸し出す区域は、希望の区域か、長く回っていない区域が先に選ばれています。</p>` + reqs.map(r => {
      const want = r.terrId ? terrById(r.terrId) : null;
      const wantFree = !!want && !want.holder;
      const held = D().territories.filter(t => t.holder === r.by);
      const over = held.filter(pastDue).length;
      const def = wantFree ? want.id : (free[0] ? free[0].t.id : '');
      const opts = free.map(({ t, last }) =>
        `<option value="${esc(t.id)}"${t.id === def ? ' selected' : ''}>区域${t.no}（${last ? `前回 ${fmtDay(last)}` : '回り終えた記録なし'}）</option>`).join('');
      return `<article class="ritem k-new"><div>
          <p class="rt">${esc(uname(r.by))}さん${r.forGroup ? ` <span class="gbadge">${r.use === 'all' ? '全体の集まり用' : `${esc(r.forGroup)}グループ用`}</span>` : ''}</p>
          <p class="muted">希望：${want ? `区域${want.no}${wantFree ? '' : '（すでに貸出中）'}` : 'どこでもよい'}　${fmtDay(r.at)}</p>
          <p class="muted">今持っているカード ${held.length}枚${over ? `<span class="tag-warn">返却の目安を過ぎた ${over}枚</span>` : ''}</p>
        </div><span></span>
        <div class="actions span">
          ${free.length
            ? `<label>貸し出す区域 <select data-reqterr="${esc(r.id)}">${opts}</select></label><button class="btn small primary" data-reqok="${esc(r.id)}">貸し出す</button>`
            : '<span class="muted">空いている区域がありません。</span>'}
          <button class="btn small" data-reqno="${esc(r.id)}">見送る</button>
        </div></article>`;
    }).join('');
  }
  if (taken.length) {
    html += `<h2 class="sec">自分で受け取られた区域（${taken.length}件）</h2>` + taken.map(t =>
      `<article class="ritem k-away"><div>
        <p class="rt"><span class="stamp xs${noCls(t.no)}">${esc(t.no)}</span> ${esc(t.name)}</p>
        <p class="muted">${esc(uname(t.holder))}さん　${fmtDay(t.selfTakenAt)}に受け取り（今 ${heldCount(t.holder)}枚）</p>
      </div><button class="btn small" data-takenseen="${esc(t.id)}">確認した</button></article>`).join('');
  }
  if (!LIVE && !RENSHU) html = `<div class="notice warn"><b>この画面は「試作版」です。</b>この端末の中だけのデータで動いていて、ほかの人の申し込みは届きません。<br>
    本番で使うときは、区域係から配られたリンク（GitHub Pagesのアドレス）を開いてください。</div>` + html;
  if (LIVE) html = `<div class="setrow"><span>最後に確認した時刻：<b>${Store.syncAt ? fmtTime(new Date(Store.syncAt)) : 'まだ'}</b>${Store.queue.length ? `<br><span class="tag-warn">未送信 ${Store.queue.length}件</span>` : ''}</span>
    <button type="button" class="btn small primary" id="adSync">今すぐ確認する</button></div>` + html;
  $('#adInbox').innerHTML = html;
  const pendN = waitCount(); // 申し込み・削除の申請・自分で受け取られた区域・スマホの登録（下のタブの数字と同じ）
  $('#adInboxEmpty').innerHTML = pendN ? '' : '<div class="empty">今、承認や申し込みを待っているものはありません。</div>';
  $('#apCnt').textContent = pendN; $('#apCnt').hidden = !pendN;
  if ($('#adSync')) $('#adSync').onclick = async () => {
    const b = $('#adSync'); b.disabled = true; b.textContent = '確認しています…';
    try { if (Store.queue.length) await flush(); await refresh(true); await fetchDevices(true); toast('最新の状態にしました'); }
    catch (e) { toast('通信できませんでした。電波を確認してください'); }
    renderAll();
  };
  updateAdminBadge();

  const st = D().settings;
  paintTakeTgl();
  // 貸し出しのきまりの設定の行は、状況の右の「区域の決め」に出す（kimari.js・状況と設定を左右に）。
  // 状況に効くもの（返却の目安・完了の目安など）は「貸し出しと返却」に、ほかは「受け取れる枚数・一緒に回る など」に分ける
  const R = {
    lendDays: `<div class="setrow">
      <span>返却の目安（受け取ってから）<br><small class="hint">カードに「返却の目安」の日付が出ます。過ぎると係の一覧で目立ちます</small></span>
      <div class="rng"><input type="range" min="30" max="365" step="5" value="${lendDays()}" data-range="lendDays" data-unit="日" aria-label="日数"><output>${lendDays()}日</output></div></div>`,
    donePct: `<div class="setrow">
    <span>区域カードを「完了」にできる目安<br><small class="hint">訪ねた家の割合。目安に届くと、本人の画面に「返却して完了にできます」と出ます</small></span>
    <div class="stepper"><button type="button" data-donepct="-5" aria-label="目安を下げる">−</button><output class="wide">${st.donePct}%</output>
    <button type="button" data-donepct="5" aria-label="目安を上げる">＋</button></div></div>`,
    awayRetPct: `<div class="setrow">
      <span>留守宅を回り終えたとみなす割合<br><small class="hint">1回目に会えなかった家のうち、この割合を訪ね直すと、伝道者が返却できます</small></span>
      <div class="rng"><input type="range" min="0" max="100" step="5" value="${awayRetPct()}" data-range="awayRetPct" data-unit="%" aria-label="割合"><output>${awayRetPct()}%</output></div></div>`,
    awayAgainSlot: `<div class="setrow" data-hk="awayAgainSlot">
      <span>留守宅を「訪ね直した」と数える条件<br><small class="hint">上の割合を数えるときに、どう訪ねたら「訪ね直した」とするかです。会えた・拒否は、時間帯にかかわらず数えます</small></span>
      <div class="seg" role="group" aria-label="訪ね直したと数える条件"><button type="button" data-sset="awayAgainSlot" data-v="0" aria-pressed="${!againSlot()}">別の日</button>
      <button type="button" data-sset="awayAgainSlot" data-v="1" aria-pressed="${againSlot()}">別の日で、別の時間帯</button></div></div>`,
    lowOn: `<div class="setrow" data-hk="lowOn">
      <span>記録の少ない正式返却を、自動で確かめる<br><small class="hint">区域係が目安に届かないまま正式返却にしたとき、決めた日数のあとに記録を数え直し、届いていなければ途中の返却にします</small></span>
      <div class="seg" role="group" aria-label="記録の少ない正式返却を自動で確かめる"><button type="button" data-sset="lowOn" data-v="1" aria-pressed="${Number(st.lowOn) !== 0}">使う</button>
      <button type="button" data-sset="lowOn" data-v="0" aria-pressed="${Number(st.lowOn) === 0}">使わない</button></div></div>`,
    lowWait: Number(st.lowOn) !== 0 ? `<div class="setrow" data-hk="lowWait">
      <span>確かめるまで待つ日数<br><small class="hint">この間に届いた記録（返却した日より前の日付）も数えます</small></span>
      <div class="stepper"><button type="button" data-kset="lowWait" data-d="-1" aria-label="日数を減らす">−</button>
        <output class="wide">${lowWaitDays()}日</output>
        <button type="button" data-kset="lowWait" data-d="1" aria-label="日数を増やす">＋</button></div></div>` : '',
    autoFree: `<div class="setrow">
      <span>自動受け取り<br><small class="hint">「使う」にすると、きまりに合う区域を、伝道者が自分で受け取れます（まだ一度も回っていない区域と、正式に返却されてから下の日数がたった区域）</small></span>
      <div class="seg" role="group"><button type="button" data-sset="autoFree" data-v="1" aria-pressed="${Number(st.autoFree) === 1}">使う</button>
      <button type="button" data-sset="autoFree" data-v="0" aria-pressed="${Number(st.autoFree) !== 1}">使わない</button></div></div>`,
    freeAfterDays: `<div class="setrow">
      <span>正式に返却されてから、自動で受け取り可になるまで</span>
      <div class="rng"><input type="range" min="0" max="365" step="5" value="${Number(st.freeAfterDays) || 0}" data-range="freeAfterDays" data-unit="日" aria-label="日数"><output>${Number(st.freeAfterDays) || 0}日</output></div></div>`,
    skipDays: `<div class="setrow">
      <span>「最近会えた家」として、新しく回るときに青いチェックを付ける期間<br><small class="hint">区域を受け取る前のこの期間に会えた家（留守宅カードなど）は、はじめから薄い色と青いチェックで表示し、「おすすめ順」に出ません（0＝使わない）</small></span>
      <div class="stepper"><button type="button" data-kset="skipDays" data-d="-10" aria-label="期間を短くする">−</button>
        <output class="wide">${st.skipDays ? st.skipDays + '日' : '使わない'}</output>
        <button type="button" data-kset="skipDays" data-d="10" aria-label="期間を長くする">＋</button></div></div>`,
    followSkipDays: `<div class="setrow">
      <span>再訪問の家を、区域カードで「最近会えた家（とばしてよい）」にする期間<br><small class="hint">再訪問をしている人が最後に会えた日から数えます。この期間がすぎると、区域カードを回る人も訪ねてよい家になります（0＝使わない）</small></span>
      <div class="stepper"><button type="button" data-kset="followSkipDays" data-d="-10" aria-label="期間を短くする">−</button>
        <output class="wide">${st.followSkipDays ? st.followSkipDays + '日' : '使わない'}</output>
        <button type="button" data-kset="followSkipDays" data-d="10" aria-label="期間を長くする">＋</button></div></div>`,
    skipDone: `<div class="setrow">
      <span>「最近会えた家」を完了の数に入れる<br><small class="hint">入れると、回り終えた割合（％）に数えます</small></span>
      <div class="seg" role="group" aria-label="完了の数に入れる">
        <button type="button" data-sset="skipDone" data-v="1" aria-pressed="${st.skipDone !== 0}">入れる</button>
        <button type="button" data-sset="skipDone" data-v="0" aria-pressed="${st.skipDone === 0}">入れない</button></div></div>`,
    selfTakeMax: `<div class="setrow">
    <span>「自由に受け取ってよい」区域を、1人が自分で受け取れる枚数<br><small class="hint">すでに持っているカードも数えます</small></span>
    <div class="stepper"><button type="button" data-takemax="-1" aria-label="枚数を減らす">−</button><output class="wide">${st.selfTakeMax}枚まで</output>
    <button type="button" data-takemax="1" aria-label="枚数を増やす">＋</button></div></div>`,
    holdMaxPersonal: `<div class="setrow">
      <span>1人が持てる区域カード（個人の区域）<br><small class="hint">持っているカードと、申し込み中をあわせた数です</small></span>
      <div class="stepper"><button type="button" data-kset="holdMaxPersonal" data-d="-1" aria-label="枚数を減らす">−</button>
        <output class="wide">${st.holdMaxPersonal || 2}枚まで</output>
        <button type="button" data-kset="holdMaxPersonal" data-d="1" aria-label="枚数を増やす">＋</button></div></div>`,
    holdMaxGroup: `<div class="setrow">
      <span>監督・司会者が持てる集まりで使う区域<br><small class="hint">グループ奉仕と全体の集まりを合わせて数えます（個人の区域とは別）。申し込み中もふくみます。枝番は1つずつ数えます</small></span>
      <div class="rng"><input type="range" min="1" max="40" step="1" value="${Math.min(40, Number(st.holdMaxGroup) || 2)}" data-range="holdMaxGroup" data-unit="枚まで" aria-label="枚数"><output>${Math.min(40, Number(st.holdMaxGroup) || 2)}枚まで</output></div></div>`,
    reqMaxPersonal: `<div class="setrow">
      <span>1人が同時に「係に頼める」申し込み（個人の区域）<br><small class="hint">係の返事を待っている申し込みの数です</small></span>
      <div class="stepper"><button type="button" data-kset="reqMaxPersonal" data-d="-1" aria-label="件数を減らす">−</button>
        <output class="wide">${st.reqMaxPersonal}件まで</output>
        <button type="button" data-kset="reqMaxPersonal" data-d="1" aria-label="件数を増やす">＋</button></div></div>`,
    reqMaxGroup: `<div class="setrow">
      <span>監督・司会者が同時に「係に頼める」申し込み（グループの区域）<br><small class="hint">個人の申し込みとは別に数えます</small></span>
      <div class="stepper"><button type="button" data-kset="reqMaxGroup" data-d="-1" aria-label="件数を減らす">−</button>
        <output class="wide">${st.reqMaxGroup}件まで</output>
        <button type="button" data-kset="reqMaxGroup" data-d="1" aria-label="件数を増やす">＋</button></div></div>`,
    groupOn: `<div class="setrow">
      <span>「一緒に回る」を使う<br><small class="hint">区域の担当者が、今日の終わりまで仲間を加えて、同じ区域を一緒に回れます</small></span>
      <div class="seg" role="group" aria-label="一緒に回るを使う">
        <button type="button" data-sset="groupOn" data-v="1" aria-pressed="${st.groupOn !== 0}">使う</button>
        <button type="button" data-sset="groupOn" data-v="0" aria-pressed="${st.groupOn === 0}">使わない</button></div></div>`,
    groupMax: st.groupOn !== 0 ? `<div class="setrow">
      <span>1つの区域に加えられる人数<br><small class="hint">担当者のほかに、一緒に回れる人の数です</small></span>
      <div class="stepper"><button type="button" data-kset="groupMax" data-d="-1" aria-label="人数を減らす">−</button>
        <output class="wide">${st.groupMax}人まで</output>
        <button type="button" data-kset="groupMax" data-d="1" aria-label="人数を増やす">＋</button></div></div>` : '',
    lockOthers: `<div class="setrow">
      <span>地図で、自分の区域以外を選べないようにする<br><small class="hint">「自由に受け取ってよい」区域は、オンでもえらべます（その場で受け取れます）。区域係は、この設定にかかわらず、すべての区域をえらべます</small><br><small class="hint">オンにすると、伝道者の地図では、受け取っている区域・自分の留守宅カードの家だけを選べます。ほかの区域は灰色になります（係は、いつもすべて選べます）</small></span>
      <div class="seg" role="group" aria-label="自分の区域以外を選べないようにする">
        <button type="button" data-sset="lockOthers" data-v="1" aria-pressed="${st.lockOthers !== 0}">オン</button>
        <button type="button" data-sset="lockOthers" data-v="0" aria-pressed="${st.lockOthers === 0}">オフ</button></div></div>`,
    memoSync: `<div class="setrow">
      <span>再訪問のメモを、同じ人のほかの端末（iPadなど）でも使えるようにする<br><small class="hint">メモは各自の端末の中で暗号化してから保管するので、係の画面やシートでは読めません。「使わない」にすると、保管しているメモをサーバーから消し、これまでどおり各自のスマホの中だけになります（スマホの中のメモは消えません）</small></span>
      <div class="seg" role="group" aria-label="再訪問のメモをほかの端末でも使う">
        <button type="button" data-sset="memoSync" data-v="1" aria-pressed="${st.memoSync !== 0}">使う</button>
        <button type="button" data-sset="memoSync" data-v="0" aria-pressed="${st.memoSync === 0}">使わない</button></div></div>`,
  };
  const lendBox = $('#krLend'), etcBox = $('#krEtc');
  if (lendBox) lendBox.innerHTML = ['lendDays', 'donePct', 'awayRetPct', 'awayAgainSlot', 'lowOn', 'lowWait', 'autoFree', 'freeAfterDays', 'skipDays', 'followSkipDays', 'skipDone'].map(k => R[k]).join('');
  if (etcBox) etcBox.innerHTML = ['selfTakeMax', 'holdMaxPersonal', 'holdMaxGroup', 'reqMaxPersonal', 'reqMaxGroup', 'groupOn', 'groupMax', 'lockOthers', 'memoSync'].map(k => R[k]).join('');
}
function approveReq(id) {
  const r = D().requests.find(x => x.id === id); if (!r) return;
  const sel = $(`[data-reqterr="${CSS.escape(String(id))}"]`), t = sel ? terrById(sel.value) : null;
  if (!t || t.holder) { toast('その区域は貸し出せません'); return; }
  commit(`区域${t.no}を${uname(r.by)}さんに貸し出しました`, () => {
    const now = new Date().toISOString();
    t.holder = r.by; t.lentAt = now; t.helpers = []; t.firstDoneAt = null; t.firstDonePct = null; delete t.firstLow; delete t.recLess; t.awayPoolAt = null; t.poolRetId = null;
    t.group = r.forGroup || null; // グループ用の申し込みなら、グループの区域にする
    if (t.group && r.use === 'all') t.use = 'all'; else delete t.use;
    Object.assign(r, { status: 'approved', terrId: t.id, decidedAt: now, seen: false });
  });
}
async function declineReq(id) {
  const r = D().requests.find(x => x.id === id); if (!r) return;
  if (!await ask(`${uname(r.by)}さんの申し込みを見送ります。よろしいですか？`)) return;
  commit('申し込みを見送りました', () => {
    Object.assign(r, { status: 'declined', decidedAt: new Date().toISOString(), seen: false });
  });
}

/* ---------- 区域の返却（回り終えた日の記録） ----------
   「返す」を押したら、区域係が決めた目安で、自動で決める（returnPlan）。奉仕者はえらばなくてよい
   ・1回目が目安に届いていない → 途中の返却（自動受け取りを使っていれば、すぐほかの人が受け取れる。続きから回れる）
   ・1回目が届いていて、留守宅も目安まで訪ね直した → 正式な返却（今日が S-13 の完了した日付）
   ・1回目は届いたが、留守宅が届いていない → 残りの留守宅を留守宅カードにして返す（留守宅カードの返却で目安に届いた日が正式な返却日）
   区域係は「区域係の操作」をひらくと、目安に関係なく、今までどおりえらべる */
function returnFreeText(t) {
  const m = lendMode(t);
  if (m === 'stop') return 'この区域は貸出中止なので、区域係が次の人を決めます。';
  if (m === 'open' || Number(D().settings.autoFree) === 1) return '区域はすぐに、ほかの人が受け取れるようになります。次の人は、続きから回れます。';
  return '区域係が、次に回る人に貸し出します。';
}
function openReturnSheet(tid) {
  const t = terrById(tid); if (!t || !t.holder) return;
  const r = roundInfo(tid, true); if (!r) return;
  const th = D().settings.donePct, ret = awayRetPct(), adm = isAdmin(), plan = returnPlan(r), a = plan.a;
  const simple = typeof isSimple === 'function' && isSimple();
  const sub = `${esc(uname(t.holder))}さん${t.lentAt ? `　受け取ってから ${daysSince(t.lentAt)}日・返却の目安 ${fmtDay(dueOf(t))}` : ''}`;
  const bar = (pct, label) => `<div class="progress big" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}"><i style="width:${pct}%"></i></div>`;
  const total = r.c.todo + r.c.done;
  const firstPart = r.phase === 'away'
    ? `<p class="muted">1回目を回り終えた日：<b>${fmtDay(t.firstDoneAt)}</b></p>`
    : `<p class="retlbl">1回目に訪ねた家</p>${bar(r.pct1, '1回目に訪ねた割合')}
       <p class="muted">${r.c.done} / ${total}軒（${r.pct1}%）・目安 ${th}%</p>`;
  const awayPart = plan.kind === 'partial' || !a.n ? ''
    : `<p class="retlbl">${againSlot() ? '留守だった家を、別の日・別の時間帯に訪ね直した' : '留守だった家を、別の日に訪ね直した'}</p>${bar(a.pct, '留守宅を訪ね直した割合')}
       <p class="muted">${a.n}軒のうち ${a.done}軒（${a.pct}%）・目安 ${ret}%</p>`;
  const left = Math.max(0, a.n - a.done);
  const result = plan.kind === 'done'
    ? `<p class="hint-strong ok">区域を回り終えました。返すと、今日が区域を回り終えた日（S-13 の完了した日付）になります。</p>`
    : plan.kind === 'pool'
      ? `<p class="hint-strong">残りの留守宅 ${left}軒を、留守宅カードにして返します。</p>
         <p class="muted">だれでも受け取って、違う曜日・時間帯に訪ねられます。留守宅が目安（${ret}%）まで訪ね直されたときに、区域の返却が完了します。</p>`
      : `<p class="hint-strong">途中の返却になります。回った家が、目安（${th}%）に届いていません。</p>
         <p class="muted">${returnFreeText(t)}</p>
         <p class="hint hint-must">まだ回るときは「閉じる」を押して、続けて回ってください。</p>`;
  // 紙の区域カード（S-13）から引き継いだ区域：紙で回った家はアプリにないので、本人に回り終えたかを聞く
  const ph = paperHandOf(t) && plan.kind !== 'done';
  const phPart = !ph ? '' : `<p class="hint-strong">紙の区域カード（S-13）から引き継いだ区域です。</p>
    <p class="muted">紙のカードで回った家は、アプリの記録には入っていません。紙のカードで区域を回り終えたかどうかを、えらんでください。</p>
    <button class="btn primary block wrap" data-phfin="1">回り終えたので返す（今日が完了した日付）</button>
    <button class="btn block wrap" data-phfin="0">まだ回っていない家がある（途中で返す）</button>`;
  const self = !ph && plan.kind === 'pool' && r.phase === 'first' && !simple
    ? `<button class="btn block wrap" data-first>返さないで、自分で留守宅を回る（カードを持ったまま）</button>` : '';
  // 区域係の操作：目安に関係なく、今までどおりえらべる（記録の少ない返却の確かめも、今までどおり）
  // 紙の区域カード（S-13 で渡した区域）は、紙で回った家がアプリにないので、記録での確かめはしない（えらぶ欄も出さない。返すと ph で完了）
  const low = !paperHandOf(t) && lowOnSet() && (r.phase === 'first' ? r.pct1 < th : (!lowFirstPicked(t) && (lowP1(t, r) ?? 100) < th)) ? lowCheckHtml(th, r.phase === 'first' ? r.pct1 : lowP1(t, r)) : '';
  // 紙の区域カード（S-13 で渡した区域）は、紙で回った家がアプリにないので、留守宅カードにしない・1回目を終えたことにしない
  // （本人の画面と同じく「回り終えた」か「途中」で返す。監査P3・M2 2026-10-29）
  const paperT = !!paperHandOf(t);
  const admBox = !adm ? '' : `<details class="retadm"><summary>区域係の操作（目安に関係なく決める）</summary>
      ${low}
      <button class="btn block wrap" data-fin="1">正式に返却する（区域を回り終えた）</button>
      ${paperT ? '' : '<button class="btn block wrap" data-pool>留守宅カードにして返す（だれでも受け取れる）</button>'}
      ${r.phase === 'first' && !paperT ? '<button class="btn block wrap" data-afirst>1回目を終えたことにして、本人が留守宅を回る</button>' : ''}
      <button class="btn block wrap" data-fin="0">途中で返却する（回り終えた記録はつけません）</button></details>`;
  // 目安に届いていない「途中の返却」は、ボタンを目立たせない（濃い色で返却をすすめない・点検④U5）
  setSheet(headHtml(t, `区域${t.no}を返します`, sub) + `
    ${ph ? phPart : `${firstPart}${awayPart}${result}
    ${plan.kind === 'partial' ? '<button class="btn block wrap" data-retgo>途中で返す</button>' : '<button class="btn primary block wrap" data-retgo>返す</button>'}`}
    ${self}
    <button class="btn block" data-close>閉じる</button>
    ${admBox}`);
  const sh = $('#sheet'), on = (q, f) => { const e = $(q, sh); if (e) e.onclick = f; };
  on('[data-retgo]', () => {
    if (plan.kind === 'done') finishTerr(tid, true);
    else if (plan.kind === 'pool') poolReturn(tid);
    else finishTerr(tid, false);
  });
  on('[data-first]', () => firstDone(tid));
  // 確かめ方をえらぶまで、完了にするボタン（正式に返却・留守宅カード・1回目を終えた）は押せない（H1。区域係の操作の中だけ）
  if (adm && low) {
    const gated = $$('[data-fin="1"], [data-pool], [data-afirst]', $('.retadm', sh));
    gated.forEach(b => { b.disabled = true; b.setAttribute('aria-disabled', 'true'); });
    $$('input[name="lowpick"]', sh).forEach(x => x.onchange = () => {
      gated.forEach(b => { b.disabled = false; b.removeAttribute('aria-disabled'); });
      const need = $('[data-lowneed]', sh); if (need) need.hidden = true;
    });
  }
  $$('[data-phfin]', sh).forEach(x => x.onclick = () => finishTerr(tid, x.dataset.phfin === '1'));
  const needPick = () => { if (adm && low && !lowPicked()) { toast('確かめ方を、どちらかえらんでください'); return true; } return false; };
  on('[data-afirst]', () => { if (!needPick()) firstDone(tid, lowChecked()); });
  on('[data-pool]', () => { if (!needPick()) poolReturn(tid, lowChecked()); });
  $$('[data-fin]', sh).forEach(x => x.onclick = () => { if (x.dataset.fin === '1' && needPick()) return; finishTerr(tid, x.dataset.fin === '1', lowChecked()); });
}
/* 紙の区域カード（S-13 で渡した区域）は、留守宅カードにしない・1回目を終えたことにしない（監査P3・M2）。どこから呼ばれても止める */
function paperStop(t) {
  if (!paperHandOf(t)) return false;
  toast('紙の区域カードの区域は、「回り終えたので返す」か「途中で返す」で返してください');
  return true;
}
/* 1回目を回り終えた（カードは本人が持ったまま、留守宅を回る段階になる） */
function firstDone(tid, lowOk) {
  const t = terrById(tid); if (!t) return;
  if (paperStop(t)) return;
  const r = roundInfo(tid, true), pct = r ? r.pct : null;
  closeSheet();
  commit(`区域${t.no}の1回目を回り終えました（${pct}%）。留守宅を回る段階です`, () => {
    t.firstDoneAt = new Date().toISOString(); t.firstDonePct = pct;
    // 係が目安未満のまま進めたときは、あとの正式返却で「記録の少ない返却」として確かめるために印を残す
    if (lowOnSet() && isAdmin() && pct != null && pct < D().settings.donePct) t.firstLow = lowOk ? 'ok' : 'wait'; // えらんだ確かめ方（H1。以前の 1 は、えらんでいない古い値）
    else delete t.firstLow;
    if (t.firstLow === 'ok') t.recLess = 1; // 紙や口頭で確かめた：このあと本人が返しても、回り残しを出さない（H2）
  });
}
/* 返却。done＝留守宅も回り終えた（今日が「回り終えた日」） */
function finishTerr(tid, done, lowOk) {
  const t = terrById(tid); if (!t) return;
  const r = roundInfo(tid, true), pct = r ? r.pct : null;
  closeSheet();
  if (roundTerr === tid) roundTerr = null;
  commit(`区域${t.no}を返却しました${done ? '（回り終えました）' : ''}`, () => {
    const now = new Date().toISOString();
    const rec = { id: 'x' + uid(), terrId: tid, by: t.holder, lentAt: t.lentAt, firstAt: t.firstDoneAt || null, at: now, completed: done, pct };
    if (roundFromOf(t)) rec.from = roundFromOf(t); // 続きから回った：前の人が回りはじめた日（記録の少ない返却の確かめは、この日から数える。K-1）
    if (t.group) rec.g = 1; // グループ奉仕の区域（S-13 に「グループ奉仕（名前）」と出す）
    if (isAllUse(t)) rec.ga = 1; // 全体の集まりの区域（S-13 に「全体の集まり（名前）」と出す）
    const ph = paperHandOf(t);
    D().returns.push(rec);
    if (done && ph) {
      rec.ph = 1; // 紙の区域カードで回った（記録の少ない返却の確かめ・まわり漏れの対象にしない）
      t.completedAt = now; t.completedPct = null;
      t.recLess = 1; // 紙で回った家はアプリにないので、おすすめに回り残しを出さない（H2）
    } else if (done) {
      lowMark(rec, t, lowP1(t, r), lowFirstPicked(t) ? t.firstLow === 'ok' : lowOk); // 印は、t.completedAt を書きかえる前に付ける
      t.completedAt = now; t.completedPct = r && r.phase === 'away' ? r.pct1 : pct;
    }
    delete t.paperHand;
    t.lastLentAt = t.lentAt; t.lastFirstAt = t.firstDoneAt || null;
    t.holder = null; t.lentAt = null; t.returnedAt = now; t.helpers = []; t.group = null; delete t.use; t.firstDoneAt = null; t.firstDonePct = null; delete t.firstLow;
  });
}
const returnTerr = (tid, completed) => finishTerr(tid, completed); // 以前の呼び方
/* ---- 記録の少ない正式返却（区域係が目安未満のまま正式返却にしたものを、待ってから自動で確かめる） ---- */
const lowOnSet = () => Number(D().settings.lowOn) !== 0;
const lowWaitDays = () => Math.max(3, Math.min(30, Number(D().settings.lowWait) || 7));
/* 1回目の割合：1回目を終えたときの値（firstLow があればそれ）／1回目の段階なら今の割合 */
const lowP1 = (t, r) => (t.firstLow && t.firstDonePct != null ? t.firstDonePct : (r && r.phase === 'away' ? (t.firstDonePct != null ? t.firstDonePct : r.pct1) : (r ? r.pct1 : null)));
/* 係が目安未満で完了にするとき、確かめ方を必ずえらぶ（H1・2026-10-29。はじめは、どちらもえらんでいない） */
/* 1回目を終えたときに、係が確かめ方をえらんだか（'ok'＝紙や口頭・'wait'＝アプリの記録）。以前の 1 は、えらぶ欄がなかったころの値なので「えらんでいない」として扱う */
const lowFirstPicked = t => !!t && (t.firstLow === 'ok' || t.firstLow === 'wait');
const lowPicked = () => { const x = $('input[name="lowpick"]:checked', $('#sheet')); return x ? x.value : ''; };
const lowChecked = () => lowPicked() === 'ok';
const lowCheckHtml = (th, p1) => `<fieldset class="lowpick" data-lowpickset>
    <legend>記録が目安（${th}%）に届いていません${p1 != null ? `（いま ${p1}%）` : ''}。どちらかをえらんでください</legend>
    <label class="chk lowchk"><input type="radio" name="lowpick" value="ok"><span>紙や口頭で、回り終えたことを確かめた<br><small class="hint">このまま完了にします。あとで自動で途中の返却にはしません。おすすめに「まだ訪ねていない家」を出しません。</small></span></label>
    <label class="chk lowchk"><input type="radio" name="lowpick" value="wait"><span>アプリの記録で確かめる<br><small class="hint">${lowWaitDays()}日後に記録を数え直し、目安に届いていなければ、自動で途中の返却にします（S-13 の完了の日付も、前回の日付にもどります）。</small></span></label>
  </fieldset>
  <p class="hint" data-lowneed>↑ どちらかをえらぶと、下のボタンを押せます</p>`;
/* 係が目安未満のまま正式返却にしたか（1回目の割合 p1 で決める）。印は返却の記録に付ける */
function lowMark(rec, t, p1, lowOk) {
  if (!lowOnSet() || !isAdmin() || p1 == null || p1 >= D().settings.donePct) return;
  rec.p1 = p1; rec.prevAt = t.completedAt || null; rec.prevPct = t.completedPct == null ? null : t.completedPct;
  if (lowOk) { rec.lowOk = 1; rec.lowBy = me().id; t.recLess = 1; } else rec.low = 1; // 紙や口頭で確かめた：回り残しを出さない（H2）
}
/* 区域係が担当を別の人に変えるとき、前の担当者の分を「途中の返却」として残す（S-13 から前の人の行が消えないように）。
   commit の中で、t.holder を書きかえる前に呼ぶ。担当者がいない・受け取った日が分からないときは何もしない */
function recordHandover(t, now) {
  if (!t || !t.holder || !t.lentAt) return;
  const r = roundInfo(t.id, true);
  D().returns.push(Object.assign({ id: 'x' + uid(), terrId: t.id, by: t.holder, lentAt: t.lentAt, firstAt: t.firstDoneAt || null, at: now, completed: false, pct: r ? r.pct : null, ho: 1 }, roundFromOf(t) ? { from: roundFromOf(t) } : {}, t.group ? { g: 1 } : {}, isAllUse(t) ? { ga: 1 } : {}));
  delete t.paperHand;
}
/* 1回目のあと、会えなかった家を「留守宅カード」（だれでも受け取れる）にして返す。
   決めた割合まで訪ね直された日が、正式な返却日（S-13 の完了した日付）になる（区域係のスマホが自動で記録する） */
function poolReturn(tid, lowOk) {
  const t = terrById(tid); if (!t) return;
  if (paperStop(t)) return;
  const r = roundInfo(tid, true);
  closeSheet();
  if (roundTerr === tid) roundTerr = null;
  commit(`区域${t.no}を、留守宅カードにして返しました`, () => {
    const now = new Date().toISOString(), rid = 'x' + uid(), first = t.firstDoneAt || now;
    const rec = { id: rid, terrId: tid, by: t.holder, lentAt: t.lentAt, firstAt: first, at: now, completed: false, pct: r ? r.pct1 : null, pool: 1 };
    if (roundFromOf(t)) rec.from = roundFromOf(t); // 続きから回った：前の人が回りはじめた日（K-1）
    if (t.group) rec.g = 1;
    if (isAllUse(t)) rec.ga = 1;
    delete t.paperHand;
    D().returns.push(rec);
    lowMark(rec, t, lowP1(t, r), lowFirstPicked(t) ? t.firstLow === 'ok' : lowOk); // まだ正式返却ではない。あとで留守宅カードが完了したとき、この印がそのまま使われる
    t.lastLentAt = t.lentAt; t.lastFirstAt = first; t.awayPoolAt = now; t.poolRetId = rid;
    t.holder = null; t.lentAt = null; t.returnedAt = now; t.helpers = []; t.group = null; delete t.use; t.firstDoneAt = null; t.firstDonePct = null; delete t.firstLow;
  });
}
/* 留守宅カードで回っている区域：1回目に会えなかった家のうち、何軒が訪ね直されたか。決めた割合に届いた日 */
function poolInfo(t) {
  if (!t || !t.awayPoolAt || t.holder) return null;
  const since = t.lastLentAt || '', first = t.lastFirstAt || t.awayPoolAt, sp = isSpecial(t), times = [];
  // 1回目の段階から、そのまま留守宅カードにして返した区域（返却ボタンの自動の決め方。1回目を終えた日＝返した日）は、
  // 返却ボタンと同じ数え方（awayAgain）：1回目の段階で別の日に訪ね直した家も「訪ね直した」に数える
  const ph1 = first >= t.awayPoolAt;
  let n = 0;
  for (const h of housesOf(t.id)) {
    for (const u of (sp ? specialTargets(h, t) : targets(h))) {
      if (!sp && coveredBySpecial(h, u)) continue;
      const k = K(h.id, u);
      if (D().dnc[k]) continue;
      if (ph1) {
        const after = visitsOf(k).filter(v => v.at > first);
        if (!visitsOf(k).some(v => v.at >= since && v.at <= first)) { // 1回目の段階で訪ねていなかった家：返したあとに1回訪ねれば「訪ね直した」
          if (recentMet(k) && !after.length) continue;
          n++; if (after.length) times.push(after[after.length - 1].at);
          continue;
        }
        const a = awayAgain(k, since); if (a === null) continue;
        n++; if (a) times.push(a);
        continue;
      }
      if (metBetween(k, since, first)) continue;
      const vis1 = visitsOf(k).some(v => v.at >= since && v.at <= first);
      if (!vis1 && recentMet(k)) continue;
      n++;
      if (vis1) { const a = revisitAt(k, since, first); if (a) times.push(a); continue; } // 1回目に訪ねた家：訪ね直したと数える条件（係の設定）に合う、いちばん早い記録
      const after = visitsOf(k).filter(v => v.at > first);
      if (after.length) times.push(after[after.length - 1].at); // 1回目に訪ねていなかった家：いちばん早く訪ねた日
    }
  }
  times.sort();
  const need = Math.max(1, Math.ceil(n * awayRetPct() / 100));
  return { n, done: times.length, pct: n ? Math.round(times.length / n * 100) : 100, doneAt: !n ? first : (times.length >= need ? times[need - 1] : null) };
}
/* 区域係のスマホで：決めた割合まで訪ね直された区域を、正式に返却されたものとして記録する */
/* 正式な返却日を、奉仕者が留守宅カードを返却した日にそろえる（endAwayCard → poolFinish が正。ここは変えない）。
   区域係のスマホが開いたときの記録（finalizePools）は、届いた日がさかのぼってずれの原因になっていたので、次の決まりにする：
   ・受け取り中の留守宅カードがある区域は記録しない（カードを持つ人の返却を待つ。返却したとき endAwayCard が、その日で完了にする）→ null
   ・ないときは、「目安に届いた日」と「その区域で最後に終わった留守宅カードの日（返却：endedAt／期限：expiresAt）」の遅いほう
   ・カードを使わずに（おすすめだけで）届いたときは、届いた日のまま */
function poolEndAt(t, p) {
  if (activeCards().some(c => c.terrId === t.id)) return null; // 受け取り中：返却を待つ
  const ends = D().awayCards.filter(c => c.terrId === t.id && c.at >= t.awayPoolAt).map(c => c.endedAt || c.expiresAt).filter(Boolean).sort();
  const last = ends.length ? ends[ends.length - 1] : '';
  // 留守宅カードにして返した日より前にはしない（返した日より前に届いていた区域で、完了日が返却日より前になり「途中の返却」に見えないように）
  return [last, p.doneAt, t.awayPoolAt].filter(Boolean).sort().pop();
}
let poolBusy = false;
function finalizePools() {
  if (!isAdmin() || poolBusy) return;
  const done = [];
  D().territories.forEach(t => {
    const p = poolInfo(t); if (!p || !p.doneAt) return;
    const at = poolEndAt(t, p); if (!at) return;
    done.push([t, p, at]);
  });
  if (!done.length) return;
  poolBusy = true;
  try {
    commit(`留守宅カードで回り終えた区域を記録しました（${done.map(x => x[0].no).join('・')}）`, () => {
      done.forEach(([t, p, at]) => {
        t.completedAt = at; t.completedPct = p.pct;
        const r = D().returns.find(x => x.id === t.poolRetId);
        if (r) Object.assign(r, { completed: true, at, pct: p.pct });
        t.awayPoolAt = null; t.poolRetId = null;
      });
    });
  } finally { poolBusy = false; }
}

/* 返却した区域の、巡回で訪ねた家の割合を、いま届いている記録で数え直す。since＝受け取った日、until＝返却（完了）した日。
   roundInfo の1回目と同じ数え方で、until より後の記録は数えない。最近会えた家は、受け取った日の時点で数える（3万件対策：その区域の家だけ見る）
   until は「1回目を終えた日（firstAt）」ではなく「返却した日」（10/16 の決まり3。サーバーが返却のときに確かめる期間と同じ。2026-10-29 監査 R1）：
   1回目のあとに留守宅を回った記録・留守宅カードで訪ね直した記録も数え、完了した区域を途中の返却にもどさないため */
function coverAt(t, since, until) {
  const sp = isSpecial(t), inc = D().settings.skipDone !== 0, s0 = Date.parse(since) || 0;
  let done = 0, total = 0;
  for (const h of housesOf(t.id)) {
    for (const u of (sp ? specialTargets(h, t) : targets(h))) {
      if (!sp && coveredBySpecial(h, u)) continue;
      const k = K(h.id, u);
      if (D().dnc[k]) continue;
      const vs = visitsOf(k);
      if (vs.some(v => v.at >= since && v.at <= until)) { done++; total++; continue; }
      const d = D().follows[k] ? followSkipDays() : skipDays();
      const m = d ? vs.find(v => v.result === 'met' && v.at < since) : null; // 新しい順なので、最初に見つかったものが一番新しい
      if (m && s0 - Date.parse(m.at) <= d * DAY) { if (inc) { done++; total++; } continue; }
      total++;
    }
  }
  return total ? Math.round(done / total * 100) : 100;
}
/* 区域係のスマホが開いたときに、記録の少ない正式返却を確かめる（finalizePools と同じ間引き）。
   待つ日数のあとに数え直し、届いていれば正式返却のまま、届いていなければ自動で途中の返却に切りかえる */
let lowBusy = false;
/* 返却の記録の「回りはじめた日」（記録を数えはじめる日）：
   ・from があればそれ：「続きから」受け取った巡回は前の人が回りはじめた日（サーバーが区域の roundFrom から付ける。第3回監査 K-1・2026-10-29）。
     印のない古い返却に足した記録（syn）も from に入れている（S-13 の行を作らないため lentAt は空）
   ・なければ受け取った日（lentAt）。サーバーが返却のときに確かめる期間（roundFrom || lentAt）と同じ起点になる */
const lowFrom = r => (r && (r.from || r.lentAt)) || '';
/* 返却の記録に入れる「回りはじめた日」：続きから回っているとき（roundFrom が受け取った日より前）だけ。ふつうの受け取りでは付けない（lentAt と同じ） */
const roundFromOf = t => (t && t.roundFrom && t.lentAt && t.roundFrom < t.lentAt ? t.roundFrom : null);
/* 紙の記録で回り終えた日（t.paperDone・S-13 に転記した紙の記録）が、その巡回の中にあるか（あれば、紙で回り終えたとみなす） */
function paperDoneIn(t, from, until) {
  const lo = ymd(new Date(from ? Date.parse(from) : Date.parse(until) - lendDays() * DAY)), hi = ymd(new Date());
  const c = [];
  if (t.paperDone) c.push(dstr(String(t.paperDone)));
  (D().s13 || []).forEach(x => { if (x && x.terrId === t.id && x.c) c.push(dstr(String(x.c))); });
  return c.some(d => d && d >= lo && d <= hi);
}
/* 印のない正式返却（「記録の少ない返却」の機能より前の返却・係の「正式に返却したことにする」で終えた返却など）も、
   まだ自動で受け取れる日になっていない区域だけ、同じように確かめる対象にする（2026-10-17。区域02：9月30日・0% が出てこなかった件）。
   ・自動受け取りを使っていて、区域の貸し出しが「きまりのとおり」、正式返却から freeAfterDays 日がまだたっていない区域だけ
     （たっていれば、もう受け取れるので変えない。S-13 の日付をむだに動かさない）
   ・訪問記録が整理されて消えた古い返却は、数え直せないので対象にしない（keepMonths）
   ・紙の記録で回り終えた日が、その巡回の中にある区域は対象にしない
   ・紙や口頭で回り終えた巡回（区域の recLess）も対象にしない（訪ねた家がアプリにない。係が「紙や口頭で確かめた」で1回目を終え、本人が返した区域など）
   ・受け取った日から返却（完了）した日までの記録で数え、目安から10ポイント下（サーバーの監査D5と同じ幅）に届いていない区域だけ。伝道者がふつうに返した区域を、数え方の少しの差で動かさない
     （以前は「1回目を終えた日（firstAt）」までしか数えず、1回目のあとに留守宅を回った・留守宅カードで訪ね直した記録が数えられないため、
       完了した区域を途中の返却にもどし、S-13 の完了日が前回にもどっていた。2026-10-29 監査 R1）
   ・返却の記録がない（古いデータ）ときは、S-13 の行を作らない記録を足して、あとで「正式返却に戻す」ができるようにする
   返り値：[区域, 返却の記録（なければ null）, 回りはじめた日, 巡回で訪ねた割合] */
function lowAdoptList() {
  const st = D().settings, fd = Number(st.freeAfterDays) || 0;
  if (Number(st.autoFree) !== 1 || fd <= 0) return [];
  const lim = Math.min(fd, Math.max(1, Number(st.keepMonths) || 12) * 30 - 7), th = Math.max(0, (Number(st.donePct) || 90) - 10), out = [];
  for (const t of D().territories) {
    if (t.dummy || t.holder || t.awayPoolAt || !t.completedAt || lendMode(t) !== 'auto') continue;
    if (t.returnedAt && t.returnedAt > t.completedAt) continue;   // すでに途中の返却（すぐ受け取れる）
    if (t.recLess === 1) continue;                                 // この巡回は紙や口頭で回り終えた（記録では確かめない。H2 と同じ印）
    if (!(daysSince(t.completedAt) < lim)) continue;
    const r = D().returns.find(x => x.terrId === t.id && x.completed && x.at === t.completedAt) || null;
    if (r && (r.low || r.lowOk || r.lowAuto || r.lowSkip || r.ph)) continue; // ph＝紙の区域カードで回った（アプリに記録がない）
    const from = r ? lowFrom(r) : (t.lastLentAt || '');
    if (paperDoneIn(t, from, t.completedAt)) continue;
    const pct = coverAt(t, from, t.completedAt); // 返却（完了）した日まで（r.at と同じ。1回目を終えた日 firstAt ではない）
    if (pct < th) out.push([t, r, from, pct]);
  }
  return out;
}
/* 上の区域に、係が目安未満で返したときと同じ印を付ける（commit の中で呼ぶ）。印を付けた返却の記録を返す */
function lowAdoptMark(t, r, from, pct) {
  if (!r) {
    r = { id: 'x' + uid(), terrId: t.id, by: null, lentAt: null, from: from || null, firstAt: t.lastFirstAt || null,
      at: t.completedAt, completed: true, pct: t.completedPct == null ? null : t.completedPct, syn: 1 };
    D().returns.push(r);
  }
  const prev = D().returns.filter(x => x.terrId === t.id && x.completed && x.at < r.at).sort((a, b) => (a.at < b.at ? -1 : 1)).pop();
  if (r.prevAt == null) { r.prevAt = prev ? prev.at : null; r.prevPct = prev ? prev.pct : null; }
  r.low = 1; r.p1 = pct; r.lowOld = 1;
  return r;
}
function lowSweep() {
  if (!isAdmin() || lowBusy || !lowOnSet()) return;
  const wait = lowWaitDays() * DAY, now = Date.now(), th = D().settings.donePct, ok = [], flip = [], skip = [], paper = [];
  const adopt = lowAdoptList(); // 印のない正式返却のうち、まだ受け取れない・記録が少ない区域
  for (const r of D().returns) {
    if (!r.low || r.lowOk || r.lowAuto || r.lowSkip || !r.completed) continue;
    if (now - Date.parse(r.at) < wait) continue;                              // まだ待つ
    const t = terrById(r.terrId);
    if (!t) continue;
    if (t.holder || t.awayPoolAt || t.completedAt !== r.at) { skip.push(r); continue; } // あとの動きがあるので、何も変えない
    if (paperDoneIn(t, lowFrom(r), r.at)) { paper.push([r, t]); continue; } // 紙の記録（S-13）の完了日がその巡回にある：途中にしない（H1）
    // 受け取った日から返却（完了）した日 r.at まで数える。1回目を終えた日（r.firstAt）までにすると、そのあとに本人が留守宅を回った記録・
    // 留守宅カードで訪ね直した記録が数えられず、回り終えた区域が途中の返却にもどる（2026-10-29 監査 R1・R3）
    const pct = coverAt(t, lowFrom(r), r.at);
    (pct >= th ? ok : flip).push([r, t, pct]);
  }
  // 印のない返却：この回では印を付けて確かめ待ちに出すだけ。途中の返却への切りかえは次の回（上のループ）で、そのときの記録で数え直してから行う
  // （以前は待つ日数がすぎていれば同じ回で切りかえていた。開いた直後の端末に残っている古い記録で数えたまま切りかえないため。第3回監査 P6・2026-10-29）
  if (!ok.length && !flip.length && !skip.length && !paper.length && !adopt.length) return;
  lowBusy = true;
  try {
    const apply = () => {
      const at = new Date().toISOString();
      ok.forEach(([r, , pct]) => { r.lowOk = 1; r.lowAt = at; r.p1 = pct; });
      paper.forEach(([r, t]) => { r.lowOk = 1; r.lowAt = at; r.lowPaper = 1; t.recLess = 1; }); // 紙で回り終えた：回り残しも出さない（H2）
      skip.forEach(r => { r.lowSkip = 1; r.lowAt = at; });
      flip.forEach(([r, t, pct]) => lowToPartial(r, t, at, pct));
      adopt.forEach(([t, r0, from, pct]) => { lowAdoptMark(t, r0, from, pct); });
    };
    const nos = flip.map(x => x[1].no);
    if (nos.length) commit(`記録が目安に届かなかった区域を、途中の返却にしました（${nos.join('・')}）`, apply);
    else { apply(); Store.save(true); } // 切りかえがないときは、お知らせを出さず静かに保存
  } finally { lowBusy = false; }
}
/* この直しより前に「紙で回り終えた」「係が紙や口頭で確かめた」で完了した区域に、印（recLess）を付ける（H2・2026-10-29）。
   係の端末だけ（返却の記録は係の端末にしかない）。何度動いても同じ。お知らせは出さない */
function recLessFill() {
  if (!isAdmin() || !D().returns) return;
  const add = [];
  for (const t of D().territories) {
    if (t.recLess || t.holder || t.dummy) continue;
    const r = t.awayPoolAt ? (t.poolRetId ? D().returns.find(x => x.id === t.poolRetId) : null)
      : (t.completedAt ? D().returns.find(x => x.terrId === t.id && x.completed && x.at === t.completedAt) : null);
    if (r && ((r.ph && !t.awayPoolAt) || (r.lowOk && r.lowBy))) add.push(t);
  }
  if (!add.length) return;
  add.forEach(t => { t.recLess = 1; });
  Store.save(true);
}
/* この直しより前に「続きから」で回った返却の記録（from が無い）に、回りはじめた日（from）を補う（第3回監査 N-7・2026-10-29）。
   サーバーが「続きから」と判定する規則と同じ条件で、同じ区域のひとつ前の返却が「途中で返した」（完了でない・留守宅カードでない・担当交代でない）で、
   その返却から contDays 日以内に受け取っていれば、前の記録の回りはじめた日を引きつぐ（古い順に補うので、途中→途中→完了もいちばん前の日にもどる）。
   対象は自動の確かめが見る範囲（keepMonths）の記録だけ。係の端末だけ（返却の記録は係の端末にしかない）。何度動いても同じ。お知らせは出さない。
   補った from は受け取った日より前にしか動かないので、数える記録が増える方向（回り終えた区域を途中にもどさない方向）にしか働かない。補った数を返す */
function fromFill() {
  if (!isAdmin() || !D().returns) return 0;
  const st = D().settings, cd = st.contDays == null || st.contDays === '' ? 60 : (Number(st.contDays) || 0);
  if (!cd) return 0;
  const since = Date.now() - Math.max(1, Number(st.keepMonths) || 12) * 30 * DAY;
  const byTerr = new Map();
  for (const r of D().returns) {
    if (!r || !r.terrId || !r.at) continue;
    if (!byTerr.has(r.terrId)) byTerr.set(r.terrId, []);
    byTerr.get(r.terrId).push(r);
  }
  let n = 0;
  byTerr.forEach(list => {
    list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    for (let i = 1; i < list.length; i++) {
      const r = list[i], prev = list[i - 1];
      if (r.from || !r.lentAt || Date.parse(r.at) < since) continue;
      if (prev.completed || prev.pool || prev.ho || !prev.at || prev.at > r.lentAt) continue; // 前の返却が途中返却のときだけ
      if (Date.parse(r.lentAt) - Date.parse(prev.at) > cd * DAY) continue;                    // 続きから受け取れる期間の中
      const f = lowFrom(prev);
      if (!f || f >= r.lentAt) continue;
      r.from = f; n++;
    }
  });
  if (n) Store.save(true);
  return n;
}
/* 係の区域一覧：確かめ待ちの正式返却に、小さく確かめる日を出す */
function lowWaitNote(t) {
  if (!lowOnSet() || !t || t.holder || t.awayPoolAt || !t.completedAt) return '';
  const r = D().returns.find(x => x.terrId === t.id && x.low && !x.lowOk && !x.lowAuto && !x.lowSkip && x.completed && x.at === t.completedAt);
  return r ? `（記録が少ないため${fmtDay(new Date(Date.parse(r.at) + lowWaitDays() * DAY).toISOString())}に確かめます）` : '';
}
/* 正式返却を、途中の返却に切りかえる（commit の中で呼ぶ）。前回回り終えた日（prevAt）に戻す */
function lowToPartial(r, t, at, pct, by) {
  r.completed = false; r.lowAuto = at; if (pct != null) r.p1 = pct; if (by) r.lowBy = by;
  delete t.recLess; // 途中の返却にもどった（H2）
  if (r.prevAt) { t.completedAt = r.prevAt; t.completedPct = r.prevPct; } else { delete t.completedAt; delete t.completedPct; }
  t.returnedAt = r.at;                  // 途中の返却として扱う（isPartial：returnedAt ＞ completedAt）
  if (lowFrom(r)) t.lastRoundFrom = lowFrom(r); else delete t.lastRoundFrom; // 「続きから」で前の人の続きを回れるように
}
function lowRestore(rid) { // 正式返却に戻す
  const r = D().returns.find(x => x.id === rid), t = r && terrById(r.terrId); if (!r || !t) return;
  if (t.holder || t.awayPoolAt || t.returnedAt !== r.at) { toast('その区域は、もう次の動きがあります'); return; }
  commit(`区域${t.no}を、正式な返却に戻しました`, () => {
    r.completed = true; r.lowOk = 1; r.lowBy = me().id; delete r.lowAuto;
    t.completedAt = r.at; t.completedPct = r.p1; delete t.lastRoundFrom;
    t.recLess = 1; // 係が正式な返却にもどした：記録が足りないので、回り残しを出さない（H2）
  });
}
function lowConfirm(rid) { // 待っている間に「正式返却で確定」
  const r = D().returns.find(x => x.id === rid); if (!r) return;
  const t = terrById(r.terrId);
  commit('正式な返却で確定しました', () => { r.lowOk = 1; r.lowBy = me().id; if (t && t.completedAt === r.at) t.recLess = 1; }); // 記録が足りないまま確定：回り残しを出さない（H2）
}
function lowNow(rid) { // 待っている間に「今すぐ途中の返却にする」
  const r = D().returns.find(x => x.id === rid), t = r && terrById(r.terrId); if (!r || !t) return;
  if (t.holder || t.awayPoolAt || t.completedAt !== r.at) { toast('その区域は、もう次の動きがあります'); return; }
  commit(`区域${t.no}を、途中の返却にしました`, () => lowToPartial(r, t, new Date().toISOString(), null, me().id));
}
/* この機能より前の正式返却を、係が押したときだけ途中の返却にする（自動では変えない） */
function lowOld(tid) {
  const t = terrById(tid); if (!t || t.holder || t.awayPoolAt || !t.completedAt) return;
  const rs = D().returns.filter(x => x.terrId === tid && x.completed).sort((a, b) => (a.at < b.at ? -1 : 1));
  const r = rs.find(x => x.at === t.completedAt), at = new Date().toISOString();
  commit(`区域${t.no}を、途中の返却にしました`, () => {
    if (r) {
      const prev = rs.filter(x => x.at < r.at).pop();
      if (r.prevAt == null) r.prevAt = prev ? prev.at : null;
      if (r.prevPct == null) r.prevPct = prev ? prev.pct : null;
      lowToPartial(r, t, at, t.completedPct, me().id);
    } else { // 記録が残っていない（紙から移した）ときは、完了の日だけ外す
      t.returnedAt = t.completedAt; delete t.completedAt; delete t.completedPct; delete t.recLess;
    }
  });
}

/* ---------- 留守宅カード ---------- */
let focusCard = null, roundTerr = null, roundNums = null, barMini = false, curTerr = null;
let barHidden = false; // 下の案内を、押して隠したか（「?」を押すと、また出る）
const slotText = s => { const [dt, b] = String(s || '').split('・'); return esc(`${dt}の${b}（${BAND_HINT[b] || ''}）`); }; // 時間帯の文字は画面にそのまま入るので、必ず esc する
/* 時間帯の見せ方。記録の値は「土日・夜」のまま変えず、画面では「週末の夜」と出す（「土日の夜」が土曜日と読まれやすいため。2026.13.89） */
const dtName = dt => (dt === '土日' ? '週末' : dt);
const slotShort = s => s.replace(/^土日・/, '週末・').replace('・', 'の');
/* 返却後の留守宅カード（c.ext）は、その区域が区域カードとして受け取られたら終わる。受け取られた日（なければ、前の人の受け取り日）を返す。そうでなければ ''
   （区域カードの受け取りは担当者の lentAt、返却したあとは lastLentAt に残る。カードを受け取った日より前の日は、関係ない） */
function extTakenAt(c) {
  if (!c || !c.ext) return '';
  const t = terrById(c.terrId); if (!t) return '';
  const at = t.holder ? t.lentAt : t.lastLentAt;
  return at && at > c.at ? at : '';
}
const activeCards = () => { const now = Date.now(); return D().awayCards.filter(c => !c.endedAt && Date.parse(c.expiresAt) > now && !(c.ext && extTakenAt(c))); };
/* グループで回る留守宅カード：c.group（グループ名）と c.helpers（今日回る人。区域の helpers と同じ形）を持つ */
const cardHelpers = c => { if (!c || !c.group || D().settings.groupOn === 0) return []; const now = Date.now(); return (c.helpers || []).filter(h => Date.parse(h.until) > now); };
const isCardHelper = c => cardHelpers(c).some(h => h.uid === me().id);
const myAwayCount = g => activeCards().filter(c => c.by === me().id && !!c.group === !!g).length; // 個人とグループは別々に数える
let awayGroupSlot = null, awayGroupMode = 'share'; // グループの留守宅カードの回り方：'share'（シェア）／'split'（分ける）
/* グループの次の集まり（2週間以内）の時間帯。なければ今の時間帯 */
function nextGroupSlot(all) { // all：全体の集まりの予定（group が空）から決める
  const now = Date.now(), g = all ? '' : myGroup();
  const ts = D().schedules.filter(s => (s.group || '') === g && s.date)
    .map(s => Date.parse(`${s.date}T${s.time || '09:00'}:00`))
    .filter(t => isFinite(t) && t > now - 3 * 3600000 && t < now + 14 * DAY).sort((a, b) => a - b);
  return slotOf(new Date(ts.length ? ts[0] : now));
}
const isUnmet = k => { const s = sum(k); return s.n > 0 && s.unmet; };
const triedSlots = k => sum(k).slots;
// 担当者のいる区域は担当者だけ。空いている区域は、回り終えた記録があるものだけ。
const awayEligibleBase = (t, uid) => (t.holder ? t.holder === uid : (!!t.awayPoolAt || !!t.completedAt || D().settings.awayAllTerr === 1));
/* 区域係が「この時間帯を重点にする」と決めた時間帯（係の画面の時間帯の表から）。期限を過ぎたものは使わない
   ・空いている区域は、ふだん留守宅カードを出さない区域でも、その時間帯のカードだけは出す
   ・一覧では「区域係のおすすめ」として上に出す */
const focusSlots = t => { const today = ymd(new Date()); return (Array.isArray(t && t.focus) ? t.focus : []).filter(f => f && SLOTS.includes(f.s) && String(f.until || '') >= today).map(f => f.s); };
const awayEligibleTerr = (t, uid) => awayEligibleBase(t, uid) || (!t.holder && focusSlots(t).length > 0);

/* ---------- 留守宅訪問のルール（係の設定：「区域」＞「状況」の「留守宅訪問のルール」） ----------
   ・上限回数（awayCap）：今回の巡回で「留守」だった日の数（同じ日は何回記録しても1回）。届いた家は、次の巡回まで留守宅カードに入れない
   ・最短間隔（awayRecentDays）：最後の訪問から、この日数がたつまでは入れない
   ・同じ時間帯を重ねない（awayNoRepeat）／試した時間帯の数え方（awayScope：0＝今回の巡回だけ、1＝前回の巡回も含める）
   カードを受け取ったときの値は、カード（c.rl）に控える。係が設定を変えても、出ているカードは変わらない */
const awayRule = () => {
  const s = D().settings, n = (v, lo, hi, d) => { v = Number(v); return isFinite(v) && v !== null ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  return { cap: n(s.awayCap == null ? 3 : s.awayCap, 1, 15, 3), gap: n(s.awayRecentDays == null ? 3 : s.awayRecentDays, 0, 30, 3),
    nr: Number(s.awayNoRepeat) === 0 ? 0 : 1, sc: Number(s.awayScope) === 1 ? 1 : 0 };
};
/* ---------- 返却後の留守宅カード ----------
   区域が正式に返却されたあと、まだ会えていない家を、まだ試していない時間帯だけで、だれでも受け取れるカードにする（係の設定：extOn ほか）
   ・寝かせる：正式返却から、また返却後のカードが終わってから extRest 日（7日未満にはできない）は出さない。家ごとにも、最後に訪ねてからこの日数は入れない
   ・区域ごとに同時に1枚まで／出す期間は正式返却から extDays 日まで（自動受け取りの区域は、自由に受け取れる日の extStopBefore 日前まで）
   ・だれかが区域カードとして受け取ったら、返却後のカードは自動で終わる（extTakenAt・endTakenExtCards）
   ・巡回の区切りは roundBounds の ext。返却後のカードで訪ねた日は、次の巡回の上限回数に数えない */
const extSet = () => { const s = D().settings, n = (v, lo, hi, d) => { v = Number(v); return isFinite(v) && v !== null ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  return { on: Number(s.extOn) !== 0, rest: n(s.extRest, 7, 30, 7), cap: n(s.extCap, 1, 5, 2), days: n(s.extDays, 14, 180, 60), before: n(s.extStopBefore, 0, 60, 14) }; };
/* 返却後の区域なら { open, why, until, end, using }、そうでなければ null。
   why：'open' 出せる／'rest' 寝かせ中（until まで）／'using' 受け取り中／'over' 期間が終わった（end まで）／'stop' 止めている */
function extState(t) {
  const x = extSet();
  if (!x.on || !t || t.holder || t.awayPoolAt || !t.completedAt || t.dummy) return null;
  if (!roundBounds(t.id).ext) return null;
  const comp = Date.parse(t.completedAt), now = Date.now();
  let end = comp + x.days * DAY;
  const fd = Number(D().settings.freeAfterDays) || 0;
  if (Number(D().settings.autoFree) === 1 && lendMode(t) === 'auto' && fd > 0) end = Math.min(end, comp + (fd - x.before) * DAY);
  const cards = D().awayCards.filter(c => c.ext && c.terrId === t.id && c.at > t.completedAt);
  const using = cards.find(c => !c.endedAt && Date.parse(c.expiresAt) > now && !extTakenAt(c));
  const lastEnd = Math.max(comp, ...cards.filter(c => c !== using).map(c => Date.parse(c.endedAt || c.expiresAt)));
  const until = lastEnd + x.rest * DAY;
  const why = t.extStop || lendMode(t) === 'stop' ? 'stop' : now >= end ? 'over' : using ? 'using' : now < until ? 'rest' : 'open';
  return { open: why === 'open', why, until, end, using };
}
const extRl = () => { const r = awayRule(), x = extSet(); return Object.assign({}, r, { cap: x.cap, gap: Math.max(r.gap, x.rest) }); };
/* 完了した区域（S-13 に完了として記録したあと、次に区域カードとして受け取られるまで）。
   2026-10-26 から、残った留守宅は留守宅カードにせず、おすすめタブだけに出す（区域カードのタブの役目は、完了まで） */
function afterDone(t) { return !!t && !t.holder && !t.awayPoolAt && !!t.completedAt && !t.dummy && !!roundBounds(t.id).ext; }
/* 完了した区域の留守宅を、おすすめに出す期間（係の設定：寝かせる日数 extRest・出す期間 extDays・次の新規の前に止める extStopBefore）。
   返り値：null（完了した区域でない）／{ open, why：'open' 出している・'rest' 寝かせ中・'over' 期間が終わった・'stop' 止めている, from, end } */
function recoState(t) {
  if (!afterDone(t)) return null;
  const x = extSet(), comp = Date.parse(t.completedAt), now = Date.now();
  let end = comp + x.days * DAY;
  const fd = Number(D().settings.freeAfterDays) || 0;
  if (Number(D().settings.autoFree) === 1 && lendMode(t) === 'auto' && fd > 0) end = Math.min(end, comp + (fd - x.before) * DAY);
  const from = comp + x.rest * DAY;
  const why = t.extStop || lendMode(t) === 'stop' ? 'stop' : now >= end ? 'over' : now < from ? 'rest' : 'open';
  return { open: why === 'open', why, from, end };
}
const rlFor = t => (extState(t) ? extRl() : awayRule());
/* その日限りのカード：家が awayDayOnly 軒以下（0＝使わない）。受け取るときの期限と、一覧の「今日だけ」の印に使う */
const dayOnlyN = n => { const d = Number(D().settings.awayDayOnly) || 0; return d > 0 && n <= d; };
const FULL_SLOTS = (1 << SLOTS.length) - 1; // 10通りすべて
/* 巡回：正式返却のあと、次に区域カードとして受け取った日から、次の正式返却まで（正式返却がまだない区域は、すべての記録）。
   返却後の留守宅カードの期間は、前の巡回の続きとして数える（返却後のカードで訪ねた記録が、次の巡回の上限回数に入らないように）。
   受け取った日が分からない古いデータは、これまでどおり、正式返却日の翌日。
   前回の巡回の始まりは、その1つ前の正式返却のあとに、最初に受け取った日（分からなければ、すべての記録。記録は2年で消える既存の範囲だけ）
   ext：正式返却のあと、まだ区域カードとして受け取られていない区域（返却後）のときだけ付く。
     from＝終わった巡回の始まり／prev＝その前の巡回の始まり／after＝正式返却の翌日（返却後の上限回数はここから数える） */
function nextDayIso(ymdStr) { const a = String(ymdStr).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2] + 1).toISOString(); }
function roundBounds(tid) {
  const t = terrById(tid), ends = [], lends = [];
  (D().returns || []).forEach(r => { if (r.terrId !== tid) return; if (r.completed && r.at) ends.push(r.at); if (r.lentAt) lends.push(r.lentAt); });
  if (t && t.completedAt) ends.push(t.completedAt);
  if (t && t.holder && t.lentAt) lends.push(t.lentAt);
  if (t && !t.holder && t.lastLentAt) lends.push(t.lastLentAt); // 返却のあとの区域は、いちばん新しい受け取り日。伝道者の端末には他の人の返却記録が来ないので、この手がかりも使う
  lends.sort();
  const days = [...new Set(ends.map(x => ymd(new Date(x))))].sort(), n = days.length;
  const lendAfter = d => { const nx = nextDayIso(d); return lends.find(x => x >= nx) || null; }; // 正式返却のあと、最初に受け取った日
  const startOf = i => (i < 0 ? '' : (lendAfter(days[i]) || nextDayIso(days[i])));
  if (!n) return { start: '', prev: '', ext: null };
  const L = lendAfter(days[n - 1]);
  if (L || (t && (t.holder || t.awayPoolAt || t.dummy))) return { start: L || nextDayIso(days[n - 1]), prev: startOf(n - 2), ext: null };
  // 返却後：まだ次に受け取られていない（前の巡回の続き）
  // start：終わった巡回の始まり。最初の巡回（from が空）は、完了の前に受け取った、いちばん新しい日（受け取りの記録がなければ空＝すべての記録）
  const from = startOf(n - 2), after = nextDayIso(days[n - 1]);
  return { start: after, prev: startOf(n - 2),
    ext: { from, prev: startOf(n - 3), after, start: from || lends.filter(x => x < after).pop() || '' } };
}
/* 留守宅として訪ねてよい家か（上限回数・最短間隔・時間帯）。拒否の家は、そもそも unmetIndex に入らない。
   時間帯は「未試行の時間帯が0（10通りすべて試し済み）」になったら、いちばん前に試した時間帯から順に候補に戻す */
function awayOk(x, slot, rl, now) {
  if (x.awayN >= rl.cap) return false;
  if (rl.gap && now - Date.parse(x.lastAt) < rl.gap * DAY) return false;
  if (rl.nr && hasSlot(x.tried, slot) && !(x.tried === FULL_SLOTS && x.oldSlot === slot)) return false;
  return true;
}

/* 区域ごとの「まだ会えていない家」＝今回の巡回で、会えていない家（留守の記録がある家）。
   tried：試した時間帯（留守の記録がある時間帯。10ビットの整数。数える範囲は awayScope）／awayN：今回の巡回で留守だった日の数
   （返却後の区域は、終わった巡回から続けて見る。awayN は正式返却の翌日からの留守の日の数。ext の説明は roundBounds）
   triedAll・first：これまでの全記録（「手紙の候補」「いつから会えていないか」の材料として残す） */
let UM_MEMO = null; // 全体を調べた結果は、同じ画面の描きかえの間（同じ処理の中）だけ使い回す（3万件を何度も1周しない）
/* 1つの家（部屋）を調べる。留守宅でなければ null。b は roundBounds の結果。
   完了した区域（b.ext）は、終わった巡回から続けて見る（おすすめに出す留守宅。2026-10-26 から、係の設定 extOn にかかわらず） */
function umItem(k, h, u, b, rl, now, gapMs) {
  const s = sum(k);
  if (!s.n) return null; // 一度も訪ねていない家は、留守宅ではない
  // 完了した区域（e）：終わった巡回の始まり（e.start）から今までを見る。上限回数に数えるのは、正式返却の翌日（e.after）からの留守の日だけ
  const e = b.ext;
  const st0 = e ? e.start : b.start, capFrom = e ? e.after : b.start;
  const sc = e ? (rl.sc ? e.prev : e.start) : (rl.sc ? b.prev : b.start), lo = sc < st0 ? sc : st0;
  let tried = 0, other = false, seen = false, pre = false; const days = new Set();
  for (const v of visitsOf(k)) { // 新しい順
    if (v.at < lo) break;
    if (v.at >= st0) { if (v.result !== 'away') { other = true; break; } seen = true; if (v.at >= capFrom) days.add(ymd(new Date(v.at))); else pre = true; }
    if (v.result === 'away' && v.at >= sc) tried |= SLOT_BIT[slotOfVisit(v)];
  }
  if (other || !(e ? seen : days.size)) return null; // 今回の巡回（完了した区域は終わった巡回から）で会えた家・留守の記録がない家は、対象外
  // 回り残し（完了の前に一度も訪ねていない家）を、おすすめで訪ねて留守だったとき：その日は、その家の1回目として、完了のあとの回数に数えない
  if (e && !pre && days.size) days.delete([...days].sort()[0]);
  let oldSlot = null;
  if (tried === FULL_SLOTS) { // いちばん前に試した時間帯（最後に留守だった日がいちばん古い時間帯）
    const at = {};
    for (const v of visitsOf(k)) { if (v.result === 'away' && v.at >= sc) { const sl = slotOfVisit(v); if (!at[sl]) at[sl] = v.at; } }
    oldSlot = SLOTS.reduce((a, sl) => (!a || at[sl] < at[a] ? sl : a), null);
  }
  const first = visitsOf(k)[visitsOf(k).length - 1]; // いちばん古い記録（いつから会えていないか）
  return { k, h, u, tried, triedAll: s.slots, awayN: days.size, oldSlot, lastAt: s.last.at, first: first ? first.at : s.last.at,
    recent: now - Date.parse(s.last.at) < gapMs, hard: slotCount(s.slots) >= SLOTS.length };
}
function unmetIndex(onlyTid, rlOv) {
  // onlyTid：1つの区域だけ調べるとき（区域のようすなど）。3万件を1周せず、その区域の家だけ見る。結果は全体を調べたときと同じ
  // rlOv：留守宅カードに控えたルール（そのカードの数え方で調べる）。なければ今の設定
  const rl = rlOv || awayRule(), memoKey = D().visits.length + '|' + JSON.stringify(rl) + '|' + D().houses.length + '|' + (D().returns || []).length;
  if (!onlyTid && !rlOv && UM_MEMO && UM_MEMO.src === D().visits && UM_MEMO.key === memoKey) return UM_MEMO.m;
  const m = new Map(), now = Date.now(), bm = new Map(), gapMs = rl.gap * DAY;
  for (const h of (onlyTid ? (HBT.get(onlyTid) || []) : D().houses)) {
    if (!h.terrId) continue;
    for (const u of targets(h)) {
      const k = K(h.id, u);
      if (D().dnc[k] || D().follows[k] || relOf(k)) continue;
      if (coveredBySpecial(h, u)) continue; // 特別区域（コンビニなど）で回る家は、ふつうの区域の留守宅カードに入れない（2回訪ねないように）
      let b = bm.get(h.terrId); if (!b) { b = roundBounds(h.terrId); bm.set(h.terrId, b); }
      const x = umItem(k, h, u, b, rl, now, gapMs);
      if (!x) continue;
      if (!m.has(h.terrId)) m.set(h.terrId, []);
      m.get(h.terrId).push(x);
    }
  }
  if (!onlyTid && !rlOv) { UM_MEMO = { src: D().visits, key: memoKey, m }; Promise.resolve().then(() => { if (UM_MEMO && UM_MEMO.m === m) UM_MEMO = null; }); }
  return m;
}
/* 回り残し（2026-10-26）：完了した区域で、終わった巡回の中で一度も訪ねていない家（完了の目安に届いたので回らなかった家など）。
   おすすめで、留守宅より先に出す。拒否・再訪問・引き継ぎ待ち・特別区域で回る家と、区域を受け取る前に最近会えていた家（係の「最近会えた家」の日数）は入れない。
   一度訪ねて留守なら、次からは留守宅（umItem）として、間隔・時間帯の決まりで出る */
function leftOf(t) {
  if (t.recLess) return []; // 紙や口頭で回り終えた巡回：訪ねた家がアプリにないので、回り残しは出さない（H2・2026-10-29）
  const b = roundBounds(t.id), e = b.ext, out = [];
  if (!e) return out;
  const sp = isSpecial(t), st0 = e.start, start = st0 ? Date.parse(st0) : 0, skip = skipDays() * DAY;
  for (const h of housesOf(t.id)) {
    for (const u of (sp ? specialTargets(h, t) : targets(h))) {
      if (!sp && coveredBySpecial(h, u)) continue;
      const k = K(h.id, u);
      if (D().dnc[k] || D().follows[k] || relOf(k)) continue;
      const s = sum(k);
      if (s.last && s.last.at >= st0) continue; // 巡回の中で訪ねた家（留守宅・会えた家）
      if (s.met && start && skip && Date.parse(s.met.at) >= start - skip) continue; // 区域を受け取る前に最近会えていた家（とばしてよかった家）
      out.push({ k, h, u, lastAt: s.last ? s.last.at : '' });
    }
  }
  return out;
}
/* 特別区域の「まだ会えていない家」（unmetIndex と同じ数え方）。完了した特別区域の留守宅を、おすすめに出すときに使う（2026-10-26） */
function unmetOfSpecial(t, rlOv) {
  const out = [];
  if (!isSpecial(t)) return out;
  const rl = rlOv || awayRule(), now = Date.now(), gapMs = rl.gap * DAY, b = roundBounds(t.id);
  for (const h of housesOf(t.id)) {
    for (const u of specialTargets(h, t)) {
      const k = K(h.id, u);
      if (D().dnc[k] || D().follows[k] || relOf(k)) continue;
      const x = umItem(k, h, u, b, rl, now, gapMs);
      if (x) out.push(x);
    }
  }
  return out;
}
/* 区域の「試した時間帯」：まだ会えていない家で試した時間帯を、すべて合わせた数（分母は SLOTS.length）。
   「どこまで工夫したか」を見せる参考の数字で、区域の完了の条件ではない（完了の条件は poolInfo・roundInfo）。
   会えていない家がなければ null（出さない）。items は unmetIndex() の区域の項目（呼び出し側で1回だけ作ったものを使い回す） */
const triedUnion = items => { let m = 0; for (const x of (items || [])) m |= x.tried; return m; };
const triedOf = items => { const xs = (items || []).filter(x => !x.hard); return xs.length ? slotCount(triedUnion(xs)) : null; }; // 10通りすべて留守の家（hard）は、カード・um と同じく除く（入れると必ず 10/10 になる）
function lockedKeys() { const s = new Set(); activeCards().forEach(c => c.keys.forEach(k => s.add(k))); liveHolds().forEach(h => (h.keys || []).forEach(k => s.add(k))); return s; }
/* おすすめの押さえ（holds・kangaeru.js・2026-10-26）：完了した区域の留守宅を「今行く」（今日の終わりまで）・「予定に入れる」（予定の日の終わりまで）で押さえる。
   押さえた家は、ほかの人のおすすめに出ない。その区域が次に区域カードとして受け取られたら（担当者・完了日が変わったら）効かない */
function holdLive(h, now) {
  if (!h || h.endedAt || !(Date.parse(h.until) > (now || Date.now()))) return false;
  const t = terrById(h.terrId);
  return !!t && !t.holder && !t.awayPoolAt && String(t.completedAt || '') === String(h.comp || '');
}
const liveHolds = () => { const now = Date.now(); return (D().holds || []).filter(h => holdLive(h, now)); };
/* カードに入れる家：上限回数・最短間隔・時間帯のルール（rl。なければ今の設定）に合う家を、長く会えていない家から、上限の数まで */
function cardKeys(items, slot, locked, rl) {
  rl = rl || awayRule();
  const max = Number(D().settings.awayCardMax) || 0, now = Date.now();
  const list = items.filter(x => awayOk(x, slot, rl, now) && !locked.has(x.k))
    .sort((a, b) => (a.first < b.first ? -1 : 1)).map(x => x.k);
  return max ? list.slice(0, max) : list;
}
function awaySuggestions(uid, slots) {
  const idx = unmetIndex(), locked = lockedKeys(), res = [];
  for (const t of D().territories) {
    if (!awayEligibleTerr(t, uid) || !idx.has(t.id)) continue;
    if (afterDone(t)) continue; // 完了した区域の残りの留守宅は、留守宅カードにせず、おすすめだけに出す（2026-10-26。重点の時間帯があっても）
    const base = awayEligibleBase(t, uid), fs = focusSlots(t);
    for (const slot of slots) {
      const focus = fs.includes(slot);
      if (!base && !focus) continue; // 重点の時間帯だけで出している区域は、その時間帯だけ
      const keys = cardKeys(idx.get(t.id), slot, locked);
      if (keys.length) res.push({ t, slot, keys, focus, ext: false, dist: myPos ? distM(myPos, center(t.polygon)) : null });
    }
  }
  res.sort(myPos ? (a, b) => a.dist - b.dist || b.keys.length - a.keys.length : (a, b) => b.keys.length - a.keys.length);
  return res.filter(x => x.focus).concat(res.filter(x => !x.focus)); // 区域係のおすすめ（重点の時間帯）を先に
}
function cardProgress(c) {
  const keys = c.keys.filter(k => houseById(parseKey(k)[0]));
  return { total: keys.length, done: keys.filter(k => visitedSince(k, c.at)).length };
}
function takeAwayCard(tid, slot, grp) {
  const G = !!grp && canGroupTerr(), max = D().settings.awayMax;
  if (myAwayCount(G) >= max) {
    toast(`${G ? 'グループの' : ''}留守宅カードは${max}枚まで持てます。終えてから受け取ってください`); return;
  }
  const t = terrById(tid);
  if (!t || !awayEligibleTerr(t, me().id) || (!awayEligibleBase(t, me().id) && !focusSlots(t).includes(slot))) { toast('このカードは受け取れません'); return; }
  if (afterDone(t)) { toast('この区域は回り終えています。残りの留守宅は、おすすめに出ています'); renderAll(); return; } // 完了した区域は、留守宅カードにしない（2026-10-26）
  const rl = awayRule(); // 受け取った時点のルールを、カードに控える（あとで係が設定を変えても、このカードは変わらない）
  const keys = cardKeys(unmetIndex().get(tid) || [], slot, lockedKeys(), rl);
  if (!keys.length) { toast('このカードの家は、今はありません'); renderAll(); return; }
  const now = new Date();
  const eod = new Date(now); eod.setHours(23, 59, 59, 0); // 今日の終わり（端末の時刻）
  let exp = Date.parse(awayExpiry(t, now.getTime()));
  // その日限り：家が少ないカード（awayDayOnly 軒以下。0＝使わない）は、受け取った日の終わりに自動で終わる。返却後に限らず、個人・グループのカードすべて
  const day = dayOnlyN(keys.length);
  if (day) exp = eod.getTime();
  const card = { id: 'c' + uid(), terrId: tid, slot, by: me().id, at: now.toISOString(),
    expiresAt: new Date(exp).toISOString(), keys, rl };
  if (day) card.day = 1;
  if (G) { card.group = myGroup(); card.helpers = []; card.mode = awayGroupMode === 'split' ? 'split' : 'share'; card.view = 'new'; card.parts = []; }
  if (G && reqUse === 'all') card.use = 'all'; // 全体の集まりで回る留守宅カード（2026-10-24）
  commit(`${G ? (card.use === 'all' ? '全体の集まりの' : 'グループの') : ''}留守宅カード（区域${t.no}・${slotShort(slot)}）を受け取りました`, () => { D().awayCards.push(card); });
  if (G) openHelpers(null, card.id); // グループのカードは、続けて「今日回る人」をえらぶ
  else openAwayCard(card.id);
}
/* 留守宅カードが自動で終わる日：係の設定で「日数」か「区域の返却の目安まで」（区域を受け取った日から、返却の目安の日数） */
function awayDueBase(t) { return t ? (t.holder ? t.lentAt : (t.awayPoolAt ? t.lastLentAt : null)) : null; }
function awayExpiry(t, now) {
  const base = Number(D().settings.awayExp) === 1 ? awayDueBase(t) : null;
  const due = base ? Date.parse(base) + lendDays() * DAY : 0;
  return new Date(due > now + DAY ? due : now + D().settings.awayDays * DAY).toISOString();
}
const awayExpText = () => (Number(D().settings.awayExp) === 1
  ? `受け取ると、その区域の返却の目安（受け取ってから${lendDays()}日）まで使えます（目安がない区域は${D().settings.awayDays}日間）。`
  : `受け取ると${D().settings.awayDays}日間使えます。`);
async function endAwayCard(id) {
  const c = D().awayCards.find(x => x.id === id); if (!c) return;
  const t = terrById(c.terrId), pool = t && t.awayPoolAt && !t.holder ? poolInfo(t) : null;
  const reached = !!pool && pool.pct >= awayRetPct();
  const msg = !pool ? 'この留守宅カードを返します。訪ねていない家は、ほかの人のカードに戻ります。よろしいですか？'
    : reached ? `この留守宅カードを返します。区域${t.no}の留守宅は${pool.pct}%訪ね直されたので、今日が区域の正式な返却日（S-13 の完了した日付）になります。よろしいですか？`
    : `この留守宅カードを返します。区域${t.no}の留守宅は、まだ${pool.pct}%（目安${awayRetPct()}%）なので、残りの家は、また留守宅カードとして出ます。よろしいですか？`;
  if (!await ask(msg, { ok: '返す', danger: false })) return;
  if (focusCard === id) focusCard = null;
  commit(reached ? `留守宅カードを返却しました。区域${t.no}を回り終えました` : '留守宅カードを返却しました', () => {
    const now = new Date().toISOString();
    c.endedAt = now;
    if (reached) poolFinish(t, now, pool.pct);
  });
}
/* 留守宅カードで回っていた区域を、正式に返却されたものとして記録する（返却記録の書きかえは、伝道者のときはサーバーが行う） */
function poolFinish(t, at, pct) {
  t.completedAt = at; t.completedPct = pct;
  if (isAdmin()) { const r = D().returns.find(x => x.id === t.poolRetId); if (r) Object.assign(r, { completed: true, at, pct }); }
  t.awayPoolAt = null; t.poolRetId = null;
}
function openAwayCard(id) {
  const c = D().awayCards.find(x => x.id === id); if (!c) return;
  focusCard = id; roundTerr = null; firstMapShow = false;
  curTerr = c.terrId;
  syncTerrJump();
  showView('map'); renderTerrs();
  const pts = c.keys.map(k => houseById(parseKey(k)[0])).filter(Boolean).map(h => [h.lat, h.lng]);
  setTimeout(() => {
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 18 }); else fitTerr(c.terrId);
    renderHouses();
  }, 60);
}
/* 地図の目立たせ方（留守宅カード／自分の区域カードを回るとき） */
const visitedSince = (k, iso) => { const s = sum(k); return !!s.last && s.last.at >= iso; };
const FOCUS_RANK = ['hl', 'hl fade', '', 'later', 'prev', 'done', 'done fade', 'dim', 'dim sp', 'refuse']; // 'fade'＝薄く（試し済みの時間帯・ほかの人が記録した家）'dim sp'＝特別区域で回る家
const todayIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
/* 緑のチェックの基準：自分の区域なら受け取ってから、それ以外は今日 */
function unitDoneSince(h) {
  const t = terrById(h.terrId);
  return myTerr(t) && t.lentAt ? t.lentAt : todayIso();
}
const focusCls = st => (st ? ' ' + st : '');
const doneMark = st => (st === 'done' || st === 'done fade' ? '<u>✓</u>' : st === 'prev' ? '<u class="b">✓</u>' : st === 'dim sp' ? '<u class="sp">特</u>' : ''); // 青いチェック＝今回より前に最近会えた家・カードを持っていない人が会えた家。特＝特別区域で回る家
const PLAN_SIZE = 10;
// 一緒に回る人は、同じおすすめ順で重ならないよう、はじめは「進み具合」で表示する
const roundMode = () => {
  if (UI.mode !== 'detail') return 'progress'; // 簡単モードは「進み具合」に固定（番号つきのおすすめ順は出さない・指示書3.6）
  if (me().roundMode) return me().roundMode;
  const t = roundTerr ? terrById(roundTerr) : null;
  return t && !canLead(t) ? 'progress' : 'reco';
};

/* 家（部屋）ごとの「今訪ねる価値」と理由 */
function scoreTarget(k, cur) {
  const st = sum(k), reasons = [];
  let sc = 10;
  const metS = st.metSlots, awayS = st.awaySlots, m = st.met;
  if (!st.n) { sc += 15; reasons.push('はじめて訪ねる家'); }
  // 会えたことのある家は、もう一度訪ねる価値があるので少し先に（★や年代は使わなくなりました）
  if (m && seeV(m, k)) { sc += 15; reasons.push('以前会えた家'); }
  if (hasSlot(metS, cur)) { sc += 15; reasons.push('この時間に会えたことがある'); }
  else if (hasSlot(awayS, cur)) { sc -= 30; reasons.push('この時間は留守だった'); }
  else if (st.n && !m) {
    sc += 30;
    reasons.push(`留守${st.awayN ? st.awayN + '回' : ''}・この時間はまだ訪ねていない`);
  }
  return { sc, reasons };
}

/* 区域カードを持っていない人（担当者・今日回る人以外）の記録には、サーバーが oc の印を付ける。
   受け取ってから後の記録がこの印つきだけで、その中に「会えた」があれば、担当者の画面では青いチェックにする */
function otherMetOnly(k, since) {
  if (!since) return false;
  let met = false;
  for (const v of visitsOf(k)) { // 新しい順
    if (v.at < since) break;
    if (!v.oc) return false;
    if (v.result === 'met') met = true;
  }
  return met;
}
const otherDone = (h, k, since) => { const t = h && h.terrId ? terrById(h.terrId) : null; return myTerr(t) && otherMetOnly(k, since); };
/* 自分の区域カード：受け取ってからの状況 */
/* 自分の区域カード：受け取ってからの状況
   phase 'first'：1回目に回っている。 phase 'away'：1回目を回り終え、留守だった家を、違う日・時間帯に訪ね直している */
const metBetween = (k, a, b) => visitsOf(k).some(v => v.result === 'met' && v.at >= a && v.at <= b);
function slotsBetween(k, a, b) { let m = 0; visitsOf(k).forEach(v => { if (v.at >= a && v.at <= b) m |= SLOT_BIT[slotOfVisit(v)]; }); return m; }
function roundInfo(tid, anyHolder) {
  const t = terrById(tid);
  if (!t || !t.holder || (!anyHolder && !myTerr(t))) return null;
  const since = t.lentAt || '', first = t.firstDoneAt || '', cur = slotOf(new Date()), sp = isSpecial(t);
  const map = new Map(), items = [], c = { todo: 0, done: 0, recent: 0, other: 0, sp: 0 };
  const aw = { n: 0, done: 0, slots: 0 };
  const aw0 = { n: 0, done: 0 }; // 1回目の段階の留守宅（返却ボタンで「留守宅も回り終えたか」を決める。awayAgain）
  for (const h of housesOf(tid)) {
    for (const u of (sp ? specialTargets(h, t) : targets(h))) {
      if (!sp && coveredBySpecial(h, u)) { map.set(K(h.id, u), 'sp'); c.sp++; continue; } // 特別区域（コンビニなど）で回る家は、ふつうの区域カードに入れない（地図では薄く「特」）
      const k = K(h.id, u);
      let st;
      if (D().dnc[k]) st = 'refuse';
      else if (first) {
        if (metBetween(k, since, first)) st = 'done';                     // 1回目で会えた
        else if (!visitedSince(k, since) && recentMet(k)) st = 'recent';  // 最近会えていたので、とばした家
        else {
          aw.n++; aw.slots |= slotsBetween(k, since, first);
          if (againSlot() ? revisitAt(k, since, first) : visitedSince(k, first)) { st = 'done'; aw.done++; } // 1回目のあと、訪ね直した（数える条件は係の設定）
          else { st = 'todo'; items.push(Object.assign({ k, h, u }, scoreTarget(k, cur))); }
        }
      }
      else if (since && visitedSince(k, since)) st = otherMetOnly(k, since) ? 'other' : 'done'; // other＝ほかの人が会えた（青いチェック）
      else if (recentMet(k)) st = 'recent';  // 最近会えた家は、今回はとばしてよい
      else { st = 'todo'; items.push(Object.assign({ k, h, u }, scoreTarget(k, cur))); }
      if (!first && st !== 'refuse' && st !== 'recent') { const a = awayAgain(k, since); if (a !== null) { aw0.n++; if (a) aw0.done++; } }
      map.set(k, st);
      if (st === 'todo' || st === 'done') c[st]++;
      else if (st === 'other') { c.done++; c.other++; } // 済みの数には入れる（青いチェックで区別するだけ）
      else if (st === 'recent') c.recent++;
    }
  }
  // 「最近会えた家」を完了の数に入れるかどうかは、区域係が決める
  const inc = D().settings.skipDone !== 0 ? c.recent : 0;
  const total = c.todo + c.done + inc;
  const pct1 = total ? Math.round((c.done + inc) / total * 100) : 100;
  aw.pct = aw.n ? Math.round(aw.done / aw.n * 100) : 100;
  aw0.pct = aw0.n ? Math.round(aw0.done / aw0.n * 100) : 100;
  return { t, cur, map, c, items, pct: first ? aw.pct : pct1, pct1, phase: first ? 'away' : 'first', aw, aw0 };
}
/* 1回目の段階の留守宅：回りはじめた日（since）から見て、最初に訪ねた日に会えなかった家（まだ訪ねていない家もふくむ）。
   返り値：null＝留守宅ではない（最初に訪ねた日に会えた）／''＝まだ別の日に訪ね直していない／日時＝別の日に訪ね直した最初の時刻
   （同じ日に何回訪ねても1回。別の日に訪ねたら「訪ね直した」。係が「別の日で、別の時間帯」にしているときは、留守なら時間帯もちがうときだけ。againOk） */
function awayAgain(k, since) {
  const vs = visitsOf(k); // 新しい順
  let i = vs.length - 1;
  while (i >= 0 && vs[i].at < since) i--;
  if (i < 0) return '';
  const d0 = ymd(new Date(vs[i].at)), days0 = new Set([d0]);
  let s0 = 0; // 最初に訪ねた日に試した時間帯
  for (; i >= 0; i--) { // 古い順にたどる
    const v = vs[i];
    if (ymd(new Date(v.at)) !== d0) { if (againOk(v, days0, s0)) return v.at; continue; } // 別の日：数える条件に合わなければ、次の記録を見る
    if (v.result === 'met') return null;
    s0 |= SLOT_BIT[slotOfVisit(v)];
  }
  return '';
}
/* 訪ね直したと数える条件（係の設定 awayAgainSlot・2026-10-26。はじめは「別の日で、別の時間帯」）
   ・0＝別の日：1回目に訪ねた日と別の日に訪ねれば、会えても留守でも「訪ね直した」（今までの決まり）
   ・1＝別の日で、別の時間帯：さらに、1回目に訪ねた時間帯と別の時間帯で訪ねる。会えた・拒否は、時間帯にかかわらず数える */
const againSlot = () => !Store.data || Number(D().settings.awayAgainSlot) !== 0;
function againOk(v, days0, s0) {
  if (days0.has(ymd(new Date(v.at)))) return false;
  if (!againSlot() || v.result !== 'away') return true;
  return !(s0 & SLOT_BIT[slotOfVisit(v)]);
}
/* 1回目の段階（a〜b）のあとで、訪ね直したと数える最初の記録の日時（なければ ''）。
   別の日の決まりでは、今までどおり b のあとの記録なら何でも数える */
function revisitAt(k, a, b) {
  const vs = visitsOf(k); // 新しい順
  if (!againSlot()) { for (let i = vs.length - 1; i >= 0; i--) if (vs[i].at > b) return vs[i].at; return ''; }
  let s0 = 0; const days0 = new Set();
  vs.forEach(v => { if (v.at >= a && v.at <= b) { s0 |= SLOT_BIT[slotOfVisit(v)]; days0.add(ymd(new Date(v.at))); } });
  for (let i = vs.length - 1; i >= 0; i--) { const v = vs[i]; if (v.at > b && againOk(v, days0, s0)) return v.at; }
  return '';
}
/* 返却ボタンを押したときの決め方（区域係の設定の目安で、自動で決める）
   ・1回目が目安（donePct）に届いていない → 'partial'：途中の返却（自動受け取りを使っていれば、すぐほかの人が受け取れる・続きから回れる）
   ・1回目が届いていて、留守宅も目安（awayRetPct）まで訪ね直されている → 'done'：正式な返却（今日が S-13 の完了した日付）
   ・1回目は届いたが、留守宅が届いていない → 'pool'：残りの留守宅を留守宅カードにして返す（だれでも受け取れる）。
     留守宅カードを返却したときに目安に届けば、その日が正式な返却日（endAwayCard・poolFinish。今までどおり） */
function returnPlan(r) {
  if (!r) return null;
  const a = r.phase === 'away' ? r.aw : r.aw0;
  if (r.phase === 'first' && r.pct1 < D().settings.donePct) return { kind: 'partial', a };
  return { kind: !a.n || a.pct >= awayRetPct() ? 'done' : 'pool', a };
}
const lendDays = () => Number(D().settings.lendDays) || 120;
const awayRetPct = () => (D().settings.awayRetPct == null ? 70 : Number(D().settings.awayRetPct));
const dueOf = t => (t && t.lentAt ? new Date(Date.parse(t.lentAt) + lendDays() * DAY).toISOString() : '');
/* 返却の目安を過ぎた貸出か。係の画面の「状況」・内訳・「今日」・申し込みの一覧で、同じ数え方にそろえる（区域カードの「返却の目安」の日付と同じ） */
const pastDue = t => !!(t && t.holder && t.lentAt && Date.parse(dueOf(t)) < Date.now());
/* 留守宅を回る段階：1回目に留守だった時間帯と、まだ訪ねていない時間帯（違う曜日・時間に訪ねると会えやすい） */
function awayAdvice(r) {
  const tried = slotList(r.aw.slots);
  const untried = SLOTS.filter(x => !tried.includes(x));
  const triedDay = new Set(tried.map(x => x.split('・')[0]));
  const pick = untried.filter(x => !triedDay.has(x.split('・')[0])).concat(untried.filter(x => triedDay.has(x.split('・')[0]))).slice(0, 3);
  return `<p class="muted">1回目に留守だった時間帯：<b>${tried.length ? tried.map(slotShort).join('、') : '記録なし'}</b></p>` +
    (pick.length ? `<p class="muted">まだ訪ねていない時間帯：<b>${pick.map(slotShort).join('、')}</b> など</p>` : '') +
    '<p class="hint">ふつうは別の日に訪ねます。できれば1週間以内に、最初とは違う曜日・違う時間帯に訪ねると効果的です。</p>';
}
/* おすすめの回り方：点数の高い家から選び、近い順につなぐ（集合住宅は1か所にまとめる） */
function roundPlan(r) {
  const g = new Map();
  r.items.forEach(x => {
    const s = g.get(x.h.id) || { h: x.h, units: [], sc: -Infinity, reasons: [] };
    s.units.push(x.u);
    if (x.sc > s.sc) s.sc = x.sc;
    x.reasons.forEach(y => { if (!s.reasons.includes(y)) s.reasons.push(y); });
    g.set(x.h.id, s);
  });
  const pool = [...g.values()].filter(s => s.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, PLAN_SIZE);
  const out = [];
  let at = myPos || (pool[0] ? [pool[0].h.lat, pool[0].h.lng] : null);
  while (pool.length) {
    let bi = 0, bd = Infinity;
    pool.forEach((s, i) => { const d = distM(at, [s.h.lat, s.h.lng]); if (d < bd) { bd = d; bi = i; } });
    const s = pool.splice(bi, 1)[0];
    s.dist = bd; out.push(s); at = [s.h.lat, s.h.lng];
  }
  return out;
}
const stopLabel = s => (s.h.type === 'apt' ? `${esc(s.h.label || '集合住宅')}（${s.units.length}部屋）` : esc(s.h.label || '家'));
function roundHint(t) {
  const r = roundInfo(t.id);
  if (!r) return '';
  const own = t.holder === me().id;
  if (r.phase === 'away') {
    const head = `<p class="hint-strong">留守宅を回る段階です。1回目に会えなかった家 ${r.aw.n}軒のうち、${r.aw.done}軒を訪ね直しました（${r.aw.pct}%）。</p>`;
    const ok = r.aw.pct >= awayRetPct()
      ? `<p class="hint-strong ok">留守宅を十分に訪ね直しました。${own ? '「返す」から、区域を返せます。' : ''}</p>`
      : `<p class="muted">返却の目安：留守だった家の${awayRetPct()}%を訪ね直す（届かないまま「返す」を押すと、残りの家は留守宅カードになります）</p>`;
    if (!r.c.todo) return head + ok;
    const plan = roundPlan(r);
    return head + ok + awayAdvice(r) + (plan.length ? `<p class="hint-strong">今（${slotShort(r.cur)}）のおすすめ ${plan.length}か所。地図をひらくと、番号順に回れます。</p>` : '');
  }
  if (!r.c.todo) return own
    ? `<p class="hint-strong ok">すべての家に緑のチェックがつきました。「返す」を押すと、会えなかった家は留守宅カードになります。</p>`
    : `<p class="hint-strong ok">すべての家に緑のチェックがつきました。</p>`;
  const near = r.pct >= D().settings.donePct
    ? `<p class="hint-strong ok">1回目をほぼ回り終えました（${r.pct}%）。${own ? '「返す」を押すと、会えなかった家は留守宅カードになります。' : ''}</p>` : '';
  const plan = roundPlan(r);
  if (!plan.length) return near;
  const intr = plan.filter(s => s.reasons.some(y => y.includes('★'))).length;
  return near + `<p class="hint-strong">今（${slotShort(r.cur)}）のおすすめ ${plan.length}か所${intr && featFollow() ? `（★ ${intr}か所）` : ''}。地図をひらくと、番号順に回れます。</p>`;
}
/* ---------- 留守宅カードの地図の表示 ----------
   ・端末の今の時刻から、今の時間帯（10通り）を決める。その時間帯をまだ試していない家だけが「いま訪ねる家」
   ・上限回数・最短間隔に当たった家と、拒否の家は、切りかえに関係なく、いつも地図から外す（住民への配慮）。受け取ったときのルール（c.rl）で決める
   ・「まだの時間帯だけ」（はじめ）：今の時間帯を試し済みの家は、かくす ／ 「すべて」：試し済みの家も、薄く出す
   ・10通りすべて試し済みの家は、いちばん前に試した時間帯のときに、候補に戻る（awayOk と同じ）
   ・簡単モードは「まだの時間帯だけ」に固定（切りかえは出さない）
   ・グループのカードは、カードを持つ人（司会者）の設定（c.view）に、全員を合わせる */
const CARDVIEW_KEY = 'kuiki_cardview';
const simpleNow = () => typeof isSimple === 'function' && isSimple();
function cardView(c) {
  if (simpleNow()) return 'new';
  if (c.group) return c.view === 'all' ? 'all' : 'new';
  return lsGet(CARDVIEW_KEY) === 'all' ? 'all' : 'new';
}
const cardViewMine = c => !simpleNow() && (!c.group || c.by === me().id); // 切りかえを出すのは、自分で決められる人だけ
function setCardView(c, v) {
  v = v === 'all' ? 'all' : 'new';
  if (c.group && c.by === me().id) commit(v === 'all' ? '地図に、試し済みの家も薄く出します（みんなの画面も）' : '地図に、まだの時間帯の家だけ出します（みんなの画面も）', () => { c.view = v; });
  else { lsSet(CARDVIEW_KEY, v); renderHouses(); }
}
let CST_MEMO = null;
function cardStates(c) {
  const cur = slotOf(new Date()), view = cardView(c), mid = me().id;
  const key = [c.id, D().visits.length, cur, view, mid, c.mode || '', JSON.stringify(c.parts || '')].join('|');
  if (CST_MEMO && CST_MEMO.key === key && CST_MEMO.src === D().visits) return CST_MEMO.r;
  // 控えのない古いカードは、これまでどおり（上限・間隔では外さない）。今の時間帯の判定だけ使う
  const rl = c.rl || { cap: 15, gap: 0, nr: 1, sc: 0 }, now = Date.now();
  const items = new Map();
  (unmetIndex(c.terrId, rl).get(c.terrId) || []).forEach(x => items.set(x.k, x));
  const share = !!c.group && c.mode !== 'split', mine = cardMineSet(c);
  const map = new Map(), r = { map, cur, view, hl: 0, tried: 0, done: 0, wait: !!mine && !mine.size };
  for (const k of c.keys) {
    if (D().dnc[k]) { map.set(k, 'refuse'); continue; }
    if (mine && !mine.has(k)) { map.set(k, 'dim'); continue; } // 分けたとき：自分の範囲の外
    if (visitedSince(k, c.at)) { // 緑のチェックは残す。シェアでは、ほかの人が記録した家を薄くする
      r.done++;
      map.set(k, share && visitsOf(k).some(v => v.at >= c.at && v.by !== mid) ? 'done fade' : 'done');
      continue;
    }
    const x = items.get(k);
    if (!x || x.awayN >= rl.cap || (rl.gap && now - Date.parse(x.lastAt) < rl.gap * DAY)) { map.set(k, 'dim'); continue; } // いつも外す家
    const triedNow = rl.nr && hasSlot(x.tried, cur) && !(x.tried === FULL_SLOTS && x.oldSlot === cur);
    if (triedNow) { r.tried++; map.set(k, view === 'all' ? 'hl fade' : 'dim'); } else { r.hl++; map.set(k, 'hl'); }
  }
  CST_MEMO = { key, src: D().visits, r };
  return r;
}
/* グループで「分ける」を選んだカード：わたされた人の画面には、自分の範囲の家だけを出す（null＝制限なし）。
   カードを持つ人（司会者）は、自分の範囲がなければ全部見える。範囲をわたされていない参加者には、まだ何も出さない */
function cardMineSet(c) {
  if (!c.group || c.mode !== 'split') return null;
  const mp = myPart(c);
  if (mp && okPoly(mp.poly)) {
    const set = new Set();
    c.keys.forEach(k => { const h = houseById(parseKey(k)[0]); if (h && inPoly(h.lat, h.lng, mp.poly)) set.add(k); });
    return set;
  }
  return c.by === me().id ? null : new Set();
}
/* グループの留守宅カードの「分ける」「シェア」を切りかえる（カードを持つ人だけ） */
function setCardMode(cid, mode) {
  const c = D().awayCards.find(x => x.id === cid);
  if (!c || !c.group || c.by !== me().id || c.endedAt) return;
  mode = mode === 'split' ? 'split' : 'share';
  if ((c.mode || 'share') === mode) return;
  commit(mode === 'split' ? '「分ける」にしました。地図で範囲を分けてください' : '「シェア」にしました。全員が同じ家の一覧を見ます', () => { c.mode = mode; if (mode === 'share') c.parts = []; });
}

/* 家ごとの表示を返す関数（目立たせていないときは null） */
function focusFn() {
  roundNums = null;
  const c = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (focusCard && !c) focusCard = null;
  if (c) {
    const r = cardStates(c);
    return k => r.map.get(k) || (D().dnc[k] ? 'refuse' : 'dim');
  }
  const r = roundTerr ? roundInfo(roundTerr) : null;
  if (roundTerr && !r) roundTerr = null;
  if (!r) return null;
  const mp = myPart(r.t); // 今日の分担がある人は、その範囲の家だけを目立たせる
  if (mp && okPoly(mp.poly)) {
    const inPart = new Set();
    housesOf(r.t.id).forEach(h => { if (inPoly(h.lat, h.lng, mp.poly)) targets(h).forEach(u => inPart.add(K(h.id, u))); });
    return k => {
      const st = r.map.get(k);
      if (!inPart.has(k)) return 'dim';
      return st === 'done' ? 'done' : st === 'todo' ? 'hl' : st === 'refuse' ? 'refuse' : (st === 'recent' || st === 'other') ? 'prev' : st === 'sp' ? 'dim sp' : 'dim';
    };
  }
  if (roundMode() === 'progress') {
    return k => { const s = r.map.get(k); return s === 'done' ? 'done' : s === 'todo' ? '' : s === 'refuse' ? 'refuse' : (s === 'recent' || s === 'other') ? 'prev' : s === 'sp' ? 'dim sp' : 'dim'; };
  }
  const plan = roundPlan(r);
  roundNums = new Map(plan.map((s, i) => [s.h.id, i + 1]));
  const inPlan = new Set();
  plan.forEach(s => s.units.forEach(u => inPlan.add(K(s.h.id, u))));
  return k => { const s = r.map.get(k); return s === 'done' ? 'done' : s === 'todo' ? (inPlan.has(k) ? 'hl' : 'later') : s === 'refuse' ? 'refuse' : (s === 'recent' || s === 'other') ? 'prev' : s === 'sp' ? 'dim sp' : 'dim'; };
}
function openPlanSheet() {
  const r = roundTerr ? roundInfo(roundTerr) : null; if (!r) return;
  const plan = roundPlan(r);
  setSheet(headHtml(r.t, 'おすすめの回り方', `今は${slotShort(r.cur)}　まだ訪ねていない家 ${r.c.todo}`) + `
    <p class="hint">今の時間帯とこれまでの記録から${PLAN_SIZE}か所まで選び、近い順につないでいます。訪ねると一覧から外れ、次の家が加わります。</p>
    <div class="row"><button class="btn small" id="planNear">${myPos ? '現在地を更新して並べ直す' : '現在地から並べ直す'}</button></div>
    ${plan.length ? `<ol class="plan">${plan.map((s, i) => `<li>
        <span class="numbadge">${i + 1}</span>
        <div><b>${stopLabel(s)}</b><p class="muted">${s.reasons.slice(0, 3).join('・')}</p>
          <p class="muted">${i === 0 ? (myPos ? `現在地から約${fmtDist(s.dist)}` : 'ここから始めます') : `前の家から約${fmtDist(s.dist)}`}</p></div>
        <button class="btn small" data-plan="${esc(s.h.id)}">地図で見る</button></li>`).join('')}</ol>`
      : '<div class="empty">今の時間帯のおすすめはありません。<br>「進み具合」に切りかえて、残りの家を回ってください。</div>'}
    <button class="btn block" data-close>閉じる</button>`);
  $('#planNear').onclick = () => locate(openPlanSheet);
  $$('[data-plan]', $('#sheet')).forEach(x => x.onclick = () => {
    const h = houseById(x.dataset.plan);
    closeSheet();
    map.setView([h.lat, h.lng], 19);
    setTimeout(() => (h.type === 'apt' ? openAptSeq(h.id) : openTarget(h.id, '', false)), 250);
  });
}
/* 下の案内は「留守宅カード」のときだけ。区域を回るときのようすは「?」の中に入れました */
function renderCardBar() {
  const bar = $('#cardBar');
  const c = focusCard ? activeCards().find(x => x.id === focusCard) : null;
  if (focusCard && !c) focusCard = null;
  $('#legendBtn').classList.toggle('hasbar', !!(c && barHidden));
  const cvEl = $('#cardView');
  if (cvEl) { // 地図の上の、小さな切りかえ（まだの時間帯だけ ⇄ すべて）。簡単モードと、グループの参加者には出さない
    const show = !!c && cardViewMine(c);
    cvEl.hidden = !show;
    if (show) {
      const cv = cardView(c);
      cvEl.innerHTML = `<div class="seg uiseg" role="group" aria-label="地図の表示（まだの時間帯だけ・すべて）"><button type="button" data-cview="new" aria-pressed="${cv === 'new'}">まだの時間帯だけ</button><button type="button" data-cview="all" aria-pressed="${cv === 'all'}">すべて</button></div>`;
      $$('[data-cview]', cvEl).forEach(b => { b.onclick = () => setCardView(c, b.dataset.cview); });
    }
  }
  if (!c || barHidden) { bar.hidden = true; }
  else {
    const t = terrById(c.terrId), p = cardProgress(c);
    const key = (cls, mark, label) => `<span><i class="pin mini st-plain${cls}">${mark}</i>${label}</span>`;
    const r = cardStates(c), cv = cardView(c);
    bar.hidden = false; bar.classList.remove('mini');
    bar.innerHTML = `<p><b>留守宅カード　区域${t ? esc(t.no) : '-'}</b>　${slotText(c.slot)}に訪ねてください</p>
      <p class="keys">${key(' hl', '', `今（${slotShort(r.cur)}）まだの家 ${r.hl}`)}${key(' done', '<u>✓</u>', `訪ねた家 ${p.done}`)}</p>
      ${r.wait ? '<p class="hint-strong">司会者から範囲をわたされるまで、家は出ません。</p>' : ''}
      ${r.tried ? `<p class="muted">${slotShort(r.cur)}は試し済みの家 ${r.tried}軒は、${cv === 'all' ? '薄く出しています' : 'かくしています'}</p>` : ''}
      ${p.total && p.done === p.total ? '<p class="okmsg"><b>すべて訪ねました。</b>「区域カード」画面で「終える」を押してください。</p>' : ''}
      <div class="row"><button class="btn small" id="cardBarClose">表示を戻す</button></div>`;
    $('#cardBarClose').onclick = () => { focusCard = null; roundTerr = null; renderTerrs(); renderHouses(); };
  }
  if (!$('#legend').hidden) renderLegend();
}
/* 留守宅カード（くわしい表示）の1行：このカードの家だけでなく、区域全体で何軒訪ね直したか。
   ・区域が留守宅カードで回っているとき（awayPoolAt があり担当者なし）：poolInfo
   ・本人が自分で留守宅を回っているとき（担当者が自分で、1回目のあと）：roundInfo の aw
   ・それ以外（回り終えた記録がない区域から作ったカード）は何も出さない。数だけで、名前や年代は出さない。
   かんたん表示は kantan.js が awayCardHtml を差しかえているので、ここは通らない */
function poolLineHtml(c) {
  const t = terrById(c.terrId); if (!t) return '';
  let n, done, pct, own = false;
  if (t.awayPoolAt && !t.holder) {
    const p = poolInfo(t); if (!p) return '';
    n = p.n; done = p.done; pct = p.pct;
  } else if (t.holder && t.holder === me().id) {
    const r = roundInfo(t.id, true); if (!r || r.phase !== 'away') return '';
    n = r.aw.n; done = r.aw.done; pct = r.aw.pct; own = true;
  } else return '';
  const reached = !n || pct >= awayRetPct(); // 返却の画面（endAwayCard・roundHint）と同じ判定
  const msg = reached
    ? `目安に届きました。${own ? '区域カードを返すと' : 'このカードを返すと'}、区域が完了します`
    : `訪ね直し ${done} / ${n}軒（目安${awayRetPct()}%）　あと${Math.max(1, Math.ceil(n * awayRetPct() / 100) - done)}軒で区域が完了します`;
  return `<p class="muted">区域全体の留守宅：${msg}</p>`;
}
function awayCardHtml(c, kind) {
  const t = terrById(c.terrId), p = cardProgress(c);
  const hs = cardHelpers(c), hh = kind === 'help' ? hs.find(h => h.uid === me().id) : null;
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  const left = Math.max(0, Math.ceil((Date.parse(c.expiresAt) - Date.now()) / DAY));
  const endText = c.day ? '今日の終わりに自動で終わります' : `あと${left}日で自動的に終わります`; // その日限りのカード
  return `<article class="tcard tc2 away">
    ${openHead(`data-awayopen="${esc(c.id)}"`, `留守宅カード ${esc(slotText(c.slot))}`,
      `<span class="stamp away${t ? noCls(t.no) : ''}"><small>留守宅</small>${t ? esc(t.no) : '-'}</span>`,
      slotText(c.slot), (c.group ? `<span class="gbadge">${esc(useName(c))}</span> ` : '') + `区域${t ? esc(t.no) : '-'}　${t ? esc(t.name) : ''}` +
        (hh ? `<br>${esc(uname(hh.by))}さんの留守宅カードを、今日回ります` : ''))}
    <div class="tbody">
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="訪ねた割合"><i style="width:${pct}%"></i></div>
      <p class="muted">訪ねた家 ${p.done} / ${p.total}　${endText}</p>
      ${poolLineHtml(c)}
      ${p.total && p.done === p.total ? `<p><b>すべて訪ねました。${kind === 'help' ? '' : '「終える」を押してください。'}</b></p>` : ''}
      ${kind === 'gown' && hs.length ? `<p class="muted"><b>今日回る人（${hs.length}人）：</b>${hs.map(h => esc(uname(h.uid)) + 'さん').join('、')}</p>` : ''}
      ${kind === 'gown' && c.group ? `<div class="seg" role="group" aria-label="回り方（分ける・シェア）"><button type="button" data-cmode="share" data-cid="${esc(c.id)}" aria-pressed="${c.mode !== 'split'}">シェア</button><button type="button" data-cmode="split" data-cid="${esc(c.id)}" aria-pressed="${c.mode === 'split'}">分ける</button></div>
        <p class="hint">${c.mode === 'split' ? '分ける：地図に線を引いて、人ごとに範囲を分けます。' : 'シェア：全員が同じ家の一覧を見ます。'}</p>
        ${c.mode === 'split' && partsOf(c).length ? `<p class="muted"><b>今日わたした範囲：</b>${partsOf(c).map(x => esc(partName(x))).join(' ／ ')}</p>` : ''}` : ''}</div>
    ${kind === 'help' ? '' : `<div class="actions">${kind === 'gown' && D().settings.groupOn !== 0 ? `<button class="btn" data-chelpers="${esc(c.id)}">今日回る人をえらぶ</button>${c.mode === 'split' ? `<button class="btn primary" data-cparts="${esc(c.id)}">回る範囲を分ける</button>` : ''}` : ''}<button class="btn" data-awayend="${esc(c.id)}">返す</button></div>`}
  </article>`;
}
function renderMyAwayCards() {
  const mine = activeCards().filter(c => c.by === me().id && !c.group), max = D().settings.awayMax; // グループのカードは、グループの見出しに出す
  $('#myAway').innerHTML = `<h2 class="sec">留守宅カード</h2>` + mine.map(awayCardHtml).join('') +
    (mine.length < max ? `<button class="btn block wideadd" data-awaypick>＋ 留守宅カードをもう1枚ほしい</button>`
      : `<p class="hint">留守宅カードは${max}枚まで持てます。終えると、また受け取れます。</p>`);
}
/* 留守宅カードをえらぶ：近い順・長く会えていない順・家が多い順・今の時間帯 */
function openAwayPick(grp) {
  const G = !!grp && canGroupTerr();
  const u = me(), reg = !!(u.slots && u.slots.length), cur = slotOf(new Date());
  if (G && !awayGroupSlot) awayGroupSlot = nextGroupSlot();
  const key = 'kuiki_awaysort_' + u.id;
  const paint = () => {
    const slots = G ? [awayGroupSlot] : reg ? u.slots.slice().sort(bySlot) : [cur];
    const sort = lsGet(key) || 'long';
    if (sort === 'near' && !myPos) { locate(paint); }
    const list = awaySuggestions(u.id, slots).map(x => {
      const items = (unmetIndex().get(x.t.id) || []).filter(i => x.keys.includes(i.k));
      const oldest = items.reduce((a, i) => (!a || i.first < a ? i.first : a), '');
      return Object.assign(x, { longDays: oldest ? daysSince(oldest) : 0, chance: meetChance(x.t, x.slot).p });
    });
    const by = {
      near: (a, b) => (a.dist == null ? 1e12 : a.dist) - (b.dist == null ? 1e12 : b.dist),
      long: (a, b) => b.longDays - a.longDays,
      many: (a, b) => b.keys.length - a.keys.length,
      now: (a, b) => (a.slot === cur ? 0 : 1) - (b.slot === cur ? 0 : 1) || b.keys.length - a.keys.length,
      easy: (a, b) => b.chance - a.chance || b.keys.length - a.keys.length
    };
    list.sort(by[sort] || by.long);
    const full = myAwayCount(G) >= D().settings.awayMax;
    setSheet(headHtml(null, G ? `${esc(myGroup())}グループで回る留守宅カード` : '留守宅カードをえらぶ',
        G ? `持てるのは${D().settings.awayMax}枚まで（今 ${myAwayCount(true)}枚）` : reg ? `行ける時間：${slots.map(slotShort).join('、')}` : `今の時間帯：${slotShort(cur)}`) + `
      ${G ? `<div class="seg" role="group" aria-label="もらうカード"><button type="button" data-gterr aria-pressed="false">区域カード</button><button type="button" aria-pressed="true">留守宅カード</button></div>
        <label class="field"><span>集まりの時間帯</span><select id="apGSlot">${SLOTS.map(x => `<option value="${x}"${x === awayGroupSlot ? ' selected' : ''}>${slotText(x)}</option>`).join('')}</select></label>
        <p class="q">回り方</p>
        <div class="seg" role="group" aria-label="回り方（分ける・シェア）"><button type="button" data-gmode="share" aria-pressed="${awayGroupMode !== 'split'}">シェア</button><button type="button" data-gmode="split" aria-pressed="${awayGroupMode === 'split'}">分ける</button></div>
        <p class="hint">${awayGroupMode === 'split' ? '分ける：受け取ったあと、地図に線を引いて人ごとに範囲を分けます。各自の画面には、わたされた範囲の家だけが出ます。' : 'シェア：全員が同じ家の一覧を見ます。だれかが記録した家は、みんなの画面で薄くなります。'}</p>` : ''}
      <div class="seg uiseg" role="group" aria-label="並び順">
        ${[['easy', '会いやすい順'], ['near', '近い順'], ['long', '長く会えていない順'], ['many', '家が多い順'], ['now', '今の時間帯']].filter(([v]) => !G || v !== 'now').map(([v, l]) =>
          `<button type="button" data-asort="${v}" aria-pressed="${sort === v}">${l}</button>`).join('')}
      </div>
      ${G ? '' : `<div class="row"><button class="btn small" id="apSlots">${reg ? '行ける時間を変える' : '行ける時間を登録する'}</button></div>`}
      ${full ? `<div class="notice warn">${G ? 'グループの' : ''}留守宅カードは${D().settings.awayMax}枚まで持てます。受け取り中のカードを終えると、受け取れます。</div>` : ''}
      ${list.length ? list.slice(0, 20).map(x => `<article class="ritem k-away"><div>
          <p class="rt"><span class="stamp xs${noCls(x.t.no)}">${esc(x.t.no)}</span> ${slotText(x.slot)}${x.slot === cur ? ' <span class="nowtag">今</span>' : ''}${dayOnlyN(x.keys.length) ? ' <span class="daytag">今日だけ</span>' : ''}</p>
          <p class="metline">会える見込み 約${pctTxt(x.chance)}<small class="muted">（目安）</small></p>
          ${ageLine(x.t)}
          <p class="muted">まだ会えていない家 ${x.keys.length}軒${x.longDays ? `　いちばん長い家は${x.longDays}日会えていない` : ''}${x.dist != null ? `　ここから約${fmtDist(x.dist)}` : ''}${x.t.holder ? '　あなたの区域' : ''}</p>
          ${x.ext ? '<p class="muted">区域は回り終えています（残りの留守宅）</p>' : ''}
        </div><button class="btn small primary" data-awaytake2="${esc(x.t.id)}" data-slot="${x.slot}"${full ? ' disabled' : ''}>受け取る</button></article>`).join('')
        : `<div class="empty">今、合う留守宅カードはありません。${G ? '<br>集まりの時間帯を変えると、ほかのカードが見つかることがあります。' : reg ? '' : '<br>「行ける時間を登録する」と、ほかの時間帯のカードも探せます。'}</div>`}
      <p class="hint">${awayExpText()}回り終えたら「返す」を押します。${G ? '<br>受け取ったら「今日回る人」をえらぶと、その人たちも今日だけ記録できます。' : ''}<br>「会える見込み」は、その区域の年齢の割合と、これまでの記録から出した目安です。</p>
      <button class="btn block" data-close>閉じる</button>`);
    const S = $('#sheet');
    $$('[data-asort]', S).forEach(b => b.onclick = () => { lsSet(key, b.dataset.asort); paint(); });
    if ($('#apSlots')) $('#apSlots').onclick = openSlotSheet;
    if ($('#apGSlot')) $('#apGSlot').onchange = e => { awayGroupSlot = e.target.value; paint(); };
    $$('[data-gmode]', S).forEach(b => b.onclick = () => { awayGroupMode = b.dataset.gmode === 'split' ? 'split' : 'share'; paint(); });
    if ($('[data-gterr]', S)) $('[data-gterr]', S).onclick = () => openRequestSheet(true);
    $$('[data-awaytake2]', S).forEach(b => b.onclick = () => { closeSheet(); takeAwayCard(b.dataset.awaytake2, b.dataset.slot, G); });
  };
  paint();
}

function renderAwaySuggest() {
  const u = me(), reg = !!(u.slots && u.slots.length), cur = slotOf(new Date());
  const slots = reg ? u.slots.slice().sort(bySlot) : [cur];
  const st = D().settings, mine = myAwayCount(false), full = mine >= st.awayMax;
  $('#slotEdit').textContent = reg ? '行ける時間を変える' : '行ける時間を登録する';
  $('#awayHint').innerHTML = (reg
      ? `あなたの行ける時間（${slots.map(slotShort).join('、')}）に合うカードです。`
      : `今の時間帯（${slotShort(cur)}）に合うカードです。`) +
    awayExpText() + '回り終えたら「返す」を押します。' +
    (mine ? `<br><b>受け取り中 ${mine}枚</b>（${st.awayMax}枚まで）。「区域カード」画面にあります。` : '');
  const list = awaySuggestions(u.id, slots).slice(0, 10);
  $('#awayList').innerHTML = list.length ? list.map(x => `<article class="ritem k-away"><div>
      <p class="rt"><span class="stamp xs${noCls(x.t.no)}">${esc(x.t.no)}</span> ${slotText(x.slot)}${x.slot === cur ? ' <span class="nowtag">今</span>' : ''}${dayOnlyN(x.keys.length) ? ' <span class="daytag">今日だけ</span>' : ''}</p>
      <p class="muted">まだ会えていない家 ${x.keys.length}軒${x.dist != null ? `　ここから約${fmtDist(x.dist)}` : ''}${x.t.holder ? '　あなたの区域' : ''}</p>
      ${x.ext ? '<p class="muted">区域は回り終えています（残りの留守宅）</p>' : ''}
    </div><button class="btn small primary" data-awaytake="${esc(x.t.id)}" data-slot="${x.slot}"${full ? ' disabled' : ''}>受け取る</button></article>`).join('') +
    (full ? `<p class="hint">持てる枚数に達しています。受け取り中のカードを終えると、受け取れます。</p>` : '')
    : `<div class="empty">今、合う留守宅カードはありません。${reg ? '' : '<br>「行ける時間を登録する」と、ほかの時間帯のカードも探せます。'}</div>`;
}
function openSlotSheet() {
  const sel = new Set(me().slots || []);
  const paint = () => {
    setSheet(headHtml(null, '行ける時間', '') + `
      <p class="hint">よく奉仕に行ける時間をタップしてください（いくつでも選べます）。</p>
      <table class="slotpick"><tr><th></th>${BANDS.map(b => `<th>${b}<br><small>${BAND_HINT[b]}</small></th>`).join('')}</tr>
      ${['平日', '土日'].map(dt => `<tr><th>${dtName(dt)}</th>${BANDS.map(b => {
        const s = dt + '・' + b;
        return `<td><button class="slotbtn" data-s="${s}" aria-pressed="${sel.has(s)}" aria-label="${dtName(dt)}の${b}">${sel.has(s) ? '✓' : ''}</button></td>`;
      }).join('')}</tr>`).join('')}</table>
      <button class="btn primary block" id="slotSave">保存する</button>
      <button class="btn block" data-close>やめる</button>`);
    $$('[data-s]', $('#sheet')).forEach(x => x.onclick = () => {
      const s = x.dataset.s; if (sel.has(s)) sel.delete(s); else sel.add(s); paint();
    });
    $('#slotSave').onclick = () => {
      me().slots = [...sel].sort(bySlot);
      Store.save(); closeSheet(); renderAll();
      toast(sel.size ? '行ける時間を保存しました' : '行ける時間を空にしました（今の時間帯で探します）');
    };
  };
  paint();
}

/* 係：完了のあとの留守宅（おすすめ）（2026-10-26。前は「返却後の留守宅カード」）
   完了した区域（S-13 に完了として記録したあと、次に区域カードとして受け取られるまで）の残りの留守宅は、留守宅カードにせず、
   おすすめタブだけに出す。set＝設定の行（状況の右の「区域の決め」に出す）・table＝完了した区域の表（左の状況に出す）。
   表は renderAwayAdmin で作った idx（unmetIndex の結果）を使い回す（区域ごとに unmetIndex を呼ばない） */
function extAdminHtml(idx, rrow, stpd) {
  const x = extSet(), st = D().settings, fd = Number(st.freeAfterDays) || 0, auto = Number(st.autoFree) === 1 && fd > 0;
  const om = Math.max(1, Math.min(5, Number(st.osaeMax) || 2)), od = Math.max(1, Math.min(14, Number(st.osaeDays) || 7)), rc = Math.max(1, Math.min(5, Number(st.recoCount) || 3));
  const lockOn = Number(st.recoLock) === 1, leftOn = Number(st.recoLeft) !== 0;
  const set = `<p class="hint">区域が完了した（S-13 に完了として記録した）あと、次に区域カードとして受け取られるまで、残りの留守宅を、留守宅カードにせず、全員の「おすすめ」タブに近くの数軒として出します。</p>` +
    rrow('寝かせる日数', '完了してから、この日数はおすすめに出しません。家ごとにも、最後に訪ねてからこの日数は出しません', stpd('extRest', x.rest, '日', '寝かせる日数', 1)) +
    rrow('1軒あたりの回数', '完了のあとに、同じ家を留守宅として訪ねる上限です（同じ日は1回。回り残しの家は、はじめて訪ねた日を数えません）', stpd('extCap', x.cap, '回', '1軒あたりの回数', 1)) +
    rrow('おすすめに出す期間', '完了してから、この日数で止めます' + (auto && x.days >= fd ? `<br><b>自由に受け取れる日のほうが先に来ます。その${x.before}日前で止まります</b>` : ''), stpd('extDays', x.days, '日', 'おすすめに出す期間', 7)) +
    rrow('次の新規の前に止める', `自動受け取りを使う区域では、自由に受け取れる日（${fd > 0 ? `完了から${fd}日` : 'まだ決めていません'}）のこの日数前で止めます。次に区域カードで回る人と重ならないようにするためです`, stpd('extStopBefore', x.before, '日', '次の新規の前に止める日数', 7)) +
    `<div class="setrow"><span>1つのおすすめに入れる家の数<br><small class="hint">近い家どうしを、この軒数ずつまとめて出します</small></span><div class="stepper">
      <button type="button" data-kset="recoCount" data-d="-1" aria-label="家の数を減らす">−</button><output class="wide">${rc}軒まで</output>
      <button type="button" data-kset="recoCount" data-d="1" aria-label="家の数を増やす">＋</button></div></div>` +
    rrow('回り残しの家も出す', '完了した区域で、この巡回の中で一度も訪ねていない家（完了の目安に届いたので回らなかった家など）を、留守宅より先に出します。仮の家は、家かどうか確かめてもらい、家でなければ、その場で消せます',
      `<div class="seg" role="group"><button type="button" data-sset="recoLeft" data-v="1" aria-pressed="${leftOn}">出す</button>
        <button type="button" data-sset="recoLeft" data-v="0" aria-pressed="${!leftOn}">出さない</button></div>`) +
    rrow('オートロックの建物も出す', '住む人への配慮で、オートロックの建物は1回に訪ねるのを3〜4件までにしているため、はじめは出しません',
      `<div class="seg" role="group"><button type="button" data-sset="recoLock" data-v="1" aria-pressed="${lockOn}">出す</button>
        <button type="button" data-sset="recoLock" data-v="0" aria-pressed="${!lockOn}">出さない</button></div>`) +
    rrow('1人が押さえられる予定の数', '「予定に入れる」をすると、その日の終わりまで、その家をほかの人のおすすめに出しません。同時にいくつまで押さえられるかです', stpd('osaeMax', om, 'つまで', '押さえられる予定の数', 1)) +
    rrow('何日先まで予定に入れられるか', '先の予定ほど、家を長く押さえることになります。使わなかった家は、予定の日が終わると、またおすすめに出ます', stpd('osaeDays', od, '日先まで', '予定に入れられる日数', 1));
  const live = liveHolds(), heldBy = new Map();
  live.forEach(h => { heldBy.set(h.terrId, (heldBy.get(h.terrId) || 0) + (h.keys || []).length); });
  const rows = D().territories.slice().sort(byNo).map(t => {
    const rs = recoState(t); if (!rs) return '';
    const items = isSpecial(t) ? unmetOfSpecial(t) : (idx.get(t.id) || []);
    const state = rs.why === 'rest' ? `寝かせ中（${fmtDay(new Date(rs.from).toISOString())}から）` : rs.why === 'open' ? 'おすすめに出している'
      : rs.why === 'over' ? `期間が終わった（${fmtDay(new Date(rs.end - 1).toISOString())}まで）` : '止めている';
    const hn = heldBy.get(t.id) || 0, ln = leftOn ? leftOf(t).length : 0;
    return `<tr><th>区域${esc(t.no)}</th><td>${items.length}軒</td><td>${leftOn ? `${ln}軒` : '—'}</td><td>${state}</td><td>${hn ? `${hn}軒` : '—'}</td>
      <td>${lendMode(t) === 'stop' ? '<span class="muted">貸出中止</span>' : `<button type="button" class="btn small" data-extstop="${esc(t.id)}">${t.extStop ? '出す' : '止める'}</button>`}</td></tr>`;
  }).join('');
  return { set, table: `<p class="q" data-hqk="extList">完了した区域（残りの留守宅は、おすすめに出します）</p>` + (rows
    ? `<div class="scroll"><table class="slots narrow"><tr><th>区域</th><th>残りの留守宅</th><th>回り残し</th><th>おすすめ</th><th>予定で押さえ中</th><th></th></tr>${rows}</table></div>`
    : '<p class="muted">今、完了した区域はありません。</p>') };
}
/* 係の画面：完了した区域の残りの留守宅を、区域ごとにおすすめに出す／止める */
function toggleExtStop(tid) {
  const t = terrById(tid); if (!t) return;
  commit(t.extStop ? `区域${t.no}の残りの留守宅を、おすすめに出すようにしました` : `区域${t.no}の残りの留守宅を、おすすめに出さないようにしました`, () => { if (t.extStop) delete t.extStop; else t.extStop = true; });
}

/* 係：留守宅の状況 */
function renderAwayAdmin() {
  const st = D().settings, idx = unmetIndex(), act = activeCards();
  const step = (key, label, unit, d) => `<div class="setrow"><span>${label}</span><div class="stepper">
    <button type="button" data-aset="${key}" data-d="-${d}" aria-label="${label}を減らす">−</button><output class="wide">${st[key]}${unit}</output>
    <button type="button" data-aset="${key}" data-d="${d}" aria-label="${label}を増やす">＋</button></div></div>`;
  const rl = awayRule();
  const stp = (key, val, unit, label) => `<div class="stepper"><button type="button" data-aset="${key}" data-d="-1" aria-label="${label}を減らす">−</button><output class="wide">${val}${unit}</output>
    <button type="button" data-aset="${key}" data-d="1" aria-label="${label}を増やす">＋</button></div>`;
  const two = (key, cur, a, b) => `<div class="seg" role="group"><button type="button" data-sset="${key}" data-v="${a[0]}" aria-pressed="${cur === a[0]}">${a[1]}</button>
    <button type="button" data-sset="${key}" data-v="${b[0]}" aria-pressed="${cur === b[0]}">${b[1]}</button></div>`;
  const rrow = (label, hint, ctl) => `<div class="setrow"><span>${label}<br><small class="hint">${hint}</small></span>${ctl}</div>`;
  const stpd = (key, val, unit, label, d) => `<div class="stepper"><button type="button" data-aset="${key}" data-d="-${d}" aria-label="${label}を減らす">−</button><output class="wide">${val}${unit}</output>
    <button type="button" data-aset="${key}" data-d="${d}" aria-label="${label}を増やす">＋</button></div>`;
  const dayOnly = Number(st.awayDayOnly) || 0;
  // 留守宅の設定の行は、状況の右の「区域の決め」（kimari.js）に出す。左の「留守宅の状況」には、完了した区域の表だけを出す
  const awayBox = $('#krAway'), extBox = $('#krExt'), ex = extAdminHtml(idx, rrow, stpd);
  if (extBox) extBox.innerHTML = ex.set;
  $('#adAwaySet').innerHTML = ex.table;
  if (awayBox) awayBox.innerHTML = `<p class="q"><b>留守宅訪問のルール</b></p>` +
    rrow('留守宅として訪ねる上限回数', '今回の巡回で留守だった日の数です（同じ日は1回）。届いた家は、次の巡回が始まるまで留守宅カードに入りません', stp('awayCap', rl.cap, '回', '上限回数')) +
    rrow('この日数以内に訪ねた家は、カードに入れない', '同じ家を次に訪ねるまでの最短の間隔です。0にすると、間隔をあけません', stp('awayRecentDays', rl.gap, '日', '最短間隔')) +
    rrow('同じ家に同じ時間帯を重ねない', 'オンのときは、同じ家を同じ時間帯（例：平日の朝）では訪ねません。10通りすべて試した家は、いちばん前に試した時間帯から順に戻ります', two('awayNoRepeat', rl.nr, [1, 'オン'], [0, 'オフ'])) +
    rrow('試した時間帯の数え方', 'どの時間帯を「試した」とみなすかだけが変わります。留守宅になる家の範囲は変わりません（今回の巡回で会えていない家です）', two('awayScope', rl.sc, [0, '今回の巡回だけ'], [1, '前回の巡回も含める'])) +
    `<p class="hint">設定を変えても、今出ているカードには反映されません。次に受け取るカードから変わります。</p>
    <p class="hint">巡回：正式返却のあと、次に区域カードとして受け取った日から、次の正式返却まで。完了のあと（おすすめに出す期間）は、前の巡回の続きです。</p>
    <p class="hint">留守宅カードは、区域が完了する（S-13 に記録する）までです。完了のあとの残りの留守宅は、「完了のあとの留守宅（おすすめ）」の決めで、おすすめタブに出します。</p>
    <p class="q"><b>留守宅カードの出し方</b></p>` +
    `<div class="setrow"><span>留守宅カードが自動で終わるとき<br><small class="hint">「区域の返却の目安まで」は、区域を受け取った日から返却の目安（${lendDays()}日）までです。目安がない区域は、下の日数で終わります</small></span>
      <div class="seg" role="group"><button type="button" data-sset="awayExp" data-v="0" aria-pressed="${Number(st.awayExp) !== 1}">日数で</button>
      <button type="button" data-sset="awayExp" data-v="1" aria-pressed="${Number(st.awayExp) === 1}">区域の返却の目安まで</button></div></div>` +
    step('awayDays', '留守宅カードが自動で終わるまで', '日', 1) + step('awayMax', '1人が同時に持てる留守宅カード', '枚まで', 1) +
    `<div class="setrow"><span>1枚のカードに入れる家の数<br><small class="hint">長く会えていない家から入れます</small></span><div class="stepper">
      <button type="button" data-aset="awayCardMax" data-d="-5" aria-label="減らす">−</button><output class="wide">${st.awayCardMax ? st.awayCardMax + '軒まで' : '制限なし'}</output>
      <button type="button" data-aset="awayCardMax" data-d="5" aria-label="増やす">＋</button></div></div>
    <div class="setrow"><span>回り終えた記録がない区域（担当者なし）も使う<br><small class="hint">「使わない」は、回り終えた区域だけからカードを作ります</small></span>
      <div class="seg" role="group"><button type="button" data-sset="awayAllTerr" data-v="1" aria-pressed="${st.awayAllTerr === 1}">使う</button>
      <button type="button" data-sset="awayAllTerr" data-v="0" aria-pressed="${st.awayAllTerr !== 1}">使わない</button></div></div>` +
    rrow('その日限りにする軒数', 'この軒数以下のカードは、受け取った日の終わりに自動で終わります（用事のついでに寄る人向け）。0にすると使いません', stpd('awayDayOnly', dayOnly, dayOnly ? '軒まで' : '（使わない）', 'その日限りにする軒数', 1));

  const all = [...idx.values()].flat();
  const cnt = {};
  all.forEach(x => { if (!x.hard) SLOTS.forEach(s => { if (!hasSlot(x.tried, s)) cnt[s] = (cnt[s] || 0) + 1; }); });
  const maxN = Math.max(0, ...Object.values(cnt));
  $('#adAwaySlots').innerHTML = `<tr><th></th>${BANDS.map(b => `<th>${b}<br><small>${BAND_HINT[b]}</small></th>`).join('')}</tr>` +
    ['平日', '土日'].map(dt => `<tr><th>${dtName(dt)}</th>${BANDS.map(b => {
      const n = cnt[dt + '・' + b] || 0;
      return `<td class="${n && n === maxN ? 'thin' : ''}"><b>${n}</b>軒</td>`;
    }).join('')}</tr>`).join('');

  const rows = D().territories.slice().sort(byNo).map(t => {
    const items = idx.get(t.id) || [];
    if (!items.length) return '';
    const avg = (items.reduce((s, x) => s + slotCount(x.tried), 0) / items.length).toFixed(1);
    const using = act.filter(c => c.terrId === t.id).length;
    return `<tr><th>区域${t.no}</th><td>${items.length}軒</td><td>${avg} / ${SLOTS.length}</td><td>${triedOf(items) == null ? '—' : triedOf(items) + ' / ' + SLOTS.length}</td><td>${using ? `${using}枚` : '—'}</td>
      <td>${t.holder ? `${esc(uname(t.holder))}さん` : afterDone(t) ? '<span class="muted">カードにしない（完了したので、おすすめに出す）</span>' : (t.completedAt ? 'だれでも' : '<span class="muted">回り終えた記録なし</span>')}</td></tr>`;
  }).join('');
  $('#adAwayTerrs').innerHTML = rows
    ? `<div class="scroll"><table class="slots narrow"><tr><th>区域</th><th>会えていない家</th><th>1軒あたり試した時間帯（平均）</th><th>区域で試した時間帯（合わせて）</th><th>使用中のカード</th><th>留守宅カードを使える人</th></tr>${rows}</table></div>`
    : '<p class="muted">会えていない家はありません。</p>';

  const hard = all.filter(x => x.hard);
  $('#adHard').innerHTML = hard.length ? hard.slice(0, 30).map(x => {
    const t = terrById(x.h.terrId);
    return `<article class="ritem k-new"><div>
      <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> ${targetName(x.h, x.u)}</p>
      <p class="muted">留守 ${visitsOf(x.k).length}回　すべての時間帯で会えていません</p>
    </div><button class="btn small" data-go="${esc(x.h.id)}" data-unit="${esc(x.u)}">地図で見る</button></article>`;
  }).join('') + (hard.length > 30 ? `<p class="muted">ほか ${hard.length - 30}件</p>` : '')
    : '<div class="empty">今はありません。</div>';
}

/* ---------- おすすめ画面 ---------- */
let recoFilter = 'all';
const RECO_KINDS = [
  ['all', 'すべて'], ['handoff', '引き継ぎを待っている家'], ['interest', '★ また訪ねたい家'], ['young', '若い世代']
];
function computeReco() {
  const now = new Date(), slot = slotOf(now), onlyMine = $('#recoMine').checked;
  const items = [];
  for (const h of D().houses) {
    const t = terrById(h.terrId); if (!t) continue;
    const othersTerr = onlyMine && t.holder && t.holder !== me().id;
    for (const unit of targets(h)) {
      const k = K(h.id, unit);
      if (D().dnc[k] || D().follows[k]) continue; // 受け持ち中の家は出さない
      const rel = relOf(k);
      if (othersTerr && !rel) continue;            // 引き継ぎ待ちはだれにでも見せる
      const s2 = sum(k), last = s2.last;
      const idle = last ? Math.floor((now - Date.parse(last.at)) / DAY) : Infinity;
      const met = s2.met; // いちばん新しい「会えた」
      let kind = null, reason = '', score = 0;
      if (rel) {
        const bs = bestSlot(k);
        kind = 'handoff'; score = 100;
        reason = '再訪問の引き継ぎを待っています' + (bs ? `。会えた時間帯：${bs}` : '');
      }
      const see = met && seeV(met, k, h);
      if (!kind && see) {
        if (INTERESTED.has(met.interest) && idle >= 30) {
          kind = 'interest'; score = 90; reason = `★（${idle}日間 訪問なし）`;
        } else if (YOUNG.has(met.age) && idle >= 60) {
          kind = 'young'; score = 60; reason = `若い世代の方に会えた家（${idle}日間 訪問なし）`;
        }
      }
      if (kind) items.push({ h, unit, t, kind, reason, score, dist: myPos ? distM(myPos, [h.lat, h.lng]) : null });
    }
  }
  return { items, slot, band: bandOf(now) };
}
function renderReco() {
  renderAwaySuggest();
  const { items, slot, band } = computeReco();
  $('#recoNow').textContent = `今は「${slot}」（${BAND_HINT[band]}）です。${myPos ? '現在地から近い順に並べています。' : ''}`;
  const count = k => k === 'all' ? items.length : items.filter(i => i.kind === k).length;
  $('#recoChips').innerHTML = RECO_KINDS.map(([k, l]) => `<button class="chip" data-kind="${k}" aria-pressed="${recoFilter === k}">${l}（${count(k)}）</button>`).join('');
  let list = recoFilter === 'all' ? items : items.filter(i => i.kind === recoFilter);
  list.sort(myPos ? (a, b) => a.dist - b.dist : (a, b) => b.score - a.score || cmpNo(a.t.no, b.t.no));
  const MAX = 40, more = list.length - MAX;
  list = list.slice(0, MAX);
  $('#recoList').innerHTML = list.length ? list.map(i => {
    const name = i.h.type === 'apt' ? `${esc(i.h.label || '集合住宅')} ${esc(unitTitle(i.h, i.unit))}` : esc(i.h.label || '家');
    return `<article class="ritem k-${i.kind}"><div>
        <p class="rt"><span class="stamp xs${noCls(i.t.no)}">${esc(i.t.no)}</span> ${name}</p>
        <p class="muted">${esc(i.reason)}</p>
        ${i.dist != null ? `<p class="muted">ここから約 ${fmtDist(i.dist)}</p>` : ''}
      </div><button class="btn small primary" data-go="${esc(i.h.id)}" data-unit="${esc(i.unit)}">地図で見る</button></article>`;
  }).join('') + (more > 0 ? `<p class="muted">ほか ${more}件。上の分類で絞りこめます。</p>` : '')
    : '<div class="empty">今の条件に合う家はありません。</div>';
}
/* ---------- 再訪問を地図で見る：自分の再訪問だけを、現在地を中心に表示 ---------- */
let followMap = false;
const myFollowKeys = () => Object.keys(D().follows).filter(k => D().follows[k].by === me().id && houseById(parseKey(k)[0]));
function fitFollowMap() {
  const pts = myFollowKeys().map(k => { const h = houseById(parseKey(k)[0]); return [h.lat, h.lng]; });
  if (myPos) pts.push(myPos);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 18 });
}
function openFollowMap() {
  if (!myFollowKeys().length) { toast('受け持っている再訪問はありません'); return; }
  clearTarget();
  focusCard = null; roundTerr = null; curTerr = null; firstMapShow = false;
  followMap = true;
  showView('map');
  $('#terrJump').value = '';
  setTimeout(() => { map.invalidateSize(); fitFollowMap(); renderTerrs(); renderHouses(); }, 60);
  locate(() => { fitFollowMap(); renderHouses(); });
}
/* 「地図で見る」：その家まで地図が飛んでいき、四すみの枠で家をしぼりこんで見せる。
   家をタップすると、まずこれまでの記録とメモ → 「訪問の結果を記録する」で結果を残す */
function goTo(hid, unit, route, rk) {
  const h = houseById(hid); if (!h) return;
  clearTarget(); followMap = false;
  focusCard = null; roundTerr = null; curTerr = null; firstMapShow = false;
  target = { hid, unit: unit || '', route: !!route, reco: rk || '' };
  showView('map');
  $('#terrJump').value = '';
  setTimeout(() => {
    map.invalidateSize();
    let shown = false;
    const show = () => { if (shown) return; shown = true; renderTerrs(); renderHouses(); showTargetMarker(h); };
    map.once('moveend', show);
    map.flyTo([h.lat, h.lng], 19, { duration: 0.9 });
    setTimeout(show, 1400); // 同じ場所のときなど、動かなかった場合
    if (beginner()) toast(route ? 'オレンジの枠の家を押すと、メモ・記録（会えた・留守）と道順が開きます' : 'オレンジの枠の家をタップすると、これまでの記録とメモが見られます');
  }, 80);
}
function locate(after) {
  if (!navigator.geolocation) { toast('この端末では現在地を使えません'); return; }
  const lb = $('#btnLocate');
  if (lb) lb.classList.add('busy');
  navigator.geolocation.getCurrentPosition(p => {
    if (lb) lb.classList.remove('busy');
    myPos = [p.coords.latitude, p.coords.longitude];
    if (map) { // Googleマップのような、青い点と、だいたいの範囲の薄い円
      if (posMarker) map.removeLayer(posMarker);
      posMarker = L.layerGroup([
        L.circle(myPos, { radius: Math.min(p.coords.accuracy || 30, 300), color: '#1A73E8', weight: 1, opacity: 0.35, fillColor: '#1A73E8', fillOpacity: 0.12, interactive: false }),
        L.circleMarker(myPos, { radius: 9, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1, interactive: false })
      ]).addTo(map);
    }
    after && after();
  }, () => {
    if (lb) lb.classList.remove('busy', 'on');
    toast('現在地を取得できませんでした。端末の位置情報の設定を確認してください');
  }, { enableHighAccuracy: true, timeout: 10000 });
}

/* ---------- 表示の設定（このスマホ・この人だけ。サーバーには送らない） ----------
   かんたん：文字の大きさだけ　くわしく：色・文字の種類・こさ・間隔・説明文・最初の画面・地図 */
/* 名前を出す大きさのスライダー（設定の画面） */
function nameZoomSlider(key) {
  const v = nameZoomOff(key);
  return `<div class="nzbox"><p class="nzlabel">出す大きさ：<b id="nzOut_${key}">${nameZoomText(v)}</b></p>
    <input type="range" class="nzrange" data-nz="${key}" min="-2" max="3" step="0.5" value="${v}" aria-label="名前を出す大きさ">
    <p class="nzends"><span>← 縮めても出す</span><span>拡大したときだけ →</span></p></div>`;
}
const ICONS = ['区', '家', '図', '心', '🏠', '🗺️', '📖', '🚪', '✅', '⭐', '🚶', '☀️'];
const UI_DEFAULT = { fTime: 'off', fTimer: 'on', hello: 'on', fFollow: 'off', todayOn: 'off', cProg: 'off', cReco: 'off', cSlot: 'on', aptName: 'off', fcName: 'off', nameScope: 'sel', aptZoom: 0, fcZoom: 0, calList: 'upcoming', terrColor: 'theme', terrWidth: 'normal', mapRot: 'on', mode: 'simple', size: 'normal', pct: 0, icon: '区', iconText: '', appName: '区域マップ', splash: 'on', splashSec: 1.8, guide: 'auto', font: 'ud', theme: 'standard', custom: '', contrast: 'normal', density: 'normal', hints: 'show', start: 'home', pin: 'normal', base: 'pale' };
/* [濃い色（上の帯・主なボタン）, アクセント（線・区域番号など）, うすい色（選んでいる背景）, 名前] */
const THEMES = {
  standard: ['#17324D', '#0E7C66', '#E5F2EE', '標準'],
  green: ['#0B5E4E', '#0E7C66', '#E5F2EE', 'みどり'], blue: ['#174A85', '#1D5FA8', '#E6EFF9', 'あお'],
  purple: ['#4E2A7A', '#6B3FA0', '#F0EAF7', 'むらさき'], orange: ['#8A3F06', '#B45309', '#FDF0E3', 'オレンジ'],
  pink: ['#8E2350', '#B83268', '#FBE9F0', 'ピンク'], gray: ['#263238', '#37474F', '#ECEFF1', 'グレー']
};
/* 円形のカラーから、白い文字が読める濃さの色を作る */
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const onWhite = hex => 1.05 / (lum(hex) + 0.05); // 白い文字とのコントラスト
const contrastOf = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const INK_ON_LIGHT = '#000000'; // 明るいテーマの色の上に書く文字（黒。どの色でも 4.5 以上の見やすさになる）
function mixHex(a, b, t) { // a の色に b の色を t の割合でまぜる（どちらも #rrggbb の形）
  const p = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map(i => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, '0')).join('');
}
/* じぶんの色の保存の形：「色あい,あざやかさ,明るさ」（明るさは 0＝黒〜100＝白）。
   明るさのバーを入れる前の形「色あい,あざやかさ」は、これまでと同じ濃さ（白い文字が読める濃さ）として読む */
function parseCustom(s) {
  const m = String(s || '').match(/^(\d+),(\d+)(?:,(\d+))?$/);
  if (!m) return null;
  const h = (+m[1]) % 360, sat = Math.min(100, +m[2]);
  let l = m[3] === undefined ? null : Math.min(100, +m[3]);
  if (l === null) { l = 50; while (l > 8 && onWhite(hslHex(h, sat, l)) < 7) l -= 2; }
  return { h, sat, l };
}
/* [上の帯の色（えらんだ色そのまま）, 区域の線・番号の色（白い地でも読める濃さ）, うすい色, 名前, 起動の画面の濃い色] */
function customTheme(hs) {
  const c = parseCustom(hs);
  if (!c) return THEMES.standard;
  const { h, sat, l } = c;
  let la = sat < 12 ? 35 : 50, accent, deep; // 白・黒・灰色は、線が濃いめの灰色になる
  while (la > 4 && onWhite(accent = hslHex(h, sat, la)) < 4.5) la -= 1;
  let ld = la;
  while (ld > 3 && onWhite(deep = hslHex(h, sat, ld)) < 7) ld -= 1;
  return [hslHex(h, sat, l), accent, hslHex(h, Math.min(sat, 70), 94), 'じぶんの色', deep];
}
const themeOf = e => (e.theme === 'custom' ? customTheme(e.custom) : THEMES[e.theme] || THEMES.standard);
/* テーマの色から、画面で使う色の組を作る。
   どの色をえらんでも文字が読めるように、上の帯やボタンの上の文字は白か黒の読みやすいほうにする（2026.13.88）。
   標準などの決まった色は、これまでと同じ（白い文字・線の色とのグラデーション）になる */
function themeSet(th) {
  const brand = th[0], acc = th[1];
  const w = onWhite(brand), k = contrastOf(brand, INK_ON_LIGHT);
  const light = w < 4.5 && k > w; // 白い文字では読みにくい明るい色
  const on = light ? INK_ON_LIGHT : '#ffffff';
  let brand2 = acc; // 帯のグラデーションの相手（その上の文字が読めること）
  if (light || contrastOf(acc, on) < 4.5) { // 明るい色は、同じ色の少し濃い・うすいほうと組み合わせる
    brand2 = brand;
    for (const [to, t] of [['#000000', 0.12], ['#000000', 0.07], ['#ffffff', 0.3], ['#ffffff', 0.15]]) {
      const c = mixHex(brand, to, t);
      if (contrastOf(c, on) >= 4.5) { brand2 = c; break; }
    }
  }
  return {
    brand, acc, soft: th[2], on, brand2,
    onDim: light ? '#0000004d' : '#ffffff80', // 帯の上の枠線など
    ink: w >= 4.5 ? brand : acc,               // 白い地の上の文字・枠線に使う色
    deep: w >= 7 ? brand : (th[4] || acc),     // 起動のあいさつなど、白い文字をのせる濃い色
    light
  };
}
const SIZES = { small: [0.9, '小さめ'], normal: [1, '標準'], large: [1.15, '大きく'], xlarge: [1.3, 'とても大きく'] };
/* 文字の種類：[Google Fontsの名前（なし＝読み込まない）, 表示名, 太さ, 分類] */
const FONTS = {
  ud: ['', '見やすいゴシック', '', '標準'],
  system: ['', 'スマホの文字', '', '標準'],
  maru: ['M PLUS Rounded 1c', 'まるゴシック', ':wght@400;700', 'まる'],
  zenmaru: ['Zen Maru Gothic', 'やさしいまる', ':wght@400;700', 'まる'],
  kosugi: ['Kosugi Maru', 'すっきりまる', '', 'まる'],
  kiwi: ['Kiwi Maru', 'キウイまる', ':wght@400;500', 'かわいい'],
  mochiy: ['Mochiy Pop One', 'もちっとポップ', '', 'かわいい'],
  hachi: ['Hachi Maru Pop', 'はちまるポップ', '', 'かわいい'],
  yusei: ['Yusei Magic', 'マジックペン', '', '手書き'],
  klee: ['Klee One', 'えんぴつ手書き', ':wght@400;600', '手書き'],
  yomogi: ['Yomogi', 'よもぎ手書き', '', '手書き'],
  kurenaido: ['Zen Kurenaido', 'ふで手書き', '', '手書き'],
  rocknroll: ['RocknRoll One', 'ロックンロール', '', 'ポップ'],
  potta: ['Potta One', 'ぽってり筆', '', 'ポップ'],
  dot: ['DotGothic16', 'ドット（ゲーム風）', '', 'ポップ'],
  mincho: ['Zen Old Mincho', 'きれいな明朝', ':wght@400;700', 'きれい']
};
const FONT_BASE = '"BIZ UDPGothic","Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
const fontStack = k => {
  const f = FONTS[k] || FONTS.ud;
  if (k === 'system') return 'system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif';
  return f[0] ? `"${f[0]}",${FONT_BASE}` : FONT_BASE;
};
const fontUrl = (k, text) => {
  const f = FONTS[k];
  return 'https://fonts.googleapis.com/css2?family=' + f[0].replace(/ /g, '+') + (text ? '' : f[2]) + '&display=swap' + (text ? '&text=' + encodeURIComponent(text) : '');
};
const fontFull = new Set(), fontPrev = new Set();
function loadFont(k, previewText) {
  const f = FONTS[k];
  if (!f || !f[0] || fontFull.has(k)) return;
  if (previewText) { if (fontPrev.has(k)) return; fontPrev.add(k); } else fontFull.add(k);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = fontUrl(k, previewText); // 見本は使う文字だけ（軽い）、えらんだら全部の文字
  document.head.appendChild(l);
}
const PINS = { small: [0.85, '小さめ'], normal: [1, '標準'], large: [1.25, '大きく'] };
// 家の印の大きさ（倍）：簡単モードは標準でも1.15倍・「とても大きく」のときは1.25倍（指示書3.6）
const pinScale = () => (UI.mode !== 'detail' ? (UI.size === 'xlarge' ? 1.25 : 1.15) : (PINS[uiEff().pin] || PINS.normal)[0]);
let UI = Object.assign({}, UI_DEFAULT);
const uiKey = () => 'kuiki_ui_' + (Store.data ? me().id : 'guest');
function uiLoad() {
  let saved = {};
  try { saved = JSON.parse(lsGet(uiKey()) || '{}') || {}; } catch (e) { saved = {}; }
  UI = Object.assign({}, UI_DEFAULT, saved);
  // この更新の前から使っていた人は、使っていた機能がいきなり消えないように「使う」にしておく
  if (Store.data && (!('fFollow' in saved) || !('fTime' in saved))) {
    if (!('fFollow' in saved)) UI.fFollow = Object.values(D().follows || {}).some(f => f.by === me().id) ? 'on' : 'off';
    if (!('fTime' in saved)) {
      const o = myData();
      UI.fTime = (o.timer || Object.keys(o.log).length || Object.keys(o.goals).length) ? 'on' : 'off';
    }
    uiSave(); // 一度決めたら覚えておく（あとで受け持ちが0件になっても、勝手に消えないように）
  }
}
const uiSave = () => lsSet(uiKey(), JSON.stringify(UI));
/* かんたんモードでは、文字の大きさ以外は標準にもどして使う */
function uiEff() {
  if (UI.mode === 'detail') return UI;
  const size = UI.size === 'small' ? 'normal' : UI.size;
  // かんたん表示で「とても大きく」にしたときは、地図の家の印も大きくする（指で押しやすく）
  // ホーム画面のアイコンの絵と名前は、どちらの表示でも、えらんだものを使う（「ホーム画面に追加」でえらぶため・2026.13.82）
  return Object.assign({}, UI_DEFAULT, { size, pin: size === 'xlarge' ? 'large' : 'normal', icon: UI.icon || UI_DEFAULT.icon, iconText: UI.iconText || '', appName: UI.appName || UI_DEFAULT.appName });
}
const accentColor = () => themeOf(uiEff())[1];
/* 区域の線の色（各自の設定） */
const TERR_COLORS = { theme: ['', 'テーマの色'], red: ['#D32F2F', '赤'], orange: ['#E65100', 'だいだい'], blue: ['#1565C0', '青'], purple: ['#6A1B9A', 'むらさき'], black: ['#263238', '黒'] };
const terrLineColor = () => { const v = TERR_COLORS[UI.terrColor || 'theme']; return v && v[0] ? v[0] : accentColor(); };
const terrLineWidth = on => { const w = UI.terrWidth === 'thin' ? 2 : UI.terrWidth === 'thick' ? 7 : 3; return on ? w + 2 : w; };
/* くわしくモードでは、スライダーで決めた％（80〜160）を使う */
const zoomOf = e => (UI.mode === 'detail' && e.pct ? e.pct / 100 : (SIZES[e.size] || SIZES.normal)[0]);
/* ホーム画面のアイコンを、その場で作る（テーマの色＋えらんだ絵） */
/* 文字を「見た目の1文字」ごとに分ける（❤️・👨‍👩‍👧 のような、いくつかの符号でできた絵文字も1文字に数える） */
function graphemes(s) {
  s = String(s || '');
  try { return Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(s), x => x.segment); }
  catch (e) { return Array.from(s); }
}
/* 前後の空白を除いて、見た目で n 文字まで（ホーム画面のアイコンの絵・絵の下の文字） */
const clipG = (s, n) => graphemes(String(s || '').replace(/\s+/g, ' ').trim()).slice(0, n).join('');
const ICON_JP_FONT = '"BIZ UDPGothic","Hiragino Sans",sans-serif';
function drawIcon(cv) {
  const e = uiEff(), x = cv.getContext('2d'), ts = themeSet(themeOf(e));
  const t = clipG(e.icon, 2) || '区', sub = clipG(e.iconText, 4), tn = graphemes(t).length;
  const g = x.createLinearGradient(0, 0, 180, 180);
  g.addColorStop(0, ts.brand); g.addColorStop(1, ts.brand2);
  x.clearRect(0, 0, 180, 180);
  x.fillStyle = g; x.fillRect(0, 0, 180, 180);
  x.fillStyle = ts.on; x.textAlign = 'center'; x.textBaseline = 'middle'; // 明るい色のときは、黒い文字
  const emoji = /[^\u0000-ヿ一-鿿＀-￯]/.test(t);
  const fam = emoji ? 'sans-serif' : ICON_JP_FONT;
  if (sub) { // 絵の下に文字を入れるとき：絵を少し上・小さめにし、下に文字（はみ出すときは横を縮める）
    x.font = `700 ${tn > 1 ? 56 : 78}px ${fam}`;
    x.fillText(t, 90, 70, 164);
    const sn = graphemes(sub).length;
    x.font = `700 ${sn <= 2 ? 40 : sn === 3 ? 36 : 31}px ${ICON_JP_FONT}`;
    x.fillText(sub, 90, 140, 164);
  } else {
    x.font = `700 ${tn > 1 ? 74 : 100}px ${fam}`;
    x.fillText(t, 90, 96, 168);
  }
  return cv;
}
function applyIcon() {
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 180;
    const url = drawIcon(cv).toDataURL('image/png');
    $('#touchIcon').href = url; $('#favIcon').href = url;
    $('#appTitle').content = String(uiEff().appName || '区域マップ').slice(0, 12);
  } catch (e) { /* 作れないときは、そのまま */ }
}
function setThemeVars(th) {
  const r = document.documentElement.style, ts = themeSet(th);
  r.setProperty('--brand', ts.brand); r.setProperty('--terr', ts.acc); r.setProperty('--terr-soft', ts.soft);
  r.setProperty('--on-brand', ts.on); r.setProperty('--on-brand-dim', ts.onDim); r.setProperty('--brand2', ts.brand2);
  r.setProperty('--brand-ink', ts.ink); r.setProperty('--deep', ts.deep);
  // iPhoneのホーム画面から開いたとき、時刻や電池の白い文字が明るい帯の上で見えなくならないように、その部分だけ濃い色にする
  r.setProperty('--status-bg', ts.light ? ts.deep : ts.brand);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = ts.brand;
  return ts;
}
function applyUi() {
  const e = uiEff(), r = document.documentElement.style;
  setThemeVars(themeOf(e));
  r.setProperty('--z', String(zoomOf(e)));
  r.setProperty('--pin', String(pinScale()));
  r.setProperty('--font', fontStack(e.font));
  loadFont(e.font); // 標準以外の文字は、使うときだけ読み込む
  document.body.classList.toggle('simple', UI.mode !== 'detail');
  document.body.classList.toggle('f-time', featTime());
  document.body.classList.toggle('f-follow', featFollow());
  applyIcon();
  if (UI.mode === 'detail' && UI.splash === 'off') lsSet(SPLASH_OFF, '1'); else lsDel(SPLASH_OFF);
  document.body.classList.toggle('compact', e.density === 'compact');
  document.body.classList.toggle('nohints', e.hints === 'hide');
  document.body.classList.toggle('strong', e.contrast === 'strong');
  document.body.classList.toggle('big', zoomOf(e) >= 1.14); // 文字を大きくしたとき（並べ方を変える）
  if (map) { renderTerrs(); setTimeout(() => map.invalidateSize(), 30); }
}
/* 円形のカラー：角度で色あい、中心からの距離であざやかさ。
   となりのバー：明るさ（上ほど明るく、いちばん上は白・いちばん下は黒。2026.13.88） */
function bindWheel() {
  const w = $('#wheel'), dot = $('#wheelDot'), shade = $('#wheelShade'), bar = $('#lbar'), knob = $('#lbarDot');
  const c0 = parseCustom(UI.custom || '200,70,35') || { h: 200, sat: 70, l: 35 };
  let h = c0.h, sat = c0.sat, l = c0.l;
  const PAD = 14; // バーの上下のはし（ここまで指を持っていけば、白・黒になる）
  const show = () => {
    const R = w.clientWidth / 2, a = h * Math.PI / 180, d = R * sat / 100;
    dot.style.left = (R + Math.sin(a) * d) + 'px'; dot.style.top = (R - Math.cos(a) * d) + 'px';
    // 円の見た目も、えらんだ明るさに近づける（色が分からなくならないよう、白・黒は 75% まで）
    const t = Math.min(0.75, Math.abs(l - 50) / 50);
    shade.style.background = l >= 50 ? '#fff' : '#000'; shade.style.opacity = String(t);
    const th = customTheme(`${h},${sat},${l}`), ts = themeSet(th);
    dot.style.background = th[0];
    bar.style.background = `linear-gradient(to bottom,#fff,${hslHex(h, sat, 50)},#000)`;
    knob.style.top = (PAD + (100 - l) / 100 * (bar.clientHeight - PAD * 2)) + 'px';
    knob.style.background = th[0];
    bar.setAttribute('aria-valuenow', String(l));
    bar.setAttribute('aria-valuetext', l >= 97 ? '白' : l <= 3 ? '黒' : l >= 60 ? '明るい' : l <= 40 ? '暗い' : 'ふつう');
    const pb = $('#wpBar'); pb.style.background = th[0]; pb.style.color = ts.on;
    pb.style.boxShadow = ts.light ? `inset 0 0 0 2px ${ts.ink}` : '';
    $('#wpSoft').style.background = th[2];
    $('#wpAcc').style.background = th[1];
    return th;
  };
  const live = () => { UI.custom = `${h},${sat},${l}`; setThemeVars(show()); }; // なぞっている間は色だけ変える（軽く）
  const done = () => { uiSave(); applyUi(); };
  show();
  // 円
  let wDrag = false;
  const pickW = e => {
    const r = w.getBoundingClientRect(), R = r.width / 2;
    const dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
    h = Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360);
    sat = Math.round(Math.min(1, Math.hypot(dx, dy) / R) * 100);
    live();
  };
  w.onpointerdown = e => {
    wDrag = true; w.setPointerCapture(e.pointerId);
    if (l >= 95 || l <= 5) l = 50; // 白・黒のときに円をさわったら、色が見える明るさにもどす
    pickW(e);
  };
  w.onpointermove = e => { if (wDrag) pickW(e); };
  w.onpointerup = w.onpointercancel = () => { if (!wDrag) return; wDrag = false; done(); };
  // 明るさのバー
  let bDrag = false;
  const pickB = e => {
    const r = bar.getBoundingClientRect();
    const f = (e.clientY - r.top - PAD) / Math.max(1, r.height - PAD * 2);
    l = Math.round(100 - Math.max(0, Math.min(1, f)) * 100);
    live();
  };
  bar.onpointerdown = e => { bDrag = true; bar.setPointerCapture(e.pointerId); pickB(e); };
  bar.onpointermove = e => { if (bDrag) pickB(e); };
  bar.onpointerup = bar.onpointercancel = () => { if (!bDrag) return; bDrag = false; done(); };
  bar.onkeydown = e => { // パソコンのキーでも動かせる
    const step = { ArrowUp: 2, ArrowRight: 2, ArrowDown: -2, ArrowLeft: -2, PageUp: 10, PageDown: -10 }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    l = e.key === 'Home' ? 100 : e.key === 'End' ? 0 : Math.max(0, Math.min(100, l + step));
    live(); done();
  };
}
/* 表示の設定：いちばん上までスクロールした状態で下にスワイプすると、設定をそのまま残して閉じる */
function bindSheetSwipe() {
  const s = $('#sheet');
  let y0 = null, x0 = 0, dy = 0, on = false;
  s.addEventListener('touchstart', e => {
    // いちばん上までスクロールしているときだけ。色の輪・スライダー・入力欄・左右にスワイプする行の上では動かさない
    if (s.scrollTop > 0 || e.touches.length !== 1 || e.target.closest('.wheel, .lbar, input, textarea, select, .swipe-body')) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; on = false;
  }, { passive: true });
  s.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    const dx = e.touches[0].clientX - x0;
    if (!on) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { y0 = null; return; } // 上や横に動かしたときは、ふつうのスクロール
      on = true;
    }
    e.preventDefault(); // 画面全体が動かないようにする
    s.classList.add('dragging');
    s.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  s.addEventListener('touchend', () => {
    if (y0 === null) return;
    y0 = null;
    if (!on) return;
    s.classList.remove('dragging');
    if (dy > 90) { const set = s.dataset.swipe === '1'; closeSheet(); if (set) toast('表示の設定を保存しました'); return; }
    s.classList.add('snap'); s.style.transform = '';
    setTimeout(() => s.classList.remove('snap'), 220);
  });
}
function setBase(name) {
  if (!map || baseName === name) return;
  map.removeLayer(baseLayers[baseName]);
  baseName = name;
  baseLayers[baseName].addTo(map);
  if (baseLayers.paleLow) { // 淡色地図のときだけ、下に「ぼやけた代わりの地図」を敷く
    if (name === 'pale') { baseLayers.paleLow.addTo(map); baseLayers.paleLow.bringToBack(); } else map.removeLayer(baseLayers.paleLow);
  }
}
function openUiSheet() {
  const tab = currentView;
  const paint = keep => {
    const top = keep ? $('#sheet').scrollTop : 0, det = UI.mode === 'detail';
    const seg = (key, opts, cur, cls) => `<div class="seg uiseg${cls ? ' ' + cls : ''}" role="group">${opts.map(([v, l]) =>
      `<button type="button" data-ui="${key}" data-v="${v}" aria-pressed="${(cur === undefined ? UI[key] : cur) === v}">${l}</button>`).join('')}</div>`;
    const sizeOpts = (det ? ['small', 'normal', 'large', 'xlarge'] : ['normal', 'large', 'xlarge']).map(k => [k, SIZES[k][1]]);
    const SAMPLE = 'あいう 区域マップ';
    if (det) Object.keys(FONTS).forEach(k => loadFont(k, SAMPLE + FONTS[k][1]));
    const pct = Math.round(zoomOf(uiEff()) * 100);
    const S_SIZE = det
      ? `<p class="q">文字の大きさ</p>
         <div class="zoomrow"><input type="range" id="uiPct" min="80" max="160" step="5" value="${pct}" aria-label="文字の大きさ（％）"><output id="uiPctOut">${pct}%</output></div>
         <div class="zoomprev" id="uiPctPrev" style="font-size:${18 * pct / 100}px">あいう 区域マップ 123</div>
         <div class="row"><button type="button" class="btn small" id="uiPct100">標準（100%）にもどす</button></div>`
      : seg('size', sizeOpts, uiEff().size, 'sizeseg');
    const S_TEXT = `<h3 class="sub">文字</h3>${det ? S_SIZE : `<p class="q">文字の大きさ</p>${S_SIZE}`}` + (det
      ? `<p class="q">文字の種類</p>
         <div class="fontgrid">${Object.entries(FONTS).map(([k, v]) =>
           `<button type="button" class="fontbtn" data-ui="font" data-v="${k}" aria-pressed="${UI.font === k}" style="font-family:${esc(fontStack(k))}"><span>${SAMPLE}</span><small>${v[1]}（${v[3]}）</small></button>`).join('')}</div>
         <p class="hint">手書きやポップの文字は、かわいい反面、読みにくいことがあります。数字や小さい文字が読みにくいときは「見やすいゴシック」にもどしてください。</p>
         <p class="q">文字や線のこさ</p>${seg('contrast', [['normal', '標準'], ['strong', 'くっきり']])}` : '');
    const S_FEAT = `<h3 class="sub feathead">使う機能</h3>
      <p class="hint">はじめは、区域を回って「会えた・留守」を記録するだけの、かんたんな形です。必要な機能だけ「使う」にしてください。</p>
      <div class="featrow"><p><b>奉仕時間</b><small>時間を残す・今月の目標と計画・月末の奉仕報告</small></p>${seg('fTime', [['off', '使わない'], ['on', '使う']])}</div>
      ${featTime() ? `<div class="featrow sub2"><p><b>タイマー</b><small>使う：「奉仕スタート」「奉仕終了」を押すだけで時間を記録します。月末の夜8時すぎには、奉仕報告の画面を出します。<br>使わない：ホームで、今日の時間を＋−で入れます</small></p>${seg('fTimer', [['on', '使う'], ['off', '使わない']], UI.fTimer || 'on')}</div>` : ''}
      <div class="featrow"><p><b>再訪問</b><small>会えたあとに「再訪問する」をえらぶと、メモを残して、下の「再訪問」タブで管理できます（メモは${memoSyncOn() ? '暗号化して、同じ人のほかの端末とも同じになります' : 'このスマホの中だけ'}）</small></p>${seg('fFollow', [['off', '使わない'], ['on', '使う']])}</div>
      <h3 class="sub">ホームに出すもの</h3>
      <div class="featrow"><p><b>毎日はじめのひと言</b><small>その日はじめて開いたときに、ひと言・今日の目標・今の時間帯におすすめの家を出します（まわりをさわると閉じます）</small></p>${seg('hello', [['on', '出す'], ['off', '出さない']], UI.hello || 'on')}</div>
      <div class="featrow"><p><b>今日やること</b><small>今日の集まり・自分の予定・再訪問の約束・区域カード・今がチャンスの留守宅カードを、ホームのいちばん上にまとめます</small></p>${seg('todayOn', [['off', '出さない'], ['on', '出す']])}</div>
      <h3 class="sub">区域カードに出すもの</h3>
      <div class="featrow"><p><b>進み具合</b><small>受け取ってから訪ねた家・部屋の数と、横のバー</small></p>${seg('cProg', [['off', '出さない'], ['on', '出す']])}</div>
      <div class="featrow"><p><b>今のおすすめ</b><small>今の時間帯に訪ねるとよい家の数</small></p>${seg('cReco', [['off', '出さない'], ['on', '出す']])}</div>
      <h3 class="sub">地図に出す名前</h3>
      <div class="featrow"><p><b>マンション・アパートの名前</b><small>はじめは、区域カードから地図を開いたときの大きさから出ます</small></p>${seg('aptName', [['off', '出さない'], ['on', '出す']])}
        ${UI.aptName === 'on' ? nameZoomSlider('aptZoom') : ''}</div>
      <div class="featrow"><p><b>学校・役所・お店などの名前</b><small>家の種別をえらんで、名前を入れた建物です</small></p>${seg('fcName', [['off', '出さない'], ['on', '出す']])}
        ${UI.fcName === 'on' ? nameZoomSlider('fcZoom') : ''}</div>
      ${UI.aptName === 'on' || UI.fcName === 'on' ? `<div class="featrow"><p><b>名前を出す範囲</b><small>「全体」にすると、区域をえらんでいるときも、ほかの区域の建物の名前が薄く出ます</small></p>${seg('nameScope', [['sel', 'えらんだ区域だけ'], ['all', '地図に見えている全体']], UI.nameScope || 'sel')}</div>` : ''}
      <h3 class="sub">奉仕の予定</h3>
      <div class="featrow"><p><b>予定の一覧</b><small>ホームの「奉仕の予定」で、カレンダーの下の一覧に出す予定</small></p>${seg('calList', [['upcoming', '今日から'], ['all', 'その月すべて']], UI.calList || 'upcoming')}</div>
      <h3 class="sub">家の画面に出すもの</h3>
      <div class="featrow"><p><b>これまで留守だった時間帯</b><small>「平日の朝・土日の昼に留守でした。ほかの時間帯に訪ねてみてください」の案内</small></p>${seg('cSlot', [['off', '出さない'], ['on', '出す']])}</div>`;
    // 地図の画面から開いたときは、地図の見た目（ふつうの地図／写真）をいちばん上に出す
    const S_BASE = tab === 'map' ? `<h3 class="sub feathead">地図の見た目</h3>
      <div class="choices two basepick">
        <button class="choice${baseName === 'pale' ? ' on' : ''}" data-ui="base" data-v="pale" aria-pressed="${baseName === 'pale'}"><i class="bprev pale"></i>地図</button>
        <button class="choice${baseName === 'photo' ? ' on' : ''}" data-ui="base" data-v="photo" aria-pressed="${baseName === 'photo'}"><i class="bprev photo"></i>写真<small>空から見た写真</small></button>
      </div>
      <p class="q">区域の線の色</p>
      <div class="linecolors">${Object.entries(TERR_COLORS).map(([k, v]) =>
        `<button type="button" class="lcbtn" data-ui="terrColor" data-v="${k}" aria-pressed="${(UI.terrColor || 'theme') === k}"><i style="background:${k === 'theme' ? accentColor() : v[0]}"></i>${v[1]}</button>`).join('')}</div>
      <p class="q">区域の線の太さ</p>${seg('terrWidth', [['thin', '細い'], ['normal', 'ふつう'], ['thick', '太い']], UI.terrWidth || 'normal')}
      ${rotSupported() ? `<p class="q">2本指で地図を回す</p>${seg('mapRot', [['on', '回せる'], ['off', '回さない']], UI.mapRot || 'on')}
      <p class="hint">2本の指でひねるように動かすと、地図の向きが変わります。右下の「北」のボタンで、北が上にもどります。</p>` : ''}` : '';
    let S_VIEW = `<h3 class="sub feathead">画面の見え方</h3>
      <div class="choices two">
        <button class="choice${det ? '' : ' on'}" data-ui="mode" data-v="simple" aria-pressed="${!det}">かんたん<small>文字の大きさだけ</small></button>
        <button class="choice${det ? ' on' : ''}" data-ui="mode" data-v="detail" aria-pressed="${det}">くわしく<small>色・文字・地図など</small></button>
      </div>`;
    if (!det) {
      S_VIEW += S_TEXT + `<p class="q">はじめの案内（使い方の動画のお知らせなど）</p>${seg('guide', [['auto', '最初の数日だけ'], ['on', 'いつも出す'], ['off', '出さない']], UI.guide || 'auto')}<p class="hint">「くわしく」にすると、テーマの色・文字の種類・地図の印の大きさなども、自分の好みに変えられます。</p>`;
    } else {
      const S_COLOR = `<h3 class="sub">テーマの色</h3>
        <p class="hint">上の帯・ボタン・区域の線や番号など、画面ぜんぶの色が変わります。</p>
        <div class="swatches">${Object.entries(THEMES).map(([k, v]) =>
          `<button type="button" class="swatch" data-ui="theme" data-v="${k}" aria-pressed="${UI.theme === k}" style="--c:${v[1]}"><i style="background:linear-gradient(135deg,${v[0]} 50%,${v[1]} 50%)"></i>${v[3]}</button>`).join('')}
          <button type="button" class="swatch custom" data-ui="theme" data-v="custom" aria-pressed="${UI.theme === 'custom'}"><i></i>じぶんの色</button></div>
        ${UI.theme === 'custom' ? `<div class="wheelbox">
          <div class="wheelpair">
            <div class="wheel" id="wheel" role="slider" aria-label="色をえらぶ円"><i id="wheelShade"></i><b id="wheelDot"></b></div>
            <div class="lbarcol"><small>明るい</small><div class="lbar" id="lbar" role="slider" tabindex="0" aria-label="明るさ" aria-valuemin="0" aria-valuemax="100"><b id="lbarDot"></b></div><small>暗い</small></div>
          </div>
          <div class="wheelprev"><div class="bar" id="wpBar">区域マップ</div><div class="soft" id="wpSoft">えらんでいる項目</div>
            <p class="wpacc"><i id="wpAcc"></i>区域の線・番号</p>
            <p class="hint">円で色あいを、右のバーで明るさをえらびます。バーのいちばん上は白、いちばん下は黒です。帯やボタンの文字は、読みやすいように自動で白か黒になります。</p></div>
        </div>` : ''}
        <p class="hint">地図の緑のチェック（訪ねた家）と、会えた・留守・拒否の色は変わりません。</p>`;
      const S_SCREEN = `<h3 class="sub">画面</h3>
        <p class="q">起動のあいさつ（「さぁ、奉仕に行こう！」）</p>${seg('splash', [['on', '出す'], ['off', '出さない']])}
        ${UI.splash !== 'off' ? `<div class="zoomrow"><input type="range" id="uiSplash" min="1" max="5" step="0.5" value="${UI.splashSec || 1.8}" aria-label="あいさつを出す時間（秒）"><output id="uiSplashOut">${UI.splashSec || 1.8}秒</output></div>
          <div class="row"><button type="button" class="btn small" id="uiSplashTry">ためしに見る</button></div>` : ''}
        <p class="q">はじめの案内（使い方の動画のお知らせ・「拡大すると家の印が出ます」など）</p>${seg('guide', [['auto', '最初の数日だけ'], ['on', 'いつも出す'], ['off', '出さない']])}
        <p class="q">ボタンの間隔</p>${seg('density', [['normal', 'ゆったり'], ['compact', 'コンパクト']])}
        <p class="q">説明の文</p>${seg('hints', [['show', '表示する'], ['hide', 'かくす']])}
        <p class="q">開いたときの画面</p>${seg('start', [['home', 'ホーム'], ['cards', '区域カード'], ['map', '地図']].concat(recoOn() ? [['reco', 'おすすめ']] : []))}`;
      const S_MAP = `<h3 class="sub">地図</h3>
        <p class="q">家の印の大きさ</p>${seg('pin', Object.entries(PINS).map(([k, v]) => [k, v[1]]))}
        <p class="q">自分の区域を回るときの表示</p>${seg('round', [['reco', 'おすすめ順'], ['progress', '進み具合']], me().roundMode || 'reco')}`;
      // ホーム画面のアイコンの絵は「ホーム画面に追加」の案内の中でえらぶ（2026.13.82。設定で変えてもホーム画面のアイコンは変わらないため）
      S_VIEW += (tab === 'map' ? [S_MAP, S_TEXT, S_COLOR, S_SCREEN] : tab === 'reco' || tab === 'cards' ? [S_TEXT, S_COLOR, S_SCREEN, S_MAP] : [S_TEXT, S_SCREEN, S_COLOR, S_MAP]).join('');
    }
    // 「画面の見え方」をいちばん上に（地図の画面では、地図の見た目のすぐ下）
    // ①の対応：説明文つきの通常の見出し（headHtml）ではなく、タイトルだけのコンパクトな見出しにして画面を広く使う。
    // 閉じる✕ボタンはこれまでと同じ場所・同じ動きのまま（スクロールしても上に固定）。
    // 帯（見出しの行）はなし。下にスワイプすると、設定を残して閉じる（小さな「×」と、いちばん下の「閉じる」でも閉じられる）
    let b = `<h2 id="sheetTitle" class="vh">設定</h2>` + (window.dougaSettingsRow ? dougaSettingsRow() : '') + (window.KI ? KI.picker(false) : '') + S_BASE + S_VIEW + S_FEAT;
    b += `<button class="btn block" id="uiReset">見え方を最初にもどす</button><button class="btn primary block" data-close>閉じる</button>`;
    // この端末で動いているアプリの版（更新が届いたかを、だれでも確かめられるように。2026-10-29）
    b += `<p class="muted appver" style="text-align:center;margin-top:12px;font-size:15px">区域マップ 版 ${esc(APP_VERSION)}</p>`; // hint は「説明を出さない」で消えるので使わない
    b = `<div class="grabrow"><span class="grab" aria-hidden="true"></span><button type="button" class="xmini" data-close aria-label="閉じる">×</button></div><p class="grabhint">下にスワイプすると、設定を残して閉じます</p>` + b;
    setSheet(b);
    $('#sheet').dataset.swipe = '1';
    if (keep) $('#sheet').scrollTop = top;
    if ($('#wheel')) bindWheel();
    if ($('#uiSplash')) {
      const rs = $('#uiSplash');
      rs.oninput = () => { $('#uiSplashOut').textContent = rs.value + '秒'; };
      rs.onchange = () => { UI.splashSec = Number(rs.value); uiSave(); };
      $('#uiSplashTry').onclick = () => { closeSheet(); splashAgain(true); };
    }
    $$('[data-nz]', $('#sheet')).forEach(r => {
      const k = r.dataset.nz;
      r.oninput = () => { $('#nzOut_' + k).textContent = nameZoomText(Number(r.value)); };
      r.onchange = () => { UI[k] = Number(r.value); uiSave(); renderHouses(); };
    });
    if ($('#uiPct')) {
      const rg = $('#uiPct');
      // 動かしている間は見本だけを変え、指をはなしたら画面全体に反映する（操作中に画面が動かないように）
      rg.oninput = () => { $('#uiPctOut').textContent = rg.value + '%'; $('#uiPctPrev').style.fontSize = (18 * rg.value / 100) + 'px'; };
      rg.onchange = () => { UI.pct = Number(rg.value); uiSave(); applyUi(); };
      $('#uiPct100').onclick = () => { UI.pct = 100; uiSave(); applyUi(); paint(true); };
    }
    $$('[data-ui]', $('#sheet')).forEach(x => x.onclick = async () => {
      const k = x.dataset.ui, v = x.dataset.v;
      if (k === 'round') { me().roundMode = v; Store.save(); renderHouses(); paint(true); return; }
      if (k === 'fFollow' && v === 'off' && featFollow()) {
        const n = Object.values(D().follows).filter(f => f.by === me().id).length;
        if (n && !await ask(`受け持っている再訪問が${n}件あります。\n「使わない」にするとリストは見えなくなりますが、受け持ちは残ります（ほかの人は訪問を控えたままです）。\n受け持ちをやめる場合は、先にリストから外してください。\n「使わない」にしますか？`)) return;
      }
      if (k === 'fTime' || k === 'fFollow') {
        UI[k] = v; uiSave(); applyUi(); updateTabs(); renderAll(); paint(true);
        toast(`${k === 'fTime' ? '奉仕時間' : '再訪問'}を${v === 'on' ? '使うようにしました' : '使わないようにしました'}`);
        return;
      }
      UI[k] = v;
      if (k === 'theme' && v === 'custom' && !UI.custom) UI.custom = '200,70,35';
      uiSave(); applyUi();
      if (k === 'base') setBase(v);
      if (k === 'cProg' || k === 'cReco') renderAll();
      if (k === 'terrColor' || k === 'terrWidth') renderTerrs();
      if (k === 'mapRot') applyRotSetting();
      if (k === 'aptName' || k === 'fcName' || k === 'pin' || k === 'nameScope') renderHouses();
      if (k === 'calList' || k === 'todayOn' || k === 'fTimer') renderHome();
      paint(k !== 'mode');
    });
    $('#uiReset').onclick = async () => {
      if (!await ask('画面の見え方を、最初の状態にもどします（「使う機能」はそのままです）。よろしいですか？')) return;
      UI = Object.assign({}, UI_DEFAULT, { fTime: UI.fTime, fTimer: UI.fTimer, hello: UI.hello, fFollow: UI.fFollow, cProg: UI.cProg, cReco: UI.cReco, todayOn: UI.todayOn, icon: UI.icon, iconText: UI.iconText, appName: UI.appName }); uiSave(); applyUi(); setBase('pale'); applyRotSetting(); // 使う機能・区域カードに出すもの・ホーム画面のアイコンはそのまま
      toast('表示の設定を最初にもどしました');
      paint(false);
    };
  };
  paint(false);
}

/* ---------- 検証用のダミーデータ（おすすめや印の出かたを確かめる） ---------- */
const dummyTerrs = () => D().territories.filter(t => t.dummy);
const dummyTerr = () => dummyTerrs()[0];
const dummyCards = () => D().awayCards.filter(c => c.dummy);
const uidRand = () => Math.random().toString(36).slice(2, 7);
const BAND_HOUR = { 朝: 9, 昼: 12, 午後: 15, 夕方: 18, 夜: 20 };
function dateAtSlot(slot, daysAgo) {
  const [dt, b] = slot.split('・');
  const d = new Date(Date.now() - daysAgo * DAY);
  while (dayTypeOf(d) !== dt) d.setDate(d.getDate() - 1);
  d.setHours(BAND_HOUR[b], 15, 0, 0);
  while (d.getTime() > Date.now()) d.setDate(d.getDate() - 7);
  return d.toISOString();
}
/* 検証する人をえらぶ
   ・年代や★は、区域の担当者にしか見えない（本番のサーバーでも隠す）ため、1人に1つずつ検証用の区域（Z1〜）を作る
   ・だれでも留守宅カードを受け取れる共通の区域（Z0）も作る。どの時間帯でも合う家を入れる */
function addDummy() {
  if (dummyTerrs().length) { openDummyGuide(); return; }
  const users = D().users.filter(u => !u.inactive).slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  setSheet(headHtml(null, '検証用のダミーを入れる', '') + `
    ${LIVE ? '<div class="notice warn"><b>本番のデータに入ります。</b>地図や係の画面の集計にも入るので、確かめ終わったら「ダミーを消す」で消してください。</div>' : ''}
    <p class="q">検証する人をえらぶ（8人まで）</p>
    <label class="field"><span>名前でさがす</span><input type="text" id="dmQ" placeholder="名前の一部を入れる" autocomplete="off"></label>
    <div id="dmList">${users.map(u => `<label class="check" data-name="${esc(u.name)}"><input type="checkbox" data-dm="${esc(u.id)}"${u.id === me().id ? ' checked' : ''}>${esc(u.name)}${u.role === 'admin' ? '（区域係）' : ''}</label>`).join('')}</div>
    <p class="hint">えらんだ人ごとに、その人が担当する検証用の区域（Z1〜）を作ります。年代や★は区域の担当者にしか見えない仕組みなので、1人に1区域です。<br>
      ほかに、だれでも留守宅カードを受け取れる共通の区域（Z0）を作ります。Z0と各自の区域には、どの時間帯でも留守宅カードが出るように、時間帯をずらした留守の家を入れます。</p>
    <button class="btn primary block" id="dmGo">えらんだ人のダミーを入れる</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#dmQ').oninput = e => { const q = e.target.value.trim(); $$('#dmList [data-name]').forEach(l => { l.hidden = !!q && !l.dataset.name.includes(q); }); };
  $('#dmList').onchange = e => { if (e.target.checked && $$('#dmList input:checked').length > 8) { e.target.checked = false; toast('8人までです'); } };
  $('#dmGo').onclick = () => {
    const ids = $$('#dmList input:checked').map(x => x.dataset.dm);
    if (!ids.length) { toast('検証する人をえらんでください'); return; }
    closeSheet();
    createDummy(ids);
  };
}
function createDummy(testers) {
  const now = Date.now(), iso = ms => new Date(ms).toISOString(), mine = me().id;
  const cur = slotOf(new Date()), others = SLOTS.filter(x => x !== cur), o1 = others[0], o2 = others[4];
  // 場所：今ある区域の東どなりに、3列で並べる（家を区域に入れ直さないので、ほかの家には影響しない）
  const all = polyTerrs().filter(t => !t.dummy).flatMap(t => t.polygon);
  const lat0 = all.length ? Math.max(...all.map(q => q[0])) - 0.0036 : HOME_VIEW[0] - 0.0018;
  const lng0 = all.length ? Math.max(...all.map(q => q[1])) + 0.0008 : HOME_VIEW[1] - 0.0022;
  const H = 0.0036, W = 0.0045, G = 0.0004;
  const box = i => {
    const la = lat0 - Math.floor(i / 3) * (H + G), ln = lng0 + (i % 3) * (W + G);
    return { poly: [[la, ln], [la, ln + W], [la + H, ln + W], [la + H, ln]], pos: j => [la + H * (0.12 + 0.76 * Math.floor(j / 6) / 3), ln + W * (0.08 + 0.84 * (j % 6) / 5)] };
  };
  const terrs = [], houses = [], visits = [], dnc = {}, follows = {}, released = {};
  const once = { age: 'それ以外', interest: '再訪問しない' }, star = { age: 'それ以外', interest: '再訪問したい' };
  const addHouse = (tid, pos, label, apt) => {
    const hid = 'zz_' + uid() + uidRand();
    houses.push({ id: hid, terrId: tid, type: apt ? 'apt' : 'house', lat: pos[0], lng: pos[1], label, units: apt ? Object.keys(apt) : [], createdAt: iso(now - 400 * DAY), createdBy: mine });
    return hid;
  };
  const addV = (hid, unit, [res, at, ex], by) => {
    const x = ex || {};
    const v = { id: uid() + uidRand(), houseId: hid, unit, result: res, at, by: LIVE ? mine : (x.by || by) };
    if (x.age && res !== 'away') v.age = x.age;
    if (res === 'met' && x.interest) v.interest = x.interest;
    visits.push(v);
  };
  // どの時間帯でも留守宅カードになる家：10の時間帯を、家ごとにずらして1〜2回ずつ留守にする
  const spread = (tid, b, startJ, n, prefix) => {
    for (let j = 0; j < n; j++) {
      const hid = addHouse(tid, b.pos(startJ + j), `${prefix}${String(j + 1).padStart(2, '0')} 留守（${slotShort(SLOTS[j % 10])}）`);
      addV(hid, '', ['away', dateAtSlot(SLOTS[j % 10], 12 + j * 3)], mine);
      if (j % 3 === 0) addV(hid, '', ['away', dateAtSlot(SLOTS[(j + 5) % 10], 40 + j)], mine);
    }
  };
  // 共通の区域 Z0：担当者なし・回り終えた記録あり → だれでも留守宅カードを受け取れる
  const b0 = box(0), t0 = 'tzz' + uid() + uidRand();
  terrs.push({ id: t0, no: 'Z0', name: '【検証用】みんなの留守宅', dummy: true, helpers: [], polygon: b0.poly, holder: null, lentAt: null, free: false, completedAt: iso(now - 30 * DAY) });
  spread(t0, b0, 0, 20, '共通');
  // 1人に1区域
  const other = LIVE ? mine : ((D().users.find(u => !testers.includes(u.id)) || D().users.find(u => u.id !== testers[0]) || me()).id);
  testers.forEach((owner, i) => {
    const b = box(i + 1), tid = 'tzz' + uid() + uidRand(), no = 'Z' + (i + 1);
    terrs.push({ id: tid, no, name: `【検証用】${uname(owner)}さん`, dummy: true, helpers: [], polygon: b.poly,
      holder: owner, lentAt: iso(now - 20 * DAY), completedAt: iso(now - 60 * DAY) });
    const SC = [
      { l: '検証01 はじめての家' }, { l: '検証02 はじめての家' },
      { l: '検証03 留守2回・今の時間はまだ', v: [['away', dateAtSlot(o1, 35)], ['away', dateAtSlot(o2, 45)]] },
      { l: '検証04 作ったときの時間帯は留守', v: [['away', dateAtSlot(cur, 28)]] },
      { l: '検証05 作ったときの時間帯に会えた', v: [['met', dateAtSlot(cur, 50), once]] },
      { l: '検証06 ★また訪ねたい', v: [['met', dateAtSlot(o1, 40), { age: '若い世代', interest: '再訪問したい' }]] },
      { l: '検証07 若い世代', v: [['met', dateAtSlot(o2, 70), { age: '若い世代', interest: '再訪問しない' }]] },
      { l: '検証08 引き継ぎ待ち', v: [['met', dateAtSlot(o1, 32), Object.assign({ by: other }, star)]], released: true },
      { l: '検証09 自分の受け持ち3週間', v: [['met', iso(now - 35 * DAY), star]], follow: 25 },
      { l: '検証10 自分の受け持ち6週間', v: [['met', iso(now - 45 * DAY), star]], follow: 45 },
      { l: '検証11 最近会えた（青）', v: [['met', iso(now - 25 * DAY), once]] },
      { l: '検証12 今回会えた（緑）', v: [['met', iso(now - 5 * DAY), once]] },
      { l: '検証13 今回留守（緑）', v: [['away', iso(now - 3 * DAY - 3600000)]] },
      { l: '検証14 拒否', v: [['refused', dateAtSlot(o1, 90), { age: 'それ以外' }]], dnc: true },
      { l: '検証15 どの時間帯も留守', v: SLOTS.map((x, k) => ['away', dateAtSlot(x, 30 + k * 7)]) },
      { l: '検証16 10分前にほかの人', v: [['away', iso(now - 10 * 60000), { by: other }]] },
      { l: '検証アパート', apt: {
        '101': [], '102': [['away', dateAtSlot(o1, 35)]], '103': [['met', dateAtSlot(cur, 50), once]],
        '201': [['refused', dateAtSlot(o2, 90), { age: 'それ以外' }]], '202': [['away', dateAtSlot(cur, 28)]],
        '203': [['met', dateAtSlot(o2, 40), star]] }, aptDnc: ['201'] }
    ];
    SC.forEach((sc, j) => {
      const hid = addHouse(tid, b.pos(j), sc.l, sc.apt);
      if (sc.apt) {
        Object.entries(sc.apt).forEach(([u, list]) => list.forEach(e => addV(hid, u, e, owner)));
        (sc.aptDnc || []).forEach(u => { dnc[K(hid, u)] = true; });
        return;
      }
      (sc.v || []).forEach(e => addV(hid, '', e, owner));
      const k = K(hid, '');
      if (sc.dnc) dnc[k] = true;
      if (sc.follow) follows[k] = { by: owner, since: iso(now - 60 * DAY), touchedAt: iso(now - sc.follow * DAY) };
      if (sc.released) released[k] = { at: iso(now - 5 * DAY), reason: 'handoff' };
    });
    spread(tid, b, SC.length, 6, '検証'); // 各自の区域にも、時間帯をずらした留守の家
  });
  let cardN = 0;
  commit(`検証用の区域 ${terrs.length}つと家 ${houses.length}件を入れました`, () => {
    D().territories.push(...terrs);
    D().houses.push(...houses);
    D().visits.push(...visits);
    Object.assign(D().dnc, dnc); Object.assign(D().follows, follows); Object.assign(D().released, released);
    buildIndex();
    cardN = makeDummyAwayCards(testers);
  });
  openDummyGuide();
  if (cardN) setTimeout(() => toast(`留守宅カードの見本も ${cardN}枚 作りました`), 7500);
}
/* 留守宅カードの見本：検証する人ごとに1枚（家は3軒だけにして、ほかの家は自分で受け取れるように残す） */
function makeDummyAwayCards(testers) {
  const now = Date.now(), iso = ms => new Date(ms).toISOString();
  let n = 0;
  testers.forEach(who => {
    if (activeCards().filter(c => c.by === who).length >= D().settings.awayMax) return;
    const own = D().territories.find(t => t.dummy && t.holder === who);
    const x = awaySuggestions(who, SLOTS).find(s => own && s.t.id === own.id);
    if (!x) return;
    const c = { id: 'c' + who + uidRand(), terrId: x.t.id, slot: x.slot, by: who, at: iso(now - 2 * DAY),
      expiresAt: iso(now + (D().settings.awayDays - 2) * DAY), keys: x.keys.slice(0, 3), dummy: true, dv: [] };
    D().awayCards.push(c); n++;
    const [hid, unit] = parseKey(c.keys[0]); // 1軒は訪ねた家（緑のチェック）にして、進み具合も見られるようにする
    const v = { id: uid() + 'dv' + uidRand(), houseId: hid, unit, result: 'away', at: iso(now - 3600000), by: LIVE ? me().id : who };
    D().visits.push(v); c.dv.push(v.id);
  });
  return n;
}
function openDummyGuide(tid) {
  const ts = dummyTerrs();
  if (!ts.length) { if (dummyCards().length) toast('検証用の区域はありません。留守宅カードの見本だけ残っています'); return; }
  const mineT = ts.find(t => t.id === tid) || ts.find(t => t.holder === me().id);
  const shared = ts.find(t => !t.holder);
  const cur = slotShort(slotOf(new Date()));
  setSheet(headHtml(mineT || null, '検証用データの確かめ方', `今は${cur}です（おすすめは時間帯で変わります）`) + `
    ${isAdmin() ? `<h3 class="sub">作った区域</h3><p>${ts.map(t => `・区域${esc(t.no)}：${t.holder ? `${esc(uname(t.holder))}さんの担当` : 'だれでも留守宅カードを受け取れる共通の区域'}`).join('<br>')}</p>` : ''}
    <div class="notice info">${mineT ? `あなたの検証用の区域は<b>区域${esc(mineT.no)}</b>です（20日前に受け取った区域として入れてあります）。` : 'あなたの検証用の区域はありません。共通の区域Z0で留守宅カードを確かめられます。'}家の目印に「検証01」などの番号が付いています。</div>
    <h3 class="sub">おすすめ画面</h3>
    <p>・留守宅カード：<b>どの時間帯でも</b>、自分の区域と区域Z0のカードが出ます（行ける時間を全部にすると、時間帯ごとに並びます）。受け取れるのは2枚までで、見本が1枚入っています。</p>
    <p>・引き継ぎを待っている家：各区域の08（だれにでも表示）<br>・★ また訪ねたい家：自分の区域の06・アパート203<br>・若い世代：自分の区域の07<br>
      <span class="muted">★や年代は、区域の担当者にしか見えません。ほかの人の区域の06・07は、ほかの人には出ません。</span></p>
    <h3 class="sub">地図（自分の区域をひらく）</h3>
    <p>・白い丸：01・02ほか　・緑のチェック：12・13・16（今回訪ねた家）<br>・青いチェック：11　・赤い「拒」：14　・「再」の札：09・10<br>・16をタップすると「10分前に、ほかの人が記録しています」と出ます${LIVE && isAdmin() ? '（区域係が作った記録なので、区域係本人には出ません）' : ''}。</p>
    <h3 class="sub">区域カード画面</h3>
    <p>・あなたの再訪問：09（しばらく訪問なし）・10（確認が必要）。「地図で見る」で、目印の動きと、記録とメモの確認画面を確かめられます。</p>
    ${isAdmin() ? `<h3 class="sub">係の画面</h3><p>・なかなか会えない家：各区域の15<br>・取り残し：06・08・アパート203<br>・確認が必要な受け持ち：各区域の10<br>・留守宅の状況：区域ごとの「使用中のカード」</p>
      <p class="hint">確かめ終わったら、係の画面の「データ」にある「ダミーを消す」で、検証用の区域・家・記録・留守宅カードをまとめて消せます。</p>` : ''}
    <div class="actions">${mineT ? `<button class="btn primary" id="dgMap">区域${esc(mineT.no)}の地図をひらく</button>` : ''}<button class="btn" id="dgReco">おすすめを見る</button></div>
    <button class="btn block" data-close>閉じる</button>`);
  if ($('#dgMap')) $('#dgMap').onclick = () => { closeSheet(); openTerr(mineT.id); };
  $('#dgReco').onclick = () => { closeSheet(); showView('reco'); };
}
async function delDummy() {
  const ts = dummyTerrs(), cards = dummyCards();
  if (!ts.length && !cards.length) return;
  if (!await ask(`検証用の区域 ${ts.length}つと、家・訪問記録・留守宅カードのダミーをすべて消します。よろしいですか？`)) return;
  commit('検証用のデータを消しました', () => {
    const dv = new Set(cards.flatMap(c => c.dv || []));
    if (dv.size) D().visits = D().visits.filter(v => !dv.has(v.id));
    D().awayCards = D().awayCards.filter(c => !c.dummy);
    ts.forEach(t => deleteTerrData(t.id, true));
  });
}
function renderDummy() {
  if (LIVE && !(window.KUIKI_CONFIG && window.KUIKI_CONFIG.devTools)) { $('#adDummy').innerHTML = ''; return; } // 配布パックの本番では、検証用のダミーは出さない（config.js の devTools: true で出る）
  const has = dummyTerrs().length || dummyCards().length;
  $('#adDummy').innerHTML = `<div class="setrow"><span>検証用のダミーデータ<br><small class="hint">おすすめ・留守宅カード・地図の印の出かたを、何人かで確かめるためのデータです。えらんだ人ごとに検証用の区域を作り、だれでも使える共通の区域も作ります。${LIVE ? '<b>本番のデータに入ります。</b>確かめ終わったら消してください。' : ''}</small></span>
    <div class="actions">${has
      ? '<button type="button" class="btn small" data-dummy="guide">確かめ方を見る</button><button type="button" class="btn small danger" data-dummy="del">ダミーを消す</button>'
      : '<button type="button" class="btn small primary" data-dummy="add">ダミーを入れる</button>'}</div></div>`;
}

/* ---------- QRコードを自分で作る（バイトモード・誤り訂正M／長いときはL、バージョン1〜10） ----------
   外部の部品を使わずに作れるように、必要な分だけを実装しています。 */
const QR = (() => {
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
  function genPoly(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const r = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) { r[j] ^= mul(p[j], 1); r[j + 1] ^= mul(p[j], EXP[i]); }
      p = r;
    }
    return p;
  }
  function ecBytes(data, n) {
    const gen = genPoly(n), res = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) {
      const f = res[i];
      if (!f) continue;
      for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], f);
    }
    return res.slice(data.length);
  }
  // [誤り訂正の数, [[ブロック数, 1ブロックのデータ数], ...]]
  const RS = {
    L: [null, [7, [[1, 19]]], [10, [[1, 34]]], [15, [[1, 55]]], [20, [[1, 80]]], [26, [[1, 108]]],
      [18, [[2, 68]]], [20, [[2, 78]]], [24, [[2, 97]]], [30, [[2, 116]]], [18, [[2, 68], [2, 69]]]],
    M: [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
      [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]]
  };
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const EC_BITS = { L: 1, M: 0 };
  const dataCount = (v, lv) => RS[lv][v][1].reduce((a, g) => a + g[0] * g[1], 0);
  const capacity = (v, lv) => dataCount(v, lv) - (v >= 10 ? 3 : 2);

  function utf8(str) {
    const out = [];
    for (const ch of unescape(encodeURIComponent(str))) out.push(ch.charCodeAt(0));
    return out;
  }
  function bitsOf(bytes, v, lv) {
    const total = dataCount(v, lv) * 8;
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4);                       // バイトモード
    push(bytes.length, v >= 10 ? 16 : 8);
    bytes.forEach(b => push(b, 8));
    for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0); // 終端
    while (bits.length % 8) bits.push(0);
    const pads = [0xEC, 0x11];
    for (let i = 0; bits.length < total; i++) push(pads[i % 2], 8);
    const codes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      codes.push(b);
    }
    return codes;
  }
  function interleave(codes, v, lv) {
    const [ecn, groups] = RS[lv][v];
    const blocks = [];
    let at = 0;
    groups.forEach(([n, len]) => {
      for (let i = 0; i < n; i++) { const d = codes.slice(at, at + len); at += len; blocks.push({ d, e: ecBytes(d, ecn) }); }
    });
    const out = [];
    const maxD = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxD; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecn; i++) blocks.forEach(b => out.push(b.e[i]));
    return out;
  }
  function build(v, codes) {
    const size = v * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null)); // null＝まだ
    const put = (r, c, val) => { if (r >= 0 && c >= 0 && r < size && c < size) m[r][c] = val; };
    const finder = (r, c) => {
      for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
        const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 &&
          (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
        put(r + i, c + j, on ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { m[6][i] = i % 2 === 0 ? 1 : 0; m[i][6] = i % 2 === 0 ? 1 : 0; }
    const cs = ALIGN[v];
    cs.forEach(r => cs.forEach(c => {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) return;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        put(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0);
      }
    }));
    m[size - 8][8] = 1; // かならず黒にする点
    // 形式・バージョンの場所を空けておく
    for (let i = 0; i <= 8; i++) { if (m[8][i] === null) m[8][i] = 0.5; if (m[i][8] === null) m[i][8] = 0.5; }
    for (let i = 0; i < 8; i++) { if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0.5; if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0.5; }
    if (v >= 7) {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { m[size - 11 + j][i] = 0.5; m[i][size - 11 + j] = 0.5; }
    }
    // データを右下からジグザグに置く
    let bi = 0;
    const bit = () => {
      const b = bi < codes.length * 8 ? (codes[bi >> 3] >> (7 - (bi & 7))) & 1 : 0;
      bi++; return b;
    };
    let up = true;
    for (let c = size - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (let n = 0; n < size; n++) {
        const r = up ? size - 1 - n : n;
        for (const cc of [c, c - 1]) {
          if (m[r][cc] === null) m[r][cc] = { d: bit(), r, c: cc };
        }
      }
      up = !up;
    }
    return { m, size };
  }
  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    r => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];
  function formatBits(lv, mask) {
    let v = (EC_BITS[lv] << 3) | mask;
    let d = v << 10;
    for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10);
    return ((v << 10) | d) ^ 0x5412;
  }
  function versionBits(v) {
    let d = v << 12;
    for (let i = 17; i >= 12; i--) if ((d >> i) & 1) d ^= 0x1F25 << (i - 12);
    return (v << 12) | d;
  }
  function penalty(g, size) {
    let p = 0;
    const run = line => {
      let n = 1;
      for (let i = 1; i < size; i++) {
        if (line[i] === line[i - 1]) n++;
        else { if (n >= 5) p += n - 2; n = 1; }
      }
      if (n >= 5) p += n - 2;
    };
    for (let r = 0; r < size; r++) run(g[r]);
    for (let c = 0; c < size; c++) run(g.map(row => row[c]));
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const a = g[r][c];
      if (a === g[r][c + 1] && a === g[r + 1][c] && a === g[r + 1][c + 1]) p += 3;
    }
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const has = (arr, i) => pat.every((v, j) => arr[i + j] === v);
    const rev = pat.slice().reverse();
    const has2 = (arr, i) => rev.every((v, j) => arr[i + j] === v);
    for (let r = 0; r < size; r++) for (let c = 0; c + 11 <= size; c++) { if (has(g[r], c) || has2(g[r], c)) p += 40; }
    for (let c = 0; c < size; c++) {
      const col = g.map(row => row[c]);
      for (let r = 0; r + 11 <= size; r++) { if (has(col, r) || has2(col, r)) p += 40; }
    }
    let dark = 0;
    g.forEach(row => row.forEach(v => { if (v) dark++; }));
    p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return p;
  }
  /* テキストからQRの白黒の表（true＝黒）を作る */
  function matrix(text) {
    const bytes = utf8(text);
    let lv = 'M', v = 0;
    for (let i = 1; i <= 10; i++) if (bytes.length <= capacity(i, 'M')) { v = i; break; }
    if (!v) { lv = 'L'; for (let i = 1; i <= 10; i++) if (bytes.length <= capacity(i, 'L')) { v = i; break; } }
    if (!v) throw new Error('long');
    const codes = interleave(bitsOf(bytes, v, lv), v, lv);
    const { m, size } = build(v, codes);
    let best = null;
    for (let mk = 0; mk < 8; mk++) {
      const g = m.map(row => row.map(cell => {
        if (cell === null) return 0;
        if (typeof cell === 'object') return MASKS[mk](cell.r, cell.c) ? cell.d ^ 1 : cell.d;
        return cell === 0.5 ? 0 : cell;
      }));
      const f = formatBits(lv, mk);
      const fb = [];
      for (let i = 14; i >= 0; i--) fb.push((f >> i) & 1); // 上の位から
      const posA = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
      const posB = [[size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
        [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]];
      fb.forEach((b2, i) => { g[posA[i][0]][posA[i][1]] = b2; g[posB[i][0]][posB[i][1]] = b2; });
      g[size - 8][8] = 1;
      if (v >= 7) {
        const vb = versionBits(v);
        for (let i = 0; i < 18; i++) {
          const b = (vb >> i) & 1, r = Math.floor(i / 3), c = i % 3;
          g[size - 11 + c][r] = b; g[r][size - 11 + c] = b;
        }
      }
      const p = penalty(g, size);
      if (!best || p < best.p) best = { p, g };
    }
    return best.g.map(row => row.map(v2 => !!v2));
  }
  /* canvas に描く（まわりの白い余白もつける） */
  function draw(canvas, text, px) {
    const g = matrix(text), n = g.length, q = 4, size = (n + q * 2) * (px || 6);
    const s = (px || 6);
    canvas.width = size; canvas.height = size;
    const x = canvas.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
    x.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c]) x.fillRect((c + q) * s, (r + q) * s, s, s);
    return size;
  }
  return { matrix, draw };
})();

/* QRを大きく見せる画面（集会などで、その場で読み取ってもらう） */
function openQrSheet(title, sub, url, opts) {
  const o = opts || {};
  setSheet(headHtml(null, title, sub) + `
    <div class="qrbox"><canvas id="qrCv" aria-label="QRコード"></canvas></div>
    <p class="hint qrnote">${o.note || 'スマホのカメラでこのQRを読み取ると、この画面がひらきます。'}</p>
    <div class="linkbox"><input type="text" id="qrUrl" readonly value="${esc(url)}" aria-label="リンク"><button class="btn small" id="qrCopy">コピー</button></div>
    ${o.extra || ''}
    <button class="btn block" data-close>閉じる</button>`);
  try {
    QR.draw($('#qrCv'), url, 8);
  } catch (e) {
    $('#qrCv').parentNode.innerHTML = '<p class="muted">QRを作れませんでした。下のリンクをコピーして渡してください。</p>';
  }
  $('#qrCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
    catch (e) { $('#qrUrl').select(); toast('リンクを選びました。長押しでコピーしてください'); }
  };
}

/* ---------- 係の画面：スマホの承認と共通リンク（本番のときだけ） ---------- */
const devState = { list: null, joinUrl: '', at: 0, busy: false, sig: '' };
let qrWatching = false; // 共通リンクのQRを見せているあいだは、読み取った人をすぐ出す
const devFast = () => qrWatching || (currentView === 'admin' && adPane === 'inbox' && !document.hidden);
const devPending = () => (devState.list || []).filter(d => d.status === 'pending');
async function fetchDevices(force) {
  if (!LIVE || !isAdmin() || devState.busy) return;
  if (!force && Date.now() - devState.at < (devFast() ? 3500 : 60000)) return;
  devState.busy = true;
  let changed = false;
  try {
    const j = await api('devices');
    devState.list = j.devices || []; devState.joinUrl = j.joinUrl || ''; devState.at = Date.now();
    const sig = JSON.stringify(devState.list);
    changed = sig !== devState.sig; devState.sig = sig;
  } catch (e) { /* 次の機会に */ }
  finally { devState.busy = false; }
  if (!changed && !force) return;
  if (currentView === 'admin') { renderDevices(); renderInbox(); }
  renderQrPending();
  updateAdminBadge();
}
async function deviceAction(action, extra, okMsg) {
  try {
    const j = await api(action, extra);
    devState.list = j.devices || []; devState.joinUrl = j.joinUrl || ''; devState.at = Date.now();
    toast(okMsg);
  } catch (e) {
    toast(e.code === 'state' ? 'すでにほかの区域係が決めています' : e.code === 'user' ? 'その人は登録できません' : '通信できませんでした。もう一度ためしてください');
    devState.at = 0; fetchDevices(true);
  }
  renderDevices(); renderQrPending(); updateAdminBadge();
}
function renderDevices() {
  const box = $('#adDevices');
  if (!LIVE) { box.innerHTML = ''; return; }
  if (!devState.list) { box.innerHTML = '<p class="muted">スマホの登録の状況を読み込んでいます…</p>'; return; }
  const pend = devPending(), act = devState.list.filter(d => d.status === 'active');
  const actCount = uid => act.filter(d => d.uid === uid).length;
  let html = '';
  if (pend.length) {
    html += `<h2 class="sec">スマホの登録の申し込み（${pend.length}件）</h2>
      <p class="hint">本人のスマホに出ている番号と同じか、声をかけて確かめてから登録してください。</p>` + pend.map(d => {
      if (!d.uid) return `<article class="devrow newdev"><p><b style="font-size:20px">新しいスマホ</b>　${esc(d.label)}　番号 <b class="devcode">${esc(d.code || '')}</b></p>
        ${d.hint ? `<p>名乗った名前：<b>${esc(d.hint)}</b></p>` : ''}
        <p class="muted">${fmtDate(d.reqAt)}にQRを読み取り</p>
        <div class="actions"><button class="btn small primary" data-devreg="${esc(d.id)}">使う人を決めて登録</button>
          <button class="btn small" data-dev="deny" data-id="${esc(d.id)}">見送る</button></div></article>`;
      const n = actCount(d.uid);
      return `<article class="devrow"><p><b style="font-size:20px">${esc(d.name)}さん</b>　${esc(d.label)}</p>
        <p class="muted">${fmtDate(d.reqAt)}に申し込み</p>
        ${n ? `<p class="tag-warn">この人は、すでに${n}台のスマホを使っています。本人に確認してください</p>` : ''}
        <div class="actions"><button class="btn small primary" data-dev="approve" data-id="${esc(d.id)}">承認する</button>
          <button class="btn small" data-dev="deny" data-id="${esc(d.id)}">見送る</button></div></article>`;
    }).join('');
  }
  html += `<details class="more"><summary>共通リンクと、登録済みのスマホ（${act.length}台）</summary>
    <h3 class="sub">共通リンク</h3>
    ${devState.joinUrl ? `<div class="linkbox"><input type="text" id="joinUrl" readonly value="${esc(devState.joinUrl)}" aria-label="共通リンク"><button class="btn small" id="joinCopy">コピー</button></div>
      <p class="hint">会衆の全員に同じリンクを配れます。名前をえらんだあと、ここで承認したスマホだけが使えます。リンクが外に広まったときは「作り直す」を押してください（登録済みのスマホは、そのまま使えます）。</p>
      <div class="row"><button class="btn small primary" id="joinQr">QRで見せる</button>
        <button class="btn small danger" id="joinReset">共通リンクを作り直す</button></div>`
      : '<p class="muted">共通リンクがまだありません。スプレッドシートのメニュー「区域マップ」→「共通リンクを表示」で作れます。</p>'}
    <h3 class="sub">登録済みのスマホ</h3>
    <p class="hint">スマホをなくした・替えた・使わなくなった人は「使えなくする」を押してください。そのスマホの区域の情報は、次に開いたときに消えます。</p>
    ${act.length ? act.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(d => `<article class="devrow">
      <p><b>${esc(d.name)}さん</b>　${esc(d.label)}</p>
      <p class="muted">${d.decAt ? `${fmtDay(d.decAt)}に承認` : ''}${d.seen ? `　最後に使った日 ${fmtDay(d.seen)}` : ''}</p>
      <div class="actions"><button class="btn small danger" data-dev="revoke" data-id="${esc(d.id)}">使えなくする</button></div></article>`).join('')
      : '<p class="muted">共通リンクから登録したスマホは、まだありません。</p>'}
  </details>`;
  const open = box.querySelector('details') && box.querySelector('details').open;
  box.innerHTML = html;
  if (open) box.querySelector('details').open = true;
  $$('[data-devreg]', box).forEach(b => b.onclick = () => openDevRegister(b.dataset.devreg, null));
  $$('[data-dev]', box).forEach(b => b.onclick = async () => {
    const dec = b.dataset.dev, d = devState.list.find(x => x.id === b.dataset.id);
    if (!d) return;
    if (dec === 'deny' && !await ask(`${d.name ? d.name + 'さんの' : 'このスマホの'}申し込みを見送ります。よろしいですか？`)) return;
    if (dec === 'revoke' && !await ask(`${d.name}さんのスマホ（${d.label}）を使えなくします。よろしいですか？`)) return;
    b.disabled = true;
    deviceAction('device_decide', { id: d.id, decision: dec },
      dec === 'approve' ? `${d.name}さんのスマホを承認しました` : dec === 'deny' ? '申し込みを見送りました' : 'スマホを使えなくしました');
  });
  if ($('#joinCopy')) $('#joinCopy').onclick = async () => {
    const v = $('#joinUrl').value;
    try { await navigator.clipboard.writeText(v); toast('共通リンクをコピーしました'); }
    catch (e) { $('#joinUrl').select(); toast('リンクを選びました。長押しでコピーしてください'); }
  };
  if ($('#joinQr')) $('#joinQr').onclick = openJoinQr;
  if ($('#joinReset')) $('#joinReset').onclick = async () => {
    if (!await ask('今の共通リンクでは、新しい申し込みができなくなります。登録済みのスマホは、そのまま使えます。作り直しますか？')) return;
    deviceAction('join_reset', {}, '共通リンクを作り直しました。新しいリンクを配ってください');
  };
}

/* ---------- 係の画面 ---------- */
/* =========================================================
   年齢データ（字ごとの年齢の割合）と、区域ごとの「会いやすい時間帯」
   ・市のオープンデータのCSVを、区域係が「年齢データを更新する」から読み込む。
     計算はこの端末の中で行い、サーバーに保存するのは字ごとの割合（集計値）だけ
   ・区域と字の対応は、サーバーが国土地理院の住所検索で自動で調べる（t.aza）。
     区域係は手で直せる（t.azaManual）。「もう一度調べる」は t.azaRedo
   ・会える見込み：年代ごとの在宅しやすさ（目安の値）× 字の年齢構成 を最初の予想にし、
     その区域・時間帯の実際の記録（直近1年）がたまるほど、実際の割合に近づける
   ========================================================= */
const AGE_PAGE = 'https://www.e-stat.go.jp/gis/statmap-search?page=1&type=1&toukeiCode=00200521'; // e-Stat 統計GIS：国勢調査の小地域集計
const AGE_STALE_DAYS = 400; // これより古いデータは「更新してください」と出す
const ageStale = cur => { if (cur && cur.estat) return !!cur.stale; const base = cur && (cur.asOf || cur.savedAt); return !!base && daysSince(base) > AGE_STALE_DAYS; }; // 国勢調査（5年ごと）は約5年半まで、市町村のデータは約1年
const PRIOR_K = 3;          // 予想を「記録3件分」として混ぜる
// 年代ごとの在宅しやすさの目安 [20〜39歳, 40〜64歳, 65歳以上]（実際の記録がたまると影響は小さくなる）
const HOME_W = {
  '平日・朝': [.30, .35, .80], '平日・昼': [.25, .30, .75], '平日・午後': [.30, .35, .80],
  '平日・夕方': [.50, .55, .70], '平日・夜': [.60, .60, .50],
  '土日・朝': [.40, .55, .75], '土日・昼': [.50, .55, .70], '土日・午後': [.55, .55, .70],
  '土日・夕方': [.55, .60, .65], '土日・夜': [.55, .55, .45]
};
const DAY_SLOTS = ['平日・朝', '平日・昼', '平日・午後'];
/* 字の名前をそろえる（「字高安」「高安」、「宜保１丁目」「宜保一丁目」を同じにする）。サーバーと同じ決まり */
const kanjiNum = k => {
  const d = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!k.includes('十')) return String(d[k] || k);
  const [a, b] = k.split('十');
  return String((a ? d[a] : 1) * 10 + (b ? d[b] : 0));
};
function azaKey(s) {
  let x = String(s || '').normalize('NFKC').replace(/\s+/g, '');
  x = x.replace(/^沖縄県/, '').replace(/^豊見城市/, '').replace(/^大字/, '').replace(/^字/, '');
  return x.replace(/([一二三四五六七八九十]+)丁目/, (m, k) => kanjiNum(k) + '丁目');
}
const azaShow = n => String(n || '').replace(/^字/, '');
const ageDoc = id => (D().agedata || []).find(x => x && x.id === id) || null;
let AGE_CACHE = null, RATE_CACHE = null;
/* 今の年齢データ：e-Stat（市町村ごとの cur:コード）があればそれをまとめ、なければ以前の1市のデータ（current） */
const estatDocs = () => (D().agedata || []).filter(x => x && /^cur:\d{5}$/.test(x.id) && Array.isArray(x.areas));
function ageCur() {
  const ds = estatDocs();
  if (!ds.length) return ageDoc('current');
  const stale = ds.some(d => { const b = d.asOf || d.savedAt; return !!b && daysSince(b) > (d.src === 'city' ? AGE_STALE_DAYS : 2000); });
  return { estat: true, stale, asOf: ds.map(d => d.asOf).filter(Boolean).sort()[0] || '', savedAt: ds[0].savedAt, by: ds[0].by, file: ds[0].file,
    cities: ds.map(d => d.city || d.id.slice(4)), docs: ds,
    areas: ds.flatMap(d => d.areas), all: ageAllOf(ds.map(d => d.all || ageAllOf(d.areas))) };
}
function ageMap() {
  if (AGE_CACHE) return AGE_CACHE.map;
  const cur = ageCur();
  if (!cur || !Array.isArray(cur.areas) || !cur.areas.length) { AGE_CACHE = { map: null }; return null; }
  const map = new Map();
  cur.areas.forEach(a => map.set(a.k, a));
  if (cur.all) map.set('__all', cur.all);
  AGE_CACHE = { map };
  return map;
}
const terrAza = t => ((t && Array.isArray(t.azaManual) && t.azaManual.length) ? t.azaManual : (t && Array.isArray(t.aza) ? t.aza : []));
/* 区域の年代の割合（字の割合で混ぜる）。字がわからないときは市全体 */
function terrMix(t) {
  const am = ageMap(); if (!am) return null;
  let y = 0, m = 0, o = 0, w = 0;
  terrAza(t).forEach(a => { const x = am.get(a.k); if (!x) return; y += x.y * a.r; m += x.m * a.r; o += x.o * a.r; w += a.r; });
  if (w) return { y: y / w, m: m / w, o: o / w };
  const all = am.get('__all');
  return all ? { y: all.y, m: all.m, o: all.o, city: true } : null;
}
const mixIdx = (mx, slot) => { const w = HOME_W[slot], s = (mx.y + mx.m + mx.o) || 1; return (mx.y * w[0] + mx.m * w[1] + mx.o * w[2]) / s; };
/* 区域×時間帯の実際の記録（直近1年）と、全体の会えた割合 */
/* 会える見込みの集計（区域×時間帯・この1年）。全部の記録を数えるのは、はじめて使うとき・索引を作り直したとき（家の区域が変わることがある）・
   3時間たったときだけ。そのあいだに記録が1件ふえる・へるときは、rateStep で足し引きする（改善案B3。以前は記録が1件届くたびに全部を数え直していた） */
const RATE_TTL = 3 * 3600000;
function rateStats() {
  if (RATE_CACHE && Date.now() - RATE_CACHE.at < RATE_TTL) return RATE_CACHE;
  const per = new Map(), cut = new Date(Date.now() - 365 * DAY).toISOString();
  let n = 0, m = 0;
  for (const v of D().visits) {
    if (v.at < cut) continue; // 日時の文字どうしで比べる（速い）
    const h = HID.get(v.houseId); if (!h || !h.terrId) continue;
    const key = h.terrId + '|' + slotOfVisit(v);
    const c = per.get(key) || { n: 0, m: 0 };
    c.n++; if (v.result === 'met') c.m++;
    per.set(key, c);
    n++; if (v.result === 'met') m++;
  }
  const am = ageMap(), all = am && am.get('__all');
  const meanIdx = all ? SLOTS.reduce((a, s) => a + mixIdx(all, s), 0) / SLOTS.length : 0.5;
  RATE_CACHE = { per, n, m, R: n >= 30 ? m / n : 0.35, meanIdx, cut, at: Date.now() };
  return RATE_CACHE;
}
/* 記録1件を、会える見込みの集計に足す（d=1）・引く（d=-1）。集計をまだ作っていないときは何もしない（使うときに数える） */
function rateStep(v, d) {
  const rc = RATE_CACHE;
  if (!rc || !v || !v.at || v.at < rc.cut) return;
  const h = HID.get(v.houseId); if (!h || !h.terrId) return;
  const key = h.terrId + '|' + slotOfVisit(v), met = v.result === 'met' ? d : 0;
  const c = rc.per.get(key) || { n: 0, m: 0 };
  c.n += d; c.m += met;
  if (c.n <= 0) rc.per.delete(key); else rc.per.set(key, c);
  rc.n += d; rc.m += met;
  rc.R = rc.n >= 30 ? rc.m / rc.n : 0.35;
}
/* 会える見込み（0〜1）。p：見込み、n：その区域・時間帯の記録数 */
function meetChance(t, slot) {
  const st = rateStats(), mx = terrMix(t);
  const prior = mx ? Math.min(0.95, Math.max(0.02, mixIdx(mx, slot) * st.R / st.meanIdx)) : st.R;
  const c = st.per.get(t.id + '|' + slot) || { n: 0, m: 0 };
  return { p: (c.m + prior * PRIOR_K) / (c.n + PRIOR_K), n: c.n };
}
const pctTxt = p => `${Math.round(p * 100)}%`;
function azaText(t) {
  const list = terrAza(t);
  if (list.length) return list.slice().sort((a, b) => b.r - a.r).map(a => `${esc(azaShow(a.n))}${list.length > 1 ? ` ${Math.round(a.r * 100)}%` : ''}`).join('・') +
    (t.azaManual && t.azaManual.length ? '（手で設定）' : '');
  if (t.azaErr) return '<span class="tag-warn">調べられませんでした</span>';
  return LIVE ? '<span class="muted">調べています（数分かかります）</span>' : '<span class="muted">未設定</span>';
}

/* ---------- CSVを読む ---------- */
function parseCsvText(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function readAgeFile(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('ファイルが大きすぎます（20MBまで）');
  let buf = await file.arrayBuffer();
  if (/\.zip$/i.test(file.name || '') || (new Uint8Array(buf.slice(0, 2))[0] === 0x50 && new Uint8Array(buf.slice(0, 2))[1] === 0x4B)) {
    // e-Stat のダウンロードは zip（中に .txt か .csv）
    await loadScript(LIB.zip);
    const zip = await window.JSZip.loadAsync(buf);
    const f = Object.values(zip.files).find(x => !x.dir && /\.(txt|csv)$/i.test(x.name));
    if (!f) throw new Error('zip の中に、データのファイル（.txt・.csv）が見つかりません');
    buf = await f.async('arraybuffer');
  }
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) { // 文字化け → Shift_JIS（Excelで保存したCSV）として読み直す
    try { text = new TextDecoder('shift_jis').decode(buf); } catch (e) { /* そのまま */ }
  }
  return parseAgeCsv(text.replace(/^\uFEFF/, ''), file.name || '');
}
const AGE_RE = /(\d+)\s*[-‐－～〜~]\s*(\d+)\s*歳|(\d+)\s*歳以上/;
/* e-Stat 統計GIS（国勢調査 小地域集計）の形：1行目が KEY_CODE・HYOSYO・CITYNAME・NAME…、2行目が「総数０～４歳」などの見出し。
   地域コードの先頭5けたが市町村コード。HYOSYO 1 は市町村の合計。秘匿（X・-）は 0 として数えない。
   字の印は「市町村コード:字」（国土地理院の住所検索と同じ市町村コードなので、区域の字と合う） */
function parseEstat(rows, fname) {
  const ci = rows.slice(0, 5).findIndex(r => r.includes('KEY_CODE'));
  if (ci < 0) return null;
  const code = rows[ci], head = rows.slice(ci, ci + 3).find(r => r.filter(c => AGE_RE.test(c)).length >= 3);
  if (!head) throw new Error('年齢（「０～４歳」など）の見出しが見つかりません');
  const hi = rows.indexOf(head);
  const kc = code.indexOf('KEY_CODE'), hc = code.indexOf('HYOSYO'), cc = code.indexOf('CITYNAME'), nc = code.indexOf('NAME');
  if (kc < 0 || nc < 0) throw new Error('地域コード・地域名の列が見つかりません');
  const cols = [];
  head.forEach((c, i) => {
    if (!AGE_RE.test(c) || /再掲|平均|人口/.test(c)) return;
    const m = c.match(AGE_RE), lo = Number(m[1] != null ? m[1] : m[3]);
    cols.push({ i, lo, sex: /男/.test(c) ? 'm' : /女/.test(c) ? 'f' : 't' });
  });
  if (cols.length < 3) throw new Error('年齢（「０～４歳」など）の列が少なすぎます');
  const use = cols.some(a => a.sex === 't') ? cols.filter(a => a.sex === 't') : cols;
  const num = v => { const x = Number(String(v || '').replace(/[,\s]/g, '')); return isFinite(x) ? x : 0; };
  const r1 = x => Math.round(x * 1000) / 10;
  const munis = {};
  rows.slice(hi + 1).forEach(r => {
    const key = String(r[kc] || '').replace(/\D/g, '');
    if (key.length < 5) return;
    const mc = key.slice(0, 5), hy = Number(r[hc]) || 0, city = String(cc >= 0 ? r[cc] : '').trim(), name = String(r[nc] || '').trim();
    let tot = 0, y = 0, mi = 0, o = 0, o75 = 0, ch = 0;
    use.forEach(a => {
      const v = num(r[a.i]); tot += v;
      if (a.lo < 15) ch += v; else if (a.lo >= 20 && a.lo < 40) y += v; else if (a.lo >= 40 && a.lo < 65) mi += v; else if (a.lo >= 65) o += v;
      if (a.lo >= 75) o75 += v;
    });
    if (tot <= 0) return;
    const m = munis[mc] || (munis[mc] = { city, areas: [], all: null, seen: new Set() });
    if (!m.city && city) m.city = city;
    const rec = { k: '', n: '', pop: tot, c: r1(ch / tot), y: r1(y / tot), m: r1(mi / tot), o: r1(o / tot), o75: r1(o75 / tot) };
    if (hy === 1 || !name) { m.all = Object.assign(rec, { k: '__all', n: m.city || mc }); return; }
    rec.k = mc + ':' + azaKey(name); rec.n = (m.city ? m.city + ' ' : '') + name;
    if (m.seen.has(rec.k)) return;
    m.seen.add(rec.k); m.areas.push(rec);
  });
  Object.keys(munis).forEach(k => { delete munis[k].seen; if (!munis[k].areas.length) delete munis[k]; });
  const codes = Object.keys(munis);
  if (!codes.length) throw new Error('字のデータが見つかりませんでした');
  const ym = String(fname || '').match(/(20\d{2})/);
  const areas = codes.flatMap(k => munis[k].areas);
  const all = ageAllOf(codes.map(k => munis[k].all || ageAllOf(munis[k].areas)));
  return { estat: true, munis, areas, all, asOf: ym ? `${ym[1]}-10-01` : '', file: String(fname || '').slice(0, 80) };
}
/* 沖縄県の市町村コード（国土地理院の住所検索・e-Stat の地域コードの先頭5けたと同じ） */
const OKI_MUNI = { '47201': '那覇市', '47205': '宜野湾市', '47207': '石垣市', '47208': '浦添市', '47209': '名護市', '47210': '糸満市', '47211': '沖縄市',
  '47212': '豊見城市', '47213': 'うるま市', '47214': '宮古島市', '47215': '南城市', '47301': '国頭村', '47302': '大宜味村', '47303': '東村',
  '47306': '今帰仁村', '47308': '本部町', '47311': '恩納村', '47313': '宜野座村', '47314': '金武町', '47315': '伊江村', '47324': '読谷村',
  '47325': '嘉手納町', '47326': '北谷町', '47327': '北中城村', '47328': '中城村', '47329': '西原町', '47348': '与那原町', '47350': '南風原町',
  '47353': '渡嘉敷村', '47354': '座間味村', '47355': '粟国村', '47356': '渡名喜村', '47357': '南大東村', '47358': '北大東村', '47359': '伊平屋村',
  '47360': '伊是名村', '47361': '久米島町', '47362': '八重瀬町', '47375': '多良間村', '47381': '竹富町', '47382': '与那国町' };
/* 市町村のCSVが、どの市町村のものかを推しはかる（「市計」の行の名前・ファイル名） */
function guessMuni(res) {
  const txt = [(res.all && res.all.n) || '', res.file || '', ...(res.areas || []).slice(0, 3).map(a => a.n)].join(' ');
  return Object.keys(OKI_MUNI).find(c => txt.indexOf(OKI_MUNI[c]) >= 0) || '';
}
/* いくつかの地域を、人口で重みをつけてまとめる */
function ageAllOf(list) {
  const s = { y: 0, m: 0, o: 0, c: 0, o75: 0, pop: 0 };
  list.filter(Boolean).forEach(a => { ['y', 'm', 'o', 'c', 'o75'].forEach(k => { s[k] += a[k] * a.pop; }); s.pop += a.pop; });
  const all = { k: '__all', n: '全体', pop: s.pop };
  ['y', 'm', 'o', 'c', 'o75'].forEach(k => { all[k] = s.pop ? Math.round(s[k] / s.pop * 10) / 10 : 0; });
  return all;
}
function parseAgeCsv(text, fname) {
  const rows = parseCsvText(text).map(r => r.map(c => String(c).normalize('NFKC').trim()));
  const est = parseEstat(rows, fname);
  if (est) return est;
  const isAgeHead = c => AGE_RE.test(c) && !/再掲|人口/.test(c);
  const hi = rows.findIndex(r => r.filter(isAgeHead).length >= 3);
  if (hi < 0) throw new Error('年齢（「0-4歳」など）の列が見つかりません');
  const head = rows[hi];
  const nameCol = head.findIndex(c => /地域名|町丁|字名|地区名|町名/.test(c));
  if (nameCol < 0) throw new Error('「地域名」（字の名前）の列が見つかりません');
  const dateCol = head.findIndex(c => /調査年月日|基準日|年月日/.test(c));
  const hhCol = head.findIndex(c => /^世帯数/.test(c));
  const cols = [];
  head.forEach((c, i) => {
    if (!isAgeHead(c)) return;
    const m = c.match(AGE_RE), lo = Number(m[1] != null ? m[1] : m[3]);
    cols.push({ i, lo, sex: /男/.test(c) ? 'm' : /女/.test(c) ? 'f' : 't' });
  });
  const hasSex = cols.some(a => a.sex !== 't');
  const use = cols.filter(a => (hasSex ? a.sex !== 't' : true));
  const num = v => { const x = Number(String(v || '').replace(/[,\s]/g, '')); return isFinite(x) ? x : 0; };
  const r1 = x => Math.round(x * 1000) / 10; // ％（小数1けた）
  let asOf = '', all = null;
  const areas = [], seen = new Set();
  rows.slice(hi + 1).forEach(r => {
    const name = String(r[nameCol] || '').trim();
    if (!name) return;
    let tot = 0, y = 0, mi = 0, o = 0, o75 = 0, ch = 0;
    use.forEach(a => {
      const v = num(r[a.i]); tot += v;
      if (a.lo < 15) ch += v; else if (a.lo >= 20 && a.lo < 40) y += v; else if (a.lo >= 40 && a.lo < 65) mi += v; else if (a.lo >= 65) o += v;
      if (a.lo >= 75) o75 += v;
    });
    if (tot <= 0) return;
    if (!asOf && dateCol >= 0 && r[dateCol]) asOf = String(r[dateCol]).replace(/\//g, '-').slice(0, 10);
    const rec = { k: azaKey(name), n: name, pop: Math.round(tot * 1000) / 1000, c: r1(ch / tot), y: r1(y / tot), m: r1(mi / tot), o: r1(o / tot), o75: r1(o75 / tot) };
    if (hhCol >= 0) rec.hh = num(r[hhCol]);
    if (/^(全体|合計|総数|計|市計|総計)$/.test(name) || /市$/.test(name)) { all = rec; return; }
    if (seen.has(rec.k)) return;
    seen.add(rec.k); areas.push(rec);
  });
  if (areas.length < 3) throw new Error('字のデータが少なすぎます（3つ以上必要です）');
  if (!asOf) { const m = String(fname).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/); if (m) asOf = `${m[1]}-${m[2]}-${m[3]}`; }
  if (!all) { // 全体の行がないときは、字を足して作る
    const s = { y: 0, m: 0, o: 0, c: 0, o75: 0, pop: 0 };
    areas.forEach(a => { ['y', 'm', 'o', 'c', 'o75'].forEach(k => { s[k] += a[k] * a.pop; }); s.pop += a.pop; });
    all = { k: '__all', n: '全体', pop: s.pop };
    ['y', 'm', 'o', 'c', 'o75'].forEach(k => { all[k] = Math.round(s[k] / s.pop * 10) / 10; });
  }
  all.k = '__all'; delete all.hh;
  // 1世帯あたりの人数（市の平均を1とした比）
  const popAll = areas.reduce((a, x) => a + x.pop, 0), hhAll = areas.reduce((a, x) => a + (x.hh || 0), 0);
  areas.forEach(a => { if (a.hh && hhAll) a.hi = Math.round((a.pop / popAll) / (a.hh / hhAll) * 100) / 100; delete a.hh; });
  return { asOf, areas, all, file: String(fname).slice(0, 80) };
}
const ageType = a => (a.o >= 27 ? '高齢型' : a.o <= 12 ? '子育て・現役型' : (a.y >= 30 && a.hi && a.hi < 0.95) ? '若い世代・少人数世帯型' : '標準型');


/* ---------- 区域をえらぶ画面に出す「世代の割合」（出す世代と表し方は、区域係が決める） ----------
   ageShow：出す世代（足し算：1＝0〜14歳、2＝20〜39歳、4＝40〜64歳、8＝65歳以上、16＝75歳以上）
   ageShowMode：0＝市全体のその世代のうち、この区域にいる割合　1＝この区域の人のうち、その世代の割合
   市全体のうちの割合は「字の人口 × 字の中の世代の割合 × 区域がその字にしめる家の割合」から出す目安 */
const AGE_GROUPS = [[1, 'c', '0〜14歳'], [2, 'y', '若い世代（20〜39歳）'], [4, 'm', '40〜64歳'], [8, 'o', '65歳以上'], [16, 'o75', '75歳以上']];
const AGE_SHORT = { c: '子ども', y: '若い世代', m: '40〜64歳', o: '65歳以上', o75: '75歳以上' };
let SHARE_CACHE = null;
function azaHouseShare() {
  if (SHARE_CACHE) return SHARE_CACHE;
  const tot = {}, per = new Map();
  D().territories.forEach(t => {
    if (t.dummy) return;
    const n = housesOf(t.id).reduce((a, h) => a + targets(h).length, 0);
    terrAza(t).forEach(a => { tot[a.k] = (tot[a.k] || 0) + n * a.r; });
    per.set(t.id, n);
  });
  SHARE_CACHE = { tot, per };
  return SHARE_CACHE;
}
function ageLine(t) {
  const bits = Number(D().settings.ageShow) || 0, am = ageMap();
  if (!bits || !am || !t) return '';
  const list = terrAza(t).filter(a => am.has(a.k));
  if (!list.length) return '';
  const gs = AGE_GROUPS.filter(g => bits & g[0]);
  let parts;
  if (Number(D().settings.ageShowMode) === 1) { // この区域の人のうち
    const w = list.reduce((s, a) => s + a.r, 0) || 1;
    parts = gs.map(g => `${AGE_SHORT[g[1]]} ${Math.round(list.reduce((s, a) => s + am.get(a.k)[g[1]] * a.r, 0) / w)}%`);
    return `<p class="agelines">この区域：${parts.join('・')}</p>`;
  }
  const sh = azaHouseShare(), n = sh.per.get(t.id) || 0;
  if (!n) return '';
  const areas = [...am.values()].filter(a => a.k !== '__all');
  parts = gs.map(g => {
    const city = areas.reduce((s, a) => s + a.pop * a[g[1]], 0);
    const mine = list.reduce((s, a) => s + (sh.tot[a.k] ? am.get(a.k).pop * am.get(a.k)[g[1]] * (n * a.r / sh.tot[a.k]) : 0), 0);
    const p = city ? mine / city * 100 : 0;
    return `${AGE_SHORT[g[1]]}の${p < 1 ? p.toFixed(1) : Math.round(p * 10) / 10}%`;
  });
  return `<p class="agelines">市全体の${parts.join('・')}がこの区域にいます</p>`;
}
function ageShowSetHtml() {
  const st = D().settings, bits = Number(st.ageShow) || 0;
  return `<h3 class="sub">区域をえらぶ画面に出す世代</h3>
    <p class="hint">区域カードをもらう画面・留守宅カードをえらぶ画面に出します。いくつでもえらべます（なにもえらばないと出しません）。</p>
    <div class="chips">${AGE_GROUPS.map(g => `<button type="button" class="chip" data-agesh="${g[0]}" aria-pressed="${!!(bits & g[0])}">${g[2]}</button>`).join('')}</div>
    <p class="q" style="font-size:17px">表し方</p>
    <div class="seg uiseg" role="group" aria-label="表し方">
      <button type="button" data-agemode="0" aria-pressed="${Number(st.ageShowMode) !== 1}">市全体のうち、この区域にいる割合</button>
      <button type="button" data-agemode="1" aria-pressed="${Number(st.ageShowMode) === 1}">この区域の人のうちの割合</button></div>
    <p class="hint">例：「市全体の若い世代の2.1%がこの区域にいます」／「この区域：若い世代 24%」。区域の家の数と字の割合から出す目安です。</p>`;
}
/* ---------- 区域係：年齢データの画面 ---------- */
function ageNoticeHtml() {
  if (!isAdmin() || !AGE_ON) return '';
  const cur = ageCur();
  if (!cur) return `<div class="notice info">年齢データがまだありません。「設定・データ」の「年齢データを更新する」から入れると、区域ごとの会いやすい時間帯がわかります。</div>`;
  const base = cur.asOf || cur.savedAt;
  if (ageStale(cur)) return `<div class="notice warn"><b>年齢データが1年以上前のものです（${esc(cur.asOf || '')}）。</b>「設定・データ」の「年齢データを更新する」から新しくしてください。</div>`;
  return '';
}
function renderAgeAdmin() {
  const box = $('#adAge'); if (!box) return;
  if (!AGE_ON) { box.innerHTML = ''; box.hidden = true; return; }
  const cur = ageCur(), prev = ageDoc('prev');
  const ts = D().territories.filter(t => !t.dummy && okPoly(t.polygon) && !isSpecial(t));
  const done = ts.filter(t => terrAza(t).length).length;
  const old = ageStale(cur);
  box.innerHTML = `<h2 class="sec">年齢データ（字ごとの年齢の割合）</h2>
    ${cur && cur.docs ? `<details class="more"><summary>市町村ごとのデータ（${cur.docs.length}）</summary><ul>${cur.docs.map(d => `<li>${esc(d.city || d.id.slice(4))}：${d.src === 'city' ? '市町村のデータ' : 'e-Stat 国勢調査'}・${esc(d.asOf || '日付不明')}時点・${d.areas.length}字</li>`).join('')}</ul></details>` : ''}
    ${cur ? `<div class="setrow"><span>今のデータ：<b>${esc(cur.asOf || '日付不明')}</b>時点・${cur.estat ? `${cur.cities.length}市町村・` : ''}${cur.areas.length}字<br>
        <small class="hint">${cur.savedAt ? `${fmtDay(cur.savedAt)}に${esc(uname(cur.by))}さんが保存` : ''}</small></span></div>
      ${old ? '<div class="notice warn">1年以上前のデータです。下の手順で新しくしてください。</div>' : ''}`
      : '<div class="notice info">まだ年齢データがありません。下の手順で入れてください。</div>'}
    <ol class="hsteps">
      <li><span class="hnum">1</span><div><p>e-Stat（政府統計の総合窓口）の統計GISで、国勢調査の「小地域（町丁・字等別）」から「男女，年齢（5歳階級）別人口」をえらび、<b>47 沖縄県</b>のファイル（zip）をダウンロードします。沖縄県全体が1つのファイルです。</p>
        <a class="btn small" href="${AGE_PAGE}" target="_blank" rel="noopener">e-Stat を開く</a></div></li>
      <li><span class="hnum">2</span><div><p>下の「年齢データを更新する」を押して、そのファイルをえらびます。市町村が出している字ごとの年齢別人口（CSV）も使えます。そのときは、どの市町村のデータかをえらびます（その市町村の分だけ入れかわります）。</p></div></li>
      <li><span class="hnum">3</span><div><p>出てきた内容を確かめて「保存する」を押します。あとは自動です。</p></div></li>
    </ol>
    <div class="row"><label class="btn primary">年齢データを更新する<input type="file" id="ageFile" hidden></label>
      ${prev ? `<button type="button" class="btn" data-agerestore>前のデータ（${esc(prev.asOf || '')}）にもどす</button>` : ''}</div>
    <p class="hint">国が公開している字ごとの集計（人口の割合）だけを使います。ファイルそのものは保存せず、計算した割合だけを残します。国勢調査は5年ごとなので、新しい調査が出たときに入れかえれば十分です。</p>
    ${cur ? ageShowSetHtml() : ''}
    <div class="setrow"><span>区域と字の対応：<b>${done} / ${ts.length}区域</b>で決まっています<br>
      <small class="hint">${LIVE ? '区域の線を引く・直すと、数分でサーバーが自動で調べます（国土地理院の住所検索を使います。送るのは建物の位置だけです）。' : '試作版では自動で調べられません。「区域」の一覧の「字を直す」で手で決められます。'}
      おかしいときは「区域」の一覧の「字を直す」で直せます。</small></span></div>`;
}
async function onAgeFile(file) {
  let res;
  try { res = await readAgeFile(file); }
  catch (e) {
    infoSheet('このファイルは読めませんでした', `${esc(e.message || '形がちがいます')}<br>e-Stat の国勢調査「小地域（町丁・字等別）」の「男女，年齢（5歳階級）別人口」（zip のままでも大丈夫です）をえらんでください。今のデータはそのまま使います。`);
    return;
  }
  if (res.estat) { onEstatFile(res); return; }
  if (estatDocs().length || AGE_ON) { onCityFile(res); return; }
  const list = res.areas.slice().sort((a, b) => b.o - a.o);
  setSheet(headHtml(null, 'この内容で保存しますか', `${esc(res.asOf || '日付不明')}時点・${res.areas.length}字`) + `
    <p class="hint">ファイル：${esc(res.file)}<br>市全体の高齢化率 ${res.all.o}%。高齢化率の高い順に並べています。</p>
    <div class="scroll"><table class="slots narrow"><tr><th>字</th><th>65歳以上</th><th>20〜39歳</th><th>0〜14歳</th><th>タイプ</th></tr>
      ${list.map(a => `<tr><th>${esc(azaShow(a.n))}</th><td>${a.o}%</td><td>${a.y}%</td><td>${a.c}%</td><td>${ageType(a)}</td></tr>`).join('')}</table></div>
    ${res.asOf ? '' : '<div class="notice warn">データの日付がわかりませんでした。保存はできます。</div>'}
    <button class="btn primary block" id="ageSave">保存する</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#ageSave').onclick = () => {
    closeSheet();
    commit(`年齢データ（${res.asOf || '日付不明'}）を保存しました`, () => {
      const cur = ageDoc('current');
      const rest = (D().agedata || []).filter(x => x && x.id !== 'current' && x.id !== 'prev');
      if (cur) rest.push(Object.assign({}, cur, { id: 'prev' }));
      rest.push({ id: 'current', asOf: res.asOf, areas: res.areas, all: res.all, file: res.file, savedAt: new Date().toISOString(), by: me().id });
      D().agedata = rest;
    });
  };
}
/* e-Stat：市町村ごとに分けて保存する（1つの市町村が1つの記録） */
function onEstatFile(res) {
  const codes = Object.keys(res.munis).sort();
  setSheet(headHtml(null, 'この内容で保存しますか', `${esc(res.asOf || '日付不明')}時点・${codes.length}市町村・${res.areas.length}字`) + `
    <p class="hint">ファイル：${esc(res.file)}<br>e-Stat 国勢調査（小地域集計）。全体の20〜39歳 ${res.all.y}%・65歳以上 ${res.all.o}%</p>
    <div class="scroll"><table class="slots narrow"><tr><th>市町村</th><th>字</th><th>20〜39歳</th><th>65歳以上</th></tr>
      ${codes.map(c => { const m = res.munis[c], a = m.all || ageAllOf(m.areas); return `<tr><th>${esc(m.city || c)}</th><td>${m.areas.length}</td><td>${a.y}%</td><td>${a.o}%</td></tr>`; }).join('')}</table></div>
    <button class="btn primary block" id="ageSave">保存する</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#ageSave').onclick = () => {
    closeSheet();
    commit(`年齢データ（e-Stat ${res.asOf || ''}・${codes.length}市町村）を保存しました`, () => {
      const now = new Date().toISOString();
      // 市町村のCSVで入れた市町村は、そのまま残す（e-Stat より新しいため）
      const keepCity = new Set((D().agedata || []).filter(x => x && /^cur:\d{5}$/.test(x.id) && x.src === 'city').map(x => x.id));
      const rest = (D().agedata || []).filter(x => x && (!/^cur:\d{5}$/.test(x.id) || keepCity.has(x.id)));
      codes.forEach(c => { if (keepCity.has('cur:' + c)) return; const m = res.munis[c]; rest.push({ id: 'cur:' + c, src: 'estat', asOf: res.asOf, city: m.city, areas: m.areas, all: m.all || ageAllOf(m.areas), file: res.file, savedAt: now, by: me().id }); });
      D().agedata = rest;
    });
  };
}
/* 市町村が出している字ごとの年齢別人口（CSV）：どの市町村のものかをえらび、その市町村の分だけ入れかえる（e-Stat のほかの市町村はそのまま） */
function onCityFile(res) {
  const guess = guessMuni(res), have = new Set(estatDocs().map(d => d.id.slice(4)));
  const list = res.areas.slice().sort((a, b) => b.y - a.y);
  setSheet(headHtml(null, 'この内容で保存しますか', `${esc(res.asOf || '日付不明')}時点・${res.areas.length}字`) + `
    <p class="hint">ファイル：${esc(res.file)}</p>
    <label class="field"><span>どの市町村のデータですか</span><select id="ageMuni" style="width:100%;min-height:54px;border-radius:12px;border:2px solid var(--ink2);padding:0 12px;font-size:18px;background:#fff">
      <option value="">えらんでください</option>${Object.keys(OKI_MUNI).map(c => `<option value="${c}"${c === guess ? ' selected' : ''}>${OKI_MUNI[c]}${have.has(c) ? '（今のデータを入れかえ）' : ''}</option>`).join('')}</select></label>
    <p class="hint">えらんだ市町村の分だけを、このデータに入れかえます。ほかの市町村（e-Stat など）はそのままです。市町村のデータは国勢調査より新しいことが多いので、あれば優先して使えます。</p>
    <div class="scroll"><table class="slots narrow"><tr><th>字</th><th>20〜39歳</th><th>65歳以上</th><th>0〜14歳</th></tr>
      ${list.map(a => `<tr><th>${esc(azaShow(a.n))}</th><td>${a.y}%</td><td>${a.o}%</td><td>${a.c}%</td></tr>`).join('')}</table></div>
    ${res.asOf ? '' : '<div class="notice warn">データの日付がわかりませんでした。保存はできます。</div>'}
    <button class="btn primary block" id="ageSave">保存する</button>
    <button class="btn block" data-close>やめる</button>`);
  $('#ageSave').onclick = () => {
    const c = $('#ageMuni').value;
    if (!c) { toast('どの市町村のデータかをえらんでください'); return; }
    const city = OKI_MUNI[c];
    closeSheet();
    commit(`年齢データ（${city}・${res.asOf || '日付不明'}）を保存しました`, () => {
      const areas = res.areas.map(a => Object.assign({}, a, { k: c + ':' + a.k, n: city + ' ' + a.n }));
      const rest = (D().agedata || []).filter(x => x && x.id !== 'cur:' + c);
      rest.push({ id: 'cur:' + c, src: 'city', asOf: res.asOf, city, areas, all: Object.assign({}, res.all, { k: '__all', n: city }), file: res.file, savedAt: new Date().toISOString(), by: me().id });
      D().agedata = rest;
    });
  };
}
async function restoreAge() {
  const cur = ageDoc('current'), prev = ageDoc('prev');
  if (!prev) return;
  if (!await ask(`前の年齢データ（${prev.asOf || '日付不明'}）にもどします。よろしいですか？`)) return;
  commit('前の年齢データにもどしました', () => {
    const rest = (D().agedata || []).filter(x => x && x.id !== 'current' && x.id !== 'prev');
    rest.push(Object.assign({}, prev, { id: 'current' }));
    if (cur) rest.push(Object.assign({}, cur, { id: 'prev' }));
    D().agedata = rest;
  });
}
/* 区域の字を手で直す */
function openAzaEdit(tid) {
  const t = terrById(tid); if (!t) return;
  const am = ageMap();
  if (!am) { infoSheet('先に年齢データを入れてください', '「設定・データ」の「年齢データを更新する」から入れると、字をえらべるようになります。'); return; }
  const names = [...am.values()].filter(a => a.k !== '__all').sort((a, b) => a.n.localeCompare(b.n, 'ja'));
  const cur = new Set(terrAza(t).map(a => a.k));
  setSheet(headHtml(t, 'この区域の字', esc(t.name)) + `
    <p>自動で調べた結果：<b>${(t.aza || []).length ? (t.aza || []).map(a => `${esc(azaShow(a.n))} ${Math.round(a.r * 100)}%`).join('・') : (t.azaErr ? '調べられませんでした' : 'まだありません')}</b></p>
    <p class="q">区域に入っている字をえらぶ</p>
    <div id="azaList">${names.map(a => `<label class="check"><input type="checkbox" data-az="${esc(a.k)}"${cur.has(a.k) ? ' checked' : ''}>${esc(azaShow(a.n))}</label>`).join('')}</div>
    <p class="hint">手でえらぶと、えらんだ字を同じ割合で混ぜます。</p>
    <button class="btn primary block" id="azaSave">この字で決める</button>
    ${t.azaManual && t.azaManual.length ? '<button class="btn block" id="azaAuto">自動で調べた結果にもどす</button>' : ''}
    ${LIVE ? '<button class="btn block" id="azaRedo">もう一度、自動で調べる</button>' : ''}
    <button class="btn block" data-close>やめる</button>`);
  $('#azaSave').onclick = () => {
    const ks = $$('#azaList input:checked').map(x => x.dataset.az);
    if (!ks.length) { toast('字を1つ以上えらんでください'); return; }
    closeSheet();
    commit(`区域${t.no}の字を決めました`, () => {
      t.azaManual = ks.map(k => ({ k, n: am.get(k).n, r: Math.round(1000 / ks.length) / 1000 }));
    });
  };
  if ($('#azaAuto')) $('#azaAuto').onclick = () => { closeSheet(); commit('自動で調べた結果にもどしました', () => { delete t.azaManual; }); };
  if ($('#azaRedo')) $('#azaRedo').onclick = () => {
    closeSheet();
    commit('もう一度調べます（数分かかります）', () => { t.azaRedo = new Date().toISOString(); });
  };
}
/* 区域係「状況」：区域ごとの会いやすい時間帯 */
function renderMeetAdmin() {
  const box = $('#adMeet'); if (!box) return;
  const cur = ageCur();
  const ts = D().territories.filter(t => !t.dummy && okPoly(t.polygon));
  const rows = ts.map(t => {
    const ch = {}; let n = 0;
    SLOTS.forEach(s => { const c = meetChance(t, s); ch[s] = c.p; n += c.n; });
    const day = DAY_SLOTS.reduce((a, s) => a + ch[s], 0) / DAY_SLOTS.length;
    const best = SLOTS.slice().sort((a, b) => ch[b] - ch[a]).slice(0, 2);
    return { t, day, best, ch, n };
  }).sort((a, b) => b.day - a.day);
  $('#adMeetHint').innerHTML = (cur ? `年齢データ（${esc(cur.asOf || '')}）と、直近1年の記録から出した目安です。` : '年齢データがまだないので、記録だけから出しています。') +
    '上にある区域ほど、平日の昼間にも会いやすい区域です。平日の昼間に動ける人の区域カード・留守宅カードに向いています。記録が増えるほど、実際の結果に近づきます。';
  box.innerHTML = rows.length ? `<table class="slots narrow"><tr><th>区域</th><th>字</th><th>平日の昼間<br><small>朝〜午後</small></th><th>いちばん会いやすい</th><th>記録<br><small>1年</small></th></tr>
    ${rows.map(r => `<tr><th>${esc(r.t.no)}</th><td style="text-align:left">${azaText(r.t)}</td>
      <td><b>${pctTxt(r.day)}</b><div class="bar"><i style="width:${Math.round(r.day * 100)}%"></i></div></td>
      <td>${r.best.map(s => `${slotShort(s)} ${pctTxt(r.ch[s])}`).join('<br>')}</td><td>${r.n}件</td></tr>`).join('')}</table>`
    : '<div class="empty">区域がありません。</div>';
}
function bindAgeAdmin() {
  const v = $('#view-admin');
  v.addEventListener('change', e => {
    if (e.target.id !== 'ageFile') return;
    const file = e.target.files[0]; e.target.value = '';
    if (file) onAgeFile(file);
  });
  v.addEventListener('click', e => {
    const x = e.target.closest('[data-azaedit], [data-agerestore], [data-agesh], [data-agemode]');
    if (!x) return;
    const st = D().settings;
    if (x.dataset.agesh) { st.ageShow = (Number(st.ageShow) || 0) ^ Number(x.dataset.agesh); Store.save(); renderAll(); return; }
    if (x.dataset.agemode) { st.ageShowMode = Number(x.dataset.agemode); Store.save(); renderAll(); return; }
    if (x.dataset.azaedit) openAzaEdit(x.dataset.azaedit); else restoreAge();
  });
}


/* ---------- このスマホで、動作の速さを測る（区域係の「設定・データ」） ----------
   今のデータ（家・記録の件数そのまま）で、よく使う処理の時間を測る。データは変えない */
function runPerfCheck() {
  const res = [];
  const T = (name, fn, n) => {
    const k = n || 1, t0 = performance.now();
    try { for (let i = 0; i < k; i++) fn(); } catch (e) { res.push([name, -1]); return; }
    res.push([name, (performance.now() - t0) / k]);
  };
  const mineT = D().territories.find(t => t.holder) || D().territories[0];
  T('起動のときの索引づくり', () => buildIndex());
  T('索引づくり（2回目から）', () => buildIndex(), 2);
  T('区域カードの画面', () => renderCards());
  T('ホーム（今日やること）', () => { CHANCE_CACHE = null; RATE_CACHE = null; todayTodoHtml([]); });
  if (mineT) T('おすすめ順（1区域）', () => roundPlan(roundInfo(mineT.id, true)), 3);
  T('留守宅カードの候補', () => awaySuggestions(me().id, [slotOf(new Date())]), 2);
  T('会える見込みの集計', () => { RATE_CACHE = null; rateStats(); }, 2);
  if (map) T('地図の家の印（今の画面）', () => renderHouses(), 3);
  T('編集の保存の準備（取り消し用の控え）', () => JSON.stringify(Object.assign({}, D(), { visits: undefined })));
  if (LIVE && Store.fp) T('編集の保存（変わった分をさがす）', () => Store.collectChanges());
  const cnt = { h: D().houses.length, u: D().houses.reduce((a, h) => a + targets(h).length, 0), v: D().visits.length };
  const mark = ms => (ms < 0 ? '×（エラー）' : ms < 100 ? '◎ 速い' : ms < 300 ? '○ ふつう' : ms < 1000 ? '△ 少し待つ' : '× 重い');
  setSheet(headHtml(null, '動作の速さ', `このスマホ・家 ${cnt.h}件（部屋をふくめ ${cnt.u}）・記録 ${cnt.v}件`) + `
    <div class="scroll"><table class="slots narrow"><tr><th>処理</th><th>時間</th><th>判定</th></tr>
      ${res.map(([n, ms]) => `<tr><th style="text-align:left">${esc(n)}</th><td>${ms < 0 ? '—' : Math.round(ms) + 'ms'}</td><td>${mark(ms)}</td></tr>`).join('')}</table></div>
    <p class="hint">◎ 0.1秒未満・○ 0.3秒未満・△ 1秒未満・× 1秒以上。いちばん古いスマホで測ってください。△や×があるときは、この画面を写真にとって、開発した人に知らせてください。</p>
    <button class="btn block primary" id="pfCopy">結果をコピーする</button>
    <button class="btn block" data-close>閉じる</button>`);
  const text = `区域マップ 動作の速さ（${navigator.userAgent.slice(0, 80)}）\n家${cnt.h} 部屋込み${cnt.u} 記録${cnt.v}\n` + res.map(([n, ms]) => `${n}: ${ms < 0 ? 'エラー' : Math.round(ms) + 'ms'}`).join('\n');
  $('#pfCopy').onclick = () => copyText(text).then(ok => toast(ok ? 'コピーしました' : 'コピーできませんでした'));
  renderAll();
}

function renderDataSet() {
  renderDummy();
  renderRecoAdmin();
  renderAgeAdmin();
  if (window.S21R) S21R.renderAdmin(); // 奉仕報告（S21）のつなぎ方（houkoku.js）
  const st = D().settings;
  const row = (key, label, unit, d, hint) => `<div class="setrow"><span>${label}<br><small class="hint">${hint}</small></span><div class="stepper">
    <button type="button" data-kset="${key}" data-d="-${d}" aria-label="${label}を減らす">−</button><output class="wide">${st[key]}${unit}</output>
    <button type="button" data-kset="${key}" data-d="${d}" aria-label="${label}を増やす">＋</button></div></div>`;
  const sw = (key, label, hint) => `<div class="setrow"><span>${label}<br><small class="hint">${hint}</small></span>
    <div class="seg" role="group" aria-label="${label}">
      <button type="button" data-sset="${key}" data-v="1" aria-pressed="${st[key] !== 0}">記録する</button>
      <button type="button" data-sset="${key}" data-v="0" aria-pressed="${st[key] === 0}">記録しない</button></div></div>`;
  $('#adDataSet').innerHTML =
    row('keepMonths', '訪問記録を残す期間', 'か月', 6, 'これより古い記録は、家ごとの最後の1件を残して、毎月整理します（自動整理を設定したとき）') +
    row('cacheDays', '通信がない端末にデータを残す期間', '日', 5, 'この日数のあいだ通信できなかった端末は、保存した区域の情報を自動で消します') +
    row('syncGroupSec', '一緒に回っているとき、ほかの人の記録を取りに行く間隔', '秒', 1, '短いほど早く反映されますが、サーバーが混みます。80人が同時に使っても、7秒なら余裕があります') +
    row('syncNormalSec', '区域カード・地図を見ているとき、取りに行く間隔', '秒', 5, 'ふだんの間隔です。混むときは長くしてください');
}
/* 「区域」タブの「貸し出しのきまり」：状況の「区域の決め」（kimari.js）の「貸し出しと返却」を開く入り口。ボタンの下に今の決めを短く出す */
function paintTakeTgl() {
  const b = $('#adTakeTgl'); if (!b) return;
  const st = D().settings;
  $('#adTakeSum').textContent = `自動受け取り ${Number(st.autoFree) === 1 ? '使う' : '使わない'}・目安 ${lendDays()}日・1人 ${st.holdMaxPersonal || 2}枚`;
  if (!b.dataset.bound) {
    b.dataset.bound = '1';
    b.onclick = () => { if (window.KR) KR.open('lend'); };
  }
}
/* 係の画面：開いているタブの中身だけを作る（3万件のとき、全部のタブを毎回作ると重いため） */
let poolSweepAt = 0;
/* 係の端末の自動の確かめ：目安に届いた留守宅カードの区域を正式な返却として記録する（finalizePools）・記録の少ない返却を確かめる（lowSweep）・
   紙や口頭で回り終えた区域に印を付ける（recLessFill）。5分に1回まで。描画の途中で記録しないよう、あとで動かす。
   本番では、この起動でサーバーの最新の変更を一度受け取ってから動かす（開いた直後の端末に残っている古い記録で数えて、
   回り終えた区域を途中の返却にしないため。受け取ったときに係の画面を開いていれば applyInbox が呼ぶ。第3回監査 P6・2026-10-29） */
function adminSweepSoon() {
  if (!isAdmin() || (LIVE && !Store.pulled)) return;
  if (Date.now() - poolSweepAt > 300000) { poolSweepAt = Date.now(); setTimeout(() => { finalizePools(); fromFill(); lowSweep(); recLessFill(); }, 400); } // fromFill は lowSweep の前（古い続きからの記録に回りはじめた日を補ってから数える。N-7）
}
function renderAdmin() {
  setAdPane(adPane);
  adminSweepSoon();
  renderInbox(); // 承認待ちの数（タブの数字）は、いつも数える
  $('#adInbox').insertAdjacentHTML('afterbegin', ageNoticeHtml());
  if (adPane === 'inbox') renderDevices();
  if (adPane === 'sched') renderSchedAdmin();
  if (adPane === 'people') renderPeople();
  if (adPane === 'set') renderDataSet();
  if (adPane === 'status') { renderAwayAdmin(); renderMeetAdmin(); }
  if (adPane === 'dnc') { if (window.renderDncAdmin) window.renderDncAdmin(); return; } // 拒否の一覧（kyohi.js）
  if (adPane !== 'status' && adPane !== 'terr') return;
  const now = Date.now();
  const ts = D().territories.slice().sort(byNo);
  if (adPane === 'terr') { renderTerrList(ts); return; } // 区域の一覧だけ（「状況」の数字・表は作らない）
  let targetsN = 0, met90 = 0;
  // 全体の数は家から直接数える（特別区域の家を2回数えないように。区域の外の家は別に出す）
  for (const h of D().houses) {
    if (!h.terrId) continue;
    for (const u of targets(h)) { targetsN++; const sm = sum(K(h.id, u)); if (sm.met && now - Date.parse(sm.met.at) <= 90 * DAY) met90++; }
  }
  const outside = D().houses.filter(h => !h.terrId).length;
  const lent = ts.filter(isLent).length;
  const over = ts.filter(pastDue).length;
  const dncN = Object.keys(D().dnc).length;
  const provN = D().houses.filter(h => h.prov).length;
  const tile = (k, cls, num, label) => `<button type="button" class="tile${cls}" data-tl="${k}"><b>${num}</b>${label}<span class="tmore">内訳 ›</span></button>`;
  $('#adTiles').innerHTML = tile('terr', '', ts.length, `区域（貸出中 ${lent}）`) +
    tile('over', over ? ' alert' : '', over, `返却の目安（${lendDays()}日）を過ぎた貸出`) +
    tile('units', '', targetsN, `家・部屋${outside ? `（区域外 ${outside}）` : ''}`) +
    tile('met', '', `${targetsN ? Math.round(met90 / targetsN * 100) : 0}%`, 'この90日で会えた家・部屋') +
    tile('dnc', '', dncN, '拒否の家・部屋') +
    (provN ? tile('prov', ' alert', provN, 'まだ確かめていない仮の家') : '');
  if (!$('#adTiles').dataset.bound) { $('#adTiles').dataset.bound = '1'; $('#adTiles').addEventListener('click', e => { const b = e.target.closest('[data-tl]'); if (b) openStatList(b.dataset.tl); }); }

  // 古い「時間帯ごとの会えた割合（直近180日）」の表は、新しい表（schedule.js の paintSlotBox）が隠して置きかえるので、作らない
  // （前は毎回、直近180日の記録を全部数えてから隠していた。区域係の「状況」と設定を左右にする見直しで気づいた分）
}
/* 係の画面「区域」の一覧：1区域1行（番号・名前・持っている人か前回の返却日・状態）。行を押すとカルテが開く（改善案A4）。
   担当を変える・貸し出しのきまり・線を直す・番号と名前・字・条件・削除などの操作は、カルテにまとめてある。
   一覧の幅が広いとき（パソコン）は、同じ行を表にする（CSS の .tlist）。上の「さがす」と絞り込みは schedule.js */
function renderTerrList(ts) {
  const pcount = new Map();
  ts.forEach(t => { if (t.pno) pcount.set(t.pno, (pcount.get(t.pno) || 0) + 1); });
  const dueOfT = t => (window.KM && KM.dueInfo ? KM.dueInfo(t) : null);
  const unitsN = t => housesOf(t.id).reduce((a, h) => a + unitsIn(h, t).length, 0); // 家・部屋の数（特別区域で回る家は、その特別区域で数える）
  let lastP = null;
  const head = '<div class="tlhead" aria-hidden="true"><span>番号</span><span>名前</span><span>状態</span><span>持っている人</span><span>貸し出した日</span><span>返却の目安</span><span>前回回り終えた日</span><span class="n">家・部屋</span><span></span></div>';
  $('#adTerrs').innerHTML = '<div class="tlist">' + head + ts.map(t => {
    // 親番号が変わるところに見出し（枝番の区域を親ごとにまとめて見せる）
    const ph = t.pno && t.pno !== lastP ? `<div class="pgrp"><span class="stamp sm${noCls(t.pno)}">${esc(t.pno)}</span><b>区域 ${esc(t.pno)}</b><span class="muted">${t.pnm ? esc(t.pnm) + '・' : ''}枝番 ${pcount.get(t.pno)}つ</span></div>` : '';
    lastP = t.pno || null;
    return ph + rowOf(t);
  }).join('') + '</div>';
  function rowOf(t) {
    const pp = paperHoldOf(t), pool = !t.holder && !pp && t.awayPoolAt, due = t.holder && t.lentAt ? dueOf(t) : '';
    const over = !!due && Date.parse(due) < Date.now();
    const retAt = t.holder || pp || t.awayPoolAt ? '' : (t.completedAt && (!t.returnedAt || t.completedAt >= t.returnedAt) ? t.completedAt : '');
    const di = dueOfT(t), late = di && (di.st === 'over' || di.st === 'warn');
    const lateTag = late ? `<span class="tag-warn">${di.st === 'over' ? '1年の期限を過ぎています' : `1年の期限まで${di.left}日`}</span>` : '';
    // スマホの2行目：持っている人、または前回の返却
    const sub = t.holder ? `${esc(uname(t.holder))}さん${t.lentAt ? `・${daysSince(t.lentAt)}日目` : ''}${over ? '　<span class="tag-warn">返却の目安を過ぎています</span>' : ''}`
      : pp ? `紙の記録：${esc(pp.name || '名前なし')}`
      : pool ? '留守宅カードで回っています'
      : retAt ? `返却 ${fmtDay(retAt)}${lowWaitNote(t)}` : `前回回り終えた日 ${lastDoneTxt(t)}`;
    const who = t.holder ? `${esc(uname(t.holder))}さん` : pp ? `紙の記録：${esc(pp.name || '名前なし')}` : pool ? '留守宅カード' : '—';
    const lentAt = t.holder ? t.lentAt : pp ? pp.a : '';
    const badges = `${t.group ? ` <span class="gbadge">${esc(useName(t))}</span>` : ''}${isSpecial(t) ? ' <span class="spbadge">特別区域</span>' : ''}`;
    return `<button type="button" class="trow1" data-karte="${esc(t.id)}" data-tid="${esc(t.id)}">
      <span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span>
      <span class="tl-n"><b>${esc(t.name)}${badges}</b><small>${sub}${lendTag(t)}${late ? ' ' + lateTag : ''}</small></span>
      <span class="tl-st">${lendTag(t)}</span>
      <span class="tl-c">${who}</span>
      <span class="tl-c">${lentAt ? fmtDay(lentAt) : '—'}</span>
      <span class="tl-c">${due ? `<span class="${over ? 'tag-warn' : ''}">${fmtDay(due)}</span>` : '—'}</span>
      <span class="tl-c">${lastDoneTxt(t)}${late ? '<br>' + lateTag : ''}</span>
      <span class="tl-c n">${unitsN(t)}</span>
      <span class="tl-go" aria-hidden="true">›</span></button>`;
  }
}
/* 係の画面「状況」の「全体の状況」：数字を押すと、その内訳を下から出す（閉じると元の画面のまま）
   区域の行の「地図」「カルテ」から、その区域に進める。カルテから「もどる」で、この内訳にもどる */
function statRow(t, sub, warn) {
  return `<div class="tlrow"><span class="stamp sm${noCls(t.no)}">${esc(t.no)}</span><div><p><b>${esc(t.name || '')}</b></p>
    <p class="muted${warn ? ' tag-warn' : ''}">${sub}</p></div>
    <div class="btns"><button type="button" class="btn small" data-tlmap="${esc(t.id)}">地図</button>${window.KM && KM.openKarte ? `<button type="button" class="btn small primary" data-tlkarte="${esc(t.id)}">カルテ</button>` : ''}</div></div>`;
}
function openStatList(key) {
  if (!isAdmin()) return;
  const now = Date.now(), ts = D().territories.slice().sort(byNo), back = () => openStatList(key);
  let title = '', hint = '', body = '';
  if (key === 'terr') {
    const lentT = ts.filter(t => t.holder), paperT = ts.filter(paperLent), pool = ts.filter(t => !isLent(t) && t.awayPoolAt), stop = ts.filter(t => !isLent(t) && lendMode(t) === 'stop');
    const freeT = ts.filter(t => !isLent(t) && !t.awayPoolAt && lendMode(t) !== 'stop');
    title = `区域の数 ${ts.length}`;
    body = `<div class="tlsum"><span>貸出中</span><b>${lentT.length}</b>${paperT.length ? `<span>紙の記録で貸出中</span><b>${paperT.length}</b>` : ''}<span>留守宅カードで回っている</span><b>${pool.length}</b><span>空いている</span><b>${freeT.length}</b><span>貸出中止</span><b>${stop.length}</b>${ts.some(isSpecial) ? `<span>そのうち特別区域</span><b>${ts.filter(isSpecial).length}</b>` : ''}</div>
      ${lentT.length ? `<h3 class="sub">貸出中（${lentT.length}）</h3>${lentT.sort((a, b) => (a.lentAt < b.lentAt ? -1 : 1)).map(t => statRow(t, `${esc(uname(t.holder))}さん・${daysSince(t.lentAt)}日目`, pastDue(t))).join('')}` : ''}
      ${paperT.length ? `<h3 class="sub">紙の記録で貸出中（${paperT.length}）</h3>${paperT.sort((a, b) => (a.paperLentAt < b.paperLentAt ? -1 : 1)).map(t => { const ph = paperHoldOf(t); return statRow(t, `${esc(ph.name || '名前なし')}・${daysSince(ph.a)}日目`, daysSince(ph.a) > lendDays()); }).join('')}` : ''}
      ${pool.length ? `<h3 class="sub">留守宅カードで回っている（${pool.length}）</h3>${pool.map(t => { const p = poolInfo(t); return statRow(t, p ? `訪ね直し ${p.done}/${p.n}（${p.pct}%）` : ''); }).join('')}` : ''}
      ${stop.length ? `<h3 class="sub">貸出中止（${stop.length}）</h3>${stop.map(t => statRow(t, '貸出中止')).join('')}` : ''}`;
  } else if (key === 'over') {
    const list = ts.filter(pastDue).sort((a, b) => (a.lentAt < b.lentAt ? -1 : 1));
    title = `返却の目安を過ぎた貸出 ${list.length}`;
    hint = `受け取ってから${lendDays()}日（返却の目安）をこえている区域です。古い順です。`;
    body = list.length ? list.map(t => { const r = roundInfo(t.id, true); return statRow(t, `${esc(uname(t.holder))}さん・${daysSince(t.lentAt)}日目${r ? `・進み具合 約${r.pct}%${r.phase === 'away' ? '（留守宅を回る段階）' : ''}` : ''}`, true); }).join('') : '<div class="empty">ありません</div>';
  } else if (key === 'units') {
    let house = 0, aptB = 0, aptU = 0, biz = 0, cov = 0, prov = 0, outN = 0, outU = 0;
    const per = new Map();
    for (const h of D().houses) {
      if (!h.terrId) { outN++; outU += targets(h).length; continue; }
      if (h.prov) prov++;
      if (h.type === 'apt') { aptB++; aptU += h.units.length; } else if (kindOf(h) !== 'home') biz++; else house++;
      targets(h).forEach(u => { if (coveredBySpecial(h, u)) cov++; });
      per.set(h.terrId, (per.get(h.terrId) || 0) + targets(h).length);
    }
    title = `家・部屋 ${house + biz + aptU}`;
    hint = '区域の線の中にある家・部屋の数です。区域ごとの数は、多い順に並べています。';
    const rows = ts.filter(t => !isSpecial(t)).map(t => [t, per.get(t.id) || 0]).sort((a, b) => b[1] - a[1]);
    body = `<div class="tlsum"><span>一戸建て（住居）</span><b>${house}</b><span>住居以外（店・会社など）</span><b>${biz}</b><span>集合住宅</span><b>${aptB}棟・${aptU}部屋</b>
      ${cov ? `<span>特別区域で回る家・部屋</span><b>${cov}</b>` : ''}${prov ? `<span>まだ確かめていない仮の家</span><b>${prov}</b>` : ''}${outN ? `<span>区域の外（どの区域にも入っていない）</span><b>${outN}件（${outU}）</b>` : ''}</div>
      <h3 class="sub">区域ごと</h3>${rows.map(([t, n]) => statRow(t, `家・部屋 ${n}`)).join('')}`;
  } else if (key === 'met') {
    const rows = ts.filter(t => !isSpecial(t)).map(t => {
      let n = 0, m = 0;
      housesOf(t.id).forEach(h => targets(h).forEach(u => { n++; const sm = sum(K(h.id, u)); if (sm.met && now - Date.parse(sm.met.at) <= 90 * DAY) m++; }));
      return [t, n, m, n ? Math.round(m / n * 100) : 0];
    }).filter(x => x[1]).sort((a, b) => a[3] - b[3]);
    title = 'この90日で会えた家・部屋（区域ごと）';
    hint = '割合の低い区域から並べています。低い区域は、時間帯を変えて訪ねると会えることがあります。';
    body = rows.map(([t, n, m, p]) => statRow(t, `${p}%（${n}のうち${m}）`)).join('') || '<div class="empty">記録がありません</div>';
  } else if (key === 'dnc') {
    const per = new Map(); let pin = 0;
    for (const k in D().dnc) {
      const v = D().dnc[k];
      let tid = null;
      if (isPinKey(k)) { tid = dncTerrOf(v); pin++; }
      else { const h = houseById(k.split('|')[0]); tid = h ? h.terrId : null; }
      per.set(tid || '', (per.get(tid || '') || 0) + 1);
    }
    title = `拒否の家・部屋 ${Object.keys(D().dnc).length}`;
    hint = '区域ごとの数です。くわしい一覧（住所・地図で確かめる）は「拒否・！」タブにあります。';
    const rows = ts.filter(t => per.get(t.id)).map(t => statRow(t, `拒否 ${per.get(t.id)}`));
    body = `<button type="button" class="btn block" data-tldnc>「拒否・！」の一覧を開く</button>${rows.join('')}${per.get('') ? `<p class="muted">区域の外：${per.get('')}</p>` : ''}`;
  } else if (key === 'prov') {
    const per = new Map();
    D().houses.forEach(h => { if (h.prov) per.set(h.terrId || '', (per.get(h.terrId || '') || 0) + 1); });
    title = `まだ確かめていない仮の家 ${[...per.values()].reduce((a, b) => a + b, 0)}`;
    hint = '地図データから入れた仮の家です。奉仕しながら、家でない印を消したり直したりします。区域ごとの数です。';
    body = ts.filter(t => per.get(t.id)).sort((a, b) => per.get(b.id) - per.get(a.id)).map(t => statRow(t, `仮の家 ${per.get(t.id)}`)).join('') + (per.get('') ? `<p class="muted">区域の外：${per.get('')}</p>` : '');
  } else return;
  setSheet(headHtml(null, title, '') + (hint ? `<p class="hint">${hint}</p>` : '') + body + '<button class="btn block" data-close>閉じる</button>');
  const S = $('#sheet');
  $$('[data-tlmap]', S).forEach(b => b.onclick = () => { closeSheet(); openTerr(b.dataset.tlmap); });
  $$('[data-tlkarte]', S).forEach(b => b.onclick = () => KM.openKarte(b.dataset.tlkarte, back));
  const d = $('[data-tldnc]', S); if (d) d.onclick = () => { closeSheet(); setAdPane('dnc'); renderAdmin(); $('#view-admin').scrollTop = 0; };
}
/* 区域の削除（区域係のみ）。家を残すか、まとめて消すかを選ぶ */
function openDeleteTerr(tid) {
  const t = terrById(tid); if (!t || !isAdmin()) return;
  if (isSpecial(t)) { // 特別区域は、家を集めて見せているだけ。消しても家・記録はふつうの区域に残る
    setSheet(headHtml(t, `特別区域 ${esc(t.no)}を削除します`, esc(t.name)) + `
      <p>この特別区域のカードだけを消します。<b>家と訪問の記録は、ふつうの区域にそのまま残ります。</b>${spExcludes(t) ? '<br>消すと、この家はまた、ふつうの区域カードで回る家にもどります。' : ''}</p>
      ${t.holder ? `<div class="notice warn">今は${esc(uname(t.holder))}さんに貸し出し中です。消すと、その貸し出しは終わります。</div>` : ''}
      <button class="btn danger block" id="spDel">この特別区域を削除する</button>
      <button class="btn block" data-close>やめる</button>`);
    $('#spDel').onclick = () => { closeSheet(); deleteTerr(tid, false); };
    return;
  }
  const hs = housesOf(tid);
  const targetsN = hs.reduce((a, h) => a + targets(h).length, 0);
  let visits = 0;
  hs.forEach(h => targets(h).forEach(u => { visits += sum(K(h.id, u)).n; }));
  setSheet(headHtml(t, `区域${esc(t.no)}を削除します`, esc(t.name)) + `
    <div class="notice warn"><b>この区域には、家 ${hs.length}件（部屋を含めて ${targetsN}）と、訪問記録 ${visits}件があります。</b>
      ${t.holder ? `<br>今は${esc(uname(t.holder))}さんに貸し出し中です。` : ''}</div>
    <p class="q">家のデータはどうしますか？</p>
    <div class="choices two">
      <button class="choice" data-del="keep">家は残す<small>区域の線だけ消します。家は「区域外の家」になり、新しい区域の線を引くとその区域に入ります</small></button>
      <button class="choice c-refx" data-del="all">家と記録もまとめて消す<small>元に戻せるのは、この画面のお知らせの「取り消す」だけです</small></button>
    </div>
    <button class="btn block" data-close>やめる</button>`);
  $$('[data-del]', $('#sheet')).forEach(x => x.onclick = async () => {
    const all = x.dataset.del === 'all';
    const msg = all
      ? `区域${t.no}と、家 ${hs.length}件・訪問記録 ${visits}件をすべて削除します。\n本当によろしいですか？`
      : `区域${t.no}の線を削除します。家 ${hs.length}件は「区域外の家」として残ります。\nよろしいですか？`;
    if (!await ask(msg)) return;
    closeSheet();
    deleteTerr(tid, all);
  });
}
function deleteTerr(tid, withHouses) {
  const t = terrById(tid); if (!t) return;
  const n = housesOf(tid).length;
  commit(withHouses ? `区域${t.no}と家 ${n}件を削除しました` : `区域${t.no}を削除しました（家は残しました）`, () => deleteTerrData(tid, withHouses));
}
function deleteTerrData(tid, withHouses) {
  const ids = housesOf(tid).map(h => h.id);
  {
    if (withHouses) {
      const set = new Set(ids);
      Object.keys(D().dnc).forEach(k => { if (!isPinKey(k) && set.has(k.split('|')[0])) dncDrop(k, null, true); }); // 拒否は残す（家を消す前に。住所のない拒否も・H8・D5）
      D().houses = D().houses.filter(h => !set.has(h.id));
      D().visits = D().visits.filter(v => !set.has(v.houseId));
      [D().dnc, D().follows, D().released].forEach(m => Object.keys(m).forEach(k => { if (set.has(k.split('|')[0])) delete m[k]; }));
    } else {
      D().houses.forEach(h => { if (h.terrId === tid) h.terrId = null; });
    }
    // この区域の留守宅カードは終わりにし、申し込みは「どこでもよい」に変える
    const now = new Date().toISOString();
    D().awayCards.forEach(c => { if (c.terrId === tid && !c.endedAt) c.endedAt = now; });
    D().requests.forEach(r => { if (r.terrId === tid) r.terrId = null; });
    D().territories = D().territories.filter(x => x.id !== tid);
    if (curTerr === tid) curTerr = null;
    if (roundTerr === tid) roundTerr = null;
  }
}

/* 取り残し：関心があるのに受け持ちがなく、しばらく訪問がない家（引き継ぎ待ちを先に） */
function leftItems() {
  const s = D().settings, out = [];
  for (const h of D().houses) {
    for (const unit of targets(h)) {
      const k = K(h.id, unit);
      if (D().follows[k] || D().dnc[k]) continue;
      const m = lastInterest(k); if (!m) continue;
      const idle = daysSince(sum(k).last.at), rel = relOf(k);
      if (!rel && idle < s.remindDays) continue;
      out.push({ k, h, unit, m, idle, rel });
    }
  }
  return out.sort((a, b) => (b.rel ? 1 : 0) - (a.rel ? 1 : 0) || b.idle - a.idle);
}
function renderFollowAdmin() {
  const s = D().settings;
  const entries = Object.entries(D().follows).filter(([k]) => houseById(parseKey(k)[0]));
  const check = entries.filter(([, f]) => followStage(f) === 2).sort((a, b) => followIdle(b[1]) - followIdle(a[1]));
  const left = leftItems();
  $('#adFollowTiles').innerHTML = `
    <div class="tile"><b>${entries.length}</b>受け持ち中の再訪問</div>
    <div class="tile${check.length ? ' alert' : ''}"><b>${check.length}</b>確認が必要な受け持ち</div>
    <div class="tile${left.length ? ' alert' : ''}"><b>${left.length}</b>取り残し（受け持ちなし）</div>`;

  const wk = d => `${d / 7}週間`;
  const stepper = (key, label) => `<div class="setrow"><span>${label}</span><div class="stepper">
      <button type="button" data-set="${key}" data-d="-7" aria-label="${label}を短くする">−</button><output class="wide">${wk(s[key])}</output>
      <button type="button" data-set="${key}" data-d="7" aria-label="${label}を長くする">＋</button></div></div>`;
  $('#adFollowSet').innerHTML = stepper('remindDays', '「しばらく訪問なし」として本人に知らせるまで') +
    stepper('escalateDays', '「確認が必要」として係に知らせるまで');

  const by = {};
  entries.forEach(([, f]) => {
    const o = by[f.by] = by[f.by] || { n: 0, s1: 0, s2: 0 };
    o.n++; const g = followStage(f); if (g === 1) o.s1++; if (g === 2) o.s2++;
  });
  const ids = Object.keys(by);
  $('#adFollowUsers').innerHTML = ids.length
    ? `<table class="slots narrow"><tr><th>名前</th><th>受け持ち</th><th>しばらく訪問なし</th><th>確認が必要</th></tr>${ids.map(id =>
        `<tr><th>${esc(uname(id))}</th><td>${by[id].n}</td><td>${by[id].s1}</td><td class="${by[id].s2 ? 'warncell' : ''}">${by[id].s2}</td></tr>`).join('')}</table>`
    : '<p class="muted">受け持ちはまだありません。</p>';

  $('#adFollowCheck').innerHTML = check.length ? check.map(([k, f]) => followItem(k, f, 'admin')).join('')
    : '<div class="empty">確認が必要な受け持ちはありません。</div>';

  $('#adLeft').innerHTML = left.length ? left.slice(0, 30).map(i => {
    const t = terrById(i.h.terrId), bs = bestSlot(i.k);
    return `<article class="ritem ${i.rel ? 'k-handoff' : 'k-interest'}"><div>
      <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> ${targetName(i.h, i.unit)}</p>
      <p class="muted">${i.rel ? '<b>引き継ぎ待ち</b>　' : ''}★${YOUNG.has(i.m.age) ? '・若い世代' : ''}　最後の記録から ${i.idle}日${bs ? `　会えた時間帯：${bs}` : ''}</p>
    </div><button class="btn small" data-go="${esc(i.h.id)}" data-unit="${esc(i.unit)}">地図で見る</button>
    <div class="actions span"><label>受け持つ人 <select data-assign="${esc(i.k)}">${userOptions('', '選んでください')}</select></label></div></article>`;
  }).join('') + (left.length > 30 ? `<p class="muted">ほか ${left.length - 30}件</p>` : '')
    : '<div class="empty">取り残されている家はありません。</div>';

  $('#adBulk').innerHTML = `
    <label>だれから <select id="bkFrom"><option value="">選んでください</option>${ids.map(id => `<option value="${esc(id)}">${esc(uname(id))}（${by[id].n}件）</option>`).join('')}</select></label>
    <label>だれへ <select id="bkTo">${userOptions('', '引き継ぎ待ちにする')}</select></label>
    <button class="btn" id="bkGo">まとめて移す</button>`;
}
function changeSetting(key, d) {
  const s = D().settings;
  if (key === 'remindDays') {
    s.remindDays = Math.min(84, Math.max(7, s.remindDays + d));
    if (s.escalateDays < s.remindDays + 7) s.escalateDays = s.remindDays + 7;
  } else {
    s.escalateDays = Math.min(140, Math.max(s.remindDays + 7, s.escalateDays + d));
  }
  Store.save(); renderAll(); toast('日数を変えました');
}
async function bulkMove() {
  const from = $('#bkFrom').value, to = $('#bkTo').value;
  if (!from) { toast('「だれから」を選んでください'); return; }
  if (from === to) { toast('同じ人は選べません'); return; }
  const keys = Object.keys(D().follows).filter(k => D().follows[k].by === from);
  const toLabel = to ? `${uname(to)}さん` : '引き継ぎ待ち';
  if (!await ask(`${uname(from)}さんの受け持ち ${keys.length}件を「${toLabel}」に移します。よろしいですか？`)) return;
  commit(`${keys.length}件を${toLabel}に移しました`, () => {
    keys.forEach(k => { if (to) startFollow(k, to); else releaseFollow(k, 'handoff'); });
  });
}
function exportCsv() {
  const rows = [['区域番号', '家ID', '種類', '部屋', '結果', '年代', '再訪問', '日時', '曜日区分', '時間帯', 'おすすめ経由']];
  for (const v of D().visits) {
    const h = houseById(v.houseId), t = h && terrById(h.terrId), d = new Date(v.at);
    rows.push([t ? t.no : '', v.houseId, h ? (h.type === 'apt' ? '集合住宅' : '一戸建て') : '', v.unit ? uName(h, v.unit) : '',
      RESULT_LABEL[v.result], ageName(v.age), intName(v.interest),
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      dayTypeOf(d), bandOf(d), recoLabel(v.src)]);
  }
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  const n = new Date();
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `訪問記録_${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* =========================================================
   ホーム：奉仕の集まりの予定・自分の予定・奉仕時間
   ・奉仕時間と自分の予定は、本人のスマホの中だけに保存（サーバーには送らない）
   ・奉仕の集まりの予定は、グループ監督・区域係が入れ、グループの人に届く
   ========================================================= */
const normGroup = g => String(g || '').normalize('NFKC').replace(/\s+/g, '').slice(0, 30);
const isOverseer = () => !!me().overseer && !!me().group;
/* グループ奉仕の区域を受け取れる人：グループ監督と司会者 */
const canGroupTerr = () => !!me().group && (!!me().overseer || !!me().leader);
const canGroupUser = u => !!u && !!u.group && (!!u.overseer || !!u.leader); // その人が集まりで使う区域を持てるか
/* 集まりで使う区域の使い道（2026-10-22）：t.group があるのが「集まりで使う区域」。
   t.use === 'all' は全体の集まり（金曜の晩・日曜の昼など、グループをこえた集まり）、なければグループ奉仕。
   今日回る人・範囲分け・枚数の数え方は、どちらも同じ（枚数はグループ奉仕と合わせて数える） */
const isAllUse = x => !!(x && x.group && x.use === 'all');
const useName = x => (isAllUse(x) ? '全体の集まり' : `${x.group}グループ`);
/* 区域係：使い道をえらぶ（担当が監督・司会者のときだけ出す。以前のチェックで、そうでない人の区域が集まりの区域になっているときも、個人にもどせるように出す） */
function useSelectHtml(t, attr) {
  const u = t.holder ? userById(t.holder) : null;
  if (!u || !(canGroupUser(u) || t.group)) return '';
  const cur = !t.group ? '' : isAllUse(t) ? 'all' : 'g', ok = canGroupUser(u);
  const o = (v, l) => (ok || v === '' || v === cur) ? `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>` : '';
  return `<label>使い道 <select ${attr}="${t.id}" aria-label="区域${esc(t.no)}の使い道">${o('', '個人の区域')}${o('g', `${esc(u.group || t.group)}グループ奉仕`)}${o('all', '全体の集まり')}</select></label>`;
}
function setTerrUse(t, v) {
  const u = t && userById(t.holder);
  if (!t || !u) return;
  if (v && !canGroupUser(u)) { toast('グループ監督・司会者の区域だけを、集まりで使う区域にできます'); renderAll(); return; }
  commit(v === 'all' ? `区域${t.no}を全体の集まりの区域にしました` : v ? `区域${t.no}を${u.group}グループの区域にしました` : `区域${t.no}を個人の区域にしました`, () => {
    t.group = v ? u.group : null;
    if (v === 'all') t.use = 'all'; else delete t.use;
  });
}
const myGroup = () => me().group || '';
const groupsAll = () => [...new Set(D().users.filter(u => !u.inactive && u.group).map(u => u.group))].sort((a, b) => a.localeCompare(b, 'ja'));
const groupMembers = g => D().users.filter(u => !u.inactive && u.group === g);
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parseYmd = s => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const fmtYmd = s => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`; };
const fmtMin = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}時間${r}分` : `${h}時間`) : `${r}分`; };
const fmtHM = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

/* 本人のスマホの中の記録 */
const myKey = () => 'kuiki_my_' + me().id;
function myData() {
  let o;
  try { o = JSON.parse(lsGet(myKey()) || '{}') || {}; } catch (e) { o = {}; }
  o.log = o.log || {}; o.events = o.events || []; o.goals = o.goals || {}; o.days = o.days || [0, 6]; o.timer = o.timer || null;
  o.plan = o.plan || {}; o.reports = o.reports || {}; o.repAsk = o.repAsk || {}; // 日ごとの計画（分）・送った報告・報告の画面を出した日
  return o;
}
const mySave = o => { if (!lsSet(myKey(), JSON.stringify(o))) toast('このスマホに保存できませんでした'); };
const monthMin = (o, ym) => Object.entries(o.log).filter(([d]) => d.startsWith(ym)).reduce((a, [, m]) => a + m, 0);
const monthDays = (o, ym) => Object.entries(o.log).filter(([d, m]) => d.startsWith(ym) && m > 0).length;

/* ---- 奉仕タイマー ----
   ・設定の「タイマー」が「使う」のとき：「奉仕終了」を押すだけで、その日の時間に足す（自動で記録）
     8時間をこえた・日をまたいだときだけ、止め忘れかもしれないので、時間を確かめてから記録する
   ・月末にタイマーを止めたときは、そのまま月の奉仕報告の画面を出す
   ・「使わない」のとき：ホームで、今日の時間を＋−で入れる（押すとすぐ保存） */
let timerTick = null;
function timerMs(t) { return !t ? 0 : t.acc + (t.state === 'run' ? Date.now() - t.startAt : 0); }
function timerAction(act) {
  const o = myData(), t = o.timer;
  if (act === 'start') o.timer = { state: 'run', startAt: Date.now(), acc: 0, day: ymd(new Date()) };
  else if (act === 'pause' && t && t.state === 'run') { t.acc += Date.now() - t.startAt; t.state = 'pause'; }
  else if (act === 'resume' && t && t.state === 'pause') { t.startAt = Date.now(); t.state = 'run'; }
  else if (act === 'stop' && t) { finishTimer(); return; }
  mySave(o); renderHome();
}
function finishTimer() {
  const o = myData(), t = o.timer; if (!t) return;
  const ms = timerMs(t), min = Math.round(ms / 60000);
  if (ms > 8 * 3600000 || t.day !== ymd(new Date())) { openTimerStop(true); return; } // 止め忘れかもしれない
  o.timer = null;
  if (min < 1) { mySave(o); renderHome(); toast('1分に満たないので、記録しませんでした'); return; }
  o.log[t.day] = (o.log[t.day] || 0) + min; mySave(o); renderHome();
  afterRecord(t.day, min);
}
/* 記録したあと：月末なら奉仕報告の画面、ふだんは、ほめ言葉と「直す」ボタンのお知らせ */
function afterRecord(day, min) {
  const o = myData(), ym = day.slice(0, 7);
  if (UI.fTimer !== 'off' && isLastDayStr(day) && day === ymd(new Date()) && !o.reports[ym]) {
    o.repAsk[ym] = day; mySave(o);
    openReportSheet(ym, { auto: true });
    return;
  }
  toast(`${praiseShort()}　${fmtMin(min)}を記録しました（今日 ${fmtMin(o.log[day] || 0)}）`, null, { label: '直す', fn: () => openDay(day) });
}
function openTimerStop(warn) {
  const o = myData(), t = o.timer; if (!t) return;
  let min = Math.round(timerMs(t) / 60000);
  const paint = () => {
    setSheet(headHtml(null, '奉仕を終わります', fmtYmd(t.day)) + `
      ${warn ? '<div class="notice warn">タイマーが長いあいだ動いていました。止め忘れのときは、時間を直してから記録してください。</div>' : ''}
      <p class="q">この時間を記録します</p>
      <div class="stepper" style="justify-content:center"><button type="button" data-tm="-15" aria-label="15分へらす">−</button>
        <output class="wide" style="min-width:170px">${fmtMin(min)}</output><button type="button" data-tm="15" aria-label="15分ふやす">＋</button></div>
      <div class="row" style="justify-content:center"><button type="button" class="btn small" data-tm="-60" data-keep>−1時間</button><button type="button" class="btn small" data-tm="60" data-keep>＋1時間</button></div>
      <p class="hint">記録は、このスマホの中だけに保存されます。ホームのカレンダーの${fmtYmd(t.day)}に足されます。</p>
      <button class="btn primary block" id="tmSave">記録して終わる</button>
      <button class="btn block" id="tmDiscard">記録しないで終わる</button>
      <button class="btn block" data-close>もどる（続ける）</button>`);
    $$('[data-tm]', $('#sheet')).forEach(b => b.onclick = () => { min = Math.max(0, Math.min(16 * 60, min + Number(b.dataset.tm))); paint(); });
    $('#tmSave').onclick = () => {
      const x = myData();
      if (min) x.log[t.day] = (x.log[t.day] || 0) + min;
      x.timer = null; mySave(x);
      closeSheet(); renderHome();
      if (min) afterRecord(t.day, min);
    };
    $('#tmDiscard').onclick = async () => {
      if (!await ask('この時間は記録しません。よろしいですか？')) return;
      const x = myData(); x.timer = null; mySave(x); closeSheet(); renderHome();
    };
  };
  paint();
}
/* タイマーを使わない人：今日の時間を＋−で入れる（押すとすぐ保存） */
/* ---- 今日の奉仕時間（タイマーを使わない人）：時間と分のダイヤル（2026.13.96）----
   ・左が時間（0〜16）、右が分（5分ごと）。上下にスワイプして止まったところで、すぐ保存（このスマホだけ）
   ・数字を押してもその値に合わせる。上下の矢印キーでも動かせる
   ・保存したときは、ダイヤルは描き直さず、下の「○月の奉仕」のカードだけを新しくする（回している途中で戻らないように） */
const TD_H = Array.from({ length: 17 }, (_, i) => i);
const tdMins = cur => { const a = Array.from({ length: 12 }, (_, i) => i * 5); if (!a.includes(cur)) a.push(cur); return a.sort((x, y) => x - y); };
function manualTodayHtml(o) {
  const d = ymd(new Date()), m = o.log[d] || 0, p = o.plan[d] || 0, H = Math.floor(m / 60), Mi = m % 60;
  const col = (k, vals, cur, unit, label) => `<div class="wheel2 tcol"><div class="wband" aria-hidden="true"></div>
    <div class="wlist" data-tdial="${k}" role="listbox" tabindex="0" aria-label="${label}（上下にスワイプ）"><div class="wpad"></div>${vals.map(v =>
      `<div class="witem${v === cur ? ' on' : ''}" role="option" data-tdv="${v}" aria-selected="${v === cur}">${v}${unit}</div>`).join('')}<div class="wpad"></div></div></div>`;
  return `<div class="mtoday"><p class="q">今日の奉仕時間</p>
    <div class="tdial">${col('h', TD_H, H, '時間', '時間')}${col('m', tdMins(Mi), Mi, '分', '分')}</div>
    <p class="muted" id="tdSum">${m ? `今日 ${fmtMin(m)}` : 'まだ入れていません'}${p ? `　今日の計画 ${fmtMin(p)}${m >= p ? '　✓ 達成しました' : ''}` : ''}</p>
    <p class="hint">上下にスワイプして合わせると、すぐ保存されます（このスマホだけ）。ほかの日は、下のカレンダーの日にちを押して入れられます。</p></div>`;
}
function bindTodayDial() {
  const box = $('#homeTimer .tdial'); if (!box) return;
  const lists = $$('[data-tdial]', box);
  const ih = l => { const it = $$('.witem', l); return it.length > 1 ? it[1].offsetTop - it[0].offsetTop : 42; };
  const idx = l => Math.max(0, Math.min($$('.witem', l).length - 1, Math.round(l.scrollTop / ih(l))));
  const valOf = l => Number($$('.witem', l)[idx(l)].dataset.tdv);
  const mark = l => { const i = idx(l); $$('.witem', l).forEach((x, j) => { x.classList.toggle('on', j === i); x.setAttribute('aria-selected', j === i ? 'true' : 'false'); }); };
  let busy = true;
  const save = () => {
    const h = valOf(lists[0]), mi = valOf(lists[1]), x = myData(), d = ymd(new Date()), before = x.log[d] || 0, v = Math.min(16 * 60, h * 60 + mi);
    if (v === before) return;
    if (v) x.log[d] = v; else delete x.log[d];
    mySave(x);
    // ダイヤルは描き直さない：まわりの表示だけ新しくする
    const p = x.plan[d] || 0, sum = $('#tdSum');
    if (sum) sum.textContent = `${v ? `今日 ${fmtMin(v)}` : 'まだ入れていません'}${p ? `　今日の計画 ${fmtMin(p)}${v >= p ? '　✓ 達成しました' : ''}` : ''}`;
    if ($('#homeGoal')) $('#homeGoal').innerHTML = goalHtml(x);
    if ($('#homeMonthEnd')) $('#homeMonthEnd').innerHTML = monthEndHtml(x);
    if (p && before < p && v >= p) toast(`今日の計画 ${fmtMin(p)} を達成しました！ ${praiseShort()}`);
    else toast(`保存しました（今日 ${v ? fmtMin(v) : '0分'}）`);
  };
  lists.forEach(l => {
    const on = $$('.witem', l).findIndex(x => x.classList.contains('on'));
    l.scrollTop = Math.max(0, on) * ih(l);
    let t = 0;
    l.addEventListener('scroll', () => {
      if (busy) return;
      mark(l); clearTimeout(t); t = setTimeout(save, 220);
    }, { passive: true });
    l.addEventListener('click', e => {
      const it = e.target.closest('[data-tdv]'); if (!it) return;
      l.scrollTo({ top: $$('.witem', l).indexOf(it) * ih(l), behavior: 'smooth' });
    });
    l.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      l.scrollTo({ top: Math.max(0, Math.min($$('.witem', l).length - 1, idx(l) + (e.key === 'ArrowDown' ? 1 : -1))) * ih(l), behavior: 'smooth' });
    });
  });
  setTimeout(() => { busy = false; }, 80); // はじめの位置合わせでは保存しない
}
function addToday(dm) {
  const x = myData(), d = ymd(new Date()), before = x.log[d] || 0, v = Math.max(0, Math.min(16 * 60, before + dm));
  if (v) x.log[d] = v; else delete x.log[d];
  mySave(x); renderHome();
  const p = x.plan[d] || 0;
  if (dm > 0 && p && before < p && v >= p) toast(`今日の計画 ${fmtMin(p)} を達成しました！ ${praiseShort()}`);
}

/* ---- 日本の祝日（アプリの中で計算する。外のサービスには問い合わせない） ----
   ・今の祝日法にそって計算（春分・秋分は計算式。2099年まで使える）
   ・振替休日（日曜の祝日の次の休みでない日）と、国民の休日（祝日にはさまれた平日）も入れる
   ・沖縄の「慰霊の日」（6月23日）は、県の休日として入れる（学校や役所が休みで、家にいる人が多いため） */
const HOL_CACHE = {};
function jpHolidays(y) {
  if (HOL_CACHE[y]) return HOL_CACHE[y];
  const H = {}, set = (m, d, n) => { H[ymd(new Date(y, m - 1, d))] = n; };
  const nthMon = (m, n) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + (n - 1) * 7;
  const k = y - 1980;
  set(1, 1, '元日'); set(1, nthMon(1, 2), '成人の日'); set(2, 11, '建国記念の日'); set(2, 23, '天皇誕生日');
  set(3, Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4)), '春分の日');
  set(4, 29, '昭和の日'); set(5, 3, '憲法記念日'); set(5, 4, 'みどりの日'); set(5, 5, 'こどもの日');
  set(7, nthMon(7, 3), '海の日'); set(8, 11, '山の日'); set(9, nthMon(9, 3), '敬老の日');
  set(9, Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4)), '秋分の日');
  set(10, nthMon(10, 2), 'スポーツの日'); set(11, 3, '文化の日'); set(11, 23, '勤労感謝の日');
  // 国民の休日：前の日も次の日も祝日の、日曜でない日
  for (let d = new Date(y, 0, 2); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    const key = ymd(d); if (H[key] || d.getDay() === 0) continue;
    const a = new Date(d), b = new Date(d); a.setDate(a.getDate() - 1); b.setDate(b.getDate() + 1);
    if (H[ymd(a)] && H[ymd(b)] && !/振替/.test(H[ymd(a)])) H[key] = '国民の休日';
  }
  // 振替休日：日曜の祝日の、次の祝日でない日
  Object.keys(H).sort().forEach(key => {
    const d = parseYmd(key); if (d.getDay() !== 0) return;
    const n = new Date(d);
    do { n.setDate(n.getDate() + 1); } while (H[ymd(n)]);
    if (n.getFullYear() === y) H[ymd(n)] = '振替休日';
  });
  const irei = ymd(new Date(y, 5, 23)); if (!H[irei]) H[irei] = '慰霊の日（沖縄）';
  return (HOL_CACHE[y] = H);
}
const holidayOf = key => jpHolidays(Number(key.slice(0, 4)))[key] || '';

/* ---- 目標と計画 ----
   ・目標（月の時間）と、日ごとの計画（何時間するか）は、このスマホの中だけに保存
   ・「計画とのちがい」＝ これまでの記録 −（昨日までの計画 ＋ 今日の計画のうち、今日すでに記録した分）
     今日の分は、まだ途中かもしれないので、足りなくても「遅れ」には数えない */
/* マスの中の短い時間：2h・1.5h・1h45・45分 */
const fmtH = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return !r ? `${h}h` : r === 30 ? `${h}.5h` : h ? `${h}h${pad(r)}` : `${r}分`; };
const planMin = (o, ym, upto) => Object.entries(o.plan).filter(([d]) => d.startsWith(ym) && (!upto || d <= upto)).reduce((a, [, m]) => a + m, 0);
function planDiff(o, ym) {
  const today = ymd(new Date());
  if (!today.startsWith(ym)) return monthMin(o, ym) - planMin(o, ym, today < ym ? '0' : null);
  const before = Object.entries(o.plan).filter(([d]) => d.startsWith(ym) && d < today).reduce((a, [, m]) => a + m, 0);
  return monthMin(o, ym) - (before + Math.min(o.plan[today] || 0, o.log[today] || 0));
}
const isLastDayStr = s => { const d = parseYmd(s); return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
/* ---- 奉仕報告の入口（ホームの「○月の奉仕」のカード）----
   ・奉仕時間を使う人には、いつでも「奉仕報告」ボタン（新しい設定は作らない）
   ・報告の時期（月末の日〜翌月の締切日）にまだ送っていなければ、目立つ色にして「○月の報告がまだです」
   ・押すと、報告の画面（先月｜今月を切りかえられる）。はじめの月は、1日〜締切日は先月、それ以外は今月
   ・締切日：翌月10日（S21 v37・2026-10-28 から。以前は5日）。S21 に送る人は、S21 が返した締切日（この端末の o.s21p.dl）を使う */
const REPORT_DL = 10;
function reportDl() {
  let n = NaN;
  try { const p = Store.data ? myData().s21p : null; n = p ? Number(p.dl) : NaN; } catch (e) { n = NaN; }
  return n >= 1 && n <= 28 && Math.floor(n) === n ? n : REPORT_DL;
}
const prevYm = d => ymOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));
function reportYmNow() { const d = new Date(); return d.getDate() <= reportDl() ? prevYm(d) : ymOf(d); }
function reportSeasonYm() { const d = new Date(); return isLastDayStr(ymd(d)) ? ymOf(d) : d.getDate() <= reportDl() ? prevYm(d) : null; }
function reportLineHtml(o) {
  const ym = reportSeasonYm(), due = ym && !o.reports[ym];
  const st = !ym ? '' : due ? `<b>${Number(ym.slice(5))}月の報告がまだです</b>` : `<span class="muted">${Number(ym.slice(5))}月は報告済みです</span>`;
  return `<div class="rpentry">${st ? `<span>${st}</span>` : ''}<button class="btn small${due ? ' primary' : ''}" id="goalReport">奉仕報告</button></div>`;
}
/* 報告の画面のいちばん上：先月｜今月の切りかえ（ボタンから開いたときだけ） */
function reportPickHtml(ym) {
  const d = new Date(), a = prevYm(d), b = ymOf(d);
  return `<div class="seg rppick" role="group" aria-label="報告する月">${[[a, '先月'], [b, '今月']].map(([v, l]) =>
    `<button type="button" data-rpym="${v}" aria-pressed="${v === ym}">${l}（${Number(v.slice(5))}月）</button>`).join('')}</div>`;
}
function bindReportPick(opt) {
  $$('[data-rpym]', $('#sheet')).forEach(b => b.onclick = () => { if (b.getAttribute('aria-pressed') !== 'true') openReportSheet(b.dataset.rpym, { pick: true }); });
}
function goalHtml(o) {
  const now = new Date(), ym = ymOf(now), today = ymd(now), goal = o.goals[ym] || 0, done = monthMin(o, ym);
  const plan = planMin(o, ym), tp = o.plan[today] || 0, td = o.log[today] || 0;
  let body = `<div class="row" style="justify-content:space-between;margin:0"><b style="font-size:20px">${now.getMonth() + 1}月の奉仕 ${fmtMin(done)}</b>
    <button class="btn small" id="goalEdit">${goal || plan ? '目標と計画' : '目標を決める'}</button></div>`;
  if (goal) {
    const pct = Math.min(100, Math.round(done / goal * 100));
    body += `<div class="progress big" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="目標までの進み具合"><i style="width:${pct}%"></i></div>
      <p class="muted">目標 ${fmtMin(goal)}（${pct}%）${done < goal ? `　あと ${fmtMin(goal - done)}` : ''}</p>`;
    if (done >= goal) body += `<p class="okmsg"><b>目標を達成しました！</b>${done > goal ? `　目標より ${fmtMin(done - goal)} 多く奉仕しています。` : 'すばらしいですね。'}</p>`;
  }
  if (plan) {
    const diff = planDiff(o, ym);
    body += diff >= 0
      ? `<p class="gdiff ahead">${diff ? `計画より ${fmtMin(diff)} 先に進んでいます` : '計画どおりに進んでいます'}</p>`
      : `<p class="gdiff behind">計画まで あと ${fmtMin(-diff)}</p>`;
    if (tp) body += `<span class="gtoday">今日の計画 ${fmtMin(tp)}${td ? `（記録 ${fmtMin(td)}${td >= tp ? ' ✓' : ''}）` : ''}</span>`;
    if (goal) body += plan >= goal ? `<p class="muted">月の計画 ${fmtMin(plan)}：目標に届く計画です ✓</p>`
      : `<p class="muted">月の計画 ${fmtMin(plan)}：目標まで、計画があと ${fmtMin(goal - plan)} 足りません</p>`;
    const next = Object.keys(o.plan).filter(d => d > today && d.startsWith(ym) && o.plan[d] > 0).sort().slice(0, 3);
    if (next.length) body += `<p class="muted">次の計画：${next.map(d => { const x = parseYmd(d); return `${x.getMonth() + 1}/${x.getDate()}（${WD[x.getDay()]}）${fmtMin(o.plan[d])}`; }).join('、')}</p>`;
  } else if (goal && done < goal) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), left = last - now.getDate() + 1;
    body += `<p class="hint-strong">「目標と計画」で、どの日に何時間するかを決めると、目標に届くかがひと目で分かります。</p>
      <p class="muted">今日をふくめて残り${left}日です。</p>`;
  }
  return `<div class="today homecard">${body}${reportLineHtml(o)}</div>`;
}
/* 目標と計画の画面（openGoalPlan。区域の「おすすめの回り方」の openPlanSheet とは別）：月の目標と、カレンダーで日ごとの時間をえらぶ（えらぶとすぐ保存）
   ・日にちを押すと、画面の下に「時間のダイヤル」が出る。上下にスワイプして、15分ごとに時間をえらぶ
     （ダイヤルが止まったところで保存。カレンダーはダイヤルの上に見えたまま）
   ・ダイヤルの「‹ ›」で前の日・次の日に移れる（日にちを押し直さなくても、続けて入れられる）
   ・カレンダーのマス：日にち（日曜・祝日は赤）・祝日の短い名前・集まりの時刻（緑の札）・計画の時間（大きく）
     くわしい祝日の名前と、集まりの時間・場所は、ダイヤルの上に出す
   ・集まりに終わりの時刻があれば「集まりに合わせる」で、その長さを入れられる */
let planYm = null, planSel = null;
const WHEEL_MAX = 10 * 60, WHEEL_STEP = 15;
const WHEEL_VALS = Array.from({ length: WHEEL_MAX / WHEEL_STEP + 1 }, (_, i) => i * WHEEL_STEP);
const HOL_SHORT = { 元日: '元日', 成人の日: '成人', 建国記念の日: '建国', 天皇誕生日: '天皇誕生', 春分の日: '春分', 昭和の日: '昭和', 憲法記念日: '憲法',
  みどりの日: 'みどり', こどもの日: 'こども', 海の日: '海の日', 山の日: '山の日', 敬老の日: '敬老', 秋分の日: '秋分', スポーツの日: 'スポーツ',
  文化の日: '文化', 勤労感謝の日: '勤労感謝', 振替休日: '振替休日', 国民の休日: '休日', '慰霊の日（沖縄）': '慰霊の日' };
const shortTime = t => String(t || '').replace(/^0(\d)/, '$1');
/* 集まりの長さ（分）。終わりの時刻がない集まりは数えない */
function schedDur(sc) {
  let best = 0;
  sc.forEach(x => {
    if (!x.time || !x.end) return;
    const [h1, m1] = x.time.split(':').map(Number), [h2, m2] = x.end.split(':').map(Number);
    const d = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (d > 0) best = Math.max(best, Math.round(d / WHEEL_STEP) * WHEEL_STEP);
  });
  return Math.min(best, WHEEL_MAX);
}
function openGoalPlan(ymArg) {
  planYm = ymArg || ymOf(new Date());
  planSel = null;
  let wheelBusy = false, wheelVal = 0;
  const pop = () => $('#wheelPop');
  const paint = keep => {
    const o = myData(), ym = planYm, [Y, M] = ym.split('-').map(Number), today = ymd(new Date());
    const goal = o.goals[ym] || 0, first = new Date(Y, M - 1, 1).getDay(), last = new Date(Y, M, 0).getDate();
    const hol = jpHolidays(Y), open = !!(planSel && planSel.startsWith(ym));
    let cells = '', wk = 0, wkP = 0, wkD = 0;
    for (let i = 0; i < first; i++) cells += '<span class="pd empty" aria-hidden="true"></span>';
    for (let d = 1; d <= last; d++) {
      const key = ymd(new Date(Y, M - 1, d)), wd = (first + d - 1) % 7, p = o.plan[key] || 0, dn = o.log[key] || 0;
      const hn = hol[key] || '', sc = schedsOn(key);
      wkP += p; wkD += dn;
      const lab = `${M}月${d}日${hn ? '　' + hn : ''}${sc.length ? '　集まり ' + sc.map(x => x.time || '時間未定').join('、') : ''}　計画 ${p ? fmtMin(p) : 'なし'}${dn ? '　記録 ' + fmtMin(dn) : ''}`;
      const tags = (hn ? `<i class="hl">${esc(HOL_SHORT[hn] || hn)}</i>` : '') +
        (sc.length ? `<i class="mt">${esc(shortTime(sc[0].time) || '集まり')}${sc.length > 1 ? '<em>+' + (sc.length - 1) + '</em>' : ''}</i>` : '');
      cells += `<button type="button" class="pd${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}${hn ? ' hol' : ''}${sc.length ? ' hassc' : ''}${key === today ? ' today' : ''}${key < today ? ' past' : ''}${key === planSel ? ' sel' : ''}" data-pday="${key}" data-keep aria-label="${esc(lab)}">
        <span class="dn">${d}</span><span class="tg">${tags}</span>
        <span class="ph${p ? '' : ' zero'}">${p ? fmtH(p) : '・'}</span>${dn ? `<span class="dd">✓${fmtH(dn)}</span>` : ''}</button>`;
      if (wd === 6 || d === last) {
        wk++;
        cells += `<div class="pwk"><span>第${wk}週</span><span>計画 <b>${wkP ? fmtMin(wkP) : 'なし'}</b>${wkD ? `　記録 ${fmtMin(wkD)}` : ''}</span></div>`;
        wkP = 0; wkD = 0;
      }
    }
    const plan = planMin(o, ym), done = monthMin(o, ym);
    const st = !goal ? '<p class="st">はじめに、上で目標の時間を決めてください。</p>'
      : plan >= goal ? `<p class="st ok">✓ 目標に届く計画です${plan > goal ? `（${fmtMin(plan - goal)} 多め）` : ''}</p>`
        : `<p class="st short">あと ${fmtMin(goal - plan)} 計画に入れると、目標に届きます</p>`;
    if (keep) sheetKeep = true; // 見ていた位置をそのままにする
    setSheet(headHtml(null, '目標と計画', 'このスマホの中だけに保存されます') + `
      <div class="calhead"><button type="button" class="btn small" data-pm="-1" aria-label="前の月">‹</button><b>${Y}年${M}月</b><button type="button" class="btn small" data-pm="1" aria-label="次の月">›</button></div>
      <div class="pgoal"><p class="q" style="margin:0">${M}月の目標</p>
        <div class="stepper"><button type="button" data-pg="-60" aria-label="1時間へらす">−</button><output class="wide">${goal ? fmtMin(goal) : 'なし'}</output><button type="button" data-pg="60" aria-label="1時間ふやす">＋</button></div></div>
      <div class="pquick">${[15, 30, 50, 70].map(h => `<button type="button" class="chip" data-pgset="${h * 60}" data-keep aria-pressed="${goal === h * 60}">${h}時間</button>`).join('')}</div>
      <p class="hint-strong">日にちを押すと、下に時間のダイヤルが出ます。上下にスワイプして、時間をえらんでください。</p>
      <div class="pcal">${WD.map((w, i) => `<span class="cw${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</span>`).join('')}${cells}</div>
      <p class="calkeys"><span><b style="color:#C62828">赤い字</b> 日曜・祝日</span><span><i class="mtkey">9:30</i>集まり</span><span><small>✓1.5h</small> 記録した時間</span></p>
      <div class="plansum${open ? ' still' : ''}"><p class="big">計画 ${fmtMin(plan)} <span class="muted">／ 目標 ${goal ? fmtMin(goal) : 'なし'}</span></p>${st}
        ${done ? `<p class="muted">この月の記録 ${fmtMin(done)}${plan ? (pdf => `（${pdf ? `計画との差 ${pdf > 0 ? '＋' : '−'}${fmtMin(Math.abs(pdf))}` : '計画どおり'}）`)(planDiff(o, ym)) : ''}</p>` : ''}</div>
      ${plan ? '<button class="btn block danger" id="pClear">この月の計画をぜんぶ消す</button>' : ''}
      <button class="btn primary block" data-close>閉じる</button>
      ${open ? '<div class="wspacer" aria-hidden="true"></div>' : ''}`);
    const S = $('#sheet'), save = x => { mySave(x); renderHome(); paint(true); };
    $$('[data-pday]', S).forEach(b => b.onclick = () => { if (b.dataset.pday === planSel) closeWheel(); else openWheel(b.dataset.pday); });
    $$('[data-pg]', S).forEach(b => b.onclick = () => {
      const x = myData(), g = Math.max(0, Math.min(200 * 60, (x.goals[ym] || 0) + Number(b.dataset.pg)));
      if (g) x.goals[ym] = g; else delete x.goals[ym];
      save(x);
    });
    $$('[data-pgset]', S).forEach(b => b.onclick = () => { const x = myData(); x.goals[ym] = Number(b.dataset.pgset); save(x); });
    $$('[data-pm]', S).forEach(b => b.onclick = () => { const d = new Date(Y, M - 1 + Number(b.dataset.pm), 1); planYm = ymOf(d); closeWheel(true); paint(); });
    if ($('#pClear')) $('#pClear').onclick = async () => {
      closeWheel(true);
      if (!await ask(`${M}月の計画（日ごとの時間）を、ぜんぶ消します。目標と記録は消しません。よろしいですか？`)) { paint(true); return; }
      const x = myData(); Object.keys(x.plan).filter(d => d.startsWith(ym)).forEach(d => delete x.plan[d]);
      mySave(x); renderHome(); paint(true);
    };
    if (open) paintWheelHead();
  };
  /* ---- 時間のダイヤル ---- */
  const itemH = () => { const it = $$('#wpList .witem'); return it.length > 1 ? (it[1].offsetTop - it[0].offsetTop) : 40; };
  function ensureWheel() {
    let el = pop();
    if (el) return el;
    el = document.createElement('div');
    el.id = 'wheelPop'; el.className = 'wpop'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'この日に奉仕する時間');
    el.innerHTML = `<div class="wphead"><button type="button" class="wnav" data-wnav="-1" aria-label="前の日">‹</button>
        <div class="wptitle"><b id="wpDate"></b><small id="wpInfo"></small></div>
        <button type="button" class="wnav" data-wnav="1" aria-label="次の日">›</button></div>
      <div class="wheel2"><div class="wband" aria-hidden="true"></div>
        <div class="wlist" id="wpList" role="listbox" tabindex="0" aria-label="時間（上下にスワイプ）">
          <div class="wpad"></div>${WHEEL_VALS.map(v => `<div class="witem" role="option" data-wv="${v}">${v ? fmtMin(v) : 'なし'}</div>`).join('')}<div class="wpad"></div></div></div>
      <div class="wpacts" id="wpActs"></div>
      <div class="wpfoot"><span id="wpSum"></span><button type="button" class="btn primary small" id="wpClose">閉じる</button></div>`;
    document.body.appendChild(el);
    return el;
  }
  function wheelTo(v, smooth) {
    const list = $('#wpList'), i = Math.max(0, WHEEL_VALS.indexOf(v));
    wheelBusy = true;
    list.scrollTo({ top: i * itemH(), behavior: smooth ? 'smooth' : 'auto' });
    markWheel(i);
    setTimeout(() => { wheelBusy = false; }, smooth ? 450 : 60);
  }
  function markWheel(i) {
    $$('#wpList .witem').forEach((x, j) => { x.classList.toggle('on', j === i); x.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
  }
  /* ダイヤルが止まったら、その時間を保存する */
  function wheelSettled() {
    const list = $('#wpList'); if (!list || !planSel) return;
    const i = Math.max(0, Math.min(WHEEL_VALS.length - 1, Math.round(list.scrollTop / itemH()))), v = WHEEL_VALS[i];
    markWheel(i);
    if (v === wheelVal) return;
    wheelVal = v;
    const x = myData();
    if (v) x.plan[planSel] = v; else delete x.plan[planSel];
    mySave(x); renderHome(); paint(true);
  }
  function paintWheelHead() {
    if (!planSel || !pop()) return;
    const o = myData(), d = parseYmd(planSel), hn = holidayOf(planSel), sc = schedsOn(planSel);
    $('#wpDate').textContent = fmtYmd(planSel);
    const info = [];
    if (hn) info.push(`<span class="holtag">${esc(hn)}</span>`);
    if (sc.length) info.push(`<span class="mtinfo">集まり ${sc.map(x => schedLine(x)).join('／')}</span>`);
    if (o.log[planSel]) info.push(`記録 ${fmtMin(o.log[planSel])}`);
    $('#wpInfo').innerHTML = info.join(' ') || '&nbsp;';
    const dur = schedDur(sc), ym = planSel.slice(0, 7);
    $('#wpActs').innerHTML = (dur ? `<button type="button" class="btn small" data-wset="${dur}">集まりに合わせる（${fmtMin(dur)}）</button>` : '') +
      `<button type="button" class="btn small" data-wweek>毎週${WD[d.getDay()]}曜日にも入れる</button>`;
    const goal = o.goals[ym] || 0, plan = planMin(o, ym);
    $('#wpSum').innerHTML = `計画 <b>${fmtMin(plan)}</b>${goal ? ` ／ 目標 ${fmtMin(goal)}${plan >= goal ? ' <span class="okc">✓</span>' : `<br><span class="shortc">あと ${fmtMin(goal - plan)}</span>`}` : ''}`;
  }
  function openWheel(day) {
    const el = ensureWheel();
    planSel = day;
    if (!day.startsWith(planYm)) planYm = day.slice(0, 7);
    wheelVal = myData().plan[day] || 0;
    el.hidden = false;
    document.body.classList.add('wheel-open');
    paint(true);
    wheelTo(wheelVal, false);
    // えらんだ日が、ダイヤルにかくれないように
    setTimeout(() => {
      const c = $(`#sheet [data-pday="${day}"]`), sh = $('#sheet'); if (!c || !sh) return;
      const cr = c.getBoundingClientRect(), pr = el.getBoundingClientRect(), hr = sh.getBoundingClientRect();
      const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
      if (cr.bottom > pr.top - 8) sh.scrollTop += (cr.bottom - pr.top + 16) / z;
      else if (cr.top < hr.top + 8) sh.scrollTop += (cr.top - hr.top - 16) / z;
    }, 30);
  }
  function closeWheel(quiet) {
    const el = pop(); if (el) el.hidden = true;
    document.body.classList.remove('wheel-open');
    const had = planSel; planSel = null;
    if (had && !quiet) paint(true);
  }
  const el = ensureWheel();
  if (!el.dataset.bound) { // 1回だけ、ダイヤルの動きをつなぐ（同じ画面を何度開いても、二重につながないように）
    el.dataset.bound = '1';
    const list = $('#wpList', el);
    list.addEventListener('scroll', () => {
      const i = Math.round(list.scrollTop / itemH());
      if (!wheelBusyRef.v) markWheel(i);
      clearTimeout(wheelTimerRef.t);
      wheelTimerRef.t = setTimeout(() => { if (!wheelBusyRef.v) wheelRef.settled(); }, 160);
    }, { passive: true });
    list.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const i = Math.round(list.scrollTop / itemH()) + (e.key === 'ArrowDown' ? 1 : -1);
      list.scrollTo({ top: Math.max(0, Math.min(WHEEL_VALS.length - 1, i)) * itemH(), behavior: 'smooth' });
    });
    el.addEventListener('click', e => {
      const q = sel => e.target.closest(sel);
      let x;
      if ((x = q('[data-wv]'))) { wheelRef.to(Number(x.dataset.wv)); return; }
      if ((x = q('[data-wnav]'))) { wheelRef.nav(Number(x.dataset.wnav)); return; }
      if ((x = q('[data-wset]'))) { wheelRef.to(Number(x.dataset.wset)); return; }
      if (q('[data-wweek]')) { wheelRef.week(); return; }
      if (q('#wpClose')) wheelRef.close();
    });
  }
  // ダイヤルの動きは、いま開いている「目標と計画」の画面につなぐ
  wheelBusyRef = { get v() { return wheelBusy; } };
  wheelRef = {
    settled: wheelSettled,
    to: v => { wheelTo(v, true); setTimeout(wheelSettled, 480); },
    nav: n => { if (!planSel) return; const d = parseYmd(planSel); d.setDate(d.getDate() + n); openWheel(ymd(d)); },
    week: () => {
      if (!planSel) return;
      const x = myData(), m = x.plan[planSel] || 0, sd = parseYmd(planSel), wd = sd.getDay(), today = ymd(new Date());
      const last = new Date(sd.getFullYear(), sd.getMonth() + 1, 0).getDate();
      let n = 0;
      for (let d = 1; d <= last; d++) {
        const dt = new Date(sd.getFullYear(), sd.getMonth(), d), key = ymd(dt);
        if (dt.getDay() !== wd || key < today) continue;
        if (m) x.plan[key] = m; else delete x.plan[key];
        n++;
      }
      mySave(x); renderHome(); paint(true);
      toast(`毎週${WD[wd]}曜日（${n}日）に、${m ? fmtMin(m) : '「なし」'}を入れました`);
    },
    close: () => closeWheel()
  };
  paint();
}
let wheelRef = null, wheelBusyRef = { v: false }, wheelTimerRef = { t: 0 };
/* 月の最終日（と翌月のはじめの1週間）は、自動でまとめを出す */
function monthEndHtml(o) {
  const now = new Date(), last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let ym = null, label = '';
  if (now.getDate() === last) { ym = ymOf(now); label = '今月のまとめ'; }
  else if (now.getDate() <= 7) { const p = new Date(now.getFullYear(), now.getMonth() - 1, 1); ym = ymOf(p); label = `${p.getMonth() + 1}月のまとめ`; }
  if (!ym) return '';
  const m = monthMin(o, ym), g = o.goals[ym] || 0, rep = o.reports[ym];
  if (!m && !g) return '';
  return `<div class="notice info homecard"><b style="font-size:19px">${label}</b><br>
    奉仕時間 <b>${fmtMin(m)}</b>（${monthDays(o, ym)}日）${g ? `　目標 ${fmtMin(g)}（${Math.round(m / g * 100)}%）` : ''}
    ${rep ? `<br><span class="muted">${rep.how === 's21' ? '会衆に報告しました' : '報告しました'}：${esc(repSummary(rep))}</span>`
      : window.S21R && S21R.use() && now.getDate() <= reportDl() ? `<br><span class="muted">報告の締切は${reportDl()}日です</span>` : ''}
    <span class="actions"><button class="btn small" id="monthHist">月ごとの記録を見る</button></span></div>`; // 奉仕報告のボタンは「○月の奉仕」のカードに（同じ入口を2つ出さない）
}
function openMonthHist() {
  const o = myData();
  const yms = [...new Set(Object.keys(o.log).map(d => d.slice(0, 7)).concat(Object.keys(o.goals)))].sort().reverse();
  setSheet(headHtml(null, '月ごとの奉仕時間', 'このスマホの記録') + (yms.length
    ? `<table class="slots narrow"><tr><th>月</th><th>時間</th><th>日数</th><th>目標</th><th>報告</th></tr>${yms.map(ym => {
        const m = monthMin(o, ym), g = o.goals[ym] || 0, r = o.reports[ym];
        return `<tr><th>${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月</th><td><b>${fmtMin(m)}</b></td><td>${monthDays(o, ym)}日</td><td>${g ? `${fmtMin(g)}（${Math.round(m / g * 100)}%）` : '—'}</td>
          <td><button type="button" class="btn small" data-report="${ym}">${r ? (r.how === 's21' ? '会衆に報告済み' : hoursKind(r.kind) || (!r.kind && r.h) ? `${r.h}時間` : '報告済み') : '報告する'}</button></td></tr>`;
      }).join('')}</table>`
    : '<div class="empty">まだ記録はありません。</div>') + '<button class="btn block" data-close>閉じる</button>');
  $$('[data-report]', $('#sheet')).forEach(b => b.onclick = () => openReportSheet(b.dataset.report));
  if (window.S21R) S21R.markHist($('#sheet')); // 会衆の報告システムで報告済みの月（ほかの端末やS21の画面から送った分も）
}

/* ---- 奉仕報告 ----
   ・送る文：「○月の奉仕報告です。／時間:○時間／レッスン:○」
   ・時間は1時間ごとの数（記録の時間の、1時間に満たない分は切り捨てて出し、＋−で直せる）
   ・LINEで送る・ほかのアプリで送る・コピーのどれかを押すと「報告した」として残す（このスマホの中だけ）
   ・タイマーを使う人には、月末の夜8時すぎ（または月末にタイマーを止めたとき）に自動で出す。
     出したのに報告していないときは、翌月の10日まで、1日1回だけ出す */
const PRAISE_SHORT = ['おつかれさまでした！', 'よくがんばりましたね！', 'すばらしいですね！', 'ありがとうございました！'];
const praiseShort = () => PRAISE_SHORT[Math.floor(Math.random() * PRAISE_SHORT.length)];
function praiseLine(done, goal) {
  if (goal && done >= goal) return 'すばらしい！目標を達成しました。今月も、本当によくがんばりましたね。';
  if (goal && done >= goal * 0.8) return 'あと少しでした。たくさんの時間を、奉仕に使いましたね。';
  if (done > 0) return '今月も、おつかれさまでした。一軒一軒の訪問が、大切な一歩です。';
  return '今月も、おつかれさまでした。';
}
/* 報告の種類（S-4 と同じ）：伝道者は「伝道した（はい・いいえ）」とレッスン。補助開拓（15時間・30時間）と開拓者は時間も報告する
   送った報告の kind：'pub'（伝道者）・'aux'（補助開拓。auxH に 15・30）・'rp'（正規開拓者など） */
const hoursKind = k => k === 'aux' || k === 'rp';
function reportText(ym, kind, st) {
  const head = `${Number(ym.slice(5))}月の奉仕報告です。`;
  if (kind === 'rp') return `${head}\n時間:${st.hours}時間\nレッスン:${st.studies}`;
  if (st.pre === false) return `${head}\n伝道:していません`;
  if (st.pre !== true) return `${head}\n（「伝道した」の「はい」か「いいえ」を選んでください）`;
  if (st.aux) return `${head}\n${RepForm.auxTag(st.aux)}\n時間:${st.hours}時間\nレッスン:${st.studies}`;
  return `${head}\n伝道:しました\nレッスン:${st.studies}`;
}
/* 送った報告の短い文（ホームの月のまとめ・月ごとの記録）。kind のない古い記録は時間の報告として出す */
function repSummary(r) {
  if (!r) return '';
  if (r.kind === 'aux') return `${r.auxH ? `補助（${r.auxH}時間）` : '補助開拓'}・時間 ${r.h}時間・レッスン ${r.les}`;
  if (r.kind === 'pub' || (r.how === 's21' && !r.h && r.kind !== 'rp')) return r.pre === false ? '伝道していない' : `伝道した・レッスン ${r.les}`;
  return `時間 ${r.h}時間・レッスン ${r.les}`;
}
/* 係の設定で「奉仕報告を S21 に送る」が「使う」なら、会衆の報告システムに送る画面（houkoku.js）。そうでなければ、LINEで送る画面 */
function openReportSheet(ym, opt) {
  if (window.S21R && S21R.use()) { S21R.open(ym, opt || {}); return; }
  openReportLine(ym, opt);
}
/* LINEなどで送る画面。入力は S21 の画面と同じ（houkoku.js の RepForm）。
   伝道者か開拓者かは、S21 で確かめた開拓者の印 → 前にえらんだ種類 → 前に時間で報告していたら開拓者 → 伝道者 の順で決め、画面で切りかえられる */
function openReportLine(ym, opt) {
  opt = opt || {};
  const o0 = myData(), done = monthMin(o0, ym), goal = o0.goals[ym] || 0, M = Number(ym.slice(5));
  const rep0 = o0.reports[ym];
  const pastHours = Object.values(o0.reports || {}).some(r => r && !r.kind && r.how !== 's21' && r.h > 0);
  const k0 = opt.kind || (rep0 && rep0.kind) || (o0.s21p && o0.s21p.pioneer ? 'rp' : '') || o0.rpKind || (pastHours ? 'rp' : 'pub');
  let kind = k0 === 'rp' ? 'rp' : 'pub';
  const st = opt.st ? Object.assign({}, opt.st)
    : rep0 && rep0.how !== 's21' ? { pre: rep0.pre != null ? !!rep0.pre : true, studies: rep0.les || 0, aux: rep0.kind === 'aux' ? (rep0.auxH || 30) : 0, hours: rep0.h || 0, actHours: 0, remarks: '' }
      : { pre: done > 0 ? true : null, studies: o0.lastLes || 0, aux: 0, hours: Math.floor(done / 60), actHours: 0, remarks: '' };
  const kindOf = () => kind === 'rp' ? 'rp' : st.pre === true && st.aux ? 'aux' : 'pub';
  const mark = how => {
    const k = kindOf(), b = RepForm.toBody(st, kind === 'rp');
    const x = myData(); x.reports[ym] = { kind: k, pre: b.preached, h: b.hours, les: b.studies, auxH: k === 'aux' ? st.aux : 0, at: new Date().toISOString(), how }; x.lastLes = b.studies; mySave(x); renderHome();
  };
  const ready = () => kind === 'rp' || st.pre != null;
  const refresh = () => { // 数字を変えたとき：送る文とボタンだけ直す（入力中の欄はそのまま）
    const text = reportText(ym, kind, st), S = $('#sheet');
    const t = $('.rptext', S); if (t) t.textContent = text;
    const l = $('#rpLine', S); if (l) l.href = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  };
  const paint = () => {
    const rep = myData().reports[ym], text = reportText(ym, kind, st), ok = ready();
    setSheet(headHtml(null, opt.auto ? 'おつかれさまでした！' : `${M}月の奉仕報告`, opt.auto ? `${M}月の奉仕報告` : '') + `
      ${opt.pick ? reportPickHtml(ym) : ''}
      ${opt.note ? `<div class="notice warn">${esc(opt.note)}</div>` : ''}
      <p class="praise">${esc(praiseLine(done, goal))}</p>
      ${done || goal ? `<div class="rpbox"><p class="muted" style="margin:0">${M}月に記録した時間（${monthDays(o0, ym)}日）</p><p class="big">${fmtMin(done)}</p>
        ${goal ? (done >= goal ? `<p class="gdiff ahead">目標 ${fmtMin(goal)} を達成${done > goal ? `（＋${fmtMin(done - goal)}）` : ''}</p>` : `<p class="gdiff behind">目標 ${fmtMin(goal)} まで、あと ${fmtMin(goal - done)}</p>`) : ''}</div>` : ''}
      <p class="q" style="margin:10px 0 0">報告する人</p>
      <div class="seg rppick" role="group" aria-label="報告する人"><button type="button" data-keep data-rk="pub" aria-pressed="${kind === 'pub'}">伝道者・補助開拓者</button><button type="button" data-keep data-rk="rp" aria-pressed="${kind === 'rp'}">開拓者</button></div>
      ${RepForm.html(st, { pio: kind === 'rp', done, act: false, rem: false })}
      <p class="q">送る文</p><div class="rptext">${esc(text)}</div>
      ${ok ? `<a class="btn line block" id="rpLine" href="https://line.me/R/share?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">LINEで送る</a>
      ${navigator.share ? '<button class="btn block" id="rpShare">ほかのアプリで送る（メールなど）</button>' : ''}
      <button class="btn block" id="rpCopy">文をコピーする</button>` : '<p class="notice info">「1カ月間に何らかの形で伝道した」の「はい」か「いいえ」を選ぶと、送れるようになります。</p>'}
      <p class="hint">送る相手は、グループのトークではなく、報告を受け取る人との個別のトークがおすすめです。報告の内容は、このスマホの中だけに保存され、区域係やサーバーには送られません。</p>
      ${rep ? `<p class="okmsg">${fmtDate(rep.at)}に報告しました（${esc(repSummary(rep))}）。直したときは、もう一度送ってください。</p>`
        : ok ? '<button class="btn block" id="rpDone">もう報告した（送らずに閉じる）</button>' : ''}
      <button class="btn block" data-close>${rep ? '閉じる' : 'あとで'}</button>`);
    const S = $('#sheet');
    RepForm.bind(st, paint, refresh);
    $$('[data-rk]', S).forEach(b => b.onclick = () => { RepForm.read(st); kind = b.dataset.rk; const x = myData(); x.rpKind = kind; mySave(x); paint(); });
    const textNow = () => reportText(ym, kind, RepForm.read(st));
    if ($('#rpLine', S)) $('#rpLine', S).onclick = () => { RepForm.read(st); refresh(); mark('line'); setTimeout(paint, 600); }; // LINEが開く（リンクはそのまま開く）
    if ($('#rpShare', S)) $('#rpShare', S).onclick = () => {
      navigator.share({ text: textNow() }).then(() => { mark('share'); paint(); toast('報告を送りました。おつかれさまでした！'); }, () => {});
    };
    if ($('#rpCopy', S)) $('#rpCopy', S).onclick = async () => {
      const text = textNow();
      let copied = false;
      try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {
        const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { copied = document.execCommand('copy'); } catch (e2) { copied = false; } ta.remove();
      }
      if (!copied) { toast('コピーできませんでした。文を長押しして、コピーしてください'); return; }
      mark('copy'); paint(); toast('コピーしました。LINEなどに貼りつけて送ってください');
    };
    if ($('#rpDone', S)) $('#rpDone', S).onclick = () => { RepForm.read(st); mark('done'); closeSheet(); toast('報告したことにしました'); };
    if (opt.pick) bindReportPick(opt);
  };
  paint();
}
/* 月末の夜8時すぎ・翌月のはじめに、まだ報告していない月があれば、報告の画面を出す（タイマーを使う人だけ） */
function reportDueYm() {
  if (!Store.data || !featTime() || UI.fTimer === 'off') return null;
  const now = new Date(), o = myData(), today = ymd(now);
  if (o.timer) return null; // 奉仕中は出さない
  let ym = null;
  if (isLastDayStr(today) && now.getHours() >= 20) ym = ymOf(now);
  else if (now.getDate() <= reportDl()) ym = ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)); // 締切日（10日）まで
  if (!ym || o.reports[ym] || o.repAsk[ym] === today || !monthMin(o, ym)) return null;
  return ym;
}
const overlayOpen = () => !$('#sheet').hidden || !$('#askBox').hidden || !$('#news').hidden || ($('#hello') && !$('#hello').hidden) ||
  ($('#joinScreen') && !$('#joinScreen').hidden) || ($('#blocker') && !$('#blocker').hidden) || ($('#s13View') && !$('#s13View').hidden) ||
  ($('#splash') && !$('#splash').hidden && !$('#splash').classList.contains('out'));
function checkReport() {
  if (document.hidden) return;
  const ym = reportDueYm(); if (!ym || overlayOpen()) return;
  const o = myData(); o.repAsk[ym] = ymd(new Date()); mySave(o);
  openReportSheet(ym, { auto: true });
}

/* ---- 毎日はじめのひと言 ----
   ・その日はじめて開いたときだけ（設定で「出さない」にもできる）。ほかの画面が開いているあいだは待つ
   ・ひと言・今日の目標（奉仕時間を使う人）・今日の集まり・今の時間帯におすすめの家（2〜3件）
   ・おすすめは、係の「おすすめ」の設定が「出す」ならそれを使い、出さないときは、自分の区域カードと
     留守宅カードの中から「会えていない家で、今の時間帯にまだ訪ねていない家」をえらぶ（3万件全体は見ない）
   ・まわりをさわる・「閉じる」で閉じる。閉じたあとに、報告の画面が出る時間なら出す */
const HELLO_WORDS = [
  '今日も、元気に出かけましょう。',
  '笑顔のあいさつが、いちばんの準備です。',
  '一軒一軒の訪問が、だれかの大切な出会いになります。',
  '留守だった家も、曜日や時間を変えると会えることがあります。',
  '無理をせず、できる分を大切に。',
  '暑い日は、こまめに水分をとってくださいね。',
  'いっしょに回る仲間にも、ひと声かけてみましょう。',
  '小さな一歩の積みかさねが、大きな実りになります。',
  'あわてず、ゆっくり。安全第一で回りましょう。',
  '今日の出会いを、楽しみに。',
  '会えなかった家も、記録がつぎの人の助けになります。',
  'よい一日になりますように。',
  'ていねいな記録が、区域全体を助けます。',
  '空いた時間の2〜3軒も、立派な奉仕です。',
  '天気や体調に合わせて、よい計画を。',
  'あなたの訪問を、待っている人がいるかもしれません。'
];
const helloKey = () => 'kuiki_hello_' + me().id;
const helloDue = () => !!Store.data && UI.hello !== 'off' && lsGet(helloKey()) !== ymd(new Date());
let helloTimer = null, helloTries = 0, helloWxWait = 0;
function queueHello(delay) {
  clearTimeout(helloTimer); helloTries = 0; helloWxWait = 0;
  if (!helloDue()) { setTimeout(checkReport, Math.max(800, delay || 0)); return; }
  helloTimer = setTimeout(tryHello, delay == null ? 400 : delay);
}
function tryHello() {
  if (!helloDue()) return;
  if (document.hidden || overlayOpen()) { if (++helloTries < 120) helloTimer = setTimeout(tryHello, 1500); return; }
  // 天気がまだ届いていないときは、少しだけ（3秒まで）待つ。届かなければ、ふだんの言葉で出す
  if (LIVE && navigator.onLine !== false && !wxFresh() && Store.data && Number(D().settings.wxOn) !== 0 && helloWxWait < 3) {
    helloWxWait++; helloTimer = setTimeout(tryHello, 1000); return;
  }
  showHello();
}
/* 天気のひと言（2026-10-22）：サーバーが調べた天気（WX・Open-Meteo・区域の真ん中の地点）が新しいときだけ使う。
   雨 → 冷える → 肌寒い → とても暑い → かさ の順に1つ。どれにも当たらない日は、ふだんの日替わりの言葉（だから「時々」）。
   区域係が雨の日の機能を止めている（wxOn＝0）ときや、夜・調べられなかったときは使わない。端末の場所は使わない */
const HELLO_WX = {
  rain: ['雨の日は、エレベーターのある集合住宅から回ってみませんか。', '雨で足もとがすべりやすいです。ゆっくり回りましょう。'],
  cold: ['今日はぐっと冷えています。上着を一枚持って出かけましょう。', '寒い日です。温かい飲み物で、ひと息つきながら回りましょう。'],
  cool: ['今日は肌寒くなりそうです。暖かくして出かけましょう。', '少しひんやりする一日です。羽織るものがあると安心です。'],
  hot: ['今日はとても暑くなりそうです。こまめに水分と休憩をとりましょう。', '日ざしの強い一日です。帽子と水分を忘れずに。'],
  umb: ['このあと雨になるかもしれません。かさを忘れずに。', '空もようが変わりやすい日です。かさがあると安心です。']
};
const HELLO_COLD = 12, HELLO_COOL = 18, HELLO_HOT = 33, HELLO_UMB = 40; // ℃・℃（最高）・℃（最高）・%（2時間の降水確率）
const numOr = v => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
function helloWxKind() {
  if (!wxFresh()) return '';
  const t = numOr(WX.t), tx = numOr(WX.tx), tn = numOr(WX.tn), p = numOr(WX.p);
  const low = Math.min(t === null ? 99 : t, tn === null ? 99 : tn);
  if (WX.r === 1) return 'rain';
  if (low <= HELLO_COLD) return 'cold';
  if (tx !== null && tx <= HELLO_COOL) return 'cool';
  if (tx !== null && tx >= HELLO_HOT) return 'hot';
  if (p !== null && p >= HELLO_UMB) return 'umb';
  return '';
}
function helloWord(o) {
  const now = new Date(), ym = ymOf(now);
  if (featTime() && planMin(o, ym) && planDiff(o, ym) < 0) return 'あと少し。今日も、いっしょにがんばりましょう。';
  if (featTime() && o.goals[ym] && monthMin(o, ym) >= o.goals[ym]) return '今月の目標、達成です。すばらしいですね！';
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / DAY);
  let hsh = 0; String(me().id).split('').forEach(c => { hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0; });
  const wk = helloWxKind();
  if (wk) return HELLO_WX[wk][(day + hsh) % HELLO_WX[wk].length];
  return HELLO_WORDS[(day + hsh) % HELLO_WORDS.length];
}
/* 天気のひと言を出した日だけ、その下に今日の気温を小さく出す（出どころの表示も） */
function helloWxLine() {
  if (!helloWxKind()) return '';
  const tx = numOr(WX.tx), tn = numOr(WX.tn), p = numOr(WX.p);
  const parts = [];
  if (tx !== null && tn !== null) parts.push(`最高 ${Math.round(tx)}℃・最低 ${Math.round(tn)}℃`);
  if (p !== null && (WX.r === 1 || p >= HELLO_UMB)) parts.push(`2時間の降水確率 ${Math.round(p)}%`);
  return `<p class="hwx">${parts.length ? `<span>${esc(parts.join('／'))}</span>` : ''}<small>天気：Open-Meteo</small></p>`;
}
function showHello() {
  if (!helloDue()) return;
  const now = new Date(), today = ymd(now), hr = now.getHours(), o = myData();
  lsSet(helloKey(), today);
  const hi = hr < 5 ? 'こんばんは' : hr < 10 ? 'おはようございます' : hr < 17 ? 'こんにちは' : 'こんばんは';
  let goalPart = '';
  if (featTime()) {
    const ym = ymOf(now), goal = o.goals[ym] || 0, done = monthMin(o, ym), tp = o.plan[today] || 0, plan = planMin(o, ym);
    const lines = [];
    if (goal) lines.push(`今月 ${fmtMin(done)} ／ 目標 ${fmtMin(goal)}`);
    else if (done) lines.push(`今月 ${fmtMin(done)}`);
    if (plan) { const d = planDiff(o, ym); lines.push(d >= 0 ? (d ? `計画より ${fmtMin(d)} 先に進んでいます` : '計画どおりです') : `計画まで あと ${fmtMin(-d)}`); }
    if (tp || goal) goalPart = `<div class="hgoal"><div><small>今日の目標</small><span class="num">${tp ? fmtMin(tp) : '—'}</span></div>
      <div>${lines.map(x => `<small>${esc(x)}</small>`).join('')}${!tp ? '<small>今日の計画は入っていません</small>' : ''}</div></div>`;
    else goalPart = '<button type="button" class="btn block" data-hgoal>今月の目標と計画を立てる</button>';
  }
  const sc = schedsOn(today);
  const meet = sc.length ? `<p class="hmeet">今日の集まり：<b>${sc.map(s => schedLine(s)).join('／')}</b></p>` : '';
  const el = $('#hello');
  el.innerHTML = `<div class="hback" data-hclose></div>
    <div class="hcard" role="dialog" aria-modal="true" aria-labelledby="helloTitle">
      <div class="hhead"><p>${esc(me().name)}さん、${hi}　${fmtYmd(today)}</p><h2 id="helloTitle">${esc(helloWord(o))}</h2>${helloWxLine()}</div>
      <div class="hbody">${goalPart}${meet}
        <p class="hsec">今（${esc(slotShort(slotOf(now)))}）のおすすめ</p><div id="helloReco"><p class="muted">さがしています…</p></div>
        <button type="button" class="btn primary block" data-hclose>閉じる</button>
        <p class="hclose">まわりをさわっても閉じます</p></div></div>`;
  el.hidden = false;
  const h2 = $('#helloTitle'); if (h2) { h2.tabIndex = -1; h2.focus({ preventScroll: true }); }
  setTimeout(fillHelloReco, 40); // 画面を先に出してから、おすすめを計算する
}
/* 自分の区域カード・留守宅カードの中の、会えていない家で、今の時間帯にまだ訪ねていない家 */
function myUnmetNow(n) {
  const cur = slotOf(new Date()), seen = new Set(), list = [];
  const consider = (h, u, t, tag) => {
    const k = K(h.id, u); if (seen.has(k)) return; seen.add(k);
    const f = D().follows[k];
    if (D().dnc[k] || (f && f.by !== me().id) || recentMet(k)) return;
    const s = sum(k);
    if (!(s.n > 0 && s.unmet) || hasSlot(s.slots, cur)) return;
    list.push({ hid: h.id, u, rk: '', no: t ? t.no : '', name: targetName(h, u), why: `留守${s.awayN}回・${slotShort(cur)}はまだ訪ねていない`, tag, sc: s.awayN });
  };
  activeCards().filter(c => c.by === me().id).forEach(c => c.keys.forEach(k => {
    const [hid, u] = parseKey(k), h = houseById(hid); if (h) consider(h, u, terrById(h.terrId), 'あなたの留守宅カードの家');
  }));
  D().territories.filter(t => t.holder === me().id).forEach(t => housesOf(t.id).forEach(h => targets(h).forEach(u => consider(h, u, t, 'あなたの区域カードの家'))));
  return list.sort((a, b) => b.sc - a.sc).slice(0, n);
}
function fillHelloReco() {
  const box = $('#helloReco'); if (!box) return;
  let items = [];
  try {
    if (recoOn() && (Number(D().settings.recoKinds) || 0)) {
      items = computeHomeReco().list.slice(0, 3).map(x => ({ hid: x.h.id, u: x.u, rk: x.rk, no: x.t.no, name: targetName(x.h, x.u), why: x.why, tag: x.tag }));
    }
    if (!items.length) items = myUnmetNow(3);
  } catch (e) { items = []; }
  if (items.length) {
    box.innerHTML = items.map(x => `<div class="hreco"><div><b>${x.no ? `<span class="stamp xs${noCls(x.no)}">${esc(x.no)}</span> ` : ''}${x.name}</b>
      <small>${esc(x.why)}${x.tag ? `<br>${esc(x.tag)}` : ''}</small></div>
      <button type="button" class="btn primary" data-hgo="${esc(String(x.hid))}" data-unit="${esc(x.u)}" data-rk="${esc(x.rk)}">ここに行く</button></div>`).join('');
    return;
  }
  let ch = null;
  try { ch = chanceCard(); } catch (e) { ch = null; }
  if (ch) {
    const k = Math.max(1, Math.round(ch.exp));
    box.innerHTML = `<div class="hreco"><div><b>区域${esc(ch.t.no)}の留守宅カード</b><small>${esc(slotShort(ch.slot))}・${ch.keys.length}軒のうち、約${k}軒で会えそう</small></div>
      <button type="button" class="btn primary" data-hchance="${esc(ch.t.id)}" data-slot="${esc(ch.slot)}">受け取る</button></div>`;
    return;
  }
  box.innerHTML = '<p class="muted">今の時間帯のおすすめは、ありません。区域カードから回りましょう。</p>';
}
function closeHello(noFollow) {
  const el = $('#hello'); if (!el || el.hidden) return;
  el.hidden = true; el.innerHTML = '';
  if (!noFollow) setTimeout(checkReport, 500);
}
function bindHello() {
  const el = $('#hello');
  el.addEventListener('click', e => {
    const q = sel => e.target.closest(sel);
    let x;
    if ((x = q('[data-hgo]'))) {
      const hid = x.dataset.hgo, u = x.dataset.unit || '', rk = x.dataset.rk || '';
      closeHello(true);
      if (rk) recoMark(hid, u, rk);
      goTo(hid, u, false, rk);
      return;
    }
    if ((x = q('[data-hchance]'))) { closeHello(true); CHANCE_CACHE = null; takeAwayCard(x.dataset.hchance, x.dataset.slot); return; }
    if (q('[data-hgoal]')) { closeHello(true); openGoalPlan(); return; }
    if (q('[data-hclose]')) closeHello();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); closeHello(); } }, true);
  // 開いたまま日がかわった・しばらくして戻ってきたとき
  document.addEventListener('visibilitychange', () => { if (!document.hidden) queueHello(1200); });
  setInterval(checkReport, 60000); // 月末の夜8時をすぎたら、報告の画面を出す
}

/* ---- カレンダー ---- */
let calMonth = null, calMode = 'cal';
const schedsOn = date => D().schedules.filter(s => s.date === date && (!s.group || s.group === myGroup() || isAdmin()))
  .sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1);
const schedGroupName = g => (g ? `${g}グループ` : '全体');
/* Googleカレンダーに追加するリンク（アプリから直接書きこむのではなく、Googleカレンダーの追加画面を開く） */
function gcalUrl(title, date, time, end, place, note) {
  const d = date.replace(/-/g, '');
  let dates;
  if (time) {
    const t1 = time.replace(':', '') + '00';
    let t2 = end ? end.replace(':', '') + '00' : null;
    if (!t2) { const [h, m] = time.split(':').map(Number); t2 = pad((h + 1) % 24) + pad(m) + '00'; }
    dates = `${d}T${t1.padStart(6, '0')}/${d}T${t2.padStart(6, '0')}`;
  } else {
    const nx = parseYmd(date); nx.setDate(nx.getDate() + 1);
    dates = `${d}/${ymd(nx).replace(/-/g, '')}`;
  }
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&ctz=Asia%2FTokyo&text=' + encodeURIComponent(title) +
    '&dates=' + dates + (place ? '&location=' + encodeURIComponent(place) : '') + (note ? '&details=' + encodeURIComponent(note) : '');
}
const canEditSched = s => isAdmin() || (isOverseer() && s.group === myGroup());
/* 予定の1行。直せる人には、左にスワイプすると「編集」「削除」が出る形にする */
/* 予定の行：押すと「Googleカレンダーに入れる・直す・消す」の画面が出る（行の中にボタンを置かず、行全体を押せるように） */
function schedRow(s, withDate) {
  const body = `<article class="ritem k-new schedrow swipe-body" data-sopen="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(fmtYmd(s.date))} ${esc(s.time || '')} ${esc(s.place || '場所未定')}の予定。押すと操作が出ます"><div>
      ${withDate ? `<p class="rt">${fmtYmd(s.date)}</p><p>${schedLine(s)}</p>` : `<p class="rt">${schedLine(s)}</p>`}
      <p class="muted">${schedGroupName(s.group)}${s.note ? '　' + esc(s.note) : ''}</p></div>
      <span class="chev" aria-hidden="true">›</span></article>`;
  if (!canEditSched(s)) return body.replace(' swipe-body', '');
  return `<div class="swipe" data-sid="${esc(s.id)}"><div class="swipe-acts" aria-label="この予定の操作">
      <button type="button" data-scact="edit" data-sid="${esc(s.id)}">編集</button><button type="button" class="del" data-scact="del" data-sid="${esc(s.id)}">削除</button></div>${body}</div>`;
}
const swipeHint = list => (list.some(canEditSched)
  ? '<p class="hint">予定を<b>押す</b>と、Googleカレンダーに入れたり、直したり消したりできます。</p>'
  : '<p class="hint">予定を<b>押す</b>と、Googleカレンダーに入れられます。</p>');
/* 予定を押したときの画面 */
function openSchedActions(s, back) {
  const can = canEditSched(s);
  setSheet(headHtml(null, esc(fmtYmd(s.date)), '奉仕の集まり') + `
    <div class="schedbox"><p class="rt">${schedLine(s)}</p>
      <p class="muted">${schedGroupName(s.group)}${s.note ? '　' + esc(s.note) : ''}</p></div>
    <a class="btn primary block" id="scCal" href="${gcalUrl('奉仕の集まり', s.date, s.time, s.end, s.place, s.note)}" target="_blank" rel="noopener">Googleカレンダーに入れる</a>
    ${placeHref(s) ? `<a class="btn block" href="${esc(placeHref(s))}" target="_blank" rel="noopener">場所をGoogleマップで見る</a>` : ''}
    ${can ? `<button class="btn block" id="scEdit">この予定を直す</button>
      <button class="btn block danger scdel" id="scDel">この予定を消す</button>` : ''}
    <button class="btn block" id="scBack">${back ? '← もどる' : '閉じる'}</button>`);
  const done = () => { if (back) back(); else closeSheet(); };
  $('#scBack').onclick = done;
  if (!can) return;
  $('#scEdit').onclick = () => openSchedForm(s, null, back);
  $('#scDel').onclick = async () => {
    if (!await ask(`${fmtYmd(s.date)}　${s.time || ''} ${s.place || '場所未定'} の予定を消します。よろしいですか？`)) return;
    commit('集まりの予定を消しました', () => { D().schedules = D().schedules.filter(x => x.id !== s.id); });
    done();
  };
}
let dayCtx = null; // いま開いている日（予定を直したあと、その日の画面にもどるため）
const schedLine = s => `${s.time ? `${s.time}${s.end ? '〜' + s.end : ''}` : '時間未定'}　${esc(s.place || '場所未定')}`;
function calHtml(o) {
  const base = calMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const y = base.getFullYear(), m = base.getMonth(), first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate();
  const today = ymd(new Date());
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="cd empty"></span>';
  for (let d = 1; d <= last; d++) {
    const key = ymd(new Date(y, m, d)), sc = schedsOn(key).length, ev = o.events.filter(e => e.date === key).length + (o.admin ? 0 : apptsOn(key).length), mn = featTime() ? (o.log[key] || 0) : 0;
    const wd = new Date(y, m, d).getDay(), hn = holidayOf(key), pl = featTime() && !mn && key >= today ? (o.plan[key] || 0) : 0;
    const list = schedsOn(key);
    const tag = list.length
      ? `<b class="cdsc">${esc((list[0].time || '').slice(0, 5) || '集まり')}${list.length > 1 ? `<i>+${list.length - 1}</i>` : ''}</b>` : '';
    cells += `<button type="button" class="cd${key === today ? ' today' : ''}${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}${hn ? ' hol' : ''}${sc ? ' hassc' : ''}" data-day="${key}" aria-label="${m + 1}月${d}日${hn ? '　' + hn : ''}${sc ? `　集まり ${list.map(x => (x.time || '') + (x.place ? ' ' + x.place : '')).join('、')}` : ''}${pl ? '　計画 ' + fmtMin(pl) : ''}">
      <span class="dn">${d}</span><span class="cdmid">${tag}${ev ? '<i class="dp"></i>' : ''}</span>${mn ? `<small>${(mn / 60).toFixed(mn % 60 ? 1 : 0)}h</small>` : pl ? `<small class="pl">${fmtH(pl)}</small>` : ''}</button>`;
  }
  return `<div class="calhead"><button type="button" class="btn small" data-cm="-1" aria-label="前の月">‹</button><b>${y}年${m + 1}月</b>
      <button type="button" class="btn small" data-cm="1" aria-label="次の月">›</button></div>
    <div class="calgrid">${WD.map((w, i) => `<span class="cw${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</span>`).join('')}${cells}</div>
    <p class="calkeys"><span><b class="cdsc">9:30</b>奉仕の集まり</span><span><i class="dp"></i>自分の予定</span>${featTime() ? '<span><small>1.5h</small> 奉仕した時間</span><span><small class="pl">2h</small> 計画</span>' : ''}<span><b style="color:#C62828">赤い字</b> 祝日</span></p>
    ${monthListHtml(y, m, o)}`;
}
/* その月の集まりと自分の予定を、時間と場所つきで下にならべる（タップしなくても分かるように）。
   設定で「今日から」をえらんでいるときは、今日より前の予定は出さない */
function monthListHtml(y, m, o) {
  const pre = `${y}-${pad2(m + 1)}`, today = ymd(new Date()), upcoming = UI.calList !== 'all';
  const items = [];
  D().schedules.filter(s => String(s.date).startsWith(pre) && (!s.group || s.group === myGroup() || isAdmin()))
    .forEach(s => items.push({ date: s.date, time: s.time || '', text: schedLine(s), tag: schedGroupName(s.group), mine: false }));
  ((o && o.events) || []).filter(e => String(e.date).startsWith(pre))
    .forEach(e => items.push({ date: e.date, time: e.time || '', text: `${e.time ? esc(e.time) + '　' : ''}${esc(e.title)}`, tag: '自分の予定', mine: true }));
  if (o && !o.admin && featFollow()) { // 再訪問の約束（このスマホの中だけ）
    const mo = memoAll();
    Object.keys(mo).forEach(k => {
      const mm = mo[k], f = fol(k);
      if (!mm || !mm.next || !String(mm.next.date).startsWith(pre) || !f || f.by !== me().id) return;
      const [hid, unit] = parseKey(k), h = houseById(hid); if (!h) return;
      items.push({ date: mm.next.date, time: mm.next.time || '', text: `${mm.next.time ? esc(mm.next.time) + '　' : ''}${targetName(h, unit)}`, tag: '再訪問の約束', mine: true });
    });
  }
  let list = items.sort((a, b) => ((a.date + a.time) < (b.date + b.time) ? -1 : 1));
  const hid = upcoming ? list.filter(x => x.date < today).length : 0;
  if (upcoming) list = list.filter(x => x.date >= today);
  if (!list.length) return `<p class="muted calnone">${hid ? 'この月の今日より前の予定は、設定の「予定の一覧」で表示できます。' : 'この月の予定は、まだ入っていません。'}</p>`;
  return `<ul class="calsched">${list.map(x => {
    const d = parseYmd(x.date);
    return `<li data-day="${x.date}"${x.mine ? ' class="mine"' : ''}><b>${d.getDate()}日（${WD[d.getDay()]}）</b><span>${x.text}</span><small>${esc(x.tag)}</small></li>`;
  }).join('')}</ul>` + (hid ? `<p class="hint">今日より前の予定 ${hid}件は出していません（設定で変えられます）。</p>` : '');
}
const pad2 = n => String(n).padStart(2, '0');
function schedListHtml() {
  const today = ymd(new Date()), until = new Date(); until.setDate(until.getDate() + 60);
  const list = D().schedules.filter(s => s.date >= today && s.date <= ymd(until) && (!s.group || s.group === myGroup() || isAdmin()))
    .sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  if (!list.length) return '<div class="empty">これから60日の、奉仕の集まりの予定はありません。</div>';
  return swipeHint(list) + list.map(s => schedRow(s, true)).join('');
}
/* この日の奉仕時間：「時間」「分」の欄（数字を押すと直接入れられる）。−／＋は15分ずつ。1日は24時間まで（2026.13.86） */
const DAY_MAX_MIN = 24 * 60;
const dminUnits = () => (window.KI && KI.lang && KI.lang !== 'ja' ? ['h', 'min'] : ['時間', '分']);
function dminHtml(min) {
  const [uh, um] = dminUnits();
  return `<div class="stepper" style="justify-content:center"><button type="button" data-dm="-15" aria-label="15分へらす">−</button>
    <div class="dmin"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" id="dMinH" value="${Math.floor(min / 60)}" aria-label="時間（数字を入れる）" autocomplete="off"><span data-notr>${uh}</span>
      <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="dMinM" value="${min % 60}" aria-label="分（数字を入れる）" autocomplete="off"><span data-notr>${um}</span></div>
    <button type="button" data-dm="15" aria-label="15分ふやす">＋</button></div>`;
}
function openDay(date) {
  let min = null; // 保存する前の時間（予定を足して画面を描き直しても、入れかけの時間を残す）
  const paint = () => {
    const o = myData(), sc = schedsOn(date), ev = o.events.filter(e => e.date === date).sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1);
    if (min === null) min = o.log[date] || 0;
    setSheet(headHtml(null, fmtYmd(date), esc(holidayOf(date))) + `
      ${featTime() && o.plan[date] ? `<p class="gtoday">この日の計画 ${fmtMin(o.plan[date])}</p>` : ''}
      <h3 class="sub">奉仕の集まり</h3>
      ${sc.length ? swipeHint(sc) + sc.map(s => schedRow(s, false)).join('')
        : '<p class="muted">この日の集まりはありません。</p>'}
      ${isOverseer() || isAdmin() ? `<button class="btn small" id="dAddSched">＋ この日に集まりを入れる</button>` : ''}
      <h3 class="sub">自分の予定 <span class="muted" style="font-size:14px">（このスマホだけ）</span></h3>
      ${ev.length ? ev.map(e => `<article class="ritem k-young evrow"><div><p class="rt">${e.time ? esc(e.time) + '　' : ''}${esc(e.title)}</p></div>
        <span class="actions" style="margin:0"><a class="btn small" href="${gcalUrl(e.title, e.date, e.time, '', '', '')}" target="_blank" rel="noopener">Googleカレンダーへ</a>
        <button class="btn small danger" data-evdel="${esc(e.id)}">消す</button></span></article>`).join('') : '<p class="muted">予定はありません。</p>'}
      ${apptDayHtml(date)}
      <div class="inline" style="margin-top:8px"><input type="time" id="evTime" aria-label="時刻" style="min-height:52px;border-radius:12px;border:2px solid var(--ink2);padding:0 8px;max-width:130px">
        <input type="text" id="evTitle" maxlength="40" placeholder="例：〇〇さんと奉仕" style="min-height:52px;border-radius:12px;border:2px solid var(--ink2);padding:0 10px;font-size:18px"></div>
      <button class="btn block" id="evAdd">予定を入れる</button>
      ${featTime() ? `<h3 class="sub">この日の奉仕時間 <span class="muted" style="font-size:14px">（このスマホだけ）</span></h3>
      ${dminHtml(min)}
      <button class="btn primary block" id="dMinSave">奉仕時間を保存する</button>` : ''}
      <button class="btn block" data-close>${featTime() ? 'やめる' : '閉じる'}</button>`);
    dayCtx = date;
    const S = $('#sheet');
    const iH = $('#dMinH'), iM = $('#dMinM');
    const show = () => { if (iH) iH.value = Math.floor(min / 60); if (iM) iM.value = min % 60; };
    const digits = el => { const v = String(el.value).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, ''); if (v !== el.value) el.value = v; return Number(v) || 0; };
    const readIn = () => { min = Math.min(DAY_MAX_MIN, digits(iH) * 60 + digits(iM)); };
    [iH, iM].forEach(el => {
      if (!el) return;
      el.oninput = readIn;
      // 押したら数字を全部えらんで、そのまま打ちかえられるように（指をはなしたときに選びが外れないよう、最初の1回だけ止める）
      let fresh = false;
      const pickAll = () => { try { el.setSelectionRange(0, el.value.length); } catch (e) { /* 何もしない */ } };
      el.onfocus = () => { fresh = true; setTimeout(() => { if (fresh) pickAll(); }, 0); };
      el.onmouseup = e => { if (fresh) { e.preventDefault(); fresh = false; pickAll(); } };
      el.onclick = () => { if (fresh) { fresh = false; pickAll(); } };
      el.onblur = show; // 「90分」は「1時間30分」に直して見せる
      el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
    });
    $$('[data-dm]', S).forEach(b => b.onclick = () => { if (iH) readIn(); min = Math.min(DAY_MAX_MIN, Math.max(0, min + Number(b.dataset.dm))); show(); });
    if ($('#dMinSave')) $('#dMinSave').onclick = () => {
      readIn();
      const x = myData(); if (min) x.log[date] = min; else delete x.log[date]; mySave(x);
      closeSheet(); // 保存したらホームにもどる
      if (currentView !== 'home') showView('home'); else renderHome();
      toast('奉仕時間を保存しました');
    };
    $('#evAdd').onclick = () => {
      const title = $('#evTitle').value.trim(); if (!title) { toast('予定の内容を入れてください'); return; }
      const x = myData(); x.events.push({ id: uid(), date, time: $('#evTime').value || '', title }); mySave(x); renderHome(); paint();
    };
    $$('[data-evdel]', S).forEach(b => b.onclick = () => { const x = myData(); x.events = x.events.filter(e => e.id !== b.dataset.evdel); mySave(x); renderHome(); paint(); });
    if ($('#dAddSched')) $('#dAddSched').onclick = () => openSchedForm(null, date, () => openDay(date));
    $$('[data-apmemo2]', S).forEach(b => b.onclick = () => openMemo(b.dataset.apmemo2, () => openDay(date)));
  };
  paint();
}


/* ---------- 再訪問の約束（メモの next に入れる。このスマホの中だけ） ---------- */
function nextInputsHtml(p, n) {
  return `<div class="inline"><label class="field" style="flex:1.4;margin:6px 0"><span>次の約束の日（なくてもよい）</span><input type="date" id="${p}D" value="${esc(n ? n.date : '')}"></label>
    <label class="field" style="flex:1;margin:6px 0"><span>時刻</span><input type="time" id="${p}T" value="${esc(n ? n.time : '')}"></label></div>`;
}
function readNext(p) {
  const d = $('#' + p + 'D'), t = $('#' + p + 'T');
  const v = d && /^\d{4}-\d{2}-\d{2}$/.test(d.value) ? d.value : '';
  return v ? { date: v, time: t && /^\d{1,2}:\d{2}$/.test(t.value) ? t.value : '' } : null;
}
function fmtNext(n) { return `${fmtYmd(n.date)}${n.time ? ' ' + n.time : ''}`; }
/* その日の、自分の再訪問の約束 */
function apptsOn(date) {
  if (!Store.data || !featFollow()) return [];
  const o = memoAll(), out = [];
  Object.keys(o).forEach(k => {
    const m = o[k], f = fol(k);
    if (!m || !m.next || m.next.date !== date || !f || f.by !== me().id) return;
    const [hid, unit] = parseKey(k), h = houseById(hid);
    if (h) out.push({ k, h, unit, next: m.next });
  });
  return out.sort((a, b) => ((a.next.time || '99') < (b.next.time || '99') ? -1 : 1));
}
function clearAppt(k) {
  const o = memoAll();
  if (!o[k]) return;
  delete o[k].next;
  if (!o[k].text) delete o[k];
  memoSaveAll(o);
}
function apptDayHtml(date) {
  const list = apptsOn(date);
  if (!list.length) return '';
  return `<p class="q" style="font-size:17px">再訪問の約束</p>` + list.map(a => `<article class="ritem k-handoff"><div>
      <p class="rt">${a.next.time ? esc(a.next.time) + '　' : ''}${targetName(a.h, a.unit)}</p></div>
      <button type="button" class="btn small" data-apmemo2="${esc(a.k)}">メモ・記録</button></article>`).join('');
}
const ICO_RE = SVG('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/>');

/* ---------- ホームの「おすすめ」 ----------
   カードを受け取らなくても、空いた時間に2〜3件回れる「会えていない家」を出す。
   ・出すかどうか・種類・件数などは区域係が決める（settings.reco…）
   ・種類ごとに順番に1件ずつえらぶので、「近く」と「長く会えていない」などが混ざって出る
   ・自分の留守宅カード・区域カードの家を先に出す。ほかの人の留守宅カードの家は、係の設定で外す
   ・おすすめから開いて記録すると、記録に src: 'reco:種類' が付く（係の画面で、種類ごとの会えた割合を見る） */
const RECO_KINDS2 = [
  ['near', 1, '近くの留守宅', '現在地から近くて、最近会えていない家'],
  ['slot', 2, '今の時間帯がねらい目', '今の曜日・時間帯に会えたことがある家'],
  ['try', 4, '時間帯を変えてみる', '留守が続いていて、今の時間帯はまだ訪ねていない家'],
  ['long', 8, '長く会えていない家', '遠くても出します'],
  ['biz', 16, '会社・店舗（営業時間中）', '平日の昼間に、会社・店舗・事務所など'],
  ['fresh', 32, 'まだ一度も訪ねていない家', '仮の家の確認にもなります']
];
const RECO_LIM = { recoCount: [1, 5], recoDist: [100, 3000], recoLongDays: [30, 730], recoSkipDays: [0, 60] };
const recoOn = () => !!Store.data && Number(D().settings.recoOn) !== 0;
function recoLabel(src) {
  if (!src || String(src).indexOf('reco') !== 0) return '';
  if (src === 'reco:after') return 'おすすめ（完了のあとの留守宅）';
  const r = RECO_KINDS2.find(x => 'reco:' + x[0] === src);
  return r ? r[2] : 'おすすめ';
}
let RECO_CACHE = null, lastReco = [], recoLocTried = false;
const recoSkip = new Set(), recoTags = new Map();
function recoMark(hid, unit, rk) { recoTags.set(K(hid, unit || ''), rk || ''); }
/* 記録のときに、おすすめから開いた家なら種類を返す（1回かぎり） */
function recoSrc(hid, unit) {
  const k = K(hid, unit || '');
  if (!recoTags.has(k)) return '';
  const rk = recoTags.get(k); recoTags.delete(k);
  return rk ? 'reco:' + rk : 'reco';
}
function computeHomeReco() {
  const st = D().settings, bits = Number(st.recoKinds) || 0, on = b => !!(bits & b);
  if (!recoOn() || !bits) return { list: [], needPos: false };
  const nowD = new Date(), now = nowD.getTime(), cur = slotOf(nowD), band = bandOf(nowD);
  const key = [me().id, cur, myPos ? myPos[0].toFixed(4) + ',' + myPos[1].toFixed(4) : '', [...recoSkip].join(','), window.KG_RECO_ALL ? 'all' : ''].join('|');
  if (RECO_CACHE && RECO_CACHE.key === key && now - RECO_CACHE.at < 60000) return RECO_CACHE.v;
  const skipMs = (Number(st.recoSkipDays) || 0) * DAY, longMs = (Number(st.recoLongDays) || 180) * DAY;
  const near = Number(st.recoDist) || 500, others = Number(st.recoOthers) !== 0, cardOut = Number(st.recoCardOut) !== 0;
  const bizTime = dayTypeOf(nowD) === '平日' && (band === '朝' || band === '昼' || band === '午後');
  const mineKeys = new Set(), othersCard = new Set();
  activeCards().forEach(c => c.keys.forEach(k => (c.by === me().id ? mineKeys : othersCard).add(k)));
  const buckets = {};
  RECO_KINDS2.forEach(r => { buckets[r[0]] = new Map(); });
  for (const h of D().houses) {
    if (!h.terrId || recoSkip.has(h.id)) continue;
    const t = terrById(h.terrId);
    if (!t || (!others && t.holder && !myTerr(t))) continue;
    const d = myPos ? distM(myPos, [h.lat, h.lng]) : null;
    for (const u of targets(h)) {
      const k = K(h.id, u);
      if (D().dnc[k] || D().follows[k] || relOf(k) || recentMet(k)) continue;
      if (cardOut && othersCard.has(k)) continue;
      if (coveredBySpecial(h, u)) continue; // 特別区域（コンビニなど）で回る家は、おすすめに出さない
      const s = sum(k);
      if (s.last && skipMs && now - Date.parse(s.last.at) < skipMs) continue;
      const metAgo = s.met ? now - Date.parse(s.met.at) : Infinity;
      const unmet = isUnmet(k), longOk = !s.met || metAgo > longMs;
      const kind = h.type === 'apt' ? unitKind(h, u) : kindOf(h);
      const c = [];
      if (on(1) && d != null && d <= near && s.n && longOk) c.push(['near', 70 - d / 20, `近く（約${fmtDist(d)}）${s.awayN ? `・留守${s.awayN}回` : ''}`]);
      if (on(2) && hasSlot(s.metSlots, cur) && metAgo > 30 * DAY) c.push(['slot', 60, `${slotShort(cur)}に会えたことがある`]);
      if (on(4) && unmet && slotCount(s.slots) < SLOTS.length && !hasSlot(s.slots, cur)) c.push(['try', 50 + Math.min(s.awayN, 5) * 3, `留守${s.awayN}回・${slotShort(cur)}はまだ訪ねていない`]);
      if (on(8) && s.n && longOk) {
        const a = visitsOf(k), days = daysSince(s.met ? s.met.at : a[a.length - 1].at);
        if (days * DAY >= longMs) c.push(['long', 40 + Math.min(days, 730) / 15, s.met ? `最後に会えてから${days}日` : `${days}日前から会えていない`]);
      }
      if (on(16) && bizTime && kind !== 'home' && longOk) c.push(['biz', 45, `${kindName(kind)}・営業時間中`]);
      if (on(32) && !s.n) c.push(['fresh', 35, h.prov ? 'まだ訪ねていない（仮の家の確認にも）' : 'まだ一度も訪ねていない家']);
      if (!c.length) continue;
      const mine = mineKeys.has(k), own = myTerr(t);
      const bonus = mine ? 30 : own ? 15 : 0;
      const tag = mine ? 'あなたの留守宅カードの家' : own ? 'あなたの区域カードの家' : '';
      c.forEach(([rk, base, why]) => {
        const sc = base + bonus - (d != null && rk !== 'near' ? Math.min(30, d / 200) : 0);
        const b = buckets[rk], prev = b.get(h.id);
        if (!prev || prev.sc < sc) b.set(h.id, { k, h, u, t, rk, sc, why, tag, d, mine });
      });
    }
  }
  const N = window.KG_RECO_ALL ? 1e9 : Math.min(5, Math.max(1, Number(st.recoCount) || 3)); // kangaeru.js が候補を全部ほしいときだけ件数の上限をはずす
  const lists = Object.keys(buckets).map(rk => [...buckets[rk].values()].sort((a, b) => b.sc - a.sc)).filter(l => l.length);
  lists.sort((a, b) => b[0].sc - a[0].sc);
  const out = [], used = new Set();
  while (out.length < N && lists.some(l => l.length)) {
    for (const l of lists) {
      while (l.length && used.has(l[0].h.id)) l.shift();
      if (l.length && out.length < N) { const x = l.shift(); used.add(x.h.id); out.push(x); }
    }
  }
  const v = { list: out, needPos: on(1) && !myPos };
  RECO_CACHE = { key, at: now, v };
  return v;
}
function homeRecoHtml() {
  lastReco = [];
  if (!recoOn() || !(Number(D().settings.recoKinds) || 0)) return '';
  const st = D().settings, r = computeHomeReco(), cur = slotOf(new Date());
  lastReco = r.list.map(x => x.h.id);
  // おすすめの家の区域に、今の時間帯の留守宅カードがあれば、受け取るボタンを出す
  let sugg = null;
  if (Number(st.recoCardBtn) !== 0 && r.list.length && myAwayCount(false) < st.awayMax) {
    sugg = new Map();
    awaySuggestions(me().id, [cur]).forEach(x => { if (!sugg.has(x.t.id)) sugg.set(x.t.id, x); });
  }
  const items = r.list.map(x => {
    const cs = sugg && !x.mine ? sugg.get(x.t.id) : null;
    return `<article class="ritem rk-${x.rk}"><div>
      <p class="rt"><span class="stamp xs${noCls(x.t.no)}">${esc(x.t.no)}</span> ${targetName(x.h, x.u)}</p>
      <p class="recowhy"><b>${esc(recoLabel('reco:' + x.rk))}</b>　${esc(x.why)}</p>
      ${x.d != null && x.rk !== 'near' ? `<p class="muted">ここから約${fmtDist(x.d)}</p>` : ''}
      ${x.tag ? `<span class="recotag">${esc(x.tag)}</span>` : ''}
    </div><button type="button" class="btn small primary" data-rgo="${esc(x.h.id)}" data-unit="${esc(x.u)}" data-rk="${x.rk}">地図で見る</button>
    ${cs ? `<div class="actions span"><button type="button" class="btn small" data-rcard="${esc(x.t.id)}" data-slot="${esc(cur)}">この区域の留守宅カードを受け取る（${cs.keys.length}軒）</button></div>` : ''}</article>`;
  }).join('');
  return `<h2 class="sec">空いた時間に、おすすめ</h2>
    <p class="hint">カードを受け取らなくても回れる、会えていない家です（今は${slotShort(cur)}）。記録すると、その区域の地図にも反映されます。</p>
    ${r.needPos ? '<div class="row"><button type="button" class="btn small" data-rpos>現在地から近い家も出す</button></div>' : ''}
    ${items || '<div class="empty">今出せるおすすめはありません。</div>'}
    <div class="row">${r.list.length ? '<button type="button" class="btn small" data-rmore>ほかのおすすめ</button>' : ''}${recoSkip.size ? '<button type="button" class="btn small" data-rreset>はじめのおすすめにもどす</button>' : ''}${myPos ? '<button type="button" class="btn small" data-rpos>現在地を更新</button>' : ''}</div>`;
}
/* 位置情報をすでに許可しているスマホでは、だまって現在地を取って「近くの留守宅」を出す */
function maybeAutoLocate() {
  if (recoLocTried || myPos || !recoOn() || !((Number(D().settings.recoKinds) || 0) & 1)) return;
  recoLocTried = true;
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(p => {
        if (p.state === 'granted') locate(() => { RECO_CACHE = null; renderRecoView(); });
      }).catch(() => {});
    }
  } catch (e) { /* 何もしない */ }
}
/* 係の画面：おすすめの設定と、種類ごとの会えた割合 */
function renderRecoAdmin() {
  const box = $('#adReco'); if (!box) return;
  const st = D().settings, on = Number(st.recoOn) !== 0;
  const flag = (key, label, hint, a, b) => `<div class="setrow"><span>${label}<br><small class="hint">${hint}</small></span>
    <div class="seg" role="group" aria-label="${label}"><button type="button" data-sset="${key}" data-v="1" aria-pressed="${Number(st[key]) !== 0}">${a}</button><button type="button" data-sset="${key}" data-v="0" aria-pressed="${Number(st[key]) === 0}">${b}</button></div></div>`;
  // おすすめから訪ねた記録（直近90日）：2026-10-26 からは、完了のあとの留守宅（reco:after）だけ。前の種類の記録は「前の形のおすすめ」にまとめる
  const since = Date.now() - 90 * DAY, stat = { after: { n: 0, m: 0 }, old: { n: 0, m: 0 } };
  D().visits.forEach(v => {
    if (!v.src || String(v.src).indexOf('reco') !== 0 || Date.parse(v.at) < since) return;
    const s = stat[String(v.src) === 'reco:after' ? 'after' : 'old'];
    s.n++; if (v.result === 'met') s.m++;
  });
  const rows = [['after', '完了のあとの留守宅'], ['old', '前の形のおすすめ']].filter(r => stat[r[0]].n).map(r => {
    const s = stat[r[0]];
    return `<tr><th>${r[1]}</th><td>${s.n}件</td><td>${s.m}件</td><td><b>${Math.round(s.m / s.n * 100)}%</b></td></tr>`;
  }).join('');
  box.innerHTML = `<h2 class="sec">おすすめ</h2>
    <p class="hint">完了した区域（S-13 に完了として記録した区域）の残りの留守宅を、全員の画面の下のタブ「おすすめ」に、近くの数軒ずつ出します。カードを受け取らなくても、空いた時間に回れます。</p>
    ${flag('recoOn', 'おすすめを出す', '出さないにすると、全員の画面から「おすすめ」のタブが消えます', '出す', '出さない')}
    ${on ? '<p class="hint">出す家・期間・予定で押さえる数などは、区域タブの「状況」の「区域の決め（設定）」の「完了のあとの留守宅（おすすめ）」で決めます。</p>' : ''}
    ${flag('wxOn', '雨の日は、集合住宅を先に出す', '雨のとき、全員の「区域をもらう」（おすすめ順）では集合住宅の多い区域を、「おすすめ」タブでは集合住宅の部屋（エレベーターありが先）を、自動で先に出します。奉仕者の操作はいりません', '出す', '出さない')}
    ${on || Number(st.wxOn) !== 0 ? `<p class="hint">今の天気の判定：${!LIVE ? '試作モードでは調べません' : !WX ? 'まだ届いていません（数分後にもう一度開いてください）' : WX.off ? '夜は調べません' : WX.err ? '調べられませんでした（ふだんの並びで動いています）' : (WX.r === 1 ? '<b>雨</b>' : '雨ではない') + `（${fmtTime(new Date(WX.at))}に確認${WX.p != null ? `・2時間の降水確率 ${WX.p}%` : ''}）`}</p>` : ''}
    <h3 class="sub">おすすめから訪ねた記録（直近90日）</h3>
    ${rows ? `<div class="scroll"><table class="slots narrow"><tr><th>種類</th><th>訪ねた</th><th>会えた</th><th>会えた割合</th></tr>${rows}</table></div>` : '<p class="muted">まだ記録はありません。</p>'}`;
}

/* ---------- ホーム：今日やること ----------
   開いたときに、今日必要なことだけを上から順に出す：
   今日の集まり → たのまれた区域 → 自分の区域カード → 今がチャンスの留守宅カード */
const ICO_CAL = SVG('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
const ICO_SUN = SVG('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>');
const ICO_OK = SVG('<path d="M4 12.5l4.5 4.5L20 6.5"/>');
let CHANCE_CACHE = null;
/* 今の時間帯に受け取れる留守宅カードのうち、会えそうな軒数がいちばん多いもの（1分ためておく） */
function chanceCard() {
  const now = Date.now();
  if (CHANCE_CACHE && now - CHANCE_CACHE.at < 60000 && CHANCE_CACHE.uid === me().id) return CHANCE_CACHE.v;
  let v = null;
  if (myAwayCount(false) < D().settings.awayMax) {
    const slot = slotOf(new Date());
    const list = awaySuggestions(me().id, [slot]);
    list.forEach(x => { x.p = meetChance(x.t, slot).p; x.exp = x.keys.length * x.p; });
    list.sort((a, b) => b.exp - a.exp);
    const x = list[0];
    if (x) {
      const top = SLOTS.map(sl => [sl, meetChance(x.t, sl).p]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(y => y[0]);
      v = Object.assign(x, { slot, hot: top.includes(slot) });
    }
  }
  CHANCE_CACHE = { at: now, uid: me().id, v };
  return v;
}
function todayTodoHtml(todays) {
  let h = '';
  todays.forEach(sc => {
    h += `<div class="todo"><span class="tico">${ICO_CAL}</span>
      <div class="tbody2"><small>今日の集まり（${esc(schedGroupName(sc.group))}）</small><b>${esc(sc.time || '時間未定')}${sc.end ? '〜' + esc(sc.end) : ''}</b><span>${esc(sc.place || '場所未定')}</span></div>
      ${placeHref(sc) ? `<a class="btn" href="${esc(placeHref(sc))}" target="_blank" rel="noopener">道順</a>` : ''}</div>`;
  });
  const today = ymd(new Date()), od = myData();
  od.events.filter(e => e.date === today).sort((a, b) => ((a.time || '') < (b.time || '') ? -1 : 1)).forEach(e => {
    h += `<div class="todo"><span class="tico">${ICO_CAL}</span>
      <div class="tbody2"><small>自分の予定</small><b>${e.time ? esc(e.time) + '　' : ''}${esc(e.title)}</b></div>
      <button type="button" class="btn" data-day="${today}">見る</button></div>`;
  });
  apptsOn(today).forEach(a => {
    h += `<div class="todo appt"><span class="tico">${ICO_RE}</span>
      <div class="tbody2"><small>再訪問の約束</small><b>${a.next.time ? esc(a.next.time) + '　' : ''}${targetName(a.h, a.unit)}</b></div>
      <div class="tbtns2"><button type="button" class="btn" data-apmemo="${esc(a.k)}">メモ・記録</button>
        <button type="button" class="btn" data-apdone="${esc(a.k)}">済み</button></div></div>`;
  });
  const seen = asgSeen();
  todayAsgs().filter(a => a.keys.some(k => !seen.has(k))).forEach(a => {
    h += `<div class="todo asg"><div class="asgtop"><span class="asgdot">${ICO_OK}</span>
        <div><b>${a.label ? esc(a.label) : `区域${esc(a.t.no)}`}を、今日いっしょに回るように、たのまれました</b>
        <small>${esc(uname(a.by))}さんから${a.p ? `・回る範囲あり（${esc(partMates(a.p).map(u => uname(u) + 'さん').join('・') || 'ひとり')}と）` : ''}</small></div></div>
      <div class="row"><button type="button" class="btn primary" data-asgopen="${esc(a.t.id)}"${a.card ? ` data-asgcard="${esc(a.card)}"` : ''} data-asgkeys="${esc(a.keys.join(' '))}">地図をひらく</button>
        <button type="button" class="btn" data-asgok="${esc(a.keys.join(' '))}">わかりました</button></div></div>`;
  });
  const mine = D().territories.filter(t => t.holder === me().id).sort(byNo);
  mine.slice(0, 3).forEach(t => {
    const r = roundInfo(t.id), total = r ? r.c.todo + r.c.done : 0;
    h += `<div class="todo terr"><span class="stamp sm${noCls(t.no)}${t.group ? ' grp' : ''}">${esc(t.no)}</span>
      <div class="tbody2"><small>${t.group ? `${esc(useName(t))}の区域カード` : 'あなたの区域カード'}</small><b>${esc(t.name)}</b>
        ${r ? `<small>訪ねた家 ${r.c.done} / ${total}</small>` : ''}</div>
      <button type="button" class="btn primary" data-openterr="${esc(t.id)}">地図 ›</button>
      ${r ? `<div class="progress" role="progressbar" aria-valuenow="${r.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="回った割合"><i style="width:${r.pct}%"></i></div>` : ''}</div>`;
  });
  if (mine.length > 3) h += `<p class="muted todonone">ほかに区域カードが${mine.length - 3}枚あります。「区域カード」の画面で見られます。</p>`;
  const ch = chanceCard();
  if (ch) {
    const n = ch.keys.length, k = Math.max(1, Math.round(ch.exp));
    h += `<div class="todo${ch.hot ? ' hot' : ''}"><span class="tico">${ch.hot ? ICO_SUN : ICO_CAL}</span>
      <div class="tbody2"><span class="hotlab">${ch.hot ? '今がチャンス・留守宅カード' : '今の時間帯の留守宅カード'}</span>
        <b>区域${esc(ch.t.no)}　${esc(slotShort(ch.slot))}</b><span>${n}軒のうち、約${k}軒で会えそう</span></div>
      <button type="button" class="btn" data-chance="${esc(ch.t.id)}" data-slot="${esc(ch.slot)}">受け取る</button></div>`;
  }
  return `<h2 class="sec">今日やること</h2>` + (h || '<p class="muted todonone">今日の予定や、たのまれた区域はありません。</p>');
}

function renderHome() {
  const box = $('#view-home'); if (!box || box.hidden) return;
  const o = myData(), t = o.timer, h = new Date().getHours();
  const hi = h < 5 ? 'こんばんは' : h < 10 ? 'おはようございます' : h < 17 ? 'こんにちは' : 'こんばんは';
  const todays = schedsOn(ymd(new Date()));
  $('#homeHello').innerHTML = `<div class="homehello"><p>${esc(me().name)}さん、${hi}</p><b>${fmtYmd(ymd(new Date()))}</b>
    ${me().group ? `<span class="gbadge">${esc(me().group)}グループ${isOverseer() ? '・監督' : me().leader ? '・司会者' : ''}</span>` : ''}</div>
    ${UI.todayOn === 'on' ? todayTodoHtml(todays) : asgNoticeHtml()}`;
  clearInterval(timerTick);
  if (!featTime()) { // 奉仕時間を使わない人には、タイマー・目標・まとめを出さない
    $('#homeTimer').innerHTML = ''; $('#homeGoal').innerHTML = ''; $('#homeMonthEnd').innerHTML = '';
  } else {
  const ms = timerMs(t);
  if (UI.fTimer === 'off' && !t) { $('#homeTimer').innerHTML = manualTodayHtml(o); bindTodayDial(); }
  else $('#homeTimer').innerHTML = `<div class="timer ${t ? t.state : 'idle'}">
    <p class="tlabel">${!t ? '奉仕の時間をはかる' : t.state === 'run' ? '奉仕中' : '一時停止中'}</p>
    <p class="tclock" id="tClock">${fmtHM(ms)}</p>
    <div class="tbtns">${!t ? '<button class="btn primary tbig" data-timer="start">奉仕スタート</button>'
      : `${t.state === 'run' ? '<button class="btn" data-timer="pause">一時停止</button>' : '<button class="btn primary" data-timer="resume">再開</button>'}
         <button class="btn danger" data-timer="stop">奉仕終了</button>`}</div>
    <p class="muted">今日の記録：${fmtMin(o.log[ymd(new Date())] || 0)}</p></div>`;
  clearInterval(timerTick);
  if (t && t.state === 'run') timerTick = setInterval(() => { const el = $('#tClock'); if (el && !$('#view-home').hidden) el.textContent = fmtHM(timerMs(myData().timer)); }, 1000);
  $('#homeGoal').innerHTML = goalHtml(o);
  $('#homeMonthEnd').innerHTML = monthEndHtml(o);
  }
  $('#homeCal').innerHTML = calHtml(o);
  // ②の対応：グループ監督の「グループ」タブをなくしたので、そこにあった月の予定印刷（掲示板用）をホームに置く
  $('#homeSchedTools').innerHTML = (isAdmin() || isOverseer())
    ? printMonthPicker('homeScPrint') : '';
  if (window.dougaHomeCard) dougaHomeCard(); // はじめての方へ（使い方の動画のカード）
}
/* スワイプの動き（指でもマウスでも）：左に半分以上ずらすと開き、ほかをさわると閉じる */
const SWIPE_W = 176;
let swipedAt = 0; // スワイプした直後の「押した」は、画面を開かない
function bindSwipe() {
  let cur = null, sx = 0, sy = 0, dx = 0, moved = false;
  document.addEventListener('pointerdown', e => {
    const body = e.target.closest('.swipe-body');
    $$('.swipe.open').forEach(x => { if (!body || x !== body.parentNode) x.classList.remove('open'); });
    if (!body || e.target.closest('a, button')) { cur = null; return; }
    cur = body; sx = e.clientX; sy = e.clientY; dx = 0; moved = false;
  }, true);
  document.addEventListener('pointermove', e => {
    if (!cur) return;
    const x = e.clientX - sx, y = e.clientY - sy;
    if (!moved) {
      if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
      if (Math.abs(y) > Math.abs(x)) { cur = null; return; } // たてのスクロールは邪魔しない
      moved = true; cur.style.transition = 'none';
    }
    const base = cur.parentNode.classList.contains('open') ? -SWIPE_W : 0;
    dx = Math.min(0, Math.max(-SWIPE_W - 24, base + x));
    cur.style.transform = `translateX(${dx}px)`;
  }, true);
  const end = () => {
    if (!cur) return;
    const b = cur; cur = null;
    b.style.transition = ''; b.style.transform = '';
    if (moved) { swipedAt = Date.now(); b.parentNode.classList.toggle('open', dx < -SWIPE_W / 2); }
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // 予定の行を押したとき
  const openRow = r => {
    if (Date.now() - swipedAt < 500) return;
    const sw = r.parentNode;
    if (sw && sw.classList.contains('open')) { sw.classList.remove('open'); return; } // 開いていたら閉じるだけ
    const s = D().schedules.find(x => x.id === r.dataset.sopen); if (!s) return;
    const day = !$('#sheet').hidden ? dayCtx : null;
    openSchedActions(s, day ? () => openDay(day) : null);
  };
  document.addEventListener('click', e => { const r = e.target.closest('[data-sopen]'); if (r) openRow(r); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest && e.target.closest('[data-sopen]'); if (!r || r !== e.target) return;
    e.preventDefault(); openRow(r);
  });
  // 「編集」「削除」（スワイプで出るボタン）
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-scact]'); if (!b) return;
    const s = D().schedules.find(x => x.id === b.dataset.sid); if (!s) return;
    const day = !$('#sheet').hidden ? dayCtx : null, back = day ? () => openDay(day) : null;
    if (b.dataset.scact === 'edit') { openSchedForm(s, null, back); return; }
    if (!await ask(`${fmtYmd(s.date)}　${s.time || ''} ${s.place || '場所未定'} の予定を消します。よろしいですか？`)) return;
    commit('集まりの予定を消しました', () => { D().schedules = D().schedules.filter(x => x.id !== s.id); });
    if (back) back();
  });
}
/* おすすめのタブ */
function renderRecoView() {
  const box = $('#recoPane'); if (!box || $('#view-reco').hidden) return;
  box.innerHTML = homeRecoHtml() || '<div class="empty">今は、おすすめを出さない設定です。</div>';
  maybeAutoLocate();
}
function bindReco() {
  $('#view-reco').addEventListener('click', e => {
    const q = sel => e.target.closest(sel);
    let x;
    if ((x = q('[data-rgo]'))) { recoMark(x.dataset.rgo, x.dataset.unit, x.dataset.rk); goTo(x.dataset.rgo, x.dataset.unit, false, x.dataset.rk); }
    else if ((x = q('[data-rcard]'))) { CHANCE_CACHE = null; RECO_CACHE = null; takeAwayCard(x.dataset.rcard, x.dataset.slot); }
    else if (q('[data-rmore]')) { lastReco.forEach(id => recoSkip.add(id)); RECO_CACHE = null; renderRecoView(); }
    else if (q('[data-rreset]')) { recoSkip.clear(); RECO_CACHE = null; renderRecoView(); }
    else if (q('[data-rpos]')) locate(() => { RECO_CACHE = null; renderRecoView(); });
  });
}
function bindHome() {
  $('#view-home').addEventListener('click', e => {
    const q = sel => e.target.closest(sel);
    let x;
    if ((x = q('[data-apmemo]'))) openMemo(x.dataset.apmemo);
    else if ((x = q('[data-apdone]'))) { clearAppt(x.dataset.apdone); renderHome(); toast('約束を「済み」にしました'); }
    else if ((x = q('[data-openterr]'))) openTerr(x.dataset.openterr);
    else if ((x = q('[data-chance]'))) { CHANCE_CACHE = null; takeAwayCard(x.dataset.chance, x.dataset.slot); }
    else if ((x = q('[data-timer]'))) timerAction(x.dataset.timer);
    else if ((x = q('[data-mt]'))) addToday(Number(x.dataset.mt));
    else if ((x = q('[data-report]'))) openReportSheet(x.dataset.report);
    else if (q('#goalEdit')) openGoalPlan();
    else if (q('#goalReport')) openReportSheet(reportYmNow(), { pick: true });
    else if (q('#monthHist')) openMonthHist();
    else if ((x = q('[data-cm]'))) { const b = calMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1); calMonth = new Date(b.getFullYear(), b.getMonth() + Number(x.dataset.cm), 1); renderHome(); }
    else if ((x = q('[data-day]'))) openDay(x.dataset.day);
    else if ((x = q('[data-calmode]'))) { calMode = x.dataset.calmode; renderHome(); }
    else if (q('#homeScPrint')) printPickedMonth('homeScPrint');
  });
}

/* ---- 奉仕の集まりの予定を入れる（グループ監督・区域係） ---- */
/* 集まりの場所の道順：地図でえらんだ場所 → GoogleマップのピンのURL → 名前・住所で検索 */
function placeHref(sc) {
  if (sc && Array.isArray(sc.loc) && sc.loc.length === 2) return `https://www.google.com/maps/search/?api=1&query=${Number(sc.loc[0]).toFixed(6)},${Number(sc.loc[1]).toFixed(6)}`;
  if (sc && sc.mapUrl) return sc.mapUrl;
  return sc && sc.place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sc.place)}` : '';
}
const GMAP_RE = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\//i;
/* GoogleマップのURLの中に緯度・経度があれば取り出す（短いURL maps.app.goo.gl には入っていないので、そのまま使う） */
function coordsFromUrl(u) {
  const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(u) || /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(u) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
let pickPlace = null; // 区域マップの地図で場所をえらんでいるとき
function openSchedForm(s, date, back, draft) {
  const admin = isAdmin(), groups = groupsAll();
  const v = (k, def) => (draft && draft[k] != null ? draft[k] : (s && s[k] != null ? s[k] : def));
  const g0 = v('group', admin ? (groups[0] || '') : myGroup());
  const loc = v('loc', null);
  const inp = 'style="width:100%;min-height:54px;border-radius:12px;border:2px solid var(--ink2);padding:0 12px;font-size:18px;background:#fff"';
  setSheet(headHtml(null, s ? '集まりの予定を直す' : '集まりの予定を入れる', '') + `
    <label class="field"><span>日にち</span><input type="date" id="scDate" value="${esc(v('date', date || ymd(new Date())))}" ${inp}></label>
    <div class="inline"><label class="field" style="flex:1"><span>はじまり</span><input type="time" id="scTime" value="${esc(v('time', '09:30'))}" ${inp}></label>
      <label class="field" style="flex:1"><span>おわり（なくてもよい）</span><input type="time" id="scEnd" value="${esc(v('end', ''))}" ${inp}></label></div>
    <label class="field"><span>場所</span><input type="text" id="scPlace" maxlength="60" value="${esc(v('place', ''))}" placeholder="例：〇〇さん宅、会館"></label>
    <p class="hint">施設の名前や住所を入れると、Googleマップで探せます。住所で出てこない場所は、下のどちらかで場所をのこせます。</p>
    <label class="field"><span>GoogleマップのピンのURL（なくてもよい）</span><input type="url" id="scMap" maxlength="300" value="${esc(v('mapUrl', ''))}" placeholder="https://maps.app.goo.gl/…" ${inp}></label>
    <div class="inline"><button type="button" class="btn small" id="scPick">区域マップの地図でえらぶ</button>
      ${loc ? `<span class="muted">地図でえらんだ場所があります</span><button type="button" class="btn small" id="scLocClear">外す</button>` : ''}</div>
    <label class="field"><span>ひとこと（なくてもよい）</span><input type="text" id="scNote" maxlength="160" value="${esc(v('note', ''))}" placeholder="例：区域12を回ります"></label>
    ${admin ? `<label class="field"><span>どのグループの予定か</span><select id="scGroup" ${inp}>
      <option value=""${!g0 ? ' selected' : ''}>全体（会衆の全員）</option>${groups.map(g => `<option value="${esc(g)}"${g === g0 ? ' selected' : ''}>${esc(g)}グループ</option>`).join('')}</select></label>`
      : `<p class="muted">${esc(myGroup())}グループの予定として入れます（${groupMembers(myGroup()).length}人に届きます）。</p>`}
    ${s ? '' : `<label class="check"><input type="checkbox" id="scRepeat"${v('repeat', false) ? ' checked' : ''}>同じ曜日・同じ時間で、4週ぶん入れる</label>`}
    <button class="btn primary block" id="scSave">保存する</button>
    ${s ? '<button class="btn danger block" id="scDel">この予定を消す</button>' : ''}
    <button class="btn block" id="scBack">もどる</button>`);
  const done = () => (back ? back() : closeSheet());
  const read = () => ({ date: $('#scDate').value, time: $('#scTime').value || '', end: $('#scEnd').value || '', place: $('#scPlace').value.trim(),
    note: $('#scNote').value.trim(), group: admin ? $('#scGroup').value : myGroup(), mapUrl: $('#scMap').value.trim(), loc,
    repeat: !!($('#scRepeat') && $('#scRepeat').checked) });
  $('#scBack').onclick = done;
  $('#scPick').onclick = () => {
    const d = read();
    closeSheet(); showView('map');
    pickPlace = ll => { d.loc = [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6]; openSchedForm(s, date, back, d); toast('場所をえらびました'); };
    toast('集まりの場所をタップしてください（地図を大きくしてから）');
  };
  if ($('#scLocClear')) $('#scLocClear').onclick = () => { const d = read(); d.loc = null; openSchedForm(s, date, back, Object.assign(d, { loc: undefined })); };
  $('#scSave').onclick = () => {
    const d = read();
    if (!d.date) { toast('日にちを入れてください'); return; }
    if (d.mapUrl && !GMAP_RE.test(d.mapUrl)) { toast('GoogleマップのURL（https://maps.app.goo.gl/… など）を貼ってください'); return; }
    const base = { time: d.time, end: d.end, place: d.place, note: d.note, group: d.group, mapUrl: d.mapUrl, loc: d.loc || (d.mapUrl ? coordsFromUrl(d.mapUrl) : null) };
    const n = !s && d.repeat ? 4 : 1;
    commit(s ? '集まりの予定を直しました' : `集まりの予定を${n}件入れました`, () => {
      if (s) Object.assign(s, base, { date: d.date, at: new Date().toISOString() });
      else for (let i = 0; i < n; i++) {
        const dd = parseYmd(d.date); dd.setDate(dd.getDate() + 7 * i);
        D().schedules.push(Object.assign({ id: 's' + uid() + i, date: ymd(dd), by: me().id, at: new Date().toISOString() }, base));
      }
    });
    done();
  };
  if ($('#scDel')) $('#scDel').onclick = async () => {
    if (!await ask('この予定を消します。よろしいですか？')) return;
    commit('集まりの予定を消しました', () => { D().schedules = D().schedules.filter(x => x.id !== s.id); });
    done();
  };
}
let adSchedMode = 'cal'; // 係の予定：カレンダーか一覧か
function renderSchedAdmin() {
  const box = $('#adSched'); if (!box) return;
  const admin = isAdmin(), today = ymd(new Date());
  const list = D().schedules.filter(s => s.date >= today && (admin || s.group === myGroup()))
    .sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  box.innerHTML = `<h2 class="sec">奉仕の集まりの予定</h2>
    <p class="hint">${admin ? 'どのグループの予定も入れられます。「全体」は会衆の全員に表示されます。' : `${esc(myGroup())}グループの予定を入れられます。グループの人のホーム画面に表示されます。`}</p>
    <button class="btn primary block" id="scNew">＋ 集まりの予定を入れる</button>
    ${printMonthPicker('scPrint')}
    <div class="seg" role="group" aria-label="表示の切りかえ">
      <button type="button" data-asm="cal" aria-pressed="${adSchedMode === 'cal'}">カレンダー</button>
      <button type="button" data-asm="list" aria-pressed="${adSchedMode === 'list'}">一覧</button></div>
    ${adSchedMode === 'cal'
      ? calHtml({ events: [], log: {}, admin: true }) + '<p class="hint">日付を押すと、その日の予定を見たり、すぐ入れたりできます。</p>'
      : (list.length ? swipeHint(list) + list.map(s => schedRow(s, true)).join('') : '<div class="empty">これからの予定はありません。</div>')}`;
  $('#scNew').onclick = () => openSchedForm(null, null, null);
  $('#scPrint').onclick = () => printPickedMonth('scPrint');
  $$('[data-asm]', box).forEach(b => b.onclick = () => { adSchedMode = b.dataset.asm; renderSchedAdmin(); });
  $$('[data-cm]', box).forEach(b => b.onclick = () => {
    const base = calMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    calMonth = new Date(base.getFullYear(), base.getMonth() + Number(b.dataset.cm), 1);
    renderSchedAdmin();
  });
  $$('[data-day]', box).forEach(b => b.onclick = () => openSchedDay(b.dataset.day));
}
/* 係・監督：その日の集まりを見る／すぐ入れる */
function openSchedDay(date) {
  const sc = schedsOn(date);
  setSheet(headHtml(null, fmtYmd(date), '奉仕の集まり') + `
    ${sc.length ? sc.map(s => schedRow(s, false)).join('') : '<p class="muted">この日の集まりはありません。</p>'}
    <button class="btn primary block" id="sdAdd">＋ この日に集まりを入れる</button>
    <button class="btn block" data-close>閉じる</button>`);
  $('#sdAdd').onclick = () => openSchedForm(null, date, () => openSchedDay(date));
}

/* ---- 人とグループ（区域係は変更できる。監督は自分のグループの人を見るだけ） ---- */
/* 保存中の変更（id → 変えた値）。返事を待つあいだに同期で名簿が届いても、画面が元にもどって見えないように上から重ねる */
var USER_PENDING = new Map(); // var：同期の受け取り（上のほうで定義）から、読み込みの順に関係なく見られるように
const userPatchOf = (group, overseer, leader, role, active) => {
  const p = { group: group || undefined, overseer: !!overseer || undefined, leader: !!leader || undefined };
  if (role) p.role = role;
  if (active === false) p.inactive = true;
  return p;
};
function applyUserPending() {
  USER_PENDING.forEach((p, id) => { const u = userById(id); if (u) Object.assign(u, p); });
}
const USER_SAVING = new Map(); // id → 送っている保存（同じ人の保存は、順番に1つずつ送る。あとの変更が先に届いて古い値に戻らないように）
function setUserGroup(u, group, overseer, leader, role, active) {
  const patch = userPatchOf(group, overseer, leader, role, active);
  if (!LIVE) {
    Object.assign(u, patch);
    Store.save(); toast(`${u.name}さんの設定を保存しました`);
    renderAll(); return Promise.resolve();
  }
  const id = u.id, name = u.name;
  const before = { group: u.group, overseer: u.overseer, leader: u.leader, role: u.role, inactive: u.inactive };
  const body = { id, group, overseer, leader };
  if (role) body.role = role;
  if (active === false) body.active = false;
  // 先に画面に出す（保存中に画面を変えても、変えた値のまま見える）。描き直しは少しあとで（続けて押したチェックが消えないように）
  USER_PENDING.set(id, patch);
  Object.assign(u, patch);
  setTimeout(renderAll, 350);
  const run = () => saveUserNow(id, name, body, patch, before);
  const p = (USER_SAVING.get(id) || Promise.resolve()).then(run, run);
  USER_SAVING.set(id, p);
  p.then(() => { if (USER_SAVING.get(id) === p) USER_SAVING.delete(id); });
  return p;
}
async function saveUserNow(id, name, body, patch, before) {
  try {
    await api('user_set', body);
  } catch (e) {
    if (USER_PENDING.get(id) === patch) { USER_PENDING.delete(id); Object.assign(userById(id) || {}, before); }
    toast(`${name}さんの設定を保存できませんでした。通信を確認して、もう一度変えてください`);
    renderAll(); return;
  }
  toast(`${name}さんの設定を保存しました`);
  if (USER_PENDING.get(id) === patch) { // このあとに、もう変更がないとき
    try { await refresh(true); } catch (e) { /* 次の同期で取り直す */ }
    if (USER_PENDING.get(id) === patch) { USER_PENDING.delete(id); Object.assign(userById(id) || {}, patch); } // 保存できた値を正とする
  }
  renderAll();
}
/* 人を追加する（区域係だけ） */
function openAddUser() {
  const groups = groupsAll();
  const f = { name: '', role: 'pub', group: '', overseer: false, leader: false };
  const paint = () => {
    setSheet(headHtml(null, '人を追加する', '会衆で区域マップを使う人を登録します') + `
      <label class="field"><span>名前</span><input type="text" id="auName" maxlength="30" value="${esc(f.name)}" placeholder="例：山田 花子"></label>
      <p class="q">役割</p>
      <div class="seg uiseg" role="group" aria-label="役割">
        <button type="button" data-aurole="pub" aria-pressed="${f.role === 'pub'}">伝道者</button>
        <button type="button" data-aurole="admin" aria-pressed="${f.role === 'admin'}">区域係</button></div>
      <label class="field"><span>グループ（あとからでも変えられます）</span>
        <input type="text" id="auGroup" list="groupList" maxlength="30" value="${esc(f.group)}" placeholder="例：北"></label>
      <datalist id="groupList">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <label class="check"><input type="checkbox" id="auOver"${f.overseer ? ' checked' : ''}>グループ監督</label>
      <label class="check"><input type="checkbox" id="auLead"${f.leader ? ' checked' : ''}>司会者</label>
      <p class="hint">監督と司会者は、グループ奉仕の区域を受け取れます。</p>
      <button class="btn primary block" id="auSave">追加する</button>
      <button class="btn block" data-close>やめる</button>`);
    const keep = () => {
      f.name = $('#auName').value; f.group = $('#auGroup').value;
      f.overseer = $('#auOver').checked; f.leader = $('#auLead').checked;
    };
    $$('[data-aurole]', $('#sheet')).forEach(x => x.onclick = () => { keep(); f.role = x.dataset.aurole; paint(); });
    $('#auSave').onclick = async () => {
      keep();
      const name = f.name.trim();
      if (!name) { toast('名前を入れてください'); return; }
      const body = { name, role: f.role, group: normGroup(f.group), overseer: f.overseer, leader: f.leader };
      // 送信の番号：返事が届かずにもう一度押しても、同じ人を2人にしない（同じ内容なら同じ番号・点検②V11）
      const sig = JSON.stringify(body);
      if (f.ridFor !== sig) { f.rid = 'ua' + uid(); f.ridFor = sig; }
      body.rid = f.rid;
      if (!LIVE) { // 試作版：この端末の中だけに追加
        const u = Object.assign({ id: 'u' + uid(), name, role: f.role }, body.group ? { group: body.group } : {},
          f.overseer ? { overseer: true } : {}, f.leader ? { leader: true } : {});
        delete u.role2;
        commit(`${name}さんを追加しました`, () => { D().users.push(u); });
        closeSheet(); return;
      }
      $('#auSave').disabled = true;
      let j;
      try { j = await api('user_add', body); } catch (e) { $('#auSave').disabled = false; toast('追加できませんでした。通信を確認してください'); return; }
      toast(`${name}さんを追加しました`);
      await refresh(true).catch(() => {});
      renderAll();
      if (!j.url) { closeSheet(); toast('追加しました。招待リンクを出すには、スプレッドシートの「② 公開ページのURLを設定」が必要です'); return; }
      openQrSheet(`${name}さんの招待リンク`, 'このQRを本人のスマホで読み取ってもらいます', j.url, {
        note: '本人のスマホのカメラでQRを読み取ると、その場で使えるようになります。ほかの人には渡さないでください。'
      });
    };
  };
  paint();
}
/* その人の招待リンクとQRを見せる */
async function openUserLink(u, reissue) {
  if (!LIVE) { toast('招待リンクは、本番のときだけ作れます'); return; }
  if (reissue && reissue !== 'confirmed' && !await ask(`${u.name}さんの今の招待リンクは使えなくなります。よろしいですか？`)) return;
  toast('リンクを用意しています…');
  let j;
  try { j = await api('user_link', { id: u.id, reissue: !!reissue }); } catch (e) { toast('リンクを作れませんでした。通信を確認してください'); return; }
  // 安全のため、招待リンクはサーバーに残していない。今のリンクは出せないので、作り直すかを聞く
  if (j && j.need === 'reissue') {
    if (!await ask(`${u.name}さんの招待リンクを作り直します。`, {
      title: '新しい招待リンクを作りますか？',
      body: '安全のため、招待リンクは保存していません。作り直すと、今のリンクと、そのリンクで開いた端末は使えなくなります（新しいリンクを開き直します）。共通リンクやホーム画面のアイコンから登録した端末は、そのまま使えます。',
      ok: '作り直す', danger: false })) return;
    return openUserLink(u, 'confirmed');
  }
  if (!j.url) { toast('先に、スプレッドシートの「② 公開ページのURLを設定」を行ってください'); return; }
  openQrSheet(`${u.name}さんの招待リンク`, 'このQRを本人のスマホで読み取ってもらいます', j.url, {
    note: '本人のスマホのカメラでQRを読み取ると、その場で使えるようになります。ほかの人には渡さないでください。',
    extra: `<button class="btn small danger block" id="qrReissue">リンクを作り直す（今のリンクは使えなくなります）</button>`
  });
  if ($('#qrReissue')) $('#qrReissue').onclick = () => openUserLink(u, true);
}
/* 共通リンクのQR（集会などで、みんなに読み取ってもらう） */
async function openJoinQr() {
  if (!LIVE) { toast('共通リンクは、本番のときだけ使えます'); return; }
  if (!devState.joinUrl) await fetchDevices(true);
  if (!devState.joinUrl) { toast('共通リンクがありません。スプレッドシートのメニューから作ってください'); return; }
  openQrSheet('共通リンクのQR', 'みんなに読み取ってもらいます', devState.joinUrl, {
    note: 'スマホのカメラでこのQRを読み取ると、すぐ下に番号が出ます。本人のスマホに出ている番号と同じか確かめて「登録する」を押すと、その場で使えるようになります。',
    extra: '<div id="qrPend"></div>'
  });
  qrWatching = true;
  renderQrPending();
  fetchDevices(true);
}
/* QRを見せている画面：読み取った人を、すぐ下に出す */
function renderQrPending() {
  const box = $('#qrPend'); if (!box) return;
  const pend = devPending().filter(d => !d.uid);
  box.innerHTML = pend.length
    ? `<h3 class="sub">読み取った人（${pend.length}人）</h3>` + pend.map(d => `<div class="setrow"><span>番号 <b class="devcode">${esc(d.code || '')}</b>　${esc(d.label)}${d.hint ? `<br><b>${esc(d.hint)}</b>` : ''}</span>
        <button class="btn small primary" data-qreg="${esc(d.id)}">登録する</button></div>`).join('')
    : '<p class="muted qrwait"><span class="dotpulse" aria-hidden="true"></span>読み取りを待っています（読み取ると、ここに出ます）</p>';
  $$('[data-qreg]', box).forEach(b => b.onclick = () => openDevRegister(b.dataset.qreg, openJoinQr));
}
/* 読み取ったスマホを、だれが使うか決めて登録する */
function openDevRegister(id, back) {
  const d = (devState.list || []).find(x => x.id === id);
  if (!d || d.status !== 'pending') { toast('この申し込みは、もうありません'); if (back) back(); return; }
  const norm = s => String(s || '').normalize('NFKC').replace(/\s+/g, '');
  const users = D().users.filter(u => !u.inactive).slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const h = norm(d.hint);
  const guess = h ? users.filter(u => { const n = norm(u.name); return n && (n.includes(h) || h.includes(n)); }) : [];
  const btn = u => `<button class="namebtn" data-druid="${esc(u.id)}" data-name="${esc(u.name)}">${esc(u.name)}${u.group ? `<small>${esc(u.group)}グループ</small>` : ''}</button>`;
  setSheet(headHtml(null, 'このスマホを使う人', `番号 ${esc(d.code || '')}・${esc(d.label)}`) + `
    <div class="notice info">本人のスマホに出ている番号が <b class="devcode">${esc(d.code || '')}</b> か確かめてください。</div>
    ${guess.length ? `<p class="q">名乗った名前「${esc(d.hint)}」に近い人</p>${guess.map(btn).join('')}` : ''}
    <p class="q">登録ずみの人からえらぶ</p>
    <label class="field"><span>名前でさがす</span><input type="text" id="drQ" placeholder="名前の一部を入れる" autocomplete="off"></label>
    <div id="drList">${users.map(btn).join('')}</div>
    <p class="q">名簿にいない人</p>
    <button class="btn block" id="drNew">新しい人として登録する</button>
    <button class="btn block" id="drBack">もどる</button>`);
  $('#drQ').oninput = e => { const q = norm(e.target.value); $$('#drList [data-name]').forEach(b => { b.hidden = !!q && !norm(b.dataset.name).includes(q); }); };
  $$('[data-druid]', $('#sheet')).forEach(b => b.onclick = async () => {
    if (!await ask(`${b.dataset.name}さんのスマホとして登録します。よろしいですか？`)) return;
    approveDevice(d, { uid: b.dataset.druid }, b.dataset.name, back);
  });
  $('#drNew').onclick = () => openDevNewUser(d, back);
  $('#drBack').onclick = () => (back ? back() : closeSheet());
}
function openDevNewUser(d, back) {
  const groups = groupsAll();
  const f = { name: d.hint || '', group: '', overseer: false, leader: false, role: 'pub' };
  const paint = () => {
    setSheet(headHtml(null, '新しい人として登録', `番号 ${esc(d.code || '')}・${esc(d.label)}`) + `
      <label class="field"><span>名前</span><input type="text" id="dnName" maxlength="30" value="${esc(f.name)}" placeholder="例：山田 花子"></label>
      <label class="field"><span>グループ（あとからでも変えられます）</span><input type="text" id="dnGroup" list="dnGroups" maxlength="30" value="${esc(f.group)}" placeholder="例：北"></label>
      <datalist id="dnGroups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <label class="check"><input type="checkbox" id="dnOver"${f.overseer ? ' checked' : ''}>グループ監督</label>
      <label class="check"><input type="checkbox" id="dnLead"${f.leader ? ' checked' : ''}>司会者</label>
      <p class="q">役割</p>
      <div class="seg uiseg" role="group" aria-label="役割">
        <button type="button" data-dnrole="pub" aria-pressed="${f.role === 'pub'}">伝道者</button>
        <button type="button" data-dnrole="admin" aria-pressed="${f.role === 'admin'}">区域係</button></div>
      <button class="btn primary block" id="dnSave">登録して、このスマホを使えるようにする</button>
      <button class="btn block" id="dnBack">もどる</button>`);
    const keep = () => { f.name = $('#dnName').value; f.group = $('#dnGroup').value; f.overseer = $('#dnOver').checked; f.leader = $('#dnLead').checked; };
    $$('[data-dnrole]', $('#sheet')).forEach(x => x.onclick = () => { keep(); f.role = x.dataset.dnrole; paint(); });
    $('#dnBack').onclick = () => openDevRegister(d.id, back);
    $('#dnSave').onclick = () => {
      keep();
      const name = f.name.trim();
      if (!name) { toast('名前を入れてください'); return; }
      approveDevice(d, { newUser: { name, group: normGroup(f.group), overseer: f.overseer, leader: f.leader, role: f.role } }, name, back);
    };
  };
  paint();
}
async function approveDevice(d, extra, name, back) {
  toast('登録しています…');
  await deviceAction('device_decide', Object.assign({ id: d.id, decision: 'approve' }, extra),
    `${name}さんのスマホを登録しました。本人のスマホが、すぐ使えるようになります`);
  if (extra.newUser) refresh(true).catch(() => {}); // 新しい人を名簿に入れる
  if (back) back(); else closeSheet();
}
function renderPeople() {
  const box = $('#adPeople'); if (!box) return;
  const admin = isAdmin();
  const users = D().users.filter(u => !u.inactive && (admin || u.group === myGroup())).slice()
    .sort((a, b) => (a.group || '～').localeCompare(b.group || '～', 'ja') || a.name.localeCompare(b.name, 'ja'));
  const noGroup = admin ? D().users.filter(u => !u.inactive && !u.group).length : 0;
  box.innerHTML = `<h2 class="sec">${admin ? '人とグループ' : `${esc(myGroup())}グループの人`}</h2>
    ${admin ? `<div class="row"><button class="btn primary" id="adUserAdd">＋ 人を追加</button>
      <button class="btn" id="adJoinQr">共通リンクのQRを見せる</button>
      ${window.MEIBO ? '<button class="btn" id="adMeibo">名簿（PDF）から更新</button>' : ''}</div>
      <p class="hint">集まりのときは「共通リンクのQR」を見せると、みんながその場で申し込めます。申し込みは「申請・承認」で承認します。</p>` : ''}
    ${noGroup ? `<div class="notice warn"><b>グループが決まっていない人が ${noGroup}人 います。</b>この人たちには、グループの集まりの予定は届きません（「全体」の予定だけが届きます）。</div>` : ''}
    ${admin ? '<p class="hint">人の行を押すと、グループ・監督・司会者・役割を直せます（直して「保存する」を押したときだけ変わります）。<br>監督と司会者は、グループ奉仕の区域を受け取り、その日回る人をえらべます。集まりの予定を入れられるのは監督だけです。</p>' : ''}
    <div class="uplist">${users.map(u => {
      const who = `<span class="stamp sm" style="font-size:16px">${esc(u.group || '—')}</span>
        <span class="tl-n"><b>${esc(u.name)}${u.role === 'admin' ? '（区域係）' : ''}${u.overseer ? ' <span class="gbadge">監督</span>' : ''}${u.leader ? ' <span class="gbadge">司会者</span>' : ''}</b></span>`;
      // 区域係：1人1行。押すと下から出る画面で直す（改善案A5。押しまちがいでグループや役割が変わらないように）
      return admin ? `<button type="button" class="trow1" data-uedit="${esc(u.id)}">${who}<span class="tl-go" aria-hidden="true">›</span></button>` : `<div class="trow1 prow-ro">${who}</div>`;
    }).join('')}</div>`;
  if (admin) {
    $('#adUserAdd').onclick = openAddUser;
    $('#adJoinQr').onclick = openJoinQr;
    if ($('#adMeibo')) $('#adMeibo').onclick = () => window.MEIBO.open(); // グループ編成のときに、名簿のPDFからまとめて直す（meibo.js）
    $$('[data-uedit]', box).forEach(b => b.onclick = () => openEditUser(b.dataset.uedit));
  }
}
/* 1人の役割・グループを直す（係の画面「人」の行を押したとき・改善案A5）。直して「保存する」を押したときだけ保存する */
function openEditUser(id) {
  const u0 = userById(id); if (!u0 || !isAdmin()) return;
  const groups = groupsAll();
  const roleOf = u => (u.role === 'admin' ? 'admin' : 'pub');
  const f = { role: roleOf(u0), group: u0.group || '', overseer: !!u0.overseer, leader: !!u0.leader };
  const paint = () => {
    const u = userById(id); if (!u) { closeSheet(); return; }
    setSheet(headHtml(null, `${esc(u.name)}さん`, '役割とグループを直します') + `
      <p class="q">役割</p>
      <div class="seg uiseg" role="group" aria-label="役割">
        <button type="button" data-eurole="pub" aria-pressed="${f.role === 'pub'}">伝道者</button>
        <button type="button" data-eurole="admin" aria-pressed="${f.role === 'admin'}">区域係</button></div>
      <label class="field"><span>グループ</span>
        <input type="text" id="euGroup" list="groupList" maxlength="30" value="${esc(f.group)}" placeholder="例：北"></label>
      <datalist id="groupList">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <label class="check"><input type="checkbox" id="euOver"${f.overseer ? ' checked' : ''}>グループ監督</label>
      <label class="check"><input type="checkbox" id="euLead"${f.leader ? ' checked' : ''}>司会者</label>
      <p class="hint">監督と司会者は、グループ奉仕の区域を受け取り、その日回る人をえらべます。集まりの予定を入れられるのは監督だけです。</p>
      <button class="btn primary block" id="euSave">保存する</button>
      <button class="btn block" id="euLink">リンク・QR</button>
      ${u.id === me().id ? '' : '<div class="kops"><details><summary>この人が使うのをやめる</summary><p class="hint">この人のスマホでは、次に開いたときに区域の情報が消えます。</p><button class="btn block danger" id="euOff">使うのをやめる</button></details></div>'}
      <button class="btn block" data-close>やめる</button>`);
    const keep = () => { f.group = $('#euGroup').value; f.overseer = $('#euOver').checked; f.leader = $('#euLead').checked; };
    $$('[data-eurole]', $('#sheet')).forEach(x => x.onclick = () => { keep(); f.role = x.dataset.eurole; sheetKeep = true; paint(); });
    $('#euGroup').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#euSave').click(); } };
    $('#euSave').onclick = async () => {
      keep();
      const u = userById(id); if (!u) { closeSheet(); return; }
      const g = normGroup(f.group), roleCh = roleOf(u) !== f.role;
      if (!roleCh && (u.group || '') === g && !!u.overseer === f.overseer && !!u.leader === f.leader) { closeSheet(); toast('変わったところはありません'); return; }
      if (roleCh && !await ask(`${u.name}さんを「${f.role === 'admin' ? '区域係' : '伝道者'}」にします。よろしいですか？`)) return;
      closeSheet();
      if (roleCh) setUserGroup(u, g, f.overseer, f.leader, f.role); else setUserGroup(u, g, f.overseer, f.leader);
    };
    $('#euLink').onclick = () => { const u = userById(id); if (u) openUserLink(u, false); };
    if ($('#euOff')) $('#euOff').onclick = async () => {
      const u = userById(id); if (!u) return;
      if (!await ask('', { title: `${u.name}さんが区域マップを使うのをやめますか？`,
        body: 'この人のスマホでは、次に開いたときに区域の情報が消えます。\n再訪問のメモ（次の約束・📌）も消え、あとで使えるようにしても元にもどりません（本人がバックアップを保存していれば、もどせます）。\n受け持ちの家のリストと、会えた記録は残ります。',
        ok: '使うのをやめる', cancel: 'このまま使う', danger: true })) return;
      closeSheet();
      setUserGroup(u, u.group || '', !!u.overseer, !!u.leader, u.role, false);
    };
  };
  paint();
}

/* ---- 引き継ぎを待っている家（再訪問の一覧の下に出す） ---- */
function handoffHtml() {
  const items = Object.keys(D().released).filter(k => { const [hid] = parseKey(k); return relOf(k) && houseById(hid) && !D().dnc[k] && !D().follows[k]; });
  if (!items.length) return '';
  return `<h2 class="sec">引き継ぎを待っている家（${items.length}件）</h2><p class="hint">受け持てる方は「私が受け持つ」を押してください。</p>` +
    items.slice(0, 20).map(k => {
      const [hid, unit] = parseKey(k), h = houseById(hid), t = terrById(h.terrId), m = sum(k).met;
      return `<article class="ritem k-handoff"><div>
        <p class="rt"><span class="stamp xs${t ? noCls(t.no) : ''}">${t ? esc(t.no) : '-'}</span> ${targetName(h, unit)}</p>
        ${m ? `<p class="muted">前回 会えた日：${fmtDate(m.at)}</p>` : ''}</div>
        <button class="btn small" data-go="${esc(hid)}" data-unit="${esc(unit)}">地図で見る</button>
        <div class="actions span"><button class="btn small primary" data-fact="take" data-key="${esc(k)}">私が受け持つ</button></div></article>`;
    }).join('');
}

/* =========================================================
   印刷（PDFとしても保存できる）
   ========================================================= */
/* ・印刷用の紙面は、印刷が終わってもそのまま残す（次に印刷するときに入れかえる）。
     印刷のプレビューが作り直されても、同じ紙面が出るように
   ・地図などの画像は、読み終えてから印刷の画面を出す（最大8秒待つ）
   ・続けて押されたときは、いちばん新しい紙面だけを印刷する（印刷の画面が2つ出ないように） */
/* ・iPhone・iPad（Safari・Braveなど）とMacのSafariでは、準備が終わったら「印刷する」ボタンを出し、
     押したその場で印刷の画面を出す。準備（地図の読み込み）のあとに自動で印刷の画面を出すと、
     ブラウザが「勝手に印刷しようとしている」と判断して、止める確認を出すことがあるため */
let printSeq = 0;
const printNeedsTap = () => isIOS() || /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent);
function printDoc(html, landscape, pageCss) {
  const my = ++printSeq;
  const box = $('#printArea');
  box.innerHTML = html;
  let st = $('#printPageStyle');
  if (!st) { st = document.createElement('style'); st.id = 'printPageStyle'; document.head.appendChild(st); }
  st.textContent = pageCss || `@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:${landscape ? '8mm 9mm' : '9mm 10mm 7mm'}}`;
  document.body.classList.add('printing'); // 以前の形との互換のため（印刷の切りかえには使っていない）
  const srcs = [...new Set($$('image, img', box).map(x => x.getAttribute('href') || x.getAttribute('src')).filter(Boolean))];
  const ready = Promise.all(srcs.map(u => { const im = new Image(); im.src = u; return (im.decode ? im.decode() : Promise.resolve()).catch(() => {}); }));
  const loaded = Promise.race([ready, wait(8000)]).then(() => wait(250));
  if (printNeedsTap()) {
    showPrintReady(false);
    loaded.then(() => { if (my === printSeq) showPrintReady(true); });
    return;
  }
  toast('印刷の画面で「PDFとして保存」をえらぶと、PDFにできます');
  loaded.then(() => { if (my === printSeq) window.print(); });
}
/* 「印刷の準備ができました」の画面（この画面は印刷されない） */
function showPrintReady(ok) {
  let el = $('#printReady');
  if (!el) { el = document.createElement('div'); el.id = 'printReady'; document.body.appendChild(el); }
  el.innerHTML = `<div class="blockbox" role="dialog" aria-modal="true" aria-labelledby="prTitle">
      <h2 id="prTitle">${ok ? '印刷の準備ができました' : '印刷の準備をしています…'}</h2>
      <p>${ok ? '「印刷する」を押すと、印刷の画面が出ます。' : '地図の画像を読み込んでいます。少しお待ちください。'}</p>
      <button type="button" class="btn primary block" id="prGo"${ok ? '' : ' disabled'}>印刷する</button>
      <button type="button" class="btn block" id="prNo">やめる</button></div>`;
  el.hidden = false;
  $('#prNo').onclick = () => { printSeq++; el.hidden = true; };
  // 押したその場で呼ぶ（あとで呼ぶと、ブラウザに止められることがある）
  if (ok) $('#prGo').onclick = () => { el.hidden = true; window.print(); };
}

/* =========================================================
   区域割り当ての記録（S-13）
   ・アプリの記録（受け取り・返却）と、紙から転記した記録を、1枚の表で見る
   ・奉仕年度は9月1日〜翌年8月31日（年度の名前は、終わる年）
   ・印刷すると、S-13と同じ形（A4たて・1ページ20区域・1区域に4人分）で出る
   ========================================================= */
const svcYearOf = d => (d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear());
const dstr = v => { if (!v) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const d = new Date(v); return isNaN(d) ? '' : ymd(d); };
const s13Fmt = s => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${y}/${m}/${d}`; };
let s13Y = null;
/* S-13 の名前：グループ奉仕の区域は「グループ奉仕（監督・司会者の名前）」（紙の S-13 と同じ書き方）、全体の集まりの区域は「全体の集まり（司会者の名前）」 */
const s13Who = (uid, g, all) => (g && all ? `全体の集まり（${uname(uid)}）` : g ? `グループ奉仕（${uname(uid)}）` : uname(uid));
/* 「グループ奉仕（名前）」と書いた名前から、その監督・司会者をさがす。null＝その書き方ではない／{ name } だけ＝渡せる人がいない */
const s13Norm = v => String(v || '').replace(/[\s　]/g, '');
function s13GroupOf(name) {
  const m = String(name || '').trim().match(/^(グループ奉仕|Predicaci[oó]n en grupo|全体の集まり|Reuni[oó]n general|Predicaci[oó]n general)\s*[（(]\s*(.+?)\s*[）)]$/i);
  if (!m) return null;
  const all = !/^(グループ奉仕|Predicaci[oó]n en grupo)$/i.test(m[1]); // 全体の集まり
  m.splice(1, 1);
  const key = s13Norm(m[1]);
  const hit = D().users.filter(u => s13Norm(u.name) === key);
  const u = hit.find(x => x.group && (x.overseer || x.leader));
  return { name: m[1], user: u || null, found: hit.length > 0, all };
}
/* 同じ親番号の枝番（自分もふくむ・番号順）。枝番でない区域は自分だけ */
const s13Kin = t => (t.pno ? D().territories.filter(x => !x.dummy && !isSpecial(x) && x.pno === t.pno).sort(byNo) : [t]);
function s13Rows(y) {
  const S = `${y - 1}-09-01`, E = `${y}-09-01`, today = ymd(new Date()), paper = D().s13 || [];
  return D().territories.filter(t => !t.dummy).slice().sort(byNo).map(t => {
    const list = [];
    D().returns.filter(r => r.terrId === t.id && r.lentAt).forEach(r =>
      list.push({ name: s13Who(r.by, r.g, r.ga), a: dstr(r.lentAt), c: r.completed ? dstr(r.at) : '', ret: dstr(r.at), lw: r.lowAuto ? 1 : 0, src: 'app' }));
    if (t.holder && t.lentAt) list.push({ name: s13Who(t.holder, t.group, isAllUse(t)), a: dstr(t.lentAt), c: '', ret: '', cur: true, src: 'app' });
    paper.filter(x => x.kind === 'a' && x.terrId === t.id).forEach(x =>
      list.push({ name: x.name, a: x.a, c: x.c || '', ret: '', src: 'paper', id: x.id, cur: !x.c && paperLent(t) && x.a === t.paperLentAt }));
    // この年度に割り当てた記録と、前の年度から続いていた記録
    const inYear = x => (x.a >= S && x.a < E) || (x.a < S && (x.c || x.ret || (x.cur ? today : '')) >= S);
    const rows = list.filter(inYear).sort((p, q) => (p.a < q.a ? -1 : p.a > q.a ? 1 : 0));
    // 前回完了した日付：手で入れた日付があればそれを、なければ年度が始まる前の最後の完了日
    const man = paper.find(x => x.kind === 'p' && x.terrId === t.id && Number(x.year) === y);
    let prev = man ? man.c : '';
    if (!man) {
      const cands = list.map(x => x.c).filter(c => c && c < S);
      if (t.completedAt && dstr(t.completedAt) < S) cands.push(dstr(t.completedAt));
      prev = cands.sort().pop() || '';
    }
    return { t, rows, prev, prevPaper: !!man };
  });
}
const S13_COLS = '<colgroup><col style="width:6%"><col style="width:10.8%">' + '<col style="width:10.4%">'.repeat(8) + '</colgroup>';
const S13_HEAD = `<thead><tr><th rowspan="2">区域<br>番号</th><th rowspan="2">前回完了した<br>日付*</th>${'<th colspan="2">伝道者の名前</th>'.repeat(4)}</tr>
  <tr>${'<th>割り当てた<br>日付</th><th>完了した<br>日付</th>'.repeat(4)}</tr></thead>`;
/* 1区域ぶん（4人をこえたら、次の行に続ける） */
function s13BlockHtml(r, print) {
  const chunks = [];
  for (let i = 0; i < Math.max(1, r.rows.length); i += 4) chunks.push(r.rows.slice(i, i + 4));
  return chunks.map((ch, ci) => {
    const slots = [0, 1, 2, 3].map(i => ch[i] || null);
    const cls = x => (!x || print ? '' : ` class="s13-${x.src}${x.cur ? ' s13-cur' : ''}"`);
    const cdate = x => {
      if (!x) return '';
      if (x.c) return s13Fmt(x.c);
      if (print) return '';
      return x.cur ? '<small>貸出中</small>' : x.ret ? `<small>返却 ${s13Fmt(x.ret)}${x.lw ? '（記録が少なく途中扱い）' : ''}</small>` : '';
    };
    const prevCls = !print && r.prevPaper && ci === 0 ? ' s13-paper' : '';
    return `<tbody class="s13blk"${print ? '' : ` data-s13t="${esc(r.t.id)}"`}>
      <tr><td rowspan="2" class="no">${esc(r.t.no)}</td><td rowspan="2" class="prev${prevCls}">${ci === 0 ? s13Fmt(r.prev) : (print ? '' : '<small>続き</small>')}</td>
        ${slots.map(x => `<td colspan="2"${cls(x)}>${x ? esc(x.name) : ''}</td>`).join('')}</tr>
      <tr>${slots.map(x => `<td${cls(x)}>${x ? s13Fmt(x.a) : ''}</td><td${cls(x)}>${cdate(x)}</td>`).join('')}</tr></tbody>`;
  }).join('');
}
function openS13(y) {
  if (!isAdmin()) return;
  s13Y = y || s13Y || svcYearOf(new Date());
  const el = $('#s13View'), data = s13Rows(s13Y);
  const nPaper = (D().s13 || []).filter(x => x.kind === 'a').length;
  el.innerHTML = `<div class="s13bar">
      <button class="btn small" id="s13Close">← もどる</button>
      <div class="s13yr"><button class="btn small" data-s13y="-1" aria-label="前の年度">‹</button><b>${s13Y}奉仕年度</b><button class="btn small" data-s13y="1" aria-label="次の年度">›</button></div>
      <button class="btn small primary" id="s13Print">印刷</button></div>
    <div class="s13body"><div class="wrap" style="max-width:none">
      <h2 class="sec" style="margin-top:6px">区域割り当ての記録（S-13）</h2>
      <p class="hint">${s13Y - 1}年9月1日〜${s13Y}年8月31日。アプリの貸し出し・返却の記録と、紙から転記した記録（${nPaper}件）を合わせて表示しています。<br>
        <b>区域の行を押すと</b>、紙の記録を転記したり、前回完了した日付を入れたりできます。</p>
      <p class="s13keys"><span class="k s13-app">アプリの記録</span><span class="k s13-paper">紙から転記</span><span class="k s13-cur">いま貸出中</span></p>
      <div class="scroll"><table class="s13tbl screen">${S13_COLS}${S13_HEAD}${data.map(r => s13BlockHtml(r, false)).join('')}</table></div>
      <p class="hint">*新しいシートを使い始める時には，各区域の前回完了した日付をこの欄に記入してください。</p>
    </div></div>`;
  el.hidden = false;
  $('#s13Close').onclick = () => { el.hidden = true; };
  $('#s13Print').onclick = () => printS13(s13Rows(s13Y), s13Y);
  $$('[data-s13y]', el).forEach(b => b.onclick = () => openS13(s13Y + Number(b.dataset.s13y)));
  $$('[data-s13t]', el).forEach(b => b.onclick = () => openS13Edit(b.dataset.s13t));
}
function printS13(data, y) {
  const blocks = [];
  data.forEach(r => { const n = Math.max(1, Math.ceil(r.rows.length / 4)); blocks.push({ html: s13BlockHtml(r, true), n }); });
  const PER = 20, pages = [];
  let cur = [], used = 0;
  blocks.forEach(b => {
    if (used + b.n > PER && cur.length) { pages.push({ html: cur.join(''), used }); cur = []; used = 0; }
    cur.push(b.html); used += b.n;
  });
  if (cur.length || !pages.length) pages.push({ html: cur.join(''), used });
  const empty = '<tbody><tr><td rowspan="2"></td><td rowspan="2"></td>' + '<td colspan="2"></td>'.repeat(4) + '</tr><tr>' + '<td></td>'.repeat(8) + '</tr></tbody>';
  const html = pages.map((p, i) => `<div class="s13page">
      <h1>区域割り当ての記録</h1>
      <p class="yr">奉仕年度：<u>${y}</u></p>
      <table class="s13tbl print">${S13_COLS}${S13_HEAD}${p.html}${empty.repeat(Math.max(0, PER - p.used))}</table>
      <p class="foot">*新しいシートを使い始める時には，各区域の前回完了した日付をこの欄に記入してください。</p>
      <p class="pg">S-13-J　${i + 1}/${pages.length}　（区域マップで作成　${fmtDay(new Date().toISOString())}）</p></div>`).join('');
  printDoc(html, false);
}
/* 1つの区域の記録：紙から転記する・前回完了した日付を入れる */
function openS13Edit(tid, editId) {
  const y = s13Y, t = terrById(tid); if (!t) return;
  const r = s13Rows(y).find(x => x.t.id === tid);
  const order = D().territories.filter(x => !x.dummy).slice().sort(byNo);
  const pos = order.findIndex(x => x.id === tid);
  const man = (D().s13 || []).find(x => x.kind === 'p' && x.terrId === tid && Number(x.year) === y);
  const ed = editId ? (D().s13 || []).find(x => x.id === editId) : null;
  const gUsers = D().users.filter(u => u.group && (u.overseer || u.leader));
  const names = [...new Set(gUsers.map(u => `グループ奉仕（${u.name}）`).concat(gUsers.map(u => `全体の集まり（${u.name}）`),D().users.map(u => u.name), (D().s13 || []).filter(x => x.name).map(x => x.name)))];
  const kin = s13Kin(t);
  setSheet(headHtml(t, `区域${esc(t.no)}の記録`, `${y}奉仕年度（${y - 1}年9月〜${y}年8月）`) + `
    <h3 class="sub">この年度の割り当て</h3>
    ${r.rows.length ? r.rows.map(x => `<div class="setrow"><span><b>${esc(x.name)}</b>　${s13Fmt(x.a)} 〜 ${x.c ? s13Fmt(x.c) + ' 完了' : x.cur ? '貸出中' : x.ret ? '返却 ' + s13Fmt(x.ret) : '（完了日なし）'}
        <br><small class="hint">${x.src === 'paper' ? '紙から転記' : 'アプリの記録'}</small></span>
        ${x.src === 'paper' ? `<span class="actions" style="margin:0"><button class="btn small" data-s13ed="${esc(x.id)}">直す</button><button class="btn small danger" data-s13del="${esc(x.id)}">消す</button></span>` : ''}</div>`).join('')
      : '<p class="muted">この年度の記録はありません。</p>'}
    <h3 class="sub">${ed ? '紙の記録を直す' : '紙の記録を転記する'}</h3>
    <label class="field"><span>伝道者の名前</span><input type="text" id="s13Name" list="s13Names" maxlength="30" value="${esc(ed ? ed.name : '')}" placeholder="例：山田 花子"></label>
    <datalist id="s13Names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <p class="hint" id="s13Gp" aria-live="polite"></p>
    <label class="field"><span>割り当てた日付</span><input type="date" id="s13A" value="${esc(ed ? ed.a : '')}"></label>
    <label class="field"><span>完了した日付（まだ回り終えていなければ空）</span><input type="date" id="s13C" value="${esc(ed ? ed.c : '')}"></label>
    ${kin.length > 1 ? `<label class="chk"><input type="checkbox" id="s13All" checked> 区域${esc(t.pno)}の枝番すべて（${kin.map(x => esc(x.no)).join('・')}）に入れる</label>` : ''}
    <button class="btn primary block" id="s13Add">${ed ? 'この内容に直す' : 'この記録を入れる'}</button>
    ${ed ? '<button class="btn block" id="s13EdCancel">直すのをやめる</button>' : ''}
    <h3 class="sub">前回完了した日付</h3>
    <p class="hint">この年度が始まる前に、最後に回り終えた日です。入れないときは、記録から自動で出します（今：${s13Fmt(r.prev) || 'なし'}${man ? '・手で入れた日付' : ''}）。</p>
    <div class="inline"><input type="date" id="s13P" value="${esc(man ? man.c : '')}" aria-label="前回完了した日付" style="flex:1"><button class="btn small" id="s13PSave">保存</button></div>
    ${man ? '<button class="btn small" id="s13PClr" style="margin-top:8px">自動にもどす</button>' : ''}
    <div class="seqnav"><button class="btn" id="s13Prev"${pos <= 0 ? ' disabled' : ''}>← 前の区域</button><button class="btn" id="s13Next"${pos >= order.length - 1 ? ' disabled' : ''}>次の区域 →</button></div>
    <button class="btn block" id="s13Done">表にもどる</button>`);
  const again = () => { openS13(y); openS13Edit(tid); };
  // 「グループ奉仕（名前）」「全体の集まり（名前）」と入れたら、その人に渡すことを、入れる前に知らせる
  const gpHint = () => {
    const g = $('#s13C').value ? null : s13GroupOf($('#s13Name').value);
    $('#s13Gp').innerHTML = !g ? '集まりで回る区域は「グループ奉仕（監督か司会者の名前）」か「全体の集まり（司会者の名前）」と入れると、完了した日付が空のとき、その人のアプリに「集まりで使う区域」として届きます。'
      : g.user ? `<b>→ ${esc(g.user.name)}さん（${esc(g.user.group)}グループ）のアプリに、${g.all ? '「全体の集まりの区域」' : '「グループ奉仕の区域」'}として渡します。</b>返却はアプリでしてもらい、返却するとこの表の完了した日付も入ります。`
      : `<span class="tag-warn">「${esc(g.name)}」さんは、グループ監督・司会者としてアプリに登録されていません。紙の記録として入ります。</span>`;
  };
  $('#s13Name').oninput = gpHint; $('#s13C').oninput = gpHint; gpHint();
  $('#s13Add').onclick = async () => {
    const name = $('#s13Name').value.trim(), a = $('#s13A').value, c = $('#s13C').value;
    if (!name) { toast('伝道者の名前を入れてください'); return; }
    if (!a) { toast('割り当てた日付を入れてください'); return; }
    if (c && c < a) { toast('完了した日付が、割り当てた日付より前になっています'); return; }
    const targets = kin.length > 1 && ($('#s13All') || {}).checked ? kin : [t];
    const oldName = ed ? s13Norm(ed.name) : '', oldA = ed ? ed.a : '';
    // この区域で置きかえる紙の記録（直している記録・同じ名前と日付の記録）
    const same = (x, z) => z.kind === 'a' && z.terrId === x.id && ((ed && z.id === ed.id) || (oldName && s13Norm(z.name) === oldName && z.a === oldA));
    const g = c ? null : s13GroupOf(name);
    if (g && g.user) {
      if (a > ymd(new Date())) { toast('割り当てた日付が、今日より後になっています'); return; }
      const u = g.user, ok = [], skip = [];
      targets.forEach(x => {
        if (x.holder) { skip.push(`区域${x.no}（アプリで${uname(x.holder)}さんが持っています）`); return; }
        const last = (D().s13 || []).filter(z => z.kind === 'a' && z.terrId === x.id).sort((p, q) => (p.a < q.a ? -1 : 1)).pop();
        if (last && !last.c && !same(x, last) && s13Norm(last.name) !== s13Norm(name)) { skip.push(`区域${x.no}（紙の記録で${last.name}さんが持っています）`); return; }
        ok.push(x);
      });
      if (!ok.length) { toast('渡せる区域がありません。' + skip.join('、')); return; }
      if (!await ask(`区域${ok.map(x => x.no).join('・')}を、${u.name}さん（${u.group}グループ）の${g.all ? '「全体の集まりの区域」' : '「グループ奉仕の区域」'}として、アプリに渡します。\n\n・${u.name}さんのアプリの区域カードに出ます\n・返却はアプリでしてもらいます。返却すると、この表の完了した日付も入ります` +
        (skip.length ? `\n\nほかの人が持っているので、次の区域は渡しません：\n${skip.join('\n')}` : ''), { ok: '渡す', danger: false })) return;
      const [yy, mm, dd] = a.split('-').map(Number), lent = new Date(yy, mm - 1, dd, 12).toISOString();
      commit(`区域${ok.map(x => x.no).join('・')}を、${u.name}さんの${g.all ? '全体の集まり' : 'グループ奉仕'}の区域にしました`, () => {
        const ids = new Set(ok.map(x => x.id));
        // 紙の記録は、アプリの記録（受け取った日・返却）に置きかわる（同じ行が2つ出ないように）
        D().s13 = (D().s13 || []).filter(z => !(ids.has(z.terrId) && z.kind === 'a' && !z.c && (same(terrById(z.terrId), z) || s13Norm(z.name) === s13Norm(name))));
        ok.forEach(x => {
          x.holder = u.id; x.lentAt = lent; x.group = u.group; x.paperHand = a;
          if (g.all) x.use = 'all'; else delete x.use;
          x.helpers = []; x.firstDoneAt = null; x.firstDonePct = null; delete x.firstLow; delete x.recLess; x.awayPoolAt = null; x.poolRetId = null;
          delete x.paperLentAt; delete x.selfTakenAt;
        });
      });
      again();
      return;
    }
    if (g && !g.user && !await ask(`「${g.name}」さんは、グループ監督・司会者としてアプリに登録されていないので、紙の記録として入れます。\n登録したあとで、この記録を「直す」から保存し直すと、アプリに渡せます。`, { ok: '紙の記録として入れる', danger: false })) return;
    commit(ed ? '記録を直しました' : `区域${targets.map(x => x.no).join('・')}に${name}さんの記録を入れました`, () => {
      const at = new Date().toISOString();
      targets.forEach(x => {
        if (ed) (D().s13 || []).filter(z => same(x, z)).forEach(z => Object.assign(z, { name, a, c, at }));
        else D().s13.push({ id: 's' + uid(), kind: 'a', terrId: x.id, name, a, c, at, by: me().id });
      });
    });
    again();
  };
  if ($('#s13EdCancel')) $('#s13EdCancel').onclick = () => openS13Edit(tid);
  $$('[data-s13ed]', $('#sheet')).forEach(b => b.onclick = () => openS13Edit(tid, b.dataset.s13ed));
  $$('[data-s13del]', $('#sheet')).forEach(b => b.onclick = async () => {
    const x = D().s13.find(z => z.id === b.dataset.s13del); if (!x) return;
    if (!await ask(`${x.name}さん（${s13Fmt(x.a)}）の記録を消します。よろしいですか？`)) return;
    commit('記録を消しました', () => { D().s13 = D().s13.filter(z => z.id !== x.id); });
    again();
  });
  $('#s13PSave').onclick = () => {
    const c = $('#s13P').value;
    if (!c) { toast('日付を入れてください'); return; }
    commit('前回完了した日付を保存しました', () => {
      if (man) Object.assign(man, { c, at: new Date().toISOString() });
      else D().s13.push({ id: 's' + uid(), kind: 'p', terrId: tid, year: y, c, at: new Date().toISOString(), by: me().id });
    });
    again();
  };
  if ($('#s13PClr')) $('#s13PClr').onclick = () => {
    commit('前回完了した日付を、記録から自動で出すようにしました', () => { D().s13 = D().s13.filter(z => z !== man); });
    again();
  };
  $('#s13Prev').onclick = () => { if (pos > 0) openS13Edit(order[pos - 1].id); };
  $('#s13Next').onclick = () => { if (pos < order.length - 1) openS13Edit(order[pos + 1].id); };
  $('#s13Done').onclick = () => { closeSheet(); openS13(y); };
}

/* =========================================================
   区域地図のカード（S-12）の印刷 … 紙で運用するときの予備
   ・大きさは S-12 と同じ A6（A4に4枚）か、地図を大きくした A5（A4に2枚）
   ・表：区域の線・家・拒否の家と、まわりの建物（国土地理院の淡色地図）。留守などの記録は出さない
   ・裏：集合住宅の部屋（拒否の部屋は黒）。両面印刷で表と裏が重なる並びにする
   ・地図の画像は、すべて受け取ってから印刷する（印刷で地図が欠けないように）
   ・地図の隅に、区域までの道順を開くGoogleマップのQRを入れる（家・区域の線にかからない隅を自動で選ぶ。
     中身は区域の中の1点の緯度・経度だけで、家や人の情報は入れない。QRは端末の中で作るので、通信はいらない）
   ========================================================= */
const S12_TILE = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const S12_SIZE = {
  a6: { label: 'A6（S-12と同じ・A4に4枚）', page: 'A4 landscape', per: 4, mapW: 137, mapH: 72, kMin: 3.2, backCols: 2, font: 7.5, order: [1, 0, 3, 2], bind: '短辺とじ（短い辺で綴じる）' },
  a5: { label: 'A5（A4に2枚・地図が大きい）', page: 'A4 portrait', per: 2, mapW: 196, mapH: 108, kMin: 2.6, backCols: 3, font: 9, order: [0, 1], bind: '長辺とじ（長い辺で綴じる）' }
};
const S12_KCH = { office: '社', shop: '店', biz: '事', factory: '工', school: '学', gov: '役', police: '警', fire: '消' };
const S12_TILES = new Map(); // 地図の画像（一度受け取ったものは、この画面を開いているあいだ使い回す）
let s12Opt = { size: 'a6', back: true, sel: null };
const S12_MOBILE_MAX = 8;   // スマホで一度に印刷する区域の数
const s12Done = new Set();  // スマホで、分けて印刷し終えた組（この画面を開いているあいだ）

/* 緯度・経度 → 地図の画素（ズーム z のときの、世界全体での位置） */
function s12Px(lat, lng, z) {
  const n = 256 * Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
  return [(lng + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
/* 地図の範囲：区域がちょうど入り、まわりの建物の名前が読める大きさになるズームを選ぶ
   k … 印刷したときの 1mm あたりの画素（おおよそ3〜6 のあいだにすると、地図の文字が読みやすい） */
function s12View(pts, W, H, kMin) {
  for (let z = 18; z >= 11; z--) {
    const xy = pts.map(p => s12Px(p[0], p[1], z));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    xy.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const k0 = Math.max(((x1 - x0) * 1.12 + 24) / W, ((y1 - y0) * 1.12 + 24) / H);
    if (k0 <= 6 || z === 11) {
      const k = Math.max(k0, kMin || 3.2); // 小さい区域は、まわりを広めに見せる
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return { z, k, x: cx - W * k / 2, y: cy - H * k / 2, w: W * k, h: H * k };
    }
  }
  return null;
}
function s12Tiles(v) {
  const out = [];
  for (let tx = Math.floor(v.x / 256); tx <= Math.floor((v.x + v.w) / 256); tx++) {
    for (let ty = Math.floor(v.y / 256); ty <= Math.floor((v.y + v.h) / 256); ty++) {
      out.push({ url: S12_TILE.replace('{z}', v.z).replace('{x}', tx).replace('{y}', ty), x: tx * 256 - v.x, y: ty * 256 - v.y });
    }
  }
  return out;
}
/* 地図の画像を受け取る。受け取れたら端末の中の画像に、海などで画像がないときは ''、失敗したら元のURL */
function s12Tile(url) {
  if (S12_TILES.has(url)) return S12_TILES.get(url);
  const p = (async () => {
    for (let i = 0; i < 2; i++) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tm = setTimeout(() => { if (ctl) ctl.abort(); }, 15000);
      try {
        const r = await fetch(url, { mode: 'cors', signal: ctl ? ctl.signal : undefined });
        if (r.status === 404) return '';
        if (r.ok) return URL.createObjectURL(await r.blob());
      } catch (e) { /* もう一度ためす */ } finally { clearTimeout(tm); }
      await wait(800);
    }
    S12_TILES.delete(url); // 次に印刷するときに、もう一度受け取る
    return url;
  })();
  S12_TILES.set(url, p);
  return p;
}
/* 1区域ぶんの材料 */
function s12Prep(t, S, byT) {
  // 特別区域は、その条件に合う家。ふつうの区域は、特別区域で回る家（全部の部屋が特別区域）を地図に出さない（2回訪ねないように）
  let hs = isSpecial(t) ? housesOf(t.id) : (byT.get(t.id) || []), spOut = 0;
  if (!isSpecial(t)) hs = hs.filter(h => { const all = targets(h).length && targets(h).every(u => coveredBySpecial(h, u)); if (all) spOut++; return !all; });
  const poly = okPoly(t.polygon) ? t.polygon : null;
  const pts = poly || hs.map(h => [h.lat, h.lng]);
  const v = pts.length ? s12View(pts, S.mapW, S.mapH, S.kMin) : null;
  const apts = hs.filter(h => h.type === 'apt').sort((a, b) => b.lat - a.lat || a.lng - b.lng); // 北から順に番号
  const latC = pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : 26;
  return { t, hs, poly, v, apts, latC, spOut, tiles: v ? s12Tiles(v) : [], nav: s12NavUrl(t, poly, hs), qrMm: S.mapW > 150 ? 17 : 14 };
}
/* QRで開く道順：区域の線があれば、区域の中で線からいちばん遠い点（区域の札と同じ点。L字の区域でも外に出ない）。
   線のないふつうの区域は、家の平均にいちばん近い家。家が散らばる特別区域（線なし）は、1つの行き先に決められないので出さない */
function s12NavUrl(t, poly, hs) {
  let p = null;
  if (poly) p = labelPoint(poly);
  else if (!isSpecial(t) && hs.length) {
    const la = hs.reduce((s, h) => s + h.lat, 0) / hs.length, ln = hs.reduce((s, h) => s + h.lng, 0) / hs.length;
    const h = hs.reduce((b, x) => (Math.hypot(x.lat - la, x.lng - ln) < Math.hypot(b.lat - la, b.lng - ln) ? x : b));
    p = [h.lat, h.lng];
  }
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}
/* 道順のQR（地図の隅）。四隅のうち、家の印・区域の中・方位や縮尺にかからない隅を選ぶ */
function s12QrSvg(c, P, mm, f) {
  if (!c.nav) return '';
  let g;
  try { g = QR.matrix(c.nav); } catch (e) { return ''; }
  const n = g.length, qz = 2;                 // 白い余白は2マス分（白い札の上に置くので、これで読める）
  const side = c.qrMm, cap = side * 0.13;     // QRの一辺（mm）と、下の説明の高さ
  const bw = mm(side + 1), bh = mm(side + 1 + cap), W = c.v.w, H = c.v.h, gap = mm(1.5);
  const cand = [
    [gap, gap],                                   // 左上
    [W - bw - gap, H - bh - mm(4)],               // 右下（出典の上）
    [gap, H - bh - mm(6.5)],                      // 左下（縮尺の上）
    [W - bw - gap, mm(10)]                        // 右上（方位の下）
  ];
  const poly = c.poly ? c.poly.map(p => P(p[0], p[1])) : null;
  const inside = (x, y) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) r = !r;
    }
    return r;
  };
  const hp = c.hs.map(h => P(h.lat, h.lng));
  let best = null;
  cand.forEach(([x, y], i) => {
    const m = mm(1.5);
    let sc = hp.filter(([a, b]) => a > x - m && a < x + bw + m && b > y - m && b < y + bh + m).length * 4;
    if (poly) for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) if (inside(x + bw * a / 4, y + bh * b / 4)) sc++;
    sc += i * 0.01;                                // 同じなら、上の順（左上から）
    if (!best || sc < best.sc) best = { sc, x, y };
  });
  const x0 = best.x, y0 = best.y, u = mm(side) / (n + qz * 2), ox = x0 + mm(0.5) + u * qz, oy = y0 + mm(0.5) + u * qz;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let cc = 0; cc < n; cc++) {
      if (!g[r][cc]) continue;
      let e = cc; while (e + 1 < n && g[r][e + 1]) e++; // 横に続く黒いマスは1本にまとめる
      d += `M${f(ox + cc * u)},${f(oy + r * u)}h${f((e - cc + 1) * u + 0.05)}v${f(u + 0.05)}h${f(-(e - cc + 1) * u - 0.05)}z`;
      cc = e;
    }
  }
  return `<g class="s12qr"><rect x="${f(x0)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" rx="${mm(0.8)}" fill="#fff" stroke="#222" stroke-width="${mm(0.2)}"/>` +
    `<path d="${d}" fill="#000" shape-rendering="crispEdges"/>` +
    `<text x="${f(x0 + bw / 2)}" y="${f(y0 + mm(side + 0.6) + mm(cap) / 2)}" font-size="${mm(cap * 0.78)}" font-weight="700" fill="#000" text-anchor="middle" dominant-baseline="central" textLength="${f(bw - mm(1.2))}" lengthAdjust="spacingAndGlyphs">Googleマップで道順</text></g>`;
}
const s12Dnc = () => D().dnc || {};
/* 名前のある建物（「名前を出す範囲」が「地図に見えている全体」のとき、ほかの区域の建物の名前も出すため） */
let s12LabeledMemo = null;
function s12Labeled() {
  const hs = D().houses;
  if (!s12LabeledMemo || s12LabeledMemo.src !== hs || s12LabeledMemo.len !== hs.length) s12LabeledMemo = { src: hs, len: hs.length, list: hs.filter(h => h.label) };
  return s12LabeledMemo.list;
}
function s12RefCount(c) {
  const dnc = s12Dnc();
  return c.hs.reduce((n, h) => n + (h.type === 'apt' ? h.units.filter(u => dnc[K(h.id, u)]).length : (dnc[K(h.id, '')] ? 1 : 0)), 0) +
    dncPins().filter(([, d]) => dncTerrOf(d) === c.t.id).length;
}
/* 凡例の小さな印 */
const S12_ICO = {
  house: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="#fff" stroke="#222" stroke-width="1"/></svg>',
  kind: '<svg viewBox="0 0 10 10"><rect x="1.8" y="1.8" width="6.4" height="6.4" fill="#fff" stroke="#222" stroke-width="1"/></svg>',
  apt: '<svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.5" fill="#263238"/><text x="5" y="5.3" font-size="7" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">1</text></svg>',
  ref: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.4" fill="#D32F2F"/><path d="M3.2 3.2l3.6 3.6M6.8 3.2l-3.6 3.6" stroke="#fff" stroke-width="1.3"/></svg>',
  line: '<svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="#C62828" stroke-width="2.4"/></svg>'
};
/* 表の地図（すべて SVG で描くので、線や印は印刷してもくっきり出る） */
function s12MapSvg(c, tileUrl) {
  const { v, t, poly } = c;
  if (!v) return '<div class="s12none">区域の線も家も、まだ登録されていません</div>';
  const k = v.k, f = n => Math.round(n * 10) / 10, mm = n => f(n * k);
  const P = (lat, lng) => { const p = s12Px(lat, lng, v.z); return [p[0] - v.x, p[1] - v.y]; };
  const pts = arr => arr.map(p => P(p[0], p[1]).map(f).join(',')).join(' ');
  const halo = `stroke="#fff" stroke-width="${mm(0.7)}" paint-order="stroke" stroke-linejoin="round"`;
  let s = `<svg class="s12svg" viewBox="0 0 ${f(v.w)} ${f(v.h)}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">`;
  s += c.tiles.map(ti => { const u = tileUrl(ti.url); return u ? `<image href="${esc(u)}" x="${f(ti.x)}" y="${f(ti.y)}" width="256.8" height="256.8" preserveAspectRatio="none"/>` : ''; }).join('');
  // 区域の外を少し白くして、区域を目立たせる（まわりの建物は見えるまま）
  if (poly) s += `<path d="M-20,-20 H${f(v.w + 20)} V${f(v.h + 20)} H-20 Z M${pts(poly).replace(/ /g, ' L')} Z" fill="#fff" fill-opacity=".42" fill-rule="evenodd"/>`;
  // となりの区域の線と番号（うすい点線）
  polyTerrs().forEach(o => {
    if (o.id === t.id) return;
    const q = o.polygon.map(p => P(p[0], p[1]));
    let a = Infinity, b = -Infinity, cc = Infinity, d = -Infinity;
    q.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); cc = Math.min(cc, p[1]); d = Math.max(d, p[1]); });
    if (b < 0 || a > v.w || d < 0 || cc > v.h) return;
    s += `<polygon points="${q.map(p => p.map(f).join(',')).join(' ')}" fill="none" stroke="#666" stroke-width="${mm(0.3)}" stroke-dasharray="${mm(1.2)} ${mm(0.8)}"/>`;
    const m = P(...center(o.polygon));
    if (m[0] > mm(4) && m[0] < v.w - mm(4) && m[1] > mm(3) && m[1] < v.h - mm(3)) {
      s += `<text x="${f(m[0])}" y="${f(m[1])}" font-size="${mm(2.6)}" font-weight="700" fill="#555" text-anchor="middle" dominant-baseline="central" ${halo}>${esc(o.no)}</text>`;
    }
  });
  // この区域の線（白いふちの上に赤い線。白黒で印刷しても濃い線になる）
  if (poly) {
    s += `<polygon points="${pts(poly)}" fill="none" stroke="#fff" stroke-width="${mm(1.5)}" stroke-linejoin="round"/>`;
    s += `<polygon points="${pts(poly)}" fill="none" stroke="#C62828" stroke-width="${mm(0.7)}" stroke-linejoin="round"/>`;
  }
  // 家：ふつうの家 → 住居以外 → 集合住宅 → 拒否 の順に重ねる（拒否がいちばん上）
  const dnc = s12Dnc(), inView = (x, y) => x > -mm(3) && y > -mm(3) && x < v.w + mm(3) && y < v.h + mm(3);
  const aptNo = new Map(c.apts.map((h, i) => [h.id, i + 1]));
  const L1 = [], L2 = [], L3 = [], L4 = [];
  c.hs.forEach(h => {
    const [x, y] = P(h.lat, h.lng).map(f);
    if (!inView(x, y)) return;
    if (h.type === 'apt') {
      const n = aptNo.get(h.id), w = mm(String(n).length > 1 ? 4.6 : 3.6), hh = mm(3.6);
      const anyRef = h.units.some(u => dnc[K(h.id, u)]) || dnc[K(h.id, '')];
      L3.push(`<rect x="${f(x - w / 2)}" y="${f(y - hh / 2)}" width="${w}" height="${hh}" rx="${mm(0.6)}" fill="#263238" stroke="#fff" stroke-width="${mm(0.3)}"/>` +
        `<text x="${x}" y="${f(y + mm(0.1))}" font-size="${mm(2.6)}" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${n}</text>` +
        (anyRef ? `<circle cx="${f(x + w / 2)}" cy="${f(y - hh / 2)}" r="${mm(0.8)}" fill="#D32F2F" stroke="#fff" stroke-width="${mm(0.25)}"/>` : ''));
    } else if (dnc[K(h.id, '')]) {
      const r = mm(1.25), a = mm(0.55);
      L4.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#D32F2F" stroke="#fff" stroke-width="${mm(0.3)}"/>` +
        `<path d="M${f(x - a)},${f(y - a)} L${f(x + a)},${f(y + a)} M${f(x + a)},${f(y - a)} L${f(x - a)},${f(y + a)}" stroke="#fff" stroke-width="${mm(0.35)}"/>`);
    } else if (kindOf(h) !== 'home') {
      const w = mm(2.1);
      L2.push(`<rect x="${f(x - w / 2)}" y="${f(y - w / 2)}" width="${w}" height="${w}" fill="#fff" stroke="#222" stroke-width="${mm(0.22)}"/>` +
        `<text x="${x}" y="${f(y + mm(0.05))}" font-size="${mm(1.6)}" fill="#222" text-anchor="middle" dominant-baseline="central">${S12_KCH[kindOf(h)] || ''}</text>`);
    } else {
      L1.push(`<circle cx="${x}" cy="${y}" r="${mm(0.8)}" fill="#fff" stroke="${h.prov ? '#888' : '#222'}" stroke-width="${mm(0.22)}"/>`);
    }
  });
  s += L1.join('') + L2.join('') + L3.join('');
  // 建物の名前：その人の設定（設定 → 地図の「マンション・アパートの名前」「学校・役所・お店などの名前」「名前を出す範囲」）と同じにする
  const showApt = UI.aptName === 'on', showFc = UI.fcName === 'on';
  if (showApt || showFc) {
    const list = UI.nameScope === 'all' ? s12Labeled() : c.hs;
    let n = 0;
    for (const h of list) {
      if (!h.label || n >= 150) continue;
      const k = h.type === 'apt' ? aptKind(h) : kindOf(h), isFc = k !== 'home';
      if (h.type === 'apt' ? !(showApt || (showFc && isFc)) : !(showFc && isFc)) continue; // 一戸建ての「目印」は出さない（地図と同じ）
      const [x, y] = P(h.lat, h.lng).map(f);
      if (!inView(x, y)) continue;
      n++;
      const name = h.label.length > 12 ? h.label.slice(0, 11) + '…' : h.label;
      s += `<text x="${x}" y="${f(y + mm(h.type === 'apt' ? 2.2 : 1.5))}" font-size="${mm(1.9)}" font-weight="700" fill="${isFc ? '#4A148C' : '#263238'}" text-anchor="middle" dominant-baseline="hanging" ${halo}>${esc(name)}</text>`;
    }
  }
  // 場所だけの拒否（家の印とまだつながっていない拒否）も、同じ赤い印で出す
  dncPins().forEach(([, d]) => {
    if (dncTerrOf(d) !== t.id) return;
    const [x, y] = P(d.lat, d.lng).map(f);
    if (!inView(x, y)) return;
    const r = mm(1.25), a = mm(0.55);
    L4.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#D32F2F" stroke="#fff" stroke-width="${mm(0.3)}"/>` +
      `<path d="M${f(x - a)},${f(y - a)} L${f(x + a)},${f(y + a)} M${f(x + a)},${f(y - a)} L${f(x - a)},${f(y + a)}" stroke="#fff" stroke-width="${mm(0.35)}"/>`);
  });
  s += L4.join('');
  // 方位（北）
  const nx = v.w - mm(5), ny = mm(5.5);
  s += `<g><circle cx="${nx}" cy="${ny}" r="${mm(3.6)}" fill="#fff" fill-opacity=".85"/>` +
    `<path d="M${nx},${f(ny - mm(3))} L${f(nx + mm(1.5))},${f(ny + mm(1.2))} L${nx},${f(ny + mm(0.4))} L${f(nx - mm(1.5))},${f(ny + mm(1.2))} Z" fill="#222"/>` +
    `<text x="${nx}" y="${f(ny + mm(2.6))}" font-size="${mm(1.9)}" font-weight="700" fill="#222" text-anchor="middle" dominant-baseline="central">N</text></g>`;
  // 縮尺（15mm 前後になる、きりのよい長さ）
  const mPerMm = 156543.03392 * Math.cos(c.latC * Math.PI / 180) / Math.pow(2, v.z) * k;
  const meters = [20, 50, 100, 200, 250, 500, 1000, 2000].find(x => x / mPerMm >= 12) || 2000;
  const len = meters / mPerMm * k, bx = mm(2.5), by = v.h - mm(2.5);
  s += `<g><rect x="${f(bx - mm(1))}" y="${f(by - mm(4))}" width="${f(len + mm(9))}" height="${mm(5)}" fill="#fff" fill-opacity=".85"/>` +
    `<path d="M${bx},${f(by - mm(1.4))} V${by} H${f(bx + len)} V${f(by - mm(1.4))}" fill="none" stroke="#222" stroke-width="${mm(0.35)}"/>` +
    `<text x="${f(bx + len + mm(1))}" y="${f(by - mm(0.6))}" font-size="${mm(2)}" fill="#222">${meters >= 1000 ? meters / 1000 + 'km' : meters + 'm'}</text></g>`;
  // 出典
  s += `<text x="${f(v.w - mm(1.5))}" y="${f(v.h - mm(1.3))}" font-size="${mm(1.7)}" fill="#333" text-anchor="end" ${halo}>出典：国土地理院（淡色地図）</text>`;
  // 区域までの道順のQR（いちばん上に重ねる）
  s += s12QrSvg(c, P, mm, f);
  return s + '</svg>';
}
function s12FrontHtml(c, tileUrl, stamp) {
  const t = c.t, nH = c.hs.filter(h => h.type !== 'apt').length;
  return `<div class="s12card">
    <p class="s12ttl">区域地図のカード</p>
    <div class="s12row"><span>場所</span><span class="ln">${esc(t.name || '')}</span><span>区域番号</span><span class="ln no">${esc(t.no)}</span></div>
    <div class="s12map">${s12MapSvg(c, tileUrl)}</div>
    <div class="s12ft"><span class="lg">${S12_ICO.line}区域の線 ${S12_ICO.house}家 ${S12_ICO.kind}住居以外 ${S12_ICO.apt}集合住宅（番号は裏面） ${S12_ICO.ref}拒否（訪問しない）</span>
      <span class="dt">家${nH}・集合住宅${c.apts.length}・拒否${s12RefCount(c)}${c.spOut ? `・特別区域で回る${c.spOut}（地図に出さない）` : ''}／${stamp}時点</span></div>
    <p class="s12note">封筒に入れて持ち歩き、汚さないようにしてください。回り終えたら区域係に知らせてください。</p>
  </div>`;
}
function s12BackHtml(c, S, fs) {
  const t = c.t, dnc = s12Dnc();
  const room = (h, u) => {
    const uk = unitKind(h, u);
    return `<span class="rm${dnc[K(h.id, u)] ? ' x' : ''}">${esc(uName(h, u))}${uk !== 'home' ? `<small>${S12_KCH[uk] || ''}</small>` : ''}</span>`;
  };
  const body = !c.apts.length ? '<p class="s12empty">この区域には、集合住宅の登録はありません。</p>' : c.apts.map((h, i) => {
    const groups = unitGroups(h);
    const rows = !h.units.length ? '<p class="nr">部屋の登録がありません</p>'
      : groups.length > 1 ? groups.map(([g, us]) => `<div class="fl"><span class="fn">${esc(g || 'そのほか')}</span><span class="rs">${us.map(u => room(h, u)).join('')}</span></div>`).join('')
      : `<div class="fl one"><span class="rs">${h.units.map(u => room(h, u)).join('')}</span></div>`;
    const info = [kindOf(h) !== 'home' ? kindName(kindOf(h)) : '', h.lock ? 'オートロック' : '', h.ac === 'ev' ? 'エレベーターあり' : h.ac === 'no' || h.ac === 'st' ? 'エレベーターなし' : '', `${h.units.length}部屋`].filter(Boolean).join('・');
    return `<div class="ab"><p class="an"><i>${i + 1}</i>${esc(h.label || '集合住宅')}<small>${info}</small>${dnc[K(h.id, '')] ? '<b class="rm x">建物ごと拒否</b>' : ''}</p>${rows}</div>`;
  }).join('');
  return `<div class="s12card back">
    <p class="s12bh"><b>区域番号 ${esc(t.no)}</b>${t.name ? `<span class="nm">${esc(t.name)}</span>` : ''}<span class="r">集合住宅（番号は表の地図）</span></p>
    <div class="s12apts" data-s12fit="${esc(t.id)}" style="column-count:${S.backCols};font-size:${fs}pt">${body}</div>
    ${c.apts.length ? `<p class="s12ft"><span class="lg">例：<span class="rm x">101</span> 拒否の部屋（訪問しない）${c.apts.some(h => h.units.some(u => unitKind(h, u) !== 'home')) ? '　社・店など：住居以外の部屋' : ''}</span></p>` : ''}
  </div>`;
}
/* 裏面の文字の大きさ：部屋が多い区域は、入りきるまで小さくする */
function s12FitBacks(cards, S, sz) {
  const box = document.createElement('div');
  box.className = 'pdoc s12measure ' + sz;
  box.innerHTML = cards.map(c => s12BackHtml(c, S, S.font)).join('');
  document.body.appendChild(box);
  const res = new Map(), over = [];
  $$('[data-s12fit]', box).forEach(el => {
    let fs = S.font;
    const full = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    while (full() && fs > 5) { fs = Math.round((fs - 0.5) * 10) / 10; el.style.fontSize = fs + 'pt'; }
    if (full()) over.push(el.dataset.s12fit);
    res.set(el.dataset.s12fit, fs);
  });
  box.remove();
  return { size: res, over };
}
function s12SheetsHtml(fronts, backs, S, sz) {
  const blank = '<div class="s12card blank"></div>';
  const marks = '<i class="cm v t"></i><i class="cm v b"></i><i class="cm h l"></i><i class="cm h r"></i>';
  let out = '';
  for (let i = 0; i < fronts.length; i += S.per) {
    out += `<div class="s12sheet ${sz}">${Array.from({ length: S.per }, (_, j) => fronts[i + j] || blank).join('')}${marks}</div>`;
    if (backs) out += `<div class="s12sheet ${sz}">${S.order.map(j => backs[i + j] || blank).join('')}${marks}</div>`;
  }
  return out;
}
let s12Busy = false;
async function printS12(ids, sz, back) {
  if (s12Busy) return;
  s12Busy = true;
  try { await printS12Run(ids, sz, back); } finally { s12Busy = false; }
}
async function printS12Run(ids, sz, back) {
  const S = S12_SIZE[sz];
  const byT = new Map();
  D().houses.forEach(h => { if (!h.terrId) return; let a = byT.get(h.terrId); if (!a) byT.set(h.terrId, a = []); a.push(h); });
  const cards = ids.map(terrById).filter(Boolean).sort(byNo).map(t => s12Prep(t, S, byT));
  if (!cards.length) return;
  const urls = [...new Set(cards.flatMap(c => c.tiles.map(x => x.url)))];
  closeSheet();
  const got = new Map();
  let done = 0, bad = 0, next = 0;
  const show = () => showBlocking('区域カードを準備しています…', `地図の画像を受け取っています（${done} / ${urls.length}）`, true);
  show();
  try {
    const worker = async () => {
      while (next < urls.length) {
        const u = urls[next++], r = await s12Tile(u);
        got.set(u, r); if (r === u) bad++;
        done++; if (done % 4 === 0 || done === urls.length) show();
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  } finally { hideBlocking(); }
  const now = new Date(), stamp = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
  const tileUrl = u => got.get(u);
  const fronts = cards.map(c => s12FrontHtml(c, tileUrl, stamp));
  let backs = null, over = [];
  if (back) {
    const fit = s12FitBacks(cards, S, sz);
    backs = cards.map(c => s12BackHtml(c, S, fit.size.get(c.t.id) || S.font));
    over = fit.over.map(id => (terrById(id) || {}).no).filter(Boolean);
  }
  printDoc(`<div class="s12doc">${s12SheetsHtml(fronts, backs, S, sz)}</div>`, false, `@page{size:${S.page};margin:0}`);
  const warn = [];
  if (bad) warn.push(`地図の画像${bad}枚を受け取れませんでした。地図が欠けていたら、もう一度印刷してください`);
  if (over.length) warn.push(`区域${over.join('・')}は、裏面に部屋が入りきりませんでした。大きさをA5にしてください`);
  if (warn.length) setTimeout(() => toast(warn.join('。')), 3800);
}
function openS12() {
  if (!isAdmin()) return;
  const terrs = D().territories.filter(t => !t.dummy).slice().sort(byNo);
  if (!s12Opt.sel) s12Opt.sel = new Set(terrs.map(t => t.id));
  const cnt = new Map();
  D().houses.forEach(h => {
    if (!h.terrId) return;
    const c = cnt.get(h.terrId) || { h: 0, a: 0 };
    if (h.type === 'apt') c.a++; else c.h++;
    cnt.set(h.terrId, c);
  });
  const selIds = () => terrs.filter(t => s12Opt.sel.has(t.id)).map(t => t.id);
  const go = ids => printS12(ids, s12Opt.size, s12Opt.back)
    .catch(e => { hideBlocking(); toast('印刷の準備がうまくいきませんでした：' + (e && e.message || e)); });
  // スマホで一度に印刷するのは、S12_MOBILE_MAX 区域まで（地図の画像が多いと、ブラウザが止まることがあるため）
  const refresh = () => {
    const ids = selIds(), n = ids.length, S = S12_SIZE[s12Opt.size];
    const pages = k => Math.ceil(k / S.per) * (s12Opt.back ? 2 : 1);
    $('#s12Cnt').textContent = `${n} / ${terrs.length}`;
    const box = $('#s12GoBox');
    if (!n) { box.innerHTML = '<button type="button" class="btn primary block" disabled>印刷する区域を選んでください</button>'; return; }
    if (isMobile() && n > S12_MOBILE_MAX) {
      const parts = [];
      for (let i = 0; i < n; i += S12_MOBILE_MAX) parts.push(ids.slice(i, i + S12_MOBILE_MAX));
      box.innerHTML = `<p class="hint">スマホでは、一度に${S12_MOBILE_MAX}区域ずつ印刷します（多いと止まることがあるため）。上から順に押してください。<br>
          まとめて印刷するときは、パソコンから印刷するか、ドライブに毎週保存されるPDFを使ってください。</p>
        <div class="s12parts">${parts.map((p, i) => {
          const done = s12Done.has(p.join(','));
          return `<button type="button" class="btn block${done ? '' : ' primary'}" data-s12part="${i}">${done ? '✓ ' : ''}区域${esc(terrById(p[0]).no)}〜${esc(terrById(p[p.length - 1]).no)}を印刷（A4で${pages(p.length)}ページ）</button>`;
        }).join('')}</div>`;
      $$('[data-s12part]', box).forEach(b => b.onclick = () => { const p = parts[Number(b.dataset.s12part)]; s12Done.add(p.join(',')); go(p); });
    } else {
      box.innerHTML = `<button type="button" class="btn primary block" id="s12Go">印刷する（${n}区域・A4で${pages(n)}ページ）</button>`;
      $('#s12Go').onclick = () => go(ids);
    }
  };
  const paint = () => {
    const S = S12_SIZE[s12Opt.size];
    setSheet(headHtml(null, '区域カード（S-12）を印刷する', '紙で運用するときの予備') + `
      <p class="hint">区域の線・家・拒否の家と、まわりの建物（国土地理院の淡色地図）を印刷します。留守などの記録は出しません。</p>
      <p class="q">カードの大きさ</p>
      <div class="seg" role="group" aria-label="カードの大きさ">${Object.entries(S12_SIZE).map(([key, o]) =>
        `<button type="button" data-s12size="${key}" aria-pressed="${s12Opt.size === key}">${o.label}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="s12Back"${s12Opt.back ? ' checked' : ''}>裏面に集合住宅の部屋を印刷する（両面印刷）</label>
      ${s12Opt.back ? `<p class="hint">プリンターの両面印刷は「${S.bind}」を選ぶと、表と裏の区域がそろいます。拒否の部屋は黒で出ます。</p>` : ''}
      <p class="q">印刷する区域（<span id="s12Cnt"></span>）</p>
      <div class="row"><button type="button" class="btn small" id="s12All">すべて選ぶ</button><button type="button" class="btn small" id="s12None">すべて外す</button></div>
      <div class="s12pick">${terrs.map(t => {
        const c = cnt.get(t.id) || { h: 0, a: 0 };
        return `<label class="check"><input type="checkbox" data-s12t="${esc(t.id)}"${s12Opt.sel.has(t.id) ? ' checked' : ''}><span><b>${esc(t.no)}</b> ${esc(t.name || '')} <small class="muted">家${c.h}・集合住宅${c.a}</small></span></label>`;
      }).join('')}</div>
      <div id="s12GoBox"></div>
      <p class="hint">区域が多いと、地図の準備に1〜2分かかります。印刷の画面で「PDFとして保存」を選ぶと、PDFにもできます。パソコンからの印刷がおすすめです。</p>`);
    refresh();
    $$('#sheet [data-s12size]').forEach(b => b.onclick = () => { s12Opt.size = b.dataset.s12size; sheetKeep = true; paint(); });
    $('#s12Back').onchange = e => { s12Opt.back = e.target.checked; sheetKeep = true; paint(); };
    $$('#sheet [data-s12t]').forEach(x => x.onchange = () => { if (x.checked) s12Opt.sel.add(x.dataset.s12t); else s12Opt.sel.delete(x.dataset.s12t); refresh(); });
    $('#s12All').onclick = () => { terrs.forEach(t => s12Opt.sel.add(t.id)); $$('#sheet [data-s12t]').forEach(x => { x.checked = true; }); refresh(); };
    $('#s12None').onclick = () => { s12Opt.sel.clear(); $$('#sheet [data-s12t]').forEach(x => { x.checked = false; }); refresh(); };
  };
  paint();
}

/* =========================================================
   翌月の奉仕の予定を印刷（掲示板に張る用・A4よこ）
   ========================================================= */
/* 予定の印刷：月をえらぶ（はじめは来月） */
function printMonthPicker(id) {
  const n = new Date(), d = new Date(n.getFullYear(), n.getMonth() + 1, 1), val = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  return `<div class="printpick"><input type="month" id="${id}M" value="${val}" aria-label="印刷する月">
    <button class="btn" id="${id}">この月の予定を印刷<small>掲示板用</small></button></div>`;
}
function printPickedMonth(id) {
  const m = /^(\d{4})-(\d{2})$/.exec(($(`#${id}M`) || {}).value || '');
  if (!m) { toast('印刷する月をえらんでください'); return; }
  printMonthSchedule(Number(m[1]), Number(m[2]) - 1);
}
async function printMonthSchedule(y, m) {
  const pre = `${y}-${pad2(m + 1)}`, first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate();
  const list = D().schedules.filter(s => String(s.date).startsWith(pre) && (isAdmin() || !s.group || s.group === myGroup()))
    .sort((a, b) => ((a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1));
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<td class="off"></td>');
  for (let d = 1; d <= last; d++) {
    const key = `${pre}-${pad2(d)}`, wd = new Date(y, m, d).getDay();
    const ev = list.filter(s => s.date === key).map(s => `<div class="pe"><b>${esc(s.time || '')}${s.end ? '〜' + esc(s.end) : ''}</b> ${esc(s.place || '')}
      <small>${esc(schedGroupName(s.group))}${s.note ? '・' + esc(s.note) : ''}</small></div>`).join('');
    cells.push(`<td class="${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}"><span class="dn">${d}</span>${ev}</td>`);
  }
  while (cells.length % 7) cells.push('<td class="off"></td>');
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  const h = weeks.length > 5 ? 23 : 28;
  const html = `<div class="mpage"><h1>${y}年${m + 1}月　奉仕の予定</h1>
    <table class="mcal"><thead><tr>${WD.map((w, i) => `<th class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</th>`).join('')}</tr></thead>
      <tbody>${weeks.join('').replace(/<td/g, `<td style="height:${h}mm"`)}</tbody></table>
    <p class="mfoot"><span>変更があるときは、区域マップのホーム画面でお知らせします。</span><span>${fmtDay(new Date().toISOString())} 作成</span></p></div>`;
  if (!list.length && !await ask(`${m + 1}月の予定は、まだ入っていません。このまま印刷しますか？`)) return;
  printDoc(html, true);
}

/* ---------- 画面の切りかえ ---------- */
let currentView = 'cards';
function showView(name) {
  if (name === 'reco' && !recoOn()) name = 'home'; // 区域係が「おすすめを出さない」にしているとき
  if (name === 'admin' && !isAdmin()) name = 'cards'; // ②の対応：グループ監督は「グループ」タブがなくなったため、係の画面には入れない
  if (name === 'follow' && !featFollow()) name = 'cards';
  if (currentView === 'map' && name !== 'map' && mode !== 'normal') { if (draw) endDraw(); else setMode('normal'); }
  if (name !== 'map') { clearTarget(); followMap = false; hideNextPanel(); if (window.dncPickEnd) window.dncPickEnd(true); }
  currentView = name;
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  $$('#tabs button').forEach(b => { if (b.dataset.view === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (name === 'map') {
    renderTerrs();
    setTimeout(() => {
      map.invalidateSize();
      if (firstMapShow) { firstMapShow = false; if (!$('#terrJump').value) fitAll(); }
      renderHouses();
    }, 30);
  }
  if (name === 'cards') renderCards();
  if (name === 'home') renderHome();
  if (name === 'reco') renderRecoView();
  if (name === 'follow') renderFollowList();
  if (LIVE && (name === 'cards' || name === 'map') && !Store.queue.length && Date.now() - lastRefresh > 5000) refresh(true).catch(() => {});
  if (name === 'admin') {
    if (isAdmin()) { renderAdmin(); fetchDevices(true); } else renderOverseer();
    if (LIVE && !Store.queue.length) refresh(true).catch(() => {});
  }
}
/* 同じタブをもう一度押したとき：そのタブのはじめの状態にもどる（JW Library と同じ作法・2026.13.87）。
   ・一覧の画面（ホーム・区域カード・再訪問・おすすめ・係の画面）：いちばん上へ。係の画面の中のタブはそのまま
   ・地図：えらんでいる区域の全体が入るように（えらんでいなければ全部の区域）
   ・地図で作業している間（線を引く・場所をえらぶ・拒否の家をえらぶ など）は何もしない。入れかけのものは消さない
   この画面は .view の中だけが動くので、iPhone の「画面のいちばん上をタップすると上へ」が効かない。その代わりの帰り道 */
function retapView(name) {
  if (name === 'map') {
    if (!map || mode !== 'normal' || draw || pickPlace || document.body.classList.contains('focusmode')) return;
    const id = selTerrId(), t = id && terrById(id);
    if (t && okPoly(t.polygon)) fitTerr(id); else fitAll();
    return;
  }
  const v = $('#view-' + name);
  if (!v || v.scrollTop <= 0) return;
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { v.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); } catch (e) { v.scrollTop = 0; }
}
/* 係の画面の中のタブ（監督は「予定」と「人・グループ」だけ） */
let adPane = 'inbox';
function setAdPane(v) {
  const allowed = isAdmin() ? ['inbox', 'terr', 'sched', 'status', 'dnc', 'people', 'set'] : ['sched', 'people'];
  adPane = allowed.includes(v) ? v : allowed[0];
  // 「状況」は「区域」タブの中の切りかえ（上のタブは「区域」が選ばれたまま）
  const tabOf = p => (p === 'status' || p === 'dnc' ? 'terr' : p);
  $$('#adTabs [data-ap]').forEach(b => { b.hidden = b.dataset.ap === 'status' || !allowed.includes(b.dataset.ap); b.setAttribute('aria-pressed', String(b.dataset.ap === tabOf(adPane))); });
  const sub = $('#adTerrSub');
  if (sub) { sub.hidden = tabOf(adPane) !== 'terr'; $$('[data-ap]', sub).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ap === adPane))); }
  $('#adTabs').style.gridTemplateColumns = allowed.length === 2 ? 'repeat(2,1fr)' : '';
  $$('#view-admin .apane').forEach(p => { const k = p.dataset.apane; p.hidden = !(k === adPane || (adPane === 'status' && k === 'status2')); });
}
function renderOverseer() {
  renderSchedAdmin(); renderPeople(); setAdPane(adPane);
}
function updateTabs() {
  // ②の対応：グループ監督・司会者用の「グループ」タブは廃止。タブは区域係だけに表示する
  // （集まりの予定を入れる機能はホーム画面に残り、グループの人一覧はいったんなし）
  const show = isAdmin();
  $('#tabAdmin').hidden = !show;
  $('#tabFollow').hidden = !featFollow();
  $('#tabReco').hidden = !recoOn();
  $('#tabAdminLabel').textContent = '係の画面';
  $('#tabs').classList.remove('three');
  const nTabs = $$('#tabs > button').filter(b => !b.hidden).length;
  $('#tabs').style.setProperty('--tabs', nTabs);
  $('#tabs').classList.toggle('many', nTabs >= 6); // 6つのときは、大きい文字でも名前が切れないように少し小さく
}
function fillWho() {
  $('#whoSel').innerHTML = D().users.map(u => `<option value="${esc(u.id)}"${u.id === D().currentUser ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
}
/* 区域が区域カードとして受け取られた、自分の返却後の留守宅カードを終える（カードを持つ本人の端末で、1回だけ知らせる）。
   描きかえの途中で保存しないよう、あとで動かす。終わった日は、区域が受け取られた日（寝かせの計算にも使う） */
let extEndBusy = false;
function endTakenExtCards() {
  if (extEndBusy) return;
  const now = Date.now(), mine = D().awayCards.filter(c => c.ext && !c.endedAt && c.by === me().id && Date.parse(c.expiresAt) > now && extTakenAt(c));
  if (!mine.length) return;
  extEndBusy = true;
  try {
    const nos = [];
    mine.forEach(c => { c.endedAt = extTakenAt(c); if (focusCard === c.id) focusCard = null; const t = terrById(c.terrId); if (t && !nos.includes(t.no)) nos.push(t.no); });
    Store.save(); renderAll();
    toast(`区域${nos.join('・')}が新しく受け取られたので、返却後の留守宅カードは終わりました`);
  } finally { extEndBusy = false; }
}
function renderAll(skipIndex) {
  if (skipIndex !== true) buildIndex(skipIndex === 'houses' ? 'houses' : undefined); // true：記録だけが届いた（索引は1件ずつ直してある）／'houses'：記録は変わっていない
  if (!extEndBusy && D().awayCards.some(c => c.ext && !c.endedAt && c.by === me().id && extTakenAt(c))) setTimeout(endTakenExtCards, 300);
  updateTabs();
  if (currentView === 'reco' && !recoOn()) { showView('home'); return; }
  if (currentView === 'reco') renderRecoView();
  purgeMemos();
  fillTerrJump();
  if (currentView === 'cards') renderCards();
  if (map && currentView === 'map') { renderTerrs(); renderHouses(); }
  if (currentView === 'home') renderHome();
  if (currentView === 'follow') renderFollowList();
  if (currentView === 'admin') { if (isAdmin()) renderAdmin(); else if (isOverseer()) renderOverseer(); }
  updateAdminBadge();
}
/* 人を待たせているもの（区域カードの申し込み・家の削除の申請・自分で受け取られた区域の確認・スマホの登録の申し込み）の数。
   下のタブ「係の画面」の数字と、中の「今日」の数字は、どちらもこれにそろえる（改善案A8。期限の近い区域などは数に入れず、「今日の対応」の中だけに出す） */
function waitCount() {
  return D().requests.filter(r => r.status === 'pending' && (!r.type || r.type === 'delHouse')).length +
    D().territories.filter(t => t.holder && t.selfTakenAt && t.selfSeen === false).length +
    devPending().length;
}
function updateAdminBadge() {
  const b = $('#tabBadge');
  if (!isAdmin()) { b.hidden = true; return; }
  const n = waitCount();
  b.textContent = n; b.hidden = !n;
}
function openTerr(id) {
  firstMapShow = false;
  zoomHintShown = false; // 区域カードから入ったときは、案内をもう一度出す
  showView('map');
  selectTerr(id, { fit: true });
  if (beginner()) setTimeout(() => toast(UI.mode !== 'detail' ? '右下の「?」を押すと、印の見かたと「返す」ボタンが出ます' : '右下の「?」を押すと、この区域の進み具合やおすすめ順が見られます', null, null, { below: '#mapTools' }), 2500); // 簡単モードは、おすすめ順を出さないので文を変える
}

/* ---------- ボタンの動き ---------- */
function bindStatic() {
  // 同じタブをもう一度押したときは、描き直したうえで、そのタブのはじめの状態にもどる（retapView）
  $$('#tabs button').forEach(b => b.onclick = () => {
    const same = b.dataset.view === currentView;
    showView(b.dataset.view);
    if (same && currentView === b.dataset.view) retapView(currentView);
  });
  const adTabClick = e => {
    const b = e.target.closest('[data-ap]'); if (!b) return;
    setAdPane(b.dataset.ap);
    if (isAdmin()) renderAdmin(); else if (isOverseer()) renderOverseer(); // えらんだタブの中身を、そのとき作る
    $('#view-admin').scrollTop = 0;
  };
  $('#adTabs').addEventListener('click', adTabClick);
  $('#adTerrSub').addEventListener('click', adTabClick);
  bindHome();
  bindReco();
  bindSwipe();
  $('#splash').addEventListener('click', () => hideSplash(true));
  watchResume();
  watchUpdate();
  $('#whoSel').onchange = e => {
    D().currentUser = e.target.value; Store.save();
    uiLoad(); applyUi();
    updateTabs(); renderAll();
    if (currentView === 'admin' && !isAdmin()) showView('cards');
  };
  $('#backdrop').onclick = closeSheet;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#sheet').hidden) closeSheet();
    else if (!$('#legend').hidden) toggleLegend(false);
    else if (!$('#s13View').hidden) $('#s13View').hidden = true;
    else if (draw) endDraw();
    else if (mode !== 'normal') setMode('normal');
  });

  $('#allDetails').addEventListener('toggle', () => { if ($('#allDetails').open) renderCards(); else $('#allCards').innerHTML = ''; });
  // 区域カード・自分の再訪問
  $('#view-cards').addEventListener('click', async e => {
    const q = sel => e.target.closest(sel);
    let x;
    if ((x = q('[data-open]'))) openTerr(x.dataset.open);
    else if ((x = q('[data-go]'))) goTo(x.dataset.go, x.dataset.unit, x.dataset.route === '1');
    else if ((x = q('[data-fact]'))) followAction(x.dataset.fact, x.dataset.key);
    else if ((x = q('[data-pin]'))) togglePin(x.dataset.pin);
    else if ((x = q('[data-fstamp]'))) stampFollow(x.dataset.key, x.dataset.fstamp, null, renderFollowList);
    else if ((x = q('[data-reqopen]'))) openRequestSheet(x.dataset.reqopen === 'g');
    else if ((x = q('[data-leadpick]'))) openLeadPick();
    else if ((x = q('[data-leadoff]'))) quitLead(x.dataset.leadoff, true);
    else if ((x = q('[data-leadquit]'))) quitLead(x.dataset.leadquit, false);
    else if ((x = q('[data-reqcancel]'))) {
      const id = x.dataset.reqcancel;
      if (!await ask('申し込みを取り消します。よろしいですか？')) return;
      commit('申し込みを取り消しました', () => { D().requests = D().requests.filter(r => r.id !== id); });
    }
    else if ((x = q('[data-reqseen]'))) {
      const r = D().requests.find(r => r.id === x.dataset.reqseen);
      if (r) { r.seen = true; Store.save(); renderAll(); }
    }
    else if ((x = q('[data-return]'))) openReturnSheet(x.dataset.return);
    else if ((x = q('[data-helpers]'))) openHelpers(x.dataset.helpers);
    else if ((x = q('[data-parts]'))) startPartSplit(x.dataset.parts); // 一覧を出さずに、すぐ地図で分ける
    else if (q('[data-awaypick]')) openAwayPick();
    else if (q('[data-gawaypick]')) { reqUse = 'grp'; openAwayPick(true); } // グループ奉仕から（画面で全体の集まりに切りかえられる）
    else if ((x = q('[data-chelpers]'))) openHelpers(null, x.dataset.chelpers);
    else if ((x = q('[data-cmode]'))) setCardMode(x.dataset.cid, x.dataset.cmode);
    else if ((x = q('[data-cparts]'))) startCardSplit(x.dataset.cparts);
    else if (q('[data-homeadd]')) openHomeGuide();
    else if (q('[data-homeoff]')) { lsSet(HOME_OFF, '1'); renderCards(); toast('「ホーム画面に追加する方法」は、いつでも下の「このスマホの操作」から開けます'); }
    else if ((x = q('[data-dguide]'))) openDummyGuide(x.dataset.dguide);
    else if ((x = q('[data-awayopen]'))) openAwayCard(x.dataset.awayopen);
    else if ((x = q('[data-awayend]'))) endAwayCard(x.dataset.awayend);
  });

  // 再訪問のタブ
  $('#view-follow').addEventListener('click', e => {
    const q = sel => e.target.closest(sel);
    let x;
    if ((x = q('[data-go]'))) goTo(x.dataset.go, x.dataset.unit, x.dataset.route === '1');
    else if ((x = q('[data-fact]'))) followAction(x.dataset.fact, x.dataset.key);
    else if ((x = q('[data-pin]'))) togglePin(x.dataset.pin);
    else if ((x = q('[data-fstamp]'))) stampFollow(x.dataset.key, x.dataset.fstamp, null, renderFollowList);
  });
  $('#adS13').onclick = () => openS13();
  $('#adS12').onclick = () => openS12();
  $('#adPerf').onclick = () => { toast('測っています…'); setTimeout(runPerfCheck, 50); };
  $('#adLoadLog').onclick = () => openLoadLog();
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-asgopen], [data-asgok]'); if (!o) return;
    asgMarkSeen(String(o.dataset.asgkeys || o.dataset.asgok || '').split(' ').filter(Boolean));
    if (o.dataset.asgcard) openAwayCard(o.dataset.asgcard); else if (o.dataset.asgopen) openTerr(o.dataset.asgopen); else { renderCards(); if (currentView === 'home') renderHome(); }
  });
  bindAgeAdmin();

  // 地図
  $('#terrJump').onchange = e => {
    if (e.target.value === '__card') { const c = activeCards().find(x => x.id === focusCard); if (c) openAwayCard(c.id); return; }
    selectTerr(e.target.value || null, { fit: true });
  };
  $('#btnAdd').onclick = () => {
    if (simpleBlock('家を追加')) return;
    addCount = 0; delCount = 0; addMode = 'quick'; setMode('add'); updateAddBar();
    if (map.getZoom() < 17) toast('場所がわかるまで地図を拡大してから、タップしてください');
  };
  $('#partUndo').onclick = () => {
    if (!partDraw || !partDraw.pts.length) return;
    if (partDraw.tool === 'pen') partDraw.pts = []; else partDraw.pts.pop(); // なぞった囲みは、まるごと消す
    renderPartDraw();
  };
  $$('#partBar [data-parttool]').forEach(b => b.onclick = () => setPartTool(b.dataset.parttool));
  $('#partDone').onclick = openPartAssign;
  $('#partCancel').onclick = endPartSplit;
  $('#partListBtn').onclick = () => { if (partDraw) openPartList(partDraw.tid, partDraw.cid); };
  $$('#addBar [data-addmode]').forEach(b => b.onclick = () => {
    if (b.dataset.addmode === 'del' && simpleBlock('家を消すことは')) return;
    addMode = b.dataset.addmode; closeSheet(); updateAddBar();
  });
  $('#addMini').onclick = () => setAddFold(false);
  $('#addFold').onclick = () => setAddFold(true);
  $('#addBase').onclick = () => { setBase(baseName === 'pale' ? 'photo' : 'pale'); updateAddBar(); };
  $('#addEndMini').onclick = () => $('#addCancel').click(); // 小さくしたときの「追加を終わる」も、同じ終わり方にする
  $('#addCancel').onclick = () => {
    closeSheet(); setMode('normal');
    if (LIVE && Store.queue.length) {
      toast('追加した家を送っています。上の「未送信」の表示が消えるまで、アプリを閉じないでください');
      if (!flushing) flush();
    }
  };
  $('#btnLocate').onclick = () => locate(() => { map.setView(myPos, Math.max(map.getZoom(), 18)); $('#btnLocate').classList.add('on'); });
  map.on('dragstart', () => $('#btnLocate').classList.remove('on')); // 地図を動かしたら、青い（追いかけ中の）表示をやめる
  $('#zoomHint').onclick = () => { clearTimeout(zoomHintTimer); $('#zoomHint').hidden = true; };
  // 「?」：下の案内を隠しているときは、まず案内をもう一度出す。出ているときは印の見かたを開く
  $('#legendBtn').onclick = () => {
    if (barHidden && (followMap || focusCard || roundTerr)) { barHidden = false; renderCardBar(); return; }
    toggleLegend();
  };
  // 下の案内を押すと隠す（中のボタンを押したときは、そのボタンの動きだけ）
  $('#cardBar').addEventListener('click', e => {
    if (e.target.closest('button, a, input, select, label, .seg')) return;
    barHidden = true; renderCardBar();
    toast('右下の「?」を押すと、また表示されます');
  });
  $('#lgBiz').innerHTML = kindBadge('office'); // 印の見かたのアイコン（HTMLの中では作れないので、ここで入れる）
  $('#lgLock').innerHTML = '集<b class="lk">' + LOCK_SVG + '</b>';
  $('#legendClose').onclick = () => { toggleLegend(false); $('#legendBtn').focus(); };
  $('#btnUi').onclick = openUiSheet;
  bindSheetSwipe();
  $('#drawUndo').onclick = drawUndo;
  $('#drawDelPt').onclick = deleteSelectedPoint;
  $('#drawRestart').onclick = restartDraw;
  $('#drawSnap').onchange = e => { drawSnapOn = e.target.checked; if (draw) drawHints(); };
  $('#drawNbMove').onchange = e => { drawNbMove = e.target.checked; };
  $('#drawDone').onclick = finishDraw;
  $('#drawCancel').onclick = () => { closeSheet(); endDraw(); };
  $('#ovFile').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    loadOverlay(file);
    e.target.value = '';
  };
  $('#ovRange').oninput = applyOv;
  $('#ovRot').oninput = e => { if (ovState) { ovState.rot = Number(e.target.value); applyRot(); } };
  $('#ovPin').onclick = () => { if (ovState && ovState.pinned) unpinOverlay(); else pinOverlay(); };
  $('#ovPage').onclick = openPdfPicker;
  $('#ovClear').onclick = clearOverlay;
  $('#drawHouses').onchange = e => { drawShowHouses = e.target.checked; renderHouses(); };
  $('#drawFold').onclick = () => setDrawFold(!$('#drawBar').classList.contains('mini'));
  $$('#drawBar [data-drawtap]').forEach(b => b.onclick = () => setDrawTap(b.dataset.drawtap));

  // 係の画面
  $('#adNewTerr').onclick = () => startDraw(null);
  $('#adKml').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    readKmlFile(file);
    e.target.value = '';
  };
  $('#adSpecial').onclick = () => openSpecialSheet(null);
  // 区域の一覧の行を押すと、その区域のカルテ（改善案A4。返却・担当・貸し出しのきまりなどの操作は、カルテの中）
  $('#adTerrs').addEventListener('click', e => {
    const r = e.target.closest('[data-karte]'); if (!r) return;
    if (window.KM && KM.openKarte) KM.openKarte(r.dataset.karte); else openTerr(r.dataset.karte);
  });
  $('#adXlsx').onchange = e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) readXlsxFile(file);
  };
  $('#adCsv').onclick = exportCsv;
  $('#adReset').onclick = async () => {
    if (!await ask('この端末の試作データを最初の状態に戻します。よろしいですか？')) return;
    const cu = D().currentUser;
    Store.data = makeDemo(); Store.data.currentUser = cu; Store.save();
    fillWho(); updateTabs(); renderAll(); toast('試作データに戻しました');
  };
  // 係の画面の押したときの処理。状況の「区域の決め」（kimari.js）をスマホで下から出す画面に出したときも、同じ処理を使う
  const adminClick = e => {
    const q = sel => e.target.closest(sel);
    let x;
    if ((x = q('[data-recok]'))) { const st = D().settings; st.recoKinds = (Number(st.recoKinds) || 0) ^ Number(x.dataset.recok); Store.save(); renderAll(); }
    else if ((x = q('[data-open]'))) openTerr(x.dataset.open);
    else if ((x = q('[data-redraw]'))) { if (window.kyoukai) window.kyoukai.open(x.dataset.redraw); else startDraw(x.dataset.redraw); }
    else if ((x = q('[data-rename]'))) { const t = terrById(x.dataset.rename); if (t) openTerrForm({ terr: t }); else toast('この区域は、もうありません'); }
    else if ((x = q('[data-delterr]'))) openDeleteTerr(x.dataset.delterr);
    else if ((x = q('[data-dummy]'))) { const a = x.dataset.dummy; if (a === 'add') addDummy(); else if (a === 'del') delDummy(); else openDummyGuide(); }
    else if ((x = q('[data-go]'))) goTo(x.dataset.go, x.dataset.unit);
    else if ((x = q('[data-fact]'))) followAction(x.dataset.fact, x.dataset.key);
    else if ((x = q('[data-set]'))) changeSetting(x.dataset.set, Number(x.dataset.d));
    else if (q('#bkGo')) bulkMove();
    else if ((x = q('[data-sset]'))) {
      const key = x.dataset.sset, v = Number(x.dataset.v);
      const go = () => { D().settings[key] = v; Store.save(); renderAll(); toast('設定を変えました'); };
      if (key === 'memoSync' && v === 0 && D().settings.memoSync !== 0) {
        ask('再訪問のメモを、ほかの端末で使えないようにします。\nサーバーに保管している全員のメモを消します（各自のスマホの中のメモは残ります）。よろしいですか？')
          .then(ok => { if (ok) go(); });
      } else go();
    }
    else if ((x = q('[data-kset]'))) {
      const st = D().settings, key = x.dataset.kset;
      const lim = RECO_LIM[key] || (key === 'keepMonths' ? [6, 36] : key === 'skipDays' ? [0, 180] : key === 'followSkipDays' ? [0, 365] : key === 'groupMax' ? [1, 10]
        : key === 'syncGroupSec' ? [5, 30] : key === 'syncNormalSec' ? [10, 120]
        : key === 'reqMaxPersonal' || key === 'reqMaxGroup' ? [1, 5]
        : key === 'holdMaxPersonal' ? [1, 10] : key === 'holdMaxGroup' ? [1, 40] // グループ：フェーズ1の過渡期は枝番ごとに数えるので40まで
        : key === 'lowWait' ? [3, 30]
        : key === 'freeAfterDays' ? [0, 365] : [5, 60]);
      const cv = st[key] == null || st[key] === '' ? NaN : Number(st[key]);
      st[key] = Math.min(lim[1], Math.max(lim[0], (isFinite(cv) ? cv : 2) + Number(x.dataset.d)));
      Store.save(); renderAll(); toast('設定を変えました');
    }
    else if ((x = q('[data-donepct]'))) {
      const st = D().settings;
      st.donePct = Math.min(100, Math.max(50, st.donePct + Number(x.dataset.donepct)));
      Store.save(); renderAll(); toast('完了の目安を変えました');
    }
    else if ((x = q('[data-aset]'))) {
      const st = D().settings, key = x.dataset.aset;
      const EXT_LIM = { extRest: [7, 30, 7], extCap: [1, 5, 2], extDays: [14, 180, 60], extStopBefore: [0, 60, 14], awayDayOnly: [0, 10, 3], osaeMax: [1, 5, 2], osaeDays: [1, 14, 7] }; // 下限・上限・はじめの値
      const lim = EXT_LIM[key] || (key === 'awayDays' ? [3, 14] : key === 'awayRecentDays' ? [0, 30] : key === 'awayCardMax' ? [0, 50] : key === 'awayCap' ? [1, 15] : [1, 5]);
      const cur = st[key] == null || !isFinite(Number(st[key])) ? (EXT_LIM[key] ? EXT_LIM[key][2] : key === 'awayCap' || key === 'awayRecentDays' ? 3 : 1) : Number(st[key]);
      st[key] = Math.min(lim[1], Math.max(lim[0], cur + Number(x.dataset.d)));
      Store.save(); renderAll(); toast('設定を変えました');
    }
    else if ((x = q('[data-extstop]'))) toggleExtStop(x.dataset.extstop);
    else if ((x = q('[data-reqok]'))) approveReq(x.dataset.reqok);
    else if ((x = q('[data-delok]'))) approveDel(x.dataset.delok);
    else if ((x = q('[data-delno]'))) { const r = D().requests.find(y => y.id === x.dataset.delno); if (r && !houseById(r.houseId)) approveDel(r.id); else declineDel(x.dataset.delno); }
    else if ((x = q('[data-reqno]'))) declineReq(x.dataset.reqno);
    else if ((x = q('[data-takenseen]'))) { const t = terrById(x.dataset.takenseen); if (t) commit(`区域${t.no}の受け取りを確認しました`, () => { t.selfSeen = true; t.selfSeenBy = me().id; t.selfSeenAt = new Date().toISOString(); }); }
    else if ((x = q('[data-takemax]'))) {
      const st = D().settings;
      st.selfTakeMax = Math.min(5, Math.max(1, st.selfTakeMax + Number(x.dataset.takemax)));
      Store.save(); renderAll(); toast('枚数を変えました');
    }
  };
  $('#view-admin').addEventListener('click', adminClick);
  $('#sheet').addEventListener('click', e => { if (e.target.closest && e.target.closest('#adRules')) adminClick(e); });
  $('#view-admin').addEventListener('change', e => {
    const s = e.target, k = s.dataset.assign || s.dataset.reassign;
    if (!k || !s.value) return;
    const cur = fol(k);
    if (cur && cur.by === s.value) return;
    const v = s.value;
    commitIn([], `${uname(v)}さんが再訪問を受け持ちます`, () => startFollow(k, v));
  });
}

/* ---------- 同じスマホ・パソコンで2つ以上のタブを開いたとき ----------
   あとから開いたタブだけで使う（2つのタブが送信待ちを書きかえ合って、記録が消えるのを防ぐ） */
const TAB_ID = uid();
function claimTab() {
  if (!LIVE || typeof BroadcastChannel !== 'function') return;
  let ch;
  try { ch = new BroadcastChannel(NS ? 'kuiki-map-' + NS : 'kuiki-map'); } catch (e) { return; }
  ch.onmessage = e => { if (e.data && e.data.t === 'open' && e.data.id !== TAB_ID) yieldTab(); };
  ch.postMessage({ t: 'open', id: TAB_ID });
}
function yieldTab() {
  if (Store.inactive) return;
  Store.inactive = true;
  clearTimeout(Store.cacheTimer);
  showBlocking('ほかのタブで開かれました', 'この区域マップは、ほかのタブ（ウィンドウ）で開かれています。記録が重ならないように、こちらの画面は止めました。この画面は閉じてください。');
  const b = $('#blockRetry');
  b.textContent = 'こちらの画面で使う';
  b.hidden = false;
  b.onclick = () => location.reload();
}
/* 圏外でもアプリを開けるようにする（sw.js があるときだけ） */
function registerSw() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* 使えなくても、ふだんどおり動く */ });
}
/* スマホの容量が少ないときでも、保存した区域の情報を勝手に消されにくくする */
function keepStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(p => (p ? p : navigator.storage.persist())).catch(() => {});
    }
  } catch (e) { /* 何もしない */ }
}

/* 練習モード：モードと文字の大きさは、本番で使っている設定をURLで引きつぐ（m=simple|detail、z=大きさ、p=％） */
function renshuUi() {
  const q = new URLSearchParams(location.search);
  UI.mode = q.get('m') === 'detail' ? 'detail' : 'simple';
  const z = q.get('z'); if (z && SIZES[z]) UI.size = z;
  const p = Number(q.get('p')); if (p >= 80 && p <= 160) UI.pct = Math.round(p);
  UI.splash = 'off'; UI.hello = 'off';
  uiSave();
}
function renshuShow() {
  document.body.classList.add('renshu');
  const pill = $('#modePill'); pill.hidden = false; pill.textContent = '練習中'; pill.style.background = '#C2410C'; pill.style.color = '#fff';
  document.title = '【練習】' + document.title;
  $('#whoSel').hidden = true; $('#whoLabel').hidden = true;
  $('#whoName').hidden = false; $('#whoName').textContent = `${me().name}さん`;
  $('#renshuBar').hidden = false;
  $('#renshuExit').onclick = renshuExit;
}
function renshuExit() { renshuClear(); location.href = location.pathname; } // 練習の保存場所を消して、本番にもどる
async function init() {
  if (!window.L) {
    document.body.innerHTML = '<p style="padding:24px;font-size:20px">地図の部品を読み込めませんでした。インターネットにつながっているか確認して、もう一度開いてください。</p>';
    return;
  }
  let from = '';
  if (LIVE) {
    let tk = readToken();
    if (!tk.token && lsGet(HOME_KEY)) {
      showBlocking('準備しています…', 'ホーム画面のアイコンから使えるようにしています。', true);
      const got = await claimHome();
      if (got) tk = { token: got, changed: true };
    }
    if (tk.token) lsDel(HOME_KEY);
    if (!tk.token) {
      if (lsGet(JOIN_KEY)) { openJoin(); return; }          // 共通リンク：名前をえらぶ
      if (isStandalone()) { openHomeHelp(); return; }       // ホーム画面のアイコンから開いた（コードが引き継がれていない）
      showBlocking('このリンクでは開けません', '区域係からもらったリンクを開いてください。');
      return;
    }
    if (lsGet(PENDING_KEY)) { openWaiting(); return; }       // 係の承認待ち
    claimTab(); // ほかのタブで開いていたら、そちらを止める（送信待ちを読む前に）
    showBlocking('読み込んでいます…', '初めて開くときは、少し時間がかかります。', true);
    if ($('#spSub')) $('#spSub').textContent = '読み込んでいます…';
    try {
      from = await Store.loadLive(tk);
    } catch (e) {
      if (e.code === 'auth') authLost();
      else if (Store.expired) showBlocking('端末の情報を消しました', 'しばらく通信できなかったため、区域の情報をこのスマホから消しました。通信できる場所で開き直すと、また使えます。');
      else showLoadError(e);
      return;
    }
    hideBlocking();
  } else {
    Store.load();
    if (RENSHU) { // 使う人は伝道者A（係の画面に入れないように）。「使う人」の選びは出さない
      const ru = Store.data.users.find(x => x.id === 'u1') || Store.data.users[0];
      if (ru) Store.data.currentUser = ru.id;
    }
  }
  uiLoad(); if (RENSHU) renshuUi(); applyUi();
  dropOldGpins(); // 外した「自分のGoogleマップのピン」のデータが残っていたら消す
  initMap();
  bindStatic();
  fillWho();
  updateTabs();
  currentView = ''; // ここでは画面を描かない。すぐ下の showView で、はじめに見せる画面だけを1回描く（改善案B1：見えていない画面を描かない）
  renderAll();
  if (uiEff().base === 'photo') setBase('photo');
  showView(uiEff().start || 'cards');
  splashGreeting();
  // 前回からの変更があれば先にお知らせを見せ、押したらあいさつ → ふだんの画面
  bindHello();
  showNewsIfAny(() => {
    splashAt = Date.now(); hideSplash();
    queueHello(UI.splash !== 'off' && !lsGet(SPLASH_OFF) ? (Number(uiEff().splashSec) || 1.8) * 1000 + 700 : 400);
  });
  if (RENSHU) renshuShow();
  if (LIVE) {
    $('#modePill').hidden = !NS; // テスト用のページは「テスト版」と出す（本番とまちがえないように）
    if (NS) { $('#modePill').textContent = 'テスト版'; $('#modePill').style.background = '#C2410C'; $('#modePill').style.color = '#fff'; document.title = '【テスト】' + document.title; }
    $('#whoSel').hidden = true; $('#whoLabel').hidden = true;
    $('#whoName').hidden = false; $('#whoName').textContent = `${me().name}さん`;
    $('#liveTools').hidden = false;
    $('#adReset').hidden = true;
    $('#btnLogout').onclick = logout;
    $('#btnHome').onclick = openHomeGuide;
    // ほかの人の記録を取りに行く間隔：一緒に回っている間は約7秒、区域カード・地図を見ている間は約20秒、そのほかは約45秒
    const again = () => {
      if (document.hidden || Store.inactive || checkExpiry() || Store.authLost) return;
      fetchDevices(false); // 区域係のとき、スマホの申し込みを1分ごとに確認
      updateSyncAge();
      if (Store.queue.length) { if (!flushing) flush(); return; }
      MemoSync.tick(); // 再訪問メモを、同じ人のほかの端末と合わせる（送っていない変更を送り終えてから）
      if (Date.now() >= nextPollAt) {
        schedulePoll(); // 返事を待つ間に、もう一度取りに行かないように先に次の時刻を決める
        refresh(true).then(() => { pollFail = 0; }).catch(() => { pollFail = Math.min(3, pollFail + 1); }).then(schedulePoll);
      }
    };
    setInterval(again, 1500);
    // 電波が戻ったら、待たずにすぐ送る・取りに行く
    window.addEventListener('online', () => { flushFail = 0; flushNextAt = 0; nextPollAt = 0; updateSyncBadge(); if (Store.queue.length) flush(true); else again(); });
    window.addEventListener('offline', () => updateSyncBadge());
    document.addEventListener('visibilitychange', () => {
      // ほかのアプリに切りかえるときは、端末への保存と送信をすぐ行う（iPhoneはすぐ止まるため）
      if (document.hidden) { Store.sweep('hide'); Store.saveCacheNow(true); if (Store.queue.length && !flushing) flush(true); return; }
      lastRefresh = 0; nextPollAt = 0; flushNextAt = 0; MemoSync.wake(); again();
    });
    window.addEventListener('pagehide', () => { Store.sweep('hide'); Store.saveCacheNow(true); });
    $('#syncState').onclick = openSyncSheet;
    $('#syncState').setAttribute('role', 'button');
    $('#syncState').tabIndex = 0;
    keepStorage();
    registerSw();
    fetchDevices(true);
    if (Store.queue.length) flush();
    else if (from === 'cache') refresh(true).catch(() => toast('インターネットにつながっていません。前回の情報を表示しています'));
    if (!lsGet(LOCK_KEY)) {
      setSheet(headHtml(null, 'はじめにお願い', '') + `
        <div class="notice warn"><b>スマホに画面ロック（パスコード、指紋、顔認証）を設定してください。</b><br>
          区域の情報はスマホの中にも保存されます。スマホをなくしても、ほかの人に見られないようにするためです。</div>
        <p>${cacheDaysLimit()}日以上通信できなかったスマホでは、保存した情報を自動で消します。</p>
        <button class="btn primary block" id="lockOk">画面ロックを設定しました</button>`);
      $('#lockOk').onclick = () => { lsSet(LOCK_KEY, '1'); closeSheet(); afterWelcome(); };
    } else afterWelcome();
  }
}
/* 使えるようになった直後：スマホなら、ホーム画面に追加する手順を一度だけ出す */
function afterWelcome() {
  if (lsGet(HOME_WELCOME)) { lsDel(HOME_WELCOME); toast('ホーム画面のアイコンから使えるようになりました'); }
  const first = !!lsGet(FIRST_OK);
  lsDel(FIRST_OK);
  // 「ホーム画面に追加する」の案内：ほかの画面（返却・記録など）を開いて使いはじめていたら、その画面を置きかえない。
  // 少し待って、閉じていれば出す（数回ためしても開いたままなら出さない。設定の「ホーム画面に追加」からいつでも開ける。第3回監査・2026-10-29）
  const guide = n => { if ($('#sheet').hidden) openHomeGuide(); else if (n > 0) setTimeout(() => guide(n - 1), 3000); };
  if (isMobile() && !isStandalone() && !lsGet(HOME_SEEN) && (first || isIOS())) setTimeout(() => guide(5), first ? 600 : 1500);
}
init();
