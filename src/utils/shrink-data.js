const fs = require('fs');
const path = require('path');

// Adjust input/output paths as needed
const INPUT_FILE = path.join(__dirname, 'data.json');
const OUTPUT_FILE = path.join(__dirname, 'shrinked.json');

// only matches if the WHOLE transcript is “[inaudible]” or “(laughter)”, etc.
const DROP_REGEX = /^\s*[\[\(]\s*(?:inaudible|laughter)\s*[\]\)]\.?\s*$/i;

// Read the large JSON file
fs.readFile(INPUT_FILE, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading data.json:', err);
    process.exit(1);
  }

  let items;
  try {
    items = JSON.parse(data);
  } catch (parseErr) {
    console.error('Error parsing JSON:', parseErr);
    process.exit(1);
  }

  // Filter and map
  const shrunk = items
    .filter(item => {
      const t = item.media_transcript;
      // Drop if transcript matches inaudible or laughter
      return !(typeof t === 'string' && DROP_REGEX.test(t));
    })
    .map(item => ({
      text:      item.media_transcript,
      startTime: Math.floor(item.media_start_seconds / 1000),
      endTime:   Math.floor(item.media_end_seconds / 1000),
      youtubeId: item.media_youtube_id,
      title:     item.media_youtube_title,
      id:        item.media_index,
    }));

  // Write the shrunk JSON
  fs.writeFile(OUTPUT_FILE, JSON.stringify(shrunk, null, 2), 'utf8', writeErr => {
    if (writeErr) {
      console.error('Error writing shrinked.json:', writeErr);
      process.exit(1);
    }
    console.log(`Successfully wrote ${shrunk.length} entries to shrinked.json`);
  });
});
