# JNI reads kotlin.Triple/Pair by string (spektra_jni.cpp). R8 otherwise
# strips getFirst/getSecond/getThird because no bytecode calls them, and every
# Triple/Pair-valued engine param marshals as 0.0 — black negative / white slide.
-keep class com.spectrafilm.engine.** { *; }
-keep class kotlin.Triple { *; }
-keep class kotlin.Pair { *; }
-keepclassmembers class kotlin.Triple {
    <fields>;
    public <methods>;
}
-keepclassmembers class kotlin.Pair {
    <fields>;
    public <methods>;
}
