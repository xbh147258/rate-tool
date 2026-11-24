// 静态站点生成器 —— 读 data/rates.json，生成多页面工具站
// 核心：长尾货币对页面（SEO）+ 换算器 + sitemap
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_PATH = join(ROOT, 'data', 'rates.json');
const DIST = join(ROOT, 'dist');

// 核心货币（跨境高频）+ 中文名
const CORE = {
  USD: '美元', CNY: '人民币', EUR: '欧元', GBP: '英镑', JPY: '日元',
  HKD: '港币', AUD: '澳元', CAD: '加元', SGD: '新加坡元', KRW: '韩元',
  THB: '泰铢', VND: '越南盾', MYR: '马来西亚林吉特', PHP: '菲律宾比索',
  IDR: '印尼盾', INR: '印度卢比', AED: '阿联酋迪拉姆', RUB: '俄罗斯卢布',
  BRL: '巴西雷亚尔', TRY: '土耳其里拉', MXN: '墨西哥比索', ZAR: '南非兰特',
};

// 货币简介（用于页面正文，避免 thin content，提升 SEO 质量）
const INFO = {
  USD: { region: '美国', note: '全球最主要的储备货币与结算货币，跨境贸易、外汇市场与大宗商品普遍以美元计价。' },
  CNY: { region: '中国', note: '中国法定货币，在岸与离岸市场存在价差，跨境电商结算常参考离岸人民币（CNH）报价。' },
  EUR: { region: '欧元区', note: '欧元区 20 国统一货币，欧元区外贸与欧洲跨境收款的主要结算币种。' },
  GBP: { region: '英国', note: '英国法定货币，伦敦为全球最大外汇交易中心，英镑波动通常大于欧元。' },
  JPY: { region: '日本', note: '日本法定货币，长期低利率使其常被用作融资货币，也是避险资金的重要去向。' },
  HKD: { region: '中国香港', note: '港元实行与美元挂钩的联系汇率制度，波动区间被限定在 7.75 至 7.85 之间。' },
  AUD: { region: '澳大利亚', note: '商品货币，汇率与铁矿石、煤炭等大宗商品价格关联度高。' },
  CAD: { region: '加拿大', note: '商品货币，与原油价格及美国经济景气度关联紧密。' },
  SGD: { region: '新加坡', note: '东南亚金融中心货币，由新加坡金管局以篮子货币方式管理汇率。' },
  KRW: { region: '韩国', note: '韩元波动受出口景气与半导体周期影响较大。' },
  THB: { region: '泰国', note: '东南亚常用结算货币，旅游业与出口是主要影响因素。' },
  VND: { region: '越南', note: '越南盾为管理浮动汇率，是近年制造业转移与跨境收款的热门币种。' },
  MYR: { region: '马来西亚', note: '林吉特受原油与棕榈油出口影响明显。' },
  PHP: { region: '菲律宾', note: '比索汇款需求旺盛，海外劳工汇款是重要影响因素。' },
  IDR: { region: '印度尼西亚', note: '印尼盾由央行管理浮动，东南亚电商结算常用币种。' },
  INR: { region: '印度', note: '印度卢比实行有管理的浮动汇率，跨境服务贸易结算量较大。' },
  AED: { region: '阿联酋', note: '迪拉姆与美元保持固定挂钩，是中东贸易的通用结算货币。' },
  RUB: { region: '俄罗斯', note: '卢布受能源出口与制裁政策影响，波动幅度通常较大。' },
  BRL: { region: '巴西', note: '雷亚尔是拉美主要货币，受大宗商品与利率政策影响显著。' },
  TRY: { region: '土耳其', note: '里拉长期面临通胀压力，汇率波动幅度在全球主要货币中偏高。' },
  MXN: { region: '墨西哥', note: '比索与美元关联紧密，是北美制造业供应链的重要结算货币。' },
  ZAR: { region: '南非', note: '兰特是非洲交易量最大的货币，与黄金、铂族金属价格关联度高。' },
};

function loadRates() {
  if (!existsSync(DATA_PATH)) {
    console.error('[build] 缺少 data/rates.json，先跑 collect.mjs');
    process.exit(1);
  }
  let raw = readFileSync(DATA_PATH, 'utf8');
  // 剥离 UTF-8 BOM，防止外部工具（如 Windows PowerShell）写入带 BOM 文件导致 JSON.parse 崩溃
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[build] data/rates.json 解析失败: ${e.message}`);
    process.exit(1);
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 自适应有效数字格式化：低值货币（如 1 VND=0.000038 USD）也显示正确，不会变成 0
function fmt(n) {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '0';
  return new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4 }).format(v);
}
const num = fmt;
const num6 = fmt;

// 联系邮箱与广告发布商 ID 从环境变量注入，避免占位符上线
const SITE_CONTACT = process.env.SITE_CONTACT || '';
const ADSENSE_PUB_ID = process.env.ADSENSE_PUB_ID || '';
const ADSENSE_SLOT_ID = process.env.ADSENSE_SLOT_ID || '';

// AdSense 发布商号归一：后台可能给 pub-XXX，也可能给 ca-pub-XXX，统一成纯数字段
const ADSENSE_NORM = String(ADSENSE_PUB_ID).replace(/^(?:ca-)?pub-/i, '');
const ADSENSE_CLIENT = ADSENSE_NORM ? `ca-pub-${ADSENSE_NORM}` : '';
// 广告单元 ID 必须是纯数字；非纯数字（未填/填错）一律置空，绝不把占位串写进产物
const ADSENSE_SLOT = /^\d+$/.test(String(ADSENSE_SLOT_ID).trim()) ? String(ADSENSE_SLOT_ID).trim() : '';
// 只有发布商号与广告单元同时有效才输出 <ins>；否则回退占位 div（head 主脚本仍注入，自动广告照常生效）
const ADSENSE_UNIT_READY = Boolean(ADSENSE_CLIENT && ADSENSE_SLOT);

// 域名从环境变量读，部署时由 workflow 自动注入，避免占位符写死导致 canonical/sitemap 失效
const SITE_DOMAIN = (process.env.SITE_DOMAIN || 'https://rate-tool.pages.dev').replace(/\/$/, '');

const siteMeta = {
  title: '跨境汇率换算器 - 实时汇率查询',
  domain: SITE_DOMAIN,
};

function pageShell({ title, desc, canonical, body, extraHead = '' }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${siteMeta.domain}${canonical}">
<meta name="robots" content="index,follow">
${ADSENSE_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>` : ''}
<style>
:root{--bg:#0f172a;--card:#1e293b;--txt:#e2e8f0;--sub:#94a3b8;--accent:#38bdf8;--green:#34d399}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--txt);line-height:1.6}
.container{max-width:960px;margin:0 auto;padding:0 16px}
header{background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:32px 0;margin-bottom:24px}
header h1{font-size:1.6em;font-weight:700}
header p{opacity:.9;margin-top:6px;font-size:.95em}
.card{background:var(--card);border-radius:12px;padding:20px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.rate-item{background:#0b1220;border-radius:8px;padding:12px;text-align:center}
.rate-item .code{font-weight:700;font-size:1.1em;color:var(--accent)}
.rate-item .val{font-size:1.3em;font-weight:700;margin:4px 0}
.rate-item .name{color:var(--sub);font-size:.82em}
.converter{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.converter input,.converter select{flex:1;min-width:140px;padding:12px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:var(--txt);font-size:1em}
.converter .arrow{color:var(--accent);font-size:1.4em}
.result{font-size:1.4em;font-weight:700;color:var(--green);margin-top:12px}
table{width:100%;border-collapse:collapse;font-size:.92em}
th,td{padding:10px;text-align:left;border-bottom:1px solid #334155}
th{color:var(--sub);font-weight:600}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
footer{text-align:center;color:var(--sub);padding:32px 0;font-size:.85em}
.note{color:var(--sub);font-size:.8em;margin-top:8px}
.ads-placeholder{background:#0b1220;border:1px dashed #334155;border-radius:8px;padding:20px;text-align:center;color:var(--sub);margin:16px 0;font-size:.85em}
</style>
${extraHead}
</head>
<body>
<header><div class="container">
<h1>${esc(title)}</h1>
<p>${esc(desc)}</p>
</div></header>
<div class="container">
${body}
</div>
<footer><div class="container">
<p>数据每日自动更新 · 汇率数据来源 <a href="https://www.exchangerate-api.com" rel="nofollow noopener" target="_blank">ExchangeRate-API</a> · 仅供参考，交易以银行/平台实时报价为准</p>
<p><a href="/">首页</a> · <a href="/about.html">关于</a> · <a href="/privacy.html">隐私政策</a> · <a href="/sitemap.xml">网站地图</a></p>
</div></footer>
</body>
</html>`;
}

function converterWidget(rates, fromCode, toCode, validCodes) {
  const opts = validCodes || Object.keys(CORE);
  return `<div class="card">
<h2 style="margin-bottom:12px">汇率换算器</h2>
<div class="converter">
<select id="from">
${opts.map(c => `<option value="${c}" ${c === fromCode ? 'selected' : ''}>${c} ${CORE[c]}</option>`).join('')}
</select>
<span class="arrow">⇄</span>
<select id="to">
${opts.map(c => `<option value="${c}" ${c === toCode ? 'selected' : ''}>${c} ${CORE[c]}</option>`).join('')}
</select>
<input id="amount" type="number" value="100" min="0" step="any" placeholder="输入金额">
</div>
<div class="result" id="result">计算中…</div>
<div class="note">1 ${fromCode} = ${num(rates[toCode] / rates[fromCode])} ${toCode}</div>
</div>
<script>
const RATES=${JSON.stringify(rates)};
const $=id=>document.getElementById(id);
function calc(){
  const f=$('from').value,t=$('to').value,a=parseFloat($('amount').value)||0;
  const r=RATES[t]/RATES[f];
  $('result').textContent=a.toLocaleString()+' '+f+' = '+ (a*r).toLocaleString(undefined,{maximumFractionDigits:4})+' '+t;
}
['from','to','amount'].forEach(x=>$(x).addEventListener('input',calc));
calc();
</script>`;
}

// 广告位：发布商号 + 广告单元都有效才渲染真实 <ins>；否则占位 div，保证占位串永不进产物
function adSlot(label = '') {
  if (!ADSENSE_UNIT_READY) {
    return `<div class="ads-placeholder">[广告位 AdSense]${label ? '（' + label + '）' : ''}申请通过后替换</div>`;
  }
  return `<div class="card" style="text-align:center">
<ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

function buildHome(rates, validCodes) {
  const codes = validCodes || Object.keys(CORE);
  const body = `
${converterWidget(rates, 'USD', 'CNY', codes)}
${adSlot()}
<div class="card">
<h2 style="margin-bottom:12px">热门货币对（相对美元）</h2>
<div class="grid">
${codes.filter(c => c !== 'USD').map(c => `
<div class="rate-item"><a href="/usd-${c.toLowerCase()}.html">
<div class="code">USD → ${c}</div>
<div class="val">${num(rates[c])}</div>
<div class="name">${CORE[c]}</div>
</a></div>`).join('')}
</div>
</div>
<div class="card">
<h2 style="margin-bottom:12px">跨境常用汇率（相对人民币）</h2>
<table>
<tr><th>货币</th><th>名称</th><th>1 单位 = 人民币</th><th>最新更新</th></tr>
${codes.filter(c => c !== 'CNY').map(c => `
<tr><td><a href="/${c.toLowerCase()}-cny.html">${c}/CNY</a></td><td>${CORE[c]}</td><td>${num(rates.CNY / rates[c])}</td><td>${new Date().toISOString().slice(0,10)}</td></tr>`).join('')}
</table>
</div>
<div class="card">
<h2 style="margin-bottom:12px">关于本工具</h2>
<p>本站提供实时汇率查询与货币换算服务，覆盖全球 160 多种货币，重点服务跨境电商、外贸结算、海淘购物与出境旅行的人群。汇率数据每日自动从公开数据源同步更新，所有页面均为纯静态渲染，零商业数据库依赖。</p>
<p class="note" style="margin-top:10px">使用提示：汇率只反映市场报价，实际兑换以银行或支付平台的最终成交价为准，跨境手续费与点差另计。</p>
</div>`;

  return pageShell({
    title: siteMeta.title,
    desc: '实时查询美元、欧元、日元、港币等160+货币汇率，跨境电商、外贸结算、海淘购物必备的免费汇率换算工具，数据每日自动更新。',
    canonical: '/',
    body,
  });
}

// 生成全部货币对页面（22×21=462），保证站内每个链接都有落点，杜绝 404
function buildPairs(codes) {
  const pairs = [];
  for (const from of codes) {
    for (const to of codes) {
      if (from !== to) pairs.push([from, to]);
    }
  }
  return pairs;
}

function buildPairPage(rates, from, to, validCodes) {
  const rate = rates[to] / rates[from];
  if (!isFinite(rate) || rate <= 0) {
    throw new Error(`非法汇率 ${from}/${to}: ${rate}`);
  }
  const fname = CORE[from] || from;
  const tname = CORE[to] || to;
  const title = `${from} 兑 ${to} 汇率 · 1 ${from} = ${num(rate)} ${to}（实时）`;
  const desc = `查询 ${fname}(${from}) 兑换 ${tname}(${to}) 的实时汇率，当前 1 ${from} = ${num(rate)} ${to}。支持换算、历史参考，数据每日自动更新。`;
  const slug = `${from.toLowerCase()}-${to.toLowerCase()}.html`;
  // 站内链接只指向实际会生成的货币对（白名单），避免 404
  const related = validCodes.filter(c => c !== from && c !== to);

  const body = `
${converterWidget(rates, from, to, validCodes)}
<div class="card">
<h2 style="margin-bottom:12px">${from} 兑 ${to} 实时汇率</h2>
<p style="font-size:1.6em;font-weight:700;color:var(--green)">1 ${from} = ${num(rate)} ${to}</p>
<p class="note">反向：1 ${to} = ${num(rates[from] / rates[to])} ${from}</p>
<p class="note">更新时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
</div>
<div class="card">
<h2 style="margin-bottom:12px">${fname} 兑换 ${tname} 速查表</h2>
<table>
<tr><th>${from} 金额</th><th>${to} 金额</th></tr>
${[1,5,10,50,100,500,1000].map(a => `<tr><td>${a} ${from}</td><td>${num(a * rate)} ${to}</td></tr>`).join('')}
</table>
</div>
${adSlot()}
<div class="card">
<h2 style="margin-bottom:12px">关于 ${fname}(${from}) 与 ${tname}(${to})</h2>
<p>${fname}（${from}）：${(INFO[from] || {}).note || '该货币为国际市场可自由兑换币种。'}${(INFO[from] || {}).region ? '主要流通地区：' + INFO[from].region + '。' : ''}</p>
<p style="margin-top:8px">${tname}（${to}）：${(INFO[to] || {}).note || '该货币为国际市场可自由兑换币种。'}${(INFO[to] || {}).region ? '主要流通地区：' + INFO[to].region + '。' : ''}</p>
<p style="margin-top:8px" class="note">换算说明：本页汇率由两个币种对美元的中间价交叉计算得出，用于快速估算。实际跨境收款、结汇或银行卡刷卡时，银行与支付机构会在此基础上加减点差并收取手续费，最终到账金额以机构报价为准。</p>
</div>
<div class="card">
<h2 style="margin-bottom:12px">其他常用汇率</h2>
<div class="grid">
${related.slice(0, 18).map(c => `
<div class="rate-item"><a href="/${from.toLowerCase()}-${c.toLowerCase()}.html">
<div class="code">${from} → ${c}</div>
<div class="val">${num(rates[c] / rates[from])}</div>
<div class="name">${CORE[c]}</div>
</a></div>`).join('')}
</div>
</div>`;

  return { slug, html: pageShell({ title, desc, canonical: '/' + slug, body }) };
}

function buildSitemap(slugs) {
  // 合规页也必须进 sitemap，方便审核方抓取
  const all = ['/', ...slugs, '/privacy.html', '/about.html'];
  const urls = all.map(s => `<url><loc>${siteMeta.domain}${s}</loc><changefreq>daily</changefreq></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function main() {
  const data = loadRates();
  const rates = data.rates;

  // 有效货币白名单：存在且为正有限数，防止缺数据/异常值生成 NaN 或"汇率为 0"的页面
  const validCodes = Object.keys(CORE).filter(c => {
    const v = rates[c];
    return typeof v === 'number' && isFinite(v) && v > 0;
  });

  // 核心货币守卫：缺任一核心币种直接失败，不生成坏页（job 变红，线上保留旧版）
  const MUST = ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'HKD'];
  const missing = MUST.filter(c => !validCodes.includes(c));
  if (missing.length) {
    console.error(`[build] 核心货币缺失: ${missing.join(', ')} —— 中止构建，避免上线错误页面`);
    process.exit(1);
  }

  // 每次构建先清空 dist：数据源降级后不会残留上一轮的孤儿页面（否则旧汇率会以"实时"名义长期在线）
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // 主页
  writeFileSync(join(DIST, 'index.html'), buildHome(rates, validCodes), 'utf8');

  // 货币对页面（全量生成，站内链接零 404）
  const pairs = buildPairs(validCodes);
  const slugs = [];
  for (const [from, to] of pairs) {
    const { slug, html } = buildPairPage(rates, from, to, validCodes);
    writeFileSync(join(DIST, slug), html, 'utf8');
    slugs.push('/' + slug);
  }

  // robots + sitemap
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteMeta.domain}/sitemap.xml\n`, 'utf8');
  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(slugs), 'utf8');

  // ads.txt：只有配置了 AdSense 发布商 ID 才生成，避免空文件误导审核
  if (ADSENSE_PUB_ID) {
    writeFileSync(join(DIST, 'ads.txt'), `google.com, pub-${ADSENSE_NORM}, DIRECT, f08c47fec0942fa0\n`, 'utf8');
  }

  // 静态合规页（AdSense 审核要求）
  writeFileSync(join(DIST, 'privacy.html'), pageShell({
    title: '隐私政策 - 跨境汇率换算器', desc: '本站隐私政策，说明数据收集与 Cookie 使用方式。', canonical: '/privacy.html',
    body: `<div class="card"><h2>隐私政策</h2>
<p>本站为汇率查询工具，不要求用户注册，不主动收集姓名、手机号等个人身份信息。</p>
<h3 style="margin-top:14px">1. 我们收集什么</h3>
<p>本站使用第三方统计与广告服务（如 Google AdSense），这些服务可能通过 Cookie 收集匿名访问数据（页面浏览、来源、设备类型），用于统计与广告展示。</p>
<h3 style="margin-top:14px">2. Cookie</h3>
<p>Cookie 是浏览器本地存储的小型文本文件。你可以在浏览器设置中随时禁用 Cookie，这不会影响汇率查询功能的正常使用。</p>
<h3 style="margin-top:14px">3. 数据用途</h3>
<p>收集的匿名数据仅用于改善站点体验与广告投放，不会用于识别个人身份，也不会出售给第三方。</p>
<h3 style="margin-top:14px">4. 汇率数据</h3>
<p>本站汇率来自公开数据接口，仅供参考，不构成任何投资或交易建议。</p>
<h3 style="margin-top:14px">5. 联系方式</h3>
<p>如有疑问请通过 <a href="/about.html">关于页面</a> 提供的方式联系。</p>
<p class="note" style="margin-top:14px">最后更新：${new Date().toISOString().slice(0, 10)}</p></div>`,
  }), 'utf8');

  writeFileSync(join(DIST, 'about.html'), pageShell({
    title: '关于我们 - 跨境汇率换算器', desc: '了解本站的定位、数据来源与服务范围。', canonical: '/about.html',
    body: `<div class="card"><h2>关于本站</h2>
<p>本站是一个面向跨境人群的免费汇率查询工具，覆盖全球 160 多种货币，提供实时汇率、货币换算与常用金额速查。</p>
<h3 style="margin-top:14px">数据来源</h3>
<p>汇率数据来自公开的免费汇率接口（open.er-api.com 及备用源），每日自动同步更新。页面为纯静态渲染，无数据库依赖。</p>
<h3 style="margin-top:14px">适用人群</h3>
<p>跨境电商卖家、外贸从业者、海淘用户、出境旅行者，以及任何需要快速估算外币金额的人。</p>
<h3 style="margin-top:14px">免责声明</h3>
<p>本站展示的汇率为市场参考价，银行、支付平台的实际成交价可能因点差、手续费与结算时间而不同。本站不对任何依据页面信息做出的交易决策负责。</p>
<h3 style="margin-top:14px">联系</h3>
<p>${SITE_CONTACT ? '合作与反馈邮箱：' + esc(SITE_CONTACT) : '合作与反馈：请通过站点留言或站长公开渠道联系。'}</p></div>`,
  }), 'utf8');

  // 404 简单的兜底
  writeFileSync(join(DIST, '404.html'), pageShell({ title: '404', desc: '', canonical: '/404.html', body: '<div class="card"><h2>页面不存在</h2><p><a href="/">返回首页</a></p></div>' }), 'utf8');

  console.log(`[build] 完成：主页 1 + 货币对页 ${pairs.length} + sitemap/robots，共 ${slugs.length + 1} 个URL`);
}

main();