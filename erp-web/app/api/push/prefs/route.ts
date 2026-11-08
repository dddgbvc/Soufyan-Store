import {caller, json, parseBody, sameOrigin} from '../../../../lib/push/server';
import {ServerError, serviceRpc} from '../../../../lib/yaqoot/server';
export const dynamic = 'force-dynamic';

// تفضيلات الإشعارات التلقائية للموظف الحالي.
export async function GET(req: Request) {
  const who = await caller(req);
  if (!who) return json({error: 'sign_in_required'}, 401);
  try {
    return json({prefs: await serviceRpc('web_push_prefs_get', {p_user: who.userId})});
  } catch (e) {
    return json({error: e instanceof ServerError && e.code === 'migration_missing' ? 'migration_missing' : 'prefs_unavailable'}, 503);
  }
}

export async function PUT(req: Request) {
  const who = await caller(req);
  if (!who) return json({error: 'sign_in_required'}, 401);
  if (!sameOrigin(req)) return json({error: 'origin_not_allowed'}, 403);
  try {
    const body = await parseBody(req);
    const prefs = body && typeof body.prefs === 'object' ? body.prefs : {};
    return json({prefs: await serviceRpc('web_push_prefs_set', {p_user: who.userId, p_prefs: prefs})});
  } catch (e) {
    return json({error: e instanceof ServerError && e.code === 'migration_missing' ? 'migration_missing' : 'prefs_save_failed'}, e instanceof ServerError ? e.status : 400);
  }
}
