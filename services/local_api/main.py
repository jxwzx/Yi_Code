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
from services.local_api.database import init_db, query_all, query_one, execute as db_execute, _hash_password


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
@app.post("/ai/chat")
async def ai_chat(req: AIChatRequest):
    """AI 对话接口 - 支持问题检测、知识点讲解"""
    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:8]}"

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
                reply = ai.diagnose_error(req.error_msg, code)
            else:
                reply = _enhanced_code_review(code, lang, ai)
        elif ("解释" in user_msg or "讲解" in user_msg or "说明" in user_msg) and code:
            reply = ai.explain_code(code)
        else:
            # 通用代码生成 / 知识问答
            prompt = user_msg
            if code:
                prompt += f"\n\n【上下文代码 ({lang})】\n```\n{code}\n```"
            reply = ai.generate_code(prompt, code or None)
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
    provider_resp = provider.diagnose_error("代码审查请求", code) if isinstance(provider, LocalAIProvider) else provider.diagnose_error("", code)
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
    uid = db_execute(
        "INSERT INTO users (username, password_hash, email, avatar) VALUES (?,?,?,?)",
        (req.username, _hash_password(req.password), req.email, req.avatar or req.username[0]),
    )
    return {"user_id": uid, "username": req.username, "message": "注册成功"}

@app.post("/auth/login")
def login(req: LoginRequest):
    user = query_one("SELECT * FROM users WHERE username = ?", (req.username,))
    if not user or user["password_hash"] != _hash_password(req.password):
        raise HTTPException(401, "用户名或密码错误")
    return {"user_id": user["id"], "username": user["username"], "avatar": user["avatar"],
            "level": user["level"], "xp": user["xp"], "streak_days": user["streak_days"]}

@app.get("/users/{user_id}")
def get_user(user_id: int):
    user = query_one("SELECT id, username, avatar, level, xp, streak_days, email, created_at FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(404, "用户不存在")
    return user


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
    return {
        "room_code": code,
        "host": room["host"],
        "language": room.get("language", "py"),
        "member_count": len(collab_connections.get(code, {})),
        "members": members,
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
    if code not in collab_rooms:
        await websocket.close(code=4004, reason="房间不存在或已关闭")
        return

    await websocket.accept()
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

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS Room {code}] error: {e}")
    finally:
        # 成员离开清理
        if code in collab_connections and websocket in collab_connections[code]:
            del collab_connections[code][websocket]
        if code in collab_rooms and user_name in room.get("members", {}):
            del room["members"][user_name]
        member_list = list(room.get("members", {}).values()) if code in collab_rooms else []
        # 广播成员离开
        for ws, _ in list(collab_connections.get(code, {}).items()):
            try:
                await ws.send_json({
                    "type": "member_left",
                    "name": user_name,
                    "members": member_list,
                })
            except Exception:
                pass
        # 如果房间空了，5 分钟后自动清理
        if code in collab_rooms and not collab_connections.get(code):
            async def _cleanup():
                await asyncio.sleep(300)
                if code in collab_rooms and not collab_connections.get(code):
                    collab_rooms.pop(code, None)
                    collab_connections.pop(code, None)
            asyncio.create_task(_cleanup())


# ============ 启动入口 ============
if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("🚀 YiCode Local API 启动中...")
    print(f"   项目根目录: {ROOT}")
    print(f"   AI Provider: {ai_provider_name}")
    print()
    # 先打印环境检测结果
    envs = runtime.detect_all_runtimes()
    print("📦 运行环境检测:")
    for k, info in envs.items():
        status = "✅" if info["available"] else "❌"
        ver = (info.get("version") or "未安装")[:50]
        print(f"   {status} {info['name']:10s} | {ver}")
    print()
    print("🌐 API 文档: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
