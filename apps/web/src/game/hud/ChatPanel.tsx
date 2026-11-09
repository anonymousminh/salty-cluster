import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { MAX_CHAT_LENGTH } from '@meetspace/venue';
import { track } from '../../telemetry';
import { realtime } from '../net/client';
import { totalUnread, useNet, type ChatLine, type ChatTab } from '../net/store';
import { useGame } from '../store';
import './chat.css';

/** While any chat input has focus, movement keys type instead of walking. */
function LockedInput({
  inputRef,
  ...props
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const setFocused = useNet((s) => s.setChatFocused);
  const stop = (e: KeyboardEvent) => e.stopPropagation(); // keep W/A/S/D/Space away from the game's key listeners
  return (
    <input
      {...props}
      ref={inputRef}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        stop(e);
        props.onKeyDown?.(e);
      }}
      onKeyUp={stop}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

/** Nearby chat, private messages and the player list. Needs the game server (api mode). */
export function ChatPanel({ available }: { available: boolean }) {
  const open = useNet((s) => s.panelOpen);
  const status = useNet((s) => s.status);
  const unread = useNet(totalUnread);
  const setPanel = useNet((s) => s.setPanel);
  const nearby = useNet((s) => s.nearby);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enter opens the chat and focuses the box (when not typing, in a dialog, or in a demo).
  useEffect(() => {
    if (!available) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const g = useGame.getState();
      if (g.phase !== 'playing' || g.openBoothId || document.querySelector('.demo-overlay')) return;
      e.preventDefault();
      useNet.getState().setPanel(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available]);

  // A faded preview of the last few messages while the panel is closed.
  const [, force] = useState(0);
  const recent = nearby.filter((l) => Date.now() - l.at < 9000).slice(-3);
  useEffect(() => {
    if (open || recent.length === 0) return;
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [open, recent.length]);

  if (!available) {
    return (
      <div className="chat chat--off" title="Chat needs the live game server. You are in the offline demo.">
        <span className="chat__toggle chat__toggle--disabled">💬 Chat · needs the game server</span>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="chat">
        {recent.length > 0 && (
          <div className="chat__ticker" aria-live="polite">
            {recent.map((l) => (
              <div key={l.id} className="chat__ticker-line">
                <b>{l.mine ? 'You' : l.name}</b> {l.text}
              </div>
            ))}
          </div>
        )}
        <button
          className="chat__toggle"
          onClick={() => {
            setPanel(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          aria-label="Open chat"
        >
          💬 Chat
          {unread > 0 && <span className="chat__badge">{unread > 9 ? '9+' : unread}</span>}
          {status !== 'online' && <span className="chat__dot chat__dot--wait" title="Connecting…" />}
          <kbd>Enter</kbd>
        </button>
      </div>
    );
  }
  return <OpenPanel inputRef={inputRef} />;
}

function OpenPanel({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const tab = useNet((s) => s.tab);
  const status = useNet((s) => s.status);
  const online = useNet((s) => Object.keys(s.roster).length + (s.me ? 1 : 0));
  const unreadNearby = useNet((s) => s.unreadNearby);
  const unreadDms = useNet((s) => Object.values(s.unreadDms).reduce((a, b) => a + b, 0));
  const notice = useNet((s) => s.notice);
  const { setTab, setPanel } = useNet.getState();

  const tabBtn = (id: ChatTab, label: string, badge = 0) => (
    <button key={id} className={`chat__tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>
      {label}
      {badge > 0 && <span className="chat__badge">{badge > 9 ? '9+' : badge}</span>}
    </button>
  );

  return (
    <div className="chat chat--open" role="region" aria-label="Chat">
      <div className="chat__head">
        <div className="chat__tabs" role="tablist">
          {tabBtn('nearby', 'Nearby', unreadNearby)}
          {tabBtn('dms', 'Private', unreadDms)}
          {tabBtn('people', `People ${status === 'online' ? online : ''}`)}
        </div>
        <button className="chat__close" onClick={() => setPanel(false)} aria-label="Close chat">
          ✕
        </button>
      </div>
      {status !== 'online' && <div className="chat__status">{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</div>}
      {tab === 'nearby' && <NearbyView inputRef={inputRef} />}
      {tab === 'dms' && <DmsView inputRef={inputRef} />}
      {tab === 'people' && <PeopleView />}
      {notice && (
        <div className="chat__notice" role="alert">
          {notice}
        </div>
      )}
    </div>
  );
}

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function Line({ l, onName }: { l: ChatLine; onName?: (pid: string) => void }) {
  return (
    <div className={`chat__line${l.mine ? ' mine' : ''}`}>
      {l.mine || !onName ? (
        <b className="chat__name">{l.mine ? 'You' : l.name}</b>
      ) : (
        <button className="chat__name chat__name--link" onClick={() => onName(l.from)} title={`Message ${l.name}`}>
          {l.name}
        </button>
      )}
      <span className="chat__text">{l.text}</span>
    </div>
  );
}

function Composer({ inputRef, placeholder, onSend, disabled }: { inputRef: RefObject<HTMLInputElement | null>; placeholder: string; onSend: (text: string) => boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const setNotice = useNet((s) => s.setNotice);
  const setPanel = useNet((s) => s.setPanel);
  return (
    <form
      className="chat__composer"
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        if (onSend(text)) setDraft('');
        else setNotice('Not connected yet. Try again in a moment.');
      }}
    >
      <LockedInput
        inputRef={inputRef}
        value={draft}
        disabled={disabled}
        maxLength={MAX_CHAT_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            (e.target as HTMLInputElement).blur();
            if (!draft) setPanel(false);
          }
        }}
      />
      <button type="submit" disabled={disabled || !draft.trim()}>
        Send
      </button>
    </form>
  );
}

function NearbyView({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const lines = useNet((s) => s.nearby);
  const openDm = useNet((s) => s.openDm);
  const listRef = useAutoScroll(lines.length);
  return (
    <>
      <div className="chat__list" ref={listRef} aria-live="polite">
        {lines.length === 0 && <div className="chat__empty">Say hi. People within about 15 m will hear you.</div>}
        {lines.map((l) => (
          <Line key={l.id} l={l} onName={openDm} />
        ))}
      </div>
      <Composer
        inputRef={inputRef}
        placeholder="Say something nearby…"
        onSend={(text) => {
          const ok = realtime.say(text);
          if (ok) track('chat_sent', { kind: 'say' });
          return ok;
        }}
      />
    </>
  );
}

function DmsView({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const activeDm = useNet((s) => s.activeDm);
  const dms = useNet((s) => s.dms);
  const unread = useNet((s) => s.unreadDms);
  const roster = useNet((s) => s.roster);
  const muted = useNet((s) => s.muted);
  const openDm = useNet((s) => s.openDm);
  const toggleMute = useNet((s) => s.toggleMute);
  const thread = activeDm ? (dms[activeDm] ?? []) : [];
  const listRef = useAutoScroll(thread.length);
  const nameOf = (pid: string) => roster[pid]?.name ?? dms[pid]?.find((l) => !l.mine)?.name ?? 'Player';

  if (!activeDm) {
    const threads = Object.entries(dms).sort((a, b) => (b[1].at(-1)?.at ?? 0) - (a[1].at(-1)?.at ?? 0));
    return (
      <div className="chat__list">
        {threads.length === 0 && <div className="chat__empty">No private messages yet. Open the People tab, or click a name in chat, to start one.</div>}
        {threads.map(([pid, lines]) => (
          <button key={pid} className="chat__thread" onClick={() => openDm(pid)}>
            <span className="chat__thread-name">
              {nameOf(pid)}
              {!roster[pid] && <small> · offline</small>}
            </span>
            <span className="chat__thread-last">{lines.at(-1)?.text}</span>
            {(unread[pid] ?? 0) > 0 && <span className="chat__badge">{unread[pid]}</span>}
          </button>
        ))}
      </div>
    );
  }

  const here = !!roster[activeDm];
  const isMuted = muted.includes(activeDm);
  return (
    <>
      <div className="chat__dm-head">
        <button onClick={() => openDm(null)} aria-label="Back to conversations">
          ←
        </button>
        <b>{nameOf(activeDm)}</b>
        {!here && <small>offline</small>}
        <button className="chat__mute" onClick={() => toggleMute(activeDm)}>
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
      </div>
      <div className="chat__list" ref={listRef} aria-live="polite">
        {thread.length === 0 && <div className="chat__empty">Start the conversation with {nameOf(activeDm)}.</div>}
        {thread.map((l) => (
          <Line key={l.id} l={l} />
        ))}
      </div>
      <Composer
        inputRef={inputRef}
        placeholder={here ? `Message ${nameOf(activeDm)}…` : `${nameOf(activeDm)} is offline`}
        disabled={!here}
        onSend={(text) => {
          const ok = realtime.dm(activeDm, text);
          if (ok) track('chat_sent', { kind: 'dm' });
          return ok;
        }}
      />
    </>
  );
}

const PEOPLE_LIMIT = 50;

function PeopleView() {
  const roster = useNet((s) => s.roster);
  const visible = useNet((s) => s.visible);
  const muted = useNet((s) => s.muted);
  const openDm = useNet((s) => s.openDm);
  const toggleMute = useNet((s) => s.toggleMute);
  const [q, setQ] = useState('');
  const near = useMemo(() => new Set(visible), [visible]);
  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(roster)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(near.has(b.pid)) - Number(near.has(a.pid)) || a.name.localeCompare(b.name));
  }, [roster, q, near]);
  return (
    <>
      <div className="chat__search">
        <LockedInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone by name…" aria-label="Find someone by name" maxLength={40} onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()} />
      </div>
      <div className="chat__list">
        {people.length === 0 && <div className="chat__empty">{Object.keys(roster).length === 0 ? "You're the only one here right now." : 'Nobody by that name.'}</div>}
        {people.slice(0, PEOPLE_LIMIT).map((p) => (
          <div key={p.pid} className="chat__person">
            <span className="chat__swatch" style={{ background: p.color }} />
            <span className="chat__person-name">
              {p.name}
              {near.has(p.pid) && <small> · nearby</small>}
              {muted.includes(p.pid) && <small> · muted</small>}
            </span>
            <button onClick={() => openDm(p.pid)}>Message</button>
            <button className="chat__mute" onClick={() => toggleMute(p.pid)}>
              {muted.includes(p.pid) ? 'Unmute' : 'Mute'}
            </button>
          </div>
        ))}
        {people.length > PEOPLE_LIMIT && <div className="chat__empty">Showing {PEOPLE_LIMIT} of {people.length}. Search to narrow it down.</div>}
      </div>
    </>
  );
}
