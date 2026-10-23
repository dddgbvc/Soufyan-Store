-- الجدول ما عليه صلاحيات مباشرة (الافتراضي بالمشروع مقفول)؛ الوصول فقط عبر print_templates_get بجلسة موظف
revoke execute on function private.print_templates_bundle(uuid) from public, anon, authenticated;
revoke execute on function public.print_templates_get(uuid) from public;
grant execute on function public.print_templates_get(uuid) to anon, authenticated;
