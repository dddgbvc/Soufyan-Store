import { motion } from 'framer-motion';
import { Activity, DatabaseZap, ShieldCheck, TrendingUp } from 'lucide-react';
import { cascade, cascadeItem, SPRING_SETTLE } from '../lib/motion';
import { BrandMark } from './ui/BrandMark';

/** بيانات عرض تمثيلية لمعاينة أداء المنظومة (مبيعات آخر ١٢ يومًا). */
const TREND = [38, 44, 41, 52, 47, 58, 63, 55, 68, 72, 66, 81];

const HIGHLIGHTS = [
  { icon: DatabaseZap, label: 'تهيئة فورية', hint: 'مخطط قاعدة البيانات جاهز خلال ثوانٍ' },
  { icon: ShieldCheck, label: 'صلاحيات دقيقة', hint: 'أدوار وسجل تدقيق لكل عملية' },
  { icon: Activity, label: 'مزامنة لحظية', hint: 'نقاط البيع والمخزون في مصدر واحد' },
];

const numberFormat = new Intl.NumberFormat('en-US');

/**
 * لوحة العرض الجانبية — تظهر على الشاشات الكبيرة فقط (lg وما فوق).
 * دورها إعطاء سياق للمنتج دون سرقة التركيز من نموذج المصادقة.
 */
export function ShowcasePane() {
  const peak = Math.max(...TREND);

  return (
    <motion.aside
      variants={cascade}
      initial="hidden"
      animate="show"
      className="relative hidden h-full flex-col justify-between p-8 lg:flex xl:p-10"
      aria-label="نبذة عن المنظومة"
    >
      <motion.div variants={cascadeItem}>
        <BrandMark />
      </motion.div>

      <div className="my-8">
        <motion.h2
          variants={cascadeItem}
          className="max-w-md text-fluid-3xl font-extrabold leading-[1.2] text-ink-50"
        >
          منظومة واحدة تدير
          <span className="bg-gradient-to-l from-royal-400 via-beam-400 to-verify-400 bg-clip-text text-transparent">
            {' '}
            المبيعات والمخزون والحسابات
          </span>
        </motion.h2>

        <motion.p
          variants={cascadeItem}
          className="mt-3 max-w-sm text-fluid-sm leading-relaxed text-ink-400"
        >
          من نقطة البيع إلى القيد المحاسبي — بلا جداول متفرقة ولا إدخال مزدوج.
        </motion.p>

        {/* بطاقة معاينة التحليلات */}
        <motion.div
          variants={cascadeItem}
          className="glass glass-edge mt-7 max-w-md rounded-4xl border border-white/[0.08] p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.7rem] text-ink-500">صافي المبيعات — هذا الشهر</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="numeric text-fluid-xl font-extrabold text-ink-50">
                  {numberFormat.format(48250000)}
                </span>
                <span className="text-fluid-xs font-semibold text-ink-400">د.ع</span>
              </p>
            </div>

            <span className="flex shrink-0 items-center gap-1 rounded-full border border-verify-500/25 bg-verify-500/[0.10] px-2 py-1 text-[0.68rem] font-bold text-verify-400">
              <TrendingUp className="size-3" aria-hidden="true" />
              {/* الإشارة الموجبة محرف محايد في bidi: نعزلها بـ dir صريح
                  حتى لا تنتقل إلى نهاية الرقم داخل السياق العربي. */}
              <span className="numeric" dir="ltr">
                +18.4%
              </span>
            </span>
          </div>

          {/* رسم أعمدة بسيط — زخرفي، وملخّصه النصي متاح لقارئات الشاشة */}
          <div
            className="mt-5 flex h-24 items-end gap-1.5"
            role="img"
            aria-label="اتجاه المبيعات خلال آخر اثني عشر يومًا: نمو مستمر بنسبة ١٨٫٤٪"
          >
            {TREND.map((point, index) => (
              <motion.span
                key={index}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: point / peak }}
                transition={{ ...SPRING_SETTLE, delay: 0.25 + index * 0.035 }}
                style={{ transformOrigin: 'bottom' }}
                className={
                  index === TREND.length - 1
                    ? 'h-full flex-1 rounded-t-md bg-gradient-to-t from-beam-500/40 to-beam-400'
                    : 'h-full flex-1 rounded-t-md bg-gradient-to-t from-royal-600/25 to-royal-500/70'
                }
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-4">
            <MiniStat value="1,284" label="فاتورة" />
            <MiniStat value="97.6%" label="دقة الجرد" />
            <MiniStat value="4" label="سجل بيع نشط" />
          </div>
        </motion.div>
      </div>

      <motion.ul variants={cascadeItem} className="space-y-3">
        {HIGHLIGHTS.map((item) => (
          <li key={item.label} className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-beam-400">
              <item.icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-fluid-xs font-semibold text-ink-200">{item.label}</span>
              <span className="block text-[0.68rem] text-ink-500">{item.hint}</span>
            </span>
          </li>
        ))}
      </motion.ul>
    </motion.aside>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="numeric text-fluid-sm font-bold text-ink-50">{value}</p>
      <p className="mt-0.5 text-[0.62rem] text-ink-500">{label}</p>
    </div>
  );
}
