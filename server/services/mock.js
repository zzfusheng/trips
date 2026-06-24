/**
 * Chat Mock - 当 flyai 不可用时的降级回复
 */

const sampleTripPlan = {
  id: 'trip_001',
  title: '大理三日慢生活之旅',
  destination: '大理',
  startDate: '2026-07-15',
  endDate: '2026-07-17',
  days: 3,
  description: '苍山洱海间，体验大理的风花雪月与慢生活',
  image: 'https://picsum.photos/id/1015/750/400',
  tags: ['自然风光', '古城', '休闲'],
  status: 'active',
  itinerary: [
    {
      day: 1, date: '2026-07-15', title: '抵达大理，古城漫步',
      activities: [
        { id: 'a1', time: '14:00', title: '抵达大理古城', description: '入住古城民宿，稍作休息', location: '大理古城', type: 'hotel', icon: '🏨' },
        { id: 'a2', time: '16:00', title: '古城漫步', description: '漫步人民路、洋人街', location: '大理古城', type: 'sightseeing', icon: '🚶' },
        { id: 'a3', time: '19:00', title: '特色晚餐', description: '品尝大理酸辣鱼、乳扇', location: '古城内', type: 'food', icon: '🍽️' }
      ]
    },
    {
      day: 2, date: '2026-07-16', title: '环洱海骑行',
      activities: [
        { id: 'a4', time: '09:00', title: '租车出发', description: '租电动车环洱海', location: '古城租车点', type: 'transport', icon: '🛵' },
        { id: 'a5', time: '10:30', title: '喜洲古镇', description: '游览白族民居', location: '喜洲古镇', type: 'sightseeing', icon: '🏘️' },
        { id: 'a6', time: '14:00', title: '双廊古镇', description: '欣赏洱海最美日落', location: '双廊古镇', type: 'sightseeing', icon: '🌅' }
      ]
    },
    {
      day: 3, date: '2026-07-17', title: '苍山之行，返程',
      activities: [
        { id: 'a7', time: '09:00', title: '苍山索道', description: '俯瞰洱海全景', location: '苍山景区', type: 'sightseeing', icon: '🏔️' },
        { id: 'a8', time: '12:00', title: '午餐', description: '品尝白族三道茶', location: '苍山脚下', type: 'food', icon: '🍵' },
        { id: 'a9', time: '15:00', title: '返程', description: '结束美好的大理之旅', location: '大理站', type: 'transport', icon: '🚄' }
      ]
    }
  ],
  createdAt: '2026-06-15'
};

const chatResponse = (query) => {
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
      content: '周末短途旅行推荐：\n\n1. **杭州** - 西湖漫步，龙井品茶\n2. **苏州** - 园林之美，古运河夜游\n3. **莫干山** - 竹林氧吧，民宿体验\n4. **安吉** - 大竹海，云上草原\n\n你更倾向于哪个？',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('夏天') || lower.includes('避暑')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '夏天避暑推荐：\n\n🏔️ **丽江** - 高原古城，20°C\n🏖️ **青岛** - 海风+啤酒\n🌲 **长白山** - 天池美景\n🌊 **北戴河** - 离北京最近\n\n你计划玩几天？',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('亲子') || lower.includes('孩子')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '亲子游推荐：\n\n🐼 **成都** - 大熊猫+美食\n🏰 **上海迪士尼** - 童话世界\n🐠 **珠海长隆** - 海洋王国\n🏖️ **三亚** - 亲子度假\n\n需要帮你规划吗？',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('2000') || lower.includes('预算')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '预算2000元推荐：\n\n💰 **重庆** - 2-3天，约1500元\n💰 **成都** - 3天，约1800元\n💰 **厦门** - 2-3天，约2000元\n💰 **西安** - 3天，约1600元\n\n选一个我帮你规划！',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('机票') || lower.includes('航班')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '我可以帮你搜机票 ✈️\n\n请告诉我出发城市、目的地和日期。\n\n例如："帮我搜北京到大理7月15日的机票"\n\n接入 flyai 后将展示实时航班和价格！',
      timestamp: new Date().toISOString()
    };
  }

  if (lower.includes('酒店') || lower.includes('住宿')) {
    return {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: '我可以帮你搜酒店 🏨\n\n请告诉我目的地、入住日期和预算。\n\n例如："帮我找大理古城7月15日入住的酒店"\n\n接入 flyai 后将展示真实酒店和价格！',
      timestamp: new Date().toISOString()
    };
  }

  return {
    id: 'msg_' + Date.now(),
    role: 'assistant',
    content: '收到你的需求！你可以试试问我：\n- "推荐周末去处"\n- "规划大理3日游"\n- "夏天去哪避暑"\n- "2000元预算去哪玩"\n- "搜机票"\n- "找酒店"\n\n告诉我你的需求，我来帮你！',
    timestamp: new Date().toISOString()
  };
};

module.exports = { chatResponse, sampleTripPlan };
