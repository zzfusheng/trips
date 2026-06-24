import React, { useState, useRef } from 'react';
import { View, Text, Input, Textarea, Image } from '@tarojs/components';
import Taro, { useDidShow, usePageScroll } from '@tarojs/taro';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const wx: any;
import styles from './index.module.scss';
import { fetchUserProfile, updateUserProfile, fetchCheckInStats, deleteAccount } from '@/services/cloud';
import mineBgDefault from '@/static/mine-bg.jpg';

const DEFAULT_NICKNAME = '孤独的旅者';
const DEFAULT_BIO = '你的梦想也是星辰大海吧';

const menuItems = [
  { icon: '\uD83D\uDCCB', label: '我的行程', action: () => Taro.switchTab({ url: '/pages/trips/index' }) },
  { icon: '\uD83D\uDCC5', label: '行程日历', action: () => Taro.switchTab({ url: '/pages/calendar/index' }) },
  { icon: '\u2764\uFE0F', label: '收藏的目的地', action: () => Taro.navigateTo({ url: '/pages/favorites/index' }) },
  { icon: '\uD83D\uDD14', label: '提醒设置', action: () => Taro.navigateTo({ url: '/pages/reminderSettings/index' }) }
];

const COVER_HEIGHT = 420;

async function uploadToCloud(openid: string, tempPath: string, prefix: string): Promise<string> {
  const cloudPath = `${prefix}/${openid}_${Date.now()}.jpg`;
  const uploadRes: any = await Taro.cloud.uploadFile({ cloudPath, filePath: tempPath });
  return uploadRes.fileID;
}

/** 下载云端文件到本地，返回本地路径（同文件不重复下载） */
async function cacheCloudFile(fileID: string, cacheKey: string): Promise<string> {
  if (!fileID) return fileID;
  try {
    const cachedKey = Taro.getStorageSync(cacheKey + '_etag') || '';
    const cachedPath = Taro.getStorageSync(cacheKey + '_local') || '';
    if (cachedKey === fileID && cachedPath) {
      try { Taro.getFileSystemManager().accessSync(cachedPath); return cachedPath; } catch {}
    }
    const res: any = await Taro.cloud.downloadFile({ fileID });
    const tempPath = res.tempFilePath || res.tempFilePaths?.[0];
    if (!tempPath) return fileID;
    // 小程序 UserDataPath，Taro 4 可能挂在 env 或直接 wx
    const userDataPath = Taro.env?.USER_DATA_PATH || wx?.env?.USER_DATA_PATH || '';
    const localPath = userDataPath ? `${userDataPath}/${cacheKey}.jpg` : tempPath;
    if (userDataPath) {
      const fs = Taro.getFileSystemManager();
      try { fs.accessSync(localPath); fs.unlinkSync(localPath); } catch {}
      fs.saveFileSync(tempPath, localPath);
    }
    Taro.setStorageSync(cacheKey + '_etag', fileID);
    Taro.setStorageSync(cacheKey + '_local', localPath);
    return localPath;
  } catch {
    return fileID; // 回退到 cloud:// URL
  }
}

const MinePage: React.FC = () => {
  const [openid, setOpenid] = useState('');
  const [avatar, setAvatar] = useState(() => {
    try { return Taro.getStorageSync('avatar_local') || Taro.getStorageSync('mine_avatar') || ''; } catch { return ''; }
  });
  const [cover, setCover] = useState(() => {
    try { return Taro.getStorageSync('cover_local') || Taro.getStorageSync('mine_cover') || ''; } catch { return ''; }
  });
  const [nickname, setNickname] = useState(() => {
    try { return Taro.getStorageSync('mine_nickname') || DEFAULT_NICKNAME; } catch { return DEFAULT_NICKNAME; }
  });
  const [bio, setBio] = useState(() => {
    try { return Taro.getStorageSync('mine_bio') || DEFAULT_BIO; } catch { return DEFAULT_BIO; }
  });
  const PULL_THRESHOLD = 80; // 下拉超过这个距离才触发展开

  const [editing, setEditing] = useState(false);
  const [fullCover, setFullCover] = useState(false);
  const [stats, setStats] = useState({ tripCount: 0, cityCount: 0, dayCount: 0 });
  const [pullOffset, setPullOffset] = useState(0);
  const [picsumOn, setPicsumOn] = useState(() => {
    try { const v = Taro.getStorageSync('use_picsum_images'); return v ? !!v : true; } catch { return true; }
  });
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const scrollTop = useRef(0);

  const snapshot = useRef({ nickname: DEFAULT_NICKNAME, bio: DEFAULT_BIO, avatar: '', cover: '' });

  useDidShow(() => {
    loadProfile();
    fetchCheckInStats().then(s => setStats(s));
  });

  usePageScroll((res) => {
    scrollTop.current = res.scrollTop;
    setScrollTopState(res.scrollTop);
  });

  const loadProfile = async () => {
    try {
      const res: any = await Taro.cloud.callFunction({ name: 'getOpenid' });
      const id = res?.result?.openid || '';
      if (!id) return;
      setOpenid(id);
      const profile = await fetchUserProfile(id);
      if (profile) {
        if (profile.avatar) {
          setAvatar(profile.avatar); Taro.setStorageSync('mine_avatar', profile.avatar);
          cacheCloudFile(profile.avatar, 'avatar').then(p => { setAvatar(p); Taro.setStorageSync('avatar_local', p); });
        }
        if (profile.coverImage) {
          setCover(profile.coverImage); Taro.setStorageSync('mine_cover', profile.coverImage);
          cacheCloudFile(profile.coverImage, 'cover').then(p => { setCover(p); Taro.setStorageSync('cover_local', p); });
        }
        if (profile.nickname) { setNickname(profile.nickname); Taro.setStorageSync('mine_nickname', profile.nickname); }
        if (profile.bio) { setBio(profile.bio); Taro.setStorageSync('mine_bio', profile.bio); }
        snapshot.current = {
          avatar: profile.avatar || '',
          cover: profile.coverImage || '',
          nickname: profile.nickname || DEFAULT_NICKNAME,
          bio: profile.bio || DEFAULT_BIO
        };
      }
    } catch (err) { console.warn('[Mine] 加载失败:', err); }
  };

  const doUploadAvatar = async (tempPath: string) => {
    Taro.showLoading({ title: '上传中...' });
    try {
      const fileID = await uploadToCloud(openid, tempPath, 'avatars');
      setAvatar(fileID);
      Taro.setStorageSync('mine_avatar', fileID);
      if (!editing) await updateUserProfile(openid, { avatar: fileID });
      Taro.hideLoading();
      Taro.showToast({ title: '头像已更新', icon: 'success' });
      // 后台缓存到本地（不影响上传流程）
      cacheCloudFile(fileID, 'avatar').then(p => {
        if (p !== fileID) { setAvatar(p); Taro.setStorageSync('avatar_local', p); }
      });
    } catch (err) {
      Taro.hideLoading();
      Taro.showToast({ title: '上传失败', icon: 'error' });
    }
  };

  const handleChooseAvatar = () => {
    Taro.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        const sourceType: ('album' | 'camera')[] = res.tapIndex === 0 ? ['album'] : ['camera'];
        Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType, success: (r: any) => r.tempFilePaths[0] && doUploadAvatar(r.tempFilePaths[0]) });
      }
    });
  };

  // —— 背景图 ——
  const coverSrc = cover || mineBgDefault;

  const handleCoverTap = () => {
    Taro.showActionSheet({
      itemList: cover ? ['查看全图', '更换背景'] : ['更换背景'],
      success: (res) => {
        if (cover && res.tapIndex === 0) {
          Taro.previewImage({ current: cover, urls: [cover] });
        } else {
          Taro.chooseImage({
            count: 1, sizeType: ['compressed'], sourceType: ['album'],
            success: async (r) => {
              const tempPath = r.tempFilePaths[0];
              if (!tempPath) return;
              Taro.showLoading({ title: '上传中...' });
              try {
                const fileID = await uploadToCloud(openid, tempPath, 'covers');
                setCover(fileID);
                Taro.setStorageSync('mine_cover', fileID);
                await updateUserProfile(openid, { coverImage: fileID });
                Taro.hideLoading();
                Taro.showToast({ title: '背景已更新', icon: 'success' });
                // 后台缓存到本地
                cacheCloudFile(fileID, 'cover').then(p => {
                  if (p !== fileID) { setCover(p); Taro.setStorageSync('cover_local', p); }
                });
              } catch (err) {
                Taro.hideLoading();
                Taro.showToast({ title: '上传失败', icon: 'error' });
              }
            }
          });
        }
      }
    });
  };

  const [, setScrollTopState] = useState(0);

  // —— 下拉展开全屏封面 ——
  const handleCoverTouchStart = (e: any) => {
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
  };

  const handleCoverTouchMove = (e: any) => {
    if (!pulling.current || fullCover) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0 && scrollTop.current <= 2) {
      const val = Math.min(dy, PULL_THRESHOLD + 60);
      pullOffsetRef.current = val;
      setPullOffset(val);
    }
  };

  const pullOffsetRef = useRef(0);
  const handleCoverTouchEnd = () => {
    pulling.current = false;
    if (pullOffsetRef.current >= PULL_THRESHOLD) {
      setFullCover(true);
    }
    setPullOffset(0);
    pullOffsetRef.current = 0;
  };

  const handleFullCoverTap = () => {
    setFullCover(false);
  };

  // —— 编辑 ——
  const handleEnterEdit = () => {
    snapshot.current = { nickname, bio, avatar, cover };
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setNickname(snapshot.current.nickname);
    setBio(snapshot.current.bio);
    setAvatar(snapshot.current.avatar);
    setCover(snapshot.current.cover);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!openid) return;
    Taro.setStorageSync('mine_avatar', avatar);
    Taro.setStorageSync('mine_cover', cover);
    Taro.setStorageSync('mine_nickname', nickname);
    Taro.setStorageSync('mine_bio', bio);
    await updateUserProfile(openid, {
      avatar: avatar || undefined,
      coverImage: cover || undefined,
      nickname: nickname.trim() || undefined,
      bio: bio.trim() || undefined
    });
    snapshot.current = { nickname, bio, avatar, cover };
    Taro.setStorageSync('mine_avatar', avatar);
    Taro.setStorageSync('mine_cover', cover);
    Taro.setStorageSync('mine_nickname', nickname);
    Taro.setStorageSync('mine_bio', bio);
    setEditing(false);
    Taro.showToast({ title: '保存成功', icon: 'success' });
  };

  const handleTogglePicsum = () => {
    const v = !picsumOn;
    setPicsumOn(v);
    Taro.setStorageSync('use_picsum_images', v);
    Taro.showToast({ title: v ? '已切换在线图片' : '已切换本地图片', icon: 'none' });
  };

  const handleClearCache = () => {
    Taro.showModal({
      title: '清除缓存',
      content: '清除后重新加载，头像/封面/行程缓存将被清空',
      success: (res: any) => {
        if (res.confirm) {
          try {
            Taro.clearStorageSync();
          } catch {}
          Taro.showToast({ title: '已清除,重新加载中...', icon: 'none', duration: 1000 });
          setTimeout(() => {
            Taro.reLaunch({ url: '/pages/home/index' });
          }, 1000);
        }
      }
    });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '退出后需重新授权登录',
      success: (res: any) => {
        if (res.confirm) {
          try { Taro.clearStorageSync(); } catch {}
          Taro.reLaunch({ url: '/pages/home/index' });
        }
      }
    });
  };

  const handleDeleteAccount = () => {
    Taro.showModal({
      title: '注销账号',
      content: '此操作不可恢复！将删除您的所有行程、日历、聊天记录和个人信息。确认继续？',
      confirmColor: '#ff4d4f',
      success: (res: any) => {
        if (res.confirm) {
          Taro.showLoading({ title: '注销中...' });
          Taro.cloud.callFunction({ name: 'getOpenid' }).then((r: any) => {
            const id = r?.result?.openid || '';
            if (!id) { Taro.hideLoading(); Taro.showToast({ title: '获取账号信息失败', icon: 'error' }); return; }
            deleteAccount(id).then(() => {
              Taro.hideLoading();
              try { Taro.clearStorageSync(); } catch {}
              Taro.showToast({ title: '账号已注销', icon: 'none', duration: 2000 });
              setTimeout(() => Taro.reLaunch({ url: '/pages/home/index' }), 2000);
            }).catch(() => {
              Taro.hideLoading();
              Taro.showToast({ title: '注销失败，请重试', icon: 'error' });
            });
          });
        }
      }
    });
  };

  return (
    <View className={styles.page}>
      {/* 正常封面 */}
      <View
        className={styles.coverWrap}
        style={{ height: `${COVER_HEIGHT + pullOffset}rpx` }}
        onClick={handleCoverTap}
        onTouchStart={handleCoverTouchStart}
        onTouchMove={handleCoverTouchMove}
        onTouchEnd={handleCoverTouchEnd}
        catchMove
      >
        <Image className={styles.coverImg} src={coverSrc} mode="aspectFill" />
        <View className={styles.coverOverlay}>
          <Text className={styles.coverHint}>点击更换背景 · 下拉查看全图</Text>
        </View>
      </View>

      {/* 页面主体 */}
      <View className={styles.avatarRow}>
        <View className={styles.avatarWrap} onClick={handleChooseAvatar}>
          {avatar ? (
            <Image className={styles.avatarImg} src={avatar} mode="aspectFill" />
          ) : (
            <View className={styles.avatarPlaceholder}>
              <Text className={styles.avatarEmoji}>{'\uD83E\uDDD1'}</Text>
            </View>
          )}
          <View className={styles.avatarBadge}>
            <Text className={styles.avatarBadgeText}>{'\uD83D\uDCF7'}</Text>
          </View>
        </View>
      </View>

      <View className={styles.infoSection}>
        {editing ? (
          <View className={styles.editFields}>
            <Input
              className={styles.nicknameInput}
              placeholder="请输入昵称"
              value={nickname}
              onInput={(e: any) => setNickname(e.detail.value)}
            />
            <Textarea
              className={styles.bioInput}
              placeholder="写一句简介..."
              value={bio}
              onInput={(e: any) => setBio(e.detail.value)}
              maxlength={50}
              autoHeight
            />
            <View className={styles.editActions}>
              <View className={styles.cancelBtn} onClick={handleCancelEdit}>
                <Text className={styles.cancelBtnText}>取消</Text>
              </View>
              <View className={styles.saveBtn} onClick={handleSave}>
                <Text className={styles.saveBtnText}>保存</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View className={styles.nameRow}>
              <Text className={styles.nickname}>{nickname}</Text>
              <View className={styles.editIcon} onClick={handleEnterEdit}>
                <Text className={styles.editIconText}>{'\u270F\uFE0F'}</Text>
              </View>
            </View>
            <Text className={styles.bio}>{bio}</Text>
          </>
        )}
      </View>

      <View className={styles.stats}>
        <View className={styles.statItem}>
          <Text className={styles.statNum}>{stats.tripCount}</Text>
          <Text className={styles.statLabel}>行程</Text>
        </View>
        <View className={styles.statDivider} />
        <View className={styles.statItem}>
          <Text className={styles.statNum}>{stats.cityCount}</Text>
          <Text className={styles.statLabel}>城市</Text>
        </View>
        <View className={styles.statDivider} />
        <View className={styles.statItem}>
          <Text className={styles.statNum}>{stats.dayCount}</Text>
          <Text className={styles.statLabel}>天数</Text>
        </View>
      </View>

      <View className={styles.menu}>
        {menuItems.map((item, i) => (
          <View key={i} className={styles.menuItem} onClick={item.action}>
            <View className={styles.menuLeft}>
              <Text className={styles.menuIcon}>{item.icon}</Text>
              <Text className={styles.menuLabel}>{item.label}</Text>
            </View>
            <Text className={styles.menuArrow}>{'\u203A'}</Text>
          </View>
        ))}
        <View className={styles.menuItem} onClick={() => Taro.navigateTo({ url: '/pages/feedback/index' })}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\uD83D\uDCAC'}</Text>
            <Text className={styles.menuLabel}>意见反馈</Text>
          </View>
          <Text className={styles.menuArrow}>{'\u203A'}</Text>
        </View>
        <View className={styles.menuItem} onClick={handleClearCache}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\uD83D\uDD04'}</Text>
            <Text className={styles.menuLabel}>清除缓存</Text>
          </View>
          <Text className={styles.menuArrow}>{'\u203A'}</Text>
        </View>
      </View>

      {/* picsum 在线图开关 */}
      <View className={styles.menu}>
        <View className={styles.menuItem} onClick={handleTogglePicsum}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\uD83D\uDDBC\uFE0F'}</Text>
            <Text className={styles.menuLabel}>在线目的地图片</Text>
          </View>
          <View style={{
            width: '88rpx', height: '48rpx', borderRadius: '24rpx',
            background: picsumOn ? '#07c160' : '#ddd', display: 'flex',
            alignItems: 'center', padding: '4rpx', transition: 'background 0.2s'
          }}>
            <View style={{
              width: '40rpx', height: '40rpx', borderRadius: '50%',
              background: '#fff', marginLeft: picsumOn ? '40rpx' : '0',
              transition: 'margin-left 0.2s', boxShadow: '0 1rpx 4rpx rgba(0,0,0,0.2)'
            }} />
          </View>
        </View>
      </View>

      {/* 设置菜单 */}
      <View className={styles.menu}>
        <View className={styles.menuItem} onClick={() => Taro.navigateTo({ url: '/pages/userAgreement/index' })}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\uD83D\uDCC4'}</Text>
            <Text className={styles.menuLabel}>用户协议</Text>
          </View>
          <Text className={styles.menuArrow}>{'\u203A'}</Text>
        </View>
        <View className={styles.menuItem} onClick={() => Taro.navigateTo({ url: '/pages/privacyPolicy/index' })}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\uD83D\uDD12'}</Text>
            <Text className={styles.menuLabel}>隐私政策</Text>
          </View>
          <Text className={styles.menuArrow}>{'\u203A'}</Text>
        </View>
      </View>

      {/* 账号操作 */}
      <View className={styles.menu}>
        <View className={styles.menuItem} onClick={handleLogout}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\uD83D\uDEAA'}</Text>
            <Text className={styles.menuLabel}>退出登录</Text>
          </View>
          <Text className={styles.menuArrow}>{'\u203A'}</Text>
        </View>
        <View className={styles.menuItemDanger} onClick={handleDeleteAccount}>
          <View className={styles.menuLeft}>
            <Text className={styles.menuIcon}>{'\u26A0\uFE0F'}</Text>
            <Text className={styles.menuLabelDanger}>账号注销</Text>
          </View>
          <Text className={styles.menuArrow}>{'\u203A'}</Text>
        </View>
      </View>

      <View className={styles.version}>
        <Text className={styles.versionText}>旅行规划助手 v1.0.0</Text>
      </View>

      {/* 全屏背景浮层 */}
      {fullCover && (
        <View className={styles.fullCoverOverlay} onClick={handleFullCoverTap} catchMove>
          <Image className={styles.fullCoverImg} src={coverSrc} mode="aspectFit" />
          <View className={styles.fullCoverHint}>
            <Text className={styles.fullCoverHintText}>点击任意位置还原</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default MinePage;
