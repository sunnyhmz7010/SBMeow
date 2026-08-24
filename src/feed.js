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

export function cleanSummary(value = '') {
  const document = new DOMParser({ onError() {} }).parseFromString(
    `<html><body>${value}</body></html>`,
    'text/html'
  );
  return (document.getElementsByTagName('body').item(0)?.textContent ?? value)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[[0-9;]+[a-zA-Z](?![a-zA-Z0-9])/g, '')
    .replace(/\[[HJKR](?![a-zA-Z])/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
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
