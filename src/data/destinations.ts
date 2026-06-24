import { Destination, TripPlan } from '@/types/trip';
import destDali from '@/static/dest-dali.jpg';
import destSanya from '@/static/dest-sanya.jpg';
import destChengdu from '@/static/dest-chengdu.jpg';
import destXiamen from '@/static/dest-xiamen.jpg';
import destXian from '@/static/dest-xian.jpg';
import destHangzhou from '@/static/dest-hangzhou.jpg';
import destChongqing from '@/static/dest-chongqing.jpg';
import destLijiang from '@/static/dest-lijiang.jpg';
import placeholderDest from '@/static/placeholder-dest.jpg';

const destImages: Record<string, string> = {
  '1': destDali,
  '2': destSanya,
  '3': destChengdu,
  '4': destXiamen,
  '5': destXian,
  '6': destHangzhou,
  '7': destChongqing,
  '8': destLijiang,
  '9': placeholderDest, // 桂林
  '10': placeholderDest, // 青岛
};

export const destinations: Destination[] = [
  {
    id: '1',
    name: '大理',
    country: '中国·云南',
    image: destImages['1'],
    description: '苍山洱海，风花雪月，感受云南慢生活',
    rating: 4.8,
    tags: ['自然风光', '古城', '摄影'],
    bestSeason: '3-5月, 9-11月',
    budget: '中等'
  },
  {
    id: '2',
    name: '三亚',
    country: '中国·海南',
    image: destImages['2'],
    description: '阳光沙滩，热带天堂，尽享海岛度假',
    rating: 4.7,
    tags: ['海滩', '度假', '潜水'],
    bestSeason: '10-4月',
    budget: '较高'
  },
  {
    id: '3',
    name: '成都',
    country: '中国·四川',
    image: destImages['3'],
    description: '美食之都，熊猫故乡，巴适得板',
    rating: 4.9,
    tags: ['美食', '熊猫', '文化'],
    bestSeason: '3-6月, 9-11月',
    budget: '中等'
  },
  {
    id: '4',
    name: '厦门',
    country: '中国·福建',
    image: destImages['4'],
    description: '鼓浪屿漫步，环岛路骑行，文艺又浪漫',
    rating: 4.6,
    tags: ['海岛', '文艺', '美食'],
    bestSeason: '3-5月, 10-11月',
    budget: '中等'
  },
  {
    id: '5',
    name: '西安',
    country: '中国·陕西',
    image: destImages['5'],
    description: '十三朝古都，兵马俑震撼，美食遍地',
    rating: 4.7,
    tags: ['历史', '美食', '文化'],
    bestSeason: '3-5月, 9-10月',
    budget: '中等'
  },
  {
    id: '6',
    name: '杭州',
    country: '中国·浙江',
    image: destImages['6'],
    description: '上有天堂下有苏杭，西湖美景如画',
    rating: 4.8,
    tags: ['自然风光', '文化', '休闲'],
    bestSeason: '3-5月, 9-10月',
    budget: '中等'
  },
  {
    id: '7',
    name: '重庆',
    country: '中国·重庆',
    image: destImages['7'],
    description: '8D魔幻城市，火锅天堂，夜景无敌',
    rating: 4.6,
    tags: ['美食', '夜景', '城市'],
    bestSeason: '3-5月, 9-10月',
    budget: '较低'
  },
  {
    id: '8',
    name: '丽江',
    country: '中国·云南',
    image: destImages['8'],
    description: '古城韵味，雪山壮丽，纳西文化体验',
    rating: 4.5,
    tags: ['古城', '雪山', '文化'],
    bestSeason: '4-5月, 9-10月',
    budget: '中等'
  },
  {
    id: '9',
    name: '桂林',
    country: '中国·广西',
    image: placeholderDest,
    description: '桂林山水甲天下，漓江风光美如画',
    rating: 4.7,
    tags: ['自然风光', '山水', '摄影'],
    bestSeason: '4-10月',
    budget: '中等'
  },
  {
    id: '10',
    name: '青岛',
    country: '中国·山东',
    image: placeholderDest,
    description: '红瓦绿树碧海蓝天，啤酒海鲜尽情享',
    rating: 4.5,
    tags: ['海滩', '美食', '城市'],
    bestSeason: '5-10月',
    budget: '中等'
  }
];

export const sampleTripPlan: TripPlan = {
  id: 'trip_001',
  title: '大理三日慢生活之旅',
  destination: '大理',
  startDate: '2026-07-15',
  endDate: '2026-07-17',
  days: 3,
  description: '苍山洱海间，体验大理的风花雪月与慢生活',
  image: placeholderDest,
  tags: ['自然风光', '古城', '休闲'],
  status: 'active',
  itinerary: [
    {
      day: 1,
      date: '2026-07-15',
      title: '抵达大理，古城漫步',
      activities: [
        {
          id: 'a1',
          time: '14:00',
          title: '抵达大理古城',
          description: '入住古城民宿，稍作休息',
          location: '大理古城',
          type: 'hotel',
          icon: '🏨'
        },
        {
          id: 'a2',
          time: '16:00',
          title: '古城漫步',
          description: '漫步人民路、洋人街，感受古城韵味',
          location: '大理古城',
          type: 'sightseeing',
          icon: '🚶'
        },
        {
          id: 'a3',
          time: '19:00',
          title: '特色晚餐',
          description: '品尝大理酸辣鱼、乳扇等特色美食',
          location: '古城内',
          type: 'food',
          icon: '🍽️'
        }
      ]
    },
    {
      day: 2,
      date: '2026-07-16',
      title: '环洱海骑行',
      activities: [
        {
          id: 'a4',
          time: '09:00',
          title: '租车出发',
          description: '租电动车或自行车环洱海',
          location: '古城租车点',
          type: 'transport',
          icon: '🛵'
        },
        {
          id: 'a5',
          time: '10:30',
          title: '喜洲古镇',
          description: '游览白族民居，品尝喜洲粑粑',
          location: '喜洲古镇',
          type: 'sightseeing',
          icon: '🏘️'
        },
        {
          id: 'a6',
          time: '14:00',
          title: '双廊古镇',
          description: '欣赏洱海最美日落',
          location: '双廊古镇',
          type: 'sightseeing',
          icon: '🌅'
        }
      ]
    },
    {
      day: 3,
      date: '2026-07-17',
      title: '苍山之行，返程',
      activities: [
        {
          id: 'a7',
          time: '09:00',
          title: '苍山索道',
          description: '乘坐索道上苍山，俯瞰洱海全景',
          location: '苍山景区',
          type: 'sightseeing',
          icon: '🏔️'
        },
        {
          id: 'a8',
          time: '12:00',
          title: '午餐',
          description: '品尝白族三道茶',
          location: '苍山脚下',
          type: 'food',
          icon: '🍵'
        },
        {
          id: 'a9',
          time: '15:00',
          title: '返程',
          description: '结束美好的大理之旅',
          location: '大理站',
          type: 'transport',
          icon: '🚄'
        }
      ]
    }
  ],
  createdAt: '2026-06-15'
};
