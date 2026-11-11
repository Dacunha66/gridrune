// Community (signed-in players): chat (all players and the own clan), clans (find, found, join, manage) and the weekly
// clan ranking. Every change is done by the server function "community"; history and new messages come straight from
// the database (live). Chat rules are confirmed once before writing; players can report messages and block players.
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Coin } from '../components/Coin';
import { ConfirmButton } from '../components/ConfirmButton';
import { GameIcon } from '../components/GameIcon';
import { AVATARS } from '../game/avatars';
import { CloudSave } from '../game/cloudSave';
import {
  ChatMessage, ClanInfo, ClanMember, CommunityState, MyClan, chatHistory, clanRanking, communityAction, listClans, reportMessage, sendMessage, setBlocked,
  watchChat,
} from '../game/communityApi';
import { CHAT_RULES, CLAN_COST, CLAN_MAX, JoinMode, MESSAGE_MAX, clanChannel } from '../../supabase/functions/community/logic';

type Tab = 'chat' | 'clan' | 'ranking';
const ROLE_LABEL = { leader: 'Anführer', officer: 'Offizier', member: 'Mitglied' } as const;
const MODE_LABEL: Record<JoinMode, string> = { open: 'Offen', request: 'Auf Anfrage', closed: 'Geschlossen' };
const REPORT_REASONS = ['Beleidigung', 'Belästigung', 'Persönliche Daten', 'Spam / Werbung', 'Sonstiges'];
const EMBLEMS = () => AVATARS.filter((a) => !a.quest && a.active !== false).map((a) => a.id);

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString('de-DE', today ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function Community({ uid, coins, top, onAdopt }: {
  uid: string;
  coins: number;
  /** The shared top line (logo, coins, account). */
  top: ReactNode;
  onAdopt: (c: CloudSave) => void;
}) {
  const [tab, setTab] = useState<Tab>('chat');
  const [state, setState] = useState<CommunityState | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(action: string, args: Record<string, unknown> = {}, ok?: (data: Record<string, unknown>) => string) {
    if (busy) return false;
    setBusy(true);
    const r = await communityAction(action, args);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.reason);
      return false;
    }
    setState(r.state);
    if (r.cloud) onAdopt(r.cloud);
    setMessage(ok ? ok(r.data) : '');
    return true;
  }

  useEffect(() => {
    communityAction('overview').then((r) => (r.ok ? setState(r.state) : setError(r.reason)));
  }, []);

  return (
    <main className="screen community">
      {top}
      <h2 className="menu-sub-title tab-title">Community</h2>
      <div className="segmented community-tabs" role="tablist">
        {([['chat', 'Chat'], ['clan', state?.clan ? `[${state.clan.tag}]` : 'Clans'], ['ranking', 'Rangliste']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMessage(''); }}>
            {label}{id === 'clan' && (state?.clan?.requests.length ?? 0) > 0 && <span className="seg-badge">{state!.clan!.requests.length}</span>}
          </button>
        ))}
      </div>
      {message && <p className="hint" aria-live="polite">{message}</p>}
      {!state ? <p className="muted center">{error || 'Lädt …'}</p> : (
        <>
          {tab === 'chat' && <Chat uid={uid} state={state} act={act} busy={busy} onMessage={setMessage} />}
          {tab === 'clan' && (state.clan
            ? <ClanPage clan={state.clan} act={act} busy={busy} />
            : <ClanFinder state={state} coins={coins} act={act} busy={busy} />)}
          {tab === 'ranking' && <Ranking />}
        </>
      )}
    </main>
  );
}

type Act = (action: string, args?: Record<string, unknown>, ok?: (data: Record<string, unknown>) => string) => Promise<boolean>;

// ---------- Chat ----------

function Chat({ uid, state, act, busy, onMessage }: { uid: string; state: CommunityState; act: Act; busy: boolean; onMessage: (m: string) => void }) {
  const channels = useMemo(() => [{ id: 'global', label: 'Allgemein' }, ...(state.clan ? [{ id: clanChannel(state.clan.id), label: `Clan [${state.clan.tag}]` }] : [])], [state.clan]);
  const [channel, setChannel] = useState('global');
  const [list, setList] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pick, setPick] = useState<ChatMessage | null>(null);
  const [blocked, setBlockedList] = useState<string[]>(state.blocked);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setBlockedList(state.blocked), [state.blocked]);
  useEffect(() => {
    if (!channels.some((c) => c.id === channel)) setChannel('global');
  }, [channels, channel]);

  useEffect(() => {
    let live = true;
    setList(null);
    chatHistory(channel).then((h) => live && setList(h ?? []));
    const stop = watchChat(channel, (m) => setList((l) => (l && !l.some((x) => x.id === m.id) ? [...l, m].slice(-200) : l)));
    return () => {
      live = false;
      stop();
    };
  }, [channel]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [list?.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const r = await sendMessage(channel, text);
    setSending(false);
    if (!r.ok) return onMessage(r.reason);
    setText('');
    onMessage('');
    // Shown right away (the live update may take a moment).
    chatHistory(channel, 60).then((h) => h && setList(h));
  }

  const muted = state.mutedUntil && Date.parse(state.mutedUntil) > Date.now();
  const shown = (list ?? []).filter((m) => !blocked.includes(m.player_id));

  return (
    <div className="chat">
      {channels.length > 1 && (
        <div className="chips" role="tablist">
          {channels.map((c) => <button key={c.id} type="button" role="tab" aria-selected={channel === c.id} className={`chip ${channel === c.id ? 'active' : ''}`} onClick={() => setChannel(c.id)}>{c.label}</button>)}
        </div>
      )}
      <div className="chat-list" aria-live="polite">
        {list === null ? <p className="muted center">Lädt …</p> : shown.length === 0 ? <p className="muted center">Noch keine Nachrichten – schreib die erste!</p> : shown.map((m) => {
          const mine = m.player_id === uid;
          return (
            <button key={m.id} type="button" className={`chat-msg ${mine ? 'mine' : ''}`} onClick={() => !mine && setPick(m)} aria-label={`${m.name}: ${m.body}${mine ? '' : ' – antippen zum Melden oder Blockieren'}`}>
              {!mine && <Avatar id={m.avatar} size={30} />}
              <span className="chat-bubble">
                <span className="chat-head">{!mine && <b>{m.name}</b>}{m.clan_tag && <span className="chat-tag">[{m.clan_tag}]</span>}<small>{time(m.created_at)}</small></span>
                <span className="chat-body">{m.body}</span>
              </span>
            </button>
          );
        })}
        <div ref={end} />
      </div>
      {!state.rulesAccepted ? (
        <div className="chat-rules">
          <b>Chat-Regeln</b>
          <ul>{CHAT_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('rules-accept', {}, () => 'Danke! Viel Spaß beim Schreiben.')}>Verstanden – ich halte mich daran</button>
        </div>
      ) : muted ? (
        <p className="shop-note chat-muted">Du bist im Chat stummgeschaltet bis {new Date(state.mutedUntil!).getFullYear() > 2100 ? 'auf Weiteres' : time(state.mutedUntil!)}.{state.muteReason ? ` Grund: ${state.muteReason}` : ''}</p>
      ) : (
        <form className="chat-input" onSubmit={send}>
          <input className="admin-input" value={text} maxLength={MESSAGE_MAX} placeholder={channel === 'global' ? 'Nachricht an alle …' : 'Nachricht an deinen Clan …'} onChange={(e) => setText(e.target.value)} aria-label="Nachricht" enterKeyHint="send" />
          <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()} aria-label="Senden"><GameIcon name="next" /></button>
        </form>
      )}

      {pick && (
        <div className="modal-backdrop" onClick={() => setPick(null)} role="dialog" aria-modal="true" aria-label="Nachricht">
          <div className="modal chat-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="chat-sheet-msg"><b>{pick.name}</b>: {pick.body}</p>
            <h3>Melden</h3>
            <div className="chat-reasons">
              {REPORT_REASONS.map((r) => (
                <button key={r} type="button" className="btn btn-small" onClick={async () => {
                  const ok = await reportMessage(pick.id, r);
                  setPick(null);
                  onMessage(ok ? 'Danke – ein Admin schaut sich die Nachricht an.' : 'Melden hat nicht geklappt.');
                }}>{r}</button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPick(null)}>Abbrechen</button>
              <button type="button" className="btn btn-danger" onClick={async () => {
                const ok = await setBlocked(uid, pick.player_id, true);
                if (ok) setBlockedList((b) => [...b, pick.player_id]);
                onMessage(ok ? `${pick.name} ist blockiert – du siehst die Nachrichten nicht mehr.` : 'Blockieren hat nicht geklappt.');
                setPick(null);
              }}>{pick.name} blockieren</button>
            </div>
          </div>
        </div>
      )}
      {blocked.length > 0 && (
        <details className="chat-blocked">
          <summary>{blocked.length} blockiert</summary>
          {blocked.map((b) => (
            <button key={b} type="button" className="link-btn" onClick={async () => {
              if (await setBlocked(uid, b, false)) setBlockedList((x) => x.filter((y) => y !== b));
            }}>Blockierung aufheben ({(list ?? []).find((m) => m.player_id === b)?.name ?? 'Spieler'})</button>
          ))}
        </details>
      )}
    </div>
  );
}

// ---------- Clans ----------

function ClanBadge({ clan }: { clan: ClanInfo }) {
  return (
    <span className="clan-badge">
      <Avatar id={clan.emblem} size={44} />
      <span className="clan-badge-text"><b>[{clan.tag}] {clan.name}</b><small>{clan.members}/{CLAN_MAX} Mitglieder · {MODE_LABEL[clan.joinMode]} · {clan.weekPoints} Punkte diese Woche</small></span>
    </span>
  );
}

function ClanFinder({ state, coins, act, busy }: { state: CommunityState; coins: number; act: Act; busy: boolean }) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ClanInfo[] | null>(null);
  const [found, setFound] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', description: '', joinMode: 'open' as JoinMode, emblem: 'av02' });
  useEffect(() => {
    const t = setTimeout(() => listClans(query).then((l) => setList(l ?? [])), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query]);

  if (found) {
    return (
      <div className="scroll">
        <form className="clan-form" onSubmit={(e) => { e.preventDefault(); act('clan-create', form, () => 'Dein Clan ist gegründet!'); }}>
          <h3>Clan gründen <small className="muted">kostet <Coin /> {CLAN_COST}</small></h3>
          <label className="field"><span>Name (3–20 Zeichen)</span><input className="admin-input" value={form.name} maxLength={20} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Kürzel (2–4 Buchstaben, z. B. WOLF)</span><input className="admin-input" value={form.tag} maxLength={4} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} /></label>
          <label className="field"><span>Beschreibung (freiwillig)</span><input className="admin-input" value={form.description} maxLength={160} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <span className="field"><span>Beitritt</span>
            <span className="segmented">{(['open', 'request', 'closed'] as JoinMode[]).map((m) => <button key={m} type="button" className={`seg ${form.joinMode === m ? 'active' : ''}`} onClick={() => setForm({ ...form, joinMode: m })}>{MODE_LABEL[m]}</button>)}</span>
          </span>
          <span className="field"><span>Wappen</span>
            <span className="emblem-pick">{EMBLEMS().map((id) => <button key={id} type="button" className={`emblem ${form.emblem === id ? 'on' : ''}`} onClick={() => setForm({ ...form, emblem: id })} aria-label={`Wappen ${id}`}><Avatar id={id} size={44} /></button>)}</span>
          </span>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setFound(false)}>Zurück</button>
            <button type="submit" className="btn btn-primary" disabled={busy || coins < CLAN_COST}>Gründen <Coin /> {CLAN_COST}</button>
          </div>
          {coins < CLAN_COST && <p className="muted small">Dir fehlen noch <Coin /> {CLAN_COST - coins}.</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="scroll">
      <p className="muted">Gemeinsam spielen: Jeder Sieg eines Mitglieds bringt dem Clan 10 Punkte. Die besten Clans der Woche stehen in der Rangliste.</p>
      <button type="button" className="btn btn-primary btn-wide" onClick={() => setFound(true)}>Eigenen Clan gründen <Coin /> {CLAN_COST}</button>
      <input className="admin-input clan-search" value={query} placeholder="Clan suchen (Name oder Kürzel)" onChange={(e) => setQuery(e.target.value)} aria-label="Clan suchen" />
      {list === null ? <p className="muted center">Lädt …</p> : list.length === 0 ? <p className="shop-note">Noch keine Clans gefunden – gründe den ersten!</p> : (
        <ul className="clan-list">
          {list.map((c) => {
            const asked = state.requested.includes(c.id);
            return (
              <li key={c.id} className="clan-row">
                <ClanBadge clan={c} />
                {c.description && <p className="clan-desc">{c.description}</p>}
                {asked ? <button type="button" className="btn btn-small" disabled={busy} onClick={() => act('clan-cancel', { clanId: c.id }, () => 'Anfrage zurückgezogen.')}>Angefragt ✓ – zurückziehen</button>
                  : c.joinMode === 'closed' ? <span className="muted small">Nimmt gerade niemanden auf</span>
                  : c.members >= CLAN_MAX ? <span className="muted small">Voll</span>
                  : <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => act('clan-join', { clanId: c.id }, (d) => (d.result === 'joined' ? `Willkommen bei [${c.tag}]!` : 'Anfrage gesendet – der Clan entscheidet.'))}>{c.joinMode === 'open' ? 'Beitreten' : 'Anfragen'}</button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ClanPage({ clan, act, busy }: { clan: MyClan; act: Act; busy: boolean }) {
  const [desc, setDesc] = useState(clan.description);
  const [pick, setPick] = useState<ClanMember | null>(null);
  useEffect(() => setDesc(clan.description), [clan.description]);
  const lead = clan.role === 'leader';
  const staff = clan.role !== 'member';
  return (
    <div className="scroll">
      <section className="clan-head">
        <ClanBadge clan={clan} />
        <p className="clan-points"><b>{clan.weekPoints}</b> Punkte diese Woche · <b>{clan.totalPoints}</b> insgesamt · du bist <b>{ROLE_LABEL[clan.role]}</b></p>
        {clan.description && !lead && <p className="clan-desc">{clan.description}</p>}
      </section>

      {lead && (
        <section className="clan-settings">
          <label className="field"><span>Beschreibung</span>
            <input className="admin-input" value={desc} maxLength={160} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== clan.description && act('clan-edit', { description: desc }, () => 'Gespeichert ✓')} />
          </label>
          <span className="field"><span>Beitritt</span>
            <span className="segmented">{(['open', 'request', 'closed'] as JoinMode[]).map((m) => <button key={m} type="button" className={`seg ${clan.joinMode === m ? 'active' : ''}`} disabled={busy} onClick={() => act('clan-edit', { joinMode: m }, () => `Beitritt: ${MODE_LABEL[m]}`)}>{MODE_LABEL[m]}</button>)}</span>
          </span>
        </section>
      )}

      {staff && clan.requests.length > 0 && (
        <section>
          <h3 className="section-title">Anfragen</h3>
          <ul className="member-list">
            {clan.requests.map((r) => (
              <li key={r.id} className="member">
                <Avatar id={r.avatar} size={36} /><span className="member-name">{r.name}</span>
                <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => act('clan-answer', { playerId: r.id, accept: true }, () => `${r.name} ist jetzt im Clan.`)}>Aufnehmen</button>
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => act('clan-answer', { playerId: r.id, accept: false }, () => 'Anfrage abgelehnt.')}>Ablehnen</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3 className="section-title">Mitglieder <small className="muted">{clan.list.length}/{CLAN_MAX}</small></h3>
      <ul className="member-list">
        {clan.list.map((m) => (
          <li key={m.id} className={`member ${m.me ? 'me' : ''}`}>
            <Avatar id={m.avatar} size={36} />
            <span className="member-name">{m.name}{m.me ? ' (du)' : ''}<small className={`role role-${m.role}`}>{ROLE_LABEL[m.role]}</small></span>
            <span className="member-points"><b>{m.weekPoints}</b><small>Woche</small></span>
            {!m.me && (lead || (staff && m.role === 'member')) && <button type="button" className="btn btn-small" onClick={() => setPick(m)} aria-label={`${m.name} verwalten`}>…</button>}
          </li>
        ))}
      </ul>
      <div className="clan-leave">
        <ConfirmButton label="Clan verlassen" confirmLabel={clan.list.length === 1 ? 'Wirklich? Der Clan wird aufgelöst' : 'Wirklich verlassen?'}
          onConfirm={() => act('clan-leave', {}, (d) => (d.result === 'dissolved' ? 'Der Clan ist aufgelöst.' : 'Du hast den Clan verlassen.'))} />
      </div>

      {pick && (
        <div className="modal-backdrop" onClick={() => setPick(null)} role="dialog" aria-modal="true" aria-label={`${pick.name} verwalten`}>
          <div className="modal chat-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{pick.name} <small className="muted">{ROLE_LABEL[pick.role]}</small></h3>
            <div className="chat-reasons">
              {lead && pick.role === 'member' && <button type="button" className="btn btn-small" onClick={() => { act('clan-role', { playerId: pick.id, role: 'officer' }, () => `${pick.name} ist jetzt Offizier.`); setPick(null); }}>Zum Offizier machen</button>}
              {lead && pick.role === 'officer' && <button type="button" className="btn btn-small" onClick={() => { act('clan-role', { playerId: pick.id, role: 'member' }, () => `${pick.name} ist jetzt Mitglied.`); setPick(null); }}>Zum Mitglied machen</button>}
              {lead && <ConfirmButton label="Anführung übergeben" confirmLabel="Wirklich übergeben?" onConfirm={() => { act('clan-role', { playerId: pick.id, role: 'leader' }, () => `${pick.name} führt jetzt den Clan.`); setPick(null); }} />}
              <ConfirmButton label="Aus dem Clan entfernen" confirmLabel="Wirklich entfernen?" onConfirm={() => { act('clan-kick', { playerId: pick.id }, () => `${pick.name} wurde entfernt.`); setPick(null); }} />
            </div>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setPick(null)}>Schließen</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Ranking ----------

function Ranking() {
  const [data, setData] = useState<{ clans: ClanInfo[]; mine: ClanInfo | null } | null | 'error'>(null);
  useEffect(() => {
    clanRanking().then((r) => setData(r ?? 'error'));
  }, []);
  if (data === null) return <p className="muted center">Lädt …</p>;
  if (data === 'error') return <p className="muted center">Die Rangliste ist gerade nicht erreichbar.</p>;
  return (
    <div className="scroll">
      <p className="muted">Clanpunkte dieser Woche (10 pro Sieg eines Mitglieds) – neu ab Montag 0 Uhr.</p>
      {data.mine && <p className="clan-mine">Dein Clan [{data.mine.tag}]: {data.mine.rank ? <><b>Platz {data.mine.rank}</b> mit {data.mine.weekPoints} Punkten</> : 'diese Woche noch ohne Punkte'}</p>}
      {data.clans.length === 0 ? <p className="shop-note">Diese Woche hat noch kein Clan Punkte gesammelt.</p> : (
        <ol className="clan-ranking">
          {data.clans.map((c) => (
            <li key={c.id} className={`rank-row ${data.mine?.id === c.id ? 'me' : ''}`}>
              <span className="rank-no">{c.rank}</span>
              <Avatar id={c.emblem} size={34} />
              <span className="rank-name">[{c.tag}] {c.name}<small>{c.members} Mitglieder</small></span>
              <b className="rank-points">{c.weekPoints}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
