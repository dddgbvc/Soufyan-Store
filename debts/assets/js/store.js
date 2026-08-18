/* ============================================================
   store.js — طبقة البيانات والحفظ
   كل شيء محليّ على الجهاز (localStorage) — لا إنترنت ولا خادم
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "sfn.debts.v1";
  var VERSION = 1;

  /* الحالة الافتراضية: بيانات المحل تُطبع على كل فاتورة */
  function blank() {
    return {
      version: VERSION,
      shop: {
        name: "مركز سفيان للهواتف",
        phone: "0773 164 4450",
        address: "صلاح الدين - سامراء - الحويش - الشارع الرئيسي",
        currency: "IQD",
        note: "شكرًا لتعاملكم معنا 🌸"
      },
      people: [],
      seq: 1                                  // عدّاد أرقام الفواتير
    };
  }

  function uid(prefix) {
    var r = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return (prefix || "id") + "_" + Date.now().toString(36) + r;
  }

  var data = blank();

  /* ---------- التحميل والحفظ ---------- */
  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) { data = blank(); return data; }
      var parsed = JSON.parse(raw);
      data = migrate(parsed);
    } catch (e) {
      // بيانات تالفة: لا نمسحها بصمت — ننبّه ونكمل بنسخة فارغة
      console.error("تعذّرت قراءة البيانات المحفوظة:", e);
      data = blank();
      data._corrupt = true;
    }
    return data;
  }

  function migrate(d) {
    if (!d || typeof d !== "object") return blank();
    var base = blank();
    d.version = d.version || VERSION;
    d.shop    = Object.assign(base.shop, d.shop || {});
    d.people  = Array.isArray(d.people) ? d.people : [];
    d.seq     = typeof d.seq === "number" ? d.seq : 1;
    d.people.forEach(function (p) {
      p.tx = Array.isArray(p.tx) ? p.tx : [];
      p.tx.forEach(function (t) { t.amount = num(t.amount); });
    });
    return d;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // الحالة الواقعية الوحيدة: امتلاء مساحة المتصفح
      console.error("فشل الحفظ:", e);
      return false;
    }
  }

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
    return isFinite(n) ? Math.round(n) : 0;      // الدينار بلا كسور عمليًا
  }

  /* ---------- الحسابات ----------
     الرصيد = مجموع الديون − (المسدّد + المُسامح به)
     موجب  → عليه دين | صفر → مساوى | سالب → له رصيد زائد */
  function balanceOf(person) {
    if (!person || !person.tx) return 0;
    return person.tx.reduce(function (sum, t) {
      if (t.type === "debt") return sum + num(t.amount);
      return sum - num(t.amount);               // pay | forgive
    }, 0);
  }

  function sumBy(person, type) {
    return (person.tx || []).reduce(function (s, t) {
      return t.type === type ? s + num(t.amount) : s;
    }, 0);
  }

  function statusOf(person) {
    var b = balanceOf(person);
    if (b > 0) return "owing";
    if (b < 0) return "credit";
    return "clear";
  }

  function totals() {
    var owed = 0, credit = 0, paid = 0, forgiven = 0, owingCount = 0;
    data.people.forEach(function (p) {
      var b = balanceOf(p);
      if (b > 0) { owed += b; owingCount++; }
      else if (b < 0) { credit += -b; }
      paid     += sumBy(p, "pay");
      forgiven += sumBy(p, "forgive");
    });
    return {
      owed: owed, credit: credit, paid: paid, forgiven: forgiven,
      owingCount: owingCount, people: data.people.length
    };
  }

  /* ---------- الأشخاص ---------- */
  function addPerson(fields) {
    var p = {
      id: uid("pr"),
      name: String(fields.name || "").trim(),
      phone: String(fields.phone || "").trim(),
      note: String(fields.note || "").trim(),
      createdAt: Date.now(),
      tx: []
    };
    if (!p.name) throw new Error("الاسم مطلوب");
    data.people.push(p);

    // دين افتتاحي اختياري عند الإنشاء
    var opening = num(fields.opening);
    if (opening > 0) {
      p.tx.push({
        id: uid("tx"), type: "debt", amount: opening,
        note: fields.openingNote || "دين افتتاحي", at: Date.now()
      });
    }
    save();
    return p;
  }

  function getPerson(id) {
    for (var i = 0; i < data.people.length; i++) {
      if (data.people[i].id === id) return data.people[i];
    }
    return null;
  }

  function updatePerson(id, fields) {
    var p = getPerson(id);
    if (!p) return null;
    if (fields.name  != null) p.name  = String(fields.name).trim() || p.name;
    if (fields.phone != null) p.phone = String(fields.phone).trim();
    if (fields.note  != null) p.note  = String(fields.note).trim();
    save();
    return p;
  }

  function removePerson(id) {
    var i = data.people.findIndex(function (p) { return p.id === id; });
    if (i < 0) return false;
    data.people.splice(i, 1);
    save();
    return true;
  }

  /* ---------- الحركات ---------- */
  function addTx(personId, tx) {
    var p = getPerson(personId);
    if (!p) throw new Error("لم يُعثر على الشخص");

    var amount = num(tx.amount);
    if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
    if (["debt", "pay", "forgive"].indexOf(tx.type) < 0) throw new Error("نوع حركة غير معروف");

    var rec = {
      id: uid("tx"),
      type: tx.type,
      amount: amount,
      note: String(tx.note || "").trim(),
      at: tx.at || Date.now()
    };
    p.tx.push(rec);
    save();
    return rec;
  }

  function removeTx(personId, txId) {
    var p = getPerson(personId);
    if (!p) return false;
    var i = p.tx.findIndex(function (t) { return t.id === txId; });
    if (i < 0) return false;
    p.tx.splice(i, 1);
    save();
    return true;
  }

  /* مساواة الأرقام: نُسقط الرصيد المتبقي كاملًا بحركة "مسامحة"
     نسجّلها ولا نحذف التاريخ — يبقى السجل كاملًا وقابلًا للمراجعة */
  function forgiveAll(personId, note) {
    var p = getPerson(personId);
    if (!p) throw new Error("لم يُعثر على الشخص");
    var b = balanceOf(p);
    if (b <= 0) throw new Error("لا يوجد دين مستحق لمساواته");
    return addTx(personId, {
      type: "forgive",
      amount: b,
      note: note || "مساواة الأرقام — مسامحة"
    });
  }

  /* ---------- بحث وترتيب ---------- */
  function query(opts) {
    opts = opts || {};
    var q = String(opts.q || "").trim().toLowerCase();
    var list = data.people.slice();

    if (q) {
      list = list.filter(function (p) {
        return (p.name + " " + p.phone + " " + p.note).toLowerCase().indexOf(q) >= 0;
      });
    }
    if (opts.filter === "owing") list = list.filter(function (p) { return balanceOf(p) > 0; });
    if (opts.filter === "clear") list = list.filter(function (p) { return balanceOf(p) <= 0; });

    var sort = opts.sort || "amount";
    list.sort(function (a, b) {
      if (sort === "name")   return a.name.localeCompare(b.name, "ar");
      if (sort === "recent") return lastActivity(b) - lastActivity(a);
      return balanceOf(b) - balanceOf(a);        // الأعلى دينًا أولًا
    });
    return list;
  }

  function lastActivity(p) {
    if (!p.tx || !p.tx.length) return p.createdAt || 0;
    return p.tx.reduce(function (m, t) { return Math.max(m, t.at || 0); }, p.createdAt || 0);
  }

  /* ---------- رقم الفاتورة ---------- */
  function nextInvoiceNo() {
    var n = data.seq || 1;
    data.seq = n + 1;
    save();
    return String(n).padStart(5, "0");
  }

  /* ---------- النسخ الاحتياطي ----------
     البيانات في localStorage تُمسح لو نظّف المستخدم المتصفح، لذا التصدير أساسي */
  function exportJSON() {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(text, mode) {
    var incoming = JSON.parse(text);
    if (!incoming || !Array.isArray(incoming.people)) {
      throw new Error("الملف لا يطابق صيغة النسخة الاحتياطية");
    }
    incoming = migrate(incoming);

    if (mode === "merge") {
      var have = {};
      data.people.forEach(function (p) { have[p.id] = p; });
      incoming.people.forEach(function (p) {
        if (have[p.id]) {
          // دمج الحركات غير المكرّرة فقط
          var ids = {};
          have[p.id].tx.forEach(function (t) { ids[t.id] = 1; });
          p.tx.forEach(function (t) { if (!ids[t.id]) have[p.id].tx.push(t); });
        } else {
          data.people.push(p);
        }
      });
      data.seq = Math.max(data.seq || 1, incoming.seq || 1);
    } else {
      data = incoming;
    }
    save();
    return data;
  }

  function setShop(fields) {
    Object.assign(data.shop, fields || {});
    save();
    return data.shop;
  }

  global.SFN = global.SFN || {};
  global.SFN.store = {
    load: load, save: save,
    get data() { return data; },
    get shop() { return data.shop; },
    setShop: setShop,
    blank: blank,
    uid: uid, num: num,
    balanceOf: balanceOf, sumBy: sumBy, statusOf: statusOf, totals: totals,
    addPerson: addPerson, getPerson: getPerson, updatePerson: updatePerson, removePerson: removePerson,
    addTx: addTx, removeTx: removeTx, forgiveAll: forgiveAll,
    query: query, lastActivity: lastActivity,
    nextInvoiceNo: nextInvoiceNo,
    exportJSON: exportJSON, importJSON: importJSON
  };
})(window);
