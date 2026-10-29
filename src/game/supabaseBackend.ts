// Database, picture storage and admin check for the web version (gridrune.netlify.app), backed by Supabase.
// It offers the same small API as the claude.ai platform (see cardStore), so the game and the admin screens
// work unchanged. Every write is checked by the database itself: only accounts listed in `admins` may write
// content (row level security), whatever this code does.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Assets, CollectionRef, Db, DocRef, DocSnap, UserApi } from './cardStore';

/** Public project address and publishable key (safe to ship: the database rules decide who may do what). */
export const SUPABASE_URL = 'https://bhnqniqgxmkshicdkrmm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gkuYIcXCTtHM4_i2hq-GVg_Nsa1i1e3';
const TABLE = 'content_docs';
export const IMAGE_BUCKET = 'game-images';
const PAGE = 1000;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** Where uploaded pictures can be loaded from (public bucket). */
export const imageBase = `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/`;

/** Same error codes as the platform, so describeError() shows the right German message. */
function fail(e: { code?: string; message?: string; status?: number; statusCode?: string } | null): never {
  const status = Number(e?.status ?? e?.statusCode ?? 0);
  const code = e?.code === '42501' || status === 401 || status === 403 ? 'invalid_argument'
    : status === 413 ? 'too_large'
      : status === 415 ? 'unsupported_type'
        : status === 429 ? 'rate_limited'
          : 'unknown';
  throw Object.assign(new Error(e?.message ?? 'database_error'), { code });
}

// Admin lists re-read a collection after every write made here (no live connection needed).
const listeners = new Map<string, Set<() => void>>();
function changed(collection: string) {
  for (const f of listeners.get(collection) ?? []) f();
}

function snap(id: string, data: Record<string, unknown> | undefined): DocSnap {
  return { id, exists: data !== undefined, data: () => data };
}

async function readAll(collection: string): Promise<DocSnap[]> {
  const out: DocSnap[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase().from(TABLE).select('id, data').eq('collection', collection).order('id').range(from, from + PAGE - 1);
    if (error) fail(error);
    for (const row of data ?? []) out.push(snap(row.id as string, row.data as Record<string, unknown>));
    if (!data || data.length < PAGE) return out;
  }
}

function docRef(collection: string, id: string): DocRef {
  return {
    async get() {
      const { data, error } = await supabase().from(TABLE).select('data').eq('collection', collection).eq('id', id).maybeSingle();
      if (error) fail(error);
      return snap(id, (data?.data as Record<string, unknown> | undefined) ?? undefined);
    },
    async set(doc) {
      const { error } = await supabase().from(TABLE).upsert({ collection, id, data: doc });
      if (error) fail(error);
      changed(collection);
    },
    async delete() {
      const { error } = await supabase().from(TABLE).delete().eq('collection', collection).eq('id', id);
      if (error) fail(error);
      changed(collection);
    },
  };
}

function collectionRef(path: string): CollectionRef {
  return {
    doc: (id?: string) => docRef(path, id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 20)),
    get: async () => ({ docs: await readAll(path) }),
    onSnapshot(next, error) {
      let alive = true;
      const load = () => readAll(path).then((docs) => alive && next({ docs }), (e) => alive && error?.({ code: e?.code ?? 'unknown', message: String(e?.message ?? e) }));
      const set = listeners.get(path) ?? new Set();
      set.add(load);
      listeners.set(path, set);
      load();
      return () => {
        alive = false;
        set.delete(load);
      };
    },
  };
}

export const supabaseDb: Db = { collection: collectionRef };

/** Picture ids look like the platform's (32 hex characters); the file is stored under that name. */
function newImageId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export const supabaseAssets: Assets = {
  async upload(blob, options) {
    const id = newImageId();
    const { error } = await supabase().storage.from(IMAGE_BUCKET).upload(id, blob, { contentType: options?.type ?? blob.type, upsert: false });
    if (error) fail(error as { message?: string; statusCode?: string });
    return { id, url: imageBase + id };
  },
  async delete(ref) {
    const id = ref.replace(/^.*\//, '');
    const { data, error } = await supabase().storage.from(IMAGE_BUCKET).remove([id]);
    if (error) fail(error as { message?: string; statusCode?: string });
    return { deleted: (data?.length ?? 0) > 0 };
  },
};

/** Admin = the signed-in account is listed in `admins` (the table only shows a user their own entry). */
export async function supabaseIsAdmin(): Promise<boolean> {
  const { data: session } = await supabase().auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return false;
  const { data, error } = await supabase().from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  return !error && !!data;
}

export const supabaseUser: UserApi = { canEdit: supabaseIsAdmin, isOwner: supabaseIsAdmin };
