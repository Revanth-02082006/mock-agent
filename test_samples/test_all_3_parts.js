const fs = require('fs');

async function testAllThreeParts() {
  console.log('--- Testing TNPSC Group 4 Practice Agent Across All 3 Parts ---');

  // 1. Upload sample document (using the TNPSC textbook/syllabus PDF)
  const pdfPath = 'C:/Users/Admin/.gemini/antigravity-ide/brain/d5d6cc3f-7572-4fc4-8fbb-1a29c77f7a22/.user_uploaded/media_1790740958235.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error('Test PDF not found at', pdfPath);
    return;
  }

  const fileBuffer = fs.readFileSync(pdfPath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('pdf', blob, 'TNPSC_Textbook_Source.pdf');

  console.log('Uploading PDF...');
  const uploadRes = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    body: formData
  });
  const uploadData = await uploadRes.json();
  console.log('Upload Result:', uploadData.success ? 'SUCCESS' : 'FAILED', uploadData.document?.readablePages, 'pages');

  const partsToTest = [
    { part: 'partA', label: 'Part A: General Science & General Studies' },
    { part: 'partB', label: 'Part B: Aptitude & Mental Ability' },
    { part: 'partC', label: 'Part C: Tamil Eligibility-cum-Scoring Test' }
  ];

  for (const item of partsToTest) {
    console.log(`\n========================================`);
    console.log(`Testing [${item.label}] (part: ${item.part})...`);
    console.log(`========================================`);

    const start = Date.now();
    const qRes = await fetch('http://localhost:3000/api/next-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part: item.part })
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    const qData = await qRes.json();

    if (!qRes.ok || !qData.success) {
      console.error(`FAILED to generate ${item.part}:`, qData.error);
      continue;
    }

    console.log(`Time taken: ${elapsed}s`);
    console.log(`Part Tag: ${qData.part} (code: ${qData.partCode})`);
    console.log(`Unit: ${qData.syllabusUnit}`);
    console.log(`Type: ${qData.questionType} | Difficulty: ${qData.difficulty} | Page: ${qData.sourcePage}`);
    console.log(`Question:\n${qData.question}`);
    console.log('Options:');
    Object.entries(qData.options).forEach(([k, v]) => console.log(`  ${k}) ${v}`));

    // Test Submit Answer
    const submitRes = await fetch('http://localhost:3000/api/submit-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedAnswer: 'A' })
    });
    const subData = await submitRes.json();
    console.log(`Answer evaluation: Result = ${subData.evaluation.result}, CorrectAnswer = ${subData.evaluation.correctAnswer}`);
    console.log(`Explanation: ${subData.evaluation.explanation}`);
  }

  // Check status
  const statRes = await fetch('http://localhost:3000/api/status');
  const statData = await statRes.json();
  console.log('\n--- Final Stats Breakdown by Part ---');
  console.log(JSON.stringify(statData.stats, null, 2));
}

testAllThreeParts().catch(console.error);
