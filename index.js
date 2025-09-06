const express = require('express')

const app = express()
const port = 3000
const cors = require("cors")
const puppeteer = require('puppeteer');
app.use(cors());

// Login credentials
const username = "a"
const password = "b"

async function getQuotes(pgnum) {
  const url = pgnum ? `https://quotes.toscrape.com/page/${pgnum}/` : `https://quotes.toscrape.com/`

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // If not logged in, click login link
  if (await page.$('a[href="/login"]')) {
    await page.click('a[href="/login"]');
    await page.waitForSelector('input[name="username"]');

    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);
    await page.click('input[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });
  }

  // Scrape quotes
  const quotes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".quote")).map((el) => ({
      text: el.querySelector(".text")?.innerText || "",
      author: el.querySelector(".author")?.innerText || "",
      tags: Array.from(el.querySelectorAll(".tags .tag")).map((t) => t.innerText),
    }));
  });

  // Throw an error if no quotes found, probably a change in the endpoint or service outage
  if (!quotes) {
    throw new Error("No quotes found on page.");
  }

  await browser.close();
  return quotes;
}

// In-memory cache
const cache = {};
let lastFetchTime = null;

const CACHE_TTL_MS = 120 * 60 * 1000;

app.get('/', async (req, res) => {
  const pg = parseInt(req.query.page)
  const cacheKey = `page-${pg}`;

  try {
    const now = Date.now();

    if (!(pg >= 1 && pg <= 10)) { throw new Error("Invalid page number") }

    // If no cache yet or cache expired -> fetch again
    if (
      !cache[cacheKey] ||
      now - cache[cacheKey].timestamp > CACHE_TTL_MS
    ) {
      console.log(`⏳ Fetching fresh quotes for ${pg}...`);
      const data = await getQuotes([pg]);
      cache[cacheKey] = { data, timestamp: now };
      lastFetchTime = now;
    } else {
      console.log(`✅ Returning cached quotes for ${pg}`);
    }

    res.json(cache[cacheKey].data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
