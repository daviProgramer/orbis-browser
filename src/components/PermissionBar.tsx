import { ShieldQuestion } from 'lucide-react';
import type { PermissionRequest } from '../../shared/types';
import { hostOf } from '../lib/theme';

interface Props {
  request: PermissionRequest;
  incognito: boolean;
  queued: number;
  onRespond: (allow: boolean, remember: boolean) => void;
}

export function PermissionBar({ request, incognito, queued, onRespond }: Props) {
  return (
    <div className="permbar" role="alertdialog" aria-label="Permission request">
      <ShieldQuestion size={18} />
      <span className="perm-text">
        <strong>{hostOf(request.origin)}</strong> wants to {request.label}
        {queued > 0 && <em> · {queued} more waiting</em>}
      </span>
      <button className="btn" onClick={() => onRespond(false, false)}>Not now</button>
      <button className="btn" onClick={() => onRespond(false, true)}>
        {incognito ? 'Block' : 'Always block'}
      </button>
      <button className="btn primary" onClick={() => onRespond(true, false)}>Allow this time</button>
      <button className="btn primary" onClick={() => onRespond(true, true)}>
        {incognito ? 'Allow' : 'Always allow'}
      </button>
    </div>
  );
}
