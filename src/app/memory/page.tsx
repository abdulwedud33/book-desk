'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CardSkeleton, RowSkeleton } from '../../components/skeleton.tsx';
import { useToast } from '../../components/toast.tsx';
import { t } from '../../i18n/index.ts';
import { validateMemoryItem } from '../../domain/ai-guardrails.ts';

export interface MemoryRow {
  id: string;
  kind: 'alias' | 'preference' | 'fact';
  key: string;
  value: string;
  created_at: string;
}

export default function MemoryPage() {
  const [role, setRole] = useState<MemberRole>('owner');
  const [memoryItems, setMemoryItems] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  // New alias form
  const [newKind, setNewKind] = useState<'alias' | 'preference' | 'fact'>('alias');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  const { showToast } = useToast();
  const catalog = t().assistant;
  const common = t().common;

  useEffect(() => {
    // Initial sample memory items or local storage fallback
    const saved = localStorage.getItem('book_desk_shop_memory');
    if (saved) {
      try {
        setMemoryItems(JSON.parse(saved));
      } catch {
        // ignore
      }
    } else {
      const initial: MemoryRow[] = [
        {
          id: 'm1',
          kind: 'alias',
          key: 'fade',
          value: 'Skin fade haircut',
          created_at: new Date().toISOString(),
        },
        {
          id: 'm2',
          kind: 'alias',
          key: 'Sam',
          value: 'Provider Samson K.',
          created_at: new Date().toISOString(),
        },
        {
          id: 'm3',
          kind: 'preference',
          key: 'default_tone',
          value: 'friendly',
          created_at: new Date().toISOString(),
        },
        {
          id: 'm4',
          kind: 'fact',
          key: 'quiet_hours',
          value: 'Tuesday mornings are quiet',
          created_at: new Date().toISOString(),
        },
      ];
      setMemoryItems(initial);
      localStorage.setItem('book_desk_shop_memory', JSON.stringify(initial));
    }
    setLoading(false);
  }, []);

  const handleSaveMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (role !== 'owner') {
      showToast({ message: 'Only business owners can save memory items.' });
      return;
    }

    const validation = validateMemoryItem(newKind, newKey, newValue);
    if (!validation.valid) {
      showToast({ message: validation.error || 'Invalid memory item' });
      return;
    }

    setSaving(true);
    const newItem: MemoryRow = {
      id: crypto.randomUUID(),
      kind: newKind,
      key: newKey.trim(),
      value: newValue.trim(),
      created_at: new Date().toISOString(),
    };

    const updated = [newItem, ...memoryItems.filter((m) => !(m.kind === newKind && m.key === newKey.trim()))];
    setMemoryItems(updated);
    localStorage.setItem('book_desk_shop_memory', JSON.stringify(updated));

    setNewKey('');
    setNewValue('');
    setSaving(false);
    showToast({ message: 'Memory item saved' });
  };

  const handleDeleteItem = (id: string) => {
    if (role !== 'owner') {
      showToast({ message: 'Only business owners can delete memory.' });
      return;
    }

    const updated = memoryItems.filter((m) => m.id !== id);
    setMemoryItems(updated);
    localStorage.setItem('book_desk_shop_memory', JSON.stringify(updated));
    showToast({ message: 'Item removed from memory' });
  };

  const handleClearAll = () => {
    if (role !== 'owner') {
      showToast({ message: 'Only business owners can clear memory.' });
      return;
    }

    if (!confirm('Are you sure you want to clear all memory? This action cannot be undone.')) {
      return;
    }

    setMemoryItems([]);
    localStorage.removeItem('book_desk_shop_memory');
    showToast({ message: 'All memory items cleared' });
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.memoryTitle}</h1>
          <p className="text-xs text-slate">{catalog.memorySubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="text-xs bg-paper border border-line rounded px-1.5 py-1 text-slate font-medium"
            aria-label="Role Switcher"
          >
            <option value="owner">Role: Owner</option>
            <option value="reception">Role: Reception</option>
          </select>
          <LanguageSwitch />
        </div>
      </header>

      <main className="p-4 space-y-5 flex-1">
        {/* Add Memory Item Card (Owner Only) */}
        {role === 'owner' ? (
          <section className="bg-surface border border-line rounded-card p-4 space-y-3 shadow-xs">
            <h2 className="font-heading text-xs font-bold text-plum uppercase tracking-wider">
              {catalog.addAlias}
            </h2>

            <form onSubmit={handleSaveMemory} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate block mb-1">Kind</label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as any)}
                    className="w-full p-2 bg-paper border border-line rounded-control text-ink text-xs"
                  >
                    <option value="alias">Alias</option>
                    <option value="preference">Preference</option>
                    <option value="fact">Fact</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate block mb-1">
                    {catalog.aliasKey}
                  </label>
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="e.g. fade"
                    required
                    maxLength={80}
                    className="w-full p-2 bg-paper border border-line rounded-control text-ink text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate block mb-1">
                  {catalog.aliasValue}
                </label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. Skin fade haircut"
                  required
                  maxLength={300}
                  className="w-full p-2 bg-paper border border-line rounded-control text-ink text-xs"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={saving || !newKey.trim() || !newValue.trim()}
                  className="px-4 py-2 bg-plum text-on-plum font-semibold rounded-control hover:opacity-95 active:scale-95 transition-all text-xs disabled:opacity-50"
                >
                  {saving ? common.loading : catalog.saveMemory}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <div className="bg-surface border border-line rounded-card p-3 text-xs text-slate">
            Reception staff have read-only access to saved memory items.
          </div>
        )}

        {/* Saved Memory Items List */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate uppercase tracking-wider">
              Saved Memory ({memoryItems.length})
            </span>
            {role === 'owner' && memoryItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-rose-600 hover:underline font-semibold"
              >
                {catalog.clearAllMemory}
              </button>
            )}
          </div>

          {loading ? (
            <RowSkeleton />
          ) : memoryItems.length === 0 ? (
            <div className="bg-surface border border-dashed border-line rounded-card p-8 text-center text-xs text-slate">
              {catalog.emptyMemory}
            </div>
          ) : (
            <div className="space-y-2">
              {memoryItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface border border-line rounded-card p-3 flex justify-between items-start text-xs shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink font-mono">{item.key}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-paper border border-line rounded text-slate uppercase font-mono">
                        {item.kind}
                      </span>
                    </div>
                    <p className="text-slate">{item.value}</p>
                  </div>

                  {role === 'owner' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-slate hover:text-rose-600 p-1 text-sm transition-colors"
                      aria-label="Delete memory item"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav role={role} />
    </div>
  );
}
