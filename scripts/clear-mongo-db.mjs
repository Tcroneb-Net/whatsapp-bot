#!/usr/bin/env node

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://thelastcroneb_db_user:ThxAi@thxai.c1oeccy.mongodb.net/?appName=ThxAi';
const MONGODB_DB = process.env.MONGODB_DB || 'Hostify';

async function clearDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db(MONGODB_DB);
    const collections = await db.listCollections().toArray();
    
    console.log(`\nFound ${collections.length} collection(s) to clear:`);
    
    for (const collection of collections) {
      const collectionName = collection.name;
      console.log(`  - ${collectionName}`);
      
      const result = await db.collection(collectionName).deleteMany({});
      console.log(`    Deleted ${result.deletedCount} documents`);
    }
    
    console.log('\n✓ Database cleared successfully');
    console.log('\nCollections cleared:');
    console.log('  - bots (all bot configurations)');
    console.log('  - auth_state (all WhatsApp sessions)');
    
    console.log('\n✓ Ready to start bot from fresh state');
    
  } catch (error) {
    console.error('✗ Error clearing database:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✓ MongoDB connection closed');
  }
}

clearDatabase();
