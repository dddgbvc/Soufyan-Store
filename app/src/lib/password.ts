import type { PasswordStrength, StrengthLevel } from '../types/auth';
import { normalizeDigits } from './validation';

/* ==========================================================================
   قياس قوة كلمة المرور — تقييم لحظي أثناء الكتابة
   ========================================================================== */

/** أنماط شائعة تُضعف كلمة المرور مهما بلغ طولها. */
const WEAK_PATTERNS = [
  /^(.)\1+$/, // محرف مكرّر
  /12345|23456|34567|45678|56789|09876|98765/,
  /qwerty|asdfgh|zxcvbn|password|admin|welcome|iraq|samarra/i,
];

const LEVEL_LABELS: Record<StrengthLevel, string> = {
  0: 'ضعيفة جدًا',
  1: 'ضعيفة',
  2: 'متوسطة',
  3: 'قوية',
  4: 'قوية جدًا',
};

/**
 * يحسب درجة القوة (0–4) اعتمادًا على التنوّع والطول، مع خصم للأنماط الشائعة.
 * التقييم محلي بالكامل — لا تغادر كلمة المرور المتصفح أثناء القياس.
 */
export function evaluatePassword(rawValue: string): PasswordStrength {
  const value = normalizeDigits(rawValue);

  const checks = [
    { id: 'length', label: '٨ محارف فأكثر', passed: value.length >= 8 },
    { id: 'case', label: 'أحرف كبيرة وصغيرة', passed: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { id: 'digit', label: 'رقم واحد على الأقل', passed: /[0-9]/.test(value) },
    { id: 'symbol', label: 'رمز خاص (@ # $ …)', passed: /[^A-Za-z0-9\s]/.test(value) },
  ];

  if (!value) {
    return { score: 0, label: LEVEL_LABELS[0], percent: 0, checks };
  }

  let points = checks.filter((check) => check.passed).length;

  // مكافأة الطول الفعلي
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;

  // خصم الأنماط المتوقعة
  if (WEAK_PATTERNS.some((pattern) => pattern.test(value))) {
    points = Math.min(points, 1);
  }
  if (value.length < 8) {
    points = Math.min(points, 1);
  }

  const score = Math.max(0, Math.min(4, points - 1)) as StrengthLevel;

  return {
    score,
    label: LEVEL_LABELS[score],
    percent: value.length === 0 ? 0 : ((score + 1) / 5) * 100,
    checks,
  };
}

/** ألوان الشريط لكل درجة — تُستخدم أيضًا في نص الحالة. */
export const STRENGTH_STYLES: Record<StrengthLevel, { bar: string; text: string }> = {
  0: { bar: 'bg-rose-500', text: 'text-rose-300' },
  1: { bar: 'bg-rose-400', text: 'text-rose-300' },
  2: { bar: 'bg-amber-400', text: 'text-amber-300' },
  3: { bar: 'bg-beam-500', text: 'text-beam-400' },
  4: { bar: 'bg-verify-500', text: 'text-verify-400' },
};
