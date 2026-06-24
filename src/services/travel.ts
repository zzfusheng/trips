import Taro from '@tarojs/taro';
import { ChatMessage, TripPlan, SearchItem, CalendarEvent, Destination } from '@/types/trip';
import { sampleTripPlan } from '@/data/destinations';
import { initialMessages } from '@/data/chatMock';
import { resolveDestImage } from '@/utils/destImage';

// ============================================
// 服务层配置
// ============================================

// 后端服务地址
const API_BASE_URL = 'https://www.zzfusheng.top/api';

// 是否使用 mock 数据（后端已部署后改为 false）
const USE_MOCK = false;

// ============================================
// 通用请求封装
// ============================================

const request = async <T>(endpoint: string, data: Record<string, unknown>): Promise<T> => {
  console.log(`[TravelService] 请求 ${endpoint}:`, data);
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}${endpoint}`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data,
      timeout: 120000
    });
    if (res.statusCode === 200) {
      console.log(`[TravelService] ${endpoint} 成功`);
      return res.data as T;
    }
    console.error(`[TravelService] ${endpoint} 失败, status:`, res.statusCode);
    throw new Error(`HTTP ${res.statusCode}`);
  } catch (err) {
    console.error(`[TravelService] ${endpoint} 异常:`, err);
    throw err;
  }
};

// ============================================
// AI 对话接口
// ============================================

interface AiChatRequest {
  query: string;
  history?: { role: string; content: string }[];
  context?: {
    reselectAct?: {
      tripId: string;
      dayIdx: number;
      actIdx: number;
      originalTitle: string;
      destination?: string;
      actType?: string;
    };
    currentTripPlan?: any; // 修改行程时传入当前行程
  };
}

interface AiChatResponse {
  id: string;
  role: 'assistant';
  content: string;
  tripPlan?: TripPlan;
  searchItems?: SearchItem[];
  context?: AiChatRequest['context'];
  timestamp: string;
}

/**
 * AI 对话 - Express 后端（无超时限制）
 */
export const aiChat = async (query: string, history: ChatMessage[], context?: AiChatRequest['context']): Promise<ChatMessage> => {
  if (!USE_MOCK) {
    try {
      return await request<AiChatResponse>('/ai/chat', { query, history, context });
    } catch (err) {
      console.error('[TravelService] AI 对话失败，降级为本地 mock:', err);
    }
  }

  // 本地 mock 降级
  return mockAiChat(query);
};

// ============================================
// FlyAI 类服务接口（后续对接 flyai 后端）
// ============================================

interface FlightSearchParams {
  origin: string;
  destination?: string;
  depDate?: string;
  backDate?: string;
  journeyType?: number;
  seatClassName?: string;
  maxPrice?: number;
  sortType?: number;
}

interface HotelSearchParams {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  maxPrice?: number;
  keyword?: string;
}

interface PoiSearchParams {
  destination: string;
  keyword?: string;
}

/**
 * 单活动 FlyAI 搜索（点击详情页时懒加载）
 */
export const searchActivity = async (params: {
  destination: string;
  title: string;
  type: string;
  origin?: string;
  startDate?: string;
}): Promise<{ success: boolean; items: SearchItem[]; message?: string }> => {
  console.log('[TravelService] 单活动搜索:', params);
  try {
    return await request<{ success: boolean; items: SearchItem[]; message?: string }>('/ai/activity-search', params as unknown as Record<string, unknown>);
  } catch (err) {
    console.error('[TravelService] 单活动搜索失败:', err);
    return { success: false, items: [], message: '网络异常' };
  }
};

/**
 * 换一个推荐：重新搜索同类型 FlyAI 商品（排除已展示标题）
 */
export const refreshRecommend = async (params: {
  destination: string;
  title: string;
  type: string;
  excludeTitles: string[];
  reason?: string;
}): Promise<{ success: boolean; items: SearchItem[]; message?: string }> => {
  console.log('[TravelService] 换一个推荐:', params);
  try {
    return await request<{ success: boolean; items: SearchItem[]; message?: string }>('/ai/recommend', params as unknown as Record<string, unknown>);
  } catch (err) {
    console.error('[TravelService] 刷新推荐失败:', err);
    return { success: false, items: [], message: '网络异常，请稍后再试' };
  }
};

/**
 * 获取当季热门目的地（本地缓存秒开 + 后台 CloudBase AI 刷新）
 * @param onUpdate 后台拉取到新数据后的回调，用于更新 UI
 */
export const fetchHotDestinations = async (onUpdate?: (list: Destination[]) => void): Promise<Destination[]> => {
  // 1. 先查本地缓存，秒开
  try {
    const cached = Taro.getStorageSync('hot_destinations_cache');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      console.log('[TravelService] 本地缓存命中:', cached.length, '个');
      // 确保缓存中的图片也走本地
      const patched = cached.map((d: Destination) => ({ ...d, image: resolveDestImage(d.name) }));
      // 后台静默刷新
      refreshHotInBackground(onUpdate);
      return patched;
    }
  } catch (e) { /* ignore */ }

  // 2. 无缓存，同步调 Express API
  const fresh = await fetchHotFromAPI();
  if (fresh.length > 0) return fresh;

  return [];
};

/** 后台静默刷新热门目的地 */
const refreshHotInBackground = (onUpdate?: (list: Destination[]) => void) => {
  fetchHotFromAPI().then(list => {
    if (list.length > 0 && onUpdate) onUpdate(list);
  }).catch(() => {});
};

/** 从 Express API 获取热门目的地 */
const fetchHotFromAPI = async (): Promise<Destination[]> => {
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/ai/hot-destinations`,
      method: 'GET',
      timeout: 30000
    });
    if (res.statusCode === 200 && res.data?.destinations?.length > 0) {
      console.log('[TravelService] 热门目的地:', res.data.destinations.length, '个');
      // 替换为本地图片
      const patched = res.data.destinations.map((d: Destination) => ({ ...d, image: resolveDestImage(d.name) }));
      Taro.setStorageSync('hot_destinations_cache', patched);
      return patched;
    }
  } catch (err) {
    console.error('[TravelService] 获取热门目的地失败:', err);
  }
  return [];
};

/**
 * 搜索机票 - 对接后端 flyai search-flight
 */
export const searchFlights = async (params: FlightSearchParams) => {
  console.log('[TravelService] 搜索机票:', params);
  if (USE_MOCK) {
    return mockFlightSearch(params);
  }
  try {
    return await request('/travel/search-flight', params as unknown as Record<string, unknown>);
  } catch (err) {
    console.error('[TravelService] 机票搜索失败:', err);
    return mockFlightSearch(params);
  }
};

/**
 * 搜索酒店 - 对接后端 flyai search-hotel
 */
export const searchHotels = async (params: HotelSearchParams) => {
  console.log('[TravelService] 搜索酒店:', params);
  if (USE_MOCK) {
    return mockHotelSearch(params);
  }
  try {
    return await request('/travel/search-hotel', params as unknown as Record<string, unknown>);
  } catch (err) {
    console.error('[TravelService] 酒店搜索失败:', err);
    return mockHotelSearch(params);
  }
};

/**
 * 搜索景点 - 对接后端 flyai search-poi
 */
export const searchPoi = async (params: PoiSearchParams) => {
  console.log('[TravelService] 搜索景点:', params);
  if (USE_MOCK) {
    return mockPoiSearch(params);
  }
  try {
    return await request('/travel/search-poi', params as unknown as Record<string, unknown>);
  } catch (err) {
    console.error('[TravelService] 景点搜索失败:', err);
    return mockPoiSearch(params);
  }
};

// ============================================
// 行程采纳：将 TripPlan 转为 CalendarEvent 并存储
// ============================================

export const adoptTripToCalendar = async (plan: TripPlan): Promise<void> => {
  console.log('[TravelService] 采纳行程到日历:', plan.id);

  const events: CalendarEvent[] = [];
  plan.itinerary.forEach(day => {
    day.activities.forEach(act => {
      events.push({
        id: 'cal_' + act.id,
        title: act.title,
        date: day.date,
        time: act.time,
        location: act.location || '',
        description: act.description,
        reminder: true,
        reminderTime: 5,
        tripId: plan.id,
        type: act.type
      });
    });
  });

  // 保存到日历事件
  try {
    const res = await Taro.getStorage({ key: 'calendar_events' });
    const existingEvents: CalendarEvent[] = JSON.parse(res.data as string);
    const merged = [...existingEvents, ...events];
    await Taro.setStorage({ key: 'calendar_events', data: JSON.stringify(merged) });
    console.log('[TravelService] 日历事件已合并，总数:', merged.length);
  } catch {
    await Taro.setStorage({ key: 'calendar_events', data: JSON.stringify(events) });
    console.log('[TravelService] 日历事件已新建，总数:', events.length);
  }

  // 同时保存行程到 my_trips
  try {
    const res = await Taro.getStorage({ key: 'my_trips' });
    const existingTrips: TripPlan[] = JSON.parse(res.data as string);
    const exists = existingTrips.find(t => t.id === plan.id);
    if (!exists) {
      existingTrips.push({ ...plan, status: 'active' });
      await Taro.setStorage({ key: 'my_trips', data: JSON.stringify(existingTrips) });
      console.log('[TravelService] 行程已保存到 my_trips');
    }
  } catch {
    await Taro.setStorage({ key: 'my_trips', data: JSON.stringify([{ ...plan, status: 'active' }]) });
    console.log('[TravelService] my_trips 已新建');
  }
};

// ============================================
// Mock 降级函数
// ============================================

const mockAiChat = (query: string): ChatMessage => {
  const lower = query.toLowerCase();

  if (lower.includes('大理')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '好的！我为你规划了一次**大理三日慢生活之旅** 🏔️\n\nDAY1：抵达大理 → 古城漫步 → 特色晚餐\nDAY2：环洱海骑行 → 喜洲古镇 → 双廊日落\nDAY3：苍山索道 → 白族三道茶 → 返程\n\n下面是详细行程，你可以采纳到日历中哦~',
      tripPlan: sampleTripPlan,
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('周末') || lower.includes('短途')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '周末短途旅行的话，我推荐这几个地方：\n\n1. **杭州** - 西湖漫步，龙井品茶，高铁1小时可达\n2. **苏州** - 园林之美，古运河夜游，悠闲自在\n3. **莫干山** - 竹林氧吧，民宿体验，亲近自然\n4. **安吉** - 大竹海，云上草原，清凉避暑\n\n你更倾向于哪个？告诉我，我给你做详细规划！',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('夏天') || lower.includes('避暑')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '夏天避暑旅行，推荐这些清凉目的地：\n\n🏔️ **丽江** - 高原古城，平均气温20°C\n🏖️ **青岛** - 海风吹拂，啤酒+海鲜\n🌲 **长白山** - 天池美景，天然空调\n🌊 **北戴河** - 离北京最近的海滨\n\n你计划玩几天呢？我可以帮你详细规划！',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('亲子') || lower.includes('孩子') || lower.includes('小朋友')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '亲子游推荐这些好去处：\n\n🐼 **成都** - 看大熊猫，吃美食，孩子超爱\n🏰 **上海迪士尼** - 童话世界，全家欢乐\n🐠 **珠海长隆** - 海洋王国，企鹅酒店\n🏖️ **三亚** - 阳光沙滩，亲子酒店度假\n\n需要我帮你规划具体的行程吗？',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('2000') || lower.includes('预算')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '预算2000元可以去这些性价比高的地方：\n\n💰 **重庆** - 2-3天，火锅+夜景+磁器口，花费约1500元\n💰 **成都** - 3天，熊猫+美食+宽窄巷子，花费约1800元\n💰 **厦门** - 2-3天，鼓浪屿+环岛路，花费约2000元\n💰 **西安** - 3天，兵马俑+回民街+城墙，花费约1600元\n\n选一个我帮你做详细计划！',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('机票') || lower.includes('飞机') || lower.includes('航班')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '我可以帮你搜索机票！✈️\n\n请告诉我：\n- 出发城市和目的地\n- 出发日期和返程日期\n- 是否有直飞偏好\n\n例如："帮我搜北京到大理7月15日的机票"\n\n后续接入 flyai 实时数据后，我将为你展示真实的航班信息和价格！',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('酒店') || lower.includes('住宿') || lower.includes('住')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '我可以帮你搜索酒店！🏨\n\n请告诉我：\n- 目的地城市\n- 入住和退房日期\n- 预算范围\n- 有什么特别需求（如近景区、含早餐等）\n\n例如："帮我找大理古城附近7月15日入住的酒店"\n\n后续接入 flyai 实时数据后，我将为你展示真实的酒店信息和价格！',
      timestamp: new Date().toISOString()
    };
  }

  return {
    id: 'msg_' + Date.now(),
    role: 'assistant',
    content: '收到你的需求！\n\n告诉我你想去的目的地、出行时间和偏好，我来为你量身定制旅行计划～',
    timestamp: new Date().toISOString()
  };
};

const mockFlightSearch = (params: FlightSearchParams) => ({
  data: {
    itemList: [
      {
        adultPrice: '¥680.0',
        journeys: [{
          journeyType: '直达',
          segments: [{
            depCityName: params.origin || '北京',
            depDateTime: '2026-07-15 08:00:00',
            arrCityName: params.destination || '大理',
            arrDateTime: '2026-07-15 11:30:00',
            duration: '210分钟',
            marketingTransportName: '国航',
            marketingTransportNo: 'CA1234',
            seatClassName: '经济舱'
          }],
          totalDuration: '210分钟'
        }],
        jumpUrl: ''
      }
    ]
  },
  message: 'success (mock)',
  systemMessage: '当前为模拟数据，接入 flyai 后可获取实时价格',
  status: 0
});

const mockHotelSearch = (params: HotelSearchParams) => ({
  data: {
    itemList: [
      {
        hotelName: `${params.destination || '目的地'}精品酒店`,
        mainPic: '',
        price: 388,
        rating: 4.6,
        address: params.destination || '',
        detailUrl: ''
      }
    ]
  },
  message: 'success (mock)',
  systemMessage: '当前为模拟数据，接入 flyai 后可获取实时价格',
  status: 0
});

const mockPoiSearch = (params: PoiSearchParams) => ({
  data: {
    itemList: [
      {
        name: `${params.destination || '目的地'}必游景点`,
        picUrl: '',
        rating: 4.7,
        price: '¥88起',
        address: params.destination || '',
        jumpUrl: ''
      }
    ]
  },
  message: 'success (mock)',
  systemMessage: '当前为模拟数据，接入 flyai 后可获取实时信息',
  status: 0
});
