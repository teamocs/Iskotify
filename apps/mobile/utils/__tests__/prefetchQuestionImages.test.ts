import { Image } from 'expo-image'
import { collectImageUrls, prefetchSessionImages } from '../prefetchQuestionImages'

describe('collectImageUrls', () => {
  it('extracts non-null imageUrls, deduped', () => {
    const items = [
      { imageUrl: 'https://x/a.png' },
      { imageUrl: null },
      { imageUrl: 'https://x/b.png' },
      { imageUrl: 'https://x/a.png' }, // duplicate
      {},
    ]
    expect(collectImageUrls(items)).toEqual(['https://x/a.png', 'https://x/b.png'])
  })

  it('returns [] when nothing has an image', () => {
    expect(collectImageUrls([{ imageUrl: null }, {}])).toEqual([])
  })
})

describe('prefetchSessionImages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls Image.prefetch with the deduped urls and "disk" cache policy', () => {
    prefetchSessionImages([
      { imageUrl: 'https://x/a.png' },
      { imageUrl: 'https://x/a.png' },
      { imageUrl: 'https://x/b.png' },
      { imageUrl: null },
    ])
    expect(Image.prefetch).toHaveBeenCalledWith(['https://x/a.png', 'https://x/b.png'], 'disk')
  })

  it('does nothing (no prefetch call) when there are no image urls', () => {
    prefetchSessionImages([{ imageUrl: null }, {}])
    expect(Image.prefetch).not.toHaveBeenCalled()
  })

  it('never throws even when Image.prefetch rejects (fire-and-forget)', async () => {
    (Image.prefetch as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    expect(() => prefetchSessionImages([{ imageUrl: 'https://x/a.png' }])).not.toThrow()
    // Let the rejected promise's .catch() settle so it doesn't surface as an
    // unhandled rejection in a later test.
    await new Promise(r => setTimeout(r, 0))
  })
})
