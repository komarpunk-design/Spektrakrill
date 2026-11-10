package app.spektrafilm.lab

import com.spectrafilm.engine.CameraParams
import com.spectrafilm.engine.ColorSpace
import com.spectrafilm.engine.DiffusionFilterParams
import com.spectrafilm.engine.DirCouplersParams
import com.spectrafilm.engine.EnlargerParams
import com.spectrafilm.engine.FilmRenderingParams
import com.spectrafilm.engine.GlareParams
import com.spectrafilm.engine.GrainParams
import com.spectrafilm.engine.HalationParams
import com.spectrafilm.engine.InputGamutCompress
import com.spectrafilm.engine.IoParams
import com.spectrafilm.engine.OutputGamutCompress
import com.spectrafilm.engine.PrintCurvesMorphParams
import com.spectrafilm.engine.PrintRenderingParams
import com.spectrafilm.engine.Rgb2Raw
import com.spectrafilm.engine.ScannerParams
import com.spectrafilm.engine.SettingsParams
import com.spectrafilm.engine.SpektraParams
import com.spectrafilm.engine.ToneCurveChannel
import com.spectrafilm.engine.ToneCurveParams
import org.json.JSONArray
import org.json.JSONObject

/**
 * Marshals the darkroom UI JSON into GitHub SpektraParams (v0.10.0 named fields).
 *
 * Preview: spk_simulate_preview. GPU scan stage ON (etalon default), spectral
 * 3D LUTs ON (author's proxy-approximate path).
 *
 * Export: spk_simulate. Scanner/enlarger look-LUTs OFF (exact spectral integral).
 * gpuExport follows the UI (default ON) — Vulkan compute of the same stages with
 * on-device self-check and CPU fallback. Not a film-look cube.
 */
object ParamsBuilder {
    @JvmStatic
    @JvmOverloads
    fun fromJson(
        raw: JSONObject?,
        inputColorSpace: String?,
        inputCctf: Boolean,
        skipGrainHalation: Boolean = false,
        previewMaxSize: Int = 640,
        forExport: Boolean = false,
    ): SpektraParams {
        val p = raw ?: JSONObject()
        val uv = p.optDouble("filterUvAmount", 0.0).toFloat()
        val ir = p.optDouble("filterIrAmount", 0.0).toFloat()
        val grainOn = p.optBoolean("grainActive", true) && !skipGrainHalation
        val halationOn = p.optBoolean("halationActive", true) && !skipGrainHalation
        val dmin = p.optDouble("grainDensityMin", 0.07).toFloat()
        val uni = p.optDouble("grainUniformity", 0.97).toFloat()
        val glare = GlareParams(
            active = p.optBoolean("glareActive", true),
            percent = p.optDouble("glarePercent", 0.03).toFloat(),
            roughness = p.optDouble("glareRoughness", 0.7).toFloat(),
            blur = p.optDouble("glareBlur", 0.5).toFloat(),
        )
        val inCs = if (inputColorSpace.isNullOrBlank()) "ProPhoto RGB" else inputColorSpace
        val paperRaw = firstStr(p, "kodak_portra_endura", "printPaper", "printProfile", "print_profile")
        val paperOff = isBypass(paperRaw)
        val workflow = p.optJSONObject("experimental")?.optString("workflow", "normal") ?: "normal"
        val negative = workflow != "normal"
        val filmRaw = firstStr(p, "kodak_portra_400", "filmStock", "filmProfile", "film_profile")
        require(!negative || !isBypass(filmRaw)) { "Для конвертации негатива выберите цветную негативную плёнку" }
        require(workflow != "negative-print" || !paperOff) { "Для печати негатива выберите фотобумагу" }
        return SpektraParams(
            experimentalJson = JSONObject(p.optJSONObject("experimental")?.toString() ?: "{}").apply {
                if (optString("spectralMethod", "legacy") == "legacy" && p.optString("rgbToRawMethod", "hanatos2025") == "mallett2019") put("spectralMethod", "mallett2019")
                if (forExport) put("scanUseLut", false)
                put("printChemistry", p.optBoolean("chemistryActive", false))
                put("printGamma", p.optDouble("printGamma", 1.0))
                put("printFast", p.optDouble("printGammaFast", 1.0))
                put("printSlow", p.optDouble("printGammaSlow", 1.0))
                put("printRed", p.optDouble("printGammaR", 1.0))
                put("printGreen", p.optDouble("printGammaG", 1.0))
                put("printBlue", p.optDouble("printGammaB", 1.0))
                put("printExhaustion", p.optDouble("developerExhaustion", 0.0))
            }.toString(),
            filmProfile = firstStr(p, "kodak_portra_400", "filmStock", "filmProfile", "film_profile"),
            printProfile = if (paperOff) "kodak_portra_endura" else paperRaw,
            camera = CameraParams(
                exposureCompensationEv = p.optDouble("exposureCompensationEv", 0.0).toFloat(),
                autoExposure = p.optBoolean("autoExposure", true),
                autoExposureMethod = p.optString("autoExposureMethod", "center_weighted"),
                lensBlurUm = p.optDouble("cameraLensBlurUm", 0.0).toFloat(),
                filmFormatMm = p.optDouble("filmFormatMm", 35.0).toFloat(),
                filterUv = Triple(uv, 410f, 8f),
                filterIr = Triple(ir, 675f, 15f),
                diffusionFilter = diffusion(nested(p, "cameraDiffusion")),
            ),
            enlarger = EnlargerParams(
                illuminant = p.optString("printIlluminant", "TH-KG3"),
                printExposure = p.optDouble("printExposure", 1.0).toFloat(),
                printExposureCompensation = p.optBoolean("printExposureCompensation", true),
                normalizePrintExposure = true,
                yFilterShift = p.optDouble("printYFilterShift", 0.0).toFloat(),
                mFilterShift = p.optDouble("printMFilterShift", 0.0).toFloat(),
                yFilterNeutral = p.optDouble("printYFilterNeutral", 55.0).toFloat(),
                mFilterNeutral = p.optDouble("printMFilterNeutral", 65.0).toFloat(),
                cFilterNeutral = p.optDouble("printCFilterNeutral", 0.0).toFloat(),
                lensBlur = 0f,
                diffusionFilter = diffusion(nested(p, "printDiffusion")),
                preflashExposure = p.optDouble("preflashExposure", 0.0).toFloat(),
                preflashYFilterShift = p.optDouble("preflashYShift", 0.0).toFloat(),
                preflashMFilterShift = p.optDouble("preflashMShift", 0.0).toFloat(),
            ),
            scanner = ScannerParams(
                lensBlur = p.optDouble("scanLensBlur", 0.0).toFloat(),
                whiteCorrection = p.optBoolean("scanWhiteCorrection", false),
                blackCorrection = p.optBoolean("scanBlackCorrection", false),
                whiteLevel = p.optDouble("scanWhiteLevel", 0.98).toFloat(),
                blackLevel = p.optDouble("scanBlackLevel", 0.01).toFloat(),
                unsharpMask = p.optDouble("scanUnsharpSigma", 0.7).toFloat() to
                    p.optDouble("scanUnsharpAmount", 0.7).toFloat(),
            ),
            io = IoParams(
                inputColorSpace = inCs,
                inputCctfDecoding = inputCctf,
                outputColorSpace = if (forExport) outputCs(p) else ColorSpace.SRGB,
                outputCctfEncoding = if (forExport) true else p.optBoolean("outputCctf", true),
                outputGamutCompress = outputGamut(p),
                inputGamutCompress = if (p.optString("inputGamutCompress", "off") == "xy")
                    InputGamutCompress.XY else InputGamutCompress.OFF,
                crop = p.optBoolean("crop", false),
                cropCenter = p.optDouble("cropCenterX", 0.5).toFloat() to
                    p.optDouble("cropCenterY", 0.5).toFloat(),
                cropSize = p.optDouble("cropSizeX", 0.35).toFloat() to
                    p.optDouble("cropSizeY", 0.35).toFloat(),
                upscaleFactor = if (forExport) 1f else p.optDouble("upscaleFactor", 1.0).toFloat(),
                scanFilm = if (negative) workflow != "negative-print" else p.optBoolean("scanFilm", false) || paperOff,
            ),
            settings = SettingsParams(
                rgbToRawMethod = if (p.optString("rgbToRawMethod", "hanatos2025") == "mallett2019")
                    Rgb2Raw.MALLETT2019 else Rgb2Raw.HANATOS2025,
                applyHanatos2025AdaptationWindow = p.optBoolean("hanatosWindow", true),
                applyHanatos2025AdaptationSurface = p.optBoolean("hanatosSurface", false),
                spectralGaussianBlur = p.optDouble("spectralBlur", 0.0).toFloat(),
                // Preview: author's proxy-approximate path (spk_simulate_preview
                // forces both spectral 3D LUTs). Export stays exact — no look-LUT.
                useEnlargerLut = !forExport,
                useScannerLut = !forExport,
                lutResolution = p.optInt("lutResolution", 17).coerceIn(9, 33),
                previewMaxSize = previewMaxSize,
                neutralPrintFiltersFromDatabase = p.optBoolean("neutralPrintFilters", true),
                gpuPreview = if (forExport) false else p.optBoolean("gpuPreview", true),
                gpuExport = if (forExport) p.optBoolean("gpuExport", true) else false,
            ),
            filmRender = FilmRenderingParams(
                densityCurveGamma = p.optDouble("filmGamma", 1.0).toFloat(),
                grain = GrainParams(
                    active = grainOn,
                    sublayersActive = p.optBoolean("grainSublayers", true),
                    agxParticleAreaUm2 = p.optDouble("grainParticleArea", 0.2).toFloat(),
                    agxParticleScale = Triple(
                        p.optDouble("grainScaleR", 0.8).toFloat(),
                        p.optDouble("grainScaleG", 1.0).toFloat(),
                        p.optDouble("grainScaleB", 2.0).toFloat(),
                    ),
                    agxParticleScaleLayers = Triple(2.5f, 1.0f, 0.5f),
                    densityMin = Triple(dmin, 0.08f.coerceAtLeast(dmin), 0.12f.coerceAtLeast(dmin)),
                    uniformity = Triple(uni, (uni + 0.00f).coerceAtMost(1f), 0.99f.coerceAtMost(uni + 0.02f)),
                    blur = p.optDouble("grainBlur", 0.65).toFloat(),
                    blurDyeCloudsUm = p.optDouble("grainDyeCloudsUm", 1.0).toFloat(),
                    microStructure = 0.2f to 30f,
                    nSubLayers = p.optInt("grainSubLayersN", 1).coerceIn(1, 3),
                ),
                halation = HalationParams(
                    active = halationOn,
                    scatterAmount = p.optDouble("scatterAmount", 1.0).toFloat(),
                    scatterSpatialScale = p.optDouble("scatterSpatialScale", 1.0).toFloat(),
                    halationAmount = p.optDouble("halationAmount", 1.0).toFloat(),
                    halationSpatialScale = p.optDouble("halationSpatialScale", 1.0).toFloat(),
                    scatterCoreUm = vec3(p, "scatterCoreUm", 2.2f, 2.0f, 1.6f),
                    scatterTailUm = vec3(p, "scatterTailUm", 9.3f, 9.7f, 9.1f),
                    scatterTailWeight = vec3(p, "scatterTailWeight", 0.78f, 0.65f, 0.67f),
                    boostEv = p.optDouble("boostEv", 0.0).toFloat(),
                    boostRange = p.optDouble("boostRange", 0.3).toFloat(),
                    protectEv = p.optDouble("protectEv", 4.0).toFloat(),
                    halationStrength = vec3(p, "halationStrength", 0.05f, 0.015f, 0f),
                    halationFirstSigmaUm = vec3(p, "halationFirstSigmaUm", 65f, 65f, 65f),
                    halationNBounces = p.optInt("halationNBounces", 3),
                    halationBounceDecay = p.optDouble("halationBounceDecay", 0.5).toFloat(),
                    halationRenormalize = p.optBoolean("halationRenormalize", true),
                ),
                dirCouplers = DirCouplersParams(
                    active = p.optBoolean("couplersActive", true),
                    amount = p.optDouble("couplersAmount", 1.0).toFloat(),
                    inhibitionSamelayer = p.optDouble("inhibitionSamelayer", 1.0).toFloat(),
                    inhibitionInterlayer = p.optDouble("inhibitionInterlayer", 1.0).toFloat(),
                    gammaSamelayerRgb = vec3(p, "gammaSamelayer", 0.341f, 0.324f, 0.273f),
                    gammaInterlayerRToGb = pair(p, "gammaRtoGB", 0.355f, 0.305f),
                    gammaInterlayerGToRb = pair(p, "gammaGtoRB", 0.154f, 0.358f),
                    gammaInterlayerBToRg = pair(p, "gammaBtoRG", 0.171f, 0.225f),
                    diffusionSizeUm = p.optDouble("couplerDiffusionUm", 20.0).toFloat(),
                    diffusionTailUm = 200f,
                    diffusionTailWeight = 0.06f,
                ),
                glare = glare,
            ),
            printRender = PrintRenderingParams(
                densityCurveGamma = p.optDouble("printGamma", 1.0).toFloat(),
                glare = glare,
                densityCurvesMorph = PrintCurvesMorphParams(
                    active = p.optBoolean("chemistryActive", false),
                    gammaFactor = p.optDouble("printGamma", 1.0).toFloat(),
                    gammaFactorFast = p.optDouble("printGammaFast", 1.0).toFloat(),
                    gammaFactorSlow = p.optDouble("printGammaSlow", 1.0).toFloat(),
                    gammaFactorRed = p.optDouble("printGammaR", 1.0).toFloat(),
                    gammaFactorGreen = p.optDouble("printGammaG", 1.0).toFloat(),
                    gammaFactorBlue = p.optDouble("printGammaB", 1.0).toFloat(),
                    developerExhaustion = p.optDouble("developerExhaustion", 0.0).toFloat(),
                ),
            ),
            toneCurve = ToneCurveParams(
                active = p.optBoolean("toneCurveActive", false),
                master = toneChannel(p.optJSONArray("toneCurveMaster")),
                red = toneChannel(p.optJSONArray("toneCurveRed")),
                green = toneChannel(p.optJSONArray("toneCurveGreen")),
                blue = toneChannel(p.optJSONArray("toneCurveBlue")),
            ),
        )
    }

    private fun toneChannel(arr: JSONArray?): ToneCurveChannel {
        if (arr == null || arr.length() < 2) return ToneCurveChannel()
        val pts = ArrayList<Pair<Float, Float>>(arr.length())
        for (i in 0 until arr.length()) {
            val row = arr.optJSONArray(i) ?: continue
            if (row.length() < 2) continue
            pts.add(row.optDouble(0).toFloat() to row.optDouble(1).toFloat())
        }
        return ToneCurveChannel(pts)
    }

    private fun nested(p: JSONObject, key: String): JSONObject? {
        p.optJSONObject(key)?.let { return it }
        val raw = p.opt(key) ?: return null
        if (raw is JSONObject) return raw
        if (raw is Map<*, *>) {
            val out = JSONObject()
            for ((k, v) in raw) {
                if (k is String && v != null) out.put(k, v)
            }
            return out
        }
        if (raw is String) {
            val s = raw.trim()
            if (s.startsWith("{")) {
                return try {
                    JSONObject(s)
                } catch (_: Exception) {
                    null
                }
            }
        }
        return null
    }

    private fun diffusion(d: JSONObject?): DiffusionFilterParams {
        if (d == null) return DiffusionFilterParams()
        return DiffusionFilterParams(
            active = d.optBoolean("active", false),
            filterFamily = d.optString("family", d.optString("filter_family", "black_pro_mist")),
            strength = d.optDouble("strength", 0.5).toFloat(),
            spatialScale = d.optDouble("spatialScale", 1.0).toFloat(),
            haloWarmth = d.optDouble("haloWarmth", 0.0).toFloat(),
            coreIntensity = d.optDouble("coreIntensity", 1.0).toFloat(),
            coreSize = d.optDouble("coreSize", 1.0).toFloat(),
            haloIntensity = d.optDouble("haloIntensity", 1.0).toFloat(),
            haloSize = d.optDouble("haloSize", 1.0).toFloat(),
            bloomIntensity = d.optDouble("bloomIntensity", 1.0).toFloat(),
            bloomSize = d.optDouble("bloomSize", 1.0).toFloat(),
        )
    }

    private fun vec3(p: JSONObject, key: String, a: Float, b: Float, c: Float): Triple<Float, Float, Float> {
        val arr: JSONArray? = p.optJSONArray(key)
        if (arr != null && arr.length() >= 3) {
            return Triple(arr.optDouble(0, a.toDouble()).toFloat(), arr.optDouble(1, b.toDouble()).toFloat(), arr.optDouble(2, c.toDouble()).toFloat())
        }
        return Triple(a, b, c)
    }

    private fun pair(p: JSONObject, key: String, a: Float, b: Float): Pair<Float, Float> {
        val arr: JSONArray? = p.optJSONArray(key)
        if (arr != null && arr.length() >= 2) {
            return arr.optDouble(0, a.toDouble()).toFloat() to arr.optDouble(1, b.toDouble()).toFloat()
        }
        return a to b
    }

    private fun outputCs(p: JSONObject): ColorSpace {
        val raw = p.optString("exportColorSpace", "srgb")
            .lowercase()
            .replace("-", "_")
            .replace(" ", "_")
        return when (raw) {
            "adobe_rgb", "adobergb" -> ColorSpace.ADOBE_RGB
            "prophoto", "prophoto_rgb" -> ColorSpace.PROPHOTO
            "rec2020", "rec_2020", "bt2020" -> ColorSpace.REC2020
            "aces2065_1", "aces" -> ColorSpace.ACES2065_1
            "linear_srgb", "linearsrgb" -> ColorSpace.LINEAR_SRGB
            else -> ColorSpace.SRGB
        }
    }

    private fun outputGamut(p: JSONObject): OutputGamutCompress {
        val raw = p.optString("outputGamutCompress", "").lowercase()
        return when (raw) {
            "off" -> OutputGamutCompress.OFF
            "aces_rgc", "aces" -> OutputGamutCompress.ACES_RGC
            "oklch" -> OutputGamutCompress.OKLCH
            "oklrab" -> OutputGamutCompress.OKLRAB
            "jzazbz" -> OutputGamutCompress.JZAZBZ
            "cam16ucs", "cam16" -> OutputGamutCompress.CAM16UCS
            "legacy_clip", "legacy" -> OutputGamutCompress.LEGACY_CLIP
            else -> if (p.optBoolean("gamutCompress", true))
                OutputGamutCompress.LEGACY_CLIP else OutputGamutCompress.OFF
        }
    }

    private fun isBypass(id: String): Boolean {
        val s = id.trim().lowercase()
        return s.isEmpty() || s == "none" || s == "off" || s == "bypass" || s == "linear"
    }

    private fun firstStr(p: JSONObject, default: String, vararg keys: String): String {
        for (k in keys) {
            val v = p.optString(k, "")
            if (v.isNotEmpty() && v != "null") return v
        }
        return default
    }
}
