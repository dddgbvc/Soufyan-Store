-- ════════════════════════════════════════════════════════════════════════
--  الجزء ٢ — ربط التريكر بكل جداول القاعدة + ختم محاولات الرمز السري
-- ════════════════════════════════════════════════════════════════════════

-- ١) تريكر التسجيل على كل جدول (ما عدا جداول التدقيق نفسها)
do $do$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in ('activity_log', 'purchase_audit')
    order by 1
  loop
    execute format('drop trigger if exists zz_activity_log on public.%I', t);
    execute format(
      'create trigger zz_activity_log after insert or update or delete on public.%I
         for each row execute function public.log_activity()', t);
  end loop;
end
$do$;

-- ٢) محاولات الرمز السري: خزّن الـ IP والجهاز بالجدول نفسه (مو بس بالسجل)
alter table public.pin_attempts
  add column if not exists ip         inet,
  add column if not exists user_agent text,
  add column if not exists device     text,
  add column if not exists os         text;

comment on column public.pin_attempts.ip     is 'IP الجهاز الي حاول يدخل';
comment on column public.pin_attempts.device is 'نوع الجهاز: موبايل / تابلت / حاسبة / خادم-بوت';

create or replace function public.pin_attempts_stamp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c jsonb;
begin
  begin
    c := public.audit_ctx();
    new.ip         := coalesce(new.ip, nullif(c->>'ip', '')::inet);
    new.user_agent := coalesce(new.user_agent, left(c->>'user_agent', 400));
    new.device     := coalesce(new.device, c->>'device_type');
    new.os         := coalesce(new.os, c->>'os');
  exception when others then
    null;
  end;
  return new;
end;
$function$;

drop trigger if exists pin_attempts_stamp on public.pin_attempts;
create trigger pin_attempts_stamp before insert on public.pin_attempts
  for each row execute function public.pin_attempts_stamp();

-- ٣) نفس الفكرة لجلسات البرنامج: أي جلسة تنفتح بدون IP تنختم تلقائيًا
create or replace function public.app_sessions_stamp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c jsonb;
begin
  begin
    c := public.audit_ctx();
    new.ip         := coalesce(new.ip, nullif(c->>'ip', '')::inet);
    new.user_agent := coalesce(new.user_agent, left(c->>'user_agent', 400));
    new.country    := coalesce(new.country, left(c->>'country', 4));
    new.os         := coalesce(new.os, c->>'os');
    new.platform   := coalesce(new.platform, c->>'device_type');
  exception when others then
    null;
  end;
  return new;
end;
$function$;

drop trigger if exists app_sessions_stamp on public.app_sessions;
create trigger app_sessions_stamp before insert on public.app_sessions
  for each row execute function public.app_sessions_stamp();
