// Admin: send a gift into the Postfach – to one player (by name) or to everyone. The server checks the admin and the
// reward (coins, Runensteine, a pack from the shop, a card that exists); players collect it within 30 days.
import { useMemo, useState } from 'react';
import { CARDS, RARITY_LABEL } from '../game/cards';
import { PACKS, packView } from '../game/shop';
import type { Reward } from '../game/campaign';
import { inboxSend } from '../game/inboxApi';
import { ConfirmButton } from '../components/ConfirmButton';

type Kind = 'coins' | 'stones' | 'pack' | 'card';
const KIND_LABEL: Record<Kind, string> = { coins: 'Münzen', stones: 'Runensteine', pack: 'Kartenpack', card: 'Karte' };

export function InboxAdminView({ onToast }: { onToast: (m: string) => void }) {
  const [to, setTo] = useState<'all' | 'one'>('one');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<Kind>('coins');
  const [amount, setAmount] = useState(100);
  const [packId, setPackId] = useState(PACKS[0]?.id ?? '');
  const [cardId, setCardId] = useState('');
  const [busy, setBusy] = useState(false);
  const cards = useMemo(() => [...CARDS].sort((a, b) => a.name.localeCompare(b.name, 'de')), []);

  const reward: Reward = kind === 'coins' || kind === 'stones' ? { type: kind, amount } : kind === 'pack' ? { type: 'pack', amount: Math.min(10, amount), packId } : { type: 'card', cardId };
  const ready = title.trim() && (to === 'all' || name.trim()) && (kind !== 'card' || cardId) && amount > 0;

  async function send() {
    setBusy(true);
    const r = await inboxSend(to === 'all' ? 'all' : name.trim(), title, message, reward);
    setBusy(false);
    if (!r.ok) return onToast(r.reason);
    onToast(`Geschenk an ${r.sent} ${r.sent === 1 ? 'Spieler' : 'Spieler'} gesendet ✓`);
    setTitle('');
    setMessage('');
  }

  return (
    <div className="admin-inbox">
      <section className="admin-card">
        <h3>Geschenk ins Postfach senden</h3>
        <p className="muted small">Spieler finden es im Postfach (Briefumschlag oben) und haben 30 Tage Zeit zum Abholen. Packs werden beim Abholen geöffnet; doppelte Karten kommen in die Runenschmiede.</p>
        <span className="field"><span>Empfänger</span>
          <span className="segmented">
            <button type="button" className={`seg ${to === 'one' ? 'active' : ''}`} onClick={() => setTo('one')}>Ein Spieler</button>
            <button type="button" className={`seg ${to === 'all' ? 'active' : ''}`} onClick={() => setTo('all')}>Alle Spieler</button>
          </span>
        </span>
        {to === 'one' && <label className="field"><span>Spielername</span><input className="admin-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /></label>}
        <label className="field"><span>Betreff (z. B. „Entschädigung für den Raid“)</span><input className="admin-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Nachricht (freiwillig)</span><input className="admin-input" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} /></label>
        <span className="field"><span>Belohnung</span>
          <span className="segmented">{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <button key={k} type="button" className={`seg ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</span>
        </span>
        {kind !== 'card' && (
          <label className="field"><span>{kind === 'pack' ? 'Anzahl Packs (1–10)' : 'Anzahl'}</span>
            <input className="admin-input num" type="number" min={1} max={kind === 'pack' ? 10 : 100000} value={amount} onChange={(e) => setAmount(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
          </label>
        )}
        {kind === 'pack' && (
          <label className="field"><span>Pack</span>
            <select className="admin-input" value={packId} onChange={(e) => setPackId(e.target.value)}>{PACKS.map((p) => <option key={p.id} value={p.id}>{packView(p).name}</option>)}</select>
          </label>
        )}
        {kind === 'card' && (
          <label className="field"><span>Karte</span>
            <select className="admin-input" value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">– bitte wählen –</option>
              {cards.map((c) => <option key={c.id} value={c.id}>{c.name} ({RARITY_LABEL[c.rarity]})</option>)}
            </select>
          </label>
        )}
        <div className="admin-actions">
          {to === 'all'
            ? <ConfirmButton label="An alle senden" confirmLabel="Wirklich an ALLE?" onConfirm={() => { if (ready && !busy) send(); }} />
            : <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={send}>{busy ? 'Sendet …' : 'Senden'}</button>}
        </div>
      </section>
    </div>
  );
}
