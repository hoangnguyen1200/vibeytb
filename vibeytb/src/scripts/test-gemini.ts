import 'dotenv/config';
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Chào bạn, bạn là ai?");
    console.log("✅ Thành công! Phản hồi từ Gemini:", result.response.text());
  } catch (error: any) {
    console.error("❌ Lỗi API:", error.message);
    const fs = require('fs');
    fs.writeFileSync('gemini-error.txt', error.stack || error.message, 'utf-8');
  }
}

testGemini();
