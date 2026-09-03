# YiCode AI Provider 集成
import os
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod

class AIProvider(ABC):
    """AI Provider 基类"""
    
    @abstractmethod
    def generate_code(self, prompt: str, context: Optional[str] = None) -> str:
        """生成代码"""
        pass
    
    @abstractmethod
    def explain_code(self, code: str) -> str:
        """解释代码"""
        pass
    
    @abstractmethod
    def diagnose_error(self, error: str, code: Optional[str] = None) -> str:
        """诊断错误"""
        pass

class OpenAIProvider(AIProvider):
    """OpenAI Provider 实现"""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.base_url = "https://api.openai.com/v1"
        
    def generate_code(self, prompt: str, context: Optional[str] = None) -> str:
        """生成代码"""
        if not self.api_key:
            return "Error: OpenAI API key not configured"
        
        # 这里应该调用OpenAI API
        # 简化示例，实际实现需要使用requests或openai库
        return f"# Generated code for: {prompt}\n# TODO: Implement OpenAI API call"
    
    def explain_code(self, code: str) -> str:
        """解释代码"""
        if not self.api_key:
            return "Error: OpenAI API key not configured"
        
        return f"Explanation of code: {code[:100]}... \n# TODO: Implement OpenAI API call"
    
    def diagnose_error(self, error: str, code: Optional[str] = None) -> str:
        """诊断错误"""
        if not self.api_key:
            return "Error: OpenAI API key not configured"
        
        return f"Diagnosis for error: {error}\n# TODO: Implement OpenAI API call"

class LocalAIProvider(AIProvider):
    """本地AI Provider（用于离线或测试）"""
    
    def generate_code(self, prompt: str, context: Optional[str] = None) -> str:
        """生成代码"""
        return f"# Local generated code for: {prompt}\nprint('Hello, YiCode!')"
    
    def explain_code(self, code: str) -> str:
        """解释代码"""
        lines = code.split('\n')
        explanation = f"This code has {len(lines)} lines.\n"
        if 'def ' in code:
            explanation += "Contains function definitions.\n"
        if 'class ' in code:
            explanation += "Contains class definitions.\n"
        return explanation
    
    def diagnose_error(self, error: str, code: Optional[str] = None) -> str:
        """诊断错误"""
        if "SyntaxError" in error:
            return "检查代码语法，特别是括号、引号和缩进。"
        elif "NameError" in error:
            return "检查变量名是否正确定义。"
        elif "IndentationError" in error:
            return "检查代码缩进是否正确。"
        else:
            return f"错误类型: {error.split(':')[0] if ':' in error else error}"

def get_provider(provider_name: str = "local", **kwargs) -> AIProvider:
    """获取AI Provider实例"""
    providers = {
        "openai": OpenAIProvider,
        "local": LocalAIProvider
    }
    
    if provider_name not in providers:
        raise ValueError(f"Unknown provider: {provider_name}")
    
    return providers[provider_name](**kwargs)
