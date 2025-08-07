const CACHE_NAME = "zaq_myapp_v5";
const API_CACHE_NAME = "zaq_api_cache_v3";

// URLs to cache for the app (include offline fallback)
const urlsToCache = [
    './',
    './index.html',
    './about.html',
    './contact.html',
    './main.css',
    './manifest.json',
    './sw.js',
    './app.js',
    './images/icons/favicon.ico',
    './images/icons/favicon.svg',
    './images/icons/site.webmanifest',
    './offline.html' // fallback page
];

// API endpoints to cache
const API_ENDPOINTS = [
    'https://jsonplaceholder.typicode.com/posts?_limit=5'
];

self.addEventListener('install', (event) => {
    console.log('ZaqApp: Installing service worker...');
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then((cache) => {
                console.log('ZaqApp: Caching app files...');
                return cache.addAll(urlsToCache);
            }),
            caches.open(API_CACHE_NAME).then((cache) => {
                console.log('ZaqApp: Caching API endpoints...');
                // For API we try to cache the request URLs (may fail if CORS prevents)
                return cache.addAll(API_ENDPOINTS).catch(err => {
                    console.warn('ZaqApp: Some API endpoints not cached at install (will be cached on fetch).', err);
                });
            })
        ]).then(() => {
            console.log('ZaqApp: All files cached successfully (install)');
            return self.skipWaiting();
        }).catch((error) => {
            console.error('ZaqApp: Cache failed during install:', error);
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log('ZaqApp: Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            console.log('Found caches:', cacheNames);
            return Promise.all(
                cacheNames.filter((cacheName) => {
                    return cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME;
                }).map((cacheName) => {
                    console.log('ZaqApp: Deleting old cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            console.log('ZaqApp: Activation completed');
            return self.clients.claim();
        }).catch((error) => {
            console.error('ZaqApp: Activation failed:', error);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip chrome/moz extensions
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
        return;
    }

    // Handle API requests (jsonplaceholder)
    if (url.hostname === 'jsonplaceholder.typicode.com') {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Handle navigation requests (HTML pages)
    if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    // Handle app static asset requests (CSS/JS/images/etc.)
    if (url.origin === location.origin) {
        event.respondWith(handleAppRequest(request));
        return;
    }

    // Default: try network first then cache as fallback
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});

async function handleApiRequest(request) {
    try {
        // Network-first
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            const cache = await caches.open(API_CACHE_NAME);
            try {
                await cache.put(request, responseClone);
            } catch (err) {
                // Some responses may not be cacheable due to CORS; ignore
                console.warn('ZaqApp: Unable to cache API response:', err);
            }
            console.log('ZaqApp: API request successful, cached:', request.url);
            return networkResponse;
        }
    } catch (error) {
        console.log('ZaqApp: Network request failed for API, trying cache:', request.url);
    }

    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        console.log('ZaqApp: Serving API response from cache:', request.url);
        return cachedResponse;
    }

    // If no cache, return empty array
    console.log('ZaqApp: No cached API data available for', request.url);
    return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleNavigationRequest(request) {
    // Try to serve the exact page from cache first (so about.html/contact.html work)
    try {
        const cachedPage = await caches.match(request);
        if (cachedPage) {
            return cachedPage;
        }

        // Not in cache: try network, then cache it for future navigations
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            // store copy in cache for offline use
            const responseClone = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            try {
                await cache.put(request, responseClone);
            } catch (err) {
                console.warn('ZaqApp: Could not cache navigation response:', err);
            }
            return networkResponse;
        }
    } catch (err) {
        console.log('ZaqApp: Navigation fetch failed, falling back to offline page:', err);
    }

    // If everything failed, return offline fallback (offline.html)
    const fallback = await caches.match('./offline.html');
    if (fallback) {
        return fallback;
    }

    // As last resort return index.html if offline.html missing
    return caches.match('./index.html');
}

async function handleAppRequest(request) {
    try {
        // Cache-first for static assets
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            // cache the fetched asset for later
            const responseClone = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            try {
                await cache.put(request, responseClone);
            } catch (err) {
                console.warn('ZaqApp: Could not cache asset:', err);
            }
            return networkResponse;
        }
    } catch (error) {
        console.log('ZaqApp: Failed to fetch app content:', error);
    }

    // Fallbacks
    if (request.headers.get && request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
        // navigation fallback handled elsewhere; this is defensive
        return caches.match('./offline.html') || caches.match('./index.html');
    }

    return new Response('Offline - Service worker failed to fetch content', {
        status: 503,
        statusText: 'Service Unavailable'
    });
}

// Handle background sync for offline data
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
        console.log('ZaqApp: Background sync triggered');
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    try {
        const cache = await caches.open(API_CACHE_NAME);
        const requests = API_ENDPOINTS.map(url => new Request(url));

        for (const request of requests) {
            try {
                const response = await fetch(request);
                if (response && response.ok) {
                    await cache.put(request, response.clone());
                    console.log('ZaqApp: Background sync successful for:', request.url);
                }
            } catch (error) {
                console.log('ZaqApp: Background sync failed for:', request.url, error);
            }
        }
    } catch (error) {
        console.error('ZaqApp: Background sync error:', error);
    }
}
