#!/usr/bin/env node
/**
 * build-csp.mjs — يرفع CSP من 'unsafe-inline' إلى بصمات SHA-256
 * ---------------------------------------------------------------------------
 * التطبيق ملف واحد بلا خطوة بناء، فالافتراضي أن `script-src` يحمل
 * 'unsafe-inline' حتى يعمل بنقرة مزدوجة. هذه الأداة اختيارية: تحسب بصمة كل
 * نصّ مضمَّن وتستبدل بها 'unsafe-inline'.
 *
 *   node tools/build-csp.mjs           # يطبّق البصمات
 *   node tools/build-csp.mjs --check   # يتحقّق فقط (للـCI) ولا يكتب
 *   node tools/build-csp.mjs --revert  # يعيد 'unsafe-inline'
 *
 * ⚠️ بعد أي تعديل على أي <script> داخل الصفحة أعد تشغيلها، وإلا منعت CSP
 *    تنفيذ النص وتوقّفت الصفحة. لهذا ليست مفعّلة افتراضيًا.
 *
 * الصفحة لا تحتوي أي معالج حدث سطري (onclick=…)، فالبصمات وحدها كافية.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "index.html");

const mode = process.argv.includes("--check") ? "check"
           : process.argv.includes("--revert") ? "revert" : "apply";

const html = readFileSync(FILE, "utf8");

/** كل <script> بلا src — أي النصوص المضمَّنة التي تحتاج بصمة. */
function inlineScripts(src) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1] || "";
    // <script type="application/json"> بيانات لا برنامج — CSP لا تنفّذها.
    if (/type\s*=\s*["'](?!text\/javascript|module)[^"']*["']/i.test(attrs)) continue;
    out.push(m[2]);
  }
  return out;
}

const hashes = inlineScripts(html).map(
  (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`,
);

if (!hashes.length) {
  console.error("build-csp: لم يُعثر على أي نص مضمَّن — لم يتغيّر شيء.");
  process.exit(1);
}

const SCRIPT_SRC_RE = /(\n\s*script-src)([^;]*);/;
const match = html.match(SCRIPT_SRC_RE);
if (!match) {
  console.error("build-csp: لم يُعثر على توجيه script-src داخل <meta> الخاص بـ CSP.");
  process.exit(1);
}

const current = match[2].trim();
const wanted = mode === "revert"
  ? "'self' 'unsafe-inline'"
  : `'self' ${hashes.join(" ")}`;

if (mode === "check") {
  const ok = current === wanted;
  console.log(ok
    ? `build-csp --check: مطابق (${hashes.length} بصمة).`
    : `build-csp --check: غير مطابق.\n  الحالي : ${current}\n  المتوقَّع: ${wanted}`);
  process.exit(ok ? 0 : 1);
}

const next = html.replace(SCRIPT_SRC_RE, `$1 ${wanted};`);
writeFileSync(FILE, next, "utf8");
console.log(mode === "revert"
  ? "build-csp: أُعيد 'unsafe-inline'."
  : `build-csp: طُبّقت ${hashes.length} بصمة على script-src.`);
