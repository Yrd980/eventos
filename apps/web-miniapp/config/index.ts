import type { UserConfigExport } from '@tarojs/cli'

const miniappDevAuthMode = process.env.EVENTOS_MINIAPP_DEV_AUTH_MODE ?? 'true'
const miniappDevAuthToken = process.env.EVENTOS_MINIAPP_DEV_AUTH_TOKEN ?? process.env.EVENTOS_DEV_AUTH_PARTICIPANT_TOKEN ?? 'dev-participant-token'

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
    'process.env.EVENTOS_MINIAPP_DEV_AUTH_MODE': JSON.stringify(miniappDevAuthMode),
    'process.env.EVENTOS_MINIAPP_DEV_AUTH_TOKEN': JSON.stringify(miniappDevAuthToken),
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
