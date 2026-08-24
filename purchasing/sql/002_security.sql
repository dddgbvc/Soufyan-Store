-- ============================================================================
--  قسم الشراء — الملف 002: طبقة الأمان
--
--  المبدأ: لا يوجد وصول مباشر إلى جداول الشراء من المتصفح إطلاقًا.
--  كل قراءة وكل كتابة تمرّ عبر دوال SECURITY DEFINER تتحقق من رمز الجلسة
--  ومن صلاحية الموظف. حتى لو تسرّب مفتاح anon (وهو مفتاح عام بطبيعته)
--  لا يستطيع حامله قراءة صف واحد من بيانات الشراء بدون PIN صالح.
--
--  ثلاث طبقات متراكبة:
--    1) REVOKE  — سحب صلاحيات الجدول من anon و authenticated
--    2) RLS     — تفعيل أمان الصفوف بدون أي سياسة = رفض افتراضي كامل
--    3) الدوال  — تحقق من الرمز + الصلاحية + صحة المدخلات داخل كل دالة
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) تفعيل RLS على كل جداول القسم — بدون سياسات = رفض كامل
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.suppliers             enable row level security;
alter table public.purchases             enable row level security;
alter table public.purchase_items        enable row level security;
alter table public.supplier_payments     enable row level security;
alter table public.purchase_returns      enable row level security;
alter table public.purchase_return_items enable row level security;
alter table public.purchase_sessions     enable row level security;
alter table public.purchase_audit        enable row level security;
alter table public.purchase_settings     enable row level security;

-- إجبار أمان الصفوف حتى على مالك الجدول (لا يتجاوزه إلا SECURITY DEFINER)
alter table public.purchase_sessions     force row level security;
alter table public.purchase_audit        force row level security;

-- إزالة أي سياسة قديمة قد تكون بقيت من تشغيل سابق
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('suppliers','purchases','purchase_items','supplier_payments',
                        'purchase_returns','purchase_return_items','purchase_sessions',
                        'purchase_audit','purchase_settings')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) سحب صلاحيات الجداول من أدوار الواجهة
--    (Supabase يمنح anon/authenticated صلاحيات افتراضية على schema public)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on public.suppliers,
              public.purchases,
              public.purchase_items,
              public.supplier_payments,
              public.purchase_returns,
              public.purchase_return_items,
              public.purchase_sessions,
              public.purchase_audit,
              public.purchase_settings
  from anon, authenticated;

revoke all on sequence public.purchases_number_seq,
                       public.purchase_returns_number_seq
  from anon, authenticated;

-- service_role (المفتاح السري للنسخ الاحتياطي والمزامنة) يحتفظ بوصول كامل
grant all on public.suppliers,
             public.purchases,
             public.purchase_items,
             public.supplier_payments,
             public.purchase_returns,
             public.purchase_return_items,
             public.purchase_sessions,
             public.purchase_audit,
             public.purchase_settings
  to service_role;

grant usage, select on sequence public.purchases_number_seq,
                                public.purchase_returns_number_seq
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) تنظيف الجلسات المنتهية — تُستدعى من داخل دالة الدخول ومن pg_cron
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purchase_sessions_gc()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  delete from public.purchase_sessions
  where expires_at < now() - interval '2 days'
     or (revoked = true and last_seen_at < now() - interval '1 day');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.purchase_sessions_gc() from public, anon, authenticated;

commit;
