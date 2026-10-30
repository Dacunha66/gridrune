// Account screens of the web version: welcome (sign in / create account / play as guest), forgotten password,
// the new password after the e-mail link, and the player's own account page.
import { FormEvent, ReactNode, useState } from 'react';
import logoMark from '../assets/gridrune-mark.png';
import logoWord from '../assets/gridrune-wordmark.png';
import { Header } from './Header';
import { SaveData } from '../game/storage';
import { loadProgress } from '../game/campaignProgress';
import { ownedActiveIds } from '../game/cards';
import {
  Account, NAME_MAX, PASSWORD_MIN, describeAuthError, emailProblem, loginProblem, nameProblem, passwordProblem, sendPasswordMail, setDisplayName,
  setGuest, setNewPassword, signIn, signOut, signUp,
} from '../game/account';

type Mode = 'start' | 'login' | 'register' | 'forgot';

/** Shown before the menu when nobody is signed in and the player has not chosen to play as a guest. */
export function Welcome({ onGuest }: { onGuest: () => void }) {
  const [mode, setMode] = useState<Mode>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setDone('');
  };

  async function run(check: (string | null)[], action: () => Promise<string | void>) {
    const problem = check.find(Boolean);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      const message = await action();
      if (message) setDone(message);
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'login') {
      run([loginProblem(email), password ? null : 'Bitte das Passwort eingeben.'], () => signIn(email, password));
    } else if (mode === 'register') {
      run([nameProblem(name), emailProblem(email), passwordProblem(password)], async () => {
        const result = await signUp(email, password, name);
        if (result === 'confirm') return `Fast geschafft! Wir haben dir eine E-Mail an ${email.trim()} geschickt. Tippe auf den Link darin, um dein Konto zu bestätigen – danach bist du angemeldet.`;
      });
    } else if (mode === 'forgot') {
      run([emailProblem(email)], async () => {
        await sendPasswordMail(email);
        return 'Wenn es zu dieser E-Mail ein Konto gibt, bekommst du gleich einen Link, mit dem du ein neues Passwort festlegst.';
      });
    }
  };

  return (
    <main className="screen account-screen">
      <div className="logo small-logo">
        <h1 className="brand">
          <img className="brand-mark" src={logoMark} alt="" />
          <img className="brand-word" src={logoWord} alt="GridRune" />
        </h1>
      </div>
      {mode === 'start' ? (
        <div className="account-card">
          <p>Mit einem Konto werden deine Karten, Münzen und dein Kampagnen-Fortschritt gespeichert – auf jedem Gerät.</p>
          <button type="button" className="btn btn-primary btn-big" onClick={() => go('login')}>Anmelden</button>
          <button type="button" className="btn" onClick={() => go('register')}>Konto erstellen</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setGuest(true); onGuest(); }}>Als Gast spielen</button>
          <p className="fineprint">Als Gast bleibt dein Fortschritt nur in diesem Browser auf diesem Gerät. Du kannst später jederzeit ein Konto erstellen.</p>
        </div>
      ) : (
        <form className="account-card" onSubmit={submit} noValidate>
          <h2>{mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Passwort vergessen'}</h2>
          {done ? (
            <p className="account-done" role="status">{done}</p>
          ) : (
            <>
              {mode === 'register' && (
                <Field label="Spielername" hint={`2–${NAME_MAX} Zeichen, einmalig – damit meldest du dich an`}>
                  <input className="admin-input" value={name} maxLength={NAME_MAX} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
                </Field>
              )}
              {mode === 'login' ? (
                <Field label="Spielername oder E-Mail">
                  <input className="admin-input" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              ) : (
                <Field label="E-Mail" hint={mode === 'register' ? 'nur für die Bestätigung und „Passwort vergessen“ – nicht sichtbar für andere' : undefined}>
                  <input className="admin-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              )}
              {mode !== 'forgot' && (
                <Field label="Passwort" hint={mode === 'register' ? `mindestens ${PASSWORD_MIN} Zeichen` : undefined}>
                  <input className="admin-input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              )}
              {error && <p className="admin-warning" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
                {busy ? '…' : mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Link schicken'}
              </button>
              {mode === 'login' && <button type="button" className="btn btn-ghost" onClick={() => go('forgot')}>Passwort vergessen?</button>}
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => go('start')}>◀ Zurück</button>
        </form>
      )}
    </main>
  );
}

/** After the "new password" link: choose a new password. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await setNewPassword(password);
      onDone();
    } catch (err) {
      setError(describeAuthError(err));
      setBusy(false);
    }
  }
  return (
    <main className="screen account-screen">
      <form className="account-card" onSubmit={submit} noValidate>
        <h2>Neues Passwort</h2>
        <Field label="Neues Passwort" hint={`mindestens ${PASSWORD_MIN} Zeichen`}>
          <input className="admin-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="admin-warning" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>{busy ? '…' : 'Passwort speichern'}</button>
      </form>
    </main>
  );
}

/** The signed-in player's account page: name, e-mail, new password by e-mail, sign out. */
export function AccountPage({ account, onBack, onRenamed }: { account: Account; onBack: () => void; onRenamed: (name: string) => void }) {
  const [name, setName] = useState(account.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function act(action: () => Promise<string>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setMessage(await action());
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === '23514' ? 'Dieser Name ist nicht erlaubt.' : describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }
  const nameErr = name.trim() === account.name ? null : nameProblem(name);
  return (
    <main className="screen account-screen">
      <Header title="Mein Konto" onBack={onBack} />
      <div className="scroll">
        <div className="account-card">
          <Field label="Spielername">
            <input className="admin-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </Field>
          {nameErr && <p className="admin-warning">{nameErr}</p>}
          <button type="button" className="btn" disabled={busy || !!nameErr || name.trim() === account.name}
            onClick={() => act(async () => { await setDisplayName(account, name); onRenamed(name.trim()); return 'Name gespeichert ✓'; })}>
            Name speichern
          </button>
          <p className="small">E-Mail: <b>{account.email}</b></p>
          <button type="button" className="btn" disabled={busy}
            onClick={() => act(async () => { await sendPasswordMail(account.email); return 'Wir haben dir einen Link für ein neues Passwort geschickt.'; })}>
            Passwort ändern (Link per E-Mail)
          </button>
          {message && <p className="account-done" role="status">{message}</p>}
          {error && <p className="admin-warning" role="alert">{error}</p>}
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act(async () => { await signOut(); return ''; })}>Abmelden</button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** Signed in, but the account save is not ready: loading, first sign-in (take over browser progress?) or offline. */
export function CloudGate({ phase, notice, browserSave, onChoose, onRetry }: {
  phase: 'loading' | 'choose' | 'offline' | 'guest' | 'ready';
  notice: string;
  browserSave: SaveData;
  onChoose: (takeOver: boolean) => void;
  onRetry: () => void;
}) {
  const progress = loadProgress();
  const stars = Object.values(progress.missions).reduce((n, m) => n + m.stars.filter(Boolean).length, 0);
  const cards = ownedActiveIds(browserSave.unlocked).length;
  return (
    <main className="screen account-screen">
      <div className="logo small-logo">
        <h1 className="brand">
          <img className="brand-mark" src={logoMark} alt="" />
          <img className="brand-word" src={logoWord} alt="GridRune" />
        </h1>
      </div>
      <div className="account-card">
        {phase === 'choose' ? (
          <>
            <h2>Willkommen in deinem Konto!</h2>
            {notice && <p className="admin-warning">{notice}</p>}
            <p>Möchtest du deinen bisherigen Spielstand aus diesem Browser in dein Konto übernehmen? Das geht nur jetzt, einmal.</p>
            <ul className="plain-list">
              <li>🃏 {cards} Karten · 🪙 {browserSave.coins} Münzen</li>
              <li>⭐ {stars} Kampagnen-Sterne · 🏆 {browserSave.stats.wins} Siege</li>
            </ul>
            <button type="button" className="btn btn-primary btn-big" onClick={() => onChoose(true)}>Spielstand übernehmen</button>
            <button type="button" className="btn" onClick={() => onChoose(false)}>Neu beginnen</button>
            <p className="fineprint">Der Browser-Spielstand bleibt außerdem für das Spielen als Gast erhalten.</p>
          </>
        ) : phase === 'offline' ? (
          <>
            <h2>Keine Verbindung</h2>
            <p>Dein Spielstand konnte nicht geladen werden. Bitte prüfe deine Internetverbindung.</p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>Erneut versuchen</button>
          </>
        ) : (
          <p className="center">☁️ Dein Spielstand wird geladen …</p>
        )}
      </div>
    </main>
  );
}
