'use client';

import { useMemo, useState, type CSSProperties } from 'react';

type Status = {
  public_api_url?: string;
  gate_required?: boolean;
  tokens?: {
    youtube?: { connected?: boolean; source?: string; updated_at?: string };
    instagram?: {
      connected?: boolean;
      source?: string;
      expires_at?: string;
      days_left?: number;
    };
  };
  youtube_ping?: { ok?: boolean; channel?: string; detail?: string };
  instagram_ping?: { ok?: boolean; username?: string; detail?: string };
  sheets_hint?: string;
  error?: string;
};

export function ConnectPanel({
  initial,
  apiBase,
}: {
  initial: Status;
  apiBase: string;
}) {
  const [gate, setGate] = useState('');
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);

  const base = useMemo(
    () => (status.public_api_url || apiBase).replace(/\/+$/, ''),
    [status.public_api_url, apiBase],
  );

  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch(`${base}/oauth/status`, { cache: 'no-store' });
      if (!response.ok) {
        setStatus({ error: `API ${response.status}` });
        return;
      }
      setStatus((await response.json()) as Status);
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : 'unreachable' });
    } finally {
      setBusy(false);
    }
  }

  function start(platform: 'youtube' | 'instagram') {
    if (!gate.trim()) {
      window.alert('Paste OAUTH_GATE from Dokploy API env first.');
      return;
    }
    const url = `${base}/oauth/${platform}?gate=${encodeURIComponent(gate.trim())}`;
    window.location.href = url;
  }

  const yt = status.tokens?.youtube;
  const ig = status.tokens?.instagram;

  return (
    <section
      style={{
        margin: '28px 0',
        padding: '16px 18px',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        background: '#161616',
      }}
    >
      <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Connect</h2>
      <p style={{ color: '#9a9a9a', marginTop: 0 }}>
        Sign in on the API. Refresh tokens land in private S3. Sheets should use a service
        account, not this flow.
      </p>
      {status.error ? <p style={{ color: '#ffb4a8' }}>{status.error}</p> : null}
      <p style={{ fontSize: 14 }}>
        YouTube:{' '}
        {status.youtube_ping?.ok
          ? `ok — ${status.youtube_ping.channel}`
          : status.youtube_ping?.detail || (yt?.connected ? `stored (${yt.source})` : 'not connected')}
      </p>
      <p style={{ fontSize: 14 }}>
        Instagram:{' '}
        {status.instagram_ping?.ok
          ? `ok — @${status.instagram_ping.username}`
          : status.instagram_ping?.detail ||
            (ig?.connected
              ? `stored (${ig.source}${ig.days_left != null ? `, ${ig.days_left}d left` : ''})`
              : 'not connected')}
      </p>
      {status.sheets_hint ? (
        <p style={{ color: '#9a9a9a', fontSize: 13 }}>{status.sheets_hint}</p>
      ) : null}
      <label style={{ display: 'block', margin: '12px 0 8px', fontSize: 13, color: '#aaa' }}>
        OAUTH_GATE
        <input
          type="password"
          value={gate}
          onChange={(event) => setGate(event.target.value)}
          placeholder="from Dokploy API env"
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 420,
            marginTop: 6,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#0f0f0f',
            color: '#eee',
          }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" onClick={() => start('youtube')} style={buttonStyle}>
          Connect YouTube
        </button>
        <button type="button" onClick={() => start('instagram')} style={buttonStyle}>
          Connect Instagram
        </button>
        <button type="button" onClick={refresh} disabled={busy} style={buttonStyle}>
          {busy ? 'Checking…' : 'Refresh status'}
        </button>
      </div>
    </section>
  );
}

const buttonStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #444',
  background: '#222',
  color: '#eee',
  cursor: 'pointer',
};
