import { useEffect, useState } from 'react'
import { API_BASE } from './api'

export function FlowchartView() {
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
      const resp = await fetch(API_BASE + '/ai/flowchart', {
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
                background: 'var(--bg-card)',
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

