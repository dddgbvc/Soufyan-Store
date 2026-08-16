import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { StepDirection } from '../lib/motion';
import { countLedgerAccounts, countPosSessions, countTables } from '../lib/modules';
import {
  validateCompanyName,
  validateFullName,
  validateIdentifier,
  validateLoginPassword,
  validateMasterPassword,
  validateEmail,
  validateOtp,
  validatePasswordMatch,
} from '../lib/validation';
import { AuthError, mockAuthService, type AuthService } from '../services/authService';
import type {
  AuthView,
  FieldErrors,
  LoginValues,
  ModuleKey,
  RecoverValues,
  RegisterValues,
} from '../types/auth';
import {
  authReducer,
  initialAuthState,
  REGISTER_STEPS,
  RECOVER_STEPS,
  type AuthState,
  type FormKey,
} from './authMachine';

/* ==========================================================================
   مزوّد الحالة — يجمع المخفّض مع تنسيق الطلبات غير المتزامنة
   المكوّنات تبقى عرضية بالكامل: تقرأ الحالة وتستدعي أفعالًا مسمّاة.
   ========================================================================== */

interface AuthContextValue {
  state: AuthState;

  /** التنقل بين الشاشات الجذرية. */
  goTo: (view: AuthView, direction?: StepDirection) => void;

  /** تحديث الحقول (تحديث جزئي، يمسح خطأ الحقل المعدَّل). */
  patchLogin: (patch: Partial<LoginValues>) => void;
  patchRegister: (patch: Partial<RegisterValues>) => void;
  patchRecover: (patch: Partial<RecoverValues>) => void;
  toggleModule: (key: ModuleKey) => void;

  /** تحقق فوري عند مغادرة الحقل (blur) بدل الانتظار للإرسال. */
  validateField: (form: FormKey, field: string) => void;

  submitLogin: () => Promise<void>;
  advanceRegister: () => Promise<void>;
  retreatRegister: () => void;
  advanceRecover: () => Promise<void>;
  retreatRecover: () => void;
  resendOtp: () => Promise<void>;
  reset: () => void;

  /** أدوات مساعدة للعرض. */
  isBusy: boolean;
  registerProgress: number;
  recoverProgress: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  /** يسمح بحقن تنفيذ خادم حقيقي مكان المحاكاة. */
  service?: AuthService;
}

export function AuthProvider({ children, service = mockAuthService }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  /* ----------------------------- التنقل ----------------------------- */

  const goTo = useCallback((view: AuthView, direction: StepDirection = 1) => {
    dispatch({ type: 'view/go', view, direction });
  }, []);

  /* ----------------------------- التحديث ----------------------------- */

  const clearTouched = useCallback((form: FormKey, patch: object) => {
    for (const field of Object.keys(patch)) {
      dispatch({ type: 'errors/merge', form, field, message: undefined });
    }
  }, []);

  const patchLogin = useCallback(
    (patch: Partial<LoginValues>) => {
      dispatch({ type: 'login/patch', patch });
      clearTouched('login', patch);
    },
    [clearTouched],
  );

  const patchRegister = useCallback(
    (patch: Partial<RegisterValues>) => {
      dispatch({ type: 'register/patch', patch });
      clearTouched('register', patch);
    },
    [clearTouched],
  );

  const patchRecover = useCallback(
    (patch: Partial<RecoverValues>) => {
      dispatch({ type: 'recover/patch', patch });
      clearTouched('recover', patch);
    },
    [clearTouched],
  );

  const toggleModule = useCallback((key: ModuleKey) => {
    dispatch({ type: 'register/toggleModule', key });
  }, []);

  /* --------------------------- قواعد التحقق --------------------------- */

  const validateField = useCallback(
    (form: FormKey, field: string) => {
      const message = fieldMessage(state, form, field);
      dispatch({ type: 'errors/merge', form, field, message });
    },
    [state],
  );

  /* --------------------------- تسجيل الدخول --------------------------- */

  const submitLogin = useCallback(async () => {
    const errors: FieldErrors<LoginValues> = {};
    errors.identifier = validateIdentifier(state.login.identifier);
    errors.password = validateLoginPassword(state.login.password);

    if (hasErrors(errors)) {
      dispatch({ type: 'errors/set', form: 'login', errors: pruneErrors(errors) });
      return;
    }

    dispatch({ type: 'errors/clear', form: 'login' });
    dispatch({ type: 'status/set', status: 'pending' });

    try {
      await service.signIn(state.login);
      dispatch({
        type: 'success/set',
        payload: {
          kind: 'signed-in',
          title: 'تم تسجيل الدخول',
          message: 'جارٍ تحضير مساحة العمل وتحميل لوحة التحكم.',
        },
      });
    } catch (error) {
      applyError(error, 'login');
    }
  }, [service, state.login]);

  /* --------------------------- معالج التهيئة --------------------------- */

  const advanceRegister = useCallback(async () => {
    const errors = validateRegisterStep(state.register, state.registerStep);

    if (hasErrors(errors)) {
      dispatch({ type: 'errors/set', form: 'register', errors: pruneErrors(errors) });
      return;
    }

    dispatch({ type: 'errors/clear', form: 'register' });

    if (state.registerStep < REGISTER_STEPS - 1) {
      dispatch({ type: 'step/next', flow: 'register' });
      return;
    }

    dispatch({ type: 'status/set', status: 'pending' });

    try {
      await service.provisionTenant(state.register);
      const tables = countTables(state.register.modules);
      const ledger = countLedgerAccounts(state.register.sector, state.register.modules);

      dispatch({
        type: 'success/set',
        payload: {
          kind: 'provisioned',
          title: 'اكتملت تهيئة المنظومة',
          message: `تم تجهيز «${state.register.companyName.trim()}» بنجاح وربطها بلوحة التحكم.`,
          facts: [
            { label: 'جداول قاعدة البيانات', value: String(tables) },
            { label: 'سجلات نقاط البيع', value: String(state.register.registers) },
            { label: 'حسابات دفتر الأستاذ', value: String(ledger) },
            { label: 'جلسات بيع متزامنة', value: String(countPosSessions(state.register.registers)) },
          ],
        },
      });
    } catch (error) {
      applyError(error, 'register');
    }
  }, [service, state.register, state.registerStep]);

  const retreatRegister = useCallback(() => {
    if (state.registerStep === 0) {
      goTo('login', -1);
      return;
    }
    dispatch({ type: 'step/prev', flow: 'register' });
  }, [goTo, state.registerStep]);

  /* -------------------------- استعادة كلمة المرور -------------------------- */

  const advanceRecover = useCallback(async () => {
    const errors = validateRecoverStep(state.recover, state.recoverStep);

    if (hasErrors(errors)) {
      dispatch({ type: 'errors/set', form: 'recover', errors: pruneErrors(errors) });
      return;
    }

    dispatch({ type: 'errors/clear', form: 'recover' });
    dispatch({ type: 'status/set', status: 'pending' });

    try {
      if (state.recoverStep === 0) {
        await service.requestOtp(state.recover.identifier);
        dispatch({ type: 'otp/sent', at: Date.now() });
        dispatch({ type: 'step/next', flow: 'recover' });
        return;
      }

      if (state.recoverStep === 1) {
        await service.verifyOtp({ identifier: state.recover.identifier, otp: state.recover.otp });
        dispatch({ type: 'step/next', flow: 'recover' });
        return;
      }

      await service.resetPassword(state.recover);
      dispatch({
        type: 'success/set',
        payload: {
          kind: 'password-reset',
          title: 'تم تحديث كلمة المرور',
          message: 'يمكنك الآن الدخول بكلمة المرور الجديدة. تم إنهاء الجلسات الأخرى للحماية.',
        },
      });
    } catch (error) {
      applyError(error, 'recover');
    }
  }, [service, state.recover, state.recoverStep]);

  const retreatRecover = useCallback(() => {
    if (state.recoverStep === 0) {
      goTo('login', -1);
      return;
    }
    dispatch({ type: 'step/prev', flow: 'recover' });
  }, [goTo, state.recoverStep]);

  const resendOtp = useCallback(async () => {
    dispatch({ type: 'status/set', status: 'pending' });
    try {
      await service.requestOtp(state.recover.identifier);
      dispatch({ type: 'otp/sent', at: Date.now() });
      dispatch({ type: 'status/set', status: 'idle' });
    } catch (error) {
      applyError(error, 'recover');
    }
  }, [service, state.recover.identifier]);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  /* --------------------------- معالجة الأخطاء --------------------------- */

  function applyError(error: unknown, form: FormKey) {
    const message =
      error instanceof AuthError
        ? error.message
        : 'تعذّر إكمال العملية. تحقّق من الاتصال ثم أعد المحاولة.';
    const field = error instanceof AuthError && error.field ? error.field : 'form';

    dispatch({ type: 'errors/merge', form, field, message });
    dispatch({ type: 'status/set', status: 'error' });
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      goTo,
      patchLogin,
      patchRegister,
      patchRecover,
      toggleModule,
      validateField,
      submitLogin,
      advanceRegister,
      retreatRegister,
      advanceRecover,
      retreatRecover,
      resendOtp,
      reset,
      isBusy: state.status === 'pending',
      registerProgress: ((state.registerStep + 1) / REGISTER_STEPS) * 100,
      recoverProgress: ((state.recoverStep + 1) / RECOVER_STEPS) * 100,
    }),
    [
      state,
      goTo,
      patchLogin,
      patchRegister,
      patchRecover,
      toggleModule,
      validateField,
      submitLogin,
      advanceRegister,
      retreatRegister,
      advanceRecover,
      retreatRecover,
      resendOtp,
      reset,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** الوصول إلى حالة المصادقة — يرمي خطأً واضحًا خارج المزوّد. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>.');
  }
  return context;
}

/* ==========================================================================
   قواعد التحقق لكل خطوة
   ========================================================================== */

export function validateRegisterStep(
  values: RegisterValues,
  step: number,
): FieldErrors<RegisterValues> {
  const errors: FieldErrors<RegisterValues> = {};

  if (step === 0) {
    errors.fullName = validateFullName(values.fullName);
    errors.workEmail = validateEmail(values.workEmail);
    errors.masterPassword = validateMasterPassword(values.masterPassword);
    errors.confirmPassword = validatePasswordMatch(values.masterPassword, values.confirmPassword);
  }

  if (step === 1) {
    errors.companyName = validateCompanyName(values.companyName);
  }

  if (step === 2 && values.modules.length === 0) {
    errors.modules = 'اختر وحدة واحدة على الأقل للنشر.';
  }

  return errors;
}

export function validateRecoverStep(
  values: RecoverValues,
  step: number,
): FieldErrors<RecoverValues> {
  const errors: FieldErrors<RecoverValues> = {};

  if (step === 0) {
    errors.identifier = validateIdentifier(values.identifier);
  }

  if (step === 1) {
    errors.otp = validateOtp(values.otp);
  }

  if (step === 2) {
    errors.newPassword = validateMasterPassword(values.newPassword);
    errors.confirmPassword = validatePasswordMatch(values.newPassword, values.confirmPassword);
  }

  return errors;
}

/** رسالة التحقق لحقل مفرد — تُستخدم عند مغادرة الحقل. */
function fieldMessage(state: AuthState, form: FormKey, field: string): string | undefined {
  if (form === 'login') {
    if (field === 'identifier') return validateIdentifier(state.login.identifier);
    if (field === 'password') return validateLoginPassword(state.login.password);
    return undefined;
  }

  if (form === 'register') {
    const values = state.register;
    switch (field) {
      case 'fullName':
        return validateFullName(values.fullName);
      case 'workEmail':
        return validateEmail(values.workEmail);
      case 'masterPassword':
        return validateMasterPassword(values.masterPassword);
      case 'confirmPassword':
        return validatePasswordMatch(values.masterPassword, values.confirmPassword);
      case 'companyName':
        return validateCompanyName(values.companyName);
      default:
        return undefined;
    }
  }

  const values = state.recover;
  switch (field) {
    case 'identifier':
      return validateIdentifier(values.identifier);
    case 'otp':
      return validateOtp(values.otp);
    case 'newPassword':
      return validateMasterPassword(values.newPassword);
    case 'confirmPassword':
      return validatePasswordMatch(values.newPassword, values.confirmPassword);
    default:
      return undefined;
  }
}

function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

/** يزيل المفاتيح ذات القيم الفارغة حتى لا تُعرض رسائل غير موجودة. */
function pruneErrors<T extends Record<string, string | undefined>>(errors: T): T {
  const result = {} as Record<string, string>;
  for (const [key, message] of Object.entries(errors)) {
    if (message) result[key] = message;
  }
  return result as T;
}
