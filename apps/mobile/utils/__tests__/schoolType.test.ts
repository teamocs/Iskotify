import { normalizeSchoolType } from '../schoolType'

// Real free-text `type` values pulled from supabase/seed/tertiary_schools_seed.sql.
describe('normalizeSchoolType', () => {
  it('buckets anything mentioning SUC as SUC', () => {
    expect(normalizeSchoolType('State College (SUC)')).toBe('SUC')
    expect(normalizeSchoolType('State University Campus (SUC — part of MSU System)')).toBe('SUC')
    expect(normalizeSchoolType('State University (SUC)')).toBe('SUC')
    expect(normalizeSchoolType('Public SUC')).toBe('SUC')
  })

  it('buckets anything starting with "State University" as SUC even without an explicit SUC marker', () => {
    expect(normalizeSchoolType('State University')).toBe('SUC')
    expect(normalizeSchoolType('State University/College')).toBe('SUC')
    expect(normalizeSchoolType('State University — Satellite Campus')).toBe('SUC')
  })

  it('buckets anything mentioning LUC as LUC', () => {
    expect(normalizeSchoolType('LUC')).toBe('LUC')
    expect(normalizeSchoolType('Local University College (LUC)')).toBe('LUC')
  })

  it('buckets bare "State College" (no SUC marker) as State College', () => {
    expect(normalizeSchoolType('State College')).toBe('State College')
  })

  it('buckets anything mentioning Private as Private', () => {
    expect(normalizeSchoolType('Private')).toBe('Private')
    expect(normalizeSchoolType('Private HEI (Jesuit)')).toBe('Private')
    expect(normalizeSchoolType('Private (Stock Corporation - PHINMA)')).toBe('Private')
    expect(normalizeSchoolType('Private — Non-Sectarian University')).toBe('Private')
  })

  it('buckets bare "State" (exact match, trimmed/case-insensitive) as SUC', () => {
    expect(normalizeSchoolType('State')).toBe('SUC')
    expect(normalizeSchoolType('state')).toBe('SUC')
    expect(normalizeSchoolType('  State  ')).toBe('SUC')
    expect(normalizeSchoolType('STATE')).toBe('SUC')
  })

  it('buckets anything starting with "Local" as LUC', () => {
    expect(normalizeSchoolType('Local')).toBe('LUC')
    expect(normalizeSchoolType('Local University')).toBe('LUC')
    expect(normalizeSchoolType('Local Government')).toBe('LUC')
    expect(normalizeSchoolType('Local Government College')).toBe('LUC')
  })

  it('does not let "State" prefixed/compound words false-positive into SUC', () => {
    // Exact-match only for bare STATE — a word merely starting with "State"
    // (e.g. "Statewide Academy") must not be swept into SUC.
    expect(normalizeSchoolType('Statewide Academy')).toBe('Other')
    expect(normalizeSchoolType('Public / State University')).toBe('Other')
  })

  it('falls back to Other for null/undefined/empty input', () => {
    expect(normalizeSchoolType(null)).toBe('Other')
    expect(normalizeSchoolType(undefined)).toBe('Other')
    expect(normalizeSchoolType('')).toBe('Other')
    expect(normalizeSchoolType('   ')).toBe('Other')
  })

  it('is case-insensitive', () => {
    expect(normalizeSchoolType('state college (suc)')).toBe('SUC')
    expect(normalizeSchoolType('PRIVATE')).toBe('Private')
  })
})
