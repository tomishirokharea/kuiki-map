/* =========================================================
   区域マップ：スペイン語の辞書の足し分（i18n-es-tenken.js）／ Diccionario adicional (revisión antes de la prueba)
   ・i18n-es.js の「あと」に読み込みます（index.html の辞書の行）。
   ・試験運用前の点検（2026-10-24）で直したところの文：受け付けられなかった変更の名前、送れなかった記録、
     iPhone の「ホーム画面に追加」（iOS 26）、集合住宅の部屋の前回の結果、簡単モードの区域カードなど
   ========================================================= */
window.KUIKI_I18N = window.KUIKI_I18N || {};
window.KUIKI_I18N.es = Object.assign(window.KUIKI_I18N.es || {}, {
"返却の記録": "Registro de devolución",
"拒否の印": "Marca de «No visitar»",
"注意の印": "Marca de aviso",
"再訪問の引き継ぎ": "Traspaso de revisita",
"集まりの予定": "Programa de reuniones",
"年齢のデータ": "Datos de edad",
"ほかの変更": "Otros cambios",
"前に送れなかった記録を送ります（{0}件）": "Se enviarán los registros que no se pudieron enviar antes ({0})",
"区域係がこのスマホの登録を外したか、リンクが作り直されました。区域の情報は、このスマホから消しました。もう一度使うときは、区域係からもらったリンクを開いてください。まだ送っていない記録（{0}件）は、7日のあいだ取っておきます。区域係からもらった新しいリンクを開くと、送ります。": "El encargado quitó el registro de este teléfono o se renovó el enlace. Se borró la información de los territorios de este teléfono. Para volver a usarlo, abra el enlace que le dé el encargado. Los registros que aún no se enviaron ({0}) se guardan durante 7 días. Al abrir el nuevo enlace del encargado, se enviarán.",
"画面の下の右にある「…」を押します。": "Toque «…» abajo a la derecha de la pantalla.",
"「共有」を押します。": "Toque «Compartir».",
"共有": "Compartir",
"ホーム画面に追加": "Agregar a inicio",
"スマホの時刻がずれています。スマホの設定で、日付と時刻を「自動」にしてください": "La hora del teléfono no es correcta. En los ajustes del teléfono, ponga la fecha y la hora en «Automático»",
"「その他」を押して、「ホーム画面に追加」を押します。": "Toque «Más» y luego «Agregar a inicio».",
"見つからないときは、出てきたメニューを上に動かします。": "Si no lo encuentra, deslice hacia arriba el menú que aparece.",
"「その他」の中にあることもあります。": "También puede estar dentro de «Más».",
"{0}号室へ": "Ir a la habitación {0}",
"{0}号室（前回 {1}）へ": "Ir a la habitación {0} (última vez: {1})",
"あと": "Faltan",
"返す": "Devolver",
"返す目安：{0}": "Devolver antes de: {0}",
"機能をふやす": "Más funciones",
"最初の数日だけ": "Solo los primeros días",
"はじめの案内（使い方の動画のお知らせなど）": "Guía inicial (avisos de los videos de uso, etc.)",
"かんたんな表示で、記録のあとの「取り消す」を大きく、長め（12秒）に出すようにしました": "En la vista sencilla, el botón «Anular» después de registrar ahora es más grande y se muestra más tiempo (12 segundos)",
"集合住宅で部屋を押したり記録したりしたとき、「会えた・留守」のボタンがいつも見えるようにしました。部屋は階ごとに分け、前回の結果を「会・留・拒」の字でも出します": "En los edificios, al tocar o registrar una habitación, los botones «En casa / Ausente» ahora siempre quedan a la vista. Las habitaciones se agrupan por piso y el resultado anterior también se muestra con letras («会・留・拒»)",
"かんたんな表示の区域カードに「地図をひらく」ボタンを付けました": "En la vista sencilla, las tarjetas de territorio ahora tienen el botón «Abrir mapa»",
"iPhone（iOS 26）の「ホーム画面に追加」の手順を、新しい画面に合わせました": "Se actualizaron los pasos para «Agregar a inicio» en iPhone (iOS 26)",
"安全と記録の正確さのための見直しをしました（電波が弱い所で返却したときに出ていた「受け付けられませんでした」のお知らせなど）": "Se hicieron ajustes de seguridad y de exactitud de los registros (por ejemplo, el aviso «No se aceptó» que aparecía al devolver con mala señal)",
/* 2026.13.66：途中の返却・持てる枚数に届いているとき・地図の目印の取りこみ */
"途中で返却する": "Devolver sin terminar",
"区域を返すと、またもらえます。": "Cuando devuelva un territorio, podrá recibir otro.",
"{0}件を取りこみました（サーバーが外したもの {1}件）": "Se importaron {0} (el servidor descartó {1})",
"{0}件を取りこみました。同じ目印がもうあった{1}件は、足していません": "Se importaron {0}. {1} ya existían y no se agregaron",
"{0}件を取りこみました。同じ目印がもうあった{1}件は、足していません（サーバーが外したもの {2}件）": "Se importaron {0}. {1} ya existían y no se agregaron (el servidor descartó {2})",
/* 2026.13.67：簡単モードのホーム・留守宅カードをえらぶ・地図（10/09 の指示書の第4段） */
"次の集まり": "Próxima reunión",
"{0}（〜11時）": "{0} (hasta las 11)",
"{0}（11〜14時）": "{0} (de 11 a 14 h)",
"{0}（14〜17時）": "{0} (de 14 a 17 h)",
"{0}（17〜19時）": "{0} (de 17 a 19 h)",
"{0}（19時〜）": "{0} (desde las 19)",
"予定はまだありません": "Todavía no hay reuniones programadas",
"持っている区域カードはありません。": "No tiene tarjetas de territorio.",
"これからの予定": "Próximas reuniones",
"カレンダーで見る": "Ver en el calendario",
"カレンダーを閉じる": "Cerrar el calendario",
"訪ねた家": "Casa visitada",
"最近会えた家": "Casa con contacto reciente",
"右下の「?」を押すと、印の見かたと「返す」ボタンが出ます": "Toque «?» abajo a la derecha para ver el significado de las marcas y el botón «Devolver»",
"かんたんな表示のホームに、次の集まりと「あなたの区域カード」を大きく出すようにしました。カレンダーは「カレンダーで見る」で開きます": "En la vista sencilla, el inicio ahora muestra en grande la próxima reunión y «Su tarjeta de territorio». El calendario se abre con «Ver en el calendario»",
"かんたんな表示の地図に「区域○　あと○軒」の帯を出し、地図は回らないようにしました。留守宅カードをえらぶ画面も見やすくしました": "En la vista sencilla, el mapa muestra una franja «Territorio ○ · Faltan ○ casas» y ya no gira. También se simplificó la pantalla para elegir tarjetas de casas ausentes"
});
