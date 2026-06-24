import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import styles from './index.module.scss';
import SuggestionCard from '@/components/SuggestionCard';
import { destinations as staticDestinations } from '@/data/destinations';
import { quickQuestions } from '@/data/chatMock';
import { fetchHotDestinations } from '@/services/travel';
import type { Destination } from '@/types/trip';

const HomePage: React.FC = () => {
  const [destinations, setDestinations] = useState<Destination[]>(staticDestinations.slice(0, 6));

  useDidShow(() => {
    fetchHotDestinations(list => setDestinations(list.slice(0, 6))).then(list => {
      if (list.length > 0) setDestinations(list.slice(0, 6));
    });
  });

  const handleChatEntry = () => {
    Taro.navigateTo({ url: '/pages/chat/index' });
  };

  const handleQuestion = (question: string) => {
    Taro.navigateTo({
      url: `/pages/chat/index?question=${encodeURIComponent(question)}`
    });
  };

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <View className={styles.starsLayer} />
        <View className={styles.headerContent}>
          <Text className={styles.headerTitle}>旅行规划助手</Text>
          <Text className={styles.headerSub}>AI 帮你规划完美旅程</Text>
          <View className={styles.aiEntry} onClick={handleChatEntry}>
            <Text className={styles.aiIcon}>💬</Text>
            <Text className={styles.aiPlaceholder}>告诉我去哪玩...</Text>
            <View className={styles.aiButton}>
              <Text className={styles.aiButtonText}>开始规划</Text>
            </View>
          </View>
        </View>
      </View>

      <View className={styles.section}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitle}>热门目的地</Text>
          <Text className={styles.sectionMore} onClick={() => Taro.switchTab({ url: '/pages/discover/index' })}>更多</Text>
        </View>
        <ScrollView scrollX className={styles.destScroll} showScrollbar={false}>
          {destinations.map((dest, i) => (
            <View key={dest.id} className={`${styles.destItem} ${i === 0 ? styles.destFirst : ''}`}>
              <SuggestionCard destination={dest} />
            </View>
          ))}
        </ScrollView>
      </View>

      <View className={styles.section}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitle}>快速提问</Text>
        </View>
        <View className={styles.questions}>
          {quickQuestions.map((q, i) => (
            <View key={i} className={styles.questionItem} onClick={() => handleQuestion(q)}>
              <Text className={styles.questionIcon}>💡</Text>
              <Text className={styles.questionText}>{q}</Text>
              <Text className={styles.questionArrow}>→</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

export default HomePage;
