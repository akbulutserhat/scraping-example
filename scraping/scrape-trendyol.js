const puppeteer = require('puppeteer');
require('dotenv/config');

//const port = 3000
const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGO_URI);

const dbName = "test";
                      
 async function addDataToDb(laptopDocument) {
    try {
         
        const db = client.db(dbName);
         // Use the collection "people"
         const col = db.collection("laptop");

         // Insert a single document, wait for promise so we can read it back
         await col.insertOne(laptopDocument);

        } catch (err) {
         console.log(err.stack);
     }
}

function fetchItems() {
    return Array.from(document.querySelectorAll('div.p-card-chldrn-cntnr')).
            map((product) => product.querySelector('a').href)
}



async function scrapeInfiniteScrollItems(
    page,
    fetchItems,
    itemTargetCount,
    scrollDelay = 500,
  ) {
    let items = [];
    try {
      let previousHeight;
      while (items.length < itemTargetCount) {
        items = await page.evaluate(fetchItems);
        const descriptionHeight = await page.evaluate(() => document.querySelector('div.seo-cntnt-cntnr').scrollHeight);
        const footerHeight = await page.evaluate(() => document.querySelector('#footer').scrollHeight);
        const bodyHeight = await page.evaluate('document.body.scrollHeight');
        previousHeight = bodyHeight - (descriptionHeight + footerHeight);
        await page.evaluate(`window.scrollTo(0, document.body.scrollHeight - ${(descriptionHeight + footerHeight)})`);
        await page.waitForFunction(`(document.body.scrollHeight - ${(descriptionHeight + footerHeight)}) > ${previousHeight}`);
        //await page.waitFor(scrollDelay);
      }
    } catch(e) { }
    return items;
  }
async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

(async () => {
    await client.connect();
    console.log("Connected correctly to server");
    const browser = await puppeteer.launch({headless:true});
    const page = await browser.newPage();

    await page.goto('https://www.trendyol.com/laptop');
    
    await page.select('div.sort-fltr-cntnr > select','6');
    await page.waitFor(2000);

    const enlaces = await scrapeInfiniteScrollItems(page, fetchItems, 30);
    
    const laptops = [];
    for(let enlace of enlaces){
        await page.goto(enlace);
        //const buttonControl =await page.evaluate(()=>document.querySelectorAll('button.pr-rnr-mr-btn').length);
        //if(buttonControl > 0){
           await page.waitFor(500);
            let tmpLaptop = await page.evaluate(() => {
                const tmp = {};
                tmp.price = document.querySelector('div.pr-bx-w').innerText.split('\n')[document.querySelector('div.pr-bx-w').innerText.split('\n').length-1];
                tmp.favorited = document.querySelector('div.pr-dd-fv-dt > div.fv-dt').innerText;
                tmp.infos = Array.from(document.querySelectorAll('div.pr-in-dt-cn > ul > span > li')).map(
                    info => info.innerText
                );
                tmp.properties = Array.from(document.querySelectorAll('div.prop-item')).map(prop => ({
                    key:prop.querySelector('div.item-key').innerText,
                    value:prop.querySelector('div.item-value').innerText
                }));
                tmp.ratingNumber = document.querySelector('div.pr-rnr-sm-p-s > span').innerText;
                tmp.commentNumber = document.querySelector('div.pr-rnr-sm-p-s > span:nth-child(3)').innerText;
                return tmp;
            })
            await page.waitForSelector('button.pr-rnr-mr-btn');

            //await page.querySelector('form > button.pr-rnr-mr-btn')
            await page.evaluate(()=>document.querySelector('button.pr-rnr-mr-btn').click())
            await page.waitForNavigation();
            await autoScroll(page);
           
            let laptop = await page.evaluate(() => {
                const tmp = {};
                tmp.brand = document.querySelector('div.product > div.product-info > h1 > span.product-brand').innerText;
                tmp.name = document.querySelector('div.product > div.product-info > h1 > span.product-name').innerText;
                tmp.image = document.querySelector('div.product > div.pd-img > img').src;
                tmp.from = 'trendyol';
                tmp.comments = Array.from(document.querySelectorAll('div.rnr-com-w')).map((product) => ({
                    text:product.querySelector('div.rnr-com-cn > div.rnr-com-tx').innerText,
                    like:product.querySelector('div.rnr-com-bt > div.tooltip-wrp  div.rnr-com-like > span:nth-child(3)').innerText.replace(/[()]/g, ''),
                    rating:product.querySelectorAll('div.star-w > div.full[style="width:100%;max-width:100%"]').length
                }))
                return tmp;
            });
            laptop = {...laptop,...tmpLaptop};
            addDataToDb(laptop);
        //}
    }
    await client.close();
    await browser.close();
    
  
})();