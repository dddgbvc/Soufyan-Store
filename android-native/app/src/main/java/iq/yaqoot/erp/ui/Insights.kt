package iq.yaqoot.erp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.MoneyOff
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.PostAdd
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material.icons.outlined.SouthWest
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.SessionExpired
import iq.yaqoot.erp.core.b
import iq.yaqoot.erp.core.l
import iq.yaqoot.erp.core.n
import iq.yaqoot.erp.core.o
import iq.yaqoot.erp.core.s
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

// ====================================================================== المساعد الذكي
/** أسئلة عن المحل بلغة طبيعية. يقرأ البيانات بصلاحياتك فقط ولا ينفّذ أي عملية. */
@Composable
fun AssistantPage() {
    val turns = remember { mutableStateListOf<Pair<String, String>>() }
    var input by remember { mutableStateOf("") }
    var thinking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val suggestions = listOf("شنو ملخص اليوم؟", "منو أكثر 5 زبائن عليهم ديون؟", "شنو الاشتراكات اللي تنتهي هالأسبوع؟", "شنو النواقص المهمة؟", "قارن مبيعات اليوم بأمس")

    fun send(text: String = input) {
        val q = text.trim()
        if (q.isEmpty() || thinking) return
        input = ""
        turns.add("user" to q)
        thinking = true; error = null
        scope.launch {
            try {
                val msgs = turns.takeLast(12).map { mapOf("role" to it.first, "content" to it.second) }
                turns.add("assistant" to Api.assistant(msgs))
            } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { error = e.message }
            thinking = false
        }
    }
    LaunchedEffect(turns.size, thinking) { val n = list.layoutInfo.totalItemsCount; if (n > 0) list.animateScrollToItem(n - 1) }

    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (turns.isEmpty()) item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Spacer(Modifier.height(16.dp))
                    Icon(Icons.Outlined.AutoAwesome, null, tint = Yq.gold, modifier = Modifier.size(46.dp))
                    Text("اسأل عن محلك", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("يقرأ المبيعات والديون والمخزون والاشتراكات بصلاحياتك، ولا ينفّذ أي عملية.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.outline)
                    Spacer(Modifier.height(14.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                        suggestions.forEach { s -> AssistChip(onClick = { send(s) }, label = { Text(s) }) }
                    }
                }
            }
            items(turns) { (role, text) -> Bubble(text, role == "user") }
            if (thinking) item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Text("  يجمع البيانات ويحلّلها…", color = MaterialTheme.colorScheme.outline)
                }
            }
            error?.let { item { Text(it, color = Yq.red) } }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (turns.isNotEmpty()) IconButton(onClick = { turns.clear(); error = null }, enabled = !thinking) { Icon(Icons.Outlined.PostAdd, "محادثة جديدة") }
            OutlinedTextField(input, { input = it }, placeholder = { Text("اكتب سؤالك…") }, maxLines = 4, shape = RoundedCornerShape(20.dp), modifier = Modifier.weight(1f))
            Spacer(Modifier.size(8.dp))
            FilledIconButton(onClick = { send() }, enabled = !thinking && input.isNotBlank()) { Icon(Icons.Outlined.ArrowUpward, "إرسال") }
        }
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterStart else Alignment.CenterEnd) {
        SelectionContainer {
            Text(
                text, color = if (mine) Color.White else MaterialTheme.colorScheme.onSurface, lineHeight = 22.sp,
                modifier = Modifier.widthIn(max = 320.dp).clip(RoundedCornerShape(16.dp))
                    .background(if (mine) Yq.navy else MaterialTheme.colorScheme.surfaceContainer)
                    .then(if (mine) Modifier else Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
    }
}

// ====================================================================== التحليلات
private class P(val day: String) {
    var sales = 0.0; var revenue = 0.0; var cost = 0.0; var collected = 0.0; var paid = 0.0; var expenses = 0.0; var added = 0.0; var invoices = 0.0
    val profit get() = revenue - cost
}

private fun points(rows: List<J>) = rows.map { r ->
    P(r.s("day")).apply {
        sales = r.n("sales"); revenue = r.n("revenue"); cost = r.n("cost"); collected = r.n("collected")
        paid = r.n("paid"); expenses = r.n("expenses"); added = r.n("debt_added"); invoices = r.n("invoices")
    }
}

private fun sum(ps: List<P>) = P("").apply {
    ps.forEach { sales += it.sales; revenue += it.revenue; cost += it.cost; collected += it.collected; paid += it.paid; expenses += it.expenses; added += it.added; invoices += it.invoices }
}

/** مؤشرات الفترة مقارنة بالسابقة، منحنى المبيعات والربح، حركة النقد، المنتجات، طرق الدفع، الإنترنت، وأعلى الديون. */
@Composable
fun AnalyticsPage() {
    var days by remember { mutableIntStateOf(30) }
    Column(Modifier.fillMaxSize()) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(12.dp)) {
            listOf(7 to "7 أيام", 30 to "30 يوم", 90 to "90 يوم", 365 to "سنة").forEachIndexed { i, (d, l) ->
                SegmentedButton(days == d, { days = d }, SegmentedButtonDefaults.itemShape(i, 4)) { Text(l) }
            }
        }
        Box(Modifier.weight(1f)) {
            Loader(days, load = { Api.get("analytics", mapOf("days" to days)) }) { d, _ -> AnalyticsContent(d, days) }
        }
    }
}

@Composable
private fun AnalyticsContent(d: J, days: Int) {
    val all = points(d.l("series"))
    val split = max(all.size - days, 0)
    val prev = all.subList(0, split)
    val cur = all.subList(split, all.size)
    val c = sum(cur)
    val p = sum(prev)
    val profitVisible = d.b("profit_visible")
    val primary = MaterialTheme.colorScheme.primary
    val outline = MaterialTheme.colorScheme.outline

    fun delta(v: Double, pv: Double, hint: String? = null): String? {
        val parts = listOfNotNull(
            if (pv != 0.0) { val x = (v - pv) / abs(pv) * 100; "${if (x >= 0) "▲" else "▼"} ${abs(x).roundToInt()}٪ عن الفترة السابقة" } else null,
            hint,
        )
        return parts.takeIf { it.isNotEmpty() }?.joinToString("\n")
    }

    Scroll {
        item {
            KpiGrid(
                tile { m -> Kpi("المبيعات", c.sales, Icons.AutoMirrored.Outlined.TrendingUp, primary, m, delta(c.sales, p.sales)) },
                if (profitVisible) tile { m -> Kpi("الربح الإجمالي", c.profit, Icons.Outlined.Savings, Yq.green, m, delta(c.profit, p.profit, if (c.revenue > 0) "الهامش ${(c.profit / c.revenue * 100).roundToInt()}٪" else null)) } else null,
                tile { m -> Kpi("صافي النقد", c.paid + c.collected - c.expenses, Icons.Outlined.Payments, Yq.purple, m, delta(c.paid + c.collected - c.expenses, p.paid + p.collected - p.expenses, "مقبوض + تحصيل − مصروفات")) },
                tile { m -> Kpi("تحصيل الديون", c.collected, Icons.Outlined.SouthWest, Yq.green, m, delta(c.collected, p.collected)) },
                tile { m -> Kpi("ديون جديدة", c.added, Icons.Outlined.NorthEast, Yq.gold, m, delta(c.added, p.added)) },
                tile { m -> Kpi("المصروفات", c.expenses, Icons.Outlined.MoneyOff, Yq.red, m, delta(c.expenses, p.expenses)) },
                tile { m -> Kpi("متوسط الفاتورة", if (c.invoices > 0) c.sales / c.invoices else 0.0, Icons.AutoMirrored.Outlined.ReceiptLong, Yq.blue, m, delta(if (c.invoices > 0) c.sales / c.invoices else 0.0, if (p.invoices > 0) p.sales / p.invoices else 0.0, "${c.invoices.roundToInt()} فاتورة")) },
            )
        }
        item {
            Section("المبيعات والربح", if (profitVisible) "الأخضر الربح، والرمادي المتقطع الفترة السابقة" else "الرمادي المتقطع الفترة السابقة") {
                LineChart(
                    listOfNotNull(
                        Series(cur.map { it.sales }, primary, fill = true),
                        if (profitVisible) Series(cur.map { it.profit }, Yq.green) else null,
                        if (prev.size == cur.size) Series(prev.map { it.sales }, Color.Gray, dashed = true) else null,
                    ),
                    outline,
                )
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Text(cur.firstOrNull()?.let { Fmt.dateOnly(it.day) } ?: "", fontSize = 10.sp, color = outline, modifier = Modifier.weight(1f))
                    Text(cur.lastOrNull()?.let { Fmt.dateOnly(it.day) } ?: "", fontSize = 10.sp, color = outline)
                }
            }
        }
        item {
            val size = if (days <= 31) 1 else if (days <= 90) 7 else 30
            val groups = cur.chunked(size).map { sum(it) }
            Section("حركة النقد", "مقبوض المبيعات • تحصيل الديون • مصروفات") {
                Bars(groups.map { listOf(it.paid, it.collected, it.expenses) }, listOf(primary, Yq.green, Yq.red))
            }
        }
        val products = d.l("top_products")
        if (products.isNotEmpty()) item { Section("أكثر المنتجات مبيعاً") { HBars(products.take(8).map { it.s("name") to it.n("total") }, primary) } }
        val mix = d.l("payment_mix")
        if (mix.isNotEmpty()) item { Section("طرق الدفع") { HBars(mix.map { Fmt.payment(it["type"]) to it.n("total") }, Yq.blue, percent = true) } }
        d.o("isp")?.let { isp ->
            item {
                Section("الإنترنت", "التجديدات خلال الفترة") {
                    FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        StatText("التجديدات", isp.s("renewals").ifEmpty { "0" })
                        StatText("الإيراد", Fmt.money(isp["sell"]))
                        if (profitVisible && isp["cost"] != null) {
                            StatText("الكلفة", Fmt.money(isp["cost"]))
                            StatText("الربح", Fmt.money(isp.n("sell") - isp.n("cost")))
                        }
                    }
                }
            }
        }
        val debtors = d.l("top_debtors")
        if (debtors.isNotEmpty()) item { Section("أعلى الديون") { HBars(debtors.map { it.s("name") to it.n("balance") }, Yq.gold) } }
    }
}

@Composable
private fun StatText(label: String, value: String) {
    Column {
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
        Text(value, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    }
}

private class Series(val values: List<Double>, val color: Color, val fill: Boolean = false, val dashed: Boolean = false)

@Composable
private fun LineChart(series: List<Series>, axis: Color) {
    Canvas(Modifier.fillMaxWidth().height(220.dp).padding(horizontal = 16.dp, vertical = 10.dp)) {
        val h = size.height
        val w = size.width
        val values = series.flatMap { it.values }
        val maxV = max(1.0, values.maxOrNull() ?: 1.0)
        val minV = minOf(0.0, values.minOrNull() ?: 0.0)
        for (i in 0..3) drawLine(axis.copy(alpha = 0.2f), Offset(0f, h * i / 3), Offset(w, h * i / 3), 1f)
        series.forEach { s ->
            if (s.values.size < 2) return@forEach
            // من اليمين لليسار: أقدم يوم على اليمين.
            fun pt(i: Int) = Offset(w - w * i / (s.values.size - 1), (h - (s.values[i] - minV) / (maxV - minV) * h).toFloat())
            val path = Path().apply { moveTo(pt(0).x, pt(0).y); for (i in 1 until s.values.size) lineTo(pt(i).x, pt(i).y) }
            if (s.fill) {
                val area = Path().apply { addPath(path); lineTo(pt(s.values.size - 1).x, h); lineTo(pt(0).x, h); close() }
                drawPath(area, Brush.verticalGradient(listOf(s.color.copy(alpha = 0.3f), s.color.copy(alpha = 0.02f))))
            }
            drawPath(
                path, if (s.dashed) s.color.copy(alpha = 0.6f) else s.color,
                style = Stroke(width = if (s.dashed) 3f else 5f, cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = if (s.dashed) PathEffect.dashPathEffect(floatArrayOf(12f, 10f)) else null),
            )
        }
    }
}

@Composable
private fun Bars(groups: List<List<Double>>, colors: List<Color>) {
    Canvas(Modifier.fillMaxWidth().height(180.dp).padding(horizontal = 16.dp, vertical = 10.dp)) {
        if (groups.isEmpty()) return@Canvas
        val maxV = max(1.0, groups.flatten().maxOrNull() ?: 1.0)
        val slot = size.width / groups.size
        val bw = max(2f, slot / (colors.size + 1))
        groups.forEachIndexed { i, g ->
            val x0 = size.width - slot * (i + 1) + (slot - bw * colors.size) / 2
            g.forEachIndexed { j, v ->
                val bh = (v / maxV * size.height).toFloat()
                drawRoundRect(colors[j], Offset(x0 + bw * j, size.height - bh), Size(bw * 0.9f, bh), CornerRadius(4f, 4f))
            }
        }
    }
}

@Composable
private fun HBars(items: List<Pair<String, Double>>, color: Color, percent: Boolean = false) {
    val maxV = max(1.0, items.maxOfOrNull { it.second } ?: 1.0)
    val total = items.sumOf { it.second }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.forEach { (name, v) ->
            Column {
                Row {
                    Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(if (percent && total > 0) "${(v / total * 100).roundToInt()}٪ • ${Fmt.money(v)}" else Fmt.money(v), fontWeight = FontWeight.SemiBold)
                }
                LinearProgressIndicator(
                    progress = { (v / maxV).toFloat() }, color = color, trackColor = color.copy(alpha = 0.12f),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp).height(7.dp).clip(CircleShape),
                )
            }
        }
    }
}
