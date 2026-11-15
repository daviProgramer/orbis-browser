import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FindResult } from '../../shared/types';

interface Props {
  result: FindResult;
  focusToken: number;
  onClose: () => void;
}

export function FindBar({ result, focusToken, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [matchCase, setMatchCase] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const start = (value: string, mc = matchCase) => {
    window.orbis.find.start(value, { findNext: false, forward: true, matchCase: mc });
  };
  const next = (forward: boolean) => {
    if (!text) return;
    window.orbis.find.start(text, { findNext: true, forward, matchCase });
  };

  return (
    <div className="findbar" role="search">
      <input
        ref={inputRef}
        value={text}
        placeholder="Find in page"
        aria-label="Find in page"
        onChange={(e) => {
          setText(e.target.value);
          start(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') next(!e.shiftKey);
          if (e.key === 'Escape') onClose();
        }}
      />
      <span className="find-count">{text ? `${result.activeMatchOrdinal}/${result.matches}` : ''}</span>
      <button
        className={`chip ${matchCase ? 'on' : ''}`}
        title="Match case"
        onClick={() => {
          setMatchCase(!matchCase);
          start(text, !matchCase);
        }}
      >
        Aa
      </button>
      <button className="icon-btn" aria-label="Previous match" onClick={() => next(false)}>
        <ChevronUp size={16} />
      </button>
      <button className="icon-btn" aria-label="Next match" onClick={() => next(true)}>
        <ChevronDown size={16} />
      </button>
      <button className="icon-btn" aria-label="Close find" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
