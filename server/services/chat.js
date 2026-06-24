const { aiSearch, keywordSearch, searchFlight, searchHotel, searchPoi, isAvailable } = require('./flyai');
const chatMock = require('./mock');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';

const cleanUrl = (url) => (url || '').replace(/[`\s]/g, '');

/**
 * 调用大模型
 */
const callLLM = async (messages, options = {}) => {
  if (!LLM_API_KEY) {
    console.log('[LLM] 未配置 LLM_API_KEY，跳过');
    return null;
  }
  console.log(`[LLM] 调用 ${LLM_MODEL} @ ${LLM_API_URL}...`);
  try {
    const res = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: options.maxTokens || 1200,
        temperature: options.temperature ?? 0.7,
        ...(options.tools ? { tools: options.tools, tool_choice: 'auto' } : {})
      })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[LLM] HTTP ${res.status}: ${errBody.substring(0, 300)}`);
      return null;
    }
    const data = await res.json();
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

    // 有 tools 且 LLM 调用了函数 → 返回结构化对象
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

/**
 * 从 LLM 回复末尾提取 [TRIP_EXTRACT: {...}]
 */
const extractTripInfo = (text) => {
  const m = text.match(/\[TRIP_EXTRACT:\s*({[^\]]+})\]/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch { return null; }
  }
  return null;
};

const extractSearchInfo = (text) => {
  const m = text.match(/\[SEARCH:\s*({[^\]]+})\]/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch { return null; }
  }
  return null;
};

/**
 * 构建搜索关键词
 */
const buildSearchQueries = (info) => {
  const dest = info.destination || '';
  return {
    hotels: `${dest} 酒店住宿推荐`,
    attractions: `${dest} 必去景点`,
    food: `${dest} 特色美食`
  };
};

/**
 * 从搜索结果构建 item list
 */
const buildSearchItems = (itemList) => {
  if (!Array.isArray(itemList)) return [];
  return itemList.slice(0, 8).map((item, idx) => {
    const info = item.info || item;
    const img = cleanUrl(info.picUrl || info.image || info.imageUrl || info.mainPic || info.photo || info.cover || info.img || '');
    if (idx === 0) console.log(`[buildSearchItems] 首项 keys: ${Object.keys(info).join(', ')}`);
    return {
      title: info.title || info.name || '推荐',
      price: String(info.price || ''),
      jumpUrl: cleanUrl(info.jumpUrl || info.jumpUrl || item.jumpUrl || ''),
      description: info.description || info.desc || '',
      image: img
    };
  });
};

/**
 * 从不同 FlyAI 接口响应中提取 itemList（兼容不同字段名）
 */
const getItemList = (res) => {
  if (!res || res.status !== 0 || !res.data) return [];
  const d = res.data;
  // 尝试各种可能的字段名
  const list = d.itemList || d.poiList || d.hotelList || d.flightList || d.list || d.items || d.data;
  if (list && Array.isArray(list)) return list;
  // 有些接口把结果直接放在 data 下
  return [];
};

/**
 * 从 keywordSearch 响应中提取 searchItems
 */
const extractSearchItems = (res) => {
  return buildSearchItems(getItemList(res));
};

/**
 * 智能上下文裁剪
 * - 最多保留最近 10 条消息
 * - 检测话题切换：提到不同目的地、明确说"新的"/"重新"等关键词
 */
const smartHistory = (history, currentQuery) => {
  const MAX = 10;
  let hist = history.slice(-MAX);

  // 话题切换检测关键词
  const newTopicKeywords = ['新的行程', '重新规划', '换个地方', '换个城市', '换一个', '再来一个', '重新开始'];
  const isNewTopic = newTopicKeywords.some(k => currentQuery.includes(k));

  if (isNewTopic) {
    console.log('[Chat] 检测到新话题，清空上下文');
    return [];
  }

  // 提取当前 query 中提到的新目的地
  const destPatterns = [
    /(?:去|到|想去|打算去|计划去)([\u4e00-\u9fff]{2,6})(?:玩|旅游|旅行|了)?/,
    /^([\u4e00-\u9fff]{2,6})(?:三日|三日游|几日|几日游|旅游|旅行|攻略|行程)/,
  ];
  // 非目的地通用词，不应触发目的地切换
  const nonDestWords = new Set([
    '公园', '餐厅', '饭店', '酒店', '宾馆', '商场', '超市', '机场',
    '车站', '地铁', '公交', '景点', '博物馆', '图书馆', '广场',
    '海边', '山上', '古城', '老街', '夜市', '码头', '沙滩'
  ]);
  let currentDest = '';
  for (const p of destPatterns) {
    const m = currentQuery.match(p);
    if (m) { currentDest = m[1]; break; }
  }

  // 如果匹配到的不是真实城市名（是公园/餐厅等通用词），忽略
  // 先去掉末尾的语气词/助词（"公园了" → "公园"）
  const cleanDest = currentDest.replace(/[了吧吗呢啊哦哈呀]{1,2}$/, '');
  if (cleanDest && nonDestWords.has(cleanDest)) {
    console.log(`[Chat] 忽略非目的地词: "${cleanDest}"（原匹配: "${currentDest}"）`);
    currentDest = '';
  } else if (cleanDest !== currentDest) {
    currentDest = cleanDest; // 清洗后更新
  }

  // 如果当前 query 有明确新目的地，且和最近 2 轮都在讨论另一个目的地，则裁剪
  if (currentDest && currentDest.length >= 2) {
    const recentUserMsgs = hist.filter(m => m.role === 'user').slice(-2);
    const sameDest = recentUserMsgs.every(m => m.content.includes(currentDest));
    if (!sameDest && recentUserMsgs.length > 0) {
      console.log(`[Chat] 目的地切换为「${currentDest}」，裁剪上下文`);
      hist = hist.slice(-4); // 保留最近 2 轮（4条）
    }
  }

  console.log(`[Chat] 上下文: ${hist.length} 条历史消息`);
  return hist;
};

const SYSTEM_PROMPT = `你是一个专业的旅行规划助手。请仔细阅读对话历史，记住用户之前说的每一句话。

你需要判断当前用户请求属于哪种类型：

**类型1：行程规划**（用户提到"规划""几日游""安排行程""帮我做攻略"等）
→ 提取：目的地、出发日期(YYYY-MM-DD)、天数、出发城市(origin)、同行人数(travelers)
→ 缺少出发地/天数/同行人数、目的地时主动追问，完整后在末尾输出：
[TRIP_EXTRACT: {"destination":"南京",,"startDate":"2026-08-01","days":3,"origin":"北京","travelers":2}]
→ 追问示例："好的！请问您从哪个城市出发？目的地是哪个？计划玩几天？几个人同行？"

**类型2：单独查询**（用户只问酒店/景点/美食/交通，没有规划意图）
→ 提取搜索类型和关键词，在末尾输出：
[SEARCH: {"type":"hotels|attractions|food|transport","keyword":"搜索关键词","destination":"目的地"}]
例如：
- "南京有什么好酒店" → [SEARCH: {"type":"hotels","keyword":"南京 酒店推荐","destination":"南京"}]
- "夫子庙附近有什么吃的" → [SEARCH: {"type":"food","keyword":"夫子庙 美食","destination":"南京"}]
- "推荐几个南京必去景点" → [SEARCH: {"type":"attractions","keyword":"南京 必去景点","destination":"南京"}]
- "帮我找北京到上海的机票" → [SEARCH: {"type":"transport","keyword":"北京 上海 机票","destination":"上海"}]

**类型3：普通聊天**（寒暄、感谢、确认等）
→ 正常回复，不输出任何标记

示例：
- 用户: "我想去南京玩" → 缺出发地/日期/天数 → 追问"请问您从哪个城市出发？计划玩几天？"
- 用户: "北京出发，玩3天" → [TRIP_EXTRACT: {"destination":"南京","startDate":"2026-06-18","days":3,"origin":"北京","travelers":1}]
- 用户: "南京有什么好酒店" → [SEARCH: {"type":"hotels","keyword":"南京 酒店推荐","destination":"南京"}]
- 用户: "谢谢" → 正常回复
- 用户: "帮我规划南京三日游，8月1日出发，北京出发" → [TRIP_EXTRACT: {"destination":"南京","startDate":"2026-08-01","days":3,"origin":"北京","travelers":1}]
- 用户: "8.1南京出发去上海 玩3天" → 目的地=上海（"去XX"=目的地，"从XX出发"=出发地），日期=2026-08-01，天数=3，出发地=南京 → [TRIP_EXTRACT: {"destination":"上海","startDate":"2026-08-01","days":3,"origin":"南京","travelers":1}]

关键规则：
- **"去XX"/"到XX"/"前往XX" 中的 XX 是目的地**，不是出发地。"从XX出发"中的 XX 是出发地(origin)
- 每次回复前先检查历史中已有的信息
- **行程规划模式主动追问出发地(origin)、天数(days)、人数(travelers)**，有任意一项缺失就不要输出 TRIP_EXTRACT
- 单独查询模式直接输出 SEARCH 标记
- 只输出一种标记
- **如果用户只说了月份和日期没说年份（如"8月1日""8.1"），默认补全为当前年份 2026**
- travelers 默认为 1 人`;

// 函数调用定义：优先用结构化提取，失败回退提示词解析
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

/**
 * 主入口 - 支持多轮对话行程规划
 */
const handleChat = async (query, history = [], context = {}) => {
  console.log(`[Chat] 用户: ${query}`);

  // ＝＝＝ 重新搜索单个活动 ＝＝＝
  if (context?.reselectAct) {
    console.log(`[Chat] 重新搜索活动: ${context.reselectAct.originalTitle} (${context.reselectAct.actType || 'unknown'})`);
    const actTitle = context.reselectAct.originalTitle;
    const dest = context.reselectAct.destination || '';
    const actType = context.reselectAct.actType || '';
    const typeLabel = { sightseeing: '景点', food: '美食', hotel: '酒店', transport: '交通', other: '' };
    const typeStr = typeLabel[actType] || '';

    // 构造更精准的搜索词：目的地 + 名称 + 类型
    const searchQuery = [dest, actTitle, typeStr].filter(Boolean).join(' ');
    console.log(`[Chat] reselectAct 搜索: "${searchQuery}"`);

    // FlyAI 搜索替代方案
    const searchRes = await keywordSearch(searchQuery || actTitle);
    const items = extractSearchItems(searchRes).slice(0, 5);

    if (items.length === 0) {
      return {
        id: 'llm_' + Date.now(),
        role: 'assistant',
        content: `抱歉，没有找到「${actTitle}」的替代方案。`,
        context,
        timestamp: new Date().toISOString()
      };
    }

    // LLM 分析并推荐最佳替代
    const promptText = items.slice(0, 5).map((it, i) =>
      `${i + 1}. ${it.title}${it.price ? ` (${it.price})` : ''}`
    ).join('\n');

    let suggestionContent = '';
    if (LLM_API_KEY) {
      const suggestionMsg = [
        { role: 'system', content: '你是旅行帮手。用户想替换行程中的一项活动，请从以下搜索结果中挑选最好的替代方案，简要说明推荐理由。只推荐1个。' },
        { role: 'user', content: `当前活动：「${actTitle}」\n\n搜索结果：\n${promptText}\n\n请推荐最佳替代方案。` }
      ];
      const suggestion = await callLLM(suggestionMsg, { maxTokens: 300, temperature: 0.5 });
      if (suggestion) suggestionContent = suggestion;
    }

    return {
      id: 'llm_' + Date.now(),
      role: 'assistant',
      content: suggestionContent || `为「${actTitle}」找到以下替代方案：`,
      searchItems: items,
      context,
      timestamp: new Date().toISOString()
    };
  }

  if (!LLM_API_KEY || !isAvailable()) {
    if (!LLM_API_KEY && !isAvailable()) return chatMock.chatResponse(query);
    if (!LLM_API_KEY) return simpleChat(query);
    if (!isAvailable()) return llmOnlyChat(query, history);
  }

  // === 第一步：LLM 分析对话，提取行程信息 ===
  const filteredHistory = smartHistory(history, query);
  const llmMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...filteredHistory.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (m.content || '').replace(/\[(?:TRIP_EXTRACT|SEARCH):[^\]]+\]/g, '')
    })),
    { role: 'user', content: query }
  ];

  // 优先用 function calling 提取，失败回退提示词解析
  const step1Result = await callLLM(llmMessages, { maxTokens: 1200, tools: EXTRACT_TOOLS });
  if (!step1Result) {
    console.log('[Chat] LLM 失败，降级');
    return simpleChat(query);
  }

  let step1Content, tripInfo, searchInfo;

  // 函数调用成功 → 直接拿结构化数据
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

  // 回退：函数调用未捕获时用提示词解析
  if (!tripInfo && !searchInfo && step1Content) {
    tripInfo = extractTripInfo(step1Content);
    searchInfo = extractSearchInfo(step1Content);
  }

  // === 简单搜索模式 ===
  if (searchInfo && !tripInfo) {
    console.log(`[Chat] 单独查询: type=${searchInfo.type}, keyword="${searchInfo.keyword}"`);
    const searchRes = await keywordSearch(searchInfo.keyword || searchInfo.destination || query);
    const items = extractSearchItems(searchRes).slice(0, 6);

    let content = step1Content.replace(/\[SEARCH:[^\]]+\]/g, '').trim();
    if (items.length > 0) {
      const formatted = items.map((it, i) =>
        `${i + 1}. **${it.title}**${it.price ? ' - ' + it.price : ''}`
      ).join('\n    🔗 ');
      content = `${content}\n\n---\n\n📌 相关推荐：\n\n${formatted}`;
    } else {
      content = `${content}\n\n暂未找到相关结果，换个关键词试试？`;
    }

    return {
      id: 'search_' + Date.now(),
      role: 'assistant',
      content,
      searchItems: items,
      timestamp: new Date().toISOString()
    };
  }

  // 非行程规划、非单独搜索 → 可能是行程修改请求
  if (!tripInfo) {
    // 检查是否有当前行程计划，尝试 LLM 修改
    if (context?.currentTripPlan) {
      console.log('[Chat] 尝试修改现有行程...');
      const modifiedPlan = await handleModifyTrip(context.currentTripPlan, query, filteredHistory);
      if (modifiedPlan) {
        console.log(`[Chat] 行程修改成功: ${modifiedPlan.itinerary.length} 天`);
        return {
          id: 'trip_' + Date.now(),
          role: 'assistant',
          content: `已根据您的要求调整行程`,
          tripPlan: modifiedPlan,
          timestamp: new Date().toISOString()
        };
      }
    }

    console.log('[Chat] 普通对话，直接返回 LLM 回复');
    return {
      id: 'llm_' + Date.now(),
      role: 'assistant',
      content: step1Content.replace(/\[SEARCH:[^\]]+\]/g, '').trim(),
      timestamp: new Date().toISOString()
    };
  }

  console.log(`[Chat] 提取成功: ${JSON.stringify(tripInfo)}`);

  // 有目的地但缺天数/出发地 → 追问
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

  // === 第二步：LLM 自主推荐生成行程（不依赖 FlyAI 搜索结果） ===
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
  ], { maxTokens: 4096, temperature: 0.3, skipReasoningFallback: true });

  // 如果 LLM 响应正常但 content 为空（推理模型问题），不降级 reasoning_content，直接重试
  console.log(`[Chat] Step2 LLM 返回: ${step2Content ? step2Content.length + ' 字符' : 'NULL'}`);

  // === 第三步：解析行程（FlyAI 搜索延迟到用户点击详情页时进行） ===
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

/** 日期加 n 天，返回 YYYY-MM-DD 字符串 */
const addDayStr = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * LLM 修改现有行程
 */
const handleModifyTrip = async (currentTripPlan, userQuery, history) => {
  // 将当前行程格式化为文本
  const tripText = formatTripPlanAsText(currentTripPlan);
  console.log(`[ModifyTrip] 行程文本 ${tripText.length} 字符`);

  const modifyPrompt = `用户当前有一个已经规划好的行程，现在想要修改它。

当前行程：
${tripText}

用户说："${userQuery}"

请根据用户的要求修改行程。修改后严格按照以下 Markdown 格式输出完整的行程（每天一个 ## Day 段落）：

## Day 1（日期）
- HH:MM-HH:MM | 类型 | 名称
- HH:MM-HH:MM | 类型 | 名称
...
- 住宿 | 酒店名

## Day 2（日期）
...

**强制要求：**
- 必须输出 ${currentTripPlan.days || currentTripPlan.itinerary?.length || 3} 天
- 每行：- HH:MM-HH:MM | 类型 | 名称
- 类型只四种：景点、美食、住宿、交通
- 住宿行：- 住宿 | 酒店名
- 景点留足时间，吃饭不超 1.5 小时
- 每天最后一行是住宿
- 如果用户说"休息""不想去"某处，就把那个活动删除或用轻松的活动替代`;

  const content = await callLLM([
    { role: 'system', content: '你是旅行规划师。根据用户要求修改行程，输出纯文本 Markdown。' },
    { role: 'user', content: modifyPrompt }
  ], { maxTokens: 4096, temperature: 0.3, skipReasoningFallback: true });

  if (!content) {
    console.log('[ModifyTrip] LLM 返回空');
    return null;
  }

  console.log(`[ModifyTrip] LLM 返回 ${content.length} 字符`);
  const tripPlan = buildTripPlan({
    destination: currentTripPlan.destination || '',
    startDate: currentTripPlan.startDate || '',
    days: currentTripPlan.days || currentTripPlan.itinerary?.length || 3,
    origin: currentTripPlan.origin || '',
    travelers: currentTripPlan.travelers || 1
  }, content);

  // 保留原始 id 等信息
  tripPlan.id = currentTripPlan.id || tripPlan.id;
  return tripPlan;
};

/** 将 TripPlan 格式化为 LLM 可读的文本 */
const formatTripPlanAsText = (plan) => {
  const lines = [];
  lines.push(`目的地: ${plan.destination}`);
  lines.push(`日期: ${plan.startDate}`);
  lines.push(`天数: ${plan.days}天`);
  if (plan.origin) lines.push(`出发地: ${plan.origin}`);
  lines.push('');

  const itinerary = plan.itinerary || [];
  for (const day of itinerary) {
    lines.push(`## Day ${day.day} (${day.date})`);
    const acts = day.activities || [];
    for (const act of acts) {
      if (act.type === 'hotel') {
        lines.push(`- 住宿 | ${act.title}`);
      } else if (act.time) {
        lines.push(`- ${act.time} | ${typeLabel(act.type)} | ${act.title}`);
      } else {
        lines.push(`- ${typeLabel(act.type)} | ${act.title}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
};

const typeLabel = (t) => ({ sightseeing: '景点', food: '美食', hotel: '住宿', transport: '交通', other: '其他' }[t] || '其他');

/**
 * 降级：直接用搜索结果拼行程（LLM 失败时）
 */
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

/**
 * 从 LLM 输出构建 TripPlan（纯解析，不依赖搜索条目）
 */
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

      // 住宿行：- 住宿 | 酒店名
      const hotelMatch = trimmed.match(/^-\s*住宿\s*\|\s*(.+)$/);
      if (hotelMatch) {
        activities.push({
          id: `act_${Date.now()}_${actCount++}`,
          time: '', title: hotelMatch[1].trim(),
          location: '', description: '', icon: getIcon('hotel'), type: 'hotel',
          image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}酒店/200/200`, jumpUrl: ''
        });
        continue;
      }

      // 时间行：- HH:MM-HH:MM | 类型 | 名称
      const timeMatch = trimmed.match(/^-\s*(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s*\|\s*(景点|美食|住宿|交通|其他)\s*\|\s*(.+)$/);
      if (timeMatch) {
        const typeMap = { '景点': 'sightseeing', '美食': 'food', '住宿': 'hotel', '交通': 'transport', '其他': 'other' };
        const actTitle = timeMatch[4].trim();
        activities.push({
          id: `act_${Date.now()}_${actCount++}`,
          time: `${timeMatch[1]}-${timeMatch[2]}`,
          title: actTitle,
          location: '', description: '', icon: getIcon(typeMap[timeMatch[3]] || 'other'), type: typeMap[timeMatch[3]] || 'other',
          image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}${encodeURIComponent(actTitle)}/200/200`, jumpUrl: ''
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

/**
 * 无 LLM 的简单搜索
 */
const simpleChat = async (query) => {
  let searchItems = [];
  try {
    const res = await keywordSearch(query);
    if (res.status === 0 && res.data?.itemList) {
      searchItems = buildSearchItems(res.data.itemList);
    }
  } catch (err) {
    console.error('[Chat] keyword-search 异常:', err.message);
  }

  if (searchItems.length > 0) {
    let content = `关于「${query}」，我找到以下内容：\n\n`;
    searchItems.forEach((item, i) => {
      content += `${i + 1}. **${item.title}**\n    ${item.jumpUrl}\n`;
    });
    return {
      id: 'kw_' + Date.now(),
      role: 'assistant',
      content,
      searchItems,
      timestamp: new Date().toISOString()
    };
  }
  return chatMock.chatResponse(query);
};

/**
 * 仅有 LLM 无 FlyAI 时的回复
 */
const llmOnlyChat = async (query, history) => {
  const llmMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : m.content
    })),
    { role: 'user', content: query }
  ];
  const content = await callLLM(llmMessages, { maxTokens: 1200 });
  return {
    id: 'llm_' + Date.now(),
    role: 'assistant',
    content: (content || '抱歉，我暂时无法回答。请稍后再试。').replace(/\[(?:TRIP_EXTRACT|SEARCH):[^\]]+\]/g, ''),
    timestamp: new Date().toISOString()
  };
};

const getIcon = (type) => {
  const map = { sightseeing: '🏛️', food: '🍜', hotel: '🏨', transport: '🚗', other: '📌' };
  return map[type] || '📌';
};

/**
 * 按活动类型路由到 FlyAI 对应接口，避免类型混淆
 */
const searchByType = async ({ destination, title, type, query, origin, startDate }) => {
  const searchQuery = query || `${destination} ${title}`;

  switch (type) {
    case 'sightseeing': {
      // 景点 → 用 searchPoi，结果主要是景点
      const res = await searchPoi({ cityName: destination, keyword: title });
      let items = buildSearchItems(getItemList(res));
      if (items.length > 0) return items;
      // 回退 keywordSearch
      const kwRes = await keywordSearch(`${searchQuery} 景点`);
      return buildSearchItems(getItemList(kwRes));
    }
    case 'hotel': {
      // 酒店 → 用 searchHotel，结果全是酒店
      const res = await searchHotel({ destName: destination, keyWords: title });
      let items = buildSearchItems(getItemList(res));
      if (items.length > 0) return items;
      const kwRes = await keywordSearch(`${searchQuery} 酒店`);
      return buildSearchItems(getItemList(kwRes));
    }
    case 'transport': {
      // 交通 → 优先用 searchFlight（有出发地时），否则跳过（飞猪无交通类数据）
      // 尝试从标题提取出发地：北京到上海、北京-上海、北京→上海
      let flightOrigin = origin || '';
      if (!flightOrigin) {
        const routeMatch = title.match(/(.+?)[到\-\→]\s*(.+)/);
        if (routeMatch && routeMatch[1].length < 10) flightOrigin = routeMatch[1].trim();
      }
      if (flightOrigin && startDate) {
        console.log(`[searchByType] 交通使用 searchFlight: ${flightOrigin} → ${destination} @ ${startDate}`);
        const flightRes = await searchFlight({ origin: flightOrigin, destination, depDate: startDate });
        const items = buildSearchItems(getItemList(flightRes));
        if (items.length > 0) return items;
      }
      // 无出发地或无结果 → 空结果（飞猪 keywordSearch 搜不出机票/高铁）
      console.log(`[searchByType] 交通搜索跳过（${flightOrigin ? '无航班结果' : '无出发地'})`);
      return [];
    }
    case 'food': {
      // 飞猪平台暂不支持餐饮类商户搜索
      console.log(`[searchByType] 餐饮搜索跳过（飞猪无餐厅数据）`);
      return [];
    }
    default: {
      const res = await keywordSearch(searchQuery);
      return buildSearchItems(getItemList(res));
    }
  }
};

/**
 * 换一个推荐：接收用户不满原因，LLM 提炼精准搜索词，排除已展示标题
 */
const refreshRecommend = async ({ destination, title, type, excludeTitles, reason }) => {
  // 美食 → LLM 根据用户原因推荐替代餐厅
  if (type === 'food') {
    console.log(`[refreshRecommend] 美食 LLM 推荐, reason="${reason || ''}"`);
    const foodPrompt = [
      { role: 'system', content: `你是${destination}的资深美食博主。请根据用户需求推荐一家替代餐厅。只输出JSON，不要其他文字。` },
      { role: 'user', content: `当前推荐是「${title}」${reason ? `，用户的意见是：${reason}` : '，用户想要其他选择'}。排除以下已推荐的：${excludeTitles.join('、') || '无'}。请推荐一家不同的餐厅，输出JSON：
{
  "name": "餐厅名称",
  "description": "简短介绍（50字内）",
  "features": ["特色1", "特色2"],
  "recommendedDishes": ["招牌菜1", "招牌菜2"],
  "address": "大致地址",
  "avgPrice": "人均价格"
}` }
    ];
    try {
      const content = await callLLM(foodPrompt, { maxTokens: 400, temperature: 0.7 });
      if (!content) throw new Error('empty');
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no json');
      const food = JSON.parse(jsonMatch[0]);
      if (!food.name) throw new Error('no name');
      const item = {
        title: food.name,
        price: food.avgPrice || '',
        jumpUrl: '',
        description: food.description || '',
        image: '',
        features: food.features || [],
        recommendedDishes: food.recommendedDishes || [],
        address: food.address || '',
        avgPrice: food.avgPrice || '',
        noDetail: true
      };
      return { success: true, items: [item], foodDetail: true };
    } catch (err) {
      console.error(`[refreshRecommend] 美食 LLM 失败:`, err.message);
      return { success: false, items: [], message: '暂无其他推荐，请尝试换一个需求描述' };
    }
  }

  const typeLabel = { sightseeing: '景点', food: '美食', hotel: '酒店', transport: '交通', other: '推荐' };
  const label = typeLabel[type] || '推荐';

  // 用户提供了原因 → 用 LLM 提炼精准搜索词
  let queries;
  if (reason && reason.trim()) {
    console.log(`[refreshRecommend] 用户原因: "${reason}"`);
    const kwPrompt = [
      { role: 'system', content: '你是搜索关键词提炼专家。只输出关键词，用 | 分隔，不要其他任何内容。' },
      { role: 'user', content: `${destination} ${title}（${label}）。用户不满原因：${reason}。生成2-3个精准搜索关键词，用|分隔。` }
    ];
    const llmKeywords = await callLLM(kwPrompt, { maxTokens: 80, temperature: 0.3, skipReasoningFallback: true });
    if (llmKeywords) {
      queries = llmKeywords.split('|')
        .map(k => k.trim())
        .filter(k => k.length > 1 && k.length < 50 && !/生成|关键词|输出|用\||只|分隔/.test(k));
      if (queries.length > 0) {
        console.log(`[refreshRecommend] LLM 搜索词: ${queries.join(' | ')}`);
      } else {
        console.log(`[refreshRecommend] LLM 未产出有效关键词，回退按类型搜索`);
        queries = null;
      }
    }
  }

  // 回退：无原因或 LLM 失败 → 构造替代搜索词
  const excludeSet = new Set((excludeTitles || []).map(t => t.toLowerCase()));

  if (!queries || queries.length === 0) {
    // 有用户原因 → 按类型搜附近（保持类型精准）
    const fbTitle = reason ? `${title}附近` : title;
    console.log(`[refreshRecommend] 回退 searchByType: type=${type} title="${fbTitle}"`);
    const items = await searchByType({ destination, title: fbTitle, type });
    const fresh = items.filter(it => !excludeSet.has(it.title.toLowerCase()));
    if (fresh.length >= 2) return { success: true, items: fresh.slice(0, 6) };
    // 还不行再用原标题搜一遍（必然有结果但都被过滤时触发）
    if (reason) {
      const retry = await searchByType({ destination, title, type });
      const retryFresh = retry.filter(it => !excludeSet.has(it.title.toLowerCase()));
      if (retryFresh.length >= 2) return { success: true, items: retryFresh.slice(0, 6) };
    }
    return { success: false, items: [], message: '暂无更多推荐，请稍后再试' };
  }

  // LLM 关键词搜索
  const typeFilter = {
    sightseeing: /酒店|住宿|hotel|inn|机票|航班|flight|高铁|美食|餐厅|饭馆/,
    hotel: /门票|景点|day.?tour|秀|美食|餐厅|饭馆|机票|航班|flight|高铁/,
    transport: /酒店|住宿|景点|门票|美食|餐厅/,
  };
  const tf = typeFilter[type];

  for (const q of queries) {
    console.log(`[refreshRecommend] LLM 关键词搜索: "${q}"`);
    const res = await keywordSearch(q);
    let items = buildSearchItems(getItemList(res));

    // 按类型过滤杂项结果
    if (tf) {
      items = items.filter(it => !tf.test(it.title));
    }
    // 过滤已展示过的
    const fresh = items.filter(it => !excludeSet.has(it.title.toLowerCase()));
    console.log(`[refreshRecommend] ${items.length} 个结果，过滤后剩 ${fresh.length} 个`);

    if (fresh.length >= 2) {
      return { success: true, items: fresh.slice(0, 6) };
    }
  }

  return { success: false, items: [], message: '暂无更多推荐，请稍后再试' };
};

/**
 * LLM 生成美食详情（描述、特色、地址等）
 */
const genFoodInfo = async ({ destination, title }) => {
  console.log(`[genFoodInfo] dest="${destination}" title="${title}"`);
  const prompt = [
    { role: 'system', content: `你是资深美食博主，对各地餐厅非常了解。请根据你对${destination}餐厅的了解，输出简洁JSON。只输出JSON，不要其他文字。` },
    { role: 'user', content: `请介绍「${title}」这家餐厅。输出JSON：
{
  "description": "简短介绍（50字内）",
  "features": ["特色1", "特色2", "特色3"],
  "recommendedDishes": ["招牌菜1", "招牌菜2", "招牌菜3"],
  "address": "大致地址",
  "avgPrice": "人均价格"
}` }
  ];
  try {
    const content = await callLLM(prompt, { maxTokens: 400, temperature: 0.5 });
    if (!content) throw new Error('empty');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`[genFoodInfo] 失败:`, err.message);
    return null;
  }
};

/**
 * 单活动搜索（用户点击详情页时懒加载）
 */
const searchActivity = async ({ destination, title, type, origin, startDate }) => {
  console.log(`[searchActivity] type=${type} destination="${destination}" title="${title}"${origin ? ' origin=' + origin : ''}`);

  // 美食 → LLM 生成信息
  if (type === 'food') {
    const foodInfo = await genFoodInfo({ destination, title });
    if (foodInfo) {
      const item = {
        title,
        price: foodInfo.avgPrice || '',
        jumpUrl: '',
        description: foodInfo.description || '',
        image: '',
        features: foodInfo.features || [],
        recommendedDishes: foodInfo.recommendedDishes || [],
        address: foodInfo.address || '',
        avgPrice: foodInfo.avgPrice || '',
        noDetail: true
      };
      return { success: true, items: [item], foodDetail: true };
    }
    return { success: false, items: [], message: '暂无该餐厅的详细信息' };
  }

  try {
    const items = await searchByType({ destination, title, type, origin, startDate });
    if (items.length > 0) {
      console.log(`[searchActivity] 找到 ${items.length} 个结果`);
      return { success: true, items: items.slice(0, 6) };
    }
  } catch (err) {
    console.error(`[searchActivity] 失败:`, err.message);
  }
  return { success: false, items: [], message: '暂无推荐' };
};

/**
 * LLM 根据当前月份推荐当季热门目的地（服务端缓存6小时）
 */
let hotDestCache = null;
let hotDestCacheTime = 0;
const getHotDestinations = async () => {
  const now = Date.now();
  if (hotDestCache && now - hotDestCacheTime < 6 * 60 * 60 * 1000) {
    console.log('[getHotDestinations] 命中缓存');
    return hotDestCache;
  }

  console.log('[getHotDestinations] 调用 LLM 生成...');
  const month = new Date().getMonth() + 1;
  const seasonMap = { 12: '冬季', 1: '冬季', 2: '冬季', 3: '春季', 4: '春季', 5: '春季', 6: '夏季', 7: '夏季', 8: '夏季', 9: '秋季', 10: '秋季', 11: '秋季' };
  const season = seasonMap[month] || '';

  const prompt = [
    { role: 'system', content: `你是国内旅行专家。当前${month}月（${season}），请推荐6个当季最适合旅游的国内目的地。只输出JSON数组，不要其他内容。` },
    { role: 'user', content: `输出格式：
[{"name":"城市名","province":"省份","description":"一句话推荐理由（15字内）","tags":["标签1","标签2","标签3"],"bestSeason":"最佳季节","budget":"低/中/高"}]` }
  ];

  try {
    const content = await callLLM(prompt, { maxTokens: 800, temperature: 0.7, skipReasoningFallback: true });
    if (!content) throw new Error('empty');
    // 支持裸 JSON 数组和 markdown 代码块
    let jsonStr = content;
    const codeMatch = content.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/);
    if (codeMatch) jsonStr = codeMatch[1];
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('no json array');
    const list = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(list) || list.length === 0) throw new Error('empty array');

    hotDestCache = list.map((d, i) => {
      const budget = d.budget || '中等';
      // rating 与 budget 对齐：高 → 4.5-4.8, 中 → 4.0-4.5, 低 → 3.5-4.0
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
    // 按评分从高到低排序
    hotDestCache.sort((a, b) => b.rating - a.rating);
    hotDestCacheTime = now;
    console.log(`[getHotDestinations] 生成 ${hotDestCache.length} 个目的地`);
    return hotDestCache;
  } catch (err) {
    console.error('[getHotDestinations] 失败:', err.message);
    return null;
  }
};

module.exports = {
  handleChat,
  searchFlight,
  searchHotel,
  searchPoi,
  isAvailable,
  refreshRecommend,
  searchActivity,
  getHotDestinations
};
