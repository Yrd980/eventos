import { spawn } from 'node:child_process'
import { join } from 'node:path'

const sync = spawn('bun', ['scripts/sync-private-project-config.ts', '--watch'], {
  cwd: join(import.meta.dir, '..'),
  stdio: 'ignore',
  windowsHide: true,
})

const taro = spawn('bunx', ['taro', 'build', '--type', 'weapp', '--watch'], {
  cwd: join(import.meta.dir, '..'),
  stdio: 'inherit',
  windowsHide: true,
})

function stop() {
  sync.kill()
  taro.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
taro.on('exit', (code) => {
  sync.kill()
  process.exit(code ?? 0)
})
