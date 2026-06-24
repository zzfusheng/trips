import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import styles from '@/pages/discover/index.module.scss';
import { fetchFavorites, saveFavorites } from '@/services/cloud';
import type { Destination } from '@/types/trip';
import DestImage from '@/components/DestImage';

const LoadingScreen: React.FC = () => (
  <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <Text style={{ color: '#aab', fontSize: '28rpx' }}>加载中...</Text>
  </View>
);

const EmptyScreen: React.FC = () => (
  <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <Text style={{ fontSize: '80rpx', marginBottom: '24rpx' }}>{'\u2606'}</Text>
    <Text style={{ fontSize: '28rpx', color: '#aab' }}>还没有收藏目的地</Text>
    <Text style={{ fontSize: '24rpx', color: '#ccc', marginTop: '8rpx' }}>去「发现」页面浏览并收藏吧</Text>
  </View>
);

const FavoritesPage: React.FC = () => {
  const [favorites, setFavorites] = useState<Destination[] | null>(null);
  const openidRef = React.useRef('');

  const load = () => {
    Taro.cloud.callFunction({ name: 'getOpenid' }).then((res: any) => {
      const uid = res?.result?.openid || '';
      if (uid) {
        openidRef.current = uid;
        fetchFavorites(uid).then(list => setFavorites(list));
      } else {
        setFavorites([]);
      }
    }).catch(() => setFavorites([]));
  };

  useDidShow(() => { load(); });

  const toggleFavorite = (e: any, dest: Destination) => {
    e.stopPropagation();
    setFavorites(prev => {
      if (!prev) return prev;
      const next = prev.filter(d => d.id !== dest.id);
      saveFavorites(openidRef.current, next);
      return next;
    });
  };

  const renderRating = (rating: number) => {
    const starCount = Math.round(rating || 4.5);
    const stars = '\u2B50'.repeat(starCount);
    const score = (rating || 4.5).toFixed(1);
    return `${stars} ${score}`;
  };

  if (favorites === null) return <LoadingScreen />;
  if (favorites.length === 0) return <EmptyScreen />;

  return (
    <View style={{ minHeight: '100vh', background: '#f6f8fa', paddingBottom: '100rpx' }}>
      <ScrollView scrollY className={styles.grid}>
        {favorites.map(dest => (
          <View
            key={dest.id}
            className={styles.destCard}
            onClick={() => {
              Taro.navigateTo({
                url: `/pages/chat/index?question=${encodeURIComponent(`帮我规划${dest.name}的旅行`)}`
              });
            }}
          >
            <View className={styles.imageWrap}>
              <DestImage className={styles.destImage} name={dest.name} mode="aspectFill" />
              <View
                className={`${styles.favStar} ${styles.favStarActive}`}
                onClick={(e: any) => toggleFavorite(e, dest)}
              >
                <Text className={styles.favStarText}>{'\u2605'}</Text>
              </View>
            </View>
            <View className={styles.destBody}>
              <Text className={styles.destName}>{dest.name}</Text>
              <Text className={styles.destCountry}>{dest.country}</Text>
              <Text className={styles.destDesc}>{dest.description}</Text>
              <View className={styles.destFooter}>
                <View className={styles.destTags}>
                  {dest.tags.slice(0, 2).map((tag, i) => (
                    <View key={i} className={styles.destTag}>
                      <Text className={styles.destTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <View className={styles.destRating}>
                  <Text className={styles.destRatingText}>{renderRating(dest.rating)}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default FavoritesPage;
