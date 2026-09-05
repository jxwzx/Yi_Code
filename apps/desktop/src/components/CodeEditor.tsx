import { useState, useEffect, useRef, useCallback } from 'react'
import { MonacoCodeEditor } from '../MonacoEditor'
import { API_BASE } from '../api'
import type { Exercise } from '../types'

interface CodeEditorProps {
  onRunStatus: (s: { id: string; logFile: string } | null) => void
  exercise: Exercise | null
  onClearExercise: () => void
  userId: number
}

const CODE_TEMPLATES: Record<string, string> = {
  py: `# Python 代码编辑器\n# 在此编写你的代码\n\n\n`,
  js: `// JavaScript 代码编辑器\n// 在此编写你的代码\n\n\n`,
  cpp: `// C++ 代码编辑器\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在此编写你的代码\n\n    return 0;\n}`,
  java: `// Java 代码编辑器\npublic class Main {\n    public static void main(String[] args) {\n        // 在此编写你的代码\n\n    }\n}`,
  go: `// Go 代码编辑器\npackage main\n\nimport "fmt"\n\nfunc main() {\n    // 在此编写你的代码\n\n}`,
  cs: `// C# 代码编辑器\nusing System;\n\nclass Program\n{\n    static void Main()\n    {\n        // 在此编写你的代码\n\n    }\n}`,
}

export function CodeEditor({ onRunStatus: _, exercise, onClearExercise, userId }: CodeEditorProps) {
  const [lang, setLang] = useState('py')
  const [code, setCode] = useState(CODE_TEMPLATES.py)
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([])
  const [running, setRunning] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (exercise) {
      setLang(exercise.language)
      setCode(exercise.starter_code || CODE_TEMPLATES[exercise.language] || CODE_TEMPLATES.py)
    }
  }, [exercise])

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await fetch(API_BASE + '/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, language: lang, code }),
        })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch { setSaveStatus('idle') }
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [code, lang, userId])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setOutput([{ type: 'meta', text: '正在运行...' }])
    try {
      const resp = await fetch(API_BASE + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code }),
      })
      const data = await resp.json()
      const newOutput = []
      if (data.stdout) newOutput.push({ type: 'stdout', text: data.stdout })
      if (data.stderr) newOutput.push({ type: 'stderr', text: data.stderr })
      if (data.error) newOutput.push({ type: 'error', text: data.error })
      newOutput.push({ type: 'meta', text: `运行完成 - 退出码: ${data.exit_code} - 耗时: ${data.elapsed?.toFixed(2) || 0}s` })
      setOutput(newOutput)
    } catch (e) {
      setOutput([{ type: 'error', text: '运行失败' }])
    } finally { setRunning(false) }
  }, [lang, code])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleRun() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleRun])

  const handleLangChange = (newLang: string) => {
    setLang(newLang)
    if (!exercise) setCode(CODE_TEMPLATES[newLang] || CODE_TEMPLATES.py)
  }

  return (
    <div className="code-editor-wrap">
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <select value={lang} onChange={(e) => handleLangChange(e.target.value)} className="lang-select">
            <option value="py">🐍 Python</option>
            <option value="js">📜 JavaScript</option>
            <option value="cpp">⚙️ C++</option>
            <option value="java">☕ Java</option>
            <option value="go">🔵 Go</option>
            <option value="cs">💜 C#</option>
          </select>
          {exercise && <button className="btn btn-secondary" onClick={onClearExercise}><i className="fas fa-times"></i> 清除题目</button>}
          <span className={`save-status ${saveStatus}`}>
            {saveStatus === 'saving' && <><i className="fas fa-spinner fa-spin"></i> 保存中...</>}
            {saveStatus === 'saved' && <><i className="fas fa-check"></i> 已保存</>}
          </span>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-success" onClick={handleRun} disabled={running}>
            {running ? <><i className="fas fa-spinner fa-spin"></i> 运行中...</> : <><i className="fas fa-play"></i> 运行</>}
          </button>
        </div>
      </div>
      <div className="editor-content">
        <div className="editor-panel">
          <MonacoCodeEditor value={code} onChange={setCode} language={lang} height="100%" />
        </div>
        <div className="output-panel">
          <div className="output-header">
            <span className="output-tab active"><i className="fas fa-terminal"></i> 输出</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setOutput([])}>清空</button>
          </div>
          <div className="output-content">
            {output.map((line, i) => <div key={i} className={`output-line ${line.type}`}><pre>{line.text}</pre></div>)}
            {output.length === 0 && <div className="output-placeholder"><i className="fas fa-terminal"></i><p>按 Ctrl+Enter 运行代码</p></div>}
          </div>
        </div>
      </div>
      {exercise && (
        <div className="exercise-info-panel">
          <div className="exercise-header">
            <h3><i className="fas fa-puzzle-piece"></i> {exercise.title}</h3>
            <span className={`difficulty ${exercise.difficulty}`}>{exercise.difficulty}</span>
          </div>
          <p className="exercise-desc">{exercise.description}</p>
        </div>
      )}
    </div>
  )
}
