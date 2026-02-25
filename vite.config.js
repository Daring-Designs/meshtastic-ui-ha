import { defineConfig } from "vite";
import { resolve } from "path";

const VENDOR_DIR = "custom_components/meshtastic_ui/ha_frontend/vendor";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/lit-entry.js"),
      formats: ["es"],
      fileName: () => "lit-element.js",
    },
    outDir: resolve(__dirname, VENDOR_DIR, "lit"),
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
  },
});
