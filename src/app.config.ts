export default {
  cloud: true,
  pages: [
    'pages/home/index',
    'pages/trips/index',
    'pages/calendar/index',
    'pages/discover/index',
    'pages/mine/index',
    'pages/chat/index',
    'pages/tripDetail/index',
    'pages/activityDetail/index',
    'pages/favorites/index',
    'pages/addEvent/index',
    'pages/reminderSettings/index',
    'pages/userAgreement/index',
    'pages/privacyPolicy/index',
    'pages/feedback/index',
    'pages/webview/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '且行日记',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#86909C',
    selectedColor: '#00B4D8',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页'
      },
      {
        pagePath: 'pages/trips/index',
        text: '行程'
      },
      {
        pagePath: 'pages/calendar/index',
        text: '日历'
      },
      {
        pagePath: 'pages/discover/index',
        text: '发现'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的'
      }
    ]
  }
}
