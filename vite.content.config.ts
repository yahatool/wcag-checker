import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./src/inspected-page/index.ts", import.meta.url)),
      name: "WcagCheckerInspectedPage",
      formats: ["iife"],
      fileName: () => "inspected-page.js",
    },
  },
});
