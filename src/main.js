import '@picocss/pico/css/pico.min.css';
import './style.css';
import van from 'vanjs-core';
import { registerSW } from 'virtual:pwa-register';

// Register service worker using Vite PWA's registration function
if ('serviceWorker' in navigator) {
  // Delay service worker registration until after page load
  window.addEventListener('load', () => {
    // This will correctly handle both dev and prod environments
    registerSW({
      immediate: false, // Changed from true to false for delayed registration
      onRegistered(r) {
        console.log('Service worker has been registered');
      },
      onRegisterError(error) {
        console.error('Service worker registration error', error);
      }
    });
  });
}

const { div, header, main, aside, h1, h2, button, input, label, span, dialog, nav, ul, li, p } = van.tags;

// App state using IndexedDB
const mediaFiles = van.state([]);
const sidebarOpen = van.state(false);
const isLoading = van.state(true);

// Object URL tracking for cleanup
const objectUrls = new Map();

// Function to create and track object URLs
function createAndTrackObjectURL(file) {
  // Check if we already have an URL for this file
  if (objectUrls.has(file.id)) {
    return objectUrls.get(file.id);
  }

  // Create a new URL
  const url = URL.createObjectURL(file.file);
  objectUrls.set(file.id, url);
  console.log(`Created and tracked blob URL for ${file.id}: ${url}`);
  return url;
};

// Function to release object URLs
function releaseObjectURL(fileId) {
  if (objectUrls.has(fileId)) {
    const url = objectUrls.get(fileId);
    URL.revokeObjectURL(url);
    objectUrls.delete(fileId);
    console.log(`Released blob URL for ${fileId}`);
  }
};

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    // Check for storage availability first
    if (!('indexedDB' in window)) {
      const error = new Error('IndexedDB is not supported in this browser');
      console.error(error);
      return reject(error);
    }

    // Estimate storage usage and capacity
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const percentUsed = (estimate.usage / estimate.quota) * 100;
        console.log(`Storage usage: ${percentUsed.toFixed(2)}% of available quota`);
        if (percentUsed > 80) {
          console.warn('Storage is nearing capacity! Consider clearing some data.');
        }
      });
    }

    console.log('Opening IndexedDB...');
    const request = indexedDB.open('localfilesDB', 1);

    request.onupgradeneeded = (event) => {
      console.log('Database upgrade needed, creating object store');
      const db = event.target.result;
      if (!db.objectStoreNames.contains('mediaFiles')) {
        // Object store will now hold { id: fileId, blob: File }
        db.createObjectStore('mediaFiles', { keyPath: 'id' });
        console.log('Object store created successfully');
      }
    };

    request.onsuccess = (event) => {
      console.log('IndexedDB opened successfully');
      const db = event.target.result;

      // Setup error handler for the database
      db.onerror = (event) => {
        console.error('Database error:', event.target.errorCode);
      };

      resolve(db);
    };

    request.onerror = (event) => {
      const error = event.target.error;
      console.error('IndexedDB error:', error);

      // Check for known error types
      if (error.name === 'QuotaExceededError') {
        alert('Storage quota exceeded. Please delete some files before adding more.');
      } else {
        alert(`Database error: ${error.message}`);
      }

      reject(error);
    };
  });
};

// IndexedDB Blob Storage Helper Functions
async function storeFileBlob(db, fileId, fileBlob) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error('Database not initialized for storeFileBlob');
      return reject(new Error('Database not initialized'));
    }
    const transaction = db.transaction('mediaFiles', 'readwrite');
    const store = transaction.objectStore('mediaFiles');
    const request = store.put({ id: fileId, blob: fileBlob });
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

async function retrieveFileBlob(db, fileId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error('Database not initialized for retrieveFileBlob');
      return reject(new Error('Database not initialized'));
    }
    const transaction = db.transaction('mediaFiles', 'readonly');
    const store = transaction.objectStore('mediaFiles');
    const request = store.get(fileId);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function removeFileBlob(db, fileId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error('Database not initialized for removeFileBlob');
      return reject(new Error('Database not initialized'));
    }
    const transaction = db.transaction('mediaFiles', 'readwrite');
    const store = transaction.objectStore('mediaFiles');
    const request = store.delete(fileId);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

async function clearAllFileBlobs(db) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error('Database not initialized for clearAllFileBlobs');
      return reject(new Error('Database not initialized'));
    }
    const transaction = db.transaction('mediaFiles', 'readwrite');
    const store = transaction.objectStore('mediaFiles');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// Local Storage Metadata Helper Functions
const LOCAL_STORAGE_METADATA_KEY = 'localFilesAppMetadata';

function getMetadataFromLocalStorage() {
  try {
    const metadataJson = localStorage.getItem(LOCAL_STORAGE_METADATA_KEY);
    return metadataJson ? JSON.parse(metadataJson) : [];
  } catch (error) {
    console.error('Error reading metadata from Local Storage:', error);
    return [];
  }
}

function saveMetadataToLocalStorage(metadataArray) {
  try {
    // Ensure we don't store the actual file blob in local storage
    const storableMetadata = metadataArray.map(file => {
      const { file: blob, ...meta } = file; // eslint-disable-line no-unused-vars
      return meta;
    });
    localStorage.setItem(LOCAL_STORAGE_METADATA_KEY, JSON.stringify(storableMetadata));
  } catch (error) {
    console.error('Error saving metadata to Local Storage:', error);
    if (error.name === 'QuotaExceededError') {
      alert('Local Storage quota exceeded. Cannot save file list. Please clear some browser data.');
    }
  }
}

// Load data (Refactored)
const loadData = async () => {
  try {
    isLoading.val = true;
    console.log('Loading data...');
    const db = await initDB();
    const metadataArray = getMetadataFromLocalStorage();
    console.log(`Loaded ${metadataArray.length} metadata entries from Local Storage.`);

    const filesWithBlobs = [];
    for (const meta of metadataArray) {
      try {
        const blob = await retrieveFileBlob(db, meta.id);
        if (blob) {
          filesWithBlobs.push({ ...meta, file: blob });
        } else {
          console.warn(`Blob not found in IndexedDB for file ID: ${meta.id}. Skipping file.`);
        }
      } catch (error) {
        console.error(`Error loading blob for file ID ${meta.id}:`, error);
      }
    }

    mediaFiles.val = [...filesWithBlobs]; // Force reactivity
    console.log(`Updated mediaFiles state with ${filesWithBlobs.length} files.`);
    isLoading.val = false;
    return mediaFiles.val;

  } catch (error) {
    console.error('Error in loadData:', error);
    isLoading.val = false;
    return [];
  }
};


// Much simpler file handling function (Refactored)
async function addFiles(files) { // Made async
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

  if (!files || files.length === 0) {
    console.error('No files selected');
    return;
  }

  // Force remove any previous loading indicator
  document.body.className = document.body.className.replace('is-uploading', '');

  // Create temporary array
  const newFiles = [];
  const db = await initDB(); // Initialize DB connection once

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);

    // Skip files that are too large
    if (file.size > MAX_FILE_SIZE) {
      alert(`File ${file.name} exceeds the 50MB size limit.`);
      continue;
    }

    // Create a unique ID for this file
    const fileId = `file-${Date.now()}-${i}`;

    // Create the file object with just the essential info
    const newFile = {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      file: file, // Store the actual file object
      progress: 0,
      dateAdded: new Date().toISOString()
    };

    // Store the blob in IndexedDB
    try {
      await storeFileBlob(db, newFile.id, newFile.file);
      console.log(`Blob for ${newFile.name} stored in IndexedDB.`);
      newFiles.push(newFile); // Add to array only if blob storage is successful
    } catch (error) {
      console.error(`Failed to store blob for ${newFile.name}:`, error);
      alert(`Could not save file ${newFile.name} due to a storage error.`);
      continue; // Skip this file
    }
    console.log(`File ${file.name} processed successfully`);
  }

  // Update the state with all new files at once
  if (newFiles.length > 0) {
    console.log(`Adding ${newFiles.length} files to the library`);

    const updatedFiles = [...mediaFiles.val, ...newFiles];
    mediaFiles.val = updatedFiles;

    // Save metadata to Local Storage
    saveMetadataToLocalStorage(updatedFiles);
    console.log('File metadata saved to Local Storage.');

    // Open the sidebar
    sidebarOpen.val = true;

    // Show confirmation
    alert(`${newFiles.length} files uploaded successfully!`);

    // Try to play the first new file
    if (newFiles.length > 0) {
      setTimeout(() => {
        playFile(newFiles[0]);
      }, 500);
    }
  }
};

// Add a dedicated function to play files
function playFile(file) {
  console.log(`Attempting to play file:`, file);

  try {
    const player = document.getElementById('media-player');
    if (!player) {
      console.error('Media player element not found');
      alert('Media player not found. Please refresh the page.');
      return;
    }

    // Make sure video container is visible
    const videoContainer = document.getElementById('video-container');
    if (videoContainer) {
      videoContainer.style.display = 'block';
    }

    // Hide the upload prompt
    const uploadPrompt = document.querySelector('.upload-prompt');
    if (uploadPrompt) {
      uploadPrompt.style.display = 'none';
    }

    // Get or create a URL for the file
    let sourceUrl;
    if (file.file && file.file instanceof File) {
      // Create a tracked object URL
      sourceUrl = createAndTrackObjectURL(file);
    } else if (file.data && typeof file.data === 'string') {
      // Use existing data URL or blob URL
      sourceUrl = file.data;
    } else {
      console.error('File has no playable source:', file);
      alert(`Cannot play ${file.name || 'file'}: Invalid source format`);
      return;
    }

    // Set the source
    console.log(`Setting player source to: ${sourceUrl}`);
    player.src = sourceUrl;
    player.setAttribute('data-current-file-id', file.id); // Tag player with file ID

    // Set the time if available
    if (typeof file.progress === 'number') {
      player.currentTime = file.progress;
    }

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      sidebarOpen.val = false;
    }

    // Force play with a slight delay
    setTimeout(() => {
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log(`Playing ${file.name || 'file'} successfully`);
          // Store this as the last played file
          try {
            localStorage.setItem('lastPlayedFileId', file.id);
            console.log(`Set lastPlayedFileId to: ${file.id}`);
          } catch (e) {
            console.warn('Could not save lastPlayedFileId to Local Storage:', e);
          }
        }).catch(console.error);
      }
    }, 300);

  } catch (error) {
    console.error('Error in playFile function:', error);
    alert(`Error playing file: ${error.message}`);
  }
};

// Make sure to release URLs when files are deleted
async function deleteFile(id) { // Made async
  console.log(`Deleting file with ID: ${id}`);

  // Release any object URL for this file
  releaseObjectURL(id);

  // Remove blob from IndexedDB
  try {
    const db = await initDB();
    await removeFileBlob(db, id);
    console.log(`Blob for file ID ${id} removed from IndexedDB.`);
  } catch (error) {
    console.error(`Failed to remove blob for file ID ${id} from IndexedDB:`, error);
    // Decide if we should proceed with metadata removal or alert user
  }

  // Remove from state
  const updatedFiles = mediaFiles.val.filter(file => file.id !== id);
  mediaFiles.val = updatedFiles;

  // Update metadata in Local Storage
  saveMetadataToLocalStorage(updatedFiles);
  console.log('File metadata updated in Local Storage after deletion.');
};

function deleteAllFiles() {
  const confirmDialog = document.getElementById('confirm-dialog');
  confirmDialog.showModal();
};

async function confirmDeleteAll() { // Made async
  // Release all object URLs
  objectUrls.forEach((url, id) => {
    URL.revokeObjectURL(url);
  });
  objectUrls.clear();

  // Clear blobs from IndexedDB
  try {
    const db = await initDB();
    await clearAllFileBlobs(db);
    console.log('All file blobs cleared from IndexedDB.');
  } catch (error) {
    console.error('Failed to clear all file blobs from IndexedDB:', error);
    alert('Could not clear all stored file data. Please try again.');
    // Potentially do not proceed with clearing metadata if blob clearing fails
  }

  // Clear metadata from Local Storage
  saveMetadataToLocalStorage([]);
  console.log('File metadata cleared from Local Storage.');

  // Clear files array in memory
  mediaFiles.val = [];
  document.getElementById('confirm-dialog').close();
};

function cancelDeleteAll() {
  document.getElementById('confirm-dialog').close();
};

function updateProgress(id, currentTime) {
  const updatedFiles = mediaFiles.val.map(file =>
    file.id === id ? { ...file, progress: currentTime } : file
  );
  mediaFiles.val = updatedFiles;

  // Update metadata in Local Storage
  saveMetadataToLocalStorage(updatedFiles);
};

// Components
function Sidebar() {
  return aside({
    class: van.derive(() => `sidebar ${sidebarOpen.val ? 'open' : ''}`),
    'aria-label': 'File sidebar'
  },
    h2({}, "Your Files"),
    van.derive(() => {
      console.log(`Rendering sidebar with ${mediaFiles.val.length} files`);

      if (isLoading.val) {
        return div({ class: 'loading-message' }, "Loading files...");
      }

      if (mediaFiles.val.length > 0) {
        return div({},
          ul({},
            ...mediaFiles.val.map(file => {
              // Debug the file object
              console.log(`Rendering file in sidebar:`, file);

              // Ensure the file has a name
              const displayName = file.name || 'Unnamed File';

              return li({
                class: 'file-item',
                'data-id': file.id
              },
                span({
                  onclick: () => {
                    console.log(`Clicked on file:`, file);
                    playFile(file);
                  },
                  class: 'file-name'
                }, displayName),
                button({
                  class: 'delete-btn outline',
                  onclick: (e) => {
                    e.stopPropagation();
                    console.log(`Deleting file: ${file.id}`);
                    deleteFile(file.id);
                  }
                }, "×")
              );
            })
          ),
          button({
            class: 'delete-all-btn outline',
            onclick: deleteAllFiles
          }, "Delete All")
        );
      } else {
        return div({ class: 'empty-message' }, "No files added yet");
      }
    })
  );
};

function Header() {
  return header({},
    nav({ class: 'container-fluid' },
      ul(
        li(
          button({
            class: 'hamburger outline',
            onclick: () => { sidebarOpen.val = !sidebarOpen.val; }
          }, "☰")
        ),
        li(
          h1({}, "localfiles.stream")
        )
      ),
      ul(
        li(
          label({ class: 'upload-btn', for: 'file-upload' }, "Upload Files"),
          input({
            type: 'file',
            id: 'file-upload',
            accept: 'audio/*,video/*',
            multiple: true,
            style: 'display: none',
            onchange: async (e) => {
              try {
                if (e.target.files && e.target.files.length > 0) {
                  await addFiles(e.target.files);
                  console.log(`Selected ${e.target.files.length} files`);
                } else {
                  console.log('No files selected');
                }
                e.target.value = ''; // Reset input to allow selecting the same file again
              } catch (error) {
                console.error('Error in file input change handler (or during addFiles):', error);
                alert('Failed to process selected files. Please try again.');
              }
            }
          })
        )
      )
    )
  );
};

function MediaPlayer() {
  return div({ class: 'media-container' },
    div({ class: 'player-wrapper' },
      div({
        class: 'upload-prompt',
        style: van.derive(() => {
          const shouldShow = isLoading.val ? false : (mediaFiles.val.length === 0);
          console.log(`Upload prompt visibility: ${shouldShow ? 'visible' : 'hidden'}`);
          return shouldShow ? 'display: flex' : 'display: none';
        })
      },
        "Upload media files to start playing"
      ),
      div({
        class: 'loading-indicator',
        style: van.derive(() => isLoading.val ? 'display: flex' : 'display: none')
      },
        "Loading your media files..."
      ),
      div({
        id: 'video-container',
        class: 'video-container',
        style: 'display: none;' // Initially hidden, will be shown when playing
      },
        div({ class: 'media-element-container' },
          // Using a video element that can also play audio
          van.tags.video({
            id: 'media-player',
            controls: true,
            preload: 'auto',
            controlsList: 'nodownload',
            crossorigin: 'anonymous',
            playsinline: true,
            ontimeupdate: (e) => {
              const fileId = e.target.getAttribute('data-current-file-id');
              if (fileId) {
                updateProgress(fileId, e.target.currentTime);
              }
            },
            onplay: (e) => {
              console.log('Media started playing. File ID:', e.target.getAttribute('data-current-file-id'));
            },
            onended: (e) => {
              console.log('Media ended. Saving final progress.');
              const fileId = e.target.getAttribute('data-current-file-id');
              if (fileId && e.target.duration && isFinite(e.target.duration)) {
                updateProgress(fileId, e.target.duration); // Save final position as full duration
              }
              e.target.removeAttribute('data-current-file-id'); // Clean up
            },
            onerror: (e) => {
              console.error('Media player error:', e.target.error);
              alert('Error playing media: ' + (e.target.error ? e.target.error.message : 'Unknown error'));
              e.target.removeAttribute('data-current-file-id'); // Clean up
            }
          })
        )
      )
    )
  );
};

function ConfirmDialog() {
  return dialog({ id: 'confirm-dialog' },
    div({ class: 'dialog-content' },
      h2({}, "Confirm Deletion"),
      p({}, "Are you sure you want to delete all files?"),
      div({ class: 'dialog-buttons' },
        button({ onclick: cancelDeleteAll, class: 'secondary' }, "Cancel"),
        button({ onclick: confirmDeleteAll }, "Delete All")
      )
    )
  );
};

// Main App
function App() {
  return div({ id: 'layout' },
    Header(),
    div({ class: 'content' },
      Sidebar(),
      main({},
        MediaPlayer()
      )
    ),
    ConfirmDialog()
  );
};

// Initialize app
(async () => {
  // Clear IndexedDB and LocalStorage in development mode
  const isDevelopment = import.meta.env.DEV;

  try {
    // Force isLoading to be true at start
    isLoading.val = true;

    // Mount the app first
    console.log('Mounting app...');
    van.add(document.getElementById('app'), App());

    // Now load data
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure DOM is ready

    console.log('Loading data...');
    await loadData();

    console.log(`App initialized with ${mediaFiles.val.length} files`);

    // Attempt to play the last played file
    if (mediaFiles.val.length > 0) {
      try {
        const lastPlayedFileId = localStorage.getItem('lastPlayedFileId');
        if (lastPlayedFileId) {
          console.log(`Found lastPlayedFileId: ${lastPlayedFileId}`);
          const fileToPlay = mediaFiles.val.find(f => f.id === lastPlayedFileId);
          if (fileToPlay) {
            console.log('Attempting to autoplay last played file:', fileToPlay);
            playFile(fileToPlay);
          } else {
            console.log('Last played file ID found, but file not in current media list.');
          }
        }
      } catch (e) {
        console.warn('Could not retrieve or play lastPlayedFileId:', e);
      }
    }

    // Make sure UI is updated
    if (mediaFiles.val.length > 0) {
      console.log('Files found, showing sidebar');
      // Force sidebar open on mobile if files exist
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        sidebarOpen.val = true;
      }
    }
  } catch (error) {
    console.error('Error initializing app:', error);
    isLoading.val = false;
  }
})();
