import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Input } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import styles from './index.module.scss';
import ChatBubble from '@/components/ChatBubble';
import { ChatMessage } from '@/types/trip';
import { initialMessages } from '@/data/chatMock';
import { fetchChatHistory, saveChatHistory } from '@/services/cloud';

const STORAGE_KEY = 'chat_history';

const ChatPage: React.FC = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [scrollIntoView, setScrollIntoView] = useState('');
  const pendingReselect = useRef<any>(null);
  const paramsApplied = useRef(false);
  const autoSend = useRef<string | null>(null);
  const openidRef = useRef('');

  const scrollToBottom = useCallback(() => {
    setScrollIntoView(prev => prev === 'a1' ? 'a2' : 'a1');
  }, []);

  // 进入页面时加载缓存 + 滚到底部 + 处理重搜
  useDidShow(() => {
    // 获取 openid 后加载聊天历史
    Taro.cloud.callFunction({ name: 'getOpenid' }).then((res: any) => {
      openidRef.current = res?.result?.openid || '';
      return fetchChatHistory(openidRef.current);
    }).then(history => {
      let baseMessages: ChatMessage[] = [];
      if (history.length > 0) {
        baseMessages = history as ChatMessage[];
      } else {
        // 云数据库无数据 → 尝试 storage → 默认
        const cached = Taro.getStorageSync(STORAGE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              baseMessages = parsed;
            }
          } catch (e) {}
        }
        if (baseMessages.length === 0) {
          baseMessages = initialMessages;
        }
      }

      // 防止 useDidShow 重复触发 url 参数逻辑
      if (!paramsApplied.current) {
        paramsApplied.current = true;

        const reselectParam = router.params?.reselectAct;
        if (reselectParam) {
          try {
            const reselectAct = JSON.parse(decodeURIComponent(reselectParam));
            if (reselectAct.originalTitle) {
              pendingReselect.current = reselectAct;
              setInputValue(`请帮我重新搜索「${reselectAct.originalTitle}」的替代方案`);
            }
          } catch (e) {
            console.error('[ChatPage] 解析 reselectAct 失败:', e);
          }
        }

        const questionParam = router.params?.question;
        if (questionParam) {
          autoSend.current = decodeURIComponent(questionParam);
        }
      }

      setMessages(baseMessages);
      setTimeout(() => scrollToBottom(), 500);
    });
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 快速提问自动发送（消息加载完成后触发）
  useEffect(() => {
    if (autoSend.current && messages.length > 0 && !loading) {
      const text = autoSend.current;
      autoSend.current = null;
      setInputValue(text);
      // 延迟执行发送，确保 state 已更新
      setTimeout(() => {
        const userMsg: ChatMessage = {
          id: 'u_' + Date.now(),
          role: 'user',
          content: text,
          timestamp: new Date().toISOString()
        };
        const temp = [...messages, userMsg];
        saveMessages(temp);
        setInputValue('');
        setLoading(true);

        import('@/services/travel').then(async ({ aiChat }) => {
          const res = await aiChat(text, messages);
          saveMessages([...temp, res]);
          setLoading(false);
        }).catch(() => {
          saveMessages([...temp, {
            id: 'a_' + Date.now(),
            role: 'assistant',
            content: '抱歉，服务暂时不可用，请稍后重试。',
            timestamp: new Date().toISOString()
          }]);
          setLoading(false);
        });
      }, 100);
    }
  }, [messages, loading]);

  const MAX_MESSAGES = 150;

const saveMessages = (msgs: ChatMessage[]) => {
    // 保留最近 150 条，避免无限增长
    const trimmed = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
    setMessages(trimmed);
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify(trimmed));
    // 同步到云数据库
    if (openidRef.current) saveChatHistory(openidRef.current, trimmed);
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    const temp = [...messages, userMsg];
    saveMessages(temp);
    setInputValue('');
    setLoading(true);

    // 检查是否有待处理的 reselect 上下文（来自行程详情替换按钮）
    const ctx = pendingReselect.current;
    pendingReselect.current = null;

    // 提取最近的行程计划（用于 LLM 修改行程）
    const lastTripPlan = [...messages].reverse().find(m => m.tripPlan)?.tripPlan;

    try {
      const { aiChat } = await import('@/services/travel');
      const res = await aiChat(text, messages, {
        ...(ctx ? { reselectAct: ctx } : {}),
        ...(lastTripPlan ? { currentTripPlan: lastTripPlan } : {})
      });
      saveMessages([...temp, res]);
    } catch {
      saveMessages([...temp, {
        id: 'a_' + Date.now(),
        role: 'assistant',
        content: '抱歉，服务暂时不可用，请稍后重试。',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.page}>
      <ScrollView scrollY enhanced className={styles.messages} scrollWithAnimation scrollIntoView={scrollIntoView}>
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {loading && (
          <View style={{ padding: '24rpx 32rpx' }}>
            <Text style={{ color: '#9B9B9B', fontSize: '24rpx' }}>等风来......</Text>
          </View>
        )}
        <View id="a1" style={{ height: '2rpx' }} />
        <View id="a2" style={{ height: '2rpx' }} />
      </ScrollView>
      <View className={styles.inputBar}>
        <View className={styles.inputWrapper}>
          <Input
            className={styles.input}
            placeholder="输入你的旅行需求..."
            value={inputValue}
            onInput={(e) => setInputValue(e.detail.value)}
            onConfirm={handleSend}
            confirmType="send"
          />
        </View>
        <View className={styles.sendBtn} onClick={handleSend}>
          <Text className={styles.sendText}>↑</Text>
        </View>
      </View>
    </View>
  );
};

export default ChatPage;
