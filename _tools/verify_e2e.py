import json, urllib.request, sys, time

def http_get(url, t=10):
    with urllib.request.urlopen(url, timeout=t) as r:
        return r.status, r.read().decode("utf-8", errors="replace")

def http_post(url, data_obj, t=60):
    body = json.dumps(data_obj).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.status, json.loads(r.read().decode("utf-8", errors="replace"))

ok_all = True
def mark(label, ok, extra=""):
    global ok_all
    sym = "✅" if ok else "❌"
    print(f"{sym} {label} {extra}")
    if not ok:
        ok_all = False

print("=" * 60)
print("YiCode End-to-End Verification")
print("=" * 60)

# 1. FRONTEND
try:
    s, b = http_get("http://localhost:1420/", t=10)
    ok = s == 200 and len(b) > 500
    mark("Frontend http://localhost:1420/", ok, f"status={s} len={len(b)}")
except Exception as e:
    mark("Frontend http://localhost:1420/", False, f"ex={e}")

# 2. BACKEND HEALTH
try:
    s, b = http_get("http://localhost:8000/health")
    mark("Backend /health", s == 200 and "healthy" in b)
except Exception as e:
    mark("Backend /health", False, f"ex={e}")

# 3. BACKEND RUNTIMES
try:
    s, b = http_get("http://localhost:8000/runtimes")
    j = json.loads(b) if isinstance(b, str) else b
    details = j.get("details", {}) or {}
    summary = j.get("summary", {}) or {}
    print(f"  runtimes: total={summary.get('total')} avail={summary.get('available')} missing={summary.get('missing')}")
    for k, v in details.items():
        sym = "✅" if v.get("available") else "❌"
        print(f"    {sym} {v.get('name', k):10s} {str(v.get('version',''))[:50]}")
    mark("Backend /runtimes (at least 4/6)", summary.get("available", 0) >= 4)
except Exception as e:
    mark("Backend /runtimes", False, f"ex={e}")

# 4. Python
try:
    _, j = http_post("http://localhost:8000/run", {
        "language": "py",
        "code": "print('Hello Python!'); print('1+1=', 1+1)"
    }, t=25)
    ok = j.get("success") and "Hello Python!" in j.get("stdout", "")
    mark("POST /run python", ok, f"elapsed={j.get('elapsed_seconds')}s out={j.get('stdout','').strip()[:80]!r}")
    if not ok: print(f"    err={j.get('stderr') or j.get('error')}")
except Exception as e:
    mark("POST /run python", False, f"ex={e}")

# 5. JS
try:
    _, j = http_post("http://localhost:8000/run", {
        "language": "js",
        "code": "console.log('Hello JS!'); [1,2,3].forEach(n=>console.log('n='+n))"
    }, t=25)
    ok = j.get("success") and "Hello JS!" in j.get("stdout", "")
    mark("POST /run javascript", ok, f"elapsed={j.get('elapsed_seconds')}s out={j.get('stdout','').strip()[:80]!r}")
    if not ok: print(f"    err={j.get('stderr') or j.get('error')}")
except Exception as e:
    mark("POST /run javascript", False, f"ex={e}")

# 6. Java
try:
    code = "public class Main { public static void main(String[] a) { System.out.println(\"Hello Java!\"); int s=0; for(int i=1;i<=5;i++)s+=i; System.out.println(\"sum1-5=\"+s); } }"
    _, j = http_post("http://localhost:8000/run", {"language": "java", "code": code}, t=60)
    ok = j.get("success") and "Hello Java!" in j.get("stdout", "")
    mark("POST /run java", ok, f"elapsed={j.get('elapsed_seconds')}s out={j.get('stdout','').strip()[:80]!r}")
    if not ok: print(f"    err={j.get('stderr') or j.get('error')}")
except Exception as e:
    mark("POST /run java", False, f"ex={e}")

# 7. Go
try:
    code = "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"Hello Go!\"); s:=0; for i:=1;i<=5;i++ { s+=i }; fmt.Println(\"sum1-5=\", s) }"
    _, j = http_post("http://localhost:8000/run", {"language": "go", "code": code}, t=90)
    ok = j.get("success") and "Hello Go!" in j.get("stdout", "")
    mark("POST /run go", ok, f"elapsed={j.get('elapsed_seconds')}s out={j.get('stdout','').strip()[:80]!r}")
    if not ok: print(f"    err={j.get('stderr') or j.get('error')}")
except Exception as e:
    mark("POST /run go", False, f"ex={e}")

# 8. C#
try:
    code = "using System;\nusing System.Linq;\nclass Program { static void Main() { Console.WriteLine(\"Hello C#!\"); Console.WriteLine(\"sum1-5=\"+Enumerable.Range(1,5).Sum()); } }"
    _, j = http_post("http://localhost:8000/run", {"language": "cs", "code": code}, t=180)
    ok = j.get("success") and "Hello C#!" in j.get("stdout", "")
    mark("POST /run csharp", ok, f"elapsed={j.get('elapsed_seconds')}s out={j.get('stdout','').strip()[:80]!r}")
    if not ok: print(f"    err={str(j.get('stderr') or j.get('error'))[:200]}")
except Exception as e:
    mark("POST /run csharp", False, f"ex={e}")

# 9. C++ (optional)
try:
    code = "#include <iostream>\nusing namespace std;\nint main() { cout << \"Hello C++!\" << endl; int s=0; for(int i=1;i<=5;i++)s+=i; cout << \"sum1-5=\" << s << endl; return 0; }"
    _, j = http_post("http://localhost:8000/run", {"language": "cpp", "code": code}, t=60)
    ok = j.get("success") and "Hello C++!" in j.get("stdout", "")
    mark("POST /run cpp", ok, f"elapsed={j.get('elapsed_seconds')}s out={j.get('stdout','').strip()[:80]!r}")
    if not ok: print(f"    info={str(j.get('stderr') or j.get('error'))[:120]}")
except Exception as e:
    mark("POST /run cpp", False, f"ex={e}")

# 10. AI chat code review
try:
    _, j = http_post("http://localhost:8000/ai/chat", {
        "message": "请检查这段代码的问题并给出修复建议",
        "language": "py",
        "code": "def foo(x)\n    print x\n    if True:\n        if True:\n            if True:\n                if True:\n                    if True:\n                        pass\n    return zz",
        "history": []
    }, t=25)
    reply = str(j.get("reply", ""))
    ok = len(reply) > 30
    mark("POST /ai/chat code-review", ok, f"reply_len={len(reply)} first120={reply[:120]!r}")
except Exception as e:
    mark("POST /ai/chat code-review", False, f"ex={e}")

# 11. Exercises
try:
    s, b = http_get("http://localhost:8000/exercises", t=10)
    j = json.loads(b) if isinstance(b, str) else b
    cnt = len(j) if isinstance(j, list) else len(j.get("items", [])) if j else 0
    mark("GET /exercises", cnt >= 3, f"items={cnt}")
except Exception as e:
    mark("GET /exercises", False, f"ex={e}")

print("=" * 60)
print("OVERALL:", "✅ ALL CHECKS PASSED" if ok_all else "⚠️  Some checks failed (see above)")
sys.exit(0 if ok_all else 1)
