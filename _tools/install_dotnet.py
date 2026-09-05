#!/usr/bin/env python3
"""Cross-platform .NET SDK 8 installer (Windows / macOS / Linux) -> project _tools/dotnet."""
import os
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.request

ssl._create_default_https_context = ssl._create_unverified_context

ROOT = os.path.dirname(os.path.abspath(__file__))
DOTNET_DIR = os.path.join(ROOT, "dotnet")
CHANNEL = "8.0"


def is_installed():
    exe = ".exe" if os.name == "nt" else ""
    if shutil.which("dotnet"):
        return True
    return os.path.exists(os.path.join(DOTNET_DIR, f"dotnet{exe}"))


def _download(url, dest):
    urllib.request.urlretrieve(url, dest)


def _run_installer():
    if os.name == "nt":
        script_url = "https://dot.net/v1/dotnet-install.ps1"
        fd, path = tempfile.mkstemp(suffix=".ps1")
        os.close(fd)
        _download(script_url, path)
        cmd = [
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", path, "-Channel", CHANNEL, "-InstallDir", DOTNET_DIR, "-NoPath",
        ]
    else:
        script_url = "https://dot.net/v1/dotnet-install.sh"
        fd, path = tempfile.mkstemp(suffix=".sh")
        os.close(fd)
        _download(script_url, path)
        os.chmod(path, 0o755)
        cmd = ["bash", path, "--channel", CHANNEL, "--install-dir", DOTNET_DIR, "--no-path"]
    return cmd, path


def verify():
    exe = ".exe" if os.name == "nt" else ""
    dotnet = os.path.join(DOTNET_DIR, f"dotnet{exe}")
    if not os.path.exists(dotnet):
        return False
    r = subprocess.run([dotnet, "--version"], capture_output=True, text=True, timeout=30)
    print(".NET SDK " + r.stdout.strip())
    return r.returncode == 0


def main():
    if is_installed():
        print("[SKIP] .NET SDK 已安装")
        return 0
    os.makedirs(DOTNET_DIR, exist_ok=True)
    cmd, install_script = _run_installer()
    print(f"安装 .NET SDK {CHANNEL}，下载约 200MB，请耐心等待...", flush=True)
    try:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        except Exception as e:
            print(f"安装失败: {type(e).__name__}: {e}")
            return 1
        if r.returncode != 0:
            print((r.stderr or r.stdout)[-2000:])
            return r.returncode
        if not verify():
            return 3
        print(f"[DONE] .NET SDK 安装成功: {DOTNET_DIR}")
        return 0
    finally:
        if install_script and os.path.exists(install_script):
            os.remove(install_script)


if __name__ == "__main__":
    sys.exit(main())
