# Cogent

**Write down what you didn't say. So AI doesn't have to guess.**

---

## What is Cogent?

When you tell AI "write a PDF converter," your brain has 100 details you forgot to mention: max file size, what to do with temp files, error handling for corrupted input, filename encoding...

You said 10. The AI guessed the other 90. Half were wrong — those became bugs.

Cogent is a specification-first framework that forces you and the AI to agree on all 100 details **before** a single line of code is written.

### Before Cogent

```python
def convert(file):
    # What is 'file'? What does this return? What happens on failure?
    ...
    return result
```

### After Cogent

```python
def convert_pdf_to_docx(
    pdf_data: bytes,
    max_size_mb: int = 50
) -> str:
    """Convert PDF to Word document.

    Side effects: creates .docx in downloads/
    Errors: raises CorruptedFileError if PDF is damaged
    """
```

No guessing. No ambiguity. Human and AI share the same understanding of what this function does, what it needs, what it returns, what it changes, and what can go wrong.

---

## Two Modes

### Starting from Scratch

AI uses progressive questioning to surface your implicit requirements, then codes against the agreed contract.

```
You: "Build a PDF to Word converter"
AI:  "Max file size? Keep or delete the original? What if the PDF is damaged?"
You:  [answers]
AI:  "Got it. Here's the contract. I'll start coding once you confirm."
```

### Inheriting Existing Code

AI audits the codebase for uncertainty, produces a clean human-readable explanation of the project, then guides constraint-aware modifications.

```
You: "Help me understand this codebase"
AI:  [Produces a plain-language guide: what each module does, how data flows, 
      where to start if you want to modify something]
AI:  [Internally tracks determinism score; patches constraints before making changes]
```

---

## Five Layers of Determinism

Each layer eliminates one more thing the AI has to guess.

| Layer | What it does |
|-------|-------------|
| **Types** | Specify exact input and output types — `bytes` vs `str` vs `dict` |
| **Docstrings** | One line stating what the function does, so the AI doesn't infer from the name |
| **Side effects** | Declare everything the function changes: files, databases, global state |
| **Errors** | Define what happens on failure — don't let the AI silently swallow exceptions |
| **Tests** | Verify the contract automatically — if the AI violates it, the test fails |

**All five layers done → the AI has zero room to guess.**

---

## Quick Start

Cogent is a skill file for AI coding agents (Hermes Agent, Claude Code, Codex, Cursor, etc.).

### Hermes Agent

```bash
cp SKILL.md ~/.hermes/skills/software-development/cogent/SKILL.md
```

### Other AI Coding Tools

Provide the skill content as system instructions or project rules at the start of your session:

> "Load the Cogent specification and work determinism-first."

---

## Philosophy

> **If you can't specify it, the AI can't code it correctly.**

Ambiguity is a bug. An untyped parameter, an undocumented side effect, a silently swallowed exception — these are not style issues. They are cracks where human and AI form different mental models of the code. Cogent treats them as defects and eliminates them before they become problems.

---

## License

MIT — see [LICENSE](./LICENSE) for full text.

---

# Cogent · 中文说明

**把你没说的写下来。让 AI 不用猜。**

---

## Cogent 是什么？

你告诉 AI「写一个 PDF 转换工具」。你脑子里有 100 个细节没说：文件能多大？临时文件删不删？文件损坏了怎么办？文件名有中文怎么办？……

你说了 10 个。AI 猜了剩下 90 个。猜错的那 50 个就成了 bug。

Cogent 是一套「先说清楚，再写代码」的规范。它要求人和 AI 在动手写任何代码之前，对全部细节达成一致。

### 没有 Cogent 的时候

```python
def convert(file):
    # AI 不知道：file 是啥？返回啥？失败了怎么办？
    ...
    return result
```

### 有了 Cogent 之后

```python
def convert_pdf_to_docx(
    pdf_data: bytes,         # 输入：PDF 文件的字节内容
    max_size_mb: int = 50    # 限制：最大文件大小
) -> str:                    # 输出：下载链接
    """将 PDF 转为 Word 文档。

    副作用：在 downloads/ 目录创建 .docx 文件
    错误：PDF 损坏时抛出 CorruptedFileError
    """
```

人和 AI 对这个函数做什么、要什么、返回什么、改了什么、会出什么错——理解完全一致。没有歧义，不需要猜。

---

## 两种模式

### 从零写代码

AI 通过层层提问帮你把说不清的想法挖出来，然后按约定好的合同写代码。

```
你： "写一个 PDF 转 Word"
AI： "文件大小有限制吗？转完删不删原文件？文件坏了怎么办？"
你： [一一回答]
AI： "明白了。这是合同，确认无误我开始写。"
```

### 接手已有项目

AI 检查代码的确定性，用大白话给你讲清楚项目结构，然后在修改时边补约束边保持对齐。

```
你： "帮我看看这个项目"
AI： [输出说明书：每个模块干什么、数据怎么走、想改哪找哪个文件]
AI： [内部记录确定性评分，改代码时自动补约束]
```

---

## 确定性的五个层次

每多做一层，AI 就少猜一件事。

| 层次 | 做什么 | 大白话 |
|------|--------|--------|
| **类型** | 标清楚输入和输出的类型 | 「输入是 PDF 字节，输出是下载链接」 |
| **说明** | 一句话说清楚这个函数干嘛 | 「这个函数做 PDF 转 Word」 |
| **副作用** | 声明这个函数会动什么东西 | 「会写文件到 downloads，会删原文件」 |
| **错误** | 写清楚出错了怎么办 | 「PDF 坏了就报错，别悄悄跳过」 |
| **测试** | 用代码自动验证 | 「跑测试，AI 没按合同写就挂」 |

**五层做完 → AI 完全不用猜。**

---

## 快速开始

Cogent 是一个给 AI 编程工具用的 skill 文件，适用于 Hermes Agent、Claude Code、Codex、Cursor 等。

### Hermes Agent

```bash
cp SKILL.md ~/.hermes/skills/software-development/cogent/SKILL.md
```

### 其他 AI 工具

在会话开始时将 SKILL.md 内容作为系统指令或项目规则提供给 AI：

> 「请加载 Cogent 规范，按确定性优先的方式工作。」

---

## 哲学

> **你说不清楚的东西，AI 一定写不对。**

歧义是 bug。一个没标类型的参数、一个没声明的副作用、一个被静默吞掉的异常——这些不是代码风格问题，而是人和 AI 认知分裂的裂缝。Cogent 把它们当缺陷处理，在问题发生之前就消除掉。

---

## 许可证

MIT — 完整文本见 [LICENSE](./LICENSE)
