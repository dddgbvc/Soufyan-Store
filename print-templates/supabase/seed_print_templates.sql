-- مولَّد من print-templates/build.mjs — لا تعدّله بالإيد
insert into public.print_templates (tenant_id, key, kind, name, width_mm, height_mm, html, css, js, partials, fields, sample, version)
values
(null, '_base', 'base', 'الأساس المشترك', null, null, '', $pt$/* ============ أساس مشترك لكل المطبوعات ============ */
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
})();$pt$, $pt${"rc_contacts":"<span class=\"n\">{{shop.phone1}} · {{shop.phone2}}</span><br>خدمات الإنترنت <span class=\"n\">{{shop.internet}}</span>","rc_head":"<div class=\"hd\"><i data-logo></i><div><h1>{{shop.name}}</h1><div class=\"ad\">{{shop.address}}</div></div></div>","rc_people":"<div class=\"r\"><span class=\"l\">التاريخ</span><span class=\"v n\">{{date}}</span></div>\n{{#customer}}<div class=\"r\"><span class=\"l\">الزبون</span><span class=\"v\">{{customer}}</span></div>{{/customer}}\n{{#phone}}<div class=\"r\"><span class=\"l\">الهاتف</span><span class=\"v n\">{{phone}}</span></div>{{/phone}}\n{{#employee}}<div class=\"r\"><span class=\"l\">الموظّف</span><span class=\"v\">{{employee}}</span></div>{{/employee}}","st_product":"<div class=\"page st\">\n  <div class=\"hd\"><i class=\"lg\" data-logo></i><div class=\"tt\"><b><bdi>{{name}}</bdi></b></div><div class=\"pr\"><span class=\"n\">{{price}}</span> د.ع</div></div>\n  {{#spec}}<div class=\"sp\"><div class=\"cols\"><div><div class=\"r\"><span class=\"l\">المواصفات</span><span class=\"v\"><bdi>{{spec}}</bdi></span></div></div></div></div>\n  <div class=\"ft\">{{/spec}}{{^spec}}<div class=\"ft only\">{{/spec}}<div class=\"bc\" data-code=\"{{sku}}\"></div><div class=\"code\">{{sku}}</div></div>\n</div>"}$pt$::jsonb, '[]'::jsonb, $pt${"shop":{"name":"مكتب سفيان للموبايل","address":"سامراء — الحويش — الشارع الرئيسي","phone1":"07731644450","phone2":"07744485771","internet":"07729096991"}}$pt$::jsonb, 4),
(null, $pt$phone_sticker$pt$, $pt$sticker$pt$, $pt$ستيكر هاتف$pt$, 75, 50, $pt$<div class="page st">
  <div class="hd"><i class="lg" data-logo></i><div class="tt"><b><bdi>{{model}}</bdi></b></div><div class="pr"><span class="n">{{price}}</span> د.ع</div></div>
  <div class="sp">
    <div class="cols">
      <div>
        {{#memory}}<div class="r"><span class="l">الذاكرة</span><span class="v n">{{memory}}</span></div>{{/memory}}
        {{#imei}}<div class="r"><span class="l">IMEI</span><span class="v n">{{imei}}</span></div>{{/imei}}
        {{#battery}}<div class="r"><span class="l">البطارية</span><span class="v n">{{battery}}%</span></div>{{/battery}}
      </div>
      <div>
        {{#color}}<div class="r"><span class="l">اللون</span><span class="v">{{color}}</span></div>{{/color}}
        {{#condition}}<div class="r"><span class="l">الحالة</span><span class="v">{{condition}}</span></div>{{/condition}}
      </div>
    </div>
    {{#notes}}<div class="wide"><div class="r"><span class="l">ملاحظات</span><span class="v">{{notes}}</span></div></div>{{/notes}}
  </div>
  <div class="ft"><div class="bc" data-code="{{sku}}"></div><div class="code">{{sku}}</div></div>
</div>$pt$, $pt$.st{--w:75mm;--h:50mm}$pt$, '', '{}'::jsonb, $pt$[["model","الموديل"],["price","السعر"],["memory","الذاكرة"],["imei","IMEI"],["battery","البطارية %"],["color","اللون"],["condition","الحالة"],["notes","ملاحظات"],["sku","رمز الباركود"]]$pt$::jsonb, $pt${"model":"Samsung Galaxy A54","price":385000,"memory":"128GB · 8GB RAM","imei":"356938035643809","battery":92,"color":"أسود","condition":"مستعمل — ممتاز","notes":"خدش بسيط بزاوية الشاشة","sku":"SFN-PH-1042"}$pt$::jsonb, 4),
(null, $pt$repair_sticker$pt$, $pt$sticker$pt$, $pt$ستيكر صيانة$pt$, 90, 50, $pt$<div class="page st">
  <div class="hd"><i class="lg" data-logo></i><div class="tt"><b>صيانة</b></div><div class="pr"><span class="n">{{ticket}}</span></div></div>
  <div class="sp">
    <div class="cols">
      <div>
        {{#customer}}<div class="r"><span class="l">الزبون</span><span class="v">{{customer}}</span></div>{{/customer}}
        {{#device}}<div class="r"><span class="l">الجهاز</span><span class="v"><bdi>{{device}}</bdi></span></div>{{/device}}
        {{#imei}}<div class="r"><span class="l">IMEI</span><span class="v n">{{imei}}</span></div>{{/imei}}
      </div>
      <div>
        {{#color}}<div class="r"><span class="l">اللون</span><span class="v">{{color}}</span></div>{{/color}}
        {{#received_at}}<div class="r"><span class="l">الاستلام</span><span class="v n">{{received_at}}</span></div>{{/received_at}}
        {{#due_at}}<div class="r"><span class="l">التسليم</span><span class="v n">{{due_at}}</span></div>{{/due_at}}
      </div>
    </div>
    {{#fault}}<div class="wide"><div class="r"><span class="l">العطل</span><span class="v">{{fault}}</span></div></div>{{/fault}}
  </div>
  <div class="ft"><div class="bc" data-code="{{ticket}}"></div><div class="code">{{ticket}}</div></div>
</div>$pt$, $pt$.st{--w:90mm;--h:50mm;--gc:1.25fr 1fr;padding-inline:5.6mm}$pt$, '', '{}'::jsonb, $pt$[["ticket","رقم التذكرة"],["customer","الزبون"],["device","الجهاز"],["imei","IMEI"],["color","اللون"],["received_at","تاريخ الاستلام"],["due_at","موعد التسليم"],["fault","العطل"]]$pt$::jsonb, $pt${"ticket":"SFN-01427","customer":"أحمد عبد الله","device":"Samsung Galaxy A54","imei":"356938035643809","color":"أسود","received_at":"2026-10-22","due_at":"2026-10-24","fault":"شاشة + شحن"}$pt$::jsonb, 4),
(null, $pt$product_sticker_l$pt$, $pt$sticker$pt$, $pt$ستيكر منتجات كبير$pt$, 60, 40, $pt${{> st_product}}$pt$, $pt$.st{--w:60mm;--h:40mm;--k:.9;--ps:11.5pt;--gc:1fr;--bw:30mm;--bh:7mm}$pt$, '', '{}'::jsonb, $pt$[["name","اسم المنتج"],["price","السعر"],["spec","المواصفات (اختياري)"],["sku","رمز الباركود"]]$pt$::jsonb, $pt${"name":"باور بانك 10000mAh","price":28000,"spec":"شحن سريع 22.5W","sku":"SFN-AC-2208"}$pt$::jsonb, 4),
(null, $pt$product_sticker_m$pt$, $pt$sticker$pt$, $pt$ستيكر منتجات وسط$pt$, 50, 30, $pt${{> st_product}}$pt$, $pt$.st{--w:50mm;--h:30mm;--k:.78;--ps:8.6pt;--ts:8.2pt;--lw:4.2mm;--bw:28mm;--bh:6.4mm}$pt$, '', '{}'::jsonb, $pt$[["name","اسم المنتج"],["price","السعر"],["sku","رمز الباركود"]]$pt$::jsonb, $pt${"name":"سماعة بلوتوث لاسلكية","price":35000,"sku":"SFN-AC-1135"}$pt$::jsonb, 4),
(null, $pt$product_sticker_s$pt$, $pt$sticker$pt$, $pt$ستيكر منتجات صغير$pt$, 40, 25, $pt${{> st_product}}$pt$, $pt$.st{--w:40mm;--h:25mm;--k:.66;--ps:9.5pt;--ts:8pt;--lw:3.4mm;--bw:24mm;--bh:5.4mm;--cs:5.2pt}$pt$, '', '{}'::jsonb, $pt$[["name","اسم المنتج"],["price","السعر"],["sku","رمز الباركود"]]$pt$::jsonb, $pt${"name":"محوّل OTG","price":4500,"sku":"SFN-AC-0045"}$pt$::jsonb, 4),
(null, $pt$receipt_sale$pt$, $pt$receipt$pt$, $pt$وصل بيع$pt$, 80, null, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>فاتورة بيع</b><span>{{number}}</span></div>
  {{> rc_people}}
  <div class="grp">
    {{#items}}<div class="it"><span><b><bdi>{{name}}</bdi></b>{{#detail}}<small><bdi>{{detail}}</bdi></small>{{/detail}}</span><b class="n">{{amount}}</b></div>{{/items}}
  </div>
  {{#discount}}<div class="grp">
    <div class="r"><span class="l">المجموع</span><span class="v"><span class="n">{{subtotal}}</span> د.ع</span></div>
    <div class="r"><span class="l">الخصم</span><span class="v"><span class="n">−{{discount}}</span> د.ع</span></div>
  </div>{{/discount}}
  <div class="tot"><span>الإجمالي</span><b><span class="n">{{total}}</span> د.ع</b></div>
  {{#remaining}}<div class="r"><span class="l">المدفوع</span><span class="v"><span class="n">{{paid}}</span> د.ع</span></div>
  <div class="r"><span class="l">المتبقّي دَين</span><span class="v"><span class="n">{{remaining}}</span> د.ع</span></div>{{/remaining}}
  {{#imei}}<div class="r"><span class="l">IMEI</span><span class="v n">{{imei}}</span></div>{{/imei}}
  {{#warranty}}<div class="r"><span class="l">الكفالة</span><span class="v">{{warranty}}</span></div>{{/warranty}}
  <div class="terms">الكفالة لعيوب التصنيع فقط ولا تشمل الكسر أو الماء · الاستبدال خلال 3 أيام بشرط سلامة الجهاز وملحقاته · لا تُقبل المراجعة بدون الوصل</div>
  <div class="bc" data-code="{{number}}"></div><div class="code">{{number}}</div>
  <div class="ft"><b>شكراً لطلبك</b><br>{{> rc_contacts}}</div>
</div>$pt$, $pt$$pt$, '', '{}'::jsonb, $pt$[["number","رقم الفاتورة"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["items","الأصناف [name, detail, amount]"],["subtotal","المجموع"],["discount","الخصم"],["total","الإجمالي"],["paid","المدفوع"],["remaining","المتبقّي دَين"],["imei","IMEI"],["warranty","الكفالة"]]$pt$::jsonb, $pt${"number":"SFN-B-00318","date":"2026-09-09 18:05","customer":"مصطفى كريم","phone":"07705551234","employee":"سفيان","items":[{"name":"Samsung Galaxy A54","detail":"128GB · أسود","amount":385000},{"name":"زجاج حماية شاشة","amount":5000},{"name":"حافظة سيليكون","detail":"2 × 6,000","amount":12000}],"subtotal":402000,"discount":2000,"total":400000,"paid":400000,"remaining":0,"imei":"356938035643809","warranty":"سنة — عيوب التصنيع"}$pt$::jsonb, 4),
(null, $pt$receipt_payment$pt$, $pt$receipt$pt$, $pt$وصل قبض$pt$, 80, null, $pt$<div class="page rc">
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
</div>$pt$, $pt$$pt$, '', '{}'::jsonb, $pt$[["number","رقم الوصل"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["description","البيان"],["paid","المبلغ المقبوض"],["previous_balance","الرصيد السابق"],["remaining","الرصيد المتبقّي"],["next_payment_date","موعد الدفعة القادمة"],["next_payment_amount","مبلغ الدفعة القادمة"]]$pt$::jsonb, $pt${"number":"SFN-Q-00125","date":"2026-09-09 18:05","customer":"مصطفى كريم","phone":"07705551234","employee":"سفيان","description":"تسديد دفعة — نقداً","paid":50000,"previous_balance":150000,"remaining":100000,"next_payment_date":"2026-11-22","next_payment_amount":50000}$pt$::jsonb, 4),
(null, $pt$receipt_debt$pt$, $pt$receipt$pt$, $pt$وصل إضافة دين$pt$, 80, null, $pt$<div class="page rc">
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
</div>$pt$, $pt$$pt$, '', '{}'::jsonb, $pt$[["number","رقم الوصل"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["description","البيان"],["items","المواد بالدين [name, detail, amount] (اختياري)"],["amount","المبلغ المضاف"],["previous_balance","الرصيد السابق"],["balance","الرصيد الكلي"],["due_date","موعد التسديد"],["due_amount","مبلغ التسديد"]]$pt$::jsonb, $pt${"number":"SFN-D-00057","date":"2026-10-23 13:10","customer":"مصطفى كريم","phone":"07705551234","employee":"سفيان","description":"شراء بالآجل","items":[{"name":"Samsung Galaxy A15","detail":"128GB · أزرق","amount":185000}],"amount":185000,"previous_balance":100000,"balance":285000,"due_date":"2026-11-22","due_amount":50000}$pt$::jsonb, 4),
(null, $pt$receipt_repair$pt$, $pt$receipt$pt$, $pt$وصل صيانة — نسخة الزبون$pt$, 80, null, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>وصل صيانة · نسخة الزبون</b><span>{{ticket}}</span></div>
  {{> rc_people}}
  <div class="grp">
    {{#device}}<div class="r"><span class="l">الجهاز</span><span class="v"><bdi>{{device}}</bdi></span></div>{{/device}}
    {{#color}}<div class="r"><span class="l">اللون</span><span class="v">{{color}}</span></div>{{/color}}
    {{#imei}}<div class="r"><span class="l">IMEI</span><span class="v n">{{imei}}</span></div>{{/imei}}
    {{#lock_code}}<div class="r"><span class="l">رمز القفل</span><span class="v n">{{lock_code}}</span></div>{{/lock_code}}
    {{#accessories}}<div class="r"><span class="l">الملحقات</span><span class="v">{{accessories}}</span></div>{{/accessories}}
    {{#fault}}<div class="r"><span class="l">الخلل</span><span class="v">{{fault}}</span></div>{{/fault}}
  </div>
  {{#fault_description}}<div class="txt">{{fault_description}}</div>{{/fault_description}}
  <div class="grp">
    {{#due_date}}<div class="r"><span class="l">موعد التسليم</span><span class="v n">{{due_date}}</span></div>{{/due_date}}
    <div class="r"><span class="l">الكلفة التقديرية</span><span class="v"><span class="n">{{estimate}}</span> د.ع</span></div>
    {{#paid}}<div class="r"><span class="l">المدفوع مقدّماً</span><span class="v"><span class="n">{{paid}}</span> د.ع</span></div>{{/paid}}
  </div>
  <div class="tot"><span>المتبقّي عند الاستلام</span><b><span class="n">{{remaining}}</span> د.ع</b></div>
  <div class="terms">المحل غير مسؤول عن البيانات · الكلفة تقديرية وقد تتغيّر بعد الفحص · الجهاز غير المستلَم خلال 30 يوماً خارج مسؤولية المحل · لا يُسلَّم الجهاز إلا بهذا الوصل</div>
  <div class="bc" data-code="{{ticket}}"></div><div class="code">{{ticket}}</div>
  <div class="ft"><b>شكراً لثقتك</b><br>{{> rc_contacts}}</div>
</div>$pt$, $pt$.rc .r,.rc .it{margin-top:1.5mm}
.rc .grp{margin-top:2.5mm;padding-top:2.2mm}$pt$, '', '{}'::jsonb, $pt$[["ticket","رقم التذكرة"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["device","الجهاز"],["color","اللون"],["imei","IMEI"],["lock_code","رمز القفل"],["accessories","الملحقات"],["fault","الخلل"],["fault_description","وصف الخلل"],["due_date","موعد التسليم"],["estimate","الكلفة التقديرية"],["paid","المدفوع مقدّماً"],["remaining","المتبقّي عند الاستلام"]]$pt$::jsonb, $pt${"ticket":"SFN-01427","date":"2026-09-06 12:40","customer":"أحمد عبد الله حسين","phone":"07712345678","device":"Samsung Galaxy A54","color":"أسود","imei":"356938035643809","lock_code":"1234","accessories":"كفر فقط","fault":"شاشة · شحن","fault_description":"الشاشة مكسورة من الزاوية العليا واللمس ما يشتغل بالنص. الشحن يفصل ويرجع.","due_date":"2026-09-08","estimate":85000,"paid":25000,"remaining":60000}$pt$::jsonb, 4),
(null, $pt$receipt_return$pt$, $pt$receipt$pt$, $pt$وصل مرتجعات$pt$, 80, null, $pt$<div class="page rc">
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
</div>$pt$, $pt$$pt$, '', '{}'::jsonb, $pt$[["number","رقم الوصل"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["original_invoice","الفاتورة الأصلية"],["items","المواد المرجعة [name, detail, amount]"],["reason","سبب الإرجاع"],["item_condition","حالة المادة"],["resolution","المعالجة"],["refund","المبلغ المسترد"]]$pt$::jsonb, $pt${"number":"SFN-RT-00042","date":"2026-09-11 16:20","customer":"مصطفى كريم","phone":"07705551234","original_invoice":"SFN-B-00318","items":[{"name":"حافظة سيليكون","detail":"1 × 6,000","amount":6000},{"name":"زجاج حماية شاشة","detail":"1 × 5,000","amount":5000}],"reason":"المقاس غير مناسب للجهاز","item_condition":"سليمة مع العلبة","resolution":"استرداد نقدي","refund":11000}$pt$::jsonb, 4)
on conflict on constraint print_templates_tenant_key do update set
  kind = excluded.kind, name = excluded.name, width_mm = excluded.width_mm, height_mm = excluded.height_mm,
  html = excluded.html, css = excluded.css, js = excluded.js, partials = excluded.partials,
  fields = excluded.fields, sample = excluded.sample, version = excluded.version, updated_at = now();
