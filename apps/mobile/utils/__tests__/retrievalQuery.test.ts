import { buildRetrievalQuery } from '../retrievalQuery'

describe('buildRetrievalQuery', () => {
  it('prepends the previous user question for a short anaphoric follow-up', () => {
    expect(buildRetrievalQuery('what about abroad?', 'best schools for nursing'))
      .toBe('best schools for nursing what about abroad?')
  })

  it('prepends for an "and ..." follow-up even when it is long', () => {
    expect(buildRetrievalQuery('and what is the application deadline for it', 'tell me about the UPCAT'))
      .toBe('tell me about the UPCAT and what is the application deadline for it')
  })

  it('prepends for a very short (<=4 word) message', () => {
    expect(buildRetrievalQuery('the deadline?', 'when is the ACET'))
      .toBe('when is the ACET the deadline?')
  })

  it('leaves a self-contained question unchanged', () => {
    expect(buildRetrievalQuery('what is the UPCAT deadline?', 'hi'))
      .toBe('what is the UPCAT deadline?')
  })

  it('handles no previous question', () => {
    expect(buildRetrievalQuery('what about abroad?', null)).toBe('what about abroad?')
  })

  it('trims both current and previous text', () => {
    expect(buildRetrievalQuery('  what about it?  ', '  scholarships in Manila  '))
      .toBe('scholarships in Manila what about it?')
  })
})
