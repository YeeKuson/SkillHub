# 验证契约

## 静态门禁

运行：

```text
python scripts/validate_skill.py .
python scripts/validate_deck.py <输出目录或入口 HTML>
node --check <每个 JavaScript 文件>
```

必须检查：Skill 名称与目录、frontmatter、直接引用、模板数量与路径、入口命名、本地资源断链、绝对本机路径、疑似秘密、`@latest` JavaScript、运行时加载、slide ID 唯一、stage 页面数量、fragment 结构。

## 浏览器门禁

真实浏览器至少检查：

- 1920×1080、1366×768、390×844。
- 首屏、内容最密页、概念动画页、末页。
- 控制台错误和网络失败。
- 横向溢出、遮挡、字体回退、对比度和焦点可见性。
- scroll 的章节跳转；stage 的前后翻页、fragment、Home／End、F、?。
- reduced-motion。

浏览器未运行时状态必须是 `NOT_RUN`，整体最高只能 `CONDITIONAL`，不得写“视觉验证通过”。

## 翻页笔门禁

自动测试只证明键位解析，不证明硬件兼容。实际设备未测试时在 manifest 中记录 `clicker: NOT_RUN`，同时给出 `?keydebug=1` 的验收方式。

## 内容门禁

- 所有结论能追溯到 `verified_facts`。
- 页面顺序与 outline 一致。
- 每页只承担一个主要目的。
- 无 lorem、TODO、XXXX、占位统计或遗留模板内容。
- 内容不超过当前布局预算；超出时拆页，不缩小到不可读。
- 演讲者备注不出现在观众页面。

## 交付状态

| 状态 | 条件 |
|---|---|
| PASS | 静态、JS、浏览器必需项通过，无阻断问题 |
| CONDITIONAL | 无阻断问题，但硬件或非必要外部能力为 NOT_RUN |
| FAIL | 静态失败、控制台错误、断链、入口错误、核心交互失败、内容事实不明 |
