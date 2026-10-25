/* 区域マップ：画面の骨組みの前に動かすもの（app-head.js。以前は index.html の中に直接書いていた・改善案C1） */
/* ほかのサイトの中に埋め込まれたときは、表示しない（GitHub Pages は見出しで埋め込みを止められないため） */
(function () {
  if (window.self === window.top) return;
  document.documentElement.style.visibility = 'hidden';
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* 埋め込み先が止めている：表示しないまま */ }
})();
/* iPhoneのホーム画面アプリで、下のタブの下に空白が出ることがある（iOSが画面の高さを、上の時刻の帯の分だけ短く伝えるため）。
   ホーム画面から開いたiPhoneだけ、画面の本当の高さで骨組みをつくる。ほかの端末やブラウザでは何もしない */
(function () {
  var ua = navigator.userAgent || '';
  var standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!standalone || !/iPhone|iPod/.test(ua)) return;
  var root = document.documentElement;
  function fit() {
    var sw = screen.width, sh = screen.height, land = window.innerWidth > window.innerHeight;
    var full = land ? Math.min(sw, sh) : Math.max(sw, sh);
    var h = Math.max(window.innerHeight, full);
    root.style.setProperty('--app-h', h + 'px');
    root.style.setProperty('--app-gap', Math.max(0, h - window.innerHeight) + 'px'); // 下に出る画面も、本当の下はしまでのばす
    root.classList.add('fixh');
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 300); });
  window.addEventListener('pageshow', fit);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(fit, 100); });
})();
