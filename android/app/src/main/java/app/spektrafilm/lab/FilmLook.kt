package app.spektrafilm.lab

import org.json.JSONObject

object FilmLook {
    @JvmStatic
    fun bypass(params: JSONObject?): Boolean {
        val s = params?.optString("filmStock", "none")?.trim()?.lowercase() ?: "none"
        return s.isEmpty() || s == "none" || s == "off" || s == "bypass" || s == "linear"
    }
}
