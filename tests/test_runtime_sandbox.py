import shutil
import sys

import pytest

from runtime.manager import MultiLangRuntime


@pytest.mark.skipif(
    sys.platform != "darwin" or not shutil.which("sandbox-exec"),
    reason="仅 macOS + Seatbelt 环境运行",
)
def test_macos_sandbox_blocks_file_write():
    rt = MultiLangRuntime()
    code = (
        "try:\n"
        "    open('/tmp/yicode_pytest_escape.txt', 'w').write('pwn')\n"
        "    print('WRITE_OK')\n"
        "except Exception as e:\n"
        "    print('BLOCKED:', type(e).__name__)\n"
    )
    result = rt.run_code("py", code)
    output = (result.get("stdout") or "") + (result.get("stderr") or "")
    assert "PermissionError" in output


@pytest.mark.skipif(
    sys.platform != "darwin" or not shutil.which("sandbox-exec"),
    reason="仅 macOS + Seatbelt 环境运行",
)
def test_macos_sandbox_blocks_network():
    rt = MultiLangRuntime()
    code = (
        "import socket\n"
        "s = socket.socket()\n"
        "s.settimeout(2)\n"
        "try:\n"
        "    s.connect(('127.0.0.1', 8000))\n"
        "    print('NET_OK')\n"
        "except Exception as e:\n"
        "    print('BLOCKED:', type(e).__name__)\n"
        "finally:\n"
        "    s.close()\n"
    )
    result = rt.run_code("py", code)
    output = (result.get("stdout") or "") + (result.get("stderr") or "")
    assert "PermissionError" in output
