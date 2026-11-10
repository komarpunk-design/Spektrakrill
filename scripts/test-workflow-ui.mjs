import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try {const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.TEST_URL??'http://127.0.0.1:8085/',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'Плёнка',exact:true}).click();assert.equal(await page.locator('.workflow-rail button').count(),6);
await page.getByRole('button',{name:'Фактура',exact:true}).click();await page.getByRole('heading',{name:'Зерно, свечение и резкость',exact:true}).waitFor();
await page.screenshot({path:'artifacts/workflow-desktop.png'});
for(const size of [{width:390,height:844},{width:360,height:740},{width:844,height:390}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`artifacts/workflow-${size.width}.png`});}
await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Исходник',exact:true}).click();await page.getByRole('heading',{name:'Подготовка исходника',exact:true}).waitFor();
assert.ok(await page.locator('.control-help:visible').count()>0);
await page.getByRole('button',{name:'Показывать пояснения к настройкам',exact:true}).click();assert.equal(await page.locator('.control-help:visible').count(),0);
await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('button',{name:'Рамки',exact:true}).click();await page.getByRole('heading',{name:'Рамки и плёночный край',exact:true}).waitFor();

await page.getByRole('button',{name:'Плёнка',exact:true}).click();await page.locator('.workflow-tools').getByRole('button',{name:'Плёнки',exact:true}).click();
assert.ok(await page.locator('.lab-box').count()<=13);await page.getByRole('button',{name:'Найти',exact:true}).click();await page.locator('input.lab-find').fill('kodak portra 400');await page.getByRole('button',{name:'Kodak Portra 400',exact:true}).click();
await page.getByRole('button',{name:'Пример: лес',exact:true}).click();const image=page.getByRole('img',{name:'Предпросмотр обработки',exact:true});await image.waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="Открыть"]').disabled);await page.getByRole('button',{name:'Kodak Portra 400',exact:true}).click();
await page.getByRole('button',{name:'Результат',exact:true}).click();await page.getByRole('combobox',{name:'Способ получения результата'}).waitFor();
const waitDone=async()=>{await page.waitForTimeout(500);await page.waitForFunction(()=>!document.querySelector('[aria-label="Открыть"]').disabled);};
const pixels=()=>image.evaluate(async img=>{await img.decode();const canvas=document.createElement('canvas');canvas.width=48;canvas.height=32;const c=canvas.getContext('2d');c.drawImage(img,0,0,48,32);return Array.from(c.getImageData(0,0,48,32).data);});
await waitDone();assert.equal((await page.evaluate(async()=>(await import('/src/lib/film/store.ts')).useDarkroom.getState().params.filmStock)),'kodak_portra_400');const before=await image.getAttribute('src'),beforePixels=await pixels();await page.getByRole('combobox',{name:'Способ получения результата'}).selectOption('lab-scan');await waitDone();assert.notEqual(await image.getAttribute('src'),before);assert.notDeepEqual(await pixels(),beforePixels);
const state=()=>page.evaluate(async()=>{const s=(await import('/src/lib/film/store.ts')).useDarkroom.getState();return {params:s.params,tool:s.tool};});assert.equal((await state()).params.output.mode,'lab-scan');
await page.getByRole('button',{name:'Показывать пояснения к настройкам',exact:true}).click();await page.locator('.lab-sliders').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'artifacts/outputs-desktop.png'});
await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/outputs-phone.png'});
await page.getByRole('button',{name:'Бумага',exact:true}).click();await page.getByRole('button',{name:'Включить печать на бумаге',exact:true}).click();assert.equal((await state()).params.output.mode,'paper');
await page.getByRole('button',{name:'Outputs',exact:true}).click();await page.getByRole('combobox',{name:'Способ получения результата'}).selectOption('auto-levels');await waitDone();
await page.getByRole('button',{name:'Сбросить вкладку',exact:true}).click();assert.equal((await state()).params.output.mode,'paper');await page.keyboard.press('Control+z');assert.equal((await state()).params.output.mode,'auto-levels');
await page.waitForTimeout(600);await page.reload({waitUntil:'networkidle'});assert.equal((await state()).params.output.mode,'auto-levels');

assert.deepEqual(errors,[]);console.log('PASS six stages, subnav, control help, original frames, compact catalogue, Lab Scan pixel effect, paper route, reset/Undo/persistence and responsive overflow');}finally{await browser.close();}
