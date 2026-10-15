import ExpoModulesCore
import UIKit

/**
 * Copies secrets with UIPasteboard.OptionsKey.localOnly + expirationDate so
 * Universal Clipboard / Handoff never syncs API keys to other devices.
 * Also marks filesystem paths as excluded from iCloud / device backups.
 */
public class ClawqlSecureClipboardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClawqlSecureClipboard")

    AsyncFunction("setSecretAsync") { (text: String, ttlMs: Double) -> Bool in
      let ttlSeconds = max(1.0, ttlMs / 1000.0)
      let expiration = Date(timeIntervalSinceNow: ttlSeconds)
      UIPasteboard.general.setItems(
        [[UIPasteboard.typeAutomatic: text]],
        options: [
          .localOnly: true,
          .expirationDate: expiration,
        ]
      )
      return true
    }

    AsyncFunction("excludeFromBackupAsync") { (path: String) -> Bool in
      var url = URL(fileURLWithPath: path)
      if path.hasPrefix("file://"), let parsed = URL(string: path) {
        url = parsed
      }
      do {
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try url.setResourceValues(resourceValues)
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("isAvailableAsync") { () -> Bool in
      return true
    }
  }
}
