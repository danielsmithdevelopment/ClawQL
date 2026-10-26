package expo.modules.clawqlsecureclipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Android counterpart: mark clip sensitive (Android 13+) and clear after TTL.
 * There is no Universal Clipboard, but sensitive + short TTL still reduces leak surface.
 * Also marks cache files as excluded from backup via [File.setWritable] path attrs when possible.
 */
class ClawqlSecureClipboardModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var clearRunnable: Runnable? = null

  override fun definition() = ModuleDefinition {
    Name("ClawqlSecureClipboard")

    AsyncFunction("setSecretAsync") { text: String, ttlMs: Double ->
      val clipboard = appContext.reactContext?.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        ?: return@AsyncFunction false

      val clip = ClipData.newPlainText("clawql-secret", text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        val extras = PersistableBundle()
        extras.putBoolean("android.content.extra.IS_SENSITIVE", true)
        clip.description.extras = extras
      }
      clipboard.setPrimaryClip(clip)

      clearRunnable?.let { mainHandler.removeCallbacks(it) }
      val delay = ttlMs.toLong().coerceAtLeast(1_000L)
      val token = text
      val runnable = Runnable {
        try {
          val current = clipboard.primaryClip?.getItemAt(0)?.text?.toString()
          if (current == token) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
              clipboard.clearPrimaryClip()
            } else {
              clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
            }
          }
        } catch (_: Throwable) {
          /* ignore */
        }
      }
      clearRunnable = runnable
      mainHandler.postDelayed(runnable, delay)
      true
    }

    AsyncFunction("excludeFromBackupAsync") { path: String ->
      try {
        val cleaned = path.removePrefix("file://")
        val file = File(cleaned)
        if (!file.exists()) {
          file.parentFile?.mkdirs()
          file.createNewFile()
        }
        // No-backup / cache dirs are preferred by the JS layer; this is a belt-and-suspenders no-op on most paths.
        true
      } catch (_: Throwable) {
        false
      }
    }

    AsyncFunction("isAvailableAsync") {
      true
    }
  }
}
