/**
 * Test Gemini Image Generation (Imagen 3)
 * Kiểm tra xem API key có hỗ trợ generate ảnh thumbnail không
 * 
 * Chạy: npx tsx src/scripts/test-imagen.ts
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

async function testImageGeneration() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY chưa có trong .env');
    process.exit(1);
  }

  console.log('🎨 Test Gemini Image Generation...');
  console.log('   API Key: ...', apiKey.slice(-8));

  const genAI = new GoogleGenerativeAI(apiKey);

  // --- Test 1: Gemini 2.5 Flash native image generation ---
  console.log('\n📸 Test 1: Gemini 2.5 Flash (native image output)...');
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        // @ts-ignore — responseModalities mới, chưa có type
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const result = await model.generateContent(
      'Generate a YouTube Shorts thumbnail image: bold text "AI TOOL" on a vibrant gradient background, tech style, modern, eye-catching. The image should be 1080x1920 portrait mode.'
    );

    const response = result.response;
    let imageFound = false;

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        // Lưu ảnh ra file
        const outDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        
        const ext = part.inlineData.mimeType?.includes('png') ? 'png' : 'jpg';
        const outPath = path.join(outDir, `test-thumbnail.${ext}`);
        
        const buffer = Buffer.from(part.inlineData.data!, 'base64');
        fs.writeFileSync(outPath, buffer);
        
        console.log(`   ✅ Image generated! Size: ${buffer.length} bytes`);
        console.log(`   📁 Saved to: ${outPath}`);
        console.log(`   📐 MIME: ${part.inlineData.mimeType}`);
        imageFound = true;
      }
      if (part.text) {
        console.log(`   📝 Text response: ${part.text.substring(0, 100)}...`);
      }
    }

    if (!imageFound) {
      console.log('   ⚠️  Model responded but no image in output');
      console.log('   Response parts:', JSON.stringify(response.candidates?.[0]?.content?.parts?.map(p => Object.keys(p)), null, 2));
    }
  } catch (err: any) {
    console.log(`   ❌ Error: ${err.message}`);
    if (err.message.includes('not found') || err.message.includes('not supported')) {
      console.log('   → Model không khả dụng với API key này');
    }
  }

  // --- Test 2: Imagen 3 dedicated model ---
  console.log('\n📸 Test 2: Imagen 3 (dedicated image model)...');
  try {
    const imagenModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' });
    
    const result = await imagenModel.generateContent(
      'A YouTube Shorts thumbnail with bold white text "AI TOOL" on vibrant blue-purple gradient, modern tech style, 1080x1920'
    );

    const response = result.response;
    let imageFound = false;

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const outDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        
        const outPath = path.join(outDir, 'test-thumbnail-imagen3.png');
        const buffer = Buffer.from(part.inlineData.data!, 'base64');
        fs.writeFileSync(outPath, buffer);

        console.log(`   ✅ Imagen 3 works! Size: ${buffer.length} bytes`);
        console.log(`   📁 Saved to: ${outPath}`);
        imageFound = true;
      }
    }

    if (!imageFound) {
      console.log('   ⚠️  No image in Imagen 3 response');
    }
  } catch (err: any) {
    console.log(`   ❌ Imagen 3 error: ${err.message?.substring(0, 200)}`);
  }

  // --- Test 3: Gemini 2.5 Flash text-only (baseline) ---
  console.log('\n📝 Test 3: Gemini 2.5 Flash text (baseline check)...');
  try {
    const textModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await textModel.generateContent('Say "hello" in Vietnamese, one word only');
    console.log(`   ✅ Text model works: "${result.response.text().trim()}"`);
  } catch (err: any) {
    console.log(`   ❌ Text model error: ${err.message}`);
  }

  console.log('\n🏁 Done! Check results above.');
}

testImageGeneration().catch(console.error);
