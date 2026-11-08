import React, {useEffect, useRef, useState} from 'react';
import {Pressable, TextInput, View} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {isTV} from '../../lib/tv';

const RED = '#E50914';

interface BoxProps {
  char: string;
  active: boolean;
  invalid: boolean;
  width: number;
}

// One digit cell: pops when a digit lands, lights up red while it is the
// active cell and shows a blinking caret.
const Box = ({char, active, invalid, width}: BoxProps) => {
  const pop = useSharedValue(1);
  const focus = useSharedValue(0);
  const caret = useSharedValue(1);

  useEffect(() => {
    if (char) {
      pop.value = withSequence(
        withTiming(1.22, {duration: 90}),
        withSpring(1, {damping: 8, stiffness: 260}),
      );
    }
  }, [char, pop]);

  useEffect(() => {
    focus.value = withTiming(active ? 1 : 0, {duration: 160});
  }, [active, focus]);

  useEffect(() => {
    caret.value = withRepeat(
      withSequence(
        withTiming(0, {duration: 480}),
        withTiming(1, {duration: 480}),
      ),
      -1,
      false,
    );
  }, [caret]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{scale: pop.value}],
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [invalid ? '#ff5a63' : 'rgba(255,255,255,0.18)', RED],
    ),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      ['rgba(255,255,255,0.07)', 'rgba(229,9,20,0.14)'],
    ),
  }));
  const caretStyle = useAnimatedStyle(() => ({
    opacity: focus.value * caret.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height: isTV ? 66 : 56,
          borderRadius: 10,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
        },
        boxStyle,
      ]}>
      {char ? (
        <Animated.Text
          style={{color: '#fff', fontSize: isTV ? 26 : 23, fontWeight: '800'}}>
          {char}
        </Animated.Text>
      ) : (
        <Animated.View
          style={[{width: 2, height: 24, backgroundColor: RED}, caretStyle]}
        />
      )}
    </Animated.View>
  );
};

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  invalid?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  onSubmitEditing?: () => void;
}

/** Netflix-style one-time-code entry: separate animated digit cells. */
const OtpInput = ({
  value,
  onChangeText,
  invalid = false,
  editable = true,
  autoFocus = false,
  inputRef,
  onSubmitEditing,
}: Props) => {
  const innerRef = useRef<TextInput>(null);
  const ref = inputRef ?? innerRef;
  const [focused, setFocused] = useState(false);
  // 6 digits normally; grows to 8 if the project sends longer codes.
  const count = value.length > 6 ? 8 : 6;

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const t = setTimeout(() => ref.current?.focus(), 500);
    return () => clearTimeout(t);
  }, [autoFocus, ref]);

  const gap = 8;
  const width = count === 6 ? (isTV ? 58 : 44) : isTV ? 46 : 34;

  return (
    <View style={{marginBottom: 14}}>
      <Pressable
        focusable={false}
        onPress={() => ref.current?.focus()}
        style={{flexDirection: 'row', justifyContent: 'center', gap}}>
        {Array.from({length: count}).map((_, i) => (
          <Box
            key={i}
            char={value[i] ?? ''}
            active={focused && i === Math.min(value.length, count - 1)}
            invalid={invalid}
            width={width}
          />
        ))}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={t => onChangeText(t.replace(/\D/g, '').slice(0, 8))}
        keyboardType="number-pad"
        maxLength={8}
        editable={editable}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="next"
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          opacity: 0.02,
          color: 'transparent',
        }}
      />
    </View>
  );
};

export default OtpInput;
