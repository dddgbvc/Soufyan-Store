// ============================================================================
// محرّك النص العربي ثنائي الاتجاه (RTL / BiDi) لملفات PDF
// ----------------------------------------------------------------------------
// المشكلتان اللتان يعالجهما هذا الملف مع font.ts:
//
// 1) "الأحرف ناقصة": سببها أن الخط المضمَّن كان يُجلب بصيغة woff2 (مضغوطة)
//    وهي غير صالحة للتضمين داخل PDF. الحل في font.ts.
//
// 2) "الأرقام معكوسة": fontkit ينفّذ تشكيل العربية (GSUB) بشكل صحيح، لكنه
//    يعكس *كامل* المقطع إذا رصد فيه حرفاً عربياً واحداً. لذلك النص
//    "الرصيد 1,750,000 IQD" كان يُرسم "DQI 000,057,1 ديصرلا" — أي الأرقام
//    والكلمات اللاتينية مقلوبة. fontkit لا يطبّق خوارزمية UAX#9.
//
//    الحل: نطبّق UAX#9 بأنفسنا (عبر bidi-js)، نقسّم السطر إلى مقاطع اتجاهية،
//    نرتّبها بصرياً، ثم نرسم كل مقطع على حدة. عندها يعكس fontkit المقاطع
//    العربية فقط — وهو السلوك الصحيح — وتبقى الأرقام بترتيبها.
// ============================================================================

import bidiFactory from "https://esm.sh/bidi-js@1.0.3";

const bidi = (bidiFactory as unknown as () => any)();

/** محارف تجعل fontkit يعتبر المقطع RTL ويعكسه تلقائياً (عبري/عربي/سرياني/ثانا…). */
const FONTKIT_RTL =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** حروف عربية قابلة للوصل — وجودها يعني أن التشكيل (GSUB) مهم ولا يجوز عكس النص يدوياً. */
const ARABIC_LETTERS =
  /[\u0620-\u064A\u066E-\u06D3\u06D5\u06E5\u06E6\u06EE-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** محارف تحكّم ثنائية الاتجاه: تؤثّر على الترتيب لكن لا تُرسم. */
const BIDI_CONTROLS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

/** محارف تحكّم عامة يجب حذفها قبل الرسم. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const LRI = "\u2066";
const PDI = "\u2069";

export type VisualRun = {
  /** النص كما يجب تمريره إلى pdf-lib مباشرة. */
  text: string;
  /** هل المقطع من اليمين إلى اليسار (مستوى فردي)؟ */
  rtl: boolean;
  /** مستوى التضمين حسب UAX#9. */
  level: number;
};

function reverseCodePoints(s: string): string {
  return Array.from(s).reverse().join("");
}

/**
 * ترتيب المقاطع بصرياً حسب القاعدة L2 من UAX#9:
 * من أعلى مستوى نزولاً حتى أدنى مستوى فردي، اعكس كل سلسلة متجاورة من
 * المقاطع التي مستواها ≥ المستوى الحالي.
 */
function reorderRuns<T extends { level: number }>(runs: T[]): T[] {
  if (runs.length < 2) return runs.slice();
  let maxLevel = 0;
  let minOdd = 127;
  for (const r of runs) {
    if (r.level > maxLevel) maxLevel = r.level;
    if (r.level % 2 === 1 && r.level < minOdd) minOdd = r.level;
  }
  const out = runs.slice();
  for (let level = maxLevel; level >= minOdd; level--) {
    let i = 0;
    while (i < out.length) {
      if (out[i].level >= level) {
        let j = i;
        while (j + 1 < out.length && out[j + 1].level >= level) j++;
        for (let a = i, b = j; a < b; a++, b--) {
          const tmp = out[a];
          out[a] = out[b];
          out[b] = tmp;
        }
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  return out;
}

/**
 * يحوّل سطراً منطقياً إلى مقاطع مرتّبة بصرياً من اليسار إلى اليمين،
 * جاهزة للرسم واحداً تلو الآخر.
 *
 * @param raw السطر بالترتيب المنطقي (كما يُكتب).
 * @param base اتجاه الفقرة الأساسي — "rtl" لمستنداتنا العربية.
 */
export function visualRuns(raw: string, base: "rtl" | "ltr" = "rtl"): VisualRun[] {
  const text = String(raw ?? "");
  if (!text) return [];

  const levelsResult = bidi.getEmbeddingLevels(text, base);
  const levels: Uint8Array = levelsResult.levels;

  // القاعدة L4: عكس الأقواس والرموز المتناظرة داخل المقاطع اليمينية.
  // ملاحظة: هذه الدالة تتوقّع مصفوفة المستويات نفسها لا كائن النتيجة.
  const mirrored: Map<number, string> = bidi.getMirroredCharactersMap(text, levels);
  const chars: string[] = [];
  for (let i = 0; i < text.length; i++) chars.push(mirrored.get(i) ?? text[i]);

  // تجميع المحارف في مقاطع ذات مستوى واحد (بالترتيب المنطقي).
  const logical: { text: string; level: number }[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || levels[i] !== levels[start]) {
      logical.push({ text: chars.slice(start, i).join(""), level: levels[start] });
      start = i;
    }
  }

  const visual = reorderRuns(logical);

  const out: VisualRun[] = [];
  for (const run of visual) {
    // محارف التحكّم أدّت دورها في حساب المستويات؛ لا تُرسم.
    const stripped = run.text.replace(BIDI_CONTROLS, "").replace(CONTROL_CHARS, "");
    if (!stripped) continue;

    const rtl = run.level % 2 === 1;
    let drawable = stripped;

    // إذا لم يكن في المقطع حروف عربية موصولة فالتشكيل غير معنيّ، ونستطيع
    // تصحيح اتجاه fontkit يدوياً عند الحاجة (مثلاً: مقطع فواصل ورموز داخل
    // فقرة عربية، أو أرقام هندية داخل مقطع لاتيني).
    if (!ARABIC_LETTERS.test(stripped)) {
      const fontkitWillReverse = FONTKIT_RTL.test(stripped);
      if (fontkitWillReverse !== rtl) drawable = reverseCodePoints(stripped);
    }

    out.push({ text: drawable, rtl, level: run.level });
  }
  return out;
}

/** يُبقي النص مقطعاً لاتينياً واحداً مهما كان محيطه (للمبالغ السالبة والمعرّفات). */
export function isolateLTR(s: string): string {
  return LRI + s + PDI;
}

/** ينظّف نصاً قادماً من قاعدة البيانات قبل رسمه. */
export function clean(s: unknown): string {
  return String(s ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
