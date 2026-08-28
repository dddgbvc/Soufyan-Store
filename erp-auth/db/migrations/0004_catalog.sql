-- =============================================================================
-- 0004_catalog.sql — module + permission catalogue (reference data, idempotent)
-- -----------------------------------------------------------------------------
-- This is NOT seed data: it is the fixed vocabulary the whole system speaks.
-- Re-running it keeps labels in sync without touching any grant.
-- =============================================================================

insert into erp_auth.modules (key, name, description, icon, route, sort_order, is_admin) values
  ('cashier',     'الكاشير',    'نقطة البيع وإدارة عمليات البيع اليومية', 'cashier',     '/dashboard/cashier',     10, false),
  ('inventory',   'المخزون',    'المنتجات والكميات والأسعار والجرد',      'inventory',   '/dashboard/inventory',   20, false),
  ('invoices',    'الفواتير',   'فواتير البيع وتفاصيلها',                 'invoices',    '/dashboard/invoices',    30, false),
  ('debts',       'الديون',     'ديون الزبائن والتسديدات',                'debts',       '/dashboard/debts',       40, false),
  ('customers',   'العملاء',    'سجل الزبائن وبياناتهم',                  'customers',   '/dashboard/customers',   50, false),
  ('maintenance', 'الصيانة',    'طلبات الصيانة ومتابعتها',                'maintenance', '/dashboard/maintenance', 60, false),
  ('expenses',    'المصاريف',   'مصاريف المحل وتوثيقها',                  'expenses',    '/dashboard/expenses',    70, false),
  ('reports',     'التقارير',   'تقارير المبيعات والأرباح',               'reports',     '/dashboard/reports',     80, false),
  ('employees',   'الموظفون',   'إدارة الموظفين والصلاحيات',              'employees',   '/dashboard/employees',   90, true),
  ('settings',    'الإعدادات',  'إعدادات النظام وسجل التدقيق',            'settings',    '/dashboard/settings',   100, true)
on conflict (key) do update
  set name        = excluded.name,
      description = excluded.description,
      icon        = excluded.icon,
      route       = excluded.route,
      sort_order  = excluded.sort_order,
      is_admin    = excluded.is_admin;

insert into erp_auth.permissions (key, module, action, name, description, is_dangerous, sort_order) values
  -- الكاشير
  ('cashier.view',            'cashier',     'view',         'فتح الكاشير',        'الدخول إلى شاشة نقطة البيع',                false, 10),
  ('cashier.create_sale',     'cashier',     'create_sale',  'إنشاء بيع',          'تسجيل عملية بيع جديدة',                     false, 20),
  ('cashier.cancel_sale',     'cashier',     'cancel_sale',  'إلغاء بيع',          'إلغاء عملية بيع قبل أو بعد الإتمام',        true,  30),
  ('cashier.refund',          'cashier',     'refund',       'استرجاع',            'إرجاع بضاعة وإعادة المبلغ للزبون',          true,  40),

  -- المخزون
  ('inventory.view',          'inventory',   'view',         'مشاهدة المخزون',     'استعراض المنتجات والكميات',                 false, 10),
  ('inventory.create',        'inventory',   'create',       'إضافة منتج',         'إضافة منتجات جديدة إلى المخزون',            false, 20),
  ('inventory.update',        'inventory',   'update',       'تعديل منتج',         'تعديل بيانات منتج موجود',                   false, 30),
  ('inventory.delete',        'inventory',   'delete',       'حذف منتج',           'حذف منتج من المخزون',                       true,  40),
  ('inventory.change_price',  'inventory',   'change_price', 'تعديل السعر',        'تغيير أسعار البيع أو الشراء',               true,  50),
  ('inventory.adjust',        'inventory',   'adjust',       'جرد وتسوية',         'تعديل الكميات بعد الجرد',                   true,  60),

  -- الفواتير
  ('invoices.view',           'invoices',    'view',         'مشاهدة الفواتير',    'استعراض الفواتير وتفاصيلها',                false, 10),
  ('invoices.create',         'invoices',    'create',       'إنشاء فاتورة',       'إصدار فاتورة جديدة',                        false, 20),
  ('invoices.update',         'invoices',    'update',       'تعديل فاتورة',       'تعديل فاتورة صادرة',                        true,  30),
  ('invoices.cancel',         'invoices',    'cancel',       'إلغاء فاتورة',       'إلغاء فاتورة صادرة',                        true,  40),

  -- الديون
  ('debts.view',              'debts',       'view',         'مشاهدة الديون',      'استعراض ديون الزبائن',                      false, 10),
  ('debts.create',            'debts',       'create',       'إضافة دين',          'تسجيل دين جديد على زبون',                   false, 20),
  ('debts.update',            'debts',       'update',       'تعديل دين',          'تعديل مبلغ أو تفاصيل دين',                  true,  30),
  ('debts.payment',           'debts',       'payment',      'تسديد دين',          'تسجيل دفعة على دين',                        false, 40),
  ('debts.delete',            'debts',       'delete',       'حذف دين',            'حذف سجل دين نهائياً',                       true,  50),

  -- العملاء
  ('customers.view',          'customers',   'view',         'مشاهدة العملاء',     'استعراض سجل الزبائن',                       false, 10),
  ('customers.create',        'customers',   'create',       'إضافة عميل',         'إضافة زبون جديد',                           false, 20),
  ('customers.update',        'customers',   'update',       'تعديل عميل',         'تعديل بيانات زبون',                         false, 30),
  ('customers.delete',        'customers',   'delete',       'حذف عميل',           'حذف زبون من السجل',                         true,  40),

  -- الصيانة
  ('maintenance.view',        'maintenance', 'view',         'مشاهدة الصيانة',     'استعراض طلبات الصيانة',                     false, 10),
  ('maintenance.create',      'maintenance', 'create',       'إضافة طلب صيانة',    'تسجيل جهاز جديد للصيانة',                   false, 20),
  ('maintenance.update',      'maintenance', 'update',       'تحديث طلب صيانة',    'تحديث حالة أو تفاصيل الصيانة',              false, 30),

  -- المصاريف
  ('expenses.view',           'expenses',    'view',         'مشاهدة المصاريف',    'استعراض مصاريف المحل',                      false, 10),
  ('expenses.create',         'expenses',    'create',       'إضافة مصروف',        'تسجيل مصروف جديد',                          false, 20),

  -- التقارير
  ('reports.view',            'reports',     'view',         'مشاهدة التقارير',    'الاطلاع على تقارير المبيعات والأرباح',      false, 10),

  -- الإعدادات
  ('settings.view',           'settings',    'view',         'مشاهدة الإعدادات',   'الاطلاع على الإعدادات وسجل التدقيق',        false, 10),
  ('settings.update',         'settings',    'update',       'تعديل الإعدادات',    'تغيير إعدادات النظام',                      true,  20),

  -- الموظفون
  ('employees.view',          'employees',   'view',         'مشاهدة الموظفين',    'استعراض قائمة الموظفين',                    false, 10),
  ('employees.create',        'employees',   'create',       'إضافة موظف',         'إنشاء حساب موظف جديد',                      true,  20),
  ('employees.update',        'employees',   'update',       'تعديل موظف',         'تعديل بيانات موظف أو تعطيله',               true,  30),
  ('employees.delete',        'employees',   'delete',       'حذف موظف',           'حذف حساب موظف نهائياً',                     true,  40),
  ('employees.permissions',   'employees',   'permissions',  'إدارة الصلاحيات',    'منح أو سحب صلاحيات الموظفين',               true,  50)
on conflict (key) do update
  set module       = excluded.module,
      action       = excluded.action,
      name         = excluded.name,
      description  = excluded.description,
      is_dangerous = excluded.is_dangerous,
      sort_order   = excluded.sort_order;
