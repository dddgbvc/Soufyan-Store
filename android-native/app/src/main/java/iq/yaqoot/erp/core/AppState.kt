package iq.yaqoot.erp.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** حالة التطبيق: الخادم ← حساب المحل ← PIN ← الواجهة حسب الصلاحيات. */
object AppState {
    enum class Phase { Loading, Setup, Unpaired, Locked, Active, Error }
    enum class Theme { System, Light, Dark }

    var phase by mutableStateOf(Phase.Loading)
    var storeName by mutableStateOf("")
    var employee by mutableStateOf<J>(emptyMap())
    var permissions by mutableStateOf<Set<String>>(emptySet())
    var message by mutableStateOf<String?>(null)
    var theme by mutableStateOf(Theme.System)
    var idleMinutes by mutableIntStateOf(10)
    var pendingRoute by mutableStateOf<String?>(null)
    var unread by mutableIntStateOf(0)
    /** يزداد عند أي تغيير يستدعي إعادة التحميل. */
    var refreshTick by mutableIntStateOf(0)
    var lastActivity = System.currentTimeMillis()

    val isAdmin get() = employee.s("role").uppercase() == "ADMIN"
    val employeeName get() = employee.s("name")
    fun can(p: String) = if (p == "__admin") isAdmin else p in permissions

    fun loadPrefs() {
        theme = when (Prefs.get("theme")) { "dark" -> Theme.Dark; "light" -> Theme.Light; else -> Theme.System }
        idleMinutes = Prefs.get("idle_minutes")?.toIntOrNull() ?: 10
    }

    suspend fun boot() {
        loadPrefs()
        Api.load()
        if (!Api.hasBase) {
            phase = Phase.Setup
            return
        }
        refresh()
    }

    suspend fun refresh() {
        try {
            apply(Api.status())
        } catch (e: Exception) {
            message = e.message
            phase = Phase.Error
        }
    }

    fun apply(s: J, forceActive: Boolean = false) {
        val st = if (forceActive) "active" else s.s("state")
        s.sOrNull("store_name")?.let { storeName = it }
        when (st) {
            "active" -> {
                employee = s.o("employee") ?: emptyMap()
                permissions = (s["permissions"] as? List<*>)?.mapNotNull { it?.toString() }?.toSet() ?: emptySet()
                message = null
                lastActivity = System.currentTimeMillis()
                phase = Phase.Active
            }
            "locked" -> phase = Phase.Locked
            else -> phase = Phase.Unpaired
        }
    }

    suspend fun lock(why: String? = null) {
        Api.lock()
        message = why
        employee = emptyMap()
        permissions = emptySet()
        phase = Phase.Locked
    }

    suspend fun signOutStore() {
        Notify.disable()
        Api.forgetStore()
        message = null
        phase = Phase.Unpaired
    }

    fun setThemeMode(t: Theme) {
        theme = t
        Prefs.put("theme", when (t) { Theme.Dark -> "dark"; Theme.Light -> "light"; else -> null })
    }

    fun setIdle(m: Int) {
        idleMinutes = m
        Prefs.put("idle_minutes", "$m")
    }

    fun touch() {
        lastActivity = System.currentTimeMillis()
    }

    fun idleExpired() = System.currentTimeMillis() - lastActivity >= idleMinutes * 60_000L
}
