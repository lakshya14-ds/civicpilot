'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface StaffUser {
  officerId: string;
  role: 'reviewer' | 'admin';
}

interface StaffAuthContextType {
  isStaff: boolean;
  authReady: boolean;
  staffUser: StaffUser | null;
  staffSecret: string;
  login: (secret: string, officerId?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  pendingReviewCount: number;
  refreshPendingCount: () => void;
}

const StaffAuthContext = createContext<StaffAuthContextType | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [authReady, setAuthReady] = useState(false);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [staffSecret, setStaffSecret] = useState<string>('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);

  const refreshPendingCount = useCallback(async (secret?: string) => {
    try {
      const key = secret || sessionStorage.getItem('civicpilot:staff-secret');
      if (!key) return;
      const res = await fetch('/api/complaints?requires_human_review=true&limit=100', {
        headers: { 'x-reviewer-secret': key, 'x-admin-key': key },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const pending = (data.data || []).filter(
          (t: { status: string; requires_human_review?: boolean }) =>
            t.status === 'pending_review' || t.requires_human_review
        );
        setPendingReviewCount(pending.length);
      }
    } catch {
      // ignore
    }
  }, []);

  // Revalidate stored credentials before restoring the staff UI.
  useEffect(() => {
    const savedSecret = sessionStorage.getItem('civicpilot:staff-secret');
    const savedOfficerId = sessionStorage.getItem('civicpilot:staff-id') || 'officer-1';
    if (!savedSecret) { setAuthReady(true); return; }
    fetch('/api/auth/staff', { headers: { 'x-reviewer-secret': savedSecret }, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Staff session expired');
        const data = await res.json();
        setStaffSecret(savedSecret);
        setStaffUser({ officerId: savedOfficerId, role: data.role === 'admin' ? 'admin' : 'reviewer' });
        setIsStaff(true);
        refreshPendingCount(savedSecret);
      })
      .catch(() => {
        sessionStorage.removeItem('civicpilot:staff-secret');
        sessionStorage.removeItem('civicpilot:staff-id');
        sessionStorage.removeItem('civicpilot:staff-role');
      })
      .finally(() => setAuthReady(true));
  }, [refreshPendingCount]);

  const login = useCallback(
    async (secret: string, officerId: string = 'officer-1'): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, officer_id: officerId }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Authentication failed' };
        }

        const role = data.role === 'admin' ? 'admin' : 'reviewer';
        const finalOfficerId = data.officer_id || officerId;

        // Persist session
        sessionStorage.setItem('civicpilot:staff-secret', secret);
        sessionStorage.setItem('civicpilot:staff-id', finalOfficerId);
        sessionStorage.setItem('civicpilot:staff-role', role);

        setStaffSecret(secret);
        setStaffUser({ officerId: finalOfficerId, role });
        setIsStaff(true);
        setIsLoginModalOpen(false);

        // Notify app
        window.dispatchEvent(new CustomEvent('civicpilot:staff-login', { detail: { officerId: finalOfficerId, role } }));
        refreshPendingCount(secret);

        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Network failure during login';
        return { success: false, error: message };
      }
    },
    [refreshPendingCount]
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem('civicpilot:staff-secret');
    sessionStorage.removeItem('civicpilot:staff-id');
    sessionStorage.removeItem('civicpilot:staff-role');

    setStaffSecret('');
    setStaffUser(null);
    setIsStaff(false);
    setPendingReviewCount(0);
    window.dispatchEvent(new CustomEvent('civicpilot:staff-logout'));
  }, []);

  const openLoginModal = useCallback(() => setIsLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setIsLoginModalOpen(false), []);

  return (
    <StaffAuthContext.Provider
      value={{
        isStaff,
        authReady,
        staffUser,
        staffSecret,
        login,
        logout,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
        pendingReviewCount,
        refreshPendingCount,
      }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (!context) {
    throw new Error('useStaffAuth must be used within a StaffAuthProvider');
  }
  return context;
}
