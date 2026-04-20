import type {
  BatchRow,
  FileRow,
  ResponsesCacheInfo,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import type { ResponseRow } from "@/lib/batch-output-cache";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (err: Error) => void;
};

type DistOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

class DbClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private ready: Promise<void> | null = null;
  private available = true;

  private ensure(): Worker | null {
    if (typeof window === "undefined") return null;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.addEventListener("message", (ev: MessageEvent<WorkerResponse>) => {
        const { id, ok, data, error } = ev.data;
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (ok) p.resolve(data);
        else p.reject(new Error(error ?? "worker error"));
      });
      this.worker.addEventListener("error", (ev) => {
        console.error("[db worker] error", ev.message);
        this.available = false;
      });
    } catch (err) {
      console.warn("[db] worker unavailable", err);
      this.available = false;
      return null;
    }
    return this.worker;
  }

  private call<T>(msg: DistOmit<WorkerRequest, "id">): Promise<T> {
    if (!this.available) return Promise.reject(new Error("db unavailable"));
    const w = this.ensure();
    if (!w) return Promise.reject(new Error("db unavailable"));
    const id = String(++this.seq);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      w.postMessage({ ...msg, id } as WorkerRequest);
    });
  }

  init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.call<{ ready: boolean }>({ kind: "init" }).then(() => {});
      this.ready.catch(() => {
        this.available = false;
      });
    }
    return this.ready;
  }

  isAvailable(): boolean {
    return this.available && typeof window !== "undefined";
  }

  upsertBatches(batches: BatchRow[]): Promise<void> {
    if (batches.length === 0) return Promise.resolve();
    return this.call<void>({ kind: "upsertBatches", batches });
  }

  getBatches(): Promise<BatchRow[]> {
    return this.call<BatchRow[]>({ kind: "getBatches" });
  }

  getBatch(batchId: string): Promise<BatchRow | null> {
    return this.call<BatchRow | null>({ kind: "getBatch", batchId });
  }

  upsertFiles(files: FileRow[], replaceAll = false): Promise<void> {
    if (files.length === 0 && !replaceAll) return Promise.resolve();
    return this.call<void>({ kind: "upsertFiles", files, replaceAll });
  }

  getFiles(): Promise<FileRow[]> {
    return this.call<FileRow[]>({ kind: "getFiles" });
  }

  upsertResponses(args: {
    fileId: string;
    batchId: string | null;
    rows: ResponseRow[];
    offset: number;
    total: number;
  }): Promise<void> {
    return this.call<void>({ kind: "upsertResponses", ...args });
  }

  getResponses(fileId: string, offset: number, limit: number): Promise<ResponseRow[]> {
    return this.call<ResponseRow[]>({
      kind: "getResponses",
      fileId,
      offset,
      limit,
    });
  }

  getResponsesCacheInfo(fileId: string): Promise<ResponsesCacheInfo> {
    return this.call<ResponsesCacheInfo>({ kind: "getResponsesCacheInfo", fileId });
  }

  getMeta(key: string): Promise<string | null> {
    return this.call<string | null>({ kind: "getMeta", key });
  }

  setMeta(key: string, value: string): Promise<void> {
    return this.call<void>({ kind: "setMeta", key, value });
  }
}

export const db = new DbClient();
