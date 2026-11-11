package iq.yaqoot.erp.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.J
import iq.yaqoot.erp.core.SessionExpired
import iq.yaqoot.erp.core.l
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// =====================================================================================
// مضيف الواجهة: رسائل عابرة، تأكيد، ألواح سفلية، وصفحات مكدّسة فوق القائمة الرئيسية.
// =====================================================================================
object Ui {
    val snack = SnackbarHostState()
    var snackError by mutableStateOf(false)
    val scope: CoroutineScope = MainScope()
    lateinit var context: Context

    fun toast(msg: String, error: Boolean = false) {
        snackError = error
        scope.launch {
            snack.currentSnackbarData?.dismiss()
            snack.showSnackbar(msg)
        }
    }

    /** انتهاء الجلسة: قفل والعودة لشاشة PIN. */
    fun expire() {
        scope.launch { AppState.lock("انتهت الجلسة. أدخل رمزك من جديد.") }
    }

    /** يعرض خطأ العملية، أو يقفل إن انتهت الجلسة. */
    fun fail(e: Throwable) {
        if (e is SessionExpired) expire() else toast(e.message ?: "حدث خطأ", error = true)
    }

    // ------------------------------------------------------------------ تأكيد
    class ConfirmReq(val title: String, val body: String, val ok: String, val danger: Boolean, val result: CompletableDeferred<Boolean>)
    var confirmReq by mutableStateOf<ConfirmReq?>(null)

    suspend fun confirm(title: String, body: String, ok: String = "تأكيد", danger: Boolean = false): Boolean {
        val r = CompletableDeferred<Boolean>()
        confirmReq = ConfirmReq(title, body, ok, danger, r)
        return r.await()
    }

    // ------------------------------------------------------------------ ألواح سفلية
    class SheetEntry(val content: @Composable (close: (Any?) -> Unit) -> Unit, val result: CompletableDeferred<Any?>)
    val sheets = mutableStateListOf<SheetEntry>()

    @Suppress("UNCHECKED_CAST")
    suspend fun <T> sheet(content: @Composable (close: (T?) -> Unit) -> Unit): T? {
        val r = CompletableDeferred<Any?>()
        sheets.add(SheetEntry({ close -> content { close(it) } }, r))
        return r.await() as T?
    }

    // ------------------------------------------------------------------ صفحات
    val pages = mutableStateListOf<@Composable () -> Unit>()
    fun push(page: @Composable () -> Unit) { pages.add(page) }
    fun pop() { if (pages.isNotEmpty()) pages.removeAt(pages.lastIndex) }

    fun open(uri: Uri?) {
        if (uri == null) return
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            toast("تعذر فتح التطبيق", error = true)
        }
    }

    fun call(phone: String) = open(Uri.parse("tel:$phone"))
}

@Composable
fun UiHost(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        content()
        Ui.pages.lastOrNull()?.let { page ->
            BackHandler { Ui.pop() }
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { page() }
        }
        Ui.sheets.lastOrNull()?.let { entry ->
            val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            val scope = rememberCoroutineScope()
            val close: (Any?) -> Unit = { v ->
                scope.launch {
                    state.hide()
                    Ui.sheets.remove(entry)
                    entry.result.complete(v)
                }
            }
            ModalBottomSheet(onDismissRequest = { Ui.sheets.remove(entry); entry.result.complete(null) }, sheetState = state) {
                Box(Modifier.imePadding().navigationBarsPadding()) { entry.content(close) }
            }
        }
        Ui.confirmReq?.let { req ->
            AlertDialog(
                onDismissRequest = { Ui.confirmReq = null; req.result.complete(false) },
                title = { Text(req.title) },
                text = { Text(req.body) },
                confirmButton = {
                    TextButton(onClick = { Ui.confirmReq = null; req.result.complete(true) }) {
                        Text(req.ok, color = if (req.danger) Yq.red else MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = { TextButton(onClick = { Ui.confirmReq = null; req.result.complete(false) }) { Text("إلغاء") } },
            )
        }
        SnackbarHost(Ui.snack, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().imePadding()) { data ->
            Snackbar(data, containerColor = if (Ui.snackError) Yq.red else Yq.navy, contentColor = Color.White)
        }
    }
}

/** صفحة مكدّسة بشريط علوي وزر رجوع. */
@Composable
fun Page(title: String, actions: @Composable () -> Unit = {}, content: @Composable (PaddingValues) -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = { Ui.pop() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "رجوع") } },
                actions = { actions() },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { content(it) }
}

// =====================================================================================
// التحميل من الخادم
// =====================================================================================
/** يحمّل بيانات مع حالات التحميل والخطأ وانتهاء الجلسة، وسحب للتحديث. */
@Composable
fun <T> Loader(key: Any? = Unit, load: suspend () -> T, content: @Composable (data: T, reload: () -> Unit) -> Unit) {
    var data by remember(key) { mutableStateOf<T?>(null) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    var loading by remember(key) { mutableStateOf(true) }
    var tick by remember(key) { mutableIntStateOf(0) }
    LaunchedEffect(key, tick, AppState.refreshTick) {
        loading = true
        try {
            data = load()
            error = null
        } catch (_: SessionExpired) {
            Ui.expire()
        } catch (e: Exception) {
            error = e.message ?: "تعذر التحميل"
        }
        loading = false
    }
    val d = data
    when {
        d == null && loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        d == null -> ErrorView(error ?: "تعذر التحميل") { tick++ }
        else -> PullToRefreshBox(isRefreshing = loading, onRefresh = { tick++ }, modifier = Modifier.fillMaxSize()) {
            content(d) { tick++ }
        }
    }
}

/** تحميل بسيط داخل صفحة قابلة للتمرير (بلا سحب للتحديث). */
@Composable
fun <T> Fetch(key: Any? = Unit, load: suspend () -> T, content: @Composable (T) -> Unit) {
    var data by remember(key) { mutableStateOf<T?>(null) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    LaunchedEffect(key, AppState.refreshTick) {
        try { data = load(); error = null } catch (_: SessionExpired) { Ui.expire() } catch (e: Exception) { error = e.message }
    }
    val d = data
    when {
        d != null -> content(d)
        error != null -> ErrorText(error)
        else -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    }
}

/** قائمة من الخادم مع بحث وفلاتر وتحميل المزيد وسحب للتحديث. */
@Composable
fun PagedList(
    resource: String,
    listKey: String,
    searchHint: String? = null,
    filters: List<Pair<String, String>>? = null,
    params: Map<String, Any?> = emptyMap(),
    pageSize: Int = 50,
    cursor: ((last: J, count: Int) -> Map<String, Any?>)? = null,
    emptyText: String = "لا توجد سجلات",
    reloadKey: Any? = Unit,
    header: (@Composable (meta: J, reload: () -> Unit) -> Unit)? = null,
    item: @Composable (row: J, reload: () -> Unit) -> Unit,
) {
    val rows = remember(resource) { mutableStateListOf<J>() }
    var meta by remember(resource) { mutableStateOf<J>(emptyMap()) }
    var loading by remember(resource) { mutableStateOf(true) }
    var more by remember(resource) { mutableStateOf(false) }
    var error by remember(resource) { mutableStateOf<String?>(null) }
    var q by remember(resource) { mutableStateOf("") }
    var filter by remember(resource) { mutableStateOf(filters?.firstOrNull()?.first ?: "") }
    var tick by remember(resource) { mutableIntStateOf(0) }
    var append by remember(resource) { mutableStateOf(false) }

    fun filterParams(): Map<String, Any?> {
        val parts = filter.split('=')
        return if (parts.size == 2) mapOf(parts[0] to (if (parts[1] == "true") true else parts[1])) else emptyMap()
    }

    LaunchedEffect(resource, q, filter, tick, reloadKey, AppState.refreshTick) {
        if (!append) delay(if (q.isEmpty()) 0 else 350)
        loading = true
        error = null
        try {
            val c = if (append && rows.isNotEmpty() && cursor != null) cursor(rows.last(), rows.size) else emptyMap()
            val d = Api.get(resource, params + filterParams() + (if (q.isNotEmpty()) mapOf("q" to q) else emptyMap()) + mapOf("limit" to pageSize) + c)
            val list = d.l(listKey)
            if (!append) rows.clear()
            rows.addAll(list)
            meta = d
            more = list.size == pageSize && cursor != null
        } catch (_: SessionExpired) {
            Ui.expire()
        } catch (e: Exception) {
            error = e.message
        }
        append = false
        loading = false
    }
    val reload: () -> Unit = { append = false; tick++ }
    PullToRefreshBox(isRefreshing = loading && rows.isNotEmpty(), onRefresh = reload, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp, 12.dp, 12.dp, 96.dp)) {
            if (header != null) item { header(meta, reload) }
            if (searchHint != null) item {
                OutlinedTextField(
                    value = q, onValueChange = { q = it }, singleLine = true,
                    placeholder = { Text(searchHint) }, leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                )
            }
            if (filters != null) item {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    filters.forEach { (k, label) -> FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(label) }) }
                }
            }
            if (error != null) item { ErrorView(error!!) { reload() } }
            if (error == null && !loading && rows.isEmpty()) item { EmptyView(emptyText) }
            if (rows.isNotEmpty()) item {
                Card(colors = cardColors()) {
                    rows.forEachIndexed { i, r ->
                        if (i > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        item(r, reload)
                    }
                }
            }
            if (loading && rows.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            if (more && !loading) item {
                OutlinedButton(onClick = { append = true; tick++ }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) { Text("تحميل المزيد") }
            }
        }
    }
}

// =====================================================================================
// عناصر عرض
// =====================================================================================
@Composable
fun cardColors() = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)

@Composable
fun ErrorView(message: String, onRetry: (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Outlined.CloudOff, null, tint = Yq.red, modifier = Modifier.size(44.dp))
        Spacer(Modifier.height(12.dp))
        Text(message, textAlign = TextAlign.Center)
        if (onRetry != null) {
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = onRetry) { Icon(Icons.Outlined.Refresh, null); Spacer(Modifier.width(6.dp)); Text("إعادة المحاولة") }
        }
    }
}

@Composable
fun EmptyView(text: String, icon: ImageVector = Icons.Outlined.Inbox) {
    Column(Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(10.dp))
        Text(text, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.outline)
    }
}

/** مؤشر رقمي. value رقم يُعرض بالدينار، أو نص جاهز إذا raw. */
@Composable
fun Kpi(label: String, value: Any?, icon: ImageVector, color: Color, modifier: Modifier = Modifier, hint: String? = null, raw: Boolean = false, onClick: (() -> Unit)? = null) {
    Card(modifier.then(if (onClick != null) Modifier.clickable { onClick() } else Modifier), colors = cardColors(), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Box(Modifier.clip(RoundedCornerShape(10.dp)).background(color.copy(alpha = 0.13f)).padding(6.dp)) { Icon(icon, null, tint = color, modifier = Modifier.size(18.dp)) }
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(if (raw) value?.toString() ?: "0" else Fmt.money(value), fontSize = 21.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                if (!raw) Text("  د.ع", fontSize = 11.sp, color = MaterialTheme.colorScheme.outline)
            }
            if (hint != null) Text(hint, fontSize = 11.sp, color = MaterialTheme.colorScheme.outline, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

typealias Tile = @Composable (Modifier) -> Unit

/** يبني بلاطة مؤشر (حتى يُستدل على أنها دالة Compose). */
fun tile(f: @Composable (Modifier) -> Unit): Tile = f

/** شبكة مؤشرات بعمودين. */
@Composable
fun KpiGrid(vararg tiles: Tile?) {
    val list = tiles.filterNotNull()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        list.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                pair.forEach { it(Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun Pill(text: String, color: Color = MaterialTheme.colorScheme.primary) {
    Text(
        text, fontSize = 11.5.sp, color = color, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(20.dp)).background(color.copy(alpha = 0.13f)).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

@Composable
fun Section(title: String, subtitle: String? = null, trailing: (@Composable () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Card(colors = cardColors(), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title, fontSize = 15.5.sp, fontWeight = FontWeight.Bold)
                    if (subtitle != null) Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                }
                trailing?.invoke()
            }
            content()
        }
    }
}

@Composable
fun Avatar(text: String, icon: ImageVector? = null, color: Color = MaterialTheme.colorScheme.primary, size: Dp = 40.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(color.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
        if (icon != null) Icon(icon, null, tint = color, modifier = Modifier.size(size * 0.48f))
        else Text(text.trim().take(1).ifEmpty { "؟" }, color = color, fontWeight = FontWeight.Bold)
    }
}

/** صف قائمة موحّد. */
@Composable
fun Item(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    color: Color = MaterialTheme.colorScheme.primary,
    avatarText: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    ListItem(
        headlineContent = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        supportingContent = subtitle?.let { { Text(it, maxLines = 4, overflow = TextOverflow.Ellipsis) } },
        leadingContent = if (icon != null || avatarText != null) ({ Avatar(avatarText ?: "", icon, color) }) else null,
        trailingContent = trailing,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = if (onClick != null) Modifier.clickable { onClick() } else Modifier,
    )
}

/** سطر «عنوان … قيمة». */
@Composable
fun Field(label: String, value: Any?, valueColor: Color? = null) {
    val v = value?.toString()?.takeIf { it.isNotBlank() } ?: return
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(v, fontWeight = FontWeight.SemiBold, color = valueColor ?: Color.Unspecified, textAlign = TextAlign.End)
    }
}

@Composable
fun Busy() = CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.4.dp, color = Color.White)

/** حقل مبلغ بالدينار مع فواصل الآلاف أثناء الكتابة. */
@Composable
fun MoneyField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, helper: String? = null) {
    var tfv by remember { mutableStateOf(TextFieldValue(value, TextRange(value.length))) }
    if (tfv.text != value) tfv = TextFieldValue(value, TextRange(value.length))
    OutlinedTextField(
        value = tfv,
        onValueChange = { v ->
            val digits = v.text.filter { it.isDigit() || it in '٠'..'٩' }.map { if (it in '٠'..'٩') '0' + (it - '٠') else it }.joinToString("").take(13)
            val t = if (digits.isEmpty()) "" else Fmt.money(digits.toLong())
            tfv = TextFieldValue(t, TextRange(t.length))
            onChange(t)
        },
        label = { Text(label) },
        suffix = { Text("د.ع") },
        supportingText = helper?.let { { Text(it) } },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = MaterialTheme.typography.titleLarge,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.fillMaxWidth(),
    )
}

fun moneyValue(s: String): Long = s.filter { it.isDigit() }.toLongOrNull() ?: 0L

@Composable
fun Input(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, keyboard: KeyboardType = KeyboardType.Text, singleLine: Boolean = true, minLines: Int = 1, helper: String? = null, ltr: Boolean = false) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) },
        singleLine = singleLine, minLines = minLines,
        supportingText = helper?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        textStyle = if (ltr) MaterialTheme.typography.bodyLarge.copy(textDirection = androidx.compose.ui.text.style.TextDirection.Ltr) else MaterialTheme.typography.bodyLarge,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.fillMaxWidth(),
    )
}

/** محتوى لوح سفلي بعنوان. */
@Composable
fun SheetBody(title: String, subtitle: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        if (subtitle != null) Text(subtitle, color = MaterialTheme.colorScheme.outline)
        Spacer(Modifier.height(4.dp))
        content()
    }
}

@Composable
fun ErrorText(text: String?) {
    if (text != null) Text(text, color = Yq.red, fontSize = 13.sp)
}

/** شعار مكتب سفيان للموبايل: مربع كحلي بثلاثة أعمدة (عاجيان وذهبي). */
@Composable
fun BrandMark(size: Dp = 72.dp) {
    val w = size * 0.101f
    val gap = size * 0.155f - w
    val heights = listOf(0.185f, 0.272f, 0.36f)
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.27f)).background(Yq.navy), contentAlignment = Alignment.Center) {
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(gap)) {
                heights.forEachIndexed { i, h ->
                    Box(
                        Modifier.width(w).height(size * h).clip(RoundedCornerShape(w / 2)).then(
                            if (i < 2) Modifier.background(Yq.cream)
                            else Modifier.background(Brush.verticalGradient(listOf(Color(0xFFCFB072), Color(0xFFC2A262)))),
                        ),
                    )
                }
            }
        }
    }
}

/** شريط أزرار أفقي يلتف. */
@Composable
fun Buttons(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}

@Composable
fun Tonal(text: String, icon: ImageVector? = null, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)) }
        Text(text)
    }
}

@Composable
fun Outlined(text: String, icon: ImageVector? = null, tint: Color? = null, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp), tint = tint ?: MaterialTheme.colorScheme.primary); Spacer(Modifier.width(6.dp)) }
        Text(text)
    }
}

/** قائمة عمودية قابلة للتمرير لمحتوى الصفحات. */
@Composable
fun Scroll(padding: PaddingValues = PaddingValues(0.dp), content: LazyListScope.() -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp + padding.calculateTopPadding(), bottom = 32.dp + padding.calculateBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

fun Modifier.outlineBox(color: Color, radius: Dp = 16.dp) = this.border(1.dp, color, RoundedCornerShape(radius))
