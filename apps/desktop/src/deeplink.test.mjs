import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  deepLinkUrlsFromArgv,
  parseApprovalDeepLink,
  reviewUrlForDesktop,
} from './deeplink.mjs'

describe('desktop deeplink', () => {
  it('parses clawql:// and https app links', () => {
    assert.equal(parseApprovalDeepLink('clawql://review/rev_change'), 'rev_change')
    assert.equal(
      parseApprovalDeepLink('https://cloud.clawql.com/app/review/rev_skill'),
      'rev_skill',
    )
    assert.equal(
      parseApprovalDeepLink('https://acme.cloud.clawql.com/app/review/rev_decision?x=1'),
      'rev_decision',
    )
    assert.equal(
      parseApprovalDeepLink('https://cloud.clawql.com/home?requestId=rev_x'),
      'rev_x',
    )
  })

  it('builds desktop review focus URL', () => {
    assert.equal(
      reviewUrlForDesktop('rev_change'),
      'http://127.0.0.1:3040/review?requestId=rev_change',
    )
  })

  it('filters argv for protocol URLs', () => {
    const urls = deepLinkUrlsFromArgv([
      'electron',
      '.',
      'clawql://review/rev_a',
      '--dev',
      'https://cloud.clawql.com/app/review/rev_b',
    ])
    assert.deepEqual(urls, [
      'clawql://review/rev_a',
      'https://cloud.clawql.com/app/review/rev_b',
    ])
  })
})
