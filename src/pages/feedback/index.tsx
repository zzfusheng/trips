import React, { useState } from 'react';
import { View, Text, Textarea, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

const FeedbackPage: React.FC = () => {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Taro.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }
    setSending(true);
    try {
      const res: any = await Taro.cloud.callFunction({
        name: 'submitFeedback',
        data: { content: content.trim(), contact: contact.trim() || undefined }
      });
      if (res?.result?.success) {
        Taro.showToast({ title: '感谢反馈！', icon: 'success' });
        setTimeout(() => Taro.navigateBack(), 1500);
      } else {
        const errMsg = res?.result?.error || '未知错误';
        Taro.showToast({ title: errMsg, icon: 'error' });
      }
    } catch (e: any) {
      Taro.showToast({ title: '提交失败，请重试', icon: 'error' });
      console.warn('[Feedback] 提交失败:', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <View className={styles.page}>
      <View className={styles.card}>
        <Text className={styles.desc}>
          请详细描述您遇到的问题或建议，我们会尽快处理。
        </Text>
        <Textarea
          className={styles.textarea}
          placeholder="请输入您的反馈内容..."
          value={content}
          onInput={(e: any) => setContent(e.detail.value)}
          maxlength={500}
          autoHeight
        />
        <Input
          className={styles.contactInput}
          placeholder="联系方式（选填，方便我们回复）"
          value={contact}
          onInput={(e: any) => setContact(e.detail.value)}
        />
        <View className={styles.submitBtn} onClick={sending ? undefined : handleSubmit}>
          <Text className={styles.submitBtnText}>{sending ? '提交中...' : '提交反馈'}</Text>
        </View>
      </View>
    </View>
  );
};

export default FeedbackPage;
