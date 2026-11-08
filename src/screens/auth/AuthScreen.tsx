import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  FadeOut,
  LinearTransition,
  ZoomIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {MaterialIcons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import PosterWall from './PosterWall';
import AuthInput, {RED} from './AuthInput';
import OtpInput from './OtpInput';
import {introDelayFor} from './CinematicIntro';
import {TVFocusable} from '../../components/tv';
import {isTV} from '../../lib/tv';
import useAuthStore from '../../lib/zustand/authStore';
import {socialLinks} from '../../lib/constants';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TITLES: Record<Mode, string> = {
  signin: 'Sign In',
  signup: 'Create Account',
  forgot: 'Reset Password',
  reset: 'Check Your Email',
  done: 'All Set',
};

const maskEmail = (email: string) => {
  const [name, domain] = email.trim().split('@');
  if (!name || !domain) {
    return email;
  }
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
};

// ---------------------------------------------------------------------------
// ambient: a slow red light beam that crosses the screen now and then
// ---------------------------------------------------------------------------
const LightSweep = () => {
  const {width} = useWindowDimensions();
  const x = useSharedValue(-320);
  useEffect(() => {
    x.value = withRepeat(
      withDelay(
        3500,
        withTiming(width + 320, {duration: 3600, easing: Easing.inOut(Easing.quad)}),
      ),
      -1,
      false,
    );
  }, [width, x]);
  const style = useAnimatedStyle(() => ({
    transform: [{translateX: x.value}, {rotate: '14deg'}],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {position: 'absolute', top: -80, bottom: -80, width: 240},
        style,
      ]}>
      <LinearGradient
        colors={['rgba(229,9,20,0)', 'rgba(229,9,20,0.20)', 'rgba(229,9,20,0)']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// "code sent" header: floating mail icon with expanding rings
// ---------------------------------------------------------------------------
const Ring = ({delay}: {delay: number}) => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, {duration: 2000, easing: Easing.out(Easing.quad)}), -1, false),
    );
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.2, 1], [0, 0.5, 0]),
    transform: [{scale: interpolate(p.value, [0, 1], [0.6, 2])}],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 64,
          height: 64,
          borderRadius: 32,
          borderWidth: 2,
          borderColor: RED,
        },
        style,
      ]}
    />
  );
};

const MailHeader = ({email}: {email: string}) => {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-6, {duration: 1100, easing: Easing.inOut(Easing.quad)}),
        withTiming(0, {duration: 1100, easing: Easing.inOut(Easing.quad)}),
      ),
      -1,
      false,
    );
  }, [float]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{translateY: float.value}],
  }));
  return (
    <View style={{alignItems: 'center', marginBottom: 16}}>
      <View style={{width: 90, height: 90, alignItems: 'center', justifyContent: 'center'}}>
        <Ring delay={0} />
        <Ring delay={1000} />
        <Animated.View
          entering={ZoomIn.springify().damping(9).delay(150)}
          style={[
            {
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: 'rgba(229,9,20,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            },
            iconStyle,
          ]}>
          <MaterialIcons name="mail-outline" size={32} color="#fff" />
        </Animated.View>
      </View>
      <Text style={{color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 6}}>
        We sent a code to
      </Text>
      <Text style={{color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2}}>
        {maskEmail(email)}
      </Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// success: green check that bursts into particles
// ---------------------------------------------------------------------------
const Particle = ({angle, p}: {angle: number; p: {value: number}}) => {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.7, 1], [1, 1, 0]),
    transform: [
      {translateX: Math.cos(angle) * 74 * p.value},
      {translateY: Math.sin(angle) * 74 * p.value},
      {scale: interpolate(p.value, [0, 1], [1, 0.3])},
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: angle % 2 > 1 ? RED : '#46d369',
        },
        style,
      ]}
    />
  );
};

const SuccessBurst = () => {
  const p = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(250, withTiming(1, {duration: 1000, easing: Easing.out(Easing.cubic)}));
    ring.value = withDelay(250, withTiming(1, {duration: 900, easing: Easing.out(Easing.quad)}));
  }, [p, ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 1], [0.7, 0]),
    transform: [{scale: interpolate(ring.value, [0, 1], [1, 2.4])}],
  }));
  return (
    <View style={{alignItems: 'center', justifyContent: 'center', height: 170}}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 3,
            borderColor: '#46d369',
          },
          ringStyle,
        ]}
      />
      {Array.from({length: 12}).map((_, i) => (
        <Particle key={i} angle={(i / 12) * Math.PI * 2 + (i % 2) * 0.2} p={p} />
      ))}
      <Animated.View
        entering={ZoomIn.springify().damping(8).stiffness(140)}
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          backgroundColor: '#46d369',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <MaterialIcons name="check" size={52} color="#fff" />
      </Animated.View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// primary button with a moving sheen
// ---------------------------------------------------------------------------
interface ButtonProps {
  label: string;
  busy: boolean;
  onPress: () => void;
  fs: number;
}

const ShimmerButton = ({label, busy, onPress, fs}: ButtonProps) => {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(
      withDelay(1400, withTiming(1, {duration: 1300, easing: Easing.inOut(Easing.quad)})),
      -1,
      false,
    );
  }, [x]);
  const sheen = useAnimatedStyle(() => ({
    transform: [{translateX: interpolate(x.value, [0, 1], [-100, w + 40])}, {skewX: '-20deg'}],
  }));
  return (
    <TVFocusable
      onPress={onPress}
      disabled={busy}
      borderRadius={10}
      focusScale={1.04}
      hasTVPreferredFocus={isTV}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: isTV ? 60 : 54,
        borderRadius: 10,
        backgroundColor: busy ? '#9b0710' : RED,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
        overflow: 'hidden',
        shadowColor: RED,
        shadowOpacity: 0.6,
        shadowRadius: 14,
        elevation: 6,
      }}>
      <View
        onLayout={e => setW(e.nativeEvent.layout.width)}
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        {!busy && (
          <Animated.View
            style={[{position: 'absolute', top: 0, bottom: 0, width: 60}, sheen]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
      </View>
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Animated.Text
          key={label}
          entering={FadeIn.duration(250)}
          style={{color: '#fff', fontSize: 17 * fs, fontWeight: '800', letterSpacing: 0.4}}>
          {label}
        </Animated.Text>
      )}
    </TVFocusable>
  );
};

// ---------------------------------------------------------------------------
// screen
// ---------------------------------------------------------------------------
const AuthScreen = () => {
  const signIn = useAuthStore(s => s.signIn);
  const signUp = useAuthStore(s => s.signUp);
  const resetPassword = useAuthStore(s => s.resetPassword);
  const resetPasswordWithCode = useAuthStore(s => s.resetPasswordWithCode);

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // The opening animation is an app-level overlay; on a cold start the form
  // waits for it to hand over, after a sign-out there is nothing to wait for.
  const [base] = useState(() => introDelayFor(2500));

  const emailRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  // --- logo intro -------------------------------------------------------
  const logoScale = useSharedValue(0.55);
  const logoOpacity = useSharedValue(0);
  const glow = useSharedValue(0.35);
  const shake = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withDelay(base, withTiming(1, {duration: 700}));
    logoScale.value = withDelay(base, withSpring(1, {damping: 11, stiffness: 90}));
    glow.value = withDelay(
      base + 600,
      withRepeat(
        withSequence(
          withTiming(0.8, {duration: 1800, easing: Easing.inOut(Easing.quad)}),
          withTiming(0.3, {duration: 1800, easing: Easing.inOut(Easing.quad)}),
        ),
        -1,
        false,
      ),
    );
  }, [base, logoOpacity, logoScale, glow]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{scale: logoScale.value}],
  }));
  const glowStyle = useAnimatedStyle(() => ({opacity: glow.value}));
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{translateX: shake.value}],
  }));

  const fail = useCallback(
    (message: string) => {
      setNotice('');
      setError(message);
      shake.value = withSequence(
        withTiming(-12, {duration: 55}),
        withRepeat(withTiming(12, {duration: 110}), 5, true),
        withTiming(0, {duration: 55}),
      );
    },
    [shake],
  );

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  }, []);

  const submit = useCallback(async () => {
    if (busy) {
      return;
    }
    setError('');
    setNotice('');

    if (mode === 'signup' && name.trim().length < 2) {
      return fail('Please enter your name.');
    }
    if (!EMAIL_RE.test(email.trim())) {
      return fail('Enter a valid email address.');
    }
    if (mode === 'reset' && !/^\d{6,8}$/.test(code.trim())) {
      return fail('Enter the code from your email.');
    }
    if (mode !== 'forgot' && password.length < 6) {
      return fail(
        mode === 'reset'
          ? 'New password must be at least 6 characters.'
          : 'Password must be at least 6 characters.',
      );
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        const result = await signUp(email, password, name);
        if (result.needsEmailConfirmation) {
          setMode('signin');
          setPassword('');
          setNotice(
            'Account created! Check your email and confirm it, then sign in.',
          );
        }
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setMode('reset');
        setCode('');
        setPassword('');
      } else if (mode === 'reset') {
        await resetPasswordWithCode(email, code, password);
        setCode('');
        setPassword('');
        setMode('done');
        doneTimer.current = setTimeout(() => {
          setMode('signin');
          setNotice('Password updated. Sign in with your new password.');
        }, 2400);
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    mode,
    name,
    email,
    password,
    code,
    signIn,
    signUp,
    resetPassword,
    resetPasswordWithCode,
    fail,
  ]);

  const resendCode = useCallback(async () => {
    if (busy) {
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await resetPassword(email);
      setCode('');
      setNotice('A new code was sent to your email.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [busy, email, resetPassword, fail]);

  const fs = isTV ? 1.25 : 1;
  const cardWidth = isTV ? 520 : undefined;
  const buttonLabel =
    mode === 'signin'
      ? 'Sign In'
      : mode === 'signup'
        ? 'Sign Up'
        : mode === 'forgot'
          ? 'Send code'
          : 'Save new password';

  return (
    <View style={{flex: 1, backgroundColor: '#000'}}>
      <PosterWall />
      <LightSweep />
      <SafeAreaView style={{flex: 1}}>
        <KeyboardAvoidingView
          style={{flex: 1}}
          behavior={isTV ? undefined : 'padding'}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            focusable={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 22,
              paddingVertical: 24,
            }}>
            {/* ---- brand ---- */}
            <View style={{alignItems: 'center', marginBottom: isTV ? 18 : 22}}>
              <View style={{alignItems: 'center', justifyContent: 'center'}}>
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      width: 150 * fs,
                      height: 150 * fs,
                      borderRadius: 100,
                      backgroundColor: RED,
                      shadowColor: RED,
                      shadowOpacity: 1,
                      shadowRadius: 50,
                    },
                    glowStyle,
                  ]}
                />
                <Animated.View style={logoStyle}>
                  <Image
                    source={require('../../../assets/logo.png')}
                    style={{width: 104 * fs, height: 104 * fs, borderRadius: 26 * fs}}
                    resizeMode="contain"
                  />
                </Animated.View>
              </View>
              <Animated.Text
                entering={FadeInUp.delay(base + 350).duration(600)}
                style={{
                  color: '#fff',
                  fontSize: 30 * fs,
                  fontWeight: '900',
                  letterSpacing: 6,
                  marginTop: 14,
                }}>
                CINE<Text style={{color: RED}}>HUB</Text>
              </Animated.Text>
              <Animated.Text
                entering={FadeIn.delay(base + 700).duration(700)}
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 13 * fs,
                  marginTop: 4,
                  letterSpacing: 1,
                }}>
                Unlimited movies, shows & more
              </Animated.Text>
            </View>

            {/* ---- form card ---- */}
            <Animated.View
              entering={FadeInDown.delay(base + 500).duration(650).springify().damping(16)}
              layout={LinearTransition.duration(300)}
              style={[
                {
                  width: '100%',
                  maxWidth: cardWidth ?? 440,
                  backgroundColor: 'rgba(0,0,0,0.72)',
                  borderRadius: 18,
                  padding: isTV ? 30 : 22,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                },
                shakeStyle,
              ]}>
              {/* each mode slides in from the right, like turning a page */}
              <Animated.View key={mode} entering={FadeInRight.duration(380)}>
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 26 * fs,
                    fontWeight: '800',
                    marginBottom: mode === 'forgot' ? 6 : 18,
                  }}>
                  {TITLES[mode]}
                </Text>

                {mode === 'forgot' && (
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: 14 * fs,
                      marginBottom: 16,
                      lineHeight: 20,
                    }}>
                    Enter your email and we'll send you a code to set a new password.
                  </Text>
                )}

                {mode === 'reset' && <MailHeader email={email} />}

                {mode === 'done' && (
                  <View>
                    <SuccessBurst />
                    <Animated.Text
                      entering={FadeInUp.delay(500).duration(500)}
                      style={{
                        color: 'rgba(255,255,255,0.75)',
                        fontSize: 15 * fs,
                        textAlign: 'center',
                        marginBottom: 8,
                      }}>
                      Your password has been updated.
                    </Animated.Text>
                  </View>
                )}

                {mode === 'signup' && (
                  <AuthInput
                    label="Your name"
                    icon="person-outline"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    textContentType="name"
                    editable={!busy}
                  />
                )}

                {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
                  <AuthInput
                    ref={emailRef}
                    label="Email address"
                    icon="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType={mode === 'forgot' ? 'send' : 'next'}
                    onSubmitEditing={() =>
                      mode === 'forgot' ? submit() : passRef.current?.focus()
                    }
                    editable={!busy}
                  />
                )}

                {mode === 'reset' && (
                  <Animated.View entering={FadeInDown.delay(250).duration(400)}>
                    <OtpInput
                      value={code}
                      onChangeText={setCode}
                      invalid={!!error}
                      editable={!busy}
                      autoFocus
                      inputRef={codeRef}
                      onSubmitEditing={() => passRef.current?.focus()}
                    />
                  </Animated.View>
                )}

                {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
                  <Animated.View
                    entering={mode === 'reset' ? FadeInDown.delay(400).duration(400) : undefined}>
                    <AuthInput
                      ref={passRef}
                      label={mode === 'reset' ? 'New password' : 'Password'}
                      icon="lock-outline"
                      value={password}
                      onChangeText={setPassword}
                      secure
                      autoCapitalize="none"
                      autoComplete={mode === 'signin' ? 'password' : 'password-new'}
                      textContentType={mode === 'signin' ? 'password' : 'newPassword'}
                      returnKeyType="go"
                      onSubmitEditing={submit}
                      editable={!busy}
                    />
                  </Animated.View>
                )}

                {!!error && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
                    <MaterialIcons name="error-outline" size={18} color="#ff6b73" />
                    <Text style={{color: '#ff6b73', marginLeft: 6, flex: 1, fontSize: 13.5 * fs}}>
                      {error}
                    </Text>
                  </Animated.View>
                )}
                {!!notice && mode !== 'done' && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
                    <MaterialIcons name="check-circle-outline" size={18} color="#46d369" />
                    <Text style={{color: '#46d369', marginLeft: 6, flex: 1, fontSize: 13.5 * fs}}>
                      {notice}
                    </Text>
                  </Animated.View>
                )}

                {mode !== 'done' && (
                  <ShimmerButton label={buttonLabel} busy={busy} onPress={submit} fs={fs} />
                )}

                {mode === 'signin' && (
                  <TVFocusable
                    onPress={() => switchMode('forgot')}
                    borderRadius={8}
                    style={{alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 10, marginTop: 4}}>
                    <Text style={{color: 'rgba(255,255,255,0.65)', fontSize: 14 * fs}}>
                      Forgot password?
                    </Text>
                  </TVFocusable>
                )}

                {mode === 'reset' && (
                  <TVFocusable
                    onPress={resendCode}
                    disabled={busy}
                    borderRadius={8}
                    style={{alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 10, marginTop: 4}}>
                    <Text style={{color: 'rgba(255,255,255,0.65)', fontSize: 14 * fs}}>
                      Didn't get it? Resend code
                    </Text>
                  </TVFocusable>
                )}

                {mode !== 'done' && (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 8,
                      flexWrap: 'wrap',
                    }}>
                    <Text style={{color: 'rgba(255,255,255,0.55)', fontSize: 14.5 * fs}}>
                      {mode === 'signin'
                        ? 'New to CineHub? '
                        : mode === 'signup'
                          ? 'Already a member? '
                          : 'Remembered it? '}
                    </Text>
                    <TVFocusable
                      onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                      borderRadius={8}
                      style={{paddingVertical: 8, paddingHorizontal: 6}}>
                      <Text style={{color: '#fff', fontSize: 14.5 * fs, fontWeight: '800'}}>
                        {mode === 'signin' ? 'Sign up now' : 'Sign in'}
                      </Text>
                    </TVFocusable>
                  </View>
                )}
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(base + 1100).duration(600)} style={{marginTop: 14}}>
              <TVFocusable
                onPress={() => Linking.openURL(socialLinks.telegram)}
                borderRadius={8}
                style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14}}>
                <MaterialIcons name="support-agent" size={18} color="rgba(255,255,255,0.6)" />
                <Text style={{color: 'rgba(255,255,255,0.6)', marginLeft: 6, fontSize: 13 * fs}}>
                  Need help? Join our support group
                </Text>
              </TVFocusable>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

export default AuthScreen;
