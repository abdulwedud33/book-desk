export default function HomePage() {
  return (
    <main className="max-w-md mx-auto p-4 min-h-screen flex flex-col justify-between">
      <header className="border-b border-line pb-4 pt-2">
        <h1 className="font-heading text-2xl text-ink">Book Desk</h1>
        <p className="text-slate text-sm">Staff App & Live Calendar</p>
      </header>

      <section className="my-8 space-y-4">
        <div className="bg-surface border border-line rounded-card p-4 shadow-sm">
          <h2 className="font-heading text-lg mb-1">Today's Agenda</h2>
          <p className="text-slate text-sm">
            Local-first, optimistic updates, and zero double bookings.
          </p>
        </div>

        <div className="bg-surface border border-line rounded-card p-4">
          <span className="inline-block px-2 py-1 rounded text-xs font-semibold text-st-confirmed bg-st-confirmed/10 mb-2">
            System Online
          </span>
          <p className="text-xs text-slate">
            Postgres btree_gist exclusion constraints enforce appointment integrity.
          </p>
        </div>
      </section>

      <footer className="border-t border-line pt-4 text-center text-xs text-slate">
        Book Desk v0.1 • M0 Setup Complete
      </footer>
    </main>
  );
}
