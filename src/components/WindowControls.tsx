import { Copy, Minus, Square, X } from 'lucide-react';

export function WindowControls({ maximized }: { maximized: boolean }) {
  return (
    <div className="window-controls">
      <button className="wc" aria-label="Minimize" onClick={() => window.orbis.win.minimize()}>
        <Minus size={15} />
      </button>
      <button
        className="wc"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => window.orbis.win.toggleMaximize()}
      >
        {maximized ? <Copy size={13} /> : <Square size={12} />}
      </button>
      <button className="wc wc-close" aria-label="Close" onClick={() => window.orbis.win.close()}>
        <X size={16} />
      </button>
    </div>
  );
}
