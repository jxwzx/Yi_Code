# YiCode 易码 - AI 驱动的编程学习平台

> 面向初学者与大学生计算机专业的编程学习平台，支持多语言代码执行、AI 助教（小米 MiMo）、代码流程图、局域网协作、课程管理。

## 项目特点

- **6 种语言运行环境**：Python / JavaScript / C++ / Java / Go / C# 一键运行
- **小米 MiMo AI 助教**：MiMo-V2.5-Pro 旗舰大模型驱动，代码诊断、优化建议、对话问答
- **代码流程图自动生成**：静态分析代码结构（if/for/while），生成 Mermaid 可视化流程图
- **局域网协作编码**：6 位房间码加入，代码实时同步 + 聊天
- **SQLite 数据持久化**：用户、课程、练习题、代码草稿全部入库
- **课程引用外部教程**：菜鸟编程、MDN、W3Schools、廖雪峰等
- **用户登录系统**：注册/登录、等级经验、学习进度跟踪
- **代码草稿自动保存**：编辑代码自动存入数据库，刷新不丢失

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite | SPA 单页应用，深色玻璃拟态 UI |
| 后端 | Python + FastAPI | RESTful API + WebSocket |
| 数据库 | SQLite | 用户/课程/练习/草稿持久化 |
| 实时通信 | WebSocket | 局域网协作代码同步 |
| AI | 小米 MiMo-V2.5-Pro | 代码诊断/解释/生成/对话问答 |
| 流程图 | Mermaid.js + 静态代码分析 | 自动生成代码执行流程图 |

## 快速开始

### 环境要求

- Python 3.11+（后端必须）
- Node.js 18+（前端必须）
- Java JDK 21 / C++ MinGW（可选，未安装时可在环境检查页面一键安装）

> **关于大文件环境**：JDK (~190MB) 和 MinGW (~50MB) 不上传到 GitHub。
> Clone 后在环境检查页面点击「一键安装」即可自动下载到项目 `_tools/` 目录，
> 后端会自动检测该路径，无需手动配置环境变量。

### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/yicode.git
cd yicode
```

### 2. 配置 AI API Key

在项目根目录创建 `.env` 文件（已被 `.gitignore` 忽略，不会提交到 GitHub）：

```env
# 小米 MiMo AI API（https://platform.xiaomimimo.com/ 获取）
MIMO_API_KEY=sk-你的API密钥
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5-pro
```

> 未配置 API Key 时，AI 助教自动回退到本地规则匹配模式。

### 3. 安装后端依赖

```bash
pip install fastapi uvicorn[standard] pydantic websockets
```

### 4. 安装前端依赖

```bash
cd apps/desktop
npm install
cd ../..
```

### 5. 启动后端服务

```bash
python -m services.local_api.main
```

后端运行在 `http://localhost:8000`

### 6. 启动前端开发服务器

```bash
cd apps/desktop
npm run dev
```

前端运行在 `http://localhost:1420`

### 7. 打开浏览器

访问 `http://localhost:1420`，使用演示账号登录：
- 用户名：`编程学习者`
- 密码：`123456`

## 功能模块

### 1. 学习仪表盘 (Dashboard)
- 学习统计：等级、经验、连续学习天数
- 排行榜
- 学习任务清单
- 最近活动记录
- 课程进度概览

### 2. 学习中心 (LearnCenter)
- 练习题库（10 道题，按难度/语言筛选）
- 点击题目 → 编辑器自动加载对应语言初始代码
- 随机挑战一题

### 3. 代码实验室 (CodeEditor)
- 6 种语言代码编辑与执行
- 题目横幅：显示当前题目标题、难度、描述
- 代码草稿自动保存（debounce 2 秒存入 SQLite）
- 刷新页面自动恢复题目和代码
- 保存状态指示器：保存中... → 已保存

### 4. 我的课堂 (ClassroomView)
- 6 门编程课程（Python/JS/C++/Java/Go/C#）
- 每门课程 8-10 个章节
- 章节引用外部教学网站：
  - 菜鸟编程 (runoob.com)
  - MDN Web Docs
  - W3Schools
  - 廖雪峰 Python 教程
  - GeeksforGeeks
  - Go 官方 Tour
  - 微软官方文档
- 点击章节直接跳转外部教程

### 5. AI 编程助教（小米 MiMo）
- 代码诊断：检查代码问题和潜在 bug
- 优化建议：代码改进和性能优化
- 对话问答：编程问题咨询
- 代码解释：逐行讲解代码逻辑
- 代码生成：根据描述生成代码
- 由 MiMo-V2.5-Pro 旗舰大模型驱动（未配置时回退到本地规则匹配）

### 6. 代码流程图 (FlowchartView)
- 输入任意语言代码，自动分析生成 Mermaid 流程图
- 识别控制结构：if/elif/else、for、while、switch/case、return、break、continue
- 自动检测语言（Python/JS/C++/Java/Go/C#）
- 3 个示例代码快捷加载
- 导出 SVG 文件
- 统计信息（语言/节点数/代码行数）

### 7. 局域网协作 (CollabChannel)
- 6 位数字房间码加入
- 代码实时同步（WebSocket）
- 聊天功能
- 角色管理（房主/学生）
- 房间空闲 5 分钟自动清理
- 局域网访问：`http://你的IP:1420/?room=房间码`

### 8. 环境检查 (EnvCheck)
- 检测 6 种语言运行环境状态
- 显示版本号和安装路径
- 一键自检：逐语言执行测试代码
- **一键安装**：未安装的 Java/C++ 环境可点击「一键安装」自动下载到项目目录
  - JDK 21 从 Adoptium 官方 API 下载（~190MB）
  - MinGW GCC 从 GitHub 下载（~50MB）
  - 实时进度显示，安装成功后自动刷新

### 9. 用户系统
- 注册/登录（SHA-256 密码哈希）
- 登录状态持久化（localStorage）
- 用户等级和经验值
- 退出登录

### 10. 管理员系统（超级管理员权限）
- **多级角色管理**：支持三种角色（student/admin/super_admin）
  - 超级管理员（target_id: 000）：最高权限，可管理所有用户
  - 管理员（target_id: 001/002...）：可查看用户列表
  - 学生（target_id: 无）：普通用户
- **管理面板**：超管/管理员专属用户管理界面
  - 用户列表：显示用户名、等级、经验值、角色标识
  - 角色管理：超管可设置/取消管理员身份
  - 删除用户：超管可删除非超管用户
  - 统计信息：总用户数、各角色数量
- **权限保护**：不能删除最后一个超管，不能删除超管用户

## API 文档

后端启动后访问 `http://localhost:8000/docs` 查看 FastAPI 自动生成的交互式 API 文档。

### 主要 API

| 分类 | 接口 | 说明 |
|---|---|---|
| 认证 | `POST /auth/register` | 用户注册 |
| 认证 | `POST /auth/login` | 用户登录 |
| 仪表盘 | `GET /users/{id}/dashboard` | 获取仪表盘数据 |
| 课程 | `GET /courses` | 课程列表 |
| 课程 | `GET /courses/{id}` | 课程详情+章节 |
| 练习题 | `GET /exercises` | 练习题列表 |
| 代码执行 | `POST /run-code` | 执行代码 |
| AI 助教 | `POST /ai/chat` | AI 对话（MiMo） |
| AI 助教 | `POST /ai/diagnose` | 代码诊断 |
| AI 助教 | `POST /ai/explain` | 代码解释 |
| AI 助教 | `POST /ai/optimize` | 优化建议 |
| 流程图 | `POST /ai/flowchart` | 代码生成 Mermaid 流程图 |
| 环境安装 | `POST /install/{env}` | 一键安装 Java/C++ 环境 |
| 环境安装 | `GET /install/status/{task_id}` | 查询安装进度 |
| 环境安装 | `GET /install/available` | 列出可安装环境 |
| 草稿 | `POST /drafts` | 保存代码草稿 |
| 草稿 | `GET /drafts/{uid}/latest` | 获取最新草稿 |
| 协作 | `POST /rooms` | 创建房间 |
| 协作 | `WS /ws/room/{code}` | 加入房间 |
| 管理 | `GET /admin/users` | 列出所有用户（需管理员权限） |
| 管理 | `POST /admin/users/{user_id}/role` | 设置用户角色（仅超管） |
| 管理 | `DELETE /admin/users/{user_id}` | 删除用户（仅超管） |

## 项目结构

```
yicode/
├── apps/
│   └── desktop/               # React + TypeScript 前端
│       ├── src/
│       │   ├── App.tsx        # 主组件（所有页面和组件）
│       │   └── App.css        # 全局样式
│       ├── vite.config.ts     # Vite 配置
│       └── package.json
├── services/
│   └── local_api/             # FastAPI 后端
│       ├── main.py            # API 入口（所有路由）
│       ├── database.py        # SQLite 数据库模块
│       └── requirements.txt   # Python 依赖
├── runtime/
│   └── manager.py             # 多语言运行时管理器
├── ai/
│   ├── provider.py            # AI Provider（MiMo + Local）
│   └── flowchart.py           # 代码流程图生成器（静态分析）
├── data/
│   └── yicode.db              # SQLite 数据库（自动创建）
├── _tools/                    # 工具脚本（安装脚本保留，环境不提交）
│   ├── install_jdk.py        # JDK 21 自动安装脚本
│   ├── install_mingw.py      # MinGW C++ 自动安装脚本
│   ├── jdk/                  # JDK 安装目录（gitignore）
│   └── mingw64/              # MinGW 安装目录（gitignore）
├── .env                       # 环境变量（API Key，不提交）
├── .gitignore
├── CHANGELOG.md               # 更新日志
├── pyproject.toml
└── README.md
```

## 数据库结构

| 表名 | 说明 |
|---|---|
| `users` | 用户信息（用户名、密码哈希、等级、经验、角色、target_id） |
| `courses` | 课程信息（标题、语言、难度、分类） |
| `lessons` | 课程章节（标题、外部链接、来源站点） |
| `exercises` | 练习题（描述、初始代码、参考答案、通过率） |
| `code_drafts` | 代码草稿（用户+题目+代码，自动保存） |
| `learning_progress` | 学习进度（用户+课程+进度百分比） |
| `study_tasks` | 学习任务 |
| `activities` | 活动记录 |
| `leaderboard` | 排行榜 |

## 开发说明

### 前端开发

前端使用 Vite HMR 热更新，修改 `App.tsx` 或 `App.css` 后自动刷新。

### 后端开发

后端使用 uvicorn reload 模式，修改 Python 文件后自动重启。

### 数据库

SQLite 数据库文件位于 `data/yicode.db`，首次启动后端时自动创建表并填充初始数据。

## 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/新功能`)
3. 提交更改 (`git commit -m '添加新功能'`)
4. 推送到分支 (`git push origin feature/新功能`)
5. 创建 Pull Request

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。
