import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App'
import reportWebVitals from './reportWebVitals'
import io from 'socket.io-client'
import { WebRTCIOClientProvider } from '.'

const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80)
const socketUrl = `${window.location.protocol}://${window.location.hostname}:${port}`
const socket = io(socketUrl)

ReactDOM.render(
  <React.StrictMode>
    <WebRTCIOClientProvider socket={socket}>
      <App />
    </WebRTCIOClientProvider>
  </React.StrictMode>,
  document.getElementById('root')
)

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
