import type { UserConfigExport } from '@tarojs/cli'

export default {
  projectName: 'eventos-web-miniapp',
  date: '2026-06-26',
  designWidth: 750,
  deviceRatio: {
    640: 2.34,
    750: 1,
    828: 1.81,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  compiler: {
    type: 'webpack5',
  },
  framework: 'react',
  platform: 'weapp',
  defineConstants: {
    'process.env.EVENTOS_DEV_AUTH_TOKEN': JSON.stringify(process.env.EVENTOS_DEV_AUTH_TOKEN ?? ''),
  },
  cache: {
    enable: true,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
      },
    },
  },
} satisfies UserConfigExport
