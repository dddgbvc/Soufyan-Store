// الإشعارات التلقائية: Cron في Cloudflare يستدعي هذا كل دقيقة.
// قاعدة البيانات (web_push_collect) تحدد ما الجديد ومن يستلمه حسب التفضيلات والصلاحيات.
import {env} from 'cloudflare:workers';
import webpush from 'web-push';
import {ServerError, serviceRpc} from '../yaqoot/server';
import {validEndpoint} from './validation';
import {pushStore} from './server';

type Device = {id: string; endpoint: string; p256dh: string; auth: string};
type Item = {kind: string; title: string; body: string; tag: string; url: string; devices: Device[]};

export async function deliver(device: Device, payload: {title: string; body: string; tag: string; url: string}): Promise<'accepted' | 'expired' | 'failed'> {
  if (!validEndpoint(device.endpoint)) return 'failed';
  try {
    const details = webpush.generateRequestDetails(
      {endpoint: device.endpoint, keys: {p256dh: device.p256dh, auth: device.auth}},
      JSON.stringify(payload),
      {TTL: 6 * 3600, urgency: 'high', contentEncoding: 'aes128gcm',
        vapidDetails: {subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!}},
    );
    const res = await fetch(details.endpoint, {
      method: 'POST', headers: details.headers as Record<string, string>, body: new Uint8Array(details.body!) as BodyInit,
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return 'accepted';
    if (res.status === 404 || res.status === 410) return 'expired';
    return 'failed';
  } catch {
    return 'failed';
  }
}

export async function runAutoPush() {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return {skipped: 'vapid_missing'};
  // web_push_collect_all = الأحداث المخصصة + كل حركات المحل للمدير العام (ترحيل 160000).
  let items: Item[];
  try {
    items = await serviceRpc<Item[]>('web_push_collect_all', {});
  } catch (e) {
    if (!(e instanceof ServerError && e.code === 'migration_missing')) throw e;
    items = await serviceRpc<Item[]>('web_push_collect', {});
  }
  const expired = new Set<string>();
  let accepted = 0, failed = 0;
  for (const item of items || []) {
    const payload = {title: item.title, body: item.body, tag: item.tag, url: item.url};
    const results = await Promise.all(item.devices.filter(d => !expired.has(d.id) && !d.endpoint.startsWith('native:')).map(async d => {
      const r = await deliver(d, payload);
      if (r === 'expired') expired.add(d.id);
      return r;
    }));
    accepted += results.filter(r => r === 'accepted').length;
    failed += results.filter(r => r === 'failed').length;
  }
  await Promise.all([...expired].map(id => pushStore.removeExpired(id).catch(() => null)));
  return {items: items?.length || 0, accepted, failed, expired: expired.size};
}
