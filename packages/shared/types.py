# YiCode 共享类型定义
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel

class User(BaseModel):
    id: Optional[int] = None
    username: str
    email: Optional[str] = None
    role: str = "student"
    created_at: Optional[datetime] = None

class Project(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None
    owner_id: Optional[int] = None
    created_at: Optional[datetime] = None

class File(BaseModel):
    id: Optional[int] = None
    name: str
    path: str
    content: Optional[str] = None
    project_id: int
    language: str = "python"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class Classroom(BaseModel):
    id: Optional[int] = None
    name: str
    teacher_id: int
    description: Optional[str] = None
    created_at: Optional[datetime] = None

class Assignment(BaseModel):
    id: Optional[int] = None
    title: str
    description: Optional[str] = None
    classroom_id: int
    due_date: Optional[datetime] = None
    created_at: Optional[datetime] = None

class Submission(BaseModel):
    id: Optional[int] = None
    assignment_id: int
    student_id: int
    project_id: int
    submitted_at: Optional[datetime] = None
    grade: Optional[float] = None
    feedback: Optional[str] = None

class AIConfig(BaseModel):
    provider: str = "openai"
    api_key: Optional[str] = None
    model: str = "gpt-4"
    temperature: float = 0.7
    max_tokens: int = 1000

class RuntimeConfig(BaseModel):
    python_version: str = "3.11"
    virtual_env: Optional[str] = None
    packages: List[str] = []
