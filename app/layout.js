import "./globals.css";

export const metadata = {
  title: "Jamarik — Lebanon Customs Intelligence",
  description:
    "Trade-mirror forensics for Lebanese customs: what partners report shipping against what Lebanon declares importing, and the customs & VAT revenue hiding in the gap.",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#16130d",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
