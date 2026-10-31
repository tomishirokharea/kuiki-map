/* =========================================================
   区域マップ：スペイン語の辞書の足し分（i18n-es-joukyou.js）／ Diccionario adicional (gráfico de tarjetas, 31/10/2026)
   ・i18n-es.js の「あと」に読み込みます（index.html の辞書の行）。
   ・係の「状況」の「区域カードと留守宅カード」のグラフ（joukyou-graph.js）で足した文。言葉は、アプリの今の用語にそろえています：
     会えた＝En casa／留守＝Ausente／拒否＝No visitar／訪ねた＝Visitadas
   ========================================================= */
window.KUIKI_I18N = window.KUIKI_I18N || {};
window.KUIKI_I18N.es = Object.assign(window.KUIKI_I18N.es || {}, {
"区域カードと留守宅カード": "Tarjetas de territorio y de ausentes",
"会衆全体の、日ごとの「訪ねた家の数」です。区域カードと留守宅カードで、どれだけ人に会えているかをくらべます。": "Número de casas visitadas por día en toda la congregación. Compara cuánta gente se encuentra con la tarjeta de territorio y con la tarjeta de ausentes.",
"直近30日": "Últimos 30 días",
"直近90日": "Últimos 90 días",
"1年": "1 año",
"訪ねた {0}軒・会えた {1}軒（{2}%）・留守 {3}軒・拒否 {4}軒": "Visitadas {0} · En casa {1} ({2}%) · Ausentes {3} · No visitar {4}",
"訪ねた {0}軒・会えた {1}軒（{2}%）・留守 {3}軒": "Visitadas {0} · En casa {1} ({2}%) · Ausentes {3}",
"訪ねた {0}軒・会えた {1}軒（データ少）・留守 {2}軒・拒否 {3}軒": "Visitadas {0} · En casa {1} (pocos datos) · Ausentes {2} · No visitar {3}",
"訪ねた {0}軒・会えた {1}軒（データ少）・留守 {2}軒": "Visitadas {0} · En casa {1} (pocos datos) · Ausentes {2}",
"訪ねた {0}軒・会えた {1}軒": "Visitadas {0} · En casa {1}",
"訪ねた {0}軒": "Visitadas {0}",
"区域カードの訪ねた数の棒グラフ。左右の矢印キーか、棒を押すと、その日の数が下に出ます": "Gráfico de barras de casas visitadas con tarjeta de territorio. Use las flechas izquierda y derecha o toque una barra para ver los números de ese día abajo",
"留守宅カードの訪ねた数の棒グラフ。左右の矢印キーか、棒を押すと、その日の数が下に出ます": "Gráfico de barras de casas visitadas con tarjeta de ausentes. Use las flechas izquierda y derecha o toque una barra para ver los números de ese día abajo",
"分けられません": "No separable",
"途中": "En curso",
"凡例": "Leyenda",
"会えた（塗りつぶし）": "En casa (relleno)",
"留守（斜線）": "Ausente (rayas)",
"拒否（点々）": "No visitar (puntos)",
"集まりのあった日": "Días con reunión",
"集まりのなかった日": "Días sin reunión",
"途中（今日をふくむ）": "En curso (incluye hoy)",
"棒を押すと、その日（週・月）の数が出ます。": "Toque una barra para ver los números de ese día (semana o mes).",
"集まり：": "Reunión:",
"集まりのあった日：": "Días con reunión:",
"区域カード：": "Tarjetas de territorio:",
"留守宅カード：": "Tarjeta de ausentes:",
"分けられない記録：": "Registros sin separar:",
"（途中の数です）": "(cifras parciales)",
"{0}グループ {1}": "Grupo {0} {1}",
"全体の集まり {0}": "Reunión general {0}",
"{0}月{1}日〜{2}月{3}日の週": "Semana del {1}/{0} al {3}/{2}",
"{0}月{1}日より前は、印のない記録を区域カードか留守宅カードか分けられません（斜めの網の部分）。印のある記録だけ棒に出ています。": "Antes del {1}/{0}, los registros sin marca no se pueden separar entre tarjeta de territorio y tarjeta de ausentes (zona rayada). Solo aparecen en las barras los registros con marca.",
"{0}月{1}日より前は、記録が整理されていて数が少なめです（訪問記録を残す期間：{2}か月）。": "Antes del {1}/{0} los registros ya se limpiaron y las cifras son menores (tiempo que se guardan las visitas: {2} meses).",
"くらべ（{0}）": "Comparación ({0})",
"集まりのあった日 {0}日・集まりのなかった日 {1}日。「会えた割合」は、会えた÷訪ねた です。": "Días con reunión: {0} · días sin reunión: {1}. El «porcentaje En casa» es En casa ÷ Visitadas.",
"集まりのあった日となかった日の会えた割合": "Porcentaje En casa en días con y sin reunión",
"訪ねた数が{0}軒未満の棒、{1}軒未満の表の欄は、割合を出しません（データ少）。": "Las barras con menos de {0} casas visitadas y las celdas de la tabla con menos de {1} no muestran porcentaje (pocos datos).",
"集計しています…": "Calculando…",
"集計しています": "Calculando",
"グラフを作れませんでした。": "No se pudo crear el gráfico.",
"直近30日の会えた割合：区域カード {0}": "Porcentaje En casa (últimos 30 días): tarjetas de territorio {0}",
"留守宅カード {0}": "tarjeta de ausentes {0}",
/* 更新のお知らせ（2026.13.111） */
"区域係の状況に、区域カードと留守宅カードの「会えた・留守」のグラフを足しました。": "En la situación del encargado de territorios se añadió el gráfico «En casa / Ausente» de la tarjeta de territorio y la tarjeta de ausentes."
});
