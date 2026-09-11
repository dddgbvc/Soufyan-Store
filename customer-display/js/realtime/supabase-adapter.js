/**
 * ناقل Supabase Realtime — اختياري بالكامل.
 *
 * المشروع الحالي (متجر سفيان) لا يستخدم Supabase، لذلك هذا المحوّل:
 *   • لا يُحمَّل ولا يتّصل بالإنترنت إطلاقًا ما لم تُضبط url + anonKey في config.js
 *   • يستورد مكتبة supabase-js ديناميكيًا عند التفعيل فقط
 *
 * الجدول المتوقّع (عدّله كما يناسب مخططك):
 *
 *   create table pos_display_sessions (
 *     terminal_id text primary key,
 *     status      text not null default 'idle',
 *     items       jsonb not null default '[]'::jsonb,
 *     discount    numeric not null default 0,
 *     tax_rate    numeric,
 *     paid        numeric not null default 0,
 *     invoice_number text,
 *     cashier     text,
 *     message     text,
 *     updated_at  timestamptz not null default now()
 *   );
 *   alter publication supabase_realtime add table pos_display_sessions;
 *
 * الكاشير يكتب صفًا واحدًا لكل نقطة بيع، والشاشة تتابع تغييراته.
 */

import { envelope } from './protocol.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2';

export function createSupabaseAdapter({ url, anonKey, table, terminalId, esmUrl = SUPABASE_ESM } = {}) {
  /** @type {any} */
  let client = null;
  /** @type {any} */
  let subscription = null;

  return {
    name: 'supabase',

    isSupported() {
      return Boolean(url && anonKey && table && terminalId);
    },

    async start(handlers) {
      if (!this.isSupported()) throw new Error('إعدادات Supabase غير مكتملة');
      handlers.onStatus('connecting', { table, terminalId });

      const { createClient } = await import(/* @vite-ignore */ esmUrl);
      client = createClient(url, anonKey, { auth: { persistSession: false } });

      // اللقطة الأولى
      const { data, error } = await client.from(table).select('*').eq('terminal_id', terminalId).maybeSingle();
      if (error) handlers.onStatus('error', { error });
      else if (data) handlers.onMessage(envelope('session', data));

      // ثم التغييرات اللحظية
      subscription = client
        .channel(`display:${terminalId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `terminal_id=eq.${terminalId}` },
          (payload) => {
            const row = payload.new ?? payload.old;
            if (row) handlers.onMessage(envelope('session', row));
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') handlers.onStatus('connected', { table, terminalId });
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            handlers.onStatus('error', { status });
          }
        });
    },

    /** الشاشة للعرض فقط؛ لا تكتب في قاعدة البيانات. */
    send() {},

    stop() {
      subscription?.unsubscribe?.();
      subscription = null;
      client = null;
    },
  };
}
