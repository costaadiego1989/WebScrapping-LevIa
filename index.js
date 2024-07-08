const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
    res.send({aviso: "acesse a rota /search e não esqueça de passar o parâmetro keyword."})
});

app.get('/search', async (req, res) => {
  const keyword = req.query.keyword;
  const page = parseInt(req.query.page) || 1;
  const itemsPerPage = req.query.itemsPerPage || 10;

  if (!keyword) {
    return res.status(400).json({ error: 'É necessário enviar o parâmetro Keyword.' });
  }

  try {
    const result = await scrapeGoogleShopping(keyword, page, itemsPerPage);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Ocorreu um erro ao fazer o Scrapping' });
  }
});

async function scrapeGoogleShopping(keyword, page, itemsPerPage) {
  const start = (page - 1) * itemsPerPage;
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=shop&start=${start}`;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  const $ = cheerio.load(response.data);
  const products = [];

  $('.sh-dgr__content').each((index, element) => {
    const product = {
      title: $(element).find('.tAxDx').text().trim(),
      price: $(element).find('.a8Pemb').text().trim(),
      seller: $(element).find('.aULzUe').text().trim(),
      imageUrl: $(element).find('div > img').attr('src'),
      link: $(element).find('a.shntl').attr('href')
    };

    if (product.link && !product.link.startsWith('http')) {
      product.link = 'https://www.google.com' + product.link;
    }

    if (product.title) {
      products.push(product);
    }
  });

  let totalResults = '';
  const resultStats = $('#result-stats').text().trim();
  if (resultStats) {
    const match = resultStats.match(/Aproximadamente (.+?) resultados/);
    if (match) {
      totalResults = match[1];
    }
  }

  if (!totalResults) {
    totalResults = $('.sh-dr__count').text().trim() || 'Não disponível';
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
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});