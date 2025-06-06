  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react-swc";
  import tailwindcss from "@tailwindcss/vite";
  // https://vite.dev/config/
  export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/auth": {
          target: "http://localhost:8002",
          changeOrigin: true,
        },
        "/client": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
        "/model": {
          target: "http://localhost:8003",
          changeOrigin: true,
        },
      },
    },
  });
