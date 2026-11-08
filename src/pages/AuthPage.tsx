// @ts-nocheck
import {useEffect, useRef, useState} from 'react';
import {LuMail, LuLock, LuUser, LuEye, LuEyeOff, LuCheck} from 'react-icons/lu';
import useAuthStore from '../lib/zustand/authStore';
import {getCachedLoginPosters, refreshLoginPosters} from '../lib/loginPosters';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'done';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLES: Record<Mode, string> = {signin: 'Sign In', signup: 'Create Account', forgot: 'Reset Password', reset: 'Check Your Email', done: 'All Set'};

const PosterWall = () => {
  const [posters, setPosters] = useState<string[]>(() => getCachedLoginPosters());
  useEffect(() => {
    let alive = true;
    void refreshLoginPosters().then(urls => {
      if (alive && urls.length && urls.join() !== posters.join()) setPosters(urls);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!posters.length) return <div className="wall" />;
  return (
    <div className="wall">
      {Array.from({length: 8}).map((_, c) => {
        const imgs = Array.from({length: 14}).map((__, i) => posters[(c * 7 + i * 3) % posters.length]);
        return (
          <div key={c} className="wall-col" style={{animationDuration: `${60 + (c % 3) * 18}s`, animationDirection: c % 2 ? 'reverse' : 'normal'}}>
            {[...imgs, ...imgs].map((src, i) => <img key={i} src={src} loading="lazy" alt="" />)}
          </div>
        );
      })}
    </div>
  );
};

const OtpBoxes = ({value, onChange, onEnter}: {value: string; onChange: (v: string) => void; onEnter: () => void}) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const count = value.length > 6 ? 8 : 6;
  useEffect(() => {
    const t = setTimeout(() => refs.current[0] && refs.current[0]!.focus(), 300);
    return () => clearTimeout(t);
  }, []);
  const setAt = (i: number, ch: string) => {
    const chars = value.padEnd(count, ' ').split('');
    chars[i] = ch || ' ';
    onChange(chars.join('').replace(/\s+$/g, '').replace(/ /g, ''));
  };
  return (
    <div className="otp">
      {Array.from({length: count}).map((_, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          className="otp-box"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            setAt(i, d);
            if (d && refs.current[i + 1]) refs.current[i + 1]!.focus();
          }}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]!.focus();
            if (e.key === 'Enter') onEnter();
          }}
          onPaste={e => {
            e.preventDefault();
            const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 8);
            onChange(digits);
            const target = refs.current[Math.min(digits.length, count - 1)];
            if (target) target.focus();
          }}
        />
      ))}
    </div>
  );
};

export const AuthPage = () => {
  const {signIn, signUp, resetPassword, resetPasswordWithCode} = useAuthStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shake, setShake] = useState(0);
  const doneTimer = useRef<any>(null);

  useEffect(() => () => clearTimeout(doneTimer.current), []);

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };
  const fail = (msg: string) => {
    setNotice('');
    setError(msg);
    setShake(s => s + 1);
  };

  const submit = async () => {
    if (busy) return;
    setError('');
    setNotice('');
    if (mode === 'signup' && name.trim().length < 2) return fail('Please enter your name.');
    if (mode !== 'reset' && !EMAIL_RE.test(email.trim())) return fail('Enter a valid email address.');
    if (mode === 'reset' && !/^\d{6,8}$/.test(code)) return fail('Enter the code from your email.');
    if (mode !== 'forgot' && password.length < 6) {
      return fail(mode === 'reset' ? 'New password must be at least 6 characters.' : 'Password must be at least 6 characters.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        const r = await signUp(email, password, name);
        if (r.needsEmailConfirmation) {
          setMode('signin');
          setPassword('');
          setNotice('Account created! Check your email and confirm it, then sign in.');
        }
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setMode('reset');
        setPassword('');
        setCode('');
      } else if (mode === 'reset') {
        await resetPasswordWithCode(email, code, password);
        setPassword('');
        setCode('');
        setMode('done');
        doneTimer.current = setTimeout(() => {
          setMode('signin');
          setNotice('Password updated. Sign in with your new password.');
        }, 2400);
      }
    } catch (e: any) {
      fail(e && e.message ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    try {
      await resetPassword(email);
      setCode('');
      setError('');
      setNotice('A new code was sent to your email.');
    } catch (e: any) {
      fail(e && e.message ? e.message : 'Something went wrong.');
    }
  };

  const [n, d] = email.trim().split('@');
  const label = {signin: 'Sign In', signup: 'Sign Up', forgot: 'Send code', reset: 'Save new password', done: ''}[mode];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div className="auth">
      <PosterWall />
      <div className="auth-shade" />
      <div className="auth-beam" />
      <div className="auth-main">
        <div className="auth-brand">
          <div className="auth-logo"><div className="glow" /><img src="/cinehub-logo.png" alt="" /></div>
          <div className="auth-name">CINE<span>HUB</span></div>
          <div className="auth-tag">Unlimited movies, shows &amp; more</div>
        </div>

        <div key={shake} className={`auth-card${shake ? ' shake' : ''}`}>
          <div key={mode} className="auth-slide">
            <h2>{TITLES[mode]}</h2>
            {mode === 'forgot' && <p className="auth-sub">Enter your email and we'll send you a code to set a new password.</p>}
            {mode === 'reset' && (
              <div className="mailhead">
                <div className="mailicon"><LuMail size={30} /></div>
                <div>We sent a code to</div>
                <b>{(n || '').slice(0, 2)}••••@{d || ''}</b>
              </div>
            )}
            {mode === 'done' && (
              <div className="success">
                <div className="check"><LuCheck size={52} /></div>
                <p>Your password has been updated.</p>
              </div>
            )}
            {mode === 'signup' && (
              <label className="field"><LuUser size={20} /><input value={name} placeholder=" " onChange={e => setName(e.target.value)} onKeyDown={onKey} autoComplete="name" /><span className="flabel">Your name</span></label>
            )}
            {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
              <label className="field"><LuMail size={20} /><input value={email} placeholder=" " type="email" onChange={e => setEmail(e.target.value)} onKeyDown={onKey} autoComplete="email" /><span className="flabel">Email address</span></label>
            )}
            {mode === 'reset' && <OtpBoxes value={code} onChange={setCode} onEnter={submit} />}
            {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
              <label className="field">
                <LuLock size={20} />
                <input value={password} placeholder=" " type={show ? 'text' : 'password'} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
                <span className="flabel">{mode === 'reset' ? 'New password' : 'Password'}</span>
                <button type="button" className="eye" onClick={() => setShow(s => !s)}>{show ? <LuEyeOff size={20} /> : <LuEye size={20} />}</button>
              </label>
            )}
            {error && <div className="auth-err">{error}</div>}
            {notice && mode !== 'done' && <div className="auth-ok">{notice}</div>}
            {mode !== 'done' && <button className="cta" onClick={submit} disabled={busy}>{busy ? <span className="spin" /> : label}</button>}
            {mode === 'signin' && <button className="link" onClick={() => go('forgot')}>Forgot password?</button>}
            {mode === 'reset' && <button className="link" onClick={resend}>Didn't get it? Resend code</button>}
            {mode !== 'done' && (
              <div className="swap">
                {mode === 'signin' ? 'New to CineHub? ' : mode === 'signup' ? 'Already a member? ' : 'Remembered it? '}
                <button className="link strong" onClick={() => go(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Sign up now' : 'Sign in'}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
