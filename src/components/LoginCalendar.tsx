// Login-Kalender: 7 fields, today's one shines; tapping it collects the reward on the server. Coins and Runensteine
// are shown big, a pack is opened like in the shop (cards face down, the rarest last).
import { ReactNode, useState } from 'react';
import { Coin, Stone } from './Coin';
import { GameIcon } from './GameIcon';
import { RevealItem, RewardReveal, revealOfGranted } from './RewardReveal';
import { OpenedPack, PackReveal, packsOf } from '../screens/Inbox';
import { PackArt } from '../screens/Shop';
import { CloudSave } from '../game/cloudSave';
import { LoginView } from '../game/loginCalendar';
import { loginClaimRemote } from '../game/adventureApi';
import { getCard } from '../game/cards';
import { PACKS, packView } from '../game/shop';
import type { Reward } from '../game/campaign';

/** Short text for a field: "50 Münzen", "Helden-Pack", the card's name. */
function fieldText(r: Reward): { icon: ReactNode; text: string } {
  if (r.type === 'coins') return { icon: <Coin />, text: `${r.amount ?? 0} Münzen` };
  if (r.type === 'stones') return { icon: <Stone />, text: `${r.amount ?? 0} Runensteine` };
  if (r.type === 'pack') {
    const pack = PACKS.find((p) => p.id === r.packId) ?? PACKS[0];
    return { icon: pack ? <span className="login-pack"><PackArt pack={pack} /></span> : '🎁', text: `${(r.amount ?? 1) > 1 ? `${r.amount} × ` : ''}${pack ? packView(pack).name : 'Pack'}` };
  }
  if (r.type === 'card' && r.cardId) return { icon: '🃏', text: getCard(r.cardId).name };
  return { icon: '🎁', text: 'Belohnung' };
}

export function LoginCalendar({ view, onClose, onAdopt, onView, reducedMotion, cardSkin }: {
  view: LoginView;
  onClose: () => void;
  onAdopt: (c: CloudSave) => void;
  /** The calendar after collecting (for the menu). */
  onView: (v: LoginView) => void;
  reducedMotion: boolean;
  cardSkin: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reveal, setReveal] = useState<RevealItem[] | null>(null);
  const [pack, setPack] = useState<OpenedPack[] | null>(null);

  async function claim() {
    if (busy || !view.canClaim) return;
    setBusy(true);
    const r = await loginClaimRemote();
    setBusy(false);
    if (r.cloud) onAdopt(r.cloud);
    if (r.calendar) onView(r.calendar);
    if (!r.ok) return setMessage(r.reason);
    const g = r.granted;
    const isPack = view.fields[view.index]?.reward.type === 'pack';
    if (isPack) {
      const opened = packsOf([g]);
      setPack(opened.length ? opened : null);
    } else {
      const big = revealOfGranted([g]);
      setReveal(big.length ? big : null);
    }
  }

  if (reveal) return <RewardReveal items={reveal} reducedMotion={reducedMotion} onClose={() => setReveal(null)} />;
  if (pack) return <PackReveal packs={pack} cardSkin={cardSkin} onClose={() => setPack(null)} />;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Login-Kalender">
      <div className="modal login-calendar">
        <h2>Login-Kalender</h2>
        <p className="muted small center">Jeden Tag eine Belohnung. Verpasst du einen Tag, geht es einfach beim nächsten Feld weiter.</p>
        <ol className="login-days">
          {view.fields.map((f) => {
            const t = fieldText(f.reward);
            const today = f.state === 'today';
            return (
              <li key={f.day} className={`login-day is-${f.state} ${f.day === 7 ? 'is-big' : ''}`}>
                {today
                  ? <button type="button" className="login-day-btn" disabled={busy} onClick={claim} aria-label={`Tag ${f.day} abholen: ${t.text}`}>
                      <small>Tag {f.day}</small><span className="login-icon" aria-hidden="true">{t.icon}</span><b>{t.text}</b>
                    </button>
                  : <div className="login-day-btn" aria-label={`Tag ${f.day}: ${t.text}${f.state === 'done' ? ', abgeholt' : ''}`}>
                      <small>Tag {f.day}</small><span className="login-icon" aria-hidden="true">{f.state === 'done' ? <GameIcon name="check" /> : t.icon}</span><b>{t.text}</b>
                    </div>}
              </li>
            );
          })}
        </ol>
        {message && <p className="hint" aria-live="polite">{message}</p>}
        <div className="modal-actions">
          {view.canClaim
            ? <button type="button" className="btn btn-primary" disabled={busy} onClick={claim}>{busy ? 'Holt ab …' : `Tag ${view.index + 1} abholen`}</button>
            : <p className="muted small">Heute abgeholt ✓ – morgen wartet Tag {(view.index + 1) % 7 + 1}.</p>}
          <button type="button" className="btn" onClick={onClose}>{view.canClaim ? 'Später' : 'Schließen'}</button>
        </div>
      </div>
    </div>
  );
}
