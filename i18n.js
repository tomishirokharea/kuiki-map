/* =========================================================
   区域マップ：言語の切りかえ（i18n.js）／ Mapa de Territorios: cambio de idioma

   しくみ
   ・アプリ本体（index.html）は日本語のまま。画面に出た日本語の文字を、辞書（i18n-es.js）で
     その場でスペイン語に置きかえる（本体のプログラムを変えずに、言語を足せるようにするため）
   ・日本語をえらんでいる人には、何もしない（速さは今までと同じ）
   ・言語は各自のスマホに保存する。歯車の設定と、はじめの登録画面で切りかえられる
   ・はじめの言語は config.js の lang（'ja' か 'es'）。URLに ?lang=es をつけると、その回だけ切りかわる
   ・辞書にない文字は日本語のまま出る。設定の「翻訳されていない文字をコピー」で集めて、辞書に足せる

   Cómo funciona
   ・La aplicación sigue escrita en japonés; este archivo traduce en pantalla con el diccionario i18n-es.js.
   ・El idioma se guarda en cada teléfono (Ajustes ⚙ o la pantalla de registro).
   ・Los textos sin traducir aparecen en japonés; en Ajustes se pueden copiar para completar el diccionario.
   ========================================================= */
(function () {
  'use strict';
  var CFG = window.KUIKI_CONFIG || {};
  var NS = (function () {
    var c = CFG.ns;
    if (typeof c === 'string' && c.trim()) return c.replace(/[^\w-]/g, '').slice(0, 20);
    return /test/i.test(location.pathname) ? 'test' : '';
  })();
  var KEY = (NS ? NS + '::' : '') + 'kuiki_lang';
  var NAMES = { ja: '日本語', es: 'Español' };
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { stored = null; }
  var urlLang = (location.search.match(/[?&]lang=(ja|es)\b/) || [])[1];
  var lang = urlLang || (stored && NAMES[stored] ? stored : '') || (CFG.lang === 'es' ? 'es' : 'ja');
  var DICT = (window.KUIKI_I18N || {})[lang];
  if (lang !== 'ja' && !DICT) lang = 'ja';

  var JP = /[\u3040-\u30ff\u3400-\u9fff]/; // ひらがな・カタカナ・漢字
  var MISSING = new Map(); // 翻訳されていない文字 → 出た回数
  var EXACT = new Map(), PATS = [], CACHE = new Map();
  var norm = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };

  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) { /* 何もしない */ }
    var u = new URL(location.href);
    u.searchParams.delete('lang');
    location.replace(u.pathname + u.search + u.hash);
  }

  /* 言語をえらぶボタン（設定の画面・はじめの登録画面に出す） */
  function picker(onJoin) {
    var btns = Object.keys(NAMES).map(function (k) {
      return '<button type="button" data-kilang="' + k + '" aria-pressed="' + (k === lang) + '">' + NAMES[k] + '</button>';
    }).join('');
    var miss = !onJoin && lang !== 'ja' && MISSING.size
      ? '<p class="hint"><button type="button" class="btn small" data-kimissing>Copiar textos sin traducir (' + MISSING.size + ')</button></p>' : '';
    return '<div class="kilang" data-notr>' + (onJoin ? '' : '<h3 class="sub feathead">言語 / Idioma</h3>') +
      '<div class="seg uiseg" role="group" aria-label="言語 / Idioma">' + btns + '</div>' + miss + '</div>';
  }
  function missingList() {
    return Array.from(MISSING.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (x) { return x[0]; });
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var b = t.closest('[data-kilang]');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      if (b.getAttribute('data-kilang') !== lang) setLang(b.getAttribute('data-kilang'));
      return;
    }
    var m = t.closest('[data-kimissing]');
    if (m) {
      e.preventDefault(); e.stopPropagation();
      var text = missingList().join('\n');
      var done = function () { m.textContent = 'Copiado (' + MISSING.size + ')'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copie:', text); });
      else { window.prompt('Copie:', text); }
    }
  }, true);

  window.KI = { lang: lang, names: NAMES, set: setLang, picker: picker, missing: missingList,
    t: function (s) { return lang === 'ja' ? s : (tr(s, 0) || s); } };

  if (lang === 'ja') return; // 日本語のときは、ここまで（何も置きかえない）

  /* ---------- 辞書を使える形にする ---------- */
  var UNIT = /^(年|月|日|時|分|秒|件|人|回|枚|軒|部屋|階|棟|か所|歳|代|倍|%|％)/;
  var reEsc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  Object.keys(DICT).forEach(function (k) {
    var v = DICT[k];
    if (typeof v !== 'string') return;
    var nk = norm(k);
    if (!/\{\d+\}/.test(nk)) { EXACT.set(nk, v); return; }
    var idx = [], lit = 0, parts = nk.split(/(\{\d+\})/);
    var src = '^' + parts.map(function (p, j) {
      var m = /^\{(\d+)\}$/.exec(p);
      if (m) {
        idx.push(Number(m[1]));
        // すぐ後ろが「月・日・件・人」などの単位なら、入るのは数字だけ（日付の型が文全体を飲みこまないように）
        var next = parts[j + 1] || '';
        return UNIT.test(next) ? '([0-9０-９.,:+\\-−–]+)' : '([\\s\\S]+?)';
      }
      lit += p.length;
      return reEsc(p);
    }).join('') + '$';
    if (!lit) return;
    try { PATS.push({ re: new RegExp(src), v: v, idx: idx, lit: lit }); } catch (e) { /* 何もしない */ }
  });
  PATS.sort(function (a, b) { return b.lit - a.lit; }); // くわしいものから先に

  function tr(s, depth) {
    if (!s || !JP.test(s)) return null;
    var n = norm(s);
    if (CACHE.has(n)) return CACHE.get(n);
    var r = EXACT.get(n);
    if (r === undefined) {
      r = null;
      for (var i = 0; i < PATS.length; i++) {
        var p = PATS[i], m = p.re.exec(n);
        if (!m) continue;
        // 入る中身に日本語があるときは、その中身も訳せるときだけ使う（半分だけ訳された文を出さないため）
        var ok = true;
        var out = p.v.replace(/\{(\d+)\}/g, function (_, k) {
          var pos = p.idx.indexOf(Number(k));
          var cap = pos >= 0 ? m[pos + 1] : '';
          if (!JP.test(cap)) return cap;
          var t = depth < 2 ? tr(cap, depth + 1) : null;
          if (t === null) { ok = false; return cap; }
          return t;
        });
        if (ok) { r = out; break; }
      }
      if (r === null && depth === 0 && n.length <= 300 && MISSING.size < 3000) MISSING.set(n, (MISSING.get(n) || 0) + 1);
    }
    if (CACHE.size > 30000) CACHE.clear();
    CACHE.set(n, r);
    return r;
  }

  /* ---------- 画面の文字を置きかえる ---------- */
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, INPUT: 1, SELECT: 0 };
  var skipEl = function (el) {
    return SKIP_TAGS[el.tagName] === 1 || el.hasAttribute('data-notr') || el.isContentEditable;
  };
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function doText(node) {
    var v = node.nodeValue;
    if (!v || !JP.test(v)) return;
    var t = tr(v, 0);
    if (t === null) return;
    var lead = /^\s*/.exec(v)[0], trail = /\s*$/.exec(v)[0];
    var out = lead + t + trail;
    if (out !== v) node.nodeValue = out;
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute(ATTRS[i]);
      if (a && JP.test(a)) { var t = tr(a, 0); if (t !== null && t !== a) el.setAttribute(ATTRS[i], t); }
    }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && JP.test(el.value)) {
      var tv = tr(el.value, 0); if (tv !== null) el.value = tv;
    }
  }
  var FILTER = {
    acceptNode: function (n) {
      if (n.nodeType === 1) return skipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    }
  };
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { var p = root.parentElement; if (p && !blocked(p)) doText(root); return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    if (root.parentElement && blocked(root.parentElement)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, FILTER), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function blocked(el) {
    return !!(el.closest && el.closest('script,style,textarea,noscript,[data-notr],[contenteditable="true"]'));
  }

  var mo = new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]); }
      else if (r.type === 'characterData') { var p = r.target.parentElement; if (p && !blocked(p)) doText(r.target); }
      else if (r.type === 'attributes' && r.target.nodeType === 1 && !blocked(r.target)) doAttrs(r.target);
    }
  });
  document.documentElement.lang = lang;
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.documentElement);
  document.addEventListener('DOMContentLoaded', function () {
    walk(document.body);
    var at = document.getElementById('appTitle');
    if (at && at.getAttribute('content') === '区域マップ') at.setAttribute('content', tr('区域マップ', 0) || 'Mapa');
  });

  /* スペイン語は日本語より長いので、ボタンなどが少しせまくならないようにする */
  var css = document.createElement('style');
  css.textContent = 'html[lang="es"] button, html[lang="es"] .btn { word-break: normal; overflow-wrap: normal; hyphens: manual; }' +
    'html[lang="es"] .tabs button { font-size: 12px; letter-spacing: -.01em; white-space: nowrap; }' +
    'html[lang="es"] .tl-long { display: none !important; }' +
    'html[lang="es"] #tabReco { font-size: 11px; }' +
    'html[lang="es"] #s13View button { font-size: .82em; padding-left: .45em; padding-right: .45em; }' +
    'html[lang="es"] h2::first-letter, html[lang="es"] h3::first-letter { text-transform: uppercase; }' +
    'html[lang="es"] .btn, html[lang="es"] button.choice { white-space: normal; height: auto; }' +
    '.kilang { margin: 0 0 14px; }';
  document.head.appendChild(css);
})();
