/**
 * يحلّ `playwright` سواء كان مثبَّتًا في المشروع أو عالميًا.
 * (`npm i playwright` محليًا، أو `npm i -g playwright`، أو عيّن PLAYWRIGHT_ROOT.)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function resolve(){
  try{ return await import('playwright'); }catch(_){ }
  const roots = [process.env.PLAYWRIGHT_ROOT];
  try{ roots.push(execFileSync('npm', ['root', '-g'], { encoding:'utf8' }).trim()); }catch(_){ }
  roots.push(join(dirname(dirname(process.execPath)), 'lib', 'node_modules'));
  for(const root of roots.filter(Boolean)){
    for(const entry of ['index.mjs', 'index.js']){
      const file = join(root, 'playwright', entry);
      if(existsSync(file)) return import(pathToFileURL(file).href);
    }
  }
  throw new Error('لم يُعثر على playwright — ثبّته بـ «npm i playwright» أو عيّن PLAYWRIGHT_ROOT');
}

export const { chromium } = await resolve();
