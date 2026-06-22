import { CSMapDef } from '../types';

export const DUST2: CSMapDef = {
  name: 'Dust2',
  spawnCT: { x: 45, y: 1.5, z: -35 },
  spawnT: { x: -45, y: 1.5, z: -35 },

  boxes: [
    { x: -20, y: 2, z: -10, w: 6, h: 4, d: 2, color: 0xc2a87d },
    { x: 20, y: 2, z: -10, w: 6, h: 4, d: 2, color: 0xc2a87d },
    { x: 0, y: 1.5, z: 0, w: 4, h: 3, d: 4, color: 0xb8956a },
    { x: -35, y: 3, z: 10, w: 8, h: 6, d: 3, color: 0x9e8a72 },
    { x: 35, y: 3, z: 10, w: 8, h: 6, d: 3, color: 0x9e8a72 },
    { x: 0, y: 2.5, z: 25, w: 12, h: 5, d: 3, color: 0xc2a87d },
    { x: -30, y: 1.5, z: -25, w: 4, h: 3, d: 6, color: 0xb8956a },
    { x: 30, y: 1.5, z: -25, w: 4, h: 3, d: 6, color: 0xb8956a },
    { x: 0, y: 4, z: -25, w: 3, h: 8, d: 3, color: 0x8b7355 },

    { x: -15, y: 1, z: -30, w: 2, h: 2, d: 8, color: 0xd4b896 },
    { x: 15, y: 1, z: -30, w: 2, h: 2, d: 8, color: 0xd4b896 },
    { x: -40, y: 1.5, z: 0, w: 3, h: 3, d: 10, color: 0xb8956a },
    { x: 40, y: 1.5, z: 0, w: 3, h: 3, d: 10, color: 0xb8956a },
    { x: -10, y: 1, z: 15, w: 6, h: 2, d: 2, color: 0xc2a87d },
    { x: 10, y: 1, z: 15, w: 6, h: 2, d: 2, color: 0xc2a87d },

    { x: -25, y: 2, z: 30, w: 5, h: 4, d: 5, color: 0x9e8a72 },
    { x: 25, y: 2, z: 30, w: 5, h: 4, d: 5, color: 0x9e8a72 },
    { x: 0, y: 1, z: -15, w: 3, h: 2, d: 3, color: 0xd4b896 },
  ],

  floors: [
    { x: 0, z: 0, w: 120, d: 100, color: 0xd2b48c },
  ],
};
