# CHEIN WPS Sync

用于爬取 CHEIN 商品趋势数据，并用本地 Excel 按 SPU 对照商品名字。

## 目标

- 抓取 CHEIN 相关数据
- 用 Excel 的 SPU 列过滤采集结果
- 输出 SPU 码、商品名字、采集日期和销量

## 目录

- `src/`: 项目源码
- `.env.example`: 本地环境变量示例

## 开发

后续可以在 `.env` 中配置账号、接口密钥或运行参数。`.env` 不会提交到 Git。

## 数据同步流程

1. 复制 `.env.example` 为 `.env`，配置登录账号、参考 Excel、SPU 列和商品名字列。
2. 运行采集：

   ```bash
   npm run collect:product-trends
   ```

   默认读取昨天日期。要指定日期，用 `TREND_DATES`，多个日期用英文逗号分隔：

   ```bash
   TREND_DATES=2026/06/10,2026/06/09 npm run collect:product-trends
   ```

3. 将最新采集结果和参考 Excel 按 SPU 对照，只保留 Excel 中存在的商品，并生成 CSV/JSON：

   ```bash
   npm run match:excel
   ```

输出文件在 `output/playwright/`，文件名形如 `matched-trends-*.csv` 和 `matched-trends-*.json`。当前脚本不会写入云 WPS。
