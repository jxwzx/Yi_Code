import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react'
import './App.css'
import { MonacoCodeEditor } from './MonacoEditor'
import { API_BASE, WS_BASE } from './api'
import { EnvCheck } from './EnvCheck'
import logoImg from './Yi_Code.png'
import { AdminPanel } from './AdminPanel'
import { FlowchartView } from './FlowchartView'
import { simulateRun, buildLocalAIReply } from './aiHelpers'

// 全局给本地 API 请求自动附带 JWT，避免每个接口手动加请求头
const _originalFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers || {})
  try {
    const savedUser = localStorage.getItem('yicode_user')
    if (savedUser) {
      const token = JSON.parse(savedUser).token
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
  } catch { /* ignore */ }
  return _originalFetch(input, { ...init, headers })
}) as typeof fetch

// ============== YiCode 类型定义 ==============
type PageKey = 'dashboard' | 'editor' | 'ai' | 'flowchart' | 'collab' | 'learn' | 'classroom' | 'envcheck' | 'admin'
type LangKey = 'py' | 'js' | 'cpp' | 'java' | 'go' | 'cs'

interface CurrentUser {
  user_id: number
  username: string
  avatar: string
  level: number
  xp: number
  streak_days: number
  role: string       // student / admin / super_admin
  target_id: string | null  // 000(超管) / 001/002...(管理员) / null
  token?: string
}

interface Exercise {
  id: number
  title: string
  description: string
  difficulty: string
  language: string
  starter_code: string | null
  solution: string | null
  accept_rate: number
  tags: string | null
  course_id: number | null
}

interface AIMessage {
  role: 'assistant' | 'user'
  text: string
  issues?: Array<{ type: 'error' | 'warning' | 'info'; title: string; body: string; fix?: string }>
}

interface ChatMessage {
  id: string
  author: string
  avatar: string
  text: string
  time: string
  self?: boolean
}

// ============== 代码模板 ==============
const CODE_TEMPLATES: Record<LangKey, string> = {
  py: [
    '# Python 代码编辑器',
    '# 在此编写你的代码',
    '',
    '',
  ].join('\n'),
  js: [
    '// JavaScript 代码编辑器',
    '// 在此编写你的代码',
    '',
    '',
  ].join('\n'),
  cpp: [
    '// C++ 代码编辑器',
    '#include <iostream>',
    'using namespace std;',
    '',
    'int main() {',
    '    // 在此编写你的代码',
    '',
    '    return 0;',
    '}',
  ].join('\n'),
  java: [
    '// Java 代码编辑器',
    'public class Main {',
    '    public static void main(String[] args) {',
    '        // 在此编写你的代码',
    '',
    '    }',
    '}',
  ].join('\n'),
  go: [
    '// Go 代码编辑器',
    'package main',
    '',
    'import "fmt"',
    '',
    'func main() {',
    '    // 在此编写你的代码',
    '',
    '}',
  ].join('\n'),
  cs: [
    '// C# 代码编辑器',
    'using System;',
    '',
    'class Program',
    '{',
    '    static void Main()',
    '    {',
    '        // 在此编写你的代码',
    '',
    '    }',
    '}',
  ].join('\n'),
}

// ============== 主组件 ==============
export default function App() {
  const [page, setPage] = useState<PageKey>(() => {
    try {
      return (localStorage.getItem('yicode_page') as PageKey) || 'dashboard'
    } catch { return 'dashboard' }
  })
  const [, setRunStatus] = useState<{ id: string; logFile: string } | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    // 从 localStorage 恢复登录状态
    try {
      const saved = localStorage.getItem('yicode_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDarkTheme, setIsDarkTheme] = useState(() => localStorage.getItem('yicode_theme') !== 'light')

  const toggleTheme = () => {
    const newTheme = isDarkTheme ? 'light' : 'dark'
    setIsDarkTheme(!isDarkTheme)
    localStorage.setItem('yicode_theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  // 包裹 setPage：同时持久化到 localStorage（刷新后保持当前页）
  const setPagePersist = (p: PageKey) => {
    setPage(p)
    localStorage.setItem('yicode_page', p)
  }

  // 打开题目：设置当前题目并跳转到编辑器，同时持久化到 localStorage
  const openExercise = (ex: Exercise) => {
    setSelectedExercise(ex)
    localStorage.setItem('yicode_exercise_id', String(ex.id))
    setPagePersist('editor')
  }

  const handleLogin = (user: CurrentUser) => {
    setCurrentUser(user)
    localStorage.setItem('yicode_user', JSON.stringify(user))
    setPage('dashboard')
  }

  const handleLogout = () => {
    setCurrentUser(null)
    localStorage.removeItem('yicode_user')
    localStorage.removeItem('yicode_exercise_id')
    setPage('dashboard')
  }

  // 未登录时显示登录页面
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />
  }

  const topbarTitle: Record<PageKey, { icon: string; text: string }> = {
    dashboard: { icon: 'fa-th-large', text: '学习仪表盘' },
    editor: { icon: 'fa-code', text: '代码实验室' },
    ai: { icon: 'fa-robot', text: 'AI 编程助教' },
    flowchart: { icon: 'fa-project-diagram', text: '代码流程图' },
    collab: { icon: 'fa-users', text: '协作频道' },
    learn: { icon: 'fa-graduation-cap', text: '学习中心' },
    classroom: { icon: 'fa-chalkboard-teacher', text: '我的课程' },
    envcheck: { icon: 'fa-stethoscope', text: '环境检查' },
    admin: { icon: 'fa-shield-alt', text: '管理面板' },
  }

  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPagePersist} user={currentUser} onLogout={handleLogout} />
      <div className="main-content">
        <Topbar
          icon={topbarTitle[page].icon}
          title={topbarTitle[page].text}
          setRunStatus={setRunStatus}
          user={currentUser}
          onLogout={handleLogout}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isDarkTheme={isDarkTheme}
          onToggleTheme={toggleTheme}
        />
        <div className="content-area">
          {page === 'dashboard' && <Dashboard setPage={setPagePersist} userId={currentUser.user_id} />}
          {page === 'editor' && <CodeEditor onRunStatus={setRunStatus} exercise={selectedExercise} onClearExercise={() => { setSelectedExercise(null); localStorage.removeItem('yicode_exercise_id') }} userId={currentUser.user_id} isDarkTheme={isDarkTheme} />}
          {page === 'ai' && <AIPanel standalone />}
          {page === 'flowchart' && <FlowchartView />}
          {/* 协作频道始终保持挂载，避免切换选项卡时 WebSocket 断开 */}
          <div style={{ display: page === 'collab' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <CollabChannel username={currentUser.username} token={currentUser.token || ''} isDarkTheme={isDarkTheme} />
          </div>
          {page === 'learn' && <LearnCenter setPage={setPagePersist} onOpenExercise={openExercise} searchQuery={searchQuery} />}
          {page === 'classroom' && <ClassroomView setPage={setPagePersist} />}
          {page === 'envcheck' && <EnvCheck canManageEnv={currentUser.role === 'admin' || currentUser.role === 'super_admin'} />}
          {page === 'admin' && <AdminPanel currentUser={currentUser} />}
        </div>
      </div>
    </div>
  )
}

// ============== 登录页面 ==============
function LoginPage({ onLogin }: { onLogin: (user: CurrentUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const meteorCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // 流星雨动画
  useEffect(() => {
    const canvas = meteorCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let W = 0, H = 0
    const DPR = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * DPR
      canvas.height = H * DPR
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    interface Meteor { x: number; y: number; len: number; speed: number; angle: number; hue: number; life: number; maxLife: number }
    const meteors: Meteor[] = []

    const spawnMeteor = (): Meteor => {
      const angle = Math.PI * (0.75 + Math.random() * 0.15) // 向左下飞
      const maxLife = 60 + Math.random() * 40
      return {
        x: W * (0.3 + Math.random() * 0.9),
        y: -20 - Math.random() * H * 0.3,
        len: 80 + Math.random() * 160,
        speed: 6 + Math.random() * 8,
        angle,
        hue: [230, 260, 320, 170][Math.floor(Math.random() * 4)],
        life: 0,
        maxLife,
      }
    }

    // 初始随机几颗
    for (let i = 0; i < 3; i++) {
      const m = spawnMeteor()
      m.y = Math.random() * H * 0.5
      m.life = Math.random() * 30
      meteors.push(m)
    }

    let frame = 0
    const tick = () => {
      frame++
      ctx.clearRect(0, 0, W, H)

      // 每隔一段时间生成新流星
      if (frame % 45 === 0 && meteors.length < 7) meteors.push(spawnMeteor())

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.x += Math.cos(m.angle) * m.speed
        m.y += Math.sin(m.angle) * m.speed
        m.life++

        const alpha = Math.max(0, 1 - m.life / m.maxLife)
        const dx = Math.cos(m.angle) * m.len
        const dy = Math.sin(m.angle) * m.len

        // 流星尾巴（渐变线）
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - dx, m.y - dy)
        grad.addColorStop(0, `hsla(${m.hue}, 95%, 75%, ${0.9 * alpha})`)
        grad.addColorStop(0.3, `hsla(${m.hue}, 90%, 65%, ${0.45 * alpha})`)
        grad.addColorStop(1, `hsla(${m.hue}, 90%, 60%, 0)`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - dx, m.y - dy)
        ctx.stroke()

        // 流星头部光点
        ctx.beginPath()
        ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${m.hue}, 100%, 88%, ${alpha})`
        ctx.shadowColor = `hsla(${m.hue}, 100%, 75%, ${alpha})`
        ctx.shadowBlur = 12
        ctx.fill()
        ctx.shadowBlur = 0

        if (m.life >= m.maxLife || m.y > H + 200 || m.x < -200) meteors.splice(i, 1)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // 星星与代码符号位置（useMemo 固定，避免重渲染时跳动）
  const loginStars = useMemo(() => Array.from({ length: 60 }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 4,
    duration: 2 + Math.random() * 3,
    size: 1 + Math.random() * 2,
  })), [])

  const loginSymbols = useMemo(() => ['</', '{}', '()', '[]', '/>', '&&', '=>', '++'].map((sym, i) => ({
    sym,
    left: 8 + Math.random() * 84,
    top: 8 + Math.random() * 84,
    delay: i * 0.8,
    duration: 6 + Math.random() * 4,
    size: 14 + Math.random() * 10,
    opacity: 0.15 + Math.random() * 0.15,
  })), [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const resp = await fetch(API_BASE + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.detail || '登录失败')
        onLogin(data)
      } else {
        const resp = await fetch(API_BASE + '/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, email: email || undefined }),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.detail || '注册失败')
        // 注册成功后自动登录
        onLogin({
          user_id: data.user_id,
          username: data.username,
          avatar: data.avatar || username[0] || '码',
          level: data.level || 1,
          xp: data.xp || 0,
          streak_days: data.streak_days || 1,
          role: data.role || 'student',
          target_id: data.target_id || null,
          token: data.token,
        })
      }
    } catch (err: any) {
      setError(err.message || '网络错误，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }

  // 鼠标视差 + 卡片 3D 倾斜：直接写 CSS 变量，避免 React 重渲染
  const loginPageRef = useRef<HTMLDivElement | null>(null)
  const loginCardRef = useRef<HTMLDivElement | null>(null)

  const handleParallax = (e: React.MouseEvent<HTMLDivElement>) => {
    const page = loginPageRef.current
    if (!page) return
    const rect = page.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 2 - 1   // -1 ~ 1
    const py = ((e.clientY - rect.top) / rect.height) * 2 - 1
    page.style.setProperty('--px', px.toFixed(3))
    page.style.setProperty('--py', py.toFixed(3))
    const card = loginCardRef.current
    if (card) {
      card.style.setProperty('--tilt-x', `${(-py * 5).toFixed(2)}deg`)
      card.style.setProperty('--tilt-y', `${(px * 6).toFixed(2)}deg`)
    }
  }

  const resetParallax = () => {
    const page = loginPageRef.current
    page?.style.setProperty('--px', '0')
    page?.style.setProperty('--py', '0')
    const card = loginCardRef.current
    if (card) {
      card.style.setProperty('--tilt-x', '0deg')
      card.style.setProperty('--tilt-y', '0deg')
    }
  }

  return (
    <div className="login-page" ref={loginPageRef} onMouseMove={handleParallax} onMouseLeave={resetParallax}>
      {/* 流星 canvas 背景 */}
      <canvas ref={meteorCanvasRef} className="meteor-canvas" />

      <div className="login-bg-decoration">
        <div className="bg-blob blob-1"></div>
        <div className="bg-blob blob-2"></div>
        <div className="bg-blob blob-3"></div>
        {/* 网格线 */}
        <div className="bg-grid" />
        {/* 星星 */}
        <div className="bg-stars">
          {loginStars.map((s, i) => (
            <div key={i} className="star" style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
              width: `${s.size}px`,
              height: `${s.size}px`,
            }} />
          ))}
        </div>
        {/* 浮动代码符号 */}
        <div className="bg-code-symbols">
          {loginSymbols.map((s, i) => (
            <div key={i} className="code-symbol" style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
              fontSize: `${s.size}px`,
              opacity: s.opacity,
            }}>{s.sym}</div>
          ))}
        </div>
      </div>

      <div className="login-card" ref={loginCardRef}>
        <div className="login-header">
          <div className="login-logo">
            <img src={logoImg} alt="YiCode" />
          </div>
          <h1>YiCode 易码</h1>
          <p>AI 驱动的编程学习平台 · 面向初学者与大学生</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >登录</button>
          <button
            className={`login-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError('') }}
          >注册</button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <i className="fas fa-user form-icon"></i>
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="form-field">
            <i className="fas fa-lock form-icon"></i>
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          {mode === 'register' && (
            <div className="form-field">
              <i className="fas fa-envelope form-icon"></i>
              <input
                type="email"
                placeholder="邮箱（选填）"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          )}

          {error && <div className="login-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}

          <button type="submit" className="login-submit" disabled={loading || !username || !password}>
            {loading ? <i className="fas fa-spinner fa-spin"></i> : mode === 'login' ? '登录' : '注册并开始学习'}
          </button>
        </form>

        <div className="login-hint">
          {mode === 'login' ? (
            <>没有账号？<span onClick={() => { setMode('register'); setError('') }}>立即注册</span></>
          ) : (
            <>已有账号？<span onClick={() => { setMode('login'); setError('') }}>返回登录</span></>
          )}
        </div>

        <div className="login-demo">
          <i className="fas fa-info-circle"></i>
          演示账号：编程学习者 / 123456
        </div>
      </div>
    </div>
  )
}

// ============== 侧边栏 ==============
function Sidebar({ page, setPage, user, onLogout }: {
  page: PageKey; setPage: (p: PageKey) => void
  user: CurrentUser; onLogout: () => void
}) {
  const nav = (key: PageKey, icon: string, label: string, badge?: string) => (
    <div
      className={`nav-item ${page === key ? 'active' : ''}`}
      onClick={() => setPage(key)}
    >
      <i className={`fas ${icon}`} />
      <span>{label}</span>
      {badge && <span className="nav-badge">{badge}</span>}
    </div>
  )

  const levelTitle = (lv: number) => {
    if (lv >= 10) return '编程大师'
    if (lv >= 7) return '进阶学徒'
    if (lv >= 4) return '中级码农'
    return '初学者'
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={logoImg} alt="YiCode" className="logo-icon" />
        <div className="logo-text">
          <h1>YiCode 易码</h1>
          <p>AI 驱动编程学习平台</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-title">学习中心</div>
          {nav('dashboard', 'fa-th-large', '仪表盘')}
          {nav('learn', 'fa-graduation-cap', '学习中心')}
          {nav('classroom', 'fa-chalkboard-teacher', '我的课程', '3')}
        </div>
        <div className="nav-section">
          <div className="nav-section-title">开发工具</div>
          {nav('editor', 'fa-code', '代码实验室')}
          {nav('flowchart', 'fa-project-diagram', '代码流程图')}
          {nav('ai', 'fa-robot', 'AI 编程助教', '新')}
          {nav('envcheck', 'fa-stethoscope', '环境检查')}
        </div>
        <div className="nav-section">
          <div className="nav-section-title">社区协作</div>
          {nav('collab', 'fa-users', '协作频道', '5')}
        </div>
        {/* 管理员/超管显示管理面板入口 */}
        {(user.role === 'super_admin' || user.role === 'admin') && (
          <div className="nav-section">
            <div className="nav-section-title">系统管理</div>
            {nav('admin', 'fa-shield-alt', '管理面板', user.role === 'super_admin' ? '超管' : '管理')}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{user.avatar}</div>
          <div className="user-info">
            <div className="user-name">{user.username}</div>
            <div className="user-level">Lv.{user.level} · {levelTitle(user.level)}</div>
          </div>
          <button className="user-logout" title="退出登录" onClick={onLogout}>
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    </aside>
  )
}

// ============== 顶部栏 ==============
function Topbar({ icon, title, setRunStatus, user, onLogout, searchQuery, setSearchQuery, isDarkTheme, onToggleTheme }: {
  icon: string; title: string; setRunStatus: (s: { id: string; logFile: string } | null) => void
  user: CurrentUser; onLogout: () => void
  searchQuery: string; setSearchQuery: (q: string) => void
  isDarkTheme: boolean; onToggleTheme: () => void
}) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('yicode_ai_token') || '')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const saveApiKey = () => {
    localStorage.setItem('yicode_ai_token', apiKey)
    setShowApiKeyInput(false)
  }

  const notifications = [
    { id: 1, text: '欢迎使用 YiCode 编程平台！', time: '刚刚', read: false },
    { id: 2, text: 'AI 助教已就绪，随时为你解答问题', time: '1 分钟前', read: false },
    { id: 3, text: '完成每日编程挑战，获取 XP 奖励', time: '5 分钟前', read: true },
  ]

  // 初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('yicode_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  useEffect(() => {
    // 组件挂载时轮询一次任务状态（展示链路打通）
    fetch(API_BASE + '/tasks')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.tasks && data.tasks.length > 0) {
          const first = data.tasks[0]
          setRunStatus({ id: first.id, logFile: first.logFile || '' })
        }
      })
      .catch(() => { /* 后端未启动时静默 */ })
  }, [setRunStatus])

  return (
    <div className="topbar">
      <div className="topbar-title">
        <i className={`fas ${icon}`}></i>
        {title}
      </div>
      <div className="search-box">
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="搜索题目、代码、知识点..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setSearchQuery('') }}
        />
        {searchQuery && (
          <button
            className="search-clear"
            onClick={() => setSearchQuery('')}
            title="清除搜索"
          >
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>
      {/* AI 设置齿轮 */}
      <div style={{ position: 'relative' }}>
        <button
          className="icon-btn"
          title="AI 设置"
          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
        >
          <i className="fas fa-cog"></i>
        </button>
        {showApiKeyInput && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '8px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '14px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 9999, minWidth: '260px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-primary)' }}>
              <i className="fas fa-key" style={{ marginRight: '6px', color: 'var(--primary-light)' }}></i>
              MiMo API Key
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: '6px',
                background: 'var(--bg-main)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '6px 10px',
              }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="输入 API Key"
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                    fontSize: '13px', width: '100%', outline: 'none', padding: '0',
                  }}
                />
                <button
                  className="icon-btn"
                  style={{ padding: '2px', fontSize: '10px', flexShrink: 0 }}
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? '隐藏' : '显示'}
                >
                  <i className={`fas ${showApiKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={saveApiKey}
              >
                保存
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              用于 AI 助教的智能回复
            </div>
          </div>
        )}
      </div>
      <div className="topbar-actions">
        {/* 帮助按钮 */}
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" title="帮助" onClick={() => { setShowHelp(!showHelp); setShowNotifications(false) }}>
            <i className="fas fa-question"></i>
          </button>
          {showHelp && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '8px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 9999, minWidth: '280px',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                <i className="fas fa-question-circle" style={{ marginRight: '8px', color: 'var(--primary-light)' }}></i>
                快捷键帮助
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div><kbd>Ctrl</kbd> + <kbd>Enter</kbd> - 运行代码</div>
                <div><kbd>Ctrl</kbd> + <kbd>S</kbd> - 保存草稿</div>
                <div><kbd>Ctrl</kbd> + <kbd>/</kbd> - 注释代码</div>
                <div><kbd>Esc</kbd> - 清除搜索</div>
              </div>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
                YiCode v0.13.0 · 智能编程学习平台
              </div>
            </div>
          )}
        </div>

        {/* 消息通知按钮 */}
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" title="消息" onClick={() => { setShowNotifications(!showNotifications); setShowHelp(false) }}>
            <i className="fas fa-bell"></i>
            <span className="notif-dot"></span>
          </button>
          {showNotifications && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '8px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 9999, minWidth: '300px', maxHeight: '400px', overflowY: 'auto',
            }}>
              <div style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                <i className="fas fa-bell" style={{ marginRight: '8px', color: 'var(--primary-light)' }}></i>
                消息通知
              </div>
              {notifications.map(n => (
                <div key={n.id} style={{
                  padding: '12px', borderRadius: '8px', marginTop: '4px',
                  background: n.read ? 'transparent' : 'rgba(99, 102, 241, 0.1)',
                  cursor: 'pointer',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>{n.text}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 主题切换按钮 */}
        <button className="icon-btn" title={isDarkTheme ? '切换到亮色主题' : '切换到暗色主题'} onClick={onToggleTheme}>
          <i className={`fas ${isDarkTheme ? 'fa-sun' : 'fa-moon'}`}></i>
        </button>

        <div className="topbar-user">
          <div className="topbar-avatar">{user.avatar}</div>
          <span className="topbar-username">{user.username}</span>
          <button className="icon-btn" title="退出登录" onClick={onLogout}>
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    </div>
  )
}

// ============== 仪表盘 ==============
function Dashboard({ setPage, userId }: { setPage: (p: PageKey) => void; userId: number }) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    streak_days: 0, xp: 0, completed_tasks: 0, total_tasks: 0, total_exercises: 0
  })
  const [leaderboard, setLeaderboard] = useState<Array<{
    id: number; username: string; avatar: string; level: number; xp: number; streak_days: number; rank_num: number
  }>>([])
  const [tasks, setTasks] = useState<Array<{
    id: number; user_id: number; title: string; completed: number; created_at: string
  }>>([])
  const [activities, setActivities] = useState<Array<{
    id: number; user_id: number; type: string; description: string; created_at: string
  }>>([])
  const [courses, setCourses] = useState<Array<{
    id: number; title: string; language: string; difficulty: string; icon: string; color: string; instructor: string; student_count: number
  }>>([])
  const [learningProgress, setLearningProgress] = useState<Array<{
    course_id?: number; progress_pct?: number
  }>>([])
  const loadDashboard = async () => {
    try {
      const resp = await fetch(`${API_BASE}/users/${userId}/dashboard`)
      if (resp.ok) {
        const data = await resp.json()
        setStats(data.stats || {})
        setLeaderboard(data.leaderboard || [])
        setTasks(data.tasks || [])
        setActivities(data.activities || [])
        setLearningProgress(data.learning_progress || [])
      }
    } catch (e) {
      // 失败时保持空数组，不崩溃
    } finally {
      setLoading(false)
    }
  }

  const loadCourses = async () => {
    try {
      const resp = await fetch(API_BASE + '/courses')
      if (resp.ok) {
        const data = await resp.json()
        setCourses(data.courses || [])
      }
    } catch (e) {
      // 失败时保持空数组
    }
  }

  useEffect(() => {
    loadDashboard()
    loadCourses()
  }, [userId])

  const toggleTask = async (taskId: number, currentCompleted: number) => {
    const newCompleted = currentCompleted === 0
    try {
      await fetch(`${API_BASE}/tasks/${taskId}?completed=${newCompleted}`, { method: 'PUT' })
      await loadDashboard()
    } catch (e) {
      // 忽略切换失败
    }
  }

  const activityIcon = (type: string) => {
    switch (type) {
      case 'code': return 'fa-code'
      case 'learn': return 'fa-book'
      case 'achieve': return 'fa-trophy'
      case 'social': return 'fa-users'
      default: return 'fa-history'
    }
  }

  const activityColor = (type: string) => {
    switch (type) {
      case 'code': return '#6366f1'
      case 'learn': return '#10b981'
      case 'achieve': return '#f59e0b'
      case 'social': return '#14b8a6'
      default: return '#6366f1'
    }
  }

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const diff = (now.getTime() - d.getTime()) / 1000
      if (diff < 60) return '刚刚'
      if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
      if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
      return `${Math.floor(diff / 86400)} 天前`
    } catch {
      return ''
    }
  }

  const courseAbbr = (lang: string) => {
    switch (lang) {
      case 'py': return 'Py'
      case 'js': return 'JS'
      case 'cpp': return 'C++'
      case 'java': return 'Jv'
      case 'go': return 'Go'
      case 'cs': return 'C#'
      default: return lang.slice(0, 2).toUpperCase()
    }
  }

  if (loading) {
    return (
      <div className="fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: '32px', color: 'var(--accent)' }}></i>
      </div>
    )
  }

  const statCards = [
    { cls: 'pink', icon: 'fa-fire', val: `${stats.streak_days} 天`, lbl: '连续学习', trend: `+${stats.streak_days} 天`, up: true },
    { cls: 'teal', icon: 'fa-star', val: `${stats.xp}`, lbl: '累计 XP', trend: `+${stats.xp}`, up: true },
    { cls: 'purple', icon: 'fa-check-circle', val: `${stats.completed_tasks}/${stats.total_tasks}`, lbl: '已完成任务', trend: '本周', up: true },
    { cls: 'orange', icon: 'fa-bug', val: `${stats.total_exercises}`, lbl: '题库总量', trend: '持续更新', up: true },
  ]

  return (
    <div className="fade-in">
      <div className="dashboard-grid">
        {statCards.map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div className={`stat-icon`}><i className={`fas ${s.icon}`}></i></div>
            <div className="stat-value">{s.val}</div>
            <div className="stat-label">{s.lbl}</div>
            <div className={`stat-trend ${s.up ? 'up' : 'down'}`}>
              <i className={`fas fa-arrow-${s.up ? 'up' : 'down'}`}></i>
              {s.trend}
            </div>
          </div>
        ))}

        <div className="panel learning-panel">
          <div className="panel-header">
            <div className="panel-title"><i className="fas fa-book-open"></i> 继续学习</div>
            <div className="panel-action" onClick={() => setPage('learn')}>
              全部课程 <i className="fas fa-chevron-right"></i>
            </div>
          </div>
          <div className="learning-cards">
            {courses.slice(0, 4).map((c, i) => {
              const prog = learningProgress.find(p => p.course_id === c.id)
              const pct = prog?.progress_pct ?? 0
              return (
                <div key={i} className="learning-card" onClick={() => setPage('editor')}>
                  <div className={`learning-icon ${c.language}`}>
                    {courseAbbr(c.language)}
                  </div>
                  <div className="learning-info">
                    <div className="learning-name">{c.title}</div>
                    <div className="learning-meta">{c.instructor} · {c.student_count} 学员 · {pct}%</div>
                    <div className="progress-bar">
                      <div className={`progress-fill ${c.language}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel rank-panel">
          <div className="panel-header">
            <div className="panel-title"><i className="fas fa-trophy"></i> 本周排行榜</div>
          </div>
          <div className="rank-list">
            {leaderboard.map((r, i) => (
              <div key={i} className="rank-item">
                <div className="rank-num">{r.rank_num}</div>
                <div className={`rank-avatar ${r.avatar}`}>{r.username.slice(-2)}</div>
                <div className="rank-info">
                  <div className="rank-name">{r.username}</div>
                  <div className="rank-lvl">Lv.{r.level}</div>
                </div>
                <div className="rank-xp">{r.xp} XP</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel todo-panel">
          <div className="panel-header">
            <div className="panel-title"><i className="fas fa-tasks"></i> 今日学习任务</div>
            <div className="panel-action" onClick={() => setPage('learn')}>
              <i className="fas fa-plus"></i> 添加任务
            </div>
          </div>
          <div className="todo-list">
            {tasks.map((t, i) => (
              <div key={i} className={`todo-item ${t.completed === 1 ? 'done' : ''}`} onClick={() => toggleTask(t.id, t.completed)}>
                <div className="todo-check">{t.completed === 1 && <i className="fas fa-check"></i>}</div>
                <div className="todo-content">
                  <div className="todo-title">{t.title}</div>
                  <div className="todo-desc">{formatTime(t.created_at)}</div>
                </div>
                <div className="todo-tag tag-medium">{t.completed === 1 ? '已完成' : '进行中'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel activity-panel">
          <div className="panel-header">
            <div className="panel-title"><i className="fas fa-history"></i> 最近活动</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activities.map((a, i) => {
              const color = activityColor(a.type)
              return (
                <div key={i} style={{ display: 'flex', gap: '12px', padding: '8px', borderRadius: '8px' }}>
                  <div style={{
                    width: '36px', height: '36px',
                    borderRadius: '10px',
                    background: `${color}22`,
                    color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className={`fas ${activityIcon(a.type)}`}></i>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '3px' }}>{a.description}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatTime(a.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== 代码编辑器 ==============
function CodeEditor({ onRunStatus: _, exercise, onClearExercise, userId, isDarkTheme }: {
  onRunStatus: (s: { id: string; logFile: string } | null) => void
  exercise: Exercise | null
  onClearExercise: () => void
  userId: number
  isDarkTheme: boolean
}) {
  const [lang, setLang] = useState<LangKey>('py')
  const [code, setCode] = useState<string>(CODE_TEMPLATES.py)
  const [outputTab, setOutputTab] = useState<'result' | 'error' | 'debug'>('result')
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([])
  const [running, setRunning] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null)
  const [restored, setRestored] = useState(false)  // 防止重复恢复
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // ====== 挂载时：从数据库恢复上次编辑的题目和代码（刷新恢复） ======
  useEffect(() => {
    if (restored) return
    const exerciseId = localStorage.getItem('yicode_exercise_id')
    if (exerciseId && !exercise) {
      // 刷新后恢复：从 API 获取最新草稿
      setRestored(true)
      fetch(`${API_BASE}/drafts/${userId}/latest`)
        .then(r => r.json())
        .then(data => {
          if (data.found && data.exercise) {
            const ex = data.exercise as Exercise
            setActiveExercise(ex)
            const exLang = (ex.language || 'py') as LangKey
            const validLangs: LangKey[] = ['py', 'js', 'cpp', 'java', 'go', 'cs']
            const safeLang = validLangs.includes(exLang) ? exLang : 'py'
            setLang(safeLang)
            setCode(data.code || ex.starter_code || CODE_TEMPLATES[safeLang])
            setOutput([])
          }
        })
        .catch(() => {})
    } else if (exerciseId && exercise) {
      // 有 exercise prop 且 localStorage 有 id：检查是否有草稿
      setRestored(true)
      fetch(`${API_BASE}/drafts/${userId}/${exerciseId}`)
        .then(r => r.json())
        .then(data => {
          if (data.found && data.draft) {
            // 有草稿：加载草稿代码
            setActiveExercise(exercise)
            setLang(data.draft.language as LangKey)
            setCode(data.draft.code)
          } else {
            // 无草稿：加载 starter_code
            setActiveExercise(exercise)
            const exLang = (exercise.language || 'py') as LangKey
            const validLangs: LangKey[] = ['py', 'js', 'cpp', 'java', 'go', 'cs']
            const safeLang = validLangs.includes(exLang) ? exLang : 'py'
            setLang(safeLang)
            setCode(exercise.starter_code || CODE_TEMPLATES[safeLang])
          }
          setOutput([])
        })
        .catch(() => {
          // API 失败时仍加载 starter_code
          setActiveExercise(exercise)
          const exLang = (exercise.language || 'py') as LangKey
          const validLangs: LangKey[] = ['py', 'js', 'cpp', 'java', 'go', 'cs']
          const safeLang = validLangs.includes(exLang) ? exLang : 'py'
          setLang(safeLang)
          setCode(exercise.starter_code || CODE_TEMPLATES[safeLang])
        })
    }
  }, [exercise, userId, restored])

  // ====== 自动保存草稿到数据库（debounce 2秒） ======
  const scheduleAutoSave = (newCode: string, newLang: LangKey) => {
    if (!activeExercise) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(API_BASE + '/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            exercise_id: activeExercise.id,
            language: newLang,
            code: newCode,
            exercise_title: activeExercise.title,
          }),
        })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch {
        setSaveStatus('idle')
      }
    }, 2000)
  }

  const langs: { key: LangKey; label: string; cls: string }[] = [
    { key: 'py', label: 'Python 3', cls: 'py' },
    { key: 'js', label: 'JavaScript', cls: 'js' },
    { key: 'cpp', label: 'C++17', cls: 'cpp' },
    { key: 'java', label: 'Java 21', cls: 'java' },
    { key: 'go', label: 'Go 语言', cls: 'go' },
    { key: 'cs', label: 'C# (.NET 8)', cls: 'cs' },
  ]

  const lineCount = useMemo(() => code.split('\n').length, [code])

  const switchLang = (k: LangKey) => {
    setLang(k)
    // 切换语言时只在无题目时加载模板，有题目时保留当前代码不变
    if (!activeExercise) {
      setCode(CODE_TEMPLATES[k])
    }
    setShowLangMenu(false)
  }

  // 重置代码：有题目时重置到题目 starter_code，无题目时重置到语言模板
  const resetCode = () => {
    if (activeExercise && activeExercise.starter_code) {
      setCode(activeExercise.starter_code)
      scheduleAutoSave(activeExercise.starter_code!, lang)
    } else {
      setCode(CODE_TEMPLATES[lang])
    }
    setOutput([])
  }

  // 新建文件：清除当前题目，重置为空白模板
  const newFile = () => {
    setActiveExercise(null)
    onClearExercise()
    setCode(CODE_TEMPLATES[lang])
    setOutput([])
  }

  const runCode = async () => {
    setRunning(true)
    setOutput([])
    const startTime = Date.now()
    setOutput([{ type: 'meta', text: `[YiCode] 正在启动 ${langs.find(l => l.key === lang)?.label} 运行环境...` }])

    // 先尝试调用后端真实执行
    try {
      const resp = await fetch(API_BASE + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code })
      })
      const data = await resp.json()
      if (!resp.ok) {
        const detail = data?.detail || (typeof data === 'string' ? data : `HTTP ${resp.status}`)
        setOutput([{ type: 'error', text: `[服务端] ${detail}` }])
        setRunning(false)
        return
      }
      // 后端 /run 是同步执行，直接返回 stdout/stderr
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
      const outLines: Array<{ type: string; text: string }> = [
        { type: 'meta', text: `[YiCode] ${data.language || lang} · 耗时 ${data.elapsed_seconds || elapsed}s · 退出码 ${data.exit_code}` },
      ]
      if (data.stdout) outLines.push({ type: 'success', text: data.stdout })
      if (data.stderr) outLines.push({ type: 'error', text: data.stderr })
      if (data.error) outLines.push({ type: 'error', text: data.error })
      if (!data.stdout && !data.stderr && !data.error) {
        outLines.push({ type: 'warn', text: '（程序执行无输出，请检查你的代码是否包含 print/console.log/cout 等输出语句）' })
      }
      setOutput(prev => [...prev, ...outLines])
      setRunning(false)
      return
    } catch { /* 后端离线时使用本地模拟 */ }

    // 本地模拟执行（保证前端界面可用）
    await new Promise(r => setTimeout(r, 1200))
    const results = simulateRun(lang, code)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

    const newOutput: Array<{ type: string; text: string }> = [
      { type: 'meta', text: `[YiCode] 编译/解释完成，执行耗时 ${elapsed}s` },
    ]
    if (results.stdout) newOutput.push({ type: 'success', text: results.stdout })
    if (results.stderr) newOutput.push({ type: 'error', text: results.stderr })
    if (!results.stdout && !results.stderr) {
      newOutput.push({ type: 'warn', text: '（程序执行无输出，请检查你的代码是否包含 print/console.log/cout 等输出语句）' })
    }
    newOutput.push({ type: 'meta', text: `[YiCode] 进程已退出，退出码 ${results.exitCode}` })
    setOutput(newOutput)
    setRunning(false)
  }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {activeExercise && (
        <div className="exercise-banner">
          <div className="exercise-banner-info">
            <div className="exercise-banner-title">
              <i className="fas fa-code-branch"></i> {activeExercise.title}
              <span className={`ex-diff ${activeExercise.difficulty === '简单' ? 'tag-easy' : activeExercise.difficulty === '困难' ? 'tag-hard' : 'tag-medium'}`}>
                {activeExercise.difficulty}
              </span>
              {activeExercise.tags && <span className="exercise-tags">{activeExercise.tags}</span>}
            </div>
            <div className="exercise-banner-desc">{activeExercise.description}</div>
          </div>
          <div className="exercise-banner-right">
            {saveStatus !== 'idle' && (
              <span className="save-status" style={{ color: saveStatus === 'saving' ? '#fbbf24' : '#10b981', fontSize: '12px' }}>
                <i className={`fas ${saveStatus === 'saving' ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                {saveStatus === 'saving' ? '保存中...' : '已保存'}
              </span>
            )}
            <button className="btn btn-secondary exercise-close" onClick={() => { setActiveExercise(null); onClearExercise() }}>
              <i className="fas fa-times"></i> 退出题目
            </button>
          </div>
        </div>
      )}
      <div className="editor-layout">
        {/* 左侧：代码编辑器 */}
        <div className="editor-pane">
          <div className="editor-tabs">
            <div className="editor-tab active">
              <i className={`fas fa-file-code`} style={{ color: 'var(--primary-light)' }}></i>
              main.{lang === 'py' ? 'py' : lang === 'js' ? 'js' : lang === 'cpp' ? 'cpp' : lang === 'java' ? 'java' : lang === 'go' ? 'go' : 'cs'}
              <i className="fas fa-circle" style={{ fontSize: '6px', color: 'var(--warning)' }}></i>
            </div>
            <div className="editor-tab" style={{ cursor: 'pointer' }} onClick={newFile} title="新建文件（清除当前题目）">
              <i className="fas fa-plus"></i> 新建文件
            </div>
          </div>

          <div className="editor-toolbar">
            <div className="toolbar-left">
              <div
                className="lang-select"
                onClick={() => setShowLangMenu(!showLangMenu)}
                style={{ position: 'relative' }}
              >
                <div className={`lang-flag ${langs.find(l => l.key === lang)?.cls}`}>
                  {lang === 'py' ? 'Py' : lang === 'js' ? 'JS' : lang === 'cpp' ? 'C+' : lang === 'java' ? 'Jv' : lang === 'go' ? 'Go' : 'C#'}
                </div>
                <span>{langs.find(l => l.key === lang)?.label}</span>
                <i className={`fas fa-chevron-${showLangMenu ? 'up' : 'down'}`}></i>
                {showLangMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: '6px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '200px',
                    backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-lg)'
                  }}>
                    {langs.map(l => (
                      <div
                        key={l.key}
                        onClick={() => switchLang(l.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '9px 12px', borderRadius: '7px', cursor: 'pointer',
                          fontSize: '13px',
                          background: lang === l.key ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                          color: lang === l.key ? 'var(--primary-light)' : 'var(--text-secondary)',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = lang === l.key ? 'rgba(99, 102, 241, 0.15)' : 'transparent')}
                      >
                        <div className={`lang-flag ${l.cls}`}>
                          {l.key === 'py' ? 'Py' : l.key === 'js' ? 'JS' : l.key === 'cpp' ? 'C+' : l.key === 'java' ? 'Jv' : l.key === 'go' ? 'Go' : 'C#'}
                        </div>
                        {l.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button className="btn btn-secondary"><i className="fas fa-folder"></i> 项目文件</button>
              <button className="btn btn-secondary"><i className="fas fa-terminal"></i> 终端</button>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={resetCode} title="重置为初始代码">
                <i className="fas fa-undo"></i> 重置代码
              </button>
              <button className="btn btn-outline" onClick={() => {
                const blob = new Blob([code], { type: 'text/plain' })
                const a = document.createElement('a')
                const url = URL.createObjectURL(blob)
                a.href = url
                a.download = `main.${lang}`
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              }}>
                <i className="fas fa-download"></i> 下载
              </button>
              <button
                className={`btn ${running ? 'btn-secondary' : 'btn-success'}`}
                onClick={runCode}
                disabled={running}
              >
                <i className={`fas ${running ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
                {running ? '执行中...' : '运行代码'}
              </button>
            </div>
          </div>

          <div className="code-editor-area">
            <MonacoCodeEditor
              value={code}
              onChange={(value) => { setCode(value); scheduleAutoSave(value, lang) }}
              language={lang}
              theme={isDarkTheme ? 'vs-dark' : 'light'}
              height="100%"
            />
          </div>

          <div className="output-panel">
            <div className="output-tabs">
              <div
                className={`output-tab ${outputTab === 'result' ? 'active' : ''}`}
                onClick={() => setOutputTab('result')}
              >
                <i className="fas fa-play-circle" style={{ marginRight: '5px' }}></i>
                运行结果
                {output.some(o => o.type === 'success') && (
                  <span style={{ marginLeft: '6px', color: 'var(--success)' }}>●</span>
                )}
              </div>
              <div
                className={`output-tab ${outputTab === 'error' ? 'active' : ''}`}
                onClick={() => setOutputTab('error')}
              >
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '5px' }}></i>
                错误/警告
                {output.some(o => o.type === 'error') && (
                  <span style={{ marginLeft: '6px', color: 'var(--danger)' }}>●</span>
                )}
              </div>
              <div
                className={`output-tab ${outputTab === 'debug' ? 'active' : ''}`}
                onClick={() => setOutputTab('debug')}
              >
                <i className="fas fa-bug" style={{ marginRight: '5px' }}></i>
                调试信息
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>
                <i className="fas fa-memory" style={{ marginRight: '5px' }}></i>
                内存: 25.4 MB · 行数: {lineCount}
              </div>
            </div>
            <div className="output-content">
              {output.length === 0 ? (
                <div className="output-meta">
                  <i className="fas fa-info-circle"></i> 点击右上角「运行代码」按钮开始执行...
                </div>
              ) : outputTab === 'result' ? (
                output.map((o, i) => (
                  <div key={i} className={`output-${o.type === 'success' ? 'success' : o.type === 'error' ? 'error' : o.type === 'warn' ? 'warn' : o.type === 'info' ? 'info' : 'meta'}`}>
                    {o.text}
                  </div>
                ))
              ) : outputTab === 'error' ? (
                output.filter(o => ['error', 'warn'].includes(o.type)).length === 0 ? (
                  <div className="output-success">
                    <i className="fas fa-check-circle"></i> 太棒了！当前代码没有检测到错误或警告。
                  </div>
                ) : output.filter(o => ['error', 'warn'].includes(o.type)).map((o, i) => (
                  <div key={i} className={o.type === 'error' ? 'output-error' : 'output-warn'}>{o.text}</div>
                ))
              ) : (
                <div className="output-info">
                  [调试信息] 运行环境：{langs.find(l => l.key === lang)?.label}<br />
                  [调试信息] 代码总行数：{lineCount}<br />
                  [调试信息] 字符总数：{code.length}<br />
                  [调试信息] 执行模式：本地沙箱模式 (安全隔离)<br />
                  [调试信息] 进程权限：受限 (无文件系统/网络访问)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：AI 助教面板 */}
        <AIPanel code={code} lang={lang} />
      </div>
    </div>
  )
}

// ============== AI 助教面板 ==============
function AIPanel({ code, lang, standalone }: { code?: string; lang?: LangKey; standalone?: boolean }) {
  const getWelcomeMsg = (m: string) => {
    if (m === 'deep') return `🧠 **深度思考模式** 已启用\n\n我会为你：\n• 深入分析问题本质，揭示底层原理\n• 提供多种解决方案并对比优劣\n• 给出实际应用场景和最佳实践\n\n有什么问题想深入探讨？`
    if (m === 'socratic') return `🎯 **苏格拉底引导模式** 已启用\n\n我不会直接告诉你答案，而是：\n• 通过提问引导你自己思考\n• 帮你一步步发现问题的解决方案\n• 鼓励你尝试和实验\n\n准备好了吗？告诉我你想学什么？`
    return `你好！我是你的 **AI 编程助教** 🤖✨\n\n我可以帮你：\n• 🔍 **检测代码问题** - 语法错误、逻辑漏洞、性能瓶颈\n• 💡 **优化建议** - 让代码更高效、更规范\n• 📚 **知识点讲解** - 随时解答编程疑问\n• 🚀 **自动补全** - 生成代码片段和解决方案\n\n请选择右上角的快捷操作，或直接向我提问！`
  }

  const [mode, setMode] = useState<'normal' | 'deep' | 'socratic'>(() => {
    return (localStorage.getItem('yicode_ai_mode') as any) || 'normal'
  })
  const [messages, setMessages] = useState<AIMessage[]>([
    { role: 'assistant', text: getWelcomeMsg(localStorage.getItem('yicode_ai_mode') || 'normal') },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const modeInfo = {
    normal: { icon: 'fa-robot', label: '普通模式', color: 'var(--primary)', desc: '直接回答问题' },
    deep: { icon: 'fa-brain', label: '深度思考', color: '#8b5cf6', desc: '深入分析原理' },
    socratic: { icon: 'fa-question-circle', label: '苏格拉底', color: '#10b981', desc: '引导式学习' },
  }

  const switchMode = (newMode: 'normal' | 'deep' | 'socratic') => {
    setMode(newMode)
    localStorage.setItem('yicode_ai_mode', newMode)
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', text: getWelcomeMsg(mode) }])
    setInput('')
  }

  const scrollRef = (el: HTMLDivElement | null) => {
    if (el) setTimeout(() => (el.scrollTop = el.scrollHeight), 10)
  }

  const sendMsg = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content) return
    const userMsg: AIMessage = { role: 'user', text: content }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    // 每次发送时从 localStorage 读取最新 API Key
    const currentApiKey = localStorage.getItem('yicode_ai_token') || ''

    // 先尝试后端 API
    let reply: AIMessage | null = null
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (currentApiKey) headers['X-API-Key'] = currentApiKey
      const resp = await fetch(API_BASE + '/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: content, code, language: lang, api_key: currentApiKey || undefined, mode })
      })
      if (resp.ok) {
        const data = await resp.json()
        reply = { role: 'assistant', text: data.reply || data.message || '好的，已收到！' }
      }
    } catch { /* 后端离线时使用本地规则库 */ }

    if (!reply) {
      reply = buildLocalAIReply(content, code || '', lang || 'py')
    }

    setTimeout(() => {
      setMessages(prev => [...prev, reply!])
      setSending(false)
    }, reply ? 0 : 600)
  }

  const quickActions = code ? [
    { icon: 'fa-search', label: '检查代码问题', cmd: '分析一下当前代码是否存在语法错误、逻辑漏洞或性能问题？' },
    { icon: 'fa-lightbulb', label: '优化代码建议', cmd: '请给出这段代码的 3 条具体优化建议，并解释为什么。' },
    { icon: 'fa-book-open', label: '解释代码逻辑', cmd: '请逐行解释这段代码的含义和执行流程，帮助我理解。' },
    { icon: 'fa-magic', label: 'AI 生成改进版', cmd: '请基于这段代码，生成一个更加规范、高效、带有良好注释的改进版本。' },
  ] : [
    { icon: 'fa-code', label: 'Python 入门', cmd: '给我一份 Python 零基础学习路线，包含 5 个关键知识点。' },
    { icon: 'fa-question-circle', label: '什么是递归？', cmd: '请用通俗易懂的方式解释「递归」是什么，并给出一个 Python 代码示例。' },
    { icon: 'fa-list-check', label: '期末复习', cmd: '帮我列出「数据结构与算法」期末考试的 10 个高频考点。' },
    { icon: 'fa-trophy', label: '刷题建议', cmd: '我是大二学生，准备参加 ACM 程序设计竞赛，请给我刷题计划建议。' },
  ]

  return (
    <div className={`ai-panel ${standalone ? '' : ''}`} style={standalone ? { maxWidth: '900px', margin: '0 auto', height: 'calc(100vh - 64px - 48px)' } : { height: '100%' }}>
      <div className="ai-header">
        <div className="ai-header-left">
          <div className="ai-avatar" style={{ background: `linear-gradient(135deg, ${modeInfo[mode].color}, ${modeInfo[mode].color}cc)` }}>
            <i className={`fas ${modeInfo[mode].icon}`}></i>
          </div>
          <div className="ai-info">
            <h3>AI 编程助教 · {modeInfo[mode].label}</h3>
            <p style={{ color: modeInfo[mode].color }}>{modeInfo[mode].desc}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {/* 模式切换按钮 */}
          {(Object.keys(modeInfo) as Array<'normal' | 'deep' | 'socratic'>).map(m => (
            <button
              key={m}
              className="icon-btn"
              title={modeInfo[m].label}
              onClick={() => switchMode(m)}
              style={{
                background: mode === m ? `${modeInfo[m].color}22` : 'transparent',
                border: mode === m ? `1px solid ${modeInfo[m].color}44` : '1px solid transparent',
                color: mode === m ? modeInfo[m].color : 'var(--text-muted)',
              }}
            >
              <i className={`fas ${modeInfo[m].icon}`} style={{ fontSize: '14px' }}></i>
            </button>
          ))}
          <button className="icon-btn" title="清空对话" onClick={clearChat}>
            <i className="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="msg-header">
              {m.role === 'assistant' && <i className="fas fa-robot" style={{ color: 'var(--primary-light)' }}></i>}
              {m.role === 'assistant' ? <span>AI 助教</span> : <><i className="fas fa-user" style={{ color: 'var(--secondary)' }}></i><span>我</span></>}
            </div>
            <div className="msg-bubble" style={{ whiteSpace: 'pre-wrap' }}>
              {m.text.split(/(\*\*.*?\*\*|`[^`]+`|• |\n)/g).map((seg, j) => {
                if (/^\*\*.*\*\*$/.test(seg)) return <strong key={j} style={{ color: 'var(--primary-light)' }}>{seg.slice(2, -2)}</strong>
                if (/^`[^`]+`$/.test(seg)) return <code key={j}>{seg.slice(1, -1)}</code>
                if (seg === '• ') return <span key={j}>• </span>
                if (seg === '\n') return <br key={j} />
                return <span key={j}>{seg}</span>
              })}
              {m.issues && m.issues.map((iss, k) => (
                <div key={k} className={`issue-card ${iss.type === 'warning' ? 'warning' : iss.type === 'info' ? 'info' : ''}`}>
                  <div className="issue-head">
                    <span className={`tag tag-${iss.type}`}>
                      {iss.type === 'error' ? '错误' : iss.type === 'warning' ? '警告' : '建议'}
                    </span>
                    {iss.title}
                  </div>
                  <div className="issue-body">{iss.body}</div>
                  {iss.fix && <div className="issue-fix"><i className="fas fa-wrench"></i> {iss.fix}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {sending && (
          <div className="ai-msg assistant">
            <div className="msg-bubble">
              <i className="fas fa-spinner fa-spin"></i> 正在思考中...
            </div>
          </div>
        )}
      </div>

      <div className="ai-quick-actions">
        {quickActions.map((a, i) => (
          <button key={i} className="ai-action-btn" onClick={() => sendMsg(a.cmd)} disabled={sending}>
            <i className={`fas ${a.icon}`}></i> {a.label}
          </button>
        ))}
      </div>

      <div className="ai-input-wrap">
        <div className="ai-input">
          <textarea
            rows={1}
            placeholder="向 AI 助教提问，例如：第3行为什么报错？如何优化这个函数？..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMsg()
              }
            }}
          />
          <button className="send-btn" onClick={() => sendMsg()} disabled={sending || !input.trim()}>
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  )
}

// ============== 协作频道 ==============
type CollabRole = 'writer' | 'reviewer' | 'obs'
interface CollabMember {
  name: string
  role: CollabRole
  color: string
  joined_at?: string
}
const COLLAB_ROLE_LABEL: Record<CollabRole, string> = {
  writer: '写代码',
  reviewer: '评代码',
  obs: '观看中',
}
const COLLAB_AVATAR_COLORS = ['a', 'b', 'c', 'me']
const COLLAB_LANGS: { key: LangKey; label: string }[] = [
  { key: 'py', label: 'Python' },
  { key: 'js', label: 'JavaScript' },
  { key: 'cpp', label: 'C++' },
  { key: 'java', label: 'Java' },
  { key: 'go', label: 'Go' },
  { key: 'cs', label: 'C#' },
]
const COLLAB_ENTRY_INPUT = {
  width: '100%',
  padding: '11px 14px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
}

function CollabChannel({ username, token, isDarkTheme }: { username?: string; token?: string; isDarkTheme?: boolean }) {
  const [view, setView] = useState<'entry' | 'room'>('entry')
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const name = username || ''
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState<{ room_code: string; lan_ip: string; ws_url: string; share_url: string } | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [lanIp, setLanIp] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [host, setHost] = useState('')
  const [members, setMembers] = useState<CollabMember[]>([])
  const [myName, setMyName] = useState('')
  const [myColor, setMyColor] = useState('a')
  const [myRole, setMyRole] = useState<CollabRole>('writer')
  const [code, setCode] = useState<string>(CODE_TEMPLATES.py)
  const [lang, setLang] = useState<LangKey>('py')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [copied, setCopied] = useState('')
  const [writeRequests, setWriteRequests] = useState<string[]>([]) // 申请写权限的用户名列表
  const [writeRequested, setWriteRequested] = useState(false) // 当前用户是否已申请
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([])

  const wsRef = useRef<WebSocket | null>(null)
  const syncTimer = useRef<number | null>(null)

  const pickColor = (n: string, list: CollabMember[]) => {
    const used = new Set(list.map(m => m.color))
    for (const c of COLLAB_AVATAR_COLORS) if (!used.has(c)) return c
    return COLLAB_AVATAR_COLORS[Math.abs(n.length) % COLLAB_AVATAR_COLORS.length]
  }
  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }
  const sendWS = (msg: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }
  const scheduleSync = (syncCode: string, syncLang: LangKey) => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => {
      sendWS({ type: 'code_sync', code: syncCode, lang: syncLang })
      syncTimer.current = null
    }, 300)
  }
  const onLangChange = (l: LangKey) => {
    setLang(l)
    let next = code
    if (!CODE_TEMPLATES[l].includes(code.slice(0, 30))) {
      next = CODE_TEMPLATES[l]
      setCode(next)
    }
    scheduleSync(next, l)
    sendWS({ type: 'lang_change', lang: l })
  }
  const onRoleChange = (r: CollabRole) => {
    setMyRole(r)
    sendWS({ type: 'role_change', role: r })
  }
  // 申请写权限
  const requestWrite = () => {
    sendWS({ type: 'write_request' })
    setWriteRequested(true)
  }
  // 房主审批写权限
  const approveWrite = (targetName: string, approved: boolean) => {
    sendWS({ type: 'write_approve', target: targetName, approved })
    setWriteRequests(prev => prev.filter(n => n !== targetName))
  }
  const sendChat = () => {
    const t = chatInput.trim()
    if (!t) return
    sendWS({ type: 'chat', text: t })
    setChatMessages(prev => [...prev, {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      author: myName,
      avatar: myColor,
      text: t,
      time: new Date().toTimeString().slice(0, 5),
      self: true,
    }])
    setChatInput('')
  }
  const runCode = async () => {
    setRunning(true)
    setOutput([])
    const startTime = Date.now()
    setOutput([{ type: 'meta', text: `[YiCode] 正在启动 ${COLLAB_LANGS.find(l => l.key === lang)?.label || lang} 运行环境...` }])
    try {
      const resp = await fetch(API_BASE + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ language: lang, code }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setOutput([
          { type: 'error', text: data?.detail ? `[服务端] ${data.detail}` : `[服务端] HTTP ${resp.status}` },
        ])
        setRunning(false)
        return
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
      const outLines: Array<{ type: string; text: string }> = [
        { type: 'meta', text: `[YiCode] ${data.language || lang} · 耗时 ${data.elapsed_seconds || elapsed}s · 退出码 ${data.exit_code}` },
      ]
      if (data.stdout) outLines.push({ type: 'success', text: data.stdout })
      if (data.stderr) outLines.push({ type: 'error', text: data.stderr })
      if (data.error) outLines.push({ type: 'error', text: data.error })
      if (!data.stdout && !data.stderr && !data.error) {
        outLines.push({ type: 'warn', text: '（程序执行无输出，请检查是否包含 print/console.log/cout 等输出语句）' })
      }
      setOutput(outLines)
    } catch {
      // 后端不可达时使用本地模拟，保证前端仍可演示
      await new Promise(r => setTimeout(r, 800))
      const results = simulateRun(lang, code)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
      const lines: Array<{ type: string; text: string }> = [
        { type: 'meta', text: `[本地模拟] ${lang} · 耗时 ${elapsed}s` },
      ]
      if (results.stdout) lines.push({ type: 'success', text: results.stdout })
      if (results.stderr) lines.push({ type: 'error', text: results.stderr })
      if (!results.stdout && !results.stderr) {
        lines.push({ type: 'warn', text: '（程序执行无输出，请检查是否包含 print/console.log/cout 等输出语句）' })
      }
      setOutput(lines)
    } finally {
      setRunning(false)
    }
  }
  const leaveRoom = (reason?: string, clearStorage = true) => {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null }
    const ws = wsRef.current
    if (ws) { try { ws.close() } catch { /* ignore */ } wsRef.current = null }
    if (clearStorage) localStorage.removeItem('yicode_collab_room')
    setView('entry')
    setRoomCode(''); setLanIp(''); setShareUrl(''); setHost('')
    setMembers([]); setMyName(''); setMyColor('a'); setMyRole('writer')
    setCode(CODE_TEMPLATES.py); setLang('py')
    setChatMessages([]); setChatInput('')
    setCreated(null); setJoinCode('')
    setWriteRequests([]); setWriteRequested(false)
    setRunning(false); setOutput([])
    setErr(reason || '')
  }
  // WebSocket 生命周期：挂载时检查 localStorage 自动重连，卸载时不关闭 WS（刷新时让浏览器自然处理）
  useEffect(() => {
    // 刷新后自动重连
    try {
      const saved = localStorage.getItem('yicode_collab_room')
      if (saved) {
        const info = JSON.parse(saved)
        if (info.roomCode && info.myName && info.wsUrl) {
          setRoomCode(info.roomCode); setMyName(info.myName); setMyColor(info.myColor || 'a'); setHost(info.host || '')
          setLanIp(info.lanIp || ''); setShareUrl(info.shareUrl || '')
          setMyRole(info.myName === info.host ? 'writer' : 'obs')
          setView('room')
          connectRoom(info.wsUrl, username || info.myName, info.myColor || 'a', info.host || '')
        }
      }
    } catch { /* ignore */ }
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
      // 不在此关闭 WS：刷新时浏览器会自然关闭连接，避免服务端过早移除成员
    }
  }, [])
  const connectRoom = (wsUrl: string, userName: string, color: string, hostName: string) => {
    setErr('')
    let everOpen = false
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onopen = () => {
        everOpen = true
        // 房主默认为 writer，其他成员默认为 obs（需要申请写权限）
        const defaultRole = userName === hostName ? 'writer' : 'obs'
        ws.send(JSON.stringify({ token, name: userName, role: defaultRole, color }))
      }
      ws.onmessage = (ev: MessageEvent) => {
        let data: Record<string, any>
        try { data = JSON.parse(ev.data) } catch { return }
        switch (data.type) {
          case 'room_state':
            setHost(data.host || hostName)
            setMembers((data.members || []) as CollabMember[])
            if (data.code) setCode(data.code as string)
            if (data.language) setLang(data.language as LangKey)
            // 同步当前用户的角色（非房主默认为 obs）
            { const me = (data.members || []).find((m: CollabMember) => m.name === userName)
              if (me) setMyRole(me.role as CollabRole)
            }
            break
          case 'member_joined':
          case 'member_left':
            setMembers((data.members || []) as CollabMember[])
            break
          case 'code_update':
            // 仅本地 setState：受控 textarea 的程序化赋值不会触发 onChange，且服务端不会把 code_update 回广播给发送者，因此不会形成回环
            setCode(data.code || '')
            if (data.lang) setLang(data.lang as LangKey)
            break
          case 'lang_changed':
            if (data.lang) setLang(data.lang as LangKey)
            break
          case 'role_changed':
            setMembers((data.members || []) as CollabMember[])
            { const me = (data.members || []).find((m: CollabMember) => m.name === userName)
              if (me) {
                setMyRole(me.role as CollabRole)
                // 如果被批准为 writer，清除申请状态
                if (me.role === 'writer' && data.approved && data.target === userName) {
                  setWriteRequested(false)
                }
              }
            }
            break
          case 'write_request':
            // 房主收到成员的写权限申请
            if (data.from) {
              setWriteRequests(prev => prev.includes(data.from) ? prev : [...prev, data.from])
            }
            break
          case 'chat':
            if ((data.from || '') === userName) return // 自己发送的消息已乐观渲染，忽略服务端回广播
            setChatMessages(prev => [...prev, {
              id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
              author: data.from || '?',
              avatar: data.color || 'a',
              text: data.text || '',
              time: data.time || '',
            }])
            break
          case 'room_closed':
            leaveRoom('房间已被房主关闭')
            break
          default:
            break
        }
      }
      ws.onclose = () => {
        if (wsRef.current === ws) {
          // 不清除 localStorage，保留重连信息
          leaveRoom(everOpen ? '连接已断开，请刷新页面重新连接' : '无法连接到房间服务，请确认本地服务（services/local_api）已启动', false)
        }
      }
    } catch (e) {
      setErr('连接失败：' + (e as Error).message)
    }
  }
  const createRoom = async () => {
    const n = (username || name).trim()
    if (!n) { setErr('请输入昵称'); return }
    setErr(''); setBusy(true)
    try {
      const r = await fetch(API_BASE + '/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ host_name: n, language: 'py' }),
      })
      if (r.status === 401 || r.status === 403) { setErr('登录已过期，请重新登录后再创建房间'); return }
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setCreated(await r.json())
    } catch (e) {
      setErr('创建房间失败：' + (e as Error).message + '（请确认本地服务运行在 ' + API_BASE + '）')
    } finally { setBusy(false) }
  }
  const saveRoomInfo = (info: { roomCode: string; myName: string; myColor: string; host: string; wsUrl: string; lanIp: string; shareUrl: string }) => {
    localStorage.setItem('yicode_collab_room', JSON.stringify(info))
  }
  const enterCreated = () => {
    if (!created) return
    const n = (username || name).trim()
    const color = pickColor(n, [])
    const wsUrl = created.ws_url || (WS_BASE + '/ws/room/' + created.room_code)
    setMyName(n); setMyColor(color); setMyRole('writer')
    setRoomCode(created.room_code); setLanIp(created.lan_ip); setShareUrl(created.share_url); setHost(n)
    setView('room')
    saveRoomInfo({ roomCode: created.room_code, myName: n, myColor: color, host: n, wsUrl, lanIp: created.lan_ip, shareUrl: created.share_url })
    connectRoom(wsUrl, n, color, n)
  }
  const joinRoom = async () => {
    const n = (username || name).trim()
    const c = joinCode.trim()
    if (!n) { setErr('请输入昵称'); return }
    if (c.length !== 6) { setErr('请输入 6 位数字房间码'); return }
    setErr(''); setBusy(true)
    try {
      const r = await fetch(API_BASE + '/rooms/' + c, { headers: authHeaders() })
      if (r.status === 401 || r.status === 403) { setErr('登录已过期，请重新登录后再加入房间'); return }
      if (!r.ok) { setErr('房间 ' + c + ' 不存在或已关闭'); return }
      const d = await r.json()
      const list = (d.members || []) as CollabMember[]
      const color = pickColor(n, list)
      const wsUrl = WS_BASE + '/ws/room/' + c
      setMyName(n); setMyColor(color); setMyRole('obs')
      setRoomCode(c); setLanIp(d.lan_ip || ''); setShareUrl(d.share_url || ('http://' + (d.lan_ip || '127.0.0.1') + ':1420/?room=' + c)); setHost(d.host || '')
      setMembers(list)
      setView('room')
      saveRoomInfo({ roomCode: c, myName: n, myColor: color, host: d.host || '', wsUrl, lanIp: d.lan_ip || '', shareUrl: d.share_url || '' })
      connectRoom(wsUrl, n, color, d.host || '')
    } catch (e) {
      setErr('加入失败：' + (e as Error).message)
    } finally { setBusy(false) }
  }
  const copyText = (text: string, key: string) => {
    if (!text) return
    try {
      navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500) })
    } catch { /* ignore */ }
  }
  // ===== 入口界面 =====
  if (view === 'entry') {
    return (
      <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24, overflow: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>
            <i className="fas fa-network-wired" style={{ marginRight: 10, color: 'var(--primary-light)' }}></i>局域网协作编码
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>同一局域网下创建房间或输入房间码，实时共享代码与讨论</div>
        </div>

        <div style={{ width: '100%', maxWidth: 460, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 22, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setMode('create'); setErr(''); setCreated(null) }}>
              <i className="fas fa-plus"></i> 创建房间
            </button>
            <button className={`btn ${mode === 'join' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setMode('join'); setErr(''); setCreated(null) }}>
              <i className="fas fa-door-open"></i> 加入房间
            </button>
          </div>

          {mode === 'create' && !created && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>登录账号</div>
              <input value={username || name} readOnly onKeyDown={e => e.key === 'Enter' && createRoom()} placeholder="登录账号" style={COLLAB_ENTRY_INPUT} />
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={createRoom} disabled={busy}>
                <i className="fas fa-magic"></i> {busy ? '创建中...' : '创建房间'}
              </button>
            </>
          )}

          {mode === 'create' && created && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ textAlign: 'center', paddingTop: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>房间已创建，房间码</div>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6, color: 'var(--primary-light)', fontFamily: "'JetBrains Mono', monospace", margin: '4px 0' }}>{created.room_code}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <i className="fas fa-wifi" style={{ marginRight: 5 }}></i>局域网地址：{created.lan_ip || '127.0.0.1'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => copyText(created.room_code, 'code')}>
                  <i className="fas fa-copy"></i> {copied === 'code' ? '已复制' : '复制房间码'}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => copyText(created.share_url, 'url')}>
                  <i className="fas fa-share-alt"></i> {copied === 'url' ? '已复制' : '复制分享链接'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '8px 10px', borderRadius: 8, lineHeight: 1.6, wordBreak: 'break-all', border: '1px solid var(--border)' }}>
                分享链接：{created.share_url}<br />其他同学打开该链接或输入房间码即可加入。
              </div>
              <button className="btn btn-success" style={{ width: '100%', justifyContent: 'center' }} onClick={enterCreated}>
                <i className="fas fa-sign-in-alt"></i> 进入协作房间
              </button>
            </div>
          )}

          {mode === 'join' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>房间码（6 位数字）</div>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={e => e.key === 'Enter' && joinRoom()} placeholder="例如 123456" inputMode="numeric" maxLength={6} style={{ ...COLLAB_ENTRY_INPUT, letterSpacing: 4, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '14px 0 6px' }}>登录账号</div>
              <input value={username || name} readOnly onKeyDown={e => e.key === 'Enter' && joinRoom()} placeholder="登录账号" style={COLLAB_ENTRY_INPUT} />
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={joinRoom} disabled={busy}>
                <i className="fas fa-sign-in-alt"></i> {busy ? '加入中...' : '加入房间'}
              </button>
            </>
          )}

          {err && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, fontSize: 12, color: '#fca5a5' }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }}></i>{err}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== 房间内界面 =====
  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部栏：房间号 + 局域网地址 + 在线成员 + 退出 */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fas fa-hashtag" style={{ color: 'var(--primary-light)' }}></i>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{roomCode}</span>
        </div>
        <div style={{ height: 28, width: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <i className="fas fa-wifi" style={{ color: 'var(--success)' }}></i>
          <span>局域网：{lanIp || '127.0.0.1'}</span>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => copyText(shareUrl || ('http://' + (lanIp || '127.0.0.1') + ':1420/?room=' + roomCode), 'top')}>
            <i className="fas fa-share-alt"></i> {copied === 'top' ? '已复制' : '分享链接'}
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="users-stack" style={{ gap: 4 }}>
            {members.slice(0, 6).map((m, i) => {
              const r = (m.role === 'reviewer' || m.role === 'obs' ? m.role : 'writer') as CollabRole
              return (
                <div key={i} className={`chat-avatar ${m.color || 'a'}`} title={m.name + ' · ' + COLLAB_ROLE_LABEL[r]} style={{ width: 30, height: 30, fontSize: 12, marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--bg-card)' }}>
                  {m.name.slice(0, 1)}
                </div>
              )
            })}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>在线 {members.length} 人</span>
        </div>
        {/* 写权限申请通知 - 仅房主可见 */}
        {myName === host && writeRequests.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8 }}>
            <i className="fas fa-bell" style={{ color: '#f59e0b' }}></i>
            <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>写权限申请：</span>
            {writeRequests.map(name => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{name}</span>
                <button className="btn" style={{ padding: '2px 6px', fontSize: 10, background: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' }} onClick={() => approveWrite(name, true)}>
                  <i className="fas fa-check"></i>
                </button>
                <button className="btn" style={{ padding: '2px 6px', fontSize: 10, background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }} onClick={() => approveWrite(name, false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        )}
        {/* 申请写权限按钮 - 仅观察者可见 */}
        {myName !== host && myRole === 'obs' && (
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={requestWrite} disabled={writeRequested}>
            <i className={writeRequested ? 'fas fa-hourglass-half' : 'fas fa-pen'}></i> {writeRequested ? '已申请，等待审批' : '申请写权限'}
          </button>
        )}
        <button className="btn btn-outline" style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)' }} onClick={() => leaveRoom()}>
          <i className="fas fa-sign-out-alt"></i> 退出房间
        </button>
      </div>

      <div className="collab-layout" style={{ flex: 1, minHeight: 0, height: 'auto' }}>
        {/* 左：成员列表 */}
        <div className="channel-list">
          <div className="channel-header">
            <h3><i className="fas fa-users" style={{ color: 'var(--primary-light)' }}></i> 在线成员 · {members.length}</h3>
            <div className="channel-search">
              <i className="fas fa-user-shield"></i>
              <input placeholder={'房主：' + (host || '-')} readOnly />
            </div>
          </div>
          <div className="channel-items">
            {members.map((m, i) => {
              const isMe = m.name === myName
              const r = (m.role === 'reviewer' || m.role === 'obs' ? m.role : 'writer') as CollabRole
              return (
                <div key={i} className={`channel-item ${isMe ? 'active' : ''}`} style={{ cursor: 'default' }}>
                  <div className="channel-row">
                    <div className={`chat-avatar ${m.color || 'a'}`} style={{ width: 30, height: 30, fontSize: 13 }}>{m.name.slice(0, 1)}</div>
                    <div className="channel-name">
                      {m.name}{isMe && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>(我)</span>}
                    </div>
                    {m.name === host && <div className="channel-dot"></div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className={`role-badge role-${r}`}>{COLLAB_ROLE_LABEL[r]}</span>
                    {isMe && m.name === host && (
                      <select value={myRole} onChange={e => onRoleChange(e.target.value as CollabRole)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 6px' }}>
                        <option value="writer">写代码</option>
                        <option value="reviewer">评代码</option>
                        <option value="obs">观看中</option>
                      </select>
                    )}
                    {myName === host && !isMe && r === 'writer' && (
                      <button className="btn" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }} onClick={() => approveWrite(m.name, false)} title="收回写权限">
                        <i className="fas fa-ban" style={{ marginRight: 3 }}></i>收回
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {members.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>等待成员加入...</div>
            )}
          </div>
        </div>

        {/* 中：共享代码编辑器 */}
        <div className="collab-main">
          <div className="collab-code">
            <div className="collab-users-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-file-code" style={{ color: 'var(--primary-light)' }}></i> 共享代码
                </strong>
                {myRole === 'writer' ? (
                  <span style={{ fontSize: 11, color: 'var(--success)', padding: '3px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: 5, border: '1px solid rgba(16,185,129,0.3)' }}>
                    <i className="fas fa-pen" style={{ marginRight: 4 }}></i>{myName === host ? '房主可编辑' : '可编辑'}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px', background: 'var(--bg-main)', borderRadius: 5, border: '1px solid var(--border)' }}>
                    <i className="fas fa-eye" style={{ marginRight: 4 }}></i>观察模式 - 可在聊天中发表建议
                  </span>
                )}
                <select value={lang} onChange={e => onLangChange(e.target.value as LangKey)} style={{ fontSize: 12, padding: '4px 8px' }} disabled={myRole !== 'writer'}>
                  {COLLAB_LANGS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                {myRole === 'writer' && (
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setCode(CODE_TEMPLATES[lang]); scheduleSync(CODE_TEMPLATES[lang], lang) }}>
                    <i className="fas fa-undo"></i> 重置
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button
                  className={`btn ${running ? 'btn-secondary' : 'btn-success'}`}
                  style={{ padding: '4px 14px', fontSize: 12 }}
                  onClick={runCode}
                  disabled={running}
                >
                  <i className={`fas ${running ? 'fa-spinner fa-spin' : 'fa-play'}`}></i> {running ? '执行中...' : '运行代码'}
                </button>
              </div>
            </div>
            <div className="code-editor-area">
              <MonacoCodeEditor
                value={code}
                onChange={(value) => {
                  if (myRole !== 'writer') return
                  setCode(value)
                  scheduleSync(value, lang)
                }}
                language={lang}
                theme={isDarkTheme !== false ? 'vs-dark' : 'light'}
                readOnly={myRole !== 'writer'}
                height="100%"
              />
            </div>
            {output.length > 0 && (
              <div style={{ flex: '0 0 auto', maxHeight: 180, overflow: 'auto', background: 'var(--bg-main)', borderTop: '1px solid var(--border)', padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
                {output.map((o, i) => (
                  <div key={i} style={{
                    color: o.type === 'error' ? '#ef4444' : o.type === 'success' ? 'var(--text-primary)' : o.type === 'warn' ? '#f59e0b' : 'var(--text-muted)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>{o.text}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右：聊天面板 */}
        <div className="chat-panel">
          <div className="chat-tabs">
            <div className="chat-tab active">
              <i className="fas fa-comments" style={{ marginRight: 5 }}></i>群聊
            </div>
          </div>
          <div className="chat-messages">
            {chatMessages.map(m => (
              <div key={m.id} className={`chat-msg-row ${m.self ? 'self' : ''}`}>
                <div className={`chat-avatar ${m.avatar}`}>{m.author.slice(0, 1)}</div>
                <div className="chat-bubble-wrap">
                  <div className="chat-name">{m.author}</div>
                  <div className="chat-bubble">{m.text}</div>
                  <div className="chat-time"><i className="far fa-clock"></i> {m.time}</div>
                </div>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>暂无消息，发条消息开始讨论吧～</div>
            )}
          </div>
          <div className="chat-input-area">
            <div className="chat-input-row">
              <input placeholder="输入消息，Enter发送..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
              <button className="chat-send" onClick={sendChat}>
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== 学习中心 ==============
function LearnCenter({ setPage, onOpenExercise, searchQuery }: {
  setPage: (p: PageKey) => void
  onOpenExercise: (ex: Exercise) => void
  searchQuery: string
}) {
  const [courses, setCourses] = useState<Array<{
    id: number; title: string; language: string; difficulty: string;
    icon: string; color: string; instructor: string; student_count: number;
  }>>([])
  const [exercises, setExercises] = useState<Array<Exercise>>([])
  const [loading, setLoading] = useState(true)
  const [difficultyFilter, setDifficultyFilter] = useState<string>('全部')
  const [showPublish, setShowPublish] = useState(false)
  // 发布题目表单
  const [newEx, setNewEx] = useState({ title: '', description: '', difficulty: '简单', language: 'py', starter_code: '', expected_output: '', tags: '' })
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE}/courses`).then(r => r.json()).then(d => d.courses || []).catch(() => []),
      fetch(`${API_BASE}/exercises`).then(r => r.json()).then(d => d.items || []).catch(() => []),
    ]).then(([c, e]) => {
      if (!alive) return
      setCourses(c)
      setExercises(e)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const diffCls = (d: string) => d === '简单' ? 'tag-easy' : d === '困难' ? 'tag-hard' : 'tag-medium'
  const langIcon = (l: string) => l === 'py' ? 'fa-python' : l === 'js' ? 'fa-js' : l === 'java' ? 'fa-java' : l === 'cpp' ? 'fa-microchip' : l === 'cs' ? 'fa-hashtag' : 'fa-code'
  const courseCount = courses.length
  const exerciseCount = exercises.length

  // 搜索 + 难度筛选
  const filteredExercises = exercises.filter(ex => {
    // 难度筛选
    if (difficultyFilter !== '全部' && ex.difficulty !== difficultyFilter) return false
    // 搜索筛选
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return ex.title.toLowerCase().includes(q) ||
             (ex.description || '').toLowerCase().includes(q) ||
             (ex.tags || '').toLowerCase().includes(q) ||
             (ex.language || '').toLowerCase().includes(q)
    }
    return true
  })

  const publishExercise = async () => {
    if (!newEx.title.trim()) { setPublishMsg('请输入题目标题'); return }
    if (!newEx.starter_code.trim()) { setPublishMsg('请输入代码内容'); return }
    if (!newEx.expected_output.trim()) { setPublishMsg('请输入预期输出（标准答案输出）'); return }
    setPublishing(true)
    setPublishMsg('')
    try {
      const resp = await fetch(`${API_BASE}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEx)
      })
      const data = await resp.json()
      if (resp.ok) {
        setPublishMsg('✅ 题目发布成功！')
        // 刷新题目列表
        fetch(`${API_BASE}/exercises`).then(r => r.json()).then(d => setExercises(d.items || []))
        setTimeout(() => { setShowPublish(false); setNewEx({ title: '', description: '', difficulty: '简单', language: 'py', starter_code: '', expected_output: '', tags: '' }); setPublishMsg('') }, 1500)
      } else {
        setPublishMsg(`❌ ${data.detail || '发布失败'}`)
      }
    } catch {
      setPublishMsg('❌ 网络错误，请确认后端已启动')
    }
    setPublishing(false)
  }

  return (
    <div className="fade-in learn-layout">
      <div className="learn-hero">
        <div className="hero-content">
          <h2>🎓 欢迎来到 YiCode 学习中心</h2>
          <p>
            精心设计的 <strong style={{ color: 'var(--primary-light)' }}>{exerciseCount}+ 道题目</strong> 与
            <strong style={{ color: 'var(--secondary)' }}> {courseCount} 门完整课程</strong>，
            从零基础到算法竞赛，每一步都有 AI 助教全程陪跑，帮你构建扎实的计算机专业基础。
          </p>
          <div className="hero-actions">
            <button className="btn btn-success" onClick={() => setPage('editor')}>
              <i className="fas fa-play"></i> 继续上次学习
            </button>
            <button className="btn btn-outline" onClick={() => {
              if (exercises.length > 0) {
                const rand = exercises[Math.floor(Math.random() * exercises.length)]
                onOpenExercise(rand)
              }
            }}>
              <i className="fas fa-random"></i> 随机挑战一题
            </button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="num">{exerciseCount}+</div><div className="lbl">精选题库</div></div>
          <div className="hero-stat"><div className="num">{courseCount}</div><div className="lbl">系统课程</div></div>
          <div className="hero-stat"><div className="num">98%</div><div className="lbl">同学好评</div></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><i className="fas fa-layer-group"></i> 推荐练习题 {searchQuery.trim() && `(搜索: "${searchQuery}" · ${filteredExercises.length}题)`}</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="btn btn-success" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => setShowPublish(true)}>
              <i className="fas fa-plus-circle"></i> 发布题目
            </button>
            <select
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
            >
              <option value="全部">全部难度</option>
              <option value="简单">简单</option>
              <option value="中等">中等</option>
              <option value="困难">困难</option>
            </select>
          </div>
        </div>
        <div className="exercise-grid">
          {loading ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> 正在加载练习题…
            </div>
          ) : filteredExercises.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <i className="fas fa-search" style={{ marginRight: '8px' }}></i>
              {searchQuery.trim() ? `未找到与 "${searchQuery}" 相关的题目` : '暂无练习题'}
            </div>
          ) : filteredExercises.map((ex) => (
            <div key={ex.id} className="ex-card" onClick={() => onOpenExercise(ex)}>
              <div className="ex-card-header">
                <div className={`ex-icon ${ex.language}`}>
                  <i className={`fas ${langIcon(ex.language)}`}></i>
                </div>
                <span className={`ex-diff ${diffCls(ex.difficulty)}`}>
                  <i className={`fas fa-fire`} style={{ marginRight: '4px' }}></i>{ex.difficulty}
                </span>
              </div>
              <div className="ex-title">{ex.title}</div>
              <div className="ex-desc">{ex.description}</div>
              <div className="ex-footer">
                <div className="ex-meta">
                  <span><i className="fas fa-percentage"></i> 通过率 {Math.round(ex.accept_rate * 100)}%</span>
                  {ex.tags && <span><i className="fas fa-tags"></i> {ex.tags}</span>}
                </div>
                <div className="ex-progress">
                  <div className="ex-progress-fill" style={{ width: `${Math.round(ex.accept_rate * 100)}%` }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {[
          { t: '📘 免费电子书库', d: '200+ 本计算机经典电子书免费阅读，支持高亮和笔记。', c: '#6366f1' },
          { t: '🎬 配套视频教程', d: '每个知识点配套 3-5 分钟精短视频讲解，直观易懂。', c: '#ec4899' },
          { t: '📋 学习进度追踪', d: '每日打卡 + 成就徽章系统，记录你成长的每一步。', c: '#14b8a6' },
        ].map((x, i) => (
          <div key={i} style={{
            padding: '22px', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            transition: 'var(--transition)', cursor: 'pointer',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = x.c }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = '' }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{x.t}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{x.d}</div>
          </div>
        ))}
      </div>

      {/* 发布题目弹窗 */}
      {showPublish && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px',
        }} onClick={() => setShowPublish(false)}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
            padding: '28px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                <i className="fas fa-plus-circle" style={{ marginRight: '8px', color: 'var(--primary-light)' }}></i>
                发布新题目
              </h3>
              <button className="icon-btn" onClick={() => setShowPublish(false)}><i className="fas fa-times"></i></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 题目标题 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>题目标题 *</label>
                <input
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="如：两数之和、反转链表..."
                  value={newEx.title}
                  onChange={e => setNewEx({ ...newEx, title: e.target.value })}
                />
              </div>

              {/* 题目描述 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>题目描述</label>
                <textarea
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px', minHeight: '60px', resize: 'vertical' }}
                  placeholder="描述题目要求，如：给定一个整数数组 nums 和目标值 target..."
                  value={newEx.description}
                  onChange={e => setNewEx({ ...newEx, description: e.target.value })}
                />
              </div>

              {/* 难度 + 语言 */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>难度</label>
                  <select
                    style={{ width: '100%' }}
                    value={newEx.difficulty}
                    onChange={e => setNewEx({ ...newEx, difficulty: e.target.value })}
                  >
                    <option value="简单">简单</option>
                    <option value="中等">中等</option>
                    <option value="困难">困难</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>语言</label>
                  <select
                    style={{ width: '100%' }}
                    value={newEx.language}
                    onChange={e => setNewEx({ ...newEx, language: e.target.value })}
                  >
                    <option value="py">Python</option>
                    <option value="js">JavaScript</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                    <option value="go">Go</option>
                    <option value="cs">C#</option>
                  </select>
                </div>
              </div>

              {/* 代码内容 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>代码内容（初始代码骨架） *</label>
                <textarea
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px', minHeight: '100px', resize: 'vertical', fontFamily: "'JetBrains Mono', monospace" }}
                  placeholder="def twoSum(nums, target):&#10;    pass"
                  value={newEx.starter_code}
                  onChange={e => setNewEx({ ...newEx, starter_code: e.target.value })}
                />
              </div>

              {/* 预期输出 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>预期输出（标准答案输出） *</label>
                <textarea
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px', minHeight: '60px', resize: 'vertical', fontFamily: "'JetBrains Mono', monospace" }}
                  placeholder="如：[0, 1]&#10;（用户代码运行后的 stdout 必须与此完全匹配才算通过）"
                  value={newEx.expected_output}
                  onChange={e => setNewEx({ ...newEx, expected_output: e.target.value })}
                />
              </div>

              {/* 标签 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>标签（逗号分隔）</label>
                <input
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="如：数组, 哈希表, 简单"
                  value={newEx.tags}
                  onChange={e => setNewEx({ ...newEx, tags: e.target.value })}
                />
              </div>

              {/* 消息提示 */}
              {publishMsg && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', fontSize: '13px', color: 'var(--primary-light)', textAlign: 'center' }}>
                  {publishMsg}
                </div>
              )}

              {/* 按钮 */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPublish(false)}>
                  取消
                </button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={publishExercise} disabled={publishing}>
                  {publishing ? (
                    <><i className="fas fa-spinner fa-spin"></i> 发布中...</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i> 发布题目</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============== 学习中心 ==============
function ClassroomView({ setPage }: { setPage: (p: PageKey) => void }) {
  const [courses, setCourses] = useState<Array<{
    id: number; title: string; description: string; language: string; difficulty: string;
    category: string; icon: string; color: string; instructor: string; student_count: number;
    image_url?: string; course_url?: string;
  }>>([])
  const [loading, setLoading] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null)
  const [lessons, setLessons] = useState<Array<{
    id: number; title: string; summary: string; external_url: string; external_site: string; order_num: number;
  }>>([])
  const [lessonsLoading, setLessonsLoading] = useState(false)
  // 发布课程相关状态
  const [showPublish, setShowPublish] = useState(false)
  const [newCourse, setNewCourse] = useState({
    title: '', description: '', language: 'mixed', difficulty: '入门',
    image_url: '', course_url: '', instructor: 'YiCode 教研组'
  })
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')

  const publishCourse = async () => {
    if (!newCourse.title.trim()) { setPublishMsg('请输入课程名称'); return }
    setPublishing(true)
    setPublishMsg('')
    try {
      const resp = await fetch(`${API_BASE}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCourse)
      })
      const data = await resp.json()
      if (resp.ok) {
        setPublishMsg('✅ 课程发布成功！')
        // 刷新课程列表
        fetch(`${API_BASE}/courses`).then(r => r.json()).then(d => setCourses(d.courses || []))
        setTimeout(() => {
          setShowPublish(false)
          setNewCourse({ title: '', description: '', language: 'mixed', difficulty: '入门', image_url: '', course_url: '', instructor: 'YiCode 教研组' })
          setPublishMsg('')
        }, 1500)
      } else {
        setPublishMsg(`❌ ${data.detail || '发布失败'}`)
      }
    } catch {
      setPublishMsg('❌ 网络错误')
    }
    setPublishing(false)
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`${API_BASE}/courses`)
      .then(r => r.json())
      .then(d => { if (!alive) return; setCourses(d.courses || []); setLoading(false) })
      .catch(() => { if (!alive) return; setCourses([]); setLoading(false) })
    return () => { alive = false }
  }, [])

  const openCourse = async (course: any) => {
    setSelectedCourse(course)
    setLessons([])
    setLessonsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/courses/${course.id}`)
      const data = await resp.json()
      setLessons(data.lessons || [])
    } catch {
      setLessons([])
    } finally {
      setLessonsLoading(false)
    }
  }

  const siteColor = (site: string) => {
    if (site?.includes('菜鸟')) return '#0d6efd'
    if (site?.includes('MDN')) return '#83b'
    if (site?.includes('W3')) return '#04ad02'
    if (site?.includes('廖雪峰')) return '#e83'
    if (site?.includes('Go') || site?.includes('微软')) return '#0af'
    if (site?.includes('Geeks')) return '#f80'
    return '#6366f1'
  }

  // 课程卡片渲染逻辑已更新，不再需要 genAvatars

  // ====== 章节列表视图（点击课程后展开） ======
  if (selectedCourse) {
    return (
      <div className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button className="btn btn-secondary" onClick={() => setSelectedCourse(null)}>
            <i className="fas fa-arrow-left"></i> 返回课程列表
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${selectedCourse.color}, ${selectedCourse.color}cc)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#fff',
            }}>
              <i className={`fas ${selectedCourse.icon}`}></i>
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>{selectedCourse.title}</h2>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {selectedCourse.instructor} · {selectedCourse.difficulty} · {lessons.length} 章节
              </div>
            </div>
          </div>
        </div>

        <div style={{
          padding: '18px 22px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', marginBottom: '20px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7,
        }}>
          <i className="fas fa-info-circle" style={{ color: 'var(--primary-light)', marginRight: '8px' }}></i>
          {selectedCourse.description}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {lessonsLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> 正在加载章节…
            </div>
          ) : lessons.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>暂无章节</div>
          ) : lessons.map((ls) => (
            <div key={ls.id} style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              transition: 'var(--transition)', cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = selectedCourse.color; e.currentTarget.style.transform = 'translateX(4px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = '' }}
              onClick={() => window.open(ls.external_url, '_blank')}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                background: `${selectedCourse.color}22`, color: selectedCourse.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px',
              }}>{ls.order_num}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{ls.title}</div>
                {ls.summary && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ls.summary}</div>}
              </div>
              {ls.external_site && (
                <span style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
                  background: `${siteColor(ls.external_site)}22`, color: siteColor(ls.external_site),
                }}>
                  {ls.external_site}
                </span>
              )}
              <i className="fas fa-external-link-alt" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}></i>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={() => setPage('editor')}>
            <i className="fas fa-code"></i> 进入代码编辑器练习
          </button>
          <button className="btn btn-secondary" onClick={() => setSelectedCourse(null)}>
            <i className="fas fa-list"></i> 选择其他课程
          </button>
        </div>
      </div>
    )
  }

  // ====== 课程列表视图 ======
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px' }}>
            <i className="fas fa-chalkboard-teacher" style={{ color: 'var(--primary-light)', marginRight: '10px' }}></i>
            我的课程
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowPublish(true)}><i className="fas fa-plus"></i> 发布课程</button>
        </div>
      </div>

      <div className="classroom-grid">
        {loading ? (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> 正在加载课堂…
          </div>
        ) : courses.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            暂无课堂
          </div>
        ) : courses.map((c) => {
          const firstChar = c.title ? c.title[0] : '课'
          const langColors: Record<string, string> = { py: '#3776AB', js: '#F7DF1E', cpp: '#00599C', java: '#ED8B00', go: '#00ADD8', cs: '#68217A', mixed: '#6366f1' }
          const accentColor = langColors[c.language] || '#6366f1'
          return (
            <div key={c.id} className="class-card" onClick={() => openCourse(c)} style={{ padding: 0, overflow: 'hidden' }}>
              {/* 课程封面区域 */}
              <div style={{
                height: '120px', position: 'relative', overflow: 'hidden',
                background: c.image_url
                  ? `url(${c.image_url}) center/cover no-repeat`
                  : `linear-gradient(135deg, ${accentColor}, ${accentColor}aa)`,
              }}>
                {!c.image_url && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '48px', fontWeight: 800, color: 'rgba(255,255,255,0.25)',
                    fontFamily: 'serif',
                  }}>{firstChar}</div>
                )}
                {/* 难度标签 */}
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                  background: 'rgba(0,0,0,0.5)', color: '#fff', backdropFilter: 'blur(4px)',
                }}>{c.difficulty}</div>
              </div>
              {/* 课程信息区域 */}
              <div style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px', lineHeight: 1.3 }}>
                  {c.title}
                </div>
                {c.description && (
                  <div style={{
                    fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '10px',
                  }}>{c.description}</div>
                )}
                {!c.description && <div style={{ marginBottom: '10px' }}></div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  <span><i className="fas fa-user" style={{ marginRight: '4px' }}></i>{c.instructor}</span>
                  <span>·</span>
                  <span><i className="fas fa-user-graduate" style={{ marginRight: '4px' }}></i>{c.student_count} 人学习</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {c.course_url ? (
                    <a
                      href={c.course_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', fontSize: '13px' }}
                      onClick={e => e.stopPropagation()}
                    ><i className="fas fa-external-link-alt"></i> 打开课程</a>
                  ) : (
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }} onClick={(e) => { e.stopPropagation(); openCourse(c) }}>
                      <i className="fas fa-book-open"></i> 查看章节
                    </button>
                  )}
                  <button className="btn btn-secondary" style={{ fontSize: '13px' }} onClick={(e) => { e.stopPropagation(); setPage('editor') }}><i className="fas fa-code"></i></button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 发布课程弹窗 */}
      {showPublish && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px',
        }} onClick={() => setShowPublish(false)}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
            padding: '28px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                <i className="fas fa-graduation-cap" style={{ marginRight: '8px', color: 'var(--primary-light)' }}></i>
                发布新课程
              </h3>
              <button className="icon-btn" onClick={() => setShowPublish(false)}><i className="fas fa-times"></i></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 课程名称 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>课程名称 *</label>
                <input
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="如：Python 零基础入门、JavaScript 高级编程..."
                  value={newCourse.title}
                  onChange={e => setNewCourse({ ...newCourse, title: e.target.value })}
                />
              </div>

              {/* 课程图片 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>课程图片（可选）</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
                      placeholder="输入图片 URL..."
                      value={newCourse.image_url}
                      onChange={e => setNewCourse({ ...newCourse, image_url: e.target.value })}
                    />
                  </div>
                  {/* 图片预览 */}
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '10px', flexShrink: 0,
                    background: newCourse.image_url
                      ? `url(${newCourse.image_url}) center/cover`
                      : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '20px', fontWeight: 700,
                    border: '1px solid var(--border)',
                  }}>
                    {!newCourse.image_url && (newCourse.title ? newCourse.title[0] : '课')}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  不填图片则显示课程名称第一个字
                </div>
              </div>

              {/* 课程链接 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>课程链接</label>
                <input
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="如：https://www.runoob.com/python3/python3-tutorial.html"
                  value={newCourse.course_url}
                  onChange={e => setNewCourse({ ...newCourse, course_url: e.target.value })}
                />
              </div>

              {/* 课程介绍 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>课程介绍</label>
                <textarea
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px', minHeight: '80px', resize: 'vertical' }}
                  placeholder="介绍课程内容、适合人群、学习目标..."
                  value={newCourse.description}
                  onChange={e => setNewCourse({ ...newCourse, description: e.target.value })}
                />
              </div>

              {/* 语言 + 难度 */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>编程语言</label>
                  <select
                    style={{ width: '100%' }}
                    value={newCourse.language}
                    onChange={e => setNewCourse({ ...newCourse, language: e.target.value })}
                  >
                    <option value="py">Python</option>
                    <option value="js">JavaScript</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                    <option value="go">Go</option>
                    <option value="cs">C#</option>
                    <option value="mixed">综合</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>难度</label>
                  <select
                    style={{ width: '100%' }}
                    value={newCourse.difficulty}
                    onChange={e => setNewCourse({ ...newCourse, difficulty: e.target.value })}
                  >
                    <option value="入门">入门</option>
                    <option value="简单">简单</option>
                    <option value="中等">中等</option>
                    <option value="困难">困难</option>
                    <option value="进阶">进阶</option>
                  </select>
                </div>
              </div>

              {/* 讲师 */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>讲师/来源</label>
                <input
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="如：菜鸟编程、YiCode 教研组"
                  value={newCourse.instructor}
                  onChange={e => setNewCourse({ ...newCourse, instructor: e.target.value })}
                />
              </div>

              {/* 消息提示 */}
              {publishMsg && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: publishMsg.includes('成功') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', fontSize: '13px', color: publishMsg.includes('成功') ? '#10b981' : '#ef4444', textAlign: 'center' }}>
                  {publishMsg}
                </div>
              )}

              {/* 按钮 */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPublish(false)}>
                  取消
                </button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={publishCourse} disabled={publishing}>
                  {publishing ? (
                    <><i className="fas fa-spinner fa-spin"></i> 发布中...</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i> 发布课程</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============== 环境检查 ==============
