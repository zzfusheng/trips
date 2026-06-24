import React from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import { ChatMessage, SearchItem, TripPlan } from '@/types/trip';
import { handleLinkClick } from '@/utils/linkHandler';
import { formatDateCN } from '@/utils/format';
import { saveTrip, fetchTrip } from '@/services/cloud';
import DestImage from '@/components/DestImage';

const getUserAvatar = (): string => {
  try { return Taro.getStorageSync('avatar_local') || Taro.getStorageSync('mine_avatar') || ''; } catch { return ''; }
};

interface ChatBubbleProps {
  message: ChatMessage;
}

const urlRegex = /(https?:\/\/[^\s*~\u4e00-\u9fff，。！？、；：""''（）【】《》]+)/g;

const cleanUrl = (url: string) => (url || '').replace(/[`]/g, '').replace(/[*_~)]+$/g, '').trim();

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (dateStr: string, n: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

const renderTextWithLinks = (text: string) => {
  const cleanedText = text.replace(/[`]/g, '');
  const parts = cleanedText.split(urlRegex);
  const urls: string[] = cleanedText.match(urlRegex) || [];

  return parts.map((part, i) => {
    if (urls.includes(part)) {
      const url = cleanUrl(part);
      return (
        <Text
          key={i}
          className={styles.linkText}
          onClick={() => handleLinkClick(url)}
        >
          🔗 查看详情
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
};

const saveToMyTrips = async (trip: TripPlan): Promise<TripPlan> => {
  // 剥离 flyaiResults（只保存行程本身，FlyAI 产品单独推荐）
  const cleanTrip = {
    ...trip,
    itinerary: trip.itinerary.map(day => ({
      ...day,
      activities: day.activities.map(({ flyaiResults, ...act }) => act)
    }))
  };

  // 云数据库保存行程（日历同步在详情页"同步到日历"按钮中单独触发）
  saveTrip(cleanTrip);

  return trip;
};

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  // 先同步查 Storage 缓存，避免云查询异步导致"已添加"一闪而过
  const savedIds: string[] = (() => {
    try {
      const raw = Taro.getStorageSync('saved_trip_ids');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  })();
  const [tripSaved, setTripSaved] = React.useState(
    message.tripPlan?.id ? savedIds.includes(message.tripPlan.id) : false
  );

  // 云数据库二次确认（Storage 可能有延迟）
  React.useEffect(() => {
    if (message.tripPlan?.id && !savedIds.includes(message.tripPlan.id)) {
      fetchTrip(message.tripPlan.id).then(found => {
        if (found) {
          setTripSaved(true);
          // 同步缓存
          const merged = [...new Set([...savedIds, message.tripPlan!.id])];
          Taro.setStorageSync('saved_trip_ids', JSON.stringify(merged));
        }
      });
    }
  }, [message.tripPlan?.id]);

  // ---------- 查看详情 ----------
  const handleViewDetail = () => {
    if (message.tripPlan) {
      Taro.setStorageSync('current_trip', JSON.stringify(message.tripPlan));
      Taro.navigateTo({ url: '/pages/tripDetail/index?id=' + message.tripPlan.id + '&from=chat' });
    }
  };

  // ---------- 添加行程（tripPlan）----------
  const handleAddTripPlan = () => {
    if (!message.tripPlan) return;
    const tpid = message.tripPlan.id;
    setTripSaved(true);
    // 同步缓存，避免再进聊天页一闪而过
    try {
      const raw = Taro.getStorageSync('saved_trip_ids');
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(tpid)) {
        ids.push(tpid);
        Taro.setStorageSync('saved_trip_ids', JSON.stringify(ids));
      }
    } catch {}
    saveToMyTrips({ ...message.tripPlan, status: 'active', createdAt: message.tripPlan.createdAt || new Date().toISOString() });
    Taro.showToast({ title: '已添加到行程', icon: 'success', duration: 600 });
    Taro.switchTab({ url: '/pages/trips/index' });
  };

  // ---------- 替换活动 ----------
  const handleReplaceAct = (item: SearchItem) => {
    if (!message.context?.reselectAct) return;
    const { tripId, dayIdx, actIdx } = message.context.reselectAct;

    try {
      // 加载行程
      const cached = Taro.getStorageSync('current_trip');
      let trip: TripPlan | null = null;
      if (cached) {
        trip = JSON.parse(cached);
      }
      if (!trip) {
        const tripsCache = Taro.getStorageSync('my_trips');
        if (tripsCache) {
          const trips = JSON.parse(tripsCache);
          trip = trips.find((t: TripPlan) => t.id === tripId) || null;
        }
      }
      if (!trip || !trip.itinerary[dayIdx] || !trip.itinerary[dayIdx].activities[actIdx]) {
        Taro.showToast({ title: '行程数据丢失，请重试', icon: 'none' });
        return;
      }

      // 替换
      const oldAct = trip.itinerary[dayIdx].activities[actIdx];
      trip.itinerary[dayIdx].activities[actIdx] = {
        ...oldAct,
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title: item.title,
        description: item.description || oldAct.description,
        location: oldAct.location,
        time: oldAct.time,
        type: oldAct.type,
        icon: oldAct.icon
      };

      // 持久化
      Taro.setStorageSync('current_trip', JSON.stringify(trip));
      saveTrip(trip);

      Taro.showToast({ title: '已替换！', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 1000);
    } catch (e) {
      console.error('[ChatBubble] 替换失败:', e);
      Taro.showToast({ title: '替换失败', icon: 'none' });
    }
  };

  // ---------- 点击活动查看 FlyAI 推荐 ----------
  const handleActivityClick = (act: import('@/types/trip').Activity) => {
    Taro.setStorageSync('current_activity_detail', JSON.stringify({
      title: act.title,
      time: act.time || '',
      type: act.type || 'other',
      icon: act.icon || '',
      destination: message.tripPlan?.destination || '',
      origin: message.tripPlan?.origin || '',
      startDate: message.tripPlan?.startDate || '',
      flyaiResults: act.flyaiResults || []
    }));
    Taro.navigateTo({ url: '/pages/activityDetail/index' });
  };

  const handleKeepOriginal = () => {
    Taro.showToast({ title: '已保留原活动', icon: 'none' });
    setTimeout(() => Taro.navigateBack(), 800);
  };
  const handleAddSearchItem = (item: SearchItem) => {
    // 从标题推断天数
    let days = 1;
    const dayMatch = item.title.match(/(\d+)日|(\d+)天|(\d+)晚|(\d+)日游/);
    if (dayMatch) {
      const d = parseInt(dayMatch[0].replace(/[^0-9]/g, ''), 10);
      if (d > 0 && d <= 30) days = d;
    }

    const startDate = fmtDate(new Date());
    const trip: TripPlan = {
      id: 'trip_' + Date.now(),
      title: item.title,
      destination: '',
      startDate,
      endDate: addDays(startDate, days - 1),
      days,
      description: item.description || item.title,
      image: cleanUrl(item.image) || '',
      tags: [],
      status: 'active',
      itinerary: [],
      createdAt: new Date().toISOString()
    };

    saveToMyTrips(trip);
    Taro.showToast({ title: `已添加到行程 (${days}天)`, icon: 'success' });
    setTimeout(() => Taro.switchTab({ url: '/pages/trips/index' }), 800);
  };

  const cleanText = message.content.replace(/[`]/g, '');
  const lines = cleanText.split('\n');

  return (
    <View className={classnames(styles.bubble, isUser ? styles.user : styles.assistant)}>
      {!isUser && (
        <View className={styles.avatar}>
          <Text className={styles.avatarText}>🤖</Text>
        </View>
      )}
      <View className={classnames(styles.content, isUser ? styles.userContent : styles.assistantContent)}>
        {lines.map((line, i) => (
          <View key={i} className={styles.textLine}>
            {renderTextWithLinks(line)}
          </View>
        ))}

        {/* AI 生成的行程计划卡片 */}
        {!isUser && message.tripPlan && (
          <View className={styles.tripCard}>
            <DestImage className={styles.tripImage} name={message.tripPlan.destination} mode="aspectFill" />
            <View className={styles.tripBody}>
              <Text className={styles.tripTitle}>{message.tripPlan.title}</Text>
              <Text className={styles.tripDesc}>{message.tripPlan.description}</Text>
              <View className={styles.tripMeta}>
                <Text className={styles.tripDate}>
                  📅 {formatDateCN(message.tripPlan.startDate)} - {formatDateCN(message.tripPlan.endDate)}
                </Text>
                <Text className={styles.tripDays}>{message.tripPlan.days}天行程</Text>
              </View>
              {message.tripPlan.itinerary.length > 0 && (
                <View className={styles.tripSummary}>
                  {message.tripPlan.itinerary.map(day => (
                    <View key={day.day} className={styles.dayBlock}>
                      <Text className={styles.dayLabel}>第{day.day}天 · {day.date}</Text>
                      {day.activities.map(act => (
                        <View
                          key={act.id}
                          className={classnames(styles.actItem, styles.actItemClickable)}
                          onClick={() => handleActivityClick(act)}
                        >
                           <View className={styles.actBody}>
                             <Text className={styles.actTitle}>
                               {act.icon} {act.time ? `${act.time} ` : ''}{act.title}
                             </Text>
                           </View>
                           <View className={styles.actArrow}>
                             <Text className={styles.actArrowText}>查看推荐 ›</Text>
                           </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}
              <View className={styles.tripActions}>
                <View className={styles.detailBtn} onClick={handleViewDetail}>
                  <Text className={styles.detailBtnText}>查看详情</Text>
                </View>
                <View
                  className={classnames(styles.adoptBtn, tripSaved && styles.adoptBtnSaved)}
                  onClick={() => { if (!tripSaved) handleAddTripPlan(); }}
                >
                  <Text className={styles.adoptBtnText}>{tripSaved ? '✅ 已添加' : '📋 添加行程'}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 搜索结果卡片 */}
        {!isUser && message.searchItems && message.searchItems.length > 0 && (
          <View className={styles.searchResults}>
            {message.searchItems.map((item, idx) => {
              const imgSrc = cleanUrl(item.image);
              const link = cleanUrl(item.jumpUrl);
              const isReselect = !!message.context?.reselectAct;
              return (
                <View key={idx} className={styles.searchCard}>
                  {imgSrc ? (
                    <Image className={styles.searchImage} src={imgSrc} mode="aspectFill" />
                  ) : (
                    <View className={styles.searchImagePlaceholder}>
                      <Text className={styles.searchImagePlaceholderText}>🏷️</Text>
                    </View>
                  )}
                  <View className={styles.searchBody}>
                    <Text className={styles.searchTitle}>{item.title}</Text>
                    {item.price ? <Text className={styles.searchPrice}>{item.price}</Text> : null}
                    {item.description ? <Text className={styles.searchDesc}>{item.description}</Text> : null}
                    <View className={styles.searchActions}>
                      {link ? (
                        <View className={styles.searchLink} onClick={() => handleLinkClick(link)}>
                          <Text className={styles.searchLinkText}>🔗 查看详情</Text>
                        </View>
                      ) : null}
                      {isReselect ? (
                        <>
                          <View className={styles.replaceActBtn} onClick={() => handleReplaceAct(item)}>
                            <Text className={styles.replaceActBtnText}>✅ 替换</Text>
                          </View>
                          <View className={styles.keepBtn} style={{ marginLeft: '12rpx' }} onClick={handleKeepOriginal}>
                            <Text className={styles.keepBtnText}>❌ 不替换</Text>
                          </View>
                        </>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
      {isUser && (
        <View className={styles.avatar}>
          {getUserAvatar() ? (
            <Image className={styles.avatarImg} src={getUserAvatar()} mode="aspectFill" />
          ) : (
            <Text className={styles.avatarText}>{'\uD83E\uDDD1'}</Text>
          )}
        </View>
      )}
    </View>
  );
};

export default ChatBubble;
