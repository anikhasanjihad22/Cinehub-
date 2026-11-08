package com.cinehub

import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.File

/** JS side of CineHubLog: stores JS log lines and shares the log file. */
class CineHubLogModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    init {
        CineHubLog.init(reactContext.applicationContext)
    }

    override fun getName(): String = "CineHubLog"

    /** Each entry is [level, tag, message], with Android log levels. */
    @ReactMethod
    fun writeBatch(entries: ReadableArray) {
        for (i in 0 until entries.size()) {
            val entry = entries.getArray(i) ?: continue
            if (entry.size() < 3) continue
            CineHubLog.fromJs(
                entry.getInt(0).coerceIn(Log.VERBOSE, Log.ASSERT),
                entry.getString(1) ?: "JS",
                entry.getString(2) ?: "",
            )
        }
    }

    @ReactMethod
    fun setDetailed(enabled: Boolean) {
        CineHubLog.detailed = enabled
    }

    @ReactMethod
    fun clear(promise: Promise) {
        CineHubLog.clear()
        promise.resolve(null)
    }

    /** Writes the logs with a device header to the cache and opens the share sheet. */
    @ReactMethod
    fun share(extraHeader: String?, promise: Promise) {
        Thread {
            try {
                val context = reactApplicationContext
                val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                val header = buildString {
                    appendLine("CineHub ${packageInfo.versionName} (${packageInfo.longVersionCodeCompat()})")
                    appendLine("Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
                    appendLine("Device ${Build.MANUFACTURER} ${Build.MODEL}")
                    appendLine("Detailed logging ${if (CineHubLog.detailed) "on" else "off"}")
                    if (!extraHeader.isNullOrBlank()) appendLine(CineHubLog.sanitize(extraHeader))
                    appendLine("----")
                }
                val file = File(context.cacheDir, "cinehub-logs.txt")
                file.writeText(header + CineHubLog.readAll())
                val uri = FileProvider.getUriForFile(
                    context, "${context.packageName}.FileSystemFileProvider", file,
                )
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, "CineHub logs")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(send, "Share CineHub logs").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                (context.currentActivity ?: context).startActivity(chooser)
                promise.resolve(null)
            } catch (e: Exception) {
                CineHubLog.w("CineHubLog", "Log export failed", e)
                promise.reject("LOG_EXPORT_ERROR", e.message, e)
            }
        }.start()
    }

    private fun android.content.pm.PackageInfo.longVersionCodeCompat(): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) longVersionCode
        else @Suppress("DEPRECATION") versionCode.toLong()
}
