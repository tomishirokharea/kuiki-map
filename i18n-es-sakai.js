/* =========================================================
   区域マップ：スペイン語の辞書の足し分（i18n-es-sakai.js）／ Diccionario adicional (límite de la congregación, 18/11/2026)
   ・sakai.js（会衆の境：S-54「会衆の区域割り当て」）の画面の文です。i18n-es-obi.js の「あと」、i18n.js の「前」に読み込みます。
   ・数の入る文は「型」の辞書（{0}）で訳します
   ========================================================= */
window.KUIKI_I18N = window.KUIKI_I18N || {};
window.KUIKI_I18N.es = Object.assign(window.KUIKI_I18N.es || {}, {
/* 区域の線・取り込み（torikomi.js）の2項目 */
"境": "Lím.",
"会衆の境（S-54）": "Límite de la congregación (S-54)",
"会衆の区域割り当て（S-54）のKMLから、会衆の境を地図に出します。区域は変わりません": "Muestra en el mapa el límite de la congregación a partir del KML de la «Asignación de territorio de la congregación» (S-54). Los territorios no cambian.",
"今：{0}（{1}）": "Ahora: {0} ({1})",
"今：{0}": "Ahora: {0}",
"会衆の境を消す": "Borrar el límite de la congregación",
"地図の境の線を消します。区域は変わりません": "Borra la línea del límite en el mapa. Los territorios no cambian.",
/* 確認の画面 */
"会衆の境を取り込む": "Importar el límite de la congregación",
"会衆の境にする": "Usar como límite de la congregación",
"最終更新": "Última actualización",
"東": "E",
"南": "S",
"西": "O",
"点の数": "Número de puntos",
"広さ": "Superficie",
"{0}点": "{0} puntos",
"約{0} km²": "Aprox. {0} km²",
"点の数が多いので、形を少しなめらかにしました（{0}点 → {1}点）": "Había demasiados puntos, así que se suavizó un poco la forma ({0} puntos → {1} puntos).",
"S-54 のファイルではないかもしれません（区域の線が{0}本あります）": "Quizá no sea un archivo S-54 (tiene {0} líneas de territorio).",
"S-54 のファイルではないかもしれません（区域の線が1本あります）": "Quizá no sea un archivo S-54 (tiene 1 línea de territorio).",
"区域の線が多すぎて、会衆の境にはできません（会衆の境は20本までです）": "Hay demasiadas líneas, así que no se puede usar como límite de la congregación (máximo 20).",
"日本のまわりの場所ではないので、会衆の境にはできません": "No está en la zona de Japón, así que no se puede usar como límite de la congregación.",
"今の会衆の境は、このファイルのものに置きかわります。区域は変わりません。": "El límite actual se reemplazará por el de este archivo. Los territorios no cambian.",
/* 取り込めないとき・できたとき */
"サーバーを更新してから取り込んでください": "Actualice el servidor antes de importar.",
"ファイルを読み込めませんでした": "No se pudo leer el archivo",
"S-54「会衆の区域割り当て」のKML（またはKMZ）のファイルを選んでください。KMZのときは、インターネットにつながっている必要があります。": "Elija el archivo KML (o KMZ) de la «Asignación de territorio de la congregación» (S-54). Para un KMZ se necesita conexión a internet.",
"会衆の境が見つかりませんでした": "No se encontró el límite de la congregación",
"このファイルには地図の中身が入っていません。「ネットワーク リンク」を外して、もう一度書き出してください。": "Este archivo no contiene el contenido del mapa. Quite «Enlace de red» y vuelva a exportarlo.",
"このファイルには、境（面）の線がありません。S-54「会衆の区域割り当て」のKMLを選んでください。": "Este archivo no tiene líneas de límite (polígonos). Elija el KML de la «Asignación de territorio de la congregación» (S-54).",
"会衆の境を取り込みました": "Se importó el límite de la congregación",
/* 消す */
"会衆の境を消しますか？": "¿Borrar el límite de la congregación?",
"地図の境の線を消します。区域は変わりません。": "Se borrará la línea del límite en el mapa. Los territorios no cambian.",
"会衆の境を消しました": "Se borró el límite de la congregación",
"区域係だけが使えます": "Solo lo puede usar el encargado de territorios",
/* お知らせ（2026.13.160・app.js の CHANGELOG） */
"地図に、会衆の境を灰色の破線で出すようにしました（区域係が取り込んだとき）。区域の線とは別の線で、押してもえらばれません。": "El mapa ahora muestra el límite de la congregación con una línea gris discontinua (cuando el encargado de territorios lo importa). Es una línea aparte de las de los territorios y no se puede seleccionar al tocarla.",
"区域係：「区域の線・取り込み」で、会衆の区域割り当て（S-54）のKMLから会衆の境を取り込めます。": "Encargado de territorios: en «Límites e importación» puede importar el límite de la congregación desde el KML de la «Asignación de territorio de la congregación» (S-54).",
"区域係：「全部の区域のすき間・重なりを調べる」で、会衆の境の中で、どの区域にも入っていない所（取りこぼし）も出ます。": "Encargado de territorios: «Buscar huecos y superposiciones en todos los territorios» también muestra las zonas dentro del límite de la congregación que no están en ningún territorio (sin territorio).",
/* 取りこぼし（kyoukai.js の「全部の区域のすき間・重なりを調べる」） */
"取りこぼし {0}か所": "Sin territorio: {0}",
"すき間 {0}か所": "Huecos: {0}",
"すき間 {0}か所・": "Huecos: {0} · ",
"重なり {0}か所": "Superposiciones: {0}",
"{0}/{1}：境の中で、どの区域にも入っていない所（{2}・家の印 {3}軒）": "{0}/{1}: zona dentro del límite que no está en ningún territorio ({2} · casas marcadas: {3})",
"{0}/{1}：境の中で、どの区域にも入っていない所（{2}・家の印 {3}軒）。家の印はありません。地図で、家があるかを見てください": "{0}/{1}: zona dentro del límite que no está en ningún territorio ({2} · casas marcadas: {3}). No hay casas marcadas. Mire en el mapa si hay casas.",
"新しい区域の線を引く": "Dibujar un territorio nuevo",
"とばす": "Omitir",
"細い所・小さい所（境とのずれなど）{0}か所・約{1}は出していません": "Zonas estrechas o pequeñas no mostradas (desfases con el límite, etc.): {0}, aprox. {1}",
"すき間・重なり・取りこぼしが {0}か所 見つかりました": "Huecos, superposiciones o zonas sin territorio encontrados: {0}",
"赤い所が、すき間・重なり・取りこぼしです。赤い「！」をタップすると、直し方をえらべます。": "Lo rojo son huecos, superposiciones y zonas sin territorio. Toque el «！» rojo para elegir cómo corregirlo.",
"残りの所はありません。とばした所は、もう一度調べると出ます。": "No queda nada más. Las zonas omitidas volverán a aparecer al buscar de nuevo.",
"取りこぼしを区域{0}に入れました": "Se agregó la zona sin territorio al territorio {0}"
});
