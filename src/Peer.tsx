import { FetchResult, Observable } from '@apollo/client'

type PeersList = {
  [key: string]: RTCPeerConnection
}

type ChannelsList = {
  [key: string]: RTCDataChannel
}

type PeerConfig = {
  getLocaLPeerId: () => string | Promise<string>
  onConnect: () => {
    onSignal: Observable<FetchResult<any, Record<string, any>, Record<string, any>>>,
    onOffer: Observable<FetchResult<any, Record<string, any>, Record<string, any>>>,
    onAnswer: Observable<FetchResult<any, Record<string, any>, Record<string, any>>>,
    onCandidate: Observable<FetchResult<any, Record<string, any>, Record<string, any>>>
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
  private _localPeerId: string

  constructor(config: PeerConfig) {
    this._config = config
  }

  public sendMessage(message: string, to?: string) {
    if (to) {
      this._channels[to].send(message)
    } else {
      Object.keys(this._channels).forEach(k => {
        if (this._channels[k].readyState === 'open') {
          this._channels[k].send(message)
        }
      })
    }
  }

  public async connect() {
    const { getLocaLPeerId, onConnect } = this._config
    this._localPeerId = await getLocaLPeerId()
    const { onSignal, onOffer, onAnswer, onCandidate } = onConnect()
    onSignal.subscribe(response => this.createOffer(response.data.newSignal))
    onOffer.subscribe(response => this.receiveOffer(response.data.newOffer))
    onAnswer.subscribe(response => this.receiveAnswer(response.data.newAnswer))
    onCandidate.subscribe(response => this.receiveCandidate(response.data.newCandidate))
  }

  private async createOffer(data: { from: string }) {
    const remotePeerId = data.from
    const conn = this.getPeerConnection(remotePeerId)
    const channel = conn.createDataChannel(remotePeerId)
    this.setDataChannelListeners(channel, remotePeerId)
    this._channels[remotePeerId] = channel
    const offer = await conn.createOffer()
    await conn.setLocalDescription(offer)
    this._config.sendOffer({
      sdp: conn.localDescription,
      from: this._localPeerId,
      to: remotePeerId
    })
  }

  private async receiveOffer(data: { from: string, sdp: RTCSessionDescriptionInit }) {
    let remotePeerId = data.from
    let conn = this.getPeerConnection(remotePeerId)
    await conn.setRemoteDescription(new RTCSessionDescription(data.sdp))
    const answer = await conn.createAnswer()
    await conn.setLocalDescription(answer)
    this._config.sendAnswer({
      sdp: conn.localDescription,
      from: this._localPeerId,
      to: remotePeerId
    })
  }

  private receiveAnswer(data: { from: string, sdp: RTCSessionDescriptionInit }) {
    let remotePeerId = data.from
    let conn = this.getPeerConnection(remotePeerId)
    conn.setRemoteDescription(new RTCSessionDescription(data.sdp))
  }

  private receiveCandidate(data: { from: string, candidate: RTCIceCandidateInit }) {
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
        from: this._localPeerId,
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
