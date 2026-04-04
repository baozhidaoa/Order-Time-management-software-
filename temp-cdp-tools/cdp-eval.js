const WebSocket = require("./node_modules/ws");

const [, , wsUrl, encodedExpression] = process.argv;

if (!wsUrl || !encodedExpression) {
  console.error("Usage: node cdp-eval.js <wsUrl> <base64Expression>");
  process.exit(1);
}

const expression = Buffer.from(encodedExpression, "base64").toString("utf8");
const ws = new WebSocket(wsUrl);
const timeout = setTimeout(() => {
  console.error("CDP evaluate timed out");
  process.exit(2);
}, 15000);

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
    }),
  );
});

ws.on("message", (data) => {
  console.log(String(data));
  clearTimeout(timeout);
  ws.close();
});

ws.on("close", () => {
  clearTimeout(timeout);
  process.exit(0);
});

ws.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error?.stack || String(error));
  process.exit(1);
});
