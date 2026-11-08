import { describe, expect, it } from 'vitest';
import { AVATARS, DEFAULT_AVATAR, unlockedAvatars } from '../src/game/avatars';
import { DEFAULT_QUESTS, grantQuestRewards, parseQuestState } from '../src/game/quests';
import { questEquipAvatar, shownAvatar } from '../src/server/engine';
import { defaultSave } from '../src/game/storage';
import { createRng } from '../src/game/rng';

describe('Avatare', () => {
  it('6 Avatare zum Start, die anderen gehören zu echten Erfolgen; Kennungen eindeutig', () => {
    expect(unlockedAvatars([])).toHaveLength(6);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    const ids = new Set(DEFAULT_QUESTS.achievements.map((q) => q.id));
    for (const a of AVATARS) if (a.quest) expect(ids.has(a.quest), a.id).toBe(true);
    expect(AVATARS.filter((a) => a.quest).length).toBeGreaterThanOrEqual(20);
  });

  it('ein abgeholter Erfolg schaltet seinen Avatar frei (auch rückwirkend)', () => {
    expect(unlockedAvatars(['a:a-win50'])).toContain('av11');
    expect(unlockedAvatars(['d:2026-11-08:d-win2'])).toHaveLength(6);
  });

  it('nur freigeschaltete Avatare lassen sich wählen; Titel bleiben erhalten', () => {
    const state = { claimed: ['a:a-win50'], titles: { owned: ['Sieger'], equipped: 'Sieger' } };
    expect(questEquipAvatar(state, 'av12')).toBeNull();
    expect(questEquipAvatar(state, 'gibtsnicht')).toBeNull();
    expect(questEquipAvatar(state, 'av11')).toEqual({ owned: ['Sieger'], equipped: 'Sieger', avatar: 'av11' });
    expect(questEquipAvatar(state, 'av03')).toMatchObject({ avatar: 'av03' });
  });

  it('der gewählte Avatar übersteht das Laden und das Abholen von Belohnungen', () => {
    const s = parseQuestState({ titles: { owned: [], equipped: null, avatar: 'av04' } });
    expect(s.titles.avatar).toBe('av04');
    expect(parseQuestState({ titles: { owned: [], equipped: null, avatar: 'hack' } }).titles.avatar).toBeUndefined();
    const r = grantQuestRewards(defaultSave(), s.titles, [{ key: 'a:x', reward: { type: 'title', title: 'Neu' }, source: 'Test' }], createRng(1));
    expect(r.titles).toMatchObject({ avatar: 'av04', owned: ['Neu'] });
  });

  it('angezeigter Avatar: gewählter oder der erste Start-Avatar', () => {
    expect(shownAvatar({ avatar: 'av20' })).toBe('av20');
    expect(shownAvatar(null)).toBe(DEFAULT_AVATAR);
    expect(shownAvatar({ avatar: 'x' })).toBe(DEFAULT_AVATAR);
  });
});
