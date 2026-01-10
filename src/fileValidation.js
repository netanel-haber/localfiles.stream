/**
 * Pure validation functions for file handling
 * These functions can be tested in any JavaScript environment
 */

/**
 * Validates if a shared file object has the required structure
 * @param {Object} sharedFile - The shared file object to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidSharedFile(sharedFile) {
  if (!sharedFile || typeof sharedFile !== 'object') {
    return false;
  }

  // A valid shared file must have a file property
  if (!sharedFile.file) {
    return false;
  }

  return true;
}

/**
 * Validates if a file object has required properties for processing
 * @param {File|Object} file - The file object to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidFileObject(file) {
  if (!file || typeof file !== 'object') {
    return false;
  }

  // Check for required File properties
  if (!file.name || !file.type || file.size === undefined) {
    return false;
  }

  return true;
}

/**
 * Filters an array of shared files to only include valid entries
 * @param {Array} sharedFiles - Array of shared file objects
 * @returns {Array} - Array of valid file objects ready for processing
 */
export function filterValidSharedFiles(sharedFiles) {
  if (!Array.isArray(sharedFiles)) {
    return [];
  }

  return sharedFiles
    .filter(sharedFile => {
      const isValid = isValidSharedFile(sharedFile);
      if (!isValid) {
        console.warn("Skipping invalid shared file (missing file property):", sharedFile);
      }
      return isValid;
    })
    .map(sharedFile => sharedFile.file)
    .filter(file => {
      const isValid = isValidFileObject(file);
      if (!isValid) {
        console.warn("Skipping file with missing properties:", file);
      }
      return isValid;
    });
}

/**
 * Validates files in an array and filters out invalid ones
 * @param {Array} files - Array of file objects
 * @returns {Array} - Array of valid files with their indices
 */
export function validateAndFilterFiles(files) {
  if (!Array.isArray(files) && !files) {
    return [];
  }

  // Convert FileList or array-like object to array
  const fileArray = Array.from(files || []);

  return fileArray
    .map((file, index) => ({ file, index }))
    .filter(({ file, index }) => {
      if (!isValidFileObject(file)) {
        console.warn(`Skipping invalid file at index ${index}:`, file);
        return false;
      }
      return true;
    })
    .map(({ file }) => file);
}
