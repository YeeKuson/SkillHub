# 检查点恢复与修订

## 恢复

进入已有输出目录时，先读 `work/checkpoint.json`：

- `completed`：验证阶段产物后进入下一阶段。
- `in_progress`：检查当前阶段临时产物，只重做未完成批次。
- `failed`：读取 `last_error`，修复根因后最多重试两次。
- `blocked`：缺少的事实、权限或环境没有变化时不盲目重试。

装配前对所有 fragment 做 JSON 和 slide ID 校验。不得因一个批次失败而重新生成已验证批次；不得合并部分成功、部分未知的产物。

## manifest 与 checkpoint 的边界

- checkpoint 是临时执行状态，可包含阶段和错误，但不含私人思维过程。
- manifest 是长期修订索引，只记录入口、路由、主题、页面摘要、验证和修订结果。
- 完成后可以保留 `work/` 供恢复；用户要求清理时再删除，不自动清理。

## 修订路由

| 影响 | 动作 |
|---|---|
| ≤50% 页面、文案或局部布局 | 读取 manifest，精准修改相关 slide |
| >50% 页面 | 重跑 outline 与 write，复用已验证 brief |
| 更换模板 | 重跑 select、write、assemble、verify |
| 改变核心结论或观众 | 从 understand 重新开始 |

每次修订追加：时间、请求摘要、受影响 slide ID、验证状态。不得记录用户私人对话全文。
