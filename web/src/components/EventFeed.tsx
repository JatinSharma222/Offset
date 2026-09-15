import React from 'react';

export interface EventItem {
  time: string;
  type: string;
  message: string;
  highlight?: boolean;
}

interface EventFeedProps {
  events: EventItem[];
}

export const EventFeed: React.FC<EventFeedProps> = ({ events }) => {
  return (
    <div className="bg-[#12141a] border border-[#232733] rounded-lg p-5">
      <h3 className="text-sm font-semibold tracking-wider uppercase text-neutral-300 pb-3 border-b border-[#232733]">
        Recent Activity
      </h3>

      <div className="mt-3 space-y-2.5 font-mono text-xs">
        {events.map((evt, idx) => (
          <div
            key={idx}
            className={`flex items-start justify-between py-1.5 border-b border-[#1a1d26] last:border-0 ${
              evt.highlight ? 'text-amber-400 font-semibold' : 'text-neutral-400'
            }`}
          >
            <span className="text-neutral-500 mr-2">{evt.time}</span>
            <span className="flex-1 truncate">{evt.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
