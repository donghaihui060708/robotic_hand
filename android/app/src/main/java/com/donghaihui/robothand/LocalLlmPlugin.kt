package com.donghaihui.robothand

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@CapacitorPlugin(name = "LocalLlm")
class LocalLlmPlugin : Plugin() {
    companion object {
        private const val MODEL_NAME = "Qwen2.5 1.5B Instruct Q4_K_M"
        private const val MODEL_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
        private const val MODEL_URL =
            "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/$MODEL_FILE?download=true"
        private const val PREFS = "local_llm"
        private const val DOWNLOAD_ID = "download_id"
        private const val MIN_MODEL_BYTES = 900L * 1024L * 1024L
        private const val BASE_SYSTEM_PROMPT =
            "You are the offline inference engine for a robotic hand. Follow the instructions in each user message exactly. Return only the requested answer, with no markdown fences."
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val engine by lazy { AiChat.getInferenceEngine(context.applicationContext) }
    @Volatile private var modelLoaded = false

    private fun modelDirectory(): File =
        File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "models").apply { mkdirs() }

    private fun modelFile(): File = File(modelDirectory(), MODEL_FILE)

    private fun downloadManager(): DownloadManager =
        context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    private fun savedDownloadId(): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(DOWNLOAD_ID, -1L)

    private fun saveDownloadId(id: Long) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putLong(DOWNLOAD_ID, id).apply()
    }

    private fun statusObject(): JSObject {
        val file = modelFile()
        val installed = file.isFile && file.length() >= MIN_MODEL_BYTES
        val result = JSObject()
            .put("modelName", MODEL_NAME)
            .put("fileName", MODEL_FILE)
            .put("installed", installed)
            .put("loaded", modelLoaded)
            .put("bytes", if (file.isFile) file.length() else 0L)
            .put("status", if (installed) "installed" else "not_installed")

        val id = savedDownloadId()
        if (id < 0) return result

        downloadManager().query(DownloadManager.Query().setFilterById(id)).use { cursor ->
            if (!cursor.moveToFirst()) return@use
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            result.put("downloadedBytes", downloaded).put("totalBytes", total)
            when (status) {
                DownloadManager.STATUS_PENDING -> result.put("installed", false).put("status", "pending")
                DownloadManager.STATUS_RUNNING -> result.put("installed", false).put("status", "downloading")
                DownloadManager.STATUS_PAUSED -> result.put("installed", false).put("status", "paused")
                DownloadManager.STATUS_SUCCESSFUL -> result.put("status", if (installed) "installed" else "failed")
                DownloadManager.STATUS_FAILED -> {
                    val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                    result.put("installed", false).put("status", "failed").put("error", "Download failed ($reason)")
                }
            }
        }
        return result
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        try {
            call.resolve(statusObject())
        } catch (error: Exception) {
            call.reject(error.message ?: "Could not read local model status.", error)
        }
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        try {
            val existing = statusObject().getString("status")
            if (existing == "downloading" || existing == "pending" || existing == "installed") {
                call.resolve(statusObject())
                return
            }

            val target = modelFile()
            if (target.exists()) target.delete()
            val request = DownloadManager.Request(Uri.parse(MODEL_URL))
                .setTitle(MODEL_NAME)
                .setDescription("Offline AI model for Robotic Hand")
                .setMimeType("application/octet-stream")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationUri(Uri.fromFile(target))
            saveDownloadId(downloadManager().enqueue(request))
            call.resolve(statusObject())
        } catch (error: Exception) {
            call.reject(error.message ?: "Could not start model download.", error)
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        val id = savedDownloadId()
        if (id >= 0) downloadManager().remove(id)
        saveDownloadId(-1L)
        modelFile().delete()
        call.resolve(statusObject())
    }

    @PluginMethod
    fun loadModel(call: PluginCall) {
        val file = modelFile()
        if (!file.isFile || file.length() < MIN_MODEL_BYTES) {
            call.reject("Download the local model first.")
            return
        }

        scope.launch {
            try {
                if (!modelLoaded) {
                    engine.state.first {
                        it is InferenceEngine.State.Initialized ||
                            it is InferenceEngine.State.ModelReady ||
                            it is InferenceEngine.State.Error
                    }
                    if (engine.state.value is InferenceEngine.State.Error) engine.cleanUp()
                    if (engine.state.value is InferenceEngine.State.Initialized) {
                        engine.loadModel(file.absolutePath)
                        engine.setSystemPrompt(BASE_SYSTEM_PROMPT)
                    }
                    modelLoaded = engine.state.value is InferenceEngine.State.ModelReady
                }
                withContext(Dispatchers.Main) { call.resolve(statusObject()) }
            } catch (error: Exception) {
                modelLoaded = false
                withContext(Dispatchers.Main) {
                    call.reject(error.message ?: "Could not load the local model.", error)
                }
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val prompt = call.getString("prompt")?.trim().orEmpty()
        val maxTokens = (call.getInt("maxTokens") ?: 384).coerceIn(32, 1024)
        if (prompt.isEmpty()) {
            call.reject("Prompt cannot be empty.")
            return
        }
        if (!modelLoaded || engine.state.value !is InferenceEngine.State.ModelReady) {
            call.reject("Local model is not loaded.")
            return
        }

        scope.launch {
            try {
                val response = engine.sendUserPrompt(prompt, maxTokens).toList().joinToString("")
                withContext(Dispatchers.Main) {
                    call.resolve(JSObject().put("text", response))
                }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) {
                    call.reject(error.message ?: "Local inference failed.", error)
                }
            }
        }
    }

    @PluginMethod
    fun unloadModel(call: PluginCall) {
        scope.launch {
            try {
                if (modelLoaded) engine.cleanUp()
                modelLoaded = false
                withContext(Dispatchers.Main) { call.resolve(statusObject()) }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { call.reject(error.message ?: "Could not unload model.", error) }
            }
        }
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        scope.launch {
            try {
                if (modelLoaded) engine.cleanUp()
                modelLoaded = false
                val id = savedDownloadId()
                if (id >= 0) downloadManager().remove(id)
                saveDownloadId(-1L)
                modelFile().delete()
                withContext(Dispatchers.Main) { call.resolve(statusObject()) }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { call.reject(error.message ?: "Could not delete model.", error) }
            }
        }
    }
}
