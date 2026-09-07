// YiCode 一键启动：同时拉起后端 (FastAPI:8000) 与前端 (Vite:1420)
// 用法：在 apps/desktop 下执行 npm run dev，或在仓库根目录执行 node scripts/dev-all.mjs
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import net from 'node:net'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// 自动探测可用的 Python 命令（py 启动器 / python / python3）
async function findPython() {
  for (const cmd of ['py', 'python', 'python3']) {
    try {
      await execFileP(cmd, ['--version'])
      return cmd
    } catch { /* try next */ }
  }
  return null
}

const isPortFree = (port) => new Promise((resolve) => {
  const srv = net.createServer()
  srv.once('error', () => resolve(false))
  srv.once('listening', () => { srv.close(); resolve(true) })
  srv.listen(port, '0.0.0.0')
})

const procs = []
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const p of procs) {
    try { p.kill() } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(code), 300)
}

function launch(label, color, command, args, opts) {
  const p = spawn(command, args, { cwd: ROOT, shell: true, ...opts })
  procs.push(p)
  const tag = `\x1b[${color}m[${label}]\x1b[0m`
  const pipe = (stream, target) => {
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (line.trim()) target.write(`${tag} ${line}\n`)
      }
    })
  }
  pipe(p.stdout, process.stdout)
  pipe(p.stderr, process.stderr)
  p.on('exit', (code) => {
    console.log(`${tag} 进程退出 (code ${code})`)
    shutdown(code ?? 0)
  })
  return p
}

async function main() {
  const backendFree = await isPortFree(8000)
  const frontendFree = await isPortFree(1420)
  if (!backendFree) {
    console.log('\x1b[33m[提示]\x1b[0m 端口 8000 已被占用，跳过后端启动（沿用已有服务）')
  }
  if (!frontendFree) {
    console.log('\x1b[33m[提示]\x1b[0m 端口 1420 已被占用，跳过后前端启动（沿用已有服务）')
  }

  console.log('\x1b[36m==========================================\x1b[0m')
  console.log('\x1b[36m  YiCode 一键启动\x1b[0m')
  console.log('\x1b[36m  前端: http://localhost:1420\x1b[0m')
  console.log('\x1b[36m  后端: http://localhost:8000/docs\x1b[0m')
  console.log('\x1b[36m  Ctrl+C 退出全部服务\x1b[0m')
  console.log('\x1b[36m==========================================\x1b[0m')

  if (backendFree) {
    const py = await findPython()
    if (!py) {
      console.log('\x1b[31m[错误]\x1b[0m 未找到 Python（py / python / python3 均不可用），无法启动后端')
    } else {
      launch('后端', '35', py, [join(ROOT, 'services', 'local_api', 'main.py')])
    }
  }
  if (frontendFree) {
    // 注意：必须用 dev:web（vite），不能用 dev，否则会递归调用本脚本
    launch('前端', '32', 'npm', ['run', 'dev:web', '--prefix', join(ROOT, 'apps', 'desktop')])
  }
  if (!backendFree && !frontendFree) {
    console.log('\x1b[32m前后端均已在运行，无需重复启动。\x1b[0m')
    process.exit(0)
  }
}

process.on('SIGINT', () => { console.log('\n正在关闭全部服务...'); shutdown(0) })
process.on('SIGTERM', () => shutdown(0))

main()
