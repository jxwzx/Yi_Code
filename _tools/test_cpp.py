import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from runtime.manager import MultiLangRuntime

r = MultiLangRuntime()
# 先检测
envs = r.detect_all_runtimes()
print("=== detect ===")
for k, v in envs.items():
    mark = "✅" if v["available"] else "❌"
    print(f"  {mark} {k}: {v.get('version','')[:60]}")

# 测试 C++ 编译执行
print("\n=== C++ run test ===")
code = r'''#include <iostream>
int main(){
    std::cout << "Hello from C++!" << std::endl;
    int s = 0;
    for(int i=1; i<=5; i++) s += i;
    std::cout << "sum1-5=" << s << std::endl;
    return 0;
}'''
result = r.run_code('cpp', code, timeout=30)
import json
print(json.dumps(result, ensure_ascii=False, indent=2))
