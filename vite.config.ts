import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

// base ต้องตรงกับ path ที่เว็บถูกติดตั้ง
//   htdocs ราก                   : VITE_BASE_PATH=/            (ค่าเริ่มต้น)
//   โฟลเดอร์ย่อยใน htdocs        : VITE_BASE_PATH=/campus-repair/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const base = String(env.VITE_BASE_PATH ?? "").trim() || "/"

  return {
    plugins: [react()],
    base,
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
  }
})
