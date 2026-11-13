import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = process.env.SERVER_URL ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": server,
      "/ws": { target: server, ws: true },
    },
  },
});
