const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createSampleTextbookPDF() {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Directory for sample PDFs
  const dir = path.join(__dirname, 'test_samples');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Page 1: Chapter 1 - Constitution of India & Fundamental Rights (Polity)
  const page1 = pdfDoc.addPage([595.28, 841.89]); // A4
  page1.drawText('STANDARD X - SOCIAL SCIENCE', { x: 50, y: 800, size: 10, font: timesRomanFont, color: rgb(0.4, 0.4, 0.4) });
  page1.drawText('UNIT 1: CONSTITUTION OF INDIA', { x: 50, y: 760, size: 16, font: timesBoldFont, color: rgb(0.1, 0.1, 0.5) });
  
  const textPage1 = `The Constitution of India was framed by the Constituent Assembly set up under the Cabinet Mission Plan, 1946.
The Constituent Assembly held its first meeting on December 9, 1946. Dr. Sachchidananda Sinha was elected as the temporary President of the Assembly.
After his demise, Dr. Rajendra Prasad was elected as the President of the Assembly, while H.C. Mukherjee and V.T. Krishnamachari were elected as Vice-Presidents.
The Assembly met for 11 sessions consisting of 166 days of meetings. The Drafting Committee under the chairmanship of Dr. B.R. Ambedkar drafted the Constitution.
Hence, Dr. B.R. Ambedkar is recognized as the 'Chief Architect of the Constitution of India'.

The Preamble to the Constitution of India was based on the 'Objective Resolution' drafted and introduced by Pandit Jawaharlal Nehru on December 13, 1946.
The Constitution of India was adopted on November 26, 1949, and it came into force on January 26, 1950.
This day is celebrated as Republic Day every year.

Part III of the Constitution deals with Fundamental Rights from Articles 12 to 35.
Originally, the Constitution provided for seven Fundamental Rights. At present, there are only six Fundamental Rights.
The Right to Property under Article 31 was deleted from the list of Fundamental Rights by the 44th Amendment Act of 1978.
It is now made a legal right under Article 300-A in Part XII of the Constitution.`;

  let y = 720;
  for (const line of textPage1.split('\n')) {
    if (line.trim().length > 0) {
      page1.drawText(line, { x: 50, y, size: 11, font: timesRomanFont, color: rgb(0.1, 0.1, 0.1) });
      y -= 18;
    } else {
      y -= 10;
    }
  }

  // Page 2: Chapter 2 - Indian National Movement & Tamil Nadu Freedom Struggle
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawText('STANDARD X - SOCIAL SCIENCE', { x: 50, y: 800, size: 10, font: timesRomanFont, color: rgb(0.4, 0.4, 0.4) });
  page2.drawText('UNIT 2: EARLY UPRISING AND ROLE OF TAMIL NADU IN FREEDOM STRUGGLE', { x: 50, y: 760, size: 14, font: timesBoldFont, color: rgb(0.1, 0.1, 0.5) });

  const textPage2 = `V.O. Chidambaranar was one of the foremost leaders of the Swadeshi Movement in Tamil Nadu.
In 1906, he established the Swadeshi Steam Navigation Company at Tuticorin.
He purchased two ships named S.S. Gallia and S.S. Lavo for navigation between Tuticorin and Colombo.
For his courageous efforts, he was honored with the title 'Kappalottiya Thamizhan' (The Tamil Helmsman).

Subramania Bharati was a patriotic poet who aroused nationalist feelings through his fiery patriotic songs in Tamil Nadu.
He served as the sub-editor of Swadesamitran in 1904. In 1907, he became the editor of the Tamil weekly 'India'.
Bharati attended the Surat Congress in 1907 along with other extremist leaders.

Vanchinathan was an Indian revolutionary from Sengottai.
On June 17, 1911, he shot dead Robert William d'Escourt Ashe, the Collector of Tirunelveli, at Maniyachi railway junction.
After shooting the Collector, Vanchinathan shot himself to avoid arrest.

Velu Nachiyar was the queen of Sivagangai. She was the first Indian queen to wage an armed war against the British East India Company.
With the military support of Haider Ali of Mysore and the assistance of the Marudhu brothers, she recaptured Sivagangai in 1780.
Her loyal female army commander Kuyili performed a suicide attack on the British ammunition depot to ensure victory.`;

  y = 720;
  for (const line of textPage2.split('\n')) {
    if (line.trim().length > 0) {
      page2.drawText(line, { x: 50, y, size: 11, font: timesRomanFont, color: rgb(0.1, 0.1, 0.1) });
      y -= 18;
    } else {
      y -= 10;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(dir, 'Standard_10_Social_Science_Sample.pdf');
  fs.writeFileSync(filePath, pdfBytes);
  console.log('Sample PDF created successfully at:', filePath);
}

createSampleTextbookPDF().catch(console.error);
