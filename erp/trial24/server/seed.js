/**
 * Trial24 — تهيئة البيانات الأولية
 *
 *   node server/seed.js           إنشاء قاعدة البيانات إن لم تكن موجودة
 *   node server/seed.js --force   إعادة التهيئة من الصفر (يمسح البيانات الحالية)
 *   node server/seed.js --empty   تهيئة بلا تجارب تجريبية (مخزون ومستخدمون فقط)
 *
 * البيانات التجريبية تُبنى بتواريخ ماضية حقيقية حتى تظهر اللوحة والتحليلات
 * بمعطيات ذات معنى منذ أول تشغيل.
 */

import fs from 'node:fs';
import { db, DB_FILE, EMPTY_DB } from './db.js';
import { HOUR_MS, MINUTE_MS } from './util.js';
import { AUDIT_ACTIONS, logAudit } from './domain/audit.js';
import { DEVICE_STATUS } from './domain/devices.js';

export const DEFAULT_SETTINGS = {
  storeName: 'مركز سفيان للهواتف',
  storeBranch: 'سامراء — الحويش',
  currency: 'IQD',
  timezone: 'Asia/Baghdad',

  // المدة
  defaultDurationHours: 24,
  defaultExtensionHours: 12,

  // حدود التمديد
  maxExtensions: 2,
  maxExtensionHours: 24,
  maxTotalDurationHours: 72,
  requireManagerApprovalForExtension: true,

  // العتبات الزمنية
  reminderBeforeMinutes: 60, // تذكير العميل قبل ساعة
  endingSoonMinutes: 180, // «تقترب من النهاية»
  criticalMinutes: 60, // «حرِجة»

  // العربون
  depositRequired: true,
  minDepositIQD: 50000,

  // البيع
  defaultWarrantyMonths: 12,

  // التحليلات
  analyticsMinSample: 2,

  // الشروط
  termsVersion: 'v1.0',
  termsText: [
    'الجهاز يخرج للتجربة لمدة 24 ساعة من وقت التسليم المسجّل في النظام.',
    'العميل مسؤول عن الجهاز خلال فترة التجربة، ويُعيده بالحالة نفسها المسجّلة عند التسليم.',
    'يُحتفظ بالعربون حتى إرجاع الجهاز أو إتمام الشراء، ويُعاد كاملًا عند الإرجاع السليم.',
    'لا يجوز فتح الجهاز أو تغيير أي من مكوناته أو إزالة الملصقات والملحقات.',
    'التمديد ممكن حسب سياسة المتجر وبموافقة الإدارة قبل انتهاء المدة.',
    'عند الشراء يُحتسب العربون من قيمة الجهاز ويبدأ الضمان من تاريخ الفاتورة.',
  ],
};

const USERS = [
  { id: 'usr_manager', name: 'سفيان الجبوري', role: 'manager', title: 'مدير المتجر', phone: '07731644450', active: true },
  { id: 'usr_ahmed', name: 'أحمد كريم', role: 'employee', title: 'موظف مبيعات', phone: '07744485771', active: true },
  { id: 'usr_zaid', name: 'زيد الساعدي', role: 'employee', title: 'موظف مبيعات', phone: '07701234567', active: true },
  { id: 'usr_noor', name: 'نور العبيدي', role: 'employee', title: 'خدمة العملاء', phone: '07809876543', active: true },
];

const CUSTOMERS = [
  { id: 'cus_001', name: 'مصطفى العزاوي', phone: '07701112233', city: 'سامراء', idType: 'بطاقة موحدة', idNumber: '199403211', trusted: true },
  { id: 'cus_002', name: 'حيدر التميمي', phone: '07702223344', city: 'سامراء', idType: 'بطاقة موحدة', idNumber: '199712045', trusted: false },
  { id: 'cus_003', name: 'ليلى الحسن', phone: '07703334455', city: 'سامراء', idType: 'جواز سفر', idNumber: 'A4471902', trusted: true },
  { id: 'cus_004', name: 'عمر الدليمي', phone: '07704445566', city: 'بلد', idType: 'بطاقة موحدة', idNumber: '199105567', trusted: false },
  { id: 'cus_005', name: 'زينب الخفاجي', phone: '07705556677', city: 'سامراء', idType: 'بطاقة موحدة', idNumber: '200002198', trusted: true },
  { id: 'cus_006', name: 'كرار الموسوي', phone: '07706667788', city: 'الدور', idType: 'بطاقة موحدة', idNumber: '198809334', trusted: false },
  { id: 'cus_007', name: 'سجى الراوي', phone: '07707778899', city: 'سامراء', idType: 'بطاقة موحدة', idNumber: '199906712', trusted: true },
  { id: 'cus_008', name: 'أنس الجنابي', phone: '07708889900', city: 'سامراء', idType: 'بطاقة موحدة', idNumber: '199502843', trusted: false, blocked: true, blockReason: 'تأخر سابق في إرجاع جهاز تجربة' },
];

/** أجهزة المخزون — مأخوذة من كتالوج المتجر مع بيانات حالة حقيقية (بلا صور). */
const DEVICES = [
  { id: 'dev_001', brand: 'Samsung', model: 'Galaxy S24 Ultra', imei: '354820761193047', serial: 'RF8W91XKQ2A', color: 'أسود تيتانيوم', storage: '256GB', ram: '12GB', price: 1750000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_002', brand: 'Apple', model: 'iPhone 15 Pro Max', imei: '356938102947551', serial: 'F2LX8K1PQ7YT', color: 'تيتانيوم طبيعي', storage: '256GB', ram: '8GB', price: 2100000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_003', brand: 'Apple', model: 'iPhone 15', imei: '356938102947552', serial: 'F2LX8K1PQ8ZU', color: 'أزرق', storage: '128GB', ram: '6GB', price: 1250000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_004', brand: 'Apple', model: 'iPhone 13', imei: '353012110893766', serial: 'DX3P7Q9RT1MN', color: 'أبيض', storage: '128GB', ram: '4GB', price: 900000, batteryHealth: 89, cosmeticGrade: 'B', condition: 'مستعمل — ممتاز', boxIncluded: false },
  { id: 'dev_005', brand: 'Samsung', model: 'Galaxy A55', imei: '354820761193048', serial: 'RF8W91XKQ3B', color: 'أزرق', storage: '128GB', ram: '8GB', price: 520000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_006', brand: 'Samsung', model: 'Galaxy A15', imei: '354820761193049', serial: 'RF8W91XKQ4C', color: 'أصفر', storage: '128GB', ram: '6GB', price: 185000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_007', brand: 'Xiaomi', model: 'Redmi Note 13 Pro', imei: '867351048829105', serial: 'XM24RN13P0091', color: 'بنفسجي', storage: '256GB', ram: '8GB', price: 420000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_008', brand: 'Xiaomi', model: 'Poco X6 Pro', imei: '867351048829106', serial: 'XM24PX6P0142', color: 'أصفر', storage: '256GB', ram: '12GB', price: 480000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_009', brand: 'Xiaomi', model: 'Redmi 13C', imei: '867351048829107', serial: 'XM24R13C0233', color: 'أخضر', storage: '128GB', ram: '6GB', price: 145000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_010', brand: 'Infinix', model: 'Note 40 Pro', imei: '862431559072118', serial: 'IN40P2024X771', color: 'ذهبي', storage: '256GB', ram: '8GB', price: 310000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_011', brand: 'Infinix', model: 'Hot 40i', imei: '862431559072119', serial: 'IN40I2024X902', color: 'أزرق', storage: '128GB', ram: '8GB', price: 165000, batteryHealth: 100, cosmeticGrade: 'A', condition: 'جديد', boxIncluded: true },
  { id: 'dev_012', brand: 'Samsung', model: 'Galaxy S23 FE', imei: '354820761193050', serial: 'RF8W91XKQ5D', color: 'نعناعي', storage: '128GB', ram: '8GB', price: 780000, batteryHealth: 96, cosmeticGrade: 'A', condition: 'مستعمل — كالجديد', boxIncluded: true, status: DEVICE_STATUS.RESERVED },
  { id: 'dev_013', brand: 'Apple', model: 'iPhone 14 Pro', imei: '356938102947553', serial: 'F2LX8K1PQ9AV', color: 'بنفسجي', storage: '256GB', ram: '6GB', price: 1450000, batteryHealth: 91, cosmeticGrade: 'B', condition: 'مستعمل — ممتاز', boxIncluded: false },
  { id: 'dev_014', brand: 'Samsung', model: 'Galaxy Z Flip 5', imei: '354820761193051', serial: 'RF8W91XKQ6E', color: 'كريمي', storage: '256GB', ram: '8GB', price: 1150000, batteryHealth: 88, cosmeticGrade: 'C', condition: 'مستعمل — جيد', boxIncluded: false, status: DEVICE_STATUS.MAINTENANCE, conditionNotes: 'خدش على الإطار الجانبي — بانتظار التلميع' },
];

const FUNCTIONAL_CHECKS = {
  screen: true,
  battery: true,
  cameras: true,
  speakers: true,
  microphone: true,
  charging: true,
  fingerprint: true,
  sim: true,
  wifi: true,
};

function buildDevice(raw, now) {
  return {
    id: raw.id,
    brand: raw.brand,
    model: raw.model,
    name: `${raw.brand} ${raw.model}`,
    imei: raw.imei,
    serial: raw.serial,
    color: raw.color,
    storage: raw.storage,
    ram: raw.ram,
    price: raw.price,
    status: raw.status || DEVICE_STATUS.AVAILABLE,
    currentTrialId: null,
    condition: raw.condition,
    batteryHealth: raw.batteryHealth,
    cosmeticGrade: raw.cosmeticGrade,
    boxIncluded: raw.boxIncluded,
    accessories: raw.boxIncluded ? ['شاحن أصلي', 'كيبل', 'علبة'] : ['كيبل'],
    functionalChecks: { ...FUNCTIONAL_CHECKS },
    conditionNotes: raw.conditionNotes || '',
    trialCount: 0,
    lastTrialAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ————————————————————————————————————————————————
// بناء تجارب تاريخية (بيانات عرض)
// ————————————————————————————————————————————————

function seedTrial(data, spec, seq) {
  const settings = data.settings;
  const device = data.devices.find((d) => d.id === spec.deviceId);
  const customer = data.customers.find((c) => c.id === spec.customerId);
  const employee = data.users.find((u) => u.id === spec.employeeId);
  const year = new Date(spec.startAt).getUTCFullYear();
  const code = `TRL-${year}-${String(seq).padStart(4, '0')}`;
  data.counters[`trial:${year}`] = Math.max(data.counters[`trial:${year}`] || 0, seq);

  const trial = {
    id: code,
    code,
    customerId: customer.id,
    deviceId: device.id,
    employeeId: employee.id,
    imei: device.imei,
    serial: device.serial,
    verifiedField: 'imei',
    deposit: spec.deposit,
    depositMethod: 'cash',
    depositRefunded: null,
    depositDeduction: 0,
    idDocument: { type: customer.idType, number: customer.idNumber },
    baseDurationHours: spec.durationHours || settings.defaultDurationHours,
    startAt: spec.startAt,
    endAt: spec.startAt + (spec.durationHours || settings.defaultDurationHours) * HOUR_MS,
    status: 'active',
    terms: {
      accepted: true,
      version: settings.termsVersion,
      acceptedAt: spec.startAt,
      acceptedBy: customer.id,
      text: settings.termsText,
    },
    deviceSnapshot: {
      takenAt: spec.startAt,
      imei: device.imei,
      serial: device.serial,
      color: device.color,
      storage: device.storage,
      ram: device.ram,
      batteryHealth: device.batteryHealth,
      cosmeticGrade: device.cosmeticGrade,
      functionalChecks: { ...device.functionalChecks },
      accessories: [...device.accessories],
      conditionNotes: device.conditionNotes,
    },
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
    notes: spec.notes || '',
    createdAt: spec.startAt,
    updatedAt: spec.startAt,
    createdBy: employee.id,
    overrides: [],
  };

  // تمديدات
  for (const ext of spec.extensions || []) {
    const previousEndAt = trial.endAt;
    trial.endAt += ext.hours * HOUR_MS;
    trial.extensions.push({
      at: ext.at,
      hours: ext.hours,
      reason: ext.reason,
      byId: 'usr_manager',
      byName: 'سفيان الجبوري',
      approvedBy: 'usr_manager',
      requestId: null,
      requestedByName: employee.name,
      previousEndAt,
      newEndAt: trial.endAt,
      override: false,
    });
  }

  const auditBase = {
    trialId: trial.id,
    trialCode: trial.code,
    deviceId: device.id,
    deviceName: device.name,
    deviceImei: device.imei,
    customerId: customer.id,
    customerName: customer.name,
  };
  const fakeDb = { data };

  logAudit(fakeDb, { action: AUDIT_ACTIONS.CREATE, actor: employee, ...auditBase, at: spec.startAt, oldStatus: null, newStatus: 'active', meta: { seeded: true, deposit: spec.deposit } });
  logAudit(fakeDb, { action: AUDIT_ACTIONS.RELEASE, actor: employee, ...auditBase, at: spec.startAt, entity: 'device', oldStatus: 'available', newStatus: 'on_trial', deviceOldStatus: 'available', deviceNewStatus: 'on_trial', meta: { seeded: true } });

  device.trialCount = (device.trialCount || 0) + 1;
  device.lastTrialAt = spec.startAt;

  if (spec.outcome === 'purchased') {
    const saleYear = new Date(spec.closedAt).getUTCFullYear();
    const saleSeq = (data.counters[`sale:${saleYear}`] || 0) + 1;
    data.counters[`sale:${saleYear}`] = saleSeq;
    const saleId = `SAL-${saleYear}-${String(saleSeq).padStart(4, '0')}`;
    const salePrice = spec.salePrice || device.price;
    const discount = spec.discount || 0;
    data.sales.push({
      id: saleId,
      trialId: trial.id,
      trialCode: trial.code,
      deviceId: device.id,
      deviceName: device.name,
      imei: device.imei,
      customerId: customer.id,
      customerName: customer.name,
      employeeId: employee.id,
      employeeName: employee.name,
      salePrice,
      discount,
      netPrice: salePrice - discount,
      depositApplied: spec.deposit,
      paidNow: salePrice - discount - spec.deposit,
      balanceDue: 0,
      paymentMethod: 'cash',
      warrantyMonths: settings.defaultWarrantyMonths,
      soldAt: spec.closedAt,
      source: 'trial24',
      notes: '',
    });
    trial.status = 'purchased';
    trial.saleId = saleId;
    trial.depositRefunded = 0;
    logAudit(fakeDb, { action: AUDIT_ACTIONS.PURCHASE, actor: employee, ...auditBase, at: spec.closedAt, oldStatus: 'active', newStatus: 'purchased', deviceOldStatus: 'on_trial', deviceNewStatus: 'sold', meta: { saleId, salePrice, seeded: true } });
    device.status = DEVICE_STATUS.SOLD;
    device.soldAt = spec.closedAt;
    device.soldViaTrialId = trial.id;
  } else if (spec.outcome === 'returned') {
    trial.status = 'returned';
    trial.depositRefunded = spec.deposit;
    trial.returnCheck = {
      at: spec.closedAt,
      by: employee.id,
      byName: employee.name,
      checks: { powersOn: true, imeiVerified: true, accessoriesComplete: true, noNewDamage: true, functionalOk: true },
      conditionIssue: false,
      issueNotes: '',
      comparedWithSnapshotAt: spec.startAt,
      lateBy: Math.max(0, spec.closedAt - trial.endAt),
    };
    logAudit(fakeDb, { action: AUDIT_ACTIONS.RETURN, actor: employee, ...auditBase, at: spec.closedAt, oldStatus: 'active', newStatus: 'returned', deviceOldStatus: 'on_trial', deviceNewStatus: 'available', meta: { seeded: true } });
    device.status = DEVICE_STATUS.AVAILABLE;
  } else if (spec.outcome === 'cancelled') {
    trial.status = 'cancelled';
    trial.cancelReason = spec.cancelReason || 'إلغاء بطلب العميل';
    trial.depositRefunded = spec.deposit;
    logAudit(fakeDb, { action: AUDIT_ACTIONS.CANCEL, actor: data.users[0], ...auditBase, at: spec.closedAt, oldStatus: 'active', newStatus: 'cancelled', deviceOldStatus: 'on_trial', deviceNewStatus: 'available', reason: trial.cancelReason, meta: { seeded: true } });
    device.status = DEVICE_STATUS.AVAILABLE;
  } else {
    // تجربة مفتوحة: يبقى الجهاز مقفولًا
    device.status = DEVICE_STATUS.ON_TRIAL;
    device.currentTrialId = trial.id;
  }

  if (spec.outcome && spec.outcome !== 'open') {
    trial.closedAt = spec.closedAt;
    trial.closedBy = employee.id;
    trial.actualDurationMs = spec.closedAt - spec.startAt;
    trial.updatedAt = spec.closedAt;
    // التذكير أُرسل تاريخيًا قبل الإغلاق
    trial.reminderSentAt = Math.min(trial.endAt - settings.reminderBeforeMinutes * MINUTE_MS, spec.closedAt);
  }

  data.trials.push(trial);
  return trial;
}

function demoTrials(data, now) {
  const H = HOUR_MS;
  const D = 24 * H;
  let seq = 0;

  const history = [
    { deviceId: 'dev_001', customerId: 'cus_001', employeeId: 'usr_ahmed', startAt: now - 21 * D, closedAt: now - 20 * D + 3 * H, outcome: 'purchased', deposit: 200000 },
    { deviceId: 'dev_007', customerId: 'cus_002', employeeId: 'usr_zaid', startAt: now - 19 * D, closedAt: now - 18 * D, outcome: 'returned', deposit: 100000 },
    { deviceId: 'dev_002', customerId: 'cus_003', employeeId: 'usr_ahmed', startAt: now - 17 * D, closedAt: now - 16 * D + 2 * H, outcome: 'purchased', deposit: 250000, salePrice: 2100000, discount: 50000 },
    { deviceId: 'dev_005', customerId: 'cus_004', employeeId: 'usr_noor', startAt: now - 15 * D, closedAt: now - 14 * D - 4 * H, outcome: 'returned', deposit: 80000 },
    { deviceId: 'dev_007', customerId: 'cus_005', employeeId: 'usr_ahmed', startAt: now - 13 * D, closedAt: now - 12 * D + 6 * H, outcome: 'purchased', deposit: 100000, extensions: [{ at: now - 12 * D, hours: 12, reason: 'العميل يريد تجربة الكاميرا ليلًا' }] },
    { deviceId: 'dev_010', customerId: 'cus_006', employeeId: 'usr_zaid', startAt: now - 11 * D, closedAt: now - 10 * D, outcome: 'returned', deposit: 70000 },
    { deviceId: 'dev_004', customerId: 'cus_007', employeeId: 'usr_noor', startAt: now - 9 * D, closedAt: now - 8 * D + 1 * H, outcome: 'purchased', deposit: 150000 },
    { deviceId: 'dev_008', customerId: 'cus_001', employeeId: 'usr_ahmed', startAt: now - 8 * D, closedAt: now - 7 * D, outcome: 'returned', deposit: 100000 },
    { deviceId: 'dev_007', customerId: 'cus_003', employeeId: 'usr_zaid', startAt: now - 6 * D, closedAt: now - 5 * D + 2 * H, outcome: 'purchased', deposit: 100000 },
    { deviceId: 'dev_011', customerId: 'cus_004', employeeId: 'usr_noor', startAt: now - 5 * D, closedAt: now - 4 * D - 2 * H, outcome: 'cancelled', deposit: 60000, cancelReason: 'العميل ألغى بسبب سفر مفاجئ' },
    { deviceId: 'dev_005', customerId: 'cus_005', employeeId: 'usr_ahmed', startAt: now - 4 * D, closedAt: now - 3 * D + 5 * H, outcome: 'returned', deposit: 80000, extensions: [{ at: now - 3 * D, hours: 6, reason: 'تأخر العميل بسبب العمل' }] },
    { deviceId: 'dev_010', customerId: 'cus_007', employeeId: 'usr_zaid', startAt: now - 3 * D, closedAt: now - 2 * D + 30 * MINUTE_MS, outcome: 'purchased', deposit: 70000 },
  ];

  for (const spec of history) {
    seq += 1;
    seedTrial(data, spec, seq);
  }

  // بعد التاريخ: أعِد فتح الأجهزة المُباعة تجريبيًا لتبقى متاحة للعرض
  for (const dev of data.devices) {
    if (dev.status === DEVICE_STATUS.SOLD) {
      dev.status = DEVICE_STATUS.AVAILABLE;
      dev.soldAt = null;
      dev.soldViaTrialId = null;
    }
  }

  // تجارب مفتوحة الآن — تغطي حالات العدّاد الأربع
  const open = [
    { deviceId: 'dev_003', customerId: 'cus_002', employeeId: 'usr_ahmed', startAt: now - 3 * H, outcome: 'open', deposit: 150000, notes: 'العميل يوازن بين iPhone 15 و S24' }, // Normal
    { deviceId: 'dev_008', customerId: 'cus_005', employeeId: 'usr_zaid', startAt: now - 22 * H, outcome: 'open', deposit: 100000 }, // Ending soon
    { deviceId: 'dev_013', customerId: 'cus_006', employeeId: 'usr_noor', startAt: now - 23 * H - 25 * MINUTE_MS, outcome: 'open', deposit: 200000 }, // Critical
    { deviceId: 'dev_009', customerId: 'cus_007', employeeId: 'usr_ahmed', startAt: now - 30 * H, outcome: 'open', deposit: 60000, notes: 'العميل لم يراجع بعد انتهاء المدة' }, // سينتقل إلى Expired عند أول دورة للمجدول
  ];
  for (const spec of open) {
    seq += 1;
    seedTrial(data, spec, seq);
  }
}

// ————————————————————————————————————————————————
// التنفيذ
// ————————————————————————————————————————————————

export function buildSeedData({ withDemo = true, now = Date.now() } = {}) {
  const data = structuredClone(EMPTY_DB);
  data.meta.createdAt = now;
  data.settings = structuredClone(DEFAULT_SETTINGS);
  data.users = USERS.map((u) => ({ ...u, extraPermissions: [], createdAt: now }));
  data.customers = CUSTOMERS.map((c) => ({
    ...c,
    blocked: Boolean(c.blocked),
    blockReason: c.blockReason || null,
    notes: '',
    createdAt: now,
  }));
  data.devices = DEVICES.map((d) => buildDevice(d, now));
  if (withDemo) demoTrials(data, now);
  return data;
}

export function seed({ force = false, withDemo = true } = {}) {
  const exists = fs.existsSync(DB_FILE);
  if (exists && !force) {
    return { created: false, message: 'قاعدة البيانات موجودة — استخدم --force لإعادة التهيئة.' };
  }
  db.data = buildSeedData({ withDemo });
  db.persist();
  return {
    created: true,
    message: `تمت التهيئة: ${db.data.devices.length} جهاز، ${db.data.customers.length} عميل، ${db.data.trials.length} تجربة.`,
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const force = process.argv.includes('--force');
  const withDemo = !process.argv.includes('--empty');
  const result = seed({ force, withDemo });
  console.log(result.message);
}
