import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // During local development, forward /api requests to `vercel dev`
      // (run `vercel dev` in one terminal and `npm run dev` in another).
      "/api": "http://localhost:3000",
    },
  },
});
