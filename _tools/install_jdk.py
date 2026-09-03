# YiCode: 下载并解压 JDK 21 (Eclipse Temurin) 到项目本地 _tools/jdk
"""
从 Adoptium 官方 API 下载 JDK 21 (LTS)，解压到 _tools/jdk 目录。
无需管理员权限，不影响系统环境变量。
用法: python _tools/install_jdk.py
"""
import os
import sys
import ssl
import zipfile
import shutil
import traceback
import urllib.request

ssl._create_default_https_context = ssl._create_unverified_context

ROOT = os.path.dirname(os.path.abspath(__file__))
JDK_DIR = os.path.join(ROOT, "jdk")
ZIP_FILE = os.path.join(ROOT, "jdk.zip")

# Adoptium 官方 API: JDK 21 LTS, Windows x64, HotSpot
ADOPTIUM_API = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"

# 备用下载源（GitHub Releases）
BACKUP_URLS = [
    ADOPTIUM_API,
    # Adoptium GitHub 镜像
    "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip",
]

# 预期 javac 路径
EXPECTED_JAVAC = os.path.join(JDK_DIR, "bin", "javac.exe")
EXPECTED_JAVA = os.path.join(JDK_DIR, "bin", "java.exe")


def is_installed() -> bool:
    """检查 JDK 是否已安装"""
    return os.path.exists(EXPECTED_JAVAC) and os.path.exists(EXPECTED_JAVA)


def _download_hook(block_num, block_size, total_size):
    """下载进度回调"""
    downloaded = block_num * block_size
    if total_size > 0 and block_num % 500 == 0:
        pct = downloaded * 100 // total_size
        mb_done = downloaded // 1048576
        mb_total = total_size // 1048576
        print(f"   下载进度: {mb_done}MB / {mb_total}MB ({pct}%)", flush=True)


def download():
    """下载 JDK 压缩包"""
    if os.path.exists(ZIP_FILE):
        os.remove(ZIP_FILE)

    last_err = ""
    for i, url in enumerate(BACKUP_URLS):
        print(f"[{i+1}/{len(BACKUP_URLS)}] 尝试下载: {url[:80]}...", flush=True)
        try:
            urllib.request.urlretrieve(url, ZIP_FILE, reporthook=_download_hook)
            size = os.path.getsize(ZIP_FILE)
            print(f"   下载大小: {size // 1048576}MB")
            if size > 50 * 1048576:  # JDK 通常 > 50MB
                print("[OK] 下载成功")
                return True
            else:
                print("   文件太小，可能是错误页面，尝试下一个源")
                os.remove(ZIP_FILE)
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            print(f"   下载失败: {last_err[:150]}")
            if os.path.exists(ZIP_FILE):
                try:
                    os.remove(ZIP_FILE)
                except:
                    pass

    print(f"[失败] 所有下载源均不可用，最后错误: {last_err}")
    return False


def extract():
    """解压 JDK 压缩包"""
    print("正在解压 JDK...", flush=True)

    # 清理旧的解压目录
    if os.path.exists(JDK_DIR):
        shutil.rmtree(JDK_DIR, ignore_errors=True)
    os.makedirs(JDK_DIR, exist_ok=True)

    try:
        with zipfile.ZipFile(ZIP_FILE, "r") as zf:
            zf.extractall(JDK_DIR)
    except Exception as e:
        print(f"解压失败: {e}")
        traceback.print_exc()
        return False

    # Adoptium 的 zip 包结构: jdk-21.0.5+11/bin/javac.exe
    # 需要把内层目录提升到 JDK_DIR 根
    for entry in os.listdir(JDK_DIR):
        inner = os.path.join(JDK_DIR, entry)
        if os.path.isdir(inner) and entry.startswith("jdk"):
            # 把内层目录内容移动到 JDK_DIR
            for item in os.listdir(inner):
                src = os.path.join(inner, item)
                dst = os.path.join(JDK_DIR, item)
                shutil.move(src, dst)
            os.rmdir(inner)
            print(f"   目录结构已调整: {entry} -> {JDK_DIR}")
            break

    print("[OK] 解压完成")
    return True


def verify():
    """验证 JDK 安装"""
    print("验证 JDK 安装...", flush=True)

    javac_found = False
    java_found = False

    # 检查预期路径
    if os.path.exists(EXPECTED_JAVAC):
        javac_found = True
        print(f"   [OK] javac.exe: {EXPECTED_JAVAC}")

    if os.path.exists(EXPECTED_JAVA):
        java_found = True
        print(f"   [OK] java.exe: {EXPECTED_JAVA}")

    # 如果预期路径没找到，搜索整个目录
    if not javac_found or not java_found:
        print("   预期路径未找到，搜索整个目录...")
        for root, dirs, files in os.walk(JDK_DIR):
            if "javac.exe" in files:
                print(f"   [FOUND] javac.exe: {os.path.join(root, 'javac.exe')}")
                javac_found = True
            if "java.exe" in files:
                print(f"   [FOUND] java.exe: {os.path.join(root, 'java.exe')}")
                java_found = True

    if javac_found and java_found:
        print("[DONE] JDK 21 安装成功!")
        return True
    else:
        print("[WARN] JDK 解压完成但未找到 javac.exe / java.exe")
        return False


def cleanup():
    """清理临时压缩包"""
    if os.path.exists(ZIP_FILE):
        os.remove(ZIP_FILE)
        print("已清理临时压缩包")


def main():
    print("=" * 50)
    print("YiCode JDK 21 自动安装工具")
    print("=" * 50)

    # 1. 检查是否已安装
    if is_installed():
        print(f"[SKIP] JDK 已安装: {EXPECTED_JAVAC}")
        sys.exit(0)

    # 2. 下载
    if not download():
        sys.exit(1)

    # 3. 解压
    if not extract():
        sys.exit(2)

    # 4. 验证
    if not verify():
        sys.exit(3)

    # 5. 清理
    cleanup()

    print()
    print("安装路径:", JDK_DIR)
    print("YiCode 后端会自动检测此路径，无需手动配置环境变量。")


if __name__ == "__main__":
    main()
