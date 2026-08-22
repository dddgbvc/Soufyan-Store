-- ============================================================
-- ١) توقيت التقرير اليومي
--
-- كان ينرسل 18:00 UTC = ٩ مساءً بغداد، بس الدوام لـ١٠ مساءً.
-- من ٣٥ فاتورة، ٣ انكتبت بعد التاسعة — يعني ٩٪ من المبيعات
-- ما تدخل بتقرير اليوم. صار 19:30 UTC = ١٠:٣٠ مساءً، بعد الغلق.
-- (النسخة الاحتياطية تبقى 20:00 UTC = ١١ مساءً، بعده.)
-- ============================================================

select cron.unschedule(jobid) from cron.job where jobname = 'tg-daily-report';
select cron.schedule('tg-daily-report', '30 19 * * *', $$select public.tg_daily_report();$$);

-- ============================================================
-- ٢) المنتجات بلا قسم
--
-- ٨ منتجات من ٢٥ بلا قسم — يخربون أي تقرير أو فلترة حسب الأقسام.
-- التصنيف بالاسم: شواحن وكوابل ← سماعات ← كفرات ← والباقي أجهزة.
-- ============================================================

update public.products p
   set category_id = (select id from public.categories where name = 'شواحن وكوابل')
 where p.category_id is null
   and (p.name ilike '%شاحن%' or p.name ilike '%كابل%' or p.name ilike '%كيبل%');

update public.products p
   set category_id = (select id from public.categories where name = 'سماعات وصوتيات')
 where p.category_id is null
   and p.name ilike '%سماع%';

update public.products p
   set category_id = (select id from public.categories where name = 'كفرات وحماية')
 where p.category_id is null
   and (p.name ilike '%حافظة%' or p.name ilike '%كفر%' or p.name ilike '%واقي%');

-- الباقي أجهزة (iPhone 15 Pro Max والراوتر)
update public.products p
   set category_id = (select id from public.categories where name = 'هواتف وأجهزة')
 where p.category_id is null;

-- ============================================================
-- ٣) نقص فايت من جدول النواقص
--
-- «شاشة iPhone 13 بديلة» كميتها ٢ وحد التنبيه ٢ — يعني وصلت الحد،
-- بس ما انضافت للنواقص لأن منبّه notify_low_stock يشتغل فقط وكت
-- الكمية "تنزل" تحت الحد (old.stock > old.limit)، وهذي انخلقت أصلاً
-- عند الحد فما صار عبور.
--
-- ملاحظة: جدول shortages يديره البرنامج (عبر sync_push)، فما نضيف
-- مزامنة تلقائية من السيرفر حتى ما يصير تعارض. الصف منضاف يدوياً
-- ومعلّم is_manual = true.
-- ============================================================

insert into public.shortages (product_id, name, category, current_qty, limit_qty, status, is_manual, resolved)
select p.id, p.name,
       coalesce(c.name, 'بدون قسم'),
       p.stock_quantity, p.min_stock_alert,
       case when p.stock_quantity * 2 <= p.min_stock_alert then 'urgent' else 'warning' end,
       true, false
from public.products p
left join public.categories c on c.id = p.category_id
where p.stock_quantity <= coalesce(p.min_stock_alert, 0)
  and not exists (
    select 1 from public.shortages s
    where s.product_id = p.id and not s.resolved
  );
