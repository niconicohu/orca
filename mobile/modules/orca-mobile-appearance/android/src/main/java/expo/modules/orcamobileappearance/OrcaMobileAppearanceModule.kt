package expo.modules.orcamobileappearance

import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.Window
import androidx.core.view.WindowCompat
import com.facebook.react.views.modal.ReactModalHostView
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OrcaMobileAppearanceModule : Module() {
  private var light: Boolean? = null
  private var background: Int? = null
  override fun definition() = ModuleDefinition {
    Name("OrcaMobileAppearance")
    AsyncFunction("setColorScheme") { scheme: String, surface: String ->
      light = scheme != "dark"
      background = Color.parseColor(surface)
      applyWindowAppearance()
    }.runOnQueue(Queues.MAIN)
    OnActivityEntersForeground {
      // Expo can replay the current lifecycle while registering a module on the JS thread.
      appContext.currentActivity?.runOnUiThread { applyWindowAppearance() }
    }
  }

  private fun applyWindowAppearance() {
    val activity = appContext.currentActivity ?: return
    val lightSurface = light ?: (activity.resources.configuration.uiMode
      .and(android.content.res.Configuration.UI_MODE_NIGHT_MASK) != android.content.res.Configuration.UI_MODE_NIGHT_YES)
    updateWindow(activity.window, lightSurface)
    background?.let { activity.window.decorView.setBackgroundColor(it) }
    updateDialogs(activity.window.decorView, lightSurface)
  }

  private fun updateDialogs(view: View, lightSurface: Boolean) {
    if (view is ReactModalHostView) {
      view.dialog?.window?.let { updateWindow(it, lightSurface) }
    }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) updateDialogs(view.getChildAt(index), lightSurface)
    }
  }

  @Suppress("DEPRECATION")
  private fun updateWindow(window: Window, lightSurface: Boolean) {
    // The platform contrast scrim otherwise keeps the navigation bar light after a theme change.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = false
    window.navigationBarColor = Color.TRANSPARENT
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = lightSurface
  }
}
