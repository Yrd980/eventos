import React from 'react'
import ReactDOM from 'react-dom/client'
import { Button, Layout, Progress, Tag, Typography } from 'tdesign-react'
import 'tdesign-react/es/style/index.css'
import './styles.css'

const { Header, Aside, Content } = Layout

const navigation = [
  { key: 'overview', label: '总览', value: '24' },
  { key: 'events', label: '活动', value: '12' },
  { key: 'agenda', label: '日程', value: '98%' },
  { key: 'expo', label: '展区', value: '6' },
  { key: 'survey', label: '问卷', value: '3' },
  { key: 'roles', label: '权限', value: '4' },
]

const quickStats = [
  { label: '活动发布', value: '12' },
  { label: '同步率', value: '98.4%' },
  { label: '待审核', value: '7' },
  { label: '运行中', value: '3' },
]

const feed = [
  { title: '主场议程已更新', meta: '10:42 / 内容同步成功' },
  { title: '嘉宾页等待补充头像', meta: '09:18 / 2 项待处理' },
  { title: '问卷文案已进入审核', meta: '08:05 / 版本 v0.9.2' },
]

function App() {
  return (
    <Layout className='app-shell'>
      <Aside className='sidebar'>
        <div className='brand'>
          <div className='brand-mark'>E</div>
          <div>
            <div className='brand-name'>Eventos</div>
            <div className='brand-subtitle'>Control Plane</div>
          </div>
        </div>

        <div className='sidebar-section'>
          <div className='section-label'>Workspace</div>
          <div className='workspace-strip'>
            <div>
              <div className='workspace-title'>运营后台</div>
              <div className='workspace-meta'>赛事内容 · 24 模块</div>
            </div>
            <Tag theme='success' variant='light'>
              Live
            </Tag>
          </div>
        </div>

        <div className='sidebar-section sidebar-section--fill'>
          <div className='section-label'>Navigation</div>
          <nav className='nav-list'>
            {navigation.map((item, index) => (
              <button key={item.key} className={`nav-item${index === 0 ? ' nav-item--active' : ''}`} type='button'>
                <span className='nav-item__label'>{item.label}</span>
                <span className='nav-item__value'>{item.value}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className='sidebar-footer'>
          <div className='status-line'>
            <span>API</span>
            <Tag theme='success' variant='light'>
              Connected
            </Tag>
          </div>
          <div className='status-line'>
            <span>Queue</span>
            <span className='status-muted'>2 jobs</span>
          </div>
        </div>
      </Aside>

      <Layout className='workspace'>
        <Header className='topbar'>
          <div className='topbar-left'>
            <Tag theme='success' variant='light'>
              Ready
            </Tag>
            <Typography.Text className='topbar-kicker'>运营控制台</Typography.Text>
          </div>

          <div className='topbar-actions'>
            <Button variant='text'>命令</Button>
            <Button theme='primary'>新建活动</Button>
          </div>
        </Header>

        <Content className='content'>
          <section className='canvas'>
            <div className='canvas-head'>
              <div>
                <p className='eyebrow'>Codex-like shell</p>
                <Typography.Title level='h1' className='hero-title'>
                  单屏工作台，不堆卡片，只保留必要信息。
                </Typography.Title>
              </div>
              <div className='canvas-action'>
                <div className='canvas-action__label'>发布进度</div>
                <Progress percentage={68} size='small' theme='plump' />
              </div>
            </div>

            <div className='canvas-body'>
              <div className='canvas-column canvas-column--main'>
                <div className='panel panel--split'>
                  <div className='panel-head'>
                    <div>
                      <div className='panel-label'>Overview</div>
                      <div className='panel-title'>实时状态</div>
                    </div>
                    <span className='panel-note'>本周</span>
                  </div>

                  <div className='stats-row'>
                    {quickStats.map((item) => (
                      <div key={item.label} className='stat-block'>
                        <div className='stat-block__label'>{item.label}</div>
                        <div className='stat-block__value'>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='panel panel--split panel--feed'>
                  <div className='panel-head'>
                    <div>
                      <div className='panel-label'>Queue</div>
                      <div className='panel-title'>待处理任务</div>
                    </div>
                    <span className='panel-note'>3 items</span>
                  </div>

                  <div className='feed-list'>
                    {feed.map((item) => (
                      <div key={item.title} className='feed-row'>
                        <div className='feed-row__title'>{item.title}</div>
                        <div className='feed-row__meta'>{item.meta}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className='canvas-column canvas-column--side'>
                <div className='panel panel--stack'>
                  <div className='panel-head'>
                    <div>
                      <div className='panel-label'>Status</div>
                      <div className='panel-title'>系统</div>
                    </div>
                  </div>

                  <div className='status-stack'>
                    <div className='status-item'>
                      <span>活动内容同步</span>
                      <strong>98.4%</strong>
                    </div>
                    <div className='status-item'>
                      <span>审核等待时长</span>
                      <strong>14 min</strong>
                    </div>
                    <div className='status-item'>
                      <span>异常提醒</span>
                      <strong>0</strong>
                    </div>
                  </div>
                </div>

                <div className='panel panel--stack panel--footer'>
                  <div className='panel-head'>
                    <div>
                      <div className='panel-label'>Workspace</div>
                      <div className='panel-title'>当前版本</div>
                    </div>
                  </div>

                  <div className='version-grid'>
                    <div>
                      <div className='version-label'>最近更新</div>
                      <div className='version-value'>15:20</div>
                    </div>
                    <div>
                      <div className='version-label'>版本</div>
                      <div className='version-value'>v0.9.2</div>
                    </div>
                    <div>
                      <div className='version-label'>环境</div>
                      <div className='version-value'>staging</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Content>
      </Layout>
    </Layout>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
