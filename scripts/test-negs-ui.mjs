import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL??'http://127.0.0.1:8082/',{waitUntil:'networkidle'});
 const state=()=>page.evaluate(async()=>{const s=(await import('/src/lib/film/store.ts')).useDarkroom.getState();return {params:s.params,prefs:s.prefs,undos:s.undoStack.length};});
 const done=async()=>{await page.waitForTimeout(500);await page.waitForFunction(()=>!document.querySelector('[aria-label="Открыть"]').disabled);};
 await page.getByRole('button',{name:'Плёнка',exact:true}).click();await page.getByRole('button',{name:'Пример: лес',exact:true}).click();await page.getByRole('img',{name:'Предпросмотр обработки',exact:true}).waitFor();await done();
 await page.getByRole('button',{name:'Найти',exact:true}).click();const find=page.locator('input.lab-find');await find.fill('cinestill 800');
 assert.equal(await page.locator('.lab-box').count(),1);await page.getByRole('button',{name:'CineStill 800T',exact:true}).click();await done();
 let next=await state();assert.equal(next.params.filmStock,'negs_cinestill_800t');assert.equal(next.params.experimental.grainRmsBlue,30);assert.equal(next.params.experimental.grainUniformityRed,.93);
 const undos=next.undos;await page.getByRole('button',{name:'В избранное: CineStill 800T',exact:true}).click();next=await state();assert.ok(next.prefs.favoriteStocks.includes('negs_cinestill_800t'));assert.equal(next.undos,undos);
 await find.fill('phoenix');await page.getByRole('button',{name:'Harman Phoenix 200',exact:true}).click();await done();await page.getByText('Приблизительная модель · часть данных восстановлена по примерам',{exact:true}).waitFor();
 await find.fill('infrared');await page.getByRole('button',{name:'Infrared Color',exact:true}).click();await done();await page.getByText('Творческая ИК-модель · не измеренный реальный материал',{exact:true}).waitFor();
 await find.fill('hp5');await page.getByRole('button',{name:'Ilford HP5 Plus · 9.5 мин ≈',exact:true}).click();await done();await page.getByText('Это время проявки оценено авторами профиля, а не измерено.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Эмульсия',exact:true}).click();const family=page.getByRole('combobox').filter({has:page.locator('option[value="negs_ilford_hp5_plus_6p5min"]')});await family.selectOption('negs_ilford_hp5_plus_6p5min');await done();assert.equal((await state()).params.filmStock,'negs_ilford_hp5_plus_6p5min');
 await page.getByRole('button',{name:'Подготовка',exact:true}).click();await page.getByRole('heading',{name:'Подготовка',exact:true}).waitFor();await done();
 const image=page.getByRole('img',{name:'Предпросмотр обработки',exact:true});const pixels=()=>image.evaluate(async i=>{await i.decode();const c=document.createElement('canvas');c.width=48;c.height=32;const x=c.getContext('2d');x.drawImage(i,0,0,48,32);return Array.from(x.getImageData(0,0,48,32).data);});
 const before=await pixels();const slider=page.getByRole('slider',{name:'Тени',exact:true});await slider.focus();for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');await done();assert.equal((await state()).params.prep.shadows,10);assert.notDeepEqual(await pixels(),before);
 await page.keyboard.press('Control+z');assert.equal((await state()).params.prep.shadows,9);
 const photoBefore=await state();await page.getByRole('button',{name:'Сбросить вкладку',exact:true}).click();next=await state();assert.equal(next.params.prep.shadows,0);assert.equal(next.params.filmStock,photoBefore.params.filmStock);assert.deepEqual(next.params.experimental,photoBefore.params.experimental);await page.keyboard.press('Control+z');assert.equal((await state()).params.prep.shadows,9);
 await page.locator('.lab-sliders').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'artifacts/negs-prep-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/negs-prep-phone.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.waitForTimeout(700);await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'Подготовка',exact:true}).waitFor();assert.equal((await state()).params.prep.shadows,9);assert.ok((await state()).prefs.favoriteStocks.includes('negs_cinestill_800t'));
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Плёнка',exact:true}).click();assert.equal(await page.locator('.lab-box').first().getAttribute('aria-label'),'CineStill 800T');
 assert.deepEqual(errors,[]);console.log('PASS Negs multiword film search, real stock defaults, favourites without Undo, approximation/creative/estimated labels, development families, Prep pixel effect, Undo/reset, persistence and phone layout');
}finally{await browser.close()}
