// HamEats on AWS Lambda. Next.js's standalone server (server.js, next to this file in the package) runs inside the
// function, and this handler passes each request to it, the way a small web host would:
//
//   visitor -> CloudFront (hameats.app, HTTPS) -> Lambda function URL -> this handler -> Next.js on 127.0.0.1
//
// It also runs the 8 AM alert when EventBridge Scheduler invokes the function with { "hameats": "alerts" }.
// The package is made by scripts/package-lambda.sh; infra/aws/hameats.yaml sets everything up.

import http from "node:http";
import net from "node:net";

const PORT = 3000;

// Everything in Parameter Store under SSM_PREFIX (/hameats) becomes a setting, e.g. /hameats/AUTH_SECRET ->
// AUTH_SECRET. Read once, when the function starts. Unset (local tests), the environment is used as is.
async function loadSettings() {
  const prefix = process.env.SSM_PREFIX;
  if (!prefix) return;
  // The AWS SDK comes with Lambda's Node.js runtime, so it isn't in the package.
  const { SSMClient, GetParametersByPathCommand } = await import("@aws-sdk/client-ssm");
  const ssm = new SSMClient({});
  let NextToken;
  do {
    const page = await ssm.send(new GetParametersByPathCommand({ Path: prefix, WithDecryption: true, NextToken }));
    for (const p of page.Parameters ?? []) {
      const name = p.Name.slice(prefix.length).replace(/^\//, "");
      if (name && !name.includes("/")) process.env[name] = p.Value;
    }
    NextToken = page.NextToken;
  } while (NextToken);
}

const portOpen = () =>
  new Promise((resolve) => {
    const socket = net.connect(PORT, "127.0.0.1", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });

// Starts Next.js once per function instance (a "cold start"), then reuses it.
const ready = (async () => {
  await loadSettings();
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.NODE_ENV = "production";
  // Lambda's files are read-only apart from /tmp; Next.js keeps its page cache in memory instead (next.config.ts).
  await import("./server.js");
  for (let i = 0; i < 200 && !(await portOpen()); i++) await new Promise((r) => setTimeout(r, 25));
})();

// Headers CloudFront adds that Next.js shouldn't see, and hop-by-hop headers that don't belong on a forwarded request.
const DROP = new Set(["x-origin-verify", "connection", "keep-alive", "transfer-encoding", "upgrade"]);

/** Sends one request to Next.js and collects the whole answer, bytes untouched (already compressed if it is). */
function forward({ method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body?.length) req.write(body);
    req.end();
  });
}

const text = (statusCode, message) => ({ statusCode, headers: { "content-type": "text/plain; charset=utf-8" }, body: message });

export async function handler(event) {
  await ready;

  // The morning alert, from EventBridge Scheduler (only AWS can invoke the function this way).
  if (event?.hameats === "alerts") {
    const res = await forward({
      method: "GET",
      path: "/api/cron/alerts",
      headers: { host: "localhost", authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    const result = res.body.toString("utf8");
    console.log("alerts:", res.status, result);
    return { status: res.status, result };
  }

  // A web request through the function URL. Only CloudFront knows ORIGIN_VERIFY, so the function URL itself can't be
  // used to get around it (or to pass a made-up x-forwarded-host).
  const http_ = event?.requestContext?.http;
  if (!http_) return text(400, "Not a web request");
  const verify = process.env.ORIGIN_VERIFY;
  if (verify && event.headers?.["x-origin-verify"] !== verify) return text(403, "Forbidden");

  const headers = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) if (!DROP.has(k)) headers[k] = v;
  // The address the visitor typed (CloudFront puts it in x-forwarded-host), so links, logins and the same-site check
  // all see hameats.app rather than the function URL.
  if (headers["x-forwarded-host"]) headers.host = headers["x-forwarded-host"];
  headers["x-forwarded-proto"] = "https";
  if (event.cookies?.length) headers.cookie = event.cookies.join("; ");
  const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8") : undefined;
  if (body) headers["content-length"] = String(body.length);

  const res = await forward({
    method: http_.method,
    path: event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ""),
    headers,
    body,
  });

  const out = {};
  let cookies = [];
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined || DROP.has(k)) continue;
    if (k === "set-cookie") cookies = Array.isArray(v) ? v : [v];
    else out[k] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return { statusCode: res.status, headers: out, cookies, body: res.body.toString("base64"), isBase64Encoded: true };
}
