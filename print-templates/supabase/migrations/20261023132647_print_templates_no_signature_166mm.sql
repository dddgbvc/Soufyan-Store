-- بدون تواقيع، وطول الوصل الاعتيادي 166mm (الإصدار 4)
insert into public.print_templates (tenant_id, key, kind, name, css, js, version)
values (null, '_base', 'base', 'الأساس المشترك', $pt$/* ============ أساس مشترك لكل المطبوعات ============ */
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000}
body{font-family:'El Messiri',sans-serif;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;overflow:hidden;background:#fff}
.n{direction:ltr;unicode-bidi:isolate}
.bc svg{display:block;width:100%;height:100%}
[data-logo] svg{display:block;width:100%;height:100%}

/* ============ الستيكرات (على نمط المرجع) ============ */
.st{
  --k:1; --gc:1fr 1fr; --lw:calc(5.4mm*var(--k));
  --ts:calc(9.6pt*var(--k)); --ps:calc(12pt*var(--k));
  --bw:calc(28mm*var(--k)); --bh:calc(6mm*var(--k)); --cs:calc(6pt*var(--k));
  width:var(--w);height:var(--h);
  padding:calc(4.6mm*var(--k)) calc(5.4mm*var(--k)) calc(4mm*var(--k));
  display:flex;flex-direction:column
}
.st .hd{display:flex;align-items:center;gap:calc(2.6mm*var(--k));padding-bottom:calc(3mm*var(--k));border-bottom:.15mm solid #000}
.st .lg{width:var(--lw);height:var(--lw);flex:none;display:block}
.st .tt{flex:1;min-width:0}
.st .tt b{display:block;font-weight:700;font-size:var(--ts);line-height:1.12;white-space:nowrap;overflow:hidden}
.st .pr{flex:none;font-weight:400;font-size:var(--ps);line-height:1;white-space:nowrap}
.st .sp{flex:1;display:flex;flex-direction:column;justify-content:center;padding:calc(2.6mm*var(--k)) 0}
.st .cols{display:grid;grid-template-columns:var(--gc);column-gap:calc(6mm*var(--k))}
.st .cols>div{display:grid;grid-template-columns:max-content 1fr;column-gap:calc(2.4mm*var(--k));row-gap:calc(2.9mm*var(--k));align-content:start;align-items:baseline}
.st .cols .r{display:contents}
.st .cols .v{justify-self:start}
.st .r{display:flex;align-items:baseline;gap:calc(2.4mm*var(--k));white-space:nowrap;line-height:1}
.st .r .l{font-weight:600;font-size:calc(5.6pt*var(--k))}
.st .r .v{font-weight:400;font-size:calc(6.4pt*var(--k));white-space:nowrap;line-height:1}
.st .r .v.n{letter-spacing:.03em}
.st .wide{margin-top:calc(2.9mm*var(--k))}
.st .ft{border-top:.15mm solid #000;padding-top:calc(3.6mm*var(--k));display:flex;flex-direction:column;align-items:center}
.st .ft.only{border-top:0;padding-top:0;flex:1;justify-content:center}
.st .bc{width:var(--bw);height:var(--bh)}
.st .code{font-size:var(--cs);font-weight:500;letter-spacing:.3em;line-height:1;margin-top:calc(1.4mm*var(--k));direction:ltr;padding-left:.3em}

/* ============ الوصولات الحرارية 80mm (خفيفة الحبر) ============ */
.rc{width:80mm;min-height:166mm;padding:5mm 5mm 4mm;font-size:7.6pt;line-height:1.3;display:flex;flex-direction:column}
.rc .hd{display:flex;align-items:center;justify-content:center;gap:2.4mm}
.rc .hd i{display:block;width:7.5mm;height:7.5mm;flex:none}
.rc .hd h1{font-size:11pt;font-weight:700;line-height:1}
.rc .hd .ad{font-size:6.2pt;line-height:1;margin-top:1.4mm}
.rc .tl{display:flex;justify-content:space-between;align-items:baseline;border-top:.2mm solid #000;border-bottom:.2mm solid #000;padding:2.3mm 0 2.1mm;margin-top:4.2mm}
.rc .tl b{font-size:10pt;font-weight:700;line-height:1}
.rc .tl span{font-size:8.6pt;font-weight:600;direction:ltr;letter-spacing:.08em;line-height:1}
.rc .r{display:flex;justify-content:space-between;gap:3mm;margin-top:1.8mm}
.rc .tl + .r{margin-top:2.8mm}
.rc .r .l{font-weight:500;flex:none}
.rc .r .v{font-weight:600;text-align:left}
.rc .grp{margin-top:3mm;padding-top:2.6mm;border-top:.15mm solid #000}
.rc .grp>:first-child{margin-top:0}
.rc .it{display:flex;justify-content:space-between;gap:3mm;margin-top:1.8mm}
.rc .it b{font-weight:600}
.rc .it small{font-size:6.4pt;margin-inline-start:1.4mm}
.rc .tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:3mm;padding:2.4mm 0 2.2mm;border-top:.2mm solid #000;border-bottom:.75mm double #000}
.rc .tot + .r{margin-top:2.8mm}
.rc .tot span{font-size:8.4pt;font-weight:700}
.rc .tot b{font-size:11pt;font-weight:700;line-height:1}
.rc .txt{margin-top:2mm;font-weight:500;line-height:1.5}
.rc .terms{margin:3.8mm 0 4.2mm;padding:0 2mm;font-size:6.2pt;line-height:1.6;text-align:center}
.rc .bc{flex:none;height:7mm;margin:auto 14mm 0}
.rc .code{text-align:center;font-size:7pt;font-weight:600;letter-spacing:.3em;margin-top:1.4mm;direction:ltr;line-height:1}
.rc .ft{text-align:center;margin-top:3.6mm;font-size:6.8pt;line-height:1.75}
.rc .ft b{font-size:8pt}$pt$, $pt$/* تشغيل مشترك لكل المطبوعات: الشعار، باركود Code128، ملاءمة الاسم، وطول الوصل */
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
})();$pt$, 4)
on conflict on constraint print_templates_tenant_key do update set css = excluded.css, js = excluded.js, version = excluded.version, updated_at = now();

insert into public.print_templates (tenant_id, key, kind, name, html, version)
values
(null, 'receipt_payment', 'receipt', $pt$وصل قبض$pt$, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>وصل قبض</b><span>{{number}}</span></div>
  {{> rc_people}}
  <div class="grp">
    {{#description}}<div class="r"><span class="l">البيان</span><span class="v">{{description}}</span></div>{{/description}}
    {{#paid}}<div class="r"><span class="l">المبلغ المقبوض</span><span class="v"><span class="n">{{paid}}</span> د.ع</span></div>{{/paid}}
    <div class="r"><span class="l">الرصيد السابق</span><span class="v"><span class="n">{{previous_balance}}</span> د.ع</span></div>
  </div>
  <div class="tot"><span>الرصيد المتبقّي</span><b><span class="n">{{remaining}}</span> د.ع</b></div>
  {{#next_payment_date}}<div class="r"><span class="l">الدفعة القادمة</span><span class="v"><span class="n">{{next_payment_date}}</span>{{#next_payment_amount}} — <span class="n">{{next_payment_amount}}</span> د.ع{{/next_payment_amount}}</span></div>{{/next_payment_date}}
  <div class="terms">احتفظ بالوصل كإثبات للدفع · أي مبلغ بدون وصل رسمي لا يُعتمد</div>
  <div class="bc" data-code="{{number}}"></div><div class="code">{{number}}</div>
  <div class="ft"><b>شكراً لتعاملك</b><br>{{> rc_contacts}}</div>
</div>$pt$, 4),
(null, 'receipt_debt', 'receipt', $pt$وصل إضافة دين$pt$, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>وصل إضافة دين</b><span>{{number}}</span></div>
  {{> rc_people}}
  <div class="grp">
    {{#description}}<div class="r"><span class="l">البيان</span><span class="v">{{description}}</span></div>{{/description}}
    {{#items}}<div class="it"><span><b><bdi>{{name}}</bdi></b>{{#detail}}<small><bdi>{{detail}}</bdi></small>{{/detail}}</span><b class="n">{{amount}}</b></div>{{/items}}
  </div>
  <div class="grp">
    <div class="r"><span class="l">المبلغ المُضاف</span><span class="v"><span class="n">{{amount}}</span> د.ع</span></div>
    <div class="r"><span class="l">الرصيد السابق</span><span class="v"><span class="n">{{previous_balance}}</span> د.ع</span></div>
  </div>
  <div class="tot"><span>الرصيد الكلّي</span><b><span class="n">{{balance}}</span> د.ع</b></div>
  {{#due_date}}<div class="r"><span class="l">موعد التسديد</span><span class="v"><span class="n">{{due_date}}</span>{{#due_amount}} — <span class="n">{{due_amount}}</span> د.ع{{/due_amount}}</span></div>{{/due_date}}
  <div class="terms">المبلغ أعلاه دَين على الزبون ويُسدَّد بالموعد المتفق عليه · احتفظ بالوصل لمراجعة الرصيد</div>
  <div class="bc" data-code="{{number}}"></div><div class="code">{{number}}</div>
  <div class="ft"><b>شكراً لثقتك</b><br>{{> rc_contacts}}</div>
</div>$pt$, 4),
(null, 'receipt_return', 'receipt', $pt$وصل مرتجعات$pt$, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>وصل مرتجعات</b><span>{{number}}</span></div>
  {{> rc_people}}
  {{#original_invoice}}<div class="r"><span class="l">الفاتورة الأصلية</span><span class="v n">{{original_invoice}}</span></div>{{/original_invoice}}
  <div class="grp">
    {{#items}}<div class="it"><span><b><bdi>{{name}}</bdi></b>{{#detail}}<small><bdi>{{detail}}</bdi></small>{{/detail}}</span><b class="n">{{amount}}</b></div>{{/items}}
  </div>
  <div class="grp">
    {{#reason}}<div class="r"><span class="l">السبب</span><span class="v">{{reason}}</span></div>{{/reason}}
    {{#item_condition}}<div class="r"><span class="l">حالة المادة</span><span class="v">{{item_condition}}</span></div>{{/item_condition}}
    {{#resolution}}<div class="r"><span class="l">المعالجة</span><span class="v">{{resolution}}</span></div>{{/resolution}}
  </div>
  <div class="tot"><span>المبلغ المُسترَد</span><b><span class="n">{{refund}}</span> د.ع</b></div>
  <div class="terms">الإرجاع أو الاستبدال خلال 3 أيام من الشراء · المادة سليمة وغير مستعملة مع علبتها · بإبراز الفاتورة الأصلية فقط</div>
  <div class="bc" data-code="{{number}}"></div><div class="code">{{number}}</div>
  <div class="ft"><b>شكراً لتعاملك</b><br>{{> rc_contacts}}</div>
</div>$pt$, 4)
on conflict on constraint print_templates_tenant_key do update set html = excluded.html, version = excluded.version, updated_at = now();

insert into public.print_templates (tenant_id, key, kind, name, css, version)
values (null, 'receipt_repair', 'receipt', $pt$وصل صيانة — نسخة الزبون$pt$, $pt$.rc .r,.rc .it{margin-top:1.5mm}
.rc .grp{margin-top:2.5mm;padding-top:2.2mm}$pt$, 4)
on conflict on constraint print_templates_tenant_key do update set css = excluded.css, version = excluded.version, updated_at = now();

update public.print_templates set version = 4, updated_at = now() where tenant_id is null and version < 4;
