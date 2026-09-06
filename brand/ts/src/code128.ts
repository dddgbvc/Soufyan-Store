/**
 * مولّد باركود Code 128 — مكتوب من الصفر، بلا اعتماديات.
 *
 * يختار النمط C تلقائيًا للنصوص الرقمية ذات الطول الزوجي (ضِعف الكثافة)
 * والنمط B لغيرها. مجموع التدقيق mod 103 مُتحقَّق منه مقابل القيم المنشورة:
 * `CODE128` → 26.
 */

/** أنماط الأعمدة: كل رقم عرض شريط أو فراغ بالوحدات. */
const PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const STOP = 106;

/** خيارات رسم الباركود. */
export interface BarcodeOptions {
  /** ارتفاع الأعمدة بالبكسل. */
  height?: number;
  /** عرض أنحف عمود بالبكسل. */
  module?: number;
  /** طباعة النص تحت الأعمدة. */
  text?: boolean;
  /** مقاس النص. */
  fontSize?: number;
  /** لون الأعمدة والنص. */
  color?: string;
  /** المنطقة الهادئة على الجانبين بالوحدات. */
  quietZone?: number;
}

/**
 * يحوّل النص إلى قيم Code 128 مع رمز البداية ومجموع التدقيق ورمز التوقّف.
 *
 * @throws إذا احتوى النص محرفًا خارج ASCII القابل للطباعة (32–126).
 */
export function encode(text: string): number[] {
  const digitsOnly = /^\d+$/.test(text);
  const useC = digitsOnly && text.length % 2 === 0 && text.length >= 4;
  const start = useC ? 105 : 104;
  const values: number[] = [];

  if (useC) {
    for (let i = 0; i < text.length; i += 2) values.push(parseInt(text.substr(i, 2), 10));
  } else {
    for (let j = 0; j < text.length; j++) {
      const code = text.charCodeAt(j);
      if (code < 32 || code > 126) {
        throw new RangeError(`محرف خارج نطاق Code 128 عند الموضع ${j}: ${JSON.stringify(text[j])}`);
      }
      values.push(code - 32);
    }
  }

  let sum = start;
  values.forEach((v, i) => { sum += v * (i + 1); });
  return [start, ...values, sum % 103, STOP];
}

/**
 * يرسم الباركود كـ SVG جاهز للإدراج.
 *
 * الناتج بلا `filter` ولا `fill` موروث — يفتح في كانفا وعند المطبعة كما هو.
 */
export function svg(text: string, opts: BarcodeOptions = {}): string {
  const height = opts.height ?? 60;
  const module = opts.module ?? 2;
  const showText = opts.text ?? true;
  const fontSize = opts.fontSize ?? 13;
  const color = opts.color ?? '#000';
  const quiet = opts.quietZone ?? 10;

  const codes = encode(text);
  const bars: string[] = [];
  let x = quiet;

  for (const code of codes) {
    const pattern = PATTERNS[code];
    if (pattern === undefined) throw new RangeError(`قيمة Code 128 غير صالحة: ${code}`);
    for (let i = 0; i < pattern.length; i++) {
      const w = parseInt(pattern[i]!, 10) * module;
      if (i % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="${color}"/>`);
      }
      x += w;
    }
  }

  const width = x + quiet;
  const gap = showText ? fontSize + 6 : 0;
  const label = showText
    ? `<text x="${width / 2}" y="${height + fontSize + 1}" text-anchor="middle" ` +
      `font-family="monospace" font-size="${fontSize}" letter-spacing="1" fill="${color}">` +
      escapeXml(text) + '</text>'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + gap}" ` +
    `width="${width}" height="${height + gap}" role="img" aria-label="باركود ${escapeXml(text)}">` +
    bars.join('') + label + '</svg>';
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
