/**
 * دمج أسماء الأصناف الشرطية دون الاعتماد على مكتبات خارجية.
 * يقبل نصوصًا وقيمًا شرطية ويتجاهل القيم الفارغة.
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else {
      out.push(String(input));
    }
  }

  return out.join(' ');
}
