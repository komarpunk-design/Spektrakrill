import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function copyApkPublic(): Plugin {
  return {
    name: "copy-apk-public",
    closeBundle() {
      const dest = path.resolve(__dirname, "dist-apk");
      mkdirSync(dest, { recursive: true });
      for (const name of ["profiles", "samples"]) {
        const src = path.resolve(__dirname, "public", name);
        if (existsSync(src)) cpSync(src, path.join(dest, name), { recursive: true });
      }
      for (const name of ["favicon.svg", "og.jpg", "zalupa-ui-notice.txt"]) {
        const src = path.resolve(__dirname, "public", name);
        if (existsSync(src)) cpSync(src, path.join(dest, name));
      }
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, "apk"),
  publicDir: false,
  plugins: [tailwindcss(), viteReact(), copyApkPublic()],
  resolve: {
    tsconfigPaths: true,
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-apk"),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
});
