/**
 * نقطة الإقلاع لشاشة الزبون.
 *
 * ترتيب المسؤوليات:
 *   config    ⟶ الإعدادات وتجاوزات الرابط
 *   theme     ⟶ مزامنة السمة مع البرنامج الرئيسي
 *   store     ⟶ حالة الجلسة (مصدر الحقيقة الوحيد للواجهة)
 *   transport ⟶ استقبال الجلسة من الكاشير لحظيًا
 *   ui        ⟶ مكوّنات العرض، لا تعرف شيئًا عن مصدر البيانات
 */

import { CONFIG, applyUrlOverrides, readDemoMode } from './config.js';
import { configureFormatting } from './core/format.js';
import { createStore } from './core/store.js';
import { el, setData } from './core/dom.js';
import { createThemeSync } from './theme/theme.js';
import { createTransport } from './realtime/transport.js';
import { createHeader } from './ui/header.js';
import { createCartList } from './ui/cart-list.js';
import { createSummary } from './ui/summary.js';
import { createStage } from './ui/stage.js';
import { createDemoDock } from './demo/demo-dock.js';
import { createEmptySession } from './data/session-schema.js';

const config = applyUrlOverrides(CONFIG);
configureFormatting(config.currency);

const params = new URLSearchParams(globalThis.location.search);
const demoMode = readDemoMode();

// ---------------------------------------------------------------------------
// السمة — تُطبَّق قبل أي رسم لتفادي وميض المظهر الخاطئ
// ---------------------------------------------------------------------------
const theme = createThemeSync(config.theme).init({ override: params.get('theme') });

// ---------------------------------------------------------------------------
// الحالة
// ---------------------------------------------------------------------------
const store = createStore(createEmptySession({ status: 'loading' }));
let hasReceivedSession = false;

// ---------------------------------------------------------------------------
// الواجهة
// ---------------------------------------------------------------------------
const header = createHeader(store, { config });
const cart = createCartList(store, { config });
const summary = createSummary(store, { config });
const stage = createStage(store, { config });

const workspace = el('div', { class: 'workspace' }, [cart.root, summary.root]);
const stagewrap = el('div', { class: 'stagewrap' }, [workspace, stage.root]);
const app = el('div', { class: 'app' }, [header.root, stagewrap]);

document.body.append(app);

// مساحة العمل تختفي خلف أي حالة غير «الزبون يتصفّح مشترياته»
store.subscribe((session) => {
  setData(workspace, 'hidden', session.status !== 'browsing');
  workspace.setAttribute('aria-hidden', session.status !== 'browsing' ? 'true' : 'false');
});

// ---------------------------------------------------------------------------
// عودة تلقائية إلى شاشة الانتظار بعد نهاية العملية
// ---------------------------------------------------------------------------
let resetTimer = 0;
store.subscribe((session, previous) => {
  if (session.status === previous?.status) return;
  globalThis.clearTimeout(resetTimer);

  const delay =
    session.status === 'paid'
      ? config.behavior.resetAfterPaidMs
      : session.status === 'cancelled'
        ? config.behavior.resetAfterCancelledMs
        : 0;

  if (delay > 0) {
    resetTimer = globalThis.setTimeout(() => {
      // نعود للانتظار فقط إن لم يصل تحديث جديد في الأثناء
      if (store.get().status === session.status) store.reset();
    }, delay);
  }
});

// ---------------------------------------------------------------------------
// النقل اللحظي
// ---------------------------------------------------------------------------
const transport = createTransport(config.transport, {
  onSession(session) {
    hasReceivedSession = true;
    globalThis.clearTimeout(handshakeTimer);
    store.replace(session);
  },
  onPatch(patch) {
    hasReceivedSession = true;
    globalThis.clearTimeout(handshakeTimer);
    store.patch(patch);
  },
  onConnection(status, detail) {
    setData(document.documentElement, 'connection', status);

    if (status === 'offline' && !hasReceivedSession) {
      // لا ناقل متاح — نعرض شاشة الانتظار بدل رسالة خطأ تقنية أمام الزبون
      store.reset();
      showDemoHint();
    }

    if (status === 'error' && !hasReceivedSession) {
      console.warn('[transport] خطأ في الاتصال:', detail);
    }
  },
});

/** يُلغى فور وصول أول جلسة من الكاشير. */
let handshakeTimer = 0;

// ---------------------------------------------------------------------------
// الوضع التجريبي
// ---------------------------------------------------------------------------
const demo = createDemoDock({ store, transport, theme, config, autoplay: demoMode.auto });
document.body.append(demo.root);
if (demoMode.open) demo.open();

const hint = el('div', { class: 'demo-hint' }, [
  el('span', { text: 'للتجربة بدون نظام كاشير اضغط' }),
  el('kbd', { text: 'D' }),
]);
document.body.append(hint);

let hintTimer = 0;
function showDemoHint() {
  if (!config.behavior.showDemoHint || demo.isOpen || hasReceivedSession) return;
  setData(hint, 'visible', true);
  globalThis.clearTimeout(hintTimer);
  hintTimer = globalThis.setTimeout(() => setData(hint, 'visible', false), 9000);
}

// أول تفاعل من الموظّف يُخفي التلميح
globalThis.addEventListener('keydown', () => setData(hint, 'visible', false), { once: true });

// ولا يظهر إطلاقًا ما دامت هناك عملية جارية أمام الزبون
store.subscribe((session) => {
  if (session.status !== 'idle') setData(hint, 'visible', false);
});

// ---------------------------------------------------------------------------
// بدء الاتصال — بعد اكتمال بناء الواجهة كي تكون كل المعالجات جاهزة
// ---------------------------------------------------------------------------
// نرسل `hello` وننتظر لقطة من الكاشير. إن لم تصل، فالأرجح أن الكاشير ببساطة
// غير مفتوح ⟶ نعرض شاشة الانتظار العادية بدل رسالة خطأ أمام الزبون.
handshakeTimer = globalThis.setTimeout(() => {
  if (!hasReceivedSession) {
    store.reset();
    showDemoHint();
  }
}, 1400);

transport.start();

// ---------------------------------------------------------------------------
// عنوان النافذة — مفيد حين تُفتح الشاشة كنافذة ثانية على جهاز الكاشير
// ---------------------------------------------------------------------------
document.title = `شاشة الزبون · ${config.store.name}`;

// للتشخيص من وحدة التحكّم أثناء التطوير فقط
globalThis.YaqootDisplay = { store, theme, transport, config, demo };
