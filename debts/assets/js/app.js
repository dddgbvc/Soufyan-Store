/* ============================================================
   app.js — التشغيل
   ترتيب التحميل: spring → format → store → invoice → ui → app
   ============================================================ */
(function (global) {
  "use strict";

  /* بيانات نموذجية للتجربة — تُستدعى من زر في الشاشة الفارغة فقط */
  function seedDemo() {
    var S = global.SFN.store;
    var day = 86400000, now = Date.now();

    var samples = [
      { name: "أحمد سعيد", phone: "0770 123 4567", note: "زبون دائم — يسدّد نهاية كل شهر",
        tx: [
          { type: "debt", amount: 450000, note: "Galaxy A55", at: now - day * 24 },
          { type: "pay",  amount: 150000, note: "دفعة أولى",  at: now - day * 12 },
          { type: "debt", amount: 45000,  note: "شاحن Anker 65W", at: now - day * 5 }
        ]
      },
      { name: "مصطفى الجبوري", phone: "0781 555 2211", note: "",
        tx: [
          { type: "debt", amount: 165000, note: "Infinix Hot 40i", at: now - day * 40 },
          { type: "pay",  amount: 165000, note: "تسديد كامل", at: now - day * 9 }
        ]
      },
      { name: "علي حسين", phone: "0750 987 6543", note: "ابن الجيران",
        tx: [
          { type: "debt",    amount: 90000, note: "سماعة + واقي شاشة", at: now - day * 60 },
          { type: "pay",     amount: 30000, note: "", at: now - day * 33 },
          { type: "forgive", amount: 60000, note: "مساواة الأرقام — مسامحة", at: now - day * 2 }
        ]
      },
      { name: "زينب كريم", phone: "0771 444 8899", note: "",
        tx: [
          { type: "debt", amount: 1250000, note: "iPhone 15", at: now - day * 15 },
          { type: "pay",  amount: 400000,  note: "دفعة", at: now - day * 7 },
          { type: "pay",  amount: 200000,  note: "دفعة", at: now - day * 1 }
        ]
      },
      { name: "حيدر عبد الله", phone: "0782 300 1122", note: "يفضّل التسديد نقدًا",
        tx: [
          { type: "debt", amount: 310000, note: "Infinix Note 40 Pro", at: now - day * 3 }
        ]
      }
    ];

    samples.forEach(function (s) {
      var p = S.addPerson({ name: s.name, phone: s.phone, note: s.note });
      s.tx.forEach(function (t) {
        S.addTx(p.id, { type: t.type, amount: t.amount, note: t.note, at: t.at });
      });
    });
    S.save();
  }

  function boot() {
    if (!global.SFN || !global.SFN.ui) {
      console.error("تعذّر تحميل ملفات البرنامج — تأكّد من وجود مجلد assets بجانب index.html");
      return;
    }
    global.SFN.seedDemo = seedDemo;
    global.SFN.ui.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
