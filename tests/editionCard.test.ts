import { describe, expect, it } from 'vitest';
import { ownEditions, setEditions, allEditions } from '../src/game/puzzles';
import { defaultSave as emptySave } from '../src/game/storage';

describe('Edition bringt ihre Karte mit', () => {
  it('fehlende Karte kommt in die Sammlung und zeigt die Edition', () => {
    setEditions([]);
    const e = allEditions()[0];
    const s = ownEditions({ ...emptySave(), unlocked: [] }, [e.id]);
    expect(s.editions.owned).toContain(e.id);
    expect(s.unlocked).toContain(e.cardId);
    expect(s.editions.equipped[e.cardId]).toBe(e.id);
  });
  it('eine Karte, die man schon hat, behält ihr Aussehen', () => {
    const e = allEditions()[0];
    const s = ownEditions({ ...emptySave(), unlocked: [e.cardId] }, [e.id]);
    expect(s.editions.owned).toContain(e.id);
    expect(s.unlocked.filter((id) => id === e.cardId)).toHaveLength(1);
    expect(s.editions.equipped[e.cardId]).toBeUndefined();
  });
});
