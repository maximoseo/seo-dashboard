import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SEO Dashboard | MaximoSEO',
  description: 'Comprehensive SEO dashboard with 30+ integrated tools for keyword research, backlink analysis, technical audits, and performance monitoring.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
