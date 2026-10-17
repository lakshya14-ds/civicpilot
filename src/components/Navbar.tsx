'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Landmark, Menu, X } from 'lucide-react';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/submit', label: 'Report an issue' },
  { href: '/complaints', label: 'Track complaints' },
  { href: '/review', label: 'Review queue' },
  { href: '/analytics', label: 'Analytics' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const runSlaCheck = async () => {
    try {
      setBusy(true);
      const staffSecret = sessionStorage.getItem('civicpilot:staff-secret') || '';
      const res = await fetch('/api/escalate', { method:'POST', headers:{ 'x-reviewer-secret':staffSecret, 'x-demo-escalate':'civicpilot-demo-confirm' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SLA check failed');
      setMessage(`Checked ${data.checked_count} reports; ${data.escalated_count} escalated.`);
      window.dispatchEvent(new CustomEvent('civicpilot:refresh'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SLA check failed'); }
    finally { setBusy(false); }
  };
  const resetDemo = async () => {
    if (!window.confirm('Reset the demo to its sample reports?')) return;
    try {
      setBusy(true);
      const res = await fetch('/api/seed', { method:'POST', headers:{ 'x-demo-reset':'civicpilot-demo-confirm' } });
      if (!res.ok) throw new Error('Could not reset sample reports');
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Reset failed'); setBusy(false); }
  };
  return <header className="civic-header">
    <div className="civic-header-inner civic-container">
      <Link href="/" className="civic-brand" onClick={() => setOpen(false)}><span className="civic-brand-mark"><Landmark size={24} strokeWidth={1.8}/></span><span>CivicPilot</span></Link>
      <nav className={`civic-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={pathname === link.href || (link.href === '/complaints' && pathname.startsWith('/complaints/')) ? 'active' : ''}>{link.label}</Link>)}
      </nav>
      <details className="civic-staff-tools"><summary>Staff tools</summary><div><button type="button" disabled={busy} onClick={runSlaCheck}>Run SLA check</button><button type="button" disabled={busy} onClick={resetDemo}>Reset demo data</button>{message && <p role="status">{message}</p>}</div></details>
      <Link href="/submit" className="civic-header-action">Make a report <ArrowRight size={16}/></Link>
      <button className="civic-menu-toggle" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={24}/> : <Menu size={24}/>}</button>
    </div>
    {!process.env.NEXT_PUBLIC_SUPABASE_URL && <div className="civic-demo-strip">Bengaluru pilot demo · Reports are temporary and have not been sent to a government office.</div>}
  </header>;
}
