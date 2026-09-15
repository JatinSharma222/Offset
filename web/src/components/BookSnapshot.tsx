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
    <div className="grid grid-cols-2 gap-4 p-3 bg-[#0a0b0e] rounded border border-[#232733] font-mono text-xs">
      <div>
        <div className="text-[10px] uppercase font-bold text-emerald-400 mb-1">Bids (Top 5)</div>
        <div className="space-y-1">
          {bids.map((b, idx) => (
            <div key={idx} className="flex justify-between text-neutral-400">
              <span className="tabular-nums text-emerald-500">${Number(b.price).toFixed(2)}</span>
              <span className="tabular-nums text-neutral-500">{Number(b.size).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase font-bold text-red-400 mb-1">Asks (Top 5)</div>
        <div className="space-y-1">
          {asks.map((a, idx) => (
            <div key={idx} className="flex justify-between text-neutral-400">
              <span className="tabular-nums text-red-500">${Number(a.price).toFixed(2)}</span>
              <span className="tabular-nums text-neutral-500">{Number(a.size).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
