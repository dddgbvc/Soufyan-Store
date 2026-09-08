/**
 * Trial24 — الساعة المرجعية (Server-authoritative clock)
 *
 * لماذا لا نستخدم Date.now() في المتصفح؟
 * لأن ساعة الجهاز قابلة للتغيير يدويًا، وتغييرها يجب ألا يُغيّر عدّاد التجربة.
 *
 * الآلية:
 *   1) نقرأ وقت الخادم من /api/time ونقيس زمن الرحلة (RTT).
 *   2) نربط وقت الخادم بـ performance.now() — وهو عدّاد رتيب (monotonic)
 *      لا يتأثر بتعديل ساعة النظام ولا بالمناطق الزمنية.
 *   3) كل الحسابات = endAt - serverNow()، ونُعيد المزامنة دوريًا.
 *
 * النتيجة: تحديث الصفحة، أو فتحها من جهاز آخر، أو تغيير وقت الجهاز
 * لا يُعيد ضبط التجربة — النهاية مخزّنة على الخادم والعدّاد مشتقّ منها.
 */

import { api, lastServerTime } from './api.js';

const SYNC_INTERVAL_MS = 45_000;
const STALE_AFTER_MS = 180_000;
const DRIFT_WARN_MS = 60_000;

const state = {
  offset: 0, // serverEpoch = performance.now() + offset
  synced: false,
  lastSyncAt: 0, // performance.now() وقت آخر مزامنة ناجحة
  rtt: 0,
  deviceDrift: 0, // فرق ساعة الجهاز عن الخادم (للعرض فقط)
  status: 'sync', // sync | ok | stale | offline
};

const listeners = new Set();
const tickers = new Set();

/** وقت الخادم التقديري الآن (ميلي ثانية epoch). */
export function serverNow() {
  return performance.now() + state.offset;
}

export function clockState() {
  return { ...state };
}

function setStatus(next) {
  if (state.status === next) return;
  state.status = next;
  emit();
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(clockState());
    } catch (err) {
      console.error('[clock] مستمع فشل:', err);
    }
  }
}

/** مزامنة واحدة مع تعويض نصف زمن الرحلة. */
export async function sync() {
  const t0 = performance.now();
  try {
    const { now } = await api.time();
    const t1 = performance.now();
    const rtt = t1 - t0;

    // الاستجابة تمثّل لحظة في منتصف الرحلة تقريبًا
    state.offset = now + rtt / 2 - t1;
    state.rtt = Math.round(rtt);
    state.lastSyncAt = t1;
    state.synced = true;
    state.deviceDrift = Date.now() - serverNow();
    setStatus('ok');
    emit();
    return true;
  } catch {
    setStatus(state.synced ? 'stale' : 'offline');
    return false;
  }
}

/** تحديث الإزاحة من أي استجابة API أخرى (مزامنة مجانية بلا نداء إضافي). */
function refreshFromLastResponse() {
  if (!lastServerTime.value) return;
  const age = performance.now() - lastServerTime.at;
  if (age > 5000) return; // قديمة جدًا لتكون مفيدة
  const estimated = lastServerTime.value + age;
  const drift = Math.abs(estimated - serverNow());
  if (state.synced && drift < 1500) return; // ضمن هامش مقبول
  state.offset = lastServerTime.value - lastServerTime.at;
  state.lastSyncAt = performance.now();
  state.synced = true;
  setStatus('ok');
}

/** الاشتراك في تغيّر حالة الساعة (للمؤشر في الواجهة). */
export function onClockChange(fn) {
  listeners.add(fn);
  fn(clockState());
  return () => listeners.delete(fn);
}

/**
 * نبضة موحّدة كل ثانية لكل العدّادات في الصفحة.
 * مؤقّت واحد بدل عشرات المؤقتات — أخف على المتصفح وأدق في التزامن.
 */
export function onTick(fn) {
  tickers.add(fn);
  try {
    fn(serverNow());
  } catch (err) {
    console.error('[clock] عدّاد فشل:', err);
  }
  return () => tickers.delete(fn);
}

export function clearTickers() {
  tickers.clear();
}

let tickTimer = null;
let syncTimer = null;

function tick() {
  const now = serverNow();

  // تقادم المزامنة → مؤشر تحذيري بدل أرقام مضلّلة
  if (state.synced && performance.now() - state.lastSyncAt > STALE_AFTER_MS && state.status === 'ok') {
    setStatus('stale');
  }

  for (const fn of tickers) {
    try {
      fn(now);
    } catch (err) {
      console.error('[clock] عدّاد فشل:', err);
    }
  }
}

/** بدء الساعة: مزامنة أولى ثم نبض كل ثانية وإعادة مزامنة دورية. */
export async function startClock() {
  await sync();
  clearInterval(tickTimer);
  clearInterval(syncTimer);
  tickTimer = setInterval(tick, 1000);
  syncTimer = setInterval(() => {
    refreshFromLastResponse();
    sync();
  }, SYNC_INTERVAL_MS);

  // العودة من الخلفية: المتصفح يُبطئ المؤقتات — نعيد المزامنة فورًا
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync();
  });
  window.addEventListener('online', () => sync());
  window.addEventListener('focus', () => {
    if (performance.now() - state.lastSyncAt > 10_000) sync();
  });

  tick();
}

/** هل ساعة الجهاز بعيدة كثيرًا عن الخادم؟ (تحذير معلوماتي فقط) */
export function deviceClockWarning() {
  if (!state.synced) return null;
  const drift = Date.now() - serverNow();
  if (Math.abs(drift) < DRIFT_WARN_MS) return null;
  const minutes = Math.round(Math.abs(drift) / 60000);
  return `ساعة هذا الجهاز تختلف عن ساعة النظام بنحو ${minutes} دقيقة — العدّاد يعتمد ساعة الخادم.`;
}
