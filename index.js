require('dotenv').config();
const Database = require('./db');
const RSSParser = require('./rssParser'); // you must define this separately
const http = require('http');

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

// HTTP server for healthcheck + status
const server = http.createServer(async (req, res) => {
  if (req.url === '/healthcheck') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: harvester.isRunning ? 'running' : 'stopped',
      feeds: harvester.feeds.length,
      intervalSeconds: harvester.interval / 1000
    }));
  } else if (req.url === '/status') {
    try {
      const status = await harvester.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch status' }));
    }
  } else if (req.url === '/titles') {
    try {
      const items = await harvester.db.collection.find({}, { 
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formattedItems));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch titles' }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Healthcheck server listening on port ${PORT}`);
});

// Start harvester
harvester.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
