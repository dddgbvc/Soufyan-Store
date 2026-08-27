/* =====================================================================
   PinLoginScreen — نسخة React / TypeScript
   تستخدم نفس ورقة التنسيقات: ../assets/pin-login.css
   الحركة عبر framer-motion بسبرنغات مخمّدة (bounce: 0) لا مُدد ثابتة.
   ===================================================================== */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";

import "../assets/pin-login.css";

/* ------------------------------- الأنواع ------------------------------- */

export interface PinLoginResult {
  success: boolean;
  employeeName?: string;
  roleName?: string;
  /** رسالة خطأ من الخادم تحلّ محل النص الافتراضي */
  message?: string;
}

export interface PinLoginScreenProps {
  /** يُنادى عند التأكيد؛ يُرجع نتيجة التحقّق من الخادم */
  onSuccess: (pin: string) => Promise<PinLoginResult>;
  onForgotPin: () => void;
  onPasskeyLogin: () => void;
  systemName?: string;
  /** طول الرمز المرن: 4 إلى 8 */
  minLength?: number;
  maxLength?: number;
  /** يُنادى لحظة نجاح التحقّق — لتفجير شبكة الخلفية مثلاً */
  onVerified?: () => void;
  /** يُنادى بعد استقرار بطاقة الترحيب — نقطة الانتقال للشاشة التالية */
  onFinish?: () => void;
}

type Status = "idle" | "busy" | "error" | "done";

/* ------------------------------ الأيقونات ------------------------------ */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M12 2.5 4.5 5.2v6.4c0 4.6 3.2 7.9 7.5 9.3 4.3-1.4 7.5-4.7 7.5-9.3V5.2L12 2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);

const BackspaceIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M20 5H9.6a2 2 0 0 0-1.45.62l-4.7 4.98a2 2 0 0 0 0 2.8l4.7 4.98A2 2 0 0 0 9.6 19H20a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
    <path d="m13 9.5 4 5M17 9.5l-4 5" />
  </svg>
);

const ClearIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M4.5 7.5h15" />
    <path d="M9.5 7.5V5.8A1.8 1.8 0 0 1 11.3 4h1.4a1.8 1.8 0 0 1 1.8 1.8v1.7" />
    <path d="M6.8 7.5 7.7 18a2 2 0 0 0 2 1.9h4.6a2 2 0 0 0 2-1.9l.9-10.5" />
  </svg>
);

const KeyIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <circle cx="8" cy="12" r="3.5" />
    <path d="M11.5 12H20M17.5 12v3M14.5 12v2" />
  </svg>
);

const QrIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.6" />
    <path d="M14 14h2.6v2.6H14zM20.5 14v2.6M14 20.5h2.6M20.5 20.5h.01" />
  </svg>
);

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.2M12 16.3h.01" />
  </svg>
);

/* --------------------- خلفية الشبكة التقنية (اختيارية) --------------------- */

export function TechnicalBackdrop({ burst = false }: { burst?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__glow backdrop__glow--cool" />
      <div className="backdrop__glow backdrop__glow--warm" />
      <motion.svg
        className="backdrop__grid"
        xmlns="http://www.w3.org/2000/svg"
        animate={
          burst && !reduced
            ? { scale: 2.5, opacity: 0, filter: "blur(4px)" }
            : { scale: 1, opacity: 1, filter: "blur(0px)" }
        }
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
      >
        <defs>
          <pattern id="grid-fine" width="44" height="44" patternUnits="userSpaceOnUse">
            <path className="grid-line grid-line--fine" d="M44 0H0v44" fill="none" strokeWidth="0.6" />
          </pattern>
          <pattern id="grid-major" width="176" height="176" patternUnits="userSpaceOnUse">
            <rect width="176" height="176" fill="url(#grid-fine)" />
            <path className="grid-line grid-line--major" d="M176 0H0v176" fill="none" strokeWidth="1" />
          </pattern>
          <radialGradient id="grid-vignette" cx="50%" cy="50%" r="72%">
            <stop className="grid-fade" offset="35%" stopOpacity="0" />
            <stop className="grid-fade" offset="100%" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-major)" />
        <rect width="100%" height="100%" fill="url(#grid-vignette)" />
      </motion.svg>
    </div>
  );
}

/* ------------------------------- المكوّن ------------------------------- */

const clampLength = (n: number) => Math.max(4, Math.min(8, n));

export default function PinLoginScreen({
  onSuccess,
  onForgotPin,
  onPasskeyLogin,
  systemName = "نظام نقاط البيع",
  minLength = 4,
  maxLength = 6,
  onVerified,
  onFinish,
}: PinLoginScreenProps) {
  const min = clampLength(minLength);
  const max = Math.max(min, clampLength(maxLength));

  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState("");
  const [employee, setEmployee] = useState<PinLoginResult | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);

  const reduced = useReducedMotion();
  const dotsControls = useAnimationControls();
  const titleId = useRef(`pin-${Math.random().toString(36).slice(2, 8)}`).current;

  /* الطول الظاهر: نقطة مفرغة إضافية تلمّح أن الرمز يقبل المزيد من الأرقام */
  const shownDots = pin.length < min ? min : pin.length < max ? pin.length + 1 : max;
  const ready = pin.length >= min;

  const fail = useCallback(
    (message: string) => {
      setNotice(message);
      setStatus("error");
      if (!reduced) {
        dotsControls.start({
          x: [0, -11, 9, -6, 3, 0],
          transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
        });
      }
    },
    [dotsControls, reduced]
  );

  const submit = useCallback(async () => {
    if (status === "busy" || status === "done") return;

    if (pin.length < min) {
      fail(`الرمز لا يقل عن ${min} أرقام`);
      return;
    }

    setStatus("busy");
    setNotice("");

    try {
      const result = await onSuccess(pin);
      if (result?.success) {
        setStatus("done");
        setEmployee(result);
        onVerified?.();
      } else {
        setPin("");
        fail(result?.message || "الرمز غير صحيح. حاول مرة أخرى.");
      }
    } catch {
      fail("تعذّر الاتصال بالخادم. حاول مجدداً.");
    }
  }, [fail, min, onSuccess, onVerified, pin, status]);

  const press = useCallback(
    (key: string) => {
      if (status === "busy" || status === "done") return;

      setPin((current) => {
        if (key === "back") return current.slice(0, -1);
        if (key === "clear") return "";
        if (!/^[0-9]$/.test(key) || current.length >= max) return current;
        return current + key;
      });

      setStatus((s) => (s === "error" ? "idle" : s));
      setNotice("");
    },
    [max, status]
  );

  /* الرمز ثابت الطول → دخول تلقائي، وهو المسار الأسرع للكاشير */
  useEffect(() => {
    if (min === max && pin.length === max && status === "idle") void submit();
  }, [max, min, pin, status, submit]);

  /* لوحة المفاتيح المادية */
  useEffect(() => {
    if (status === "done") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const flash = (k: string) => {
        setPressed(k);
        setTimeout(() => setPressed(null), 110);
      };

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault(); flash(e.key); press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault(); flash("back"); press("back");
      } else if (e.key === "Escape" || e.key === "Delete") {
        e.preventDefault(); flash("clear"); press("clear");
      } else if (e.key === "Enter") {
        e.preventDefault(); void submit();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [press, status, submit]);

  const keys: Array<{ value: string; label: string; node: ReactNode; utility?: boolean }> = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
      value: String(n), label: String(n), node: String(n),
    })),
    { value: "clear", label: "مسح الرمز بالكامل", node: <ClearIcon />, utility: true },
    { value: "0", label: "0", node: "0" },
    { value: "back", label: "حذف آخر رقم", node: <BackspaceIcon />, utility: true },
  ];

  const spring = { type: "spring" as const, duration: 0.32, bounce: 0 };

  return (
    <div className="stage">
      {/* layout: البطاقة تبقى مكانها ويتحرّك ارتفاعها — نفس السطح، لا قفزة مكانية */}
      <motion.section layout className="card" aria-labelledby={titleId}>
        {/* popLayout يرفع الطبقة الخارجة من التدفّق فتدخل الجديدة فوراً بلا انهيار في الارتفاع */}
        <AnimatePresence mode="popLayout" initial={false}>
          {status !== "done" ? (
            <motion.div
              key="login"
              className="card__view"
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.12 }}
            >
              <header className="header">
                <div className="header__mark" aria-hidden="true"><ShieldIcon /></div>
                <div>
                  <h1 className="header__title" id={titleId}>{systemName}</h1>
                  <p className="header__subtitle">أدخل رمزك للمتابعة</p>
                </div>
              </header>

              <motion.div
                className="dots"
                dir="ltr"
                role="img"
                animate={dotsControls}
                data-state={status === "busy" ? "busy" : status === "error" ? "error" : "idle"}
                aria-label={`رمز الدخول: ${pin.length} من ${shownDots} أرقام`}
              >
                {Array.from({ length: shownDots }, (_, i) => {
                  const filled = i < pin.length;
                  return (
                    // المفتاح يتغيّر عند الامتلاء فتُعاد التهيئة وتنطلق نبضة السبرنغ
                    <motion.span
                      key={`${i}-${filled ? "on" : "off"}`}
                      className="dot"
                      data-filled={filled}
                      data-next={status !== "busy" && i === pin.length}
                      data-optional={i >= min}
                      initial={{ scale: filled ? 1.42 : 1 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.3, bounce: 0.34 }}
                    />
                  );
                })}
              </motion.div>

              <p className="notice" data-tone={status === "error" ? "error" : "idle"} role="status">
                <span className="notice__icon"><AlertIcon /></span>
                <span>{notice}</span>
              </p>

              <div className="keypad" dir="ltr" role="group" aria-label="لوحة إدخال الرمز">
                {keys.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    className={k.utility ? "key key--utility" : "key"}
                    aria-label={k.label}
                    data-pressed={pressed === k.value || undefined}
                    onClick={() => press(k.value)}
                  >
                    {k.node}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="submit"
                data-ready={ready}
                data-busy={status === "busy"}
                onClick={() => void submit()}
              >
                {status === "busy" && <span className="submit__spinner" />}
                <span>{status === "busy" ? "جارٍ التحقّق" : "دخول"}</span>
              </button>

              <div className="helpers">
                <button type="button" className="helper" onClick={onForgotPin}>
                  <KeyIcon /><span>نسيت الرمز؟</span>
                </button>
                <button type="button" className="helper" onClick={onPasskeyLogin}>
                  <QrIcon /><span>الدخول بالهاتف</span>
                </button>
              </div>

              <p className="hint">
                <strong>Enter</strong> للدخول · <strong>Backspace</strong> حذف ·{" "}
                <strong>Esc</strong> مسح الكل
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="welcome"
              className="card__view"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(5px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={spring}
              onAnimationComplete={onFinish}
            >
              <div className="welcome">
                <motion.div
                  className="welcome__seal"
                  initial={{ scale: 0.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.36, bounce: 0.3 }}
                >
                  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.6} aria-hidden="true">
                    <motion.path
                      className="welcome__check"
                      d="m6.5 12.4 3.7 3.7 7.3-8.2"
                      initial={{ strokeDashoffset: 30 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ type: "spring", duration: 0.34, bounce: 0 }}
                    />
                  </svg>
                </motion.div>

                <h2 className="welcome__title" role="status">
                  أهلاً بك، {employee?.employeeName || "زميلنا"} 👋
                </h2>

                {employee?.roleName && (
                  <span className="welcome__role">{employee.roleName}</span>
                )}

                <div className="welcome__progress">
                  <motion.span
                    className="welcome__bar"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ type: "spring", duration: 0.55, bounce: 0 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
