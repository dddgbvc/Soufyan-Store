-- ============================================================
-- مهمة دورية: غلق الجلسات اللي انقطعت نبضتها
-- بدونها أي جلسة ينطفي بيها البرنامج فجأة تضل "مفتوحة" للأبد وتخرب حساب المدة.
-- ============================================================

select cron.unschedule(jobid)
from cron.job
where jobname = 'app_sessions_close_stale';

select cron.schedule(
  'app_sessions_close_stale',
  '*/15 * * * *',
  $$select public.app_sessions_close_stale(15);$$
);
