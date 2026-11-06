// Admin: the booster packs in the shop – picture, name, text and price. Size and odds are game rules and are not
// changed here. The server reads the same document, so a new price is what buying really costs.
import { Coin } from '../components/Coin';
import { useEffect, useState } from 'react';
import { Assets, Db, describeError, loadShopLooks, saveShopLooks } from '../game/cardStore';
import { PACKS, PACK_NAME_MAX, PACK_PRICE_MAX, PACK_PRICE_MIN, PACK_TEXT_MAX, PackLook, packLooks, packPrice, packView, setPackLooks } from '../game/shop';
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
        Hier legst du fest, wie die Booster im Shop aussehen und was sie kosten: Bild, Name, Beschreibung und Preis. Kartenzahl und Chancen
        sind Spielregeln und bleiben unverändert. Ohne Bild zeigt der Shop den gezeichneten Standard-Booster. Der neue Preis gilt sofort – auch der
        Server rechnet damit.
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
                <p className="muted small"><Coin /> {packPrice(pack, look)} · {pack.size} Karten{pack.guaranteed ? ` · letzte Karte mind. ${RARITY_LABEL.epic}` : ''}</p>
              </div>
            </div>
            <ImageField kind="packArt" value={look.image} onChange={(image) => set(pack.id, { image })} assets={assets} onToast={onToast} />
            <label className="field">
              <span>Preis in Münzen (Standard {pack.price})</span>
              <input className="admin-input num" type="number" inputMode="numeric" min={PACK_PRICE_MIN} max={PACK_PRICE_MAX} value={look.price ?? pack.price}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  set(pack.id, { price: Number.isFinite(n) && n > 0 ? Math.min(PACK_PRICE_MAX, n) : null });
                }} />
              {(look.price ?? pack.price) < PACK_PRICE_MIN && <small className="warn-text">Mindestens {PACK_PRICE_MIN} Münzen.</small>}
            </label>
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
