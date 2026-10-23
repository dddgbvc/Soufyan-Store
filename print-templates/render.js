/*
 * SufyanPrint — يملأ قالب طباعة (ستيكر أو وصل) بالبيانات ويرجّع صفحة HTML جاهزة للطباعة.
 *
 *   const bundle = await fetch('dist/print-templates.json').then(r => r.json());
 *   // أو من سوبابيس: const { data: bundle } = await supabase.rpc('print_templates_get', { p_session_id });
 *   const html = SufyanPrint.render(bundle, 'receipt_sale', data, { autoPrint: true });
 *
 * صيغة القوالب: {{field}} و {{shop.name}} و {{#list}}…{{/list}} و {{^field}}…{{/field}} و {{> partial}}.
 * الأرقام تنكتب تلقائياً بفواصل (385000 → 385,000).
 */
(function (root) {
  var TAG = /\{\{(\{)?\s*([#^\/>])?\s*([\w.]+)\s*\}?\}\}/g;
  var GOOGLE_FONTS = 'https://fonts.googleapis.com/css2?family=El+Messiri:wght@400;500;600;700&display=swap';

  function parse(src) {
    var root = [], stack = [{ name: null, children: root }], last = 0, m;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(src))) {
      var top = stack[stack.length - 1].children;
      if (m.index > last) top.push(src.slice(last, m.index));
      last = TAG.lastIndex;
      var sig = m[2], name = m[3];
      if (sig === '#' || sig === '^') {
        var node = { sec: name, inv: sig === '^', children: [] };
        top.push(node);
        stack.push({ name: name, children: node.children });
      } else if (sig === '/') {
        if (stack.length < 2 || stack[stack.length - 1].name !== name) throw new Error('قسم غير مغلق صح: ' + name);
        stack.pop();
      } else if (sig === '>') {
        top.push({ partial: name });
      } else {
        top.push({ v: name, raw: !!m[1] });
      }
    }
    if (stack.length > 1) throw new Error('قسم مفتوح بدون إغلاق: ' + stack[stack.length - 1].name);
    if (last < src.length) root.push(src.slice(last));
    return root;
  }

  function lookup(ctx, key) {
    var parts = key.split('.');
    for (var i = ctx.length - 1; i >= 0; i--) {
      var o = ctx[i];
      if (o === null || typeof o !== 'object' || !(parts[0] in o)) continue;
      for (var j = 0; j < parts.length && o != null; j++) o = o[parts[j]];
      return o;
    }
    return undefined;
  }

  function text(v) {
    if (typeof v === 'number') return isFinite(v) ? v.toLocaleString('en-US') : '';
    return v == null ? '' : String(v);
  }
  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function truthy(v) { return Array.isArray(v) ? v.length > 0 : !!v; }

  function run(nodes, ctx, partials, depth) {
    var out = '';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (typeof n === 'string') out += n;
      else if (n.v) { var s = text(lookup(ctx, n.v)); out += n.raw ? s : esc(s); }
      else if (n.partial) {
        if (depth > 8) throw new Error('تداخل قوالب فرعية أكثر من اللازم');
        var p = partials && partials[n.partial];
        if (p == null) throw new Error('قالب فرعي غير موجود: ' + n.partial);
        out += run(parse(p), ctx, partials, depth + 1);
      } else {
        var val = lookup(ctx, n.sec);
        if (n.inv) { if (!truthy(val)) out += run(n.children, ctx, partials, depth); }
        else if (Array.isArray(val)) for (var k = 0; k < val.length; k++) out += run(n.children, ctx.concat([val[k]]), partials, depth);
        else if (truthy(val)) out += run(n.children, typeof val === 'object' ? ctx.concat([val]) : ctx, partials, depth);
      }
    }
    return out;
  }

  function fill(src, data, partials) {
    return run(parse(src), [data || {}], partials || {}, 0);
  }

  function find(bundle, key) {
    var list = bundle.templates || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    throw new Error('القالب غير موجود: ' + key);
  }

  // opts: { autoPrint, fontsCss (رابط fonts.css المحلي — بدونه يستخدم خطوط Google), sample (يملأ ببيانات المثال) }
  function render(bundle, key, data, opts) {
    opts = opts || {};
    var tpl = find(bundle, key), base = bundle.base || {};
    var ctx = Object.assign({}, opts.sample ? tpl.sample : null, data);
    ctx.shop = Object.assign({}, bundle.shop, ctx.shop);
    var body = fill(tpl.html, ctx, base.partials);
    var page = tpl.height_mm ? '@page{size:' + tpl.width_mm + 'mm ' + tpl.height_mm + 'mm;margin:0}' : '';
    var fonts = '<link rel="stylesheet" href="' + esc(opts.fontsCss || GOOGLE_FONTS) + '">';
    return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(tpl.name) + '</title>' + fonts +
      '<style>' + (base.css || '') + '\n' + page + '\n' + (tpl.css || '') + '</style></head><body>' + body +
      '<script>window.__autoPrint=' + (opts.autoPrint ? 'true' : 'false') + ';\n' + (base.js || '') + '<\/script></body></html>';
  }

  var api = { render: render, fill: fill, parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SufyanPrint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
