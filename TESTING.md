# Testing the Share-to-App White Screen Bug Fix

This document explains how to reproduce and verify the fix for the white screen bug in the share-to-app feature.

## The Bug

When sharing media files from other apps to localfiles.stream, the app would display a white screen and become unresponsive. This happened because:

1. The service worker stored shared files in IndexedDB
2. Some shared file objects had missing or invalid `file` properties
3. When `processSharedFiles()` tried to access `sharedFile.file.name`, it threw an error
4. This unhandled error left the app in a broken state with `isLoading` stuck as `true`

## Running the Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/fileValidation.test.js

# Run with verbose output
bun test --verbose
```

## Test Structure

### Pure Validation Functions (`src/fileValidation.js`)

The validation logic has been extracted into pure, testable functions:

- `isValidSharedFile(sharedFile)` - Validates shared file structure
- `isValidFileObject(file)` - Validates file has required properties
- `filterValidSharedFiles(sharedFiles)` - Filters array of shared files
- `validateAndFilterFiles(files)` - Validates and filters file array

### Test Cases (`src/fileValidation.test.js`)

The tests demonstrate:

1. **Invalid shared file detection**: Files missing the `file` property are filtered out
2. **Invalid file object detection**: Files missing `name`, `type`, or `size` are filtered out
3. **Graceful degradation**: Invalid files are skipped without throwing errors
4. **The exact bug scenario**: Shows what happens without validation (throws error) vs with validation (returns empty array safely)

## Reproducing the Bug (Before Fix)

To see what the bug looked like, check out the main branch and try:

```bash
git checkout main

# The old code would do this (pseudocode):
const sharedFiles = [{ id: "shared-1", name: "video.mp4" }]; // Missing 'file' property
const filesToAdd = sharedFiles.map(sf => sf.file); // Returns [undefined]
const firstFile = filesToAdd[0]; // undefined
const name = firstFile.name; // Error: Cannot read property 'name' of undefined
// → White screen, app broken
```

## Verifying the Fix

The fix validates files before processing:

```bash
git checkout claude/fix-share-app-white-screen-G1xQQ

# Run tests to verify
bun test

# All tests should pass ✅
```

### Key Test: "demonstrates the error that causes white screen"

This test in `fileValidation.test.js` shows the exact scenario:

```javascript
test("demonstrates the error that causes white screen", () => {
  const sharedFiles = [
    {
      id: "shared-1",
      name: "video.mp4",
      // Missing file property!
    }
  ];

  // Old code behavior (throws error):
  const filesWithoutValidation = sharedFiles.map(sf => sf.file); // [undefined]
  expect(() => {
    const name = filesWithoutValidation[0].name; // THROWS!
  }).toThrow();

  // New code behavior (safe):
  const filesWithValidation = filterValidSharedFiles(sharedFiles); // []
  expect(filesWithValidation).toEqual([]); // No files, but no error! ✅
});
```

## Integration

The validation functions are now used in `src/main.js`:

1. `processSharedFiles()` uses `filterValidSharedFiles()` to validate shared files from IndexedDB
2. `addFiles()` uses `validateAndFilterFiles()` to validate files before processing

This ensures the bug cannot occur because invalid files are filtered out before any property access.

## Test Coverage

- ✅ Null/undefined file objects
- ✅ Files missing required properties (name, type, size)
- ✅ Shared files missing the file property
- ✅ Mixed arrays with valid and invalid files
- ✅ Edge cases (empty arrays, null inputs)
- ✅ The exact white screen bug scenario

## Benefits of This Approach

1. **Testable without PWA**: Tests run in any JS environment (Bun, Node, etc.)
2. **Pure functions**: No side effects, easy to reason about
3. **Demonstrates the bug**: Tests show exactly what went wrong
4. **Regression prevention**: Tests will catch if the bug is reintroduced
5. **Documentation**: Tests serve as living documentation of the fix
