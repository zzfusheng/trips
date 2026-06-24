/**
 * CloudBase AI 服务 —— 用 wx.cloud.extend.AI 替代 Express LLM 调用
 * 无 60s 超时限制，streamText 逐 token 推送
 */
import type { ChatMessage, TripPlan, SearchItem, Destination } from '@/types/trip';

// === 类型声明 ===
declare const wx: any;

// ============================================
// LLM 调用（Step1 意图提取用 generateText，Step2 行程生成用 streamText）
// ============================================

const getModel = () => {
  const ai = wx.cloud.extend.AI;
  return ai.createModel('cloudbase');
};

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: string;
  skipReasoningFallback?: boolean;
  stream?: boolean; // true = streamText, false = generateText
  onChunk?: (text: string) => void; // streamText 逐字回调
  retries?: number;  // 429 重试次数
}

const callLLM = async (messages: any[], options: LLMOptions = {}): Promise<string | null> => {
  const maxRetries = options.retries ?? 2;
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const model = getModel();
    const data: any = {
      model: 'deepseek-v4-flash',
      messages,
      max_tokens: options.maxTokens || 1200,
      temperature: options.temperature ?? 0.7
    };

    // 连续 2 次空结果 → 切混元
    if (options.fallbackModel && !options._switched) {
      options._switched = true;
      data.model = options.fallbackModel;
      console.log(`[CloudAI] 切换模型: ${options.fallbackModel}`);
    }

    const label = attempt > 0 ? `重试${attempt}` : '';
    console.log(`[CloudAI] 调用 deepseek-v4-flash${label}, stream=${options.stream !== false}`);

    try {
      if (options.stream !== false) {
        let fullText = '';
        const res = await model.streamText({ data });
        const stream = res.textStream;
        for await (const chunk of stream) {
          fullText += chunk;
          if (options.onChunk) options.onChunk(chunk);
        }
        if (fullText.length > 0) {
          console.log(`[CloudAI] streamText 完成, ${fullText.length} 字符`);
          return fullText;
        }
        // 空结果 = 可能是 429 被 SDK 吞了
        console.log(`[CloudAI] streamText 返回空，疑似限流，重试${attempt + 1}`);
        lastErr = new Error('empty_result');
        await delay(1500);
        continue;
      } else {
        const res = await model.generateText({ data });
        const choice = res.choices?.[0]?.message;
        if (!choice) {
          // 空响应也可能是限流
          lastErr = new Error('no_choices');
          await delay(1500);
          continue;
        }

        let content = choice.content;
        if (!content && !options.skipReasoningFallback) {
          const rc = choice.reasoning_content;
          if (rc) {
            console.log('[CloudAI] 使用 reasoning_content（content 为空）');
            content = rc;
          }
        }
        if (!content) {
          lastErr = new Error('empty_content');
          await delay(1500);
          continue;
        }
        console.log('[CloudAI] generateText 完成');
        return content;
      }
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || err || '';
      if (msg.includes('429') || msg.includes('Too Many')) {
        const wait = (attempt + 1) * 1500;
        console.log(`[CloudAI] 429 限流，${wait}ms 后重试(${attempt + 1}/${maxRetries})`);
        await delay(wait);
        continue;
      }
      console.error('[CloudAI] 异常:', msg);
      return null;
    }
  }

  console.error(`[CloudAI] ${maxRetries}次重试后仍失败:`, lastErr?.message || lastErr);
  return null;
};

// ============================================
// 工具函数
// ============================================

const cleanUrl = (url: string) => (url || '').replace(/[`\s]/g, '');

const extractTripInfo = (text: string) => {
  const m = text.match(/\[TRIP_EXTRACT:\s*({[^\]]+})\]/);
  if (m) {
    try { return JSON.parse(m[1]); } catch { return null; }
  }
  return null;
};

const getIcon = (type: string) => {
  const map: Record<string, string> = { sightseeing: '🏛️', food: '🍜', hotel: '🏨', transport: '🚗', other: '📌' };
  return map[type] || '📌';
};

const addDayStr = (dateStr: string, n: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ============================================
// Prompt & Tools
// ============================================

const SYSTEM_PROMPT = `你是一个专业的旅行规划助手。请仔细阅读对话历史，记住用户之前说的每一句话。

你需要判断当前用户请求属于哪种类型：

**类型1：行程规划**（用户提到"规划""几日游""安排行程""帮我做攻略"等）
→ 提取：目的地、出发日期(YYYY-MM-DD)、天数、出发城市(origin)、同行人数(travelers)
→ 缺少出发地/天数/同行人数、目的地时主动追问，完整后在末尾输出：
[TRIP_EXTRACT: {"destination":"南京","startDate":"2026-08-01","days":3,"origin":"北京","travelers":2}]
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

// ============================================
// 裁剪上下文（目的地切换时保留最近几轮）
// ============================================

const trimContext = (history: any[], currentDest?: string) => {
  let hist = history.slice();
  if (currentDest) {
    const recentUserMsgs = hist.filter(m => m.role === 'user').slice(-2);
    const sameDest = recentUserMsgs.every((m: any) => m.content?.includes(currentDest));
    if (!sameDest && recentUserMsgs.length > 0) {
      console.log(`[CloudAI] 目的地切换为「${currentDest}」，裁剪上下文`);
      hist = hist.slice(-4);
    }
  }
  return hist;
};

// ============================================
// 降级行程（LLM 失败时）
// ============================================

const buildFallbackTripPlan = (info: any): TripPlan => {
  const start = new Date(info.startDate);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDaysFn = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const itinerary: any[] = [];
  for (let i = 0; i < info.days; i++) {
    const date = fmt(addDaysFn(start, i));
    itinerary.push({ day: i + 1, date, title: `第${i + 1}天`, activities: [] });
  }

  return {
    id: 'plan_' + Date.now(),
    title: `${info.destination}${info.days}日游`,
    destination: info.destination,
    origin: info.origin || '',
    travelers: info.travelers || 1,
    startDate: info.startDate,
    endDate: fmt(addDaysFn(start, info.days - 1)),
    days: info.days,
    description: `为您规划的${info.destination}${info.days}日行程`,
    image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}/750/400`,
    tags: [],
    status: 'active',
    itinerary,
    createdAt: new Date().toISOString()
  };
};

// ============================================
// 从 LLM 输出构建 TripPlan
// ============================================

const buildTripPlan = (info: any, content: string): TripPlan => {
  const start = new Date(info.startDate);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDaysFn = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  console.log(`[buildTripPlan] 输入前300字符: "${content.substring(0, 300).replace(/\n/g, '↵')}"`);
  const dayBlocks = content.split(/##\s*(?:Day\s*\d+|第\s*\d+\s*天)/i).slice(1);
  console.log(`[buildTripPlan] 解析到 ${dayBlocks.length} 个 dayBlocks, 预期 ${info.days} 天`);
  const itinerary: any[] = [];
  const totalDays = Math.max(dayBlocks.length, info.days);

  for (let i = 0; i < totalDays; i++) {
    const block = dayBlocks[i] || '';
    const date = fmt(addDaysFn(start, i));
    const activities: any[] = [];
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
          image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}酒店/200/200`, jumpUrl: ''
        });
        continue;
      }

      const timeMatch = trimmed.match(/^-\s*(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s*\|\s*(景点|美食|住宿|交通|其他)\s*\|\s*(.+)$/);
      if (timeMatch) {
        const typeMap: Record<string, string> = { '景点': 'sightseeing', '美食': 'food', '住宿': 'hotel', '交通': 'transport', '其他': 'other' };
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
    endDate: fmt(addDaysFn(start, info.days - 1)),
    days: info.days,
    description: content.split('\n').slice(0, 3).join(' ').substring(0, 200),
    image: `https://picsum.photos/seed/${encodeURIComponent(info.destination)}/750/400`,
    tags: [],
    status: 'active',
    itinerary,
    createdAt: new Date().toISOString()
  };
};

// ============================================
// 主入口：AI 对话 + 行程规划
// ============================================

export const handleChat = async (
  query: string,
  history: ChatMessage[] = [],
  context?: { reselectAct?: any },
  onStream?: (chunk: string) => void
): Promise<ChatMessage> => {
  console.log(`[CloudAI] 用户: ${query}`);

  // === 重新搜索单个活动（降级：返回简单回复，FlyAI 搜索在 Express 处理） ===
  if (context?.reselectAct) {
    const actTitle = context.reselectAct.originalTitle;
    return {
      id: 'reselect_' + Date.now(),
      role: 'assistant',
      content: `正在为您重新搜索「${actTitle}」...`,
      timestamp: new Date().toISOString(),
      context: context
    };
  }

  // === Step 1：意图提取（generateText，纯文本解析） ===
  const hist = trimContext(history);
  const step1Result = await callLLM([
    { role: 'system', content: SYSTEM_PROMPT },
    ...hist.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: query }
  ], { maxTokens: 800, stream: false });

  if (!step1Result || typeof step1Result !== 'string') {
    console.log('[CloudAI] Step1 LLM 返回 NULL');
    return { id: 'err_' + Date.now(), role: 'assistant', content: '抱歉，我暂时无法处理。请稍后重试。', timestamp: new Date().toISOString() };
  }

  const step1Content = step1Result;
  let tripInfo = extractTripInfo(step1Content);

  console.log(`[CloudAI] Step1: tripInfo=${JSON.stringify(tripInfo)}`);

  // 两步之间加 1s 间隔，避免 429 限流
  await delay(1000);

  // === 普通对话 ===
  if (!tripInfo || !tripInfo.destination) {
    console.log('[CloudAI] 普通对话');
    return {
      id: 'llm_' + Date.now(),
      role: 'assistant',
      content: (step1Content || '明白了，请继续描述您的需求。').replace(/\[(?:TRIP_EXTRACT|SEARCH):[^\]]+\]/g, '').trim(),
      timestamp: new Date().toISOString()
    };
  }

  // === 追问缺失信息 ===
  const missing: string[] = [];
  if (!tripInfo.days || tripInfo.days < 1) missing.push('计划玩几天');
  if (!tripInfo.origin) missing.push('从哪个城市出发');
  if (missing.length > 0) {
    console.log(`[CloudAI] 缺${missing.join('、')}，追问`);
    const travelerNote = tripInfo.travelers ? `，${tripInfo.travelers}人同行` : '';
    return {
      id: 'a_' + Date.now(),
      role: 'assistant',
      content: `好的！请问您${missing.join('？')}呢？${travelerNote}`,
      timestamp: new Date().toISOString()
    };
  }

  // === Step 2：生成行程（streamText） ===
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
  ], { maxTokens: 4096, temperature: 0.3, stream: true, onChunk: onStream });

  console.log(`[CloudAI] Step2 LLM 返回: ${step2Content ? (step2Content as string).length + ' 字符' : 'NULL'}`);

  const tripPlan = step2Content
    ? buildTripPlan(tripInfo, step2Content as string)
    : buildFallbackTripPlan(tripInfo);

  console.log(`[CloudAI] tripPlan: ${tripPlan.itinerary.length} 天, Day1 ${tripPlan.itinerary[0]?.activities?.length || 0} 个活动`);

  return {
    id: 'trip_' + Date.now(),
    role: 'assistant',
    content: `为您规划了${tripPlan.title}，点击每个活动查看推荐`,
    tripPlan,
    timestamp: new Date().toISOString()
  };
};

// ============================================
// 热门目的地（无缓存版，每次调 LLM）
// ============================================

export const generateHotDestinations = async (): Promise<Destination[] | null> => {
  const month = new Date().getMonth() + 1;
  const seasonMap: Record<number, string> = { 12: '冬季', 1: '冬季', 2: '冬季', 3: '春季', 4: '春季', 5: '春季', 6: '夏季', 7: '夏季', 8: '夏季', 9: '秋季', 10: '秋季', 11: '秋季' };
  const season = seasonMap[month] || '';

  const prompt = [
    { role: 'system', content: `你是国内旅行专家。当前${month}月（${season}），请推荐6个当季最适合旅游的国内目的地。只输出JSON数组，不要其他内容。` },
    { role: 'user', content: `输出格式：
[{"name":"城市名","province":"省份","description":"一句话推荐理由（15字内）","tags":["标签1","标签2","标签3"],"bestSeason":"最佳季节","budget":"低/中/高"}]` }
  ];

  try {
    const content = await callLLM(prompt, { maxTokens: 800, temperature: 0.7, skipReasoningFallback: true, stream: true });
    if (!content || typeof content !== 'string') throw new Error('empty');

    let jsonStr = content;
    const codeMatch = content.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/);
    if (codeMatch) jsonStr = codeMatch[1];
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('no json array');
    const list = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(list) || list.length === 0) throw new Error('empty array');

    const destinations = list.map((d: any, i: number) => {
      const budget = d.budget || '中等';
      let rating: number;
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
    destinations.sort((a: Destination, b: Destination) => (b.rating || 0) - (a.rating || 0));
    console.log(`[CloudAI] 生成 ${destinations.length} 个热门目的地`);
    return destinations;
  } catch (err: any) {
    console.error('[CloudAI] 热门目的地生成失败:', err.message);
    return null;
  }
};
