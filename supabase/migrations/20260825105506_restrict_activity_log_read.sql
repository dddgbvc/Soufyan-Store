-- سجل الحركات يحتوي IP وأسماء أجهزة وأسماء منفّذين. كان مقروءاً لكل مستخدم
-- مسجّل بسياسة using(true). نحصره بالإدارة.
drop policy if exists activity_log_read on public.activity_log;

create policy activity_log_read on public.activity_log
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN', 'MANAGER')
      and p.status = 'active'
  ));
