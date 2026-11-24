// 汇率采集脚本 —— 多源容灾，全部免 key
// 源1 open.er-api.com (ExchangeRate-API)  160+ 货币，全量
// 源2 api.exchangerate-api.com v4          同供应商旧接口，字段名不同（base vs base_code）
// 源3 api.frankfurter.app (ECB 数据)       异构供应商，约 30 种货币，不含 base 自身
// 统一输出 data/rates.json，且保证 rates[base] === 1
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'rates.json');
const BASE = 'USD';

// 每个源带独立的解析器，兼容字段差异；parse 返回 null 表示该源数据不可用
const SOURCES = [
  {
    name: 'exchangerate-api-v6',
    url: `https://open.er-api.com/v6/latest/${BASE}`,
    parse: (d) => (d && d.rates && (d.base_code || d.base) ? { base: d.base_code || d.base, rates: d.rates } : null),
  },
  {
    name: 'exchangerate-api-v4',
    url: `https://api.exchangerate-api.com/v4/latest/${BASE}`,
    parse: (d) => (d && d.rates && (d.base || d.base_code) ? { base: d.base || d.base_code, rates: d.rates } : null),
  },
  {
    name: 'frankfurter-ecb',
    url: `https://api.frankfurter.app/latest?from=${BASE}`,
    parse: (d) => (d && d.rates && d.base ? { base: d.base, rates: d.rates } : null),
  },
];

async function fetchSource(src) {
  const res = await fetch(src.url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const parsed = src.parse(data);
  if (!parsed) throw new Error('字段校验未通过');
  // 统一保证 base 自身汇率为 1（frankfurter 不返回 base 自身）
  const rates = { ...parsed.rates };
  if (typeof rates[parsed.base] !== 'number') rates[parsed.base] = 1;
  return { base: parsed.base, rates };
}

async function main() {
  const failures = [];
  for (const src of SOURCES) {
    try {
      const { base, rates } = await fetchSource(src);
      const clean = {};
      for (const [k, v] of Object.entries(rates)) {
        if (typeof v === 'number' && isFinite(v) && v > 0) clean[k] = v;
      }
      const payload = {
        base,
        source: src.name,
        sourceUrl: src.url,
        fetchedAt: new Date().toISOString(),
        rates: clean,
        currencyCount: Object.keys(clean).length,
      };
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[collect] 成功：${payload.currencyCount} 种货币，来源 ${src.name}`);
      return;
    } catch (e) {
      failures.push(`${src.name}: ${e.message}`);
      console.error(`[collect] 源失败 ${src.name}: ${e.message}`);
    }
  }
  console.error(`[collect] 全部数据源失败:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

main();