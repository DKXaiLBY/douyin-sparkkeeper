import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'web/src'),
    },
    // web/node_modules 下另有一份 React，与根目录 node_modules 的 react-dom 是两个模块实例，
    // 组件一旦用 hooks 就会报 "Cannot read properties of null (reading 'useState')"。
    // 强制去重到同一份，测试环境才能跑带 hooks 的组件。
    dedupe: ['react', 'react-dom', 'react-dom/client'],
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: false,
  },
});
