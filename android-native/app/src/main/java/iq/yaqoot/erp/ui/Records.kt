package iq.yaqoot.erp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.AssignmentReturn
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Report
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.Pdf
import iq.yaqoot.erp.core.ReportPart
import iq.yaqoot.erp.core.b
import iq.yaqoot.erp.core.clientId
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import iq.yaqoot.erp.core.sOrNull
import kotlinx.coroutines.launch

// ====================================================================== الفواتير
@Composable
fun InvoicesPage() {
    PagedList(
        "invoices", "invoices", searchHint = "رقم الفاتورة، اسم الزبون أو هاتفه…",
        filters = listOf("" to "الكل", "debt_only=true" to "غير مسددة"),
        cursor = { last, _ -> mapOf("before" to last["created_at"]) },
    ) { r, _ -> InvoiceRow(r) }
}

@Composable
fun InvoiceRow(r: J) {
    val rest = r.n("total_amount") - r.n("paid_amount")
    val scope = rememberCoroutineScope()
    Item(
        r.sOrNull("customer_name") ?: "زبون نقدي",
        "${r.s("invoice_number")} • ${Fmt.`when`(r["created_at"])}${r.sOrNull("actor")?.let { " • $it" } ?: ""}",
        Icons.AutoMirrored.Outlined.ReceiptLong,
        trailing = {
            Column(horizontalAlignment = Alignment.End) {
                Text(Fmt.iqd(r["total_amount"]), fontWeight = FontWeight.Bold)
                if (rest > 0) Pill("آجل ${Fmt.money(rest)}", Yq.amber) else Pill(Fmt.payment(r["payment_type"]), Yq.green)
            }
        },
    ) { scope.launch { Ui.sheet<Unit> { InvoiceDetail(r.s("id")) } } }
}

@Composable
private fun InvoiceDetail(id: String) {
    Box(Modifier.fillMaxWidth().height(560.dp)) {
        Loader(id, load = { Api.get("invoice", mapOf("id" to id)) }) { d, _ ->
            val inv = d.o("invoice") ?: emptyMap()
            val rest = inv.n("total_amount") - inv.n("paid_amount")
            Scroll {
                item {
                    Text("فاتورة ${inv.s("invoice_number")}", fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    Text("${inv.sOrNull("customer_name") ?: "زبون نقدي"} • ${Fmt.`when`(inv["created_at"])} • ${inv.s("actor")}", color = MaterialTheme.colorScheme.outline)
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Stat("الإجمالي", Fmt.iqd(inv["total_amount"]), Modifier.weight(1f))
                        Stat(if (rest > 0) "المتبقي (آجل)" else "الدفع", if (rest > 0) Fmt.iqd(rest) else Fmt.payment(inv["payment_type"]), Modifier.weight(1f), if (rest > 0) Yq.amber else Yq.green)
                    }
                }
                item {
                    Section("الأصناف") {
                        d.l("items").forEach { it ->
                            val serials = (it["serials"] as? List<*>)?.joinToString(", ").orEmpty()
                            Item(
                                it.s("product_name"),
                                "${it.s("quantity")} × ${Fmt.money(it["unit_price"])}${if (it.n("discount") > 0) " • خصم ${Fmt.money(it["discount"])}" else ""}${if (serials.isNotEmpty()) "\n$serials" else ""}",
                                trailing = { Text(Fmt.iqd(it["total"]), fontWeight = FontWeight.SemiBold) },
                            )
                        }
                    }
                }
                inv.sOrNull("notes")?.let { item { Text("ملاحظات: $it") } }
            }
        }
    }
}

// ====================================================================== المخزون
@Composable
fun ProductsPage() {
    PagedList(
        "products", "products", searchHint = "اسم المنتج، الماركة، الموديل أو الباركود…",
        filters = listOf("" to "الكل", "low_only=true" to "تحت الحد"),
        cursor = { _, n -> mapOf("offset" to n) },
    ) { r, _ ->
        Item(
            r.s("name"), listOf(r.s("brand"), r.s("model"), r.s("category")).filter { it.isNotEmpty() }.joinToString(" • "),
            Icons.Outlined.Inventory2, if (r.b("low")) Yq.amber else MaterialTheme.colorScheme.primary,
            trailing = {
                Column(horizontalAlignment = Alignment.End) {
                    Text(Fmt.iqd(r["selling_price"]), fontWeight = FontWeight.Bold)
                    if (r.b("is_service")) Pill("خدمة") else Pill("${r.s("stock_quantity")} قطعة", if (r.b("low")) Yq.amber else Yq.green)
                }
            },
        )
    }
}

// ====================================================================== النواقص
@Composable
fun ShortagesPage() {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    Loader(v, load = { Api.get("shortages") }) { d, _ ->
        val manual = d.l("manual")
        val low = d.l("low_stock")
        Scroll {
            item {
                Buttons {
                    Tonal("إضافة نقص", Icons.Outlined.Add) { scope.launch { if (Ui.sheet<Boolean> { NewShortageSheet(it) } == true) v++ } }
                    Outlined("إرسال للمدير العام", Icons.AutoMirrored.Outlined.Send) { scope.launch { if (Ui.sheet<Boolean> { ReportShortagesSheet(it) } == true) v++ } }
                    Outlined("PDF", Icons.Outlined.PictureAsPdf) {
                        try {
                            Pdf.share(Ui.context, "قائمة النواقص", "النواقص-${Fmt.stamp()}", listOf(
                                ReportPart("نواقص مسجلة", listOf("المادة", "التصنيف", "التاريخ"), manual.map { listOf(it.s("name"), it.s("category"), Fmt.`when`(it["created_at"])) }),
                                ReportPart("تحت حد التنبيه", listOf("المنتج", "المتبقي", "الحد"), low.map { listOf(it.s("name"), it.s("stock_quantity"), it.s("min_stock_alert")) }),
                            ))
                        } catch (e: Exception) { Ui.toast("تعذر إنشاء ملف PDF: ${e.message}", error = true) }
                    }
                }
            }
            item {
                Section("نواقص مسجلة يدوياً", "${manual.size} غير محلولة") {
                    if (manual.isEmpty()) EmptyView("لا توجد نواقص يدوية")
                    manual.forEach { Item(it.s("name"), "${it.s("category")} • ${Fmt.`when`(it["created_at"])}", Icons.Outlined.Report, Yq.amber) }
                }
            }
            item {
                Section("تحت حد التنبيه", "${low.size} منتج") {
                    if (low.isEmpty()) EmptyView("كل المنتجات فوق الحد")
                    low.forEach { Item(it.s("name"), null, Icons.Outlined.Inventory2, Yq.red, trailing = { Pill("${it.s("stock_quantity")} / ${it.s("min_stock_alert")}", Yq.red) }) }
                }
            }
        }
    }
}

/** تسجيل نقص يدوي: يظهر في برنامج المكتب والويب فوراً، ويصل إشعار «نقص جديد» تلقائياً. */
@Composable
private fun NewShortageSheet(close: (Boolean?) -> Unit) {
    var name by remember { mutableStateOf("") }
    var cat by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val cid = remember { clientId() }
    val scope = rememberCoroutineScope()
    SheetBody("إضافة نقص", "يظهر في قسم النواقص في البرنامج ويصل إشعار للمسؤولين") {
        Input(name, { name = it }, "اسم المادة (مثلاً: شاحن تايب سي 20 واط)")
        Input(cat, { cat = it }, "التصنيف (اختياري)")
        Input(qty, { qty = it.filter { c -> c.isDigit() } }, "الكمية المتبقية (اختياري)", keyboard = KeyboardType.Number)
        Button(onClick = {
            busy = true
            scope.launch {
                try {
                    val r = Api.act("shortage_add", mapOf("name" to name.trim(), "category" to cat.trim(), "current_qty" to (qty.toIntOrNull() ?: 0), "client_id" to cid))
                    Ui.toast(if (r.b("replayed")) "النقص مسجّل مسبقاً" else "سُجّل النقص ${r.o("shortage").s("operation_number")}")
                    close(true)
                } catch (e: Exception) { Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy && name.trim().length >= 2, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("تسجيل النقص") }
    }
}

@Composable
private fun ReportShortagesSheet(close: (Boolean?) -> Unit) {
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    SheetBody("إرسال قائمة النواقص للمدير العام", "تصل كإشعار في صندوق المدير العام على الهاتف والويب، مع كل النواقص الحالية.") {
        Input(note, { note = it }, "ملاحظة (اختياري)")
        Button(onClick = {
            busy = true
            scope.launch {
                try {
                    val r = Api.act("shortages_report", mapOf("note" to note.trim()))
                    if (r["ok"] == false) Ui.toast(r.sOrNull("message") ?: "لا توجد نواقص", error = true)
                    else { Ui.toast("أُرسلت القائمة إلى المدير العام"); close(true) }
                } catch (e: Exception) { Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("إرسال") }
    }
}

// ====================================================================== المرتجعات والمصروفات والشحن
@Composable
fun ReturnsPage() {
    PagedList("returns", "returns", searchHint = "رقم المرتجع أو الفاتورة أو الزبون…") { r, _ ->
        Item(
            r.sOrNull("customer_name") ?: "—",
            "${r.s("return_number")} • فاتورة ${r.sOrNull("invoice_number") ?: "—"} • ${Fmt.`when`(r["created_at"])}${r.sOrNull("reason")?.let { "\n$it" } ?: ""}",
            Icons.AutoMirrored.Outlined.AssignmentReturn, Yq.amber,
            trailing = { Text(Fmt.iqd(r["total_amount"]), fontWeight = FontWeight.Bold) },
        )
    }
}

@Composable
fun ExpensesPage() {
    var v by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    Scaffold(
        containerColor = Color.Transparent,
        floatingActionButton = {
            if (AppState.can("expenses.create")) ExtendedFloatingActionButton(
                onClick = { scope.launch { if (Ui.sheet<Boolean> { NewExpenseSheet(it) } == true) v++ } },
                icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("مصروف جديد") },
            )
        },
    ) { p ->
        Box(Modifier.padding(p).fillMaxSize()) {
            PagedList("expenses", "expenses", cursor = { last, _ -> mapOf("before" to last["created_at"]) }, reloadKey = v) { r, _ ->
                Item(
                    r.s("description"), "${r.s("category")} • ${r.s("actor")} • ${Fmt.`when`(r["created_at"])}", Icons.Outlined.Payments, Yq.red,
                    trailing = {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(Fmt.iqd(r["amount"]), fontWeight = FontWeight.Bold)
                            if (r.b("reversed")) Pill("معكوس", Yq.red)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun NewExpenseSheet(close: (Boolean?) -> Unit) {
    var amount by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var cat by remember { mutableStateOf("مصاريف تشغيلية") }
    var open by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val cid = remember { clientId() }
    val scope = rememberCoroutineScope()
    val cats = listOf("مصاريف تشغيلية", "إيجار", "كهرباء ومولدة", "إنترنت واتصالات", "نقل وتوصيل", "صيانة المحل", "ضيافة", "أخرى")
    SheetBody("مصروف جديد", "يُخصم من الخزنة") {
        MoneyField(amount, { amount = it }, "المبلغ")
        Input(desc, { desc = it }, "الوصف", helper = "مثلاً: فاتورة المولدة")
        ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
            OutlinedTextField(cat, {}, readOnly = true, label = { Text("التصنيف") }, modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable))
            ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                cats.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { cat = c; open = false }) }
            }
        }
        ErrorText(error)
        Button(onClick = {
            if (moneyValue(amount) <= 0 || desc.isBlank()) { error = "أدخل المبلغ والوصف"; return@Button }
            busy = true; error = null
            scope.launch {
                try {
                    Api.act("expense_create", mapOf("amount" to moneyValue(amount), "description" to desc.trim(), "category" to cat, "client_id" to cid))
                    Ui.toast("سُجّل المصروف"); close(true)
                } catch (e: Exception) { error = e.message; Ui.fail(e) }
                busy = false
            }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(50.dp)) { if (busy) Busy() else Text("تسجيل المصروف") }
    }
}

@Composable
fun ShippingPage() {
    PagedList("shipping", "orders", emptyText = "لا توجد شحنات بعد") { r, _ ->
        Item(
            r.sOrNull("recipient") ?: "—",
            "${listOf(r.s("governorate"), r.s("city")).filter { it.isNotEmpty() }.joinToString(" • ")}\n${r.sOrNull("provider_status_text") ?: r.s("status")} • ${Fmt.`when`(r["created_at"])}",
            Icons.Outlined.LocalShipping, Yq.blue,
            trailing = { Text(Fmt.iqd(r["cod_amount"]), fontWeight = FontWeight.Bold) },
        )
    }
}

// ====================================================================== الموظفون والجلسات
@Composable
fun EmployeesPage() {
    PagedList("employees", "employees") { r, _ ->
        val name = r.sOrNull("display_name") ?: r.s("name")
        Item(
            name, "${Fmt.roleLabel[r.s("role")] ?: r.s("role")} • آخر ظهور ${Fmt.`when`(r["last_seen_at"])}", avatarText = name,
            trailing = {
                Column(horizontalAlignment = Alignment.End) {
                    Pill(if (r.s("status") == "active") "نشط" else "موقوف", if (r.s("status") == "active") Yq.green else Yq.red)
                    Text(if (r.b("has_pin")) "رمز مضبوط" else "بدون رمز", fontSize = 11.sp)
                }
            },
        )
    }
}

@Composable
fun SessionsPage() {
    PagedList("sessions", "sessions") { r, _ ->
        val open = r["closed_at"] == null
        Item(
            r.sOrNull("employee_name") ?: "—",
            "${if (r.s("kind") == "web") "ويب/تطبيق" else "برنامج المكتب"} • ${r.sOrNull("device_name") ?: r.s("os")}\nآخر نشاط ${Fmt.`when`(r["last_seen_at"])}",
            if (r.s("kind") == "web") Icons.Outlined.Language else Icons.Outlined.Computer, if (open) Yq.green else Yq.blue,
            trailing = {
                when {
                    r.b("is_current") -> Pill("جلستك", Yq.green)
                    open -> Pill("نشطة", Yq.amber)
                    else -> Pill("مغلقة", Yq.blue)
                }
            },
        )
    }
}
