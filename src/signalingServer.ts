import express from 'express'
import http from 'http'
import { Server as WebSocketServer } from 'socket.io'

const app = express()
const httpServer = http.createServer(app)
const websocket = new WebSocketServer(httpServer)

websocket.on('connection', socket => {
  console.log('new socket connected', socket.id)
})
