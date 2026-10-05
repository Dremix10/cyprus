import { memo } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { color, greekFont } from '@/lib/theme';
import { Column, Meander } from './Olympus';

/** A bronze and night-blue temple table; decorations stay behind the cards. */
export const Felt = memo(function Felt() {
  const { width, height } = useWindowDimensions();
  const diameter = width * 0.84;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.floor]}>
      <Image source={require('../assets/images/zeus.png')} resizeMode="cover" style={styles.zeus} />
      <Column side="left" />
      <Column side="right" />
      <Meander style={[styles.meander, { top: 0 }]} />
      <Meander style={[styles.meander, { bottom: 0 }]} />
      <View
        style={[
          styles.medallion,
          {
            width: diameter,
            height: diameter * 1.5,
            left: (width - diameter) / 2,
            top: height * 0.17,
          },
        ]}
      >
        <View style={styles.innerRing} />
        {Array.from({ length: 28 }, (_, i) => {
          const theta = (i * Math.PI * 2) / 28;
          return (
            <View
              key={i}
              style={[
                styles.leaf,
                {
                  left: diameter / 2 + Math.cos(theta) * diameter * 0.45 - 3,
                  top: diameter * 0.75 + Math.sin(theta) * diameter * 0.69 - 9,
                  transform: [{ rotate: `${(i * 360) / 28 + 40}deg` }],
                },
              ]}
            />
          );
        })}
        <Text style={styles.inscription}>ΤΙΤΣΟΥ</Text>
      </View>
    </View>
  );
});
const styles = StyleSheet.create({
  floor: { backgroundColor: '#0A1624' },
  zeus: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.12,
  },
  medallion: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(201,168,76,0.3)',
    backgroundColor: 'rgba(17,36,47,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: 12,
    right: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
    borderRadius: 999,
  },
  leaf: {
    position: 'absolute',
    width: 6,
    height: 18,
    borderTopLeftRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: 'rgba(201,168,76,0.28)',
  },
  inscription: {
    color: 'rgba(201,168,76,0.13)',
    fontFamily: greekFont,
    fontSize: 32,
    letterSpacing: 6,
  },
  meander: { position: 'absolute', left: 0, right: 0, opacity: 0.5 },
});
