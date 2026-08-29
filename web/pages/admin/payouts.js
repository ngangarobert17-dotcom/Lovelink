import { useEffect, useState } from 'react';

function PayoutRow({ p, onApprove, onMarkPaid }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #eee' }}>
      <div>
        <div><strong>Payout #{p.id}</strong> — KSh {p.amount}</div>
        <div style={{ fontSize: 12, color: '#666' }}>User: {p.user && p.user.email} • {p.status}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {p.status === 'pending' && <button onClick={() => onApprove(p.id)}>Approve</button>}
        {p.status === 'approved' && <button onClick={() => onMarkPaid(p.id)}>Mark Paid (send)</button>}
      </div>
    </div>
  );
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState(null);
  const [loading, setLoading] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payouts`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        setPayouts(json);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token]);

  const approve = async (id) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payouts/${id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to approve');
      const json = await res.json();
      setPayouts(prev => prev.map(p => p.id === json.id ? json : p));
    } catch (e) {
      console.error(e);
      alert('Approve failed');
    }
  };

  const markPaid = async (id) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payouts/${id}/mark-paid`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Mark paid failed');
      setPayouts(prev => prev.map(p => p.id === json.id ? json : p));
      alert('Payout sent, providerId: ' + (json.providerId || 'n/a'));
    } catch (e) {
      console.error(e);
      alert('Mark paid failed: ' + e.message);
    }
  };

  if (!token) return <div style={{ padding: 24 }}>You must be logged in as admin to view this page.</div>;
  if (loading && !payouts) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin: Payout Requests</h1>
      <div style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
        {payouts && payouts.length > 0 ? payouts.map(p => (
          <PayoutRow key={p.id} p={p} onApprove={approve} onMarkPaid={markPaid} />
        )) : <div style={{ padding: 16 }}>No payout requests found.</div>}
      </div>
    </main>
  );
}
