import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { AvailableCardsChips } from './components/AvailableCardsChips'
import { askDraftAssistant, getRecommendation } from './mockApi'
import { VALID_CARDS } from './validCards'
import { isKnownSosCard } from './sosLookup'
import type {
  ChatMessage,
  DraftContext,
  ProductSetId,
  Rank,
  RecommendationResponse,
} from './types'

function normalizeCardName(value: string): string {
  return value.trim().toLowerCase()
}

const VALID_CARD_SET = new Set(VALID_CARDS.map(normalizeCardName))

function cleanCardCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[\s"'`]+|[\s"'`?.!,:;]+$/g, '')
    .replace(/\s+/g, ' ')
}

function extractComparedCards(questionText: string): string[] {
  const question = questionText.trim()
  const patterns = [
    /\bis\s+(.+?)\s+better than\s+(.+?)(?:\s+here)?\??$/i,
    /\bcompare\s+(.+?)\s+(?:vs|versus)\s+(.+?)\??$/i,
    /\b(.+?)\s+(?:vs|versus|or)\s+(.+?)\??$/i,
  ]

  for (const pattern of patterns) {
    const match = question.match(pattern)
    if (!match) {
      continue
    }
    return [cleanCardCandidate(match[1]), cleanCardCandidate(match[2])].filter(Boolean)
  }

  return []
}

function findUnknownCardsForSet(cards: string[], productSet: ProductSetId): string[] {
  if (productSet === 'sos') {
    return cards.filter((card) => !isKnownSosCard(card))
  }
  return cards.filter((card) => !VALID_CARD_SET.has(normalizeCardName(card)))
}

function parseCardList(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((card) => card.trim())
    .filter(Boolean)
}

function App() {
  const [productSet, setProductSet] = useState<ProductSetId>('tmt')
  const [packNumber, setPackNumber] = useState(1)
  const [pickNumber, setPickNumber] = useState(1)
  const [rank, setRank] = useState<Rank>('gold')
  const [availableCardsList, setAvailableCardsList] = useState<string[]>([
    'The Last Ronin',
    "Shredder's Technique",
    'Mona Lisa, Science Geek',
  ])
  const [poolCardsInput, setPoolCardsInput] = useState('Zoo Escapees\nAnchovy & Banana Pizza')
  const [question, setQuestion] = useState(
    "Is The Last Ronin better than Shredder's Technique here?"
  )

  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Set draft context and ask a question to compare picks.',
    },
  ])
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  const parsedPoolCards = useMemo(
    () => parseCardList(poolCardsInput),
    [poolCardsInput]
  )

  const draftContext: DraftContext = {
    productSet,
    packNumber,
    pickNumber,
    rank,
    availableCards: availableCardsList,
    poolCards: parsedPoolCards,
  }

  function handleProductSetChange(next: ProductSetId) {
    setProductSet(next)
    setRecommendation(null)
    setContextError(null)
    if (next === 'sos') {
      setAvailableCardsList(['Together as One', 'Practiced Offense', 'Antiquities on the Loose'])
      setPoolCardsInput('')
      setQuestion('Is Together as One better than Practiced Offense?')
      setChatMessages([
        {
          id: 'welcome-sos',
          role: 'assistant',
          text: 'SOS Premier Draft: compare cards using full public pick logs — list a short list or ask "A vs B".',
        },
      ])
    } else {
      setAvailableCardsList([
        'The Last Ronin',
        "Shredder's Technique",
        'Mona Lisa, Science Geek',
      ])
      setPoolCardsInput('Zoo Escapees\nAnchovy & Banana Pizza')
      setQuestion("Is The Last Ronin better than Shredder's Technique here?")
      setChatMessages([
        {
          id: 'welcome-tmt',
          role: 'assistant',
          text: 'Set draft context and ask a question to compare picks.',
        },
      ])
    }
  }

  async function handleRecommend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setContextError(null)
    if (!draftContext.availableCards.length) {
      setContextError('Add at least one card to the available cards list.')
      return
    }
    const unknownAvailableCards = findUnknownCardsForSet(draftContext.availableCards, productSet)
    if (unknownAvailableCards.length > 0) {
      setContextError(
        unknownAvailableCards.length === 1
          ? `Card "${unknownAvailableCards[0]}" does not exist in this set.`
          : `Cards ${unknownAvailableCards.map((card) => `"${card}"`).join(', ')} do not exist in this set.`
      )
      setRecommendation(null)
      return
    }
    setIsLoadingRecommendation(true)
    try {
      const result = await getRecommendation(draftContext)
      setRecommendation(result)
    } finally {
      setIsLoadingRecommendation(false)
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: question.trim(),
    }
    setChatMessages((previous) => [...previous, userMessage])
    setQuestion('')
    setIsLoadingChat(true)

    try {
      const unknownAvailableCards = findUnknownCardsForSet(draftContext.availableCards, productSet)
      if (unknownAvailableCards.length > 0) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text:
            unknownAvailableCards.length === 1
              ? `Card "${unknownAvailableCards[0]}" does not exist in this set. Update the available cards list and try again.`
              : `Cards ${unknownAvailableCards.map((card) => `"${card}"`).join(', ')} do not exist in this set. Update the available cards list and try again.`,
        }
        setChatMessages((previous) => [...previous, assistantMessage])
        return
      }

      const comparedCards = extractComparedCards(userMessage.text)
      if (comparedCards.length > 0) {
        const unknownComparedCards = findUnknownCardsForSet(comparedCards, productSet)
        if (unknownComparedCards.length > 0) {
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            text:
              unknownComparedCards.length === 1
                ? `Card "${unknownComparedCards[0]}" does not exist in this set.`
                : `Cards ${unknownComparedCards.map((card) => `"${card}"`).join(', ')} do not exist in this set.`,
          }
          setChatMessages((previous) => [...previous, assistantMessage])
          return
        }

        const availableCards = new Set(draftContext.availableCards.map(normalizeCardName))
        const missingCards = comparedCards.filter(
          (card) => !availableCards.has(normalizeCardName(card))
        )

        if (missingCards.length > 0) {
          const missingLabel =
            missingCards.length === 1
              ? `Card "${missingCards[0]}" doesn't exist in the selected pack.`
              : `Cards ${missingCards.map((card) => `"${card}"`).join(', ')} don't exist in the selected pack.`
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: `${missingLabel}\n\nAvailable cards: ${draftContext.availableCards.join(', ')}`,
          }
          setChatMessages((previous) => [...previous, assistantMessage])
          return
        }
      }

      const response = await askDraftAssistant(userMessage.text, draftContext, recommendation)
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `${response.answer}\n\nSources: ${response.citations.join(', ')}`,
      }
      setChatMessages((previous) => [...previous, assistantMessage])
    } finally {
      setIsLoadingChat(false)
    }
  }

  const isSosPremier = productSet === 'sos'

  return (
    <main className="app-shell">
      <header className="app-header">
        <label className="set-picker">
          <span className="set-picker-label">Data set</span>
          <select
            value={productSet}
            onChange={(event) => handleProductSetChange(event.target.value as ProductSetId)}
          >
            <option value="tmt">Teenage Mutant Ninja Turtles (TMT)</option>
            <option value="sos">SOS Premier Draft</option>
          </select>
        </label>
        {isSosPremier ? (
          <p className="beta-disclaimer" role="note">
            Full SOS public Premier Draft pick data — ranking by average pick position and volume; optional beta GIH WR overlay when available.
          </p>
        ) : null}
        <h1>Draft Pick Assistant</h1>
        <p className="tagline">
          {isSosPremier
            ? 'GIH WR quick stats from SOS aggregates — compare cards or rank your short list.'
            : 'TMT Premier Draft explorer — mock scoring until Supabase-backed stats ship.'}
        </p>
      </header>

      <section className="layout">
        <form className="panel context-panel" onSubmit={handleRecommend}>
          <h2>{isSosPremier ? 'Premier Draft short list' : 'Draft Context'}</h2>
          {isSosPremier ? (
            <p className="beta-field-note">
              Pack, pick, and rank are not filtered yet — ranking uses aggregate pick position across all logged picks.
            </p>
          ) : null}
          <label>
            Pack Number
            <input
              type="number"
              min={1}
              max={3}
              value={packNumber}
              disabled={isSosPremier}
              onChange={(event) => setPackNumber(Number(event.target.value))}
            />
          </label>
          <label>
            Pick Number
            <input
              type="number"
              min={1}
              max={15}
              value={pickNumber}
              disabled={isSosPremier}
              onChange={(event) => setPickNumber(Number(event.target.value))}
            />
          </label>
          <label>
            Rank
            <select
              value={rank}
              disabled={isSosPremier}
              onChange={(event) => setRank(event.target.value as Rank)}
            >
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
              <option value="platinum">Platinum</option>
              <option value="diamond">Diamond</option>
              <option value="mythic">Mythic</option>
            </select>
          </label>
          <div className="available-cards-field">
            <div className="available-cards-header">
              <span className="available-cards-label">Available cards</span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setAvailableCardsList([])
                  setRecommendation(null)
                  setContextError(null)
                }}
              >
                Clear all
              </button>
            </div>
            <AvailableCardsChips
              cards={availableCardsList}
              onCardsChange={setAvailableCardsList}
              productSet={productSet}
            />
          </div>
          <label>
            Pool Cards (one per line){' '}
            {isSosPremier ? <span className="optional-hint">(optional)</span> : null}
            <textarea
              rows={4}
              value={poolCardsInput}
              onChange={(event) => setPoolCardsInput(event.target.value)}
              placeholder={
                isSosPremier ? 'Optional — pool not used for ranking yet' : 'Zoo Escapees\nAnchovy & Banana Pizza'
              }
            />
          </label>
          <button type="submit" disabled={isLoadingRecommendation}>
            {isLoadingRecommendation
              ? 'Evaluating...'
              : isSosPremier
                ? 'Rank by pick data'
                : 'Get Recommendation'}
          </button>
          {contextError ? <p className="context-error">{contextError}</p> : null}
        </form>

        <div className="right-column">
          <section className="panel recommendation-panel">
            <h2>Recommendation</h2>
            {recommendation ? (
              <div className="recommendation-content">
                <p>
                  <strong>Top Pick:</strong> {recommendation.topPick}
                </p>
                <p>
                  <strong>Confidence:</strong> {(recommendation.confidence * 100).toFixed(0)}%
                </p>
                <p>
                  <strong>{isSosPremier ? 'Score (top pick):' : 'Win Rate:'}</strong>{' '}
                  {(recommendation.evidence.winRateTopPick * 100).toFixed(1)}%
                </p>
                <p>
                  <strong>{isSosPremier ? 'Pick sample (volume):' : 'Sample Size:'}</strong>{' '}
                  {recommendation.evidence.sampleSize.toLocaleString()}
                </p>
                <div>
                  <strong>Alternatives:</strong>
                  <ul>
                    {recommendation.alternatives.map((alt) => (
                      <li key={alt.card}>
                        {alt.card} ({(alt.score * 100).toFixed(1)}%{isSosPremier ? ' score' : ''})
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Why:</strong>
                  <ul>
                    {recommendation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p>Run recommendation to see top pick and evidence.</p>
            )}
          </section>

          <section className="panel chat-panel">
            <h2>Ask the Assistant</h2>
            <div className="chat-log">
              {chatMessages.map((message) => (
                <article key={message.id} className={`chat-message ${message.role}`}>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
            <form className="chat-input" onSubmit={handleAsk}>
              <input
                type="text"
                placeholder={
                  isSosPremier
                    ? 'e.g. Is Together as One better than Practiced Offense?'
                    : 'Ask about card comparisons, pivots, or confidence...'
                }
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button type="submit" disabled={isLoadingChat}>
                {isLoadingChat ? 'Thinking...' : 'Send'}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
