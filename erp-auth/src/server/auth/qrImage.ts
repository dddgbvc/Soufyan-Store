import 'server-only';

import QRCode from 'qrcode';

/**
 * Renders the challenge URL as a QR image on the server.
 *
 * Doing it here keeps the QR library out of the browser bundle, and returning a
 * `data:` URI rather than raw markup means the page can display it with a plain
 * `<img>` — an inert context — instead of injecting SVG into the document.
 */
export async function renderChallengeQr(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
    color: {
      dark: '#f2f3f7',
      light: '#00000000',
    },
  });

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
