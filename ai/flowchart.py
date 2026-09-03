"""
YiCode 代码流程图生成器
通过静态分析代码结构（if/else/for/while/func/return）生成 Mermaid 流程图。
支持 Python / JavaScript / C++ / Java / Go / C#
"""
import re
from typing import List, Dict, Tuple, Optional


def _detect_language(code: str) -> str:
    """根据代码特征检测语言"""
    if re.search(r'\bdef\s+\w+\s*\(', code) or re.search(r'\bprint\s*\(', code):
        return "py"
    if re.search(r'\bfunc\s+\w+\s*\(', code) or re.search(r'\bpackage\s+main\b', code):
        return "go"
    if re.search(r'\bpublic\s+(static\s+)?(void|int|String|class)\b', code) or re.search(r'\bSystem\.out\b', code):
        return "java"
    if re.search(r'\busing\s+System\b', code) or re.search(r'\bConsole\.(Write|ReadLine)', code):
        return "cs"
    if re.search(r'\b#include\b', code) or re.search(r'\bcout\s*<<', code):
        return "cpp"
    if re.search(r'\bconsole\.log\b', code) or re.search(r'\bfunction\s+\w+\s*\(', code):
        return "js"
    return "py"


def _get_indent(line: str) -> int:
    """获取行的缩进数（tab=4, space=1）"""
    count = 0
    for ch in line:
        if ch == ' ':
            count += 1
        elif ch == '\t':
            count += 4
        else:
            break
    return count


def _strip_comment(line: str) -> str:
    """去除行内注释"""
    for marker in ['//', '#']:
        idx = line.find(marker)
        if idx >= 0:
            # 检查是否在字符串内（简化处理）
            before = line[:idx]
            if before.count('"') % 2 == 0 and before.count("'") % 2 == 0:
                line = before
    return line.rstrip()


def _is_block_keyword(line: str, keyword: str) -> bool:
    """检查行是否包含某个控制结构关键字"""
    patterns = {
        'if': r'\bif\b\s*[\(\[]?\s*\w',
        'elif': r'\b(elif|else\s+if)\b',
        'else': r'^\s*\}?\s*else\b\s*[:{]?\s*$',
        'for': r'\bfor\b\s*[\(\[]?\s*\w',
        'while': r'\bwhile\b\s*[\(\[]?\s*\w',
        'do': r'\bdo\s*\{',
        'switch': r'\bswitch\b\s*[\(\[]?',
        'case': r'\bcase\s+',
        'return': r'\breturn\b',
        'break': r'\bbreak\b',
        'continue': r'\bcontinue\b',
        'func_def': r'\b(def|function|func|void|int|double|float|bool|boolean|static|public|private|protected)\s+[\w]+\s*[\(\[]',
    }
    pat = patterns.get(keyword, '')
    if not pat:
        return False
    return bool(re.search(pat, line))


def _extract_condition(line: str, keyword: str) -> str:
    """从代码行中提取条件表达式"""
    # 去除关键字
    cleaned = re.sub(r'\b(if|elif|else if|for|while|switch|case)\b', '', line, count=1)
    # 去除括号和花括号
    cleaned = re.sub(r'[\(\)\{\}\[\]]', ' ', cleaned)
    # 去除语言特定符号
    cleaned = re.sub(r'[:;]', '', cleaned)
    # 去除范围/迭代语法 (Python: in range, Go: :=, Java: :)
    cleaned = re.sub(r'\bin\b', ' in ', cleaned)
    cleaned = cleaned.strip()
    # 截断过长的条件
    if len(cleaned) > 50:
        cleaned = cleaned[:47] + '...'
    return cleaned if cleaned else '条件'


def _extract_func_name(line: str) -> str:
    """提取函数名"""
    # Python: def func_name(...)
    m = re.search(r'\bdef\s+(\w+)', line)
    if m:
        return m.group(1)
    # JS: function funcName(...)
    m = re.search(r'\bfunction\s+(\w+)', line)
    if m:
        return m.group(1)
    # Go: func funcName(...)
    m = re.search(r'\bfunc\s+(\w+)', line)
    if m:
        return m.group(1)
    # Java/C++/C#: returnType funcName(...)
    m = re.search(r'\b(?:void|int|double|float|bool|boolean|static|public|private|protected|String|char|long|short|unsigned)\s+(?:static\s+)?(\w+)\s*\(', line)
    if m:
        return m.group(1)
    return 'main'


def generate_flowchart(code: str, language: str = "auto") -> Dict:
    """
    分析代码结构，生成 Mermaid 流程图。
    返回: {"mermaid": "flowchart TD\n...", "nodes": [...], "stats": {...}}
    """
    if language == "auto":
        language = _detect_language(code)

    lines = code.split('\n')
    nodes = []  # [(id, label, shape, indent, line_num)]
    edges = []  # [(from_id, to_id, label)]
    node_counter = [0]

    def new_id():
        node_counter[0] += 1
        return f"N{node_counter[0]}"

    def add_node(label: str, shape: str = 'rect', indent: int = 0, line_num: int = 0) -> str:
        nid = new_id()
        # 用双引号包裹标签支持特殊字符（>=, <, (), # 等）
        # 只需去除双引号本身防止语法冲突
        safe_label = label.replace('"', "'")
        nodes.append((nid, safe_label, shape, indent, line_num))
        return nid

    # 1. 开始节点
    start_id = add_node('开始', 'rounded', 0, 0)
    prev_id = start_id
    # 栈：管理 if/for/while 等块的入口和出口
    block_stack = []  # [(block_type, entry_id, exit_id, merge_id)]

    # 预扫描：找函数定义
    func_name = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith('//') or stripped.startswith('#') or stripped.startswith('/*'):
            continue
        if _is_block_keyword(stripped, 'func_def'):
            func_name = _extract_func_name(stripped)
            break

    # 2. 遍历代码行
    for i, raw_line in enumerate(lines):
        line = _strip_comment(raw_line)
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith('//') or stripped.startswith('#') or stripped.startswith('/*') or stripped.startswith('*'):
            continue
        if stripped in ['{', '}', '});', '});', 'end', '};']:
            if stripped in ['}', '});', '});', '};']:
                if block_stack:
                    btype, entry, exit_node, merge = block_stack.pop()
                    if merge:
                        prev_id = merge
            continue

        indent = _get_indent(raw_line)

        # 函数定义行
        if _is_block_keyword(stripped, 'func_def') and i < 20:
            fname = _extract_func_name(stripped)
            fid = add_node(f'函数: {fname}()', 'rect', indent, i + 1)
            edges.append((prev_id, fid, ''))
            prev_id = fid
            continue

        # if 语句
        if _is_block_keyword(stripped, 'if'):
            cond = _extract_condition(stripped, 'if')
            if_id = add_node(f'{cond}?', 'diamond', indent, i + 1)
            edges.append((prev_id, if_id, ''))
            # 预创建 merge 节点（稍后连接）
            merge_id = None
            block_stack.append(('if', if_id, None, merge_id))
            prev_id = if_id
            # True 分支入口（下一行）
            true_id = new_id()
            nodes.append((true_id, 'True 分支', 'rect', indent + 4, i + 1))
            edges.append((if_id, true_id, '是'))
            prev_id = true_id
            continue

        # elif / else if
        if _is_block_keyword(stripped, 'elif'):
            cond = _extract_condition(stripped, 'elif')
            elif_id = add_node(f'{cond}?', 'diamond', indent, i + 1)
            if block_stack:
                btype, entry, _, _ = block_stack[-1]
                edges.append((entry, elif_id, '否'))
            # True 分支
            true_id = new_id()
            nodes.append((true_id, 'True 分支', 'rect', indent + 4, i + 1))
            edges.append((elif_id, true_id, '是'))
            prev_id = true_id
            block_stack[-1] = ('elif', elif_id, None, None)
            continue

        # else
        if _is_block_keyword(stripped, 'else'):
            if block_stack:
                btype, entry, _, _ = block_stack[-1]
                else_id = add_node('False 分支', 'rect', indent + 4, i + 1)
                edges.append((entry, else_id, '否'))
                prev_id = else_id
            continue

        # for 循环
        if _is_block_keyword(stripped, 'for'):
            cond = _extract_condition(stripped, 'for')
            loop_id = add_node(f'循环: {cond}', 'diamond', indent, i + 1)
            edges.append((prev_id, loop_id, ''))
            body_id = new_id()
            nodes.append((body_id, '循环体', 'rect', indent + 4, i + 1))
            edges.append((loop_id, body_id, '执行'))
            edges.append((body_id, loop_id, '下一轮'))  # 回环
            block_stack.append(('for', loop_id, loop_id, loop_id))
            prev_id = body_id
            continue

        # while 循环
        if _is_block_keyword(stripped, 'while'):
            cond = _extract_condition(stripped, 'while')
            loop_id = add_node(f'当 {cond}?', 'diamond', indent, i + 1)
            edges.append((prev_id, loop_id, ''))
            body_id = new_id()
            nodes.append((body_id, '循环体', 'rect', indent + 4, i + 1))
            edges.append((loop_id, body_id, '是'))
            edges.append((body_id, loop_id, '下一轮'))  # 回环
            block_stack.append(('while', loop_id, loop_id, loop_id))
            prev_id = body_id
            continue

        # switch/case
        if _is_block_keyword(stripped, 'switch'):
            cond = _extract_condition(stripped, 'switch')
            sw_id = add_node(f'switch({cond})', 'diamond', indent, i + 1)
            edges.append((prev_id, sw_id, ''))
            block_stack.append(('switch', sw_id, None, None))
            prev_id = sw_id
            continue

        if _is_block_keyword(stripped, 'case'):
            case_val = stripped.replace('case', '').replace(':', '').strip()
            case_id = add_node(f'case {case_val}', 'rect', indent, i + 1)
            if block_stack:
                btype, entry, _, _ = block_stack[-1]
                edges.append((entry, case_id, ''))
            prev_id = case_id
            continue

        # return 语句
        if _is_block_keyword(stripped, 'return'):
            ret = stripped.replace('return', '').replace(';', '').strip()
            ret_label = f'返回 {ret}' if ret else '返回'
            ret_id = add_node(ret_label, 'rect', indent, i + 1)
            edges.append((prev_id, ret_id, ''))
            end_id = add_node('结束', 'rounded', 0, i + 1)
            edges.append((ret_id, end_id, ''))
            prev_id = end_id
            continue

        # break
        if _is_block_keyword(stripped, 'break'):
            brk_id = add_node('break 跳出循环', 'rect', indent, i + 1)
            edges.append((prev_id, brk_id, ''))
            if block_stack:
                btype, entry, exit_node, merge = block_stack[-1]
                if merge:
                    edges.append((brk_id, merge, ''))
            prev_id = brk_id
            continue

        # continue
        if _is_block_keyword(stripped, 'continue'):
            cnt_id = add_node('continue 进入下一轮', 'rect', indent, i + 1)
            edges.append((prev_id, cnt_id, ''))
            if block_stack:
                btype, entry, exit_node, merge = block_stack[-1]
                if entry:
                    edges.append((cnt_id, entry, ''))
            prev_id = cnt_id
            continue

        # 普通语句（赋值、调用等）
        # 截断过长的语句
        stmt = stripped.rstrip(';')
        if len(stmt) > 40:
            stmt = stmt[:37] + '...'
        stmt_id = add_node(stmt, 'rect', indent, i + 1)
        edges.append((prev_id, stmt_id, ''))
        prev_id = stmt_id

    # 3. 结束节点（如果还没有）
    # 检查是否已有结束节点
    has_end = any(n[1] == '结束' for n in nodes)
    if not has_end:
        end_id = add_node('结束', 'rounded', 0, len(lines))
        edges.append((prev_id, end_id, ''))

    # 4. 生成 Mermaid 语法
    mermaid = "flowchart TD\n"

    # 添加节点定义（用双引号包裹标签，支持特殊字符如 >= < > 等）
    for nid, label, shape, _, _ in nodes:
        if shape == 'rounded':
            mermaid += f'    {nid}(["{label}"])\n'
        elif shape == 'diamond':
            mermaid += f'    {nid}{{"{label}"}}\n'
        elif shape == 'rect':
            mermaid += f'    {nid}["{label}"]\n'

    # 添加边
    for from_id, to_id, label in edges:
        if label:
            safe = label.replace('"', "'")
            mermaid += f'    {from_id} -->|{safe}| {to_id}\n'
        else:
            mermaid += f'    {from_id} --> {to_id}\n'

    # 5. 统计信息
    stats = {
        "language": language,
        "total_lines": len(lines),
        "nodes": len(nodes),
        "edges": len(edges),
        "has_branch": any(n[2] == 'diamond' for n in nodes),
        "has_loop": any(b[0] in ('for', 'while') for b in block_stack) or '循环' in mermaid,
    }

    return {"mermaid": mermaid, "nodes": len(nodes), "edges": len(edges), "stats": stats}
