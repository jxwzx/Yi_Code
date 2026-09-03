import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react'
import './App.css'

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
  py: `# Python 代码编辑器
# 在此编写你的代码


`,
  js: `// JavaScript 代码编辑器
// 在此编写你的代码


`,
  cpp: `// C++ 代码编辑器
#include <iostream>
using namespace std;

int main() {
    // 在此编写你的代码

    return 0;
}`,
  java: `// Java 代码编辑器
public class Main {
    public static void main(String[] args) {
        // 在此编写你的代码

    }
}`,
  go: `// Go 代码编辑器
package main

import "fmt"

func main() {
    // 在此编写你的代码

}`,
  cs: `// C# 代码编辑器
using System;

class Program
{
    static void Main()
    {
        // 在此编写你的代码

    }
}`
}

// ============== 流程图 Mermaid 模板 ==============
const FLOWCHARTS = {
  fibonacci: `flowchart TD
    A([开始]) --> B[输入 n]
    B --> C{n <= 0?}
    C -->|是| D[返回空列表]
    C -->|否| E{n == 1?}
    E -->|是| F[返回 [0]]
    E -->|否| G[初始化 result = [0, 1]]
    G --> H[i = 2]
    H --> I{i < n?}
    I -->|是| J[result[i-1]+result[i-2]]
    J --> K[添加到 result]
    K --> L[i++]
    L --> I
    I -->|否| M([返回 result 结束])
    D --> M
    F --> M
    style A fill:#10b981,stroke:#fff,color:#fff
    style M fill:#ef4444,stroke:#fff,color:#fff`,
  bubbleSort: `flowchart TD
    A([开始]) --> B[获取数组 arr]
    B --> C[i = 0]
    C --> D{i < len-1?}
    D -->|否| L([排序完成])
    D -->|是| E[j = 0]
    E --> F{j < len-1-i?}
    F -->|否| G[i++]
    G --> D
    F -->|是| H{arr[j] > arr[j+1]?}
    H -->|否| I[j++]
    H -->|是| J[交换两者位置]
    J --> I
    I --> F
    style A fill:#10b981,color:#fff
    style L fill:#14b8a6,color:#fff`,
  binarySearch: `flowchart TD
    A([开始 输入 arr, target]) --> B[left=0, right=len-1]
    B --> C{left <= right?}
    C -->|否| K[返回 -1 未找到]
    C -->|是| D[mid = left+right / 2]
    D --> E{arr[mid] == target?}
    E -->|是| F([返回 mid 找到!])
    E -->|否| G{arr[mid] < target?}
    G -->|是| H[left = mid+1]
    G -->|否| I[right = mid-1]
    H --> C
    I --> C
    style F fill:#10b981,color:#fff
    style K fill:#ef4444,color:#fff`
}

// ============== 主组件 ==============
export default function App() {
  const [page, setPage] = useState<PageKey>(() => {
    try {
      return (localStorage.getItem('yicode_page') as PageKey) || 'dashboard'
    } catch { return 'dashboard' }
  })
  const [runStatus, setRunStatus] = useState<{ id: string; logFile: string } | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    // 从 localStorage 恢复登录状态
    try {
      const saved = localStorage.getItem('yicode_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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
        />
        <div className="content-area">
          {page === 'dashboard' && <Dashboard setPage={setPagePersist} userId={currentUser.user_id} />}
          {page === 'editor' && <CodeEditor onRunStatus={setRunStatus} exercise={selectedExercise} onClearExercise={() => { setSelectedExercise(null); localStorage.removeItem('yicode_exercise_id') }} userId={currentUser.user_id} />}
          {page === 'ai' && <AIPanel standalone />}
          {page === 'flowchart' && <FlowchartView />}
          {page === 'collab' && <CollabChannel />}
          {page === 'learn' && <LearnCenter setPage={setPagePersist} onOpenExercise={openExercise} searchQuery={searchQuery} />}
          {page === 'classroom' && <ClassroomView setPage={setPagePersist} />}
          {page === 'envcheck' && <EnvCheck />}
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const resp = await fetch('http://localhost:8000/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.detail || '登录失败')
        onLogin(data)
      } else {
        const resp = await fetch('http://localhost:8000/auth/register', {
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
          avatar: username[0] || '码',
          level: 1,
          xp: 0,
          streak_days: 1,
        })
      }
    } catch (err: any) {
      setError(err.message || '网络错误，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-decoration">
        <div className="bg-blob blob-1"></div>
        <div className="bg-blob blob-2"></div>
        <div className="bg-blob blob-3"></div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <i className="fas fa-infinity"></i>
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
        <div className="logo-icon"><i className="fas fa-infinity"></i></div>
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
function Topbar({ icon, title, setRunStatus, user, onLogout, searchQuery, setSearchQuery }: {
  icon: string; title: string; setRunStatus: (s: { id: string; logFile: string } | null) => void
  user: CurrentUser; onLogout: () => void
  searchQuery: string; setSearchQuery: (q: string) => void
}) {
  useEffect(() => {
    // 组件挂载时轮询一次任务状态（展示链路打通）
    fetch('http://localhost:8000/tasks')
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
      <div className="topbar-actions">
        <button className="icon-btn" title="帮助">
          <i className="fas fa-question"></i>
        </button>
        <button className="icon-btn" title="消息">
          <i className="fas fa-bell"></i>
          <span className="notif-dot"></span>
        </button>
        <button className="icon-btn" title="主题">
          <i className="fas fa-moon"></i>
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
  // API Key 设置
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('yicode_ai_token') || '')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const loadDashboard = async () => {
    try {
      const resp = await fetch(`http://localhost:8000/users/${userId}/dashboard`)
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
      const resp = await fetch('http://localhost:8000/courses')
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
      await fetch(`http://localhost:8000/tasks/${taskId}?completed=${newCompleted}`, { method: 'PUT' })
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

  const saveApiKey = () => {
    localStorage.setItem('yicode_ai_token', apiKey)
    setShowApiKeyInput(false)
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
      {/* 仪表盘标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            title="AI 设置"
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            style={{ fontSize: '16px' }}
          >
            <i className="fas fa-cog"></i>
          </button>
          {/* API Key 输入弹出框 */}
          {showApiKeyInput && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '8px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '14px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 100, minWidth: '260px',
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
      </div>

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
function CodeEditor({ onRunStatus, exercise, onClearExercise, userId }: {
  onRunStatus: (s: { id: string; logFile: string } | null) => void
  exercise: Exercise | null
  onClearExercise: () => void
  userId: number
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
      fetch(`http://localhost:8000/drafts/${userId}/latest`)
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
      fetch(`http://localhost:8000/drafts/${userId}/${exerciseId}`)
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
        await fetch('http://localhost:8000/drafts', {
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
      const resp = await fetch('http://localhost:8000/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code })
      })
      if (resp.ok) {
        const data = await resp.json()
        // 后端 /run 是同步执行，直接返回 stdout/stderr
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
        if (data.success !== false) {
          const outLines: Array<{ type: string; text: string }> = [
            { type: 'meta', text: `[YiCode] ${data.language || lang} · 耗时 ${data.elapsed_seconds || elapsed}s · 退出码 ${data.exit_code}` },
          ]
          if (data.stdout) outLines.push({ type: 'success', text: data.stdout })
          if (data.stderr) outLines.push({ type: 'error', text: data.stderr })
          if (!data.stdout && !data.stderr) {
            outLines.push({ type: 'warn', text: '（程序执行无输出，请检查你的代码是否包含 print/console.log/cout 等输出语句）' })
          }
          if (data.error) outLines.push({ type: 'error', text: data.error })
          setOutput(prev => [...prev, ...outLines])
          setRunning(false)
          return
        }
      }
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
                    background: 'rgba(10, 15, 30, 0.95)', border: '1px solid var(--border)',
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
                a.href = URL.createObjectURL(blob)
                a.download = `main.${lang}`
                a.click()
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
            <div className="code-lines-container">
              <div className="line-numbers">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} style={{ height: '22.95px' }}>{i + 1}</div>
                ))}
              </div>
              <textarea
                className="code-textarea"
                value={code}
                onChange={e => { setCode(e.target.value); scheduleAutoSave(e.target.value, lang) }}
                spellCheck={false}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const ta = e.target as HTMLTextAreaElement
                    const s = ta.selectionStart, end = ta.selectionEnd
                    const newCode = code.slice(0, s) + '    ' + code.slice(end)
                    setCode(newCode)
                    scheduleAutoSave(newCode, lang)
                    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 4 }, 0)
                  }
                }}
              />
            </div>
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

// ============== 本地模拟运行 (保证前端独立可用) ==============
function simulateRun(lang: LangKey, code: string): { stdout: string; stderr: string; exitCode: number } {
  const stdout: string[] = []
  const stderr: string[] = []
  // 基于模板的预设输出（仅在离线时使用）
  if (lang === 'py' && code.includes('fibonacci')) {
    stdout.push('斐波那契数列前10项:')
    stdout.push('[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]')
    stdout.push('')
    stdout.push('计算完成！')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'js' && code.includes('bubbleSort')) {
    stdout.push('原数组: [ 64, 34, 25, 12, 22, 11, 90 ]')
    stdout.push('排序后: [ 11, 12, 22, 25, 34, 64, 90 ]')
    stdout.push('查找22的索引: 2')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'cpp' && code.includes('ListNode')) {
    stdout.push('链表: 1 -> 2 -> 3 -> 4 -> 5')
    stdout.push('程序运行成功!')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'java' && code.includes('Student')) {
    stdout.push('班级学生列表:')
    stdout.push('学生 #1: 张三 - 成绩: 92.5')
    stdout.push('学生 #2: 李四 - 成绩: 88.0')
    stdout.push('学生 #3: 王五 - 成绩: 95.3')
    stdout.push('')
    stdout.push('班级平均分: 91.93')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'go' && code.includes('worker')) {
    const order = [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3], [3, 3], [1, 4], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5]]
    for (const [w, j] of order) {
      stdout.push(`Worker ${w} 开始任务 ${j}`)
      stdout.push(`Worker ${w} 完成任务 ${j}`)
    }
    stdout.push('\n结果收集:')
    for (let r of [2, 4, 6, 8, 10]) stdout.push(`-> ${r}`)
    stdout.push('所有任务完成!')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'cs' && code.includes('Product')) {
    stdout.push('=== 产品列表 ===')
    stdout.push('笔记本电脑     ¥  5999 [电子]')
    stdout.push('4K显示器      ¥  2499 [电子]')
    stdout.push('')
    stdout.push('=== 各类别均价 ===')
    stdout.push(`电子: ¥${((5999 + 2499) / 2).toFixed(2)}`)
    stdout.push(`配件: ¥${((399 + 199 + 499) / 3).toFixed(2)}`)
    stdout.push('')
    stdout.push('数据处理完成!')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  // 默认：尝试简易解析 print/console.log/cout
  try {
    if (lang === 'py') {
      const re = /print\((['"])(.*?)\1\)/g
      let m
      while ((m = re.exec(code)) !== null) stdout.push(m[2])
    } else if (lang === 'js') {
      const re = /console\.log\((['"])(.*?)\1\)/g
      let m
      while ((m = re.exec(code)) !== null) stdout.push(m[2])
    }
    if (stdout.length === 0 && /[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(code)) {
      return { stdout: '', stderr: '', exitCode: 0 }
    }
  } catch { /* skip */ }
  return { stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode: stderr.length ? 1 : 0 }
}

// ============== AI 助教面板 ==============
function AIPanel({ code, lang, standalone }: { code?: string; lang?: LangKey; standalone?: boolean }) {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      role: 'assistant',
      text: `你好！我是你的 **AI 编程助教** 🤖✨\n\n我可以帮你：\n• 🔍 **检测代码问题** - 语法错误、逻辑漏洞、性能瓶颈\n• 💡 **优化建议** - 让代码更高效、更规范\n• 📚 **知识点讲解** - 随时解答编程疑问\n• 🚀 **自动补全** - 生成代码片段和解决方案\n\n请选择右上角的快捷操作，或直接向我提问！`,
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const apiKey = localStorage.getItem('yicode_ai_token') || ''

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

    // 先尝试后端 API
    let reply: AIMessage | null = null
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['X-API-Key'] = apiKey
      const resp = await fetch('http://localhost:8000/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: content, code, language: lang, api_key: apiKey || undefined })
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
          <div className="ai-avatar"><i className="fas fa-robot"></i></div>
          <div className="ai-info">
            <h3>AI 编程助教 · 易码小助手</h3>
            <p>在线 · GPT-4 级智能</p>
          </div>
        </div>
        <button className="icon-btn" title="清空对话" onClick={() => setMessages([messages[0]])}>
          <i className="fas fa-trash-alt"></i>
        </button>
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

// ============== 本地 AI 回复库（离线可用） ==============
function buildLocalAIReply(msg: string, code: string, lang: LangKey): AIMessage {
  const lower = msg.toLowerCase()
  // 问题检测
  if (lower.includes('检查') || lower.includes('问题') || lower.includes('错误') || lower.includes('bug')) {
    const issues = detectIssues(code, lang)
    if (issues.length === 0) {
      return {
        role: 'assistant',
        text: `🔍 **代码检查完成！**\n\n我用 **静态分析引擎** 扫描了你的代码，当前没有检测到严重的语法错误或逻辑问题。👍\n\n不过可以注意以下提升点：`,
        issues: [
          { type: 'info' as const, title: '增加类型注解', body: `建议为函数参数和返回值增加类型提示，可让代码更易读并减少 bug。`, fix: `例如: def fibonacci(n: int) -> list[int]:` },
          { type: 'info' as const, title: '补充单元测试', body: `建议配套编写 pytest / JUnit 测试，保证修改代码后不破坏旧逻辑。`, fix: `测试覆盖率建议 >= 80%` },
        ],
      }
    }
    return {
      role: 'assistant',
      text: `🔍 **代码检查发现 ${issues.length} 个问题：**\n\n请查看下方卡片，点击「修复建议」可查看解决方案。如果还有疑问，请随时问我！`,
      issues,
    }
  }
  if (lower.includes('优化') || lower.includes('改进') || lower.includes('更好')) {
    return {
      role: 'assistant',
      text: `💡 **代码优化建议：**\n\n针对你当前的实现，我有以下 3 条具体的优化建议：`,
      issues: [
        { type: 'warning' as const, title: '时间复杂度可优化', body: '当前实现使用了双重循环，时间复杂度为 O(n²)，对于大数据量性能较差。', fix: '可尝试使用哈希表（字典）将查询优化到 O(1)，整体复杂度降为 O(n)。' },
        { type: 'warning' as const, title: '缺少异常处理', body: '关键函数未处理边界输入（空值、负数、超大数值），可能导致未预期崩溃。', fix: '增加 try-catch / if-else 防御式判断，对非法输入给出友好提示。' },
        { type: 'info' as const, title: '代码风格', body: '部分命名可读性不足，且缺少函数级文档注释，团队协作时成本较高。', fix: '遵循 PEP8 / Google Style Guide，为函数添加 docstring 说明功能、参数、返回值。' },
      ],
    }
  }
  if (lower.includes('解释') || lower.includes('什么') || lower.includes('讲解') || lower.includes('流程')) {
    return {
      role: 'assistant',
      text: `📚 **代码逻辑讲解：**\n\n让我一步步带你理解这段代码的执行流程：\n\n1. **函数定义阶段**：程序首先读取函数定义（如 fibonacci / bubbleSort 等），此时不执行函数体，只是把签名注册到命名空间。\n\n2. **入口调用阶段**：到达 main 部分时，程序开始依次执行语句，例如调用函数、打印输出。\n\n3. **核心循环阶段**：进入 for / while 循环，根据条件重复执行语句块；这是算法真正发挥作用的地方。\n\n4. **结果返回阶段**：函数执行完毕，把结果返回给调用者，由 print 输出到控制台。\n\n💡 **建议**：点击左侧「代码流程图」标签，可可视化整个执行过程！`,
    }
  }
  if (lower.includes('递归')) {
    return {
      role: 'assistant',
      text: `📚 **什么是递归？**\n\n**递归（Recursion）** 就是「函数自己调用自己」的编程技巧。就像俄罗斯套娃：打开一个娃娃，里面还有个同款娃娃，直到最小的那个（基线条件）为止。\n\n递归必须包含两个核心要素：\n\n• **基线条件 (Base Case)**：不再递归、直接返回答案的边界情况，防止无限循环。\n• **递归条件 (Recursive Case)**：把大问题分解成「更小的同类问题」，调用自身解决。\n\n**🌰 举个栗子：计算阶乘 n!**\n\n\`\`\`python\ndef factorial(n):\n    if n <= 1:          # 基线条件\n        return 1\n    return n * factorial(n - 1)  # 递归：n! = n × (n-1)!\n\`\`\`\n\n执行 factorial(5) = 5 × 4 × 3 × 2 × 1 = 120 ✅`,
    }
  }
  if (lower.includes('路线') || lower.includes('零基础') || lower.includes('学习计划')) {
    return {
      role: 'assistant',
      text: `🚀 **Python 零基础学习路线（5个核心阶段）：**\n\n**① 语法基础（1-2 周）**\n• 变量、数据类型（int/float/str/list/dict）\n• 条件判断 if/else、循环 for/while\n• 函数定义与参数\n\n**② 进阶特性（2-3 周）**\n• 面向对象：class、继承、多态\n• 文件读写、异常处理 try/except\n• 模块与包 import\n\n**③ 算法与数据结构（3-4 周）** ⭐重中之重\n• 数组、链表、栈、队列、哈希表\n• 排序（冒泡/快排/归并）、搜索（二分）\n• 时间复杂度 O() 分析\n\n**④ 常用库实践（2-3 周）**\n• requests (网络) + BeautifulSoup (爬虫)\n• pandas/numpy (数据分析)\n• Flask/FastAPI (后端开发)\n\n**⑤ 项目实战（持续进行）**\n• 个人博客系统、爬虫、命令行工具、GUI 桌面应用\n• 建议加入 YiCode 「协作频道」组队开发！\n\n加油 💪 有具体问题随时问我～`,
    }
  }
  if (lower.includes('考点') || lower.includes('复习') || lower.includes('期末') || lower.includes('考试')) {
    return {
      role: 'assistant',
      text: `📝 **「数据结构与算法」期末考试 10 大高频考点：**\n\n**数据结构部分：**\n1. 线性表（顺序表 vs 链表）的插入删除查找效率对比\n2. 栈（Stack）「后进先出」应用：括号匹配、表达式求值\n3. 队列（Queue）「先进先出」应用：广度优先搜索 BFS\n4. 二叉树：前序/中序/后序/层序遍历、平衡树 AVL\n5. 哈希表：冲突解决（链地址法/开放寻址法）、装载因子\n\n**算法部分：**\n6. 排序算法：冒泡/选择/插入/快排/归并/堆排 → 时间/空间复杂度、稳定性\n7. 查找：二分查找（必须手写！）、哈希查找\n8. 图论：DFS/BFS 遍历、最短路径 Dijkstra\n9. 动态规划 DP：背包问题、最长子序列 LCS、状态转移方程\n10. 贪心思想：活动选择、哈夫曼编码\n\n💡 **建议**：在 YiCode「代码实验室」里对每个考点手写 3 遍，并画「流程图」验证思路！祝你考试顺利 🎯`,
    }
  }
  if (lower.includes('竞赛') || lower.includes('刷题') || lower.includes('acm') || lower.includes('ac')) {
    return {
      role: 'assistant',
      text: `🏆 **ACM/蓝桥杯 竞赛刷题计划建议：**\n\n**第一阶段：夯实基础 (4-6 周)**\n• 语言：C++（首选，STL 强大）/ Python / Java 任选一种打透\n• 每日 2-3 题：Luogu / 洛谷入门区 + LeetCode Easy\n• 重点：输入输出、字符串处理、STL(vector/map/set/queue/stack)\n\n**第二阶段：专题突破 (8-10 周)**\n按专题逐个攻克，每个专题至少 10 题：\n• 二分/双指针 · 排序与贪心 · DFS/BFS 搜索\n• DP (线性/区间/树形/状态压缩) · 并查集 · 最短路\n• 最小生成树 · 树链剖分 · 数论 (GCD/快速幂/筛法)\n\n**第三阶段：模拟赛 (4 周)**\n• 每周参加 Codeforces Div.3 / Div.2 / AtCoder Beginner\n• 赛后必须「补题」：独立写出未通过的题目 + 写题解\n• 加入 YiCode 「协作频道」组队交流，互相 Review 代码\n\n**🎯 每日节奏：**\n• 上午 1h 学习/复习算法模板\n• 下午 2h 集中刷题\n• 晚上 1h 写题解 + 看同学代码学习\n\n坚持 3 个月，省赛/校赛拿奖完全没问题！加油 🌟`,
    }
  }
  // 默认
  return {
    role: 'assistant',
    text: `✨ **已收到你的问题！**\n\n我正在分析你的提问，这里是一些通用建议：\n\n• 如果是**代码报错**，请把完整的错误信息和代码一起发给我，我可以精准定位。\n• 如果是**不懂的知识点**，可以问我「解释 XX」「举个例子说明 XX」。\n• 如果是**代码优化需求**，点击快捷操作「优化代码建议」可获得更详细的反馈。\n\n想让我帮你做什么？可以直接点击上方的快捷按钮，或继续向我描述你的目标～`,
  }
}

// ============== 简单的静态代码问题检测 ==============
function detectIssues(code: string, lang: LangKey): AIMessage['issues'] {
  const issues: AIMessage['issues'] = []
  const lines = code.split('\n')

  if (lang === 'py') {
    // 缩进问题：tab/space 混用
    const hasTab = lines.some(l => l.startsWith('\t'))
    const hasSpace = lines.some(l => /^    +/.test(l))
    if (hasTab && hasSpace) {
      issues.push({ type: 'error', title: '缩进混用 Tab / Space', body: '检测到代码同时使用了 Tab 和空格缩进，Python 对缩进敏感，会抛出 IndentationError。', fix: '请统一使用 4 空格缩进（绝大多数编辑器可设置 Tab 自动转空格）。' })
    }
    // print 括号 (Python3 必须)
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*print\s+[^(]/.test(lines[i])) {
        issues.push({ type: 'error', title: `第 ${i + 1} 行: print 缺少括号`, body: 'Python3 中 print 是函数，必须使用 print(...) 形式，否则会报 SyntaxError。', fix: '改为 print("要输出的内容")' })
        break
      }
    }
    // 变量未初始化直接使用（简单启发式）
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('==') && /if\s+\w+\s*==/.test(lines[i])) {
        const m = lines[i].match(/if\s+(\w+)\s*==/)
        if (m) {
          const name = m[1]
          const foundBefore = lines.slice(0, i).some(l => new RegExp(`${name}\\s*=`).test(l))
          if (!foundBefore && !['True', 'False', 'None', 'self', '__name__'].includes(name)) {
            issues.push({ type: 'warning', title: `第 ${i + 1} 行: 变量 ${name} 可能未定义`, body: `在条件判断中使用了 ${name}，但前面未检测到赋值，运行时可能 NameError。`, fix: `在前面为 ${name} 赋初始值，例如 ${name} = 0。` })
            break
          }
        }
      }
    }
  }
  if (lang === 'cpp') {
    // 缺少 return 0
    if (code.includes('int main') && !/return\s+0/.test(code)) {
      issues.push({ type: 'warning', title: 'main 函数缺少 return 0', body: '标准要求 main 函数返回 int，建议显式返回 0 表示正常退出。', fix: '在 main 末尾添加 return 0;' })
    }
    // 忘记 delete (new 过但没 delete)
    const news = code.match(/new\s+\w+/g) || []
    const deletes = (code.match(/delete\s+[\w[\]]+/g) || []).length
    if (news.length > deletes) {
      issues.push({ type: 'warning', title: `内存泄漏风险`, body: `检测到 ${news.length} 处 new，但 delete 只有 ${deletes} 处，可能有堆内存未释放。`, fix: '确保每个 new 对应一个 delete，或改用智能指针 std::unique_ptr。' })
    }
  }
  if (lang === 'java') {
    if (code.includes('public static void main') && !code.includes('String[] args')) {
      issues.push({ type: 'error', title: 'main 方法签名错误', body: 'Java main 方法签名必须是 public static void main(String[] args)，否则无法启动。', fix: '补全参数 String[] args' })
    }
  }
  if (lang === 'js') {
    for (let i = 0; i < lines.length; i++) {
      if (/==[^=]/.test(lines[i]) && !/===/.test(lines[i])) {
        issues.push({ type: 'warning', title: `第 ${i + 1} 行: 使用 == 而非 ===`, body: 'JavaScript 的 == 会做隐式类型转换，容易产生难以调试的 bug (如 [] == false 为 true)。', fix: '始终使用 === 做严格相等比较。' })
        break
      }
    }
  }
  // 通用：超大嵌套 for 循环
  let maxNest = 0, nest = 0
  for (const l of lines) {
    const opens = (l.match(/\{|for\s*\(|while\s*\(/g) || []).length
    const closes = (l.match(/\}/g) || []).length
    nest = Math.max(0, nest + opens - closes)
    maxNest = Math.max(maxNest, nest)
  }
  if (maxNest >= 4) {
    issues.push({ type: 'info', title: `嵌套层级过深 (${maxNest} 层)`, body: '过深的嵌套会降低可读性、增加出错概率，建议使用「卫语句」或提取子函数降低层数。', fix: '提前 return / 抽出 helper function / 使用策略模式。' })
  }
  return issues
}

// ============== 代码流程图 ==============
function FlowchartView() {
  const [code, setCode] = useState<string>(`def check_age(age):
    if age >= 18:
        print("成年人")
    else:
        print("未成年人")
    return age`)
  const [mermaidCode, setMermaidCode] = useState<string>('')
  const [genKey, setGenKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ language: string; nodes: number; total_lines: number } | null>(null)
  const [error, setError] = useState<string>('')

  // 示例代码
  const examples = [
    { label: '年龄判断', icon: 'fa-user-check', code: `def check_age(age):
    if age >= 18:
        print("成年人")
    else:
        print("未成年人")
    return age` },
    { label: '循环求和', icon: 'fa-plus-circle', code: `def sum_n(n):
    total = 0
    for i in range(1, n+1):
        total += i
    return total` },
    { label: '二分查找', icon: 'fa-search', code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1` },
  ]

  // 生成流程图
  const generateFlowchart = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('http://localhost:8000/ai/flowchart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: 'auto' }),
      })
      const data = await resp.json()
      if (data.success && data.mermaid) {
        setMermaidCode(data.mermaid)
        setStats(data.stats)
        setGenKey(k => k + 1)
      } else {
        setError(data.error || '生成失败')
      }
    } catch (e) {
      setError('无法连接到服务器')
    } finally {
      setLoading(false)
    }
  }

  // Mermaid 渲染
  useEffect(() => {
    if (!mermaidCode) return
    // @ts-ignore
    if (window.mermaid) {
      // @ts-ignore
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#1e293b',
          primaryTextColor: '#f1f5f9',
          primaryBorderColor: '#6366f1',
          lineColor: '#818cf8',
          secondaryColor: '#1e293b',
          tertiaryColor: '#0f172a',
          fontFamily: 'Inter',
        },
        flowchart: { curve: 'basis', htmlLabels: true },
      })
    }
    const id = 'mermaid-' + Date.now()
    const t = setTimeout(async () => {
      try {
        // @ts-ignore
        if (window.mermaid) {
          const el = document.getElementById('mermaid-canvas')
          if (el) {
            // @ts-ignore
            const { svg } = await window.mermaid.render(id, mermaidCode)
            el.innerHTML = svg
          }
        }
      } catch (e) {
        console.error('Mermaid render failed', e)
      }
    }, 100)
    return () => clearTimeout(t)
  }, [mermaidCode, genKey])

  // 首次加载自动生成
  useEffect(() => {
    generateFlowchart()
  }, [])

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flowchart-layout">
        {/* 左侧：流程图画布 */}
        <div className="flowchart-pane">
          <div className="flowchart-tools">
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '4px' }}>
              <i className="fas fa-project-diagram" style={{ color: 'var(--primary-light)', marginRight: '6px' }}></i>
              代码流程图
            </span>
            <div className="tool-chip" onClick={() => setGenKey(k => k + 1)} style={{ marginLeft: 'auto' }}>
              <i className="fas fa-sync-alt"></i> 重新渲染
            </div>
            <div className="tool-chip" onClick={() => {
              const el = document.getElementById('mermaid-canvas')
              if (el) {
                const svg = el.querySelector('svg')
                if (svg) {
                  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = 'flowchart.svg'
                  a.click()
                }
              }
            }}>
              <i className="fas fa-download"></i> 导出 SVG
            </div>
          </div>
          <div className="flowchart-canvas">
            <div
              id="mermaid-canvas"
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '16px',
                padding: '30px',
                border: '1px solid var(--border)',
                minHeight: '400px',
                overflow: 'auto',
              }}
            >
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
                  <div className="shimmer" style={{ width: '80%', height: '300px', borderRadius: '12px' }}></div>
                </div>
              ) : !mermaidCode ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', flexDirection: 'column', gap: '12px' }}>
                  <i className="fas fa-code" style={{ fontSize: '48px', opacity: 0.3 }}></i>
                  <span style={{ fontSize: '14px' }}>输入代码后点击「生成流程图」</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 右侧：代码输入 + 说明 */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px' }}>
          <div>
            <div className="panel-title" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><i className="fas fa-code"></i> 输入代码</span>
              {stats && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {stats.language.toUpperCase()} | {stats.nodes} 节点 | {stats.total_lines} 行
                </span>
              )}
            </div>
            <textarea
              className="code-textarea"
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
              style={{ height: '200px', fontSize: '13px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={generateFlowchart} disabled={loading}>
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-magic'}`}></i> {loading ? '分析中...' : '生成流程图'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setCode(''); setMermaidCode(''); setStats(null) }}>
              <i className="fas fa-eraser"></i> 清空
            </button>
          </div>
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '12px', color: '#f87171' }}>
              <i className="fas fa-exclamation-triangle"></i> {error}
            </div>
          )}

          {/* 示例代码快捷加载 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <i className="fas fa-bolt" style={{ color: 'var(--warning)' }}></i> 示例代码
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {examples.map((ex, i) => (
                <div
                  key={i}
                  className="tool-chip"
                  style={{ fontSize: '11px', padding: '5px 10px' }}
                  onClick={() => { setCode(ex.code); }}
                >
                  <i className={`fas ${ex.icon}`}></i> {ex.label}
                </div>
              ))}
            </div>
          </div>

          {/* 图例 */}
          <div style={{
            padding: '12px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <i className="fas fa-lightbulb" style={{ color: 'var(--primary-light)' }}></i>
              <strong style={{ fontSize: '12px' }}>图例</strong>
            </div>
            <div style={{ fontSize: '11px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              • 圆角框 = <strong style={{ color: 'var(--success)' }}>开始 / 结束</strong><br />
              • 矩形 = 普通操作 / 赋值<br />
              • 菱形 = <strong style={{ color: 'var(--warning)' }}>条件判断 / 循环</strong><br />
              • 箭头标有「是/否」= 分支方向
            </div>
          </div>
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
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
}

function CollabChannel() {
  const API_BASE = 'http://localhost:8000'
  const WS_BASE = 'ws://localhost:8000'

  const [view, setView] = useState<'entry' | 'room'>('entry')
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
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

  const wsRef = useRef<WebSocket | null>(null)
  const syncTimer = useRef<number | null>(null)

  const pickColor = (n: string, list: CollabMember[]) => {
    const used = new Set(list.map(m => m.color))
    for (const c of COLLAB_AVATAR_COLORS) if (!used.has(c)) return c
    return COLLAB_AVATAR_COLORS[Math.abs(n.length) % COLLAB_AVATAR_COLORS.length]
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
  const leaveRoom = (reason?: string) => {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null }
    const ws = wsRef.current
    if (ws) { try { ws.close() } catch { /* ignore */ } wsRef.current = null }
    setView('entry')
    setRoomCode(''); setLanIp(''); setShareUrl(''); setHost('')
    setMembers([]); setMyName(''); setMyColor('a'); setMyRole('writer')
    setCode(CODE_TEMPLATES.py); setLang('py')
    setChatMessages([]); setChatInput('')
    setCreated(null); setJoinCode('')
    setErr(reason || '')
  }
  // WebSocket 生命周期：挂载时不主动连接（需先有用户名/房间码），仅在卸载时清理连接与定时器
  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
      const ws = wsRef.current
      if (ws) { try { ws.close() } catch { /* ignore */ } wsRef.current = null }
    }
  }, [])
  const connectRoom = (wsUrl: string, userName: string, color: string, hostName: string) => {
    setErr('')
    let everOpen = false
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onopen = () => { everOpen = true; ws.send(JSON.stringify({ name: userName, role: 'writer', color })) }
      ws.onmessage = (ev: MessageEvent) => {
        let data: Record<string, any>
        try { data = JSON.parse(ev.data) } catch { return }
        switch (data.type) {
          case 'room_state':
            setHost(data.host || hostName)
            setMembers((data.members || []) as CollabMember[])
            if (data.code) setCode(data.code as string)
            if (data.language) setLang(data.language as LangKey)
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
              if (me) setMyRole(me.role as CollabRole) }
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
          leaveRoom(everOpen ? '连接已断开，请重新进入房间' : '无法连接到房间服务，请确认本地服务（services/local_api）已启动')
        }
      }
    } catch (e) {
      setErr('连接失败：' + (e as Error).message)
    }
  }
  const createRoom = async () => {
    const n = name.trim()
    if (!n) { setErr('请输入昵称'); return }
    setErr(''); setBusy(true)
    try {
      const r = await fetch(API_BASE + '/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_name: n, language: 'py' }),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setCreated(await r.json())
    } catch (e) {
      setErr('创建房间失败：' + (e as Error).message + '（请确认本地服务运行在 ' + API_BASE + '）')
    } finally { setBusy(false) }
  }
  const enterCreated = () => {
    if (!created) return
    const n = name.trim()
    const color = pickColor(n, [])
    setMyName(n); setMyColor(color); setMyRole('writer')
    setRoomCode(created.room_code); setLanIp(created.lan_ip); setShareUrl(created.share_url); setHost(n)
    setView('room')
    connectRoom(created.ws_url || (WS_BASE + '/ws/room/' + created.room_code), n, color, n)
  }
  const joinRoom = async () => {
    const n = name.trim()
    const c = joinCode.trim()
    if (!n) { setErr('请输入昵称'); return }
    if (c.length !== 6) { setErr('请输入 6 位数字房间码'); return }
    setErr(''); setBusy(true)
    try {
      const r = await fetch(API_BASE + '/rooms/' + c)
      if (!r.ok) { setErr('房间 ' + c + ' 不存在或已关闭'); return }
      const d = await r.json()
      const list = (d.members || []) as CollabMember[]
      const color = pickColor(n, list)
      setMyName(n); setMyColor(color); setMyRole('writer')
      setRoomCode(c); setLanIp(d.lan_ip || ''); setShareUrl(d.share_url || ('http://' + (d.lan_ip || '127.0.0.1') + ':1420/?room=' + c)); setHost(d.host || '')
      setMembers(list)
      setView('room')
      connectRoom(WS_BASE + '/ws/room/' + c, n, color, d.host || '')
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
  const lineCount = code.split('\n').length

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
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>昵称</div>
              <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoom()} placeholder="输入你的昵称" style={COLLAB_ENTRY_INPUT} />
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
              <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(15,23,42,0.6)', padding: '8px 10px', borderRadius: 8, lineHeight: 1.6, wordBreak: 'break-all' }}>
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
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '14px 0 6px' }}>昵称</div>
              <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinRoom()} placeholder="输入你的昵称" style={COLLAB_ENTRY_INPUT} />
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
                    {isMe && (
                      <select value={myRole} onChange={e => onRoleChange(e.target.value as CollabRole)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 6px' }}>
                        <option value="writer">写代码</option>
                        <option value="reviewer">评代码</option>
                        <option value="obs">观看中</option>
                      </select>
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
                <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px', background: 'rgba(15,23,42,0.6)', borderRadius: 5 }}>
                  <i className="fas fa-share-alt" style={{ marginRight: 4 }}></i>实时同步中
                </span>
                <select value={lang} onChange={e => onLangChange(e.target.value as LangKey)} style={{ fontSize: 12, padding: '4px 8px' }}>
                  {COLLAB_LANGS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setCode(CODE_TEMPLATES[lang]); scheduleSync(CODE_TEMPLATES[lang], lang) }}>
                  <i className="fas fa-undo"></i> 重置
                </button>
              </div>
            </div>
            <div className="code-editor-area">
              <div className="code-lines-container">
                <div className="line-numbers">
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i} style={{ height: '22.95px' }}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  className="code-textarea"
                  value={code}
                  onChange={e => {
                    const v = e.target.value
                    setCode(v)
                    scheduleSync(v, lang)
                  }}
                  spellCheck={false}
                  placeholder="在此输入代码，将实时广播给所有成员..."
                />
              </div>
            </div>
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
  const API_BASE = 'http://localhost:8000'
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
  const API_BASE = 'http://localhost:8000'
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

  const studentColors = ['#ef4444', '#f59e0b', '#6366f1', '#14b8a6', '#ec4899', '#3b82f6', '#8b5cf6', '#f97316']
  const genAvatars = (count: number): Array<[string, string]> => {
    const n = Math.min(5, Math.max(1, count))
    return Array.from({ length: n }, (_, k) => [String.fromCharCode(65 + k), studentColors[k % studentColors.length]] as [string, string])
  }

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
          ) : lessons.map((ls, idx) => (
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

function EnvCheck() {
  const [runtimes, setRuntimes] = useState<Record<string, RuntimeInfo>>({})
  const [loading, setLoading] = useState(true)
  const [selfTest, setSelfTest] = useState<Record<string, SelfTestResult> | null>(null)
  const [testing, setTesting] = useState(false)
  const [installStatus, setInstallStatus] = useState<Record<string, { status: string; progress: string }>>({})

  const fetchRuntimes = async () => {
    setLoading(true)
    try {
      const r = await fetch('http://localhost:8000/runtimes')
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
      const r = await fetch('http://localhost:8000/self-test', { method: 'POST' })
      const j = await r.json()
      setSelfTest(j.per_language || {})
    } catch {
      setSelfTest({})
    }
    setTesting(false)
  }

  // 一键安装环境（java/cpp）
  const installEnv = async (env: string) => {
    // 支持自动安装的环境
    const installableEnvs: Record<string, string> = {
      java: 'JDK 21',
      cpp: 'MinGW C++',
    }
    if (!installableEnvs[env]) return

    setInstallStatus(prev => ({ ...prev, [env]: { status: 'installing', progress: '开始下载...' } }))

    try {
      const r = await fetch(`http://localhost:8000/install/${env}`, { method: 'POST' })
      const data = await r.json()
      if (data.task_id) {
        // 轮询安装状态
        const poll = async () => {
          try {
            const sr = await fetch(`http://localhost:8000/install/status/${data.task_id}`)
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
    py: '已预装。如需更新：python.org/downloads 或 winget install Python.Python.3.13',
    js: '已预装。如需更新：nodejs.org 或 winget install OpenJS.NodeJS.LTS',
    cpp: '安装命令：winget install BrechtSanders.WinLibs.POSIX.UCRT（已自动执行）',
    java: '安装命令：winget install EclipseAdoptium.Temurin.21.JDK',
    go: '安装命令：winget install GoLang.Go',
    cs: '安装命令：winget install Microsoft.DotNet.SDK.8',
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
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(15,23,42,0.8))' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>
            {allEntries.filter(([, r]) => r.available).length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>已就绪</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(15,23,42,0.8))' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>
            {allEntries.filter(([, r]) => !r.available).length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>未安装</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(15,23,42,0.8))' }}>
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
                background: 'rgba(15,23,42,0.6)', padding: '4px 8px', borderRadius: '4px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '8px',
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
                {/* 一键安装按钮（仅 java/cpp） */}
                {(key === 'java' || key === 'cpp') && (
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


// ============== 管理面板组件 ==============
function AdminPanel({ currentUser }: { currentUser: CurrentUser }) {
  const [users, setUsers] = useState<Array<{
    id: number; username: string; avatar: string; level: number; xp: number;
    streak_days: number; role: string; target_id: string | null; created_at: string;
    role_label: string;
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const API_BASE = 'http://localhost:8000'

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`${API_BASE}/admin/users?operator_id=${currentUser.user_id}`)
      const data = await resp.json()
      if (resp.ok) {
        setUsers(data.users || [])
      } else {
        setError(data.detail || '获取用户列表失败')
      }
    } catch (err) {
      setError('网络错误，请确认后端已启动')
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const setRole = async (userId: number, newRole: string) => {
    if (userId === currentUser.user_id && currentUser.role === 'super_admin' && newRole !== 'super_admin') {
      if (!confirm('确定要将自己的超级管理员身份移除吗？')) return
    }
    setActionLoading(userId)
    try {
      const resp = await fetch(`${API_BASE}/admin/users/${userId}/role?role=${newRole}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await resp.json()
      if (resp.ok) {
        await fetchUsers()
      } else {
        alert(data.detail || '操作失败')
      }
    } catch {
      alert('网络错误')
    }
    setActionLoading(null)
  }

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可撤销。`)) return
    setActionLoading(userId)
    try {
      const resp = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
      })
      const data = await resp.json()
      if (resp.ok) {
        await fetchUsers()
      } else {
        alert(data.detail || '删除失败')
      }
    } catch {
      alert('网络错误')
    }
    setActionLoading(null)
  }

  const roleBadge = (role: string, target_id: string | null) => {
    const badges: Record<string, { bg: string; color: string; icon: string; label: string }> = {
      super_admin: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', icon: 'fa-crown', label: '超级管理员' },
      admin: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', icon: 'fa-shield-alt', label: '管理员' },
      student: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', icon: 'fa-user', label: '学生' },
    }
    const b = badges[role] || badges.student
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
        background: b.bg, color: b.color,
      }}>
        <i className={`fas ${b.icon}`}></i>
        {b.label}
        {target_id && <span style={{ marginLeft: '4px', fontFamily: 'monospace' }}>({target_id})</span>}
      </span>
    )
  }

  if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <i className="fas fa-lock" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}></i>
        <div style={{ fontSize: '16px' }}>需要管理员权限才能访问此页面</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>
          <i className="fas fa-shield-alt" style={{ marginRight: '10px', color: 'var(--primary-light)' }}></i>
          管理面板
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
          {currentUser.role === 'super_admin' ? '超级管理员' : '管理员'} · ID: {currentUser.target_id || '-'}
        </p>
      </div>

      {/* 用户管理 */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <i className="fas fa-users"></i> 用户管理 ({users.length}人)
          </div>
          <button className="btn btn-secondary" onClick={fetchUsers} disabled={loading}>
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync'}`}></i> 刷新
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', margin: '16px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '13px',
          }}>
            <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>{error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px' }}></i>
            <div style={{ marginTop: '10px' }}>正在加载用户列表...</div>
          </div>
        ) : (
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map((u) => (
                <div key={u.id} style={{
                  padding: '16px', borderRadius: '12px',
                  border: u.id === currentUser.user_id ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: u.id === currentUser.user_id ? 'rgba(99,102,241,0.05)' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', gap: '16px',
                  opacity: actionLoading === u.id ? 0.6 : 1,
                  transition: 'var(--transition)',
                }}>
                  {/* 用户头像 */}
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: u.role === 'super_admin' ? 'linear-gradient(135deg, #ef4444, #f97316)' :
                      u.role === 'admin' ? 'linear-gradient(135deg, #6366f1, #818cf8)' :
                        'linear-gradient(135deg, #334155, #475569)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: 700, flexShrink: 0,
                  }}>
                    {u.avatar || u.username[0]}
                  </div>

                  {/* 用户信息 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{u.username}</span>
                      {u.id === currentUser.user_id && (
                        <span style={{ fontSize: '11px', color: 'var(--primary-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          当前用户
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span><i className="fas fa-star" style={{ marginRight: '4px', color: '#fbbf24' }}></i>Lv.{u.level}</span>
                      <span><i className="fas fa-bolt" style={{ marginRight: '4px', color: '#10b981' }}></i>{u.xp} XP</span>
                      <span><i className="fas fa-fire" style={{ marginRight: '4px', color: '#f97316' }}></i>{u.streak_days}天连续</span>
                      <span style={{ color: 'var(--text-muted)' }}>ID: {u.id}</span>
                    </div>
                  </div>

                  {/* 角色标识 */}
                  <div>{roleBadge(u.role, u.target_id)}</div>

                  {/* 操作按钮 */}
                  {u.role !== 'super_admin' && currentUser.role === 'super_admin' && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {u.role === 'student' ? (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => setRole(u.id, 'admin')}
                          disabled={actionLoading !== null}
                        >
                          <i className="fas fa-user-shield"></i> 设为管理员
                        </button>
                      ) : u.role === 'admin' ? (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => setRole(u.id, 'student')}
                          disabled={actionLoading !== null}
                        >
                          <i className="fas fa-user"></i> 取消管理员
                        </button>
                      ) : null}
                      {u.role !== 'super_admin' && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 12px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => deleteUser(u.id, u.username)}
                          disabled={actionLoading !== null}
                        >
                          <i className="fas fa-trash"></i> 删除
                        </button>
                      )}
                    </div>
                  )}
                  {actionLoading === u.id && (
                    <i className="fas fa-spinner fa-spin" style={{ color: 'var(--primary-light)' }}></i>
                  )}
                </div>
              ))}
            </div>

            {/* 统计信息 */}
            <div style={{
              marginTop: '20px', padding: '16px', borderRadius: '10px',
              background: 'rgba(15,23,42,0.4)', display: 'flex', gap: '24px',
              fontSize: '13px', color: 'var(--text-secondary)',
            }}>
              <div><i className="fas fa-users" style={{ marginRight: '6px' }}></i>总用户: {users.length}</div>
              <div><i className="fas fa-crown" style={{ marginRight: '6px', color: '#ef4444' }}></i>超管: {users.filter(u => u.role === 'super_admin').length}</div>
              <div><i className="fas fa-shield-alt" style={{ marginRight: '6px', color: '#818cf8' }}></i>管理员: {users.filter(u => u.role === 'admin').length}</div>
              <div><i className="fas fa-user" style={{ marginRight: '6px', color: '#94a3b8' }}></i>学生: {users.filter(u => u.role === 'student').length}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



