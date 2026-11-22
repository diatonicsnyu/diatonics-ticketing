/*
 * Door app service worker (spec §3.7, D13): lets /door open with NO signal.
 * Only controls /door. The door page itself is "network first" (fresh when
 * online, the saved copy when offline); the app's files (scripts, styles,
 * fonts, icons) never change once built, so they're served from the saved
 * copy. The guest list and check-ins are handled by the app, not here.
 */
const CACHE = "door-v1";
const PAGE = "/door";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// The app sends the files it loaded, so they're saved even if they were
// downloaded before this worker started.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => typeof u === "string")
          .map((u) => (u === PAGE ? savePage(cache) : cache.add(u).catch(() => {}))),
      ),
    ),
  );
});

async function savePage(cache) {
  try {
    const res = await fetch(PAGE, { credentials: "same-origin", cache: "no-store" });
    if (res.ok && !res.redirected) await cache.put(PAGE, res);
  } catch {
    /* offline: keep the copy we have */
  }
}

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/door-icon") ||
    url.pathname === "/door.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The door page: fresh when online, the saved copy when offline.
  if (req.mode === "navigate" && url.pathname === PAGE) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected) await cache.put(PAGE, res.clone());
          return res;
        } catch {
          return (await cache.match(PAGE)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Built files: the saved copy if we have it, otherwise download and save.
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
