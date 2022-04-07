const { createProxyMiddleware } = require('http-proxy-middleware')

module.exports = (app) => {
  app.use(
    createProxyMiddleware(['/api'], {
      ws: true,
      changeOrigin: true,
      autoRewrite: true,
      target: 'http://localhost:3000',
    }),
  )
}
