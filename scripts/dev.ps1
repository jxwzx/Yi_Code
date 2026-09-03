# 开发环境启动脚本
Write-Host "启动 YiCode 开发环境..." -ForegroundColor Green

# 检查 Python 环境
Write-Host "检查 Python 环境..." -ForegroundColor Yellow
python --version
if ( -ne 0) {
    Write-Host "错误: 未找到 Python" -ForegroundColor Red
    exit 1
}

# 检查 Node.js 环境
Write-Host "检查 Node.js 环境..." -ForegroundColor Yellow
node --version
if ( -ne 0) {
    Write-Host "错误: 未找到 Node.js" -ForegroundColor Red
    exit 1
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

# 启动后端服务
Write-Host "启动后端服务..." -ForegroundColor Yellow
Start-Process -FilePath "python" -ArgumentList "services/local_api/main.py" -WindowStyle Normal

# 等待后端服务启动
Start-Sleep -Seconds 2

# 启动前端开发服务器
Write-Host "启动前端开发服务器..." -ForegroundColor Yellow
Set-Location apps/desktop
npm run dev
Set-Location ../..

Write-Host "开发环境启动完成！" -ForegroundColor Green
Write-Host "后端服务: http://localhost:8000" -ForegroundColor Cyan
Write-Host "前端应用: http://localhost:1420" -ForegroundColor Cyan
