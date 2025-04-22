import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        background: "public/background.js",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
