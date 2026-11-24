// Turm der Prüfungen: loading and saving the floors (admin documents content_docs "tower_floors"). Players only get
// published floors (the database hides drafts from them); progress and rewards come from the server (adventureApi).
import { Db } from './cardStore';
import { TOWER_COLLECTION, TowerFloor, floorToDoc, parseFloor } from './tower';

export async function loadFloors(db: Db | null): Promise<TowerFloor[] | null> {
  if (!db) return null;
  try {
    const snap = await db.collection(TOWER_COLLECTION).get();
    return snap.docs.flatMap((d) => {
      const raw = d.exists ? d.data() : undefined;
      const f = raw ? parseFloor(d.id, raw) : null;
      if (!f) return [];
      // The opponent's card (picture and name); only the game shows it, so the server rules stay as they are.
      const face = typeof raw?.face === 'string' && /^[a-z]\d{2,4}$/.test(raw.face) ? raw.face : undefined;
      return [face ? { ...f, face } : f];
    });
  } catch {
    return null;
  }
}

export async function saveFloor(db: Db, f: TowerFloor): Promise<void> {
  await db.collection(TOWER_COLLECTION).doc(f.id).set(floorToDoc({ ...f, updatedAt: new Date().toISOString() }));
}
