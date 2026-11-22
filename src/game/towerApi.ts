// Turm der Prüfungen: loading and saving the floors (admin documents content_docs "tower_floors"). Players only get
// published floors (the database hides drafts from them); progress and rewards come from the server (adventureApi).
import { Db } from './cardStore';
import { TOWER_COLLECTION, TowerFloor, floorToDoc, parseFloor } from './tower';

export async function loadFloors(db: Db | null): Promise<TowerFloor[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(TOWER_COLLECTION).get();
    return snap.docs.flatMap((d) => {
      const f = d.exists ? parseFloor(d.id, d.data()) : null;
      return f ? [f] : [];
    });
  } catch {
    return null;
  }
}

export async function saveFloor(db: Db, f: TowerFloor): Promise<void> {
  await db.collection(TOWER_COLLECTION).doc(f.id).set(floorToDoc({ ...f, updatedAt: new Date().toISOString() }));
}
