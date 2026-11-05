import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.spektrafilm.lab",
  appName: "Spektrafilm",
  webDir: "dist-apk",
  backgroundColor: "#0c0c0d",
  android: {
    allowMixedContent: true,
    backgroundColor: "#0c0c0d",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#0c0c0d",
    },
  },
};

export default config;
