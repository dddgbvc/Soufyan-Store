import { handle } from '@/server/api/respond';
import { createChallenge } from '@/server/auth/qr';
import { renderChallengeQr } from '@/server/auth/qrImage';
import { assertCsrf } from '@/server/security/csrf';
import { getRequestContext } from '@/server/security/requestContext';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Mints a login challenge for the waiting screen. The response carries the QR
 * payload and the poll secret; neither is written to storage by the client.
 */
export async function POST() {
  return handle(async () => {
    await assertCsrf();
    const context = await getRequestContext();

    const challenge = await createChallenge(context);
    // Rendered server-side so the QR library never ships to the browser.
    const image = await renderChallengeQr(challenge.url);

    return { ...challenge, image };
  });
}
