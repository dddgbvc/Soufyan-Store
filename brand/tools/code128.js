/**
 * مولّد باركود Code 128 — يرسم الباركود كـ SVG بلا أي مكتبة خارجية.
 * ==============================================================
 * يُستعمل في مكانين: صفحة تصميم ملصقات الباركود، وبرنامج المتجر.
 *
 *   Code128.svg("SFN-00123", { height: 60, module: 2 })  →  نص SVG
 *
 * يختار الترميز تلقائياً:
 *   - النمط C إذا كان النص أرقاماً فقط وعددها زوجي (ضِعف الكثافة)
 *   - النمط B فيما عدا ذلك (أرقام + حروف + رموز)
 */
(function (root) {
  'use strict';

  // 107 نمطاً: كل نمط ست خانات تمثّل عرض الشرائط والفراغات بالتناوب
  var PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
    '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
    '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
    '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
    '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
    '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
    '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
    '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
    '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
    '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
    '211214', '211232', '2331112'
  ];

  var START_B = 104, START_C = 105, STOP = 106;

  /** يحوّل النص إلى قائمة قيم Code128 مع رمز البداية والتدقيق. */
  function encode(text) {
    var digitsOnly = /^\d+$/.test(text);
    var useC = digitsOnly && text.length % 2 === 0 && text.length >= 4;
    var start = useC ? START_C : START_B;
    var values = [];

    if (useC) {
      for (var i = 0; i < text.length; i += 2) values.push(parseInt(text.substr(i, 2), 10));
    } else {
      for (var j = 0; j < text.length; j++) {
        var code = text.charCodeAt(j);
        if (code < 32 || code > 126) {
          throw new Error('Code128: حرف غير مدعوم «' + text[j] + '»');
        }
        values.push(code - 32);
      }
    }

    // مجموع التدقيق: رمز البداية + (الموقع × القيمة) لكل رمز، ثم باقي القسمة على 103
    var sum = start;
    for (var k = 0; k < values.length; k++) sum += (k + 1) * values[k];

    return [start].concat(values, [sum % 103], [STOP]);
  }

  /** يحوّل القيم إلى مستطيلات سوداء بعرض متغيّر. */
  function bars(values, module) {
    var out = [], x = 0;
    for (var i = 0; i < values.length; i++) {
      var pattern = PATTERNS[values[i]];
      for (var p = 0; p < pattern.length; p++) {
        var w = parseInt(pattern[p], 10) * module;
        if (p % 2 === 0) out.push({ x: x, w: w });   // الخانات الزوجية شرائط
        x += w;
      }
    }
    return { rects: out, width: x };
  }

  /**
   * يبني الباركود كنص SVG جاهز للإدراج.
   * options: height (ارتفاع الشرائط), module (عرض أنحف شريحة),
   *          text (إظهار النص أسفل الباركود), color, fontSize
   */
  function svg(text, options) {
    var o = options || {};
    var module = o.module || 2;
    var height = o.height || 60;
    var color = o.color || '#101E24';
    var showText = o.text !== false;
    var fontSize = o.fontSize || 13;
    var pad = o.quietZone === undefined ? 10 * module : o.quietZone;

    var b = bars(encode(text), module);
    var textH = showText ? fontSize + 6 : 0;
    var totalW = b.width + pad * 2;
    var totalH = height + textH;

    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalW +
      ' ' + totalH + '" width="' + totalW + '" height="' + totalH +
      '" shape-rendering="crispEdges" role="img" aria-label="باركود ' + text + '">'];
    parts.push('<rect width="' + totalW + '" height="' + totalH + '" fill="#fff"/>');
    for (var i = 0; i < b.rects.length; i++) {
      parts.push('<rect x="' + (b.rects[i].x + pad) + '" y="0" width="' + b.rects[i].w +
        '" height="' + height + '" fill="' + color + '"/>');
    }
    if (showText) {
      parts.push('<text x="' + (totalW / 2) + '" y="' + (totalH - 2) +
        '" text-anchor="middle" font-family="monospace" font-size="' + fontSize +
        '" letter-spacing="' + (module * 0.8) + '" fill="' + color + '">' +
        String(text).replace(/[<&>]/g, '') + '</text>');
    }
    parts.push('</svg>');
    return parts.join('');
  }

  var Code128 = { encode: encode, svg: svg, PATTERNS: PATTERNS };

  if (typeof module !== 'undefined' && module.exports) module.exports = Code128;
  else root.Code128 = Code128;
})(typeof self !== 'undefined' ? self : this);
