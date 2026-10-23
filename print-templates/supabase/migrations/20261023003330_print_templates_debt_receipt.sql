-- وصل إضافة دين منفصل، ووصل القبض صار للقبض بس (الإصدار 2)
insert into public.print_templates (tenant_id, key, kind, name, width_mm, height_mm, html, css, js, partials, fields, sample, version)
values
(null, $pt$receipt_payment$pt$, $pt$receipt$pt$, $pt$وصل قبض$pt$, 80, null, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>وصل قبض</b><span>{{number}}</span></div>
  {{> rc_people}}
  <div class="grp">
    {{#description}}<div class="r"><span class="l">البيان</span><span class="v">{{description}}</span></div>{{/description}}
    {{#paid}}<div class="r"><span class="l">المبلغ المقبوض</span><span class="v"><span class="n">{{paid}}</span> د.ع</span></div>{{/paid}}
    <div class="r"><span class="l">الرصيد السابق</span><span class="v"><span class="n">{{previous_balance}}</span> د.ع</span></div>
  </div>
  <div class="tot"><span>الرصيد المتبقّي</span><b><span class="n">{{remaining}}</span> د.ع</b></div>
  {{#next_payment_date}}<div class="r"><span class="l">الدفعة القادمة</span><span class="v"><span class="n">{{next_payment_date}}</span>{{#next_payment_amount}} — <span class="n">{{next_payment_amount}}</span> د.ع{{/next_payment_amount}}</span></div>{{/next_payment_date}}
  <div class="sign"><span>توقيع المستلم</span><div></div></div>
  <div class="terms">احتفظ بالوصل كإثبات للدفع · أي مبلغ بدون وصل رسمي لا يُعتمد</div>
  <div class="bc" data-code="{{number}}"></div><div class="code">{{number}}</div>
  <div class="ft"><b>شكراً لتعاملك</b><br>{{> rc_contacts}}</div>
</div>$pt$, $pt$$pt$, '', '{}'::jsonb, $pt$[["number","رقم الوصل"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["description","البيان"],["paid","المبلغ المقبوض"],["previous_balance","الرصيد السابق"],["remaining","الرصيد المتبقّي"],["next_payment_date","موعد الدفعة القادمة"],["next_payment_amount","مبلغ الدفعة القادمة"]]$pt$::jsonb, $pt${"number":"SFN-Q-00125","date":"2026-09-09 18:05","customer":"مصطفى كريم","phone":"07705551234","employee":"سفيان","description":"تسديد دفعة — نقداً","paid":50000,"previous_balance":150000,"remaining":100000,"next_payment_date":"2026-11-22","next_payment_amount":50000}$pt$::jsonb, 2),
(null, $pt$receipt_debt$pt$, $pt$receipt$pt$, $pt$وصل إضافة دين$pt$, 80, null, $pt$<div class="page rc">
  {{> rc_head}}
  <div class="tl"><b>وصل إضافة دين</b><span>{{number}}</span></div>
  {{> rc_people}}
  <div class="grp">
    {{#description}}<div class="r"><span class="l">البيان</span><span class="v">{{description}}</span></div>{{/description}}
    {{#items}}<div class="it"><span><b><bdi>{{name}}</bdi></b>{{#detail}}<small><bdi>{{detail}}</bdi></small>{{/detail}}</span><b class="n">{{amount}}</b></div>{{/items}}
  </div>
  <div class="grp">
    <div class="r"><span class="l">المبلغ المُضاف</span><span class="v"><span class="n">{{amount}}</span> د.ع</span></div>
    <div class="r"><span class="l">الرصيد السابق</span><span class="v"><span class="n">{{previous_balance}}</span> د.ع</span></div>
  </div>
  <div class="tot"><span>الرصيد الكلّي</span><b><span class="n">{{balance}}</span> د.ع</b></div>
  {{#due_date}}<div class="r"><span class="l">موعد التسديد</span><span class="v"><span class="n">{{due_date}}</span>{{#due_amount}} — <span class="n">{{due_amount}}</span> د.ع{{/due_amount}}</span></div>{{/due_date}}
  <div class="sign"><span>توقيع الزبون</span><div></div></div>
  <div class="terms">أُقرّ بأن المبلغ أعلاه دَين بذمّتي للمحل ويُسدَّد بالموعد المتفق عليه · احتفظ بالوصل لمراجعة الرصيد</div>
  <div class="bc" data-code="{{number}}"></div><div class="code">{{number}}</div>
  <div class="ft"><b>شكراً لثقتك</b><br>{{> rc_contacts}}</div>
</div>$pt$, $pt$$pt$, '', '{}'::jsonb, $pt$[["number","رقم الوصل"],["date","التاريخ"],["customer","الزبون"],["phone","الهاتف"],["employee","الموظّف"],["description","البيان"],["items","المواد بالدين [name, detail, amount] (اختياري)"],["amount","المبلغ المضاف"],["previous_balance","الرصيد السابق"],["balance","الرصيد الكلي"],["due_date","موعد التسديد"],["due_amount","مبلغ التسديد"]]$pt$::jsonb, $pt${"number":"SFN-D-00057","date":"2026-10-23 13:10","customer":"مصطفى كريم","phone":"07705551234","employee":"سفيان","description":"شراء بالآجل","items":[{"name":"Samsung Galaxy A15","detail":"128GB · أزرق","amount":185000}],"amount":185000,"previous_balance":100000,"balance":285000,"due_date":"2026-11-22","due_amount":50000}$pt$::jsonb, 2)
on conflict on constraint print_templates_tenant_key do update set
  kind = excluded.kind, name = excluded.name, width_mm = excluded.width_mm, height_mm = excluded.height_mm,
  html = excluded.html, css = excluded.css, js = excluded.js, partials = excluded.partials,
  fields = excluded.fields, sample = excluded.sample, version = excluded.version, updated_at = now();

update public.print_templates set version = 2, updated_at = now() where tenant_id is null and version < 2;
