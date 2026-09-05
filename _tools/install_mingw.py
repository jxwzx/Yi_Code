# YiCode: 下载并解压 MinGW-w64 GCC (项目本地 _tools/mingw64)
import os, sys, ssl, time, traceback
import urllib.request
ssl._create_default_https_context = ssl._create_unverified_context

# Windows 使用 MinGW-w64；macOS/Linux 使用系统自带 clang/g++
if os.name != "nt":
    import shutil
    import subprocess

    found = shutil.which("g++") or shutil.which("clang++")
    if found:
        r = subprocess.run([found, "--version"], capture_output=True, text=True, timeout=10)
        first = (r.stdout or r.stderr).splitlines()[0] if (r.stdout or r.stderr) else "C++ compiler"
        print(f"[SKIP] 系统已提供 C++ 编译器: {first}\n路径: {found}")
        sys.exit(0)

    if sys.platform == "darwin":
        print("未检测到 g++/clang++，正在打开 Xcode Command Line Tools 安装窗口...")
        subprocess.run(["/usr/bin/xcode-select", "--install"], check=False)
        sys.exit(0)

    print("请先安装系统 C++ 编译器 (g++ / clang++)")
    sys.exit(1)

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_7Z = os.path.join(ROOT, "mingw.7z")
EXTRACT_TO = ROOT
TARGET = os.path.join(ROOT, "mingw64", "bin", "g++.exe")

if os.path.exists(TARGET):
    print(f"[SKIP] g++ 已存在: {TARGET}")
    sys.exit(0)

base_url = "https://github.com/niXman/mingw-builds-binaries/releases/download/14.2.0-rt_v12-rev0/x86_64-14.2.0-release-posix-seh-msvcrt-rt_v12-rev0.7z"
urls = [
    base_url,
    "https://ghfast.top/" + base_url,
    "https://gh.api.99988866.xyz/" + base_url,
    "https://mirror.ghproxy.com/" + base_url,
]

def _hook(blk, bs, total):
    done = blk * bs
    if total > 0 and blk % 800 == 0:
        pct = done * 100 // total
        print(f"   progress {done//1048576}MB / {total//1048576}MB ({pct}%)", flush=True)

ok = False
last_err = ""
for i, u in enumerate(urls):
    print(f"[{i+1}/{len(urls)}] try: {u[:80]}...", flush=True)
    try:
        if os.path.exists(OUT_7Z):
            os.remove(OUT_7Z)
        urllib.request.urlretrieve(u, OUT_7Z, reporthook=_hook if i == 0 else None)
        size = os.path.getsize(OUT_7Z)
        print(f"   size = {size} bytes ({size//1048576}MB)")
        if size > 10 * 1048576:
            ok = True
            print("[OK] download success")
            break
        else:
            print("   too small, probably error page, delete and retry next mirror")
            os.remove(OUT_7Z)
    except Exception as e:
        last_err = f"{type(e).__name__}: {e}"
        print(f"   FAIL: {last_err[:150]}")
        if os.path.exists(OUT_7Z):
            try: os.remove(OUT_7Z)
            except: pass

if not ok:
    print(f"[ALL FAILED] last error: {last_err}")
    sys.exit(1)

print("Extracting 7z...")
import py7zr
try:
    with py7zr.SevenZipFile(OUT_7Z, mode="r") as z:
        z.extractall(path=EXTRACT_TO)
except Exception as e:
    print(f"Extract FAILED: {e}")
    traceback.print_exc()
    sys.exit(2)

print("Scanning for g++.exe...")
found = False
for root, dirs, files in os.walk(EXTRACT_TO):
    if "g++.exe" in files and root.endswith(os.sep + "bin"):
        print(f"[FOUND] g++.exe: {root}")
        found = True
        break
if not found:
    print("[WARN] extraction completed but g++.exe not found in expected bin/")
    for root, dirs, files in os.walk(EXTRACT_TO):
        for f in files:
            if f == "g++.exe":
                print(f"   - {os.path.join(root, f)}")
                break
    sys.exit(3)

print("[DONE] MinGW-w64 GCC installed.")
