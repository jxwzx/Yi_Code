#!/usr/bin/env python3
"""Cross-platform JDK 21 installer for Windows / macOS / Linux."""
import os
import platform
import shutil
import ssl
import subprocess
import sys
import tarfile
import traceback
import urllib.request
import zipfile

ssl._create_default_https_context = ssl._create_unverified_context

ROOT = os.path.dirname(os.path.abspath(__file__))
JDK_DIR = os.path.join(ROOT, "jdk")
DOWNLOAD_FILE = os.path.join(ROOT, "jdk-download.bin")


def _platform():
    machine = platform.machine().lower()
    arch = "aarch64" if machine in ("aarch64", "arm64") else "x64"
    if sys.platform.startswith("win"):
        return "windows", arch
    if sys.platform == "darwin":
        return "macos", arch
    return "linux", arch


def is_local_installed():
    exe = ".exe" if os.name == "nt" else ""
    return (
        os.path.exists(os.path.join(JDK_DIR, "bin", f"java{exe}"))
        and os.path.exists(os.path.join(JDK_DIR, "bin", f"javac{exe}"))
    )


def is_system_installed():
    return bool(shutil.which("java") and shutil.which("javac"))


def _download_hook(block_num, block_size, total_size):
    if total_size > 0 and block_num % 300 == 0:
        done = block_num * block_size
        print(f"   下载进度: {done // 1048576}MB / {total_size // 1048576}MB", flush=True)


def download():
    if os.path.exists(DOWNLOAD_FILE):
        os.remove(DOWNLOAD_FILE)
    os_name, arch = _platform()
    url = (
        "https://api.adoptium.net/v3/binary/latest/21/ga/"
        f"{os_name}/{arch}/jdk/hotspot/normal/eclipse"
    )
    print(f"[1/2] 下载 JDK 21 ({os_name}/{arch}): {url[:90]}...", flush=True)
    try:
        opener = urllib.request.build_opener()
        opener.addheaders = [("User-Agent", "Mozilla/5.0")]
        req = urllib.request.Request(url)
        with opener.open(req, timeout=600) as resp, open(DOWNLOAD_FILE, "wb") as out:
            shutil.copyfileobj(resp, out)
        size = os.path.getsize(DOWNLOAD_FILE)
        print(f"   下载大小: {size // 1048576}MB")
        return size > 50 * 1048576
    except Exception as e:
        print(f"   下载失败: {type(e).__name__}: {e}")
        return False


def extract():
    print("[2/2] 解压 JDK...", flush=True)
    if os.path.exists(JDK_DIR):
        shutil.rmtree(JDK_DIR, ignore_errors=True)
    os.makedirs(JDK_DIR, exist_ok=True)
    try:
        if zipfile.is_zipfile(DOWNLOAD_FILE):
            with zipfile.ZipFile(DOWNLOAD_FILE) as zf:
                zf.extractall(JDK_DIR)
        else:
            with tarfile.open(DOWNLOAD_FILE) as tf:
                tf.extractall(JDK_DIR)
    except Exception as e:
        print(f"解压失败: {e}")
        traceback.print_exc()
        return False

    for entry in os.listdir(JDK_DIR):
        inner = os.path.join(JDK_DIR, entry)
        if not os.path.isdir(inner):
            continue
        base = inner
        mac_home = os.path.join(inner, "Contents", "Home")
        if os.path.isdir(mac_home):
            base = mac_home
        if os.path.isdir(os.path.join(base, "bin")):
            for item in os.listdir(base):
                shutil.move(os.path.join(base, item), os.path.join(JDK_DIR, item))
            shutil.rmtree(inner, ignore_errors=True)
            break
    return True


def verify():
    exe = ".exe" if os.name == "nt" else ""
    java = os.path.join(JDK_DIR, "bin", f"java{exe}")
    javac = os.path.join(JDK_DIR, "bin", f"javac{exe}")
    if not (os.path.exists(java) and os.path.exists(javac)):
        print("[WARN] JDK 解压完成但未找到 bin/java")
        return False
    try:
        r = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=20)
        print((r.stderr or r.stdout).splitlines()[0])
    except Exception as e:
        print(f"验证失败: {e}")
        return False
    print(f"[DONE] JDK 21 安装成功: {JDK_DIR}")
    return True


def main():
    if is_system_installed():
        print(f"[SKIP] 系统已安装 JDK: {shutil.which('java')}")
        return 0
    if is_local_installed():
        print(f"[SKIP] 本地 JDK 已安装: {JDK_DIR}")
        return 0
    if not download():
        return 1
    if not extract():
        return 2
    if not verify():
        return 3
    if os.path.exists(DOWNLOAD_FILE):
        os.remove(DOWNLOAD_FILE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
