plugins { id("com.android.application") }
android {
 namespace = "app.negs.android"
 compileSdk = 37
 buildToolsVersion = "36.0.0"
 defaultConfig { applicationId = "app.negs.android"; minSdk = 26; targetSdk = 36; versionCode = 3; versionName = "0.18.0-android.3"; ndk { abiFilters += "arm64-v8a" } }
 packaging { jniLibs.useLegacyPackaging = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 signingConfigs { getByName("debug") { storeFile = rootProject.file("debug.keystore"); storePassword = "android"; keyAlias = "androiddebugkey"; keyPassword = "android" } }
 buildTypes { getByName("release") { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("debug") } }
}
android { testOptions { unitTests.isIncludeAndroidResources = true } }
dependencies { testImplementation("junit:junit:4.13.2"); testImplementation("org.robolectric:robolectric:4.17") }
tasks.withType<Test>().configureEach {
 providers.gradleProperty("robolectricSdkDir").orNull?.let {
  systemProperty("robolectric.offline", "true")
  systemProperty("robolectric.dependency.dir", it)
 }
}
