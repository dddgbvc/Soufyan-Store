/* ============================================================
   ui.js — الواجهة: البطاقات، شاشة التفاصيل، النماذج، التنبيهات
   الحركة كلها نوابض قابلة للمقاطعة من spring.js
   ============================================================ */
(function (global) {
  "use strict";

  var S = global.SFN.store, F = global.SFN.fmt,
      M = global.SFN.motion, INV = global.SFN.invoice;

  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var state = { q: "", filter: "all", sort: "amount", openId: null };
  var lastCard = null;      // للعودة بالتركيز بعد الإغلاق
  var undoBuf = null;       // تراجع عن حذف حركة

  /* ============================================================
     التنبيهات
     ============================================================ */
  function toast(msg, kind, action) {
    var t = document.createElement("div");
    t.className = "toast glass glass--thick " + (kind || "ok");
    var icon = kind === "bad" ? "⚠️" : kind === "info" ? "ℹ️" : "✅";
    t.innerHTML = '<span class="ic">' + icon + "</span><span>" + F.esc(msg) + "</span>";

    if (action) {
      var b = document.createElement("button");
      b.className = "btn btn--sm btn--ghost";
      b.textContent = action.label;
      b.style.pointerEvents = "auto";
      b.onclick = function () { action.run(); dismiss(); };
      t.appendChild(b);
    }
    el.toasts.appendChild(t);
    M.materialize(t, { distance: 16, response: 0.36 });

    var timer = setTimeout(dismiss, action ? 6000 : 2800);
    function dismiss() {
      clearTimeout(timer);
      if (!t.parentNode) return;
      M.materialize(t, { dir: "out", distance: 16, response: 0.3, onRest: function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }});
    }
    return t;
  }

  /* ============================================================
     الملخّص العلوي
     ============================================================ */
  function renderStats() {
    var t = S.totals(), cur = S.shop.currency;
    el.stats.innerHTML =
      stat("إجمالي الديون", t.owed, cur, "is-danger", "💰") +
      stat("عدد المدينين", t.owingCount, "", "is-primary", "👥", true) +
      stat("إجمالي المسدَّد", t.paid, cur, "is-good", "🧾") +
      stat("إجمالي المسامحة", t.forgiven, cur, "", "🤝");
  }

  function stat(label, value, cur, cls, icon, plain) {
    return '<div class="stat glass ' + (cls || "") + '">' +
      '<div class="label">' + icon + " " + label + '</div>' +
      '<div class="value num">' + (plain ? value : F.money(value)) +
        (cur ? '<span class="cur">' + cur + "</span>" : "") +
      '</div></div>';
  }

  /* ============================================================
     البطاقات
     ============================================================ */
  function renderCards() {
    var list = S.query(state);

    if (!list.length) {
      el.cards.innerHTML = "";
      el.empty.classList.remove("hidden");
      el.empty.innerHTML = S.data.people.length
        ? '<div class="big">🔍</div><h3>لا توجد نتائج</h3><p>جرّب اسمًا آخر أو غيّر التصفية.</p>'
        : '<div class="big">📒</div><h3>الدفتر فارغ</h3>' +
          '<p>ابدأ بإضافة أول شخص عبر زر «شخص جديد».</p>' +
          '<div class="row" style="justify-content:center;margin-top:1rem">' +
            '<button class="btn btn--glass btn--sm" id="seedBtn">🧪 تعبئة بيانات تجريبية</button>' +
          '</div>';

      var seed = $("seedBtn");
      if (seed) seed.onclick = function () {
        if (global.SFN.seedDemo) {
          global.SFN.seedDemo();
          renderStats(); renderCards();
          toast("أُضيفت 5 حسابات تجريبية — احذفها متى شئت");
        }
      };
      return;
    }
    el.empty.classList.add("hidden");
    el.cards.innerHTML = list.map(cardHTML).join("");
    observeCards();
  }

  function cardHTML(p) {
    var bal = S.balanceOf(p), status = S.statusOf(p);
    var col = F.avatarColors(p.id);
    var last = S.lastActivity(p);

    var pill = status === "owing"
      ? '<span class="pill danger">عليه دين</span>'
      : status === "credit"
        ? '<span class="pill primary">له رصيد</span>'
        : '<span class="pill good">مساوى ✓</span>';

    var label = status === "credit" ? "رصيد زائد" : "المتبقّي";

    return '<button class="card glass glass--live is-' + status + '" data-open="' + p.id + '" aria-haspopup="dialog">' +
      '<div class="card-top">' +
        '<span class="avatar" style="--av-a:' + col[0] + ';--av-b:' + col[1] + '">' + F.esc(F.initials(p.name)) + '</span>' +
        '<span class="card-id">' +
          '<span class="nm">' + F.esc(p.name) + '</span>' +
          '<span class="ph num">' + F.esc(p.phone || "—") + '</span>' +
        '</span>' +
        pill +
      '</div>' +
      '<div class="card-amount">' +
        '<span class="lbl">' + label + '</span>' +
        '<span class="amt num">' + F.money(Math.abs(bal)) + " " + S.shop.currency + '</span>' +
      '</div>' +
      '<div class="card-foot">' +
        '<span>' + (p.tx.length ? p.tx.length + " حركة" : "بلا حركات") + '</span>' +
        '<span>' + F.esc(F.relative(last)) + '</span>' +
      '</div>' +
    '</button>';
  }

  /* ظهور متتابع خفيف — يوجّه النظر لترتيب القائمة */
  var io = null;
  function observeCards() {
    if (M.reduced) return;
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          var i = +(e.target.dataset.i || 0);
          e.target.style.opacity = "0";
          setTimeout(function () {
            M.materialize(e.target, { distance: 14, response: 0.4 });
          }, Math.min(i, 7) * 45);
        });
      }, { threshold: 0.08 });
    }
    var cards = el.cards.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].dataset.i = i;
      io.observe(cards[i]);
    }
  }

  /* بقعة الضوء تتبع المؤشر فوق الزجاج */
  function trackGlare(e) {
    var c = e.target.closest(".glass--live");
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
    c.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
  }

  /* ============================================================
     شاشة التفاصيل — نابض + سحب للإغلاق
     ============================================================ */
  var sheetY = null;        // النابض المتحكم بالإزاحة الرأسية
  var dragging = false;
  var closing = false;      // هل نحن في طريقنا للإغلاق فعلًا؟
  var tracker = new M.VelocityTracker(110);

  function setSheetY(y) {
    el.sheet.style.transform = "translate3d(0," + y + "px,0)";
  }

  var onSlide = null;   // مراقب أثناء الانزلاق (يُستعمل للإغلاق المبكر)

  function ensureSpring() {
    if (sheetY) return sheetY;
    sheetY = new M.Spring({
      from: 0, to: 0,
      response: 0.34, damping: 0.86,   // ارتداد خفيف: الحركة نابعة من زخم
      precision: 0.5,                  // نصف بكسل — أدقّ من ذلك لا يراه أحد
      onUpdate: function (y) {
        setSheetY(y);
        if (onSlide) onSlide(y);
      }
    });
    return sheetY;
  }

  function openSheet(id, sourceCard) {
    var p = S.getPerson(id);
    if (!p) return;

    state.openId = id;
    lastCard = sourceCard || null;
    renderSheet(p);

    el.sheet.classList.add("open");
    el.scrim.classList.add("show");
    document.body.style.overflow = "hidden";

    var h = el.sheet.offsetHeight || global.innerHeight;
    var sp = ensureSpring();

    // إلغاء أي إغلاق سابق معلّق حتى لا يُنهي نفسه فوق فتحٍ جديد
    closing = false;
    onSlide = null;
    sp.onRest = null;

    if (M.reduced) {
      sp.stop(); sp.value = 0; setSheetY(0);
    } else {
      sp.stop();
      sp.setValue(h, 0);
      sp.setTarget(0, 0);
    }
    setTimeout(function () { el.sheetClose.focus(); }, 60);
  }

  function closeSheet(velocity) {
    if (!el.sheet.classList.contains("open")) return;
    var h = el.sheet.offsetHeight || global.innerHeight;
    var sp = ensureSpring();

    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      onSlide = null;
      sp.onRest = null;
      sp.stop();
      el.sheet.classList.remove("open");
      el.scrim.classList.remove("show");
      document.body.style.overflow = "";
      state.openId = null;
      setSheetY(0);
      if (lastCard && document.contains(lastCard)) lastCard.focus();
    };

    if (M.reduced) { finish(); return; }

    el.scrim.classList.remove("show");
    closing = true;

    // ننهي بمجرد خروج الورقة من الشاشة — لا ننتظر ذيل النابض غير المرئي
    onSlide = function (y) {
      if (!closing) { onSlide = null; return; }   // أمسكها المستخدم: الإغلاق ملغى
      if (y >= h - 1) finish();
    };
    sp.onRest = function () { if (closing) finish(); };

    // الخروج من نفس المسار الذي دخلت منه (للأسفل) وبسرعة الإصبع
    sp.setTarget(h, velocity || 0);
  }

  /* السحب: تتبّع 1:1، مقاومة مطاطية للأعلى، وإسقاط الزخم عند الإفلات */
  function bindDrag(handle) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      // الأزرار داخل الترويسة تبقى قابلة للنقر — لا نخطف مؤشرها
      if (e.target.closest("button") && !e.target.closest("#grabber")) return;

      var sp = ensureSpring();
      sp.stop();                         // نمسك الورقة أثناء طيرانها
      closing = false;                   // الإمساك يلغي أي إغلاق جارٍ
      onSlide = null;
      sp.onRest = null;
      dragging = true;
      tracker.reset();
      tracker.add(e.clientY);

      var startPointer = e.clientY;
      var startValue = sp.value;
      var h = el.sheet.offsetHeight || global.innerHeight;
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* غير مدعوم: نكمل */ }

      function move(ev) {
        if (!dragging) return;
        tracker.add(ev.clientY);
        var y = startValue + (ev.clientY - startPointer);
        // فوق الحد الأعلى: مقاومة متدرجة بدل توقّف صلب
        if (y < 0) y = -M.rubberband(-y, h);
        sp.setValue(y, 0);
      }

      function up(ev) {
        if (!dragging) return;
        dragging = false;
        try { handle.releasePointerCapture(ev.pointerId); } catch (err) {}
        // المتابعة على النافذة: الإصبع يغادر المقبض فورًا بعد أول حركة،
        // ولو ربطنا الأحداث بالمقبض وحده لانقطع التتبّع
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", up);
        global.removeEventListener("pointercancel", up);

        var v = tracker.velocity();                    // بكسل/ثانية
        var projected = sp.value + M.project(v);       // أين ستستقرّ؟
        // القرار بالسرعة أولًا ثم بالموضع المُسقط — هكذا تُغلق النقرة السريعة
        if (v > 550 || projected > h * 0.4) closeSheet(v);
        else sp.setTarget(0, v);
      }

      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", up);
      global.addEventListener("pointercancel", up);
    });
  }

  /* ---------- محتوى شاشة التفاصيل ---------- */
  function renderSheet(p) {
    var bal = S.balanceOf(p), status = S.statusOf(p), cur = S.shop.currency;
    var col = F.avatarColors(p.id);

    el.sheetHead.innerHTML =
      '<span class="avatar" style="--av-a:' + col[0] + ';--av-b:' + col[1] + '">' + F.esc(F.initials(p.name)) + '</span>' +
      '<span class="who">' +
        '<h2>' + F.esc(p.name) + '</h2>' +
        '<small class="num">' + F.esc(p.phone || "بلا رقم") + '</small>' +
      '</span>' +
      '<button class="btn btn--glass btn--icon" id="sheetEdit" title="تعديل البيانات" aria-label="تعديل بيانات الشخص">✏️</button>' +
      '<button class="btn btn--glass btn--icon" id="sheetClose" title="إغلاق" aria-label="إغلاق">✕</button>';

    var label = bal > 0 ? "المتبقّي بذمّته" : bal < 0 ? "له رصيد زائد" : "الحساب مساوى";
    var sub = bal > 0 ? "آخر حركة " + F.relative(S.lastActivity(p))
            : bal < 0 ? "دفع أكثر من المطلوب"
            : "لا يوجد أي مبلغ متبقٍّ ✓";

    el.sheetBody.innerHTML =
      '<div class="balance-panel glass glass--thick is-' + status + '">' +
        '<div class="lbl">' + label + '</div>' +
        '<div class="amt num">' + F.money(Math.abs(bal)) + '</div>' +
        '<div class="sub">' + F.esc(sub) + " · " + cur + '</div>' +
        '<div class="mini-stats">' +
          mini("الديون", S.sumBy(p, "debt")) +
          mini("المسدَّد", S.sumBy(p, "pay")) +
          mini("المسامحة", S.sumBy(p, "forgive")) +
        '</div>' +
      '</div>' +

      '<div class="actions">' +
        '<button class="btn btn--danger"  data-act="debt">➕ إضافة دين</button>' +
        '<button class="btn btn--good"    data-act="pay">💵 تسديد دين</button>' +
        '<button class="btn btn--primary" data-act="forgive">🤝 مساواة الأرقام</button>' +
        '<button class="btn btn--glass"   data-act="print">🖨️ طباعة</button>' +
        '<button class="btn btn--glass"   data-act="pdf">📄 حفظ PDF</button>' +
      '</div>' +

      (p.note ? '<div class="callout warn">📝 ' + F.esc(p.note) + '</div>' : '') +

      '<div class="sect-title"><span>سجل الحركات (' + p.tx.length + ')</span>' +
        (p.tx.length ? '<button class="btn btn--sm btn--ghost" data-act="wa">📲 إرسال واتساب</button>' : '') +
      '</div>' +
      txListHTML(p) +

      '<div class="sect-title"><span>إجراءات أخرى</span></div>' +
      '<button class="btn btn--glass btn--block" data-act="delete" style="color:var(--danger)">🗑️ حذف الشخص وسجلّه</button>';

    $("sheetClose").onclick = function () { closeSheet(0); };
    $("sheetEdit").onclick  = function () { openPersonForm(p); };
    el.sheetClose = $("sheetClose");
  }

  function mini(k, v) {
    return '<div><div class="k">' + k + '</div><div class="v num">' + F.money(v) + "</div></div>";
  }

  function txListHTML(p) {
    if (!p.tx.length) {
      return '<p style="color:var(--text-3);font-size:.86rem;padding:.6rem 0">لا توجد حركات — أضف دينًا للبدء.</p>';
    }
    var icons = { debt: "➕", pay: "💵", forgive: "🤝" };
    var names = { debt: "دين", pay: "تسديد", forgive: "مسامحة" };
    var signs = { debt: "+", pay: "−", forgive: "−" };

    var list = p.tx.slice().sort(function (a, b) { return b.at - a.at; });
    return '<div class="tx-list">' + list.map(function (t) {
      return '<div class="tx ' + t.type + '">' +
        '<span class="ic">' + icons[t.type] + '</span>' +
        '<span class="meta">' +
          '<span class="t">' + names[t.type] + (t.note ? " — " + F.esc(t.note) : "") + '</span>' +
          '<span class="d num">' + F.dateTime(t.at) + '</span>' +
        '</span>' +
        '<span class="val num">' + signs[t.type] + " " + F.money(t.amount) + '</span>' +
        '<button class="del" data-deltx="' + t.id + '" title="حذف الحركة" aria-label="حذف الحركة">✕</button>' +
      '</div>';
    }).join("") + '</div>';
  }

  function refreshOpen() {
    renderStats();
    renderCards();
    if (state.openId) {
      var p = S.getPerson(state.openId);
      if (p) renderSheet(p); else closeSheet(0);
    }
  }

  /* ============================================================
     النماذج
     ============================================================ */
  function openModal(html, onMount) {
    el.modal.innerHTML = html;
    el.modal.classList.add("open");
    el.scrim2.classList.add("show");
    M.materialize(el.modal, { distance: 26, response: 0.36 });
    if (onMount) onMount();
    var first = el.modal.querySelector("input, textarea, button");
    if (first) setTimeout(function () { first.focus(); }, 80);
  }

  function closeModal() {
    if (!el.modal.classList.contains("open")) return;
    el.scrim2.classList.remove("show");
    M.materialize(el.modal, { dir: "out", distance: 26, response: 0.3, onRest: function () {
      el.modal.classList.remove("open");
      el.modal.innerHTML = "";
      el.modal.style.opacity = "";
      el.modal.style.transform = "";
    }});
  }

  function fieldHTML(id, label, opts) {
    opts = opts || {};
    return '<div class="field" id="f_' + id + '">' +
      '<label for="' + id + '">' + label + '</label>' +
      (opts.textarea
        ? '<textarea id="' + id + '" placeholder="' + F.esc(opts.ph || "") + '">' + F.esc(opts.value || "") + '</textarea>'
        : '<input id="' + id + '" type="' + (opts.type || "text") + '" ' +
          (opts.numeric ? 'inputmode="numeric" class="num" ' : "") +
          'placeholder="' + F.esc(opts.ph || "") + '" value="' + F.esc(opts.value || "") + '">') +
      '<div class="err">' + F.esc(opts.err || "هذا الحقل مطلوب") + '</div>' +
    '</div>';
  }

  function invalid(id, msg) {
    var f = $("f_" + id);
    f.classList.add("invalid");
    if (msg) f.querySelector(".err").textContent = msg;
    f.querySelector("input, textarea").focus();
    return false;
  }

  function clearInvalid(id) { $("f_" + id).classList.remove("invalid"); }

  /* ---------- شخص جديد / تعديل ---------- */
  function openPersonForm(person) {
    var isEdit = !!person;
    openModal(
      '<h2>' + (isEdit ? "تعديل البيانات" : "شخص جديد") + '</h2>' +
      '<p class="hint">' + (isEdit ? "عدّل بيانات الشخص." : "أضف زبونًا جديدًا إلى دفتر الديون.") + '</p>' +
      fieldHTML("pName", "الاسم *", { ph: "مثال: أحمد سعيد", value: isEdit ? person.name : "" }) +
      fieldHTML("pPhone", "رقم الهاتف", { ph: "07XX XXX XXXX", type: "tel", value: isEdit ? person.phone : "" }) +
      fieldHTML("pNote", "ملاحظة", { textarea: true, ph: "أي تفاصيل تريد تذكّرها", value: isEdit ? person.note : "" }) +
      (isEdit ? "" : fieldHTML("pOpen", "دين افتتاحي (اختياري)", { numeric: true, ph: "0" })) +
      '<div class="modal-actions">' +
        '<button class="btn btn--glass" data-close>إلغاء</button>' +
        '<button class="btn btn--primary" id="pSave">' + (isEdit ? "حفظ" : "إضافة") + '</button>' +
      '</div>',
      function () {
        $("pSave").onclick = function () {
          var name = $("pName").value.trim();
          if (!name) return invalid("pName", "الاسم مطلوب");
          clearInvalid("pName");

          if (isEdit) {
            S.updatePerson(person.id, {
              name: name, phone: $("pPhone").value, note: $("pNote").value
            });
            toast("تم حفظ التعديلات");
          } else {
            var openingRaw = $("pOpen").value.trim();
            var opening = openingRaw ? F.parseAmount(openingRaw) : 0;
            if (openingRaw && (!isFinite(opening) || opening < 0)) {
              return invalid("pOpen", "أدخل مبلغًا صحيحًا");
            }
            var p = S.addPerson({
              name: name, phone: $("pPhone").value, note: $("pNote").value, opening: opening
            });
            toast("تمت إضافة " + p.name);
          }
          closeModal();
          refreshOpen();
        };
      }
    );
  }

  /* ---------- إضافة دين / تسديد ---------- */
  function openAmountForm(person, type) {
    var isDebt = type === "debt";
    var bal = S.balanceOf(person);
    var quick = [5000, 10000, 25000, 50000, 100000];

    openModal(
      '<h2>' + (isDebt ? "➕ إضافة دين" : "💵 تسديد دين") + '</h2>' +
      '<p class="hint">' + F.esc(person.name) + ' · المتبقّي حاليًا ' +
        '<b class="num">' + F.money(bal) + " " + S.shop.currency + '</b></p>' +

      (!isDebt && bal <= 0
        ? '<div class="callout warn">لا يوجد دين مستحق على هذا الشخص. أي مبلغ تسجّله الآن سيُحتسب رصيدًا زائدًا له.</div>'
        : "") +

      fieldHTML("aAmt", "المبلغ *", { numeric: true, ph: "0" }) +
      '<div class="quick" id="quickRow">' +
        quick.map(function (q) {
          return '<button type="button" data-q="' + q + '">' + F.money(q) + "</button>";
        }).join("") +
        (!isDebt && bal > 0 ? '<button type="button" data-q="' + bal + '">كامل المبلغ</button>' : "") +
      '</div>' +

      fieldHTML("aNote", "البيان (اختياري)", { ph: isDebt ? "مثال: شاحن + جراب" : "مثال: دفعة أولى" }) +

      '<label class="row" style="gap:.5rem;font-size:.85rem;color:var(--text-2);margin-top:.2rem">' +
        '<input type="checkbox" id="aPrint" style="width:auto"> طباعة وصل بعد الحفظ' +
      '</label>' +

      '<div class="modal-actions">' +
        '<button class="btn btn--glass" data-close>إلغاء</button>' +
        '<button class="btn ' + (isDebt ? "btn--danger" : "btn--good") + '" id="aSave">حفظ</button>' +
      '</div>',
      function () {
        $("quickRow").onclick = function (e) {
          var b = e.target.closest("[data-q]");
          if (!b) return;
          $("aAmt").value = F.money(b.dataset.q);
          clearInvalid("aAmt");
        };
        $("aSave").onclick = function () {
          var amt = F.parseAmount($("aAmt").value);
          if (!isFinite(amt) || amt <= 0) return invalid("aAmt", "أدخل مبلغًا أكبر من صفر");
          clearInvalid("aAmt");

          var tx;
          try {
            tx = S.addTx(person.id, { type: type, amount: amt, note: $("aNote").value });
          } catch (err) { return toast(err.message, "bad"); }

          var wantPrint = $("aPrint").checked;
          closeModal();
          refreshOpen();
          toast((isDebt ? "أُضيف دين " : "تم تسديد ") + F.money(amt) + " " + S.shop.currency);

          if (wantPrint) {
            setTimeout(function () {
              INV.print(S.getPerson(person.id), { kind: "receipt", tx: tx, paper: "mm80" });
            }, 380);
          }
        };
      }
    );
  }

  /* ---------- مساواة الأرقام (مسامحة) ---------- */
  function openForgiveForm(person) {
    var bal = S.balanceOf(person);

    if (bal <= 0) {
      toast("لا يوجد دين مستحق لمساواته", "info");
      return;
    }

    openModal(
      '<h2>🤝 مساواة الأرقام</h2>' +
      '<p class="hint">مسامحة ' + F.esc(person.name) + ' عن كامل المتبقّي.</p>' +

      '<div class="callout warn">' +
        'سيُسجَّل مبلغ <b class="num">' + F.money(bal) + " " + S.shop.currency + '</b> ' +
        'كمسامحة، ويصبح الرصيد <b>صفرًا</b>.<br>' +
        'السجل السابق <b>لا يُحذف</b> — تبقى كل الحركات محفوظة للمراجعة.' +
      '</div>' +

      fieldHTML("fNote", "سبب المسامحة (اختياري)", { ph: "مثال: مسامحة بمناسبة العيد" }) +

      '<div class="modal-actions">' +
        '<button class="btn btn--glass" data-close>تراجع</button>' +
        '<button class="btn btn--primary" id="fGo">تأكيد المساواة</button>' +
      '</div>',
      function () {
        $("fGo").onclick = function () {
          var tx;
          try {
            tx = S.forgiveAll(person.id, $("fNote").value.trim() || undefined);
          } catch (err) { return toast(err.message, "bad"); }

          closeModal();
          refreshOpen();
          toast("تمت المساواة — الرصيد الآن صفر 🤝");
          void tx;
        };
      }
    );
  }

  /* ---------- حذف الشخص ---------- */
  function confirmDelete(person) {
    openModal(
      '<h2>🗑️ حذف الشخص</h2>' +
      '<p class="hint">' + F.esc(person.name) + '</p>' +
      '<div class="callout warn">سيُحذف الشخص مع <b>' + person.tx.length + '</b> حركة نهائيًا. ' +
        'لا يمكن التراجع عن هذا الإجراء.</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn--glass" data-close>إلغاء</button>' +
        '<button class="btn btn--danger" id="dGo">حذف نهائي</button>' +
      '</div>',
      function () {
        $("dGo").onclick = function () {
          S.removePerson(person.id);
          closeModal();
          closeSheet(0);
          renderStats(); renderCards();
          toast("تم حذف " + person.name, "info");
        };
      }
    );
  }

  /* ============================================================
     قائمة الطباعة / PDF
     ============================================================ */
  function openMenu(anchor, items) {
    el.menu.innerHTML = items.map(function (it) {
      if (it.sep) return "<hr>";
      return '<button data-mi="' + it.key + '">' +
        '<span>' + it.icon + '</span>' +
        '<span>' + F.esc(it.label) +
          (it.sub ? '<small>' + F.esc(it.sub) + "</small>" : "") +
        '</span></button>';
    }).join("");

    el.menu.classList.add("open");
    var r = anchor.getBoundingClientRect();
    var mw = el.menu.offsetWidth, mh = el.menu.offsetHeight;

    var top = r.bottom + 8;
    if (top + mh > global.innerHeight - 8) top = Math.max(8, r.top - mh - 8);
    var left = Math.min(Math.max(8, r.left), global.innerWidth - mw - 8);

    el.menu.style.top = top + "px";
    el.menu.style.left = left + "px";
    M.materialize(el.menu, { distance: 8, response: 0.28 });

    el.menu.onclick = function (e) {
      var b = e.target.closest("[data-mi]");
      if (!b) return;
      var found = items.filter(function (x) { return x.key === b.dataset.mi; })[0];
      closeMenu();
      if (found && found.run) found.run();
    };
  }

  function closeMenu() {
    if (!el.menu.classList.contains("open")) return;
    el.menu.classList.remove("open");
    el.menu.style.opacity = "";
    el.menu.style.transform = "";
  }

  function printMenu(person, anchor, forPDF) {
    var lastTx = person.tx.slice().sort(function (a, b) { return b.at - a.at; })[0];
    var verb = forPDF ? "حفظ" : "طباعة";
    var run = forPDF ? INV.savePDF : INV.print;

    var items = [
      { key: "sa4",  icon: "📄", label: verb + " كشف حساب — A4",
        sub: "كل الحركات + المجاميع والتواقيع",
        run: function () { run(person, { kind: "statement", paper: "a4" }); after(forPDF); } },
      { key: "s80",  icon: "🧾", label: verb + " كشف حساب — 80mm",
        sub: "وصل حراري مضغوط",
        run: function () { run(person, { kind: "statement", paper: "mm80" }); after(forPDF); } }
    ];

    if (lastTx) {
      items.push({ sep: true });
      items.push({ key: "ra4", icon: "📄", label: verb + " وصل آخر حركة — A4",
        sub: typeAr(lastTx) + " · " + F.money(lastTx.amount),
        run: function () { run(person, { kind: "receipt", tx: lastTx, paper: "a4" }); after(forPDF); } });
      items.push({ key: "r80", icon: "🧾", label: verb + " وصل آخر حركة — 80mm",
        sub: typeAr(lastTx) + " · " + F.money(lastTx.amount),
        run: function () { run(person, { kind: "receipt", tx: lastTx, paper: "mm80" }); after(forPDF); } });
    }
    openMenu(anchor, items);
  }

  function typeAr(t) {
    return { debt: "دين", pay: "تسديد", forgive: "مسامحة" }[t.type] || t.type;
  }

  function after(forPDF) {
    if (forPDF) {
      toast("اختر «حفظ بصيغة PDF» من وجهة الطباعة", "info");
    }
  }

  /* ============================================================
     واتساب — إرسال ملخّص الحساب
     ============================================================ */
  function sendWhatsApp(p) {
    var bal = S.balanceOf(p), cur = S.shop.currency;
    var lines = [
      "مرحبًا " + p.name + " 👋",
      "كشف حسابك لدى " + S.shop.name + ":",
      "",
      "مجموع الديون: " + F.money(S.sumBy(p, "debt")) + " " + cur,
      "المسدَّد: " + F.money(S.sumBy(p, "pay")) + " " + cur
    ];
    var forgiven = S.sumBy(p, "forgive");
    if (forgiven > 0) lines.push("المسامحة: " + F.money(forgiven) + " " + cur);
    lines.push("");
    lines.push(bal > 0 ? "المتبقّي: " + F.money(bal) + " " + cur
             : bal < 0 ? "لك رصيد زائد: " + F.money(-bal) + " " + cur
             : "حسابك مساوى بالكامل ✓");

    var phone = String(p.phone || "").replace(/\D/g, "");
    if (phone.indexOf("0") === 0) phone = "964" + phone.slice(1);   // صيغة العراق الدولية

    var url = "https://wa.me/" + (phone || "") + "?text=" + encodeURIComponent(lines.join("\n"));
    global.open(url, "_blank", "noopener");
  }

  /* ============================================================
     النسخ الاحتياطي
     ============================================================ */
  function backupMenu(anchor) {
    openMenu(anchor, [
      { key: "exp", icon: "⬇️", label: "تصدير نسخة احتياطية", sub: "ملف JSON يحتوي كل البيانات", run: doExport },
      { key: "imp", icon: "⬆️", label: "استيراد نسخة", sub: "دمج أو استبدال البيانات الحالية", run: function () { el.file.click(); } },
      { sep: true },
      { key: "shop", icon: "🏪", label: "بيانات المحل", sub: "تظهر في ترويسة كل فاتورة", run: openShopForm }
    ]);
  }

  function doExport() {
    var blob = new Blob([S.exportJSON()], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "نسخة-ديون-" + F.dateShort(Date.now()).replace(/\//g, "-") + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("تم تصدير النسخة الاحتياطية");
  }

  function handleImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      openModal(
        '<h2>⬆️ استيراد نسخة</h2>' +
        '<p class="hint">' + F.esc(file.name) + '</p>' +
        '<div class="callout warn"><b>دمج:</b> يضيف الأشخاص والحركات غير الموجودة ويُبقي بياناتك.<br>' +
          '<b>استبدال:</b> يمسح البيانات الحالية ويضع محلّها محتوى الملف.</div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn--glass" data-close>إلغاء</button>' +
          '<button class="btn btn--danger" id="iRep">استبدال</button>' +
          '<button class="btn btn--primary" id="iMer">دمج</button>' +
        '</div>',
        function () {
          function run(mode) {
            try { S.importJSON(reader.result, mode); }
            catch (err) { closeModal(); return toast("تعذّر الاستيراد: " + err.message, "bad"); }
            closeModal();
            renderStats(); renderCards();
            toast(mode === "merge" ? "تم دمج النسخة" : "تم استبدال البيانات");
          }
          $("iMer").onclick = function () { run("merge"); };
          $("iRep").onclick = function () { run("replace"); };
        }
      );
    };
    reader.onerror = function () { toast("تعذّرت قراءة الملف", "bad"); };
    reader.readAsText(file, "utf-8");
  }

  function openShopForm() {
    var s = S.shop;
    openModal(
      '<h2>🏪 بيانات المحل</h2>' +
      '<p class="hint">تظهر في ترويسة كل فاتورة ووصل.</p>' +
      fieldHTML("sName", "اسم المحل", { value: s.name }) +
      fieldHTML("sPhone", "الهاتف", { value: s.phone, type: "tel" }) +
      fieldHTML("sAddr", "العنوان", { value: s.address }) +
      fieldHTML("sCur", "العملة", { value: s.currency }) +
      fieldHTML("sNote", "عبارة أسفل الفاتورة", { value: s.note }) +
      '<div class="modal-actions">' +
        '<button class="btn btn--glass" data-close>إلغاء</button>' +
        '<button class="btn btn--primary" id="sSave">حفظ</button>' +
      '</div>',
      function () {
        $("sSave").onclick = function () {
          S.setShop({
            name: $("sName").value.trim() || s.name,
            phone: $("sPhone").value.trim(),
            address: $("sAddr").value.trim(),
            currency: $("sCur").value.trim() || "IQD",
            note: $("sNote").value.trim()
          });
          closeModal();
          refreshOpen();
          toast("تم حفظ بيانات المحل");
        };
      }
    );
  }

  /* ============================================================
     الثيم
     ============================================================ */
  function applyTheme(mode) {
    var real = mode === "auto"
      ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : mode;
    document.documentElement.dataset.theme = real;
    el.themeBtn.textContent = { dark: "🌙", light: "☀️", auto: "🌓" }[mode];
    el.themeBtn.title = "المظهر: " + { dark: "داكن", light: "فاتح", auto: "تلقائي" }[mode];
    try { localStorage.setItem("sfn.debts.theme", mode); } catch (e) {}
  }

  /* ============================================================
     التشغيل
     ============================================================ */
  function init() {
    el = {
      stats: $("stats"), cards: $("cards"), empty: $("empty"),
      search: $("search"), sheet: $("sheet"), scrim: $("scrim"), scrim2: $("scrim2"),
      sheetHead: $("sheetHead"), sheetBody: $("sheetBody"),
      modal: $("modal"), menu: $("menu"), toasts: $("toasts"),
      themeBtn: $("themeBtn"), file: $("fileInput"), grabber: $("grabber")
    };

    S.load();
    if (S.data._corrupt) {
      toast("تعذّرت قراءة البيانات المحفوظة — بدأنا بدفتر فارغ", "bad");
    }

    var savedTheme = "dark";
    try { savedTheme = localStorage.getItem("sfn.debts.theme") || "dark"; } catch (e) {}
    applyTheme(savedTheme);

    var modes = ["dark", "light", "auto"];
    el.themeBtn.onclick = function () {
      var cur = localStorage.getItem("sfn.debts.theme") || "dark";
      applyTheme(modes[(modes.indexOf(cur) + 1) % modes.length]);
    };
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      if ((localStorage.getItem("sfn.debts.theme") || "dark") === "auto") applyTheme("auto");
    });

    renderStats();
    renderCards();
    bindDrag(el.grabber);
    bindDrag(el.sheetHead);

    /* البحث */
    el.search.addEventListener("input", function () {
      state.q = el.search.value;
      renderCards();
    });

    /* التصفية والترتيب */
    $("filterSeg").onclick = function (e) {
      var b = e.target.closest("button[data-filter]");
      if (!b) return;
      state.filter = b.dataset.filter;
      [].forEach.call(this.querySelectorAll("button"), function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      renderCards();
    };
    $("sortSeg").onclick = function (e) {
      var b = e.target.closest("button[data-sort]");
      if (!b) return;
      state.sort = b.dataset.sort;
      [].forEach.call(this.querySelectorAll("button"), function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      renderCards();
    };

    $("addPerson").onclick = function () { openPersonForm(null); };
    $("backupBtn").onclick = function (e) { backupMenu(e.currentTarget); };

    el.file.onchange = function () {
      if (this.files && this.files[0]) handleImport(this.files[0]);
      this.value = "";
    };

    /* فتح البطاقات */
    el.cards.addEventListener("click", function (e) {
      var c = e.target.closest("[data-open]");
      if (c) openSheet(c.dataset.open, c);
    });
    el.cards.addEventListener("pointermove", trackGlare);

    /* أزرار داخل شاشة التفاصيل */
    el.sheetBody.addEventListener("click", function (e) {
      var p = state.openId ? S.getPerson(state.openId) : null;
      if (!p) return;

      var act = e.target.closest("[data-act]");
      if (act) {
        var a = act.dataset.act;
        if (a === "debt")    return openAmountForm(p, "debt");
        if (a === "pay")     return openAmountForm(p, "pay");
        if (a === "forgive") return openForgiveForm(p);
        if (a === "print")   return printMenu(p, act, false);
        if (a === "pdf")     return printMenu(p, act, true);
        if (a === "wa")      return sendWhatsApp(p);
        if (a === "delete")  return confirmDelete(p);
      }

      var del = e.target.closest("[data-deltx]");
      if (del) {
        var txId = del.dataset.deltx;
        var tx = p.tx.filter(function (t) { return t.id === txId; })[0];
        if (!tx) return;
        undoBuf = { personId: p.id, tx: tx };
        S.removeTx(p.id, txId);
        refreshOpen();
        toast("حُذفت الحركة", "info", {
          label: "تراجع",
          run: function () {
            if (!undoBuf) return;
            var per = S.getPerson(undoBuf.personId);
            if (per) { per.tx.push(undoBuf.tx); S.save(); refreshOpen(); }
            undoBuf = null;
          }
        });
      }
    });

    /* الإغلاق */
    el.scrim.onclick = function () { closeSheet(0); };
    el.scrim2.onclick = closeModal;

    el.modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });

    /* Enter داخل النموذج = الزر الرئيسي */
    el.modal.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
      var main = el.modal.querySelector(".modal-actions .btn:last-child");
      if (main) { e.preventDefault(); main.click(); }
    });

    document.addEventListener("click", function (e) {
      if (el.menu.classList.contains("open") &&
          !e.target.closest("#menu") && !e.target.closest("[data-act]") &&
          !e.target.closest("#backupBtn")) {
        closeMenu();
      }
    }, true);

    /* لوحة المفاتيح */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (el.menu.classList.contains("open")) return closeMenu();
        if (el.modal.classList.contains("open")) return closeModal();
        if (el.sheet.classList.contains("open")) return closeSheet(0);
      }
      // اختصارات سريعة عندما لا يكتب المستخدم في حقل
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (typing) return;
      if (e.key === "n" || e.key === "ن") { e.preventDefault(); openPersonForm(null); }
      if (e.key === "/") { e.preventDefault(); el.search.focus(); }
    });

    /* إعادة حساب موضع الورقة عند تغيير حجم النافذة */
    global.addEventListener("resize", function () {
      if (el.sheet.classList.contains("open") && sheetY && !dragging) {
        sheetY.setValue(0, 0);
      }
    });
  }

  global.SFN = global.SFN || {};
  global.SFN.ui = { init: init, toast: toast, refresh: refreshOpen };
})(window);
