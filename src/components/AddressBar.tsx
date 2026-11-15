import { AlertTriangle, Globe, History, Lock, Search, Star, Zap } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Suggestion, TabInfo } from '../../shared/types';
import { prettyUrl } from '../lib/theme';

export interface AddressBarHandle {
  focus(): void;
}

interface Props {
  tab: TabInfo | undefined;
  bookmarked: boolean;
  onGo: (input: string, newTab: boolean) => void;
  onToggleBookmark: () => void;
  onSuggestionsOpen: (open: boolean) => void;
}

export const AddressBar = forwardRef<AddressBarHandle, Props>(function AddressBar(
  { tab, bookmarked, onGo, onToggleBookmark, onSuggestionsOpen },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(-1);
  const queryId = useRef(0);

  const url = tab?.url ?? '';
  const display = tab?.isNewTab ? '' : prettyUrl(url);
  const open = focused && suggestions.length > 0;

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  // Keep the field in sync with the page unless the user is typing.
  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);

  useEffect(() => {
    onSuggestionsOpen(open);
  }, [open, onSuggestionsOpen]);

  useEffect(() => {
    if (!focused) return;
    const q = text.trim();
    const my = ++queryId.current;
    if (!q || q === display || q === url) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const list = await window.orbis.suggest(q);
      if (my === queryId.current) {
        setSuggestions(list);
        setSelected(-1);
      }
    }, 70);
    return () => clearTimeout(t);
  }, [text, focused, display, url]);

  const submit = (value: string, newTab: boolean) => {
    setSuggestions([]);
    onGo(value, newTab);
    inputRef.current?.blur();
  };

  const isLtsInput = /^lts(\s|$)/i.test(text);
  const secure = url.startsWith('https:');
  const insecure = url.startsWith('http:');

  return (
    <div className={`address ${focused ? 'focused' : ''}`}>
      <span className="address-lead" aria-hidden="true">
        {isLtsInput && focused ? (
          <span className="lts-chip"><Zap size={11} />LTS</span>
        ) : insecure ? (
          <AlertTriangle size={14} className="warn" />
        ) : secure ? (
          <Lock size={14} />
        ) : (
          <Search size={14} />
        )}
      </span>
      <input
        ref={inputRef}
        value={text}
        spellCheck={false}
        autoComplete="off"
        placeholder="Search or type a URL — try “lts ytb”"
        aria-label="Address bar"
        onFocus={(e) => {
          setFocused(true);
          setText(tab?.isNewTab ? '' : url);
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          setSuggestions([]);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected((s) => Math.min(suggestions.length - 1, s + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected((s) => Math.max(-1, s - 1));
          } else if (e.key === 'Enter') {
            const chosen = selected >= 0 ? suggestions[selected]?.value : text;
            submit(chosen ?? text, e.altKey);
          } else if (e.key === 'Escape') {
            setSuggestions([]);
            setText(display);
            inputRef.current?.blur();
          }
        }}
      />
      {tab && !tab.isNewTab && /^https?:/.test(url) && (
        <button
          className={`icon-btn star ${bookmarked ? 'on' : ''}`}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          title="Bookmark this page (Ctrl+D)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleBookmark}
        >
          <Star size={15} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
      )}

      {open && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}-${s.value}-${i}`}
              role="option"
              aria-selected={i === selected}
              className={i === selected ? 'selected' : ''}
              onMouseEnter={() => setSelected(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(s.value, false);
              }}
            >
              <span className="s-icon">
                {s.kind === 'lts' ? (
                  <Zap size={15} />
                ) : s.kind === 'search' ? (
                  <Search size={15} />
                ) : s.kind === 'history' ? (
                  s.favicon ? <img src={s.favicon} alt="" width={15} height={15} /> : <History size={15} />
                ) : s.kind === 'bookmark' ? (
                  <Star size={15} />
                ) : (
                  <Globe size={15} />
                )}
              </span>
              <span className="s-title">{s.title}</span>
              <span className="s-sub">{s.subtitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
