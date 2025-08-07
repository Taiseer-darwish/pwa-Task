// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ZaqApp: Service Worker registered successfully:', registration);
            })
            .catch(error => {
                console.error('ZaqApp: Service Worker registration failed:', error);
            });
    });
}

// DOM Elements
const postsContainer = document.getElementById('postsContainer');
const offlineMessage = document.getElementById('offlineMessage');

// API Configuration
const API_URL = 'https://jsonplaceholder.typicode.com/posts?_limit=5';

// Network Status
let isOnline = navigator.onLine;

// Update network status
function updateNetworkStatus() {
    isOnline = navigator.onLine;

    if (isOnline) {
        offlineMessage.hidden = true;
    } else {
        offlineMessage.hidden = false;
    }
}

// Event Listeners for network status
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// Initialize network status
updateNetworkStatus();

// Fetch Posts from API
async function fetchPosts() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const posts = await response.json();
        displayPosts(posts);

    } catch (error) {
        console.error('Error fetching posts:', error);

        // Check if we have cached data (use Cache API)
        try {
            const cachedResponse = await caches.match(API_URL);
            if (cachedResponse) {
                const cachedPosts = await cachedResponse.json();
                displayPosts(cachedPosts);
                return;
            }
        } catch (cacheErr) {
            console.warn('Error reading from cache:', cacheErr);
        }

        // show no posts message if nothing found
        displayPosts([]);
    }
}

// Display Posts
function displayPosts(posts) {
    postsContainer.innerHTML = '';

    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = `
            <div class="error-message">
                <h4>No Posts Available</h4>
                <p>No posts were found. Please try again later.</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.innerHTML = `
            <div class="post-title">${escapeHtml(post.title)}</div>
            <div class="post-body">${escapeHtml(post.body)}</div>
            <div class="post-meta">
                <span>User ID: ${post.userId}</span>
                <span class="post-id">#${post.id}</span>
            </div>
        `;
        postsContainer.appendChild(postCard);
    });
}

// Simple escape to avoid injecting HTML (good practice)
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    console.log('ZaqApp: Application initialized');

    // Auto-fetch posts on load
    setTimeout(() => {
        fetchPosts();
    }, 1000);
});

// Auto-refresh when coming back online
window.addEventListener('online', () => {
    setTimeout(() => {
        fetchPosts();
    }, 2000);
});
