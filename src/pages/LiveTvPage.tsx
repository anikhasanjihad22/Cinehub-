// @ts-nocheck
import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {LuSearch, LuRefreshCw, LuTv} from 'react-icons/lu';
import {loadLiveChannels, liveChannelPlayerState} from '../lib/liveTv';
import type {LiveChannel} from '../lib/liveTv';

let cache: {channels: LiveChannel[]; failed: number; noSources: boolean; at: number} = {channels: [], failed: 0, noSources: false, at: 0};

const ChannelCard = ({ch, onPlay}: {ch: LiveChannel; onPlay: (c: LiveChannel) => void}) => {
  const [bad, setBad] = useState(false);
  return (
    <button className="live-card" title={ch.name} onClick={() => onPlay(ch)}>
      <div className="live-logo">
        {ch.logo && !bad ? <img src={ch.logo} alt="" loading="lazy" onError={() => setBad(true)} /> : <LuTv size={44} />}
        <span className="live-dot">● LIVE</span>
      </div>
      <div className="live-name">{ch.name}</div>
    </button>
  );
};

const Row = ({title, list, onPlay}: {title: string; list: LiveChannel[]; onPlay: (c: LiveChannel) => void}) => (
  <section className="live-row">
    <h3>{title} <span className="count">{list.length}</span></h3>
    <div className="live-track">{list.map(c => <ChannelCard key={c.id} ch={c} onPlay={onPlay} />)}</div>
  </section>
);

export const LiveTvPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState(cache);
  const [loading, setLoading] = useState(cache.at === 0);
  const [query, setQuery] = useState('');

  const load = async (force: boolean) => {
    if (!force && cache.at && Date.now() - cache.at < 10 * 60 * 1000) {
      setState(cache);
      return;
    }
    setLoading(true);
    try {
      const r = await loadLiveChannels();
      if (r.channels.length || r.noSources) cache = {...r, at: Date.now()};
      else cache = {...cache, failed: r.failed, noSources: false};
    } catch {
      // keep the previous list
    }
    setState(cache);
    setLoading(false);
  };
  useEffect(() => {
    void load(false);
  }, []);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, LiveChannel[]>();
    state.channels.forEach(c => {
      if (q && !c.name.toLowerCase().includes(q)) return;
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    });
    return [...map.entries()];
  }, [state, query]);

  const play = (ch: LiveChannel) => navigate('/player', {state: liveChannelPlayerState(ch)});

  return (
    <div className="cinehub-page">
      <div className="page-head">
        <h1 className="page-title">Live TV</h1>
        <button className="icon-btn" title="Refresh" onClick={() => load(true)}><LuRefreshCw size={22} className={loading ? 'spin' : ''} /></button>
      </div>
      {state.channels.length > 0 && (
        <div className="searchbar"><LuSearch size={20} /><input placeholder="Search channels" value={query} onChange={e => setQuery(e.target.value)} /></div>
      )}
      {loading && state.channels.length === 0 && <div className="loading"><span className="spin big" /></div>}
      {!loading && sections.length === 0 && (
        <div className="empty">
          <LuTv size={56} />
          <h3>{state.noSources ? 'No channels yet' : query ? 'No matching channels' : state.failed ? 'Channels are unavailable' : 'No channels yet'}</h3>
          <p>{state.noSources ? 'Live channels are added by the CineHub admin.' : query ? 'Try another channel name.' : 'The channel list could not be reached. Check your internet and refresh.'}</p>
        </div>
      )}
      {sections.map(([cat, list]) => <Row key={cat} title={cat} list={list} onPlay={play} />)}
    </div>
  );
};
