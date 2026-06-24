import React from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import styles from './index.module.scss';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <ScrollView className={styles.page} scrollY>
      <View className={styles.card}>

        <View className={styles.mainTitle}>
          <Text>隐私政策</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.body}>
            "且行日记"（以下简称"我们"）深知个人信息对您的重要性。
            本隐私政策旨在向您说明我们如何收集、使用、存储、共享和保护您的个人信息，
            以及您所享有的相关权利。请您在使用本程序前仔细阅读本政策。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>一、我们收集的信息</Text>
          <Text className={styles.body}>在您使用本程序的过程中，我们可能收集以下类型的信息：</Text>
          <Text className={styles.subItem}>1. 您在微信授权登录时提供的微信账号信息（头像、昵称）；</Text>
          <Text className={styles.subItem}>2. 您主动创建和编辑的行程规划数据，包括目的地、日期、活动安排等；</Text>
          <Text className={styles.subItem}>3. 您添加的日历事件和提醒设置；</Text>
          <Text className={styles.subItem}>4. 您在 AI 对话中输入的内容；</Text>
          <Text className={styles.subItem}>5. 设备信息（设备型号、操作系统版本、微信版本），用于优化服务体验和排查问题。</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>二、信息的存储</Text>
          <Text className={styles.body}>
            您的个人信息和数据存储于微信云开发平台的云数据库中。
            微信云开发平台采用业界标准的加密技术和安全防护措施，保障数据安全。
            我们不会将您的数据存储在境外服务器上。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>三、信息的使用</Text>
          <Text className={styles.body}>我们收集的信息将仅用于以下目的：</Text>
          <Text className={styles.subItem}>1. 为您提供行程规划、日历管理、目的地推荐等核心功能；</Text>
          <Text className={styles.subItem}>2. 根据您设置的时间发送日历提醒通知；</Text>
          <Text className={styles.subItem}>3. 改善和优化本程序的功能与用户体验；</Text>
          <Text className={styles.subItem}>4. 处理您的反馈和投诉。</Text>
          <Text className={styles.body}>
            我们不会将您的个人信息用于任何未经您授权的商业用途，也不会通过自动化决策对您进行用户画像。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>四、信息的共享、转让与公开披露</Text>
          <Text className={styles.body}>
            我们不会将您的个人信息出售给任何第三方。仅在以下情形下，我们可能共享您的信息：
          </Text>
          <Text className={styles.subItem}>1. 获得您的明确授权或同意；</Text>
          <Text className={styles.subItem}>2. 根据法律法规规定，或应行政、司法机关的合法要求；</Text>
          <Text className={styles.subItem}>3. 为保护我们或公众的人身、财产安全所必需。</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>五、您的权利</Text>
          <Text className={styles.body}>
            根据相关法律法规，您享有以下权利：
          </Text>
          <Text className={styles.subItem}>1. 访问权：您可以随时在"我的"页面查看您的个人信息；</Text>
          <Text className={styles.subItem}>2. 更正权：您可以通过编辑功能修改昵称、简介、头像等信息；</Text>
          <Text className={styles.subItem}>3. 删除权：您可以使用"清除缓存"或"账号注销"功能删除本地的和云端的个人数据；</Text>
          <Text className={styles.subItem}>4. 撤回同意权：您可以在"我的-提醒设置"中关闭消息提醒授权。</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>六、未成年人保护</Text>
          <Text className={styles.body}>
            本程序主要面向成年用户。如您是未满 14 周岁的未成年人，
            请在监护人陪同下阅读本政策，并在监护人同意后使用本程序。
            我们不会主动收集未成年人的个人信息。
            如发现我们无意中收集了未成年人的信息，请及时联系我们删除。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>七、政策更新</Text>
          <Text className={styles.body}>
            我们可能根据法律法规或业务变化适时修订本隐私政策。
            修订后的版本将在程序内公布，重大变更将以更显著的方式通知您。
            如您继续使用本程序，即表示同意更新后的政策。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>八、联系我们</Text>
          <Text className={styles.body}>
            如对本隐私政策有任何疑问、意见或建议，请通过程序内的"意见反馈"功能与我们联系，
            我们将在合理期限内予以回复。
          </Text>
        </View>

        <View className={styles.footer}>
          <Text>生效日期：2026年6月23日</Text>
        </View>

      </View>
    </ScrollView>
  );
};

export default PrivacyPolicyPage;
