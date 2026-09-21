# 内容数据契约

所有 JSON 使用 UTF-8、双引号和稳定 ID。未知信息使用 `null` 或 `status: "unverified"`，禁止用看似真实的占位数字。

## `brief.json`

```json
{
  "schema_version": "1.0",
  "topic": "项目名称",
  "audience": "目标观众",
  "occasion": "self_read | internal_review | defense | keynote | pitch",
  "core_takeaway": "观众最终记住的一句话",
  "verified_facts": [{"id": "fact-01", "claim": "事实", "source": "文件、数据或用户确认"}],
  "unknowns": [],
  "privacy_boundaries": [],
  "route": {"view": "scroll", "structure": "modular"}
}
```

## `outline.json`

```json
{
  "schema_version": "1.0",
  "narrative_arc": "project | idea | outcome",
  "template": "terminal-mint",
  "slides": [
    {
      "id": "slide-01",
      "purpose": "这一页要让观众产生的反应",
      "message": "唯一核心信息",
      "evidence_ids": ["fact-01"],
      "layout": "cover",
      "content_budget": {"headline_chars": 28, "body_chars": 80, "items": 0},
      "concept_animation": null,
      "speaker_notes": null
    }
  ]
}
```

## fragment 文件

```json
{
  "schema_version": "1.0",
  "batch": 1,
  "slides": [
    {
      "id": "slide-01",
      "html": "<section data-slide id=\"slide-01\">...</section>",
      "css": "",
      "js": ""
    }
  ]
}
```

JS 只能进入 `js` 字段；HTML 字段不得包含 `<script>`。CSS 只能作用于当前展示的命名空间，不修改运行时契约类。

## `checkpoint.json`

```json
{
  "schema_version": "1.0",
  "phase": "understand | outline | select | write | assemble | verify | deliver",
  "status": "ready | in_progress | completed | failed | blocked",
  "route": {"view": "stage", "structure": "modular"},
  "template": "terminal-mint",
  "slides_total": 10,
  "slides_done": 4,
  "completed_batches": [1],
  "last_error": null,
  "updated_at": "ISO-8601"
}
```

## `deck-manifest.json`

```json
{
  "schema_version": "1.0",
  "entry": "project-showcase.html",
  "route": {"view": "stage", "structure": "modular"},
  "template": "terminal-mint",
  "slides": [{"id": "slide-01", "title": "标题"}],
  "verified_at": "ISO-8601",
  "validation": {"static": "PASS", "browser": "PASS", "clicker": "NOT_RUN"},
  "revisions": []
}
```

manifest 不记录私人对话、思维过程、凭证、本机用户目录或完整源材料。
