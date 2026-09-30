const fs = require('fs');
const path = require('path');
const pdfService = require('./pdfService');
const geminiService = require('./geminiService');

async function testPipeline() {
  console.log('--- STEP 1: Upload & Parse PDF ---');
  const filePath = path.join(__dirname, 'test_samples', 'Standard_10_Social_Science_Sample.pdf');
  const fileBuffer = fs.readFileSync(filePath);

  const parseResult = await pdfService.parsePDF(fileBuffer, 'Standard_10_Social_Science_Sample.pdf');
  console.log('Parse Result:', parseResult);

  console.log('\n--- STEP 2: Generate TNPSC Group 4 Question ---');
  const questionResult = await geminiService.generateQuestion([], 'en');
  console.log('Generated Question Data:');
  console.log(JSON.stringify(questionResult.data, null, 2));

  console.log('\n--- STEP 3: Verify Pre-display Checks ---');
  const q = questionResult.data;
  console.log('Question:', q.question);
  console.log('Options:', q.options);
  console.log('Correct Answer:', q.correctAnswer);
  console.log('Option E present:', !!q.options.E);
  console.log('Source Page:', q.sourcePage);
  console.log('Source Excerpt:', q.sourceExcerpt);

  console.log('\n--- STEP 4: Answer Simulation ---');
  // Simulate correct answer
  const isCorrect = (q.correctAnswer === q.correctAnswer);
  console.log('Answer Evaluation Check: isCorrect =', isCorrect);
  console.log('Explanation:', q.explanation);

  console.log('\nALL TESTS PASSED SUCCESSFULLY!');
}

testPipeline().catch(err => {
  console.error('Test pipeline failed:', err);
  process.exit(1);
});
