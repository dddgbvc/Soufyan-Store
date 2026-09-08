/**
 * Trial24 — منطق الأعمال الأساسي لتجربة جهاز 24 ساعة
 *
 * القواعد كلها تُطبَّق هنا على الخادم:
 *  • وقت البدء والانتهاء يُحسب من ساعة الخادم فقط (Date.now على الخادم).
 *  • قفل الجهاز طوال التجربة.
 *  • التحقق من IMEI/Serial مقابل بيانات النظام (بلا أي تصوير).
 *  • حدود التمديد وموافقة المدير حسب الإعدادات.
 *  • تسجيل تدقيق وإشعار لكل انتقال حالة.
 *
 * آلة الحالات:
 *   active ──(انتهت المدة)──> expired
 *   active|expired ──> returned | purchased | cancelled   (نهائية)
 *   expired ──(تمديد)──> active
 */

import {
  HOUR_MS,
  MINUTE_MS,
  badRequest,
  conflict,
  forbidden,
  notFound,
  serverNow,
  nextSequence,
  cleanText,
  dayKey,
  toPositiveNumber,
  pct,
} from '../util.js';
import { PERMISSIONS, assertCan, can } from './permissions.js';
import { AUDIT_ACTIONS, logAudit } from './audit.js';
import { EVENTS, SEVERITY, notifyAll } from './notifications.js';
import {
  DEVICE_STATUS,
  assertDeviceAvailable,
  assertSerialMatches,
  conditionSnapshot,
  getDevice,
  setDeviceStatus,
} from './devices.js';

export const TRIAL_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  RETURNED: 'returned',
  PURCHASED: 'purchased',
  CANCELLED: 'cancelled',
};

export const TRIAL_STATUS_LABELS = {
  active: 'جارية',
  expired: 'انتهى الوقت',
  returned: 'مُرجَع',
  purchased: 'تم الشراء',
  cancelled: 'ملغاة',
};

export const OPEN_STATUSES = [TRIAL_STATUS.ACTIVE, TRIAL_STATUS.EXPIRED];
export const CLOSED_STATUSES = [TRIAL_STATUS.RETURNED, TRIAL_STATUS.PURCHASED, TRIAL_STATUS.CANCELLED];

export const URGENCY = {
  NORMAL: 'normal',
  ENDING_SOON: 'ending_soon',
  CRITICAL: 'critical',
  EXPIRED: 'expired',
  CLOSED: 'closed',
};

// ————————————————————————————————————————————————
// قراءة وتزيين
// ————————————————————————————————————————————————

export function getTrial(db, trialId) {
  const trial = db.find('trials', trialId);
  if (!trial) throw notFound('TRIAL_NOT_FOUND', 'التجربة غير موجودة.');
  return trial;
}

/** درجة الإلحاح مشتقّة من وقت الخادم — لا تُخزَّن حتى لا تتقادم. */
export function urgencyOf(trial, now, settings) {
  if (CLOSED_STATUSES.includes(trial.status)) return URGENCY.CLOSED;
  const remaining = trial.endAt - now;
  if (remaining <= 0) return URGENCY.EXPIRED;
  if (remaining <= settings.criticalMinutes * MINUTE_MS) return URGENCY.CRITICAL;
  if (remaining <= settings.endingSoonMinutes * MINUTE_MS) return URGENCY.ENDING_SOON;
  return URGENCY.NORMAL;
}

/** تجربة مُزيّنة بالبيانات المرتبطة + الوقت المتبقي المحسوب من الخادم. */
export function decorate(db, trial, now = serverNow()) {
  const settings = db.settings;
  const customer = db.find('customers', trial.customerId);
  const device = db.find('devices', trial.deviceId);
  const employee = db.find('users', trial.employeeId);
  const totalMs = trial.endAt - trial.startAt;
  const elapsed = Math.min(Math.max(now - trial.startAt, 0), totalMs);

  return {
    ...trial,
    statusLabel: TRIAL_STATUS_LABELS[trial.status],
    customerName: customer?.name || '—',
    customerPhone: customer?.phone || '',
    deviceName: device ? `${device.brand} ${device.model}` : '—',
    deviceStatus: device?.status || null,
    devicePrice: device?.price || 0,
    employeeName: employee?.name || '—',
    remainingMs: trial.endAt - now,
    elapsedMs: now - trial.startAt,
    totalDurationMs: totalMs,
    progress: totalMs > 0 ? Math.round((elapsed / totalMs) * 1000) / 1000 : 1,
    urgency: urgencyOf(trial, now, settings),
    isOpen: OPEN_STATUSES.includes(trial.status),
    extensionsUsed: trial.extensions.length,
    extensionsLeft: Math.max(0, settings.maxExtensions - trial.extensions.length),
    pendingExtensionRequest:
      db.data.extensionRequests.find((r) => r.trialId === trial.id && r.status === 'pending') || null,
  };
}

export function listTrials(db, { status, q, deviceId, customerId, limit = 200 } = {}, now = serverNow()) {
  let rows = db.data.trials.slice();

  if (status && status !== 'all') {
    if (status === 'open') rows = rows.filter((t) => OPEN_STATUSES.includes(t.status));
    else if (status === 'closed') rows = rows.filter((t) => CLOSED_STATUSES.includes(t.status));
    else rows = rows.filter((t) => t.status === status);
  }
  if (deviceId) rows = rows.filter((t) => t.deviceId === deviceId);
  if (customerId) rows = rows.filter((t) => t.customerId === customerId);

  let decorated = rows.map((t) => decorate(db, t, now));

  if (q) {
    const needle = String(q).trim().toLowerCase();
    decorated = decorated.filter((t) =>
      [t.code, t.customerName, t.deviceName, t.imei, t.employeeName, t.customerPhone]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }

  // المفتوحة أولًا ومرتّبة بالأقرب انتهاءً، ثم المغلقة بالأحدث.
  decorated.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    if (a.isOpen) return a.endAt - b.endAt || a.id.localeCompare(b.id);
    return (b.closedAt || b.startAt) - (a.closedAt || a.startAt) || b.id.localeCompare(a.id);
  });

  return decorated.slice(0, limit);
}

// ————————————————————————————————————————————————
// المساعدات الداخلية
// ————————————————————————————————————————————————

function trialAuditBase(db, trial) {
  const device = db.find('devices', trial.deviceId);
  const customer = db.find('customers', trial.customerId);
  return {
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: trial.deviceId,
    deviceName: device ? `${device.brand} ${device.model}` : null,
    deviceImei: trial.imei,
    customerId: trial.customerId,
    customerName: customer?.name || null,
  };
}

function assertOpen(trial) {
  if (!OPEN_STATUSES.includes(trial.status)) {
    throw conflict(
      'TRIAL_CLOSED',
      `التجربة مُغلقة مسبقًا (${TRIAL_STATUS_LABELS[trial.status]}) ولا يمكن تعديلها.`,
      { status: trial.status }
    );
  }
}

/** تجاوز سياسة: يتطلب صلاحية override + سببًا مكتوبًا، ويُسجَّل دائمًا. */
function assertOverrideAllowed(actor, override, reason) {
  if (!override) return false;
  if (!can(actor, PERMISSIONS.TRIAL_OVERRIDE)) {
    throw forbidden('OVERRIDE_DENIED', 'تجاوز السياسة متاح للمدير فقط.');
  }
  if (!cleanText(reason)) {
    throw badRequest('OVERRIDE_REASON_REQUIRED', 'يجب كتابة سبب تجاوز السياسة.');
  }
  return true;
}

function fmtDuration(ms) {
  const totalMinutes = Math.round(ms / MINUTE_MS);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h} ساعة و${m} دقيقة`;
  if (h) return `${h} ساعة`;
  return `${m} دقيقة`;
}

function fmtTime(ms, timeZone) {
  try {
    return new Intl.DateTimeFormat('ar-IQ', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
      numberingSystem: 'latn',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  }
}

const money = (n, currency = 'IQD') => `${Number(n || 0).toLocaleString('en-US')} ${currency}`;

// ————————————————————————————————————————————————
// 1) إنشاء تجربة
// ————————————————————————————————————————————————

/**
 * Flow: Customer → Device → IMEI/Serial → Deposit → Terms → Confirm
 * كل خطوة يُعاد التحقق منها هنا مهما فعلت الواجهة.
 */
export function createTrial(db, actor, payload = {}) {
  assertCan(actor, PERMISSIONS.TRIAL_CREATE);
  const settings = db.settings;
  const now = serverNow(); // ← وقت الخادم، وليس وقت المتصفح

  // — العميل —
  const customer = db.find('customers', payload.customerId);
  if (!customer) throw notFound('CUSTOMER_NOT_FOUND', 'العميل غير موجود.');
  if (customer.blocked) {
    throw conflict('CUSTOMER_BLOCKED', 'العميل موقوف عن خدمة التجربة.', {
      reason: customer.blockReason || null,
    });
  }

  const override = assertOverrideAllowed(actor, payload.override, payload.overrideReason);

  const openForCustomer = db.data.trials.find(
    (t) => t.customerId === customer.id && OPEN_STATUSES.includes(t.status)
  );
  if (openForCustomer && !override) {
    throw conflict('CUSTOMER_HAS_OPEN_TRIAL', 'لدى العميل تجربة مفتوحة بالفعل.', {
      trialId: openForCustomer.id,
      trialCode: openForCustomer.code,
    });
  }

  // — الجهاز + القفل —
  const device = getDevice(db, payload.deviceId);
  assertDeviceAvailable(db, device);

  // — IMEI / Serial: التحقق من بيانات النظام بدل إثبات التصوير —
  const providedSerial = cleanText(payload.imei, { max: 40 });
  if (!providedSerial) throw badRequest('IMEI_REQUIRED', 'أدخل رقم IMEI أو الرقم التسلسلي للجهاز.');
  const matchedField = assertSerialMatches(device, providedSerial);

  // — العربون —
  let deposit = 0;
  if (settings.depositRequired && !override) {
    deposit = toPositiveNumber(payload.deposit, 'العربون');
    if (deposit < settings.minDepositIQD) {
      throw badRequest(
        'DEPOSIT_TOO_LOW',
        `الحد الأدنى للعربون ${money(settings.minDepositIQD, settings.currency)}.`,
        { minimum: settings.minDepositIQD }
      );
    }
  } else {
    deposit = Number(payload.deposit) || 0;
    if (deposit < 0) throw badRequest('INVALID_DEPOSIT', 'قيمة العربون غير صالحة.');
  }

  // — الشروط —
  if (!payload.termsAccepted) {
    throw badRequest('TERMS_NOT_ACCEPTED', 'يجب إقرار العميل بشروط التجربة قبل التأكيد.');
  }

  // — المدة —
  const durationHours = payload.durationHours
    ? toPositiveNumber(payload.durationHours, 'مدة التجربة')
    : settings.defaultDurationHours;
  if (durationHours > settings.maxTotalDurationHours && !override) {
    throw badRequest(
      'DURATION_TOO_LONG',
      `أقصى مدة مسموح بها ${settings.maxTotalDurationHours} ساعة.`,
      { maximum: settings.maxTotalDurationHours }
    );
  }

  const startAt = now;
  const endAt = startAt + durationHours * HOUR_MS;

  const trial = {
    id: nextSequence(db, 'trial', 'TRL'),
    code: null, // يُملأ بعد قليل
    customerId: customer.id,
    deviceId: device.id,
    employeeId: actor.id,
    imei: device.imei,
    serial: device.serial,
    verifiedField: matchedField,
    deposit,
    depositMethod: cleanText(payload.depositMethod, { max: 40 }) || 'cash',
    depositRefunded: null,
    depositDeduction: 0,
    idDocument: {
      type: cleanText(payload.idDocumentType, { max: 40 }) || null,
      number: cleanText(payload.idDocumentNumber, { max: 40 }) || null,
    },
    baseDurationHours: durationHours,
    startAt,
    endAt,
    status: TRIAL_STATUS.ACTIVE,
    terms: {
      accepted: true,
      version: settings.termsVersion,
      acceptedAt: now,
      acceptedBy: customer.id,
      text: settings.termsText,
    },
    deviceSnapshot: conditionSnapshot(device),
    returnCheck: null,
    extensions: [],
    reminderSentAt: null,
    expiredAt: null,
    expiredNotifiedAt: null,
    closedAt: null,
    closedBy: null,
    actualDurationMs: null,
    saleId: null,
    cancelReason: null,
    notes: cleanText(payload.notes, { max: 500 }),
    createdAt: now,
    updatedAt: now,
    createdBy: actor.id,
    overrides: override
      ? [{ at: now, by: actor.id, byName: actor.name, reason: cleanText(payload.overrideReason) }]
      : [],
  };
  trial.code = trial.id;
  db.insert('trials', trial);

  // — قفل الجهاز: Available → Trial —
  const deviceChange = setDeviceStatus(device, DEVICE_STATUS.ON_TRIAL, { trialId: trial.id });
  device.trialCount = (device.trialCount || 0) + 1;
  device.lastTrialAt = now;

  const base = trialAuditBase(db, trial);

  logAudit(db, {
    action: AUDIT_ACTIONS.CREATE,
    actor,
    ...base,
    oldStatus: null,
    newStatus: trial.status,
    meta: {
      durationHours,
      deposit,
      startAt,
      endAt,
      termsVersion: settings.termsVersion,
      verifiedField: matchedField,
    },
  });

  logAudit(db, {
    action: AUDIT_ACTIONS.RELEASE,
    actor,
    ...base,
    entity: 'device',
    oldStatus: deviceChange.oldStatus,
    newStatus: deviceChange.newStatus,
    deviceOldStatus: deviceChange.oldStatus,
    deviceNewStatus: deviceChange.newStatus,
    meta: { snapshot: trial.deviceSnapshot },
  });

  if (override) {
    logAudit(db, {
      action: AUDIT_ACTIONS.OVERRIDE,
      actor,
      ...base,
      reason: cleanText(payload.overrideReason),
      meta: { scope: 'create' },
    });
  }

  // — إشعار المدير: "تم إخراج جهاز للتجربة" —
  const tz = settings.timezone;
  notifyAll(db, {
    event: EVENTS.TRIAL_STARTED,
    severity: SEVERITY.INFO,
    toManagers: true,
    title: 'تم إخراج جهاز للتجربة',
    body: [
      `العميل: ${customer.name} (${customer.phone})`,
      `الجهاز: ${device.brand} ${device.model}`,
      `IMEI: ${device.imei}`,
      `الموظف: ${actor.name}`,
      `البداية: ${fmtTime(startAt, tz)}`,
      `النهاية: ${fmtTime(endAt, tz)}`,
      `المدة: ${durationHours} ساعة`,
      `العربون: ${money(deposit, settings.currency)}`,
    ].join('\n'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: device.id,
    customer,
    customerMessage:
      `مرحبًا ${customer.name} 👋\n` +
      `بدأت تجربتك لجهاز ${device.brand} ${device.model} من ${settings.storeName}.\n` +
      `تنتهي التجربة: ${fmtTime(endAt, tz)} (بعد ${durationHours} ساعة).\n` +
      `رقم التجربة: ${trial.code}`,
    data: {
      customer: customer.name,
      device: `${device.brand} ${device.model}`,
      imei: device.imei,
      employee: actor.name,
      startAt,
      endAt,
      durationHours,
      deposit,
    },
  });

  return decorate(db, trial, now);
}

// ————————————————————————————————————————————————
// 2) الإرجاع
// ————————————————————————————————————————————————

export function returnTrial(db, actor, trialId, payload = {}) {
  assertCan(actor, PERMISSIONS.TRIAL_RETURN);
  const now = serverNow();
  const trial = getTrial(db, trialId);
  assertOpen(trial);

  const device = getDevice(db, trial.deviceId);
  const override = assertOverrideAllowed(actor, payload.override, payload.overrideReason);

  // التحقق من هوية الجهاز العائد عبر بياناته لا عبر صورة له
  const providedSerial = cleanText(payload.imei, { max: 40 });
  if (!providedSerial && !override) {
    throw badRequest('IMEI_REQUIRED', 'أدخل IMEI/Serial الجهاز العائد للتحقق.');
  }
  if (providedSerial) assertSerialMatches(device, providedSerial);

  const checks = {
    powersOn: payload.powersOn !== false,
    imeiVerified: Boolean(providedSerial) || override,
    accessoriesComplete: payload.accessoriesComplete !== false,
    noNewDamage: payload.noNewDamage !== false,
    functionalOk: payload.functionalOk !== false,
  };
  const conditionIssue = Object.values(checks).some((v) => v === false);
  if (conditionIssue && !cleanText(payload.issueNotes)) {
    throw badRequest(
      'ISSUE_NOTES_REQUIRED',
      'هناك ملاحظة على حالة الجهاز — اكتب وصفًا للفرق عن حالة التسليم المسجّلة.'
    );
  }

  const deduction = Math.max(0, Number(payload.depositDeduction) || 0);
  if (deduction > trial.deposit) {
    throw badRequest('DEDUCTION_TOO_HIGH', 'الاستقطاع أكبر من قيمة العربون.');
  }

  const oldStatus = trial.status;
  trial.status = TRIAL_STATUS.RETURNED;
  trial.closedAt = now;
  trial.closedBy = actor.id;
  trial.actualDurationMs = now - trial.startAt;
  trial.depositDeduction = deduction;
  trial.depositRefunded = trial.deposit - deduction;
  trial.returnCheck = {
    at: now,
    by: actor.id,
    byName: actor.name,
    checks,
    conditionIssue,
    issueNotes: cleanText(payload.issueNotes, { max: 500 }),
    comparedWithSnapshotAt: trial.deviceSnapshot?.takenAt || null,
    lateBy: Math.max(0, now - trial.endAt),
  };
  trial.updatedAt = now;

  // الجهاز يعود للمخزون
  const deviceChange = setDeviceStatus(
    device,
    conditionIssue && payload.sendToMaintenance ? DEVICE_STATUS.MAINTENANCE : DEVICE_STATUS.AVAILABLE
  );
  if (cleanText(payload.issueNotes)) {
    device.conditionNotes = cleanText(payload.issueNotes, { max: 500 });
  }

  const base = trialAuditBase(db, trial);
  logAudit(db, {
    action: AUDIT_ACTIONS.RETURN,
    actor,
    ...base,
    oldStatus,
    newStatus: trial.status,
    deviceOldStatus: deviceChange.oldStatus,
    deviceNewStatus: deviceChange.newStatus,
    meta: {
      checks,
      conditionIssue,
      lateBy: trial.returnCheck.lateBy,
      depositRefunded: trial.depositRefunded,
      depositDeduction: deduction,
    },
  });
  if (override) {
    logAudit(db, {
      action: AUDIT_ACTIONS.OVERRIDE,
      actor,
      ...base,
      reason: cleanText(payload.overrideReason),
      meta: { scope: 'return' },
    });
  }

  const customer = db.find('customers', trial.customerId);
  const settings = db.settings;
  notifyAll(db, {
    event: EVENTS.TRIAL_RETURNED,
    severity: conditionIssue ? SEVERITY.WARNING : SEVERITY.SUCCESS,
    toManagers: true,
    toStaff: true,
    title: 'تم إرجاع جهاز التجربة',
    body: [
      `التجربة: ${trial.code}`,
      `العميل: ${customer?.name || '—'}`,
      `الجهاز: ${device.brand} ${device.model} — IMEI ${device.imei}`,
      `استلمه: ${actor.name}`,
      `مدة التجربة الفعلية: ${fmtDuration(trial.actualDurationMs)}`,
      conditionIssue ? `⚠️ ملاحظة على الحالة: ${trial.returnCheck.issueNotes}` : 'الحالة مطابقة لبيانات التسليم.',
      `العربون المُعاد: ${money(trial.depositRefunded, settings.currency)}`,
    ].join('\n'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: device.id,
    customer,
    customerMessage:
      `شكرًا ${customer?.name || ''} على تجربة ${device.brand} ${device.model}.\n` +
      `تم استلام الجهاز وإغلاق التجربة ${trial.code}` +
      (trial.depositRefunded ? ` وإعادة العربون ${money(trial.depositRefunded, settings.currency)}.` : '.'),
    data: { conditionIssue, actualDurationMs: trial.actualDurationMs },
  });

  return decorate(db, trial, now);
}

// ————————————————————————————————————————————————
// 3) الشراء — تحويل التجربة إلى بيع مع الاحتفاظ بالرابط
// ————————————————————————————————————————————————

export function purchaseTrial(db, actor, trialId, payload = {}) {
  assertCan(actor, PERMISSIONS.TRIAL_COMPLETE);
  const now = serverNow();
  const settings = db.settings;
  const trial = getTrial(db, trialId);
  assertOpen(trial);

  const device = getDevice(db, trial.deviceId);
  const customer = db.find('customers', trial.customerId);
  const override = assertOverrideAllowed(actor, payload.override, payload.overrideReason);

  const providedSerial = cleanText(payload.imei, { max: 40 });
  if (!providedSerial && !override) {
    throw badRequest('IMEI_REQUIRED', 'أدخل IMEI/Serial الجهاز لتأكيد البيع.');
  }
  if (providedSerial) assertSerialMatches(device, providedSerial);

  const salePrice = payload.salePrice != null
    ? toPositiveNumber(payload.salePrice, 'سعر البيع')
    : device.price;
  const discount = Math.max(0, Number(payload.discount) || 0);
  if (discount > salePrice) throw badRequest('DISCOUNT_TOO_HIGH', 'الخصم أكبر من سعر البيع.');

  const applyDeposit = payload.applyDeposit !== false;
  const depositApplied = applyDeposit ? trial.deposit : 0;
  const netPrice = salePrice - discount;
  const balanceDue = Math.max(0, netPrice - depositApplied - (Number(payload.paidNow) || 0));

  const sale = {
    id: nextSequence(db, 'sale', 'SAL'),
    trialId: trial.id, // ← الرابط الأصلي بالتجربة محفوظ دائمًا
    trialCode: trial.code,
    deviceId: device.id,
    deviceName: `${device.brand} ${device.model}`,
    imei: device.imei,
    customerId: trial.customerId,
    customerName: customer?.name || null,
    employeeId: actor.id,
    employeeName: actor.name,
    salePrice,
    discount,
    netPrice,
    depositApplied,
    paidNow: Math.max(0, Number(payload.paidNow) || 0),
    balanceDue,
    paymentMethod: cleanText(payload.paymentMethod, { max: 40 }) || 'cash',
    warrantyMonths: Number(payload.warrantyMonths) || settings.defaultWarrantyMonths,
    soldAt: now,
    source: 'trial24',
    notes: cleanText(payload.notes, { max: 500 }),
  };
  db.insert('sales', sale);

  const oldStatus = trial.status;
  trial.status = TRIAL_STATUS.PURCHASED;
  trial.saleId = sale.id;
  trial.closedAt = now;
  trial.closedBy = actor.id;
  trial.actualDurationMs = now - trial.startAt;
  trial.depositRefunded = 0;
  trial.updatedAt = now;

  const deviceChange = setDeviceStatus(device, DEVICE_STATUS.SOLD);
  device.soldAt = now;
  device.soldViaTrialId = trial.id;

  const base = trialAuditBase(db, trial);
  logAudit(db, {
    action: AUDIT_ACTIONS.PURCHASE,
    actor,
    ...base,
    oldStatus,
    newStatus: trial.status,
    deviceOldStatus: deviceChange.oldStatus,
    deviceNewStatus: deviceChange.newStatus,
    meta: {
      saleId: sale.id,
      salePrice,
      discount,
      depositApplied,
      balanceDue,
      trialDurationMs: trial.actualDurationMs,
    },
  });
  if (override) {
    logAudit(db, {
      action: AUDIT_ACTIONS.OVERRIDE,
      actor,
      ...base,
      reason: cleanText(payload.overrideReason),
      meta: { scope: 'purchase' },
    });
  }

  notifyAll(db, {
    event: EVENTS.TRIAL_PURCHASED,
    severity: SEVERITY.SUCCESS,
    toManagers: true,
    toStaff: true,
    title: 'تحوّلت التجربة إلى عملية بيع',
    body: [
      `التجربة: ${trial.code} → الفاتورة: ${sale.id}`,
      `العميل: ${customer?.name || '—'}`,
      `الجهاز: ${device.brand} ${device.model} — IMEI ${device.imei}`,
      `السعر: ${money(netPrice, settings.currency)} (خصم ${money(discount, settings.currency)})`,
      `العربون المُحتسب: ${money(depositApplied, settings.currency)}`,
      balanceDue ? `المتبقي: ${money(balanceDue, settings.currency)}` : 'مسدَّد بالكامل',
      `البائع: ${actor.name}`,
    ].join('\n'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: device.id,
    customer,
    customerMessage:
      `مبروك ${customer?.name || ''} 🎉\n` +
      `تم تسجيل شراء ${device.brand} ${device.model} (فاتورة ${sale.id}) بعد تجربة ${trial.code}.\n` +
      (balanceDue ? `المبلغ المتبقي: ${money(balanceDue, settings.currency)}.` : 'المبلغ مسدَّد بالكامل.'),
    data: { saleId: sale.id, netPrice, balanceDue },
  });

  return { trial: decorate(db, trial, now), sale };
}

// ————————————————————————————————————————————————
// 4) التمديد (مع حدود السياسة وموافقة المدير)
// ————————————————————————————————————————————————

/** تحقق من حدود التمديد قبل تطبيقه. */
export function validateExtension(db, trial, hours, { override = false } = {}) {
  const settings = db.settings;
  const errors = [];

  if (trial.extensions.length >= settings.maxExtensions) {
    errors.push({
      code: 'MAX_EXTENSIONS_REACHED',
      message: `بلغت التجربة الحد الأقصى للتمديدات (${settings.maxExtensions}).`,
    });
  }
  if (hours > settings.maxExtensionHours) {
    errors.push({
      code: 'EXTENSION_TOO_LONG',
      message: `أقصى تمديد للمرة الواحدة ${settings.maxExtensionHours} ساعة.`,
    });
  }
  const projectedTotalHours = (trial.endAt + hours * HOUR_MS - trial.startAt) / HOUR_MS;
  if (projectedTotalHours > settings.maxTotalDurationHours) {
    errors.push({
      code: 'MAX_TOTAL_DURATION',
      message: `المدة الكلية ستتجاوز الحد الأقصى (${settings.maxTotalDurationHours} ساعة).`,
    });
  }

  return { ok: errors.length === 0 || override, errors, projectedTotalHours };
}

/**
 * طلب/تنفيذ تمديد.
 * • مدير (trial.extend) → تنفيذ مباشر.
 * • موظف + الإعدادات تشترط موافقة → إنشاء طلب معلّق وإشعار المدير.
 * • موظف + الإعدادات لا تشترط موافقة → تنفيذ مباشر.
 */
export function extendTrial(db, actor, trialId, payload = {}) {
  const now = serverNow();
  const settings = db.settings;
  const trial = getTrial(db, trialId);
  assertOpen(trial);

  const hours = payload.hours ? toPositiveNumber(payload.hours, 'مدة التمديد') : settings.defaultExtensionHours;
  const reason = cleanText(payload.reason, { max: 300 });
  if (!reason) throw badRequest('REASON_REQUIRED', 'اكتب سبب التمديد.');

  // محاولة تجاوز السياسة تُرفض فورًا لمن لا يملك الصلاحية — قبل أي مسار آخر.
  const override = assertOverrideAllowed(actor, payload.override, payload.overrideReason);

  const isManager = can(actor, PERMISSIONS.TRIAL_EXTEND);
  if (!isManager) {
    if (!can(actor, PERMISSIONS.TRIAL_CREATE)) {
      throw forbidden('PERMISSION_DENIED', 'لا تملك صلاحية طلب التمديد.');
    }
    if (settings.requireManagerApprovalForExtension) {
      // لا يُرفع للمدير طلب يخالف السياسة أصلًا — يُرفض عند مصدره.
      const preCheck = validateExtension(db, trial, hours);
      if (!preCheck.ok) {
        throw conflict('EXTENSION_NOT_ALLOWED', preCheck.errors[0].message, { errors: preCheck.errors });
      }
      return requestExtension(db, actor, trial, hours, reason, now);
    }
  }

  const check = validateExtension(db, trial, hours, { override });
  if (!check.ok) {
    throw conflict('EXTENSION_NOT_ALLOWED', check.errors[0].message, { errors: check.errors });
  }

  return applyExtension(db, actor, trial, {
    hours,
    reason,
    override,
    overrideReason: cleanText(payload.overrideReason),
    approvedBy: isManager ? actor.id : null,
    now,
  });
}

function requestExtension(db, actor, trial, hours, reason, now) {
  const existing = db.data.extensionRequests.find(
    (r) => r.trialId === trial.id && r.status === 'pending'
  );
  if (existing) {
    throw conflict('EXTENSION_REQUEST_PENDING', 'يوجد طلب تمديد معلّق بانتظار موافقة المدير.', {
      requestId: existing.id,
    });
  }

  const request = {
    id: nextSequence(db, 'extreq', 'EXT'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: trial.deviceId,
    customerId: trial.customerId,
    hours,
    reason,
    status: 'pending',
    requestedBy: actor.id,
    requestedByName: actor.name,
    requestedAt: now,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  };
  db.insert('extensionRequests', request);

  const base = trialAuditBase(db, trial);
  logAudit(db, {
    action: AUDIT_ACTIONS.EXTENSION_REQUEST,
    actor,
    ...base,
    oldStatus: trial.status,
    newStatus: trial.status,
    reason,
    meta: { requestId: request.id, hours },
  });

  const customer = db.find('customers', trial.customerId);
  const device = db.find('devices', trial.deviceId);
  notifyAll(db, {
    event: EVENTS.TRIAL_EXTENSION_REQUESTED,
    severity: SEVERITY.WARNING,
    toManagers: true,
    title: 'طلب تمديد تجربة بانتظار موافقتك',
    body: [
      `التجربة: ${trial.code}`,
      `العميل: ${customer?.name || '—'}`,
      `الجهاز: ${device ? `${device.brand} ${device.model}` : '—'}`,
      `مقدّم الطلب: ${actor.name}`,
      `المدة المطلوبة: ${hours} ساعة`,
      `السبب: ${reason}`,
    ].join('\n'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: trial.deviceId,
    data: { requestId: request.id, hours },
  });

  return { status: 'pending_approval', request, trial: decorate(db, trial, now) };
}

function applyExtension(db, actor, trial, { hours, reason, override, overrideReason, approvedBy, now, requestId = null, requestedByName = null }) {
  const settings = db.settings;
  const oldStatus = trial.status;
  const oldEndAt = trial.endAt;

  trial.endAt = trial.endAt + hours * HOUR_MS;
  trial.status = TRIAL_STATUS.ACTIVE; // تمديد تجربة منتهية يعيدها للحالة الجارية
  trial.expiredAt = null;
  trial.expiredNotifiedAt = null;
  trial.reminderSentAt = null; // ليُرسل تذكير جديد قبل الموعد الجديد
  trial.updatedAt = now;
  trial.extensions.push({
    at: now,
    hours,
    reason,
    byId: actor.id,
    byName: actor.name,
    approvedBy: approvedBy || actor.id,
    requestId,
    requestedByName,
    previousEndAt: oldEndAt,
    newEndAt: trial.endAt,
    override: Boolean(override),
  });
  if (override) {
    trial.overrides.push({ at: now, by: actor.id, byName: actor.name, reason: overrideReason, scope: 'extend' });
  }

  const base = trialAuditBase(db, trial);
  logAudit(db, {
    action: AUDIT_ACTIONS.EXTENSION,
    actor,
    ...base,
    oldStatus,
    newStatus: trial.status,
    reason,
    meta: {
      hours,
      previousEndAt: oldEndAt,
      newEndAt: trial.endAt,
      extensionNumber: trial.extensions.length,
      override: Boolean(override),
      requestId,
    },
  });
  if (override) {
    logAudit(db, {
      action: AUDIT_ACTIONS.OVERRIDE,
      actor,
      ...base,
      reason: overrideReason,
      meta: { scope: 'extend', hours },
    });
  }

  const customer = db.find('customers', trial.customerId);
  const device = db.find('devices', trial.deviceId);
  notifyAll(db, {
    event: EVENTS.TRIAL_EXTENDED,
    severity: SEVERITY.INFO,
    toManagers: true,
    toStaff: true,
    title: 'تم تمديد التجربة',
    body: [
      `التجربة: ${trial.code}`,
      `العميل: ${customer?.name || '—'}`,
      `الجهاز: ${device ? `${device.brand} ${device.model}` : '—'}`,
      `مدة التمديد: ${hours} ساعة (التمديد رقم ${trial.extensions.length})`,
      `النهاية الجديدة: ${fmtTime(trial.endAt, settings.timezone)}`,
      `اعتمده: ${actor.name}`,
      `السبب: ${reason}`,
    ].join('\n'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: trial.deviceId,
    customer,
    customerMessage:
      `تم تمديد تجربتك ${trial.code} لمدة ${hours} ساعة إضافية.\n` +
      `الموعد الجديد للإرجاع: ${fmtTime(trial.endAt, settings.timezone)}.`,
    data: { hours, newEndAt: trial.endAt },
  });

  return { status: 'extended', trial: decorate(db, trial, now) };
}

export function approveExtension(db, actor, requestId, payload = {}) {
  assertCan(actor, PERMISSIONS.TRIAL_EXTEND);
  const now = serverNow();
  const request = db.find('extensionRequests', requestId);
  if (!request) throw notFound('REQUEST_NOT_FOUND', 'طلب التمديد غير موجود.');
  if (request.status !== 'pending') {
    throw conflict('REQUEST_DECIDED', 'تمت معالجة هذا الطلب مسبقًا.', { status: request.status });
  }

  const trial = getTrial(db, request.trialId);
  assertOpen(trial);

  const hours = payload.hours ? toPositiveNumber(payload.hours, 'مدة التمديد') : request.hours;
  const override = assertOverrideAllowed(actor, payload.override, payload.overrideReason);
  const check = validateExtension(db, trial, hours, { override });
  if (!check.ok) {
    throw conflict('EXTENSION_NOT_ALLOWED', check.errors[0].message, { errors: check.errors });
  }

  request.status = 'approved';
  request.decidedBy = actor.id;
  request.decidedAt = now;
  request.decisionNote = cleanText(payload.note, { max: 300 });
  request.hours = hours;

  return applyExtension(db, actor, trial, {
    hours,
    reason: request.reason,
    override,
    overrideReason: cleanText(payload.overrideReason),
    approvedBy: actor.id,
    now,
    requestId: request.id,
    requestedByName: request.requestedByName,
  });
}

export function rejectExtension(db, actor, requestId, payload = {}) {
  assertCan(actor, PERMISSIONS.TRIAL_EXTEND);
  const now = serverNow();
  const request = db.find('extensionRequests', requestId);
  if (!request) throw notFound('REQUEST_NOT_FOUND', 'طلب التمديد غير موجود.');
  if (request.status !== 'pending') {
    throw conflict('REQUEST_DECIDED', 'تمت معالجة هذا الطلب مسبقًا.', { status: request.status });
  }
  const note = cleanText(payload.note, { max: 300 });
  if (!note) throw badRequest('REASON_REQUIRED', 'اكتب سبب رفض التمديد.');

  request.status = 'rejected';
  request.decidedBy = actor.id;
  request.decidedAt = now;
  request.decisionNote = note;

  const trial = getTrial(db, request.trialId);
  logAudit(db, {
    action: AUDIT_ACTIONS.EXTENSION_REJECT,
    actor,
    ...trialAuditBase(db, trial),
    oldStatus: trial.status,
    newStatus: trial.status,
    reason: note,
    meta: { requestId: request.id, hours: request.hours },
  });

  return { status: 'rejected', request };
}

// ————————————————————————————————————————————————
// 5) الإلغاء (مدير)
// ————————————————————————————————————————————————

export function cancelTrial(db, actor, trialId, payload = {}) {
  assertCan(actor, PERMISSIONS.TRIAL_CANCEL);
  const now = serverNow();
  const trial = getTrial(db, trialId);
  assertOpen(trial);

  const reason = cleanText(payload.reason, { max: 300 });
  if (!reason) throw badRequest('REASON_REQUIRED', 'اكتب سبب الإلغاء.');

  const device = getDevice(db, trial.deviceId);
  const oldStatus = trial.status;
  trial.status = TRIAL_STATUS.CANCELLED;
  trial.cancelReason = reason;
  trial.closedAt = now;
  trial.closedBy = actor.id;
  trial.actualDurationMs = now - trial.startAt;
  trial.depositRefunded = payload.refundDeposit === false ? 0 : trial.deposit;
  trial.updatedAt = now;

  const deviceReturned = payload.deviceReturned !== false;
  const deviceChange = setDeviceStatus(
    device,
    deviceReturned ? DEVICE_STATUS.AVAILABLE : DEVICE_STATUS.MAINTENANCE
  );

  const base = trialAuditBase(db, trial);
  logAudit(db, {
    action: AUDIT_ACTIONS.CANCEL,
    actor,
    ...base,
    oldStatus,
    newStatus: trial.status,
    deviceOldStatus: deviceChange.oldStatus,
    deviceNewStatus: deviceChange.newStatus,
    reason,
    meta: { refunded: trial.depositRefunded, deviceReturned },
  });

  const customer = db.find('customers', trial.customerId);
  notifyAll(db, {
    event: EVENTS.TRIAL_CANCELLED,
    severity: SEVERITY.WARNING,
    toManagers: true,
    toStaff: true,
    title: 'تم إلغاء تجربة',
    body: [
      `التجربة: ${trial.code}`,
      `العميل: ${customer?.name || '—'}`,
      `الجهاز: ${device.brand} ${device.model}`,
      `ألغاها: ${actor.name}`,
      `السبب: ${reason}`,
    ].join('\n'),
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: device.id,
    customer,
    customerMessage: `نعتذر ${customer?.name || ''}، تم إلغاء التجربة ${trial.code}. السبب: ${reason}`,
  });

  return decorate(db, trial, now);
}

// ————————————————————————————————————————————————
// 6) المجدول: التذكير قبل ساعة + انتهاء المدة
// ————————————————————————————————————————————————

/**
 * يعمل دوريًا على الخادم ويُستدعى كذلك قبل أي قراءة، فتبقى الحالات صحيحة
 * حتى لو كان الخادم متوقفًا لفترة (يُعالج المتأخرات فور التشغيل).
 */
export function runDueJobs(db, now = serverNow()) {
  const settings = db.settings;
  const fired = { reminders: [], expirations: [] };
  let changed = false;

  for (const trial of db.data.trials) {
    if (trial.status !== TRIAL_STATUS.ACTIVE) continue;

    const reminderAt = trial.endAt - settings.reminderBeforeMinutes * MINUTE_MS;
    const customer = db.find('customers', trial.customerId);
    const device = db.find('devices', trial.deviceId);
    const deviceName = device ? `${device.brand} ${device.model}` : '—';

    // (أ) تذكير قبل انتهاء التجربة
    if (!trial.reminderSentAt && now >= reminderAt && now < trial.endAt) {
      trial.reminderSentAt = now;
      trial.updatedAt = now;
      changed = true;

      notifyAll(db, {
        event: EVENTS.TRIAL_ENDING_SOON,
        severity: SEVERITY.WARNING,
        toStaff: true,
        toManagers: true,
        at: now,
        title: 'تجربة تقارب الانتهاء',
        body: [
          `التجربة: ${trial.code}`,
          `العميل: ${customer?.name || '—'} (${customer?.phone || '—'})`,
          `الجهاز: ${deviceName} — IMEI ${trial.imei}`,
          `تنتهي: ${fmtTime(trial.endAt, settings.timezone)}`,
          `المتبقي: ${fmtDuration(trial.endAt - now)}`,
        ].join('\n'),
        trialId: trial.id,
        trialCode: trial.code,
        deviceId: trial.deviceId,
        customer,
        customerMessage:
          `تذكير ودّي 🕰️\n` +
          `تنتهي تجربتك لجهاز ${deviceName} بعد ${fmtDuration(trial.endAt - now)} ` +
          `(${fmtTime(trial.endAt, settings.timezone)}).\n` +
          `يمكنك الشراء أو الإرجاع أو طلب تمديد من ${settings.storeName}.`,
        data: { remainingMs: trial.endAt - now },
      });

      logAudit(db, {
        action: AUDIT_ACTIONS.REMINDER,
        actor: null,
        ...trialAuditBase(db, trial),
        oldStatus: trial.status,
        newStatus: trial.status,
        at: now,
        meta: { remainingMs: trial.endAt - now, channel: 'customer+staff' },
      });
      fired.reminders.push(trial.id);
    }

    // (ب) انتهاء المدة
    if (now >= trial.endAt) {
      const oldStatus = trial.status;
      trial.status = TRIAL_STATUS.EXPIRED;
      trial.expiredAt = now;
      trial.expiredNotifiedAt = now;
      trial.updatedAt = now;
      changed = true;

      notifyAll(db, {
        event: EVENTS.TRIAL_EXPIRED,
        severity: SEVERITY.CRITICAL,
        toManagers: true,
        toStaff: true,
        at: now,
        title: 'انتهت مدة التجربة — الجهاز لم يُسترجع بعد',
        body: [
          `التجربة: ${trial.code}`,
          `العميل: ${customer?.name || '—'} (${customer?.phone || '—'})`,
          `الجهاز: ${deviceName} — IMEI ${trial.imei}`,
          `انتهت في: ${fmtTime(trial.endAt, settings.timezone)}`,
          `العربون: ${money(trial.deposit, settings.currency)}`,
        ].join('\n'),
        trialId: trial.id,
        trialCode: trial.code,
        deviceId: trial.deviceId,
        customer,
        customerMessage:
          `انتهت مدة تجربة جهاز ${deviceName} (${trial.code}).\n` +
          `يرجى مراجعة ${settings.storeName} لإتمام الشراء أو إرجاع الجهاز أو طلب تمديد.`,
        data: { endAt: trial.endAt, reminderSkipped: !trial.reminderSentAt },
      });

      logAudit(db, {
        action: AUDIT_ACTIONS.EXPIRE,
        actor: null,
        ...trialAuditBase(db, trial),
        oldStatus,
        newStatus: trial.status,
        at: now,
        meta: { endAt: trial.endAt, reminderSkipped: !trial.reminderSentAt },
      });
      fired.expirations.push(trial.id);
    }
  }

  return { changed, fired };
}

// ————————————————————————————————————————————————
// 7) لوحة المعلومات
// ————————————————————————————————————————————————

export function dashboard(db, now = serverNow()) {
  const settings = db.settings;
  const trials = db.data.trials;
  const today = dayKey(now, settings.timezone);

  const active = trials.filter((t) => t.status === TRIAL_STATUS.ACTIVE);
  const expired = trials.filter((t) => t.status === TRIAL_STATUS.EXPIRED);
  const purchased = trials.filter((t) => t.status === TRIAL_STATUS.PURCHASED);
  const returned = trials.filter((t) => t.status === TRIAL_STATUS.RETURNED);

  const endingToday = active.filter((t) => dayKey(t.endAt, settings.timezone) === today);
  const endingSoon = active.filter(
    (t) => t.endAt - now > 0 && t.endAt - now <= settings.endingSoonMinutes * MINUTE_MS
  );
  const awaitingReturn = [...active, ...expired]; // الأجهزة الخارجة من المتجر
  const decided = purchased.length + returned.length;

  return {
    cards: {
      activeTrials: active.length,
      endingToday: endingToday.length,
      endingSoon: endingSoon.length,
      expired: expired.length,
      awaitingReturn: awaitingReturn.length,
      convertedToSales: purchased.length,
      conversionRate: pct(purchased.length, decided),
    },
    pendingExtensionRequests: db.data.extensionRequests.filter((r) => r.status === 'pending').length,
    trials: listTrials(db, { status: 'all' }, now),
    serverTime: now,
  };
}
