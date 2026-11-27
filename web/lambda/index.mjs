// HamEats on AWS Lambda. Next.js's standalone server (server.js, next to this file in the package) runs inside the
// function, and this handler passes each request to it, the way a small web host would:
//
//   visitor -> CloudFront (hameats.app, HTTPS) -> Lambda function URL -> this handler -> Next.js on 127.0.0.1
//
// It also runs the daily alerts (every 15 minutes) when EventBridge Scheduler invokes the function with
// { "hameats": "alerts" }, and the menu refresh with { "hameats": "refresh-menus" } (see refreshMenus below).
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

// How long CloudFront keeps the home page (one copy for everyone; it has nothing personal in it). Long enough to last
// from the evening's last menu refresh to the next morning's: the refreshes clear it sooner (refreshMenus).
const HOME_EDGE_SECONDS = 24 * 3600;

/**
 * The scheduled menu refresh: fetch the menus (app/api/cron/refresh-menus) and, only if dishes came back, clear
 * CloudFront's copy of the home page, so the next visitor gets a page made with the new menus. If the menu API is down
 * the old page stays up. Clearing "/" also clears the in-app (RSC) versions of it.
 */
async function refreshMenus() {
  const res = await forward({
    method: "GET",
    path: "/api/cron/refresh-menus",
    headers: { host: "localhost", authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  let items = 0;
  try {
    items = JSON.parse(res.body.toString("utf8")).items ?? 0;
  } catch {}
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (res.status !== 200 || items <= 0) {
    console.error("menu refresh: no menus (status", res.status, "), keeping the current page:", res.body.toString("utf8"));
    return { refreshed: false, status: res.status, items };
  }
  if (!distributionId) {
    console.error("menu refresh: CLOUDFRONT_DISTRIBUTION_ID isn't set, so the page can't be cleared");
    return { refreshed: false, items };
  }
  const { CloudFrontClient, CreateInvalidationCommand } = await import("@aws-sdk/client-cloudfront");
  const out = await new CloudFrontClient({}).send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: { CallerReference: `menu-refresh-${Date.now()}`, Paths: { Quantity: 1, Items: ["/"] } },
    }),
  );
  console.log("menu refresh:", items, "dishes; cleared the home page:", out.Invalidation?.Id);
  return { refreshed: true, items, invalidation: out.Invalidation?.Id };
}

const text = (statusCode, message) => ({ statusCode, headers: { "content-type": "text/plain; charset=utf-8" }, body: message });

export async function handler(event) {
  await ready;

  // The daily alerts, from EventBridge Scheduler (only AWS can invoke the function this way).
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

  if (event?.hameats === "refresh-menus") return refreshMenus();

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
  // The home page: CloudFront may keep it (until the next menu refresh clears it); browsers re-check it every time.
  // Never when the answer sets a cookie, as that would be someone's own.
  const isHome = event.rawPath === "/" && (http_.method === "GET" || http_.method === "HEAD");
  if (isHome && res.status === 200 && !cookies.length)
    out["cache-control"] = `public, max-age=0, s-maxage=${HOME_EDGE_SECONDS}`;

  return { statusCode: res.status, headers: out, cookies, body: res.body.toString("base64"), isBase64Encoded: true };
}
