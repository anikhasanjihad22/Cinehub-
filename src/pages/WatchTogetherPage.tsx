// @ts-nocheck
import {useRef, useState, useEffect} from 'react';
import {LuUsers, LuSend, LuLogOut, LuCopy} from 'react-icons/lu';
import usePartyStore, {normalizeCode} from '../lib/watchParty/watchParty';
import {toast} from '../lib/zustand/toastStore';

export const WatchTogetherPage = () => {
  const s = usePartyStore();
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [s.chat.length]);

  const run = async (kind: 'create' | 'join') => {
    if (busy) return;
    setError('');
    setBusy(kind);
    try {
      if (kind === 'create') await s.createRoom();
      else await s.joinRoom(joinCode);
    } catch (e: any) {
      setError(e && e.message ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  const send = () => {
    s.sendChat(message);
    setMessage('');
  };

  if (!s.code) {
    return (
      <div className="cinehub-page narrow">
        <h1 className="page-title">Watch Together</h1>
        <div className="party-hero">
          <div className="party-icon"><LuUsers size={46} /></div>
          <p>Watch the same movie or show at the same time with family and friends. Play, pause and seek stay in sync, on phones, TVs and PCs.</p>
        </div>
        <button className="cta" disabled={!!busy} onClick={() => run('create')}>{busy === 'create' ? 'Creating…' : 'Create a room'}</button>
        <div className="or">or join a friend</div>
        <input className="code-input" placeholder="ROOM CODE" maxLength={6} value={joinCode} onChange={e => setJoinCode(normalizeCode(e.target.value))} onKeyDown={e => e.key === 'Enter' && run('join')} />
        <button className="cta ghost" disabled={!!busy} onClick={() => run('join')}>{busy === 'join' ? 'Joining…' : 'Join room'}</button>
        {error && <div className="auth-err">{error}</div>}
      </div>
    );
  }

  return (
    <div className="cinehub-page narrow">
      <h1 className="page-title">Watch Together</h1>
      <div className="panel center">
        <div className="muted small">{s.status === 'connected' ? 'ROOM CODE' : 'CONNECTING…'}</div>
        <div className="code-tiles">{s.code.split('').map((ch, i) => <span key={i}>{ch}</span>)}</div>
        <button className="cta ghost" onClick={() => { void navigator.clipboard.writeText(s.code!); toast('Code copied'); }}><LuCopy size={18} /> Copy code</button>
      </div>
      <div className="panel">
        <div className="muted small">NOW PLAYING</div>
        <div className="now">{(s.content && s.content.title) || (s.isHost ? 'Open any movie or episode and press play. Everyone joins automatically.' : 'Waiting for the host to pick something…')}</div>
      </div>
      <div className="panel">
        <div className="muted small">WATCHING ({s.members.length})</div>
        {s.members.map(m => (
          <div key={m.key} className="member">
            <div className="avatar" style={{background: m.color || '#E50914'}}>{(m.name || '?').slice(0, 1).toUpperCase()}</div>
            <span>{m.name}</span>
            {m.host && <span className="host-badge">HOST</span>}
          </div>
        ))}
        {s.isHost ? (
          <label className="toggle">
            <div><div>Only host controls playback</div><div className="muted small">Off: anyone can pause or seek for everyone.</div></div>
            <input type="checkbox" checked={s.hostOnly} onChange={e => s.setHostOnly(e.target.checked)} />
          </label>
        ) : (
          <div className="muted small">{s.hostOnly ? 'Only the host controls playback.' : 'Anyone can pause or seek.'}</div>
        )}
      </div>
      <div className="panel">
        <div className="muted small">CHAT</div>
        <div className="chat-list" ref={chatRef}>
          {s.chat.length === 0 ? <span className="muted">No messages yet.</span> : s.chat.map(m => <div key={m.id} className="chat-msg"><b className={m.mine ? 'me' : ''}>{m.mine ? 'You' : m.name}: </b>{m.text}</div>)}
        </div>
        <div className="chat-row">
          <input className="chat-input" placeholder="Say something…" maxLength={300} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
          <button className="cta small" onClick={send}><LuSend size={18} /></button>
        </div>
      </div>
      <button className="cta ghost" onClick={async () => { await s.leaveRoom(); toast('You left the room'); }}><LuLogOut size={18} /> Leave room</button>
    </div>
  );
};
