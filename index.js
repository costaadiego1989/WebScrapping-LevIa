const express = require('express');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const NodeCache = require('node-cache');
const http = require('http');

const server = http.createServer(app);
server.timeout = 300000;

const app = express();
const PORT = 3009;
const MAX_PRODUCTS = 50;
const CACHE_TTL = 600;

const cache = new NodeCache({ stdTTL: CACHE_TTL });
const driverPool = [];

async function getDriver() {
    if (driverPool.length > 0) {
        return driverPool.pop();
    }
    const options = new chrome.Options();
    options.addArguments('--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1920,1080');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments(`user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * (108 - 70) + 70)}.0.0.0 Safari/537.36`);
    return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

async function releaseDriver(driver) {
    if (driverPool.length < 5) {
        driverPool.push(driver);
    } else {
        await driver.quit();
    }
}

app.get('/', (req, res) => {
    res.send({aviso: "acesse a rota /search e não esqueça de passar o parâmetro keyword."});
});

app.get('/search', async (req, res) => {
    const { keyword, page = 1, itemsPerPage = 10 } = req.query;
    if (!keyword) {
        return res.status(400).json({ error: 'É necessário enviar o parâmetro Keyword.' });
    }

    const cacheKey = `${keyword}-${page}-${itemsPerPage}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        return res.json(cachedResult);
    }

    try {
        const result = await scrapeGoogleShopping(keyword, parseInt(page), parseInt(itemsPerPage));
        cache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ocorreu um erro ao fazer o Scrapping: ' + error.message });
    }
});

async function scrapeGoogleShopping(keyword, page, itemsPerPage) {
    const start = (page - 1) * itemsPerPage;
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=shop&start=${start}&gl=br&hl=pt-BR`;
    const driver = await getDriver();

    try {
        await driver.get(url);
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
        await driver.sleep(1000);

        const productElements = await driver.wait(until.elementsLocated(By.css('.sh-dgr__content, .sh-dlr__list-result')), 5000);
        const products = await Promise.all(productElements.slice(0, MAX_PRODUCTS).map(extractProductInfo));

        const totalResults = await extractTotalResults(driver);

        return {
            metadata: { keyword, page, itemsPerPage, totalResults },
            products: products.filter(p => p !== null)
        };
    } finally {
        await releaseDriver(driver);
    }
}

async function extractProductInfo(element) {
    try {
        const [title, price, seller, imageUrl, link] = await Promise.all([
            element.findElement(By.css('.tAxDx, .EI11Pd')).getText(),
            element.findElement(By.css('.a8Pemb')).getText(),
            element.findElement(By.css('.aULzUe, .IuHnof')).getText().catch(() => 'Não disponível'),
            element.findElement(By.css('img')).getAttribute('src'),
            element.findElement(By.css('a')).getAttribute('href')
        ]);

        return {
            title,
            price,
            seller,
            imageUrl,
            link: link.startsWith('http') ? link : 'https://www.google.com' + link
        };
    } catch (error) {
        console.error(`Erro ao extrair produto: ${error.message}`);
        return null;
    }
}

async function extractTotalResults(driver) {
    try {
        const resultStats = await driver.findElement(By.css('#result-stats, .sh-dr__count')).getText();
        const match = resultStats.match(/Aproximadamente (.+?) resultados/);
        return match ? match[1] : resultStats;
    } catch (error) {
        console.error(`Erro ao extrair total de resultados: ${error.message}`);
        return 'Não disponível';
    }
}

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: http://localhost:${PORT}`);
});

//Código feito por Diego Costa de Oliveira: (21)99300-1883. Utilizado Node.js com Selenium