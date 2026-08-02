/** Locked sRGB tokens — "Summer Afternoon" gouache direction.
 *  Warm paper light, pastel sky, sage greens, terracotta accents.
 *  Reference: summer-afternoon.vlucendo.com (hand-painted, high-key, matte). */
export const ART = {
  night: { abyss: '#182644', horizon: '#31446E', moonfill: '#7C90B8' },
  sky: { zenith: '#5B9BD9', horizon: '#F3E5C0', overcast: '#AEB9BD', dusk: '#F5B57E' },
  meadow: { dry: '#D6CC7C', sage: '#7FBD53', fresh: '#9CD96B' },
  forest: { mid: '#55A855', deep: '#35804E', moss: '#83BC66' },
  earth: { soil: '#A08A6A', wood: '#9A7048', timber: '#B98A5F', edge: '#E0C79A' },
  stone: { warm: '#C2B89E', cool: '#B3AC97', pale: '#EFE9D3' },
  shore: { sand: '#EDD9A4' },
  water: { shallow: '#7FD0D6', deep: '#3F9DB4', foam: '#FFF9E8' },
  fire: { ember: '#E0784A', flame: '#F5A961', star: '#FFE3A0' },
  moon: { pale: '#F2EFE2' },
  danger: { deep: '#A34A40', bright: '#E2674F' },
  plague: { pall: '#9BA878' },
  kin: { sol: '#E8845F', lune: '#6FA7D8', skinWarm: '#D4A47D', skinCool: '#C4947F' },
  /** paper: the cream the whole world fades into — fog, sky horizon, UI. */
  paper: { bright: '#FBF6E8', warm: '#F3ECD8', deep: '#E4D9BC', shadow: '#B9AE93', ink: '#3A3B33' },
  ui: { text: '#3A3B33', muted: '#8B8674', glass: '#FBF6E8', cyan: '#4DA6A8', violet: '#9C8FD0' },
} as const;

export type ArtHex = `#${string}`;
