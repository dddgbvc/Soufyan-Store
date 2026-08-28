/**
 * مولّد رسوم الإعداد — Matte Blue Claymorphism
 * ------------------------------------------------------
 * مصدر واحد للحقيقة: زاوية كاميرا واحدة، إضاءة واحدة، خامة واحدة، لوحة زرقاء واحدة.
 * يُنتج ملفات SVG مستقلة داخل assets/setup/ بأسماء ثابتة،
 * وكل طبقة رئيسية تحمل id + data-layer لتكون جاهزة للتحريك لاحقًا.
 *
 * التشغيل:  node tools/build-illustrations.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'setup');

/* ============ 1) اللوحة اللونية ============ */
const C = {
  deep: '#1B2E6B',
  royal: '#2F4FD8',
  blue: '#4A6CF7',
  soft: '#7E9BF6',
  powder: '#C7D8FB',
  mist: '#E4EDFD',
  white: '#F8FBFF',
  ink: '#152449',
  cool: '#8FA3C8',
};

/* ============ 2) التعريفات المشتركة (خامة الطين المطفي) ============ */
const DEFS = `
  <defs>
    <linearGradient id="gClay" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7C9AFB"/><stop offset="1" stop-color="${C.royal}"/>
    </linearGradient>
    <linearGradient id="gClayDeep" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3B58AE"/><stop offset="1" stop-color="${C.deep}"/>
    </linearGradient>
    <linearGradient id="gPowder" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#F2F6FE"/><stop offset="1" stop-color="${C.powder}"/>
    </linearGradient>
    <linearGradient id="gScreen" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#E8F0FF"/><stop offset="1" stop-color="#B7CDFA"/>
    </linearGradient>
    <linearGradient id="gWhite" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9F0FE"/>
    </linearGradient>
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A8C0FF"/><stop offset="1" stop-color="#5B7BF0"/>
    </linearGradient>
    <radialGradient id="gGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8FAEFF" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#8FAEFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gShadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.deep}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="${C.deep}" stop-opacity="0"/>
    </radialGradient>
    <filter id="fSoft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="fTiny" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.5"/>
    </filter>
  </defs>`;

/* ============ 3) عناصر أوّلية ============ */
const hl = (d, o = 0.34) => `<path d="${d}" fill="#FFFFFF" opacity="${o}"/>`;

const shadow = (cx = 240, cy = 306, rx = 128, ry = 26) =>
  `<g id="shadow" data-layer="shadow"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#gShadow)"/></g>`;

const blobs = (variant = 0) => {
  const sets = [
    `<circle cx="86" cy="80" r="46" fill="url(#gGlow)"/><circle cx="404" cy="252" r="58" fill="url(#gGlow)"/>
     <rect x="366" y="52" width="46" height="46" rx="16" fill="${C.powder}" opacity=".55"/>
     <circle cx="70" cy="272" r="17" fill="${C.soft}" opacity=".38"/>`,
    `<circle cx="398" cy="86" r="52" fill="url(#gGlow)"/><circle cx="78" cy="240" r="46" fill="url(#gGlow)"/>
     <rect x="60" y="56" width="40" height="40" rx="14" fill="${C.powder}" opacity=".5"/>
     <circle cx="414" cy="286" r="14" fill="${C.soft}" opacity=".40"/>`,
    `<circle cx="240" cy="150" r="128" fill="url(#gGlow)"/>
     <rect x="52" y="188" width="34" height="34" rx="12" fill="${C.powder}" opacity=".5"/>
     <circle cx="418" cy="112" r="18" fill="${C.soft}" opacity=".34"/>`,
  ];
  return `<g id="abstract-shapes" data-layer="abstract-shapes">${sets[variant % sets.length]}</g>`;
};

/** هاتف بزاوية الكاميرا الموحّدة */
const phone = ({ x = 186, y = 62, w = 108, h = 196, screen = '', tilt = 0 } = {}) => {
  const r = 28;
  const cx = x + w / 2, cy = y + h / 2;
  return `
  <g id="phone" data-layer="phone" transform="rotate(${tilt} ${cx} ${cy})">
    <g id="phone-body" data-layer="phone-body">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#gClay)"/>
      ${hl(`M${x + 12} ${y + h - 16} V${y + 16} a${r - 6} ${r - 6} 0 0 1 ${r - 6} ${-(r - 6)} h${w * 0.38} a6 6 0 0 1 0 12 h${-(w * 0.3)} a10 10 0 0 0 -10 10 V${y + h - 16} a6 6 0 0 1 -12 0 z`, 0.26)}
    </g>
    <g id="phone-screen" data-layer="phone-screen">
      <rect x="${x + 9}" y="${y + 11}" width="${w - 18}" height="${h - 22}" rx="${r - 8}" fill="url(#gScreen)"/>
      ${screen}
    </g>
    <g id="camera" data-layer="camera">
      <rect x="${x + w - 40}" y="${y + 14}" width="24" height="14" rx="7" fill="${C.deep}" opacity=".22"/>
      <circle cx="${x + w - 28}" cy="${y + 21}" r="4.4" fill="${C.deep}" opacity=".5"/>
    </g>
    <g id="buttons" data-layer="buttons">
      <rect x="${x + w - 2}" y="${y + 52}" width="4" height="26" rx="2" fill="${C.deep}" opacity=".35"/>
      <rect x="${x + w - 2}" y="${y + 86}" width="4" height="16" rx="2" fill="${C.deep}" opacity=".28"/>
    </g>
  </g>`;
};

const check = (cx, cy, r = 34, id = 'check') => `
  <g id="${id}" data-layer="check">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gClay)"/>
    ${hl(`M${cx - r} ${cy} a${r} ${r} 0 0 1 ${r} ${-r} a${r} ${r} 0 0 0 ${-r} ${r} z`, 0.3)}
    <path d="M${cx - r * 0.42} ${cy + r * 0.04} l${r * 0.3} ${r * 0.32} l${r * 0.55} ${-r * 0.62}"
      fill="none" stroke="#FFFFFF" stroke-width="${r * 0.17}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const shield = (cx, cy, s = 1) => {
  const w = 78 * s, h = 96 * s;
  const x = cx - w / 2, y = cy - h / 2;
  return `
  <g id="shield" data-layer="shield">
    <path d="M${x} ${y + 14} q${w / 2} ${-20} ${w} 0 v${h * 0.42} q0 ${h * 0.44} ${-w / 2} ${h * 0.58} q${-w / 2} ${-h * 0.14} ${-w / 2} ${-h * 0.58} z" fill="url(#gClay)"/>
    ${hl(`M${x + 9} ${y + 20} q${w / 4} ${-14} ${w / 2} ${-4} v${h * 0.5} q${-w / 4} ${8} ${-w / 2} ${-6} z`, 0.24)}
  </g>`;
};

const envelope = (x, y, w = 168, h = 116) => `
  <g id="envelope" data-layer="envelope">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="url(#gClay)"/>
    <path d="M${x + 10} ${y + 20} L${x + w / 2} ${y + h * 0.58} L${x + w - 10} ${y + 20}"
      fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    ${hl(`M${x + 12} ${y + h - 14} V${y + 26} a12 12 0 0 1 12 -12 h30 a5 5 0 0 1 0 10 h-22 a8 8 0 0 0 -8 8 V${y + h - 14} a5 5 0 0 1 -12 0 z`, 0.22)}
  </g>`;

const otpDots = (cx, cy, n = 6, filled = 4) => {
  let out = '';
  const gap = 30, start = cx - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const on = i < filled;
    out += `<rect x="${start + i * gap - 11}" y="${cy - 15}" width="22" height="30" rx="9"
      fill="${on ? 'url(#gAccent)' : C.white}" stroke="${C.powder}" stroke-width="2"/>`;
    if (on) out += `<circle cx="${start + i * gap}" cy="${cy}" r="4" fill="#FFFFFF" opacity=".9"/>`;
  }
  return `<g id="otp-dots" data-layer="otp-dots">${out}</g>`;
};

const sparkles = (pts = [[110, 96, 9], [378, 128, 7], [136, 250, 6]]) => `
  <g id="sparkles" data-layer="sparkles">
    ${pts.map(([x, y, s]) => `<path d="M${x} ${y - s} q${s * 0.22} ${s * 0.78} ${s} ${s} q${-s * 0.78} ${s * 0.22} ${-s} ${s} q${-s * 0.22} ${-s * 0.78} ${-s} ${-s} q${s * 0.78} ${-s * 0.22} ${s} ${-s} z" fill="${C.soft}" opacity=".75"/>`).join('\n    ')}
  </g>`;

/** بطاقة زجاجية مطفية */
const card = (x, y, w, h, { fill = 'url(#gWhite)', r = 20, rows = 0, accent = false } = {}) => {
  let inner = '';
  for (let i = 0; i < rows; i++) {
    const rw = w - 40 - (i % 2 ? 26 : 0);
    inner += `<rect x="${x + 20}" y="${y + 26 + i * 20}" width="${rw}" height="9" rx="4.5" fill="${i === 0 && accent ? C.soft : C.powder}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>${inner}`;
};

const pill = (x, y, w, h, fill = C.powder, r = null) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r ?? h / 2}" fill="${fill}"/>`;

const tag = (x, y, label = 'imei') =>
  `<g><rect x="${x}" y="${y}" width="96" height="34" rx="12" fill="url(#gClayDeep)"/>
   ${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${x + 12 + i * 10}" y="${y + 10}" width="4" height="14" rx="2" fill="#FFFFFF" opacity="${0.45 + (i % 3) * 0.2}"/>`).join('')}</g>`;

/* ============ 4) تركيب المشاهد ============ */
const S = {};

S.welcome = { title: 'مرحبًا — بدء إعداد النظام', body: `
  ${blobs(2)}
  ${shadow(240, 300, 118, 24)}
  ${phone({ x: 190, y: 60, w: 104, h: 198, screen: `
    <rect x="212" y="92" width="60" height="60" rx="20" fill="url(#gAccent)"/>
    <path d="M232 122 l10 11 l20 -24" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="206" y="172" width="72" height="10" rx="5" fill="${C.soft}" opacity=".8"/>
    <rect x="218" y="192" width="48" height="8" rx="4" fill="${C.cool}" opacity=".55"/>` })}
  ${sparkles([[132, 104, 10], [352, 92, 8], [356, 236, 7]])}` };

S.store = { title: 'ملف المتجر', body: `
  ${blobs(0)}
  ${shadow(240, 300, 132, 24)}
  <g id="store" data-layer="store">
    <path d="M104 132 h272 v128 a16 16 0 0 1 -16 16 H120 a16 16 0 0 1 -16 -16 z" fill="url(#gPowder)"/>
    <path d="M96 132 l22 -44 h244 l22 44 z" fill="url(#gClay)"/>
    ${hl('M112 128 l16 -34 h44 l-16 34 z', 0.28)}
    <rect x="150" y="176" width="86" height="100" rx="14" fill="url(#gWhite)"/>
    <rect x="166" y="196" width="54" height="8" rx="4" fill="${C.powder}"/>
    <rect x="166" y="214" width="38" height="8" rx="4" fill="${C.powder}"/>
    <rect x="262" y="176" width="82" height="60" rx="14" fill="url(#gClayDeep)"/>
    ${otpDots(303, 206, 3, 3)}
  </g>
  ${sparkles([[402, 120, 8], [80, 208, 7]])}` };

S.owner = { title: 'حساب المالك', body: `
  ${blobs(1)}
  ${shadow(240, 300, 108, 22)}
  <g id="owner" data-layer="owner">
    <circle cx="240" cy="132" r="52" fill="url(#gClay)"/>
    ${hl('M188 132 a52 52 0 0 1 52 -52 a52 52 0 0 0 -52 52 z', 0.3)}
    <circle cx="240" cy="118" r="20" fill="#FFFFFF" opacity=".92"/>
    <path d="M212 162 q28 -24 56 0 a52 52 0 0 1 -56 0 z" fill="#FFFFFF" opacity=".92"/>
    ${card(150, 206, 180, 74, { rows: 2, accent: true })}
    <circle cx="316" cy="242" r="16" fill="url(#gAccent)"/>
    <path d="M309 242 l5 5 l10 -11" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>` };

S['email-otp'] = { title: 'توثيق البريد برمز OTP', body: `
  ${blobs(0)}
  ${shadow(240, 302, 122, 24)}
  ${envelope(156, 92, 168, 116)}
  ${otpDots(240, 246, 6, 4)}
  ${check(330, 118, 26)}
  ${sparkles([[118, 118, 9], [372, 232, 7]])}` };

S.security = { title: 'الحماية وكلمة المرور', body: `
  ${blobs(2)}
  ${shadow(240, 300, 100, 22)}
  ${shield(240, 150, 1.5)}
  <g id="lock" data-layer="lock">
    <rect x="216" y="146" width="48" height="40" rx="12" fill="#FFFFFF" opacity=".94"/>
    <path d="M228 146 v-12 a12 12 0 0 1 24 0 v12" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>
    <circle cx="240" cy="164" r="6" fill="${C.royal}"/>
  </g>
  ${otpDots(240, 254, 4, 4)}` };

S.business = { title: 'نشاط متجر الهواتف', body: `
  ${blobs(1)}
  ${shadow(240, 302, 138, 24)}
  ${phone({ x: 118, y: 96, w: 88, h: 162, tilt: -8, screen: `
    <rect x="136" y="130" width="52" height="8" rx="4" fill="${C.powder}"/>
    <rect x="136" y="148" width="34" height="8" rx="4" fill="${C.powder}"/>
    <rect x="136" y="176" width="52" height="30" rx="10" fill="url(#gAccent)"/>` })}
  ${phone({ x: 274, y: 96, w: 88, h: 162, tilt: 8, screen: `
    <rect x="292" y="130" width="52" height="8" rx="4" fill="${C.powder}"/>
    <rect x="292" y="148" width="34" height="8" rx="4" fill="${C.powder}"/>
    <rect x="292" y="176" width="52" height="30" rx="10" fill="url(#gClayDeep)"/>` })}
  <g id="exchange" data-layer="exchange">
    <path d="M212 158 h56 m-14 -12 l14 12 l-14 12" fill="none" stroke="${C.royal}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M268 200 h-56 m14 -12 l-14 12 l14 12" fill="none" stroke="${C.soft}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>` };

S.inventory = { title: 'المخزون و IMEI', body: `
  ${blobs(0)}
  ${shadow(240, 304, 130, 24)}
  <g id="boxes" data-layer="boxes">
    <rect x="122" y="176" width="106" height="100" rx="18" fill="url(#gClay)"/>
    ${hl('M134 268 V196 a10 10 0 0 1 10 -10 h26 a5 5 0 0 1 0 10 h-18 a8 8 0 0 0 -8 8 v64 a5 5 0 0 1 -10 0 z', 0.24)}
    <rect x="252" y="176" width="106" height="100" rx="18" fill="url(#gPowder)"/>
    <rect x="188" y="96" width="106" height="94" rx="18" fill="url(#gClayDeep)"/>
    <rect x="206" y="126" width="70" height="10" rx="5" fill="#FFFFFF" opacity=".55"/>
    <rect x="206" y="146" width="44" height="10" rx="5" fill="#FFFFFF" opacity=".35"/>
  </g>
  ${tag(258, 212)}
  ${sparkles([[96, 128, 8], [396, 148, 7]])}` };

S.products = { title: 'الماركات والموديلات', body: `
  ${blobs(2)}
  ${shadow(240, 302, 126, 24)}
  ${phone({ x: 196, y: 74, w: 96, h: 178, screen: `
    <circle cx="244" cy="128" r="26" fill="url(#gAccent)"/>
    <rect x="214" y="172" width="60" height="9" rx="4.5" fill="${C.powder}"/>
    <rect x="226" y="190" width="36" height="9" rx="4.5" fill="${C.powder}"/>` })}
  <g id="variants" data-layer="variants">
    ${pill(96, 128, 74, 32, 'url(#gPowder)')}
    ${pill(96, 176, 74, 32, 'url(#gPowder)')}
    ${pill(310, 128, 74, 32, 'url(#gPowder)')}
    ${pill(310, 176, 74, 32, 'url(#gPowder)')}
    <circle cx="133" cy="144" r="9" fill="${C.royal}"/>
    <circle cx="133" cy="192" r="9" fill="${C.soft}"/>
    <circle cx="347" cy="144" r="9" fill="${C.deep}"/>
    <circle cx="347" cy="192" r="9" fill="${C.cool}"/>
  </g>` };

S.sales = { title: 'المبيعات والدفع', body: `
  ${blobs(1)}
  ${shadow(240, 302, 120, 24)}
  <g id="receipt" data-layer="receipt">
    <path d="M158 76 h164 v186 l-20 -12 l-20 12 l-20 -12 l-21 12 l-21 -12 l-20 12 l-21 -12 l-21 12 z" fill="url(#gWhite)"/>
    <rect x="182" y="106" width="116" height="10" rx="5" fill="${C.powder}"/>
    <rect x="182" y="130" width="80" height="10" rx="5" fill="${C.powder}"/>
    <rect x="182" y="164" width="116" height="34" rx="12" fill="url(#gAccent)"/>
    <rect x="182" y="212" width="60" height="10" rx="5" fill="${C.powder}"/>
  </g>
  <g id="coin" data-layer="coin">
    <circle cx="336" cy="222" r="36" fill="url(#gClay)"/>
    ${hl('M300 222 a36 36 0 0 1 36 -36 a36 36 0 0 0 -36 36 z', 0.3)}
    <rect x="322" y="204" width="28" height="8" rx="4" fill="#FFFFFF" opacity=".9"/>
    <rect x="322" y="218" width="28" height="8" rx="4" fill="#FFFFFF" opacity=".7"/>
    <rect x="322" y="232" width="18" height="8" rx="4" fill="#FFFFFF" opacity=".5"/>
  </g>` };

S.customers = { title: 'الزبائن والديون', body: `
  ${blobs(0)}
  ${shadow(240, 300, 128, 24)}
  <g id="people" data-layer="people">
    <circle cx="164" cy="132" r="34" fill="url(#gClay)"/>
    <circle cx="164" cy="122" r="13" fill="#FFFFFF" opacity=".92"/>
    <path d="M146 152 q18 -16 36 0 a34 34 0 0 1 -36 0 z" fill="#FFFFFF" opacity=".92"/>
    <circle cx="316" cy="132" r="34" fill="url(#gClayDeep)"/>
    <circle cx="316" cy="122" r="13" fill="#FFFFFF" opacity=".85"/>
    <path d="M298 152 q18 -16 36 0 a34 34 0 0 1 -36 0 z" fill="#FFFFFF" opacity=".85"/>
  </g>
  ${card(140, 190, 200, 88, { rows: 3, accent: true })}
  <g id="balance" data-layer="balance">
    <rect x="256" y="238" width="70" height="26" rx="10" fill="url(#gAccent)"/>
    <rect x="268" y="248" width="46" height="7" rx="3.5" fill="#FFFFFF" opacity=".9"/>
  </g>` };

S.employees = { title: 'فريق العمل', body: `
  ${blobs(1)}
  ${shadow(240, 304, 132, 24)}
  <g id="team" data-layer="team">
    <circle cx="240" cy="112" r="40" fill="url(#gClay)"/>
    <circle cx="240" cy="100" r="15" fill="#FFFFFF" opacity=".92"/>
    <path d="M219 134 q21 -18 42 0 a40 40 0 0 1 -42 0 z" fill="#FFFFFF" opacity=".92"/>
    <circle cx="140" cy="176" r="30" fill="url(#gClayDeep)"/>
    <circle cx="140" cy="167" r="11" fill="#FFFFFF" opacity=".85"/>
    <path d="M125 192 q15 -13 30 0 a30 30 0 0 1 -30 0 z" fill="#FFFFFF" opacity=".85"/>
    <circle cx="340" cy="176" r="30" fill="url(#gAccent)"/>
    <circle cx="340" cy="167" r="11" fill="#FFFFFF" opacity=".9"/>
    <path d="M325 192 q15 -13 30 0 a30 30 0 0 1 -30 0 z" fill="#FFFFFF" opacity=".9"/>
  </g>
  ${card(152, 226, 176, 56, { rows: 2 })}` };

S['employee-otp'] = { title: 'توثيق الموظف', body: `
  ${blobs(2)}
  ${shadow(240, 302, 112, 22)}
  <g id="person" data-layer="person">
    <circle cx="240" cy="112" r="42" fill="url(#gClay)"/>
    <circle cx="240" cy="100" r="16" fill="#FFFFFF" opacity=".92"/>
    <path d="M218 136 q22 -19 44 0 a42 42 0 0 1 -44 0 z" fill="#FFFFFF" opacity=".92"/>
  </g>
  ${envelope(186, 168, 108, 74)}
  ${otpDots(240, 274, 6, 3)}
  ${check(310, 128, 22)}` };

S.permissions = { title: 'الأدوار والصلاحيات', body: `
  ${blobs(0)}
  ${shadow(240, 302, 124, 24)}
  ${shield(240, 128, 1.2)}
  <g id="keyhole" data-layer="keyhole">
    <circle cx="240" cy="120" r="12" fill="#FFFFFF" opacity=".95"/>
    <path d="M234 128 h12 l-3 22 h-6 z" fill="#FFFFFF" opacity=".95"/>
  </g>
  <g id="modules" data-layer="modules">
    ${pill(116, 208, 92, 34, 'url(#gPowder)', 12)}
    ${pill(220, 208, 92, 34, 'url(#gPowder)', 12)}
    ${pill(324, 208, 44, 34, 'url(#gAccent)', 12)}
    ${pill(116, 254, 62, 34, 'url(#gPowder)', 12)}
    ${pill(190, 254, 92, 34, 'url(#gAccent)', 12)}
    ${pill(294, 254, 74, 34, 'url(#gPowder)', 12)}
  </g>` };

S.invoices = { title: 'الفواتير والطباعة', body: `
  ${blobs(1)}
  ${shadow(240, 304, 126, 24)}
  <g id="printer" data-layer="printer">
    <rect x="146" y="168" width="188" height="86" rx="20" fill="url(#gClay)"/>
    ${hl('M158 244 V190 a10 10 0 0 1 10 -10 h28 a5 5 0 0 1 0 10 h-20 a8 8 0 0 0 -8 8 v46 a5 5 0 0 1 -10 0 z', 0.24)}
    <rect x="300" y="188" width="20" height="12" rx="6" fill="#FFFFFF" opacity=".8"/>
  </g>
  <g id="paper" data-layer="paper">
    <rect x="178" y="76" width="124" height="96" rx="14" fill="url(#gWhite)"/>
    <rect x="196" y="98" width="88" height="9" rx="4.5" fill="${C.powder}"/>
    <rect x="196" y="118" width="60" height="9" rx="4.5" fill="${C.powder}"/>
    <rect x="196" y="140" width="88" height="9" rx="4.5" fill="${C.soft}" opacity=".7"/>
    <rect x="178" y="238" width="124" height="66" rx="14" fill="url(#gWhite)"/>
    <rect x="196" y="258" width="88" height="8" rx="4" fill="${C.powder}"/>
    <rect x="196" y="274" width="52" height="8" rx="4" fill="${C.powder}"/>
  </g>` };

S.preferences = { title: 'التفضيلات', body: `
  ${blobs(2)}
  ${shadow(240, 300, 110, 22)}
  <g id="dial" data-layer="dial">
    <circle cx="240" cy="150" r="72" fill="url(#gClay)"/>
    ${hl('M168 150 a72 72 0 0 1 72 -72 a72 72 0 0 0 -72 72 z', 0.28)}
    <circle cx="240" cy="150" r="44" fill="url(#gWhite)"/>
    <rect x="236" y="112" width="8" height="34" rx="4" fill="${C.royal}"/>
  </g>
  <g id="switches" data-layer="switches">
    ${pill(140, 250, 76, 34, 'url(#gAccent)')}
    <circle cx="200" cy="267" r="12" fill="#FFFFFF"/>
    ${pill(264, 250, 76, 34, C.powder)}
    <circle cx="280" cy="267" r="12" fill="#FFFFFF"/>
  </g>` };

S.review = { title: 'مراجعة الإعداد', body: `
  ${blobs(0)}
  ${shadow(240, 304, 122, 24)}
  <g id="checklist" data-layer="checklist">
    <rect x="140" y="66" width="200" height="216" rx="24" fill="url(#gWhite)"/>
    ${[0, 1, 2, 3].map(i => `
    <circle cx="176" cy="${112 + i * 46}" r="15" fill="${i < 3 ? 'url(#gAccent)' : C.powder}"/>
    ${i < 3 ? `<path d="M169 ${112 + i * 46} l5 5 l10 -11" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    <rect x="202" y="${104 + i * 46}" width="${112 - i * 14}" height="10" rx="5" fill="${C.powder}"/>
    <rect x="202" y="${120 + i * 46}" width="${68 - i * 8}" height="8" rx="4" fill="${C.mist}"/>`).join('')}
  </g>
  ${sparkles([[104, 108, 9], [386, 216, 8]])}` };

S.preparing = { title: 'تهيئة النظام', body: `
  ${blobs(2)}
  ${shadow(240, 300, 116, 24)}
  <g id="core" data-layer="core">
    <circle cx="240" cy="152" r="58" fill="url(#gClay)"/>
    ${hl('M182 152 a58 58 0 0 1 58 -58 a58 58 0 0 0 -58 58 z', 0.3)}
    <circle cx="240" cy="152" r="26" fill="#FFFFFF" opacity=".92"/>
  </g>
  <g id="orbit" data-layer="orbit">
    <circle cx="240" cy="152" r="92" fill="none" stroke="${C.powder}" stroke-width="4" stroke-dasharray="14 16"/>
    <circle cx="332" cy="152" r="13" fill="url(#gAccent)"/>
    <circle cx="148" cy="152" r="9" fill="${C.soft}"/>
  </g>
  <g id="progress" data-layer="progress">
    ${pill(150, 264, 180, 18, C.mist)}
    ${pill(150, 264, 118, 18, 'url(#gAccent)')}
  </g>` };

S.complete = { title: 'المتجر جاهز', body: `
  ${blobs(2)}
  ${shadow(240, 304, 122, 24)}
  ${phone({ x: 194, y: 66, w: 98, h: 182, screen: `
    <rect x="212" y="150" width="62" height="9" rx="4.5" fill="${C.powder}"/>
    <rect x="224" y="168" width="38" height="9" rx="4.5" fill="${C.mist}"/>` })}
  ${check(243, 128, 30)}
  ${sparkles([[122, 96, 11], [370, 110, 9], [136, 232, 8], [366, 236, 7]])}` };

/* ============ 5) الإخراج ============ */
const wrap = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360" fill="none" role="img" aria-labelledby="ttl">
  <title id="ttl">${title}</title>
${DEFS}
  <g id="scene" data-layer="scene">
${body.trim()}
  </g>
</svg>
`;

mkdirSync(OUT, { recursive: true });
const names = Object.keys(S);
for (const name of names) {
  writeFileSync(join(OUT, `${name}.svg`), wrap(S[name].title, S[name].body), 'utf8');
}
console.log(`✔ ${names.length} illustrations → assets/setup/`);
console.log(names.join(', '));
