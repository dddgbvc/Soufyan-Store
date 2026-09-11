/**
 * مخزن الحالة — مصدر الحقيقة الوحيد لشاشة الزبون.
 * صغير عمدًا: لقطة + مشتركون. لا مكتبات ولا سحر.
 *
 * الواجهة لا تعدّل الحالة مباشرة أبدًا؛ الكاشير (عبر النقل اللحظي) أو الوضع
 * التجريبي هما من يرسل التحديثات.
 */

import { createEmptySession, mergeSession, normalizeSession } from '../data/session-schema.js';

export function createStore(initial = createEmptySession()) {
  let state = normalizeSession(initial);
  /** @type {Set<(state: any, previous: any) => void>} */
  const listeners = new Set();

  function notify(previous) {
    for (const listener of listeners) {
      try {
        listener(state, previous);
      } catch (error) {
        // مشترك واحد معطوب يجب ألا يُسقط بقية الشاشة
        console.error('[store] فشل أحد المشتركين:', error);
      }
    }
  }

  return {
    /** اللقطة الحالية (للقراءة فقط). */
    get() {
      return state;
    },

    /** يستبدل الجلسة بالكامل — تُستخدم عند وصول لقطة من الكاشير. */
    replace(session) {
      const previous = state;
      state = normalizeSession(session);
      notify(previous);
      return state;
    },

    /** يدمج تحديثًا جزئيًا فوق الحالة الحالية. */
    patch(partial) {
      const previous = state;
      state = mergeSession(state, partial);
      notify(previous);
      return state;
    },

    /** يعيد الشاشة إلى «بانتظار عملية جديدة». */
    reset(overrides = {}) {
      return this.replace(createEmptySession(overrides));
    },

    /** يشترك في التغييرات ويُستدعى فورًا باللقطة الحالية. */
    subscribe(listener, { immediate = true } = {}) {
      listeners.add(listener);
      if (immediate) listener(state, state);
      return () => listeners.delete(listener);
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
