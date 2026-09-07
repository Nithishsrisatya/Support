import multer from "multer";
import path from "path";
import fs from "fs";

// Upload directory (configurable for persistent production mounts)
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads", "tickets");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/gzip",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: images, PDF, DOC, XLS, TXT, CSV, ZIP`));
  }
};

// Multer upload middleware
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

// Resolve attachment file path safely (prevents path traversal and supports filenames, relative paths, and legacy paths)
export function resolveAttachmentFilePath(storedPath: string): string | null {
  if (!storedPath || typeof storedPath !== "string") return null;

  const baseName = path.basename(storedPath);
  const candidates: string[] = [
    // 1. Direct path if absolute or relative to cwd
    path.isAbsolute(storedPath) ? path.normalize(storedPath) : path.join(process.cwd(), storedPath),
    // 2. uploads/tickets/<basename>
    path.join(process.cwd(), "uploads", "tickets", baseName),
    // 3. uploads/tasks/<basename>
    path.join(process.cwd(), "uploads", "tasks", baseName),
    // 4. uploads/<basename>
    path.join(process.cwd(), "uploads", baseName),
  ];

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    // Security check: candidate must be within the project root directory
    if (!normalized.startsWith(process.cwd())) {
      continue;
    }
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
      return normalized;
    }
  }

  return null;
}

// Get file path
export function getFilePath(filename: string): string {
  return path.join(UPLOAD_DIR, path.basename(filename));
}

// Validate file exists
export function fileExists(filenameOrPath: string): boolean {
  return resolveAttachmentFilePath(filenameOrPath) !== null;
}

// Delete file from disk
export function deleteFile(filenameOrPath: string): void {
  const resolved = resolveAttachmentFilePath(filenameOrPath);
  if (resolved && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}

// Get file stats
export function getFileStats(filenameOrPath: string): { size: number; createdAt: Date } | null {
  const resolved = resolveAttachmentFilePath(filenameOrPath);
  if (!resolved || !fs.existsSync(resolved)) return null;
  
  const stats = fs.statSync(resolved);
  return {
    size: stats.size,
    createdAt: stats.birthtime,
  };
}

export { UPLOAD_DIR };

