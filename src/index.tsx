import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App'
import reportWebVitals from './reportWebVitals'
import io from 'socket.io-client'
import createWebRTCClient from './WebRTCClient'
import { Observable } from 'rxjs'

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
)

const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80)
const socketUrl = `${window.location.protocol}://${window.location.hostname}:${port}`
const socket = io(socketUrl)

const webRTCClient = createWebRTCClient({
  onConnect: () => ({
    onSignal: new Observable(subscriber => { socket.on('signal', subscriber.next) }),
    onOffer: new Observable(subscriber => { socket.on('offer', subscriber.next) }),
    onAnswer: new Observable(subscriber => { socket.on('answer', subscriber.next) }),
    onCandidate: new Observable(subscriber => { socket.on('candidate', subscriber.next) })
  }),
  sendOffer: offer => socket.emit('offer', offer),
  sendAnswer: answer => socket.emit('answer', answer),
  sendCandidate: candidate => socket.emit('candidate', candidate),
  onMessage: message => console.log(message)
})

socket.on('connect', () => {
  console.log(`Connected to websocket, id: ${socket.id}`)
  webRTCClient.connect(() => socket.id)
})

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
