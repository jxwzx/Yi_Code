# YiCode AI Provider 集成
"""
支持小米 MiMo AI（默认）和本地规则匹配 AI（离线备用）。
MiMo API 兼容 OpenAI 协议，使用 /v1/chat/completions 接口。
"""
import os
import json
import re
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
        sys_msg = "你是 YiCode 编程助教，专注于帮助初学者和大学生学习编程。请直接给出代码，用中文注释解释。简洁明了。"
        user_msg = f"请生成以下代码：\n{prompt}"
        if context:
            user_msg += f"\n\n参考上下文：\n{context}"
        return self.chat([
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": user_msg},
        ], max_tokens=512)

    def explain_code(self, code: str) -> str:
        """解释代码"""
        return self.chat([
            {"role": "system", "content": "你是 YiCode 编程助教。请逐行解释代码逻辑，用中文回答，适合初学者理解。简洁明了。"},
            {"role": "user", "content": f"请解释这段代码：\n```\n{code}\n```"},
        ], max_tokens=512)

    def diagnose_error(self, error: str, code: Optional[str] = None) -> str:
        """诊断错误"""
        user_msg = f"代码运行出错：\n```\n{error}\n```"
        if code:
            user_msg += f"\n\n相关代码：\n```\n{code}\n```"
        user_msg += "\n请分析错误原因并给出修复建议。简洁明了。"
        return self.chat([
            {"role": "system", "content": "你是 YiCode 编程助教。请分析代码错误原因，给出修复方案，用中文回答。简洁明了。"},
            {"role": "user", "content": user_msg},
        ], max_tokens=512)


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

        lower = user_msg.lower()
        normalized = lower.replace(" ", "")

        # 基础概念问答（离线可用的知识点）
        concepts = [
            ("for 循环", "for 循环用于按顺序遍历可迭代对象，例如列表、字符串或 range。\n\n基本格式：\nfor i in range(5):\n    print(i)"),
            ("while 循环", "while 循环在条件为真时重复执行代码块。\n\n基本格式：\nwhile 条件:\n    代码块"),
            ("if 语句", "if 语句用于根据条件选择执行不同分支，可配合 elif / else 使用。"),
            ("函数", "函数是封装一段可复用逻辑的代码块，通过 def（Python）或 function（JavaScript）定义，可接收参数并返回值。"),
            ("变量", "变量用于保存数据，例如数字、字符串、列表或对象；Python 中直接赋值即可，不需要声明类型。"),
            ("列表", "列表是有序、可修改的集合，使用 [] 创建，例如：items = [1, 2, 3]。"),
            ("字典", "字典用于保存键值对，使用 {} 创建，例如：user = {'name': 'YiCode'}。"),
            ("类", "类是面向对象编程的模板，用于创建具有属性和方法的对象，例如：class Dog:。"),
        ]
        for keyword, answer in concepts:
            if keyword.replace(" ", "") in normalized:
                return f"{answer}\n\n（离线基础解释；如需更深入讲解可配置 MiMo AI）"

        # 代码解释请求
        if "解释" in user_msg or "讲解" in user_msg or "说明" in user_msg or "explain" in user_msg.lower():
            lines = user_msg.split("\n")
            code_lines = [l for l in lines if l.strip() and not l.startswith("```")]
            features = self._code_features("\n".join(code_lines))
            base = f"这段代码共 {len(code_lines)} 行。\n\n代码分析：\n"
            if features:
                base += "\n".join(f"- {f}" for f in features)
            else:
                base += "- 包含变量定义、条件判断或函数调用等常见结构"
            return base + "\n\n（注：离线模式提供基础代码分析，如需详细解释请配置 MiMo AI）"

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
            return "请检查代码逻辑和语法，重点确认变量是否定义、括号是否配对、索引是否越界。如需详细诊断，请配置 MiMo AI。"

        if "生成" in user_msg or "generate" in user_msg.lower():
            return f"（离线模式）暂不支持智能代码生成。\n\n已收到请求：{user_msg[:120]}...\n\n可先使用在线 AI 或安装配置有效的 MiMo API Key。"

        return "（离线模式）当前未配置 MiMo AI。\n\n离线可处理：基础概念问答、代码解释、错误诊断、代码检查。\n\n如需更智能的回答，请在 .env 文件中设置 MIMO_API_KEY。"

    @staticmethod
    def _code_features(code: str) -> list:
        features = []
        if re.search(r"^\s*def\s+\w+", code, re.M):
            features.append("定义了一个或多个函数，用于封装可复用逻辑")
        if re.search(r"^\s*class\s+\w+", code, re.M):
            features.append("定义了一个类，包含面向对象的结构")
        if re.search(r"\bfor\s+\w+\s+in\b", code):
            features.append("使用 for 循环遍历可迭代对象")
        if re.search(r"\bwhile\b", code):
            features.append("使用 while 循环执行条件循环")
        if re.search(r"\bif\b|\belif\b|\belse\b", code):
            features.append("包含条件判断，根据条件选择不同执行路径")
        if re.search(r"return\s+", code):
            features.append("函数包含 return 返回值语句")
        if re.search(r"print\s*\(|console\.log|System\.out\.print|fmt\.Print", code):
            features.append("代码包含输出语句，会向控制台打印结果")
        return features

    def generate_code(self, prompt: str, context: Optional[str] = None) -> str:
        return self.chat([{"role": "user", "content": f"请生成代码：{prompt}"}])

    def explain_code(self, code: str) -> str:
        if not code.strip():
            return "请先提供需要解释的代码。"
        lines = [l for l in code.splitlines() if l.strip()]
        features = self._code_features(code)
        base = f"这段代码共 {len(lines)} 行。\n\n代码分析：\n"
        base += "\n".join(f"- {f}" for f in features) if features else "- 主要包含变量赋值与常见代码结构"
        base += "\n\n（注：离线模式提供基础代码分析，如需逐行详细讲解请配置 MiMo AI）"
        return base

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
