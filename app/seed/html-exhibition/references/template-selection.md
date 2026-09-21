# 模板选择：Tone-First Matching

模板先匹配“这场演示应该给人什么感受”，再检查场合和内容承载能力。行业只能作为背景，不能直接决定模板。

## 渐进加载

1. 先读 `references/template-pack/selection-index.json`，不得批量读取 34 份 `design.md`。
2. 过滤不支持目标场合、密度、CJK 或固定舞台的模板。
3. 选三个候选：safe、bold、wildcard。
4. 只读三个候选的 `preview.md`，给出一行适配理由和一行风险。
5. 用户选定后，只读该模板 `design.md`；除非 design 缺关键实现细节，不读取其他模板。
6. 未选择时使用原生 `terminal-mint`，不随机决定。

## 匹配顺序

| 优先级 | 维度 | 判断 |
|---:|---|---|
| 1 | tone | professional、academic、playful、editorial、geeky 等是否一致 |
| 2 | mood | 冷静、热烈、克制、叛逆、文学等情绪是否一致 |
| 3 | formality | 与观众关系和场合正式度是否匹配 |
| 4 | density | 模板能否承载实际信息量 |
| 5 | language | CJK 字体、行高、大小写和标点是否可用 |
| 6 | renderer | scroll／stage 与固定画布约束是否兼容 |

`avoid_for` 是强警告而非绝对行业禁令。若风险与用户目标冲突，换候选；不要偷偷修改模板字体、主色、网格和装饰语言来“救”一个不合适模板。

## 原生安全模板：`terminal-mint`

- tone：geeky、technical、restrained。
- mood：dark、calm、precise。
- formality：medium-high。
- density：medium。
- renderer：scroll、stage。
- CJK：支持。
- 适用：软件项目、Agent 系统、研究原型、工程复盘。

## 来源治理

34 套 bold 模板来自固定 commit，来源和 MIT 许可证见 `THIRD_PARTY_NOTICES.md`。升级模板包时必须重新检查数量、断链、许可证、CJK 和选择索引；不得直接跟随远端 main。
