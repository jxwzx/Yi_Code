from runtime import manager as runtime_manager
from runtime.manager import MultiLangRuntime


class _FakeProc:
    returncode = 0
    stdout = "docker ok"
    stderr = ""


def test_docker_images_cover_all_languages():
    assert set(MultiLangRuntime.LANG_CONFIG) == set(MultiLangRuntime._DOCKER_IMAGES)
    assert MultiLangRuntime._DOCKER_IMAGES == {
        "py": "python:3.13",
        "js": "node:22",
        "cpp": "gcc:14",
        "java": "eclipse-temurin:21",
        "go": "golang:1.27",
        "cs": "mcr.microsoft.com/dotnet/sdk:8.0",
    }


def test_flag_off_keeps_native_execution(monkeypatch):
    monkeypatch.delenv("YICODE_DOCKER_SANDBOX", raising=False)
    result = MultiLangRuntime().run_code("py", "print('hello')")
    assert result["success"] is True
    assert result["stdout"].strip() == "hello"


def test_flag_on_without_docker_falls_back_to_native(monkeypatch):
    monkeypatch.setenv("YICODE_DOCKER_SANDBOX", "1")
    monkeypatch.setattr(
        MultiLangRuntime,
        "_docker_bin",
        classmethod(lambda cls: None),
    )
    result = MultiLangRuntime().run_code("py", "print('hello')")
    assert result["success"] is True
    assert result["stdout"].strip() == "hello"


def test_docker_python_command_has_sandbox_flags(monkeypatch):
    monkeypatch.setenv("YICODE_DOCKER_SANDBOX", "1")
    monkeypatch.setattr(
        MultiLangRuntime,
        "_docker_bin",
        classmethod(lambda cls: "/fake/docker"),
    )
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return _FakeProc()

    monkeypatch.setattr(runtime_manager.subprocess, "run", fake_run)
    result = MultiLangRuntime().run_code("py", "print('hello')")

    assert result["success"] is True
    assert result["stdout"] == "docker ok"
    assert len(calls) == 1
    args = calls[0]
    assert "python:3.13" in args
    assert args[args.index("--network") + 1] == "none"
    assert args[args.index("--security-opt") + 1] == "no-new-privileges"
    mount = next(a for a in args if a.startswith("type=bind,source="))
    assert mount.endswith(",target=/workspace")


def test_docker_compiled_language_runs_compile_then_binary(monkeypatch):
    monkeypatch.setenv("YICODE_DOCKER_SANDBOX", "1")
    monkeypatch.setattr(
        MultiLangRuntime,
        "_docker_bin",
        classmethod(lambda cls: "/fake/docker"),
    )
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return _FakeProc()

    monkeypatch.setattr(runtime_manager.subprocess, "run", fake_run)
    code = '#include <iostream>\nint main(){std::cout<<"hi";return 0;}'
    result = MultiLangRuntime().run_code("cpp", code)

    assert result["success"] is True
    assert len(calls) == 2
    assert "gcc:14" in calls[0]
    assert calls[0][-1] == "/workspace/out"
    assert calls[1][-1] == "/workspace/out"
