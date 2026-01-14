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
  const errorText = error instanceof Error
    ? `${error.name}: ${error.message}\n\n${error.stack || ''}`
    : String(error);

  const extra = ['context', 'filename', 'lineno', 'colno', 'reason']
    .filter(k => errorInfo[k])
    .map(k => `${k}: ${errorInfo[k]}`)
    .join('\n');

  document.body.innerHTML = `<pre style="background:white;color:black;padding:20px;margin:0;white-space:pre-wrap;height:100%;overflow:auto;font-family:monospace">APPLICATION ERROR\n\n${errorText}\n\n${extra}</pre>`;
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

// Register service worker
let updateServiceWorker = () => Promise.resolve(false);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    updateServiceWorker = registerSW({ immediate: false });
  });
}

const { div, header, main, aside, h1, h2, button, input, label, span, dialog, ul, li, p, a, img } = van.tags;

// App state using IndexedDB
const mediaFiles = van.state([]);
const sidebarOpen = van.state(false);
const isLoading = van.state(true);
const isUpdating = van.state(false);

// Object URL tracking
const objectUrls = new Map();

function createAndTrackObjectURL(file) {
  if (!objectUrls.has(file.id)) {
    objectUrls.set(file.id, URL.createObjectURL(file.file));
  }
  return objectUrls.get(file.id);
}

function releaseObjectURL(fileId) {
  if (objectUrls.has(fileId)) {
    URL.revokeObjectURL(objectUrls.get(fileId));
    objectUrls.delete(fileId);
  }
}

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported"));
    }

    const request = indexedDB.open("localfilesDB", 2);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("mediaFiles")) {
        db.createObjectStore("mediaFiles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("sharedFiles")) {
        db.createObjectStore("sharedFiles", { keyPath: "id" });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      alert(`Database error: ${e.target.error.message}`);
      reject(e.target.error);
    };
  });
}

// IndexedDB Helper
function dbOperation(db, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not initialized"));
    const request = operation(db.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// IndexedDB Blob Storage Helper Functions
const storeFileBlob = (db, fileId, fileBlob) =>
  dbOperation(db, "mediaFiles", "readwrite", store => store.put({ id: fileId, blob: fileBlob }));

const retrieveFileBlob = (db, fileId) =>
  dbOperation(db, "mediaFiles", "readonly", store => store.get(fileId))
    .then(result => result ? result.blob : null);

const removeFileBlob = (db, fileId) =>
  dbOperation(db, "mediaFiles", "readwrite", store => store.delete(fileId));

const clearAllFileBlobs = (db) =>
  dbOperation(db, "mediaFiles", "readwrite", store => store.clear());

// Shared Files Helper Functions
const retrieveSharedFiles = (db) =>
  dbOperation(db, "sharedFiles", "readonly", store => store.getAll())
    .then(result => result || []);

const clearSharedFiles = (db) =>
  dbOperation(db, "sharedFiles", "readwrite", store => store.clear());

// Process shared files and add them to the main media library
async function processSharedFiles() {
  try {
    const db = await initDB();
    const sharedFiles = await retrieveSharedFiles(db);
    if (sharedFiles.length === 0) return false;

    await addFiles(sharedFiles.map(f => f.file));
    await clearSharedFiles(db);
    alert(`${sharedFiles.length} shared file(s) added to your library!`);
    return true;
  } catch (error) {
    console.error("Error processing shared files:", error);
    handleError(error);
    return false;
  }
}

// Local Storage Metadata
const METADATA_KEY = "localFilesAppMetadata";

function getMetadata() {
  try {
    return JSON.parse(localStorage.getItem(METADATA_KEY)) || [];
  } catch { return []; }
}

function saveMetadata(files) {
  try {
    localStorage.setItem(METADATA_KEY, JSON.stringify(files.map(({ file: _, ...meta }) => meta)));
  } catch (e) {
    if (e.name === "QuotaExceededError") alert("Storage full. Clear some browser data.");
  }
}

// Load data
const loadData = async () => {
  try {
    isLoading.val = true;
    const db = await initDB();
    const metadata = getMetadata();

    const files = (await Promise.all(
      metadata.map(async (meta) => {
        const blob = await retrieveFileBlob(db, meta.id);
        return blob ? { ...meta, file: blob } : null;
      })
    )).filter(Boolean);

    mediaFiles.val = files;
    isLoading.val = false;
  } catch (error) {
    console.error("Error loading data:", error);
    handleError(error);
    isLoading.val = false;
  }
};

// Add files
async function addFiles(files) {
  if (!files?.length) return;

  const MAX_SIZE = 1000 * 1024 * 1024;
  const db = await initDB();
  const newFiles = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > MAX_SIZE) {
      alert(`File ${file.name} exceeds 1000MB limit.`);
      continue;
    }

    const newFile = {
      id: `file-${Date.now()}-${i}`,
      name: file.name || `shared-${Date.now()}-${i}`,
      type: file.type,
      size: file.size,
      file,
      progress: 0,
      dateAdded: new Date().toISOString(),
    };

    try {
      await storeFileBlob(db, newFile.id, newFile.file);
      newFiles.push(newFile);
    } catch (error) {
      console.error("Error storing file in IndexedDB:", error);
      handleError(error);
      alert(`Could not save ${newFile.name}`);
    }
  }

  if (newFiles.length > 0) {
    const updatedFiles = [...mediaFiles.val, ...newFiles];
    mediaFiles.val = updatedFiles;
    saveMetadata(updatedFiles);
    sidebarOpen.val = true;
    alert(`${newFiles.length} files uploaded!`);
    setTimeout(() => playFile(newFiles[0]), 500);
  }
}

// Play file
function playFile(file) {
  try {
    const player = document.getElementById("media-player");
    if (!player) {
      console.error("Media player element not found");
      return alert("Media player not found. Refresh the page.");
    }

    document.getElementById("video-container").style.display = "block";
    document.querySelector(".upload-prompt")?.style.setProperty("display", "none");

    const sourceUrl = file.file instanceof File ? createAndTrackObjectURL(file) : file.data;
    if (!sourceUrl) {
      console.error("File has no playable source:", file);
      return alert(`Cannot play ${file.name}: Invalid source`);
    }

    player.src = sourceUrl;
    player.setAttribute("data-current-file-id", file.id);
    if (file.progress) player.currentTime = file.progress;
    if (window.innerWidth < 768) sidebarOpen.val = false;

    setTimeout(() => {
      player.play()
        .then(() => localStorage.setItem("lastPlayedFileId", file.id))
        .catch(console.error);
    }, 300);
  } catch (error) {
    handleError(error);
    alert(`Error playing file: ${error.message}`);
  }
}

// Delete file
async function deleteFile(id) {
  releaseObjectURL(id);
  try {
    const db = await initDB();
    await removeFileBlob(db, id);
  } catch (error) {
    console.error("Error removing file from IndexedDB:", error);
    handleError(error);
  }
  const updatedFiles = mediaFiles.val.filter((f) => f.id !== id);
  mediaFiles.val = updatedFiles;
  saveMetadata(updatedFiles);
}

function deleteAllFiles() {
  document.getElementById("confirm-dialog").showModal();
}

async function confirmDeleteAll() {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
  try {
    await clearAllFileBlobs(await initDB());
  } catch (error) {
    console.error("Error clearing IndexedDB:", error);
    handleError(error);
  }
  saveMetadata([]);
  mediaFiles.val = [];
  document.getElementById("confirm-dialog").close();
}

function cancelDeleteAll() {
  document.getElementById("confirm-dialog").close();
}

async function forceUpdate() {
  isUpdating.val = true;
  await updateServiceWorker(true).catch(e => console.error("Update error:", e));
  window.location.reload();
}

function updateProgress(id, currentTime) {
  const updatedFiles = mediaFiles.val.map((f) => f.id === id ? { ...f, progress: currentTime } : f);
  mediaFiles.val = updatedFiles;
  saveMetadata(updatedFiles);
}

// Components
function Sidebar() {
  return aside(
    { class: van.derive(() => `sidebar ${sidebarOpen.val ? "open" : ""}`) },
    h2({}, "Your Files"),
    van.derive(() => {
      if (isLoading.val) return div({ class: "loading-message" }, "Loading files...");
      if (mediaFiles.val.length === 0) return div({ class: "empty-message" }, "No files added yet");

      return div({},
        ul({}, ...mediaFiles.val.map((file) =>
          li({ class: "file-item" },
            span({ onclick: () => playFile(file), class: "file-name" }, file.name || "Unnamed"),
            button({ class: "delete-btn outline", onclick: (e) => { e.stopPropagation(); deleteFile(file.id); } }, "×"),
          )
        )),
        button({ class: "delete-all-btn outline", onclick: deleteAllFiles }, "Delete All"),
      );
    }),
    div({ class: "sidebar-footer" },
      div({ class: "sidebar-footer-buttons" },
        button({
          class: van.derive(() => `debug-toggle ${debugMode.val ? "active" : ""}`),
          onclick: () => { debugMode.val = !debugMode.val; localStorage.setItem("debugMode", debugMode.val); },
        }, van.derive(() => debugMode.val ? "Debug: ON" : "Debug: OFF")),
        button({
          class: "force-update-btn",
          onclick: forceUpdate,
          disabled: van.derive(() => isUpdating.val),
        }, van.derive(() => isUpdating.val ? "Checking..." : "Check for Updates")),
      ),
      a({ href: `https://github.com/netanel-haber/localfiles.stream/commit/${__COMMIT_SHA__}`, target: "_blank", class: "commit-link" }, __COMMIT_SHA__.substring(0, 7)),
    ),
  );
}

function Header() {
  return header({},
    div(
      button({ class: "hamburger outline", onclick: () => sidebarOpen.val = !sidebarOpen.val }, "☰"),
      h1({}, "localfiles.stream"),
      div({ class: "github-link" },
        a({ href: "https://github.com/netanel-haber/localfiles.stream", target: "_blank" },
          img({ src: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png", alt: "GitHub" }),
        ),
      ),
    ),
    div(
      label({ class: "upload-btn", for: "file-upload" }, "Upload Files"),
      input({
        type: "file", id: "file-upload", accept: "audio/*,video/*", multiple: true, style: "display: none",
        onchange: async (e) => {
          if (e.target.files?.length) await addFiles(e.target.files);
          e.target.value = "";
        },
      }),
    ),
  );
}

function MediaPlayer() {
  return div({ class: "media-container" },
    div({ class: "player-wrapper" },
      div({
        class: "upload-prompt",
        style: van.derive(() => !isLoading.val && mediaFiles.val.length === 0 ? "display: flex" : "display: none"),
      }, "Upload media files to start playing"),
      div({
        class: "loading-indicator",
        style: van.derive(() => isLoading.val ? "display: flex" : "display: none"),
      }, "Loading your media files..."),
      div({ id: "video-container", class: "video-container", style: "display: none;" },
        div({ class: "media-element-container" },
          van.tags.video({
            id: "media-player", controls: true, playsinline: true,
            ontimeupdate: (e) => {
              const fileId = e.target.getAttribute("data-current-file-id");
              if (fileId) updateProgress(fileId, e.target.currentTime);
            },
            onended: (e) => {
              const fileId = e.target.getAttribute("data-current-file-id");
              if (fileId && Number.isFinite(e.target.duration)) updateProgress(fileId, e.target.duration);
              e.target.removeAttribute("data-current-file-id");
            },
            onerror: (e) => {
              alert(`Error playing: ${e.target.error?.message || "Unknown error"}`);
              e.target.removeAttribute("data-current-file-id");
            },
          }),
        ),
      ),
    ),
    ConsoleLogViewer(),
  );
}

function ConfirmDialog() {
  return dialog({ id: "confirm-dialog" },
    div({ class: "dialog-content" },
      h2({}, "Confirm Deletion"),
      p({}, "Are you sure you want to delete all files?"),
      div({ class: "dialog-buttons" },
        button({ onclick: cancelDeleteAll, class: "secondary" }, "Cancel"),
        button({ onclick: confirmDeleteAll }, "Delete All"),
      ),
    ),
  );
}

function ConsoleLogViewer() {
  return div({
    class: van.derive(() => `console-viewer ${debugMode.val ? '' : 'hidden'} ${consoleLogViewerOpen.val ? 'open' : 'closed'}`),
  },
    div({ class: "console-header" },
      van.derive(() => span({}, `Console (${consoleLogs.val.length})`)),
      div({ class: "console-controls" },
        button({ class: "console-btn", onclick: () => consoleLogs.val = [] }, "Clear"),
        button({ class: "console-btn", onclick: () => consoleLogViewerOpen.val = !consoleLogViewerOpen.val },
          van.derive(() => consoleLogViewerOpen.val ? "▼" : "▲")),
      ),
    ),
    van.derive(() => {
      if (!consoleLogViewerOpen.val) return div({ class: "console-logs", style: "display: none;" });
      setTimeout(() => {
        const c = document.getElementById('console-logs-container');
        if (c) c.scrollTop = c.scrollHeight;
      }, 10);
      return div({ class: "console-logs", id: "console-logs-container" },
        ...consoleLogs.val.map((log) =>
          div({ class: `console-entry console-${log.level}` },
            span({ class: "console-timestamp" }, log.timestamp),
            span({ class: "console-level" }, log.level.toUpperCase()),
            van.tags.pre({ class: "console-message" }, log.message),
          )
        )
      );
    })
  );
}

// Main App
function App() {
  return div({ id: "layout" },
    Header(),
    div({ class: "content" }, Sidebar(), main({}, MediaPlayer())),
    ConfirmDialog(),
  );
}

// Initialize
(async () => {
  van.add(document.getElementById("app"), App());
  await loadData();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('shared') === 'true') {
    await processSharedFiles();
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('error') === 'share_failed') {
    const shareError = new Error(urlParams.get('error_msg') || 'Share failed');
    shareError.name = urlParams.get('error_name') || 'ShareError';
    displayError(shareError, { context: 'Android share' });
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    await processSharedFiles();
  }

  // Auto-play last file
  const lastId = localStorage.getItem("lastPlayedFileId");
  const lastFile = lastId && mediaFiles.val.find((f) => f.id === lastId);
  if (lastFile) playFile(lastFile);
})();
