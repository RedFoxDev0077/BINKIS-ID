import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BINKIS ID',
  description: 'Digital identity registry for physical BINKIS collectible figures.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
