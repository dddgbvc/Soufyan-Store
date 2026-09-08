/**
 * Trial24 — التحليلات
 * كل الأرقام تُحسب من السجلات الفعلية للتجارب والمبيعات، لا من قيم مخزّنة مسبقًا.
 */

import { HOUR_MS, MINUTE_MS, dayKey, pct, serverNow } from '../util.js';
import { CLOSED_STATUSES, OPEN_STATUSES, TRIAL_STATUS } from './trials.js';

/**
 * @param {object} db
 * @param {object} options
 * @param {number|null} options.days  نافذة زمنية بالأيام (null = كل الفترات)
 */
export function analytics(db, { days = null } = {}, now = serverNow()) {
  const settings = db.settings;
  const since = days ? now - days * 24 * HOUR_MS : 0;

  const trials = db.data.trials.filter((t) => t.startAt >= since);
  const sales = db.data.sales.filter((s) => s.soldAt >= since);

  const purchased = trials.filter((t) => t.status === TRIAL_STATUS.PURCHASED);
  const returned = trials.filter((t) => t.status === TRIAL_STATUS.RETURNED);
  const cancelled = trials.filter((t) => t.status === TRIAL_STATUS.CANCELLED);
  const open = trials.filter((t) => OPEN_STATUSES.includes(t.status));
  const closed = trials.filter((t) => CLOSED_STATUSES.includes(t.status));
  const decided = purchased.length + returned.length; // القرارات الفعلية (شراء أو إرجاع)
  const extended = trials.filter((t) => t.extensions.length > 0);

  // متوسط مدة التجربة الفعلية (من التسليم حتى الإغلاق) للتجارب المغلقة
  const durations = closed
    .map((t) => t.actualDurationMs)
    .filter((ms) => typeof ms === 'number' && ms > 0);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // متوسط زمن اتخاذ القرار للتجارب المحوّلة إلى بيع
  const purchaseDurations = purchased
    .map((t) => t.actualDurationMs)
    .filter((ms) => typeof ms === 'number' && ms > 0);
  const avgTimeToPurchaseMs = purchaseDurations.length
    ? Math.round(purchaseDurations.reduce((a, b) => a + b, 0) / purchaseDurations.length)
    : 0;

  // — تجميع حسب الجهاز —
  const deviceMap = new Map();
  for (const t of trials) {
    const device = db.find('devices', t.deviceId);
    const key = t.deviceId;
    if (!deviceMap.has(key)) {
      deviceMap.set(key, {
        deviceId: key,
        name: device ? `${device.brand} ${device.model}` : t.deviceId,
        brand: device?.brand || '—',
        imei: device?.imei || t.imei,
        price: device?.price || 0,
        status: device?.status || null,
        trials: 0,
        purchased: 0,
        returned: 0,
        cancelled: 0,
        open: 0,
        extensions: 0,
      });
    }
    const row = deviceMap.get(key);
    row.trials += 1;
    row.extensions += t.extensions.length;
    if (t.status === TRIAL_STATUS.PURCHASED) row.purchased += 1;
    else if (t.status === TRIAL_STATUS.RETURNED) row.returned += 1;
    else if (t.status === TRIAL_STATUS.CANCELLED) row.cancelled += 1;
    else row.open += 1;
  }
  const deviceRows = [...deviceMap.values()].map((row) => ({
    ...row,
    decided: row.purchased + row.returned,
    conversionRate: pct(row.purchased, row.purchased + row.returned),
  }));

  const mostTrialed = deviceRows
    .slice()
    .sort((a, b) => b.trials - a.trials || b.purchased - a.purchased)
    .slice(0, 8);

  const minSample = settings.analyticsMinSample ?? 2;
  const highestConversion = deviceRows
    .filter((d) => d.decided >= minSample)
    .sort((a, b) => b.conversionRate - a.conversionRate || b.purchased - a.purchased)
    .slice(0, 8);

  // — تجميع حسب الموظف —
  const employeeMap = new Map();
  for (const t of trials) {
    const user = db.find('users', t.employeeId);
    const key = t.employeeId;
    if (!employeeMap.has(key)) {
      employeeMap.set(key, { employeeId: key, name: user?.name || key, trials: 0, purchased: 0, returned: 0 });
    }
    const row = employeeMap.get(key);
    row.trials += 1;
    if (t.status === TRIAL_STATUS.PURCHASED) row.purchased += 1;
    if (t.status === TRIAL_STATUS.RETURNED) row.returned += 1;
  }
  const employees = [...employeeMap.values()]
    .map((row) => ({ ...row, conversionRate: pct(row.purchased, row.purchased + row.returned) }))
    .sort((a, b) => b.trials - a.trials);

  // — سلسلة زمنية يومية (آخر 14 يومًا أو نافذة الفترة) —
  const seriesDays = Math.min(days || 14, 30);
  const series = [];
  for (let i = seriesDays - 1; i >= 0; i -= 1) {
    const dayStart = now - i * 24 * HOUR_MS;
    const key = dayKey(dayStart, settings.timezone);
    series.push({
      day: key,
      started: db.data.trials.filter((t) => dayKey(t.startAt, settings.timezone) === key).length,
      purchased: db.data.trials.filter(
        (t) => t.status === TRIAL_STATUS.PURCHASED && t.closedAt && dayKey(t.closedAt, settings.timezone) === key
      ).length,
      returned: db.data.trials.filter(
        (t) => t.status === TRIAL_STATUS.RETURNED && t.closedAt && dayKey(t.closedAt, settings.timezone) === key
      ).length,
    });
  }

  const revenue = sales.reduce((sum, s) => sum + (s.netPrice || 0), 0);

  return {
    period: { days, since: since || null, until: now },
    totals: {
      totalTrials: trials.length,
      openTrials: open.length,
      closedTrials: closed.length,
      purchased: purchased.length,
      returned: returned.length,
      cancelled: cancelled.length,
      decided,
      extendedTrials: extended.length,
      totalExtensions: trials.reduce((sum, t) => sum + t.extensions.length, 0),
      salesCount: sales.length,
      revenue,
    },
    rates: {
      purchaseConversion: pct(purchased.length, decided),
      returnRate: pct(returned.length, decided),
      extensionRate: pct(extended.length, trials.length),
      cancellationRate: pct(cancelled.length, trials.length),
      lateReturnRate: pct(
        closed.filter((t) => t.closedAt && t.closedAt > t.endAt).length,
        closed.length
      ),
    },
    durations: {
      avgDurationMs,
      avgDurationHours: Math.round((avgDurationMs / HOUR_MS) * 10) / 10,
      avgTimeToPurchaseMs,
      avgTimeToPurchaseHours: Math.round((avgTimeToPurchaseMs / HOUR_MS) * 10) / 10,
      shortestMs: durations.length ? Math.min(...durations) : 0,
      longestMs: durations.length ? Math.max(...durations) : 0,
    },
    mostTrialed,
    highestConversion,
    highestConversionMinSample: minSample,
    employees,
    series,
    serverTime: now,
  };
}
