type MessageEventCallback = (event: MessageEvent) => void
type ChannelEventCallback = (remotePeerId: string) => void
type ConnectionEventCallback = (remotePeerId: string) => void

type SessionDescription = {
  sdp: RTCSessionDescription | null,
  from: string,
  to: string
}

type IceCandidate = {
  candidate: RTCIceCandidate,
  from: string,
  to: string
}

type ClientConfig = {
  onConnect: () => {
    onSignal: { subscribe: (observer: (response: { data: { newSignal: { from: string } } }) => void) => void },
    onOffer: { subscribe: (observer: (response: { data: { newOffer: { from: string; sdp: RTCSessionDescriptionInit } } }) => void) => void },
    onAnswer: { subscribe: (observer: (response: { data: { newAnswer: { from: string; sdp: RTCSessionDescriptionInit } } }) => void) => void },
    onCandidate: { subscribe: (observer: (response: { data: { newCandidate: { from: string; candidate: RTCIceCandidateInit } } }) => void) => void }
  }
  sendOffer: (payload: SessionDescription) => void
  sendAnswer: (payload: SessionDescription) => void
  sendCandidate: (payload: IceCandidate) => void
  onMessage: MessageEventCallback
  onChannelOpen?: ChannelEventCallback
  onChannelClose?: ChannelEventCallback
  onPeerConnected?: ConnectionEventCallback
  onPeerDisconnected?: ConnectionEventCallback
}

function createClient({ sendCandidate, sendOffer, sendAnswer, onConnect, onPeerConnected, onPeerDisconnected, onMessage, onChannelOpen, onChannelClose }: ClientConfig) {
  let localPeerId: string
  const peers: { [key: string]: RTCPeerConnection } = {}
  const channels: { [key: string]: RTCDataChannel } = {}

  const connect = async (getLocalPeerId: () => string | Promise<string>) => {
    localPeerId = await getLocalPeerId()
    const { onSignal, onOffer, onAnswer, onCandidate } = onConnect()
    onSignal.subscribe(response => createOffer(response.data.newSignal))
    onOffer.subscribe(response => receiveOffer(response.data.newOffer))
    onAnswer.subscribe(response => receiveAnswer(response.data.newAnswer))
    onCandidate.subscribe(response => receiveCandidate(response.data.newCandidate))
  }

  const sendMessage = (message: string, to?: string) => {
    if (to) {
      channels[to].send(message)
    } else {
      Object.keys(channels).forEach(k => {
        if (channels[k].readyState === 'open') {
          channels[k].send(message)
        }
      })
    }
  }

  async function createOffer({ from }: { from: string }) {
    const conn = getPeerConnection(from)
    const channel = conn.createDataChannel(from)
    setDataChannelListeners(channel, from)
    channels[from] = channel
    const offer = await conn.createOffer()
    await conn.setLocalDescription(offer)
    sendOffer({
      sdp: conn.localDescription,
      from: localPeerId,
      to: from
    })
  }

  async function receiveOffer({ from, sdp }: { from: string, sdp: RTCSessionDescriptionInit }) {
    const conn = getPeerConnection(from)
    await conn.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await conn.createAnswer()
    await conn.setLocalDescription(answer)
    sendAnswer({
      sdp: conn.localDescription,
      from: localPeerId,
      to: from
    })
  }

  function receiveAnswer({ from, sdp }: { from: string, sdp: RTCSessionDescriptionInit }) {
    const conn = getPeerConnection(from)
    conn.setRemoteDescription(new RTCSessionDescription(sdp))
  }

  function receiveCandidate({ from, candidate }: { from: string, candidate: RTCIceCandidateInit }) {
    const conn = getPeerConnection(from)
    if (conn.remoteDescription !== null && candidate !== null) {
      conn.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  function setDataChannelListeners(channel: RTCDataChannel, remotePeerId: string) {
    if (channel.readyState !== 'closed') {
      channels[remotePeerId] = channel
    }
    channel.onmessage = onMessage
    channel.onopen = () => {
      onChannelOpen && onChannelOpen(remotePeerId)
    }
    channel.onclose = () => {
      if (peers[remotePeerId]) {
        peers[remotePeerId].close()
        delete peers[remotePeerId]
      }
      onChannelClose && onChannelClose(remotePeerId)
    }
  }

  function getPeerConnection(remotePeerId: string) {
    if (peers[remotePeerId]) {
      return peers[remotePeerId]
    }
    const conn = new RTCPeerConnection()
    peers[remotePeerId] = conn
    conn.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!conn || !event || !event.candidate) return
      sendCandidate({
        candidate: event.candidate,
        from: localPeerId,
        to: remotePeerId
      })
    }
    conn.ondatachannel = (event: RTCDataChannelEvent) => {
      console.log('received data channel', remotePeerId)
      channels[remotePeerId] = event.channel
      setDataChannelListeners(event.channel, remotePeerId)
    }
    conn.oniceconnectionstatechange = (event: Event) => {
      if (conn.iceConnectionState === 'connected' && onPeerConnected) {
        onPeerConnected(remotePeerId)
      }
      if (conn.iceConnectionState === 'disconnected') {
        if (peers[remotePeerId]) {
          delete peers[remotePeerId]
        }
        onPeerDisconnected && onPeerDisconnected(remotePeerId)
      }
    }
    return conn
  }

  return { connect, sendMessage }
}

export default createClient

export type WebRTCClient = ReturnType<typeof createClient>
