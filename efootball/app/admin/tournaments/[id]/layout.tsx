import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTournamentAdmin } from '@/lib/permissions';

const SECTIONS = [
  ['', 'لوحة التحكم'],
  ['players', 'اللاعبون'],
  ['invites', 'الدعوات'],
  ['check-in', 'الحضور'],
  ['matches', 'المباريات'],
  ['disputes', 'النزاعات'],
  ['draw', 'القرعة'],
  ['news', 'الأخبار'],
  ['moderation', 'البلاغات'],
  ['settings', 'الإعدادات'],
  ['audit', 'سجل التدقيق'],
] as const;

export default async function AdminTournamentLayout(props: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/admin/tournaments/${id}`);
  if (!(await isTournamentAdmin(id, user.id))) notFound();

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, slug, accent_color')
    .eq('id', id)
    .maybeSingle();

  if (!tournament) notFound();

  return (
    <div className="shell" style={{ paddingBlock: '28px 80px' }}>
      <div
        aria-hidden
        style={{ height: 4, width: 64, background: tournament.accent_color, marginBlockEnd: 14 }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontSize: 26 }}>{tournament.name}</h1>
        <Link
          href={`/tournaments/${tournament.slug}`}
          style={{ fontSize: 13, color: 'var(--text-muted)' }}
        >
          عرض الصفحة العامة ←
        </Link>
      </div>

      <nav
        aria-label="أقسام الإدارة"
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          marginBlock: '18px 24px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {SECTIONS.map(([path, label]) => (
          <Link
            key={path}
            href={`/admin/tournaments/${id}${path ? `/${path}` : ''}`}
            style={{
              padding: '9px 13px',
              whiteSpace: 'nowrap',
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {props.children}
    </div>
  );
}
