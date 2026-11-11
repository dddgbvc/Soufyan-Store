package iq.yaqoot.erp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.AssignmentReturn
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.ProductionQuantityLimits
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.core.Fmt
import iq.yaqoot.erp.core.Notify
import iq.yaqoot.erp.core.SessionExpired
import iq.yaqoot.erp.core.i
import iq.yaqoot.erp.core.s
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class SectionDef(val key: String, val title: String, val icon: ImageVector, val perms: List<String>, val group: String)

val sections = listOf(
    SectionDef("dashboard", "نظرة عامة", Icons.Outlined.Dashboard, listOf("dashboard"), "work"),
    SectionDef("assistant", "المساعد الذكي", Icons.Outlined.AutoAwesome, emptyList(), "work"),
    SectionDef("analytics", "التحليلات", Icons.Outlined.Insights, listOf("dashboard"), "work"),
    SectionDef("invoices", "المبيعات والفواتير", Icons.AutoMirrored.Outlined.ReceiptLong, listOf("pos"), "work"),
    SectionDef("customers", "الديون والزبائن", Icons.Outlined.AccountBalanceWallet, listOf("customers"), "work"),
    SectionDef("vault", "الخزنة", Icons.Outlined.AccountBalance, listOf("vaults"), "work"),
    SectionDef("products", "المخزون", Icons.Outlined.Inventory2, listOf("inventory"), "work"),
    SectionDef("shortages", "النواقص", Icons.Outlined.ProductionQuantityLimits, listOf("shortages"), "work"),
    SectionDef("repairs", "الصيانة", Icons.Outlined.Build, listOf("repairs"), "ops"),
    SectionDef("isp", "الإنترنت (ISP)", Icons.Outlined.Wifi, listOf("customers"), "ops"),
    SectionDef("whatsapp", "واتساب المحل", Icons.Outlined.Chat, listOf("customers"), "ops"),
    SectionDef("returns", "المرتجعات", Icons.AutoMirrored.Outlined.AssignmentReturn, listOf("returns"), "ops"),
    SectionDef("expenses", "المصروفات", Icons.Outlined.Payments, listOf("expenses"), "ops"),
    SectionDef("shipping", "الشحن والتوصيل", Icons.Outlined.LocalShipping, listOf("shipping"), "ops"),
    SectionDef("employees", "الموظفون", Icons.Outlined.Groups, listOf("employees"), "admin"),
    SectionDef("sessions", "الجلسات والأجهزة", Icons.Outlined.Devices, listOf("employees"), "admin"),
    SectionDef("notifications", "مركز الإشعارات", Icons.Outlined.Notifications, emptyList(), "admin"),
    SectionDef("settings", "الإعدادات", Icons.Outlined.Settings, emptyList(), "admin"),
)

private val groups = listOf("work" to "مساحة العمل", "ops" to "العمليات", "admin" to "الإدارة")

@Composable
fun Shell() {
    val allowed = remember(AppState.permissions) { sections.filter { s -> s.perms.all { AppState.can(it) } } }
    var page by remember { mutableStateOf(allowed.firstOrNull()?.key ?: "settings") }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val go: (String) -> Unit = { k -> if (allowed.any { it.key == k }) { page = k; Ui.pages.clear() } }

    // فتح قسم من إشعار.
    LaunchedEffect(AppState.pendingRoute) {
        AppState.pendingRoute?.let { r ->
            val key = r.removePrefix("/#").let { if (it == "inbox") "notifications" else it }
            go(key)
            AppState.pendingRoute = null
        }
    }
    // الإشعارات أثناء الفتح + القفل بعد الخمول.
    LaunchedEffect(Unit) {
        while (true) {
            if (AppState.idleExpired()) { AppState.lock("قُفلت الشاشة تلقائياً بعد فترة خمول."); break }
            try {
                Notify.pollOnce()?.let { AppState.unread = it } ?: run {
                    AppState.unread = Api.get("inbox", mapOf("limit" to 1)).i("unread") ?: AppState.unread
                }
            } catch (_: SessionExpired) {
                Ui.expire(); break
            } catch (_: Exception) {}
            delay(15_000)
        }
    }

    val current = allowed.firstOrNull { it.key == page } ?: allowed.first()
    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.background) {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                        BrandMark(46.dp)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(AppState.storeName, fontWeight = FontWeight.Bold)
                            Text("${AppState.employeeName} • ${Fmt.roleLabel[AppState.employee.s("role")] ?: AppState.employee.s("role")}", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                        }
                    }
                    for ((g, label) in groups) {
                        val items = allowed.filter { it.group == g }
                        if (items.isEmpty()) continue
                        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(start = 28.dp, top = 12.dp, bottom = 6.dp))
                        items.forEach { s ->
                            NavigationDrawerItem(
                                icon = {
                                    if (s.key == "notifications" && AppState.unread > 0) BadgedBox(badge = { Badge { Text("${AppState.unread}") } }) { Icon(s.icon, null) }
                                    else Icon(s.icon, null)
                                },
                                label = { Text(s.title) },
                                selected = s.key == current.key,
                                onClick = { go(s.key); scope.launch { drawer.close() } },
                                modifier = Modifier.padding(horizontal = 12.dp),
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                }
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(current.title) },
                    navigationIcon = { IconButton(onClick = { scope.launch { drawer.open() } }) { Icon(Icons.Outlined.Menu, "القائمة") } },
                    actions = {
                        IconButton(onClick = { go("notifications") }) {
                            BadgedBox(badge = { if (AppState.unread > 0) Badge { Text(if (AppState.unread > 99) "99+" else "${AppState.unread}") } }) {
                                Icon(Icons.Outlined.Notifications, "مركز الإشعارات")
                            }
                        }
                        IconButton(onClick = { scope.launch { AppState.lock() } }) { Icon(Icons.Outlined.Lock, "قفل وتبديل الموظف") }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                )
            },
            containerColor = MaterialTheme.colorScheme.background,
        ) { pad ->
            androidx.compose.foundation.layout.Box(Modifier.padding(pad).fillMaxSize()) {
                when (current.key) {
                    "dashboard" -> DashboardPage(go)
                    "assistant" -> AssistantPage()
                    "analytics" -> AnalyticsPage()
                    "invoices" -> InvoicesPage()
                    "customers" -> CustomersPage()
                    "vault" -> VaultPage()
                    "products" -> ProductsPage()
                    "shortages" -> ShortagesPage()
                    "repairs" -> RepairsPage()
                    "isp" -> IspPage()
                    "whatsapp" -> WhatsAppPage()
                    "returns" -> ReturnsPage()
                    "expenses" -> ExpensesPage()
                    "shipping" -> ShippingPage()
                    "employees" -> EmployeesPage()
                    "sessions" -> SessionsPage()
                    "notifications" -> InboxPage()
                    else -> SettingsPage()
                }
            }
        }
    }
}
