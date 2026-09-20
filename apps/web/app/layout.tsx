import "./globals.css";

export const metadata = {
  title: "CoinVigil AI — Crypto Rankings & Intelligence",
  description: "AI-supported crypto rankings, global stats, and research tools. Not CoinMarketCap. Not financial advice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
