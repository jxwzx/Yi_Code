# YiCode AI Provider 集成
"""
支持小米 MiMo AI（默认）和本地规则匹配 AI（离线备用）。
MiMo API 兼容 OpenAI 协议，使用 /v1/chat/completions 接口。
"""
import os
import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod
from pathlib import Path


def _load_env():
    """从 .env 文件加载环境变量（无需第三方库）"""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip()
                if key and key not in os.environ:
                    os.environ[key] = val


_load_env()


class AIProvider(ABC):
    """AI Provider 基类"""

    @abstractmethod
    def chat(self, messages: list, temperature: float = 0.7, max_tokens: int = 1024) -> str:
        """通用对话接口"""
        pass

    def generate_code(self, prompt: str, context: Optional[str] = None) -> str:
        """生成代码"""
        sys_msg = "你是 YiCode 编程助教，专注于帮助初学者和大学生学习编程。请直接给出代码，用中文注释解释。"
        user_msg = f"请生成以下代码：\n{prompt}"
        if context:
            user_msg += f"\n\n参考上下文：\n{context}"
        return self.chat([
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": user_msg},
        ])

    def explain_code(self, code: str) -> str:
        """解释代码"""
        return self.chat([
            {"role": "system", "content": "你是 YiCode 编程助教。请逐行解释代码逻辑，用中文回答，适合初学者理解。"},
            {"role": "user", "content": f"请解释这段代码：\n```\n{code}\n```"},
        ])

    def diagnose_error(self, error: str, code: Optional[str] = None) -> str:
        """诊断错误"""
        user_msg = f"代码运行出错：\n```\n{error}\n```"
        if code:
            user_msg += f"\n\n相关代码：\n```\n{code}\n```"
        user_msg += "\n请分析错误原因并给出修复建议。"
        return self.chat([
            {"role": "system", "content": "你是 YiCode 编程助教。请分析代码错误原因，给出修复方案，用中文回答。"},
            {"role": "user", "content": user_msg},
        ])


class MiMoProvider(AIProvider):
    """小米 MiMo AI Provider（OpenAI 兼容协议）"""

    def __init__(self, api_key: Optional[str] = None, model: str = "", base_url: str = ""):
        self.api_key = api_key or os.getenv("MIMO_API_KEY", "")
        self.model = model or os.getenv("MIMO_MODEL", "mimo-v2.5-pro")
        self.base_url = base_url or os.getenv("MIMO_BASE_URL", "https://api.xiaomimimo.com/v1")

    def chat(self, messages: list, temperature: float = 0.7, max_tokens: int = 1024) -> str:
        """调用 MiMo chat completions API"""
        if not self.api_key:
            return "错误：未配置 MiMo API Key，请在 .env 文件中设置 MIMO_API_KEY"

        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            return f"MiMo API 错误 (HTTP {e.code}): {err_body[:200]}"
        except urllib.error.URLError as e:
            return f"网络错误：{e.reason}"
        except Exception as e:
            return f"AI 调用失败：{str(e)}"


class LocalAIProvider(AIProvider):
    """本地规则匹配 AI（离线备用）"""

    def chat(self, messages: list, temperature: float = 0.7, max_tokens: int = 1024) -> str:
        """本地规则匹配（简单模式）"""
        user_msg = ""
        for m in messages:
            if m["role"] == "user":
                user_msg = m["content"]
                break

        # 简单的关键词匹配
        if "解释" in user_msg or "explain" in user_msg.lower():
            lines = user_msg.split("\n")
            code_lines = [l for l in lines if l.strip() and not l.startswith("```")]
            return f"这段代码共 {len(code_lines)} 行。\n\n主要功能：\n- 包含变量定义和逻辑判断\n- 实现了特定的计算或处理流程\n\n（注：离线模式，如需详细解释请配置 MiMo AI）"

        if "错误" in user_msg or "error" in user_msg.lower():
            if "SyntaxError" in user_msg:
                return "语法错误：检查括号、引号和缩进是否正确配对。"
            elif "NameError" in user_msg:
                return "名称错误：检查变量名是否正确定义和拼写。"
            elif "IndentationError" in user_msg:
                return "缩进错误：Python 使用缩进表示代码块，请检查缩进是否一致。"
            elif "TypeError" in user_msg:
                return "类型错误：检查操作数的类型是否匹配。"
            elif "IndexError" in user_msg:
                return "索引越界：检查数组/列表索引是否超出范围。"
            return "请检查代码逻辑和语法。如需详细诊断，请配置 MiMo AI。"

        if "生成" in user_msg or "generate" in user_msg.lower():
            return f"（离线模式）请描述你需要生成的代码功能。\n\n你的请求：{user_msg[:100]}...\n\n如需 AI 生成代码，请配置 MiMo API。"

        return "（离线模式）当前未配置 MiMo AI，只能提供基础回复。请在 .env 文件中设置 MIMO_API_KEY 以启用智能 AI 助教。"

    def generate_code(self, prompt: str, context: Optional[str] = None) -> str:
        return self.chat([{"role": "user", "content": f"请生成代码：{prompt}"}])

    def explain_code(self, code: str) -> str:
        return self.chat([{"role": "user", "content": f"请解释代码：{code}"}])

    def diagnose_error(self, error: str, code: Optional[str] = None) -> str:
        return self.chat([{"role": "user", "content": f"错误：{error}"}])


def get_provider(provider_name: str = "mimo", **kwargs) -> AIProvider:
    """获取 AI Provider 实例"""
    providers = {
        "mimo": MiMoProvider,
        "local": LocalAIProvider,
    }

    if provider_name not in providers:
        raise ValueError(f"未知 Provider: {provider_name}")

    return providers[provider_name](**kwargs)
