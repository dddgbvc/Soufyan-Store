/* ============================================================
   core/util.js — أدوات عامة (بدون أي اعتماد خارجي)
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});

  const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  const U = {
    /* ---------- معرفات ---------- */
    uid(prefix) {
      const rnd = Math.random().toString(36).slice(2, 8);
      const t = Date.now().toString(36).slice(-5);
      return (prefix ? prefix + '_' : '') + t + rnd;
    },

    /* ---------- وقت ---------- */
    nowISO() { return new Date().toISOString(); },
    today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
    addDays(date, days) {
      const d = new Date(date instanceof Date ? date.getTime() : Date.parse(date));
      d.setDate(d.getDate() + days);
      return d;
    },
    dateInput(iso) {                       // YYYY-MM-DD لحقول <input type=date>
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },
    fmtDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    },
    fmtDateShort(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    },
    fmtTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getHours())}:${p(d.getMinutes())}`;
    },
    fmtDateTime(iso) {
      if (!iso) return '—';
      return `${U.fmtDateShort(iso)} · ${U.fmtTime(iso)}`;
    },
    /** فرق زمني بالعربية: "قبل ٣ أيام" */
    relTime(iso) {
      if (!iso) return '—';
      const then = new Date(iso).getTime();
      if (isNaN(then)) return '—';
      const diff = then - Date.now();
      const abs = Math.abs(diff);
      const min = 60000, hr = 3600000, day = 86400000;
      let value, unit;
      if (abs < min) { return diff >= 0 ? 'الآن' : 'قبل لحظات'; }
      if (abs < hr) { value = Math.round(diff / min); unit = 'minute'; }
      else if (abs < day) { value = Math.round(diff / hr); unit = 'hour'; }
      else if (abs < day * 30) { value = Math.round(diff / day); unit = 'day'; }
      else if (abs < day * 365) { value = Math.round(diff / (day * 30)); unit = 'month'; }
      else { value = Math.round(diff / (day * 365)); unit = 'year'; }
      try {
        return new Intl.RelativeTimeFormat('ar', { numeric: 'auto' }).format(value, unit);
      } catch (_) {
        return U.fmtDateShort(iso);
      }
    },
    /** عدد الأيام المتبقية (سالب = متأخر) */
    daysUntil(iso) {
      if (!iso) return null;
      const d = new Date(iso); if (isNaN(d)) return null;
      d.setHours(0, 0, 0, 0);
      return Math.round((d - U.today()) / 86400000);
    },

    /* ---------- أرقام ونصوص ---------- */
    fmtNum(n) {
      const v = Number(n) || 0;
      return new Intl.NumberFormat('en-US').format(v);
    },
    fmtMoney(n) {
      if (n === null || n === undefined || n === '') return '—';
      return U.fmtNum(Math.round(Number(n))) + ' د.ع';
    },
    /** تطبيع نص للمطابقة: حروف صغيرة، بدون مسافات/رموز، توحيد الألف والهاء */
    norm(s) {
      if (s === null || s === undefined) return '';
      return String(s)
        .toLowerCase()
        .replace(/[ً-ٰٟ]/g, '')      // تشكيل
        .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/[\s\-_/\\.,+()]/g, '')
        .trim();
    },
    /** بحث ضبابي بسيط: هل كل كلمات الاستعلام موجودة؟ */
    matchQuery(query, ...fields) {
      const q = String(query || '').trim();
      if (!q) return true;
      const hay = fields.map((f) => U.norm(f)).join(' ');
      return U.norm(q).length
        ? q.split(/\s+/).every((w) => hay.includes(U.norm(w)))
        : true;
    },
    initials(name) {
      const parts = String(name || '؟').trim().split(/\s+/).slice(0, 2);
      return parts.map((p) => p[0]).join('');
    },
    escapeHtml(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /** رقم عراقي إلى صيغة دولية: 07731644450 → 9647731644450 */
    phoneIntl(phone, cc = '964') {
      let p = String(phone || '').replace(/[^\d+]/g, '');
      if (p.startsWith('+')) p = p.slice(1);
      if (p.startsWith('00')) p = p.slice(2);
      if (p.startsWith(cc)) return p;
      if (p.startsWith('0')) p = p.slice(1);
      return cc + p;
    },
    isValidPhone(phone) {
      const p = String(phone || '').replace(/\D/g, '');
      return p.length >= 9 && p.length <= 15;
    },

    /* ---------- مجموعات ---------- */
    by(key, dir = 'asc') {
      const sign = dir === 'desc' ? -1 : 1;
      return (a, b) => {
        const va = typeof key === 'function' ? key(a) : a[key];
        const vb = typeof key === 'function' ? key(b) : b[key];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        return (va > vb ? 1 : -1) * sign;
      };
    },
    groupBy(arr, keyFn) {
      return arr.reduce((acc, item) => {
        const k = keyFn(item);
        (acc[k] = acc[k] || []).push(item);
        return acc;
      }, {});
    },
    clone(o) { return JSON.parse(JSON.stringify(o)); },
    debounce(fn, ms = 220) {
      let t;
      return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
    },
    clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); },

    /* ---------- ملفات ---------- */
    downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
      const blob = new Blob(['﻿' + text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    },
    toCSV(rows, headers) {
      const esc = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
      const head = headers.map((h) => esc(h.label)).join(',');
      const body = rows.map((r) => headers.map((h) => esc(h.value(r))).join(',')).join('\n');
      return head + '\n' + body;
    },
  };

  /* ============================================================
     DOM helpers
     ============================================================ */
  function appendChildren(el, kids) {
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false || kid === true) continue;
      if (Array.isArray(kid)) { appendChildren(el, kid); continue; }
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }

  /** h('div', {class:'x', onclick:fn}, child, child) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs); attrs = null;
    }
    if (attrs) {
      for (const key in attrs) {
        const v = attrs[key];
        if (v === null || v === undefined || v === false) continue;
        if (key === 'class') el.className = v;
        else if (key === 'text') el.textContent = v;
        else if (key === 'html') el.innerHTML = v;
        else if (key === 'style' && typeof v === 'object') {
          // المتغيرات المخصصة (--tone) تحتاج setProperty — لا تعمل مع Object.assign
          for (const prop in v) {
            if (prop.startsWith('--')) el.style.setProperty(prop, v[prop]);
            else el.style[prop] = v[prop];
          }
        }
        else if (key === 'dataset') Object.assign(el.dataset, v);
        else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
        else if (key === 'ref' && typeof v === 'function') v(el);
        else if (v === true) el.setAttribute(key, '');
        else el.setAttribute(key, v);
      }
    }
    appendChildren(el, kids);
    return el;
  }

  const dom = {
    h,
    frag(...kids) { const f = document.createDocumentFragment(); appendChildren(f, kids); return f; },
    qs(sel, root = document) { return root.querySelector(sel); },
    qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
    clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; },
    mount(el, node) { dom.clear(el); if (node) el.appendChild(node); return el; },
    /** حبس التركيز داخل حاوية (للنوافذ) */
    trapFocus(container) {
      const sel = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
      function onKey(e) {
        if (e.key !== 'Tab') return;
        const items = dom.qsa(sel, container).filter((n) => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      container.addEventListener('keydown', onKey);
      return () => container.removeEventListener('keydown', onKey);
    },
  };

  ERP.util = U;
  ERP.dom = dom;
  ERP.h = h;
})(window);
