# 跨境汇率工具站 —— 零成本挂机（小白版部署说明）

一个全免费、全自动的跨境汇率查询工具站。整条链路：免费算力 + 免费数据 + 免费托管，零成本、无人值守。

## 这套东西会做什么（一句话版）

GitHub 的免费服务器每天自动帮你 → 拉最新汇率 → 生成 460+ 个汇率页面 → 自检没毛病 → 发布到 Cloudflare 免费网站。有异常会给你发邮件告警。你什么都不用管，只管等流量和广告收入。

## 你要准备的（各一次，跟着做，全程不用写代码）

### 第 1 步：建 GitHub 仓库（免费）

1. 打开 https://github.com 注册/登录（有账号就跳过注册）
2. 右上角 **+** → **New repository**
3. Repository name 随便填，比如 `rate-tool`
4. 下面选 **Public**（公开，这一步很重要：公开才免费无限跑）
5. 点 **Create repository**

### 第 2 步：把代码传上去（不用装任何软件）

在刚建好的空仓库页面里，点 **uploading an existing file** 蓝字链接（或 **Add file → Upload files**）：

1. 把本机 `rate-tool-site` 文件夹里的这些全选中，拖进网页上传框：
   - `.github` 文件夹（先点进去，把里面的 `workflows` 一起拖进去）
   - `scripts` 文件夹
   - `package.json`
   - `README.md`
2. 拉到页面底部，点绿色 **Commit changes**

> 小技巧：`.github` 是隐藏文件夹，Windows 资源管理器里若看不到，就在地址栏输入 `D:\Documents\deepseek-harness\default-workspace\rate-tool-site\.github` 回车进去找。

### 第 3 步：注册 Cloudflare（免费）

1. 打开 https://dash.cloudflare.com 注册/登录
2. 左侧菜单 **Workers & Pages** → 点 **Create** → **Pages** 标签 → **Upload assets**（直接上传资产）
3. 项目名填 `rate-tool`，点 **Create project**，先不用传文件（后面自动传），关掉即可

### 第 4 步：拿 Cloudflare 的钥匙（API Token + Account ID）

1. 点右上角头像 → **My Profile** → **API Tokens**
2. 点 **Create Token**
3. **不要**选任何现成模板。点最下面的 **Create Custom Token**（自定义）
4. Permissions 那一行这样配：
   - 第一个下拉选 **Account**
   - 第二个下拉选 **Cloudflare Pages**
   - 第三个下拉选 **Edit**
5. Account Resources 选你的账号（Include → 你的账号名）
6. 点 **Continue to summary** → **Create Token**
7. **立刻复制**那串 Token，存好（页面刷新后就看不到了）

Account ID 在哪：回到 Cloudflare 主页，右侧栏有个 **Account ID**，点复制即可。

### 第 5 步：把钥匙填进 GitHub

回到你的 GitHub 仓库页面：

1. 点 **Settings**（设置）→ 左侧 **Secrets and variables** → **Actions**
2. 看两个标签页，分别填：

**Secrets 标签**（Add repository secret）：
| Name | Secret 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 4 步复制的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | 第 4 步的 Account ID |

**Variables 标签**（New repository variable）：
| Name | Value |
|---|---|
| `CF_PAGES_PROJECT` | `rate-tool`（第 3 步的项目名） |
| `SITE_CONTACT` | 你的邮箱（会显示在网站"关于"页，可选但建议填） |

（`ADSENSE_PUB_ID` 和 `ADSENSE_SLOT_ID` 这两个变量先不用填，等以后广告申请下来再加）

### 第 6 步：开跑

1. 仓库页顶部点 **Actions** 标签
2. 左侧找到 **collect-and-deploy**，点它
3. 点 **Run workflow** → **Run workflow**
4. 等 1-2 分钟，看到绿色 ✓ 就是成功了

完成后，你的网站就在 `https://rate-tool.pages.dev`（把 `rate-tool` 换成你第 3 步起的项目名）。

## 日常：你什么都不用管

- 每天自动跑 2 次，自动更新汇率、自动发布
- 出事（数据源挂了、汇率异常）会自动停发并给你发邮件
- **唯一要记的**：每 3 个月去 Actions 手动点一次 Run workflow（GitHub 对长期没人碰的仓库会暂停自动运行，你点一次就续上）

## 以后想赚钱（等有流量再说，别急）

1. **AdSense 广告**：需要网站先运营 1~6 个月、有稳定流量后去 https://adsense.google.com 申请。**门槛说实话**：通常要绑定你自己的域名（约 60-70 元/年，这会打破"零成本"），且审核看原创内容深度。

   通过后要做两件事，再回来填**两个**变量（缺一个广告都不显示）：

   - `ADSENSE_PUB_ID`：AdSense 后台 → 账号 → 账号信息，形如 `pub-1234567890123456`（填 `pub-` 或 `ca-pub-` 开头的都行，程序会自动归一）
   - `ADSENSE_SLOT_ID`：AdSense 后台 → 广告 → 按广告单元 → **新建展示广告单元** → 生成后复制那一串**纯数字**的广告单元 ID（形如 `9876543210`，不要带字母）

   两个都填上之后，页面里的广告位会自动替换成真实广告，`ads.txt` 也会自动生成。
   > 只填 `ADSENSE_PUB_ID` 不填 `ADSENSE_SLOT_ID` 时，页面会保留占位框、不会出现坏广告；但想要广告真正显示，两个必须都填。

2. **联盟推广**：跨境支付/物流/ERP 服务商的推广链接，放页面上，有人注册你拿佣金。

**说句实在的**：这个站的技术链路 100% 能跑、零成本、不会坏。但"多久能赚到钱"取决于流量和广告审核，新站通常要养几个月，不是今天上线明天有钱。把它当成一个会自动攒内容和收录的长期资产，别天天盯着看。

## 本地自己跑（可选，不部署也能本地看效果）

装好 [Node.js](https://nodejs.org) 后，在这个文件夹打开命令行：
```bash
npm run all   # 采集 + 生成 + 自检，跑完看 dist/ 文件夹就是网站
```