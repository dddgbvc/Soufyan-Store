package iq.yaqoot.erp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Autorenew
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.CellTower
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Contacts
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PersonAddAlt1
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.ApiException
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.SessionExpired
import iq.yaqoot.erp.core.b
import iq.yaqoot.erp.core.clientId
import iq.yaqoot.erp.core.i
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import iq.yaqoot.erp.core.sOrNull
import kotlinx.coroutines.launch

/*
 * SAS4 بالأبراج: كل برج حساب موزع بدخول محفوظ دائماً في الخادم (كلمة المرور مشفّرة هناك ولا تصل للهاتف).
 * البحث والعمليات تتم على البرج المختار، مع تبديل سريع. كل عملية تُؤكد قبل الإرسال وتحمل مرجعاً ثابتاً
 * فلا تتكرر عند إعادة الضغط، وإن لم تتأكد نتيجتها تُقفل إعادتها حتى يُتحقق من المشترك.
 */
fun newRef(prefix: String) = "$prefix-${clientId()}"
private val userRe = Regex("^[a-zA-Z0-9.@_:-]{3,64}$")

@Composable
fun SasPage() {
    var towers by remember { mutableStateOf<List<J>>(emptyList()) }
    var canManage by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var defaultHost by remember { mutableStateOf("reseller.nbtel.iq") }
    var selected by remember { mutableStateOf(Api.sasTower) }
    var q by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<J>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var searchError by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val current = towers.firstOrNull { it.s("id") == selected }

    LaunchedEffect(v) {
        try {
            val r = Api.sas4("towers")
            towers = r.l("towers")
            canManage = r.b("can_manage")
            r.sOrNull("default_host")?.let { defaultHost = it }
            if (towers.none { it.s("id") == selected }) { selected = towers.firstOrNull()?.s("id"); Api.selectTower(selected) }
            error = null
        } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { error = e.message }
        loaded = true
    }

    fun nextName(): String {
        val names = towers.map { it.s("name") }.toSet()
        var n = towers.size + 1
        while ("برج $n" in names) n++
        return "برج $n"
    }

    fun towerLogin(t: J? = null) = scope.launch { if (Ui.sheet<Boolean> { TowerLoginSheet(t, defaultHost, nextName(), it) } == true) v++ }

    fun search() {
        if (q.trim().length < 2 || current == null) return
        searching = true; searchError = null
        scope.launch {
            try {
                users = Api.sas4("users", mapOf("q" to q.trim())).l("users")
                if (users.isEmpty()) searchError = "لا توجد نتائج."
            } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { searchError = e.message }
            searching = false
        }
    }

    Page("SAS4", actions = {
        if (towers.isNotEmpty() || canManage) Box {
            TextButton(onClick = { menu = true }) { Icon(Icons.Outlined.CellTower, null); Text(" ${current?.s("name") ?: "الأبراج"}") }
            DropdownMenu(menu, { menu = false }) {
                towers.forEach { t ->
                    DropdownMenuItem(
                        text = { Text(t.s("name")) },
                        leadingIcon = { if (t.s("id") == selected) Icon(Icons.Outlined.Check, null) },
                        onClick = { menu = false; selected = t.s("id"); Api.selectTower(selected); users = emptyList(); searchError = null },
                    )
                }
                if (canManage) {
                    HorizontalDivider()
                    DropdownMenuItem(text = { Text("إضافة برج") }, leadingIcon = { Icon(Icons.Outlined.Add, null) }, onClick = { menu = false; towerLogin() })
                    DropdownMenuItem(text = { Text("إدارة الأبراج") }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.List, null) }, onClick = {
                        menu = false
                        Ui.push { TowersManagePage(defaultHost, ::nextName) { v++ } }
                    })
                }
            }
        }
        if (current != null) IconButton(onClick = { scope.launch { Ui.sheet<Boolean> { SasCreateSheet(it) } } }) { Icon(Icons.Outlined.PersonAddAlt1, "مشترك جديد") }
    }) { pad ->
        if (!loaded) Box(Modifier.padding(pad).fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else Scroll(pad) {
            if (error != null) item { ErrorView(error!!) { v++ } }
            if (current == null && error == null) item {
                Card(colors = cardColors()) {
                    Item(
                        if (canManage) "أضف برجك الأول" else "لا توجد أبراج",
                        if (canManage) "سجّل دخول حساب الموزع مرة واحدة ويبقى محفوظاً. تقدر تضيف أكثر من برج وتبدّل بينها بسرعة." else "يضيف المدير الأبراج من هذا القسم.",
                        Icons.Outlined.CellTower, Yq.gold,
                    ) { if (canManage) towerLogin() }
                }
            }
            if (current != null) {
                item {
                    Card(colors = cardColors()) {
                        val err = current.sOrNull("last_error")
                        Item(
                            current.s("name"), err ?: "متصل مباشرة بـ SAS4 • ${current.s("username")}",
                            if (err == null) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline, if (err == null) Yq.green else Yq.red,
                            trailing = { if (err != null && canManage) TextButton(onClick = { towerLogin(current) }) { Text("دخول") } },
                        )
                    }
                }
                item {
                    OutlinedTextField(
                        q, { q = it }, singleLine = true, placeholder = { Text("اسم المستخدم أو الاسم أو الهاتف") },
                        leadingIcon = { Icon(Icons.Outlined.Search, null) },
                        trailingIcon = { IconButton(onClick = { search() }, enabled = !searching) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "بحث") } },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { search() }),
                        shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (searching) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                searchError?.let { item { Text(it, color = Yq.red) } }
                if (users.isNotEmpty()) item {
                    Card(colors = cardColors()) {
                        users.forEachIndexed { i, u ->
                            if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            Item(
                                u.s("username"),
                                listOf("${u.s("firstname")} ${u.s("lastname")}".trim(), u.s("phone"), u.sOrNull("expiration")?.let { "ينتهي $it" } ?: "").filter { it.isNotEmpty() }.joinToString(" • "),
                                Icons.Outlined.Person, if (u.b("enabled")) Yq.green else MaterialTheme.colorScheme.outline,
                            ) { u.i("id")?.let { id -> Ui.push { SasUserPage(id, u) } } }
                        }
                    }
                }
            }
        }
    }
}

// ====================================================================== الأبراج
@Composable
private fun TowerLoginSheet(tower: J?, defaultHost: String, nextName: String, close: (Boolean?) -> Unit) {
    val isNew = tower == null
    var name by remember { mutableStateOf(tower?.s("name") ?: nextName) }
    var host by remember { mutableStateOf(tower?.sOrNull("host") ?: defaultHost) }
    var user by remember { mutableStateOf(tower?.s("username") ?: "") }
    var pass by remember { mutableStateOf("") }
    var showHost by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val valid = if (isNew) user.isNotBlank() && pass.isNotEmpty() else if (pass.isNotEmpty()) user.isNotBlank() else name.isNotBlank()
    SheetBody(if (isNew) "إضافة برج" else "تعديل البرج", "يُحفظ الدخول دائماً على خادم المحل مشفّراً، ويتجدد تلقائياً. كلمة المرور لا تُحفظ على الهاتف.") {
        Input(name, { name = it }, "اسم البرج", helper = "تسمية تظهر في التبديل السريع")
        Input(user, { user = it }, "اسم المستخدم في SAS4", ltr = true)
        OutlinedTextField(
            pass, { pass = it }, label = { Text(if (isNew) "كلمة المرور" else "كلمة مرور جديدة (اتركها فارغة للإبقاء)") },
            singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
        )
        TextButton(onClick = { showHost = !showHost }) { Text("خادم SAS4") }
        if (showHost) Input(host, { host = it }, "العنوان", keyboard = KeyboardType.Uri, ltr = true)
        ErrorText(error)
        Button(onClick = {
            busy = true; error = null
            scope.launch {
                try {
                    val body = buildMap<String, Any?> {
                        if (!isNew) put("id", tower!!["id"])
                        put("name", name.trim())
                        if (pass.isNotEmpty()) { put("username", user.trim()); put("password", pass); put("host", host.trim()) }
                    }
                    val r = Api.sas4Do("tower_save", newRef("tw"), body)
                    pass = ""
                    if (isNew) r.sOrNull("id")?.let { Api.selectTower(it) }
                    close(true)
                } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { error = e.message }
                busy = false
            }
        }, enabled = !busy && valid, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text(if (isNew) "دخول وحفظ" else "حفظ") }
    }
}

@Composable
private fun TowersManagePage(defaultHost: String, nextName: () -> String, changed: () -> Unit) {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    Page("الأبراج", actions = {
        IconButton(onClick = { scope.launch { if (Ui.sheet<Boolean> { TowerLoginSheet(null, defaultHost, nextName(), it) } == true) { v++; changed() } } }) { Icon(Icons.Outlined.Add, "إضافة برج") }
    }) { pad ->
        Loader(v, load = { Api.sas4("towers") }) { d, _ ->
            val towers = d.l("towers")
            Scroll(pad) {
                if (towers.isEmpty()) item { EmptyView("لا توجد أبراج بعد") }
                towers.forEach { t ->
                    item {
                        Card(colors = cardColors()) {
                            Item(
                                t.s("name"), "${t.s("username")} • ${t.s("host")}${if (t.sOrNull("last_error") != null) "\nيحتاج دخول" else ""}",
                                Icons.Outlined.CellTower, if (t.sOrNull("last_error") == null) Yq.green else Yq.red,
                                trailing = {
                                    IconButton(onClick = {
                                        scope.launch {
                                            if (!Ui.confirm("حذف البرج «${t.s("name")}»؟", "يُحذف الدخول المحفوظ. لا يتأثر أي مشترك في SAS4.", "حذف", danger = true)) return@launch
                                            try {
                                                Api.sas4Do("tower_delete", newRef("td"), mapOf("id" to t["id"]))
                                                if (Api.sasTower == t.s("id")) Api.selectTower(null)
                                                v++; changed()
                                            } catch (e: Exception) { Ui.fail(e) }
                                        }
                                    }) { Icon(Icons.Outlined.Delete, "حذف", tint = Yq.red) }
                                },
                            ) { scope.launch { if (Ui.sheet<Boolean> { TowerLoginSheet(t, defaultHost, "", it) } == true) { v++; changed() } } }
                        }
                    }
                }
                item { Text("اضغط على البرج لتغيير تسميته أو إعادة تسجيل دخوله.", color = MaterialTheme.colorScheme.outline) }
            }
        }
    }
}

// ====================================================================== المشترك
@Composable
fun SasUserPage(userId: Int, initial: J) {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    fun open(content: @Composable ((String?) -> Unit) -> Unit) {
        scope.launch { Ui.sheet<String>(content)?.let { Ui.toast(it); v++ } }
    }
    Page(initial.s("username")) { pad ->
        Loader(v, load = { Api.sas4("user", mapOf("id" to userId)) }) { d, _ ->
            val u = d.o("user") ?: initial
            val act = d.o("activation")
            val enabled = u.b("enabled")
            Scroll(pad) {
                item {
                    Section("المشترك لدى المزوّد", trailing = { Pill(if (enabled) "مفعّل" else "موقوف", if (enabled) Yq.green else MaterialTheme.colorScheme.outline) }) {
                        Field("اسم المستخدم", u.s("username"))
                        Field("رقم المشترك لدى SAS4", userId)
                        Field("الاسم", "${u.s("firstname")} ${u.s("lastname")}".trim())
                        Field("الهاتف", u.sOrNull("phone"))
                        Field("الباقة", u.sOrNull("profile_name"))
                        Field("الانتهاء", u.sOrNull("expiration"))
                        Field("الموزع", u.sOrNull("parent_username"))
                        Field("آخر اتصال", u.sOrNull("last_online"))
                        if (u.b("profileChange")) Text("يوجد تغيير باقة مجدول عند الانتهاء القادم.", color = Yq.amber, modifier = Modifier.padding(16.dp))
                    }
                }
                if (act != null) item {
                    Section("التجديد", "رصيد الموزع لدى الشركة منفصل عن ديون الزبون في المحل") {
                        Field("الباقة", act.sOrNull("profile_name"))
                        Field("المدة", act.sOrNull("profile_duration"))
                        Field("كلفة التجديد على الموزع", act.sOrNull("required_amount"))
                        Field("رصيد الموزع لدى الشركة", act.sOrNull("manager_balance"))
                        Field("رصيد المشترك لدى الشركة", act.sOrNull("user_balance"))
                    }
                }
                item {
                    Section("العمليات") {
                        if (act != null) Item("تجديد من رصيد الموزع", null, Icons.Outlined.Autorenew) { open { SasRenewSheet(userId, u, act, false, it) } }
                        Item("تجديد بكارت", null, Icons.Outlined.CreditCard) { open { SasRenewSheet(userId, u, act ?: emptyMap(), true, it) } }
                        Item("تمديد", null, Icons.Outlined.MoreTime) { open { SasExtendSheet(userId, u, it) } }
                        Item("تغيير الباقة", null, Icons.Outlined.Speed) { open { SasProfileSheet(userId, u, it) } }
                        Item("تعديل البيانات", null, Icons.Outlined.Edit) { open { SasEditSheet(userId, u, it) } }
                        Item("تغيير اسم المستخدم", null, Icons.Outlined.Badge) { open { SasRenameSheet(userId, u, it) } }
                        Item("سجل المشترك في SAS4", null, Icons.Outlined.History) { Ui.push { SasHistoryPage(userId) } }
                    }
                }
                item {
                    val ops = d.l("ops")
                    Section("عمليات التطبيق على هذا المشترك") {
                        if (ops.isEmpty()) EmptyView("لا توجد عمليات من التطبيق")
                        ops.forEach { o ->
                            Item(
                                "${opLabel(o.s("op"))} • ${statusLabel(o.s("status"))}",
                                listOf(o.s("employee"), Fmt.`when`(o["created_at"]), o.s("error")).filter { it.isNotEmpty() }.joinToString(" • "),
                                Icons.Outlined.Schedule, statusColor(o.s("status")),
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun opLabel(op: String) = mapOf("renew" to "تجديد", "extend" to "تمديد", "change_profile" to "تغيير باقة", "edit" to "تعديل بيانات", "rename" to "تغيير اسم", "create" to "إنشاء مشترك")[op] ?: op
private fun statusLabel(s: String) = mapOf("success" to "تم", "failed" to "رُفض", "unknown" to "غير مؤكد", "pending" to "قيد التنفيذ")[s] ?: s
private fun statusColor(s: String) = if (s == "success") Yq.green else if (s == "failed") Yq.red else Yq.amber

// ====================================================================== إرسال العمليات
/** حالة إرسال مشتركة: مرجع ثابت، وإعادة توليده بعد رفض صريح فقط. نتيجة غير مؤكدة تقفل الإعادة. */
class SasSubmit(private val prefix: String) {
    var ref = newRef(prefix)
    var busy by mutableStateOf(false)
    var uncertain by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    suspend fun run(op: String, body: Map<String, Any?>): J? {
        busy = true; error = null
        try {
            return Api.sas4Do(op, ref, body)
        } catch (e: SessionExpired) {
            Ui.expire()
        } catch (e: ApiException) {
            error = e.message
            if (e.reason == "sas_uncertain") uncertain = true else ref = newRef(prefix)
        } catch (e: Exception) {
            error = e.message
            ref = newRef(prefix)
        } finally {
            busy = false
        }
        return null
    }

    @Composable
    fun Status() {
        error?.let { Text(it, color = if (uncertain) Yq.amber else Yq.red, fontSize = 13.sp) }
    }
}

@Composable
private fun ActionButton(text: String, s: SasSubmit, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled && !s.busy && !s.uncertain, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (s.busy) Busy() else Text(text) }
}

@Composable
fun SasRenewSheet(userId: Int, user: J, activation: J, card: Boolean, close: (String?) -> Unit) {
    val s = remember { SasSubmit("rn") }
    var pin by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val amount = activation["n_required_amount"]?.let { iq.yaqoot.erp.core.numOf(it) } ?: Fmt.parseMoney(activation.s("required_amount")).takeIf { it > 0 }
    SheetBody(if (card) "تجديد بكارت" else "تجديد من الرصيد", "${user.s("username")} • ينتهي حالياً ${user.sOrNull("expiration") ?: "—"}") {
        if (!card) {
            Field("الباقة", activation.sOrNull("profile_name") ?: user.sOrNull("profile_name"))
            Field("الكلفة من رصيد الموزع", activation.sOrNull("required_amount") ?: amount?.let { Fmt.money(it) })
            Field("رصيد الموزع", activation.sOrNull("manager_balance"))
        } else Input(pin, { pin = it }, "رقم الكارت (PIN)", ltr = true)
        Input(note, { note = it }, "ملاحظة تظهر في SAS4 (اختياري)")
        s.Status()
        ActionButton("تجديد", s, if (card) pin.isNotBlank() else amount != null) {
            scope.launch {
                val ok = Ui.confirm("تأكيد التجديد في SAS4",
                    if (card) "تجديد ${user.s("username")} بالكارت المدخل." else "تجديد ${user.s("username")} وخصم ${activation.sOrNull("required_amount") ?: Fmt.money(amount)} من رصيد الموزع.\nلا يُضاف دين على الزبون من هنا.",
                    "نعم، جدّد")
                if (!ok) return@launch
                val body = buildMap<String, Any?> {
                    put("user_id", userId); put("username", user.s("username")); put("method", if (card) "card" else "credit"); put("comments", note.trim())
                    if (card) put("pin", pin.trim()) else put("expected_amount", amount)
                }
                s.run("renew", body)?.let { r -> close(r.o("result").sOrNull("expiration")?.let { "تم التجديد. ينتهي $it" } ?: "تم التجديد") }
            }
        }
    }
}

@Composable
private fun SasExtendSheet(userId: Int, user: J, close: (String?) -> Unit) {
    val s = remember { SasSubmit("ex") }
    var sel by remember { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()
    Fetch(load = { Api.sas4("extensions", mapOf("id" to userId)) }) { d ->
        val options = d.l("options")
        val selName = options.firstOrNull { it.i("id") == sel }?.s("name").orEmpty()
        SheetBody("تمديد", "${user.s("username")} • ينتهي ${d.o("info").sOrNull("expiration") ?: user.sOrNull("expiration") ?: "—"}") {
            if (options.isEmpty()) Text("لا توجد تمديدات مسموحة لهذه الباقة.")
            options.forEach { o -> RadioLine(o.s("name"), sel == o.i("id")) { sel = o.i("id") } }
            s.Status()
            ActionButton("تمديد", s, sel != null) {
                scope.launch {
                    if (!Ui.confirm("تأكيد التمديد", "تمديد ${user.s("username")} بـ «$selName» من رصيد الموزع.", "نعم، مدّد")) return@launch
                    s.run("extend", mapOf("user_id" to userId, "profile_id" to sel, "profile_name" to selName, "username" to user.s("username")))?.let { r ->
                        close(r.o("result").sOrNull("expiration")?.let { "تم التمديد. ينتهي $it" } ?: "تم التمديد")
                    }
                }
            }
        }
    }
}

@Composable
private fun SasProfileSheet(userId: Int, user: J, close: (String?) -> Unit) {
    val s = remember { SasSubmit("cp") }
    var sel by remember { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()
    Fetch(load = { Api.sas4("profiles") }) { d ->
        val profiles = d.l("profiles")
        val selName = profiles.firstOrNull { it.i("id") == sel }?.s("name").orEmpty()
        SheetBody("تغيير الباقة", "الحالية: ${user.sOrNull("profile_name") ?: "—"}\nإذا كان الاشتراك فعّالاً، يطبّق SAS4 الباقة الجديدة عند الانتهاء القادم.") {
            profiles.forEach { p -> RadioLine(p.s("name"), sel == p.i("id")) { sel = p.i("id") } }
            s.Status()
            ActionButton("حفظ", s, sel != null && sel != user.i("profile_id")) {
                scope.launch {
                    if (!Ui.confirm("تأكيد تغيير الباقة", "${user.s("username")}: من «${user.s("profile_name")}» إلى «$selName».", "نعم، غيّر")) return@launch
                    s.run("change_profile", mapOf("user_id" to userId, "profile_id" to sel, "profile_name" to selName, "username" to user.s("username")))?.let { close("تم طلب تغيير الباقة إلى $selName") }
                }
            }
        }
    }
}

@Composable
private fun SasEditSheet(userId: Int, user: J, close: (String?) -> Unit) {
    val s = remember { SasSubmit("ed") }
    val keys = listOf("firstname", "lastname", "phone", "address", "city", "notes")
    val names = mapOf("firstname" to "الاسم الأول", "lastname" to "اسم العائلة", "phone" to "الهاتف", "address" to "العنوان", "city" to "المدينة", "notes" to "الملاحظات", "enabled" to "حالة الحساب")
    val values = remember { androidx.compose.runtime.mutableStateMapOf<String, String>().apply { keys.forEach { put(it, user.s(it)) } } }
    var enabled by remember { mutableStateOf(user.b("enabled")) }
    val scope = rememberCoroutineScope()
    val pick = rememberPhonePicker { values["phone"] = it }
    val changes = buildMap<String, Any?> {
        keys.forEach { k -> if (values[k].orEmpty().trim() != user.s(k)) put(k, values[k].orEmpty().trim()) }
        if (enabled != user.b("enabled")) put("enabled", enabled)
    }
    SheetBody("تعديل البيانات", user.s("username")) {
        keys.forEach { k ->
            if (k == "phone") Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Input(values[k].orEmpty(), { values[k] = it }, names.getValue(k), Modifier.weight(1f), keyboard = KeyboardType.Phone, ltr = true)
                OutlinedButton(onClick = pick) { Icon(Icons.Outlined.Contacts, "من جهات الاتصال") }
            } else Input(values[k].orEmpty(), { values[k] = it }, names.getValue(k), singleLine = k != "notes", minLines = if (k == "notes") 3 else 1)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("الحساب مفعّل")
                Text("إيقاف الحساب يمنع المشترك من الاتصال حتى تعيد تفعيله.", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
            }
            Switch(enabled, { enabled = it })
        }
        s.Status()
        ActionButton("حفظ", s, changes.isNotEmpty()) {
            scope.launch {
                if (!Ui.confirm("حفظ التعديلات في SAS4؟", "سيتغير: ${changes.keys.joinToString("، ") { names[it] ?: it }}", "حفظ")) return@launch
                s.run("edit", mapOf("user_id" to userId, "username" to user.s("username"), "changes" to changes))?.let { close("تم حفظ التعديلات") }
            }
        }
    }
}

@Composable
private fun SasRenameSheet(userId: Int, user: J, close: (String?) -> Unit) {
    val s = remember { SasSubmit("rnm") }
    var name by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    SheetBody("تغيير اسم المستخدم", "الحالي: ${user.s("username")}") {
        Input(name, { name = it }, "اسم المستخدم الجديد", helper = "حروف إنجليزية وأرقام و . @ _ - فقط", ltr = true)
        s.Status()
        ActionButton("حفظ", s, userRe.matches(name) && name != user.s("username")) {
            scope.launch {
                if (!Ui.confirm("تغيير اسم المستخدم؟", "${user.s("username")} ← $name", "تغيير")) return@launch
                s.run("rename", mapOf("user_id" to userId, "username" to user.s("username"), "new_username" to name))?.let { close("تم تغيير اسم المستخدم إلى $name") }
            }
        }
    }
}

@Composable
private fun SasCreateSheet(close: (Boolean?) -> Unit) {
    val s = remember { SasSubmit("cr") }
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var first by remember { mutableStateOf("") }
    var last by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var profile by remember { mutableStateOf<Int?>(null) }
    var created by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val pick = rememberPhonePicker { phone = it }
    created?.let { u ->
        SheetBody("أُنشئ المشترك", u) {
            Text("لتفعيله: افتحه من البحث واختر «تجديد». لربطه بزبون في المحل استعمل قسم الإنترنت في البرنامج.")
            Button(onClick = { close(true) }, modifier = Modifier.fillMaxWidth()) { Text("تم") }
        }
        return
    }
    Fetch(load = { Api.sas4("profiles") }) { d ->
        val profiles = d.l("profiles")
        val profileName = profiles.firstOrNull { it.i("id") == profile }?.s("name").orEmpty()
        SheetBody("مشترك جديد في SAS4", "ينشئ مشتركاً حقيقياً على البرج المختار") {
            Input(user, { user = it }, "اسم المستخدم", ltr = true)
            OutlinedTextField(pass, { pass = it }, label = { Text("كلمة المرور") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth())
            Text("الباقة", fontWeight = FontWeight.SemiBold)
            profiles.forEach { p -> RadioLine(p.s("name"), profile == p.i("id")) { profile = p.i("id") } }
            Input(first, { first = it }, "الاسم الأول")
            Input(last, { last = it }, "اسم العائلة")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Input(phone, { phone = it }, "الهاتف", Modifier.weight(1f), keyboard = KeyboardType.Phone, ltr = true)
                OutlinedButton(onClick = pick) { Icon(Icons.Outlined.Contacts, "من جهات الاتصال") }
            }
            s.Status()
            ActionButton("إنشاء", s, userRe.matches(user) && pass.length in 4..64 && profile != null) {
                scope.launch {
                    if (!Ui.confirm("إنشاء مشترك حقيقي في SAS4؟", "$user • $profileName", "إنشاء")) return@launch
                    s.run("create", mapOf(
                        "username" to user, "password" to pass, "profile_id" to profile, "profile_name" to profileName,
                        "firstname" to first.trim(), "lastname" to last.trim(), "phone" to phone.trim(),
                    ))?.let { pass = ""; created = user }
                }
            }
        }
    }
}

@Composable
private fun SasHistoryPage(userId: Int) {
    Page("سجل SAS4") { pad ->
        Loader(load = { Api.sas4("history", mapOf("id" to userId)) }) { d, _ ->
            val rows = d.l("history")
            Scroll(pad) {
                if (rows.isEmpty()) item { EmptyView("لا يوجد سجل") }
                else item {
                    Card(colors = cardColors()) {
                        rows.forEach { r -> Item(r.sOrNull("description") ?: r.s("event"), listOf(r.s("by"), r.s("created_at")).filter { it.isNotEmpty() }.joinToString(" • "), Icons.Outlined.Schedule) }
                    }
                }
            }
        }
    }
}

@Composable
fun RadioLine(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected, onClick); Text(label)
    }
}

/** يبحث عن المشترك في الأبراج (المختار أولاً) ويتأكد أن اسم المستخدم يطابق، حتى لا يُجدَّد مشترك آخر بنفس الرقم. */
suspend fun findInTowers(sasUserId: Int, username: String): Pair<String, J?>? {
    val towers = try { Api.sas4("towers").l("towers") } catch (_: Exception) { return null }
    val ids = linkedSetOf<String>().apply { Api.sasTower?.let { add(it) }; towers.forEach { add(it.s("id")) } }
    for (t in ids) {
        try {
            val r = Api.sas4("user", mapOf("id" to sasUserId, "tower" to t))
            if (r.o("user").s("username").equals(username, ignoreCase = true)) return t to r.o("activation")
        } catch (e: SessionExpired) { throw e } catch (_: Exception) { continue }
    }
    return null
}

