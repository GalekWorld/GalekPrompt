import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GalekPrompt - Transform Images into Perfect Gemini Prompts",
  description: "Upload any image and get an optimized prompt for Gemini Image generation. Perfect for creators, influencers, and anyone wanting to recreate visual styles with their own face.",
  keywords: ["GalekPrompt", "Gemini", "AI prompts", "image to prompt", "prompt engineering", "AI vision", "content creation", "AI image generation"],
  authors: [{ name: "GalekPrompt Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "GalekPrompt - AI Image to Prompt Generator",
    description: "Transform any image into a perfect Gemini prompt in seconds. No prompt engineering skills required.",
    url: "https://promptcraft.ai",
    siteName: "GalekPrompt",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GalekPrompt - AI Image to Prompt Generator",
    description: "Transform any image into a perfect Gemini prompt in seconds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
