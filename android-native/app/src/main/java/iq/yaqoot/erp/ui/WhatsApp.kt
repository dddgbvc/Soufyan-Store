package iq.yaqoot.erp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.MarkChatRead
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.b
import iq.yaqoot.erp.core.clientId
import iq.yaqoot.erp.core.i
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import iq.yaqoot.erp.core.sOrNull
import kotlinx.coroutines.launch
import java.time.Duration

/*
 * واتساب المحل: نفس الواتساب المتصل في برنامج المكتب (أو بوابة واتساب ويب).
 * التطبيق يضيف الرسالة إلى طابور البرنامج، والبرنامج يرسلها من رقم المحل.
 * لا تُرسل إلا لزبون وافق على واتساب، ولا تتكرر عند إعادة المحاولة.
 */
fun waStatus(st: String): Pair<String, Color> = when (st) {
    "sent" -> "أُرسلت" to Yq.green
    "pending" -> "بالانتظار" to Yq.amber
    "claimed" -> "قيد الإرسال" to Yq.blue
    "uncertain" -> "غير مؤكدة" to Yq.red
    else -> "لم تُرسل" to Color.Gray
}

@Composable
fun WaMessage(m: J, showCustomer: Boolean = false) {
    val (label, color) = waStatus(m.s("status"))
    ListItem(
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (showCustomer) Text(m.sOrNull("customer_name") ?: "زبون", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Text("  ${if (m.s("kind") == "receipt") "إيصال" else "رسالة"}", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.weight(1f))
                Pill(label, color)
            }
        },
        supportingContent = { Text("${m.s("body")}\n${Fmt.`when`(m["created_at"])}${m.sOrNull("reason")?.let { " • $it" } ?: ""}", maxLines = 6, overflow = TextOverflow.Ellipsis) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}

@Composable
fun WhatsAppPage() {
    Loader(load = { Api.get("whatsapp", mapOf("limit" to 80)) }) { d, _ ->
        val stats = d.o("stats")
        val consent = d.o("consent")
        val gw = d.o("gateway")
        val gatewayOnline = gw.b("online")
        val desktop = Fmt.parse(d["desktop_last_claim"])
        val desktopRecent = desktop != null && Duration.between(desktop, Fmt.now()).toMinutes() < 15
        val online = gatewayOnline || desktopRecent
        Scroll {
            item {
                Card(colors = cardColors()) {
                    Item(
                        if (online) "واتساب المحل متصل" else "المرسل غير نشط الآن",
                        "${when {
                            gatewayOnline -> "بوابة واتساب ويب تعمل (${gw.s("location")})."
                            desktopRecent -> "برنامج المكتب يرسل الرسائل."
                            else -> "الرسائل تبقى بالانتظار حتى يفتح برنامج المكتب أو تُفعَّل بوابة واتساب ويب."
                        }}\nآخر إرسال ناجح: ${Fmt.`when`(d["last_sent"])}",
                        if (online) Icons.Outlined.CheckCircle else Icons.Outlined.PauseCircle, if (online) Yq.green else Yq.amber,
                    )
                }
            }
            item {
                KpiGrid(
                    tile { m -> Kpi("بالانتظار", stats.s("pending").ifEmpty { "0" }, Icons.Outlined.Schedule, Yq.amber, m, "تُرسل عند اتصال واتساب المحل", raw = true) },
                    tile { m -> Kpi("أُرسلت", stats.s("sent").ifEmpty { "0" }, Icons.Outlined.MarkChatRead, Yq.green, m, raw = true) },
                    tile { m -> Kpi("غير مؤكدة", stats.s("uncertain").ifEmpty { "0" }, Icons.Outlined.HelpOutline, Yq.red, m, "راجع محادثة الزبون قبل الإعادة", raw = true) },
                    tile { m -> Kpi("زبائن موافقون", "${consent.s("yes").ifEmpty { "0" }} / ${consent.s("total").ifEmpty { "0" }}", Icons.Outlined.VerifiedUser, MaterialTheme.colorScheme.primary, m, raw = true) },
                )
            }
            item { AutoSendCard() }
            item {
                val items = d.l("items")
                Section("آخر الرسائل") {
                    if (items.isEmpty()) EmptyView("لا توجد رسائل بعد")
                    items.forEach { WaMessage(it, showCustomer = true) }
                }
            }
        }
    }
}

/** الإرسال التلقائي لكل زبون موافق: إيصال كل حركة دين، قبل انتهاء الاشتراك، عند الانتهاء، وبعد التجديد. */
@Composable
private fun AutoSendCard() {
    var enabled by remember { mutableStateOf(false) }
    var s by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var loaded by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val canEdit = AppState.can("customers.edit")

    LaunchedEffect(Unit) {
        try {
            val r = Api.get("whatsapp_auto")
            enabled = r.b("enabled")
            s = r.o("settings") ?: emptyMap()
        } catch (_: Exception) {}
        loaded = true
    }

    fun save(on: Boolean) {
        busy = true; error = null
        scope.launch {
            try {
                val r = Api.act("whatsapp_auto_set", s + ("enabled" to on))
                enabled = r.b("enabled")
                r.o("settings")?.let { s = it }
            } catch (e: Exception) { error = e.message }
            busy = false
        }
    }

    @Composable
    fun flag(key: String, title: String, hint: String?) =
        SwitchRow(title, hint, null, Color.Unspecified, s[key] != false, enabled = canEdit && !busy) { s = s + (key to it); save(true) }

    Section("الإرسال التلقائي", "للزبائن الموافقين فقط، ومرة واحدة لكل حدث") {
        if (!loaded) LinearProgressIndicator(Modifier.fillMaxWidth().padding(16.dp))
        else {
            SwitchRow("الإرسال التلقائي للزبائن", null, Icons.AutoMirrored.Outlined.Send, MaterialTheme.colorScheme.primary, enabled, enabled = canEdit && !busy) { save(it) }
            if (enabled) {
                flag("receipts", "إيصال كل تسديد أو دين جديد", "المبلغ، من سدّد، والديون المتراكمة")
                flag("isp_soon", "قبل انتهاء الاشتراك", "كم بقي من الاشتراك والديون المتراكمة")
                if (s["isp_soon"] != false) {
                    val soon = s.i("soon_days") ?: 3
                    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("قبل $soon أيام", Modifier.weight(1f))
                        IconButton(onClick = { s = s + ("soon_days" to soon - 1); save(true) }, enabled = canEdit && !busy && soon > 1) { Icon(Icons.Outlined.RemoveCircleOutline, "أقل") }
                        IconButton(onClick = { s = s + ("soon_days" to soon + 1); save(true) }, enabled = canEdit && !busy && soon < 10) { Icon(Icons.Outlined.AddCircleOutline, "أكثر") }
                    }
                }
                flag("isp_expired", "عند انتهاء الاشتراك", null)
                flag("isp_renewed", "بعد كل تجديد", "تاريخ الانتهاء الجديد والسعر والديون")
            }
            error?.let { Text(it, color = Yq.red, modifier = Modifier.padding(16.dp)) }
            Text(
                "تذكيرات الاشتراك تُرسل بين 10 صباحاً و8 مساءً، ولبيانات مزامنة من المزوّد خلال يومين حتى لا يُبلَّغ زبون بانتهاء غير صحيح.",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }
    }
}

/** إرسال رسالة لزبون من واتساب المحل، مع إدارة موافقته. */
@Composable
fun WaComposeSheet(customerId: String, customerName: String, initial: String, close: (Boolean?) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    var info by remember { mutableStateOf<J?>(null) }
    var busy by remember { mutableStateOf(false) }
    val cid = remember { "m-${clientId()}" }
    val scope = rememberCoroutineScope()
    LaunchedEffect(customerId) { info = try { Api.get("whatsapp_customer", mapOf("id" to customerId)) } catch (_: Exception) { null } }
    val consent = info.b("consent")
    SheetBody("واتساب المحل", "إلى $customerName") {
        if (info != null) SwitchRow("الزبون موافق على رسائل واتساب", null, null, Color.Unspecified, consent, enabled = !busy && AppState.can("customers.edit")) { on ->
            busy = true
            scope.launch {
                try {
                    Api.act("whatsapp_consent", mapOf("customer_id" to customerId, "consent" to on))
                    info = Api.get("whatsapp_customer", mapOf("id" to customerId))
                } catch (e: Exception) { Ui.fail(e) }
                busy = false
            }
        }
        Input(text, { text = it }, "الرسالة", singleLine = false, minLines = 4)
        Button(onClick = {
            scope.launch {
                if (!Ui.confirm("إرسال الرسالة من واتساب المحل؟", "تُضاف للطابور ويرسلها البرنامج من رقم المحل.", "إرسال")) return@launch
                busy = true
                try {
                    val r = Api.act("whatsapp_send", mapOf("customer_id" to customerId, "body" to text.trim(), "client_id" to cid))
                    if (r["ok"] == false) Ui.toast(r.sOrNull("message") ?: "تعذر الإرسال", error = true)
                    else { Ui.toast("أُضيفت الرسالة لطابور واتساب المحل"); close(true) }
                } catch (e: Exception) { Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy && consent && text.isNotBlank(), modifier = Modifier.fillMaxWidth().height(50.dp)) {
            if (busy) Busy() else { Icon(Icons.AutoMirrored.Outlined.Send, null); Text("  إرسال من واتساب المحل") }
        }
        if (info != null && !consent) Text("فعّل موافقة الزبون أولاً.", color = MaterialTheme.colorScheme.outline)
    }
}

