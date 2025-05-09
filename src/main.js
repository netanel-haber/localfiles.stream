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
const createAndTrackObjectURL = (file) => {
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
const releaseObjectURL = (fileId) => {
  if (objectUrls.has(fileId)) {
    const url = objectUrls.get(fileId);
    URL.revokeObjectURL(url);
    objectUrls.delete(fileId);
    console.log(`Released blob URL for ${fileId}`);
  }
};

// Initialize IndexedDB
const initDB = () => {
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

// Load data from IndexedDB
const loadData = async () => {
  try {
    isLoading.val = true;
    console.log('Loading data from IndexedDB...');
    const db = await initDB();
    const transaction = db.transaction('mediaFiles', 'readonly');
    const store = transaction.objectStore('mediaFiles');
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result || [];
        console.log(`Loaded ${result.length} files from IndexedDB`);

        // Force a new array to trigger reactivity
        mediaFiles.val = [...result];
        console.log('Updated mediaFiles state');

        isLoading.val = false;
        resolve(mediaFiles.val);
      };

      request.onerror = (event) => {
        console.error('Error loading data:', event.target.error);
        isLoading.val = false;
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error in loadData:', error);
    isLoading.val = false;
    return [];
  }
};

// Save data to IndexedDB
const saveData = async (data) => {
  try {
    console.log(`Saving ${data.length} items to IndexedDB`);
    const db = await initDB();
    const transaction = db.transaction('mediaFiles', 'readwrite');
    const store = transaction.objectStore('mediaFiles');

    // Clear existing records
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => console.log('Object store cleared successfully');
    clearRequest.onerror = (e) => console.error('Failed to clear store:', e.target.error);

    // Add new records one by one with confirmation
    let successCount = 0;

    for (const item of data) {
      const request = store.add(item);
      request.onsuccess = () => {
        successCount++;
        console.log(`Item ${successCount}/${data.length} saved`);
      };
      request.onerror = (e) => {
        console.error(`Failed to save item ${item.id}:`, e.target.error);
        if (e.target.error.name === 'QuotaExceededError') {
          alert('Storage quota exceeded. Cannot save all files.');
          transaction.abort();
        }
      };
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('All items saved to IndexedDB successfully');
        resolve(true);
      };

      transaction.onerror = (event) => {
        console.error('Error during transaction:', event.target.error);
        reject(event.target.error);
      };

      transaction.onabort = (event) => {
        console.warn('Transaction was aborted:', event);
        reject(new Error('Transaction was aborted'));
      };
    });
  } catch (error) {
    console.error('Error in saveData:', error);
    return false;
  }
};

// Much simpler file handling function
const addFiles = (files) => {
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

  if (!files || files.length === 0) {
    console.error('No files selected');
    return;
  }

  // Force remove any previous loading indicator
  document.body.className = document.body.className.replace('is-uploading', '');

  // Create temporary array
  let newFiles = [];

  // Process each file synchronously
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

    // Add to our array
    newFiles.push(newFile);
    console.log(`File ${file.name} processed successfully`);
  }

  // Update the state with all new files at once
  if (newFiles.length > 0) {
    console.log(`Adding ${newFiles.length} files to the library`);

    // Create a new array to ensure reactivity
    const updatedFiles = [...mediaFiles.val, ...newFiles];
    mediaFiles.val = updatedFiles;

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
const playFile = (file) => {
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
        }).catch(err => {
          console.error('Error playing media:', err);
          // Many browsers require user interaction to play media
          if (confirm(`Click OK to play ${file.name || 'file'}`)) {
            player.play().catch(e => {
              console.error('Second play attempt failed:', e);
              alert('Could not play media. Please try clicking directly on the player.');
            });
          }
        });
      }
    }, 300);

  } catch (error) {
    console.error('Error in playFile function:', error);
    alert(`Error playing file: ${error.message}`);
  }
};

// Make sure to release URLs when files are deleted
const deleteFile = (id) => {
  console.log(`Deleting file with ID: ${id}`);

  // Release any object URL for this file
  releaseObjectURL(id);

  // Remove from state
  mediaFiles.val = mediaFiles.val.filter(file => file.id !== id);
};

const deleteAllFiles = () => {
  const confirmDialog = document.getElementById('confirm-dialog');
  confirmDialog.showModal();
};

const confirmDeleteAll = () => {
  // Release all object URLs
  objectUrls.forEach((url, id) => {
    URL.revokeObjectURL(url);
  });
  objectUrls.clear();

  // Clear files array
  mediaFiles.val = [];
  document.getElementById('confirm-dialog').close();
};

const cancelDeleteAll = () => {
  document.getElementById('confirm-dialog').close();
};

const updateProgress = (id, currentTime) => {
  mediaFiles.val = mediaFiles.val.map(file =>
    file.id === id ? { ...file, progress: currentTime } : file
  );
};

// Components
const Sidebar = () => {
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
        return [
          div({ class: 'files-count' }, `${mediaFiles.val.length} files available`),
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
        ];
      } else {
        return div({ class: 'empty-message' }, "No files added yet");
      }
    })
  );
};

const Header = () => {
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
            onchange: (e) => {
              try {
                if (e.target.files && e.target.files.length > 0) {
                  addFiles(e.target.files);
                  console.log(`Selected ${e.target.files.length} files`);
                } else {
                  console.log('No files selected');
                }
                e.target.value = ''; // Reset input to allow selecting the same file again
              } catch (error) {
                console.error('Error in file input change handler:', error);
                alert('Failed to process selected files. Please try again.');
              }
            }
          })
        )
      )
    )
  );
};

const MediaPlayer = () => {
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
              // Store playback position for resume
              const currentSrc = e.target.src;
              const currentTime = e.target.currentTime;

              // Find the matching file
              const file = mediaFiles.val.find(f => {
                // Check various possible sources
                if (f.file && URL.createObjectURL(f.file) === currentSrc) return true;
                if (f.data === currentSrc) return true;
                return false;
              });

              if (file) {
                updateProgress(file.id, currentTime);
              }
            },
            onplay: (e) => {
              console.log('Media started playing');
            },
            onerror: (e) => {
              console.error('Media player error:', e.target.error);
              alert('Error playing media: ' + (e.target.error ? e.target.error.message : 'Unknown error'));
            }
          })
        )
      )
    )
  );
};

const ConfirmDialog = () => {
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
const App = () => {
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
  // Clear IndexedDB in development mode
  const isDevelopment = import.meta.env.DEV;

  if (isDevelopment) {
    console.log('Development mode detected - clearing all stored files');
    try {
      const db = await initDB();
      const transaction = db.transaction('mediaFiles', 'readwrite');
      const store = transaction.objectStore('mediaFiles');

      const clearRequest = store.clear();
      clearRequest.onsuccess = () => console.log('All files cleared for development mode');
      clearRequest.onerror = (e) => console.error('Failed to clear files in dev mode:', e.target.error);

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });
    } catch (error) {
      console.error('Error clearing files in development mode:', error);
    }
  }

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

// Add a CSS class for the upload indicator
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    body.is-uploading::after {
      content: "Uploading...";
      position: fixed;
      top: 10px;
      right: 10px;
      background: #2196F3;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      z-index: 9999;
      animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    
    .upload-success-message {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #4CAF50;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 9999;
      animation: fadeInOut 3s forwards;
    }
    
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
      10% { opacity: 1; transform: translateX(-50%) translateY(0); }
      90% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
});

// Add manual file refresh function
const refreshFiles = async () => {
  console.log('Manually refreshing files from IndexedDB');
  try {
    const files = await loadData();
    console.log(`Refreshed ${files.length} files from IndexedDB`);

    // Make sure sidebar is updated with files
    if (files.length > 0) {
      sidebarOpen.val = true;
    }

    return files;
  } catch (error) {
    console.error('Error refreshing files:', error);
    return [];
  }
};

// Add debug button to document
document.addEventListener('DOMContentLoaded', () => {
  const debugButton = document.createElement('button');
  debugButton.textContent = 'Debug: Fix Player';
  debugButton.style.position = 'fixed';
  debugButton.style.bottom = '10px';
  debugButton.style.right = '10px';
  debugButton.style.zIndex = '9999';
  debugButton.style.backgroundColor = '#ff4d4d';
  debugButton.style.color = 'white';
  debugButton.style.padding = '8px 16px';
  debugButton.style.borderRadius = '4px';
  debugButton.style.cursor = 'pointer';

  debugButton.addEventListener('click', () => {
    if (mediaFiles.val.length > 0) {
      // Try to play the first file
      playFile(mediaFiles.val[0]);
    } else {
      alert('No files available to play');
    }
  });

  document.body.appendChild(debugButton);
});
