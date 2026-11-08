import {h} from '../lib.js';
import * as backend from '../backend.js';

/** Sign in / sign up / forgot-password, same flows as the Android app. */
export const renderAuth = (root, {onDone}) => {
  let mode = 'signin';
  let busy = false;
  let message = '';
  let isError = false;
  const form = {email: '', password: '', name: '', code: ''};

  const set = (msg, err = false) => {
    message = msg;
    isError = err;
    draw();
  };

  const submit = async e => {
    e?.preventDefault();
    if (busy) return;
    busy = true;
    message = '';
    draw();
    try {
      if (mode === 'signin') {
        await backend.signIn(form.email, form.password);
        return onDone();
      }
      if (mode === 'signup') {
        if (form.name.trim().length < 2) throw new Error('Please enter your name.');
        const {needsEmailConfirmation} = await backend.signUp(form.email, form.password, form.name);
        if (!needsEmailConfirmation) return onDone();
        mode = 'signin';
        busy = false;
        return set('Account created. Confirm your email, then sign in.');
      }
      if (mode === 'forgot') {
        await backend.sendResetCode(form.email);
        mode = 'reset';
        busy = false;
        return set('We emailed you a code. Enter it with a new password.');
      }
      if (mode === 'reset') {
        await backend.resetWithCode(form.email, form.code, form.password);
        mode = 'signin';
        form.password = '';
        busy = false;
        return set('Password updated. Sign in with your new password.');
      }
    } catch (error) {
      busy = false;
      set(error.message || 'Something went wrong.', true);
      return;
    }
    busy = false;
    draw();
  };

  const field = (key, label, type = 'text', extra = {}) =>
    h('label', {class: 'field'}, h('span', {}, label),
      h('input', {
        type, value: form[key], required: true, autocomplete: extra.autocomplete || 'off',
        oninput: e => (form[key] = e.target.value),
        ...extra,
      }));

  const titles = {signin: 'Sign In', signup: 'Create Account', forgot: 'Reset Password', reset: 'New Password'};
  const cta = {signin: 'Sign In', signup: 'Sign Up', forgot: 'Send code', reset: 'Update password'};

  function draw() {
    root.replaceChildren(
      h('div', {class: 'auth'},
        h('div', {class: 'auth-bg'}),
        h('form', {class: 'auth-card', onsubmit: submit},
          h('div', {class: 'brand big'}, 'CINE', h('b', {}, 'HUB')),
          h('h1', {}, titles[mode]),
          message && h('div', {class: isError ? 'msg err' : 'msg ok'}, message),
          mode === 'signup' && field('name', 'Name', 'text', {autocomplete: 'name'}),
          field('email', 'Email', 'email', {autocomplete: 'email'}),
          mode === 'reset' && field('code', '6-digit code', 'text', {inputMode: 'numeric'}),
          mode !== 'forgot' && field('password', mode === 'reset' ? 'New password' : 'Password', 'password',
            {autocomplete: mode === 'signin' ? 'current-password' : 'new-password', minLength: 6}),
          h('button', {class: 'btn primary wide', type: 'submit', disabled: busy}, busy ? 'Please wait…' : cta[mode]),
          h('div', {class: 'auth-links'},
            mode === 'signin' && [
              h('a', {href: '#', onclick: e => { e.preventDefault(); mode = 'forgot'; set(''); }}, 'Forgot password?'),
              h('a', {href: '#', onclick: e => { e.preventDefault(); mode = 'signup'; set(''); }}, 'New here? Sign up'),
            ],
            mode !== 'signin' && h('a', {href: '#', onclick: e => { e.preventDefault(); mode = 'signin'; set(''); }}, 'Back to sign in'),
          ),
        ),
      ),
    );
  }
  draw();
};
