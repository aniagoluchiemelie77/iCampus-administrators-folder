import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
// Deep import so the web export ships only this font, not every icon family.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/** MaterialIcons, the icon set used throughout the iCampus app. */
export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: string;
  style?: StyleProp<TextStyle>;
}) {
  return <MaterialIcons name={name} size={size} color={color} style={style} />;
}
