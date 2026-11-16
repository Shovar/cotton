import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { apiGet } from "../../api/client";
import { useStore } from "../../state/store";
import { applySuggestion, complete, type Suggestion } from "./commandCompletion";

const HISTORY_LIMIT = 20;

interface CommandPromptProps {
  value: string;
  onChange: (value: string) => void;
  history: string[];
  onHistoryStep: (direction: "up" | "down") => void;
}

export function CommandPrompt({ value, onChange, history, onHistoryStep }: CommandPromptProps) {
  const graph = useStore((state) => state.graph);
  const { data: commands = [] } = useQuery({
    queryKey: ["commands"],
    queryFn: () => apiGet<string[]>("/api/commands"),
    staleTime: Infinity,
    retry: false,
  });
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyActive, setHistoryActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = complete(value, { commands, graph });
  const selected = active !== null && active < suggestions.length ? active : null;
  const showSuggestions =
    focused && !dismissed && !historyOpen && value.trim() !== "" && suggestions.length > 0;

  const matches = history
    .filter((command) => command.toLowerCase().includes(historyQuery.trim().toLowerCase()))
    .slice()
    .reverse()
    .slice(0, HISTORY_LIMIT);
  const selectedHistory = matches.length > 0 ? Math.min(historyActive, matches.length - 1) : null;

  const update = (next: string) => {
    onChange(next);
    setActive(null);
    setDismissed(false);
  };

  const accept = (suggestion: Suggestion) => {
    update(applySuggestion(value, suggestion.value));
    inputRef.current?.focus();
  };

  const move = (delta: number) => {
    setActive((current) => {
      const start = current === null ? (delta > 0 ? -1 : suggestions.length) : current;
      return (start + delta + suggestions.length) % suggestions.length;
    });
  };

  const closeHistory = () => {
    setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const openHistory = () => {
    setHistoryOpen(true);
    setHistoryQuery("");
    setHistoryActive(0);
    setActive(null);
    setDismissed(true);
  };

  const chooseHistory = (command: string) => {
    update(command);
    closeHistory();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      openHistory();
      return;
    }
    if (event.key === "Escape") {
      setDismissed(true);
      setActive(null);
      return;
    }
    if (!showSuggestions) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        onHistoryStep(event.key === "ArrowUp" ? "up" : "down");
      }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" && selected !== null) {
      event.preventDefault();
      accept(suggestions[selected]);
    }
  };

  const onHistoryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeHistory();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHistoryActive((current) =>
        matches.length === 0 ? 0 : Math.min(current + 1, matches.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHistoryActive((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (selectedHistory !== null) {
        chooseHistory(matches[selectedHistory]);
      } else {
        closeHistory();
      }
    }
  };

  return (
    <div className="command-prompt">
      <label className="terminal-line">
        <span className="terminal-marker" aria-hidden="true">
          $
        </span>
        <input
          ref={inputRef}
          className="terminal-input"
          type="text"
          role="combobox"
          aria-label="Command"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? "command-suggestions" : undefined}
          aria-activedescendant={selected !== null ? `command-suggestion-${selected}` : undefined}
          placeholder="ros2 run demo_nodes_cpp talker"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => update(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => setFocused(false)}
        />
      </label>
      {showSuggestions && (
        <ul
          id="command-suggestions"
          className="command-list"
          role="listbox"
          aria-label="Suggestions"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.kind}:${suggestion.value}`}
              id={`command-suggestion-${index}`}
              role="option"
              aria-selected={selected === index}
              className="command-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(suggestion)}
            >
              <span className="command-option-value">{suggestion.value}</span>
              <span className="command-option-kind">{suggestion.kind}</span>
            </li>
          ))}
        </ul>
      )}
      {historyOpen && (
        <div className="command-history" role="dialog" aria-label="History search">
          <div className="command-history-search">
            <Search aria-hidden="true" />
            <input
              autoFocus
              type="search"
              aria-label="Search history"
              aria-controls="command-history-matches"
              aria-activedescendant={
                selectedHistory !== null ? `command-history-${selectedHistory}` : undefined
              }
              placeholder="Reverse search"
              value={historyQuery}
              onChange={(event) => {
                setHistoryQuery(event.target.value);
                setHistoryActive(0);
              }}
              onKeyDown={onHistoryKeyDown}
            />
          </div>
          {matches.length === 0 ? (
            <p className="command-hint">No matching commands</p>
          ) : (
            <ul
              id="command-history-matches"
              className="command-list"
              role="listbox"
              aria-label="History matches"
            >
              {matches.map((command, index) => (
                <li
                  key={`${index}:${command}`}
                  id={`command-history-${index}`}
                  role="option"
                  aria-selected={selectedHistory === index}
                  className="command-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseHistory(command)}
                >
                  <span className="command-option-value">{command}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="command-hint">Enter to use · Esc to close</p>
        </div>
      )}
    </div>
  );
}
