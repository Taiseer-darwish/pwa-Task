const CACHE_NAME = "zaq_myapp_v5";
const API_CACHE_NAME = "zaq_api_cache_v3";

// URLs to cache for the app
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
    './images/icons/site.webmanifest'
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
                return cache.addAll(API_ENDPOINTS);
            })
        ]).then(() => {
            console.log('ZaqApp: All files cached successfully');
            return self.skipWaiting();
        }).catch((error) => {
            console.error('ZaqApp: Cache failed:', error);
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
    const url = new URL(event.request.url);
    
    // Skip chrome extensions
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
        return;
    }

    // Handle API requests
    if (url.hostname === 'jsonplaceholder.typicode.com') {
        event.respondWith(handleApiRequest(event.request));
        return;
    }

    // Handle app requests
    if (url.origin === location.origin) {
        event.respondWith(handleAppRequest(event.request));
        return;
    }
});

async function handleApiRequest(request) {
    try {
        // Try to fetch from network first
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the successful response
            const responseClone = networkResponse.clone();
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, responseClone);
            
            console.log('ZaqApp: API request successful, cached:', request.url);
            return networkResponse;
        }
    } catch (error) {
        console.log('ZaqApp: Network request failed, trying cache:', request.url);
    }

    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        console.log('ZaqApp: Serving API response from cache:', request.url);
        return cachedResponse;
    }

    // If no cache, return empty array
    console.log('ZaqApp: No cached data available');
    return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleAppRequest(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, responseClone);
        }
        return networkResponse;
    } catch (error) {
        console.log('ZaqApp: Failed to fetch app content:', error);
        
        // Return offline page for HTML requests
        if (request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
        }
        
        return new Response('Offline - Service worker failed to fetch content', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
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
                if (response.ok) {
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