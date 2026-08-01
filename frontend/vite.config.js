import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom/client", "axios", "recharts"],
  },
  server: {
    watch: null,
    hmr: false,
  },
});
