import { useState, useEffect, useCallback, useRef } from 'react';
//import data from '../utils/data.json';

function Search() {
  const [searchTerm, setSearchTerm] = useState('');
  const [subtitles, setSubtitles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [loadedResults, setLoadedResults] = useState([]);
  const [searchResults, setSearchResults] = useState([]);

  const batchSize = 9;
  const observerRef = useRef(null);

  // 1) Build a flat list of { text, startTime, youtubeId, ... } from data.json
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    import(
      /* webpackChunkName: "shrinked-data" */
      /* webpackMode: "lazy" */
      '../data/shrinked.json'
    )
      .then(mod => {
        if (!mounted) return;
        // CRA puts the JSON on `mod.default`
        const raw = mod.default || mod;
        const flat = raw.map(item => ({
          text: item.text,
          startTime: item.startTime,
          endTime: item.endTime,
          youtubeId: item.youtubeId,
          title: item.title,
          id: item.id,
        }));
        setSubtitles(flat);
      })
      .catch(err => {
        console.error('Failed to load shrinked.json chunk:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);


  // 2) Search logic: full phrase → all keywords → any keyword (preserve your priorities)
  const performSearch = useCallback((term) => {
    if (!term || term.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const normalizedTerm = term.toLocaleLowerCase('tr');
    const keywords = normalizedTerm.split(/\s+/).filter(k => k.length >= 2);

    // 1) map → assign priority or null
    const mapped = subtitles.map(sub => {
      if (!sub.text) return null;

      const lowerText = sub.text.toLocaleLowerCase('tr');
      let priority = Infinity;

      if (lowerText.includes(normalizedTerm)) {
        priority = 1;
      } else if (keywords.every(k => lowerText.includes(k))) {
        priority = 2;
      } else if (keywords.some(k => lowerText.includes(k))) {
        const idxs = keywords
          .map((k, i) => lowerText.includes(k) ? i : Infinity)
          .filter(i => i !== Infinity);
        priority = 3 + Math.min(...idxs);
      }

      return { ...sub, matchPriority: priority };
    });

    // 2) drop nulls and non-matches
    const filtered = mapped
      .filter(r => r !== null && r.matchPriority !== Infinity);

    // 3) dedupe
    const seen = new Set();
    const unique = [];
    for (const r of filtered) {
      const tag = `${r.id}-${r.text}`;
      if (!seen.has(tag)) {
        seen.add(tag);
        unique.push(r);
      }
    }

    // 4) sort by priority
    unique.sort((a, b) => a.matchPriority - b.matchPriority);

    setSearchResults(unique);
  }, [subtitles]);

  // 3) Infinite scroll
  const lastSubtitleElementRef = useCallback(node => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting &&
        loadedResults.length < searchResults.length) {
        setLoadedResults(prev =>
          prev.concat(
            searchResults.slice(prev.length, prev.length + batchSize)
          )
        );
      }
    });
    if (node) observerRef.current.observe(node);
  }, [searchResults, loadedResults]);

  // 4) Highlighting (exact vs partial, with Turkish locale)
  const highlightText = (text, term) => {
    if (!term || term.trim().length < 2) return text;
    const lowerText = text.toLowerCase();
    const keywords = term.toLowerCase().split(/\s+/).filter(k => k.length >= 2);

    const isAlnum = ch => /[0-9A-Za-zğşıöçüİĞŞÖÇÜ]/.test(ch);
    const isExactMatch = (start, end) => {
      const leftOK = start === 0 || !isAlnum(text[start - 1]);
      const rightOK = end === text.length || !isAlnum(text[end]);
      return leftOK && rightOK;
    };

    // collect intervals
    let intervals = [];
    keywords.forEach(k => {
      let idx = 0;
      while ((idx = lowerText.indexOf(k, idx)) !== -1) {
        const end = idx + k.length;
        intervals.push({
          start: idx,
          end,
          type: isExactMatch(idx, end) ? 'exact' : 'partial'
        });
        idx = end;
      }
    });

    intervals.sort((a, b) => a.start - b.start);
    // merge overlaps, preferring any 'partial' tag
    const merged = [];
    intervals.forEach(iv => {
      if (!merged.length || iv.start > merged[merged.length - 1].end) {
        merged.push({ ...iv });
      } else {
        const last = merged[merged.length - 1];
        last.end = Math.max(last.end, iv.end);
        if (last.type === 'partial' || iv.type === 'partial') {
          last.type = 'partial';
        }
      }
    });

    // build React nodes
    const parts = [];
    let cursor = 0;
    merged.forEach((iv, i) => {
      if (iv.start > cursor) {
        parts.push(text.slice(cursor, iv.start));
      }
      parts.push(
        <span
          key={i}
          className={
            iv.type === 'exact'
              ? 'text-red-500 font-semibold'
              : 'text-purple-500 font-semibold'
          }
        >
          {text.slice(iv.start, iv.end)}
        </span>
      );
      cursor = iv.end;
    });
    if (cursor < text.length) {
      parts.push(text.slice(cursor));
    }
    return parts;
  };

  // 5) Format time helper unchanged
  const formatTime = seconds => {
    const sec = Math.floor(seconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:` +
        `${m.toString().padStart(2, '0')}:` +
        `${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:` +
      `${s.toString().padStart(2, '0')}`;
  };

  // 6) Open YouTube at the correct timestamp
  const handleSubtitleClick = sub => {
    const t = Math.floor(sub.startTime);
    window.open(
      `https://www.youtube.com/watch?v=${sub.youtubeId}&t=${t}s`,
      '_blank'
    );
  };

  // re-run search when term changes
  useEffect(() => {
    performSearch(searchTerm);
  }, [searchTerm, performSearch]);

  // reset loadedResults whenever results change
  useEffect(() => {
    setLoadedResults(searchResults.slice(0, batchSize));
  }, [searchResults]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <svg
          className="animate-spin mr-2 h-8 w-8 text-neutral-200"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 
             5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 
             7.938l3-2.647z"
          />
        </svg>
        <span className="text-neutral-200 select-none text-3xl">
          Loading...
        </span>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-gradient-to-r from-sky-500 to-cyan-500 flex flex-col fixed">
      <div className="max-w-4xl relative -translate-x-1/2 left-1/2 mt-1 md:mt-3">
        <div className="p-2 absolute top-0 left-0 right-0 flex space-x-3">
          <div className="w-full h-full relative ">
            <input
              type="text"
              placeholder="Search media recordings..."
              className=" w-full h-full z-20 text-xl md:text-3xl py-2 px-4 text-neutral-400 focus:text-neutral-100 bg-neutral-800 rounded-md border border-neutral-400 focus:outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}

            />
            <div className="absolute top-1 bottom-1 right-1 z-30 text-2xl md:text-4xl bg-neutral-800 text-sky-500 p-3 flex items-center justify-center">
              {searchResults.length > 0 && searchResults.length}
            </div>
          </div>
        </div>
      </div>

      <div className=" absolute top-16 md:top-24 bottom-2 left-0 right-0 flex justify-center">
        <div className="w-full h-full overflow-y-auto pb-5 md:pb-8 px-2 md:px-2.5">
          {searchTerm.trim() === '' ? (
            <div className="text-center text-neutral-900/50 md:text-2xl">Please enter the keyword(s) you want to search.</div>
          ) : loadedResults.length > 0 ? (
            <div className="flex flex-col space-y-5">
              {loadedResults.map((result, index) => {
                const bgClass =
                  result.matchPriority === 1
                    ? "bg-slate-50"
                    : result.matchPriority === 2
                      ? "bg-yellow-100"
                      : "bg-orange-100";

                return (
                  <div
                    ref={node => {
                      if (index === loadedResults.length - 1) {
                        lastSubtitleElementRef(node);
                      }
                    }}
                    key={`${result.id}-${result.startTime}`}
                    className={`${bgClass} rounded-md shadow-lg shadow-neutral-700/70 overflow-hidden cursor-pointer `}
                    onClick={() => handleSubtitleClick(result)}
                  >
                    <div className="flex flex-col md:flex-row">
                      <div className="flex flex-col grow w-full">
                        {result.title ? (
                          <div className="flex px-2 pt-2 select-none">
                            <div className="text-sm text-black font-semibold">
                              {result.title}
                            </div>
                          </div>
                        ) : (
                          <div className="text-md text-rose-400">
                            Video title could not be captured...
                          </div>
                        )}
                        <div className="flex flex-col grow p-2">
                          <div className="text-sm text-sky-600">
                            [{formatTime(result.startTime)} – {formatTime(result.endTime)}]
                          </div>
                          <div className="text-neutral-800 select-text">
                            {highlightText(result.text, searchTerm)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (
            <div className="text-center text-neutral-900/50 md:text-2xl ">No results found.</div>
          )}
        </div>
      </div>


    </div>
  );
}

export default Search;