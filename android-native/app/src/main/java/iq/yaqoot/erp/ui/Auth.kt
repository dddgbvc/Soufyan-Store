package iq.yaqoot.erp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.Backspace
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import iq.yaqoot.erp.core.Api
import iq.yaqoot.erp.core.ApiException
import iq.yaqoot.erp.core.AppState
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun Brand() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        BrandMark(80.dp)
        Spacer(Modifier.height(14.dp))
        Text("متابعة", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Yq.deepGold)
        Text("مكتب سفيان للموبايل", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
        Text("SUFYAN MOBILE", fontSize = 12.sp, letterSpacing = 5.sp, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
fun Splash() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Brand() }
}

@Composable
private fun AuthFrame(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 420.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Brand() }
            Spacer(Modifier.height(18.dp))
            content()
        }
    }
}

// ------------------------------------------------------------------ عنوان الخادم (إن لم يُضمَّن وقت البناء)
@Composable
fun ServerSetup() {
    var url by remember { mutableStateOf("https://") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AuthFrame {
        Text("عنوان الخادم", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text("أدخل رابط خادم المحل مرة واحدة.")
        Input(url, { url = it }, "https://…", keyboard = KeyboardType.Uri, ltr = true)
        ErrorText(error)
        Button(onClick = {
            try {
                Api.setBaseUrl(url)
                scope.launch { AppState.refresh() }
            } catch (e: Exception) {
                error = e.message
            }
        }, modifier = Modifier.fillMaxWidth().height(50.dp)) { Text("متابعة") }
    }
}

// ------------------------------------------------------------------ دخول المحل
@Composable
fun StoreLogin() {
    var email by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var hide by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                val r = Api.storeLogin(email.trim().lowercase(), pass)
                pass = ""
                AppState.storeName = r["store_name"]?.toString().orEmpty()
                AppState.message = null
                AppState.phase = AppState.Phase.Locked
            } catch (e: Exception) {
                error = e.message
            }
            busy = false
        }
    }

    AuthFrame {
        Text("دخول المحل", fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text("سجّل بحساب مالك المحل مرة واحدة على هذا الهاتف. بعدها يدخل كل موظف برمزه فقط.", color = MaterialTheme.colorScheme.outline)
        OutlinedTextField(
            email, { email = it }, label = { Text("البريد الإلكتروني") }, leadingIcon = { Icon(Icons.Outlined.AlternateEmail, null) },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            pass, { pass = it }, label = { Text("كلمة المرور") }, leadingIcon = { Icon(Icons.Outlined.Lock, null) },
            trailingIcon = { IconButton(onClick = { hide = !hide }) { Icon(if (hide) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff, if (hide) "إظهار" else "إخفاء") } },
            visualTransformation = if (hide) PasswordVisualTransformation() else VisualTransformation.None,
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { submit() }),
            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
        )
        ErrorText(error)
        Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (busy) Busy() else { Icon(Icons.Outlined.Storefront, null); Spacer(Modifier.size(8.dp)); Text("تفعيل هذا الهاتف للمحل") }
        }
        Text("كلمة المرور لا تُحفظ. يُحفظ مفتاح تفعيل مشفّر في مخزن الهاتف الآمن.", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
    }
}

// ------------------------------------------------------------------ PIN
@Composable
fun PinScreen() {
    var pin by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(AppState.message) }
    val shake = remember { Animatable(0f) }
    val haptic = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()

    fun press(d: String) {
        if (busy || pin.length >= 8) return
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        pin += d
        error = null
    }

    fun submit() {
        if (busy || pin.length < 4) return
        busy = true
        scope.launch {
            try {
                AppState.apply(Api.pin(pin), forceActive = true)
            } catch (e: ApiException) {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                if (e.reason == "unpaired") {
                    AppState.signOutStore()
                } else {
                    error = e.message
                    pin = ""
                    shake.snapTo(0f)
                    for (x in listOf(10f, -10f, 7f, -7f, 3f, 0f)) shake.animateTo(x)
                }
            } catch (e: Exception) {
                error = e.message
                pin = ""
            }
            busy = false
        }
    }

    AuthFrame {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            AssistChip(onClick = {}, label = { Text(AppState.storeName) }, leadingIcon = { Icon(Icons.Outlined.Storefront, null, Modifier.size(18.dp)) })
        }
        Text("أدخل رمزك", fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text("رمز PIN يحدد هويتك وصلاحياتك في المحل.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.outline, modifier = Modifier.fillMaxWidth())
        androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.offset { IntOffset(shake.value.roundToInt() * 2, 0) }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    repeat(maxOf(4, pin.length)) { i ->
                        val on = i < pin.length
                        Box(
                            Modifier.size(15.dp).background(if (on) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent, CircleShape)
                                .border(2.dp, if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, CircleShape),
                        )
                    }
                }
                Box(Modifier.height(30.dp), contentAlignment = Alignment.Center) { error?.let { Text(it, color = Yq.red) } }
                for (r in listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"))) {
                    Row { r.forEach { d -> PinKey(Modifier.weight(1f), onClick = { press(d) }) { Text(d, fontSize = 24.sp, fontWeight = FontWeight.SemiBold) } } }
                }
                Row {
                    PinKey(Modifier.weight(1f), enabled = pin.isNotEmpty(), onClick = { pin = pin.dropLast(1) }) { Icon(Icons.Outlined.Backspace, "حذف") }
                    PinKey(Modifier.weight(1f), onClick = { press("0") }) { Text("0", fontSize = 24.sp, fontWeight = FontWeight.SemiBold) }
                    Box(Modifier.weight(1f).padding(5.dp)) {
                        Button(onClick = { submit() }, enabled = pin.length >= 4 && !busy, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().height(62.dp)) {
                            if (busy) Busy() else Icon(Icons.AutoMirrored.Filled.ArrowForward, "دخول", Modifier.size(28.dp))
                        }
                    }
                }
            }
        }
        TextButton(onClick = {
            scope.launch {
                if (Ui.confirm("الخروج من حساب المحل؟", "سيُلغى تفعيل هذا الهاتف ويحتاج حساب المالك من جديد.", "خروج", danger = true)) AppState.signOutStore()
            }
        }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.AutoMirrored.Filled.Logout, null, Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("الخروج من حساب المحل")
        }
    }
}

@Composable
private fun PinKey(modifier: Modifier, enabled: Boolean = true, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(modifier.padding(5.dp)) {
        OutlinedButton(onClick = onClick, enabled = enabled, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().height(62.dp)) { content() }
    }
}
