'use client';

import React from 'react';

interface BannerProps {
  type?: 'offline' | 'pending' | 'warning' | 'conflict';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function Banner({
  type = 'warning',
  message,
  actionLabel,
  onAction,
  className = '',
}: BannerProps) {
  const styles = {
    offline: 'bg-slate/15 text-slate border-slate/30',
    pending: 'bg-st-pending/20 text-st-pending-text border-st-pending/40',
    warning: 'bg-st-noshow/15 text-st-noshow border-st-noshow/30',
    conflict: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  }[type];

  return (
    <div
      role="alert"
      className={`flex items-center justify-between px-3 py-2 border rounded-control text-xs font-medium ${styles} ${className}`}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="ml-2 underline font-semibold cursor-pointer hover:opacity-80"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
