import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const SESSION='11111111-2222-3333-4444-555555555555';
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m);};
const sha=async s=>{const c=await import('node:crypto');return c.createHash('sha256').update(s).digest('hex');};
const GOOD=await sha('4271');

async function stub(page){
  await page.route('**/fonts.googleapis.com/**', r=>r.abort());
  await page.route('**/rest/v1/rpc/**', async route=>{
    const fn=route.request().url().split('/rpc/')[1].split('?')[0];
    const body=JSON.parse(route.request().postData()||'{}');
    if(fn==='verify_employee_pin') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(
      body.p_pin_hash===GOOD?{ok:true,session_id:SESSION,employee:{id:'x',name:'سفيان يوسف',role:'ADMIN'},
        permissions:['dashboard','pos','returns','inventory','shortages','vaults','customers','analytics','settings','repairs','expenses','purchases']}:{ok:false,reason:'wrong'})});
    if(fn==='app_session_ping') return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    if(fn==='app_session_end') return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    return route.fulfill({status:404,body:'{}'});
  });
  await page.route('**/functions/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"challenge":null,"allowCredentials":[]}'}));
  await page.route('**/auth/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
}
const login=async p=>{ await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1300); };

const b=await chromium.launch({executablePath:EXE});

/* ===== الاستجابة: لا فيض أفقي في أي عرض ===== */
console.log('\n— الاستجابة —');
for(const w of [320,360,390,430,768,1024,1280,1440,1920]){
  const ctx=await b.newContext({viewport:{width:w,height:820}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  const g=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  const l=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(w===390) if(SHOTS) await p.screenshot({path:SHOTS+'m-login.png'});
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1300);
  const e=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(w===390) if(SHOTS) await p.screenshot({path:SHOTS+'m-erp.png'});
  ok(g<=0&&l<=0&&e<=0, `${w}px — بلا فيض أفقي (بوابة ${g} · دخول ${l} · نظام ${e})`);
  await ctx.close();
}

/* ===== التكبير 200% ===== */
{
  const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(600);
  await p.evaluate(()=>{ document.documentElement.style.zoom='200%'; });
  await p.waitForTimeout(400);
  const g=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  ok(g<=1, `تكبير 200% — بلا فيض أفقي (${g})`);
  await ctx.close();
}

/* ===== بنية الأزرار: لا محتوى كتلة داخل زر ===== */
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(600);
  const bad=await p.$$eval('button', bs=>bs.filter(x=>x.querySelector('p,div,ul,ol,h1,h2,h3,section,article,button,a')).map(x=>x.className));
  ok(bad.length===0,'لا عنصر كتلة داخل زر (HTML صالحة): '+JSON.stringify(bad));
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  const bad2=await p.$$eval('button', bs=>bs.filter(x=>x.querySelector('p,div,ul,ol,h1,h2,h3,section,article,button,a')).map(x=>x.className));
  ok(bad2.length===0,'وكذلك في شاشة الدخول: '+JSON.stringify(bad2));
  const named=await p.$$eval('button, input, a[href]', els=>els.filter(e=>{
    const n=(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim();
    const lbl=e.id?document.querySelector(`label[for="${e.id}"]`):null;
    return !n && !lbl; }).map(e=>e.className||e.tagName));
  ok(named.length===0,'كل عنصر تفاعلي له اسم منطوق: '+JSON.stringify(named));
  await ctx.close();
}

/* ===== مساحات اللمس ===== */
{
  const ctx=await b.newContext({viewport:{width:390,height:820}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  const small=await p.$$eval('button, a[href], input', els=>els.filter(e=>{
    const r=e.getBoundingClientRect(); return r.width>0 && (r.height<24||r.width<24);
  }).map(e=>(e.id||e.className||e.tagName)+' '+Math.round(e.getBoundingClientRect().height)));
  ok(small.length===0, 'لا عنصر تفاعلي أصغر من 24px في البوابة: '+JSON.stringify(small));
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  const h=await p.$eval('[data-pin-go]',e=>e.getBoundingClientRect().height);
  ok(h>=44, `زر الدخول الرئيسي ${Math.round(h)}px ≥ 44px`);
  await ctx.close();
}

/* ===== لوحة المفاتيح والتركيز ===== */
console.log('\n— لوحة المفاتيح —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.keyboard.press('Tab');
  ok(await p.evaluate(()=>document.activeElement.classList.contains('skip-link')),'أول Tab يصل إلى رابط التخطّي');
  const order=[]; for(let i=0;i<12;i++){ await p.keyboard.press('Tab');
    order.push(await p.evaluate(()=>{const a=document.activeElement;return a.dataset.door||a.id||a.className.split(' ')[0];})); }
  ok(order.includes('login')&&order.includes('setup'),'التنقّل بلوحة المفاتيح يصل إلى البابين: '+order.filter(Boolean).slice(0,8).join(' → '));
  await p.focus('[data-door="login"]');
  const ring=await p.evaluate(()=>{const s=getComputedStyle(document.activeElement);return s.outlineWidth+' / '+s.outlineStyle;});
  ok(!/^0px|none/.test(ring),'حلقة تركيز ظاهرة على الباب: '+ring);
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  ok(await p.isVisible('.pin-input'),'Enter على الباب يفتح شاشة الدخول');
  // حصر التركيز داخل حوار الخروج
  await p.fill('.pin-input','4271'); await p.press('.pin-input','Enter'); await p.waitForTimeout(1300);
  await p.click('[data-logout]'); await p.waitForTimeout(500);
  ok(await p.evaluate(()=>$('.shell').inert===true),'الخلفية inert أثناء الحوار');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok(await p.evaluate(()=>document.getElementById('modalWrap').hidden),'Escape يغلق الحوار');
  await ctx.close();
}

/* ===== المظهر الداكن والإنجليزية ===== */
console.log('\n— المظهر واللغة —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  for(let i=0;i<3;i++){ await p.click('#themeBtn'); await p.waitForTimeout(300);
    if(await p.evaluate(()=>document.documentElement.dataset.theme)==='dark') break; }
  ok(await p.evaluate(()=>document.documentElement.dataset.theme)==='dark','زر المظهر يصل إلى الوضع الداكن');
  await p.click('[data-door="login"]'); await p.waitForTimeout(600);
  if(SHOTS) await p.screenshot({path:SHOTS+'dark-login.png'});
  ok(await p.evaluate(()=>getComputedStyle(document.body).backgroundColor)!=='rgb(234, 240, 252)','الخلفية داكنة فعلًا');
  await p.click('#langBtn'); await p.waitForTimeout(700);
  ok(await p.evaluate(()=>document.documentElement.dir)==='ltr','الإنجليزية تقلب الاتجاه إلى LTR');
  ok((await p.textContent('#stepTitle')).trim()==='Enter your code','النص الإنجليزي معروض');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  ok(ov<=0,'لا فيض أفقي في الوضع الإنجليزي الداكن');
  if(SHOTS) await p.screenshot({path:SHOTS+'en-dark-login.png'});
  await ctx.close();
}

/* ===== تقليل الحركة ===== */
{
  const ctx=await b.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}); const p=await ctx.newPage(); await stub(p);
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  await login(p);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','المسار كامل يعمل مع prefers-reduced-motion');
  ok(errs.length===0,'بلا أخطاء مع تقليل الحركة');
  await ctx.close();
}

/* ===== التباين على النصوص الجديدة ===== */
console.log('\n— التباين —');
{
  globalThis.lum=c=>{const [r,g,bb]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*r+0.7152*g+0.0722*bb;};
  globalThis.ratio=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
  for(const theme of ['light','dark']){
    const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
    await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(600);
    await p.evaluate(t=>Theme.apply(t), theme); await p.waitForTimeout(300);
    await login(p);
    const nodes=await p.evaluate(()=>{
      const px=s=>s.match(/\d+/g).slice(0,3).map(Number);
      const bgOf=el=>{ let n=el; while(n&&n!==document.documentElement){ const c=getComputedStyle(n).backgroundColor;
        if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c)&&!/, 0\)$/.test(c)) return c; n=n.parentElement; }
        return getComputedStyle(document.body).backgroundColor; };
      const out=[];
      document.querySelectorAll('.step .perm-list li, .step .who b, .step .who .w-txt > span, .step .hand-card b, .step .hand-card span, .step .lede, .step h1, .method .m-txt b, .method .m-txt span, .door b, .door p, .door .d-go, .pin-wrap .hint, .sess .s-who b, .sess .s-who span, .note b, .note div, .step-eyebrow span, .perm-block > b')
        .forEach(el=>{ const s=getComputedStyle(el); const r=el.getBoundingClientRect(); if(!r.width) return;
          out.push({sel:el.className||el.tagName, size:parseFloat(s.fontSize), weight:s.fontWeight, fg:px(s.color), bg:px(bgOf(el)), txt:(el.textContent||'').trim().slice(0,18)}); });
      return out;
    });
    let worst={r:99}; let bad=0;
    for(const n of nodes){ const r=ratio(n.fg,n.bg); const large=n.size>=24||(n.size>=18.66&&+n.weight>=700);
      const need=large?3:4.5; if(r<need){bad++; console.log('    ↓',n.txt,r.toFixed(2),'<',need,n.sel);}
      if(r<worst.r) worst={r,txt:n.txt}; }
    ok(bad===0, `${theme}: ${nodes.length} عقدة نصّية — راسب ${bad} · الأدنى ${worst.r.toFixed(2)}:1 («${worst.txt}»)`);
    await ctx.close();
  }
}
{ // نص أبيض فوق تدرّج الهوية — يُقاس على الطرف الأفتح من التدرّج
  const white=[255,255,255], lightEnd=[0x45,0x69,0xF1];
  ok(ratio(white,lightEnd)>=4.5, `نص الصور الرمزية: أبيض على أفتح نقطة في تدرّج الهوية = ${ratio(white,lightEnd).toFixed(2)}:1`);
}
console.log(`\n${pass} pass · ${fail} fail`);
await b.close(); process.exit(fail?1:0);
