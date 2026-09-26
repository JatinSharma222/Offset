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
    <div className="bg-surface-1 border border-surface-2 rounded-lg p-5">
      <h3 className="text-sm font-semibold tracking-wider uppercase text-text-primary pb-3 border-b border-surface-2">
        Recent Activity
      </h3>

      <div className="mt-3 space-y-2.5 font-mono text-xs">
        {events.map((evt, idx) => (
          <div
            key={idx}
            className={`flex items-start justify-between py-1.5 border-b border-surface-2/50 last:border-0 ${
              evt.highlight ? 'text-risk-warning font-semibold' : 'text-text-muted'
            }`}
          >
            <span className="text-text-muted/70 mr-2 shrink-0">{evt.time}</span>
            <span className="flex-1 truncate">{evt.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
