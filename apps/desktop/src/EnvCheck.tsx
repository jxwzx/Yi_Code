import { useEffect, useState } from 'react'
import { API_BASE } from './api'

interface RuntimeInfo {
  name: string
  available: boolean
  version: string | null
  path: string | null
  error?: string
}
interface SelfTestResult {
  ok?: boolean
  stdout?: string
  stderr?: string
  elapsed?: number
  skipped?: boolean
  reason?: string
  error?: string
}

export function EnvCheck({ canManageEnv }: { canManageEnv?: boolean }) {
  const [runtimes, setRuntimes] = useState<Record<string, RuntimeInfo>>({})
  const [loading, setLoading] = useState(true)
  const [selfTest, setSelfTest] = useState<Record<string, SelfTestResult> | null>(null)
  const [testing, setTesting] = useState(false)
  const [installStatus, setInstallStatus] = useState<Record<string, { status: string; progress: string }>>({})
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent || '')

  const fetchRuntimes = async () => {
    setLoading(true)
    try {
      const r = await fetch(API_BASE + '/runtimes')
      const j = await r.json()
      setRuntimes(j.runtimes || j.details || {})
    } catch {
      setRuntimes({})
    }
    setLoading(false)
  }

  useEffect(() => { fetchRuntimes() }, [])

  const runSelfTest = async () => {
    setTesting(true)
    setSelfTest(null)
    try {
      const r = await fetch(API_BASE + '/self-test', { method: 'POST' })
      const j = await r.json()
      setSelfTest(j.per_language || {})
    } catch {
      setSelfTest({})
    }
    setTesting(false)
  }

  // 一键安装环境（java/cpp/go/cs）
  const installEnv = async (env: string) => {
    // 支持自动安装的环境
    const installableEnvs: Record<string, string> = {
      java: 'JDK 21',
      cpp: 'MinGW C++',
      go: 'Go',
      cs: '.NET SDK 8',
    }
    if (!installableEnvs[env]) return
    if (!canManageEnv) {
      setInstallStatus(prev => ({ ...prev, [env]: { status: 'error', progress: '仅管理员可安装' } }))
      return
    }

    setInstallStatus(prev => ({ ...prev, [env]: { status: 'installing', progress: '开始下载...' } }))

    try {
      const r = await fetch(`${API_BASE}/install/${env}`, { method: 'POST' })
      const data = await r.json()
      if (data.task_id) {
        // 轮询安装状态
        const poll = async () => {
          try {
            const sr = await fetch(`${API_BASE}/install/status/${data.task_id}`)
            const sd = await sr.json()
            setInstallStatus(prev => ({ ...prev, [env]: { status: sd.status, progress: sd.progress || sd.status } }))

            if (sd.status === 'running') {
              setTimeout(poll, 2000)
            } else if (sd.status === 'success') {
              // 安装成功后刷新环境检测
              setTimeout(() => { fetchRuntimes() }, 1000)
            }
          } catch {
            setTimeout(poll, 3000)
          }
        }
        setTimeout(poll, 1000)
      }
    } catch (e) {
      setInstallStatus(prev => ({ ...prev, [env]: { status: 'error', progress: '请求失败' } }))
    }
  }

  const langIcons: Record<string, string> = {
    py: 'fa-python', js: 'fa-js-square', cpp: 'fa-cplusplus',
    java: 'fa-java', go: 'fa-golang', cs: 'fa-hashtag',
  }
  const langColors: Record<string, string> = {
    py: '#3776ab', js: '#f7df1e', cpp: '#00599c',
    java: '#ed8b00', go: '#00add8', cs: '#178600',
  }

  const installGuide: Record<string, string> = {
    py: isMac
      ? '已预装。如需更新：python.org/downloads 或 brew install python'
      : '已预装。如需更新：python.org/downloads 或 winget install Python.Python.3.13',
    js: isMac
      ? '已预装。如需更新：nodejs.org 或 brew install node'
      : '已预装。如需更新：nodejs.org 或 winget install OpenJS.NodeJS.LTS',
    cpp: isMac
      ? 'macOS 系统自带 clang/g++；如需修复可运行：xcode-select --install'
      : '安装命令：winget install BrechtSanders.WinLibs.POSIX.UCRT（已自动执行）',
    java: isMac
      ? '安装命令：brew install --cask temurin@21（也可以点击下方一键安装）'
      : '安装命令：winget install EclipseAdoptium.Temurin.21.JDK',
    go: isMac
      ? '安装命令：brew install go（也可以点击下方一键安装）'
      : '安装命令：winget install GoLang.Go',
    cs: isMac
      ? '安装命令：brew install --cask dotnet-sdk@8（也可以点击下方一键安装）'
      : '安装命令：winget install Microsoft.DotNet.SDK.8',
  }

  const allEntries = Object.entries(runtimes)

  return (
    <div className="fade-in" style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
          <i className="fas fa-stethoscope" style={{ marginRight: '10px', color: 'var(--primary-light)' }}></i>
          运行环境检查
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          检测本地 6 种编程语言的编译器/解释器是否已安装就绪。点击「一键自测」验证每种语言能否真实编译并执行代码。
        </p>
      </div>

      {/* 统计概览 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ background: 'var(--bg-card)', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>
            {allEntries.filter(([, r]) => r.available).length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>已就绪</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--bg-card)', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>
            {allEntries.filter(([, r]) => !r.available).length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>未安装</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--bg-card)', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary-light)' }}>
            {allEntries.length || 6}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>总支持语言</div>
        </div>
      </div>

      {/* 一键自测按钮 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          className="btn btn-primary"
          onClick={runSelfTest}
          disabled={testing}
          style={{ justifyContent: 'center' }}
        >
          <i className={`fas ${testing ? 'fa-spinner fa-spin' : 'fa-play-circle'}`}></i>
          {testing ? '正在测试...' : '一键自测 (编译+执行 HelloWorld)'}
        </button>
        <button className="btn btn-secondary" onClick={fetchRuntimes} disabled={loading}>
          <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync'}`}></i>
          重新检测
        </button>
      </div>

      {/* 语言环境卡片 - 纵向布局 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {allEntries.map(([key, info]) => (
          <div key={key} style={{
            padding: '18px', borderRadius: '12px',
            border: `1px solid ${info.available ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            background: info.available
              ? 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(15,23,42,0.6))'
              : 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(15,23,42,0.6))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: langColors[key] || '#6366f1', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}>
                <i className={`fab ${langIcons[key] || 'fa-code'}`}></i>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{info.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{key.toUpperCase()}</div>
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                background: info.available ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                color: info.available ? '#10b981' : '#ef4444',
              }}>
                {info.available ? '✅ 就绪' : '❌ 未装'}
              </div>
            </div>
            {info.version && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <i className="fas fa-tag" style={{ marginRight: '6px' }}></i>{info.version}
              </div>
            )}
            {info.path && (
              <div style={{
                fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace",
                background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '4px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '8px',
                border: '1px solid var(--border)',
              }}>
                <i className="fas fa-folder-open" style={{ marginRight: '6px' }}></i>{info.path}
              </div>
            )}
            {!info.available && (
              <div style={{
                fontSize: '12px', color: '#fbbf24', padding: '8px 10px',
                background: 'rgba(251,191,36,0.1)', borderRadius: '6px', marginTop: '6px',
              }}>
                <i className="fas fa-wrench" style={{ marginRight: '6px' }}></i>
                {installGuide[key] || '请安装对应编译器/解释器'}
                {/* 一键安装按钮（java/cpp/go/cs） */}
                {(key === 'java' || key === 'cpp' || key === 'go' || key === 'cs') && canManageEnv && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '8px', width: '100%', justifyContent: 'center', fontSize: '13px', padding: '6px 12px' }}
                    onClick={() => installEnv(key)}
                    disabled={installStatus[key]?.status === 'running' || installStatus[key]?.status === 'installing'}
                  >
                    {installStatus[key]?.status === 'running' || installStatus[key]?.status === 'installing' ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> {installStatus[key]?.progress || '安装中...'}
                      </>
                    ) : installStatus[key]?.status === 'success' ? (
                      <>
                        <i className="fas fa-check-circle"></i> 安装成功，请重新检测
                      </>
                    ) : installStatus[key]?.status === 'failed' || installStatus[key]?.status === 'error' ? (
                      <>
                        <i className="fas fa-exclamation-circle"></i> 安装失败，点击重试
                      </>
                    ) : (
                      <>
                        <i className="fas fa-download"></i> 一键安装（自动下载到项目目录）
                      </>
                    )}
                  </button>
                )}
                {(key === 'java' || key === 'cpp' || key === 'go' || key === 'cs') && !canManageEnv && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <i className="fas fa-lock" style={{ marginRight: 4 }}></i>环境安装仅限管理员操作
                  </div>
                )}
              </div>
            )}
            {/* 自测结果 */}
            {selfTest && selfTest[key] && (
              <div style={{
                marginTop: '10px', padding: '10px', borderRadius: '6px',
                background: selfTest[key].ok ? 'rgba(16,185,129,0.08)' : selfTest[key].skipped ? 'rgba(251,191,36,0.08)' : 'rgba(239,68,68,0.08)',
                fontSize: '12px',
              }}>
                {selfTest[key].skipped ? (
                  <span style={{ color: '#fbbf24' }}>⚠️ 跳过 — {selfTest[key].reason}</span>
                ) : selfTest[key].ok ? (
                  <div>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>✅ 执行成功</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{selfTest[key].elapsed?.toFixed(2)}s</span>
                    {selfTest[key].stdout && (
                      <pre style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
                        {selfTest[key].stdout}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>❌ 执行失败</span>
                    {selfTest[key].stderr && (
                      <pre style={{ marginTop: '4px', fontSize: '11px', color: '#f87171', whiteSpace: 'pre-wrap' }}>
                        {selfTest[key].stderr}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px' }}></i>
          <div style={{ marginTop: '10px' }}>正在检测运行环境...</div>
        </div>
      )}
    </div>
  )
}
