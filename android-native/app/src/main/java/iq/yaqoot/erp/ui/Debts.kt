package iq.yaqoot.erp.ui

import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AddCard
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.Contacts
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.PersonAddAlt1
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Router
import androidx.compose.material.icons.outlined.SouthWest
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
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

fun debtReminder(c: J): Uri? = Fmt.waLink(c["phone"],
    "مرحباً ${c.s("name")}،\nنود تذكيرك بأن رصيدك المستحق لدى ${AppState.storeName} هو ${Fmt.money(c["balance"])} د.ع.\nشكراً لتعاملك معنا 🌷")

@Composable
fun CustomersPage() {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val canAdd = AppState.can("customers.debt_addition")
    val canNew = AppState.can("customers.edit")
    Scaffold(
        containerColor = Color.Transparent,
        floatingActionButton = {
            if (canAdd || canNew) ExtendedFloatingActionButton(
                onClick = {
                    scope.launch {
                        val pick = Ui.sheet<String> { close ->
                            SheetBody("عملية") {
                                if (canNew) Item("زبون جديد", "مع دين افتتاحي اختياري", Icons.Outlined.PersonAddAlt1) { close("new") }
                                if (canAdd) Item("دين على زبون موجود", null, Icons.Outlined.AddCard) { close("debt") }
                            }
                        }
                        val ok = when (pick) {
                            "new" -> Ui.sheet<Boolean> { NewCustomerSheet(it) }
                            "debt" -> Ui.sheet<Boolean> { AddDebtSheet(null, it) }
                            else -> null
                        }
                        if (ok == true) v++
                    }
                },
                icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("دين / زبون") },
            )
        },
    ) { p ->
        Box(Modifier.padding(p).fillMaxSize()) {
            PagedList(
                "customers", "customers", searchHint = "اسم الزبون أو رقم الهاتف…",
                filters = listOf("debtors_only=true" to "عليهم ديون", "" to "كل الزبائن"),
                cursor = { _, n -> mapOf("offset" to n) }, emptyText = "لا توجد ديون مستحقة 🎉", reloadKey = v,
                header = { _, _ -> DebtSummary() },
            ) { r, reload -> CustomerRow(r, reload) }
        }
    }
}

@Composable
private fun DebtSummary() {
    var d by remember { mutableStateOf<J?>(null) }
    LaunchedEffect(AppState.refreshTick) { d = try { Api.get("dashboard") } catch (_: Exception) { null } }
    Box(Modifier.padding(bottom = 12.dp)) {
        KpiGrid(
            tile { m -> Kpi("إجمالي الديون", d.o("debts")?.get("total") ?: 0, Icons.Outlined.AccountBalanceWallet, Yq.gold, m, "${d.o("debts").s("debtors").ifEmpty { "0" }} زبون عليهم رصيد") },
            tile { m -> Kpi("المحصّل اليوم", d.o("collected")?.get("today") ?: 0, Icons.Outlined.SouthWest, Yq.green, m, "الشهر ${Fmt.money(d.o("collected")?.get("month"))}") },
        )
    }
}

@Composable
private fun CustomerRow(r: J, reload: () -> Unit) {
    val bal = r.n("balance")
    val limit = r.n("credit_limit")
    val pct = if (limit > 0) (bal / limit).coerceIn(0.0, 1.0).toFloat() else 0f
    Item(
        r.s("name"), null, avatarText = r.s("name"), color = if (bal > 0) Yq.gold else MaterialTheme.colorScheme.primary,
        trailing = { Text(Fmt.iqd(bal), fontWeight = FontWeight.Bold, color = if (bal > 0) Yq.gold else Color.Unspecified) },
    ) { Ui.push { StatementPage(r) } }
    if (limit > 0) {
        LinearProgressIndicator(
            progress = { pct },
            color = if (pct >= .9f) Yq.red else if (pct >= .6f) Yq.amber else Yq.green,
            modifier = Modifier.fillMaxWidth().padding(start = 72.dp, end = 16.dp, bottom = 8.dp).height(5.dp).clip(RoundedCornerShape(9.dp)),
        )
    }
}

// ====================================================================== كشف الحساب
@Composable
fun StatementPage(customer: J) {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val id = customer.s("id")
    Page(customer.s("name")) { pad ->
        Loader(v, load = { Api.get("statement", mapOf("id" to id)) }) { d, _ ->
            val c = d.o("customer") ?: customer
            val bal = c.n("balance")
            fun act(content: @Composable ((Boolean?) -> Unit) -> Unit) { scope.launch { if (Ui.sheet<Boolean>(content) == true) v++ } }
            Scroll(pad) {
                item {
                    KpiGrid(
                        tile { m -> Kpi("الرصيد المستحق", bal, Icons.Outlined.AccountBalanceWallet, if (bal > 0) Yq.gold else Yq.green, m) },
                        tile { m -> Kpi("سقف الدين", c["credit_limit"], Icons.Outlined.Speed, Yq.blue, m, if (c.n("credit_limit") == 0.0) "بلا سقف" else null) },
                    )
                }
                item {
                    Buttons {
                        if (AppState.can("customers.payment") && bal > 0) Tonal("تسديد", Icons.Outlined.Payments) { act { PayDebtSheet(c, it) } }
                        if (AppState.can("customers.debt_addition")) Outlined("إضافة دين", Icons.Outlined.Add) { act { AddDebtSheet(c, it) } }
                        if (bal > 0 && debtReminder(c) != null) Outlined("تذكير واتساب", Icons.Outlined.Chat, Yq.whatsapp) { Ui.open(debtReminder(c)) }
                        c.sOrNull("phone")?.let { ph -> Outlined("اتصال", Icons.Outlined.Call) { Ui.call(ph) } }
                        if (AppState.can("customers.edit")) Outlined(if (c.sOrNull("phone") == null) "إضافة هاتف" else "تعديل الهاتف", Icons.Outlined.PhoneAndroid) { act { PhoneEditSheet(c, it) } }
                        if (c.sOrNull("phone") != null) Outlined("واتساب المحل", Icons.AutoMirrored.Outlined.Send) {
                            act { WaComposeSheet(id, c.s("name"), if (bal > 0) "مرحباً ${c.s("name")}،\nرصيدك المستحق لدى ${AppState.storeName} هو ${Fmt.money(bal)} د.ع." else "", it) }
                        }
                    }
                }
                item { CustomerExtras(id) }
                item {
                    val moves = d.l("movements")
                    Section("كل الحركات", "${moves.size} حركة") {
                        if (moves.isEmpty()) EmptyView("لا توجد حركات بعد")
                        moves.forEach { Movement(it) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Movement(m: J) {
    val kind = m.s("kind")
    val isInv = kind == "invoice"
    val isPay = kind == "payment"
    val color = if (isInv) MaterialTheme.colorScheme.primary else if (isPay) Yq.green else Yq.gold
    val details = buildList {
        add(Fmt.`when`(m["at"]))
        m.sOrNull("actor")?.let { add(it) }
        if (isInv && m.n("total") > m.n("paid")) add("آجل ${Fmt.money(m.n("total") - m.n("paid"))}")
        if (!isInv && m.has("remaining")) add("الرصيد بعدها ${Fmt.money(m["remaining"])}")
        if (m.n("waived") > 0) add("مسامحة ${Fmt.money(m["waived"])}")
    }
    Item(
        if (isInv) "فاتورة ${m.s("ref")}" else if (isPay) "تسديد" else "إضافة دين",
        details.joinToString(" • ") + (m.sOrNull("notes")?.let { "\n$it" } ?: ""),
        if (isInv) Icons.AutoMirrored.Outlined.ReceiptLong else if (isPay) Icons.Outlined.SouthWest else Icons.Outlined.NorthEast, color,
        trailing = { Text(if (isInv) Fmt.iqd(m["total"]) else "${if (isPay) "−" else "+"}${Fmt.iqd(m["amount"])}", fontWeight = FontWeight.Bold, color = color) },
    )
}

private fun J.has(k: String) = this[k] != null

/** اشتراكات الإنترنت وتقسيم الديون ورسائل واتساب الزبون. */
@Composable
private fun CustomerExtras(id: String) {
    var isp by remember { mutableStateOf<J?>(null) }
    var wa by remember { mutableStateOf<J?>(null) }
    LaunchedEffect(id, AppState.refreshTick) {
        isp = try { Api.get("isp_profile", mapOf("customer_ref" to id)) } catch (_: Exception) { null }
        wa = try { Api.get("whatsapp_customer", mapOf("id" to id)) } catch (_: Exception) { null }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val subs = isp.l("subscriptions")
        if (subs.isNotEmpty()) Section("اشتراكات الإنترنت") {
            subs.forEach { Item(it.s("username"), "${it.s("package_name")} • ينتهي ${Fmt.dateOnly(it["expires_at"])}", Icons.Outlined.Router) }
            isp.o("debts")?.let { Field("ديون الإنترنت", Fmt.iqd(it["isp_outstanding"])); Field("ديون أخرى", Fmt.iqd(it["other_outstanding"])) }
        }
        val msgs = wa.l("items").take(10)
        if (msgs.isNotEmpty()) Section("رسائل واتساب") { msgs.forEach { WaMessage(it) } }
    }
}

// ====================================================================== هاتف الزبون
/** منتقي رقم من جهات الاتصال (منتقي النظام، بلا إذن للوصول لكل جهات الاتصال). */
private class PickPhone : ActivityResultContract<Unit, String?>() {
    override fun createIntent(context: android.content.Context, input: Unit) =
        android.content.Intent(android.content.Intent.ACTION_PICK).setType(ContactsContract.CommonDataKinds.Phone.CONTENT_TYPE)

    var resolver: android.content.ContentResolver? = null
    override fun parseResult(resultCode: Int, intent: android.content.Intent?): String? {
        val uri = intent?.data ?: return null
        return resolver?.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }
}

@Composable
fun rememberPhonePicker(onPick: (String) -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val contract = remember { PickPhone().apply { resolver = ctx.contentResolver } }
    val launcher = rememberLauncherForActivityResult(contract) { it?.let(onPick) }
    return { try { launcher.launch(Unit) } catch (_: Exception) { Ui.toast("تعذر فتح جهات الاتصال", error = true) } }
}

@Composable
fun PhoneEditSheet(c: J, close: (Boolean?) -> Unit) {
    var phone by remember { mutableStateOf(c.s("phone")) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val pick = rememberPhonePicker { phone = it }
    SheetBody(if (c.sOrNull("phone") == null) "إضافة هاتف" else "تعديل الهاتف", c.s("name")) {
        Input(phone, { phone = it }, "رقم الهاتف", keyboard = KeyboardType.Phone, helper = "07XXXXXXXXX", ltr = true)
        OutlinedButton(onClick = pick, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Contacts, null); Text("  اختيار من جهات الاتصال") }
        Button(onClick = {
            scope.launch {
                if (!Ui.confirm("حفظ الرقم $phone؟", "يُستعمل للاتصال وواتساب والتذكيرات.", "حفظ")) return@launch
                busy = true
                try {
                    val r = Api.act("customer_phone", mapOf("customer_id" to c["id"], "phone" to phone.trim()))
                    Ui.toast("حُفظ الرقم ${r.s("phone")}")
                    close(true)
                } catch (e: Exception) { Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy && phone.count { it.isDigit() } >= 10, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("حفظ") }
    }
}

// ====================================================================== إضافة دين
@Composable
fun AddDebtSheet(customer: J?, close: (Boolean?) -> Unit) {
    var c by remember { mutableStateOf(customer) }
    var amount by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<J>>(emptyList()) }
    val cid = remember { clientId() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(q) {
        if (q.trim().length < 2) { results = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(300)
        results = try { Api.get("customers", mapOf("q" to q.trim(), "limit" to 8)).l("customers") } catch (_: Exception) { emptyList() }
    }
    val cur = c
    if (cur == null) {
        SheetBody("دين جديد", "اختر الزبون") {
            OutlinedTextField(q, { q = it }, placeholder = { Text("ابحث باسم الزبون أو رقمه…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            results.forEach { r -> Item(r.s("name"), r.s("phone"), avatarText = r.s("name"), trailing = { Text(Fmt.iqd(r["balance"])) }) { c = r } }
        }
        return
    }
    val bal = cur.n("balance")
    val limit = cur.n("credit_limit")
    val next = bal + moneyValue(amount)
    SheetBody("إضافة دين • ${cur.s("name")}", "الرصيد الحالي ${Fmt.iqd(bal)}") {
        MoneyField(amount, { amount = it }, "مبلغ الدين", helper = "بعد الإضافة: ${Fmt.iqd(next)}${if (limit > 0) " • السقف ${Fmt.money(limit)}" else ""}")
        if (limit > 0 && next > limit) Text("سيتجاوز سقف الدين وسترفضه قاعدة البيانات.", color = Yq.amber)
        Input(notes, { notes = it }, "السبب", singleLine = false, minLines = 2, helper = "مثلاً: iPhone 13 بالأقساط")
        ErrorText(error)
        Button(onClick = {
            if (moneyValue(amount) <= 0 || notes.isBlank()) { error = "أدخل المبلغ والسبب"; return@Button }
            busy = true; error = null
            scope.launch {
                try {
                    val r = Api.act("debt_add", mapOf("customer_id" to cur["id"], "amount" to moneyValue(amount), "notes" to notes.trim(), "client_id" to cid))
                    Ui.toast("أُضيف الدين • الرصيد ${Fmt.iqd(r["remaining_debt"] ?: next)}")
                    close(true)
                } catch (e: Exception) { error = e.message; Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("تسجيل الدين") }
    }
}

// ====================================================================== تسديد
@Composable
fun PayDebtSheet(customer: J, close: (Boolean?) -> Unit) {
    var paid by remember { mutableStateOf("") }
    var waived by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val cid = remember { clientId() }
    val scope = rememberCoroutineScope()
    val bal = customer.n("balance")
    val rest = bal - moneyValue(paid) - moneyValue(waived)
    SheetBody("تسديد • ${customer.s("name")}", "المستحق ${Fmt.iqd(bal)}") {
        MoneyField(paid, { paid = it }, "المبلغ المقبوض نقداً", helper = "المتبقي بعد التسديد: ${Fmt.iqd(maxOf(0.0, rest))}")
        Buttons {
            AssistChip(onClick = { paid = Fmt.money(bal - moneyValue(waived)) }, label = { Text("كامل المبلغ") })
            AssistChip(onClick = { paid = Fmt.money(Math.round(bal / 2)) }, label = { Text("النصف") })
            listOf(50000, 100000, 250000).filter { it < bal }.forEach { v -> AssistChip(onClick = { paid = Fmt.money(v) }, label = { Text(Fmt.money(v)) }) }
        }
        if (AppState.can("customers.waiver")) {
            MoneyField(waived, { waived = it }, "مسامحة (اختياري)")
            if (moneyValue(waived) > 0) Input(reason, { reason = it }, "سبب المسامحة")
        }
        Input(notes, { notes = it }, "ملاحظات (اختياري)")
        Text("يُسجّل المقبوض في الخزنة تلقائياً.", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
        ErrorText(error)
        Button(onClick = {
            when {
                moneyValue(paid) + moneyValue(waived) <= 0 -> { error = "أدخل المبلغ المقبوض"; return@Button }
                rest < 0 -> { error = "المجموع أكبر من الرصيد المستحق"; return@Button }
                moneyValue(waived) > 0 && reason.isBlank() -> { error = "اذكر سبب المسامحة"; return@Button }
            }
            busy = true; error = null
            scope.launch {
                try {
                    val r = Api.act("debt_pay", mapOf(
                        "customer_id" to customer["id"], "amount_paid" to moneyValue(paid), "waived_amount" to moneyValue(waived),
                        "waiver_reason" to reason.trim(), "notes" to notes.trim(), "client_id" to cid,
                    ))
                    Ui.toast("قُبض ${Fmt.iqd(moneyValue(paid))} • المتبقي ${Fmt.iqd(r["remaining_debt"] ?: rest)}")
                    close(true)
                } catch (e: Exception) { error = e.message; Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("تسجيل التسديد") }
    }
}

// ====================================================================== زبون جديد
@Composable
fun NewCustomerSheet(close: (Boolean?) -> Unit) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var limit by remember { mutableStateOf("500,000") }
    var debt by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var dup by remember { mutableStateOf<J?>(null) }
    val cid = remember { clientId() }
    val scope = rememberCoroutineScope()
    val canDebt = AppState.can("customers.debt_addition")
    val pick = rememberPhonePicker { phone = it }

    fun save(allowDuplicate: Boolean = false) {
        busy = true; error = null
        scope.launch {
            try {
                val r = Api.act("customer_create", mapOf(
                    "name" to name.trim(), "phone" to phone.trim(), "address" to address.trim(),
                    "credit_limit" to moneyValue(limit), "opening_debt" to if (canDebt) moneyValue(debt) else 0,
                    "notes" to notes.trim(), "allow_duplicate" to allowDuplicate, "client_id" to cid,
                ))
                if (r.s("reason") == "duplicate") dup = r.o("existing")
                else { Ui.toast("أُضيف الزبون ${r.o("customer").s("name")}"); close(true) }
            } catch (e: Exception) { error = e.message; Ui.fail(e) }
            busy = false
        }
    }

    val d = dup
    if (d != null) {
        SheetBody("يوجد زبون بنفس الرقم") {
            Item(d.s("name"), "${d.s("phone")} • الرصيد ${Fmt.iqd(d["balance"])}", avatarText = d.s("name"))
            Button(onClick = { scope.launch { close(Ui.sheet<Boolean> { AddDebtSheet(d, it) } == true) } }, modifier = Modifier.fillMaxWidth()) { Text("إضافة الدين على ${d.s("name")}") }
            OutlinedButton(onClick = { save(true) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("إنشاء زبون منفصل") }
        }
        return
    }
    SheetBody("زبون جديد") {
        Input(name, { name = it }, "الاسم")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Input(phone, { phone = it }, "الهاتف", Modifier.weight(1f), keyboard = KeyboardType.Phone, ltr = true)
            OutlinedButton(onClick = pick) { Icon(Icons.Outlined.Contacts, "من جهات الاتصال") }
        }
        Input(address, { address = it }, "العنوان")
        MoneyField(limit, { limit = it }, "سقف الدين", helper = "0 = بلا سقف")
        if (canDebt) {
            MoneyField(debt, { debt = it }, "دين افتتاحي (اختياري)")
            if (moneyValue(debt) > 0) Input(notes, { notes = it }, "سبب الدين", helper = "رصيد افتتاحي")
        }
        ErrorText(error)
        Button(onClick = { save() }, enabled = !busy && name.isNotBlank(), modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("حفظ الزبون") }
    }
}
