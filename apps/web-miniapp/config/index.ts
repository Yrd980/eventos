import { networkInterfaces } from 'node:os'
import type { UserConfigExport } from '@tarojs/cli'

const miniappDevAuthMode = process.env.EVENTOS_MINIAPP_DEV_AUTH_MODE ?? 'true'
const miniappDevAuthToken = process.env.EVENTOS_MINIAPP_DEV_AUTH_TOKEN ?? process.env.EVENTOS_DEV_AUTH_PARTICIPANT_TOKEN ?? 'dev-participant-token'
const miniappApiBaseUrl = process.env.EVENTOS_MINIAPP_API_BASE_URL ?? resolveLocalApiBaseUrl()

function resolveLocalApiBaseUrl() {
  const localIp = Object.entries(networkInterfaces())
    .flatMap(([name, addresses = []]) => addresses.map((address) => ({ name, address })))
    .filter(({ address }) => address.family === 'IPv4' && !address.internal && isPrivateIpv4(address.address))
    .sort((left, right) => scoreNetworkInterface(left.name) - scoreNetworkInterface(right.name))[0]?.address.address

  return localIp ? `http://${localIp}:3000` : 'http://127.0.0.1:3000'
}

function isPrivateIpv4(address: string) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(address)
}

function scoreNetworkInterface(name: string) {
  if (/(virtual|vethernet|wsl|docker|vmware|hyper-v|loopback|meta|tailscale|zerotier)/i.test(name)) return 100
  if (/(wi-fi|wifi|wlan|wireless)/i.test(name)) return 0
  if (/(ethernet|以太网)/i.test(name)) return 1
  return 10
}

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
    __EVENTOS_MINIAPP_API_BASE_URL__: JSON.stringify(miniappApiBaseUrl),
    'process.env.EVENTOS_MINIAPP_API_BASE_URL': JSON.stringify(miniappApiBaseUrl),
    'process.env.EVENTOS_MINIAPP_DEV_AUTH_MODE': JSON.stringify(miniappDevAuthMode),
    'process.env.EVENTOS_MINIAPP_DEV_AUTH_TOKEN': JSON.stringify(miniappDevAuthToken),
  },
  cache: {
    enable: true,
  },
  mini: {
    webpackChain(chain) {
      chain.optimization.minimizers.delete('CssMinimizerPlugin')
    },
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
