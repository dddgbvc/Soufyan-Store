-- ============================================================================
--  قسم الشراء — الملف 004: دوال القراءة (كل ما تعرضه الواجهة يمرّ من هنا)
-- ============================================================================

begin;

-- ═════════════════════════════════════════════════════════════════════════════
--  الإقلاع: إعدادات + مؤشرات سريعة + قوائم أساسية
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_bootstrap(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s public.purchase_sessions;
  v_out jsonb;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  select jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'employee',     v_s.employee_name,
      'role',         v_s.role,
      'expires_at',   v_s.expires_at,
      'can_settings', v_s.role = 'ADMIN'),
    'settings', coalesce(
      (select jsonb_object_agg(key, value) from public.purchase_settings), '{}'::jsonb),
    'categories', coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
         from public.categories c), '[]'::jsonb),
    'suppliers', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', s.id, 'name', s.name, 'phone', s.phone,
                'company', s.company, 'balance', s.balance,
                'credit_limit', s.credit_limit, 'is_active', s.is_active)
              order by s.name)
         from public.suppliers s where s.is_active), '[]'::jsonb),
    'counters', jsonb_build_object(
      'suppliers',       (select count(*) from public.suppliers where is_active),
      'open_shortages',  (select count(*) from public.shortages where not resolved),
      'supplier_debt',   (select coalesce(sum(balance), 0) from public.suppliers where balance > 0),
      'purchases_today', (select count(*) from public.purchases
                           where status = 'posted'
                             and created_at >= date_trunc('day', now() at time zone 'Asia/Baghdad')
                                              at time zone 'Asia/Baghdad'))
  ) into v_out;

  return v_out;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  بحث المنتجات — بالاسم أو الباركود (يغذّي شاشة إدخال الفاتورة)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_products_search(
  p_token text, p_query text default '', p_limit int default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s public.purchase_sessions;
  v_q text;
  v_lim int;
begin
  v_s  := public.purchase_guard(p_token, 'MANAGER');
  v_q  := left(btrim(coalesce(p_query, '')), 80);
  v_lim := greatest(1, least(coalesce(p_limit, 30), 100));

  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(x order by x->>'name')
    from (
      select jsonb_build_object(
               'id', p.id, 'name', p.name, 'barcode', p.barcode,
               'category_id', p.category_id,
               'cost_price', p.cost_price, 'selling_price', p.selling_price,
               'stock_quantity', p.stock_quantity,
               'min_stock_alert', p.min_stock_alert,
               'has_imei', p.has_imei) as x
      from public.products p
      where v_q = ''
         or p.name ilike '%' || v_q || '%'
         or p.barcode = v_q
      order by (p.barcode = v_q) desc, p.name
      limit v_lim
    ) t), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  الموردون + أرصدتهم
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_suppliers_list(
  p_token text, p_query text default '', p_only_debt boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s public.purchase_sessions;
  v_q text;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');
  v_q := left(btrim(coalesce(p_query, '')), 80);

  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.name, 'phone', s.phone, 'company', s.company,
             'address', s.address, 'notes', s.notes, 'balance', s.balance,
             'credit_limit', s.credit_limit, 'is_active', s.is_active,
             'created_at', s.created_at,
             'purchases_count', (select count(*) from public.purchases pu
                                  where pu.supplier_id = s.id and pu.status = 'posted'),
             'purchases_total', (select coalesce(sum(pu.total_amount), 0) from public.purchases pu
                                  where pu.supplier_id = s.id and pu.status = 'posted'),
             'last_purchase_at', (select max(pu.created_at) from public.purchases pu
                                   where pu.supplier_id = s.id and pu.status = 'posted'))
           order by s.balance desc, s.name)
    from public.suppliers s
    where (v_q = '' or s.name ilike '%' || v_q || '%'
                    or coalesce(s.company,'') ilike '%' || v_q || '%'
                    or coalesce(s.phone,'')   ilike '%' || v_q || '%')
      and (not p_only_debt or s.balance > 0)
  ), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  قائمة فواتير الشراء
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_list(
  p_token  text,
  p_query  text default '',
  p_from   date default null,
  p_to     date default null,
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_q   text;
  v_lim int;
  v_off int;
  v_tot int;
begin
  v_s   := public.purchase_guard(p_token, 'MANAGER');
  v_q   := left(btrim(coalesce(p_query, '')), 80);
  v_lim := greatest(1, least(coalesce(p_limit, 50), 200));
  v_off := greatest(0, coalesce(p_offset, 0));

  select count(*) into v_tot
  from public.purchases p
  where (v_q = '' or p.purchase_number ilike '%' || v_q || '%'
                  or coalesce(p.supplier_name,'') ilike '%' || v_q || '%')
    and (p_from is null or (p.created_at at time zone 'Asia/Baghdad')::date >= p_from)
    and (p_to   is null or (p.created_at at time zone 'Asia/Baghdad')::date <= p_to)
    and (p_status is null or p.status = p_status);

  return jsonb_build_object(
    'ok', true,
    'total', v_tot,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'purchase_number', p.purchase_number,
               'supplier_id', p.supplier_id, 'supplier_name', p.supplier_name,
               'status', p.status, 'total_amount', p.total_amount,
               'paid_amount', p.paid_amount,
               'remaining', p.total_amount - p.paid_amount,
               'payment_type', p.payment_type, 'actor', p.actor,
               'items_count', (select count(*) from public.purchase_items i
                                where i.purchase_id = p.id),
               'created_at', p.created_at,
               'cancelled_at', p.cancelled_at)
             order by p.created_at desc)
      from (
        select * from public.purchases p2
        where (v_q = '' or p2.purchase_number ilike '%' || v_q || '%'
                        or coalesce(p2.supplier_name,'') ilike '%' || v_q || '%')
          and (p_from is null or (p2.created_at at time zone 'Asia/Baghdad')::date >= p_from)
          and (p_to   is null or (p2.created_at at time zone 'Asia/Baghdad')::date <= p_to)
          and (p_status is null or p2.status = p_status)
        order by p2.created_at desc
        limit v_lim offset v_off
      ) p), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  فاتورة شراء واحدة بتفاصيلها
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_get(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s public.purchase_sessions;
  v_p public.purchases%rowtype;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  select * into v_p from public.purchases where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'الفاتورة غير موجودة');
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase', to_jsonb(v_p),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'product_id', i.product_id, 'product_name', i.product_name,
               'barcode', i.barcode, 'quantity', i.quantity, 'unit_cost', i.unit_cost,
               'discount', i.discount, 'landed_unit_cost', i.landed_unit_cost,
               'total', i.total, 'serials', i.serials,
               'old_cost', i.old_cost, 'new_cost', i.new_cost,
               'old_selling', i.old_selling, 'new_selling', i.new_selling,
               'old_stock', i.old_stock, 'new_stock', i.new_stock,
               'is_new_product', i.is_new_product)
             order by i.product_name)
      from public.purchase_items i where i.purchase_id = p_id), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  النواقص داخل قسم الشراء
--  مستقل استقلالًا غير تام: يقرأ سطور النواقص، ويضيف عليها ما يحتاجه الشراء —
--  الكمية المقترحة، آخر تكلفة، آخر مورّد، وسرعة البيع خلال ٣٠ يومًا.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_shortages(
  p_token text, p_include_low boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_s public.purchase_sessions;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  return jsonb_build_object('ok', true, 'rows', coalesce((
    with sold as (
      select ii.product_id, sum(ii.quantity)::int as qty30
      from public.invoice_items ii
      join public.invoices i on i.id = ii.invoice_id
      where i.created_at > now() - interval '30 days'
        and ii.product_id is not null
      group by ii.product_id
    ),
    last_buy as (
      select distinct on (pi.product_id)
             pi.product_id, pi.landed_unit_cost, pu.supplier_id,
             pu.supplier_name, pu.created_at
      from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pu.status = 'posted' and pi.product_id is not null
      order by pi.product_id, pu.created_at desc
    ),
    base as (
      -- ① سطور النواقص المفتوحة (بما فيها اليدوية بدون منتج)
      select s.id            as shortage_id,
             s.product_id,
             s.name          as name,
             s.category,
             s.current_qty,
             s.limit_qty,
             s.status,
             s.is_manual
      from public.shortages s
      where not s.resolved
      union
      -- ② منتجات تحت حد التنبيه ولا سطر نواقص لها بعد
      select null::uuid, p.id, p.name,
             (select c.name from public.categories c where c.id = p.category_id),
             p.stock_quantity, coalesce(p.min_stock_alert, 0),
             case when p.stock_quantity <= 0 then 'out-of-stock'
                  when p.stock_quantity <= ceil(coalesce(p.min_stock_alert,0) / 2.0) then 'urgent'
                  else 'warning' end,
             false
      from public.products p
      where p_include_low
        and p.stock_quantity <= coalesce(p.min_stock_alert, 0)
        and not exists (select 1 from public.shortages s2
                        where s2.product_id = p.id and not s2.resolved)
    )
    select jsonb_agg(jsonb_build_object(
             'shortage_id',   b.shortage_id,
             'product_id',    b.product_id,
             'name',          b.name,
             'category',      b.category,
             'current_qty',   b.current_qty,
             'limit_qty',     b.limit_qty,
             'status',        b.status,
             'is_manual',     b.is_manual,
             'cost_price',    pr.cost_price,
             'selling_price', pr.selling_price,
             'has_imei',      pr.has_imei,
             'barcode',       pr.barcode,
             'sold_30d',      coalesce(sd.qty30, 0),
             'last_cost',     lb.landed_unit_cost,
             'last_supplier_id',   lb.supplier_id,
             'last_supplier_name', lb.supplier_name,
             'last_bought_at',     lb.created_at,
             -- الكمية المقترحة: تغطية حد التنبيه مرتين، أو مبيعات شهر — أيهما أكبر
             'suggested_qty', greatest(
                                (b.limit_qty * 2) - coalesce(b.current_qty, 0),
                                coalesce(sd.qty30, 0),
                                1)::int)
           order by
             case b.status when 'out-of-stock' then 0 when 'urgent' then 1
                           when 'warning' then 2 else 3 end,
             coalesce(sd.qty30, 0) desc,
             b.name)
    from base b
    left join public.products pr on pr.id = b.product_id
    left join sold      sd on sd.product_id = b.product_id
    left join last_buy  lb on lb.product_id = b.product_id
  ), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  لوحة الشراء — مؤشرات المدة
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_dashboard(p_token text, p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s    public.purchase_sessions;
  v_days int;
  v_from timestamptz;
begin
  v_s    := public.purchase_guard(p_token, 'MANAGER');
  v_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_from := now() - make_interval(days => v_days);

  return jsonb_build_object(
    'ok', true,
    'days', v_days,
    'kpis', jsonb_build_object(
      'purchases_count',  (select count(*) from public.purchases
                            where status = 'posted' and created_at >= v_from),
      'purchases_total',  (select coalesce(sum(total_amount), 0) from public.purchases
                            where status = 'posted' and created_at >= v_from),
      'purchases_paid',   (select coalesce(sum(paid_amount), 0) from public.purchases
                            where status = 'posted' and created_at >= v_from),
      'purchases_debt',   (select coalesce(sum(total_amount - paid_amount), 0)
                            from public.purchases
                            where status = 'posted' and created_at >= v_from),
      'returns_total',    (select coalesce(sum(total_amount), 0) from public.purchase_returns
                            where created_at >= v_from),
      'payments_total',   (select coalesce(sum(amount_paid), 0) from public.supplier_payments
                            where created_at >= v_from),
      'supplier_debt',    (select coalesce(sum(balance), 0) from public.suppliers
                            where balance > 0),
      'stock_value',      (select coalesce(sum(cost_price * stock_quantity), 0)
                            from public.products),
      'open_shortages',   (select count(*) from public.shortages where not resolved),
      'cancelled_count',  (select count(*) from public.purchases
                            where status = 'cancelled' and created_at >= v_from)),

    -- منحنى الشراء اليومي
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'total', d.total, 'count', d.cnt)
                       order by d.day)
      from (
        select (created_at at time zone 'Asia/Baghdad')::date as day,
               sum(total_amount) as total, count(*) as cnt
        from public.purchases
        where status = 'posted' and created_at >= v_from
        group by 1
      ) d), '[]'::jsonb),

    -- أعلى الموردين بالمدة
    'top_suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'supplier_id', t.supplier_id, 'name', t.supplier_name,
               'total', t.total, 'count', t.cnt) order by t.total desc)
      from (
        select supplier_id, coalesce(supplier_name,'—') as supplier_name,
               sum(total_amount) as total, count(*) as cnt
        from public.purchases
        where status = 'posted' and created_at >= v_from
        group by 1, 2
        order by 3 desc
        limit 8
      ) t), '[]'::jsonb),

    -- أكثر الأصناف شراءً
    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.product_name, 'qty', t.qty, 'total', t.total)
                       order by t.total desc)
      from (
        select i.product_name, sum(i.quantity)::int as qty, sum(i.total) as total
        from public.purchase_items i
        join public.purchases p on p.id = i.purchase_id
        where p.status = 'posted' and p.created_at >= v_from
        group by 1
        order by 3 desc
        limit 8
      ) t), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  كشف حساب مورّد
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_supplier_statement(p_token text, p_supplier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_sup public.suppliers%rowtype;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  select * into v_sup from public.suppliers where id = p_supplier_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'المورّد غير موجود');
  end if;

  return jsonb_build_object(
    'ok', true,
    'supplier', to_jsonb(v_sup),
    'movements', coalesce((
      select jsonb_agg(m order by m->>'at' desc)
      from (
        select jsonb_build_object(
                 'at', p.created_at, 'kind', 'purchase',
                 'ref', p.purchase_number, 'ref_id', p.id,
                 'amount', p.total_amount, 'paid', p.paid_amount,
                 'effect', p.total_amount - p.paid_amount,
                 'status', p.status) as m
        from public.purchases p
        where p.supplier_id = p_supplier_id
        union all
        select jsonb_build_object(
                 'at', sp.created_at, 'kind', 'payment',
                 'ref', 'تسديد', 'ref_id', sp.id,
                 'amount', sp.amount_paid, 'waived', sp.waived_amount,
                 'effect', -(sp.amount_paid + sp.waived_amount),
                 'status', 'posted')
        from public.supplier_payments sp
        where sp.supplier_id = p_supplier_id
        union all
        select jsonb_build_object(
                 'at', r.created_at, 'kind', 'return',
                 'ref', r.return_number, 'ref_id', r.id,
                 'amount', r.total_amount,
                 'effect', case when r.refund_method = 'BALANCE'
                                then -r.total_amount else 0 end,
                 'status', r.refund_method)
        from public.purchase_returns r
        where r.supplier_id = p_supplier_id
      ) x), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  قائمة مرتجعات الشراء
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_returns_list(
  p_token text, p_query text default '', p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_q   text;
  v_lim int;
begin
  v_s   := public.purchase_guard(p_token, 'MANAGER');
  v_q   := left(btrim(coalesce(p_query, '')), 80);
  v_lim := greatest(1, least(coalesce(p_limit, 50), 200));

  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'return_number', r.return_number,
             'supplier_name', r.supplier_name, 'supplier_id', r.supplier_id,
             'purchase_number', r.purchase_number,
             'total_amount', r.total_amount, 'refund_method', r.refund_method,
             'reason', r.reason, 'actor', r.actor, 'created_at', r.created_at,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'product_name', ri.product_name, 'quantity', ri.quantity,
                        'unit_cost', ri.unit_cost, 'total', ri.total))
               from public.purchase_return_items ri where ri.return_id = r.id), '[]'::jsonb))
           order by r.created_at desc)
    from (
      select * from public.purchase_returns r2
      where v_q = '' or r2.return_number ilike '%' || v_q || '%'
                     or coalesce(r2.supplier_name,'') ilike '%' || v_q || '%'
      order by r2.created_at desc
      limit v_lim
    ) r), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  دفعات الموردين
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_payments_list(
  p_token text, p_supplier_id uuid default null, p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_lim int;
begin
  v_s   := public.purchase_guard(p_token, 'MANAGER');
  v_lim := greatest(1, least(coalesce(p_limit, 50), 200));

  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', sp.id, 'supplier_id', sp.supplier_id, 'supplier_name', sp.supplier_name,
             'previous_balance', sp.previous_balance, 'amount_paid', sp.amount_paid,
             'waived_amount', sp.waived_amount, 'waiver_reason', sp.waiver_reason,
             'remaining_balance', sp.remaining_balance, 'notes', sp.notes,
             'actor', sp.actor, 'created_at', sp.created_at)
           order by sp.created_at desc)
    from (
      select * from public.supplier_payments s2
      where p_supplier_id is null or s2.supplier_id = p_supplier_id
      order by s2.created_at desc
      limit v_lim
    ) sp), '[]'::jsonb));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  سجل التدقيق — للمدير العام فقط
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_audit_list(
  p_token text, p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_lim int;
begin
  v_s   := public.purchase_guard(p_token, 'ADMIN');
  v_lim := greatest(1, least(coalesce(p_limit, 100), 500));

  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'at', a.at, 'actor', a.actor, 'role', a.role, 'action', a.action,
             'ref_table', a.ref_table, 'ref_id', a.ref_id,
             'terminal_id', a.terminal_id, 'ip', a.ip::text, 'detail', a.detail)
           order by a.at desc)
    from (select * from public.purchase_audit order by at desc limit v_lim) a
  ), '[]'::jsonb));
end;
$$;

commit;
