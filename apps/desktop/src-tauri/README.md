# YiCode Desktop - Tauri 应用

这是 YiCode 桌面应用程序的 Tauri 部分。

## 前置要求

1. 安装 Rust: https://rustup.rs/
2. 安装 Node.js: https://nodejs.org/
3. 安装 Tauri CLI: cargo install tauri-cli

## 开发

1. 安装依赖:
   `ash
   npm install
   `

2. 启动开发服务器:
   `ash
   cargo tauri dev
   `

3. 构建生产版本:
   `ash
   cargo tauri build
   `

## 项目结构

`
src-tauri/
├── src/
│   └── main.rs        # Rust 主程序
├── Cargo.toml         # Rust 依赖配置
├── build.rs           # 构建脚本
├── tauri.conf.json    # Tauri 配置
└── icons/             # 应用图标
`

## 功能

- 文件系统访问
- 系统对话框
- 窗口管理
- Shell 命令执行

## 配置

编辑 	auri.conf.json 来配置应用窗口、权限等。

## 调试

使用 cargo tauri dev 启动开发模式，支持热重载和调试。

## 打包

运行 cargo tauri build 生成可执行文件和安装包。
