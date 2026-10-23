import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flame,
  Activity,
  Wifi,
  WifiOff,
  Gauge,
  Clock,
  Play,
  Square,
  RotateCcw,
  AlertTriangle,
  User,
  Blocks,
  X,
} from 'lucide-react';
import { useSimulationSocket, type ConnectionState } from '@/hooks/useSimulationSocket';
import { useBackend, fetchMaps } from '@/hooks/useBackend';
import { CELL_COLORS, type PlaceMode, type SimMessage } from '@/lib/types';

const WS_URL = 'ws://localhost:8000/ws';
const BACKEND_URL = 'http://localhost:8000';
const GRID_ROWS = 30;
const GRID_COLS = 30;
const CELL_SIZE = 20;

const MODE_META: Record<PlaceMode, { label: string; icon: React.ReactNode; ring: string }> = {
  fire: {
    label: 'Place fire',
    icon: <Flame className="h-4 w-4" />,
    ring: 'ring-red-500/50 bg-red-500/15 text-red-300',
  },
  person: {
    label: 'Place person',
    icon: <User className="h-4 w-4" />,
    ring: 'ring-sky-500/50 bg-sky-500/15 text-sky-300',
  },
  barrier: {
    label: 'Place barrier',
    icon: <Blocks className="h-4 w-4" />,
    ring: 'ring-amber-500/50 bg-amber-500/15 text-amber-300',
  },
};

function dangerColor(d: number): string {
  if (d < 30) return 'text-emerald-400';
  if (d < 70) return 'text-amber-400';
  return 'text-red-400';
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: number[][],
  path: [number, number][],
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

  if (path.length > 1) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const [r, c] = path[i];
      const x = c * cellSize + cellSize / 2;
      const y = r * cellSize + cellSize / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
      {state === 'connecting' ? 'Connecting…' : connected ? 'Connected' : 'Disconnected'}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueClass,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
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
        <div className={`text-lg font-semibold tabular-nums ${valueClass ?? 'text-slate-50'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default function FireDashboard() {
  const { state, message } = useSimulationSocket(WS_URL);
  const { error, setError, call } = useBackend(BACKEND_URL);

  const [maps, setMaps] = useState<string[]>([]);
  const [selectedMap, setSelectedMap] = useState<string>('');
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mode, setMode] = useState<PlaceMode>('fire');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMaps(BACKEND_URL)
      .then((names) => {
        if (cancelled) return;
        setMaps(names);
        if (names.length > 0) setSelectedMap(names[0]);
        setMapsError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setMapsError(e instanceof Error ? e.message : 'Failed to load maps');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMapChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      setSelectedMap(name);
      void call('/map/load', { name });
    },
    [call],
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const col = Math.floor(x / CELL_SIZE);
      const row = Math.floor(y / CELL_SIZE);
      if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return;

      const endpoint = mode === 'fire' ? '/fire' : mode === 'person' ? '/person' : '/barrier';
      void call(endpoint, { row, col });
    },
    [mode, call],
  );

  const counts = useMemo(() => {
    const grid = message?.grid;
    if (!grid) return { burning: 0, burnt: 0 };
    return { burning: countCells(grid, 2), burnt: countCells(grid, 5) };
  }, [message]);

  const danger = message?.danger ?? 0;
  const avgDanger = message?.metrics?.avg_danger;
  const pathMs = message?.metrics?.path_calc_ms;
  const alerts = message?.alerts ?? [];
  const rerouted = message?.rerouted ?? false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (message?.grid) {
      drawGrid(ctx, message.grid, message.path, GRID_ROWS, GRID_COLS, CELL_SIZE);
    } else {
      ctx.clearRect(0, 0, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
      ctx.fillStyle = '#475569';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        state === 'connected' ? 'Awaiting data…' : 'Waiting for connection…',
        (GRID_COLS * CELL_SIZE) / 2,
        (GRID_ROWS * CELL_SIZE) / 2,
      );
    }
  }, [message, state]);

  const dismissError = () => setError(null);

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

        {(error || mapsError) && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Something went wrong</div>
              <div className="text-red-300/80">{error ?? mapsError}</div>
            </div>
            {error && (
              <button
                onClick={dismissError}
                className="rounded p-1 text-red-300/70 transition-colors hover:bg-red-500/20 hover:text-red-200"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

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
            valueClass={dangerColor(danger)}
            accent="bg-orange-500/15"
          />
          <StatCard
            icon={<Gauge className="h-5 w-5 text-sky-400" />}
            label="Avg Danger"
            value={avgDanger != null ? avgDanger.toFixed(1) : '—'}
            valueClass={avgDanger != null ? dangerColor(avgDanger) : undefined}
            accent="bg-sky-500/15"
          />
        </section>

        <section className="mb-6 rounded-2xl bg-slate-900/80 p-5 ring-1 ring-slate-700/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="map-select"
                className="text-xs font-medium uppercase tracking-wide text-slate-400"
              >
                Map
              </label>
              <select
                id="map-select"
                value={selectedMap}
                onChange={handleMapChange}
                className="min-w-[12rem] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                {maps.length === 0 && <option value="">No maps available</option>}
                {maps.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void call('/start', {})}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                <Play className="h-4 w-4" />
                Start
              </button>
              <button
                onClick={() => void call('/stop', {})}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-600"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
              <button
                onClick={() => void call('/reset', {})}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-600"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(MODE_META) as PlaceMode[]).map((m) => {
              const meta = MODE_META[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                    active
                      ? meta.ring + ' ring-1'
                      : 'bg-slate-800 text-slate-300 ring-1 ring-slate-700/50 hover:bg-slate-700'
                  }`}
                >
                  {meta.icon}
                  {meta.label}
                </button>
              );
            })}
            <span className="ml-auto self-center text-xs text-slate-500">
              Click a grid cell to place
            </span>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="rounded-2xl bg-slate-900/80 p-5 ring-1 ring-slate-700/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Building Grid
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                {rerouted && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300 ring-1 ring-amber-500/30">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Rerouted
                  </span>
                )}
                {pathMs != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Path {pathMs.toFixed(1)} ms
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <canvas
                ref={canvasRef}
                width={GRID_COLS * CELL_SIZE}
                height={GRID_ROWS * CELL_SIZE}
                onClick={handleCanvasClick}
                className="block cursor-crosshair rounded-lg ring-1 ring-slate-700/60"
                style={{ maxWidth: '100%' }}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <Legend color={CELL_COLORS[0]} label="Free" />
              <Legend color={CELL_COLORS[1]} label="Wall" />
              <Legend color={CELL_COLORS[2]} label="Fire" />
              <Legend color={CELL_COLORS[3]} label="Exit" />
              <Legend color={CELL_COLORS[4]} label="Barrier" />
              <Legend color={CELL_COLORS[5]} label="Burnt" />
              <Legend color="#3b82f6" label="Path" line />
            </div>
          </div>

          <aside className="rounded-2xl bg-slate-900/80 p-5 ring-1 ring-slate-700/50">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Alerts
            </h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">No alerts.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alerts.map((alert, i) => (
                  <li
                    key={`${alert}-${i}`}
                    className="flex items-start gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-200 ring-1 ring-slate-700/40"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span className="break-words">{alert}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 text-slate-400">
      {line ? (
        <span
          className="h-1 w-5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          className="h-3.5 w-3.5 rounded-sm ring-1 ring-slate-700/60"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </div>
  );
}
