import {env} from 'cloudflare:workers';
import {caller,configured,json} from '../../../../lib/push/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){if(!await caller(req))return json({error:'sign_in_required'},401);return json({configured:configured(),publicKey:env.VAPID_PUBLIC_KEY||null})}
