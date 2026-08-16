# Pilot record v1

记录文件最小形状：

```json
{
  "schema_version": 1,
  "pilot_id": "pilot-001",
  "work_item_id": "WI-10",
  "comparison_class": "loopx-bound-decide",
  "conclusion": "NET_BENEFIT",
  "quality_preserved": {
    "authorization_preserved": true,
    "safety_preserved": true,
    "result_quality_preserved": true,
    "evidence_integrity_preserved": true
  },
  "metrics": {
    "planning_wall_clock": {
      "availability": "available",
      "value": 120000,
      "origin": "estimated",
      "unit": "ms"
    },
    "execution_wall_clock": {
      "availability": "data_insufficient",
      "value": null,
      "origin": "unavailable",
      "unit": "ms"
    },
    "total_wall_clock": {
      "availability": "unavailable",
      "value": null,
      "origin": "unavailable",
      "unit": "ms"
    },
    "human_coordination_time": {
      "availability": "available",
      "value": 1800000,
      "origin": "estimated",
      "unit": "ms"
    },
    "zero_effect_attempts": {
      "availability": "available",
      "value": 1,
      "origin": "measured",
      "unit": "count"
    },
    "coordination_wakeups": {
      "availability": "available",
      "value": 3,
      "origin": "measured",
      "unit": "count"
    },
    "rework": {
      "availability": "available",
      "value": 0,
      "origin": "measured",
      "unit": "count"
    },
    "setup_cost": {
      "availability": "data_insufficient",
      "value": null,
      "origin": "unavailable"
    },
    "native_usage": {
      "availability": "unavailable",
      "value": null,
      "origin": "unavailable"
    }
  },
  "baseline": {
    "source": "operator-observation",
    "observed_at": "2026-08-16T00:00:00Z",
    "method_ref": "docs/SPEC.md#operational-definitions"
  }
}
```

说明：

- `rework.value=0` 仅在派生结果确实为零次换版时合法。
- 缺失墙钟不得写成 `0`。
- `native_usage` 缺原生报告时必须 `unavailable` 或 `data_insufficient`。
- `baseline` 不得出现 `/home/...`、`C:\\...`、内部项目名或 token。
- 用 `native_usage` 或步骤数单独作为 `NET_BENEFIT` 依据的记录必须被拒绝。
