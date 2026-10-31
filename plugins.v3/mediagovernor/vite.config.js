import federation from '@originjs/vite-plugin-federation'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 复用验证插件的产物规范化，避免上游生成空白使已提交构建无法通过差异检查。
const normalizeGeneratedText = () => ({
  name: 'normalize-generated-text',
  enforce: 'post',
  generateBundle (_, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') output.code = output.code.replace(/[ \t]+$/gm, '')
      else if (typeof output.source === 'string') output.source = output.source.replace(/[ \t]+$/gm, '')
    }
  },
})

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'MediaGovernor',
      filename: 'remoteEntry.js',
      exposes: {
        './Page': './src/components/Page.vue',
        './Config': './src/components/Config.vue',
        './AppPage': './src/components/AppPage.vue',
      },
      shared: { vue: { requiredVersion: false, generate: false, singleton: true } },
      format: 'esm',
    }),
    normalizeGeneratedText(),
  ],
  // remoteEntry.js 是固定文件名；将它置于发布版目录，使宿主加载新版本时
  // 不会复用旧的联邦入口与新后端混搭。
  build: { target: 'esnext', minify: false, cssCodeSplit: true, assetsDir: 'v5.1.1/assets' },
})
