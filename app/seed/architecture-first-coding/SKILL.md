---
name: architecture-first-coding
description: >-
  消除 AI 编程中的人机认知分歧。
  从零写代码：引导 AI 通过提问帮人类把想法表达清楚，边写边对齐认知。
  接手已有项目：检查确定性并自记，用大白话给人类解释项目，修改时边补约束边保持对齐。
  Load when: 新建项目、阅读陌生代码、重构、加功能、或需要确保人和 AI 理解一致时。
---

# Architecture-First Coding

## 核心概念：确定性（说人话版）

### 问题在哪

你告诉 AI 「写一个 PDF 转 Word 的功能」。你的脑子里有 100 个细节：

> 文件不能超过 50MB / 转完把原文件删掉 / 文件名可能有中文 / 转失败要告诉用户原因 / 返回下载链接 / ...

这些细节你**没说出来**——你以为 AI 知道。AI 猜了 50 个，猜对了；猜错了 50 个，就成了 bug。

**这就是「不确定性」：你和 AI 对同一段代码的理解，不一样。**

更麻烦的是：出 bug 之后，你不知道 AI 当初猜了什么，AI 不知道你本来想要什么。两边都在猜，没人知道正确答案。

### 确定性是什么

> **把你脑子里的 100 个「我以为 AI 知道」，全部写进代码里。写到 AI 不需要猜为止。**

打个比方：

```
❌ 不确定（AI 要猜）：
   def convert(file):           # file 是什么？图片？PDF？压缩包？
       ...                      # 返回什么？字符串？文件路径？True/False？
       return result            # 失败了怎么办？不知道

✅ 确定（AI 不用猜）：
   def convert_pdf_to_docx(
       pdf_data: bytes,         # ← 输入：PDF 文件的二进制内容
       max_size_mb: int = 50    # ← 限制：最大 50MB
   ) -> str:                    # ← 输出：下载链接（字符串）
       """将 PDF 转为 Word 文档。
       
       副作用：会在 downloads/ 目录下创建 .docx 文件
       错误：PDF 损坏时抛出 CorruptedFileError
       注意：文件名支持中文
       """
```

看到区别了吗？第一个版本，AI 要猜 5 件事。第二个版本，AI 不用猜——全写在代码里了。

### 五个「写下来」的层次

你不必一下子全部做到。一步一步来，每多做一层，AI 就少猜一点：

| 层次 | 做什么 | 大白话解释 | 例子 |
|------|--------|-----------|------|
| **第 1 层：类型** | 标清楚输入和输出的类型 | 「这是 PDF 文件，那是下载链接」 | `def f(pdf: bytes) -> str:` |
| **第 2 层：说明** | 一句话说清楚这个函数干嘛 | 「这个函数做 PDF 转 Word」 | `"""将 PDF 转为 Word 文档"""` |
| **第 3 层：副作用** | 标清楚这个函数会动什么东西 | 「会读硬盘、会写文件、会删原文件」 | 写在 docstring 里或函数名里 |
| **第 4 层：错误** | 写清楚出错了怎么办 | 「PDF 坏了就返回错误信息，别悄悄崩掉」 | `raise CorruptedFileError` 或明确的 return |
| **第 5 层：测试** | 用代码验证上面四条 | 「跑这个测试，如果 AI 猜错了就挂」 | `assert convert(bad_pdf) raises Error` |

**每多写一层，AI 就少猜一次。五层全写完，AI 完全不用猜——这就是确定性。**

### 核心循环：先说清楚 → 再写代码 → 最后验证

```
第 1 步「说清楚」：先写下你要什么（类型 + 说明 + 副作用 + 错误）
第 2 步「写代码」：AI 照着你的要求写
第 3 步「验证」  ：跑测试，看 AI 写的和你说的是不是一回事
```

**关键原则：说不清楚的东西，AI 一定写不对。** 如果你自己都不知道「失败了应该返回什么」，那 AI 更不可能知道。

### 为什么这些规则能起作用（五个简单的道理）

1. **类型标注起作用**，因为 `bytes` 和 `str` 是不同的东西——编译器会帮你检查。你把 PDF 数据传给一个只接受字符串的函数？编译器直接报错。AI 不能乱传。

2. **文档字符串起作用**，因为它是你给 AI 的「唯一指令」。没有它，AI 只能从函数名猜你要什么。有它，AI 读一行就知道。

3. **副作用声明起作用**，因为「读文件」和「删文件」的区别很大。你以为是只读，AI 写了删除——磁盘上的文件没了。写在明处，就不会有「惊喜」。

4. **错误处理起作用**，因为程序一定会出错。你没告诉 AI 「PDF 损坏时怎么办」，AI 就自己决定——可能是返回空字符串，可能是抛异常，可能是静默跳过。三种行为，两个你不知道。

5. **测试起作用**，因为它是「你说的」和「AI 写的」之间的裁判。你说「这个函数遇到坏文件应该报错」→ 写个测试传个坏文件进去 → AI 没报错？测试挂掉，AI 得重写。

### 一个完整的例子：从「不确定」到「确定」

```
第 0 步：你脑子里想的（AI 看不见）
   「写个函数，把 PDF 转 Word，文件不能太大，转完返回下载链接，
    出错了告诉用户，转换完把原文件删掉」

第 1 步：先写「说清楚」（这是你和 AI 之间的合同）
   def convert_pdf_to_docx(
       pdf_data: bytes,          # ← 输入：PDF 文件的原始字节
       max_size_mb: int = 50     # ← 限制：最大文件大小
   ) -> str:                     # ← 输出：下载链接（字符串）
       """将 PDF 文件转换为 Word 文档。
       
       副作用：
         - 读取上传的文件
         - 在 downloads/ 目录创建 .docx 文件
         - 转换完成后删除原 PDF 文件
       
       错误情况：
         - 文件超过大小限制 → 抛出 FileTooLargeError
         - PDF 文件损坏 → 抛出 CorruptedFileError
         - 磁盘空间不足 → 抛出 DiskFullError
       
       注意：文件名支持中文
       """

第 2 步：AI 照着写代码（不会猜错，因为上面全写清楚了）

第 3 步：写测试验证
   def test_refuses_oversized_file():
       big_pdf = b"x" * (51 * 1024 * 1024)   # 51MB
       with pytest.raises(FileTooLargeError):
           convert_pdf_to_docx(big_pdf)
   
   def test_refuses_corrupted_pdf():
       with pytest.raises(CorruptedFileError):
           convert_pdf_to_docx(b"this is not a PDF")
   
   def test_deletes_original_after_conversion():
       # 验证原文件被删除
       ...
```

**现在，任何 AI（或者人）拿到这段代码，不需要任何额外沟通，就能：**
- 知道输入是什么（PDF 字节）、输出是什么（下载链接）
- 知道会动哪些文件（读 PDF、写 DOCX、删 PDF）
- 知道出错了怎么办（三种不同的异常）
- 改代码时知道不能破坏什么（测试会告诉他）

**这就是确定性。**

---

## When to Load This Skill

Load this skill when:
- Starting a new project from scratch
- Reading/unfamiliar codebase — use the READING workflow
- Adding a major feature that touches multiple layers
- Refactoring architecture or module boundaries
- Reviewing code that may have violated architectural constraints
- User says "architect", "architecture", "design the system", "layered design"

## 编码注意事项

**如果项目使用中文注释（或其他非英文注释）：**

- 所有生成的文件、docstring、注释必须使用 **UTF-8 编码**
- Python 文件确保包含 `# -*- coding: utf-8 -*-` 或文件本身为 UTF-8
- 不要使用 GBK/GB2312 编码，会导致不同系统/编辑器之间乱码
- 读取用户已有文件时，先检测编码再读取（`chardet` 或 `file -I`）
- Windows 下生成的文件默认可能是 GBK，注意显式指定 `encoding="utf-8"`

---

## Workflow A: READING an Existing Codebase

**Core insight: reading code is NOT a linear process. It is hypothesis-driven exploration.**
You form a guess about how something works, then search for evidence to confirm or refute it.

Real codebases are messy. There is no contracts.py. Directories are poorly named. Tests
don't exist. The README was written three years ago and lies about the architecture.
The heuristics below work on ANY codebase — clean or chaotic.

---

### Heuristic 1: Start from PURPOSE, not structure

Before reading a single line of code, answer: **What does this system DO?**

Sources (in priority order):
1. **README** — even a bad one usually says *what* the project is
2. **Public API / route definitions** — grep for `@app.route`, `@router`, `app.get(`, `@endpoint`. The URL paths and method names ARE the system's external contract
3. **CLI entry points** — `argparse`, `click`, `typer` commands reveal use cases
4. **Config files** — `config.yaml`, `.env.example`, `settings.py` reveal external dependencies (DBs, queues, services)
5. **Package name and top-level `__init__.py`** — imports and docstrings at the package root

**Code-level discovery commands:**
```bash
# Find public API surface
grep -rn "@app\.\|@router\.\|@blueprint\|@endpoint" --include="*.py" | head -20

# Find config
find . -name "*.yaml" -o -name "*.toml" -o -name ".env*" -o -name "settings*" | head -10

# Read README (even if bad)
head -50 README.md 2>/dev/null || head -50 README.rst 2>/dev/null
```

**Output:** a one-sentence answer to "this system does X, takes Y as input, produces Z as output."

---

### Heuristic 2: Follow the DATA, not the code

Don't read class hierarchies. **Trace one piece of data end-to-end.**

1. Pick one entry point (a single API route or CLI command)
2. Follow the data: request → handler → service → repository → database
3. At each hop, note: what does the data look like? how is it transformed? what named types carry it?

This reveals the REAL architecture — not the intended one. The path that data takes IS the architecture.

**Discovery commands:**
```bash
# Find data models — these define the system's vocabulary
grep -rn "class.*Model\|class.*Schema\|class.*Entity\|class.*DTO" --include="*.py" | head -30

# Find serialization/deserialization — boundary between layers
grep -rn "\.json()\|json.loads\|serialize\|deserialize\|marshal\|unmarshal" --include="*.py" | head -15
```

**Key question at each hop:** "Does this function transform data (business logic) or just pass it through (plumbing)?" This tells you where the real complexity lives.

---

### Heuristic 3: Read TESTS before implementation

Tests are **executable specifications**. They tell you:
- What the code is supposed to do (happy path)
- What can go wrong (error cases)
- What edge cases matter to the team
- What mocking strategy they use (reveals coupling)

**Discovery:**
```bash
# Find test files
find . -name "test_*.py" -o -name "*_test.py" -o -name "*_spec.py" | head -20

# Read ONE test file that covers the entry point you traced
# Focus on: test names (they document behavior), fixtures (they reveal dependencies),
# and mock setup (they reveal what's external)
```

**If tests don't exist:** that's itself a signal — the architecture is enforced by nothing but discipline. Proceed with extreme caution; any change might break unknown invariants.

---

### Heuristic 4: Git Archaeology — find the REAL coupling

The intended architecture is in diagrams. The REAL architecture is in **what changes together.**

```bash
# Recent commits — what's actively maintained?
git log --oneline -30

# Files most frequently changed — the "hot" core of the system
git log --format= --name-only | sort | uniq -c | sort -nr | head -20

# Find coupled files: which files always change together?
# This reveals architectural boundaries better than any import graph
git log --name-only --oneline -50 | awk '...' # group by commit
```

**Key insight:** if `file_a.py` and `file_b.py` always appear in the same commits, they are architecturally coupled — even if no import connects them. This is the REAL architecture.

---

### Heuristic 5: Error Path Tracing — find the invariants

Error handling reveals what the system cares about. Look for:

```bash
# Find all raised exceptions — these ARE the system's contracts
grep -rn "raise \|throw \|panic\|reject(" --include="*.py" | head -30

# Find error responses — the negative space of the API contract
grep -rn "4[0-9][0-9]\|5[0-9][0-9]\|HTTPStatus\|status_code=40\|status_code=50" --include="*.py" | head -20

# Find assertions — runtime invariants that must hold
grep -rn "assert \|require(" --include="*.py" | head -20
```

**Each raised exception is a contract:** "under condition X, the system guarantees it will NOT continue silently." This tells you what violations matter.

---

### Heuristic 6: Build the Dependency Graph

Don't just read files — **visualize** their relationships.

```bash
# Build import graph (Python)
pip install pydeps 2>/dev/null
pydeps --show-deps --noshow project/ -o /tmp/deps.png 2>/dev/null

# Quick manual version: for each top-level directory, find what it imports
for dir in */; do
    echo "=== $dir imports: ==="
    grep -rh "^from\|^import" "$dir" --include="*.py" | \
        grep -v "from \." | sort -u | head -10
done
```

**Red flags in the dependency graph:**
- Cycles (A imports B, B imports A)
- Domain layer importing infrastructure (inner importing outer)
- Every module imports `utils.py` (a dumping ground, not a layer)

---

### Heuristic 7: "Strange Things First" — find where architecture broke

Experienced developers don't read top to bottom. They scan for **anomalies**:

```bash
# TODO/FIXME/HACK comments — these are scars from previous battles
grep -rn "TODO\|FIXME\|HACK\|XXX\|WORKAROUND\|temporary\|ugly" --include="*.py" | head -20

# Comments that say "don't touch this" or "I don't know why this works"
grep -rn "don't touch\|don't change\|don't modify\|magic\|wtf\|hack" --include="*.py" -i | head -10

# Exceptionally large files — where complexity accumulates
find . -name "*.py" -exec wc -l {} + | sort -nr | head -15

# Files that import MANY things — high coupling
grep -c "^from\|^import" **/*.py 2>/dev/null | sort -t: -k2 -nr | head -15
```

**Anomalies are architecture debt.** They tell you where the system's design broke under pressure. These are the highest-risk areas for modification.

---

### Heuristic 8: Configuration-Driven Discovery

Config files reveal the **deployment architecture** — what external systems exist, what parameters matter, what environments are supported:

```bash
# Find all configuration
find . \( -name "*.yaml" -o -name "*.yml" -o -name "*.toml" -o -name "*.ini" -o -name "*.cfg" -o -name ".env*" \) | grep -v node_modules | grep -v venv | head -15

# Read the main config — database URLs, message queues, service endpoints are architecture
cat config/*.yaml 2>/dev/null | head -50
```

From config alone, you can often reconstruct: database type, cache layer, message queue, external service dependencies, feature flags (incomplete/experimental features).

---

### Heuristic 9: Entry-to-Exit Trace (ONE complete path)

Choose ONE concrete operation (e.g., "user creates an account" or "submit an order") and trace it **all the way through**:

```
HTTP POST /users → UserController.create() → UserService.register() →
  → UserRepository.save() → INSERT INTO users →
  → EmailService.send_welcome() → SMTP
```

**At each hop, ask:**
1. What is the input type? What is the output type?
2. Does this function have side effects? (DB write? external call? queue push?)
3. Where would I set a breakpoint to pause here?
4. What can fail at this step?

This ONE trace is worth more than reading 20 random files.

---

### Heuristic 10: Hypothesis-Driven (not sequential)

The above heuristics are NOT steps to follow in order. They are **probes** you use based on what you're trying to learn:

| If you want to know... | Use heuristic... |
|---|---|
| What does this system do? | #1 (Purpose) + #3 (Tests) |
| Where is the business logic? | #2 (Follow Data) |
| What are the module boundaries? | #6 (Dependency Graph) + #4 (Git coupling) |
| What can break? | #5 (Error Paths) + #7 (Anomalies) |
| What external systems exist? | #8 (Config) |
| How does one feature work? | #9 (Entry-to-Exit Trace) |
| Where should I start reading? | #9 first, then #2, then #7 |
| Where will human and AI diverge? | #11 (Type Gaps) + #12 (Behavior Gaps) + #13 (Contract Gaps) |
| How maintainable is this code? | #7 (Anomalies) + #11 + #12 (combined determinism score) |

**The meta-heuristic:** form a hypothesis first ("I think the system has a service layer that..."), then use the right probe to confirm or refute it. Never read files hoping to "discover" the architecture — you'll drown in noise.

---

### Final Step: Reading Output (TWO layers)

After probing, produce TWO outputs. They serve different purposes.

---

#### 第一层：给人类看的「代码说明书」（必须输出）

这是给**人**读的。目标：一个完全不了解这个项目的人，读完这份说明书就能理解代码在干什么。

用最直白的中文（或用户的语言），按这个结构输出：

```
## [项目名] — 代码说明书

### 一句话概述
[这个系统是干什么的 —— 让不懂技术的人也能听懂]

### 它包含哪些功能（用列表，不要用术语）
- 功能 1：[干什么的] — [入口在哪]
- 功能 2：[干什么的] — [入口在哪]
...

### 数据是怎么走的（挑一个最典型的功能，一步一步描述）
以「用户上传 PDF 转 Word」为例：
  第 1 步：用户在网页上选择一个 PDF 文件，点「转换」
  第 2 步：浏览器把文件发送到服务器 → 到达 /api/pdf-to-word/convert
  第 3 步：服务器检查：文件有没有？是不是 PDF？太大了吗？
  第 4 步：通过检查 → 保存到 uploads/ 目录
  第 5 步：调用 pdf2docx 库把 PDF 转成 Word
  第 6 步：Word 文件保存到 downloads/ 目录
  第 7 步：返回一个下载链接给浏览器
  第 8 步：用户点链接下载 Word 文件

### 关键文件是干什么的（每个文件一句话）
- flexible_main.py：网站的启动入口，在这里注册了所有功能
- src/routes/pdf_to_word/routes.py：负责 PDF 转 Word 这个功能
- src/routes/image_resize/routes.py：负责图片缩放这个功能
- src/static/：存放网页的样式（CSS）、脚本（JS）、上传和下载的文件
- src/templates/：存放网页的 HTML 模板
- ...

### 如果我想改一个功能，从哪开始
- 想改 PDF 转 Word → 打开 src/routes/pdf_to_word/routes.py
- 想改网页样式 → 打开 src/static/css/style.css
- 想改网页文案 → 打开 src/templates/ 下的对应 HTML 文件
- 想加一个新工具 → 在 src/routes/ 下新建一个文件夹，照着 pdf_to_word 的样子抄
```

**重要：这层不写任何「问题」「缺陷」「评分」。只写「是什么」。**

---

#### 第二层：给 AI 用的「确定性诊断」（内部使用）

这是给 AI 自己用的（也是为了告诉人类「这个代码可不可靠」）。按原有的 Architecture Summary 格式输出，但放在说明书**之后**，标注为「附加诊断」。

诊断内容包括：
- 确定性评分（18 分制）
- 每个层次的具体缺口
- 风险地图
- 如果评分 < 12，给出升级路径的前三步

**这两层的关系：**
- 人类 → 读第一层，知道代码在干什么
- AI → 读第二层，知道改代码时哪里会踩坑
- 人类如果想了解代码质量 → 可以看第二层，但不是必须的

---

## Common Patterns (Quick Recognition)

When probing, look for these telltale signs:

| Pattern | Signal | Implication |
|---------|--------|-------------|
| `utils.py` / `helpers.py` > 500 lines | No clear layer boundary | Refactor risk: high |
| Every file imports from `models.py` | Central data model | Good: clear vocabulary. Risk: model changes break everything |
| `*Service` and `*ServiceImpl` pairs | Interface/implementation split | Good architecture. Contracts exist, even if implicit |
| `if DEBUG:` or `if os.environ.get(...)` | Environment-dependent behavior | Tests may not catch all paths |
| `try: ... except: pass` | Silently swallowed errors | Invariant violations are hidden |
| Deep import paths: `from a.b.c.d.e import f` | Highly nested structure | Hard to refactor; tightly coupled to directory layout |
| Many `*DTO` or `*Request`/`*Response` classes | Explicit layer boundaries | Good: data doesn't leak across layers |
| `*Manager` / `*Handler` / `*Processor` classes | Ambiguous responsibilities | These classes do "whatever's left over" — high risk |

---

### Heuristic 11: Determinism Gap Scan — Type-Level Ambiguity

After understanding the architecture, scan for **places where the type system fails to constrain behavior.** These are cracks where human and AI will form different mental models.

```bash
# THE cardinal sin: Any type. It says "anything goes" — and anything will.
grep -rn ": Any\|-> Any\|List\[Any\]\|Dict\[Any\|Optional\[Any" --include="*.py" | head -20

# Implicit Optional — the function sometimes returns None, but doesn't say so
grep -rn "return None" --include="*.py" -A1 | grep -v "Optional\[" | head -20

# Union with too many members — the function's behavior is a coin flip
grep -rn "Union\[.*,.*,.*," --include="*.py" | head -15

# dict/list without type params — "a dict of... something?"
grep -rn ": dict\b\|: list\b\|-> dict\b\|-> list\b" --include="*.py" | grep -v "Dict\[" | grep -v "List\[" | head -20
```

**Judgment rule:** if a human cannot look at the function signature alone and know exactly what types go in and out, it's a determinism gap. Flag it.

---

### Heuristic 12: Determinism Gap Scan — Behavioral Ambiguity

Types constrain data shape. These constrain **runtime behavior**:

```bash
# Functions with NO docstring — intent is completely invisible
# Find functions longer than 5 lines that lack docstrings
grep -rn "^def " --include="*.py" -A1 | grep -v '"""' | head -30

# Functions that do I/O without declaring it
# "get" functions that have side effects — the #1 source of cognitive divergence
grep -rn "def get_.*" --include="*.py" -A10 | grep -E "\.save\(|\.insert\(|\.update\(|\.delete\(|requests\.|\.post\(|\.put\(|\.write\(" | head -15

# Swallowed exceptions — errors that vanish without a trace
grep -rn "except.*:" --include="*.py" -A1 | grep -E "pass$|^\s*$" | head -15

# Mutable default arguments — shared state time bomb
grep -rn "def .*={\|def .*=\[\]" --include="*.py" | head -15

# Functions that return different TYPES in different branches
# (e.g., return user on success, return None on failure, return str on error)
grep -rn "return None\|return \[\]\|return {}\|return \"\"\|return 0\|return False" --include="*.py" | head -20
```

**Judgment rule:** if a human cannot predict the function's behavior from its signature and one-line docstring alone, it's a determinism gap.

---

### Heuristic 13: Determinism Gap Scan — Contract Ambiguity

Where are the implicit contracts that exist only in someone's head?

```bash
# Functions called without checking return values — the caller assumed success
grep -rn "^\s*[a-z_]*(" --include="*.py" | grep -v "= " | grep -v "assert " | head -20

# Unvalidated inputs at layer boundaries (API → domain, domain → DB)
grep -rn "@app\.\|@router\.\|def post\|def put" --include="*.py" -A5 | grep -v "schema\|Schema\|validate\|pydantic" | head -15

# Database queries without error handling
grep -rn "\.execute\(\|\.query\(\|\.find\(\|\.get(\|\.all(" --include="*.py" -B1 | grep -v "try:" | head -15
```

## Workflow B: WRITING Code from Scratch

When starting a new project, architecture COMES FIRST. Code is secondary.

### Step 0: Determinism Gate (MANDATORY — for every function/module)

**Before writing ANY code**, specify the contract. This is not documentation. It is the
shared cognitive artifact that human and AI agree on. Without it, divergence begins immediately.

**重要：如果用户对这个合同里的任何一问答不上来，不要跳过。启动「引导式提问」（见 Workflow G），
一问一问帮用户把想法掏出来。用户说「不知道」→ AI 给默认值并标记。**

For each function or module, answer these **5 questions** before implementation:

```
## Contract: [function_name]

### 1. Input
- Types: [exact — no Any, no untyped dict/list]
- Validation state: [already validated? raw? partial?]
- Required vs optional: [which fields can be None?]

### 2. Output
- Types: [exact — is None a valid return?]
- Meaning of None: [not found? error? default?]
- Meaning of empty: [] vs {} vs "" — different things

### 3. Side Effects (be brutally honest)
- [ ] DB read (specify table/query)
- [ ] DB write (specify table/operation)
- [ ] External API call (specify service/endpoint)
- [ ] Message queue publish
- [ ] File system read/write
- [ ] Cache read/write
- [ ] Mutable argument mutation
- [ ] Global state modification
- [ ] NONE (truly pure function)

### 4. Error States
- What exceptions can this raise?
- What errors are swallowed? (None — every error must be explicit)
- What does the caller need to handle?

### 5. Pre/Post Conditions
- Pre: [what must be true before calling?]
- Post: [what is guaranteed after returning?]
```

**For a module** (multiple functions): define the Protocol first, then implement.
The Protocol IS the contract — it answers all 5 questions at the module level.

---

### Step 1: Define Directory Structure

Create the skeleton BEFORE writing any logic:

```
project/
├── domain/           # Pure business logic — ZERO external deps
│   ├── __init__.py
│   ├── models.py     # Data structures, value objects
│   └── contracts.py  # Protocols/ABCs — THE single source of truth
├── application/      # Use cases, orchestration — can import domain only
│   └── services.py
├── infrastructure/   # Ext. deps (DB, API clients, MQ) — can import domain only
│   └── adapters.py
├── interfaces/       # Entry points (REST, CLI, gRPC) — can import app+infra
│   └── api.py
└── tests/
    ├── test_architecture.py  # Architecture constraint tests
    ├── test_domain.py
    └── test_application.py
```

**Rules for directory naming:**
- Name directories after their ROLE, not their technology
- `domain/` not `models/`, `interfaces/` not `fastapi/`
- If someone can't guess what a directory does from its name, rename it

### Step 2: Write Contracts FIRST

`domain/contracts.py` is the first file you write. It defines what exists WITHOUT
how it works:

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class Repository(Protocol):
    def save(self, entity: Entity) -> None: ...
    def find_by_id(self, id: str) -> Entity | None: ...

class UseCase(Protocol):
    def execute(self, request: Request) -> Response: ...
```

Every module that others depend on gets a Protocol here.
This is NOT documentation — it's the type-level contract that the compiler enforces.

### Step 3: Write Architecture Tests SECOND

Before implementing anything, write the tests that enforce your architecture:

```python
# tests/test_architecture.py

def test_domain_has_no_project_imports():
    """domain/ must not import from application/, infrastructure/, or interfaces/"""
    violations = find_imports_from("domain/", ["application", "infrastructure", "interfaces"])
    assert not violations, f"Domain layer imports outer layers: {violations}"

def test_no_circular_dependencies():
    """Import graph must be a DAG"""
    cycles = detect_cycles("project/")
    assert not cycles, f"Circular dependencies: {cycles}"

def test_all_services_implement_protocols():
    """Every class in application/ that looks like a service must implement its Protocol"""
    ...
```

Use `pytest-archtest` or `import-linter` for Python. For other languages,
use equivalent tools (ArchUnit for Java, `dep` for Go, etc.).

### Step 4: Implement from Inside Out

Implement in this order:
1. `domain/models.py` — data structures first
2. `infrastructure/adapters.py` — concrete implementations of domain contracts
3. `application/services.py` — orchestration that wires domain + infra
4. `interfaces/api.py` — entry point, always LAST

**Never skip ahead.** If you're writing the API and realize the domain model is incomplete,
go back to domain. Don't compensate in the wrong layer.

### Step 5: Every New Module = Update Contracts

When adding a new module:
1. Add its Protocol to `domain/contracts.py`
2. Implement the concrete class
3. Add an architecture test if there's a new layer dependency rule
4. Run architecture tests to verify

---

## Workflow C: MODIFYING Existing Code

### Before changing ANYTHING:

1. **Identify which layer** the change belongs in
2. **Check contracts.py** — will this change break the Protocol?
3. **If changing a contract**: update contracts.py first, then implementations
4. **If adding a new dependency between layers**: check if it violates layer rules
5. **Run architecture tests** before and after

### Red flags to catch:

| Symptom | Problem | Fix |
|---------|---------|-----|
| `import infrastructure from domain` | Layer violation | Move logic to application layer |
| Protocol not matching implementation | Contract drift | Update Protocol OR fix implementation |
| Circular import error | Bad dependency graph | Extract shared interface to domain |
| Test mocking everything | Too many concrete deps | Depend on Protocols, not classes |

---

## Workflow D: Determinism Audit (for EXISTING code)

Use this standalone workflow when you inherit a codebase and need to assess: **how likely is it that human and AI will diverge in understanding this code?**

Run through this checklist. Each "yes" is good. Each "no" is a determinism gap that WILL cause problems.

### Type Determinism

- [ ] Every function has complete type hints (parameters AND return type)
- [ ] `Any` is used 0 times (or only at truly dynamic boundaries like JSON parsing)
- [ ] `Optional[X]` is explicit — never an implicit `None` return
- [ ] `Union` has at most 2 members
- [ ] Container types are fully parameterized (`dict[str, User]`, not `dict`)
- [ ] No `# type: ignore` comments

### Behavioral Determinism

- [ ] Every public function has a one-line docstring stating WHAT it does
- [ ] Functions that do I/O are named with I/O-indicating verbs (`fetch_`, `save_`, `send_`, NOT `get_` or `process_`)
- [ ] Every `except` block either re-raises, logs, or explicitly handles a SPECIFIC exception type
- [ ] No `except Exception: pass` or `except: pass`
- [ ] Functions return the SAME type in all branches (no "return user on success, return None on failure, return 'error' on error")
- [ ] No mutable default arguments
- [ ] Global state is explicitly documented and scoped

### Contract Determinism

- [ ] Every module boundary is defined by a Protocol/ABC/interface
- [ ] Inputs are validated at the boundary (API layer validates BEFORE passing to domain)
- [ ] Every raised exception is documented in the function's contract
- [ ] Callers visibly handle or propagate errors (no "fire and forget" calls without checking return value)
- [ ] Database/HTPP/file operations are wrapped in explicit transaction/error boundaries

### Scoring

| Score | What it means |
|-------|---------------|
| 18-21 ✓ | **Deterministic.** Human and AI will read this the same way. Safe to modify. |
| 12-17 ⚠ | **Partially deterministic.** Proceed with caution. Each gap is a potential divergence point. |
| 6-11 ⚠ | **High uncertainty.** Expect cognitive divergence. Every modification is risky. |
| 0-5 ✗ | **Non-deterministic.** Neither human nor AI can reliably understand this code. Refactor before modifying. |

---

---

## Workflow G: Guided Elicitation — 把说不清的想法问出来

### 这个流程解决什么问题

你说「写一个 PDF 转 Word」。你脑子里有 100 个想法，但：
- 你能清楚说出来的，大概 10 个（「输入 PDF，输出 Word」）
- 你能模糊表达但说不清的，大概 20 个（「文件不能太大...多大算大？」）
- 你完全没意识到需要说的，大概 70 个（「文件名有中文怎么办？」「两个人同时上传同一个文件怎么办？」）

这个流程就是：**AI 通过提问，一层一层帮你把藏着的想法挖出来。你回答就行，不需要自己组织语言。**

### 使用时机

- 用户说「帮我写一个 XXX」但描述很模糊（少于三句话）
- 用户说「我要做一个类似 XXX 的东西」但没说细节
- Writing workflow 的 Step 0（5 问合同）中，用户答不上来其中任何一问
- 任何你觉得「用户可能还有没说完的想法」的时候

### 提问方式

**原则：**
1. 每次只问 2-3 个问题，不要一次扔 10 个问题把人砸晕
2. 用大白话问，不要用「输入参数类型」「副作用」「异常处理」这些术语
3. 每问完一轮，把用户的回答总结成约束写下来，确认无误
4. 用户说「不知道」或「随便」→ 记录下来，标记为「待定」，AI 先给一个合理的默认值
5. 问到你认为「AI 拿着这些约束，不可能理解错」为止

### 三层提问法

#### 第一轮：把「肯定知道的」问清楚（10 个想法）

这些是最基本的问题，任何人都能回答。问完这轮，AI 就知道「这东西是什么」。

```
以「写一个文件转换工具」为例：

1. "这个工具给谁用？在浏览器里用还是命令行用？"
2. "输入是什么文件格式？（PDF？图片？Word？）输出是什么格式？"
3. "用户怎么操作？上传文件→点按钮→等结果→下载？还是别的方式？"
4. "有界面吗？简单描述一下长什么样？（一个上传框 + 一个按钮？还是更复杂？）"
```

**问完这轮后，输出一份「你告诉我的是这样，对吗？」的确认：**
```
好的，我理解你需要的是：
- 一个网页工具，用户在浏览器里用
- 上传 PDF 文件，转换成 Word 格式
- 页面上有一个上传框和一个「开始转换」按钮
- 转换完后显示下载链接

对吗？那我接着问几个细节。
```

#### 第二轮：把「模糊知道的」抠出来（20 个想法）

这些是需要想一想才能回答的问题。问完这轮，AI 就知道「这东西的边界在哪」。

```
5. "文件大小有限制吗？超过多大就拒绝？"
6. "转换完以后，服务器上留下的文件要不要删？多久删？"
7. "转换失败了怎么办？告诉用户「转换失败」就行，还是需要说具体原因？"
8. "需要支持中文文件名吗？文件里可能有中文内容吗？"
9. "一次只能转一个文件，还是可以同时上传好几个？"
```

**注意：** 如果用户说「不知道」或「随便」，**不要跳过**。给一个默认值，并说明理由：
```
用户："文件大小我没想过"
AI：  "那我先设为 50MB 上限，因为大多数 PDF 都在这个范围内。
      如果以后需要调整，改一个数字就行。可以吗？"
```

#### 第三轮：把「没意识到的」挖出来（70 个想法）

这些是用户完全没想过、但实际写代码时一定会遇到的问题。问完这轮，AI 就知道「坑在哪」。

```
10. "如果用户上传的不是 PDF（比如把 .exe 改名为 .pdf 上传），怎么处理？"
11. "如果两个人同时上传了同名文件，会覆盖吗？还是各存各的？"
12. "转换需要时间。如果文件很大，转换要 2 分钟，用户是一直等着还是可以离开？"
13. "服务器重启后，之前上传的文件还在吗？需不需要保留？"
14. "需要记录谁在什么时候转换了什么文件吗？（日志/数据库）"
```

**这一轮很多问题用户会说「没想过」——这正常。** 每个「没想过」都是一个潜在的 bug。记录下来，AI 给默认处理方式。

### 问完三轮后的输出

把所有问答整理成一份「说清楚了」文档（即 Writing Workflow Step 0 的 5 问合同）：

```
## 需求合同：PDF 转 Word 工具

### 1. 输入（已经问清楚）
- 格式：PDF 文件（.pdf）
- 大小：最大 50MB（你定的）
- 来源：用户在网页上传

### 2. 输出（已经问清楚）
- 格式：Word 文档（.docx）
- 方式：返回下载链接，用户点击下载
- 文件名：保持原名，只改后缀

### 3. 副作用（已经问清楚）
- 上传的 PDF 存在服务器 uploads/ 目录
- 转换完生成 .docx 在 downloads/ 目录
- 原 PDF 文件 24 小时后自动删除（你定的）
- .docx 文件 24 小时后自动删除

### 4. 错误（已经问清楚）
- 文件不是 PDF → 返回 "请上传 PDF 文件"
- 文件超过 50MB → 返回 "文件太大，最大支持 50MB"
- PDF 损坏/加密 → 返回 "文件无法读取，可能已损坏或加密"
- 磁盘满了 → 返回 "服务器存储空间不足，请联系管理员"

### 5. 约束（你说「没想过」，AI 给的默认值）
- 【待定】同名文件 → AI 默认：自动加时间戳避免覆盖
- 【待定】多人同时上传 → AI 默认：各自独立处理，互不影响
- 【待定】服务器重启后文件 → AI 默认：不保留（24 小时后自然过期）
- 【待定】是否需要日志 → AI 默认：暂不记录，可在终端看到输出
```

### 什么情况可以停止提问

当你能手工画出下面这张图（数据流图），而且自信**任何一个程序员拿到这张图 + 这份合同，都能写出完全相同的代码**，就可以停了：

```
用户浏览器 → [上传 PDF] → 服务器 uploads/ → [pdf2docx 转换] 
→ downloads/xxx.docx → [返回下载链接] → 用户浏览器下载

约束：
- max 50MB
- 不是 PDF → 拒绝
- 坏了 → 告诉用户
- 24 小时后清理
```

### 如果用户在整个过程中表现出不耐烦

```
如果用户说「别问了，就这么写吧」：
1. 停止提问
2. 已收集到的约束照用
3. 没问到的地方，AI 自己给默认值，并在代码里用注释标记「【AI 默认】」
4. 在交付代码时提醒用户：「以下 5 个地方我按默认处理了，你可以检查一下：...」
```

### 这个流程的反面（绝对不要这么做）

```
❌ 不要一次问 10 个问题：
  "请回答：输入格式？输出格式？大小限制？错误处理？并发？持久化？
   日志？权限？国际化？缓存策略？..."
  → 用户会被吓跑

❌ 不要在用户说「不知道」时逼问：
  "你必须想清楚，不然我没法写"
  → AI 给默认值，标记【待定】，继续

❌ 不要用术语：
  "这个函数的副作用声明是什么？异常传播策略？"
  → 说人话："转换完原文件要不要删？""坏了怎么办？"
```

This will happen. The AI writes code that "looks right" but you know is wrong.
Do NOT try to explain the fix. Instead:

1. **Identify which determinism gap caused the divergence.**
   - Did the AI miss a side effect? → The side effect wasn't declared.
   - Did the AI return the wrong type on error? → The error state wasn't specified.
   - Did the AI validate in the wrong place? → The boundary contract wasn't explicit.

2. **Fix the contract, not the code.**
   - Add the missing type hint / exception doc / side effect declaration to the contract
   - Then ask the AI to re-implement against the updated contract

3. **Add a test that would have caught it.**
   - If the AI returned `None` when you expected an exception, write a test that asserts on exception
   - If the AI mutated a shared object, write a test that verifies immutability

**The rule:** every disagreement is evidence of a missing constraint. Don't patch the code — patch the constraint.

---

## Workflow F: Determinism Upgrade Path (low-score → high-score)

When a Determinism Audit scores the codebase < 12, do NOT start making functional changes.
Those changes will accumulate on top of invisible assumptions. Instead, run this upgrade cycle:

### Phase 1: Structural Triaging (brings score from ~4 → ~8)

Goal: eliminate the worst structural ambiguities so the codebase has a clear shape.

1. **Merge duplicate entry points.** If there are two `main.py` files, pick one and delete the other.
2. **Delete dead code.** Any module not imported by any entry point → removed.
3. **Prune dependencies.** Run `pipreqs` or manually audit `requirements.txt`. Remove unused packages.
4. **Fix one obvious invariant violation.** The most glaring one (e.g., commented-out file cleanup, swallowed exception with `pass`).
5. **Add one data contract.** Define the API response schema as a Pydantic model or TypedDict. This single file becomes the seed of `domain/contracts.py`.

**Output:** The codebase now has a single clear entry point, no dead weight, and one explicit data contract.

### Phase 2: Contractual Seeding (brings score from ~8 → ~14)

Goal: make the module boundaries explicit so human and AI agree on interfaces.

1. **Create `domain/contracts.py`** with Protocols for every module that another module depends on.
2. **Add type hints to public functions** (starting with the ones that have the most callers).
3. **Add one-line docstrings** to every function that lacked one.
4. **Make every `except` block specific.** Replace `except Exception as e:` with the actual exception types that can occur. If unknown, log the exception type for one week and then specify.

**Output:** The codebase now has explicit contracts. Human and AI read the same interfaces.

### Phase 3: Verification Lock-in (brings score from ~14 → ~18+)

Goal: make violations impossible by enforcing contracts automatically.

1. **Add `tests/test_architecture.py`** with layer violation tests and import cycle detection.
2. **Add one integration test per blueprint** that verifies the happy path against the data contract.
3. **Set up type checking in CI** (mypy --strict or pyright).
4. **Run the Determinism Audit again.** Score should be ≥ 18.

**Output:** The codebase is now deterministic. Functional changes can proceed safely.

### Phase Decision Heuristic

| Current Score | What to do |
|--------------|------------|
| 0-5 | Run all three phases before ANY functional change |
| 6-11 | Phase 1 + Phase 2 minimum. Phase 3 before touching high-risk areas |
| 12-17 | Phase 2 for the module you're modifying. Phase 3 after modifications |
| 18-21 | Safe to modify directly. Run Phase 3 for new modules only |

### The Golden Rule

> **Every functional change to low-determinism code makes it LOWER determinism.**
> Don't add features to a house with no foundation. Pour the foundation first.

---

## Rules for AI Agents

When working as a coding agent, follow these rules strictly. These exist to **eliminate cognitive divergence** between you and the human.

### Mandatory (violating these = determinism failure)

1. **Never start coding without understanding the architecture.** Run the READING workflow first.
2. **Never write a function without its 5-question contract first.** See Workflow B, Step 0.
3. **Never use `Any`.** If the type is unknown, define it. If it's truly dynamic, wrap it in a named NewType with a comment explaining why.
4. **Never swallow exceptions silently.** Every `except` block must log, re-raise, or handle a SPECIFIC exception type. `except Exception: pass` is forbidden.
5. **Never have undocumented side effects.** If a function writes to a database, its name must say so (`save_user`, not `get_user`).
6. **Never return different types from different branches.** A function returns `User | None` or `User` or raises — never `User | None | str | dict`.
7. **Never violate layer boundaries.** If domain/ needs something from infrastructure/, define a Protocol in domain/ and implement in infrastructure/.

### When the Human Corrects You

A correction is NOT a request to fix the code. It is evidence of a **missing constraint**. Before fixing:
1. Identify which determinism gap caused the error
2. Add the constraint (type hint, docstring, exception declaration, test)
3. Then fix the code against the updated constraint
4. Tell the human which constraint you added so they can verify it

### Architecture test rules

- Architecture tests are not optional. Run them after every change.
- Contracts before implementation. Always. No exceptions.

### Layer decision shortcut

| If the code... | It belongs in... |
|---|---|
| Uses external systems (DB, HTTP, MQ, files) | infrastructure |
| Orchestrates multiple operations | application |
| Is pure logic with no I/O | domain |
| Handles incoming requests/commands | interfaces |

---

## Tool-Agnostic Summary

This skill works with ANY coding agent (Codex, Claude Code, Cursor, Copilot, etc.).
The files and conventions are standard — no proprietary formats.

The only thing AI-specific is the **reading order**: AI agents have limited context windows.
Reading `contracts.py` (50-200 lines) gives them 80% of the architecture understanding.
Reading random files gives them noise. Order matters.

See `references/worked-example-nuno-tools.md` for a complete real-world analysis including
determinism scoring, gap identification, and upgrade path.

---

## Pitfalls

- **Don't over-Protocol early.** For a 200-line script, a directory structure alone is enough.
  Add contracts when the project has 3+ modules that interact.
- **Architecture tests can become brittle.** Test for layer violations (import rules),
  not for specific class names. "domain cannot import application" is a good test.
  "Coordinator must be in application/services.py" is a bad test.
- **Contracts are not frozen.** Protocols can and should evolve. The architecture test just
  ensures that when they change, nothing silently breaks.
- **Don't cargo-cult the exact directory names.** `domain/application/infrastructure/interfaces`
  is one valid pattern. If the project uses `core/services/adapters/api`, that's fine too.
  The principle is what matters: inner layers don't know about outer layers.
