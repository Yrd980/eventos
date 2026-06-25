export default {
  pages: [
    'pages/index/index',
    'pages/schedule/index',
    'pages/assistant/index',
    'pages/expo/index',
    'pages/me/index',
  ],
  tabBar: {
    color: '#64748b',
    selectedColor: '#4053e6',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
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
