/** Design tokens. Cards, tiles and the table are solid; only floating bars use glass. */
export const color = {
  felt: '#0E4D33',
  feltDeep: '#0A3624',
  feltEdge: '#07281A',
  surface: '#14261D',
  surfaceRaised: '#1C3629',
  line: 'rgba(255,255,255,0.12)',
  text: '#F4F7F5',
  textDim: 'rgba(244,247,245,0.68)',
  textFaint: 'rgba(244,247,245,0.42)',
  gold: '#F2C14E',
  goldInk: '#3A2A00',
  danger: '#E5484D',
  ok: '#3FCB7E',
  teamUs: '#7FD6A8',
  teamThem: '#F2A38A',
  cardFace: '#FBF8F1',
  cardEdge: '#CFC7B4',
  cardBack: '#7A1F2B',
  white: '#FFFFFF',
} as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const font = {
  rounded: undefined as string | undefined,
} as const;
