import React, { useContext, useEffect, useMemo } from 'react'
import { Socket } from 'socket.io-client'
import { createWebRTCClient } from '.'
import { Observable } from 'rxjs'

const WebRTCClientContext = React.createContext<ReturnType<typeof createWebRTCClient> | null>(null)

export function useWebRTC(){
  return useContext(WebRTCClientContext)
}

function WebRTCIOClientProvider({ children, socket }: React.PropsWithChildren<{ socket: Socket }>) {
  const webRTCClient = useMemo(() => createWebRTCClient({
    onConnect: () => ({
      onSignal: new Observable(subscriber => { socket.on('signal', subscriber.next) }),
      onOffer: new Observable(subscriber => { socket.on('offer', subscriber.next) }),
      onAnswer: new Observable(subscriber => { socket.on('answer', subscriber.next) }),
      onCandidate: new Observable(subscriber => { socket.on('candidate', subscriber.next) })
    }),
    sendOffer: offer => socket.emit('offer', offer),
    sendAnswer: answer => socket.emit('answer', answer),
    sendCandidate: candidate => socket.emit('candidate', candidate)
  }), [socket])

  useEffect(() => {
    socket.on('connect', () => {
      console.log(`Connected to websocket, id: ${socket.id}`)
      webRTCClient.connect(() => socket.id)
    })
  }, [socket, webRTCClient])

  return <WebRTCClientContext.Provider value={webRTCClient}>
    {children}
  </WebRTCClientContext.Provider>
}

export default WebRTCIOClientProvider
