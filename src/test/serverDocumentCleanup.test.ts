import { describe, expect, it, vi } from "vitest";
import {
  isScopedDocumentFilePath,
  removeStorageFileIfPresent,
  runDocumentFileCleanup,
  type PendingDocumentFileDeletion,
} from "@/lib/serverDocumentCleanup";

const item: PendingDocumentFileDeletion = {
  id: "queue-1",
  portfolio_id: "portfolio-1",
  lease_id: "lease-1",
  document_id: "document-1",
  storage_path: "portfolio-1/lease-1/document-1/contract.pdf",
  attempts: 0,
};

function operations() {
  return {
    removeFile: vi.fn().mockResolvedValue(undefined),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    countRemaining: vi.fn().mockResolvedValue(0),
  };
}

describe("scheduled document file cleanup", () => {
  it("accepts only one safe filename within the document folder", () => {
    expect(isScopedDocumentFilePath(item)).toBe(true);
    expect(isScopedDocumentFilePath({ ...item, storage_path: "portfolio-1/lease-1/document-1/legal file.pdf" })).toBe(true);
    for (const filename of ["", ".", "..", "../other.pdf", "folder/other.pdf", "..%2fsecret.pdf", "..\\secret.pdf", "line\nbreak.pdf"]) {
      expect(isScopedDocumentFilePath({ ...item, storage_path: `portfolio-1/lease-1/document-1/${filename}` })).toBe(false);
    }
  });

  it("acknowledges an already-missing file without another delete", async () => {
    const storage = {
      exists: vi.fn().mockResolvedValue({ data: false, error: { status: 404, message: "Not found" } }),
      remove: vi.fn(),
    };
    await expect(removeStorageFileIfPresent(storage, item.storage_path)).resolves.toBeUndefined();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("does not mistake a forbidden existence check for a missing file", async () => {
    const storage = {
      exists: vi.fn().mockResolvedValue({ data: false, error: { status: 403, message: "Forbidden" } }),
      remove: vi.fn(),
    };
    await expect(removeStorageFileIfPresent(storage, item.storage_path)).rejects.toThrow("Forbidden");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("deletes an existing file and surfaces a storage deletion failure", async () => {
    const storage = {
      exists: vi.fn()
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: false, error: { status: 404, message: "Not found" } })
        .mockResolvedValueOnce({ data: true, error: null }),
      remove: vi.fn().mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { message: "Delete failed" } }),
    };
    await removeStorageFileIfPresent(storage, item.storage_path);
    await expect(removeStorageFileIfPresent(storage, item.storage_path)).rejects.toThrow("Delete failed");
    expect(storage.remove).toHaveBeenCalledWith([item.storage_path]);
  });

  it("keeps a cleanup task when Storage reports success but the file remains", async () => {
    const storage = {
      exists: vi.fn().mockResolvedValue({ data: true, error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    await expect(removeStorageFileIfPresent(storage, item.storage_path))
      .rejects.toThrow("Storage did not confirm file deletion");
    expect(storage.exists).toHaveBeenCalledTimes(2);
  });

  it("keeps a cleanup task when post-delete verification fails", async () => {
    const storage = {
      exists: vi.fn()
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: false, error: { status: 503, message: "Storage unavailable" } }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    await expect(removeStorageFileIfPresent(storage, item.storage_path))
      .rejects.toThrow("Storage unavailable");
  });

  it("removes the scoped file before acknowledging its queue row", async () => {
    const calls: string[] = [];
    const ops = operations();
    ops.removeFile.mockImplementation(async () => { calls.push("remove"); });
    ops.acknowledge.mockImplementation(async () => { calls.push("acknowledge"); });
    expect(await runDocumentFileCleanup([item], ops)).toEqual({
      scanned: 1, removed: 1, failedIds: [], remaining: 0,
    });
    expect(calls).toEqual(["remove", "acknowledge"]);
    expect(ops.recordFailure).not.toHaveBeenCalled();
  });

  it("retains a failed deletion for retry and records the failure", async () => {
    const ops = operations();
    ops.removeFile.mockRejectedValue(new Error("Storage unavailable"));
    ops.countRemaining.mockResolvedValue(1);
    expect(await runDocumentFileCleanup([item], ops)).toEqual({
      scanned: 1, removed: 0, failedIds: ["queue-1"], remaining: 1,
    });
    expect(ops.acknowledge).not.toHaveBeenCalled();
    expect(ops.recordFailure).toHaveBeenCalledWith(item, "Storage unavailable");
  });

  it("quarantines a legacy or forged path instead of deleting it", async () => {
    const ops = operations();
    ops.countRemaining.mockResolvedValue(1);
    await runDocumentFileCleanup([{ ...item, storage_path: "other-portfolio/secret.pdf" }], ops);
    expect(ops.removeFile).not.toHaveBeenCalled();
    expect(ops.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "queue-1" }),
      "Queued file path is outside its document scope",
    );
  });

  it("quarantines a traversal suffix even when the document prefix matches", async () => {
    const ops = operations();
    ops.countRemaining.mockResolvedValue(1);
    await runDocumentFileCleanup([{ ...item, storage_path: `${item.storage_path}/../secret.pdf` }], ops);
    expect(ops.removeFile).not.toHaveBeenCalled();
    expect(ops.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: item.id }),
      "Queued file path is outside its document scope",
    );
  });

  it("keeps the queue row when acknowledgement fails after file removal", async () => {
    const ops = operations();
    ops.acknowledge.mockRejectedValue(new Error("Database unavailable"));
    ops.countRemaining.mockResolvedValue(1);
    expect(await runDocumentFileCleanup([item], ops)).toMatchObject({
      removed: 0, failedIds: ["queue-1"], remaining: 1,
    });
    expect(ops.removeFile).toHaveBeenCalledWith(item.storage_path);
    expect(ops.recordFailure).toHaveBeenCalledWith(item, "Database unavailable");
  });
});
