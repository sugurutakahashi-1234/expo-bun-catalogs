import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Next App',
  description: 'Next.js app with catalog management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
