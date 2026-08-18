/* ============================================================
   format.js — تنسيق الأرقام والتواريخ والنصوص
   ============================================================ */
(function (global) {
  "use strict";

  /* ---------- المبالغ ----------
     نُبقي الأرقام لاتينية دائمًا: أوضح للقراءة السريعة وأسلم للطباعة */
  function money(n) {
    var v = Math.round(Number(n) || 0);
    var sign = v < 0 ? "-" : "";
    return sign + Math.abs(v).toLocaleString("en-US");
  }

  function moneyCur(n, currency) {
    return money(n) + " " + (currency || "IQD");
  }

  /* تحويل الأرقام العربية-الهندية إلى لاتينية عند الإدخال */
  function normalizeDigits(str) {
    return String(str)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }

  /* يقبل "1,500,000" و"١٥٠٠٠٠٠" و"1500000" */
  function parseAmount(str) {
    var clean = normalizeDigits(str).replace(/[^\d.-]/g, "");
    var n = parseFloat(clean);
    return isFinite(n) ? Math.round(n) : NaN;
  }

  /* ---------- التواريخ ---------- */
  var AR_MONTHS = ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران",
                   "تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"];

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function dateShort(ts) {
    var d = new Date(ts || Date.now());
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function dateLong(ts) {
    var d = new Date(ts || Date.now());
    return d.getDate() + " " + AR_MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function timeShort(ts) {
    var d = new Date(ts || Date.now());
    var h = d.getHours(), m = pad(d.getMinutes());
    var mer = h < 12 ? "ص" : "م";
    var h12 = h % 12 || 12;
    return h12 + ":" + m + " " + mer;
  }

  function dateTime(ts) { return dateShort(ts) + " — " + timeShort(ts); }

  /* "قبل ٣ أيام" — أوضح من تاريخ مطلق في قوائم النشاط */
  function relative(ts) {
    var diff = Date.now() - (ts || 0);
    var min = Math.floor(diff / 60000);
    if (min < 1) return "الآن";
    if (min < 60) return "قبل " + min + " دقيقة";
    var hr = Math.floor(min / 60);
    if (hr < 24) return "قبل " + hr + " ساعة";
    var day = Math.floor(hr / 24);
    if (day === 1) return "أمس";
    if (day < 30) return "قبل " + day + " يوم";
    var mo = Math.floor(day / 30);
    if (mo < 12) return "قبل " + mo + " شهر";
    return "قبل " + Math.floor(mo / 12) + " سنة";
  }

  /* ---------- النصوص ---------- */
  /* كل بيانات المستخدم تمرّ من هنا قبل الحقن في HTML */
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "؟";
    if (parts.length === 1) return parts[0].slice(0, 2);
    return parts[0][0] + parts[1][0];
  }

  /* لون ثابت لكل اسم — نفس الشخص يحمل نفس اللون دائمًا (اتساق مكاني) */
  var PALETTE = [
    ["#5B6EFF", "#8E7BFF"], ["#FF8A5B", "#FFAE6B"], ["#3DDC84", "#2FBF9E"],
    ["#FF6B9D", "#C86BFF"], ["#4DC3FF", "#5B8CFF"], ["#FFC53D", "#FF9F45"],
    ["#7BE0AD", "#4DBFA0"], ["#B57BFF", "#7B8CFF"]
  ];
  function avatarColors(seed) {
    var h = 0, s = String(seed || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  /* اسم ملف آمن للفاتورة (يصبح اسم ملف PDF الافتراضي) */
  function safeFileName(str) {
    return String(str || "invoice")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 80);
  }

  global.SFN = global.SFN || {};
  global.SFN.fmt = {
    money: money, moneyCur: moneyCur,
    parseAmount: parseAmount, normalizeDigits: normalizeDigits,
    dateShort: dateShort, dateLong: dateLong, timeShort: timeShort,
    dateTime: dateTime, relative: relative,
    esc: esc, initials: initials, avatarColors: avatarColors,
    safeFileName: safeFileName
  };
})(window);
