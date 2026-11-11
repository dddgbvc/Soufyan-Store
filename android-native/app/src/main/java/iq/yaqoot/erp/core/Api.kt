package iq.yaqoot.erp.core

import iq.yaqoot.erp.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

/** خطأ من الخادم برسالة مفهومة. */
class ApiException(message: String, val reason: String? = null, val status: Int = 0, val data: J? = null) : Exception(message)

/** الجلسة انتهت (خمول أو 12 ساعة): الواجهة تعود لشاشة PIN. */
class SessionExpired : Exception("انتهت الجلسة. أدخل رمزك من جديد.")

private val reasons = mapOf(
    "bad_credentials" to "البريد أو كلمة المرور غير صحيحة.",
    "not_owner" to "هذا الحساب ليس حساب مالك محل.",
    "email_not_confirmed" to "البريد غير مؤكد بعد.",
    "rate_limited" to "محاولات كثيرة. انتظر قليلاً.",
    "invalid_input" to "أدخل بريداً صحيحاً وكلمة المرور.",
    "not_configured" to "الخادم غير مهيأ.",
    "migration_missing" to "قاعدة البيانات تحتاج تحديثاً.",
    "upstream_unreachable" to "تعذر الوصول إلى الخادم.",
    "wrong" to "الرمز غير صحيح.",
    "invalid" to "الرمز من 4 إلى 8 أرقام.",
    "locked" to "محاولات خاطئة كثيرة. انتظر دقيقتين.",
    "ambiguous" to "هذا الرمز مسجّل لأكثر من موظف. غيّر أحدهما.",
    "disabled" to "المحل أو الحساب موقوف.",
    "forbidden" to "ليست لديك صلاحية لهذا الإجراء.",
    "unpaired" to "هذا الجهاز غير مفعّل لمحل.",
)

private val rng = SecureRandom()
fun randomHex(bytes: Int): String = ByteArray(bytes).also { rng.nextBytes(it) }.joinToString("") { "%02x".format(it) }
fun clientId(): String = randomHex(12)

/**
 * الاتصال بخادم المحل (نفس واجهة تطبيق الويب والآيفون).
 * الدخول: حساب المحل مرة واحدة (كوكي yq_store) ثم PIN يحدد الموظف (كوكي yq_sess).
 * الكوكيز مشفّرة في Android Keystore. كلمة مرور المالك لا تُحفظ، ومفتاح Service Role لا يصل للتطبيق.
 */
object Api {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(70, TimeUnit.SECONDS)
        .callTimeout(80, TimeUnit.SECONDS)
        .followRedirects(false)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    var base: String = BuildConfig.YQ_BASE_URL
        private set
    private var store: String? = null
    private var sess: String? = null
    private var loaded = false

    /** البرج المختار في SAS4 (رقمه فقط، ليس سراً). */
    var sasTower: String? = null

    val hasBase get() = base.isNotEmpty()

    @Synchronized
    fun load() {
        if (loaded) return
        store = Secure.get("yq_store")
        sess = Secure.get("yq_sess")
        Prefs.get("base_url")?.takeIf { it.isNotEmpty() && BuildConfig.YQ_BASE_URL.isEmpty() }?.let { base = it }
        sasTower = Prefs.get("sas_tower")
        loaded = true
    }

    fun setBaseUrl(url: String) {
        val u = url.trim().trimEnd('/')
        if (!u.startsWith("https://") || u.toHttpUrlOrNull() == null) throw ApiException("العنوان يجب أن يبدأ بـ https://")
        base = u
        Prefs.put("base_url", u)
    }

    fun selectTower(id: String?) {
        sasTower = id
        Prefs.put("sas_tower", id)
    }

    private fun absorb(headers: List<String>) {
        for (h in headers) {
            val kv = h.substringBefore(';').trim()
            val name = kv.substringBefore('=', "")
            if (name.isEmpty()) continue
            val value = java.net.URLDecoder.decode(kv.substringAfter('='), "UTF-8")
            val cleared = value.isEmpty() || h.lowercase().contains("max-age=0")
            when (name) {
                "yq_store" -> { store = if (cleared) null else value; Secure.put("yq_store", store) }
                "yq_sess" -> { sess = if (cleared) null else value; Secure.put("yq_sess", sess) }
            }
        }
    }

    /** طلب للخادم. يعيد الجسم كخريطة مع _status. */
    suspend fun send(method: String, path: String, body: Any? = null, query: Map<String, String> = emptyMap(), headers: Map<String, String> = emptyMap()): MutableMap<String, Any?> =
        withContext(Dispatchers.IO) {
            load()
            if (base.isEmpty()) throw ApiException("لم يُضبط عنوان الخادم.")
            val url = (base + path).toHttpUrlOrNull()?.newBuilder()?.apply { query.forEach { (k, v) -> addQueryParameter(k, v) } }?.build()
                ?: throw ApiException("عنوان الخادم غير صالح.")
            val cookies = listOfNotNull(store?.let { "yq_store=$it" }, sess?.let { "yq_sess=$it" })
            val rb = when {
                body != null -> Json.stringify(body).toRequestBody(jsonType)
                method == "POST" || method == "PUT" -> "{}".toRequestBody(jsonType)
                else -> null
            }
            val req = Request.Builder().url(url).method(method, rb)
                .header("Accept", "application/json")
                .header("User-Agent", "SufyanAndroid/${BuildConfig.VERSION_NAME} (Android)")
                .apply {
                    if (cookies.isNotEmpty()) header("Cookie", cookies.joinToString("; "))
                    headers.forEach { (k, v) -> header(k, v) }
                }
                .build()
            val (code, text, setCookies) = try {
                http.newCall(req).execute().use { r -> Triple(r.code, r.body.string(), r.headers("Set-Cookie")) }
            } catch (_: Exception) {
                throw ApiException("تعذر الاتصال بالخادم. تحقق من الإنترنت.", reason = "network")
            }
            absorb(setCookies)
            val parsed = try { Json.parse(text) } catch (_: Exception) { null }
            @Suppress("UNCHECKED_CAST")
            val data: MutableMap<String, Any?> = when (parsed) {
                is Map<*, *> -> (parsed as Map<String, Any?>).toMutableMap()
                null -> mutableMapOf("ok" to false, "reason" to "server_error")
                else -> mutableMapOf("ok" to true, "data" to parsed)
            }
            data["_status"] = code
            data
        }

    fun error(d: J, fallback: String = "تعذر إكمال الطلب. حاول مجدداً."): ApiException {
        val reason = d.sOrNull("reason") ?: d.sOrNull("error")
        val msg = d.sOrNull("message") ?: reasons[reason] ?: fallback
        return ApiException(msg, reason, d.i("_status") ?: 0, d)
    }

    private fun check(d: J, fallback: String): J {
        if (d.i("_status") == 401) throw SessionExpired()
        if (d["ok"] != true) throw error(d, fallback)
        return d
    }

    // ------------------------------------------------------------- الدخول
    suspend fun status(): J = send("GET", "/api/auth/status").also { if (it["ok"] != true) throw error(it, "تعذر الاتصال بالخادم.") }

    suspend fun storeLogin(email: String, password: String): J =
        send("POST", "/api/auth/store", mapOf("email" to email, "password" to password)).also { if (it["ok"] != true) throw error(it, "تعذر تسجيل الدخول.") }

    suspend fun pin(pin: String): J = send("POST", "/api/auth/pin", mapOf("pin" to pin)).also { if (it["ok"] != true) throw error(it, "تعذر الدخول.") }

    suspend fun lock() {
        try { send("DELETE", "/api/auth/pin") } catch (_: Exception) {}
        sess = null
        Secure.put("yq_sess", null)
    }

    suspend fun forgetStore() {
        try { send("DELETE", "/api/auth/store") } catch (_: Exception) {}
        store = null; sess = null
        Secure.put("yq_store", null); Secure.put("yq_sess", null)
    }

    // ------------------------------------------------------------- البيانات
    private fun params(p: Map<String, Any?>): Map<String, String> = buildMap {
        p.forEach { (k, v) ->
            when (v) {
                null, false, "" -> {}
                true -> put(k, "1")
                is Double -> put(k, if (v % 1.0 == 0.0) v.toLong().toString() else v.toString())
                else -> put(k, v.toString())
            }
        }
    }

    /** قراءة مورد من /api/erp. الصلاحيات تُفحص في قاعدة البيانات. */
    suspend fun get(resource: String, p: Map<String, Any?> = emptyMap()): J =
        check(send("GET", "/api/erp", query = params(p) + ("r" to resource)), "تعذر تحميل البيانات.")

    /** عملية كتابة. client_id ثابت لكل محاولة حتى لا تتكرر العملية المالية عند إعادة الإرسال. */
    suspend fun act(action: String, payload: Map<String, Any?>): J {
        val d = send("POST", "/api/erp/action", mapOf("action" to action, "payload" to payload))
        if (d.i("_status") == 401) throw SessionExpired()
        if (d["ok"] == false && d["reason"] != "duplicate") throw error(d, "تعذر حفظ العملية.")
        return d
    }

    suspend fun prefs(): J {
        val d = send("GET", "/api/push/prefs")
        if (d.i("_status") == 401) throw SessionExpired()
        return d.o("prefs") ?: throw error(d, "تعذر تحميل إعدادات الإشعارات.")
    }

    suspend fun setPrefs(patch: Map<String, Any?>): J {
        val d = send("PUT", "/api/push/prefs", mapOf("prefs" to patch))
        if (d.i("_status") == 401) throw SessionExpired()
        return d.o("prefs") ?: throw error(d, "تعذر حفظ الإعداد.")
    }

    // ------------------------------------------------------------- المساعد الذكي
    suspend fun assistant(messages: List<Map<String, String>>): String =
        check(send("POST", "/api/assistant", mapOf("messages" to messages)), "تعذر الحصول على إجابة.").s("reply")

    // ------------------------------------------------------------- SAS4 (الأبراج)
    suspend fun sas4(op: String, p: Map<String, Any?> = emptyMap()): J {
        val q = params(p).toMutableMap()
        q["op"] = op
        if (!q.containsKey("tower")) sasTower?.let { q["tower"] = it }
        return check(send("GET", "/api/sas4", query = q), "تعذر الاتصال بـ SAS4.")
    }

    /** عملية في SAS4. ref ثابت لكل محاولة حتى لا تتكرر العملية. */
    suspend fun sas4Do(op: String, ref: String, body: Map<String, Any?>): J {
        val b = body.toMutableMap()
        b["op"] = op
        b["client_ref"] = ref
        if (!b.containsKey("tower_id")) sasTower?.let { b["tower_id"] = it }
        return check(send("POST", "/api/sas4", b), "تعذر تنفيذ العملية في SAS4.")
    }

    // ------------------------------------------------------------- التحديثات
    suspend fun latestRelease(): J? = try {
        send("GET", "/app/android.json").takeIf { it.i("_status") == 200 && it.has("build") }
    } catch (_: Exception) { null }

    // ------------------------------------------------------------- إشعارات الجهاز
    suspend fun nativeRegister(token: String, deviceName: String): Long {
        val d = send("POST", "/api/native/register", mapOf("token" to token, "device_name" to deviceName))
        return check(d, "تعذر تفعيل إشعارات الجهاز.").n("last_id").toLong()
    }

    suspend fun nativeUnregister(token: String) {
        try { send("DELETE", "/api/native/register", headers = mapOf("X-Yaqoot-Device" to token)) } catch (_: Exception) {}
    }

    suspend fun nativePoll(token: String, since: Long): J =
        send("POST", "/api/native/poll", mapOf("since" to since), headers = mapOf("X-Yaqoot-Device" to token))
}
