const { MongoClient } = require('mongodb');

class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async connect() {
    try {
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.DB_NAME || 'rss_harvest';
      const collectionName = process.env.COLLECTION_NAME || 'rss_items';

      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db(dbName);
      this.collection = this.db.collection(collectionName);
      
      await this.collection.createIndex({ guid: 1 }, { unique: true });
      await this.collection.createIndex({ link: 1 }, { unique: true });
      
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async saveItem(item) {
    try {
      const result = await this.collection.insertOne({
        ...item,
        createdAt: new Date()
      });
      console.log(`Saved new item: ${item.title}`);
      return result;
    } catch (error) {
      if (error.code === 11000) {
        console.log(`Item already exists: ${item.title}`);
        return null;
      }
      throw error;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('MongoDB connection closed');
    }
  }
}

module.exports = Database;