import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./src/desktop/renderer", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../ui",
    emptyOutDir: true,
    target: "chrome140",
    cssCodeSplit: false,
  },
});
