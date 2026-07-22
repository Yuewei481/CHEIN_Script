# CHEIN Script

CHEIN Script 是一个用于 CHEIN 商家后台的商品趋势销量采集与 WPS 云表格同步脚本。

脚本会打开浏览器登录 CHEIN 商家后台，进入商品分析页面，逐个打开商品的趋势图，通过鼠标悬浮指定日期读取销量。读取完成后，脚本会用本地 Excel 表格中的 SPU 对照商品名字，只保留 Excel 中存在的商品，最后把匹配后的销量写入指定 WPS 云文档中的对应区域。

## 本脚本功能

- 自动打开可见 Google Chrome，进入 CHEIN 商家后台。
- 自动填写账号密码；如果出现手机验证码，等待人工输入。
- 进入 `数据 -> 商品分析 -> 商品明细` 页面。
- 逐个打开商品的 `查看趋势` 弹窗。
- 支持读取一个或多个日期的销量；不配置日期时默认读取昨天。
- 通过鼠标悬浮趋势图中的目标日期，读取提示框里的 `销量` 数字。
- 每次点击、输入、悬浮、关闭弹窗前加入 2-5 秒随机等待，模拟人工操作节奏。
- 支持读取所有商品，也支持用 `MAX_PRODUCTS` 限制测试数量。
- 使用本地 Excel 表格按 SPU 匹配商品名字。
- 如果采集到的 SPU 不存在于 Excel 对照表中，会自动过滤，不进入后续写入。
- 输出匹配后的 `SPU / 商品名字 / 日期 / 销量` JSON 和 CSV 文件。
- 打开 WPS 云文档，切换到指定 sheet。
- 在 WPS 表格中找到指定区域标题，例如 `CHEIN 1`。
- 按 `日期 + 商品名字` 匹配已有行，只写入 `销量（件）` 列。
- 支持 WPS 写入前 dry run，先预览将要写入哪些单元格。
- 写入后会保存复制出来的 WPS TSV 片段，方便检查和排错。

## 一、项目结构

```text
CHEIN_Script/
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── scripts/
│   ├── login_geiwohuo.mjs
│   ├── collect_product_trends.mjs
│   ├── match_excel.mjs
│   ├── write_wps.mjs
│   └── sync_wps.mjs
└── src/
    ├── config.mjs
    └── excel_mapping.mjs
```

注意：`.env` 必须放在项目根目录，也就是和 `README.md` 同一层。

## 二、Mac 安装教程

下面步骤只需要第一次安装时做一次。

### 1. 安装基础软件

Mac 需要：

- Git
- Node.js 20 或更高版本
- npm
- Google Chrome


检查是否安装成功：

```bash
git --version
node -v
npm -v
```

### 2. 下载项目

推荐把项目放在：

```text
/Users/你的用户名/Documents/project/CHEIN_Script
```

运行：

```bash
cd ~/Documents
mkdir -p project
cd project
git clone https://github.com/Yuewei481/CHEIN_Script.git
cd CHEIN_Script
```

如果你已经下载过项目，只需要进入项目根目录：

```bash
cd /Users/你的用户名/Documents/project/CHEIN_Script
```

### 3. 安装依赖

在项目根目录运行：

```bash
npm install
npx playwright install chromium
```

本项目默认使用本机 Google Chrome 运行自动化。如果 Chrome 已经安装，一般不需要额外配置浏览器路径。

### 4. 创建并修改 `.env`

在项目根目录运行：

```bash
cp .env.example .env
open -e .env
```

如果 `open -e .env` 没打开，也可以用：

```bash
nano .env
```

修改完 `.env` 后记得保存。

## 三、Windows 安装教程

Windows 推荐使用 Git Bash 或 PowerShell，但不要混用。你选择哪个终端，就从下载项目、安装依赖、运行脚本开始一直使用同一个终端。

### 1. 安装基础软件

Windows 需要：

- Git for Windows
- Node.js 20 或更高版本
- Google Chrome

安装 Node.js 后，关闭旧的终端窗口，重新打开一个新的终端。

检查版本：

```bash
git --version
node -v
npm -v
```

### 2. 下载项目

Git Bash 示例：

```bash
cd /c/Users/你的用户名/Documents
git clone https://github.com/Yuewei481/CHEIN_Script.git
cd CHEIN_Script
```

PowerShell 示例：

```powershell
Set-Location "$HOME\Documents"
git clone https://github.com/Yuewei481/CHEIN_Script.git
Set-Location "$HOME\Documents\CHEIN_Script"
```

### 3. 安装依赖

```bash
npm install
npx playwright install chromium
```

### 4. 创建并修改 `.env`

Git Bash：

```bash
cp .env.example .env
notepad .env
```

PowerShell：

```powershell
Copy-Item .env.example .env
notepad .env
```

Windows 路径推荐在 `.env` 中写成 `C:/Users/...`，不要写中文引号。

## 四、`.env` 配置说明

`.env` 里不要在等号两边加空格。

正确：

```env
TREND_DATES=2026/06/15,2026/06/14
```

错误：

```env
TREND_DATES = 2026/06/15,2026/06/14
```

### 登录配置

```env
GEIWOHUO_USERNAME=
GEIWOHUO_PASSWORD=
GEIWOHUO_OTP_WAIT_MS=300000
```

- `GEIWOHUO_USERNAME`：CHEIN 商家后台账号。
- `GEIWOHUO_PASSWORD`：CHEIN 商家后台密码。
- `GEIWOHUO_OTP_WAIT_MS`：出现手机验证码时最多等待多久。`300000` 表示 5 分钟。

不要把真实账号密码上传到 GitHub。真实账号密码只写在本机 `.env` 中。

### 浏览器和操作节奏

```env
HUMAN_DELAY_MIN_MS=2000
HUMAN_DELAY_MAX_MS=5000
HEADLESS=0
CLOSE_CHROME_AFTER_RUN=1
```

- `HUMAN_DELAY_MIN_MS` / `HUMAN_DELAY_MAX_MS`：每一步操作之间的随机等待时间。默认 2-5 秒。
- `HEADLESS=0`：显示浏览器窗口。日常使用建议保持 `0`，方便你观察页面状态。
- `HEADLESS=1`：隐藏浏览器窗口，不建议日常使用。
- `CLOSE_CHROME_AFTER_RUN=1`：脚本结束后关闭脚本打开的 Chrome。

### 商品趋势采集

```env
MAX_PRODUCTS=0
TREND_DATES=
```

- `MAX_PRODUCTS=0`：采集当前页面和翻页中能找到的所有商品。
- `MAX_PRODUCTS=3`：只采集前 3 个商品，适合测试。
- `TREND_DATES`：要读取的日期，多个日期用英文逗号分隔。
- `TREND_DATES` 留空时，默认只读取昨天。

日期示例：

```env
TREND_DATES=2026/06/15,2026/06/14,2026/06/13
```

也可以写：

```env
TREND_DATES=2026-06-15,2026-06-14,2026-06-13
```

### Excel 对照表

```env
ACCOUNT_COUNT=1

ACCOUNT_1_NAME=CHEIN 1
ACCOUNT_1_SOURCE_EXCEL=
ACCOUNT_1_SOURCE_EXCEL_SHEET=
ACCOUNT_1_SOURCE_EXCEL_SPU_COLUMN=E
ACCOUNT_1_SOURCE_EXCEL_NAME_COLUMN=B
ACCOUNT_1_GROUP_TITLE=CHEIN 1
```

- `ACCOUNT_COUNT`：账号数量。当前项目主要按一个账号运行，通常写 `1`。
- `ACCOUNT_1_NAME`：账号任务名称，只用于日志显示。
- `ACCOUNT_1_SOURCE_EXCEL`：本地 Excel 对照表路径。
- `ACCOUNT_1_SOURCE_EXCEL_SHEET`：Excel sheet 名。留空时默认读取第一个 sheet。
- `ACCOUNT_1_SOURCE_EXCEL_SPU_COLUMN`：Excel 中 SPU 所在列。
- `ACCOUNT_1_SOURCE_EXCEL_NAME_COLUMN`：Excel 中商品名字所在列。
- `ACCOUNT_1_GROUP_TITLE`：这个账号在 WPS 表格里的区域标题。

示例：

```env
ACCOUNT_1_SOURCE_EXCEL=/Users/你的用户名/Desktop/工作簿12.xlsx
ACCOUNT_1_SOURCE_EXCEL_SPU_COLUMN=E
ACCOUNT_1_SOURCE_EXCEL_NAME_COLUMN=B
ACCOUNT_1_GROUP_TITLE=CHEIN 1
```

如果采集到的 SPU 在 Excel 中找不到，这个商品的数据会被过滤，不会写入 WPS。

### WPS 云文档写入

```env
WPS_DOC_URL=https://www.kdocs.cn/l/your-wps-document-id
WPS_SHEET_NAME=运营数据记录表
WPS_GROUP_TITLE=CHEIN 1
WPS_SCAN_RANGE=A1:AZ2000
WPS_INITIAL_WAIT_MS=600000
WPS_DRY_RUN=1
WPS_SELECT_ALL=0
WPS_HORIZONTAL_SCROLL_X=0
WPS_HORIZONTAL_DRAG_X=0
WPS_USER_DATA_DIR=
MATCHED_TRENDS_JSON=
```

- `WPS_DOC_URL`：WPS 云文档链接。
- `WPS_SHEET_NAME`：要写入的 sheet 名。
- `WPS_GROUP_TITLE`：WPS 第 1 行中的区域标题，例如 `CHEIN 1`。
- `WPS_SCAN_RANGE`：扫描范围。脚本会在这个范围中找标题、日期、商品名字和销量列。
- `WPS_INITIAL_WAIT_MS`：打开 WPS 后等待登录、弹窗和文档加载的最长时间。`600000` 表示 10 分钟。
- `WPS_DRY_RUN=1`：只预览要写入的位置，不真正写入。
- `WPS_DRY_RUN=0`：正式写入。
- `WPS_USER_DATA_DIR`：WPS 专用 Chrome 用户目录。留空时使用临时目录。
- `MATCHED_TRENDS_JSON`：指定要写入的匹配结果 JSON。留空时使用最新的 `matched-trends-*.json`。

日常建议先用：

```env
WPS_DRY_RUN=1
```

确认输出单元格正确后，再改成：

```env
WPS_DRY_RUN=0
```

## 五、运行流程

完整流程分三步：采集、匹配、写入。

### 1. 采集商品趋势销量

```bash
npm run collect:product-trends
```

脚本会：

1. 打开可见 Chrome。
2. 进入 CHEIN 商家后台。
3. 自动输入账号密码。
4. 如果出现验证码，等待你手动输入。
5. 进入商品分析和商品明细页面。
6. 逐个打开 `查看趋势`。
7. 悬浮目标日期，读取提示框中的销量。
8. 保存采集结果。

输出文件在：

```text
output/playwright/product-trends-时间.json
output/playwright/product-trends-时间.csv
```

### 2. 用 Excel 匹配商品名字

```bash
npm run match:excel
```

脚本会读取最新的 `product-trends-*.json`，用 `.env` 中配置的 Excel 对照表按 SPU 匹配商品名字。

输出文件在：

```text
output/playwright/matched-trends-时间.json
output/playwright/matched-trends-时间.csv
```

匹配结果只保留：

- SPU
- 商品名字
- 日期
- 销量

### 3. 预览 WPS 写入位置

正式写入前建议先 dry run：

```bash
WPS_DRY_RUN=1 npm run write:wps
```

脚本会打开 WPS 云文档，找到对应 sheet 和区域标题，然后打印计划写入的单元格。

示例：

```text
WPS group: CHEIN 1
Detected columns: {"date":"O","productName":"P","sales":"R"}
Writable rows: 9
Missing rows: 0
Dry run enabled. Planned writes:
R904: 2026/06/15 父亲节盒子 => 4
```

如果 `Missing rows` 不为 0，说明 WPS 里没有找到对应的 `日期 + 商品名字` 行，需要先检查 WPS 表格或 Excel 对照表。

### 4. 正式写入 WPS

确认 dry run 没问题后，运行：

```bash
WPS_DRY_RUN=0 npm run write:wps
```

脚本会把销量写入 WPS 中匹配到的 `销量（件）` 列。

## 六、常用运行示例

### 读取昨天并写入

`.env` 中保持：

```env
TREND_DATES=
MAX_PRODUCTS=0
```

运行：

```bash
npm run collect:product-trends
npm run match:excel
WPS_DRY_RUN=1 npm run write:wps
WPS_DRY_RUN=0 npm run write:wps
```

### 读取指定多个日期

Mac / Git Bash：

```bash
TREND_DATES=2026/06/15,2026/06/14,2026/06/13 npm run collect:product-trends
npm run match:excel
WPS_DRY_RUN=1 npm run write:wps
WPS_DRY_RUN=0 npm run write:wps
```

PowerShell：

```powershell
$env:TREND_DATES="2026/06/15,2026/06/14,2026/06/13"
npm run collect:product-trends
npm run match:excel
$env:WPS_DRY_RUN="1"
npm run write:wps
$env:WPS_DRY_RUN="0"
npm run write:wps
```

### 只测试前 3 个商品

```bash
MAX_PRODUCTS=3 npm run collect:product-trends
```

测试没问题后，再改回：

```bash
MAX_PRODUCTS=0
```

## 七、从开始到结束需要人工做什么

正常情况下，你一开始不需要手动打开网站或 WPS。只需要在项目目录运行命令，脚本会自己打开 Chrome。

可能需要人工操作的地方：

### 1. CHEIN 商家后台手机验证码

脚本会自动输入账号密码并点击登录。

如果出现手机验证码，你需要在脚本打开的 Chrome 中输入验证码并确认。脚本会等待 `GEIWOHUO_OTP_WAIT_MS` 设置的时间。

### 2. WPS 云文档登录或弹窗

如果 WPS 要求登录，或者弹出授权、提示、公告窗口，你需要在脚本打开的 Chrome 中手动处理。

脚本会等待 `WPS_INITIAL_WAIT_MS` 设置的时间，默认最多 10 分钟。

### 3. dry run 结果确认

正式写入前，建议先看 dry run 输出：

- `WPS group` 是否是目标区域，例如 `CHEIN 1`
- `Detected columns` 中日期、商品名、销量列是否正确
- `Writable rows` 是否符合预期
- `Missing rows` 是否为 0
- 计划写入的日期、商品名、销量是否合理

确认后再正式写入。

## 八、输出文件

脚本输出都在：

```text
output/playwright/
```

常见文件：

- `product-trends-*.json`：原始采集结果。
- `product-trends-*.csv`：原始采集结果 CSV。
- `matched-trends-*.json`：Excel 对照后的结果。
- `matched-trends-*.csv`：Excel 对照后的 CSV。
- `wps-copied-*.tsv`：WPS 写入前复制出的表格片段，用于排查和验证。
- `wps-missing-*.json`：WPS 中没有匹配到的行。
- `*.png`：页面异常时保存的截图。

`output/` 已经被 `.gitignore` 忽略，不会上传到 GitHub。

## 九、运行时注意事项

- 不要关闭脚本打开的浏览器。
- 浏览器可以放到旁边，但不要最小化。
- 采集时每一步会随机等待 2-5 秒，这是为了模拟人工操作。
- 如果 CHEIN 商家后台或 WPS 页面加载慢，请耐心等待。
- 如果 WPS 表格结构变了，需要同步调整 `.env` 中的 `WPS_GROUP_TITLE` 和 `WPS_SCAN_RANGE`。
- 如果 WPS 大范围复制只复制到部分行，可以把 `WPS_SCAN_RANGE` 缩小到目标日期附近再验证。
- 运行正式写入前，建议先 dry run。
- `.env` 修改后必须保存，再重新运行脚本才会生效。
- Excel 对照表里的 SPU 列和商品名字列必须和 `.env` 配置一致。

## 十、常见问题

### 1. 提示缺少账号密码

报错类似：

```text
Missing credentials. Set GEIWOHUO_USERNAME and GEIWOHUO_PASSWORD before running.
```

检查 `.env`：

```env
GEIWOHUO_USERNAME=
GEIWOHUO_PASSWORD=
```

确认已经填写，并且 `.env` 在项目根目录。

### 2. 一直停在验证码页面

说明 CHEIN 商家后台要求手机验证。

你需要在脚本打开的 Chrome 中手动输入验证码。如果 5 分钟不够，可以调大：

```env
GEIWOHUO_OTP_WAIT_MS=600000
```

`600000` 表示 10 分钟。

### 3. Excel 匹配结果为空

可能原因：

- `ACCOUNT_1_SOURCE_EXCEL` 路径不对。
- `ACCOUNT_1_SOURCE_EXCEL_SPU_COLUMN` 配错。
- Excel 中的 SPU 和后台读取到的 SPU 格式不一致。
- 采集结果里没有目标商品。

可以先查看：

```text
output/playwright/product-trends-*.csv
```

确认采集结果里是否有 SPU。

### 4. WPS dry run 有 Missing rows

说明 WPS 中没有找到对应的 `日期 + 商品名字` 行。

检查：

- WPS 中日期是否存在。
- WPS 商品名字是否和 Excel 对照表完全一致。
- `WPS_GROUP_TITLE` 是否正确。
- `WPS_SCAN_RANGE` 是否覆盖到目标区域。

### 5. WPS 写入到了错误区域

先停止脚本，不要继续正式写入。

然后检查 dry run 输出：

- `Detected columns` 是否正确。
- `Planned writes` 是否是你想写入的单元格。
- 当前 WPS 是否切到了正确 sheet。

建议正式写入前始终先运行：

```bash
WPS_DRY_RUN=1 npm run write:wps
```

### 6. Chrome 没有自动关闭

如果设置了：

```env
CLOSE_CHROME_AFTER_RUN=1
```

脚本正常结束后会尝试关闭自己打开的 Chrome。

如果因为错误停住，并且设置了 `KEEP_BROWSER_ON_ERROR=1`，浏览器会保留，方便你检查页面状态。

## 十一、不要上传的内容

以下内容已经通过 `.gitignore` 忽略，不要上传到 GitHub：

- `.env`
- `.env.*`
- `node_modules/`
- `output/`
- `logs/`
- 浏览器用户数据目录
- 任何包含真实账号、密码、验证码、云文档私密链接的文件

`.env.example` 可以上传，但里面只应该放示例值，不要放真实密码。

## 十二、更新项目

如果 GitHub 上有新版代码，在项目根目录运行：

```bash
git pull
npm install
```

如果 Playwright 提示浏览器版本不匹配，再运行：

```bash
npx playwright install chromium
```

## 十三、仓库描述

推荐 GitHub description：

```text
自动采集 CHEIN 商品每日销量，并同步到 WPS 云表格。
```
