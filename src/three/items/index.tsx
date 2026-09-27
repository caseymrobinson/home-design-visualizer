import type { ComponentType } from 'react';
import { Linen, Shelf, Vanity } from './Casework';
import type { ItemProps } from './common';
import { Mirror, RobeHook, Rug, TowelBar, TowelRing, TPHolder, VanityDecor } from './Accessories';
import { WallArt } from './Art';
import { Plant } from './Plants';
import { CeilingLight, Sconce } from './Lights';
import { Curtain, GlassPanel, ShowerTrim, Toilet, Tub } from './Plumbing';

export const ITEM_COMPONENTS: Record<string, ComponentType<ItemProps>> = {
  vanity: Vanity,
  linen: Linen,
  shelf: Shelf,
  tub: Tub,
  toilet: Toilet,
  'shower-trim': ShowerTrim,
  'glass-panel': GlassPanel,
  curtain: Curtain,
  mirror: Mirror,
  sconce: Sconce,
  'ceiling-light': CeilingLight,
  'towel-bar': TowelBar,
  'robe-hook': RobeHook,
  'tp-holder': TPHolder,
  'towel-ring': TowelRing,
  art: WallArt,
  rug: Rug,
  plant: Plant,
  'vanity-decor': VanityDecor,
};
