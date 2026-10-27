package com.example.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme = darkColorScheme(
    primary = ElectricLime,
    onPrimary = SpaceBlack,
    secondary = CyberTeal,
    onSecondary = SpaceBlack,
    tertiary = HotOrange,
    background = SpaceBlack,
    surface = NavyCardBg,
    onBackground = PureWhite,
    onSurface = PureWhite,
    surfaceVariant = DarkGreyNavy,
    onSurfaceVariant = SoftGrey,
    outline = NavyLightBorder
)

private val LightColorScheme = lightColorScheme(
    primary = ElectricLime,
    onPrimary = SpaceBlack,
    secondary = CyberTeal,
    onSecondary = SpaceBlack,
    tertiary = HotOrange,
    background = SpaceBlack, // Force dark theme for sporty look, or use a clean light setup if necessary.
    surface = NavyCardBg,     // Forcing Dark Theme because sports complexes, glowing fields & stadium lights
    onBackground = PureWhite, // look 10x more premium and professional in dark mode.
    onSurface = PureWhite,
    surfaceVariant = DarkGreyNavy,
    onSurfaceVariant = SoftGrey,
    outline = NavyLightBorder
)

@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = true, // Force Dark Theme for standard stunning high-energy sporty aesthetic
    dynamicColor: Boolean = false, // Keep signature Electric Lime branding rather than system color
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
