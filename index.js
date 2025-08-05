require('dotenv').config();
const Database = require('./db');
const RSSParser = require('./rssParser'); // you must define this separately
const express = require('express');

class RSSHarvester {
  constructor() {
    this.db = new Database();
    this.parser = new RSSParser();
    this.feeds = process.env.RSS_FEEDS ? process.env.RSS_FEEDS.split(',') : [
      'https://www.bild.de/feed/alles.xml'
    ];
    this.interval = 30000;
    this.isRunning = false;
    this.lastCheckedAt = null;
  }

  async start() {
    try {
      await this.db.connect();
      this.isRunning = true;

      console.log(`Starting RSS harvester...`);
      console.log(`Monitoring ${this.feeds.length} feeds every ${this.interval / 1000} seconds`);

      await this.checkFeeds();

      this.intervalId = setInterval(async () => {
        if (this.isRunning) {
          await this.checkFeeds();
        }
      }, this.interval);

      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
    } catch (error) {
      console.error('Failed to start RSS harvester:', error);
      process.exit(1);
    }
  }

  async checkFeeds() {
    console.log('\n--- Checking RSS feeds ---');
    this.lastCheckedAt = new Date();

    for (const feedUrl of this.feeds) {
      try {
        const items = await this.parser.fetchFeed(feedUrl);
        let savedCount = 0;

        for (const item of items) {
          const result = await this.db.saveItem(item);
          if (result) {
            savedCount++;
          }
        }

        console.log(`${feedUrl}: ${savedCount} new items saved out of ${items.length} total`);
      } catch (error) {
        console.error(`Error processing feed ${feedUrl}:`, error.message);
      }
    }

    console.log('--- Feed check complete ---\n');
  }

  async getStatus() {
    const itemCount = await this.db.collection.countDocuments();
    return {
      status: this.isRunning ? 'running' : 'stopped',
      feeds: this.feeds.length,
      intervalSeconds: this.interval / 1000,
      lastCheckedAt: this.lastCheckedAt,
      itemsStored: itemCount
    };
  }

  async stop() {
    console.log('\nShutting down RSS harvester...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    await this.db.close();
    process.exit(0);
  }
}

// Instantiate harvester
const harvester = new RSSHarvester();

// Express app
const app = express();

app.get('/healthcheck', (req, res) => {
  res.json({
    status: harvester.isRunning ? 'running' : 'stopped',
    feeds: harvester.feeds.length,
    intervalSeconds: harvester.interval / 1000
  });
});

app.get('/status', async (req, res) => {
  try {
    const status = await harvester.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

app.get('/titles', async (req, res) => {
  try {
    const { searchTitle, searchCat } = req.query;
    
    // Build MongoDB query with regex filters
    const query = {};
    if (searchTitle) {
      query.title = { $regex: searchTitle, $options: 'i' };
    }
    if (searchCat) {
      query.categories = { $regex: searchCat, $options: 'i' };
    }
    
    const items = await harvester.db.collection.find(query, { 
      projection: { 
        title: 1, 
        description: 1, 
        categories: 1, 
        pubDate: 1, 
        _id: 0 
      } 
    }).toArray();
    
    const formattedItems = items.map(item => ({
      title: item.title || '',
      description: item.description || '',
      categories: item.categories || [],
      pubDate: item.pubDate
    }));
    res.json(formattedItems);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch titles' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Start harvester
harvester.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
