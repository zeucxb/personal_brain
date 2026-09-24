import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/?directConnection=true';
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function ensureVectorIndex() {
  try {
    const client = await clientPromise;
    const db = client.db('ragchat');
    const collections = await db.listCollections({ name: 'documents' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('documents');
    }
    const collection = db.collection('documents');
    const indexes = await collection.listSearchIndexes().toArray();
    const hasVectorIndex = indexes.some((idx: any) => idx.name === 'vector_index');
    if (!hasVectorIndex) {
      await collection.createSearchIndex({
        name: 'vector_index',
        type: 'vectorSearch',
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: 768,
              similarity: 'cosine',
            },
            {
              type: 'filter',
              path: 'materia',
            },
          ],
        },
      });
    }
  } catch (error) {
    console.error('Error ensuring vector index:', error);
  }
}

export default clientPromise;
