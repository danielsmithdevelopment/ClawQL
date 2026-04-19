/**
 * Build step: Agent Skills Discovery index (RFC v0.2.0) + publish SKILL.md under public/.
 *
 * Run from website/: node scripts/generate-agent-skills-index.mjs
 *
 * @see https://github.com/cloudflare/agent-skills-discovery-rfc
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const skillsRoot = path.join(repoRoot, '.cursor/skills')
const publicSkillsRoot = path.join(__dirname, '../public/.well-known/agent-skills')
const outFile = path.join(__dirname, '../src/generated/agent-skills-index.json')

const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

/**
 * @param {string} content
 * @returns {{ name: string | null, description: string }}
 */
function parseSkillFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { name: null, description: '' }
  }
  const end = content.indexOf('\n---', 3)
  if (end === -1) {
    return { name: null, description: '' }
  }
  const fm = content.slice(3, end)

  const nameRaw = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? null
  const name =
    nameRaw && (nameRaw.startsWith('"') || nameRaw.startsWith("'"))
      ? nameRaw.slice(1, -1)
      : nameRaw

  const description = parseDescriptionFromYamlBody(fm)

  let d = description.trim()
  if (d.length > 1024) {
    d = `${d.slice(0, 1021).replace(/\s+\S*$/, '').trim()}…`
  }
  return {
    name,
    description: d,
  }
}

/**
 * @param {string} fm — YAML frontmatter without outer ---
 */
function parseDescriptionFromYamlBody(fm) {
  const lines = fm.split(/\r?\n/)
  const descLine = lines.findIndex((l) => /^description:\s*>-\s*$/.test(l))
  if (descLine !== -1) {
    const parts = []
    for (let i = descLine + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^  /.test(line)) {
        parts.push(line.replace(/^  /, ''))
      } else if (line.trim() === '') {
        continue
      } else {
        break
      }
    }
    return parts.join(' ').trim()
  }
  const one = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''
  return one.replace(/^["']|["']$/g, '')
}

function main() {
  if (!fs.existsSync(skillsRoot)) {
    const empty = { $schema: SCHEMA, skills: [] }
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, `${JSON.stringify(empty, null, 2)}\n`, 'utf8')
    console.warn('[agent-skills] No .cursor/skills — wrote empty index.')
    return
  }

  /** @type {Array<{ name: string; type: string; description: string; url: string; digest: string }>} */
  const skills = []

  const dirs = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const dir of dirs) {
    const skillMd = path.join(skillsRoot, dir, 'SKILL.md')
    if (!fs.existsSync(skillMd)) continue

    const content = fs.readFileSync(skillMd)
    const text = content.toString('utf8')
    const parsed = parseSkillFrontmatter(text)
    const name = parsed.name || dir
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      console.warn(`[agent-skills] Skip invalid name "${name}" (${skillMd})`)
      continue
    }

    const hashHex = crypto.createHash('sha256').update(content).digest('hex')
    const digest = `sha256:${hashHex}`

    const destDir = path.join(publicSkillsRoot, name)
    fs.mkdirSync(destDir, { recursive: true })
    const destFile = path.join(destDir, 'SKILL.md')
    fs.copyFileSync(skillMd, destFile)

    const description =
      parsed.description ||
      `Agent skill published from the ClawQL repository (${name}).`

    skills.push({
      name,
      type: 'skill-md',
      description,
      url: `/.well-known/agent-skills/${name}/SKILL.md`,
      digest,
    })
  }

  skills.sort((a, b) => a.name.localeCompare(b.name))

  const index = {
    $schema: SCHEMA,
    skills,
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  console.log(`[agent-skills] Wrote ${skills.length} skill(s) to src/generated/agent-skills-index.json`)
}

main()
