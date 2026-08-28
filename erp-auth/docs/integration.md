# الدمج مع الـERP — Integration

الهدف من هذا النظام أن يُبنى فوقه: تضيف قسم الكاشير أو المخزون أو الديون، ولا تعيد
كتابة سطر واحد من المصادقة.

---

## خياران للدمج

### أ. الـERP داخل هذا المشروع

الأبسط. أضف مساراتك تحت `src/app/dashboard/` وجداولك في `public`، واستخدم الحارس
كما هو.

### ب. الـERP تطبيق منفصل

أبقِ هذا المشروع خدمة مصادقة، وشارك معه قاعدة البيانات نفسها. تطبيق الـERP يتحقق من
الجلسة عبر `/api/auth/session` أو يستدعي `resolveSession()` مباشرة إن شارك الشيفرة.

الباقي هنا يفترض الخيار (أ)، وكل شيء ينطبق على (ب) مع استبدال الاستدعاء المحلي بنداء
شبكي.

---

## إضافة قسم جديد

### ١. سجّل القسم وصلاحياته

هجرة جديدة في `db/migrations/`:

```sql
insert into erp_auth.modules (key, name, description, icon, route, sort_order)
values ('purchases', 'المشتريات', 'فواتير الشراء والموردون', 'invoices', '/dashboard/purchases', 35)
on conflict (key) do update set name = excluded.name;

insert into erp_auth.permissions (key, module, action, name, description, is_dangerous, sort_order)
values
  ('purchases.view',   'purchases', 'view',   'مشاهدة المشتريات', 'استعراض فواتير الشراء', false, 10),
  ('purchases.create', 'purchases', 'create', 'إضافة فاتورة شراء', 'تسجيل شراء جديد',      false, 20),
  ('purchases.delete', 'purchases', 'delete', 'حذف فاتورة شراء',  'حذف نهائي',             true,  30)
on conflict (key) do update set name = excluded.name;
```

القسم يظهر تلقائياً في التنقّل لمن يملك أي صلاحية فيه، وصلاحياته تظهر في المحرر.
لا تعديل كود.

### ٢. احرس صفحاتك

```tsx
// src/app/dashboard/purchases/page.tsx
import { Forbidden } from '@/components/dashboard/Forbidden';
import { guardPage } from '@/server/authz/page';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  const auth = await guardPage('purchases.view');
  if (!auth) return <Forbidden permissionKey="purchases.view" />;

  const purchases = await listPurchases();
  return <PurchaseList purchases={purchases} canDelete={auth.can('purchases.delete')} />;
}
```

### ٣. احرس نقاط النهاية

```ts
// src/app/api/purchases/route.ts
import { handle } from '@/server/api/respond';
import { requirePermission } from '@/server/authz/guard';
import { assertCsrf } from '@/server/security/csrf';
import { parseBody } from '@/server/security/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();                                   // كل طلب يغيّر حالة
    const actor = await requirePermission('purchases.create');
    const body = await parseBody(request, purchaseSchema);

    const purchase = await createPurchase(body, actor.employee.id);

    await auditRepo.record({
      event: 'purchase.created',
      employeeId: actor.employee.id,
      actorEmployeeId: actor.employee.id,
      sessionId: actor.session.id,
      targetType: 'purchase',
      targetId: purchase.id,
      metadata: { total: purchase.total },
    });

    return { purchase };
  });
}
```

`handle` يحوّل `AuthError` إلى رمز HTTP صحيح ويمنع تسرّب أي أثر داخلي.

> أسماء أحداث التدقيق تخضع لقيد `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`.

### ٤. احرس البيانات بـRLS

طبقة أخيرة لو وصل أحد إلى قاعدة البيانات بطريق آخر:

```sql
alter table public.purchases enable row level security;

create policy purchases_read on public.purchases
  for select using (public.erp_auth_can('purchases.view'));

create policy purchases_insert on public.purchases
  for insert with check (public.erp_auth_can('purchases.create'));

create policy purchases_delete on public.purchases
  for delete using (public.erp_auth_can('purchases.delete'));
```

`public.erp_auth_can(key)` هو خطّاف الدمج: يستنتج الموظف الحالي ويجيب بنعم/لا. نفس
المفتاح المستخدم في الحارس، فلا يمكن أن تختلف الطبقتان في الرأي.

---

## معرفة الموظف الحالي

**في مكوّن خادمي**

```ts
const auth = await guardAuthenticated();
auth.employee.id;
auth.employee.fullName;
auth.can('purchases.delete');
```

**في مسار API**

```ts
const auth = await requirePermission('purchases.view');
```

**في المتصفح**

```ts
const session = await apiFetch<SessionResponse>('/api/auth/session');
```

**في SQL**

```sql
select erp_auth.current_employee_id();
select public.erp_auth_can('purchases.view');
```

---

## ربط جداول الـERP بالموظف

```sql
alter table public.purchases
  add column created_by uuid references erp_auth.employees (id) on delete set null;
```

`on delete set null` مقصود: حذف موظف لا يجوز أن يحذف فواتير الشراء. لجداول السجلات
التي لا تُعدَّل (مثل سجلات التدقيق) استخدم `uuid` بلا مفتاح أجنبي — راجع
[database.md](database.md).

---

## ربط ERP قائم بالفعل

إن كان لديك جدول `public.employees` يعمل:

1. **لا تدمج الجدولين.** `erp_auth.employees` يملك الهوية والاعتماد؛ جدولك يملك
   البيانات المهنية.
2. أضف جسراً:

```sql
alter table public.employees
  add column auth_employee_id uuid unique references erp_auth.employees (id) on delete set null;
```

3. اربط الصفوف الموجودة بالبريد أو الرمز الوظيفي:

```sql
update public.employees p
set auth_employee_id = a.id
from erp_auth.employees a
where lower(p.email) = lower(a.email)
  and p.auth_employee_id is null;
```

4. حوّل الشاشات تدريجياً إلى `erp_auth.current_employee_id()` بدل آلية الهوية القديمة.
5. عند اكتمال التحويل، عطّل مسار الدخول القديم.

المخطّط منفصل، فالانتقال يمكن أن يتم على مراحل وبلا توقف.

---

## ما لا ينبغي فعله

| ❌ | لماذا |
|---|---|
| قراءة `erp_auth.employees` بمفتاح `anon` | المخطّط غير معروض عمداً؛ عرضه يُبطل نموذج الأمان |
| الاعتماد على `permissions` المحمّلة في المتصفح للتفويض | الواجهة راحة لا حماية |
| تخزين معرّف الموظف في `localStorage` واستخدامه كهوية | الجلسة وحدها مصدر الهوية |
| تكرار منطق hash الرمز | استخدم `setPinFor` — يفرض القوة والتفرّد ويكتب التدقيق |
| كتابة سياسة RLS بمنطق صلاحيات خاص | استخدم `erp_auth_can` ليبقى القرار واحداً |
| إضافة نظام أدوار فوق الصلاحيات | إن احتجت قوالب جاهزة، اجعلها اختصارات في الواجهة تكتب نفس المنح |
