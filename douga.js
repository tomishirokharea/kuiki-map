/* =========================================================
   使い方の動画（douga.js）
   ・動画を足すときは、douga フォルダに mp4 と表紙の jpg を入れ、下の list の ready を true にします。
   ・mode：'simple'（簡単モードの人だけ）／'detail'（くわしいモードの人だけ）／'all'（両方）
   ・screen：その画面を初めて開いたときに「見る」を出す（'home'・'cards'・'map'・'apt'・'follow'・'reco'。null は出さない）
   ・need：その機能を使う人だけに出す（'follow'＝再訪問、'reco'＝おすすめ）
   ・file に es が無い動画は、スペイン語の画面では出ません。
   ・動画が1本も ready でないときは、カードもお知らせも設定の項目も、何も出ません。
   ・見た記録は、本人の端末の中だけに残ります（サーバー・係の画面には送りません）。
   ========================================================= */
var DOUGA = {
  base: 'douga/',
  first: { simple: 'start-simple', detail: 'start-detail' }, // ホームのカードで最初に流す動画
  practice: false, // 練習モードを入れたら true（第2段）
  list: [
    { id: 'start-simple',  mode: 'simple', sec: 45, screen: 'home',  t: { ja: '区域マップのはじめかた', es: '' }, file: { ja: 'start-simple-ja.mp4' }, poster: 'start-simple.jpg', ready: false },
    { id: 'take-simple',   mode: 'simple', sec: 45, screen: 'cards', t: { ja: '区域カードを受け取る' },      file: { ja: 'take-simple-ja.mp4' },   poster: 'take-simple.jpg',   ready: false },
    { id: 'record-simple', mode: 'simple', sec: 60, screen: 'map',   t: { ja: '家を記録する（会えた・留守・拒否）' }, file: { ja: 'record-simple-ja.mp4' }, poster: 'record-simple.jpg', ready: false },
    { id: 'apt-simple',    mode: 'simple', sec: 45, screen: 'apt',   t: { ja: 'アパートを記録する' },        file: { ja: 'apt-simple-ja.mp4' },    poster: 'apt-simple.jpg',    ready: false },
    { id: 'return-simple', mode: 'simple', sec: 30, screen: null,    t: { ja: '区域カードを返す' },          file: { ja: 'return-simple-ja.mp4' }, poster: 'return-simple.jpg', ready: false },
    { id: 'start-detail',  mode: 'detail', sec: 60, screen: 'home',  t: { ja: 'くわしい表示のはじめかた' },  file: { ja: 'start-detail-ja.mp4' },  poster: 'start-detail.jpg',  ready: false },
    { id: 'record-detail', mode: 'detail', sec: 60, screen: 'map',   t: { ja: '家を記録する（年代・再訪問まで）' }, file: { ja: 'record-detail-ja.mp4' }, poster: 'record-detail.jpg', ready: false },
    { id: 'add-detail',    mode: 'detail', sec: 45, screen: null,    t: { ja: '家・アパートを足す・直す' },  file: { ja: 'add-detail-ja.mp4' },    poster: 'add-detail.jpg',    ready: false },
    { id: 'away-detail',   mode: 'detail', sec: 45, screen: null,    t: { ja: '留守宅カードを受け取る' },    file: { ja: 'away-detail-ja.mp4' },   poster: 'away-detail.jpg',   ready: false },
    { id: 'together',      mode: 'all',    sec: 40, screen: null,    t: { ja: '一緒に回る' },                file: { ja: 'together-ja.mp4' },      poster: 'together.jpg',      ready: false },
    { id: 'follow',        mode: 'all',    sec: 45, screen: 'follow', need: 'follow', t: { ja: '再訪問を使う' }, file: { ja: 'follow-ja.mp4' }, poster: 'follow.jpg',     ready: false },
    { id: 'reco',          mode: 'detail', sec: 45, screen: 'reco',  need: 'reco', t: { ja: 'おすすめタブの見かた' }, file: { ja: 'reco-ja.mp4' },  poster: 'reco.jpg',          ready: false }
  ],
  ui: {
    ja: { title: '使い方の動画', hello: 'はじめての方へ', watch: '使い方を見る', more: 'ほかの使い方も見る', practice: '練習してみる', practiceNote: '本番の記録には入りません',
      later: '設定（歯車）の「使い方の動画」から、いつでも見られます', strip: 'この画面の使い方を動画で見られます', see: '見る',
      pause: '止める', play: '再生', slow: 'ゆっくり', normal: 'ふつうの速さ', sound: '音を出す', mute: '音を消す', close: '閉じる',
      again: 'もう一度', next: '次', offline: '電波のある所で、もう一度押してください', seen: '見ました', sec: '秒', min: '分',
      listNote: '音なしでも分かるように、字幕が入っています。', row: '使い方の動画' },
    es: { title: 'Videos de ayuda', hello: 'Para quienes empiezan', watch: 'Ver cómo se usa', more: 'Ver más videos', practice: 'Practicar', practiceNote: 'No se guarda en los registros reales',
      later: 'Puede verlos cuando quiera en Ajustes (engranaje) › «Videos de ayuda»', strip: 'Hay un video que explica esta pantalla', see: 'Ver',
      pause: 'Pausar', play: 'Reproducir', slow: 'Más lento', normal: 'Velocidad normal', sound: 'Activar sonido', mute: 'Silenciar', close: 'Cerrar',
      again: 'Otra vez', next: 'Siguiente', offline: 'Vuelva a intentarlo donde haya señal', seen: 'Visto', sec: ' s', min: ' min',
      listNote: 'Los videos tienen subtítulos, para entenderlos sin sonido.', row: 'Videos de ayuda' }
  }
};
window.DOUGA = DOUGA;

(function () {
  'use strict';

  /* ---------- 小さな道具 ---------- */
  var lang = function () { return window.KI && KI.lang === 'es' ? 'es' : 'ja'; };
  var T = function (k) { var u = DOUGA.ui[lang()] || {}; return u[k] != null && u[k] !== '' ? u[k] : DOUGA.ui.ja[k]; };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var q = function (s, r) { return (r || document).querySelector(s); };
  var ready = function () { return typeof Store !== 'undefined' && Store.data && typeof UI !== 'undefined'; };
  var simple = function () { return typeof isSimple === 'function' ? isSimple() : true; };
  var isPractice = function () { return /[?&]renshu=1(&|$)/.test(location.search); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var secText = function (s) { return s >= 60 ? Math.round(s / 60) + T('min') : s + T('sec'); };
  var KEY = 'kuiki_douga', USE_KEY = 'kuiki_use_days';

  /* ---------- 見た記録（この端末の中だけ） ---------- */
  var st = null;
  function load() {
    if (st) return st;
    var o = {};
    try { o = JSON.parse((typeof lsGet === 'function' && lsGet(KEY)) || '{}') || {}; } catch (e) { o = {}; }
    st = { seen: o.seen || {}, strip: o.strip || {}, card: o.card || null, sound: o.sound ? 1 : 0 };
    return st;
  }
  function save() { try { if (typeof lsSet === 'function') lsSet(KEY, JSON.stringify(st)); } catch (e) { /* 何もしない */ } }

  /* ---------- 使った日の数（アプリを開いた日） ---------- */
  var counted = false;
  function useDays() {
    var o = {};
    try { o = JSON.parse((typeof lsGet === 'function' && lsGet(USE_KEY)) || '{}') || {}; } catch (e) { o = {}; }
    return { n: Number(o.n) || 0, last: o.last || '' };
  }
  function count() {
    if (counted || !ready() || isPractice()) return;
    counted = true;
    var o = useDays(), t = today();
    if (o.last !== t) { o.n += 1; o.last = t; try { lsSet(USE_KEY, JSON.stringify(o)); } catch (e) { /* 何もしない */ } }
  }
  /* 使い始めの期間：設定「はじめの案内」に合わせる（auto＝使った日が3日目まで） */
  function period() {
    var g = typeof UI !== 'undefined' ? UI.guide : 'auto';
    if (g === 'off') return false;
    if (g === 'on') return true;
    count();
    return useDays().n <= 3;
  }

  /* ---------- 表示に使う動画の一覧 ---------- */
  function usable(v) {
    if (!v.ready) return false;
    if (!(v.file && v.file[lang()])) return false;
    var m = simple() ? 'simple' : 'detail';
    if (v.mode !== 'all' && v.mode !== m) return false;
    if (v.need === 'follow') return typeof featFollow === 'function' && featFollow();
    if (v.need === 'reco') { var tb = q('#tabReco'); return typeof recoOn === 'function' && recoOn() && !!tb && !tb.hidden; }
    return true;
  }
  function list() {
    if (!ready()) return [];
    return DOUGA.list.filter(usable);
  }
  function byId(id) { return list().filter(function (v) { return v.id === id; })[0] || null; }
  function titleOf(v) { return (v.t && (v.t[lang()] || v.t.ja)) || ''; }
  function firstVideo() {
    var L = list(), id = DOUGA.first[simple() ? 'simple' : 'detail'];
    return byId(id) || L[0] || null;
  }

  /* ---------- 見た目 ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#homeDouga:empty{display:none}' +
    '.dg-card{margin:10px 0 14px;padding:14px;background:var(--terr-soft,#E5F2EE);border:2px solid var(--line,#C8D2CD);border-radius:16px}' +
    '.dg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}' +
    '.dg-head b{font-size:19px;color:var(--ink,#17324D)}' +
    '.dg-x{position:relative;width:24px;height:24px;min-height:0;padding:0;border:0;border-radius:50%;background:#0000001a;color:var(--ink,#17324D);font:700 18px/24px system-ui,sans-serif;cursor:pointer;flex:none}' +
    '.dg-x::before{content:"";position:absolute;inset:-10px}' +
    '.dg-card .btn,.dg-set{margin-top:8px}' +
    '.dg-big{min-height:60px;font-size:20px}' +
    '.dg-note{margin:6px 0 0;font-size:14px;color:var(--ink2,#4A5F73);text-align:center}' +
    '.dg-set{min-height:56px;font-size:18px}' +
    '.dg-list{display:flex;flex-direction:column;gap:8px;margin:10px 0}' +
    '.dg-row{display:flex;align-items:center;gap:12px;width:100%;min-height:72px;padding:8px;border:2px solid var(--line,#C8D2CD);border-radius:12px;background:var(--paper,#fff);color:var(--ink,#17324D);text-align:left;font:inherit;cursor:pointer}' +
    '.dg-row:active{background:var(--terr-soft,#E5F2EE)}' +
    '.dg-row img,.dg-row .dg-noimg{width:96px;height:54px;border-radius:8px;object-fit:cover;background:#17324D22;flex:none}' +
    '.dg-row span{display:flex;flex-direction:column;gap:2px;font-size:18px;line-height:1.35}' +
    '.dg-row small{font-size:14px;color:var(--ink2,#4A5F73)}' +
    '#dougaBack{position:fixed;inset:0;background:#00000099;z-index:2599}' +
    '#dougaPop{position:fixed;left:0;right:0;bottom:0;z-index:2600;background:var(--paper,#fff);border-radius:20px 20px 0 0;max-height:94vh;max-height:94dvh;overflow:auto;' +
      'padding:12px 16px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px #0003;color:var(--ink,#17324D);overscroll-behavior:contain}' +
    '#dougaPop.snap{transition:transform .2s ease}' +
    '@media (min-width:760px){#dougaPop{left:calc(50% - 320px);right:auto;width:640px;bottom:16px;border-radius:20px}}' +
    '#dougaPop h2{font-size:21px;line-height:1.4;margin:2px 0 10px}' +
    '#dougaPop .dg-stage{position:relative;background:#000;border-radius:12px;overflow:hidden;display:flex;justify-content:center}' +
    '#dougaPop video{display:block;width:100%;max-height:60vh;max-height:60dvh;background:#000;object-fit:contain}' +
    '#dougaPop .dg-ctl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 4px}' +
    '#dougaPop .dg-ctl button{min-height:56px;font-size:17px;padding:6px 2px}' +
    '#dougaPop .dg-end{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:16px;background:#000000b3}' +
    '#dougaPop .dg-end[hidden]{display:none}' +
    '#dougaPop .dg-msg{padding:28px 16px;color:#fff;font-size:20px;line-height:1.6;text-align:center}' +
    '#dougaPop .btn{margin-top:8px}';
  document.head.appendChild(css);

  /* ---------- ホームの「はじめての方へ」カード ---------- */
  window.dougaHomeCard = function () {
    var box = q('#homeDouga'); if (!box) return;
    if (!ready() || isPractice()) { box.innerHTML = ''; return; }
    load(); count();
    var L = list();
    if (!L.length || !period() || st.card === 'closed') { box.innerHTML = ''; return; }
    var fv = firstVideo(), watchedFirst = fv && st.seen[fv.id];
    var big = watchedFirst
      ? '<button type="button" class="btn primary block dg-big" data-dg-more>' + escH(T('more')) + '</button>'
      : '<button type="button" class="btn primary block dg-big" data-dg-first>▶ ' + escH(T('watch')) + '（' + escH(secText(fv ? fv.sec : 45)) + '）</button>';
    var pr = DOUGA.practice
      ? '<button type="button" class="btn block" data-dg-practice>' + escH(T('practice')) + '</button><p class="dg-note">' + escH(T('practiceNote')) + '</p>' : '';
    box.innerHTML = '<div class="dg-card" role="region" aria-label="' + escH(T('hello')) + '" data-notr>' +
      '<div class="dg-head"><b>' + escH(T('hello')) + '</b><button type="button" class="dg-x" data-dg-close aria-label="' + escH(T('close')) + '">×</button></div>' + big + pr + '</div>';
  };

  /* ---------- その画面を初めて開いたときのお知らせ ---------- */
  var stripTimer = {};
  function blocked(name) {
    var h = function (s) { var e = q(s); return e && !e.hidden; };
    if (h('#askBox') || h('#news') || h('#hello') || h('#joinScreen') || h('#blocker') || h('#s13View')) return true;
    var sp = q('#splash'); if (sp && !sp.hidden && !sp.classList.contains('out')) return true;
    if (name !== 'apt' && h('#sheet')) return true; // アパートの入力は、シートの中の画面
    return !!q('#dougaPop:not([hidden])');
  }
  /* 地図：区域をえらんで、その区域の家の印が出ているか */
  function mapReady() {
    try {
      return typeof currentView === 'string' && currentView === 'map' && typeof selTerrId === 'function' && !!selTerrId() &&
        typeof houseLayer !== 'undefined' && houseLayer.getLayers().length > 0;
    } catch (e) { return false; }
  }
  function strip(name) {
    if (!ready() || isPractice()) return;
    load();
    if (st.strip[name]) return;
    var L = list().filter(function (v) { return v.screen === name; });
    if (!L.length) return;
    var viewOf = { cards: 'cards', map: 'map', apt: 'map', follow: 'follow', reco: 'reco' };
    if (name !== 'follow' && name !== 'reco' && !period()) return; // follow・reco は、期間に関係なく1回だけ
    var v = L.filter(function (x) { return !st.seen[x.id]; })[0];
    if (!v) { st.strip[name] = 1; save(); return; }
    if (stripTimer[name]) return; // もう待っているときは、振り出しに戻さない（地図は動くたびに呼ばれるため）
    stripTimer[name] = setTimeout(function () {
      stripTimer[name] = 0;
      if (typeof currentView !== 'undefined' && viewOf[name] && currentView !== viewOf[name]) return; // その間にほかの画面へ移った
      if (blocked(name) || st.strip[name]) return;
      if (name === 'map' && !mapReady()) return; // 待っている間に、区域をはずした・家の印が消えた
      st.strip[name] = 1; save();
      if (typeof toast === 'function') toast(T('strip') + '（' + secText(v.sec) + '）', null, { label: T('see'), fn: function () { play(v.id); } });
    }, 1200);
  }
  window.dougaStrip = strip;

  /* ---------- 設定（歯車）の「使い方の動画」と一覧 ---------- */
  window.dougaSettingsRow = function () {
    if (!ready() || isPractice() || !list().length) return '';
    return '<button type="button" class="btn block dg-set" data-dg-list data-notr>▶ ' + escH(T('row')) + '</button>';
  };
  function openList() {
    var L = list(); if (!L.length || typeof setSheet !== 'function') return;
    load();
    var rows = L.map(function (v) {
      var img = v.poster ? '<img src="' + escH(DOUGA.base + v.poster) + '" alt="" loading="lazy" width="96" height="54">' : '<span class="dg-noimg"></span>';
      return '<button type="button" class="dg-row" data-dg-play="' + escH(v.id) + '">' + img +
        '<span><b>' + escH(titleOf(v)) + '</b><small>' + escH(secText(v.sec)) + (st.seen[v.id] ? '　✓' + escH(T('seen')) : '') + '</small></span></button>';
    }).join('');
    var pr = DOUGA.practice
      ? '<button type="button" class="btn block" data-dg-practice>' + escH(T('practice')) + '</button><p class="dg-note">' + escH(T('practiceNote')) + '</p>' : '';
    setSheet('<h2 id="sheetTitle">' + escH(T('title')) + '</h2><p class="muted">' + escH(T('listNote')) + '</p>' +
      '<div class="dg-list" data-notr>' + rows + '</div>' + pr +
      '<button type="button" class="btn block" data-close>' + escH(T('close')) + '</button>');
  }

  /* ---------- 再生の画面（#dougaPop） ---------- */
  var pop = null, back = null, cur = null, vid = null, rate = 1, lastFocus = null;
  function stopVideo() {
    if (vid) { try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (e) { /* 何もしない */ } }
    vid = null;
  }
  function closePop() {
    if (!pop || pop.hidden) return;
    stopVideo();
    pop.hidden = true; back.hidden = true; pop.style.transform = ''; pop.innerHTML = ''; cur = null;
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* 何もしない */ } }
  }
  function build() {
    back = document.createElement('div'); back.id = 'dougaBack'; back.hidden = true; back.setAttribute('data-notr', '');
    pop = document.createElement('div'); pop.id = 'dougaPop'; pop.hidden = true;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-labelledby', 'dougaTitle'); pop.setAttribute('data-notr', '');
    document.body.appendChild(back); document.body.appendChild(pop);
    back.addEventListener('click', closePop);
    /* 下にスワイプで閉じる（90px） */
    var y0 = null, dy = 0;
    pop.addEventListener('touchstart', function (e) {
      if (pop.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; pop.classList.remove('snap');
    }, { passive: true });
    pop.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) pop.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    pop.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null;
      if (dy > 90) { closePop(); return; }
      pop.classList.add('snap'); pop.style.transform = '';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop && !pop.hidden) { e.stopPropagation(); closePop(); } }, true);
    document.addEventListener('visibilitychange', function () { if (document.hidden && vid) { try { vid.pause(); } catch (e) { /* 何もしない */ } } });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { if (e.target.closest('video')) togglePlay(); return; }
      if (b.hasAttribute('data-dg-pop-close')) closePop();
      else if (b.hasAttribute('data-dg-pp')) togglePlay();
      else if (b.hasAttribute('data-dg-slow')) { rate = rate === 1 ? 0.75 : 1; if (vid) vid.playbackRate = rate; refreshCtl(); }
      else if (b.hasAttribute('data-dg-snd')) { if (vid) { vid.muted = !vid.muted; st.sound = vid.muted ? 0 : 1; save(); } refreshCtl(); }
      else if (b.hasAttribute('data-dg-again')) { var id = cur && cur.id; if (id) play(id); }
      else if (b.hasAttribute('data-dg-next')) { play(b.getAttribute('data-dg-next')); }
    });
  }
  function togglePlay() {
    if (!vid) return;
    if (vid.paused) { var p = vid.play(); if (p && p.catch) p.catch(function () { /* 何もしない */ }); } else vid.pause();
  }
  function refreshCtl() {
    if (!pop || !vid) return;
    var pp = q('[data-dg-pp]', pop), sl = q('[data-dg-slow]', pop), sn = q('[data-dg-snd]', pop);
    if (pp) pp.textContent = vid.paused ? '▶ ' + T('play') : '❚❚ ' + T('pause');
    if (sl) sl.textContent = rate === 1 ? T('slow') : T('normal');
    if (sn) sn.textContent = vid.muted ? '🔊 ' + T('sound') : '🔇 ' + T('mute');
  }
  function showError() {
    var stage = q('.dg-stage', pop); if (!stage) return;
    stopVideo();
    stage.innerHTML = '<div class="dg-msg">' + escH(T('offline')) + '</div>';
    var ctl = q('.dg-ctl', pop); if (ctl) ctl.hidden = true;
  }
  function play(id) {
    load();
    var v = byId(id); if (!v) return;
    if (!pop) build();
    stopVideo();
    if (pop.hidden) lastFocus = document.activeElement;
    cur = v; rate = 1;
    var L = list(), i = L.indexOf(v), nx = L[i + 1] || null;
    pop.innerHTML = '<span class="grab" aria-hidden="true"></span>' +
      '<h2 id="dougaTitle" tabindex="-1">' + escH(titleOf(v)) + '　' + escH(secText(v.sec)) + '</h2>' +
      '<div class="dg-stage"><video playsinline muted preload="metadata"' + (v.poster ? ' poster="' + escH(DOUGA.base + v.poster) + '"' : '') + '></video>' +
        '<div class="dg-end" hidden><button type="button" class="btn block" data-dg-again>' + escH(T('again')) + '</button>' +
        (nx ? '<button type="button" class="btn primary block" data-dg-next="' + escH(nx.id) + '">' + escH(T('next')) + '：' + escH(titleOf(nx)) + ' ▶</button>' : '') + '</div></div>' +
      '<div class="dg-ctl"><button type="button" class="btn" data-dg-pp>❚❚ ' + escH(T('pause')) + '</button>' +
        '<button type="button" class="btn" data-dg-slow>' + escH(T('slow')) + '</button>' +
        '<button type="button" class="btn" data-dg-snd>🔊 ' + escH(T('sound')) + '</button></div>' +
      '<button type="button" class="btn block" data-dg-pop-close>' + escH(T('close')) + '</button>';
    pop.style.transform = '';
    pop.hidden = false; back.hidden = false; pop.scrollTop = 0;
    var h = q('h2', pop); if (h) h.focus({ preventScroll: true });
    if (navigator.onLine === false) { showError(); return; }
    vid = q('video', pop);
    vid.muted = !st.sound; // 音なしで始める（前に「音を出す」にした人は、音ありで始める）
    vid.addEventListener('play', refreshCtl); vid.addEventListener('pause', refreshCtl); vid.addEventListener('volumechange', refreshCtl);
    vid.addEventListener('error', showError);
    vid.addEventListener('ended', function () {
      st.seen[v.id] = today(); save();
      var en = q('.dg-end', pop); if (en) en.hidden = false;
      if (q('#homeDouga') && typeof dougaHomeCard === 'function') dougaHomeCard();
    });
    vid.src = DOUGA.base + v.file[lang()];
    var p = vid.play();
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === 'NotAllowedError') { vid.muted = true; var p2 = vid.play(); if (p2 && p2.catch) p2.catch(function () { /* 何もしない */ }); return; }
      if (err && err.name === 'AbortError') return;
      showError();
    });
    refreshCtl();
  }
  window.dougaPlay = play;

  /* ---------- ボタンの受け口（画面が描き直されても効くように、まとめて受ける） ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-dg-first],[data-dg-more],[data-dg-close],[data-dg-list],[data-dg-play],[data-dg-practice]');
    if (!b) return;
    e.preventDefault();
    load();
    if (b.hasAttribute('data-dg-first')) { var fv = firstVideo(); if (fv) play(fv.id); }
    else if (b.hasAttribute('data-dg-more') || b.hasAttribute('data-dg-list')) openList();
    else if (b.hasAttribute('data-dg-play')) play(b.getAttribute('data-dg-play'));
    else if (b.hasAttribute('data-dg-practice')) { if (typeof window.dougaGoPractice === 'function') window.dougaGoPractice(); }
    else if (b.hasAttribute('data-dg-close')) {
      st.card = 'closed'; save();
      var box = q('#homeDouga'); if (box) box.innerHTML = '';
      if (typeof toast === 'function') toast(T('later'));
    }
  });

  /* ---------- 画面を開いたときに呼ぶ（既存の関数を包む） ---------- */
  function hook() {
    if (typeof window.showView === 'function' && !window.showView.__dg) {
      var sv = window.showView;
      window.showView = function () {
        var r = sv.apply(this, arguments);
        try {
          var n = typeof currentView === 'string' ? currentView : arguments[0];
          if (n === 'cards' || n === 'follow' || n === 'reco') strip(n);
        } catch (e) { /* 何もしない */ }
        return r;
      };
      window.showView.__dg = 1;
    }
    /* 地図：区域をえらんで、家の印が出たとき（地図のタブを開いただけでは出さない） */
    if (typeof window.renderHouses === 'function' && !window.renderHouses.__dg) {
      var rh = window.renderHouses;
      window.renderHouses = function () {
        var r = rh.apply(this, arguments);
        try {
          if (st && st.strip && st.strip.map) return r;
          if (mapReady()) strip('map');
        } catch (e) { /* 何もしない */ }
        return r;
      };
      window.renderHouses.__dg = 1;
    }
    /* アパートの「続けて入力」の画面を初めて開いたとき */
    if (typeof window.openAptSeq === 'function' && !window.openAptSeq.__dg) {
      var oa = window.openAptSeq;
      window.openAptSeq = function () {
        var r = oa.apply(this, arguments);
        try { strip('apt'); } catch (e) { /* 何もしない */ }
        return r;
      };
      window.openAptSeq.__dg = 1;
    }
  }
  hook();
  /* 地図は、動いたあとの描き直しに元の関数を直接つないでいるので、動き終わりの合図でも確かめる */
  var mapHooked = false;
  function hookMap() {
    if (mapHooked || typeof map === 'undefined' || !map || typeof map.on !== 'function') return;
    mapHooked = true;
    map.on('moveend', function () { try { if (!(st && st.strip && st.strip.map) && mapReady()) strip('map'); } catch (e) { /* 何もしない */ } });
  }
  hookMap();

  /* アプリが使える状態になったら、使った日を数える（最長60秒待つ） */
  var tries = 0, wait = setInterval(function () {
    hookMap();
    if (ready()) { clearInterval(wait); hookMap(); load(); count(); if (typeof dougaHomeCard === 'function' && typeof currentView === 'string' && currentView === 'home') dougaHomeCard(); }
    else if (++tries > 60) clearInterval(wait);
  }, 1000);
})();
