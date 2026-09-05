# YiCode Windows 正常部署说明

## 适用系统
- Windows 11 x64 / ARM64

## 必需环境
- Python 3.11+
- Node.js 18+
- Java JDK 21+
- Go
- .NET SDK 8
- C++ 编译器：
  - 推荐 MSYS2/MinGW
  - 或 Visual Studio C++ Build Tools

## 推荐安装命令（PowerShell）
```powershell
winget install Python.Python.3.13
winget install OpenJS.NodeJS.LTS
winget install EclipseAdoptium.Temurin.21.JDK
winget install GoLang.Go
winget install Microsoft.DotNet.SDK.8
winget install MSYS2.MSYS2
```

MSYS2 安装后安装 g++：
```powershell
C:\msys64\usr\bin\bash.exe -lc "pacman -Sy --noconfirm mingw-w64-x86_64-gcc"
```

## 启动后端
```powershell
cd C:\path\to\yi_ma
python -m venv .venv
.venv\Scripts\python -m pip install fastapi uvicorn pydantic websockets sqlalchemy python-dotenv pytest httpx
.venv\Scripts\python -m services.local_api.main
```

## 启动前端
```powershell
cd C:\path\to\yi_ma\apps\desktop
npm install
npm run dev
```

访问：
- 前端：http://localhost:1420
- 后端文档：http://localhost:8000/docs

## 运行自动测试
```powershell
cd C:\path\to\yi_ma
.venv\Scripts\python -m pytest tests -q
```

## 可选：Docker 沙箱
正式部署到多用户/公网环境时，建议使用 Docker Desktop + WSL2 作为 Windows 代码执行沙箱。
安装完成后建议先预取六个运行时镜像：
```powershell
winget install Docker.DockerDesktop
wsl --set-default-version 2
docker pull python:3.13
docker pull node:22
docker pull gcc:14
docker pull eclipse-temurin:21
docker pull golang:1.27
docker pull mcr.microsoft.com/dotnet/sdk:8.0
```

启用 Docker 沙箱前先设置环境变量，再重启后端：
```powershell
setx YICODE_DOCKER_SANDBOX 1
```

两种模式的区别：

- 默认模式：不设置 `YICODE_DOCKER_SANDBOX`，直接使用 Windows 本机安装的 Python / Node / MinGW / JDK / Go / .NET，Windows 虚拟机、无 Docker 环境均可运行。
- Docker 模式：设置 `YICODE_DOCKER_SANDBOX=1` 后，`/run` 接口优先在一次性容器中执行代码；若本机完全找不到 Docker CLI，会自动回退到本机运行环境，此时没有容器隔离。
- 若 Docker CLI 已安装但 Docker Desktop 尚未启动，容器命令会直接报错并提示启动 Docker，而不是在用户代码已经可能开始执行后再切回本机。
- Docker 容器固定使用 `--rm`、`--network none`、`--security-opt no-new-privileges`，并且只把每次运行生成的临时任务目录挂载到容器，不开放网络和宿主目录访问。

## 安全备注
- 演示账号 `编程学习者 / 123456` 仅用于本地测试
- 部署到公网前应修改默认密码并启用 HTTPS
