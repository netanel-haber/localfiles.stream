/**
 * Share flow simulation for testing
 * Extracts the core logic to be testable without DOM/IndexedDB
 */

/**
 * Simulates what happens when service worker stores shared files
 * This is what public/sw.js does in storeSharedFiles()
 */
export function createSharedFileEntry(file, index) {
  return {
    id: `shared-${Date.now()}-${index}`,
    name: file.name,
    type: file.type,
    size: file.size,
    file: file,
    dateShared: new Date().toISOString()
  };
}

/**
 * Simulates the processSharedFiles flow
 * This is what happens when app opens with ?shared=true
 */
export function processSharedFilesFlow(sharedFiles) {
  // This is what the original code did:
  // const filesToAdd = sharedFiles.map(sharedFile => sharedFile.file);

  const filesToAdd = sharedFiles.map(sharedFile => sharedFile.file);
  return filesToAdd;
}

/**
 * Simulates what addFiles does with the files
 * This is where the bug manifests
 */
export function simulateAddFilesProcessing(files) {
  const results = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      // This is what addFiles does - accesses properties directly
      const fileId = `file-${Date.now()}-${i}`;
      const newFile = {
        id: fileId,
        name: file.name,        // BUG: What if file is undefined?
        type: file.type,        // BUG: What if file is undefined?
        size: file.size,        // BUG: What if file is undefined?
        file: file,
        progress: 0,
        dateAdded: new Date().toISOString(),
      };
      results.push(newFile);
    } catch (error) {
      errors.push({ index: i, error: error.message, file });
    }
  }

  return { results, errors };
}

/**
 * Full end-to-end share flow simulation
 */
export function simulateCompleteShareFlow(files) {
  // Step 1: Service worker stores files
  const sharedFiles = files.map((file, index) => createSharedFileEntry(file, index));

  // Step 2: App retrieves and processes shared files
  const filesToAdd = processSharedFilesFlow(sharedFiles);

  // Step 3: addFiles processes them
  const { results, errors } = simulateAddFilesProcessing(filesToAdd);

  return { sharedFiles, filesToAdd, results, errors };
}
