import {
  ArrowLeft,
  ArrowRight,
  Download,
  Home,
  RotateCw,
  Search,
  Settings as SettingsIcon,
  VenetianMask,
  X,
} from 'lucide-react';
import { forwardRef } from 'react';
import type { DownloadInfo, TabInfo } from '../../shared/types';
import { AddressBar, type AddressBarHandle } from './AddressBar';

interface Props {
  tab: TabInfo | undefined;
  incognito: boolean;
  bookmarked: boolean;
  downloads: DownloadInfo[];
  onGo: (input: string, newTab: boolean) => void;
  onSuggestionsOpen: (open: boolean) => void;
  onOpenDownloads: () => void;
  onOpenFind: () => void;
  onOpenSettings: () => void;
}

export const Toolbar = forwardRef<AddressBarHandle, Props>(function Toolbar(props, ref) {
  const { tab, incognito, bookmarked, downloads } = props;
  const active = downloads.filter((d) => d.state === 'progressing').length;
  const canNavigate = !!tab && !tab.isNewTab;

  return (
    <div className="toolbar">
      <div className="nav-group">
        <button className="icon-btn" aria-label="Back" title="Back (Alt+←)" disabled={!tab?.canGoBack} onClick={() => window.orbis.nav.back()}>
          <ArrowLeft size={17} />
        </button>
        <button className="icon-btn" aria-label="Forward" title="Forward (Alt+→)" disabled={!tab?.canGoForward} onClick={() => window.orbis.nav.forward()}>
          <ArrowRight size={17} />
        </button>
        {tab?.loading ? (
          <button className="icon-btn" aria-label="Stop" title="Stop loading" onClick={() => window.orbis.nav.stop()}>
            <X size={17} />
          </button>
        ) : (
          <button className="icon-btn" aria-label="Reload" title="Reload (Ctrl+R)" disabled={!canNavigate} onClick={() => window.orbis.nav.reload()}>
            <RotateCw size={16} />
          </button>
        )}
        <button className="icon-btn" aria-label="Home" title="Home (Alt+Home)" onClick={() => window.orbis.nav.home()}>
          <Home size={16} />
        </button>
      </div>

      <AddressBar
        ref={ref}
        tab={tab}
        bookmarked={bookmarked}
        onGo={props.onGo}
        onToggleBookmark={() => window.orbis.bookmarks.toggle()}
        onSuggestionsOpen={props.onSuggestionsOpen}
      />

      <div className="tool-group">
        {tab && tab.zoom !== 100 && canNavigate && (
          <button className="zoom-chip" title="Reset zoom (Ctrl+0)" onClick={() => window.orbis.zoom.reset()}>
            {tab.zoom}%
          </button>
        )}
        <button className="icon-btn" aria-label="Find in page" title="Find in page (Ctrl+F)" disabled={!canNavigate} onClick={props.onOpenFind}>
          <Search size={16} />
        </button>
        <button className="icon-btn dl-btn" aria-label="Downloads" title="Downloads (Ctrl+J)" onClick={props.onOpenDownloads}>
          <Download size={16} />
          {active > 0 && <span className="dot" />}
        </button>
        <button className="icon-btn" aria-label="Settings" title="Settings (Ctrl+,)" onClick={props.onOpenSettings}>
          <SettingsIcon size={16} />
        </button>
        {incognito && (
          <span className="incognito-badge" title="Nothing you do in this window is saved">
            <VenetianMask size={15} /> Incognito
          </span>
        )}
      </div>
    </div>
  );
});
