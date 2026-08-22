-- ============================================================
-- تنبيه الديون المتأخرة
--
-- عمود customers.grace_period_days موجود من الأول وماكو شي يستعمله.
-- هنا نحسب المتأخرين ونرسلهم بالبوت كل يوم سبت الساعة ١٠ صباحاً.
--
-- "متأخر" يعني: مرّت مهلة السماح من آخر حركة على حسابه —
-- مو من تاريخ تسجيله بالنظام. آخر حركة = آخر فاتورة خلّت عليه دين،
-- أو آخر تسديد، أيهما أحدث. زبون قديم اشترى أمس ما يعتبر متأخر.
-- ============================================================

create or replace function public.overdue_debts()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select
      c.id, c.name, c.phone, c.balance,
      coalesce(c.grace_period_days, 30) as grace,
      greatest(
        c.created_at,
        coalesce((select max(i.created_at) from public.invoices i
                   where i.customer_id = c.id
                     and coalesce(i.total_amount,0) > coalesce(i.paid_amount,0)), c.created_at),
        coalesce((select max(d.created_at) from public.debt_payments d
                   where d.customer_id = c.id), c.created_at)
      ) as last_move
    from public.customers c
    where c.balance > 0
  ),
  late as (
    select b.*,
           ((now() at time zone 'Asia/Baghdad')::date
            - (b.last_move at time zone 'Asia/Baghdad')::date) - b.grace as days_late
    from base b
    where now() > b.last_move + make_interval(days => b.grace)
  )
  select jsonb_build_object(
    'count', (select count(*) from late),
    'total', (select coalesce(sum(balance), 0)::bigint from late),
    'rows',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',      name,
               'phone',     phone,
               'balance',   balance::bigint,
               'grace',     grace,
               'days_late', days_late,
               'last_move', to_char(last_move at time zone 'Asia/Baghdad', 'YYYY-MM-DD')
             ) order by balance desc)
      from late), '[]'::jsonb)
  );
$function$;

-- نص جاهز للإرسال بالبوت (HTML)
create or replace function public.overdue_debts_text()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v       jsonb := public.overdue_debts();
  v_lines text;
begin
  if coalesce((v->>'count')::int, 0) = 0 then
    return '✅ ماكو ولا زبون متأخر عن مهلة السداد.';
  end if;

  select string_agg(line, E'\n' order by ord)
  into v_lines
  from (
    select
      ord,
      '• <b>' ||
      replace(replace(replace(r->>'name', '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
      '</b> — ' || to_char((r->>'balance')::numeric, 'FM999,999,999') || ' د.ع' ||
      E'\n  متأخر ' || (r->>'days_late') || ' يوم · آخر حركة ' || (r->>'last_move') ||
      case when coalesce(r->>'phone', '') <> ''
           then E'\n  ☎ ' || (r->>'phone') else '' end as line
    from jsonb_array_elements(v->'rows') with ordinality as t(r, ord)
  ) x;

  return
    '⏰ <b>ديون تجاوزت مهلة السداد</b>' || E'\n' ||
    (v->>'count') || ' زبون · المجموع ' ||
    to_char((v->>'total')::numeric, 'FM999,999,999') || ' د.ع' || E'\n' ||
    '━━━━━━━━━━━━━' || E'\n' ||
    v_lines || E'\n' ||
    '━━━━━━━━━━━━━' || E'\n' ||
    'لتسجيل تسديد اكتب: <code>اسم الزبون سدد المبلغ</code>';
end;
$function$;

-- الإرسال الأسبوعي (cron) — ما يدز شي إذا ماكو متأخرين
create or replace function public.tg_overdue_debts()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'net'
as $function$
begin
  if coalesce(((public.overdue_debts())->>'count')::int, 0) > 0 then
    perform public.tg_send(public.overdue_debts_text());
  end if;
end;
$function$;

revoke all on function public.overdue_debts()      from public;
revoke all on function public.overdue_debts_text() from public;
revoke all on function public.tg_overdue_debts()   from public;

grant execute on function public.overdue_debts()      to service_role;
grant execute on function public.overdue_debts_text() to service_role;

-- كل يوم سبت الساعة ١٠ صباحاً بتوقيت بغداد (07:00 UTC)
select cron.unschedule(jobid) from cron.job where jobname = 'tg-overdue-debts';
select cron.schedule('tg-overdue-debts', '0 7 * * 6', $$select public.tg_overdue_debts();$$);
