// نشر على Cloudflare Workers بعد `pnpm build`.
//   CF_WORKER_NAME       اسم العامل (يحدد الرابط: <name>.<subdomain>.workers.dev) — لا يُحفظ في Git
//   CF_D1_DATABASE_ID    معرف قاعدة D1 للإشعارات (اختياري؛ بدونها تتعطل الإشعارات فقط)
//   CLOUDFLARE_API_TOKEN و CLOUDFLARE_ACCOUNT_ID لأداة wrangler
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const name = process.env.CF_WORKER_NAME || '';
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error('CF_WORKER_NAME مطلوب: حروف صغيرة وأرقام وشرطة، حتى 63 حرفاً.');

const configPath = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.name = name;
config.topLevelName = name;
config.workers_dev = true;
config.preview_urls = false;
const d1 = process.env.CF_D1_DATABASE_ID;
config.d1_databases = d1 ? [{binding: 'DB', database_name: 'yaqoot-push', database_id: d1}] : [];
writeFileSync(configPath, JSON.stringify(config));

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const r = spawnSync(process.execPath, [wrangler, 'deploy', '--config', configPath], {stdio: 'inherit'});
process.exit(r.status ?? 1);
