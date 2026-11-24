import { webTitle } from '../webTitle'

it('names pages, detail pages by kind, and anything else Iskotify', () => {
  expect(webTitle('/')).toBe('Today · Iskotify')
  expect(webTitle('/settings/')).toBe('Settings · Iskotify')
  expect(webTitle('/practice/exam')).toBe('Mock exams · Iskotify')
  expect(webTitle('/practice/exam/upcat')).toBe('Mock exam · Iskotify')
  expect(webTitle('/schools/course/nle')).toBe('Top universities by course · Iskotify')
  expect(webTitle('/nope')).toBe('Iskotify')
})
