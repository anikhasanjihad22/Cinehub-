import React from 'react';
import {View, ViewProps} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {isTV} from '../../lib/tv';

type SurfaceLevel = 'lowest' | 'low' | 'default' | 'high' | 'highest';

interface SurfaceProps extends ViewProps {
  level?: SurfaceLevel;
  outlined?: boolean;
}

const Surface = ({
  level = 'default',
  outlined = false,
  style,
  ...props
}: SurfaceProps) => {
  const colors = useM3Colors();
  const backgrounds: Record<SurfaceLevel, string> = {
    lowest: colors.surfaceContainerLowest,
    low: colors.surfaceContainerLow,
    default: colors.surfaceContainer,
    high: colors.surfaceContainerHigh,
    highest: colors.surfaceContainerHighest,
  };

  // This surface only paints a color, rounded corners and an optional border.
  // Keeping its children in RN avoids a Compose -> RN measurement boundary
  // for every card, including all the offscreen settings sections.
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: backgrounds[level],
          borderRadius: isTV ? 24 : 28,
          borderWidth: outlined ? 1 : 0,
          borderColor: outlined ? colors.outline : undefined,
        },
        style,
      ]}
    />
  );
};

export default Surface;
