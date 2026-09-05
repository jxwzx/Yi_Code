param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectDir

$tools = @{
    python = "python --version"
    node   = "node --version"
    java   = "java -version"
    go     = "go version"
    dotnet = "dotnet --version"
    g++    = "g++ --version"
}

Write-Host "=== YiCode Windows 环境检查 ==="
foreach ($name in $tools.Keys) {
    try {
        $out = Invoke-Expression $tools[$name] 2>&1 | Select-Object -First 1
        Write-Host "[OK] $name : $out"
    } catch {
        Write-Host "[MISSING] $name"
    }
}

Write-Host "=== 后端依赖 ==="
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    python -m venv .venv
}
& ".venv\Scripts\python.exe" -m pip install -q fastapi uvicorn pydantic websockets sqlalchemy python-dotenv pytest httpx

Write-Host "=== 自动化测试 ==="
& ".venv\Scripts\python.exe" -m pytest tests -q

Write-Host "=== 前端依赖 ==="
Push-Location "apps\desktop"
npm install --no-audit --no-fund
Pop-Location

Write-Host "=== 完成 ==="
