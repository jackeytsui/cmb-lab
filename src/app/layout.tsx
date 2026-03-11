import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { Toaster } from "sonner";

// ClerkProvider requires publishableKey at render time, so all pages
// wrapped by this root layout must be dynamically rendered
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Canto to Mando Blueprint LMS",
  description: "Interactive language learning platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Canto to Mando",
  },
};

const SHOW_CHAT_WIDGET = process.env.NEXT_PUBLIC_ENABLE_CHAT_WIDGET === "true";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      {/* Phonetic font source variables: replace 'sans-serif' with localFont().style.fontFamily
          once custom .woff2/.ttf font files are provided. These are referenced by @theme in
          globals.css as --font-hanzi-pinyin: var(--font-hp-src) and
          --font-cantonese-visual: var(--font-cv-src). See 30-RESEARCH.md for the localFont() pattern. */}
      <html
        lang="en"
        style={{
          "--font-hp-src": "sans-serif",
          "--font-cv-src": "sans-serif",
        } as React.CSSProperties}
      >
        <body
          className={`${inter.variable} font-sans antialiased bg-white text-zinc-900 dark:bg-gray-950 dark:text-gray-100`}
        >
          {children}
          <Toaster richColors position="top-right" />
          {SHOW_CHAT_WIDGET ? <ChatWidget /> : null}
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </body>
      </html>
    </ClerkProvider>
  );
}
