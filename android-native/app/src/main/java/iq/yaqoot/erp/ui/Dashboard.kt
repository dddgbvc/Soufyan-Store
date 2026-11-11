package iq.yaqoot.erp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.Pdf
import iq.yaqoot.erp.core.ReportPart
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

@Composable
fun DashboardPage(go: (String) -> Unit) {
    Loader(load = {
        coroutineScope {
            val a = async { Api.get("dashboard") }
            val b = async { if (AppState.can("pos")) Api.get("invoices", mapOf("limit" to 5)) else emptyMap() }
            val c = async { if (AppState.can("inventory")) Api.get("products", mapOf("low_only" to true, "limit" to 4)) else emptyMap() }
            val d = async { if (AppState.can("customers")) Api.get("customers", mapOf("debtors_only" to true, "limit" to 4)) else emptyMap() }
            a.await() + mapOf("latest" to b.await()["invoices"], "low" to c.await()["products"], "debtors" to d.await()["customers"])
        }
    }) { d, _ ->
        val sales = d.o("sales")
        val profit = d.o("profit")
        val series = d.l("series")
        Scroll {
            item {
                Text("أهلاً ${AppState.employeeName} 👋", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("${Fmt.todayLong()} • ${AppState.storeName}", color = MaterialTheme.colorScheme.outline)
            }
            item {
                Buttons {
                    Tonal("اسأل المساعد", Icons.Outlined.AutoAwesome) { go("assistant") }
                    if (AppState.can("dashboard")) Outlined("التحليلات", Icons.Outlined.Insights) { go("analytics") }
                    Outlined("تقرير اليوم PDF", Icons.Outlined.PictureAsPdf) { dailyPdf(d) }
                }
            }
            item {
                KpiGrid(
                    sales?.let { s -> tile { m -> Kpi("مبيعات اليوم", s["today_total"], Icons.AutoMirrored.Outlined.ReceiptLong, MaterialTheme.colorScheme.primary, m, "${s.s("today_count")} فاتورة • المقبوض ${Fmt.money(s["today_paid"])}") { go("invoices") } } },
                    sales?.let { s -> tile { m -> Kpi("مبيعات الشهر", s["month_total"], Icons.AutoMirrored.Outlined.TrendingUp, Yq.blue, m, "${s.s("month_count")} فاتورة") { go("invoices") } } },
                    profit?.let { p -> tile { m -> Kpi("ربح اليوم", p.n("today_revenue") - p.n("today_cost"), Icons.Outlined.Savings, Yq.green, m, "الشهر ${Fmt.money(p.n("month_revenue") - p.n("month_cost"))}") } },
                    d.o("debts")?.let { x -> tile { m -> Kpi("ديون الزبائن", x["total"], Icons.Outlined.AccountBalanceWallet, Yq.gold, m, "${x.s("debtors")} زبون • المحصّل اليوم ${Fmt.money(d.o("collected")?.get("today"))}") { go("customers") } } },
                    d["vault_balance"]?.let { v -> tile { m -> Kpi("رصيد الخزنة", v, Icons.Outlined.AccountBalance, Yq.purple, m) { go("vault") } } },
                    d.o("expenses")?.let { x -> tile { m -> Kpi("مصروفات اليوم", x["today"], Icons.Outlined.NorthEast, Yq.red, m, "الشهر ${Fmt.money(x["month"])}") { go("expenses") } } },
                    if (sales == null) d.o("my_sales")?.let { x -> tile { m -> Kpi("مبيعاتي اليوم", x["total"], Icons.AutoMirrored.Outlined.ReceiptLong, MaterialTheme.colorScheme.primary, m, "${x.s("count")} فاتورة") } } else null,
                    d.o("repairs")?.let { x -> tile { m -> Kpi("صيانة مفتوحة", x.s("open"), Icons.Outlined.Build, Yq.blue, m, "${x.s("ready")} جاهزة", raw = true) { go("repairs") } } },
                    d.o("stock")?.let { x -> tile { m -> Kpi("تحت حد التنبيه", x.s("low"), Icons.Outlined.Inventory2, Yq.amber, m, "${x.s("out")} نفدت", raw = true) { go(if (AppState.can("shortages")) "shortages" else "products") } } },
                )
            }
            if (series.isNotEmpty()) item {
                val maxV = maxOf(1.0, series.maxOf { it.n("total") })
                Section("مبيعات آخر 7 أيام", "إجمالي الفواتير لكل يوم") {
                    Row(Modifier.fillMaxWidth().height(190.dp).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.Bottom) {
                        series.forEach { x ->
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                                if (x.n("total") > 0) Text("${Fmt.money(x.n("total") / 1000)}k", fontSize = 10.sp, color = MaterialTheme.colorScheme.outline)
                                Spacer(Modifier.height(4.dp))
                                Box(
                                    Modifier.padding(horizontal = 5.dp).fillMaxWidth().height((4 + 120 * x.n("total") / maxV).dp)
                                        .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp, bottomStart = 3.dp, bottomEnd = 3.dp))
                                        .background(if (x.s("day") == d.s("today")) Yq.gold else MaterialTheme.colorScheme.primary),
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(Fmt.weekday(x.s("day")), fontSize = 10.sp)
                            }
                        }
                    }
                }
            }
            val low = d.l("low")
            val debtors = d.l("debtors")
            if (low.isNotEmpty() || debtors.isNotEmpty()) item {
                Section("تحتاج انتباهك") {
                    low.forEach { r -> Item(r.s("name"), "${r.s("stock_quantity")} متبقية • الحد ${r.s("min_stock_alert")}", Icons.Outlined.Inventory2, Yq.amber) { go(if (AppState.can("shortages")) "shortages" else "products") } }
                    debtors.forEach { r -> Item(r.s("name"), "عليه ${Fmt.iqd(r["balance"])}", Icons.Outlined.AccountBalanceWallet, Yq.red) { go("customers") } }
                }
            }
            val latest = d.l("latest")
            if (latest.isNotEmpty()) item {
                Section("آخر الفواتير", trailing = { TextButton(onClick = { go("invoices") }) { Text("عرض الكل") } }) {
                    latest.forEach { InvoiceRow(it) }
                }
            }
        }
    }
}

private fun dailyPdf(d: J) {
    val s = d.o("sales")
    val p = d.o("profit")
    val rows = buildList {
        if (s != null) {
            add(listOf("مبيعات اليوم", Fmt.iqd(s["today_total"]), "${s.s("today_count")} فاتورة"))
            add(listOf("المقبوض اليوم", Fmt.iqd(s["today_paid"]), ""))
            add(listOf("مبيعات الشهر", Fmt.iqd(s["month_total"]), "${s.s("month_count")} فاتورة"))
        }
        if (p != null) add(listOf("ربح اليوم", Fmt.iqd(p.n("today_revenue") - p.n("today_cost")), ""))
        d["vault_balance"]?.let { add(listOf("رصيد الخزنة", Fmt.iqd(it), "")) }
        d.o("debts")?.let { add(listOf("ديون الزبائن", Fmt.iqd(it["total"]), "${it.s("debtors")} زبون")) }
        d.o("expenses")?.let { add(listOf("مصروفات اليوم", Fmt.iqd(it["today"]), "")) }
    }
    val week = d.l("series").map { listOf(Fmt.weekday(it.s("day")), it.s("day"), Fmt.iqd(it["total"])) }
    try {
        Pdf.share(
            Ui.context, "تقرير اليوم", "تقرير-${Fmt.stamp()}",
            listOf(
                ReportPart("الملخص", listOf("البند", "المبلغ", "ملاحظة"), rows),
                ReportPart("مبيعات آخر 7 أيام", listOf("اليوم", "التاريخ", "المبيعات"), week),
            ),
            subtitle = "أعدّه ${AppState.employeeName}",
        )
    } catch (e: Exception) {
        Ui.toast("تعذر إنشاء ملف PDF: ${e.message}", error = true)
    }
}

/** بطاقة صغيرة «عنوان: قيمة». */
@Composable
fun Stat(label: String, value: String, modifier: Modifier = Modifier, color: androidx.compose.ui.graphics.Color? = null) {
    Card(modifier, colors = cardColors()) {
        Column(Modifier.padding(12.dp)) {
            Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
            Text(value, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.onSurface)
        }
    }
}
