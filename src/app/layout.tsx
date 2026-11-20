import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Book Desk - Staff App',
  description: 'Business appointment booking and live calendar',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
