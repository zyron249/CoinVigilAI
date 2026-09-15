import "./globals.css";

export const metadata = {
  title: "CoinVigil AI — Crypto Intelligence",
  description: "24/7 AI-powered crypto market intelligence",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
