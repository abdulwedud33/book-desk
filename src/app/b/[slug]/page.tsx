export function generateStaticParams() {
  return [
    { slug: 'addis-barber' },
    { slug: 'test' },
  ];
}

export default function PublicBookingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <link rel="stylesheet" href="/booking/index.css" />
      <div id="booking-root" />
      <script src="/booking/index.js" defer />
    </main>
  );
}
