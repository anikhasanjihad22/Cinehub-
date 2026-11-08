import React, {useEffect, useState} from 'react';
import {Pressable, TextInput, TextInputProps, View} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {MaterialIcons} from '@expo/vector-icons';
import {isTV} from '../../lib/tv';

export const RED = '#E50914';

interface Props
  extends Pick<
    TextInputProps,
    | 'value'
    | 'onChangeText'
    | 'keyboardType'
    | 'autoCapitalize'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'editable'
    | 'autoComplete'
    | 'textContentType'
  > {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  secure?: boolean;
  invalid?: boolean;
}

/** Netflix-style input: label floats up on focus, border lights up red. */
const AuthInput = React.forwardRef<TextInput, Props>(
  ({label, icon, secure, invalid, value, ...rest}, ref) => {
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(Boolean(secure));
    const lift = useSharedValue(value ? 1 : 0);
    const focus = useSharedValue(0);
    const height = isTV ? 68 : 58;

    useEffect(() => {
      lift.value = withTiming(focused || value ? 1 : 0, {duration: 170});
    }, [focused, value, lift]);

    useEffect(() => {
      focus.value = withTiming(focused ? 1 : 0, {duration: 190});
    }, [focused, focus]);

    const boxStyle = useAnimatedStyle(() => ({
      borderColor: interpolateColor(
        focus.value,
        [0, 1],
        [invalid ? '#ff5a63' : 'rgba(255,255,255,0.16)', RED],
      ),
      backgroundColor: interpolateColor(
        focus.value,
        [0, 1],
        ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.12)'],
      ),
    }));

    const labelStyle = useAnimatedStyle(() => ({
      top: interpolate(lift.value, [0, 1], [height / 2 - 10, 7]),
      fontSize: interpolate(lift.value, [0, 1], [isTV ? 18 : 16, 12]),
      color: interpolateColor(
        lift.value,
        [0, 1],
        ['rgba(255,255,255,0.55)', focused ? '#ff6b73' : 'rgba(255,255,255,0.7)'],
      ),
    }));

    return (
      <Animated.View
        style={[
          {
            height,
            borderRadius: 10,
            borderWidth: 1.5,
            marginBottom: 14,
            justifyContent: 'center',
          },
          boxStyle,
        ]}>
        <View style={{position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center'}}>
          <MaterialIcons
            name={icon}
            size={isTV ? 24 : 20}
            color={focused ? RED : 'rgba(255,255,255,0.45)'}
          />
        </View>
        <Animated.Text
          pointerEvents="none"
          numberOfLines={1}
          style={[{position: 'absolute', left: 46}, labelStyle]}>
          {label}
        </Animated.Text>
        <TextInput
          ref={ref}
          value={value}
          secureTextEntry={Boolean(secure) && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={RED}
          cursorColor={RED}
          placeholderTextColor="transparent"
          autoCorrect={false}
          style={{
            color: '#fff',
            fontSize: isTV ? 20 : 17,
            paddingLeft: 46,
            paddingRight: secure ? 48 : 14,
            paddingTop: 20,
            paddingBottom: 4,
            height: '100%',
          }}
          {...rest}
        />
        {secure && (
          <Pressable
            focusable={false}
            hitSlop={10}
            onPress={() => setHidden(h => !h)}
            style={{position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center'}}>
            <MaterialIcons
              name={hidden ? 'visibility' : 'visibility-off'}
              size={22}
              color="rgba(255,255,255,0.6)"
            />
          </Pressable>
        )}
      </Animated.View>
    );
  },
);

export default AuthInput;
