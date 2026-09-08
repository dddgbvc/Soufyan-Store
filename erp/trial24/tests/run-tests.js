/**
 * Trial24 — اختبارات منطق الأعمال
 *
 *   node tests/run-tests.js
 *
 * تعمل على نسخة بيانات في الذاكرة (بلا كتابة على القرص) وتستدعي طبقة
 * الأعمال مباشرة — فهي تختبر القواعد نفسها التي تفرضها واجهة REST.
 */

import { db } from '../server/db.js';
import { buildSeedData } from '../server/seed.js';
import { HOUR_MS, MINUTE_MS } from '../server/util.js';
import {
  createTrial,
  returnTrial,
  purchaseTrial,
  extendTrial,
  approveExtension,
  rejectExtension,
  cancelTrial,
  runDueJobs,
  dashboard,
  decorate,
  listTrials,
  validateExtension,
} from '../server/domain/trials.js';
import { analytics } from '../server/domain/analytics.js';
import { deviceHistory } from '../server/domain/devices.js';
import { listAudit } from '../server/domain/audit.js';
import { listNotifications, unreadCount } from '../server/domain/notifications.js';

// ——————————————————————— إطار اختبار صغير ———————————————————————

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  reset();
  try {
    fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${err.message}`);
  }
}

function group(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'التوقع لم يتحقق');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'قيمة غير متوقعة'} — المتوقع ${JSON.stringify(expected)} والفعلي ${JSON.stringify(actual)}`);
  }
}

function near(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'خارج الهامش'} — المتوقع ~${expected} والفعلي ${actual}`);
  }
}

/** يتوقع رمز خطأ محددًا. */
function throwsCode(fn, code, message) {
  try {
    fn();
  } catch (err) {
    if (err.code === code) return err;
    throw new Error(`${message || ''} — توقّعنا ${code} لكن جاء ${err.code || err.message}`);
  }
  throw new Error(`${message || ''} — توقّعنا خطأ ${code} لكن نجحت العملية`);
}

// ——————————————————————— تهيئة بيئة الاختبار ———————————————————————

const MANAGER = 'usr_manager';
const EMPLOYEE = 'usr_ahmed';

function reset() {
  db.data = buildSeedData({ withDemo: false });
  db.persist = () => {}; // بلا كتابة على القرص أثناء الاختبار
  db.mutate = (fn) => fn(db.data);
}

const user = (id) => db.find('users', id);
const device = (id) => db.find('devices', id);
const trial = (id) => db.find('trials', id);

/** إنشاء تجربة صالحة بأقل مدخلات. */
function makeTrial(overrides = {}) {
  const d = device(overrides.deviceId || 'dev_001');
  return createTrial(db, user(overrides.actor || EMPLOYEE), {
    customerId: overrides.customerId || 'cus_001',
    deviceId: d.id,
    imei: overrides.imei ?? d.imei,
    deposit: overrides.deposit ?? 200000,
    termsAccepted: overrides.termsAccepted ?? true,
    durationHours: overrides.durationHours,
    ...overrides.extra,
  });
}

// ═══════════════════════════════════════════════════════════
group('إنشاء التجربة');

test('المدة الافتراضية 24 ساعة محسوبة من وقت الخادم', () => {
  const before = Date.now();
  const t = makeTrial();
  const after = Date.now();
  assert(t.startAt >= before && t.startAt <= after, 'وقت البدء ليس وقت الخادم');
  equal(t.endAt - t.startAt, 24 * HOUR_MS, 'المدة ليست 24 ساعة');
  equal(t.baseDurationHours, 24);
  equal(t.status, 'active');
});

test('الجهاز يُقفل: available ← on_trial', () => {
  const t = makeTrial();
  const d = device('dev_001');
  equal(d.status, 'on_trial', 'حالة الجهاز لم تتغيّر');
  equal(d.currentTrialId, t.id, 'التجربة الحالية غير مربوطة بالجهاز');
});

test('لا يمكن إخراج الجهاز نفسه لعميل آخر أثناء التجربة', () => {
  makeTrial();
  throwsCode(
    () => makeTrial({ customerId: 'cus_003' }),
    'DEVICE_NOT_AVAILABLE',
    'سُمح بتجربة ثانية على جهاز مقفول'
  );
});

test('الجهاز المحجوز أو في الصيانة لا يخرج للتجربة', () => {
  throwsCode(() => makeTrial({ deviceId: 'dev_012' }), 'DEVICE_NOT_AVAILABLE'); // محجوز
  throwsCode(() => makeTrial({ deviceId: 'dev_014' }), 'DEVICE_NOT_AVAILABLE'); // صيانة
});

test('IMEI غير مطابق يُرفض (التحقق بالبيانات لا بالصور)', () => {
  throwsCode(() => makeTrial({ imei: '111111111111111' }), 'IMEI_MISMATCH');
  equal(device('dev_001').status, 'available', 'الجهاز قُفل رغم فشل التحقق');
});

test('الرقم التسلسلي يُقبل بديلًا عن IMEI', () => {
  const t = makeTrial({ imei: device('dev_001').serial });
  equal(t.verifiedField, 'serial');
});

test('IMEI بمسافات أو شرطات أو أرقام عربية يُطبَّع ويُقبل', () => {
  const raw = device('dev_001').imei;
  const spaced = `${raw.slice(0, 6)} ${raw.slice(6, 10)}-${raw.slice(10)}`;
  const t = makeTrial({ imei: spaced });
  equal(t.verifiedField, 'imei');
});

test('العميل الموقوف يُرفض', () => {
  throwsCode(() => makeTrial({ customerId: 'cus_008' }), 'CUSTOMER_BLOCKED');
});

test('لا تجربتان مفتوحتان للعميل نفسه', () => {
  makeTrial();
  throwsCode(() => makeTrial({ deviceId: 'dev_005', imei: device('dev_005').imei }), 'CUSTOMER_HAS_OPEN_TRIAL');
});

test('العربون أقل من الحد الأدنى يُرفض', () => {
  throwsCode(() => makeTrial({ deposit: 1000 }), 'DEPOSIT_TOO_LOW');
});

test('عدم إقرار الشروط يمنع الإنشاء', () => {
  throwsCode(() => makeTrial({ termsAccepted: false }), 'TERMS_NOT_ACCEPTED');
});

test('نسخة الشروط ولقطة حالة الجهاز تُحفظان داخل التجربة', () => {
  const t = makeTrial();
  equal(t.terms.version, db.settings.termsVersion);
  equal(t.deviceSnapshot.batteryHealth, device('dev_001').batteryHealth);
  equal(t.deviceSnapshot.imei, device('dev_001').imei);
  assert(Array.isArray(t.deviceSnapshot.accessories), 'الملحقات غير مسجّلة في اللقطة');
});

test('إنشاء التجربة يسجّل حدثي تدقيق: إنشاء + إخراج جهاز', () => {
  const t = makeTrial();
  const rows = listAudit(db, { trialId: t.id });
  const actions = rows.map((r) => r.action);
  assert(actions.includes('TRIAL_CREATE'), 'حدث الإنشاء غير مسجّل');
  assert(actions.includes('DEVICE_RELEASE'), 'حدث إخراج الجهاز غير مسجّل');
  const release = rows.find((r) => r.action === 'DEVICE_RELEASE');
  equal(release.deviceOldStatus, 'available');
  equal(release.deviceNewStatus, 'on_trial');
});

test('المدير يتلقّى إشعار «تم إخراج جهاز للتجربة» ببياناته كاملة', () => {
  const t = makeTrial();
  const notes = listNotifications(db, MANAGER);
  const started = notes.find((n) => n.event === 'TRIAL_STARTED');
  assert(started, 'لم يصل إشعار للمدير');
  for (const key of ['customer', 'device', 'imei', 'employee', 'startAt', 'endAt', 'durationHours', 'deposit']) {
    assert(started.data[key] !== undefined, `بيانات الإشعار ناقصة: ${key}`);
  }
  assert(started.customerChannel?.whatsappUrl, 'لا توجد رسالة جاهزة للعميل');
  equal(unreadCount(db, MANAGER) > 0, true);
});

// ═══════════════════════════════════════════════════════════
group('الصلاحيات');

test('الموظف لا يستطيع الإلغاء', () => {
  const t = makeTrial();
  throwsCode(() => cancelTrial(db, user(EMPLOYEE), t.id, { reason: 'x' }), 'PERMISSION_DENIED');
});

test('الموظف لا يستطيع تجاوز السياسة', () => {
  const t = makeTrial();
  throwsCode(
    () => extendTrial(db, user(EMPLOYEE), t.id, { hours: 5, reason: 'x', override: true, overrideReason: 'y' }),
    'OVERRIDE_DENIED'
  );
});

test('تجاوز السياسة بلا سبب مكتوب يُرفض حتى للمدير', () => {
  const t = makeTrial();
  throwsCode(
    () => extendTrial(db, user(MANAGER), t.id, { hours: 48, reason: 'x', override: true }),
    'OVERRIDE_REASON_REQUIRED'
  );
});

// ═══════════════════════════════════════════════════════════
group('التمديد');

test('طلب الموظف يُنشئ طلبًا معلّقًا ويُشعر المدير', () => {
  const t = makeTrial();
  const res = extendTrial(db, user(EMPLOYEE), t.id, { hours: 12, reason: 'العميل يحتاج وقتًا' });
  equal(res.status, 'pending_approval');
  equal(res.request.status, 'pending');
  equal(trial(t.id).endAt, t.endAt, 'تم التمديد قبل موافقة المدير');
  const notes = listNotifications(db, MANAGER);
  assert(notes.some((n) => n.event === 'TRIAL_EXTENSION_REQUESTED'), 'لم يصل إشعار للمدير');
});

test('موافقة المدير تُطبّق التمديد وتُعيد الحالة إلى جارية', () => {
  const t = makeTrial();
  const res = extendTrial(db, user(EMPLOYEE), t.id, { hours: 12, reason: 'سبب' });
  const applied = approveExtension(db, user(MANAGER), res.request.id, {});
  equal(applied.status, 'extended');
  equal(trial(t.id).endAt - t.endAt, 12 * HOUR_MS, 'موعد النهاية لم يتغيّر بمقدار التمديد');
  equal(trial(t.id).extensions.length, 1);
  equal(trial(t.id).reminderSentAt, null, 'لم يُعَد ضبط التذكير للموعد الجديد');
});

test('رفض المدير يُبقي الموعد كما هو ويُسجَّل', () => {
  const t = makeTrial();
  const res = extendTrial(db, user(EMPLOYEE), t.id, { hours: 12, reason: 'سبب' });
  rejectExtension(db, user(MANAGER), res.request.id, { note: 'الجهاز محجوز لعميل آخر' });
  equal(trial(t.id).endAt, t.endAt);
  assert(
    listAudit(db, { trialId: t.id }).some((r) => r.action === 'EXTENSION_REJECTED'),
    'الرفض غير مسجّل في التدقيق'
  );
});

test('المدير يمدّد مباشرة بلا طلب', () => {
  const t = makeTrial();
  const res = extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: 'قرار إداري' });
  equal(res.status, 'extended');
  equal(trial(t.id).endAt - t.endAt, 6 * HOUR_MS);
});

test('تجاوز الحد الأقصى للتمديد الواحد يُرفض', () => {
  const t = makeTrial();
  throwsCode(() => extendTrial(db, user(MANAGER), t.id, { hours: 48, reason: 'x' }), 'EXTENSION_NOT_ALLOWED');
});

test('تجاوز عدد التمديدات المسموح يُرفض', () => {
  const t = makeTrial();
  extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: '1' });
  extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: '2' });
  equal(trial(t.id).extensions.length, db.settings.maxExtensions);
  throwsCode(() => extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: '3' }), 'EXTENSION_NOT_ALLOWED');
});

test('تجاوز المدة الكلية القصوى يُرفض', () => {
  const t = makeTrial();
  const check = validateExtension(db, trial(t.id), 60);
  assert(!check.ok, 'قُبل تمديد يتجاوز المدة الكلية');
  assert(check.errors.some((e) => e.code === 'MAX_TOTAL_DURATION'), 'سبب الرفض غير صحيح');
});

test('المدير يتجاوز الحدود بسبب مكتوب ويُسجَّل التجاوز', () => {
  const t = makeTrial();
  extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: '1' });
  extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: '2' });
  const res = extendTrial(db, user(MANAGER), t.id, {
    hours: 6,
    reason: 'استثناء',
    override: true,
    overrideReason: 'موافقة إدارة عليا',
  });
  equal(res.status, 'extended');
  equal(trial(t.id).extensions.length, 3);
  assert(
    listAudit(db, { trialId: t.id }).some((r) => r.action === 'POLICY_OVERRIDE'),
    'التجاوز غير مسجّل في التدقيق'
  );
});

test('طلب موظف يخالف السياسة يُرفض عند مصدره ولا يُرفع للمدير', () => {
  const t = makeTrial();
  throwsCode(() => extendTrial(db, user(EMPLOYEE), t.id, { hours: 48, reason: 'x' }), 'EXTENSION_NOT_ALLOWED');
  equal(db.data.extensionRequests.length, 0, 'أُنشئ طلب مخالف للسياسة');
});

test('التمديد يُعيد التجربة المنتهية إلى الحالة الجارية', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() - MINUTE_MS;
  runDueJobs(db);
  equal(trial(t.id).status, 'expired');
  extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: 'العميل تأخّر' });
  equal(trial(t.id).status, 'active');
  equal(trial(t.id).expiredAt, null);
});

// ═══════════════════════════════════════════════════════════
group('المجدول: التذكير والانتهاء');

test('التذكير يُرسل قبل ساعة من النهاية مرة واحدة فقط', () => {
  const t = makeTrial();
  const row = trial(t.id);
  row.endAt = Date.now() + 59 * MINUTE_MS; // داخل نافذة التذكير

  const first = runDueJobs(db);
  equal(first.fired.reminders.length, 1, 'لم يُرسل التذكير');
  assert(row.reminderSentAt, 'وقت التذكير غير مسجّل');

  const second = runDueJobs(db);
  equal(second.fired.reminders.length, 0, 'تكرّر التذكير');

  const notes = listNotifications(db, MANAGER);
  const reminder = notes.find((n) => n.event === 'TRIAL_ENDING_SOON');
  assert(reminder, 'إشعار التذكير غير موجود');
  assert(reminder.customerChannel?.message, 'لا توجد رسالة تذكير للعميل');
  assert(
    listAudit(db, { trialId: t.id }).some((r) => r.action === 'REMINDER_SENT'),
    'التذكير غير مسجّل في التدقيق'
  );
});

test('لا تذكير قبل موعده', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() + 3 * HOUR_MS;
  equal(runDueJobs(db).fired.reminders.length, 0);
});

test('انتهاء المدة يحوّل الحالة ويُشعر المدير والموظفين والعميل', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() - MINUTE_MS;

  const res = runDueJobs(db);
  equal(res.fired.expirations.length, 1);
  equal(trial(t.id).status, 'expired');
  assert(trial(t.id).expiredAt, 'وقت الانتهاء غير مسجّل');

  const managerNote = listNotifications(db, MANAGER).find((n) => n.event === 'TRIAL_EXPIRED');
  const staffNote = listNotifications(db, EMPLOYEE).find((n) => n.event === 'TRIAL_EXPIRED');
  assert(managerNote, 'المدير لم يُشعَر');
  assert(staffNote, 'الموظف المخوّل لم يُشعَر');
  assert(managerNote.customerChannel?.message, 'رسالة العميل غير مُعدّة');
  assert(
    listAudit(db, { trialId: t.id }).some((r) => r.action === 'TRIAL_EXPIRE' && r.newStatus === 'expired'),
    'الانتهاء غير مسجّل في التدقيق'
  );
});

test('المجدول يعالج المتأخرات بعد توقف الخادم', () => {
  const t = makeTrial();
  // محاكاة تجربة انتهت أثناء توقف الخدمة
  const row = trial(t.id);
  row.startAt = Date.now() - 30 * HOUR_MS;
  row.endAt = Date.now() - 6 * HOUR_MS;

  runDueJobs(db);
  equal(row.status, 'expired', 'لم تُعالج التجربة المتأخرة عند التشغيل');
  const expireLog = listAudit(db, { trialId: t.id }).find((r) => r.action === 'TRIAL_EXPIRE');
  equal(expireLog.meta.reminderSkipped, true, 'لم يُسجَّل تخطّي التذكير');
});

test('الجهاز يبقى مقفولًا بعد انتهاء المدة (بانتظار الإرجاع)', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() - MINUTE_MS;
  runDueJobs(db);
  equal(device('dev_001').status, 'on_trial', 'الجهاز حُرِّر تلقائيًا بلا استلام فعلي');
});

// ═══════════════════════════════════════════════════════════
group('الإرجاع');

test('الإرجاع يعيد الجهاز للمخزون ويُغلق التجربة', () => {
  const t = makeTrial();
  const d = device('dev_001');
  const closed = returnTrial(db, user(EMPLOYEE), t.id, { imei: d.imei });
  equal(closed.status, 'returned');
  equal(device('dev_001').status, 'available');
  equal(device('dev_001').currentTrialId, null);
  equal(closed.depositRefunded, 200000, 'العربون لم يُعَد كاملًا');
  assert(closed.actualDurationMs >= 0, 'المدة الفعلية غير محسوبة');
});

test('الإرجاع بـ IMEI خاطئ يُرفض', () => {
  const t = makeTrial();
  throwsCode(() => returnTrial(db, user(EMPLOYEE), t.id, { imei: '999999999999999' }), 'IMEI_MISMATCH');
  equal(trial(t.id).status, 'active');
});

test('فحص حالة غير مطابق يستوجب ملاحظة مكتوبة', () => {
  const t = makeTrial();
  const d = device('dev_001');
  throwsCode(
    () => returnTrial(db, user(EMPLOYEE), t.id, { imei: d.imei, accessoriesComplete: false }),
    'ISSUE_NOTES_REQUIRED'
  );
});

test('الاستقطاع من العربون يُحسب ويُسجَّل', () => {
  const t = makeTrial();
  const d = device('dev_001');
  const closed = returnTrial(db, user(EMPLOYEE), t.id, {
    imei: d.imei,
    accessoriesComplete: false,
    issueNotes: 'الشاحن مفقود',
    depositDeduction: 15000,
  });
  equal(closed.depositRefunded, 185000);
  equal(closed.returnCheck.conditionIssue, true);
});

test('الاستقطاع الأكبر من العربون يُرفض', () => {
  const t = makeTrial();
  const d = device('dev_001');
  throwsCode(
    () => returnTrial(db, user(EMPLOYEE), t.id, { imei: d.imei, depositDeduction: 500000 }),
    'DEDUCTION_TOO_HIGH'
  );
});

test('التأخير عن الموعد يُقاس ويُسجَّل عند الاستلام', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() - 2 * HOUR_MS;
  runDueJobs(db);
  const closed = returnTrial(db, user(EMPLOYEE), t.id, { imei: device('dev_001').imei });
  near(closed.returnCheck.lateBy, 2 * HOUR_MS, 5000, 'زمن التأخير غير صحيح');
});

// ═══════════════════════════════════════════════════════════
group('الشراء');

test('التجربة تتحوّل إلى بيع مع الاحتفاظ برابط التجربة', () => {
  const t = makeTrial();
  const d = device('dev_001');
  const { trial: closed, sale } = purchaseTrial(db, user(EMPLOYEE), t.id, { imei: d.imei });

  equal(closed.status, 'purchased');
  equal(closed.saleId, sale.id);
  equal(sale.trialId, t.id, 'الفاتورة لا تشير إلى التجربة الأصلية');
  equal(sale.trialCode, t.code);
  equal(sale.imei, d.imei);
  equal(device('dev_001').status, 'sold');
  equal(device('dev_001').soldViaTrialId, t.id);
});

test('العربون يُحتسب من قيمة الفاتورة', () => {
  const t = makeTrial({ deposit: 200000 });
  const d = device('dev_001');
  const { sale } = purchaseTrial(db, user(EMPLOYEE), t.id, {
    imei: d.imei,
    salePrice: 1750000,
    discount: 50000,
    paidNow: 0,
  });
  equal(sale.netPrice, 1700000);
  equal(sale.depositApplied, 200000);
  equal(sale.balanceDue, 1500000);
});

test('الخصم الأكبر من السعر يُرفض', () => {
  const t = makeTrial();
  throwsCode(
    () => purchaseTrial(db, user(EMPLOYEE), t.id, { imei: device('dev_001').imei, salePrice: 100000, discount: 200000 }),
    'DISCOUNT_TOO_HIGH'
  );
});

test('تجربة منتهية الوقت يمكن تحويلها إلى بيع', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() - MINUTE_MS;
  runDueJobs(db);
  const { trial: closed } = purchaseTrial(db, user(EMPLOYEE), t.id, { imei: device('dev_001').imei });
  equal(closed.status, 'purchased');
});

// ═══════════════════════════════════════════════════════════
group('الإلغاء والحالات النهائية');

test('المدير يلغي التجربة ويعيد الجهاز للمخزون', () => {
  const t = makeTrial();
  const closed = cancelTrial(db, user(MANAGER), t.id, { reason: 'العميل انسحب' });
  equal(closed.status, 'cancelled');
  equal(device('dev_001').status, 'available');
  equal(closed.depositRefunded, 200000);
});

test('الإلغاء بلا سبب يُرفض', () => {
  const t = makeTrial();
  throwsCode(() => cancelTrial(db, user(MANAGER), t.id, {}), 'REASON_REQUIRED');
});

test('لا يمكن التصرّف في تجربة مغلقة', () => {
  const t = makeTrial();
  const d = device('dev_001');
  returnTrial(db, user(EMPLOYEE), t.id, { imei: d.imei });
  throwsCode(() => returnTrial(db, user(EMPLOYEE), t.id, { imei: d.imei }), 'TRIAL_CLOSED');
  throwsCode(() => purchaseTrial(db, user(EMPLOYEE), t.id, { imei: d.imei }), 'TRIAL_CLOSED');
  throwsCode(() => extendTrial(db, user(MANAGER), t.id, { hours: 2, reason: 'x' }), 'TRIAL_CLOSED');
  throwsCode(() => cancelTrial(db, user(MANAGER), t.id, { reason: 'x' }), 'TRIAL_CLOSED');
});

test('الجهاز المُرجَع يمكن إخراجه لعميل آخر', () => {
  const t = makeTrial();
  returnTrial(db, user(EMPLOYEE), t.id, { imei: device('dev_001').imei });
  const t2 = makeTrial({ customerId: 'cus_003' });
  equal(t2.status, 'active');
  equal(device('dev_001').currentTrialId, t2.id);
});

// ═══════════════════════════════════════════════════════════
group('العدّاد ودرجات الإلحاح');

test('الوقت المتبقي يُشتق من وقت الخادم لا من العميل', () => {
  const t = makeTrial();
  const future = t.startAt + 4 * HOUR_MS;
  const view = decorate(db, trial(t.id), future);
  near(view.remainingMs, 20 * HOUR_MS, 1000, 'المتبقي غير صحيح');
  near(view.progress, 4 / 24, 0.01, 'نسبة التقدّم غير صحيحة');
});

test('درجات الإلحاح: طبيعي ← تقترب ← حرِجة ← منتهية', () => {
  const t = makeTrial();
  const row = trial(t.id);
  equal(decorate(db, row, row.startAt + HOUR_MS).urgency, 'normal');
  equal(decorate(db, row, row.endAt - 2 * HOUR_MS).urgency, 'ending_soon');
  equal(decorate(db, row, row.endAt - 30 * MINUTE_MS).urgency, 'critical');
  equal(decorate(db, row, row.endAt + MINUTE_MS).urgency, 'expired');
});

test('إعادة القراءة لا تُعيد ضبط التجربة', () => {
  const t = makeTrial();
  const first = decorate(db, trial(t.id), t.startAt + HOUR_MS);
  const second = decorate(db, trial(t.id), t.startAt + 2 * HOUR_MS);
  equal(first.startAt, second.startAt, 'وقت البدء تغيّر بين القراءتين');
  equal(first.endAt, second.endAt, 'وقت النهاية تغيّر بين القراءتين');
  equal(second.remainingMs, first.remainingMs - HOUR_MS, 'العدّاد لا يتقدّم مع وقت الخادم');
});

// ═══════════════════════════════════════════════════════════
group('لوحة المعلومات والتحليلات');

test('بطاقات اللوحة تعكس الحالات الفعلية', () => {
  const now = Date.now();
  const a = makeTrial({ customerId: 'cus_001', deviceId: 'dev_001' });
  const b = makeTrial({ customerId: 'cus_002', deviceId: 'dev_005', extra: {} });
  const c = makeTrial({ customerId: 'cus_003', deviceId: 'dev_007' });

  trial(b.id).endAt = now + 2 * HOUR_MS; // تقترب من النهاية
  trial(c.id).endAt = now - HOUR_MS; // منتهية
  runDueJobs(db, now);

  const cards = dashboard(db, now).cards;
  equal(cards.activeTrials, 2, 'عدد الجارية');
  equal(cards.expired, 1, 'عدد المنتهية');
  equal(cards.endingSoon, 1, 'عدد التي تقترب من النهاية');
  equal(cards.awaitingReturn, 3, 'الأجهزة خارج المتجر');

  purchaseTrial(db, user(EMPLOYEE), a.id, { imei: device('dev_001').imei });
  returnTrial(db, user(EMPLOYEE), b.id, { imei: device('dev_005').imei });
  const after = dashboard(db, now).cards;
  equal(after.convertedToSales, 1);
  equal(after.conversionRate, 50, 'نسبة التحويل = شراء ÷ (شراء + إرجاع)');
});

test('التحليلات تحسب النسب والمتوسطات من السجلات', () => {
  const a = makeTrial({ customerId: 'cus_001', deviceId: 'dev_001' });
  const b = makeTrial({ customerId: 'cus_002', deviceId: 'dev_005' });
  const c = makeTrial({ customerId: 'cus_003', deviceId: 'dev_007' });

  extendTrial(db, user(MANAGER), c.id, { hours: 6, reason: 'تمديد' });
  purchaseTrial(db, user(EMPLOYEE), a.id, { imei: device('dev_001').imei });
  returnTrial(db, user(EMPLOYEE), b.id, { imei: device('dev_005').imei });

  const stats = analytics(db);
  equal(stats.totals.totalTrials, 3);
  equal(stats.totals.purchased, 1);
  equal(stats.totals.returned, 1);
  equal(stats.rates.purchaseConversion, 50);
  equal(stats.rates.returnRate, 50);
  near(stats.rates.extensionRate, 33.3, 0.2, 'نسبة التمديد');
  assert(stats.mostTrialed.length >= 3, 'قائمة الأكثر تجربة فارغة');
  assert(stats.durations.avgDurationMs >= 0, 'متوسط المدة غير محسوب');
});

test('تاريخ الجهاز يعرض كل تجاربه بنتائجها', () => {
  const a = makeTrial({ customerId: 'cus_001', deviceId: 'dev_001' });
  returnTrial(db, user(EMPLOYEE), a.id, { imei: device('dev_001').imei });
  const b = makeTrial({ customerId: 'cus_002', deviceId: 'dev_001' });
  purchaseTrial(db, user(EMPLOYEE), b.id, { imei: device('dev_001').imei });

  const historyRows = deviceHistory(db, 'dev_001');
  equal(historyRows.length, 2);
  equal(historyRows[0].status, 'purchased', 'الأحدث أولًا');
  equal(historyRows[1].status, 'returned');
  assert(historyRows[0].saleId, 'رقم الفاتورة غير مربوط بتاريخ الجهاز');
});

test('قائمة التجارب تُرتّب المفتوحة أولًا بالأقرب انتهاءً', () => {
  const now = Date.now();
  const a = makeTrial({ customerId: 'cus_001', deviceId: 'dev_001' });
  const b = makeTrial({ customerId: 'cus_002', deviceId: 'dev_005' });
  trial(a.id).endAt = now + 10 * HOUR_MS;
  trial(b.id).endAt = now + 2 * HOUR_MS;
  const c = makeTrial({ customerId: 'cus_003', deviceId: 'dev_007' });
  returnTrial(db, user(EMPLOYEE), c.id, { imei: device('dev_007').imei });

  const rows = listTrials(db, { status: 'all' }, now);
  equal(rows[0].id, b.id, 'الأقرب انتهاءً ليست أولًا');
  equal(rows[1].id, a.id);
  equal(rows[2].id, c.id, 'المغلقة ليست في الأخير');
});

// ═══════════════════════════════════════════════════════════
group('سجل التدقيق');

test('دورة حياة كاملة تُسجَّل بكل انتقالاتها', () => {
  const t = makeTrial();
  trial(t.id).endAt = Date.now() + 30 * MINUTE_MS;
  runDueJobs(db); // تذكير
  trial(t.id).endAt = Date.now() - MINUTE_MS;
  runDueJobs(db); // انتهاء
  extendTrial(db, user(MANAGER), t.id, { hours: 6, reason: 'تمديد' });
  purchaseTrial(db, user(EMPLOYEE), t.id, { imei: device('dev_001').imei });

  const actions = listAudit(db, { trialId: t.id }).map((r) => r.action);
  for (const expected of [
    'TRIAL_CREATE',
    'DEVICE_RELEASE',
    'REMINDER_SENT',
    'TRIAL_EXPIRE',
    'TRIAL_EXTENSION',
    'TRIAL_PURCHASE',
  ]) {
    assert(actions.includes(expected), `الحدث غير مسجّل: ${expected}`);
  }
});

test('كل سطر تدقيق يحمل المنفّذ والوقت والجهاز والعميل والحالتين', () => {
  const t = makeTrial();
  returnTrial(db, user(EMPLOYEE), t.id, { imei: device('dev_001').imei });
  const row = listAudit(db, { trialId: t.id }).find((r) => r.action === 'TRIAL_RETURN');
  equal(row.actorId, EMPLOYEE);
  equal(row.actorName, user(EMPLOYEE).name);
  assert(row.at > 0, 'الوقت غير مسجّل');
  equal(row.deviceId, 'dev_001');
  equal(row.customerId, 'cus_001');
  equal(row.oldStatus, 'active');
  equal(row.newStatus, 'returned');
  equal(row.deviceOldStatus, 'on_trial');
  equal(row.deviceNewStatus, 'available');
});

// ——————————————————————— النتيجة ———————————————————————

console.log('');
console.log('═'.repeat(52));
if (failed) {
  console.log(`\x1b[31mفشل ${failed}\x1b[0m من أصل ${passed + failed} اختبارًا`);
  for (const f of failures) console.log(`  • ${f.name}: ${f.err.message}`);
  process.exit(1);
}
console.log(`\x1b[32mنجحت كل الاختبارات\x1b[0m — ${passed} اختبارًا`);
