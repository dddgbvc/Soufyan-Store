/**
 * طبقة النقل الموحّدة.
 *
 * الواجهة لا تعرف شيئًا عن الناقل المستخدم — تتلقّى جلسات فقط. لتبديل البنية
 * التحتية لاحقًا يكفي إضافة محوّل جديد هنا دون لمس أي مكوّن واجهة.
 */

import { createBroadcastAdapter } from './broadcast-adapter.js';
import { createWebSocketAdapter } from './websocket-adapter.js';
import { createSupabaseAdapter } from './supabase-adapter.js';
import { envelope } from './protocol.js';

/**
 * @param {import('../config.js').CONFIG['transport']} options
 * @param {{
 *   onSession:(session:any)=>void,
 *   onPatch:(patch:any)=>void,
 *   onConnection:(status:string, detail?:any)=>void,
 * }} handlers
 */
export function createTransport(options, handlers) {
  const adapter = pickAdapter(options);

  const bridge = {
    onMessage(message) {
      switch (message.type) {
        case 'session':
          handlers.onSession(message.payload);
          break;
        case 'patch':
          handlers.onPatch(message.payload);
          break;
        case 'status':
          handlers.onPatch(message.payload);
          break;
        case 'ping':
          adapter?.send(envelope('pong'));
          break;
        default:
          break;
      }
    },
    onStatus(status, detail) {
      handlers.onConnection(status, detail);
    },
  };

  return {
    get name() {
      return adapter?.name ?? 'none';
    },

    async start() {
      if (!adapter) {
        handlers.onConnection('offline', { reason: 'لا يوجد ناقل مُفعّل' });
        return;
      }
      try {
        await adapter.start(bridge);
      } catch (error) {
        console.warn('[transport] تعذّر بدء الناقل:', error);
        handlers.onConnection('offline', { error });
      }
    },

    /** يُستخدم من الوضع التجريبي أو محاكي الكاشير لبثّ جلسة. */
    send(type, payload) {
      adapter?.send(envelope(type, payload));
    },

    stop() {
      adapter?.stop();
    },
  };
}

function pickAdapter(options) {
  const candidates = {
    broadcast: () => createBroadcastAdapter({ channel: options.channel }),
    websocket: () => createWebSocketAdapter(options.websocket),
    supabase: () => createSupabaseAdapter(options.supabase),
  };

  if (options.mode === 'none') return null;

  if (options.mode !== 'auto') {
    const alias = options.mode === 'ws' ? 'websocket' : options.mode;
    const build = candidates[alias];
    if (!build) {
      console.warn(`[transport] ناقل غير معروف: ${options.mode} — سيُستخدم الاختيار التلقائي`);
    } else {
      const adapter = build();
      if (adapter.isSupported()) return adapter;
      console.warn(`[transport] الناقل «${alias}» غير متاح — سيُستخدم الاختيار التلقائي`);
    }
  }

  // تلقائي: الأكثر تحديدًا أولًا، ثم القناة المحلية كخيار دائم
  for (const key of ['supabase', 'websocket', 'broadcast']) {
    const adapter = candidates[key]();
    if (adapter.isSupported()) return adapter;
  }
  return null;
}
