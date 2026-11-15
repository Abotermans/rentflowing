export interface PendingDocumentFileDeletion {
  id: string;
  portfolio_id: string;
  lease_id: string;
  document_id: string;
  storage_path: string;
  attempts: number;
}

export interface DocumentFileCleanupResult {
  scanned: number;
  removed: number;
  failedIds: string[];
  remaining: number;
}

export function isScopedDocumentFilePath(item: PendingDocumentFileDeletion): boolean {
  const prefix = `${item.portfolio_id}/${item.lease_id}/${item.document_id}/`;
  if (!item.storage_path.startsWith(prefix)) return false;
  const filename = item.storage_path.slice(prefix.length);
  if (filename === "" || filename === "." || filename === ".." || /[/%\\]/.test(filename)) return false;
  for (let index = 0; index < filename.length; index += 1) {
    const code = filename.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

export async function removeStorageFileIfPresent(
  storage: {
    exists: (path: string) => Promise<{ data: boolean; error: { status?: number; message: string } | null }>;
    remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
  },
  path: string,
): Promise<void> {
  const { data: exists, error: existsError } = await storage.exists(path);
  if (existsError && existsError.status !== 404) throw new Error(existsError.message);
  if (!exists) return;
  const { error } = await storage.remove([path]);
  if (error) throw new Error(error.message);
  const { data: stillExists, error: verifyError } = await storage.exists(path);
  if (verifyError && verifyError.status !== 404) throw new Error(verifyError.message);
  if (stillExists) throw new Error("Storage did not confirm file deletion");
}

export async function runDocumentFileCleanup(
  pending: PendingDocumentFileDeletion[],
  operations: {
    removeFile: (path: string) => Promise<void>;
    acknowledge: (id: string) => Promise<void>;
    recordFailure: (item: PendingDocumentFileDeletion, message: string) => Promise<void>;
    countRemaining: () => Promise<number>;
  },
): Promise<DocumentFileCleanupResult> {
  let removed = 0;
  const failedIds: string[] = [];
  for (const item of pending) {
    try {
      if (!isScopedDocumentFilePath(item)) {
        throw new Error("Queued file path is outside its document scope");
      }
      await operations.removeFile(item.storage_path);
      await operations.acknowledge(item.id);
      removed += 1;
    } catch (error) {
      failedIds.push(item.id);
      await operations.recordFailure(item, error instanceof Error ? error.message : String(error));
    }
  }
  return { scanned: pending.length, removed, failedIds, remaining: await operations.countRemaining() };
}
