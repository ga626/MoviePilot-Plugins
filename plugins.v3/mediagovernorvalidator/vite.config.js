import federation from '@originjs/vite-plugin-federation'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'MediaGovernorValidator',
      filename: 'remoteEntry.js',
      exposes: {
        './Page': './src/components/Page.vue',
        './Config': './src/components/Config.vue',
        './AppPage': './src/components/AppPage.vue',
      },
      shared: { vue: { requiredVersion: false, generate: false, singleton: true } },
      format: 'esm',
    }),
  ],
  build: { target: 'esnext', minify: true, cssCodeSplit: true, assetsDir: 'v0.1.0/assets' },
})
