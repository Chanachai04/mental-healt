import { useState, useRef, useEffect } from "react";
import { Search, Hash, Loader2, ChartLine } from "lucide-react";

function HomePage() {
  const [keyword, setKeyword] = useState("");
  // intervalMin now controls the frequency of search (every X minutes)
  const [intervalMin, setIntervalMin] = useState(5);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [allResults, setAllResults] = useState([]);
  const [message, setMessage] = useState({ text: "", type: "" }); // State for displaying messages
  const baseSearchAmount = 10;
  const [searchLimit, setSearchLimit] = useState(baseSearchAmount); // New state for increasing search limit

  const allResultsRef = useRef([]); // Ref to hold all results for the current session
  const uniquePostIdsRef = useRef(new Set()); // Ref to store unique identifiers (e.g., platform-url)
  const intervalIdRef = useRef(null); // Ref to hold the interval ID for clearing
  const messageTimeoutRef = useRef(null); // Ref to clear message timeout

  const platforms = ["instagram", "twitter", "tiktok"];
  // const platforms = ["facebook", "instagram", "twitter", "tiktok"];

  // Helper function to display messages in the UI
  const displayMessage = (text, type = "info") => {
    setMessage({ text, type });
    // Clear any existing message timeout
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    // Set a new timeout to clear the message after 5 seconds
    messageTimeoutRef.current = setTimeout(() => {
      setMessage({ text: "", type: "" });
    }, 5000);
  };

  // Effect to clear message timeout on unmount
  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Generates a unique ID for a post.
   * Prioritizes baseurl for uniqueness, falls back to a combination of platform, username, and caption.
   * @param {Object} post - The post object.
   * @returns {string} A unique identifier string for the post.
   */
  const getUniquePostId = (post) => {
    // If baseurl exists, it's the most reliable unique identifier.
    if (post.baseurl) {
      return `${post.platform}-${post.baseurl}`;
    }
    // Fallback for posts without a reliable URL: combine platform, username, and caption.
    // This is less robust but better than nothing for uniqueness.
    return `${post.platform}-${post.username}-${post.caption}`;
  };

  /**
   * Starts the continuous search process.
   * Calls doSearch immediately and then sets up an interval for repeated searches.
   */
  const startSearch = () => {
    if (!keyword.trim()) {
      displayMessage("Please enter a search keyword.", "error");
      return;
    }

    // Reset uniquePostIds for a new search session
    uniquePostIdsRef.current.clear();
    setAllResults([]); // Clear previous results display
    allResultsRef.current = []; // Clear previous results in ref
    setSearchLimit(baseSearchAmount); // Reset search limit when starting a new search

    setIsSearching(true);
    displayMessage("Starting search...", "info");
    doSearch(); // Perform an initial search immediately

    // Set up an interval to perform the search every 'intervalMin' minutes
    // The search will continue until explicitly stopped by the user.
    intervalIdRef.current = setInterval(doSearch, intervalMin * 60 * 1000);
  };

  /**
   * Stops the continuous search process.
   * Clears the interval and attempts to save collected unique data.
   */
  const stopSearch = async () => {
    setIsSearching(false);
    displayMessage("Stopping search...", "info");

    // Clear the interval if it's running
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    // Give a brief moment for any ongoing fetches/saves to potentially finish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Data has been saved incrementally by doSearch.
    // Just clear the states for the next session.
    if (allResultsRef.current.length > 0) {
      displayMessage(
        `Search stopped. ${allResultsRef.current.length} unique items were collected and saved during this session.`,
        "success"
      );
    } else {
      displayMessage(
        "Search stopped. No new unique data was found or saved during this session.",
        "info"
      );
    }
    setAllResults([]); // Clear displayed results
    allResultsRef.current = []; // Clear ref for next session
    uniquePostIdsRef.current.clear(); // Clear unique IDs for next session
  };

  /**
   * Performs the actual search operation across all defined platforms.
   * Fetches data, filters for uniqueness, and updates the results state.
   * Posts are saved to the API as soon as they are found to be unique.
   */
  const doSearch = async () => {
    if (!keyword.trim()) {
      displayMessage("Search keyword is empty. Stopping search.", "error");
      stopSearch();
      return;
    }

    setLoading(true); // Indicate loading state for the search operation
    let newlyFoundUniqueResults = [];

    try {
      const fetchPromises = platforms.map(async (platform) => {
        // Fetch data from each platform's API endpoint
        const res = await fetch(
          `http://localhost:3000/api/${platform}/search?q=${encodeURIComponent(
            keyword
          )}&limit=${searchLimit}` // Use the increasing searchLimit
        );
        const data = await res.json();

        // Map the received data to a consistent structure
        const results = (data.results || []).map((r) => ({
          username: r.username || "anonymous",
          caption: r.caption || "",
          platform,
          baseurl: r.postUrl || r.videoUrl || "",
        }));

        return results;
      });

      // Wait for all platform fetches to complete
      const allPlatformResults = await Promise.all(fetchPromises);
      // Flatten the array of arrays into a single array of results
      const mergedResults = allPlatformResults.flat();

      // Filter for unique results before adding to state and ref
      mergedResults.forEach((result) => {
        const uniqueId = getUniquePostId(result);
        if (!uniquePostIdsRef.current.has(uniqueId)) {
          uniquePostIdsRef.current.add(uniqueId);
          newlyFoundUniqueResults.push(result);
        }
      });

      // Only update and save if new unique results were found
      if (newlyFoundUniqueResults.length > 0) {
        setAllResults((prev) => [...prev, ...newlyFoundUniqueResults]);
        allResultsRef.current = [
          ...allResultsRef.current,
          ...newlyFoundUniqueResults,
        ];

        let savedNewlyFoundCount = 0;
        for (const result of newlyFoundUniqueResults) {
          try {
            // Attempt to save each newly found unique post immediately
            const response = await fetch(
              "http://119.59.118.120:3000/api/save",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result),
              }
            );

            if (response.ok) {
              savedNewlyFoundCount++;
            } else {
              console.error(
                "Failed to save newly found post:",
                await response.text()
              );
            }
          } catch (saveError) {
            console.error("Error saving newly found post:", saveError);
          }
        }
        displayMessage(
          `Found ${newlyFoundUniqueResults.length} new unique posts and saved ${savedNewlyFoundCount}. Total unique posts this session: ${allResultsRef.current.length}`,
          "success"
        );
      } else {
        displayMessage("No new unique posts found in this interval.", "info");
      }
    } catch (err) {
      console.error("Search error:", err);
      displayMessage("Error during search: " + err.message, "error");
      // Consider stopping search if a critical error occurs consistently
      // stopSearch();
    } finally {
      setLoading(false); // End loading state
      // Increment the search limit for the next loop
      setSearchLimit((prevLimit) => prevLimit + prevLimit);
    }
  };

  /**
   * Handles the click event on the main search/stop button.
   * Toggles between starting and stopping the search.
   */
  const handleSearchClick = () => {
    if (isSearching) {
      stopSearch();
    } else {
      startSearch();
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center justify-center my-8 text-center">
        <img
          src="/images/Mahidol_U.png"
          alt="Mahidol University"
          className="w-[100px] sm:w-[150px] h-[100px] sm:h-[150px]"
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mt-2">
          Mahidol University
        </h1>
        <p className="text-base sm:text-xl text-gray-600 mt-2 ">
          Application of Natural Language Processing to Study the Impact of
          Social Media on Mental Health in Children And Adolescents
        </p>
      </div>

      <div className="w-full max-w-2xl mx-auto">
        <div className=" space-y-6 bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-200">
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
            Social Media Searcher
          </h1>

          {/* Message Display Area */}
          {message.text && (
            <div
              className={`mt-4 p-3 rounded-xl text-center font-medium ${
                message.type === "error"
                  ? "bg-red-100 text-red-700"
                  : message.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div>
            <label
              htmlFor="keyword-input"
              className="mb-1 font-semibold text-gray-700 flex items-center gap-2"
            >
              <Hash className="w-4 h-4" />
              Keyword
            </label>
            <input
              id="keyword-input"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full border px-4 py-3 rounded-xl border-gray-200 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g., #AI, new product launch"
              disabled={isSearching} /* Disable input while searching */
            />
          </div>

          <div>
            <label
              htmlFor="interval-input"
              className="block mb-1 font-semibold text-gray-700"
            >
              Search Frequency (minutes)
            </label>
            <input
              id="interval-input"
              type="number"
              min={1} // Minimum interval of 1 minute
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
              className="w-full border px-4 py-3 rounded-xl border-gray-200 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isSearching} /* Disable input while searching */
            />
          </div>

          <button
            onClick={handleSearchClick}
            className={`w-full py-3 font-semibold text-white rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 
            ${
              isSearching
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            }
            ${loading ? "opacity-70 cursor-not-allowed" : ""}
          `}
            disabled={loading} // Disable button when loading to prevent multiple clicks
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching...
              </>
            ) : isSearching ? (
              "Stop Search"
            ) : (
              <>
                <Search className="w-5 h-5" />
                Start Search
              </>
            )}
          </button>

          <a
            href="http://119.59.118.120:5050/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 font-semibold text-white rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <ChartLine /> Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
