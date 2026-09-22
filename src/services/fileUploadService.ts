import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { pool } from "../db";

// ─────────────────────────────────────────────────────────────────────────────
// 1. UPLOAD DIRECTORY SAFETY & INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

function getSafeUploadDir(): string {
  const customDir = process.env.UPLOAD_DIR?.trim();
  if (customDir) {
    const resolved = path.resolve(customDir);
    const cwd = process.cwd();
    // Guard against dangerous directory configurations (root, cwd, src, node_modules, .git)
    const dangerousPaths = [
      cwd,
      path.join(cwd, "src"),
      path.join(cwd, "dist"),
      path.join(cwd, "node_modules"),
      path.join(cwd, ".git"),
      path.parse(cwd).root,
    ];
    if (!dangerousPaths.includes(resolved)) {
      return resolved;
    }
    console.warn(`⚠️ Configured UPLOAD_DIR ("${customDir}") resolves to an unsafe directory. Falling back to default.`);
  }
  return path.join(process.cwd(), "uploads");
}

const UPLOAD_BASE_DIR = getSafeUploadDir();
const UPLOAD_DIR = path.join(UPLOAD_BASE_DIR, "tickets");
const UPLOAD_TASKS_DIR = path.join(UPLOAD_BASE_DIR, "tasks");

// Ensure upload directories exist safely
for (const dir of [UPLOAD_BASE_DIR, UPLOAD_DIR, UPLOAD_TASKS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MIME & EXTENSION MAPPINGS
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_EXTENSIONS_MAP: Record<string, string[]> = {
  // Images
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  // Documents
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "text/plain", "application/vnd.ms-excel"],
  // Archives
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".gz": ["application/gzip", "application/x-gzip"],
};

export const ALLOWED_MIME_TYPES = Array.from(
  new Set(Object.values(ALLOWED_EXTENSIONS_MAP).flat())
);

// Dangerous extensions that must never be accepted anywhere in filename (prevents double extension attacks)
export const DANGEROUS_EXTENSIONS_REGEX =
  /\.(exe|bat|cmd|sh|bash|ps1|psm1|vbs|js|mjs|cjs|ts|jsx|tsx|php|phtml|php3|php4|php5|py|pyc|rb|pl|cgi|jar|war|ear|msi|dll|scr|com|hta|cpl|vbe|wsf|wsh|html|htm|xhtml|svg|xml|jsp|asp|aspx)(?:$|\.)/i;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXTENSION & FILENAME SANITIZATION
// ─────────────────────────────────────────────────────────────────────────────

export function getSafeExtension(originalName: string): string | null {
  if (!originalName || typeof originalName !== "string") return null;
  const clean = originalName.replace(/[\x00-\x1f\x7f]/g, "").trim();
  const ext = path.extname(clean).toLowerCase();
  if (!ext || !/^\.[a-z0-9]{1,10}$/.test(ext)) {
    return null;
  }
  return ext;
}

export function isDangerousFilename(originalName: string): boolean {
  if (!originalName || typeof originalName !== "string") return true;
  // Null bytes or control chars
  if (/[\x00-\x1f\x7f]/.test(originalName)) return true;
  // Directory traversal markers
  if (/\.\.|\/|\\/.test(originalName)) return true;
  // Dangerous extension anywhere in name (e.g. evil.php.png, test.exe.pdf, app.sh.csv)
  if (DANGEROUS_EXTENSIONS_REGEX.test(originalName)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MULTER STORAGE CONFIGURATION (CRYPTOGRAPHIC STORAGE NAMING)
// ─────────────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    // Generate server-side cryptographically random unique storage name
    const safeExt = getSafeExtension(file.originalname) || ".bin";
    const uniqueName = `att-${crypto.randomUUID()}${safeExt}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // 1. Dangerous extension check
  if (isDangerousFilename(file.originalname)) {
    return cb(new Error(`File "${file.originalname}" has an unsafe or dangerous file type.`));
  }

  // 2. Safe extension check
  const ext = getSafeExtension(file.originalname);
  if (!ext || !ALLOWED_EXTENSIONS_MAP[ext]) {
    return cb(new Error(`File extension "${ext || "unknown"}" is not allowed. Allowed types: images, PDF, DOC, XLS, TXT, CSV, ZIP, GZ`));
  }

  // 3. MIME type consistency check
  const expectedMimes = ALLOWED_EXTENSIONS_MAP[ext];
  const clientMime = (file.mimetype || "").toLowerCase();
  if (!expectedMimes.includes(clientMime)) {
    return cb(new Error(`File type "${file.mimetype}" is not consistent with extension "${ext}".`));
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MULTER MIDDLEWARE WRAPPER (413 / 400 ERROR HANDLING)
// ─────────────────────────────────────────────────────────────────────────────

export function createUploadMiddleware(fieldName: string = "file") {
  const uploadSingle = upload.single(fieldName);
  return (req: any, res: any, next: any) => {
    uploadSingle(req, res, (err: any) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            success: false,
            message: "File size exceeds maximum allowed limit of 10MB.",
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
        });
      }

      // File filter validation errors
      return res.status(400).json({
        success: false,
        message: err.message || "Invalid file upload.",
      });
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MAGIC-BYTE CONTENT SNIFFING & VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export async function validateFileContent(
  filePath: string,
  originalName: string,
  _declaredMime: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, reason: "File does not exist on disk." };
    }

    const ext = getSafeExtension(originalName);
    if (!ext || isDangerousFilename(originalName)) {
      return { valid: false, reason: "Filename contains unsafe or unsupported extension." };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return { valid: false, reason: "Empty file is not allowed." };
    }
    if (stat.size > MAX_FILE_SIZE) {
      return { valid: false, reason: "File size exceeds 10MB limit." };
    }

    // Read first 512 bytes for signature analysis
    const buffer = Buffer.alloc(Math.min(512, stat.size));
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, buffer, 0, buffer.length, 0);
    } finally {
      fs.closeSync(fd);
    }

    // 1. JPEG: FF D8 FF
    if (ext === ".jpg" || ext === ".jpeg") {
      if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        return { valid: false, reason: "File content does not match valid JPEG image signature." };
      }
    }
    // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
    else if (ext === ".png") {
      const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (buffer.length < 8 || !pngMagic.every((b, i) => buffer[i] === b)) {
        return { valid: false, reason: "File content does not match valid PNG image signature." };
      }
    }
    // 3. GIF: GIF87a or GIF89a
    else if (ext === ".gif") {
      const header = buffer.toString("ascii", 0, 6);
      if (header !== "GIF87a" && header !== "GIF89a") {
        return { valid: false, reason: "File content does not match valid GIF image signature." };
      }
    }
    // 4. WebP: RIFF....WEBP
    else if (ext === ".webp") {
      if (
        buffer.length < 12 ||
        buffer.toString("ascii", 0, 4) !== "RIFF" ||
        buffer.toString("ascii", 8, 12) !== "WEBP"
      ) {
        return { valid: false, reason: "File content does not match valid WebP image signature." };
      }
    }
    // 5. PDF: %PDF-
    else if (ext === ".pdf") {
      const header = buffer.toString("ascii", 0, 5);
      if (!header.startsWith("%PDF")) {
        return { valid: false, reason: "File content does not match valid PDF document signature." };
      }
    }
    // 6. ZIP / Office DOCX/XLSX: PK\x03\x04 or PK\x05\x06 or PK\x07\x08
    else if (ext === ".zip" || ext === ".docx" || ext === ".xlsx") {
      if (
        buffer.length < 4 ||
        buffer[0] !== 0x50 ||
        buffer[1] !== 0x4b ||
        ![0x03, 0x05, 0x07].includes(buffer[2])
      ) {
        return { valid: false, reason: "File content does not match valid ZIP or Office archive signature." };
      }
    }
    // 7. GZ: 1F 8B
    else if (ext === ".gz") {
      if (buffer.length < 2 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
        return { valid: false, reason: "File content does not match valid GZIP signature." };
      }
    }
    // 8. Plain text / CSV: Must not contain null bytes and must not contain active HTML/script tags
    else if (ext === ".txt" || ext === ".csv") {
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x00) {
          return { valid: false, reason: "Binary null bytes detected in text file." };
        }
      }
      const textSample = buffer.toString("utf8").toLowerCase();
      if (
        /<script[\s>]/i.test(textSample) ||
        /<\?php/i.test(textSample) ||
        /<html[\s>]/i.test(textSample) ||
        /<iframe[\s>]/i.test(textSample) ||
        /<object[\s>]/i.test(textSample)
      ) {
        return { valid: false, reason: "Active script or HTML tags detected in text file." };
      }
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `Content validation error: ${err.message}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. PATH TRAVERSAL CONTAINMENT & RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

export function resolveAttachmentFilePath(storedPath: string): string | null {
  if (!storedPath || typeof storedPath !== "string") return null;

  // Reject null bytes and URL-encoded traversal
  if (storedPath.includes("\0") || /%2e%2e/i.test(storedPath)) {
    return null;
  }

  const baseName = path.basename(storedPath);

  // Check candidate storage directories within the upload base directory
  const candidateDirs = [
    UPLOAD_DIR,
    UPLOAD_TASKS_DIR,
    UPLOAD_BASE_DIR,
  ];

  for (const dir of candidateDirs) {
    const candidate = path.normalize(path.join(dir, baseName));
    // STRICT SECURITY CHECK: Must be contained strictly within UPLOAD_BASE_DIR
    if (!candidate.startsWith(UPLOAD_BASE_DIR)) {
      continue;
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  // Direct path if already located within UPLOAD_BASE_DIR
  const direct = path.normalize(
    path.isAbsolute(storedPath) ? storedPath : path.join(UPLOAD_BASE_DIR, storedPath)
  );
  if (direct.startsWith(UPLOAD_BASE_DIR) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  return null;
}

export function getFilePath(filename: string): string {
  return path.join(UPLOAD_DIR, path.basename(filename));
}

export function fileExists(filenameOrPath: string): boolean {
  return resolveAttachmentFilePath(filenameOrPath) !== null;
}

export function deleteFile(filenameOrPath: string): boolean {
  try {
    const resolved = resolveAttachmentFilePath(filenameOrPath);
    if (resolved && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to delete file from disk:", err);
    return false;
  }
}

export function getFileStats(filenameOrPath: string): { size: number; createdAt: Date } | null {
  const resolved = resolveAttachmentFilePath(filenameOrPath);
  if (!resolved || !fs.existsSync(resolved)) return null;

  const stats = fs.statSync(resolved);
  return {
    size: stats.size,
    createdAt: stats.birthtime,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SECURITY HEADERS & CONTENT DISPOSITION
// ─────────────────────────────────────────────────────────────────────────────

export function getSafeContentDisposition(
  fileName: string,
  dispositionType: "inline" | "attachment" = "inline"
): string {
  // Strip quotes, control characters, and newlines for the ASCII fallback parameter
  const asciiClean = fileName.replace(/[\x00-\x1f\x7f"\\;]/g, "_").trim() || "attachment";
  const encoded = encodeURIComponent(fileName);
  return `${dispositionType}; filename="${asciiClean}"; filename*=UTF-8''${encoded}`;
}

export function isSafeInlinePreviewType(mimeType: string): boolean {
  const safeMimes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ];
  return safeMimes.includes((mimeType || "").toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. NON-DESTRUCTIVE ORPHAN AUDIT UTILITY
// ─────────────────────────────────────────────────────────────────────────────

export async function auditOrphanFiles(): Promise<{
  diskFilesCount: number;
  dbRecordsCount: number;
  orphansOnDisk: string[];
  missingOnDisk: string[];
}> {
  const diskFiles: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        diskFiles.push(entry.name);
      }
    }
  }

  scanDir(UPLOAD_BASE_DIR);

  const [ticketAtts, taskAtts] = await Promise.all([
    pool.query(`SELECT file_path FROM ticket_attachments`),
    pool.query(`SELECT file_path FROM task_attachments`),
  ]);

  const dbPaths = new Set<string>();
  ticketAtts.rows.forEach((r) => dbPaths.add(path.basename(r.file_path)));
  taskAtts.rows.forEach((r) => dbPaths.add(path.basename(r.file_path)));

  const diskSet = new Set(diskFiles);
  const orphansOnDisk = diskFiles.filter((f) => !dbPaths.has(f));
  const missingOnDisk = Array.from(dbPaths).filter((f) => !diskSet.has(f));

  return {
    diskFilesCount: diskFiles.length,
    dbRecordsCount: dbPaths.size,
    orphansOnDisk,
    missingOnDisk,
  };
}

export { UPLOAD_BASE_DIR, UPLOAD_DIR, UPLOAD_TASKS_DIR };
