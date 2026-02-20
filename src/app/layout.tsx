import type { Metadata } from "next";
import "./globals.css";
import { GoogleTranslateScript } from "@/components/menus/LanguageMenu";

export const metadata: Metadata = {
  title: "RAYA - AI Assistant",
  description: "RAYA, your personal AI assistant for learning. Ask questions, get instant answers, and explore knowledge with AI.",
  keywords: ["AI", "assistant", "chatbot", "learning", "education", "RAYA", "artificial intelligence"],
  authors: [{ name: "TheBlueStift" }],
  creator: "TheBlueStift",
  publisher: "TheBlueStift",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://raya.thebluestift.com",
    siteName: "RAYA",
    title: "RAYA - AI Assistant",
    description: "RAYA, your personal AI assistant for learning. Ask questions, get instant answers, and explore knowledge with AI.",
    images: [
      {
        url: "/raya-logo.jpeg",
        width: 512,
        height: 512,
        alt: "RAYA AI Assistant Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "RAYA - AI Assistant",
    description: "RAYA, your personal AI assistant for learning. Ask questions, get instant answers, and explore knowledge with AI.",
    images: ["/raya-logo.jpeg"],
  },
  metadataBase: new URL("https://raya.thebluestift.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="antialiased font-sans">
        {children}
        <GoogleTranslateScript />
      </body>
    </html>
  );
}
