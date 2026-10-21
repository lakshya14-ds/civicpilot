import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { LanguageProvider } from '@/components/LanguageProvider';
import { cookies } from 'next/headers';
import type { UiLanguage } from '@/lib/i18n/messages';

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
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<div className="h-16 bg-slate-900" />}>
          <LocalizedShell>{children}</LocalizedShell>
        </Suspense>
      </body>
    </html>
  );
}

async function LocalizedShell({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get('civicpilot_language')?.value;
  const initialLanguage: UiLanguage = saved === 'hi' || saved === 'kn' ? saved : 'en';
  return (
    <LanguageProvider initialLanguage={initialLanguage}>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </LanguageProvider>
  );
}
