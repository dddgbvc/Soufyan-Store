/**
 * ناقل BroadcastChannel — يربط نوافذ/تبويبات على نفس الأصل (same origin).
 *
 * هذا هو الناقل الافتراضي لأنه لا يحتاج أي خادم: شاشة الكاشير وشاشة الزبون
 * تعملان على الجهاز نفسه في الغالب (شاشة ثانية موصولة بجهاز الكاشير).
 */

import { envelope, isValidMessage } from './protocol.js';

export function createBroadcastAdapter({ channel = 'yaqoot-pos' } = {}) {
  /** @type {BroadcastChannel|null} */
  let bus = null;

  return {
    name: 'broadcast',

    isSupported() {
      return typeof BroadcastChannel === 'function';
    },

    /** @param {{ onMessage:(m:any)=>void, onStatus:(s:string, detail?:any)=>void }} handlers */
    start(handlers) {
      if (!this.isSupported()) throw new Error('BroadcastChannel غير مدعوم في هذا المتصفّح');

      bus = new BroadcastChannel(channel);
      bus.addEventListener('message', (event) => {
        if (isValidMessage(event.data)) handlers.onMessage(event.data);
      });

      handlers.onStatus('connected', { channel });
      // نطلب لقطة حالية من الكاشير فور الإقلاع
      this.send(envelope('hello'));
    },

    send(message) {
      bus?.postMessage(message);
    },

    stop() {
      bus?.close();
      bus = null;
    },
  };
}
