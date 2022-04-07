type PeersList = {
  [key: string]: RTCPeerConnection
}

type ChannelsList = {
  [key: string]: RTCDataChannel
}

type Observable<T extends unknown> = {
  subscribe: (subscriber: (payload: T) => void) => void
}

type SignalPayload = {
  from: string
}

type OfferPayload = {
  from: string
  sdp: RTCSessionDescriptionInit
}

type CandidatePayload = {
  from: string
  candidate: RTCIceCandidateInit
}

type PeerConfig = {
  getLocaLPeerId: () => string | Promise<string>
  onConnect: () => {
    onSignal: Observable<SignalPayload>,
    onOffer: Observable<OfferPayload>,
    onAnswer: Observable<OfferPayload>,
    onCandidate: Observable<CandidatePayload>
  }
  sendOffer: (payload: {
    sdp: RTCSessionDescription | null,
    from: string,
    to: string
  }) => void
  sendAnswer: (payload: {
    sdp: RTCSessionDescription | null,
    from: string,
    to: string
  }) => void
  sendCandidate: (payload: {
    candidate: RTCIceCandidate,
    from: string,
    to: string
  }) => void
  onMessage: (event: MessageEvent) => void
  onChannelOpen?: (remotePeerId: string) => void
  onChannelClose?: (remotePeerId: string) => void
  onPeerConnected?: (remotePeerId: string) => void
  onPeerDisconnected?: (remotePeerId: string) => void
}

export default class Peer {
  private _config: PeerConfig
  private _peers: PeersList = {}
  private _channels: ChannelsList = {}
  private _localPeerId: string | undefined = undefined

  constructor(config: PeerConfig) {
    this._config = config
  }

  public sendMessage(message: string, to?: string) {
    const peers = to ? [to] : Object.keys(this._channels)
    peers.forEach(peer => this._channels[peer].send(message))
  }

  public async connect() {
    const { getLocaLPeerId, onConnect } = this._config
    this._localPeerId = await getLocaLPeerId()
    const { onSignal, onOffer, onAnswer, onCandidate } = onConnect()
    onSignal.subscribe(payload => this.createOffer(payload))
    onOffer.subscribe(payload => this.receiveOffer(payload))
    onAnswer.subscribe(payload => this.receiveAnswer(payload))
    onCandidate.subscribe(payload => this.receiveCandidate(payload))
  }

  private async createOffer(data: SignalPayload) {
    const remotePeerId = data.from
    const conn = this.getPeerConnection(remotePeerId)
    const channel = conn.createDataChannel(remotePeerId)
    this.setDataChannelListeners(channel, remotePeerId)
    this._channels[remotePeerId] = channel
    const offer = await conn.createOffer()
    await conn.setLocalDescription(offer)
    this._config.sendOffer({
      sdp: conn.localDescription,
      from: this._localPeerId as string,
      to: remotePeerId
    })
  }

  private async receiveOffer(data: OfferPayload) {
    let remotePeerId = data.from
    let conn = this.getPeerConnection(remotePeerId)
    await conn.setRemoteDescription(new RTCSessionDescription(data.sdp))
    const answer = await conn.createAnswer()
    await conn.setLocalDescription(answer)
    this._config.sendAnswer({
      sdp: conn.localDescription,
      from: this._localPeerId as string,
      to: remotePeerId
    })
  }

  private receiveAnswer(data: OfferPayload) {
    let remotePeerId = data.from
    let conn = this.getPeerConnection(remotePeerId)
    conn.setRemoteDescription(new RTCSessionDescription(data.sdp))
  }

  private receiveCandidate(data: CandidatePayload) {
    let remotePeerId = data.from
    let conn = this.getPeerConnection(remotePeerId)
    if (conn.remoteDescription !== null && data.candidate !== null) {
      conn.addIceCandidate(new RTCIceCandidate(data.candidate))
    }
  }

  private setDataChannelListeners(channel: RTCDataChannel, remotePeerId: string) {
    const { onMessage, onChannelOpen, onChannelClose } = this._config
    if (channel.readyState !== 'closed') {
      this._channels[remotePeerId] = channel
    }
    channel.onmessage = onMessage
    channel.onopen = () => {
      onChannelOpen && onChannelOpen(remotePeerId)
    }
    channel.onclose = () => {
      if (this._peers[remotePeerId]) {
        this._peers[remotePeerId].close()
        delete this._peers[remotePeerId]
      }
      onChannelClose && onChannelClose(remotePeerId)
    }
  }

  private getPeerConnection(remotePeerId: string) {
    if (this._peers[remotePeerId]) {
      return this._peers[remotePeerId]
    }
    const conn = new RTCPeerConnection()
    this._peers[remotePeerId] = conn
    conn.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!conn || !event || !event.candidate) return
      this._config.sendCandidate({
        candidate: event.candidate,
        from: this._localPeerId as string,
        to: remotePeerId
      })
    }
    conn.ondatachannel = (event: RTCDataChannelEvent) => {
      console.log('received data channel', remotePeerId)
      this._channels[remotePeerId] = event.channel
      this.setDataChannelListeners(event.channel, remotePeerId)
    }
    const { onPeerConnected, onPeerDisconnected } = this._config
    conn.oniceconnectionstatechange = (event: Event) => {
      if (conn.iceConnectionState === 'connected' && onPeerConnected) {
        onPeerConnected(remotePeerId)
      }
      if (conn.iceConnectionState === 'disconnected') {
        if (this._peers[remotePeerId]) {
          delete this._peers[remotePeerId]
        }
        onPeerDisconnected && onPeerDisconnected(remotePeerId)
      }
    }
    return conn
  }

}
