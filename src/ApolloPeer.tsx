import React from 'react'
import Peer from './Peer'
import { Resolver, ApolloClient } from '@apollo/client'
import gql from 'graphql-tag'
import jwt from 'jsonwebtoken'
import { FieldNode } from 'graphql'
import { FragmentMap } from 'apollo-utilities'

let peer: ApolloPeer

export default class ApolloPeer {
  private _peer: Peer
  private _client: ApolloClient<object>
  private _localPeerId: string
  private _observers: Array<{ type: string, callback: (message: any) => void }> = []
  private _channelOpenObservers: Array<(remotePeerId: string) => void> = []
  constructor(client: ApolloClient<object>) {
    peer = this
    this._client = client
    this._peer = new Peer({
      getLocaLPeerId: this.getLocalPeerId.bind(this),
      onConnect: this.onConnect.bind(this),
      sendOffer: (payload) => {
        client.mutate({ mutation: gql`mutation Offer($payload: OfferInput!){ offer(payload: $payload){ success }}`, variables: { payload } })
      },
      sendAnswer: (payload) => {
        client.mutate({ mutation: gql`mutation Answer($payload: OfferInput!){ answer(payload: $payload){ success }}`, variables: { payload } })
      },
      sendCandidate: (payload) => {
        client.mutate({ mutation: gql`mutation Candidate($payload: CandidateInput!){ candidate(payload: $payload){ success }}`, variables: { payload } })
      },
      onPeerConnected: (remotePeerId) => console.log('PEER CONNECTED', remotePeerId),
      onPeerDisconnected: (remotePeerId) => console.log('PEER DISCONNECTED', remotePeerId),
      onChannelOpen: (remotePeerId: string) => {
        this._channelOpenObservers.forEach(cb => cb(remotePeerId))
      },
      onChannelClose: () => console.log('CHANNEL CLOSE'),
      onMessage: (evt) => {
        const obj = JSON.parse(evt.data)
        if (obj.type) {
          this._observers.filter(({ type }) => type === obj.type).forEach(({ callback }) => callback(obj))
        }
      }
    })
  }

  public connect() {
    this._peer.connect()
  }

  public on(type: string, callback: (message: any) => void) {
    this._observers.push({ type, callback })
  }

  public onChannelOpen(callback: (remotePeerId: string) => void) {
    this._channelOpenObservers.push(callback)
  }

  public static getToken() {
    return localStorage.getItem('unique_token')
  }

  public sendMessage(obj: any, to?: string) {
    this._peer.sendMessage(JSON.stringify(obj), to)
  }

  private onConnect() {
    const onSignal = this._client.subscribe({ query: gql`subscription { newSignal { from }}` })
    const onOffer = this._client.subscribe({ query: gql`subscription newOffer($to: String!) { newOffer(to: $to) { to from sdp }}`, variables: { to: this._localPeerId } })
    const onAnswer = this._client.subscribe({ query: gql`subscription newAnswer($to: String!) { newAnswer(to: $to) { to from sdp }}`, variables: { to: this._localPeerId } })
    const onCandidate = this._client.subscribe({ query: gql`subscription newCandidate($to: String!) { newCandidate(to: $to) { to from candidate }}`, variables: { to: this._localPeerId } })
    return { onSignal, onOffer, onAnswer, onCandidate }
  }

  private async getLocalPeerId() {
    let token = localStorage.getItem('unique_token')
    if (!token) {
      const response = await this._client.query({ query: gql`query { uniqueClientId }` })
      localStorage.setItem('unique_token', response.data.uniqueClientId)
      token = response.data.uniqueClientId
    }
    const decoded = jwt.decode(token as string)
    if (decoded && typeof decoded === 'object') {
      this._localPeerId = decoded.from
      return this._localPeerId
    } else {
      throw Error('Could not decode token')
    }
  }
}

type LocalPeerResolver = (rootValue?: any, args?: any, context?: { peer: ApolloPeer } & any, info?: {
  field: FieldNode
  fragmentMap: FragmentMap
} | undefined) => any

export const createLocaLPeerResolver = (resolver: LocalPeerResolver): Resolver => {
  return (rootValue?: any, args?: any, context?: any, info?: {
    field: FieldNode
    fragmentMap: FragmentMap
  } | undefined) => {
    const result = resolver(rootValue, args, { ...context, peer }, info)
    return result
  }
}

const PeerContext = React.createContext(null as ApolloPeer | null)

export const ApolloPeerProvider: React.FC<{ peer: ApolloPeer }> = ({ peer, children }) => {
  return <PeerContext.Provider value={peer}>{children}</PeerContext.Provider>
}

export function usePeer() {
  const peer = React.useContext(PeerContext)
  if (!peer) {
    throw Error('Did you forget to initialize the peer provider?')
  }
  return peer
}
