// 看门狗 —— 监控数据新鲜度、数据源存活、汇率有限性、站点产物无 NaN
// 退出码 0=健康，1=异常（CI 里据此中止部署并触发 GitHub 邮件告警）
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_PATH = join(ROOT, 'data', 'rates.json');
const DIST = join(ROOT, 'dist');

const STALE_HOURS = 48;      // 数据超过48小时视为过期
const MIN_CURRENCIES = 20;   // 有效货币少于20种视为降级异常
const MUST = ['CNY', 'EUR', 'JPY', 'GBP', 'HKD'];
// CORE 全量清单：降级到 ECB 源时会缺 VND/AED/RUB 等，覆盖率不足即报警，防止静默掉页
const CORE_ALL = ['USD','CNY','EUR','GBP','JPY','HKD','AUD','CAD','SGD','KRW','THB','VND','MYR','PHP','IDR','INR','AED','RUB','BRL','TRY','MXN','ZAR'];
const MIN_HTML_PAGES = 460;  // 462 对 + 合规页，低于此值说明页面静默消失

// 剥 UTF-8 BOM：与 build.mjs 保持同一判定，防止本地演练时"构建成功但自检失败"
function readJsonNoBom(path) {
  let raw = readFileSync(path, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

const SOURCES = [
  'https://open.er-api.com/v6/latest/USD',
  'https://api.exchangerate-api.com/v4/latest/USD',
  'https://api.frankfurter.app/latest?from=USD',
];

const issues = [];

function log(ok, msg) {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) issues.push(msg);
}

// 1. 本地数据：新鲜度 + 全量有限性 + 关键货币 + 异常值
if (!existsSync(DATA_PATH)) {
  log(false, '数据文件缺失 data/rates.json');
} else {
  try {
    const data = readJsonNoBom(DATA_PATH);
    const ageHours = (Date.now() - new Date(data.fetchedAt).getTime()) / 3600000;
    log(ageHours < STALE_HOURS, `数据年龄 ${ageHours.toFixed(1)}h（阈值${STALE_HOURS}h），来源 ${data.source}`);
    log(data.currencyCount >= MIN_CURRENCIES, `有效货币 ${data.currencyCount} 种（下限${MIN_CURRENCIES}）`);

    // CORE 覆盖度：降级到 ECB 源时 22 个核心币种会缺若干，必须显式报警而非放行
    const coreMissing = CORE_ALL.filter(c => !data.rates[c]);
    log(coreMissing.length === 0, `核心币种覆盖率 ${CORE_ALL.length - coreMissing.length}/${CORE_ALL.length}${coreMissing.length ? '，缺失: ' + coreMissing.join(',') : ''}`);

    // 全量有限性：任一非正数/NaN/Infinity 即报警（防生成 NaN 或"汇率0"页）
    const bad = Object.entries(data.rates).filter(([, v]) => typeof v !== 'number' || !isFinite(v) || v <= 0);
    log(bad.length === 0, `汇率有限性全量检查${bad.length ? '，异常: ' + bad.slice(0, 5).map(([k, v]) => `${k}=${v}`).join(',') : ''}`);

    // base 自身必须为 1
    log(data.rates[data.base] === 1, `base(${data.base}) 自身汇率 = ${data.rates[data.base]}`);

    const missing = MUST.filter(c => !data.rates[c]);
    log(missing.length === 0, `关键货币齐全${missing.length ? '，缺失: ' + missing.join(',') : ''}`);

    const sanity = data.rates.CNY > 3 && data.rates.CNY < 15;
    log(sanity, `USD/CNY=${data.rates.CNY} 合理性检查${sanity ? '' : ' 异常'}`);
  } catch (e) {
    log(false, `数据文件损坏: ${e.message}`);
  }
}

// 2. 数据源存活（至少一个）
let alive = 0;
for (const url of SOURCES) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const d = await res.json();
      if (d && d.rates) { alive++; log(true, `数据源存活: ${new URL(url).host}`); }
      else { log(false, `数据源返回无 rates: ${new URL(url).host}`); }
    } else {
      log(false, `数据源 HTTP ${res.status}: ${new URL(url).host}`);
    }
  } catch (e) {
    log(false, `数据源不可用: ${new URL(url).host} (${e.message})`);
  }
}
log(alive > 0, `存活数据源 ${alive}/${SOURCES.length}`);

// 3. 站点产物：存在性 + NaN 字符串扫描（NaN 一旦进标题/描述，SEO 全毁）
const indexPath = join(DIST, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  log(html.includes('汇率换算器'), '站点首页含换算器');
  log(html.includes('sitemap'), '站点含 sitemap 链接');
} else {
  log(false, '站点产物缺失 dist/index.html');
}

try {
  const files = readdirSync(DIST).filter(f => f.endsWith('.html'));
  let nanFiles = [];
  for (const f of files) {
    // 剥离 script/style 后再扫，避免换算器 JS 里合法的 undefined/toLocaleString(undefined,…) 误报
    const text = readFileSync(join(DIST, f), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    if (/\bNaN\b|\bundefined\b|\bInfinity\b/.test(text)) nanFiles.push(f);
  }
  log(nanFiles.length === 0, `产物 NaN/undefined 扫描（${files.length} 个页面）${nanFiles.length ? '，命中: ' + nanFiles.slice(0, 5).join(',') : ''}`);
  log(files.length >= MIN_HTML_PAGES, `页面数量 ${files.length}（下限${MIN_HTML_PAGES}，低于此值说明页面静默消失）`);
} catch (e) {
  log(false, `产物扫描失败: ${e.message}`);
}

// 4. 广告配置一致性：一旦配了发布商号，产物里就不能残留占位符（否则广告不渲染却无告警）
const ADSENSE_PUB_ID = process.env.ADSENSE_PUB_ID || '';
try {
  const files = readdirSync(DIST).filter(f => f.endsWith('.html'));
  const idx = readFileSync(join(DIST, 'index.html'), 'utf8');
  const hasMainScript = idx.includes('pagead2.googlesyndication.com');
  if (ADSENSE_PUB_ID) {
    log(hasMainScript, 'AdSense 主脚本已注入 head');
    let placeholderHits = 0;
    for (const f of files) {
      const txt = readFileSync(join(DIST, f), 'utf8');
      placeholderHits += (txt.match(/AUTO_SLOT_REPLACE_ME/g) || []).length;
    }
    log(placeholderHits === 0, `广告占位串残留 ${placeholderHits} 处（必须为 0）`);
  } else {
    log(!hasMainScript, '未配发布商号时不应注入 AdSense 主脚本');
  }
} catch (e) {
  log(false, `广告配置检查失败: ${e.message}`);
}

console.log(`\n[watchdog] ${issues.length === 0 ? '全部通过' : issues.length + ' 项异常'}`);
process.exit(issues.length === 0 ? 0 : 1);