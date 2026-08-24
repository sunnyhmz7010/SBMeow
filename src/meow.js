const MEOW_BASE_URL = 'https://api.chuckfang.com';
const MEOW_SOURCE = '烧饼论坛';
const SB_HOME_URL = 'https://sb.sb/';
const SB_ICON_URL = 'https://sb.sb.sb/assets/apple-touch-icon.png';

const CATEGORY_NAMES = new Map([
  ['general', '综合'],
  ['ai', 'AI'],
  ['domains', '域名'],
  ['hosting', '主机'],
  ['hardware', '硬件'],
  ['trade', '交易'],
  ['promotion', '推广'],
  ['discounts', '优惠'],
  ['share', '分享'],
  ['tech', '技术'],
  ['jobs', '工作'],
  ['invest', '投资'],
  ['announcement', '公告']
]);

function categoryName(slug) {
  if (!slug) return '未知';
  return CATEGORY_NAMES.get(slug) ?? slug;
}

function formatSingleKeyword(reason = '') {
  if (reason.startsWith('keyword:')) return reason.slice('keyword:'.length);
  if (reason.startsWith('group:')) return reason.slice('group:'.length);
  if (reason.startsWith('regex:')) return reason.slice('regex:'.length);
  if (reason.startsWith('category-push:')) return `${categoryName(reason.slice('category-push:'.length))}（版块匹配）`;
  return reason;
}

function formatKeyword(reason = '') {
  return reason.split('|').filter(Boolean).map(formatSingleKeyword).join(' ');
}

export function formatReason(reason = '') {
  if (reason === 'no-match') return '未命中';
  if (reason === 'category') return '版块过滤';
  if (reason.startsWith('blocked:')) return `屏蔽词（${reason.slice('blocked:'.length)}）`;
  return formatKeyword(reason);
}

function formatChineseTime(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value || '未知';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date(time)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}年${Number(parts.month)}月${Number(parts.day)}日 ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatMessage(item, match = {}) {
  return [
    `📌 版块：${categoryName(item.category)}`,
    `👤 作者：${item.creator || '未知'}`,
    `🎯 命中规则：${formatKeyword(match.reason)}`,
    `🕒 发布时间：${formatChineseTime(item.pubDate)}`,
    `📝 摘要：${item.summary || '（无摘要）'}`
  ].join('\n');
}

export function createMeowClient({
  nickname,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  showLinkUrl = false
}) {
  const endpoint = `${MEOW_BASE_URL}/${encodeURIComponent(nickname)}/${encodeURIComponent(MEOW_SOURCE)}?msgType=text`;

  async function post(payload) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        imgUrl: SB_ICON_URL
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) throw new Error(`MeoW 请求失败: HTTP ${response.status}`);

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error(`MeoW 响应不是有效 JSON: ${error.message}`);
    }
    if (result.status !== 200) {
      const detail = result.msg ?? result.message ?? '';
      throw new Error(`MeoW 推送失败: ${result.status ?? '未知状态'} ${detail}`.trim());
    }
  }

  return {
    async push(item, match) {
      let msg = formatMessage(item, match);
      if (showLinkUrl && item.link) {
        msg += `\n🔗 链接：${item.link}`;
      }
      await post({
        title: item.title,
        msg,
        url: item.link
      });
    },
    async pushHealthCheck({ rssOk = true, version = '', updateInfo = null, configSummary = '' } = {}) {
      const lines = [];
      if (rssOk) {
        lines.push('SBMeow 已启动，RSS 与 MeoW 连接正常。');
      } else {
        lines.push('SBMeow 已启动，MeoW 连接正常；RSS 连接异常，请检查网络或烧饼论坛 RSS 服务。');
      }
      if (version) {
        const updateLine = updateInfo
          ? `当前版本：v${version}，发现新版本 v${updateInfo.latestVersion}！请访问 ${updateInfo.url} 查看更新。`
          : `当前已是最新版本：v${version}`;
        lines.push(updateLine);
      }
      if (configSummary) {
        lines.push(`⚙️ 启动配置：${configSummary}`);
      }
      await post({
        title: configSummary ? 'SBMeow 启动' : 'SBMeow 自检',
        msg: lines.join('\n'),
        url: SB_HOME_URL
      });
    },
    async pushConfig(summary) {
      await post({
        title: 'SBMeow 启动配置',
        msg: summary,
        url: SB_HOME_URL
      });
    },
    async pushError(message) {
      await post({
        title: 'SBMeow 异常',
        msg: message,
        url: SB_HOME_URL
      });
    },
    async pushRecovery() {
      await post({
        title: 'SBMeow 恢复',
        msg: 'RSS 连接已恢复，监控正常运行。',
        url: SB_HOME_URL
      });
    }
  };
}
