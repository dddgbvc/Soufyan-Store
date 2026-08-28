/**
 * Development seed data.
 *
 * Creates one owner plus a few employees with deliberately different capability
 * sets, so the permission system can be exercised end to end. The PINs below
 * are TEST CREDENTIALS: they are printed on purpose and must never be used on
 * a real deployment.
 *
 *   npm run db:seed
 */
import { loadEnv } from './load-env';

loadEnv();

interface SeedEmployee {
  employeeCode: string;
  fullName: string;
  email: string;
  jobTitle: string;
  status: 'active' | 'disabled' | 'suspended';
  isOwner: boolean;
  pin: string;
  permissions: string[];
  note: string;
}

const SEED: SeedEmployee[] = [
  {
    employeeCode: 'EMP-0001',
    fullName: 'المدير العام',
    email: 'manager@dev.local',
    jobTitle: 'مدير عام',
    status: 'active',
    isOwner: true,
    pin: '470182',
    permissions: [],
    note: 'حساب مالك — يملك كل الصلاحيات ضمنياً ولا يمكن حذفه أو تعطيله',
  },
  {
    employeeCode: 'EMP-0002',
    fullName: 'أحمد',
    email: 'ahmed@dev.local',
    jobTitle: 'كاشير',
    status: 'active',
    isOwner: false,
    pin: '315907',
    permissions: [
      'cashier.view', 'cashier.create_sale', 'cashier.cancel_sale', 'cashier.refund',
      'inventory.view', 'inventory.adjust',
      'customers.view', 'customers.create', 'customers.update', 'customers.delete',
      'invoices.view', 'invoices.create',
    ],
    note: 'الكاشير كامل + مشاهدة المخزون والجرد + العملاء',
  },
  {
    employeeCode: 'EMP-0003',
    fullName: 'علي',
    email: 'ali@dev.local',
    jobTitle: 'أمين مخزن',
    status: 'active',
    isOwner: false,
    pin: '826431',
    permissions: [
      'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
      'inventory.change_price', 'inventory.adjust',
      'reports.view',
    ],
    note: 'المخزون كامل + التقارير — بلا كاشير ولا عملاء',
  },
  {
    employeeCode: 'EMP-0004',
    fullName: 'سارة',
    email: 'sara@dev.local',
    jobTitle: 'محاسبة',
    status: 'active',
    isOwner: false,
    pin: '594073',
    permissions: [
      'debts.view', 'debts.create', 'debts.update', 'debts.payment',
      'invoices.view', 'invoices.create', 'invoices.update',
      'customers.view',
      'expenses.view', 'expenses.create',
      'reports.view',
    ],
    note: 'الديون والفواتير والمصاريف — بلا حذف ولا مخزون',
  },
  {
    employeeCode: 'EMP-0005',
    fullName: 'موظف معطّل',
    email: 'disabled@dev.local',
    jobTitle: 'كاشير سابق',
    status: 'disabled',
    isOwner: false,
    pin: '735219',
    permissions: ['cashier.view'],
    note: 'حساب معطّل — لاختبار رفض الدخول رغم صحة الرمز',
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed test credentials into a production environment.');
  }

  const { sql, closeDatabase } = await import('@/server/db/client');
  const { hashSecret, blindIndex } = await import('@/server/security/crypto');

  try {
    const catalogue = await sql<{ count: string }[]>`select count(*)::text as count from erp_auth.permissions`;
    if (Number(catalogue[0].count) === 0) {
      throw new Error('Permission catalogue is empty. Run `npm run db:migrate` first.');
    }

    for (const person of SEED) {
      const pinHash = await hashSecret(person.pin, 'pin');
      const pinLookup = blindIndex(person.pin, 'pin');

      const [row] = await sql<{ id: string }[]>`
        insert into erp_auth.employees
          (employee_code, full_name, email, job_title, status, is_owner, pin_hash, pin_lookup, pin_set_at)
        values
          (${person.employeeCode}, ${person.fullName}, ${person.email}, ${person.jobTitle},
           ${person.status}::erp_auth.employee_status, ${person.isOwner},
           ${pinHash}, ${pinLookup}, now())
        on conflict (lower(employee_code)) do update
          set full_name = excluded.full_name,
              email = excluded.email,
              job_title = excluded.job_title,
              status = excluded.status,
              pin_hash = excluded.pin_hash,
              pin_lookup = excluded.pin_lookup,
              pin_set_at = now(),
              must_change_pin = false,
              failed_attempts = 0,
              locked_until = null
        returning id
      `;

      await sql`delete from erp_auth.employee_permissions where employee_id = ${row.id}`;
      if (person.permissions.length > 0) {
        await sql`
          insert into erp_auth.employee_permissions (employee_id, permission_id)
          select ${row.id}, p.id from erp_auth.permissions p where p.key = any(${person.permissions}::text[])
        `;
      }

      console.log(`  ✓ ${person.employeeCode}  ${person.fullName.padEnd(14)} PIN ${person.pin}  — ${person.note}`);
    }

    console.log('\n  ⚠ بيانات تجريبية للتطوير فقط — غيّر كل الأرقام قبل أي استخدام حقيقي.');
    console.log('  ⚠ DEVELOPMENT TEST DATA — rotate every PIN before any real deployment.\n');
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
