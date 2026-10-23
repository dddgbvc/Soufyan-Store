-- مسافات أوسع وترتيب القيم بأعمدة (الإصدار 3)
insert into public.print_templates (tenant_id, key, kind, name, css, version)
values
(null, '_base', 'base', 'الأساس المشترك', $pt$/* ============ أساس مشترك لكل المطبوعات ============ */
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000}
body{font-family:'El Messiri',sans-serif;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;overflow:hidden;background:#fff}
.n{direction:ltr;unicode-bidi:isolate}
.bc svg{display:block;width:100%;height:100%}
[data-logo] svg{display:block;width:100%;height:100%}

/* ============ الستيكرات (على نمط المرجع) ============ */
.st{
  --k:1; --gc:1fr 1fr; --lw:calc(5.4mm*var(--k));
  --ts:calc(9.6pt*var(--k)); --ps:calc(12pt*var(--k));
  --bw:calc(28mm*var(--k)); --bh:calc(6mm*var(--k)); --cs:calc(6pt*var(--k));
  width:var(--w);height:var(--h);
  padding:calc(4.6mm*var(--k)) calc(5.4mm*var(--k)) calc(4mm*var(--k));
  display:flex;flex-direction:column
}
.st .hd{display:flex;align-items:center;gap:calc(2.6mm*var(--k));padding-bottom:calc(3mm*var(--k));border-bottom:.15mm solid #000}
.st .lg{width:var(--lw);height:var(--lw);flex:none;display:block}
.st .tt{flex:1;min-width:0}
.st .tt b{display:block;font-weight:700;font-size:var(--ts);line-height:1.12;white-space:nowrap;overflow:hidden}
.st .pr{flex:none;font-weight:400;font-size:var(--ps);line-height:1;white-space:nowrap}
.st .sp{flex:1;display:flex;flex-direction:column;justify-content:center;padding:calc(2.6mm*var(--k)) 0}
.st .cols{display:grid;grid-template-columns:var(--gc);column-gap:calc(6mm*var(--k))}
.st .cols>div{display:grid;grid-template-columns:max-content 1fr;column-gap:calc(2.4mm*var(--k));row-gap:calc(2.9mm*var(--k));align-content:start;align-items:baseline}
.st .cols .r{display:contents}
.st .cols .v{justify-self:start}
.st .r{display:flex;align-items:baseline;gap:calc(2.4mm*var(--k));white-space:nowrap;line-height:1}
.st .r .l{font-weight:600;font-size:calc(5.6pt*var(--k))}
.st .r .v{font-weight:400;font-size:calc(6.4pt*var(--k));white-space:nowrap;line-height:1}
.st .r .v.n{letter-spacing:.03em}
.st .wide{margin-top:calc(2.9mm*var(--k))}
.st .ft{border-top:.15mm solid #000;padding-top:calc(3.6mm*var(--k));display:flex;flex-direction:column;align-items:center}
.st .ft.only{border-top:0;padding-top:0;flex:1;justify-content:center}
.st .bc{width:var(--bw);height:var(--bh)}
.st .code{font-size:var(--cs);font-weight:500;letter-spacing:.3em;line-height:1;margin-top:calc(1.4mm*var(--k));direction:ltr;padding-left:.3em}

/* ============ الوصولات الحرارية 80mm (خفيفة الحبر) ============ */
.rc{width:80mm;padding:5mm 5mm 4mm;font-size:7.6pt;line-height:1.3}
.rc .hd{display:flex;align-items:center;justify-content:center;gap:2.4mm}
.rc .hd i{display:block;width:7.5mm;height:7.5mm;flex:none}
.rc .hd h1{font-size:11pt;font-weight:700;line-height:1}
.rc .hd .ad{font-size:6.2pt;line-height:1;margin-top:1.4mm}
.rc .tl{display:flex;justify-content:space-between;align-items:baseline;border-top:.2mm solid #000;border-bottom:.2mm solid #000;padding:2.3mm 0 2.1mm;margin-top:4.2mm}
.rc .tl b{font-size:10pt;font-weight:700;line-height:1}
.rc .tl span{font-size:8.6pt;font-weight:600;direction:ltr;letter-spacing:.08em;line-height:1}
.rc .r{display:flex;justify-content:space-between;gap:3mm;margin-top:1.8mm}
.rc .tl + .r{margin-top:2.8mm}
.rc .r .l{font-weight:500;flex:none}
.rc .r .v{font-weight:600;text-align:left}
.rc .grp{margin-top:3mm;padding-top:2.6mm;border-top:.15mm solid #000}
.rc .grp>:first-child{margin-top:0}
.rc .it{display:flex;justify-content:space-between;gap:3mm;margin-top:1.8mm}
.rc .it b{font-weight:600}
.rc .it small{font-size:6.4pt;margin-inline-start:1.4mm}
.rc .tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:3mm;padding:2.4mm 0 2.2mm;border-top:.2mm solid #000;border-bottom:.75mm double #000}
.rc .tot + .r{margin-top:2.8mm}
.rc .tot span{font-size:8.4pt;font-weight:700}
.rc .tot b{font-size:11pt;font-weight:700;line-height:1}
.rc .txt{margin-top:2mm;font-weight:500;line-height:1.5}
.rc .terms{margin-top:3.8mm;padding:0 2mm;font-size:6.2pt;line-height:1.6;text-align:center}
.rc .sign{display:flex;gap:2mm;align-items:flex-end;margin-top:5mm;font-size:6.8pt}
.rc .sign div{flex:1;border-bottom:.2mm solid #000;height:3.6mm}
.rc .bc{height:7mm;margin:4.2mm 14mm 0}
.rc .code{text-align:center;font-size:7pt;font-weight:600;letter-spacing:.3em;margin-top:1.4mm;direction:ltr;line-height:1}
.rc .ft{text-align:center;margin-top:3.6mm;font-size:6.8pt;line-height:1.75}
.rc .ft b{font-size:8pt}$pt$, 3),
(null, 'repair_sticker', 'sticker', 'ستيكر صيانة', $pt$.st{--w:90mm;--h:50mm;--gc:1.25fr 1fr;padding-inline:5.6mm}$pt$, 3),
(null, 'product_sticker_m', 'sticker', 'ستيكر منتجات وسط', $pt$.st{--w:50mm;--h:30mm;--k:.78;--ps:8.6pt;--ts:8.2pt;--lw:4.2mm;--bw:28mm;--bh:6.4mm}$pt$, 3),
(null, 'product_sticker_s', 'sticker', 'ستيكر منتجات صغير', $pt$.st{--w:40mm;--h:25mm;--k:.66;--ps:9.5pt;--ts:8pt;--lw:3.4mm;--bw:24mm;--bh:5.4mm;--cs:5.2pt}$pt$, 3)
on conflict on constraint print_templates_tenant_key do update set
  css = excluded.css, version = excluded.version, updated_at = now();

update public.print_templates set version = 3, updated_at = now() where tenant_id is null and version < 3;
