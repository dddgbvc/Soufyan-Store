/**
 * ناقل WebSocket — للربط بخادم نقطة بيع حقيقي عبر الشبكة.
 * يتضمّن إعادة اتصال تصاعدية (exponential backoff) حتى لا تبقى الشاشة معلّقة.
 *
 * التفعيل:  customer-display/?transport=ws&ws=wss://pos.example.com/display
 * أو بضبط  CONFIG.transport.websocket.url
 */

import { envelope, isValidMessage } from './protocol.js';

export function createWebSocketAdapter({ url, reconnectBaseMs = 1000, reconnectMaxMs = 15000 } = {}) {
  /** @type {WebSocket|null} */
  let socket = null;
  let attempt = 0;
  let closedByUs = false;
  let reconnectTimer = 0;
  /** @type {any} */
  let handlers = null;

  function scheduleReconnect() {
    if (closedByUs) return;
    attempt += 1;
    const delay = Math.min(reconnectBaseMs * 2 ** (attempt - 1), reconnectMaxMs);
    handlers?.onStatus('reconnecting', { attempt, delay });
    reconnectTimer = globalThis.setTimeout(open, delay);
  }

  function open() {
    try {
      socket = new WebSocket(url);
    } catch (error) {
      handlers?.onStatus('error', { error });
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      attempt = 0;
      handlers?.onStatus('connected', { url });
      socket?.send(JSON.stringify(envelope('hello')));
    });

    socket.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // رسالة غير صالحة تُتجاهل بهدوء بدل إسقاط الشاشة
      }
      // خادم بسيط قد يرسل الجلسة مباشرة بلا مظروف — نقبل الحالتين
      if (isValidMessage(data)) handlers?.onMessage(data);
      else if (data && typeof data === 'object' && Array.isArray(data.items)) {
        handlers?.onMessage(envelope('session', data));
      }
    });

    socket.addEventListener('close', () => {
      handlers?.onStatus('disconnected');
      scheduleReconnect();
    });

    socket.addEventListener('error', (error) => {
      handlers?.onStatus('error', { error });
    });
  }

  return {
    name: 'websocket',

    isSupported() {
      return typeof WebSocket === 'function' && Boolean(url);
    },

    start(nextHandlers) {
      if (!url) throw new Error('لم يُضبط عنوان WebSocket');
      handlers = nextHandlers;
      closedByUs = false;
      handlers.onStatus('connecting', { url });
      open();
    },

    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },

    stop() {
      closedByUs = true;
      globalThis.clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  };
}
