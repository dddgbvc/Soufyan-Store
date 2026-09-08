/* ============================================================
   core/icons.js — مجموعة أيقونات موحّدة (stroke 1.6 · 20px)
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});

  const P = {
    preorder: '<path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"/><path d="M16 5h1.5A1.5 1.5 0 0 1 19 6.5v12A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-12A1.5 1.5 0 0 1 6.5 5H8"/><path d="m9 13 2 2 4-4"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.8 5.8 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6"/><path d="M17.5 14.4a5.4 5.4 0 0 1 3 4.6"/>',
    receipt: '<path d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-2.5-1.6L8 20.5 6 21.9V3.5Z"/><path d="M9.5 8h5M9.5 12h5"/>',
    message: '<path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.4-4.4A7.5 7.5 0 1 1 20 12Z"/><path d="M9 11h6M9 14h4"/>',
    activity: '<path d="M3 12h4l2.5-6 5 12L17 12h4"/>',
    bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 18.5a2.2 2.2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="6.2"/><path d="m16 16 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 2"/>',
    truck: '<path d="M3 7h10v9H3z"/><path d="M13 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    tag: '<path d="M4 11V5a1 1 0 0 1 1-1h6l8.5 8.5a1.4 1.4 0 0 1 0 2L14 20a1.4 1.4 0 0 1-2 0L4 11Z"/><circle cx="8" cy="8" r="1.3"/>',
    whatsapp: '<path d="M20 11.7a7.9 7.9 0 0 1-11.7 6.9L4 20l1.5-4.1A7.9 7.9 0 1 1 20 11.7Z"/><path d="M9.2 9c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.3 0 .5-.1.6l-.4.5c-.1.1-.2.3-.1.5a5 5 0 0 0 2.4 2.1c.2.1.4 0 .5-.1l.5-.6c.2-.2.4-.2.6-.1l1.3.7c.3.2.4.3.4.5s0 .9-.4 1.3c-.4.4-1 .6-1.6.5-1-.1-2.6-.7-4-2.1s-2-3-2.1-3.9c0-.7.2-1.2.6-1.6Z" fill="currentColor" stroke="none"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/>',
    phone: '<path d="M7.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="M10.5 17.5h3"/>',
    sparkle: '<path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.7L12 18l-1.7-5.6L5 10.7 10.3 9 12 3.5Z"/><path d="M18.5 4v2.5M17.2 5.2h2.6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M3 12h2M19 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>',
    moon: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.6 6.6 0 0 0 9.5 9.5Z"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    sort: '<path d="M8 5v14M8 19l-3-3M8 5l3 3"/><path d="M16 19V5M16 5l3 3M16 19l-3-3"/>',
    up: '<path d="M12 19V5M12 5l-5 5M12 5l5 5"/>',
    down: '<path d="M12 5v14M12 19l-5-5M12 19l5-5"/>',
    filter: '<path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 12.1a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/>',
    eye: '<path d="M2.8 12S6.3 6 12 6s9.2 6 9.2 6-3.5 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    alert: '<path d="M12 4.5 21 19H3l9-14.5Z"/><path d="M12 10v4M12 16.6v.1"/>',
    info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5M12 8v.1"/>',
    inbox: '<path d="M4 13.5 6 5h12l2 8.5V19H4v-5.5Z"/><path d="M4 13.5h4l1.2 2.2h5.6L16 13.5h4"/>',
    download: '<path d="M12 4v10M12 14l-4-4M12 14l4-4"/><path d="M5 18h14"/>',
    undo: '<path d="M4 11a8 8 0 1 1 2.4 5.7"/><path d="M4 5v6h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M4.9 8.2l1.7 1M17.4 14.8l1.7 1M4.9 15.8l1.7-1M17.4 9.2l1.7-1"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1-1"/>',
    send: '<path d="m20 4-8 16-2.2-6.4L4 11l16-7Z"/><path d="M20 4 9.8 13.6"/>',
    reserve: '<path d="M6 4h12v16l-6-3.6L6 20V4Z"/><path d="m9.5 10 1.8 1.8L15 8.5"/>',
  };

  /**
   * أيقونة SVG جاهزة كعنصر DOM
   * @param {string} name  اسم الأيقونة
   * @param {number} size  الحجم بالبكسل
   */
  function icon(name, size = 18, extraClass = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', ('ic ' + extraClass).trim());
    svg.innerHTML = P[name] || P.info;
    return svg;
  }

  ERP.icon = icon;
  ERP.iconNames = Object.keys(P);
})(window);
