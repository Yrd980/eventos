import { Component, type ReactNode } from 'react'
import './app.css'

type AppProps = {
  children?: ReactNode
}

export default class App extends Component<AppProps> {
  render() {
    return this.props.children
  }
}
