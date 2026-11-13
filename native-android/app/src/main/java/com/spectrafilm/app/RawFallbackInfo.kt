/* Camera RAW fallback diagnostics. GPLv3. */
package com.spectrafilm.app

import com.spectrafilm.libraw.DecodeStatus
import com.spectrafilm.libraw.RawDecodeException

/** Carries a real decoder verdict to UI without guessing the camera's container format. */
internal data class RawFallbackInfo(
    val status: DecodeStatus,
    val librawCode: Int,
    val nativeMessage: String,
    val sourceUri: String? = null,
) {
    val reason: String get() = when (status) {
        DecodeStatus.NO_MEMORY -> "Не хватило памяти для RAW-декодирования."
        DecodeStatus.FILE_UNSUPPORTED -> "LibRaw не распознал этот вариант RAW."
        DecodeStatus.PRECISION_METADATA -> "Не удалось безопасно сопоставить метаданные RAW."
        DecodeStatus.DEFLATE_DNG -> "Не поддерживается этот способ хранения данных DNG."
        DecodeStatus.LOSSY_JPEG_DNG -> "Не удалось декодировать JPEG-сжатие внутри DNG."
        DecodeStatus.JPEGXL_DNG -> "Для JPEG XL внутри DNG нужен другой декодер."
        else -> "Основной RAW-декодер недоступен для этого предпросмотра."
    }
    val details: String get() = "Код: ${status.name} (${status.code}), LibRaw: $librawCode\n$nativeMessage"

    companion object {
        fun from(failure: RawDecodeException) = RawFallbackInfo(
            failure.status, failure.librawCode, failure.message.orEmpty().take(2000),
        )
        fun cached() = RawFallbackInfo(DecodeStatus.UNKNOWN, 0, "Предпросмотр восстановлен из кэша без причины первоначального отказа RAW-декодера.")
    }
}

/** A transient refusal must not pin a platform preview as a successful native RAW decode. */
internal fun rawProxyCanPersist(usedPlatformFallback: Boolean, memoryDegraded: Boolean): Boolean =
    !usedPlatformFallback && !memoryDegraded
