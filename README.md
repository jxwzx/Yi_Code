# YiCode (易码) - AI编程学习平台

基于Codex开发规格与项目规划书 V0.1

## 项目简介

YiCode 是一个面向编程学习者的AI辅助学习平台，提供代码空间、实时协作、课堂管理和AI编程助手等功能。

## 技术栈

- **前端**: Tauri + React + TypeScript
- **后端**: Python + FastAPI
- **数据库**: SQLite
- **实时通信**: WebSocket
- **代码编辑器**: Monaco Editor

## 项目结构

`
yicode/
├── apps/desktop/           # Tauri + React 前端应用
├── services/local_api/     # FastAPI 本地API服务
├── services/classroom/     # 课堂管理服务
├── packages/shared/        # 共享类型、协议、工具
├── runtime/                # 运行时管理（Python环境）
├── ai/                     # AI Provider 集成
├── tests/                  # 测试代码
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   ├── network/            # 网络测试
│   ├── classroom/          # 课堂功能测试
│   └── e2e/                # 端到端测试
├── docs/                   # 项目文档
├── scripts/                # 工具脚本
├── .env.example            # 环境变量示例
├── .gitignore              # Git忽略文件
├── pyproject.toml          # Python项目配置
└── README.md               # 项目说明
`

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- Rust (用于Tauri)

### 安装

1. 克隆仓库
   `ash
   git clone <repository-url>
   cd yicode
   `

2. 安装Python依赖
   `ash
   cd services/local_api
   pip install -r requirements.txt
   `

3. 安装前端依赖
   `ash
   cd apps/desktop
   npm install
   `

4. 配置环境变量
   `ash
   cp .env.example .env
   # 编辑 .env 文件，填入必要的配置
   `

### 运行

1. 启动本地API服务
   `ash
   cd services/local_api
   python main.py
   `

2. 启动前端开发服务器
   `ash
   cd apps/desktop
   npm run dev
   `

## 开发阶段

- **M0**: 项目脚手架 - 基础结构、配置、数据库
- **M1**: 代码空间 - 项目管理、文件编辑、Python运行
- **M2**: 运行时管理 - Python环境检测、版本管理、pip管理
- **M3**: 课堂管理 - 教室服务、控制台、WebSocket
- **M4**: 教学功能 - 互动、作业、广播、项目提交
- **M5**: AI Provider - 提示词、代码补全、配置
- **M6**: 测试发布 - E2E测试、性能测试、安装包

## 测试

`ash
# 运行单元测试
cd tests/unit
pytest

# 运行集成测试
cd tests/integration
pytest
`

## 贡献指南

1. Fork 项目
2. 创建功能分支 (git checkout -b feature/AmazingFeature)
3. 提交更改 (git commit -m 'Add some AmazingFeature')
4. 推送到分支 (git push origin feature/AmazingFeature)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系我们

- 项目主页: [https://github.com/yicode/yicode](https://github.com/yicode/yicode)
- 问题反馈: [https://github.com/yicode/yicode/issues](https://github.com/yicode/yicode/issues)
