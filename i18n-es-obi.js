/* =========================================================
   区域マップ：スペイン語の辞書の足し分（i18n-es-obi.js）／ Diccionario adicional (servicio de todos, 17/11/2026)
   ・i18n-es.js の「あと」に読み込みます（index.html の辞書の行）。
   ・毎日はじめのひと言に出る「みんなの奉仕」の文（obi.js・S1〜S7）と、係の設定・お知らせの文
   ・数の入る文は「型」の辞書（{0}）で訳す（i18n.js の KI.t）。「1軒」のときは単数の形を別に置く（長い型が先に当たる）
   ・時間帯（土日の夕方など）は i18n-es.js の訳を使う
   ========================================================= */
window.KUIKI_I18N = window.KUIKI_I18N || {};
window.KUIKI_I18N.es = Object.assign(window.KUIKI_I18N.es || {}, {
/* 印・設定 */
"みんなの奉仕": "Servicio de todos",
"みんなの奉仕のひと言": "Frase del servicio de todos",
"毎日はじめのひと言に、会衆のみんなの奉仕の記録から出る文を出すかどうかです。出さないにすると、いつものひと言だけになります": "Si en la «Frase al empezar el día» sale una frase con los registros de predicación de toda la congregación. Si elige «No usar», solo sale la frase de siempre.",
"その日はじめて開いたときに、ひと言・今日の目標を出します。ひと言は、会衆のみんなの奉仕の記録から出す日もあります（まわりをさわると閉じます）": "La primera vez que abre cada día, muestra una frase y la meta del día. Algunos días la frase sale de los registros de predicación de toda la congregación (toque alrededor para cerrar).",
/* お知らせ */
"毎日はじめのひと言に、会衆のみんなの奉仕の記録から、ひと言が出る日があります。": "En la frase al empezar el día, algunos días sale una frase con los registros de predicación de toda la congregación.",
"設定にみんなの奉仕のひと言（使う／使わない）。": "En Ajustes, «Frase del servicio de todos» (Usar / No usar).",
/* S1 先週・留守だった家 */
"先週は留守だった家を訪ねる努力が払われ、{0}軒中、{1}軒の方にお会いできました。": "La semana pasada se hizo el esfuerzo de volver a visitar casas donde antes no había nadie, y se pudo hablar con alguien en {1} de {0} casas.",
"先週は留守だった家を訪ねる努力が払われ、1軒中、1軒の方にお会いできました。": "La semana pasada se hizo el esfuerzo de volver a visitar una casa donde antes no había nadie, y se pudo hablar con alguien.",
"先週は留守だった家を{0}軒訪ねる努力が払われました。": "La semana pasada se hizo el esfuerzo de volver a visitar {0} casas donde antes no había nadie.",
"先週は留守だった家を1軒訪ねる努力が払われました。": "La semana pasada se hizo el esfuerzo de volver a visitar una casa donde antes no había nadie.",
/* S2 先週・時間帯を変えて */
"先週は時間帯を変えて訪ねる努力が払われ、{0}軒中、{1}軒の方にお会いできました。": "La semana pasada se hizo el esfuerzo de volver a visitar en otro horario, y se pudo hablar con alguien en {1} de {0} casas.",
"先週は時間帯を変えて訪ねる努力が払われ、1軒中、1軒の方にお会いできました。": "La semana pasada se hizo el esfuerzo de volver a visitar una casa en otro horario, y se pudo hablar con alguien.",
"先週は時間帯を変えて{0}軒を訪ねる努力が払われました。": "La semana pasada se hizo el esfuerzo de volver a visitar {0} casas en otro horario.",
"先週は時間帯を変えて1軒を訪ねる努力が払われました。": "La semana pasada se hizo el esfuerzo de volver a visitar una casa en otro horario.",
/* S3 きのう */
"きのうは{0}軒を訪ねる努力が払われ、{1}軒の方にお会いできました。": "Ayer se hizo el esfuerzo de visitar {0} casas, y se pudo hablar con alguien en {1} de ellas.",
"きのうは1軒を訪ねる努力が払われ、1軒の方にお会いできました。": "Ayer se hizo el esfuerzo de visitar una casa, y se pudo hablar con alguien.",
"きのうは{0}軒を訪ねる努力が払われました。": "Ayer se hizo el esfuerzo de visitar {0} casas.",
"きのうは1軒を訪ねる努力が払われました。": "Ayer se hizo el esfuerzo de visitar una casa.",
/* S4 先週・個人の区域カードや留守宅カード */
"先週は、個人の区域カードや留守宅カードで、{0}軒の方に真理に接する機会が差し伸べられました。": "La semana pasada, con las tarjetas de territorio personales y las tarjetas de ausentes, se ofreció la oportunidad de conocer la verdad a las personas de {0} casas.",
"先週は、個人の区域カードや留守宅カードで、1軒の方に真理に接する機会が差し伸べられました。": "La semana pasada, con las tarjetas de territorio personales y las tarjetas de ausentes, se ofreció la oportunidad de conocer la verdad a la persona de una casa.",
/* S5 奉仕年度 */
"この奉仕年度は、全区域の{0}%を回ることができました。": "En este año de servicio se pudo recorrer el {0}% de todos los territorios.",
/* S6 時間帯（{0}は「土日の夕方」など。i18n-es.js の訳が入る） */
"{0}は、ほかの時間帯の{1}倍の割合でお会いできています（この4週間）。": "Franja «{0}»: se logra hablar con las personas {1} veces más que en las demás franjas (últimas 4 semanas).",
"{0}は、ほかの時間帯の1倍の割合でお会いできています（この4週間）。": "Franja «{0}»: se logra hablar con las personas en la misma proporción que en las demás franjas (últimas 4 semanas).",
/* S7 きのう・雨の予報 */
"きのうは雨の予報でしたが、{0}軒を訪ねる努力が払われ、{1}軒の方にお会いできました。": "Ayer se preveía lluvia, pero se hizo el esfuerzo de visitar {0} casas, y se pudo hablar con alguien en {1} de ellas.",
"きのうは雨の予報でしたが、1軒を訪ねる努力が払われ、1軒の方にお会いできました。": "Ayer se preveía lluvia, pero se hizo el esfuerzo de visitar una casa, y se pudo hablar con alguien.",
"きのうは雨の予報でしたが、{0}軒を訪ねる努力が払われました。": "Ayer se preveía lluvia, pero se hizo el esfuerzo de visitar {0} casas.",
"きのうは雨の予報でしたが、1軒を訪ねる努力が払われました。": "Ayer se preveía lluvia, pero se hizo el esfuerzo de visitar una casa."
});
