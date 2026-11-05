package app.spektrafilm.lab

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

object ExportGallery {
    private const val INDEX = "spektra-exports.json"
    private const val THUMBS = "export-thumbs"
    private const val CAP = 60
    private const val EDGE = 176

    @JvmStatic
    fun record(ctx: Context, name: String, uri: Uri?, w: Int, h: Int, bmp: Bitmap?) {
        try {
            val id = System.currentTimeMillis().toString(36) + "-" + (name.hashCode() and 0xffff).toString(16)
            if (bmp != null && !bmp.isRecycled) writeThumb(ctx, id, bmp)
            val arr = readIndex(ctx)
            val item = JSONObject()
            item.put("id", id)
            item.put("name", name)
            item.put("uri", uri?.toString() ?: "")
            item.put("w", w)
            item.put("h", h)
            item.put("t", System.currentTimeMillis())
            val next = JSONArray()
            next.put(item)
            var n = 1
            for (i in 0 until arr.length()) {
                if (n >= CAP) break
                val row = arr.optJSONObject(i) ?: continue
                if (row.optString("uri") == item.optString("uri") && item.optString("uri").isNotEmpty()) continue
                next.put(row)
                n++
            }
            writeIndex(ctx, next)
        } catch (_: Throwable) {
        }
    }

    @JvmStatic
    fun listJson(ctx: Context): JSONArray {
        val arr = readIndex(ctx)
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val row = arr.optJSONObject(i) ?: continue
            val copy = JSONObject(row.toString())
            val id = copy.optString("id")
            val thumb = readThumbB64(ctx, id)
            if (thumb != null) copy.put("thumb", thumb)
            out.put(copy)
        }
        return out
    }

    @JvmStatic
    fun loadPreview(ctx: Context, uriStr: String?, maxEdge: Int): ByteArray? {
        if (uriStr.isNullOrBlank()) return null
        return try {
            val uri = Uri.parse(uriStr)
            val (bw, bh) = boundsSafe(ctx, uri)
            val long = maxOf(1, bw, bh)
            var sample = 1
            val cap = maxEdge.coerceIn(320, 1600)
            while (long / sample > cap * 2) sample *= 2
            ctx.contentResolver.openInputStream(uri)?.use { ins ->
                val opts = BitmapFactory.Options().apply { inSampleSize = sample }
                val bmp = BitmapFactory.decodeStream(ins, null, opts) ?: return null
                try {
                    val os = ByteArrayOutputStream(1 shl 18)
                    if (!bmp.compress(Bitmap.CompressFormat.JPEG, 86, os)) return null
                    os.toByteArray()
                } finally {
                    bmp.recycle()
                }
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun boundsSafe(ctx: Context, uri: Uri): Pair<Int, Int> {
        return try {
            ctx.contentResolver.openInputStream(uri)?.use { ins ->
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeStream(ins, null, o)
                (o.outWidth to o.outHeight)
            } ?: (1 to 1)
        } catch (_: Throwable) {
            1 to 1
        }
    }

    private fun writeThumb(ctx: Context, id: String, src: Bitmap) {
        val dir = File(ctx.filesDir, THUMBS)
        if (!dir.exists()) dir.mkdirs()
        val long = maxOf(src.width, src.height).coerceAtLeast(1)
        val scale = EDGE.toFloat() / long
        val w = (src.width * scale).toInt().coerceAtLeast(1)
        val h = (src.height * scale).toInt().coerceAtLeast(1)
        val thumb = try {
            Bitmap.createScaledBitmap(src, w, h, true)
        } catch (_: Throwable) {
            return
        }
        try {
            FileOutputStream(File(dir, "$id.jpg")).use { os ->
                thumb.compress(Bitmap.CompressFormat.JPEG, 70, os)
            }
        } catch (_: Throwable) {
        } finally {
            if (thumb !== src) {
                try {
                    thumb.recycle()
                } catch (_: Throwable) {
                }
            }
        }
    }

    private fun readThumbB64(ctx: Context, id: String): String? {
        if (id.isEmpty()) return null
        val f = File(File(ctx.filesDir, THUMBS), "$id.jpg")
        if (!f.exists() || f.length() < 32) return null
        return try {
            FileInputStream(f).use { Base64.encodeToString(it.readBytes(), Base64.NO_WRAP) }
        } catch (_: Throwable) {
            null
        }
    }

    private fun readIndex(ctx: Context): JSONArray {
        val f = File(ctx.filesDir, INDEX)
        if (!f.exists() || f.length() < 2) return JSONArray()
        return try {
            FileInputStream(f).use { JSONArray(String(it.readBytes(), Charsets.UTF_8)) }
        } catch (_: Throwable) {
            JSONArray()
        }
    }

    private fun writeIndex(ctx: Context, arr: JSONArray) {
        val f = File(ctx.filesDir, INDEX)
        FileOutputStream(f).use { it.write(arr.toString().toByteArray(Charsets.UTF_8)) }
    }
}
