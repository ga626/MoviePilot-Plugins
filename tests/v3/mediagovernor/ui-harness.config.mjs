// 本地模拟接口 + 正式 AppPage；只读会话，不连接 NAS，不增加依赖。
import vue from '../../../plugins.v3/mediagovernor/node_modules/@vitejs/plugin-vue/dist/index.mjs'
import { fileURLToPath } from 'node:url'

const resolve = path => fileURLToPath(new URL(path, import.meta.url))
const root = resolve('../../../')
export default {
  root,
  plugins: [vue()],
  resolve: { alias: {
    vue: resolve('../../../plugins.v3/mediagovernor/node_modules/vue/dist/vue.esm-bundler.js'),
    '/src': resolve('../../../plugins.v3/mediagovernor/src'),
  } },
  // 不扫描仓库中其他插件和本机报告的 HTML，避免无关入口导致依赖扫描报错。
  optimizeDeps: { entries: ['tests/v3/mediagovernor/ui-harness.html'] },
  server: { host: '127.0.0.1', port: 4153, strictPort: true, fs: { allow: [root] } },
}
