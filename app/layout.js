import './globals.css';

export const metadata = {
  title: 'Fresh Control',
  description: 'Daily sales, purchase, cash and day closing',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E1F1B',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
