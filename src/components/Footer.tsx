import Link from 'next/link';
import { Landmark } from 'lucide-react';

export function Footer() {
  return <footer className="civic-footer"><div className="civic-container civic-footer-inner"><div><div className="civic-footer-brand"><Landmark size={20}/> CivicPilot</div><p>Helping residents and city teams solve local issues together.</p></div><nav aria-label="Footer navigation"><Link href="/submit">Report an issue</Link><Link href="/complaints">Track complaints</Link><Link href="/analytics">Service insights</Link></nav><small>© 2026 CivicPilot</small></div></footer>;
}
