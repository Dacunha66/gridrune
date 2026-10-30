// Keeps the signed-in player's save in sync with the account (phase 3). Guests keep their browser save
// untouched; a signed-in player plays on the account save (with a copy on the device). The first sign-in of
// an account offers to take over the browser progress once.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountState } from './account';
import { CampaignProgress, emptyProgress, loadProgress } from './campaignProgress';
import { CloudSave, loadCloudSave, pushCloudSave, readCache, writeCache } from './cloudSave';
import { SaveData, defaultSave, loadSave } from './storage';

/** guest = browser save; loading/choose/offline = account, save not ready yet; ready = playing on the account. */
export type CloudPhase = 'guest' | 'loading' | 'choose' | 'offline' | 'ready';
export type SyncState = 'saved' | 'saving' | 'waiting' | 'offline';

interface Args {
  account: AccountState | null;
  save: SaveData;
  setSave: (s: SaveData) => void;
  progress: CampaignProgress;
  setProgress: (p: CampaignProgress) => void;
}

const RETRY_MS = 20000;
const DEBOUNCE_MS = 1200;

export function useCloudSync({ account, save, setSave, progress, setProgress }: Args) {
  const uid = account?.kind === 'signedIn' || account?.kind === 'recovery' ? account.account.id : null;
  const [phase, setPhase] = useState<CloudPhase>(uid ? 'loading' : 'guest');
  const [sync, setSync] = useState<SyncState>('saved');
  const [notice, setNotice] = useState('');
  const version = useRef<number | null>(null);
  const synced = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [kick, setKick] = useState(0);

  const adopt = useCallback((c: CloudSave) => {
    version.current = c.version;
    synced.current = JSON.stringify([c.save, c.campaign]);
    setSave(c.save);
    setProgress(c.campaign);
  }, [setSave, setProgress]);

  // Sign-in: show the device copy at once, then the server's save.
  const load = useCallback(async (id: string) => {
    const cache = readCache(id);
    if (cache) {
      adopt(cache);
      if (cache.dirty) synced.current = '';
      setPhase('ready');
    } else setPhase('loading');
    const cloud = await loadCloudSave(id);
    if (cloud === 'offline') {
      if (!cache) setPhase('offline');
      else setSync('offline');
      return;
    }
    if (cloud === null) {
      setPhase('choose');
      return;
    }
    // The server is newer than the device copy (or the copy has nothing unsent): the server wins.
    if (!cache || cloud.version > cache.version || !cache.dirty) {
      if (cache?.dirty && cloud.version > cache.version) setNotice('Dein Spielstand von einem anderen Gerät wurde geladen.');
      adopt(cloud);
      writeCache(id, cloud, false);
    }
    setPhase('ready');
  }, [adopt]);

  useEffect(() => {
    if (!uid) {
      setPhase('guest');
      return;
    }
    load(uid);
  }, [uid, load]);

  /** First sign-in: take over the browser progress once, or start fresh. */
  const choose = useCallback(async (takeOver: boolean) => {
    if (!uid) return;
    const s = takeOver ? loadSave() : defaultSave();
    const c = takeOver ? loadProgress() : emptyProgress();
    setPhase('loading');
    const r = await pushCloudSave(s, c, null);
    if (r.kind === 'saved') {
      adopt({ version: r.version, save: s, campaign: c });
      writeCache(uid, { version: r.version, save: s, campaign: c }, false);
      setPhase('ready');
    } else if (r.kind === 'conflict') {
      adopt(r.cloud);
      setPhase('ready');
    } else if (r.kind === 'rejected') {
      setNotice(`Dieser Spielstand kann nicht übernommen werden (${r.reason}). Du startest neu.`);
      setPhase('choose');
    } else setPhase('offline');
  }, [uid, adopt]);

  // Every change while playing on the account: device copy at once, server shortly after.
  useEffect(() => {
    if (phase !== 'ready' || !uid) return;
    const json = JSON.stringify([save, progress]);
    if (json === synced.current) return;
    writeCache(uid, { version: version.current ?? 0, save, campaign: progress }, true);
    setSync('waiting');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSync('saving');
      const r = await pushCloudSave(save, progress, version.current);
      if (r.kind === 'saved') {
        version.current = r.version;
        synced.current = json;
        writeCache(uid, { version: r.version, save, campaign: progress }, false);
        setSync('saved');
      } else if (r.kind === 'conflict') {
        adopt(r.cloud);
        writeCache(uid, r.cloud, false);
        setNotice('Dein Spielstand von einem anderen Gerät wurde geladen.');
        setSync('saved');
      } else if (r.kind === 'rejected') {
        if (r.cloud) {
          adopt(r.cloud);
          writeCache(uid, r.cloud, false);
        }
        setNotice('Eine Änderung wurde vom Server nicht angenommen – der gespeicherte Stand wurde wiederhergestellt.');
        setSync('saved');
      } else {
        setSync('offline');
        timer.current = setTimeout(() => setKick((k) => k + 1), RETRY_MS);
      }
    }, DEBOUNCE_MS);
  }, [phase, uid, save, progress, adopt, kick]);

  /** A save written by a server function (checked reward): it becomes the current save at once. */
  const adoptServer = useCallback((c: CloudSave) => {
    if (!uid) return;
    adopt(c);
    writeCache(uid, c, false);
  }, [uid, adopt]);

  return {
    phase, sync, notice, clearNotice: () => setNotice(''), notify: setNotice, choose, retry: () => uid && load(uid),
    accountMode: !!uid, uid, adoptServer,
  };
}
