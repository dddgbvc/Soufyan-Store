/* ============================================================
   ui/components.js — عناصر واجهة قابلة لإعادة الاستخدام
   Toast · Modal · Drawer · Menu · Chip · Combobox · Smart Table
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { h, dom, icon, util: U } = ERP;

  const overlays = () => document.getElementById('overlays');
  const toastHost = () => document.getElementById('toasts');

  /* ============================================================
     Toast
     ============================================================ */
  const TOAST_ICON = { ok: 'check', info: 'info', warn: 'alert', err: 'x', match: 'sparkle' };

  function toast({ title, body, tone = 'info', timeout = 4200, action }) {
    const el = h('div', { class: 'toast', dataset: { tone }, role: 'status' },
      h('div', { class: 'toast-ic' }, icon(TOAST_ICON[tone] || 'info', 16)),
      h('div', { class: 'grow' },
        h('div', { class: 'toast-title' }, title),
        body ? h('div', { class: 'toast-body' }, body) : null,
        action ? h('button', {
          class: 'btn btn-sm mt-2',
          onclick: () => { close(); action.run(); },
        }, action.label) : null,
      ),
      h('button', { class: 'btn btn-quiet btn-icon btn-sm', 'aria-label': 'إغلاق', onclick: () => close() }, icon('x', 15)),
    );

    let timer;
    function close() {
      clearTimeout(timer);
      el.classList.add('closing');
      setTimeout(() => el.remove(), 220);
    }
    toastHost().appendChild(el);
    if (timeout) timer = setTimeout(close, timeout);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { if (timeout) timer = setTimeout(close, 1600); });
    return { close, el };
  }

  /* ============================================================
     Modal
     ============================================================ */
  function modal({ title, sub, body, foot, size = '', onClose, closeOnScrim = true }) {
    const prevFocus = document.activeElement;
    const box = h('div', {
      class: 'modal ' + size, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'نافذة',
    });

    const head = h('div', { class: 'modal-head' },
      h('div', { class: 'grow' },
        h('div', { class: 'modal-title' }, title),
        sub ? h('div', { class: 'modal-sub' }, sub) : null,
      ),
      h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': 'إغلاق', onclick: () => close() }, icon('x', 18)),
    );
    const bodyEl = h('div', { class: 'modal-body' }, body);
    box.append(head, bodyEl);
    if (foot) box.appendChild(h('div', { class: 'modal-foot' }, foot));

    const scrim = h('div', {
      class: 'scrim',
      onclick: (e) => { if (closeOnScrim && e.target === scrim) close(); },
    }, box);

    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    const untrap = dom.trapFocus(box);

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      untrap();
      scrim.classList.add('closing');
      setTimeout(() => {
        scrim.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        if (onClose) onClose(result);
      }, 180);
    }

    document.addEventListener('keydown', onKey, true);
    overlays().appendChild(scrim);
    setTimeout(() => {
      const first = dom.qs('[autofocus], input, button, select, textarea', bodyEl);
      (first || box).focus();
    }, 60);

    return { el: box, body: bodyEl, close, scrim };
  }

  /* ============================================================
     Drawer
     ============================================================ */
  function drawer({ title, sub, body, foot, badge, onClose }) {
    const prevFocus = document.activeElement;
    const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'تفاصيل' },
      h('div', { class: 'drawer-head' },
        h('div', { class: 'grow' },
          h('div', { class: 'row gap-2' },
            h('div', { class: 'modal-title' }, title),
            badge || null,
          ),
          sub ? h('div', { class: 'modal-sub' }, sub) : null,
        ),
        h('button', { class: 'btn btn-quiet btn-icon', 'aria-label': 'إغلاق', onclick: () => close() }, icon('x', 18)),
      ),
      h('div', { class: 'drawer-body' }, body),
      foot ? h('div', { class: 'drawer-foot' }, foot) : null,
    );

    const scrim = h('div', {
      class: 'drawer-scrim',
      onclick: (e) => { if (e.target === scrim) close(); },
    }, panel);

    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    const untrap = dom.trapFocus(panel);

    function close() {
      document.removeEventListener('keydown', onKey, true);
      untrap();
      scrim.classList.add('closing');
      setTimeout(() => {
        scrim.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        if (onClose) onClose();
      }, 180);
    }

    document.addEventListener('keydown', onKey, true);
    overlays().appendChild(scrim);
    setTimeout(() => panel.focus(), 60);
    return { el: panel, close };
  }

  /* ============================================================
     Confirm
     ============================================================ */
  function confirm({ title, body, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', tone = 'primary' }) {
    return new Promise((resolve) => {
      let decided = false;
      const m = modal({
        title, size: 'modal-sm',
        body: h('div', { class: 't-2 fs-13' }, body),
        foot: h('div', { class: 'row gap-2', style: { marginInlineStart: 'auto' } },
          h('button', { class: 'btn btn-quiet', onclick: () => { decided = true; m.close(); resolve(false); } }, cancelLabel),
          h('button', {
            class: 'btn ' + (tone === 'danger' ? 'btn-danger' : 'btn-primary'),
            onclick: () => { decided = true; m.close(); resolve(true); },
          }, confirmLabel),
        ),
        onClose: () => { if (!decided) resolve(false); },
      });
    });
  }

  /* ============================================================
     Menu (Contextual actions)
     ============================================================ */
  function menu(anchor, items) {
    closeMenus();
    const el = h('div', { class: 'menu', role: 'menu' });
    items.forEach((it) => {
      if (it === '-') { el.appendChild(h('div', { class: 'menu-sep' })); return; }
      if (it.label && it.header) { el.appendChild(h('div', { class: 'menu-label' }, it.label)); return; }
      if (it.hidden) return;
      el.appendChild(h('button', {
        class: 'menu-item', role: 'menuitem', dataset: { tone: it.tone || '' },
        disabled: it.disabled || false,
        onclick: () => { closeMenus(); it.run && it.run(); },
      },
        it.icon ? icon(it.icon, 16) : null,
        h('span', { class: 'grow' }, it.label),
        it.hint ? h('span', { class: 'fs-11 t-3' }, it.hint) : null,
      ));
    });

    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, hh = el.offsetHeight;
    let top = r.bottom + 6;
    if (top + hh > window.innerHeight - 8) top = Math.max(8, r.top - hh - 6);
    let left = document.documentElement.dir === 'rtl' ? r.left : r.right - w;
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
    el.style.top = top + 'px';
    el.style.left = left + 'px';

    setTimeout(() => {
      document.addEventListener('click', closeMenus, { once: true });
      document.addEventListener('keydown', escMenu, true);
    }, 0);
    el.addEventListener('click', (e) => e.stopPropagation());
    return el;
  }
  function escMenu(e) { if (e.key === 'Escape') closeMenus(); }
  function closeMenus() {
    dom.qsa('.menu').forEach((m) => m.remove());
    document.removeEventListener('keydown', escMenu, true);
  }

  /* ============================================================
     Popover (لوحة الإشعارات مثلًا)
     ============================================================ */
  function popover(anchor, content, { width } = {}) {
    closePopovers();
    const el = h('div', { class: 'pop' }, content);
    if (width) el.style.width = width;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    let left = document.documentElement.dir === 'rtl' ? r.left : r.right - w;
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
    el.style.top = (r.bottom + 8) + 'px';
    el.style.left = left + 'px';
    setTimeout(() => {
      document.addEventListener('click', onDoc);
      document.addEventListener('keydown', onEsc, true);
    }, 0);
    function onDoc(e) { if (!el.contains(e.target) && !anchor.contains(e.target)) closePopovers(); }
    function onEsc(e) { if (e.key === 'Escape') closePopovers(); }
    el._cleanup = () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onEsc, true);
    };
    return el;
  }
  function closePopovers() {
    dom.qsa('.pop').forEach((p) => { if (p._cleanup) p._cleanup(); p.remove(); });
  }

  /* ============================================================
     Status chip
     ============================================================ */
  function statusChip(status, { large = false } = {}) {
    const meta = ERP.preorder.META[status] || {};
    return h('span', {
      class: 'chip' + (large ? ' chip-lg' : ''),
      style: { '--tone': meta.color || 'var(--text-3)' },
      title: meta.label || status,
    },
      h('i', { class: 'chip-dot' }),
      meta.label || status,
    );
  }

  function attrChip(text, hex) {
    return h('span', { class: 'chip-attr' },
      hex ? h('i', { class: 'swatch', style: { background: hex } }) : null,
      text,
    );
  }

  function avatar(name, cls = '') {
    return h('div', { class: 'avatar ' + cls, 'aria-hidden': 'true' }, U.initials(name));
  }

  /* ============================================================
     Combobox — بحث سريع مع إمكانية الإنشاء الفوري
     ============================================================ */
  function combobox({ placeholder, search, renderItem, onSelect, onCreate, createLabel, value, emptyText = 'لا نتائج' }) {
    let items = [];
    let active = -1;
    let open = false;

    const input = h('input', {
      class: 'input', type: 'text', placeholder, autocomplete: 'off',
      role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list',
      value: value || '',
      oninput: () => { render(); },
      onfocus: () => { render(); },
      onkeydown: onKey,
    });
    const pop = h('div', { class: 'combo-pop hidden', role: 'listbox' });
    const wrap = h('div', { class: 'combo' },
      input,
      pop,
    );

    function close() { open = false; pop.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; }

    function render() {
      items = search(input.value) || [];
      dom.clear(pop);
      if (items.length) {
        items.forEach((item, i) => {
          pop.appendChild(h('button', {
            type: 'button',
            class: 'combo-opt' + (i === active ? ' is-active' : ''),
            role: 'option',
            onmousedown: (e) => { e.preventDefault(); pick(item); },
            onmouseenter: () => { active = i; paint(); },
          }, renderItem(item)));
        });
      } else {
        pop.appendChild(h('div', { class: 'combo-empty' }, emptyText));
      }
      if (onCreate) {
        pop.appendChild(h('div', { class: 'menu-sep' }));
        pop.appendChild(h('button', {
          type: 'button', class: 'combo-opt',
          onmousedown: (e) => { e.preventDefault(); close(); onCreate(input.value.trim()); },
        }, icon('plus', 16), h('span', null, createLabel || 'إضافة جديد'),
          input.value.trim() ? h('span', { class: 'fs-11 t-3' }, `«${input.value.trim()}»`) : null));
      }
      open = true;
      pop.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
    }

    function paint() {
      dom.qsa('.combo-opt', pop).forEach((el, i) => el.classList.toggle('is-active', i === active));
    }

    function pick(item) {
      close();
      input.value = '';
      onSelect(item);
    }

    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) render(); active = Math.min(active + 1, items.length - 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
      else if (e.key === 'Enter') {
        if (open && active > -1 && items[active]) { e.preventDefault(); pick(items[active]); }
        else if (open && items.length === 1) { e.preventDefault(); pick(items[0]); }
      } else if (e.key === 'Escape') { if (open) { e.stopPropagation(); close(); } }
    }

    input.addEventListener('blur', () => setTimeout(close, 120));
    return { el: wrap, input, close, refresh: render };
  }

  /* ============================================================
     Smart Table
     ============================================================ */
  /**
   * @param {object} cfg
   *  columns: [{key,label,sortable,cell(row),align,width,mobileLabel,primary}]
   *  rows, sort:{key,dir}, onSort(key), onRowClick(row), rowClass(row), empty:node
   */
  function smartTable(cfg) {
    const thead = h('thead', null,
      h('tr', null, ...cfg.columns.map((c) => {
        const isSorted = cfg.sort && cfg.sort.key === c.key;
        return h('th', {
          class: c.sortable ? 'sortable' : '',
          scope: 'col',
          style: c.width ? { width: c.width } : null,
          'aria-sort': isSorted ? (cfg.sort.dir === 'asc' ? 'ascending' : 'descending') : null,
          onclick: c.sortable && cfg.onSort ? () => cfg.onSort(c.key) : null,
        },
          c.label,
          c.sortable ? h('span', { class: 'sort-ic' },
            icon(isSorted ? (cfg.sort.dir === 'asc' ? 'up' : 'down') : 'sort', 12)) : null,
        );
      })),
    );

    const tbody = h('tbody');
    cfg.rows.forEach((row) => {
      const tr = h('tr', {
        tabindex: '0',
        class: cfg.rowClass ? cfg.rowClass(row) : '',
        onclick: (e) => {
          if (e.target.closest('button, a, input, .actions')) return;
          cfg.onRowClick && cfg.onRowClick(row);
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); cfg.onRowClick && cfg.onRowClick(row); }
        },
      });
      cfg.columns.forEach((c) => {
        const content = c.cell(row);
        tr.appendChild(h('td', {
          class: (c.class || '') + (c.primary ? ' col-primary' : ''),
          dataset: { label: c.mobileLabel || c.label },
          style: c.align ? { textAlign: c.align } : null,
        }, content));
      });
      tbody.appendChild(tr);
    });

    const table = h('table', { class: 'smart' }, thead, tbody);
    if (!cfg.rows.length) {
      return h('div', null, cfg.empty || emptyState({ title: 'لا توجد بيانات' }));
    }
    return h('div', { class: 'table-wrap' }, table);
  }

  function emptyState({ title, body, icon: ic = 'inbox', action }) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-ic' }, icon(ic, 24)),
      h('div', { class: 'empty-title' }, title),
      body ? h('div', { class: 'empty-body' }, body) : null,
      action || null,
    );
  }

  /* ============================================================
     أدوات صغيرة
     ============================================================ */
  function field(label, control, { hint, required } = {}) {
    return h('div', { class: 'field' },
      h('label', { class: 'label' }, label, required ? h('span', { class: 'req' }, ' *') : null),
      control,
      hint ? h('div', { class: 'hint' }, hint) : null,
    );
  }

  function stepper(value, onChange, { min = 1, max = 999 } = {}) {
    const input = h('input', {
      type: 'number', value, min, max, 'aria-label': 'الكمية',
      oninput: () => onChange(U.clamp(input.value, min, max)),
    });
    const set = (v) => { input.value = U.clamp(v, min, max); onChange(Number(input.value)); };
    return h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'إنقاص', onclick: () => set(Number(input.value) - 1) }, h('span', null, '−')),
      input,
      h('button', { type: 'button', 'aria-label': 'زيادة', onclick: () => set(Number(input.value) + 1) }, h('span', null, '+')),
    );
  }

  function segmented(options, current, onPick) {
    return h('div', { class: 'segmented', role: 'group' },
      ...options.map((o) => h('button', {
        type: 'button',
        'aria-pressed': String(o.value === current),
        onclick: () => onPick(o.value),
      }, o.label)),
    );
  }

  function banner(text, tone = 'info', ic = 'info') {
    const map = { info: 'var(--info)', warn: 'var(--warn)', err: 'var(--err)', ok: 'var(--ok)' };
    return h('div', { class: 'banner', style: { '--tone': map[tone] || map.info } },
      h('span', { class: 'banner-ic' }, icon(ic, 16)),
      h('div', { class: 'grow' }, text),
    );
  }

  async function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      toast({ title: 'تم النسخ', tone: 'ok', timeout: 1800 });
      return true;
    } catch (_) {
      toast({ title: 'تعذّر النسخ', tone: 'err' });
      return false;
    }
  }

  ERP.ui = {
    toast, modal, drawer, confirm, menu, closeMenus, popover, closePopovers,
    statusChip, attrChip, avatar, combobox, smartTable, emptyState,
    field, stepper, segmented, banner, copy,
  };
})(window);
