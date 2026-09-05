"""JWT、权限校验与登录限流，独立于主路由模块。"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException

from services.local_api.database import execute as db_execute, query_one

AUTH_TTL_SECONDS = 12 * 3600


def _auth_secret() -> str:
    env_secret = os.getenv("YICODE_AUTH_SECRET", "").strip()
    if env_secret:
        return env_secret
    secret_file = Path(__file__).resolve().parents[2] / "data" / ".auth_secret"
    try:
        if secret_file.exists():
            return secret_file.read_text(encoding="utf-8").strip()
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        value = secrets.token_urlsafe(48)
        secret_file.write_text(value, encoding="utf-8")
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
        return value
    except OSError:
        return "local-dev-secret-change-me"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    padding = "=" * ((4 - len(text) % 4) % 4)
    return base64.urlsafe_b64decode((text + padding).encode("ascii"))


def _issue_token(user_id: int) -> str:
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(json.dumps({
        "uid": user_id,
        "iat": now,
        "exp": now + AUTH_TTL_SECONDS,
    }).encode("utf-8"))
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(
        _auth_secret().encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    return f"{header}.{payload}.{_b64url(signature)}"


def _current_user(authorization: Optional[str]) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "未登录或缺少 Authorization 请求头")
    token = authorization[7:].strip()
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected = hmac.new(
            _auth_secret().encode("utf-8"), signing_input, hashlib.sha256
        ).digest()
        actual = _b64url_decode(sig_b64)
        if not secrets.compare_digest(actual, expected):
            raise HTTPException(401, "Token 无效")
        claims = json.loads(_b64url_decode(payload_b64))
        if int(claims.get("exp", 0)) < time.time():
            raise HTTPException(401, "登录已过期，请重新登录")
        user_id = int(claims["uid"])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "登录已过期，请重新登录")
    user = query_one("SELECT id, username, role, target_id FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(401, "用户不存在，请重新登录")
    return user


def _require_admin(authorization: Optional[str], super_only: bool = False) -> Dict[str, Any]:
    user = _current_user(authorization)
    allowed = user["role"] == "super_admin"
    if not super_only and user["role"] == "admin":
        allowed = True
    if not allowed:
        raise HTTPException(403, "需要管理员权限")
    return user


def _require_user(authorization: Optional[str], user_id: int) -> Dict[str, Any]:
    user = _current_user(authorization)
    if int(user["id"]) != int(user_id) and user["role"] not in ("admin", "super_admin"):
        raise HTTPException(403, "只能访问自己的数据")
    return user


def _check_login_limit(username: str) -> None:
    row = query_one("SELECT locked_until FROM login_attempts WHERE username = ?", (username,))
    if row and row.get("locked_until") and row["locked_until"] > time.time():
        remaining = int(row["locked_until"] - time.time())
        raise HTTPException(429, f"登录失败次数过多，请 {max(1, remaining // 60 + 1)} 分钟后再试")


def _record_login_failure(username: str) -> None:
    now = time.time()
    row = query_one(
        "SELECT fail_count, locked_until FROM login_attempts WHERE username = ?",
        (username,),
    )
    count = 0
    locked_until = None
    if row:
        if row.get("locked_until") and row["locked_until"] > now:
            locked_until = row["locked_until"]
            count = 0
        else:
            count = row.get("fail_count", 0)
    count += 1
    if count >= 5:
        locked_until = now + 5 * 60
        count = 0
    db_execute(
        """INSERT INTO login_attempts (username, fail_count, locked_until)
           VALUES (?,?,?)
           ON CONFLICT(username) DO UPDATE SET
             fail_count=excluded.fail_count,
             locked_until=excluded.locked_until""",
        (username, count, locked_until),
    )


def _clear_login_failures(username: str) -> None:
    db_execute("DELETE FROM login_attempts WHERE username = ?", (username,))
