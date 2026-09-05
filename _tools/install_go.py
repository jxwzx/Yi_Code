#!/usr/bin/env python3
"""Cross-platform Go installer (Windows / macOS / Linux) -> project _tools/go."""
import os
import platform
import shutil
import ssl
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

ssl._create_default_https_context = ssl._create_unverified_context

ROOT = os.path.dirname(os.path.abspath(__file__))
GO_DIR = os.path.join(ROOT, "go")
DOWNLOAD = os.path.join(ROOT, "go-download")
GO_VERSION = "1.27.1"


def _file_parts():
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "amd64"
    if sys.platform.startswith("win"):
        return f"windows-{arch}.zip"
    os_name = "darwin" if sys.platform == "darwin" else "linux"
    return f"{os_name}-{arch}.tar.gz"


def is_installed():
    exe = ".exe" if os.name == "nt" else ""
    if shutil.which("go"):
        return True
    return os.path.exists(os.path.join(GO_DIR, "bin", f"go{exe}"))


def verify():
    exe = ".exe" if os.name == "nt" else ""
    go = os.path.join(GO_DIR, "bin", f"go{exe}")
    if not os.path.exists(go):
        return False
    r = subprocess.run([go, "version"], capture_output=True, text=True, timeout=20)
    print(r.stdout.strip())
    return r.returncode == 0


def main():
    if is_installed():
        print("[SKIP] Go 已安装")
        return 0
    if os.path.exists(GO_DIR):
        shutil.rmtree(GO_DIR, ignore_errors=True)

    fname = _file_parts()
    url = f"https://go.dev/dl/go{GO_VERSION}.{fname}"
    print(f"下载 Go {GO_VERSION}: {url}", flush=True)
    try:
        urllib.request.urlretrieve(url, DOWNLOAD)
    except Exception as e:
        print(f"下载失败: {type(e).__name__}: {e}")
        return 1

    try:
        if fname.endswith(".zip"):
            with zipfile.ZipFile(DOWNLOAD) as zf:
                zf.extractall(ROOT)
        else:
            with tarfile.open(DOWNLOAD) as tf:
                tf.extractall(ROOT)
    except Exception as e:
        print(f"解压失败: {e}")
        return 2
    finally:
        if os.path.exists(DOWNLOAD):
            os.remove(DOWNLOAD)

    if not verify():
        return 3
    print(f"[DONE] Go 安装成功: {GO_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
