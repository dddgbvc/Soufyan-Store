package iq.yaqoot.erp.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.BuildConfig
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.Notify
import iq.yaqoot.erp.core.SessionExpired
import iq.yaqoot.erp.core.b
import iq.yaqoot.erp.core.i
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import iq.yaqoot.erp.core.sOrNull
import kotlinx.coroutines.launch

data class KindMeta(val label: String, val icon: ImageVector, val color: Color, val hint: String, val perms: List<String>)

val kinds = mapOf(
    "activity" to KindMeta("كل حركات المحل", Icons.Outlined.Timeline, Yq.navy, "للمدير العام: كل عملية من أي جهاز", listOf("__admin")),
    "invoice" to KindMeta("فاتورة جديدة", Icons.AutoMirrored.Outlined.ReceiptLong, Yq.navy, "كل فاتورة بيع • أكثر من 3 بالدقيقة تُجمع", listOf("pos")),
    "debt_added" to KindMeta("دين جديد", Icons.Outlined.AccountBalanceWallet, Yq.gold, "عند إضافة دين على زبون", listOf("customers")),
    "debt_paid" to KindMeta("تسديد دين", Icons.Outlined.Payments, Yq.green, "عند قبض دفعة أو مسامحة", listOf("customers")),
    "shortage" to KindMeta("النواقص", Icons.Outlined.Inventory2, Yq.amber, "نقص يدوي أو منتج تحت حد التنبيه", listOf("shortages", "inventory")),
    "repair_ready" to KindMeta("صيانة جاهزة", Icons.Outlined.Build, Yq.blue, "عندما تصبح التذكرة جاهزة للاستلام", listOf("repairs")),
    "isp_expiring" to KindMeta("اشتراكات الإنترنت", Icons.Outlined.Wifi, Yq.blue, "قبل الانتهاء بـ3 أيام وعند الانتهاء", listOf("customers")),
    "report_daily" to KindMeta("التقرير اليومي", Icons.Outlined.CalendarToday, Yq.purple, "كل يوم 11:00 مساءً", listOf("dashboard")),
    "report_weekly" to KindMeta("التقرير الأسبوعي", Icons.Outlined.DateRange, Yq.purple, "الجمعة 11:00 مساءً", listOf("dashboard")),
    "report_monthly" to KindMeta("التقرير الشهري", Icons.Outlined.CalendarMonth, Yq.purple, "يوم 1 الساعة 9:00 صباحاً", listOf("dashboard")),
    "report_bimonthly" to KindMeta("تقرير الشهرين", Icons.Outlined.CalendarMonth, Yq.purple, "يوم 1 من الأشهر الفردية", listOf("dashboard")),
    "report_yearly" to KindMeta("التقرير السنوي", Icons.Outlined.EventNote, Yq.purple, "1 كانون الثاني 9:00 صباحاً", listOf("dashboard")),
    "custom" to KindMeta("رسالة من الإدارة", Icons.Outlined.Campaign, Yq.red, "", emptyList()),
)

private fun kind(k: String) = kinds[k] ?: kinds.getValue("custom")

@Composable
fun InboxPage() {
    val admin = AppState.can("employees.permissions")
    var tab by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        if (admin) PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
            Tab(tab == 0, { tab = 0 }, text = { Text("صندوقي") })
            Tab(tab == 1, { tab = 1 }, text = { Text("إدارة إشعارات المحل") })
        }
        if (tab == 0) MyInbox() else AdminNotifications()
    }
}

@Composable
private fun MyInbox() {
    val items = remember { mutableStateListOf<MutableMap<String, Any?>>() }
    var filter by remember { mutableStateOf("all") }
    var loading by remember { mutableStateOf(true) }
    var more by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var older by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(filter, older) {
        loading = true
        try {
            val d = Api.get("inbox", mapOf("limit" to 40, "kind" to (if (filter == "all") null else filter), "before" to (if (older > 0) items.lastOrNull()?.get("id") else null)))
            val list = d.l("items").map { it.toMutableMap() }
            if (older == 0) items.clear()
            items.addAll(list)
            AppState.unread = d.i("unread") ?: 0
            more = list.size == 40
            error = null
        } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { error = e.message }
        loading = false
    }

    fun mark(all: Boolean, ids: List<Any?> = emptyList()) {
        scope.launch {
            try {
                val d = Api.act("notify_mark", mapOf("all" to all, "ids" to ids))
                AppState.unread = d.i("unread") ?: 0
                val updated = items.map { if (all || it["id"] in ids) it.toMutableMap().apply { put("read", true) } else it }
                items.clear(); items.addAll(updated)
            } catch (_: Exception) {}
        }
    }

    Scroll {
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all" to "الكل", "activity" to "الحركات", "invoice" to "الفواتير", "debt" to "الديون", "shortage" to "النواقص", "repair_ready" to "الصيانة", "isp_expiring" to "الإنترنت", "report" to "التقارير", "custom" to "الإدارة")
                    .forEach { (k, l) -> FilterChip(filter == k, { filter = k; older = 0 }, label = { Text(l) }) }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${AppState.unread} غير مقروء", color = MaterialTheme.colorScheme.outline, modifier = Modifier.weight(1f))
                TextButton(onClick = { mark(true) }, enabled = AppState.unread > 0) { Icon(Icons.Outlined.DoneAll, null); Text(" تعليم الكل كمقروء") }
            }
        }
        if (error != null) item { ErrorView(error!!) { older = 0; filter = filter } }
        if (!loading && items.isEmpty() && error == null) item { EmptyView("لا توجد إشعارات") }
        if (items.isNotEmpty()) item {
            Card(colors = cardColors()) {
                items.forEachIndexed { i, n ->
                    if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    val k = kind(n.s("kind"))
                    val read = n.b("read")
                    ListItem(
                        headlineContent = { Text(n.s("title"), fontWeight = if (read) FontWeight.Medium else FontWeight.Bold) },
                        supportingContent = { Text("${n.s("body")}\n${k.label} • ${Fmt.`when`(n["created_at"])}") },
                        leadingContent = { Avatar("", k.icon, k.color) },
                        colors = ListItemDefaults.colors(containerColor = if (read) Color.Transparent else MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)),
                        modifier = Modifier.clickable {
                            if (!read) mark(false, listOf(n["id"]))
                            n.sOrNull("url")?.takeIf { it.startsWith("/#") }?.let { AppState.pendingRoute = it }
                        },
                    )
                }
            }
        }
        if (loading) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        if (more && !loading) item { OutlinedButton(onClick = { older++ }, modifier = Modifier.fillMaxWidth()) { Text("تحميل الأقدم") } }
    }
}

@Composable
private fun AdminNotifications() {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    Loader(v, load = { Api.get("notify_admin") }) { d, _ ->
        val emps = d.l("employees")
        val total = (d.o("stats") ?: emptyMap()).values.sumOf { iq.yaqoot.erp.core.numOf(it) }
        Scroll {
            item {
                KpiGrid(
                    tile { m -> Kpi("إشعارات آخر 7 أيام", total.toLong(), Icons.Outlined.NotificationsActive, MaterialTheme.colorScheme.primary, m, raw = true) },
                    tile { m -> Kpi("بأجهزة مفعّلة", emps.count { it.n("devices") > 0 }, Icons.Outlined.Smartphone, Yq.blue, m, "من ${emps.size} موظف", raw = true) },
                )
            }
            item {
                Button(onClick = { scope.launch { if (Ui.sheet<Boolean> { BroadcastSheet(emps, it) } == true) v++ } }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Icon(Icons.Outlined.Campaign, null); Text("  إرسال إشعار مخصص")
                }
            }
            item {
                Section("الموظفون والإشعارات", "اضغط موظفاً لتخصيص إشعاراته") {
                    emps.forEach { e ->
                        val prefs = e.o("prefs")
                        val devices = (e["device_names"] as? List<*>)?.joinToString("، ").orEmpty()
                        Item(
                            e.s("name"),
                            "${Fmt.roleLabel[e.s("role")] ?: e.s("role")} • ${if (e.n("devices") > 0) devices else "بلا جهاز"}${if (prefs.b("quiet")) " • هدوء ${prefs.s("quiet_from")}–${prefs.s("quiet_to")}" else ""}",
                            avatarText = e.s("name"),
                            trailing = { if (e.n("unread") > 0) Pill(e.s("unread"), Yq.amber) },
                        ) {
                            Ui.push {
                                Page("إشعارات ${e.s("name")}") { pad ->
                                    Scroll(pad) {
                                        item {
                                            val perms = ((e["permissions"] as? List<*>)?.map { it.toString() } ?: emptyList()) + (if (e.s("role") == "ADMIN") listOf("__admin") else emptyList())
                                            PrefsEditor(prefs ?: emptyMap(), perms) { patch -> Api.act("notify_admin_set", mapOf("employee_id" to e["id"], "prefs" to patch)).o("prefs") ?: emptyMap() }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item {
                Section("سجل الإشعارات (7 أيام)") {
                    d.l("recent").forEach { n ->
                        val k = kind(n.s("kind"))
                        Item(n.s("title"), "${n.s("body")}\n${Fmt.`when`(n["created_at"])} • ${n.s("recipients")} مستلم", k.icon, k.color)
                    }
                }
            }
        }
    }
}

@Composable
private fun BroadcastSheet(emps: List<J>, close: (Boolean?) -> Unit) {
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var all by remember { mutableStateOf(true) }
    var urgent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val picked = remember { mutableStateListOf<String>() }
    val scope = rememberCoroutineScope()
    SheetBody("إشعار مخصص", "يُضاف اسمك في آخره") {
        Input(title, { title = it.take(80) }, "العنوان")
        Input(body, { body = it.take(300) }, "النص", singleLine = false, minLines = 3)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(all, { all = true }, SegmentedButtonDefaults.itemShape(0, 2)) { Text("كل الموظفين") }
            SegmentedButton(!all, { all = false }, SegmentedButtonDefaults.itemShape(1, 2)) { Text("محددون") }
        }
        if (!all) emps.forEach { e ->
            val id = e.s("id")
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { if (id in picked) picked.remove(id) else picked.add(id) }) {
                Checkbox(id in picked, { if (it) picked.add(id) else picked.remove(id) })
                Column { Text(e.s("name")); if (e.n("devices") == 0.0) Text("صندوق فقط", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline) }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text("عاجل"); Text("يتجاوز ساعات الهدوء", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline) }
            Switch(urgent, { urgent = it })
        }
        ErrorText(error)
        Button(onClick = {
            if (!all && picked.isEmpty()) { error = "اختر موظفاً واحداً على الأقل"; return@Button }
            busy = true; error = null
            scope.launch {
                try {
                    val r = Api.act("notify_broadcast", mapOf("title" to title.trim(), "body" to body.trim(), "urgent" to urgent, "employee_ids" to if (all) emptyList() else picked.toList()))
                    Ui.toast("وصل إلى ${r.s("recipients")} موظف"); close(true)
                } catch (e: Exception) { error = e.message; Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else { Icon(Icons.AutoMirrored.Outlined.Send, null); Text("  إرسال الآن") } }
    }
}

/** محرر تفضيلات الإشعارات: لكل نوع تشغيل/إيقاف، حد الفاتورة، ساعات الهدوء. */
@Composable
fun PrefsEditor(initial: J, permissions: List<String>, save: suspend (Map<String, Any?>) -> J) {
    var p by remember(initial) { mutableStateOf(initial) }
    var busy by remember { mutableStateOf<String?>(null) }
    var min by remember { mutableStateOf(Fmt.money(initial["invoice_min"] ?: 0)) }
    val scope = rememberCoroutineScope()
    fun change(patch: Map<String, Any?>) {
        val before = p
        p = p + patch
        busy = patch.keys.first()
        scope.launch {
            try { p = save(patch) } catch (e: Exception) { p = before; Ui.fail(e) }
            busy = null
        }
    }
    val visible = kinds.filter { (k, m) -> k != "custom" && m.perms.any { it in permissions } }
    Section("الإشعارات التلقائية", "تصل لصندوقك دائماً، وللهاتف إذا فعّلته") {
        visible.forEach { (k, m) ->
            SwitchRow(m.label, m.hint, m.icon, m.color, p[k] != false, enabled = busy != k) { change(mapOf(k to it)) }
        }
        if ("invoice" in visible && p["invoice"] != false) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                MoneyField(min, { min = it }, "أقل مبلغ لإشعار الفاتورة", Modifier.weight(1f), helper = "0 = كل الفواتير")
                OutlinedButton(onClick = { change(mapOf("invoice_min" to moneyValue(min))) }, modifier = Modifier.padding(start = 8.dp)) { Text("حفظ") }
            }
        }
        SwitchRow("ساعات الهدوء", "لا يرنّ الهاتف خلالها، والإشعار يُحفظ في الصندوق", Icons.Outlined.Bedtime, MaterialTheme.colorScheme.primary, p.b("quiet")) { change(mapOf("quiet" to it)) }
        if (p.b("quiet")) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("quiet_from" to "من", "quiet_to" to "إلى").forEach { (key, label) ->
                    OutlinedButton(onClick = {
                        scope.launch {
                            val t = Ui.sheet<String> { close -> TimeSheet(p.s(key).ifEmpty { "23:30" }, close) }
                            if (t != null) change(mapOf(key to t))
                        }
                    }, modifier = Modifier.weight(1f)) { Text("$label ${p.s(key)}") }
                }
            }
        }
    }
}

@Composable
private fun TimeSheet(initial: String, close: (String?) -> Unit) {
    val parts = initial.split(":")
    val state = androidx.compose.material3.rememberTimePickerState(parts.getOrNull(0)?.toIntOrNull() ?: 23, parts.getOrNull(1)?.toIntOrNull() ?: 0, true)
    SheetBody("اختر الوقت") {
        androidx.compose.material3.TimePicker(state)
        Button(onClick = { close("${Fmt.two(state.hour)}:${Fmt.two(state.minute)}") }, modifier = Modifier.fillMaxWidth()) { Text("حفظ") }
    }
}

@Composable
fun SwitchRow(title: String, hint: String?, icon: ImageVector?, color: Color, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = hint?.takeIf { it.isNotEmpty() }?.let { { Text(it) } },
        leadingContent = icon?.let { { Icon(it, null, tint = color) } },
        trailingContent = { Switch(checked, onChange, enabled = enabled) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(enabled = enabled) { onChange(!checked) },
    )
}

// ====================================================================== الإعدادات
@Composable
fun SettingsPage() {
    var deviceOn by remember { mutableStateOf(Notify.enabled) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val perms = AppState.permissions.toList() + (if (AppState.isAdmin) listOf("__admin") else emptyList())

    fun enable() {
        busy = true
        scope.launch {
            try {
                Notify.enable("Android • ${AppState.employeeName}")
                deviceOn = true
                Ui.toast("تم تفعيل إشعارات هذا الهاتف")
            } catch (e: Exception) { Ui.fail(e) }
            busy = false
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) enable() else Ui.toast("اسمح بالإشعارات من إعدادات الهاتف ← التطبيقات ← متابعة مكتب سفيان", error = true)
    }

    Scroll {
        item {
            Card(colors = cardColors()) {
                Item(AppState.employeeName, "${Fmt.roleLabel[AppState.employee.s("role")] ?: AppState.employee.s("role")} • ${AppState.storeName} • ${AppState.permissions.size} صلاحية", avatarText = AppState.employeeName)
            }
        }
        item {
            Section("إشعارات هذا الهاتف", "تصل حتى والتطبيق مغلق (كل ~15 دقيقة) وكل 15 ثانية أثناء فتحه") {
                SwitchRow("تفعيل الإشعارات على هذا الهاتف", if (deviceOn) "مفعّلة لـ ${AppState.employeeName}" else "غير مفعّلة", Icons.Outlined.NotificationsActive, MaterialTheme.colorScheme.primary, deviceOn, enabled = !busy) { on ->
                    if (on) {
                        if (Build.VERSION.SDK_INT >= 33 && !Notify.permitted()) permission.launch(Manifest.permission.POST_NOTIFICATIONS) else enable()
                    } else {
                        busy = true
                        scope.launch { try { Notify.disable(); deviceOn = false } catch (e: Exception) { Ui.fail(e) }; busy = false }
                    }
                }
                if (deviceOn) Item("فحص الآن", null, Icons.Outlined.Sync) {
                    scope.launch {
                        val n = try { Notify.pollOnce() } catch (_: Exception) { null }
                        Ui.toast(if (n == null) "تم الفحص" else "$n غير مقروء")
                    }
                }
            }
        }
        item { Fetch(load = { Api.prefs() }) { p -> PrefsEditor(p, perms) { patch -> Api.setPrefs(patch) } } }
        item {
            Section("المظهر") {
                listOf(AppState.Theme.System to "حسب الهاتف", AppState.Theme.Light to "نهاري", AppState.Theme.Dark to "ليلي (أسود)").forEach { (t, label) ->
                    Row(Modifier.fillMaxWidth().clickable { AppState.setThemeMode(t) }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(AppState.theme == t, { AppState.setThemeMode(t) }); Text(label)
                    }
                }
            }
        }
        item {
            Section("الأمان") {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Timer, null)
                    Text("  القفل التلقائي بعد الخمول", Modifier.weight(1f))
                }
                Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(5, 10, 15, 30).forEach { m -> FilterChip(AppState.idleMinutes == m, { AppState.setIdle(m) }, label = { Text("$m د") }) }
                }
                Item("قفل الآن وتبديل الموظف", null, Icons.Outlined.Lock) { scope.launch { AppState.lock() } }
                if (AppState.isAdmin || AppState.can("settings.account")) {
                    Item("الخروج من حساب المحل", "يلغي تفعيل هذا الهاتف ويحتاج حساب المالك من جديد", Icons.AutoMirrored.Filled.Logout, Yq.red) {
                        scope.launch { if (Ui.confirm("الخروج من حساب المحل؟", "سيُلغى تفعيل الهاتف وإشعاراته.", "خروج", danger = true)) AppState.signOutStore() }
                    }
                }
            }
        }
        item { UpdateCard() }
        item {
            Text("متابعة مكتب سفيان للموبايل • أندرويد ${BuildConfig.VERSION_NAME}", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.fillMaxWidth().padding(8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

/** التحديث الداخلي: يقرأ /app/android.json من خادم المحل ويقارن رقم البناء. */
@Composable
private fun UpdateCard() {
    var rel by remember { mutableStateOf<J?>(null) }
    LaunchedEffect(Unit) { rel = Api.latestRelease() }
    val r = rel ?: return
    if ((r.i("build") ?: 0) <= BuildConfig.VERSION_CODE) return
    Section("تحديث متاح", "الإصدار ${r.s("version")}") {
        r.sOrNull("notes")?.let { Text(it, Modifier.padding(horizontal = 16.dp)) }
        r.sOrNull("apk_url")?.let { url ->
            Button(onClick = { Ui.open(android.net.Uri.parse(url)) }, modifier = Modifier.fillMaxWidth().padding(16.dp)) { Text("تنزيل التحديث") }
        }
    }
}
