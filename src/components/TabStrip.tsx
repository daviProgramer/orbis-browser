import { Globe, Pin, Plus, Volume2, VolumeX, X } from 'lucide-react';
import { useState } from 'react';
import type { TabInfo } from '../../shared/types';

interface Props {
  tabs: TabInfo[];
  activeId: number | null;
  settingsOpen: boolean;
}

export function TabStrip({ tabs, activeId, settingsOpen }: Props) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((tab, index) => {
        const active = tab.id === activeId && !settingsOpen;
        const title = tab.title || (tab.isNewTab ? 'New tab' : tab.url || 'Loading…');
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={title}
            draggable
            className={[
              'tab',
              active ? 'active' : '',
              tab.pinned ? 'pinned' : '',
              dragId === tab.id ? 'dragging' : '',
              overIndex === index && dragId !== null && dragId !== tab.id ? 'drop-target' : '',
            ].join(' ')}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                window.orbis.tabs.close(tab.id);
              } else if (e.button === 0) {
                window.orbis.tabs.activate(tab.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              window.orbis.tabs.contextMenu(tab.id);
            }}
            onDragStart={(e) => {
              setDragId(tab.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (dragId === null) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId !== null && dragId !== tab.id) window.orbis.tabs.move(dragId, index);
              setDragId(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverIndex(null);
            }}
          >
            <span className="tab-icon">
              {tab.loading ? (
                <span className="spinner" />
              ) : tab.favicon ? (
                <img src={tab.favicon} alt="" width={16} height={16} draggable={false} />
              ) : tab.pinned ? (
                <Pin size={14} />
              ) : (
                <Globe size={14} />
              )}
            </span>
            {!tab.pinned && <span className="tab-title">{title}</span>}
            {(tab.audible || tab.muted) && !tab.pinned && (
              <span className="tab-audio" aria-label={tab.muted ? 'Muted' : 'Playing audio'}>
                {tab.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </span>
            )}
            {!tab.pinned && (
              <button
                className="tab-close"
                aria-label="Close tab"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  window.orbis.tabs.close(tab.id);
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
      <button className="new-tab-btn" aria-label="New tab" title="New tab (Ctrl+T)" onClick={() => window.orbis.tabs.create()}>
        <Plus size={16} />
      </button>
    </div>
  );
}
