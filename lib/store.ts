/**
 * Persistence for shopper taste profiles and the event log that powers the
 * owner dashboard. MongoDB when MONGODB_URI is set, otherwise JSON files in
 * ./.data so the app runs with zero setup.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient, type Db } from "mongodb";
import type { ShopperProfile, StoreEvent } from "@/lib/types";

export interface Store {
  logEvent(e: StoreEvent): Promise<void>;
  listEvents(limit?: number): Promise<StoreEvent[]>;
  getProfile(shopperId: string): Promise<ShopperProfile | null>;
  saveProfile(p: ShopperProfile): Promise<void>;
}

const DIR = path.join(process.cwd(), ".data");
const EVENTS = path.join(DIR, "events.jsonl");
const PROFILES = path.join(DIR, "profiles.json");

class FileStore implements Store {
  private profiles: Record<string, ShopperProfile> | null = null;

  async logEvent(e: StoreEvent) {
    await mkdir(DIR, { recursive: true });
    await appendFile(EVENTS, JSON.stringify(e) + "\n");
  }

  async listEvents(limit = 5000) {
    try {
      const lines = (await readFile(EVENTS, "utf8")).trim().split("\n").filter(Boolean);
      return lines.slice(-limit).map((l) => JSON.parse(l) as StoreEvent);
    } catch {
      return [];
    }
  }

  private async loadProfiles() {
    if (this.profiles) return this.profiles;
    try {
      this.profiles = JSON.parse(await readFile(PROFILES, "utf8"));
    } catch {
      this.profiles = {};
    }
    return this.profiles!;
  }

  async getProfile(id: string) {
    return (await this.loadProfiles())[id] ?? null;
  }

  async saveProfile(p: ShopperProfile) {
    const all = await this.loadProfiles();
    all[p.shopper_id] = p;
    await mkdir(DIR, { recursive: true });
    await writeFile(PROFILES, JSON.stringify(all, null, 2));
  }
}

class MongoStore implements Store {
  constructor(private db: Promise<Db>) {}

  async logEvent(e: StoreEvent) {
    await (await this.db).collection("events").insertOne({ ...e });
  }

  async listEvents(limit = 5000) {
    const docs = await (await this.db).collection<StoreEvent>("events").find({}, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(limit).toArray();
    return docs.reverse();
  }

  async getProfile(id: string) {
    return (await this.db).collection<ShopperProfile>("profiles").findOne({ shopper_id: id }, { projection: { _id: 0 } });
  }

  async saveProfile(p: ShopperProfile) {
    await (await this.db).collection<ShopperProfile>("profiles").replaceOne({ shopper_id: p.shopper_id }, p, { upsert: true });
  }
}

class FirestoreStore implements Store {
  private db = async () => (await import("@/lib/firebase")).getFirestoreDb();

  async logEvent(e: StoreEvent) {
    await (await this.db()).collection("store_events").add({ ...e });
  }

  async listEvents(limit = 5000) {
    const snap = await (await this.db()).collection("store_events").orderBy("ts", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as StoreEvent).reverse();
  }

  async getProfile(id: string) {
    const doc = await (await this.db()).collection("store_profiles").doc(id).get();
    return doc.exists ? (doc.data() as ShopperProfile) : null;
  }

  async saveProfile(p: ShopperProfile) {
    await (await this.db()).collection("store_profiles").doc(p.shopper_id).set(p);
  }
}

let store: Store | null = null;

/** STORE_BACKEND=firestore|mongo|file. Default: mongo when MONGODB_URI is set, otherwise local files. */
export function getStore(): Store {
  if (store) return store;
  const uri = process.env.MONGODB_URI;
  if (process.env.STORE_BACKEND === "firestore") {
    store = new FirestoreStore();
  } else if (uri && process.env.STORE_BACKEND !== "file") {
    const db = new MongoClient(uri).connect().then(async (c) => {
      const d = c.db(process.env.MONGODB_DB || "racksavant_store");
      await d.collection("events").createIndex({ ts: -1 });
      await d.collection("events").createIndex({ type: 1, product_id: 1 });
      await d.collection("profiles").createIndex({ shopper_id: 1 }, { unique: true });
      return d;
    });
    store = new MongoStore(db);
  } else {
    store = new FileStore();
  }
  return store;
}
