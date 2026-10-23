-- قوالب الطباعة: الستيكرات والوصولات الحرارية بخط المسيري.
-- الصف اللي tenant_id مالته null هو القالب الافتراضي؛ أي متجر يگدر يسوي صف بنفس key يغطي عليه.
-- الصف key = '_base' بيه الـ CSS والـ JS المشتركة والقوالب الفرعية ومعلومات المحل.

create table if not exists public.print_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  key         text not null check (key ~ '^[a-z_][a-z0-9_]*$'),
  kind        text not null check (kind in ('base', 'sticker', 'receipt')),
  name        text not null,
  width_mm    numeric(6,2) check (width_mm is null or width_mm > 0),
  height_mm   numeric(6,2) check (height_mm is null or height_mm > 0),
  html        text not null default '',
  css         text not null default '',
  js          text not null default '',
  partials    jsonb not null default '{}'::jsonb check (jsonb_typeof(partials) = 'object'),
  fields      jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  sample      jsonb not null default '{}'::jsonb check (jsonb_typeof(sample) = 'object'),
  version     integer not null default 1,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  constraint print_templates_tenant_key unique nulls not distinct (tenant_id, key)
);

comment on table public.print_templates is
  'قوالب الطباعة (ستيكرات + وصولات 80mm). tenant_id = null يعني القالب الافتراضي، وصف المتجر بنفس key يغطي عليه. المتغيرات بين {{ }} تنبدل بالقيم وقت الطباعة';

create index if not exists print_templates_tenant_idx on public.print_templates (tenant_id) where tenant_id is not null;

alter table public.print_templates enable row level security;

create policy print_templates_read on public.print_templates
  for select to authenticated
  using (enabled and (tenant_id is null or tenant_id = (select private.current_tenant_id())));

-- الحزمة الكاملة للبرنامج: نفس شكل dist/print-templates.json
create or replace function private.print_templates_bundle(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select distinct on (pt.key) pt.*
      from public.print_templates pt
     where pt.enabled
       and (pt.tenant_id is null or pt.tenant_id = p_tenant_id)
     order by pt.key, (pt.tenant_id is null)
  ), b as (
    select * from t where t.key = '_base'
  )
  select jsonb_build_object(
    'ok', true,
    'version', coalesce((select max(t.version) from t), 0),
    'shop', coalesce((select b.sample -> 'shop' from b), '{}'::jsonb),
    'base', jsonb_build_object(
      'css', coalesce((select b.css from b), ''),
      'js', coalesce((select b.js from b), ''),
      'partials', coalesce((select b.partials from b), '{}'::jsonb)),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', t.key, 'kind', t.kind, 'name', t.name,
               'width_mm', t.width_mm, 'height_mm', t.height_mm,
               'html', t.html, 'css', t.css, 'fields', t.fields, 'sample', t.sample)
             order by t.kind desc, t.key)
        from t where t.kind <> 'base'), '[]'::jsonb));
$$;

-- يستدعيها البرنامج بجلسة الموظف مثل باقي دوال البرنامج
create or replace function public.print_templates_get(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.app_sessions;
begin
  v_s := public.app_session_guard(p_session_id);
  return private.print_templates_bundle(v_s.tenant_id);
end
$$;

grant execute on function public.print_templates_get(uuid) to anon, authenticated;
