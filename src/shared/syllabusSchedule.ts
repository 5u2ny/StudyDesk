export interface SyllabusScheduleRow {
  weekLabel: string
  dateLabel: string
  topic: string
  readings: string[]
  prepItems: string[]
  milestones: string[]
  theme?: string
  startAt?: number
  endAt?: number
}

export interface SyllabusGradingComponent {
  title: string
  weight: string
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const MONTH_PATTERN = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'

function normalizeSyllabusText(text: string): string {
  return text
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(\d)\s+(\d)\b/g, '$1$2')
    .replace(/\b(20)\s+(\d{2})\b/g, '$1$2')
    .replace(/\b([A-Za-z]+)\s+-\s+([A-Za-z]+)\b/g, '$1-$2')
    .replace(/\b([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{1,2})\b/g, '$1 $2, $3')
    .replace(/\b([A-Za-z]+)\s+(\d{1,2})\s*,\s*([A-Za-z]+)\s+(\d{1,2})\b/g, '$1 $2, $3 $4')
    .trim()
}

function extractTermYear(text: string, fallbackYear: number): number {
  const m = text.match(/\b(?:spring|fall|summer|winter)\s+(20\d{2})\b/i)
  return m ? Number(m[1]) : fallbackYear
}

function parseMonthDay(label: string, fallbackYear: number): number | undefined {
  const m = label.match(new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})\\b`, 'i'))
  if (!m) return undefined
  const month = MONTHS[m[1].toLowerCase().replace('.', '')]
  if (month === undefined) return undefined
  return new Date(fallbackYear, month, Number(m[2]), 9, 0, 0, 0).getTime()
}

function parseDateRange(label: string, fallbackYear: number): { startAt?: number; endAt?: number } {
  const startAt = parseMonthDay(label, fallbackYear)
  const first = label.match(new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})`, 'i'))
  if (!first) return { startAt }

  const explicitSecond = label.match(new RegExp(`,\\s*(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})\\b`, 'i'))
  if (explicitSecond) return { startAt, endAt: parseMonthDay(`${explicitSecond[1]} ${explicitSecond[2]}`, fallbackYear) }

  const dayMatches = [...label.matchAll(/\b(\d{1,2})\b/g)].map(m => Number(m[1])).filter(n => n > 0 && n <= 31)
  const lastDay = dayMatches.at(-1)
  const month = MONTHS[first[1].toLowerCase().replace('.', '')]
  const endAt = lastDay && lastDay !== Number(first[2])
    ? new Date(fallbackYear, month, lastDay, 10, 50, 0, 0).getTime()
    : startAt
  return { startAt, endAt }
}

function cleanPart(value: string): string {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/^[-:*•\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values
    .map(cleanPart)
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function extractReadingsFromRow(body: string): string[] {
  const readings: string[] = []
  const chapterMatch = body.match(/\bChapter\s+\d+(?:\s*,\s*Chapter\s+\d+|\s*-\s*\d+|\s*,\s*\d+)*/i)
  if (chapterMatch) readings.push(chapterMatch[0])
  for (const readMatch of body.matchAll(/\bRead(?:ing)?s?\s*:\s*([^*]+?)(?=\s+\*|\s+Assignment|\s+Team|\s+Final|$)/gi)) {
    readings.push(readMatch[1])
  }
  return unique(readings)
}

function extractPrepFromRow(body: string): string[] {
  const prep: string[] = []
  for (const m of body.matchAll(/\*([^*]+?)(?=\s+\*|\s+Assignment|\s+Team|\s+Final|$)/g)) {
    prep.push(m[1])
  }
  if (/\bMySQL\s+installed\b/i.test(body)) prep.push('MySQL installed')
  if (/\bTableau\s+installed(?:\s+and\s+connected\s+to\s+MySQL)?\b/i.test(body)) {
    prep.push('Tableau installed and connected to MySQL')
  }
  return unique(prep)
}

function extractMilestonesFromRow(body: string): string[] {
  const patterns = [
    /\bAssignment\s+\d+\s*-\s*[^*]+?\s+Due\b/gi,
    /\bAssignment\s+\d+\s*[^*]+?\s+Due\b/gi,
    /\bTeam\s+presentation\s+\d+\s*-\s*[^*]+?(?=\s+Theme|\s+Week|$)/gi,
    /\bFinal\s+Exam\b/gi,
    /\bFinal\s+Project\s+Report\s+Due\b/gi,
  ]
  return unique(patterns.flatMap(pattern => [...body.matchAll(pattern)].map(m => m[0])))
}

function stripRowArtifacts(body: string, readings: string[], prepItems: string[], milestones: string[]): string {
  let topic = body
  for (const value of [...readings, ...prepItems.map(p => `*${p}`), ...prepItems, ...milestones]) {
    if (!value) continue
    topic = topic.replace(value, ' ')
  }
  topic = topic
    .replace(/\bChapter\s+\d+(?:\s*,\s*Chapter\s+\d+|\s*-\s*\d+|\s*,\s*\d+)*/ig, ' ')
    .replace(/\*[^*]+/g, ' ')
    .replace(/\s+Due\b/ig, ' ')
  return cleanPart(topic) || 'Class session'
}

function scheduleRegion(text: string): string {
  const normalized = normalizeSyllabusText(text)
  const start = normalized.search(/\bDate\s+Topic\/Activities\s+Readings\s+Notes\b/i)
  const end = normalized.search(/\bCOURSE\s+POLICIES\b/i)
  if (start >= 0) return normalized.slice(start, end > start ? end : undefined)

  const weekStart = normalized.search(/\bWeek\s+\d+\s*:/i)
  return weekStart >= 0 ? normalized.slice(weekStart, end > weekStart ? end : undefined) : normalized
}

export function extractSyllabusScheduleRows(text: string, fallbackYear = new Date().getFullYear()): SyllabusScheduleRow[] {
  const region = scheduleRegion(text)
  const year = extractTermYear(text, fallbackYear)
  const rows: SyllabusScheduleRow[] = []
  let theme: string | undefined
  const rowPattern = new RegExp(
    `(Theme\\s+\\d+\\s*:\\s*.*?)(?=\\s+Week\\s+\\d+\\s*:)|` +
    `(Week\\s+\\d+\\s*:?\\s+${MONTH_PATTERN}\\.?\\s+\\d{1,2}(?:\\s*,\\s*(?:${MONTH_PATTERN}\\.?\\s+)?\\d{1,2})?\\s+.*?)(?=\\s+Theme\\s+\\d+\\s*:|\\s+Week\\s+\\d+\\s*:|\\s+May\\s+\\d+\\s*\\(|$)`,
    'gi'
  )

  for (const match of region.matchAll(rowPattern)) {
    const themeLine = match[1]
    if (themeLine) {
      theme = cleanPart(themeLine)
      continue
    }

    const raw = match[2]
    if (!raw) continue
    const parsed = raw.match(new RegExp(`Week\\s+(\\d+)\\s*:?\\s+(${MONTH_PATTERN}\\.?\\s+\\d{1,2}(?:\\s*,\\s*(?:${MONTH_PATTERN}\\.?\\s+)?\\d{1,2})?)\\s+([\\s\\S]+)`, 'i'))
    if (!parsed) continue

    const weekLabel = `Week ${Number(parsed[1])}`
    const dateLabel = cleanPart(parsed[2])
    const body = cleanPart(parsed[3])
    const readings = extractReadingsFromRow(body)
    const prepItems = extractPrepFromRow(body)
    const milestones = extractMilestonesFromRow(body)
    const topic = stripRowArtifacts(body, readings, prepItems, milestones)
    const { startAt, endAt } = parseDateRange(dateLabel, year)
    rows.push({ weekLabel, dateLabel, topic, readings, prepItems, milestones, theme, startAt, endAt })
  }

  for (const m of region.matchAll(/\b(May\s+7\s*\(\s*Thursday\s*\)\s+Final\s+Exam|May\s+10\s*\(\s*Sunday\s*\)\s+Final\s+Project\s+Report\s+Due)\b/gi)) {
    const raw = cleanPart(m[1])
    const dateLabel = raw.match(/\bMay\s+\d+/i)?.[0] ?? 'May'
    const isExam = /exam/i.test(raw)
    rows.push({
      weekLabel: isExam ? 'Final Exam' : 'Final Project',
      dateLabel,
      topic: isExam ? 'Final Exam' : 'Final Project Report',
      readings: [],
      prepItems: [],
      milestones: [isExam ? 'Final Exam' : 'Final Project Report Due'],
      startAt: parseMonthDay(dateLabel, year),
      endAt: parseMonthDay(dateLabel, year),
    })
  }

  return rows.sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0))
}

export function extractSyllabusGradingComponents(text: string): SyllabusGradingComponent[] {
  const normalized = normalizeSyllabusText(text)
  const start = normalized.search(/\bCOURSE\s+GRADING\b/i)
  const end = normalized.search(/\bGRADING\s+THRESHOLD\b/i)
  const section = start >= 0 ? normalized.slice(start, end > start ? end : undefined) : normalized
  const labels = [
    'Class Participation',
    'Homework',
    'In-class Quizzes',
    'Final Exam',
    'Team Presentations',
    'Final Project Report',
  ]

  return labels.flatMap(title => {
    const pattern = new RegExp(`${title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*(?:\\([^)]*\\)\\s*)?(\\d{1,2})\\s*%`, 'i')
    const m = section.match(pattern)
    return m ? [{ title, weight: `${Number(m[1])}%` }] : []
  })
}
