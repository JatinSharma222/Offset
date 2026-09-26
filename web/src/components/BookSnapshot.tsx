import React from 'react';

interface BookLevel {
  price: string | number;
  size: string | number;
}

interface BookSnapshotProps {
  bids: BookLevel[];
  asks: BookLevel[];
}

export const BookSnapshot: React.FC<BookSnapshotProps> = ({ bids, asks }) => {
  return (
    <div className="grid grid-cols-2 gap-4 p-3.5 bg-surface-0 rounded border border-surface-2 font-mono text-xs">
      <div>
        <div className="text-[10px] uppercase font-bold text-risk-healthy mb-1.5">Bids (Top 5)</div>
        <div className="space-y-1">
          {bids.map((b, idx) => (
            <div key={idx} className="flex justify-between text-text-muted">
              <span className="tabular-nums text-risk-healthy font-semibold">${Number(b.price).toFixed(2)}</span>
              <span className="tabular-nums text-text-muted">{Number(b.size).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase font-bold text-risk-critical mb-1.5">Asks (Top 5)</div>
        <div className="space-y-1">
          {asks.map((a, idx) => (
            <div key={idx} className="flex justify-between text-text-muted">
              <span className="tabular-nums text-risk-critical font-semibold">${Number(a.price).toFixed(2)}</span>
              <span className="tabular-nums text-text-muted">{Number(a.size).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
