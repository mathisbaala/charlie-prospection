import { describe, it, expect } from 'vitest'
import { buildIcpParserPrompt, parseIcpResponse } from '../icp-parser'

describe('buildIcpParserPrompt', () => {
  it('includes the raw description in the prompt', () => {
    const prompt = buildIcpParserPrompt('médecins en IDF')
    expect(prompt).toContain('médecins en IDF')
  })
  it('requests JSON output', () => {
    const prompt = buildIcpParserPrompt('test')
    expect(prompt.toLowerCase()).toContain('json')
  })
})

describe('parseIcpResponse', () => {
  it('parses valid JSON from Claude response', () => {
    const json = JSON.stringify({
      roles: ['médecin généraliste'],
      sectors: ['santé'],
      locations: ['Île-de-France'],
      seniority_min_years: 2,
      patrimony_level: 'standard',
      keywords: ['cabinet', 'libéral'],
      signal_priorities: ['installation_cabinet'],
      linkedin_queries: ['médecin généraliste Île-de-France'],
    })
    const result = parseIcpResponse(json)
    expect(result.criteria.roles).toEqual(['médecin généraliste'])
    expect(result.criteria.locations).toContain('Île-de-France')
    expect(result.linkedinQueries).toHaveLength(1)
  })
  it('returns empty defaults on invalid JSON', () => {
    const result = parseIcpResponse('not json')
    expect(result.criteria.roles).toEqual([])
    expect(result.linkedinQueries).toEqual([])
  })
})
