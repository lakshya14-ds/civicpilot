import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CivicPilot | Bengaluru civic issue pilot',
  description:
    'Report local issues in Bengaluru, track pilot progress, and stay informed with CivicPilot.',
  keywords: [
    'CivicPilot',
    'Civic Tech',
    'Complaint Management',
    'AI Triage',
    'Gemini AI',
    'n8n Workflows',
    'Municipal Operations',
  ],
};

import { Suspense } from 'react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<div className="h-16 bg-slate-900" />}>
          <Navbar />
        </Suspense>
        <Suspense fallback={null}>
          <main className="flex-1">{children}</main>
        </Suspense>
        <Footer />
      </body>
    </html>
  );
}
