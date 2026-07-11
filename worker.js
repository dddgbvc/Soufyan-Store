// انشره كـ Cloudflare Worker واربطه بمسار /api/chat
// أضف المفتاح من لوحة التحكم: Settings → Variables → KIMI_API_KEY (Secret)
// لا يُكتب المفتاح في أي كود واجهة إطلاقًا.

const SYSTEM_PROMPT = `أنت المساعد الذكي لمتجر "مركز سفيان للهواتف" في سامراء، العراق.
أجب بأسلوب ودّي ومختصر. رشّح فقط من المنتجات المتوفرة فعليًا بالكتالوج المرفق.
إذا سُئلت عن شيء غير متوفر، أخبر الزبون بصدق واقترح بديلاً قريبًا.
العنوان: صلاح الدين - سامراء - الحويش - الشارع الرئيسي. الدوام: يوميًا 9ص–10م.
واتساب: 07731644450 / 07744485771.

الكتالوج المتوفر حاليًا (الأسعار IQD):
- Samsung S24 Ultra 1,750,000 | iPhone 15 Pro Max 2,100,000 | iPhone 15 1,250,000
- iPhone 13 900,000 | Galaxy A55 520,000 | Galaxy A15 185,000
- Redmi Note 13 Pro 420,000 | Poco X6 Pro 480,000 | Redmi 13C 145,000
- Infinix Note 40 Pro 310,000 | Infinix Hot 40i 165,000
(S23 FE غير متوفر حاليًا)`;

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*", // بالإنتاج: ضع دومين المتجر بدل *
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return new Response("Method Not Allowed", { status: 405, headers: cors });

    try {
      const { message } = await request.json();
      if (!message || typeof message !== "string" || message.length > 1000)
        return Response.json({ error: "رسالة غير صالحة" }, { status: 400, headers: cors });

      const upstream = await fetch("https://api.moonshot.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.KIMI_API_KEY}`, // من متغيرات البيئة فقط
        },
        body: JSON.stringify({
          model: "kimi-k2.5", // تحقق من الاسم الدقيق بلوحة Moonshot
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          temperature: 0.6,
        }),
      });

      if (!upstream.ok) throw new Error("upstream " + upstream.status);
      const data = await upstream.json();
      const reply = data.choices?.[0]?.message?.content ?? "عذرًا، ما وصلني رد.";
      return Response.json({ reply }, { headers: cors });
    } catch {
      return Response.json({ error: "خلل مؤقت" }, { status: 502, headers: cors });
    }
  },
};
