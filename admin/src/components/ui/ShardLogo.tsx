import React from 'react';

export function ShardLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="clogin-logo-svg">
      <defs>
        <linearGradient id="clogin-cyber-g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#e040fb" />
        </linearGradient>
        <filter id="clogin-neon-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00f0ff" floodOpacity="0.6" />
        </filter>
      </defs>
      <path
        d="M16 2L28 8.5V23.5L16 30L4 23.5V8.5L16 2Z"
        fill="rgba(5, 22, 30, 0.85)"
        stroke="url(#clogin-cyber-g1)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        filter="url(#clogin-neon-glow)"
      />
      <path
        d="M21 11C19.5 9.2 17.2 8.5 15 9C11.8 9.7 9.5 12.5 9.5 16C9.5 19.5 11.8 22.3 15 23C17.2 23.5 19.5 22.8 21 21"
        stroke="#00ffb7"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.5" fill="#00f0ff" />
    </svg>
  );
}
