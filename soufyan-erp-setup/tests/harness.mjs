/**
 * أدوات مشتركة لاختبارات المتصفح.
 *
 * الاختبارات تشغّل الصفحة نفسها في Chromium حقيقي، وتعترض نداءات Supabase
 * وتردّ بالعقود نفسها التي تعيدها دوال المشروع الحقيقية (قُرئت من قاعدة
 * البيانات: `verify_employee_pin` و`app_session_*` ودالة `webauthn`).
 * فهي تختبر العميل مقابل عقد الخادم — لا مقابل خادم وهمي اخترعناه.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

export const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
export const SESSION = '11111111-2222-3333-4444-555555555555';
export const sha256hex = s => createHash('sha256').update(s).digest('hex');

export const launch = () => chromium.launch({ executablePath: EXE });

export function reporter(){
  let pass = 0, fail = 0;
  return {
    ok(cond, msg){ cond ? pass++ : fail++; console.log((cond ? '  PASS ' : '  FAIL ') + msg); },
    done(){ console.log(`\n${pass} pass · ${fail} fail`); return fail; }
  };
}

/** الموظف الذي يعيده الخادم عند رمز صحيح — نسخة من صف حقيقي وصلاحيات دوره. */
export const ADMIN = {
  employee:{ id:'e69bae3f-44cc-48f8-9928-9d4886e2be6c', name:'سفيان يوسف', role:'ADMIN', department:null, avatar_url:null },
  permissions:['dashboard','pos','returns','inventory','shortages','vaults','customers','analytics','settings','repairs','expenses','purchases']
};
