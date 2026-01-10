import { describe, test, expect } from "bun:test";
import {
  isValidSharedFile,
  isValidFileObject,
  filterValidSharedFiles,
  validateAndFilterFiles
} from "./fileValidation.js";

describe("File Validation - Share-to-App Bug Tests", () => {
  describe("isValidSharedFile", () => {
    test("should return false for shared file with missing file property (THE BUG)", () => {
      const invalidSharedFile = {
        id: "shared-123",
        name: "video.mp4",
        type: "video/mp4",
        size: 1024,
        dateShared: new Date().toISOString()
        // Missing: file property
      };

      expect(isValidSharedFile(invalidSharedFile)).toBe(false);
    });

    test("should return false for null shared file", () => {
      expect(isValidSharedFile(null)).toBe(false);
    });

    test("should return false for undefined shared file", () => {
      expect(isValidSharedFile(undefined)).toBe(false);
    });

    test("should return true for valid shared file", () => {
      const validSharedFile = {
        id: "shared-123",
        name: "video.mp4",
        type: "video/mp4",
        size: 1024,
        file: new File(["content"], "video.mp4", { type: "video/mp4" }),
        dateShared: new Date().toISOString()
      };

      expect(isValidSharedFile(validSharedFile)).toBe(true);
    });
  });

  describe("isValidFileObject", () => {
    test("should return false for file with missing name property", () => {
      const invalidFile = {
        type: "video/mp4",
        size: 1024
        // Missing: name
      };

      expect(isValidFileObject(invalidFile)).toBe(false);
    });

    test("should return false for file with missing type property", () => {
      const invalidFile = {
        name: "video.mp4",
        size: 1024
        // Missing: type
      };

      expect(isValidFileObject(invalidFile)).toBe(false);
    });

    test("should return false for file with undefined size", () => {
      const invalidFile = {
        name: "video.mp4",
        type: "video/mp4"
        // Missing: size
      };

      expect(isValidFileObject(invalidFile)).toBe(false);
    });

    test("should return false for null file", () => {
      expect(isValidFileObject(null)).toBe(false);
    });

    test("should return false for undefined file", () => {
      expect(isValidFileObject(undefined)).toBe(false);
    });

    test("should return true for valid File object", () => {
      const validFile = new File(["content"], "video.mp4", { type: "video/mp4" });
      expect(isValidFileObject(validFile)).toBe(true);
    });

    test("should return true for valid file-like object", () => {
      const validFile = {
        name: "video.mp4",
        type: "video/mp4",
        size: 1024
      };

      expect(isValidFileObject(validFile)).toBe(true);
    });
  });

  describe("filterValidSharedFiles - Reproducing the White Screen Bug", () => {
    test("should filter out shared files with missing file property without throwing", () => {
      // This simulates what the service worker might store if there's a bug
      const sharedFiles = [
        {
          id: "shared-1",
          name: "video1.mp4",
          type: "video/mp4",
          size: 1024,
          file: new File(["content1"], "video1.mp4", { type: "video/mp4" }),
          dateShared: new Date().toISOString()
        },
        {
          id: "shared-2",
          name: "video2.mp4",
          type: "video/mp4",
          size: 2048,
          // Missing file property - THIS CAUSES THE BUG
          dateShared: new Date().toISOString()
        },
        {
          id: "shared-3",
          name: "video3.mp4",
          type: "video/mp4",
          size: 3072,
          file: new File(["content3"], "video3.mp4", { type: "video/mp4" }),
          dateShared: new Date().toISOString()
        }
      ];

      // Without validation, this would try to access undefined.name, causing errors
      const validFiles = filterValidSharedFiles(sharedFiles);

      // Should only return the 2 valid files
      expect(validFiles).toHaveLength(2);
      expect(validFiles[0].name).toBe("video1.mp4");
      expect(validFiles[1].name).toBe("video3.mp4");
    });

    test("should return empty array for all invalid shared files", () => {
      const invalidSharedFiles = [
        { id: "shared-1", name: "video1.mp4" }, // Missing file
        { id: "shared-2" }, // Missing everything
        null, // Null entry
      ];

      const validFiles = filterValidSharedFiles(invalidSharedFiles);
      expect(validFiles).toHaveLength(0);
    });

    test("should handle empty array", () => {
      const validFiles = filterValidSharedFiles([]);
      expect(validFiles).toHaveLength(0);
    });

    test("should handle null input", () => {
      const validFiles = filterValidSharedFiles(null);
      expect(validFiles).toHaveLength(0);
    });
  });

  describe("validateAndFilterFiles", () => {
    test("should filter out files with missing properties", () => {
      const files = [
        new File(["content1"], "video1.mp4", { type: "video/mp4" }),
        { name: "invalid.mp4" }, // Missing type and size
        new File(["content2"], "video2.mp4", { type: "video/mp4" }),
        null, // Null file
        undefined, // Undefined file
      ];

      const validFiles = validateAndFilterFiles(files);
      expect(validFiles).toHaveLength(2);
      expect(validFiles[0].name).toBe("video1.mp4");
      expect(validFiles[1].name).toBe("video2.mp4");
    });

    test("should handle empty input", () => {
      expect(validateAndFilterFiles([])).toHaveLength(0);
      expect(validateAndFilterFiles(null)).toHaveLength(0);
    });
  });

  describe("Bug Scenario: What would happen WITHOUT validation", () => {
    test("demonstrates the error that causes white screen", () => {
      // This is what the old code did (without validation):
      const sharedFiles = [
        {
          id: "shared-1",
          name: "video.mp4",
          // Missing file property!
        }
      ];

      // Old code: sharedFiles.map(sf => sf.file)
      // This would return [undefined]
      const filesWithoutValidation = sharedFiles.map(sf => sf.file);
      expect(filesWithoutValidation).toEqual([undefined]);

      // Then when addFiles tries to access file.name:
      const firstFile = filesWithoutValidation[0];
      expect(() => {
        // This would cause: Cannot read property 'name' of undefined
        const name = firstFile.name;
        const type = firstFile.type;
        const size = firstFile.size;
      }).toThrow();

      // With validation:
      const filesWithValidation = filterValidSharedFiles(sharedFiles);
      expect(filesWithValidation).toEqual([]); // No files, but no error!
    });
  });
});
