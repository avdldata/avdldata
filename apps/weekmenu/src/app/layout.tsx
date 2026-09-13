import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Weekmenu — gezond en goedkoop eten',
  description:
    'Stel in een paar minuten een gezond weekmenu samen dat past bij jouw gezin, en zie meteen bij welke supermarkt je het goedkoopst uit bent.',
};

export const viewport: Viewport = {
  themeColor: '#2f6d4f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
