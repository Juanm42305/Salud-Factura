import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El frontend solo habla con el backend propio; nunca llama a Factus directamente.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
