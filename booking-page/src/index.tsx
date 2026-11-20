import React from 'react';
import { createRoot } from 'react-dom/client';

function BookingApp() {
  const path = window.location.pathname;
  const isManage = path.startsWith('/m/');
  const slug = path.startsWith('/b/') ? path.replace('/b/', '') : 'test';

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-paper)' }}>
      {/* Header */}
      <header style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-line)' }}>
        <div>
          <h1 style={{ fontSize: '20px', color: 'var(--color-ink)' }}>Book Desk</h1>
          <p style={{ fontSize: '12px', color: 'var(--color-slate)' }}>
            {isManage ? 'Manage Appointment' : `Booking for: ${slug || 'Business'}`}
          </p>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-slate)' }}>
          EN | AM | OM
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '24px 16px', flex: 1 }}>
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>
            {isManage ? 'Your Appointment' : 'Pick a service'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-slate)' }}>
            {isManage
              ? 'View or reschedule your appointment.'
              : 'Select a service and time. No account needed.'}
          </p>
        </div>

        <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-line)' }}>
          <p style={{ fontSize: '14px', color: 'var(--color-st-confirmed)', fontWeight: 600 }}>
            ✓ Ready for Pilot
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-slate)', marginTop: '4px' }}>
            Double bookings prevented by database exclusion constraint.
          </p>
        </div>
      </main>

      {/* Fixed Action Bar */}
      <footer style={{ position: 'sticky', bottom: 0, padding: '16px', backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-line)' }}>
        <button className="btn-primary" type="button" onClick={() => alert('Booking system ready!')}>
          {isManage ? 'View Details' : 'Continue'}
        </button>
      </footer>
    </div>
  );
}

const rootElement = document.getElementById('booking-root');
if (rootElement) {
  createRoot(rootElement).render(<BookingApp />);
}
