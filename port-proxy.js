const http = require("http");

const TARGET_PORT = 3000;
const PROXY_PORT = 3001;

const server = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: "127.0.0.1",
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: clientReq.headers.host || `localhost:${PROXY_PORT}`,
    },
  };

  const proxyReq = http.request(options, (targetRes) => {
    const headers = { ...targetRes.headers };
    if (headers.location && headers.location.includes(`:${TARGET_PORT}`)) {
      headers.location = headers.location.replace(`:${TARGET_PORT}`, `:${PROXY_PORT}`);
    }

    clientRes.writeHead(targetRes.statusCode, headers);
    targetRes.pipe(clientRes, { end: true });
  });

  proxyReq.on("error", (err) => {
    clientRes.writeHead(502, { "Content-Type": "text/plain" });
    clientRes.end(`Dev server on port ${TARGET_PORT} is loading. Please wait a moment and refresh.\n\nError: ${err.message}`);
  });

  clientReq.pipe(proxyReq, { end: true });
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Forwarding http://localhost:${PROXY_PORT} -> http://localhost:${TARGET_PORT}`);
});
