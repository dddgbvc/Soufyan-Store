package iq.yaqoot.erp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.lifecycleScope
import iq.yaqoot.erp.core.AppState
import iq.yaqoot.erp.ui.ErrorView
import iq.yaqoot.erp.ui.PinScreen
import iq.yaqoot.erp.ui.ServerSetup
import iq.yaqoot.erp.ui.Shell
import iq.yaqoot.erp.ui.Splash
import iq.yaqoot.erp.ui.StoreLogin
import iq.yaqoot.erp.ui.SufyanTheme
import iq.yaqoot.erp.ui.Ui
import iq.yaqoot.erp.ui.UiHost
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        route(intent)
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                SufyanTheme {
                    LaunchedEffect(Unit) { AppState.boot() }
                    UiHost {
                        androidx.compose.foundation.layout.Box(
                            Modifier.fillMaxSize().pointerInput(Unit) {
                                awaitPointerEventScope {
                                    while (true) {
                                        awaitPointerEvent(PointerEventPass.Initial)
                                        AppState.touch()
                                    }
                                }
                            },
                        ) {
                            when (AppState.phase) {
                                AppState.Phase.Loading -> Splash()
                                AppState.Phase.Setup -> ServerSetup()
                                AppState.Phase.Unpaired -> StoreLogin()
                                AppState.Phase.Locked -> PinScreen()
                                AppState.Phase.Active -> Shell()
                                AppState.Phase.Error -> Scaffold { p ->
                                    androidx.compose.foundation.layout.Box(Modifier.safeDrawingPadding()) {
                                        ErrorView(AppState.message ?: "تعذر الاتصال") { lifecycleScope.launch { AppState.refresh() } }
                                    }
                                    p.toString()
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        route(intent)
    }

    override fun onResume() {
        super.onResume()
        Ui.context = this
        if (AppState.phase == AppState.Phase.Active && AppState.idleExpired()) {
            lifecycleScope.launch { AppState.lock("قُفلت الشاشة تلقائياً بعد فترة خمول.") }
        }
    }

    private fun route(i: Intent?) {
        i?.getStringExtra("route")?.takeIf { it.startsWith("/#") }?.let { AppState.pendingRoute = it }
    }
}
