# 可复用音频测量配置

`experiments/` 保存可重复使用的基准矩阵，供 `scripts/benchmarks/run-benchmark-matrix.js` 使用，涵盖格式、空闲、IPC、seek 与稳定性场景。测量脚本和测试媒体位于 `scripts/benchmarks/`。

这些配置是测量工具输入。运行结果、临时图表及一次性分析放在忽略的 `tmp/`，正式产品行为以 `docs/` 为准。该目录当前不承载产品发布文档或论文正文。
