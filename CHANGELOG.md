# 更新日志 (CHANGELOG)

本项目所有重要变更均记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.8.0] - 2026-09-03

### 新增
- **环境自动安装功能**：解决大文件（JDK ~190MB）无法上传 GitHub 的问题
  - `_tools/install_jdk.py`：从 Adoptium 官方 API 下载 JDK 21 (Eclipse Temurin)，解压到 `_tools/jdk`
  - 使用 Python 内置 `zipfile` 解压，无需额外依赖
  - 多源下载（Adoptium API + GitHub Releases），自动回退
  - 安装后自动验证 `javac.exe` 和 `java.exe`
- **后端安装 API**：
  - `POST /install/{env}`：触发后台安装任务（java/cpp）
  - `GET /install/status/{task_id}`：轮询安装进度
  - `GET /install/available`：列出可自动安装的环境及状态
- **前端一键安装按钮**：环境检查页面中，未安装的 Java/C++ 环境显示「一键安装」按钮
  - 实时显示安装进度（下载中/安装中/成功/失败）
  - 安装成功后自动刷新环境检测
  - 安装失败可点击重试
- **runtime/manager.py 路径扩展**：`_EXTRA_BIN_PATHS` 添加 `_tools/jdk` 和 `_tools/go` 本地路径

### 改进
- `.gitignore` 更新：排除 `_tools/jdk/`、`_tools/go/`、`_tools/*.zip`、`_tools/*.7z` 等下载产物
- 环境检查页面安装指引更新：显示 winget 命令 + 一键安装按钮

---

## [0.7.0] - 2026-09-03

### 新增
- **小米 MiMo AI 集成**：接入小米 MiMo-V2.5-Pro 旗舰大模型，替换本地规则匹配 AI
  - `MiMoProvider` 类，通过 OpenAI 兼容协议调用 `https://api.xiaomimimo.com/v1`
  - 无需第三方 SDK，使用 `urllib.request` 原生实现
  - 支持 `chat()` / `generate_code()` / `explain_code()` / `diagnose_error()` 四大能力
- **.env 环境配置**：API Key 安全存储在 `.env` 文件中（已被 `.gitignore` 忽略）
  - `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL` 三个环境变量
  - 后端启动时自动加载 `.env` 文件
- **AI Provider 工厂模式**：`get_provider("mimo")` 默认使用 MiMo，`get_provider("local")` 回退到本地

### 改进
- AI 助教回复质量大幅提升：从本地关键词匹配升级为 MiMo 大模型智能回复
- `ai/__init__.py` 导出更新：`MiMoProvider` 替代 `OpenAIProvider`

---

## [0.6.0] - 2026-09-03

### 新增
- **代码流程图自动生成**：`ai/flowchart.py` 静态分析代码结构，自动生成 Mermaid 流程图
  - 支持 6 种语言（Python / JavaScript / C++ / Java / Go / C#）自动检测
  - 识别控制结构：if / elif / else / for / while / switch / case / return / break / continue
  - 提取函数定义、条件表达式、循环体
  - 生成带分支标签（是/否）和循环回环的完整流程图
- **流程图 API**：`POST /ai/flowchart` 接收代码，返回 Mermaid 语法 + 统计信息
- **重写 FlowchartView 前端组件**：
  - 代码输入区（textarea）支持任意语言代码
  - 「生成流程图」按钮调用后端分析
  - 3 个示例代码快捷加载（年龄判断 / 循环求和 / 二分查找）
  - 导出 SVG 功能
  - 统计信息显示（语言 / 节点数 / 代码行数）
  - 图例说明

### 修复
- **Mermaid 渲染错误**：`>=` / `<` / `>` 等特殊字符导致 Mermaid parse error
  - 所有节点标签用双引号包裹（`N3{"age >= 18?"}`），支持特殊字符原样显示
  - 去除 HTML 实体转义（`&gt;` → `>=`）
- **重置代码 Bug**：有题目时点击「重置代码」加载了语言模板而非题目初始代码
  - 新增 `resetCode()` 智能判断：有题目→重置到 `starter_code`，无题目→重置到模板
- **新建文件按钮**：从静态文字改为可点击按钮，清除当前题目 + 重置空白模板
- **切换语言逻辑**：有题目时切换语言不再覆盖题目代码
- **代码模板精简**：6 种语言的 `CODE_TEMPLATES` 从 40-60 行示例代码改为简洁空白模板

---

## [0.5.0] - 2026-09-03

### 新增
- **代码草稿持久化**：新增 `code_drafts` 数据库表，存储用户每道题的代码草稿（user_id + exercise_id + code）
- **草稿 API**：`POST /drafts`（保存）、`GET /drafts/{user_id}/latest`（刷新恢复）、`GET /drafts/{user_id}/{exercise_id}`、`DELETE /drafts/{user_id}/{exercise_id}`
- **自动保存**：代码编辑器 debounce 2 秒自动保存草稿到数据库，题目横幅显示「保存中.../已保存」状态
- **刷新恢复**：localStorage 记录 `yicode_page` 和 `yicode_exercise_id`，刷新页面后从数据库恢复题目和代码
- **学习中心题目联动**：点击题目卡片 → 编辑器自动加载对应语言的 `starter_code`，题目横幅显示标题/难度/描述
- **随机挑战**：学习中心「随机挑战一题」按钮，随机打开一道练习题

### 修复
- 修复刷新编辑器后代码丢失/变为默认模板的 bug
- 修复 `study_tasks` 表 SQL 语法错误（缺少逗号）

---

## [0.4.0] - 2026-09-03

### 新增
- **用户登录系统**：登录页面（玻璃拟态深色主题），支持登录/注册双模式切换
- **用户认证 API**：`POST /auth/register`、`POST /auth/login`（SHA-256 密码哈希）
- **登录状态持久化**：localStorage `yicode_user` 保存登录状态，刷新不丢失
- **Sidebar 用户信息**：侧边栏底部显示当前登录用户头像、用户名、等级
- **Topbar 用户区**：顶栏右侧显示用户头像和退出登录按钮
- **Dashboard 动态加载**：根据登录用户 ID 加载对应的统计数据

---

## [0.3.0] - 2026-09-03

### 新增
- **SQLite 数据库模块**：`database.py` 创建 users / courses / lessons / exercises / learning_progress / study_tasks / activities / leaderboard 共 8 张表
- **初始数据填充**：6 门课程、52 个章节（引用菜鸟编程/W3Schools/MDN/廖雪峰/GeeksforGeeks/Go Tour 等外部教程）、10 道练习题、6 个用户、5 个任务、5 条活动
- **课程 API**：`GET /courses`、`GET /courses/{id}`（含章节列表和外部链接）
- **练习题 API**：`GET /exercises`（支持按难度/语言筛选）
- **学习进度 API**：`POST /progress`、`GET /progress/{user_id}/{course_id}`
- **仪表盘 API**：`GET /users/{user_id}/dashboard`（统计数据 + 排行榜 + 任务 + 活动 + 课程进度）
- **课堂章节视图**：ClassroomView 点击课程卡片展开章节列表，每章显示来源站点标签，点击跳转外部教程

### 改进
- Dashboard 从假数据切换为真实 API 数据
- LearnCenter 从假数据切换为真实练习题数据
- ClassroomView 从假数据切换为真实课程数据

---

## [0.2.0] - 2026-09-03

### 新增
- **环境检查页面**：EnvCheck 组件显示 6 种语言环境状态（版本/安装路径），一键自检功能
- **环境自检 API**：`POST /self-test` 逐语言执行测试代码并返回 stdout 和执行时间
- **局域网协作功能**：WebSocket 房间系统，6 位数字房间码加入
  - `POST /rooms` 创建房间、`GET /rooms/{code}` 查询房间、`WS /ws/room/{code}` 实时通信
  - 代码实时同步、聊天功能、角色管理（房主/学生）
  - 房间空闲 5 分钟自动清理
- **前端 SPA 路由回退**：vite.config.ts 添加 spa-index-fallback 插件，支持 `?room=280552` 参数加入房间

### 修复
- **C++ 运行时依赖**：编译命令添加 `-static` 标志，静态链接 libstdc++ 等依赖库
- **C++ 环境路径**：`runtime/manager.py` 的 `_EXTRA_BIN_PATHS` 添加 winget 安装路径

---

## [0.1.0] - 2026-09-03

### 初始发布

### 核心功能
- **多语言代码执行环境**：支持 Python 3.13 / JavaScript (Node v24) / C++ (MinGW-w64 GCC) / Java (JDK 21) / Go 1.27 / C# (.NET SDK 8) 共 6 种语言
  - `runtime/manager.py` 统一管理，`_EXTRA_BIN_PATHS` 硬编码常见安装路径作为 PATH 补充
  - `POST /run-code` API 执行代码并返回 stdout/stderr/exit_code
- **AI 编程助教**：
  - `POST /ai/chat` 对话式问答
  - `POST /ai/diagnose` 代码诊断（检查问题）
  - `POST /ai/optimize` 代码优化建议
- **代码流程图**：FlowchartView 组件，可视化代码执行流程
- **FastAPI 后端**：`http://localhost:8000`，CORS 全开放
- **React 前端 SPA**：`http://localhost:1420`，Vite HMR 热更新
  - 深色玻璃拟态 UI 主题
  - 侧边栏导航：仪表盘 / 代码实验室 / AI 助教 / 流程图 / 协作频道 / 学习中心 / 我的课堂 / 环境检查
  - 顶栏搜索框、通知、主题切换
- **协作频道**：CollabChannel 组件，WebSocket 实时通信

### 项目结构
```
yicode/
├── apps/desktop/           # React + TypeScript + Vite 前端
│   ├── src/App.tsx         # 主组件（所有页面和组件）
│   ├── src/App.css         # 全局样式（深色玻璃拟态主题）
│   └── vite.config.ts      # Vite 配置（SPA 回退）
├── services/local_api/     # FastAPI 后端
│   ├── main.py             # API 入口（所有路由）
│   ├── database.py         # SQLite 数据库模块
│   └── requirements.txt    # Python 依赖
├── runtime/manager.py      # 多语言运行时管理器
├── ai/provider.py          # AI Provider 集成
├── data/yicode.db          # SQLite 数据库文件
├── _tools/                 # 工具脚本（MinGW 安装等）
└── docs/                   # 项目文档
```
