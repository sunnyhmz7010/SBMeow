import { DOMParser } from '@xmldom/xmldom';

const FEED_URL = 'https://sb.sb/atom.xml';

// 烧饼论坛节点中文名 → 配置用 slug（与 https://sb.sb/go/<slug>/ 路径一致）
const CATEGORY_SLUG_BY_NAME = new Map([
  ['综合', 'general'],
  ['AI', 'ai'],
  ['域名', 'domains'],
  ['主机', 'hosting'],
  ['硬件', 'hardware'],
  ['交易', 'trade'],
  ['推广', 'promotion'],
  ['优惠', 'discounts'],
  ['分享', 'share'],
  ['技术', 'tech'],
  ['工作', 'jobs'],
  ['投资', 'invest'],
  ['公告', 'announcement']
]);

const NAMED_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&middot;': '·',
  '&bull;': '•',
  '&laquo;': '«',
  '&raquo;': '»',
  '&cent;': '¢',
  '&pound;': '£',
  '&yen;': '¥',
  '&euro;': '€',
  '&sect;': '§',
  '&deg;': '°',
  '&plusmn;': '±',
  '&times;': '×',
  '&divide;': '÷',
  '&ne;': '≠',
  '&le;': '≤',
  '&ge;': '≥',
  '&infin;': '∞'
};

function decodeHtmlEntities(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&[a-zA-Z]+;/g, (match) => NAMED_ENTITIES[match] ?? match);
}

// 字符级状态机剥离 HTML 标签：不依赖正则做整段标签匹配，
// 未闭合的 script/style 丢弃其后全部内容，未闭合的普通标签丢弃其后剩余文本（与浏览器宽松解析一致）
function stripHtmlTags(value) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch !== '<') {
      out += ch;
      i += 1;
      continue;
    }
    const next = value[i + 1] ?? '';
    if (!/[a-zA-Z!/?]/.test(next)) {
      out += ch;
      i += 1;
      continue;
    }
    let j = i + 1;
    let name = '';
    if (next === '/') j += 1;
    while (j < value.length && /[a-zA-Z0-9]/.test(value[j])) {
      name += value[j];
      j += 1;
    }
    const lower = name.toLowerCase();
    if (next !== '/' && (lower === 'script' || lower === 'style')) {
      const lowerValue = value.toLowerCase();
      const closeIndex = lowerValue.indexOf(`</${lower}`, j);
      if (closeIndex === -1) break;
      i = closeIndex;
      continue;
    }
    const gtIndex = value.indexOf('>', j);
    if (gtIndex === -1) break;
    i = gtIndex + 1;
  }
  return out;
}

// 循环剥离 HTML 标签与实体解码直到结果稳定，防止解码后重新出现的标签或未闭合 script/style 残留
export function cleanSummary(value = '') {
  if (!value) return '';
  let text = String(value)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[[0-9;]+[a-zA-Z](?![a-zA-Z0-9])/g, '')
    .replace(/\[[HJKR](?![a-zA-Z])/g, '');
  let previous;
  do {
    previous = text;
    text = stripHtmlTags(
      decodeHtmlEntities(
        text
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<\/(?:p|div|li|tr|h[1-6])\b[^>]*>/gi, ' ')
      )
    );
  } while (text !== previous);
  return text.replace(/\s+/gu, ' ').trim();
}

function textOf(element, tagName) {
  return element.getElementsByTagName(tagName).item(0)?.textContent?.trim() ?? '';
}

function alternateLink(entry) {
  const links = Array.from(entry.getElementsByTagName('link'));
  return (
    links.find((link) => link.getAttribute('rel') === 'alternate')?.getAttribute('href') ??
    links.find((link) => link.getAttribute('href'))?.getAttribute('href') ??
    ''
  );
}

function categorySlug(entry) {
  const name = entry.getElementsByTagName('category').item(0)?.getAttribute('term')?.trim() ?? '';
  return CATEGORY_SLUG_BY_NAME.get(name) ?? name;
}

export function parseFeed(xml) {
  let document;
  const parseErrors = [];
  try {
    document = new DOMParser({
      onError(level, message) {
        parseErrors.push({ level, message });
      }
    }).parseFromString(xml, 'text/xml');
  } catch (error) {
    throw new Error(`订阅源 XML 解析失败: ${error.message}`);
  }

  if (parseErrors.length > 0) {
    throw new Error(`订阅源 XML 解析失败: ${parseErrors[0].message}`);
  }

  if (!document?.documentElement || document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('订阅源 XML 解析失败');
  }

  return Array.from(document.getElementsByTagName('entry'), (entry) => {
    const id = textOf(entry, 'id') || alternateLink(entry);
    if (!id) return null;
    return {
      id,
      title: textOf(entry, 'title'),
      summary: cleanSummary(textOf(entry, 'summary')),
      link: alternateLink(entry),
      category: categorySlug(entry),
      creator: textOf(entry, 'name'),
      pubDate: textOf(entry, 'published') || textOf(entry, 'updated')
    };
  }).filter(Boolean);
}

function sanitizeXml(xml) {
  return xml.replace(/\uFFFD/gu, '');
}

export async function fetchFeed({
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000
} = {}) {
  const response = await fetchImpl(FEED_URL, {
    headers: { 'user-agent': 'sbmeow/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`订阅源请求失败: HTTP ${response.status}`);
  return parseFeed(sanitizeXml(await response.text()));
}
