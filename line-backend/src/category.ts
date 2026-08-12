import type { EventCategory } from './types';

export type CategoryScore = { category: EventCategory; score: number };

type WeightedRule = {
  category: EventCategory;
  phrases: { value: string; weight: number }[];
};

const RULES: WeightedRule[] = [
  {
    category: 'Important',
    phrases: weighted(10, ['ด่วนมาก', 'สำคัญมาก', 'urgent', 'critical']).concat(weighted(7, ['ด่วน', 'สำคัญ', 'กำหนดส่ง', 'deadline', 'due'])),
  },
  {
    category: 'Exam',
    phrases: weighted(4, ['สอบกลางภาค', 'สอบปลายภาค', 'midterm', 'final exam']).concat(weighted(3, ['ข้อสอบ', 'สอบ', 'quiz', 'exam', 'test'])),
  },
  {
    category: 'Assignment',
    phrases: weighted(5, ['ส่งการบ้าน', 'ส่งงาน', 'ส่งโปรเจกต์', 'submit assignment', 'submit project']).concat(weighted(3, ['การบ้าน', 'assignment', 'homework', 'project', 'report'])),
  },
  {
    category: 'Meeting',
    phrases: weighted(5, ['นัดประชุม', 'ประชุมโปรเจกต์', 'project meeting']).concat(weighted(4, ['ประชุม', 'มีทติ้ง', 'คุยงาน', 'meeting', 'conference']).concat(weighted(2, ['present', 'presentation', 'meet', 'zoom', 'teams call']))),
  },
  {
    category: 'Health',
    phrases: weighted(5, ['ตรวจสุขภาพ', 'ไปหาหมอ', 'doctor appointment']).concat(weighted(3, ['โรงพยาบาล', 'คลินิก', 'ทันตแพทย์', 'หมอ', 'ยา', 'doctor', 'dentist', 'hospital', 'clinic', 'medical'])),
  },
  {
    category: 'Exercise',
    phrases: weighted(4, ['ออกกำลังกาย', 'เข้ายิม']).concat(weighted(3, ['ฟิตเนส', 'ยิม', 'วิ่ง', 'ฟุตบอล', 'ปิงปอง', 'gym', 'workout', 'training']).concat(weighted(2, ['run']))),
  },
  {
    category: 'Travel',
    phrases: weighted(4, ['ขึ้นเครื่อง', 'เดินทางไป', 'สนามบิน']).concat(weighted(3, ['เครื่องบิน', 'เที่ยวบิน', 'เดินทาง', 'flight', 'airport', 'travel', 'trip', 'เที่ยว']).concat(weighted(2, ['บิน']))),
  },
  {
    category: 'Study',
    phrases: weighted(4, ['อ่านหนังสือ', 'เข้าเรียน']).concat(weighted(3, ['เรียน', 'ติว', 'วิชา', 'study', 'class', 'lecture', 'lesson'])),
  },
  {
    category: 'School',
    phrases: weighted(3, ['โรงเรียน', 'มหาวิทยาลัย', 'school', 'university', 'campus']),
  },
  {
    category: 'Work',
    phrases: weighted(5, ['ลูกค้า', 'client']).concat(weighted(3, ['ออฟฟิศ', 'สำนักงาน', 'office']).concat(weighted(1, ['งาน', 'work']))),
  },
  {
    category: 'Personal',
    phrases: weighted(4, ['วันเกิด', 'birthday', 'anniversary']).concat(weighted(2, ['ส่วนตัว', 'ครอบครัว', 'ซื้อของ', 'personal', 'family', 'shopping'])),
  },
];

function weighted(weight: number, values: string[]): { value: string; weight: number }[] {
  return values.map((value) => ({ value, weight }));
}

function containsPhrase(text: string, phrase: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }
  return text.includes(phrase);
}

export function scoreEventCategories(text: string): CategoryScore[] {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
  return RULES.map((rule) => ({
    category: rule.category,
    score: rule.phrases.reduce((sum, phrase) => sum + (containsPhrase(normalized, phrase.value) ? phrase.weight : 0), 0),
  })).sort((a, b) => b.score - a.score);
}

export function detectEventCategory(text: string): EventCategory {
  const [best, second] = scoreEventCategories(text);
  if (!best || best.score < 2) return 'Other';
  if (second && second.score === best.score) return 'Other';
  return best.category;
}
