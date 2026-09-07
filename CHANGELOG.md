# 更新日志 (CHANGELOG)

本项目所有重要变更均记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.17.0] - 2026-09-07

### 新增
- **一键启动前后端**：新增 `scripts/dev-all.mjs` 启动脚本
  - 项目根目录执行 `npm run dev` 同时拉起后端 (FastAPI:8000) 与前端 (Vite:1420)
  - 自动探测可用的 Python 命令（py / python / python3）
  - 端口占用检测：某端已在运行时自动跳过，不会重复启动报错
  - `Ctrl+C` 一次性退出全部服务，无残留进程
  - 保留单独启动能力：`npm run dev:api`（仅后端）、`npm run dev:web`（仅前端）
- **移动端适配**：小屏设备（≤968px）完整可用
  - 侧边栏改为滑入式抽屉：顶栏新增汉堡按钮，遮罩点击/选择菜单后自动收起
  - 顶栏精简：隐藏搜索框与用户名，≤640px 进一步压缩高度
  - 编辑器页纵向堆叠：编辑器固定 72vh、输出面板压缩、题目横幅改纵向布局
  - 协作页三栏（成员/代码/聊天）改纵向堆叠，聊天面板恢复显示

### 修复
- **编辑器第一行只显示半行、行号与代码错位**（根因共 4 处）：
  - 删除全局 `.line-numbers` padding 规则（深色+浅色两处）——该类名命中 Monaco 内部行号导致整体下移错位，留注释防止复发
  - `.editor-layout` 高度从 `height: 100%` 改为 `flex: 1; min-height: 0`——原写法未扣除题目横幅高度导致溢出，编辑器聚焦时被浏览器滚出可视区
  - `fadeIn` 动画移除 `translateY` 位移——动画期间的元素偏移会让 Monaco 内部坐标与视觉位置错位（点击/光标不准）
  - Monaco 外层容器补 `flex: 1; min-height: 0`，防止百分比高度失效导致渲染区塌陷
- **编辑器页响应式断点过高**：1400px 降为 1100px，日常笔记本窗口恢复双栏布局

---

## [0.16.0] - 2026-09-04

### 新增
- **协作编程 Monaco Editor**：协作频道的代码编辑器升级为 Monaco Editor
  - 语法高亮：支持 Python、JavaScript、C++、Java、Go、C#
  - 代码智能补全：关键字、内置函数、常用模块自动提示
  - 括号匹配与颜色区分、代码折叠、自动缩进
  - 主题跟随系统深色/亮色模式
  - 只读控制：非 writer 角色自动锁定编辑器
- **房主收回写权限**：房主可在成员列表中点击「收回」按钮，将已授权成员降级为观察者
- **房间持久化重连**：刷新页面后自动重连回房间，不丢失状态
  - 房间信息保存到 localStorage，页面加载时自动恢复
  - 服务端房间空后 30 秒宽限期才销毁，允许刷新重连
  - 服务端检测同用户多连接，旧连接断开不移除成员
  - 客户端卸载时不主动关闭 WebSocket，由浏览器自然处理

### 修复
- **非房主申请写权限不显示**：`room_state` 处理中同步 `myRole`，修复加入房间后角色始终为 `writer` 的问题
- **非房主角色下拉框**：角色切换下拉框改为仅房主可见，非房主通过「申请写权限」按钮申请
- **编辑器权限判断**：代码编辑器的可编辑性从 `myName === host` 改为 `myRole === 'writer'`，被授权的非房主成员可正常编辑
- **writeRequests 闭包陈旧引用**：申请列表去重检查移入函数式更新内，避免快速连续申请产生重复

---

## [0.15.0] - 2026-09-04

### 新增
- **Monaco Editor 集成**：代码编辑器升级为 VSCode 同款编辑器组件
  - 语法高亮：支持 Python、JavaScript、C++、Java、Go、C# 等语言
  - 代码自动补全：智能提示关键字、函数、模块等
  - 括号匹配：彩色括号配对显示
  - 代码折叠：支持代码块折叠
  - 多光标编辑：支持多光标同时编辑
  - 代码格式化：自动格式化代码
  - 鼠标滚轮缩放：Ctrl+滚轮调整字体大小
  - 主题切换：自动跟随深色/亮色主题

### 修复
- **局域网协作频道**：修复其他电脑无法加入房间的问题
  - 后端 `GET /rooms/{code}` 现在返回 `lan_ip`、`ws_url`、`share_url`
  - 前端加入房间时使用房间创建者的 IP 地址连接 WebSocket
  - 前端支持从 URL 参数中读取 `room` 和 `host` 参数
  - 分享链接包含房间创建者的 IP 地址
  - 新增「房间创建者 IP 地址」输入框，方便手动输入

## [0.14.0] - 2026-09-03

### 新增
- **AI 助教对话模式**：支持三种对话模式切换
  - **普通模式**：直接回答问题，简洁明了
  - **深度思考模式**：深入分析原理，提供多种方案对比
  - **苏格拉底引导模式**：通过提问引导学生思考，不直接给答案
  - 模式状态保存到 localStorage，刷新不丢失
  - AI 头部显示当前模式和描述
- **主题切换功能**：顶栏右侧主题按钮，支持白昼/黑夜模式切换
  - 白色背景（白昼模式）/ 暗色背景（黑夜模式）
  - 主题状态保存到 localStorage，刷新不丢失
- **标题栏功能增强**：
  - 帮助按钮：显示快捷键帮助（Ctrl+Enter、Ctrl+S 等）
  - 消息通知：显示通知列表
- **AI 助手 API Key 设置**：顶栏右侧齿轮图标，点击弹出 API Key 输入框
  - 支持密码/明文切换显示
  - 自动保存到 localStorage，刷新不丢失
  - 发送请求时自动携带 API Key

### 改进
- **亮色主题全面兼容**：修复 18 处 CSS 硬编码深色背景和 7 处内联样式
  - 代码编辑器：标签栏、工具栏、语言选择器、行号区域
  - AI 面板：头部、消息气泡、输入框、快捷操作按钮
  - 协作频道：频道列表、搜索框、聊天区域、成员列表
  - 流程图：画布、工具栏、工具芯片
  - 环境检测：统计卡片使用 CSS 变量
  - 管理面板：统计信息区域
- **下拉框深色主题**：全局 `select` / `option` 深色样式统一

### 修复
- **TypeScript 编译错误**：修复 8 个编译错误
  - 删除未使用的 `FLOWCHARTS` 常量
  - 修复 `runStatus` / `onRunStatus` 未使用
  - 修复注册缺少角色字段（`role` / `target_id`）
  - 修复 `issues` 可能为 undefined（使用 `NonNullable` 类型）
  - 删除未使用的 `genAvatars` / `studentColors` / `idx`

---

## [0.13.0] - 2026-09-03

### 新增
- **发布课程功能**：「我的课程」页面新增「发布课程」弹窗
  - 课程名称（必填）、课程图片（可选 URL，无图默认显示标题首字）
  - 课程链接（可选，有链接时卡片显示「打开课程」按钮）
  - 课程介绍、编程语言、难度、讲师/来源
  - 后端 `POST /courses` 创建课程，自动迁移 `image_url` / `course_url` 字段
- **课程卡片重新设计**：全新卡片布局，顶部封面区域 + 信息区域
  - 封面：有图片显示背景图，无图片显示语言主题渐变色 + 标题首字
  - 右上角半透明难度标签
  - 课程名称、介绍（最多 2 行省略）、讲师 + 学习人数
  - 按钮：有链接→「打开课程」（新窗口），无链接→「查看章节」

### 修复
- **登录/退出黑屏 Bug**：React Hooks 顺序违规导致页面崩溃
  - `searchQuery` 的 `useState` 从条件渲染后移到组件顶部
  - 确保所有 Hooks 在 `if (!currentUser)` 条件之前定义
- **搜索框不可用**：搜索框已可正常输入，新增清除按钮 + Escape 键支持

### 改进
- **页面标题同步**：「我的课程」页面标题从「学习中心」改为「我的课程」，与侧边栏一致

---

## [0.12.0] - 2026-09-03

### 新增
- **超级管理员角色系统**：实现多级权限管理，支持三种角色（student/admin/super_admin）
  - `target_id` 字段：超级管理员(000)，管理员(001/002...)，学生(无)
  - 自动迁移：现有用户自动升级为超管，新注册用户默认为学生
  - 权限保护：不能删除最后一个超管，不能删除超管用户
- **管理面板页面**：管理员专属用户管理界面
  - 用户列表：显示用户名、等级、经验、角色标识
  - 角色管理：超管可设置/取消管理员身份
  - 删除用户：超管可删除非超管用户
  - 统计信息：总用户数、超管/管理员/学生数量
- **侧边栏管理入口**：超管/管理员在侧边栏显示"管理面板"导航项
- **后端管理 API**：新增 3 个管理员接口
  - `GET /admin/users` - 列出所有用户
  - `POST /admin/users/{user_id}/role` - 设置用户角色
  - `DELETE /admin/users/{user_id}` - 删除用户

### 修复
- **Unicode 编码错误**：修复后端启动时的 GBK 编码问题
  - 移除 emoji 字符（🚀📦✅❌🌐）
  - 使用 ASCII 字符替代（[OK][NO]）
  - 确保在 Windows PowerShell 中正常运行

---

## [0.11.0] - 2026-09-03

### 修复
- **下拉框深色主题统一**：解决所有 `<select>` 和 `<option>` 元素显示白色背景的问题
  - 新增全局 `select` / `option` CSS 规则，统一深色背景 + 浅色文字
  - 选中项紫色高亮（`var(--primary)`），悬浮项灰色（`#334155`）
  - 自定义 SVG 箭头图标替代浏览器默认
  - 清理 5 处内联 style 覆盖（难度筛选/发布题目/协作频道）

### 新增
- **搜索框功能化**：顶栏搜索框实时过滤学习中心题目（按标题/描述/标签/语言）
- **发布题目功能**：学习中心新增「发布题目」弹窗，参考 LeetCode/扣子标准
  - 题目标题、描述、难度、语言、初始代码骨架、预期输出（自动判题标准）、标签
  - 后端 `POST /exercises` 创建题目 + `POST /exercises/check` 自动判题
  - 判题逻辑：运行用户代码 → 比对 stdout 与预期输出 → 返回 matched
- **难度筛选器**：学习中心题目列表新增难度下拉筛选（全部/简单/中等/困难）

---

## [0.10.0] - 2026-09-03

### 新增
- **用户登录系统**：注册/登录页面，SHA-256 密码哈希，localStorage 状态持久化
- **代码草稿持久化**：`code_drafts` 表，编辑代码自动保存到 SQLite，刷新不丢失
  - debounce 2 秒自动保存，题目横幅显示保存状态
  - 刷新页面自动恢复最近编辑的题目和代码
- **题目代码联动**：点击学习中心题目 → 编辑器自动加载对应语言的初始代码骨架

---

## [0.9.0] - 2026-09-03

### 修复
- **代码执行输出不显示 Bug**：前端检查 `data.taskId`（驼峰）但后端返回 `task_id`（下划线），导致 `undefined` 后走本地模拟
  - 改为直接读取 `/run` 同步响应的 `data.stdout` / `data.stderr`，不再轮询 `/tasks/{id}`
- **课堂页面 UI 优化**：去掉课程卡片顶部彩色色块，图标改为小尺寸放在标题前
- **环境检查页面布局**：从 2 列横向 grid 改为单列纵向 flex，消除横向滚动

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
