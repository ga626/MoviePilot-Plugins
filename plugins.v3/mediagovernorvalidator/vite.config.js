import federation from '@originjs/vite-plugin-federation'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

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
    normalizeGeneratedText(),
  ],
  // Keep committed federation assets byte-for-byte reproducible across the
  // Node versions used by local development and GitHub Actions.
  build: { target: 'esnext', minify: false, cssCodeSplit: true, assetsDir: 'v0.1.0/assets' },
})
