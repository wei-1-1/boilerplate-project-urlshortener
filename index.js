require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, checkOrCreateCollection, storeUrlMapping, getOriginalUrl, getShortUrl, initializeCurrentId } = require("./db.js");
const dns = require('dns');
const urlParser = require('url');

const app = express();
const port = process.env.PORT || 3000;
const COLLECTION_NAME = 'urlMappings';

// 一些默认的中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(`${process.cwd()}/public`));

// 根路由
app.get('/', (req, res) => {
    res.sendFile(`${process.cwd()}/views/index.html`);
});

// 一个全局的 currentId，用于发号器，但是会在连接到 DB 时重新获得值，
let currentId = 1;

/**
 * 生成短网址
 */
function generateShortUrl() {
    const shortUrl = currentId.toString().padStart(9, '0');
    currentId++;
    return shortUrl;
}

/**
 * 短网址转换中间件
 */
const shortUrlConverterMiddleware = async (req, res) => {
    let originalUrl = req.body.url
    if (!originalUrl) {
        return res.status(400).json({ error: 'Missing url in request body.' });
    }


    /*URL 格式验证，注意不要使用正则进行文本匹配
        freeCode camp 给出 http://www.example.com 例子表示它是应该是合法的 URL ，而不是严格的文本结构。
        否则，包含端口、路径或者子域名的地址都无法被识别为正常的 URL
    */
    let hostname = urlParser.parse(originalUrl).hostname;
    dns.lookup(hostname, (err, address) => {
        if (err) {
            return res.json({error: 'invalid url'});
        }
    })

    const parsedUrl = new URL(originalUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.json({ error: 'invalid url' });
    }


    try {
        // 先查是否存在
        const existingShortUrl = await getShortUrl(COLLECTION_NAME, originalUrl);
        if (existingShortUrl) {
            return res.status(200).json({
                original_url: originalUrl,
                short_url: existingShortUrl
            });
        }

        // 不存在，生成并存储新短码
        let shortUrl = generateShortUrl();
        const stored = await storeUrlMapping(COLLECTION_NAME, shortUrl, originalUrl);
        if (stored) {
            return res.status(200).json({
                original_url: originalUrl,
                short_url: shortUrl
            });
        } else {
            return res.status(500).json({ error: 'Failed to store URL mapping.' });
        }
    } catch (err) {
        console.error('Error in shortUrlConverter:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// POST 路由
app.post('/api/shorturl', shortUrlConverterMiddleware);

// GET 短网址重定向
app.get(/^\/api\/shorturl\/(\d+)$/, async (req, res) => {
    const shortCode = req.params[0];
    if (!/^\d{9}$/.test(shortCode)) {
        return res.status(400).json({ error: 'Invalid short code format. Must be 9 digits.' });
    }

    const originalUrl = await getOriginalUrl(COLLECTION_NAME, shortCode);
    if (originalUrl) {
        res.redirect(originalUrl);
    } else {
        res.status(404).json({ error: 'Short URL not found.' });
    }
});

// 启动服务器
async function startServer() {
    try {
        await connectDB();
        await checkOrCreateCollection(COLLECTION_NAME);
        currentId = await initializeCurrentId(COLLECTION_NAME); // 从 DB 初始化 currentId
        console.log(`CurrentId initialized to: ${currentId}`);
        app.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    } catch (err) {
        console.error("ERROR: Could not connect to the database or initialize", err);
        process.exit(1);
    }
}

startServer();
