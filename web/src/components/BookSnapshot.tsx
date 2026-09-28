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
    <div className="grid grid-cols-2 gap-3 p-3 bg-black/50 rounded-xl border border-white/5 font-mono text-[11px]">
      <div>
        <div className="text-[9px] uppercase font-bold text-patina-light mb-1.5 flex items-center justify-between">
          <span>Bids (Top 5)</span>
          <span className="text-zinc-500 font-normal">Size</span>
        </div>
        <div className="space-y-1">
          {bids.map((b, idx) => (
            <div key={idx} className="flex justify-between items-center text-zinc-300">
              <span className="tabular-nums text-patina font-medium">${Number(b.price).toFixed(2)}</span>
              <span className="tabular-nums text-zinc-400">{Number(b.size).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[9px] uppercase font-bold text-red-300 mb-1.5 flex items-center justify-between">
          <span>Asks (Top 5)</span>
          <span className="text-zinc-500 font-normal">Size</span>
        </div>
        <div className="space-y-1">
          {asks.map((a, idx) => (
            <div key={idx} className="flex justify-between items-center text-zinc-300">
              <span className="tabular-nums text-red-400 font-medium">${Number(a.price).toFixed(2)}</span>
              <span className="tabular-nums text-zinc-400">{Number(a.size).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
