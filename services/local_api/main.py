# YiCode 本地 API 服务 - 完整版本
"""
提供代码执行、AI 助教、运行环境检测、任务管理等 REST API。
启动命令:
    python -m services.local_api.main
或者:
    uvicorn services.local_api.main:app --host 0.0.0.0 --port 8000 --reload
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Set
from datetime import datetime
from pathlib import Path
import asyncio
import json
import uuid
import sys
import os
import shutil
import subprocess
import random
import socket

# ---------- 确保项目根目录在 sys.path 中 ----------
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.manager import MultiLangRuntime
from ai.provider import AIProvider, LocalAIProvider, get_provider
from services.local_api.database import init_db, query_all, query_one, execute as db_execute, _hash_password, generate_target_id, verify_admin_permission


# ============ FastAPI 应用 ============
app = FastAPI(
    title="YiCode Local API",
    description="易码编程学习平台 - 本地后端服务",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket 允许跨域
@app.middleware("http")
async def add_websocket_headers(request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# ============ 全局对象 ============
runtime = MultiLangRuntime()
local_ai: AIProvider = LocalAIProvider()
ai_provider_name = os.getenv("YICODE_AI_PROVIDER", "mimo")

try:
    ai = get_provider(ai_provider_name)
    print(f"[YiCode] AI Provider: {ai_provider_name} (model: {getattr(ai, 'model', 'N/A')})")
except Exception as e:
    print(f"[YiCode] AI Provider 加载失败，回退到本地: {e}")
    ai = local_ai

# 内存任务存储（实际项目可改用 SQLite）
tasks_db: Dict[str, Dict[str, Any]] = {}
ai_chat_history: List[Dict[str, Any]] = []

# 初始化 SQLite 数据库
init_db()

# ============ 局域网协作房间管理 ============
# 房间数据: { "123456": {"code": "123456", "host": "用户名", "lang": "py", "created_at": "...", "members": {...}} }
collab_rooms: Dict[str, Dict[str, Any]] = {}
# 每个房间的 WebSocket 连接: { "123456": {websocket_obj: "用户名", ...} }
collab_connections: Dict[str, Dict[WebSocket, str]] = {}


def _gen_room_code() -> str:
    """生成 6 位数字房间码（不与已有房间重复）"""
    for _ in range(100):
        code = str(random.randint(100000, 999999))
        if code not in collab_rooms:
            return code
    return str(random.randint(100000, 999999))


def _get_lan_ip() -> str:
    """获取本机局域网 IP 地址（用于分享给同局域网的其他人）"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ============ 数据模型 ============
class RunCodeRequest(BaseModel):
    language: str = Field(..., description="编程语言简写: py/js/cpp/java/go/cs")
    code: str = Field(..., description="源代码内容")
    stdin: Optional[str] = Field(None, description="标准输入内容")
    timeout: Optional[int] = Field(15, description="超时时间(秒)")


class AIChatRequest(BaseModel):
    message: str = Field(..., description="用户提问内容")
    code: Optional[str] = Field(None, description="上下文代码")
    language: Optional[str] = Field(None, description="代码语言")
    session_id: Optional[str] = Field(None, description="会话ID")
    api_key: Optional[str] = Field(None, description="用户 API Key")
    error_msg: Optional[str] = Field(None, description="错误信息")
    mode: Optional[str] = Field("normal", description="对话模式: normal/deep/socratic")


class DiagnoseRequest(BaseModel):
    code: str
    language: str
    error_msg: Optional[str] = None


# ============ 健康检查 ============
@app.get("/")
async def root():
    return {
        "name": "YiCode Local API",
        "status": "running",
        "version": "1.0.0",
        "time": datetime.now().isoformat(),
        "features": [
            "code_runner (6 languages)",
            "ai_assistant (local / openai)",
            "runtime_environment_detection",
            "task_tracking",
        ]
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "time": datetime.now().isoformat()}


# ============ 运行环境检测 ============
@app.get("/runtimes")
async def list_runtimes():
    """检测并列出所有支持语言的运行环境状态"""
    results = runtime.detect_all_runtimes()
    summary = {
        "total": len(results),
        "available": sum(1 for v in results.values() if v["available"]),
        "missing": [v["name"] for v in results.values() if not v["available"]],
    }
    return {"summary": summary, "runtimes": results}


@app.get("/runtimes/{language}")
async def get_runtime(language: str):
    results = runtime.detect_all_runtimes()
    if language not in results:
        raise HTTPException(404, f"未知语言: {language}")
    return results[language]


# ============ 代码执行 ============
@app.post("/run")
async def run_code_endpoint(req: RunCodeRequest, background: BackgroundTasks):
    """同步执行代码（简易接口，直接返回结果）"""
    task_id = f"task_{uuid.uuid4().hex[:10]}"
    try:
        result = runtime.run_code(req.language, req.code, req.timeout or 15, req.stdin)
    except Exception as e:
        result = {
            "success": False,
            "error": f"服务端执行异常: {type(e).__name__}: {e}",
        }
    result["task_id"] = task_id
    # 持久化到任务列表
    tasks_db[task_id] = {
        "task_id": task_id,
        "language": req.language,
        "code_preview": req.code[:200],
        "status": "done",
        "created_at": datetime.now().isoformat(),
        **result,
    }
    # 限制最多 100 条历史
    if len(tasks_db) > 100:
        oldest = next(iter(tasks_db))
        del tasks_db[oldest]
    return result


@app.get("/tasks")
async def list_tasks(limit: int = 20):
    items = sorted(tasks_db.values(), key=lambda t: t.get("created_at", ""), reverse=True)[:limit]
    return {"count": len(items), "tasks": items}


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(404, f"任务不存在: {task_id}")
    return tasks_db[task_id]


# ============ 快速自测：一键检测并验证全部语言 ============
@app.post("/self-test")
async def self_test():
    samples = {
        "py": "print('Hello from Python!')",
        "js": "console.log('Hello from JavaScript!');",
        "cpp": "#include <iostream>\nint main(){std::cout<<\"Hello from C++!\"<<std::endl;return 0;}",
        "java": "public class Main{public static void main(String[] args){System.out.println(\"Hello from Java!\");}}",
        "go": "package main\nimport \"fmt\"\nfunc main(){fmt.Println(\"Hello from Go!\")}",
        "cs": "using System;\nclass Program{static void Main(){Console.WriteLine(\"Hello from C#!\");}}",
    }
    envs = runtime.detect_all_runtimes()
    results: Dict[str, Any] = {}
    for lang, code in samples.items():
        if not envs.get(lang, {}).get("available"):
            results[lang] = {"skipped": True, "reason": f"{envs[lang]['name']} 未安装"}
            continue
        try:
            r = runtime.run_code(lang, code, timeout=30)
            results[lang] = {
                "ok": r.get("success"),
                "exit_code": r.get("exit_code"),
                "stdout": (r.get("stdout") or "")[:120],
                "stderr": (r.get("stderr") or "")[:120],
                "elapsed": r.get("elapsed_seconds"),
            }
        except Exception as e:
            results[lang] = {"error": str(e)}
    return {"time": datetime.now().isoformat(), "per_language": results}


# ============ 环境自动安装 ============
import threading

# 安装任务状态跟踪
_install_tasks: Dict[str, Dict[str, Any]] = {}

# 各环境的安装脚本配置
INSTALL_CONFIG = {
    "java": {
        "name": "JDK 21 (Eclipse Temurin)",
        "script": "_tools/install_jdk.py",
        "size_mb": "~190MB",
        "description": "Java 开发环境，包含 javac 编译器和 java 运行时",
    },
    "cpp": {
        "name": "MinGW-w64 GCC (C++编译器)",
        "script": "_tools/install_mingw.py",
        "size_mb": "~50MB",
        "description": "C++ 编译环境，需要 7z 解压支持 (pip install py7zr)",
    },
}

@app.post("/install/{env}")
async def install_env(env: str, background_tasks: BackgroundTasks):
    """触发环境自动安装（后台执行）"""
    env = env.lower()
    if env not in INSTALL_CONFIG:
        raise HTTPException(404, f"不支持的环境: {env}，支持: {list(INSTALL_CONFIG.keys())}")

    config = INSTALL_CONFIG[env]
    script_path = str(ROOT / config["script"])

    # 检查脚本是否存在
    if not os.path.exists(script_path):
        raise HTTPException(404, f"安装脚本不存在: {config['script']}")

    # 创建任务
    task_id = f"install_{env}_{uuid.uuid4().hex[:8]}"
    _install_tasks[task_id] = {
        "env": env,
        "name": config["name"],
        "status": "running",
        "progress": "开始下载...",
        "started_at": datetime.now().isoformat(),
    }

    def run_install():
        """后台执行安装"""
        try:
            _install_tasks[task_id]["progress"] = "正在下载，请耐心等待..."
            result = subprocess.run(
                [sys.executable, script_path],
                capture_output=True,
                text=True,
                timeout=600,  # 10 分钟超时
                cwd=str(ROOT),
            )
            if result.returncode == 0:
                _install_tasks[task_id]["status"] = "success"
                _install_tasks[task_id]["progress"] = "安装成功"
            else:
                _install_tasks[task_id]["status"] = "failed"
                _install_tasks[task_id]["progress"] = f"安装失败 (exit {result.returncode})"
            _install_tasks[task_id]["stdout"] = result.stdout[-2000:] if result.stdout else ""
            _install_tasks[task_id]["stderr"] = result.stderr[-2000:] if result.stderr else ""
        except subprocess.TimeoutExpired:
            _install_tasks[task_id]["status"] = "timeout"
            _install_tasks[task_id]["progress"] = "安装超时（超过10分钟）"
        except Exception as e:
            _install_tasks[task_id]["status"] = "error"
            _install_tasks[task_id]["progress"] = f"安装出错: {str(e)}"
        _install_tasks[task_id]["finished_at"] = datetime.now().isoformat()

    background_tasks.add_task(run_install)

    return {
        "task_id": task_id,
        "env": env,
        "name": config["name"],
        "message": f"开始安装 {config['name']}，预计需要 {config['size_mb']} 下载量",
    }


@app.get("/install/status/{task_id}")
async def install_status(task_id: str):
    """查询安装任务状态"""
    if task_id not in _install_tasks:
        raise HTTPException(404, "安装任务不存在")
    return _install_tasks[task_id]


@app.get("/install/available")
async def install_available():
    """列出可自动安装的环境"""
    result = []
    envs = runtime.detect_all_runtimes()
    for env_key, config in INSTALL_CONFIG.items():
        # 映射 env_key 到 runtime 的语言 key
        lang_key = env_key if env_key != "cpp" else "cpp"
        installed = envs.get(lang_key, {}).get("available", False)
        result.append({
            "env": env_key,
            "name": config["name"],
            "description": config["description"],
            "size": config["size_mb"],
            "installed": installed,
            "version": envs.get(lang_key, {}).get("version", "") if installed else "",
        })
    return {"available": result}


# ============ AI 助教接口 ============
def _get_mode_system_prompt(mode: str, lang: str = "py") -> str:
    """根据模式返回系统提示词"""
    if mode == "deep":
        return """你是 YiCode 深度思考模式的 AI 编程助教。你的特点是：
1. 深入分析问题本质，不只给表面答案
2. 解释底层原理和实现机制
3. 提供多种解决方案并对比优劣
4. 给出实际应用场景和最佳实践
5. 使用中文回答，逻辑清晰，层次分明"""
    elif mode == "socratic":
        return """你是 YiCode 苏格拉底引导模式的 AI 编程助教。你的教学方法是：
1. 不要直接给出答案，而是通过提问引导学生思考
2. 用问题启发学生自己发现问题和解决方案
3. 循序渐进，从简单问题开始，逐步深入
4. 鼓励学生尝试和犯错，从错误中学习
5. 用中文回答，语气亲切、鼓励性强
6. 每次回复都以引导性问题结尾，激发学生继续思考"""
    else:  # normal
        return "你是 YiCode 编程助教，专注于帮助初学者和大学生学习编程。请直接给出代码，用中文注释解释。简洁明了。"


@app.post("/ai/chat")
async def ai_chat(req: AIChatRequest):
    """AI 对话接口 - 支持问题检测、知识点讲解"""
    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:8]}"
    mode = req.mode or "normal"

    # 如果用户提供了 API Key，使用用户提供的；否则使用全局的
    active_ai = ai
    if req.api_key:
        try:
            from ai.provider import MiMoProvider
            active_ai = MiMoProvider(api_key=req.api_key)
        except Exception:
            pass  # 回退到全局 ai

    # 智能路由：如果是代码检查请求，增强处理
    user_msg = req.message
    code = req.code or ""
    lang = (req.language or "py").lower()

    lower = user_msg.lower()
    # 直接调用 AI Provider
    try:
        if ("检查" in user_msg or "错误" in user_msg or "bug" in user_msg or "问题" in user_msg) and code:
            # 代码诊断
            if req.error_msg:
                reply = active_ai.diagnose_error(req.error_msg, code)
            else:
                reply = _enhanced_code_review(code, lang, active_ai)
        elif ("解释" in user_msg or "讲解" in user_msg or "说明" in user_msg) and code:
            reply = active_ai.explain_code(code)
        else:
            # 通用代码生成 / 知识问答 - 使用模式特定的系统提示词
            system_prompt = _get_mode_system_prompt(mode, lang)
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg}
            ]
            if code:
                messages[1]["content"] += f"\n\n【上下文代码 ({lang})】\n```\n{code}\n```"
            reply = active_ai.chat(messages, max_tokens=512 if mode != "deep" else 1024)
    except Exception as e:
        reply = f"[AI 服务暂时不可用，使用本地知识库回复] 抱歉遇到小问题: {e}. 你可以试试点击快捷操作按钮。"

    entry = {
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "user": user_msg,
        "reply": reply,
        "code_lang": lang,
    }
    ai_chat_history.append(entry)
    if len(ai_chat_history) > 500:
        ai_chat_history.clear()

    return {"session_id": session_id, "reply": reply}


def _enhanced_code_review(code: str, lang: str, provider: AIProvider) -> str:
    """增强版代码评审：provider诊断 + 本地规则库"""
    # 使用 chat 接口做代码审查，而不是 diagnose_error
    if isinstance(provider, LocalAIProvider):
        provider_resp = provider.chat([
            {"role": "system", "content": "你是代码审查专家。请检查代码中的错误、警告和改进建议。"},
            {"role": "user", "content": f"请审查以下 {lang} 代码：\n```\n{code}\n```"},
        ])
    else:
        provider_resp = provider.chat([
            {"role": "system", "content": "你是代码审查专家。请用中文分析代码中的问题，包括：1.语法错误 2.逻辑漏洞 3.性能问题 4.改进建议。简洁明了。"},
            {"role": "user", "content": f"审查代码：\n```{lang}\n{code}\n```"},
        ], max_tokens=512)
    # 追加本地更详细的提示
    base = f"📝 **代码评审报告 ({lang.upper()})**\n\n"
    base += f"✅ **代码长度**: {len(code.splitlines())} 行, {len(code)} 字符\n\n"

    # 简易静态检查启发式
    tips: List[str] = []
    if lang == "py":
        if any(l.strip().startswith("print ") for l in code.splitlines()):
            tips.append("🔴 检测到 Python2 风格 print 语句 (无括号)，Python3 会报 SyntaxError")
        if "\t" in code and any(l.startswith("    ") for l in code.splitlines()):
            tips.append("🔴 缩进混用 Tab/空格，Python 会报 IndentationError")
        if not any("def " in l for l in code.splitlines() if not l.strip().startswith("#")):
            tips.append("💡 当前代码没有函数，建议封装函数以提升复用性和可读性")

    if lang in ("js", "ts"):
        if code.count("==") > code.count("==="):
            tips.append("🟡 建议使用 === 替代 ==，避免隐式类型转换带来的逻辑陷阱")
        if "var " in code:
            tips.append("💡 建议使用 let/const 替代 var，以获得更好的作用域控制")

    if lang == "cpp":
        if "new " in code and "delete " not in code:
            tips.append("🟡 检测到 new 但未检测到对应 delete，存在内存泄漏风险")
        if "using namespace std;" in code:
            tips.append("💡 生产环境中建议避免 using namespace std;，防止命名冲突")

    if lang == "java":
        if "public class Main" not in code and "public static void main" in code:
            tips.append("🔴 Java 入口文件必须包含 public class Main，否则无法编译")

    if not tips:
        tips.append("✅ 未检测到明显的语法/风格问题，写得不错！")
        tips.append("💡 下一步可关注：单元测试覆盖率、性能基准测试、边界输入鲁棒性")

    base += "**✨ AI 综合评审要点：**\n" + "\n".join(f"  • {t}" for t in tips)
    base += "\n\n**🔧 Provider 原始诊断：**\n" + provider_resp
    return base


@app.post("/ai/explain")
async def ai_explain(req: DiagnoseRequest):
    """解释代码"""
    try:
        reply = ai.explain_code(req.code)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"reply": reply}


@app.post("/ai/diagnose")
async def ai_diagnose(req: DiagnoseRequest):
    """诊断错误"""
    try:
        reply = ai.diagnose_error(req.error_msg or "诊断代码问题", req.code)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"reply": reply}


@app.get("/ai/history")
async def ai_history(limit: int = 30):
    return {"count": min(limit, len(ai_chat_history)), "items": list(reversed(ai_chat_history[-limit:]))}


# ============ 代码流程图 ============
from ai.flowchart import generate_flowchart as _gen_flowchart

class FlowchartRequest(BaseModel):
    code: str
    language: str = "auto"

@app.post("/ai/flowchart")
async def ai_flowchart(req: FlowchartRequest):
    """分析代码结构，生成 Mermaid 流程图"""
    try:
        result = _gen_flowchart(req.code, req.language)
        return {
            "mermaid": result["mermaid"],
            "stats": result["stats"],
            "success": True,
        }
    except Exception as e:
        return {"mermaid": "", "success": False, "error": str(e)}


# ============ 用户认证 ============
class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    avatar: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/auth/register")
def register(req: RegisterRequest):
    existing = query_one("SELECT id FROM users WHERE username = ?", (req.username,))
    if existing:
        raise HTTPException(400, "用户名已存在")
    
    # 自动生成 target_id
    target_id = generate_target_id("student")
    
    uid = db_execute(
        "INSERT INTO users (username, password_hash, email, avatar, target_id) VALUES (?,?,?,?,?)",
        (req.username, _hash_password(req.password), req.email, req.avatar or req.username[0], target_id),
    )
    return {"user_id": uid, "username": req.username, "target_id": target_id, "message": "注册成功"}

@app.post("/auth/login")
def login(req: LoginRequest):
    user = query_one("SELECT * FROM users WHERE username = ?", (req.username,))
    if not user or user["password_hash"] != _hash_password(req.password):
        raise HTTPException(401, "用户名或密码错误")
    return {"user_id": user["id"], "username": user["username"], "avatar": user["avatar"],
            "level": user["level"], "xp": user["xp"], "streak_days": user["streak_days"],
            "role": user.get("role", "student"), "target_id": user.get("target_id")}

@app.get("/users/{user_id}")
def get_user(user_id: int):
    user = query_one("SELECT id, username, avatar, level, xp, streak_days, email, role, target_id, created_at FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(404, "用户不存在")
    return user


# ============ 管理员管理接口 ============
ROLE_LABELS = {"super_admin": "超级管理员", "admin": "管理员", "student": "学生"}

@app.get("/admin/users")
def admin_list_users(operator_id: int = None):
    """列出所有用户（含角色信息）- 需要管理员权限"""
    # 验证操作者权限
    if operator_id:
        operator = verify_admin_permission(operator_id)
        if not operator:
            raise HTTPException(403, "需要管理员权限")
    
    users = query_all("SELECT id, username, avatar, level, xp, streak_days, role, target_id, created_at FROM users ORDER BY id")
    for u in users:
        u["role_label"] = ROLE_LABELS.get(u["role"], "学生")
    return {"count": len(users), "users": users}


@app.post("/admin/users/{user_id}/role")
def admin_set_role(user_id: int, role: str = "student"):
    """设置用户角色（仅超管可操作）"""
    if role not in ("student", "admin", "super_admin"):
        raise HTTPException(400, f"无效角色: {role}，可选: student/admin/super_admin")

    user = query_one("SELECT id, role, target_id FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(404, "用户不存在")

    # 不能取消最后一个超管
    if user["role"] == "super_admin" and role != "super_admin":
        super_count = query_one("SELECT COUNT(*) as c FROM users WHERE role='super_admin'")["c"]
        if super_count <= 1:
            raise HTTPException(400, "不能取消最后一个超级管理员")

    target_id = user["target_id"]
    if role == "admin":
        # 分配新的 target_id（001, 002, ...）
        if not target_id or target_id == "000":
            max_tid = query_one("SELECT target_id FROM users WHERE role='admin' AND target_id IS NOT NULL ORDER BY target_id DESC LIMIT 1")
            if max_tid and max_tid["target_id"]:
                next_num = int(max_tid["target_id"]) + 1
            else:
                next_num = 1
            target_id = f"{next_num:03d}"
    elif role == "super_admin":
        target_id = "000"
    else:
        target_id = None

    db_execute("UPDATE users SET role=?, target_id=? WHERE id=?", (role, target_id, user_id))
    return {"user_id": user_id, "role": role, "target_id": target_id,
            "role_label": ROLE_LABELS.get(role, "学生"), "message": f"已设置为{ROLE_LABELS.get(role, '学生')}"}


@app.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, operator_id: int = None):
    """删除用户（超管不可删除自己，不可删除其他超管）- 需要管理员权限"""
    # 验证操作者权限
    if operator_id:
        operator = verify_admin_permission(operator_id)
        if not operator:
            raise HTTPException(403, "需要管理员权限")
    
    user = query_one("SELECT id, role FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(404, "用户不存在")
    if user["role"] == "super_admin":
        raise HTTPException(400, "不能删除超级管理员")
    db_execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"message": f"用户已删除", "user_id": user_id}


# ============ 仪表盘数据 ============
@app.get("/users/{user_id}/dashboard")
def get_dashboard(user_id: int):
    user = query_one("SELECT id, username, avatar, level, xp, streak_days FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(404, "用户不存在")
    leaderboard_rows = query_all(
        "SELECT u.id, u.username, u.avatar, u.level, u.xp, u.streak_days, l.rank_num FROM users u JOIN leaderboard l ON u.id = l.user_id ORDER BY l.rank_num LIMIT 10"
    )
    tasks = query_all("SELECT id, user_id, title, completed, created_at FROM study_tasks WHERE user_id = ? ORDER BY created_at", (user_id,))
    activities = query_all("SELECT id, user_id, type, description, created_at FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", (user_id,))
    # 学习进度
    progress = query_all(
        "SELECT lp.*, c.title as course_title, c.icon as course_icon, c.color as course_color FROM learning_progress lp JOIN courses c ON lp.course_id = c.id WHERE lp.user_id = ?",
        (user_id,),
    )
    # 统计
    total_exercises = query_one("SELECT COUNT(*) as cnt FROM exercises")["cnt"]
    completed_tasks = sum(1 for t in tasks if t["completed"])
    return {
        "user": user,
        "stats": {
            "level": user["level"],
            "xp": user["xp"],
            "streak_days": user["streak_days"],
            "completed_tasks": completed_tasks,
            "total_tasks": len(tasks),
            "total_exercises": total_exercises,
        },
        "leaderboard": leaderboard_rows,
        "tasks": tasks,
        "activities": activities,
        "learning_progress": progress,
    }


# ============ 课程 ============
@app.get("/courses")
def list_courses(language: Optional[str] = None, difficulty: Optional[str] = None):
    sql = "SELECT * FROM courses"
    params = []
    conditions = []
    if language:
        conditions.append("language = ?")
        params.append(language)
    if difficulty:
        conditions.append("difficulty = ?")
        params.append(difficulty)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY sort_order"
    return {"count": 0, "courses": query_all(sql, tuple(params))}

@app.get("/courses/{course_id}")
def get_course(course_id: int):
    course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    if not course:
        raise HTTPException(404, "课程不存在")
    lessons = query_all("SELECT id, title, summary, external_url, external_site, order_num FROM lessons WHERE course_id = ? ORDER BY order_num", (course_id,))
    course["lessons"] = lessons
    course["lesson_count"] = len(lessons)
    return course

@app.get("/courses/{course_id}/lessons")
def get_course_lessons(course_id: int):
    lessons = query_all("SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num", (course_id,))
    return {"count": len(lessons), "lessons": lessons}


class CreateCourseRequest(BaseModel):
    title: str
    description: str = ""
    language: str = "mixed"
    difficulty: str = "入门"
    category: str = "编程基础"
    image_url: str = ""
    course_url: str = ""
    instructor: str = "YiCode 教研组"


@app.post("/courses")
def create_course(req: CreateCourseRequest):
    """创建新课程"""
    # 确保 image_url 和 course_url 列存在
    try:
        db_execute("ALTER TABLE courses ADD COLUMN image_url TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        db_execute("ALTER TABLE courses ADD COLUMN course_url TEXT DEFAULT ''")
    except Exception:
        pass

    # 自动生成图标颜色
    color_map = {
        'py': '#3776ab', 'js': '#f7df1e', 'cpp': '#00599c',
        'java': '#ed8b00', 'go': '#00add8', 'cs': '#239120', 'mixed': '#6366f1'
    }
    color = color_map.get(req.language, '#6366f1')

    course_id = db_execute(
        """INSERT INTO courses (title, description, language, difficulty, category, icon, color, instructor, image_url, course_url)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (req.title, req.description, req.language, req.difficulty, req.category,
         'fa-graduation-cap', color, req.instructor, req.image_url, req.course_url)
    )

    # 重新加载课程列表
    return {
        "id": course_id,
        "title": req.title,
        "message": "课程发布成功"
    }

@app.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: int):
    lesson = query_one("SELECT * FROM lessons WHERE id = ?", (lesson_id,))
    if not lesson:
        raise HTTPException(404, "章节不存在")
    return lesson


# ============ 练习题（从数据库读取，替换原有 mock） ============
@app.get("/exercises")
def exercises_db(difficulty: Optional[str] = None, language: Optional[str] = None):
    sql = "SELECT * FROM exercises"
    params = []
    conditions = []
    if difficulty:
        conditions.append("difficulty = ?")
        params.append(difficulty)
    if language:
        conditions.append("language = ?")
        params.append(language)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    items = query_all(sql, tuple(params))
    return {"count": len(items), "items": items}


class CreateExerciseRequest(BaseModel):
    title: str
    description: str = ""
    difficulty: str = "简单"
    language: str = "py"
    starter_code: str = ""
    solution: str = ""
    expected_output: str = ""
    tags: str = ""
    course_id: Optional[int] = None


@app.post("/exercises")
def create_exercise(req: CreateExerciseRequest):
    """创建用户自定义题目"""
    # 确保 expected_output 列存在
    try:
        db_execute("ALTER TABLE exercises ADD COLUMN expected_output TEXT DEFAULT ''")
    except Exception:
        pass  # 列已存在

    ex_id = db_execute(
        """INSERT INTO exercises (course_id, title, description, difficulty, language, starter_code, solution, expected_output, tags)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (req.course_id, req.title, req.description, req.difficulty, req.language,
         req.starter_code, req.solution, req.expected_output, req.tags)
    )
    return {
        "id": ex_id,
        "title": req.title,
        "difficulty": req.difficulty,
        "language": req.language,
        "message": "题目发布成功"
    }


class CheckSolutionRequest(BaseModel):
    exercise_id: int
    code: str
    language: str = "py"


@app.post("/exercises/check")
def check_solution(req: CheckSolutionRequest):
    """验证用户代码：运行代码并比对预期输出"""
    ex = query_one("SELECT * FROM exercises WHERE id = ?", (req.exercise_id,))
    if not ex:
        raise HTTPException(404, "题目不存在")

    expected = (ex.get("expected_output") or "").strip()
    if not expected:
        # 没有预期输出，只执行返回结果
        result = runtime.run_code(req.language, req.code, 15, None)
        return {"matched": None, "stdout": result.get("stdout", ""), "stderr": result.get("stderr", ""),
                "exit_code": result.get("exit_code", -1), "message": "此题未设置预期输出，无法自动判题"}

    result = runtime.run_code(req.language, req.code, 15, None)
    actual = (result.get("stdout") or "").strip()
    matched = actual == expected

    return {
        "matched": matched,
        "expected": expected,
        "actual": actual,
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "exit_code": result.get("exit_code", -1),
        "message": "✅ 答案正确！通过" if matched else "❌ 输出不匹配，请检查代码逻辑"
    }


# ============ 学习任务 ============
class TaskRequest(BaseModel):
    user_id: int
    title: str

@app.post("/tasks")
def create_task(req: TaskRequest):
    tid = db_execute("INSERT INTO study_tasks (user_id, title) VALUES (?,?)", (req.user_id, req.title))
    return {"task_id": tid, "message": "任务已创建"}

@app.put("/tasks/{task_id}")
def toggle_task(task_id: int, completed: bool = True):
    db_execute("UPDATE study_tasks SET completed = ? WHERE id = ?", (1 if completed else 0, task_id))
    return {"task_id": task_id, "completed": completed}

@app.get("/tasks/user/{user_id}")
def list_user_tasks(user_id: int):
    tasks = query_all("SELECT * FROM study_tasks WHERE user_id = ? ORDER BY created_at", (user_id,))
    return {"count": len(tasks), "tasks": tasks}


# ============ 学习进度 ============
class ProgressRequest(BaseModel):
    user_id: int
    course_id: int
    progress_pct: int = 0
    last_lesson_id: Optional[int] = None

@app.post("/progress")
def update_progress(req: ProgressRequest):
    existing = query_one("SELECT id FROM learning_progress WHERE user_id = ? AND course_id = ?", (req.user_id, req.course_id))
    if existing:
        db_execute(
            "UPDATE learning_progress SET progress_pct = ?, last_lesson_id = ?, last_accessed = datetime('now','localtime') WHERE id = ?",
            (req.progress_pct, req.last_lesson_id, existing["id"]),
        )
    else:
        db_execute(
            "INSERT INTO learning_progress (user_id, course_id, progress_pct, last_lesson_id) VALUES (?,?,?,?)",
            (req.user_id, req.course_id, req.progress_pct, req.last_lesson_id),
        )
    return {"message": "进度已更新"}

@app.get("/progress/{user_id}")
def get_progress(user_id: int):
    rows = query_all(
        "SELECT lp.*, c.title as course_title, c.icon as course_icon, c.color as course_color FROM learning_progress lp JOIN courses c ON lp.course_id = c.id WHERE lp.user_id = ?",
        (user_id,),
    )
    return {"count": len(rows), "progress": rows}


# ============ 活动记录 ============
class ActivityRequest(BaseModel):
    user_id: int
    type: str  # code/learn/achieve/social
    description: str

@app.post("/activities")
def add_activity(req: ActivityRequest):
    aid = db_execute("INSERT INTO activities (user_id, type, description) VALUES (?,?,?)", (req.user_id, req.type, req.description))
    return {"activity_id": aid, "message": "活动已记录"}


# ============ 代码草稿（持久化用户代码） ============
class DraftRequest(BaseModel):
    user_id: int
    exercise_id: int
    language: str
    code: str
    exercise_title: Optional[str] = None

@app.post("/drafts")
def save_draft(req: DraftRequest):
    """保存/更新代码草稿（UPSERT）"""
    existing = query_one(
        "SELECT id FROM code_drafts WHERE user_id = ? AND exercise_id = ?",
        (req.user_id, req.exercise_id),
    )
    if existing:
        db_execute(
            "UPDATE code_drafts SET language = ?, code = ?, exercise_title = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            (req.language, req.code, req.exercise_title, existing["id"]),
        )
        return {"message": "草稿已更新", "draft_id": existing["id"]}
    else:
        did = db_execute(
            "INSERT INTO code_drafts (user_id, exercise_id, language, code, exercise_title) VALUES (?,?,?,?,?)",
            (req.user_id, req.exercise_id, req.language, req.code, req.exercise_title),
        )
        return {"message": "草稿已保存", "draft_id": did}

@app.get("/drafts/{user_id}/latest")
def get_latest_draft(user_id: int):
    """获取用户最近编辑的草稿（用于刷新后恢复到上次编辑的题目）"""
    draft = query_one(
        """SELECT d.*, e.title as ex_title, e.description as ex_desc, e.difficulty as ex_diff,
                  e.starter_code as ex_starter, e.accept_rate as ex_rate, e.tags as ex_tags
           FROM code_drafts d
           LEFT JOIN exercises e ON d.exercise_id = e.id
           WHERE d.user_id = ?
           ORDER BY d.updated_at DESC LIMIT 1""",
        (user_id,),
    )
    if not draft:
        return {"found": False, "exercise": None, "code": None}
    # 组装 exercise 对象（供前端直接使用）
    exercise = {
        "id": draft["exercise_id"],
        "title": draft["ex_title"] or draft.get("exercise_title") or "",
        "description": draft.get("ex_desc") or "",
        "difficulty": draft.get("ex_diff") or "简单",
        "language": draft["language"],
        "starter_code": draft.get("ex_starter"),
        "solution": None,
        "accept_rate": draft.get("ex_rate") or 0.0,
        "tags": draft.get("ex_tags"),
        "course_id": None,
    }
    return {"found": True, "exercise": exercise, "code": draft["code"]}

@app.get("/drafts/{user_id}/list")
def list_drafts(user_id: int):
    """列出用户所有草稿"""
    rows = query_all(
        "SELECT exercise_id, exercise_title, language, updated_at FROM code_drafts WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
    )
    return {"count": len(rows), "drafts": rows}

@app.get("/drafts/{user_id}/{exercise_id}")
def get_draft(user_id: int, exercise_id: int):
    """获取用户某道题的代码草稿（刷新恢复用）"""
    draft = query_one(
        "SELECT * FROM code_drafts WHERE user_id = ? AND exercise_id = ?",
        (user_id, exercise_id),
    )
    if not draft:
        return {"found": False, "draft": None}
    return {"found": True, "draft": draft}

@app.delete("/drafts/{user_id}/{exercise_id}")
def delete_draft(user_id: int, exercise_id: int):
    db_execute("DELETE FROM code_drafts WHERE user_id = ? AND exercise_id = ?", (user_id, exercise_id))
    return {"message": "草稿已删除"}


# ============ 局域网协作房间 REST 接口 ============
class CreateRoomRequest(BaseModel):
    host_name: str = Field("房主", description="创建者昵称")
    language: str = Field("py", description="初始代码语言")


@app.post("/rooms")
async def create_room(req: CreateRoomRequest):
    """创建协作房间，返回 6 位房间码 + 局域网地址"""
    code = _gen_room_code()
    lan_ip = _get_lan_ip()
    collab_rooms[code] = {
        "code": code,
        "host": req.host_name,
        "language": req.language,
        "created_at": datetime.now().isoformat(),
        "members": {},
    }
    collab_connections[code] = {}
    return {
        "room_code": code,
        "lan_ip": lan_ip,
        "ws_url": f"ws://{lan_ip}:8000/ws/room/{code}",
        "share_url": f"http://{lan_ip}:1420/?room={code}",
        "host": req.host_name,
        "language": req.language,
        "created_at": collab_rooms[code]["created_at"],
    }


@app.get("/rooms/{code}")
async def get_room(code: str):
    """查询房间是否存在 + 在线成员"""
    if code not in collab_rooms:
        raise HTTPException(404, f"房间 {code} 不存在或已关闭")
    room = collab_rooms[code]
    members = list(room.get("members", {}).values())
    lan_ip = _get_lan_ip()
    return {
        "room_code": code,
        "host": room["host"],
        "language": room.get("language", "py"),
        "member_count": len(collab_connections.get(code, {})),
        "members": members,
        "lan_ip": lan_ip,
        "ws_url": f"ws://{lan_ip}:8000/ws/room/{code}",
        "share_url": f"http://{lan_ip}:1420/?room={code}",
        "created_at": room["created_at"],
    }


@app.delete("/rooms/{code}")
async def close_room(code: str):
    """关闭房间"""
    if code not in collab_rooms:
        raise HTTPException(404, "房间不存在")
    # 通知所有成员房间关闭
    for ws in list(collab_connections.get(code, {}).keys()):
        try:
            await ws.send_json({"type": "room_closed", "code": code})
            await ws.close()
        except Exception:
            pass
    del collab_rooms[code]
    collab_connections.pop(code, None)
    return {"message": f"房间 {code} 已关闭"}


@app.get("/rooms")
async def list_rooms():
    """列出所有活跃房间"""
    items = []
    for code, room in collab_rooms.items():
        items.append({
            "code": code,
            "host": room["host"],
            "language": room.get("language", "py"),
            "member_count": len(collab_connections.get(code, {})),
            "created_at": room["created_at"],
        })
    return {"count": len(items), "rooms": items}


# ============ WebSocket 房间实时通信 ============
@app.websocket("/ws/room/{code}")
async def room_websocket(websocket: WebSocket, code: str):
    """协作房间 WebSocket：处理加入/代码同步/聊天/光标/离开"""
    print(f"[WebSocket] 新连接请求: 房间 {code}, 客户端: {websocket.client}")
    print(f"[WebSocket] 当前活跃房间: {list(collab_rooms.keys())}")
    
    if code not in collab_rooms:
        print(f"[WebSocket] 房间 {code} 不存在，关闭连接")
        await websocket.close(code=4004, reason="房间不存在或已关闭")
        return

    await websocket.accept()
    print(f"[WebSocket] 房间 {code} 连接已接受")
    room = collab_rooms[code]

    # 等待第一条 join 消息获取用户名
    try:
        first = await websocket.receive_text()
        data = json.loads(first)
        user_name = data.get("name", f"访客{random.randint(100,999)}")
        user_role = data.get("role", "writer")
        user_color = data.get("color", "a")
    except Exception:
        user_name = f"访客{random.randint(100,999)}"
        user_role = "writer"
        user_color = "a"

    # 注册连接
    collab_connections[code][websocket] = user_name
    member_info = {
        "name": user_name,
        "role": user_role,
        "color": user_color,
        "joined_at": datetime.now().isoformat(),
    }
    room.setdefault("members", {})[user_name] = member_info

    # 向新成员发送当前房间状态
    await websocket.send_json({
        "type": "room_state",
        "room_code": code,
        "host": room["host"],
        "language": room.get("language", "py"),
        "members": list(room["members"].values()),
        "code": room.get("shared_code", ""),
    })

    # 广播成员加入
    member_list = list(room["members"].values())
    for ws, name in list(collab_connections[code].items()):
        if ws != websocket:
            try:
                await ws.send_json({
                    "type": "member_joined",
                    "member": member_info,
                    "members": member_list,
                })
            except Exception:
                pass

    # 消息循环
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = msg.get("type", "")

            if msg_type == "code_sync":
                # 代码同步：更新房间共享代码 + 广播
                room["shared_code"] = msg.get("code", "")
                room["language"] = msg.get("lang", room.get("language", "py"))
                for ws, _ in list(collab_connections[code].items()):
                    if ws != websocket:
                        try:
                            await ws.send_json({
                                "type": "code_update",
                                "code": msg.get("code", ""),
                                "lang": msg.get("lang", "py"),
                                "from": user_name,
                            })
                        except Exception:
                            pass

            elif msg_type == "cursor":
                # 光标位置同步
                for ws, _ in list(collab_connections[code].items()):
                    if ws != websocket:
                        try:
                            await ws.send_json({
                                "type": "cursor_move",
                                "line": msg.get("line", 0),
                                "col": msg.get("col", 0),
                                "from": user_name,
                                "color": user_color,
                            })
                        except Exception:
                            pass

            elif msg_type == "chat":
                # 聊天消息广播
                chat_msg = {
                    "type": "chat",
                    "text": msg.get("text", ""),
                    "from": user_name,
                    "color": user_color,
                    "time": datetime.now().strftime("%H:%M"),
                }
                for ws, _ in list(collab_connections[code].items()):
                    try:
                        await ws.send_json(chat_msg)
                    except Exception:
                        pass

            elif msg_type == "lang_change":
                # 语言切换广播
                room["language"] = msg.get("lang", "py")
                for ws, _ in list(collab_connections[code].items()):
                    if ws != websocket:
                        try:
                            await ws.send_json({
                                "type": "lang_changed",
                                "lang": msg.get("lang", "py"),
                                "from": user_name,
                            })
                        except Exception:
                            pass

            elif msg_type == "role_change":
                # 角色切换
                new_role = msg.get("role", "writer")
                if user_name in room.get("members", {}):
                    room["members"][user_name]["role"] = new_role
                member_list = list(room["members"].values())
                for ws, _ in list(collab_connections[code].items()):
                    try:
                        await ws.send_json({
                            "type": "role_changed",
                            "members": member_list,
                        })
                    except Exception:
                        pass

            elif msg_type == "write_request":
                # 成员申请写权限 - 通知房主
                for ws, name in list(collab_connections[code].items()):
                    if name == room.get("host"):
                        try:
                            await ws.send_json({
                                "type": "write_request",
                                "from": user_name,
                            })
                        except Exception:
                            pass

            elif msg_type == "write_approve":
                # 房主审批写权限
                target = msg.get("target", "")
                approved = msg.get("approved", False)
                if user_name == room.get("host") and target in room.get("members", {}):
                    new_role = "writer" if approved else "obs"
                    room["members"][target]["role"] = new_role
                    member_list = list(room["members"].values())
                    # 通知所有人角色变更
                    for ws, _ in list(collab_connections[code].items()):
                        try:
                            await ws.send_json({
                                "type": "role_changed",
                                "members": member_list,
                                "approved": approved,
                                "target": target,
                            })
                        except Exception:
                            pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS Room {code}] error: {e}")
    finally:
        # 成员离开清理
        if code in collab_connections and websocket in collab_connections[code]:
            del collab_connections[code][websocket]
        # 检查该用户是否还有其他活跃连接（刷新页面时新连接已建立，旧连接断开不应移除成员）
        has_other_connection = any(
            n == user_name for ws2, n in collab_connections.get(code, {}).items()
        )
        if code in collab_rooms and user_name in room.get("members", {}) and not has_other_connection:
            del room["members"][user_name]
        member_list = list(room.get("members", {}).values()) if code in collab_rooms else []
        # 广播成员离开（仅当用户真正离开时）
        if not has_other_connection:
            for ws, _ in list(collab_connections.get(code, {}).items()):
                try:
                    await ws.send_json({
                        "type": "member_left",
                        "name": user_name,
                        "members": member_list,
                    })
                except Exception:
                    pass
        # 如果房间空了，延迟销毁（宽限期30秒，允许刷新页面的用户重连）
        if code in collab_rooms and not collab_connections.get(code):
            async def _delayed_destroy(room_code: str):
                await asyncio.sleep(30)
                if room_code in collab_rooms and not collab_connections.get(room_code):
                    print(f"[WS Room {room_code}] 宽限期结束，房间销毁")
                    collab_rooms.pop(room_code, None)
                    collab_connections.pop(room_code, None)
            print(f"[WS Room {code}] 所有成员已离开，30秒宽限期开始")
            asyncio.create_task(_delayed_destroy(code))


# ============ 启动入口 ============
if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("YiCode Local API 启动中...")
    print(f"   项目根目录: {ROOT}")
    print(f"   AI Provider: {ai_provider_name}")
    print()
    # 先打印环境检测结果
    envs = runtime.detect_all_runtimes()
    print("运行环境检测:")
    for k, info in envs.items():
        status = "[OK]" if info["available"] else "[NO]"
        ver = (info.get("version") or "未安装")[:50]
        print(f"   {status} {info['name']:10s} | {ver}")
    print()
    print("API 文档: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")





