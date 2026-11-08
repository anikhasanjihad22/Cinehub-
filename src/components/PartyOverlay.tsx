import React, {useEffect, useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import usePartyStore, {type PartyReaction} from '../lib/watchParty/watchParty';
import {isTV} from '../lib/tv';

const EMOJIS = ['❤️', '😂', '😮', '👏', '🔥'];

const FloatingReaction = ({reaction}: {reaction: PartyReaction}) => {
  const drop = usePartyStore(s => s.dropReaction);
  const p = useSharedValue(0);
  const [x] = useState(() => 8 + Math.random() * 40);
  useEffect(() => {
    p.value = withTiming(1, {duration: 2600, easing: Easing.out(Easing.quad)});
    const t = setTimeout(() => drop(reaction.id), 2700);
    return () => clearTimeout(t);
  }, [drop, p, reaction.id]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{translateY: -p.value * 220}, {scale: 1 + p.value * 0.3}],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{position: 'absolute', bottom: 0, right: x, alignItems: 'center'}, style]}>
      <Text style={{fontSize: 34}}>{reaction.emoji}</Text>
      <Text style={{color: '#fff', fontSize: 10, opacity: 0.85}}>{reaction.name}</Text>
    </Animated.View>
  );
};

/** In-player Watch Together pill: who is here, quick reactions. */
const PartyOverlay = () => {
  const code = usePartyStore(s => s.code);
  const members = usePartyStore(s => s.members);
  const reactions = usePartyStore(s => s.reactions);
  const sendReaction = usePartyStore(s => s.sendReaction);
  const [open, setOpen] = useState(false);

  if (!code) {
    return null;
  }
  return (
    <View
      pointerEvents="box-none"
      style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 300}}>
      <View
        pointerEvents="none"
        style={{position: 'absolute', right: 20, bottom: 90, width: 90, height: 260}}>
        {reactions.map(r => (
          <FloatingReaction key={r.id} reaction={r} />
        ))}
      </View>
      {!isTV && (
        <View style={{position: 'absolute', left: 12, top: '38%', alignItems: 'flex-start'}}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Watch together reactions"
            onPress={() => setOpen(o => !o)}
            activeOpacity={0.8}
            style={{
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 18,
              flexDirection: 'row',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}>
            <MaterialCommunityIcons name="account-group" size={18} color="#fff" />
            <Text style={{color: '#fff', fontSize: 13, fontWeight: '800'}}>{members.length}</Text>
          </TouchableOpacity>
          {open && (
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: 22,
                flexDirection: 'row',
                gap: 4,
                marginTop: 8,
                paddingHorizontal: 6,
                paddingVertical: 4,
              }}>
              {EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  onPress={() => sendReaction(e)}
                  style={{paddingHorizontal: 5, paddingVertical: 2}}>
                  <Text style={{fontSize: 24}}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default PartyOverlay;
