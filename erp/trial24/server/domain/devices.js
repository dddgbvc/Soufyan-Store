/**
 * Trial24 — الأجهزة والمخزون
 *
 * قفل الجهاز أثناء التجربة: ما إن يخرج جهاز للتجربة حتى تتغيّر حالته إلى
 * `on_trial`، فلا يمكن بيعه ولا حجزه ولا إخراجه لعميل آخر — يُفرض ذلك على
 * الخادم في كل عملية، لا في الواجهة.
 *
 * ملاحظة مهمة: التحقق من الجهاز يعتمد على بياناته المسجّلة في النظام
 * (IMEI/Serial، حالة البطارية، الدرجة الظاهرية، الملحقات) — بلا أي تصوير.
 */

import { conflict, notFound, serverNow, serialMatches } from '../util.js';

export const DEVICE_STATUS = {
  AVAILABLE: 'available',
  ON_TRIAL: 'on_trial',
  RESERVED: 'reserved',
  SOLD: 'sold',
  MAINTENANCE: 'maintenance',
};

export const DEVICE_STATUS_LABELS = {
  available: 'متاح',
  on_trial: 'قيد التجربة',
  reserved: 'محجوز',
  sold: 'مُباع',
  maintenance: 'في الصيانة',
};

/** الحالات التي تمنع إخراج الجهاز لتجربة جديدة. */
export const BLOCKING_STATUSES = [
  DEVICE_STATUS.ON_TRIAL,
  DEVICE_STATUS.RESERVED,
  DEVICE_STATUS.SOLD,
  DEVICE_STATUS.MAINTENANCE,
];

export function getDevice(db, deviceId) {
  const device = db.find('devices', deviceId);
  if (!device) throw notFound('DEVICE_NOT_FOUND', 'الجهاز غير موجود في المخزون.');
  return device;
}

/**
 * التحقق من إمكانية إخراج الجهاز للتجربة.
 * يرمي 409 مع سبب واضح إن كان الجهاز مقفولًا.
 */
export function assertDeviceAvailable(db, device) {
  if (device.status === DEVICE_STATUS.AVAILABLE) return device;

  const reasons = {
    on_trial: 'الجهاز حاليًا قيد تجربة لدى عميل آخر.',
    reserved: 'الجهاز محجوز ولا يمكن إخراجه للتجربة.',
    sold: 'الجهاز مُباع ولم يعد ضمن المخزون المتاح.',
    maintenance: 'الجهاز في الصيانة.',
  };
  throw conflict(
    'DEVICE_NOT_AVAILABLE',
    reasons[device.status] || 'الجهاز غير متاح للتجربة.',
    { deviceId: device.id, status: device.status, currentTrialId: device.currentTrialId || null }
  );
}

/**
 * التحقق من مطابقة IMEI/Serial المُدخل لبيانات الجهاز في النظام.
 * هذا هو بديل "إثبات التصوير": المطابقة على البيانات لا على الصور.
 */
export function assertSerialMatches(device, providedSerial) {
  const okImei = serialMatches(device.imei, providedSerial);
  const okSerial = serialMatches(device.serial, providedSerial);
  if (!okImei && !okSerial) {
    throw conflict(
      'IMEI_MISMATCH',
      'رقم IMEI/Serial المُدخل لا يطابق بيانات الجهاز المسجّلة في النظام.',
      { deviceId: device.id }
    );
  }
  return okImei ? 'imei' : 'serial';
}

/** لقطة حالة الجهاز وقت التسليم — تُجمَّد داخل التجربة وتُقارَن عند الإرجاع. */
export function conditionSnapshot(device) {
  return {
    takenAt: serverNow(),
    imei: device.imei,
    serial: device.serial,
    color: device.color,
    storage: device.storage,
    ram: device.ram,
    batteryHealth: device.batteryHealth,
    cosmeticGrade: device.cosmeticGrade,
    functionalChecks: { ...(device.functionalChecks || {}) },
    accessories: [...(device.accessories || [])],
    conditionNotes: device.conditionNotes || '',
  };
}

/** تغيير حالة الجهاز مع إرجاع (القديمة، الجديدة) لتسجيلها في التدقيق. */
export function setDeviceStatus(device, newStatus, { trialId = null } = {}) {
  const oldStatus = device.status;
  device.status = newStatus;
  device.currentTrialId = newStatus === DEVICE_STATUS.ON_TRIAL ? trialId : null;
  device.updatedAt = serverNow();
  return { oldStatus, newStatus };
}

/** تاريخ تجارب الجهاز — مرتّب من الأحدث إلى الأقدم. */
export function deviceHistory(db, deviceId) {
  // الأحدث أولًا؛ وعند تساوي وقت البدء يفصل الرقم التسلسلي للتجربة
  // (تجربتان في الثانية نفسها ممكنتان في يوم مزدحم).
  const trials = db.data.trials
    .filter((t) => t.deviceId === deviceId)
    .sort((a, b) => b.startAt - a.startAt || b.id.localeCompare(a.id));

  const customers = new Map(db.data.customers.map((c) => [c.id, c]));
  const users = new Map(db.data.users.map((u) => [u.id, u]));

  return trials.map((t) => ({
    trialId: t.id,
    code: t.code,
    status: t.status,
    customerId: t.customerId,
    customerName: customers.get(t.customerId)?.name || '—',
    employeeName: users.get(t.employeeId)?.name || '—',
    startAt: t.startAt,
    endAt: t.endAt,
    closedAt: t.closedAt,
    outcome: t.status,
    extensions: t.extensions.length,
    deposit: t.deposit,
    saleId: t.saleId || null,
  }));
}

/** إحصاء تجارب الجهاز (يُستخدم في التحليلات وبطاقة الجهاز). */
export function deviceStats(db, deviceId) {
  const trials = db.data.trials.filter((t) => t.deviceId === deviceId);
  const closed = trials.filter((t) => ['returned', 'purchased'].includes(t.status));
  const purchased = trials.filter((t) => t.status === 'purchased');
  return {
    total: trials.length,
    purchased: purchased.length,
    returned: trials.filter((t) => t.status === 'returned').length,
    cancelled: trials.filter((t) => t.status === 'cancelled').length,
    open: trials.filter((t) => ['active', 'expired'].includes(t.status)).length,
    conversionRate: closed.length ? Math.round((purchased.length / closed.length) * 1000) / 10 : 0,
  };
}
