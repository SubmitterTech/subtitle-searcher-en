const fs = require('fs');
const path = require('path');

// Paths
const INPUT_FILE      = path.join(__dirname, 'data.json');
const OUTPUT_FILE     = path.join(__dirname, '../data/shrinked.json');
const EXCEPTIONS_FILE = path.join(__dirname, 'exclude.json');

// Utility: escape strings for use in regex
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

// Load exception phrases from exceptions.json (array of strings)
let exceptions;
try {
  const raw = fs.readFileSync(EXCEPTIONS_FILE, 'utf8');
  exceptions = JSON.parse(raw);
  if (!Array.isArray(exceptions)) {
    throw new Error('exceptions.json must contain an array of strings');
  }
} catch (err) {
  console.error('Error loading exceptions.json:', err.message);
  process.exit(1);
}

// Build a regex that matches a transcript consisting solely of any exception phrase,
// possibly wrapped in brackets/parentheses/angle-brackets with optional leading '>>' and trailing punctuation.
const pattern = exceptions.map(escapeRegex).join('|');
const DROP_REGEX = new RegExp(
  `^\\s*(?:>>\\s*)?[\\[\\(\\<]?\\s*(?:${pattern})\\s*[\\]\\)\\>]?\\s*[\\.,]?\\s*$`,
  'i'
);

// Read the large JSON file
fs.readFile(INPUT_FILE, 'utf8', (readErr, data) => {
  if (readErr) {
    console.error('Error reading data.json:', readErr.message);
    process.exit(1);
  }

  let items;
  try {
    items = JSON.parse(data);
  } catch (parseErr) {
    console.error('Error parsing data.json:', parseErr.message);
    process.exit(1);
  }

  // Filter out unwanted entries and shrink fields
  const shrunk = items
    .filter(item => {
      const t = item.media_transcript;
      // drop if transcript matches only an exception phrase
      return !(typeof t === 'string' && DROP_REGEX.test(t));
    })
    .map(item => ({
      text:      item.media_transcript,
      startTime: item.media_start_seconds / 1000,
      endTime:   item.media_end_seconds   / 1000,
      youtubeId: item.media_youtube_id,
      title:     item.media_youtube_title || null,
      id:        item.media_index
    }));

  // Write the shrunk JSON
  fs.writeFile(OUTPUT_FILE, JSON.stringify(shrunk, null, 2), 'utf8', writeErr => {
    if (writeErr) {
      console.error('Error writing shrinked.json:', writeErr.message);
      process.exit(1);
    }
    console.log(`Successfully wrote ${shrunk.length} entries to shrinked.json`);
  });
});
