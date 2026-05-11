import type { AcademicDeadline, Course } from '../../../shared/schema/index';
import { extractDate } from '../assignments/assignmentParserService';

// ── Result types ────────────────────────────────────────────────────────

export interface ClassMeeting {
  days: string[];        // e.g. ['Mon', 'Wed']
  startTime: string;     // e.g. '10:00 AM'
  endTime: string;       // e.g. '11:15 AM'
  location?: string;
}

export interface ScheduleRow {
  weekOrDate: string;    // "Week 1", "Jan 15", "1/15" etc.
  topic: string;
  readings?: string;
  deliverable?: string;  // assignment/quiz due that week
  deadlineAt?: number;
}

export interface ExtractedAssignment {
  title: string;
  dueDate?: number;
  weight?: string;       // "20%", "200 points"
  description?: string;
  type: 'assignment' | 'exam' | 'quiz' | 'project' | 'presentation';
}

export interface ExtractedReading {
  title: string;
  weekOrDate?: string;
  chapter?: string;
}

export interface SetupTask {
  title: string;
  category: 'textbook' | 'software' | 'account' | 'material' | 'other';
}

export interface SyllabusParseResult {
  course: Partial<Course>;
  classMeetings: ClassMeeting[];
  scheduleRows: ScheduleRow[];
  assignments: ExtractedAssignment[];
  readings: ExtractedReading[];
  setupTasks: SetupTask[];
  deadlines: Array<Partial<AcademicDeadline> & { title: string; deadlineAt: number }>;
  notes: string[];
}

// ── Day / time helpers ──────────────────────────────────────────────────

const DAY_ABBREV: Record<string, string> = {
  m: 'Mon', mo: 'Mon', mon: 'Mon', monday: 'Mon',
  t: 'Tue', tu: 'Tue', tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  w: 'Wed', we: 'Wed', wed: 'Wed', wednesday: 'Wed',
  th: 'Thu', thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
  r: 'Thu',
  f: 'Fri', fr: 'Fri', fri: 'Fri', friday: 'Fri',
  sa: 'Sat', sat: 'Sat', saturday: 'Sat',
  su: 'Sun', sun: 'Sun', sunday: 'Sun',
};

/** Expand compact day codes: "MW" -> ['Mon','Wed'], "TTh" -> ['Tue','Thu'] */
function parseDays(raw: string): string[] {
  // Try full/abbreviated names separated by / or ,
  const splitNames = raw.split(/[\/,&]\s*|\s+and\s+|\s+/i).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (splitNames.length > 1 && splitNames.every(s => DAY_ABBREV[s])) {
    return splitNames.map(s => DAY_ABBREV[s]);
  }

  // Compact codes: MW, TTh, MWF, TR
  const days: string[] = [];
  const compact = raw.replace(/\s/g, '');
  let i = 0;
  while (i < compact.length) {
    const twoChar = compact.slice(i, i + 2).toLowerCase();
    const oneChar = compact[i].toLowerCase();
    if (twoChar === 'th') { days.push('Thu'); i += 2; }
    else if (twoChar === 'tu') { days.push('Tue'); i += 2; }
    else if (twoChar === 'sa') { days.push('Sat'); i += 2; }
    else if (twoChar === 'su') { days.push('Sun'); i += 2; }
    else if (DAY_ABBREV[oneChar]) { days.push(DAY_ABBREV[oneChar]); i += 1; }
    else { i += 1; }
  }
  return days;
}

/** Extract a time range like "10:00 AM - 11:15 AM" or "10:00-11:15am" */
function parseTimeRange(text: string): { startTime: string; endTime: string } | null {
  const m = text.match(/(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*[-–—to]+\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)/i);
  if (!m) return null;
  const endMeridiem = m[4].toUpperCase();
  const startMeridiem = m[2]?.toUpperCase() ?? endMeridiem;
  const startRaw = m[1].includes(':') ? m[1] : `${m[1]}:00`;
  const endRaw = m[3].includes(':') ? m[3] : `${m[3]}:00`;
  return { startTime: `${startRaw} ${startMeridiem}`, endTime: `${endRaw} ${endMeridiem}` };
}

// ── Deadline type inference ─────────────────────────────────────────────

function inferDeadlineType(line: string): AcademicDeadline['type'] {
  if (/\bexam|midterm|final\s+exam\b/i.test(line)) return 'exam';
  if (/\bquiz\b/i.test(line)) return 'quiz';
  if (/\bread(?:ing)?|chapter|article|case\b/i.test(line)) return 'reading';
  if (/\bproject\b/i.test(line)) return 'project';
  if (/\bpresentation|present\b/i.test(line)) return 'presentation';
  if (/\boffice hours\b/i.test(line)) return 'office_hours';
  return 'assignment';
}

function inferAssignmentType(line: string): ExtractedAssignment['type'] {
  if (/\bexam|midterm|final\s+exam\b/i.test(line)) return 'exam';
  if (/\bquiz\b/i.test(line)) return 'quiz';
  if (/\bproject\b/i.test(line)) return 'project';
  if (/\bpresentation|present\b/i.test(line)) return 'presentation';
  return 'assignment';
}

function titleFromLine(line: string): string {
  return line
    .replace(/\b(due|by|on|at)\b/ig, '')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?/ig, '')
    .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Academic deadline';
}

// ── Section detection ───────────────────────────────────────────────────

type SectionKind = 'grading' | 'schedule' | 'materials' | 'policies' | 'assignments' | 'other';

function classifySection(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/\bgrad(e|ing)|weight|assessment|evaluation|points?\b/.test(h)) return 'grading';
  if (/\bschedule|calendar|weekly|course outline|class schedule|topic\b/.test(h)) return 'schedule';
  if (/\bmaterial|textbook|required.*reading|software|resource|book\b/.test(h)) return 'materials';
  if (/\bpolic|honor|integrity|attendance|accommodat|late|absence\b/.test(h)) return 'policies';
  if (/\bassignment|deliverable|project|paper|homework\b/.test(h)) return 'assignments';
  return 'other';
}

function isHeading(line: string): boolean {
  // All caps, or short line ending with colon, or line with no lowercase
  if (line.length < 3 || line.length > 120) return false;
  if (/^#{1,4}\s/.test(line)) return true;
  if (line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
  if (/^[A-Z][^.!?]*:\s*$/.test(line)) return true;
  return false;
}

// ── Extractors ──────────────────────────────────────────────────────────

function extractCourse(lines: string[], term?: string): Partial<Course> {
  const email = lines.join('\n').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const code = lines.join('\n').match(/\b[A-Z]{2,5}\s?\d{3,4}[A-Z]?\b/)?.[0];
  const professorLine = lines.find(line => /\b(professor|instructor|faculty)\b/i.test(line));
  const officeHoursLine = lines.find(line => /\boffice hours\b/i.test(line));

  // Location: look for room/building patterns, keeping preceding name (e.g. "Miller Hall 1018")
  const locationLine = lines.find(line =>
    /\b(room|bldg|building|hall|center|rm\.?)\b/i.test(line) &&
    !/\boffice hours?\b/i.test(line) &&
    !/\boffice:\b/i.test(line)
  );
  const locationMatch = locationLine?.match(/\b(\w+\s+(?:hall|center|building|bldg)\s*\w*|\b(?:room|rm\.?)\s*[A-Z0-9 -]+)/i);
  const location = locationMatch?.[0]?.trim();

  // Course name: first substantive line that isn't the professor or office hours
  const titleLine = lines.find(line =>
    line !== professorLine && line !== officeHoursLine && line !== locationLine &&
    line.length > 4 && !/^\s*(spring|fall|summer|winter)\s+\d{4}\s*$/i.test(line)
  );

  return {
    code,
    name: titleLine?.replace(code ?? '', '').replace(/^\s*[-–:]\s*/, '').trim() || code || 'Imported course',
    professorName: professorLine?.replace(/\b(professor|instructor|faculty)\b:?\s*/i, '').replace(email ?? '', '').trim(),
    professorEmail: email,
    officeHours: officeHoursLine,
    location,
    term: term ?? lines.find(l => /\b(spring|fall|summer|winter)\s+\d{4}\b/i.test(l))?.match(/\b((?:spring|fall|summer|winter)\s+\d{4})\b/i)?.[1],
  };
}

function extractClassMeetings(lines: string[]): ClassMeeting[] {
  const meetings: ClassMeeting[] = [];
  for (const line of lines) {
    // Skip office hours lines -- they have day+time but aren't class meetings
    if (/\boffice hours\b/i.test(line)) continue;

    // Pattern: "MW 10:00 AM - 11:15 AM" or "Tuesday/Thursday 2:00-3:15pm, Room 301"
    const dayMatch = line.match(/\b((?:M|T|W|Th|F|Sa|Su|Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:rs(?:day)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)[,\/&\s]*(?:M|T|W|Th|F|Sa|Su|Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:rs(?:day)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)*)\b/i);
    const timeRange = parseTimeRange(line);
    if (!dayMatch || !timeRange) continue;

    const days = parseDays(dayMatch[1]);
    if (days.length === 0) continue;

    const locMatch = line.match(/\b(\w+\s+(?:hall|center|building)\s*\w*|(?:room|rm\.?|bldg\.?)\s*[A-Z0-9 -]+)/i);
    meetings.push({
      days,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      location: locMatch?.[0]?.trim(),
    });
  }
  return meetings;
}

function extractGradingAssignments(lines: string[]): ExtractedAssignment[] {
  const assignments: ExtractedAssignment[] = [];
  for (const line of lines) {
    // Match lines like "Midterm Exam 25%" or "Final Paper (200 points)" or "Case Analysis – 15%"
    const weightMatch = line.match(/(\d+)\s*(%|points?|pts?)/i);
    if (!weightMatch && !/\b(exam|paper|essay|project|quiz|presentation|homework|case|assignment|report)\b/i.test(line)) continue;

    const title = line
      .replace(/\d+\s*(%|points?|pts?)/ig, '')
      .replace(/[-–—:()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length < 3) continue;

    // Skip generic grading policy words
    if (/^(total|grade|grading|participation|attendance|class participation)\s*$/i.test(title)) continue;

    const dueDate = extractDate(line);
    assignments.push({
      title: title.slice(0, 90),
      dueDate: dueDate ?? undefined,
      weight: weightMatch ? `${weightMatch[1]}${weightMatch[2].toLowerCase().startsWith('p') ? ' points' : '%'}` : undefined,
      type: inferAssignmentType(line),
    });
  }
  return assignments;
}

function extractScheduleRows(lines: string[], fallbackYear?: number): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: "Week N: Topic" or "Week N Topic"
    const weekMatch = line.match(/^week\s+(\d+)\s*[:\-–—]?\s*(.*)/i);
    if (weekMatch) {
      const topic = weekMatch[2].trim();
      const readings = findReadingInContext(lines, i);
      const deliverable = findDeliverableInContext(line);
      const deadlineAt = extractDate(line, fallbackYear);
      rows.push({ weekOrDate: `Week ${weekMatch[1]}`, topic: topic || 'TBD', readings, deliverable, deadlineAt });
      continue;
    }

    // Pattern 2: "Jan 15 - Topic" or "1/15 Topic"
    const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{1,2}(?:,?\s*\d{4})?)\s*[-–—:]\s*(.*)/i);
    if (dateMatch) {
      const topic = dateMatch[2].trim();
      const readings = findReadingInContext(lines, i);
      const deliverable = findDeliverableInContext(line);
      const deadlineAt = extractDate(line, fallbackYear);
      if (topic.length > 2) {
        rows.push({ weekOrDate: dateMatch[1].trim(), topic, readings, deliverable, deadlineAt });
      }
    }
  }
  return rows;
}

function findReadingInContext(lines: string[], idx: number): string | undefined {
  // Check current line and next line for reading references
  for (let j = idx; j <= Math.min(idx + 1, lines.length - 1); j++) {
    const m = lines[j].match(/\b(?:read(?:ing)?|ch(?:apter)?\.?\s*\d+|pp?\.\s*\d+|case:?\s+["']?.{4,60}["']?)\b.*/i);
    if (m) return m[0].trim().slice(0, 120);
  }
  return undefined;
}

function findDeliverableInContext(line: string): string | undefined {
  const m = line.match(/\b((?:assignment|paper|essay|quiz|exam|project|report|presentation|homework|case\s+(?:write-?up|analysis|memo))\s*(?:#?\d+)?(?:\s+due)?)\b/i);
  return m?.[1]?.trim();
}

function extractReadings(lines: string[]): ExtractedReading[] {
  const readings: ExtractedReading[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // "Chapter 5: Title" or "Ch. 3 - Something" or "Crawford Ch. 1-2"
    const chMatch = line.match(/\bch(?:apter)?\.?\s*(\d+(?:\s*[-–&,]\s*\d+)*)(?:\s*[:\-–—]\s*(.*))?/i);
    if (chMatch) {
      const title = chMatch[2]?.trim() || `Chapter ${chMatch[1]}`;
      const key = title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        readings.push({ title: title.slice(0, 120), chapter: `Ch. ${chMatch[1]}` });
      }
      continue;
    }

    // "Read: Something" or "Reading: Something"
    const readMatch = line.match(/\bread(?:ing)?s?\s*:\s*(.+)/i);
    if (readMatch) {
      const title = readMatch[1].trim();
      const key = title.toLowerCase();
      if (title.length > 3 && !seen.has(key)) {
        seen.add(key);
        readings.push({ title: title.slice(0, 120) });
      }
      continue;
    }

    // Case study pattern: "Case: HBS Case Name" or "Case - Something"
    const caseMatch = line.match(/\bcase\s*[:\-–—]\s*(.{4,})/i);
    if (caseMatch && !/\bcase\s+(analysis|write|memo|study\s+(?:analysis|write|memo))/i.test(line)) {
      const title = caseMatch[1].trim().replace(/\s*\(.*?\)\s*$/, '');
      const key = title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        readings.push({ title: `Case: ${title.slice(0, 110)}` });
      }
    }
  }
  return readings;
}

function extractSetupTasks(lines: string[]): SetupTask[] {
  const tasks: SetupTask[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    let category: SetupTask['category'] | null = null;
    let title = '';

    if (/\btextbook|isbn|required.*(?:text|book)|purchase.*book/i.test(line)) {
      category = 'textbook';
      title = line.replace(/^[-*•]\s*/, '').trim().slice(0, 120);
    } else if (/\bsoftware|install|download|app(?:lication)?|tool\b/i.test(line) &&
               !/\bpolic|honor|integrity\b/i.test(line)) {
      category = 'software';
      title = line.replace(/^[-*•]\s*/, '').trim().slice(0, 120);
    } else if (/\bcreate.*account|sign\s*up|register|enroll|access\s+code\b/i.test(line)) {
      category = 'account';
      title = line.replace(/^[-*•]\s*/, '').trim().slice(0, 120);
    } else if (/\bclicker|calculator|lab\s*(?:kit|coat|manual)|supplies\b/i.test(line)) {
      category = 'material';
      title = line.replace(/^[-*•]\s*/, '').trim().slice(0, 120);
    }

    if (category && title.length > 5) {
      const key = title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ title, category });
      }
    }
  }
  return tasks;
}

// ── Main parser ─────────────────────────────────────────────────────────

export const syllabusParserService = {
  parse(req: { text: string; courseId?: string; term?: string }): SyllabusParseResult {
    const text = req.text;
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const fallbackYear = new Date().getFullYear();

    // Split into rough sections for context-aware extraction
    const gradingLines: string[] = [];
    const scheduleLines: string[] = [];
    const materialsLines: string[] = [];
    let currentSection: SectionKind = 'other';

    for (const line of lines) {
      if (isHeading(line)) {
        currentSection = classifySection(line);
      }
      switch (currentSection) {
        case 'grading': gradingLines.push(line); break;
        case 'schedule': scheduleLines.push(line); break;
        case 'materials': materialsLines.push(line); break;
      }
    }

    const course = extractCourse(lines, req.term);
    if (req.courseId) course.id = req.courseId;

    const classMeetings = extractClassMeetings(lines);
    const scheduleRows = extractScheduleRows(scheduleLines.length > 0 ? scheduleLines : lines, fallbackYear);
    const assignments = extractGradingAssignments(gradingLines.length > 0 ? gradingLines : lines);
    const readings = extractReadings(lines);
    const setupTasks = extractSetupTasks(materialsLines.length > 0 ? materialsLines : lines);

    // Build deadlines from all date-bearing lines (original behavior, enhanced)
    const deadlines = lines
      .map(line => ({ line, deadlineAt: extractDate(line, fallbackYear) }))
      .filter((item): item is { line: string; deadlineAt: number } => Boolean(item.deadlineAt))
      .filter(({ line }) => {
        // Skip lines that are just class meeting times or office hours
        if (/\boffice hours\b/i.test(line)) return false;
        if (parseTimeRange(line) && /\b(M|T|W|Th|F|Mon|Tue|Wed|Thu|Fri)\b/.test(line)) return false;
        return true;
      })
      .map(({ line, deadlineAt }) => ({
        title: titleFromLine(line),
        deadlineAt,
        type: inferDeadlineType(line),
        sourceType: 'syllabus' as const,
        courseId: req.courseId,
        confidence: /\bdue|exam|quiz|final|project|presentation|midterm\b/i.test(line) ? 0.8 : 0.55,
        confirmed: false,
        completed: false,
      }));

    return { course, classMeetings, scheduleRows, assignments, readings, setupTasks, deadlines, notes: [] };
  },
};
