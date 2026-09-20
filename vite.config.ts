import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 纯前端静态站点；端口可通过环境变量覆盖（Compose / 本地均可用）
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT ?? 5173),
  },
  preview: {
    host: true,
    port: Number(process.env.PORT ?? 4173),
  },
});
