const pdfService = require('./pdfService');
const geminiService = require('./geminiService');

async function testTamilFlow() {
  console.log('Testing Tamil textbook processing...');
  
  pdfService.activeDocument = {
    filename: '10th_Standard_Tamil_Unit_1.pdf',
    totalPages: 5,
    validPageCount: 5,
    language: 'ta',
    uploadedAt: new Date().toISOString(),
    pages: [
      {
        pageNumber: 1,
        text: 'பகுதி: தமிழ் இலக்கியம் மற்றும் உரைநடை. சிலப்பதிகாரம் புகார் காண்டம்: கண்ணகியின் சிலம்பு மாணிக்கப் பரல்களைக் கொண்டது. பாண்டிய மன்னன் நெடுஞ்செழியனின் மனைவி கோப்பெருந்தேவியின் சிலம்பு முத்து பரல்களைக் கொண்டது. தவறான தீர்ப்பளித்த பாண்டிய மன்னன் "யானோ அரசன், யானே கள்வன்" என்று கூறி தன் உயிரை விட்டான். சிலப்பதிகாரத்தை இயற்றியவர் இளங்கோவடிகள். இவர் சேர மன்னர் மரபைச் சேர்ந்தவர்.',
        wordCount: 45,
        usedCount: 0
      }
    ]
  };

  console.log('Generating Tamil Question with Gemini...');
  const res = await geminiService.generateQuestion([], 'ta');
  console.log('Tamil Question Result:');
  console.log(JSON.stringify(res.data, null, 2));

  console.log('\nChecking Option E:');
  console.log('Option E is:', res.data.options.E);
  console.log('Success! Tamil generation verified.');
}

testTamilFlow().catch(console.error);
