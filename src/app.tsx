import React, { useEffect } from 'react';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { recordUser } from '@/services/cloud';
import './app.scss';

function App(props) {
  const trackUser = async () => {
    try {
      if (!Taro.cloud) {
        console.warn('[App] cloud 不可用');
        return;
      }
      // 等 cloud.init 就绪
      await new Promise(r => setTimeout(r, 500));
      const res: any = await Taro.cloud.callFunction({ name: 'getOpenid' });
      const openid = res?.result?.openid || '';
      if (!openid) {
        console.warn('[App] 无法获取 openid, result:', JSON.stringify(res));
        return;
      }
      await recordUser({ openid });
      console.log('[App] 用户记录完成, openid:', openid);
    } catch (err) {
      console.warn('[App] 用户记录失败:', JSON.stringify(err));
    }
  };

  useEffect(() => {
    // 初始化云开发
    if (Taro.cloud) {
      Taro.cloud.init({
        env: 'cloud1-d4g04dori2ba39620',
        traceUser: true
      });
    }

    // 记录用户信息（openid + 设备）
    trackUser();
  }, []);

  useDidShow(() => {});
  useDidHide(() => {});
  return props.children;
}

export default App;
