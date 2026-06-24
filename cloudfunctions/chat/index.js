/**
 * Chat 云函数 — AI 对话 + 行程规划
 * 注意：不包含 FlyAI 搜索（FlyAI 依赖 CLI，保留在 Express 服务器）
 */

const https = require('https');
const http = require('http');

// ==================== HTTPS 请求封装（云函数无 fetch） ====================

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
      timeout: 58000
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
    console.log('[LLM] 未配置 LLM_API_KEY，跳过');
    return null;
  }
  console.log(`[LLM] 调用 ${LLM_MODEL} @ ${LLM_API_URL}...`);
  try {
    const body = JSON.stringify({
      model: LLM_MODEL,
      messages,
      max_tokens: options.maxTokens || 1200,
      temperature: options.temperature ?? 0.7,
      ...(options.tools ? { tools: options.tools, tool_choice: 'auto' } : {})
    });
    const res = await httpsRequest(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`
      }
    }, body);
    if (!res.ok) {
      console.error(`[LLM] HTTP ${res.status}: ${(res.data || '').substring(0, 300)}`);
      return null;
    }
    const data = JSON.parse(res.data);
    const choice = data.choices?.[0]?.message;
    if (!choice) {
      console.error('[LLM] 响应无 choices:', JSON.stringify(data).substring(0, 300));
      return null;
    }
    let content = choice.content;
    // DeepSeek v4-pro 可能把回复放在 reasoning_content 里而 content 为空
    if (!content && !(options.skipReasoningFallback)) {
      const rc = choice.reasoning_content;
      if (rc) {
        console.log('[LLM] 使用 reasoning_content（content 为空）');
        content = rc;
      }
    }

    if (options.tools && choice.tool_calls?.length > 0) {
      console.log(`[LLM] 函数调用: ${choice.tool_calls[0].function.name}`);
      return { content: content || null, toolCalls: choice.tool_calls };
    }

    if (!content) {
      console.error('[LLM] 响应无内容:', JSON.stringify(data).substring(0, 500));
      return null;
    }
    console.log('[LLM] 成功');
    return content;
  } catch (err) {
    console.error('[LLM] 异常:', err.message);
    return null;
  }
};

// ==================== 上下文管理 ====================

const smartHistory = (history, currentQuery) => {
  const MAX = 10;
  let hist = history.slice(-MAX);

  const newTopicKeywords = ['新的行程', '重新规划', '换个地方', '换个城市', '换一个', '再来一个', '重新开始'];
  const isNewTopic = newTopicKeywords.some(k => currentQuery.includes(k));

  if (isNewTopic) {
    console.log('[Chat] 检测到新话题，清空上下文');
    return [];
  }

  const destPatterns = [
    /(?:去|到|想去|打算去|计划去)([\u4e00-\u9fff]{2,6})(?:玩|旅游|旅行)?/,
    /^([\u4e00-\u9fff]{2,6})(?:三日|三日游|几日|几日游|旅游|旅行|攻略|行程)/,
  ];
  let currentDest = '';
  for (const p of destPatterns) {
    const m = currentQuery.match(p);
    if (m) { currentDest = m[1]; break; }
  }

  if (currentDest && currentDest.length >= 2) {
    const recentUserMsgs = hist.filter(m => m.role === 'user').slice(-2);
    const sameDest = recentUserMsgs.every(m => m.content.includes(currentDest));
    if (!sameDest && recentUserMsgs.length > 0) {
      console.log(`[Chat] 目的地切换为「${currentDest}」，裁剪上下文`);
      hist = hist.slice(-4);
    }
  }

  console.log(`[Chat] 上下文: ${hist.length} 条历史消息`);
  return hist;
};

// ==================== System Prompt & Tools ====================

const SYSTEM_PROMPT = `你是一个专业的旅行规划助手。请仔细阅读对话历史，记住用户之前说的每一句话。

你需要判断当前用户请求属于哪种类型：

**类型1：行程规划**（用户提到"规划""几日游""安排行程""帮我做攻略"等）
→ 提取：目的地、出发日期(YYYY-MM-DD)、天数、出发城市(origin)、同行人数(travelers)
→ 缺少出发地/天数/同行人数、目的地时主动追问，完整后在末尾输出：
[TRIP_EXTRACT: {"destination":"南京","startDate":"2026-08-01","days":3,"origin":"北京","travelers":2}]
→ 追问示例："好的！请问您从哪个城市出发？目的地是哪个？计划玩几天？几个人同行？"

**类型2：普通聊天**（寒暄、感谢、确认等）
→ 正常回复，不输出任何标记

**类型3：单独查询**（用户只问酒店/景点/美食/交通，没有规划意图）
→ 提取搜索类型和关键词，在末尾输出：
[SEARCH: {"type":"hotels|attractions|food|transport","keyword":"搜索关键词","destination":"目的地"}]

示例：
- 用户: "我想去南京玩" → 缺出发地/日期/天数 → 追问"请问您从哪个城市出发？计划玩几天？"
- 用户: "北京出发，玩3天" → [TRIP_EXTRACT: {"destination":"南京","startDate":"2026-06-18","days":3,"origin":"北京","travelers":1}]
- 用户: "谢谢" → 正常回复
- 用户: "帮我规划南京三日游，8月1日出发，北京出发" → [TRIP_EXTRACT: {"destination":"南京","startDate":"2026-08-01","days":3,"origin":"北京","travelers":1}]
- 用户: "8.1南京出发去上海 玩3天" → 目的地=上海, 出发地=南京, 日期=2026-08-01, 天数=3 → [TRIP_EXTRACT: {"destination":"上海","startDate":"2026-08-01","days":3,"origin":"南京","travelers":1}]

关键规则：
- **"去XX"/"到XX"/"前往XX" 中的 XX 是目的地**，不是出发地
- 每次回复前先检查历史中已有的信息
- **行程规划模式主动追问出发地(origin)、天数(days)、人数(travelers)**
- 单独查询模式直接输出 SEARCH 标记
- 只输出一种标记
- **如果用户只说了月份和日期没说年份，默认补全为当前年份 2026**
- travelers 默认为 1 人`;

const EXTRACT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'plan_trip',
      description: '用户想要规划行程时调用。提取目的地、出发日期(YYYY-MM-DD)、游玩天数、出发城市、同行人数。即便信息不完整也请调用，未知字段留空。',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string', description: '旅游目的地城市名称' },
          startDate: { type: 'string', description: '出发日期 YYYY-MM-DD，未知则留空' },
          days: { type: 'integer', description: '游玩天数，未知则填0' },
          origin: { type: 'string', description: '出发城市，未知则留空' },
          travelers: { type: 'integer', description: '同行人数，默认1' }
        },
        required: ['destination']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_item',
      description: '用户单独查询酒店/景点/美食/交通但没有规划完整行程时调用',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['hotels', 'attractions', 'food', 'transport'], description: '查询类型' },
          keyword: { type: 'string', description: '搜索关键词' },
          destination: { type: 'string', description: '目的地城市' }
        },
        required: ['type', 'keyword']
      }
    }
  }
];

// ==================== 提取辅助 ====================

const extractTripInfo = (text) => {
  const m = text.match(/\[TRIP_EXTRACT:\s*({[^\]]+})\]/);
  if (m) {
    try { return JSON.parse(m[1]); } catch { return null; }
  }
  return null;
};

const extractSearchInfo = (text) => {
  const m = text.match(/\[SEARCH:\s*({[^\]]+})\]/);
  if (m) {
    try { return JSON.parse(m[1]); } catch { return null; }
  }
  return null;
};

// ==================== 行程构建 ====================

const addDayStr = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getIcon = (type) => {
  const map = { sightseeing: '🏛️', food: '🍜', hotel: '🏨', transport: '🚗', other: '📌' };
  return map[type] || '📌';
};

const buildFallbackTripPlan = (info) => {
  const start = new Date(info.startDate);
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const itinerary = [];
  for (let i = 0; i < info.days; i++) {
    const date = fmt(addDays(start, i));
    itinerary.push({ day: i + 1, date, title: `第${i + 1}天`, activities: [] });
  }

  return {
    id: 'plan_' + Date.now(),
    title: `${info.destination}${info.days}日游`,
    destination: info.destination,
    origin: info.origin || '',
    travelers: info.travelers || 1,
    startDate: info.startDate,
    endDate: fmt(addDays(start, info.days - 1)),
    days: info.days,
    description: `为您规划的${info.destination}${info.days}日行程`,
    image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}/750/400`,
    tags: [],
    status: 'active',
    itinerary,
    createdAt: new Date().toISOString()
  };
};

const buildTripPlan = (info, content) => {
  const start = new Date(info.startDate);
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  console.log(`[buildTripPlan] 输入前300字符: "${content.substring(0, 300).replace(/\n/g, '↵')}"`);
  const dayBlocks = content.split(/##\s*(?:Day\s*\d+|第\s*\d+\s*天)/i).slice(1);
  console.log(`[buildTripPlan] 解析到 ${dayBlocks.length} 个 dayBlocks, 预期 ${info.days} 天`);
  const itinerary = [];
  const totalDays = Math.max(dayBlocks.length, info.days);

  for (let i = 0; i < totalDays; i++) {
    const block = dayBlocks[i] || '';
    const date = fmt(addDays(start, i));
    const activities = [];
    let actCount = 0;

    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('-')) continue;

      const hotelMatch = trimmed.match(/^-\s*住宿\s*\|\s*(.+)$/);
      if (hotelMatch) {
        activities.push({
          id: `act_${Date.now()}_${actCount++}`,
          time: '', title: hotelMatch[1].trim(),
          location: '', description: '', icon: getIcon('hotel'), type: 'hotel',
          image: '', jumpUrl: ''
        });
        continue;
      }

      const timeMatch = trimmed.match(/^-\s*(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s*\|\s*(景点|美食|住宿|交通|其他)\s*\|\s*(.+)$/);
      if (timeMatch) {
        const typeMap = { '景点': 'sightseeing', '美食': 'food', '住宿': 'hotel', '交通': 'transport', '其他': 'other' };
        activities.push({
          id: `act_${Date.now()}_${actCount++}`,
          time: `${timeMatch[1]}-${timeMatch[2]}`,
          title: timeMatch[4].trim(),
          location: '', description: '', icon: getIcon(typeMap[timeMatch[3]] || 'other'), type: typeMap[timeMatch[3]] || 'other',
          image: '', jumpUrl: ''
        });
      }
    }
    console.log(`[buildTripPlan] Day ${i + 1} 提取到 ${activities.length} 个活动`);
    itinerary.push({ day: i + 1, date, title: `第${i + 1}天`, activities });
  }

  return {
    id: 'plan_' + Date.now(),
    title: `${info.destination}${info.days}日游`,
    destination: info.destination,
    origin: info.origin || '',
    travelers: info.travelers || 1,
    startDate: info.startDate,
    endDate: fmt(addDays(start, info.days - 1)),
    days: info.days,
    description: content.split('\n').slice(0, 3).join(' ').substring(0, 200),
    image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}/750/400`,
    tags: [],
    status: 'active',
    itinerary,
    createdAt: new Date().toISOString()
  };
};

// ==================== 主入口 ====================

const handleChat = async (query, history = [], context = {}) => {
  console.log(`[Chat] 用户: ${query}`);

  const LLM_API_KEY = process.env.LLM_API_KEY || '';

  if (!LLM_API_KEY) {
    return {
      id: 'err_' + Date.now(),
      role: 'assistant',
      content: '服务暂不可用，请稍后再试。',
      timestamp: new Date().toISOString()
    };
  }

  // re-search 场景 → 云函数不支持 FlyAI，返回提示
  if (context?.reselectAct) {
    return {
      id: 'llm_' + Date.now(),
      role: 'assistant',
      content: '活动推荐请查看详情页。',
      context,
      timestamp: new Date().toISOString()
    };
  }

  // ===== 第一步：LLM 分析 =====
  const filteredHistory = smartHistory(history, query);
  const llmMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...filteredHistory.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (m.content || '').replace(/\[(?:TRIP_EXTRACT|SEARCH):[^\]]+\]/g, '')
    })),
    { role: 'user', content: query }
  ];

  const step1Result = await callLLM(llmMessages, { maxTokens: 1200, tools: EXTRACT_TOOLS });
  if (!step1Result) {
    return {
      id: 'err_' + Date.now(),
      role: 'assistant',
      content: '抱歉，我暂时无法处理。请稍后重试。',
      timestamp: new Date().toISOString()
    };
  }

  let step1Content, tripInfo, searchInfo;

  if (typeof step1Result === 'object' && step1Result.toolCalls?.length > 0) {
    step1Content = step1Result.content || '';
    for (const tc of step1Result.toolCalls) {
      try {
        const args = JSON.parse(tc.function.arguments);
        if (tc.function.name === 'plan_trip') {
          tripInfo = {
            destination: args.destination || undefined,
            startDate: args.startDate || undefined,
            days: args.days > 0 ? args.days : undefined,
            origin: args.origin || undefined,
            travelers: args.travelers > 0 ? args.travelers : undefined
          };
          console.log(`[Chat] FC 提取行程: ${JSON.stringify(tripInfo)}`);
        } else if (tc.function.name === 'search_item') {
          searchInfo = args;
          console.log(`[Chat] FC 提取搜索: ${JSON.stringify(searchInfo)}`);
        }
      } catch (err) {
        console.log('[Chat] FC 参数解析失败:', err.message);
      }
    }
  } else {
    step1Content = typeof step1Result === 'string' ? step1Result : (step1Result?.content || '');
  }

  if (!tripInfo && !searchInfo && step1Content) {
    tripInfo = extractTripInfo(step1Content);
    searchInfo = extractSearchInfo(step1Content);
  }

  // 简单搜索 → 返回文本提示
  if (searchInfo && !tripInfo) {
    console.log(`[Chat] 单独查询: type=${searchInfo.type}`);
    return {
      id: 'search_' + Date.now(),
      role: 'assistant',
      content: step1Content.replace(/\[SEARCH:[^\]]+\]/g, '').trim() + '\n\n（搜索功能请联系 FlyAI 服务器）',
      timestamp: new Date().toISOString()
    };
  }

  // 普通对话
  if (!tripInfo) {
    return {
      id: 'llm_' + Date.now(),
      role: 'assistant',
      content: step1Content.replace(/\[SEARCH:[^\]]+\]/g, '').trim(),
      timestamp: new Date().toISOString()
    };
  }

  console.log(`[Chat] 提取成功: ${JSON.stringify(tripInfo)}`);

  // 缺天数/出发地 → 追问
  const missing = [];
  if (!tripInfo.days || tripInfo.days < 1) missing.push('计划玩几天');
  if (!tripInfo.origin) missing.push('从哪个城市出发');
  if (missing.length > 0) {
    console.log(`[Chat] 缺${missing.join('、')}，追问用户`);
    const travelerNote = tripInfo.travelers ? `，${tripInfo.travelers}人同行` : '';
    return {
      id: 'a_' + Date.now(),
      role: 'assistant',
      content: `好的！请问您${missing.join('？')}呢？${travelerNote}`,
      timestamp: new Date().toISOString()
    };
  }

  // ===== 第二步：LLM 生成行程 =====
  const originNote = tripInfo.origin ? `从 ${tripInfo.origin} 出发` : '';
  const travelerNote = tripInfo.travelers ? `，${tripInfo.travelers}人同行` : '';
  const itineraryPrompt = `你是资深旅行规划师，请根据你对该目的地的了解（参考各大社交平台好评），为用户规划 ${tripInfo.destination} ${tripInfo.days}天行程（${tripInfo.startDate} 出发${originNote ? `，${originNote}` : ''}${travelerNote}）。

每天安排 4-5 个活动，推荐真实存在的、口碑好的景点、美食和酒店。
${originNote ? `Day1 第一条必须是交通（如"${tripInfo.origin}到${tripInfo.destination} 高铁"或"${tripInfo.origin}飞${tripInfo.destination} 航班"），最后一天最后一条也加上返程交通。` : ''}

严格按照以下 Markdown 格式输出，每天一个 ## Day 段落：

## Day 1（${tripInfo.startDate}）
- 09:00-12:00 | 景点 | 中山陵
- 12:00-13:30 | 美食 | 鸡鸣汤包
- 13:30-17:00 | 景点 | 夫子庙
- 17:30-19:00 | 美食 | 李记清真馆
- 19:00-21:00 | 景点 | 秦淮河
- 住宿 | 南京威斯汀酒店

## Day 2（${addDayStr(tripInfo.startDate, 1)}）
（同上格式）

## Day 3（${addDayStr(tripInfo.startDate, 2)}）
（同上格式）

**强制要求：**
- 必须输出 ${tripInfo.days} 天
- 每行：- HH:MM-HH:MM | 类型 | 名称  或  - 住宿 | 酒店名
- 类型只四种：景点、美食、住宿、交通
- 交通通常出现在每天的第一条（抵达）或最后一条（离开），例如高铁、航班、机场大巴等
- **不要编号**，直接写名称
- 景点留足时间，吃饭不超 1.5 小时
- 每天最后一行是住宿
- 推荐真实场所，基于口碑和好评

**⚠️ 去重与可行性约束（非常重要）：**
- 每天的景点、美食、酒店必须各不相同，绝不能多天推荐同一个地方
- 每晚只推荐一家酒店，不同天可以不同酒店也可以同一家连住
- 必须考虑实际可行性：晚上/夜间（18:00 以后）只能安排夜市、美食街、灯光秀、演出等夜间开放场所，不能安排博物馆、陵墓、爬山等白天才开放的景点
- 同理，上午 9:00 前不要安排餐厅（多数未营业），优先安排景点
- 每个景点的时间安排要符合该场所的实际开放时间，不确定就保守安排`;

  const step2Content = await callLLM([
    { role: 'system', content: '你是资深旅行规划师，基于知识推荐真实存在的优质景点、美食、酒店。输出纯文本 Markdown，不含编号。' },
    { role: 'user', content: itineraryPrompt }
  ], { maxTokens: 4096, temperature: 0.3 });

  console.log(`[Chat] Step2 LLM 返回: ${step2Content ? step2Content.length + ' 字符' : 'NULL'}`);

  const tripPlan = step2Content
    ? buildTripPlan(tripInfo, step2Content)
    : buildFallbackTripPlan(tripInfo);

  console.log(`[Chat] tripPlan: ${tripPlan.itinerary.length} 天, Day1 ${tripPlan.itinerary[0]?.activities?.length || 0} 个活动`);

  return {
    id: 'trip_' + Date.now(),
    role: 'assistant',
    content: `为您规划了${tripPlan.title}，点击每个活动查看推荐`,
    searchItems: undefined,
    tripPlan,
    timestamp: new Date().toISOString()
  };
};

// ==================== 云函数入口 ====================

exports.main = async (event, context) => {
  const { query, history, context: chatContext } = event;
  return await handleChat(query, history || [], chatContext || {});
};
