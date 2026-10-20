import { useEffect, useMemo, useRef } from 'react';
import { Flame, Activity, Wifi, WifiOff, Gauge, Clock } from 'lucide-react';
import { useSimulationSocket, type ConnectionState } from '@/hooks/useSimulationSocket';
import { CELL_COLORS } from '@/lib/types';

const WS_URL = 'ws://localhost:8000/ws';
const GRID_ROWS = 30;
const GRID_COLS = 30;
const CELL_SIZE = 20;

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: number[][],
  rows: number,
  cols: number,
  cellSize: number,
) {
  ctx.clearRect(0, 0, cols * cellSize, rows * cellSize);
  for (let r = 0; r < grid.length && r < rows; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length && c < cols; c++) {
      const value = row[c] ?? 0;
      ctx.fillStyle = CELL_COLORS[value] ?? CELL_COLORS[0];
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }
}

function countCells(grid: number[][], value: number): number {
  let count = 0;
  for (const row of grid) {
    if (!row) continue;
    for (const cell of row) if (cell === value) count++;
  }
  return count;
}

function StatusBadge({ state }: { state: ConnectionState }) {
  const connected = state === 'connected';
  const Icon = connected ? Wifi : WifiOff;
  const label = connected ? 'Connected' : 'Disconnected';
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        connected
          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
          : state === 'connecting'
            ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
            : 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30'
      }`}
    >
      <Icon className={`h-4 w-4 ${state === 'connecting' ? 'animate-pulse' : ''}`} />
      {state === 'connecting' ? 'Connecting…' : label}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 px-4 py-3 ring-1 ring-slate-700/50">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="text-lg font-semibold tabular-nums text-slate-50">{value}</div>
      </div>
    </div>
  );
}

export default function FireDashboard() {
  const { state, message } = useSimulationSocket(WS_URL);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const counts = useMemo(() => {
    const grid = message?.grid;
    if (!grid) return { burning: 0, burnt: 0 };
    return { burning: countCells(grid, 2), burnt: countCells(grid, 5) };
  }, [message]);

  const danger = message?.danger ?? 0;
  const avgDanger = message?.metrics?.avg_danger;
  const pathMs = message?.metrics?.path_calc_ms;

  // Stable offscreen render canvas, then blit to the visible canvas.
  useEffect(() => {
    const visible = canvasRef.current;
    if (!visible) return;
    const ctx = visible.getContext('2d');
    if (!ctx) return;

    if (message?.grid) {
      drawGrid(ctx, message.grid, GRID_ROWS, GRID_COLS, CELL_SIZE);
    } else {
      ctx.clearRect(0, 0, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
      ctx.fillStyle = '#475569';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        state === 'connected' ? 'Awaiting data…' : 'No data',
        (GRID_COLS * CELL_SIZE) / 2,
        (GRID_ROWS * CELL_SIZE) / 2,
      );
    }
  }, [message, state]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-amber-500 shadow-lg shadow-red-500/20">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Fire Evacuation Dashboard
              </h1>
              <p className="text-sm text-slate-400">Live simulation monitoring</p>
            </div>
          </div>
          <StatusBadge state={state} />
        </header>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Flame className="h-5 w-5 text-red-400" />}
            label="Burning"
            value={String(counts.burning)}
            accent="bg-red-500/15"
          />
          <StatCard
            icon={<Flame className="h-5 w-5 text-slate-400" />}
            label="Burnt"
            value={String(counts.burnt)}
            accent="bg-slate-500/15"
          />
          <StatCard
            icon={<Activity className="h-5 w-5 text-orange-400" />}
            label="Danger"
            value={`${danger}`}
            accent="bg-orange-500/15"
          />
          <StatCard
            icon={<Gauge className="h-5 w-5 text-sky-400" />}
            label="Avg Danger"
            value={avgDanger != null ? avgDanger.toFixed(1) : '—'}
            accent="bg-sky-500/15"
          />
        </section>

        <section className="rounded-2xl bg-slate-900/80 p-5 ring-1 ring-slate-700/50">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Building Grid
            </h2>
            {pathMs != null && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                Path calc {pathMs.toFixed(1)} ms
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <canvas
              ref={canvasRef}
              width={GRID_COLS * CELL_SIZE}
              height={GRID_ROWS * CELL_SIZE}
              className="block rounded-lg ring-1 ring-slate-700/60"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <Legend color={CELL_COLORS[0]} label="Free" />
            <Legend color={CELL_COLORS[1]} label="Wall" />
            <Legend color={CELL_COLORS[2]} label="Fire" />
            <Legend color={CELL_COLORS[3]} label="Exit" />
            <Legend color={CELL_COLORS[4]} label="Barrier" />
            <Legend color={CELL_COLORS[5]} label="Burnt" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-slate-400">
      <span
        className="h-3.5 w-3.5 rounded-sm ring-1 ring-slate-700/60"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}
