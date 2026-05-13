import { describe, test, expect, beforeAll } from 'vitest';
import { syllabusParserService } from './syllabusParserService';
import type { SyllabusParseResult } from './syllabusParserService';

// ── BUAD 6461 Product Management (Spring 2026) ─────────────────────────
// Fixture based on the real syllabus structure for John Manuli's section.

const BUAD_6461_SYLLABUS = `
BUAD 6461 - Product Management
Spring 2026

Instructor: John Manuli
john.manuli@mason.wm.edu
Office: Miller 3050
Office Hours: Monday/Wednesday 11:00 AM-12:30 PM and Tuesday/Thursday 9:30 AM-10:50 AM

Class Meetings: Tuesday/Thursday 3:30 PM-4:50 PM, Miller Hall 1018

COURSE DESCRIPTION
This course covers the new product development process from ideation through
launch. Students will work in teams to develop and pitch an original product
concept. Topics include opportunity identification, concept generation and
testing, design, prototyping, and go-to-market strategy.

REQUIRED MATERIALS
- Textbook: Crawford and DiBenedetto, New Products Management, 12th edition
- Harvard Business Publishing coursepack (access code distributed via Blackboard)
- Additional readings, cases, and videos posted on Blackboard

GRADING
Class Participation and Attendance 10%
Case Analyses (7 total) 21%
New Product Concept Executive Summary 10%
NPD Report 20%
Final Product/Brand Presentation 20%
Cumulative Exam 14%
Peer Review 5%

ASSIGNMENTS AND DELIVERABLES
New Product Concept Executive Summary: Thu, Apr 2
NPD Report: Mon, Apr 20
Final Product/Brand Presentation Decks: Sat, May 2
Final Presentations: Tue, May 5 and Thu, May 7
Peer Review: Sat, May 9
Cumulative Exam: Thu, Apr 16

CASE ANALYSIS SCHEDULE
Each student must submit a written case analysis before class on the day indicated.
Gallardo's: Tue, Feb 3
Dell: Thu, Feb 19
Unilever: Thu, Mar 5
Le Petit Chef: Tue, Mar 31
Krispy Natural: Thu, Apr 9
Quaker Oats: Tue, Apr 21
Harley-Davidson: Thu, Apr 30

COURSE SCHEDULE (Attachment 1)
Jan 13 - Course Overview and Introduction to NPD
Jan 15 - Opportunity Identification
  Read: Crawford Ch. 1-2
Jan 20 - Creativity and Concept Generation
  Read: Crawford Ch. 3-4
Jan 22 - Concept Testing
  Read: Crawford Ch. 5
Jan 27 - The Product Protocol
  Read: Crawford Ch. 6
Jan 29 - Market Analysis Tools
Feb 3 - Case Discussion: Gallardo's
  Read: Gallardo's case (HBP coursepack)
Feb 5 - Customer Needs and VOC Methods
  Read: Crawford Ch. 7
Feb 10 - Product Architecture and Design
  Read: Crawford Ch. 8-9
Feb 12 - Prototyping and Testing
Feb 17 - Supply Chain and Manufacturing
  Read: Crawford Ch. 10
Feb 19 - Case Discussion: Dell
  Read: Dell case (HBP coursepack)
Feb 24 - Product Launch Strategy
  Read: Crawford Ch. 14-15
Feb 26 - Branding and Positioning
  Read: Crawford Ch. 16
Mar 3 - Pricing New Products
  Read: Crawford Ch. 17
Mar 5 - Case Discussion: Unilever
  Read: Unilever case (HBP coursepack)
Mar 10 - Spring Break (no class)
Mar 12 - Spring Break (no class)
Mar 17 - Digital Products and Platforms
Mar 19 - Agile Product Development
  Read: Crawford Ch. 11
Mar 24 - Financial Analysis for New Products
  Read: Crawford Ch. 12
Mar 26 - Risk Management in NPD
  Read: Crawford Ch. 13
Mar 31 - Case Discussion: Le Petit Chef
  Read: Le Petit Chef case (HBP coursepack)
Apr 2 - Executive Summary Due / Team Workshops
Apr 7 - Go-to-Market Planning
Apr 9 - Case Discussion: Krispy Natural
  Read: Krispy Natural case (HBP coursepack)
Apr 14 - Exam Review
Apr 16 - Cumulative Exam
Apr 21 - Case Discussion: Quaker Oats
  Read: Quaker Oats case (HBP coursepack)
Apr 23 - NPD Report Workshop
Apr 28 - Presentation Prep
Apr 30 - Case Discussion: Harley-Davidson
  Read: Harley-Davidson case (HBP coursepack)
May 5 - Final Presentations (Group A)
May 7 - Final Presentations (Group B)

COURSE POLICIES
Late submissions will receive a grade penalty of one letter grade per day.
Academic Honor Code: All students are expected to adhere to the university honor code.
Accommodations: Students needing accommodations should contact the instructor.
`;

// ── BUAD 6271 Database Management (Spring 2026) ────────────────────────
// Fixture mirrors the embedded text shape extracted from the real PDF:
// the schedule table is flattened into one long line.

const BUAD_6271_SYLLABUS = `
Professor S. Li – Syllabus for BUAD 6271: Database Management
BUAD 6271 : Database Management
Spring 2026
Instructor: Seth Li
Class Location & Hours: Miller Hall 10 27 , Tuesday and Thursday 9 : 3 0 – 10:50 a m
Office: Miller Hall 3056
E-mail: seth.li@mason.wm.edu
Office Hours: By Appointment

COURSE MATERIALS
Textbook: Database Systems: Introduction to Database and Data Warehouses
Nenad Jukic, Susan Vrbsky, and Svetlozar Nestorov
ISBN-13: 978-1943153190
Useful Links:
MySQL:
Download links:
1. MySQL Server
2. MySQL Workbench
SQL Tutorial: http://www.1keydata.com/sql/sql.html
ER diagram: https://erdplus.com/trial
Tableau Desktop (product key: TCK5-9053-BC00-5C03-0A72, valid till 5/29/2026)

COURSE GRADING
Component Percent
Individual Level – 60%
Class Participation 5 %
Homework 10%
In-class Quizzes 15 %
Final Exam (May 7) 30%
Team Level – 40%
Team Presentations (Week 6, Week 15) 20%
Final Project Report (May 10) 20%

Date Topic/Activities Readings Notes
Theme 1: Why do I need a database? What data do I need?
Week 1: Jan 20, 22 Introduction to data base management, Basic components of data and database Chapter 1, Chapter 2 *Teams decided
Week 2: Jan 27, 29 Basic components of data and database Chapter 2 *DB case decided
Theme 2: How do I design my database?
Week 3: Feb 3, 5 Introduction to ER-Diagram Chapter 2 *MySQL installed
Week 4: Feb 10, 12 Relational DB modeling Chapter 3
Week 5: Feb 17, 19 Normalization Chapter 4 Assignment 1 - ER Diagram Due
Week 6: Feb 24, 26 Team presentation 1 - The design of your DB
Theme 3: Database implementation and how do I get information from it?
Week 7: Mar 3, 5 SQL - Single Entity Chapter 5 Assignment 2 - Normalization Due
Week 8: Mar 10, 12 Spring Break
Week 9: Mar 17, 19 MBA Sprint Week
Week 10: Mar 24, 26 SQL - Single Entity Chapter 5
Week 11: Mar 31, Apr 2 SQL - Multiple Entities Assignment 3 - SQL Due
Week 12: Apr 7, 9 SQL - Advanced Queries *Tableau installed and connected to MySQL
Theme 4: How to turn data into intelligence?
Week 12: Apr 7, 9 Data Analytics
Week 13: Apr 14, 16 Introduction to Data Visualization
Week 14: Apr 21, 23 Dashboard Design Assignment 4 - Data Visualization Due
Week 15: Apr 28, 30 Team presentation 2 - Your DB solution
Week 16: May 5 (Tuesday) Review
May 7 (Thursday) Final Exam
May 10 (Sunday) Final Project Report Due

COURSE POLICIES
Attendance is essential.
`;

// ── Tests ───────────────────────────────────────────────────────────────

describe('syllabusParserService.parse — BUAD 6461 Product Management', () => {
  let result: SyllabusParseResult;

  beforeAll(() => {
    result = syllabusParserService.parse({ text: BUAD_6461_SYLLABUS });
  });

  // ── Course metadata ───────────────────────────────────────────────

  describe('course metadata', () => {
    test('extracts course code', () => {
      expect(result.course.code).toBe('BUAD 6461');
    });

    test('extracts course name containing "Product Management"', () => {
      expect(result.course.name).toContain('Product Management');
    });

    test('extracts instructor name', () => {
      expect(result.course.professorName).toContain('John Manuli');
    });

    test('extracts instructor email', () => {
      expect(result.course.professorEmail).toBe('john.manuli@mason.wm.edu');
    });

    test('extracts office hours line', () => {
      expect(result.course.officeHours).toMatch(/Monday\/Wednesday/);
      expect(result.course.officeHours).toMatch(/11:00/);
    });

    test('auto-detects term from text', () => {
      expect(result.course.term).toBe('Spring 2026');
    });

    test('extracts location containing Miller Hall', () => {
      expect(result.course.location).toMatch(/Miller Hall/i);
    });
  });

  // ── Class meetings ────────────────────────────────────────────────

  describe('class meetings', () => {
    test('finds the main class meeting', () => {
      expect(result.classMeetings.length).toBeGreaterThanOrEqual(1);
    });

    test('parses Tuesday/Thursday days', () => {
      const meeting = result.classMeetings[0];
      expect(meeting.days).toContain('Tue');
      expect(meeting.days).toContain('Thu');
      expect(meeting.days).toHaveLength(2);
    });

    test('parses 3:30 PM - 4:50 PM time range', () => {
      const meeting = result.classMeetings[0];
      expect(meeting.startTime).toMatch(/3:30\s*PM/i);
      expect(meeting.endTime).toMatch(/4:50\s*PM/i);
    });

    test('captures Miller Hall location', () => {
      // The location regex captures from "room|hall|..." onward
      const meeting = result.classMeetings[0];
      expect(meeting.location).toBeDefined();
    });

    test('office hours are NOT extracted as class meetings', () => {
      // There are two office hours lines; neither should appear
      const ohMeeting = result.classMeetings.find(m =>
        m.days.includes('Mon') && m.days.includes('Wed')
      );
      expect(ohMeeting).toBeUndefined();
    });
  });

  // ── Schedule rows ─────────────────────────────────────────────────

  describe('schedule rows', () => {
    test('extracts dated schedule rows', () => {
      // The schedule uses "Jan 13 - Topic" format
      expect(result.scheduleRows.length).toBeGreaterThanOrEqual(20);
    });

    test('first row is Jan 13 Course Overview', () => {
      const first = result.scheduleRows[0];
      expect(first.weekOrDate).toMatch(/Jan\s*13/);
      expect(first.topic).toMatch(/Course Overview|Introduction/i);
    });

    test('rows with readings have reading field populated', () => {
      const withReadings = result.scheduleRows.filter(r => r.readings);
      expect(withReadings.length).toBeGreaterThanOrEqual(5);
    });

    test('last schedule row is May 7 Final Presentations', () => {
      const last = result.scheduleRows[result.scheduleRows.length - 1];
      expect(last.weekOrDate).toMatch(/May\s*7/);
      expect(last.topic).toMatch(/Final Presentation/i);
    });
  });

  // ── Assignments (grading section) ─────────────────────────────────

  describe('assignments from grading section', () => {
    test('extracts graded components', () => {
      expect(result.assignments.length).toBeGreaterThanOrEqual(4);
    });

    test('finds Cumulative Exam', () => {
      const exam = result.assignments.find(a => /cumulative\s*exam/i.test(a.title));
      expect(exam).toBeDefined();
      expect(exam!.type).toBe('exam');
      expect(exam!.weight).toMatch(/14/);
    });

    test('finds NPD Report', () => {
      const npd = result.assignments.find(a => /NPD\s*Report/i.test(a.title));
      expect(npd).toBeDefined();
      expect(npd!.weight).toMatch(/20/);
    });

    test('finds Final Presentation', () => {
      const pres = result.assignments.find(a => /Final.*Presentation/i.test(a.title));
      expect(pres).toBeDefined();
      expect(pres!.type).toBe('presentation');
      expect(pres!.weight).toMatch(/20/);
    });

    test('finds Peer Review', () => {
      const pr = result.assignments.find(a => /peer\s*review/i.test(a.title));
      expect(pr).toBeDefined();
      expect(pr!.weight).toMatch(/5/);
    });
  });

  // ── Deadlines ─────────────────────────────────────────────────────

  describe('deadlines', () => {
    test('extracts multiple deadlines with dates', () => {
      expect(result.deadlines.length).toBeGreaterThanOrEqual(6);
    });

    test('New Product Concept Executive Summary: Apr 2', () => {
      const d = result.deadlines.find(d => /executive summary/i.test(d.title));
      expect(d).toBeDefined();
      const date = new Date(d!.deadlineAt);
      expect(date.getMonth()).toBe(3); // April
      expect(date.getDate()).toBe(2);
    });

    test('NPD Report: Apr 20', () => {
      const d = result.deadlines.find(d => /NPD Report/i.test(d.title));
      expect(d).toBeDefined();
      const date = new Date(d!.deadlineAt);
      expect(date.getMonth()).toBe(3);
      expect(date.getDate()).toBe(20);
    });

    test('Cumulative Exam: Apr 16', () => {
      const d = result.deadlines.find(d => /cumulative exam/i.test(d.title));
      expect(d).toBeDefined();
      expect(d!.type).toBe('exam');
      const date = new Date(d!.deadlineAt);
      expect(date.getMonth()).toBe(3);
      expect(date.getDate()).toBe(16);
    });

    test('Final Presentations: May 5', () => {
      const d = result.deadlines.find(d => /final presentation/i.test(d.title) && new Date(d.deadlineAt).getDate() === 5);
      expect(d).toBeDefined();
      expect(d!.type).toBe('presentation');
      const date = new Date(d!.deadlineAt);
      expect(date.getMonth()).toBe(4); // May
    });

    test('Peer Review: May 9', () => {
      const d = result.deadlines.find(d => /peer review/i.test(d.title));
      expect(d).toBeDefined();
      const date = new Date(d!.deadlineAt);
      expect(date.getMonth()).toBe(4);
      expect(date.getDate()).toBe(9);
    });

    test('all deadlines default to unconfirmed', () => {
      for (const d of result.deadlines) {
        expect(d.confirmed).toBe(false);
      }
    });
  });

  // ── Case checkpoints (appear as deadlines) ────────────────────────

  describe('case checkpoints as deadlines', () => {
    const CASES = [
      { name: "Gallardo's", month: 1, day: 3 },    // Feb 3
      { name: 'Dell', month: 1, day: 19 },          // Feb 19
      { name: 'Unilever', month: 2, day: 5 },       // Mar 5
      { name: 'Le Petit Chef', month: 2, day: 31 }, // Mar 31
      { name: 'Krispy Natural', month: 3, day: 9 }, // Apr 9
      { name: 'Quaker Oats', month: 3, day: 21 },  // Apr 21
      { name: 'Harley-Davidson', month: 3, day: 30 }, // Apr 30
    ];

    for (const c of CASES) {
      test(`${c.name} deadline on ${c.month + 1}/${c.day}`, () => {
        const d = result.deadlines.find(d =>
          d.title.toLowerCase().includes(c.name.toLowerCase().slice(0, 6))
        );
        expect(d).toBeDefined();
        const date = new Date(d!.deadlineAt);
        expect(date.getMonth()).toBe(c.month);
        expect(date.getDate()).toBe(c.day);
      });
    }
  });

  // ── Readings ──────────────────────────────────────────────────────

  describe('readings', () => {
    test('extracts Crawford chapter references', () => {
      const crawfordReadings = result.readings.filter(r => r.chapter);
      expect(crawfordReadings.length).toBeGreaterThanOrEqual(5);
    });

    test('extracts HBP case readings', () => {
      const cases = result.readings.filter(r => /case/i.test(r.title));
      expect(cases.length).toBeGreaterThanOrEqual(3);
    });

    test('no duplicate readings', () => {
      const titles = result.readings.map(r => r.title.toLowerCase());
      expect(new Set(titles).size).toBe(titles.length);
    });
  });

  // ── Setup tasks ───────────────────────────────────────────────────

  describe('setup tasks', () => {
    test('finds textbook requirement (Crawford)', () => {
      const tb = result.setupTasks.find(t => t.category === 'textbook');
      expect(tb).toBeDefined();
      expect(tb!.title).toMatch(/Crawford|New Products Management/i);
    });

    test('finds Harvard coursepack requirement', () => {
      const acc = result.setupTasks.find(t =>
        /coursepack|access code/i.test(t.title)
      );
      expect(acc).toBeDefined();
    });
  });
});

describe('syllabusParserService.parse — BUAD 6271 Database Management', () => {
  let result: SyllabusParseResult;

  beforeAll(() => {
    result = syllabusParserService.parse({ text: BUAD_6271_SYLLABUS, term: 'Spring 2026' });
  });

  test('extracts BUAD6271 course metadata', () => {
    expect(result.course.code).toBe('BUAD 6271');
    expect(result.course.name).toMatch(/Database Management/i);
    expect(result.course.professorName).toMatch(/Seth Li/i);
    expect(result.course.professorEmail).toBe('seth.li@mason.wm.edu');
    expect(result.course.location).toMatch(/Miller Hall/i);
    expect(result.course.term).toBe('Spring 2026');
  });

  test('extracts Tuesday/Thursday 9:30-10:50 class meeting', () => {
    expect(result.classMeetings.length).toBeGreaterThanOrEqual(1);
    expect(result.classMeetings[0].days).toEqual(['Tue', 'Thu']);
    expect(result.classMeetings[0].startTime).toMatch(/9:30\s*AM/i);
    expect(result.classMeetings[0].endTime).toMatch(/10:50\s*AM/i);
  });

  test('extracts grading components for later grade management', () => {
    expect(result.gradingComponents).toEqual(expect.arrayContaining([
      { title: 'Class Participation', weight: '5%' },
      { title: 'Homework', weight: '10%' },
      { title: 'In-class Quizzes', weight: '15%' },
      { title: 'Final Exam', weight: '30%' },
      { title: 'Team Presentations', weight: '20%' },
      { title: 'Final Project Report', weight: '20%' },
    ]));
  });

  test('extracts chronological Week 1 through Week 16 schedule rows plus final due dates', () => {
    const labels = result.scheduleRows.map(row => row.weekOrDate);
    expect(labels[0]).toBe('Week 1');
    expect(labels).toContain('Week 16');
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 1')?.topic).toMatch(/Introduction to data base management/i);
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 16')?.topic).toMatch(/Review/i);
    expect(result.scheduleRows.find(row => /Final Exam/i.test(row.topic))?.weekOrDate).toBe('Final Exam');
    expect(result.scheduleRows.find(row => /Final Project Report/i.test(row.topic))?.weekOrDate).toBe('Final Project');
  });

  test('keeps textbook chapters as class prep readings', () => {
    const week1 = result.scheduleRows.find(row => row.weekOrDate === 'Week 1');
    const week4 = result.scheduleRows.find(row => row.weekOrDate === 'Week 4');
    const week7 = result.scheduleRows.find(row => row.weekOrDate === 'Week 7');
    expect(week1?.readings).toMatch(/Chapter 1/i);
    expect(week1?.readings).toMatch(/Chapter 2/i);
    expect(week4?.readings).toMatch(/Chapter 3/i);
    expect(week7?.readings).toMatch(/Chapter 5/i);
  });

  test('extracts setup tasks from materials and schedule notes', () => {
    expect(result.setupTasks.map(t => t.title)).toEqual(expect.arrayContaining([
      'Install MySQL Server',
      'Install MySQL Workbench',
      'Set up ER diagram tool',
      'Install Tableau Desktop',
    ]));
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 3')?.prepItems).toContain('MySQL installed');
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 12')?.prepItems).toContain('Tableau installed and connected to MySQL');
  });

  test('extracts assignment, presentation, exam, and project milestones from the schedule', () => {
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 5')?.milestones).toContain('Assignment 1 - ER Diagram Due');
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 7')?.milestones).toContain('Assignment 2 - Normalization Due');
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 11')?.milestones).toContain('Assignment 3 - SQL Due');
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 14')?.milestones).toContain('Assignment 4 - Data Visualization Due');
    expect(result.scheduleRows.find(row => row.weekOrDate === 'Week 6')?.milestones?.[0]).toMatch(/Team presentation 1/i);
    expect(result.scheduleRows.find(row => /Final Exam/i.test(row.topic))?.milestones).toContain('Final Exam');
    expect(result.scheduleRows.find(row => /Final Project Report/i.test(row.topic))?.milestones).toContain('Final Project Report Due');
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe('syllabusParserService edge cases', () => {
  test('empty text returns empty arrays', () => {
    const result = syllabusParserService.parse({ text: '' });
    expect(result.classMeetings).toEqual([]);
    expect(result.scheduleRows).toEqual([]);
    expect(result.assignments).toEqual([]);
    expect(result.readings).toEqual([]);
    expect(result.setupTasks).toEqual([]);
    expect(result.deadlines).toEqual([]);
  });

  test('text with no dates returns no deadlines', () => {
    const result = syllabusParserService.parse({ text: 'This is a course about strategy.\nWe will study cases.' });
    expect(result.deadlines).toEqual([]);
  });

  test('MWF class meeting parsing', () => {
    const result = syllabusParserService.parse({ text: 'Class meets MWF 9:00-9:50 AM, Room 101 Smith Hall' });
    expect(result.classMeetings.length).toBe(1);
    expect(result.classMeetings[0].days).toEqual(['Mon', 'Wed', 'Fri']);
    expect(result.classMeetings[0].startTime).toMatch(/9:00/);
  });

  test('courseId is passed through to deadlines', () => {
    const result = syllabusParserService.parse({ text: 'Midterm Exam October 5, 2026', courseId: 'course-123' });
    expect(result.deadlines[0].courseId).toBe('course-123');
  });

  test('term is auto-detected from text when not provided', () => {
    const result = syllabusParserService.parse({ text: 'ECON 101\nSpring 2027\nProfessor Smith' });
    expect(result.course.term).toBe('Spring 2027');
  });

  test('handles numeric date formats', () => {
    const result = syllabusParserService.parse({ text: 'Paper due 10/15/2026' });
    expect(result.deadlines.length).toBe(1);
    const date = new Date(result.deadlines[0].deadlineAt);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(15);
  });

  test('removes due words, date, and time from parsed deadline titles', () => {
    const result = syllabusParserService.parse({
      text: 'Quiz 2 due May 1, 2026 at 11:59 PM\nFinal project proposal due May 8, 2026 at 11:59 PM'
    });
    expect(result.deadlines.map(d => d.title)).toEqual(['Quiz 2', 'Final project proposal']);
  });

  test('presentation deadline gets correct type', () => {
    const result = syllabusParserService.parse({ text: 'Group Presentation due November 20, 2026' });
    expect(result.deadlines[0].type).toBe('presentation');
  });

  test('office hours lines are not treated as deadlines', () => {
    const result = syllabusParserService.parse({
      text: 'Office Hours: MW 3:00-4:00 PM\nMidterm Exam October 10, 2026'
    });
    expect(result.deadlines.length).toBe(1);
    expect(result.deadlines[0].title).toMatch(/midterm/i);
  });

  test('Tuesday/Thursday slash-separated day parsing', () => {
    const result = syllabusParserService.parse({
      text: 'Class meets Tuesday/Thursday 1:00-2:15 PM, Room 200'
    });
    expect(result.classMeetings.length).toBe(1);
    expect(result.classMeetings[0].days).toEqual(['Tue', 'Thu']);
  });

  test('Monday/Wednesday slash-separated day parsing', () => {
    const result = syllabusParserService.parse({
      text: 'Lecture: Monday/Wednesday 10:00 AM-11:15 AM'
    });
    expect(result.classMeetings.length).toBe(1);
    expect(result.classMeetings[0].days).toEqual(['Mon', 'Wed']);
  });
});
