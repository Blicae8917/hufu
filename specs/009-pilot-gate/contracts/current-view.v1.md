# CurrentView v1 additions

`view_schema_version` 保持 `1`。现有槽位不变。`task_authority` 仍为 Hufu，不得变成网页。

新增槽：

## `pilot`

未记录：

```json
{ "availability": "data_insufficient", "value": null }
```

已记录：

```json
{
  "availability": "available",
  "value": {
    "pilot_id": "pilot-001",
    "work_item_id": "WI-10",
    "comparison_class": "loopx-bound-decide",
    "conclusion": "NET_BENEFIT"
  }
}
```

`value` 不得包含绝对路径、凭据、内部项目名或用量明细原文。

## `expansion_gate`

未记录：

```json
{ "availability": "data_insufficient", "value": null }
```

已记录：

```json
{
  "availability": "available",
  "value": {
    "status": "closed",
    "comparison_class": "loopx-bound-decide",
    "round_count": 1,
    "net_benefit_rounds": 1,
    "web_implemented": false,
    "serve_allowed": false
  }
}
```

`web_implemented` 与 `serve_allowed` 在本模块恒为 `false`。三轮净收益时 `status` 可为 `evaluation_allowed`，但上述两字段仍为 `false`。

禁止：把缺失轮数、缺失唤醒次数或缺失用量输出为 `0`。
