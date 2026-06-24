import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';
import { Destination } from '@/types/trip';
import DestImage from '@/components/DestImage';

interface SuggestionCardProps {
  destination: Destination;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ destination }) => {
  const handleClick = () => {
    Taro.navigateTo({
      url: `/pages/chat/index?question=${encodeURIComponent(`帮我规划${destination.name}的旅行`)}`
    });
  };

  // 星级：评分 4.8 → 5 星，4.3 → 4 星
  const starCount = Math.round(destination.rating || 4.5);
  const starStr = '⭐'.repeat(starCount);
  // 评分保留 1 位小数
  const ratingStr = (destination.rating || 4.5).toFixed(1);

  return (
    <View className={styles.card} onClick={handleClick}>
      <DestImage
        className={styles.image}
        name={destination.name}
        mode="aspectFill"
      />
      <View className={styles.overlay}>
        <View className={styles.info}>
          <Text className={styles.name}>{destination.name}</Text>
          <Text className={styles.country}>{destination.country}</Text>
          <View className={styles.meta}>
            <View className={styles.rating}>
              <Text className={styles.ratingText}>{starStr} {ratingStr}</Text>
            </View>
            <View className={styles.budget}>
              <Text className={styles.budgetText}>{destination.budget}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default SuggestionCard;
