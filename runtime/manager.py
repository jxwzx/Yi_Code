# YiCode 多语言运行时管理器
import os
import sys
import subprocess
import tempfile
import shutil
import uuid
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple


class MultiLangRuntime:
    """支持 Python / JavaScript / C++ / Java / Go / C# 的多语言运行管理器"""

    # Windows 上 MSI / 安装包可能写了系统 PATH 但当前 shell 进程未刷新，
    # 或者用户解压到项目本地目录，这里显式列出常见候选路径做硬查找。
    _EXTRA_BIN_PATHS: Dict[str, List[str]] = {
        "node": [
            r"D:\node\node.exe",
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ],
        "g++": [
            r"C:\mingw64\bin\g++.exe",
            r"D:\mingw64\bin\g++.exe",
            r"E:\mingw64\bin\g++.exe",
            r"C:\Program Files\mingw64\bin\g++.exe",
            r"C:\Program Files (x86)\mingw64\bin\g++.exe",
            r"C:\Program Files\LLVM\bin\clang++.exe",
            # winget 安装的 BrechtSanders WinLibs (动态构造，兼容不同用户)
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
                / "BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe"
                / "mingw64" / "bin" / "g++.exe"),
            # 项目本地解压目录 (配合 _tools/mingw64/bin)
            str(Path(__file__).resolve().parents[1] / "_tools" / "mingw64" / "bin" / "g++.exe"),
            str(Path(__file__).resolve().parents[1] / "_tools" / "llvm-mingw" / "bin" / "x86_64-w64-mingw32-g++.exe"),
        ],
        "javac": [
            r"C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\bin\javac.exe",
            r"C:\Program Files\Java\jdk-21\bin\javac.exe",
            r"C:\Program Files\Java\jdk-21.0.12\bin\javac.exe",
            # 项目本地安装的 JDK（install_jdk.py 下载到 _tools/jdk）
            str(Path(__file__).resolve().parents[1] / "_tools" / "jdk" / "bin" / "javac.exe"),
            # macOS / Linux 本地安装的 JDK
            str(Path(__file__).resolve().parents[1] / "_tools" / "jdk" / "bin" / "javac"),
        ],
        "java": [
            r"C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\bin\java.exe",
            r"C:\Program Files\Java\jdk-21\bin\java.exe",
            r"C:\Program Files\Java\jdk-21.0.12\bin\java.exe",
            # 项目本地安装的 JDK
            str(Path(__file__).resolve().parents[1] / "_tools" / "jdk" / "bin" / "java.exe"),
            # macOS / Linux 本地安装的 JDK
            str(Path(__file__).resolve().parents[1] / "_tools" / "jdk" / "bin" / "java"),
        ],
        "go": [
            r"C:\Program Files\Go\bin\go.exe",
            r"C:\Program Files (x86)\Go\bin\go.exe",
            r"C:\Go\bin\go.exe",
            # 项目本地安装的 Go（install_go.py 下载到 _tools/go）
            str(Path(__file__).resolve().parents[1] / "_tools" / "go" / "bin" / "go.exe"),
            # macOS 本地安装的 Go
            str(Path(__file__).resolve().parents[1] / "_tools" / "go" / "bin" / "go"),
        ],
        "dotnet": [
            r"C:\Program Files\dotnet\dotnet.exe",
            r"C:\Program Files (x86)\dotnet\dotnet.exe",
            # Windows 本地安装的 .NET SDK
            str(Path(__file__).resolve().parents[1] / "_tools" / "dotnet" / "dotnet.exe"),
            # macOS 本地安装的 .NET SDK
            str(Path(__file__).resolve().parents[1] / "_tools" / "dotnet" / "dotnet"),
        ],
        "docker": [
            r"C:\Program Files\Docker\Docker\resources\bin\docker.exe",
        ],
    }

    @classmethod
    def _resolve_bin(cls, name: str) -> Optional[str]:
        """优先项目本地工具，再查 PATH，最后查系统安装目录。"""
        paths = cls._EXTRA_BIN_PATHS.get(name, [])
        for p in paths:
            if "_tools" in str(p) and os.path.exists(p):
                return p
        path = shutil.which(name)
        if path:
            return path
        for p in paths:
            if os.path.exists(p):
                return p
        return None

    LANG_CONFIG: Dict[str, Dict[str, Any]] = {
        "py": {
            "name": "Python",
            "ext": ".py",
            "compiler": None,
            "run": ["python"],
            "run_args": ["{file}"],
        },
        "js": {
            "name": "JavaScript",
            "ext": ".js",
            "compiler": None,
            "run": ["node"],
            "run_args": ["{file}"],
        },
        "cpp": {
            "name": "C++",
            "ext": ".cpp",
            "compiler": ["g++", "{file}", "-std=c++17", "-O2", "-static", "-o", "{bin}"],
            "run": ["{bin}"],
            "run_args": [],
            "bin_ext": ".exe",
        },
        "java": {
            "name": "Java",
            "ext": ".java",
            "compiler": ["javac", "{file}"],
            "run": ["java", "-cp", "{dir}", "Main"],
            "run_args": [],
            "main_class": "Main",
        },
        "go": {
            "name": "Go",
            "ext": ".go",
            "compiler": ["go", "build", "-o", "{bin}", "{file}"],
            "run": ["{bin}"],
            "run_args": [],
            "bin_ext": ".exe",
        },
        "cs": {
            "name": "C#",
            "ext": ".cs",
            # 使用 dotnet script 或直接 csc，这里采用简化的 csc / 临时项目
            "compiler": None,  # 特殊处理
            "run": None,
            "run_args": [],
            "bin_ext": ".exe",
        },
    }

    _DOCKER_IMAGES: Dict[str, str] = {
        "py": "python:3.13",
        "js": "node:22",
        "cpp": "gcc:14",
        "java": "eclipse-temurin:21",
        "go": "golang:1.27",
        "cs": "mcr.microsoft.com/dotnet/sdk:8.0",
    }

    def __init__(self, sandbox_dir: Optional[str] = None):
        self.sandbox_root = Path(sandbox_dir or (tempfile.gettempdir() + "/yicode_sandbox"))
        self.sandbox_root.mkdir(parents=True, exist_ok=True)
        self._runtime_cache: Dict[str, Any] = {}

    def _sandbox_command(self, cmd: List[str]) -> List[str]:
        """macOS 上用 Seatbelt 限制用户代码访问网络和任意文件写入。"""
        if sys.platform != "darwin" or not shutil.which("sandbox-exec"):
            return cmd
        allowed_paths = sorted({
            os.path.realpath(str(self.sandbox_root)),
            os.path.realpath(tempfile.gettempdir()),
        })
        profile_parts = [
            "(version 1)",
            "(allow default)",
            "(deny network*)",
            "(deny file-write*)",
        ]
        profile_parts.extend(
            f'(allow file-write* (subpath "{p}"))' for p in allowed_paths
        )
        profile_parts.append('(allow file-write* (literal "/dev/null"))')
        return ["/usr/bin/sandbox-exec", "-p", " ".join(profile_parts)] + cmd

    # ================== 环境检测 ==================
    def detect_all_runtimes(self) -> Dict[str, Dict[str, Any]]:
        """检测所有语言运行环境是否可用"""
        results: Dict[str, Dict[str, Any]] = {}
        for lang_key, cfg in self.LANG_CONFIG.items():
            results[lang_key] = self._detect_one(lang_key, cfg)
        return results

    def _detect_one(self, lang_key: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
        info = {"name": cfg["name"], "available": False, "version": None, "path": None}
        try:
            if lang_key == "py":
                r = subprocess.run([sys.executable, "--version"], capture_output=True, text=True, timeout=8)
                info["available"] = r.returncode == 0
                info["version"] = (r.stdout or r.stderr).strip()
                info["path"] = sys.executable
            elif lang_key == "js":
                p = self._resolve_bin("node")
                if p:
                    r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=8)
                    info.update({"available": (r.returncode == 0), "version": r.stdout.strip(), "path": p})
                    if r.returncode == 0:
                        self._runtime_cache["node_bin"] = p
            elif lang_key == "cpp":
                # 优先 g++，其次 clang++/其它别名（_resolve_bin 内部已覆盖 mingw64/bin/g++.exe 等）
                gcc_name = None
                p = None
                for candidate in ["g++", "c++.exe", "mingw32-c++.exe", "clang++"]:
                    pp = self._resolve_bin(candidate)
                    if pp:
                        gcc_name = candidate
                        p = pp
                        break
                if p:
                    r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=8)
                    first_line = (r.stdout or r.stderr).splitlines()[0] if (r.stdout or r.stderr) else "GCC (unknown)"
                    info.update({"available": (r.returncode == 0), "version": first_line, "path": p})
                    self._runtime_cache["cpp_compiler"] = p  # 直接存绝对路径
            elif lang_key == "java":
                jv = self._resolve_bin("java")
                jc = self._resolve_bin("javac")
                if jv and jc:
                    r = subprocess.run([jv, "-version"], capture_output=True, text=True, timeout=8)
                    ver_line = (r.stderr or r.stdout).splitlines()[0] if (r.stderr or r.stdout) else ""
                    info.update({"available": (r.returncode == 0), "version": ver_line, "path": jv})
                    self._runtime_cache["java_bin"] = jv
                    self._runtime_cache["javac_bin"] = jc
            elif lang_key == "go":
                p = self._resolve_bin("go")
                if p:
                    r = subprocess.run([p, "version"], capture_output=True, text=True, timeout=8)
                    info.update({"available": (r.returncode == 0), "version": r.stdout.strip(), "path": p})
                    self._runtime_cache["go_bin"] = p
            elif lang_key == "cs":
                p = self._resolve_bin("dotnet")
                if p:
                    r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=20)
                    if r.returncode == 0:
                        info.update({"available": True, "version": ".NET SDK " + r.stdout.strip(), "path": p})
                        self._runtime_cache["dotnet_bin"] = p
        except Exception as e:
            info["error"] = str(e)
        return info

    # ================== 代码执行 ==================
    def run_code(self, language: str, code: str, timeout: int = 15,
                 stdin: Optional[str] = None) -> Dict[str, Any]:
        """统一执行入口"""
        lang = language.lower()
        if lang not in self.LANG_CONFIG:
            return {"success": False, "error": f"不支持的语言: {language}",
                    "supported": list(self.LANG_CONFIG.keys())}

        task_id = f"task_{uuid.uuid4().hex[:10]}"
        task_dir = self.sandbox_root / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        cfg = self.LANG_CONFIG[lang]
        src_file = task_dir / f"main{cfg['ext']}"

        # 对于 Java，文件名必须为 Main.java（如果代码包含 public class Main）
        if lang == "java" and "public class Main" in code:
            src_file = task_dir / "Main.java"

        try:
            src_file.write_text(code, encoding="utf-8")
        except Exception as e:
            return {"success": False, "error": f"写入源码失败: {e}"}

        start_time = time.time()
        try:
            if self._docker_enabled() and self._docker_bin():
                result = self._run_docker(lang, src_file, task_dir, timeout, stdin)
            elif lang == "cs":
                result = self._run_csharp_dotnet(src_file, task_dir, timeout, stdin)
            elif lang == "cpp":
                result = self._run_compiled(lang, src_file, task_dir, cfg, timeout, stdin)
            elif lang == "go":
                result = self._run_compiled(lang, src_file, task_dir, cfg, timeout, stdin)
            elif lang == "java":
                result = self._run_java(src_file, task_dir, timeout, stdin)
            elif lang == "py":
                result = self._run_interpreted([sys.executable, str(src_file)], task_dir, timeout, stdin)
            elif lang == "js":
                node_bin = self._runtime_cache.get("node_bin") or self._resolve_bin("node")
                if not node_bin:
                    return {"success": False, "error": "Node.js 未安装或未在 PATH 中"}
                self._runtime_cache["node_bin"] = node_bin
                result = self._run_interpreted([node_bin, str(src_file)], task_dir, timeout, stdin)
            else:
                result = {"success": False, "error": "未知语言执行器"}
        except subprocess.TimeoutExpired:
            result = {
                "success": False, "exit_code": -1,
                "stdout": "", "stderr": f"⏰ 执行超时 (超过 {timeout}s)，可能存在死循环或性能问题。",
                "timed_out": True,
            }
        except Exception as e:
            result = {"success": False, "error": f"运行时异常: {type(e).__name__}: {e}"}

        elapsed = round(time.time() - start_time, 3)
        result.update({
            "task_id": task_id,
            "language": cfg["name"],
            "elapsed_seconds": elapsed,
            "sandbox_dir": str(task_dir),
        })
        # 清理临时文件（保留 1 秒以供调试读取，实际可立即清理）
        try:
            shutil.rmtree(task_dir, ignore_errors=True)
        except:
            pass
        return result

    # ---------- 解释型语言 ----------
    def _run_interpreted(self, cmd: List[str], cwd: Path, timeout: int,
                         stdin: Optional[str]) -> Dict[str, Any]:
        cmd = self._sandbox_command(cmd)
        r = subprocess.run(cmd, cwd=str(cwd), capture_output=True,
                           text=True, timeout=timeout, input=stdin, encoding="utf-8",
                           errors="replace")
        return {
            "success": r.returncode == 0,
            "exit_code": r.returncode,
            "stdout": r.stdout,
            "stderr": r.stderr,
        }

    # ---------- 编译型语言 (C++ / Go) ----------
    def _run_compiled(self, lang: str, src_file: Path, task_dir: Path,
                      cfg: Dict[str, Any], timeout: int,
                      stdin: Optional[str]) -> Dict[str, Any]:
        bin_ext = ".exe" if os.name == "nt" else ""
        bin_file = task_dir / f"out{bin_ext}"
        comp_cmd = [c.format(file=str(src_file), bin=str(bin_file))
                     for c in cfg["compiler"]]
        if lang == "cpp":
            # macOS 的 Apple clang 不支持 -static，去掉静态链接参数
            if os.name != "nt":
                comp_cmd = [c for c in comp_cmd if c != "-static"]
            # 直接使用缓存的绝对路径 (detect 阶段存的)；兜底再 resolve 一次
            compiler = self._runtime_cache.get("cpp_compiler") or self._resolve_bin("g++")
            if not compiler:
                return {"success": False, "error": "C++ 编译器（MinGW-w64 g++）未安装"}
            # cfg["compiler"] 第一个元素是 "g++"，替换成实际绝对路径
            comp_cmd[0] = compiler
        elif lang == "go":
            go_bin = self._runtime_cache.get("go_bin") or self._resolve_bin("go")
            if not go_bin:
                return {"success": False, "error": "Go 未安装"}
            comp_cmd[0] = go_bin

        custom_env = {**os.environ}
        if lang == "go":
            go_cache = self.sandbox_root / "go_cache"
            go_tmp = self.sandbox_root / "go_tmp"
            go_cache.mkdir(parents=True, exist_ok=True)
            go_tmp.mkdir(parents=True, exist_ok=True)
            custom_env["GOCACHE"] = str(go_cache)
            custom_env["GOTMPDIR"] = str(go_tmp)

        comp = subprocess.run(self._sandbox_command(comp_cmd), cwd=str(task_dir), capture_output=True,
                              text=True, timeout=timeout * 2, env=custom_env)
        if comp.returncode != 0:
            return {
                "success": False,
                "exit_code": comp.returncode,
                "stdout": comp.stdout,
                "stderr": f"❌ 编译失败:\n{comp.stderr or comp.stdout}",
            }
        run_cmd = [c.format(bin=str(bin_file)) for c in cfg["run"]]
        r = subprocess.run(self._sandbox_command(run_cmd), cwd=str(task_dir), capture_output=True,
                           text=True, timeout=timeout, input=stdin, encoding="utf-8", env=custom_env,
                           errors="replace")
        return {
            "success": r.returncode == 0,
            "exit_code": r.returncode,
            "stdout": r.stdout,
            "stderr": r.stderr,
        }

    # ---------- Java 特殊处理 ----------
    def _run_java(self, src_file: Path, task_dir: Path, timeout: int,
                  stdin: Optional[str]) -> Dict[str, Any]:
        javac_bin = self._runtime_cache.get("javac_bin") or self._resolve_bin("javac")
        java_bin = self._runtime_cache.get("java_bin") or self._resolve_bin("java")
        if not (javac_bin and java_bin):
            return {"success": False, "error": "JDK 未安装或 javac/java 不在 PATH/已知安装目录"}
        comp = subprocess.run(self._sandbox_command([javac_bin, str(src_file)]), cwd=str(task_dir),
                              capture_output=True, text=True, timeout=timeout * 2)
        if comp.returncode != 0:
            return {
                "success": False, "exit_code": comp.returncode,
                "stdout": comp.stdout,
                "stderr": f"❌ 编译失败:\n{comp.stderr or comp.stdout}",
            }
        r = subprocess.run(self._sandbox_command([java_bin, "-cp", str(task_dir), "Main"]), cwd=str(task_dir),
                           capture_output=True, text=True, timeout=timeout,
                           input=stdin, encoding="utf-8", errors="replace")
        return {
            "success": r.returncode == 0,
            "exit_code": r.returncode,
            "stdout": r.stdout,
            "stderr": r.stderr,
        }

    # ---------- C# .NET 处理（使用临时控制台项目方式） ----------
    def _prepare_csharp_project(self, src_file: Path, task_dir: Path) -> Path:
        """生成 C# 控制台项目文件，供本机 dotnet 与 Docker 两种模式复用。"""
        proj_dir = task_dir / "CsProj"
        proj_dir.mkdir(exist_ok=True)
        csproj = """<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>ycapp</AssemblyName>
    <RootNamespace>YiCodeRun</RootNamespace>
  </PropertyGroup>
</Project>"""
        (proj_dir / "CsProj.csproj").write_text(csproj, encoding="utf-8")
        (proj_dir / "Program.cs").write_text(src_file.read_text(encoding="utf-8"), encoding="utf-8")
        return proj_dir

    def _run_csharp_dotnet(self, src_file: Path, task_dir: Path, timeout: int,
                           stdin: Optional[str]) -> Dict[str, Any]:
        dotnet_bin = self._runtime_cache.get("dotnet_bin") or self._resolve_bin("dotnet")
        if not dotnet_bin:
            return {"success": False, "error": ".NET SDK 未安装"}
        proj_dir = self._prepare_csharp_project(src_file, task_dir)
        # 为 dotnet run 配置独立的 NuGet 缓存路径，避免访问沙箱限制的 %APPDATA%\NuGet
        nuget_cache = self.sandbox_root / "nuget_cache"
        nuget_config_dir = self.sandbox_root / "nuget_config"
        nuget_cache.mkdir(parents=True, exist_ok=True)
        nuget_config_dir.mkdir(parents=True, exist_ok=True)
        custom_env = {
            **os.environ,
            "DOTNET_NOLOGO": "1",
            "DOTNET_CLI_TELEMETRY_OPTOUT": "1",
            "NUGET_PACKAGES": str(nuget_cache),
            "NUGET_HTTP_CACHE_PATH": str(nuget_cache / "http_cache"),
            "NUGET_PLUGINS_CACHE_PATH": str(nuget_cache / "plugins_cache"),
        }
        dotnet_home = self.sandbox_root / "dotnet_home"
        dotnet_home.mkdir(parents=True, exist_ok=True)
        custom_env["DOTNET_CLI_HOME"] = str(dotnet_home)
        # 让 NuGet 在用户 Roaming 目录不可用时，自己定位到一个可写位置
        if "APPDATA" in custom_env and "Sandbox" in " ".join(sys.argv):
            custom_env["APPDATA"] = str(nuget_config_dir)
        else:
            # 始终覆盖到本地可写，避免 AppData 被策略限制
            custom_env["APPDATA"] = str(nuget_config_dir)
        try:
            run = subprocess.run(
                self._sandbox_command(
                    [dotnet_bin, "run", "--project", str(proj_dir), "-c", "Release", "--nologo"]
                ),
                capture_output=True, text=True,
                timeout=timeout * 3,  # 首次 dotnet build 较慢
                input=stdin, encoding="utf-8", errors="replace",
                env=custom_env,
            )
            return {
                "success": run.returncode == 0,
                "exit_code": run.returncode,
                "stdout": run.stdout,
                "stderr": run.stderr,
            }
        except subprocess.TimeoutExpired:
            raise

    # ================== Docker 沙箱 ==================
    @classmethod
    def _docker_enabled(cls) -> bool:
        """YICODE_DOCKER_SANDBOX=1/true/yes/on 时启用 Docker 执行。"""
        value = os.getenv("YICODE_DOCKER_SANDBOX", "").strip().lower()
        return value in {"1", "true", "yes", "on"}

    @classmethod
    def _docker_bin(cls) -> Optional[str]:
        return cls._resolve_bin("docker")

    def _run_docker(self, lang: str, src_file: Path, task_dir: Path, timeout: int,
                    stdin: Optional[str]) -> Dict[str, Any]:
        docker_bin = self._docker_bin()
        if not docker_bin:
            return {
                "success": False,
                "error": (
                    "Docker 沙箱已启用（YICODE_DOCKER_SANDBOX=1），"
                    "但未找到 docker CLI。请先安装 Docker"
                    "（Windows 建议 Docker Desktop + WSL2）后重试。"
                ),
            }
        image = self._DOCKER_IMAGES.get(lang)
        if not image:
            return {"success": False, "error": f"Docker 模式暂不支持语言: {lang}"}

        if lang in {"py", "js"}:
            runner = "python" if lang == "py" else "node"
            return self._docker_execute(
                docker_bin, image, [runner, f"/workspace/{src_file.name}"],
                timeout, stdin, task_dir,
            )

        if lang in {"cpp", "go", "java"}:
            if lang == "cpp":
                build_cmd = ["g++", "/workspace/main.cpp", "-std=c++17", "-O2",
                             "-o", "/workspace/out"]
            elif lang == "go":
                build_cmd = ["go", "build", "-o", "/workspace/out", "/workspace/main.go"]
            else:
                build_cmd = ["javac", f"/workspace/{src_file.name}"]
            build = self._docker_execute(
                docker_bin, image, build_cmd, timeout * 2, None, task_dir,
            )
            if not build.get("success"):
                if build.get("timed_out"):
                    return build
                return {
                    "success": False,
                    "exit_code": build.get("exit_code"),
                    "stdout": build.get("stdout", ""),
                    "stderr": f"❌ 编译失败:\n{build.get('stderr') or build.get('stdout') or ''}",
                }
            if lang == "java":
                run_cmd = ["java", "-cp", "/workspace", "Main"]
            else:
                run_cmd = ["/workspace/out"]
            return self._docker_execute(
                docker_bin, image, run_cmd, timeout, stdin, task_dir,
            )

        if lang == "cs":
            self._prepare_csharp_project(src_file, task_dir)
            return self._docker_execute(
                docker_bin, image,
                ["dotnet", "run", "--project", "/workspace/CsProj", "-c", "Release", "--nologo"],
                timeout * 3, stdin, task_dir,
                extra_env={
                    "DOTNET_NOLOGO": "1",
                    "DOTNET_CLI_TELEMETRY_OPTOUT": "1",
                    "DOTNET_SKIP_FIRST_TIME_EXPERIENCE": "1",
                    "DOTNET_CLI_HOME": "/tmp/dotnet_home",
                    "NUGET_PACKAGES": "/tmp/nuget_cache",
                    "NUGET_HTTP_CACHE_PATH": "/tmp/nuget_http_cache",
                },
            )

        return {"success": False, "error": f"未知语言执行器: {lang}"}

    def _docker_execute(self, docker_bin: str, image: str, cmd: List[str],
                        timeout: int, stdin: Optional[str], task_dir: Path,
                        extra_env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """在一次性容器中执行命令，并负责超时后的容器清理。"""
        mount_source = str(task_dir).replace(os.sep, "/")
        cidfile = task_dir / "docker.cid"
        docker_args = [
            docker_bin, "run", "--rm",
            "--network", "none",
            "--security-opt", "no-new-privileges",
            "--workdir", "/workspace",
            "--mount", f"type=bind,source={mount_source},target=/workspace",
            "--cidfile", str(cidfile),
        ]
        for key, value in (extra_env or {}).items():
            docker_args += ["--env", f"{key}={value}"]
        docker_args += [image] + list(cmd)
        try:
            proc = subprocess.run(
                docker_args,
                capture_output=True, text=True, input=stdin,
                timeout=timeout, encoding="utf-8", errors="replace",
            )
        except subprocess.TimeoutExpired:
            self._docker_kill_by_cidfile(docker_bin, cidfile)
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": f"⏰ 执行超时 (超过 {timeout}s)，可能存在死循环或性能问题。",
                "timed_out": True,
            }
        return {
            "success": proc.returncode == 0,
            "exit_code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }

    @staticmethod
    def _docker_kill_by_cidfile(docker_bin: str, cidfile: Path) -> None:
        """宿主侧超时后尽力清理容器，避免 --rm 容器残留。"""
        try:
            if not cidfile.exists():
                return
            cid = cidfile.read_text(encoding="utf-8").strip()
            if not cid:
                return
            subprocess.run([docker_bin, "kill", cid], capture_output=True, timeout=10)
            subprocess.run([docker_bin, "wait", cid], capture_output=True, timeout=10)
        except Exception:
            pass


if __name__ == "__main__":
    rt = MultiLangRuntime()
    import json
    print("=== YiCode 多语言运行环境检测 ===")
    envs = rt.detect_all_runtimes()
    for k, info in envs.items():
        status = "✅" if info["available"] else "❌"
        print(f"\n{status} {info['name']:12s} | v: {(info.get('version') or '未安装')[:60]}")
        if info.get("path"):
            print(f"   路径: {info['path']}")
