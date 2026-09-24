import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        devtools: fileURLToPath(new URL("./devtools.html", import.meta.url)),
        panel: fileURLToPath(new URL("./panel.html", import.meta.url)),
        background: fileURLToPath(new URL("./src/background/index.ts", import.meta.url)),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
