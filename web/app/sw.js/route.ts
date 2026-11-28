// Served from a route (not public/) so the build ID can be written in: see the comment at the top of the script.
export const dynamic = "force-static";

const SCRIPT = `// HamEats service worker: makes the app load offline and keeps the last menus on the device.
// VERSION is the deploy's build ID, so every deploy is a new service worker: phones install it,
// and it drops the previous deploy's cached app files. Saved menus (DATA) are kept across deploys.
const VERSION = "__BUILD_ID__";
const SHELL = \`shell-\${VERSION}\`;
const DATA = "data-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png?v=9", "/icons/icon-512.png?v=9"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Try the network; if it fails, use the last cached copy. */
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackUrl ?? request, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackUrl ?? request)) ?? Response.error();
  }
}

/** Use the cached copy if there is one (hashed build files never change). */
async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // One-page app (halls live in the #hash), so every page is "/".
    event.respondWith(networkFirst(request, SHELL, "/"));
  } else if (url.pathname === "/dining_menu.json") {
    event.respondWith(networkFirst(request, DATA));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});

// Alerts. The server sends { title, body, url, tag } (see lib/alerts.ts).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png?v=9",
    badge: "/icons/icon-192.png?v=9",
    data: { url: data.url || "/" },
  };
  // A meal's alert and its correction share a tag: the correction replaces the alert, and renotify makes it ring again.
  if (data.tag) Object.assign(options, { tag: data.tag, renotify: true });
  event.waitUntil(self.registration.showNotification(data.title || "HamEats", options));
});

// Tapping an alert opens HamEats (or brings an open one to the front) on the page it points to: the Menu.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (!open) return self.clients.openWindow(url);
      // navigate() only works on a page this worker controls; any other open page is asked to go there itself.
      return open.focus().then((w) => w.navigate(url).catch(() => w.postMessage({ type: "hameats:open", url })));
    }),
  );
});
`;

export function GET() {
  return new Response(SCRIPT.replace("__BUILD_ID__", process.env.BUILD_ID ?? "dev"), {
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  });
}
