import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { SOS_PREMIER_PICK_STATS } from '../data/sosPremierPickStats.generated'
import { VALID_CARDS } from '../validCards'
import type { ProductSetId } from '../types'

const MAX_SUGGESTIONS = 12

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function buildCatalog(productSet: ProductSetId): string[] {
  if (productSet === 'sos') {
    const unique = new Set<string>()
    for (const row of Object.values(SOS_PREMIER_PICK_STATS)) {
      unique.add(row.displayName)
    }
    return [...unique].sort((a, b) => a.localeCompare(b))
  }
  return [...VALID_CARDS].sort((a, b) => a.localeCompare(b))
}

function filterCatalog(catalog: string[], query: string): string[] {
  const q = norm(query)
  if (!q) {
    return []
  }
  return catalog.filter((name) => name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS)
}

function resolvePastedLine(line: string, catalog: string[]): string | null {
  const n = norm(line)
  if (!n) {
    return null
  }
  const exact = catalog.find((c) => norm(c) === n)
  return exact ?? null
}

type Props = {
  /** Canonical card names in pack order */
  cards: string[]
  onCardsChange: (next: string[]) => void
  productSet: ProductSetId
}

export function AvailableCardsChips({ cards, onCardsChange, productSet }: Props) {
  const catalog = useMemo(() => buildCatalog(productSet), [productSet])
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => filterCatalog(catalog, draft), [catalog, draft])

  useEffect(() => {
    setHighlight((index) =>
      suggestions.length === 0 ? 0 : Math.min(index, suggestions.length - 1)
    )
  }, [suggestions])

  const used = useMemo(() => new Set(cards.map(norm)), [cards])

  const addCanonical = useCallback(
    (displayName: string) => {
      const canonical = catalog.find((c) => norm(c) === norm(displayName))
      if (!canonical) {
        return
      }
      if (used.has(norm(canonical))) {
        setDraft('')
        setOpen(false)
        return
      }
      onCardsChange([...cards, canonical])
      setDraft('')
      setOpen(false)
      setHighlight(0)
    },
    [catalog, cards, onCardsChange, used]
  )

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function removeAt(index: number) {
    onCardsChange(cards.filter((_, i) => i !== index))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(suggestions.length - 1, h + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const pick = suggestions[highlight]
      if (pick) {
        addCanonical(pick)
        return
      }
      const exact = catalog.find((c) => norm(c) === norm(draft))
      if (exact) {
        addCanonical(exact)
      }
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Backspace' && draft === '' && cards.length > 0) {
      removeAt(cards.length - 1)
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text/plain')
    if (!text.includes('\n') && !text.includes('\r')) {
      return
    }
    event.preventDefault()
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const next = [...cards]
    const seen = new Set(cards.map(norm))
    for (const line of lines) {
      const resolved = resolvePastedLine(line, catalog)
      if (resolved && !seen.has(norm(resolved))) {
        next.push(resolved)
        seen.add(norm(resolved))
      }
    }
    if (next.length !== cards.length) {
      onCardsChange(next)
    }
    setDraft('')
    setOpen(false)
  }

  return (
    <div className="available-cards-chips" ref={wrapRef}>
      <div className="chip-row" role="list">
        {cards.map((card, index) => (
          <span key={`${card}-${index}`} className="chip" role="listitem">
            <span className="chip-label">{card}</span>
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove ${card}`}
              onClick={() => removeAt(index)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="chip-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="chip-search-input"
          value={draft}
          placeholder="Type a card name…"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="card-suggestions"
          role="combobox"
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        {open && suggestions.length > 0 ? (
          <ul id="card-suggestions" className="chip-suggestions" role="listbox">
            {suggestions.map((name, index) => (
              <li
                key={name}
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? 'chip-suggestion is-active' : 'chip-suggestion'}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addCanonical(name)}
              >
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="chip-hint">Enter or click to add. Paste multiple lines to add several cards.</p>
    </div>
  )
}
