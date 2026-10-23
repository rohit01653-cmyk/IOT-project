export interface SimMessage {
  grid: number[][];
  path: [number, number][];
  danger: number;
  alerts: string[];
  rerouted: boolean;
  metrics: { avg_danger: number; path_calc_ms: number };
}

export const CELL_COLORS: Record<number, string> = {
  0: '#a7f3a0',
  1: '#374151',
  2: '#ef4444',
  3: '#3b82f6',
  4: '#8b5e34',
  5: '#9ca3af',
};

export type PlaceMode = 'fire' | 'person' | 'barrier';
