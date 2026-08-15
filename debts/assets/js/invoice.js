/* ============================================================
   invoice.js — بناء الفاتورة وطباعتها وحفظها PDF
   نوعان:  كشف حساب كامل  |  وصل لحركة واحدة
   مقاسان: A4  |  80mm
   ============================================================ */
(function (global) {
  "use strict";

  var S = global.SFN.store, F = global.SFN.fmt;

  var TYPE_AR = { debt: "دين", pay: "تسديد", forgive: "مسامحة" };
  var TYPE_SIGN = { debt: "+", pay: "−", forgive: "−" };

  /* ---------- قواعد الورق ----------
     @page لا تقبل المحدّدات، لذا نحقنها ديناميكيًا قبل كل طباعة */
  var PAGE_RULES = {
    a4:   "@page{ size: A4 portrait; margin: 12mm 14mm; }",
    mm80: "@page{ size: 80mm auto; margin: 3mm 4mm; }"
  };

  function applyPageRule(paper) {
    var el = document.getElementById("pageRule");
    if (!el) {
      el = document.createElement("style");
      el.id = "pageRule";
      document.head.appendChild(el);
    }
    el.textContent = PAGE_RULES[paper] || PAGE_RULES.a4;
    document.documentElement.setAttribute("data-paper", paper);
  }

  /* ---------- أجزاء الفاتورة ---------- */
  function headBlock(shop, title, meta) {
    return '' +
      '<header class="inv-head">' +
        '<div class="inv-brand">' +
          '<div class="inv-logo">س</div>' +
          '<div>' +
            '<div class="inv-store">' + F.esc(shop.name) + '</div>' +
            '<div class="inv-contact">' + F.esc(shop.address) + '</div>' +
            '<div class="inv-contact num">' + F.esc(shop.phone) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="inv-meta">' +
          '<div class="inv-title">' + F.esc(title) + '</div>' +
          meta.map(function (m) {
            return '<div><span class="k">' + F.esc(m[0]) + ':</span> <span class="num">' + F.esc(m[1]) + '</span></div>';
          }).join("") +
        '</div>' +
      '</header>';
  }

  function partyBlock(person) {
    return '' +
      '<section class="inv-party">' +
        '<div class="nm">' + F.esc(person.name) + '</div>' +
        (person.phone ? '<div><span class="k">الهاتف:</span> <span class="num">' + F.esc(person.phone) + '</span></div>' : '') +
        (person.note  ? '<div><span class="k">ملاحظة:</span> ' + F.esc(person.note) + '</div>' : '') +
      '</section>';
  }

  function txRows(list) {
    return list.map(function (t, i) {
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="num">' + F.dateShort(t.at) + '</td>' +
        '<td>' + F.esc(TYPE_AR[t.type] || t.type) + '</td>' +
        '<td class="col-note">' + F.esc(t.note || "—") + '</td>' +
        '<td class="ta-end num">' + TYPE_SIGN[t.type] + " " + F.money(t.amount) + '</td>' +
      '</tr>';
    }).join("");
  }

  function totalsBlock(person, currency) {
    var debts    = S.sumBy(person, "debt");
    var paid     = S.sumBy(person, "pay");
    var forgiven = S.sumBy(person, "forgive");
    var balance  = S.balanceOf(person);

    var label = balance > 0 ? "المتبقّي بذمّته"
              : balance < 0 ? "له رصيد زائد"
              : "الحساب مساوى — لا يوجد متبقٍّ";
    var badge = balance > 0 ? "غير مسدَّد"
              : balance < 0 ? "رصيد زائد"
              : "مُسدَّد بالكامل";

    var row = function (k, v, cls) {
      return '<div class="inv-tot-row ' + (cls || "") + '">' +
             '<span>' + k + '</span><span class="num">' + v + '</span></div>';
    };

    return '<section class="inv-totals">' +
      row("مجموع الديون", F.money(debts) + " " + currency) +
      row("مجموع التسديد", "− " + F.money(paid) + " " + currency) +
      (forgiven > 0 ? row("مجموع المسامحة", "− " + F.money(forgiven) + " " + currency) : "") +
      row(label, F.money(Math.abs(balance)) + " " + currency, "grand") +
      '<div style="text-align:center;margin-top:2mm">' +
        '<span class="inv-badge">' + badge + '</span>' +
      '</div>' +
    '</section>';
  }

  function footBlock(shop, withSign) {
    return (withSign ?
      '<section class="inv-sign">' +
        '<div><div class="line">توقيع المستلم</div></div>' +
        '<div><div class="line">توقيع المحل</div></div>' +
      '</section>' : '') +
      '<footer class="inv-foot">' +
        F.esc(shop.note || "") +
        '<div class="num">' + F.dateTime(Date.now()) + '</div>' +
      '</footer>';
  }

  /* ---------- 1) كشف حساب كامل ---------- */
  function buildStatement(person, invoiceNo) {
    var shop = S.shop, cur = shop.currency || "IQD";
    var list = (person.tx || []).slice().sort(function (a, b) { return a.at - b.at; });

    return '<div class="inv">' +
      headBlock(shop, "كشف حساب", [
        ["رقم الكشف", invoiceNo],
        ["التاريخ", F.dateShort(Date.now())],
        ["الوقت", F.timeShort(Date.now())]
      ]) +
      partyBlock(person) +
      '<table class="inv-table">' +
        '<thead><tr>' +
          '<th style="width:8%">#</th>' +
          '<th style="width:20%">التاريخ</th>' +
          '<th style="width:16%">النوع</th>' +
          '<th class="col-note">البيان</th>' +
          '<th class="ta-end" style="width:24%">المبلغ</th>' +
        '</tr></thead>' +
        '<tbody>' + (list.length ? txRows(list) :
          '<tr><td colspan="5" style="text-align:center;padding:6mm">لا توجد حركات مسجّلة</td></tr>') +
        '</tbody>' +
      '</table>' +
      totalsBlock(person, cur) +
      footBlock(shop, true) +
    '</div>';
  }

  /* ---------- 2) وصل لحركة واحدة ---------- */
  function buildReceipt(person, tx, invoiceNo) {
    var shop = S.shop, cur = shop.currency || "IQD";
    var title = tx.type === "pay" ? "وصل تسديد"
              : tx.type === "debt" ? "وصل دين"
              : "وصل مسامحة";

    return '<div class="inv">' +
      headBlock(shop, title, [
        ["رقم الوصل", invoiceNo],
        ["التاريخ", F.dateShort(tx.at)],
        ["الوقت", F.timeShort(tx.at)]
      ]) +
      partyBlock(person) +
      '<table class="inv-table">' +
        '<thead><tr>' +
          '<th>البيان</th>' +
          '<th class="ta-end" style="width:38%">المبلغ</th>' +
        '</tr></thead>' +
        '<tbody><tr>' +
          '<td>' + F.esc(TYPE_AR[tx.type]) + (tx.note ? " — " + F.esc(tx.note) : "") + '</td>' +
          '<td class="ta-end num">' + F.money(tx.amount) + " " + cur + '</td>' +
        '</tr></tbody>' +
      '</table>' +
      '<section class="inv-totals">' +
        '<div class="inv-tot-row"><span>مبلغ هذا الوصل</span>' +
          '<span class="num">' + F.money(tx.amount) + " " + cur + '</span></div>' +
        '<div class="inv-tot-row grand"><span>الرصيد بعد الحركة</span>' +
          '<span class="num">' + F.money(S.balanceOf(person)) + " " + cur + '</span></div>' +
      '</section>' +
      footBlock(shop, tx.type === "pay") +
    '</div>';
  }

  /* ---------- التنفيذ: طباعة / PDF ---------- */
  var printRoot = null;
  function root() {
    if (!printRoot) printRoot = document.getElementById("printRoot");
    return printRoot;
  }

  /* اسم المستند يصبح اسم ملف PDF الافتراضي في المتصفح */
  function withTitle(name, fn) {
    var prev = document.title;
    document.title = name;
    var restore = function () {
      document.title = prev;
      document.documentElement.removeAttribute("data-paper");
    };
    global.addEventListener("afterprint", restore, { once: true });
    // احتياط لو لم يُطلق المتصفح afterprint (بعض بيئات سطح المكتب)
    setTimeout(restore, 60000);
    fn();
  }

  /* paper: "a4" | "mm80"   kind: "statement" | "receipt" */
  function render(person, opts) {
    opts = opts || {};
    var paper = opts.paper === "mm80" ? "mm80" : "a4";
    var no = opts.invoiceNo || S.nextInvoiceNo();

    var html = (opts.kind === "receipt" && opts.tx)
      ? buildReceipt(person, opts.tx, no)
      : buildStatement(person, no);

    root().innerHTML = html;
    applyPageRule(paper);
    return { no: no, paper: paper };
  }

  function print(person, opts) {
    var info = render(person, opts);
    var kind = (opts && opts.kind === "receipt") ? "وصل" : "كشف";
    var name = F.safeFileName(kind + "-" + person.name + "-" + info.no);

    withTitle(name, function () {
      // إطاران قبل الطباعة: نضمن أن التخطيط استقرّ وأن @page طُبّقت
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { global.print(); });
      });
    });
    return info;
  }

  /* الحفظ PDF يمرّ عبر نفس مسار الطباعة — يختار المستخدم
     "حفظ بصيغة PDF" كوجهة. هذه أضمن طريقة تحفظ العربية
     بشكل صحيح وبدون أي مكتبة خارجية. */
  function savePDF(person, opts) {
    opts = Object.assign({}, opts, { paper: (opts && opts.paper) || "a4" });
    return print(person, opts);
  }

  /* معاينة داخل الصفحة (اختياري للتأكد قبل الطباعة) */
  function previewHTML(person, opts) {
    opts = opts || {};
    var no = opts.invoiceNo || "—";
    return (opts.kind === "receipt" && opts.tx)
      ? buildReceipt(person, opts.tx, no)
      : buildStatement(person, no);
  }

  global.SFN = global.SFN || {};
  global.SFN.invoice = {
    buildStatement: buildStatement,
    buildReceipt: buildReceipt,
    previewHTML: previewHTML,
    render: render,
    print: print,
    savePDF: savePDF
  };
})(window);
