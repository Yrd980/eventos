import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const appRoot = join(import.meta.dir, '..')
const source = join(appRoot, 'project.private.config.json')
const target = join(appRoot, 'dist', 'project.private.config.json')
const distProjectConfig = join(appRoot, 'dist', 'project.config.json')

function syncPrivateProjectConfig() {
  if (!existsSync(source)) return
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
}

function syncDistProjectConfig() {
  mkdirSync(dirname(distProjectConfig), { recursive: true })
  writeFileSync(
    distProjectConfig,
    `${JSON.stringify({
      miniprogramRoot: './',
      projectname: 'eventos-web-miniapp',
      description: 'Event OS mini program',
      appid: 'touristappid',
      setting: {
        urlCheck: false,
        es6: true,
      },
      compileType: 'miniprogram',
      libVersion: '3.7.12',
    }, null, 2)}\n`,
  )
}

syncPrivateProjectConfig()
syncDistProjectConfig()

if (process.argv.includes('--watch')) {
  setInterval(() => {
    syncPrivateProjectConfig()
    syncDistProjectConfig()
  }, 1000)
}
