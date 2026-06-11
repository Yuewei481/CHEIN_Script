# CHEIN WPS Sync

用于爬取 CHEIN 数据，并将结果写入云 WPS 的新项目。

## 目标

- 抓取 CHEIN 相关数据
- 清洗和整理爬取结果
- 写入云 WPS 表格或文档

## 目录

- `src/`: 项目源码
- `.env.example`: 本地环境变量示例

## 开发

后续可以在 `.env` 中配置账号、接口密钥或运行参数。`.env` 不会提交到 Git。

## 数据同步流程

1. 复制 `.env.example` 为 `.env`，配置登录账号、参考 Excel、WPS 链接、sheet 名称和标题。
2. 运行采集：

   ```bash
   npm run collect:product-trends
   ```

3. 将最新采集结果和参考 Excel 按 SPU 合并，生成待写入 WPS 的 CSV/JSON：

   ```bash
   npm run sync:wps
   ```

当前 `WPS_WRITE_MODE=prepare` 会只生成待写入文件，不直接写云 WPS。等 WPS 表格页面的 sheet、标题、粘贴位置确认后，可以把写入模式接到 Playwright 流程。
