const fs = require('fs');
const content = fs.readFileSync('app/book/index.tsx', 'utf-8');
const lines = content.split('\n');

const issues = [];
let braceCount = 0, parenCount = 0, bracketCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const ch of line) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (ch === '(') parenCount++;
    if (ch === ')') parenCount--;
    if (ch === '[') bracketCount++;
    if (ch === ']') bracketCount--;
  }
}

if (braceCount !== 0) issues.push('Unbalanced braces: ' + braceCount);
if (parenCount !== 0) issues.push('Unbalanced parens: ' + parenCount);
if (bracketCount !== 0) issues.push('Unbalanced brackets: ' + bracketCount);

// Check for FileSystem import
if (content.includes('FileSystem.getInfoAsync')) {
  if (!content.includes("import * as FileSystem from 'expo-file-system'")) {
    issues.push('FileSystem used but not imported');
  }
}

if (issues.length > 0) {
  console.log('ISSUES FOUND:');
  issues.forEach(i => console.log('- ' + i));
} else {
  console.log('OK - No basic issues found');
}
console.log('Braces: ' + braceCount + ', Parens: ' + parenCount + ', Brackets: ' + bracketCount);
console.log('Lines: ' + lines.length);
