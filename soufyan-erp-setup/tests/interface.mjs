import { chromium } from './pw.mjs';
const SHOTS = process.env.SHOTS || '';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.SETUP_URL || 'http://127.0.0.1:8099/index.html';
const SESSION='11111111-2222-3333-4444-555555555555';
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m);};
const sha=async s=>{const c=await import('node:crypto');return c.createHash('sha256').update(s).digest('hex');};
const GOOD=await sha('4271');

const TOKEN='eyJhbGciOiJIUzI1NiJ9.fake';
const USER={ id:'1504114c-71ec-4345-a1ba-7c815c71e6c4', email:'assn42357@gmail.com' };
const PROFILE={ id:USER.id, display_name:'سفيان يوسف', role:'ADMIN', status:'active' };
async function stub(page, o={}){
  await page.route('**/fonts.googleapis.com/**', r=>r.abort());
  await page.route('**/auth/v1/**', r=>{
    const url=r.request().url();
    const body=r.request().postData()? JSON.parse(r.request().postData()) : {};
    const json=(s,b)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(b)});
    if(url.includes('/token')) return (body.password==='S3cret-pass')
      ? json(200,{access_token:TOKEN, refresh_token:'rt', user:USER})
      : json(400,{error_code:'invalid_credentials', msg:'Invalid login credentials'});
    return json(200,{...USER});
  });
  await page.route('**/rest/v1/profiles**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([PROFILE])}));
  await page.route('**/rest/v1/rpc/**', r=>{
    const fn=r.request().url().split('/rpc/')[1].split('?')[0];
    if(fn==='app_session_start') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(SESSION)});
    if(fn==='app_session_ping')  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:o.pingOk!==false})});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
  });
}
const doLogin=async(p,pw='S3cret-pass')=>{ await p.click('[data-door="login"]'); await p.waitForTimeout(650);
  await p.fill('#f_loginEmail',USER.email); await p.fill('#f_loginPassword',pw);
  await p.click('[data-go]'); await p.waitForTimeout(1500); };

const b=await chromium.launch({executablePath:EXE});

/* ===== الاستجابة: لا فيض أفقي في أي عرض ===== */
console.log('\n— الاستجابة —');
for(const w of [320,360,390,430,768,1024,1280,1440,1920]){
  const ctx=await b.newContext({viewport:{width:w,height:820}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  const g=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  await p.click('[data-door="login"]'); await p.waitForTimeout(650);
  const l=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(w===390) if(SHOTS) await p.screenshot({path:SHOTS+'m-login.png'});
  await p.fill('#f_loginEmail',USER.email); await p.fill('#f_loginPassword','S3cret-pass');
  await p.click('[data-go]'); await p.waitForTimeout(1500);
  const e=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(w===390) if(SHOTS) await p.screenshot({path:SHOTS+'m-erp.png'});
  ok(g<=0&&l<=0&&e<=0, `${w}px — بلا فيض أفقي (بوابة ${g} · دخول ${l} · نظام ${e})`);
  await ctx.close();
}

/* ===== وزن الصفحة: المحرّك ثلاثي الأبعاد عند الطلب لا دائمًا ===== */
console.log('\n— الوزن والتحميل عند الطلب —');
{
  // نعدّ الطلبات لا البايتات: قراءة أجسام الردود تتسابق مع إغلاق الصفحة فتتذبذب.
  const weigh=async cfg=>{
    const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
    if(cfg) await p.addInitScript(c=>{window.SETUP_CONFIG=c;}, cfg);
    let threeBytes=0, askedForThree=false;
    p.on('request', r=>{ if(r.url().includes('three.min.js')) askedForThree=true; });
    p.on('response', async r=>{ if(!r.url().includes('three.min.js')) return;
      try{ threeBytes=(await r.body()).length; }catch{} });
    await p.goto(URL,{waitUntil:'load'}); await p.waitForSelector('#stepTitle'); await p.waitForTimeout(1500);
    const out={ askedForThree, kb:Math.round(threeBytes/1024),
      three:await p.evaluate(()=>typeof THREE!=='undefined'),
      mode:await p.evaluate(()=>SetupIllustration.mode),
      canvas:await p.evaluate(()=>!!document.querySelector('.illus-canvas')) };
    await ctx.close(); return out;
  };
  const def=await weigh(null);
  ok(def.askedForThree===false && def.three===false,'الوضع الافتراضي لا يطلب three.js ولا يحمّله');
  ok(def.mode==='svg','ويعمل بالرسوم الحيّة');
  const three=await weigh({illustration:'3d'});
  ok(three.askedForThree===true && three.three===true && three.canvas===true,
    `طلب الوضع ثلاثي الأبعاد يحمّله ويبني مشهدًا حقيقيًا (${three.kb} KB)`);
  ok(three.kb>500,`ما توفّره الصفحة الافتراضية: ${three.kb} KB لا تُحمَّل`);
  // فشل تحميل المحرّك لا يترك شاشة فارغة
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.addInitScript(()=>{window.SETUP_CONFIG={illustration:'3d'};});
  await p.route('**/three.min.js', r=>r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400);
  ok((await p.textContent('#stepTitle'))==='أهلًا بك','فشل تحميل المحرّك ⇒ الرسوم الحيّة، لا شاشة فارغة');
  ok(errs.length===0,'وبلا أخطاء JavaScript');
  await ctx.close();
}

/* ===== تفاصيل بصرية تنكسر بصمت ===== */
console.log('\n— تفاصيل الاتّجاه والتراكب —');
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.click('[data-door="login"]'); await p.waitForTimeout(700);
  // السهم الاتّجاهي ينقلب مع اتّجاه القراءة
  const flip=sel=>p.$eval(sel+' svg',e=>getComputedStyle(e).transform);
  ok((await flip('[data-go]')).startsWith('matrix(-1'),'سهم «دخول» ينقلب في العربية');
  ok((await flip('[data-back-gate]')).startsWith('matrix(-1'),'وسهم «رجوع» كذلك');
  // زرّ إظهار كلمة المرور لا يجلس فوق النص
  const box=await p.evaluate(()=>{
    const i=document.querySelector('#f_loginPassword'), b=document.querySelector('.pwd-peek');
    const a=i.getBoundingClientRect(), c=b.getBoundingClientRect(), st=getComputedStyle(i);
    const padStart=parseFloat(st.paddingInlineStart), padEnd=parseFloat(st.paddingInlineEnd);
    const ltr=st.direction==='ltr';
    // أول موضع يبدأ عنده النص
    const textStart = ltr ? a.left+padStart : a.right-padStart;
    return { overlap: c.left-1 <= textStart && textStart <= c.right+1, padEnd, btn:[c.left,c.right] };
  });
  ok(!box.overlap && box.padEnd>=40,'الزرّ عند نهاية النص لا فوق بدايته، والحشوة تقابله');
  // الهوية لا تُكرَّر
  ok(await p.evaluate(()=>getComputedStyle(document.querySelector('.s-header .brand')).visibility)==='hidden',
    'هوية الرأس مخفيّة لأن البطاقة تحملها');
  // علامة الهوية ثابتة بين الشاشات
  const m1=await p.$eval('.auth-brand .mark svg path',e=>e.getAttribute('d'));
  await p.click('[data-forgot]'); await p.waitForTimeout(700);
  const m2=await p.$eval('.auth-brand .mark svg path',e=>e.getAttribute('d'));
  ok(m1===m2,'علامة الهوية نفسها في كل شاشة — البراند لا يتبدّل');
  // بطاقة واحدة موسَّطة بلا رسمة
  ok(!(await p.isVisible('#illus')),'لا رسمة في شاشات التوثيق');
  const c=await p.evaluate(()=>{const e=document.querySelector('.auth-card').getBoundingClientRect();
    return Math.abs((e.left+e.right)/2 - innerWidth/2)<2;});
  ok(c,'البطاقة موسَّطة أفقيًا');
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
  await p.click('[data-door="login"]'); await p.waitForTimeout(650);
  const h=await p.$eval('[data-go]',e=>e.getBoundingClientRect().height);
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
  ok(await p.isVisible('#f_loginPassword'),'Enter على الباب يفتح شاشة الدخول');
  // حصر التركيز داخل حوار الخروج
  await p.fill('#f_loginEmail',USER.email); await p.fill('#f_loginPassword','S3cret-pass');
  await p.click('[data-go]'); await p.waitForTimeout(1500);
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
  ok((await p.textContent('#stepTitle')).trim()==='Sign in','النص الإنجليزي معروض');
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
  await doLogin(p);
  ok(await p.textContent('#stepTitle')==='أهلًا سفيان يوسف','المسار كامل يعمل مع prefers-reduced-motion');
  ok(errs.length===0,'بلا أخطاء مع تقليل الحركة');
  await ctx.close();
}

/* ===== التباين على كل نصّ في شاشات التوثيق والنظام ===== */
console.log('\n— التباين —');
{
  const lum=c=>{const [r,g,bb]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*r+0.7152*g+0.0722*bb;};
  const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};

  /** يجمع كل عقدة نصّية مع خلفيتها **المركَّبة** — الأسطح الزجاجية شبه شفّافة. */
  const collect = p => p.evaluate(()=>{
    const num=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    const bgOf=el=>{
      const stack=[]; let n=el;
      while(n && n!==document.documentElement){
        const c=getComputedStyle(n).backgroundColor;
        if(c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)){
          const v=num(c); const a=v.length>3?v[3]:1;
          stack.push([v[0],v[1],v[2],a]);
          if(a>=1) break;
        }
        n=n.parentElement;
      }
      const base=num(getComputedStyle(document.body).backgroundColor);
      let out=[base[0]??255, base[1]??255, base[2]??255];
      for(let i=stack.length-1;i>=0;i--){ const [r,g,b,a]=stack[i];
        out=[r*a+out[0]*(1-a), g*a+out[1]*(1-a), b*a+out[2]*(1-a)]; }
      return out;
    };
    const out=[];
    document.querySelectorAll(
      '.auth-brand b, .auth-brand span, .auth-card h1, .auth-card .lede, .auth-card .field > label,'+
      '.auth-card .hint, .auth-card .link, .auth-alt, .auth-back .btn, .door b, .door .d-desc,'+
      '.step .who b, .step .who .w-txt > span, .step .perm-list li, .step .hand-card b,'+
      '.step .hand-card span, .step .lede, .step h1, .note b, .note div, .perm-block > b')
      .forEach(el=>{ const st=getComputedStyle(el); const r=el.getBoundingClientRect();
        if(!r.width || !(el.textContent||'').trim()) return;   // عقدة بلا نصّ لا تُقاس
        out.push({ size:parseFloat(st.fontSize), weight:st.fontWeight,
          fg:num(st.color).slice(0,3), bg:bgOf(el).map(Math.round),
          txt:(el.textContent||'').trim().slice(0,20) }); });
    return out;
  });

  for(const theme of ['light','dark']){
    const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage(); await stub(p);
    await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
    // المظهر يُضبط بالتفضيل لا بالتطبيق المباشر: الرأس يعيد تطبيق التفضيل مع كل
    // انتقال، فاستدعاء Theme.apply وحده يُلغى عند أول تنقّل ويقيس الفاتح مرّتين.
    await p.evaluate(t=>{ SetupState.set("preferences","theme",t); Theme.apply(t); }, theme);
    await p.waitForTimeout(300);
    const nodes=[];
    nodes.push(...await collect(p));                                  // البوابة
    await p.click('[data-door="login"]'); await p.waitForTimeout(700);
    nodes.push(...await collect(p));                                  // الدخول
    await p.click('[data-forgot]'); await p.waitForTimeout(700);
    nodes.push(...await collect(p));                                  // الاسترجاع
    await p.click('[data-back]'); await p.waitForTimeout(700);
    await p.fill('#f_loginEmail',USER.email); await p.fill('#f_loginPassword','S3cret-pass');
    await p.click('[data-go]'); await p.waitForTimeout(1500);
    nodes.push(...await collect(p));                                  // النظام
    const actually=await p.evaluate(()=>document.documentElement.dataset.theme);
    ok(actually===theme, `المظهر أثناء القياس هو «${theme}» فعلًا (وجدنا «${actually}»)`);
    let worst={r:99,txt:''}, bad=0;
    for(const n of nodes){
      const r=ratio(n.fg,n.bg);
      const large=n.size>=24||(n.size>=18.66&&+n.weight>=700);
      const need=large?3:4.5;
      if(r<need){ bad++; console.log('    ↓','«'+n.txt+'»',r.toFixed(2),'<',need,`${n.size}px/${n.weight}`); }
      if(r<worst.r) worst={r,txt:n.txt};
    }
    ok(bad===0, `${theme}: ${nodes.length} عقدة نصّية عبر أربع شاشات — راسب ${bad} · الأدنى ${worst.r.toFixed(2)}:1 («${worst.txt}»)`);
    await ctx.close();
  }
  const white=[255,255,255], lightEnd=[0x45,0x69,0xF1];
  ok(ratio(white,lightEnd)>=4.5, `نص فوق تدرّج الهوية: ${ratio(white,lightEnd).toFixed(2)}:1`);
}

console.log(`\n${pass} pass · ${fail} fail`);
await b.close(); process.exit(fail?1:0);
