package iq.yaqoot.erp.core

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import iq.yaqoot.erp.MainActivity
import iq.yaqoot.erp.R
import java.util.concurrent.TimeUnit

/**
 * إشعارات أندرويد بدون Firebase:
 * • أثناء فتح التطبيق: فحص كل 15 ثانية.
 * • في الخلفية: WorkManager كل ~15 دقيقة (أقل مدة يسمح بها أندرويد).
 * المصدر واحد: صندوق إشعارات الموظف على الخادم، بنفس التفضيلات والصلاحيات وساعات الهدوء.
 */
object Notify {
    private const val CH = "sufyan_alerts"
    private const val CH_QUIET = "sufyan_quiet"
    private const val WORK = "sufyan-poll"
    private lateinit var ctx: Context

    fun init(context: Context) {
        ctx = context.applicationContext
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH, "إشعارات مكتب سفيان", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "الفواتير والديون والنواقص والصيانة والتقارير وحركات المحل"
        })
        nm.createNotificationChannel(NotificationChannel(CH_QUIET, "إشعارات مكتب سفيان (هادئة)", NotificationManager.IMPORTANCE_LOW).apply {
            description = "تصل خلال ساعات الهدوء بدون صوت"
            setSound(null, null)
            enableVibration(false)
        })
    }

    fun permitted(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    val enabled get() = Secure.get("notify_token") != null

    suspend fun enable(deviceName: String) {
        var token = Secure.get("notify_token")
        if (token == null) {
            token = randomHex(32)
            Secure.put("notify_token", token)
        }
        val last = Api.nativeRegister(token, deviceName)
        Prefs.put("notify_since", "$last")
        startBackground()
    }

    suspend fun disable() {
        Secure.get("notify_token")?.let { Api.nativeUnregister(it) }
        Secure.put("notify_token", null)
        Prefs.put("notify_since", null)
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK)
    }

    private fun startBackground() {
        val req = PeriodicWorkRequestBuilder<PollWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** يجلب الجديد ويعرضه كإشعارات. يعيد عدد غير المقروء إن عُرف. */
    suspend fun pollOnce(): Int? {
        Api.load()
        val token = Secure.get("notify_token") ?: return null
        if (!Api.hasBase) return null
        val since = Prefs.get("notify_since")?.toLongOrNull() ?: 0L
        val d = Api.nativePoll(token, since)
        if (d["ok"] != true) {
            if (d.s("reason") == "unregistered") Secure.put("notify_token", null)
            return null
        }
        val quiet = d.b("quiet")
        if (permitted()) {
            for (n in d.l("items")) show(n, quiet)
        }
        val last = d.n("last_id").toLong()
        if (last > since) Prefs.put("notify_since", "$last")
        return d.i("unread")
    }

    private fun show(n: J, quiet: Boolean) {
        val intent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            n.sOrNull("url")?.let { putExtra("route", it) }
        }
        val id = (n.n("id").toLong() % Int.MAX_VALUE).toInt()
        val pi = PendingIntent.getActivity(ctx, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val body = n.s("body")
        val note = NotificationCompat.Builder(ctx, if (quiet) CH_QUIET else CH)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(n.sOrNull("title") ?: "مكتب سفيان للموبايل")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(if (quiet) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id, note) } catch (_: SecurityException) {}
    }
}

class PollWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        try { Notify.pollOnce() } catch (_: Exception) {}
        return Result.success()
    }
}
