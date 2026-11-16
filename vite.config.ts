import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const allowedHosts = process.env.VITE_DEV_ALLOWED_HOSTS
  ?.split(",")
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "0.0.0.0",
    ...(allowedHosts && allowedHosts.length > 0 ? { allowedHosts } : {}),
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        headers: { Origin: "http://127.0.0.1:8080" },
      },
      "/uploads": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
})