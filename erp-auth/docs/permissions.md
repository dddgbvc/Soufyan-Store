# نظام الصلاحيات — Permissions & RLS

## المبدأ

لا أدوار ثابتة. كل موظف يحمل مجموعته الخاصة من الصلاحيات الذرّية، بصيغة
`module.action`.

```
أحمد (كاشير)                     علي (أمين مخزن)
├── cashier.view                 ├── inventory.view
├── cashier.create_sale          ├── inventory.create
├── cashier.cancel_sale          ├── inventory.update
├── cashier.refund               ├── inventory.delete
├── inventory.view               ├── inventory.change_price
├── inventory.adjust             ├── inventory.adjust
├── customers.*                  └── reports.view
└── invoices.view, create
```

أحمد يرى المخزون ويجرده لكنه لا يستطيع حذف منتج. علي يدير المخزون كاملاً لكنه
لا يفتح الكاشير ولا يرى زبوناً واحداً. هذا الفرق مفروض في الخادم، لا في الواجهة.

## الكتالوج

٣٦ صلاحية على ١٠ أقسام: `cashier`، `inventory`، `invoices`، `debts`، `customers`،
`maintenance`، `expenses`، `reports`، `employees`، `settings`.

الكتالوج بيانات مرجعية في `db/migrations/0004_catalog.sql`، وإعادة تطبيقه تحدّث
التسميات دون المساس بأي منح. إضافة قسم جديد للـERP = إضافة صفوف هناك؛ لا تغيير كود.

الصلاحيات الهدّامة (`is_dangerous`) — الحذف، الإلغاء، تعديل السعر، إدارة الصلاحيات —
تظهر مميّزة في المحرر حتى لا تُمنح سهواً.

## حساب المالك

`is_owner = true` يعني امتلاك كل الصلاحيات ضمنياً. السبب عملي: بدونه يمكن لخطأ في
إدارة الصلاحيات أن يقفل النظام على نفسه بلا طريق للعودة.

يحرسه مُشغِّل `guard_last_owner`: لا يمكن حذف أو تعطيل آخر مالك نشط، ولا يستطيع
غير المالك تعديل حساب مالك.

---

## أين يُفرض القرار

### ١. طبقة الـAPI — الحارس الحقيقي

```ts
export async function POST(request: Request) {
  return handle(async () => {
    await assertCsrf();
    const actor = await requirePermission('employees.create');
    …
  });
}
```

`requirePermission` تستشير قاعدة البيانات في كل طلب — لا تثق بقائمة الصلاحيات
المحمّلة في الذاكرة ولا بأي شيء أرسله المتصفح. الرفض يُسجَّل كـ`authz.denied`.

### ٢. الصفحات

```ts
const auth = await guardPage('employees.view');
if (!auth) return <Forbidden permissionKey="employees.view" />;
```

الفحص يقع قبل أي عرض. حتى صفحات الأقسام المبدئية (`/dashboard/[module]`) تمرّ
بـ`requirePermission(`${module}.view`)` — فهي مسارات محروسة فعلاً، لا نماذج.

### ٣. RLS في قاعدة البيانات

طبقة مستقلة تحت الطبقتين السابقتين. الجداول السرّية — `sessions` و`otp_requests`
و`qr_login_challenges` و`rate_limits` — **بلا أي سياسة**، أي مرفوضة لكل دور غير
المالك، إضافة إلى سحب الامتيازات أصلاً.

للجداول الأخرى سياسات مبنية على `current_employee_id()`:

| الجدول | القراءة | الكتابة |
|---|---|---|
| `employees` | صفّه أو `employees.view` | `employees.update` |
| `permissions`, `modules` | أي موظف مصادَق | — |
| `employee_permissions` | صفوفه أو `employees.permissions` | `employees.permissions` |
| `sessions` | جلساته فقط | إبطال جلساته فقط |
| `audit_logs` | `settings.view` أو أحداثه هو | لا شيء (إضافة فقط) |

اختبار `keeps the credential tables unreachable from an unprivileged role` ينشئ
دوراً بلا امتيازات ويؤكد رفض القراءة على كل جدول حسّاس.

**من هو «الموظف الحالي» في RLS؟** `current_employee_id()` تقرأ من Supabase Auth JWT
وحده. لا يوجد متغيّر جلسة للتجاوز عمداً: أي دور يستطيع تنفيذ `SET` على متغيّر مخصّص،
و`erp_auth_can` تعمل بصلاحية المالك (SECURITY DEFINER) فلا يمكنها التمييز داخلياً بين
عميل متصفح وكود خادم موثوق. الكود الذي يحتاج التصرّف نيابة عن موظف يتصل بدور مالك
المخطّط ويتجاوز RLS صراحةً — وهو ما تفعله طبقة التطبيق هنا.

### ٤. الواجهة — راحة فقط

التنقّل مبني من الأقسام التي سمح بها الخادم، والأزرار تظهر حسب `can`. هذا يمنع
الإحباط، **وليس** حماية. كل زرّ مخفي يقابله فحص خادمي كامل.

---

## منع تصعيد الصلاحيات

| الحالة | النتيجة |
|---|---|
| موظف يعدّل صلاحيات نفسه | مرفوض — `cannot_edit_own_permissions` |
| غير مالك يعدّل مالكاً | مرفوض — `forbidden` |
| موظف يعطّل نفسه | مرفوض — `cannot_disable_self` |
| موظف يحذف نفسه | مرفوض — `cannot_delete_self` |
| حذف آخر مالك نشط | مرفوض من مُشغِّل قاعدة البيانات |
| منح مفتاح غير موجود | مرفوض — لا يُكتب شيء |
| موظف معطَّل | `has_permission` تُرجع false لكل مفتاح |

الحالة الأخيرة مهمّة: التعطيل يسحب كل القدرات فوراً على مستوى الدالة نفسها، فلا
حاجة لتنظيف المنح.

---

## الاستخدام

**في الخادم**

```ts
const auth = await requirePermission('inventory.delete');   // يرمي عند الرفض
const ok   = await permissionsRepo.hasPermission(id, 'inventory.delete');
```

**في الواجهة**

```tsx
import { can, canAccessModule } from '@/lib/permissions';

{can(permissions, 'inventory.delete') ? <DeleteButton /> : null}
```

**في SQL (لجداول الـERP)**

```sql
create policy products_read on public.products
  for select using (public.erp_auth_can('inventory.view'));

create policy products_delete on public.products
  for delete using (public.erp_auth_can('inventory.delete'));
```

نفس المفتاح، نفس الدالة، ثلاث طبقات.
