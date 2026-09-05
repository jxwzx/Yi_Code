import { useRef, useEffect } from 'react'
import Editor, { OnMount, OnChange, BeforeMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

// 语言映射
const LANG_MAP: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  cpp: 'cpp',
  java: 'java',
  go: 'go',
  cs: 'csharp',
}

// 自定义浅色主题：参考 VS Code，柔和奶灰背景 + 深色文字 + 清晰光标
const YICODE_LIGHT_THEME: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'd73a49' },
    { token: 'keyword.control', foreground: 'd73a49' },
    { token: 'string', foreground: '032f62' },
    { token: 'string.escape', foreground: '032f62' },
    { token: 'number', foreground: '005cc5' },
    { token: 'type', foreground: '6f42c1' },
    { token: 'type.identifier', foreground: '6f42c1' },
    { token: 'function', foreground: '6f42c1' },
    { token: 'variable', foreground: '24292e' },
    { token: 'variable.predefined', foreground: '005cc5' },
    { token: 'operator', foreground: 'd73a49' },
    { token: 'delimiter', foreground: '24292e' },
    { token: 'delimiter.bracket', foreground: '24292e' },
    { token: 'tag', foreground: '22863a' },
    { token: 'attribute.name', foreground: '6f42c1' },
    { token: 'attribute.value', foreground: '032f62' },
  ],
  colors: {
    'editor.background': '#f6f8fa',
    'editor.foreground': '#24292e',
    'editor.lineHighlightBackground': '#f0f3f6',
    'editor.selectionBackground': '#c8ddf0',
    'editor.inactiveSelectionBackground': '#dbe6f0',
    'editorLineNumber.foreground': '#9da5b0',
    'editorLineNumber.activeForeground': '#24292e',
    'editorCursor.foreground': '#044289',
    'editorCursor.background': '#ffffff',
    'editorGutter.background': '#f6f8fa',
    'editorIndentGuide.background': '#e1e4e8',
    'editorIndentGuide.activeBackground': '#d0d4d8',
    'editorBracketMatch.background': '#d4e5f7',
    'editorBracketMatch.border': '#2188ff',
    'editorWidget.background': '#f6f8fa',
    'editorWidget.border': '#e1e4e8',
    'editorSuggestWidget.background': '#f6f8fa',
    'editorSuggestWidget.border': '#e1e4e8',
    'editorSuggestWidget.selectedBackground': '#e1e4e8',
    'editorHoverWidget.background': '#f6f8fa',
    'editorHoverWidget.border': '#e1e4e8',
    'input.background': '#ffffff',
    'input.border': '#e1e4e8',
    'focusBorder': '#2188ff',
    'list.hoverBackground': '#e8eaed',
    'scrollbar.shadow': '#00000010',
    'scrollbarSlider.background': '#959da530',
    'scrollbarSlider.hoverBackground': '#959da550',
    'scrollbarSlider.activeBackground': '#959da570',
  },
}

interface MonacoEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  theme?: 'vs-dark' | 'light'
  readOnly?: boolean
  height?: string
  placeholder?: string
}

// 编辑器选项：必须在首次渲染前完整提供，
// 否则 Monaco 会用默认值完成第一次布局测量并烘焙错误坐标，
// 导致第一行被截半、光标/点击位置与文字错位。
const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  minimap: { enabled: false },
  lineNumbers: 'on',
  roundedSelection: true,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: 'on',
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  parameterHints: { enabled: true },
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoIndent: 'full',
  formatOnPaste: true,
  formatOnType: true,
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'all',
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  smoothScrolling: true,
  contextmenu: true,
  mouseWheelZoom: true,
}

export function MonacoCodeEditor({
  value,
  onChange,
  language = 'python',
  theme = 'vs-dark',
  readOnly = false,
  height = '100%',
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<any>(null)
  const themeRef = useRef(theme)
  themeRef.current = theme

  // 映射语言
  const lang = LANG_MAP[language] || language

  // 自定义主题名称
  const themeName = theme === 'light' ? 'yicode-light' : 'vs-dark'

  // 挂载前注册自定义主题
  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('yicode-light', YICODE_LIGHT_THEME)
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // 立即应用当前主题
    monaco.editor.setTheme(themeRef.current === 'light' ? 'yicode-light' : 'vs-dark')

    // 配置 Python 自动补全
    monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems: (model: editor.ITextModel, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const suggestions = [
          { label: 'def', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'def ${1:function_name}(${2:args}):\n\t${3:pass}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '定义函数', range },
          { label: 'class', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'class ${1:ClassName}:\n\tdef __init__(self${2:, args}):\n\t\t${3:pass}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '定义类', range },
          { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if ${1:condition}:\n\t${2:pass}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '条件判断', range },
          { label: 'for', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'for循环', range },
          { label: 'while', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'while ${1:condition}:\n\t${2:pass}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'while循环', range },
          { label: 'try', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${3:print(e)}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '异常处理', range },
          { label: 'with', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'with ${1:expression} as ${2:var}:\n\t${3:pass}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '上下文管理器', range },
          { label: 'lambda', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'lambda ${1:args}: ${2:expression}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '匿名函数', range },
          { label: 'print', kind: monaco.languages.CompletionItemKind.Function, insertText: 'print(${1:object})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '打印输出', range },
          { label: 'len', kind: monaco.languages.CompletionItemKind.Function, insertText: 'len(${1:obj})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '返回长度', range },
          { label: 'range', kind: monaco.languages.CompletionItemKind.Function, insertText: 'range(${1:stop})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '生成范围', range },
          { label: 'input', kind: monaco.languages.CompletionItemKind.Function, insertText: 'input(${1:prompt})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '用户输入', range },
          { label: 'int', kind: monaco.languages.CompletionItemKind.Function, insertText: 'int(${1:x})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '转换为整数', range },
          { label: 'str', kind: monaco.languages.CompletionItemKind.Function, insertText: 'str(${1:object})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '转换为字符串', range },
          { label: 'float', kind: monaco.languages.CompletionItemKind.Function, insertText: 'float(${1:x})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '转换为浮点数', range },
          { label: 'sorted', kind: monaco.languages.CompletionItemKind.Function, insertText: 'sorted(${1:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '排序', range },
          { label: 'enumerate', kind: monaco.languages.CompletionItemKind.Function, insertText: 'enumerate(${1:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '枚举', range },
          { label: 'zip', kind: monaco.languages.CompletionItemKind.Function, insertText: 'zip(${1:iter1}, ${2:iter2})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '打包', range },
          { label: 'map', kind: monaco.languages.CompletionItemKind.Function, insertText: 'map(${1:func}, ${2:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '映射', range },
          { label: 'filter', kind: monaco.languages.CompletionItemKind.Function, insertText: 'filter(${1:func}, ${2:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '过滤', range },
          { label: 'sum', kind: monaco.languages.CompletionItemKind.Function, insertText: 'sum(${1:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '求和', range },
          { label: 'max', kind: monaco.languages.CompletionItemKind.Function, insertText: 'max(${1:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '最大值', range },
          { label: 'min', kind: monaco.languages.CompletionItemKind.Function, insertText: 'min(${1:iterable})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '最小值', range },
          { label: 'abs', kind: monaco.languages.CompletionItemKind.Function, insertText: 'abs(${1:x})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '绝对值', range },
          { label: 'type', kind: monaco.languages.CompletionItemKind.Function, insertText: 'type(${1:object})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '类型', range },
          { label: 'isinstance', kind: monaco.languages.CompletionItemKind.Function, insertText: 'isinstance(${1:obj}, ${2:classinfo})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '类型检查', range },
          { label: 'import os', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import os', documentation: '操作系统接口', range },
          { label: 'import sys', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import sys', documentation: '系统相关', range },
          { label: 'import math', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import math', documentation: '数学函数', range },
          { label: 'import random', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import random', documentation: '随机数', range },
          { label: 'import datetime', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import datetime', documentation: '日期时间', range },
          { label: 'import json', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import json', documentation: 'JSON处理', range },
          { label: 'import re', kind: monaco.languages.CompletionItemKind.Module, insertText: 'import re', documentation: '正则表达式', range },
          { label: 'from collections import Counter', kind: monaco.languages.CompletionItemKind.Module, insertText: 'from collections import Counter', documentation: '计数器', range },
          { label: 'from typing import List', kind: monaco.languages.CompletionItemKind.Module, insertText: 'from typing import List', documentation: '类型提示', range },
        ]
        return { suggestions }
      },
    })

    // 配置 JavaScript 自动补全
    monaco.languages.registerCompletionItemProvider('javascript', {
      provideCompletionItems: (model: editor.ITextModel, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        const suggestions = [
          { label: 'function', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'function ${1:name}(${2:params}) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '函数声明', range },
          { label: 'const', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'const ${1:name} = ${2:value};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '常量声明', range },
          { label: 'let', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'let ${1:name} = ${2:value};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '变量声明', range },
          { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if (${1:condition}) {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '条件判断', range },
          { label: 'for', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'for循环', range },
          { label: 'while', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'while (${1:condition}) {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'while循环', range },
          { label: 'try', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'try {\n\t${1:// code}\n} catch (${2:error}) {\n\t${3:console.error(error)}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '异常处理', range },
          { label: 'arrow', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'const ${1:name} = (${2:params}) => {\n\t${3:// code}\n};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '箭头函数', range },
          { label: 'console.log', kind: monaco.languages.CompletionItemKind.Function, insertText: 'console.log(${1:obj});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '控制台输出', range },
          { label: 'console.error', kind: monaco.languages.CompletionItemKind.Function, insertText: 'console.error(${1:obj});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '错误输出', range },
          { label: 'JSON.stringify', kind: monaco.languages.CompletionItemKind.Function, insertText: 'JSON.stringify(${1:obj})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'JSON序列化', range },
          { label: 'JSON.parse', kind: monaco.languages.CompletionItemKind.Function, insertText: 'JSON.parse(${1:str})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'JSON解析', range },
          { label: 'fetch', kind: monaco.languages.CompletionItemKind.Function, insertText: 'fetch(${1:url})\n\t.then(res => res.json())\n\t.then(data => ${2:console.log(data)})\n\t.catch(err => ${3:console.error(err)});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '网络请求', range },
          { label: 'async', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'async function ${1:name}(${2:params}) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '异步函数', range },
          { label: 'await', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'await ${1:promise};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '等待Promise', range },
          { label: 'class', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'class ${1:ClassName} {\n\tconstructor(${2:params}) {\n\t\t${3:// code}\n\t}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '类声明', range },
          { label: 'import', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'import ${1:module} from ${2:path};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '导入模块', range },
          { label: 'export', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'export ${1:default} ${2:module};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '导出模块', range },
        ]
        return { suggestions }
      },
    })

    // 配置 C++ 自动补全
    monaco.languages.registerCompletionItemProvider('cpp', {
      provideCompletionItems: (model: editor.ITextModel, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        const suggestions = [
          { label: '#include', kind: monaco.languages.CompletionItemKind.Keyword, insertText: '#include <${1:iostream}>', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '包含头文件', range },
          { label: 'using namespace', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'using namespace std;', documentation: '使用命名空间', range },
          { label: 'int main', kind: monaco.languages.CompletionItemKind.Function, insertText: 'int main() {\n\t${1:// code}\n\treturn 0;\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '主函数', range },
          { label: 'cout', kind: monaco.languages.CompletionItemKind.Function, insertText: 'cout << ${1:output} << endl;', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '输出', range },
          { label: 'cin', kind: monaco.languages.CompletionItemKind.Function, insertText: 'cin >> ${1:variable};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '输入', range },
          { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if (${1:condition}) {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '条件判断', range },
          { label: 'for', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'for循环', range },
          { label: 'while', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'while (${1:condition}) {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'while循环', range },
          { label: 'vector', kind: monaco.languages.CompletionItemKind.Class, insertText: 'vector<${1:int}> ${2:vec};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '向量', range },
          { label: 'string', kind: monaco.languages.CompletionItemKind.Class, insertText: 'string ${1:str};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '字符串', range },
          { label: 'class', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'class ${1:ClassName} {\npublic:\n\t${2:// code}\n};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '类声明', range },
          { label: 'void', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'void ${1:functionName}(${2:params}) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '无返回值函数', range },
          { label: 'int', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'int ${1:functionName}(${2:params}) {\n\t${3:// code}\n\treturn 0;\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '整数函数', range },
        ]
        return { suggestions }
      },
    })

    // 配置 Java 自动补全
    monaco.languages.registerCompletionItemProvider('java', {
      provideCompletionItems: (model: editor.ITextModel, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        const suggestions = [
          { label: 'public static void main', kind: monaco.languages.CompletionItemKind.Function, insertText: 'public static void main(String[] args) {\n\t${1:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '主方法', range },
          { label: 'System.out.println', kind: monaco.languages.CompletionItemKind.Function, insertText: 'System.out.println(${1:output});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '输出', range },
          { label: 'Scanner', kind: monaco.languages.CompletionItemKind.Class, insertText: 'Scanner scanner = new Scanner(System.in);\n${1:int num = scanner.nextInt();}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '输入扫描器', range },
          { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if (${1:condition}) {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '条件判断', range },
          { label: 'for', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'for循环', range },
          { label: 'while', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'while (${1:condition}) {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'while循环', range },
          { label: 'class', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'public class ${1:ClassName} {\n\t${2:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '类声明', range },
          { label: 'ArrayList', kind: monaco.languages.CompletionItemKind.Class, insertText: 'ArrayList<${1:String}> ${2:list} = new ArrayList<>();', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '动态数组', range },
          { label: 'HashMap', kind: monaco.languages.CompletionItemKind.Class, insertText: 'HashMap<${1:String}, ${2:String}> ${3:map} = new HashMap<>();', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '哈希映射', range },
          { label: 'String', kind: monaco.languages.CompletionItemKind.Class, insertText: 'String ${1:str} = "${2:value}";', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '字符串', range },
          { label: 'void', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'public void ${1:methodName}(${2:params}) {\n\t${3:// code}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '无返回值方法', range },
          { label: 'return', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'return ${1:value};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '返回值', range },
        ]
        return { suggestions }
      },
    })

    // 编辑器选项已全部在 JSX options 中提供（见 EDITOR_OPTIONS），
    // 此处不再 updateOptions，避免首次渲染用默认值烘焙错误坐标。
    // automaticLayout: true 由 @monaco-editor/react 内部 ResizeObserver 处理尺寸变化。

    // 聚焦编辑器
    if (!readOnly) {
      editor.focus()
    }
  }

  const handleChange: OnChange = (value) => {
    onChange?.(value || '')
  }

  // 监听主题变化 - 使用 setTheme 强制立即刷新
  useEffect(() => {
    const name = theme === 'light' ? 'yicode-light' : 'vs-dark'
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(name)
    }
  }, [theme])

  return (
    <div style={{ height, width: '100%' }}>
      <Editor
        height="100%"
        language={lang}
        value={value}
        theme={themeName}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: '14px',
          }}>
            <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
            加载编辑器...
          </div>
        }
        options={{ ...EDITOR_OPTIONS, readOnly }}
      />
    </div>
  )
}

export default MonacoCodeEditor
