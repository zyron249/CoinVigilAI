import { AppChrome } from "../components/AppChrome";
import "./globals.css";

export const metadata = {
  title: "CoinVigil AI — Watchlist surveillance for your coins",
  description: "Watchlist-scoped smart alerts and tool-backed Ask for the coins you star. Not CoinMarketCap. Not financial advice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
