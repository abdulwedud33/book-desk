import React from 'react';

interface SkeletonProps {
  className?: string;
  height?: string | number;
  width?: string | number;
  rounded?: 'control' | 'card' | 'sheet' | 'full';
}

/**
 * Skeleton loader conforming to standing UX rule 1:
 * "No spinners. Where the layout is known, a skeleton matching the real layout appears."
 */
export function Skeleton({
  className = '',
  height,
  width,
  rounded = 'control',
}: SkeletonProps) {
  const roundedClass = {
    control: 'rounded-control',
    card: 'rounded-card',
    sheet: 'rounded-sheet',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-line/60 ${roundedClass} ${className}`}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: typeof width === 'number' ? `${width}px` : width,
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-surface border border-line rounded-card p-4 space-y-3">
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="85%" />
      <div className="flex justify-between items-center pt-2">
        <Skeleton height={14} width="30%" />
        <Skeleton height={32} width={80} rounded="control" />
      </div>
    </div>
  );
}

export function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-line rounded-card p-3 flex justify-between items-center">
          <div className="space-y-1 w-2/3">
            <Skeleton height={16} width="50%" />
            <Skeleton height={12} width="80%" />
          </div>
          <Skeleton height={24} width={64} rounded="full" />
        </div>
      ))}
    </div>
  );
}

export function ChipGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={48} rounded="control" />
      ))}
    </div>
  );
}

export function CalendarGridSkeleton({ hours = 6 }: { hours?: number }) {
  return (
    <div className="border border-line rounded-card divide-y divide-line bg-surface">
      {Array.from({ length: hours }).map((_, i) => (
        <div key={i} className="h-16 flex items-center px-3 gap-3">
          <Skeleton height={14} width={40} />
          <div className="flex-1">
            {i % 2 === 0 ? <Skeleton height={42} rounded="control" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
