# YiCode 运行时管理器
import os
import sys
import subprocess
import venv
from pathlib import Path
from typing import Optional, List

class RuntimeManager:
    def __init__(self, base_dir: str = "."):
        self.base_dir = Path(base_dir)
        self.venv_dir = self.base_dir / "venv"
        
    def check_python(self) -> dict:
        """检查Python环境"""
        try:
            result = subprocess.run([sys.executable, "--version"], 
                                  capture_output=True, text=True)
            version = result.stdout.strip()
            return {
                "available": True,
                "version": version,
                "path": sys.executable
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }
    
    def create_virtual_env(self, python_path: Optional[str] = None) -> bool:
        """创建虚拟环境"""
        try:
            if python_path:
                venv.create(self.venv_dir, with_pip=True, 
                           clear=True, symlinks=True)
            else:
                venv.create(self.venv_dir, with_pip=True)
            return True
        except Exception as e:
            print(f"创建虚拟环境失败: {e}")
            return False
    
    def install_package(self, package: str, in_venv: bool = True) -> bool:
        """安装Python包"""
        try:
            if in_venv and self.venv_dir.exists():
                pip_path = self.venv_dir / "Scripts" / "pip.exe"
                if not pip_path.exists():
                    pip_path = self.venv_dir / "bin" / "pip"
                cmd = [str(pip_path), "install", package]
            else:
                cmd = [sys.executable, "-m", "pip", "install", package]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.returncode == 0
        except Exception as e:
            print(f"安装包失败: {e}")
            return False
    
    def run_script(self, script_path: str, args: List[str] = None) -> dict:
        """运行Python脚本"""
        try:
            if args is None:
                args = []
            
            if self.venv_dir.exists():
                python_path = self.venv_dir / "Scripts" / "python.exe"
                if not python_path.exists():
                    python_path = self.venv_dir / "bin" / "python"
            else:
                python_path = sys.executable
            
            cmd = [str(python_path), script_path] + args
            result = subprocess.run(cmd, capture_output=True, text=True, 
                                   cwd=str(self.base_dir))
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_installed_packages(self, in_venv: bool = True) -> List[str]:
        """获取已安装的包列表"""
        try:
            if in_venv and self.venv_dir.exists():
                pip_path = self.venv_dir / "Scripts" / "pip.exe"
                if not pip_path.exists():
                    pip_path = self.venv_dir / "bin" / "pip"
                cmd = [str(pip_path), "list", "--format=json"]
            else:
                cmd = [sys.executable, "-m", "pip", "list", "--format=json"]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                import json
                packages = json.loads(result.stdout)
                return [f"{p['name']}=={p['version']}" for p in packages]
            return []
        except Exception as e:
            print(f"获取包列表失败: {e}")
            return []

# 使用示例
if __name__ == "__main__":
    manager = RuntimeManager()
    python_info = manager.check_python()
    print(f"Python 环境: {python_info}")
