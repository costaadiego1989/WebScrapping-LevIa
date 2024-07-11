const express = require('express');
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const app = express();
const PORT = 3009;

app.get('/', (req, res) => {
    res.send({aviso: "acesse a rota /search e não esqueça de passar o parâmetro keyword."});
});

app.get('/search', async (req, res) => {
    const keyword = req.query.keyword;
    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 10;

    if (!keyword) {
        return res.status(400).json({ error: 'É necessário enviar o parâmetro Keyword.' });
    }

    try {
        const result = await scrapeGoogleShopping(keyword, page, itemsPerPage);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ocorreu um erro ao fazer o Scrapping: ' + error.message });
    }
});

async function scrapeGoogleShopping(keyword, page, itemsPerPage) {
    const start = (page - 1) * itemsPerPage;
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=shop&start=${start}&gl=br&hl=pt-BR`;

    let driver;

    try {
        const options = new chrome.Options();
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--window-size=1920,1080');
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments(`user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * (108 - 70) + 70)}.0.0.0 Safari/537.36`);

        driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

        await driver.get(url);
        await driver.sleep(5000); // Espera inicial

        // Scroll para carregar mais conteúdo
        for(let i = 0; i < 3; i++) {
            await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
            await driver.sleep(2000);
        }

        const products = [];
        let productElements;

        try {
            productElements = await driver.wait(until.elementsLocated(By.css('.sh-dgr__content')), 20000);
        } catch (error) {
            console.log('Não foi possível encontrar .sh-dgr__content, tentando alternativa...');
            productElements = await driver.wait(until.elementsLocated(By.css('.sh-dlr__list-result')), 20000);
        }

        for (let i = 0; i < Math.min(itemsPerPage, productElements.length); i++) {
            const element = productElements[i];
            try {
                const title = await element.findElement(By.css('.tAxDx, .EI11Pd')).getText();
                const price = await element.findElement(By.css('.a8Pemb, .QIrs8')).getText();
                let seller = 'Não disponível';
                try {
                    seller = await element.findElement(By.css('.aULzUe, .IuHnof')).getText();
                } catch (sellerError) {
                    console.log('Vendedor não encontrado para este produto');
                }
                
                let image = '';
                try {
                    const imageElement = await element.findElement(By.css('img'));
                    image = await imageElement.getAttribute('src');
                } catch (imgError) {
                    console.log('Imagem não encontrada para este produto');
                }

                let link = await element.findElement(By.css('a')).getAttribute('href');

                if (link && !link.startsWith('http')) {
                    link = 'https://www.google.com' + link;
                }

                if (title) {
                    products.push({
                        title,
                        price,
                        seller,
                        imageUrl: image,
                        link
                    });
                }
            } catch (error) {
                console.error(`Erro ao extrair produto: ${error.message}`);
            }
        }

        let totalResults = 'Não disponível';
        try {
            const resultStats = await driver.findElement(By.css('#result-stats, .sh-dr__count')).getText();
            const match = resultStats.match(/Aproximadamente (.+?) resultados/);
            if (match) {
                totalResults = match[1];
            } else {
                totalResults = resultStats;
            }
        } catch (error) {
            console.error(`Erro ao extrair total de resultados: ${error.message}`);
        }

        return {
            metadata: {
                keyword,
                page,
                itemsPerPage,
                totalResults,
            },
            products: products
        };
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
}

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});