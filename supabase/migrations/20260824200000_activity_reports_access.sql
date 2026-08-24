-- ════════════════════════════════════════════════════════════════════════
--  الجزء ٦ — ضبط صلاحيات قراءة السجل
--    السجل يحتوي أسماء زبائن و IP — ما ينقرأ بمفتاح anon العام
-- ════════════════════════════════════════════════════════════════════════

revoke execute on function public.activity_last(integer)        from public, anon;
revoke execute on function public.activity_report_text(integer) from public, anon;
revoke execute on function public.activity_devices(integer)     from public, anon;

grant execute on function public.activity_last(integer)         to authenticated, service_role;
grant execute on function public.activity_report_text(integer)  to authenticated, service_role;
grant execute on function public.activity_devices(integer)      to authenticated, service_role;

-- قراءة الجدول والعرض للمستخدم المسجّل فقط (مع سياسة RLS الموجودة)
grant select on public.activity_log to authenticated;
