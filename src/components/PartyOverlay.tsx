// @ts-nocheck
import {useEffect, useState} from 'react';
import {LuUsers} from 'react-icons/lu';
import usePartyStore from '../lib/watchParty/watchParty';

const EMOJIS = ['❤️', '😂', '😮', '👏', '🔥'];

const Floating = ({id, emoji, name}: {id: string; emoji: string; name: string}) => {
  const drop = usePartyStore(s => s.dropReaction);
  const [right] = useState(() => 8 + Math.random() * 40);
  useEffect(() => {
    const t = setTimeout(() => drop(id), 2700);
    return () => clearTimeout(t);
  }, [id, drop]);
  return (
    <div className="party-react" style={{right}}>
      <div style={{fontSize: 34}}>{emoji}</div>
      <div style={{fontSize: 10}}>{name}</div>
    </div>
  );
};

/** In-player Watch Together pill: who is here, quick reactions. */
export const PartyOverlay = () => {
  const code = usePartyStore(s => s.code);
  const members = usePartyStore(s => s.members);
  const reactions = usePartyStore(s => s.reactions);
  const sendReaction = usePartyStore(s => s.sendReaction);
  const [open, setOpen] = useState(false);
  if (!code) return null;
  return (
    <div className="party-layer">
      <div className="party-reactions">{reactions.map(r => <Floating key={r.id} {...r} />)}</div>
      <div className="party-box">
        <button className="party-pill" onClick={() => setOpen(o => !o)} title="Watch Together"><LuUsers size={16} /> {members.length}</button>
        {open && <div className="party-emoji">{EMOJIS.map(e => <button key={e} onClick={() => sendReaction(e)}>{e}</button>)}</div>}
      </div>
    </div>
  );
};
