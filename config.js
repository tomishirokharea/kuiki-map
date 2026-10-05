// =====================================================================
// 区域マップの設定ファイル ／ Archivo de configuración
// 会衆ごとに、ここだけを書きかえます。 / Solo se edita este archivo.
// =====================================================================
window.KUIKI_CONFIG = {
  // ① GAS の「ウェブアプリのURL」を '' の中に貼り付けます。空のままだと試作モード（その端末だけに保存）で動きます。
  //    Pegue entre las comillas la URL de la aplicación web de Apps Script. Vacío = modo de prueba (solo en ese teléfono).
  //    例 / Ejemplo: apiUrl: 'https://script.google.com/macros/s/xxxxxxxx/exec'
  apiUrl: 'https://script.google.com/macros/s/AKfycbxMThstsm7d2fe-lOMBtJmkGBXTKiGTc-lntyMRTlN7nSMkftRhESHqY0cafqT7IsNT/exec',

  // ② はじめに表示する言語：'ja'（日本語）または 'es'（スペイン語）。各自が設定（歯車）で切りかえられます。
  //    Idioma inicial: 'ja' (japonés) o 'es' (español). Cada persona puede cambiarlo en Ajustes (⚙).
  lang: 'ja',

  // ③ 区域がまだ無いときに地図が開く場所 [緯度, 経度] と拡大の度合い（10＝沖縄本島が見えるくらい）
  //    Lugar donde se abre el mapa si aún no hay territorios [latitud, longitud] y nivel de zoom (10 ≈ toda la isla de Okinawa)
  homeView: [26.33, 127.80],
  homeZoom: 10,

  // ④ 年齢データ（e-Stat 国勢調査の小地域集計）を使う。区域係の「設定・データ」に年齢データの画面が出ます
  //    Usar datos de edad del censo (e-Stat). Aparece la pantalla de datos de edad en «Ajustes y datos» del encargado.
  ageData: true
};
