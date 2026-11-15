import { CloudOff } from 'lucide-react';
import type { TabInfo } from '../../shared/types';
import { hostOf } from '../lib/theme';

export function ErrorPage({ tab }: { tab: TabInfo }) {
  const err = tab.error!;
  return (
    <div className="page error-page">
      <CloudOff size={46} strokeWidth={1.5} />
      <h1>This page can’t be reached</h1>
      <p>
        <strong>{hostOf(err.url) || err.url}</strong> — {err.description.replace(/^ERR_/, '').replace(/_/g, ' ').toLowerCase()}
        {err.code !== -1 && <code> ({err.code})</code>}
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => window.orbis.nav.reload()}>Try again</button>
        <button className="btn" onClick={() => window.orbis.nav.home()}>Go home</button>
      </div>
    </div>
  );
}
