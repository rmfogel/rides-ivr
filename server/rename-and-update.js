// Script to rename anygender to anygender and add children support
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'src', 'engine', 'matching.js');
let content = fs.readFileSync(filePath, 'utf8');

// First, rename all occurrences of anygender to anygender
content = content.replaceAll('anygender', 'anygender');
content = content.replaceAll('allocated_anygender', 'allocated_anygender');
content = content.replaceAll('seats_anygender', 'seats_anygender');

// Now add children support
// 1. Update comment
content = content.replace(
  '// seats: { male_only, female_only, anygender }  // need: { couples, males, females }',
  '// seats: { male_only, female_only, anygender }  // need: { couples, males, females, children }'
);

// 2. Update res to include allocated_children
content = content.replace(
  'const res = { allocated_couples: 0, allocated_male: 0, allocated_female: 0, allocated_anygender: 0 };',
  'const res = { allocated_couples: 0, allocated_male: 0, allocated_female: 0, allocated_anygender: 0, allocated_children: 0 };'
);

// 3. Add tryAllocChild function after tryAllocFemale
const tryAllocFemaleEnd = `  const tryAllocFemale = () => {
    if (s.female_only > 0) { s.female_only--; res.allocated_female++; return true; }
    if (s.anygender > 0) { s.anygender--; res.allocated_anygender++; return true; }
    return false;
  };`;

const tryAllocFemaleWithChild = `  const tryAllocFemale = () => {
    if (s.female_only > 0) { s.female_only--; res.allocated_female++; return true; }
    if (s.anygender > 0) { s.anygender--; res.allocated_anygender++; return true; }
    return false;
  };

  const tryAllocChild = () => {
    // Children can take any seat type - try in order of preference
    if (s.anygender > 0) { s.anygender--; res.allocated_children++; return true; }
    if (s.male_only > 0) { s.male_only--; res.allocated_children++; return true; }
    if (s.female_only > 0) { s.female_only--; res.allocated_children++; return true; }
    return false;
  };`;

content = content.replace(tryAllocFemaleEnd, tryAllocFemaleWithChild);

// 4. Add children allocation in "together" section
content = content.replace(
  `for (let i=0;i<n.females && ok;i++) { if (!tryAllocFemale()) { ok = false; break; } }
    if (!ok) return { ok: false };`,
  `for (let i=0;i<n.females && ok;i++) { if (!tryAllocFemale()) { ok = false; break; } }
    for (let i=0;i<(n.children||0) && ok;i++) { if (!tryAllocChild()) { ok = false; break; } }
    if (!ok) return { ok: false };`
);

// 5. Add children allocation in "not together" section
content = content.replace(
  `while (n.males > 0 && tryAllocMale()) n.males--;
  while (n.females > 0 && tryAllocFemale()) n.females--;
  const covered = (n.couples===0 && n.males===0 && n.females===0);`,
  `while (n.males > 0 && tryAllocMale()) n.males--;
  while (n.females > 0 && tryAllocFemale()) n.females--;
  while ((n.children||0) > 0 && tryAllocChild()) n.children--;
  const covered = (n.couples===0 && n.males===0 && n.females===0 && (n.children||0)===0);`
);

// 6. Update matchNewOffer - add children to need
content = content.replace(
  'const need = { couples: r.couples_count||0, males: r.passengers_male||0, females: r.passengers_female||0 };',
  'const need = { couples: r.couples_count||0, males: r.passengers_male||0, females: r.passengers_female||0, children: r.children_count||0 };'
);

// 7. Update matchNewRequest - add children to remaining
content = content.replace(
  'let remaining = { couples: request.couples_count||0, males: request.passengers_male||0, females: request.passengers_female||0 };',
  'let remaining = { couples: request.couples_count||0, males: request.passengers_male||0, females: request.passengers_female||0, children: request.children_count||0 };'
);

// 8. Update remainingTotal function
content = content.replace(
  'const remainingTotal = () => remaining.couples * 2 + remaining.males + remaining.females;',
  'const remainingTotal = () => remaining.couples * 2 + remaining.males + remaining.females + (remaining.children||0);'
);

// 9. Update matchNewRequest logging - need object
content = content.replace(
  `need: {
      couples: request.couples_count||0,
      males: request.passengers_male||0,
      females: request.passengers_female||0
    },`,
  `need: {
      couples: request.couples_count||0,
      males: request.passengers_male||0,
      females: request.passengers_female||0,
      children: request.children_count||0
    },`
);

// Write the updated content
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ matching.js updated: anygender → anygender + children support added!');
