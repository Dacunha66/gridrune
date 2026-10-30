// Admin: look of the booster packs in the shop – picture, name and text. Price, size and odds are game rules
// and are not changed here.
import { useEffect, useState } from 'react';
import { Assets, Db, describeError, loadShopLooks, saveShopLooks } from '../game/cardStore';
import { PACKS, PACK_NAME_MAX, PACK_TEXT_MAX, PackLook, packLooks, packView, setPackLooks } from '../game/shop';
import { RARITY_LABEL } from '../game/cards';
import { ImageField, TextField } from './AdminCampaign';
import { PackArt } from './Shop';

const EMPTY: PackLook = { image: null, name: '', description: '' };

export function ShopAdminView({ db, assets, onToast }: { db: Db; assets: Assets | null; onToast: (m: string) => void }) {
  const [looks, setLooks] = useState<Record<string, PackLook> | null>(null);
  const [saved, setSaved] = useState<Record<string, PackLook>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadShopLooks(db).then((l) => {
      if (!alive) return;
      const start = l ?? packLooks();
      setLooks(start);
      setSaved(start);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  if (!looks) return <p className="muted center">Shop wird geladen …</p>;
  const dirty = JSON.stringify(looks) !== JSON.stringify(saved);
  const set = (id: string, patch: Partial<PackLook>) => setLooks({ ...looks, [id]: { ...EMPTY, ...looks[id], ...patch } });

  async function save() {
    setBusy(true);
    try {
      await saveShopLooks(db, looks!);
      setSaved(looks!);
      setPackLooks(looks!);
      onToast('Shop gespeichert ✓ – Spieler sehen die neuen Booster beim nächsten Öffnen');
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scroll shop-admin">
      <p className="muted small">
        Hier legst du fest, wie die Booster im Shop aussehen: Bild, Name und Beschreibung. Preis, Kartenzahl und Chancen sind Spielregeln
        und bleiben unverändert. Ohne Bild zeigt der Shop den gezeichneten Standard-Booster.
      </p>
      {PACKS.map((pack) => {
        const look = looks[pack.id] ?? EMPTY;
        // Preview with the current (unsaved) look.
        const view = packView(pack, look);
        return (
          <section key={pack.id} className="admin-card shop-admin-pack">
            <div className="shop-admin-preview">
              <div className="pack-tile-art"><PackArt pack={pack} look={look} /></div>
              <div>
                <h3>{view.name}</h3>
                <p className="small">{view.description}</p>
                <p className="muted small">🪙 {pack.price} · {pack.size} Karten{pack.guaranteed ? ` · letzte Karte mind. ${RARITY_LABEL.epic}` : ''}</p>
              </div>
            </div>
            <ImageField kind="packArt" value={look.image} onChange={(image) => set(pack.id, { image })} assets={assets} onToast={onToast} />
            <TextField label={`Name (leer = „${pack.name}“)`} value={look.name} max={PACK_NAME_MAX} onChange={(name) => set(pack.id, { name })} />
            <TextField label="Beschreibung (leer = Standardtext)" value={look.description} max={PACK_TEXT_MAX} multiline onChange={(description) => set(pack.id, { description })} placeholder={pack.description} />
          </section>
        );
      })}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary btn-wide" disabled={!dirty || busy} onClick={save}>{busy ? 'Speichert …' : dirty ? 'Shop speichern' : 'Gespeichert ✓'}</button>
      </div>
    </div>
  );
}
