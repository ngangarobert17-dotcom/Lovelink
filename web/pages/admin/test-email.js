import { useState } from 'react';

export default function TestEmailPage() {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('LoveLink test email');
  const [text, setText] = useState('This is a test email from LoveLink.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const send = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/send-test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ to, subject, text })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setResult({ success: true, info: json.info });
    } catch (err) {
      console.error(err);
      setResult({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div style={{ padding: 24 }}>You must be logged in as admin to use this page.</div>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin: Send Test Email</h1>
      <form onSubmit={send} style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: 8 }}>
          <label>To (optional):</label>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Subject:</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Text:</label>
          <textarea value={text} onChange={e => setText(e.target.value)} style={{ width: '100%', padding: 8, minHeight: 120 }} />
        </div>
        <div>
          <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send test email'}</button>
        </div>
      </form>

      {result && (
        <div style={{ marginTop: 12 }}>
          {result.success ? (
            <div style={{ color: 'green' }}>Email sent. Info: {JSON.stringify(result.info)}</div>
          ) : (
            <div style={{ color: 'red' }}>Failed: {result.error}</div>
          )}
        </div>
      )}
    </main>
  );
}
