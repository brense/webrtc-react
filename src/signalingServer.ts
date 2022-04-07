#!/usr/bin/env node

import yargs from 'yargs'
import express from 'express'
import http from 'http'
import { Server as WebSocketServer } from 'socket.io'

// parse process args
const { port } = yargs.options({
  'port': {
    alias: 'p',
    type: 'number',
    default: 3000
  }
}).argv

// prepare websocket server
const app = express()
const httpServer = http.createServer(app)
const websocket = new WebSocketServer(httpServer)


// socket listeners (https://socket.io/docs/v3/emit-cheatsheet/)
websocket.on('connection', socket => {
  console.log(`peer #${socket.id} connected`)
  socket.broadcast.emit('signal', socket.id)

  socket.on('offer', payload => socket.broadcast.emit('offer', payload))
  socket.on('answer', payload => socket.broadcast.emit('answer', payload))
  socket.on('candidate', payload => socket.broadcast.emit('candidate', payload))

  socket.on('disconnecting', () => socket.broadcast.emit('disconnecting', socket.id))
  socket.on('disconnect', () => {
    socket.broadcast.emit('disconnected', socket.id)
    console.log(`peer #${socket.id} disconnected`)
  })
})

// start the server
httpServer.listen(port, '0.0.0.0', () => console.log(`🚀 Server ready at ws://localhost:${port}`))
