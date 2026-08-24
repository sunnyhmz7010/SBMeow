import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanSummary, fetchFeed, parseFeed } from '../src/feed.js';

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>烧饼论坛</title>
  <entry>
    <title>香港 VPS 补货</title>
    <id>https://sb.sb/t/2/</id>
    <link href="https://sb.sb/t/2/" rel="alternate" type="text/html"></link>
    <published>2026-08-06T13:09:07Z</published>
    <updated>2026-08-06T14:00:00Z</updated>
    <summary type="text">年付 100 元 &amp; 可退款</summary>
    <author><name>alice</name></author>
    <category term="交易"></category>
  </entry>
  <entry>
    <title>无作者帖子</title>
    <link href="https://sb.sb/t/1/" rel="alternate" type="text/html"></link>
    <published>2026-08-06T12:00:00Z</published>
    <summary type="text">纯文本摘要</summary>
    <category term="主机"></category>
  </entry>
</feed>`;

test('清理摘要中的 HTML、实体和多余空白', () => {
  assert.equal(cleanSummary('<p>年付&nbsp;100 元 &amp; 可退款</p>'), '年付 100 元 & 可退款');
  assert.equal(cleanSummary('1 &lt; 2 &amp;&amp; 3 &gt; 2'), '1 < 2 && 3 > 2');
  assert.equal(cleanSummary('&copy; &mdash; &hellip;'), '© — …');
});

test('清理 ANSI 转义序列和残留控制码', () => {
  assert.equal(cleanSummary('\x1B[1m测试\x1B[0m'), '测试');
  assert.equal(cleanSummary('💻基本信息\x1B[H\x1B[J\x1B[0m'), '💻基本信息');
  assert.equal(cleanSummary('终端输出 [H[J[1;32m正常文本'), '终端输出 正常文本');
  assert.equal(cleanSummary('CPU [32m型号'), 'CPU 型号');
});

test('解析 Atom 条目并映射节点中文名为 slug', () => {
  const items = parseFeed(ATOM);

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    id: 'https://sb.sb/t/2/',
    title: '香港 VPS 补货',
    summary: '年付 100 元 & 可退款',
    link: 'https://sb.sb/t/2/',
    category: 'trade',
    creator: 'alice',
    pubDate: '2026-08-06T13:09:07Z'
  });
  assert.equal(items[1].id, 'https://sb.sb/t/1/');
  assert.equal(items[1].creator, '');
  assert.equal(items[1].category, 'hosting');
});

test('缺少 id 时回退到 alternate 链接', () => {
  const xml = '<feed><entry><title>无 id</title><link href="https://sb.sb/t/3/" rel="alternate"></link></entry></feed>';
  assert.equal(parseFeed(xml)[0].id, 'https://sb.sb/t/3/');
});

test('缺少 id 和 link 的条目会被忽略', () => {
  const xml = '<feed><entry><title>无 ID</title></entry></feed>';
  assert.deepEqual(parseFeed(xml), []);
});

test('未知节点名保留原始文本', () => {
  const xml = '<feed><entry><id>1</id><category term="新节点"></category></entry></feed>';
  assert.equal(parseFeed(xml)[0].category, '新节点');
});

test('parseFeed 保留 XML 实体表示的普通比较文本', () => {
  const xml = '<feed><entry><id>3</id><summary>价格 &lt; VPS 且内存 &gt; 2G</summary></entry></feed>';
  assert.equal(parseFeed(xml)[0].summary, '价格 < VPS 且内存 > 2G');
});

test('无效 XML 会明确失败', () => {
  assert.throws(() => parseFeed('<feed><entry>'), /订阅源 XML/);
});

test('无效 XML 失败时不会输出解析器诊断', () => {
  const diagnostics = [];
  const originalError = console.error;
  console.error = (...args) => diagnostics.push(args);

  try {
    assert.throws(() => parseFeed('<feed><entry>'), /订阅源 XML/);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(diagnostics, []);
});

test('订阅源请求失败时抛出包含状态码的错误', async () => {
  const fetchImpl = async () => new Response('error', { status: 503 });
  await assert.rejects(() => fetchFeed({ fetchImpl }), /503/);
});

test('订阅源请求固定使用烧饼论坛 Atom 地址', async () => {
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return new Response('<feed></feed>', { status: 200 });
  };

  await fetchFeed({ fetchImpl });
  assert.equal(requestedUrl, 'https://sb.sb/atom.xml');
});
