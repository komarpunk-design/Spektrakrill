package com.spectrafilm.engine
/** App-private profile storage; configuring this object does not load JNI on the UI thread. */
object ProfileOverrides { @Volatile var directory: String = "" }
