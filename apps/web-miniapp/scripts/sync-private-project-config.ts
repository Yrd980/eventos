import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const appRoot = join(import.meta.dir, '..')
const source = join(appRoot, 'project.private.config.json')
const target = join(appRoot, 'dist', 'project.private.config.json')

function syncPrivateProjectConfig() {
  if (!existsSync(source)) return
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
}

syncPrivateProjectConfig()

if (process.argv.includes('--watch')) {
  setInterval(syncPrivateProjectConfig, 1000)
}
