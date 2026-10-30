// Existing Vite dependencies only. Loopback, strict fixed port, no NAS calls.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from '../../../plugins.v3/mediagovernor/node_modules/vite/dist/node/index.js'
const pluginRoot = fileURLToPath(new URL('../../../plugins.v3/mediagovernor/', import.meta.url))
const server = await createServer({ root: pluginRoot, configFile: `${pluginRoot}/vite.config.js`, server: { host: '127.0.0.1', port: 4173, strictPort: true }, plugins: [{
  name: 'governor-local-harness',
  configureServer(instance) {
    instance.middlewares.use('/__governor_harness', async (req, res, next) => {
      try {
        const html = await readFile(new URL('./ui-harness.html', import.meta.url), 'utf8')
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(await instance.transformIndexHtml('/__governor_harness', html))
      } catch (error) { next(error) }
    })
  }
}] })
await server.listen()
console.log('MediaGovernor fixture UI listening on loopback:4173')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })
