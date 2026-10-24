type Row = Record<string, string>;

type Schedule = {
  source?: string;
  today?: string;
  counts?: Record<string, number>;
  due?: Row[];
  rows?: Row[];
  error?: string;
};

const apiBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

async function load(): Promise<Schedule> {
  try {
    const response = await fetch(`${apiBase}/schedule`, { cache: 'no-store' });
    if (!response.ok) return { error: `API ${response.status}` };
    return (await response.json()) as Schedule;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'API unreachable' };
  }
}

export default async function Page() {
  const data = await load();
  const upcoming = (data.rows || [])
    .filter((row) => (row.status || '').toLowerCase() !== 'posted')
    .slice(0, 40);

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 64px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Schedule</h1>
      <p style={{ color: '#9a9a9a' }}>
        One <code>scheduled</code> row posts to Instagram and YouTube every 15 minutes.
        {data.today ? ` Beirut ${data.today}.` : ''} Approved stays parked.
      </p>
      {data.error ? <p style={{ color: '#ffb4a8' }}>{data.error}</p> : null}
      <p>
        {Object.entries(data.counts || {}).map(([name, count]) => (
          <span
            key={name}
            style={{
              display: 'inline-block',
              marginRight: 8,
              padding: '2px 8px',
              border: '1px solid #333',
              borderRadius: 999,
            }}
          >
            {name} {count}
          </span>
        ))}
      </p>
      <h2>Due now ({data.due?.length ?? 0})</h2>
      <Table rows={data.due || []} />
      <h2>Still to post</h2>
      <Table rows={upcoming} />
    </main>
  );
}

function Table({ rows }: { rows: Row[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Date', 'Entity', 'Series', 'Title', 'Status', 'Collabs'].map((label) => (
            <th
              key={label}
              style={{
                textAlign: 'left',
                color: '#888',
                fontSize: 12,
                padding: '8px 10px',
                borderBottom: '1px solid #2a2a2a',
              }}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} style={{ padding: '8px 10px' }}>
              None
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={`${row.entity}-${row.series}-${row.id}-${index}`}>
              {[
                row.scheduled_date,
                row.entity,
                row.series,
                row.youtube_title || row.title,
                row.status,
                row.collaborators,
              ].map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a2a' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
