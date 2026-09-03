# YiCode 项目设置脚本
Write-Host "YiCode 项目设置" -ForegroundColor Green

# 创建虚拟环境
Write-Host "创建 Python 虚拟环境..." -ForegroundColor Yellow
python -m venv venv
if ( -ne 0) {
    Write-Host "警告: 虚拟环境创建失败，使用全局 Python" -ForegroundColor Yellow
} else {
    Write-Host "虚拟环境创建成功" -ForegroundColor Green
    # 激活虚拟环境
    .\venv\Scripts\Activate.ps1
}

# 安装 Python 依赖
Write-Host "安装 Python 依赖..." -ForegroundColor Yellow
Set-Location services/local_api
pip install -r requirements.txt
Set-Location ../..

# 安装前端依赖
Write-Host "安装前端依赖..." -ForegroundColor Yellow
Set-Location apps/desktop
npm install
Set-Location ../..

# 复制环境变量文件
if (-not (Test-Path .env)) {
    Write-Host "创建 .env 文件..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "请编辑 .env 文件配置您的环境" -ForegroundColor Cyan
} else {
    Write-Host ".env 文件已存在" -ForegroundColor Green
}

# 初始化数据库
Write-Host "初始化数据库..." -ForegroundColor Yellow
python -c "
import sqlite3
conn = sqlite3.connect('yicode.db')
cursor = conn.cursor()
cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        role TEXT DEFAULT \"student\",
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
''')
cursor.execute('''
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        owner_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users (id)
    )
''')
conn.commit()
conn.close()
print('数据库初始化完成')
"

Write-Host "设置完成！" -ForegroundColor Green
Write-Host "运行 'scripts/dev.ps1' 启动开发环境" -ForegroundColor Cyan
