import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "katex/dist/katex.min.css";
import { GoogleTranslateScript } from "@/components/menus/LanguageMenu";

const siteUrl = "https://raya.thebluestift.com";
const normalizedSiteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? siteUrl).replace(/\/$/, "");
const siteTitle = "RAYA - AI Assistant for Learning";
const siteDescription =
  "RAYA is an AI learning assistant that helps students learn, revise, and get clear answers in real time.";

export const metadata: Metadata = {
  metadataBase: new URL(normalizedSiteUrl),
  title: {
    default: siteTitle,
    template: "%s | RAYA",
  },
  description: siteDescription,
  keywords: [
    "RAYA",
    "assistant IA",
    "intelligence artificielle",
    "education",
    "apprentissage",
    "revision",
    "aide scolaire",
    "chatbot educatif",
  ],
  authors: [{ name: "TheBlueStift" }],
  creator: "TheBlueStift",
  publisher: "TheBlueStift",
  category: "education",
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: normalizedSiteUrl,
    siteName: "RAYA",
    title: siteTitle,
    description: siteDescription,
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
    title: siteTitle,
    description: siteDescription,
    images: ["/raya-logo.jpeg"],
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RAYA",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: normalizedSiteUrl,
  description: siteDescription,
  inLanguage: "en",
  publisher: {
    "@type": "Organization",
    name: "TheBlueStift",
    url: normalizedSiteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ZN54V4B17X"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ZN54V4B17X');
          `}
        </Script>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className="antialiased font-sans">
        {children}
        <GoogleTranslateScript />
      </body>
    </html>
  );
}
