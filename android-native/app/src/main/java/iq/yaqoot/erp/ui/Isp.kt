package iq.yaqoot.erp.ui

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Autorenew
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CellTower
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.PendingActions
import androidx.compose.material.icons.outlined.Router
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.SessionExpired
import iq.yaqoot.erp.core.b
import iq.yaqoot.erp.core.i
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.numOf
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import iq.yaqoot.erp.core.sOrNull
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

fun ispReminder(s: J): Uri? {
    val name = s.sOrNull("customer_name") ?: s.s("display_name")
    val date = Fmt.dateOnly(s["expires_at"])
    return Fmt.waLink(s["customer_phone"], if (s.s("state") == "expired")
        "مرحباً $name،\nانتهى اشتراك الإنترنت (${s.s("username")}) بتاريخ $date.\nللتجديد تواصل معنا — ${AppState.storeName} 🌐"
    else "مرحباً $name،\nاشتراك الإنترنت (${s.s("username")}) ينتهي بتاريخ $date.\nجدّد مبكراً حتى لا ينقطع الخط — ${AppState.storeName} 🌐")
}

private fun stateColor(st: String) = when (st) { "expired" -> Yq.red; "soon" -> Yq.amber; else -> Yq.green }
private fun stateLabel(st: String) = when (st) { "expired" -> "منتهي"; "soon" -> "قريب"; "active" -> "فعّال"; else -> "؟" }

@Composable
fun IspPage() {
    PagedList(
        "isp", "subscribers", pageSize = 300,
        searchHint = "اسم المشترك، اسم المستخدم، أو الزبون…",
        filters = listOf("status=all" to "الكل", "status=expired" to "منتهية", "status=soon" to "قريبة", "status=active" to "فعّالة", "status=unlinked" to "غير مربوط"),
        emptyText = "لا يوجد مشتركون هنا. يُضافون عند ربطهم من قسم الإنترنت في برنامج المكتب.",
        header = { meta, _ ->
            val s = meta.o("summary")
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 10.dp)) {
                FilledTonalButton(onClick = { Ui.push { SasPage() } }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Icon(Icons.Outlined.CellTower, null); Text("  SAS4: بحث وتجديد وإدارة المشتركين")
                }
                KpiGrid(
                    tile { m -> Kpi("المشتركون", s.s("total").ifEmpty { "0" }, Icons.Outlined.Wifi, MaterialTheme.colorScheme.primary, m, "${s.s("unlinked").ifEmpty { "0" }} غير مربوطين", raw = true) },
                    tile { m -> Kpi("منتهية", s.s("expired").ifEmpty { "0" }, Icons.Outlined.WifiOff, Yq.red, m, raw = true) },
                    tile { m -> Kpi("تنتهي خلال 3 أيام", s.s("soon").ifEmpty { "0" }, Icons.Outlined.Schedule, Yq.amber, m, raw = true) },
                    tile { m -> Kpi("تجديدات معلّقة", meta.s("unresolved").ifEmpty { "0" }, Icons.Outlined.Warning, Yq.purple, m, raw = true) },
                )
                meta.l("accounts").forEach { a ->
                    Card(colors = cardColors()) {
                        Item(
                            "${a.s("name")} • ${a.s("provider")}",
                            "${a.s("subscribers")} مشترك محفوظ • آخر دخول للمزود ${Fmt.`when`(a["last_login_at"])}${a.sOrNull("last_error")?.let { "\nآخر خطأ: $it" } ?: ""}",
                            Icons.Outlined.Dns, Yq.blue,
                            trailing = { Pill(if (a.b("active")) "مفعّل" else "موقوف", if (a.b("active")) Yq.green else Yq.red) },
                        )
                    }
                }
            }
        },
    ) { r, _ ->
        val st = r.s("state")
        val days = r.i("days_left")
        Item(
            r.sOrNull("display_name") ?: r.s("username"),
            "${r.s("username")} • ${r.s("package_name")}\n" + (if (r["customer_id"] != null)
                "${r.s("customer_name")}${if (r.n("customer_balance") > 0) " • عليه ${Fmt.money(r["customer_balance"])}" else ""}" else "غير مربوط بزبون"),
            Icons.Outlined.Router, stateColor(st),
            trailing = {
                Column(horizontalAlignment = Alignment.End) {
                    Pill(stateLabel(st), stateColor(st))
                    Text(when { days == null -> ""; days < 0 -> "منذ ${-days} يوم"; days == 0 -> "اليوم"; else -> "بعد $days يوم" }, fontSize = 11.sp)
                }
            },
        ) { Ui.push { SubscriberPage(r) } }
    }
}

fun renewalState(s: String) = mapOf("PENDING" to "بانتظار التفعيل", "PROVIDER_UNKNOWN" to "غير مؤكد", "CONFIRMED" to "مؤكد", "FAILED" to "فشل", "CANCELLED" to "ملغى")[s] ?: s

/** ملف المشترك الموحّد: بيانات المزوّد، الزبون الداخلي وديونه، التجديد، وسجل كل الحركات. */
@Composable
fun SubscriberPage(s: J) {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val st = s.s("state")
    Page("ملف المشترك") { pad ->
        Loader(v, load = { Api.get("isp_subscriber", mapOf("id" to s["id"])) }) { d, _ ->
            val sub = d.o("subscriber") ?: s
            val c = d.o("customer")
            val renewals = d.l("renewals")
            val pending = renewals.filter { it.s("state") == "PENDING" || it.s("state") == "PROVIDER_UNKNOWN" }
            val balance = c?.n("balance") ?: s.n("customer_balance")
            val days = s.i("days_left")
            val ext = sub.sOrNull("external_subscriber_id")?.toIntOrNull()
            fun open(content: @Composable ((Boolean?) -> Unit) -> Unit) { scope.launch { if (Ui.sheet<Boolean>(content) == true) v++ } }
            Scroll(pad) {
                item {
                    Card(colors = cardColors()) {
                        Item(
                            s.sOrNull("display_name") ?: s.s("username"),
                            when { days == null -> ""; days < 0 -> "منتهي منذ ${-days} يوم"; days == 0 -> "ينتهي اليوم"; else -> "باقي $days يوم" },
                            Icons.Outlined.Router, stateColor(st), trailing = { Pill(stateLabel(st), stateColor(st)) },
                        )
                    }
                }
                if (s["customer_id"] != null && AppState.can("customers.debt_addition")) item {
                    Button(onClick = { open { RenewSheet(s, d, it) } }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Icon(Icons.Outlined.Autorenew, null); Text("  تجديد الاشتراك") }
                }
                pending.forEach { r ->
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = Yq.amber.copy(alpha = 0.12f))) {
                            Item(
                                "تجديد غير مكتمل • ${Fmt.iqd(r["sell_price_iqd"])}",
                                if (r.s("state") == "PENDING") "بانتظار التفعيل لدى المزوّد" else "نتيجة المزوّد غير مؤكدة",
                                Icons.Outlined.PendingActions, Yq.amber,
                                trailing = { TextButton(onClick = { open { RenewConfirmSheet(s, r, ext, it) } }) { Text("تأكيد") } },
                            )
                        }
                    }
                }
                item {
                    Section("بيانات المزوّد", "رقم الاشتراك لدى الشركة ورصيد الموزّع لا يُخلطان مع حساب الزبون") {
                        Field("اسم المستخدم لدى المزوّد", s.s("username"))
                        Field("الباقة", s.sOrNull("package_name") ?: "—")
                        Field("حالة المزوّد", s.sOrNull("provider_status") ?: "—")
                        Field("ينتهي", Fmt.dateOnly(sub["expires_at"] ?: s["expires_at"]))
                        Field("حساب الموزّع", s.sOrNull("reseller_name") ?: "—")
                        s["price"]?.let { Field("السعر العام للباقة", Fmt.iqd(it)) }
                        Field("آخر تحقق من المزوّد", Fmt.`when`(s["last_verified_at"]))
                    }
                }
                item {
                    Section("الزبون الداخلي (حساب المحل)") {
                        if (s["customer_id"] == null) Text("غير مربوط بزبون في المحل. الربط من قسم الإنترنت في برنامج المكتب.", Modifier.padding(16.dp))
                        else {
                            Field("الزبون", c?.sOrNull("name") ?: s.s("customer_name"))
                            Field("الهاتف", c?.sOrNull("phone") ?: s.sOrNull("customer_phone"))
                            Field("ديون الزبون في المحل", Fmt.iqd(balance), if (balance > 0) Yq.gold else null)
                            if (AppState.can("customers")) Item("ملف الزبون وكل حركاته", null, Icons.AutoMirrored.Outlined.ReceiptLong) {
                                Ui.push { StatementPage(mapOf("id" to s["customer_id"], "name" to (c?.sOrNull("name") ?: s.s("customer_name")))) }
                            }
                            ispReminder(s)?.let { u -> Item(if (st == "expired") "إبلاغ بانتهاء الاشتراك" else "تذكير بالتجديد", null, Icons.Outlined.Chat, Yq.whatsapp) { Ui.open(u) } }
                        }
                    }
                }
                item {
                    Section("التجديدات") {
                        if (renewals.isEmpty()) EmptyView("لا توجد تجديدات مسجلة")
                        renewals.forEach { r ->
                            Item(
                                "${Fmt.iqd(r["sell_price_iqd"])} • ${renewalState(r.s("state"))}",
                                listOfNotNull(
                                    Fmt.`when`(r["created_at"]),
                                    r["service_until"]?.let { "حتى ${Fmt.dateOnly(it)}" },
                                    r["provider_cost_iqd"]?.let { "ربح ${Fmt.money(r.n("sell_price_iqd") - numOf(it))}" },
                                ).joinToString(" • "),
                                Icons.Outlined.Autorenew, if (r.s("state") == "CONFIRMED") Yq.green else Yq.amber,
                                trailing = { if (r.n("paid_amount_iqd") > 0) Text("مدفوع ${Fmt.money(r["paid_amount_iqd"])}", fontSize = 12.sp) },
                            )
                        }
                    }
                }
                item {
                    Section("سجل الحركات") {
                        val events = d.l("events")
                        if (events.isEmpty()) EmptyView("لا توجد حركات")
                        events.forEach { e -> Item(e.sOrNull("note") ?: e.s("code"), "${e.s("actor")} • ${Fmt.`when`(e["at"])}", Icons.Outlined.Schedule) }
                    }
                }
            }
        }
    }
}

/**
 * تجديد: السعر يظهر تلقائياً (آخر تجديد أو السعر العام، وسعر الشراء من SAS4)،
 * ثم تأكيد صريح «هل تجدد بهذا السعر؟» مع ديون الزبون في المحل، عبر نفس دوال التجديد في البرنامج.
 */
@Composable
private fun RenewSheet(s: J, detail: J, close: (Boolean?) -> Unit) {
    val sug = detail.o("suggested")
    var sell by remember { mutableStateOf(sug?.get("sell_price")?.let { Fmt.money(it) } ?: "") }
    var cost by remember { mutableStateOf(sug?.get("provider_cost")?.let { Fmt.money(it) } ?: "") }
    var paid by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var fetching by remember { mutableStateOf(false) }
    var costNote by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var started by remember { mutableStateOf<J?>(null) }
    val key = remember { "m-${iq.yaqoot.erp.core.clientId()}" }
    val scope = rememberCoroutineScope()
    val balance = detail.o("customer")?.n("balance") ?: s.n("customer_balance")
    val ext = detail.o("subscriber").sOrNull("external_subscriber_id")?.toIntOrNull()

    started?.let { r -> RenewConfirmSheet(s, r, ext, close); return }

    val sv = moneyValue(sell).toDouble()
    val cv = moneyValue(cost).toDouble()
    val pv = moneyValue(paid).toDouble()
    SheetBody("تجديد الاشتراك", "${s.s("username")} • ${s.s("package_name")}") {
        Field("ديون الزبون في المحل", Fmt.iqd(balance), if (balance > 0) Yq.gold else null)
        MoneyField(sell, { sell = it }, "سعر البيع للزبون", helper = if (sug.s("source") == "last_renewal") "السعر من آخر تجديد لهذا المشترك" else "السعر العام للباقة. لا يُغيَّر أي سعر تلقائياً.")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MoneyField(cost, { cost = it }, "سعر الشراء من المزوّد", Modifier.weight(1f))
            OutlinedButton(onClick = {
                if (ext == null) { costNote = "رقم المشترك لدى المزوّد غير معروف لهذا الاشتراك."; return@OutlinedButton }
                fetching = true
                scope.launch {
                    try {
                        val f = findInTowers(ext, s.s("username"))
                        val a = f?.second
                        if (a == null) costNote = "لم يُعثر على المشترك في أبراجك. أدخل سعر الشراء يدوياً."
                        else {
                            val need = a.n("n_required_amount")
                            if (need > 0) cost = Fmt.money(need)
                            costNote = "من SAS4: ${a.s("profile_name")} • الكلفة ${a.sOrNull("required_amount") ?: Fmt.money(need)} • رصيد الموزع ${a.s("manager_balance")}"
                        }
                    } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { costNote = e.message }
                    fetching = false
                }
            }, enabled = !fetching) { if (fetching) androidx.compose.material3.CircularProgressIndicator(Modifier.height(16.dp), strokeWidth = 2.dp) else Text("من SAS4") }
        }
        costNote?.let { Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline) }
        if (sv > 0 && cv > 0) Field("الربح", Fmt.iqd(sv - cv), if (sv >= cv) Yq.green else Yq.red)
        MoneyField(paid, { paid = it }, "المقبوض الآن (0 = يُضاف كاملاً للدين)")
        if (sv > 0) TextButton(onClick = { paid = Fmt.money(sv) }) { Text("قبض كامل ${Fmt.iqd(sv)}") }
        if (pv > sv) Text("المقبوض أكبر من السعر", color = Yq.red)
        ErrorText(error)
        Button(onClick = {
            scope.launch {
                val ok = Ui.confirm(
                    "هل تجدد بهذا السعر؟",
                    "${s.s("username")} بسعر ${Fmt.iqd(sv)}" +
                        (if (cv > 0) "\nسعر الشراء ${Fmt.iqd(cv)} • الربح ${Fmt.iqd(sv - cv)}" else "") +
                        (if (balance > 0) "\n⚠️ على الزبون ديون في المكتب: ${Fmt.iqd(balance)}" else "\nلا ديون على الزبون في المكتب") +
                        "\nبعد التجديد يصبح دينه: ${Fmt.iqd(balance + sv - pv)}",
                    "نعم، جدّد",
                )
                if (!ok) return@launch
                busy = true; error = null
                try {
                    started = Api.act("isp_renew_begin", buildMap {
                        put("operation_key", key); put("subscriber_id", s["id"]); put("sell_price_iqd", sv); put("paid_amount_iqd", pv)
                        put("package_name", s.s("package_name")); put("service_from", Instant.now().toString())
                        if (cv > 0) put("provider_cost_iqd", cv)
                    })
                } catch (e: Exception) { error = e.message; Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy && sv > 0 && pv <= sv, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("تجديد") }
    }
}

/** الخطوة الثانية: التفعيل لدى المزوّد (مباشرة في SAS4 أو يدوياً) ثم تسجيل النتيجة وترحيلها للدفتر. */
@Composable
private fun RenewConfirmSheet(s: J, renewal: J, ext: Int?, close: (Boolean?) -> Unit) {
    val renewalId = renewal["id"] ?: renewal["renewal_id"]
    var receipt by remember { mutableStateOf("") }
    var until by remember {
        val base = Fmt.parse(s["expires_at"])?.toLocalDate()
        val from = if (base != null && base.isAfter(LocalDate.now())) base else LocalDate.now()
        mutableStateOf(from.plusDays(30))
    }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sasLoading by remember { mutableStateOf(ext != null) }
    var sasError by remember { mutableStateOf<String?>(null) }
    var tower by remember { mutableStateOf<String?>(null) }
    var activation by remember { mutableStateOf<J?>(null) }
    var sasDone by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    val sas = remember { SasSubmit("rn") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(ext) {
        if (ext == null) return@LaunchedEffect
        try {
            val f = findInTowers(ext, s.s("username"))
            if (f == null) sasError = "لم يُعثر على ${s.s("username")} في أبراجك. فعّل يدوياً أو أضف البرج الصحيح."
            else { tower = f.first; activation = f.second; if (f.second == null) sasError = "بيانات التفعيل غير متاحة من SAS4." }
        } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { sasError = e.message }
        sasLoading = false
    }

    suspend fun confirm() {
        busy = true; error = null
        try {
            val rec = receipt.trim()
            Api.act("isp_renew_outcome", mapOf(
                "renewal_id" to renewalId, "outcome" to "CONFIRMED",
                "provider_receipt" to rec.ifEmpty { "تأكيد من الهاتف — ${AppState.employeeName} ${Fmt.`when`(Fmt.isoNow())}" },
                "service_until" to until.atStartOfDay().toInstant(ZoneOffset.ofHours(3)).toString(),
            ))
            Api.act("isp_renew_post", mapOf("renewal_id" to renewalId))
            Ui.toast("تم التجديد وترحيله للدفتر")
            close(true)
        } catch (e: Exception) { error = e.message; Ui.fail(e) }
        busy = false
    }

    if (picking) {
        val state = rememberDatePickerState(initialSelectedDateMillis = until.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        SheetBody("ينتهي الاشتراك في") {
            DatePicker(state)
            Button(onClick = {
                state.selectedDateMillis?.let { until = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                picking = false
            }, modifier = Modifier.fillMaxWidth()) { Text("حفظ") }
        }
        return
    }

    SheetBody("تأكيد التفعيل", "سُجّل طلب التجديد بسعر ${Fmt.iqd(renewal["sell_price_iqd"])}") {
        if (ext != null) {
            Text("التفعيل المباشر", fontWeight = FontWeight.Bold)
            if (sasLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
            sasError?.let { Text(it, color = Yq.amber) }
            activation?.let { a ->
                Field("الباقة", a.sOrNull("profile_name"))
                Field("الكلفة من رصيد الموزع", a.sOrNull("required_amount"))
                Field("رصيد الموزع لدى الشركة", a.sOrNull("manager_balance"))
                Button(onClick = {
                    scope.launch {
                        if (!Ui.confirm("تفعيل في SAS4؟", "تجديد ${s.s("username")} وخصم ${a.s("required_amount")} من رصيد الموزع، ثم إضافة ${Fmt.iqd(renewal["sell_price_iqd"])} على حساب الزبون في المحل.", "نعم، فعّل")) return@launch
                        val r = sas.run("renew", mapOf(
                            "user_id" to ext, "username" to s.s("username"), "method" to "credit", "tower_id" to tower,
                            "expected_amount" to a.n("n_required_amount"), "comments" to "تجديد من تطبيق المحل",
                        )) ?: return@launch
                        sasDone = true
                        Fmt.parse(r.o("result").sOrNull("expiration"))?.let { until = it.toLocalDate() }
                        receipt = "SAS4 ${r.sOrNull("transaction_id") ?: sas.ref}"
                        confirm()
                    }
                }, enabled = !sas.busy && !busy && !sas.uncertain && !sasDone, colors = ButtonDefaults.buttonColors(containerColor = Yq.green), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                    if (sas.busy) Busy() else { Icon(Icons.Outlined.Bolt, null); Text("  فعّل في SAS4 ورحّل للدفتر") }
                }
            }
            sas.Status()
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
        }
        Text(if (ext != null) "أو فعّل يدوياً من البرنامج أو لوحة الموزع، ثم سجّل النتيجة:" else "فعّل الاشتراك لدى المزوّد (من برنامج المكتب أو لوحة الموزع)، ثم سجّل النتيجة ليُضاف الدين ويُقيَّد المقبوض.", color = MaterialTheme.colorScheme.outline)
        Input(receipt, { receipt = it }, "رقم الإيصال/العملية لدى المزوّد (اختياري)")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("ينتهي الاشتراك في", Modifier.weight(1f))
            TextButton(onClick = { picking = true }) { Text(until.toString()) }
        }
        ErrorText(error)
        Button(onClick = { scope.launch { confirm() } }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("تم التفعيل — رحّل للدفتر") }
        OutlinedButton(onClick = {
            scope.launch {
                if (!Ui.confirm("تسجيل أن التفعيل لم يتم؟", "لن يُضاف أي دين على الزبون.", "نعم، لم يتم", danger = true)) return@launch
                busy = true
                try {
                    Api.act("isp_renew_outcome", mapOf("renewal_id" to renewalId, "outcome" to "FAILED", "failure_code" to "لم يتم التفعيل"))
                    close(true)
                } catch (e: Exception) { error = e.message; Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy, colors = ButtonDefaults.outlinedButtonColors(contentColor = Yq.red), modifier = Modifier.fillMaxWidth()) { Text("لم يتم التفعيل") }
        Spacer(Modifier.height(4.dp))
    }
}
