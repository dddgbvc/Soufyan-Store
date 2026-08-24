-- ════════════════════════════════════════════════════════════════════════
--  الجزء ٥ — تحصين السجل:
--    • ما أحد يكدر يزوّر حركة أو يمسح السجل عن طريق الـ API
--    • تثبيت search_path للدوال الجديدة
-- ════════════════════════════════════════════════════════════════════════

-- دوال التريكرات والتدقيق: تنسحب من الـ API نهائيًا
revoke execute on function public.log_activity()             from public, anon, authenticated;
revoke execute on function public.pin_attempts_stamp()       from public, anon, authenticated;
revoke execute on function public.app_sessions_stamp()       from public, anon, authenticated;
revoke execute on function public.activity_log_immutable()   from public, anon, authenticated;
revoke execute on function public.audit_write(text, text, text, text, jsonb)
                                                             from public, anon, authenticated;
revoke execute on function public.audit_set_actor(jsonb)     from public, anon, authenticated;
revoke execute on function public.audit_set_telegram_actor(bigint)
                                                             from public, anon, authenticated;
revoke execute on function public.activity_log_gc(integer)   from public, anon, authenticated;

-- الخادم (service_role) يبقى يكدر يستدعيها إذا احتاج
grant execute on function public.audit_write(text, text, text, text, jsonb) to service_role;
grant execute on function public.audit_set_actor(jsonb)                     to service_role;
grant execute on function public.audit_set_telegram_actor(bigint)           to service_role;
grant execute on function public.activity_log_gc(integer)                   to service_role;

-- تثبيت search_path للدوال المساعدة
alter function public.audit_device(text)     set search_path to 'public';
alter function public.audit_redact(jsonb)    set search_path to 'public';
alter function public.audit_table_ar(text)   set search_path to 'public';
alter function public.audit_action_ar(text)  set search_path to 'public';
