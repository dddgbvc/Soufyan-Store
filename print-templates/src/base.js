/* تشغيل مشترك لكل المطبوعات: الشعار، باركود Code128، ملاءمة الاسم، وطول الوصل */
(function () {
  // الشعار الحديث — مربع مدوّر بثلاث أعمدة (الهوية الجديدة)، أسود وأبيض
  var BARS = [[89, 148, 56], [135, 122, 82], [181, 96, 108]];
  var LOGO = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" rx="84" fill="#000"/>' +
    BARS.map(function (b) { return '<rect x="' + b[0] + '" y="' + b[1] + '" width="30" height="' + b[2] + '" rx="15" fill="#fff"/>'; }).join('') + '</svg>';

  // Code128 (B و C تلقائياً) — جدول الرموز القياسي
  var P = '11011001100 11001101100 11001100110 10010011000 10010001100 10001001100 10011001000 10011000100 10001100100 11001001000 11001000100 11000100100 10110011100 10011011100 10011001110 10111001100 10011101100 10011100110 11001110010 11001011100 11001001110 11011100100 11001110100 11101101110 11101001100 11100101100 11100100110 11101100100 11100110100 11100110010 11011011000 11011000110 11000110110 10100011000 10001011000 10001000110 10110001000 10001101000 10001100010 11010001000 11000101000 11000100010 10110111000 10110001110 10001101110 10111011000 10111000110 10001110110 11101110110 11010001110 11000101110 11011101000 11011100010 11011101110 11101011000 11101000110 11100010110 11101101000 11101100010 11100011010 11101111010 11001000010 11110001010 10100110000 10100001100 10010110000 10010000110 10000101100 10000100110 10110010000 10110000100 10011010000 10011000010 10000110100 10000110010 11000010010 11001010000 11110111010 11000010100 10001111010 10100111100 10010111100 10010011110 10111100100 10011110100 10011110010 11110100100 11110010100 11110010010 11011011110 11011110110 11110110110 10101111000 10100011110 10001011110 10111101000 10111100010 11110101000 11110100010 10111011110 10111101110 11101011110 11110101110 11010000100 11010010000 11010011100 1100011101011'.split(' ');

  function code128(text) {
    var t = String(text).replace(/[^\x20-\x7e]/g, '?'), v = [], i = 0, set;
    function digits(k) { var n = 0; while (k + n < t.length && t.charCodeAt(k + n) >= 48 && t.charCodeAt(k + n) <= 57) n++; return n; }
    var d0 = digits(0);
    set = (d0 >= 4 || (d0 === t.length && d0 >= 2)) ? 'C' : 'B';
    v.push(set === 'C' ? 105 : 104);
    while (i < t.length) {
      if (set === 'C') {
        if (digits(i) >= 2) { v.push(+t.substr(i, 2)); i += 2; continue; }
        v.push(100); set = 'B'; continue;
      }
      var n = digits(i);
      if (n >= 6 || (n >= 4 && i + n === t.length)) {
        if (n % 2) { v.push(t.charCodeAt(i) - 32); i++; }
        v.push(99); set = 'C'; continue;
      }
      v.push(t.charCodeAt(i) - 32); i++;
    }
    var sum = v[0];
    for (var j = 1; j < v.length; j++) sum += v[j] * j;
    v.push(sum % 103, 106);
    return v.map(function (x) { return P[x]; }).join('');
  }

  function barcodeSVG(text) {
    var m = code128(text), rects = '', x = 0;
    while (x < m.length) {
      if (m[x] === '1') { var w = 0; while (m[x + w] === '1') w++; rects += '<rect x="' + x + '" width="' + w + '" height="1"/>'; x += w; }
      else x++;
    }
    return '<svg viewBox="0 0 ' + m.length + ' 1" preserveAspectRatio="none" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">' + rects + '</svg>';
  }

  document.querySelectorAll('[data-logo]').forEach(function (e) { e.innerHTML = LOGO; });
  document.querySelectorAll('[data-code]').forEach(function (e) { if (e.dataset.code) e.innerHTML = barcodeSVG(e.dataset.code); });

  function finish() {
    // اسم المنتج يصغر لحد ما يجي بسطر واحد
    document.querySelectorAll('.st .tt b').forEach(function (e) {
      var s = parseFloat(getComputedStyle(e).fontSize);
      while (e.scrollWidth > e.clientWidth + 0.5 && s > 6) { s -= 0.25; e.style.fontSize = s + 'px'; }
    });
    // طول ورقة الوصل: 166mm للوصل الاعتيادي (min-height بالـ CSS)، ويطول إذا المحتوى أكثر
    var rc = document.querySelector('.rc');
    if (rc) {
      var px2mm = 25.4 / 96, min = Math.round(parseFloat(getComputedStyle(rc).minHeight) * px2mm) || 0;
      var mm = Math.max(min, Math.ceil(rc.getBoundingClientRect().height * px2mm - 0.05)), st = document.createElement('style');
      st.textContent = '@page{size:80mm ' + mm + 'mm;margin:0}';
      document.head.appendChild(st);
    }
    window.__printReady = true;
    document.dispatchEvent(new Event('print-ready'));
    if (window.__autoPrint) window.print();
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(finish);
})();
