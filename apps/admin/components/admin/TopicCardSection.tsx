'use client'

import React, { useState, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { AddCardModal } from './AddCardModal'
import { GenerateMoreModal } from './GenerateMoreModal'
import { RenameTopicDialog } from './RenameTopicDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { EditCardDialog, type EditableCard } from './cardForm'
import { deleteTopic, deleteCard } from '@/lib/admin/topicsApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'
import { RowActions } from '@/components/ui/RowActions'
import { TABLE_FRAME, THead, Table, TableRegion, Td, Th, Tr } from '@/components/ui/Table'

interface Card extends EditableCard {
  listing_slugs?: string[]
}

interface Topic {
  id: string
  name: string
  status: 'published' | 'draft'
  cardCount: number
}

interface Props {
  subjectId: string
  topic: Topic
  defaultOpen: boolean
  subjectName: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s)


export function TopicCardSection({ subjectId, topic, defaultOpen, subjectName }: Props) {
  const router = useRouter()
  const panelId = useId()
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [cards, setCards] = useState<Card[]>([])
  const [renaming, setRenaming] = useState(false)
  const [deletingTopic, setDeletingTopic] = useState(false)
  const [topicDeleteSaving, setTopicDeleteSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  // Starts true when the topic opens with the page, so the first paint says
  // "loading" rather than a misleading "no cards".
  const [loading, setLoading] = useState(defaultOpen)
  const [loadError, setLoadError] = useState('')
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [deletingCard, setDeletingCard] = useState<Card | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingCard, setAddingCard] = useState(false)
  const [generateMoreOpen, setGenerateMoreOpen] = useState(false)
  const [localCardCount, setLocalCardCount] = useState(topic.cardCount)

  const abortRef = React.useRef<AbortController | null>(null)

  async function loadCards(pageNum: number, replace = false) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(
        `/api/flashcards/subjects/${subjectId}/cards?topic_id=${topic.id}&page=${pageNum}&limit=10`,
        { signal: controller.signal }
      )
      if (!controller.signal.aborted) {
        if (res.ok) {
          const data = await res.json()
          setCards(prev => (replace ? data.cards : [...prev, ...data.cards]))
          setHasMore(data.hasMore)
          setPage(pageNum)
        } else {
          setLoadError('Failed to load cards')
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setLoadError('Failed to load cards')
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (isOpen && cards.length === 0) {
      // Loads the first page when the section opens; loadCards is also the
      // user's "Load more", so its loading flag is shared rather than derived.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCards(1)
    }
    return () => {
      abortRef.current?.abort()
    }
    // Intentionally runs only on isOpen change, not on every loadCards re-creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  async function confirmDeleteTopic() {
    if (topicDeleteSaving) return
    setTopicDeleteSaving(true)
    try {
      const result = await deleteTopic(topic.id)
      if (!result.ok) {
        notifyError(result.error)
        return
      }
      setDeletingTopic(false)
      notifySuccess('Topic deleted')
      router.refresh()
    } catch {
      notifyError('Network error')
    } finally {
      setTopicDeleteSaving(false)
    }
  }

  async function confirmDeleteCard() {
    if (!deletingCard || saving) return
    const id = deletingCard.id
    setSaving(true)
    try {
      const result = await deleteCard(id)
      if (!result.ok) {
        notifyError(result.error)
        return
      }
      setCards(prev => prev.filter(c => c.id !== id))
      setLocalCardCount(prev => Math.max(0, prev - 1))
      setDeletingCard(null)
      notifySuccess('Card deleted')
    } catch {
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const showTable = cards.length > 0 || (loading && !loadError)

  return (
    <div className={TABLE_FRAME}>
      {/* Disclosure header: the topic name opens and closes its cards */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <h2 className="min-w-0 flex-1 text-sm">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => {
              if (!isOpen && cards.length === 0) setLoading(true)
              setIsOpen(o => !o)
            }}
            className="flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left hover:text-maroon"
          >
            <Icon name="chevron-right" className={`flex-shrink-0 text-ink-subtle transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`} />
            <span className="truncate font-medium text-ink">{topic.name}</span>
            <span className="flex-shrink-0 text-xs text-ink-muted tabular-nums">{plural(localCardCount, 'card')}</span>
            {topic.status === 'draft' && <Badge tone="warning">Draft</Badge>}
          </button>
        </h2>
        <div className="flex flex-shrink-0 items-center gap-1">
          {isOpen && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setGenerateMoreOpen(true)}>
                Generate with AI
              </Button>
              <Button size="sm" icon="plus" onClick={() => setAddingCard(true)}>
                Add card
              </Button>
            </>
          )}
          <IconButton icon="pencil" label={`Rename ${topic.name}`} onClick={() => setRenaming(true)} />
          <IconButton
            icon="trash"
            label={`Delete ${topic.name}`}
            onClick={() => setDeletingTopic(true)}
            className="hover:bg-danger-soft hover:text-danger-strong"
          />
        </div>
      </div>

      {isOpen && (
        <div id={panelId} className="border-t border-subtle">
          {loadError && (
            <div className="p-3">
              <ErrorBanner
                title="Couldn’t load cards"
                message={loadError}
                action={<Button size="sm" onClick={() => loadCards(1, true)}>Try again</Button>}
              />
            </div>
          )}

          {showTable && (
            <TableRegion label={`Cards in ${topic.name}`} busy={loading}>
              <Table caption={`Cards in ${topic.name}`} className="min-w-[40rem]">
                <THead>
                  <tr>
                    <Th className="w-[35%]">Question</Th>
                    <Th className="w-[30%]">Answer</Th>
                    <Th>Explanation</Th>
                    <Th align="right" className="w-12"><span className="sr-only">Actions</span></Th>
                  </tr>
                </THead>
                <tbody>
                  {cards.map(card => (
                    <Tr key={card.id}>
                      <Td>{card.question}</Td>
                      <Td className="text-ink-muted">{card.answer}</Td>
                      <Td className="text-ink-muted">{card.explanation || <span className="text-ink-subtle">—</span>}</Td>
                      <Td align="right">
                        <RowActions
                          label={`Actions for card: ${short(card.question)}`}
                          items={[
                            { label: 'Edit', name: `Edit card: ${short(card.question)}`, icon: 'pencil', onSelect: () => setEditingCard(card) },
                            { label: 'Delete', name: `Delete card: ${short(card.question)}`, icon: 'trash', tone: 'danger', onSelect: () => setDeletingCard(card) },
                          ]}
                        />
                      </Td>
                    </Tr>
                  ))}
                  {loading && (
                    <Tr>
                      <Td colSpan={4} className="text-ink-muted">
                        <span className="inline-flex items-center gap-2" role="status">
                          <Icon name="loader" className="animate-spin" /> Loading cards…
                        </span>
                      </Td>
                    </Tr>
                  )}
                </tbody>
              </Table>
            </TableRegion>
          )}

          {!loading && !loadError && cards.length === 0 && (
            <EmptyState
              icon="list"
              title="No cards in this topic yet"
              description="Add a card by hand, or generate a batch with AI."
            />
          )}

          {!loading && hasMore && (
            <div className="border-t border-subtle px-2 py-1.5">
              <Button size="sm" variant="ghost" icon="chevron-down" onClick={() => loadCards(page + 1)}>
                Load more cards
              </Button>
            </div>
          )}
        </div>
      )}

      {renaming && (
        <RenameTopicDialog topicId={topic.id} currentName={topic.name} onClose={() => setRenaming(false)} />
      )}

      {deletingTopic && (
        <ConfirmDialog
          message={`Delete "${topic.name}"? This permanently removes ${plural(localCardCount, 'card')}.`}
          confirmLabel={topicDeleteSaving ? 'Deleting…' : 'Delete topic'}
          onConfirm={confirmDeleteTopic}
          onCancel={() => { if (!topicDeleteSaving) setDeletingTopic(false) }}
        />
      )}

      {editingCard && (
        <EditCardDialog
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={saved => {
            setCards(prev => prev.map(c => (c.id === saved.id ? { ...c, ...saved } : c)))
            setEditingCard(null)
          }}
        />
      )}

      {deletingCard && (
        <ConfirmDialog
          message={`Delete the card "${short(deletingCard.question)}"? This cannot be undone.`}
          confirmLabel={saving ? 'Deleting…' : 'Delete card'}
          onConfirm={confirmDeleteCard}
          onCancel={() => { if (!saving) setDeletingCard(null) }}
        />
      )}

      {addingCard && (
        <AddCardModal
          topicId={topic.id}
          topicStatus={topic.status}
          onClose={() => {
            setAddingCard(false)
            setCards([])
            setPage(1)
            loadCards(1, true)
          }}
        />
      )}

      <GenerateMoreModal
        open={generateMoreOpen}
        onClose={() => setGenerateMoreOpen(false)}
        topicId={topic.id}
        topicName={topic.name}
        subjectName={subjectName}
        existingQuestions={cards.map(c => c.question)}
        listingSlugs={Array.from(new Set(cards.flatMap(c => c.listing_slugs ?? [])))}
        onSuccess={() => { loadCards(1, true) }}
      />
    </div>
  )
}
