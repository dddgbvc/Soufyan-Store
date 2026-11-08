# Web Push — Yaqoot

Published owner-private Site: https://yaqoot-sufyan-erp.beefycup1.chatgpt.site
Project: appgprj_6aefad79e374819197b8400d7b82e49d

Device setup: open installed Home Screen app → settings → enable notifications → Allow. Registration never sends a notification. Permission must be granted by the user. Push subscriptions and send history live in the Site D1 database; ERP demo data remains local. VAPID keys are runtime secrets, never source. Keep the same VAPID key pair when redeploying or existing devices need re-enrollment.

## Send only after user explicitly requests a test

1. Obtain fresh `get_site` result and verify the Site is still owner-only (custom access, sole viewer is owner, no groups). If changed, stop and revise service authorization before sending. Never change sharing to fix push.
2. Keep `siwc_bypass_bearer_token` in tool session memory. No token in shell arguments, files, Git, logs or user-visible output.
3. Start `python3 scripts/push-admin.py` with a PTY. After hidden-input prompt, pass JSON via stdin: `{token,action:"status"}`. Confirm configured and at least one registered device. Do not invent a subscription.
4. When explicitly authorized, run again with `{token,action:"send",requestId,title,body}`. Use one unique requestId (16–80 URL-safe characters); reuse it on retries. Default text: title `ياقوت | إشعار تجريبي`, body `وصل إشعار التجربة من مكتب سفيان للموبايل ✅`. Send to the owner's registered devices only.
5. Report accepted/failed/expired counts honestly. Acceptance by the push service is not proof of screen display/read. Ask the user to confirm receipt. A 404/410 subscription is removed; user can enable again. Rate limit: 30 seconds. Do not auto retry ambiguous network failures with a new ID.

`action:"assets"` checks deployed service-worker/manifest MIME types without sending.

## Security and implementation

Private dispatch authenticates service requests; `X-Yaqoot-Operation: owner-push` only selects the service route, it is not a secret. This fallback is safe only under the verified owner-private Site policy. Browser registration requires injected authenticated user identity and same-origin checks. No browser obtains VAPID private key or service bearer. Endpoint allowlist and redirects disabled prevent arbitrary outbound destinations. Per-user storage and browser queries are scoped. Request IDs deduplicate, expired subscriptions are removed, history is durable. Service worker always displays a notification and only opens /#alerts; no private page caching. Delivery while screen is locked requires network and notification permission; Focus may silence alerts. Powered-off devices cannot display alerts immediately.

Checks: TypeScript, `node --experimental-strip-types --test tests/push.test.mjs`, production Worker build. Tests encrypt/decrypt Arabic payloads locally and simulate worker display/navigation; they do not contact push services. Actual iPhone delivery must be verified after user enrollment and explicit send request.

## Bounded test series

When explicitly requested, pass `count:5` (maximum 5) to the send command. The owner service runs a single bounded foreground series, with at least 5 seconds between round starts. Each notification uses a distinct tag and numbered title. Slow push services may lengthen intervals; device display timing is controlled by iOS. Browser callers cannot start a series. The original 30-second request limit and idempotency remain, and active series block another request for up to 120 seconds. Send history stores aggregate counts. The response includes each round timestamp and counts. Reuse the same request ID after an ambiguous timeout, never start a replacement series without checking history. This creates no recurring automation.
