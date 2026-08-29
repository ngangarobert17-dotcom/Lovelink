import { useEffect, useState } from 'react';

function EarningRow({ earning, checked, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #eee' }}>
      <label style={{ display: 'flex', alignItems: 'center' }}>
        <input type="checkbox" checked={checked} onChange={onChange} style={{ marginRight: 8 }} />
        <div>
          <div><strong>KSh {earning.amount}</strong></div>
          <div style={{ fontSize: 12, color: '#666' }}>{new Date(earning.createdAt).toLocaleString()}</div>
        </div>
      </label>
      <div style={{ minWidth: 120, textAlign: 'right' }}>{earning.payoutId ? 'Included in Payout #' + earning.payoutId : 'Unpaid'}</div>
    </div>
  );
}

export default function CreatorEarningsPage() {
  const [earnings, setEarnings] = useState(null);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/creator/earnings`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        setEarnings(json);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token]);

  const toggle = (id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const requestPayout = async () => {
    setLoading(true);
    try {
      const ids = earnings.filter(e => selected[e.id]).map(e => e.id);
      const body = ids.length > 0 ? { earningIds: ids } : {};
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/creator/payout-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      alert('Payout request created — id: ' + json.payout.id + ' for KSh ' + json.payout.amount);
      // refresh
      setSelected({});
      setEarnings(prev => prev.map(e => json.payout && e.payoutId ? e : (ids && ids.includes(e.id) ? { ...e, payoutId: json.payout.id } : e)));
      // reload for accuracy
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Error creating payout: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div style={{ padding: 24 }}>You must be logged in to view this page.</div>;
  if (loading && !earnings) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Your Creator Earnings</h1>
      <p>Unpaid earnings are listed below. Select earnings to include in a payout request, or leave none selected to include all unpaid.</p>

      <div style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
        {earnings && earnings.length > 0 ? earnings.map(e => (
          <EarningRow key={e.id} earning={e} checked={!!selected[e.id]} onChange={() => toggle(e.id)} />
        )) : <div style={{ padding: 16 }}>No earnings found.</div>}
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={requestPayout} disabled={loading}>
          {loading ? 'Processing...' : 'Request Payout from Selected / All Unpaid'}
        </button>
      </div>
    </main>
  );
}
