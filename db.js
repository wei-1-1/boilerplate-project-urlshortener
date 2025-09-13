const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI || "mongodb+srv://<mongodb_user>:<mongodb_passwd>@learn.ikedqag.mongodb.net/?retryWrites=true&w=majority&appName=Learn"; // 用 env 更好

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;

/**
 * 连接 DB
 */
async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        db = client.db("Learn");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        throw error;
    }
}

/**
 * 检查 or 创建 collection，并添加索引
 */
async function checkOrCreateCollection(collectionName) {
    try {
        const collections = await db.listCollections().toArray();
        const collectionExists = collections.some(col => col.name === collectionName);
        if (!collectionExists) {
            await db.createCollection(collectionName);
            console.log(`Collection '${collectionName}' created.`);
        } else {
            console.log(`Collection '${collectionName}' already exists.`);
        }

        // 创建唯一索引
        const collection = db.collection(collectionName);
        await collection.createIndex({ shortUrl: 1 }, { unique: true });
        await collection.createIndex({ originalUrl: 1 }, { unique: true });
        console.log(`Indexes created for '${collectionName}'.`);

        return true;
    } catch (error) {
        console.error(`Error checking/creating collection '${collectionName}':`, error);
        return false;
    }
}

/**
 * 存储 shortUrl 和 originalUrl 的映射
 * @returns {string|null} - 成功返回 shortUrl ，失败返回 null
 */
async function storeUrlMapping(collectionName, shortUrl, originalUrl) {
    try {
        const collection = db.collection(collectionName);
        const existingDoc = await collection.findOne({ originalUrl: originalUrl });
        if (existingDoc) {
            console.log(`Short URL '${existingDoc.shortUrl}' already exists for: ${originalUrl}`);
            return existingDoc.shortUrl; // 返回现有 shortUrl
        }

        // 插入新记录
        const result = await collection.insertOne({
            shortUrl: shortUrl,
            originalUrl: originalUrl,
        });
        console.log(`Inserted document with _id: ${result.insertedId}`);
        return shortUrl;
    } catch (err) {
        // 如果是唯一索引冲突
        if (err.code === 11000) {
            console.error(`Duplicate shortUrl '${shortUrl}' detected.`);
        } else {
            console.error(`Error storing URL mapping for shortUrl '${shortUrl}':`, err);
        }
        return null;
    }
}

/**
 * 根据 shortUrl 查询 originalUrl
 */
async function getOriginalUrl(collectionName, shortUrl) {
    try {
        const collection = db.collection(collectionName);
        const document = await collection.findOne({ shortUrl: shortUrl });
        return document ? document.originalUrl : null;
    } catch (err) {
        console.error(`Error finding original URL for shortUrl '${shortUrl}':`, err);
        return null;
    }
}

/**
 * 根据 originalUrl 查询 shortUrl
 */
async function getShortUrl(collectionName, originalUrl) {
    try {
        const collection = db.collection(collectionName);
        const document = await collection.findOne({ originalUrl: originalUrl });
        return document ? document.shortUrl : null;
    } catch (err) {
        console.error(`Error finding shortUrl for originalUrl '${originalUrl}':`, err);
        return null;
    }
}

/**
 * 初始化 currentId，从 DB 找最大 shortUrl +1
 * @returns {Promise<number>} - 初始化后的 currentId
 */
async function initializeCurrentId(collectionName) {
    try {
        const collection = db.collection(collectionName);
        const maxDoc = await collection.find({}).sort({ shortUrl: -1 }).limit(1).toArray();
        if (maxDoc.length > 0) {
            const maxShort = parseInt(maxDoc[0].shortUrl, 10);
            return maxShort + 1;
        }
        return 1; // 空集合从 1 开始
    } catch (err) {
        console.error('Error initializing currentId:', err);
        return 1; // 失败默认 1
    }
}

module.exports = {
    connectDB,
    checkOrCreateCollection,
    storeUrlMapping,
    getOriginalUrl,
    getShortUrl,
    initializeCurrentId
};
