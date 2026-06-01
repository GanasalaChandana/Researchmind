import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "ResearchMind — AI Research Agent",
  description: "Multi-agent AI that researches any topic and builds a knowledge graph",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="bottom-right" toastOptions={{ style: { background: "#1a1d2e", color: "#e2e8f0", border: "1px solid #2a2d3e" } }} />
      </body>
    </html>
  );
}
