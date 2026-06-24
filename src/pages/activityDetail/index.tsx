import React from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import styles from './index.module.scss';
import { SearchItem } from '@/types/trip';
import { handleLinkClick } from '@/utils/linkHandler';
import { refreshRecommend, searchActivity } from '@/services/travel';

interface ActivityDetail {
  title: string;
  time: string;
  type: string;
  icon: string;
  destination: string;
  origin?: string;
  startDate?: string;
  flyaiResults: SearchItem[];
}

const cleanUrl = (url: string) => (url || '').replace(/[`]/g, '').trim();

const typeLabel: Record<string, string> = {
  sightseeing: '景点',
  food: '美食',
  hotel: '住宿',
  transport: '交通',
  other: '其他'
};

const ActivityDetailPage: React.FC = () => {
  const [detail, setDetail] = React.useState<ActivityDetail | null>(null);
  const [items, setItems] = React.useState<SearchItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [showReason, setShowReason] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const init = async () => {
      try {
        const cached = Taro.getStorageSync('current_activity_detail');
        if (!cached) { setInitialLoading(false); return; }
        const d = JSON.parse(cached) as ActivityDetail;
        setDetail(d);

        // 已有 flyaiResults → 直接展示
        if (d.flyaiResults && d.flyaiResults.length > 0) {
          setItems(d.flyaiResults);
          setInitialLoading(false);
          return;
        }

        // 无结果 → 懒加载搜索 FlyAI
        if (d.destination && d.title) {
          const res = await searchActivity({
            destination: d.destination,
            title: d.title,
            type: d.type,
            origin: d.origin,
            startDate: d.startDate
          });
          if (res.success) setItems(res.items);
        }
      } catch {} finally {
        setInitialLoading(false);
      }
    };
    init();
  }, []);

  // 点击换一个推荐 → 先问原因
  const handleRefreshClick = () => {
    if (loading) return;
    setShowReason(true);
    setReason('');
  };

  // 确认推荐原因后搜索
  const handleReasonSubmit = async () => {
    if (!detail || loading || submitting) return;
    const reasonText = reason.trim();
    if (!reasonText) {
      Taro.showToast({ title: '请说说你的需求', icon: 'none' });
      return;
    }

    setSubmitting(true);
    setLoading(true);
    Taro.showLoading({ title: '搜索中...' });

    try {
      const excludeTitles = items.map(it => it.title);
      const res = await refreshRecommend({
        destination: detail.destination,
        title: detail.title,
        type: detail.type,
        excludeTitles,
        reason: reasonText
      });

      Taro.hideLoading();

      if (res.success && res.items.length > 0) {
        setItems(res.items);
        // 新推荐标题可能已变 → 更新 detail 和存储
        const newTitle = res.items[0].title;
        if (newTitle && newTitle !== detail.title) {
          const updated = { ...detail, title: newTitle, flyaiResults: res.items };
          setDetail(updated);
          Taro.setStorageSync('current_activity_detail', JSON.stringify(updated));
        }
        setShowReason(false);
        Taro.showToast({ title: `找到 ${res.items.length} 个新推荐`, icon: 'success' });
      } else {
        Taro.showToast({ title: res.message || '暂无更多推荐', icon: 'none' });
      }
    } catch {
      Taro.hideLoading();
      Taro.showToast({ title: '搜索失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  const handleReasonCancel = () => {
    setShowReason(false);
    setReason('');
  };

  if (!detail) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>
          <Text className={styles.emptyText}>暂无数据</Text>
        </View>
      </View>
    );
  }

  if (initialLoading) {
    return (
      <View className={styles.page}>
        <View className={styles.header}>
          <Text className={styles.actTitle}>{detail.icon} {detail.title}</Text>
          <View className={styles.actInfo}>
            {detail.time ? <Text className={styles.actTime}>{detail.time}</Text> : null}
            <Text className={styles.actType}>{typeLabel[detail.type] || detail.type}</Text>
          </View>
        </View>
        <View className={styles.empty}>
          <Text className={styles.emptyText}>搜索推荐中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View className={styles.page}>
      {/* 活动头部 */}
      <View className={styles.header}>
        <Text className={styles.actTitle}>{detail.icon} {detail.title}</Text>
        <View className={styles.actInfo}>
          {detail.time ? <Text className={styles.actTime}>{detail.time}</Text> : null}
          <Text className={styles.actType}>{typeLabel[detail.type] || detail.type}</Text>
        </View>
      </View>

      {/* 推荐商品列表 */}
      <View className={styles.list}>
        <View className={styles.listHeader}>
          <Text className={styles.listTitle}>{detail.type === 'food' ? '美食详情' : `共 ${items.length} 个相关推荐`}</Text>
          <View className={classnames(styles.refreshBtn, loading && styles.refreshBtnDisabled)} onClick={handleRefreshClick}>
            <Text className={styles.refreshBtnText}>{loading ? '搜索中...' : '换一个推荐'}</Text>
          </View>
        </View>

        {/* 诉求输入框 */}
        {showReason && (
          <View className={styles.reasonBox}>
            <Text className={styles.reasonLabel}>对当前推荐有什么不满意？想要什么样的？</Text>
            <View className={styles.reasonInputRow}>
              <Input
                className={styles.reasonInput}
                placeholder='比如：太贵了、想要当地特色、离酒店近一点...'
                value={reason}
                onInput={e => setReason(e.detail.value)}
                confirmType='search'
                onConfirm={handleReasonSubmit}
                disabled={submitting}
                focus
              />
            </View>
            <View className={styles.reasonActions}>
              <View className={classnames(styles.reasonCancel, submitting && styles.reasonCancelDisabled)} onClick={handleReasonCancel}>
                <Text className={styles.reasonCancelText}>取消</Text>
              </View>
              <View className={classnames(styles.reasonConfirm, submitting && styles.reasonConfirmDisabled)} onClick={handleReasonSubmit}>
                <Text className={styles.reasonConfirmText}>{submitting ? '搜索中...' : '搜索新推荐'}</Text>
              </View>
            </View>
          </View>
        )}

        {items.length > 0 ? (
        detail.type === 'food' ? (
          /* 美食：LLM 生成的信息卡片 */
          items.map((item, i) => (
            <View key={i} className={styles.foodCard}>
              <View className={styles.foodIcon}>🍽️</View>
              <Text className={styles.foodName}>{item.title}</Text>
              {item.description ? <Text className={styles.foodDesc}>{item.description}</Text> : null}
              {item.features && item.features.length > 0 && (
                <View className={styles.foodFeatures}>
                  {item.features.map((f, fi) => (
                    <View key={fi} className={styles.foodTag}>
                      <Text className={styles.foodTagText}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}
              {item.recommendedDishes && item.recommendedDishes.length > 0 && (
                <View className={styles.foodDishes}>
                  <Text className={styles.foodDishesLabel}>推荐菜</Text>
                  <View className={styles.foodDishesList}>
                    {item.recommendedDishes.map((d, di) => (
                      <View key={di} className={styles.foodDishTag}>
                        <Text className={styles.foodDishTagText}>{d}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {item.address ? (
                <View className={styles.foodRow}>
                  <Text className={styles.foodRowLabel}>地址</Text>
                  <Text className={styles.foodRowValue}>{item.address}</Text>
                </View>
              ) : null}
              {item.avgPrice ? (
                <View className={styles.foodRow}>
                  <Text className={styles.foodRowLabel}>人均</Text>
                  <Text className={styles.foodPrice}>{item.avgPrice}</Text>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          /* 景点/酒店/交通：FlyAI 商品卡片 */
          items.map((item, i) => {
            const img = cleanUrl(item.image);
            const link = cleanUrl(item.jumpUrl);
            return (
              <View key={i} className={styles.card}>
                {img ? (
                  <Image className={styles.cardImage} src={img} mode="aspectFill" />
                ) : null}
                <View className={styles.cardBody}>
                  <Text className={styles.cardTitle}>{item.title}</Text>
                  {item.price ? <Text className={styles.cardPrice}>{item.price}</Text> : null}
                  {link ? (
                    <View className={styles.cardLink} onClick={() => handleLinkClick(link)}>
                      <Text className={styles.cardLinkText}>查看详情</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )
      ) : (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>暂无推荐</Text>
        </View>
      )}
      </View>
    </View>
  );
};

export default ActivityDetailPage;
