#!/usr/bin/env node
// Unit tests for scholarshipNormalize.mjs helpers.
// Run: node --test scripts/__tests__/scholarshipNormalize.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripBom,
  decodeMojibake,
  resolveSentinel,
  normalizeCurrency,
  parsePercent,
  slugify,
} from '../scholarshipNormalize.mjs'

// --- stripBom ---
test('stripBom: removes BOM from start', () => {
  const withBom = '﻿hello'
  assert.equal(stripBom(withBom), 'hello')
})
test('stripBom: leaves text without BOM unchanged', () => {
  assert.equal(stripBom('hello'), 'hello')
})
test('stripBom: empty string', () => {
  assert.equal(stripBom(''), '')
})

// --- decodeMojibake ---
test('decodeMojibake: fixes â± → ₱', () => {
  assert.equal(decodeMojibake('â±8,000'), '₱8,000')
})
test('decodeMojibake: fixes em-dash sequence', () => {
  const result = decodeMojibake('â€"')
  assert.equal(result, '—')
})
test('decodeMojibake: fixes right single quote', () => {
  assert.ok(decodeMojibake("Veterans’ Dependents").includes("'") ||
    decodeMojibake('â€™').includes('’'))
})
test('decodeMojibake: passes clean text unchanged', () => {
  assert.equal(decodeMojibake('DOST-SEI Scholarship'), 'DOST-SEI Scholarship')
})

// --- resolveSentinel ---
test('resolveSentinel: empty string → null', () => {
  assert.equal(resolveSentinel(''), null)
})
test('resolveSentinel: N/A → null', () => {
  assert.equal(resolveSentinel('N/A'), null)
})
test('resolveSentinel: n/a lowercase → null', () => {
  assert.equal(resolveSentinel('n/a'), null)
})
test('resolveSentinel: TBA → null', () => {
  assert.equal(resolveSentinel('TBA'), null)
})
test('resolveSentinel: UNKNOWN → null', () => {
  assert.equal(resolveSentinel('UNKNOWN'), null)
})
test('resolveSentinel: — em dash → null', () => {
  assert.equal(resolveSentinel('—'), null)
})
test('resolveSentinel: - single dash → null', () => {
  assert.equal(resolveSentinel('-'), null)
})
test('resolveSentinel: UNCONFIRMED → null', () => {
  assert.equal(resolveSentinel('UNCONFIRMED'), null)
})
test('resolveSentinel: null input → null', () => {
  assert.equal(resolveSentinel(null), null)
})
test('resolveSentinel: valid value returned trimmed', () => {
  assert.equal(resolveSentinel('  Filipino citizen  '), 'Filipino citizen')
})

// --- normalizeCurrency ---
test('normalizeCurrency: ₱8,000/month → 8000', () => {
  assert.equal(normalizeCurrency('₱8,000/month'), 8000)
})
test('normalizeCurrency: Up to ₱40,000/academic year → 40000', () => {
  assert.equal(normalizeCurrency('Up to ₱40,000/academic year'), 40000)
})
test('normalizeCurrency: ₱10,000/year → 10000', () => {
  assert.equal(normalizeCurrency('₱10,000/year'), 10000)
})
test('normalizeCurrency: N/A → null', () => {
  assert.equal(normalizeCurrency('N/A'), null)
})
test('normalizeCurrency: Full → null', () => {
  assert.equal(normalizeCurrency('Full'), null)
})
test('normalizeCurrency: Free → null', () => {
  assert.equal(normalizeCurrency('Free'), null)
})
test('normalizeCurrency: empty string → null', () => {
  assert.equal(normalizeCurrency(''), null)
})
test('normalizeCurrency: null → null', () => {
  assert.equal(normalizeCurrency(null), null)
})
test('normalizeCurrency: mojibake peso sign â±8,000/month → 8000', () => {
  assert.equal(normalizeCurrency('â±8,000/month'), 8000)
})
test('normalizeCurrency: Up to â±40,000/academic year → 40000', () => {
  assert.equal(normalizeCurrency('Up to â±40,000/academic year'), 40000)
})
test('normalizeCurrency: extracts first amount from range', () => {
  const result = normalizeCurrency('₱80,000–₱120,000/year')
  assert.equal(result, 80000)
})
test('normalizeCurrency: ₱30,000/semester → 30000', () => {
  assert.equal(normalizeCurrency('Up to ₱30,000/semester'), 30000)
})
test('normalizeCurrency: ₱100,000/academic year → 100000', () => {
  assert.equal(normalizeCurrency('Up to ₱100,000/academic year'), 100000)
})

// --- parsePercent ---
test('parsePercent: 85% → 85', () => {
  assert.equal(parsePercent('85%'), 85)
})
test('parsePercent: 93% → 93', () => {
  assert.equal(parsePercent('93%'), 93)
})
test('parsePercent: top 5% of graduating class → null (class rank)', () => {
  assert.equal(parsePercent('top 5% of graduating class'), null)
})
test('parsePercent: GWA 2.75 → null (5-point scale)', () => {
  assert.equal(parsePercent('GWA 2.75'), null)
})
test('parsePercent: GPA 2.5 → null (5-point scale)', () => {
  assert.equal(parsePercent('GPA 2.5'), null)
})
test('parsePercent: null → null', () => {
  assert.equal(parsePercent(null), null)
})
test('parsePercent: N/A → null', () => {
  assert.equal(parsePercent('N/A'), null)
})
test('parsePercent: empty string → null', () => {
  assert.equal(parsePercent(''), null)
})
test('parsePercent: bare 83 → 83', () => {
  assert.equal(parsePercent('GWA of at least 83%'), 83)
})
test('parsePercent: class rank text with no numeric % → null', () => {
  // "top 10% of SHS graduating class" contains class reference → null
  assert.equal(parsePercent('top 10% of SHS graduating class'), null)
})
test('parsePercent: Minimum 90% → 90', () => {
  assert.equal(parsePercent('Minimum 90%'), 90)
})
test('parsePercent: 80% (Grade 12) → 80', () => {
  assert.equal(parsePercent('Minimum GWA of 80% (Grade 12) for incoming freshmen'), 80)
})

// --- slugify ---
test('slugify: DOST-SEI Merit → dost-sei-merit', () => {
  assert.equal(slugify('DOST-SEI Undergraduate Scholarship (Merit / S&T Scholarship)'), 'dost-sei-merit')
})
test('slugify: CHED Merit → ched-merit', () => {
  assert.equal(slugify('CHED Merit Scholarship Program (CMSP)'), 'ched-merit')
})
test('slugify: no duplicate slugs across all 55 programs', () => {
  const names = [
    'DOST-SEI Undergraduate Scholarship (Merit / S&T Scholarship)',
    'DOST-SEI Undergraduate Scholarship under RA 7687 (Equity/Financial Need Track)',
    'Junior Level Science Scholarship (JLSS)',
    'CHED Merit Scholarship Program (CMSP)',
    'Bagong Pilipinas Merit Scholarship Program (BPMSP)',
    'CHED Tulong Dunong Program (TDP)',
    'Tertiary Education Subsidy (TES)',
    'Free Higher Education under the Universal Access to Quality Tertiary Education Act (RA 10931)',
    'Education for Development Scholarship Program (EDSP)',
    'OFW Dependent Scholarship Program (ODSP)',
    "PVAO Educational Benefit (for Veterans' Dependents)",
    'AFP Savings and Loan Association, Inc. (AFPSLAI) Scholarship and Educational Assistance Program (SEAP)',
    'SM Foundation College Scholarship',
    'MBFI-ACCESS (Assistance for the Completion of College Education for Superior Students)',
    'U-Go Scholar Grant',
    'Megaworld Foundation Scholarship',
    'GBF STEM College Scholarship (formerly GBF-Gokongwei Group STEM Scholarship for Excellence)',
    'Aboitiz Future Leaders Scholarship',
    'Gabay Guro Scholarship Program by PLDT-Smart Foundation',
    'Tulong Aral ng Petron (TAP) College Scholarship',
    'Pagpupugay Scholarship Program',
    'Access, Curriculum, and Employability (ACE) Scholarship Program',
    'CHED Bawat Barangay Makikinabang (Barangay Presidential Scholars Program)',
    'CHED CoScho – Scholarship Program for Coconut Farmers and their Families',
    'CHED ACEF-GIAHEP (Agricultural Competitiveness Enhancement Fund – Grants-in-Aid for Higher Education Program)',
    'CHED AHEAD Grant (Allied Health Experiential Assistance for Deserving Students)',
    'BFAR Fisherfolk Children Educational Grant (FCEG)',
    'BFAR Fisheries Industry Leaders Grant (FILG)',
    'Iskolar ng LANDBANK Program',
    'GSIS Educational Subsidy Program (GESP)',
    'DAR Scholarship Program for Dependents of Agrarian Reform Beneficiaries (DSP-DARBs)',
    'PCSO Educational Assistance Program',
    'DBP INSPIRE Scholarship (Investments and Partnerships for Inclusive Revitalization through Scholarships in Education)',
    'PhilSA AD ASTRA Scholarship Program (Advanced Degrees for Accelerating Strategic Space R&D and Applications)',
    'GBF TeachSTEM College Scholarship',
    'GBF Next Gen Scholarship for Excellence',
    'GBF STEM-Agri Scholarship Program (URC-BCFG Agri Partners)',
    'SN Aboitiz Power Group BRIGHTS Scholarship (Bridging Gaps in Higher Education Through Tertiary Scholarships)',
    'Vivant Foundation STEM Scholarship',
    'Insular Foundation Gold Eagle College Scholarship Grant for STEM',
    'Mercury Drug Foundation (MDFI) Gawad Talino College Scholarship',
    'Del Monte Foundation Scholarship Program',
    'Security Bank Foundation Regalo Mo, Kinabukasan Ko (RMKK) Scholarship',
    'Vicsal Foundation College Scholarship Program',
    'APTSFI Scholarship Program (Andres P. Tamayo Sr. Foundation, Inc.)',
    'Globe Telecom CSR Scholarship Program',
    'Pilipinas Shell Foundation STEP Scholarship (Shell Technical Education Program)',
    'Coca-Cola Foundation Philippines Scholarship',
    'San Miguel Foundation Scholarship Program',
    'BDO Foundation Educational Assistance Program',
    'PHINMA Education Hawak Kamay Scholarship',
    'Panasonic Manufacturing Philippines Corporation Scholarship Program',
    'Samsung Electro-Mechanics Philippines Corporation (SEMPHIL) Scholarship Program',
    'GrabScholar College Scholarship',
    'Shell GMBK-FUEL Scholarship (Gas Mo, Bukas Ko – Fund for University Education and Leadership)',
  ]
  const slugs = names.map(slugify)
  const unique = new Set(slugs)
  if (unique.size !== slugs.length) {
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i)
    assert.fail(`Duplicate slugs found: ${dupes.join(', ')}`)
  }
  assert.equal(unique.size, slugs.length)
})
