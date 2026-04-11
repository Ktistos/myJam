import React from 'react';

export const JAM_STATE_ORDER = ['initial', 'tuning', 'in-progress', 'completed'];

const STATE_CONFIG = {
  initial:       { label: 'Initial',     bg: 'bg-gray-500' },
  tuning:        { label: 'Tuning',      bg: 'bg-yellow-500' },
  'in-progress': { label: 'In Progress', bg: 'bg-green-500' },
  completed:     { label: 'Completed',   bg: 'bg-blue-500' },
};

const JamStateBadge = ({ state }) => {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.initial;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${cfg.bg}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white opacity-75 inline-block" />
      {cfg.label}
    </span>
  );
};

export default JamStateBadge;
