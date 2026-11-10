package app.spektrafilm.lab

import org.json.JSONObject

object FilmLook {
    @JvmStatic
    fun bypass(params: JSONObject?): Boolean {
        val workflow = params?.optJSONObject("experimental")?.optString("workflow", "normal") ?: "normal"
        if (workflow != "normal") return false // ParamsBuilder validates the required stock.
        val s = params?.optString("filmStock", "none")?.trim()?.lowercase() ?: "none"
        return s.isEmpty() || s == "none" || s == "off" || s == "bypass" || s == "linear"
    }
}
