import type { EventCategory } from '@/types/event';

const CATEGORY_KEYWORDS: Array<{ category: EventCategory; thai: string[]; english: string[] }> = [
  { category: 'Important', thai: ['ด่วน', 'สำคัญ', 'กำหนดส่ง', 'เดดไลน์'], english: ['urgent', 'important', 'deadline', 'due'] },
  { category: 'Health', thai: ['หมอ', 'ทันตแพทย์', 'โรงพยาบาล', 'คลินิก', 'ตรวจสุขภาพ', 'ออกกำลัง', 'ฟิตเนส', 'วิ่ง'], english: ['doctor', 'dentist', 'hospital', 'clinic', 'health', 'medical', 'workout', 'gym', 'run'] },
  { category: 'School', thai: ['เรียน', 'สอบ', 'การบ้าน', 'โรงเรียน', 'มหาวิทยาลัย', 'ติว', 'วิชา'], english: ['class', 'exam', 'test', 'homework', 'school', 'university', 'study', 'lecture'] },
  { category: 'Meeting', thai: ['ประชุม', 'นัดคุย', 'สัมภาษณ์', 'วิดีโอคอล'], english: ['meeting', 'meet', 'conference', 'appointment', 'interview', 'zoom', 'teams', 'call'] },
  { category: 'Work', thai: ['งาน', 'โปรเจกต์', 'โครงการ', 'ลูกค้า', 'รายงาน', 'พรีเซนต์', 'ออฟฟิศ'], english: ['work', 'project', 'client', 'report', 'presentation', 'office'] },
  { category: 'Personal', thai: ['ส่วนตัว', 'วันเกิด', 'ครอบครัว', 'ซื้อของ', 'เดินทาง', 'ท่องเที่ยว', 'เที่ยว', 'เที่ยวบิน'], english: ['personal', 'birthday', 'anniversary', 'family', 'shopping', 'travel', 'trip', 'flight'] },
];

export function detectEventCategory(text: string): EventCategory {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('en-US');
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.thai.some((keyword) => normalized.includes(keyword))) return rule.category;
    if (rule.english.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(normalized))) return rule.category;
  }
  return 'Other';
}
