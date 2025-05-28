import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

// Precache all static assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache strategy for the app
registerRoute(
    ({ request, url }) => {
        return url.origin === self.location.origin && !url.pathname.startsWith('/share-target');
    },
    new CacheFirst({
        cacheName: 'localfiles-cache',
    })
);

// Handle share target requests
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Handle share target requests
    if (url.pathname === '/share-target' && event.request.method === 'POST') {
        event.respondWith(handleShareTarget(event.request));
    }
});

async function handleShareTarget(request) {
    try {
        const formData = await request.formData();
        const mediaFiles = formData.getAll('media');

        console.log('Received shared files:', mediaFiles.length);

        if (mediaFiles.length > 0) {
            // Store the shared files temporarily in IndexedDB for the main app to pick up
            await storeSharedFiles(mediaFiles);

            // Redirect to the main app with a flag indicating shared files are available
            return Response.redirect('/?shared=true', 303);
        }

        // If no files, just redirect to main app
        return Response.redirect('/', 303);
    } catch (error) {
        console.error('Error handling shared files:', error);
        return Response.redirect('/?error=share_failed', 303);
    }
}

async function storeSharedFiles(files) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('localfilesDB', 2); // Increment version for new object store

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('mediaFiles')) {
                db.createObjectStore('mediaFiles', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('sharedFiles')) {
                db.createObjectStore('sharedFiles', { keyPath: 'id' });
            }
        };

        request.onsuccess = async (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['sharedFiles'], 'readwrite');
            const store = transaction.objectStore('sharedFiles');

            try {
                // Clear any existing shared files first
                await new Promise((resolve, reject) => {
                    const clearRequest = store.clear();
                    clearRequest.onsuccess = () => resolve();
                    clearRequest.onerror = () => reject(clearRequest.error);
                });

                // Store each shared file
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const fileData = {
                        id: `shared-${Date.now()}-${i}`,
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        file: file,
                        dateShared: new Date().toISOString()
                    };

                    await new Promise((resolve, reject) => {
                        const putRequest = store.put(fileData);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(putRequest.error);
                    });
                }

                resolve();
            } catch (error) {
                reject(error);
            }
        };

        request.onerror = () => reject(request.error);
    });
} 