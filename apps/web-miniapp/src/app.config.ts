export default {
  pages: [
    'pages/index/index',
    'pages/register/index',
    'pages/schedule/index',
    'pages/assistant/index',
    'pages/expo/index',
    'pages/me/index',
    'pages/staff-checkin/index',
  ],
  lazyCodeLoading: 'requiredComponents',
  tabBar: {
    color: '#999999',
    selectedColor: '#111111',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
      },
      {
        pagePath: 'pages/schedule/index',
        text: '日程',
      },
      {
        pagePath: 'pages/assistant/index',
        text: 'AI 小助手',
      },
      {
        pagePath: 'pages/expo/index',
        text: '展区',
      },
      {
        pagePath: 'pages/me/index',
        text: '我的',
      },
    ],
  },
  window: {
    navigationBarTitleText: '活动首页',
    navigationBarBackgroundColor: '#f5f7fb',
    navigationBarTextStyle: 'black',
    backgroundTextStyle: 'light',
  },
}
