// Metro config: adds what the browser build of the local database (expo-sqlite) needs.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// SQLite runs as WebAssembly in the browser.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Dev server only: Expo serves the app's home page ("/") before any Metro middleware runs, so the
// headers below are also added to every response at the HTTP level. Without them on "/", the page
// isn't cross-origin isolated and the browser database can't start.
const http = require('http');
const ISOLATION_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
if (!http.ServerResponse.prototype.__kcIsolation) {
  const writeHead = http.ServerResponse.prototype.writeHead;
  http.ServerResponse.prototype.writeHead = function (...args) {
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
      if (!this.headersSent && !this.hasHeader(name)) this.setHeader(name, value);
    }
    return writeHead.apply(this, args);
  };
  http.ServerResponse.prototype.__kcIsolation = true;
}

// SharedArrayBuffer (used by expo-sqlite on web) needs a cross-origin isolated page.
// "credentialless" still allows the CDN files the form check loads (MediaPipe).
// Production web hosting must send the same two headers.
const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhanced = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return enhanced(req, res, next);
  };
};

module.exports = config;
