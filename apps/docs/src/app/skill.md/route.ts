import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-static'

export function GET() {
  const filePath = path.join(process.cwd(), 'public/skill.md')
  const body = fs.readFileSync(filePath, 'utf8')
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control':
        'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
