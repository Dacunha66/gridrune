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

describe('Avatare im Admin', () => {
  it('gespeicherte Avatare ersetzen eingebaute oder kommen neu dazu; ausgeschaltete werden nicht angeboten', async () => {
    const { parseAvatar, setAvatars, AVATARS, findAvatar, isAvatarId } = await import('../src/game/avatars');
    const changed = parseAvatar('av01', { name: 'Rotfuchs', art: '🦊', bg: ['#ff0000', '#000000'], frame: 'gold', image: { id: 'abcdefgh1234', w: 512, h: 512 } })!;
    const added = parseAvatar('av40', { name: 'Neu', art: '✨', frame: 'rune', quest: 'a-win10' })!;
    const off = parseAvatar('av02', { name: 'Wolf', active: false })!;
    setAvatars([changed, added, off]);
    expect(findAvatar('av01')).toMatchObject({ name: 'Rotfuchs', frame: 'gold' });
    expect(findAvatar('av01').image?.id).toBe('abcdefgh1234');
    expect(AVATARS.some((x) => x.id === 'av40')).toBe(true);
    expect(unlockedAvatars([])).not.toContain('av02');
    expect(isAvatarId('av02')).toBe(false);
    expect(unlockedAvatars(['a:a-win10'])).toEqual(expect.arrayContaining(['av10', 'av40']));
    setAvatars([]);
    expect(AVATARS.length).toBe((await import('../src/game/avatars')).BUILTIN_AVATARS.length);
  });

  it('ungültige Dokumente werden abgelehnt oder bereinigt', async () => {
    const { parseAvatar } = await import('../src/game/avatars');
    expect(parseAvatar('x1', { name: 'A' })).toBeNull();
    expect(parseAvatar('av50', { name: '' })).toBeNull();
    expect(parseAvatar('av50', { name: 'A', bg: ['red', 'blue'], frame: 'platin', quest: 'DROP TABLE', image: { id: '../x' } })).toMatchObject({
      bg: ['#475569', '#0f172a'], frame: 'none', image: null, active: true,
    });
  });
});
