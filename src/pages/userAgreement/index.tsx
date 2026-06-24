import React from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import styles from './index.module.scss';

const UserAgreementPage: React.FC = () => {
  return (
    <ScrollView className={styles.page} scrollY>
      <View className={styles.card}>

        <View className={styles.mainTitle}>
          <Text>用户协议</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.body}>
            欢迎使用"且行日记"（以下简称"本程序"）。本协议是您与本程序之间关于使用本程序服务所订立的协议。
            请您仔细阅读本协议的全部内容。如您不同意本协议的任何条款，请勿使用本程序。您使用本程序即视为已阅读并同意本协议的全部条款。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>一、服务内容</Text>
          <Text className={styles.body}>
            本程序为用户提供旅行行程规划、日历管理、目的地发现、AI 智能对话等旅游相关服务。
            我们有权根据业务发展需要，对服务内容进行升级、调整或暂停，并在程序内进行公告通知。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>二、用户账号</Text>
          <Text className={styles.body}>
            用户通过微信授权登录使用本程序。您应当对使用您账号进行的所有活动承担责任。
            如发现任何未经授权使用您账号的情况，请及时通过意见反馈功能联系我们。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>三、用户行为规范</Text>
          <Text className={styles.body}>
            您在使用本程序的过程中，应遵守中华人民共和国相关法律法规，不得利用本程序从事以下行为：
          </Text>
          <Text className={styles.subItem}>1. 发布、传播违法违规信息；</Text>
          <Text className={styles.subItem}>2. 侵犯他人知识产权或商业秘密；</Text>
          <Text className={styles.subItem}>3. 干扰本程序正常运行，或利用技术手段进行恶意攻击；</Text>
          <Text className={styles.subItem}>4. 从事其他违反法律法规或社会公序良俗的行为。</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>四、知识产权</Text>
          <Text className={styles.body}>
            本程序中所有内容，包括但不限于文字、图片、图标、界面设计、软件代码等，
            均归本程序运营方所有或已获得合法授权，受《中华人民共和国著作权法》等相关法律法规保护。
            未经权利人事先书面许可，任何人不得以任何方式复制、修改、转载、传播上述内容。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>五、免责声明</Text>
          <Text className={styles.body}>
            本程序提供的行程规划建议来源于 AI 生成和用户自行编辑，仅供参考。
            用户应自行判断行程的安全性和可行性，并承担旅行过程中可能出现的风险。
            在以下情况下，本程序不承担责任：
          </Text>
          <Text className={styles.subItem}>1. 因不可抗力（自然灾害、战争、政策变化等）导致的损失；</Text>
          <Text className={styles.subItem}>2. 因第三方服务（交通、住宿、景点等）引起的纠纷或损失；</Text>
          <Text className={styles.subItem}>3. 因用户自身原因导致的损失。</Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>六、协议修改</Text>
          <Text className={styles.body}>
            我们有权根据法律法规及业务变化，适时修订本协议。
            修订后的协议将在程序内公布，自公布之日起生效。
            如您继续使用本程序，即视为接受修改后的协议。
            如不同意修改内容，您应立即停止使用本程序。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>七、法律适用与争议解决</Text>
          <Text className={styles.body}>
            本协议的解释、效力及纠纷的解决，均适用中华人民共和国法律。
            如因本协议产生任何争议，双方应友好协商解决；协商不成的，任何一方均可向运营方所在地有管辖权的人民法院提起诉讼。
          </Text>
        </View>

        <View className={styles.section}>
          <Text className={styles.sectionTitle}>八、联系我们</Text>
          <Text className={styles.body}>
            如对本协议有任何疑问、意见或建议，请通过程序内的"意见反馈"功能与我们联系。
          </Text>
        </View>

        <View className={styles.footer}>
          <Text>生效日期：2026年6月23日</Text>
        </View>

      </View>
    </ScrollView>
  );
};

export default UserAgreementPage;
