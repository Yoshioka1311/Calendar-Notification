import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

type AppIconProps = {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function AppIcon({ name, color, size = 24, style }: AppIconProps) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      style={style}
      fallback={<Text style={{ color, fontSize: size * 0.8 }}>●</Text>}
    />
  );
}
