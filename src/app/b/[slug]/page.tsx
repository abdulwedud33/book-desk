import Script from 'next/script';

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
      <div id="booking-root" suppressHydrationWarning />
      <Script src="/booking/index.js" strategy="afterInteractive" />
    </main>
  );
}
