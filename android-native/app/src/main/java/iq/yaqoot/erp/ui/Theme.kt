package iq.yaqoot.erp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import iq.yaqoot.erp.R
import iq.yaqoot.erp.core.AppState

/** ألوان الشعار: كحلي #14343F، ذهبي #C8A969، عاجي #F1EDE4. */
object Yq {
    val navy = Color(0xFF14343F)
    val cream = Color(0xFFF1EDE4)
    val gold = Color(0xFFC8A969)
    val deepGold = Color(0xFFA88848)
    val red = Color(0xFFC0645A)
    val green = Color(0xFF4C8C63)
    val blue = Color(0xFF5E7FA0)
    val purple = Color(0xFF8E7FA6)
    val amber = Color(0xFFB9934F)
    val whatsapp = Color(0xFF25A35A)
}

val Cairo = FontFamily(
    Font(R.font.cairo_regular, FontWeight.Normal),
    Font(R.font.cairo_medium, FontWeight.Medium),
    Font(R.font.cairo_semibold, FontWeight.SemiBold),
    Font(R.font.cairo_bold, FontWeight.Bold),
)

private fun typography(): Typography {
    val t = Typography()
    fun TextStyle.c() = copy(fontFamily = Cairo)
    return Typography(
        displayLarge = t.displayLarge.c(), displayMedium = t.displayMedium.c(), displaySmall = t.displaySmall.c(),
        headlineLarge = t.headlineLarge.c(), headlineMedium = t.headlineMedium.c(), headlineSmall = t.headlineSmall.c(),
        titleLarge = t.titleLarge.c().copy(fontWeight = FontWeight.Bold), titleMedium = t.titleMedium.c().copy(fontWeight = FontWeight.SemiBold), titleSmall = t.titleSmall.c(),
        bodyLarge = t.bodyLarge.c(), bodyMedium = t.bodyMedium.c(), bodySmall = t.bodySmall.c(),
        labelLarge = t.labelLarge.c().copy(fontWeight = FontWeight.SemiBold), labelMedium = t.labelMedium.c(), labelSmall = t.labelSmall.c(),
    )
}

// الوضع الداكن أسود حقيقي، والفاتح أبيض نظيف، والكحلي لون التمييز.
private val light = lightColorScheme(
    primary = Yq.navy, onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE7EA), onPrimaryContainer = Yq.navy,
    secondary = Yq.gold, onSecondary = Color.Black,
    background = Color(0xFFF7F7F7), onBackground = Color(0xFF111111),
    surface = Color.White, onSurface = Color(0xFF111111),
    surfaceVariant = Color(0xFFF0F0F2), onSurfaceVariant = Color(0xFF5A5A60),
    surfaceContainer = Color.White, surfaceContainerLow = Color.White, surfaceContainerHigh = Color(0xFFF2F2F4),
    surfaceContainerHighest = Color(0xFFECECEF), surfaceContainerLowest = Color.White,
    outline = Color(0xFF8A8A90), outlineVariant = Color(0xFFE5E5EA),
    error = Yq.red,
)

private val dark = darkColorScheme(
    primary = Color(0xFF86AEBD), onPrimary = Color.Black,
    primaryContainer = Color(0xFF1B3640), onPrimaryContainer = Color(0xFFD7E6EB),
    secondary = Yq.gold, onSecondary = Color.Black,
    background = Color.Black, onBackground = Color(0xFFF2F2F2),
    surface = Color.Black, onSurface = Color(0xFFF2F2F2),
    surfaceVariant = Color(0xFF1C1C1E), onSurfaceVariant = Color(0xFFA8A8AE),
    surfaceContainer = Color(0xFF1C1C1E), surfaceContainerLow = Color(0xFF121214), surfaceContainerHigh = Color(0xFF242426),
    surfaceContainerHighest = Color(0xFF2C2C2E), surfaceContainerLowest = Color.Black,
    outline = Color(0xFF8E8E93), outlineVariant = Color(0xFF2C2C2E),
    error = Color(0xFFE08A80),
)

@Composable
fun SufyanTheme(content: @Composable () -> Unit) {
    val darkMode = when (AppState.theme) {
        AppState.Theme.Dark -> true
        AppState.Theme.Light -> false
        AppState.Theme.System -> isSystemInDarkTheme()
    }
    MaterialTheme(colorScheme = if (darkMode) dark else light, typography = typography(), content = content)
}
