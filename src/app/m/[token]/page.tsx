export function generateStaticParams() {
  return [
    { token: 'demo' },
    { token: 'tok_test' },
  ];
}

export default function ManageBookingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <link rel="stylesheet" href="/booking/index.css" />
      <div id="booking-root" />
      <script src="/booking/index.js" defer />
    </main>
  );
}
