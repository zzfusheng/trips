import { ChatMessage } from '@/types/trip';

export const quickQuestions = [
  '推荐一个适合周末出行的地方',
  '帮我规划一次3天的大理之旅',
  '夏天适合去哪里旅行？',
  '有什么适合亲子游的目的地？',
  '预算2000元能去哪里玩？'
];

export const initialMessages: ChatMessage[] = [
  {
    id: 'msg_0',
    role: 'assistant',
    content: '你好！我是你的旅行规划助手 🌍\n\n我可以帮你：\n- 推荐适合的目的地\n- 规划详细的旅行行程\n- 提供旅行建议和攻略\n\n你想去哪里旅行呢？或者告诉我你的需求，我来帮你规划！',
    timestamp: new Date().toISOString()
  }
];
