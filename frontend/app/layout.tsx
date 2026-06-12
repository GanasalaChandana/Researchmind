import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";

export const metadata: Metadata = {
  title: "ResearchMind — AI Research Agent",
  description: "Multi-agent AI that searches the web, reads sources, and synthesises full research reports with knowledge graphs — in minutes.",
  manifest: "/manifest.json",
  themeColor: "#6366f1",
  keywords: ["AI research", "research agent", "knowledge graph", "multi-agent AI", "web research", "research automation"],
  authors: [{ name: "ResearchMind" }],
  openGraph: {
    title: "ResearchMind — AI Research Agent",
    description: "4 AI agents search the live web and synthesise full research reports with knowledge graphs — in minutes.",
    url: "https://researchmind-app.vercel.app",
    siteName: "ResearchMind",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ResearchMind — AI Research Agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ResearchMind — AI Research Agent",
    description: "4 AI agents search the live web and synthesise full research reports with knowledge graphs — in minutes.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ResearchMind",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <LanguageProvider>
            {children}
            <Toaster position="bottom-right" toastOptions={{ style: { background: "#1a1d2e", color: "#e2e8f0", border: "1px solid #2a2d3e" } }} />
            </LanguageProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
