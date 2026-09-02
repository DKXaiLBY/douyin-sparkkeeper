import { defineConfig } from 'vitest/config';

// 后端单测配置（依赖安装在 server/node_modules）。
// 仅覆盖 tests/server，使用相对导入，无需 '@' 别名。
export default defineConfig({
  test: {
    include: ['../tests/server/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
