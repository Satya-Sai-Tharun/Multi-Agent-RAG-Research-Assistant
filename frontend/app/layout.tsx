import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Multi-Agent RAG Research Assistant",
  description:
    "A fully local, multi-agent RAG system for document research and intelligent Q&A with citations. Upload PDFs or URLs and ask anything.",
  keywords: ["RAG", "AI", "research", "document analysis", "local LLM", "Ollama"],
  authors: [{ name: "RAG Research Assistant" }],
  openGraph: {
    title: "Multi-Agent RAG Research Assistant",
    description: "AI-powered local document research with citations.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
