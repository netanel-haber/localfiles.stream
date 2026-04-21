import "./style.css";
import van from "vanjs-core";
import { registerSW } from "virtual:pwa-register";

// Debug mode - when enabled, all errors become unhandled and display on white screen
const debugMode = van.state(
  localStorage.getItem("debugMode") === "true" || window.location.hash === "#debug"
);

// Console log viewer for mobile debugging
const consoleLogViewerOpen = van.state(false);
const consoleLogs = van.state([]);
const MAX_LOGS = 200;

// Intercept console methods to capture logs
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

function addLogEntry(level, args) {
  const timestamp = new Date().toLocaleTimeString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  const newLogs = [...consoleLogs.val, { timestamp, level, message }];

  // Keep only the last MAX_LOGS entries
  if (newLogs.length > MAX_LOGS) {
    newLogs.shift();
  }

  consoleLogs.val = newLogs;
}

['log', 'error', 'warn', 'info'].forEach(method => {
  console[method] = function(...args) {
    originalConsole[method].apply(console, args);
    addLogEntry(method, args);
  };
});

// Listen for log messages from service worker
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SW_LOG') {
    addLogEntry(event.data.level, [event.data.message]);
  }
});

function handleError(error) {
  console.error(error);
  if (debugMode.val) throw error;
}

// Global error display function
function displayError(error, errorInfo = {}) {
  console.error("Displaying error on screen:", error, errorInfo);

  // Create error display container
  const errorContainer = document.createElement("div");
  errorContainer.id = "error-display";
  errorContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: white;
    color: black;
    padding: 20px;
    overflow: auto;
    z-index: 99999;
    font-family: monospace;
  `;

  // Create pre element for error content
  const errorPre = document.createElement("pre");
  errorPre.style.cssText = `
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
  `;

  // Format error information
  let errorText = "APPLICATION ERROR\n\n";

  if (error instanceof Error) {
    errorText += `Name: ${error.name}\n`;
    errorText += `Message: ${error.message}\n\n`;
    if (error.stack) {
      errorText += `Stack Trace:\n${error.stack}\n\n`;
    }
  } else {
    errorText += `Error: ${String(error)}\n\n`;
  }

  // Add additional error info
  if (errorInfo.context) {
    errorText += `Context: ${errorInfo.context}\n`;
  }
  if (errorInfo.filename) {
    errorText += `File: ${errorInfo.filename}\n`;
  }
  if (errorInfo.lineno) {
    errorText += `Line: ${errorInfo.lineno}\n`;
  }
  if (errorInfo.colno) {
    errorText += `Column: ${errorInfo.colno}\n`;
  }
  if (errorInfo.reason) {
    errorText += `\nRejection Reason:\n${errorInfo.reason}\n`;
    if (errorInfo.promise) {
      errorText += `Promise: ${errorInfo.promise}\n`;
    }
  }

  errorPre.textContent = errorText;
  errorContainer.appendChild(errorPre);

  // Clear body and append error
  document.body.innerHTML = "";
  document.body.appendChild(errorContainer);
}

// Global error handler for uncaught exceptions
window.onerror = function(message, filename, lineno, colno, error) {
  displayError(error || new Error(message), {
    filename,
    lineno,
    colno,
    message
  });
  return true; // Prevent default error handling
};

// Global error handler for unhandled promise rejections
window.addEventListener("unhandledrejection", function(event) {
  displayError(
    event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
    {
      reason: event.reason,
      promise: event.promise
    }
  );
  event.preventDefault(); // Prevent default error handling
});

// Register service worker using Vite PWA's registration function
let updateServiceWorker = () => Promise.resolve(false);
if ("serviceWorker" in navigator) {
  // Delay service worker registration until after page load
  window.addEventListener("load", () => {
    // This will correctly handle both dev and prod environments
    updateServiceWorker = registerSW({
      immediate: false, // Changed from true to false for delayed registration
      onRegistered(r) {
        console.log("Service worker has been registered");
      },
      onRegisterError(error) {
        console.error("Service worker registration error", error);
      },
    });
  });
}

const { div, header, main, aside, h1, h2, button, input, label, span, dialog, nav, ul, li, p, a, img } = van.tags;

// App state using IndexedDB
const mediaFiles = van.state([]);
const sidebarOpen = van.state(false);
const isLoading = van.state(true);
const isUpdating = van.state(false);
const currentFileId = van.state(null);

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
}

// Function to release object URLs
function releaseObjectURL(fileId) {
  if (objectUrls.has(fileId)) {
    const url = objectUrls.get(fileId);
    URL.revokeObjectURL(url);
    objectUrls.delete(fileId);
    console.log(`Released blob URL for ${fileId}`);
  }
}

function normalizeMediaFileRecord(file) {
  const progress = Number.isFinite(file.progress) ? file.progress : 0;
  const duration = Number.isFinite(file.duration) ? file.duration : 0;
  const interactedAt = typeof file.interactedAt === "string" ? file.interactedAt : null;
  const isNew = typeof file.isNew === "boolean"
    ? file.isNew
    : !(interactedAt || progress > 0 || duration > 0);

  return {
    ...file,
    progress,
    duration,
    interactedAt,
    isNew,
  };
}

function saveMediaFiles(updatedFiles) {
  mediaFiles.val = updatedFiles;
  saveMetadataToLocalStorage(updatedFiles);
}

function updateMediaFile(id, updater) {
  let didUpdate = false;
  const updatedFiles = mediaFiles.val.map((file) => {
    if (file.id !== id) {
      return file;
    }

    const nextFile = updater(file);
    if (nextFile === file) {
      return file;
    }

    didUpdate = true;
    return normalizeMediaFileRecord(nextFile);
  });

  if (didUpdate) {
    saveMediaFiles(updatedFiles);
  }
}

function markFileInteracted(id) {
  updateMediaFile(id, (file) => {
    if (!file.isNew && file.interactedAt) {
      return file;
    }

    return {
      ...file,
      isNew: false,
      interactedAt: file.interactedAt || new Date().toISOString(),
    };
  });
}

function updateDuration(id, duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }

  updateMediaFile(id, (file) => (
    file.duration === duration ? file : { ...file, duration }
  ));
}

function getCurrentFile() {
  return mediaFiles.val.find((file) => file.id === currentFileId.val) || null;
}

function getFileProgressPercent(file) {
  if (!file || !Number.isFinite(file.duration) || file.duration <= 0) {
    return 0;
  }

  const currentProgress = Number.isFinite(file.progress) ? file.progress : 0;
  return Math.max(0, Math.min(100, (currentProgress / file.duration) * 100));
}

// Initialize IndexedDB
const MAX_FILE_SIZE = 1000 * 1024 * 1024;

function initDB() {
  return new Promise((resolve, reject) => {
    // Check for storage availability first
    if (!("indexedDB" in window)) {
      const error = new Error("IndexedDB is not supported in this browser");
      console.error(error);
      return reject(error);
    }

    // Estimate storage usage and capacity
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const percentUsed = (estimate.usage / estimate.quota) * 100;
        console.log(`Storage usage: ${percentUsed.toFixed(2)}% of available quota`);
        if (percentUsed > 80) {
          console.warn("Storage is nearing capacity! Consider clearing some data.");
        }
      });
    }

    console.log("Opening IndexedDB...");
    const request = indexedDB.open("localfilesDB", 2); // Updated version to match service worker

    request.onupgradeneeded = (event) => {
      console.log("Database upgrade needed, creating object stores");
      const db = event.target.result;
      if (!db.objectStoreNames.contains("mediaFiles")) {
        // Object store will now hold { id: fileId, blob: File }
        db.createObjectStore("mediaFiles", { keyPath: "id" });
        console.log("mediaFiles object store created successfully");
      }
      if (!db.objectStoreNames.contains("sharedFiles")) {
        // Object store for shared files from other apps
        db.createObjectStore("sharedFiles", { keyPath: "id" });
        console.log("sharedFiles object store created successfully");
      }
    };

    request.onsuccess = (event) => {
      console.log("IndexedDB opened successfully");
      const db = event.target.result;

      // Setup error handler for the database
      db.onerror = (event) => {
        console.error("Database error:", event.target.errorCode);
      };

      resolve(db);
    };

    request.onerror = (event) => {
      const error = event.target.error;
      console.error("IndexedDB error:", error);

      // Check for known error types
      if (error.name === "QuotaExceededError") {
        alert("Storage quota exceeded. Please delete some files before adding more.");
      } else {
        alert(`Database error: ${error.message}`);
      }

      reject(error);
    };
  });
}

// IndexedDB Helper
function dbOperation(db, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error(`Database not initialized`);
      return reject(new Error("Database not initialized"));
    }
    const transaction = db.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function mediaFilesStore(db, mode, operation) {
  return dbOperation(db, "mediaFiles", mode, operation);
}

function sharedFilesStore(db, mode, operation) {
  return dbOperation(db, "sharedFiles", mode, operation);
}

// Process shared files and add them to the main media library
async function processSharedFiles() {
  try {
    const db = await initDB();
    const sharedFiles = await sharedFilesStore(db, "readonly", (store) => store.getAll()).then((result) => result || []);
    if (!sharedFiles.length) {
      return false;
    }

    console.log(`Found ${sharedFiles.length} shared files to process`);
    await addFiles(sharedFiles.map((sharedFile) => sharedFile.file));
    await sharedFilesStore(db, "readwrite", (store) => store.clear());
    alert(`${sharedFiles.length} shared file(s) added to your library!`);
    return true;
  } catch (error) {
    handleError(error);
    return false;
  }
}

// Local Storage Metadata Helper Functions
const LOCAL_STORAGE_METADATA_KEY = "localFilesAppMetadata";

function getMetadataFromLocalStorage() {
  try {
    const metadataJson = localStorage.getItem(LOCAL_STORAGE_METADATA_KEY);
    return metadataJson ? JSON.parse(metadataJson) : [];
  } catch (error) {
    handleError(error);
    return [];
  }
}

function saveMetadataToLocalStorage(metadataArray) {
  try {
    // Ensure we don't store the actual file blob in local storage
    const storableMetadata = metadataArray.map((file) => {
      const { file: blob, ...meta } = file; // eslint-disable-line no-unused-vars
      return meta;
    });
    localStorage.setItem(LOCAL_STORAGE_METADATA_KEY, JSON.stringify(storableMetadata));
  } catch (error) {
    handleError(error);
    if (error.name === "QuotaExceededError") {
      alert("Local Storage quota exceeded. Cannot save file list. Please clear some browser data.");
    }
  }
}

async function loadStoredMediaFile(db, meta) {
  try {
    const fileRecord = await mediaFilesStore(db, "readonly", (store) => store.get(meta.id));
    if (!fileRecord?.blob) {
      console.warn(`Blob not found in IndexedDB for file ID: ${meta.id}. Skipping file.`);
      return null;
    }

    return normalizeMediaFileRecord({ ...meta, file: fileRecord.blob });
  } catch (error) {
    handleError(error);
    return null;
  }
}

function createMediaFileRecord(file, index) {
  const fileId = `file-${Date.now()}-${index}`;
  return normalizeMediaFileRecord({
    id: fileId,
    name: file.name || `shared-file-${Date.now()}-${index}.${file.type.split("/")[1] || "bin"}`,
    type: file.type,
    size: file.size,
    file,
    progress: 0,
    duration: 0,
    isNew: true,
    interactedAt: null,
    dateAdded: new Date().toISOString(),
  });
}

// Load data (Refactored)
const loadData = async () => {
  isLoading.val = true;
  try {
    console.log("Loading data...");
    const db = await initDB();
    const metadataArray = getMetadataFromLocalStorage();
    console.log(`Loaded ${metadataArray.length} metadata entries from Local Storage.`);
    const filesWithBlobs = await Promise.all(metadataArray.map((meta) => loadStoredMediaFile(db, meta)));

    mediaFiles.val = filesWithBlobs.filter(Boolean);
    console.log(`Updated mediaFiles state with ${filesWithBlobs.length} files.`);
    return mediaFiles.val;
  } catch (error) {
    handleError(error);
    return [];
  } finally {
    isLoading.val = false;
  }
};

// Much simpler file handling function (Refactored)
async function addFiles(files) {
  if (!files || files.length === 0) {
    console.error("No files selected");
    return;
  }

  document.body.className = document.body.className.replace("is-uploading", "");
  const newFiles = [];
  const db = await initDB();

  for (const [index, file] of Array.from(files).entries()) {
    const newFile = createMediaFileRecord(file, index);
    console.log(`Processing file ${index + 1}/${files.length}: ${newFile.name}`);
    if (file.size > MAX_FILE_SIZE) {
      alert(`File ${newFile.name} exceeds the 1000MB size limit.`);
      continue;
    }

    try {
      await mediaFilesStore(db, "readwrite", (store) => store.put({ id: newFile.id, blob: newFile.file }));
      console.log(`Blob for ${newFile.name} stored in IndexedDB.`);
      newFiles.push(newFile);
    } catch (error) {
      handleError(error);
      alert(`Could not save file ${newFile.name} due to a storage error.`);
    }
    console.log(`File ${newFile.name} processed successfully`);
  }

  if (newFiles.length > 0) {
    console.log(`Adding ${newFiles.length} files to the library`);
    saveMediaFiles([...mediaFiles.val, ...newFiles]);
    console.log("File metadata saved to Local Storage.");
    sidebarOpen.val = true;
    alert(`${newFiles.length} files uploaded successfully!`);
    setTimeout(() => {
      playFile(newFiles[0], { markInteracted: true });
    }, 500);
  }
}

// Add a dedicated function to play files
function getMediaPlayer() {
  return document.getElementById("media-player");
}

function showPlayerContainer() {
  const videoContainer = document.getElementById("video-container");
  if (videoContainer) {
    videoContainer.style.display = "block";
  }

  const uploadPrompt = document.querySelector(".upload-prompt");
  if (uploadPrompt) {
    uploadPrompt.style.display = "none";
  }
}

function resolvePlayableSource(file) {
  if (file.file && file.file instanceof Blob) {
    return createAndTrackObjectURL(file);
  }
  if (file.data && typeof file.data === "string") {
    return file.data;
  }
  return null;
}

function setLastPlayedFileId(fileId) {
  try {
    if (fileId) {
      localStorage.setItem(LAST_PLAYED_FILE_ID_KEY, fileId);
    } else {
      localStorage.removeItem(LAST_PLAYED_FILE_ID_KEY);
    }
  } catch (error) {
    console.warn("Could not update lastPlayedFileId in Local Storage:", error);
  }
}

function getLastPlayedFileId() {
  try {
    return localStorage.getItem(LAST_PLAYED_FILE_ID_KEY);
  } catch (error) {
    console.warn("Could not read lastPlayedFileId from Local Storage:", error);
    return null;
  }
}

function releaseAllObjectURLs() {
  objectUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });
  objectUrls.clear();
}

function playFile(file, { markInteracted = false } = {}) {
  console.log("Attempting to play file:", file);

  try {
    const player = getMediaPlayer();
    if (!player) {
      console.error("Media player element not found");
      alert("Media player not found. Please refresh the page.");
      return;
    }

    const sourceUrl = resolvePlayableSource(file);
    if (!sourceUrl) {
      console.error("File has no playable source:", file);
      alert(`Cannot play ${file.name || "file"}: Invalid source format`);
      return;
    }

    showPlayerContainer();
    console.log(`Setting player source to: ${sourceUrl}`);
    if (markInteracted) {
      markFileInteracted(file.id);
    }
    currentFileId.val = file.id;
    player.src = sourceUrl;
    player.setAttribute("data-current-file-id", file.id); // Tag player with file ID

    if (typeof file.progress === "number") {
      player.currentTime = file.progress;
    }

    if (window.innerWidth < 768) {
      sidebarOpen.val = false;
    }

    setTimeout(() => {
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`Playing ${file.name || "file"} successfully`);
            setLastPlayedFileId(file.id);
            console.log(`Set lastPlayedFileId to: ${file.id}`);
          })
          .catch(console.error);
      }
    }, 300);
  } catch (error) {
    handleError(error);
    alert(`Error playing file: ${error.message}`);
  }
}

function clearCurrentFileSelection(fileId = currentFileId.val) {
  if (!fileId) {
    return;
  }

  if (currentFileId.val === fileId) {
    currentFileId.val = null;
  }

  const player = getMediaPlayer();
  if (player?.getAttribute("data-current-file-id") === fileId) {
    player.pause();
    player.removeAttribute("data-current-file-id");
    player.removeAttribute("src");
    player.load();
  }

  const videoContainer = document.getElementById("video-container");
  if (videoContainer) {
    videoContainer.style.display = "none";
  }

  if (getLastPlayedFileId() === fileId) {
    setLastPlayedFileId(null);
  }
}

// Make sure to release URLs when files are deleted
async function deleteFile(id) {
  // Made async
  console.log(`Deleting file with ID: ${id}`);

  // Release any object URL for this file
  releaseObjectURL(id);

  // Remove blob from IndexedDB
  try {
    const db = await initDB();
    await mediaFilesStore(db, "readwrite", (store) => store.delete(id));
    console.log(`Blob for file ID ${id} removed from IndexedDB.`);
  } catch (error) {
    handleError(error);
  }

  // Remove from state
  const updatedFiles = mediaFiles.val.filter((file) => file.id !== id);

  if (currentFileId.val === id) {
    clearCurrentFileSelection(id);
  }

  // Update metadata in Local Storage
  saveMediaFiles(updatedFiles);
  console.log("File metadata updated in Local Storage after deletion.");
}

function deleteAllFiles() {
  const confirmDialog = document.getElementById("confirm-dialog");
  confirmDialog.showModal();
}

async function confirmDeleteAll() {
  // Made async
  clearCurrentFileSelection();

  // Release all object URLs
  releaseAllObjectURLs();

  // Clear blobs from IndexedDB
  try {
    const db = await initDB();
    await mediaFilesStore(db, "readwrite", (store) => store.clear());
    console.log("All file blobs cleared from IndexedDB.");
  } catch (error) {
    handleError(error);
    alert("Could not clear all stored file data. Please try again.");
  }

  // Clear metadata from Local Storage
  saveMediaFiles([]);
  console.log("File metadata cleared from Local Storage.");
  document.getElementById("confirm-dialog").close();
}

function cancelDeleteAll() {
  document.getElementById("confirm-dialog").close();
}

async function forceUpdate() {
  isUpdating.val = true;
  console.log("Checking for updates...");

  try {
    // Try to update via service worker API
    await updateServiceWorker(true);

    // Always reload to ensure we get the latest - the SW API doesn't reliably
    // tell us if an update was found
    window.location.reload();
  } catch (error) {
    console.error("Error checking for updates:", error);
    // Reload anyway to try to get latest
    window.location.reload();
  }
}

function updateProgress(id, currentTime) {
  updateMediaFile(id, (file) => ({ ...file, progress: currentTime }));
}

function renderTitleProgress(file, titleClass, rowClass, trackClass, badgeClass = "new-badge") {
  return [
    div(
      { class: rowClass },
      span({ class: titleClass }, file.name || "Unnamed File"),
      file.isNew ? span({ class: badgeClass }, "New") : null,
    ),
    div(
      { class: trackClass, "aria-hidden": "true" },
      span(
        {
          class: "title-progress-fill",
          style: `width: ${getFileProgressPercent(file).toFixed(2)}%`,
        },
      ),
    ),
  ];
}

function playFromSidebar(file) {
  console.log("Clicked on file:", file);
  playFile(file, { markInteracted: true });
}

function renderSidebarItem(file, activeFileId) {
  return li(
    {
      class: `file-item${activeFileId === file.id ? " is-current" : ""}`,
      "data-id": file.id,
    },
    div(
      {
        class: "file-entry",
        role: "button",
        tabindex: 0,
        onclick: () => {
          playFromSidebar(file);
        },
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            playFromSidebar(file);
          }
        },
      },
      ...renderTitleProgress(file, "file-name", "file-title-row", "title-progress-track"),
    ),
    button(
      {
        class: "delete-btn outline",
        onclick: (e) => {
          e.stopPropagation();
          console.log(`Deleting file: ${file.id}`);
          deleteFile(file.id);
        },
      },
      "×",
    ),
  );
}

function withCurrentPlayerFile(handler) {
  return (e) => {
    const fileId = e.target.getAttribute("data-current-file-id");
    if (fileId) {
      handler(fileId, e.target);
    }
  };
}

function clearTrackedPlayerFile(player) {
  player.removeAttribute("data-current-file-id");
}

function Sidebar() {
  return aside(
    {
      class: van.derive(() => `sidebar ${sidebarOpen.val ? "open" : ""}`),
      "aria-label": "File sidebar",
    },
    van.derive(() => {
      const activeFileId = currentFileId.val;

      if (isLoading.val) {
        return div({ class: "loading-message" }, "Loading files...");
      }

      if (mediaFiles.val.length > 0) {
        return div(
          {},
          ul(
            {},
            ...mediaFiles.val.map((file) => renderSidebarItem(file, activeFileId)),
          ),
          button(
            {
              class: "delete-all-btn outline",
              onclick: deleteAllFiles,
            },
            "Delete All",
          ),
        );
      }
      return div({ class: "empty-message" }, "No files added yet");
    }),
    div(
      { class: "sidebar-footer" },
      div(
        { class: "sidebar-footer-buttons" },
        button(
          {
            class: van.derive(() => `debug-toggle ${debugMode.val ? "active" : ""}`),
            onclick: () => {
              debugMode.val = !debugMode.val;
              localStorage.setItem("debugMode", debugMode.val);
            },
          },
          van.derive(() => debugMode.val ? "Debug: ON" : "Debug: OFF"),
        ),
        button(
          {
            class: "force-update-btn",
            onclick: forceUpdate,
            disabled: van.derive(() => isUpdating.val),
          },
          van.derive(() => isUpdating.val ? "Checking..." : "Check for Updates"),
        ),
      ),
      a(
        {
          href: `https://github.com/netanel-haber/localfiles.stream/commit/${__COMMIT_SHA__}`,
          target: "_blank",
          rel: "noopener noreferrer",
          class: "commit-link",
        },
        `${__COMMIT_SHA__.substring(0, 7)}`,
      ),
    ),
  );
}

function Header() {
  return header(
    {},

    div(
      button(
        {
          class: "hamburger outline",
          onclick: () => {
            sidebarOpen.val = !sidebarOpen.val;
          },
        },
        "☰",
      ),
      h1({}, "localfiles.stream"),
      div({ class: "github-link" },
        a(
          { href: "https://github.com/netanel-haber/localfiles.stream", target: "_blank" },
          img({
            src: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            alt: "GitHub",
          }),
        ),
      ),
    ),
    div(
      label({ class: "upload-btn", for: "file-upload" }, "Upload Files"),
      input({
        type: "file",
        id: "file-upload",
        accept: "audio/*,video/*",
        multiple: true,
        style: "display: none",
        onchange: async (e) => {
          try {
            if (e.target.files && e.target.files.length > 0) {
              await addFiles(e.target.files);
              console.log(`Selected ${e.target.files.length} files`);
            } else {
              console.log("No files selected");
            }
            e.target.value = ""; // Reset input to allow selecting the same file again
          } catch (error) {
            handleError(error);
            alert("Failed to process selected files. Please try again.");
          }
        },
      }),
    ),
  );
}

function MediaPlayer() {
  return div(
    { class: "media-container" },
    div(
      { class: "player-wrapper" },
      van.derive(() => {
        const currentFile = getCurrentFile();
        if (!currentFile) {
          return null;
        }

        return div(
          { class: "current-media-header" },
          ...renderTitleProgress(
            currentFile,
            "current-media-title",
            "current-media-title-row",
            "title-progress-track current-title-progress",
            "new-badge current-media-badge",
          ),
        );
      }),
      div(
        {
          class: "upload-prompt",
          style: van.derive(() => {
            const shouldShow = !isLoading.val && mediaFiles.val.length === 0;
            return shouldShow ? "display: flex" : "display: none";
          }),
        },
        "Upload media files to start playing",
      ),
      div(
        {
          class: "loading-indicator",
          style: van.derive(() => (isLoading.val ? "display: flex" : "display: none")),
        },
        "Loading your media files...",
      ),
      div(
        {
          id: "video-container",
          class: "video-container",
          style: "display: none;", // Initially hidden, will be shown when playing
        },
        div(
          { class: "media-element-container" },
          // Using a video element that can also play audio
          van.tags.video({
            id: "media-player",
            controls: true,
            preload: "auto",
            controlsList: "nodownload",
            playsinline: true,
            onloadedmetadata: withCurrentPlayerFile((fileId, player) => {
              updateDuration(fileId, player.duration);
            }),
            ondurationchange: withCurrentPlayerFile((fileId, player) => {
              updateDuration(fileId, player.duration);
            }),
            ontimeupdate: withCurrentPlayerFile((fileId, player) => {
              updateProgress(fileId, player.currentTime);
            }),
            onplay: withCurrentPlayerFile((fileId) => {
              console.log("Media started playing. File ID:", fileId);
            }),
            onended: withCurrentPlayerFile((fileId, player) => {
              console.log("Media ended. Saving final progress.");
              if (player.duration && Number.isFinite(player.duration)) {
                updateProgress(fileId, player.duration);
              }
              clearTrackedPlayerFile(player);
            }),
            onerror: (e) => {
              console.error("Media player error:", e.target.error);
              alert(`Error playing media: ${e.target.error ? e.target.error.message : "Unknown error"}`);
              const fileId = e.target.getAttribute("data-current-file-id");
              if (fileId && currentFileId.val === fileId) {
                currentFileId.val = null;
              }
              clearTrackedPlayerFile(e.target);
            },
          }),
        ),
      ),
    ),
    ConsoleLogViewer(),
  );
}

function ConfirmDialog() {
  return dialog(
    { id: "confirm-dialog" },
    div(
      { class: "dialog-content" },
      h2({}, "Confirm Deletion"),
      p({}, "Are you sure you want to delete all files?"),
      div(
        { class: "dialog-buttons" },
        button({ onclick: cancelDeleteAll, class: "secondary" }, "Cancel"),
        button({ onclick: confirmDeleteAll }, "Delete All"),
      ),
    ),
  );
}

function ConsoleLogViewer() {
  // Use a stable container that's always rendered, with CSS controlling visibility
  return div(
    {
      class: van.derive(() => {
        const classes = ['console-viewer'];
        if (!debugMode.val) classes.push('hidden');
        if (consoleLogViewerOpen.val) classes.push('open');
        else classes.push('closed');
        return classes.join(' ');
      }),
    },
    div(
      { class: "console-header" },
      van.derive(() => span({}, `Console (${consoleLogs.val.length})`)),
      div(
        { class: "console-controls" },
        button(
          {
            class: "console-btn",
            onclick: () => {
              consoleLogs.val = [];
            },
          },
          "Clear"
        ),
        button(
          {
            class: "console-btn",
            onclick: () => {
              consoleLogViewerOpen.val = !consoleLogViewerOpen.val;
            },
          },
          van.derive(() => consoleLogViewerOpen.val ? "▼" : "▲")
        ),
      ),
    ),
    van.derive(() => {
      if (!consoleLogViewerOpen.val) return div({ class: "console-logs", style: "display: none;" });

      return div(
        {
          class: "console-logs",
          id: "console-logs-container",
        },
        ...consoleLogs.val.map((log) => {
          return div(
            { class: `console-entry console-${log.level}` },
            span({ class: "console-timestamp" }, log.timestamp),
            span({ class: "console-level" }, log.level.toUpperCase()),
            van.tags.pre({ class: "console-message" }, log.message),
          );
        })
      );
    })
  );
}

// Auto-scroll console to bottom when new logs are added
van.derive(() => {
  if (consoleLogViewerOpen.val && consoleLogs.val.length > 0) {
    setTimeout(() => {
      const container = document.getElementById('console-logs-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 10);
  }
});

// Main App
function App() {
  return div(
    { id: "layout" },
    Header(),
    div({ class: "content" }, Sidebar(), main({}, MediaPlayer())),
    ConfirmDialog(),
  );
}

function clearLaunchParams() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function handleLaunchState() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get("error") === "share_failed") {
    const shareError = new Error(urlParams.get("error_msg") || "Failed to share files");
    shareError.name = urlParams.get("error_name") || "ShareError";
    displayError(shareError, {
      message: "Service worker share handler failed",
      context: "Android share operation"
    });
    clearLaunchParams();
    return;
  }

  await processSharedFiles();
  if (urlParams.get("shared") === "true") {
    clearLaunchParams();
  }
}

function restoreLastPlayedFile() {
  if (mediaFiles.val.length === 0) {
    return;
  }

  const lastPlayedFileId = getLastPlayedFileId();
  if (!lastPlayedFileId) {
    return;
  }

  const fileToPlay = mediaFiles.val.find((f) => f.id === lastPlayedFileId);
  if (fileToPlay) {
    console.log("Attempting to autoplay last played file:", fileToPlay);
    playFile(fileToPlay, { markInteracted: true });
  } else {
    console.log("Last played file ID found, but file not in current media list.");
  }
}

// Initialize app
(async () => {
  try {
    isLoading.val = true;
    console.log("Mounting app...");
    van.add(document.getElementById("app"), App());
    await new Promise((resolve) => setTimeout(resolve, 100));
    await loadData();
    await handleLaunchState();
    console.log(`App initialized with ${mediaFiles.val.length} files`);
    restoreLastPlayedFile();
  } catch (error) {
    handleError(error);
    isLoading.val = false;
  }
})();
