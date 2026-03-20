import 'dotenv/config';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  console.log('Testing Key:', key?.substring(0, 10) + '...');
  if (!key) {
    console.log('Chưa có key trong process.env');
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Chào bạn, bạn là ai?');
    console.log('✅ Thành công! Phản hồi từ Gemini:', result.response.text());
  } catch (error: unknown) {
    const err = error as Error;
    console.error('❌ Lỗi API:', err.message);
    fs.writeFileSync('gemini-error.txt', err.stack || err.message, 'utf-8');
  }
}

testGemini();