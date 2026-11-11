import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.TEST_URL??'http://127.0.0.1:8093/',{waitUntil:'networkidle'});
 const open=async()=>{await page.locator('.zalupa-app>input[type=file]').setInputFiles('public/samples/still-life.jpg');await page.getByRole('img',{name:'Предпросмотр обработки',exact:true}).waitFor();};
 const stage=async(name)=>{const b=page.getByRole('navigation',{name:'Этапы обработки'}).getByRole('button',{name,exact:true});if(await b.getAttribute('aria-pressed')!=='true')await b.click();};
 await open();await stage('Эффекты');await page.getByRole('button',{name:'Выбрать плёнку',exact:true}).click();await page.getByRole('tab',{name:'Каталог',exact:true}).waitFor();
 await page.locator('[data-stock-id="kodak_gold_200"]').click();
 await page.getByRole('button',{name:'Ещё',exact:true}).click();await page.getByRole('button',{name:'Настройки',exact:true}).click();
 const reset=page.getByRole('switch',{name:'Сброс на новый файл',exact:true});if(await reset.getAttribute('aria-checked')==='true')await reset.click();
 await stage('Эффекты');const model=page.getByRole('combobox',{name:'Модель зерна'});await model.selectOption('rms');
 const grain=page.getByRole('switch',{name:'Зерно',exact:true});if(await grain.getAttribute('aria-checked')==='false')await grain.click();
 await page.getByRole('button',{name:'Точное значение: RMS красного канала',exact:true}).click();await page.getByRole('textbox',{name:'Точное значение',exact:true}).fill('19.5');await page.getByRole('button',{name:'Применить',exact:true}).click();
 await page.waitForTimeout(650);await page.reload({waitUntil:'networkidle'});await open();await stage('Эффекты');
 await page.waitForFunction(()=>document.querySelector('select[aria-label="Модель зерна"]')?.value==='rms');
 assert.equal(await page.getByRole('slider',{name:'RMS красного канала',exact:true}).getAttribute('aria-valuenow'),'19.5');
 console.log('PASS direct catalogue jump from a same-tool effect page and persisted model/values after reload and image import');
}finally{await browser.close();}
