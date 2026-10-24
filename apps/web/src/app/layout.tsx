export const metadata = {
  title: 'Schedule',
  description: 'Publish clock',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#111',
          color: '#eee',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
