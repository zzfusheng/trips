import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import styles from './index.module.scss';
import { destinations as staticDestinations } from '@/data/destinations';
import { fetchHotDestinations } from '@/services/travel';
import DestImage from '@/components/DestImage';
import { fetchFavorites, saveFavorites } from '@/services/cloud';
import type { Destination } from '@/types/trip';

const DiscoverPage: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('全部');
  const [destinations, setDestinations] = useState<Destination[]>(staticDestinations);
  const [favorites, setFavorites] = useState<Destination[]>([]);
  const [openid, setOpenid] = useState('');
  const favIds = new Set(favorites.map(f => f.id));

  // 动态标签：统计当前目的地所有标签频率，取 top5
  const categories = useMemo(() => {
    const tagCount: Record<string, number> = {};
    destinations.forEach(d => {
      d.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });
    const top5 = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
    return ['全部', ...top5];
  }, [destinations]);

  const loadFavorites = async (uid: string) => {
    const list = await fetchFavorites(uid);
    setFavorites(list);
  };

  const toggleFavorite = (e: any, dest: Destination) => {
    e.stopPropagation();
    setFavorites(prev => {
      const exists = prev.find(f => f.id === dest.id);
      const next = exists ? prev.filter(f => f.id !== dest.id) : [...prev, dest];
      saveFavorites(openid, next);
      return next;
    });
  };

  useDidShow(() => {
    Taro.cloud.callFunction({ name: 'getOpenid' }).then((res: any) => {
      const uid = res?.result?.openid || '';
      if (uid) {
        setOpenid(uid);
        loadFavorites(uid);
      }
    }).catch(() => {});
    fetchHotDestinations(list => setDestinations(list)).then(list => {
      if (list.length > 0) setDestinations(list);
    });
  });

  const filteredDestinations = (activeCategory === '全部'
    ? destinations
    : destinations.filter(d => d.tags.includes(activeCategory))
  ).sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const handleDestination = (dest: Destination) => {
    Taro.navigateTo({
      url: `/pages/chat/index?question=${encodeURIComponent(`帮我规划${dest.name}的旅行`)}`
    });
  };

  // 星级 + 评分显示
  const renderRating = (rating: number) => {
    const starCount = Math.round(rating || 4.5);
    const stars = '⭐'.repeat(starCount);
    const score = (rating || 4.5).toFixed(1);
    return `${stars} ${score}`;
  };

  return (
    <View className={styles.page}>
      <ScrollView scrollX className={styles.catScroll} showScrollbar={false}>
        {categories.map(cat => (
          <View
            key={cat}
            className={`${styles.catItem} ${activeCategory === cat ? styles.catActive : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            <Text className={`${styles.catText} ${activeCategory === cat ? styles.catActiveText : ''}`}>
              {cat}
            </Text>
          </View>
        ))}
      </ScrollView>

      <ScrollView scrollY className={styles.grid}>
        {filteredDestinations.map(dest => (
          <View key={dest.id} className={styles.destCard} onClick={() => handleDestination(dest)}>
            <View className={styles.imageWrap}>
              <DestImage
                className={styles.destImage}
                name={dest.name}
                mode="aspectFill"
              />
              <View
                className={`${styles.favStar} ${favIds.has(dest.id) ? styles.favStarActive : ''}`}
                onClick={(e: any) => toggleFavorite(e, dest)}
              >
                <Text className={styles.favStarText}>
                  {favIds.has(dest.id) ? '\u2605' : '\u2606'}
                </Text>
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

export default DiscoverPage;
