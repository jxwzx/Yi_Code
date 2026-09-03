# YiCode SQLite 数据库模块
"""
用户信息、编码课程、章节、练习题、学习进度、学习任务、活动记录的持久化存储。
课程章节引用外部教学网站（菜鸟编程、W3Schools、MDN 等）。
"""
import sqlite3
import hashlib
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

DB_PATH = str(Path(__file__).resolve().parents[2] / "data" / "yicode.db")


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_db() -> sqlite3.Connection:
    """获取数据库连接（行工厂为 dict）"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """建表 + 填充初始数据"""
    conn = get_db()
    cur = conn.cursor()

    # ========== 建表 ==========
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email       TEXT,
        avatar      TEXT DEFAULT '我',
        level       INTEGER DEFAULT 1,
        xp          INTEGER DEFAULT 0,
        streak_days INTEGER DEFAULT 1,
        role        TEXT DEFAULT 'student',   -- student / admin / super_admin
        target_id   TEXT,                      -- 000(超管) / 001/002...(管理员) / NULL(学生)
        created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS courses (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        title         TEXT NOT NULL,
        description   TEXT,
        language      TEXT NOT NULL,    -- py/js/cpp/java/go/cs/mixed
        difficulty    TEXT DEFAULT '入门', -- 入门/简单/中等/困难/进阶
        category      TEXT DEFAULT '编程基础',
        icon          TEXT DEFAULT 'fa-code',
        color         TEXT DEFAULT '#6366f1',
        instructor    TEXT DEFAULT 'YiCode 教研组',
        student_count INTEGER DEFAULT 0,
        sort_order    INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS lessons (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        summary       TEXT,              -- 章节摘要
        content       TEXT,              -- 正文 Markdown（可空，靠外部链接）
        external_url  TEXT,              -- 外部教程链接
        external_site TEXT,              -- 来源站点名: 菜鸟编程/W3Schools/MDN/廖雪峰/GeeksforGeeks
        order_num     INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS exercises (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id     INTEGER REFERENCES courses(id) ON DELETE SET NULL,
        title         TEXT NOT NULL,
        description   TEXT,
        difficulty    TEXT DEFAULT '简单',  -- 简单/中等/困难
        language      TEXT DEFAULT 'py',
        starter_code  TEXT,
        solution      TEXT,
        accept_rate   REAL DEFAULT 0.0,
        tags          TEXT,              -- 逗号分隔标签
        created_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS learning_progress (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        progress_pct  INTEGER DEFAULT 0,
        last_lesson_id INTEGER REFERENCES lessons(id),
        last_accessed TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS study_tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        completed   INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS activities (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        TEXT,               -- code/learn/achieve/social
        description TEXT,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rank_num    INTEGER,
        xp          INTEGER,
        updated_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS code_drafts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_id   INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
        language      TEXT NOT NULL,
        code          TEXT NOT NULL,
        exercise_title TEXT,
        updated_at    TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, exercise_id)
    );
    """)

    # ========== 迁移：为旧库添加 role / target_id 列 ==========
    try:
        cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN target_id TEXT")
    except Exception:
        pass

    # 迁移：如果没有超管，把第一个用户设为超管(target_id=000)
    if cur.execute("SELECT COUNT(*) FROM users WHERE role = 'super_admin'").fetchone()[0] == 0:
        first_id = cur.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
        if first_id:
            cur.execute("UPDATE users SET role='super_admin', target_id='000' WHERE id=?", (first_id[0],))

    # ========== 填充初始数据（仅在空库时） ==========
    if cur.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        _seed_users(cur)
    if cur.execute("SELECT COUNT(*) FROM courses").fetchone()[0] == 0:
        _seed_courses(cur)
    if cur.execute("SELECT COUNT(*) FROM exercises").fetchone()[0] == 0:
        _seed_exercises(cur)
    if cur.execute("SELECT COUNT(*) FROM study_tasks").fetchone()[0] == 0:
        _seed_tasks(cur)
    if cur.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 0:
        _seed_activities(cur)

    conn.commit()
    conn.close()


# ========== 初始数据填充 ==========

def _seed_users(cur):
    """初始用户：1 个超级管理员(000) + 5 个排行榜学生用户"""
    users = [
        ("编程学习者", "123456", "我", 7, 2840, 12, "super_admin", "000"),
        ("算法达人", "abc123", "算", 9, 4520, 20, "student", None),
        ("Python女神", "abc123", "Py", 8, 3850, 15, "student", None),
        ("全栈工程师", "abc123", "全", 10, 6120, 30, "student", None),
        ("C语言大师", "abc123", "C", 6, 2100, 8, "student", None),
        ("Go语言新星", "abc123", "Go", 5, 1800, 5, "student", None),
    ]
    for name, pwd, avatar, lv, xp, streak, role, target_id in users:
        cur.execute(
            "INSERT INTO users (username, password_hash, avatar, level, xp, streak_days, role, target_id) VALUES (?,?,?,?,?,?,?,?)",
            (name, _hash_password(pwd), avatar, lv, xp, streak, role, target_id),
        )

    # 排行榜
    for i, (name, _, _, _, xp, _) in enumerate([(u[0], u[1], u[2], u[3], u[4], u[5]) for u in users], 1):
        cur.execute(
            "INSERT INTO leaderboard (user_id, rank_num, xp) VALUES ((SELECT id FROM users WHERE username=?), ?, ?)",
            (name, i, xp),
        )


def _seed_courses(cur):
    """初始课程：6 大语言课程，每门引用菜鸟编程等外部教程"""

    courses = [
        {
            "title": "Python 入门到实战",
            "description": "从 print() 到 Web 爬虫，Python 编程全方位入门。结合菜鸟编程教程 + W3Schools 实操。",
            "language": "py", "difficulty": "入门", "category": "编程基础",
            "icon": "fa-python", "color": "#3776ab", "instructor": "YiCode 教研组",
            "student_count": 156, "sort_order": 1,
        },
        {
            "title": "JavaScript 前端开发",
            "description": "从 ES6 语法到 DOM 操作，打造交互式网页。引用 MDN Web Docs + 菜鸟编程 JS 教程。",
            "language": "js", "difficulty": "入门", "category": "前端开发",
            "icon": "fa-js-square", "color": "#f7df1e", "instructor": "YiCode 教研组",
            "student_count": 128, "sort_order": 2,
        },
        {
            "title": "C++ 数据结构与算法",
            "description": "从指针到 STL，深入理解内存模型与算法复杂度。引用菜鸟编程 C++ 教程 + GeeksforGeeks。",
            "language": "cpp", "difficulty": "中等", "category": "计算机基础",
            "icon": "fa-cplusplus", "color": "#00599c", "instructor": "陈教练",
            "student_count": 89, "sort_order": 3,
        },
        {
            "title": "Java 面向对象编程",
            "description": "从类与对象到设计模式，掌握企业级 Java 开发基础。引用菜鸟编程 Java 教程。",
            "language": "java", "difficulty": "中等", "category": "后端开发",
            "icon": "fa-java", "color": "#ed8b00", "instructor": "李老师",
            "student_count": 112, "sort_order": 4,
        },
        {
            "title": "Go 并发编程",
            "description": "Goroutine、Channel、Context，掌握云原生时代的并发利器。引用 Go 官方 Tour + 菜鸟编程。",
            "language": "go", "difficulty": "中等", "category": "后端开发",
            "icon": "fa-golang", "color": "#00add8", "instructor": "YiCode 教研组",
            "student_count": 45, "sort_order": 5,
        },
        {
            "title": "C# 与 .NET 全栈",
            "description": "从 LINQ 到 ASP.NET Core，一网打尽微软生态。引用微软官方文档 + 菜鸟编程。",
            "language": "cs", "difficulty": "中等", "category": "后端开发",
            "icon": "fa-hashtag", "color": "#178600", "instructor": "YiCode 教研组",
            "student_count": 38, "sort_order": 6,
        },
    ]
    for c in courses:
        cur.execute(
            """INSERT INTO courses
               (title, description, language, difficulty, category, icon, color, instructor, student_count, sort_order)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (c["title"], c["description"], c["language"], c["difficulty"], c["category"],
             c["icon"], c["color"], c["instructor"], c["student_count"], c["sort_order"]),
        )

    # ====== 每门课程的章节（引用外部教程） ======
    # Python 课程 (course_id=1)
    py_lessons = [
        ("Python 环境搭建", "安装 Python 3 解释器与 pip 包管理器", None, "https://www.runoob.com/python3/python3-install.html", "菜鸟编程", 1),
        ("Python 基础语法", "变量、数据类型、运算符、字符串操作", "print('Hello World') 是每个程序员的起点", "https://www.runoob.com/python3/python3-syntax.html", "菜鸟编程", 2),
        ("Python 条件与循环", "if-elif-else 分支结构、for/while 循环", "掌握控制流是编程的基础", "https://www.runoob.com/python3/python3-loop.html", "菜鸟编程", 3),
        ("Python 函数与 Lambda", "def 定义函数、参数传递、返回值、匿名函数", "函数是代码复用的核心机制", "https://www.runoob.com/python3/python3-function.html", "菜鸟编程", 4),
        ("Python 数据结构", "列表、元组、字典、集合的使用方法", None, "https://www.runoob.com/python3/python3-data-structure.html", "菜鸟编程", 5),
        ("Python 文件 I/O", "文件读写、with 语句、JSON 处理", None, "https://www.runoob.com/python3/python3-file-io.html", "菜鸟编程", 6),
        ("Python 面向对象", "类、继承、多态、魔术方法", None, "https://www.runoob.com/python3/python3-class.html", "菜鸟编程", 7),
        ("Python 异常处理", "try-except-finally、自定义异常", None, "https://www.runoob.com/python3/python3-errors-execptions.html", "菜鸟编程", 8),
        ("Python 模块与包", "import 机制、pip 安装第三方库", None, "https://www.runoob.com/python3/python3-module.html", "菜鸟编程", 9),
        ("Python 进阶：装饰器与生成器", "decorator、yield、协程入门", None, "https://www.liaoxuefeng.com/wiki/1016959663602400/1017451632270144", "廖雪峰", 10),
    ]
    for title, summary, content, url, site, order in py_lessons:
        cur.execute(
            "INSERT INTO lessons (course_id, title, summary, content, external_url, external_site, order_num) VALUES (1,?,?,?,?,?,?)",
            (title, summary, content, url, site, order),
        )

    # JavaScript 课程 (course_id=2)
    js_lessons = [
        ("JS 简介与引入方式", "在 HTML 中使用 script 标签，内联 vs 外链", None, "https://www.runoob.com/js/js-intro.html", "菜鸟编程", 1),
        ("JS 基础语法", "变量(let/const)、数据类型、运算符", None, "https://www.runoob.com/js/js-syntax.html", "菜鸟编程", 2),
        ("JS 条件与循环", "if-else、switch、for、while、break/continue", None, "https://www.runoob.com/js/js-if-else.html", "菜鸟编程", 3),
        ("JS 函数", "函数声明、箭头函数、闭包、回调", None, "https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Functions", "MDN", 4),
        ("JS 数组与对象", "Array 方法、Object 操作、解构赋值", None, "https://www.runoob.com/js/js-arrays.html", "菜鸟编程", 5),
        ("DOM 操作", "getElementById、事件监听、动态修改 HTML", None, "https://www.runoob.com/js/js-htmldom.html", "菜鸟编程", 6),
        ("ES6+ 新特性", "模板字符串、Promise、async/await、模块化", None, "https://www.w3schools.com/js/js_es6.asp", "W3Schools", 7),
        ("JS 异步编程", "Promise 链、async/await、fetch API", None, "https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Using_promises", "MDN", 8),
    ]
    for title, summary, content, url, site, order in js_lessons:
        cur.execute(
            "INSERT INTO lessons (course_id, title, summary, content, external_url, external_site, order_num) VALUES (2,?,?,?,?,?,?)",
            (title, summary, content, url, site, order),
        )

    # C++ 课程 (course_id=3)
    cpp_lessons = [
        ("C++ 环境与第一个程序", "g++ 编译器、#include、main 函数", "#include <iostream> 是 C++ 的 Hello World", "https://www.runoob.com/cplusplus/cpp-environment-setup.html", "菜鸟编程", 1),
        ("C++ 基本语法", "变量、数据类型、运算符、cin/cout", None, "https://www.runoob.com/cplusplus/cpp-basic-syntax.html", "菜鸟编程", 2),
        ("C++ 条件与循环", "if-else、switch、for、while", None, "https://www.runoob.com/cplusplus/cpp-decision.html", "菜鸟编程", 3),
        ("C++ 函数", "函数定义、参数传递（值/引用）、函数重载", None, "https://www.runoob.com/cplusplus/cpp-functions.html", "菜鸟编程", 4),
        ("C++ 数组与字符串", "一维/多维数组、string 类", None, "https://www.runoob.com/cplusplus/cpp-arrays.html", "菜鸟编程", 5),
        ("C++ 指针与引用", "指针概念、指针运算、引用 vs 指针", "指针是 C++ 的核心也是难点", "https://www.runoob.com/cplusplus/cpp-pointers.html", "菜鸟编程", 6),
        ("C++ 面向对象", "类、构造/析构函数、继承、多态、虚函数", None, "https://www.runoob.com/cplusplus/cpp-classes-objects.html", "菜鸟编程", 7),
        ("STL 标准模板库", "vector、map、set、algorithm、迭代器", None, "https://www.geeksforgeeks.org/the-c-standard-template-library-stl/", "GeeksforGeeks", 8),
        ("C++ 内存管理", "new/delete、智能指针 unique_ptr/shared_ptr", None, "https://www.runoob.com/cplusplus/cpp-dynamic-memory.html", "菜鸟编程", 9),
    ]
    for title, summary, content, url, site, order in cpp_lessons:
        cur.execute(
            "INSERT INTO lessons (course_id, title, summary, content, external_url, external_site, order_num) VALUES (3,?,?,?,?,?,?)",
            (title, summary, content, url, site, order),
        )

    # Java 课程 (course_id=4)
    java_lessons = [
        ("Java 环境搭建", "JDK 安装、javac 编译、java 运行", None, "https://www.runoob.com/java/java-environment-setup.html", "菜鸟编程", 1),
        ("Java 基础语法", "变量、数据类型、运算符", None, "https://www.runoob.com/java/java-basic-syntax.html", "菜鸟编程", 2),
        ("Java 条件与循环", "if-else、switch、for、while", None, "https://www.runoob.com/java/java-loop.html", "菜鸟编程", 3),
        ("Java 方法", "方法定义、参数传递、方法重载", None, "https://www.runoob.com/java/java-methods.html", "菜鸟编程", 4),
        ("Java 数组", "一维/多维数组、Arrays 工具类", None, "https://www.runoob.com/java/java-array.html", "菜鸟编程", 5),
        ("Java 面向对象", "类与对象、封装、继承、多态、接口", None, "https://www.runoob.com/java/java-oop.html", "菜鸟编程", 6),
        ("Java 集合框架", "List、Set、Map、迭代器、泛型", None, "https://www.runoob.com/java/java-collections.html", "菜鸟编程", 7),
        ("Java 异常处理", "try-catch-finally、自定义异常", None, "https://www.runoob.com/java/java-exceptions.html", "菜鸟编程", 8),
        ("Java Stream API", "Lambda 表达式、Stream 流式操作", None, "https://www.w3schools.com/java/java_streams.asp", "W3Schools", 9),
    ]
    for title, summary, content, url, site, order in java_lessons:
        cur.execute(
            "INSERT INTO lessons (course_id, title, summary, content, external_url, external_site, order_num) VALUES (4,?,?,?,?,?,?)",
            (title, summary, content, url, site, order),
        )

    # Go 课程 (course_id=5)
    go_lessons = [
        ("Go 语言简介", "Go 的设计哲学、应用场景、与 C/Java 对比", None, "https://www.runoob.com/go/go-tutorial.html", "菜鸟编程", 1),
        ("Go 基础语法", "变量、常量、数据类型、函数", None, "https://www.runoob.com/go/go-basic-syntax.html", "菜鸟编程", 2),
        ("Go 流程控制", "if、for、switch、defer", None, "https://www.runoob.com/go/go-decision.html", "菜鸟编程", 3),
        ("Go 函数与方法", "多返回值、命名返回值、方法、接口", None, "https://www.runoob.com/go/go-functions.html", "菜鸟编程", 4),
        ("Go 数组与切片", "Array、Slice、Map 的使用", None, "https://www.runoob.com/go/go-arrays.html", "菜鸟编程", 5),
        ("Go 结构体与接口", "struct、method、interface、类型断言", None, "https://go.dev/tour/methods/1", "Go 官方 Tour", 6),
        ("Go 并发编程", "Goroutine、Channel、select、sync", "并发是 Go 的最大亮点", "https://www.runoob.com/go/go-concurrent.html", "菜鸟编程", 7),
        ("Go 错误处理", "error 接口、panic/recover", None, "https://www.runoob.com/go/go-errors.html", "菜鸟编程", 8),
    ]
    for title, summary, content, url, site, order in go_lessons:
        cur.execute(
            "INSERT INTO lessons (course_id, title, summary, content, external_url, external_site, order_num) VALUES (5,?,?,?,?,?,?)",
            (title, summary, content, url, site, order),
        )

    # C# 课程 (course_id=6)
    cs_lessons = [
        ("C# 环境与 .NET", ".NET SDK 安装、dotnet CLI、Program.cs", None, "https://www.runoob.com/csharp/csharp-environment.html", "菜鸟编程", 1),
        ("C# 基础语法", "变量、数据类型、运算符、控制台输出", None, "https://www.runoob.com/csharp/csharp-syntax.html", "菜鸟编程", 2),
        ("C# 条件与循环", "if-else、switch、for、foreach", None, "https://www.runoob.com/csharp/csharp-loops.html", "菜鸟编程", 3),
        ("C# 方法", "方法定义、参数（ref/out）、可选参数", None, "https://www.runoob.com/csharp/csharp-methods.html", "菜鸟编程", 4),
        ("C# 面向对象", "类、继承、多态、接口、属性", None, "https://www.runoob.com/csharp/csharp-class.html", "菜鸟编程", 5),
        ("C# 集合与 LINQ", "List、Dictionary、LINQ 查询表达式", "LINQ 是 C# 的函数式编程利器", "https://www.runoob.com/csharp/csharp-linq.html", "菜鸟编程", 6),
        ("C# 异步编程", "async/await、Task、CancellationToken", None, "https://learn.microsoft.com/zh-cn/dotnet/csharp/asynchronous-programming/", "微软官方", 7),
        ("C# 泛型与委托", "泛型类/方法、委托 Delegate、事件 Event", None, "https://www.runoob.com/csharp/csharp-generics.html", "菜鸟编程", 8),
    ]
    for title, summary, content, url, site, order in cs_lessons:
        cur.execute(
            "INSERT INTO lessons (course_id, title, summary, content, external_url, external_site, order_num) VALUES (6,?,?,?,?,?,?)",
            (title, summary, content, url, site, order),
        )


def _seed_exercises(cur):
    """初始练习题"""
    exercises = [
        ("两数之和", "给定一个整数数组 nums 和目标值 target，找出和为 target 的两个整数的下标", "简单", "py", "# 在此编写代码\ndef twoSum(nums, target):\n    pass", None, 0.72, "数组,哈希表", 1),
        ("反转链表", "给你单链表的头节点 head，反转链表并返回新的头节点", "中等", "cpp", "// 在此编写代码\nstruct ListNode {\n    int val;\n    ListNode* next;\n};\nListNode* reverseList(ListNode* head) {\n    // ...\n}", None, 0.48, "链表,指针", 3),
        ("二分查找", "在有序数组中查找目标值，返回下标或 -1", "简单", "java", "public static int binarySearch(int[] arr, int target) {\n    // ...\n    return -1;\n}", None, 0.65, "数组,二分查找", 4),
        ("斐波那契数列", "用递归和迭代两种方式实现斐波那契数列第 n 项", "简单", "py", "def fib(n):\n    # 递归方式\n    pass", None, 0.81, "递归,动态规划", 1),
        ("冒泡排序", "实现冒泡排序算法，并分析时间复杂度", "简单", "js", "function bubbleSort(arr) {\n    // ...\n    return arr;\n}", None, 0.92, "排序,数组", 2),
        ("协程并发求和", "使用 Go channel 汇总多个 worker 的计算结果", "中等", "go", 'package main\n\nfunc worker(start, end int, ch chan int) {\n    sum := 0\n    // ...\n    ch <- sum\n}\n\nfunc main() {\n    // ...\n}', None, 0.55, "并发,channel", 5),
        ("有效括号", "判断字符串中的括号是否有效匹配（()[]{}）", "中等", "java", "public boolean isValid(String s) {\n    // ...\n    return true;\n}", None, 0.43, "栈,字符串", 4),
        ("快速排序", "实现快速排序算法", "中等", "cpp", "// 快速排序\nvoid quickSort(int* arr, int left, int right) {\n    // ...\n}", None, 0.58, "排序,分治,递归", 3),
        ("LINQ 查询练习", "用 C# LINQ 对学生列表按成绩降序排列取前 3 名", "简单", "cs", "using System;\nusing System.Linq;\n\nvar students = new[] {\n    new { Name = \"Alice\", Score = 90 },\n    new { Name = \"Bob\", Score = 75 },\n    new { Name = \"Carol\", Score = 88 },\n};\n\n// 用 LINQ 取前 3 名\nvar top3 = students\n    // ...\n;", None, 0.67, "LINQ,lambda", 6),
        ("爬楼梯", "每次可以爬 1 或 2 级台阶，爬到第 n 级有多少种方法？", "简单", "py", "def climbStairs(n: int) -> int:\n    # 动态规划\n    pass", None, 0.78, "动态规划", 1),
    ]
    for title, desc, diff, lang, starter, sol, rate, tags, cid in exercises:
        cur.execute(
            "INSERT INTO exercises (title, description, difficulty, language, starter_code, solution, accept_rate, tags, course_id) VALUES (?,?,?,?,?,?,?,?,?)",
            (title, desc, diff, lang, starter, sol, rate, tags, cid),
        )


def _seed_tasks(cur):
    """初始学习任务（user_id=1 默认用户）"""
    tasks = [
        (1, "完成 Python 函数章节", 0),
        (1, "练习：两数之和", 0),
        (1, "观看 JS DOM 操作视频", 1),
        (1, "复习 C++ 指针知识点", 0),
        (1, "阅读 Go 并发编程章节", 0),
    ]
    for uid, title, done in tasks:
        cur.execute("INSERT INTO study_tasks (user_id, title, completed) VALUES (?,?,?)", (uid, title, done))


def _seed_activities(cur):
    """初始活动记录"""
    activities = [
        (1, "code", "运行了 Python 代码（斐波那契数列）"),
        (1, "learn", "完成了「Python 条件与循环」章节"),
        (1, "achieve", "连续学习 12 天，获得「勤学之星」徽章"),
        (1, "code", "运行了 JavaScript 代码（冒泡排序）"),
        (1, "social", "在协作频道发起了结对编程"),
    ]
    for uid, typ, desc in activities:
        cur.execute("INSERT INTO activities (user_id, type, description) VALUES (?,?,?)", (uid, typ, desc))


# ========== 查询辅助函数 ==========

def query_all(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    """执行 SELECT，返回 dict 列表"""
    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def query_one(sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute(sql, params).fetchone()
    conn.close()
    return dict(row) if row else None


def execute(sql: str, params: tuple = ()) -> int:
    """执行 INSERT/UPDATE/DELETE，返回 lastrowid"""
    conn = get_db()
    cur = conn.execute(sql, params)
    conn.commit()
    rowid = cur.lastrowid
    conn.close()
    return rowid

def generate_target_id(role: str = "student") -> str:
    """
    生成下一个 target_id
    - super_admin: 固定返回 "000"
    - admin/student: 返回 "001", "002", "003", ... (递增)
    """
    if role == "super_admin":
        return "000"
    
    conn = get_db()
    # 获取当前最大的 target_id（排除 000 超管）
    row = conn.execute(
        "SELECT target_id FROM users WHERE target_id IS NOT NULL AND target_id != '000' ORDER BY CAST(target_id AS INTEGER) DESC LIMIT 1"
    ).fetchone()
    conn.close()
    
    if row and row[0]:
        try:
            next_num = int(row[0]) + 1
        except ValueError:
            next_num = 1
    else:
        next_num = 1
    
    return f"{next_num:03d}"


def verify_admin_permission(user_id: int) -> dict:
    """
    验证用户是否有管理员权限
    返回用户信息，如果没有权限则返回 None
    """
    user = query_one("SELECT id, role, target_id FROM users WHERE id = ?", (user_id,))
    if not user:
        return None
    if user["role"] not in ("admin", "super_admin"):
        return None
    return user


