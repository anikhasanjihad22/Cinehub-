// @ts-nocheck
import {useEffect, useState} from 'react';

const TITLE = 'CINEHUB'.split('');

/** Opening animation: plays on every app launch, then zooms into the app. */
export const CinematicIntro = () => {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setOut(true), 2650);
    const b = setTimeout(() => setGone(true), 3350);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`cinehub-intro${out ? ' out' : ''}`} aria-hidden="true">
      <div className="i-flash" />
      <div className="i-center">
        <div className="i-mark">
          <span className="i-ring r1" />
          <span className="i-ring r2" />
          <img src="/cinehub-logo.png" alt="" />
        </div>
        <div className="i-title">
          {TITLE.map((ch, i) => (
            <span key={i} className={i >= 4 ? 'red' : ''} style={{['--i' as any]: i}}>{ch}</span>
          ))}
        </div>
        <div className="i-streak" />
      </div>
    </div>
  );
};
