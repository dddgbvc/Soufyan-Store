import type { StepDirection } from '../lib/motion';
import { DEFAULT_MODULES, REQUIRED_MODULES } from '../lib/modules';
import type {
  AuthView,
  FieldErrors,
  LoginValues,
  ModuleKey,
  RecoverValues,
  RegisterValues,
  RequestStatus,
  SuccessPayload,
} from '../types/auth';

/* ==========================================================================
   مصدر الحقيقة الوحيد لحالة المصادقة
   كل الشاشات تقرأ من هنا وتكتب عبر الإجراءات أدناه — بلا حالة محلية موازية.
   ========================================================================== */

export const REGISTER_STEPS = 3;
export const RECOVER_STEPS = 3;

export type FormKey = 'login' | 'register' | 'recover';

export interface AuthState {
  /** الشاشة الجذرية المعروضة. */
  view: AuthView;
  /** اتجاه آخر انتقال، يغذّي حركة الانزلاق الواعية بـ RTL. */
  direction: StepDirection;
  /** فهرس الخطوة الحالية (يبدأ من صفر). */
  registerStep: number;
  recoverStep: number;

  login: LoginValues;
  register: RegisterValues;
  recover: RecoverValues;

  errors: {
    login: FieldErrors<LoginValues>;
    register: FieldErrors<RegisterValues>;
    recover: FieldErrors<RecoverValues>;
  };

  /** حالة الطلب الجاري (يُستخدم لتعطيل الأزرار وعرض المؤشر). */
  status: RequestStatus;
  /** حمولة شاشة النجاح، أو null قبل اكتمال أي مسار. */
  success: SuccessPayload | null;
  /** طابع زمني لآخر إرسال لرمز التحقق، لضبط مؤقّت إعادة الإرسال. */
  otpSentAt: number | null;
}

export const initialAuthState: AuthState = {
  view: 'login',
  direction: 1,
  registerStep: 0,
  recoverStep: 0,

  login: {
    identifier: '',
    password: '',
    keepSignedIn: true,
  },

  register: {
    fullName: '',
    workEmail: '',
    masterPassword: '',
    confirmPassword: '',
    companyName: '',
    sector: 'telecom',
    currency: 'IQD',
    registers: 2,
    modules: [...DEFAULT_MODULES],
  },

  recover: {
    identifier: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  },

  errors: { login: {}, register: {}, recover: {} },
  status: 'idle',
  success: null,
  otpSentAt: null,
};

/* -------------------------- الإجراءات -------------------------- */

export type AuthAction =
  | { type: 'view/go'; view: AuthView; direction?: StepDirection }
  | { type: 'login/patch'; patch: Partial<LoginValues> }
  | { type: 'register/patch'; patch: Partial<RegisterValues> }
  | { type: 'recover/patch'; patch: Partial<RecoverValues> }
  | { type: 'register/toggleModule'; key: ModuleKey }
  | { type: 'errors/set'; form: 'login'; errors: FieldErrors<LoginValues> }
  | { type: 'errors/set'; form: 'register'; errors: FieldErrors<RegisterValues> }
  | { type: 'errors/set'; form: 'recover'; errors: FieldErrors<RecoverValues> }
  | { type: 'errors/merge'; form: FormKey; field: string; message: string | undefined }
  | { type: 'errors/clear'; form: FormKey }
  | { type: 'step/next'; flow: 'register' | 'recover' }
  | { type: 'step/prev'; flow: 'register' | 'recover' }
  | { type: 'status/set'; status: RequestStatus }
  | { type: 'success/set'; payload: SuccessPayload }
  | { type: 'otp/sent'; at: number }
  | { type: 'reset' };

/* -------------------------- المخفّض -------------------------- */

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'view/go': {
      if (action.view === state.view) return state;
      return {
        ...state,
        view: action.view,
        direction: action.direction ?? 1,
        status: 'idle',
        // إعادة ضبط الخطوات عند مغادرة المسار حتى لا يعود المستخدم لمنتصفه.
        registerStep: action.view === 'register' ? 0 : state.registerStep,
        recoverStep: action.view === 'recover' ? 0 : state.recoverStep,
        errors: { login: {}, register: {}, recover: {} },
      };
    }

    case 'login/patch':
      return { ...state, login: { ...state.login, ...action.patch } };

    case 'register/patch':
      return { ...state, register: { ...state.register, ...action.patch } };

    case 'recover/patch':
      return { ...state, recover: { ...state.recover, ...action.patch } };

    case 'register/toggleModule': {
      // الوحدات الإلزامية لا تُلغى — النواة والدفتر شرط تشغيل المنظومة.
      if (REQUIRED_MODULES.includes(action.key)) return state;

      const active = state.register.modules.includes(action.key);
      const modules = active
        ? state.register.modules.filter((key) => key !== action.key)
        : [...state.register.modules, action.key];

      return { ...state, register: { ...state.register, modules } };
    }

    case 'errors/set':
      return { ...state, errors: { ...state.errors, [action.form]: action.errors } };

    case 'errors/merge': {
      const next: Record<string, string | undefined> = { ...state.errors[action.form] };
      if (action.message) {
        next[action.field] = action.message;
      } else {
        delete next[action.field];
      }
      return { ...state, errors: { ...state.errors, [action.form]: next } };
    }

    case 'errors/clear':
      return { ...state, errors: { ...state.errors, [action.form]: {} } };

    case 'step/next': {
      const base = { ...state, direction: 1 as StepDirection, status: 'idle' as RequestStatus };
      return action.flow === 'register'
        ? { ...base, registerStep: Math.min(state.registerStep + 1, REGISTER_STEPS - 1) }
        : { ...base, recoverStep: Math.min(state.recoverStep + 1, RECOVER_STEPS - 1) };
    }

    case 'step/prev': {
      const base = { ...state, direction: -1 as StepDirection, status: 'idle' as RequestStatus };
      return action.flow === 'register'
        ? { ...base, registerStep: Math.max(state.registerStep - 1, 0) }
        : { ...base, recoverStep: Math.max(state.recoverStep - 1, 0) };
    }

    case 'status/set':
      return { ...state, status: action.status };

    case 'success/set':
      return { ...state, view: 'success', direction: 1, status: 'success', success: action.payload };

    case 'otp/sent':
      return { ...state, otpSentAt: action.at };

    case 'reset':
      return { ...initialAuthState };

    default: {
      // فحص شمولية: أي إجراء جديد بلا معالجة يُنتج خطأ ترجمة.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
