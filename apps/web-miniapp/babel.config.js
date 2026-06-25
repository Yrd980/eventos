module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        compiler: 'webpack5',
        'dynamic-import-node': false,
      },
    ],
  ],
}
