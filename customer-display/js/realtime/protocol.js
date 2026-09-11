/**
 * بروتوكول الرسائل بين الكاشير وشاشة الزبون.
 * مقصود أن يكون بسيطًا بما يكفي ليُنفَّذ فوق أي ناقل:
 * BroadcastChannel أو WebSocket أو Supabase Realtime أو غيرها.
 *
 * الرسائل (الاتجاه: كاشير ← شاشة):
 *   { type:'session', payload: Session }   لقطة كاملة — الأولوية القصوى
 *   { type:'patch',   payload: Partial<Session> }  تحديث جزئي
 *   { type:'status',  payload: { status, message? } }  تغيير حالة فقط
 *   { type:'ping' }
 *
 * الرسائل (الاتجاه: شاشة ← كاشير):
 *   { type:'hello' }   الشاشة استيقظت وتطلب لقطة حالية
 *   { type:'pong' }
 *
 * كل رسالة تحمل  source  لتجاهل صدى الرسائل الصادرة من النافذة نفسها.
 */

export const MESSAGE_TYPES = /** @type {const} */ ([
  'session',
  'patch',
  'status',
  'hello',
  'ping',
  'pong',
]);

/** معرّف فريد لهذه النافذة — يمنع معالجة صدى رسائلنا. */
export const SOURCE_ID = `cd-${Math.random().toString(36).slice(2, 10)}`;

export function envelope(type, payload = null) {
  return { protocol: 'yaqoot-pos/1', type, payload, source: SOURCE_ID, at: Date.now() };
}

/** يتحقق من صلاحية الرسالة ويرفض صدى نفس النافذة. */
export function isValidMessage(message) {
  return Boolean(
    message &&
      typeof message === 'object' &&
      message.protocol === 'yaqoot-pos/1' &&
      MESSAGE_TYPES.includes(message.type) &&
      message.source !== SOURCE_ID,
  );
}
