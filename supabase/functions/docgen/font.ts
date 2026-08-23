// ============================================================================
// جلب خط عربي حقيقي (TTF) صالح للتضمين داخل PDF
// ----------------------------------------------------------------------------
// سبب "الأحرف الناقصة" في النسخة السابقة:
//
//   الشيفرة القديمة كانت تطلب https://fonts.googleapis.com/css2 بترويسة
//   User-Agent حديثة. Google Fonts في هذه الحالة يعيد ملفات **woff2** —
//   وهي صيغة مضغوطة (Brotli) لا يفهمها لا fontkit ولا مواصفة PDF.
//   النتيجة: خط تالف ⇐ محارف مفقودة أو مربّعات فارغة.
//
//   الحل: استخدام واجهة css (v1) القديمة مع User-Agent قديم لا يدعم woff،
//   فيعيد Google ملف **truetype** ثابتاً. ثم نتحقّق فعلياً من أن الملف
//   sfnt سليم وأنه يغطّي الحروف العربية والأرقام اللاتينية معاً.
// ============================================================================

import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

/** متصفّح أندرويد قديم: لا يدعم woff/woff2 ⇒ Google Fonts يعيد TTF ثابتاً. */
const LEGACY_UA =
  "Mozilla/5.0 (Linux; U; Android 2.3.5; en-us; HTC Vision Build/GRI40) " +
  "AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1";

/** متصفّح IE قديم كبديل ثانٍ (يعيد eot/ttf حسب التفاوض). */
const LEGACY_UA_2 =
  "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)";

/** عائلات احتياطية بالترتيب في حال تعطّل الأولى. */
const FAMILIES = ["Cairo", "Noto Kufi Arabic", "Amiri"];

/** محارف يجب أن يغطّيها الخط وإلا اعتُبر ناقصاً. */
const REQUIRED_CODEPOINTS = [
  0x0627, 0x0628, 0x062A, 0x0631, 0x0633, 0x0639, 0x0643, 0x0644, 0x0645, 0x0646,
  0x0647, 0x0648, 0x064A, 0x0629, 0x0621, 0x0623, 0x0625, 0x0622, // عربي
  0x0030, 0x0035, 0x0039, 0x002C, 0x002E, 0x002F, 0x003A, 0x002D, // أرقام وفواصل
  0x0041, 0x0049, 0x0051, 0x0044, 0x0061, 0x007A, 0x0020, // لاتيني
];

export type LoadedFont = { bytes: Uint8Array; family: string; weight: number };

const cache = new Map<string, LoadedFont>();

function isSfnt(b: Uint8Array): boolean {
  if (b.length < 4) return false;
  const tag = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  return (
    tag === 0x00010000 || // TrueType
    tag === 0x74727565 || // 'true'
    tag === 0x4F54544F || // 'OTTO'  (CFF)
    tag === 0x74746366 // 'ttcf'
  );
}

/** يتحقّق أن الخط قابل للقراءة ويغطّي المحارف المطلوبة فعلاً. */
function validate(bytes: Uint8Array): string | null {
  if (!isSfnt(bytes)) return "not a TrueType/OpenType file (probably woff2)";
  if (bytes.length < 20_000) return `suspiciously small (${bytes.length} bytes)`;
  let font: any;
  try {
    font = (fontkit as any).create(bytes);
  } catch (e) {
    return "fontkit could not parse it: " + String(e);
  }
  const missing = REQUIRED_CODEPOINTS.filter((cp) => !font.hasGlyphForCodePoint(cp));
  if (missing.length) {
    return "missing glyphs: " + missing.map((c) => "U+" + c.toString(16).toUpperCase()).join(",");
  }
  return null;
}

async function fetchTtf(family: string, weight: number, ua: string): Promise<Uint8Array> {
  const url =
    `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}&subset=arabic`;
  const cssRes = await fetch(url, { headers: { "User-Agent": ua } });
  if (!cssRes.ok) throw new Error(`google fonts css ${cssRes.status}`);
  const css = await cssRes.text();
  const m = css.match(/url\((https:[^)]+\.ttf)\)/) ?? css.match(/url\((https:[^)]+)\)/);
  if (!m) throw new Error("no font url in css: " + css.slice(0, 200));
  const fontRes = await fetch(m[1], { headers: { "User-Agent": ua } });
  if (!fontRes.ok) throw new Error(`font download ${fontRes.status}`);
  return new Uint8Array(await fontRes.arrayBuffer());
}

/**
 * يحمّل خطاً عربياً صالحاً للتضمين، مع تخزين مؤقت على مستوى النسخة (instance)
 * حتى لا نُعيد التحميل مع كل طلب.
 */
export async function loadArabicFont(weight: 400 | 700): Promise<LoadedFont> {
  const key = String(weight);
  const hit = cache.get(key);
  if (hit) return hit;

  const problems: string[] = [];
  for (const family of FAMILIES) {
    for (const ua of [LEGACY_UA, LEGACY_UA_2]) {
      try {
        const bytes = await fetchTtf(family, weight, ua);
        const problem = validate(bytes);
        if (problem) {
          problems.push(`${family}@${weight} (${ua.slice(0, 18)}…): ${problem}`);
          continue;
        }
        const loaded: LoadedFont = { bytes, family, weight };
        cache.set(key, loaded);
        return loaded;
      } catch (e) {
        problems.push(`${family}@${weight}: ${String(e)}`);
      }
    }
  }
  throw new Error("could not load a usable Arabic TTF — " + problems.join(" | "));
}

/** نسخة fontkit من الخط، تُستخدم لفحص تغطية المحارف قبل الرسم. */
export function inspect(bytes: Uint8Array): any {
  return (fontkit as any).create(bytes);
}
