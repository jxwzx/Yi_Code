import type { AIMessage, LangKey } from './types'

export function simulateRun(lang: LangKey, code: string): { stdout: string; stderr: string; exitCode: number } {
  const stdout: string[] = []
  const stderr: string[] = []
  // 基于模板的预设输出（仅在离线时使用）
  if (lang === 'py' && code.includes('fibonacci')) {
    stdout.push('斐波那契数列前10项:')
    stdout.push('[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]')
    stdout.push('')
    stdout.push('计算完成！')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'js' && code.includes('bubbleSort')) {
    stdout.push('原数组: [ 64, 34, 25, 12, 22, 11, 90 ]')
    stdout.push('排序后: [ 11, 12, 22, 25, 34, 64, 90 ]')
    stdout.push('查找22的索引: 2')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'cpp' && code.includes('ListNode')) {
    stdout.push('链表: 1 -> 2 -> 3 -> 4 -> 5')
    stdout.push('程序运行成功!')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'java' && code.includes('Student')) {
    stdout.push('班级学生列表:')
    stdout.push('学生 #1: 张三 - 成绩: 92.5')
    stdout.push('学生 #2: 李四 - 成绩: 88.0')
    stdout.push('学生 #3: 王五 - 成绩: 95.3')
    stdout.push('')
    stdout.push('班级平均分: 91.93')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'go' && code.includes('worker')) {
    const order = [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3], [3, 3], [1, 4], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5]]
    for (const [w, j] of order) {
      stdout.push(`Worker ${w} 开始任务 ${j}`)
      stdout.push(`Worker ${w} 完成任务 ${j}`)
    }
    stdout.push('\n结果收集:')
    for (let r of [2, 4, 6, 8, 10]) stdout.push(`-> ${r}`)
    stdout.push('所有任务完成!')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  if (lang === 'cs' && code.includes('Product')) {
    stdout.push('=== 产品列表 ===')
    stdout.push('笔记本电脑     ¥  5999 [电子]')
    stdout.push('4K显示器      ¥  2499 [电子]')
    stdout.push('')
    stdout.push('=== 各类别均价 ===')
    stdout.push(`电子: ¥${((5999 + 2499) / 2).toFixed(2)}`)
    stdout.push(`配件: ¥${((399 + 199 + 499) / 3).toFixed(2)}`)
    stdout.push('')
    stdout.push('数据处理完成!')
    return { stdout: stdout.join('\n'), stderr: '', exitCode: 0 }
  }
  // 默认：尝试简易解析 print/console.log/cout
  try {
    if (lang === 'py') {
      const re = /print\((['"])(.*?)\1\)/g
      let m
      while ((m = re.exec(code)) !== null) stdout.push(m[2])
    } else if (lang === 'js') {
      const re = /console\.log\((['"])(.*?)\1\)/g
      let m
      while ((m = re.exec(code)) !== null) stdout.push(m[2])
    }
    if (stdout.length === 0 && /[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(code)) {
      return { stdout: '', stderr: '', exitCode: 0 }
    }
  } catch { /* skip */ }
  return { stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode: stderr.length ? 1 : 0 }
}

export function buildLocalAIReply(msg: string, code: string, lang: LangKey): AIMessage {
  const lower = msg.toLowerCase()
  // 问题检测
  if (lower.includes('检查') || lower.includes('问题') || lower.includes('错误') || lower.includes('bug')) {
    const issues = detectIssues(code, lang)
    if (issues.length === 0) {
      return {
        role: 'assistant',
        text: `🔍 **代码检查完成！**\n\n我用 **静态分析引擎** 扫描了你的代码，当前没有检测到严重的语法错误或逻辑问题。👍\n\n不过可以注意以下提升点：`,
        issues: [
          { type: 'info' as const, title: '增加类型注解', body: `建议为函数参数和返回值增加类型提示，可让代码更易读并减少 bug。`, fix: `例如: def fibonacci(n: int) -> list[int]:` },
          { type: 'info' as const, title: '补充单元测试', body: `建议配套编写 pytest / JUnit 测试，保证修改代码后不破坏旧逻辑。`, fix: `测试覆盖率建议 >= 80%` },
        ],
      }
    }
    return {
      role: 'assistant',
      text: `🔍 **代码检查发现 ${issues.length} 个问题：**\n\n请查看下方卡片，点击「修复建议」可查看解决方案。如果还有疑问，请随时问我！`,
      issues,
    }
  }
  if (lower.includes('优化') || lower.includes('改进') || lower.includes('更好')) {
    return {
      role: 'assistant',
      text: `💡 **代码优化建议：**\n\n针对你当前的实现，我有以下 3 条具体的优化建议：`,
      issues: [
        { type: 'warning' as const, title: '时间复杂度可优化', body: '当前实现使用了双重循环，时间复杂度为 O(n²)，对于大数据量性能较差。', fix: '可尝试使用哈希表（字典）将查询优化到 O(1)，整体复杂度降为 O(n)。' },
        { type: 'warning' as const, title: '缺少异常处理', body: '关键函数未处理边界输入（空值、负数、超大数值），可能导致未预期崩溃。', fix: '增加 try-catch / if-else 防御式判断，对非法输入给出友好提示。' },
        { type: 'info' as const, title: '代码风格', body: '部分命名可读性不足，且缺少函数级文档注释，团队协作时成本较高。', fix: '遵循 PEP8 / Google Style Guide，为函数添加 docstring 说明功能、参数、返回值。' },
      ],
    }
  }
  if (lower.includes('解释') || lower.includes('什么') || lower.includes('讲解') || lower.includes('流程')) {
    return {
      role: 'assistant',
      text: `📚 **代码逻辑讲解：**\n\n让我一步步带你理解这段代码的执行流程：\n\n1. **函数定义阶段**：程序首先读取函数定义（如 fibonacci / bubbleSort 等），此时不执行函数体，只是把签名注册到命名空间。\n\n2. **入口调用阶段**：到达 main 部分时，程序开始依次执行语句，例如调用函数、打印输出。\n\n3. **核心循环阶段**：进入 for / while 循环，根据条件重复执行语句块；这是算法真正发挥作用的地方。\n\n4. **结果返回阶段**：函数执行完毕，把结果返回给调用者，由 print 输出到控制台。\n\n💡 **建议**：点击左侧「代码流程图」标签，可可视化整个执行过程！`,
    }
  }
  if (lower.includes('递归')) {
    return {
      role: 'assistant',
      text: `📚 **什么是递归？**\n\n**递归（Recursion）** 就是「函数自己调用自己」的编程技巧。就像俄罗斯套娃：打开一个娃娃，里面还有个同款娃娃，直到最小的那个（基线条件）为止。\n\n递归必须包含两个核心要素：\n\n• **基线条件 (Base Case)**：不再递归、直接返回答案的边界情况，防止无限循环。\n• **递归条件 (Recursive Case)**：把大问题分解成「更小的同类问题」，调用自身解决。\n\n**🌰 举个栗子：计算阶乘 n!**\n\n\`\`\`python\ndef factorial(n):\n    if n <= 1:          # 基线条件\n        return 1\n    return n * factorial(n - 1)  # 递归：n! = n × (n-1)!\n\`\`\`\n\n执行 factorial(5) = 5 × 4 × 3 × 2 × 1 = 120 ✅`,
    }
  }
  if (lower.includes('路线') || lower.includes('零基础') || lower.includes('学习计划')) {
    return {
      role: 'assistant',
      text: `🚀 **Python 零基础学习路线（5个核心阶段）：**\n\n**① 语法基础（1-2 周）**\n• 变量、数据类型（int/float/str/list/dict）\n• 条件判断 if/else、循环 for/while\n• 函数定义与参数\n\n**② 进阶特性（2-3 周）**\n• 面向对象：class、继承、多态\n• 文件读写、异常处理 try/except\n• 模块与包 import\n\n**③ 算法与数据结构（3-4 周）** ⭐重中之重\n• 数组、链表、栈、队列、哈希表\n• 排序（冒泡/快排/归并）、搜索（二分）\n• 时间复杂度 O() 分析\n\n**④ 常用库实践（2-3 周）**\n• requests (网络) + BeautifulSoup (爬虫)\n• pandas/numpy (数据分析)\n• Flask/FastAPI (后端开发)\n\n**⑤ 项目实战（持续进行）**\n• 个人博客系统、爬虫、命令行工具、GUI 桌面应用\n• 建议加入 YiCode 「协作频道」组队开发！\n\n加油 💪 有具体问题随时问我～`,
    }
  }
  if (lower.includes('考点') || lower.includes('复习') || lower.includes('期末') || lower.includes('考试')) {
    return {
      role: 'assistant',
      text: `📝 **「数据结构与算法」期末考试 10 大高频考点：**\n\n**数据结构部分：**\n1. 线性表（顺序表 vs 链表）的插入删除查找效率对比\n2. 栈（Stack）「后进先出」应用：括号匹配、表达式求值\n3. 队列（Queue）「先进先出」应用：广度优先搜索 BFS\n4. 二叉树：前序/中序/后序/层序遍历、平衡树 AVL\n5. 哈希表：冲突解决（链地址法/开放寻址法）、装载因子\n\n**算法部分：**\n6. 排序算法：冒泡/选择/插入/快排/归并/堆排 → 时间/空间复杂度、稳定性\n7. 查找：二分查找（必须手写！）、哈希查找\n8. 图论：DFS/BFS 遍历、最短路径 Dijkstra\n9. 动态规划 DP：背包问题、最长子序列 LCS、状态转移方程\n10. 贪心思想：活动选择、哈夫曼编码\n\n💡 **建议**：在 YiCode「代码实验室」里对每个考点手写 3 遍，并画「流程图」验证思路！祝你考试顺利 🎯`,
    }
  }
  if (lower.includes('竞赛') || lower.includes('刷题') || lower.includes('acm') || lower.includes('ac')) {
    return {
      role: 'assistant',
      text: `🏆 **ACM/蓝桥杯 竞赛刷题计划建议：**\n\n**第一阶段：夯实基础 (4-6 周)**\n• 语言：C++（首选，STL 强大）/ Python / Java 任选一种打透\n• 每日 2-3 题：Luogu / 洛谷入门区 + LeetCode Easy\n• 重点：输入输出、字符串处理、STL(vector/map/set/queue/stack)\n\n**第二阶段：专题突破 (8-10 周)**\n按专题逐个攻克，每个专题至少 10 题：\n• 二分/双指针 · 排序与贪心 · DFS/BFS 搜索\n• DP (线性/区间/树形/状态压缩) · 并查集 · 最短路\n• 最小生成树 · 树链剖分 · 数论 (GCD/快速幂/筛法)\n\n**第三阶段：模拟赛 (4 周)**\n• 每周参加 Codeforces Div.3 / Div.2 / AtCoder Beginner\n• 赛后必须「补题」：独立写出未通过的题目 + 写题解\n• 加入 YiCode 「协作频道」组队交流，互相 Review 代码\n\n**🎯 每日节奏：**\n• 上午 1h 学习/复习算法模板\n• 下午 2h 集中刷题\n• 晚上 1h 写题解 + 看同学代码学习\n\n坚持 3 个月，省赛/校赛拿奖完全没问题！加油 🌟`,
    }
  }
  // 默认
  return {
    role: 'assistant',
    text: `✨ **已收到你的问题！**\n\n我正在分析你的提问，这里是一些通用建议：\n\n• 如果是**代码报错**，请把完整的错误信息和代码一起发给我，我可以精准定位。\n• 如果是**不懂的知识点**，可以问我「解释 XX」「举个例子说明 XX」。\n• 如果是**代码优化需求**，点击快捷操作「优化代码建议」可获得更详细的反馈。\n\n想让我帮你做什么？可以直接点击上方的快捷按钮，或继续向我描述你的目标～`,
  }
}

export function detectIssues(code: string, lang: LangKey): NonNullable<AIMessage['issues']> {
  const issues: NonNullable<AIMessage['issues']> = []
  const lines = code.split('\n')

  if (lang === 'py') {
    // 缩进问题：tab/space 混用
    const hasTab = lines.some(l => l.startsWith('\t'))
    const hasSpace = lines.some(l => /^    +/.test(l))
    if (hasTab && hasSpace) {
      issues.push({ type: 'error', title: '缩进混用 Tab / Space', body: '检测到代码同时使用了 Tab 和空格缩进，Python 对缩进敏感，会抛出 IndentationError。', fix: '请统一使用 4 空格缩进（绝大多数编辑器可设置 Tab 自动转空格）。' })
    }
    // print 括号 (Python3 必须)
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*print\s+[^(]/.test(lines[i])) {
        issues.push({ type: 'error', title: `第 ${i + 1} 行: print 缺少括号`, body: 'Python3 中 print 是函数，必须使用 print(...) 形式，否则会报 SyntaxError。', fix: '改为 print("要输出的内容")' })
        break
      }
    }
    // 变量未初始化直接使用（简单启发式）
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('==') && /if\s+\w+\s*==/.test(lines[i])) {
        const m = lines[i].match(/if\s+(\w+)\s*==/)
        if (m) {
          const name = m[1]
          const foundBefore = lines.slice(0, i).some(l => new RegExp(`${name}\\s*=`).test(l))
          if (!foundBefore && !['True', 'False', 'None', 'self', '__name__'].includes(name)) {
            issues.push({ type: 'warning', title: `第 ${i + 1} 行: 变量 ${name} 可能未定义`, body: `在条件判断中使用了 ${name}，但前面未检测到赋值，运行时可能 NameError。`, fix: `在前面为 ${name} 赋初始值，例如 ${name} = 0。` })
            break
          }
        }
      }
    }
  }
  if (lang === 'cpp') {
    // 缺少 return 0
    if (code.includes('int main') && !/return\s+0/.test(code)) {
      issues.push({ type: 'warning', title: 'main 函数缺少 return 0', body: '标准要求 main 函数返回 int，建议显式返回 0 表示正常退出。', fix: '在 main 末尾添加 return 0;' })
    }
    // 忘记 delete (new 过但没 delete)
    const news = code.match(/new\s+\w+/g) || []
    const deletes = (code.match(/delete\s+[\w[\]]+/g) || []).length
    if (news.length > deletes) {
      issues.push({ type: 'warning', title: `内存泄漏风险`, body: `检测到 ${news.length} 处 new，但 delete 只有 ${deletes} 处，可能有堆内存未释放。`, fix: '确保每个 new 对应一个 delete，或改用智能指针 std::unique_ptr。' })
    }
  }
  if (lang === 'java') {
    if (code.includes('public static void main') && !code.includes('String[] args')) {
      issues.push({ type: 'error', title: 'main 方法签名错误', body: 'Java main 方法签名必须是 public static void main(String[] args)，否则无法启动。', fix: '补全参数 String[] args' })
    }
  }
  if (lang === 'js') {
    for (let i = 0; i < lines.length; i++) {
      if (/==[^=]/.test(lines[i]) && !/===/.test(lines[i])) {
        issues.push({ type: 'warning', title: `第 ${i + 1} 行: 使用 == 而非 ===`, body: 'JavaScript 的 == 会做隐式类型转换，容易产生难以调试的 bug (如 [] == false 为 true)。', fix: '始终使用 === 做严格相等比较。' })
        break
      }
    }
  }
  // 通用：超大嵌套 for 循环
  let maxNest = 0, nest = 0
  for (const l of lines) {
    const opens = (l.match(/\{|for\s*\(|while\s*\(/g) || []).length
    const closes = (l.match(/\}/g) || []).length
    nest = Math.max(0, nest + opens - closes)
    maxNest = Math.max(maxNest, nest)
  }
  if (maxNest >= 4) {
    issues.push({ type: 'info', title: `嵌套层级过深 (${maxNest} 层)`, body: '过深的嵌套会降低可读性、增加出错概率，建议使用「卫语句」或提取子函数降低层数。', fix: '提前 return / 抽出 helper function / 使用策略模式。' })
  }
  return issues
}

