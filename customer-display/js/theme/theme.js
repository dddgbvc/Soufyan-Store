/**
 * مزامنة السمة مع البرنامج الرئيسي.
 *
 * شاشة الزبون لا تملك سمة خاصة بها إطلاقًا. هي تعكس ما يختاره البرنامج
 * الرئيسي، عبر ثلاث قنوات تعمل معًا:
 *
 *   1) localStorage["theme"]  — نفس المفتاح ونفس القيم (light | dark | auto)
 *      المستخدمة في واجهة المتجر. حدث `storage` يصل فورًا لكل تبويب مفتوح
 *      على نفس الأصل، فينعكس التبديل خلال أجزاء من الثانية.
 *   2) BroadcastChannel("yaqoot-theme") — مزامنة فورية بين النوافذ، ومفيدة
 *      حين يعمل الكاشير والشاشة في نافذتين منفصلتين.
 *   3) prefers-color-scheme — عندما يكون الوضع "auto".
 *
 * النتيجة تُطبَّق على  <html data-theme="light|dark">  وهو نفس العقد الذي
 * تعتمده أوراق الأنماط في design-tokens.css.
 */

/** @typedef {'light'|'dark'|'auto'} ThemeMode */

export function createThemeSync({ storageKey = 'theme', channel = 'yaqoot-theme', fallback = 'auto' } = {}) {
  const root = document.documentElement;
  const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  /** @type {BroadcastChannel|null} */
  let bus = null;
  /** @type {Set<(mode: ThemeMode, resolved: 'light'|'dark') => void>} */
  const listeners = new Set();

  /** @type {ThemeMode} */
  let mode = readStoredMode() ?? fallback;

  function readStoredMode() {
    try {
      const value = globalThis.localStorage?.getItem(storageKey);
      return value === 'light' || value === 'dark' || value === 'auto' ? value : null;
    } catch {
      return null; // وضع التصفّح الخاص أو تخزين محظور
    }
  }

  function resolve(next = mode) {
    if (next === 'auto') return media?.matches ? 'dark' : 'light';
    return next;
  }

  /**
   * يطبّق السمة مع إيقاف الانتقالات لإطار واحد.
   * بدون ذلك تتغيّر كل الألوان والظلال معًا فيبدو التبديل «ملطّخًا».
   */
  function apply({ animate = true } = {}) {
    const resolved = resolve();
    if (root.dataset.theme === resolved) return resolved;

    if (animate) {
      root.classList.add('theme-switching');
      void root.offsetWidth;
    }

    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.remove('theme-switching'));
      });
    }

    for (const listener of listeners) listener(mode, resolved);
    return resolved;
  }

  function setMode(next, { broadcast = true, persist = true } = {}) {
    if (next !== 'light' && next !== 'dark' && next !== 'auto') return;
    mode = next;

    if (persist) {
      try {
        globalThis.localStorage?.setItem(storageKey, next);
      } catch {
        /* التخزين قد يكون محظورًا — المزامنة تستمر عبر القناة */
      }
    }
    if (broadcast) bus?.postMessage({ type: 'theme', mode: next });
    apply();
  }

  return {
    get mode() {
      return mode;
    },
    get resolved() {
      return resolve();
    },

    /** يُستدعى قبل الرسم الأول لتفادي وميض السمة الخاطئة. */
    init({ override = null } = {}) {
      if (override) mode = override;
      apply({ animate: false });

      // (1) تغيّر من تبويب آخر على نفس الأصل — هذه هي المزامنة مع البرنامج الرئيسي
      globalThis.addEventListener('storage', (event) => {
        if (event.key !== storageKey) return;
        const value = event.newValue;
        if (value === 'light' || value === 'dark' || value === 'auto') {
          setMode(value, { broadcast: false, persist: false });
        }
      });

      // (2) قناة بث فورية
      if (typeof BroadcastChannel === 'function') {
        bus = new BroadcastChannel(channel);
        bus.addEventListener('message', (event) => {
          if (event.data?.type === 'theme') {
            setMode(event.data.mode, { broadcast: false, persist: false });
          }
        });
      }

      // (3) تفضيل النظام عندما يكون الوضع تلقائيًا
      media?.addEventListener('change', () => {
        if (mode === 'auto') apply();
      });

      // احتياط: بعض المتصفّحات لا تُطلق حدث storage بين النوافذ المنبثقة،
      // لذا نتحقّق من المفتاح عند عودة التركيز إلى الشاشة.
      globalThis.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const stored = readStoredMode();
        if (stored && stored !== mode) setMode(stored, { broadcast: false, persist: false });
      });

      return this;
    },

    setMode,

    /** يتنقّل بين فاتح ⇄ داكن (يُستخدم في الوضع التجريبي فقط). */
    toggle() {
      setMode(resolve() === 'dark' ? 'light' : 'dark');
      return resolve();
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
