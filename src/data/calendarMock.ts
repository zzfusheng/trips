import { CalendarEvent } from '@/types/trip';

export const sampleEvents: CalendarEvent[] = [
  {
    id: 'e1',
    title: '抵达大理古城',
    date: '2026-07-15',
    time: '14:00',
    location: '大理古城',
    description: '入住古城民宿，稍作休息',
    reminder: true,
    reminderTime: 30,
    tripId: 'trip_001',
    type: 'hotel'
  },
  {
    id: 'e2',
    title: '古城漫步',
    date: '2026-07-15',
    time: '16:00',
    location: '大理古城',
    description: '漫步人民路、洋人街，感受古城韵味',
    reminder: false,
    reminderTime: 0,
    tripId: 'trip_001',
    type: 'sightseeing'
  },
  {
    id: 'e3',
    title: '特色晚餐',
    date: '2026-07-15',
    time: '19:00',
    location: '古城内',
    description: '品尝大理酸辣鱼、乳扇等特色美食',
    reminder: true,
    reminderTime: 15,
    tripId: 'trip_001',
    type: 'food'
  },
  {
    id: 'e4',
    title: '环洱海骑行出发',
    date: '2026-07-16',
    time: '09:00',
    location: '古城租车点',
    description: '租电动车或自行车环洱海',
    reminder: true,
    reminderTime: 60,
    tripId: 'trip_001',
    type: 'transport'
  },
  {
    id: 'e5',
    title: '喜洲古镇游览',
    date: '2026-07-16',
    time: '10:30',
    location: '喜洲古镇',
    description: '游览白族民居，品尝喜洲粑粑',
    reminder: false,
    reminderTime: 0,
    tripId: 'trip_001',
    type: 'sightseeing'
  },
  {
    id: 'e6',
    title: '双廊古镇日落',
    date: '2026-07-16',
    time: '17:30',
    location: '双廊古镇',
    description: '欣赏洱海最美日落',
    reminder: true,
    reminderTime: 30,
    tripId: 'trip_001',
    type: 'sightseeing'
  },
  {
    id: 'e7',
    title: '苍山索道上山',
    date: '2026-07-17',
    time: '09:00',
    location: '苍山景区',
    description: '乘坐索道上苍山，俯瞰洱海全景',
    reminder: true,
    reminderTime: 60,
    tripId: 'trip_001',
    type: 'sightseeing'
  },
  {
    id: 'e8',
    title: '白族三道茶体验',
    date: '2026-07-17',
    time: '12:00',
    location: '苍山脚下',
    description: '品尝白族三道茶',
    reminder: false,
    reminderTime: 0,
    tripId: 'trip_001',
    type: 'food'
  }
];
