package iq.yaqoot.erp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.SouthWest
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.clientId
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import iq.yaqoot.erp.core.sOrNull
import kotlinx.coroutines.launch

// ====================================================================== الخزنة
private val vaultKinds = mapOf("sale" to "بيع", "deposit" to "إيداع", "withdraw" to "سحب", "expense" to "مصروف", "debt_payment" to "تسديد دين", "return" to "مرتجع", "reversal" to "عكس قيد", "opening" to "رصيد افتتاحي")

@Composable
fun VaultPage() {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    Loader(v, load = { Api.get("vault", mapOf("limit" to 100)) }) { d, _ ->
        val today = d.o("today")
        fun txn(kind: String) { scope.launch { if (Ui.sheet<Boolean> { VaultTxnSheet(kind, d.n("balance"), it) } == true) v++ } }
        Scroll {
            item { Kpi("رصيد الخزنة", d["balance"], Icons.Outlined.AccountBalance, Yq.purple, Modifier.fillMaxWidth(), "الخزنة الرئيسية") }
            item {
                KpiGrid(
                    tile { m -> Kpi("وارد اليوم", today?.get("in"), Icons.Outlined.SouthWest, Yq.green, m) },
                    tile { m -> Kpi("صادر اليوم", today?.get("out"), Icons.Outlined.NorthEast, Yq.red, m) },
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (AppState.can("vaults.deposit")) Button(onClick = { txn("deposit") }, modifier = Modifier.weight(1f).height(48.dp)) { Text("إيداع") }
                    if (AppState.can("vaults.withdraw")) OutlinedButton(onClick = { txn("withdraw") }, modifier = Modifier.weight(1f).height(48.dp)) { Text("سحب") }
                }
            }
            item {
                val entries = d.l("entries")
                Section("الحركات", "آخر ${entries.size} حركة") {
                    entries.forEach { e ->
                        val inn = e.s("direction") == "in"
                        Item(
                            vaultKinds[e.s("kind")] ?: e.s("kind"),
                            "${e.sOrNull("note")?.let { "$it\n" } ?: ""}${e.s("actor")} • ${Fmt.`when`(e["created_at"])}",
                            if (inn) Icons.Outlined.SouthWest else Icons.Outlined.NorthEast, if (inn) Yq.green else Yq.red,
                            trailing = { Text("${if (inn) "+" else "−"}${Fmt.iqd(e["amount"])}", fontWeight = FontWeight.Bold, color = if (inn) Yq.green else Yq.red) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VaultTxnSheet(kind: String, balance: Double, close: (Boolean?) -> Unit) {
    val dep = kind == "deposit"
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val cid = remember { clientId() }
    val scope = rememberCoroutineScope()
    SheetBody(if (dep) "إيداع في الخزنة" else "سحب من الخزنة", "الرصيد الحالي ${Fmt.iqd(balance)}") {
        MoneyField(amount, { amount = it }, "المبلغ")
        Input(note, { note = it }, "البيان", helper = "يظهر في سجل الخزنة")
        ErrorText(error)
        Button(
            onClick = {
                if (moneyValue(amount) <= 0) { error = "أدخل المبلغ"; return@Button }
                if (!dep && moneyValue(amount) > balance) { error = "المبلغ أكبر من رصيد الخزنة"; return@Button }
                busy = true; error = null
                scope.launch {
                    try {
                        Api.act("vault_txn", mapOf("kind" to kind, "amount" to moneyValue(amount), "note" to note.trim(), "client_id" to cid))
                        Ui.toast(if (dep) "تم الإيداع" else "تم السحب"); close(true)
                    } catch (e: Exception) { error = e.message; Ui.fail(e) }
                    busy = false
                }
            },
            enabled = !busy,
            colors = if (dep) ButtonDefaults.buttonColors() else ButtonDefaults.buttonColors(containerColor = Yq.red),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) { if (busy) Busy() else Text(if (dep) "إيداع" else "سحب") }
    }
}

// ====================================================================== الصيانة
@Composable
fun RepairsPage() {
    PagedList(
        "repairs", "repairs", searchHint = "رقم التذكرة، الزبون، الجهاز أو IMEI…",
        filters = listOf("status=OPEN" to "مفتوحة", "status=READY" to "جاهزة", "status=ALL" to "الكل", "mine=true" to "تذاكري"),
    ) { r, _ ->
        val ready = r.s("status") == "READY"
        Item(
            "${r.sOrNull("device") ?: "جهاز"} • ${r.s("customer_name")}",
            "${r.s("ticket_no")} • ${r.s("fault")}${r.sOrNull("technician_name")?.let { "\nالفني: $it" } ?: ""}",
            Icons.Outlined.Build, if (ready) Yq.green else Yq.blue,
            trailing = { Pill(r.sOrNull("status_label") ?: r.s("status"), if (ready) Yq.green else if (r.s("status") == "CANCELLED") Yq.red else Yq.amber) },
        ) { Ui.push { RepairDetailPage(r.s("id")) } }
    }
}

@Composable
private fun RepairDetailPage(id: String) {
    var v by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun move(code: String, label: String) {
        scope.launch {
            var reason: String? = null
            if (code == "UNREPAIRABLE") {
                reason = Ui.sheet<String> { close ->
                    var t by remember { mutableStateOf("") }
                    SheetBody("سبب عدم إمكانية الإصلاح") {
                        Input(t, { t = it }, "السبب")
                        Button(onClick = { close(t.trim()) }, enabled = t.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("حفظ") }
                    }
                } ?: return@launch
            } else if (!Ui.confirm("نقل إلى «$label»؟", "سيُسجّل التغيير باسمك.")) return@launch
            busy = code
            try {
                Api.act("repair_status", mapOf("repair_id" to id, "to_status" to code, "reason" to reason))
                Ui.toast("حُدّثت الحالة إلى «$label»")
                v++
            } catch (e: Exception) { Ui.fail(e) }
            busy = null
        }
    }

    Page("تذكرة صيانة") { pad ->
        Loader(v, load = { Api.get("repair", mapOf("id" to id)) }) { d, _ ->
            val r = d.o("repair") ?: emptyMap()
            val rest = r.n("cost") + r.n("labour") - r.n("prepaid")
            val phone = r.s("phone").ifEmpty { r.s("customer_phone") }
            Scroll(pad) {
                item {
                    Text("${r.s("ticket_no")} • ${r.s("device")}", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("${r.s("customer_name")} • $phone", color = MaterialTheme.colorScheme.outline)
                }
                item {
                    Buttons {
                        Pill(r.sOrNull("status_label") ?: r.s("status"), if (r.s("status") == "READY") Yq.green else Yq.amber)
                        r.sOrNull("promised_at")?.let { Pill("موعد التسليم ${Fmt.`when`(it)}", Yq.blue) }
                    }
                }
                item {
                    KpiGrid(
                        tile { m -> Kpi("الكلفة الكلية", r.n("cost") + r.n("labour"), Icons.Outlined.Receipt, MaterialTheme.colorScheme.primary, m) },
                        tile { m -> Kpi("المتبقي على الزبون", rest, Icons.Outlined.AccountBalanceWallet, if (rest > 0) Yq.gold else Yq.green, m, "مدفوع مقدماً ${Fmt.money(r["prepaid"])}") },
                    )
                }
                item {
                    Section("التفاصيل") {
                        Field("العطل", r.sOrNull("fault") ?: "—")
                        Field("التشخيص", r.sOrNull("diagnosis"))
                        Field("الفني", r.sOrNull("technician_name") ?: "—")
                        Field("IMEI", r.sOrNull("imei"))
                        Field("الملحقات", r.sOrNull("accessories"))
                    }
                }
                if (phone.isNotEmpty()) item {
                    Buttons {
                        Outlined(if (r.s("status") == "READY") "أبلغه أنه جاهز" else "واتساب", Icons.Outlined.Chat, Yq.whatsapp) {
                            Ui.open(Fmt.waLink(phone, if (r.s("status") == "READY")
                                "مرحباً ${r.s("customer_name")}، جهازك (${r.s("device")}) جاهز للاستلام في ${AppState.storeName}${if (rest > 0) ". المبلغ المتبقي ${Fmt.money(rest)} د.ع" else ""} 🔧"
                            else "مرحباً ${r.s("customer_name")}، بخصوص جهازك (${r.s("device")}) لدى ${AppState.storeName}: "))
                        }
                        Outlined("اتصال", Icons.Outlined.Call) { Ui.call(phone) }
                    }
                }
                val next = d.l("next_statuses")
                if (next.isNotEmpty()) item {
                    Section("نقل الحالة", "التسليم والإلغاء من برنامج المكتب لأنهما يحرّكان المال") {
                        Buttons {
                            next.forEach { s ->
                                val code = s.s("code")
                                val content: @Composable () -> Unit = { if (busy == code) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp) else Text(s.s("label")) }
                                if (code == "READY") Button(onClick = { move(code, s.s("label")) }, enabled = busy == null) { content() }
                                else FilledTonalButton(onClick = { move(code, s.s("label")) }, enabled = busy == null) { content() }
                            }
                        }
                        androidx.compose.foundation.layout.Spacer(Modifier.padding(4.dp))
                    }
                }
                item {
                    Section("السجل") {
                        d.l("history").forEach { h ->
                            Item(h.sOrNull("to_label") ?: h.s("to"), "${Fmt.`when`(h["at"])}${h.sOrNull("actor")?.let { " • $it" } ?: ""}${h.sOrNull("reason")?.let { "\n$it" } ?: ""}", Icons.Outlined.History)
                        }
                    }
                }
            }
        }
    }
}
