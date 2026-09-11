/** أدوات DOM صغيرة — بديل خفيف عن أي مكتبة. */

/**
 * ينشئ عنصرًا مع صفاته وأبنائه.
 * @param {string} tag
 * @param {Record<string, any>} [attrs] `class`, `text`, `html`, `dataset`, أو أي صفة HTML
 * @param {(Node|string|null|undefined|false)[]} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

/** ينشئ عنصر SVG من نص. يُستخدم لأيقونات ورسوم مضمّنة (لا ملفات مكسورة). */
export function svg(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

/** يضبط نصّ عنصر فقط عند تغيّره فعلًا — يمنع إعادة رسم غير ضرورية. */
export function setText(node, text) {
  const value = String(text ?? '');
  if (node.textContent !== value) node.textContent = value;
}

/** يبدّل صفة data- ويُرجع true إذا تغيّرت. */
export function setData(node, key, value) {
  const next = value === null || value === false ? undefined : String(value);
  if (node.dataset[key] === next) return false;
  if (next === undefined) delete node.dataset[key];
  else node.dataset[key] = next;
  return true;
}

/** هل يفضّل المستخدم تقليل الحركة؟ */
export const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * يشغّل حركة CSS مرة واحدة عبر صفة data ثم ينظّفها.
 * أفضل من إضافة/إزالة class لأنه يعيد تشغيل الحركة عند التكرار السريع.
 */
export function playOnce(node, key, durationMs) {
  if (prefersReducedMotion()) return;
  delete node.dataset[key];
  void node.offsetWidth; // إعادة تدفّق مقصودة لإعادة تشغيل الحركة
  node.dataset[key] = 'true';
  globalThis.setTimeout(() => {
    if (node.dataset[key] === 'true') delete node.dataset[key];
  }, durationMs);
}
