/**
 * HotDestinations 云函数 — 当季热门目的地推荐
 * LLM 生成
 */

const https = require('https');
const http = require('http');

// ==================== HTTPS 请求封装 ====================

const httpsRequest = (url, options, body) => {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'POST',
      headers: options.headers,
      timeout: 50000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
};

// ==================== LLM 调用 ====================

const callLLM = async (messages, options = {}) => {
  const LLM_API_KEY = process.env.LLM_API_KEY || '';
  const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';

  if (!LLM_API_KEY) {
    console.log('[LLM] 未配置 LLM_API_KEY');
    return null;
  }
  try {
    const body = JSON.stringify({
      model: LLM_MODEL,
      messages,
      max_tokens: options.maxTokens || 800,
      temperature: options.temperature ?? 0.7
    });
    const res = await httpsRequest(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`
      }
    }, body);
    if (!res.ok) return null;
    const data = JSON.parse(res.data);
    const choice = data.choices?.[0]?.message;
    if (!choice) return null;
    let content = choice.content;
    if (!content && !options.skipReasoningFallback && choice.reasoning_content) {
      content = choice.reasoning_content;
    }
    return content || null;
  } catch (err) {
    console.error('[LLM] 异常:', err.message);
    return null;
  }
};

/**
 * LLM 根据当前月份推荐当季热门目的地
 */
const getHotDestinations = async () => {
  const month = new Date().getMonth() + 1;
  const seasonMap = { 12: '冬季', 1: '冬季', 2: '冬季', 3: '春季', 4: '春季', 5: '春季', 6: '夏季', 7: '夏季', 8: '夏季', 9: '秋季', 10: '秋季', 11: '秋季' };
  const season = seasonMap[month] || '';

  const prompt = [
    { role: 'system', content: `你是国内旅行专家。当前${month}月（${season}），请推荐6个当季最适合旅游的国内目的地。只输出JSON数组，不要其他内容。` },
    { role: 'user', content: `输出格式：
[{"name":"城市名","province":"省份","description":"一句话推荐理由（15字内）","tags":["标签1","标签2","标签3"],"bestSeason":"最佳季节","budget":"低/中/高"}]` }
  ];

  console.log(`[getHotDestinations] 调用 LLM 生成 ${month}月${season} 热门目的地...`);
  const content = await callLLM(prompt, { maxTokens: 800, temperature: 0.7, skipReasoningFallback: true });
  if (!content) {
    console.error('[getHotDestinations] LLM 返回空');
    return [];
  }

  // 解析 JSON — 支持裸数组和 markdown 代码块
  let jsonStr = content;
  const codeMatch = content.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/);
  if (codeMatch) jsonStr = codeMatch[1];
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[getHotDestinations] 未找到 JSON 数组');
    return [];
  }

  try {
    const list = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(list) || list.length === 0) return [];

    const result = list.map((d, i) => {
      const budget = d.budget || '中等';
      let rating;
      if (budget === '高') rating = 4.5 + Math.random() * 0.3;
      else if (budget === '低') rating = 3.5 + Math.random() * 0.5;
      else rating = 4.0 + Math.random() * 0.5;
      return {
        id: 'hot_' + (i + 1),
        name: d.name,
        country: d.province ? `中国·${d.province}` : '中国',
        description: d.description || '',
        tags: d.tags || [],
        bestSeason: d.bestSeason || '',
        budget,
        rating: parseFloat(rating.toFixed(1)),
        image: `https://picsum.photos/seed/${encodeURIComponent(d.name)}/750/400`
      };
    });
    result.sort((a, b) => b.rating - a.rating);
    console.log(`[getHotDestinations] 生成 ${result.length} 个目的地`);
    return result;
  } catch (err) {
    console.error('[getHotDestinations] JSON 解析失败:', err.message);
    return [];
  }
};

// ==================== 云函数入口 ====================

const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4g04dori2ba39620' });

exports.main = async (event, context) => {
  const destinations = await getHotDestinations();
  if (destinations.length > 0) {
    // 写入云数据库缓存
    try {
      const db = cloud.database();
      await db.collection('hot_cache').add({
        data: {
          destinations,
          updatedAt: Date.now()
        }
      });
      console.log('[hotDestinations] 缓存写入 hot_cache 成功');
    } catch (err) {
      console.error('[hotDestinations] 缓存写入失败:', err.message);
    }
  }
  return { success: true, destinations };
};
