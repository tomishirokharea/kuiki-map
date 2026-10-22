/* =========================================================
   区域係の設定の「？」の説明（help.js）
   ・説明の文は、このファイルの HELP.ja（日本語）と HELP.es（スペイン語）だけで直せます。
   ・1つの項目は t（項目名）、what（これは何？）、change（変えるとどうなる？）、ex（たとえば）、tip（こんなときは）、dt（はじめの値の表示）。
   ・新しい設定を足したら、ここにも1つ足すと、画面に「？」が自動で出ます
     （行の中の data-sset・data-kset などの名前を見て、自動でさがします。見出しに付けるときは data-hqk="キー"）。
   ・HELP.def は「はじめの値に戻す」で入れる数字です。消すと、そのボタンが出なくなります。

   Ayuda «?» de los ajustes del encargado de territorios.
   ・Los textos se corrigen solo en este archivo: HELP.ja (japonés) y HELP.es (español).
   ========================================================= */
(function () {
  'use strict';

  var HELP = {
    /* はじめの値（「はじめの値に戻す」で入れる値） */
    def: {
      selfTakeMax: 2, autoFree: 0, freeAfterDays: 0, lendDays: 120, awayRetPct: 70, holdMaxPersonal: 2, holdMaxGroup: 2,
      reqMaxPersonal: 1, reqMaxGroup: 1, donePct: 90, lowOn: 1, lowWait: 7, groupOn: 1, groupMax: 4, lockOthers: 1, skipDays: 30, followSkipDays: 60,
      skipDone: 1, contDays: 60, youngW: 25, awayTries: 3, nightOn: 0,
      awayCap: 3, awayRecentDays: 3, awayNoRepeat: 1, awayScope: 0, awayExp: 0, awayDays: 7, awayMax: 2, awayCardMax: 15,
      awayAllTerr: 0, awayDayOnly: 3, extOn: 1, extRest: 7, extCap: 2, extDays: 60, extStopBefore: 14,
      recoOn: 1, wxOn: 1, recoKinds: 15, recoCount: 3, recoDist: 500, recoLongDays: 180, recoSkipDays: 14, recoOthers: 1, recoCardOut: 1, recoCardBtn: 1,
      mapStd: 0, keepMonths: 12, cacheDays: 30, syncGroupSec: 7, syncNormalSec: 20, remindDays: 21, escalateDays: 42
    },

    ui: {
      ja: { what: 'これは何？', change: '変えるとどうなる？', ex: 'たとえば', tip: 'こんなときは', cur: '今の設定', def: 'はじめの値',
        reset: 'はじめの値に戻す', ok: 'わかりました', done: 'はじめの値に戻しました', about: 'の説明', close: '閉じる' },
      es: { what: '¿Qué es?', change: '¿Qué pasa si lo cambio?', ex: 'Por ejemplo', tip: 'Consejo', cur: 'Ajuste actual', def: 'Valor inicial',
        reset: 'Volver al valor inicial', ok: 'Entendido', done: 'Se volvió al valor inicial', about: ': explicación', close: 'Cerrar' }
    },

    ja: {
      /* ---- 区域＞一覧（区域を貸し出すきまり） ---- */
      selfTakeMax: { t: '自分で受け取れる枚数', dt: '2枚',
        what: '「自由に受け取ってよい」区域を、伝道者が係を通さずに自分で受け取れる枚数です。すでに持っているカードも数えます。',
        change: '増やすと、よく奉仕する人が続けて受け取れます。減らすと、多くの人に行きわたりますが、「係に頼む」人が増えます。',
        ex: '2枚にしていて、すでに1枚持っている人は、あと1枚だけ自分で受け取れます。',
        tip: 'まずは2枚で大丈夫です。区域が余っている時期は3枚に、足りない時期は1枚にします。' },
      autoFree: { t: '自動受け取り', dt: '使わない',
        what: 'きまりに合う区域（まだ一度も回っていない区域と、正式に返却されてから決めた日数がたった区域）を、伝道者が自分で受け取れるようにするかどうかです。',
        change: '「使う」にすると、係の承認を待たずに受け取れるので、係の仕事が減ります。「使わない」にすると、区域カードはすべて係が渡します。',
        ex: '3月1日に正式に返却された区域は、日数が90日なら、5月30日から自由に受け取れます。',
        tip: '係が忙しいときは「使う」がおすすめです。返す順番や渡す人を係がきっちり決めたいときは「使わない」にします。' },
      freeAfterDays: { t: '自動で受け取れるまでの日数', dt: '0日',
        what: '正式に返却されてから、だれでも自由に受け取れるようになるまでの日数です（自動受け取りを使うときだけ）。',
        change: '短くすると、同じ区域にすぐ次の人が入るので、住む人には「また来た」と感じられやすくなります。長くすると間があきますが、回る区域が足りなくなることがあります。0日は返却したその日から受け取れます。',
        ex: '1つの区域を4か月に1回回るなら、90日ほどにすると、返却からおよそ3か月で次の人が受け取れます。',
        tip: '全区域を1年で回れるように、区域の数と人数を見て決めます。迷ったら60〜90日にします。' },
      lendDays: { t: '返却の目安', dt: '120日',
        what: '区域カードを受け取ってから返すまでの目安の日数です。カードに「返却の目安」の日付が出て、過ぎると係の一覧で目立ちます。',
        change: '短くすると区域が早く回りますが、1人の負担が増えます。長くするとゆっくり回れますが、全区域を1年で回るのがむずかしくなります。留守宅カードの終わり方（区域の返却の目安まで）にも使われます。',
        ex: '120日なら、4月1日に受け取ったカードの目安は7月30日です。',
        tip: '原則は「留守宅も含めて4か月以内」なので、120日のままがおすすめです。' },
      awayRetPct: { t: '留守宅を回り終えたとみなす割合', dt: '70%',
        what: '1回目に会えなかった家（留守宅）のうち、この割合を別の日・時間帯に訪ね直していると、「返却する」を押したときに正式な返却（区域の完了）になります。届いていなければ、残りの家は留守宅カードになり、留守宅カードの返却で届いた日が正式な返却日になります。',
        change: '上げると、会えない人に会う努力は増えますが、返却まで時間がかかります。下げると早く返せますが、留守宅が残りやすくなります。',
        ex: '留守宅が20軒で70%なら、14軒を訪ね直していれば、返却で完了になります。10軒なら、残りの10軒が留守宅カードになります。',
        tip: '70%が目安です。返却が遅れがちなら60%に、留守宅が多く残るなら80%にします。' },
      holdMaxPersonal: { t: '1人が持てる区域カード', dt: '2枚',
        what: '1人が同時に持てる個人の区域カードの枚数です。申し込み中のカードも数えます。',
        change: '増やすと、たくさん回りたい人には便利ですが、受け取ったまま回れない区域が出やすくなります。減らすと、区域が多くの人に回ります。',
        ex: '2枚にしていて、1枚持っていて1枚申し込み中の人は、もう申し込めません。',
        tip: '2枚がおすすめです。返却の遅れが多いときは1枚にします。' },
      holdMaxGroup: { t: 'グループ奉仕の区域の枚数', dt: '2枚',
        what: '監督・司会者が、グループ奉仕のために持てる区域の枚数です。個人の区域とは別に数えます。',
        change: '増やすと集まりの区域を前もって用意できますが、ほかの人が受け取れる区域が減ります。',
        ex: '2枚なら、今週の集まり用と来週の集まり用を1枚ずつ持てます。',
        tip: '2枚がおすすめです。集まりが多いグループがあるときは3枚にします。紙のS-13から枝番ごとに引き継ぐ間（フェーズ1の準備）は、12枚まで増やせます。' },
      reqMaxPersonal: { t: '係に頼める申し込み（個人）', dt: '1件',
        what: '係の返事を待っている申し込みを、1人が同時にいくつ出せるかです。',
        change: '増やすと、1人がいくつも頼めますが、係が返事をする数が増えます。',
        ex: '1件なら、係の返事が来るまで、次の申し込みはできません。',
        tip: '1件のままがおすすめです。' },
      reqMaxGroup: { t: '係に頼める申し込み（グループ）', dt: '1件',
        what: '監督・司会者が、グループの区域を係に同時にいくつ頼めるかです。個人の申し込みとは別に数えます。',
        change: '増やすと前もって頼めますが、係が返事をする数が増えます。',
        ex: '1件なら、返事が来てから次を頼みます。',
        tip: '1件のままがおすすめです。' },
      donePct: { t: '完了にできる目安', dt: '90%',
        what: '区域カードの家のうち、1回目に訪ねた割合です。届いてから「返却する」を押すと、会えなかった家は留守宅カードになります（留守宅も十分に訪ね直していれば、そのまま完了）。届いていないときは途中の返却になり、自動受け取りを使っていれば、すぐほかの人が続きから回れます。',
        change: '100%にすると、すべての家を訪ねるまで完了にできません。下げると、空き家や入れない建物があっても完了にできます。',
        ex: '50軒の区域で90%なら、45軒を訪ねてから返却すると、1回目を回り終えたことになります。40軒で返却すると、途中の返却になります。',
        tip: '90%がおすすめです。仮の家（実は家でない印）がまだ多い時期は、80%ほどにします。' },
      wxOn: { t: '雨の日は、集合住宅の多い区域を先に出す', dt: '出す',
        what: 'サーバーが30分ごとに会衆の区域の天気を調べ、雨のときは全員の「区域をもらう」（おすすめ順）と「おすすめ」タブで、集合住宅の多い区域を先に出します（訪ねる部屋の半分以上が集合住宅の区域や、特別区域の集合住宅のカード。エレベーターありが先）。奉仕者の操作はいりません。天気は気象データの無料サービス（Open-Meteo）から、区域の真ん中の地点だけで調べ、奉仕者の場所は使いません。',
        change: '「出さない」にすると、天気を調べず、雨の日もふだんの並びのままです。',
        ex: '雨が降っているか、これから2時間で雨の確率が70%以上のとき、一覧のいちばん上に、エレベーターのある団地などの区域が並びます。',
        tip: '「出す」がおすすめです。集合住宅の多い区域が空いていないときは、並びは変わりません（一覧に、そのことが出ます）。夜（21時〜6時）は調べません。' },
      lowOn: { t: '記録の少ない正式返却を自動で確かめる', dt: '使う',
        what: '区域係が、目安に届かないまま正式返却にした区域を、決めた日数のあとに自動で確かめます。記録が届いていれば、そのまま正式返却。届いていなければ、途中の返却にして、すぐだれでも受け取れるようにします。',
        change: '「使わない」にすると、係が正式返却にしたものは、そのまま正式返却になります（回っていない家が、次の巡回まで残ることがあります）。',
        ex: '代わりに返却した区域の記録が40%しかなく、7日たっても増えなければ、途中の返却になり、一覧に「途中で返却（約40%）」と出ます。',
        tip: '「使う」がおすすめです。紙で回ったと分かっているときは、返却のときに「紙や口頭で確かめた」にチェックしてください。' },
      lowWait: { t: '確かめるまで待つ日数', dt: '7日',
        what: '正式返却から、記録を数え直すまでの日数です。電波のない所で付けた記録が、あとから届くのを待ちます。',
        change: '短くすると早く次の人に回せますが、届いていない記録があると、回った区域を途中の返却にすることがあります。長くすると、回っていない家が長く残ります。',
        ex: '7日なら、10月16日の返却を10月23日に確かめます。',
        tip: '7日がおすすめです（返却後の留守宅カードの寝かせる日数と同じ）。' },
      groupOn: { t: '「一緒に回る」を使う', dt: '使う',
        what: '区域の担当者が、その日だけ仲間を加えて、同じ区域を一緒に回れる機能です。',
        change: '「使わない」にすると、このボタンが消え、担当者しかその区域を記録できなくなります。',
        ex: '2人で回るとき、2人とも自分のスマホで記録できます。',
        tip: '「使う」のままがおすすめです。' },
      groupMax: { t: '一緒に回れる人数', dt: '4人',
        what: '担当者のほかに、一緒に回る人として加えられる人数です。',
        change: '増やすと大勢で回れますが、同じ通りに人が集まりすぎることがあります。',
        ex: '4人なら、担当者を入れて5人まで一緒に記録できます。',
        tip: '4人がおすすめです。グループで大勢で回る区域が多いなら増やします。' },
      lockOthers: { t: '自分の区域以外を選べないようにする', dt: 'オン',
        what: 'オンにすると、伝道者の地図では、受け取っている区域と自分の留守宅カードの家だけを選べます。ほかの区域は灰色になります。係はいつもすべて選べます。',
        change: 'オフにすると、だれでもほかの人の区域の家を記録できるので、同じ家に続けて人が行ったり、記録のまちがいが起きやすくなります。',
        ex: 'オンでも「自由に受け取ってよい」区域は選べて、その場で受け取れます。',
        tip: 'オンがおすすめです（住む人への配慮と、まちがい防止のため）。' },
      skipDays: { t: '「最近会えた家」の期間', dt: '30日',
        what: '区域を受け取る前のこの期間に会えた家（留守宅カードなどで）は、はじめから薄い色と青いチェックで出て、とばしてよい家になります。0にすると使いません。',
        change: '長くすると、同じ人を続けて訪ねることが減りますが、区域カードで訪ねる家も減ります。',
        ex: '30日なら、2週間前に留守宅カードで会えた家は、区域カードでは訪ねなくてよい家になります。',
        tip: '30日がおすすめです。' },
      followSkipDays: { t: '再訪問の家をとばす期間', dt: '60日',
        what: '再訪問をしている人が最後に会えた日から、この期間は、区域カードを回る人がその家をとばします。過ぎると、区域カードの人も訪ねてよい家に戻ります。0にすると使いません。',
        change: '長くすると、再訪問している人の関係を大切にできますが、再訪問が止まった家が長く訪ねられないことがあります。',
        ex: '60日で、再訪問の人が最後に会えたのが3か月前なら、区域カードの人が訪ねます。',
        tip: '60日がおすすめです。' },
      memoSync: { t: '再訪問のメモをほかの端末でも使う', dt: '使う',
        what: '再訪問のメモを、同じ人のほかの端末（iPadなど）でも使えるようにするかどうかです。メモは端末の中で暗号化してから保管するので、係の画面やシートでは読めません。',
        change: '「使わない」にすると、サーバーに保管している全員のメモを消して、各自のスマホの中だけになります（スマホの中のメモは消えません）。消したメモは元に戻せません。',
        ex: 'スマホとiPadの両方で再訪問をしている人は、「使わない」にすると、iPadにメモが届かなくなります。',
        tip: '「使う」がおすすめです。中身は係やシートでは読めない形で保管されるので、個人情報の面でも安心です。' },
      skipDone: { t: '「最近会えた家」を完了の数に入れる', dt: '入れる',
        what: 'とばしてよい家（青いチェック）を、区域の回り終えた割合（％）に数えるかどうかです。',
        change: '「入れない」にすると、完了の目安に届くのが遅くなります。',
        ex: '50軒のうち5軒が青いチェックで目安が90%なら、「入れる」はあと40軒、「入れない」は残りの45軒すべてを訪ねると完了にできます。',
        tip: '「入れる」がおすすめです。' },
      contDays: { t: '続きから回る期間', dt: '60日',
        what: '途中で返された区域を、この日数のあいだに次の人が受け取ると、前の人が訪ねた家は「済み」のまま続きから回れます。0にすると使いません。',
        change: '長くすると、むかしの訪問も「済み」になるので、長いあいだ訪ねていない家がとばされることがあります。短くすると、最初から回ることが増えます。',
        ex: '60日なら、6月1日に途中で返された区域を7月15日に受け取ると、続きから回れます。',
        tip: '60日がおすすめです。' },
      terrList: { t: '区域の一覧の操作',
        what: '区域ごとの「担当」「貸し出し」「グループの区域にする」で、その区域だけの扱いを変えられます。',
        change: '担当を変えると、その人に区域カードが移ります（前の担当者はS-13に残ります）。「貸出中止」にすると、だれも受け取れません。「貸出可能」にすると、日数のきまりに関係なく受け取れます。「きまりのとおり」は上の設定どおりです。',
        ex: '工事中で入れない地域は「貸出中止」に、急いで回りたい区域は「貸出可能」にします。',
        tip: 'ふだんは「きまりのとおり」のままにします。' },

      /* ---- 区域＞状況（期限の見張り・区域ごとの調整） ---- */
      youngW: { t: '若い世代の多い区域を前に出す', dt: '中',
        what: '区域をえらぶ一覧の「おすすめ順」で、若い世代の多い区域をどれだけ上に出すかです。どれにしても、期限の近い区域がいちばん上です。',
        change: '「強」にすると、若い世代の多い区域が上に来やすくなります。「弱」にすると、期限や近さが中心になります。',
        ex: '夏休み・年末年始・連休などは、若い世代が家にいやすいので「強」にします。',
        tip: 'ふだんは「中」がおすすめです。' },
      awayTries: { t: '留守宅を終える回数（手紙の候補）', dt: '3回',
        what: '違う時間帯でこの回数留守だった家を、「手紙の候補」の一覧に出します。留守宅カードに入れるかどうかは「留守宅訪問のルール」で決めます。',
        change: '減らすと、早めに手紙に切りかえられます。増やすと、訪問で会う努力を長く続けます。',
        ex: '3回なら、平日の朝・土日の昼・平日の夕方に留守だった家が、手紙の候補になります。',
        tip: '3回がおすすめです。単身向けのアパートが多い区域は、区域ごとの「調整」で増やします。' },
      nightOn: { t: '夜（19時〜）も提案する', dt: '提案しない',
        what: '19時からの夜を、留守宅を訪ねる時間帯として提案に入れるかどうかです。',
        change: '「提案する」にすると、昼間に家にいない働く世代に会える機会が増えますが、夜の訪問を迷惑に感じる人もいます。',
        ex: '平日の昼も夕方も留守の家に、夜の時間帯が提案されます。',
        tip: '地域の様子と安全（暗い道・1人で回らない）を考えて決めます。' },
      offDays: { t: '訪問を控える日',
        what: 'この日は、全員の画面で「おすすめ」と「留守宅カード」の提案を止めます。',
        change: '登録した日だけ止まり、次の日から元に戻ります。',
        ex: '地域のお祭りや行事の日、台風の日などを登録します。',
        tip: '終わった日や不要な日は「×」で消せます。' },
      adjTries: { t: 'この区域の留守宅を終える回数',
        what: '全体の決めとは別に、この区域だけ「手紙の候補」にする回数を変えます。',
        change: '増やすと、この区域では訪問で会う努力を長く続けます。',
        ex: '単身向けのアパートが多く、昼間ほとんどいない区域は5回にします。',
        tip: '「全体の決めに合わせる」で元に戻せます。' },
      adjYoung: { t: '若い世代の割合の手直し',
        what: 'この区域の若い世代の割合を、統計の数字ではなく、実際の様子に合わせて手直しします。',
        change: '手直しした数字が、「おすすめ順」と「会える見込み」に使われます。「手直しをやめる」で元の数字に戻ります。',
        ex: '新しくファミリー向けのアパートが建って、統計より若い人が多いときに直します。',
        tip: '大きな団地が一か所だけあるなど、実際とずれているときだけ直します。実際に回った人の感じを聞いてから直します。' },

      /* ---- 区域＞状況（留守宅訪問のルール・留守宅カードの出し方・返却後） ---- */
      awayCap: { t: '留守宅として訪ねる上限回数', dt: '3回',
        what: '今回の巡回で、同じ家を留守宅として訪ねる回数の上限です（留守だった日の数。同じ日は1回）。届いた家は、次の巡回が始まるまで留守宅カードに入りません。',
        change: '増やすと会える機会は増えますが、住む人の負担も増えます。減らすと配慮になりますが、会えないまま終わる家が増えます。',
        ex: '3回なら、1回目に留守、留守宅カードでも2回留守だった家は、今回の巡回ではもうカードに入りません。',
        tip: '3回がおすすめです。' },
      awayRecentDays: { t: '訪ねてからカードに入れない日数', dt: '3日',
        what: '同じ家を次に訪ねるまでの、いちばん短い間隔です。この日数以内に訪ねた家は、カードに入りません。0にすると間隔をあけません。',
        change: '長くすると住む人への配慮になりますが、返却までに訪ねられる回数が減ります。',
        ex: '3日なら、月曜に訪ねた家は、少なくとも3日たってからカードに入ります。',
        tip: '3〜7日がおすすめです。' },
      awayNoRepeat: { t: '同じ家に同じ時間帯を重ねない', dt: 'オン',
        what: 'オンのときは、同じ家を同じ時間帯（例：平日の朝）では二度訪ねません。10通りすべて試した家は、いちばん前に試した時間帯から順に戻ります。',
        change: 'オフにすると、同じ時間帯に何度も訪ねることがあり、会える見こみが下がります。',
        ex: '平日の朝に留守だった家は、次は土日や夕方のカードに入ります。',
        tip: 'オンがおすすめです（会えていない人に会うための、いちばん大切なしくみです）。' },
      awayScope: { t: '試した時間帯の数え方', dt: '今回の巡回だけ',
        what: 'どの時間帯を「試した」とみなすかの数え方です。留守宅になる家の範囲は変わりません。',
        change: '「前回の巡回も含める」にすると、前回試した時間帯もとばすので、まだ試していない時間帯に早くたどり着けます。「今回の巡回だけ」は、巡回ごとにまた試し直します（住む人の暮らしは変わるため）。',
        ex: '前回、平日の朝に留守だった家は、「含める」なら今回も平日の朝を避けます。',
        tip: 'ふだんは「今回の巡回だけ」。なかなか会えない家が多いときは「含める」にします。' },
      awayExp: { t: '留守宅カードが終わるとき', dt: '日数で',
        what: '留守宅カードが自動で終わるときの決め方です。',
        change: '「日数で」は、受け取ってから決めた日数で終わります。「区域の返却の目安まで」は、区域を受け取った日から返却の目安までずっと使えます（目安がない区域は日数で終わります）。',
        ex: '「日数で」7日なら、土曜に受け取ったカードは、次の土曜ごろに終わります。',
        tip: '短く区切るほうがほかの人に回りやすいので、「日数で」がおすすめです。' },
      awayDays: { t: '留守宅カードが終わるまでの日数', dt: '7日',
        what: '留守宅カードを受け取ってから、自動で終わるまでの日数です。',
        change: '短くすると、持ったまま回らないカードが減ります。長くすると予定に合わせやすいですが、そのあいだ、ほかの人はその家を受け取れません。',
        ex: '7日なら、土曜に受け取ると次の土曜ごろに終わります。',
        tip: '7日（1週間）がおすすめです。' },
      awayMax: { t: '1人が持てる留守宅カード', dt: '2枚まで',
        what: '1人が同時に持てる留守宅カードの枚数です。',
        change: '増やすと、いろいろな時間帯のカードを持てますが、1人で抱えて回りきれないことがあります。',
        ex: '2枚なら、朝のカードと夕方のカードを1枚ずつ持てます。',
        tip: '2枚がおすすめです。' },
      awayCardMax: { t: '1枚のカードに入れる家の数', dt: '15軒まで',
        what: '1枚の留守宅カードに入れる家の数です。長く会えていない家から入れます。0は制限なしです。',
        change: '多くすると1枚で回る家が増え、1回の奉仕で回りきれないことがあります。少なくすると回りきりやすくなります。',
        ex: '15軒なら、長く会えていない順に15軒まで入ります。',
        tip: '1回の奉仕（1〜2時間）で回れる軒数を目安にします。迷ったら15軒です。' },
      awayAllTerr: { t: '回り終えた記録がない区域も使う', dt: '使わない',
        what: 'アプリに回り終えた記録がない区域（担当者なし）の家も、留守宅カードに使うかどうかです。',
        change: '「使う」にすると、紙で回っていた区域などからもカードができます。「使わない」は、回り終えた区域だけからカードを作ります。',
        ex: 'アプリを使いはじめたばかりで、回り終えた記録が少ないとき「使う」にすると、カードが増えます。',
        tip: 'ふだんは「使わない」がおすすめです。' },
      awayDayOnly: { t: 'その日限りにする軒数', dt: '3軒まで',
        what: '家がこの軒数以下の小さなカードは、受け取った日の終わりに自動で終わります。0にすると使いません。',
        change: '用事で近くに来た人が、その日だけ1〜2軒寄れるようにするためのしくみです。増やすと「今日だけ」のカードが増えます。',
        ex: '3軒なら、2軒だけのカードは、受け取った日の23時59分に終わります。',
        tip: '3軒がおすすめです。' },
      extOn: { t: '返却後の留守宅カード', dt: '使う',
        what: '正式に返却された区域の、まだ会えていない家を、少し寝かせてから、まだ試していない時間帯だけで、だれでも受け取れるカードにします。',
        change: '「使わない」にすると、返却後は、次に区域カードで回るまで、その家を訪ねません。',
        ex: '返却された区域に留守宅が8軒残っていれば、寝かせる日数のあとに「返却後の留守宅カード」として出ます。',
        tip: '「使う」がおすすめです。苦情があった地域は、下の一覧で区域ごとに「止める」にします。' },
      extRest: { t: '寝かせる日数', dt: '7日',
        what: '正式に返却されてから、また前のカードが終わってから、この日数はカードを出しません。家ごとにも、最後に訪ねてからこの日数は入れません。7日より短くはできません。',
        change: '長くするほど、住む人への配慮になりますが、会いに行くまでの間があきます。',
        ex: '7日なら、日曜に返却された区域は、次の日曜からカードになります。',
        tip: '7日がおすすめです。苦情があれば14日ほどにします。' },
      extCap: { t: '1軒あたりの回数（返却後）', dt: '2回',
        what: '返却後に、同じ家を訪ねる回数の上限です（同じ日は1回）。',
        change: '増やすと会える機会は増えますが、住む人の負担も増えます。',
        ex: '2回なら、返却後に2回留守だった家は、もうカードに入りません。',
        tip: '2回がおすすめです。' },
      extDays: { t: '出す期間', dt: '60日',
        what: '正式に返却されてから、この日数がたつと、返却後の留守宅カードを出すのを止めます。',
        change: '長くすると訪ねる機会は増えますが、次に区域カードで回るときとの間が短くなります。',
        ex: '60日なら、3月1日に返却された区域は、4月30日ごろまで出ます。',
        tip: '60日がおすすめです。' },
      extStopBefore: { t: '次の新規の前に止める', dt: '14日',
        what: '自動受け取りを使う区域では、自由に受け取れるようになる日の、この日数前で止めます。',
        change: '0に近づけると、次に区域カードで回る人が来る直前まで訪ねることになり、住む人には続けて訪問されたように感じられます。',
        ex: '自由に受け取れる日が返却から90日で、14日なら、返却から76日目で止まります。',
        tip: '14日がおすすめです。' },
      extList: { t: '返却後の区域の一覧',
        what: '返却後の留守宅カードの様子を、区域ごとに見て、止めたり出したりできます。',
        change: '「止める」を押すと、すぐにだれの一覧からも消えます。「出す」で元に戻ります。貸出中止の区域は出ません。',
        ex: '住む人から「何度も来ないで」と言われた地域を止めます。',
        tip: 'ふだんはそのままで大丈夫です。' },

      /* ---- 設定タブ（おすすめ・地図・データ） ---- */
      recoOn: { t: 'おすすめを出す', dt: '出す',
        what: '全員の画面の下のタブに「おすすめ」を出すかどうかです。',
        change: '「出さない」にすると、全員の画面から「おすすめ」のタブが消えます。',
        ex: '空き時間に2〜3軒回りたい人が、近くの留守宅などを見つけられます。',
        tip: '「出す」がおすすめです。' },
      recoKinds: { t: '出すおすすめの種類', dt: '4つ',
        what: 'どんな家をおすすめに出すかを選びます。選んだ種類から、順番に1件ずつ出します。',
        change: '種類をしぼると、ねらいがはっきりしますが、出る家が少なくなることがあります。',
        ex: '平日の昼に回る人が多いなら、「会社・店舗」も選びます。',
        tip: 'はじめは4つ（近くの留守宅・今の時間帯がねらい目・時間帯を変えてみる・長く会えていない家）。下の「おすすめから訪ねた記録」で、会えた割合が高い種類を残します。' },
      recoCount: { t: '一度に出す件数', dt: '3件',
        what: 'おすすめに、一度に何件出すかです。',
        change: '多くすると選べる家が増えますが、画面が長くなり、迷いやすくなります。',
        ex: '3件なら、空き時間に回れる家が3件出ます。',
        tip: '3件がおすすめです。' },
      recoDist: { t: '「近く」とする距離', dt: '500m以内',
        what: '今いる場所から、どこまでを「近く」とみなすかです。',
        change: '広げると出る家は増えますが、移動が長くなります。',
        ex: '500mは、歩いて7〜8分ほどです。',
        tip: '歩いて回る地域は500m、車で回る地域は1000〜2000mにします。' },
      recoLongDays: { t: '「長く会えていない」とする日数', dt: '180日',
        what: '最後に会えてから、この日数がたった家を「長く会えていない家」とみなします。',
        change: '短くすると出る家は増えますが、少し前に会えた家も出ます。',
        ex: '180日なら、半年以上会えていない家が出ます。',
        tip: '180日がおすすめです。' },
      recoSkipDays: { t: '訪ねてから、おすすめに出さない日数', dt: '14日',
        what: 'だれかが訪ねてから、この日数はその家をおすすめに出しません。',
        change: '長くすると、同じ家に何人も続けて行くことが減ります。0にすると使いません。',
        ex: '14日なら、今日だれかが訪ねた家は、2週間おすすめに出ません。',
        tip: '14日がおすすめです。' },
      recoOthers: { t: 'ほかの人の区域の家も出す', dt: '出す',
        what: 'ほかの人が担当している区域の家も、おすすめに出すかどうかです。',
        change: '「出す」にすると、担当者の地図にも緑のチェックが付きます（だれが行ったかは見せません）。「出さない」にすると、ほかの人が担当している区域の家は出ません。',
        ex: '担当者がしばらく回れていない区域でも、近くにいる人が訪ねられます。',
        tip: '「出す」がおすすめです。担当者が自分で回りたいという声が多ければ「出さない」にします。' },
      recoCardOut: { t: 'ほかの人の留守宅カードの家', dt: '出さない',
        what: 'ほかの人が持っている留守宅カードの家を、おすすめに出すかどうかです。',
        change: '「出す」にすると、カードを持っている人の予定より先に、ほかの人が訪ねることがあります。',
        ex: 'カードを持つ人が土曜の夕方に回る予定の家に、金曜にほかの人が行ってしまう、ということが起きます。',
        tip: '「出さない」がおすすめです。' },
      recoCardBtn: { t: '留守宅カードを受け取るボタン', dt: '出す',
        what: 'おすすめの家の区域に、今の時間帯の留守宅カードがあるとき、「この区域の留守宅カードを受け取る」ボタンを出すかどうかです。',
        change: '「出す」にすると、おすすめの家のついでに、まわりの留守宅もまとめて回れます。',
        ex: '近くの1軒を訪ねたついでに、同じ区域の留守宅カードを受け取れます。',
        tip: '「出す」がおすすめです。' },
      mapStd: { t: '伝道者の地図のはじめの種類', dt: '見やすい地図',
        what: '自分で地図の種類を選んでいない人の地図に使う種類です。',
        change: '「地名の多い地図」は地名や道が濃く出ます（見やすいように地図を少し薄くします）。自分で選んだ人の地図は変わりません。',
        ex: '地名や目印で場所を探す人が多いなら「地名の多い地図」にします。',
        tip: '迷ったら「見やすい地図」のままで大丈夫です。' },
      keepMonths: { t: '訪問記録を残す期間', dt: '12か月',
        what: 'これより古い訪問記録は、家ごとの最後の1件を残して、毎月整理します（自動整理を設定したとき）。',
        change: '長くすると、会えた時間帯の傾向がよく分かりますが、住む人に関する記録を長く持つことになります。短くすると安全ですが、傾向が分かりにくくなります。',
        ex: '1つの区域を4か月に1回回るなら、12か月でおよそ3回分の記録が残ります。',
        tip: '個人に関する記録は「目的に必要な期間だけ」持つのが原則です。必要以上に長くしないでください。12〜24か月が目安です。' },
      cacheDays: { t: '通信がない端末にデータを残す期間', dt: '30日',
        what: 'この日数のあいだ通信できなかったスマホは、保存していた区域の情報を自動で消します。',
        change: '短くすると、なくしたスマホから情報が見られる期間が短くなり安全です。そのかわり、しばらくアプリを開かなかった人は、次に開いたとき読み込み直しが必要です。',
        ex: '30日なら、1か月アプリを開かなかったスマホは、区域の情報を消します。',
        tip: '30日がおすすめです。スマホをなくす心配が大きいときは14日ほどにします。' },
      syncGroupSec: { t: '一緒に回るときの取りに行く間隔', dt: '7秒',
        what: '一緒に回っているとき、ほかの人の記録を取りに行く間隔です。',
        change: '短いほど早く反映されますが、サーバーが混み、スマホの電池も使います。',
        ex: '7秒なら、仲間が記録した家が7秒ほどで自分の地図に出ます。',
        tip: '7秒がおすすめです（80人が同時に使っても余裕があります）。' },
      syncNormalSec: { t: 'ふだんの取りに行く間隔', dt: '20秒',
        what: '区域カードや地図を見ているとき、新しい記録を取りに行くふだんの間隔です。',
        change: '短いほど早く反映されますが、サーバーが混みます。',
        ex: '20秒なら、ほかの人の記録が20秒ほどで出ます。',
        tip: '20秒がおすすめです。動きが重いときは長くします。' },
      remindDays: { t: '本人に知らせるまで（再訪問）', dt: '3週間',
        what: '再訪問の受け持ちで、この期間訪問がないと「しばらく訪問なし」として本人に知らせます。',
        change: '短くすると早めに思い出せますが、知らせが多くなります。',
        ex: '3週間なら、最後の訪問から3週間で知らせます。',
        tip: '3週間がおすすめです。' },
      escalateDays: { t: '係に知らせるまで（再訪問）', dt: '6週間',
        what: '再訪問の受け持ちで、この期間訪問がないと「確認が必要」として係に知らせます。',
        change: '短くすると係の確認が増えます。本人に知らせるまでより、いつも1週間以上長くなります。',
        ex: '6週間なら、最後の訪問から6週間で係の画面に出ます。',
        tip: '6週間がおすすめです。' }
    },

    es: {
      selfTakeMax: { t: 'Tarjetas que uno puede tomar por sí mismo', dt: '2 tarjetas',
        what: 'Cuántos territorios «libres» puede tomar un publicador sin pasar por el encargado. Se cuentan también las tarjetas que ya tiene.',
        change: 'Si sube, quien predica mucho puede tomar varios seguidos. Si baja, alcanza para más personas, pero más gente tendrá que pedirlo al encargado.',
        ex: 'Con 2 tarjetas, quien ya tiene 1 puede tomar solo 1 más.',
        tip: 'Al principio, 2 está bien. Si sobran territorios, 3; si faltan, 1.' },
      autoFree: { t: 'Tomar territorios automáticamente', dt: 'No usar',
        what: 'Permite que los publicadores tomen por sí mismos los territorios que cumplen la regla (los que nunca se han trabajado y los devueltos oficialmente hace los días indicados).',
        change: 'Con «Usar», no hace falta esperar la aprobación y el encargado trabaja menos. Con «No usar», todas las tarjetas las entrega el encargado.',
        ex: 'Un territorio devuelto el 1 de marzo, con 90 días, se puede tomar libremente desde el 30 de mayo.',
        tip: 'Si el encargado está ocupado, conviene «Usar». Si quiere decidir bien el orden y a quién se entrega, «No usar».' },
      freeAfterDays: { t: 'Días hasta poder tomarlo libremente', dt: '0 días',
        what: 'Días desde la devolución formal hasta que cualquiera puede tomar el territorio (solo con la toma automática).',
        change: 'Si es corto, otra persona entra enseguida y los vecinos pueden sentir «otra vez aquí». Si es largo, hay más pausa, pero pueden faltar territorios. Con 0 días se puede tomar el mismo día.',
        ex: 'Si cada territorio se trabaja una vez cada 4 meses, unos 90 días permiten que otro lo tome unos 3 meses después.',
        tip: 'Decídalo según el número de territorios y de personas, para cubrir todo en un año. En duda, 60 a 90 días.' },
      lendDays: { t: 'Plazo de devolución', dt: '120 días',
        what: 'Días aproximados desde que se recibe la tarjeta hasta devolverla. La tarjeta muestra la fecha; si se pasa, se destaca en la lista del encargado.',
        change: 'Más corto: los territorios avanzan más rápido, pero cada uno carga más. Más largo: se trabaja con calma, pero es difícil cubrir todo en un año. También se usa para el fin de las tarjetas de no en casa («hasta el plazo del territorio»).',
        ex: 'Con 120 días, una tarjeta recibida el 1 de abril vence el 30 de julio.',
        tip: 'La regla es «4 meses, incluidos los no en casa», así que conviene dejar 120 días.' },
      awayRetPct: { t: 'Porcentaje para dar por visitados los no en casa', dt: '70%',
        what: 'De las casas donde no hubo nadie la primera vez, si ya se volvió a visitar este porcentaje otro día u otra hora, al tocar «Devolver» el territorio queda completado. Si no, las casas restantes pasan a tarjetas de ausentes, y la devolución oficial es el día en que se alcanza al devolver esas tarjetas.',
        change: 'Si sube, se hace más esfuerzo por encontrar a la gente, pero se tarda más en devolver. Si baja, se devuelve antes, pero quedan más no en casa.',
        ex: 'Con 20 no en casa y 70%, si ya revisitó 14, al devolver queda completado. Si revisitó 10, las otras 10 pasan a tarjetas de ausentes.',
        tip: '70% es una buena medida. Si las devoluciones se atrasan, 60%; si quedan muchos no en casa, 80%.' },
      holdMaxPersonal: { t: 'Tarjetas personales por persona', dt: '2 tarjetas',
        what: 'Cuántas tarjetas de territorio personal puede tener una persona a la vez. Se cuentan también las solicitadas.',
        change: 'Si sube, es cómodo para quien quiere predicar mucho, pero quedan más territorios sin trabajar. Si baja, los territorios llegan a más personas.',
        ex: 'Con 2, quien tiene 1 y ya pidió otra no puede pedir más.',
        tip: 'Se recomienda 2. Si hay muchas devoluciones atrasadas, 1.' },
      holdMaxGroup: { t: 'Territorios para la predicación en grupo', dt: '2 tarjetas',
        what: 'Cuántos territorios pueden tener el superintendente o el conductor para la predicación en grupo. Se cuentan aparte de los personales.',
        change: 'Si sube, se pueden preparar territorios con antelación, pero quedan menos para los demás.',
        ex: 'Con 2, se puede tener uno para la reunión de esta semana y otro para la siguiente.',
        tip: 'Se recomienda 2. Mientras se pasan los registros del S-13 en papel por subdivisión (preparación de la fase 1), se puede subir hasta 12.' },
      reqMaxPersonal: { t: 'Solicitudes al encargado (personal)', dt: '1',
        what: 'Cuántas solicitudes puede tener una persona esperando respuesta del encargado a la vez.',
        change: 'Si sube, cada uno puede pedir varias, pero el encargado tiene más que responder.',
        ex: 'Con 1, no se puede pedir otra hasta recibir respuesta.',
        tip: 'Se recomienda dejar 1.' },
      reqMaxGroup: { t: 'Solicitudes al encargado (grupo)', dt: '1',
        what: 'Cuántos territorios de grupo pueden pedir a la vez el superintendente o el conductor. Se cuentan aparte de las personales.',
        change: 'Si sube, se puede pedir con antelación, pero el encargado tiene más que responder.',
        ex: 'Con 1, se pide la siguiente después de recibir respuesta.',
        tip: 'Se recomienda dejar 1.' },
      donePct: { t: 'Porcentaje para completar', dt: '90%',
        what: 'Porcentaje de casas visitadas en la 1.ª vuelta. Si se alcanza y se toca «Devolver», las casas sin respuesta pasan a tarjetas de ausentes (o queda completado si también se revisitaron). Si no se alcanza, es una devolución sin terminar; con la asignación automática, otra persona puede recibirlo enseguida y seguir donde quedó.',
        change: 'Con 100% no se puede completar hasta visitar todas. Si baja, se puede completar aunque haya casas vacías o edificios sin acceso.',
        ex: 'En un territorio de 50 casas con 90%, al devolver después de visitar 45 termina la 1.ª vuelta. Si devuelve con 40, es una devolución sin terminar.',
        tip: 'Se recomienda 90%. Mientras haya muchas casas provisionales (marcas que no son casas), unos 80%.' },
      wxOn: { t: 'En días de lluvia, mostrar primero las tarjetas de apartamentos', dt: 'Mostrar',
        what: 'Cada 30 minutos el servidor consulta el tiempo en el centro de los territorios. Si llueve, en «Pedir territorio» (orden recomendado) y en «Recomendaciones» aparecen primero las tarjetas de apartamentos (las que tienen ascensor primero). Nadie tiene que hacer nada. Se usa un servicio gratuito (Open-Meteo) y no se usa la ubicación de los publicadores.',
        change: 'Con «No mostrar» no se consulta el tiempo y el orden es el de siempre.',
        ex: 'Si llueve o hay 70% o más de probabilidad en las próximas 2 horas, arriba aparecen las tarjetas de apartamentos con ascensor.',
        tip: 'Se recomienda «Mostrar». Si aún no hay tarjetas de apartamentos (territorios especiales), no cambia nada. De noche (21:00–6:00) no se consulta.' },
      lowOn: { t: 'Verificar automáticamente devoluciones con pocos registros', dt: 'Usar',
        what: 'Cuando el encargado devuelve como oficial un territorio que no llegó al porcentaje indicado, pasados los días fijados se verifica automáticamente. Si los registros ya llegaron, sigue como devolución formal. Si no, pasa a devolución parcial y cualquiera puede tomarlo enseguida.',
        change: 'Con «No usar», lo que el encargado devuelve como oficial queda como oficial (puede que queden casas sin visitar hasta la próxima vuelta).',
        ex: 'Si un territorio devuelto por el encargado tiene solo 40% y a los 7 días sigue igual, pasa a devolución parcial y en la lista aparece «Devuelto parcialmente (aprox. 40%)».',
        tip: 'Se recomienda «Usar». Si sabe que se predicó con el mapa en papel, marque «Lo comprobé en papel o de palabra» al devolver.' },
      lowWait: { t: 'Días de espera para verificar', dt: '7 días',
        what: 'Días desde la devolución formal hasta volver a contar los registros. Da tiempo a que lleguen registros hechos sin señal.',
        change: 'Si se acorta, el territorio pasa antes a otra persona, pero si faltan registros puede quedar como parcial uno que sí se predicó. Si se alarga, las casas sin visitar permanecen más tiempo.',
        ex: 'Con 7 días, una devolución del 16 de octubre se verifica el 23 de octubre.',
        tip: 'Se recomiendan 7 días (igual que los días de reposo de la tarjeta de ausentes tras la devolución).' },
      groupOn: { t: 'Usar «Predicar juntos»', dt: 'Usar',
        what: 'Permite que el responsable del territorio añada compañeros solo por ese día para trabajar juntos el mismo territorio.',
        change: 'Con «No usar», el botón desaparece y solo el responsable puede registrar en ese territorio.',
        ex: 'Cuando van dos, ambos pueden registrar con su propio teléfono.',
        tip: 'Se recomienda «Usar».' },
      groupMax: { t: 'Personas que pueden ir juntas', dt: '4 personas',
        what: 'Cuántas personas, además del responsable, se pueden añadir para ir juntas.',
        change: 'Si sube, pueden ir muchos, pero puede juntarse demasiada gente en la misma calle.',
        ex: 'Con 4, pueden registrar hasta 5 personas contando al responsable.',
        tip: 'Se recomienda 4. Si muchos territorios se trabajan en grupos grandes, súbalo.' },
      lockOthers: { t: 'No elegir territorios ajenos', dt: 'Activado',
        what: 'Activado, en el mapa del publicador solo se pueden elegir sus territorios y las casas de sus tarjetas de no en casa. Lo demás sale en gris. El encargado siempre puede elegir todo.',
        change: 'Desactivado, cualquiera puede registrar casas de territorios ajenos; es más fácil que se repitan visitas o haya errores.',
        ex: 'Aun activado, los territorios «libres» se pueden elegir y tomar en ese momento.',
        tip: 'Se recomienda activado (por respeto a los vecinos y para evitar errores).' },
      skipDays: { t: 'Período de «visto recientemente»', dt: '30 días',
        what: 'Las casas donde se encontró a alguien en este período antes de recibir el territorio (por ejemplo, con una tarjeta de no en casa) salen claras con una marca azul y se pueden saltar. Con 0 no se usa.',
        change: 'Si es largo, se visita menos seguido a la misma persona, pero también hay menos casas que visitar.',
        ex: 'Con 30 días, una casa donde se encontró a alguien hace 2 semanas no hace falta visitarla con la tarjeta de territorio.',
        tip: 'Se recomienda 30 días.' },
      followSkipDays: { t: 'Saltar casas de revisitas', dt: '60 días',
        what: 'Desde la última vez que quien hace la revisita encontró a la persona, durante este período quienes trabajan el territorio saltan esa casa. Después, vuelve a ser una casa normal. Con 0 no se usa.',
        change: 'Si es largo, se cuida la relación de quien hace la revisita, pero una revisita que se detuvo puede quedar mucho tiempo sin visitar.',
        ex: 'Con 60 días, si la última vez que se encontró a la persona fue hace 3 meses, la visita quien trabaja el territorio.',
        tip: 'Se recomienda 60 días.' },
      memoSync: { t: 'Notas de revisitas en otros dispositivos', dt: 'Usar',
        what: 'Permite usar las notas de revisitas en otros dispositivos de la misma persona (por ejemplo, un iPad). Se cifran en el dispositivo antes de guardarse, así que no se pueden leer en la pantalla del encargado ni en la hoja.',
        change: 'Con «No usar», se borran del servidor las notas de todos y quedan solo en cada teléfono (las del teléfono no se borran). Lo borrado no se puede recuperar.',
        ex: 'Quien hace revisitas con teléfono y iPad dejará de ver sus notas en el iPad.',
        tip: 'Se recomienda «Usar». Como el contenido no lo puede leer el encargado ni la hoja, también es seguro para los datos personales.' },
      skipDone: { t: 'Contar «visto recientemente» como hecho', dt: 'Contar',
        what: 'Si las casas que se pueden saltar (marca azul) cuentan en el porcentaje del territorio terminado.',
        change: 'Con «No contar», se tarda más en llegar al porcentaje para completar.',
        ex: 'Si de 50 casas 5 tienen marca azul y la meta es 90%: con «Contar» faltan 40; con «No contar» hay que visitar las 45 restantes.',
        tip: 'Se recomienda «Contar».' },
      contDays: { t: 'Período para continuar donde quedó', dt: '60 días',
        what: 'Si alguien toma, dentro de estos días, un territorio devuelto a medias, las casas que visitó la persona anterior siguen como «hechas» y se continúa desde ahí. Con 0 no se usa.',
        change: 'Si es largo, visitas antiguas cuentan como hechas y se pueden saltar casas que hace mucho nadie visita. Si es corto, se empieza más veces desde el principio.',
        ex: 'Con 60 días, un territorio devuelto a medias el 1 de junio y tomado el 15 de julio se continúa donde quedó.',
        tip: 'Se recomienda 60 días.' },
      terrList: { t: 'Acciones de la lista de territorios',
        what: 'Con «Responsable», «Préstamo» y «Territorio de grupo» de cada territorio se cambia el trato solo de ese territorio.',
        change: 'Al cambiar el responsable, la tarjeta pasa a esa persona (el anterior queda en el S-13). «Suspender préstamo»: nadie lo puede tomar. «Permitir préstamo»: se puede tomar sin importar los días. «Según la regla»: como los ajustes de arriba.',
        ex: 'Una zona en obras se suspende; un territorio que conviene trabajar pronto se permite.',
        tip: 'Normalmente, déjelo «según la regla».' },
      youngW: { t: 'Poner primero zonas con más jóvenes', dt: 'Medio',
        what: 'Cuánto suben, en el orden recomendado de la lista para elegir territorio, los territorios con más jóvenes. En cualquier caso, los de plazo más cercano van primero.',
        change: '«Fuerte»: los territorios con más jóvenes suben más. «Débil»: pesan más el plazo y la cercanía.',
        ex: 'En vacaciones de verano, fin de año o puentes, los jóvenes están más en casa: «Fuerte».',
        tip: 'Normalmente se recomienda «Medio».' },
      awayTries: { t: 'Veces para terminar con un no en casa (cartas)', dt: '3 veces',
        what: 'Las casas sin nadie este número de veces en horarios distintos pasan a la lista de «candidatas a carta». Si entran en tarjetas de no en casa se decide en las «reglas de visitas a no en casa».',
        change: 'Si baja, se pasa antes a las cartas. Si sube, se sigue intentando más tiempo con visitas.',
        ex: 'Con 3, una casa sin nadie entre semana por la mañana, el fin de semana a mediodía y entre semana por la tarde pasa a candidata a carta.',
        tip: 'Se recomienda 3. En territorios con muchos apartamentos para una persona, súbalo con «Ajustar» de cada territorio.' },
      nightOn: { t: 'Proponer también la noche (desde las 19 h)', dt: 'No proponer',
        what: 'Si la noche (desde las 19 h) se propone como horario para visitar no en casa.',
        change: 'Con «Proponer», hay más oportunidades de encontrar a quienes trabajan de día, pero a algunas personas les molestan las visitas de noche.',
        ex: 'A una casa sin nadie a mediodía ni por la tarde se le propone la noche.',
        tip: 'Decídalo según la zona y la seguridad (calles oscuras, no ir solo).' },
      offDays: { t: 'Días sin visitas',
        what: 'Ese día se detienen en la pantalla de todos las propuestas de «Recomendaciones» y de «tarjetas de no en casa».',
        change: 'Solo se detiene el día registrado; al día siguiente vuelve a la normalidad.',
        ex: 'Registre días de fiestas o eventos locales, o días de tifón.',
        tip: 'Los días pasados o innecesarios se borran con «×».' },
      adjTries: { t: 'Veces para terminar en este territorio',
        what: 'Cambia, solo para este territorio, las veces para pasar a «candidata a carta», aparte de la regla general.',
        change: 'Si sube, en este territorio se sigue intentando más tiempo con visitas.',
        ex: 'Un territorio con muchos apartamentos para una persona, casi vacíos de día: 5 veces.',
        tip: 'Con «Usar la regla general» vuelve como estaba.' },
      adjYoung: { t: 'Corregir el porcentaje de jóvenes',
        what: 'Corrige el porcentaje de jóvenes de este territorio según la realidad, no según la estadística.',
        change: 'El número corregido se usa en el «orden recomendado» y en la «probabilidad de encontrar». Con «Dejar de corregir» vuelve al número original.',
        ex: 'Si se construyeron apartamentos para familias y hay más jóvenes que en la estadística.',
        tip: 'Corrija solo cuando no coincide con la realidad (por ejemplo, un solo complejo grande). Pregunte antes a quienes lo trabajaron.' },
      awayCap: { t: 'Máximo de visitas como no en casa', dt: '3 veces',
        what: 'Máximo de veces que se visita la misma casa como no en casa en esta vuelta (días sin nadie; el mismo día cuenta 1). Al llegar, no entra en tarjetas hasta la próxima vuelta.',
        change: 'Si sube, hay más oportunidades, pero también más molestia para los vecinos. Si baja, se los respeta más, pero quedan más casas sin encontrar a nadie.',
        ex: 'Con 3, una casa sin nadie la primera vez y otras 2 con tarjetas de no en casa ya no entra en esta vuelta.',
        tip: 'Se recomienda 3.' },
      awayRecentDays: { t: 'Días sin incluir tras una visita', dt: '3 días',
        what: 'El intervalo mínimo hasta volver a la misma casa. Las casas visitadas en estos días no entran en tarjetas. Con 0 no hay intervalo.',
        change: 'Si es largo, se respeta más a los vecinos, pero se puede volver menos veces antes de devolver.',
        ex: 'Con 3 días, una casa visitada el lunes entra en tarjetas al menos 3 días después.',
        tip: 'Se recomienda de 3 a 7 días.' },
      awayNoRepeat: { t: 'No repetir el mismo horario', dt: 'Activado',
        what: 'Activado, no se visita la misma casa dos veces en el mismo horario (por ejemplo, entre semana por la mañana). Si ya se probaron los 10, se vuelve empezando por el más antiguo.',
        change: 'Desactivado, se puede ir varias veces en el mismo horario y baja la probabilidad de encontrar a alguien.',
        ex: 'Una casa sin nadie entre semana por la mañana entra después en tarjetas de fin de semana o de tarde.',
        tip: 'Se recomienda activado (es el mecanismo más importante para encontrar a quien no hemos visto).' },
      awayScope: { t: 'Cómo contar los horarios probados', dt: 'Solo esta vuelta',
        what: 'Cómo se decide qué horarios se «probaron». No cambia qué casas son no en casa.',
        change: '«Incluir la vuelta anterior» salta también los horarios probados antes y llega antes a los no probados. «Solo esta vuelta» vuelve a probar en cada vuelta (la vida de las personas cambia).',
        ex: 'Una casa sin nadie entre semana por la mañana en la vuelta anterior: con «Incluir», esta vez se evita ese horario.',
        tip: 'Normalmente «Solo esta vuelta». Si hay muchas casas difíciles, «Incluir».' },
      awayExp: { t: 'Cuándo terminan las tarjetas de no en casa', dt: 'Por días',
        what: 'Cómo se decide cuándo termina automáticamente una tarjeta de no en casa.',
        change: '«Por días»: termina a los días fijados desde que se recibe. «Hasta el plazo del territorio»: se usa desde que se recibió el territorio hasta su plazo de devolución (sin plazo, termina por días).',
        ex: 'Con «Por días» y 7 días, una tarjeta recibida el sábado termina hacia el sábado siguiente.',
        tip: 'Plazos cortos hacen que las tarjetas pasen a otros más fácilmente: se recomienda «Por días».' },
      awayDays: { t: 'Días hasta que termina la tarjeta', dt: '7 días',
        what: 'Días desde que se recibe una tarjeta de no en casa hasta que termina automáticamente.',
        change: 'Si es corto, quedan menos tarjetas sin trabajar. Si es largo, es más fácil ajustarlo al horario personal, pero mientras tanto nadie más puede tomar esas casas.',
        ex: 'Con 7 días, si se recibe el sábado, termina hacia el sábado siguiente.',
        tip: 'Se recomienda 7 días (1 semana).' },
      awayMax: { t: 'Tarjetas de no en casa por persona', dt: 'Hasta 2',
        what: 'Cuántas tarjetas de no en casa puede tener una persona a la vez.',
        change: 'Si sube, se pueden tener tarjetas de varios horarios, pero una persona puede acumular más de lo que puede trabajar.',
        ex: 'Con 2, se puede tener una de mañana y otra de tarde.',
        tip: 'Se recomienda 2.' },
      awayCardMax: { t: 'Casas por tarjeta', dt: 'Hasta 15',
        what: 'Cuántas casas entran en una tarjeta de no en casa. Primero las que llevan más tiempo sin encontrar a nadie. 0 es sin límite.',
        change: 'Si sube, hay más casas por tarjeta y quizá no se terminan en una salida. Si baja, se terminan más fácilmente.',
        ex: 'Con 15, entran hasta 15 casas, empezando por las de más tiempo sin encontrar a nadie.',
        tip: 'Use como medida las casas que se visitan en una salida (1 a 2 horas). En duda, 15.' },
      awayAllTerr: { t: 'Usar también territorios sin registro de terminado', dt: 'No usar',
        what: 'Si también se usan para tarjetas de no en casa las casas de territorios sin registro de terminado en la aplicación (sin responsable).',
        change: 'Con «Usar», también salen tarjetas de territorios trabajados en papel. Con «No usar», solo de territorios terminados.',
        ex: 'Al empezar a usar la aplicación, con pocos registros de terminado, «Usar» da más tarjetas.',
        tip: 'Normalmente se recomienda «No usar».' },
      awayDayOnly: { t: 'Casas para «solo hoy»', dt: 'Hasta 3',
        what: 'Las tarjetas con este número de casas o menos terminan automáticamente al final del día en que se reciben. Con 0 no se usa.',
        change: 'Sirve para que quien pasa cerca por otro asunto visite 1 o 2 casas ese día. Si sube, hay más tarjetas de «solo hoy».',
        ex: 'Con 3, una tarjeta de 2 casas termina a las 23:59 del día en que se recibe.',
        tip: 'Se recomienda 3.' },
      extOn: { t: 'Tarjetas de no en casa tras la devolución', dt: 'Usar',
        what: 'Las casas de un territorio devuelto oficialmente donde aún no se encontró a nadie se dejan descansar un tiempo y luego salen como tarjeta que cualquiera puede tomar, solo en horarios aún no probados.',
        change: 'Con «No usar», tras la devolución esas casas no se visitan hasta la próxima vez que se trabaje el territorio.',
        ex: 'Si quedan 8 no en casa en un territorio devuelto, después de los días de descanso salen como tarjeta tras la devolución.',
        tip: 'Se recomienda «Usar». En zonas donde hubo quejas, use «Detener» en la lista de abajo.' },
      extRest: { t: 'Días de descanso', dt: '7 días',
        what: 'Desde la devolución formal, o desde que terminó la tarjeta anterior, durante estos días no sale tarjeta. Tampoco entra una casa hasta estos días después de la última visita. No puede ser menos de 7.',
        change: 'Cuanto más largo, más respeto a los vecinos, pero más se tarda en volver.',
        ex: 'Con 7 días, un territorio devuelto el domingo sale como tarjeta desde el domingo siguiente.',
        tip: 'Se recomienda 7 días. Si hubo quejas, unos 14.' },
      extCap: { t: 'Visitas por casa (tras la devolución)', dt: '2 veces',
        what: 'Máximo de visitas a la misma casa después de la devolución (el mismo día cuenta 1).',
        change: 'Si sube, hay más oportunidades, pero más molestia para los vecinos.',
        ex: 'Con 2, una casa sin nadie 2 veces tras la devolución ya no entra.',
        tip: 'Se recomienda 2.' },
      extDays: { t: 'Período en que salen', dt: '60 días',
        what: 'Pasados estos días desde la devolución formal, dejan de salir las tarjetas tras la devolución.',
        change: 'Si es largo, hay más oportunidades, pero queda menos pausa antes de la próxima vez que se trabaje el territorio.',
        ex: 'Con 60 días, un territorio devuelto el 1 de marzo sale hasta cerca del 30 de abril.',
        tip: 'Se recomienda 60 días.' },
      extStopBefore: { t: 'Detener antes del próximo turno', dt: '14 días',
        what: 'En territorios con toma automática, se detiene estos días antes de la fecha en que se puede tomar libremente.',
        change: 'Cerca de 0, se visita hasta justo antes de que llegue quien trabajará el territorio, y los vecinos pueden sentir visitas seguidas.',
        ex: 'Si se puede tomar libremente a los 90 días de la devolución y aquí hay 14, se detiene el día 76.',
        tip: 'Se recomienda 14 días.' },
      extList: { t: 'Lista de territorios devueltos',
        what: 'Muestra, por territorio, el estado de las tarjetas tras la devolución, y permite detenerlas o volver a sacarlas.',
        change: '«Detener» las quita enseguida de la lista de todos; «Sacar» las devuelve. Los territorios con préstamo suspendido no salen.',
        ex: 'Detenga una zona donde los vecinos pidieron que no se vaya tantas veces.',
        tip: 'Normalmente puede dejarlo como está.' },
      recoOn: { t: 'Mostrar recomendaciones', dt: 'Mostrar',
        what: 'Si se muestra la pestaña «Recomendaciones» abajo en la pantalla de todos.',
        change: 'Con «No mostrar», la pestaña desaparece para todos.',
        ex: 'Quien quiere visitar 2 o 3 casas en un rato libre encuentra no en casa cercanos.',
        tip: 'Se recomienda «Mostrar».' },
      recoKinds: { t: 'Tipos de recomendaciones', dt: '4 tipos',
        what: 'Qué casas se recomiendan. Se muestra una de cada tipo elegido, por turno.',
        change: 'Con menos tipos, el objetivo es más claro, pero pueden salir menos casas.',
        ex: 'Si muchos predican entre semana a mediodía, elija también «Empresas y tiendas».',
        tip: 'Al principio, 4 (no en casa cercanos, buen horario ahora, cambiar de horario, mucho tiempo sin ver). Mire abajo el registro y deje los tipos con más encuentros.' },
      recoCount: { t: 'Cuántas a la vez', dt: '3',
        what: 'Cuántas recomendaciones se muestran a la vez.',
        change: 'Con más, hay más para elegir, pero la pantalla es más larga y cuesta decidir.',
        ex: 'Con 3, salen 3 casas para un rato libre.',
        tip: 'Se recomienda 3.' },
      recoDist: { t: 'Distancia de «cerca»', dt: 'Hasta 500 m',
        what: 'Hasta qué distancia del lugar actual se considera «cerca».',
        change: 'Si sube, salen más casas, pero hay que desplazarse más.',
        ex: '500 m son unos 7 u 8 minutos caminando.',
        tip: 'Zonas a pie, 500 m; zonas en coche, de 1000 a 2000 m.' },
      recoLongDays: { t: 'Días de «mucho tiempo sin ver»', dt: '180 días',
        what: 'Las casas donde no se encontró a nadie en estos días se consideran «mucho tiempo sin ver».',
        change: 'Si baja, salen más casas, también algunas visitadas hace poco.',
        ex: 'Con 180 días, salen casas sin encontrar a nadie en más de medio año.',
        tip: 'Se recomienda 180 días.' },
      recoSkipDays: { t: 'Días sin recomendar tras una visita', dt: '14 días',
        what: 'Después de que alguien visita una casa, durante estos días no se recomienda.',
        change: 'Si sube, va menos gente seguida a la misma casa. Con 0 no se usa.',
        ex: 'Con 14 días, una casa visitada hoy no se recomienda durante 2 semanas.',
        tip: 'Se recomienda 14 días.' },
      recoOthers: { t: 'Incluir territorios de otros', dt: 'Mostrar',
        what: 'Si también se recomiendan casas de territorios que tiene otra persona.',
        change: 'Con «Mostrar», en el mapa del responsable aparece la marca verde (no se muestra quién fue). Con «No mostrar», no salen casas de territorios de otros.',
        ex: 'Aunque el responsable no haya podido ir en un tiempo, alguien que está cerca puede visitar.',
        tip: 'Se recomienda «Mostrar». Si muchos responsables prefieren ir ellos mismos, «No mostrar».' },
      recoCardOut: { t: 'Casas en tarjetas de no en casa de otros', dt: 'No mostrar',
        what: 'Si se recomiendan casas que están en la tarjeta de no en casa de otra persona.',
        change: 'Con «Mostrar», otra persona puede ir antes de lo que planeó quien tiene la tarjeta.',
        ex: 'Quien tiene la tarjeta piensa ir el sábado por la tarde y otra persona va el viernes.',
        tip: 'Se recomienda «No mostrar».' },
      recoCardBtn: { t: 'Botón para recibir la tarjeta de no en casa', dt: 'Mostrar',
        what: 'Si se muestra el botón «Recibir la tarjeta de no en casa de este territorio» cuando hay una tarjeta para el horario actual en el territorio de la casa recomendada.',
        change: 'Con «Mostrar», se pueden visitar juntos los no en casa de alrededor.',
        ex: 'Al visitar una casa cercana, se puede recibir también la tarjeta de ese territorio.',
        tip: 'Se recomienda «Mostrar».' },
      mapStd: { t: 'Mapa inicial de los publicadores', dt: 'Mapa fácil de ver',
        what: 'El tipo de mapa para quienes no eligieron uno.',
        change: 'El «mapa con más nombres» muestra más nombres y calles (el fondo se aclara un poco). No cambia para quien ya eligió.',
        ex: 'Si muchos buscan lugares por nombres y puntos de referencia, use el «mapa con más nombres».',
        tip: 'En duda, deje el «mapa fácil de ver».' },
      keepMonths: { t: 'Tiempo que se guardan las visitas', dt: '12 meses',
        what: 'Los registros más antiguos se ordenan cada mes dejando solo el último de cada casa (si está activada la limpieza automática).',
        change: 'Si es largo, se ve mejor en qué horarios se encuentra a la gente, pero se guardan más tiempo datos sobre los vecinos. Si es corto, es más seguro, pero las tendencias se ven menos.',
        ex: 'Si cada territorio se trabaja cada 4 meses, con 12 meses quedan unas 3 vueltas.',
        tip: 'Los datos de las personas se guardan solo el tiempo necesario para su fin. No lo alargue más de lo necesario: de 12 a 24 meses.' },
      cacheDays: { t: 'Datos en dispositivos sin conexión', dt: '30 días',
        what: 'Un teléfono que no se conecta durante estos días borra automáticamente los datos de territorios guardados.',
        change: 'Si es corto, un teléfono perdido muestra datos menos tiempo y es más seguro; pero quien no abrió la app en un tiempo tendrá que volver a cargar.',
        ex: 'Con 30 días, un teléfono que no abrió la app en un mes borra los datos de territorios.',
        tip: 'Se recomienda 30 días. Si preocupa perder teléfonos, unos 14.' },
      syncGroupSec: { t: 'Intervalo al predicar juntos', dt: '7 segundos',
        what: 'Cada cuánto se buscan los registros de los demás cuando se predica juntos.',
        change: 'Más corto: se ve antes, pero el servidor se satura más y gasta batería.',
        ex: 'Con 7 segundos, la casa que registra un compañero aparece en su mapa en unos 7 segundos.',
        tip: 'Se recomienda 7 segundos (sobra aunque lo usen 80 personas a la vez).' },
      syncNormalSec: { t: 'Intervalo normal', dt: '20 segundos',
        what: 'Cada cuánto se buscan registros nuevos al mirar tarjetas o el mapa.',
        change: 'Más corto: se ve antes, pero el servidor se satura más.',
        ex: 'Con 20 segundos, los registros de otros aparecen en unos 20 segundos.',
        tip: 'Se recomienda 20 segundos. Si va lento, alárguelo.' },
      remindDays: { t: 'Aviso al publicador (revisitas)', dt: '3 semanas',
        what: 'Si en una revisita a su cargo no hay visitas en este tiempo, se avisa al publicador: «hace tiempo sin visitar».',
        change: 'Más corto: se recuerda antes, pero hay más avisos.',
        ex: 'Con 3 semanas, se avisa 3 semanas después de la última visita.',
        tip: 'Se recomienda 3 semanas.' },
      escalateDays: { t: 'Aviso al encargado (revisitas)', dt: '6 semanas',
        what: 'Si en una revisita a cargo de alguien no hay visitas en este tiempo, se avisa al encargado: «requiere revisión».',
        change: 'Más corto: el encargado revisa más. Siempre es al menos 1 semana más que el aviso al publicador.',
        ex: 'Con 6 semanas, aparece en la pantalla del encargado 6 semanas después de la última visita.',
        tip: 'Se recomienda 6 semanas.' }
    }
  };
  window.HELP = HELP;

  /* ---------- しくみ ---------- */
  var lang = function () { return window.KI && KI.lang === 'es' ? 'es' : 'ja'; };
  var item = function (k) { return (HELP[lang()] && HELP[lang()][k]) || HELP.ja[k] || null; };
  var ui = function (s) { return HELP.ui[lang()][s]; };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var SHEET_KEYS = { adjTries: 1, adjYoung: 1 }; // 係のシートの中で付けてよいもの（伝道者のシートには付けない）

  /* 行の中の操作から、説明のキーを見つける（data-hk があればそれを優先） */
  var SRC = [
    ['data-sset', null], ['data-kset', null], ['data-aset', null], ['data-set', null], ['data-dueset', null], ['data-range', null],
    ['data-takemax', 'selfTakeMax'], ['data-donepct', 'donePct'], ['data-mapstd', 'mapStd'], ['data-adjt', 'adjTries'], ['data-offadd', 'offDays']];
  function keyOf(row) {
    if (row.getAttribute('data-hk')) return row.getAttribute('data-hk');
    for (var i = 0; i < SRC.length; i++) {
      var el = row.querySelector('[' + SRC[i][0] + ']');
      if (el) return SRC[i][1] || el.getAttribute(SRC[i][0]);
    }
    return '';
  }
  function qBtn(k) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'qhelp'; b.setAttribute('data-qhelp', k);
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-label', (item(k) || {}).t + ui('about'));
    b.setAttribute('data-notr', '');
    b.textContent = '?';
    return b;
  }
  var isAdm = function () { try { return typeof isAdmin === 'function' && isAdmin(); } catch (e) { return false; } };
  var demo = function () { try { return typeof LIVE !== 'undefined' && !LIVE; } catch (e) { return false; } };
  var warned = {};
  function decorate(root, inSheet) {
    if (!root) return;
    if (inSheet && !isAdm()) return;
    var rows = root.querySelectorAll('.setrow:not([data-hq])');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      row.setAttribute('data-hq', '1'); // 1回だけ
      var k = keyOf(row); if (!k) continue;
      if (inSheet && !SHEET_KEYS[k]) continue;
      if (!HELP.ja[k]) { if (demo() && !warned[k]) { warned[k] = 1; console.info('説明のない設定：' + k); } continue; }
      var lab = row.firstElementChild; if (!lab || lab.querySelector('.qhelp')) continue;
      var br = lab.querySelector('br');
      if (br && br.parentNode === lab) lab.insertBefore(qBtn(k), br); else lab.appendChild(qBtn(k));
    }
    var heads = root.querySelectorAll('[data-hqk]:not([data-hq])');
    for (var j = 0; j < heads.length; j++) {
      var h = heads[j], hk = h.getAttribute('data-hqk');
      h.setAttribute('data-hq', '1');
      if (inSheet && !SHEET_KEYS[hk]) continue;
      if (HELP.ja[hk] && !h.querySelector('.qhelp')) h.appendChild(qBtn(hk));
    }
  }
  /* 見出しに付けるとき用（HTMLの文字で返す） */
  window.helpBtn = function (k) { return '<button type="button" class="qhelp" data-qhelp="' + escH(k) + '" aria-haspopup="dialog" data-notr aria-label="' + escH((item(k) || {}).t + ui('about')) + '">?</button>'; };

  /* 描きかえを見張って、1回のまとまりにつき1回だけ付け直す */
  function watch(el, inSheet) {
    if (!el || !window.MutationObserver) return;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return; queued = true;
      requestAnimationFrame(function () { queued = false; decorate(el, inSheet); });
    }).observe(el, { childList: true, subtree: true });
    decorate(el, inSheet);
  }

  /* ---------- 見た目 ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.qhelp{position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;min-height:0;margin:0 0 0 6px;padding:0;' +
      'border:2px solid var(--brand,#17324D);border-radius:50%;background:#fff;color:var(--brand,#17324D);font:800 14px/1 system-ui,sans-serif;vertical-align:middle;cursor:pointer;flex:none}' +
    '.qhelp::before{content:"";position:absolute;inset:-11px}' + /* 押せる範囲は44px */
    '.qhelp:active,.qhelp:focus-visible{background:var(--brand,#17324D);color:#fff;outline:none}' +
    '#qhelpBack{position:fixed;inset:0;background:#00000066;z-index:2499}' +
    '#qhelpPop{position:fixed;left:0;right:0;bottom:0;z-index:2500;background:var(--paper,#fff);border-radius:20px 20px 0 0;max-height:80vh;max-height:80dvh;overflow:auto;' +
      'padding:12px 16px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px #0003;font-size:18px;line-height:1.7;color:var(--ink,#17324D);overscroll-behavior:contain}' +
    '#qhelpPop.snap{transition:transform .2s ease}' +
    '@media (min-width:760px){#qhelpPop{left:calc(50% - 320px);right:auto;width:640px;bottom:16px;border-radius:20px}}' +
    '#qhelpPop h2{font-size:21px;line-height:1.4;margin:2px 0 10px}' +
    '#qhelpPop h3{font-size:15px;margin:12px 0 2px;color:var(--ink2,#4A5F73);display:flex;align-items:center;gap:8px}' +
    '#qhelpPop h3::before{content:"";width:6px;height:18px;border-radius:3px;background:var(--terr,#0E7C66)}' +
    '#qhelpPop p{margin:0}' +
    '#qhelpPop .qex{background:var(--terr-soft,#E5F2EE);border-radius:10px;padding:8px 12px}' +
    '#qhelpPop .qnow{margin:16px 0 10px;padding-top:10px;border-top:2px solid var(--line,#C8D2CD);font-size:16px;display:flex;flex-wrap:wrap;gap:4px 18px}' +
    '#qhelpPop .qnow b{font-weight:800}' +
    '#qhelpPop .btn{margin-top:8px}';
  document.head.appendChild(css);

  /* ---------- 説明の画面 ---------- */
  var pop = null, back = null, lastBtn = null, curKey = '';
  function curText(btn) {
    var row = btn && btn.closest('.setrow'); if (!row) return '';
    var o = row.querySelector('.stepper output, .rng output') || row.querySelector('.seg [aria-pressed="true"]');
    return o ? o.textContent.trim() : '';
  }
  function curVal(k) {
    var v = (typeof D === 'function' && D().settings) ? D().settings[k] : null;
    if (k === 'groupOn' || k === 'lockOthers' || k === 'memoSync' || k === 'skipDone' || k === 'recoOn' || k === 'extOn')
      return v === 0 || v === '0' ? 0 : 1; // 書いていなければ「使う」側
    return v == null || v === '' || !isFinite(Number(v)) ? HELP.def[k] : Number(v);
  }
  function close() {
    if (!pop || pop.hidden) return;
    pop.hidden = true; back.hidden = true; pop.style.transform = '';
    if (lastBtn && document.contains(lastBtn)) lastBtn.focus({ preventScroll: true });
  }
  function build() {
    back = document.createElement('div'); back.id = 'qhelpBack'; back.hidden = true; back.setAttribute('data-notr', '');
    pop = document.createElement('div'); pop.id = 'qhelpPop'; pop.hidden = true;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-labelledby', 'qhelpTitle'); pop.setAttribute('data-notr', '');
    document.body.appendChild(back); document.body.appendChild(pop);
    back.addEventListener('click', close);
    pop.addEventListener('click', function (e) {
      if (e.target.closest('[data-qok]')) close();
      else if (e.target.closest('[data-qreset]')) reset(curKey);
    });
    /* 下にスワイプで閉じる（#sheet と同じ90px） */
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
      if (dy > 90) { close(); return; }
      pop.classList.add('snap'); pop.style.transform = '';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop && !pop.hidden) { e.stopPropagation(); close(); } }, true);
  }
  function open(k, btn) {
    var it = item(k); if (!it) return;
    if (!pop) build();
    lastBtn = btn; curKey = k;
    var cur = curText(btn), has = Object.prototype.hasOwnProperty.call(HELP.def, k) && k !== 'memoSync';
    var showReset = has && isAdm() && curVal(k) !== HELP.def[k];
    var sec = function (h, body, cls) { return body ? '<h3>' + escH(h) + '</h3><p' + (cls ? ' class="' + cls + '"' : '') + '>' + escH(body) + '</p>' : ''; };
    pop.innerHTML = '<span class="grab" aria-hidden="true"></span>' +
      '<h2 id="qhelpTitle" tabindex="-1">' + escH(it.t) + '</h2>' +
      sec(ui('what'), it.what) + sec(ui('change'), it.change) + sec(ui('ex'), it.ex, 'qex') + sec(ui('tip'), it.tip) +
      (cur || it.dt ? '<div class="qnow">' + (cur ? '<span>' + escH(ui('cur')) + '：<b>' + escH(cur) + '</b></span>' : '') +
        (it.dt ? '<span>' + escH(ui('def')) + '：<b>' + escH(it.dt) + '</b></span>' : '') + '</div>' : '') +
      (showReset ? '<button type="button" class="btn block" data-qreset>' + escH(ui('reset')) + '</button>' : '') +
      '<button type="button" class="btn primary block" data-qok>' + escH(ui('ok')) + '</button>';
    pop.style.transform = '';
    pop.hidden = false; back.hidden = false;
    pop.scrollTop = 0; // 見えるようにしてから上に戻す（隠したままでは効かない）
    var h = pop.querySelector('h2'); if (h) h.focus({ preventScroll: true });
  }
  /* はじめの値に戻す：2択は、そのボタンを押したことにする（今の処理・知らせをそのまま使う） */
  function reset(k) {
    if (!isAdm() || !Object.prototype.hasOwnProperty.call(HELP.def, k) || k === 'memoSync') return;
    var d = HELP.def[k], view = document.getElementById('view-admin') || document;
    var b = view.querySelector('[data-sset="' + k + '"][data-v="' + d + '"]') || (k === 'mapStd' ? view.querySelector('[data-mapstd="' + d + '"]') : null);
    close();
    if (b) { b.click(); return; }
    D().settings[k] = d; Store.save(); renderAll();
    if (typeof toast === 'function') toast(ui('done'));
  }

  /* 「？」を押したとき：ほかの処理（2択・−＋・シートのクリックなど）に渡さない */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-qhelp]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open(b.getAttribute('data-qhelp'), b);
  }, true);

  function start() {
    watch(document.getElementById('view-admin'), false);
    watch(document.getElementById('sheetBody'), true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
